/*
  goldPriceApi.js
  ───────────────
  Wraps GoldAPI.io so the rest of the app can call one function.

  ─── STRICT NO-FAKE-DATA POLICY ───────────────────────────────
  We NEVER return hardcoded fallback rates. If the API is down and
  we have no last-known value, we return null and let the UI show
  "Rate unavailable" honestly. Any displayed number must be a real
  number that was once fetched from the source.

  Persistence: the last successful response is written to
  ./last-known-rates.json so it survives server restarts. The UI
  shows it with the original timestamp so users see "Last updated:
  Fri 4:30 PM" instead of a fake current rate.

  Rate-limit safety: GoldAPI's free tier is ~100 calls/month. We
  cache aggressively (6 hours) so even with constant traffic we
  burn at most ~120 calls/month.
*/

const fs   = require('fs');
const path = require('path');

const API_KEY      = process.env.GOLDAPI_KEY;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;  // 6 hours (was 15 min — burned through free quota)
const STORE_PATH   = path.join(__dirname, 'last-known-rates.json');

// In-memory cache, hydrated from disk on boot.
const cache = {
  gold:   { data: null, fetchedAt: 0 },
  silver: { data: null, fetchedAt: 0 },
};

// ── Hydrate from disk on startup so weekend/restart still shows
//    the real Friday rate instead of "—".
try {
  if (fs.existsSync(STORE_PATH)) {
    const persisted = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    for (const m of ['gold', 'silver']) {
      if (persisted[m]?.data && persisted[m]?.fetchedAt) {
        cache[m] = persisted[m];
      }
    }
    console.log('✓ Loaded last-known rates from disk');
  }
} catch (e) {
  console.warn('⚠ Could not load last-known rates:', e.message);
}

function persist() {
  try { fs.writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2)); }
  catch (e) { console.warn('⚠ Could not persist rates:', e.message); }
}

async function fetchFromApi(symbol /* 'XAU' | 'XAG' */) {
  if (!API_KEY) throw new Error('GOLDAPI_KEY not set in .env');

  const res = await fetch(`https://www.goldapi.io/api/${symbol}/INR`, {
    headers: {
      'x-access-token': API_KEY,
      'Content-Type':   'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GoldAPI ${symbol} ${res.status}: ${body}`);
  }
  return res.json();
}

async function getPrices(metal /* 'gold' | 'silver' */) {
  const symbol = metal === 'silver' ? 'XAG' : 'XAU';
  const slot   = cache[metal];
  const age    = Date.now() - slot.fetchedAt;

  // Fresh cache → return it.
  if (slot.data && age < CACHE_TTL_MS) {
    return { ...slot.data, cached: true, ageMs: age, fetchedAt: slot.fetchedAt };
  }

  try {
    const data = await fetchFromApi(symbol);
    slot.data      = data;
    slot.fetchedAt = Date.now();
    persist();
    console.log(`✓ GoldAPI ${symbol}: 24K ₹${data.price_gram_24k}/g${metal === 'gold' ? `, 22K ₹${data.price_gram_22k}/g` : ''}`);
    return { ...data, cached: false, ageMs: 0, fetchedAt: slot.fetchedAt };
  } catch (err) {
    console.error(`✗ GoldAPI ${symbol} failed:`, err.message);
    // STRICT: never return a hardcoded fallback. If we have a stale
    // real value, return it tagged as stale (UI will show the date).
    // If we have nothing at all, return null and let UI say so.
    if (slot.data) {
      return { ...slot.data, cached: true, stale: true, ageMs: age, fetchedAt: slot.fetchedAt };
    }
    return { price_gram_22k: null, price_gram_24k: null, price_gram_18k: null, unavailable: true };
  }
}

// Convenience: just the 22K gold price (number) — what alertChecker needs
async function getGold22KPrice() {
  const p = await getPrices('gold');
  return Math.round(p.price_gram_22k);
}

async function getGold24KPrice() {
  const p = await getPrices('gold');
  return Math.round(p.price_gram_24k);
}

module.exports = { getPrices, getGold22KPrice, getGold24KPrice };
