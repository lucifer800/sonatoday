/* =========================================================
   Single source of truth for the backend URL.
   - Localhost  → talks to local Node server on :4000
   - Production → same-origin (Render serves frontend + API from
     one service, so relative URLs work and there are no CORS issues).
   Loaded by every HTML page before any other script.
   ========================================================= */

(function () {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';

  // Production = same-origin absolute URL. We can't use '' here because
  // consumers do `window.API_BASE || 'http://127.0.0.1:4000'` and '' is
  // falsy, which would silently fall back to localhost on the live site.
  window.API_BASE = isLocal ? 'http://127.0.0.1:4000' : window.location.origin;
})();
