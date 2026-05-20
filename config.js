/* =========================================================
   Single source of truth for the backend URL.
   - Localhost → talks to local Node server on :4000
   - Anything else → talks to the Railway-hosted backend
   Loaded by every HTML page before any other script.
   ========================================================= */

(function () {
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';

  // ⬇ Replace this with your Railway domain after deploying the backend.
  //   Example: 'https://sonatoday-production.up.railway.app'
  const PROD_API = 'https://YOUR-RAILWAY-URL.up.railway.app';

  window.API_BASE = isLocal ? 'http://127.0.0.1:4000' : PROD_API;
})();
