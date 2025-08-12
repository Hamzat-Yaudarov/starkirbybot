const SafeMessageHelper = require('../utils/safeMessageHelper');

class LotteryController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
    }

    // Show lotteries menu
    async showLotteries(chatId, userId, messageId = null) {
        try {
            const user = await this.db.get('SELECT balance FROM users WHERE id = ?', [userId]);
            const activeLotteries = await this.db.all('SELECT * FROM lotteries WHERE is_active = 1 ORDER BY id DESC');

            let message = `🎰 Лотереи:

💰 Ваш баланс: ${user.balance.toFixed(2)} ⭐

`;

            if (activeLotteries.length === 0) {
                message += `😔 Сейчас нет активных лотерей

🔔 Следите за обновлениями - новые лотереи появятся в ближайшее время!`;

                const keyboard = [[
                    { text: '🏠 Главное меню', callback_data: 'main_menu' }
                ]];

                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot,message, {
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

            message += `🎟️ Активные лотереи:

`;

            const keyboard = [];

            for (const lottery of activeLotteries) {
                const participants = await this.db.get(
                    'SELECT COUNT(*) as count FROM lottery_tickets WHERE lottery_id = ?',
                    [lottery.id]
                );

                const userTicket = await this.db.get(
                    'SELECT id FROM lottery_tickets WHERE lottery_id = ? AND user_id = ?',
                    [lottery.id, userId]
                );

                const endDate = new Date(lottery.end_date);
                const isExpired = endDate < new Date();

                message += `🎰 ${lottery.name}
💰 Стоимость билета: ${lottery.ticket_price} ⭐
🏆 Призовой фонд: ${lottery.total_pool.toFixed(2)} ⭐
👥 Участников: ${participants.count}
📅 До окончания: ${this.getTimeLeft(endDate)}
📝 ${lottery.description}

`;

                if (isExpired) {
                    keyboard.push([{ 
                        text: `⏰ ${lottery.name} (завершена)`, 
                        callback_data: `lottery_expired_${lottery.id}` 
                    }]);
                } else if (userTicket) {
                    keyboard.push([{ 
                        text: `✅ ${lottery.name} (участвуете)`, 
                        callback_data: `lottery_info_${lottery.id}` 
                    }]);
                } else if (user.balance >= lottery.ticket_price) {
                    keyboard.push([{ 
                        text: `🎟️ Купить билет - ${lottery.name} (${lottery.ticket_price} ⭐)`, 
                        callback_data: `lottery_buy_${lottery.id}` 
                    }]);
                } else {
                    keyboard.push([{ 
                        text: `❌ ${lottery.name} (недостаточно ⭐)`, 
                        callback_data: `lottery_cant_afford_${lottery.id}` 
                    }]);
                }
            }

            keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main_menu' }]);

            if (messageId) {
                await SafeMessageHelper.safeEditMessage(this.bot,message, {
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
            console.error('Error showing lotteries:', error);
            const errorMsg = '❌ Ошибка при загрузке лотерей';
            if (messageId) {
                try {
                    await SafeMessageHelper.safeEditMessage(this.bot,errorMsg, {
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

    // Handle lottery callbacks
    async handleLotteryCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        try {
            if (data.startsWith('lottery_buy_')) {
                const lotteryId = parseInt(data.split('_')[2]);
                await this.buyTicket(chatId, userId, lotteryId);
            } else if (data.startsWith('lottery_info_')) {
                const lotteryId = parseInt(data.split('_')[2]);
                await this.showLotteryInfo(chatId, userId, lotteryId);
            } else if (data.startsWith('lottery_cant_afford_')) {
                await this.bot.answerCallbackQuery(callbackQuery.id, '❌ Недостаточно звёзд для покупки билета!', true);
            } else if (data.startsWith('lottery_expired_')) {
                await this.bot.answerCallbackQuery(callbackQuery.id, '⏰ Эта лотерея уже завершена!', true);
            } else if (data === 'lottery_back') {
                await this.showLotteries(chatId, userId, msg.message_id);
            }
        } catch (error) {
            console.error('Error handling lottery callback:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при обработке лотереи');
        }
    }

    // Buy lottery ticket
    async buyTicket(chatId, userId, lotteryId) {
        try {
            const user = await this.db.get('SELECT balance FROM users WHERE id = ?', [userId]);
            const lottery = await this.db.get('SELECT * FROM lotteries WHERE id = ? AND is_active = 1', [lotteryId]);

            if (!user || !lottery) {
                await this.bot.sendMessage(chatId, '❌ Пользователь или лотерея не найдены');
                return;
            }

            // Check if lottery is still active
            const endDate = new Date(lottery.end_date);
            if (endDate < new Date()) {
                await this.bot.sendMessage(chatId, '❌ Эта лотерея уже завершена!');
                return;
            }

            // Check if user already has a ticket
            const existingTicket = await this.db.get(
                'SELECT id FROM lottery_tickets WHERE lottery_id = ? AND user_id = ?',
                [lotteryId, userId]
            );

            if (existingTicket) {
                await this.bot.sendMessage(chatId, '❌ Вы уже купили би��ет в эту лотерею!');
                return;
            }

            // Check balance
            if (user.balance < lottery.ticket_price) {
                await this.bot.sendMessage(chatId, '❌ Недостаточно звёзд для покупки билета!');
                return;
            }

            // Buy ticket
            await this.db.run(
                'UPDATE users SET balance = balance - ? WHERE id = ?',
                [lottery.ticket_price, userId]
            );

            await this.db.run(
                'INSERT INTO lottery_tickets (lottery_id, user_id) VALUES (?, ?)',
                [lotteryId, userId]
            );

            // Update lottery pool
            const poolIncrease = lottery.ticket_price * (1 - lottery.bot_commission);
            await this.db.run(
                'UPDATE lotteries SET total_pool = total_pool + ? WHERE id = ?',
                [poolIncrease, lotteryId]
            );

            // Log transaction
            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [userId, 'lottery', -lottery.ticket_price, `Билет в лотерею: ${lottery.name}`]
            );

            // Get updated info
            const participants = await this.db.get(
                'SELECT COUNT(*) as count FROM lottery_tickets WHERE lottery_id = ?',
                [lotteryId]
            );

            const updatedLottery = await this.db.get('SELECT total_pool FROM lotteries WHERE id = ?', [lotteryId]);

            await this.bot.sendMessage(chatId, `🎟️ Билет куплен!

🎰 Лотерея: ${lottery.name}
💰 Потрачено: ${lottery.ticket_price} ⭐
💎 Остаток: ${(user.balance - lottery.ticket_price).toFixed(2)} ⭐

🏆 Призовой фонд: ${updatedLottery.total_pool.toFixed(2)} ⭐
👥 Всего участников: ${participants.count}

🍀 Удачи в розыгрыше!`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎰 Все лот��реи', callback_data: 'lottery_back' }],
                        [{ text: '📊 Инфо о лотерее', callback_data: `lottery_info_${lotteryId}` }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error buying ticket:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при покупке билета');
        }
    }

    // Show lottery information
    async showLotteryInfo(chatId, userId, lotteryId) {
        try {
            const lottery = await this.db.get('SELECT * FROM lotteries WHERE id = ?', [lotteryId]);
            if (!lottery) {
                await this.bot.sendMessage(chatId, '❌ Лотерея не найдена');
                return;
            }

            const participants = await this.db.all(`
                SELECT u.username, u.first_name, lt.purchase_date
                FROM lottery_tickets lt
                JOIN users u ON lt.user_id = u.id
                WHERE lt.lottery_id = ?
                ORDER BY lt.purchase_date ASC
            `, [lotteryId]);

            const userTicket = await this.db.get(
                'SELECT purchase_date FROM lottery_tickets WHERE lottery_id = ? AND user_id = ?',
                [lotteryId, userId]
            );

            const endDate = new Date(lottery.end_date);
            const isExpired = endDate < new Date();

            let message = `📊 Информация о лотерее:

🎰 ${lottery.name}
📝 ${lottery.description}
💰 Стоимость билета: ${lottery.ticket_price} ⭐
🏆 Призовой фонд: ${lottery.total_pool.toFixed(2)} ⭐
👥 Участников: ${participants.length}
📅 ${isExpired ? 'Завершена' : `До окончания: ${this.getTimeLeft(endDate)}`}

`;

            if (userTicket) {
                const ticketDate = new Date(userTicket.purchase_date);
                message += `✅ Вы участвуете! 
🎟️ Билет куплен: ${ticketDate.toLocaleString('ru-RU')}

`;
            }

            if (participants.length > 0) {
                message += `👥 Участники:
`;
                participants.slice(0, 10).forEach((participant, index) => {
                    const name = participant.username ? `@${participant.username}` : participant.first_name;
                    message += `${index + 1}. ${name}
`;
                });

                if (participants.length > 10) {
                    message += `... и ещё ${participants.length - 10} участников
`;
                }
            }

            message += `
🎯 Чем больше участников, тем больше призовой фонд!`;

            await this.bot.sendMessage(chatId, message, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🎰 Все лотереи', callback_data: 'lottery_back' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error showing lottery info:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке информации');
        }
    }

    // Get time left until end date
    getTimeLeft(endDate) {
        const now = new Date();
        const diff = endDate - now;

        if (diff <= 0) {
            return 'Завершена';
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (days > 0) {
            return `${days} дн. ${hours} ч.`;
        } else if (hours > 0) {
            return `${hours} ч. ${minutes} мин.`;
        } else {
            return `${minutes} мин.`;
        }
    }

    // Draw lottery (admin function)
    async drawLottery(lotteryId) {
        try {
            const lottery = await this.db.get('SELECT * FROM lotteries WHERE id = ?', [lotteryId]);
            if (!lottery) {
                throw new Error('Lottery not found');
            }

            const participants = await this.db.all(
                'SELECT user_id FROM lottery_tickets WHERE lottery_id = ?',
                [lotteryId]
            );

            if (participants.length === 0) {
                throw new Error('No participants in lottery');
            }

            // Select random winner
            const randomIndex = Math.floor(Math.random() * participants.length);
            const winner = participants[randomIndex];

            // Award prize to winner
            await this.db.run(
                'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                [lottery.total_pool, lottery.total_pool, winner.user_id]
            );

            // Log transaction
            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [winner.user_id, 'lottery_win', lottery.total_pool, `Выигрыш в лотерее: ${lottery.name}`]
            );

            // Deactivate lottery
            await this.db.run(
                'UPDATE lotteries SET is_active = 0 WHERE id = ?',
                [lotteryId]
            );

            // Get winner info
            const winnerInfo = await this.db.get('SELECT username, first_name FROM users WHERE id = ?', [winner.user_id]);

            return {
                winnerId: winner.user_id,
                winnerName: winnerInfo.username ? `@${winnerInfo.username}` : winnerInfo.first_name,
                prize: lottery.total_pool,
                lotteryName: lottery.name,
                participants: participants.length
            };

        } catch (error) {
            console.error('Error drawing lottery:', error);
            throw error;
        }
    }

    // Create new lottery (admin function)
    async createLottery(name, description, ticketPrice, endDate, botCommission = 0.1) {
        try {
            const result = await this.db.run(
                'INSERT INTO lotteries (name, description, ticket_price, end_date, bot_commission) VALUES (?, ?, ?, ?, ?)',
                [name, description, ticketPrice, endDate, botCommission]
            );
            return result.id;
        } catch (error) {
            console.error('Error creating lottery:', error);
            throw error;
        }
    }

    // Get all lotteries
    async getAllLotteries() {
        return await this.db.all('SELECT * FROM lotteries ORDER BY id DESC');
    }

    // Get lottery statistics
    async getLotteryStats(lotteryId) {
        try {
            const lottery = await this.db.get('SELECT * FROM lotteries WHERE id = ?', [lotteryId]);
            const participants = await this.db.get(
                'SELECT COUNT(*) as count FROM lottery_tickets WHERE lottery_id = ?',
                [lotteryId]
            );

            return {
                lottery,
                participantCount: participants.count,
                isExpired: new Date(lottery.end_date) < new Date()
            };
        } catch (error) {
            console.error('Error getting lottery stats:', error);
            return null;
        }
    }
}

module.exports = LotteryController;
