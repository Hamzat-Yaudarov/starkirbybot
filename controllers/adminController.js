const SafeMessageHelper = require('../utils/safeMessageHelper');

class AdminController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
        this.adminId = 6910097562;
    }

    setWeeklyRewardsController(weeklyRewardsController) {
        this.weeklyRewards = weeklyRewardsController;
    }

    // Check if user is admin
    isAdmin(userId) {
        return userId === this.adminId;
    }

    // Show admin panel main menu
    async showAdminPanel(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) {
            const errorMsg = '❌ У ва�� нет доступа к админ-п��нели';
            if (messageId) {
                await this.bot.editMessageText(errorMsg, {
                    chat_id: chatId,
                    message_id: messageId
                });
            } else {
                await this.bot.sendMessage(chatId, errorMsg);
            }
            return;
        }

        const message = `🔧 Панель администрат��ра

Добро пожаловать в панель управления ботом.
Выберите раздел для управления:`;

        const keyboard = [
            [{ text: '📊 Ста��истика', callback_data: 'admin_stats' }],
            [{ text: '👥 Пользователи', callback_data: 'admin_users' }],
            [{ text: '🎫 Промокоды', callback_data: 'admin_promos' }],
            [{ text: '📋 Задания', callback_data: 'admin_tasks' }],
            [{ text: '🎰 Лотереи', callback_data: 'admin_lotteries' }],
            [{ text: '📢 Обяз��т��льные каналы', callback_data: 'admin_channels' }],
            [{ text: '🐾 Питомцы', callback_data: 'admin_pets' }],
            [{ text: '📡 Рассылки', callback_data: 'admin_broadcasts' }],
            [{ text: '🏆 Еженедельные награды', callback_data: 'admin_weekly_rewards' }],
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
    }

    // Show detailed statistics
    async showStatistics(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            // Get comprehensive stats
            const userStats = await this.db.get(`
                SELECT
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN DATE(registration_date) = DATE('now') THEN 1 END) as new_today,
                    COUNT(CASE WHEN DATE(registration_date) >= DATE('now', '-7 days') THEN 1 END) as new_week,
                    COUNT(CASE WHEN last_click_date >= DATE('now', '-1 day') THEN 1 END) as active_today,
                    COUNT(CASE WHEN last_click_date < DATE('now', '-7 days') OR last_click_date IS NULL THEN 1 END) as inactive_week,
                    SUM(balance) as total_balance,
                    SUM(total_earned) as total_earned,
                    SUM(level1_referrals) as total_referrals,
                    AVG(balance) as avg_balance
                FROM users
            `);

            const transactionStats = await this.db.get(`
                SELECT 
                    COUNT(*) as total_transactions,
                    COUNT(CASE WHEN DATE(date) = DATE('now') THEN 1 END) as today_transactions,
                    SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_earned_transactions,
                    SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_spent_transactions
                FROM transactions
            `);

            const taskStats = await this.db.get(`
                SELECT 
                    COUNT(DISTINCT task_id) as completed_tasks,
                    COUNT(*) as total_completions
                FROM user_tasks
            `);

            const withdrawalStats = await this.db.get(`
                SELECT 
                    COUNT(*) as total_requests,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
                    COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
                    SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_amount
                FROM withdrawals
            `);

            const petStats = await this.db.get(`
                SELECT 
                    COUNT(*) as pets_owned,
                    COUNT(DISTINCT user_id) as users_with_pets,
                    AVG(level) as avg_pet_level
                FROM user_pets
            `);

            const message = `📊 Полная стат��стика бота

👥 **Пользователи:**
├ Всего пользователей: ${userStats.total_users}
├ Новых се��одня: ${userStats.new_today}
├ Новых за нед��лю: ${userStats.new_week}
├ Активны�� (за сутки): ${userStats.active_today}
├ Неактивных (за неделю): ${userStats.inactive_week}
└ Средний ба��анс: ${(userStats.avg_balance || 0).toFixed(2)} ⭐

💰 **Финансы:**
├ Общий бал����с: ${(userStats.total_balance || 0).toFixed(2)} ⭐
├ Всего зараб��тано: ${(userStats.total_earned || 0).toFixed(2)} ⭐
├ Доходы: ${(transactionStats.total_earned_transactions || 0).toFixed(2)} ��
└ Расходы: ${(transactionStats.total_spent_transactions || 0).toFixed(2)} ⭐

📋 **Активн��сть:**
├ Всего транзакци����: ${transactionStats.total_transactions}
├ Транзакц��й сегодня: ${transactionStats.today_transactions}
├ Выполнен�� зада��ий: ${taskStats.total_completions}
└ Рефералов: ${userStats.total_referrals}

💸 **Выводы:**
├ Всего заявок: ${withdrawalStats.total_requests}
├ В ожидании: ${withdrawalStats.pending}
├ Одобрено: ${withdrawalStats.approved}
└ Вы��едено: ${(withdrawalStats.approved_amount || 0).toFixed(2)} ⭐

🐾 **Питомцы:**
├ Всего питомцев: ${petStats.pets_owned}
├ Пользователей с пит��мцами: ${petStats.users_with_pets}
└ Ср��дний ур��вень: ${(petStats.avg_pet_level || 0).toFixed(1)}`;

            const keyboard = [
                [{ text: '🔄 Обновить', callback_data: 'admin_stats' }],
                [{ text: '🔙 Назад в админку', callback_data: 'admin_panel' }]
            ];

            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error showing statistics:', error);
            const errorMsg = '❌ Ошибка при загрузке статистики';
            if (messageId) {
                try {
                    await this.bot.editMessageText(errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад в админку', callback_data: 'admin_panel' }
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

    // Show user management menu
    async showUserManagement(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `👥 Управление п��льзователями

Выберите действие:`;

        const keyboard = [
            [{ text: '📋 Все ��ользо��ат��ли', callback_data: 'admin_users_all' }],
            [{ text: '✅ Активные пользователи', callback_data: 'admin_users_active' }],
            [{ text: '💤 Неактивные пользователи', callback_data: 'admin_users_inactive' }],
            [{ text: '🆕 Новые пользователи', callback_data: 'admin_users_new' }],
            [{ text: '🚫 Заблокированны��', callback_data: 'admin_users_banned' }],
            [{ text: '🔍 Найти пользователя', callback_data: 'admin_users_search' }],
            [{ text: '🗑️ Удалить игрока', callback_data: 'admin_users_delete' }],
            [{ text: '🔙 Назад в админку', callback_data: 'admin_panel' }]
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
    }

    // Handle admin callbacks
    async handleAdminCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        if (!this.isAdmin(userId)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, '❌ Нет досту��а');
            return;
        }

        try {
            switch (data) {
                case 'admin_panel':
                    await this.showAdminPanel(chatId, userId, msg.message_id);
                    break;
                case 'admin_stats':
                    await this.showStatistics(chatId, userId, msg.message_id);
                    break;
                case 'admin_users':
                    await this.showUserManagement(chatId, userId, msg.message_id);
                    break;
                case 'admin_promos':
                    await this.showPromoManagement(chatId, userId, msg.message_id);
                    break;
                case 'admin_tasks':
                    await this.showTaskManagement(chatId, userId, msg.message_id);
                    break;
                case 'admin_lotteries':
                    await this.showLotteryManagement(chatId, userId, msg.message_id);
                    break;
                case 'admin_channels':
                    await this.showChannelManagement(chatId, userId, msg.message_id);
                    break;
                case 'admin_pets':
                    await this.showPetManagement(chatId, userId, msg.message_id);
                    break;
                case 'admin_broadcasts':
                    await this.showBroadcastManagement(chatId, userId, msg.message_id);
                    break;
                case 'admin_weekly_rewards':
                    await this.showWeeklyRewardsManagement(chatId, userId, msg.message_id);
                    break;
                // User management
                case 'admin_users_all':
                    await this.showAllUsers(chatId, userId);
                    break;
                case 'admin_users_active':
                    await this.showActiveUsers(chatId, userId);
                    break;
                case 'admin_users_inactive':
                    await this.showInactiveUsers(chatId, userId);
                    break;
                case 'admin_users_new':
                    await this.showNewUsers(chatId, userId);
                    break;
                case 'admin_users_banned':
                    await this.showBannedUsers(chatId, userId);
                    break;
                case 'admin_users_delete':
                    await this.showDeleteUser(chatId, userId, msg.message_id);
                    break;
                case 'admin_users_active':
                    await this.showActiveUsers(chatId, userId, msg.message_id);
                    break;
                case 'admin_users_inactive':
                    await this.showInactiveUsers(chatId, userId, msg.message_id);
                    break;
                // Promo management
                case 'admin_promo_create':
                    await this.createPromoCode(chatId, userId, msg.message_id);
                    break;
                case 'admin_promo_list':
                    await this.showAllPromoCodes(chatId, userId);
                    break;
                case 'admin_promo_stats':
                    await this.showPromoStats(chatId, userId);
                    break;
                // Task management
                case 'admin_task_create':
                    await this.createTask(chatId, userId);
                    break;
                case 'admin_task_list':
                    await this.showAllTasks(chatId, userId);
                    break;
                case 'admin_task_active':
                    await this.showActiveTasks(chatId, userId);
                    break;
                case 'admin_task_inactive':
                    await this.showInactiveTasks(chatId, userId);
                    break;
                case 'admin_task_delete':
                    await this.showDeleteTask(chatId, userId, msg.message_id);
                    break;
                case 'admin_task_delete_all':
                    await this.showDeleteAllTasks(chatId, userId, msg.message_id);
                    break;
                // Lottery management
                case 'admin_lottery_create':
                    await this.createLottery(chatId, userId);
                    break;
                case 'admin_lottery_list':
                    await this.showAllLotteries(chatId, userId);
                    break;
                case 'admin_lottery_active':
                    await this.showActiveLotteries(chatId, userId);
                    break;
                case 'admin_lottery_finish':
                    await this.finishLottery(chatId, userId);
                    break;
                // Channel management
                case 'admin_channel_add':
                    await this.addMandatoryChannel(chatId, userId);
                    break;
                case 'admin_channel_list':
                    await this.showAllChannels(chatId, userId);
                    break;
                case 'admin_channel_active':
                    await this.showActiveChannels(chatId, userId);
                    break;
                case 'admin_channel_inactive':
                    await this.showInactiveChannels(chatId, userId);
                    break;
                case 'admin_channel_delete':
                    await this.showDeleteChannel(chatId, userId, msg.message_id);
                    break;
                // Pet management
                case 'admin_pet_create':
                    await this.createPet(chatId, userId, msg.message_id);
                    break;
                case 'admin_pet_list':
                    await this.showAllPets(chatId, userId, msg.message_id);
                    break;
                case 'admin_pet_edit':
                    await this.showEditPet(chatId, userId, msg.message_id);
                    break;
                case 'admin_pet_delete':
                    await this.showDeletePet(chatId, userId, msg.message_id);
                    break;
                default:
                    if (data.startsWith('admin_user_ban_')) {
                        const targetUserId = parseInt(data.split('_')[3]);
                        await this.banUser(chatId, targetUserId);
                    } else if (data.startsWith('admin_user_unban_')) {
                        const targetUserId = parseInt(data.split('_')[3]);
                        await this.unbanUser(chatId, targetUserId);
                    } else if (data.startsWith('admin_user_info_')) {
                        const targetUserId = parseInt(data.split('_')[3]);
                        await this.showUserInfo(chatId, targetUserId);
                    } else if (data.startsWith('admin_task_delete_') && !data.includes('admin_task_delete_all')) {
                        const taskId = parseInt(data.split('_')[3]);
                        console.log('Deleting task with ID:', taskId, 'from callback:', data);
                        if (isNaN(taskId)) {
                            console.error('Invalid task ID parsed from callback data:', data);
                            await this.bot.sendMessage(chatId, '❌ Неверный ID задания');
                            return;
                        }
                        await this.deleteTask(chatId, userId, taskId, msg.message_id);
                    } else if (data.startsWith('admin_channel_delete_')) {
                        const channelId = parseInt(data.split('_')[3]);
                        await this.deleteChannel(chatId, userId, channelId, msg.message_id);
                    } else if (data.startsWith('admin_pet_edit_')) {
                        const petId = parseInt(data.split('_')[3]);
                        await this.editPetForm(chatId, userId, petId, msg.message_id);
                    } else if (data.startsWith('admin_pet_delete_')) {
                        const petId = parseInt(data.split('_')[3]);
                        await this.deletePet(chatId, userId, petId, msg.message_id);
                    } else if (data.startsWith('admin_pet_toggle_')) {
                        const petId = parseInt(data.split('_')[3]);
                        await this.togglePetStatus(chatId, userId, petId, msg.message_id);
                    } else if (data === 'admin_task_delete_all_confirm') {
                        await this.deleteAllTasks(chatId, userId, msg.message_id);
                    } else if (data.startsWith('admin_broadcast_')) {
                        await this.handleBroadcastCallback(callbackQuery);
                    } else if (data.startsWith('admin_weekly_rewards_')) {
                        await this.handleWeeklyRewardsCallback(callbackQuery);
                    } else if (data.startsWith('admin_pet_template_')) {
                        await this.handlePetTemplate(callbackQuery);
                    } else if (data.startsWith('admin_pet_price_') || data.startsWith('admin_pet_boost_') || data.startsWith('admin_pet_manual_')) {
                        await this.handlePetQuickAction(callbackQuery);
                    } else if (data.startsWith('admin_lottery_finish_')) {
                        const lotteryId = parseInt(data.split('_')[3]);
                        await this.finishLotteryManual(chatId, userId, lotteryId, msg.message_id);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling admin callback:', error);
            console.error('Callback data:', data);
            console.error('Error details:', error.message);
            try {
                if (msg.message_id) {
                    await this.bot.editMessageText(`❌ ��шибка при выпо��н��нии дейс��вия: ${error.message}`, {
                        chat_id: chatId,
                        message_id: msg.message_id,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад в админку', callback_data: 'admin_panel' }
                            ]]
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, `❌ Ошибка при выполнен��и действия: ${error.message}`);
                }
            } catch (sendError) {
                await this.bot.sendMessage(chatId, '❌ Ошибка при выполне��ии действия');
            }
        }
    }

    // Show all users
    async showAllUsers(chatId, userId, page = 1) {
        if (!this.isAdmin(userId)) return;

        const limit = 10;
        const offset = (page - 1) * limit;

        try {
            const users = await this.db.all(`
                SELECT u.*, ub.banned_date 
                FROM users u
                LEFT JOIN user_bans ub ON u.id = ub.user_id
                ORDER BY u.registration_date DESC
                LIMIT ? OFFSET ?
            `, [limit, offset]);

            const totalUsers = await this.db.get('SELECT COUNT(*) as count FROM users');
            const totalPages = Math.ceil(totalUsers.count / limit);

            let message = `👥 Все пользователи (��тр. ${page}/${totalPages}):\n\n`;

            users.forEach((user, index) => {
                const name = user.username ? `@${user.username}` : user.first_name;
                const status = user.banned_date ? '🚫' : '✅';
                const regDate = new Date(user.registration_date).toLocaleDateString('ru-RU');
                
                message += `${status} ${offset + index + 1}. [${name}](tg://user?id=${user.id})
💰 ${user.balance.toFixed(2)} ⭐ | 👥 ${user.level1_referrals} реф | 📅 ${regDate}
🆔 \`${user.id}\`

`;
            });

            const keyboard = [];
            
            // Pagination
            if (totalPages > 1) {
                const paginationRow = [];
                if (page > 1) {
                    paginationRow.push({ text: '◀️', callback_data: `admin_users_all_${page - 1}` });
                }
                paginationRow.push({ text: `${page}/${totalPages}`, callback_data: 'admin_users_pagination' });
                if (page < totalPages) {
                    paginationRow.push({ text: '▶️', callback_data: `admin_users_all_${page + 1}` });
                }
                keyboard.push(paginationRow);
            }

            keyboard.push([{ text: '🔙 Назад', callback_data: 'admin_users' }]);

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });

        } catch (error) {
            console.error('Error showing all users:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке п��льзовате��ей');
        }
    }

    // Show active users (clicked today)
    async showActiveUsers(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const users = await this.db.all(`
                SELECT * FROM users
                WHERE last_click_date = DATE('now', 'localtime')
                OR DATE(last_click_date) = DATE('now', 'localtime')
                ORDER BY balance DESC
                LIMIT 20
            `);

            let message = `✅ Активные польз��ватели (кликали сего��ня):\n\n`;

            if (users.length === 0) {
                message += 'Нет активны�� пользовате��ей сегодня.';
            } else {
                users.forEach((user, index) => {
                    const name = user.username ? `@${user.username}` : user.first_name;
                    message += `${index + 1}. [${name}](tg://user?id=${user.id})
💰 ${user.balance.toFixed(2)} ⭐ | �� ${user.level1_referrals} реф
🆔 \`${user.id}\`

`;
                });
            }

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Назад', callback_data: 'admin_users' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error showing active users:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке активных п��льзователей');
        }
    }

    // Show inactive users
    async showInactiveUsers(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const users = await this.db.all(`
                SELECT * FROM users 
                WHERE (last_click_date IS NULL OR last_click_date < DATE('now', '-7 days'))
                AND registration_date < DATE('now', '-1 day')
                ORDER BY registration_date DESC
                LIMIT 20
            `);

            let message = `���� Неактивные пользователи (не кликали 7+ дней):\n\n`;

            if (users.length === 0) {
                message += 'Все пользователи акти��ны!';
            } else {
                users.forEach((user, index) => {
                    const name = user.username ? `@${user.username}` : user.first_name;
                    const lastClick = user.last_click_date ? new Date(user.last_click_date).toLocaleDateString('ru-RU') : 'Ник��гда';
                    message += `${index + 1}. [${name}](tg://user?id=${user.id})
💰 ${user.balance.toFixed(2)} ⭐ | 📅 ${lastClick}
🆔 \`${user.id}\`

`;
                });
            }

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Назад', callback_data: 'admin_users' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error showing inactive users:', error);
            await this.bot.sendMessage(chatId, '��� Ошибка при загрузке не��ктивных польз��вателей');
        }
    }

    // Show new users
    async showNewUsers(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const users = await this.db.all(`
                SELECT * FROM users 
                WHERE DATE(registration_date) >= DATE('now', '-7 days')
                ORDER BY registration_date DESC
                LIMIT 20
            `);

            let message = `🆕 Новые пользователи (за последние 7 дней):\n\n`;

            if (users.length === 0) {
                message += 'Нет новых пользователей за последн���е 7 дней.';
            } else {
                users.forEach((user, index) => {
                    const name = user.username ? `@${user.username}` : user.first_name;
                    const regDate = new Date(user.registration_date).toLocaleDateString('ru-RU');
                    message += `${index + 1}. [${name}](tg://user?id=${user.id})
💰 ${user.balance.toFixed(2)} ⭐ | 📅 ${regDate}
🆔 \`${user.id}\`

`;
                });
            }

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Назад', callback_data: 'admin_users' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error showing new users:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке новых пользователей');
        }
    }

    // Show banned users
    async showBannedUsers(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const users = await this.db.all(`
                SELECT u.*, ub.banned_date, ub.ban_reason 
                FROM users u
                JOIN user_bans ub ON u.id = ub.user_id
                ORDER BY ub.banned_date DESC
                LIMIT 20
            `);

            let message = `🚫 Заблокированные пользователи:\n\n`;

            if (users.length === 0) {
                message += 'Нет заблокированных пользоват��лей.';
            } else {
                users.forEach((user, index) => {
                    const name = user.username ? `@${user.username}` : user.first_name;
                    const banDate = new Date(user.banned_date).toLocaleDateString('ru-RU');
                    message += `${index + 1}. [${name}](tg://user?id=${user.id})
📅 Забанен: ${banDate}
📝 Причина: ${user.ban_reason || 'Не указана'}
🆔 \`${user.id}\`

`;
                });
            }

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '��� Назад', callback_data: 'admin_users' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error showing banned users:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке заблокир��ванных по��ьзовател��й');
        }
    }

    // Ban user
    async banUser(chatId, targetUserId, reason = 'Нарушение правил') {
        try {
            // Check if user exists
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [targetUserId]);
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Поль��ователь не найден');
                return;
            }

            // Check if already banned
            const existingBan = await this.db.get('SELECT * FROM user_bans WHERE user_id = ?', [targetUserId]);
            if (existingBan) {
                await this.bot.sendMessage(chatId, '❌ ����ользователь уже заблокирован');
                return;
            }

            // Ban user
            await this.db.run(
                'INSERT INTO user_bans (user_id, ban_reason, banned_by) VALUES (?, ?, ?)',
                [targetUserId, reason, this.adminId]
            );

            const name = user.username ? `@${user.username}` : user.first_name;
            await this.bot.sendMessage(chatId, `✅ Пользователь [${name}](tg://user?id=${targetUserId}) заблокирован`, {
                parse_mode: 'Markdown'
            });

            // Notify user
            try {
                await this.bot.sendMessage(targetUserId, `🚫 Вы были заблокированы в боте

📝 Причина: ${reason}

Для разблоки��овки обратитесь к администратору.`);
            } catch (error) {
                console.log('Could not notify banned user');
            }

        } catch (error) {
            console.error('Error banning user:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при блокировке ��ользователя');
        }
    }

    // Unban user
    async unbanUser(chatId, targetUserId) {
        try {
            const result = await this.db.run('DELETE FROM user_bans WHERE user_id = ?', [targetUserId]);
            
            if (result.changes > 0) {
                await this.bot.sendMessage(chatId, '✅ Пользователь разблокирован');
                
                // Notify user
                try {
                    await this.bot.sendMessage(targetUserId, `✅ Вы были разблокированы!

Теперь вы можете снова пользоваться ботом.
Пожалуйста, соблюдайте правила.`);
                } catch (error) {
                    console.log('Could not notify unbanned user');
                }
            } else {
                await this.bot.sendMessage(chatId, '❌ Пользователь не был заблокирован');
            }

        } catch (error) {
            console.error('Error unbanning user:', error);
            await this.bot.sendMessage(chatId, '❌ О��ибка ��ри разблокировке пользоват��ля');
        }
    }

    // Check if user is banned
    async isUserBanned(userId) {
        try {
            const ban = await this.db.get('SELECT * FROM user_bans WHERE user_id = ?', [userId]);
            return !!ban;
        } catch (error) {
            console.error('Error checking user ban:', error);
            return false;
        }
    }

    // Promo code management
    async showPromoManagement(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `🎫 **Управление промокодами**

Создавайте и управляйте промокодами для п��льзователей бота.`;

        const keyboard = [
            [
                { text: '➕ Создать промоко��', callback_data: 'admin_promo_create' },
                { text: '📋 Все промоко��ы', callback_data: 'admin_promo_list' }
            ],
            [
                { text: '�� Ста��истика промокодов', callback_data: 'admin_promo_stats' }
            ],
            [
                { text: '🔙 Назад в админку', callback_data: 'admin_panel' }
            ]
        ];

        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }).catch(() => {
                // If edit fails, send new message
                this.bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
    }

    async showAllPromoCodes(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const promos = await this.db.all(`
                SELECT
                    pc.*,
                    COUNT(upc.user_id) as times_used
                FROM promo_codes pc
                LEFT JOIN user_promo_codes upc ON pc.id = upc.promo_code_id
                GROUP BY pc.id
                ORDER BY pc.created_date DESC
                LIMIT 20
            `);

            let message = `📋 **Все промок��ды:**\n\n`;

            if (promos.length === 0) {
                message += 'Промокодов пока нет.';
            } else {
                promos.forEach((promo, index) => {
                    const status = promo.is_active ? '✅' : '���';
                    const expiry = promo.expiry_date ?
                        new Date(promo.expiry_date).toLocaleDateString('ru-RU') : 'Бессрочный';

                    message += `${index + 1}. ${status} **${promo.code}**
💰 Награда: ${promo.reward} ⭐
📊 Использований: ${promo.times_used}/${promo.max_uses}
��� Истекает: ${expiry}

`;
                });
            }

            const keyboard = [
                [
                    { text: '➕ Создать промокод', callback_data: 'admin_promo_create' }
                ],
                [
                    { text: '🔙 Назад', callback_data: 'admin_promos' }
                ]
            ];

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });

        } catch (error) {
            console.error('Error showing promo codes:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузк�� промок��дов');
        }
    }

    async createPromoCode(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `➕ Создание промокода

Отправьте данные в формате:
КОД НАГРАДА ЛИМИТ [ДНЕЙ_ДЕЙС��ВИЯ]

Примеры:
• STARS10 10 100 - код на 10 звёзд, 100 исполь��ований
• BONUS5 5 50 7 - код на 5 звёзд, 50 использований, 7 дней

Где:
- КОД - название промокода (только буквы и цифры)
- НАГРАДА - количество звёзд
- ЛИМИТ - максимальное количество использований
- ДНЕЙ_ДЕЙСТВИЯ - через сколько дней истечёт (необязательно)`;

        const keyboard = [
            [{ text: '🔙 Назад', callback_data: 'admin_promos' }]
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

        // Set state for waiting promo input
        this.waitingPromoInput = this.waitingPromoInput || {};
        this.waitingPromoInput[chatId] = true;
    }

    async showPromoStats(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const stats = await this.db.get(`
                SELECT
                    COUNT(*) as total_promos,
                    COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_promos,
                    SUM(current_uses) as total_uses,
                    SUM(CASE WHEN is_active = 1 THEN current_uses ELSE 0 END) as active_uses
                FROM promo_codes
            `);

            const recentUses = await this.db.all(`
                SELECT pc.code, pc.reward, COUNT(upc.user_id) as uses
                FROM promo_codes pc
                LEFT JOIN user_promo_codes upc ON pc.id = upc.promo_code_id
                WHERE upc.used_date >= DATE('now', '-7 days')
                GROUP BY pc.id
                ORDER BY uses DESC
                LIMIT 5
            `);

            let message = `📊 **Статистика промокодов:**

📈 **Общая статистика:**
• Всего промокодов: ${stats.total_promos}
• Ак���ивных: ${stats.active_promos}
• ��бщее использований: ${stats.total_uses}
• Использований активных: ${stats.active_uses}

`;

            if (recentUses.length > 0) {
                message += `🔥 **Попул��рные за неделю:**\n`;
                recentUses.forEach((promo, index) => {
                    message += `${index + 1}. ${promo.code} - ${promo.uses} использован��й\n`;
                });
            }

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Назад к промокодам', callback_data: 'admin_promos' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error showing promo stats:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке статистики промокодов');
        }
    }

    async handlePromoInput(chatId, userId, input) {
        if (!this.isAdmin(userId)) return;

        try {
            const parts = input.trim().split(' ');
            if (parts.length < 3) {
                await this.bot.sendMessage(chatId, '❌ Неве��н��й формат. Используйте: К��Д НАГРАДА ЛИМИТ [ДНЕЙ]');
                return;
            }

            const code = parts[0].toUpperCase();
            const reward = parseFloat(parts[1]);
            const maxUses = parseInt(parts[2]);
            const days = parts[3] ? parseInt(parts[3]) : null;

            if (isNaN(reward) || isNaN(maxUses)) {
                await this.bot.sendMessage(chatId, '❌ Награда и лимит должны быть числами');
                return;
            }

            let expiryDate = null;
            if (days) {
                expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + days);
                expiryDate = expiryDate.toISOString();
            }

            // Create promo code
            await this.db.run(
                'INSERT INTO promo_codes (code, reward, max_uses, expiry_date) VALUES (?, ?, ?, ?)',
                [code, reward, maxUses, expiryDate]
            );

            await this.bot.sendMessage(chatId, `✅ Промоко�� ��оздан!

🎫 **Код:** ${code}
💰 **Н��г��ада:** ${reward} ⭐
📊 **Лимит:** ${maxUses} использований
📅 **Срок:** ${days ? `${days} дней` : 'Бессрочный'}`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 К промокодам', callback_data: 'admin_promos' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error creating promo code:', error);
            if (error.message.includes('UNIQUE constraint failed')) {
                await this.bot.sendMessage(chatId, '❌ Промокод с таким названием уже существует');
            } else {
                await this.bot.sendMessage(chatId, '❌ Ошибка при создании промокода');
            }
        }
    }

    async handleTaskInput(chatId, userId, input) {
        if (!this.isAdmin(userId)) return;

        try {
            // Split by first space to separate type from the rest
            const firstSpaceIndex = input.trim().indexOf(' ');
            if (firstSpaceIndex === -1) {
                await this.bot.sendMessage(chatId, '❌ Неверный формат. Используйте: ТИП НАЗВАНИЕ|ОПИСАНИЕ|НАГРА��А|ССЫЛКА');
                return;
            }

            const type = input.trim().substring(0, firstSpaceIndex).toLowerCase();
            const taskDataString = input.trim().substring(firstSpaceIndex + 1);
            const taskData = taskDataString.split('|');

            if (taskData.length < 4) {
                await this.bot.sendMessage(chatId, `❌ Неверный ф��рмат данных задания. Получено ${taskData.length} частей, нуж��о 4.

**При��ер правильного формата:**
\`chat Подписаться на чат|чат с выводами|4|https://t.me/kirbyvivodstars\`

**Ваш ввод разбился н��:**
${taskData.map((part, i) => `${i + 1}. "${part.trim()}"`).join('\n')}`, {
                    parse_mode: 'Markdown'
                });
                return;
            }

            const [title, description, rewardStr, targetLink] = taskData;
            const reward = parseFloat(rewardStr);

            if (!['channel', 'chat', 'bot'].includes(type)) {
                await this.bot.sendMessage(chatId, '❌ Неверный тип задания. Исп��льзуйте: channel, chat или bot');
                return;
            }

            if (isNaN(reward)) {
                await this.bot.sendMessage(chatId, '❌ Награда должна быть чис��ом');
                return;
            }

            // Create task
            await this.db.run(
                'INSERT INTO tasks (type, title, description, reward, target_link) VALUES (?, ?, ?, ?, ?)',
                [type, title.trim(), description.trim(), reward, targetLink.trim()]
            );

            const typeEmoji = type === 'channel' ? '📢' : type === 'chat' ? '💬' : '🤖';

            await this.bot.sendMessage(chatId, `✅ Задание создан��!

${typeEmoji} **${title}**
📝 ${description}
💰 Награда: ${reward} ⭐
🔗 ${targetLink}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 К заданиям', callback_data: 'admin_tasks' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error creating task:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при создании задания');
        }
    }

    async handleChannelInput(chatId, userId, input) {
        if (!this.isAdmin(userId)) return;

        try {
            const parts = input.trim().split('|');
            if (parts.length < 4) {
                await this.bot.sendMessage(chatId, '❌ Неверны�� фо��мат. Используйте: @channel_id|Название|Ссылка|тип');
                return;
            }

            const [channelId, channelName, channelLink, typeStr] = parts;
            const isPrivate = typeStr.trim().toLowerCase() === 'private';

            // Create mandatory channel
            await this.db.run(
                'INSERT INTO mandatory_channels (channel_id, channel_name, channel_link, is_private) VALUES (?, ?, ?, ?)',
                [channelId.trim(), channelName.trim(), channelLink.trim(), isPrivate ? 1 : 0]
            );

            const type = isPrivate ? '🔒 Закрытый' : '🔓 Открытый';

            await this.bot.sendMessage(chatId, `✅ Обязательный канал добавлен!

📢 **${channelName}**
📍 ID: \`${channelId}\`
🔗 ${channelLink}
${type}`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 К каналам', callback_data: 'admin_channels' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error creating mandatory channel:', error);
            if (error.message.includes('UNIQUE constraint failed')) {
                await this.bot.sendMessage(chatId, '❌ Канал с таким ID уже существует');
            } else {
                await this.bot.sendMessage(chatId, '❌ Ошибка при добавлении канала');
            }
        }
    }

    async showTaskManagement(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `📋 У��ра��ление заданиями

Создавайте задания для подписки на каналы, чаты и ботов.`;

        const keyboard = [
            [
                { text: '➕ Добавить задание', callback_data: 'admin_task_create' },
                { text: '📋 ��се задания', callback_data: 'admin_task_list' }
            ],
            [
                { text: '✅ Ак��ивные задания', callback_data: 'admin_task_active' },
                { text: '❌ Неактивные задания', callback_data: 'admin_task_inactive' }
            ],
            [
                { text: '🗑️ Удалить задание', callback_data: 'admin_task_delete' },
                { text: '💥 Удалить ВСЕ', callback_data: 'admin_task_delete_all' }
            ],
            [
                { text: '🔙 Назад в админку', callback_data: 'admin_panel' }
            ]
        ];

        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
    }

    async showAllTasks(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            console.log('Fetching all tasks from database...');
            const tasks = await this.db.all(`
                SELECT t.*, COUNT(ut.user_id) as completions
                FROM tasks t
                LEFT JOIN user_tasks ut ON t.id = ut.task_id
                GROUP BY t.id
                ORDER BY t.id DESC
                LIMIT 20
            `);

            console.log('Tasks fetched:', tasks.length);
            console.log('Task IDs:', tasks.map(t => t.id));

            let message = `📋 **Все задания:**\n\n`;

            if (tasks.length === 0) {
                message += 'Заданий пока нет.';
            } else {
                tasks.forEach((task, index) => {
                    const status = task.is_active ? '✅' : '❌';
                    const typeEmoji = task.type === 'channel' ? '📢' : task.type === 'chat' ? '💬' : '🤖';

                    message += `${index + 1}. ${status} ${typeEmoji} **${task.title}**
💰 Награда: ${task.reward} ⭐
👥 Выполнен��й: ${task.completions}
🔗 ${task.target_link}

`;
                });
            }

            const keyboard = [
                [
                    { text: '➕ Добавить задание', callback_data: 'admin_task_create' }
                ],
                [
                    { text: '🔙 Назад', callback_data: 'admin_tasks' }
                ]
            ];

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });

        } catch (error) {
            console.error('Error showing tasks:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке заданий');
        }
    }

    async createTask(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        const message = `➕ Создание задания

Отправьте данные в фо��мате:
ТИП НАЗВАНИЕ|ОПИСАНИЕ|НАГРАДА|ССЫЛКА

Типы заданий:
• channel - подписка на канал
• chat - вступлени�� в чат
• bot - запуск бота

Пример:
channel Подписаться на канал|Подпишитесь на наш канал новостей|5|https://t.me/example

Где разделитель - символ |`;

        const keyboard = [
            [{ text: '🔙 Назад', callback_data: 'admin_tasks' }]
        ];

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });

        // Set state for waiting task input
        this.waitingTaskInput = this.waitingTaskInput || {};
        this.waitingTaskInput[chatId] = true;
    }

    async showActiveTasks(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            console.log('Loading active tasks...');
            const tasks = await this.db.all(`
                SELECT t.id, t.type, t.title, t.reward, t.target_link,
                       (SELECT COUNT(*) FROM user_tasks ut WHERE ut.task_id = t.id) as completions
                FROM tasks t
                WHERE t.is_active = 1
                ORDER BY t.id DESC
            `);

            console.log('Active tasks loaded:', tasks.length);

            let message = `✅ **Активные задания:**\n\n`;

            if (tasks.length === 0) {
                message += 'Активных заданий пока нет.';
            } else {
                tasks.forEach((task, index) => {
                    const typeEmoji = task.type === 'channel' ? '📢' : task.type === 'chat' ? '💬' : '🤖';

                    message += `${index + 1}. ${typeEmoji} **${task.title}**
💰 Награда: ${task.reward} ⭐
👥 Выполнений: ${task.completions || 0}
🔗 ${task.target_link}

`;
                });
            }

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Назад к заданиям', callback_data: 'admin_tasks' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error showing active tasks:', error);
            console.error('Error details:', error.message);
            console.error('Error stack:', error.stack);
            await this.bot.sendMessage(chatId, `❌ Ошибка при загрузке активных заданий: ${error.message}`);
        }
    }

    async showInactiveTasks(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            console.log('Loading inactive tasks...');
            const tasks = await this.db.all(`
                SELECT t.id, t.type, t.title, t.reward, t.target_link,
                       (SELECT COUNT(*) FROM user_tasks ut WHERE ut.task_id = t.id) as completions
                FROM tasks t
                WHERE t.is_active = 0
                ORDER BY t.id DESC
            `);

            let message = `❌ **Неакти��ные задания:**\n\n`;

            if (tasks.length === 0) {
                message += 'Неактивных зада��ий пока нет.';
            } else {
                tasks.forEach((task, index) => {
                    const typeEmoji = task.type === 'channel' ? '📢' : task.type === 'chat' ? '💬' : '🤖';

                    message += `${index + 1}. ${typeEmoji} **${task.title}**
💰 Награда: ${task.reward} ⭐
👥 В��полнени��: ${task.completions}
🔗 ${task.target_link}

`;
                });
            }

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Назад к заданиям', callback_data: 'admin_tasks' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error showing inactive tasks:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка п��и загрузке неактивных заданий');
        }
    }

    async showLotteryManagement(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `🎰 Управление л��тереями

Создавайте и управляйте лотереями для пользователей.`;

        const keyboard = [
            [
                { text: '➕ Создать лотерею', callback_data: 'admin_lottery_create' },
                { text: '📋 Все лотереи', callback_data: 'admin_lottery_list' }
            ],
            [
                { text: '✅ Активные лотереи', callback_data: 'admin_lottery_active' },
                { text: '🏆 Завершить лотер��ю', callback_data: 'admin_lottery_finish' }
            ],
            [
                { text: '🔙 Назад в админку', callback_data: 'admin_panel' }
            ]
        ];

        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
    }

    async showAllLotteries(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const lotteries = await this.db.all(`
                SELECT l.*, COUNT(lt.id) as participants
                FROM lotteries l
                LEFT JOIN lottery_tickets lt ON l.id = lt.lottery_id
                GROUP BY l.id
                ORDER BY l.id DESC
                LIMIT 10
            `);

            let message = `�� **Все лотереи:**\n\n`;

            if (lotteries.length === 0) {
                message += 'Лоте��ей пока нет.';
            } else {
                lotteries.forEach((lottery, index) => {
                    const status = lottery.is_active ? '✅' : '❌';
                    const endDate = new Date(lottery.end_date);
                    const isExpired = endDate < new Date();

                    message += `${index + 1}. ${status} **${lottery.name}**
💰 Цена билета: ${lottery.ticket_price} ⭐
🏆 Призо��ой фонд: ${lottery.total_pool.toFixed(2)} ⭐
👥 Участников: ${lottery.participants}
📅 ${isExpired ? 'Завершена' : 'До ' + endDate.toLocaleDateString('ru-RU')}

`;
                });
            }

            const keyboard = [
                [
                    { text: '�� Создать лотер��ю', callback_data: 'admin_lottery_create' }
                ],
                [
                    { text: '🔙 Назад', callback_data: 'admin_lotteries' }
                ]
            ];

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });

        } catch (error) {
            console.error('Error showing lotteries:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке лотерей');
        }
    }

    async createLottery(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        const message = `➕ Создание лотереи

Отправьте данные в формате:
НАЗВАНИЕ|ОПИСАНИЕ|ЦЕНА_БИЛЕТА|ДНИ_ДЕЙСТВИЯ|КОМИССИЯ_БОТА

Пример:
Еженедел��ная лотерея|Большие призы каждую неделю|5|7|0.1

Где:
- НАЗВАНИЕ - название лотереи
- ОПИСАНИЕ - описание лотереи
- ЦЕНА_БИЛЕТА - стоимост�� одного билета в звёздах
- ДНИ_ДЕЙСТВИЯ - через сколько д��ей завершится
- КОМИССИЯ_БОТА - ��роцент комиссии (0.1 = 10%)`;

        const keyboard = [
            [{ text: '🔙 Назад', callback_data: 'admin_lotteries' }]
        ];

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });

        // Set state for waiting lottery input
        this.waitingLotteryInput = this.waitingLotteryInput || {};
        this.waitingLotteryInput[chatId] = true;
    }

    async showActiveLotteries(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const lotteries = await this.db.all(`
                SELECT l.*, COUNT(lt.id) as participants
                FROM lotteries l
                LEFT JOIN lottery_tickets lt ON l.id = lt.lottery_id
                WHERE l.is_active = 1 AND l.end_date > datetime('now')
                GROUP BY l.id
                ORDER BY l.id DESC
            `);

            let message = `✅ **Активные лотереи:**\n\n`;

            if (lotteries.length === 0) {
                message += 'Активных лотерей п��ка нет.';
            } else {
                lotteries.forEach((lottery, index) => {
                    const endDate = new Date(lottery.end_date);

                    message += `${index + 1}. **${lottery.name}**
💰 Цена билета: ${lottery.ticket_price} ⭐
🏆 Призовой фонд: ${lottery.total_pool.toFixed(2)} ��
👥 Участников: ${lottery.participants}
📅 До ${endDate.toLocaleDateString('ru-RU')}

`;
                });
            }

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Назад к лотереям', callback_data: 'admin_lotteries' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error showing active lotteries:', error);
            await this.bot.sendMessage(chatId, '❌ ���шибка при загрузке активных лотерей');
        }
    }

    async finishLottery(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const activeLotteries = await this.db.all(`
                SELECT l.*, COUNT(lt.id) as participants
                FROM lotteries l
                LEFT JOIN lottery_tickets lt ON l.id = lt.lottery_id
                WHERE l.is_active = 1
                GROUP BY l.id
                ORDER BY l.id DESC
            `);

            if (activeLotteries.length === 0) {
                await this.bot.sendMessage(chatId, '❌ Нет ��ктивных лотерей для завершения', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '���� Назад к л��тереям', callback_data: 'admin_lotteries' }]
                        ]
                    }
                });
                return;
            }

            let message = `🏆 **Завершение лотереи**\n\nВыберите лотерею для завершения:\n\n`;

            const keyboard = [];

            activeLotteries.forEach((lottery, index) => {
                message += `${index + 1}. **${lottery.name}** (${lottery.participants} участн��ко��)\n`;
                keyboard.push([{
                    text: `🏆 Завершить "${lottery.name}"`,
                    callback_data: `admin_lottery_finish_${lottery.id}`
                }]);
            });

            keyboard.push([{ text: '🔙 Назад к лотереям', callback_data: 'admin_lotteries' }]);

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });

        } catch (error) {
            console.error('Error showing lotteries to finish:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при заг��узке лотерей');
        }
    }

    async showChannelManagement(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `📢 **Обязательные каналы**

Управляйте каналами, на которые польз��ватели должны быть ��одписаны для использования бота.`;

        const keyboard = [
            [
                { text: '➕ Добавить канал', callback_data: 'admin_channel_add' },
                { text: '📋 Все каналы', callback_data: 'admin_channel_list' }
            ],
            [
                { text: '✅ Активные каналы', callback_data: 'admin_channel_active' },
                { text: '❌ Неак��ивные каналы', callback_data: 'admin_channel_inactive' }
            ],
            [
                { text: '🗑️ Удалить к��нал', callback_data: 'admin_channel_delete' }
            ],
            [
                { text: '🔙 Назад в админку', callback_data: 'admin_panel' }
            ]
        ];

        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
    }

    async showAllChannels(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const channels = await this.db.all(`
                SELECT * FROM mandatory_channels
                ORDER BY created_date DESC
                LIMIT 20
            `);

            let message = `📢 **Все обязательные каналы:**\n\n`;

            if (channels.length === 0) {
                message += 'Обязательных каналов пока нет.';
            } else {
                channels.forEach((channel, index) => {
                    const status = channel.is_active ? '✅' : '❌';
                    const type = channel.is_private ? '🔒 Закрытый' : '🔓 Открытый';

                    message += `${index + 1}. ${status} **${channel.channel_name}**
📍 ID: \`${channel.channel_id}\`
🔗 ${channel.channel_link}
${type}

`;
                });
            }

            const keyboard = [
                [
                    { text: '➕ Добавить канал', callback_data: 'admin_channel_add' }
                ],
                [
                    { text: '🔙 Назад', callback_data: 'admin_channels' }
                ]
            ];

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });

        } catch (error) {
            console.error('Error showing channels:', error);
            await this.bot.sendMessage(chatId, '�� Ошибка при загрузке каналов');
        }
    }

    async addMandatoryChannel(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        const message = `➕ **Добавление обязательного канала**

Отправьте данные в формате:
\`@channel_id|Название канала|https://t.me/channel|тип\`

**Типы каналов:**
• \`open\` - открытый канал
• \`private\` - закрытый канал

**Пример:**
\`@example_channel|Мой канал|https://t.me/example_channel|open\`

Где раз��ели��ель - символ \`|\``;

        const keyboard = [
            [{ text: '🔙 Назад', callback_data: 'admin_channels' }]
        ];

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });

        // Set state for waiting channel input
        this.waitingChannelInput = this.waitingChannelInput || {};
        this.waitingChannelInput[chatId] = true;
    }

    // Helper method to check if user is subscribed to mandatory channels
    async checkMandatorySubscriptions(userId) {
        try {
            const channels = await this.db.all(
                'SELECT * FROM mandatory_channels WHERE is_active = 1'
            );

            const unsubscribedChannels = [];

            for (const channel of channels) {
                try {
                    const member = await this.bot.getChatMember(channel.channel_id, userId);
                    if (!member || ['left', 'kicked'].includes(member.status)) {
                        unsubscribedChannels.push(channel);
                    }
                } catch (error) {
                    // If we can't check (private channel), assume not subscribed
                    if (!channel.is_private) {
                        unsubscribedChannels.push(channel);
                    }
                }
            }

            return unsubscribedChannels;
        } catch (error) {
            console.error('Error checking mandatory subscriptions:', error);
            return [];
        }
    }

    async showActiveChannels(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const channels = await this.db.all(`
                SELECT * FROM mandatory_channels
                WHERE is_active = 1
                ORDER BY created_date DESC
            `);

            let message = `�� **Активные обязательные каналы:**\n\n`;

            if (channels.length === 0) {
                message += 'Активных обязательных каналов пока нет.';
            } else {
                channels.forEach((channel, index) => {
                    const type = channel.is_private ? '🔒 Закрытый' : '🔓 Открытый';

                    message += `${index + 1}. **${channel.channel_name}**
📍 ID: \`${channel.channel_id}\`
🔗 ${channel.channel_link}
${type}

`;
                });
            }

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Назад к каналам', callback_data: 'admin_channels' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error showing active channels:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке активных каналов');
        }
    }

    async showInactiveChannels(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const channels = await this.db.all(`
                SELECT * FROM mandatory_channels
                WHERE is_active = 0
                ORDER BY created_date DESC
            `);

            let message = `❌ **Неактивные обязательные каналы:**\n\n`;

            if (channels.length === 0) {
                message += 'Неактивных ��бязательн��х каналов пока нет.';
            } else {
                channels.forEach((channel, index) => {
                    const type = channel.is_private ? '🔒 Закрытый' : '🔓 Открытый';

                    message += `${index + 1}. **${channel.channel_name}**
📍 ID: \`${channel.channel_id}\`
🔗 ${channel.channel_link}
${type}

`;
                });
            }

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Назад к канала��', callback_data: 'admin_channels' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error showing inactive channels:', error);
            await this.bot.sendMessage(chatId, '�� Ошибка при загрузке неактив��ых каналов');
        }
    }

    async handleLotteryInput(chatId, userId, input) {
        if (!this.isAdmin(userId)) return;

        try {
            const parts = input.trim().split('|');
            if (parts.length < 5) {
                await this.bot.sendMessage(chatId, '❌ Неверный формат. Испол��зуйте: НАЗВАНИЕ|ОП��САНИЕ|ЦЕ��А_БИЛ��ТА|ДНИ_ДЕЙСТВИЯ|КОМИССИЯ_БОТА');
                return;
            }

            const [name, description, ticketPriceStr, daysStr, commissionStr] = parts;
            const ticketPrice = parseFloat(ticketPriceStr.trim());
            const days = parseInt(daysStr.trim());
            const commission = parseFloat(commissionStr.trim());

            if (isNaN(ticketPrice) || isNaN(days) || isNaN(commission)) {
                await this.bot.sendMessage(chatId, '�� Цена билета, дни и ��омиссия должны быть числами');
                return;
            }

            if (commission < 0 || commission > 1) {
                await this.bot.sendMessage(chatId, '❌ Комиссия должна быть от 0 до 1 (например, 0.1 = 10%)');
                return;
            }

            // Calculate end date
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + days);

            // Create lottery
            await this.db.run(
                'INSERT INTO lotteries (name, description, ticket_price, end_date, bot_commission) VALUES (?, ?, ?, ?, ?)',
                [name.trim(), description.trim(), ticketPrice, endDate.toISOString(), commission]
            );

            await this.bot.sendMessage(chatId, `✅ Л��терея создана!

🎰 **${name}**
📝 ${description}
💰 Цена билета: ${ticketPrice} ⭐
📅 Завершится: ${endDate.toLocaleDateString('ru-RU')}
💼 Комиссия бота: ${(commission * 100).toFixed(1)}%`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 К лотереям', callback_data: 'admin_lotteries' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error creating lottery:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при создании лотереи');
        }
    }

    // Show delete user interface
    async showDeleteUser(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `🗑️ **Удаление игрок��**

Отправьте ID пользователя д��я удаления.

⚠️ **Внимание!** Это действие нельз��� отменить.
Будут удалены:
• Профиль пользователя
• Вся игровая статистика
• Рефералы и связи
• ��ранзакции
• Питомцы и дос��ижения

Пример: \`123456789\``;

        const keyboard = [
            [{ text: '🔙 Назад к управлению', callback_data: 'admin_users' }]
        ];

        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }

        // Set state for waiting user ID input
        this.waitingDeleteInput = this.waitingDeleteInput || {};
        this.waitingDeleteInput[chatId] = true;
    }

    // Handle delete user input
    async handleDeleteInput(chatId, userId, input) {
        if (!this.isAdmin(userId)) return;

        try {
            const targetUserId = parseInt(input.trim());
            if (isNaN(targetUserId)) {
                await this.bot.sendMessage(chatId, '❌ Неверный ID пользователя');
                return;
            }

            // Check if user exists
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [targetUserId]);
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Пользователь не найден');
                return;
            }

            // First, update referral counts if user was someone's referral
            if (user.referrer_id) {
                // Decrease level1_referrals count for direct referrer
                await this.db.run(
                    'UPDATE users SET level1_referrals = level1_referrals - 1 WHERE id = ? AND level1_referrals > 0',
                    [user.referrer_id]
                );

                // Check if referrer has a referrer (level 2)
                const level1Referrer = await this.db.get('SELECT referrer_id FROM users WHERE id = ?', [user.referrer_id]);
                if (level1Referrer && level1Referrer.referrer_id) {
                    // Decrease level2_referrals count for level 2 referrer
                    await this.db.run(
                        'UPDATE users SET level2_referrals = level2_referrals - 1 WHERE id = ? AND level2_referrals > 0',
                        [level1Referrer.referrer_id]
                    );
                }
            }

            // Delete user and all related data
            await this.db.run('DELETE FROM users WHERE id = ?', [targetUserId]);
            await this.db.run('DELETE FROM user_tasks WHERE user_id = ?', [targetUserId]);
            await this.db.run('DELETE FROM user_pets WHERE user_id = ?', [targetUserId]);
            await this.db.run('DELETE FROM user_promo_codes WHERE user_id = ?', [targetUserId]);
            await this.db.run('DELETE FROM transactions WHERE user_id = ?', [targetUserId]);
            await this.db.run('DELETE FROM withdrawals WHERE user_id = ?', [targetUserId]);
            await this.db.run('DELETE FROM lottery_tickets WHERE user_id = ?', [targetUserId]);
            await this.db.run('DELETE FROM user_bans WHERE user_id = ?', [targetUserId]);

            const userName = user.username ? `@${user.username}` : user.first_name;

            const referrerInfo = user.referrer_id ? `\n• Обновлены счетчики рефералов у пригласивших` : '';

            await this.bot.sendMessage(chatId, `✅ **ПОЛЬЗОВАТЕЛЬ ПОЛНОСТЬЮ УДАЛЕН**

👤 **${userName}** (ID: ${targetUserId}) бы�� полностью удален из системы.

🗑️ **Удаленные данные:**
• Профиль и статистика
• ${user.level1_referrals} связей рефералов
• ${user.balance.toFixed(2)} ⭐ баланса
• Все транзакции и активности
• Питомцы и достижения${referrerInfo}

✅ **Теперь этого пользователя можно пригласить заново как реферала!**`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '👥 Управление пользователями', callback_data: 'admin_users' }],
                        [{ text: '🔙 Назад в админку', callback_data: 'admin_panel' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error deleting user:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при удалении пользователя');
        }
    }

    // Show active users (contacted bot in last 24 hours)
    async showActiveUsers(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            const users = await this.db.all(`
                SELECT * FROM users
                WHERE last_click_date >= DATE('now', '-1 day')
                ORDER BY last_click_date DESC
                LIMIT 50
            `);

            let message = `✅ **Активные пользователи (за сутки):**\n\n`;

            if (users.length === 0) {
                message += 'Активных по��ьз��вателей за сутки пока нет.';
            } else {
                message += `Найдено: ${users.length} пользователей\n\n`;
                users.slice(0, 20).forEach((user, index) => {
                    const userName = user.username ? `@${user.username}` : user.first_name;
                    const lastActive = user.last_click_date ? new Date(user.last_click_date).toLocaleString('ru-RU') : 'Никогда';

                    message += `${index + 1}. **${userName}**
ID: \`${user.id}\`
💰 Баланс: ${user.balance.toFixed(2)} ⭐
👥 Рефералов: ${user.level1_referrals}
⏰ Последняя акт��вность: ${lastActive}

`;
                });

                if (users.length > 20) {
                    message += `... и ещё ${users.length - 20} по��ьзователей`;
                }
            }

            const keyboard = [
                [{ text: '��� Обновить', callback_data: 'admin_users_active' }],
                [{ text: '🔙 Наз���� к управлению', callback_data: 'admin_users' }]
            ];

            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error showing active users:', error);
            const errorMsg = '❌ Ошибка при загрузке ��ктивных пользователей';
            if (messageId) {
                try {
                    await this.bot.editMessageText(errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Н��зад к управлению', callback_data: 'admin_users' }
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

    // Show inactive users (no contact for a week)
    async showInactiveUsers(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            const users = await this.db.all(`
                SELECT * FROM users
                WHERE last_click_date < DATE('now', '-7 days') OR last_click_date IS NULL
                ORDER BY registration_date DESC
                LIMIT 50
            `);

            let message = `💤 **Н��активные польз��ватели (более недели):**\n\n`;

            if (users.length === 0) {
                message += 'Неактивных пользователей пока нет.';
            } else {
                message += `Найдено: ${users.length} пользователей\n\n`;
                users.slice(0, 20).forEach((user, index) => {
                    const userName = user.username ? `@${user.username}` : user.first_name;
                    const lastActive = user.last_click_date ? new Date(user.last_click_date).toLocaleString('ru-RU') : 'Никогда';
                    const registered = new Date(user.registration_date).toLocaleString('ru-RU');

                    message += `${index + 1}. **${userName}**
ID: \`${user.id}\`
💰 Баланс: ${user.balance.toFixed(2)} ⭐
👥 Реф��ралов: ${user.level1_referrals}
📅 Рег��страция: ${registered}
⏰ Последняя активность: ${lastActive}

`;
                });

                if (users.length > 20) {
                    message += `... и ещё ${users.length - 20} пользователей`;
                }
            }

            const keyboard = [
                [{ text: '🔄 Обновить', callback_data: 'admin_users_inactive' }],
                [{ text: '🔙 Назад к управлению', callback_data: 'admin_users' }]
            ];

            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error showing inactive users:', error);
            const errorMsg = '❌ Ошибк�� при з��грузке неактивных пользователей';
            if (messageId) {
                try {
                    await this.bot.editMessageText(errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад к управлению', callback_data: 'admin_users' }
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

    // Show delete task interface
    async showDeleteTask(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            const tasks = await this.db.all(`
                SELECT id, title, type, is_active, reward
                FROM tasks
                ORDER BY id DESC
                LIMIT 20
            `);

            let message = `🗑️ Удаление заданий

Выберите задание для удаления:

`;

            const keyboard = [];

            if (tasks.length === 0) {
                message += 'Задани�� пока нет.';
                keyboard.push([{ text: '🔙 Назад к заданиям', callback_data: 'admin_tasks' }]);
            } else {
                tasks.forEach((task, index) => {
                    const status = task.is_active ? '✅' : '❌';
                    const typeEmoji = task.type === 'channel' ? '📢' : task.type === 'chat' ? '💬' : '🤖';

                    message += `${index + 1}. ${status} ${typeEmoji} ${task.title} (${task.reward} ⭐)
`;

                    keyboard.push([{
                        text: `🗑️ Удалить: ${task.title}`,
                        callback_data: `admin_task_delete_${task.id}`
                    }]);
                });

                keyboard.push([{ text: '🔙 Наз��д к заданиям', callback_data: 'admin_tasks' }]);
            }

            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error showing delete task:', error);
            const errorMsg = '❌ Ошибка при загрузке заданий для удаления';
            if (messageId) {
                try {
                    await this.bot.editMessageText(errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад к заданиям', callback_data: 'admin_tasks' }
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

    // Delete specific task
    async deleteTask(chatId, userId, taskId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            console.log(`Starting task deletion for task ID: ${taskId}`);

            // Get task info first
            const task = await this.db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
            console.log('Task found:', task);

            if (!task) {
                console.log('Task not found in database');
                await this.bot.sendMessage(chatId, '��� Задание не найдено');
                return;
            }

            // Delete task and related data (delete child records first due to foreign key constraints)
            console.log('Deleting from user_tasks table first...');
            const userTasksResult = await this.db.run('DELETE FROM user_tasks WHERE task_id = ?', [taskId]);
            console.log('User tasks deletion result:', userTasksResult);

            console.log('Now deleting from tasks table...');
            const taskResult = await this.db.run('DELETE FROM tasks WHERE id = ?', [taskId]);
            console.log('Task deletion result:', taskResult);

            if (taskResult.changes === 0) {
                console.error('WARNING: No rows were affected by task deletion');
                await this.bot.sendMessage(chatId, '❌ Задание не было найдено или уже удалено');
                return;
            }

            // Verify deletion
            const verifyTask = await this.db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
            console.log('Task after deletion (should be null):', verifyTask);

            if (verifyTask) {
                console.error('ERROR: Task was not actually deleted!');
                await this.bot.sendMessage(chatId, '❌ Ошибка: задание не было удалено из базы данных');
                return;
            }

            console.log('Task successfully deleted, sending confirmation...');

            const successMsg = `✅ Задание уд��лено

📋 "${task.title}" было удалено из базы данны��.

ID задания: ${taskId}
Тип: ${task.type}`;

            const keyboard = [
                [{ text: '🔄 Обновить список', callback_data: 'admin_task_list' }],
                [{ text: '🗑️ Удалить ещё', callback_data: 'admin_task_delete' }],
                [{ text: '🔙 Назад к заданиям', callback_data: 'admin_tasks' }]
            ];

            if (messageId) {
                await this.bot.editMessageText(successMsg, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, successMsg, {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error deleting task:', error);
            const errorMsg = '❌ Ошибка при удалении задания';
            if (messageId) {
                try {
                    await this.bot.editMessageText(errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад к заданиям', callback_data: 'admin_tasks' }
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

    // Show delete channel interface
    async showDeleteChannel(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            const channels = await this.db.all(`
                SELECT * FROM mandatory_channels
                ORDER BY created_date DESC
            `);

            let message = `🗑️ **Удалени�� обязательных ��аналов**

Выберите канал для удаления:

`;

            const keyboard = [];

            if (channels.length === 0) {
                message += 'Обязательных каналов пока нет.';
                keyboard.push([{ text: '🔙 Назад к каналам', callback_data: 'admin_channels' }]);
            } else {
                channels.forEach((channel, index) => {
                    const status = channel.is_active ? '✅' : '❌';
                    const type = channel.is_private ? '🔒' : '🔓';

                    message += `${index + 1}. ${status} ${type} ${channel.channel_name}
   ID: \`${channel.channel_id}\`

`;

                    keyboard.push([{
                        text: `🗑️ Удалить: ${channel.channel_name}`,
                        callback_data: `admin_channel_delete_${channel.id}`
                    }]);
                });

                keyboard.push([{ text: '���� Назад к каналам', callback_data: 'admin_channels' }]);
            }

            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error showing delete channel:', error);
            const errorMsg = '❌ Ошибка при загрузке каналов для удаления';
            if (messageId) {
                try {
                    await this.bot.editMessageText(errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '��� Назад к каналам', callback_data: 'admin_channels' }
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

    // Delete specific channel
    async deleteChannel(chatId, userId, channelId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            // Get channel info first
            const channel = await this.db.get('SELECT * FROM mandatory_channels WHERE id = ?', [channelId]);
            if (!channel) {
                await this.bot.sendMessage(chatId, '❌ Канал не найден');
                return;
            }

            // Delete channel
            await this.db.run('DELETE FROM mandatory_channels WHERE id = ?', [channelId]);

            const successMsg = `✅ **Обязательный канал удален**

📢 **${channel.channel_name}** был успешно удален.

🗑️ Удаленные ��анн����:
• Канал из списка обязательных
• Требование подписки для п��льзователей`;

            const keyboard = [
                [{ text: '🗑️ Удалить ещё', callback_data: 'admin_channel_delete' }],
                [{ text: '📋 Все кан��лы', callback_data: 'admin_channel_list' }],
                [{ text: '🔙 Назад к каналам', callback_data: 'admin_channels' }]
            ];

            if (messageId) {
                await this.bot.editMessageText(successMsg, {
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
            console.error('Error deleting channel:', error);
            const errorMsg = '❌ Ошибка при удале��ии канала';
            if (messageId) {
                try {
                    await this.bot.editMessageText(errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 ��азад к каналам', callback_data: 'admin_channels' }
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

    // Pet Management System
    async showPetManagement(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `���� Управление питомцами

Управляйте всеми питомцами в боте.`;

        const keyboard = [
            [
                { text: '➕ Создать питомца', callback_data: 'admin_pet_create' },
                { text: '📋 Все питомцы', callback_data: 'admin_pet_list' }
            ],
            [
                { text: '✏�� Редактировать питомца', callback_data: 'admin_pet_edit' },
                { text: '🗑️ Удалить п��томца', callback_data: 'admin_pet_delete' }
            ],
            [
                { text: '🔙 Назад в админку', callback_data: 'admin_panel' }
            ]
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
    }

    async showAllPets(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            const pets = await this.db.all(`
                SELECT * FROM pets
                ORDER BY id DESC
                LIMIT 10
            `);

            let message = `📋 Все пито��цы (первые 10):\n\n`;

            if (pets.length === 0) {
                message += 'Питомцев пока нет.';
            } else {
                pets.forEach((pet, index) => {
                    const status = pet.is_active ? '✅' : '❌';
                    const boostType = this.getBoostTypeName(pet.boost_type || 'click');

                    message += `${index + 1}. ${status} ${pet.name}
💰 ${pet.base_price} ⭐ | ���� ${boostType} (+${pet.boost_multiplier})
📊 Ур. ${pet.max_level || 10}

`;
                });
            }

            const keyboard = [
                [
                    { text: '➕ С��здать питомца', callback_data: 'admin_pet_create' }
                ],
                [
                    { text: '🔙 Назад к питомцам', callback_data: 'admin_pets' }
                ]
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
            console.error('Error showing pets:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке питомцев');
        }
    }

    async createPet(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `➕ **СОЗДАНИЕ ПИТОМЦА**

📝 **Простой формат:**
\`НАЗВАНИЕ|ОПИСАНИЕ|ЦЕНА|ТИП_БУСТА|БУСТ|УРОВЕНЬ\`

🚀 **Типы бустов:**
• \`click\` — добавляет звёзды к ежедневному клику
• \`referral_1\` — добавляет звёзды за рефералов 1 ур.
• \`referral_2\` — добавляет звёзды за рефералов 2 ур.
• \`task\` — добавляет звёзды за выполнение заданий

💡 **Примеры:**
\`🐱 Котик|Увеличивает клики|50|click|1|10\`
\`🐶 Пёсик|Больше за рефералов|100|referral_1|2|10\`
\`🐲 Дракон|Супер буст заданий|500|task|5|10\`

⚡ **Буст = сколько доп. звёзд даёт питомец**`;

        const keyboard = [
            [
                { text: '🐱 Шаблон: Котик', callback_data: 'admin_pet_template_cat' },
                { text: '🐶 Шаблон: Пёсик', callback_data: 'admin_pet_template_dog' }
            ],
            [
                { text: '🦅 Шаблон: Орёл', callback_data: 'admin_pet_template_eagle' },
                { text: '🐲 Шаблон: Дракон', callback_data: 'admin_pet_template_dragon' }
            ],
            [{ text: '🔙 Назад к питомцам', callback_data: 'admin_pets' }]
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

        // Set state for waiting pet input
        this.waitingPetInput = this.waitingPetInput || {};
        this.waitingPetInput[chatId] = 'create';
    }

    async handlePetInput(chatId, userId, input, action = 'create') {
        if (!this.isAdmin(userId)) return;

        try {
            const parts = input.trim().split('|');
            if (parts.length < 6) {
                await this.bot.sendMessage(chatId, '❌ Неверный формат. Используйте: НАЗВАНИЕ|ОПИСАНИЕ|ЦЕНА|ТИП_БУСТА|МН��ЖИТЕ��Ь|МАКС_УРОВЕНЬ');
                return;
            }

            const [name, description, priceStr, boostType, multiplierStr, maxLevelStr] = parts;
            const price = parseFloat(priceStr.trim());
            const multiplier = parseFloat(multiplierStr.trim());
            const maxLevel = parseInt(maxLevelStr.trim());

            if (isNaN(price) || isNaN(multiplier) || isNaN(maxLevel)) {
                await this.bot.sendMessage(chatId, '❌ Цена, множитель и макс. уровень должны быть числами');
                return;
            }

            if (!['click', 'referral_1', 'referral_2', 'task'].includes(boostType.trim())) {
                await this.bot.sendMessage(chatId, '❌ Неверный тип буста. Используйте: click, referral_1, referral_2, task');
                return;
            }

            if (action === 'create') {
                // Create pet
                await this.db.run(
                    'INSERT INTO pets (name, description, base_price, boost_type, boost_multiplier, max_level) VALUES (?, ?, ?, ?, ?, ?)',
                    [name.trim(), description.trim(), price, boostType.trim(), multiplier, maxLevel]
                );

                const boostTypeName = this.getBoostTypeName(boostType.trim());

                await this.bot.sendMessage(chatId, `✅ Питомец создан!

🐾 ${name}
📝 ${description}
💰 Цена: ${price} ⭐
🚀 Буст: ${boostTypeName} (+${multiplier})
📊 Макс. уровень: ${maxLevel}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 К питомцам', callback_data: 'admin_pets' }]
                        ]
                    }
                });
            }

        } catch (error) {
            console.error('Error creating pet:', error);
            if (error.message.includes('UNIQUE constraint failed')) {
                await this.bot.sendMessage(chatId, '❌ Питомец с таким названием уже существует');
            } else {
                await this.bot.sendMessage(chatId, '❌ Ошибка при создании питомца');
            }
        }
    }

    async showEditPet(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            const pets = await this.db.all(`
                SELECT * FROM pets
                ORDER BY id DESC
                LIMIT 10
            `);

            let message = `✏️ Редактирование питомца

Выберите питомца:

`;

            const keyboard = [];

            if (pets.length === 0) {
                message += 'Питомцев пока нет.';
                keyboard.push([{ text: '🔙 Назад к питомцам', callback_data: 'admin_pets' }]);
            } else {
                pets.forEach((pet, index) => {
                    const status = pet.is_active ? '✅' : '❌';

                    message += `${index + 1}. ${status} ${pet.name}
`;

                    keyboard.push([{
                        text: `✏️ ${pet.name}`,
                        callback_data: `admin_pet_edit_${pet.id}`
                    }]);
                });

                keyboard.push([{ text: '🔙 Назад к питомцам', callback_data: 'admin_pets' }]);
            }

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
            console.error('Error showing edit pet:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке питомцев для редактирования');
        }
    }

    async showDeletePet(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            const pets = await this.db.all(`
                SELECT * FROM pets
                ORDER BY id DESC
                LIMIT 10
            `);

            let message = `🗑️ Удаление питомца

��ыберите питомца:

`;

            const keyboard = [];

            if (pets.length === 0) {
                message += 'Питомцев пока нет.';
                keyboard.push([{ text: '🔙 Назад к питомцам', callback_data: 'admin_pets' }]);
            } else {
                pets.forEach((pet, index) => {
                    const status = pet.is_active ? '✅' : '❌';

                    message += `${index + 1}. ${status} ${pet.name}
`;

                    keyboard.push([{
                        text: `🗑️ ${pet.name}`,
                        callback_data: `admin_pet_delete_${pet.id}`
                    }]);
                });

                keyboard.push([{ text: '🔙 Назад к питомцам', callback_data: 'admin_pets' }]);
            }

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
            console.error('Error showing delete pet:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке питомцев для удаления');
        }
    }

    async deletePet(chatId, userId, petId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            // Get pet info first
            const pet = await this.db.get('SELECT * FROM pets WHERE id = ?', [petId]);
            if (!pet) {
                await this.bot.sendMessage(chatId, '❌ Питомец не найден');
                return;
            }

            // Delete pet and related data
            await this.db.run('DELETE FROM pets WHERE id = ?', [petId]);
            await this.db.run('DELETE FROM user_pets WHERE pet_id = ?', [petId]);

            const successMsg = `✅ Питомец удален

🐾 ${pet.name} был успешно удален.

🗑️ Удаленные данные:
• Питомец из магазина
• Все экземпляры у пользователей
• Связанна�� статистика`;

            const keyboard = [
                [{ text: '🗑️ Удалить ещё', callback_data: 'admin_pet_delete' }],
                [{ text: '📋 Все питомцы', callback_data: 'admin_pet_list' }],
                [{ text: '🔙 Назад к питомцам', callback_data: 'admin_pets' }]
            ];

            if (messageId) {
                await this.bot.editMessageText(successMsg, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, successMsg, {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error deleting pet:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при удалении питомца');
        }
    }

    async handlePetEdit(chatId, userId, input, petId) {
        if (!this.isAdmin(userId)) return;

        try {
            if (input.trim().toLowerCase() === 'toggle') {
                await this.togglePetStatus(chatId, userId, petId);
                return;
            }

            const parts = input.trim().split('|');
            if (parts.length < 6) {
                await this.bot.sendMessage(chatId, '❌ Неверный формат. Используйте: НАЗВАНИЕ|ОПИСАНИЕ|ЦЕНА|ТИП_БУСТА|МНОЖИТЕЛЬ|МАКС_УРОВЕНЬ');
                return;
            }

            const [name, description, priceStr, boostType, multiplierStr, maxLevelStr] = parts;
            const price = parseFloat(priceStr.trim());
            const multiplier = parseFloat(multiplierStr.trim());
            const maxLevel = parseInt(maxLevelStr.trim());

            if (isNaN(price) || isNaN(multiplier) || isNaN(maxLevel)) {
                await this.bot.sendMessage(chatId, '❌ Ц��на, множитель и макс. уровень дол��ны быть числами');
                return;
            }

            if (!['click', 'referral_1', 'referral_2', 'task'].includes(boostType.trim())) {
                await this.bot.sendMessage(chatId, '❌ Неверный тип буста. Используйте: click, referral_1, referral_2, task');
                return;
            }

            // Update pet
            await this.db.run(
                'UPDATE pets SET name = ?, description = ?, base_price = ?, boost_type = ?, boost_multiplier = ?, max_level = ? WHERE id = ?',
                [name.trim(), description.trim(), price, boostType.trim(), multiplier, maxLevel, petId]
            );

            const boostTypeName = this.getBoostTypeName(boostType.trim());

            await this.bot.sendMessage(chatId, `✅ Питомец обновлен!

🐾 ${name}
��� ${description}
💰 Цена: ${price} ⭐
🚀 Буст: ${boostTypeName} (+${multiplier})
📊 Макс. уровень: ${maxLevel}`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 К питомцам', callback_data: 'admin_pets' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error editing pet:', error);
            if (error.message.includes('UNIQUE constraint failed')) {
                await this.bot.sendMessage(chatId, '��� Питомец с таким названием уже существует');
            } else {
                await this.bot.sendMessage(chatId, '❌ Ошибка при редактировании питомца');
            }
        }
    }

    async editPetForm(chatId, userId, petId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            const pet = await this.db.get('SELECT * FROM pets WHERE id = ?', [petId]);
            if (!pet) {
                await this.bot.sendMessage(chatId, '❌ Питомец не найден');
                return;
            }

            const boostTypeName = this.getBoostTypeName(pet.boost_type || 'click');

            const message = `✏️ **РЕДАКТИРОВАНИЕ ПИТОМЦА**

📊 **Текущие параметры:**
🐾 Название: **${pet.name}**
📝 Описание: ${pet.description || 'Без описания'}
💰 Цена: **${pet.base_price} ⭐**
🚀 Буст: **${boostTypeName} (+${pet.boost_multiplier})**
📊 Макс. уровень: **${pet.max_level || 10}**
${pet.is_active ? '✅ **Активен**' : '❌ **Неактивен**'}

⚡ **Быстрые действия или ручное ре��актирование:**`;

            const keyboard = [
                [
                    { text: pet.is_active ? '❌ Деактивировать' : '✅ Активировать', callback_data: `admin_pet_toggle_${petId}` }
                ],
                [
                    { text: '💰 Цена: 25⭐', callback_data: `admin_pet_price_${petId}_25` },
                    { text: '💰 Цена: 50⭐', callback_data: `admin_pet_price_${petId}_50` },
                    { text: '💰 Цена: 100⭐', callback_data: `admin_pet_price_${petId}_100` }
                ],
                [
                    { text: '🚀 Буст: +1', callback_data: `admin_pet_boost_${petId}_1` },
                    { text: '🚀 Буст: +2', callback_data: `admin_pet_boost_${petId}_2` },
                    { text: '🚀 Буст: +5', callback_data: `admin_pet_boost_${petId}_5` }
                ],
                [
                    { text: '✏️ Ручное редактирование', callback_data: `admin_pet_manual_${petId}` }
                ],
                [{ text: '🔙 Назад к питомцам', callback_data: 'admin_pets' }]
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

            // Set state for waiting pet edit input
            this.waitingPetInput = this.waitingPetInput || {};
            this.waitingPetInput[chatId] = `edit_${petId}`;

        } catch (error) {
            console.error('Error showing edit pet form:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке формы редактирования');
        }
    }

    async togglePetStatus(chatId, userId, petId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            const pet = await this.db.get('SELECT * FROM pets WHERE id = ?', [petId]);
            if (!pet) {
                await this.bot.sendMessage(chatId, '❌ Питомец не найден');
                return;
            }

            const newStatus = pet.is_active ? 0 : 1;
            await this.db.run('UPDATE pets SET is_active = ? WHERE id = ?', [newStatus, petId]);

            const statusText = newStatus ? 'активирова��' : 'деактивиров��н';
            const successMsg = `✅ Статус изменен

🐾 Питомец "${pet.name}" был ${statusText}.`;

            const keyboard = [
                [{ text: '✏️ Редактир��в��ть ещё', callback_data: 'admin_pet_edit' }],
                [{ text: '🔙 Назад к питомцам', callback_data: 'admin_pets' }]
            ];

            if (messageId) {
                await this.bot.editMessageText(successMsg, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, successMsg, {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error toggling pet status:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при изменении статуса питомца');
        }
    }

    // Показать подтверждение удаления всех заданий
    async showDeleteAllTasks(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            const tasksCount = await this.db.get('SELECT COUNT(*) as count FROM tasks');

            const message = `⚠️ УДАЛЕНИЕ ВСЕХ ЗАДАНИЙ

🗑️ Вы действитель���о хотите удалить ВСЕ задания?

📊 Количество заданий: ${tasksCount.count}

⚠️ ВНИМАНИЕ! Это действие нельзя отменить!
Бу��ут удалены:
�� Все задания из системы
• Все записи о выполнении пользователями
• Вся связанная статистика`;

            const keyboard = [
                [{ text: '❌ Отмена', callback_data: 'admin_tasks' }],
                [{ text: '💥 ДА, УДАЛИТЬ ВСЕ!', callback_data: 'admin_task_delete_all_confirm' }]
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
            console.error('Error showing delete all tasks:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загруз��е информации о заданиях');
        }
    }

    // Удалить все задания
    async deleteAllTasks(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            console.log('Starting deletion of ALL tasks...');

            // Получаем количество заданий для статистики
            const tasksCount = await this.db.get('SELECT COUNT(*) as count FROM tasks');
            console.log(`About to delete ${tasksCount.count} tasks`);

            // Удаляем все связанные записи о выполнении
            console.log('Deleting all user_tasks...');
            const userTasksResult = await this.db.run('DELETE FROM user_tasks');
            console.log('User tasks deletion result:', userTasksResult);

            // Удаляем все задания
            console.log('Deleting all tasks...');
            const tasksResult = await this.db.run('DELETE FROM tasks');
            console.log('Tasks deletion result:', tasksResult);

            const successMsg = `✅ ВСЕ ЗАДАНИЯ УДА��ЕНЫ!

🗑️ Удалено заданий: ${tasksCount.count}
📊 Удалено записей выполнения: ${userTasksResult.changes}

Система заданий очищена полностью.`;

            const keyboard = [
                [{ text: '➕ Создать новое задание', callback_data: 'admin_task_create' }],
                [{ text: '📋 Упр����ление заданиями', callback_data: 'admin_tasks' }],
                [{ text: '🔙 Назад в админку', callback_data: 'admin_panel' }]
            ];

            if (messageId) {
                await this.bot.editMessageText(successMsg, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, successMsg, {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error deleting all tasks:', error);
            const errorMsg = '❌ Ошибка при удалении всех заданий';
            if (messageId) {
                await this.bot.editMessageText(errorMsg, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Назад к заданиям', callback_data: 'admin_tasks' }
                        ]]
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, errorMsg);
            }
        }
    }

    // Система рассылок
    async showBroadcastManagement(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `📡 Управление рассылками

Создавайте и отправляйте красивые сообщения всем пользователям бота.`;

        const keyboard = [
            [
                { text: '🏆 Рассылка: Топ недели', callback_data: 'admin_broadcast_top' },
                { text: '📋 Рассылка: Задания', callback_data: 'admin_broadcast_tasks' }
            ],
            [
                { text: '✉️ Создать свою рассылку', callback_data: 'admin_broadcast_custom' }
            ],
            [
                { text: '📊 История рассылок', callback_data: 'admin_broadcast_history' }
            ],
            [
                { text: '🔙 Назад в админку', callback_data: 'admin_panel' }
            ]
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
    }

    async handleBroadcastCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        if (!this.isAdmin(userId)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, '❌ Нет доступа');
            return;
        }

        try {
            switch (data) {
                case 'admin_broadcast_top':
                    await this.showTopWeekBroadcast(chatId, userId, msg.message_id);
                    break;
                case 'admin_broadcast_tasks':
                    await this.showTasksBroadcast(chatId, userId, msg.message_id);
                    break;
                case 'admin_broadcast_top_send':
                    await this.sendTopWeekBroadcast(chatId, userId);
                    break;
                case 'admin_broadcast_tasks_send':
                    await this.sendTasksBroadcast(chatId, userId);
                    break;
                case 'admin_broadcast_custom':
                    await this.showCustomBroadcast(chatId, userId, msg.message_id);
                    break;
                case 'admin_broadcast_history':
                    await this.showBroadcastHistory(chatId, userId, msg.message_id);
                    break;
                case 'admin_broadcast_custom_send':
                    await this.sendCustomBroadcast(chatId, userId);
                    break;
            }
        } catch (error) {
            console.error('Error handling broadcast callback:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, '❌ Ошибка обработки');
        }
    }

    async showTopWeekBroadcast(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `🏆 РАССЫЛКА: ТОП НЕДЕЛИ

📢 Предпросмотр сообщения:

────────────────────────

🏆 **ЕЖЕНЕДЕЛЬНЫЙ ТОП-РЕЙТИНГ!**

�� Со��евнуйся с другими игроками и получай крутые призы каждую неделю!

🎁 **Призы за топ позиции:**
🥇 1 место — 100 ⭐ звёзд
🥈 2 мест�� — 75 ⭐ звёзд
🥉 3 место — 50 ⭐ звёзд
🏅 4 место — 25 ⭐ звёзд
🎖 5 место — 15 ⭐ звёзд

💪 Приглашай друзей, выполняй задания и поднимайся в рейтинге!

⏰ Подведение итогов каждое воскресенье в 20:00

────────────────────────

С кнопками: "🏠 Главное меню" и "👥 Пригласить друга"`;

        const keyboard = [
            [
                { text: '📤 О��ПРАВИТЬ ВСЕМ', callback_data: 'admin_broadcast_top_send' }
            ],
            [
                { text: '✏️ Редактировать', callback_data: 'admin_broadcast_top_edit' },
                { text: '🔙 Назад', callback_data: 'admin_broadcasts' }
            ]
        ];

        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
    }

    async showTasksBroadcast(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `📋 РАССЫЛКА: ЗАДАНИЯ

📢 Предпросмотр сообщения:

────────────────────────

📋 **НОВЫЕ ЗАДАНИЯ ЖДУТ ТЕБЯ!**

💰 Зарабатывай звёзды, выполняя простые задания!

🎯 **Что тебя ждёт:**
✅ Подписки на каналы — до 10 ⭐
✅ Вступления в чаты — до 8 ⭐
✅ Запуски ботов — до 5 ⭐

⚡ **Быстро, просто, выгодно!**

🔥 Чем больше заданий выполнишь — тем больше звёзд получишь!

💎 Собирай звёзды и обменивай их на Telegram Premium!

────────────────────────

С кнопками: "🏠 Гла��ное мен��" и "📋 Задания"`;

        const keyboard = [
            [
                { text: '📤 ОТПРАВИТЬ ВСЕМ', callback_data: 'admin_broadcast_tasks_send' }
            ],
            [
                { text: '✏️ Редактировать', callback_data: 'admin_broadcast_tasks_edit' },
                { text: '🔙 Назад', callback_data: 'admin_broadcasts' }
            ]
        ];

        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
    }

    async sendTopWeekBroadcast(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            // Получаем всех пользователей
            const users = await this.db.all('SELECT id FROM users');

            await this.bot.sendMessage(chatId, `🚀 Начинаю рассылку "Топ недели"...
👥 Все��о пользователей: ${users.length}`);

            const broadcastMessage = `🏆 **ЕЖЕНЕДЕЛЬНЫЙ ТОП-РЕЙТИНГ!**

🔥 Соревнуйся с другими игроками и пол��чай крутые призы каждую неделю!

🎁 **Призы за топ позиции:**
🥇 1 место — 100 ⭐ звёзд
🥈 2 место — 75 ⭐ звёзд
🥉 3 место — 50 ⭐ звёзд
🏅 4 место — 25 ⭐ звёзд
🎖 5 место — 15 ⭐ звёзд

💪 Приглашай друзей, выполняй задания и поднимайся в рейтинге!

⏰ Подведение итогов каждое воскресенье в 20:00`;

            const broadcastKeyboard = {
                inline_keyboard: [
                    [
                        { text: '🏠 Главное меню', callback_data: 'main_menu' },
                        { text: '👥 Пригласить друга', callback_data: 'show_referral' }
                    ]
                ]
            };

            let successCount = 0;
            let failCount = 0;

            for (const user of users) {
                try {
                    await this.bot.sendMessage(user.id, broadcastMessage, {
                        parse_mode: 'Markdown',
                        reply_markup: broadcastKeyboard
                    });
                    successCount++;

                    // Небольшая задержка для избежания лимитов
                    if (successCount % 20 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    failCount++;
                    console.log(`Failed to send to user ${user.id}:`, error.message);
                }
            }

            await this.bot.sendMessage(chatId, `✅ Рассылка завершена!

📊 Статистика:
✅ Доставлено: ${successCount}
❌ Не доставлено: ${failCount}
👥 Всего: ${users.length}`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 К рассылкам', callback_data: 'admin_broadcasts' }
                    ]]
                }
            });

        } catch (error) {
            console.error('Error sending top week broadcast:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при отправке рассылки');
        }
    }

    async sendTasksBroadcast(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            // Получаем всех пользователей
            const users = await this.db.all('SELECT id FROM users');

            await this.bot.sendMessage(chatId, `🚀 Начинаю рас��ылку "Задания"...
👥 Всего пользователей: ${users.length}`);

            const broadcastMessage = `📋 **НОВЫЕ ЗАДАНИЯ ЖДУТ ТЕБЯ!**

💰 Зарабатывай звёзды, выполняя простые задания!

🎯 **Что тебя ждёт:**
✅ Подписки на каналы — до 10 ⭐
✅ Вступления в чаты — до 8 ⭐
✅ Запуски ботов — до 5 ⭐

⚡ **Быстро, просто, выгодно!**

🔥 Чем больше заданий выполнишь — т��м больше звёзд получишь!

💎 Собирай звёзды и обменивай их на Telegram Premium!`;

            const broadcastKeyboard = {
                inline_keyboard: [
                    [
                        { text: '🏠 Главное меню', callback_data: 'main_menu' },
                        { text: '📋 Задания', callback_data: 'menu_tasks' }
                    ]
                ]
            };

            let successCount = 0;
            let failCount = 0;

            for (const user of users) {
                try {
                    await this.bot.sendMessage(user.id, broadcastMessage, {
                        parse_mode: 'Markdown',
                        reply_markup: broadcastKeyboard
                    });
                    successCount++;

                    // Небольшая задержка для избежания лимитов
                    if (successCount % 20 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    failCount++;
                    console.log(`Failed to send to user ${user.id}:`, error.message);
                }
            }

            await this.bot.sendMessage(chatId, `✅ Рассылка завершена!

📊 Статистика:
✅ Доставлено: ${successCount}
❌ Не доставлено: ${failCount}
👥 Всего: ${users.length}`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 К рассылкам', callback_data: 'admin_broadcasts' }
                    ]]
                }
            });

        } catch (error) {
            console.error('Error sending tasks broadcast:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при отправке рассылки');
        }
    }

    async showCustomBroadcast(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `��️ Создание пользовательской рассылки

Отправьте текст сообщения для рассылки.

💡 Можно использовать Markdown форматирование:
• **жирный текст**
�� *курсив*
• \`код\`

После отправки текста вы сможете добавить кнопки.`;

        const keyboard = [
            [{ text: '🔙 Назад к рассылкам', callback_data: 'admin_broadcasts' }]
        ];

        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }

        // Устанавливаем состояние ожидания ввода рассылки
        this.waitingBroadcastInput = this.waitingBroadcastInput || {};
        this.waitingBroadcastInput[chatId] = true;
    }

    async showBroadcastHistory(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        const message = `📊 История рассылок

Пока что история рассылок не ведётся.
В будущих версиях здесь будет отображаться:

• Дата и время отправки
• Количество получателей
• Процент доставки
• Текст сообщения

Функция в разработке...`;

        const keyboard = [
            [{ text: '🔙 Назад к рассылкам', callback_data: 'admin_broadcasts' }]
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
    }

    async handleBroadcastInput(chatId, userId, text) {
        if (!this.isAdmin(userId)) return;

        try {
            // Предпросмотр сообщения
            const message = `📢 Предпросмотр польз��вательской рассылки:

───────────��────────────
${text}
────────────────────────

Отправить эту рассылку всем пользователям?`;

            const keyboard = [
                [{ text: '📤 ОТПРАВИТЬ ВСЕМ', callback_data: 'admin_broadcast_custom_send' }],
                [{ text: '❌ Отмена', callback_data: 'admin_broadcasts' }]
            ];

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });

            // Сохраняем текст для отправки
            this.customBroadcastText = this.customBroadcastText || {};
            this.customBroadcastText[chatId] = text;

        } catch (error) {
            console.error('Error handling broadcast input:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при обработке сообщения для рассылки');
        }
    }

    async sendCustomBroadcast(chatId, userId) {
        if (!this.isAdmin(userId)) return;

        try {
            const broadcastText = this.customBroadcastText && this.customBroadcastText[chatId];
            if (!broadcastText) {
                await this.bot.sendMessage(chatId, '❌ Текст рассылки не найден');
                return;
            }

            // Получаем всех пользователей
            const users = await this.db.all('SELECT id FROM users');

            await this.bot.sendMessage(chatId, `🚀 Начинаю пользовательскую рассылку...
👥 Всего пользователей: ${users.length}`);

            let successCount = 0;
            let failCount = 0;

            for (const user of users) {
                try {
                    await this.bot.sendMessage(user.id, broadcastText, {
                        parse_mode: 'Markdown'
                    });
                    successCount++;

                    // Небольшая задержка для избежания лимитов
                    if (successCount % 20 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    failCount++;
                    console.log(`Failed to send to user ${user.id}:`, error.message);
                }
            }

            await this.bot.sendMessage(chatId, `✅ Пользовательская рассылка завершена!

📊 Статистика:
✅ Доставлено: ${successCount}
❌ Не доставлено: ${failCount}
👥 Всего: ${users.length}`, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🔙 К рассылкам', callback_data: 'admin_broadcasts' }
                    ]]
                }
            });

            // Очищаем сохранённый текст
            if (this.customBroadcastText) {
                delete this.customBroadcastText[chatId];
            }

        } catch (error) {
            console.error('Error sending custom broadcast:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при отправке пользовательской рассылки');
        }
    }

    // Управление ежен��дельными наградами
    async showWeeklyRewardsManagement(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            // Получаем текущий топ-5
            const topUsers = await this.db.all(`
                SELECT
                    username,
                    first_name,
                    level1_referrals
                FROM users
                WHERE level1_referrals > 0
                ORDER BY level1_referrals DESC, registration_date ASC
                LIMIT 5
            `);

            let topList = '';
            const rewards = [100, 75, 50, 25, 15];
            const places = ['🥇', '🥈', '🥉', '🏅', '🎖'];

            if (topUsers.length > 0) {
                topList = '\n📊 **Текущий то��-5:**\n';
                topUsers.forEach((user, index) => {
                    const userName = user.username ? `@${user.username}` : user.first_name;
                    topList += `${places[index]} ${userName} — ${user.level1_referrals} реф. (${rewards[index]} ⭐)\n`;
                });
            } else {
                topList = '\n📊 Пользователей с рефералами пока нет';
            }

            const message = `🏆 Управление еженедельным�� наградами

⏰ **Автоматическое распределение:** каждое воскресенье в 20:00 по МСК

🎁 **Награды за места:**
🥇 1 место — 100 ⭐
🥈 2 место — 75 ⭐
🥉 3 место — 50 ⭐
🏅 4 место — 25 ⭐
🎖 5 место — 15 ⭐
${topList}`;

            const keyboard = [
                [
                    { text: '🏆 Распределить СЕЙЧАС', callback_data: 'admin_weekly_rewards_manual' }
                ],
                [
                    { text: '⏰ Время следующих наград', callback_data: 'admin_weekly_rewards_time' }
                ],
                [
                    { text: '📊 История наград', callback_data: 'admin_weekly_rewards_history' }
                ],
                [
                    { text: '🔙 Назад в админку', callback_data: 'admin_panel' }
                ]
            ];

            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        } catch (error) {
            console.error('Error showing weekly rewards management:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке управления наградами');
        }
    }

    async handleWeeklyRewardsCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        if (!this.isAdmin(userId)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, '❌ Нет доступа');
            return;
        }

        try {
            switch (data) {
                case 'admin_weekly_rewards_manual':
                    if (this.weeklyRewards) {
                        await this.weeklyRewards.manualDistributeRewards(chatId, userId);
                    } else {
                        await this.bot.sendMessage(chatId, '❌ Контроллер наград не инициализирован');
                    }
                    break;
                case 'admin_weekly_rewards_time':
                    if (this.weeklyRewards) {
                        await this.weeklyRewards.getNextRewardTime(chatId, userId);
                    } else {
                        await this.bot.sendMessage(chatId, '❌ Контроллер наград не инициализирован');
                    }
                    break;
                case 'admin_weekly_rewards_history':
                    await this.showWeeklyRewardsHistory(chatId, userId, msg.message_id);
                    break;
            }
        } catch (error) {
            console.error('Error handling weekly rewards callback:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, '❌ Ошибка обработки');
        }
    }

    async showWeeklyRewardsHistory(chatId, userId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            const weeklyRewards = await this.db.all(`
                SELECT
                    t.user_id,
                    u.username,
                    u.first_name,
                    t.amount,
                    t.description,
                    t.date
                FROM transactions t
                LEFT JOIN users u ON t.user_id = u.id
                WHERE t.type = 'weekly_reward'
                ORDER BY t.date DESC
                LIMIT 20
            `);

            let message = `📊 История еженедельных наград\n\n`;

            if (weeklyRewards.length === 0) {
                message += 'Награды ещё не распределялись.';
            } else {
                weeklyRewards.forEach((reward, index) => {
                    const userName = reward.username ? `@${reward.username}` : reward.first_name;
                    const date = new Date(reward.date).toLocaleDateString('ru-RU');
                    message += `${index + 1}. ${userName} — ${reward.amount} ⭐ (${date})\n`;
                });
            }

            const keyboard = [
                [{ text: '🔙 Назад к наградам', callback_data: 'admin_weekly_rewards' }]
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
            console.error('Error showing weekly rewards history:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке истории наград');
        }
    }

    getBoostTypeName(boostType) {
        const boostTypes = {
            'click': 'Буст клика',
            'referral_1': 'Буст реферала 1 ур.',
            'referral_2': 'Буст реферала 2 ур.',
            'task': 'Б��ст заданий'
        };
        return boostTypes[boostType] || 'Неизвестный тип';
    }

    // Обработка шаблонов питомцев
    async handlePetTemplate(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        if (!this.isAdmin(userId)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, '❌ Нет доступа');
            return;
        }

        const templates = {
            'admin_pet_template_cat': '🐱 Котик|Милый котик увеличивает ежедневный клик|50|click|1|10',
            'admin_pet_template_dog': '🐶 Пёсик|Верный пёсик приносит больш�� за рефералов|100|referral_1|2|10',
            'admin_pet_template_eagle': '🦅 Орёл|Гордый орёл усиливает рефералов 2 уровня|200|referral_2|3|10',
            'admin_pet_template_dragon': '🐲 Дракон|Могучий дракон увеличивает награды за задания|500|task|5|10'
        };

        const template = templates[data];
        if (!template) {
            await this.bot.answerCallbackQuery(callbackQuery.id, '❌ Неизвестный шаблон');
            return;
        }

        try {
            const [name, description, priceStr, boostType, multiplierStr, maxLevelStr] = template.split('|');
            const price = parseFloat(priceStr);
            const multiplier = parseFloat(multiplierStr);
            const maxLevel = parseInt(maxLevelStr);

            // Создаем питомца из шаблона
            await this.db.run(
                'INSERT INTO pets (name, description, base_price, boost_type, boost_multiplier, max_level) VALUES (?, ?, ?, ?, ?, ?)',
                [name, description, price, boostType, multiplier, maxLevel]
            );

            const boostTypeName = this.getBoostTypeName(boostType);

            await this.bot.editMessageText(`✅ **Питомец создан из шаблона!**

🐾 **${name}**
📝 ${description}
💰 Цена: ${price} ⭐
🚀 Буст: ${boostTypeName} (+${multiplier})
📊 Макс. уровень: ${maxLevel}

Питомец добавлен в магазин и доступен пользователям!`, {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '➕ Создать ещё', callback_data: 'admin_pet_create' },
                            { text: '📋 Все питомцы', callback_data: 'admin_pet_list' }
                        ],
                        [{ text: '🔙 К питомцам', callback_data: 'admin_pets' }]
                    ]
                }
            });

            await this.bot.answerCallbackQuery(callbackQuery.id, '✅ Питомец создан!');

        } catch (error) {
            console.error('Error creating pet from template:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, '❌ О��ибка при создании');

            if (error.message.includes('UNIQUE constraint failed')) {
                await this.bot.editMessageText('❌ Питомец с таким названием уже существует!', {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 К созданию', callback_data: 'admin_pet_create' }
                        ]]
                    }
                });
            }
        }
    }

    // Обработка быстрых действий с питомцами
    async handlePetQuickAction(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        if (!this.isAdmin(userId)) {
            await this.bot.answerCallbackQuery(callbackQuery.id, '❌ Нет доступа');
            return;
        }

        try {
            if (data.startsWith('admin_pet_price_')) {
                const parts = data.split('_');
                const petId = parseInt(parts[3]);
                const newPrice = parseFloat(parts[4]);

                await this.db.run('UPDATE pets SET base_price = ? WHERE id = ?', [newPrice, petId]);
                await this.bot.answerCallbackQuery(callbackQuery.id, `✅ Цена изменена на ${newPrice} ⭐`);

                // Обновляем форму редактирования
                await this.editPetForm(chatId, userId, petId, msg.message_id);

            } else if (data.startsWith('admin_pet_boost_')) {
                const parts = data.split('_');
                const petId = parseInt(parts[3]);
                const newBoost = parseFloat(parts[4]);

                await this.db.run('UPDATE pets SET boost_multiplier = ? WHERE id = ?', [newBoost, petId]);
                await this.bot.answerCallbackQuery(callbackQuery.id, `✅ Буст изменен на +${newBoost}`);

                // Обновляем форму редактирования
                await this.editPetForm(chatId, userId, petId, msg.message_id);

            } else if (data.startsWith('admin_pet_manual_')) {
                const petId = parseInt(data.split('_')[3]);

                const message = `✏️ **Ручное редактирование питомца**

Отправьте данные в формате:
\`НАЗВАНИЕ|ОПИС��НИЕ|ЦЕНА|ТИП_БУСТА|БУСТ|УРОВЕНЬ\`

**Типы бустов:**
• \`click\` — буст клика
• \`referral_1\` — буст рефералов 1 ур.
• \`referral_2\` — буст рефералов 2 ур.
• \`task\` — буст заданий

**Пример:**
\`🐱 Новый котик|Описание питомца|75|click|2|10\``;

                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Назад к питомцу', callback_data: `admin_pet_edit_${petId}` }
                        ]]
                    }
                });

                // Устанавливаем состояние ожидания ввода
                this.waitingPetInput = this.waitingPetInput || {};
                this.waitingPetInput[chatId] = `edit_${petId}`;
            }

        } catch (error) {
            console.error('Error handling pet quick action:', error);
            await this.bot.answerCallbackQuery(callbackQuery.id, '❌ Ошибка при выполнении действия');
        }
    }

    // Завершение лотереи вручную
    async finishLotteryManual(chatId, userId, lotteryId, messageId = null) {
        if (!this.isAdmin(userId)) return;

        try {
            // Получаем информацию о лотерее
            const lottery = await this.db.get('SELECT * FROM lotteries WHERE id = ? AND is_active = 1', [lotteryId]);

            if (!lottery) {
                await this.bot.sendMessage(chatId, '❌ Лотерея не найдена или уже завершена');
                return;
            }

            // Получаем участников
            const participants = await this.db.all(
                'SELECT user_id FROM lottery_tickets WHERE lottery_id = ?',
                [lotteryId]
            );

            if (participants.length === 0) {
                await this.bot.sendMessage(chatId, '❌ В лотерее нет участников');
                return;
            }

            // Выбираем случайного победителя
            const randomIndex = Math.floor(Math.random() * participants.length);
            const winner = participants[randomIndex];

            // Начисляем приз
            await this.db.run(
                'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                [lottery.total_pool, lottery.total_pool, winner.user_id]
            );

            // Логируем транзакцию
            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [winner.user_id, 'lottery_win', lottery.total_pool, `Выигрыш в лотерее: ${lottery.name}`]
            );

            // Деактивируем лотерею
            await this.db.run('UPDATE lotteries SET is_active = 0 WHERE id = ?', [lotteryId]);

            // Получаем информацию о победителе
            const winnerInfo = await this.db.get('SELECT username, first_name FROM users WHERE id = ?', [winner.user_id]);
            const winnerName = winnerInfo.username ? `@${winnerInfo.username}` : winnerInfo.first_name;

            const successMsg = `🏆 **ЛОТЕРЕЯ ЗАВЕРШЕНА!**

🎰 **${lottery.name}**
🎊 **Победитель:** ${winnerName}
💰 **Выигрыш:** ${lottery.total_pool.toFixed(2)} ⭐
👥 **Участников:** ${participants.length}

Победитель уведомлен и приз зачислен на баланс!`;

            // Уведомляем победителя
            try {
                await this.bot.sendMessage(winner.user_id, `🎉 **ПОЗДРАВЛЯЕМ С ПОБЕДОЙ!**

🏆 Вы выиграли в лотерее "${lottery.name}"!
💰 Выигрыш: ${lottery.total_pool.toFixed(2)} ⭐

💎 Приз зачислен на ваш баланс!
🎊 Удачи в новых лотереях!`);
            } catch (error) {
                console.log('Could not notify winner');
            }

            if (messageId) {
                await this.bot.editMessageText(successMsg, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🎰 Все лотереи', callback_data: 'admin_lottery_list' }],
                            [{ text: '🔙 К лотереям', callback_data: 'admin_lotteries' }]
                        ]
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, successMsg, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🎰 Все лотереи', callback_data: 'admin_lottery_list' }],
                            [{ text: '🔙 К лот��реям', callback_data: 'admin_lotteries' }]
                        ]
                    }
                });
            }

        } catch (error) {
            console.error('Error finishing lottery manually:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при завершении лотереи');
        }
    }
}

module.exports = AdminController;
