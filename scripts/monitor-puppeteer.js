/**
 * monitor-puppeteer.js
 * Faz o scraping do painel CNJ, salva arquivos xlsx, compara com anterior
 * e define a saída do passo de GitHub Actions `has_changes`.
 * Usa monitor_flag.txt como bandeira local e salva captura de tela.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const core = require('@actions/core');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=b532a1c7-3028-4041-80e2-9620527bd3fa&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Trabalho&select=Ano,&select=tribunal_proces';
const DOWNLOAD_DIR = path.join(process.cwd(), 'scripts', 'downloads');
const XLSX_PATH = path.join(DOWNLOAD_DIR, 'tabela_atual.xlsx');
const PREV_XLSX_PATH = path.join(DOWNLOAD_DIR, 'prev_tabela.xlsx');
const DIFF_XLSX_PATH = path.join(DOWNLOAD_DIR, 'Diferencas_CNJ.xlsx');
const DIFF_TJMT_PATH = path.join(DOWNLOAD_DIR, 'Diferencas_CNJ_TJMT.xlsx');
const FLAG_FILE = path.resolve(__dirname, 'monitor_flag.txt');

const today = new Date();
const formattedDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
const GERAL_XLSX_PATH = path.join(DOWNLOAD_DIR, `PrêmioGeral-${formattedDate}.xlsx`);
const TJMT_XLSX_PATH = path.join(DOWNLOAD_DIR, `PrêmioTJMT-${formattedDate}.xlsx`);

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

    console.log('Aguardando o botão "Download da Tabela"...');
    await page.waitForFunction(
      () => {
        const button = document.querySelector('div.btn.btn-primary');
        if (!button) return false;
        const span = button.querySelector('span.ng-binding');
        return span && span.innerText.includes('Download da Tabela');
      },
      { timeout: 90000 }
    );

    const downloadButton = await page.$('div.btn.btn-primary');
    if (!downloadButton) throw new Error('Botão "Download da Tabela" não encontrado.');
    await downloadButton.click();

    // espera aparecer novo arquivo .xlsx (não prev_tabela nem tabela_atual)
    let downloadedFile = null;
    for (let i = 0; i < 30; i++) {
      const files = fs.readdirSync(DOWNLOAD_DIR).filter(f =>
        f.endsWith('.xlsx') &&
        f !== 'tabela_atual.xlsx' &&
        f !== 'prev_tabela.xlsx'
      );
      if (files.length) {
        downloadedFile = path.join(DOWNLOAD_DIR, files[0]);
        break;
      }
      await sleep(1000);
    }
    if (!downloadedFile) throw new Error('Download não encontrado após 30 s.');

    // renomeia para tabela_atual.xlsx
    fs.renameSync(downloadedFile, XLSX_PATH);
    console.log('Nova tabela salva como', XLSX_PATH);

    // se existir tabela anterior, compara
    if (fs.existsSync(PREV_XLSX_PATH)) {
      const wbPrev = XLSX.readFile(PREV_XLSX_PATH);
      const wbCurr = XLSX.readFile(XLSX_PATH);

      const wsPrev = wbPrev.Sheets[wbPrev.SheetNames[0]];
      const wsCurr = wbCurr.Sheets[wbCurr.SheetNames[0]];

      const jsonPrev = XLSX.utils.sheet_to_json(wsPrev);
      const jsonCurr = XLSX.utils.sheet_to_json(wsCurr);

      // diferença simples de tamanho/JSON.stringify
      if (jsonPrev.length !== jsonCurr.length ||
          JSON.stringify(jsonPrev) !== JSON.stringify(jsonCurr)) {
        hasChanges = true;
        // salva diffs – aqui apenas copia novo arquivo
        fs.copyFileSync(XLSX_PATH, DIFF_XLSX_PATH);
        console.log('Diferenças detectadas.');
      } else {
        console.log('Nenhuma diferença detectada.');
      }
    } else {
      // primeira execução: considera mudança
      hasChanges = true;
      console.log('Primeira execução, marcando mudanças.');
    }

    // move atual para prev para próxima comparação
    fs.copyFileSync(XLSX_PATH, PREV_XLSX_PATH);

    // seta flag externo
    if (hasChanges) {
      fs.writeFileSync(FLAG_FILE, 'has_changes');
    }

    // GITHUB ACTION OUTPUT
    core.setOutput('has_changes', hasChanges ? 'true' : 'false');
  } catch (err) {
    console.error('❌ Erro no monitor:', err);
    core.setFailed(err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
