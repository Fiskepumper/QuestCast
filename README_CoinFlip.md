# 🪙 QuestCast Coin Flip Challenge System

## Oversikt

Et **crypto-native** betting-system hvor brukere kan legge USDC på Heads eller Tails. Vinnerne deler hele potten!

### ✨ Nøkkelfunksjoner

- **On-chain truth**: Alle penger og bets lagres på Polygon blockchain
- **2% platform fee**: Automatisk tatt ved hver bet
- **To-fase system**: Open → Locked → Settled/Refunded
- **Immutable outcome**: Kan kun settes én gang
- **Refund timeout**: Automatisk refund hvis settlement ikke skjer innen 7 dager
- **MVP settlement**: Admin setter utfall manuelt (kan senere byttes til Chainlink VRF)

---

## 🏗️ Arkitektur

### Smart Contract: `ChallengeHub.sol`

- **Én kontrakt holder alle challenges** (ikke én kontrakt per challenge)
- Supports flere typer challenges (coinflip, sports betting, osv.)
- 2% fee sendes til `feeRecipient` (0x4f875704BA0f35c2F392Fe884E6D5Cdb30e9D3E2)
- USDC (6 decimals) på Polygon: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`

### Database (PostgreSQL)

Database brukes kun for **caching og rask UI**. Blockchain er sannheten.

Tabeller:
- `blockchain_challenges` - Cache på challenge data
- `coinflip_bets` - Cache på bets

### Backend API

**Public endpoints:**
- `GET /api/coinflip/list` - List alle challenges
- `GET /api/coinflip/:id` - Hent detaljer om challenge
- `POST /api/coinflip/:id/sync` - Synkroniser fra blockchain

**Admin endpoints:**
- `POST /api/coinflip/create` - Opprett nytt challenge
- `POST /api/coinflip/:id/lock` - Lås betting
- `POST /api/coinflip/:id/settle` - Sett utfall og utbetal
- `POST /api/coinflip/:id/refund` - Refunder alle

### Frontend

- `/coinflip` - User interface for betting
- `/admin/coinflip` - Admin panel (krever ADMIN_SECRET)

---

## 🚀 Deployment Guide

### 1. Kjør database migration

```bash
# Oppdater database schema
psql $DATABASE_URL < db/schema.sql
```

### 2. Kompiler smart contract

```bash
npx hardhat compile
```

### 3. Deploy contract til Polygon

```bash
npx hardhat run scripts/deployChallengeHub.js --network polygon
```

**Output:**
```
✅ ChallengeHub deployed to: 0x...
```

Kopier contract-adressen og legg til i `.env`:
```
CHALLENGE_HUB_ADDRESS=0x...
```

### 4. Verifiser contract på Polygonscan

Skjer automatisk hvis `POLYGONSCAN_API_KEY` er satt.

Manuelt:
```bash
npx hardhat verify --network polygon <CONTRACT_ADDRESS> "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" "0x4f875704BA0f35c2F392Fe884E6D5Cdb30e9D3E2"
```

### 5. Start serveren

```bash
node server.js
```

---

## 🧪 Testing med 2 kontoer

### Setup

1. **Konto 1** (Admin): Den som deployet contract
2. **Konto 2** (Spiller): En annen MetaMask wallet

### Test Flow

#### 1. Admin oppretter challenge

Gå til: `http://localhost:3000/admin/coinflip`

Login med admin secret: `questcast-admin-2026`

Opprett nytt challenge:
- Name: "Test Flip"
- Entry Fee: 1 USDC
- Description: "Test challenge"

#### 2. Begge kontoer transferer USDC til wallet

Sørg for at begge kontoer har USDC på Polygon:
- Kjøp USDC på exchange (Binance, Coinbase)
- Send til dine Polygon-adresser

#### 3. Konto 1 placer bet på Heads

1. Koble til Konto 1 i MetaMask
2. Gå til `http://localhost:3000/coinflip`
3. Connect wallet
4. Klikk på challenge
5. Velg **Heads**
6. Beløp: 5 USDC
7. Place Bet
8. Godkjenn i MetaMask (approve + bet transaction)

**Forventet resultat:**
- 2% fee (0.10 USDC) sendes til fee recipient
- 4.90 USDC går inn i Heads-potten

#### 4. Bytt til Konto 2, bet på Tails

1. Switch account i MetaMask til Konto 2
2. Refresh siden
3. Connect wallet
4. Bet på **Tails** med 3 USDC
5. Godkjenn

**Forventet resultat:**
- Fee: 0.06 USDC
- Tails pot: 2.94 USDC
- Total pot: 7.84 USDC

#### 5. Admin låser challenge

```javascript
// I admin panel
Lock Challenge #1
```

**Forventet resultat:**
- Status: `locked`
- Ingen flere bets akseptert

#### 6. Admin setter utfall

```javascript
// I admin panel
Settle → HEADS WINS
```

**Forventet resultat:**
- Heads-bettere får sin andel av potten
- Konto 1 kan claime sin gevinst (hele potten = 7.84 USDC)

#### 7. Konto 1 claimer gevinst

1. Gå til challenge
2. Klikk "Claim Prize"
3. Godkjenn i MetaMask

**Forventet resultat:**
- 7.84 USDC sendes til Konto 1
- Balance oppdateres

---

## 💰 Fee Breakdown

**Example: 10 USDC bet**

- Platform fee (2%): 0.20 USDC → `0x4f875704BA0f35c2F392Fe884E6D5Cdb30e9D3E2`
- Into pot: 9.80 USDC

**Transaction fees (gas):**
- Approve: ~0.01 POL (~$0.004)
- Place bet: ~0.02 POL (~$0.008)
- Claim prize: ~0.02 POL (~$0.008)

---

## 🔐 Sikkerhet

### Current MVP Security

✅ **On-chain state**: Penger og bets er på blockchain  
✅ **Immutable outcome**: Kan kun settes én gang  
✅ **Betting must be locked**: Før outcome kan settes  
✅ **ReentrancyGuard**: Ingen reentrancy attacks  
✅ **Fee cap**: Max 10% for safety  
✅ **Refund timeout**: Auto-refund etter 7 dager

⚠️ **Admin trust required**: MVP krever at admin setter riktig outcome

### Future Improvements

1. **Chainlink VRF**: For provably-fair random (coinflip)
2. **Chainlink Oracles**: For eksterne data (fotball-resultater)
3. **Multi-sig**: Admin functions krever flere signaturer
4. **Timelock**: Delay på admin actions
5. **DAO governance**: Community-styrt

---

## 📊 Live Data

### Polygon Contract Addresses

- **USDC**: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
- **ChallengeHub**: `TBD` (settes etter deploy)
- **Fee Recipient**: `0x4f875704BA0f35c2F392Fe884E6D5Cdb30e9D3E2`

### Monitoring

**Polygonscan:**
- Contract: `https://polygonscan.com/address/<CHALLENGE_HUB_ADDRESS>`
- Transactions: Se alle bets, settlements, og claims

**Database:**
```sql
-- Se alle challenges
SELECT * FROM blockchain_challenges;

-- Se alle bets
SELECT * FROM coinflip_bets;

-- Se total volume
SELECT SUM(amount + fee_paid) / 1000000 as total_volume_usdc
FROM coinflip_bets;
```

---

## 🐛 Troubleshooting

### "Transfer failed" error

**Problem**: USDC transfer feilet  
**Solution**: Bruker må approve contract først

```javascript
// Frontend gjør dette automatisk, men hvis det feiler:
await usdcContract.approve(CHALLENGE_HUB_ADDRESS, amount);
```

### "Challenge not found" error

**Problem**: DB er ikke synkronisert med blockchain  
**Solution**: Kjør sync

```bash
POST /api/coinflip/:id/sync
```

### Admin panel "Unauthorized"

**Problem**: Feil admin secret  
**Solution**: Sjekk `.env` → `ADMIN_SECRET`

---

## 📝 Future Roadmap

### Phase 2: Sports Betting
- Integrer med sports API (The Odds API)
- Support for multiple outcomes (not just binary)
- Live odds updates

### Phase 3: Trustless Settlement
- Chainlink VRF for coinflip
- Chainlink Sports Data Feeds
- Remove admin settlement entirely

### Phase 4: Advanced Features
- Parlay bets (multiple outcomes)
- Liquidity pools
- Token rewards for participants
- NFT achievement badges

---

## 👨‍💻 Developer Notes

**Contract upgrades:**
- Use proxy pattern (UUPS) for future upgrades
- Store contract logic separately from data

**Gas optimization:**
- Batch operations where possible
- Use events instead of storage for historical data

**UI improvements:**
- Real-time updates via WebSocket
- Live pot visualization
- Bet history and analytics

---

## License

MIT License - See LICENSE file for details

**⚠️ DISCLAIMER**: This is experimental software. Always audit smart contracts before using with real money. Never invest more than you can afford to lose.
