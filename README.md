# QuestCast
<<<<<<< HEAD

Live challenge registration platform med blockchain-integrasjon.

## 🚀 Deployment Status

Denne appen er deployet til Azure App Service og er koblet til GitHub for automatisk deployment.

**Azure Resources:**
- **App Service:** QuestCast (Node.js 22 LTS på Linux)
- **Database:** PostgreSQL Flexible Server (questcast-server)
- **Deployment:** Continuous deployment fra GitHub (Fiskepumper/QuestCast, branch `main`)

## 📋 MVP Roadmap

### ✅ Fase 1: Basic Setup (Nåværende)
- [x] Azure App Service oppsett
- [x] GitHub deployment pipeline
- [x] Enkel kjørbar Node.js Express-app
- [ ] Verifisere at appen kjører stabilt i Azure

### 🔄 Fase 2: Database & Registration (Neste)
- [ ] Koble PostgreSQL til App Service
- [ ] Lage registreringsskjema (epost/wallet/challenge)
- [ ] Vise live deltakerliste
- [ ] Enkel admin-side for å se registreringer

### 🎯 Fase 3: Blockchain Integration (Senere)
- [ ] Wallet-tilkobling (MetaMask/WalletConnect)
- [ ] Smart contract integrasjon
- [ ] USDC innbetaling/utbetaling
- [ ] On-chain deltakelse-verifisering

## 🛠️ Lokal Utvikling

### Forutsetninger
- Node.js 22 eller nyere
- npm

### Installasjon

```bash
# Klon repo
git clone https://github.com/Fiskepumper/QuestCast.git
cd QuestCast

# Installer dependencies
npm install

# Start server
npm start
```

Appen kjører på `http://localhost:3000`

## 📦 Deployment

Deployment skjer automatisk ved push til `main` branch via GitHub Actions.

### Verifisere Deployment i Azure

1. Gå til Azure Portal → QuestCast App Service
2. Sjekk **Log stream** for å se at appen starter uten feil
3. Klikk **Browse** for å åpne default domain
4. Du skal se en welcome-side med status "✅ App is running successfully!"

### Vanlige Problemer

**"Issues Detected" i Azure:**
- Sjekk Log stream for feilmeldinger
- Verifiser at `package.json` har korrekt `start` script
- Kontroller at GitHub Actions workflow kjørte uten feil

**App starter ikke:**
- Sjekk at PORT environment variable brukes (Azure setter denne automatisk)
- Verifiser at Node.js versjon matcher (22 LTS)

## 🔗 Nyttige Lenker

- **Azure App Service:** [Portal Link]
- **GitHub Repo:** https://github.com/Fiskepumper/QuestCast
- **Live Site:** [Din Azure default domain]

## 📝 Environment Variables

Følgende environment variables settes i Azure App Service Configuration:

- `PORT` - Settes automatisk av Azure
- `DATABASE_URL` - PostgreSQL connection string (kommer i fase 2)
- `NODE_ENV` - production

## 🤝 Bidra

Dette er et privat repo for MVP-utvikling. Kontakt prosjekteier for tilgang.

## 📄 Lisens

ISC
=======
Challenges for money
>>>>>>> bed39ab3c204f35058320089a0e3c73599eebd17
