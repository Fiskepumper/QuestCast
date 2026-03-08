# 🚀 Coin Flip - Quick Start Guide

## Pre-requisites

- [x] Node.js installert
- [x] MetaMask installert med 2 kontoer
- [x] Begge kontoer har POL (for gas) og USDC på Polygon
- [x] PostgreSQL database kjører
- [x] `.env` konfigurert

---

## 🎯 Deployment Checklist

### 1. Database Setup

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"

# Run schema
psql $DATABASE_URL < db/schema.sql

# Verify tables
psql $DATABASE_URL -c "\dt"
```

✅ Du skal se: `blockchain_challenges`, `coinflip_bets`

---

### 2. Install Dependencies

```bash
npm install
```

Viktige pakker:
- `hardhat` - Smart contract development
- `ethers` - Blockchain interaction
- `@nomicfoundation/hardhat-toolbox` - Hardhat plugins

---

### 3. Compile Contract

```bash
npx hardhat compile
```

✅ Output: `Compiled 1 Solidity file successfully`

---

### 4. Deploy to Polygon

```bash
# Check deployer balance først
npx hardhat run scripts/checkBalance.js --network polygon

# Deploy
npx hardhat run scripts/deployChallengeHub.js --network polygon
```

**Expected output:**
```
🚀 Deployer ChallengeHub til Polygon...
📍 Deployer address: 0x4f875704BA0f35c2F392Fe884E6D5Cdb30e9D3E2
💰 Deployer balance: 2.5000 POL

📋 Config:
   USDC Address: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
   Fee Recipient (2%): 0x4f875704BA0f35c2F392Fe884E6D5Cdb30e9D3E2

✅ ChallengeHub deployed to: 0xABC...123
✅ Kontrakt verifisert!

📝 Husk å oppdatere .env:
CHALLENGE_HUB_ADDRESS=0xABC...123
```

**⚠️ VIKTIG**: Kopier contract-adressen og legg til i `.env`!

---

### 5. Update .env

```bash
# Åpne .env
code .env

# Legg til:
CHALLENGE_HUB_ADDRESS=0x...  # Fra deploy output
```

---

### 6. Start Server

```bash
node server.js
```

✅ Output: `🚀 QuestCast server running on port 3000`

---

## 🧪 Testing Flow

### Setup Test Accounts

**Konto 1 (Admin/Bruker 1):**
- Adresse: `0x4f875704BA0f35c2F392Fe884E6D5Cdb30e9D3E2`
- Role: Admin + spiller
- Balance: 10 USDC + 1 POL

**Konto 2 (Bruker 2):**
- Adresse: `0x...` (din andre MetaMask konto)
- Role: Spiller
- Balance: 10 USDC + 1 POL

---

### Test Scenario: "Friday Night Flip"

#### ✅ Step 1: Admin oppretter challenge

1. Gå til: `http://localhost:3000/admin/coinflip`
2. Enter admin secret: `questcast-admin-2026`
3. Fill form:
   - **Name**: "Friday Night Flip"
   - **Entry Fee**: 1 (USDC minimum)
   - **Description**: "Winner takes all! 🎲"
4. Click "Create Challenge"
5. **Wait for blockchain confirmation** (~5-10 sekunder)

**Expected:**
- ✅ Success message with challenge ID
- Challenge appears in table with status "OPEN"

---

#### ✅ Step 2: Bruker 1 bet på Heads

1. Gå til: `http://localhost:3000/coinflip`
2. **Connect wallet** (Konto 1)
3. See wallet balance displayed
4. Click på "Friday Night Flip" challenge
5. Modal åpner
6. **Velg Heads** 👑
7. **Amount**: 5 USDC
8. See potential payout (dinamisk)
9. Click "Place Bet"

**MetaMask prompts:**
- Prompt 1: Approve USDC spending (5 USDC)
- Prompt 2: Place bet transaction

**Expected:**
- ✅ "Bet plassert! Lykke til!"
- Heads pot: 4.90 USDC (5 - 2% fee)
- Fee paid: 0.10 USDC → `0x4f875704BA0f35c2F392Fe884E6D5Cdb30e9D3E2`

---

#### ✅ Step 3: Bruker 2 bet på Tails

1. **Switch account i MetaMask** til Konto 2
2. Refresh page: `http://localhost:3000/coinflip`
3. Connect wallet (Konto 2)
4. Click på challenge
5. **Velg Tails** ⚔️
6. **Amount**: 3 USDC
7. Place bet

**Expected:**
- Tails pot: 2.94 USDC (3 - 0.06 fee)
- Total pot: 7.84 USDC
- Participants: 2

---

#### ✅ Step 4: Admin låser challenge

1. Go back to admin panel
2. Click "🔄 Refresh" if needed
3. Find challenge
4. Click "🔒 Lock"
5. Confirm

**Expected:**
- Status changed to "LOCKED" (orange badge)
- No more bets allowed
- Locked timestamp set

---

#### ✅ Step 5: Admin setter utfall (Heads vinner)

1. Click "🎲 Settle"
2. Modal åpner med pot breakdown:
   - Heads: 4.90 USDC
   - Tails: 2.94 USDC
3. Click "👑 HEADS WINS"
4. Confirm alert
5. Wait for blockchain

**Expected:**
- ✅ "Challenge settled! HEADS won!"
- Status: "SETTLED"
- Outcome: "heads"

---

#### ✅ Step 6: Winner claimer prize

1. Switch to Konto 1 (Heads better)
2. Refresh coinflip page
3. Click på challenge
4. **Popup**: "Du vant! Claim din gevinst nå?"
5. Click "OK"
6. Approve MetaMask transaction

**Expected:**
- ✅ "Gevinst mottatt!"
- Konto 1 balance: +7.84 USDC
- Total profit: 2.84 USDC (7.84 - 5)

---

### ✅ Verify Results

**Blockchain (Polygonscan):**

Visit: `https://polygonscan.com/address/<CHALLENGE_HUB_ADDRESS>`

See transactions:
- `createCoinFlipChallenge`
- 2x `joinCoinFlip`
- `lockChallenge`
- `settleCoinFlip`
- `claimPrize`

**Database:**

```sql
-- Challenge status
SELECT * FROM blockchain_challenges WHERE chain_id = 1;

-- Bets
SELECT * FROM coinflip_bets WHERE challenge_id = 1;

-- Total fee collected
SELECT SUM(fee_paid) / 1000000 as total_fees_usdc
FROM coinflip_bets;
```

**Fee Recipient Wallet:**

Check: `0x4f875704BA0f35c2F392Fe884E6D5Cdb30e9D3E2`

Balance should increase by: 0.10 + 0.06 = **0.16 USDC**

---

## 🎉 Success Criteria

- [x] Challenge created on-chain
- [x] 2 users placed bets
- [x] 2% fee collected correctly
- [x] Challenge locked successfully
- [x] Outcome set correctly
- [x] Winner claimed full pot
- [x] All data synced to database
- [x] Fee recipient received funds

---

## 🐛 Common Issues

### Issue: "Transfer failed"

**Cause**: USDC not approved  
**Fix**: Frontend auto-approves, but check allowance:

```javascript
await usdcContract.allowance(userAddress, hubAddress)
```

### Issue: "Insufficient balance"

**Cause**: User doesn't have enough USDC  
**Fix**: 
- Buy USDC on exchange
- Bridge to Polygon
- Or use testnet

### Issue: "Challenge not found in DB"

**Cause**: Backend not listening to events  
**Fix**: Manual sync

```bash
POST http://localhost:3000/api/coinflip/1/sync
```

### Issue: "Transaction too slow"

**Cause**: Low gas price  
**Fix**: Increase gas in MetaMask or wait

---

## 📊 Performance Metrics

**Average transaction times (Polygon):**
- Create challenge: 5-10s
- Place bet: 3-5s
- Lock: 3-5s
- Settle: 5-10s
- Claim: 3-5s

**Gas costs (POL @ $0.4):**
- Create: ~$0.02
- Bet: ~$0.008
- Lock: ~$0.005
- Settle: ~$0.015
- Claim: ~$0.008

---

## 🎯 Next Steps

1. ✅ Basic coinflip working
2. 🔲 Add more test scenarios (refund, timeout, etc.)
3. 🔲 UI polish (animations, loading states)
4. 🔲 Real-time updates (WebSocket)
5. 🔲 Integrate Chainlink VRF
6. 🔲 Add sports betting
7. 🔲 Mobile responsive
8. 🔲 Professional audit

---

## 📞 Support

**Issues?** Check:
1. Console logs (browser + server)
2. MetaMask errors
3. Polygonscan transaction status
4. Database logs

**Contact:** kristian@questcast.io
