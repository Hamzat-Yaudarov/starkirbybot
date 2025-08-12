// Simple startup script for the Kirby Stars Farm Bot
const { spawn } = require('child_process');

console.log('🌟 Starting Kirby Stars Farm Bot...\n');

// Start the bot process
const bot = spawn('node', ['index.js'], {
    stdio: 'inherit',
    env: {
        ...process.env,
        NODE_ENV: 'production'
    }
});

bot.on('close', (code) => {
    console.log(`\n🔴 Bot process exited with code ${code}`);
    if (code !== 0) {
        console.log('💡 Try restarting the bot or check for errors');
    }
});

bot.on('error', (error) => {
    console.error('❌ Failed to start bot:', error);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Stopping bot...');
    bot.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Stopping bot...');
    bot.kill('SIGTERM');
});
