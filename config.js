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

  // Empty string = relative URL → hits the same host the page came from.
  window.API_BASE = isLocal ? 'http://127.0.0.1:4000' : '';
})();
