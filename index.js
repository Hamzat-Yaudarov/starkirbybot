require('dotenv').config();

console.log('🚀 Запуск StarKirby Bot...');
console.log('📁 Рабочая директория:', process.cwd());
console.log('🔧 Node.js версия:', process.version);
const TelegramBot = require('node-telegram-bot-api');
const Database = require('./database');
const UserController = require('./controllers/userController');
const TaskController = require('./controllers/taskController');
const ReferralController = require('./controllers/referralController');
const PetController = require('./controllers/petController');
const CaseController = require('./controllers/caseController');
const LotteryController = require('./controllers/lotteryController');
const WithdrawalController = require('./controllers/withdrawalController');
const PromoController = require('./controllers/promoController');
const RatingController = require('./controllers/ratingController');
const AdminController = require('./controllers/adminController');
const WeeklyRewardsController = require('./controllers/weeklyRewardsController');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// Проверяем наличие обязательных переменных
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден в переменных окружения!');
    console.error('Добавьте BOT_TOKEN в Variables в Railway');
    process.exit(1);
}

if (!ADMIN_CHAT_ID) {
    console.error('❌ ADMIN_CHAT_ID не найден в переменных окружения!');
    console.error('Добавьте ADMIN_CHAT_ID в Variables в Railway');
    process.exit(1);
}

console.log('✅ Переменные окружения загружены успешно');

// Helper function to safely edit or send message
async function safeEditMessage(bot, text, options) {
    try {
        if (options.message_id) {
            await bot.editMessageText(text, options);
        } else {
            const { message_id, ...sendOptions } = options;
            await bot.sendMessage(options.chat_id, text, sendOptions);
        }
    } catch (error) {
        // If edit fails because message is the same, do nothing
        if (error.message.includes('message is not modified') ||
            error.message.includes('exactly the same as a current content')) {
            return;
        }

        // If edit fails for other reasons, try to send new message
        if (options.message_id) {
            try {
                const { message_id, ...sendOptions } = options;
                await bot.sendMessage(options.chat_id, text, sendOptions);
            } catch (sendError) {
                console.error('Error sending fallback message:', sendError);
            }
        } else {
            console.error('Error sending message:', error);
        }
    }
}

// Helper function to send subscription required message
async function sendSubscriptionRequiredMessage(chatId, unsubscribedChannels) {
    let message = `📢 **Обязательная подписка**

Для использования бота необходимо подписаться на следующие каналы:

`;

    const keyboard = [];

    unsubscribedChannels.forEach((channel, index) => {
        message += `${index + 1}. **${channel.channel_name}**\n`;
        keyboard.push([{
            text: `📢 ${channel.channel_name}`,
            url: channel.channel_link
        }]);
    });

    message += `\n✅ После подписки нажмите кнопку "Проверить подписку"`;

    keyboard.push([{
        text: '✅ Проверить подписку',
        callback_data: 'check_subscriptions'
    }]);

    await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const db = new Database();

// Initialize controllers
const userController = new UserController(db, bot);
const taskController = new TaskController(db, bot);
const referralController = new ReferralController(db, bot);
const petController = new PetController(db, bot);
const caseController = new CaseController(db, bot);
const lotteryController = new LotteryController(db, bot);
const withdrawalController = new WithdrawalController(db, bot, ADMIN_CHAT_ID);
const promoController = new PromoController(db, bot);
const ratingController = new RatingController(db, bot);
const adminController = new AdminController(db, bot);
const weeklyRewardsController = new WeeklyRewardsController(db, bot);

// Связываем контроллеры
adminController.setWeeklyRewardsController(weeklyRewardsController);

// Main menu inline keyboard
const getMainMenu = () => ({
    reply_markup: {
        inline_keyboard: [
            [
                { text: '👤 Профиль', callback_data: 'menu_profile' },
                { text: '👆 Кликнуть', callback_data: 'menu_click' }
            ],
            [
                { text: '📋 Задания', callback_data: 'menu_tasks' },
                { text: '⭐ Получить звёзды', callback_data: 'menu_referral' }
            ],
            [
                { text: '📦 Кейс', callback_data: 'menu_cases' },
                { text: '🐾 Питомцы', callback_data: 'menu_pets' }
            ],
            [
                { text: '🏆 Рейтинги', callback_data: 'menu_ratings' },
                { text: '🎰 Лотереи', callback_data: 'menu_lotteries' }
            ],
            [
                { text: '🎫 Промокод', callback_data: 'menu_promo' },
                { text: '💰 Вывод', callback_data: 'menu_withdrawal' }
            ]
        ]
    }
});

// Start command
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username;
    const firstName = msg.from.first_name;
    const referralCode = match[1];

    try {
        // Check if user is banned
        const isBanned = await adminController.isUserBanned(userId);
        if (isBanned) {
            await bot.sendMessage(chatId, `🚫 Доступ запрещён

Ваш аккаунт заблокирован за нарушение правил.
Для разблокировки обратитесь к администратор��.`);
            return;
        }

        // Check mandatory channel subscriptions (skip for admin)
        if (!adminController.isAdmin(userId)) {
            const unsubscribedChannels = await adminController.checkMandatorySubscriptions(userId);
            if (unsubscribedChannels.length > 0) {
                await sendSubscriptionRequiredMessage(chatId, unsubscribedChannels);
                return;
            }
        }

        // Register or get user
        const user = await userController.registerUser(userId, username, firstName, referralCode);

        // If user is new and has a referrer, check if we need to process rewards immediately
        if (user.isNewUser && user.referrer_id) {
            const unsubscribedChannels = await adminController.checkMandatorySubscriptions(userId);
            if (unsubscribedChannels.length === 0) {
                // No mandatory channels - process rewards immediately
                await userController.processDelayedReferralRewards(userId);
            }
        }

        let welcomeMessage = `🌟 Добро пожаловать в Kirby Stars Farm!

👋 Привет, ${firstName}!

💫 **Платформа для заработка Telegram Stars**

🎯 **Возможност�� заработка:**
• 👆 Ежедневные клики — стабильный доход
• 📋 Выполнение заданий — быстрые награды
• 👥 Реферальная программа — пассивный доход
• 🐾 Питомцы — увеличение всех доходов
• 📦 Кейсы — случайные крупные призы
• 🎰 Лотереи — шанс на джекпот

💎 **Система вывода:**
От 15 ⭐ до Telegram Premium

🚀 Начн��те зараб��тывать прямо сейчас!`;

        // Get main menu keyboard
        let keyboard = getMainMenu();

        // Add admin button for admin user
        if (adminController.isAdmin(userId)) {
            welcomeMessage += `\n\n🔧 Доступна панель администратора`;
            keyboard.reply_markup.inline_keyboard.push([
                { text: '🔧 Админ-панель', callback_data: 'admin_panel' }
            ]);
        }

        await bot.sendMessage(chatId, welcomeMessage, keyboard);
    } catch (error) {
        console.error('Error in start command:', error);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при регистрации. Попробуйте позже.');
    }
});

// Handle menu buttons and text messages
bot.on('message', async (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        try {
            // Check if this is a reply to force_reply (like promo code input)
            if (msg.reply_to_message && msg.reply_to_message.text && msg.reply_to_message.text.includes('промокод')) {
                await promoController.handlePromoCode(chatId, userId, msg.text);
                return;
            }

            // Handle admin input states
            if (adminController.waitingPromoInput && adminController.waitingPromoInput[chatId]) {
                await adminController.handlePromoInput(chatId, userId, msg.text);
                delete adminController.waitingPromoInput[chatId];
                return;
            }

            if (adminController.waitingTaskInput && adminController.waitingTaskInput[chatId]) {
                await adminController.handleTaskInput(chatId, userId, msg.text);
                delete adminController.waitingTaskInput[chatId];
                return;
            }

            if (adminController.waitingChannelInput && adminController.waitingChannelInput[chatId]) {
                await adminController.handleChannelInput(chatId, userId, msg.text);
                delete adminController.waitingChannelInput[chatId];
                return;
            }

            if (adminController.waitingPetInput && adminController.waitingPetInput[chatId]) {
                const action = adminController.waitingPetInput[chatId];
                if (action === 'create') {
                    await adminController.handlePetInput(chatId, userId, msg.text, 'create');
                } else if (action.startsWith('edit_')) {
                    const petId = parseInt(action.split('_')[1]);
                    await adminController.handlePetEdit(chatId, userId, msg.text, petId);
                }
                delete adminController.waitingPetInput[chatId];
                return;
            }

            if (adminController.waitingLotteryInput && adminController.waitingLotteryInput[chatId]) {
                await adminController.handleLotteryInput(chatId, userId, msg.text);
                delete adminController.waitingLotteryInput[chatId];
                return;
            }

            if (adminController.waitingDeleteInput && adminController.waitingDeleteInput[chatId]) {
                await adminController.handleDeleteInput(chatId, userId, msg.text);
                delete adminController.waitingDeleteInput[chatId];
                return;
            }

            if (adminController.waitingBroadcastInput && adminController.waitingBroadcastInput[chatId]) {
                await adminController.handleBroadcastInput(chatId, userId, msg.text);
                delete adminController.waitingBroadcastInput[chatId];
                return;
            }

            // Handle rejection reason for admin
            if (withdrawalController.pendingRejections && withdrawalController.pendingRejections[chatId]) {
                const withdrawalId = withdrawalController.pendingRejections[chatId];
                const success = await withdrawalController.rejectWithdrawal(withdrawalId, msg.text);
                if (success) {
                    await bot.sendMessage(chatId, `✅ Заявка #${withdrawalId} отклонена с причиной: ${msg.text}`);
                }
                delete withdrawalController.pendingRejections[chatId];
                return;
            }

            // Check if it looks like a promo code (3+ characters, alphanumeric)
            if (msg.text.length >= 3 && /^[A-Za-z0-9]+$/.test(msg.text)) {
                // Check if user exists in database (avoid processing promokods for new users)
                const user = await userController.db.get('SELECT id FROM users WHERE id = ?', [userId]);
                if (!user) {
                    // User doesn't exist yet, don't process as promo code
                    await bot.sendMessage(chatId, '🤖 Добро пожаловать! Нажмите /start для начала работы с ботом.');
                    return;
                }

                // Check if user is banned before processing
                const isBanned = await adminController.isUserBanned(userId);
                if (isBanned) {
                    await bot.sendMessage(chatId, '🚫 Ваш аккаунт заблокирован');
                    return;
                }
                await promoController.handlePromoCode(chatId, userId, msg.text);
            } else {
                // Get main menu keyboard
                let keyboard = getMainMenu();

                // Add admin button for admin user
                if (adminController.isAdmin(userId)) {
                    keyboard.reply_markup.inline_keyboard.push([
                        { text: '🔧 Админ-панел��', callback_data: 'admin_panel' }
                    ]);
                }

                await bot.sendMessage(chatId, '❓ Команда не распознана. Используйте кнопки меню для навигации.', keyboard);
            }
        } catch (error) {
            console.error('Error handling message:', error);
            await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте позже.');
        }
    }
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;
    const userId = callbackQuery.from.id;

    try {
        if (data.startsWith('task_')) {
            await taskController.handleTaskCallback(callbackQuery);
        } else if (data.startsWith('pet_')) {
            await petController.handlePetCallback(callbackQuery);
        } else if (data.startsWith('case_')) {
            await caseController.handleCaseCallback(callbackQuery);
        } else if (data.startsWith('lottery_')) {
            await lotteryController.handleLotteryCallback(callbackQuery);
        } else if (data.startsWith('withdraw_')) {
            await withdrawalController.handleWithdrawalCallback(callbackQuery);
        } else if (data.startsWith('admin_withdraw_')) {
            await withdrawalController.handleAdminCallback(callbackQuery);
        } else if (data.startsWith('admin_')) {
            await adminController.handleAdminCallback(callbackQuery);
        } else if (data.startsWith('rating_')) {
            await ratingController.handleRatingCallback(callbackQuery);
        } else if (data.startsWith('promo_')) {
            await promoController.handlePromoCallback(callbackQuery);
        } else if (data === 'show_referral') {
            await referralController.showReferralInfo(chatId, userId);
        } else if (data === 'main_menu') {
            // Get main menu keyboard
            let keyboard = getMainMenu();

            // Add admin button for admin user
            if (adminController.isAdmin(userId)) {
                keyboard.reply_markup.inline_keyboard.push([
                    { text: '🔧 Админ-панель', callback_data: 'admin_panel' }
                ]);
            }

            await bot.editMessageText('🏠 **Главное меню**\n\nВыберите действие:', {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        } else if (data === 'check_subscriptions') {
            // Check subscription status
            if (!adminController.isAdmin(userId)) {
                const unsubscribedChannels = await adminController.checkMandatorySubscriptions(userId);
                if (unsubscribedChannels.length > 0) {
                    await bot.answerCallbackQuery(callbackQuery.id, '❌ Вы еще не подписались на все каналы', true);
                    return;
                } else {
                    await bot.answerCallbackQuery(callbackQuery.id, '✅ Подписки проверены!', true);

                    // Process delayed referral rewards when user successfully subscribes
                    await userController.processDelayedReferralRewards(userId);

                    // Show main menu
                    let keyboard = getMainMenu();
                    if (adminController.isAdmin(userId)) {
                        keyboard.reply_markup.inline_keyboard.push([
                            { text: '🔧 Админ-панель', callback_data: 'admin_panel' }
                        ]);
                    }
                    await bot.editMessageText('✅ **Подписки подтверждены!**\n\nТеперь вы можете пользоваться ботом.', {
                        chat_id: chatId,
                        message_id: msg.message_id,
                        parse_mode: 'Markdown',
                        reply_markup: keyboard.reply_markup
                    });
                }
            }
        } else if (data.startsWith('menu_')) {
            // Handle main menu callbacks
            const menuAction = data.split('_')[1];

            // Check if user is banned before processing
            const isBanned = await adminController.isUserBanned(userId);
            if (isBanned) {
                await bot.answerCallbackQuery(callbackQuery.id, '🚫 Ваш аккаунт заблокирован', true);
                return;
            }

            // Check mandatory channel subscriptions (skip for admin)
            if (!adminController.isAdmin(userId)) {
                const unsubscribedChannels = await adminController.checkMandatorySubscriptions(userId);
                if (unsubscribedChannels.length > 0) {
                    await bot.answerCallbackQuery(callbackQuery.id, '📢 Необходимо подписаться на каналы', true);
                    await sendSubscriptionRequiredMessage(chatId, unsubscribedChannels);
                    return;
                }
            }

            switch (menuAction) {
                case 'profile':
                    await userController.showProfile(chatId, userId, msg.message_id);
                    break;
                case 'click':
                    await userController.dailyClick(chatId, userId, msg.message_id);
                    break;
                case 'tasks':
                    await taskController.showTasks(chatId, userId, msg.message_id);
                    break;
                case 'referral':
                    await referralController.showReferralInfo(chatId, userId, msg.message_id);
                    break;
                case 'cases':
                    await caseController.showCases(chatId, userId, msg.message_id);
                    break;
                case 'pets':
                    await petController.showPets(chatId, userId, msg.message_id);
                    break;
                case 'ratings':
                    await ratingController.showRatings(chatId, userId, msg.message_id);
                    break;
                case 'lotteries':
                    await lotteryController.showLotteries(chatId, userId, msg.message_id);
                    break;
                case 'promo':
                    await promoController.showPromoInfo(chatId, userId, msg.message_id);
                    break;
                case 'withdrawal':
                    await withdrawalController.showWithdrawal(chatId, userId, msg.message_id);
                    break;
            }
        }

        await bot.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
        console.error('Error handling callback query:', error);
        try {
            // Try to answer callback query first to remove loading state
            await bot.answerCallbackQuery(callbackQuery.id, '❌ Произошла ошибка');
        } catch (answerError) {
            // Ignore if callback query is too old
            if (!answerError.message.includes('query is too old')) {
                console.error('Error answering callback query:', answerError);
            }
        }
    }
});

// Initialize database and start bot
async function init() {
    try {
        console.log('🔌 Initializing database...');
        await db.init();
        console.log('✅ Database initialized successfully');
        console.log('🤖 Bot started successfully!');
        console.log('📱 Bot username: @kirbystarsfarmbot');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
}

init();

module.exports = { bot, db };
