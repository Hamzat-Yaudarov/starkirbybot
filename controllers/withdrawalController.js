const SafeMessageHelper = require('../utils/safeMessageHelper');

class WithdrawalController {
    constructor(database, bot, adminChatId) {
        this.db = database;
        this.bot = bot;
        this.adminChatId = adminChatId;
        this.withdrawalTypes = {
            '15': { amount: 15, description: '15 Telegram Stars' },
            '25': { amount: 25, description: '25 Telegram Stars' },
            '50': { amount: 50, description: '50 Telegram Stars' },
            '100': { amount: 100, description: '100 Telegram Stars' },
            'premium': { amount: 1300, description: 'Telegram Premium на 3 месяца (1300 ⭐)' }
        };
    }

    // Show withdrawal menu
    async showWithdrawal(chatId, userId, messageId = null) {
        try {
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Пользователь не найден');
                return;
            }

            // Check for pending withdrawals
            const pendingWithdrawal = await this.db.get(
                'SELECT * FROM withdrawals WHERE user_id = ? AND status = "pending" ORDER BY id DESC LIMIT 1',
                [userId]
            );

            if (pendingWithdrawal) {
                const withdrawalInfo = this.withdrawalTypes[pendingWithdrawal.withdrawal_type];
                const pendingMsg = `⏳ У вас есть заявка на вывод в обработке:

💰 Сумма: ${pendingWithdrawal.amount} ⭐
📝 Тип: ${withdrawalInfo.description}
📅 Дата заявки: ${new Date(pendingWithdrawal.request_date).toLocaleString('ru-RU')}

⏰ Заявка обрабатывается администратором.
Ожидайте уведомления о статусе.`;

                const keyboard = [[
                    { text: '🏠 Главное меню', callback_data: 'main_menu' }
                ]];

                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot, pendingMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, pendingMsg, {
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    });
                }
                return;
            }

            let message = `💰 Вывод звёзд:

💎 Ваш баланс: ${user.balance.toFixed(2)} ⭐

📤 Доступные варианты вывода:

`;

            const keyboard = [];
            
            Object.entries(this.withdrawalTypes).forEach(([type, info]) => {
                const canAfford = user.balance >= info.amount;
                message += `${canAfford ? '✅' : '❌'} ${info.description} - ${info.amount} ⭐
`;
                
                if (canAfford) {
                    keyboard.push([{ 
                        text: `💰 Вывести ${info.description}`, 
                        callback_data: `withdraw_${type}` 
                    }]);
                } else {
                    keyboard.push([{ 
                        text: `❌ ${info.description} (недостаточно ⭐)`, 
                        callback_data: `withdraw_cant_afford_${type}` 
                    }]);
                }
            });

            message += `
⚠️ Важная информация:
• Заявки обрабатываются администратором
• Время обработки: до 24 часов
• При отклонении звёзды возвращаются
• ��ожно подать только одну заявку за раз

💡 Зарабатывайте больше звёзд, чтобы делать выводы!`;

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
            console.error('Error showing withdrawal:', error);
            const errorMsg = '❌ Ошибка при загрузке вывода';
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

    // Handle withdrawal callbacks
    async handleWithdrawalCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        try {
            if (data.startsWith('withdraw_') && !data.includes('cant_afford')) {
                const withdrawalType = data.split('_')[1];
                if (this.withdrawalTypes[withdrawalType]) {
                    await this.requestWithdrawal(chatId, userId, withdrawalType);
                }
            } else if (data.startsWith('withdraw_cant_afford_')) {
                await this.bot.answerCallbackQuery(callbackQuery.id, '❌ Недостаточно звёзд для вывода!', true);
            }
        } catch (error) {
            console.error('Error handling withdrawal callback:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при обработке вывода');
        }
    }

    // Request withdrawal
    async requestWithdrawal(chatId, userId, withdrawalType) {
        try {
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            const withdrawalInfo = this.withdrawalTypes[withdrawalType];

            if (!user || !withdrawalInfo) {
                await this.bot.sendMessage(chatId, '❌ Пользователь или тип вывода не найден');
                return;
            }

            // Check balance
            if (user.balance < withdrawalInfo.amount) {
                await this.bot.sendMessage(chatId, '❌ Недостаточно звёзд для вывода!');
                return;
            }

            // Check for pending withdrawals
            const pendingWithdrawal = await this.db.get(
                'SELECT id FROM withdrawals WHERE user_id = ? AND status = "pending"',
                [userId]
            );

            if (pendingWithdrawal) {
                await this.bot.sendMessage(chatId, '❌ У вас уже есть заявка в обработке!');
                return;
            }

            // Deduct amount from balance temporarily
            await this.db.run(
                'UPDATE users SET balance = balance - ? WHERE id = ?',
                [withdrawalInfo.amount, userId]
            );

            // Create withdrawal request
            const result = await this.db.run(
                'INSERT INTO withdrawals (user_id, amount, withdrawal_type) VALUES (?, ?, ?)',
                [userId, withdrawalInfo.amount, withdrawalType]
            );

            const withdrawalId = result.id;

            // Log transaction
            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [userId, 'withdrawal_request', -withdrawalInfo.amount, `Заявка на вывод: ${withdrawalInfo.description}`]
            );

            // Send to admin chat
            await this.sendToAdminChat(withdrawalId, user, withdrawalInfo);

            // Confirm to user
            await this.bot.sendMessage(chatId, `✅ Заявка на вывод отправлена!

💰 Сумма: ${withdrawalInfo.amount} ⭐
📝 Тип: ${withdrawalInfo.description}
🆔 Номер заявки: #${withdrawalId}

⏰ Заявка будет обработана в течение 24 часов.
Вы получите уведомление о статусе.

💎 Остаток на балансе: ${(user.balance - withdrawalInfo.amount).toFixed(2)} ⭐`);

        } catch (error) {
            console.error('Error requesting withdrawal:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при создании заявки на вывод');
        }
    }

    // Send withdrawal request to admin chat
    async sendToAdminChat(withdrawalId, user, withdrawalInfo) {
        try {
            const userLink = user.username ? 
                `@${user.username}` : 
                `[${user.first_name}](tg://user?id=${user.id})`;

            const message = `🔔 Новая заявка на вывод!

🆔 Заявка: #${withdrawalId}
👤 Пользователь: ${userLink}
📱 ID: \`${user.id}\`
💰 Сумма: ${withdrawalInfo.amount} ⭐
📝 Тип: ${withdrawalInfo.description}
📅 Дата: ${new Date().toLocaleString('ru-RU')}

👥 Рефералы:
├ 1 уровень: ${user.level1_referrals}
└ 2 уровень: ${user.level2_referrals}

��� Общий заработок: ${user.total_earned.toFixed(2)} ⭐`;

            await this.bot.sendMessage(this.adminChatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Одобрить', callback_data: `admin_withdraw_approve_${withdrawalId}` },
                            { text: '❌ Отклонить', callback_data: `admin_withdraw_reject_${withdrawalId}` }
                        ]
                    ]
                }
            });

        } catch (error) {
            console.error('Error sending to admin chat:', error);
        }
    }

    // Handle admin callbacks
    async handleAdminCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;

        try {
            if (data.startsWith('admin_withdraw_approve_')) {
                const withdrawalId = parseInt(data.split('_')[3]);
                await this.approveWithdrawal(withdrawalId, msg);
            } else if (data.startsWith('admin_withdraw_reject_')) {
                const withdrawalId = parseInt(data.split('_')[3]);
                await this.promptRejectReason(withdrawalId, msg);
            }
        } catch (error) {
            console.error('Error handling admin callback:', error);
        }
    }

    // Approve withdrawal
    async approveWithdrawal(withdrawalId, msg) {
        try {
            const withdrawal = await this.db.get(
                'SELECT w.*, u.username, u.first_name FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE w.id = ?',
                [withdrawalId]
            );

            if (!withdrawal) {
                await this.bot.editMessageText('❌ Заявка не найдена', {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id
                });
                return;
            }

            if (withdrawal.status !== 'pending') {
                await this.bot.editMessageText('❌ Заявка уже обработана', {
                    chat_id: msg.chat.id,
                    message_id: msg.message_id
                });
                return;
            }

            // Update withdrawal status
            await this.db.run(
                'UPDATE withdrawals SET status = "approved", processed_date = CURRENT_TIMESTAMP WHERE id = ?',
                [withdrawalId]
            );

            // Log transaction
            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [withdrawal.user_id, 'withdrawal_approved', 0, `Вывод одобрен: ${this.withdrawalTypes[withdrawal.withdrawal_type].description}`]
            );

            // Update admin message
            const withdrawalInfo = this.withdrawalTypes[withdrawal.withdrawal_type];
            const userLink = withdrawal.username ? 
                `@${withdrawal.username}` : 
                `[${withdrawal.first_name}](tg://user?id=${withdrawal.user_id})`;

            await this.bot.editMessageText(`✅ Заявка одобрена!

🆔 Заявка: #${withdrawalId}
👤 Пользователь: ${userLink}
💰 Сумма: ${withdrawal.amount} ⭐
📝 Тип: ${withdrawalInfo.description}
✅ Статус: Одобрено
📅 Обработано: ${new Date().toLocaleString('ru-RU')}`, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                parse_mode: 'Markdown'
            });

            // Notify user
            await this.bot.sendMessage(withdrawal.user_id, `✅ Ваша заявка на вывод одобрена!

🆔 Номер заявки: #${withdrawalId}
💰 Сумма: ${withdrawal.amount} ⭐
📝 Тип: ${withdrawalInfo.description}

🎉 Поздравляем! Ваш вывод будет обработан в ближайшее время.`);

        } catch (error) {
            console.error('Error approving withdrawal:', error);
        }
    }

    // Prompt for rejection reason
    async promptRejectReason(withdrawalId, msg) {
        try {
            await this.bot.editMessageText(`❌ Отклонение заявки #${withdrawalId}

Введите причину отклонения:`, {
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: 'Причина отклонения...'
                }
            });

            // Store withdrawal ID for handling reply
            this.pendingRejections = this.pendingRejections || {};
            this.pendingRejections[msg.chat.id] = withdrawalId;

        } catch (error) {
            console.error('Error prompting reject reason:', error);
        }
    }

    // Reject withdrawal with reason
    async rejectWithdrawal(withdrawalId, reason) {
        try {
            const withdrawal = await this.db.get(
                'SELECT w.*, u.username, u.first_name FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE w.id = ?',
                [withdrawalId]
            );

            if (!withdrawal || withdrawal.status !== 'pending') {
                return false;
            }

            // Return money to user balance
            await this.db.run(
                'UPDATE users SET balance = balance + ? WHERE id = ?',
                [withdrawal.amount, withdrawal.user_id]
            );

            // Update withdrawal status
            await this.db.run(
                'UPDATE withdrawals SET status = "rejected", processed_date = CURRENT_TIMESTAMP, admin_note = ? WHERE id = ?',
                [reason, withdrawalId]
            );

            // Log transaction
            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [withdrawal.user_id, 'withdrawal_rejected', withdrawal.amount, `Вывод отклонён: ${reason}`]
            );

            // Notify user
            const withdrawalInfo = this.withdrawalTypes[withdrawal.withdrawal_type];
            await this.bot.sendMessage(withdrawal.user_id, `❌ Ваша заявка на вывод отклонена

🆔 Номер заявки: #${withdrawalId}
💰 Сумма: ${withdrawal.amount} ⭐
📝 Тип: ${withdrawalInfo.description}
📝 Причина: ${reason}

💎 Звёзды возвращены на ваш баланс.
Вы можете подать новую заявку.`);

            return true;

        } catch (error) {
            console.error('Error rejecting withdrawal:', error);
            return false;
        }
    }

    // Get withdrawal history for user
    async getWithdrawalHistory(userId, limit = 5) {
        try {
            return await this.db.all(`
                SELECT * FROM withdrawals 
                WHERE user_id = ? 
                ORDER BY request_date DESC 
                LIMIT ?
            `, [userId, limit]);
        } catch (error) {
            console.error('Error getting withdrawal history:', error);
            return [];
        }
    }

    // Get all pending withdrawals (admin function)
    async getPendingWithdrawals() {
        try {
            return await this.db.all(`
                SELECT w.*, u.username, u.first_name 
                FROM withdrawals w 
                JOIN users u ON w.user_id = u.id 
                WHERE w.status = 'pending' 
                ORDER BY w.request_date ASC
            `);
        } catch (error) {
            console.error('Error getting pending withdrawals:', error);
            return [];
        }
    }

    // Get withdrawal statistics
    async getWithdrawalStats() {
        try {
            const stats = await this.db.get(`
                SELECT 
                    COUNT(*) as total_requests,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                    COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
                    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
                    COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as total_approved_amount,
                    COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount
                FROM withdrawals
            `);

            return stats || {
                total_requests: 0,
                pending: 0,
                approved: 0,
                rejected: 0,
                total_approved_amount: 0,
                pending_amount: 0
            };
        } catch (error) {
            console.error('Error getting withdrawal stats:', error);
            return {
                total_requests: 0,
                pending: 0,
                approved: 0,
                rejected: 0,
                total_approved_amount: 0,
                pending_amount: 0
            };
        }
    }
}

module.exports = WithdrawalController;
