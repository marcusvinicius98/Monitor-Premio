const axios = require('axios');

const message = process.argv.slice(2).join(' ') || '🚨 Alteração detectada!';
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  console.error('❌ TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não estão definidos.');
  process.exit(1);
}

const url = `https://api.telegram.org/bot${token}/sendMessage`;

axios.post(url, {
  chat_id: chatId,
  text: message,
  parse_mode: 'HTML',
  disable_web_page_preview: true,
})
.then(() => {
  console.log('✅ Mensagem enviada com sucesso via Telegram.');
})
.catch(err => {
  console.error('❌ Falha ao enviar mensagem:', err.message);
  process.exit(1);
});
