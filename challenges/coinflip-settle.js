/**
 * Simple admin Settlement API for virtual coinflip
 */

const pool = require('../db/pool');

/**
 * POST /api/coinflip/:id/settle
 * Admin settles a coinflip (picks winner)
 */
async function settleChallenge(req, res) {
  const challengeId = parseInt(req.params.id);
  const { outcome, adminSecret } = req.body;

  // Simple admin check
  const correctSecret = process.env.ADMIN_SECRET || 'admin123';
  if (adminSecret !== correctSecret) {
    return res.status(403).json({ error: 'Invalid admin secret' });
  }

  if (outcome !== 'heads' && outcome !== 'tails') {
    return res.status(400).json({ error: 'Invalid outcome. Must be "heads" or "tails"' });
  }

  try {
    // Get challenge
    const challengeResult = await pool.query(`
      SELECT * FROM blockchain_challenges WHERE chain_id = $1
    `, [challengeId]);

    if (challengeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challenge = challengeResult.rows[0];

    if (challenge.status !== 'locked') {
      return res.status(400).json({ error: 'Challenge must be locked before settling' });
    }

    // Update challenge
    await pool.query(`
      UPDATE blockchain_challenges 
      SET status = 'settled', outcome = $1, settled_at = NOW()
      WHERE chain_id = $2
    `, [outcome, challengeId]);

    // Get winner info
    const winnerResult = await pool.query(`
      SELECT * FROM coinflip_bets 
      WHERE challenge_id = $1 AND choice = $2
    `, [challengeId, outcome]);

    const winner = winnerResult.rows[0];

    res.json({ 
      success: true,
      outcome,
      winner: winner ? {
        address: winner.user_address,
        payout: challenge.total_pot / 1e6
      } : null,
      message: `Challenge settled! Winner: ${outcome}`
    });

  } catch (error) {
    console.error('Settle challenge error:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  settleChallenge
};
