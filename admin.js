const Database = require('./database');
const TaskController = require('./controllers/taskController');
const PromoController = require('./controllers/promoController');
const LotteryController = require('./controllers/lotteryController');

class AdminHelper {
    constructor() {
        this.db = new Database();
        this.taskController = new TaskController(this.db, null);
        this.promoController = new PromoController(this.db, null);
        this.lotteryController = new LotteryController(this.db, null);
    }

    async init() {
        await this.db.init();
        console.log('Admin helper initialized');
    }

    // Task management
    async addTask(type, title, description, reward, targetLink) {
        try {
            const taskId = await this.taskController.addTask(type, title, description, reward, targetLink);
            console.log(`✅ Task added with ID: ${taskId}`);
            return taskId;
        } catch (error) {
            console.error('Error adding task:', error);
        }
    }

    async listTasks() {
        try {
            const tasks = await this.taskController.getAllTasks();
            console.log('\n📋 All tasks:');
            tasks.forEach(task => {
                console.log(`${task.id}. ${task.title} (${task.type}) - ${task.reward} ⭐ [${task.is_active ? 'Active' : 'Inactive'}]`);
            });
            return tasks;
        } catch (error) {
            console.error('Error listing tasks:', error);
        }
    }

    async toggleTask(taskId, isActive) {
        try {
            await this.taskController.toggleTask(taskId, isActive);
            console.log(`✅ Task ${taskId} ${isActive ? 'activated' : 'deactivated'}`);
        } catch (error) {
            console.error('Error toggling task:', error);
        }
    }

    // Promo code management
    async createPromo(code, reward, maxUses = 1, expiryDate = null) {
        try {
            const promoId = await this.promoController.createPromoCode(code, reward, maxUses, expiryDate);
            console.log(`✅ Promo code created with ID: ${promoId}`);
            return promoId;
        } catch (error) {
            console.error('Error creating promo code:', error);
        }
    }

    async listPromos() {
        try {
            const promos = await this.promoController.getAllPromoCodes();
            console.log('\n🎫 All promo codes:');
            promos.forEach(promo => {
                const expiry = promo.expiry_date ? new Date(promo.expiry_date).toLocaleDateString() : 'Never';
                console.log(`${promo.id}. ${promo.code} - ${promo.reward} ⭐ (${promo.times_used}/${promo.max_uses}) Expires: ${expiry} [${promo.is_active ? 'Active' : 'Inactive'}]`);
            });
            return promos;
        } catch (error) {
            console.error('Error listing promo codes:', error);
        }
    }

    async generateRandomPromo(reward, maxUses = 1) {
        try {
            const code = this.promoController.generateRandomPromoCode();
            const promoId = await this.createPromo(code, reward, maxUses);
            console.log(`🎫 Generated random promo: ${code}`);
            return { id: promoId, code };
        } catch (error) {
            console.error('Error generating random promo:', error);
        }
    }

    // Lottery management
    async createLottery(name, description, ticketPrice, daysFromNow, botCommission = 0.1) {
        try {
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + daysFromNow);
            
            const lotteryId = await this.lotteryController.createLottery(
                name, 
                description, 
                ticketPrice, 
                endDate.toISOString(), 
                botCommission
            );
            console.log(`✅ Lottery created with ID: ${lotteryId}`);
            return lotteryId;
        } catch (error) {
            console.error('Error creating lottery:', error);
        }
    }

    async listLotteries() {
        try {
            const lotteries = await this.lotteryController.getAllLotteries();
            console.log('\n🎰 All lotteries:');
            lotteries.forEach(lottery => {
                const endDate = new Date(lottery.end_date);
                const isExpired = endDate < new Date();
                console.log(`${lottery.id}. ${lottery.name} - ${lottery.ticket_price} ⭐ Pool: ${lottery.total_pool} ⭐ [${lottery.is_active && !isExpired ? 'Active' : 'Ended'}]`);
            });
            return lotteries;
        } catch (error) {
            console.error('Error listing lotteries:', error);
        }
    }

    // User statistics
    async getUserStats() {
        try {
            const stats = await this.db.get(`
                SELECT 
                    COUNT(*) as total_users,
                    SUM(balance) as total_balance,
                    SUM(total_earned) as total_earned,
                    SUM(level1_referrals) as total_referrals
                FROM users
            `);
            
            console.log('\n👥 User Statistics:');
            console.log(`Total users: ${stats.total_users}`);
            console.log(`Total balance: ${stats.total_balance.toFixed(2)} ⭐`);
            console.log(`Total earned: ${stats.total_earned.toFixed(2)} ⭐`);
            console.log(`Total referrals: ${stats.total_referrals}`);
            
            return stats;
        } catch (error) {
            console.error('Error getting user stats:', error);
        }
    }

    async getTopUsers(limit = 10) {
        try {
            const topUsers = await this.db.all(`
                SELECT username, first_name, balance, total_earned, level1_referrals
                FROM users
                ORDER BY total_earned DESC
                LIMIT ?
            `, [limit]);
            
            console.log(`\n🏆 Top ${limit} users by earnings:`);
            topUsers.forEach((user, index) => {
                const name = user.username ? `@${user.username}` : user.first_name;
                console.log(`${index + 1}. ${name} - ${user.total_earned.toFixed(2)} ⭐ (${user.level1_referrals} refs)`);
            });
            
            return topUsers;
        } catch (error) {
            console.error('Error getting top users:', error);
        }
    }

    // Close database connection
    async close() {
        await this.db.close();
        console.log('Database connection closed');
    }
}

// CLI interface
async function main() {
    const admin = new AdminHelper();
    await admin.init();

    const args = process.argv.slice(2);
    const command = args[0];

    try {
        switch (command) {
            case 'stats':
                await admin.getUserStats();
                await admin.getTopUsers(5);
                break;
            case 'add-task':
                // Usage: node admin.js add-task channel "Subscribe to channel" "Subscribe to our channel" 5 "https://t.me/example"
                const [type, title, description, reward, link] = args.slice(1);
                await admin.addTask(type, title, description, parseFloat(reward), link);
                break;
            case 'list-tasks':
                await admin.listTasks();
                break;
            case 'create-promo':
                // Usage: node admin.js create-promo STARS10 10 100
                const [code, promoReward, maxUses] = args.slice(1);
                await admin.createPromo(code, parseFloat(promoReward), parseInt(maxUses) || 1);
                break;
            case 'random-promo':
                // Usage: node admin.js random-promo 5 50
                const [randReward, randMaxUses] = args.slice(1);
                await admin.generateRandomPromo(parseFloat(randReward), parseInt(randMaxUses) || 1);
                break;
            case 'list-promos':
                await admin.listPromos();
                break;
            case 'create-lottery':
                // Usage: node admin.js create-lottery "Weekly Lottery" "Win big prizes!" 1 7
                const [lotteryName, lotteryDesc, ticketPrice, days] = args.slice(1);
                await admin.createLottery(lotteryName, lotteryDesc, parseFloat(ticketPrice), parseInt(days));
                break;
            case 'list-lotteries':
                await admin.listLotteries();
                break;
            default:
                console.log('Available commands:');
                console.log('  stats - Show user statistics');
                console.log('  add-task <type> <title> <description> <reward> <link> - Add new task');
                console.log('  list-tasks - List all tasks');
                console.log('  create-promo <code> <reward> [maxUses] - Create promo code');
                console.log('  random-promo <reward> [maxUses] - Generate random promo code');
                console.log('  list-promos - List all promo codes');
                console.log('  create-lottery <name> <description> <ticketPrice> <days> - Create lottery');
                console.log('  list-lotteries - List all lotteries');
                break;
        }
    } catch (error) {
        console.error('Error executing command:', error);
    } finally {
        await admin.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = AdminHelper;
