/**
 * Coin Flip 1v1 - Frontend JavaScript
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════

let currentFilter = 'all';
let walletAddress = null;
let depositedBalance = 0;

const CURRENT_USER_UUID = window.CURRENT_USER_UUID || '';

// ═══════════════════════════════════════════════════════════════════
// WALLET CONNECTION
// ═══════════════════════════════════════════════════════════════════

async function setupWallet() {
  const createBtn = document.getElementById('createChallengeBtn');
  const depositBtn = document.getElementById('depositBtn');
  const withdrawBtn = document.getElementById('withdrawBtn');
  
  if (createBtn) {
    createBtn.addEventListener('click', openCreateModal);
  }
  
  if (depositBtn) {
    depositBtn.addEventListener('click', openDepositModal);
  }
  
  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', openWithdrawModal);
  }
  
  // Check if user is logged in (has wallet address from session)
  if (CURRENT_USER_UUID) {
    await loadUserBalance();
  }
}

async function loadUserBalance() {
  if (!CURRENT_USER_UUID) {
    // User not logged in
    document.getElementById('walletDisconnected').style.display = 'flex';
    document.getElementById('walletConnected').style.display = 'none';
    return;
  }
  
  try {
    // Get user info from session
    const response = await fetch('/api/user/me');
    const data = await response.json();
    
    if (data.error || !data.walletAddress) {
      document.getElementById('walletDisconnected').style.display = 'flex';
      document.getElementById('walletConnected').style.display = 'none';
      return;
    }
    
    walletAddress = data.walletAddress;
    
    // Get deposited balance from ChallengeHub contract
    const balanceResponse = await fetch(`/api/contract-balance?address=${walletAddress}`);
    const balanceData = await balanceResponse.json();
    
    depositedBalance = parseFloat(balanceData.usdc || '0');
    
    // Show wallet panel
    document.getElementById('walletDisconnected').style.display = 'none';
    document.getElementById('walletConnected').style.display = 'flex';
    document.getElementById('walletAddress').textContent = 
      `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    document.getElementById('usdcBalance').textContent = depositedBalance.toFixed(2);
    
  } catch (error) {
    console.error('Balance error:', error);
  }
}

async function updateBalance() {
  if (!walletAddress) return;
  
  try {
    const response = await fetch(`/api/contract-balance?address=${walletAddress}`);
    const data = await response.json();
    
    depositedBalance = parseFloat(data.usdc || '0');
    document.getElementById('usdcBalance').textContent = depositedBalance.toFixed(2);
  } catch (error) {
    console.error('Balance error:', error);
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
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.challenges || data.challenges.length === 0) {
      grid.innerHTML = `
        <div class="loading" style="text-align: center; padding: 40px;">
          <p>📭 Ingen challenges funnet i database.</p>
          <p style="margin-top: 10px; font-size: 14px; opacity: 0.7;">
            ⚠️ Event sync service kjører ikke i Azure ennå.<br>
            Challenges må hentes direkte fra blockchain.
          </p>
        </div>
      `;
      return;
    }
    
    grid.innerHTML = '';
    
    for (const challenge of data.challenges) {
      try {
        const detailResponse = await fetch(`/api/coinflip/${challenge.id}`);
        
        if (!detailResponse.ok) {
          console.warn(`Failed to load challenge ${challenge.id}`);
          continue;
        }
        
        const detail = await detailResponse.json();
        const card = createChallengeCard(challenge, detail);
        grid.appendChild(card);
      } catch (err) {
        console.error(`Error loading challenge ${challenge.id}:`, err);
        continue;
      }
    }
    
    // If no cards were added, show message
    if (grid.children.length === 0) {
      grid.innerHTML = `
        <div class="loading" style="text-align: center; padding: 40px;">
          <p>⚠️ Kunne ikke laste challenges</p>
          <p style="margin-top: 10px; font-size: 14px;">Event sync service må startes i Azure.</p>
        </div>
      `;
    }
    
  } catch (error) {
    console.error('Load error:', error);
    grid.innerHTML = `
      <div class="loading" style="text-align: center; padding: 40px;">
        <p>❌ Feil ved lasting av challenges</p>
        <p style="margin-top: 10px; font-size: 14px; opacity: 0.7;">
          ${error.message}
        </p>
        <p style="margin-top: 15px; font-size: 13px;">
          💡 Event sync service kjører ikke i Azure ennå.<br>
          Challenges må synkroniseres fra blockchain til database.
        </p>
      </div>
    `;
  }
}

function createChallengeCard(challenge, detail) {
  const card = document.createElement('div');
  card.className = 'challenge-card';
  
  const statusClass = `status-${challenge.status}`;
  const amount = (parseInt(challenge.entryFee) / 1e6).toFixed(2);
  const participantCount = detail.bets.length;
  const needsOpponent = challenge.status === 'open' && participantCount < 2;
  
  // Find creator info
  const creatorBet = detail.bets.find(b => b.is_creator);
  const creatorChoice = creatorBet ? creatorBet.choice : '?';
  
  // Check if current user is creator
  const isCreator = detail.bets.some(b => 
    b.user_address.toLowerCase() === walletAddress?.toLowerCase() && b.is_creator
  );
  
  // Check if current user already bet
  const userBet = detail.bets.find(b => 
    b.user_address.toLowerCase() === walletAddress?.toLowerCase()
  );
  
  card.innerHTML = `
    <div class="challenge-header">
      <h3 class="challenge-name">${challenge.name}</h3>
      <span class="challenge-status ${statusClass}">${challenge.status}</span>
    </div>
    
    <div class="challenge-details">
      <div class="detail-item">
        <span class="detail-label">Bet Amount:</span>
        <span class="detail-value">${amount} USDC</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Players:</span>
        <span class="detail-value">${participantCount} / 2</span>
      </div>
      ${creatorChoice !== '?' ? `
      <div class="detail-item">
        <span class="detail-label">Creator chose:</span>
        <span class="detail-value">
          <img src="/${creatorChoice === 'kron' ? 'Kron' : 'Mynt'}.png" alt="${creatorChoice}" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 5px;">
          ${creatorChoice === 'kron' ? 'Kron' : 'Mynt'}
        </span>
      </div>
      ` : ''}
    </div>
    
    ${needsOpponent ? `
      <div class="challenge-actions">
        ${!userBet ? `
          <button class="btn btn-primary" onclick="openJoinModal(${challenge.id}, '${challenge.name}', ${amount}, '${creatorChoice}')">
            💪 Accept Challenge
          </button>
        ` : `
          <div class="waiting-message">⏳ Waiting for opponent...</div>
        `}
      </div>
    ` : ''}
    
    ${challenge.status === 'settled' && challenge.outcome ? `
      <div class="challenge-outcome">
        Winner: <img src="/${challenge.outcome === 'kron' ? 'Kron' : 'Mynt'}.png" alt="${challenge.outcome}" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 5px;">
        ${challenge.outcome === 'kron' ? 'Kron' : 'Mynt'}
        ${userBet && !userBet.claimed && isWinner(userBet, challenge.outcome) ? `
          <button class="btn btn-success" onclick="claimPrize(${challenge.id})">
            Claim Prize
          </button>
        ` : ''}
      </div>
    ` : ''}
  `;
  
  return card;
}

function isWinner(bet, outcome) {
  return (bet.choice === 'kron' && outcome === 'kron') ||
         (bet.choice === 'mynt' && outcome === 'mynt');
}

// ═══════════════════════════════════════════════════════════════════
// CREATE CHALLENGE
// ═══════════════════════════════════════════════════════════════════

function openCreateModal() {
  if (!walletAddress) {
    console.error('Du må være logget inn først');
    document.getElementById('signup-modal').classList.add('open');
    return;
  }
  
  // Update balance in modal
  document.getElementById('modalBalance').textContent = depositedBalance.toFixed(2) + ' USDC';
  
  document.getElementById('createModal').classList.add('show');
}

function closeCreateModal() {
  document.getElementById('createModal').classList.remove('show');
}

function setupCreateModal() {
  const form = document.getElementById('createForm');
  const amountInput = document.getElementById('createAmount');
  const maxBtn = document.getElementById('maxAmountBtn');
  const choiceBtns = document.querySelectorAll('#createModal .choice-btn');
  
  // Choice selection
  choiceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      choiceBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('createChoice').value = btn.dataset.choice;
    });
  });
  
  // MAX button
  maxBtn.addEventListener('click', () => {
    amountInput.value = depositedBalance.toFixed(2);
    updateFeeDisplay(depositedBalance);
  });
  
  // Amount input
  amountInput.addEventListener('input', () => {
    const amount = parseFloat(amountInput.value) || 0;
    updateFeeDisplay(amount);
  });
  
  form.addEventListener('submit', handleCreateSubmit);
}

function updateFeeDisplay(amount) {
  const fee = amount * 0.02;
  document.getElementById('totalCost').textContent = amount.toFixed(2);
  document.getElementById('intoPot').textContent = (amount - fee).toFixed(2);
}

async function handleCreateSubmit(e) {
  e.preventDefault();
  
  const amount = parseFloat(document.getElementById('createAmount').value);
  
  if (!amount || amount <= 0) {
    const status = document.getElementById('createStatus');
    status.className = 'status-message error show';
    status.textContent = '⚠️ Enter a valid amount';
    return;
  }
  
  const choice = document.getElementById('createChoice').value;
  
  if (!choice) {
    const status = document.getElementById('createStatus');
    status.className = 'status-message error show';
    status.textContent = '⚠️ Velg Kron eller Mynt';
    return;
  }
  
  // Check balance
  if (amount > depositedBalance) {
    const status = document.getElementById('createStatus');
    status.className = 'status-message error show';
    status.textContent = `❌ Insufficient balance. You have ${depositedBalance.toFixed(2)} USDC deposited.`;
    setTimeout(() => {
      status.textContent += ' Go to your profile to deposit more USDC.';
    }, 2000);
    return;
  }
  
  const status = document.getElementById('createStatus');
  
  try {
    status.className = 'status-message loading show';
    status.textContent = '⏳ Creating challenge on blockchain...';
    
    // Generate a simple name
    const name = `Coinflip ${Date.now()}`;
    
    // Create challenge on-chain via MetaMask
    const challengeId = await window.ChallengeHub.createChallengeOnChain({
      name,
      amount: amount.toString(),
      choice
    });
    
    if (!challengeId) {
      throw new Error('Failed to create challenge on blockchain');
    }
    
    status.className = 'status-message success show';
    status.textContent = `✅ Challenge created! ID: ${challengeId}`;
    
    // Refresh balance
    const newBalance = await window.ChallengeHub.getInternalBalance();
    depositedBalance = parseFloat(newBalance);
    document.getElementById('usdcBalance').textContent = depositedBalance.toFixed(2);
    
    setTimeout(() => {
      closeCreateModal();
      loadChallenges(currentFilter);
    }, 1500);
    
  } catch (error) {
    console.error('Create error:', error);
    status.className = 'status-message error show';
    status.textContent = '❌ Error: ' + error.message;
  }
}

// ═══════════════════════════════════════════════════════════════════
// JOIN CHALLENGE
// ═══════════════════════════════════════════════════════════════════

async function openJoinModal(challengeId, name, amount, creatorChoice) {
  if (!walletAddress) {
    console.error('Du må være logget inn først');
    document.getElementById('signup-modal').classList.add('open');
    return;
  }
  
  // Check balance
  if (amount > depositedBalance) {
    alert(`❌ Insufficient balance. You have ${depositedBalance.toFixed(2)} USDC, need ${amount.toFixed(2)} USDC`);
    return;
  }
  
  document.getElementById('joinChallengeId').value = challengeId;
  document.getElementById('joinChallengeName').textContent = name;
  document.getElementById('joinAmount').textContent = amount.toFixed(2) + ' USDC';
  
  const creatorChoiceText = creatorChoice === 'kron' ? 'Kron' : 'Mynt';
  const yourChoice = creatorChoice === 'kron' ? 'mynt' : 'kron';
  const yourChoiceText = yourChoice === 'kron' ? 'Kron' : 'Mynt';
  
  document.getElementById('joinCreatorChoice').innerHTML = 
    `<img src="/${creatorChoice === 'kron' ? 'Kron' : 'Mynt'}.png" alt="${creatorChoice}" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 5px;"> ${creatorChoiceText}`;
  
  document.getElementById('joinYourChoice').innerHTML = 
    `<img src="/${yourChoice === 'kron' ? 'Kron' : 'Mynt'}.png" alt="${yourChoice}" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 5px;"> ${yourChoiceText}`;
  
  // Store choice for later
  document.getElementById('joinYourChoice').dataset.choice = yourChoice;
  
  const fee = amount * 0.02;
  document.getElementById('joinFee').textContent = fee.toFixed(2) + ' USDC';
  
  document.getElementById('joinModal').classList.add('show');
}

function closeJoinModal() {
  document.getElementById('joinModal').classList.remove('show');
}

document.getElementById('joinForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const challengeId = document.getElementById('joinChallengeId').value;
  const yourChoice = document.getElementById('joinYourChoice').dataset.choice;
  const status = document.getElementById('joinStatus');
  
  try {
    status.className = 'status-message loading show';
    status.textContent = '⏳ Joining challenge on blockchain...';
    
    // Join challenge on-chain via MetaMask
    const success = await window.ChallengeHub.joinChallengeOnChain(challengeId, yourChoice);
    
    if (!success) {
      throw new Error('Failed to join challenge on blockchain');
    }
    
    status.className = 'status-message success show';
    status.textContent = '✅ Joined! Challenge is now locked. Oracle will settle automatically soon.';
    
    // Refresh balance
    const newBalance = await window.ChallengeHub.getInternalBalance();
    depositedBalance = parseFloat(newBalance);
    document.getElementById('usdcBalance').textContent = depositedBalance.toFixed(2);
    
    setTimeout(() => {
      closeJoinModal();
      loadChallenges(currentFilter);
    }, 2000);
    
  } catch (error) {
    console.error('Join error:', error);
    status.className = 'status-message error show';
    status.textContent = '❌ Error: ' + error.message;
  }
});

// ═══════════════════════════════════════════════════════════════════
// CLAIM PRIZE
// ═══════════════════════════════════════════════════════════════════

async function claimPrize(challengeId) {
  if (!walletAddress) {
    alert('❌ You must be logged in to claim prize');
    return;
  }
  
  if (!confirm('🏆 Claim your prize? This will add winnings to your internal balance.')) {
    return;
  }
  
  try {
    // Claim prize on-chain via MetaMask
    const success = await window.ChallengeHub.claimPrizeOnChain(challengeId);
    
    if (!success) {
      throw new Error('Failed to claim prize on blockchain');
    }
    
    alert('✅ Prize claimed! Check your balance.');
    
    // Refresh balance
    const newBalance = await window.ChallengeHub.getInternalBalance();
    depositedBalance = parseFloat(newBalance);
    document.getElementById('usdcBalance').textContent = depositedBalance.toFixed(2);
    
    loadChallenges(currentFilter);
    
  } catch (error) {
    console.error('Claim error:', error);
    alert('❌ Failed to claim prize: ' + error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// DEPOSIT & WITHDRAW
// ═══════════════════════════════════════════════════════════════════

function openDepositModal() {
  document.getElementById('depositModal').classList.add('show');
}

function openWithdrawModal() {
  document.getElementById('withdrawAvailable').textContent = depositedBalance.toFixed(2) + ' USDC';
  document.getElementById('withdrawModal').classList.add('show');
  
  // Setup max button
  document.getElementById('withdrawMaxBtn').onclick = () => {
    document.getElementById('withdrawAmount').value = depositedBalance.toFixed(2);
  };
}

// Deposit form handler
document.getElementById('depositForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const amount = document.getElementById('depositAmount').value;
  const status = document.getElementById('depositStatus');
  
  try {
    status.className = 'status-message loading show';
    status.textContent = '⏳ Step 1: Approving USDC...';
    
    const success = await window.ChallengeHub.depositUSDC(amount);
    
    if (!success) {
      throw new Error('Deposit failed');
    }
    
    status.className = 'status-message success show';
    status.textContent = '✅ Deposit successful!';
    
    // Refresh balance
    const newBalance = await window.ChallengeHub.getInternalBalance();
    depositedBalance = parseFloat(newBalance);
    document.getElementById('usdcBalance').textContent = depositedBalance.toFixed(2);
    
    setTimeout(() => {
      document.getElementById('depositModal').classList.remove('show');
      document.getElementById('depositForm').reset();
      status.classList.remove('show');
    }, 2000);
    
  } catch (error) {
    console.error('Deposit error:', error);
    status.className = 'status-message error show';
    status.textContent = '❌ Deposit failed: ' + error.message;
  }
});

// Withdraw form handler
document.getElementById('withdrawForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const amount = document.getElementById('withdrawAmount').value;
  const status = document.getElementById('withdrawStatus');
  
  if (parseFloat(amount) > depositedBalance) {
    status.className = 'status-message error show';
    status.textContent = '❌ Insufficient balance';
    return;
  }
  
  try {
    status.className = 'status-message loading show';
    status.textContent = '⏳ Withdrawing USDC...';
    
    const success = await window.ChallengeHub.withdrawUSDC(amount);
    
    if (!success) {
      throw new Error('Withdrawal failed');
    }
    
    status.className = 'status-message success show';
    status.textContent = '✅ Withdrawal successful!';
    
    // Refresh balance
    const newBalance = await window.ChallengeHub.getInternalBalance();
    depositedBalance = parseFloat(newBalance);
    document.getElementById('usdcBalance').textContent = depositedBalance.toFixed(2);
    
    setTimeout(() => {
      document.getElementById('withdrawModal').classList.remove('show');
      document.getElementById('withdrawForm').reset();
      status.classList.remove('show');
    }, 2000);
    
  } catch (error) {
    console.error('Withdraw error:', error);
    status.className = 'status-message error show';
    status.textContent = '❌ Withdrawal failed: ' + error.message;
  }
});

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
