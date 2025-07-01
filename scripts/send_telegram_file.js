const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

// --- CONFIGURATION ---
const today = new Date();
const formattedDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

const CONFIG = {
    DOWNLOAD_DIR: path.join(process.cwd(), 'scripts', 'downloads'),
    FLAG_FILE: path.resolve(__dirname, 'monitor_flag.txt'),
    DIFF_XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'Diferencas_CNJ.xlsx'),
    DIFF_TJMT_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'Diferencas_CNJ_TJMT.xlsx'),
    GERAL_XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', `PrêmioGeral-${formattedDate}.xlsx`),
    TJMT_XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', `PrêmioTJMT-${formattedDate}.xlsx`),
};

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// --- UTILITY FUNCTIONS ---

/**
 * Sends a file to Telegram with a specified caption.
 * @param {string} filePath - Path to the file to send.
 * @param {string} caption - Caption for the file.
 */
async function sendFileToTelegram(filePath, caption) {
    if (!fs.existsSync(filePath)) {
        console.log(`Arquivo ${filePath} não encontrado, pulando envio.`);
        return;
    }

    const form = new FormData();
    form.append('chat_id', TELEGRAM_CHAT_ID);
    form.append('document', fs.createReadStream(filePath));
    form.append('caption', caption);

    try {
        const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders(),
        });
        console.log(`Arquivo ${filePath} enviado com sucesso. Resposta:`, response.data);
    } catch (err) {
        console.error(`Erro ao enviar ${filePath}:`, err.message);
        throw err;
    }
}

// --- MAIN EXECUTION ---
(async () => {
    try {
        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
            throw new Error('Variáveis TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID devem estar definidas.');
        }

        if (!fs.existsSync(CONFIG.FLAG_FILE)) {
            console.log('Nenhum arquivo de flag encontrado. Não há mudanças para enviar.');
            process.exit(0);
        }

        console.log('Arquivo de flag encontrado. Enviando arquivos para o Telegram...');

        const filesToSend = [
            { path: CONFIG.DIFF_XLSX_PATH, caption: 'Relatório de Diferenças Gerais' },
            { path: CONFIG.DIFF_TJMT_PATH, caption: 'Relatório de Diferenças TJMT' },
            { path: CONFIG.GERAL_XLSX_PATH, caption: 'Tabela Geral Atual' },
            { path: CONFIG.TJMT_XLSX_PATH, caption: 'Tabela TJMT Atual' },
        ];

        for (const file of filesToSend) {
            await sendFileToTelegram(file.path, file.caption);
        }

        console.log('🚀 Envio concluído com sucesso.');
        process.exitCode = 0;
    } catch (err) {
        console.error('❌ Erro fatal no script:', err.message);
        console.error(err.stack);
        process.exitCode = 1;
    }
})();
