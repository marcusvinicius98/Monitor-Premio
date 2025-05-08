const axios = require('axios');

async function sendTelegramNotification(message) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!botToken || !chatId) {
        throw new Error('Variáveis de ambiente TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID são necessárias');
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    try {
        await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown'
        });
        console.log('Notificação enviada com sucesso!');
    } catch (error) {
        console.error('Erro ao enviar notificação:', error.message);
    }
}

module.exports = sendTelegramNotification;
