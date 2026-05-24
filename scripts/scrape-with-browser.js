/*
  scrape-with-browser.js
  ──────────────────────
  Runs on GitHub Actions every 2 hours. Uses Playwright (real headless
  Chromium) so we can scrape JS-rendered jeweller sites that the
  plain-HTTP scraper on the Render server can't see.

  Sites covered here (the ones whose rates load via client-side JS):
    - Malabar Gold & Diamonds  (id 1)
    - Kalyan Jewellers         (id 4)
    - Joyalukkas               (id 5)
    - P.N. Gadgil & Sons       (id 11)
    - Tanishq                  (id 3)   ← may fail on Cloudflare, that's OK

  Skipped here (handled by the in-server plain-HTTP scraper which is faster):
    - CaratLane (id 6), GRT (id 7), PC Jeweller (id 10)

  Skipped entirely (no public rate page or stale data):
    - TBZ (id 2), Senco (id 8), Reliance (id 9), Bhima (id 12)

  After scraping, POSTs results to /api/admin/scraper-update on the
  Render server, authenticated by SCRAPER_SECRET.

  Env vars required:
    SITE_URL         e.g. https://sonatoday.com  (target backend)
    SCRAPER_SECRET   shared secret with backend
*/

const { chromium } = require('playwright');

const SITE_URL       = process.env.SITE_URL       || 'https://sonatoday.com';
const SCRAPER_SECRET = process.env.SCRAPER_SECRET;

if (!SCRAPER_SECRET) {
  console.error('✗ SCRAPER_SECRET env var required');
  process.exit(1);
}

// Per-site scrape config.
// Each entry: id, url, timeoutMs, scrape(page) → { r22g, r24g }
// 22K is 91.67% pure gold ⇒ 24K = 22K / 0.9167   (or 22K = 24K * 0.9167)
const PURITY_22K_OF_24K = 22 / 24;

const SITES = [
  // ─── MALABAR ──────────────────────────────────────────────
  {
    id:   1,
    name: 'Malabar',
    url:  'https://www.malabargoldanddiamonds.com/goldprice',
    scrape: async (page) => {
      // The "Live Gold Rate" banner renders the rate inside elements with
      // class names that include "rate" / "price" / "live-gold". Wait for
      // any element with text matching a rupee + 4-5 digit pattern.
      await page.waitForSelector('text=/₹\\s*1[0-9],?[0-9]{3}/', { timeout: 25_000 }).catch(() => {});
      // Pull every visible "₹14,XXX" candidate and pick the two that look
      // like the 22K and 24K per-gram rates.
      const text = await page.evaluate(() => document.body.innerText);
      return extractKaratPair(text);
    },
  },

  // ─── KALYAN ───────────────────────────────────────────────
  {
    id:   4,
    name: 'Kalyan',
    url:  'https://www.kalyanjewellers.net/kalyan_gold_rates/gold-rate/todays-gold-rate-in-ahmedabad',
    scrape: async (page) => {
      await page.waitForSelector('text=/22\\s*[Kk]/', { timeout: 25_000 }).catch(() => {});
      await page.waitForTimeout(2000);   // let JS finish hydrating
      const text = await page.evaluate(() => document.body.innerText);
      return extractKaratPair(text);
    },
  },

  // ─── JOYALUKKAS ───────────────────────────────────────────
  {
    id:   5,
    name: 'Joyalukkas',
    url:  'https://www.joyalukkas.in/goldrate',
    scrape: async (page) => {
      await page.waitForSelector('text=/22\\s*[Kk]/', { timeout: 25_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const text = await page.evaluate(() => document.body.innerText);
      return extractKaratPair(text);
    },
  },

  // ─── P.N. GADGIL & SONS ───────────────────────────────────
  {
    id:   11,
    name: 'PNG',
    url:  'https://pngadgilandsons.com/png-todays-gold-rates/',
    scrape: async (page) => {
      await page.waitForSelector('text=/22\\s*[Kk]/', { timeout: 25_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const text = await page.evaluate(() => document.body.innerText);
      return extractKaratPair(text);
    },
  },

  // ─── TANISHQ (likely to fail Cloudflare; that's OK) ───────
  {
    id:   3,
    name: 'Tanishq',
    url:  'https://www.tanishq.co.in/gold-rate.html',
    scrape: async (page) => {
      await page.waitForSelector('text=/22\\s*[Kk]/', { timeout: 25_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      const text = await page.evaluate(() => document.body.innerText);
      return extractKaratPair(text);
    },
  },
];

// ── Generic extractor: scan visible body text for a "22K ... ₹XX,XXX"
//    pattern (and same for 24K). Falls back to deriving via purity ratio
//    if only one karat is present.
function extractKaratPair(plainText) {
  const find = (kt) => {
    const re = new RegExp(`${kt}\\s*(?:K|Kt|Karat|Carat)\\b[\\s\\S]{0,160}?₹?\\s*([\\d,]{4,9})`, 'i');
    const m  = plainText.match(re);
    if (!m) return null;
    const n = parseFloat(m[1].replace(/,/g, ''));
    // Normalise: per-gram is ₹5,000–₹20,000; per-10g is ₹50,000–₹200,000.
    if (n >= 50_000 && n <= 200_000) return n / 10;
    if (n >= 5_000  && n <= 20_000)  return n;
    return null;
  };

  let r22g = find('22');
  let r24g = find('24');

  // Single-karat fallback — derive the other via purity ratio.
  if (r22g && !r24g) r24g = Math.round(r22g / PURITY_22K_OF_24K);
  if (r24g && !r22g) r22g = Math.round(r24g * PURITY_22K_OF_24K);

  return { r22g, r24g };
}

(async () => {
  console.log(`🚀 Scraping ${SITES.length} JS-rendered sites with Playwright`);
  console.log(`   Posting results to ${SITE_URL}/api/admin/scraper-update`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale:   'en-IN',
  });

  const updates = [];

  for (const site of SITES) {
    const page = await ctx.newPage();
    let result = { r22g: null, r24g: null };
    try {
      console.log(`\n→ ${site.name}: ${site.url}`);
      const resp = await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const status = resp ? resp.status() : 0;
      if (status >= 400) {
        console.log(`  ✗ HTTP ${status} — skipping`);
      } else {
        result = await site.scrape(page);
        if (result.r22g && result.r24g) {
          console.log(`  ✓ 22K ₹${Math.round(result.r22g)}/g, 24K ₹${Math.round(result.r24g)}/g`);
        } else {
          console.log(`  ✗ parse-miss (got: ${JSON.stringify(result)})`);
        }
      }
    } catch (err) {
      console.log(`  ✗ ${err.message.split('\n')[0]}`);
    } finally {
      await page.close();
    }

    updates.push({
      id:     site.id,
      r22g:   result.r22g,
      r24g:   result.r24g,
      source: `playwright:${site.name.toLowerCase()}`,
    });
  }

  await browser.close();

  console.log(`\n📡 POSTing ${updates.length} updates to backend…`);
  const res = await fetch(`${SITE_URL}/api/admin/scraper-update`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ secret: SCRAPER_SECRET, updates }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`✗ Backend rejected update: HTTP ${res.status}: ${body}`);
    process.exit(1);
  }
  const result = await res.json();
  console.log(`✓ Backend accepted: ${JSON.stringify(result)}`);
})().catch((err) => {
  console.error('Fatal scraper error:', err);
  process.exit(1);
});
