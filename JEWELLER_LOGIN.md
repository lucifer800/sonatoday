# Jeweller Login & Dashboard

A self-service portal where jewellers sign in to manage their own rates,
instead of you updating them manually via the API.

## Files

| File | Role |
|---|---|
| `jeweller-login.html` | Email + password form. Stores JWT in `localStorage`. |
| `jeweller-dashboard.html` | Protected page. Shows current rates + live MCX comparison + update form. |
| `backend/seedJewellers.js` | One-shot script that seeds the 15 demo jewellers into SQLite with bcrypt-hashed passwords. |
| `backend/server.js` | Hosts `requireAuth` middleware, `GET /api/jewellers/me`, protected `POST /api/jewellers/:id/rates`. |

## How the flow works

1. **User clicks "Jeweller Login"** on the homepage header (`index.html`) → opens `jeweller-login.html`.
2. **Login form** POSTs `{ email, password }` to `POST /api/auth/login`.
3. Backend verifies password with `bcrypt.compareSync`, signs a **JWT** containing `{ id, email }`, returns it.
4. Frontend stores the token in `localStorage.jwl_token` and redirects to `jeweller-dashboard.html`.
5. **Dashboard** sends every request with `Authorization: Bearer <token>`.
6. **Update rates** form POSTs to `POST /api/jewellers/:id/rates`. The `requireAuth` middleware verifies the JWT, then checks that `id` in the URL matches `req.jeweller.id` — so a jeweller can only update their **own** rates (returns `403` otherwise).
7. Every save also writes a row to `price_history` (powers the future trend chart).

## API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Returns `{ token, user }`. |
| `GET`  | `/api/jewellers/me` | JWT | Returns the logged-in jeweller's record (no password). |
| `POST` | `/api/jewellers/:id/rates` | JWT (own id only) | Updates `r22g`, `r24g`, `making`. Logs history. |
| `GET`  | `/api/jewellers/:id/history` | — | Last 30 price history rows for the trend chart. |
| `GET`  | `/api/live-price` | — | Live MCX 22K + 24K from GoldAPI.io (cached 15 min). Used on dashboard for comparison. |

## Auth middleware (`requireAuth`)

```js
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.jeweller = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

## Demo credentials

After running `node backend/seedJewellers.js` once, any of the 15 seeded jewellers can log in:

- **Email:** `tanishq@ahm.com` (or `malabar@ahm.com`, `arvindbhai@ahm.com`, …)
- **Password:** `pass123`

Passwords are bcrypt-hashed in the DB — the plain `pass123` exists only in the seed script for demo purposes.

## Dashboard features

- **Current rates panel** — 22K, 24K, making %, last updated.
- **Live MCX comparison** — pulls `/api/live-price` and shows whether the jeweller's 22K is **above** or **below** the MCX spot price.
- **Update form** — three inputs (22K, 24K, making %). On save:
  - Backend verifies JWT.
  - Writes the new rates.
  - Inserts a row into `price_history`.
  - Returns the updated record so the panel refreshes without a reload.
- **Public profile link** — opens `jeweller.html?id=N` (what customers see).
- **Logout button** — clears `localStorage` and redirects to login.

## Security notes

- Passwords stored as `bcrypt` hashes (cost factor 10).
- JWT signed with `process.env.JWT_SECRET` (fallback `'secret_key'` — **set this in `.env` for production**).
- `POST /api/jewellers/:id/rates` enforces `id === req.jeweller.id` so jewellers can't update each other's rates.
- Tokens stored in `localStorage` (fine for dev; for production consider httpOnly cookies to mitigate XSS).

## Local URLs

- Login: <http://localhost:4000/jeweller-login.html>
- Dashboard: <http://localhost:4000/jeweller-dashboard.html>
