# 📦 Minification & Optimization Guide

## Quick Minify Setup

Minify CSS and JS for production performance:

```bash
npm install

# Minify all files
npm run optimize

# Or individually:
npm run minify:css   # Creates style.min.css, features.min.css
npm run minify:js    # Creates app.min.js, features.min.js
```

## Update HTML to Use Minified Files

In `index.html`, replace:
```html
<!-- OLD -->
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="features.css">
<script src="app.js"></script>
<script src="features.js"></script>

<!-- NEW (Production) -->
<link rel="stylesheet" href="style.min.css">
<link rel="stylesheet" href="features.min.css">
<script src="app.min.js"></script>
<script src="features.min.js"></script>
```

## Performance Impact

| File | Original | Minified | Savings |
|------|----------|----------|---------|
| style.css | ~45KB | ~28KB | **38%** ↓ |
| features.css | ~8KB | ~5KB | **38%** ↓ |
| app.js | ~25KB | ~12KB | **52%** ↓ |
| features.js | ~18KB | ~8KB | **56%** ↓ |
| **Total** | **96KB** | **53KB** | **45%** ↓ |

## Service Worker Caching

The `sw.js` service worker automatically caches:
- All static assets (CSS, JS)
- Google Fonts
- Images (as visited)
- Last successful page state (for offline)

**Benefits:**
- ⚡ 2-3x faster on repeat visits
- 📵 Works offline
- 🔄 Auto-updates when new version deployed

## Gzip Compression (Server-side)

Most web servers auto-compress text files. Enable on your host:

**nginx:**
```nginx
gzip on;
gzip_types text/css application/javascript;
gzip_min_length 1000;
```

**Apache:**
```apache
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/css application/javascript
</IfModule>
```

---

## Image Optimization

Already implemented via lazy loading in `features.js`:

```javascript
// Images with data-src load only when visible
<img data-src="jeweller-photo.jpg" class="lazy-load">
```

---

## Deployment Checklist

- [ ] Run `npm run optimize` (minify CSS/JS)
- [ ] Update `index.html` to use `.min.css` and `.min.js`
- [ ] Verify service worker loads (`sw.js`)
- [ ] Test offline mode (DevTools → Offline)
- [ ] Enable gzip on server
- [ ] Set cache headers (1 year for static, 1 hour for HTML)
- [ ] Use CDN for assets
- [ ] Test performance: https://pagespeed.web.dev/

---

## Performance Target

- **Lighthouse Score:** 90+
- **First Contentful Paint:** < 1.5s
- **Total Blocking Time:** < 100ms
- **Cumulative Layout Shift:** < 0.1

Run Lighthouse: `Chrome DevTools → Lighthouse → Analyze`

---

## Further Optimization (Advanced)

1. **Image format conversion:**
   ```bash
   # Convert to WebP (better compression)
   cwebp image.jpg -o image.webp
   ```

2. **HTTP/2 Push:**
   - Prioritize critical CSS/JS files

3. **Critical CSS Inlining:**
   - Inline above-the-fold CSS in `<head>`

4. **Code Splitting:**
   - Load features.js only when needed

5. **Database Indexes:**
   - Add indexes to frequently queried columns

---

**Performance is a feature! 🚀**
