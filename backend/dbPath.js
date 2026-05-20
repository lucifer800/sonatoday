/*
  dbPath.js — single source of truth for where goldrates.db lives.

  Local dev:  ./goldrates.db (relative to the backend/ folder)
  Render:     /var/data/goldrates.db  (mounted persistent disk)

  Override by setting the DATABASE_PATH env var in Render's dashboard.
*/
const path = require('path');
require('dotenv').config();

module.exports = process.env.DATABASE_PATH || path.join(__dirname, 'goldrates.db');
