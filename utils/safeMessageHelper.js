// Safe message editing utility to prevent "message not modified" errors
class SafeMessageHelper {
    static async safeEditMessage(bot, text, options) {
        try {
            if (options.message_id) {
                await bot.editMessageText(text, options);
            } else {
                const { message_id, ...sendOptions } = options;
                await bot.sendMessage(options.chat_id, text, sendOptions);
            }
        } catch (error) {
            // If edit fails because message is the same, silently ignore
            if (error.message.includes('message is not modified') ||
                error.message.includes('exactly the same as a current content') ||
                error.message.includes('message content and reply markup are exactly the same') ||
                (error.code === 'ETELEGRAM' && error.response && error.response.body && 
                 error.response.body.description && 
                 error.response.body.description.includes('message is not modified'))) {
                console.log('Message content unchanged, skipping edit');
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

    static async safeAnswerCallback(bot, callbackQueryId, text = '', showAlert = false) {
        try {
            await bot.answerCallbackQuery(callbackQueryId, {
                text: text,
                show_alert: showAlert
            });
        } catch (error) {
            if (!error.message.includes('query is too old')) {
                console.error('Error answering callback query:', error);
            }
        }
    }
}

module.exports = SafeMessageHelper;
