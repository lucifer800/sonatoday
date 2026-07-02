const express    = require('express');
const cors       = require('cors');
const multer     = require('multer');
const path       = require('path');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto     = require('crypto');
require('dotenv').config();

// Short, URL-safe HMAC of a sale id — used to gate the public
// /invoice-view.html?id=X&sig=Y page so anyone with the link can
// see the invoice but nobody can enumerate sales by guessing ids.
function signSaleId(id) {
  const secret = process.env.JWT_SECRET || 'secret_key';
  return crypto.createHmac('sha256', secret)
               .update('invoice:' + id)
               .digest('hex')
               .slice(0, 16);
}

// ── Alert system ──────────────────────────────────────────────
const { startAlertChecker }             = require('./alertChecker');
const { sendPriceAlert, sendConfirmationEmail } = require('./mailer');
const { getPrices }                     = require('./goldPriceApi');
const { startRateScraper, scrapeAll }   = require('./rateScraper');
const { startIbjaScraper }              = require('./ibjaScraper');
const { getHomePng, getJewellerPng }    = require('./ogImage');
const fs                                = require('fs');

const app = express();
const PORT = process.env.PORT || 4000;

// ============ MIDDLEWARE ============
// Development CORS — allow all origins so Live Server (127.0.0.1:5500),
// file://, and localhost all work without browser CORS errors.
app.use(cors({
  origin: true,   // reflect the request origin (works for every localhost variant)
  credentials: true
}));
app.use(express.json());
app.use(express.static('uploads'));

// ── Open Graph: dynamic share-preview images ──────────────────
// /api/og-image.png         → homepage card with today's live MCX rate
// /api/og-image/:id.png     → per-jeweller card with their saved rate
app.get('/api/og-image.png', async (req, res) => {
  try {
    const png = await getHomePng();
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=900'); // 15 min
    res.send(png);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/og-image/:id.png', async (req, res) => {
  try {
    const png = await getJewellerPng(parseInt(req.params.id, 10));
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=900');
    res.send(png);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Open Graph: rewrite jeweller.html meta tags per ?id=N ─────
// WhatsApp/FB crawlers don't run JS, so we have to inject the
// per-jeweller og:title / og:description / og:image at request
// time — by reading the static file, swapping placeholders, and
// serving the modified HTML. Static handler below never sees it.
app.get('/jeweller.html', (req, res, next) => {
  const id = parseInt(req.query.id, 10);
  if (!Number.isFinite(id)) return next();
  fs.readFile(path.join(__dirname, '..', 'jeweller.html'), 'utf8', (err, html) => {
    if (err) return next();
    db.get(
      'SELECT name, area, r22g, r24g FROM jewellers WHERE id = ?',
      [id],
      (e, j) => {
        if (e || !j) return next();
        const origin = `${req.protocol}://${req.get('host')}`;
        const title  = `${j.name} — Ahmedabad gold rate today`;
        const desc   = `Today's 22K rate: ₹${Math.round(j.r22g).toLocaleString('en-IN')}/g at ${j.name}, ${j.area}. Compare with 11 other verified Ahmedabad jewellers.`;
        const image  = `${origin}/api/og-image/${id}.png`;
        const url    = `${origin}/jeweller.html?id=${id}`;

        // Strip any existing og:* / twitter:* / title and inject ours
        let out = html
          .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
          .replace(/\s*<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*|description)"[^>]*>/g, '');

        const inject = `
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Ahmedabad Gold Rates">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${desc}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="${image}">
    <meta name="description" content="${desc}">`;
        out = out.replace('</head>', `${inject}\n  </head>`);

        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', 'no-store');
        res.send(out);
      }
    );
  });
});

// ── PUBLIC MODE: "Coming soon" placeholder ─────────────────────
// When MAINTENANCE_MODE=true (set on Render), every public request
// returns coming-soon.html. API routes still work for local dev
// + alert testing, but visitors see the placeholder until we have
// real per-jeweller scraping wired up. Flip the env var to false
// to restore the full site without redeploying any code.
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';

if (MAINTENANCE_MODE) {
  console.log('🚧 MAINTENANCE_MODE=on — serving coming-soon.html for all GET requests');
  app.get(['/', '/index.html'], (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, '..', 'coming-soon.html'));
  });
  // Block other HTML pages too (login, dashboard, jeweller detail).
  // /api/* routes below still work so local cron + alert tests keep functioning.
  app.get(/.*\.html$/, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, '..', 'coming-soon.html'));
  });
  // Allow CSS, JS, images, manifest, etc. so the placeholder renders.
  app.use(express.static(path.join(__dirname, '..'), {
    setHeaders: (res) => res.set('Cache-Control', 'no-store'),
  }));
} else {
  // ── Normal mode: serve the full frontend ────────────────────
  app.use(express.static(path.join(__dirname, '..'), {
    setHeaders: (res) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.set('Pragma',        'no-cache');
      res.set('Expires',       '0');
    },
  }));
}

// ============ DATABASE SETUP ============
// Shared libSQL handle (Turso in prod, local file in dev). Same
// callback API as node-sqlite3, so all queries below are unchanged.
const db = require('./db');

// Initialize tables
const initDb = () => {
  db.serialize(() => {
    // Jewellers table
    db.run(`CREATE TABLE IF NOT EXISTS jewellers (
      id INTEGER PRIMARY KEY,
      name TEXT UNIQUE,
      symbol TEXT,
      email TEXT UNIQUE,
      password TEXT,
      phone TEXT,
      area TEXT,
      verified INTEGER DEFAULT 0,
      certificate_url TEXT,
      business_reg TEXT,
      r22g REAL,
      r24g REAL,
      making INTEGER,
      updated TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // Profile-credibility columns. Added via ALTER so the migration
    // is safe on a DB that already has the table without these fields.
    // SQLite ignores ALTER TABLE ADD COLUMN errors on duplicate add.
    db.run(`ALTER TABLE jewellers ADD COLUMN photo_url TEXT`,    () => {});
    db.run(`ALTER TABLE jewellers ADD COLUMN gst_number TEXT`,   () => {});
    db.run(`ALTER TABLE jewellers ADD COLUMN bis_license TEXT`,  () => {});
    db.run(`ALTER TABLE jewellers ADD COLUMN address_line TEXT`, () => {});
    db.run(`ALTER TABLE jewellers ADD COLUMN whatsapp TEXT`,     () => {});
    // Phase 9 — UPI ID for payment QR codes on invoices.
    db.run(`ALTER TABLE jewellers ADD COLUMN upi_id TEXT`,       () => {});
    // Phase 9 — payment tracking on sales. amount_paid is the sum
    // recorded so far; payment_status is derived on write ('unpaid'
    // / 'partial' / 'paid') so we can filter cheaply.
    db.run(`ALTER TABLE sales ADD COLUMN amount_paid REAL DEFAULT 0`,   () => {});
    db.run(`ALTER TABLE sales ADD COLUMN payment_status TEXT DEFAULT 'unpaid'`, () => {});

    // MCX history archive — one row per metal per calendar day (IST).
    // Lives here (not in ibjaScraper.js) so it's guaranteed to exist on
    // the *primary* DB connection before any scraper writes to it. The
    // scraper opens its own connection but sees the same SQLite file.
    db.run(`CREATE TABLE IF NOT EXISTS mcx_history (
      metal        TEXT NOT NULL,
      day          TEXT NOT NULL,
      r24g         REAL,
      r22g         REAL,
      r18g         REAL,
      source       TEXT,
      PRIMARY KEY (metal, day)
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_mcx_history_day ON mcx_history(day)`);

    // Also pre-create live_rates here so the IBJA scraper's first write
    // never races with its own ensureSchema(). Same reasoning.
    db.run(`CREATE TABLE IF NOT EXISTS live_rates (
      metal        TEXT PRIMARY KEY,
      r24g         REAL,
      r22g         REAL,
      r18g         REAL,
      source       TEXT,
      fetched_at   TEXT,
      stale        INTEGER DEFAULT 0
    )`);

    // ── Jeweller-app: inventory / stock (Phase 1) ──
    // One row per stock item, scoped to a jeweller. Each jeweller sees
    // only their own items (enforced in the routes via req.jeweller.id).
    db.run(`CREATE TABLE IF NOT EXISTS inventory_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      jeweller_id INTEGER NOT NULL,
      name        TEXT NOT NULL,
      category    TEXT,                       -- ring / chain / coin / bangle / other
      photo_url   TEXT,
      purity      TEXT,                       -- '22' | '24' | '18'
      weight_g    REAL,
      cost_price  REAL,                       -- what the jeweller paid (optional)
      in_stock    INTEGER DEFAULT 1,
      hsn_code    TEXT DEFAULT '7113',        -- GST HSN for gold jewellery
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(jeweller_id) REFERENCES jewellers(id)
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_jeweller ON inventory_items(jeweller_id)`);

    // ── Jeweller-app: customers / CRM (Phase 2) ──
    db.run(`CREATE TABLE IF NOT EXISTS customers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      jeweller_id INTEGER NOT NULL,
      name        TEXT NOT NULL,
      phone       TEXT,
      whatsapp    TEXT,
      email       TEXT,
      birthday    TEXT,                       -- YYYY-MM-DD
      anniversary TEXT,                       -- YYYY-MM-DD
      address     TEXT,
      gstin       TEXT,
      notes       TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(jeweller_id) REFERENCES jewellers(id)
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_customers_jeweller ON customers(jeweller_id)`);

    // ── Jeweller-app: sales / invoices (Phase 3) ──
    // Each row is a complete, self-contained invoice snapshot: we copy
    // customer name/phone and item description into the row so a past
    // invoice never changes even if the customer or item is later edited
    // or deleted. All money fields are stored computed (server-side) so
    // the invoice total can never be tampered with from the client.
    db.run(`CREATE TABLE IF NOT EXISTS sales (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      jeweller_id    INTEGER NOT NULL,
      invoice_number TEXT,
      customer_id    INTEGER,
      customer_name  TEXT,
      customer_phone TEXT,
      customer_gstin TEXT,
      item_id        INTEGER,
      description    TEXT,
      purity         TEXT,
      weight_g       REAL,
      rate_per_g     REAL,
      gold_value     REAL,
      making_pct     REAL,
      making_amount  REAL,
      gst_pct        REAL,
      gst_amount     REAL,
      total          REAL,
      sold_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(jeweller_id) REFERENCES jewellers(id)
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sales_jeweller ON sales(jeweller_id)`);

    // Reviews table with photo support
    db.run(`CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY,
      jeweller_id INTEGER,
      reviewer_name TEXT,
      reviewer_email TEXT,
      stars INTEGER,
      text TEXT,
      photo_url TEXT,
      verified_purchase INTEGER DEFAULT 0,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(jeweller_id) REFERENCES jewellers(id)
    )`);

    // Price history for tracking
    db.run(`CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY,
      jeweller_id INTEGER,
      r22g REAL,
      r24g REAL,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(jeweller_id) REFERENCES jewellers(id)
    )`);

    // Email alerts/subscriptions
    db.run(`CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY,
      email TEXT,
      jeweller_id INTEGER,
      alert_type TEXT,
      threshold_price INTEGER,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(jeweller_id) REFERENCES jewellers(id)
    )`);

    console.log('✓ Database tables initialized');
  });
};

initDb();

// ============ EMAIL CONFIGURATION ============
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
});

// ============ MULTER SETUP (for photo uploads) ============
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// ============ ROUTES ============

// 0. SCRAPER UPDATE API
// ─────────────────────────────────────────────────────────────
// POST /api/admin/scraper-update
// Called by the GitHub Actions Playwright scraper (every 2 hrs)
// to push real per-jeweller rates scraped from JS-rendered sites.
// Authenticated by SCRAPER_SECRET (same value set in GitHub repo
// secrets and Render env vars).
//
// Body:
// {
//   "secret": "<SCRAPER_SECRET>",
//   "updates": [
//     { "id": 1,  "r22g": 13950, "r24g": 15230, "source": "playwright:malabar" },
//     { "id": 4,  "r22g": 13960, "r24g": 15240, "source": "playwright:kalyan" },
//     ...
//   ]
// }
//
// Behaviour:
// - Validates secret. 401 on mismatch.
// - For each update with non-null rates, updates jewellers row
//   (r22g, r24g, updated, last_scraped_at, scrape_status='ok-playwright')
//   and logs to price_history.
// - For updates with null rates, marks scrape_status as 'playwright-miss'
//   but DOES NOT overwrite existing real rates — so a transient miss
//   doesn't blank a previously good rate.
// ─────────────────────────────────────────────────────────────
app.post('/api/admin/scraper-update', (req, res) => {
  const { secret, updates } = req.body || {};
  const expected = process.env.SCRAPER_SECRET;

  if (!expected) {
    return res.status(503).json({ error: 'SCRAPER_SECRET not configured on server' });
  }
  if (secret !== expected) {
    return res.status(401).json({ error: 'Invalid secret' });
  }
  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'updates must be an array' });
  }

  const now    = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const nowISO = new Date().toISOString();
  const results = { ok: 0, miss: 0, skipped: 0 };

  // Sanity bounds: per-gram gold should be ₹5,000–₹20,000.
  const sane = (n) => Number.isFinite(n) && n >= 5_000 && n <= 20_000;

  for (const u of updates) {
    if (!u || typeof u.id !== 'number') { results.skipped++; continue; }

    const has22 = sane(u.r22g);
    const has24 = sane(u.r24g);

    if (has22 && has24) {
      db.run(
        `UPDATE jewellers
            SET r22g = ?, r24g = ?, updated = ?, last_scraped_at = ?, scrape_status = ?
          WHERE id = ?`,
        [Math.round(u.r22g), Math.round(u.r24g), now, nowISO, `ok-${u.source || 'playwright'}`, u.id]
      );
      db.run(
        `INSERT INTO price_history (jeweller_id, r22g, r24g) VALUES (?, ?, ?)`,
        [u.id, Math.round(u.r22g), Math.round(u.r24g)]
      );
      results.ok++;
    } else {
      // Don't blank existing rates on a transient miss — just log status.
      db.run(
        `UPDATE jewellers SET last_scraped_at = ?, scrape_status = ? WHERE id = ?`,
        [nowISO, `miss-${u.source || 'playwright'}`, u.id]
      );
      results.miss++;
    }
  }

  console.log(`📡 Scraper push: ${results.ok} ok, ${results.miss} miss, ${results.skipped} skipped`);
  res.json({ success: true, ...results });
});

// 1. PRICE CALCULATOR API
app.post('/api/calculate-price', (req, res) => {
  const { weight, rate, making_percent } = req.body;
  
  if (!weight || !rate || making_percent === undefined) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const gold_cost = weight * rate;
  const making_cost = (gold_cost * making_percent) / 100;
  const total = gold_cost + making_cost;

  res.json({
    gold_cost: Math.round(gold_cost),
    making_cost: Math.round(making_cost),
    total: Math.round(total)
  });
});

// 2. REVIEWS WITH PHOTO UPLOAD
app.post('/api/reviews', upload.single('photo'), (req, res) => {
  const { jeweller_id, reviewer_name, reviewer_email, stars, text, verified_purchase } = req.body;
  const photo_url = req.file ? `http://localhost:${PORT}/${req.file.filename}` : null;

  db.run(
    `INSERT INTO reviews (jeweller_id, reviewer_name, reviewer_email, stars, text, photo_url, verified_purchase) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [jeweller_id, reviewer_name, reviewer_email, stars, text, photo_url, verified_purchase],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Review added', photo_url });
    }
  );
});

// Get reviews for a jeweller
app.get('/api/reviews/:jeweller_id', (req, res) => {
  const { jeweller_id } = req.params;
  db.all(
    'SELECT * FROM reviews WHERE jeweller_id = ? ORDER BY date DESC',
    [jeweller_id],
    (err, rows) => {
      if (err) return res.status(400).json({ error: err.message });
      res.json(rows);
    }
  );
});

// ── 3. PRICE ALERT ROUTES ──────────────────────────────────────

// POST /api/alerts/subscribe
// Called from the frontend when someone clicks "Set Alert"
// Body: { email, jeweller_id, purity, threshold_price }
app.post('/api/alerts/subscribe', async (req, res) => {
  const { email, jeweller_id, purity, threshold_price } = req.body;

  // Basic validation
  if (!email || !threshold_price) {
    return res.status(400).json({ error: 'Email and target price are required.' });
  }
  if (!email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (threshold_price < 5000 || threshold_price > 15000) {
    return res.status(400).json({ error: 'Target price must be between ₹5,000 and ₹15,000 per gram.' });
  }

  // Check for duplicate active alert from same email
  db.get(
    `SELECT id FROM alerts WHERE email = ? AND jeweller_id = ? AND active = 1`,
    [email, jeweller_id || null],
    async (err, existing) => {
      if (existing) {
        return res.status(409).json({ error: 'You already have an active alert for this jeweller.' });
      }

      // Save alert to database
      db.run(
        `INSERT INTO alerts (email, jeweller_id, alert_type, threshold_price, active) VALUES (?, ?, ?, ?, 1)`,
        [email, jeweller_id || null, purity || '22k', threshold_price],
        async function(err) {
          if (err) return res.status(500).json({ error: err.message });

          // Get jeweller name for the confirmation email
          const jeweller_name = jeweller_id
            ? await new Promise(resolve => db.get('SELECT name FROM jewellers WHERE id = ?', [jeweller_id], (e, r) => resolve(r ? r.name : 'Any Jeweller')))
            : 'Any Ahmedabad Jeweller';

          // Send confirmation email so user knows it worked
          try {
            await sendConfirmationEmail({
              toEmail:     email,
              jeweller:    jeweller_name,
              targetPrice: threshold_price,
              purity:      purity === '24k' ? '24K' : '22K',
            });
          } catch (mailErr) {
            console.error('Confirmation email failed:', mailErr.message);
            // Don't fail the request — alert is still saved
          }

          res.json({
            success: true,
            id:      this.lastID,
            message: `Alert saved! We'll email ${email} when 22K drops to ₹${threshold_price}/gram.`,
          });
        }
      );
    }
  );
});

// GET /api/alerts?email=xxx  — list all alerts for a user
app.get('/api/alerts', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });
  db.all(
    `SELECT alerts.*, jewellers.name as jeweller_name FROM alerts
     LEFT JOIN jewellers ON alerts.jeweller_id = jewellers.id
     WHERE alerts.email = ? ORDER BY alerts.created_at DESC`,
    [email],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// DELETE /api/alerts/:id  — cancel an alert
app.delete('/api/alerts/:id', (req, res) => {
  db.run('UPDATE alerts SET active = 0 WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Alert cancelled.' });
  });
});


// 4. PARTNER VERIFICATION & CERTIFICATION
app.post('/api/jewellers/verify', (req, res) => {
  const { jeweller_id, certificate_url, business_reg } = req.body;

  db.run(
    'UPDATE jewellers SET verified = 1, certificate_url = ?, business_reg = ? WHERE id = ?',
    [certificate_url, business_reg, jeweller_id],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ message: 'Jeweller verified and certified' });
    }
  );
});

app.get('/api/jewellers/verified', (req, res) => {
  db.all('SELECT * FROM jewellers WHERE verified = 1', (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
});

// 5. JEWELLER LOGIN & REGISTRATION
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, phone, area } = req.body || {};
  let { symbol } = req.body || {};

  // Bare-minimum validation — the signup form covers more on the
  // client side, but we don't trust it.
  if (!name || !String(name).trim())     return res.status(400).json({ error: 'Shop name is required' });
  if (!email || !/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!password || password.length < 6)   return res.status(400).json({ error: 'Password must be at least 6 characters' });

  // Auto-derive the URL slug from the shop name if not provided
  // (the public site uses /jeweller.html?id=N anyway, but `symbol`
  // is UNIQUE in the table so we make it safe + collision-resistant).
  if (!symbol || !String(symbol).trim()) {
    const slug = String(name).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'shop';
    symbol = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const hash = bcrypt.hashSync(password, 10);
  db.run(
    `INSERT INTO jewellers (name, symbol, email, password, phone, area) VALUES (?, ?, ?, ?, ?, ?)`,
    [String(name).trim(), symbol, String(email).toLowerCase().trim(), hash, phone || null, area || null],
    function(err) {
      if (err) {
        const msg = /UNIQUE.*email/i.test(err.message)
          ? 'That email is already registered — try logging in instead.'
          : /UNIQUE.*name|UNIQUE.*symbol/i.test(err.message)
            ? 'A shop with that name already exists — try a slightly different name.'
            : 'Could not create account';
        return res.status(400).json({ error: msg });
      }
      const token = jwt.sign({ id: this.lastID, email }, process.env.JWT_SECRET || 'secret_key');
      res.json({ id: this.lastID, token, message: 'Registered successfully' });
    }
  );
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  db.get('SELECT * FROM jewellers WHERE email = ?', [email], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'secret_key');
    res.json({ token, user: { id: user.id, name: user.name, verified: user.verified } });
  });
});

// ── JWT auth middleware ──────────────────────────────────────
// Reads Authorization: Bearer <token>, verifies, attaches req.jeweller
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

// GET /api/jewellers/me — the logged-in jeweller's own record (no password)
app.get('/api/jewellers/me', requireAuth, (req, res) => {
  db.get(
    `SELECT id, name, symbol, email, phone, whatsapp, area, address_line,
            verified, photo_url, gst_number, bis_license, upi_id,
            r22g, r24g, making, updated
       FROM jewellers WHERE id = ?`,
    [req.jeweller.id],
    (err, row) => {
      if (err)  return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Jeweller not found' });

      // ── Profile completeness — a 0–100 score the dashboard uses to
      // gamify onboarding. Fields are weighted by how much they raise
      // buyer trust on the public profile.
      const completeness = computeCompleteness(row);
      res.json({ ...row, completeness });
    }
  );
});

// Helper used by /me and exposed for the dashboard's gauge.
function computeCompleteness(j) {
  const checks = [
    { key: 'rates',       has: j.r22g != null && j.r24g != null, weight: 25, label: 'Today\'s rates posted' },
    { key: 'phone',       has: !!j.phone,                        weight: 15, label: 'Shop phone' },
    { key: 'whatsapp',    has: !!j.whatsapp,                     weight: 10, label: 'WhatsApp number' },
    { key: 'address',     has: !!j.address_line,                 weight: 10, label: 'Full address' },
    { key: 'photo',       has: !!j.photo_url,                    weight: 15, label: 'Shop photo' },
    { key: 'gst',         has: !!j.gst_number,                   weight: 10, label: 'GST number' },
    { key: 'bis',         has: !!j.bis_license,                  weight: 15, label: 'BIS hallmark licence' },
  ];
  const score = checks.reduce((s, c) => s + (c.has ? c.weight : 0), 0);
  const verified = score >= 75;   // unlock the green "Verified" badge
  return { score, verified, checks };
}

// 6. UPDATE RATES (for jewellers) — jeweller can only update their own rates
app.post('/api/jewellers/:id/rates', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id !== req.jeweller.id) {
    return res.status(403).json({ error: 'You can only update your own rates' });
  }

  const { r22g, r24g, making } = req.body;
  if (!r22g || !r24g || making === undefined) {
    return res.status(400).json({ error: 'r22g, r24g, and making are required' });
  }
  const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  db.run(
    'UPDATE jewellers SET r22g = ?, r24g = ?, making = ?, updated = ? WHERE id = ?',
    [r22g, r24g, making, now, id],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });

      // Log to price history so the trend chart has data
      db.run(
        'INSERT INTO price_history (jeweller_id, r22g, r24g) VALUES (?, ?, ?)',
        [id, r22g, r24g]
      );

      res.json({ message: 'Rates updated', updated: now, r22g, r24g, making });
    }
  );
});

// PUT /api/jewellers/me/profile — update credibility fields
// (phone, WhatsApp, address, GST, BIS licence). Photo handled separately.
app.put('/api/jewellers/me/profile', requireAuth, (req, res) => {
  const { phone, whatsapp, address_line, gst_number, bis_license, upi_id } = req.body || {};
  // Light validation — these are display fields, not security-critical.
  // Trim everything and treat empty strings as null so the DB stays clean.
  const norm = (v) => {
    if (typeof v !== 'string') return v == null ? null : null;
    const t = v.trim();
    return t === '' ? null : t;
  };
  const updates = {
    phone:        norm(phone),
    whatsapp:     norm(whatsapp),
    address_line: norm(address_line),
    gst_number:   norm(gst_number),
    bis_license:  norm(bis_license),
    upi_id:       norm(upi_id),
  };
  // Cheap UPI-VPA sanity: something like "name@bank". We accept
  // pretty much any handle format because UPI is loose, but block
  // obviously wrong shapes so the QR generator doesn't produce
  // an unusable code.
  if (updates.upi_id && !/^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9._-]{2,}$/.test(updates.upi_id)) {
    return res.status(400).json({ error: 'UPI ID should look like name@bank (e.g. shop@okhdfcbank).' });
  }
  db.run(
    `UPDATE jewellers
        SET phone = ?, whatsapp = ?, address_line = ?, gst_number = ?, bis_license = ?, upi_id = ?
      WHERE id = ?`,
    [updates.phone, updates.whatsapp, updates.address_line, updates.gst_number, updates.bis_license, updates.upi_id, req.jeweller.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      // Re-read so the response includes the recomputed completeness.
      db.get(
        `SELECT id, name, symbol, email, phone, whatsapp, area, address_line,
                verified, photo_url, gst_number, bis_license, upi_id,
                r22g, r24g, making, updated
           FROM jewellers WHERE id = ?`,
        [req.jeweller.id],
        (e, row) => {
          if (e || !row) return res.status(500).json({ error: 'Re-read failed' });
          res.json({ ...row, completeness: computeCompleteness(row) });
        }
      );
    }
  );
});

// POST /api/jewellers/me/photo — upload shop photo (multipart/form-data).
// Reuses the existing multer config; cap at 5 MB, JPG/PNG/WebP.
app.post('/api/jewellers/me/photo', requireAuth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
  // Relative URL — served by the express.static('uploads') middleware.
  const photo_url = `/${req.file.filename}`;
  db.run(
    'UPDATE jewellers SET photo_url = ? WHERE id = ?',
    [photo_url, req.jeweller.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ photo_url });
    }
  );
});

// ═══════════════════════════════════════════════════════════════
// INVENTORY / STOCK  (Phase 1 of the jeweller app)
// All routes require auth and are scoped to req.jeweller.id, so a
// jeweller can only ever see / touch their own items.
// ═══════════════════════════════════════════════════════════════

// GET /api/inventory — list my items (newest first), with summary.
app.get('/api/inventory', requireAuth, (req, res) => {
  db.all(
    `SELECT id, name, category, photo_url, purity, weight_g, cost_price, in_stock, hsn_code, created_at
       FROM inventory_items WHERE jeweller_id = ? ORDER BY created_at DESC`,
    [req.jeweller.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // Summary: total items in stock + total weight (value computed
      // client-side using today's live rate so it's always current).
      const totalItems  = rows.reduce((s, r) => s + (r.in_stock || 0), 0);
      const weight22    = rows.filter(r => r.purity === '22').reduce((s, r) => s + (r.weight_g || 0) * (r.in_stock || 0), 0);
      const weight24    = rows.filter(r => r.purity === '24').reduce((s, r) => s + (r.weight_g || 0) * (r.in_stock || 0), 0);
      const weight18    = rows.filter(r => r.purity === '18').reduce((s, r) => s + (r.weight_g || 0) * (r.in_stock || 0), 0);
      res.json({ items: rows, summary: { count: rows.length, totalItems, weight22, weight24, weight18 } });
    }
  );
});

// POST /api/inventory — add an item. Body: name, category, purity,
// weight_g, cost_price, in_stock. (photo uploaded separately.)
app.post('/api/inventory', requireAuth, (req, res) => {
  const { name, category, purity, weight_g, cost_price, in_stock } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Item name is required' });
  const cleanPurity = ['22', '24', '18'].includes(String(purity)) ? String(purity) : '22';
  db.run(
    `INSERT INTO inventory_items
       (jeweller_id, name, category, purity, weight_g, cost_price, in_stock)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      req.jeweller.id,
      String(name).trim(),
      category || null,
      cleanPurity,
      parseFloat(weight_g) || null,
      parseFloat(cost_price) || null,
      Number.isFinite(parseInt(in_stock, 10)) ? parseInt(in_stock, 10) : 1,
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get(`SELECT * FROM inventory_items WHERE id = ?`, [this.lastID], (e, row) => {
        res.json(row || { id: this.lastID });
      });
    }
  );
});

// PUT /api/inventory/:id — edit an item I own.
app.put('/api/inventory/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, category, purity, weight_g, cost_price, in_stock } = req.body || {};
  const cleanPurity = ['22', '24', '18'].includes(String(purity)) ? String(purity) : '22';
  db.run(
    `UPDATE inventory_items
        SET name = ?, category = ?, purity = ?, weight_g = ?, cost_price = ?, in_stock = ?
      WHERE id = ? AND jeweller_id = ?`,
    [
      String(name || '').trim(),
      category || null,
      cleanPurity,
      parseFloat(weight_g) || null,
      parseFloat(cost_price) || null,
      Number.isFinite(parseInt(in_stock, 10)) ? parseInt(in_stock, 10) : 0,
      id, req.jeweller.id,
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
      db.get(`SELECT * FROM inventory_items WHERE id = ?`, [id], (e, row) => res.json(row));
    }
  );
});

// DELETE /api/inventory/:id — remove an item I own.
app.delete('/api/inventory/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.run(
    `DELETE FROM inventory_items WHERE id = ? AND jeweller_id = ?`,
    [id, req.jeweller.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
      res.json({ success: true });
    }
  );
});

// POST /api/inventory/:id/photo — upload a photo for one item.
app.post('/api/inventory/:id/photo', requireAuth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
  const id = parseInt(req.params.id, 10);
  const photo_url = `/${req.file.filename}`;
  db.run(
    `UPDATE inventory_items SET photo_url = ? WHERE id = ? AND jeweller_id = ?`,
    [photo_url, id, req.jeweller.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Item not found' });
      res.json({ photo_url });
    }
  );
});

// ═══════════════════════════════════════════════════════════════
// SALES / INVOICES  (Phase 3 of the jeweller app)
// All routes require auth, scoped to req.jeweller.id.
// Money is ALWAYS computed server-side from weight/rate/making/gst —
// the client's numbers are ignored, so an invoice total can't be faked.
// ═══════════════════════════════════════════════════════════════

// Build the next invoice number for a jeweller: INV-<jid>-000001
function nextInvoiceNumber(jewellerId, cb) {
  db.get(
    `SELECT COUNT(*) AS n FROM sales WHERE jeweller_id = ?`,
    [jewellerId],
    (err, row) => {
      const seq = (err || !row ? 0 : row.n) + 1;
      cb(`INV-${jewellerId}-${String(seq).padStart(6, '0')}`);
    }
  );
}

// POST /api/sales — record a sale + generate an invoice.
// Body: { customer_id?, customer_name, customer_phone?, customer_gstin?,
//         item_id?, description, purity, weight_g, rate_per_g,
//         making_pct, gst_pct }
app.post('/api/sales', requireAuth, (req, res) => {
  const b = req.body || {};
  const weight = parseFloat(b.weight_g);
  const rate   = parseFloat(b.rate_per_g);
  if (!Number.isFinite(weight) || weight <= 0)  return res.status(400).json({ error: 'Valid weight is required' });
  if (!Number.isFinite(rate)   || rate   <= 0)  return res.status(400).json({ error: 'Valid rate is required' });
  if (!b.customer_name || !String(b.customer_name).trim()) return res.status(400).json({ error: 'Customer name is required' });

  const purity     = ['22', '24', '18'].includes(String(b.purity)) ? String(b.purity) : '22';
  const makingPct  = Number.isFinite(parseFloat(b.making_pct)) ? parseFloat(b.making_pct) : 0;
  const gstPct     = Number.isFinite(parseFloat(b.gst_pct)) ? parseFloat(b.gst_pct) : 3;

  // ── Server-side money math (rounded to paise then to rupee on total) ──
  const goldValue    = weight * rate;
  const makingAmount = goldValue * (makingPct / 100);
  const taxable      = goldValue + makingAmount;
  const gstAmount    = taxable * (gstPct / 100);
  const total        = taxable + gstAmount;
  const r2 = (n) => Math.round(n * 100) / 100;

  nextInvoiceNumber(req.jeweller.id, (invoiceNumber) => {
    db.run(
      `INSERT INTO sales
        (jeweller_id, invoice_number, customer_id, customer_name, customer_phone, customer_gstin,
         item_id, description, purity, weight_g, rate_per_g, gold_value,
         making_pct, making_amount, gst_pct, gst_amount, total)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.jeweller.id, invoiceNumber,
        b.customer_id || null, String(b.customer_name).trim(),
        b.customer_phone || null, b.customer_gstin || null,
        b.item_id || null, b.description || null, purity,
        r2(weight), r2(rate), r2(goldValue),
        makingPct, r2(makingAmount), gstPct, r2(gstAmount), r2(total),
      ],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const saleId = this.lastID;

        // ── Auto-decrement inventory if this sale was tied to a stock item ──
        if (b.item_id) {
          db.run(
            `UPDATE inventory_items
                SET in_stock = MAX(0, in_stock - 1)
              WHERE id = ? AND jeweller_id = ?`,
            [b.item_id, req.jeweller.id],
            () => {}   // non-fatal: invoice is saved regardless
          );
        }
        db.get(`SELECT * FROM sales WHERE id = ?`, [saleId], (e, row) => res.json(row || { id: saleId, invoice_number: invoiceNumber }));
      }
    );
  });
});

// GET /api/sales — list my sales (newest first) + summary totals.
app.get('/api/sales', requireAuth, (req, res) => {
  db.all(
    `SELECT * FROM sales WHERE jeweller_id = ? ORDER BY sold_at DESC, id DESC`,
    [req.jeweller.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // Today / this-month totals (IST day boundary).
      const nowIST = new Date(Date.now() + 5.5 * 3600 * 1000);
      const todayStr = nowIST.toISOString().slice(0, 10);
      const monthStr = nowIST.toISOString().slice(0, 7);
      let today = 0, month = 0;
      rows.forEach(s => {
        const d = (s.sold_at || '').slice(0, 10);
        if (d === todayStr) today += s.total || 0;
        if ((s.sold_at || '').slice(0, 7) === monthStr) month += s.total || 0;
      });
      res.json({ sales: rows, summary: { count: rows.length, today, month } });
    }
  );
});

// GET /api/reports — aggregated analytics for the Reports screen.
// Computed server-side from this jeweller's sales. Lightweight: one
// shop's data, so a few in-memory reductions are plenty fast.
app.get('/api/reports', requireAuth, (req, res) => {
  db.all(
    `SELECT * FROM sales WHERE jeweller_id = ? ORDER BY sold_at ASC`,
    [req.jeweller.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      // ── Last 30 days daily series (IST days) ──
      const dayMap = {};
      const nowIST = new Date(Date.now() + 5.5 * 3600 * 1000);
      for (let i = 29; i >= 0; i--) {
        const d = new Date(nowIST); d.setDate(d.getDate() - i);
        dayMap[d.toISOString().slice(0, 10)] = { day: d.toISOString().slice(0, 10), total: 0, count: 0 };
      }
      rows.forEach(s => {
        const day = (s.sold_at || '').slice(0, 10);
        if (dayMap[day]) { dayMap[day].total += s.total || 0; dayMap[day].count += 1; }
      });
      const daily = Object.values(dayMap);

      // ── Top customers by spend ──
      const custMap = {};
      rows.forEach(s => {
        const k = s.customer_name || 'Walk-in';
        custMap[k] = custMap[k] || { name: k, total: 0, count: 0 };
        custMap[k].total += s.total || 0; custMap[k].count += 1;
      });
      const topCustomers = Object.values(custMap).sort((a, b) => b.total - a.total).slice(0, 10);

      // ── Top items by units sold ──
      const itemMap = {};
      rows.forEach(s => {
        const k = s.description || 'Custom item';
        itemMap[k] = itemMap[k] || { description: k, count: 0, total: 0 };
        itemMap[k].count += 1; itemMap[k].total += s.total || 0;
      });
      const topItems = Object.values(itemMap).sort((a, b) => b.count - a.count).slice(0, 10);

      // ── GST summary (for filing) ──
      const taxable = rows.reduce((s, r) => s + (r.gold_value || 0) + (r.making_amount || 0), 0);
      const totalGst = rows.reduce((s, r) => s + (r.gst_amount || 0), 0);
      const grossSales = rows.reduce((s, r) => s + (r.total || 0), 0);
      const totalWeight = rows.reduce((s, r) => s + (r.weight_g || 0), 0);

      // ═══════════════════════════════════════════════════════════
      // ADVANCED ANALYTICS (Phase 6)
      // Builds the deeper metrics the basic report doesn't cover:
      //   • Gross profit & margin (joins sale.item_id → inventory cost)
      //   • Fast-movers (units shifted per item, last 30 days)
      //   • Customer LTV (lifetime spend per saved customer)
      //   • Month-over-month comparison
      // All derived in JS from the same rows we already loaded above,
      // so we avoid extra round-trips. The inventory join needs one
      // extra query but stays cheap (single SELECT per jeweller).
      // ═══════════════════════════════════════════════════════════
      db.all(
        `SELECT id, name, cost_price FROM inventory_items WHERE jeweller_id = ?`,
        [req.jeweller.id],
        (e2, items) => {
          if (e2) items = [];
          const costById = {};
          items.forEach(it => { if (it.cost_price != null) costById[it.id] = it.cost_price; });

          // ── Profit margin ──
          let totalRevenue = 0, totalCost = 0, coveredSales = 0;
          rows.forEach(s => {
            const rev = (s.gold_value || 0) + (s.making_amount || 0);
            totalRevenue += rev;
            const c = costById[s.item_id];
            if (c != null) { totalCost += c; coveredSales += 1; }
          });
          const grossProfit = totalRevenue - totalCost;
          const marginPct   = totalRevenue ? (grossProfit / totalRevenue) * 100 : 0;

          // ── Fast movers: units sold per item_id in last 30 days ──
          const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
          const moverMap = {};
          rows.forEach(s => {
            if (!s.item_id || (s.sold_at || '').slice(0,10) < cutoff) return;
            const it = items.find(i => i.id === s.item_id);
            const k = s.item_id;
            moverMap[k] = moverMap[k] || { id: s.item_id, name: (it && it.name) || s.description || 'Item', count: 0, revenue: 0 };
            moverMap[k].count += 1;
            moverMap[k].revenue += s.total || 0;
          });
          const fastMovers = Object.values(moverMap).sort((a, b) => b.count - a.count).slice(0, 10);

          // ── Customer LTV: per saved customer (customer_id != null) ──
          const ltvMap = {};
          rows.forEach(s => {
            if (!s.customer_id) return;   // walk-ins excluded — no persistent identity
            const k = s.customer_id;
            ltvMap[k] = ltvMap[k] || { id: k, name: s.customer_name || 'Customer', totalSpend: 0, billCount: 0, lastPurchase: null };
            ltvMap[k].totalSpend += s.total || 0;
            ltvMap[k].billCount  += 1;
            const t = s.sold_at || '';
            if (!ltvMap[k].lastPurchase || t > ltvMap[k].lastPurchase) ltvMap[k].lastPurchase = t;
          });
          const todayIso = new Date().toISOString().slice(0, 10);
          const customerLtv = Object.values(ltvMap)
            .map(c => ({
              ...c,
              avgOrder: c.billCount ? c.totalSpend / c.billCount : 0,
              daysSinceLast: c.lastPurchase
                ? Math.max(0, Math.floor((Date.parse(todayIso) - Date.parse(c.lastPurchase.slice(0,10))) / 86400000))
                : null,
            }))
            .sort((a, b) => b.totalSpend - a.totalSpend)
            .slice(0, 10);

          // ── Month-over-month comparison (current vs previous IST month) ──
          const nowI   = new Date(Date.now() + 5.5 * 3600 * 1000);
          const curYM  = nowI.toISOString().slice(0, 7);
          const prevD  = new Date(nowI); prevD.setMonth(prevD.getMonth() - 1);
          const prevYM = prevD.toISOString().slice(0, 7);
          const bucket = (ym) => {
            const b = { revenue: 0, count: 0, gst: 0, profit: 0 };
            rows.forEach(s => {
              if ((s.sold_at || '').slice(0, 7) !== ym) return;
              b.revenue += s.total || 0;
              b.count   += 1;
              b.gst     += s.gst_amount || 0;
              const c = costById[s.item_id];
              if (c != null) b.profit += ((s.gold_value || 0) + (s.making_amount || 0)) - c;
            });
            return b;
          };
          const cur  = bucket(curYM);
          const prev = bucket(prevYM);
          const pctChange = (a, b) => b === 0 ? null : ((a - b) / b) * 100;
          const monthly = {
            current:  { ...cur,  ym: curYM  },
            previous: { ...prev, ym: prevYM },
            changePct: {
              revenue: pctChange(cur.revenue, prev.revenue),
              count:   pctChange(cur.count,   prev.count),
              profit:  pctChange(cur.profit,  prev.profit),
            },
          };

          res.json({
            daily, topCustomers, topItems,
            gst: { taxable, cgst: totalGst / 2, sgst: totalGst / 2, totalGst, grossSales },
            totals: { sales: rows.length, weight: totalWeight, gross: grossSales },
            analytics: {
              profit: {
                totalRevenue, totalCost, grossProfit, marginPct,
                coveredSales, uncoveredSales: rows.length - coveredSales,
              },
              fastMovers,
              customerLtv,
              monthly,
            },
          });
        }
      );
    }
  );
});

// GET /api/sales/:id — one sale (for invoice rendering).
// Also returns `public_sig`, the HMAC the jeweller can append to a
// /invoice-view.html link to share with the customer over WhatsApp.
app.get('/api/sales/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.get(
    `SELECT * FROM sales WHERE id = ? AND jeweller_id = ?`,
    [id, req.jeweller.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Invoice not found' });
      row.public_sig = signSaleId(id);
      res.json(row);
    }
  );
});

// GET /api/public/invoices/:id/:sig — UNAUTHENTICATED public view.
// Returns the sale joined with the seller's display info so the
// /invoice-view.html page can render a real GST invoice the customer
// got linked over WhatsApp. The :sig HMAC prevents anyone from
// enumerating other people's sales by guessing the id.
app.get('/api/public/invoices/:id/:sig', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Bad id' });
  const expected = signSaleId(id);
  // Constant-time compare to avoid timing oracles.
  const given = String(req.params.sig || '');
  if (given.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return res.status(403).json({ error: 'Invalid link' });
  }
  db.get(`SELECT * FROM sales WHERE id = ?`, [id], (err, sale) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!sale) return res.status(404).json({ error: 'Invoice not found' });
    db.get(
      `SELECT name, phone, whatsapp, area, address_line,
              gst_number, bis_license, upi_id
         FROM jewellers WHERE id = ?`,
      [sale.jeweller_id],
      (e2, seller) => {
        if (e2) return res.status(500).json({ error: e2.message });
        res.json({ sale, seller: seller || {} });
      }
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// PAYMENTS  (Phase 9 — payment tracking)
// Record a payment against a sale. Body: { amount, note? }.
// - Adds to sales.amount_paid (never negative, never over total).
// - Recomputes sales.payment_status ('unpaid' / 'partial' / 'paid').
// - Idempotent-ish only in the sense that repeat calls stack; the
//   frontend guards double-tapping.
// ═══════════════════════════════════════════════════════════════
app.post('/api/sales/:id/payment', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const amt = parseFloat(req.body && req.body.amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'A positive amount is required.' });
  }
  db.get(
    `SELECT id, total, amount_paid FROM sales WHERE id = ? AND jeweller_id = ?`,
    [id, req.jeweller.id],
    (err, sale) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!sale) return res.status(404).json({ error: 'Sale not found.' });
      const total = Number(sale.total) || 0;
      const prev  = Number(sale.amount_paid) || 0;
      // Cap at total so we never store more paid than the bill is worth.
      const nextPaid = Math.min(total, prev + amt);
      const status =
        nextPaid <= 0 ? 'unpaid' :
        nextPaid < total - 0.5 ? 'partial' : 'paid';   // ₹0.50 grace for rounding
      db.run(
        `UPDATE sales SET amount_paid = ?, payment_status = ? WHERE id = ? AND jeweller_id = ?`,
        [Math.round(nextPaid * 100) / 100, status, id, req.jeweller.id],
        function (e2) {
          if (e2) return res.status(500).json({ error: e2.message });
          res.json({ id, total, amount_paid: nextPaid, payment_status: status });
        }
      );
    }
  );
});

// GET /api/dues — every sale of mine that isn't fully paid, newest
// first, joined with the customer name/phone for one-tap WA follow-up.
// Also returns a rolled-up summary the Home card uses.
app.get('/api/dues', requireAuth, (req, res) => {
  db.all(
    `SELECT id, invoice_number, customer_id, customer_name, customer_phone,
            total, amount_paid, payment_status, sold_at
       FROM sales
      WHERE jeweller_id = ? AND payment_status IN ('unpaid', 'partial')
      ORDER BY sold_at ASC`,
    [req.jeweller.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const todayIso = new Date().toISOString().slice(0, 10);
      const enriched = rows.map(r => {
        const balance = Math.max(0, (Number(r.total) || 0) - (Number(r.amount_paid) || 0));
        const soldDay = (r.sold_at || '').slice(0, 10);
        const daysOld = soldDay
          ? Math.max(0, Math.floor((Date.parse(todayIso) - Date.parse(soldDay)) / 86400000))
          : null;
        return { ...r, balance, daysOld };
      });
      const totalDue = enriched.reduce((s, r) => s + r.balance, 0);
      const oldest  = enriched.length
        ? Math.max(...enriched.map(r => r.daysOld || 0))
        : 0;
      res.json({
        dues: enriched,
        summary: {
          count: enriched.length,
          totalDue,
          oldestDays: oldest,
        },
      });
    }
  );
});

// ═══════════════════════════════════════════════════════════════
// CUSTOMERS / CRM  (Phase 2 of the jeweller app)
// All routes require auth, scoped to req.jeweller.id.
// ═══════════════════════════════════════════════════════════════

// GET /api/customers — list my customers (newest first).
app.get('/api/customers', requireAuth, (req, res) => {
  db.all(
    `SELECT id, name, phone, whatsapp, email, birthday, anniversary, address, gstin, notes, created_at
       FROM customers WHERE jeweller_id = ? ORDER BY name COLLATE NOCASE ASC`,
    [req.jeweller.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ customers: rows, summary: { count: rows.length } });
    }
  );
});

// POST /api/customers — add a customer.
app.post('/api/customers', requireAuth, (req, res) => {
  const { name, phone, whatsapp, email, birthday, anniversary, address, gstin, notes } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Customer name is required' });
  const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  db.run(
    `INSERT INTO customers
       (jeweller_id, name, phone, whatsapp, email, birthday, anniversary, address, gstin, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.jeweller.id, String(name).trim(), clean(phone), clean(whatsapp), clean(email),
     clean(birthday), clean(anniversary), clean(address), clean(gstin), clean(notes)],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get(`SELECT * FROM customers WHERE id = ?`, [this.lastID], (e, row) => res.json(row || { id: this.lastID }));
    }
  );
});

// PUT /api/customers/:id — edit a customer I own.
app.put('/api/customers/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, phone, whatsapp, email, birthday, anniversary, address, gstin, notes } = req.body || {};
  const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  db.run(
    `UPDATE customers
        SET name = ?, phone = ?, whatsapp = ?, email = ?, birthday = ?,
            anniversary = ?, address = ?, gstin = ?, notes = ?
      WHERE id = ? AND jeweller_id = ?`,
    [String(name || '').trim(), clean(phone), clean(whatsapp), clean(email), clean(birthday),
     clean(anniversary), clean(address), clean(gstin), clean(notes), id, req.jeweller.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Customer not found' });
      db.get(`SELECT * FROM customers WHERE id = ?`, [id], (e, row) => res.json(row));
    }
  );
});

// DELETE /api/customers/:id — remove a customer I own.
app.delete('/api/customers/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.run(
    `DELETE FROM customers WHERE id = ? AND jeweller_id = ?`,
    [id, req.jeweller.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Customer not found' });
      res.json({ success: true });
    }
  );
});

// ═══════════════════════════════════════════════════════════════
// LOYALTY  (Phase 8)
// Returns four lists the jeweller acts on:
//   • today      — birthdays + anniversaries today (MM-DD match)
//   • thisWeek   — birthdays + anniversaries in the next 7 days
//   • vip        — saved customers with 3+ bills, ordered by spend
//   • inactive   — customers who bought at least once but not in 90+ days
// We do NOT auto-send anything — wa.me links in the UI are tapped
// by the jeweller, which keeps us out of WhatsApp Business API
// territory and avoids spam risk.
// ═══════════════════════════════════════════════════════════════
app.get('/api/loyalty', requireAuth, (req, res) => {
  const jid = req.jeweller.id;
  const today = new Date(Date.now() + 5.5 * 3600 * 1000);   // IST
  const todayIso = today.toISOString().slice(0, 10);
  const todayMMDD = todayIso.slice(5);                       // 'MM-DD'

  // Next 7 days as MM-DD set (handles Dec→Jan wraparound).
  const weekMMDD = new Set();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    weekMMDD.add(d.toISOString().slice(5, 10));
  }

  db.all(
    `SELECT id, name, phone, whatsapp, email, birthday, anniversary, notes
       FROM customers WHERE jeweller_id = ?`,
    [jid],
    (err, custs) => {
      if (err) return res.status(500).json({ error: err.message });
      db.all(
        `SELECT id, customer_id, customer_name, customer_phone, total, sold_at
           FROM sales WHERE jeweller_id = ? AND customer_id IS NOT NULL
           ORDER BY sold_at ASC`,
        [jid],
        (e2, sales) => {
          if (e2) return res.status(500).json({ error: e2.message });

          // Roll up per-customer purchase stats.
          const byCust = {};
          sales.forEach(s => {
            const k = s.customer_id;
            byCust[k] = byCust[k] || { count: 0, spend: 0, last: null };
            byCust[k].count += 1;
            byCust[k].spend += s.total || 0;
            const d = (s.sold_at || '').slice(0, 10);
            if (!byCust[k].last || d > byCust[k].last) byCust[k].last = d;
          });
          const daysSince = (iso) => iso
            ? Math.max(0, Math.floor((Date.parse(todayIso) - Date.parse(iso)) / 86400000))
            : null;

          const enrich = (c) => {
            const s = byCust[c.id] || { count: 0, spend: 0, last: null };
            return {
              id: c.id, name: c.name,
              phone: c.whatsapp || c.phone || '',
              billCount: s.count, totalSpend: s.spend,
              lastPurchase: s.last, daysSinceLast: daysSince(s.last),
            };
          };

          // ── Birthdays / anniversaries ──
          const occToday = [], occWeek = [];
          custs.forEach(c => {
            const checks = [
              { kind: 'birthday',    iso: c.birthday },
              { kind: 'anniversary', iso: c.anniversary },
            ];
            checks.forEach(({ kind, iso }) => {
              if (!iso || iso.length < 10) return;
              const mmdd = iso.slice(5, 10);
              const enriched = enrich(c);
              const item = { ...enriched, kind, dateIso: iso };
              if (mmdd === todayMMDD) occToday.push(item);
              else if (weekMMDD.has(mmdd)) {
                // tag the day-of-week distance for sort
                item.daysAway = [...weekMMDD].indexOf(mmdd);
                occWeek.push(item);
              }
            });
          });
          occWeek.sort((a, b) => (a.daysAway || 0) - (b.daysAway || 0));

          // ── VIP (3+ bills, sorted by spend) ──
          const vip = custs
            .map(enrich)
            .filter(c => c.billCount >= 3)
            .sort((a, b) => b.totalSpend - a.totalSpend)
            .slice(0, 20);

          // ── Inactive (bought before, but not in 90+ days) ──
          const inactive = custs
            .map(enrich)
            .filter(c => c.billCount >= 1 && c.daysSinceLast != null && c.daysSinceLast >= 90)
            .sort((a, b) => b.totalSpend - a.totalSpend)
            .slice(0, 20);

          res.json({
            today: occToday,
            thisWeek: occWeek,
            vip,
            inactive,
            summary: {
              todayCount:    occToday.length,
              thisWeekCount: occWeek.length,
              vipCount:      vip.length,
              inactiveCount: inactive.length,
            },
          });
        }
      );
    }
  );
});

// ═══════════════════════════════════════════════════════════════
// DEMO SEED  (Phase 5 — first-run experience)
// One call inserts 3 sample inventory items, 2 customers, and one
// sample bill so a brand-new jeweller can immediately see what
// the app looks like with data in it. Rows are normal — they can
// be edited or deleted via the regular UI. Refuses to run if the
// account already has any inventory/customers/sales (prevents
// accidental duplication on repeat clicks).
// ═══════════════════════════════════════════════════════════════
app.post('/api/jewellers/me/seed-demo', requireAuth, async (req, res) => {
  const jid = req.jeweller.id;
  const countOne = (sql) => new Promise((resolve, reject) => {
    db.get(sql, [jid], (err, row) => err ? reject(err) : resolve(row ? row.n : 0));
  });
  try {
    const [invN, custN, salesN] = await Promise.all([
      countOne(`SELECT COUNT(*) AS n FROM inventory_items WHERE jeweller_id = ?`),
      countOne(`SELECT COUNT(*) AS n FROM customers       WHERE jeweller_id = ?`),
      countOne(`SELECT COUNT(*) AS n FROM sales           WHERE jeweller_id = ?`),
    ]);
    if (invN + custN + salesN > 0) {
      return res.status(409).json({ error: 'Account already has data — demo seed only runs on empty accounts.' });
    }

    const run = (sql, params) => new Promise((resolve, reject) => {
      db.run(sql, params, function (err) { err ? reject(err) : resolve(this.lastID); });
    });

    // 3 inventory items
    const items = [
      { name: '[Demo] Gold Chain 22K',      category: 'chain', purity: '22', weight_g: 12.5, cost_price: 70000, in_stock: 2 },
      { name: '[Demo] Ladies Ring 18K',     category: 'ring',  purity: '18', weight_g:  4.2, cost_price: 24000, in_stock: 5 },
      { name: '[Demo] 1g Gold Coin 24K',    category: 'coin',  purity: '24', weight_g:  1.0, cost_price:  6800, in_stock: 10 },
    ];
    const itemIds = [];
    for (const it of items) {
      const id = await run(
        `INSERT INTO inventory_items
           (jeweller_id, name, category, purity, weight_g, cost_price, in_stock)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [jid, it.name, it.category, it.purity, it.weight_g, it.cost_price, it.in_stock]
      );
      itemIds.push(id);
    }

    // 3 customers, each engineered to light up one loyalty section:
    //   cust1 (Priya)  — birthday TODAY → 🎉 Today
    //   cust2 (Rohit)  — 3 bills → 👑 VIP
    //   cust3 (Aisha)  — one bill from ~120 days ago → 💤 Re-engage
    const nowIST   = new Date(Date.now() + 5.5 * 3600 * 1000);
    const todayMD  = nowIST.toISOString().slice(5, 10);              // 'MM-DD'
    const birthday = `1990-${todayMD}`;                              // arbitrary year, today's MM-DD
    const cust1 = await run(
      `INSERT INTO customers (jeweller_id, name, phone, whatsapp, birthday, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [jid, '[Demo] Priya Shah', '9876543210', '9876543210', birthday,
       'Loves traditional designs · birthday demo entry']
    );
    const cust2 = await run(
      `INSERT INTO customers (jeweller_id, name, phone, whatsapp, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [jid, '[Demo] Rohit Patel', '9123456789', '9123456789',
       'Regular customer · 3 purchases (demo)']
    );
    const cust3 = await run(
      `INSERT INTO customers (jeweller_id, name, phone, whatsapp, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [jid, '[Demo] Aisha Mehta', '9988776655', '9988776655',
       'Bought once, no visits in months (demo re-engage entry)']
    );

    // Money helper reused by every synthetic bill below.
    const r2 = (n) => Math.round(n * 100) / 100;
    const makeSale = async (cid, custName, phone, itemIdx, ratePerG, daysAgo) => {
      const it        = items[itemIdx];
      const goldVal   = it.weight_g * ratePerG;
      const makingPct = 12;
      const makingAmt = goldVal * makingPct / 100;
      const taxable   = goldVal + makingAmt;
      const gstPct    = 3;
      const gstAmt    = taxable * gstPct / 100;
      const total     = taxable + gstAmt;
      const invoiceNumber = await new Promise((resolve) => nextInvoiceNumber(jid, resolve));
      // Sales.sold_at defaults to CURRENT_TIMESTAMP, but for the
      // backdated bills we want to override it — otherwise the
      // "Re-engage" section (needs 90+ days gap) never lights up
      // for a fresh demo account.
      const soldAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
      await run(
        `INSERT INTO sales
           (jeweller_id, invoice_number, customer_id, customer_name, customer_phone,
            item_id, description, purity, weight_g, rate_per_g, gold_value,
            making_pct, making_amount, gst_pct, gst_amount, total, sold_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [jid, invoiceNumber, cid, custName, phone,
         itemIds[itemIdx], it.name, it.purity, r2(it.weight_g), r2(ratePerG), r2(goldVal),
         makingPct, r2(makingAmt), gstPct, r2(gstAmt), r2(total), soldAt]
      );
    };

    // Priya — 1 recent bill (also feeds Home's Recent activity)
    await makeSale(cust1, '[Demo] Priya Shah',  '9876543210', 0, 7200, 0);
    // Rohit — 3 bills across this month → VIP (3+ bills)
    await makeSale(cust2, '[Demo] Rohit Patel', '9123456789', 1, 7180, 2);
    await makeSale(cust2, '[Demo] Rohit Patel', '9123456789', 2, 7220, 8);
    await makeSale(cust2, '[Demo] Rohit Patel', '9123456789', 0, 7250, 20);
    // Aisha — 1 bill from 120 days ago → Re-engage (last purchase > 90 days)
    await makeSale(cust3, '[Demo] Aisha Mehta', '9988776655', 1, 6900, 120);

    res.json({ success: true, inserted: { items: items.length, customers: 3, sales: 5 } });
  } catch (err) {
    console.error('seed-demo failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jewellers/me/seed-demo/clear — bulk-delete every row
// whose name/description starts with "[Demo]" for this jeweller.
// Cheap escape hatch so the jeweller can wipe the sample data once
// they've seen the app and want a clean slate.
app.post('/api/jewellers/me/seed-demo/clear', requireAuth, (req, res) => {
  const jid = req.jeweller.id;
  db.serialize(() => {
    db.run(`DELETE FROM sales           WHERE jeweller_id = ? AND (description LIKE '[Demo]%' OR customer_name LIKE '[Demo]%')`, [jid]);
    db.run(`DELETE FROM inventory_items WHERE jeweller_id = ? AND name LIKE '[Demo]%'`, [jid]);
    db.run(`DELETE FROM customers       WHERE jeweller_id = ? AND name LIKE '[Demo]%'`, [jid], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// GET /api/mcx-history — daily IBJA reference rates for chart overlay.
// Same range params as the jeweller history endpoint.
// Returns one row per calendar day (IST) for the requested range.
app.get('/api/mcx-history', (req, res) => {
  const range = (req.query.range || '1m').toLowerCase();
  const metal = req.query.metal === 'silver' ? 'silver' : 'gold';

  const RANGE_DAYS = { '1d': 2, '1w': 8, '1m': 32, '3m': 95, '1y': 370, 'all': null };
  const days = RANGE_DAYS[range] === null ? null : (RANGE_DAYS[range] || 32);
  // YYYY-MM-DD cutoff in IST.
  const cutoff = days
    ? new Date(Date.now() + 5.5 * 3600 * 1000 - days * 24 * 3600 * 1000).toISOString().slice(0, 10)
    : null;

  const args = cutoff ? [metal, cutoff] : [metal];
  const sql  = cutoff
    ? `SELECT day, r24g, r22g, r18g FROM mcx_history
        WHERE metal = ? AND day >= ?  ORDER BY day ASC`
    : `SELECT day, r24g, r22g, r18g FROM mcx_history
        WHERE metal = ?               ORDER BY day ASC`;
  db.all(sql, args, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ range, metal, points: rows });
  });
});

// GET /api/jewellers/:id/history — price history for the trend chart.
// Query params (all optional):
//   range  = 1d | 1w | 1m | 3m | 1y | all      (default: 1m)
//   bucket = raw | day                         (default: day for ranges >= 1m)
// Returns OHLC-ish daily buckets when bucket=day, raw ticks otherwise.
// No row cap when bucket=day (5 years × 365 days = 1,825 points — fine).
app.get('/api/jewellers/:id/history', (req, res) => {
  const range  = (req.query.range  || '1m').toLowerCase();
  const bucket = (req.query.bucket || (range === '1d' || range === '1w' ? 'raw' : 'day')).toLowerCase();

  // Translate range → cutoff timestamp (UTC ISO).
  const now = Date.now();
  const RANGE_MS = {
    '1d':  24 * 3600 * 1000,
    '1w':  7  * 24 * 3600 * 1000,
    '1m':  30 * 24 * 3600 * 1000,
    '3m':  90 * 24 * 3600 * 1000,
    '1y':  365* 24 * 3600 * 1000,
    'all': null,
  };
  const cutoffMs = RANGE_MS[range] === null ? null : now - (RANGE_MS[range] || RANGE_MS['1m']);
  const cutoffISO = cutoffMs ? new Date(cutoffMs).toISOString() : null;

  if (bucket === 'raw') {
    // Tick-level — every recorded update inside the range.
    const args = cutoffISO ? [req.params.id, cutoffISO] : [req.params.id];
    const sql  = cutoffISO
      ? `SELECT r22g, r24g, recorded_at FROM price_history
           WHERE jeweller_id = ? AND recorded_at >= ?
           ORDER BY recorded_at ASC`
      : `SELECT r22g, r24g, recorded_at FROM price_history
           WHERE jeweller_id = ?
           ORDER BY recorded_at ASC`;
    return db.all(sql, args, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ range, bucket, points: rows });
    });
  }

  // Daily bucket — one row per day with open/high/low/close for 22K + 24K.
  // SQLite has date() — group by YYYY-MM-DD of recorded_at.
  const args = cutoffISO ? [req.params.id, cutoffISO] : [req.params.id];
  const sql  = cutoffISO
    ? `SELECT date(recorded_at) AS day,
              MIN(r22g) AS low22, MAX(r22g) AS high22, AVG(r22g) AS close22,
              MIN(r24g) AS low24, MAX(r24g) AS high24, AVG(r24g) AS close24,
              COUNT(*) AS n
         FROM price_history
        WHERE jeweller_id = ? AND recorded_at >= ?
        GROUP BY date(recorded_at)
        ORDER BY day ASC`
    : `SELECT date(recorded_at) AS day,
              MIN(r22g) AS low22, MAX(r22g) AS high22, AVG(r22g) AS close22,
              MIN(r24g) AS low24, MAX(r24g) AS high24, AVG(r24g) AS close24,
              COUNT(*) AS n
         FROM price_history
        WHERE jeweller_id = ?
        GROUP BY date(recorded_at)
        ORDER BY day ASC`;
  db.all(sql, args, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ range, bucket, points: rows });
  });
});

// GET /sitemap.xml — dynamic sitemap with every jeweller profile.
// Google + Bing read this once a day; helps them discover all 12
// (and any future) jeweller pages without needing internal-link crawl.
app.get('/sitemap.xml', (req, res) => {
  db.all(`SELECT id, updated FROM jewellers ORDER BY id`, (err, rows) => {
    const origin = (process.env.SITE_URL || `https://${req.get('host')}`).replace(/\/$/, '');
    const today  = new Date().toISOString().slice(0, 10);
    const staticUrls = [
      { loc: `${origin}/`,                 priority: '1.0', changefreq: 'hourly' },
      { loc: `${origin}/index.html`,       priority: '0.9', changefreq: 'hourly' },
      { loc: `${origin}/my-alerts.html`,   priority: '0.5', changefreq: 'monthly' },
    ];
    const jewellerUrls = (err || !rows) ? [] : rows.map(r => ({
      loc:        `${origin}/jeweller.html?id=${r.id}`,
      priority:   '0.8',
      changefreq: 'daily',
      lastmod:    today,
    }));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...jewellerUrls].map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`;
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');   // 1 hr cache
    res.send(xml);
  });
});

// Get all jewellers with verification status (no passwords leaked)
app.get('/api/jewellers', (req, res) => {
  db.all(
    `SELECT id, name, symbol, email, phone, whatsapp, area, address_line,
            verified, photo_url, gst_number, bis_license,
            r22g, r24g, making, updated,
            last_scraped_at, scrape_status
       FROM jewellers
      ORDER BY r22g ASC`,
    (err, rows) => {
      if (err) return res.status(400).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Manual scrape trigger (for debugging) — visit /api/scraper/test-now
app.get('/api/scraper/test-now', async (req, res) => {
  console.log('\n🧪 Manual scrape triggered from browser…');
  scrapeAll().catch(console.error);
  res.json({ success: true, message: 'Scraper running — watch the server terminal.' });
});

// ── LIVE MCX PRICE (GoldAPI.io) ────────────────────────────────
// GET /api/live-price            → live gold (22K + 24K) per gram in INR
// GET /api/live-price?metal=silver → live silver (24K) per gram in INR
app.get('/api/live-price', async (req, res) => {
  const metal = req.query.metal === 'silver' ? 'silver' : 'gold';
  try {
    const data = await getPrices(metal);
    res.json({
      metal,
      currency: 'INR',
      price_gram_22k: data.price_gram_22k ? Math.round(data.price_gram_22k) : null,
      price_gram_24k: data.price_gram_24k ? Math.round(data.price_gram_24k) : null,
      price_gram_18k: data.price_gram_18k ? Math.round(data.price_gram_18k) : null,
      cached:   !!data.cached,
      stale:    !!data.stale,
      fallback: !!data.fallback,
      timestamp: data.timestamp || Date.now(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start the IBJA live-rate scraper (every 30 min via node-cron)
// ── This replaces GoldAPI.io. Free, unlimited, India-authoritative.
startIbjaScraper();

// ── Start the alert checker (every 10 minutes via node-cron) ──
startAlertChecker();

// ── Start the per-jeweller rate scraper (every 15 min via node-cron)
startRateScraper();

// ── TEST ROUTE: manually fire the checker right now ──────────
// Visit http://localhost:5000/api/alerts/test-now in browser to trigger instantly
const { checkAlerts } = require('./alertChecker');
app.get('/api/alerts/test-now', async (req, res) => {
  console.log('\n🧪 Manual test triggered from browser...');
  await checkAlerts();
  res.json({ success: true, message: 'Alert check ran now — check your email and the terminal!' });
});

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📧 Email alerts will check every 30 minutes`);
});
