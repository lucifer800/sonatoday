const express    = require('express');
const cors       = require('cors');
const multer     = require('multer');
const path       = require('path');
const sqlite3    = require('sqlite3').verbose();
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

// ── Alert system ──────────────────────────────────────────────
const { startAlertChecker }             = require('./alertChecker');
const { sendPriceAlert, sendConfirmationEmail } = require('./mailer');
const { getPrices }                     = require('./goldPriceApi');
const { startRateScraper, scrapeAll }   = require('./rateScraper');
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

// ── Serve the frontend (index.html, app.js, data.js, etc.) from
// the parent directory so users can hit http://localhost:4000/
// directly without needing Live Server. Cache headers force the
// browser to re-fetch every time so price-card edits show up on
// a normal Cmd+R, not just hard-reload.
app.use(express.static(path.join(__dirname, '..'), {
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma',        'no-cache');
    res.set('Expires',       '0');
  },
}));

// ============ DATABASE SETUP ============
const db = new sqlite3.Database('./goldrates.db', (err) => {
  if (err) console.error(err);
  else console.log('✓ Connected to SQLite database');
});

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
  const { name, symbol, email, password, phone, area } = req.body;
  const hash = bcrypt.hashSync(password, 10);

  db.run(
    `INSERT INTO jewellers (name, symbol, email, password, phone, area) VALUES (?, ?, ?, ?, ?, ?)`,
    [name, symbol, email, hash, phone, area],
    function(err) {
      if (err) return res.status(400).json({ error: 'Email already registered' });
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
    'SELECT id, name, symbol, email, phone, area, verified, r22g, r24g, making, updated FROM jewellers WHERE id = ?',
    [req.jeweller.id],
    (err, row) => {
      if (err)  return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Jeweller not found' });
      res.json(row);
    }
  );
});

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

// GET /api/jewellers/:id/history — price history for the trend chart
app.get('/api/jewellers/:id/history', (req, res) => {
  db.all(
    'SELECT r22g, r24g, recorded_at FROM price_history WHERE jeweller_id = ? ORDER BY recorded_at DESC LIMIT 30',
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows.reverse()); // oldest first for charting
    }
  );
});

// Get all jewellers with verification status (no passwords leaked)
app.get('/api/jewellers', (req, res) => {
  db.all(
    `SELECT id, name, symbol, email, phone, area, verified, r22g, r24g, making, updated,
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

// ── Start the alert checker (every 10 minutes via node-cron) ──
startAlertChecker();

// ── Start the rate scraper (every 15 minutes via node-cron) ───
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
