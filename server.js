// Last inn .env lokalt (i Azure settes variablene direkte, ingen .env needed)
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const { getAllChallenges } = require('./challenges');
const { addRegistration } = require('./challenges/_registrations');
const { findOrCreate, updateUser, getAllUsers, linkChallenge } = require('./auth/users');
const passport = require('./auth/strategies');
const initDb   = require('./db/init');

const app = express();

// Trust Azure App Service reverse proxy (required for secure session cookies over HTTPS)
app.set('trust proxy', 1);

// Azure App Service setter PORT environment variable
const PORT = process.env.PORT || 3000;

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Use EJS layouts
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', false);
app.set('layout extractStyles', true);

// Middleware for JSON and form parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session (must come before passport)
app.use(session({
  secret: process.env.SESSION_SECRET || 'questcast-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use(passport.initialize());
app.use(passport.session());

// Make logged-in user available in all EJS views
app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  next();
});

// Serve static files (CSS, JS, images) fra 'public' mappen
app.use(express.static(path.join(__dirname, 'public')));

// Suppress favicon 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Home page
app.get('/', async (req, res) => {
  const challenges = await getAllChallenges();
  res.render('home/index', {
    title: 'QuestCast - Challenges',
    currentPage: 'home',
    challenges,
    registered: req.query.registered === '1',
    authError: req.query.error || null
  });
});

// Wallet balance proxy — leser POL + USDC direkte fra Polygon RPC server-side (ingen CORS-problem)
app.get('/api/wallet-balances', async (req, res) => {
  const { address } = req.query;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Ugyldig adresse' });
  }
  const usdcAddress = process.env.USDC_CONTRACT_ADDRESS || '';

  // Infura (via MetaMask Developer Dashboard) som primær — meget pålitelig
  const RPC_URLS = [
    process.env.INFURA_API_KEY
      ? `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`
      : null,
    process.env.POLYGON_RPC_URL,
    'https://1rpc.io/matic',
    'https://polygon-bor-rpc.publicnode.com',
  ].filter(Boolean);

  async function rpc(method, params) {
    let lastErr;
    for (const url of RPC_URLS) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(5000),
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error.message);
        return d.result;
      } catch (e) {
        lastErr = e;
        console.warn(`[wallet-balances] RPC ${url} feilet: ${e.message}`);
      }
    }
    throw lastErr;
  }

  try {
    const [polHex, usdcHex] = await Promise.all([
      rpc('eth_getBalance', [address, 'latest']),
      usdcAddress
        ? rpc('eth_call', [{
            to:   usdcAddress,
            data: '0x70a08231000000000000000000000000' + address.slice(2),
          }, 'latest'])
        : Promise.resolve('0x0'),
    ]);

    const polBalance  = parseInt(polHex,  16) / 1e18;
    const usdcBalance = parseInt(usdcHex, 16) / 1e6;

    res.json({
      pol:  polBalance.toFixed(4),
      usdc: usdcBalance.toFixed(2),
    });
  } catch (e) {
    console.error('[wallet-balances] Alle RPC-endepunkter feilet:', e.message);
    res.status(502).json({ error: e.message || 'RPC utilgjengelig' });
  }
});

// Leser brukerens innskutte USDC-balanse fra QuestCast smartkontrakt (balances[user])
// Funksjonsselektoren for getBalance(address) er 0xf8b2cb4f
app.get('/api/contract-balance', async (req, res) => {
  const { address } = req.query;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Ugyldig adresse' });
  }
  const contractAddress = process.env.QUESTCAST_CONTRACT_ADDRESS;
  if (!contractAddress) return res.json({ usdc: '0.00' });

  const RPC_URLS = [
    process.env.INFURA_API_KEY
      ? `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`
      : null,
    process.env.POLYGON_RPC_URL,
    'https://1rpc.io/matic',
  ].filter(Boolean);

  for (const url of RPC_URLS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'eth_call',
          params: [{
            to:   contractAddress,
            data: '0xf8b2cb4f000000000000000000000000' + address.slice(2),
          }, 'latest'],
        }),
        signal: AbortSignal.timeout(5000),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      const usdc = parseInt(d.result, 16) / 1e6;
      return res.json({ usdc: usdc.toFixed(2) });
    } catch (e) { /* prøv neste RPC */ }
  }
  res.status(502).json({ error: 'RPC utilgjengelig' });
});

// POL-kurs via Polygonscan stats-API (offisiell kilde for Polygon sin native token)
app.get('/api/pol-price', async (req, res) => {
  try {
    const apiKey = process.env.POLYGONSCAN_API_KEY;
    const r = await fetch(
      `https://api.polygonscan.com/api?module=stats&action=maticprice&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const d = await r.json();
    if (d.status === '1' && d.result?.maticusd) {
      return res.json({ price: parseFloat(d.result.maticusd) });
    }
    throw new Error('Polygonscan returnerte ugyldig svar');
  } catch (e) {
    // Fallback: Binance POLUSDT
    try {
      const r2 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=POLUSDT', {
        signal: AbortSignal.timeout(4000),
      });
      const d2 = await r2.json();
      res.json({ price: parseFloat(d2.price) || 0 });
    } catch (e2) {
      res.status(502).json({ error: e2.message });
    }
  }
});

// Profile page
app.get('/profile', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/?error=login-required');
  res.render('profile/index', {
    title: 'QuestCast - Din profil',
    currentPage: 'profile',
    user: req.user,
    saved: req.query.saved === '1'
  });
});

app.post('/profile', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  const { displayName, avatarChoice } = req.body;
  await updateUser(req.user.uuid, { displayName, avatarChoice });
  res.redirect('/profile?saved=1');
});

// MetaMask wallet registration (ny bruker)
app.post('/auth/metamask', async (req, res) => {
  const { address } = req.body;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.json({ ok: false, error: 'invalid-address' });
  }
  try {
    const { user, isNew } = await findOrCreate({
      platform:      'metamask',
      platformId:    address.toLowerCase(),
      username:      `${address.slice(0, 6)}...${address.slice(-4)}`,
      email:         null,
      avatarUrl:     null,
      walletAddress: address.toLowerCase(),
    });
    if (isNew) await addRegistration('metamask');
    req.login(user, (err) => {
      if (err) return res.json({ ok: false, error: 'login-failed' });
      res.json({ ok: true });
    });
  } catch (err) {
    console.error('MetaMask auth error:', err);
    res.json({ ok: false, error: 'db-error' });
  }
});

// MetaMask wallet linking (eksisterende Google/Microsoft-bruker kobler lommebok)
app.post('/auth/metamask/link', async (req, res) => {
  if (!req.isAuthenticated()) return res.json({ ok: false, error: 'not-logged-in' });
  const { address } = req.body;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.json({ ok: false, error: 'invalid-address' });
  }
  try {
    const updated = await updateUser(req.user.uuid, { walletAddress: address.toLowerCase() });
    if (!updated) return res.json({ ok: false, error: 'user-not-found' });
    // Refresh session user
    req.login(updated, (err) => {
      if (err) return res.json({ ok: false, error: 'session-error' });
      res.json({ ok: true });
    });
  } catch (err) {
    console.error('Wallet link error:', err);
    res.json({ ok: false, error: 'db-error' });
  }
});

// OAuth routes — Google
if (process.env.GOOGLE_CLIENT_ID) {
  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/?error=auth' }),
    (req, res) => res.redirect('/?registered=1')
  );
} else {
  app.get('/auth/google', (req, res) => res.redirect('/?error=not-configured'));
}

// OAuth routes — Facebook (also covers Instagram via Meta login)
if (process.env.FACEBOOK_APP_ID) {
  app.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));
  app.get('/auth/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/?error=auth' }),
    (req, res) => res.redirect('/?registered=1')
  );
} else {
  app.get('/auth/facebook', (req, res) => res.redirect('/?error=not-configured'));
}

// OAuth routes — Microsoft
if (process.env.MICROSOFT_CLIENT_ID) {
  app.get('/auth/microsoft', passport.authenticate('microsoft', {
    scope: ['openid', 'profile', 'email', 'User.Read']
  }));
  app.get('/auth/microsoft/callback',
    passport.authenticate('microsoft', { failureRedirect: '/?error=auth' }),
    (req, res) => res.redirect('/?registered=1')
  );
} else {
  app.get('/auth/microsoft', (req, res) => res.redirect('/?error=not-configured'));
}

// Health check endpoint (nyttig for Azure monitoring)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Debug: test GitHub API connection (fjern denne før produksjon)
app.get('/debug/github', async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  const headers = { 'User-Agent': 'QuestCast-App' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const response = await fetch('https://api.github.com/repos/Fiskepumper/QuestCast/collaborators', { headers });
    const body = await response.json();
    res.json({
      status: response.status,
      tokenSet: !!token,
      data: body
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// Admin: list all registered users (protect with ADMIN_SECRET env var)
app.get('/admin/users', async (req, res) => {
  const secret = process.env.ADMIN_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const users = await getAllUsers();
  res.json(users);
});

// Start server — wait for DB to be ready first
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 QuestCast server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}).catch(err => {
  console.error('❌ Could not connect to database:', err.message);
  process.exit(1);
});
