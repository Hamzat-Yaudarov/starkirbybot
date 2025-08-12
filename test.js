const Database = require('./database');

async function testBot() {
    console.log('🧪 Testing Kirby Stars Farm Bot...\n');

    const db = new Database();
    await db.init();

    try {
        // Test database tables
        console.log('📊 Testing database tables...');
        
        const users = await db.all('SELECT COUNT(*) as count FROM users');
        console.log(`✅ Users table: ${users[0].count} users`);
        
        const tasks = await db.all('SELECT COUNT(*) as count FROM tasks');
        console.log(`✅ Tasks table: ${tasks[0].count} tasks`);
        
        const pets = await db.all('SELECT COUNT(*) as count FROM pets');
        console.log(`✅ Pets table: ${pets[0].count} pets`);
        
        const cases = await db.all('SELECT COUNT(*) as count FROM cases');
        console.log(`✅ Cases table: ${cases[0].count} cases`);

        // Show default data
        console.log('\n🐾 Default pets:');
        const allPets = await db.all('SELECT * FROM pets');
        allPets.forEach(pet => {
            console.log(`  - ${pet.name}: ${pet.base_price} ⭐ (+${((pet.boost_multiplier - 1) * 100).toFixed(1)}% boost)`);
        });

        console.log('\n📦 Default cases:');
        const allCases = await db.all('SELECT * FROM cases');
        allCases.forEach(caseItem => {
            console.log(`  - ${caseItem.name}: ${caseItem.min_reward}-${caseItem.max_reward} ⭐`);
        });

        console.log('\n📋 Default tasks:');
        const allTasks = await db.all('SELECT * FROM tasks');
        allTasks.forEach(task => {
            console.log(`  - ${task.title}: ${task.reward} ⭐ (${task.type})`);
        });

        console.log('\n✅ All tests passed! Bot is ready to use.');
        console.log('\n🚀 Start the bot with: npm start');
        console.log('📱 Bot username: @kirbystarsfarmbot');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        await db.close();
    }
}

testBot();
