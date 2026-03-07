// PostgreSQL-backed user store
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');

/**
 * Find an existing user or create a new one.
 * Returns { user, isNew } — async.
 */
async function findOrCreate({ platform, platformId, username, email, avatarUrl, walletAddress }) {
  const platformIdStr = String(platformId);

  // 1. Existing user with same platform + platformId?
  const existing = await pool.query(
    'SELECT * FROM users WHERE platform = $1 AND platform_id = $2',
    [platform, platformIdStr]
  );
  if (existing.rows.length > 0) {
    return { user: dbRowToUser(existing.rows[0]), isNew: false };
  }

  // 2. Same email via another platform? Link to that user.
  if (email) {
    const normalized = email.toLowerCase();
    const byEmail = await pool.query(
      'SELECT * FROM users WHERE email = $1 LIMIT 1',
      [normalized]
    );
    if (byEmail.rows.length > 0) {
      const existingUser = byEmail.rows[0];
      // Record the new platform link
      await pool.query(
        `INSERT INTO platform_links (email, user_uuid, platform, platform_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [normalized, existingUser.uuid, platform, platformIdStr]
      );
      return { user: dbRowToUser(existingUser), isNew: false };
    }
  }

  // 3. Brand new user
  const uuid = uuidv4();
  const result = await pool.query(
    `INSERT INTO users (uuid, platform, platform_id, username, email, avatar_url, wallet_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [uuid, platform, platformIdStr, username || 'Unknown', email ? email.toLowerCase() : null, avatarUrl || null, walletAddress || null]
  );
  return { user: dbRowToUser(result.rows[0]), isNew: true };
}

async function getUser(uuid) {
  const result = await pool.query('SELECT * FROM users WHERE uuid = $1', [uuid]);
  return result.rows.length > 0 ? dbRowToUser(result.rows[0]) : null;
}

async function updateUser(uuid, { displayName, avatarChoice, walletAddress }) {
  const result = await pool.query(
    `UPDATE users
     SET display_name   = COALESCE(NULLIF($2, ''), display_name),
         avatar_choice  = COALESCE(NULLIF($3, ''), avatar_choice),
         wallet_address = COALESCE($4, wallet_address)
     WHERE uuid = $1
     RETURNING *`,
    [uuid, displayName ? displayName.trim().slice(0, 40) : '', avatarChoice || '', walletAddress || null]
  );
  return result.rows.length > 0 ? dbRowToUser(result.rows[0]) : null;
}

async function getUserCount(platform) {
  if (!platform) {
    const r = await pool.query('SELECT COUNT(*) FROM users');
    return parseInt(r.rows[0].count, 10);
  }
  const r = await pool.query('SELECT COUNT(*) FROM users WHERE platform = $1', [platform]);
  return parseInt(r.rows[0].count, 10);
}

async function getAllUsers() {
  const r = await pool.query('SELECT * FROM users ORDER BY registered_at DESC');
  return r.rows.map(dbRowToUser);
}

async function linkChallenge(userUuid, { challengeUuid, challengeName }) {
  await pool.query(
    `INSERT INTO user_challenges (user_uuid, challenge_uuid, challenge_name)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [userUuid, challengeUuid, challengeName]
  );
}

function dbRowToUser(row) {
  return {
    uuid:          row.uuid,
    platform:      row.platform,
    platformId:    row.platform_id,
    username:      row.username,
    email:         row.email,
    avatarUrl:     row.avatar_url,
    walletAddress: row.wallet_address,
    displayName:   row.display_name,
    avatarChoice:  row.avatar_choice || 'platform',
    registeredAt:  row.registered_at,
  };
}

module.exports = { findOrCreate, getUser, updateUser, getUserCount, getAllUsers, linkChallenge };

