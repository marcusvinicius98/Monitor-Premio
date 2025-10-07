const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// --- CONFIGURATION ---
const today = new Date();
const formattedDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

const CONFIG = {
    URL: 'https://paineisanalytics.cnj.jus.br/single/?appid=b532a1c7-3028-4041-80e2-9620527bd3fa&sheet=fb006575-35ca-4ccd-928c-368edd2045ba',
    DOWNLOAD_DIR: path.join(process.cwd(), 'scripts', 'downloads'),
    XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'tabela_atual.xlsx'),
    PREV_XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'prev_tabela.xlsx'),
    DIFF_XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'Diferencas_CNJ.xlsx'),
    DIFF_TJMT_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'Diferencas_CNJ_TJMT.xlsx'),
    FLAG_FILE: path.resolve(__dirname, 'monitor_flag.txt'),
    GERAL_XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', `PrêmioGeral-${formattedDate}.xlsx`),
    TJMT_XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', `PrêmioTJMT-${formattedDate}.xlsx`),
    PAGE_TIMEOUT: 120000, // 120 seconds
    DOWNLOAD_TIMEOUT_MS: 30000,
    DOWNLOAD_CHECK_INTERVAL_MS: 1000,
    TABLE_INDICATOR_TEXT: 'Tabela com os Indicadores Relacionados à Pontua',
    DOWNLOAD_BUTTON_TEXT: 'Download da Tabela',
    DOWNLOAD_BUTTON_SELECTOR: 'div.btn.btn-primary',
    DOWNLOAD_BUTTON_SPAN_SELECTOR: 'span.ng-binding',
    KEY_COLUMNS_FOR_DIFF: ['Tribunal', 'Requisito'],
    VALUE_COLUMNS_FOR_DIFF: ['Pontuação', 'Resultado'],
    TJMT_IDENTIFIER: 'TJMT'
};

// --- UTILITY FUNCTIONS ---

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

function readXlsxSheet(filePath) {
    const workbook = XLSX.readFile(filePath);
    return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
}

function writeXlsxFile(filePath, data, sheetName) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filePath);
}


// --- PUPPETEER HELPER FUNCTIONS ---

async function autoScroll(page) {
  console.log('Rolando a página...');
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

function setupDirectories() {
    if (!fs.existsSync(CONFIG.DOWNLOAD_DIR)) {
        console.log(`Criando diretório de download em: ${CONFIG.DOWNLOAD_DIR}`);
        fs.mkdirSync(CONFIG.DOWNLOAD_DIR, { recursive: true });
    }
}

async function launchBrowserAndPage() {
    console.log('Iniciando o navegador...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    return { browser, page };
}

/**
 * Navigates to the URL, selects the filter, configures downloads, scrolls, and takes a screenshot.
 * @param {import('puppeteer').Page} page - The Puppeteer page object.
 */
async function navigateAndPreparePage(page) {
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: CONFIG.DOWNLOAD_DIR
    });

    console.log('Navegando para a URL:', CONFIG.URL);
    await page.goto(CONFIG.URL, { waitUntil: 'networkidle2', timeout: CONFIG.PAGE_TIMEOUT });
    
    console.log('Aguardando a página carregar completamente (verificando pela tabela)...');
    await page.waitForFunction(
        (text) => document.querySelector('body')?.innerText.includes(text),
        { timeout: CONFIG.PAGE_TIMEOUT },
        CONFIG.TABLE_INDICATOR_TEXT
    );
    console.log('Página carregada! Prosseguindo para a seleção de filtro.');

    // --- SELEÇÃO DO FILTRO ---
    console.log('Aguardando e clicando no filtro "Ramo"...');
    // CORREÇÃO APLICADA AQUI: Usando o seletor data-testid que é mais estável.
    const ramoFilterSelector = 'div[data-testid="collapsed-title-Ramo"]';
    await page.waitForSelector(ramoFilterSelector, { timeout: CONFIG.PAGE_TIMEOUT });
    await page.click(ramoFilterSelector);

    console.log('Aguardando e clicando na opção "Estadual"...');
    const estadualOptionSelector = 'li[title="Estadual"]'; 
    await page.waitForSelector(estadualOptionSelector, { timeout: CONFIG.PAGE_TIMEOUT });
    await page.click(estadualOptionSelector);

    console.log('Aguardando e clicando no botão de confirmação da seleção...');
    const confirmButtonSelector = 'button[data-tid="selection-toolbar-confirm"]';
    await page.waitForSelector(confirmButtonSelector, { timeout: CONFIG.PAGE_TIMEOUT });
    await page.click(confirmButtonSelector);

    console.log('Aguardando a página recarregar após a aplicação do filtro...');
    await sleep(5000);
    
    // --- FIM DA SELEÇÃO DO FILTRO ---

    await autoScroll(page);

    console.log('Tirando captura de tela após aplicar o filtro...');
    await page.screenshot({ path: path.join(CONFIG.DOWNLOAD_DIR, 'screenshot_after_filter.png'), fullPage: true });
}


async function downloadTableFile(page) {
    console.log('Aguardando a seção da tabela...');
    await page.waitForFunction(
        (text) => document.querySelector('body')?.innerText.includes(text),
        { timeout: CONFIG.PAGE_TIMEOUT },
        CONFIG.TABLE_INDICATOR_TEXT
    );
    console.log('Seção da tabela encontrada!');

    console.log(`Aguardando o botão de download "${CONFIG.DOWNLOAD_BUTTON_TEXT}"...`);
    await page.waitForFunction(
      (buttonSelector, spanSelector, buttonText) => {
        const button = document.querySelector(buttonSelector);
        if (!button) return false;
        const span = button.querySelector(spanSelector);
        return span && span.innerText.includes(buttonText);
      },
      { timeout: CONFIG.PAGE_TIMEOUT },
      CONFIG.DOWNLOAD_BUTTON_SELECTOR,
      CONFIG.DOWNLOAD_BUTTON_SPAN_SELECTOR,
      CONFIG.DOWNLOAD_BUTTON_TEXT
    );

    const downloadButton = await page.$(CONFIG.DOWNLOAD_BUTTON_SELECTOR);
    if (!downloadButton) {
      throw new Error(`Botão "${CONFIG.DOWNLOAD_BUTTON_TEXT}" não encontrado após espera.`);
    }

    console.log(`Botão "${CONFIG.DOWNLOAD_BUTTON_TEXT}" encontrado! Clicando...`);
    await downloadButton.click();

    let downloadedFile = null;
    console.log(`Verificando o diretório de downloads (${CONFIG.DOWNLOAD_DIR}) por novos arquivos .xlsx...`);
    const startTime = Date.now();
    while (Date.now() - startTime < CONFIG.DOWNLOAD_TIMEOUT_MS) {
        const files = fs.readdirSync(CONFIG.DOWNLOAD_DIR)
            .filter(f => f.endsWith('.xlsx') && !f.startsWith('prev_tabela') && f !== path.basename(CONFIG.XLSX_PATH) && !f.includes(`PrêmioGeral-`) && !f.includes(`PrêmioTJMT-`));

        if (files.length > 0) {
            const foundFile = files.map(f => ({ name: f, time: fs.statSync(path.join(CONFIG.DOWNLOAD_DIR, f)).mtimeMs }))
                                     .sort((a, b) => b.time - a.time)[0].name;
            downloadedFile = path.join(CONFIG.DOWNLOAD_DIR, foundFile);
            console.log('Arquivo baixado detectado:', downloadedFile);
            break;
        }
        await sleep(CONFIG.DOWNLOAD_CHECK_INTERVAL_MS);
    }

    if (!downloadedFile) {
        throw new Error('Arquivo .xlsx não foi baixado ou não foi detectado no tempo esperado.');
    }
    
    fs.renameSync(downloadedFile, CONFIG.XLSX_PATH);
    console.log(`Arquivo renomeado para: ${CONFIG.XLSX_PATH}`);
    return CONFIG.XLSX_PATH;
}


// --- DATA PROCESSING AND COMPARISON FUNCTIONS ---

function findDifferences(currentData, previousData) {
    console.log('Comparando dados atuais e anteriores...');
    const differences = [];
    const currentMap = toMapByKey(currentData, CONFIG.KEY_COLUMNS_FOR_DIFF);
    const previousMap = toMapByKey(previousData, CONFIG.KEY_COLUMNS_FOR_DIFF);

    for (const [key, prevRow] of previousMap.entries()) {
        const currentRow = currentMap.get(key);
        if (currentRow) {
            const hasChanged = CONFIG.VALUE_COLUMNS_FOR_DIFF.some(col => prevRow[col] !== currentRow[col]);
            if (hasChanged) {
                differences.push({
                    'Tribunal (Ant)': prevRow['Tribunal'], 'Requisito (Ant)': prevRow['Requisito'], 'Resultado (Ant)': prevRow['Resultado'], 'Pontuação (Ant)': prevRow['Pontuação'],
                    'Tribunal (Atual)': currentRow['Tribunal'], 'Requisito (Atual)': currentRow['Requisito'], 'Resultado (Atual)': currentRow['Resultado'], 'Pontuação (Atual)': currentRow['Pontuação'],
                });
            }
        } else {
            differences.push({
                'Tribunal (Ant)': prevRow['Tribunal'], 'Requisito (Ant)': prevRow['Requisito'], 'Resultado (Ant)': prevRow['Resultado'], 'Pontuação (Ant)': prevRow['Pontuação'],
                'Tribunal (Atual)': 'Não encontrado', 'Requisito (Atual)': 'Não encontrado', 'Resultado (Atual)': 'Não encontrado', 'Pontuação (Atual)': 'Não encontrado',
            });
        }
    }

    for (const [key, currentRow] of currentMap.entries()) {
        if (!previousMap.has(key)) {
            differences.push({
                'Tribunal (Ant)': 'Não encontrado', 'Requisito (Ant)': 'Não encontrado', 'Resultado (Ant)': 'Não encontrado', 'Pontuação (Ant)': 'Não encontrado',
                'Tribunal (Atual)': currentRow['Tribunal'], 'Requisito (Atual)': currentRow['Requisito'], 'Resultado (Atual)': currentRow['Resultado'], 'Pontuação (Atual)': currentRow['Pontuação'],
            });
        }
    }
    return differences;
}

function handleDetectedDifferences(differences, currentData) {
    console.log('💾 Diferenças detectadas. Salvando relatórios...');
    writeXlsxFile(CONFIG.DIFF_XLSX_PATH, differences, 'Diferenças');
    console.log(`Relatório de diferenças gerais salvo em: ${CONFIG.DIFF_XLSX_PATH}`);
    const tjmtDifferences = differences.filter(d =>
        (d['Tribunal (Ant)'] === CONFIG.TJMT_IDENTIFIER && d['Tribunal (Ant)'] !== 'Não encontrado') ||
        (d['Tribunal (Atual)'] === CONFIG.TJMT_IDENTIFIER && d['Tribunal (Atual)'] !== 'Não encontrado')
    );
    if (tjmtDifferences.length > 0) {
        writeXlsxFile(CONFIG.DIFF_TJMT_PATH, tjmtDifferences, 'TJMT');
        console.log(`Relatório de diferenças TJMT salvo em: ${CONFIG.DIFF_TJMT_PATH}`);
    } else {
        console.log('Nenhuma diferença específica do TJMT encontrada.');
    }
    fs.copyFileSync(CONFIG.XLSX_PATH, CONFIG.GERAL_XLSX_PATH);
    console.log(`Cópia geral da tabela atual (com data) salva em: ${CONFIG.GERAL_XLSX_PATH}`);
    const tjmtCurrentData = currentData.filter(row => row['Tribunal'] === CONFIG.TJMT_IDENTIFIER);
    if (tjmtCurrentData.length > 0) {
        writeXlsxFile(CONFIG.TJMT_XLSX_PATH, tjmtCurrentData, 'TJMT');
        console.log(`Dados atuais do TJMT (com data) salvos em: ${CONFIG.TJMT_XLSX_PATH}`);
    } else {
        console.log('Nenhum dado do TJMT encontrado na tabela atual para salvar separadamente.');
    }
    fs.copyFileSync(CONFIG.XLSX_PATH, CONFIG.PREV_XLSX_PATH);
    console.log(`Arquivo base para comparação futura atualizado: ${CONFIG.PREV_XLSX_PATH}`);
    fs.writeFileSync(CONFIG.FLAG_FILE, 'HAS_CHANGES=1');
    console.log(`🚩 Arquivo de flag criado/atualizado: ${CONFIG.FLAG_FILE}`);
    console.log('✅ Diferenças detectadas e salvas.');
}

// --- MAIN EXECUTION ---
(async () => {
    let browser;
    try {
        setupDirectories();
        console.log('Verificando arquivo anterior para comparação...');
        console.log('Caminho do arquivo anterior:', CONFIG.PREV_XLSX_PATH);
        const hasPrevFile = fs.existsSync(CONFIG.PREV_XLSX_PATH);
        console.log('Arquivo anterior existe?', hasPrevFile ? 'Sim' : 'Não');
        const { browser: b, page } = await launchBrowserAndPage();
        browser = b;
        await navigateAndPreparePage(page);
        const downloadedFilePath = await downloadTableFile(page);
        console.log('Lendo dados da tabela baixada...');
        const currentData = readXlsxSheet(downloadedFilePath);
        if (!hasPrevFile) {
            console.log('📥 Primeira execução ou arquivo anterior não encontrado.');
            console.log('Salvando arquivo baixado como base para comparações futuras.');
            fs.copyFileSync(downloadedFilePath, CONFIG.PREV_XLSX_PATH);
            console.log(`Arquivo base salvo em: ${CONFIG.PREV_XLSX_PATH}`);
        } else {
            console.log('Lendo dados da tabela anterior...');
            const previousData = readXlsxSheet(CONFIG.PREV_XLSX_PATH);
            const differences = findDifferences(currentData, previousData);
            if (differences.length > 0) {
                handleDetectedDifferences(differences, currentData);
            } else {
                console.log('✅ Sem diferenças detectadas em comparação com a execução anterior.');
            }
        }
        console.log('🚀 Processo concluído com sucesso.');
        process.exitCode = 0;
    } catch (err) {
        console.error('❌ Erro fatal no script:', err.message);
        console.error(err.stack);
        process.exitCode = 1;
    } finally {
        if (browser) {
            console.log('Fechando o navegador...');
            await browser.close();
        }
        console.log(`Script finalizado com código de saída: ${process.exitCode === undefined ? 0 : process.exitCode}.`);
    }
})();
