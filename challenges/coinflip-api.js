/**
 * Coin Flip Challenge Backend API
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Backend koordinerer mellom blockchain og database:
 * - DB brukes for rask UI og historikk
 * - Blockchain er sannheten for penger og utfall
 * - API lytter til events og synkroniserer
 */

const { ethers } = require('ethers');
const pool = require('../db/pool');

// ABI for ChallengeHub (lagt til manuelt - generer med `npx hardhat compile`)
const CHALLENGE_HUB_ABI = [
  "function challengeCount() view returns (uint256)",
  "function getChallenge(uint256 id) view returns (tuple(uint256 id, uint8 challengeType, uint8 status, string name, string description, uint256 entryFee, uint256 createdAt, uint256 lockedAt, uint256 settledAt, bytes32 outcome, uint256 totalPot, uint256 totalFeeCollected))",
  "function getBet(uint256 challengeId, address user) view returns (tuple(uint256 amount, bool isHeads, bool claimed))",
  "function getParticipants(uint256 challengeId) view returns (address[])",
  "function getPots(uint256 challengeId) view returns (uint256 headsPot, uint256 tailsPot)",
  "function calculatePotentialPayout(uint256 challengeId, address user) view returns (uint256)",
  "function createCoinFlipChallenge(string name, string description, uint256 entryFee) returns (uint256)",
  "function lockChallenge(uint256 challengeId)",
  "function settleCoinFlip(uint256 challengeId, bool outcomeIsHeads)",
  "function refundChallenge(uint256 challengeId)",
  "event ChallengeCreated(uint256 indexed id, uint8 challengeType, string name, uint256 entryFee)",
  "event BetPlaced(uint256 indexed challengeId, address indexed user, uint256 amountAfterFee, uint256 feeAmount, bool isHeads)",
  "event ChallengeLocked(uint256 indexed challengeId, uint256 timestamp)",
  "event ChallengeSettled(uint256 indexed challengeId, bytes32 outcome, uint256 winnerCount, uint256 payoutPerWinner)",
  "event ChallengeRefunded(uint256 indexed challengeId, uint256 participantCount)"
];

// Status mappings
const StatusEnum = {
  0: 'open',
  1: 'locked',
  2: 'settled',
  3: 'refunded'
};

const ChallengeTypeEnum = {
  0: 'coinflip',
  1: 'sports',
  2: 'oracle'
};

// ═══════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════

function getProvider() {
  const rpcUrl = process.env.POLYGON_RPC_URL || 
    `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`;
  return new ethers.JsonRpcProvider(rpcUrl);
}

function getContract(signerOrProvider) {
  const contractAddress = process.env.CHALLENGE_HUB_ADDRESS;
  if (!contractAddress) {
    throw new Error('CHALLENGE_HUB_ADDRESS not set in .env');
  }
  return new ethers.Contract(contractAddress, CHALLENGE_HUB_ABI, signerOrProvider);
}

function getSigner() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY not set in .env');
  }
  const provider = getProvider();
  return new ethers.Wallet(privateKey, provider);
}

// ═══════════════════════════════════════════════════════════════════
// DATABASE HELPERS
// ═══════════════════════════════════════════════════════════════════

async function upsertChallenge(chainId, challengeData, txHash = null, creatorAddress = null, creatorUuid = null) {
  const { challengeType, status, name, description, entryFee, maxPlayers, creator, totalPot, totalFeeCollected, outcome, createdAt, lockedAt, settledAt } = challengeData;
  
  const statusStr = StatusEnum[status] || 'unknown';
  const typeStr = ChallengeTypeEnum[challengeType] || 'unknown';
  const outcomeStr = outcome && outcome !== ethers.ZeroHash 
    ? (outcome === ethers.keccak256(ethers.toUtf8Bytes('heads')) ? 'heads' : 'tails')
    : null;

  await pool.query(`
    INSERT INTO blockchain_challenges 
      (chain_id, challenge_type, status, name, description, entry_fee, max_players, creator_address, creator_uuid, total_pot, total_fee, outcome, created_at, locked_at, settled_at, tx_hash, contract_addr)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, to_timestamp($13), to_timestamp($14), to_timestamp($15), $16, $17)
    ON CONFLICT (chain_id) DO UPDATE SET
      status = EXCLUDED.status,
      total_pot = EXCLUDED.total_pot,
      total_fee = EXCLUDED.total_fee,
      outcome = EXCLUDED.outcome,
      locked_at = EXCLUDED.locked_at,
      settled_at = EXCLUDED.settled_at
  `, [
    chainId, typeStr, statusStr, name, description, 
    entryFee.toString(), 
    maxPlayers || 2,
    (creator || creatorAddress || '').toLowerCase(),
    creatorUuid,
    totalPot.toString(), 
    totalFeeCollected.toString(),
    outcomeStr, 
    Number(createdAt), 
    lockedAt > 0 ? Number(lockedAt) : null,
    settledAt > 0 ? Number(settledAt) : null,
    txHash,
    process.env.CHALLENGE_HUB_ADDRESS
  ]);
}

async function upsertBet(challengeId, userAddress, betData, feePaid, txHash) {
  const { amount, isHeads } = betData;
  
  await pool.query(`
    INSERT INTO coinflip_bets 
      (challenge_id, user_address, amount, fee_paid, choice, tx_hash)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (challenge_id, user_address) DO UPDATE SET
      amount = EXCLUDED.amount,
      fee_paid = EXCLUDED.fee_paid,
      choice = EXCLUDED.choice
  `, [
    challengeId,
    userAddress.toLowerCase(),
    amount.toString(),
    feePaid.toString(),
    isHeads ? 'heads' : 'tails',
    txHash
  ]);
}

// ═══════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/coinflip/list - List alle coinflip challenges
 */
async function listChallenges(req, res) {
  try {
    const { status } = req.query; // 'open', 'locked', 'settled', 'refunded'
    
    let query = `
      SELECT 
        chain_id, challenge_type, status, name, description, 
        entry_fee, total_pot, total_fee, outcome,
        created_at, locked_at, settled_at
      FROM blockchain_challenges
      WHERE challenge_type = 'coinflip'
    `;
    
    const params = [];
    if (status) {
      query += ` AND status = $1`;
      params.push(status);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await pool.query(query, params);
    
    res.json({
      challenges: result.rows.map(row => ({
        id: row.chain_id,
        type: row.challenge_type,
        status: row.status,
        name: row.name,
        description: row.description,
        entryFee: row.entry_fee,
        totalPot: row.total_pot,
        totalFee: row.total_fee,
        outcome: row.outcome,
        createdAt: row.created_at,
        lockedAt: row.locked_at,
        settledAt: row.settled_at
      }))
    });
  } catch (error) {
    console.error('[coinflip/list] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/coinflip/:id - Hent detaljer om én challenge
 */
async function getChallenge(req, res) {
  try {
    const { id } = req.params;
    const { address } = req.query; // Optional: brukerens wallet for å se deres bet
    
    // Hent fra DB
    const result = await pool.query(`
      SELECT * FROM blockchain_challenges WHERE chain_id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }
    
    const challenge = result.rows[0];
    
    // Hent alle bets
    const betsResult = await pool.query(`
      SELECT user_address, amount, fee_paid, choice, claimed, payout, bet_at
      FROM coinflip_bets
      WHERE challenge_id = $1
      ORDER BY bet_at ASC
    `, [id]);
    
    // Beregn pots
    let headsPot = 0;
    let tailsPot = 0;
    
    betsResult.rows.forEach(bet => {
      if (bet.choice === 'heads') headsPot += parseInt(bet.amount);
      else tailsPot += parseInt(bet.amount);
    });
    
    // Hvis bruker er logget inn, hent deres bet
    let userBet = null;
    if (address) {
      const userBetResult = await pool.query(`
        SELECT * FROM coinflip_bets 
        WHERE challenge_id = $1 AND user_address = $2
      `, [id, address.toLowerCase()]);
      
      if (userBetResult.rows.length > 0) {
        userBet = userBetResult.rows[0];
      }
    }
    
    res.json({
      challenge: {
        id: challenge.chain_id,
        type: challenge.challenge_type,
        status: challenge.status,
        name: challenge.name,
        description: challenge.description,
        entryFee: challenge.entry_fee,
        totalPot: challenge.total_pot,
        totalFee: challenge.total_fee,
        outcome: challenge.outcome,
        createdAt: challenge.created_at,
        lockedAt: challenge.locked_at,
        settledAt: challenge.settled_at
      },
      pots: {
        heads: headsPot.toString(),
        tails: tailsPot.toString()
      },
      bets: betsResult.rows,
      userBet
    });
  } catch (error) {
    console.error('[coinflip/:id] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/coinflip/create - Bruker: Opprett nytt 1v1 coinflip challenge
 * Body: { name, description, entryFee, walletAddress, userUuid }
 */
async function createChallenge(req, res) {
  try {
    const { name, description, entryFee, walletAddress, userUuid } = req.body;
    
    if (!name || entryFee === undefined || !walletAddress) {
      return res.status(400).json({ error: 'Name, entryFee, and walletAddress required' });
    }
    
    if (entryFee <= 0) {
      return res.status(400).json({ error: 'Entry fee must be > 0 for 1v1' });
    }
    
    // User mints their own transaction (not admin)
    // Frontend will handle the actual blockchain transaction
    // This endpoint just validates and prepares the data
    
    res.json({
      success: true,
      message: 'Ready to create challenge. Call contract from frontend.',
      data: {
        name,
        description: description || '',
        entryFee,
        walletAddress: walletAddress.toLowerCase(),
        userUuid
      }
    });
  } catch (error) {
    console.error('[coinflip/create] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/coinflip/:id/record - Record challenge creation in DB (after blockchain)
 * Body: { txHash, walletAddress, userUuid }
 */
async function recordChallengeCreation(req, res) {
  try {
    const { id } = req.params;
    const { txHash, walletAddress, userUuid } = req.body;
    
    // Fetch challenge data from blockchain
    const provider = getProvider();
    const contract = getContract(provider);
    const challengeData = await contract.getChallenge(id);
    
    // Link creator
    await upsertChallenge(
      Number(id), 
      challengeData, 
      txHash,
      walletAddress?.toLowerCase(),
      userUuid
    );
    
    res.json({
      success: true,
      challengeId: Number(id)
    });
  } catch (error) {
    console.error('[coinflip/record] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/coinflip/:id/lock - Admin: Lås challenge (stopp betting)
 */
async function lockChallenge(req, res) {
  try {
    const { id } = req.params;
    
    const signer = getSigner();
    const contract = getContract(signer);
    
    const tx = await contract.lockChallenge(id);
    await tx.wait();
    
    // Update DB
    await pool.query(`
      UPDATE blockchain_challenges 
      SET status = 'locked', locked_at = NOW()
      WHERE chain_id = $1
    `, [id]);
    
    res.json({
      success: true,
      txHash: tx.hash
    });
  } catch (error) {
    console.error('[coinflip/:id/lock] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/coinflip/:id/settle - Admin: Sett utfall og distribute prizes
 * Body: { outcome: 'heads' | 'tails' }
 */
async function settleChallenge(req, res) {
  try {
    const { id } = req.params;
    const { outcome } = req.body;
    
    if (!outcome || !['heads', 'tails'].includes(outcome)) {
      return res.status(400).json({ error: 'Outcome must be "heads" or "tails"' });
    }
    
    const signer = getSigner();
    const contract = getContract(signer);
    
    const outcomeIsHeads = outcome === 'heads';
    
    const tx = await contract.settleCoinFlip(id, outcomeIsHeads);
    await tx.wait();
    
    // Update DB
    await pool.query(`
      UPDATE blockchain_challenges 
      SET status = 'settled', outcome = $1, settled_at = NOW()
      WHERE chain_id = $2
    `, [outcome, id]);
    
    res.json({
      success: true,
      outcome,
      txHash: tx.hash
    });
  } catch (error) {
    console.error('[coinflip/:id/settle] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/coinflip/:id/refund - Admin: Refund alle deltakere
 */
async function refundChallenge(req, res) {
  try {
    const { id } = req.params;
    
    const signer = getSigner();
    const contract = getContract(signer);
    
    const tx = await contract.refundChallenge(id);
    await tx.wait();
    
    // Update DB
    await pool.query(`
      UPDATE blockchain_challenges 
      SET status = 'refunded'
      WHERE chain_id = $1
    `, [id]);
    
    res.json({
      success: true,
      txHash: tx.hash
    });
  } catch (error) {
    console.error('[coinflip/:id/refund] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/coinflip/:id/sync - Synkroniser challenge fra blockchain til DB
 */
async function syncChallenge(req, res) {
  try {
    const { id } = req.params;
    
    const provider = getProvider();
    const contract = getContract(provider);
    
    // Hent challenge data fra chain
    const challengeData = await contract.getChallenge(id);
    
    // Hent participants
    const participants = await contract.getParticipants(id);
    
    // Upsert challenge
    await upsertChallenge(Number(id), challengeData);
    
    // Sync alle bets
    for (const participant of participants) {
      const betData = await contract.getBet(id, participant);
      if (betData.amount > 0) {
        // Vi har ikke txHash her, så vi setter null
        await upsertBet(Number(id), participant, betData, 0n, null);
      }
    }
    
    res.json({
      success: true,
      participants: participants.length
    });
  } catch (error) {
    console.error('[coinflip/:id/sync] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  listChallenges,
  getChallenge,
  createChallenge,
  recordChallengeCreation,
  lockChallenge,
  settleChallenge,
  refundChallenge,
  syncChallenge,
  getContract,
  getProvider
};
