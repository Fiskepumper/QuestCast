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

    // Get all bets
    const betsResult = await pool.query(`
      SELECT * FROM coinflip_bets WHERE challenge_id = $1
    `, [challengeId]);

    const bets = betsResult.rows;
    const winner = bets.find(b => b.choice === outcome);
    const loser = bets.find(b => b.choice !== outcome);

    // Total pot goes to winner
    const totalPayout = parseInt(challenge.total_pot);
    const entryFee = parseInt(challenge.entry_fee);

    if (winner) {
      // UNLOCK WINNER: Release locked funds + give them the pot
      await pool.query(`
        UPDATE user_balances 
        SET locked = locked - $1, available = available + $2, updated_at = NOW()
        WHERE wallet_address = $3
      `, [entryFee, entryFee + totalPayout, winner.user_address.toLowerCase()]);

      // Update winner's payout in bets table
      await pool.query(`
        UPDATE coinflip_bets 
        SET payout = $1, claimed = true
        WHERE challenge_id = $2 AND user_address = $3
      `, [totalPayout, challengeId, winner.user_address.toLowerCase()]);
    }

    if (loser) {
      // UNLOCK LOSER: Just release their locked funds (they lose the money)
      await pool.query(`
        UPDATE user_balances 
        SET locked = locked - $1, updated_at = NOW()
        WHERE wallet_address = $2
      `, [entryFee, loser.user_address.toLowerCase()]);
    }

    res.json({ 
      success: true,
      outcome,
      winner: winner ? {
        address: winner.user_address,
        payout: totalPayout / 1e6
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
