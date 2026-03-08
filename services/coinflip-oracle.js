/**
 * Backend Oracle for ChallengeHub Auto-Settlement
 * ═════════════════════════════════════════════════════════════
 * 
 * Dette scriptet:
 * 1. Lytter til ChallengeLocked events fra ChallengeHub contract
 * 2. Genererer kryptografisk sikker random boolean (Kron/Mynt)
 * 3. Kaller settleCoinFlip(challengeId, outcome) automatisk
 * 
 * ⚠️ TRUST MODEL: Backend kontrollerer outcomes via private key
 *    - For MVP: Akseptabelt (brukere stoler på oss)
 *    - For produksjon: Bør byttes til Chainlink VRF
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const CHALLENGE_HUB_ADDRESS = process.env.CHALLENGE_HUB_ADDRESS;
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!CHALLENGE_HUB_ADDRESS || !POLYGON_RPC_URL || !DEPLOYER_PRIVATE_KEY) {
  console.error('❌ Missing environment variables!');
  console.error('Required: CHALLENGE_HUB_ADDRESS, POLYGON_RPC_URL, DEPLOYER_PRIVATE_KEY');
  process.exit(1);
}

const CHALLENGE_HUB_ABI = [
  "function settleCoinFlip(uint256 challengeId, bool outcomeIsHeads) external",
  "function challenges(uint256) external view returns (uint256 id, uint8 challengeType, uint8 status, string name, string description, uint256 entryFee, uint256 maxPlayers, address creator, uint256 createdAt, uint256 lockedAt, uint256 settledAt, bytes32 outcome, uint256 totalPot, uint256 totalFeeCollected)",
  "event ChallengeLocked(uint256 indexed challengeId, uint256 timestamp)",
  "event ChallengeSettled(uint256 indexed challengeId, bytes32 outcome, uint256 winnerCount, uint256 payoutPerWinner)"
];

// ═══════════════════════════════════════════════════════════════════
// BLOCKCHAIN CONNECTION
// ═══════════════════════════════════════════════════════════════════

const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(CHALLENGE_HUB_ADDRESS, CHALLENGE_HUB_ABI, wallet);

console.log('🎰 Coinflip Oracle Service Starting...');
console.log('═══════════════════════════════════');
console.log('📍 ChallengeHub:', CHALLENGE_HUB_ADDRESS);
console.log('🔑 Oracle Wallet:', wallet.address);
console.log('🌐 Network: Polygon Mainnet');
console.log('═══════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════════
// RANDOM GENERATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate cryptographically secure random boolean
 * @returns {boolean} true = KRON (heads), false = MYNT (tails)
 */
function generateRandomOutcome() {
  const buffer = crypto.randomBytes(32);
  const firstByte = buffer[0];
  const isHeads = firstByte % 2 === 0;
  
  console.log(`   🎲 Random: ${buffer.toString('hex').substring(0, 16)}...`);
  console.log(`   📊 Result: ${isHeads ? '👑 KRON (Heads)' : '🪙 MYNT (Tails)'}`);
  
  return isHeads;
}

// ═══════════════════════════════════════════════════════════════════
// SETTLEMENT LOGIC
// ═══════════════════════════════════════════════════════════════════

/**
 * Settle a locked challenge by calling settleCoinFlip on-chain
 */
async function settleChallengeOnChain(challengeId) {
  try {
    console.log(`\n🔧 Settling Challenge #${challengeId}...`);

    // 1. Verify challenge is locked
    const challenge = await contract.challenges(challengeId);
    const status = challenge[2]; // status field
    
    if (status !== 1) {
      console.log(`   ⏭️  Challenge not locked (status=${status}), skipping`);
      return;
    }

    // 2. Generate random outcome
    const outcomeIsHeads = generateRandomOutcome();

    // 3. Estimate gas
    const gasEstimate = await contract.settleCoinFlip.estimateGas(challengeId, outcomeIsHeads);
    console.log(`   ⛽ Gas estimate: ${gasEstimate.toString()}`);

    // 4. Send transaction
    const tx = await contract.settleCoinFlip(challengeId, outcomeIsHeads, {
      gasLimit: gasEstimate * 120n / 100n // 20% buffer
    });

    console.log(`   📤 Transaction sent: ${tx.hash}`);
    console.log(`   ⏳ Waiting for confirmation...`);

    // 5. Wait for confirmation
    const receipt = await tx.wait();
    
    console.log(`   ✅ SETTLED! Block ${receipt.blockNumber}`);
    console.log(`   🎉 Outcome: ${outcomeIsHeads ? '👑 KRON' : '🪙 MYNT'}`);
    console.log(`   💰 Gas used: ${receipt.gasUsed.toString()} (${ethers.formatUnits(receipt.gasUsed * receipt.gasPrice, 'ether')} POL)`);

  } catch (error) {
    console.error(`   ❌ Settlement failed for challenge ${challengeId}:`, error.message);
    
    // Log detailed error for debugging
    if (error.info) {
      console.error('   🔍 Error details:', error.info);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// EVENT LISTENER
// ═══════════════════════════════════════════════════════════════════

/**
 * Listen for ChallengeLocked events and auto-settle
 */
async function startListener() {
  console.log('👂 Listening for ChallengeLocked events...\n');

  // Listen to new events
  contract.on('ChallengeLocked', async (challengeId, timestamp, event) => {
    console.log(`\n🔒 CHALLENGE LOCKED!`);
    console.log(`   ID: ${challengeId.toString()}`);
    console.log(`   Time: ${new Date(Number(timestamp) * 1000).toISOString()}`);
    console.log(`   Block: ${event.log.blockNumber}`);

    // Settle after 2 seconds delay (for safety/testing)
    setTimeout(async () => {
      await settleChallengeOnChain(challengeId.toString());
    }, 2000);
  });

  console.log('✅ Listener active! Press Ctrl+C to stop.\n');
}

// ═══════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════

async function main() {
  try {
    // Check wallet balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Oracle wallet balance: ${ethers.formatEther(balance)} POL\n`);

    if (balance < ethers.parseEther('0.1')) {
      console.warn('⚠️  WARNING: Low POL balance! Settlement transactions may fail.\n');
    }

    // Start event listener
    await startListener();

  } catch (error) {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down oracle service...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down oracle service...');
  process.exit(0);
});

// Start the service
main();
