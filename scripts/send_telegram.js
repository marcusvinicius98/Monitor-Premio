const axios = require('axios');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  console.error('❌ TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não definidos.');
  process.exit(1);
}

let message = process.argv.slice(2).join(' ') || '🚨 Alteração detectada!';

// Se existir diff_table.txt, anexa o conteúdo com formatação
const diffPath = path.resolve(__dirname, 'diff_table.txt');
if (fs.existsSync(diffPath)) {
  const diffText = fs.readFileSync(diffPath, 'utf8');
  message += `\n\n<b>🔍 Linhas alteradas:</b>\n<pre>${diffText}</pre>`;
}

const url = `https://api.telegram.org/bot${token}/sendMessage`;

axios.post(url, {
  chat_id: chatId,
  text: message,
  parse_mode: 'HTML',
  disable_web_page_preview: true,
}).then(() => {
  console.log('✅ Mensagem enviada com sucesso via Telegram.');
}).catch(err => {
  console.error('❌ Erro ao enviar mensagem:', err.message);
  process.exit(1);
});
