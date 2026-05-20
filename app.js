/* =========================================================
   AHMEDABAD GOLD & SILVER RATES — app.js
   Smart Sort: Cheapest First → Most Trusted within tier
   Verified Review System: Photo Required → Pending → Approved
   ========================================================= */

// Auto-detect backend URL so it works whether you open via Live Server
// (127.0.0.1:5500), file://, or any other origin.
const API_BASE = 'http://127.0.0.1:4000';

/* Jeweller dataset (J) and silver scaled dataset (JS) are defined in data.js,
   which must be loaded before this file in index.html. */

/* ─── STATE ─────────────────────────────────────────────── */
let metal        = 'gold';
let curSort      = 'smart';   // 'smart' | 'cheap' | 'pricey' | 'trust' | 'making'
let curUser      = null;
let activeRevId  = null;
let pickedStars  = 0;
let pendingPhoto = null;       // base64 of uploaded photo

/* ─── HELPERS ───────────────────────────────────────────── */
function D()    { return metal === 'gold' ? J : JS; }
function fmt(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }

/* Trust score — only count APPROVED reviews */
function ts(j) {
  const approved = (j.reviews || []).filter(r => r.status === 'approved');
  if (!approved.length) return null;
  const avg = approved.reduce((s, r) => s + r.stars, 0) / approved.length;
  return { avg: Math.round(avg * 10) / 10, n: approved.length };
}

function stars(n) {
  return Array.from({ length: 5 }).map((_, i) =>
    `<span style="color:${i < Math.round(n) ? 'var(--acc)' : '#2a3a50'};font-size:13px">★</span>`
  ).join('');
}

/* ─── SMART SORT ALGORITHM ──────────────────────────────────
   Priority 1 — Cheapest is always king (80% weight)
   Priority 2 — Within ₹50/10g price tier, most trusted wins
   Last rows  — Most expensive + least trusted (low reviews/stars)
   ─────────────────────────────────────────────────────────── */
function smartSort(a, b) {
  const TIER_SIZE = 50; // ₹50 per 10g = same "tier"

  const priceA = a.r22g * 10;
  const priceB = b.r22g * 10;

  const tierA = Math.floor(priceA / TIER_SIZE);
  const tierB = Math.floor(priceB / TIER_SIZE);

  // Different price tiers → cheaper always wins
  if (tierA !== tierB) return tierA - tierB;

  // SAME tier → decide by trust
  const tA = ts(a), tB = ts(b);

  // Both have no reviews → maintain original order
  if (!tA && !tB) return 0;
  // No reviews → go below reviewed ones
  if (!tA) return 1;
  if (!tB) return -1;

  // Both have reviews → highest avg first; tie-break: more reviews first
  if (tB.avg !== tA.avg) return tB.avg - tA.avg;
  return tB.n - tA.n;
}

/* ─── TOGGLE ────────────────────────────────────────────── */
function toggleMetal() {
  metal = metal === 'gold' ? 'silver' : 'gold';
  const sil = metal === 'silver';
  document.getElementById('metalBar').classList.toggle('sil-on', sil);
  document.getElementById('lblGold').style.opacity   = sil ? .38 : 1;
  document.getElementById('lblSilver').style.opacity = sil ? 1 : .38;
  document.getElementById('mMode').textContent       = 'Viewing: ' + (sil ? 'Silver' : 'Gold') + ' Rates';
  document.getElementById('metalWord').textContent   = (sil ? 'Silver' : 'Gold') + ' Rates · Live';
  document.getElementById('mcxLbl').textContent      = 'MCX ' + (sil ? 'Silver' : 'Gold') + ' Base Rate (10g)';
  document.getElementById('mcxPrice').textContent    = '…';
  document.getElementById('mcxChg').textContent      = '● fetching live';
  document.getElementById('mcxChg').className        = 'mcx-chg';
  document.getElementById('tickerLbl').textContent   = sil ? 'MCX Silver' : 'MCX Gold';
  window.dispatchEvent(new Event('metal-changed'));
  const r = document.documentElement.style;
  if (sil) {
    r.setProperty('--acc', '#A8B8CC'); r.setProperty('--acc3', '#C8D8E8');
    r.setProperty('--acc-dim', 'rgba(168,184,204,0.13)'); r.setProperty('--acc-border', 'rgba(168,184,204,0.22)');
  } else {
    r.setProperty('--acc', '#D4AF37'); r.setProperty('--acc3', '#F0CC60');
    r.setProperty('--acc-dim', 'rgba(212,175,55,0.12)'); r.setProperty('--acc-border', 'rgba(212,175,55,0.2)');
  }
  buildTicker();
  renderTable();
}

/* ─── TICKER ────────────────────────────────────────────── */
function buildTicker() {
  const items = D().map(j =>
    `<span class="t-item"><strong>${j.sym}</strong> 22K ${fmt(j.r22g * 10)} <span class="up">▲ ₹${Math.floor(Math.random() * 80 + 10)}</span></span>`
  ).join('');
  document.getElementById('tickerTrack').innerHTML = items + items;
}

/* ─── TABLE RENDER ──────────────────────────────────────── */
function setSort(btn, s) {
  document.querySelectorAll('.sb').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  curSort = s;
  renderTable();
}

function populateAreaFilter() {
  const sel = document.getElementById('fltArea');
  if (!sel || sel.options.length > 1) return; // already populated
  const areas = [...new Set(J.map(j => j.area))].sort();
  areas.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    sel.appendChild(opt);
  });
}

function clearFilters() {
  document.getElementById('srchInput').value   = '';
  document.getElementById('fltArea').value     = '';
  document.getElementById('fltMaking').value   = '';
  document.getElementById('fltMaxPrice').value = '';
  document.getElementById('fltTrusted').checked = false;
  renderTable();
}

function renderTable() {
  populateAreaFilter();
  let d = [...D()];
  const total = d.length;
  const q = document.getElementById('srchInput').value.toLowerCase();
  if (q) d = d.filter(j => j.name.toLowerCase().includes(q) || j.sym.toLowerCase().includes(q) || j.area.toLowerCase().includes(q));

  /* ── EXTRA FILTERS ── */
  const area     = document.getElementById('fltArea')?.value || '';
  const making   = document.getElementById('fltMaking')?.value || '';
  const maxPrice = parseFloat(document.getElementById('fltMaxPrice')?.value);
  const trusted  = document.getElementById('fltTrusted')?.checked;

  if (area)               d = d.filter(j => j.area === area);
  if (making === 'low')   d = d.filter(j => j.making <= 9);
  if (making === 'med')   d = d.filter(j => j.making >= 10 && j.making <= 11);
  if (making === 'high')  d = d.filter(j => j.making >= 12);
  if (!isNaN(maxPrice))   d = d.filter(j => j.r22g <= maxPrice);
  if (trusted)            d = d.filter(j => (j.reviews || []).some(r => r.status === 'approved'));

  const countEl = document.getElementById('fltCount');
  if (countEl) countEl.innerHTML = d.length < total
    ? `Showing <strong>${d.length}</strong> of ${total} jewellers`
    : `Showing all <strong>${total}</strong> jewellers`;

  /* ── SORT ── */
  if (curSort === 'smart') {
    d.sort(smartSort);
  } else if (curSort === 'cheap') {
    d.sort((a, b) => a.r22g - b.r22g);
  } else if (curSort === 'pricey') {
    d.sort((a, b) => b.r22g - a.r22g);
  } else if (curSort === 'making') {
    d.sort((a, b) => a.making - b.making);
  } else if (curSort === 'trust') {
    d.sort((a, b) => {
      const ta = ts(a), tb = ts(b);
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return tb.avg - ta.avg || tb.n - ta.n;
    });
  }

  /* ── STATS ── */
  const allR = D().map(j => j.r22g * 10);
  const mn = Math.min(...allR), mx = Math.max(...allR);
  document.getElementById('stLow').textContent  = fmt(mn);
  document.getElementById('stHigh').textContent = fmt(mx);
  document.getElementById('stAvg').textContent  = fmt(Math.round(allR.reduce((a, b) => a + b, 0) / allR.length));

  const lowR = d.length ? Math.min(...d.map(j => j.r22g * 10)) : mn;
  const hiR  = d.length ? Math.max(...d.map(j => j.r22g * 10)) : mx;

  /* ── ROWS ── */
  document.getElementById('rateBody').innerHTML = d.map((j, i) => {
    const r22t = j.r22g * 10, r24t = j.r24g * 10;
    const cheap  = r22t === lowR;
    const pricey = r22t === hiR && lowR !== hiR;
    const mkC    = j.making <= 9 ? 'mk-lo' : j.making <= 11 ? 'mk-md' : 'mk-hi';
    const t      = ts(j);
    const pendingCount = (j.reviews || []).filter(r => r.status === 'pending').length;

    /* Trust cell */
    let tCell;
    if (t) {
      const badge = t.avg >= 4.5
        ? '<span class="trusted-badge">🏆 Top Trusted</span>'
        : t.avg >= 4.0
          ? '<span class="trusted-badge" style="background:rgba(212,175,55,0.15);border-color:rgba(212,175,55,0.3);color:#F0CC60">✓ Trusted</span>'
          : '';
      tCell = `<div class="trust-cell" onclick="openRev(${j.id},event)">
        <div>
          <div style="display:flex;align-items:center;gap:.4rem">${stars(t.avg)}<span class="trust-num">${t.avg}</span><span class="trust-ct">(${t.n})</span></div>
          <div style="margin-top:.2rem">${badge}${pendingCount ? `<span class="pending-badge">⏳ ${pendingCount} pending</span>` : ''}</div>
        </div>
      </div>`;
    } else {
      tCell = `<span class="no-review-link" onclick="openRev(${j.id},event)">
        ${pendingCount ? `<span class="pending-badge">⏳ ${pendingCount} pending</span>` : 'No reviews yet — Be first →'}
      </span>`;
    }

    /* Value score badge (bonus insight) */
    const valueScore = t ? Math.round((t.avg / 5) * 100 - (j.making - 9) * 2) : null;
    const valueBadge = valueScore && valueScore >= 85
      ? '<span class="value-badge">💎 Best Value</span>'
      : '';

    return `<tr class="${cheap ? 'row-cheap' : pricey ? 'row-pricey' : ''}" style="animation-delay:${i * 0.04}s">
      <td>
        <div style="display:flex;align-items:center;gap:.4rem">
          <span class="rank-num">${i + 1}</span>
          ${cheap ? '<span class="badge-lo">↓ Cheapest</span>' : pricey ? '<span class="badge-hi">↑ Priciest</span>' : ''}
        </div>
      </td>
      <td>
        <a href="jeweller.html?id=${j.id}" style="font-weight:600;font-size:14px;color:inherit;text-decoration:none;border-bottom:1px dashed var(--acc-border)">${j.name}</a>
        <button class="wa-share" title="Share on WhatsApp" onclick="shareWhatsApp(${j.id},event)">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </button>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">📍 ${j.area}</div>
        ${valueBadge}
      </td>
      <td><span class="sym-pill">${j.sym}</span></td>
      <td class="mono">${fmt(j.r22g)}</td>
      <td class="mono price-22t" style="color:var(--acc);font-weight:600">${fmt(r22t)}</td>
      <td class="mono">${fmt(j.r24g)}</td>
      <td class="mono">${fmt(r24t)}</td>
      <td><span class="mk ${mkC}">${j.making}%</span></td>
      <td>${tCell}</td>
      <td class="upd">${j.updated}</td>
    </tr>`;
  }).join('');

  /* Pending review count in admin sidebar */
  const totalPending = J.reduce((s, j) => s + (j.reviews || []).filter(r => r.status === 'pending').length, 0);
  const badge = document.getElementById('pendingBadge');
  if (badge) badge.textContent = totalPending > 0 ? totalPending : '';
}

/* ─── REVIEWS MODAL ─────────────────────────────────────── */
function openRev(id, e) {
  if (e) e.stopPropagation();
  activeRevId  = id;
  pickedStars  = 0;
  pendingPhoto = null;

  const j = J.find(x => x.id === id);
  document.getElementById('rmTitle').textContent     = '📋 Reviews — ' + j.name;
  document.getElementById('upPreview').style.display = 'none';
  document.getElementById('revForm').style.display   = 'none';
  document.getElementById('starErr').style.display   = 'none';
  document.getElementById('rName').value             = '';
  document.getElementById('rText').value             = '';
  document.getElementById('photoUp').value           = '';
  document.getElementById('photoUpLabel').textContent= 'Tap to upload purchase photo or receipt';
  document.querySelectorAll('#starPick span').forEach(s => s.classList.remove('lit'));

  renderRevList(j);
  document.getElementById('reviewModal').classList.add('open');
}

function renderRevList(j) {
  const approved = (j.reviews || []).filter(r => r.status === 'approved');
  const pending  = (j.reviews || []).filter(r => r.status === 'pending');

  let html = '';

  if (approved.length) {
    html += approved.map(r => `
      <div class="rev-card">
        <div class="rev-stars">${stars(r.stars)}</div>
        <div class="rev-txt">${r.text}</div>
        ${r.photo ? `<div style="margin:.5rem 0"><img src="${r.photo}" style="width:70px;height:70px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,0.1);cursor:pointer" onclick="window.open(this.src)" title="View full photo"></div>` : ''}
        <div class="rev-meta">
          <span style="color:var(--white);font-weight:500">${r.name}</span>
          <span>${r.date}</span>
          <span class="ver-badge">✓ Verified Purchase</span>
        </div>
      </div>`).join('');
  }

  if (pending.length) {
    html += `<div style="font-size:11px;color:var(--muted);margin:1rem 0 .5rem;letter-spacing:.08em;text-transform:uppercase">⏳ Awaiting Admin Verification (${pending.length})</div>`;
    html += pending.map(r => `
      <div class="rev-card" style="opacity:.6;border-color:rgba(255,150,0,0.2)">
        <div class="rev-stars">${stars(r.stars)}</div>
        <div class="rev-txt">${r.text}</div>
        <div class="rev-meta">
          <span style="color:var(--white)">${r.name}</span>
          <span>${r.date}</span>
          <span style="background:rgba(255,150,0,.12);color:#fb923c;border:1px solid rgba(255,150,0,.25);border-radius:20px;font-size:10px;padding:.15rem .5rem;font-weight:600">⏳ Pending Verification</span>
        </div>
      </div>`).join('');
  }

  if (!approved.length && !pending.length) {
    html = '<div style="font-size:13px;color:var(--muted);text-align:center;padding:1.5rem 0">No reviews yet. Be the first verified buyer!</div>';
  }

  document.getElementById('revList').innerHTML = html;
}

function closeRev() {
  document.getElementById('reviewModal').classList.remove('open');
}

/* ─── PHOTO UPLOAD ──────────────────────────────────────── */
function handlePhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { alert('File too large. Max 8MB.'); return; }

  const reader = new FileReader();
  reader.onload = ev => {
    pendingPhoto = ev.target.result;
    const img = document.getElementById('upPreview');
    img.src = ev.target.result;
    img.style.display = 'block';
    document.getElementById('photoUpLabel').textContent = '✓ Photo uploaded — ';
    document.getElementById('revForm').style.display = 'block';
    // small confirmation pop
    showToast('📸 Photo received! Fill in your review below.', 'success');
  };
  reader.readAsDataURL(file);
}

/* ─── STAR PICKER ───────────────────────────────────────── */
function setStar(n) {
  pickedStars = n;
  document.querySelectorAll('#starPick span').forEach((s, i) => s.classList.toggle('lit', i < n));
}

/* ─── SUBMIT REVIEW ─────────────────────────────────────── */
/* Reviews go to status:'pending' — Admin must approve them */
function submitRev() {
  if (!pickedStars) { document.getElementById('starErr').style.display = 'block'; return; }
  document.getElementById('starErr').style.display = 'none';
  if (!pendingPhoto) { alert('Please upload a photo of your receipt or purchase first.'); return; }

  const j    = J.find(x => x.id === activeRevId);
  const name = document.getElementById('rName').value.trim() || 'Anonymous';
  const text = document.getElementById('rText').value.trim();
  if (!text) { alert('Please write a short review.'); return; }

  const now = new Date();
  j.reviews.unshift({
    name,
    stars:    pickedStars,
    text,
    verified: false,          // becomes true after admin approval
    status:   'pending',      // 'pending' → admin reviews → 'approved' or 'rejected'
    date:     now.getDate() + ' ' + now.toLocaleString('en-IN', { month: 'short' }) + ' ' + now.getFullYear(),
    photo:    pendingPhoto,
  });

  showToast('✅ Review submitted! It will appear after admin verification.', 'success');
  renderRevList(j);
  renderTable();

  // reset form
  document.getElementById('revForm').style.display   = 'none';
  document.getElementById('upPreview').style.display = 'none';
  document.getElementById('rName').value             = '';
  document.getElementById('rText').value             = '';
  document.getElementById('photoUp').value           = '';
  document.getElementById('photoUpLabel').textContent= 'Tap to upload purchase photo or receipt';
  pendingPhoto = null; pickedStars = 0;
  document.querySelectorAll('#starPick span').forEach(s => s.classList.remove('lit'));
}

/* ─── TOAST ─────────────────────────────────────────────── */
function showToast(msg, type) {
  let t = document.getElementById('globalToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'globalToast';
    t.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;font-size:13px;padding:.8rem 1.2rem;border-radius:14px;background:rgba(15,30,56,0.95);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.1);color:#fff;max-width:320px;transform:translateY(80px);opacity:0;transition:all .35s cubic-bezier(.4,0,.2,1)';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.borderColor = type === 'success' ? 'rgba(34,197,94,.4)' : 'rgba(239,68,68,.4)';
  t.style.color       = type === 'success' ? '#4ade80' : '#f87171';
  requestAnimationFrame(() => { t.style.transform = 'translateY(0)'; t.style.opacity = '1'; });
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.transform = 'translateY(80px)'; t.style.opacity = '0'; }, 3500);
}

/* ─── REFRESH ────────────────────────────────────────────── */
function refreshRates() {
  const ic = document.getElementById('spinIcon');
  ic.classList.add('spinning');
  D().forEach(j => { j.r22g += Math.round((Math.random() - .5) * 14); j.r24g = Math.round(j.r22g * 1.09); });
  setTimeout(() => { ic.classList.remove('spinning'); renderTable(); buildTicker(); }, 650);
}

/* ─── NAV ────────────────────────────────────────────────── */
function showPublic()  {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-public').classList.add('active');
}
function showLogin()   {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-login').classList.add('active');
  buildCredsHint('jeweller'); setRoleTab('jeweller');
}
function showJSec(id, el) {
  document.querySelectorAll('#view-jeweller .dash-sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#view-jeweller .nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(id).classList.add('active'); el.classList.add('active');
}
function showASec(id, el) {
  document.querySelectorAll('#view-admin .dash-sec').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#view-admin .nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(id).classList.add('active'); el.classList.add('active');
}

/* ─── LOGIN ─────────────────────────────────────────────── */
let curRole = 'jeweller';
function setRoleTab(r) {
  curRole = r;
  document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.rtab')[r === 'jeweller' ? 0 : 1].classList.add('active');
}
function setRole(r, btn) {
  curRole = r;
  document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  buildCredsHint(r);
  document.getElementById('loginErr').style.display = 'none';
}

function buildCredsHint(role) {
  document.getElementById('credsRows').innerHTML = role === 'admin'
    ? `<tr><td>Admin</td><td class="mono">admin@ahm.com</td><td class="mono">admin123</td></tr>`
    : J.map(j => `<tr><td>${j.sym}</td><td class="mono">${j.email}</td><td class="mono">${j.pass}</td></tr>`).join('');
}

function doLogin() {
  const em = document.getElementById('loginEmail').value.trim();
  const pw = document.getElementById('loginPass').value.trim();
  if (em === 'admin@ahm.com' && pw === 'admin123') {
    document.getElementById('loginErr').style.display = 'none';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-admin').classList.add('active');
    buildAdminPanels(); return;
  }
  const j = J.find(x => x.email === em && x.pass === pw);
  if (j) {
    document.getElementById('loginErr').style.display = 'none';
    curUser = j;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-jeweller').classList.add('active');
    buildJwlDash(j); return;
  }
  document.getElementById('loginErr').style.display = 'block';
}

/* ─── JEWELLER DASH ─────────────────────────────────────── */
function autoC(t) {
  if (t === '22') { const v = parseInt(document.getElementById('f22g').value) || 0; document.getElementById('f22t').value = v * 10; }
  else { const v = parseInt(document.getElementById('f24g').value) || 0; document.getElementById('f24t').value = v * 10; }
}

function buildJwlDash(j) {
  document.getElementById('jwlAvatar').textContent    = j.sym.substring(0, 2);
  document.getElementById('jwlName').textContent      = j.name;
  document.getElementById('jwlRole').textContent      = 'Jeweller · ' + j.sym;
  document.getElementById('jwlWelcome').textContent   = 'Welcome back, ' + j.name;
  document.getElementById('jwlUpdated').textContent   = 'Last updated: ' + j.updated + ' today';
  document.getElementById('ov22g').textContent        = fmt(j.r22g);
  document.getElementById('ov22t').textContent        = fmt(j.r22g * 10);
  document.getElementById('ov24g').textContent        = fmt(j.r24g);
  document.getElementById('ov24t').textContent        = fmt(j.r24g * 10);
  document.getElementById('ovMk').textContent         = j.making + '%';
  const t = ts(j);
  document.getElementById('ovTrust').textContent      = t ? t.avg + '/5 (' + t.n + ' verified)' : 'No approved reviews';
  document.getElementById('f22g').value  = j.r22g; document.getElementById('f22t').value = j.r22g * 10;
  document.getElementById('f24g').value  = j.r24g; document.getElementById('f24t').value = j.r24g * 10;
  document.getElementById('fMk').value   = j.making;
  document.getElementById('pName').value = j.name;  document.getElementById('pEmail').value = j.email;
  document.getElementById('pPhone').value = j.phone; document.getElementById('pArea').value = j.area;

  const rates = J.map(x => x.r22g * 10).sort((a, b) => a - b);
  const rank  = rates.findIndex(r => r >= j.r22g * 10) + 1;
  const mn = rates[0], mx = rates[rates.length - 1], range = mx - mn || 1;
  const pct = Math.round(((j.r22g * 10) - mn) / range * 100);
  document.getElementById('rankViz').innerHTML =
    `<div style="font-size:12px;color:var(--muted);margin-bottom:.45rem">Rank <strong style="color:var(--white)">${rank}</strong> of ${J.length} · <span style="color:var(--acc)">${fmt(j.r22g * 10)}</span></div>
     <div style="height:6px;background:var(--navy3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--acc);border-radius:3px"></div></div>
     <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:.28rem"><span>Cheapest ${fmt(mn)}</span><span>Priciest ${fmt(mx)}</span></div>`;

  document.getElementById('jwlHistBody').innerHTML = Array.from({ length: 15 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    const r22t = (j.r22g * 10) + Math.round((Math.random() - .5) * 320);
    const r24t = (j.r24g * 10) + Math.round((Math.random() - .5) * 350);
    const mk   = j.making;
    return `<tr><td class="mono" style="font-size:11px">${d.toLocaleDateString('en-IN')}</td><td class="mono" style="color:var(--acc)">${fmt(r22t)}</td><td class="mono">${fmt(r24t)}</td><td><span class="mk ${mk <= 9 ? 'mk-lo' : mk <= 11 ? 'mk-md' : 'mk-hi'}">${mk}%</span></td><td class="upd">${['09:30', '10:00', '10:30'][i % 3]} AM</td><td style="font-size:11px;color:var(--muted)">${i === 0 ? 'Festival offer' : ''}</td></tr>`;
  }).join('');

  document.getElementById('jwlDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Pending reviews for this jeweller
  const myPending = (j.reviews || []).filter(r => r.status === 'pending').length;
  const myEl = document.getElementById('ovTrust');
  if (myPending && myEl) myEl.textContent += ` — ${myPending} pending`;
}

function submitUpdate() {
  if (!curUser) return;
  const j  = curUser;
  j.r22g   = parseInt(document.getElementById('f22g').value) || j.r22g;
  j.r24g   = parseInt(document.getElementById('f24g').value) || j.r24g;
  j.making = parseInt(document.getElementById('fMk').value)  || j.making;
  const now = new Date();
  j.updated = now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes() + ' ' + (now.getHours() < 12 ? 'AM' : 'PM');
  const el = document.getElementById('updSuc');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
  buildJwlDash(j); renderTable();
}

/* ─── ADMIN PANELS ──────────────────────────────────────── */
function buildAdminPanels() {
  document.getElementById('admDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const rates = J.map(j => j.r22g * 10);
  document.getElementById('admLow').textContent  = fmt(Math.min(...rates));
  document.getElementById('admHigh').textContent = fmt(Math.max(...rates));

  /* spread viz */
  const sorted = [...J].sort((a, b) => a.r22g - b.r22g);
  const mn = sorted[0].r22g * 10, mx = sorted[sorted.length - 1].r22g * 10, range = mx - mn || 1;
  document.getElementById('spreadViz').innerHTML = sorted.map(j => {
    const p = Math.round(((j.r22g * 10) - mn) / range * 100);
    const isMin = j.r22g * 10 === mn, isMax = j.r22g * 10 === mx;
    const t = ts(j);
    return `<div style="display:flex;align-items:center;gap:.45rem;margin-bottom:5px">
      <span style="font-family:var(--fm);font-size:10px;color:var(--muted);width:28px">${j.sym}</span>
      <div style="flex:1;height:9px;background:var(--navy3);border-radius:4px;overflow:hidden"><div style="height:100%;width:${Math.max(3, p)}%;background:${isMin ? '#22c55e' : isMax ? '#ef4444' : 'var(--acc)'};opacity:.85;border-radius:4px"></div></div>
      <span style="font-family:var(--fm);font-size:10px;color:${isMin ? '#4ade80' : isMax ? '#f87171' : 'var(--muted)'}">${fmt(j.r22g * 10)}</span>
      <span style="font-size:10px;color:var(--muted)">${t ? '★' + t.avg : '—'}</span>
    </div>`;
  }).join('');

  /* jewellers grid */
  document.getElementById('jwlGrid').innerHTML = J.map(j => {
    const t = ts(j);
    return `<div class="jwl-card">
      <div class="jc-sym">${j.sym} <span class="${j.active ? 'tag-on' : 'tag-off'}">${j.active ? 'Active' : 'Disabled'}</span></div>
      <div class="jc-name">${j.name}</div>
      <div class="jc-meta">📍 ${j.area}</div>
      <div class="jc-meta">${j.email}</div>
      <div class="jc-meta">Trust: ${t ? t.avg + '/5 (' + t.n + ' reviews)' : '—'}</div>
      <div class="jc-acts"><button class="jbtn">Edit</button><button class="jbtn dng">Disable</button></div>
    </div>`;
  }).join('');

  /* override select */
  document.getElementById('orJwl').innerHTML = '<option value="">— Choose —</option>' +
    J.map(j => `<option value="${j.id}">${j.name} (${j.sym})</option>`).join('');

  /* history */
  document.getElementById('admHistBody').innerHTML = J.slice(0, 10).map((j, i) => {
    const now = new Date(); now.setMinutes(now.getMinutes() - i * 11);
    const t = now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes() + ' ' + (now.getHours() < 12 ? 'AM' : 'PM');
    return `<tr><td class="upd">${t}</td><td>${j.name} <span class="sym-pill">${j.sym}</span></td><td class="mono" style="color:var(--acc)">${fmt(j.r22g * 10)}</td><td class="mono">${fmt(j.r24g * 10)}</td><td><span class="mk ${j.making <= 9 ? 'mk-lo' : j.making <= 11 ? 'mk-md' : 'mk-hi'}">${j.making}%</span></td><td style="font-size:11px;color:var(--muted)">Self</td></tr>`;
  }).join('');

  /* credentials table */
  document.getElementById('credsAdmBody').innerHTML = J.map((j, i) =>
    `<tr><td>${i + 1}</td><td>${j.name}</td><td class="mono">${j.sym}</td><td class="mono">${j.email}</td><td class="mono">${j.pass}</td><td><span class="${j.active ? 'tag-on' : 'tag-off'}">${j.active ? 'Active' : 'Disabled'}</span></td><td><button class="jbtn btn-sm" onclick="alert('Reset password — connect to backend')">Reset PW</button></td></tr>`
  ).join('');

  buildPendingReviews();
}

/* ─── ADMIN: PENDING REVIEWS ─────────────────────────────── */
function buildPendingReviews() {
  const container = document.getElementById('pendingRevContainer');
  if (!container) return;

  let html = '';
  J.forEach(j => {
    const pList = (j.reviews || []).filter(r => r.status === 'pending');
    pList.forEach((r, ri) => {
      const rIdx = j.reviews.indexOf(r);
      html += `<div class="pending-card" id="pcard-${j.id}-${ri}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem">
          <div>
            <strong>${j.name}</strong> <span class="sym-pill">${j.sym}</span>
            <span style="font-size:10px;color:var(--muted);margin-left:.4rem">${r.date}</span>
          </div>
          <div style="color:#D4AF37;font-size:13px">${stars(r.stars)}</div>
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.85);margin-bottom:.5rem">"${r.text}"</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:.7rem">By: <strong style="color:var(--white)">${r.name}</strong></div>
        ${r.photo ? `<div style="margin-bottom:.75rem"><img src="${r.photo}" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.1);cursor:pointer" onclick="window.open(this.src)" title="Click to view full receipt photo"><div style="font-size:10px;color:var(--green);margin-top:.25rem">📸 Purchase photo attached</div></div>` : '<div style="font-size:10px;color:var(--red);margin-bottom:.6rem">⚠ No photo attached</div>'}
        <div style="display:flex;gap:.6rem">
          <button class="btn btn-acc btn-sm" onclick="approveReview(${j.id},${rIdx})">✓ Approve</button>
          <button class="btn btn-sm" style="border-color:var(--red);color:#f87171" onclick="rejectReview(${j.id},${rIdx})">✕ Reject</button>
        </div>
      </div>`;
    });
  });

  if (!html) html = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:2rem">🎉 No pending reviews right now.</div>';
  container.innerHTML = html;

  const totalPending = J.reduce((s, j) => s + (j.reviews || []).filter(r => r.status === 'pending').length, 0);
  const badge = document.getElementById('pendingBadge');
  if (badge) badge.textContent = totalPending > 0 ? totalPending : '';
}

function approveReview(jid, rIdx) {
  const j = J.find(x => x.id === jid);
  if (!j) return;
  j.reviews[rIdx].status   = 'approved';
  j.reviews[rIdx].verified = true;
  showToast('✅ Review approved and published!', 'success');
  buildPendingReviews(); renderTable();
}

function rejectReview(jid, rIdx) {
  const j = J.find(x => x.id === jid);
  if (!j) return;
  j.reviews.splice(rIdx, 1);
  showToast('🗑 Review rejected and removed.', 'error');
  buildPendingReviews(); renderTable();
}

/* ─── ADMIN: OVERRIDE ────────────────────────────────────── */
function doOverride() {
  const id = parseInt(document.getElementById('orJwl').value);
  if (!id) return alert('Choose a jeweller first');
  const j  = J.find(x => x.id === id);
  j.r22g   = parseInt(document.getElementById('or22g').value) || j.r22g;
  j.r24g   = parseInt(document.getElementById('or24g').value) || j.r24g;
  j.making = parseInt(document.getElementById('orMk').value)  || j.making;
  const now = new Date();
  j.updated = now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes() + ' ' + (now.getHours() < 12 ? 'AM' : 'PM') + ' [Admin]';
  const el = document.getElementById('orSuc'); el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
  renderTable(); buildAdminPanels();
}

/* ─── ANNOUNCEMENTS ──────────────────────────────────────── */
function postAnno()  { const txt = document.getElementById('annoTxt').value.trim(); if (!txt) return; document.getElementById('annoBanner').textContent = '📢 ' + txt; document.getElementById('annoBanner').style.display = 'block'; document.getElementById('curAnno').textContent = txt; }
function clearAnno() { document.getElementById('annoBanner').style.display = 'none'; document.getElementById('curAnno').textContent = 'None'; }

/* ─── EXPORT CSV ─────────────────────────────────────────── */
function exportCSV() {
  const rows = [['Sr', 'Jeweller', 'Symbol', 'Area', '22K/gram', '22K/10g', '24K/gram', '24K/10g', 'Making%', 'Trust Avg', 'Reviews', 'Last Updated']];
  J.forEach((j, i) => {
    const t = ts(j);
    rows.push([i + 1, j.name, j.sym, j.area, j.r22g, j.r22g * 10, j.r24g, j.r24g * 10, j.making + '%', t ? t.avg : '—', t ? t.n : 0, j.updated]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const a   = document.createElement('a');
  a.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'ahm-rates-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
}

/* ─── GREETING ───────────────────────────────────────────── */
function setGreeting() {
  const h   = new Date().getHours();
  const msg = h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
  const el  = document.getElementById('greetingMsg');
  if (el) el.textContent = `✨ ${msg}! Welcome to Ahmedabad's most trusted live rates.`;
}

/* ─── WHATSAPP SHARE ──────────────────────────────────────────
   Opens wa.me with a pre-formatted message about a jeweller's
   current rate. Works on mobile (WhatsApp app) and desktop (web). */
function shareWhatsApp(jewellerId, event) {
  if (event) event.stopPropagation();
  const j = J.find(x => x.id === jewellerId);
  if (!j) return;
  const url  = `${window.location.origin}/jeweller.html?id=${j.id}`;
  const text =
    `💰 *${j.name}* (${j.area}) — today's gold rate in Ahmedabad:\n\n` +
    `• 22K: ₹${j.r22g.toLocaleString('en-IN')}/g  (₹${(j.r22g*10).toLocaleString('en-IN')}/10g)\n` +
    `• 24K: ₹${j.r24g.toLocaleString('en-IN')}/g\n` +
    `• Making: ${j.making}%\n\n` +
    `Check live rates: ${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

/* ─── THEME TOGGLE (light / dark) ─────────────────────────── */
function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
}
function toggleTheme() {
  const next = document.body.classList.contains('light') ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  applyTheme(next);
}
applyTheme(localStorage.getItem('theme') || 'dark');

/* ─── SYNC RATES FROM DB ──────────────────────────────────────
   The J array in data.js holds the initial demo rates. Whenever a
   jeweller updates rates via the dashboard, those land in the DB.
   This fetches the live DB values and overlays them onto J so the
   public table reflects every change. */
async function syncJewellersFromDB() {
  try {
    const res = await fetch(`${API_BASE}/api/jewellers`);
    if (!res.ok) return;
    const rows = await res.json();
    rows.forEach(row => {
      const j = J.find(x => x.id === row.id);
      if (!j) return;
      j.r22g    = row.r22g    ?? j.r22g;
      j.r24g    = row.r24g    ?? j.r24g;
      j.making  = row.making  ?? j.making;
      j.updated = row.updated || j.updated;
    });
    // Recompute the silver mirror so toggling to silver also shows fresh rates
    rows.forEach(row => {
      const js = JS.find(x => x.id === row.id);
      if (!js || row.r22g == null) return;
      js.r22g   = Math.round(row.r22g * 0.012);
      js.r24g   = Math.round(row.r24g * 0.012);
      js.making = Math.max(6, (row.making ?? js.making) - 3);
    });
    renderTable();
    buildTicker();
  } catch (err) {
    console.warn('Sync from DB failed:', err.message);
  }
}

/* ─── LIVE PRICE (GoldAPI.io via /api/live-price) ───────────
   Backend fetches from goldapi.io and caches 15 min, so polling
   here every 60 s is cheap — it only hits the real API ~4×/hr. */
let lastLivePrice10g = null; // remember previous tick to compute change

async function refreshLivePrice() {
  try {
    const res  = await fetch(`${API_BASE}/api/live-price?metal=${metal}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Gold card shows 22K per 10g; silver shows 24K per 10g (silver is sold pure)
    const perGram = metal === 'silver' ? data.price_gram_24k : data.price_gram_22k;
    if (!perGram) return;
    const per10g  = perGram * 10;

    const priceEl = document.getElementById('mcxPrice');
    const chgEl   = document.getElementById('mcxChg');
    if (priceEl) priceEl.textContent = fmt(per10g);

    if (chgEl) {
      if (lastLivePrice10g != null) {
        const diff = per10g - lastLivePrice10g;
        const pct  = (diff / lastLivePrice10g) * 100;
        const up   = diff >= 0;
        chgEl.textContent = (up ? '▲ ₹' : '▼ ₹') + Math.abs(Math.round(diff)) + ' (' + Math.abs(pct).toFixed(2) + '%)';
        chgEl.className   = 'mcx-chg ' + (up ? 'up' : 'dn');
      } else {
        chgEl.textContent = data.fallback ? '— (offline)' : data.cached ? '● live (cached)' : '● live';
        chgEl.className   = 'mcx-chg';
      }
    }
    lastLivePrice10g = per10g;
  } catch (err) {
    console.warn('Live price fetch failed:', err.message);
  }
}

// Refresh whenever metal toggles, and every 60s
window.addEventListener('metal-changed', () => { lastLivePrice10g = null; refreshLivePrice(); });
setInterval(refreshLivePrice, 60_000);

/* ─── INIT ───────────────────────────────────────────────── */
document.getElementById('hdrDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
setGreeting();
buildTicker();
setSort(null, 'smart');
renderTable();
refreshLivePrice();
syncJewellersFromDB();
// Poll DB every 30s so jeweller dashboard updates appear within the minute
setInterval(syncJewellersFromDB, 30_000);

/* ─── PRICE ALERT ─────────────────────────────────────────────
   This function runs when the user clicks "Notify Me →"
   It sends their email + target price to your backend,
   which stores it and sends a confirmation email.
   ─────────────────────────────────────────────────────────── */
async function setAlert() {
  const purity      = document.getElementById('alertPurity').value;
  const targetPrice = parseFloat(document.getElementById('alertPrice').value);
  const email       = document.getElementById('alertEmail').value.trim();
  const msgEl       = document.getElementById('alertMsg');

  // ── Frontend validation (check before even calling the server) ──
  if (!email || !email.includes('@')) {
    showAlertMsg('❌ Please enter a valid email address.', 'error'); return;
  }
  if (!targetPrice || targetPrice < 5000 || targetPrice > 15000) {
    showAlertMsg('❌ Enter a price between ₹5,000 and ₹15,000 per gram.', 'error'); return;
  }

  // Show loading state on the button
  const btn = document.querySelector('.alert-btn');
  btn.textContent = 'Setting…';
  btn.disabled    = true;

  try {
    // ── POST to your backend ──────────────────────────────────
    // The backend saves it to SQLite and sends a confirmation email
    const response = await fetch(`${API_BASE}/api/alerts/subscribe`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email,
        purity,
        threshold_price: targetPrice,
        jeweller_id:     null,  // null = alert for ANY jeweller
      }),
    });

    const data = await response.json();

    if (response.ok) {
      // ── Success! ──────────────────────────────────────────
      showAlertMsg(
        `✅ Done! We'll email <strong>${email}</strong> the moment ${purity.toUpperCase()} drops to ₹${targetPrice.toLocaleString('en-IN')}/gram. Check your inbox for a confirmation.`,
        'success'
      );
      // Clear the form
      document.getElementById('alertPrice').value = '';
      document.getElementById('alertEmail').value = '';
    } else {
      // Backend returned an error (duplicate, invalid data, etc.)
      showAlertMsg('❌ ' + (data.error || 'Something went wrong. Try again.'), 'error');
    }

  } catch (networkErr) {
    // Backend is not running or unreachable
    showAlertMsg(
      '⚠️ Backend not connected. Start the server with <code>cd backend && npm start</code>',
      'error'
    );
  }

  // Restore button
  btn.textContent = 'Notify Me →';
  btn.disabled    = false;
}

function showAlertMsg(html, type) {
  const el = document.getElementById('alertMsg');
  el.innerHTML   = html;
  el.style.color = type === 'success' ? '#4ade80' : '#f87171';
  el.style.borderColor = type === 'success' ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)';
  el.style.display = 'block';
  // Auto-hide after 8 seconds
  setTimeout(() => { el.style.display = 'none'; }, 8000);
}
