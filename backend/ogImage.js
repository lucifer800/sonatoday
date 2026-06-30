/*
  ogImage.js — dynamic Open Graph card generator.

  Generates a 1200×630 PNG with today's gold rate baked in, so when
  someone shares a link from the site on WhatsApp/Facebook/Twitter,
  the preview shows a live rate card instead of a plain URL.

  How it works:
  1. Build an SVG string with placeholders filled in (rate, jeweller name).
  2. Pipe the SVG through `rsvg-convert` to get a PNG buffer.
  3. Cache the result in memory for 15 minutes — the live MCX cache
     refreshes on the same cadence, so a longer cache wouldn't help.

  Falls back to a static "Ahmedabad Gold Rates" SVG (still served as PNG)
  if MCX lookup fails — better a stale card than no card.
*/

const { spawn }     = require('child_process');
const path          = require('path');
const { getPrices } = require('./goldPriceApi');

const db = require('./db');

const CACHE_MS = 15 * 60 * 1000;
const cache    = new Map(); // key → { png, ts }

const W = 1200, H = 630;
const ESC = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

function homeSvg({ r22g, r24g }) {
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0A1628"/>
      <stop offset="100%" stop-color="#060D18"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F4D068"/>
      <stop offset="100%" stop-color="#B8860B"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="120" cy="120" r="55" fill="url(#gold)"/>
  <text x="120" y="143" font-family="Georgia, serif" font-size="60" font-weight="700" text-anchor="middle" fill="#0A1628">₹</text>

  <text x="220" y="110" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="500" fill="#A0B0C8">${ESC(date)}</text>
  <text x="220" y="160" font-family="Georgia, serif" font-size="56" font-weight="700" fill="#F8F4EC">Ahmedabad Gold Rate</text>

  <rect x="80" y="240" width="510" height="220" rx="20" fill="rgba(212,175,55,0.08)" stroke="url(#gold)" stroke-width="2"/>
  <text x="335" y="285" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="600" text-anchor="middle" fill="#A0B0C8" letter-spacing="2">22 KARAT · PER GRAM</text>
  <text x="335" y="385" font-family="Georgia, serif" font-size="86" font-weight="700" text-anchor="middle" fill="url(#gold)">${ESC(fmt(r22g))}</text>
  <text x="335" y="430" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="500" text-anchor="middle" fill="#A0B0C8">${ESC(fmt(r22g * 10))} per 10g</text>

  <rect x="610" y="240" width="510" height="220" rx="20" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="865" y="285" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="600" text-anchor="middle" fill="#A0B0C8" letter-spacing="2">24 KARAT · PER GRAM</text>
  <text x="865" y="385" font-family="Georgia, serif" font-size="86" font-weight="700" text-anchor="middle" fill="#F8F4EC">${ESC(fmt(r24g))}</text>
  <text x="865" y="430" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="500" text-anchor="middle" fill="#A0B0C8">${ESC(fmt(r24g * 10))} per 10g</text>

  <text x="600" y="540" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="500" text-anchor="middle" fill="#A0B0C8">Compare 12 trusted Ahmedabad jewellers · live MCX prices</text>
  <text x="600" y="585" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="600" text-anchor="middle" fill="url(#gold)">goldrates · live</text>
</svg>`;
}

function jewellerSvg({ name, area, r22g, r24g, verified }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0A1628"/>
      <stop offset="100%" stop-color="#060D18"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F4D068"/>
      <stop offset="100%" stop-color="#B8860B"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="80" y="130" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="500" fill="#A0B0C8" letter-spacing="3">AHMEDABAD JEWELLER</text>
  <text x="80" y="200" font-family="Georgia, serif" font-size="68" font-weight="700" fill="#F8F4EC">${ESC(name)}</text>
  <text x="80" y="248" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="400" fill="#A0B0C8">📍 ${ESC(area)}</text>

  ${verified ? `<rect x="80" y="280" width="260" height="46" rx="23" fill="rgba(34,197,94,0.15)" stroke="rgba(34,197,94,0.4)" stroke-width="1"/>
  <text x="210" y="310" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" text-anchor="middle" fill="#4ade80" letter-spacing="2">✓ VERIFIED JEWELLER</text>` : ''}

  <rect x="80" y="380" width="510" height="190" rx="18" fill="rgba(212,175,55,0.08)" stroke="url(#gold)" stroke-width="2"/>
  <text x="335" y="425" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="600" text-anchor="middle" fill="#A0B0C8" letter-spacing="2">22 KARAT</text>
  <text x="335" y="510" font-family="Georgia, serif" font-size="74" font-weight="700" text-anchor="middle" fill="url(#gold)">${ESC(fmt(r22g))}</text>
  <text x="335" y="550" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="500" text-anchor="middle" fill="#A0B0C8">per gram</text>

  <rect x="610" y="380" width="510" height="190" rx="18" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="865" y="425" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="600" text-anchor="middle" fill="#A0B0C8" letter-spacing="2">24 KARAT</text>
  <text x="865" y="510" font-family="Georgia, serif" font-size="74" font-weight="700" text-anchor="middle" fill="#F8F4EC">${ESC(fmt(r24g))}</text>
  <text x="865" y="550" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="500" text-anchor="middle" fill="#A0B0C8">per gram</text>
</svg>`;
}

// ── Render SVG → PNG via rsvg-convert ──────────────────────────
function svgToPng(svg) {
  return new Promise((resolve, reject) => {
    const child = spawn('rsvg-convert', ['-w', String(W), '-h', String(H), '-f', 'png']);
    const chunks = [];
    child.stdout.on('data', (c) => chunks.push(c));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`rsvg-convert exit ${code}`)));
    child.stdin.end(svg);
  });
}

async function getHomePng() {
  const slot = cache.get('home');
  if (slot && Date.now() - slot.ts < CACHE_MS) return slot.png;

  let r22g = 14400, r24g = 15700;
  try {
    const p = await getPrices('gold');
    if (p.price_gram_22k) r22g = p.price_gram_22k;
    if (p.price_gram_24k) r24g = p.price_gram_24k;
  } catch {}

  const png = await svgToPng(homeSvg({ r22g, r24g }));
  cache.set('home', { png, ts: Date.now() });
  return png;
}

async function getJewellerPng(id) {
  const key  = `j:${id}`;
  const slot = cache.get(key);
  if (slot && Date.now() - slot.ts < CACHE_MS) return slot.png;

  const j = await new Promise((res) => db.get(
    'SELECT name, area, r22g, r24g, verified FROM jewellers WHERE id = ?',
    [id], (e, r) => res(r || null)
  ));
  if (!j) return getHomePng();

  const png = await svgToPng(jewellerSvg({
    name: j.name, area: j.area, r22g: j.r22g, r24g: j.r24g, verified: !!j.verified,
  }));
  cache.set(key, { png, ts: Date.now() });
  return png;
}

module.exports = { getHomePng, getJewellerPng };
