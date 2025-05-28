const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  console.error('❌ TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não definidos.');
  process.exit(1);
}

async function sendFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn('⚠️ Arquivo não encontrado:', filePath);
    return;
  }

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('document', fs.createReadStream(filePath));

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendDocument`, form, {
      headers: form.getHeaders()
    });
    console.log(`✅ Arquivo enviado: ${filePath}`);
  } catch (err) {
    console.error('❌ Erro ao enviar:', filePath, err.response?.data || err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('❌ Nenhum arquivo especificado para envio.');
    process.exit(1);
  }
  sendFile(path.resolve(filePath));
}

module.exports = { sendFile };
