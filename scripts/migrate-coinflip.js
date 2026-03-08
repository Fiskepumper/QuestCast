/**
 * Database Migration - Add coinflip tables
 * Run: node scripts/migrate-coinflip.js
 */

require('dotenv').config();
const pool = require('../db/pool');

async function migrate() {
  console.log('🔄 Running database migration for coinflip...\n');
  
  try {
    // Add new columns to blockchain_challenges if table exists
    console.log('📝 Updating blockchain_challenges table...');
    
    await pool.query(`
      ALTER TABLE blockchain_challenges 
      ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 2,
      ADD COLUMN IF NOT EXISTS creator_uuid TEXT REFERENCES users(uuid),
      ADD COLUMN IF NOT EXISTS creator_address TEXT;
    `);
    
    console.log('✅ blockchain_challenges updated');
    
    // Add new column to coinflip_bets
    console.log('📝 Updating coinflip_bets table...');
    
    await pool.query(`
      ALTER TABLE coinflip_bets 
      ADD COLUMN IF NOT EXISTS is_creator BOOLEAN DEFAULT false;
    `);
    
    console.log('✅ coinflip_bets updated');
    
    // Add index on creator
    console.log('📝 Adding indexes...');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_challenges_creator 
      ON blockchain_challenges(creator_uuid);
    `);
    
    console.log('✅ Indexes created');
    
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

migrate();
