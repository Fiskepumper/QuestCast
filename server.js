const express = require('express');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const { getAllChallenges } = require('./challenges');
const app = express();

// Azure App Service setter PORT environment variable
const PORT = process.env.PORT || 3000;

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Use EJS layouts
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Middleware for JSON parsing
app.use(express.json());

// Serve static files (CSS, JS, images) fra 'public' mappen
app.use(express.static(path.join(__dirname, 'public')));

// Home page
app.get('/', async (req, res) => {
  const challenges = await getAllChallenges();
  res.render('home/index', {
    title: 'QuestCast - Challenges',
    currentPage: 'home',
    challenges
  });
});

// Health check endpoint (nyttig for Azure monitoring)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 QuestCast server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
