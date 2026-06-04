/*
  ibjaScraper.js
  ──────────────
  Self-hosted, free, unlimited replacement for GoldAPI.io.

  Pulls today's per-gram gold rate from IBJA (India Bullion and
  Jewellers Association) — the official benchmark every Indian
  bank/jeweller/news outlet uses. Caches the parsed rate in SQLite
  so /api/live-price is just a DB read (microseconds, no network).

  Source:    https://ibjarates.com/
  Frequency: scraped every 30 min via node-cron
  Updates:   IBJA publishes AM (~12pm IST) and PM (~5pm IST) Mon-Fri.
             Weekends/holidays show "NA" — we keep serving the last
             known good value and flag it as stale.
  HTML shape we look for:
             ...purityCode="999">15812.50</td>...   (24K pure)
             ...purityCode="916">14484.00</td>...   (22K hallmark)
  Purity ratios validated against 750/585 to catch HTML changes
  before they silently poison the displayed rate.
*/

const cron    = require('node-cron');
const sqlite3 = require('sqlite3').verbose();
const db      = new sqlite3.Database(require('./dbPath'));

const IBJA_URL = 'https://ibjarates.com/';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ' +
  'SonaTodayBot/1.0 (+https://sonatoday.com)';

// ── One-time table create. Idempotent. Runs at module load so
// the table exists no matter which entry point calls us first
// (scrapeIbja directly, startIbjaScraper, or getCachedRate).
function ensureSchema() {
  db.run(`CREATE TABLE IF NOT EXISTS live_rates (
    metal        TEXT PRIMARY KEY,        -- 'gold' | 'silver'
    r24g         REAL,                    -- ₹/gram 999 (pure 24K)
    r22g         REAL,                    -- ₹/gram 916 (22K hallmark)
    r18g         REAL,                    -- ₹/gram 750 (18K)
    source       TEXT,                    -- 'ibja' | future sources
    fetched_at   TEXT,                    -- ISO timestamp
    stale        INTEGER DEFAULT 0        -- 1 = last fetch failed, value is old
  )`);
  // ── Historical archive — one row per metal per day.
  // Populated by upsertDailySnapshot() on every successful scrape,
  // so over time we build a growing timeline. Future: backfill from
  // an IBJA archive to extend the timeline backward (one-time job).
  db.run(`CREATE TABLE IF NOT EXISTS mcx_history (
    metal        TEXT NOT NULL,
    day          TEXT NOT NULL,            -- YYYY-MM-DD (IST)
    r24g         REAL,
    r22g         REAL,
    r18g         REAL,
    source       TEXT,
    PRIMARY KEY (metal, day)
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_mcx_history_day ON mcx_history(day)`);
}

// Write a daily snapshot. PRIMARY KEY (metal, day) means subsequent
// scrapes on the same day overwrite, so the row always holds the
// latest known value for that calendar day.
function upsertDailySnapshot(metal, r24g, r22g, r18g, source) {
  // IST = UTC+5:30. Compute YYYY-MM-DD in IST so "today" matches
  // an Indian buyer's calendar even when the server is in another TZ.
  const nowIST = new Date(Date.now() + 5.5 * 3600 * 1000);
  const day    = nowIST.toISOString().slice(0, 10);   // YYYY-MM-DD
  db.run(
    `INSERT OR REPLACE INTO mcx_history (metal, day, r24g, r22g, r18g, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [metal, day, r24g, r22g, r18g, source]
  );
}
ensureSchema();

// ── Per-gram sanity: IBJA may show per-10g (15-digit range) on some
// rows. Normalise to per-gram (5,000–25,000 INR is the realistic band
// for 2026 India gold; 50,000–250,000 would be per-10g — divide by 10).
function toPerGram(n) {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 5_000  && n <= 25_000)  return n;
  if (n >= 50_000 && n <= 250_000) return n / 10;
  return null;
}

// ── Pull "purity">number< pairs from the HTML. We trust the first
// match for each purity (IBJA's current-rate table appears first).
function extractRate(html, purityCode) {
  // Tolerant pattern: handles "999">15812, '999'>15812, 999 ">15812.50,
  // and attribute soup like data-purity="999" ...> 15812 <
  const re = new RegExp(
    `["'\\s]${purityCode}["'\\s][^<>]{0,160}>\\s*([\\d,]+(?:\\.\\d+)?)\\s*<`,
    'g'
  );
  let m;
  while ((m = re.exec(html)) !== null) {
    const v = toPerGram(+m[1].replace(/,/g, ''));
    if (v) return v;
  }
  return null;
}

// ── Silver extraction: IBJA embeds a JSON-encoded silverRate array
// in the page (used for their chart widget). The LAST entry is today's
// silver rate in INR per KG. We convert to per-gram (÷1000).
// Per-gram silver in India 2026 sits around ₹240–340 — anything outside
// that range we treat as a parse failure.
function extractSilverPerGram(html) {
  const m = html.match(/silverRate&quot;:\[([\d,]+)\]/);
  if (!m) return null;
  const arr = m[1].split(',').map(Number).filter(Number.isFinite);
  if (!arr.length) return null;
  const perKg    = arr[arr.length - 1];
  const perGram  = perKg / 1000;
  if (perGram < 100 || perGram > 500) return null;  // sanity band
  return Math.round(perGram * 100) / 100;
}

// ── Cross-check parsed rates: 916 should be ~91.6% of 999 (±2%).
// If the ratio is way off we picked up an unrelated number — better
// to fail loudly than ship a wrong rate.
function ratiosLookSane(r24, r22, r18) {
  if (!r24 || !r22) return false;
  const ratio22 = r22 / r24;
  if (ratio22 < 0.895 || ratio22 > 0.935) return false;  // 916/999 ≈ 0.9167
  if (r18) {
    const ratio18 = r18 / r24;
    if (ratio18 < 0.735 || ratio18 > 0.765) return false; // 750/999 ≈ 0.7508
  }
  return true;
}

// ── Fetch + parse + write. Returns the parsed row (or null on fail).
async function scrapeIbja() {
  const startedAt = Date.now();
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res   = await fetch(IBJA_URL, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*' },
      signal:  ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (html.length < 5_000) throw new Error('response too short');

    const r24g = extractRate(html, '999');  // pure 24K
    const r22g = extractRate(html, '916');  // 22K hallmark
    const r18g = extractRate(html, '750');  // 18K (optional)

    if (!r24g || !r22g) {
      // IBJA shows "NA" on Sat/Sun/holidays — keep cache, mark stale.
      console.log(`   ⚠ IBJA: no current rate (weekend/holiday?) — keeping cached value`);
      db.run(`UPDATE live_rates SET stale = 1 WHERE metal = 'gold'`);
      return null;
    }

    if (!ratiosLookSane(r24g, r22g, r18g)) {
      throw new Error(`purity ratios off: 24K=${r24g} 22K=${r22g} 18K=${r18g}`);
    }

    const fetched_at = new Date().toISOString();
    const round2 = (n) => n == null ? null : Math.round(n * 100) / 100;
    const g24    = round2(r24g);
    const g22    = round2(r22g);
    const g18    = round2(r18g);
    db.run(
      `INSERT OR REPLACE INTO live_rates
         (metal, r24g, r22g, r18g, source, fetched_at, stale)
       VALUES ('gold', ?, ?, ?, 'ibja', ?, 0)`,
      [g24, g22, g18, fetched_at]
    );
    upsertDailySnapshot('gold', g24, g22, g18, 'ibja');

    // ── Silver: same page, different parser (chart array).
    // Silver is sold pure (.999) so we store the same value in r22g/r24g
    // for shape-compatibility; UI only ever uses r24g for silver.
    const silverPg = extractSilverPerGram(html);
    if (silverPg) {
      db.run(
        `INSERT OR REPLACE INTO live_rates
           (metal, r24g, r22g, r18g, source, fetched_at, stale)
         VALUES ('silver', ?, ?, NULL, 'ibja', ?, 0)`,
        [silverPg, silverPg, fetched_at]
      );
      upsertDailySnapshot('silver', silverPg, silverPg, null, 'ibja');
    } else {
      db.run(`UPDATE live_rates SET stale = 1 WHERE metal = 'silver'`);
    }

    const ms = Date.now() - startedAt;
    console.log(
      `   ✓ IBJA: 22K ₹${Math.round(r22g)}/g · 24K ₹${Math.round(r24g)}/g` +
      (silverPg ? ` · Silver ₹${Math.round(silverPg)}/g` : ' · silver:miss') +
      `  (${ms}ms)`
    );
    return { r24g, r22g, r18g, silver: silverPg, fetched_at };

  } catch (err) {
    console.error(`   ✗ IBJA scrape failed: ${err.message} — keeping cached value`);
    db.run(`UPDATE live_rates SET stale = 1 WHERE metal = 'gold'`);
    return null;
  }
}

// ── Read the cached row. Always returns immediately (no network).
function getCachedRate(metal = 'gold') {
  return new Promise((resolve) => {
    db.get(
      `SELECT r24g, r22g, r18g, source, fetched_at, stale
         FROM live_rates WHERE metal = ?`,
      [metal],
      (err, row) => resolve(err || !row ? null : row)
    );
  });
}

function startIbjaScraper() {
  ensureSchema();
  console.log('💰 IBJA scraper scheduled — every 30 minutes');
  // Every 30 min, around the clock. IBJA updates twice a day; the
  // extra fetches are cheap and let us recover quickly if one fails.
  cron.schedule('*/30 * * * *', () => { scrapeIbja().catch(console.error); });
  // First fetch ~3s after boot so the server is fully up.
  setTimeout(() => { scrapeIbja().catch(console.error); }, 3_000);
}

module.exports = { startIbjaScraper, scrapeIbja, getCachedRate };
