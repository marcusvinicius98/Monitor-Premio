const axios = require('axios');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  console.error('❌ TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não definidos.');
  process.exit(1);
}

// Lê mensagem base passada via CLI
let message = process.argv.slice(2).join(' ') || '🚨 Alteração detectada!';

// Limite total do Telegram é 4096 — reservamos ~500 para a mensagem principal
const MAX_DIFF_LENGTH = 3500;

const diffPath = path.resolve(__dirname, 'diff_table.txt');
if (fs.existsSync(diffPath)) {
  const rawDiff = fs.readFileSync(diffPath, 'utf8');

  const truncated = rawDiff.length > MAX_DIFF_LENGTH;
  const trimmed = truncated ? rawDiff.slice(0, MAX_DIFF_LENGTH) + '\n[...] (truncado)' : rawDiff;

  // Escapa HTML
  const safeDiff = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  message += `\n\n<b>🔍 Linhas alteradas:</b>\n<pre>${safeDiff}</pre>`;
}

// Escapa o corpo principal (caso tenha acidentalmente <, > ou &)
message = message
  .replace(/&(?!amp;|lt;|gt;)/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const url = `https://api.telegram.org/bot${token}/sendMessage`;

axios.post(url, {
  chat_id: chatId,
  text: message,
  parse_mode: 'HTML',
  disable_web_page_preview: true,
}).then(() => {
  console.log('✅ Mensagem enviada com sucesso via Telegram.');
}).catch(err => {
  console.error('❌ Erro ao enviar mensagem:', err.response?.data || err.message);
  process.exit(1);
});
