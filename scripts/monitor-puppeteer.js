const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const sendTelegram = require('./send_telegram_file.js');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=b532a1c7-3028-4041-80e2-9620527bd3fa&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Trabalho&select=Ano,&select=tribunal_proces';

const DOWNLOAD_DIR = path.join(process.cwd(), 'scripts', 'downloads');
const XLSX_PATH = path.join(DOWNLOAD_DIR, 'tabela_atual.xlsx');
const FLAG_FILE = path.resolve(__dirname, 'monitor_flag.txt');

const now = new Date();
const dateStr = now.toISOString().slice(0,10).split('-').reverse().join('-');  // dd-mm-yyyy

const PREMIO_GERAL_PATH = path.join(DOWNLOAD_DIR, `PremioGeral-${dateStr}.xlsx`);
const PREMIO_TJMT_PATH = path.join(DOWNLOAD_DIR, `PremioTJMT-${dateStr}.xlsx`);
const DIFERENCAS_PATH = path.join(DOWNLOAD_DIR, `Diferencas-${dateStr}.xlsx`);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toMapByKey(data, keyCols) {
  const map = new Map();
  for (const row of data) {
    const key = keyCols.map(col => row[col]).join('|');
    map.set(key, row);
  }
  return map;
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

(async () => {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  try {
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOAD_DIR
    });

    console.log('Navegando para a URL:', URL);
    await page.goto(URL, { waitUntil: 'networkidle2' });

    console.log('Rolando a página...');
    await autoScroll(page);

    console.log('Aguardando o seletor .btn.btn-primary...');
    await page.waitForSelector('.btn.btn-primary', { timeout: 90000, visible: true });
    console.log('Botão encontrado! Clicando...');
    await page.click('.btn.btn-primary');

    let downloadedFile = null;
    for (let i = 0; i < 30; i++) {
      const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.xlsx'));
      if (files.length > 0) {
        downloadedFile = path.join(DOWNLOAD_DIR, files[0]);
        console.log('Arquivo baixado:', downloadedFile);
        break;
      }
      await sleep(1000);
    }

    if (!downloadedFile) throw new Error('Arquivo .xlsx não foi baixado.');

    fs.renameSync(downloadedFile, XLSX_PATH);

    const atualBook = XLSX.readFile(XLSX_PATH);
    const atual = XLSX.utils.sheet_to_json(atualBook.Sheets[atualBook.SheetNames[0]]);

    // Sempre salva a tabela completa com data
    XLSX.writeFile(atualBook, PREMIO_GERAL_PATH);
    console.log('✅ Tabela geral salva:', PREMIO_GERAL_PATH);

    // Filtra TJMT
    const tjmtData = atual.filter(d => d['Tribunal'] === 'TJMT');
    if (tjmtData.length > 0) {
      const wbTjmt = XLSX.utils.book_new();
      const wsTjmt = XLSX.utils.json_to_sheet(tjmtData);
      XLSX.utils.book_append_sheet(wbTjmt, wsTjmt, 'TJMT');
      XLSX.writeFile(wbTjmt, PREMIO_TJMT_PATH);
      console.log('✅ Tabela TJMT salva:', PREMIO_TJMT_PATH);
    }

    // Simplesmente envia ambos para o Telegram
    await sendTelegram.sendFile(PREMIO_GERAL_PATH);
    if (tjmtData.length > 0) await sendTelegram.sendFile(PREMIO_TJMT_PATH);

    console.log('✅ Arquivos enviados ao Telegram.');

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    await browser.close();
    process.exit(1);
  }
})();
