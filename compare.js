/* =========================================================
   compare.js — Side-by-side jeweller comparison
   Reads ?ids=N,M from URL → fetches /api/jewellers → renders
   two cards with winner-highlighted rows + a plain-English
   bottom-line summary + a WhatsApp share button.
   ========================================================= */

const API_BASE = window.API_BASE || 'http://127.0.0.1:4000';
const PURITY_22K_OF_24K = 22 / 24;
const GST_PCT = 3;

function fmt(n)     { return '₹' + Math.round(n).toLocaleString('en-IN'); }
function fmtPlain(n){ return Math.round(n).toLocaleString('en-IN'); }

function getIds() {
  const raw = new URLSearchParams(window.location.search).get('ids') || '';
  return raw.split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n));
}

/* Compute total cost for `weight` grams of `purity`-K at jeweller `j`.
   Returns null when the jeweller has no rate for that purity. */
function totalFor(j, weight, purity) {
  const rate = purity === 24 ? j.r24g : j.r22g;
  if (rate == null) return null;
  const gold   = weight * rate;
  const mkPct  = j.making != null ? j.making : 10;
  const making = gold * mkPct / 100;
  const gst    = (gold + making) * GST_PCT / 100;
  return { rate, gold, making, gst, total: gold + making + gst, mkPct };
}

/* Renders one comparison card. Pass in pre-computed flags for
   which fields this card "wins" so we can style accordingly. */
function card(j, win, calc, weight, purity) {
  const photo = j.photo_url
    ? `<div class="cmp-photo" style="background-image:url(${j.photo_url})"></div>`
    : '';

  const rate22 = j.r22g != null ? fmt(j.r22g) + '/g' : '<span class="cmp-row miss"><span class="val">Rate unavailable</span></span>';
  const rate24 = j.r24g != null ? fmt(j.r24g) + '/g' : 'Rate unavailable';
  const making = j.making != null ? `${j.making}%` : '—';

  // Credibility ticks
  const cred = [];
  if (j.bis_license) cred.push('✓ BIS Hallmark Licensed');
  if (j.gst_number)  cred.push('✓ GST Registered');
  if (j.whatsapp)    cred.push('✓ WhatsApp available');
  const credBlock = cred.length
    ? cred.map(c => `<div style="color:#4ade80;font-size:12px;margin-top:.25rem">${c}</div>`).join('')
    : '<div style="color:var(--muted);font-size:12px;margin-top:.25rem">No credentials submitted</div>';

  // Bottom action buttons
  const actions = `
    <div class="cmp-actions">
      <a href="jeweller.html?id=${j.id}">Full profile →</a>
      ${j.phone ? `<a href="tel:${j.phone.replace(/\s+/g, '')}">📞 Call</a>` : ''}
      ${j.whatsapp ? `<a href="https://wa.me/${j.whatsapp.replace(/[^0-9]/g, '')}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
      ${j.address_line ? `<a href="https://maps.google.com/?q=${encodeURIComponent(j.address_line)}" target="_blank" rel="noopener">📍 Map</a>` : ''}
    </div>`;

  return `<div class="cmp-col">
    ${photo}
    <div class="cmp-body">
      <h2 class="cmp-name">${j.name}</h2>
      <div class="cmp-area">📍 ${j.address_line || j.area || '—'}</div>

      <div class="cmp-section-head">Today's rates</div>
      <div class="cmp-row ${win.r22 ? 'win' : ''}">
        <span class="lbl">22K / gram</span>
        <span class="val">${j.r22g != null ? fmt(j.r22g) : '—'}</span>
      </div>
      <div class="cmp-row ${win.r24 ? 'win' : ''}">
        <span class="lbl">24K / gram</span>
        <span class="val">${j.r24g != null ? fmt(j.r24g) : '—'}</span>
      </div>
      <div class="cmp-row ${win.mk ? 'win' : ''}">
        <span class="lbl">Making charge</span>
        <span class="val">${making}</span>
      </div>

      <div class="cmp-section-head">For ${weight}g ${purity}K</div>
      ${calc ? `
        <div class="cmp-row"><span class="lbl">Gold value</span><span class="val">${fmt(calc.gold)}</span></div>
        <div class="cmp-row"><span class="lbl">Making (${calc.mkPct}%)</span><span class="val">${fmt(calc.making)}</span></div>
        <div class="cmp-row"><span class="lbl">GST (${GST_PCT}%)</span><span class="val">${fmt(calc.gst)}</span></div>
        <div class="cmp-row ${win.total ? 'win' : ''}" style="font-size:1.05rem">
          <span class="lbl" style="color:var(--text);font-weight:600">TOTAL</span>
          <span class="val" style="font-size:1.2rem">${fmt(calc.total)}</span>
        </div>
      ` : `<div class="cmp-row miss"><span class="val">Total can't be computed — rate missing</span></div>`}

      <div class="cmp-section-head">Trust & credentials</div>
      <div class="cmp-row ${win.trust ? 'win' : ''}">
        <span class="lbl">Avg rating</span>
        <span class="val">${j._trust ? `★ ${j._trust.avg.toFixed(1)} (${j._trust.n} reviews)` : 'No reviews yet'}</span>
      </div>
      ${credBlock}

      ${actions}
    </div>
  </div>`;
}

/* Plain-English summary card at the bottom: who wins on what,
   what the price gap is, who's more trusted. */
function summary(a, b, calcA, calcB, weight, purity) {
  const lines = [];
  if (calcA && calcB) {
    const diff   = Math.abs(calcA.total - calcB.total);
    const winner = calcA.total < calcB.total ? a : b;
    const loser  = calcA.total < calcB.total ? b : a;
    const pct    = (diff / Math.max(calcA.total, calcB.total)) * 100;
    lines.push(`<p><strong>${winner.name}</strong> is cheaper by <strong>${fmt(diff)}</strong> (${pct.toFixed(1)}%) for ${weight}g ${purity}K, vs ${loser.name}.</p>`);
  } else if (calcA && !calcB) {
    lines.push(`<p>Only <strong>${a.name}</strong> has a live rate to compute cost. ${b.name} needs to post today's rate.</p>`);
  } else if (calcB && !calcA) {
    lines.push(`<p>Only <strong>${b.name}</strong> has a live rate to compute cost. ${a.name} needs to post today's rate.</p>`);
  } else {
    lines.push(`<p>Neither shop has a live rate today — can't compute a cost comparison.</p>`);
  }

  // Trust gap
  if (a._trust && b._trust) {
    const td = a._trust.avg - b._trust.avg;
    if (Math.abs(td) >= 0.3) {
      const tWin = td > 0 ? a : b;
      lines.push(`<p>${tWin.name} has stronger reviews (${Math.abs(td).toFixed(1)}★ higher average).</p>`);
    } else {
      lines.push(`<p>Trust is comparable — both within 0.3★ of each other.</p>`);
    }
  } else if (a._trust || b._trust) {
    const tHas = a._trust ? a : b;
    lines.push(`<p>${tHas.name} is the only one with verified reviews so far.</p>`);
  }

  // Bottom stats strip
  const stats = (j, calc) => `
    <div class="stat">
      <div class="stat-lbl">${j.name}</div>
      <div class="stat-val">${calc ? fmt(calc.total) : '—'}</div>
    </div>`;

  return `<div class="cmp-summary">
    <h3>💡 Bottom line</h3>
    ${lines.join('')}
    <div class="bot-row">
      ${stats(a, calcA)}
      ${stats(b, calcB)}
    </div>
  </div>`;
}

/* Trust score calculator — same logic as homepage's ts(j) */
function trustOf(j) {
  const approved = (j.reviews || []).filter(r => r.status === 'approved');
  if (!approved.length) return null;
  const avg = approved.reduce((s, r) => s + r.stars, 0) / approved.length;
  return { avg, n: approved.length };
}

async function main() {
  const root = document.getElementById('cmpRoot');
  const ids  = getIds();

  if (ids.length !== 2) {
    root.innerHTML = `<div class="cmp-empty">
      Pick 2 jewellers from the <a href="index.html">comparison page</a> to compare them here.
      <br><small>(Tick the ⇄ checkbox on two rows, then click "Open →")</small>
    </div>`;
    return;
  }

  let rows;
  try {
    const res = await fetch(`${API_BASE}/api/jewellers`);
    rows = await res.json();
  } catch (err) {
    root.innerHTML = `<div class="cmp-empty">Failed to load jewellers: ${err.message}</div>`;
    return;
  }

  const a = rows.find(r => r.id === ids[0]);
  const b = rows.find(r => r.id === ids[1]);
  if (!a || !b) {
    root.innerHTML = `<div class="cmp-empty">
      One or both jewellers (id ${ids.join(', ')}) don't exist.
      <a href="index.html">Back to comparison</a>.
    </div>`;
    return;
  }
  // Attach trust scores (reviews are missing on /api/jewellers response,
  // so trust comes from data.js if loaded — fallback to null).
  a._trust = trustOf(a);
  b._trust = trustOf(b);

  // Date subline
  document.getElementById('cmpDate').textContent =
    new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  function render() {
    const weight = parseFloat(document.getElementById('cmpWeight').value) || 10;
    const purity = parseInt(document.getElementById('cmpPurity').value, 10) || 22;
    const calcA  = totalFor(a, weight, purity);
    const calcB  = totalFor(b, weight, purity);

    // Decide winners (lower price = win, higher trust = win, etc.)
    const win = {
      a: {
        r22:   a.r22g != null && b.r22g != null && a.r22g < b.r22g,
        r24:   a.r24g != null && b.r24g != null && a.r24g < b.r24g,
        mk:    a.making != null && b.making != null && a.making < b.making,
        total: calcA && calcB && calcA.total < calcB.total,
        trust: a._trust && (!b._trust || a._trust.avg > b._trust.avg + 0.05),
      },
      b: {
        r22:   a.r22g != null && b.r22g != null && b.r22g < a.r22g,
        r24:   a.r24g != null && b.r24g != null && b.r24g < a.r24g,
        mk:    a.making != null && b.making != null && b.making < a.making,
        total: calcA && calcB && calcB.total < calcA.total,
        trust: b._trust && (!a._trust || b._trust.avg > a._trust.avg + 0.05),
      },
    };

    root.innerHTML = `
      <div class="cmp-grid">
        ${card(a, win.a, calcA, weight, purity)}
        ${card(b, win.b, calcB, weight, purity)}
      </div>
      ${summary(a, b, calcA, calcB, weight, purity)}
      <button class="cmp-share-btn" onclick="shareComparison()">💬 Share this comparison on WhatsApp</button>
    `;

    // Expose for the share button
    window._cmpState = { a, b, calcA, calcB, weight, purity };
  }

  document.getElementById('cmpWeight').addEventListener('input', render);
  document.getElementById('cmpPurity').addEventListener('change', render);
  render();
}

function shareComparison() {
  const s = window._cmpState;
  if (!s) return;
  const { a, b, calcA, calcB, weight, purity } = s;
  const winnerName = calcA && calcB && calcA.total < calcB.total ? a.name :
                     calcA && calcB && calcB.total < calcA.total ? b.name : null;
  const diff = (calcA && calcB) ? Math.abs(calcA.total - calcB.total) : null;
  const url  = `${window.location.origin}/compare.html?ids=${a.id},${b.id}`;

  let msg = `🆚 *Comparison · ${weight}g ${purity}K*\n\n`;
  msg += `🥇 ${a.name}${a.area ? ` (${a.area})` : ''}\n`;
  msg += `   ${calcA ? `Total: ${fmt(calcA.total)}` : 'Rate unavailable'}` +
         `${a._trust ? ` · ★ ${a._trust.avg.toFixed(1)}` : ''}\n\n`;
  msg += `🥈 ${b.name}${b.area ? ` (${b.area})` : ''}\n`;
  msg += `   ${calcB ? `Total: ${fmt(calcB.total)}` : 'Rate unavailable'}` +
         `${b._trust ? ` · ★ ${b._trust.avg.toFixed(1)}` : ''}\n\n`;
  if (winnerName && diff) {
    msg += `*${winnerName} is ₹${fmtPlain(diff)} cheaper today.*\n\n`;
  }
  msg += `Compare live → ${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}
window.shareComparison = shareComparison;

main();
