/**
 * send_telegram_file.js
 * Envia arquivos de diferenças via Telegram quando monitor_flag.txt existe.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const DOWNLOAD_DIR = path.join(process.cwd(), 'scripts', 'downloads');
const FLAG_FILE = path.resolve(__dirname, 'monitor_flag.txt');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('Variáveis de ambiente TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID ausentes.');
  process.exit(1);
}

const today = new Date();
const formattedDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

const filesInfo = [
  { file: 'Diferencas_CNJ.xlsx', caption: '📊 Diferenças CNJ' },
  { file: 'Diferencas_CNJ_TJMT.xlsx', caption: '📊 Diferenças TJMT' },
  { file: `PrêmioGeral-${formattedDate}.xlsx`, caption: `🏆 Prêmio Geral ${formattedDate}` },
  { file: `PrêmioTJMT-${formattedDate}.xlsx`, caption: `🏆 Prêmio TJMT ${formattedDate}` }
];

async function sendDocument(fullPath, caption) {
  const form = new FormData();
  form.append('chat_id', TELEGRAM_CHAT_ID);
  form.append('caption', caption);
  form.append('document', fs.createReadStream(fullPath));

  const headers = form.getHeaders();

  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, form, { headers });
}

(async () => {
  if (!fs.existsSync(FLAG_FILE)) {
    console.log('Nenhuma mudança — nada a enviar.');
    return;
  }

  for (const { file, caption } of filesInfo) {
    const fullPath = path.join(DOWNLOAD_DIR, file);
    if (fs.existsSync(fullPath)) {
      try {
        console.log('Enviando', file);
        await sendDocument(fullPath, caption);
      } catch (err) {
        console.error('Falha ao enviar', file, err.response?.data || err.message);
      }
    } else {
      console.log('Arquivo não encontrado, pulando:', file);
    }
  }

  // Limpa flag
  fs.unlinkSync(FLAG_FILE);
})();
