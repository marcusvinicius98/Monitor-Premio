const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=c87073c8-32b3-4b3f-911a-b25063edf692&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Estadual&select=Ano,&select=tribunal_process';

const DOWNLOAD_DIR = path.resolve(__dirname, 'downloads');
const LAST_CSV = path.resolve(__dirname, 'last_table.csv');
const PREV_CSV = path.resolve(__dirname, 'prev_table.csv');
const FLAG_FILE = path.resolve(__dirname, 'monitor_flag.txt');
const DIFF_FILE = path.resolve(__dirname, 'diff_table.txt');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

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

    await page.goto(URL, { waitUntil: 'networkidle2' });

    await page.waitForSelector('.btn.btn-primary', { timeout: 60000 });
    const buttons = await page.$x("//span[contains(text(), 'Download da Tabela')]");
    if (buttons.length === 0) throw new Error('Botão de download não encontrado.');
    await buttons[0].click();

    let downloadedFile = null;
    for (let i = 0; i < 30; i++) {
      const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.xlsx'));
      if (files.length > 0) {
        downloadedFile = path.join(DOWNLOAD_DIR, files[0]);
        break;
      }
      await sleep(1000);
    }

    if (!downloadedFile) throw new Error('Arquivo .xlsx não foi baixado.');

    const finalXlsx = path.join(DOWNLOAD_DIR, 'tabela_atual.xlsx');
    fs.renameSync(downloadedFile, finalXlsx);

    const workbook = XLSX.readFile(finalXlsx);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const csvData = XLSX.utils.sheet_to_csv(sheet).trim();

    fs.writeFileSync(LAST_CSV, csvData);

    const currentLines = new Set(csvData.split('\n').map(l => l.trim()).filter(Boolean));
    const previousLines = fs.existsSync(PREV_CSV)
      ? new Set(fs.readFileSync(PREV_CSV, 'utf8').split('\n').map(l => l.trim()).filter(Boolean))
      : new Set();

    const added = [...currentLines].filter(x => !previousLines.has(x));
    const removed = [...previousLines].filter(x => !currentLines.has(x));

    if (added.length === 0 && removed.length === 0) {
      fs.writeFileSync(DIFF_FILE, 'Nenhuma linha alterada.');
    } else {
      fs.copyFileSync(LAST_CSV, PREV_CSV);
      fs.writeFileSync(FLAG_FILE, 'HAS_CHANGES=1');

      let diff = '';
      if (added.length > 0) diff += '➕ Linhas adicionadas:\n' + added.map(l => '+ ' + l).join('\n') + '\n\n';
      if (removed.length > 0) diff += '➖ Linhas removidas:\n' + removed.map(l => '- ' + l).join('\n');

      fs.writeFileSync(DIFF_FILE, diff.trim());
      console.log(diff.trim());
    }

    process.exit(0);
  } catch (err) {
    await page.screenshot({ path: 'scripts/erro_tabela.png' });
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
