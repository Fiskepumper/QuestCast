/**
 * ChallengeHub Blockchain Integration
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Håndterer all smart contract interaksjon via MetaMask
 */

// ═══════════════════════════════════════════════════════════════════
// CONTRACT CONFIG
// ═══════════════════════════════════════════════════════════════════

const CHALLENGE_HUB_ADDRESS = '0x4377a75104E29b43f8bE89dF12Aa1ed01Ac5F39B';
const USDC_CONTRACT = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';

const CHALLENGE_HUB_ABI = [
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function getBalance(address user) external view returns (uint256)",
  "function createCoinFlipChallenge(string name, string description, uint256 entryFee) external returns (uint256)",
  "function joinCoinFlip(uint256 challengeId, bool isHeads) external",
  "function claimPrize(uint256 challengeId) external",
  "function challenges(uint256) external view returns (uint256 id, uint8 challengeType, uint8 status, string name, string description, uint256 entryFee, uint256 maxPlayers, address creator, uint256 createdAt, uint256 lockedAt, uint256 settledAt, bytes32 outcome, uint256 totalPot, uint256 totalFeeCollected)",
  "function coinFlipBets(uint256 challengeId, address user) external view returns (uint256 amount, bool isHeads, bool claimed)"
];

const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)"
];

// ═══════════════════════════════════════════════════════════════════
// METAMASK CONNECTION
// ═══════════════════════════════════════════════════════════════════

let provider = null;
let signer = null;
let challengeHubContract = null;
let usdcContract = null;
let userAddress = null;

async function connectMetaMask() {
  if (typeof window.ethereum === 'undefined') {
    alert('❌ MetaMask is not installed! Please install MetaMask to use this feature.');
    window.open('https://metamask.io/download/', '_blank');
    return false;
  }

  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    // Check network
    const network = await provider.getNetwork();
    if (network.chainId !== 137n) {
      alert('⚠️ Please switch to Polygon Mainnet in MetaMask!');
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x89' }], // 137 in hex
        });
      } catch (switchError) {
        console.error('Failed to switch network:', switchError);
        return false;
      }
    }

    // Initialize contracts
    challengeHubContract = new ethers.Contract(CHALLENGE_HUB_ADDRESS, CHALLENGE_HUB_ABI, signer);
    usdcContract = new ethers.Contract(USDC_CONTRACT, USDC_ABI, signer);

    console.log('✅ MetaMask connected:', userAddress);
    return true;

  } catch (error) {
    console.error('MetaMask connection error:', error);
    alert('❌ Failed to connect MetaMask: ' + error.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// BALANCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get user's internal balance in ChallengeHub
 */
async function getInternalBalance() {
  if (!challengeHubContract || !userAddress) return '0';
  
  try {
    const balance = await challengeHubContract.getBalance(userAddress);
    return ethers.formatUnits(balance, 6); // USDC has 6 decimals
  } catch (error) {
    console.error('Get balance error:', error);
    return '0';
  }
}

/**
 * Get user's USDC balance in wallet
 */
async function getWalletBalance() {
  if (!usdcContract || !userAddress) return '0';
  
  try {
    const balance = await usdcContract.balanceOf(userAddress);
    return ethers.formatUnits(balance, 6);
  } catch (error) {
    console.error('Get wallet balance error:', error);
    return '0';
  }
}

// ═══════════════════════════════════════════════════════════════════
// DEPOSIT & WITHDRAW
// ═══════════════════════════════════════════════════════════════════

/**
 * Deposit USDC to ChallengeHub internal balance
 * @param {string} amount Amount in USDC (e.g., "10.5")
 */
async function depositUSDC(amount) {
  if (!await connectMetaMask()) return;

  try {
    const amountBigInt = ethers.parseUnits(amount, 6);

    // Step 1: Check allowance
    const allowance = await usdcContract.allowance(userAddress, CHALLENGE_HUB_ADDRESS);
    
    if (allowance < amountBigInt) {
      console.log('📝 Requesting USDC approval...');
      const approveTx = await usdcContract.approve(CHALLENGE_HUB_ADDRESS, amountBigInt);
      await approveTx.wait();
      console.log('✅ USDC approved');
    }

    // Step 2: Deposit
    console.log('💰 Depositing USDC...');
    const depositTx = await challengeHubContract.deposit(amountBigInt);
    await depositTx.wait();
    
    console.log('✅ Deposit successful!');
    return true;

  } catch (error) {
    console.error('Deposit error:', error);
    alert('❌ Deposit failed: ' + error.message);
    return false;
  }
}

/**
 * Withdraw USDC from ChallengeHub to wallet
 * @param {string} amount Amount in USDC (e.g., "10.5")
 */
async function withdrawUSDC(amount) {
  if (!await connectMetaMask()) return;

  try {
    const amountBigInt = ethers.parseUnits(amount, 6);

    console.log('💸 Withdrawing USDC...');
    const tx = await challengeHubContract.withdraw(amountBigInt);
    await tx.wait();
    
    console.log('✅ Withdrawal successful!');
    return true;

  } catch (error) {
    console.error('Withdraw error:', error);
    alert('❌ Withdrawal failed: ' + error.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// CHALLENGE CREATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Create new coinflip challenge on-chain
 * @param {object} params { name, amount, choice }
 * @returns {number|null} Challenge ID or null if failed
 */
async function createChallengeOnChain(params) {
  if (!await connectMetaMask()) return null;

  const { name, amount, choice } = params;
  const isHeads = choice === 'kron';
  
  try {
    const amountBigInt = ethers.parseUnits(amount, 6);

    // Step 1: Create challenge
    console.log('🎲 Creating challenge...');
    const createTx = await challengeHubContract.createCoinFlipChallenge(
      name,
      `1v1 Coinflip - ${choice}`,
      amountBigInt
    );
    const createReceipt = await createTx.wait();

    // Get challenge ID from event
    const event = createReceipt.logs.find(log => {
      try {
        const parsed = challengeHubContract.interface.parseLog(log);
        return parsed.name === 'ChallengeCreated';
      } catch {
        return false;
      }
    });

    if (!event) {
      throw new Error('Failed to get challenge ID from event');
    }

    const parsed = challengeHubContract.interface.parseLog(event);
    const challengeId = parsed.args[0].toString();

    console.log('✅ Challenge created! ID:', challengeId);

    // Step 2: Join own challenge (place bet)
    console.log('💰 Placing bet...');
    const joinTx = await challengeHubContract.joinCoinFlip(challengeId, isHeads);
    await joinTx.wait();

    console.log('✅ Bet placed!');
    return challengeId;

  } catch (error) {
    console.error('Create challenge error:', error);
    alert('❌ Failed to create challenge: ' + error.message);
    return null;
  }
}

/**
 * Join existing challenge
 * @param {number} challengeId Challenge ID
 * @param {string} choice 'kron' or 'mynt'
 */
async function joinChallengeOnChain(challengeId, choice) {
  if (!await connectMetaMask()) return false;

  const isHeads = choice === 'kron';
  
  try {
    console.log('💰 Joining challenge...');
    const tx = await challengeHubContract.joinCoinFlip(challengeId, isHeads);
    await tx.wait();

    console.log('✅ Successfully joined challenge!');
    return true;

  } catch (error) {
    console.error('Join challenge error:', error);
    alert('❌ Failed to join challenge: ' + error.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// CLAIM PRIZE
// ═══════════════════════════════════════════════════════════════════

/**
 * Claim prize for won challenge
 * @param {number} challengeId Challenge ID
 */
async function claimPrizeOnChain(challengeId) {
  if (!await connectMetaMask()) return false;

  try {
    console.log('🏆 Claiming prize...');
    const tx = await challengeHubContract.claimPrize(challengeId);
    await tx.wait();

    console.log('✅ Prize claimed!');
    return true;

  } catch (error) {
    console.error('Claim prize error:', error);
    alert('❌ Failed to claim prize: ' + error.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// CHALLENGE DETAILS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get challenge details from blockchain
 * @param {number} challengeId Challenge ID
 */
async function getChallengeDetails(challengeId) {
  if (!challengeHubContract) {
    await connectMetaMask();
  }

  try {
    const challenge = await challengeHubContract.challenges(challengeId);
    const [id, challengeType, status, name, description, entryFee, maxPlayers, 
           creator, createdAt, lockedAt, settledAt, outcome, totalPot, totalFeeCollected] = challenge;

    const statusMap = ['open', 'locked', 'settled', 'refunded'];
    
    let outcomeText = null;
    if (outcome !== ethers.ZeroHash) {
      const headsHash = ethers.id('heads');
      outcomeText = outcome === headsHash ? 'kron' : 'mynt';
    }

    return {
      id: id.toString(),
      name,
      description,
      entryFee: ethers.formatUnits(entryFee, 6),
      maxPlayers: Number(maxPlayers),
      status: statusMap[status],
      creator,
      totalPot: ethers.formatUnits(totalPot, 6),
      totalFee: ethers.formatUnits(totalFeeCollected, 6),
      outcome: outcomeText,
      createdAt: Number(createdAt),
      lockedAt: Number(lockedAt),
      settledAt: Number(settledAt)
    };

  } catch (error) {
    console.error('Get challenge details error:', error);
    return null;
  }
}

/**
 * Get user's bet for a challenge
 * @param {number} challengeId Challenge ID
 * @param {string} address User address
 */
async function getUserBet(challengeId, address) {
  if (!challengeHubContract) {
    await connectMetaMask();
  }

  try {
    const bet = await challengeHubContract.coinFlipBets(challengeId, address);
    const [amount, isHeads, claimed] = bet;

    if (amount === 0n) {
      return null;
    }

    return {
      amount: ethers.formatUnits(amount, 6),
      choice: isHeads ? 'kron' : 'mynt',
      claimed
    };

  } catch (error) {
    console.error('Get user bet error:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS (make functions available globally)
// ═══════════════════════════════════════════════════════════════════

window.ChallengeHub = {
  connectMetaMask,
  getInternalBalance,
  getWalletBalance,
  depositUSDC,
  withdrawUSDC,
  createChallengeOnChain,
  joinChallengeOnChain,
  claimPrizeOnChain,
  getChallengeDetails,
  getUserBet
};
