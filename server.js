const express = require('express');
const app = express();

// Azure App Service setter PORT environment variable
const PORT = process.env.PORT || 3000;

// Middleware for JSON parsing
app.use(express.json());

// Enkel rot-route for å verifisere at appen kjører
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="no">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>QuestCast - Live Challenge Registration</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .container {
          background: rgba(255, 255, 255, 0.1);
          padding: 40px;
          border-radius: 10px;
          backdrop-filter: blur(10px);
        }
        h1 {
          margin-top: 0;
        }
        .status {
          background: rgba(255, 255, 255, 0.2);
          padding: 15px;
          border-radius: 5px;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎯 QuestCast</h1>
        <h2>Live Challenge Registration Platform</h2>
        <div class="status">
          <p><strong>Status:</strong> ✅ App is running successfully!</p>
          <p><strong>Environment:</strong> Azure App Service</p>
          <p><strong>Runtime:</strong> Node.js ${process.version}</p>
          <p><strong>Next steps:</strong></p>
          <ul>
            <li>Connect PostgreSQL database</li>
            <li>Add registration form</li>
            <li>Display live participant list</li>
            <li>Integrate blockchain wallet connection</li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `);
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
