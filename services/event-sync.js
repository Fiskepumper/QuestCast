/**
 * Event Sync Service for ChallengeHub Contract
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Lytter til on-chain events og synkroniserer til database:
 * - ChallengeCreated → Opprett rad i blockchain_challenges + coinflip_bets
 * - BetPlaced → Opprett rad i coinflip_bets for joiner
 * - ChallengeLocked → Oppdater status til 'locked'
 * - ChallengeSettled → Oppdater outcome + status til 'settled'
 * - PrizeClaimed → Marker bet som claimed
 */

const { ethers } = require('ethers');
const pool = require('../db/pool');

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const CHALLENGE_HUB_ADDRESS = process.env.CHALLENGE_HUB_ADDRESS;
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL;

if (!CHALLENGE_HUB_ADDRESS || !POLYGON_RPC_URL) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const CHALLENGE_HUB_ABI = [
  "function challenges(uint256) external view returns (uint256 id, uint8 challengeType, uint8 status, string name, string description, uint256 entryFee, uint256 maxPlayers, address creator, uint256 createdAt, uint256 lockedAt, uint256 settledAt, bytes32 outcome, uint256 totalPot, uint256 totalFeeCollected)",
  "function coinFlipBets(uint256 challengeId, address user) external view returns (uint256 amount, bool isHeads, bool claimed)",
  "event ChallengeCreated(uint256 indexed id, uint8 challengeType, string name, uint256 entryFee)",
  "event BetPlaced(uint256 indexed challengeId, address indexed user, uint256 amountAfterFee, uint256 feeAmount, bool isHeads)",
  "event ChallengeLocked(uint256 indexed challengeId, uint256 timestamp)",
  "event ChallengeSettled(uint256 indexed challengeId, bytes32 outcome, uint256 winnerCount, uint256 payoutPerWinner)",
  "event PrizeClaimed(uint256 indexed challengeId, address indexed user, uint256 amount)"
];

const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
const contract = new ethers.Contract(CHALLENGE_HUB_ADDRESS, CHALLENGE_HUB_ABI, provider);

console.log('📡 Event Sync Service Starting...');
console.log('═══════════════════════════════════');
console.log('📍 ChallengeHub:', CHALLENGE_HUB_ADDRESS);
console.log('🌐 Network: Polygon Mainnet');
console.log('═══════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function mapStatus(statusCode) {
  const map = ['open', 'locked', 'settled', 'refunded'];
  return map[statusCode] || 'unknown';
}

function mapOutcome(outcomeHash) {
  if (outcomeHash === ethers.ZeroHash || outcomeHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    return null;
  }
  // Smart contract stores: keccak256("heads") or keccak256("tails")
  // We map to Norwegian: kron (heads), mynt (tails)
  const headsHash = ethers.id('heads');
  return outcomeHash === headsHash ? 'kron' : 'mynt';
}

function boolToChoice(isHeads) {
  return isHeads ? 'kron' : 'mynt';
}

// ═══════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Handle ChallengeCreated event
 */
async function handleChallengeCreated(challengeId, challengeType, name, entryFee, event) {
  try {
    console.log(`\n📝 ChallengeCreated: #${challengeId}`);
    console.log(`   Name: ${name}`);
    console.log(`   Entry Fee: ${ethers.formatUnits(entryFee, 6)} USDC`);

    // Fetch full challenge details from contract
    const challenge = await contract.challenges(challengeId);
    const [id, type, status, cName, description, cEntryFee, maxPlayers, creator, createdAt] = challenge;

    // Insert into blockchain_challenges
    await pool.query(`
      INSERT INTO blockchain_challenges (
        chain_id, challenge_type, status, name, entry_fee, 
        max_players, creator_address, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8))
      ON CONFLICT (chain_id) DO NOTHING
    `, [
      challengeId.toString(),
      'coinflip',
      mapStatus(status),
      cName,
      cEntryFee.toString(),
      Number(maxPlayers),
      creator.toLowerCase(),
      Number(createdAt)
    ]);

    console.log('   ✅ Synced to database');

  } catch (error) {
    console.error('   ❌ Error handling ChallengeCreated:', error.message);
  }
}

/**
 * Handle BetPlaced event
 */
async function handleBetPlaced(challengeId, user, amountAfterFee, feeAmount, isHeads, event) {
  try {
    console.log(`\n💰 BetPlaced: Challenge #${challengeId}`);
    console.log(`   User: ${user}`);
    console.log(`   Amount: ${ethers.formatUnits(amountAfterFee, 6)} USDC (+ ${ethers.formatUnits(feeAmount, 6)} fee)`);
    console.log(`   Choice: ${boolToChoice(isHeads)}`);

    // Check if user exists (try to find or create anonymous user)
    const userResult = await pool.query(
      'SELECT uuid FROM users WHERE wallet_address = $1',
      [user.toLowerCase()]
    );

    let userUuid;
    if (userResult.rows.length === 0) {
      // Create anonymous user
      const insertResult = await pool.query(`
        INSERT INTO users (wallet_address, display_name, created_at)
        VALUES ($1, $2, NOW())
        RETURNING uuid
      `, [user.toLowerCase(), `User ${user.slice(0, 6)}...${user.slice(-4)}`]);
      userUuid = insertResult.rows[0].uuid;
    } else {
      userUuid = userResult.rows[0].uuid;
    }

    // Check if this is the creator or joiner
    const challengeResult = await pool.query(
      'SELECT creator_address FROM blockchain_challenges WHERE chain_id = $1',
      [challengeId.toString()]
    );

    const isCreator = challengeResult.rows.length > 0 &&
                      challengeResult.rows[0].creator_address.toLowerCase() === user.toLowerCase();

    // Insert bet
    await pool.query(`
      INSERT INTO coinflip_bets (
        challenge_id, user_uuid, amount, choice, is_creator, created_at
      ) VALUES (
        (SELECT id FROM blockchain_challenges WHERE chain_id = $1),
        $2, $3, $4, $5, NOW()
      )
      ON CONFLICT (challenge_id, user_uuid) DO NOTHING
    `, [
      challengeId.toString(),
      userUuid,
      amountAfterFee.toString(),
      boolToChoice(isHeads),
      isCreator
    ]);

    console.log('   ✅ Bet synced to database');

  } catch (error) {
    console.error('   ❌ Error handling BetPlaced:', error.message);
  }
}

/**
 * Handle ChallengeLocked event
 */
async function handleChallengeLocked(challengeId, timestamp, event) {
  try {
    console.log(`\n🔒 ChallengeLocked: #${challengeId}`);
    console.log(`   Time: ${new Date(Number(timestamp) * 1000).toISOString()}`);

    await pool.query(`
      UPDATE blockchain_challenges
      SET status = 'locked', locked_at = to_timestamp($2)
      WHERE chain_id = $1
    `, [challengeId.toString(), Number(timestamp)]);

    console.log('   ✅ Status updated to locked');

  } catch (error) {
    console.error('   ❌ Error handling ChallengeLocked:', error.message);
  }
}

/**
 * Handle ChallengeSettled event
 */
async function handleChallengeSettled(challengeId, outcome, winnerCount, payoutPerWinner, event) {
  try {
    console.log(`\n🎉 ChallengeSettled: #${challengeId}`);
    console.log(`   Outcome: ${mapOutcome(outcome)}`);
    console.log(`   Winners: ${winnerCount.toString()}`);
    console.log(`   Payout: ${ethers.formatUnits(payoutPerWinner, 6)} USDC each`);

    const outcomeText = mapOutcome(outcome);

    await pool.query(`
      UPDATE blockchain_challenges
      SET status = 'settled', outcome = $2, settled_at = NOW()
      WHERE chain_id = $1
    `, [challengeId.toString(), outcomeText]);

    // Update payout for winners
    await pool.query(`
      UPDATE coinflip_bets
      SET payout = $3
      WHERE challenge_id = (SELECT id FROM blockchain_challenges WHERE chain_id = $1)
        AND choice = $2
    `, [challengeId.toString(), outcomeText, payoutPerWinner.toString()]);

    console.log('   ✅ Settlement synced to database');

  } catch (error) {
    console.error('   ❌ Error handling ChallengeSettled:', error.message);
  }
}

/**
 * Handle PrizeClaimed event
 */
async function handlePrizeClaimed(challengeId, user, amount, event) {
  try {
    console.log(`\n💎 PrizeClaimed: Challenge #${challengeId}`);
    console.log(`   User: ${user}`);
    console.log(`   Amount: ${ethers.formatUnits(amount, 6)} USDC`);

    await pool.query(`
      UPDATE coinflip_bets
      SET claimed = TRUE
      WHERE challenge_id = (SELECT id FROM blockchain_challenges WHERE chain_id = $1)
        AND user_uuid = (SELECT uuid FROM users WHERE wallet_address = $2)
    `, [challengeId.toString(), user.toLowerCase()]);

    console.log('   ✅ Claim status updated');

  } catch (error) {
    console.error('   ❌ Error handling PrizeClaimed:', error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════

async function startListeners() {
  console.log('👂 Starting event listeners...\n');

  contract.on('ChallengeCreated', handleChallengeCreated);
  contract.on('BetPlaced', handleBetPlaced);
  contract.on('ChallengeLocked', handleChallengeLocked);
  contract.on('ChallengeSettled', handleChallengeSettled);
  contract.on('PrizeClaimed', handlePrizeClaimed);

  console.log('✅ All listeners active!\n');
}

// ═══════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════

async function main() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected\n');

    // Start listeners
    await startListeners();

    console.log('📡 Listening for events... Press Ctrl+C to stop.\n');

  } catch (error) {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down event sync service...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down event sync service...');
  process.exit(0);
});

// Start the service
main();
