const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

function sendFile(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      console.warn('⚠️ Arquivo não encontrado:', filePath);
      return resolve();
    }

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', fs.createReadStream(filePath));

    axios.post(`https://api.telegram.org/bot${token}/sendDocument`, form, {
      headers: form.getHeaders()
    }).then(() => {
      console.log(`✅ Arquivo enviado: ${filePath}`);
      resolve();
    }).catch(err => {
      console.error('❌ Erro ao enviar:', filePath, err.response?.data || err.message);
      reject(err);
    });
  });
}

(async () => {
  try {
    await sendFile(path.resolve(__dirname, 'downloads/Diferencas_CNJ.xlsx'));
    await sendFile(path.resolve(__dirname, 'downloads/Diferencas_CNJ_TJMT.xlsx'));
  } catch (err) {
    process.exit(1);
  }
})();