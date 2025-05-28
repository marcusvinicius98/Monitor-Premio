const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=b532a1c7-3028-4041-80e2-9620527bd3fa&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Trabalho&select=Ano,&select=tribunal_proces';
const DOWNLOAD_DIR = path.join(process.cwd(), 'scripts', 'downloads');
const XLSX_PATH = path.join(DOWNLOAD_DIR, 'tabela_atual.xlsx');
const PREV_XLSX_PATH = path.join(DOWNLOAD_DIR, 'prev_tabela.xlsx');
const DIFF_XLSX_PATH = path.join(DOWNLOAD_DIR, 'Diferencas_CNJ.xlsx');
const DIFF_TJMT_PATH = path.join(DOWNLOAD_DIR, 'Diferencas_CNJ_TJMT.xlsx');
const FLAG_FILE = path.resolve(__dirname, 'monitor_flag.txt');

// Adicionando caminhos para as tabelas com data
const today = new Date();
const formattedDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
const GERAL_XLSX_PATH = path.join(DOWNLOAD_DIR, `PrêmioGeral-${formattedDate}.xlsx`);
const TJMT_XLSX_PATH = path.join(DOWNLOAD_DIR, `PrêmioTJMT-${formattedDate}.xlsx`);

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

  console.log('Verificando arquivo anterior...');
  console.log('Caminho do arquivo anterior:', PREV_XLSX_PATH);
  const hasPrevFile = fs.existsSync(PREV_XLSX_PATH);
  console.log('Arquivo existe?', hasPrevFile ? 'Sim' : 'Não');

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

    console.log('Tirando captura de tela...');
    await page.screenshot({ path: path.join(DOWNLOAD_DIR, 'screenshot.png'), fullPage: true });

    console.log('Aguardando a seção da tabela...');
    await page.waitForFunction(
      () => document.querySelector('body')?.innerText.includes('Tabela com os Indicadores Relacionados à Pontua'),
      { timeout: 90000 }
    );
    console.log('Seção da tabela encontrada!');

    // Aguarda o botão específico "Download da Tabela" com texto exato
    console.log('Aguardando o botão de download "Download da Tabela"...');
    await page.waitForFunction(
      () => document.querySelector('button.btn.btn-primary')?.innerText.includes('Download da Tabela'),
      { timeout: 90000 }
    );
    const downloadButton = await page.$('button.btn.btn-primary');
    if (!downloadButton) {
      throw new Error('Botão "Download da Tabela" não encontrado após espera.');
    }

    console.log('Botão "Download da Tabela" encontrado! Clicando...');
    await downloadButton.click();

    let downloadedFile = null;
    const tempFilePrefix = `temp_download_${Date.now()}`;
    for (let i = 0; i < 30; i++) {
      const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.xlsx') && !f.startsWith('prev_tabela') && f !== 'tabela_atual.xlsx');
      if (files.length > 0) {
        downloadedFile = path.join(DOWNLOAD_DIR, files[0]);
        console.log('Arquivo baixado:', downloadedFile);
        break;
      }
      await sleep(1000);
    }

    if (!downloadedFile) {
      throw new Error('Arquivo .xlsx não foi baixado.');
    }
    fs.renameSync(downloadedFile, XLSX_PATH);

    const atualBook = XLSX.readFile(XLSX_PATH);
    const atual = XLSX.utils.sheet_to_json(atualBook.Sheets[atualBook.SheetNames[0]]);

    if (!hasPrevFile) {
      console.log('📥 Primeira execução ou arquivo anterior não encontrado - arquivo base será salvo para comparação futura.');
      fs.copyFileSync(XLSX_PATH, PREV_XLSX_PATH);
      await browser.close();
      process.exit(0);
    }

    const anteriorBook = XLSX.readFile(PREV_XLSX_PATH);
    const anterior = XLSX.utils.sheet_to_json(anteriorBook.Sheets[anteriorBook.SheetNames[0]]);

    console.log('🔍 Caminho absoluto do arquivo anterior:', path.resolve(PREV_XLSX_PATH));
    console.log('📂 Conteúdo do diretório:', fs.readdirSync(DOWNLOAD_DIR).join(', '));

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

      const diffs_tjmt = diffs.filter(d => d['Tribunal (Ant)'] === 'TJMT' || d['Tribunal (Atual)'] === 'TJMT');
      if (diffs_tjmt.length > 0) {
        const wb2 = XLSX.utils.book_new();
        const ws2 = XLSX.utils.json_to_sheet(diffs_tjmt);
        XLSX.utils.book_append_sheet(wb2, ws2, 'TJMT');
        XLSX.writeFile(wb2, DIFF_TJMT_PATH);
      }

      // Criar e salvar a tabela geral com data
      fs.copyFileSync(XLSX_PATH, GERAL_XLSX_PATH);

      // Criar e salvar a tabela específica do TJMT
      const tjmtData = atual.filter(row => row['Tribunal'] === 'TJMT');
      if (tjmtData.length > 0) {
        const tjmtWs = XLSX.utils.json_to_sheet(tjmtData);
        const tjmtWb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(tjmtWb, tjmtWs, 'TJMT');
        XLSX.writeFile(tjmtWb, TJMT_XLSX_PATH);
      }

      fs.writeFileSync(FLAG_FILE, 'HAS_CHANGES=1');
      console.log('✅ Diferenças detectadas e salvas.');
    } else {
      console.log('✅ Sem diferenças detectadas.');
    }

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    await browser.close();
    process.exit(1);
  }
})();
