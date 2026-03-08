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
  
  if (createBtn) {
    createBtn.addEventListener('click', openCreateModal);
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
    const data = await response.json();
    
    if (data.challenges.length === 0) {
      grid.innerHTML = '<div class="loading">Ingen challenges. Opprett den første!</div>';
      return;
    }
    
    grid.innerHTML = '';
    
    for (const challenge of data.challenges) {
      const detail = await fetch(`/api/coinflip/${challenge.id}`).then(r => r.json());
      const card = createChallengeCard(challenge, detail);
      grid.appendChild(card);
    }
    
  } catch (error) {
    console.error('Load error:', error);
    grid.innerHTML = '<div class="loading">Feil ved lasting</div>';
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
    status.textContent = '⏳ Creating challenge...';
    
    // Generate a simple name
    const name = `Coinflip ${Date.now()}`;
    
    // Call backend API to create challenge
    const response = await fetch('/api/coinflip/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        amount,
        choice
      })
    });
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    status.className = 'status-message success show';
    status.textContent = `✅ Challenge created! ID: ${result.challengeId}`;
    
    // Refresh balance
    await updateBalance();
    
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
    console.error(`Insufficient balance. Have ${depositedBalance}, need ${amount}`);
    // Show error in UI somehow
    return;
  }
  
  document.getElementById('joinChallengeId').value = challengeId;
  document.getElementById('joinChallengeName').textContent = name;
  document.getElementById('joinAmount').textContent = amount.toFixed(2) + ' USDC';
  
  const creatorChoiceText = creatorChoice === 'heads' ? 'Kron' : 'Mynt';
  const yourChoice = creatorChoice === 'heads' ? 'tails' : 'heads';
  const yourChoiceText = yourChoice === 'heads' ? 'Kron' : 'Mynt';
  
  document.getElementById('joinCreatorChoice').innerHTML = 
    `<img src="/${creatorChoice === 'heads' ? 'Kron' : 'Mynt'}.png" alt="${creatorChoice}" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 5px;"> ${creatorChoiceText}`;
  
  document.getElementById('joinYourChoice').innerHTML = 
    `<img src="/${yourChoice === 'heads' ? 'Kron' : 'Mynt'}.png" alt="${yourChoice}" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 5px;"> ${yourChoiceText}`;
  
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
  const status = document.getElementById('joinStatus');
  
  try {
    status.className = 'status-message loading show';
    status.textContent = '⏳ Joining challenge...';
    
    // Call backend API to join challenge
    const response = await fetch(`/api/coinflip/${challengeId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    status.className = 'status-message success show';
    status.textContent = '✅ Joined! Challenge is now locked. Admin will settle soon.';
    
    // Refresh balance
    await updateBalance();
    
    setTimeout(() => {
      closeJoinModal();
      loadChallenges(currentFilter);
    }, 1500);
    
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
    console.error('Du må være logget inn først');
    return;
  }
  
  try {
    const response = await fetch(`/api/coinflip/${challengeId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    console.log('✅ Prize claimed!', result);
    await updateBalance();
    loadChallenges(currentFilter);
    
  } catch (error) {
    console.error('Claim error:', error);
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
