/*
  db.js — single shared database handle (libSQL / Turso).
  ────────────────────────────────────────────────────────────
  WHY: Render's free tier wipes /tmp on every deploy, so a local
  SQLite file loses all data each time we ship. libSQL (Turso) is
  a SQLite-compatible cloud DB with a free tier — data persists
  across deploys forever, at zero cost.

  HOW: this module exposes the SAME callback API as node-sqlite3
  (run / get / all / serialize / prepare / close), so the rest of
  the app is unchanged — each module just does
  `const db = require('./db')` instead of opening its own sqlite3
  connection.

  URL resolution:
    • TURSO_DATABASE_URL set → remote Turso (production).
      Remote uses pure HTTP — NO native addon, so no glibc issues
      like the sqlite3 6.x disaster.
    • otherwise → local file:./goldrates.db for dev.
  Auth via TURSO_AUTH_TOKEN (remote only).

  ORDERING: every operation is chained on one promise queue, which
  reproduces sqlite3's serialized execution. CREATE-then-INSERT
  sequences therefore never race.
*/
const { createClient } = require('@libsql/client');
const path = require('path');
require('dotenv').config();

const url = process.env.TURSO_DATABASE_URL
  || ('file:' + path.join(__dirname, 'goldrates.db'));
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

const client = createClient(authToken ? { url, authToken } : { url });
console.log(`✓ DB engine: libSQL (${url.startsWith('file:') ? 'local file' : 'Turso remote'})`);

// ── Single global queue → strict serialized execution ──
let queue = Promise.resolve();
function enqueue(task) {
  const p = queue.then(task, task);
  queue = p.catch(() => {});   // a failure never breaks the chain
  return p;
}

// Normalise (params?, cb?) overloads.
function norm(params, cb) {
  if (typeof params === 'function') return [[], params];
  return [params || [], cb];
}
// libSQL rejects `undefined` → coerce to null.
const clean = (arr) => arr.map(v => (v === undefined ? null : v));
// Build plain row objects keyed by column name (positional, reliable).
function toObjs(res) {
  return res.rows.map(row => {
    const o = {};
    res.columns.forEach((c, i) => { o[c] = row[i]; });
    return o;
  });
}

const db = {
  run(sql, params, cb) {
    const [args, callback] = norm(params, cb);
    enqueue(() => client.execute({ sql, args: clean(args) })
      .then(res => {
        if (callback) callback.call(
          { lastID: res.lastInsertRowid != null ? Number(res.lastInsertRowid) : undefined,
            changes: res.rowsAffected },
          null);
      })
      .catch(err => { if (callback) callback.call({}, err); else console.error('db.run:', err.message); }));
  },

  get(sql, params, cb) {
    const [args, callback] = norm(params, cb);
    enqueue(() => client.execute({ sql, args: clean(args) })
      .then(res => { const rows = toObjs(res); if (callback) callback(null, rows[0]); })
      .catch(err => { if (callback) callback(err); }));
  },

  all(sql, params, cb) {
    const [args, callback] = norm(params, cb);
    enqueue(() => client.execute({ sql, args: clean(args) })
      .then(res => { if (callback) callback(null, toObjs(res)); })
      .catch(err => { if (callback) callback(err); }));
  },

  // Already globally serialized — just run the body; its db.* calls enqueue in order.
  serialize(fn) { if (fn) fn(); },

  // Prepared statement → reuses the same SQL with different args each .run().
  prepare(sql) {
    return {
      run(...a) {
        let cb;
        if (typeof a[a.length - 1] === 'function') cb = a.pop();
        db.run(sql, a, cb);
        return this;
      },
      finalize(cb) { enqueue(() => {}).then(() => { if (cb) cb(); }); return this; },
    };
  },

  close(cb) { enqueue(() => {}).then(() => { try { client.close && client.close(); } catch (_) {} if (cb) cb(null); }); },

  // Expose the raw client for any future promise-style needs.
  _client: client,
};

module.exports = db;
