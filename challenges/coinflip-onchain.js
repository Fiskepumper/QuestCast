/**
 * On-Chain Coinflip API - Real betting via ChallengeHub smart contract
 * ═══════════════════════════════════════════════════════════════════
 * 
 * USDC flyten:
 * 1. User depositer USDC til ChallengeHub via approve + deposit
 * 2. User lager challenge eller joiner via joinCoinFlip (true=Kron, false=Mynt)
 * 3. Auto-locks når 2 spillere har betted
 * 4. Backend Oracle setter outcome automatisk
 * 5. Winner claimer prize via claimPrize
 */

const { ethers } = require('ethers');
const pool = require('../db/pool');

// ═══════════════════════════════════════════════════════════════════
// CONTRACT SETUP
// ═══════════════════════════════════════════════════════════════════

const CHALLENGE_HUB_ADDRESS = process.env.CHALLENGE_HUB_ADDRESS;
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL;

const CHALLENGE_HUB_ABI = [
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function getBalance(address user) external view returns (uint256)",
  "function createCoinFlipChallenge(string name, string description, uint256 entryFee) external returns (uint256)",
  "function joinCoinFlip(uint256 challengeId, bool isHeads) external",
  "function settleCoinFlip(uint256 challengeId, bool outcomeIsHeads) external",
  "function claimPrize(uint256 challengeId) external",
  "function challenges(uint256) external view returns (uint256 id, uint8 challengeType, uint8 status, string name, string description, uint256 entryFee, uint256 maxPlayers, address creator, uint256 createdAt, uint256 lockedAt, uint256 settledAt, bytes32 outcome, uint256 totalPot, uint256 totalFeeCollected)",
  "function coinFlipBets(uint256 challengeId, address user) external view returns (uint256 amount, bool isHeads, bool claimed)",
  "event ChallengeCreated(uint256 indexed id, uint8 challengeType, string name, uint256 entryFee)",
  "event BetPlaced(uint256 indexed challengeId, address indexed user, uint256 amountAfterFee, uint256 feeAmount, bool isHeads)",
  "event ChallengeLocked(uint256 indexed challengeId, uint256 timestamp)",
  "event ChallengeSettled(uint256 indexed challengeId, bytes32 outcome, uint256 winnerCount, uint256 payoutPerWinner)",
  "event PrizeClaimed(uint256 indexed challengeId, address indexed user, uint256 amount)"
];

function getProvider() {
  return new ethers.JsonRpcProvider(POLYGON_RPC_URL);
}

function getContract(signerOrProvider) {
  return new ethers.Contract(CHALLENGE_HUB_ADDRESS, CHALLENGE_HUB_ABI, signerOrProvider);
}

// ═══════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/coinflip/balance
 * Get user's on-chain balance in ChallengeHub
 */
async function getBalance(req, res) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userWallet = req.user.walletAddress;
  if (!userWallet) {
    return res.status(400).json({ error: 'Wallet not connected' });
  }

  try {
    const provider = getProvider();
    const contract = getContract(provider);
    
    const balance = await contract.getBalance(userWallet);
    const balanceUsdc = Number(balance) / 1e6;

    res.json({
      success: true,
      balance: balanceUsdc,
      balanceMicro: balance.toString(),
      wallet: userWallet,
      contractAddress: CHALLENGE_HUB_ADDRESS
    });

  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/coinflip/create
 * Create new coinflip challenge on-chain
 * Body: { name, amount, choice }
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

  if (choice !== 'kron' && choice !== 'mynt') {
    return res.status(400).json({ error: 'Invalid choice. Must be "kron" or "mynt"' });
  }

  try {
    // Convert choice to boolean: kron=true (heads), mynt=false (tails)
    const isHeads = choice === 'kron';
    const amountMicro = Math.floor(amount * 1e6);

    // Return transaction data for frontend to execute
    // (User må kalle createCoinFlipChallenge + joinCoinFlip fra MetaMask)
    res.json({
      success: true,
      message: 'Prepare transaction in MetaMask',
      transactions: [
        {
          type: 'createChallenge',
          to: CHALLENGE_HUB_ADDRESS,
          method: 'createCoinFlipChallenge',
          params: [name, `1v1 Coinflip - ${choice}`, amountMicro]
        }
      ],
      choice: isHeads,
      choiceText: choice
    });

  } catch (error) {
    console.error('Create challenge error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/coinflip/list
 * List all open challenges from blockchain
 */
async function listChallenges(req, res) {
  try {
    // Hent fra database cache (synced via events)
    const result = await pool.query(`
      SELECT * FROM blockchain_challenges 
      WHERE challenge_type = 'coinflip' AND status = 'open'
      ORDER BY created_at DESC
      LIMIT 50
    `);

    const challenges = result.rows.map(row => ({
      id: row.chain_id.toString(),
      name: row.name,
      entryFee: Number(row.entry_fee) / 1e6,
      players: `${row.participantCount || 0}/${row.max_players}`,
      status: row.status,
      creatorAddress: row.creator_address,
      createdAt: row.created_at
    }));

    res.json({ success: true, challenges });

  } catch (error) {
    console.error('List challenges error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/coinflip/:id
 * Get challenge details from blockchain
 */
async function getChallenge(req, res) {
  const challengeId = req.params.id;

  try {
    const provider = getProvider();
    const contract = getContract(provider);

    const challenge = await contract.challenges(challengeId);
    
    const [id, challengeType, status, name, description, entryFee, maxPlayers, 
           creator, createdAt, lockedAt, settledAt, outcome, totalPot, totalFeeCollected] = challenge;

    // Status mapping: 0=Open, 1=Locked, 2=Settled, 3=Refunded
    const statusMap = ['open', 'locked', 'settled', 'refunded'];

    // Outcome mapping
    let outcomeText = null;
    if (outcome !== ethers.ZeroHash) {
      outcomeText = outcome === ethers.id('heads') ? 'kron' : 'mynt';
    }

    res.json({
      success: true,
      challenge: {
        id: id.toString(),
        name,
        description,
        entryFee: Number(entryFee) / 1e6,
        maxPlayers: Number(maxPlayers),
        status: statusMap[status],
        creator,
        totalPot: Number(totalPot) / 1e6,
        totalFee: Number(totalFeeCollected) / 1e6,
        outcome: outcomeText,
        createdAt: Number(createdAt),
        lockedAt: Number(lockedAt),
        settledAt: Number(settledAt)
      }
    });

  } catch (error) {
    console.error('Get challenge error:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getBalance,
  createChallenge,
  listChallenges,
  getChallenge
};
