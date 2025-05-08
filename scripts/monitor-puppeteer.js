const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=b532a1c7-3028-4041-80e2-9620527bd3fa&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Trabalho&select=Ano,&select=tribunal_proces';

const DOWNLOAD_DIR = path.resolve(__dirname, 'downloads');
const XLSX_PATH = path.join(DOWNLOAD_DIR, 'tabela_atual.xlsx');
const PREV_XLSX_PATH = path.join(DOWNLOAD_DIR, 'prev_tabela.xlsx');
const DIFF_XLSX_PATH = path.join(DOWNLOAD_DIR, 'Diferencas_CNJ.xlsx');
const DIFF_TJMT_PATH = path.join(DOWNLOAD_DIR, 'Diferencas_CNJ_TJMT.xlsx');
const FLAG_FILE = path.resolve(__dirname, 'monitor_flag.txt');

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
    await page.click('.btn.btn-primary');

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
    fs.renameSync(downloadedFile, XLSX_PATH);

    const atual = XLSX.utils.sheet_to_json(XLSX.readFile(XLSX_PATH).Sheets.Sheet1);
    const anterior = fs.existsSync(PREV_XLSX_PATH)
      ? XLSX.utils.sheet_to_json(XLSX.readFile(PREV_XLSX_PATH).Sheets.Sheet1)
      : [];

    const diffs = [];
    const atualMap = toMapByKey(atual, ['Tribunal', 'Requisito']);
    const anteriorMap = toMapByKey(anterior, ['Tribunal', 'Requisito']);

    for (const [key, ant] of anteriorMap.entries()) {
      const atu = atualMap.get(key);
      if (atu) {
        if (ant['Pontuação'] !== atu['Pontuação'] || ant['Resultado'] !== atu['Resultado']) {
          diffs.push({
            'Tribunal (Ant)': ant['Tribunal'],
            'Requisito (Ant)': ant['Requisito'],
            'Resultado (Ant)': ant['Resultado'],
            'Pontuação (Ant)': ant['Pontuação'],
            'Tribunal (Atual)': atu['Tribunal'],
            'Requisito (Atual)': atu['Requisito'],
            'Resultado (Atual)': atu['Resultado'],
            'Pontuação (Atual)': atu['Pontuação']
          });
        }
      } else {
        diffs.push({
          'Tribunal (Ant)': ant['Tribunal'],
          'Requisito (Ant)': ant['Requisito'],
          'Resultado (Ant)': ant['Resultado'],
          'Pontuação (Ant)': ant['Pontuação'],
          'Tribunal (Atual)': 'Não encontrado',
          'Requisito (Atual)': 'Não encontrado',
          'Resultado (Atual)': 'Não encontrado',
          'Pontuação (Atual)': 'Não encontrado'
        });
      }
    }

    for (const [key, atu] of atualMap.entries()) {
      if (!anteriorMap.has(key)) {
        diffs.push({
          'Tribunal (Ant)': 'Não encontrado',
          'Requisito (Ant)': 'Não encontrado',
          'Resultado (Ant)': 'Não encontrado',
          'Pontuação (Ant)': 'Não encontrado',
          'Tribunal (Atual)': atu['Tribunal'],
          'Requisito (Atual)': atu['Requisito'],
          'Resultado (Atual)': atu['Resultado'],
          'Pontuação (Atual)': atu['Pontuação']
        });
      }
    }

    if (diffs.length > 0) {
      fs.copyFileSync(XLSX_PATH, PREV_XLSX_PATH);
      const ws = XLSX.utils.json_to_sheet(diffs);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Diferenças');
      XLSX.writeFile(wb, DIFF_XLSX_PATH);

      // TJMT apenas
      const diffs_tjmt = diffs.filter(d => d['Tribunal (Ant)'] === 'TJMT' || d['Tribunal (Atual)'] === 'TJMT');
      if (diffs_tjmt.length > 0) {
        const wb2 = XLSX.utils.book_new();
        const ws2 = XLSX.utils.json_to_sheet(diffs_tjmt);
        XLSX.utils.book_append_sheet(wb2, ws2, 'TJMT');
        XLSX.writeFile(wb2, DIFF_TJMT_PATH);
      }

      fs.writeFileSync(FLAG_FILE, 'HAS_CHANGES=1');
      console.log('✅ Diferenças detectadas e salvas.');
    } else {
      console.log('✅ Sem diferenças detectadas.');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();