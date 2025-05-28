const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

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
  }
}

module.exports = { sendFile };
