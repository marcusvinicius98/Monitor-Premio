/**
 * send_telegram_file.js
 * Envia arquivos gerados pelo monitor via Telegram.
 * Não faz scraping nem download — apenas lê monitor_flag.txt.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DOWNLOAD_DIR = path.join(process.cwd(), 'scripts', 'downloads');
const FLAG_FILE = path.resolve(__dirname, 'monitor_flag.txt');

// Arquivos a enviar
const today = new Date();
const formattedDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
const files = [
  { file: 'Diferencas_CNJ.xlsx', caption: '📊 Diferenças CNJ' },
  { file: 'Diferencas_CNJ_TJMT.xlsx', caption: '📊 Diferenças TJMT' },
  { file: `PrêmioGeral-${formattedDate}.xlsx`, caption: `🏆 Prêmio Geral ${formattedDate}` },
  { file: `PrêmioTJMT-${formattedDate}.xlsx`, caption: `🏆 Prêmio TJMT ${formattedDate}` }
].map(obj => ({ ...obj, fullPath: path.join(DOWNLOAD_DIR, obj.file) }));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('TOKEN ou CHAT_ID não definidos.');
  process.exit(1);
}

(async () => {
  if (!fs.existsSync(FLAG_FILE)) {
    console.log('Nenhuma diferença detectada — nada a enviar.');
    return;
  }

  for (const { fullPath, caption } of files) {
    if (!fs.existsSync(fullPath)) {
      console.log('[SKIP]', fullPath, 'não encontrado.');
      continue;
    }

    console.log('Enviando', path.basename(fullPath));
    const formData = new FormData();
    formData.append('chat_id', TELEGRAM_CHAT_ID);
    formData.append('caption', caption);
    formData.append('document', fs.createReadStream(fullPath));

    try {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, formData, {
        headers: formData.getHeaders()
      });
      console.log('✅ Enviado:', caption);
    } catch (err) {
      console.error('Falha ao enviar', fullPath, err.response?.data || err.message);
    }
  }

  // Se tudo foi enviado, remove a flag
  fs.unlinkSync(FLAG_FILE);
})();
