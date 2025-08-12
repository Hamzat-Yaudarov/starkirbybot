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

        // Тестовые данные добавляются через insertDefaultData

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
            { name: '🦄 Единорог', description: 'Мифически�� единорог - максимальный буст за клики', base_price: 1000, boost_type: 'click', boost_multiplier: 10 }
        ];

        // PRESERVE USER DATA - Only remove default pets if they don't have user ownership
        try {
            console.log('🔒 Preserving all user data - no default pet removal');
            console.log('📊 User data will remain intact');
            // No deletion - preserve all user pets and purchases
        } catch (error) {
            console.log('Error in data preservation:', error.message);
        }

        // Insert default cases only if none exist
        const existingCases = await this.get('SELECT COUNT(*) as count FROM cases');
        if (!existingCases || existingCases.count === 0) {
            console.log('Inserting default cases...');
            const defaultCases = [
                { name: '📦 Стандартный кейс', description: 'Базовые награды для начинающих', min_reward: 2, max_reward: 15 },
                { name: '💎 Премиум кейс', description: 'Улучшенн��е награды для активных пользователей', min_reward: 10, max_reward: 50 },
                { name: '👑 Королевский кейс', description: 'Эксклюзивные награды для топ-и��роков', min_reward: 25, max_reward: 200 }
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

        // PRESERVE USER TASK HISTORY - No task deletion to maintain data integrity
        try {
            console.log('🔒 Preserving all task and user_task data');
            console.log('📊 User task completion history will remain intact');
            // No deletion - preserve all user task progress
        } catch (error) {
            console.log('Error in task data preservation:', error.message);
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

    // Begin transaction
    beginTransaction() {
        try {
            this.db.exec('BEGIN TRANSACTION');
        } catch (error) {
            throw error;
        }
    }

    // Commit transaction
    commitTransaction() {
        try {
            this.db.exec('COMMIT');
        } catch (error) {
            throw error;
        }
    }

    // Rollback transaction
    rollbackTransaction() {
        try {
            this.db.exec('ROLLBACK');
        } catch (error) {
            throw error;
        }
    }

    // Execute multiple operations in a transaction
    async transaction(operations) {
        try {
            this.beginTransaction();

            const results = [];
            for (const operation of operations) {
                if (operation.type === 'run') {
                    const result = await this.run(operation.query, operation.params);
                    results.push(result);
                } else if (operation.type === 'get') {
                    const result = await this.get(operation.query, operation.params);
                    results.push(result);
                } else if (operation.type === 'all') {
                    const result = await this.all(operation.query, operation.params);
                    results.push(result);
                }
            }

            this.commitTransaction();
            return Promise.resolve(results);
        } catch (error) {
            try {
                this.rollbackTransaction();
            } catch (rollbackError) {
                console.error('Error during rollback:', rollbackError);
            }
            return Promise.reject(error);
        }
    }

    // Методы для работы с пользователями
    getUser(userId) {
        try {
            return this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        } catch (error) {
            console.error('Ошибка получения пользователя:', error);
            return null;
        }
    }

    createUser(userData) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO users (id, username, first_name, balance, referral_code, level1_referrals, total_earned)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            return stmt.run(
                userData.userId,
                userData.username,
                userData.username,
                userData.balance || 0,
                userData.referralCode,
                userData.totalReferrals || 0,
                userData.balance || 0
            );
        } catch (error) {
            console.error('Ошибка создания пользователя:', error);
            throw error;
        }
    }

    updateUserField(userId, field, value) {
        try {
            const stmt = this.db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`);
            return stmt.run(value, userId);
        } catch (error) {
            console.error(`Ошибка обновления поля ${field}:`, error);
            throw error;
        }
    }

    getUserByReferralCode(code) {
        try {
            return this.db.prepare('SELECT * FROM users WHERE referral_code = ?').get(code);
        } catch (error) {
            console.error('Ошибка поиска по реферальному коду:', error);
            return null;
        }
    }

    // Методы для задач
    getAllTasks() {
        try {
            return this.db.prepare('SELECT * FROM tasks WHERE is_active = 1').all();
        } catch (error) {
            console.error('Ошибка получения заданий:', error);
            return [];
        }
    }

    getTask(taskId) {
        try {
            return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        } catch (error) {
            console.error('Ошибка получения задания:', error);
            return null;
        }
    }

    getUserCompletedTasks(userId) {
        try {
            const rows = this.db.prepare('SELECT task_id FROM user_tasks WHERE user_id = ?').all(userId);
            return rows.map(row => row.task_id);
        } catch (error) {
            console.error('Ошибка получения выполненных заданий:', error);
            return [];
        }
    }

    completeUserTask(userId, taskId) {
        try {
            const stmt = this.db.prepare('INSERT OR IGNORE INTO user_tasks (user_id, task_id) VALUES (?, ?)');
            return stmt.run(userId, taskId);
        } catch (error) {
            console.error('Ошибка выполнения задания:', error);
            throw error;
        }
    }

    // Методы для питомцев
    getAllPets() {
        try {
            return this.db.prepare('SELECT * FROM pets WHERE is_active = 1').all();
        } catch (error) {
            console.error('Ошибка получения питомцев:', error);
            return [];
        }
    }

    getPet(petId) {
        try {
            return this.db.prepare('SELECT * FROM pets WHERE id = ?').get(petId);
        } catch (error) {
            console.error('Ошибка получения питомца:', error);
            return null;
        }
    }

    getUserPets(userId) {
        try {
            return this.db.prepare(`
                SELECT up.*, p.name, p.description, p.base_price as price
                FROM user_pets up
                JOIN pets p ON up.pet_id = p.id
                WHERE up.user_id = ?
            `).all(userId);
        } catch (error) {
            console.error('Ошибка получения питомцев пользователя:', error);
            return [];
        }
    }

    addUserPet(userId, petId, level = 1) {
        try {
            const stmt = this.db.prepare('INSERT INTO user_pets (user_id, pet_id, level) VALUES (?, ?, ?)');
            return stmt.run(userId, petId, level);
        } catch (error) {
            console.error('Ошибка добавления питомца:', error);
            throw error;
        }
    }

    // Методы для кейсов (упрощённая версия)
    getUserCases(userId) {
        try {
            // Возвращаем пустой массив, так как у нас нет таблицы user_cases
            return [];
        } catch (error) {
            console.error('Ошибка получения кейсов:', error);
            return [];
        }
    }

    saveUserCase(userId, caseType, timestamp) {
        try {
            // Заглушка для сохранения информации о кейсах
            console.log(`Пользователь ${userId} открыл кейс ${caseType} в ${timestamp}`);
        } catch (error) {
            console.error('Ошибка сохранения кейса:', error);
        }
    }

    // Методы для рейтингов
    getTopUsersByReferrals(limit = 10) {
        try {
            return this.db.prepare(`
                SELECT username, level1_referrals as totalReferrals
                FROM users
                ORDER BY level1_referrals DESC
                LIMIT ?
            `).all(limit);
        } catch (error) {
            console.error('Ошибка получения топа:', error);
            return [];
        }
    }

    // Методы для лотерей (заглушки)
    getActiveLotteries() {
        return []; // Заглушка
    }

    getLottery(lotteryId) {
        return null; // Заглушка
    }

    getLotteryTicketCount(lotteryId) {
        return 0; // Заглушка
    }

    addLotteryTicket(userId, lotteryId) {
        console.log(`Добавлен билет лотереи ${lotteryId} для пользователя ${userId}`);
    }

    // Методы для промокодов (заглушки)
    getPromoCode(code) {
        return null; // Заглушка
    }

    getUserUsedPromoCodes(userId) {
        return []; // Заглушка
    }

    getPromoCodeUsageCount(promoId) {
        return 0; // Заглушка
    }

    markPromoCodeAsUsed(userId, promoId) {
        console.log(`Промокод ${promoId} использован пользователем ${userId}`);
    }

    // Методы для вывода средств
    createWithdrawal(userId, amount) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO withdrawals (user_id, amount, status)
                VALUES (?, ?, 'pending')
            `);
            const result = stmt.run(userId, amount);
            return result.lastInsertRowid;
        } catch (error) {
            console.error('Ошибка создания заявки на вывод:', error);
            throw error;
        }
    }

    // Методы для админ-статистики
    getUserCount() {
        try {
            const result = this.db.prepare('SELECT COUNT(*) as count FROM users').get();
            return result.count;
        } catch (error) {
            console.error('Ошибка подсчёта пользов��телей:', error);
            return 0;
        }
    }

    getTotalBalance() {
        try {
            const result = this.db.prepare('SELECT SUM(balance) as total FROM users').get();
            return result.total || 0;
        } catch (error) {
            console.error('Ошибка подсчёта общего баланса:', error);
            return 0;
        }
    }

    getTotalReferrals() {
        try {
            const result = this.db.prepare('SELECT SUM(level1_referrals) as total FROM users').get();
            return result.total || 0;
        } catch (error) {
            console.error('Ошибка подсчёта рефералов:', error);
            return 0;
        }
    }

    getTodayRegistrations() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const result = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE DATE(registration_date) = ?').get(today);
            return result.count;
        } catch (error) {
            console.error('Ошибка подсчёта регистраций за сегодня:', error);
            return 0;
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
