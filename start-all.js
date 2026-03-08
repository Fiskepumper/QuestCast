/**
 * Azure Startup Script
 * Kjører både web server OG event-sync service samtidig
 */

const { spawn } = require('child_process');

console.log('🚀 Starting QuestCast Services...');
console.log('═══════════════════════════════════\n');

// Start main server
const server = spawn('node', ['server.js'], {
  stdio: 'inherit',
  env: process.env
});

// Start event sync service
const sync = spawn('node', ['services/event-sync.js'], {
  stdio: 'inherit',
  env: process.env
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.kill();
  sync.kill();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.kill();
  sync.kill();
  process.exit(0);
});

// Monitor processes
server.on('exit', (code) => {
  console.error(`❌ Server exited with code ${code}`);
  sync.kill();
  process.exit(code);
});

sync.on('exit', (code) => {
  console.error(`❌ Event sync exited with code ${code}`);
  // Don't kill server, sync can be optional
  console.log('⚠️ Server continues without event sync');
});

console.log('✅ All services started!');
console.log('   - Web Server: server.js');
console.log('   - Event Sync: services/event-sync.js\n');
