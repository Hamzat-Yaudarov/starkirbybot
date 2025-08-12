const Database3 = require('better-sqlite3');
const path = require('path');

class Database {
    constructor() {
        this.db = null;
    }

    async init() {
        const dbPath = path.join(__dirname, 'bot.db');

        try {
            this.db = new Database3(dbPath);
            console.log('Connected to SQLite database with better-sqlite3');
            await this.createTables();
            return Promise.resolve();
        } catch (error) {
            return Promise.reject(error);
        }
    }

    async createTables() {
        // Enable foreign key constraints
        this.db.pragma('foreign_keys = ON');
        console.log('Foreign key constraints enabled');

        const queries = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT NOT NULL,
                balance REAL DEFAULT 0,
                referrer_id INTEGER,
                referral_code TEXT UNIQUE,
                last_click_date TEXT,
                registration_date TEXT DEFAULT CURRENT_TIMESTAMP,
                level1_referrals INTEGER DEFAULT 0,
                level2_referrals INTEGER DEFAULT 0,
                total_earned REAL DEFAULT 0,
                cases_opened_today INTEGER DEFAULT 0,
                last_case_date TEXT,
                FOREIGN KEY (referrer_id) REFERENCES users (id)
            )`,

            // Tasks table
            `CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL, -- 'channel', 'chat', 'bot'
                title TEXT NOT NULL,
                description TEXT,
                reward REAL NOT NULL,
                target_link TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                created_date TEXT DEFAULT CURRENT_TIMESTAMP
            )`,

            // User tasks table (for tracking completed tasks)
            `CREATE TABLE IF NOT EXISTS user_tasks (
                user_id INTEGER,
                task_id INTEGER,
                completed_date TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, task_id),
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (task_id) REFERENCES tasks (id)
            )`,

            // Pets table
            `CREATE TABLE IF NOT EXISTS pets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                base_price REAL NOT NULL,
                boost_type TEXT NOT NULL, -- 'click', 'referral_1', 'referral_2', 'task'
                boost_multiplier REAL NOT NULL,
                max_level INTEGER DEFAULT 10,
                image_url TEXT,
                is_active INTEGER DEFAULT 1
            )`,

            // User pets table
            `CREATE TABLE IF NOT EXISTS user_pets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                pet_id INTEGER,
                level INTEGER DEFAULT 1,
                purchase_date TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (pet_id) REFERENCES pets (id)
            )`,

            // Cases table
            `CREATE TABLE IF NOT EXISTS cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                min_reward REAL NOT NULL,
                max_reward REAL NOT NULL,
                price REAL DEFAULT 0,
                image_url TEXT
            )`,

            // Lotteries table
            `CREATE TABLE IF NOT EXISTS lotteries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                ticket_price REAL NOT NULL,
                start_date TEXT DEFAULT CURRENT_TIMESTAMP,
                end_date TEXT,
                is_active INTEGER DEFAULT 1,
                total_pool REAL DEFAULT 0,
                bot_commission REAL DEFAULT 0.1
            )`,

            // Lottery tickets table
            `CREATE TABLE IF NOT EXISTS lottery_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lottery_id INTEGER,
                user_id INTEGER,
                purchase_date TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (lottery_id) REFERENCES lotteries (id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,

            // Promo codes table
            `CREATE TABLE IF NOT EXISTS promo_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                reward REAL NOT NULL,
                max_uses INTEGER DEFAULT 1,
                current_uses INTEGER DEFAULT 0,
                expiry_date TEXT,
                is_active INTEGER DEFAULT 1,
                created_date TEXT DEFAULT CURRENT_TIMESTAMP
            )`,

            // User promo codes table
            `CREATE TABLE IF NOT EXISTS user_promo_codes (
                user_id INTEGER,
                promo_code_id INTEGER,
                used_date TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, promo_code_id),
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (promo_code_id) REFERENCES promo_codes (id)
            )`,

            // Withdrawals table
            `CREATE TABLE IF NOT EXISTS withdrawals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                amount REAL NOT NULL,
                withdrawal_type TEXT NOT NULL, -- '15', '25', '50', '100', 'premium'
                status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
                request_date TEXT DEFAULT CURRENT_TIMESTAMP,
                processed_date TEXT,
                admin_note TEXT,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,

            // Ratings table (for weekly rankings)
            `CREATE TABLE IF NOT EXISTS weekly_ratings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                week_start TEXT,
                referrals_count INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,

            // Transactions log table
            `CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                type TEXT NOT NULL, -- 'click', 'task', 'referral', 'case', 'pet_boost', 'withdrawal', 'promo'
                amount REAL NOT NULL,
                description TEXT,
                date TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,

            // Mandatory channels table
            `CREATE TABLE IF NOT EXISTS mandatory_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT NOT NULL UNIQUE,
                channel_name TEXT NOT NULL,
                channel_link TEXT NOT NULL,
                is_private INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_date TEXT DEFAULT CURRENT_TIMESTAMP
            )`,

            // User bans table
            `CREATE TABLE IF NOT EXISTS user_bans (
                user_id INTEGER PRIMARY KEY,
                banned_date TEXT DEFAULT CURRENT_TIMESTAMP,
                ban_reason TEXT,
                banned_by INTEGER,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`
        ];

        for (const query of queries) {
            await this.run(query);
        }

        // Migrate existing pets table to add boost_type column if it doesn't exist
        try {
            await this.run('ALTER TABLE pets ADD COLUMN boost_type TEXT DEFAULT "click"');
            console.log('Added boost_type column to pets table');
        } catch (error) {
            // Column might already exist, ignore error
            if (!error.message.includes('duplicate column name')) {
                console.log('boost_type column already exists or other error:', error.message);
            }
        }

        // Update existing pets without boost_type
        try {
            // First check if the column exists
            const tableInfo = await this.all("PRAGMA table_info(pets)");
            const hasBoostType = tableInfo.some(col => col.name === 'boost_type');

            if (hasBoostType) {
                await this.run('UPDATE pets SET boost_type = ? WHERE boost_type IS NULL OR boost_type = ?', ['click', '']);
                console.log('Updated existing pets with default boost_type');
            } else {
                console.log('boost_type column does not exist yet');
            }
        } catch (error) {
            console.log('Error updating existing pets:', error.message);
        }

        // Fix withdrawals table schema completely
        try {
            // Check if withdrawals table exists and has correct schema
            const tables = await this.all("SELECT name FROM sqlite_master WHERE type='table' AND name='withdrawals'");

            if (tables.length === 0) {
                console.log('Withdrawals table does not exist, will be created by main schema');
            } else {
                const withdrawalsTableInfo = await this.all("PRAGMA table_info(withdrawals)");
                console.log('Current withdrawals table columns:', withdrawalsTableInfo.map(col => col.name));

                const hasStatusColumn = withdrawalsTableInfo.some(col => col.name === 'status');

                if (!hasStatusColumn) {
                    console.log('Adding missing status column to withdrawals table...');
                    await this.run('ALTER TABLE withdrawals ADD COLUMN status TEXT DEFAULT "pending"');
                    console.log('✅ Added status column to withdrawals table');
                } else {
                    console.log('✅ Withdrawals table already has status column');
                }
            }
        } catch (error) {
            console.log('❌ Error fixing withdrawals table:', error.message);
        }

        // Check and log existing user pets to ensure they're preserved
        try {
            const userPetsCount = await this.get('SELECT COUNT(*) as count FROM user_pets');
            console.log(`Found ${userPetsCount.count} user pets in database`);
            if (userPetsCount.count > 0) {
                const samplePets = await this.all('SELECT user_id, pet_id, level FROM user_pets LIMIT 3');
                console.log('Sample user pets:', samplePets);
            }
        } catch (error) {
            console.log('Error checking user pets:', error.message);
        }

        // No longer clearing existing pets to prevent data loss
        // Only initialize pets if they don't exist already
        console.log('Preserving existing pet data');

        // Insert default data
        await this.insertDefaultData();
        console.log('Database tables created successfully');
    }

    async insertDefaultData() {
        // Insert default pets
        const defaultPets = [
            { name: '🐱 Котёнок', description: 'Милый котёнок помогает зарабатывать больше звёзд за клики', base_price: 15, boost_type: 'click', boost_multiplier: 1 },
            { name: '🐶 Щенок', description: 'Верный щенок приносит допол��ительные звёзды за рефералов 1 уровня', base_price: 50, boost_type: 'referral_1', boost_multiplier: 2 },
            { name: '🦅 Орёл', description: 'Гордый орёл увеличивает награды за рефералов 2 уровня', base_price: 150, boost_type: 'referral_2', boost_multiplier: 3 },
            { name: '🐲 Дракон', description: 'Легендарный дракон даёт бонусы за выполнение заданий', base_price: 500, boost_type: 'task', boost_multiplier: 5 },
            { name: '🦄 Единорог', description: 'Мифический единорог - максимальный буст за клики', base_price: 1000, boost_type: 'click', boost_multiplier: 10 }
        ];

        // REMOVE ALL DEFAULT PETS as requested by user
        try {
            console.log('🗑️ Removing all default pets as requested...');

            // First, delete all user_pets to avoid foreign key constraints
            const deletedUserPets = await this.run('DELETE FROM user_pets WHERE pet_id IN (SELECT id FROM pets)');
            console.log(`Removed ${deletedUserPets.changes} user pets`);

            // Then delete all pets
            const deletedPets = await this.run('DELETE FROM pets');
            console.log(`✅ Removed ${deletedPets.changes} default pets`);

            // Also clear any pet-related transactions
            await this.run('DELETE FROM transactions WHERE type = "pet_purchase"');
            console.log('Cleared pet purchase transactions');

        } catch (error) {
            console.log('Error removing default pets:', error.message);
        }

        // Insert default cases only if none exist
        const existingCases = await this.get('SELECT COUNT(*) as count FROM cases');
        if (!existingCases || existingCases.count === 0) {
            console.log('Inserting default cases...');
            const defaultCases = [
                { name: '📦 Стандартный кейс', description: 'Базовые награды для начинающих', min_reward: 2, max_reward: 15 },
                { name: '💎 Премиум кейс', description: 'Улучшенн��е награды для активных пользователей', min_reward: 10, max_reward: 50 },
                { name: '👑 Королевский кейс', description: 'Эксклюзивные награды для топ-игроков', min_reward: 25, max_reward: 200 }
            ];

            for (const caseItem of defaultCases) {
                await this.run(
                    'INSERT INTO cases (name, description, min_reward, max_reward) VALUES (?, ?, ?, ?)',
                    [caseItem.name, caseItem.description, caseItem.min_reward, caseItem.max_reward]
                );
            }
        } else {
            console.log('Cases already exist, skipping insertion');
        }

        // REMOVE ALL DEFAULT TASKS as requested by user
        try {
            console.log('🗑️ Removing all default tasks as requested...');
            const deletedTasks = await this.run('DELETE FROM tasks');
            console.log(`✅ Removed ${deletedTasks.changes} default tasks`);
        } catch (error) {
            console.log('Error removing default tasks:', error.message);
        }
    }

    run(query, params = []) {
        try {
            const stmt = this.db.prepare(query);
            const result = stmt.run(params);
            return Promise.resolve({
                id: result.lastInsertRowid,
                changes: result.changes
            });
        } catch (error) {
            return Promise.reject(error);
        }
    }

    get(query, params = []) {
        try {
            const stmt = this.db.prepare(query);
            const result = stmt.get(params);
            return Promise.resolve(result || null);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    all(query, params = []) {
        try {
            const stmt = this.db.prepare(query);
            const result = stmt.all(params);
            return Promise.resolve(result || []);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    close() {
        try {
            this.db.close();
            return Promise.resolve();
        } catch (error) {
            return Promise.reject(error);
        }
    }
}

module.exports = Database;
