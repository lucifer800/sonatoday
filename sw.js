/*
  sw.js — Service worker for Ahmedabad Gold Rates PWA

  Strategy:
  - Pre-cache the app shell (HTML, CSS, JS) on install.
  - Network-first for /api/* — always try the live backend (live prices,
    jeweller updates, alerts). Fall back to cached response only when offline.
  - Cache-first for everything else (HTML, CSS, JS, fonts, images) — fast loads.
*/

const VERSION     = 'v4';
const SHELL_CACHE = `goldrates-shell-${VERSION}`;
const API_CACHE   = `goldrates-api-${VERSION}`;

const SHELL_URLS = [
  '/',
  '/index.html',
  '/jeweller.html',
  '/jeweller-login.html',
  '/jeweller-dashboard.html',
  '/my-alerts.html',
  '/style.css',
  '/app.js',
  '/data.js',
  '/jeweller.js',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/screenshot-wide.png',
  '/screenshot-mobile.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // ── API: network-first, cache fallback ──────────────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(API_CACHE).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ── Static: cache-first, network fallback ───────────────────
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
    ).catch(() => caches.match('/index.html'))
  );
});
