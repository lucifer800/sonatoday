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
    db.run(
      `INSERT OR REPLACE INTO live_rates
         (metal, r24g, r22g, r18g, source, fetched_at, stale)
       VALUES ('gold', ?, ?, ?, 'ibja', ?, 0)`,
      [Math.round(r24g * 100) / 100, Math.round(r22g * 100) / 100,
       r18g ? Math.round(r18g * 100) / 100 : null, fetched_at]
    );

    const ms = Date.now() - startedAt;
    console.log(`   ✓ IBJA: 22K ₹${Math.round(r22g)}/g · 24K ₹${Math.round(r24g)}/g  (${ms}ms)`);
    return { r24g, r22g, r18g, fetched_at };

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
