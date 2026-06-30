/*
  alertChecker.js
  ───────────────
  This is the "alarm clock" of the system.

  HOW IT WORKS:
  1. node-cron runs this function every 10 minutes (like a cron job on Linux)
  2. It fetches the current gold price (from MCX or your own data)
  3. It checks every saved alert in the database
  4. If the price dropped below someone's target → sends email via mailer.js
  5. Marks that alert as "triggered" so they don't get spammed

  WHAT IS node-cron?
  It's a library that lets you run code on a schedule.
  Every 10 minutes: "* / 10 * * * *" means "every 10 minutes"
  Every day at 9am: "0 9 * * *" means "every day at 9am"
  Every hour: "0 * * * *" means "every hour"
*/

const cron                                    = require('node-cron');
const { sendPriceAlert, sendConfirmationEmail } = require('./mailer');
const { getGold22KPrice, getGold24KPrice }    = require('./goldPriceApi');

const db = require('./db');

// ── The main checker function ─────────────────────────────────
async function checkAlerts() {
  console.log(`\n⏰ [${new Date().toLocaleTimeString('en-IN')}] Checking price alerts...`);

  const price22 = await getGold22KPrice();
  const price24 = await getGold24KPrice();
  console.log(`   Current live prices — 22K: ₹${price22}/g, 24K: ₹${price24}/g`);

  // Get all ACTIVE alerts from the database
  db.all(
    `SELECT alerts.*, jewellers.name as jeweller_name 
     FROM alerts 
     LEFT JOIN jewellers ON alerts.jeweller_id = jewellers.id
     WHERE alerts.active = 1`,
    [],
    async (err, alerts) => {
      if (err) { console.error('DB error:', err); return; }
      if (!alerts.length) { console.log('   No active alerts.'); return; }

      console.log(`   Found ${alerts.length} active alert(s) to check`);

      for (const alert of alerts) {
        const jeweller     = alert.jeweller_name || 'Any Jeweller';
        const is24k        = alert.alert_type === '24k';
        const currentPrice = is24k ? price24 : price22;

        // ── THE KEY CHECK ────────────────────────────────────
        // Has the price dropped to or below the user's target?
        if (currentPrice <= alert.threshold_price) {
          console.log(`   🎯 TRIGGERED: ${alert.email} wanted ₹${alert.threshold_price}, now ₹${currentPrice}`);

          try {
            // Send the alert email
            await sendPriceAlert({
              toEmail:      alert.email,
              jeweller:     jeweller,
              currentPrice: currentPrice,
              targetPrice:  alert.threshold_price,
              purity:       alert.alert_type === '24k' ? '24K' : '22K',
            });

            // Deactivate so they don't get the same email again every 10 min
            db.run('UPDATE alerts SET active = 0 WHERE id = ?', [alert.id]);
            console.log(`   ✓ Alert ${alert.id} deactivated after sending`);

          } catch (emailErr) {
            console.error(`   ✗ Failed to send to ${alert.email}:`, emailErr.message);
          }

        } else {
          // Price not low enough yet
          const gap = currentPrice - alert.threshold_price;
          console.log(`   ⏳ ${alert.email}: needs ₹${alert.threshold_price}, current ₹${currentPrice} (₹${gap} above target)`);
        }
      }
    }
  );
}

// ── Schedule: run every 10 minutes ───────────────────────────
// '*/10 * * * *' = at minute 0, 10, 20, 30, 40, 50 of every hour
function startAlertChecker() {
  console.log('⏰ Alert checker started — runs every 10 minutes');

  cron.schedule('*/10 * * * *', () => {
    checkAlerts();
  });

  // Also run once immediately on startup so you don't wait 10 min
  checkAlerts();
}

module.exports = { startAlertChecker, checkAlerts };
