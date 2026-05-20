/*
  goldPriceApi.js
  ───────────────
  Wraps GoldAPI.io so the rest of the app can call one function.

  Free-tier keys are rate-limited (a few hundred calls/month), so we
  cache the response in memory for CACHE_TTL_MS and only hit the API
  when the cache is stale. If the API call fails we fall back to the
  last good value (or a sane default) so the app never crashes.
*/

const API_KEY  = process.env.GOLDAPI_KEY;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const cache = {
  gold:   { data: null, fetchedAt: 0 },
  silver: { data: null, fetchedAt: 0 },
};

// Fallback values used only if the API has never succeeded yet
const FALLBACK = {
  gold:   { price_gram_22k: 7200, price_gram_24k: 7850 },
  silver: { price_gram_24k: 95 },
};

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

  if (slot.data && age < CACHE_TTL_MS) {
    return { ...slot.data, cached: true, ageMs: age };
  }

  try {
    const data = await fetchFromApi(symbol);
    slot.data      = data;
    slot.fetchedAt = Date.now();
    console.log(`✓ GoldAPI ${symbol}: 24K ₹${data.price_gram_24k}/g${metal === 'gold' ? `, 22K ₹${data.price_gram_22k}/g` : ''}`);
    return { ...data, cached: false, ageMs: 0 };
  } catch (err) {
    console.error(`✗ GoldAPI ${symbol} failed:`, err.message);
    if (slot.data) return { ...slot.data, cached: true, stale: true, ageMs: age };
    return { ...FALLBACK[metal], fallback: true };
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
