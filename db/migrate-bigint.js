/**
 * Migration: Change chain_id from INTEGER to BIGINT
 */
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔄 Migrating chain_id to BIGINT...');
    
    // Drop foreign key constraint first
    await client.query(`
      ALTER TABLE coinflip_bets 
      DROP CONSTRAINT IF EXISTS coinflip_bets_challenge_id_fkey
    `);
    
    // Change column types
    await client.query(`
      ALTER TABLE blockchain_challenges 
      ALTER COLUMN chain_id TYPE BIGINT
    `);
    
    await client.query(`
      ALTER TABLE coinflip_bets 
      ALTER COLUMN challenge_id TYPE BIGINT
    `);
    
    // Recreate foreign key constraint
    await client.query(`
      ALTER TABLE coinflip_bets 
      ADD CONSTRAINT coinflip_bets_challenge_id_fkey 
      FOREIGN KEY (challenge_id) 
      REFERENCES blockchain_challenges(chain_id)
    `);
    
    await client.query('COMMIT');
    console.log('✅ Migration complete!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
