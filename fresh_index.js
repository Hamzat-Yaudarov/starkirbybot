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

👥 Ваш реферал привёл друга!

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

// Показать реферальную информацию
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
        await bot.sendMessage(chatId, '❌ Произошла ошибка при регистрации');
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

        switch (data) {
            case 'profile':
                await showProfile(chatId, userId, msg.message_id);
                break;

            case 'daily_click':
                await dailyClick(chatId, userId, msg.message_id);
                break;

            case 'referrals':
                await showReferrals(chatId, userId, msg.message_id);
                break;

            case 'main_menu':
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
                break;

            case 'tasks':
            case 'cases':
            case 'pets':
                await bot.sendMessage(chatId, '🚧 Эта функция ещё разрабатывается!');
                break;

            default:
                log('Неизвестный callback', { data });
                break;
        }

    } catch (error) {
        log('Ошибка в callback', { error: error.message, data, userId });
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
});

// Обработка ошибок polling
bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        log('Конфликт экземпляров бота - нормально для Railway');
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
