class ReferralController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
    }

    // Show referral information and link
    async showReferralInfo(chatId, userId, messageId = null) {
        try {
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Пользователь не найден');
                return;
            }

            const referralMessage = `⭐ Приглашай друзей и зарабатывай звёзды!

🎯 Как это работает:
• За каждого приглашённого друга: +3 ⭐
• За каждого друга твоих друзей: +0.05 ⭐

📊 Ваша статистика:
👥 Рефералы 1 уровня: ${user.level1_referrals}
👥 Рефералы 2 уровня: ${user.level2_referrals}
💰 Баланс: ${user.balance.toFixed(2)} ⭐

🔗 Ваша реферальная ссылка:
https://t.me/kirbystarsfarmbot?start=${user.referral_code}

📲 Отправьте эту ссылку друзьям и начните зарабатывать!`;

            const keyboard = [
                [{ text: '📤 Поделиться ссылкой', switch_inline_query: `🌟 Присоединяйся к Kirby Stars Farm и зарабатывай Telegram Stars!\n\n🎁 Регистрируйся по моей ссылке: https://t.me/kirbystarsfarmbot?start=${user.referral_code}` }],
                [{ text: '📋 Скопировать ссылку', callback_data: `copy_referral_${user.referral_code}` }],
                [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
            ];

            if (messageId) {
                await this.bot.editMessageText(referralMessage, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, referralMessage, {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error showing referral info:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке реферальной информации');
        }
    }

    // Get referral statistics for user
    async getReferralStats(userId) {
        try {
            const stats = await this.db.get(`
                SELECT 
                    COUNT(CASE WHEN u1.referrer_id = ? THEN 1 END) as level1_count,
                    COUNT(CASE WHEN u2.referrer_id IN (SELECT id FROM users WHERE referrer_id = ?) THEN 1 END) as level2_count,
                    COALESCE(SUM(CASE WHEN u1.referrer_id = ? THEN 3 ELSE 0 END), 0) as level1_earned,
                    COALESCE(SUM(CASE WHEN u2.referrer_id IN (SELECT id FROM users WHERE referrer_id = ?) THEN 0.05 ELSE 0 END), 0) as level2_earned
                FROM users u1
                LEFT JOIN users u2 ON u2.referrer_id = u1.id
                WHERE u1.referrer_id = ? OR u2.referrer_id IN (SELECT id FROM users WHERE referrer_id = ?)
            `, [userId, userId, userId, userId, userId, userId]);

            return stats;
        } catch (error) {
            console.error('Error getting referral stats:', error);
            return { level1_count: 0, level2_count: 0, level1_earned: 0, level2_earned: 0 };
        }
    }

    // Get detailed referral list
    async getReferralList(userId, level = 1) {
        try {
            let query;
            if (level === 1) {
                query = `
                    SELECT id, username, first_name, registration_date, balance
                    FROM users 
                    WHERE referrer_id = ?
                    ORDER BY registration_date DESC
                `;
            } else {
                query = `
                    SELECT u2.id, u2.username, u2.first_name, u2.registration_date, u2.balance
                    FROM users u1
                    JOIN users u2 ON u2.referrer_id = u1.id
                    WHERE u1.referrer_id = ?
                    ORDER BY u2.registration_date DESC
                `;
            }

            return await this.db.all(query, [userId]);
        } catch (error) {
            console.error('Error getting referral list:', error);
            return [];
        }
    }

    // Show detailed referral statistics
    async showDetailedReferrals(chatId, userId) {
        try {
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            const level1Referrals = await this.getReferralList(userId, 1);
            const level2Referrals = await this.getReferralList(userId, 2);

            let message = `👥 Подробная статистика рефералов:

📊 Общая информация:
• Рефералы 1 уровня: ${level1Referrals.length}
• Рефералы 2 уровня: ${level2Referrals.length}
• Заработано с 1 уровня: ${level1Referrals.length * 3} ⭐
• Заработано с 2 уровня: ${(level2Referrals.length * 0.05).toFixed(2)} ⭐

`;

            if (level1Referrals.length > 0) {
                message += `👤 Рефералы 1 уровня:\n`;
                level1Referrals.slice(0, 10).forEach((ref, index) => {
                    const name = ref.username ? `@${ref.username}` : ref.first_name;
                    const date = new Date(ref.registration_date).toLocaleDateString();
                    message += `${index + 1}. ${name} (${date})\n`;
                });
                
                if (level1Referrals.length > 10) {
                    message += `... и ещё ${level1Referrals.length - 10} рефералов\n`;
                }
            }

            if (level2Referrals.length > 0) {
                message += `\n👥 Рефералы 2 уровня:\n`;
                level2Referrals.slice(0, 5).forEach((ref, index) => {
                    const name = ref.username ? `@${ref.username}` : ref.first_name;
                    const date = new Date(ref.registration_date).toLocaleDateString();
                    message += `${index + 1}. ${name} (${date})\n`;
                });
                
                if (level2Referrals.length > 5) {
                    message += `... и ещё ${level2Referrals.length - 5} рефералов\n`;
                }
            }

            await this.bot.sendMessage(chatId, message);

        } catch (error) {
            console.error('Error showing detailed referrals:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке статистики рефералов');
        }
    }

    // Process referral rewards when new user registers
    async processReferralReward(referrerId, newUserId) {
        try {
            // Level 1 referral reward
            await this.db.run(
                'UPDATE users SET balance = balance + 3, total_earned = total_earned + 3 WHERE id = ?',
                [referrerId]
            );

            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [referrerId, 'referral', 3, 'Новый реферал 1 уровня']
            );

            // Check for level 2 referral
            const referrer = await this.db.get('SELECT referrer_id FROM users WHERE id = ?', [referrerId]);
            if (referrer && referrer.referrer_id) {
                // Level 2 referral reward
                await this.db.run(
                    'UPDATE users SET balance = balance + 0.05, total_earned = total_earned + 0.05 WHERE id = ?',
                    [referrer.referrer_id]
                );

                await this.db.run(
                    'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                    [referrer.referrer_id, 'referral', 0.05, 'Новый реферал 2 уровня']
                );
            }

            // Update referral counts
            await this.updateReferralCounts(referrerId);
            if (referrer && referrer.referrer_id) {
                await this.updateReferralCounts(referrer.referrer_id);
            }

        } catch (error) {
            console.error('Error processing referral reward:', error);
        }
    }

    // Update referral counts for user
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
                [level1Count.count, level2Count.count || 0, userId]
            );

        } catch (error) {
            console.error('Error updating referral counts:', error);
        }
    }

    // Get top referrers for rankings
    async getTopReferrers(limit = 10, period = 'all') {
        try {
            let query;
            if (period === 'week') {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                
                query = `
                    SELECT u.id, u.username, u.first_name, COUNT(r.id) as referrals_count
                    FROM users u
                    LEFT JOIN users r ON r.referrer_id = u.id AND r.registration_date > ?
                    GROUP BY u.id
                    HAVING referrals_count > 0
                    ORDER BY referrals_count DESC
                    LIMIT ?
                `;
                return await this.db.all(query, [weekAgo.toISOString(), limit]);
            } else {
                query = `
                    SELECT id, username, first_name, level1_referrals as referrals_count
                    FROM users
                    WHERE level1_referrals > 0
                    ORDER BY level1_referrals DESC
                    LIMIT ?
                `;
                return await this.db.all(query, [limit]);
            }
        } catch (error) {
            console.error('Error getting top referrers:', error);
            return [];
        }
    }
}

module.exports = ReferralController;
