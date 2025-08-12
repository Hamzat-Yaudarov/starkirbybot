const SafeMessageHelper = require('../utils/safeMessageHelper');

class TaskController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
    }

    // Show available tasks for user
    async showTasks(chatId, userId, messageId = null) {
        try {
            // Get user's next available task
            const nextTask = await this.getNextTask(userId);
            
            if (!nextTask) {
                const noTasksMsg = `🎉 **Все задания выполнены!**

Поздравляем! Вы успешно завершили все доступные задания.
Новые задания будут добавлены в ближайше�� время.

💡 **Продолжайте зарабатывать:**
• 👆 Ежедневные клики — стабил��ный доход
• 👥 Реферальная программа — пассивный доход
• 📦 Кейсы — случайные призы
• 🎰 Лотереи — крупные выигрыши

Следите за обновлениями!`;

                const keyboard = [[
                    { text: '🏠 Главное меню', callback_data: 'main_menu' }
                ]];

                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot,noTasksMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, noTasksMsg, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    });
                }
                return;
            }

            // Show the next task
            await this.showTask(chatId, userId, nextTask, messageId);

        } catch (error) {
            console.error('Error showing tasks:', error);
            const errorMsg = '❌ Ошибка при загрузке заданий';
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

    // Get next available task for user
    async getNextTask(userId) {
        try {
            const nextTask = await this.db.get(`
                SELECT t.* FROM tasks t
                WHERE t.is_active = 1 
                AND t.id NOT IN (
                    SELECT task_id FROM user_tasks WHERE user_id = ?
                )
                ORDER BY t.id ASC
                LIMIT 1
            `, [userId]);

            return nextTask;
        } catch (error) {
            console.error('Error getting next task:', error);
            return null;
        }
    }

    // Show specific task
    async showTask(chatId, userId, task, messageId = null) {
        try {
            const taskMessage = `📋 **Активное задание**

**${task.title}**

📝 **Описание:** ${task.description}
💰 **Награда:** ${task.reward} ⭐

${this.getTaskInstructions(task.type)}`;

            const keyboard = [
                [{ text: '✅ Выполнить задание', url: task.target_link }],
                [{ text: '🎁 Получить награду', callback_data: `task_claim_${task.id}` }],
                [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
            ];

            if (messageId) {
                await SafeMessageHelper.safeEditMessage(this.bot,taskMessage, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, taskMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error showing task:', error);
            const errorMsg = '❌ Ошибка при загрузке задания';
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

    // Get task instructions based on type
    getTaskInstructions(taskType) {
        switch (taskType) {
            case 'channel':
                return `📢 **Пошаговая инструкция:**
1️⃣ Нажмите кнопку "✅ Выполнить задание"
2️⃣ Подпишитесь на канал и изучите контент
3️�� Вернитесь в бот и получите награду`;
            case 'chat':
                return `💬 **Пошаговая инструкция:**
1️⃣ Нажмите кнопку "✅ Выполнить задание"
2️⃣ Вступите в чат и поприветствуйте участников
3️⃣ Вернитесь в бот и получите награду`;
            case 'bot':
                return `🤖 **Пошаговая инструкция:**
1️⃣ Нажмите кнопку "✅ Выполнить задание"
2️⃣ Запустите бота командой /start
3️⃣ Вернитесь в бот и получите награду`;
            default:
                return `📝 **Пошаговая инструкция:**
1️⃣ Нажмите кнопку "✅ Выполнить задание"
2️⃣ Выполните все требования задания
3️⃣ Вернитесь в бот и получите награду`;
        }
    }

    // Handle task completion callback
    async handleTaskCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        try {
            if (data.startsWith('task_claim_')) {
                const taskId = parseInt(data.split('_')[2]);
                await this.claimTaskReward(chatId, userId, taskId, msg.message_id);
            } else if (data === 'task_next') {
                await this.showTasks(chatId, userId, msg.message_id);
            }
        } catch (error) {
            console.error('Error handling task callback:', error);
            try {
                await SafeMessageHelper.safeEditMessage(this.bot,'❌ Ошибка при обработке задания', {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🏠 Главное меню', callback_data: 'main_menu' }
                        ]]
                    }
                });
            } catch (editError) {
                await this.bot.sendMessage(chatId, '❌ Ошибка при обработке задания');
            }
        }
    }

    // Claim task reward
    async claimTaskReward(chatId, userId, taskId, messageId = null) {
        try {
            // Check if task exists and is active
            const task = await this.db.get('SELECT * FROM tasks WHERE id = ? AND is_active = 1', [taskId]);
            if (!task) {
                const errorMsg = '❌ Задание не найдено или неактивно';
                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot,errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🏠 Главное меню', callback_data: 'main_menu' }
                            ]]
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, errorMsg);
                }
                return;
            }

            // Check if user already completed this task
            const completed = await this.db.get(
                'SELECT * FROM user_tasks WHERE user_id = ? AND task_id = ?',
                [userId, taskId]
            );

            if (completed) {
                const errorMsg = '❌ Вы уже выполнили это задание';
                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot,errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '📋 Другие задания', callback_data: 'menu_tasks' },
                                { text: '🏠 Главное меню', callback_data: 'main_menu' }
                            ]]
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, errorMsg);
                }
                return;
            }

            // Verify subscription for the task
            if (await this.verifyTaskCompletion(userId, task)) {
                // Task completed successfully
            } else {
                const notCompletedMsg = `❌ **Задание не выполнено**

Пожалуйста, убедитесь что вы:
• Подписались на канал/чат
• Запустили бота (для заданий с ботами)

После выполнения попробуйте снова.`;

                const keyboard = [
                    [{ text: '✅ Выполнить задание', url: task.target_link }],
                    [{ text: '🎁 Получить награду', callback_data: `task_claim_${task.id}` }],
                    [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                ];

                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot,notCompletedMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, notCompletedMsg, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: keyboard
                        }
                    });
                }
                return;
            }
            
            // Mark task as completed
            await this.db.run(
                'INSERT INTO user_tasks (user_id, task_id) VALUES (?, ?)',
                [userId, taskId]
            );

            // Calculate boost from pets (task boost pets)
            const taskPets = await this.db.all(`
                SELECT p.boost_multiplier, up.level
                FROM user_pets up
                JOIN pets p ON up.pet_id = p.id
                WHERE up.user_id = ? AND p.boost_type = 'task'
            `, [userId]);

            let taskBoost = 0;
            taskPets.forEach(pet => {
                taskBoost += pet.boost_multiplier * pet.level;
            });

            // Final reward with boost
            const finalReward = task.reward + taskBoost;

            // Add reward to user balance
            await this.db.run(
                'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                [finalReward, finalReward, userId]
            );

            // Log transaction
            const transactionDesc = taskBoost > 0
                ? `Зад��ние: ${task.title} (+${taskBoost} буст)`
                : `Задание: ${task.title}`;

            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [userId, 'task', finalReward, transactionDesc]
            );

            // Get updated user balance
            const updatedUser = await this.db.get('SELECT balance FROM users WHERE id = ?', [userId]);

            const boostInfo = taskBoost > 0 ? ` (базовая ${task.reward} + буст +${taskBoost} от питомц��в)` : '';

            const successMsg = `✅ **Задание выполнено!**

🎉 Поздравляем! Вы успешно выполнили задание.

📋 **Задание:** ${task.title}
💰 **Получено:** ${finalReward.toFixed(2)} ⭐${boostInfo}
💎 **Ваш баланс:** ${updatedUser.balance.toFixed(2)} ⭐

Продолжайте выполнять задания для увеличения баланса!`;

            const keyboard = [
                [{ text: '📋 Следующее задание', callback_data: 'task_next' }],
                [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
            ];

            if (messageId) {
                await SafeMessageHelper.safeEditMessage(this.bot,successMsg, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, successMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error claiming task reward:', error);
            const errorMsg = '❌ Ошибка при получении награды';
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

    // Verify task completion (check if user subscribed to required channel/chat)
    async verifyTaskCompletion(userId, task) {
        try {
            if (task.type === 'channel' || task.type === 'chat') {
                // Try to extract channel ID or username from various link formats
                let channelIdentifier = null;

                // Handle different Telegram link formats
                const link = task.target_link;

                // Format 1: t.me/username
                let match = link.match(/t\.me\/([a-zA-Z0-9_]+)$/);
                if (match && !match[1].startsWith('+')) {
                    channelIdentifier = `@${match[1]}`;
                }

                // Format 2: t.me/+hash (private channels)
                if (!channelIdentifier) {
                    match = link.match(/t\.me\/\+([a-zA-Z0-9_-]+)/);
                    if (match) {
                        // Private channels cannot be verified through username
                        console.log('Private channel detected, assuming completed');
                        return true;
                    }
                }

                // Format 3: t.me/joinchat/hash (old format)
                if (!channelIdentifier) {
                    match = link.match(/t\.me\/joinchat\/([a-zA-Z0-9_-]+)/);
                    if (match) {
                        // Old invite links cannot be verified through username
                        console.log('Old invite link detected, assuming completed');
                        return true;
                    }
                }

                // Format 4: Extract from query parameters
                if (!channelIdentifier) {
                    match = link.match(/[?&]invite=([a-zA-Z0-9_-]+)/);
                    if (match) {
                        console.log('Invite parameter detected, assuming completed');
                        return true;
                    }
                }

                // If we have a channel identifier, try to verify subscription
                if (channelIdentifier) {
                    try {
                        const member = await this.bot.getChatMember(channelIdentifier, userId);
                        const isSubscribed = member.status !== 'left' && member.status !== 'kicked';
                        console.log(`Subscription check for ${channelIdentifier}: ${isSubscribed ? 'subscribed' : 'not subscribed'}`);
                        return isSubscribed;
                    } catch (error) {
                        console.error(`Error checking subscription to ${channelIdentifier}:`, error.message);
                        // If channel is private or we can't access it, assume completed
                        if (error.message.includes('chat not found') ||
                            error.message.includes('not enough rights') ||
                            error.message.includes('Forbidden') ||
                            error.message.includes('member list is inaccessible')) {
                            console.log('Channel verification failed (private/restricted), assuming completed');
                            return true;
                        }
                        return false;
                    }
                } else {
                    console.log('Could not extract channel identifier from link, assuming completed');
                    return true;
                }
            }

            // For bot type tasks, cannot verify, assume completed
            if (task.type === 'bot') {
                console.log('Bot task type, cannot verify, assuming completed');
                return true;
            }

            // For other task types, assume completed
            return true;
        } catch (error) {
            console.error('Error verifying task completion:', error);
            return true;
        }
    }
}

module.exports = TaskController;
