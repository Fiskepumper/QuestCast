const express = require('express');
const path = require('path');
const app = express();

// Azure App Service setter PORT environment variable
const PORT = process.env.PORT || 3000;

// Middleware for JSON parsing
app.use(express.json());

// Serve static files (CSS, JS, images) fra 'public' mappen
app.use(express.static(path.join(__dirname, 'public')));

// Rot-route - server HTML-filen
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
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
