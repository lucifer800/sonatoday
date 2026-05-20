/*
  mailer.js
  ─────────
  This file knows HOW to send emails using your Gmail.
  It does NOT decide WHEN to send — alertChecker.js does that.

  HOW NODEMAILER WORKS:
  1. You give it your Gmail + App Password
  2. It logs into Gmail on your behalf
  3. It sends the email just like you would manually
*/

require('dotenv').config();
const nodemailer = require('nodemailer');

// ── STEP 1: Create a "transporter" (your email sender) ──────
// Think of this like opening Gmail in a browser — you log in once,
// then you can send as many emails as you want.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,   // your Gmail address
    pass: process.env.EMAIL_PASS,   // your Gmail App Password (16 chars)
  }
});

// ── STEP 2: Test the connection on startup ───────────────────
transporter.verify((err, success) => {
  if (err) {
    console.error('❌ Email not connected:', err.message);
    console.error('   → Check EMAIL_USER and EMAIL_PASS in your .env file');
  } else {
    console.log('✅ Email ready to send from:', process.env.EMAIL_USER);
  }
});

// ── STEP 3: The function that actually sends the email ────────
// Call this from alertChecker.js when a price drops
async function sendPriceAlert({ toEmail, jeweller, currentPrice, targetPrice, purity }) {
  const subject = `🎯 Price Alert — ${jeweller} dropped to ₹${currentPrice.toLocaleString('en-IN')}!`;

  // This is the email body — it's HTML so it looks nice in Gmail
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0A1628;color:#F8F4EC;border-radius:12px;overflow:hidden">

      <!-- Header -->
      <div style="background:#D4AF37;padding:1.5rem 2rem;text-align:center">
        <div style="font-size:2rem">💰</div>
        <h1 style="margin:.5rem 0;color:#05101f;font-size:1.4rem">Your Price Alert Triggered!</h1>
        <p style="color:#05101f;margin:0;font-size:13px">Ahmedabad Gold Rates</p>
      </div>

      <!-- Body -->
      <div style="padding:2rem">
        <p style="font-size:15px;color:#A0B0C8;margin-bottom:1.5rem">Hi there! You asked us to notify you when gold drops.</p>

        <!-- Price box -->
        <div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:10px;padding:1.2rem;margin-bottom:1.5rem">
          <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#A0B0C8;margin-bottom:.5rem">${purity} — ${jeweller}</div>
          <div style="font-size:2rem;font-weight:700;color:#D4AF37">₹${currentPrice.toLocaleString('en-IN')}<span style="font-size:1rem;color:#A0B0C8">/gram</span></div>
          <div style="font-size:13px;color:#22C55E;margin-top:.4rem">✓ Below your target of ₹${targetPrice.toLocaleString('en-IN')}/gram</div>
        </div>

        <!-- Drop amount -->
        <div style="font-size:13px;color:#A0B0C8;margin-bottom:1.5rem">
          That's <strong style="color:#22C55E">₹${(targetPrice - currentPrice).toLocaleString('en-IN')} cheaper</strong> than your target price!
        </div>

        <!-- CTA Button -->
        <div style="text-align:center;margin:1.5rem 0">
          <a href="${process.env.SITE_URL}" style="background:#D4AF37;color:#05101f;text-decoration:none;padding:.85rem 2rem;border-radius:8px;font-weight:700;font-size:14px;display:inline-block">
            View Current Rates →
          </a>
        </div>

        <p style="font-size:11px;color:#607090;text-align:center;margin-top:1.5rem">
          This alert has been deactivated after sending. Set a new one anytime.<br>
          Ahmedabad Gold Rates · Rates are indicative
        </p>
      </div>
    </div>
  `;

  // Send it!
  const info = await transporter.sendMail({
    from: `"Ahmedabad Gold Rates 💰" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    html,
  });

  console.log(`📧 Alert sent to ${toEmail} (Message ID: ${info.messageId})`);
  return info;
}

// ── STEP 4: Confirmation email when someone subscribes ────────
async function sendConfirmationEmail({ toEmail, jeweller, targetPrice, purity }) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0A1628;color:#F8F4EC;border-radius:12px;overflow:hidden">
      <div style="background:#D4AF37;padding:1.2rem 2rem;text-align:center">
        <h2 style="color:#05101f;margin:0">Alert Set! ✓</h2>
      </div>
      <div style="padding:2rem">
        <p style="color:#A0B0C8">Your price alert has been saved.</p>
        <div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:10px;padding:1rem;margin:1rem 0">
          <div style="font-size:12px;color:#A0B0C8">You'll be notified when:</div>
          <div style="font-size:1.1rem;color:#D4AF37;margin-top:.4rem;font-weight:600">${jeweller} — ${purity} drops below ₹${targetPrice.toLocaleString('en-IN')}/gram</div>
        </div>
        <p style="font-size:12px;color:#607090">We check prices every 10 minutes.</p>
        <p style="font-size:12px;color:#607090">Want to cancel? <a href="http://localhost:4000/my-alerts.html?email=${encodeURIComponent(toEmail)}" style="color:#D4AF37">Manage your alerts →</a></p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Ahmedabad Gold Rates 💰" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `✓ Alert Set — Notify me when ${jeweller} drops to ₹${targetPrice}/g`,
    html,
  });

  console.log(`📧 Confirmation sent to ${toEmail}`);
}

module.exports = { sendPriceAlert, sendConfirmationEmail };
