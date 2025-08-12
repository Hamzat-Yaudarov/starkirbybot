const SafeMessageHelper = require('../utils/safeMessageHelper');

class SimplePetController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
    }

    // Простое логирование для отладки
    log(message, data = null) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] PET: ${message}`, data ? JSON.stringify(data) : '');
    }

    // Показать питомцев пользователя
    async showPets(chatId, userId, messageId = null) {
        try {
            this.log('Показ питомцев для пользователя', { userId });

            // Получаем данные пользователя
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (!user) {
                this.log('Пользователь не найден', { userId });
                const errorMsg = '❌ Пользователь не найден';
                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot, errorMsg, {
                        chat_id: chatId,
                        message_id: messageId
                    });
                } else {
                    await this.bot.sendMessage(chatId, errorMsg);
                }
                return;
            }

            this.log('Данные пользователя получены', { balance: user.balance, id: user.id });

            // Получаем питомцев пользователя - ПРОСТОЙ ЗАПРОС
            const userPets = await this.db.all(`
                SELECT up.id as user_pet_id, up.level, p.name, p.description, p.boost_multiplier, p.base_price, p.max_level, p.boost_type
                FROM user_pets up
                JOIN pets p ON up.pet_id = p.id
                WHERE up.user_id = ?
                ORDER BY up.id ASC
            `, [userId]);

            this.log('Питомцы пользователя получены', { count: userPets.length, pets: userPets });

            // Считаем общий буст
            let totalBoost = 0;
            userPets.forEach(pet => {
                totalBoost += pet.boost_multiplier * pet.level;
            });

            const boostPercent = (totalBoost * 100).toFixed(1);

            let message = `🐾 Ваши питомцы:

💰 Баланс: ${user.balance.toFixed(2)} ⭐
📈 Общий буст: +${boostPercent}%

`;

            if (userPets.length === 0) {
                message += `😔 У вас пока нет питомцев

🎯 Питомцы увеличивают ваш доход от:
• Ежедневных кликов
• Наград за задания
• Других источников дохода

💡 Купите своего первого питомца!`;
            } else {
                message += `👥 Ваши питомцы:

`;
                userPets.forEach((pet, index) => {
                    const levelBoost = pet.boost_multiplier * pet.level;
                    const petBoostPercent = (levelBoost * 100).toFixed(1);
                    
                    message += `${index + 1}. ${pet.name} (Ур.${pet.level}/${pet.max_level})
   📈 Буст: +${petBoostPercent}% (${pet.boost_type})
   📝 ${pet.description}

`;
                });
            }

            const keyboard = [
                [{ text: '🛒 Купить питомца', callback_data: 'simple_pet_shop' }]
            ];

            if (userPets.length > 0) {
                keyboard.push([{ text: '⬆️ Улучшить питомцев', callback_data: 'simple_pet_upgrade' }]);
            }

            keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main_menu' }]);

            if (messageId) {
                await SafeMessageHelper.safeEditMessage(this.bot, message, {
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
            this.log('Ошибка при показе питомцев', { error: error.message, userId });
            console.error('Error showing pets:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке питомцев. Попробуйте позже.');
        }
    }

    // Показать магазин питомцев
    async showPetShop(chatId, userId, messageId = null) {
        try {
            this.log('Показ магазина питомцев', { userId });

            const user = await this.db.get('SELECT balance FROM users WHERE id = ?', [userId]);
            if (!user) {
                await this.bot.sendMessage(chatId, '❌ Пользователь не найден');
                return;
            }

            // Получаем доступных питомцев (убираем is_active для совместимости)
            const availablePets = await this.db.all('SELECT * FROM pets ORDER BY base_price ASC');
            
            // Получаем уже купленных питомцев
            const ownedPetIds = await this.db.all('SELECT pet_id FROM user_pets WHERE user_id = ?', [userId]);
            const ownedIds = ownedPetIds.map(p => p.pet_id);

            this.log('Данные магазина получены', { 
                userBalance: user.balance, 
                availablePets: availablePets.length,
                ownedPets: ownedIds.length 
            });

            let message = `🛒 **Магазин питомцев**

💰 Ваш баланс: ${user.balance.toFixed(2)} ⭐

🐾 **Доступные питомцы:**

`;

            const keyboard = [];
            let petCount = 0;

            availablePets.forEach(pet => {
                const isOwned = ownedIds.includes(pet.id);
                const canAfford = user.balance >= pet.base_price;
                
                let status = '';
                if (isOwned) {
                    status = ' ✅ КУПЛЕН';
                } else if (!canAfford) {
                    status = ' 💸 Недостаточно звёзд';
                }

                message += `${++petCount}. **${pet.name}** - ${pet.base_price} ⭐${status}
   📈 Буст: +${(pet.boost_multiplier * 100).toFixed(1)}% (${pet.boost_type})
   📝 ${pet.description}

`;

                // Добавляем кнопку только если питомец не куплен и есть деньги
                if (!isOwned && canAfford) {
                    keyboard.push([{
                        text: `🛒 Купить ${pet.name} (${pet.base_price} ⭐)`,
                        callback_data: `simple_buy_pet_${pet.id}`
                    }]);
                }
            });

            keyboard.push([{ text: '🐾 Мои питомцы', callback_data: 'simple_my_pets' }]);
            keyboard.push([{ text: '🏠 Главное меню', callback_data: 'main_menu' }]);

            if (messageId) {
                await SafeMessageHelper.safeEditMessage(this.bot, message, {
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
            this.log('Ошибка при показе магазина', { error: error.message, userId });
            console.error('Error showing pet shop:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке магазина. Попробуйте позже.');
        }
    }

    // ПРОСТАЯ покупка питомца - БЕЗ КООРДИНАТОРОВ И ТРАНЗАКЦИЙ!
    async buyPet(chatId, userId, petId, messageId = null) {
        try {
            this.log('Начало покупки питомца', { userId, petId });

            // 1. Получаем данные пользователя
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (!user) {
                this.log('Пользователь не найден при покупке', { userId });
                await this.bot.sendMessage(chatId, '❌ Пользователь не найден');
                return;
            }

            this.log('Пользователь найден', { userId, balance: user.balance });

            // 2. Получаем данные питомца (убираем is_active для совместимости)
            const pet = await this.db.get('SELECT * FROM pets WHERE id = ?', [petId]);
            if (!pet) {
                this.log('Питомец не найден', { petId });
                await this.bot.sendMessage(chatId, '❌ Питомец не найден');
                return;
            }

            this.log('Питомец найден', { petId, name: pet.name, price: pet.base_price });

            // 3. Проверяем, что питомец ещё не куплен
            const existingPet = await this.db.get('SELECT id FROM user_pets WHERE user_id = ? AND pet_id = ?', [userId, petId]);
            if (existingPet) {
                this.log('Питомец уже куплен', { userId, petId });
                await this.bot.sendMessage(chatId, '❌ У вас уже есть этот питомец');
                return;
            }

            // 4. Проверяем баланс
            if (user.balance < pet.base_price) {
                this.log('Недостаточно средств', { balance: user.balance, price: pet.base_price });
                await this.bot.sendMessage(chatId, `❌ Недостаточно звёзд! Нужно: ${pet.base_price} ⭐, у вас: ${user.balance.toFixed(2)} ⭐`);
                return;
            }

            this.log('Все проверки пройдены, начинаем покупку');

            // 5. ПРОСТЫЕ ОПЕРАЦИИ - одна за другой
            this.log('Операция 1: Списание баланса');
            await this.db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [pet.base_price, userId]);
            
            this.log('Операция 2: Добавление питомца');
            const insertResult = await this.db.run('INSERT INTO user_pets (user_id, pet_id, level) VALUES (?, ?, ?)', [userId, petId, 1]);
            
            this.log('Операция 3: Запись транзакции');
            await this.db.run('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)', [userId, 'pet', -pet.base_price, `Покупка питомца: ${pet.name}`]);

            this.log('Все операции выполнены', { insertedPetId: insertResult.id });

            // 6. Проверяем результат
            const updatedUser = await this.db.get('SELECT balance FROM users WHERE id = ?', [userId]);
            const newUserPet = await this.db.get('SELECT * FROM user_pets WHERE id = ?', [insertResult.id]);
            
            this.log('Результат покупки', { 
                oldBalance: user.balance,
                newBalance: updatedUser.balance,
                difference: user.balance - updatedUser.balance,
                expectedDifference: pet.base_price,
                petCreated: !!newUserPet
            });

            // 7. Отправляем подтверждение
            const successMsg = `🎉 Поздравляем с покупкой!

🐾 Вы купили: ${pet.name}
💰 Потрачено: ${pet.base_price} ⭐
💎 Остаток: ${updatedUser.balance.toFixed(2)} ⭐

📈 Ваш доход увеличился на ${(pet.boost_multiplier * 100).toFixed(1)}%!
✨ Питомец начнёт помогать вам прямо сейчас.`;

            const keyboard = [
                [{ text: '🛒 Купить ещё питомца', callback_data: 'simple_pet_shop' }],
                [{ text: '🐾 Мои питомцы', callback_data: 'simple_my_pets' }],
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

            this.log('Покупка успешно завершена');

        } catch (error) {
            this.log('ОШИБКА при покупке питомца', { 
                error: error.message, 
                stack: error.stack,
                userId, 
                petId 
            });
            console.error('Error buying pet:', error);
            await this.bot.sendMessage(chatId, '❌ Ошибка при покупке питомца. Попробуйте позже.');
        }
    }

    // Обработка callback-ов
    async handleCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        this.log('Обработка callback', { data, userId });

        try {
            if (data === 'simple_my_pets') {
                await this.showPets(chatId, userId, msg.message_id);
            } else if (data === 'simple_pet_shop') {
                await this.showPetShop(chatId, userId, msg.message_id);
            } else if (data.startsWith('simple_buy_pet_')) {
                const petId = parseInt(data.split('_')[3]);
                await this.buyPet(chatId, userId, petId, msg.message_id);
            }
        } catch (error) {
            this.log('Ошибка в callback', { error: error.message, data });
            console.error('Error in pet callback:', error);
        }
    }
}

module.exports = SimplePetController;
