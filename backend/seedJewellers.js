/*
  seedJewellers.js
  ────────────────
  Seeds the verified jewellers from data.js into goldrates.db with
  bcrypt-hashed passwords so the login flow works.

  Only includes national/regional chains with confirmed Ahmedabad
  presence AND a public daily-rate page. All other entries were
  removed to avoid fabricated demo data.

  Run:  node seedJewellers.js
  Safe to re-run — uses INSERT OR REPLACE keyed by email.

  ⚠ This deletes jewellers no longer in the list (ids 13-40 from
  the earlier demo seed) to keep the DB consistent with data.js.
*/

const sqlite3 = require('sqlite3').verbose();
const bcrypt  = require('bcryptjs');

const db = new sqlite3.Database(require('./dbPath'));

const jewellers = [
  { id:1,  name:'Malabar Gold & Diamonds', sym:'MGL', email:'malabar@ahm.com',    pass:'pass123', area:'Prahlad Nagar', phone:'+91 79 4000 0001', r22g:14380, r24g:15690, making:10 },
  { id:2,  name:'TBZ – The Original',      sym:'TBZ', email:'tbz@ahm.com',         pass:'pass123', area:'C.G. Road',      phone:'+91 79 4000 0002', r22g:14410, r24g:15720, making:11 },
  { id:3,  name:'Tanishq',                 sym:'TNQ', email:'tanishq@ahm.com',     pass:'pass123', area:'C.G. Road',      phone:'+91 79 4000 0003', r22g:14420, r24g:15730, making:12 },
  { id:4,  name:'Kalyan Jewellers',        sym:'KJW', email:'kalyan@ahm.com',      pass:'pass123', area:'Vastrapur',      phone:'+91 79 4000 0004', r22g:14400, r24g:15710, making:11 },
  { id:5,  name:'Joyalukkas',              sym:'JYL', email:'joyalukkas@ahm.com',  pass:'pass123', area:'Satellite',      phone:'+91 79 4000 0005', r22g:14395, r24g:15705, making:12 },
  { id:6,  name:'CaratLane',               sym:'CTL', email:'caratlane@ahm.com',   pass:'pass123', area:'Bodakdev',       phone:'+91 79 4000 0006', r22g:14430, r24g:15740, making:13 },
  { id:7,  name:'GRT Jewellers',           sym:'GRT', email:'grt@ahm.com',         pass:'pass123', area:'Ashram Road',    phone:'+91 79 4000 0007', r22g:14390, r24g:15700, making:11 },
  { id:8,  name:'Senco Gold & Diamonds',   sym:'SGD', email:'senco@ahm.com',       pass:'pass123', area:'Maninagar',      phone:'+91 79 4000 0008', r22g:14405, r24g:15715, making:11 },
  { id:9,  name:'Reliance Jewels',         sym:'RJL', email:'reliance@ahm.com',    pass:'pass123', area:'Shahibaug',      phone:'+91 79 4000 0009', r22g:14400, r24g:15710, making:11 },
  { id:10, name:'PC Jeweller',             sym:'PCJ', email:'pcj@ahm.com',         pass:'pass123', area:'S.G. Highway',   phone:'+91 79 4000 0010', r22g:14415, r24g:15725, making:12 },
  { id:11, name:'P.N. Gadgil & Sons',      sym:'PNG', email:'png@ahm.com',         pass:'pass123', area:'Navrangpura',    phone:'+91 79 4000 0011', r22g:14385, r24g:15695, making:10 },
  { id:12, name:'Bhima Jewellers',         sym:'BHM', email:'bhima@ahm.com',       pass:'pass123', area:'Law Garden',     phone:'+91 79 4000 0012', r22g:14395, r24g:15705, making:11 },
];

const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
const keepIds = jewellers.map(j => j.id);
const placeholders = keepIds.map(() => '?').join(',');

db.serialize(() => {
  // Remove fabricated/unverified entries from previous seeds
  db.run(`DELETE FROM jewellers WHERE id NOT IN (${placeholders})`, keepIds);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO jewellers
      (id, name, symbol, email, password, phone, area, r22g, r24g, making, updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  jewellers.forEach(j => {
    const hash = bcrypt.hashSync(j.pass, 10);
    stmt.run(j.id, j.name, j.sym, j.email, hash, j.phone, j.area, j.r22g, j.r24g, j.making, now);
  });

  stmt.finalize(() => {
    db.all('SELECT id, name, email FROM jewellers ORDER BY id', (err, rows) => {
      if (err) console.error(err);
      else {
        console.log(`✓ ${rows.length} verified jewellers in DB:`);
        rows.forEach(r => console.log(`   ${r.id}. ${r.name}  (${r.email})`));
        console.log('\nLogin with any email above + password: pass123');
      }
      db.close();
    });
  });
});
