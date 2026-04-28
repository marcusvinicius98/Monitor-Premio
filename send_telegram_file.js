const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');
const puppeteer = require('puppeteer');

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
    RANKING_HTML_PATH: path.join(process.cwd(), 'scripts', 'downloads', `Ranking_Tribunais_Medios-${formattedDate}.html`),
    RANKING_PDF_PATH: path.join(process.cwd(), 'scripts', 'downloads', `Ranking_Tribunais_Medios-${formattedDate}.pdf`),
    RANKING_JSON_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'ranking_data.json'),
};

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// --- UTILITY FUNCTIONS ---

async function sendMessageToTelegram(text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: 'HTML',
        });
        console.log('Mensagem de ranking enviada com sucesso.');
    } catch (err) {
        console.error('Erro ao enviar mensagem:', err.response?.data || err.message);
        throw err;
    }
}

async function sendFileToTelegram(filePath, caption) {
    if (!fs.existsSync(filePath)) {
        console.log(`Arquivo ${path.basename(filePath)} não encontrado, pulando.`);
        return;
    }
    const form = new FormData();
    form.append('chat_id', TELEGRAM_CHAT_ID);
    form.append('document', fs.createReadStream(filePath));
    form.append('caption', caption);
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, form, {
            headers: form.getHeaders(),
        });
        console.log(`Arquivo ${path.basename(filePath)} enviado com sucesso.`);
    } catch (err) {
        console.error(`Erro ao enviar ${path.basename(filePath)}:`, err.message);
        throw err;
    }
}

async function convertHtmlToPdf(htmlPath, pdfPath) {
    if (!fs.existsSync(htmlPath)) {
        console.log('HTML do ranking não encontrado, pulando conversão para PDF.');
        return false;
    }
    console.log('Convertendo HTML do ranking para PDF...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    try {
        const page = await browser.newPage();
        await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true,
            margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
        });
        console.log(`PDF gerado: ${path.basename(pdfPath)}`);
        return true;
    } finally {
        await browser.close();
    }
}

function buildRankingMessage(rankingData) {
    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const medals = ['🥇', '🥈', '🥉'];

    const moveIcon = (d) => d > 0 ? `▲${d}` : d < 0 ? `▼${Math.abs(d)}` : `—`;
    const diffStr = (d) => d > 0 ? `+${d}` : `${d}`;

    const rows = rankingData.map(r => {
        const pos = r.rankAtual <= 3 ? medals[r.rankAtual - 1] : `#${r.rankAtual}`;
        const isTJMT = r.trib === 'TJMT';
        const name = isTJMT ? `<b>${r.trib} ◀</b>` : r.trib;
        const diff = r.diff !== 0 ? ` ${diffStr(r.diff)}` : ' =';
        const move = r.rankDiff !== 0 ? `  ${moveIcon(r.rankDiff)}` : '';
        return `${pos} ${name}  <b>${r.atual}</b> pts${diff}${move}`;
    }).join('\n');

    const tjmt = rankingData.find(r => r.trib === 'TJMT');
    const tjmtSummary = tjmt
        ? `\n📍 <b>TJMT:</b>  ${tjmt.ant} → <b>${tjmt.atual} pts</b>  |  <b>${diffStr(tjmt.diff)} pts</b>  |  Pos: #${tjmt.rankAnt} → <b>#${tjmt.rankAtual}</b>`
        : '';

    return `🏆 <b>Ranking CNJ — Tribunais Médios</b>
📅 <i>${dateStr}</i>
──────────────────────────

${rows}
──────────────────────────${tjmtSummary}

📎 Relatório completo em anexo.`;
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

        console.log('Flag encontrada. Preparando envios para o Telegram...');

        // 1. Convert HTML → PDF
        await convertHtmlToPdf(CONFIG.RANKING_HTML_PATH, CONFIG.RANKING_PDF_PATH);

        // 2. Send formatted ranking message
        if (fs.existsSync(CONFIG.RANKING_JSON_PATH)) {
            const rankingData = JSON.parse(fs.readFileSync(CONFIG.RANKING_JSON_PATH, 'utf8'));
            const message = buildRankingMessage(rankingData);
            await sendMessageToTelegram(message);
        } else {
            console.log('ranking_data.json não encontrado, pulando mensagem formatada.');
        }

        // 3. Send files
        const filesToSend = [
            { path: CONFIG.RANKING_PDF_PATH,  caption: `📊 Ranking Tribunais Médios — ${formattedDate}` },
            { path: CONFIG.DIFF_TJMT_PATH,    caption: `🔍 Diferenças TJMT — ${formattedDate}` },
            { path: CONFIG.DIFF_XLSX_PATH,    caption: `📋 Diferenças Gerais CNJ — ${formattedDate}` },
            { path: CONFIG.TJMT_XLSX_PATH,    caption: `📁 Tabela TJMT Atual — ${formattedDate}` },
            { path: CONFIG.GERAL_XLSX_PATH,   caption: `📁 Tabela Geral Atual — ${formattedDate}` },
        ];

        for (const file of filesToSend) {
            await sendFileToTelegram(file.path, file.caption);
        }

        console.log('🚀 Envio concluído com sucesso.');
        process.exitCode = 0;

    } catch (err) {
        console.error('❌ Erro fatal:', err.message);
        console.error(err.stack);
        process.exitCode = 1;
    }
})();
