/**
 * Simple Coinflip API - Virtual betting with deposited balance
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Bruker deposited USDC fra QuestCastChallenge kontrakt
 * All game logic i database - super enkelt!
 */

const pool = require('../db/pool');

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

async function getDepositedBalance(walletAddress) {
  const contractAddress = process.env.QUESTCAST_CONTRACT_ADDRESS;
  if (!contractAddress || !walletAddress) return 0;

  const RPC_URLS = [
    process.env.POLYGON_RPC_URL,
    'https://1rpc.io/matic',
  ].filter(Boolean);

  for (const url of RPC_URLS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'eth_call',
          params: [{
            to: contractAddress,
            data: '0xf8b2cb4f000000000000000000000000' + walletAddress.slice(2),
          }, 'latest'],
        }),
        signal: AbortSignal.timeout(5000),
      });
      const d = await r.json();
      if (d.result) {
        const balance = parseInt(d.result, 16) / 1e6;
        return balance;
      }
    } catch (e) {
      continue;
    }
  }
  return 0;
}

// ═══════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/coinflip/create
 * Create new coinflip challenge (virtual)
 */
async function createChallenge(req, res) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { name, amount, choice } = req.body;
  const userWallet = req.user.walletAddress;
  const userUuid = req.user.uuid;

  if (!userWallet) {
    return res.status(400).json({ error: 'Wallet not connected' });
  }

  if (!name || !amount || !choice) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  if (choice !== 'heads' && choice !== 'tails') {
    return res.status(400).json({ error: 'Invalid choice' });
  }

  try {
    // Check deposited balance
    const balance = await getDepositedBalance(userWallet);
    if (balance < amount) {
      return res.status(400).json({ 
        error: `Insufficient balance. You have ${balance.toFixed(2)} USDC deposited.` 
      });
    }

    // Create challenge in database with unique ID
    const challengeId = Date.now();
    
    await pool.query(`
      INSERT INTO blockchain_challenges 
        (chain_id, challenge_type, status, name, description, entry_fee, max_players, creator_uuid, creator_address, created_at, contract_addr)
      VALUES 
        ($1, 'coinflip', 'open', $2, 'Virtual 1v1 coinflip', $3, 2, $4, $5, NOW(), $6)
    `, [challengeId, name, Math.floor(amount * 1e6), userUuid, userWallet.toLowerCase(), process.env.QUESTCAST_CONTRACT_ADDRESS || '0x0']);

    // Place creator's bet
    const feeAmount = Math.floor(amount * 0.02 * 1e6);
    const betAmount = Math.floor(amount * 1e6) - feeAmount;

    await pool.query(`
      INSERT INTO coinflip_bets 
        (challenge_id, user_address, user_uuid, amount, fee_paid, choice, is_creator, bet_at, tx_hash)
      VALUES 
        ($1, $2, $3, $4, $5, $6, true, NOW(), 'virtual')
    `, [challengeId, userWallet.toLowerCase(), userUuid, betAmount, feeAmount, choice]);

    // Update challenge pot
    await pool.query(`
      UPDATE blockchain_challenges 
      SET total_pot = $1, total_fee = $2
      WHERE chain_id = $3
    `, [betAmount, feeAmount, challengeId]);

    res.json({ 
      success: true, 
      challengeId,
      message: 'Challenge created! Waiting for opponent...'
    });

  } catch (error) {
    console.error('Create challenge error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/coinflip/:id/join
 * Join existing coinflip challenge
 */
async function joinChallenge(req, res) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const challengeId = parseInt(req.params.id);
  const userWallet = req.user.walletAddress;
  const userUuid = req.user.uuid;

  if (!userWallet) {
    return res.status(400).json({ error: 'Wallet not connected' });
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

    if (challenge.status !== 'open') {
      return res.status(400).json({ error: 'Challenge is not open' });
    }

    // Check if already joined
    const existingBet = await pool.query(`
      SELECT * FROM coinflip_bets 
      WHERE challenge_id = $1 AND user_address = $2
    `, [challengeId, userWallet.toLowerCase()]);

    if (existingBet.rows.length > 0) {
      return res.status(400).json({ error: 'Already joined this challenge' });
    }

    // Get creator's choice to determine opponent's choice
    const creatorBet = await pool.query(`
      SELECT choice FROM coinflip_bets 
      WHERE challenge_id = $1 AND is_creator = true
      LIMIT 1
    `, [challengeId]);

    if (creatorBet.rows.length === 0) {
      return res.status(400).json({ error: 'Creator bet not found' });
    }

    const creatorChoice = creatorBet.rows[0].choice;
    const yourChoice = creatorChoice === 'heads' ? 'tails' : 'heads';

    // Check balance
    const amount = challenge.entry_fee / 1e6;
    const balance = await getDepositedBalance(userWallet);
    
    if (balance < amount) {
      return res.status(400).json({ 
        error: `Insufficient balance. You need ${amount.toFixed(2)} USDC but have ${balance.toFixed(2)} USDC deposited.` 
      });
    }

    // Place bet
    const feeAmount = Math.floor(amount * 0.02 * 1e6);
    const betAmount = Math.floor(amount * 1e6) - feeAmount;

    await pool.query(`
      INSERT INTO coinflip_bets 
        (challenge_id, user_address, user_uuid, amount, fee_paid, choice, is_creator, bet_at, tx_hash)
      VALUES 
        ($1, $2, $3, $4, $5, $6, false, NOW(), 'virtual')
    `, [challengeId, userWallet.toLowerCase(), userUuid, betAmount, feeAmount, yourChoice]);

    // Lock challenge
    await pool.query(`
      UPDATE blockchain_challenges 
      SET status = 'locked', locked_at = NOW(), total_pot = total_pot + $1, total_fee = total_fee + $2
      WHERE chain_id = $3
    `, [betAmount, feeAmount, challengeId]);

    res.json({ 
      success: true,
      message: `Joined! You bet on ${yourChoice}. Admin will settle soon.`,
      yourChoice
    });

  } catch (error) {
    console.error('Join challenge error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/coinflip/:id/claim
 * Claim prize (just marks as claimed, doesn't transfer)
 */
async function claimPrize(req, res) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const challengeId = parseInt(req.params.id);
  const userWallet = req.user.walletAddress;

  if (!userWallet) {
    return res.status(400).json({ error: 'Wallet not connected' });
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

    if (challenge.status !== 'settled') {
      return res.status(400).json({ error: 'Challenge not settled yet' });
    }

    // Get user's bet
    const betResult = await pool.query(`
      SELECT * FROM coinflip_bets 
      WHERE challenge_id = $1 AND user_address = $2
    `, [challengeId, userWallet.toLowerCase()]);

    if (betResult.rows.length === 0) {
      return res.status(404).json({ error: 'No bet found' });
    }

    const bet = betResult.rows[0];

    if (bet.claimed) {
      return res.status(400).json({ error: 'Already claimed' });
    }

    // Check if winner
    if (bet.choice !== challenge.outcome) {
      return res.status(400).json({ error: 'You are not the winner' });
    }

    // Calculate payout (winner gets everything)
    const payout = challenge.total_pot;

    // Mark as claimed
    await pool.query(`
      UPDATE coinflip_bets 
      SET claimed = true, payout = $1
      WHERE challenge_id = $2 AND user_address = $3
    `, [payout, challengeId, userWallet.toLowerCase()]);

    res.json({ 
      success: true,
      payout: payout / 1e6,
      message: `You won ${(payout / 1e6).toFixed(2)} USDC! (Virtual - contact admin to withdraw)`
    });

  } catch (error) {
    console.error('Claim prize error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/coinflip/list
 * List all challenges
 */
async function listChallenges(req, res) {
  try {
    const result = await pool.query(`
      SELECT * FROM blockchain_challenges 
      WHERE challenge_type = 'coinflip'
      ORDER BY created_at DESC
      LIMIT 50
    `);

    const challenges = [];

    for (const row of result.rows) {
      const betsResult = await pool.query(`
        SELECT * FROM coinflip_bets WHERE challenge_id = $1
      `, [row.chain_id]);

      challenges.push({
        id: row.chain_id,
        name: row.name,
        status: row.status,
        entryFee: row.entry_fee / 1e6,
        totalPot: row.total_pot / 1e6,
        outcome: row.outcome,
        createdAt: row.created_at,
        bets: betsResult.rows.map(b => ({
          userAddress: b.user_address,
          amount: b.amount / 1e6,
          choice: b.choice,
          isCreator: b.is_creator,
          claimed: b.claimed
        }))
      });
    }

    res.json({ challenges });

  } catch (error) {
    console.error('List challenges error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/coinflip/:id
 * Get single challenge with bets
 */
async function getChallenge(req, res) {
  const challengeId = parseInt(req.params.id);

  try {
    const challengeResult = await pool.query(`
      SELECT * FROM blockchain_challenges WHERE chain_id = $1
    `, [challengeId]);

    if (challengeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challenge = challengeResult.rows[0];

    const betsResult = await pool.query(`
      SELECT * FROM coinflip_bets WHERE challenge_id = $1
    `, [challengeId]);

    res.json({
      challenge: {
        id: challenge.chain_id,
        name: challenge.name,
        status: challenge.status,
        entry_fee: challenge.entry_fee,
        totalPot: challenge.total_pot,
        outcome: challenge.outcome,
        createdAt: challenge.created_at,
        lockedAt: challenge.locked_at,
        settledAt: challenge.settled_at
      },
      bets: betsResult.rows.map(b => ({
        user_address: b.user_address,
        amount: b.amount,
        choice: b.choice,
        is_creator: b.is_creator,
        claimed: b.claimed,
        payout: b.payout
      }))
    });

  } catch (error) {
    console.error('Get challenge error:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createChallenge,
  joinChallenge,
  claimPrize,
  listChallenges,
  getChallenge
};
