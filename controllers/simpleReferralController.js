const SafeMessageHelper = require('../utils/safeMessageHelper');

class SimpleReferralController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
    }

    // Простое логирование
    log(message, data = null) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] REFERRAL: ${message}`, data ? JSON.stringify(data) : '');
    }

    // Показать реферальную информацию
    async showReferralInfo(chatId, userId, messageId = null) {
        try {
            this.log('Показ реферальной информации', { userId });

            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Пользователь не найден');
                return;
            }

            this.log('Данные пользователя для рефералов', {
                userId,
                balance: user.balance,
                level1_referrals: user.level1_referrals,
                level2_referrals: user.level2_referrals,
                referral_code: user.referral_code
            });

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
                [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
            ];

            if (messageId) {
                await SafeMessageHelper.safeEditMessage(this.bot, referralMessage, {
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
            this.log('Ошибка при показе реферальной информации', { error: error.message, userId });
            console.error('Error showing referral info:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке реферальной информации');
        }
    }

    // ПРОСТАЯ обработка реферальных наград
    async processReferralReward(newUserId, referrerId) {
        try {
            this.log('Нач��ло обработки реферальной награды', { newUserId, referrerId });

            // 1. Проверяем, что награда ещё не была выдана
            const existingReward = await this.db.get(
                'SELECT id FROM transactions WHERE user_id = ? AND type = "referral" AND description LIKE ?',
                [referrerId, `%ID: ${newUserId}%`]
            );

            if (existingReward) {
                this.log('Награда уже была выдана', { newUserId, referrerId, transactionId: existingReward.id });
                return;
            }

            // 2. Получаем данные пригласившего
            const referrer = await this.db.get('SELECT * FROM users WHERE id = ?', [referrerId]);
            if (!referrer) {
                this.log('Пригласивший пользователь не найден', { referrerId });
                return;
            }

            this.log('Пригласивший найден', { 
                referrerId,
                currentBalance: referrer.balance,
                currentLevel1: referrer.level1_referrals 
            });

            // 3. ПРОСТЫЕ операции награждения
            this.log('Операция 1: Увеличение счётчик�� рефералов');
            await this.db.run(
                'UPDATE users SET level1_referrals = level1_referrals + 1 WHERE id = ?',
                [referrerId]
            );

            this.log('Операция 2: Начисление награды');
            const reward = 3; // Базовая награда
            await this.db.run(
                'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                [reward, reward, referrerId]
            );

            this.log('Операция 3: Запись транзакции');
            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [referrerId, 'referral', reward, `Реферал активирован (ID: ${newUserId})`]
            );

            this.log('Все операции награждения выполнены');

            // 4. Проверяем результат
            const updatedReferrer = await this.db.get('SELECT * FROM users WHERE id = ?', [referrerId]);
            this.log('Результат награждения', {
                referrerId,
                oldBalance: referrer.balance,
                newBalance: updatedReferrer.balance,
                balanceDiff: updatedReferrer.balance - referrer.balance,
                oldReferrals: referrer.level1_referrals,
                newReferrals: updatedReferrer.level1_referrals
            });

            // 5. Отправляем уведомление пригласившему
            const newUserInfo = await this.db.get('SELECT username, first_name FROM users WHERE id = ?', [newUserId]);
            const newUserName = newUserInfo ? (newUserInfo.username ? `@${newUserInfo.username}` : newUserInfo.first_name) : 'пользователь';

            try {
                await this.bot.sendMessage(referrerId, `🎉 **НОВЫЙ РЕФЕРАЛ АКТИВИРОВАН!**

👤 По вашей ссылке зарегистрировался: **${newUserName}**

💰 **Награда:** ${reward.toFixed(2)} ⭐

🔥 Продолжайте приглашать друзей и зарабатывать ещё больше!`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⭐ Пригласить ещё друзей', callback_data: 'menu_referral' }],
                            [{ text: '👤 Мой профиль', callback_data: 'menu_profile' }]
                        ]
                    }
                });

                this.log('Уведомление отправлено', { referrerId });
            } catch (notificationError) {
                this.log('Ошибка отправки уведомления', { 
                    error: notificationError.message,
                    referrerId 
                });
                console.error('Error sending referral notification:', notificationError);
            }

            // 6. Обработка реферала 2 уровня
            if (referrer.referrer_id) {
                this.log('Обработка реферала 2 уровня', { level2ReferrerId: referrer.referrer_id });
                
                await this.db.run(
                    'UPDATE users SET level2_referrals = level2_referrals + 1 WHERE id = ?',
                    [referrer.referrer_id]
                );

                const level2Reward = 0.05;
                await this.db.run(
                    'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                    [level2Reward, level2Reward, referrer.referrer_id]
                );

                await this.db.run(
                    'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                    [referrer.referrer_id, 'referral', level2Reward, `Реферал 2 уровня активирован (ID: ${newUserId})`]
                );

                this.log('Реферал 2 уровня обработан', { level2ReferrerId: referrer.referrer_id });

                // Уведомление для реферала 2 уровня
                try {
                    await this.bot.sendMessage(referrer.referrer_id, `🎉 **РЕФЕРАЛ 2 УРОВНЯ!**

👥 Ваш реферал привёл друга!

💰 **Награда:** ${level2Reward.toFixed(3)} ⭐

🔥 Приглашайте больше друзей для увеличения доходов!`, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '⭐ Пригласить друзей', callback_data: 'menu_referral' }]
                            ]
                        }
                    });
                } catch (notificationError) {
                    this.log('Ошибка уведомления 2 уровня', { error: notificationError.message });
                }
            }

            this.log('Обработка реферальной награды завершена успешно');

        } catch (error) {
            this.log('ОШИБКА при о��работке реферальной награды', {
                error: error.message,
                stack: error.stack,
                newUserId,
                referrerId
            });
            console.error('Error processing referral reward:', error);
        }
    }

    // Простой пересчёт рефералов (без сложностей)
    async recalculateReferralCounts(userId) {
        try {
            this.log('Пересчёт рефералов', { userId });

            // Считаем рефералов 1 уровня
            const level1Count = await this.db.get(
                'SELECT COUNT(*) as count FROM users WHERE referrer_id = ?',
                [userId]
            );

            // Считаем рефералов 2 уровня
            const level2Count = await this.db.get(
                'SELECT COUNT(*) as count FROM users u1 JOIN users u2 ON u1.id = u2.referrer_id WHERE u1.referrer_id = ?',
                [userId]
            );

            this.log('Результаты пересчёта', {
                userId,
                level1: level1Count?.count || 0,
                level2: level2Count?.count || 0
            });

            // Обновляем счётчики
            await this.db.run(
                'UPDATE users SET level1_referrals = ?, level2_referrals = ? WHERE id = ?',
                [level1Count?.count || 0, level2Count?.count || 0, userId]
            );

            this.log('Счётчики обновлены');

        } catch (error) {
            this.log('Ошибка пересчёта рефералов', { error: error.message, userId });
            console.error('Error recalculating referral counts:', error);
        }
    }
}

module.exports = SimpleReferralController;
