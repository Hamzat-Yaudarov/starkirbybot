class CaseController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
    }

    // Show available cases
    async showCases(chatId, userId, messageId = null) {
        try {
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Пользователь не найден');
                return;
            }

            const today = new Date().toDateString();
            const canOpenCase = this.canOpenCaseToday(user, today);
            const casesAvailable = await this.getCasesAvailableToday(userId, today);

            let message = `📦 Кейсы - ваш шанс на большую награду!

📊 Ваша статистика:
👥 Рефералы 1 уровня: ${user.level1_referrals}
📦 Кейсов доступно сегодня: ${casesAvailable}
💰 Баланс: ${user.balance.toFixed(2)} ⭐

`;

            if (!canOpenCase) {
                message += `❌ Сегодня вы уже открывали кейс!
⏰ Возвращайтесь завтра за новым кейсом.

📝 Как получить больше кейсов:
• Приглашайте 3+ друзей в день
• Каждые 3 новых реферала = 1 кейс`;

                const keyboard = [[
                    { text: '🏠 Главное меню', callback_data: 'main_menu' }
                ]];

                if (messageId) {
                    await this.bot.editMessageText(message, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, message, {
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    });
                }
                return;
            }

            if (casesAvailable === 0) {
                message += `🚫 У вас нет доступных кейсов на сегодня

📝 Как получить кейсы:
• Пригласите 3+ друзей в день
• За каждые 3 новых реферала получите 1 кейс
• Кейсы обновляются каждый день

🔗 Ваша реферальная ссылка:
https://t.me/kirbystarsfarmbot?start=${user.referral_code}`;

                const keyboard = [
                    [{ text: '⭐ Пригласить друзей', callback_data: 'show_referral' }],
                    [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                ];

                if (messageId) {
                    await this.bot.editMessageText(message, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, message, {
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    });
                }
                return;
            }

            // Show available cases to open
            const cases = await this.db.all('SELECT * FROM cases ORDER BY min_reward ASC');
            
            message += `🎁 Доступные кейсы для открытия:

`;

            const keyboard = [];
            for (const caseItem of cases) {
                message += `📦 ${caseItem.name}
💰 Награда: ${caseItem.min_reward} - ${caseItem.max_reward} ⭐
📝 ${caseItem.description}

`;
                keyboard.push([{ 
                    text: `🎁 Открыть ${caseItem.name}`, 
                    callback_data: `case_open_${caseItem.id}` 
                }]);
            }

            keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main_menu' }]);

            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, message, {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error showing cases:', error);
            const errorMsg = '❌ Ошибка при загрузке кейсов';
            if (messageId) {
                try {
                    await this.bot.editMessageText(errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🏠 Главное меню', callback_data: 'main_menu' }
                            ]]
                        }
                    });
                } catch (editError) {
                    await this.bot.sendMessage(chatId, errorMsg);
                }
            } else {
                await this.bot.sendMessage(chatId, errorMsg);
            }
        }
    }

    // Check if user can open case today
    canOpenCaseToday(user, today) {
        return user.last_case_date !== today;
    }

    // Calculate how many cases user can open today
    async getCasesAvailableToday(userId, today) {
        try {
            // Count referrals invited today
            const todayReferrals = await this.db.get(`
                SELECT COUNT(*) as count 
                FROM users 
                WHERE referrer_id = ? AND DATE(registration_date) = DATE('now')
            `, [userId]);

            // Get user data
            const user = await this.db.get('SELECT cases_opened_today, last_case_date FROM users WHERE id = ?', [userId]);
            
            // Reset cases count if it's a new day
            if (user.last_case_date !== today) {
                await this.db.run(
                    'UPDATE users SET cases_opened_today = 0 WHERE id = ?',
                    [userId]
                );
                user.cases_opened_today = 0;
            }

            // Calculate available cases (1 case per 3 referrals, max 1 per day)
            const earnedCases = Math.floor(todayReferrals.count / 3);
            const availableCases = Math.max(0, earnedCases - user.cases_opened_today);
            
            return Math.min(availableCases, 1); // Max 1 case per day

        } catch (error) {
            console.error('Error calculating available cases:', error);
            return 0;
        }
    }

    // Handle case opening callback
    async handleCaseCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        try {
            if (data.startsWith('case_open_')) {
                const caseId = parseInt(data.split('_')[2]);
                await this.openCase(chatId, userId, caseId);
            }
        } catch (error) {
            console.error('Error handling case callback:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при открытии кейса');
        }
    }

    // Open a case and give reward
    async openCase(chatId, userId, caseId) {
        try {
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            const caseItem = await this.db.get('SELECT * FROM cases WHERE id = ?', [caseId]);
            
            if (!user || !caseItem) {
                await this.bot.sendMessage(chatId, '❌ Пользователь или кейс не найден');
                return;
            }

            const today = new Date().toDateString();
            
            // Check if user can open case
            if (!this.canOpenCaseToday(user, today)) {
                await this.bot.sendMessage(chatId, '❌ Вы уже открывали кейс сегодня!');
                return;
            }

            const casesAvailable = await this.getCasesAvailableToday(userId, today);
            if (casesAvailable === 0) {
                await this.bot.sendMessage(chatId, '❌ У вас нет доступных кейсов на сегодня');
                return;
            }

            // Calculate random reward
            const minReward = caseItem.min_reward;
            const maxReward = caseItem.max_reward;
            const reward = Math.random() * (maxReward - minReward) + minReward;
            const finalReward = Math.round(reward * 100) / 100; // Round to 2 decimal places

            // Update user balance and case data
            await this.db.run(
                'UPDATE users SET balance = balance + ?, total_earned = total_earned + ?, cases_opened_today = cases_opened_today + 1, last_case_date = ? WHERE id = ?',
                [finalReward, finalReward, today, userId]
            );

            // Log transaction
            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [userId, 'case', finalReward, `Кейс: ${caseItem.name}`]
            );

            // Create exciting case opening animation message
            const openingMessage = `📦 Открываем ${caseItem.name}...

🎲 Определяем награду...
✨ Крутим барабан...
🎊 И... награда!`;

            // Send opening message
            const sentMessage = await this.bot.sendMessage(chatId, openingMessage);

            // Wait a moment for effect
            setTimeout(async () => {
                try {
                    const resultMessage = `🎉 Поздравляем! 

📦 Вы открыли: ${caseItem.name}
💰 Ваша награда: ${finalReward} ⭐
💎 Ваш новый баланс: ${(user.balance + finalReward).toFixed(2)} ⭐

✨ Отличная удача! Приглашайте ещё друзей, чтобы получить больше кейсов завтра!`;

                    await this.bot.editMessageText(resultMessage, {
                        chat_id: chatId,
                        message_id: sentMessage.message_id,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⭐ Пригласить друзей', callback_data: 'show_referral' }],
                                [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                            ]
                        }
                    });
                } catch (error) {
                    console.error('Error updating case result message:', error);
                }
            }, 3000);

        } catch (error) {
            console.error('Error opening case:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при открытии кейса');
        }
    }

    // Get case statistics for user
    async getCaseStats(userId) {
        try {
            const stats = await this.db.get(`
                SELECT 
                    COUNT(*) as total_opened,
                    COALESCE(SUM(amount), 0) as total_earned
                FROM transactions 
                WHERE user_id = ? AND type = 'case'
            `, [userId]);

            const todayStats = await this.db.get(`
                SELECT 
                    COUNT(*) as today_opened,
                    COALESCE(SUM(amount), 0) as today_earned
                FROM transactions 
                WHERE user_id = ? AND type = 'case' AND DATE(date) = DATE('now')
            `, [userId]);

            return {
                total_opened: stats.total_opened || 0,
                total_earned: stats.total_earned || 0,
                today_opened: todayStats.today_opened || 0,
                today_earned: todayStats.today_earned || 0
            };
        } catch (error) {
            console.error('Error getting case stats:', error);
            return { total_opened: 0, total_earned: 0, today_opened: 0, today_earned: 0 };
        }
    }

    // Admin function to add new case
    async addCase(name, description, minReward, maxReward, price = 0, imageUrl = null) {
        try {
            const result = await this.db.run(
                'INSERT INTO cases (name, description, min_reward, max_reward, price, image_url) VALUES (?, ?, ?, ?, ?, ?)',
                [name, description, minReward, maxReward, price, imageUrl]
            );
            return result.id;
        } catch (error) {
            console.error('Error adding case:', error);
            throw error;
        }
    }

    // Get all cases
    async getAllCases() {
        return await this.db.all('SELECT * FROM cases ORDER BY min_reward ASC');
    }
}

module.exports = CaseController;
