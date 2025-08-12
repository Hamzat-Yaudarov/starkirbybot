const cron = require('node-cron');

class WeeklyRewardsController {
    constructor(database, bot) {
        this.db = database;
        this.bot = bot;
        this.adminId = 6910097562;
        
        // Запускаем cron задачу каждое воскресенье в 20:00 по МСК
        this.startWeeklyRewards();
    }

    startWeeklyRewards() {
        // Cron выражение: каждое воскресенье в 20:00 по МСК (UTC+3)
        // 0 17 * * 0 - это 17:00 UTC (20:00 МСК) каждое воскресенье
        cron.schedule('0 17 * * 0', async () => {
            console.log('🏆 Starting weekly rewards distribution...');
            await this.distributeWeeklyRewards();
        }, {
            timezone: "Europe/Moscow"
        });

        console.log('✅ Weekly rewards cron job scheduled for every Sunday at 20:00 MSK');
    }

    async distributeWeeklyRewards() {
        try {
            console.log('📊 Calculating weekly top 5 users...');
            
            // Получаем топ-5 пользователей по рефералам за всё время
            const topUsers = await this.db.all(`
                SELECT 
                    id, 
                    username, 
                    first_name, 
                    level1_referrals,
                    balance
                FROM users
                WHERE level1_referrals > 0
                ORDER BY level1_referrals DESC, registration_date ASC
                LIMIT 5
            `);

            if (topUsers.length === 0) {
                console.log('❌ No users with referrals found');
                await this.bot.sendMessage(this.adminId, '📊 Еженедельные награды: пользователей с рефералами не найдено');
                return;
            }

            // Призы за места
            const rewards = [100, 75, 50, 25, 15];
            const places = ['🥇', '🥈', '🥉', '🏅', '🎖'];
            const placeNames = ['1 место', '2 место', '3 место', '4 место', '5 место'];

            let adminMessage = `🏆 ЕЖЕНЕДЕЛЬНЫЕ НАГРАДЫ РАСПРЕДЕЛЕНЫ!\n\n📅 ${new Date().toLocaleDateString('ru-RU')}\n\n`;
            let winnersMessage = `🎉 **ПОЗДРАВЛЯЕМ ПОБЕДИТЕЛЕЙ НЕДЕЛИ!**\n\n`;

            // Распределяем награды
            for (let i = 0; i < topUsers.length; i++) {
                const user = topUsers[i];
                const reward = rewards[i];
                const place = places[i];
                const placeName = placeNames[i];

                // Начисляем ��аграду
                await this.db.run(
                    'UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
                    [reward, reward, user.id]
                );

                // Записываем транзакцию
                await this.db.run(
                    'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                    [user.id, 'weekly_reward', reward, `Еженедельная награда - ${placeName}`]
                );

                const userName = user.username ? `@${user.username}` : user.first_name;

                adminMessage += `${place} ${placeName}: ${userName} (${user.level1_referrals} реф.) → +${reward} ⭐\n`;
                winnersMessage += `${place} **${placeName}** — ${userName}\n🎁 Награда: **${reward} ⭐**\n👥 Рефералов: ${user.level1_referrals}\n\n`;

                // Отправляем личное уведомление победителю
                try {
                    const personalMessage = `🎉 **ПОЗДРАВЛЯЕМ!**

${place} Вы заняли **${placeName}** в еженедельном рейтинге!

🏆 **Ваша награда: ${reward} ⭐ звёзд**
👥 Приглашённых рефералов: ${user.level1_referrals}

💰 Награда уже зачислена на ваш баланс!

🔥 Продолжайте приглашать друзей и побеждайте каждую неделю!`;

                    await this.bot.sendMessage(user.id, personalMessage, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '🏠 Главное меню', callback_data: 'main_menu' },
                                    { text: '👥 Пригласить друга', callback_data: 'show_referral' }
                                ]
                            ]
                        }
                    });
                } catch (error) {
                    console.log(`Failed to send personal reward message to user ${user.id}`);
                }
            }

            // Отправляем сводку админу
            await this.bot.sendMessage(this.adminId, adminMessage);

            // Отправляем объявление всем пользователям о победителях
            winnersMessage += `\n🔥 **Новая неделя — новые возможности!**\n\n👥 Приглашай друзей �� п��пади в топ-5 на следующей неделе!`;

            const allUsers = await this.db.all('SELECT id FROM users');
            let sentCount = 0;
            let failCount = 0;

            for (const user of allUsers) {
                try {
                    await this.bot.sendMessage(user.id, winnersMessage, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '🏠 Главное меню', callback_data: 'main_menu' },
                                    { text: '👥 Пригласить друга', callback_data: 'show_referral' }
                                ]
                            ]
                        }
                    });
                    sentCount++;

                    // Небольшая задержка для избежания лимитов
                    if (sentCount % 20 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    failCount++;
                }
            }

            console.log(`✅ Weekly rewards distributed! Sent to ${sentCount} users, failed: ${failCount}`);
            await this.bot.sendMessage(this.adminId, `📊 Рассылка о победителях завершена!\n✅ Доставлено: ${sentCount}\n❌ Не доставлено: ${failCount}`);

        } catch (error) {
            console.error('Error distributing weekly rewards:', error);
            await this.bot.sendMessage(this.adminId, `❌ Ошибка при распределении еженедельных наград: ${error.message}`);
        }
    }

    // Ручной запуск распределения наград (для тестирования)
    async manualDistributeRewards(chatId, userId) {
        if (userId !== this.adminId) {
            await this.bot.sendMessage(chatId, '❌ Нет доступа');
            return;
        }

        await this.bot.sendMessage(chatId, '🏆 Запускаю ручное распределение еженедельных наград...');
        await this.distributeWeeklyRewards();
    }

    // Проверка следующего времени награждения
    async getNextRewardTime(chatId, userId) {
        if (userId !== this.adminId) return;

        const now = new Date();
        const nextSunday = new Date();
        
        // Находим следующее воскресенье
        const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
        nextSunday.setDate(now.getDate() + daysUntilSunday);
        nextSunday.setHours(20, 0, 0, 0);

        // Если сегодня воскресенье и время еще не прошло
        if (now.getDay() === 0 && now.getHours() < 20) {
            nextSunday.setDate(now.getDate());
        }

        const timeLeft = nextSunday - now;
        const daysLeft = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
        const hoursLeft = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        await this.bot.sendMessage(chatId, `⏰ Следующее распределение наград:\n📅 ${nextSunday.toLocaleString('ru-RU')}\n⏳ Осталось: ${daysLeft} дней ${hoursLeft} часов`);
    }
}

module.exports = WeeklyRewardsController;
