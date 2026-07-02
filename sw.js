/*
  sw.js — Service worker for SonaToday
  ────────────────────────────────────────────────────────────
  Strategy (after the great "stale cache" disasters):
  • Pre-cache ONLY hard, immutable assets (icons, manifest).
  • All HTML pages: NETWORK-FIRST (try live, only fall back to
    cache if completely offline). This prevents the SW from
    serving a stale old page after we deploy a new one.
  • /config.js: NEVER cached (controls the API base URL).
  • /jeweller-dashboard.html: explicitly bypassed AND any old
    cached copy is purged on activate. The page is retired and
    must always come from the network (which serves the new
    redirect to /app.html).
  • Bump VERSION every time we change behaviour — the activate
    handler deletes every cache that doesn't end in the current
    VERSION, so old caches die quickly.
*/

const VERSION     = 'v22';  // Phase 12: purchase orders + suppliers, auto-replenish stock
const SHELL_CACHE = `sonatoday-shell-${VERSION}`;
const API_CACHE   = `sonatoday-api-${VERSION}`;

// Only pre-cache things that genuinely never change in shape.
// HTML pages are intentionally NOT pre-cached — they're network-first now.
const PRECACHE_URLS = [
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
];

// HTML paths we must NEVER serve from cache, even on cold start.
const NO_CACHE_PATHS = new Set([
  '/config.js',
  '/jeweller-dashboard.html',   // retired page — always hit network for the redirect
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Delete every cache that isn't this version's.
    await Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)));
    // Belt-and-braces: even if for some reason a current-version cache
    // still holds the retired pages, delete those individual entries.
    for (const name of [SHELL_CACHE]) {
      const c = await caches.open(name);
      for (const path of NO_CACHE_PATHS) {
        await c.delete(path).catch(() => {});
        await c.delete(self.location.origin + path).catch(() => {});
      }
    }
    await self.clients.claim();
  })());
});

// Allow the page to ask the SW to step aside (used by retired pages
// that want a guaranteed fresh load).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // ── Hard bypass list: never cached, always network ──
  if (NO_CACHE_PATHS.has(url.pathname)) {
    event.respondWith(fetch(event.request));
    return;
  }

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

  // ── HTML pages: NETWORK-FIRST so new deploys are visible
  //    immediately. Only fall back to cache when offline. This is
  //    the single most important rule that prevents the "old page
  //    keeps showing" disease.
  const accept = event.request.headers.get('accept') || '';
  if (url.pathname.endsWith('.html') || url.pathname === '/' || accept.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((m) => m || caches.match('/index.html')))
    );
    return;
  }

  // ── Static assets (css/js/img/font): cache-first, network fallback ──
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
    )
  );
});
