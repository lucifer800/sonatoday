# 💻 Copy-Paste Code Snippets

Quick reference for common tasks. Copy & paste to use!

---

## 🚀 Backend Setup

### Install all dependencies at once
```bash
cd backend
npm install
echo "✓ Dependencies installed"
npm start
```

### Reset database
```bash
rm -f goldrates.db
npm start
# Database recreates with empty tables
```

---

## 🔐 Gmail Email Setup

### 1. Get App Password from Gmail

```
1. Go to https://myaccount.google.com/apppasswords
2. Select: Mail + Windows Computer
3. Google generates 16-character password
4. Copy it (spaces included)
```

### 2. Create .env file

```bash
cat > backend/.env << 'EOF'
PORT=5000
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx
JWT_SECRET=SuperSecretKeyChangeInProduction123!
DATABASE_URL=./goldrates.db
EOF
```

### 3. Test Email

```bash
# Quick test from terminal
node -e "
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  service: 'gmail',
  auth: { 
    user: 'YOUR_EMAIL@gmail.com', 
    pass: 'YOUR_APP_PASSWORD' 
  }
});
t.sendMail({
  from: 'YOUR_EMAIL@gmail.com',
  to: 'test@test.com',
  subject: 'Test',
  text: 'Email works!'
}, (e, i) => e ? console.log('❌ Failed:', e) : console.log('✅ Sent!'));
"
```

---

## 🧮 Calculator Usage

### Open calculator programmatically
```javascript
// In browser console
openCalculator()
```

### Calculate price directly
```javascript
// Manual calculation
const weight = 10;  // grams
const rate = 7200;  // per gram
const making_percent = 12;  // percentage

const goldCost = weight * rate;
const makingCost = (goldCost * making_percent) / 100;
const total = goldCost + makingCost;

console.log(`Gold: ₹${goldCost}, Making: ₹${makingCost}, Total: ₹${total}`);
```

### Via API
```javascript
const calculate = async (weight, rate, making) => {
  const res = await fetch('http://localhost:5000/api/calculate-price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weight, rate, making_percent: making })
  });
  return res.json();
};

// Usage
calculate(10, 7200, 12).then(data => {
  console.log(`Total: ₹${data.total}`);
});
```

---

## 📸 Review & Photo Upload

### Submit review with photo
```javascript
const submitReviewWithPhoto = async (jewellerID, name, email, stars, text, photoFile) => {
  const formData = new FormData();
  formData.append('jeweller_id', jewellerID);
  formData.append('reviewer_name', name);
  formData.append('reviewer_email', email);
  formData.append('stars', stars);
  formData.append('text', text);
  formData.append('verified_purchase', 1);
  if (photoFile) formData.append('photo', photoFile);

  const res = await fetch('http://localhost:5000/api/reviews', {
    method: 'POST',
    body: formData
  });
  
  return res.json();
};

// Usage
const fileInput = document.querySelector('input[type="file"]');
submitReviewWithPhoto(1, 'John Doe', 'john@example.com', 5, 'Great!', fileInput.files[0])
  .then(data => console.log('Review submitted!'));
```

### Load reviews
```javascript
const loadReviews = async (jewellerID) => {
  const res = await fetch(`http://localhost:5000/api/reviews/${jewellerID}`);
  const reviews = await res.json();
  
  reviews.forEach(r => {
    console.log(`${r.reviewer_name}: ${'★'.repeat(r.stars)}`);
    if (r.photo_url) console.log(`Photo: ${r.photo_url}`);
  });
};

loadReviews(1);
```

---

## 🔔 Email Alerts

### Subscribe to price alert
```javascript
const subscribeAlert = async (email, jewellerID, targetPrice) => {
  const res = await fetch('http://localhost:5000/api/alerts/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      jeweller_id: jewellerID,
      threshold_price: targetPrice,
      alert_type: 'price_drop'
    })
  });
  return res.json();
};

// Usage
subscribeAlert('user@example.com', 1, 7100)
  .then(data => console.log('Alert set!'));
```

### Check alerts in database
```bash
# Connect to database
sqlite3 backend/goldrates.db

# View all subscribed alerts
SELECT email, jeweller_id, threshold_price, active FROM alerts;

# Exit
.exit
```

---

## 🔐 Jeweller Authentication

### Register new jeweller
```javascript
const registerJeweller = async (name, symbol, email, password, phone, area) => {
  const res = await fetch('http://localhost:5000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, symbol, email, password, phone, area
    })
  });
  return res.json();
};

// Usage
registerJeweller(
  'My Jewels', 'MJW', 'myjewels@example.com', 'SecurePass123', 
  '+91 98765 12345', 'Downtown'
)
.then(data => {
  console.log('Registered! Token:', data.token);
  localStorage.setItem('token', data.token);
});
```

### Login as jeweller
```javascript
const loginJeweller = async (email, password) => {
  const res = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return res.json();
};

// Usage
loginJeweller('jeweller@example.com', 'password123')
  .then(data => {
    localStorage.setItem('token', data.token);
    console.log('Logged in! Welcome,', data.user.name);
  });
```

### Update jeweller rates
```javascript
const updateRates = async (jewellerID, r22g, r24g, making, token) => {
  const res = await fetch(`http://localhost:5000/api/jewellers/${jewellerID}/rates`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ r22g, r24g, making })
  });
  return res.json();
};

// Usage
const token = localStorage.getItem('token');
updateRates(1, 7250, 7900, 12, token)
  .then(data => console.log('Rates updated!'));
```

---

## ✓ Partner Verification

### Verify a jeweller (admin only)
```javascript
const verifyJeweller = async (jewellerID, certificateURL, businessReg, token) => {
  const res = await fetch('http://localhost:5000/api/jewellers/verify', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      jeweller_id: jewellerID,
      certificate_url: certificateURL,
      business_reg: businessReg
    })
  });
  return res.json();
};

// Usage
verifyJeweller(1, 'https://example.com/cert.pdf', 'GSTIN123456', adminToken)
  .then(data => console.log('Jeweller verified!'));
```

### Get verified jewellers
```javascript
const getVerifiedJewellers = async () => {
  const res = await fetch('http://localhost:5000/api/jewellers/verified');
  return res.json();
};

getVerifiedJewellers().then(jewellers => {
  console.log(`${jewellers.length} verified jewellers`);
});
```

---

## 🗄️ Database Operations

### View database with SQLite
```bash
# Connect
sqlite3 backend/goldrates.db

# Show all tables
.tables

# View jewellers
SELECT id, name, symbol, r22g, r24g, verified FROM jewellers;

# View reviews for jeweller 1
SELECT * FROM reviews WHERE jeweller_id = 1;

# View price history
SELECT * FROM price_history ORDER BY recorded_at DESC LIMIT 10;

# View active alerts
SELECT * FROM alerts WHERE active = 1;

# Exit
.exit
```

### Export data to CSV
```bash
sqlite3 backend/goldrates.db

# Jewellers to CSV
.mode csv
.output jewellers.csv
SELECT * FROM jewellers;

# Reviews to CSV
.output reviews.csv
SELECT * FROM reviews;

.quit
```

---

## 🎨 Frontend Customization

### Add calculator button to table
```javascript
// In renderTable(), after creating <tr>:

const actionCell = document.createElement('td');
actionCell.innerHTML = `
  <button onclick="openCalculator()" class="calc-btn">🧮 Calc</button>
  <button onclick="openAlert(${j.id})" class="calc-btn">🔔 Alert</button>
`;
tr.appendChild(actionCell);
```

### Change alert check interval
Edit `/backend/server.js`:
```javascript
// Current: 30 minutes
setInterval(checkAndEmailAlerts, 30 * 60 * 1000);

// Change to 15 minutes
setInterval(checkAndEmailAlerts, 15 * 60 * 1000);

// Change to 1 hour
setInterval(checkAndEmailAlerts, 60 * 60 * 1000);
```

### Increase max photo size
Edit `/backend/server.js`:
```javascript
// Current: 5MB
limits: { fileSize: 5 * 1024 * 1024 }

// Change to 10MB
limits: { fileSize: 10 * 1024 * 1024 }

// Change to 20MB
limits: { fileSize: 20 * 1024 * 1024 }
```

---

## ⚡ Performance Optimization

### Minify CSS & JS
```bash
# Install tools
npm install

# Minify
npm run optimize

# Check output
ls -la *.min.* | awk '{print $9, $5}'
```

### Test performance
```bash
# Run Lighthouse in DevTools
Chrome → F12 → Lighthouse → Analyze page load

# Quick CLI test (requires lighthouse CLI)
npm install -g lighthouse
lighthouse http://localhost:8000 --view
```

### Check cached files
```javascript
// In browser console
caches.keys().then(names => {
  names.forEach(name => {
    caches.open(name).then(cache => {
      cache.keys().then(requests => {
        console.log(`Cache "${name}":`, requests.length, 'files');
      });
    });
  });
});
```

---

## 🐛 Debugging

### Check API requests
```javascript
// Enable logging in features.js
const API_URL = 'http://localhost:5000';

// Or add to fetch calls
.then(r => {
  console.log('Response:', r.status, r.statusText);
  return r.json();
})
```

### Monitor Service Worker
```javascript
// Check registration
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Service Workers:', regs.length);
  regs.forEach(r => console.log(r));
});
```

### View backend logs
```bash
# Terminal shows all requests/errors
npm start

# Look for:
# ✅ Route hits
# ❌ Errors
# 📧 Email sent logs
```

### Check browser console
```javascript
// F12 → Console for:
// - Network errors
// - JavaScript errors
// - API responses
// - Cache status
```

---

## 📦 Deployment Commands

### Deploy backend to Heroku
```bash
cd backend
git init
git add .
git commit -m "Initial commit"
heroku login
heroku create my-goldrates-backend
git push heroku main
heroku config:set EMAIL_USER=your@gmail.com
heroku config:set EMAIL_PASS=yourapppassword
heroku config:set JWT_SECRET=your-secret-key
```

### Deploy frontend to Vercel
```bash
npm i -g vercel
vercel login
vercel

# Update API_URL to production backend in features.js
const API_URL = 'https://my-goldrates-backend.herokuapp.com';
```

---

## 🎯 Quick Tests

### API Health Check
```bash
curl http://localhost:5000/api/jewellers | head -c 100
```

### Calculator Works
```bash
curl -X POST http://localhost:5000/api/calculate-price \
  -H "Content-Type: application/json" \
  -d '{"weight":10,"rate":7200,"making_percent":12}'
```

### Review Upload Simulation
```bash
# Create test image
echo "fake image" > test.jpg

# Upload review with photo
curl -X POST http://localhost:5000/api/reviews \
  -F "jeweller_id=1" \
  -F "reviewer_name=Test User" \
  -F "reviewer_email=test@test.com" \
  -F "stars=5" \
  -F "text=Great!" \
  -F "verified_purchase=1" \
  -F "photo=@test.jpg"
```

---

**Save this file for quick reference! 🚀**
