/*
  goldPriceApi.js
  ───────────────
  Public surface for live gold/silver rates. Same exported functions
  as before — getPrices(), getGold22KPrice(), getGold24KPrice() —
  so server.js, alertChecker.js, ogImage.js all keep working
  unchanged. Only the SOURCE of the rate is different now.

  ─── ARCHITECTURE ─────────────────────────────────────────────
  We no longer call GoldAPI.io. Instead we read from the local
  live_rates SQLite table that ibjaScraper.js refreshes every
  30 min from https://ibjarates.com/ (India Bullion and Jewellers
  Association — the official benchmark for Indian gold rates).

  - Zero external API quota
  - Zero monthly cost
  - More authoritative for Indian buyers (IBJA *is* the rate every
    bank, jeweller, and newspaper quotes; GoldAPI was just resold
    international spot converted to INR)
  - Response is a DB read → microseconds, no network call on serve

  ─── STRICT NO-FAKE-DATA POLICY ───────────────────────────────
  Still in force. If the cache is empty (server booted but scraper
  hasn't run yet, or IBJA HTML changed and parser failed), we return
  nulls and let the UI honestly show "Rate unavailable". We never
  fabricate a number.

  ─── SILVER ───────────────────────────────────────────────────
  IBJA also publishes silver. Hooking it into ibjaScraper is a
  future task (~10 lines). For now silver requests return null;
  the homepage silver toggle gracefully shows "—".
*/

const { getCachedRate } = require('./ibjaScraper');

// Output shape matches the old GoldAPI response so /api/live-price
// JSON contract stays identical — frontend needs zero changes.
function shape(row, metal) {
  if (!row) {
    return {
      metal,
      currency:       'INR',
      price_gram_22k: null,
      price_gram_24k: null,
      price_gram_18k: null,
      cached:         false,
      stale:          false,
      fallback:       false,
      unavailable:    true,
      timestamp:      Date.now(),
    };
  }
  return {
    metal,
    currency:       'INR',
    price_gram_22k: row.r22g,
    price_gram_24k: row.r24g,
    price_gram_18k: row.r18g,
    cached:         true,                              // always cached (DB read)
    stale:          row.stale === 1,                   // scraper couldn't refresh
    fallback:       false,                             // never use hardcoded
    source:         row.source || 'ibja',
    timestamp:      new Date(row.fetched_at).getTime() || Date.now(),
    fetchedAt:      row.fetched_at,
  };
}

async function getPrices(metal /* 'gold' | 'silver' */) {
  // Silver path is reserved — ibjaScraper will populate the row
  // when we add silver parsing. For now it returns null cleanly.
  const row = await getCachedRate(metal === 'silver' ? 'silver' : 'gold');
  return shape(row, metal === 'silver' ? 'silver' : 'gold');
}

// Convenience helpers — unchanged signatures so alertChecker.js
// and any other caller keep working without edits.
async function getGold22KPrice() {
  const p = await getPrices('gold');
  return p.price_gram_22k == null ? null : Math.round(p.price_gram_22k);
}

async function getGold24KPrice() {
  const p = await getPrices('gold');
  return p.price_gram_24k == null ? null : Math.round(p.price_gram_24k);
}

module.exports = { getPrices, getGold22KPrice, getGold24KPrice };
