# QuestCast On-Chain Betting System 🎰

Dette dokumentet forklarer hvordan det nye on-chain betting systemet fungerer med ChallengeHub smart contract.

---

## 📋 Oversikt

QuestCast bruker nå **ekte USDC betting** via smart contract på Polygon Mainnet.

**Contract Address:** `0x4377a75104E29b43f8bE89dF12Aa1ed01Ac5F39B`

**Flow:**
1. Bruker depositer USDC til ChallengeHub (via MetaMask)
2. Bruker lager challenge (velger Kron eller Mynt)
3. Annen bruker joiner (velger motsatt side)
4. Auto-locks når 2 spillere har betted
5. **Backend Oracle** setter outcome automatisk (2 sek delay)
6. Vinner claimer prize tilbake til internal balance
7. Bruker withdrawer USDC til wallet

---

## 🏗️ Arkitektur

### Smart Contract (ChallengeHub.sol)

- **Polygon Mainnet:** 0x4377a75104E29b43f8bE89dF12Aa1ed01Ac5F39B
- **USDC Token:** 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
- **Platform Fee:** 2% (sendes til deployer wallet)

**Key Functions:**
- `deposit(uint256 amount)` - Depositer USDC til internal balance
- `createCoinFlipChallenge(string name, string description, uint256 entryFee)` - Lag challenge
- `joinCoinFlip(uint256 challengeId, bool isHeads)` - Join challenge (true=Kron, false=Mynt)
- `settleCoinFlip(uint256 challengeId, bool outcomeIsHeads)` - Admin/Oracle setter outcome
- `claimPrize(uint256 challengeId)` - Vinner claimer winnings
- `withdraw(uint256 amount)` - Withdraw USDC til wallet

### Backend Services

#### 1. Event Sync Service (`services/event-sync.js`)

Lytter til on-chain events og synkroniserer til database:

- `ChallengeCreated` → Opprett rad i `blockchain_challenges`
- `BetPlaced` → Opprett rad i `coinflip_bets`
- `ChallengeLocked` → Oppdater status til 'locked'
- `ChallengeSettled` → Oppdater outcome + status til 'settled'
- `PrizeClaimed` → Marker bet som claimed

**Start service:**
```bash
npm run sync
```

#### 2. Auto-Settlement Oracle (`services/coinflip-oracle.js`)

Lytter til `ChallengeLocked` events og setter outcome automatisk:

1. Hører at challenge er locked (2 spillere har betted)
2. Venter 2 sekunder
3. Genererer kryptografisk sikker random boolean
4. Kaller `settleCoinFlip(challengeId, outcomeIsHeads)` on-chain

**Start service:**
```bash
npm run oracle
```

⚠️ **TRUST MODEL:** Backend kontrollerer outcomes via private key
- For MVP: Akseptabelt (brukere stoler på oss)
- For produksjon: Bør byttes til Chainlink VRF for provably fair randomness

---

## 🚀 Deployment

### Prerequisites

1. **Node.js** 22+ installed
2. **PostgreSQL** database configured
3. **Environment Variables** (.env):

```env
# Smart Contract
CHALLENGE_HUB_ADDRESS=0x4377a75104E29b43f8bE89dF12Aa1ed01Ac5F39B
USDC_CONTRACT_ADDRESS=0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359

# Blockchain
POLYGON_RPC_URL=https://polygon-mainnet.infura.io/v3/YOUR_INFURA_KEY
DEPLOYER_PRIVATE_KEY=your_private_key_here

# Database
DATABASE_URL=postgresql://user:pass@host:5432/database

# Session
SESSION_SECRET=your_random_secret
```

### Installation

```bash
# Install dependencies
npm install

# Run database migration
node db/migrate.js
```

### Running Services

**For Development (Local):**

```bash
# Terminal 1: Main web server
npm start

# Terminal 2: Event sync service
npm run sync

# Terminal 3: Auto-settlement oracle
npm run oracle
```

**For Production (Azure):**

1. Deploy main app via GitHub Actions (already configured)
2. Set up **Azure Web Jobs** or **Container Instances** for background services:
   - **event-sync** - Always running, syncs events to database
   - **coinflip-oracle** - Always running, auto-settles challenges

---

## 🔄 Event Flow Example

### Scenario: Alice vs Bob på 10 USDC

1. **Alice depositer 10 USDC**
   - Kaller `USDC.approve(CHALLENGE_HUB, 10e6)` i MetaMask
   - Kaller `ChallengeHub.deposit(10e6)` i MetaMask
   - Balance: 10 USDC i internal balance

2. **Alice lager challenge**
   - Kaller `createCoinFlipChallenge("Alice vs Bob", "", 5e6)` via MetaMask
   - Kaller `joinCoinFlip(challengeId, true)` via MetaMask (true = Kron)
   - Event: `ChallengeCreated(1, ...)`
   - Event: `BetPlaced(1, alice, 4.9e6, 0.1e6, true)` (2% fee)
   - **event-sync.js** synkroniserer til database

3. **Bob joiner challenge**
   - Bob depositer 10 USDC til internal balance
   - Kaller `joinCoinFlip(1, false)` (false = Mynt)
   - Event: `BetPlaced(1, bob, 4.9e6, 0.1e6, false)`
   - Event: `ChallengeLocked(1, timestamp)`
   - **event-sync.js** oppdaterer status til 'locked'

4. **Auto-settlement (2 sek delay)**
   - **coinflip-oracle.js** hører `ChallengeLocked` event
   - Genererer random: `true` (Kron)
   - Kaller `settleCoinFlip(1, true)` on-chain
   - Event: `ChallengeSettled(1, keccak256("heads"), 1, 9.8e6)`
   - **event-sync.js** oppdaterer outcome='kron', status='settled'

5. **Alice claimer prize**
   - Frontend viser "You won! Claim prize"
   - Alice kaller `claimPrize(1)` via MetaMask
   - Alice får 9.8 USDC til internal balance (opprinnelig 5 + gevinst 9.8 = 14.8 USDC)
   - Event: `PrizeClaimed(1, alice, 9.8e6)`
   - **event-sync.js** marker bet som claimed

6. **Alice withdrawer**
   - Alice kaller `withdraw(14.8e6)` via MetaMask
   - 14.8 USDC sendes til Alice sin wallet
   - Internal balance: 0 USDC

---

## 🧪 Testing Checklist

- [ ] Test deposit flow (approve + deposit)
- [ ] Test create challenge (create + join as creator)
- [ ] Test join challenge (second player joins)
- [ ] Verify challenge locks automatically at 2 players
- [ ] Verify auto-settlement happens within 5 seconds
- [ ] Test claim prize (winner can claim)
- [ ] Test withdraw (user withdraws to wallet)
- [ ] Verify 2% fee goes to deployer wallet
- [ ] Test from mobile (MetaMask mobile app)

---

## 🔧 Troubleshooting

### Oracle ikke settler automatisk

1. Sjekk at `npm run oracle` kjører
2. Sjekk at deployer wallet har nok POL for gas (min 0.1 POL)
3. Sjekk logs for errors i console

### Events ikke synkronisert til database

1. Sjekk at `npm run sync` kjører
2. Sjekk database connection i .env
3. Sjekk at `blockchain_challenges` tabell eksisterer

### Frontend viser ikke challenges

1. Sjekk at event-sync har synkronisert data til database
2. Sjekk `/api/coinflip/list` endpoint direkte i browser
3. Sjekk at `CHALLENGE_HUB_ADDRESS` er satt i .env

### Gas fees for høye

1. Polygon mainnet har typisk $0.01-0.10 i gas fees
2. Sjekk POL balance i deployer wallet: `npm run check-balance` (TODO: add script)
3. Hvis POL < 0.1, send mer POL til deployer wallet

---

## 🚨 Security Notes

### Trust Model (Backend Oracle)

⚠️ **CURRENT IMPLEMENTATION:**
- Backend har full kontroll over outcomes via Private Key
- Backend kan teoretisk manipulere hvem som vinner
- Brukere må stole på oss

✅ **FOR MVP:** Akseptabelt (testing, small amounts)

🔮 **FOR PRODUCTION:** Bytt til Chainlink VRF:
- Provably fair randomness
- On-chain verification
- No trust required
- Costs ~0.0001 LINK per settlement (~$0.00002)

### Private Key Security

🔑 **CRITICAL:** DEPLOYER_PRIVATE_KEY må holdes hemmelig!

**Azure Production:**
- Lagre i Azure Key Vault (ikke i .env)
- Bruk Managed Identity der mulig
- Roter nøkkel regelmessig

**Local Development:**
- Bruk dedikert test wallet
- Ikke bruk samme wallet som har ekte funds
- Legg .env i .gitignore (allerede gjort)

---

## 📊 Monitoring

### Key Metrics (TODO: Add Dashboards)

- **Challenges Created:** Antall challenges per dag
- **Total Volume:** USDC volume betted per dag
- **Settlement Latency:** Tid fra ChallengeLocked til ChallengeSettled
- **Oracle Uptime:** % av tiden oracle service er running
- **Gas Costs:** Total POL spent på settlements per dag

### Alerts (TODO: Set up)

- Oracle service down > 5 min
- Event sync service down > 5 min
- Deployer wallet POL < 0.1
- Settlement transaction failed
- RPC endpoint down

---

## 🔄 Migration from Virtual Betting

Old system (`coinflip-simple.js` + `user_balances` table):
- Virtual betting (database only)
- Manual admin settlement
- No blockchain interaction

New system (`coinflip-onchain.js` + `ChallengeHub` contract):
- Real USDC on Polygon
- Auto-settlement via oracle
- Full blockchain integration

**Migration steps:**
1. ✅ Deploy ChallengeHub contract
2. ✅ Update server.js to use coinflip-onchain.js
3. ✅ Update frontend to use kron/mynt instead of heads/tails
4. ✅ Create event-sync service
5. ✅ Create coinflip-oracle service
6. ⏸️ Deploy to Azure
7. ⏸️ Test end-to-end flow
8. ⏸️ Migrate to production slot

---

## 📞 Support

For spørsmål eller issues, kontakt: [Your Contact Info]

**Useful Links:**
- [Polygonscan](https://polygonscan.com/address/0x4377a75104E29b43f8bE89dF12Aa1ed01Ac5F39B)
- [Infura Dashboard](https://infura.io/dashboard)
- [Azure Portal](https://portal.azure.com)
