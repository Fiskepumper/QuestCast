// PostgreSQL-backed registration counts
const pool = require('../db/pool');

async function addRegistration(platform) {
  const key = platform.toLowerCase();
  await pool.query(
    `INSERT INTO registrations (platform, count) VALUES ($1, 1)
     ON CONFLICT (platform) DO UPDATE SET count = registrations.count + 1`,
    [key]
  );
}

async function getCount(platform) {
  const r = await pool.query(
    'SELECT count FROM registrations WHERE platform = $1',
    [platform.toLowerCase()]
  );
  return r.rows.length > 0 ? r.rows[0].count : 0;
}

module.exports = { addRegistration, getCount };

