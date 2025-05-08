const axios = require('axios');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const message = process.argv.slice(2).join(' ') || '🚨 Alteração detectada no painel CNJ!';

axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
  chat_id: chatId,
  text: message,
  parse_mode: 'HTML',
  disable_web_page_preview: true
}).then(() => {
  console.log('✅ Mensagem enviada.');
}).catch(err => {
  console.error('❌ Erro ao enviar mensagem:', err.response?.data || err.message);
  process.exit(1);
});
