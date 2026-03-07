// Run once at startup to create tables if they don't exist
const fs   = require('fs');
const path = require('path');
const pool = require('./pool');

async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Database schema ready');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
    throw err;
  }
}

module.exports = initDb;
