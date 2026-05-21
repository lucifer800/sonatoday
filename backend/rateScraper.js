/*
  rateScraper.js
  ──────────────
  Every 15 minutes, fetches each jeweller's public rate page,
  parses today's 22K + 24K per-gram price out of the HTML, and
  writes the result back into the jewellers table (and into
  price_history so the trend chart fills automatically).

  Design:
  - One parser per jeweller hostname for sites we know the structure of.
  - A generic fallback parser that hunts for "₹14,XXX" near a "22K" /
    "22 Karat" / "22 Carat" keyword in plain text.
  - Failures are logged and persisted (scrape_status / last_scraped_at)
    but never crash the cron — bad scrape = no update for that row.
  - Sequential fetches with a small delay so we don't hammer anyone.

  Sites that render rates via client-side JS will return empty HTML
  to a plain fetch — those will fail gracefully and need Puppeteer/
  Playwright later. The scaffold here makes adding that easy.
*/

const cron      = require('node-cron');
const sqlite3   = require('sqlite3').verbose();
const path      = require('path');
const { getPrices } = require('./goldPriceApi');

const db = new sqlite3.Database(require('./dbPath'));

// Polite, browser-like UA so basic anti-bot pages don't 403 us
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ' +
  'AhmedabadGoldRatesBot/1.0 (+https://goldrates.local)';

// ── Add scrape-tracking columns if they don't exist yet ────────
function ensureSchema() {
  db.serialize(() => {
    db.run(`ALTER TABLE jewellers ADD COLUMN last_scraped_at TEXT`, () => {});
    db.run(`ALTER TABLE jewellers ADD COLUMN scrape_status   TEXT`, () => {});
  });
}

// ── Normalise: per-gram gold is roughly ₹5,000–₹20,000 in 2026.
//    If we hit a 10g price (₹50,000–₹200,000), divide by 10.
function sanePerGram(n) {
  if (!Number.isFinite(n)) return null;
  if (n >= 50_000 && n <= 200_000) return n / 10;
  if (n >= 5_000  && n <= 20_000)  return n;
  return null;
}

// ── Generic parser — tries 3 patterns, in priority order ───────
function parseGeneric(html) {
  const findForKarat = (kt) => {
    // 1) JSON embedded in HTML:  "rate_22kt": 14528  or  "price22":"14528"
    const jsonRe = new RegExp(`"(?:rate_?|price_?|gold_?)?${kt}\\s*(?:k|kt|karat|carat)?"\\s*:\\s*"?(\\d[\\d,]*)`, 'i');
    let m = html.match(jsonRe);
    if (m) { const v = sanePerGram(+m[1].replace(/,/g, '')); if (v) return v; }

    // Strip HTML so the next two patterns work on plain text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x?\d+;/g, ' ')
      .replace(/\s+/g, ' ');

    // 2) Keyword-then-number:  "22 Karat … ₹14,400"
    const fwdRe = new RegExp(`${kt}\\s*(?:K|Karat|Carat|kt)\\b[^₹\\d]{0,80}(?:Rs\\.?|₹|INR)?\\s?([\\d,]{4,9})`, 'i');
    m = text.match(fwdRe);
    if (m) { const v = sanePerGram(+m[1].replace(/,/g, '')); if (v) return v; }

    // 3) Number-then-keyword:  "₹14,528 /Gram (22ct)"  (CaratLane style)
    const bwdRe = new RegExp(`(?:Rs\\.?|₹|INR)\\s?([\\d,]{4,9})[^\\d]{0,40}${kt}\\s*(?:K|Karat|Carat|ct|kt)`, 'i');
    m = text.match(bwdRe);
    if (m) { const v = sanePerGram(+m[1].replace(/,/g, '')); if (v) return v; }

    return null;
  };

  return { r22g: findForKarat('22'), r24g: findForKarat('24') };
}

// ── Per-site overrides ─────────────────────────────────────────
// Each parser returns { r22g, r24g } or { r22g: null, r24g: null }.
// 22K is 91.67% pure gold, so 24K = 22K / 0.9167  (and 22K = 24K * 0.9167).
const PURITY_22K_OF_24K = 22 / 24;  // 0.9167

const SITE_PARSERS = {
  // ── CaratLane: server-side JSON in __NEXT_DATA__-like blob.
  // Pattern:  "rate_22kt":14528   (only 22K is exposed; derive 24K)
  'caratlane.com': (html) => {
    const m = html.match(/"rate_?22kt?"\s*:\s*(\d+(?:\.\d+)?)/i);
    if (!m) return { r22g: null, r24g: null };
    const r22g = sanePerGram(+m[1]);
    return r22g
      ? { r22g, r24g: r22g / PURITY_22K_OF_24K }
      : { r22g: null, r24g: null };
  },

  // ── GRT Jewellers: JSON list with both karats explicit.
  // Pattern:  "22 KT","amount":14660 ... "24 KT","amount":16004
  'grtjewels.com': (html) => {
    const find = (kt) => {
      const re = new RegExp(`"${kt}\\s*KT"[^}]{0,80}"amount"\\s*:\\s*(\\d+(?:\\.\\d+)?)`, 'i');
      const m  = html.match(re);
      return m ? sanePerGram(+m[1]) : null;
    };
    return { r22g: find('22'), r24g: find('24') };
  },

  // ── PC Jeweller: HTML spans with rate IDs (24K sell rate only).
  // Pattern:  <span id="spnBeforLoginSellRate">15417.08</span>
  // (derive 22K = 24K × 0.9167)
  'dg.pcjeweller.com': (html) => {
    const m = html.match(/id="spnBeforLoginSellRate"\s*>\s*([\d.]+)\s*</i);
    if (!m) return { r22g: null, r24g: null };
    const r24g = sanePerGram(+m[1]);
    return r24g
      ? { r22g: r24g * PURITY_22K_OF_24K, r24g }
      : { r22g: null, r24g: null };
  },
};

function parseFor(url, html) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const override = SITE_PARSERS[host];
    if (override) return override(html);
    return parseGeneric(html);
  } catch {
    return { r22g: null, r24g: null };
  }
}

// ── Fetch one jeweller's rate page and update the DB ───────────
async function scrapeOne(jeweller) {
  if (!jeweller.rate_url) return { id: jeweller.id, status: 'skip:no-url' };

  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 15_000);
    const res  = await fetch(jeweller.rate_url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*' },
      signal:  ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(t);

    if (!res.ok) return finish(jeweller, `http-${res.status}`);
    const html = await res.text();

    // Some SPA shells are <200 chars of HTML around a #root div — clear signal
    // that the rate is rendered client-side and we got nothing useful.
    if (html.length < 600 || !/22|karat|carat|gold|gram/i.test(html)) {
      return finish(jeweller, 'spa-empty');
    }

    const { r22g, r24g } = parseFor(jeweller.rate_url, html);
    if (!r22g || !r24g)  return finish(jeweller, 'parse-miss');

    // ── Sanity guard — reject anything >10% away from live MCX ──
    // Catches false-positive numbers (making-charges, weight-grams,
    // CSS class IDs) that survived the regex but aren't real rates.
    try {
      const mcx = await getPrices('gold');
      const mcx22 = mcx.price_gram_22k;
      const mcx24 = mcx.price_gram_24k;
      const off22 = Math.abs(r22g - mcx22) / mcx22;
      const off24 = Math.abs(r24g - mcx24) / mcx24;
      if (off22 > 0.10 || off24 > 0.10) {
        console.log(`     ⚠ rejected ${jeweller.name}: 22K ₹${Math.round(r22g)} vs MCX ₹${Math.round(mcx22)} (${(off22*100).toFixed(1)}% off)`);
        return finish(jeweller, `reject-sanity:${Math.round(r22g)}`);
      }
    } catch (_) { /* if MCX lookup fails, skip the guard */ }

    // ── Update jeweller + log to price_history ────────────────
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE jewellers
            SET r22g = ?, r24g = ?, updated = ?, last_scraped_at = ?, scrape_status = 'ok'
          WHERE id = ?`,
        [Math.round(r22g), Math.round(r24g), now, new Date().toISOString(), jeweller.id],
        (err) => err ? reject(err) : resolve()
      );
    });
    db.run(`INSERT INTO price_history (jeweller_id, r22g, r24g) VALUES (?, ?, ?)`,
      [jeweller.id, Math.round(r22g), Math.round(r24g)]);

    return { id: jeweller.id, status: 'ok', r22g: Math.round(r22g), r24g: Math.round(r24g) };
  } catch (err) {
    return finish(jeweller, `error:${err.name || err.message}`);
  }
}

function finish(j, status) {
  db.run(
    `UPDATE jewellers SET last_scraped_at = ?, scrape_status = ? WHERE id = ?`,
    [new Date().toISOString(), status, j.id]
  );
  return { id: j.id, status };
}

// ── Loop over every jeweller with a rate_url ───────────────────
async function scrapeAll() {
  console.log(`\n🔍 [${new Date().toLocaleTimeString('en-IN')}] Rate scraper running…`);
  const jewellers = await new Promise((resolve) => {
    db.all(`SELECT id, name, r22g, r24g FROM jewellers ORDER BY id`, (err, rows) => resolve(err ? [] : rows));
  });
  // rate_url isn't stored in the DB (it lives in data.js for now), so we
  // pass an in-memory map here. Keep this aligned with data.js entries.
  const RATE_URLS = require('./rateUrls');
  const enriched  = jewellers.map(j => ({ ...j, rate_url: RATE_URLS[j.id] }));

  let ok = 0, fail = 0;
  for (const j of enriched) {
    const r = await scrapeOne(j);
    console.log(`   ${r.status === 'ok' ? '✓' : '✗'} ${j.name.padEnd(28)} → ${r.status}${r.r22g ? `  22K ₹${r.r22g}/g` : ''}`);
    r.status === 'ok' ? ok++ : fail++;
    await new Promise((s) => setTimeout(s, 800)); // be polite
  }
  console.log(`   summary: ${ok} ok, ${fail} fail`);
}

function startRateScraper() {
  ensureSchema();
  console.log('🔍 Rate scraper scheduled — every 15 minutes');
  cron.schedule('*/15 * * * *', () => { scrapeAll().catch(console.error); });
  // First pass after a short delay so the server finishes booting
  setTimeout(() => { scrapeAll().catch(console.error); }, 5_000);
}

module.exports = { startRateScraper, scrapeAll, scrapeOne };
