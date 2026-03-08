/**
 * Coin Flip Challenge - Frontend JavaScript
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════

let currentFilter = 'all';
let walletAddress = null;
let usdcContract = null;
let challengeHubContract = null;
let provider = null;
let signer = null;

// Read from window config (set by backend)
const CHALLENGE_HUB_ADDRESS = window.CHALLENGE_HUB_ADDRESS || '';
const USDC_ADDRESS = window.USDC_ADDRESS || '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const CURRENT_USER_UUID = window.CURRENT_USER_UUID || '';

// ABIs (minimal) - UPDATED for new contract
const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
];

const CHALLENGE_HUB_ABI = [
  "function createCoinFlipChallenge(string name, string description, uint256 entryFee) returns (uint256)",
  "function joinCoinFlip(uint256 challengeId, bool isHeads)",
  "function claimPrize(uint256 challengeId)",
  "function claimRefund(uint256 challengeId)",
  "function getBet(uint256 challengeId, address user) view returns (tuple(uint256 amount, bool isHeads, bool claimed))",
  "event ChallengeCreated(uint256 indexed id, uint8 challengeType, string name, uint256 entryFee)",
  "event BetPlaced(uint256 indexed challengeId, address indexed user, uint256 amountAfterFee, uint256 feeAmount, bool isHeads)",
  "event ChallengeLocked(uint256 indexed challengeId, uint256 timestamp)"
];

// ═══════════════════════════════════════════════════════════════════
// WALLET CONNECTION
// ═══════════════════════════════════════════════════════════════════

async function setupWallet() {
  const connectBtn = document.getElementById('connectWalletBtn');
  
  if (connectBtn) {
    connectBtn.addEventListener('click', connectWallet);
  }
  
  // Check if already connected
  if (window.ethereum) {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accounts.length > 0) {
      await connectWallet();
    }
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    alert('MetaMask ikke installert! Last ned fra metamask.io');
    return;
  }
  
  try {
    // Request accounts
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    walletAddress = accounts[0];
    
    // Setup ethers
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    
    // Setup contracts
    usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
    challengeHubContract = new ethers.Contract(CHALLENGE_HUB_ADDRESS, CHALLENGE_HUB_ABI, signer);
    
    // Update UI
    document.getElementById('walletDisconnected').style.display = 'none';
    document.getElementById('walletConnected').style.display = 'block';
    document.getElementById('walletAddress').textContent = 
      `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    
    // Load balance
    await updateWalletBalance();
    
    // Listen for account changes
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        location.reload();
      } else {
        walletAddress = accounts[0];
        connectWallet();
      }
    });
    
  } catch (error) {
    console.error('Wallet connection error:', error);
    alert('Kunne ikke koble til wallet: ' + error.message);
  }
}

async function updateWalletBalance() {
  if (!walletAddress) return;
  
  try {
    const response = await fetch(`/api/wallet-balances?address=${walletAddress}`);
    const data = await response.json();
    
    if (data.usdc !== undefined) {
      document.getElementById('usdcBalance').textContent = data.usdc;
    }
  } catch (error) {
    console.error('Failed to load balance:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════
// LOAD CHALLENGES
// ═══════════════════════════════════════════════════════════════════

async function loadChallenges(status = null) {
  const grid = document.getElementById('challengesGrid');
  grid.innerHTML = '<div class="loading">Laster challenges...</div>';
  
  try {
    const url = status && status !== 'all' 
      ? `/api/coinflip/list?status=${status}`
      : '/api/coinflip/list';
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.challenges.length === 0) {
      grid.innerHTML = '<div class="loading">Ingen challenges funnet</div>';
      return;
    }
    
    grid.innerHTML = '';
    
    for (const challenge of data.challenges) {
      const card = createChallengeCard(challenge);
      grid.appendChild(card);
    }
    
  } catch (error) {
    console.error('Failed to load challenges:', error);
    grid.innerHTML = '<div class="loading">Feil ved lasting av challenges</div>';
  }
}

function createChallengeCard(challenge) {
  const card = document.createElement('div');
  card.className = 'challenge-card';
  card.onclick = () => openBetModal(challenge.id);
  
  const statusClass = `status-${challenge.status}`;
  
  // Hent pots data
  fetch(`/api/coinflip/${challenge.id}`)
    .then(r => r.json())
    .then(data => {
      const headsAmount = (parseInt(data.pots.heads) / 1e6).toFixed(2);
      const tailsAmount = (parseInt(data.pots.tails) / 1e6).toFixed(2);
      
      card.querySelector('.pot-value.heads').textContent = `${headsAmount} USDC`;
      card.querySelector('.pot-value.tails').textContent = `${tailsAmount} USDC`;
    });
  
  card.innerHTML = `
    <div class="challenge-header">
      <h3 class="challenge-name">${challenge.name}</h3>
      <span class="challenge-status ${statusClass}">${challenge.status}</span>
    </div>
    
    <p class="challenge-desc">${challenge.description || 'Ingen beskrivelse'}</p>
    
    <div class="challenge-pots">
      <div class="pot-column">
        <div class="pot-label">👑 Heads</div>
        <div class="pot-value heads">... USDC</div>
      </div>
      <div class="pot-vs">VS</div>
      <div class="pot-column">
        <div class="pot-label">⚔️ Tails</div>
        <div class="pot-value tails">... USDC</div>
      </div>
    </div>
    
    <div class="challenge-footer">
      <div class="total-pot">
        Total pot: <strong>${(parseInt(challenge.totalPot) / 1e6).toFixed(2)} USDC</strong>
      </div>
      ${challenge.outcome ? `<div class="challenge-outcome">${challenge.outcome} vant!</div>` : ''}
    </div>
  `;
  
  return card;
}

// ═══════════════════════════════════════════════════════════════════
// BET MODAL
// ═══════════════════════════════════════════════════════════════════

async function openBetModal(challengeId) {
  const modal = document.getElementById('betModal');
  
  // Load challenge details
  try {
    const response = await fetch(`/api/coinflip/${challengeId}${walletAddress ? `?address=${walletAddress}` : ''}`);
    const data = await response.json();
    
    const challenge = data.challenge;
    
    // Populate modal
    document.getElementById('modalChallengeName').textContent = challenge.name;
    document.getElementById('modalChallengeDesc').textContent = challenge.description;
    document.getElementById('betChallengeId').value = challengeId;
    
    const headsAmount = (parseInt(data.pots.heads) / 1e6).toFixed(2);
    const tailsAmount = (parseInt(data.pots.tails) / 1e6).toFixed(2);
    
    document.getElementById('headsPot').textContent = `${headsAmount} USDC`;
    document.getElementById('tailsPot').textContent = `${tailsAmount} USDC`;
    
    const minBet = (parseInt(challenge.entryFee) / 1e6).toFixed(2);
    document.getElementById('minBet').textContent = minBet;
    document.getElementById('betAmount').min = minBet;
    
    // Check if user already has a bet
    if (data.userBet) {
      alert(`Du har allerede bettet ${(parseInt(data.userBet.amount) / 1e6).toFixed(2)} USDC på ${data.userBet.choice}`);
      
      // If settled and won, show claim button
      if (challenge.status === 'settled' && !data.userBet.claimed) {
        const isWinner = (challenge.outcome === 'heads' && data.userBet.choice === 'heads') ||
                        (challenge.outcome === 'tails' && data.userBet.choice === 'tails');
        
        if (isWinner) {
          if (confirm('Du vant! Claim din gevinst nå?')) {
            await claimPrize(challengeId);
          }
        }
      }
      
      return;
    }
    
    // Check if challenge is open
    if (challenge.status !== 'open') {
      alert('Dette challenget er ikke lenger åpent for betting');
      return;
    }
    
    // Show modal
    modal.classList.add('show');
    
  } catch (error) {
    console.error('Failed to load challenge:', error);
    alert('Kunne ikke laste challenge: ' + error.message);
  }
}

function setupBetModal() {
  const modal = document.getElementById('betModal');
  const closeBtn = modal.querySelector('.close');
  const form = document.getElementById('betForm');
  const choiceBtns = document.querySelectorAll('.choice-btn');
  const amountInput = document.getElementById('betAmount');
  
  // Close modal
  closeBtn.onclick = () => {
    modal.classList.remove('show');
  };
  
  window.onclick = (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
    }
  };
  
  // Choice selection
  choiceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      choiceBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('betChoice').value = btn.dataset.choice;
      updatePotentialPayout();
    });
  });
  
  // Amount input
  amountInput.addEventListener('input', updatePotentialPayout);
  
  // Form submit
  form.addEventListener('submit', handleBetSubmit);
}

function updatePotentialPayout() {
  const amount = parseFloat(document.getElementById('betAmount').value) || 0;
  const choice = document.getElementById('betChoice').value;
  
  if (!amount || !choice) {
    document.getElementById('potentialPayout').textContent = '-';
    return;
  }
  
  // Get pots
  const headsAmount = parseFloat(document.getElementById('headsPot').textContent);
  const tailsAmount = parseFloat(document.getElementById('tailsPot').textContent);
  
  // Calculate fee
  const fee = amount * 0.02;
  const amountAfterFee = amount - fee;
  
  // Calculate potential payout
  const myPot = choice === 'heads' ? headsAmount : tailsAmount;
  const otherPot = choice === 'heads' ? tailsAmount : headsAmount;
  const totalPot = myPot + otherPot + amountAfterFee;
  const winningPot = myPot + amountAfterFee;
  
  const payout = (amountAfterFee / winningPot) * totalPot;
  
  document.getElementById('potentialPayout').textContent = payout.toFixed(2);
}

async function handleBetSubmit(e) {
  e.preventDefault();
  
  if (!walletAddress) {
    alert('Koble til wallet først');
    await connectWallet();
    return;
  }
  
  const challengeId = document.getElementById('betChallengeId').value;
  const amount = parseFloat(document.getElementById('betAmount').value);
  const choice = document.getElementById('betChoice').value;
  
  if (!choice) {
    alert('Velg Heads eller Tails');
    return;
  }
  
  const status = document.getElementById('betStatus');
  
  try {
    status.className = 'bet-status loading';
    status.textContent = '⏳ Sjekker USDC allowance...';
    
    // Convert to USDC wei (6 decimals)
    const amountWei = ethers.parseUnits(amount.toString(), 6);
    
    // Check allowance
    const allowance = await usdcContract.allowance(walletAddress, CHALLENGE_HUB_ADDRESS);
    
    if (allowance < amountWei) {
      status.textContent = '⏳ Godkjenner USDC...';
      const approveTx = await usdcContract.approve(CHALLENGE_HUB_ADDRESS, amountWei);
      await approveTx.wait();
    }
    
    // Place bet
    status.textContent = '⏳ Sender bet til blockchain...';
    const isHeads = choice === 'heads';
    const tx = await challengeHubContract.joinCoinFlip(challengeId, amountWei, isHeads);
    
    status.textContent = '⏳ Venter på bekreftelse...';
    await tx.wait();
    
    status.className = 'bet-status success';
    status.textContent = '✅ Bet plassert! Lykke til!';
    
    // Reload balances
    await updateWalletBalance();
    
    // Close modal after 2 seconds
    setTimeout(() => {
      document.getElementById('betModal').classList.remove('show');
      loadChallenges(currentFilter);
    }, 2000);
    
  } catch (error) {
    console.error('Bet error:', error);
    status.className = 'bet-status error';
    status.textContent = '❌ Feil: ' + (error.reason || error.message);
  }
}

async function claimPrize(challengeId) {
  if (!walletAddress) {
    alert('Koble til wallet først');
    return;
  }
  
  try {
    const tx = await challengeHubContract.claimPrize(challengeId);
    alert('⏳ Sender claim til blockchain...');
    await tx.wait();
    alert('✅ Gevinst mottatt!');
    await updateWalletBalance();
    loadChallenges(currentFilter);
  } catch (error) {
    console.error('Claim error:', error);
    alert('❌ Feil: ' + (error.reason || error.message));
  }
}

// ═══════════════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════════════

function setupFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      currentFilter = btn.dataset.status;
      loadChallenges(currentFilter === 'all' ? null : currentFilter);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// LOAD ETHERS
// ═══════════════════════════════════════════════════════════════════

function loadEthers() {
  const script = document.createElement('script');
  script.src = 'https://cdn.ethers.io/lib/ethers-5.7.2.umd.min.js';
  script.onload = () => {
    console.log('Ethers.js loaded');
  };
  document.head.appendChild(script);
}

if (!window.ethers) {
  loadEthers();
}
