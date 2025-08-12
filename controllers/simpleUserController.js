const crypto = require('crypto');
const SafeMessageHelper = require('../utils/safeMessageHelper');

class SimpleUserController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
    }

    // Простое логирование
    log(message, data = null) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] USER: ${message}`, data ? JSON.stringify(data) : '');
    }

    // Генерация реферального кода
    generateReferralCode() {
        return crypto.randomBytes(4).toString('hex').toUpperCase();
    }

    // ПРОСТАЯ регистрация пользователя
    async registerUser(userId, username, firstName, referralCode = null) {
        try {
            this.log('Начало регистрации пользователя', { userId, username, firstName, referralCode });

            // Проверяем, существует ли пользователь
            const existingUser = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (existingUser) {
                this.log('Пользователь уже существует', { userId });
                existingUser.isNewUser = false;
                return existingUser;
            }

            // Генерируем уникальный реферальный код
            let userReferralCode;
            let isUnique = false;
            while (!isUnique) {
                userReferralCode = this.generateReferralCode();
                const existing = await this.db.get('SELECT id FROM users WHERE referral_code = ?', [userReferralCode]);
                if (!existing) {
                    isUnique = true;
                }
            }

            this.log('Сгенерирован реферальный код', { userReferralCode });

            // Находим пригласившего пользователя
            let referrerId = null;
            if (referralCode) {
                const referrer = await this.db.get('SELECT id FROM users WHERE referral_code = ?', [referralCode]);
                if (referrer) {
                    referrerId = referrer.id;
                    this.log('Найден пригласивший пользователь', { referrerId, referralCode });
                } else {
                    this.log('Пригласивший пользователь не найден', { referralCode });
                }
            }

            // ПРОСТОЕ создание пользователя
            this.log('Создание нового пользователя в базе');
            await this.db.run(
                'INSERT INTO users (id, username, first_name, balance, referrer_id, referral_code, level1_referrals, level2_referrals, total_earned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [userId, username, firstName, 0, referrerId, userReferralCode, 0, 0, 0]
            );

            this.log('Пользователь создан в базе');

            // Получаем созданного пользователя
            const newUser = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            newUser.isNewUser = true;
            newUser.referrer_id = referrerId; // Сохраняем для дальнейшей обработки

            this.log('Регистрация завершена', { 
                userId,
                hasReferrer: !!referrerId,
                userReferralCode 
            });

            return newUser;

        } catch (error) {
            this.log('ОШИБКА при регистрации', {
                error: error.message,
                stack: error.stack,
                userId,
                username,
                firstName,
                referralCode
            });
            console.error('Error registering user:', error);
            throw error;
        }
    }

    // ПРОСТОЕ отображение профиля
    async showProfile(chatId, userId, messageId = null) {
        try {
            this.log('Показ профиля пользователя', { userId });

            // Получаем данные пользователя
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (!user) {
                this.log('Пользователь не найден', { userId });
                await this.bot.sendMessage(chatId, '❌ Пользователь не найден');
                return;
            }

            this.log('Данные пользователя получены', {
                userId,
                balance: user.balance,
                total_earned: user.total_earned,
                level1_referrals: user.level1_referrals,
                level2_referrals: user.level2_referrals
            });

            // Получаем питомцев пользователя
            const userPets = await this.db.all(`
                SELECT p.name, p.boost_multiplier, p.boost_type, up.level
                FROM user_pets up
                JOIN pets p ON up.pet_id = p.id
                WHERE up.user_id = ?
                ORDER BY up.id ASC
            `, [userId]);

            this.log('Питомцы пользователя получены', { count: userPets.length });

            let petsInfo = '';
            let clickBoost = 0;
            let referral1Boost = 0;
            let referral2Boost = 0;
            let taskBoost = 0;

            if (userPets.length === 0) {
                petsInfo = '🐾 **Питомцы:** Отсутствуют';
            } else {
                // Считаем бусты по типам
                userPets.forEach(pet => {
                    const petBoost = pet.boost_multiplier * pet.level;
                    switch(pet.boost_type) {
                        case 'click':
                            clickBoost += petBoost;
                            break;
                        case 'referral_1':
                            referral1Boost += petBoost;
                            break;
                        case 'referral_2':
                            referral2Boost += petBoost;
                            break;
                        case 'task':
                            taskBoost += petBoost;
                            break;
                    }
                });

                const petsList = userPets.map(pet => {
                    return `${pet.name} (${pet.level} ур.)`;
                }).join(', ');
                petsInfo = `🐾 **Активные питомцы:** ${petsList}`;
            }

            // Создаём информацию о бустах
            let boostInfo = '';
            if (clickBoost > 0 || referral1Boost > 0 || referral2Boost > 0 || taskBoost > 0) {
                boostInfo = '\n📈 **Бусты от питомцев:**';
                if (clickBoost > 0) boostInfo += `\n• Кликер: +${clickBoost.toFixed(1)} ⭐`;
                if (referral1Boost > 0) boostInfo += `\n• Рефералы 1 ур.: +${referral1Boost.toFixed(1)} ⭐`;
                if (referral2Boost > 0) boostInfo += `\n• Рефералы 2 ур.: +${referral2Boost.toFixed(1)} ⭐`;
                if (taskBoost > 0) boostInfo += `\n• Задания: +${taskBoost.toFixed(1)} ⭐`;
            }

            const profileMessage = `👤 **П��рсональный профиль**

💰 **Текущий баланс:** ${user.balance.toFixed(2)} ⭐
💎 **Общий заработок:** ${user.total_earned.toFixed(2)} ⭐

👥 **Реферальная сеть:**
├ Прямые рефералы: ${user.level1_referrals} пользователей
└ Рефералы 2-го уровня: ${user.level2_referrals} пользователей

${petsInfo}${boostInfo}

🔗 **Персональная реферальная ссылка:**
\`https://t.me/kirbystarsfarmbot?start=${user.referral_code}\`

💡 Поделитесь ссылкой с друзьями для получения бонусов!`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '👆 Кликнуть', callback_data: 'simple_daily_click' },
                        { text: '⭐ Пригласить друзей', callback_data: 'menu_referral' }
                    ],
                    [
                        { text: '🐾 Питомцы', callback_data: 'simple_my_pets' },
                        { text: '📋 Задания', callback_data: 'menu_tasks' }
                    ],
                    [
                        { text: '🏠 Главное меню', callback_data: 'main_menu' }
                    ]
                ]
            };

            if (messageId) {
                await SafeMessageHelper.safeEditMessage(this.bot, profileMessage, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else {
                await this.bot.sendMessage(chatId, profileMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }

            this.log('Профиль отображён успешно');

        } catch (error) {
            this.log('ОШИБКА при показе профиля', {
                error: error.message,
                stack: error.stack,
                userId
            });
            console.error('Error showing profile:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке профиля. Попробуйте позже.');
        }
    }

    // ПРОСТОЙ ежедневный клик
    async dailyClick(chatId, userId, messageId = null) {
        try {
            this.log('Ежедневный клик', { userId });

            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Пользователь не найден');
                return;
            }

            // Проверяем, кликал ли уже сегодня
            const today = new Date().toISOString().split('T')[0];
            if (user.last_click_date === today) {
                this.log('Уже кликал сегодня', { userId, lastClick: user.last_click_date });
                await this.bot.sendMessage(chatId, '⏰ Вы уже получили награду за клик сегодня! Приходите завтра.');
                return;
            }

            // Базовая награда
            let baseReward = 0.5;

            // Считаем буст от питомцев
            const clickPets = await this.db.all(`
                SELECT p.boost_multiplier, up.level
                FROM user_pets up
                JOIN pets p ON up.pet_id = p.id
                WHERE up.user_id = ? AND p.boost_type = 'click'
            `, [userId]);

            let clickBoost = 0;
            clickPets.forEach(pet => {
                clickBoost += pet.boost_multiplier * pet.level;
            });

            const finalReward = baseReward + clickBoost;

            this.log('Расчёт награды за кл��к', {
                userId,
                baseReward,
                clickBoost,
                finalReward
            });

            // ПРОСТЫЕ операции начисления
            await this.db.run(
                'UPDATE users SET balance = balance + ?, total_earned = total_earned + ?, last_click_date = ? WHERE id = ?',
                [finalReward, finalReward, today, userId]
            );

            await this.db.run(
                'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                [userId, 'click', finalReward, 'Ежедневный клик']
            );

            this.log('Награда начислена', { userId, finalReward });

            const boostInfo = clickBoost > 0 ? ` (базовая 0.5 + буст +${clickBoost} от питомцев)` : '';

            const successMsg = `🎉 Ежедневная награда получена!

💰 **Получено:** ${finalReward.toFixed(2)} ⭐${boostInfo}

⏰ Следующий клик будет доступен завтра!
🐾 Купите питомцев для увеличения награды!`;

            const keyboard = [
                [{ text: '🐾 Купить питомца', callback_data: 'simple_pet_shop' }],
                [{ text: '👤 Профиль', callback_data: 'simple_profile' }],
                [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
            ];

            if (messageId) {
                await SafeMessageHelper.safeEditMessage(this.bot, successMsg, {
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
            this.log('ОШИБКА при ежедневном клике', {
                error: error.message,
                stack: error.stack,
                userId
            });
            console.error('Error with daily click:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при получении награды. Попробуйте позже.');
        }
    }
}

module.exports = SimpleUserController;
