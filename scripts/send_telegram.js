const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const filePath = path.resolve(__dirname, 'downloads/tabela_atual.xlsx'); // Nome fixo

if (!fs.existsSync(filePath)) {
  console.error('❌ Arquivo não encontrado:', filePath);
  process.exit(1);
}

const form = new FormData();
form.append('chat_id', chatId);
form.append('document', fs.createReadStream(filePath));

axios.post(`https://api.telegram.org/bot${token}/sendDocument`, form, {
  headers: form.getHeaders(),
}).then(() => {
  console.log('✅ Arquivo enviado com sucesso via Telegram.');
}).catch(err => {
  console.error('❌ Erro ao enviar o arquivo:', err.response?.data || err.message);
  process.exit(1);
});
