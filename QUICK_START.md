# 🚀 Quick Start Guide — New Features Implementation

## ✅ What's Been Added

You now have a **full-stack gold rates platform** with:

1. ✨ **Price Calculator** — Calculate total cost for any weight/karat
2. 📸 **Photo Reviews** — Upload photos with reviews  
3. 🔔 **Email Alerts** — Get notified when prices drop
4. ✓ **Partner Verification** — Badge trusted jewellers
5. 🔐 **Jeweller Auth** — Secure login for rate updates
6. ⚡ **Performance** — Offline support, caching, lazy loading

---

## 📦 Installation Steps

### Step 1: Install Backend Dependencies

```bash
cd backend
npm install
```

This installs:
- Express.js (web server)
- SQLite3 (database)
- Nodemailer (emails)
- JWT (authentication)
- Multer (file uploads)

### Step 2: Configure Email Alerts (Optional but Recommended)

If you want email notifications working:

1. **Enable Gmail App Passwords:**
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer"
   - Copy the 16-character password

2. **Create `.env` file** in `/backend`:
   ```
   PORT=5000
   EMAIL_USER=your-gmail@gmail.com
   EMAIL_PASS=xxxx xxxx xxxx xxxx
   JWT_SECRET=any-random-secret-key
   DATABASE_URL=./goldrates.db
   ```

### Step 3: Start the Backend Server

```bash
# From /backend directory
npm start
```

You should see:
```
🚀 Server running on http://localhost:5000
✓ Connected to SQLite database
✓ Database tables initialized
```

### Step 4: Open Your Website

Open `index.html` in your browser (or run a local server):

```bash
# From root directory, in a new terminal:
python3 -m http.server 8000
# or
npx http-server
```

Visit: `http://localhost:8000`

---

## 🎯 Feature Usage

### 💰 Price Calculator

1. Look for **"🧮 Calc"** button in the rates table
2. Click to open calculator
3. Select jeweller → Enter weight → Choose 22K/24K
4. Click **"Calculate"** → See total cost breakdown

### 📸 Reviews & Photos

1. Click any jeweller's **star rating** or **"No reviews"**
2. Add your review:
   - Enter name & email
   - Click stars to rate (1-5)
   - Write review text
   - **Upload photo** (optional)
   - Check "Verified Buyer" if applicable
3. Click **"Submit Review"**
4. Photos appear in review gallery

### 🔔 Price Alerts

1. Click **"🔔 Alert"** button next to jeweller
2. Enter your email
3. Set target price (you'll get alert when price drops)
4. Click **"Set Alert"**
5. **Check your email** in ~30 minutes if price drops

### 🔐 Jeweller Login

1. Click **"Jeweller Login"** in header
2. Use any credentials from the table (or register new)
3. Update rates → Changes reflected in live table

---

## 📁 File Structure

```
goldrates/
├── index.html              # Main page
├── app.js                  # Core app logic
├── style.css               # Main styles
│
├── features.js             # NEW: Calculator, reviews, alerts
├── features.css            # NEW: Feature styles
├── modals-new.html         # NEW: Feature modals
├── sw.js                   # NEW: Service worker (offline)
│
├── backend/
│   ├── package.json        # Dependencies
│   ├── server.js           # Express server
│   ├── .env                # Config (create this)
│   ├── goldrates.db        # Database (auto-created)
│   └── uploads/            # Photo storage
│
└── FEATURES_README.md      # Full documentation
```

---

## 🧪 Test the Features

### Test Calculator
```javascript
// In browser console:
openCalculator()
```

### Test Reviews
```javascript
// In browser console:
openReview(1)  // Opens review modal for jeweller ID 1
```

### Test Email Alert
```javascript
// In browser console:
openAlert(1)   // Opens alert modal for jeweller ID 1
```

---

## 🔧 Troubleshooting

### **"API connection failed" error?**
- ✅ Backend running? → `npm start` in `/backend`
- ✅ Port 5000 available? → Check with `lsof -i :5000`
- ✅ CORS error? → Already enabled in server.js

### **Reviews/photos not saving?**
- Check browser console (F12)
- Check backend console logs
- Ensure `/backend/uploads/` directory exists

### **Email alerts not working?**
- Email config wrong? → Check `.env` file
- Gmail App Password set? → https://myaccount.google.com/apppasswords
- Alerts check every 30 min → Wait and check email

### **Database issues?**
- Delete `goldrates.db` → Will auto-recreate on restart
- Corrupted tables? → `rm goldrates.db && npm start`

---

## 📊 API Endpoints Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/calculate-price` | Calculate total cost |
| POST | `/api/reviews` | Submit review with photo |
| GET | `/api/reviews/:id` | Get reviews for jeweller |
| POST | `/api/alerts/subscribe` | Subscribe to price alerts |
| POST | `/api/auth/register` | Register as jeweller |
| POST | `/api/auth/login` | Jeweller login |
| POST | `/api/jewellers/:id/rates` | Update jeweller rates |

---

## 🎨 Customize

### Change Alert Check Interval
Edit `/backend/server.js` line ~140:
```javascript
setInterval(checkAndEmailAlerts, 30 * 60 * 1000); // Change 30 to other minutes
```

### Change Max Photo Size
Edit `/backend/server.js` line ~65:
```javascript
limits: { fileSize: 10 * 1024 * 1024 }, // Change 5 to 10 MB
```

### Add More Jewellers
Edit `/app.js` and add to the `J` array

---

## 🚀 Production Deployment

When you're ready to deploy:

1. **Backend to Heroku/Railway:**
   - Add `Procfile`: `web: npm start`
   - Push to git
   - Set environment variables

2. **Frontend to Vercel/Netlify:**
   - Connect GitHub repo
   - Build: `npm run build`
   - Deploy

3. **Database Migration:**
   - Use PostgreSQL instead of SQLite
   - Update connection string in `.env`

---

## 💡 Next Steps (Optional)

- [ ] Add price history charts
- [ ] Create admin dashboard
- [ ] Mobile app (React Native)
- [ ] WhatsApp notifications
- [ ] Payment integration
- [ ] SMS alerts

---

## 📞 Need Help?

1. **Check console logs** → F12 → Console tab
2. **Check backend logs** → Terminal running `npm start`
3. **Review full docs** → See `FEATURES_README.md`

---

**Happy tracking! 🎉**

*Last updated: May 17, 2026*
