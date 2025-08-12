const SafeMessageHelper = require('../utils/safeMessageHelper');
const InstanceCoordinator = require('../utils/instanceCoordinator');

class PetController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
        this.coordinator = null; // Will be initialized later
    }

    // Initialize coordinator after database is ready
    async initCoordinator() {
        if (!this.coordinator) {
            this.coordinator = new InstanceCoordinator(this.db);
            await this.coordinator.init();
        }
    }

    // Show pets menu
    async showPets(chatId, userId, messageId = null) {
        try {
            const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
            if (!user) {
                const errorMsg = '❌ По��ьзователь не найден';
                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot,errorMsg, {
                        chat_id: chatId,
                        message_id: messageId
                    });
                } else {
                    await this.bot.sendMessage(chatId, errorMsg);
                }
                return;
            }

            // Get user's pets
            const userPets = await this.db.all(`
                SELECT up.id, up.level, p.name, p.description, p.boost_multiplier, p.base_price, p.max_level
                FROM user_pets up
                JOIN pets p ON up.pet_id = p.id
                WHERE up.user_id = ?
                ORDER BY up.id ASC
            `, [userId]);

            // Calculate total boost (additive system)
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
• Ежедневных клико��
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
   📈 Буст: +${petBoostPercent}%
   📝 ${pet.description}

`;
                });
            }

            const keyboard = [
                [{ text: '🛒 Купить питомца', callback_data: 'pet_shop' }]
            ];

            if (userPets.length > 0) {
                keyboard.push([{ text: '⬆️ Улучшить питомцев', callback_data: 'pet_upgrade' }]);
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
            console.error('Error showing pets:', error);
            if (messageId) {
                try {
                    await SafeMessageHelper.safeEditMessage(this.bot,'❌ Ошибка при загрузке питомцев', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🏠 Главное меню', callback_data: 'main_menu' }
                            ]]
                        }
                    });
                } catch (editError) {
                    await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке питомцев');
                }
            } else {
                await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке питомцев');
            }
        }
    }

    // Show pet shop
    async showPetShop(chatId, userId, messageId = null) {
        try {
            const user = await this.db.get('SELECT balance FROM users WHERE id = ?', [userId]);
            const availablePets = await this.db.all(`
                SELECT p.* FROM pets p
                WHERE p.id NOT IN (
                    SELECT pet_id FROM user_pets WHERE user_id = ?
                )
                ORDER BY p.base_price ASC
            `, [userId]);

            if (availablePets.length === 0) {
                const noPetsMessage = `🎉 Поздравляем!

Вы купили всех доступных питомцев!
Теперь вы можете только улучшать их уровни.`;

                const noPetsKeyboard = [
                    [{ text: '⬆️ Улучшить питомцев', callback_data: 'pet_upgrade' }],
                    [{ text: '🔙 Назад к питомцам', callback_data: 'pet_back' }]
                ];

                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot,noPetsMessage, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: noPetsKeyboard
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, noPetsMessage, {
                        reply_markup: {
                            inline_keyboard: noPetsKeyboard
                        }
                    });
                }
                return;
            }

            let message = `🛒 Магазин питомцев:

💰 Ваш баланс: ${user.balance.toFixed(2)} ⭐

🐾 Доступные питомцы:

`;

            const keyboard = [];
            
            // Limit to first 3 pets to avoid message being too long
            const displayPets = availablePets.slice(0, 3);
            displayPets.forEach((pet, index) => {
                const boostPercent = (pet.boost_multiplier * 100).toFixed(1);
                // Limit description length
                const shortDescription = pet.description.length > 30 ? 
                    pet.description.substring(0, 30) + '...' : pet.description;
                
                message += `${index + 1}. ${pet.name} - ${pet.base_price} ⭐
   📈 Буст: +${boostPercent}%
   📝 ${shortDescription}

`;
                
                const canAfford = user.balance >= pet.base_price;
                const buttonText = canAfford ? 
                    `💰 ${pet.name} (${pet.base_price} ⭐)` : 
                    `❌ ${pet.name} (${pet.base_price} ⭐)`;
                
                keyboard.push([{
                    text: buttonText,
                    callback_data: canAfford ? `pet_buy_${pet.id}` : 'pet_cant_afford'
                }]);
            });

            keyboard.push([{ text: '🔙 Назад к питомцам', callback_data: 'pet_back' }]);

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
            console.error('Error showing pet shop:', error);
            if (messageId) {
                try {
                    await SafeMessageHelper.safeEditMessage(this.bot,'❌ Ошибка при загруз��е магазина', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад к питомцам', callback_data: 'pet_back' }
                            ]]
                        }
                    });
                } catch (editError) {
                    await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке магазина');
                }
            } else {
                await this.bot.sendMessage(chatId, '❌ Ошибка при заг��узке магазина');
            }
        }
    }

    // Show pet upgrade menu
    async showPetUpgrade(chatId, userId, messageId = null) {
        try {
            const user = await this.db.get('SELECT balance FROM users WHERE id = ?', [userId]);
            const userPets = await this.db.all(`
                SELECT up.id, up.level, p.name, p.boost_multiplier, p.base_price, p.max_level
                FROM user_pets up
                JOIN pets p ON up.pet_id = p.id
                WHERE up.user_id = ?
                ORDER BY up.id ASC
            `, [userId]);

            if (userPets.length === 0) {
                const noPetsMessage = `😔 У вас не�� питомцев для улучшения

🛒 Сначала купите питомца в м��газине!`;

                const noPetsKeyboard = [[
                    { text: '🛒 Купить питомца', callback_data: 'pet_shop' }
                ], [
                    { text: '���� Главное меню', callback_data: 'main_menu' }
                ]];

                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot,noPetsMessage, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: noPetsKeyboard
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, noPetsMessage, {
                        reply_markup: {
                            inline_keyboard: noPetsKeyboard
                        }
                    });
                }
                return;
            }

            let message = `⬆️ Улучшение питомцев:

💰 Ваш баланс: ${user.balance.toFixed(2)} ⭐

🐾 Ваши п��томцы:

`;

            const keyboard = [];

            userPets.forEach((pet, index) => {
                const upgradeCost = this.calculateUpgradeCost(pet.base_price, pet.level);
                const currentBoost = (pet.boost_multiplier * pet.level * 100).toFixed(1);
                const nextBoost = (pet.boost_multiplier * (pet.level + 1) * 100).toFixed(1);
                
                message += `${index + 1}. ${pet.name} (Ур.${pet.level}/${pet.max_level})
   📈 Буст: +${currentBoost}% → +${nextBoost}%
   💰 Стоимость улучшения: ${upgradeCost} ⭐

`;

                if (pet.level < pet.max_level) {
                    const canAfford = user.balance >= upgradeCost;
                    const buttonText = canAfford ?
                        `⬆️ ${pet.name} до ур.${pet.level + 1} (${upgradeCost} ⭐)` :
                        `❌ ${pet.name} (${upgradeCost} ��)`;
                    
                    keyboard.push([{ 
                        text: buttonText, 
                        callback_data: canAfford ? `pet_upgrade_${pet.id}` : 'pet_cant_afford'
                    }]);
                } else {
                    keyboard.push([{ 
                        text: `✅ ${pet.name} (МАКС)`, 
                        callback_data: 'pet_max_level'
                    }]);
                }
            });

            keyboard.push([{ text: '🔙 Назад к питомцам', callback_data: 'pet_back' }]);

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
            console.error('Error showing pet upgrade:', error);
            if (messageId) {
                try {
                    await SafeMessageHelper.safeEditMessage(this.bot,'❌ Ошибка п��и загрузке улучшений', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад к питомцам', callback_data: 'pet_back' }
                            ]]
                        }
                    });
                } catch (editError) {
                    await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке улучшений');
                }
            } else {
                await this.bot.sendMessage(chatId, '❌ Ошибка при загрузке улучшений');
            }
        }
    }

    // Calculate upgrade cost
    calculateUpgradeCost(basePrice, currentLevel) {
        // Cost increases by 50% each level
        return Math.round(basePrice * Math.pow(1.5, currentLevel) * 100) / 100;
    }

    // Handle pet callbacks
    async handlePetCallback(callbackQuery) {
        const msg = callbackQuery.message;
        const data = callbackQuery.data;
        const chatId = msg.chat.id;
        const userId = callbackQuery.from.id;

        try {
            if (data === 'pet_shop') {
                await this.showPetShop(chatId, userId, msg.message_id);
            } else if (data === 'pet_upgrade') {
                await this.showPetUpgrade(chatId, userId, msg.message_id);
            } else if (data === 'pet_back') {
                await this.showPets(chatId, userId, msg.message_id);
            } else if (data.startsWith('pet_buy_')) {
                const petId = parseInt(data.split('_')[2]);
                await this.buyPet(chatId, userId, petId, msg.message_id);
            } else if (data.startsWith('pet_upgrade_')) {
                const userPetId = parseInt(data.split('_')[2]);
                await this.upgradePet(chatId, userId, userPetId, msg.message_id);
            } else if (data === 'pet_cant_afford') {
                await this.bot.answerCallbackQuery(callbackQuery.id, '❌ Недостаточ��о звёзд!', true);
            } else if (data === 'pet_max_level') {
                await this.bot.answerCallbackQuery(callbackQuery.id, '✅ Питомец уже максимального уровня!', true);
            }
        } catch (error) {
            console.error('Error handling pet callback:', error);
            try {
                await SafeMessageHelper.safeEditMessage(this.bot,'❌ Ошибка при обработке действия', {
                    chat_id: chatId,
                    message_id: msg.message_id,
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔙 Назад к питомцам', callback_data: 'pet_back' }
                        ]]
                    }
                });
            } catch (editError) {
                await this.bot.sendMessage(chatId, '❌ Ошибка при обработке действия');
            }
        }
    }

    // Buy a pet
    async buyPet(chatId, userId, petId, messageId = null) {
        const lockKey = `pet_buy_${userId}_${petId}`;

        try {
            // Ensure coordinator is initialized
            if (!this.coordinator) {
                await this.initCoordinator();
            }

            // Use database transaction to ensure data consistency
            const result = await this.coordinator.lockedTransaction(lockKey, async () => {
                // Get data for validation (coordinator ensures consistency)
                const user = await this.db.get('SELECT balance FROM users WHERE id = ?', [userId]);
                const pet = await this.db.get('SELECT * FROM pets WHERE id = ?', [petId]);
                const existingPet = await this.db.get('SELECT id FROM user_pets WHERE user_id = ? AND pet_id = ?', [userId, petId]);

                if (!user || !pet) {
                    throw new Error('USER_OR_PET_NOT_FOUND');
                }

                if (existingPet) {
                    throw new Error('PET_ALREADY_OWNED');
                }

                if (user.balance < pet.base_price) {
                    throw new Error('INSUFFICIENT_BALANCE');
                }

                console.log(`💳 Before purchase: User ${userId} balance = ${user.balance}, pet cost = ${pet.base_price}`);

                // Execute purchase operations (coordinator already provides transaction safety)
                await this.db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [pet.base_price, userId]);

                const insertResult = await this.db.run('INSERT INTO user_pets (user_id, pet_id) VALUES (?, ?)', [userId, petId]);

                await this.db.run('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)', [userId, 'pet', -pet.base_price, `Покупка питомца: ${pet.name}`]);

                const updatedUser = await this.db.get('SELECT balance FROM users WHERE id = ?', [userId]);

                console.log(`✅ Pet purchased successfully: User ${userId} bought pet ${petId} (${pet.name}) for ${pet.base_price} stars`);
                console.log(`💰 Transaction verified: Previous balance: ${user.balance}, Cost: ${pet.base_price}, Final balance: ${updatedUser.balance}`);

                return {
                    success: true,
                    pet,
                    remainingBalance: updatedUser.balance,
                    userPetId: insertResult.id
                };
            });

            const boostPercent = (result.pet.boost_multiplier * 100).toFixed(1);
            const successMsg = `🎉 Поздравляем с покупкой!

🐾 Вы купили: ${result.pet.name}
💰 Потрачено: ${result.pet.base_price} ⭐
💎 Остаток: ${result.remainingBalance.toFixed(2)} ⭐

📈 Ваш питомец даёт буст +${boostPercent}% к доходу!
⬆️ Улучшайте питомца, чтобы увеличить буст!`;

            if (messageId) {
                await SafeMessageHelper.safeEditMessage(this.bot, successMsg, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⬆️ Улуч��ить питомца', callback_data: 'pet_upgrade' }],
                            [{ text: '🐾 Мои питомцы', callback_data: 'pet_back' }]
                        ]
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, successMsg, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⬆️ Улучшить питомца', callback_data: 'pet_upgrade' }],
                            [{ text: '🐾 Мо�� питомцы', callback_data: 'pet_back' }]
                        ]
                    }
                });
            }

        } catch (error) {
            console.error('Error buying pet:', error);

            let errorMsg = '❌ Ошибка при покупке питомца';
            let backButton = 'pet_back';

            if (error.message === 'USER_OR_PET_NOT_FOUND') {
                errorMsg = '❌ Пользователь или питомец не найден';
            } else if (error.message === 'PET_ALREADY_OWNED') {
                errorMsg = '❌ У вас уже есть этот питомец!';
                backButton = 'pet_shop';
            } else if (error.message === 'INSUFFICIENT_BALANCE') {
                errorMsg = '❌ Недоста��очно звёзд для покупки!';
                backButton = 'pet_shop';
            }

            if (messageId) {
                try {
                    await SafeMessageHelper.safeEditMessage(this.bot, errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад', callback_data: backButton }
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

    // Upgrade a pet
    async upgradePet(chatId, userId, userPetId, messageId = null) {
        try {
            const user = await this.db.get('SELECT balance FROM users WHERE id = ?', [userId]);
            const userPet = await this.db.get(`
                SELECT up.id, up.level, p.name, p.boost_multiplier, p.base_price, p.max_level
                FROM user_pets up
                JOIN pets p ON up.pet_id = p.id
                WHERE up.id = ? AND up.user_id = ?
            `, [userPetId, userId]);

            if (!user || !userPet) {
                const errorMsg = '❌ Питомец не найден';
                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot,errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад к питомцам', callback_data: 'pet_back' }
                            ]]
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, errorMsg);
                }
                return;
            }

            if (userPet.level >= userPet.max_level) {
                const errorMsg = '❌ Питомец уже максимального уровня!';
                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot,errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад к улучшениям', callback_data: 'pet_upgrade' }
                            ]]
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, errorMsg);
                }
                return;
            }

            const upgradeCost = this.calculateUpgradeCost(userPet.base_price, userPet.level);

            if (user.balance < upgradeCost) {
                const errorMsg = '❌ Недостаточно звёзд для улучшения!';
                if (messageId) {
                    await SafeMessageHelper.safeEditMessage(this.bot,errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад к улучшениям', callback_data: 'pet_upgrade' }
                            ]]
                        }
                    });
                } else {
                    await this.bot.sendMessage(chatId, errorMsg);
                }
                return;
            }

            // Upgrade pet operations
            await this.db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [upgradeCost, userId]);
            await this.db.run('UPDATE user_pets SET level = level + 1 WHERE id = ?', [userPetId]);
            await this.db.run('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)', [userId, 'pet', -upgradeCost, `Улучшение ${userPet.name} до ур.${userPet.level + 1}`]);

            const newLevel = userPet.level + 1;
            const newBoost = (userPet.boost_multiplier * newLevel * 100).toFixed(1);
            const successMsg = `⬆️ Питомец улучшен!

🐾 ${userPet.name} теперь ${newLevel} уровня!
💰 Потрач��но: ${upgradeCost} ⭐
💎 Остаток: ${(user.balance - upgradeCost).toFixed(2)} ⭐

📈 Новый буст: +${newBoost}%
✨ Ваш доход увеличился!`;

            if (messageId) {
                await SafeMessageHelper.safeEditMessage(this.bot,successMsg, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⬆️ Улучшить ещё', callback_data: 'pet_upgrade' }],
                            [{ text: '🐾 Мои питомцы', callback_data: 'pet_back' }]
                        ]
                    }
                });
            } else {
                await this.bot.sendMessage(chatId, successMsg, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⬆️ Улучшить ещё', callback_data: 'pet_upgrade' }],
                            [{ text: '🐾 Мои питомцы', callback_data: 'pet_back' }]
                        ]
                    }
                });
            }

        } catch (error) {
            console.error('Error upgrading pet:', error);
            const errorMsg = '❌ Ошибка при улучшении питомца';
            if (messageId) {
                try {
                    await SafeMessageHelper.safeEditMessage(this.bot,errorMsg, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад к питомцам', callback_data: 'pet_back' }
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

    // Get user's total pet boost
    async getUserPetBoost(userId) {
        try {
            const userPets = await this.db.all(`
                SELECT p.boost_multiplier, up.level 
                FROM user_pets up 
                JOIN pets p ON up.pet_id = p.id 
                WHERE up.user_id = ?
            `, [userId]);

            let totalBoost = 0;
            userPets.forEach(pet => {
                totalBoost += pet.boost_multiplier * pet.level;
            });

            return totalBoost;
        } catch (error) {
            console.error('Error getting user pet boost:', error);
            return 1;
        }
    }
}

module.exports = PetController;
