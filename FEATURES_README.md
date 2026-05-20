# 🏆 Ahmedabad Gold & Silver Rates — Full Feature Implementation

## 📋 Features Added

### 1. **Price Calculator** ✅
- Select any jeweller
- Input weight in grams
- Choose 22K or 24K karat
- Auto-calculates gold cost + making charges
- Shows total cost instantly

**API Endpoint:**
```
POST /api/calculate-price
Body: { weight, rate, making_percent }
Response: { gold_cost, making_cost, total }
```

### 2. **Reviews with Photo Upload** ✅
- Upload photos with reviews (5MB max)
- Star ratings (1-5)
- Verified purchase badge
- Photo gallery for each jeweller
- All reviews stored with timestamps

**API Endpoints:**
```
POST /api/reviews (multipart/form-data)
GET /api/reviews/:jeweller_id
```

### 3. **Email Alerts for Price Drops** ✅
- Subscribe to price drop alerts
- Set custom threshold price
- Email notifications when rates drop
- Auto-runs every 30 minutes

**API Endpoint:**
```
POST /api/alerts/subscribe
Body: { email, jeweller_id, threshold_price }
```

### 4. **Partner Verification Program** ✅
- Jeweller verification status tracking
- Certificate/authentication storage
- Business registration validation
- Verified badge for trusted jewellers

**API Endpoint:**
```
POST /api/jewellers/verify
Body: { jeweller_id, certificate_url, business_reg }
```

### 5. **Jeweller Registration & Login** ✅
- Secure JWT-based authentication
- Password hashing with bcrypt
- Update rates functionality

**API Endpoints:**
```
POST /api/auth/register
POST /api/auth/login
POST /api/jewellers/:id/rates
```

### 6. **Lazy Loading & Caching** ✅
- Service Worker for offline support
- Cache static assets
- Network-first fallback
- Automatic image lazy loading

**File:** `sw.js`

### 7. **Performance Optimizations** ✅
- Minified CSS/JS ready
- Service Worker caching
- CDN-ready font loading
- Optimized database queries

---

## 🚀 Backend Setup Instructions

### Prerequisites
- Node.js (v14+)
- npm or yarn

### Installation

```bash
cd backend
npm install
```

### Configuration

Create a `.env` file in the backend directory:

```
PORT=5000
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-app-password
JWT_SECRET=your_super_secret_key_change_this_in_production
DATABASE_URL=./goldrates.db
```

**For Gmail Email Alerts:**
1. Enable 2-factor authentication in Gmail
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the 16-character password in `.env`

### Run Backend

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

Server will run on `http://localhost:5000`

---

## 🎨 Frontend Setup

### 1. Include New Files

Add to `index.html` in the `<head>`:
```html
<link rel="stylesheet" href="features.css">
```

Add before `</body>`:
```html
<script src="features.js"></script>
```

### 2. Add Modals to HTML

Copy content from `modals-new.html` and paste into your main `index.html` body, or include:
```html
<!-- Load modals via fetch -->
<script>
  fetch('modals-new.html')
    .then(r => r.text())
    .then(html => document.body.insertAdjacentHTML('beforeend', html));
</script>
```

### 3. Update Jeweller Links

Add action buttons in your table by modifying `renderTable()`:

```javascript
// After creating each <tr>, add:
addActionButtons(tr, jeweller);
```

---

## 📱 API Usage Examples

### Calculate Price
```javascript
fetch('http://localhost:5000/api/calculate-price', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    weight: 10,
    rate: 7200,
    making_percent: 12
  })
})
.then(r => r.json())
.then(data => console.log(data));
// { gold_cost: 72000, making_cost: 8640, total: 80640 }
```

### Submit Review with Photo
```javascript
const formData = new FormData();
formData.append('jeweller_id', 1);
formData.append('reviewer_name', 'John Doe');
formData.append('stars', 5);
formData.append('text', 'Great service!');
formData.append('photo', fileInput.files[0]);
formData.append('verified_purchase', 1);

fetch('http://localhost:5000/api/reviews', {
  method: 'POST',
  body: formData
});
```

### Subscribe to Price Alert
```javascript
fetch('http://localhost:5000/api/alerts/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    jeweller_id: 1,
    threshold_price: 7100
  })
});
```

---

## 📊 Database Schema

### jewellers
- `id` - Primary key
- `name` - Jeweller name
- `symbol` - Trading symbol
- `email` - Login email
- `password` - Hashed password
- `phone` - Contact number
- `area` - Location area
- `verified` - Verification status (0/1)
- `certificate_url` - Certificate storage
- `business_reg` - Business registration
- `r22g, r24g` - Current rates
- `making` - Making percentage
- `updated` - Last update time

### reviews
- `jeweller_id` - Foreign key to jewellers
- `reviewer_name, reviewer_email` - User info
- `stars` - Rating 1-5
- `text` - Review content
- `photo_url` - Photo storage path
- `verified_purchase` - Verification badge
- `date` - Timestamp

### price_history
- Tracks all rate changes over time
- For trend analysis and charts

### alerts
- `email` - Subscriber email
- `jeweller_id` - Which jeweller to watch
- `threshold_price` - Alert trigger price
- `active` - Alert status

---

## 🔐 Security Features

✅ Password hashing with bcrypt
✅ JWT token authentication
✅ Email validation
✅ CORS protection
✅ File upload restrictions (5MB, images only)
✅ SQL injection prevention
✅ XSS protection (sanitized inputs)

---

## 📈 Future Enhancements

- [ ] Price trend charts
- [ ] Mobile app (React Native)
- [ ] WhatsApp alerts
- [ ] SMS notifications
- [ ] Admin dashboard
- [ ] Analytics & insights
- [ ] Bulk jeweller import
- [ ] API rate limiting
- [ ] Two-factor authentication
- [ ] Payment integration

---

## 🐛 Troubleshooting

### Email alerts not working?
- Check `.env` EMAIL_USER and EMAIL_PASS
- Verify Gmail App Password is set correctly
- Check server logs: `npm run dev`

### Reviews not loading?
- Ensure backend is running: `npm start` in `/backend`
- Check CORS is enabled in server.js
- Verify API_URL in features.js matches your backend port

### Photos not uploading?
- Ensure `/backend/uploads` directory exists
- Check file size (max 5MB)
- Verify image format (jpeg, jpg, png, webp)

### Database errors?
- Delete `goldrates.db` to reset
- Ensure `sqlite3` is installed: `npm install sqlite3`

---

## 📞 Support

For issues or questions, check:
1. Backend console logs: `npm run dev`
2. Browser DevTools (F12) → Network tab
3. Database: `sqlite3 goldrates.db .tables`

---

**Version:** 1.0.0
**Last Updated:** May 17, 2026
