// Простой тест базы данных для диагностики проблем
const Database = require('./database');

async function testDatabase() {
    console.log('🔍 Тестирование базы данных...');
    
    const db = new Database();
    await db.init();
    
    // Тест 1: Создание пользователя
    console.log('\n📝 Тест 1: Создание пользователя');
    const testUserId = 999999999;
    
    // Удаляем если есть
    await db.run('DELETE FROM user_pets WHERE user_id = ?', [testUserId]);
    await db.run('DELETE FROM transactions WHERE user_id = ?', [testUserId]);
    await db.run('DELETE FROM users WHERE id = ?', [testUserId]);
    
    // Создаём тестового пользователя
    await db.run(
        'INSERT INTO users (id, username, first_name, balance, referral_code, level1_referrals, level2_referrals, total_earned) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [testUserId, 'test_user', 'Тест', 100, 'TEST123', 0, 0, 0]
    );
    
    // Проверяем что создался
    const user = await db.get('SELECT * FROM users WHERE id = ?', [testUserId]);
    console.log('Создан пользователь:', user);
    
    // Тест 2: Покупка питомца
    console.log('\n🐾 Тест 2: Покупка питомца');
    
    // Получаем первого питомца
    const pet = await db.get('SELECT * FROM pets LIMIT 1');
    console.log('Питомец для покупки:', pet);
    
    if (pet) {
        // Покупаем питомца
        console.log(`💰 До покупки: баланс = ${user.balance}`);
        
        // Простые операции без транзакций
        await db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [pet.base_price, testUserId]);
        const insertResult = await db.run('INSERT INTO user_pets (user_id, pet_id, level) VALUES (?, ?, ?)', [testUserId, pet.id, 1]);
        await db.run('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)', [testUserId, 'pet', -pet.base_price, `Тест покупки: ${pet.name}`]);
        
        console.log('✅ Операции покупки выполнены');
        console.log('ID купленного питомца:', insertResult.id);
        
        // Проверяем результат
        const updatedUser = await db.get('SELECT * FROM users WHERE id = ?', [testUserId]);
        const userPet = await db.get('SELECT * FROM user_pets WHERE user_id = ? AND pet_id = ?', [testUserId, pet.id]);
        const transaction = await db.get('SELECT * FROM transactions WHERE user_id = ? AND type = "pet" ORDER BY id DESC LIMIT 1', [testUserId]);
        
        console.log('\n📊 РЕЗУЛЬТАТЫ:');
        console.log('Баланс после покупки:', updatedUser.balance);
        console.log('Купленный питомец:', userPet);
        console.log('Транзакция:', transaction);
        
        // Проверяем, что данные сохранились корректно
        if (userPet && transaction && updatedUser.balance === (user.balance - pet.base_price)) {
            console.log('✅ ВСЁ РАБОТАЕТ ПРАВИЛЬНО!');
        } else {
            console.log('❌ ЕСТЬ ПРОБЛЕМЫ С ДАННЫМИ!');
        }
    }
    
    // Тест 3: Реферальная система
    console.log('\n👥 Тест 3: Реферальная система');
    
    const referralUserId = 999999998;
    await db.run('DELETE FROM users WHERE id = ?', [referralUserId]);
    
    // Создаём реферала
    await db.run(
        'INSERT INTO users (id, username, first_name, balance, referrer_id, referral_code, level1_referrals, level2_referrals, total_earned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [referralUserId, 'referral_user', 'Реферал', 0, testUserId, 'REF123', 0, 0, 0]
    );
    
    // Обновляем счётчик рефералов
    await db.run('UPDATE users SET level1_referrals = level1_referrals + 1 WHERE id = ?', [testUserId]);
    
    // Добавляем награду
    await db.run('UPDATE users SET balance = balance + 3, total_earned = total_earned + 3 WHERE id = ?', [testUserId]);
    await db.run('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)', [testUserId, 'referral', 3, 'Тест реферальной награды']);
    
    // Проверяем результат
    const userWithReferral = await db.get('SELECT * FROM users WHERE id = ?', [testUserId]);
    const referralUser = await db.get('SELECT * FROM users WHERE id = ?', [referralUserId]);
    const referralTransaction = await db.get('SELECT * FROM transactions WHERE user_id = ? AND type = "referral" ORDER BY id DESC LIMIT 1', [testUserId]);
    
    console.log('\n📊 РЕЗУЛЬТАТЫ РЕФЕРАЛЬНОЙ СИСТЕМЫ:');
    console.log('Пригласивший пользователь:', userWithReferral);
    console.log('Приглашённый пользователь:', referralUser);
    console.log('Транзакция награды:', referralTransaction);
    
    if (userWithReferral.level1_referrals === 1 && referralTransaction) {
        console.log('✅ РЕФЕРАЛЬНАЯ СИСТЕМА РАБОТАЕТ!');
    } else {
        console.log('❌ ПРОБЛЕМЫ С РЕФЕРАЛЬНОЙ СИСТЕМОЙ!');
    }
    
    // Очистка
    console.log('\n🧹 Очистка тестовых данных...');
    await db.run('DELETE FROM user_pets WHERE user_id = ?', [testUserId]);
    await db.run('DELETE FROM transactions WHERE user_id IN (?, ?)', [testUserId, referralUserId]);
    await db.run('DELETE FROM users WHERE id IN (?, ?)', [testUserId, referralUserId]);
    
    await db.close();
    console.log('✅ Тест завершён!');
}

// Запуск теста
testDatabase().catch(console.error);
