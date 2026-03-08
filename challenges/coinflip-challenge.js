/**
 * Coin Flip Challenges - Integrasjon med hovedsiden
 * 
 * Viser aktive 1v1 coinflip-matches på forsiden
 */

const pool = require('../db/pool');

module.exports = {
  id: 6,
  uuid: 'coinflip-1v1-system',
  
  async getData() {
    try {
      // Hent alle åpne coinflip challenges (venter på opponent)
      const result = await pool.query(`
        SELECT 
          bc.chain_id,
          bc.name,
          bc.entry_fee,
          bc.status,
          bc.created_at,
          u.username as creator_username,
          u.uuid as creator_uuid,
          COUNT(cb.id) as participant_count
        FROM blockchain_challenges bc
        LEFT JOIN users u ON bc.creator_uuid = u.uuid
        LEFT JOIN coinflip_bets cb ON bc.chain_id = cb.challenge_id
        WHERE bc.challenge_type = 'coinflip'
          AND bc.status IN ('open', 'locked')
        GROUP BY bc.chain_id, bc.name, bc.entry_fee, bc.status, bc.created_at, u.username, u.uuid
        ORDER BY bc.created_at DESC
        LIMIT 10
      `);
      
      const activeChallenges = result.rows.length;
      const totalPot = result.rows.reduce((sum, row) => sum + parseInt(row.entry_fee || 0), 0);
      
      return {
        id: this.id,
        uuid: this.uuid,
        title: '🪙 Coin Flip (1v1)',
        description: `1v1 betting på Heads vs Tails. Winner takes all! ${activeChallenges} aktive dueller.`,
        goal: null, // No fixed goal for coinflip
        current: activeChallenges,
        unit: 'aktive matches',
        participants: result.rows.map(row => ({
          id: row.chain_id,
          creator: row.creator_username || 'Anonymous',
          creatorUuid: row.creator_uuid,
          amount: (parseInt(row.entry_fee) / 1e6).toFixed(2) + ' USDC',
          status: row.status,
          participantCount: parseInt(row.participant_count),
          needsOpponent: row.status === 'open' && parseInt(row.participant_count) < 2
        })),
        link: '/coinflip',
        type: 'monetary' // Special type for monetary challenges
      };
    } catch (error) {
      console.error('[coinflip-challenge] Error:', error);
      return {
        id: this.id,
        uuid: this.uuid,
        title: '🪙 Coin Flip (1v1)',
        description: 'Loading...',
        goal: null,
        current: 0,
        unit: 'aktive matches',
        participants: [],
        link: '/coinflip',
        type: 'monetary'
      };
    }
  }
};
