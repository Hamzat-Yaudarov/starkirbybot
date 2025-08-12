#!/bin/bash
echo "🔍 Проверяем запущенные Node.js процессы..."
echo ""

# Ищем все Node.js процессы
echo "📋 Все Node.js процессы:"
ps aux | grep node | grep -v grep

echo ""
echo "🤖 Процессы с 'bot' в названии:"
ps aux | grep -i bot | grep -v grep

echo ""
echo "📁 Процессы в текущей директории:"
ps aux | grep $(pwd) | grep -v grep

echo ""
echo "🔍 Процессы с 'index.js':"
ps aux | grep index.js | grep -v grep

echo ""
echo "💡 Для остановки процесса используйте: kill <PID>"
echo "💡 Для принудительной остановки: kill -9 <PID>"
