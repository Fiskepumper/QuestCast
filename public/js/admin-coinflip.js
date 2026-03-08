/**
 * Admin Panel - Coin Flip Challenge Management
 * ═══════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════

function verifyAdmin() {
  const secret = document.getElementById('adminSecret').value;
  
  // Simple check - in production, validate against backend
  // For now, we use ADMIN_SECRET env var
  fetch('/admin/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret })
  })
  .then(r => r.json())
  .then(data => {
    if (data.ok) {
      localStorage.setItem('adminAuth', 'true');
      showAdminControls();
      loadAdminChallenges();
    } else {
      alert('❌ Invalid admin secret');
    }
  })
  .catch(err => {
    console.error('Auth error:', err);
    alert('❌ Authentication failed');
  });
}

function showAdminControls() {
  document.getElementById('adminAuth').style.display = 'none';
  document.getElementById('adminControls').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════════
// CREATE CHALLENGE
// ═══════════════════════════════════════════════════════════════════

document.getElementById('createChallengeForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const name = document.getElementById('challengeName').value;
  const description = document.getElementById('challengeDesc').value;
  const entryFee = parseFloat(document.getElementById('entryFee').value);
  
  const status = document.getElementById('createStatus');
  status.className = 'status-message loading show';
  status.textContent = '⏳ Creating challenge on blockchain...';
  
  try {
    const response = await fetch('/api/coinflip/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, entryFee })
    });
    
    const data = await response.json();
    
    if (data.success) {
      status.className = 'status-message success show';
      status.textContent = `✅ Challenge created! ID: ${data.challengeId} | TX: ${data.txHash.slice(0, 10)}...`;
      
      // Reset form
      document.getElementById('createChallengeForm').reset();
      
      // Reload challenges list
      setTimeout(() => {
        loadAdminChallenges();
      }, 2000);
    } else {
      throw new Error(data.error || 'Failed to create challenge');
    }
  } catch (error) {
    console.error('Create error:', error);
    status.className = 'status-message error show';
    status.textContent = '❌ Error: ' + error.message;
  }
});

// ═══════════════════════════════════════════════════════════════════
// LOAD CHALLENGES
// ═══════════════════════════════════════════════════════════════════

async function loadAdminChallenges() {
  const tbody = document.getElementById('challengesTableBody');
  tbody.innerHTML = '<tr><td colspan="8">Loading...</td></tr>';
  
  try {
    const response = await fetch('/api/coinflip/list');
    const data = await response.json();
    
    if (data.challenges.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8">No challenges found</td></tr>';
      return;
    }
    
    tbody.innerHTML = '';
    
    for (const challenge of data.challenges) {
      // Get full details with pots
      const detailResponse = await fetch(`/api/coinflip/${challenge.id}`);
      const detail = await detailResponse.json();
      
      const row = createChallengeRow(challenge, detail);
      tbody.appendChild(row);
    }
  } catch (error) {
    console.error('Load error:', error);
    tbody.innerHTML = '<tr><td colspan="8">Error loading challenges</td></tr>';
  }
}

function createChallengeRow(challenge, detail) {
  const row = document.createElement('tr');
  
  const statusClass = `status-${challenge.status}`;
  const headsAmount = (parseInt(detail.pots.heads) / 1e6).toFixed(2);
  const tailsAmount = (parseInt(detail.pots.tails) / 1e6).toFixed(2);
  const totalPot = (parseInt(challenge.totalPot) / 1e6).toFixed(2);
  
  row.innerHTML = `
    <td><strong>#${challenge.id}</strong></td>
    <td>${challenge.name}</td>
    <td><span class="status-badge ${statusClass}">${challenge.status}</span></td>
    <td><strong>${totalPot} USDC</strong></td>
    <td>👑 ${headsAmount}</td>
    <td>⚔️ ${tailsAmount}</td>
    <td>${detail.bets.length}</td>
    <td>
      <div class="action-buttons">
        ${getActionButtons(challenge, detail)}
      </div>
    </td>
  `;
  
  return row;
}

function getActionButtons(challenge, detail) {
  let buttons = '';
  
  // Sync button (always available)
  buttons += `<button class="btn btn-secondary" onclick="syncChallenge(${challenge.id})">🔄 Sync</button>`;
  
  if (challenge.status === 'open') {
    // Lock button
    buttons += `<button class="btn btn-warning" onclick="lockChallenge(${challenge.id})">🔒 Lock</button>`;
  }
  
  if (challenge.status === 'locked') {
    // Settle button
    buttons += `<button class="btn btn-success" onclick="openSettleModal(${challenge.id}, '${challenge.name}', ${detail.pots.heads}, ${detail.pots.tails})">🎲 Settle</button>`;
    // Refund button
    buttons += `<button class="btn btn-danger" onclick="refundChallenge(${challenge.id})">↩️ Refund</button>`;
  }
  
  return buttons;
}

// ═══════════════════════════════════════════════════════════════════
// CHALLENGE ACTIONS
// ═══════════════════════════════════════════════════════════════════

async function syncChallenge(id) {
  try {
    const response = await fetch(`/api/coinflip/${id}/sync`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (data.success) {
      alert(`✅ Synced ${data.participants} participants`);
      loadAdminChallenges();
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Sync error:', error);
    alert('❌ Error: ' + error.message);
  }
}

async function lockChallenge(id) {
  if (!confirm('Are you sure you want to LOCK this challenge? No more bets will be accepted.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/coinflip/${id}/lock`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (data.success) {
      alert(`✅ Challenge locked! TX: ${data.txHash.slice(0, 10)}...`);
      loadAdminChallenges();
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Lock error:', error);
    alert('❌ Error: ' + error.message);
  }
}

async function refundChallenge(id) {
  if (!confirm('Are you sure you want to REFUND this challenge? All participants will get their money back.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/coinflip/${id}/refund`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (data.success) {
      alert(`✅ Challenge refunded! TX: ${data.txHash.slice(0, 10)}...`);
      loadAdminChallenges();
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Refund error:', error);
    alert('❌ Error: ' + error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// SETTLEMENT
// ═══════════════════════════════════════════════════════════════════

function openSettleModal(id, name, heads, tails) {
  document.getElementById('settleChallengeId').value = id;
  document.getElementById('settleName').textContent = name;
  document.getElementById('settleHeads').textContent = (parseInt(heads) / 1e6).toFixed(2) + ' USDC';
  document.getElementById('settleTails').textContent = (parseInt(tails) / 1e6).toFixed(2) + ' USDC';
  
  document.getElementById('settleModal').classList.add('show');
}

function closeSettleModal() {
  document.getElementById('settleModal').classList.remove('show');
}

async function settleChallenge(outcome) {
  const id = document.getElementById('settleChallengeId').value;
  const status = document.getElementById('settleStatus');
  
  if (!confirm(`Are you sure ${outcome.toUpperCase()} won? This CANNOT be undone!`)) {
    return;
  }
  
  status.className = 'status-message loading show';
  status.textContent = '⏳ Settling on blockchain...';
  
  try {
    const response = await fetch(`/api/coinflip/${id}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome })
    });
    
    const data = await response.json();
    
    if (data.success) {
      status.className = 'status-message success show';
      status.textContent = `✅ Challenge settled! ${outcome.toUpperCase()} won! TX: ${data.txHash.slice(0, 10)}...`;
      
      setTimeout(() => {
        closeSettleModal();
        loadAdminChallenges();
      }, 2000);
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Settle error:', error);
    status.className = 'status-message error show';
    status.textContent = '❌ Error: ' + error.message;
  }
}
