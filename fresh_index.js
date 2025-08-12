require('dotenv').config();

console.log('🚀 Запуск НОВОГО StarKirby Bot...');
console.log('📁 Рабочая директория:', process.cwd());

const TelegramBot = require('node-telegram-bot-api');
const Database = require('./database');

const BOT_TOKEN = process.env.BOT_TOKEN;

// Проверяем токен
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не найден!');
    process.exit(1);
}

console.log('✅ Токен загружен, инициализируем бота...');

// Создаём бота
const bot = new TelegramBot(BOT_TOKEN, {
    polling: true
});

// Создаём базу данных
const db = new Database();

// Простое логирование
function log(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] BOT: ${message}`, data ? JSON.stringify(data) : '');
}

// Генерация реферального кода
function generateReferralCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Главное меню
function getMainMenu() {
    return {
        inline_keyboard: [
            [
                { text: '👤 Профиль', callback_data: 'profile' },
                { text: '👆 Кликнуть', callback_data: 'daily_click' }
            ],
            [
                { text: '📋 Задания', callback_data: 'tasks' },
                { text: '⭐ Получить звёзды', callback_data: 'referrals' }
            ],
            [
                { text: '📦 Кейс', callback_data: 'cases' },
                { text: '🐾 Питомцы', callback_data: 'pets' }
            ],
            [
                { text: '🏆 Рейтинги', callback_data: 'ratings' },
                { text: '🎰 Лотереи', callback_data: 'lotteries' }
            ],
            [
                { text: '🎫 Промокод', callback_data: 'promo' },
                { text: '💰 Вывод', callback_data: 'withdrawal' }
            ]
        ]
    };
}

// Регистрация пользователя
async function registerUser(userId, username, firstName, referralCode = null) {
    try {
        log('Регистрация пользователя', { userId, username, firstName, referralCode });

        // Проверяем существование
        const existingUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (existingUser) {
            log('Пользователь уже существует', { userId });
            return existingUser;
        }

        // Генерируем реферальный код
        let userReferralCode;
        let isUnique = false;
        while (!isUnique) {
            userReferralCode = generateReferralCode();
            const existing = await db.get('SELECT id FROM users WHERE referral_code = ?', [userReferralCode]);
            if (!existing) {
                isUnique = true;
            }
        }

        // Ищем пригласившего
        let referrerId = null;
        if (referralCode) {
            const referrer = await db.get('SELECT id FROM users WHERE referral_code = ?', [referralCode]);
            if (referrer) {
                referrerId = referrer.id;
                log('Найден пригласивший', { referrerId });
            }
        }

        // Создаём пользователя
        await db.run(
            'INSERT INTO users (id, username, first_name, balance, referrer_id, referral_code, level1_referrals, level2_referrals, total_earned, last_click_date, cases_opened_today, last_case_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, username, firstName, 0, referrerId, userReferralCode, 0, 0, 0, null, 0, null]
        );

        log('Пользователь создан', { userId, userReferralCode });

        // Обрабатываем реферальную награду
        if (referrerId) {
            await processReferralReward(userId, referrerId);
        }

        return await db.get('SELECT * FROM users WHERE id = ?', [userId]);

    } catch (error) {
        log('Ошибка регистрации', { error: error.message, userId });
        throw error;
    }
}

// Обработка реферальной награды
async function processReferralReward(newUserId, referrerId) {
    try {
        log('Обработка реферальной награды', { newUserId, referrerId });

        // Награждаем пригласившего
        await db.run(
            'UPDATE users SET balance = balance + 3, total_earned = total_earned + 3, level1_referrals = level1_referrals + 1 WHERE id = ?',
            [referrerId]
        );

        // Записываем транзакцию
        await db.run(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            [referrerId, 'referral', 3, `Новый реферал (ID: ${newUserId})`]
        );

        log('Реферальная награда ��ыдана', { referrerId, amount: 3 });

        // Уведомляем пригласившего
        try {
            await bot.sendMessage(referrerId, `🎉 **НОВЫЙ РЕФЕРАЛ!**

👤 По вашей ссылке зарегистрировался новый пользователь!

💰 **Награда:** +3 ⭐

🔥 Продолжайте приглашать друзей!`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '👤 Мой профиль', callback_data: 'profile' }],
                        [{ text: '⭐ Пригласить ещё', callback_data: 'referrals' }]
                    ]
                }
            });
        } catch (notificationError) {
            log('Ошибка уведомления', { error: notificationError.message });
        }

        // Проверяем реферала 2 уровня
        const referrer = await db.get('SELECT referrer_id FROM users WHERE id = ?', [referrerId]);
        if (referrer && referrer.referrer_id) {
            log('Обработка реферала 2 уровня', { level2ReferrerId: referrer.referrer_id });

            await db.run(
                'UPDATE users SET balance = balance + 0.05, total_earned = total_earned + 0.05, level2_referrals = level2_referrals + 1 WHERE id = ?',
                [referrer.referrer_id]
            );

            await db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [referrer.referrer_id, 'referral', 0.05, `Реферал 2 уровня (ID: ${newUserId})`]
            );

            // Уведомляем реферала 2 уровня
            try {
                await bot.sendMessage(referrer.referrer_id, `🎉 **РЕФЕРАЛ 2 УРОВНЯ!**

👥 Ваш реферал п��ивёл друга!

💰 **Награда:** +0.05 ⭐

🔥 Приглашайте больше друзей!`, {
                    parse_mode: 'Markdown'
                });
            } catch (notificationError) {
                log('Ошибка уведомления 2 уровня', { error: notificationError.message });
            }
        }

    } catch (error) {
        log('Ошибка обработки реферальной награды', { error: error.message, newUserId, referrerId });
    }
}

// Показать профиль
async function showProfile(chatId, userId, messageId = null) {
    try {
        log('Показ профиля', { userId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        const profileMessage = `👤 **Ваш профиль**

💰 **Баланс:** ${user.balance.toFixed(2)} ⭐
💎 **Общий заработок:** ${user.total_earned.toFixed(2)} ⭐

👥 **Рефералы:**
├ Уровень 1: ${user.level1_referrals} человек
└ Уровень 2: ${user.level2_referrals} человек

🔗 **Ваша реферальная ссылка:**
\`https://t.me/kirbystarsfarmbot?start=${user.referral_code}\`

💡 Поделитесь ссылкой с друзьями!`;

        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👆 Кликнуть', callback_data: 'daily_click' }],
                    [{ text: '⭐ Пригласить друзей', callback_data: 'referrals' }],
                    [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                ]
            }
        };

        if (messageId) {
            try {
                await bot.editMessageText(profileMessage, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
            } catch (editError) {
                await bot.sendMessage(chatId, profileMessage, options);
            }
        } else {
            await bot.sendMessage(chatId, profileMessage, options);
        }

    } catch (error) {
        log('Ошибка показа профиля', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке профиля');
    }
}

// Ежедневный клик
async function dailyClick(chatId, userId, messageId = null) {
    try {
        log('Ежедневный клик', { userId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        if (user.last_click_date === today) {
            log('Уже кликал сегодня', { userId });
            await bot.sendMessage(chatId, '⏰ Вы уже получили награду за клик сегодня! Приходите завтра.');
            return;
        }

        const reward = 0.1;

        // Начисляем награду
        await db.run(
            'UPDATE users SET balance = balance + ?, total_earned = total_earned + ?, last_click_date = ? WHERE id = ?',
            [reward, reward, today, userId]
        );

        // Записываем транзакцию
        await db.run(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            [userId, 'click', reward, 'Ежедневный клик']
        );

        log('Награда за клик начислена', { userId, reward });

        const successMessage = `🎉 **Ежедневная награда получена!**

💰 **Получено:** +${reward} ⭐

⏰ Следующий клик будет доступен завтра!
🚀 Приглашайте друзей для большего заработка!`;

        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👤 Мой профиль', callback_data: 'profile' }],
                    [{ text: '⭐ Пригласить друзей', callback_data: 'referrals' }],
                    [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                ]
            }
        };

        if (messageId) {
            try {
                await bot.editMessageText(successMessage, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
            } catch (editError) {
                await bot.sendMessage(chatId, successMessage, options);
            }
        } else {
            await bot.sendMessage(chatId, successMessage, options);
        }

    } catch (error) {
        log('Ошибка ежедневного клика', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Ошибка при получении награды');
    }
}

// П��казать реферальную информацию
async function showReferrals(chatId, userId, messageId = null) {
    try {
        log('Показ реферальной информации', { userId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        const referralMessage = `⭐ **Приглашай друзей и зарабатывай!**

🎯 **Как это работает:**
• За каждого приглашённого друга: **+3 ⭐**
• За каждого друга ваших друзей: **+0.05 ⭐**

📊 **Ваша статис��ика:**
👥 Рефералы 1 уровня: ${user.level1_referrals}
👥 Рефералы 2 уровня: ${user.level2_referrals}
💰 Текущий баланс: ${user.balance.toFixed(2)} ⭐

🔗 **Ваша реферальная ссылка:**
https://t.me/kirbystarsfarmbot?start=${user.referral_code}

📲 Отправьте эту ссылку друзьям!`;

        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📤 Поделиться ссылкой', switch_inline_query: `🌟 Присоединяйся к Kirby Stars Farm!\n\n🎁 Регистрируйся по моей ссылке: https://t.me/kirbystarsfarmbot?start=${user.referral_code}` }],
                    [{ text: '👤 Мой профиль', callback_data: 'profile' }],
                    [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                ]
            }
        };

        if (messageId) {
            try {
                await bot.editMessageText(referralMessage, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
            } catch (editError) {
                await bot.sendMessage(chatId, referralMessage, options);
            }
        } else {
            await bot.sendMessage(chatId, referralMessage, options);
        }

    } catch (error) {
        log('Ошибка показа рефералов', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке реферальной информации');
    }
}

// Обработка текстовых сообщений (промокоды)
bot.on('message', async (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text.trim();

        try {
            // Проверяем, что это может быть промокод (3+ символа, буквы и цифры)
            if (text.length >= 3 && /^[A-Za-z0-9]+$/.test(text)) {
                log('Попытка использования промокода', { userId, code: text });
                await usePromoCode(chatId, userId, text);
            } else {
                // Показываем главное меню для других сообщений
                await bot.sendMessage(chatId, '🤖 Используйте кнопки меню для навигации:', {
                    reply_markup: getMainMenu()
                });
            }
        } catch (error) {
            log('Ошибка обработки сообщения', { error: error.message, userId, text });
            await bot.sendMessage(chatId, '❌ Произошла ошибка');
        }
    }
});

// Команда /start
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username;
    const firstName = msg.from.first_name;
    const referralCode = match[1];

    try {
        log('Команда /start', { userId, username, firstName, referralCode });

        // Регистрируем пользователя
        const user = await registerUser(userId, username, firstName, referralCode);

        const welcomeMessage = `🌟 **Добро пожаловать в Kirby Stars Farm!**

👋 Привет, ${firstName}!

💫 **Платформа для заработка Telegram Stars**

🎯 **Возможности заработка:**
• 👆 Ежедневные клики — 0.1 ⭐ в день
• 📋 Выполнение заданий — быстрые награды
• 👥 Реферальная программа — 3 ⭐ за друга
• 📦 Кейсы — случайные призы
• 🐾 Питомцы — увеличение доходов

🚀 Начните зарабатывать прямо сейчас!`;

        await bot.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'Markdown',
            reply_markup: getMainMenu()
        });

    } catch (error) {
        log('Ошибка в /start', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Произошла ошибка при рег��страции');
    }
});

// Обработка callback-ов
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;
    const userId = callbackQuery.from.id;

    log('Callback', { data, userId });

    try {
        // Отвечаем на callback
        await bot.answerCallbackQuery(callbackQuery.id);

        // Основные разделы
        if (data === 'profile') {
            await showProfile(chatId, userId, msg.message_id);
        } else if (data === 'daily_click') {
            await dailyClick(chatId, userId, msg.message_id);
        } else if (data === 'referrals') {
            await showReferrals(chatId, userId, msg.message_id);
        } else if (data === 'tasks') {
            await showTasks(chatId, userId, msg.message_id);
        } else if (data === 'cases') {
            await showCases(chatId, userId, msg.message_id);
        } else if (data === 'pets') {
            await showPets(chatId, userId, msg.message_id);
        } else if (data === 'ratings') {
            await showRatings(chatId, userId, msg.message_id);
        } else if (data === 'lotteries') {
            await showLotteries(chatId, userId, msg.message_id);
        } else if (data === 'promo') {
            await showPromo(chatId, userId, msg.message_id);
        } else if (data === 'withdrawal') {
            await showWithdrawal(chatId, userId, msg.message_id);
        }
        // Задания
        else if (data.startsWith('task_complete_')) {
            const taskId = parseInt(data.split('_')[2]);
            await completeTask(chatId, userId, taskId);
        }
        // Кейсы
        else if (data === 'open_case') {
            await openCase(chatId, userId);
        }
        // Питомцы
        else if (data === 'pets_shop') {
            await showPetShop(chatId, userId, msg.message_id);
        } else if (data.startsWith('pet_buy_')) {
            const petId = parseInt(data.split('_')[2]);
            await buyPet(chatId, userId, petId);
        }
        // Лотереи
        else if (data.startsWith('lottery_buy_')) {
            const lotteryId = parseInt(data.split('_')[2]);
            await buyLotteryTicket(chatId, userId, lotteryId);
        }
        // Вывод
        else if (data.startsWith('withdraw_')) {
            const type = data.split('_')[1];
            await createWithdrawal(chatId, userId, type);
        }
        // Главное меню
        else if (data === 'main_menu') {
            try {
                await bot.editMessageText('🏠 **Главное меню**\n\nВыберите действие:', {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: getMainMenu()
                });
            } catch (editError) {
                await bot.sendMessage(chatId, '🏠 **Главное меню**\n\nВыберите действие:', {
                    parse_mode: 'Markdown',
                    reply_markup: getMainMenu()
                });
            }
        }
        // Неизвестный callback
        else {
            log('Неизвестный callback', { data });
        }

    } catch (error) {
        log('Ошибка в callback', { error: error.message, data, userId });
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
});

// Показать задания
async function showTasks(chatId, userId, messageId = null) {
    try {
        log('Показ заданий', { userId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        // Получаем все задания
        const allTasks = await db.all('SELECT * FROM tasks ORDER BY reward ASC');

        // Получаем выполненные задания пользователя
        const completedTasks = await db.all('SELECT task_id FROM user_tasks WHERE user_id = ?', [userId]);
        const completedIds = completedTasks.map(t => t.task_id);

        // Находим первое невыполненное задание
        const currentTask = allTasks.find(task => !completedIds.includes(task.id));

        let message = `📋 **Задания**

💰 Ваш баланс: ${user.balance.toFixed(2)} ⭐
✅ Выполнено: ${completedIds.length}/${allTasks.length}

`;

        const keyboard = [];

        if (currentTask) {
            message += `🎯 **Текущее задание:**

**${currentTask.title}**
${currentTask.description}

💰 **Награда:** ${currentTask.reward} ⭐

🔗 **Ссылка:** ${currentTask.target_link}`;

            keyboard.push([{ text: '✅ Выполнил задание', callback_data: `task_complete_${currentTask.id}` }]);
            keyboard.push([{ text: '🔗 Перейти по ссылке', url: currentTask.target_link }]);
        } else {
            message += `🎉 **Поздравляем!**

Вы выполнили все доступные задания!
Ожидайте новых заданий.`;
        }

        keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main_menu' }]);

        const options = {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        };

        if (messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
            } catch (editError) {
                await bot.sendMessage(chatId, message, options);
            }
        } else {
            await bot.sendMessage(chatId, message, options);
        }

    } catch (error) {
        log('Ошибка показа заданий', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке заданий');
    }
}

// Выполнение задания
async function completeTask(chatId, userId, taskId) {
    try {
        log('Выполнение задания', { userId, taskId });

        // Проверяем задание
        const task = await db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
        if (!task) {
            await bot.sendMessage(chatId, '❌ Задание не найдено');
            return;
        }

        // ��роверяем, не выполнено ли уже
        const completed = await db.get('SELECT id FROM user_tasks WHERE user_id = ? AND task_id = ?', [userId, taskId]);
        if (completed) {
            await bot.sendMessage(chatId, '❌ Вы уже выполнили это задание');
            return;
        }

        // Отмечаем как выполненное
        await db.run('INSERT INTO user_tasks (user_id, task_id) VALUES (?, ?)', [userId, taskId]);

        // Начисляем награду
        await db.run(
            'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
            [task.reward, task.reward, userId]
        );

        // Записываем транзакцию
        await db.run(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            [userId, 'task', task.reward, `Задание: ${task.title}`]
        );

        log('Задание выполнено', { userId, taskId, reward: task.reward });

        await bot.sendMessage(chatId, `🎉 **Задание выполнено!**

✅ **Задание:** ${task.title}
💰 **Получено:** +${task.reward} ⭐

🚀 Переходите к следующему заданию!`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📋 Следующее задание', callback_data: 'tasks' }],
                    [{ text: '👤 Мой профиль', callback_data: 'profile' }]
                ]
            }
        });

    } catch (error) {
        log('Ошибка выполнения задания', { error: error.message, userId, taskId });
        await bot.sendMessage(chatId, '❌ Ошибка при выполнении задания');
    }
}

// Показать кейсы
async function showCases(chatId, userId, messageId = null) {
    try {
        log('Показ кейсов', { userId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        const canOpenCase = user.level1_referrals >= 3 && user.last_case_date !== today;

        let message = `📦 **Кейсы**

💰 Ваш баланс: ${user.balance.toFixed(2)} ⭐
👥 Рефералы: ${user.level1_referrals}

`;

        const keyboard = [];

        if (canOpenCase) {
            message += `🎁 **Доступен кейс!**

��� У вас 3+ рефералов
✅ Сегодня ещё не открывали кейс

🎲 Откройте кейс и получите случайную награду!`;

            keyboard.push([{ text: '🎁 Открыть кейс', callback_data: 'open_case' }]);
        } else if (user.level1_referrals < 3) {
            message += `🔒 **Кейс недоступен**

❌ Нужно 3+ рефералов (у вас: ${user.level1_referrals})

💡 Пригласите больше друзей для доступа к кейсам!`;

            keyboard.push([{ text: '⭐ Пригласить друзей', callback_data: 'referrals' }]);
        } else {
            message += `⏰ **Кейс уже открыт сегодня**

Приходите завтра за новым кейсом!`;
        }

        keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main_menu' }]);

        const options = {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        };

        if (messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
            } catch (editError) {
                await bot.sendMessage(chatId, message, options);
            }
        } else {
            await bot.sendMessage(chatId, message, options);
        }

    } catch (error) {
        log('Ошибка показа кейсов', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке кейсов');
    }
}

// Открытие кейса
async function openCase(chatId, userId) {
    try {
        log('Открытие кейса', { userId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        // Проверки
        if (user.level1_referrals < 3) {
            await bot.sendMessage(chatId, '❌ Нужно 3+ рефералов для открытия кейса');
            return;
        }

        if (user.last_case_date === today) {
            await bot.sendMessage(chatId, '❌ Вы уже открывали кейс сегодня');
            return;
        }

        // Генерируем случайную награду
        const rewards = [0.5, 1, 2, 3, 5, 10];
        const reward = rewards[Math.floor(Math.random() * rewards.length)];

        // Начисляем награду
        await db.run(
            'UPDATE users SET balance = balance + ?, total_earned = total_earned + ?, last_case_date = ? WHERE id = ?',
            [reward, reward, today, userId]
        );

        // Записываем транзакцию
        await db.run(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            [userId, 'case', reward, 'Награда из кейса']
        );

        log('Кейс открыт', { userId, reward });

        await bot.sendMessage(chatId, `🎁 **КЕЙС ОТКРЫТ!**

💎 **Вы получили:** ${reward} ⭐

🎉 Поздравляем с выигрышем!
⏰ Следующий кейс будет доступен завтра.`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👤 Мой профиль', callback_data: 'profile' }],
                    [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                ]
            }
        });

    } catch (error) {
        log('Ошибка открытия кейса', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Ошибка при открытии кейса');
    }
}

// Показать питомцев
async function showPets(chatId, userId, messageId = null) {
    try {
        log('Показ питомцев', { userId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        // Получаем питомцев пользователя
        const userPets = await db.all(`
            SELECT up.id as user_pet_id, up.level, p.name, p.description, p.boost_multiplier, p.base_price, p.max_level, p.boost_type
            FROM user_pets up
            JOIN pets p ON up.pet_id = p.id
            WHERE up.user_id = ?
            ORDER BY up.id ASC
        `, [userId]);

        let message = `🐾 **Ваши питомцы**

💰 Баланс: ${user.balance.toFixed(2)} ⭐

`;

        const keyboard = [];

        if (userPets.length === 0) {
            message += `😔 У вас пока нет питомцев

🎯 Питомцы увеличивают ваш доход от кликов и заданий!

💡 Купите сво��го первого питомца!`;
        } else {
            message += `👥 Ваши питомцы:\n\n`;
            userPets.forEach((pet, index) => {
                const levelBoost = pet.boost_multiplier * pet.level;
                message += `${index + 1}. ${pet.name} (Ур.${pet.level}/${pet.max_level})
   📈 Буст: +${(levelBoost * 100).toFixed(1)}%
   🎯 Тип: ${pet.boost_type}

`;
            });

            keyboard.push([{ text: '⬆️ Улучшить питомцев', callback_data: 'pets_upgrade' }]);
        }

        keyboard.push([{ text: '🛒 Купить питомца', callback_data: 'pets_shop' }]);
        keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main_menu' }]);

        const options = {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        };

        if (messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
            } catch (editError) {
                await bot.sendMessage(chatId, message, options);
            }
        } else {
            await bot.sendMessage(chatId, message, options);
        }

    } catch (error) {
        log('Ошибка показа питомцев', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке питомцев');
    }
}

// Магазин питомцев
async function showPetShop(chatId, userId, messageId = null) {
    try {
        log('Показ магазина питомцев', { userId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        // Получаем всех питомцев
        const allPets = await db.all('SELECT * FROM pets ORDER BY base_price ASC');

        // Получаем уже купленных питомцев
        const ownedPets = await db.all('SELECT pet_id FROM user_pets WHERE user_id = ?', [userId]);
        const ownedIds = ownedPets.map(p => p.pet_id);

        let message = `🛒 **Магазин питомцев**

💰 Ваш баланс: ${user.balance.toFixed(2)} ⭐

🐾 **Доступные питомцы:**

`;

        const keyboard = [];

        allPets.forEach((pet, index) => {
            const isOwned = ownedIds.includes(pet.id);
            const canAfford = user.balance >= pet.base_price;

            let status = '';
            if (isOwned) {
                status = ' ✅ КУПЛЕН';
            } else if (!canAfford) {
                status = ' 💸 Недостаточно звёзд';
            }

            message += `${index + 1}. **${pet.name}** - ${pet.base_price} ⭐${status}
   📈 Буст: +${(pet.boost_multiplier * 100).toFixed(1)}%
   🎯 Тип: ${pet.boost_type}
   📝 ${pet.description}

`;

            // Добавляем кнопку покупки
            if (!isOwned && canAfford) {
                keyboard.push([{
                    text: `🛒 Купить ${pet.name} (${pet.base_price} ⭐)`,
                    callback_data: `pet_buy_${pet.id}`
                }]);
            }
        });

        keyboard.push([{ text: '🐾 Мои питомцы', callback_data: 'pets' }]);
        keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main_menu' }]);

        const options = {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        };

        if (messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
            } catch (editError) {
                await bot.sendMessage(chatId, message, options);
            }
        } else {
            await bot.sendMessage(chatId, message, options);
        }

    } catch (error) {
        log('Ошибка показа магазина питомцев', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке магазина');
    }
}

// Покупка питомца
async function buyPet(chatId, userId, petId) {
    try {
        log('Покупка питомца', { userId, petId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        const pet = await db.get('SELECT * FROM pets WHERE id = ?', [petId]);

        if (!user || !pet) {
            await bot.sendMessage(chatId, '❌ Пользователь или питомец не найден');
            return;
        }

        // Проверки
        const existingPet = await db.get('SELECT id FROM user_pets WHERE user_id = ? AND pet_id = ?', [userId, petId]);
        if (existingPet) {
            await bot.sendMessage(chatId, '❌ У вас уже есть этот питомец');
            return;
        }

        if (user.balance < pet.base_price) {
            await bot.sendMessage(chatId, `❌ Недостаточно звёзд! Нужно: ${pet.base_price} ⭐`);
            return;
        }

        // Покупаем питомца
        await db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [pet.base_price, userId]);
        await db.run('INSERT INTO user_pets (user_id, pet_id, level) VALUES (?, ?, ?)', [userId, petId, 1]);
        await db.run(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            [userId, 'pet', -pet.base_price, `Покупка питомца: ${pet.name}`]
        );

        log('Питомец куплен', { userId, petId, price: pet.base_price });

        await bot.sendMessage(chatId, `🎉 **Поздравляем с покупкой!**

🐾 Вы купили: ${pet.name}
💰 Потрачено: ${pet.base_price} ⭐
💎 Остаток: ${(user.balance - pet.base_price).toFixed(2)} ⭐

📈 Ваш доход увеличился на ${(pet.boost_multiplier * 100).toFixed(1)}%!`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🐾 Мои питомцы', callback_data: 'pets' }],
                    [{ text: '🛒 Купить ещё', callback_data: 'pets_shop' }]
                ]
            }
        });

    } catch (error) {
        log('Ошибка покупки питом��а', { error: error.message, userId, petId });
        await bot.sendMessage(chatId, '❌ Ошибка при покупке питомца');
    }
}

// Показать рейтинги
async function showRatings(chatId, userId, messageId = null) {
    try {
        log('Показ рейтингов', { userId });

        // Получаем топ по рефералам за неделю
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        const weekStartStr = weekStart.toISOString().split('T')[0];

        const topUsers = await db.all(`
            SELECT u.id, u.first_name, u.username, u.level1_referrals,
                   COUNT(ref.id) as week_referrals
            FROM users u
            LEFT JOIN users ref ON ref.referrer_id = u.id
                AND ref.registration_date > ?
            GROUP BY u.id
            ORDER BY week_referrals DESC, u.level1_referrals DESC
            LIMIT 10
        `, [weekStartStr]);

        let message = `🏆 **Рейтинги**

📊 **Топ по рефералам за неделю:**

`;

        topUsers.forEach((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const name = user.username ? `@${user.username}` : user.first_name;
            message += `${medal} ${name} - ${user.week_referrals} рефералов\n`;
        });

        // Находим позицию текущего пользователя
        const userPosition = topUsers.findIndex(u => u.id === userId);
        if (userPosition !== -1) {
            message += `\n👤 **Ваша позиция:** ${userPosition + 1} место`;
        } else {
            message += `\n👤 **Ваша позиция:** не в топе`;
        }

        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⭐ Пригласить друзей', callback_data: 'referrals' }],
                    [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                ]
            }
        };

        if (messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
            } catch (editError) {
                await bot.sendMessage(chatId, message, options);
            }
        } else {
            await bot.sendMessage(chatId, message, options);
        }

    } catch (error) {
        log('Ошибка показа рейтингов', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке рейтингов');
    }
}

// Показать лотереи
async function showLotteries(chatId, userId, messageId = null) {
    try {
        log('Показ лотерей', { userId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        // Получаем активные лотереи
        const lotteries = await db.all('SELECT * FROM lotteries WHERE is_active = 1');

        let message = `🎰 **Лотереи**

💰 Ваш баланс: ${user.balance.toFixed(2)} ⭐

🎲 **Активные лотереи:**

`;

        const keyboard = [];

        if (lotteries.length === 0) {
            message += `😔 Сейчас нет активных лотерей.

Ожидайте новых розыгрышей!`;
        } else {
            for (const lottery of lotteries) {
                // Проверяем, есть ли уже билет
                const hasTicket = await db.get('SELECT id FROM lottery_tickets WHERE lottery_id = ? AND user_id = ?', [lottery.id, userId]);

                message += `🎫 **${lottery.name}**
💰 Цена билета: ${lottery.ticket_price} ⭐
💎 Призовой фонд: ${lottery.total_pool.toFixed(2)} ⭐
📝 ${lottery.description}

`;

                if (hasTicket) {
                    message += `✅ У вас есть билет\n\n`;
                } else if (user.balance >= lottery.ticket_price) {
                    keyboard.push([{
                        text: `🎫 Купить билет ${lottery.name} (${lottery.ticket_price} ⭐)`,
                        callback_data: `lottery_buy_${lottery.id}`
                    }]);
                    message += `🛒 Можно купить билет\n\n`;
                } else {
                    message += `💸 Недостаточно звёзд\n\n`;
                }
            }
        }

        keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main_menu' }]);

        const options = {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        };

        if (messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
            } catch (editError) {
                await bot.sendMessage(chatId, message, options);
            }
        } else {
            await bot.sendMessage(chatId, message, options);
        }

    } catch (error) {
        log('Ошибка показа лотерей', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке лотерей');
    }
}

// Покупка билета лотереи
async function buyLotteryTicket(chatId, userId, lotteryId) {
    try {
        log('Покупка билета лотереи', { userId, lotteryId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        const lottery = await db.get('SELECT * FROM lotteries WHERE id = ? AND is_active = 1', [lotteryId]);

        if (!user || !lottery) {
            await bot.sendMessage(chatId, '❌ Пользователь или лотерея не найдена');
            return;
        }

        // Проверки
        const hasTicket = await db.get('SELECT id FROM lottery_tickets WHERE lottery_id = ? AND user_id = ?', [lotteryId, userId]);
        if (hasTicket) {
            await bot.sendMessage(chatId, '❌ У вас уже есть билет на эту лотерею');
            return;
        }

        if (user.balance < lottery.ticket_price) {
            await bot.sendMessage(chatId, `❌ Недостаточно звёзд! Нужно: ${lottery.ticket_price} ⭐`);
            return;
        }

        // Покупаем билет
        const poolIncrease = lottery.ticket_price * (1 - lottery.bot_commission);

        await db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [lottery.ticket_price, userId]);
        await db.run('INSERT INTO lottery_tickets (lottery_id, user_id) VALUES (?, ?)', [lotteryId, userId]);
        await db.run('UPDATE lotteries SET total_pool = total_pool + ? WHERE id = ?', [poolIncrease, lotteryId]);
        await db.run(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            [userId, 'lottery', -lottery.ticket_price, `Билет в лотерею: ${lottery.name}`]
        );

        log('Билет куплен', { userId, lotteryId, price: lottery.ticket_price });

        await bot.sendMessage(chatId, `🎫 **Билет куплен!**

🎰 Лотерея: ${lottery.name}
💰 Потрачено: ${lottery.ticket_price} ⭐
💎 Остаток: ${(user.balance - lottery.ticket_price).toFixed(2)} ⭐

🍀 Удачи в розыгрыше!`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎰 Лотереи', callback_data: 'lotteries' }],
                    [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                ]
            }
        });

    } catch (error) {
        log('Ошибка покупки билета', { error: error.message, userId, lotteryId });
        await bot.sendMessage(chatId, '❌ Ошибка при покупке билета');
    }
}

// Показать промокоды
async function showPromo(chatId, userId, messageId = null) {
    try {
        log('Показ промокодов', { userId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        const message = `🎫 **Промокоды**

💰 Ваш баланс: ${user.balance.toFixed(2)} ⭐

🎁 **Как получить промокод:**
• Следите за новостями в канале
• Участвуйте в конкурсах
• Приглашайте друзей

💡 **Как использовать:**
П��осто отправьте промокод боту любым сообщением.

🔥 Промокоды дают бонусные звёзды!`;

        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                ]
            }
        };

        if (messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
            } catch (editError) {
                await bot.sendMessage(chatId, message, options);
            }
        } else {
            await bot.sendMessage(chatId, message, options);
        }

    } catch (error) {
        log('Ошибка показа промокодов', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке промокодов');
    }
}

// Использование промокода
async function usePromoCode(chatId, userId, code) {
    try {
        log('Использование промокода', { userId, code });

        // Проверяем промокод
        const promo = await db.get('SELECT * FROM promo_codes WHERE code = ? AND is_active = 1', [code]);
        if (!promo) {
            await bot.sendMessage(chatId, '❌ Промокод не найден или неактивен');
            return;
        }

        // Проверяем использование
        const used = await db.get('SELECT id FROM user_promo_codes WHERE user_id = ? AND promo_code_id = ?', [userId, promo.id]);
        if (used) {
            await bot.sendMessage(chatId, '❌ Вы уже использовали этот промокод');
            return;
        }

        // Проверяем лимит использований
        if (promo.current_uses >= promo.max_uses) {
            await bot.sendMessage(chatId, '❌ Промокод исчерпан');
            return;
        }

        // Используем промокод
        await db.run('UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?', [promo.reward, promo.reward, userId]);
        await db.run('INSERT INTO user_promo_codes (user_id, promo_code_id) VALUES (?, ?)', [userId, promo.id]);
        await db.run('UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = ?', [promo.id]);
        await db.run(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            [userId, 'promo', promo.reward, `Промокод: ${promo.code}`]
        );

        log('Промокод использован', { userId, code, reward: promo.reward });

        await bot.sendMessage(chatId, `🎉 **Промокод активирован!**

🎫 Промокод: ${promo.code}
💰 Получено: +${promo.reward} ⭐

🎁 Спасибо за использование промокода!`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👤 Мой профиль', callback_data: 'profile' }],
                    [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                ]
            }
        });

    } catch (error) {
        log('Ошибка использования промокода', { error: error.message, userId, code });
        await bot.sendMessage(chatId, '❌ Ошибка при активации промокода');
    }
}

// Показать варианты вывода
async function showWithdrawal(chatId, userId, messageId = null) {
    try {
        log('Показ вариантов вывода', { userId });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        const message = `💰 **Вывод звёзд**

💎 Ваш баланс: ${user.balance.toFixed(2)} ⭐

💸 **Доступные варианты вывода:**

• 15 ⭐ → 15 Telegram Stars
• 25 ⭐ → 25 Telegram Stars
• 50 ⭐ → 50 Telegram Stars
• 100 ⭐ → 100 Telegram Stars
• 1300 ⭐ → Telegram Premium (3 месяца)

⚠️ **Важно:**
Заявка отправляется на проверку администратору.
Обработка может занять до 24 часов.`;

        const keyboard = [];

        if (user.balance >= 15) keyboard.push([{ text: '💰 Вывести 15 ⭐', callback_data: 'withdraw_15' }]);
        if (user.balance >= 25) keyboard.push([{ text: '💰 Вывести 25 ⭐', callback_data: 'withdraw_25' }]);
        if (user.balance >= 50) keyboard.push([{ text: '💰 Вывести 50 ⭐', callback_data: 'withdraw_50' }]);
        if (user.balance >= 100) keyboard.push([{ text: '💰 Вывести 100 ⭐', callback_data: 'withdraw_100' }]);
        if (user.balance >= 1300) keyboard.push([{ text: '👑 Вывести Premium (1300 ⭐)', callback_data: 'withdraw_premium' }]);

        keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main_menu' }]);

        const options = {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        };

        if (messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    ...options
                });
            } catch (editError) {
                await bot.sendMessage(chatId, message, options);
            }
        } else {
            await bot.sendMessage(chatId, message, options);
        }

    } catch (error) {
        log('Ошибка показа вывода', { error: error.message, userId });
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке вывода');
    }
}

// Создание заявки на вывод
async function createWithdrawal(chatId, userId, type) {
    try {
        log('Создание заявки на вывод', { userId, type });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        // Определяем сумму и описание
        const withdrawalTypes = {
            '15': { amount: 15, description: '15 Telegram Stars' },
            '25': { amount: 25, description: '25 Telegram Stars' },
            '50': { amount: 50, description: '50 Telegram Stars' },
            '100': { amount: 100, description: '100 Telegram Stars' },
            'premium': { amount: 1300, description: 'Telegram Premium (3 месяца)' }
        };

        const withdrawalInfo = withdrawalTypes[type];
        if (!withdrawalInfo) {
            await bot.sendMessage(chatId, '❌ Неверный тип вывода');
            return;
        }

        if (user.balance < withdrawalInfo.amount) {
            await bot.sendMessage(chatId, `❌ Недостаточно звёзд! Нужно: ${withdrawalInfo.amount} ⭐`);
            return;
        }

        // Создаём заявку
        await db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [withdrawalInfo.amount, userId]);
        const result = await db.run(
            'INSERT INTO withdrawals (user_id, amount, withdrawal_type, status) VALUES (?, ?, ?, ?)',
            [userId, withdrawalInfo.amount, type, 'pending']
        );
        await db.run(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            [userId, 'withdrawal_request', -withdrawalInfo.amount, `Заявка на вывод: ${withdrawalInfo.description}`]
        );

        const withdrawalId = result.lastInsertRowid;

        log('Заявка создана', { userId, withdrawalId, amount: withdrawalInfo.amount });

        // Отправляем уведомление в канал вывода
        try {
            const userLink = user.username ? `@${user.username}` : `[${user.first_name}](tg://user?id=${user.id})`;

            await bot.sendMessage('@kirbyvivodstars', `💰 **НОВАЯ ЗАЯВКА НА ВЫВОД #${withdrawalId}**

👤 **Пользователь:** ${userLink}
🆔 **ID:** \`${user.id}\`
💰 **Сумма:** ${withdrawalInfo.amount} ⭐
🎯 **Тип:** ${withdrawalInfo.description}
📅 **Дата:** ${new Date().toLocaleString('ru-RU')}

⚠️ Проверьте заявку и примите решение:`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Выполнено', callback_data: `admin_approve_${withdrawalId}` },
                            { text: '❌ Отклонить', callback_data: `admin_reject_${withdrawalId}` }
                        ]
                    ]
                }
            });
        } catch (notificationError) {
            log('Ошибка отправки в канал вывода', { error: notificationError.message });
        }

        // Подтверждаем пользователю
        await bot.sendMessage(chatId, `✅ **Заявка на вывод создана!**

🆔 Номер заявки: #${withdrawalId}
💰 Сумма: ${withdrawalInfo.amount} ⭐
🎯 Тип: ${withdrawalInfo.description}
💎 Остаток: ${(user.balance - withdrawalInfo.amount).toFixed(2)} ⭐

⏰ Заявка отправлена на рассмотрение.
📱 Ожидайте уведомления о статусе.`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '👤 Мой профиль', callback_data: 'profile' }],
                    [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
                ]
            }
        });

    } catch (error) {
        log('Ошибка создания заявки', { error: error.message, userId, type });
        await bot.sendMessage(chatId, '❌ Ошибка при создании заявки');
    }
}

// Обработка ошибок polling
bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        log('Конф��икт экземпляров бота - нормально для Railway');
    } else {
        log('Ошибка polling', { error: error.message });
    }
});

// Инициализация
async function init() {
    try {
        console.log('🔌 Инициализация базы данных...');
        await db.init();
        console.log('✅ База данных готова');

        console.log('🤖 Бот запущен и готов к работе!');
        log('Бот успешно запущен');

    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
        process.exit(1);
    }
}

// Запуск
init();

module.exports = { bot, db };
