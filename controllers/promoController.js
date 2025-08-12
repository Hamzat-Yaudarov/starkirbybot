class PromoController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
    }

    // Show promo code menu
    async showPromoInfo(chatId, userId, messageId = null) {
        try {
            const user = await this.db.get('SELECT balance FROM users WHERE id = ?', [userId]);
            const usedPromos = await this.db.all(`
                SELECT pc.code, pc.reward, upc.used_date
                FROM user_promo_codes upc
                JOIN promo_codes pc ON upc.promo_code_id = pc.id
                WHERE upc.user_id = ?
                ORDER BY upc.used_date DESC
                LIMIT 5
            `, [userId]);

            let message = `🎫 Промокоды:

💰 Ваш баланс: ${user.balance.toFixed(2)} ⭐

📝 Введите промокод, чтобы получить бонус!

💡 Промокоды могут содержать:
• Бонусные звёзды
• Специальные наг��ады
• Временные бусты

`;

            if (usedPromos.length > 0) {
                message += `📋 Последние использованные промокоды:
`;
                usedPromos.forEach((promo, index) => {
                    const date = new Date(promo.used_date).toLocaleDateString('ru-RU');
                    message += `${index + 1}. ${promo.code} - ${promo.reward} ⭐ (${date})
`;
                });
                message += `
`;
            }

            message += `⌨️ Отправьте промокод в следующем сообщении:`;

            const keyboard = [
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
            console.error('Error showing promo info:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке промокодов');
        }
    }

    // Handle promo code input
    async handlePromoCode(chatId, userId, promoCode) {
        try {
            if (!promoCode || promoCode.length < 3) {
                await this.bot.sendMessage(chatId, '❌ П��омокод слишком короткий. Попробуйте ещё раз.');
                return;
            }

            // Clean promo code
            const cleanCode = promoCode.trim().toUpperCase();

            // Check if promo code exists and is active
            const promo = await this.db.get(
                'SELECT * FROM promo_codes WHERE code = ? AND is_active = 1',
                [cleanCode]
            );

            if (!promo) {
                await this.bot.sendMessage(chatId, `❌ Промокод "${cleanCode}" не найден или неактивен.

🔍 Проверьте правильность написания и попробуйте ещё раз.`);
                return;
            }

            // Check if promo code is expired
            if (promo.expiry_date && new Date(promo.expiry_date) < new Date()) {
                await this.bot.sendMessage(chatId, `⏰ Промокод "${cleanCode}" истёк.

😔 К сожалению, вы опоздали с активацией.`);
                return;
            }

            // Check if user already used this promo code
            const alreadyUsed = await this.db.get(
                'SELECT id FROM user_promo_codes WHERE user_id = ? AND promo_code_id = ?',
                [userId, promo.id]
            );

            if (alreadyUsed) {
                await this.bot.sendMessage(chatId, `❌ Вы уже использовали промокод "${cleanCode}".

💡 Каждый промокод можно использовать только один раз.`);
                return;
            }

            // Check if promo code has reached max uses
            if (promo.current_uses >= promo.max_uses) {
                await this.bot.sendMessage(chatId, `😔 Промокод "${cleanCode}" достиг лимита использований.

🚀 Следите за новыми промокодами!`);
                return;
            }

            // Use promo code
            await this.usePromoCode(chatId, userId, promo);

        } catch (error) {
            console.error('Error handling promo code:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при обработке промокода');
        }
    }

    // Use promo code
    async usePromoCode(chatId, userId, promo) {
        try {
            // Add reward to user balance
            await this.db.run(
                'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                [promo.reward, promo.reward, userId]
            );

            // Mark promo as used by user
            await this.db.run(
                'INSERT INTO user_promo_codes (user_id, promo_code_id) VALUES (?, ?)',
                [userId, promo.id]
            );

            // Increment promo usage count
            await this.db.run(
                'UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = ?',
                [promo.id]
            );

            // Log transaction
            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [userId, 'promo', promo.reward, `Промокод: ${promo.code}`]
            );

            // Get updated user balance
            const user = await this.db.get('SELECT balance FROM users WHERE id = ?', [userId]);

            // Check if promo code is now depleted
            const isLastUse = promo.current_uses + 1 >= promo.max_uses;

            await this.bot.sendMessage(chatId, `🎉 Промокод активирован!

🎫 Промокод: ${promo.code}
💰 Получено: ${promo.reward} ⭐
💎 Ваш баланс: ${user.balance.toFixed(2)} ⭐

${isLastUse ? '⚠️ Это был последний доступный код!' : `📊 Осталось использований: ${promo.max_uses - promo.current_uses - 1}`}

🚀 Продолжай��е зарабатывать звёзды!`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎫 Ввести ещё промокод', callback_data: 'promo_another' }],
                        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error using promo code:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при активации промокода');
        }
    }

    // Get promo code statistics for user
    async getUserPromoStats(userId) {
        try {
            const stats = await this.db.get(`
                SELECT 
                    COUNT(*) as total_used,
                    COALESCE(SUM(pc.reward), 0) as total_earned
                FROM user_promo_codes upc
                JOIN promo_codes pc ON upc.promo_code_id = pc.id
                WHERE upc.user_id = ?
            `, [userId]);

            return stats || { total_used: 0, total_earned: 0 };
        } catch (error) {
            console.error('Error getting user promo stats:', error);
            return { total_used: 0, total_earned: 0 };
        }
    }

    // Create new promo code (admin function)
    async createPromoCode(code, reward, maxUses = 1, expiryDate = null) {
        try {
            const cleanCode = code.trim().toUpperCase();
            
            // Check if promo code already exists
            const existing = await this.db.get('SELECT id FROM promo_codes WHERE code = ?', [cleanCode]);
            if (existing) {
                throw new Error('Promo code already exists');
            }

            const result = await this.db.run(
                'INSERT INTO promo_codes (code, reward, max_uses, expiry_date) VALUES (?, ?, ?, ?)',
                [cleanCode, reward, maxUses, expiryDate]
            );

            return result.id;
        } catch (error) {
            console.error('Error creating promo code:', error);
            throw error;
        }
    }

    // Get all promo codes (admin function)
    async getAllPromoCodes() {
        return await this.db.all(`
            SELECT 
                pc.*,
                COUNT(upc.user_id) as times_used
            FROM promo_codes pc
            LEFT JOIN user_promo_codes upc ON pc.id = upc.promo_code_id
            GROUP BY pc.id
            ORDER BY pc.created_date DESC
        `);
    }

    // Deactivate promo code (admin function)
    async deactivatePromoCode(promoId) {
        try {
            await this.db.run(
                'UPDATE promo_codes SET is_active = 0 WHERE id = ?',
                [promoId]
            );
        } catch (error) {
            console.error('Error deactivating promo code:', error);
            throw error;
        }
    }

    // Get promo code usage statistics
    async getPromoCodeStats(promoId) {
        try {
            const promo = await this.db.get('SELECT * FROM promo_codes WHERE id = ?', [promoId]);
            const users = await this.db.all(`
                SELECT u.username, u.first_name, upc.used_date
                FROM user_promo_codes upc
                JOIN users u ON upc.user_id = u.id
                WHERE upc.promo_code_id = ?
                ORDER BY upc.used_date DESC
            `, [promoId]);

            return {
                promo,
                users,
                usageCount: users.length,
                remainingUses: promo.max_uses - promo.current_uses
            };
        } catch (error) {
            console.error('Error getting promo code stats:', error);
            return null;
        }
    }

    // Check for expired promo codes and deactivate them
    async cleanupExpiredPromoCodes() {
        try {
            const result = await this.db.run(
                'UPDATE promo_codes SET is_active = 0 WHERE expiry_date < ? AND is_active = 1',
                [new Date().toISOString()]
            );

            if (result.changes > 0) {
                console.log(`Deactivated ${result.changes} expired promo codes`);
            }
        } catch (error) {
            console.error('Error cleaning up expired promo codes:', error);
        }
    }

    // Generate random promo code
    generateRandomPromoCode(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Handle promo callbacks
    async handlePromoCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        try {
            if (data === 'promo_another') {
                await this.showPromoInfo(chatId, userId);
            }
        } catch (error) {
            console.error('Error handling promo callback:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при обработке промокода');
        }
    }
}

module.exports = PromoController;
