/**
 * monitor-puppeteer.js
 * Faz scraping do painel CNJ, grava tabela .xlsx, compara com anterior
 * e cria monitor_flag.txt quando há mudanças.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=b532a1c7-3028-4041-80e2-9620527bd3fa&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Trabalho&select=Ano,&select=tribunal_proces';

const DOWNLOAD_DIR = path.join(process.cwd(), 'scripts', 'downloads');
const XLSX_PATH = path.join(DOWNLOAD_DIR, 'tabela_atual.xlsx');
const PREV_XLSX_PATH = path.join(DOWNLOAD_DIR, 'prev_tabela.xlsx');
const DIFF_XLSX_PATH = path.join(DOWNLOAD_DIR, 'Diferencas_CNJ.xlsx');
const FLAG_FILE = path.resolve(__dirname, 'monitor_flag.txt');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  let hasChanges = false;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOAD_DIR
    });

    console.log('Navegando para a URL:', URL);
    await page.goto(URL, { waitUntil: 'networkidle2' });

    console.log('Rolando a página...');
    await autoScroll(page);

    console.log('Aguardando o botão de download...');
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('div.btn.btn-primary');
        return btn && /Download da Tabela/.test(btn.innerText);
      },
      { timeout: 90000 }
    );

    const button = await page.$('div.btn.btn-primary');
    await button.click();

    // Aguarda novo arquivo aparecer
    let downloadedFile = null;
    for (let i = 0; i < 30; i++) {
      const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.xlsx'));
      if (files.length) {
        downloadedFile = path.join(DOWNLOAD_DIR, files[0]);
        break;
      }
      await sleep(1000);
    }
    if (!downloadedFile) throw new Error('Arquivo baixado não encontrado.');

    // Move/renomeia para tabela_atual.xlsx
    fs.renameSync(downloadedFile, XLSX_PATH);
    console.log('Tabela atual salva:', XLSX_PATH);

    if (fs.existsSync(PREV_XLSX_PATH)) {
      const wbPrev = XLSX.readFile(PREV_XLSX_PATH);
      const wbCurr = XLSX.readFile(XLSX_PATH);
      const dataPrev = XLSX.utils.sheet_to_json(wbPrev.Sheets[wbPrev.SheetNames[0]]);
      const dataCurr = XLSX.utils.sheet_to_json(wbCurr.Sheets[wbCurr.SheetNames[0]]);

      if (dataPrev.length !== dataCurr.length ||
          JSON.stringify(dataPrev) !== JSON.stringify(dataCurr)) {
        hasChanges = true;
        fs.copyFileSync(XLSX_PATH, DIFF_XLSX_PATH);
        console.log('Diferenças detectadas — arquivo de diferenças gerado.');
      } else {
        console.log('Nenhuma diferença detectada.');
      }
    } else {
      hasChanges = true; // Primeira execução
      console.log('Primeira execução — considerando como mudança.');
    }

    // Salva atual como anterior
    fs.copyFileSync(XLSX_PATH, PREV_XLSX_PATH);

    if (hasChanges) {
      fs.writeFileSync(FLAG_FILE, 'has_changes');
    }
  } catch (err) {
    console.error('Erro durante monitoramento:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
