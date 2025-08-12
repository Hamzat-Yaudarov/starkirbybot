const crypto = require('crypto');
const SafeMessageHelper = require('../utils/safeMessageHelper');
const InstanceCoordinator = require('../utils/instanceCoordinator');

class UserController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
        this.processingRewards = new Set(); // Track users currently being processed
        this.coordinator = null; // Will be initialized later
    }

    // Initialize coordinator after database is ready
    async initCoordinator() {
        if (!this.coordinator) {
            this.coordinator = new InstanceCoordinator(this.db);
            await this.coordinator.init();
        }
    }

    // Generate unique referral code
    generateReferralCode() {
        return crypto.randomBytes(4).toString('hex').toUpperCase();
    }

    // Register new user or get existing
    async registerUser(userId, username, firstName, referralCode = null) {
        try {
            // Check if user already exists
            const existingUser = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);

            if (existingUser) {
                // Mark as existing user
                existingUser.isNewUser = false;
                return existingUser;
            }

            // Generate unique referral code
            let userReferralCode;
            let isUnique = false;
            while (!isUnique) {
                userReferralCode = this.generateReferralCode();
                const existing = await this.db.get('SELECT id FROM users WHERE referral_code = ?', [userReferralCode]);
                if (!existing) {
                    isUnique = true;
                }
            }

            let referrerId = null;

            // If user came from referral link
            if (referralCode) {
                const referrer = await this.db.get('SELECT id FROM users WHERE referral_code = ?', [referralCode]);
                if (referrer) {
                    referrerId = referrer.id;
                }
            }

            // Create new user
            const result = await this.db.run(
                'INSERT INTO users (id, username, first_name, referrer_id, referral_code) VALUES (?, ?, ?, ?, ?)',
                [userId, username, firstName, referrerId, userReferralCode]
            );

            // Only update referral counts for now, rewards will be processed after mandatory subscriptions
            if (referrerId) {
                await this.updateReferralCounts(referrerId);

                // Also update level 2 referrer if exists
                const referrer = await this.db.get('SELECT referrer_id FROM users WHERE id = ?', [referrerId]);
                if (referrer && referrer.referrer_id) {
                    await this.updateReferralCounts(referrer.referrer_id);
                }
            }

            // Get created user
            const newUser = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            // Mark as new user
            newUser.isNewUser = true;
            return newUser;
        } catch (error) {
            console.error('Error registering user:', error);
            throw error;
        }
    }

    // Add referral rewards (immediate)
    async addReferralRewards(referrerId, newUserId) {
        try {
            // Calculate boost from pets (referral_1 boost pets)
            const level1Pets = await this.db.all(`
                SELECT p.boost_multiplier, up.level
                FROM user_pets up
                JOIN pets p ON up.pet_id = p.id
                WHERE up.user_id = ? AND p.boost_type = 'referral_1'
            `, [referrerId]);

            let level1Boost = 0;
            level1Pets.forEach(pet => {
                level1Boost += pet.boost_multiplier * pet.level;
            });

            // Level 1 referral reward (3 stars base + boost)
            const baseLevel1Reward = 3;
            const finalLevel1Reward = baseLevel1Reward + level1Boost;

            await this.db.run(
                'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                [finalLevel1Reward, finalLevel1Reward, referrerId]
            );

            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [referrerId, 'referral', finalLevel1Reward, `Реферал 1 уровня (+${level1Boost} буст)`]
            );

            // Check for level 2 referral
            const referrer = await this.db.get('SELECT referrer_id FROM users WHERE id = ?', [referrerId]);
            if (referrer && referrer.referrer_id) {
                // Calculate boost from pets (referral_2 boost pets)
                const level2Pets = await this.db.all(`
                    SELECT p.boost_multiplier, up.level
                    FROM user_pets up
                    JOIN pets p ON up.pet_id = p.id
                    WHERE up.user_id = ? AND p.boost_type = 'referral_2'
                `, [referrer.referrer_id]);

                let level2Boost = 0;
                level2Pets.forEach(pet => {
                    level2Boost += pet.boost_multiplier * pet.level;
                });

                // Level 2 referral reward (0.05 stars base + boost)
                const baseLevel2Reward = 0.05;
                const finalLevel2Reward = baseLevel2Reward + level2Boost;

                await this.db.run(
                    'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                    [finalLevel2Reward, finalLevel2Reward, referrer.referrer_id]
                );

                await this.db.run(
                    'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                    [referrer.referrer_id, 'referral', finalLevel2Reward, `Реферал 2 уровня (+${level2Boost} буст)`]
                );
            }
        } catch (error) {
            console.error('Error adding referral rewards:', error);
        }
    }

    // Process referral rewards after mandatory channel subscription
    async processDelayedReferralRewards(newUserId) {
        try {
            // Check if already processing this user
            if (this.processingRewards.has(newUserId)) {
                console.log(`Already processing referral rewards for user ${newUserId}`);
                return;
            }

            // Add to processing set
            this.processingRewards.add(newUserId);

            // Get the new user
            const newUser = await this.db.get('SELECT referrer_id FROM users WHERE id = ?', [newUserId]);

            if (!newUser || !newUser.referrer_id) {
                console.log(`No referrer found for user ${newUserId}`);
                this.processingRewards.delete(newUserId);
                return; // No referrer, nothing to process
            }

            // Check if we already processed rewards for this specific user
            const existingReward = await this.db.get(
                'SELECT id FROM transactions WHERE user_id = ? AND type = ? AND description LIKE ?',
                [newUser.referrer_id, 'referral', `%ID: ${newUserId}%`]
            );

            if (existingReward) {
                console.log(`Referral rewards already processed for user ${newUserId}`);
                this.processingRewards.delete(newUserId);
                return; // Already processed rewards for this specific new user
            }

            const referrerId = newUser.referrer_id;

            // Calculate boost from pets (referral_1 boost pets) для отложенных наград
            const level1Pets = await this.db.all(`
                SELECT p.boost_multiplier, up.level
                FROM user_pets up
                JOIN pets p ON up.pet_id = p.id
                WHERE up.user_id = ? AND p.boost_type = 'referral_1'
            `, [referrerId]);

            let level1Boost = 0;
            level1Pets.forEach(pet => {
                level1Boost += pet.boost_multiplier * pet.level;
            });

            // Level 1 referral reward (3 stars base + boost)
            const baseLevel1Reward = 3;
            const finalLevel1Reward = baseLevel1Reward + level1Boost;

            await this.db.run(
                'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                [finalLevel1Reward, finalLevel1Reward, referrerId]
            );

            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [referrerId, 'referral', finalLevel1Reward, `Реферал активирован (ID: ${newUserId}) +${level1Boost} буст`]
            );

            // Send congratulations message to referrer
            const newUserInfo = await this.db.get('SELECT username, first_name FROM users WHERE id = ?', [newUserId]);
            const newUserName = newUserInfo ? (newUserInfo.username ? `@${newUserInfo.username}` : newUserInfo.first_name) : 'пользователь';

            const boostInfo = level1Boost > 0 ? ` (базовая 3 + буст +${level1Boost} от питомцев)` : '';

            try {
                await this.bot.sendMessage(referrerId, `🎉 **НОВЫЙ РЕФЕРАЛ АКТИВИРОВАН!**

👤 По ваше�� ссылке зарегистрировался: **${newUserName}**

💰 **Награда:** ${finalLevel1Reward.toFixed(2)} ⭐${boostInfo}

🔥 Продолжайте приглашать друзей и зарабатывать ещё больше!`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '👥 Пригласить ещё', callback_data: 'menu_referral' },
                                { text: '🐾 Питомцы', callback_data: 'menu_pets' }
                            ],
                            [
                                { text: '👤 Профиль', callback_data: 'menu_profile' },
                                { text: '🏠 Главное меню', callback_data: 'main_menu' }
                            ]
                        ]
                    }
                });
            } catch (msgError) {
                console.log('Could not send congratulations message to referrer');
            }

            // Check for level 2 referral
            const level1Referrer = await this.db.get('SELECT referrer_id FROM users WHERE id = ?', [referrerId]);
            if (level1Referrer && level1Referrer.referrer_id) {
                // Calculate boost from pets (referral_2 boost pets)
                const level2Pets = await this.db.all(`
                    SELECT p.boost_multiplier, up.level
                    FROM user_pets up
                    JOIN pets p ON up.pet_id = p.id
                    WHERE up.user_id = ? AND p.boost_type = 'referral_2'
                `, [level1Referrer.referrer_id]);

                let level2Boost = 0;
                level2Pets.forEach(pet => {
                    level2Boost += pet.boost_multiplier * pet.level;
                });

                // Level 2 referral reward (0.05 stars base + boost)
                const baseLevel2Reward = 0.05;
                const finalLevel2Reward = baseLevel2Reward + level2Boost;

                await this.db.run(
                    'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                    [finalLevel2Reward, finalLevel2Reward, level1Referrer.referrer_id]
                );

                await this.db.run(
                    'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                    [level1Referrer.referrer_id, 'referral', finalLevel2Reward, `Реферал 2 уровн�� активирован (ID: ${newUserId}) +${level2Boost} буст`]
                );

                const level2BoostInfo = level2Boost > 0 ? ` (базовая 0.05 + буст +${level2Boost} от питомцев)` : '';

                // Send congratulations message to level 2 referrer
                try {
                    await this.bot.sendMessage(level1Referrer.referrer_id, `🎉 **РЕФЕРАЛ 2 УРОВНЯ!**

👥 Ваш реферал привёл друга!

💰 **Награда:** ${finalLevel2Reward.toFixed(3)} ⭐${level2BoostInfo}

🔥 Приглашайте больше друзей для увеличения доходов!`, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⭐ Пригласит�� друзей', callback_data: 'menu_referral' }]
                            ]
                        }
                    });
                } catch (msgError) {
                    console.log('Could not send congratulations message to level 2 referrer');
                }
            }

        } catch (error) {
            console.error('Error processing delayed referral rewards:', error);
        } finally {
            // Always remove from processing set
            this.processingRewards.delete(newUserId);
        }
    }

    // Update referral counts
    async updateReferralCounts(userId) {
        try {
            const level1Count = await this.db.get(
                'SELECT COUNT(*) as count FROM users WHERE referrer_id = ?',
                [userId]
            );

            const level2Count = await this.db.get(
                `SELECT COUNT(*) as count FROM users u1 
                 JOIN users u2 ON u1.id = u2.referrer_id 
                 WHERE u1.referrer_id = ?`,
                [userId]
            );

            await this.db.run(
                'UPDATE users SET level1_referrals = ?, level2_referrals = ? WHERE id = ?',
                [level1Count.count, level2Count.count, userId]
            );
        } catch (error) {
            console.error('Error updating referral counts:', error);
        }
    }

    // Show user profile
    async showProfile(chatId, userId, messageId = null) {
        const lockKey = `profile_${userId}`;

        try {
            // Ensure coordinator is initialized
            if (!this.coordinator) {
                await this.initCoordinator();
            }

            // Use instance coordination to prevent multiple profile updates
            const profileData = await this.coordinator.withLock(lockKey, async () => {
                // Get all profile data atomically
                const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
                if (!user) {
                    throw new Error('USER_NOT_FOUND');
                }

                // Get user pets by boost type
                const userPets = await this.db.all(`
                    SELECT p.name, p.boost_multiplier, p.boost_type, up.level
                    FROM user_pets up
                    JOIN pets p ON up.pet_id = p.id
                    WHERE up.user_id = ?
                    ORDER BY up.id ASC
                `, [userId]);

                return { user, userPets };
            });

            const { user, userPets } = profileData;

            let petsInfo = '';
            let clickBoost = 0;
            let referral1Boost = 0;
            let referral2Boost = 0;
            let taskBoost = 0;

            if (userPets.length === 0) {
                petsInfo = '🐾 **Питомцы:** Отсутствуют';
            } else {
                // Calculate boosts by type
                userPets.forEach(pet => {
                    const petBoost = pet.boost_multiplier * pet.level;
                    switch(pet.boost_type) {
                        case 'click':
                            clickBoost += petBoost;
                            break;
                        case 'referral_1':
                            referral1Boost += petBoost;
                            break;
                        case 'referral_2':
                            referral2Boost += petBoost;
                            break;
                        case 'task':
                            taskBoost += petBoost;
                            break;
                    }
                });

                const petsList = userPets.map(pet => {
                    return `${pet.name} (${pet.level} ур.)`;
                }).join(', ');
                petsInfo = `🐾 **Активные питомцы:** ${petsList}`;
            }

            // Create boost info string
            let boostInfo = '';
            if (clickBoost > 0 || referral1Boost > 0 || referral2Boost > 0 || taskBoost > 0) {
                boostInfo = '\n📈 **Бусты от питомцев:**';
                if (clickBoost > 0) boostInfo += `\n• Кликер: +${clickBoost.toFixed(1)} ⭐`;
                if (referral1Boost > 0) boostInfo += `\n• Рефералы 1 ур.: +${referral1Boost.toFixed(1)} ⭐`;
                if (referral2Boost > 0) boostInfo += `\n• Рефералы 2 ур.: +${referral2Boost.toFixed(1)} ⭐`;
                if (taskBoost > 0) boostInfo += `\n• Задания: +${taskBoost.toFixed(1)} ⭐`;
            }

            const profileMessage = `👤 **Персональный профиль**

💰 **Текущий баланс:** ${user.balance.toFixed(2)} ⭐
💎 **Общий заработок:** ${user.total_earned.toFixed(2)} ⭐

👥 **Реферальная сеть:**
├ Прямые рефералы: ${user.level1_referrals} пользователей
└ Рефералы 2-го уровня: ${user.level2_referrals} пол��зователей

${petsInfo}${boostInfo}

🔗 **Персональная реферальная ссылка:**
\`https://t.me/kirbystarsfarmbot?start=${user.referral_code}\`

💡 Поделитесь ссылкой с друзьями для пол��чения бонусов!`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '👆 Кликнуть', callback_data: 'menu_click' },
                        { text: '⭐ Пригласить друзей', callback_data: 'menu_referral' }
                    ],
                    [
                        { text: '🐾 Питомцы', callback_data: 'menu_pets' },
                        { text: '📋 Задания', callback_data: 'menu_tasks' }
                    ],
                    [
                        { text: '🏠 Главное меню', callback_data: 'main_menu' }
                    ]
                ]
            };

            if (messageId) {
                await SafeMessageHelper.safeEditMessage(this.bot, profileMessage, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else {
                await this.bot.sendMessage(chatId, profileMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }

            console.log(`✅ Profile displayed successfully for user ${userId}`);

        } catch (error) {
            console.error('Error showing profile:', error);

            if (error.message === 'USER_NOT_FOUND') {
                const errorMsg = '❌ Пользователь не найден';
                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot, errorMsg, {
                        chat_id: chatId,
                        message_id: messageId
                    });
                } else {
                    await this.bot.sendMessage(chatId, errorMsg);
                }
            } else {
                await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке профиля');
            }
        }
    }

    // Daily click system
    async dailyClick(chatId, userId, messageId = null) {
        try {
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Пользователь не найден');
                return;
            }

            const today = new Date().toDateString();
            const lastClickDate = user.last_click_date;

            if (lastClickDate === today) {
                // Calculate time until next click
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);

                const timeUntilReset = tomorrow.getTime() - now.getTime();
                const hoursLeft = Math.floor(timeUntilReset / (1000 * 60 * 60));
                const minutesLeft = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));

                const timeLeftText = hoursLeft > 0
                    ? `${hoursLeft}ч ${minutesLeft}м`
                    : `${minutesLeft}м`;

                const alreadyClickedMsg = `⏰ **Ежедневный бонус уже по��учен**

Вы уже активировали ежедневную награду сегодня.

⏳ **Следующий клик через:** ${timeLeftText}

💡 **Совет:** Приобретите питомцев для увеличения ежедневных наград.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🐾 Питомцы', callback_data: 'menu_pets' },
                            { text: '👤 Профиль', callback_data: 'menu_profile' }
                        ],
                        [
                            { text: '🏠 Главное меню', callback_data: 'main_menu' }
                        ]
                    ]
                };

                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot,alreadyClickedMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });
                } else {
                    await this.bot.sendMessage(chatId, alreadyClickedMsg, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });
                }
                return;
            }

            // Calculate boost from pets (only click boost pets)
            const userPets = await this.db.all(`
                SELECT p.boost_multiplier, up.level
                FROM user_pets up
                JOIN pets p ON up.pet_id = p.id
                WHERE up.user_id = ? AND p.boost_type = 'click'
            `, [userId]);

            let totalBoost = 0; // Изменено с 1 на 0 для аддитивной системы
            userPets.forEach(pet => {
                totalBoost += pet.boost_multiplier * pet.level; // Аддитивная система вместо мультипликативной
            });

            const baseReward = 0.1;
            const finalReward = baseReward + totalBoost; // Добавляем буст, а не умножаем

            // Update user balance and last click date
            await this.db.run(
                'UPDATE users SET balance = balance + ?, total_earned = total_earned + ?, last_click_date = ? WHERE id = ?',
                [finalReward, finalReward, today, userId]
            );

            // Log transaction
            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [userId, 'click', finalReward, 'Ежедн��вный клик']
            );

            const boostInfo = totalBoost > 0 ? ` (базовая ${baseReward} + буст +${totalBoost.toFixed(1)} от питомцев)` : '';

            const successMsg = `✅ **Ежедневная награда получена!**

💰 **Начислено:** ${finalReward.toFixed(3)} ⭐${boostInfo}
💎 **Текущий баланс:** ${(user.balance + finalReward).toFixed(2)} ⭐

⏰ **Следующая награда через:** 24 часа

🎯 **Увеличьте ��оходы:**
• Приобретите питомцев для постоянного бонуса
• Приглашайте друзей за дополнительные награды`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🐾 Питомцы', callback_data: 'menu_pets' },
                        { text: '⭐ Рефералы', callback_data: 'menu_referral' }
                    ],
                    [
                        { text: '👤 Профиль', callback_data: 'menu_profile' },
                        { text: '🏠 Главное меню', callback_data: 'main_menu' }
                    ]
                ]
            };

            if (messageId) {
                await SafeMessageHelper.safeEditMessage(this.bot,successMsg, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else {
                await this.bot.sendMessage(chatId, successMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }

        } catch (error) {
            console.error('Error in daily click:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при выполнении клика');
        }
    }

    // Get user by ID
    async getUser(userId) {
        return await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
    }

    // Update user balance
    async updateBalance(userId, amount, description = '') {
        try {
            await this.db.run(
                'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                [amount, amount > 0 ? amount : 0, userId]
            );

            if (amount !== 0) {
                await this.db.run(
                    'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                    [userId, amount > 0 ? 'reward' : 'spend', amount, description]
                );
            }
        } catch (error) {
            console.error('Error updating balance:', error);
            throw error;
        }
    }
}

module.exports = UserController;
