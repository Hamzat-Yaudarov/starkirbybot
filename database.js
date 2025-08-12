const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.db = null;
    }

    async init() {
        const dbPath = path.join(__dirname, 'bot.db');
        
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        // Enable foreign key constraints
        await this.run('PRAGMA foreign_keys = ON');
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
            await this.run('UPDATE pets SET boost_type = "click" WHERE boost_type IS NULL OR boost_type = ""');
            console.log('Updated existing pets with default boost_type');
        } catch (error) {
            console.log('Error updating existing pets:', error.message);
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
            { name: '🐶 Щенок', description: 'Верный щенок приносит дополнительные звёзды за рефералов 1 уровня', base_price: 50, boost_type: 'referral_1', boost_multiplier: 2 },
            { name: '🦅 Орёл', description: 'Гордый орёл увеличивает награды за рефералов 2 уровня', base_price: 150, boost_type: 'referral_2', boost_multiplier: 3 },
            { name: '🐲 Дракон', description: 'Легендарный дракон даёт бонусы за выполнение заданий', base_price: 500, boost_type: 'task', boost_multiplier: 5 },
            { name: '🦄 Единорог', description: 'Мифический единоро�� - максимальный буст за клики', base_price: 1000, boost_type: 'click', boost_multiplier: 10 }
        ];

        // Check if pets already exist to avoid duplicates
        const existingPets = await this.get('SELECT COUNT(*) as count FROM pets');
        if (existingPets.count === 0) {
            console.log('Inserting default pets...');
            for (const pet of defaultPets) {
                await this.run(
                    'INSERT INTO pets (name, description, base_price, boost_type, boost_multiplier) VALUES (?, ?, ?, ?, ?)',
                    [pet.name, pet.description, pet.base_price, pet.boost_type, pet.boost_multiplier]
                );
            }
        } else {
            console.log('Pets already exist, skipping insertion');
        }

        // Insert default cases
        const defaultCases = [
            { name: '📦 Стандартный кейс', description: 'Базовые награды для начинающих', min_reward: 2, max_reward: 15 },
            { name: '💎 Премиум кейс', description: 'Улучшенные награды для активных пользователей', min_reward: 10, max_reward: 50 },
            { name: '👑 Королевский кейс', description: 'Эксклюзивные награды для топ-игроков', min_reward: 25, max_reward: 200 }
        ];

        for (const caseItem of defaultCases) {
            await this.run(
                'INSERT OR IGNORE INTO cases (name, description, min_reward, max_reward) VALUES (?, ?, ?, ?)',
                [caseItem.name, caseItem.description, caseItem.min_reward, caseItem.max_reward]
            );
        }

        // Insert default tasks
        const defaultTasks = [
            { type: 'channel', title: 'Подписаться на канал', description: 'Подпишитесь на наш офи��иальный канал', reward: 5, target_link: 'https://t.me/example_channel' },
            { type: 'bot', title: 'Запустить бота', description: 'Запустит�� нашего партнёрского бота', reward: 3, target_link: 'https://t.me/example_bot' }
        ];

        for (const task of defaultTasks) {
            await this.run(
                'INSERT OR IGNORE INTO tasks (type, title, description, reward, target_link) VALUES (?, ?, ?, ?, ?)',
                [task.type, task.title, task.description, task.reward, task.target_link]
            );
        }
    }

    run(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    get(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    all(query, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

module.exports = Database;
