class RatingController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
    }

    // Show ratings menu
    async showRatings(chatId, userId, messageId = null) {
        try {
            const message = `🏆 Рейтинги:

📊 Доступные рейтинги:
• 📅 По рефералам за неделю
• 📈 Общий рейтинг по рефералам (скоро)
• 💰 По заработанным звёздам (скоро)

Выберите рейтинг для просмотра:`;

            const keyboard = [
                [{ text: '📅 Рейтинг за неделю', callback_data: 'rating_weekly' }],
                [{ text: '📈 Общий рейтинг', callback_data: 'rating_overall' }],
                [{ text: '👤 Моя позиция', callback_data: 'rating_my_position' }],
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

        } catch (error) {
            console.error('Error showing ratings:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке рейтингов');
        }
    }

    // Show weekly referral rating
    async showWeeklyRating(chatId, userId, messageId = null) {
        try {
            const weekStart = this.getWeekStart();
            const topUsers = await this.getWeeklyTopReferrers(10);
            const userPosition = await this.getUserWeeklyPosition(userId);

            let message = `📅 Рейтинг за неделю (${weekStart}):

🏆 Топ пользователей по новым рефералам:

`;

            if (topUsers.length === 0) {
                message += `😔 Пока никто не привёл рефералов на этой неделе

🚀 Станьте первым! Приглашайте друзей и возглавьте рейтинг!`;
            } else {
                topUsers.forEach((user, index) => {
                    const position = index + 1;
                    const medal = this.getMedal(position);
                    const name = user.username ? `@${user.username}` : user.first_name;
                    
                    message += `${medal} ${position}. ${name} - ${user.weekly_referrals} реф.
`;
                });

                message += `
📍 Ваша позиция: ${userPosition.position || 'Не в рейтинге'}`;
                if (userPosition.referrals > 0) {
                    message += ` (${userPosition.referrals} реф.)`;
                }
            }

            message += `

🎯 Приглашайте друзей и поднимайтесь выше в рейтинге!`;

            const keyboard = [
                [{ text: '⭐ Пригласить друзей', callback_data: 'show_referral' }],
                [{ text: '🔄 Обновить рейтинг', callback_data: 'rating_weekly' }],
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

        } catch (error) {
            console.error('Error showing weekly rating:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке рейтинга');
        }
    }

    // Show overall referral rating
    async showOverallRating(chatId, userId, messageId = null) {
        try {
            const topUsers = await this.getOverallTopReferrers(10);
            const userPosition = await this.getUserOverallPosition(userId);

            let message = `📈 Общий рейтинг по рефералам:

🏆 Топ пользователей всех времён:

`;

            if (topUsers.length === 0) {
                message += `😔 Пока никто не привёл рефералов

🚀 Станьте первым! Приглашайте друзей и возглавьте рейтинг!`;
            } else {
                topUsers.forEach((user, index) => {
                    const position = index + 1;
                    const medal = this.getMedal(position);
                    const name = user.username ? `@${user.username}` : user.first_name;
                    
                    message += `${medal} ${position}. ${name} - ${user.level1_referrals} реф.
`;
                });

                message += `
📍 Ваша позиция: ${userPosition.position || 'Не в рейтинге'}`;
                if (userPosition.referrals > 0) {
                    message += ` (${userPosition.referrals} реф.)`;
                }
            }

            message += `

🎯 П��иглашайте друзей и поднимайтесь выше в рейтинге!`;

            const keyboard = [
                [{ text: '⭐ Пригласить друзей', callback_data: 'show_referral' }],
                [{ text: '🔄 Обновить рейтинг', callback_data: 'rating_overall' }],
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

        } catch (error) {
            console.error('Error showing overall rating:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке рейтинга');
        }
    }

    // Show user's position in ratings
    async showMyPosition(chatId, userId, messageId = null) {
        try {
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Пользователь не найден');
                return;
            }

            const weeklyPosition = await this.getUserWeeklyPosition(userId);
            const overallPosition = await this.getUserOverallPosition(userId);

            const message = `👤 Ваша позиция в рейтингах:

📅 За неделю:
├ Позиция: ${weeklyPosition.position || 'Не в рейтинге'}
├ Рефералов: ${weeklyPosition.referrals}
└ Из ${weeklyPosition.total} участников

📈 Общий рейтинг:
├ Позиция: ${overallPosition.position || 'Не в рейтинге'}
├ Рефералов: ${user.level1_referrals}
└ Из ${overallPosition.total} участников

💡 Совет: Приглашайте больше друзей, чтобы подняться в рейтинге!`;

            const keyboard = [
                [{ text: '⭐ Пригласить друзей', callback_data: 'show_referral' }],
                [{ text: '📅 Рейтинг за неделю', callback_data: 'rating_weekly' }],
                [{ text: '📈 Общий рейтинг', callback_data: 'rating_overall' }],
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

        } catch (error) {
            console.error('Error showing user position:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке позиции');
        }
    }

    // Get weekly top referrers
    async getWeeklyTopReferrers(limit = 10) {
        try {
            const weekStart = this.getWeekStart();
            
            const topUsers = await this.db.all(`
                SELECT 
                    u.id, u.username, u.first_name,
                    COUNT(r.id) as weekly_referrals
                FROM users u
                LEFT JOIN users r ON r.referrer_id = u.id 
                    AND DATE(r.registration_date) >= DATE(?)
                GROUP BY u.id
                HAVING weekly_referrals > 0
                ORDER BY weekly_referrals DESC, u.registration_date ASC
                LIMIT ?
            `, [weekStart, limit]);

            return topUsers;
        } catch (error) {
            console.error('Error getting weekly top referrers:', error);
            return [];
        }
    }

    // Get overall top referrers
    async getOverallTopReferrers(limit = 10) {
        try {
            const topUsers = await this.db.all(`
                SELECT id, username, first_name, level1_referrals
                FROM users
                WHERE level1_referrals > 0
                ORDER BY level1_referrals DESC, registration_date ASC
                LIMIT ?
            `, [limit]);

            return topUsers;
        } catch (error) {
            console.error('Error getting overall top referrers:', error);
            return [];
        }
    }

    // Get user's weekly position
    async getUserWeeklyPosition(userId) {
        try {
            const weekStart = this.getWeekStart();
            
            // Get user's weekly referrals
            const userWeeklyReferrals = await this.db.get(`
                SELECT COUNT(*) as count
                FROM users
                WHERE referrer_id = ? AND DATE(registration_date) >= DATE(?)
            `, [userId, weekStart]);

            // Get total participants
            const totalParticipants = await this.db.get(`
                SELECT COUNT(DISTINCT u.id) as count
                FROM users u
                JOIN users r ON r.referrer_id = u.id
                WHERE DATE(r.registration_date) >= DATE(?)
            `, [weekStart]);

            if (userWeeklyReferrals.count === 0) {
                return {
                    position: null,
                    referrals: 0,
                    total: totalParticipants.count || 0
                };
            }

            // Get user's position
            const position = await this.db.get(`
                SELECT COUNT(*) + 1 as position
                FROM (
                    SELECT u.id, COUNT(r.id) as weekly_referrals
                    FROM users u
                    LEFT JOIN users r ON r.referrer_id = u.id 
                        AND DATE(r.registration_date) >= DATE(?)
                    GROUP BY u.id
                    HAVING weekly_referrals > ?
                    OR (weekly_referrals = ? AND u.registration_date < (SELECT registration_date FROM users WHERE id = ?))
                )
            `, [weekStart, userWeeklyReferrals.count, userWeeklyReferrals.count, userId]);

            return {
                position: position.position,
                referrals: userWeeklyReferrals.count,
                total: totalParticipants.count || 0
            };
        } catch (error) {
            console.error('Error getting user weekly position:', error);
            return { position: null, referrals: 0, total: 0 };
        }
    }

    // Get user's overall position
    async getUserOverallPosition(userId) {
        try {
            const user = await this.db.get('SELECT level1_referrals, registration_date FROM users WHERE id = ?', [userId]);
            
            if (!user || user.level1_referrals === 0) {
                const totalParticipants = await this.db.get('SELECT COUNT(*) as count FROM users WHERE level1_referrals > 0');
                return {
                    position: null,
                    referrals: user ? user.level1_referrals : 0,
                    total: totalParticipants.count || 0
                };
            }

            const position = await this.db.get(`
                SELECT COUNT(*) + 1 as position
                FROM users
                WHERE level1_referrals > ? 
                   OR (level1_referrals = ? AND registration_date < ?)
            `, [user.level1_referrals, user.level1_referrals, user.registration_date]);

            const totalParticipants = await this.db.get('SELECT COUNT(*) as count FROM users WHERE level1_referrals > 0');

            return {
                position: position.position,
                referrals: user.level1_referrals,
                total: totalParticipants.count || 0
            };
        } catch (error) {
            console.error('Error getting user overall position:', error);
            return { position: null, referrals: 0, total: 0 };
        }
    }

    // Get week start date (Monday)
    getWeekStart() {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        const monday = new Date(now.setDate(diff));
        monday.setHours(0, 0, 0, 0);
        return monday.toISOString().split('T')[0];
    }

    // Get medal emoji for position
    getMedal(position) {
        switch (position) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            case 4: return '4️⃣';
            case 5: return '5️⃣';
            case 6: return '6️⃣';
            case 7: return '7️⃣';
            case 8: return '8️⃣';
            case 9: return '9️⃣';
            case 10: return '���';
            default: return '📍';
        }
    }

    // Handle rating callbacks
    async handleRatingCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        try {
            switch (data) {
                case 'rating_weekly':
                    await this.showWeeklyRating(chatId, userId, msg.message_id);
                    break;
                case 'rating_overall':
                    await this.showOverallRating(chatId, userId, msg.message_id);
                    break;
                case 'rating_my_position':
                    await this.showMyPosition(chatId, userId, msg.message_id);
                    break;
            }
        } catch (error) {
            console.error('Error handling rating callback:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при обработке рейтинга');
        }
    }

    // Update weekly ratings (can be called by cron job)
    async updateWeeklyRatings() {
        try {
            const weekStart = this.getWeekStart();
            
            // Clear old weekly ratings for this week
            await this.db.run('DELETE FROM weekly_ratings WHERE week_start = ?', [weekStart]);

            // Calculate and insert new weekly ratings
            const weeklyStats = await this.db.all(`
                SELECT 
                    u.id as user_id,
                    COUNT(r.id) as referrals_count
                FROM users u
                LEFT JOIN users r ON r.referrer_id = u.id 
                    AND DATE(r.registration_date) >= DATE(?)
                GROUP BY u.id
                HAVING referrals_count > 0
            `, [weekStart]);

            for (const stat of weeklyStats) {
                await this.db.run(
                    'INSERT INTO weekly_ratings (user_id, week_start, referrals_count) VALUES (?, ?, ?)',
                    [stat.user_id, weekStart, stat.referrals_count]
                );
            }

            console.log(`Updated weekly ratings for ${weekStart}: ${weeklyStats.length} users`);
        } catch (error) {
            console.error('Error updating weekly ratings:', error);
        }
    }
}

module.exports = RatingController;
