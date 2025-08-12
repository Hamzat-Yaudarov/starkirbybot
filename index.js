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
                { text: '🎁 Кейсы', callback_data: 'cases' },
                { text: '🐕 Питомцы', callback_data: 'pets' }
            ],
            [
                { text: '🏆 Рейтинги', callback_data: 'ratings' },
                { text: '🎰 Лотереи', callback_data: 'lotteries' }
            ],
            [
                { text: '💰 Вывод', callback_data: 'withdrawal' }
            ]
        ]
    };
}

// Регистрация пользователя
function registerUser(userId, username, referredBy = null) {
    log(`Регистрация пользователя ${userId}`);
    
    try {
        // Проверяем существование пользователя
        const existingUser = db.getUser(userId);
        if (existingUser) {
            log(`Пользователь ${userId} уже существует`);
            return existingUser;
        }

        const referralCode = generateReferralCode();
        
        // Создаём пользователя
        const newUser = {
            userId: userId,
            username: username || 'Неизвестно',
            balance: 0,
            referralCode: referralCode,
            totalReferrals: 0,
            registeredAt: Date.now(),
            lastClickTime: null
        };

        db.createUser(newUser);
        log(`Пользователь ${userId} создан с реферальным кодом ${referralCode}`);

        // Обрабатываем реферала
        if (referredBy) {
            processReferralReward(referredBy, userId);
        }

        return newUser;
    } catch (error) {
        log(`Ошибка регистрации пользователя ${userId}:`, error.message);
        throw error;
    }
}

// Обработка реферальной награды
function processReferralReward(referrerCode, newUserId) {
    log(`Обработка реферала: код ${referrerCode}, новый пользователь ${newUserId}`);
    
    try {
        // Ищем пользователя по реферальному коду
        const referrer = db.getUserByReferralCode(referrerCode);
        if (!referrer) {
            log(`Реферер с кодом ${referrerCode} не найден`);
            return;
        }

        log(`Найден реферер: ${referrer.userId}`);

        // Увеличиваем счётчик рефералов
        db.updateUserField(referrer.userId, 'totalReferrals', referrer.totalReferrals + 1);
        
        // Даём награду за реферала (3 звезды)
        const newBalance = referrer.balance + 3;
        db.updateUserField(referrer.userId, 'balance', newBalance);

        log(`Реферер ${referrer.userId} получил 3 звезды. Новый баланс: ${newBalance}, рефералов: ${referrer.totalReferrals + 1}`);

        // Проверяем реферера 2-го уровня
        const level2Referrer = db.getUserByReferralCode(referrer.referredBy);
        if (level2Referrer) {
            const level2NewBalance = level2Referrer.balance + 0.05;
            db.updateUserField(level2Referrer.userId, 'balance', level2NewBalance);
            log(`Реферер 2-го уровня ${level2Referrer.userId} получил 0.05 звезды`);
        }
    } catch (error) {
        log(`Ошибка обработки реферала:`, error.message);
    }
}

// Показать профиль
async function showProfile(chatId, userId) {
    log(`Показ профиля для ${userId}`);
    
    try {
        const user = db.getUser(userId);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        // Получаем питомцев пользователя
        const userPets = db.getUserPets(userId);
        const petsText = userPets.length > 0 
            ? userPets.map(pet => `${pet.emoji} ${pet.name} (ур.${pet.level})`).join(', ')
            : 'Нет питомцев';

        const profileText = `👤 **Ваш профиль**

💰 Баланс: ${user.balance} ⭐
👥 Рефералов: ${user.totalReferrals}
🔗 Ваш реферальный код: \`${user.referralCode}\`
🐕 Питомцы: ${petsText}

📱 Поделитесь своим кодом с друзьями и получайте звёзды!`;

        await bot.sendMessage(chatId, profileText, {
            parse_mode: 'Markdown',
            reply_markup: getMainMenu()
        });
    } catch (error) {
        log(`Ошибка показа профиля:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке профиля');
    }
}

// Ежедневный клик
async function dailyClick(chatId, userId) {
    log(`Ежедневный клик от ${userId}`);
    
    try {
        const user = db.getUser(userId);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        const now = Date.now();
        const lastClick = user.lastClickTime;
        
        // Проверяем, прошло ли 24 часа
        if (lastClick && (now - lastClick) < 24 * 60 * 60 * 1000) {
            const timeLeft = 24 * 60 * 60 * 1000 - (now - lastClick);
            const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
            
            await bot.sendMessage(chatId, `⏰ Следующий клик будет доступен через ${hoursLeft} часов`, {
                reply_markup: getMainMenu()
            });
            return;
        }

        // Даём награду
        const newBalance = user.balance + 0.1;
        db.updateUserField(userId, 'balance', newBalance);
        db.updateUserField(userId, 'lastClickTime', now);

        log(`Пользователь ${userId} получил 0.1 звезды. Новый баланс: ${newBalance}`);

        await bot.sendMessage(chatId, `✅ Вы получили 0.1 ⭐!\n💰 Ваш баланс: ${newBalance} ⭐`, {
            reply_markup: getMainMenu()
        });
    } catch (error) {
        log(`Ошибка ежедневного клика:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при обработке клика');
    }
}

// Показать задания
async function showTasks(chatId, userId) {
    log(`Показ заданий для ${userId}`);
    
    try {
        // Получаем все задания
        const allTasks = db.getAllTasks();
        const completedTaskIds = db.getUserCompletedTasks(userId);
        
        if (allTasks.length === 0) {
            await bot.sendMessage(chatId, '📋 Заданий пока нет', {
                reply_markup: getMainMenu()
            });
            return;
        }

        let tasksText = '📋 **Доступные задания:**\n\n';
        
        allTasks.forEach(task => {
            const isCompleted = completedTaskIds.includes(task.id);
            const status = isCompleted ? '✅' : '⭐';
            tasksText += `${status} ${task.title}\n💰 Награда: ${task.reward} ⭐\n📝 ${task.description}\n\n`;
        });

        const keyboard = {
            inline_keyboard: []
        };

        // Добавляем кнопки для незавершённых заданий
        allTasks.forEach(task => {
            const isCompleted = completedTaskIds.includes(task.id);
            if (!isCompleted) {
                keyboard.inline_keyboard.push([{
                    text: `Выполнить: ${task.title}`,
                    callback_data: `complete_task_${task.id}`
                }]);
            }
        });

        keyboard.inline_keyboard.push([{ text: '🔙 Назад', callback_data: 'main_menu' }]);

        await bot.sendMessage(chatId, tasksText, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    } catch (error) {
        log(`Ошибка показа заданий:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке заданий');
    }
}

// Выполнить задание
async function completeTask(chatId, userId, taskId) {
    log(`Выполнение задания ${taskId} пользователем ${userId}`);
    
    try {
        // Проверяем, не выполнено ли задание
        const completedTasks = db.getUserCompletedTasks(userId);
        if (completedTasks.includes(taskId)) {
            await bot.sendMessage(chatId, '❌ Задание уже выполнено!');
            return;
        }

        const task = db.getTask(taskId);
        if (!task) {
            await bot.sendMessage(chatId, '❌ Задание не найдено!');
            return;
        }

        // Отмечаем задание как выполненное
        db.completeUserTask(userId, taskId);
        
        // Даём награду
        const user = db.getUser(userId);
        const newBalance = user.balance + task.reward;
        db.updateUserField(userId, 'balance', newBalance);

        log(`Пользователь ${userId} выполнил задание ${taskId} и получил ${task.reward} звезд`);

        await bot.sendMessage(chatId, `✅ Задание "${task.title}" выполнено!\n💰 Вы получили ${task.reward} ⭐\n💳 Ваш баланс: ${newBalance} ⭐`, {
            reply_markup: getMainMenu()
        });
    } catch (error) {
        log(`Ошибка ��ыполнения задания:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при выполнении задания');
    }
}

// Показать кейсы
async function showCases(chatId, userId) {
    log(`Показ кейсов для ${userId}`);
    
    try {
        const user = db.getUser(userId);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        // Проверяем кейсы пользователя
        const userCases = db.getUserCases(userId);
        const dailyCase = userCases.find(c => c.type === 'daily');
        
        const now = new Date();
        const today = now.toDateString();
        
        let canOpenDaily = true;
        if (dailyCase && new Date(dailyCase.lastOpenTime).toDateString() === today) {
            canOpenDaily = false;
        }

        // Проверяем условие для ежедневного кейса (3+ рефералов)
        const meetsRequirement = user.totalReferrals >= 3;

        let casesText = '🎁 **Кейсы**\n\n';
        casesText += '📦 Ежедневный кейс\n';
        casesText += `💰 Награда: 1-5 ⭐\n`;
        casesText += `👥 Требование: 3+ рефералов (у вас: ${user.totalReferrals})\n`;
        
        if (!meetsRequirement) {
            casesText += '❌ Недостаточно рефералов\n';
        } else if (!canOpenDaily) {
            casesText += '⏰ Уже открыт сегодня\n';
        } else {
            casesText += '✅ Доступен для открытия\n';
        }

        const keyboard = {
            inline_keyboard: []
        };

        if (meetsRequirement && canOpenDaily) {
            keyboard.inline_keyboard.push([{
                text: '🎁 Открыть ежедневный кейс',
                callback_data: 'open_case_daily'
            }]);
        }

        keyboard.inline_keyboard.push([{ text: '🔙 Назад', callback_data: 'main_menu' }]);

        await bot.sendMessage(chatId, casesText, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    } catch (error) {
        log(`Ошибка показа кейсов:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке кейсов');
    }
}

// Открыть кейс
async function openCase(chatId, userId, caseType) {
    log(`Открытие кейса ${caseType} пользователем ${userId}`);
    
    try {
        const user = db.getUser(userId);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        if (caseType === 'daily') {
            // Проверяем условия
            if (user.totalReferrals < 3) {
                await bot.sendMessage(chatId, '❌ Нужно минимум 3 реферала для открытия ежедневного кейса');
                return;
            }

            // Проверяем, не открывался ли сегодня
            const userCases = db.getUserCases(userId);
            const dailyCase = userCases.find(c => c.type === 'daily');
            
            const now = new Date();
            const today = now.toDateString();
            
            if (dailyCase && new Date(dailyCase.lastOpenTime).toDateString() === today) {
                await bot.sendMessage(chatId, '❌ Ежедневный кейс уже открыт сегодня');
                return;
            }

            // Генерируем награду (1-5 звезд)
            const reward = Math.floor(Math.random() * 5) + 1;
            
            // Обновляем баланс
            const newBalance = user.balance + reward;
            db.updateUserField(userId, 'balance', newBalance);
            
            // Сохраняем информацию об открытии кейса
            db.saveUserCase(userId, 'daily', Date.now());

            log(`Пользователь ${userId} открыл ежедневный кейс и получил ${reward} звезд`);

            await bot.sendMessage(chatId, `🎁 Поздравляем!\nВы открыли ежедневный кейс и получили ${reward} ⭐!\n💰 Ваш баланс: ${newBalance} ⭐`, {
                reply_markup: getMainMenu()
            });
        }
    } catch (error) {
        log(`Ошибка открытия кейса:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при открытии кейса');
    }
}

// Показать питомцев
async function showPets(chatId, userId) {
    log(`Показ питомцев для ${userId}`);
    
    try {
        const user = db.getUser(userId);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        // Получаем всех доступных питомцев
        const allPets = db.getAllPets();
        const userPets = db.getUserPets(userId);

        let petsText = '🐕 **Питомцы**\n\n';
        petsText += `💰 Ваш баланс: ${user.balance} ⭐\n\n`;

        if (userPets.length > 0) {
            petsText += '👥 **Ваши питомцы:**\n';
            userPets.forEach(pet => {
                petsText += `${pet.emoji} ${pet.name} (уровень ${pet.level})\n`;
            });
            petsText += '\n';
        }

        petsText += '🛒 **Доступны для покупки:**\n';
        
        const keyboard = {
            inline_keyboard: []
        };

        allPets.forEach(pet => {
            const userHasPet = userPets.find(up => up.petId === pet.id);
            if (!userHasPet) {
                petsText += `${pet.emoji} ${pet.name} - ${pet.price} ⭐\n`;
                keyboard.inline_keyboard.push([{
                    text: `${pet.emoji} Купить ${pet.name} (${pet.price}⭐)`,
                    callback_data: `buy_pet_${pet.id}`
                }]);
            } else {
                const nextLevelPrice = pet.price * userHasPet.level;
                petsText += `${pet.emoji} ${pet.name} - улучшить до ур.${userHasPet.level + 1} (${nextLevelPrice}⭐)\n`;
                keyboard.inline_keyboard.push([{
                    text: `${pet.emoji} Улучшить ${pet.name} (${nextLevelPrice}⭐)`,
                    callback_data: `upgrade_pet_${pet.id}`
                }]);
            }
        });

        keyboard.inline_keyboard.push([{ text: '🔙 Назад', callback_data: 'main_menu' }]);

        await bot.sendMessage(chatId, petsText, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    } catch (error) {
        log(`Ошибка показа питомцев:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке питомцев');
    }
}

// Купить питомца
async function buyPet(chatId, userId, petId) {
    log(`Покупка питомца ${petId} пользователем ${userId}`);
    
    try {
        const user = db.getUser(userId);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        const pet = db.getPet(petId);
        if (!pet) {
            await bot.sendMessage(chatId, '❌ Питомец не найден');
            return;
        }

        // Проверяем, есть ли уже этот питомец
        const userPets = db.getUserPets(userId);
        const existingPet = userPets.find(up => up.petId === petId);
        
        if (existingPet) {
            await bot.sendMessage(chatId, '❌ У вас уже есть этот питомец! Вы можете его улучшить.');
            return;
        }

        // Проверяем баланс
        if (user.balance < pet.price) {
            await bot.sendMessage(chatId, `❌ Недостаточно звёзд! Нужно: ${pet.price} ⭐, у вас: ${user.balance} ⭐`);
            return;
        }

        // Покупаем питомца
        const newBalance = user.balance - pet.price;
        db.updateUserField(userId, 'balance', newBalance);
        db.addUserPet(userId, petId, 1);

        log(`Пользователь ${userId} купил питомца ${pet.name} за ${pet.price} звезд`);

        await bot.sendMessage(chatId, `🎉 Поздравляем!\nВы купили ${pet.emoji} ${pet.name}!\n💰 Потрачено: ${pet.price} ⭐\n💳 Ваш баланс: ${newBalance} ⭐`, {
            reply_markup: getMainMenu()
        });
    } catch (error) {
        log(`Ошибка покупки питомца:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при покупке питомца');
    }
}

// Показать рейтинги
async function showRatings(chatId) {
    log('Показ рейтингов');
    
    try {
        // Получаем топ пользователей по рефералам за неделю
        const topUsers = db.getTopUsersByReferrals(10);
        
        let ratingsText = '🏆 **Рейтинг по рефералам (эта неделя)**\n\n';
        
        if (topUsers.length === 0) {
            ratingsText += 'Рейтинг пока пуст';
        } else {
            topUsers.forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                ratingsText += `${medal} ${user.username || 'Неизвестно'} - ${user.totalReferrals} рефералов\n`;
            });
        }

        await bot.sendMessage(chatId, ratingsText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'main_menu' }]]
            }
        });
    } catch (error) {
        log(`Ошибка показа рейтингов:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке рейтингов');
    }
}

// Показать лотереи
async function showLotteries(chatId, userId) {
    log(`Показ лотерей для ${userId}`);
    
    try {
        const user = db.getUser(userId);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        // Получаем активные лотереи
        const activeLotteries = db.getActiveLotteries();
        
        let lotteriesText = '🎰 **Лотереи**\n\n';
        lotteriesText += `💰 Ваш баланс: ${user.balance} ⭐\n\n`;

        if (activeLotteries.length === 0) {
            lotteriesText += 'Активных лотерей нет';
        } else {
            const keyboard = {
                inline_keyboard: []
            };

            activeLotteries.forEach(lottery => {
                const ticketsSold = db.getLotteryTicketCount(lottery.id);
                const prizePool = ticketsSold * lottery.ticketPrice;
                
                lotteriesText += `🎫 **${lottery.title}**\n`;
                lotteriesText += `💰 Цена билета: ${lottery.ticketPrice} ⭐\n`;
                lotteriesText += `🏆 Призовой фонд: ${prizePool} ⭐\n`;
                lotteriesText += `🎟️ Билетов продано: ${ticketsSold}\n`;
                lotteriesText += `⏰ До розыгрыша: ${new Date(lottery.drawTime).toLocaleString()}\n\n`;

                keyboard.inline_keyboard.push([{
                    text: `🎫 Купить билет ${lottery.title} (${lottery.ticketPrice}⭐)`,
                    callback_data: `buy_lottery_${lottery.id}`
                }]);
            });

            keyboard.inline_keyboard.push([{ text: '🔙 Назад', callback_data: 'main_menu' }]);

            await bot.sendMessage(chatId, lotteriesText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            return;
        }

        await bot.sendMessage(chatId, lotteriesText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'main_menu' }]]
            }
        });
    } catch (error) {
        log(`Ошибка показа лотерей:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при загрузке лотерей');
    }
}

// Купить лотерейный билет
async function buyLotteryTicket(chatId, userId, lotteryId) {
    log(`Покупка лотерейного билета ${lotteryId} пользователем ${userId}`);
    
    try {
        const user = db.getUser(userId);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        const lottery = db.getLottery(lotteryId);
        if (!lottery) {
            await bot.sendMessage(chatId, '❌ Лотерея не найдена');
            return;
        }

        // Проверяем баланс
        if (user.balance < lottery.ticketPrice) {
            await bot.sendMessage(chatId, `❌ Недостаточно звёзд! Нужно: ${lottery.ticketPrice} ⭐, у вас: ${user.balance} ⭐`);
            return;
        }

        // Покупаем билет
        const newBalance = user.balance - lottery.ticketPrice;
        db.updateUserField(userId, 'balance', newBalance);
        db.addLotteryTicket(userId, lotteryId);

        log(`Пользователь ${userId} купил билет лотереи ${lottery.title} за ${lottery.ticketPrice} звезд`);

        await bot.sendMessage(chatId, `🎫 Билет куплен!\nЛотерея: ${lottery.title}\n💰 Потрачено: ${lottery.ticketPrice} ⭐\n💳 Ваш баланс: ${newBalance} ⭐\n🍀 Удачи в розыгрыше!`, {
            reply_markup: getMainMenu()
        });
    } catch (error) {
        log(`Ошибка покупки лотерейного билета:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при покупке билета');
    }
}

// Использовать промокод
async function usePromoCode(chatId, userId, promoCode) {
    log(`Использование промокода ${promoCode} пользователем ${userId}`);
    
    try {
        const user = db.getUser(userId);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        const promo = db.getPromoCode(promoCode);
        if (!promo) {
            await bot.sendMessage(chatId, '❌ Промокод не найден или недействителен');
            return;
        }

        // Проверяем, использовал ли пользователь этот промокод
        const usedPromos = db.getUserUsedPromoCodes(userId);
        if (usedPromos.includes(promo.id)) {
            await bot.sendMessage(chatId, '❌ Вы уже использовали этот промокод');
            return;
        }

        // Проверяем лимит использований
        const usageCount = db.getPromoCodeUsageCount(promo.id);
        if (promo.usageLimit && usageCount >= promo.usageLimit) {
            await bot.sendMessage(chatId, '❌ Промокод исчерпан');
            return;
        }

        // Проверяем срок действия
        if (promo.expiryTime && Date.now() > promo.expiryTime) {
            await bot.sendMessage(chatId, '❌ Промокод истёк');
            return;
        }

        // Используем промокод
        const newBalance = user.balance + promo.reward;
        db.updateUserField(userId, 'balance', newBalance);
        db.markPromoCodeAsUsed(userId, promo.id);

        log(`Пользователь ${userId} использовал промокод ${promoCode} и получил ${promo.reward} звезд`);

        await bot.sendMessage(chatId, `✅ Промокод активирован!\n🎁 Вы получили ${promo.reward} ⭐\n💰 Ваш баланс: ${newBalance} ⭐`, {
            reply_markup: getMainMenu()
        });
    } catch (error) {
        log(`Ошибка использования промокода:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при использовании промокода');
    }
}

// Создать заявку на вывод
async function createWithdrawal(chatId, userId, amount) {
    log(`Создание заявки на вывод ${amount} звезд пользователем ${userId}`);
    
    try {
        const user = db.getUser(userId);
        if (!user) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        // Проверяем баланс
        if (user.balance < amount) {
            await bot.sendMessage(chatId, `❌ Недостаточно звёзд! У вас: ${user.balance} ⭐, нужно: ${amount} ⭐`);
            return;
        }

        // Списываем звёзды
        const newBalance = user.balance - amount;
        db.updateUserField(userId, 'balance', newBalance);

        // Создаём заявку
        const withdrawalId = db.createWithdrawal(userId, amount);

        log(`Создана заявка на вывод #${withdrawalId} для пользователя ${userId} на сумму ${amount} звезд`);

        // Уведомляем администратора
        try {
            await bot.sendMessage('@kirbyvivodstars', `💰 **Новая заявка на вывод**

📋 ID заявки: #${withdrawalId}
👤 Пользователь: ${user.username} (${userId})
💰 Сумма: ${amount} ⭐
⏰ Время: ${new Date().toLocaleString()}

Обработайте заявку в админ-панели.`, {
                parse_mode: 'Markdown'
            });
        } catch (notifyError) {
            log('Ошибка уведомления администратора:', notifyError.message);
        }

        await bot.sendMessage(chatId, `✅ Заявка на вывод создана!\n📋 ID заявки: #${withdrawalId}\n💰 Сумма: ${amount} ⭐\n💳 Ваш баланс: ${newBalance} ⭐\n\n⏰ Заявка будет обработана в течение 24 часов`, {
            reply_markup: getMainMenu()
        });
    } catch (error) {
        log(`Ошибка создания заявки на вывод:`, error.message);
        await bot.sendMessage(chatId, '❌ Ошибка при создании заявки на вывод');
    }
}

// Обработчик команды /start
bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;
    const startParam = match[1] ? match[1].trim() : null;

    log(`Команда /start от пользователя ${userId} с параметром: ${startParam}`);

    try {
        // Регистрируем пользователя
        const referralCode = startParam ? startParam : null;
        const user = registerUser(userId, username, referralCode);

        const welcomeText = `🌟 Добро пожаловать в StarKirby Bot!

Здесь вы можете:
• 👆 Кликать и получать звёзды
• 👥 Приглашать друзей и получать бонусы  
• 📋 Выполнять задания
• 🐕 Покупать питомцев
• 🎁 Открывать кейсы
• 💰 Выводить заработанные звёзды

Начните с изучения своего профиля!`;

        await bot.sendMessage(chatId, welcomeText, {
            reply_markup: getMainMenu()
        });
    } catch (error) {
        log(`Ошибка обработки /start:`, error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при регистрации. Попробуйте ещё раз.');
    }
});

// Обработчик текстовых сообщений (промокоды)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    // Игнорируем команды
    if (text && text.startsWith('/')) {
        return;
    }

    // Проверяем, являет��я ли сообщение промокодом
    if (text && text.length >= 3 && text.length <= 20) {
        log(`Возможный промокод от ${userId}: ${text}`);
        await usePromoCode(chatId, userId, text.toUpperCase());
    }
});

// Обработчик callback запросов
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    log(`Callback от пользователя ${userId}: ${data}`);

    try {
        await bot.answerCallbackQuery(query.id);

        // Регистрируем пользователя, если его нет
        const username = query.from.username || query.from.first_name;
        registerUser(userId, username);

        switch (data) {
            case 'main_menu':
                await bot.editMessageText('🌟 Главное меню StarKirby Bot', {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: getMainMenu()
                });
                break;

            case 'profile':
                await showProfile(chatId, userId);
                break;

            case 'daily_click':
                await dailyClick(chatId, userId);
                break;

            case 'tasks':
                await showTasks(chatId, userId);
                break;

            case 'referrals':
                const user = db.getUser(userId);
                const referralText = `⭐ **Получить звёзды через рефералов**

🔗 Ваш реферальный код: \`${user.referralCode}\`
👥 Ваших рефералов: ${user.totalReferrals}

💰 **Награды:**
• 1-й уровень: +3 ⭐ за каждого
• 2-й уровень: +0.05 ⭐ за каждого

📱 Поделитесь ссылкой:
https://t.me/StarKirbyBot?start=${user.referralCode}`;

                await bot.sendMessage(chatId, referralText, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'main_menu' }]]
                    }
                });
                break;

            case 'cases':
                await showCases(chatId, userId);
                break;

            case 'pets':
                await showPets(chatId, userId);
                break;

            case 'ratings':
                await showRatings(chatId);
                break;

            case 'lotteries':
                await showLotteries(chatId, userId);
                break;

            case 'withdrawal':
                const userBalance = db.getUser(userId).balance;
                const withdrawalText = `💰 **Вывод средств**

💳 Ваш баланс: ${userBalance} ⭐

Доступные суммы для вывода:`;

                const withdrawalKeyboard = {
                    inline_keyboard: []
                };

                const amounts = [15, 25, 50, 100];
                amounts.forEach(amount => {
                    if (userBalance >= amount) {
                        withdrawalKeyboard.inline_keyboard.push([{
                            text: `💰 Вывести ${amount} ⭐`,
                            callback_data: `withdraw_${amount}`
                        }]);
                    }
                });

                // Premium опция
                withdrawalKeyboard.inline_keyboard.push([{
                    text: '⭐ Premium Telegram (200⭐)',
                    callback_data: 'withdraw_premium'
                }]);

                withdrawalKeyboard.inline_keyboard.push([{ text: '🔙 Назад', callback_data: 'main_menu' }]);

                await bot.sendMessage(chatId, withdrawalText, {
                    parse_mode: 'Markdown',
                    reply_markup: withdrawalKeyboard
                });
                break;

            default:
                // Обработка динамических callback'ов
                if (data.startsWith('complete_task_')) {
                    const taskId = parseInt(data.replace('complete_task_', ''));
                    await completeTask(chatId, userId, taskId);
                } else if (data.startsWith('open_case_')) {
                    const caseType = data.replace('open_case_', '');
                    await openCase(chatId, userId, caseType);
                } else if (data.startsWith('buy_pet_')) {
                    const petId = parseInt(data.replace('buy_pet_', ''));
                    await buyPet(chatId, userId, petId);
                } else if (data.startsWith('upgrade_pet_')) {
                    const petId = parseInt(data.replace('upgrade_pet_', ''));
                    // Логика улучшения питомца аналогична покупке
                    await buyPet(chatId, userId, petId);
                } else if (data.startsWith('buy_lottery_')) {
                    const lotteryId = parseInt(data.replace('buy_lottery_', ''));
                    await buyLotteryTicket(chatId, userId, lotteryId);
                } else if (data.startsWith('withdraw_')) {
                    const amountStr = data.replace('withdraw_', '');
                    if (amountStr === 'premium') {
                        await createWithdrawal(chatId, userId, 200);
                    } else {
                        const amount = parseInt(amountStr);
                        await createWithdrawal(chatId, userId, amount);
                    }
                }
                break;
        }
    } catch (error) {
        log(`Ошибка обработки callback:`, error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте ещё раз.');
    }
});

// Обработчик ошибок
bot.on('error', (error) => {
    log('Ошибка бота:', error.message);
});

// Запуск бота
console.log('✅ StarKirby Bot запущен и готов к работе!');
log('Бот успешно запущен');
