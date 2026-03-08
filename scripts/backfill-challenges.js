/**
 * Backfill Script - Sync Existing Blockchain Challenges to Database
 * ═════════════════════════════════════════════════════════════════
 * 
 * Kjør dette MANUELT for å synkronisere challenges som allerede eksisterer
 * på blockchain før event-sync service ble startet.
 * 
 * Usage: node scripts/backfill-challenges.js [START_ID] [END_ID]
 */

require('dotenv').config();
const { ethers } = require('ethers');
const pool = require('../db/pool');

const CHALLENGE_HUB_ADDRESS = process.env.CHALLENGE_HUB_ADDRESS;
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL;

if (!CHALLENGE_HUB_ADDRESS || !POLYGON_RPC_URL) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const CHALLENGE_HUB_ABI = [
  "function challenges(uint256) external view returns (uint256 id, uint8 challengeType, uint8 status, string name, string description, uint256 entryFee, uint256 maxPlayers, address creator, uint256 createdAt, uint256 lockedAt, uint256 settledAt, bytes32 outcome, uint256 totalPot, uint256 totalFeeCollected)",
  "function coinFlipBets(uint256 challengeId, address user) external view returns (uint256 amount, bool isHeads, bool claimed)",
  "function getCoinFlipPlayers(uint256 challengeId) external view returns (address[] memory)"
];

const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
const contract = new ethers.Contract(CHALLENGE_HUB_ADDRESS, CHALLENGE_HUB_ABI, provider);

function mapStatus(statusCode) {
  const map = ['open', 'locked', 'settled', 'refunded'];
  return map[statusCode] || 'unknown';
}

function mapOutcome(outcomeHash) {
  if (!outcomeHash || outcomeHash === ethers.ZeroHash) return null;
  const headsHash = ethers.id('heads');
  return outcomeHash === headsHash ? 'kron' : 'mynt';
}

async function backfillChallenge(challengeId) {
  try {
    console.log(`\n📥 Syncing Challenge #${challengeId}...`);

    // Fetch challenge data from blockchain
    const challenge = await contract.challenges(challengeId);
    const [id, challengeType, status, name, description, entryFee, maxPlayers, 
           creator, createdAt, lockedAt, settledAt, outcome, totalPot, totalFeeCollected] = challenge;

    // Check if it's a valid challenge (id > 0 means it exists)
    if (id.toString() === '0') {
      console.log(`   ⏭️  Challenge #${challengeId} does not exist`);
      return false;
    }

    console.log(`   Name: ${name}`);
    console.log(`   Status: ${mapStatus(status)}`);
    console.log(`   Entry Fee: ${ethers.formatUnits(entryFee, 6)} USDC`);

    // Insert challenge into blockchain_challenges
    await pool.query(`
      INSERT INTO blockchain_challenges (
        chain_id, challenge_type, status, name, entry_fee, 
        max_players, creator_address, created_at, outcome, contract_addr
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8), $9, $10)
      ON CONFLICT (chain_id) DO UPDATE SET
        status = EXCLUDED.status,
        outcome = EXCLUDED.outcome
    `, [
      challengeId.toString(),
      'coinflip',
      mapStatus(status),
      name,
      entryFee.toString(),
      Number(maxPlayers),
      creator.toLowerCase(),
      Number(createdAt),
      mapOutcome(outcome),
      CHALLENGE_HUB_ADDRESS.toLowerCase()
    ]);

    console.log(`   ✅ Challenge inserted/updated in database`);

    // Fetch and sync bets (try to get players if getCoinFlipPlayers exists)
    try {
      // Manual fallback: Try both creator and common addresses
      const playersToCheck = [creator.toLowerCase()];
      
      // If you know the player addresses, add them here:
      // playersToCheck.push('0x...other_player_address');

      for (const player of playersToCheck) {
        try {
          const bet = await contract.coinFlipBets(challengeId, player);
          const [amount, isHeads, claimed] = bet;

          if (amount > 0n) {
            console.log(`   💰 Found bet: ${player.slice(0, 8)}... - ${ethers.formatUnits(amount, 6)} USDC - ${isHeads ? 'Kron' : 'Mynt'}`);

            // Calculate fee (2%)
            const totalAmount = amount * 100n / 98n; // Reverse calculation
            const fee = totalAmount - amount;

            await pool.query(`
              INSERT INTO coinflip_bets (
                challenge_id, user_address, amount, fee_paid, 
                choice, is_creator, claimed, tx_hash
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              ON CONFLICT (challenge_id, user_address) DO UPDATE SET
                claimed = EXCLUDED.claimed
            `, [
              challengeId.toString(),
              player.toLowerCase(),
              amount.toString(),
              fee.toString(),
              isHeads ? 'kron' : 'mynt',
              player.toLowerCase() === creator.toLowerCase(),
              claimed,
              'backfill' // No tx_hash available for backfilled data
            ]);

            console.log(`      ✅ Bet synced to database`);
          }
        } catch (err) {
          // Player hasn't bet, skip
        }
      }
    } catch (err) {
      console.log(`   ⚠️  Could not fetch bets: ${err.message}`);
    }

    return true;

  } catch (error) {
    console.error(`   ❌ Error syncing challenge #${challengeId}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔄 Backfill Blockchain Challenges');
  console.log('═════════════════════════════════════════════\n');

  const args = process.argv.slice(2);
  const startId = args[0] ? parseInt(args[0]) : 1;
  const endId = args[1] ? parseInt(args[1]) : 20;

  console.log(`📊 Scanning challenges ${startId} to ${endId}...\n`);

  let synced = 0;
  let errors = 0;

  for (let id = startId; id <= endId; id++) {
    const success = await backfillChallenge(id);
    if (success) synced++;
    else errors++;

    // Rate limit to avoid RPC throttling
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n═════════════════════════════════════════════');
  console.log(`✅ Backfill complete!`);
  console.log(`   Synced: ${synced}`);
  console.log(`   Errors: ${errors}`);
  console.log('═════════════════════════════════════════════\n');

  await pool.end();
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  pool.end();
  process.exit(1);
});
