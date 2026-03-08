/**
 * Database Migration Script
 * Run: node db/migrate.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('🔄 Running migration: Add creator tracking...\n');
  
  try {
    // Add new columns
    await pool.query(`
      ALTER TABLE blockchain_challenges 
        ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 2,
        ADD COLUMN IF NOT EXISTS creator_uuid TEXT REFERENCES users(uuid),
        ADD COLUMN IF NOT EXISTS creator_address TEXT;
    `);
    console.log('✅ Added columns to blockchain_challenges');
    
    await pool.query(`
      ALTER TABLE coinflip_bets
        ADD COLUMN IF NOT EXISTS is_creator BOOLEAN DEFAULT false;
    `);
    console.log('✅ Added is_creator to coinflip_bets');
    
    // Add index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_challenges_creator 
      ON blockchain_challenges(creator_uuid);
    `);
    console.log('✅ Created index on creator_uuid');
    
    // Update existing records
    await pool.query(`
      UPDATE blockchain_challenges 
      SET creator_address = 'unknown' 
      WHERE creator_address IS NULL;
    `);
    console.log('✅ Updated existing records');
    
    // Create user_balances table for virtual balance tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_balances (
        wallet_address  TEXT PRIMARY KEY,
        deposited       BIGINT DEFAULT 0,
        available       BIGINT DEFAULT 0,
        locked          BIGINT DEFAULT 0,
        last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✅ Created user_balances table');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_balances_wallet ON user_balances(wallet_address);
    `);
    console.log('✅ Created index on user_balances');
    
    console.log('\n🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
