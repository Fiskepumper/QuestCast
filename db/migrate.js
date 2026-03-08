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
