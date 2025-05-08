const axios = require('axios');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
let message = process.argv.slice(2).join(' ') || '🚨 Alteração detectada!';

const diffPath = path.resolve(__dirname, 'diff_table.txt');
if (fs.existsSync(diffPath)) {
  const rawDiff = fs.readFileSync(diffPath, 'utf8');
  const safeDiff = rawDiff
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 3500);
  message += `\n\n<b>🔍 Linhas alteradas:</b>\n<pre>${safeDiff}</pre>`;
}

message = message
  .replace(/&(?!amp;|lt;|gt;)/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

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