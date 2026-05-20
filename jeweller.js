/* =========================================================
   jeweller.html page logic — renders a single jeweller's profile.
   Reads ?id=N from the URL, looks up J (from data.js), and
   renders rates, reviews, and a price-alert form.
   ========================================================= */

const API_BASE = window.API_BASE || 'http://127.0.0.1:4000';

function fmt(n)   { return '₹' + Math.round(n).toLocaleString('en-IN'); }
function stars(n) {
  return Array.from({ length: 5 }).map((_, i) =>
    `<span style="color:${i < Math.round(n) ? 'var(--acc)' : '#2a3a50'};font-size:14px">★</span>`
  ).join('');
}
function shareJewellerWA(id) {
  const j = J.find(x => x.id === id); if (!j) return;
  const url  = `${window.location.origin}/jeweller.html?id=${j.id}`;
  const text =
    `💰 *${j.name}* (${j.area}) — today's gold rate:\n\n` +
    `• 22K: ₹${j.r22g.toLocaleString('en-IN')}/g  (₹${(j.r22g*10).toLocaleString('en-IN')}/10g)\n` +
    `• 24K: ₹${j.r24g.toLocaleString('en-IN')}/g\n` +
    `• Making: ${j.making}%\n\n` +
    `View live rates: ${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}
window.shareJewellerWA = shareJewellerWA;

function hoursHtml(hours) {
  if (!hours || !hours.length) return '<div class="jp-empty">Hours not listed.</div>';
  const todayIdx = new Date().getDay();           // Sun=0..Sat=6
  const order    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayKey = order[todayIdx];
  return `<div class="jp-hours-grid">${hours.map(h => {
    const isToday = h.day === todayKey;
    const time    = h.open === 'Closed' ? 'Closed' : `${h.open} – ${h.close}`;
    return `<div class="day ${isToday ? 'today' : ''}">${h.day}${isToday ? ' · today' : ''}</div><div class="time ${isToday ? 'today' : ''}">${time}</div>`;
  }).join('')}</div>`;
}

function trustOf(j) {
  const approved = (j.reviews || []).filter(r => r.status === 'approved');
  if (!approved.length) return null;
  return {
    avg: Math.round((approved.reduce((s, r) => s + r.stars, 0) / approved.length) * 10) / 10,
    n:   approved.length,
  };
}

function getJewellerId() {
  const params = new URLSearchParams(window.location.search);
  const id     = parseInt(params.get('id'), 10);
  return Number.isFinite(id) ? id : null;
}

async function syncFromDB() {
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
  } catch (_) { /* fall back to J */ }
}

function render() {
  const root = document.getElementById('jpContent');
  const id   = getJewellerId();
  const j    = J.find(x => x.id === id);

  if (!j) {
    root.innerHTML = `<div class="jp-card"><h2>Jeweller not found</h2><p style="color:var(--muted)">No jeweller with id ${id}. <a href="index.html" style="color:var(--acc)">Go back</a>.</p></div>`;
    document.title = 'Not found — Ahmedabad Gold & Silver Rates';
    return;
  }

  document.title = `${j.name} — Ahmedabad Gold & Silver Rates`;

  const trust = trustOf(j);
  const r22t  = j.r22g * 10;
  const r24t  = j.r24g * 10;

  const reviewsHtml = (j.reviews || []).filter(r => r.status === 'approved').length
    ? j.reviews.filter(r => r.status === 'approved').map(r => `
        <div class="jp-review">
          <div class="jp-review-head">
            <span class="jp-review-name">
              ${r.name}
              ${r.verified ? '<span class="jp-verified-tag">✓ Verified</span>' : ''}
            </span>
            <span class="jp-review-date">${r.date}</span>
          </div>
          <div style="margin-bottom:.35rem">${stars(r.stars)}</div>
          <div class="jp-review-text">${r.text}</div>
          ${r.photo ? `<div style="margin-top:.5rem"><img src="${r.photo}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--acc-border)"></div>` : ''}
        </div>`).join('')
    : '<div class="jp-empty">No reviews yet. Be the first to review.</div>';

  root.innerHTML = `
    <div class="jp-card">
      <div class="jp-head">
        <div>
          <h1 class="jp-name">${j.name}<span class="jp-sym">${j.sym}</span></h1>
          <div class="jp-area">📍 ${j.area} · 📞 ${j.phone || '—'}</div>
          ${trust ? `<div style="margin-top:.5rem">${stars(trust.avg)} <strong>${trust.avg}</strong> <span style="color:var(--muted);font-size:12px">(${trust.n} verified review${trust.n === 1 ? '' : 's'})</span></div>` : ''}
        </div>
        ${j.active ? '<span class="jp-verified">✓ Active Partner</span>' : ''}
      </div>

      ${j.rate_url ? `
      <div style="margin-top:.75rem;padding:.6rem .85rem;background:var(--acc-dim);border:1px solid var(--acc-border);border-radius:8px;font-size:12px">
        ✓ Verified jeweller — official daily rate published at
        <a href="${j.rate_url}" target="_blank" rel="noopener" style="color:var(--acc);font-weight:600;text-decoration:none">${new URL(j.rate_url).hostname}</a>
      </div>` : ''}

      <div style="margin-top:1rem">
        <button onclick="shareJewellerWA(${j.id})" style="background:#25D366;color:#fff;border:0;padding:.6rem 1.1rem;border-radius:8px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:.5rem;font-size:13px">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Share today's rate on WhatsApp
        </button>
      </div>

      <div class="jp-rates">
        <div class="jp-rate">
          <div class="jp-rate-lbl">22K Gold · per gram</div>
          <div class="jp-rate-val">${fmt(j.r22g)}</div>
          <div class="jp-rate-sub">${fmt(r22t)} per 10g</div>
        </div>
        <div class="jp-rate">
          <div class="jp-rate-lbl">24K Gold · per gram</div>
          <div class="jp-rate-val">${fmt(j.r24g)}</div>
          <div class="jp-rate-sub">${fmt(r24t)} per 10g</div>
        </div>
        <div class="jp-rate">
          <div class="jp-rate-lbl">Making charge</div>
          <div class="jp-rate-val">${j.making}%</div>
          <div class="jp-rate-sub">on gold cost</div>
        </div>
        <div class="jp-rate">
          <div class="jp-rate-lbl">Last updated</div>
          <div class="jp-rate-val" style="font-size:1.2rem">${j.updated}</div>
          <div class="jp-rate-sub">today</div>
        </div>
      </div>
    </div>

    <div class="jp-card">
      <h3 class="jp-section-title">📷 Shop photos</h3>
      <div class="jp-photos">
        ${(j.photos || []).map(src => `
          <div class="jp-photo" onclick="window.open('${src}', '_blank')"><img src="${src}" alt="${j.name} shop photo" loading="lazy" /></div>
        `).join('')}
      </div>
    </div>

    <div class="jp-cols">
      <div class="jp-card">
        <h3 class="jp-section-title">🕒 Working hours</h3>
        ${hoursHtml(j.hours)}
      </div>
      <div class="jp-card">
        <h3 class="jp-section-title">📍 Find us</h3>
        <p style="color:var(--muted);font-size:13px;margin:0 0 .75rem">${j.address}</p>
        <iframe class="jp-map" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
          src="https://www.google.com/maps?q=${encodeURIComponent(j.mapQuery)}&output=embed"></iframe>
        <p style="margin:.75rem 0 0"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.mapQuery)}" target="_blank" style="color:var(--acc);text-decoration:none;font-size:13px">→ Open in Google Maps</a></p>
      </div>
    </div>

    <div class="jp-card">
      <h3 class="jp-section-title">ℹ️ About</h3>
      <p class="jp-about">${j.about}</p>
    </div>

    <div class="jp-card">
      <h3 class="jp-section-title">🔔 Set a price alert for ${j.name}</h3>
      <p style="color:var(--muted);font-size:13px;margin:0 0 .75rem">We'll email you the moment 22K/24K drops to your target.</p>
      <div class="jp-alert-form">
        <select id="jpPurity">
          <option value="22k">22K</option>
          <option value="24k">24K</option>
        </select>
        <input id="jpPrice" type="number" placeholder="Target price per gram (₹)" min="5000" max="15000" />
        <input id="jpEmail" type="email" placeholder="Your email" />
        <button id="jpSubmit">Notify Me →</button>
      </div>
      <div id="jpMsg" class="jp-msg"></div>
    </div>

    <div class="jp-card">
      <h3 class="jp-section-title">📈 Price trend</h3>
      <p style="color:var(--muted);font-size:13px;margin:0 0 .75rem">Last 30 rate updates by this jeweller.</p>
      <div style="position:relative;height:260px"><canvas id="priceChart"></canvas></div>
      <div id="chartEmpty" style="display:none;color:var(--muted);font-size:13px;font-style:italic;text-align:center;padding:1rem">No price history yet — chart will populate as the jeweller updates rates.</div>
    </div>

    <div class="jp-card">
      <h3 class="jp-section-title">📋 Verified Reviews</h3>
      ${reviewsHtml}
    </div>
  `;

  document.getElementById('jpSubmit').addEventListener('click', () => submitAlert(j));
  renderPriceChart(j.id);
}

async function renderPriceChart(jewellerId) {
  try {
    const res  = await fetch(`${API_BASE}/api/jewellers/${jewellerId}/history`);
    const rows = await res.json();
    const canvas = document.getElementById('priceChart');
    const empty  = document.getElementById('chartEmpty');
    if (!rows.length) { canvas.style.display = 'none'; empty.style.display = 'block'; return; }

    const labels = rows.map(r => new Date(r.recorded_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }));
    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '22K ₹/g', data: rows.map(r => r.r22g), borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.15)', tension: 0.3, fill: true },
          { label: '24K ₹/g', data: rows.map(r => r.r24g), borderColor: '#F0CC60', backgroundColor: 'rgba(240,204,96,0.10)', tension: 0.3, fill: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#a0a8b8', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#6c7a8c', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#6c7a8c', font: { size: 10 }, callback: v => '₹' + v }, grid: { color: 'rgba(255,255,255,0.04)' } },
        },
      },
    });
  } catch (err) {
    console.warn('Chart load failed:', err.message);
  }
}

async function submitAlert(j) {
  const purity = document.getElementById('jpPurity').value;
  const price  = parseFloat(document.getElementById('jpPrice').value);
  const email  = document.getElementById('jpEmail').value.trim();
  const msg    = document.getElementById('jpMsg');

  msg.className = 'jp-msg';
  if (!email || !email.includes('@')) { msg.className = 'jp-msg err'; msg.textContent = 'Please enter a valid email.'; return; }
  if (!price || price < 5000 || price > 15000) { msg.className = 'jp-msg err'; msg.textContent = 'Target price must be between ₹5,000 and ₹15,000 per gram.'; return; }

  msg.className = 'jp-msg'; msg.textContent = '';
  try {
    const res = await fetch(`${API_BASE}/api/alerts/subscribe`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, jeweller_id: j.id, purity, threshold_price: price }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to set alert');
    msg.className   = 'jp-msg ok';
    msg.textContent = data.message || 'Alert saved! Check your email for confirmation.';
    document.getElementById('jpPrice').value = '';
  } catch (err) {
    msg.className   = 'jp-msg err';
    msg.textContent = err.message;
  }
}

syncFromDB().then(render);
