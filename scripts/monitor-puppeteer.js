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
    PAGE_TIMEOUT: 90000,
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

/**
 * Pauses execution for a specified number of milliseconds.
 * @param {number} ms - The number of milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Converts an array of objects to a map, using specified key columns to generate a unique key.
 * @param {Array<Object>} data - The array of data objects.
 * @param {Array<string>} keyCols - The column names to use for generating the map key.
 * @returns {Map<string, Object>}
 */
function toMapByKey(data, keyCols) {
  const map = new Map();
  for (const row of data) {
    const key = keyCols.map(col => row[col]).join('|');
    map.set(key, row);
  }
  return map;
}

/**
 * Reads an XLSX file and returns the data from the first sheet as JSON.
 * @param {string} filePath - The path to the XLSX file.
 * @returns {Array<Object>}
 */
function readXlsxSheet(filePath) {
    const workbook = XLSX.readFile(filePath);
    return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
}

/**
 * Writes data to an XLSX file.
 * @param {string} filePath - The path to the XLSX file to be created.
 * @param {Array<Object>} data - The data to write.
 * @param {string} sheetName - The name of the sheet.
 */
function writeXlsxFile(filePath, data, sheetName) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filePath);
}


// --- PUPPETEER HELPER FUNCTIONS ---

/**
 * Scrolls the page to the bottom to ensure all dynamic content is loaded.
 * @param {import('puppeteer').Page} page - The Puppeteer page object.
 */
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

/**
 * Selects "Estadual" in the "Ramo" filter.
 * @param {import('puppeteer').Page} page - The Puppeteer page object.
 */
async function selectRamoEstadual(page) {
    try {
        console.log('🔍 Procurando pelo filtro "Ramo"...');
        
        // Wait for the Ramo filter to be visible
        await page.waitForFunction(
            () => {
                const elements = Array.from(document.querySelectorAll('h6[aria-label="Ramo"]'));
                return elements.length > 0;
            },
            { timeout: CONFIG.PAGE_TIMEOUT }
        );
        
        console.log('✅ Filtro "Ramo" encontrado. Clicando para abrir...');
        
        // Click on the collapsed Ramo filter to open the popover
        await page.evaluate(() => {
            const ramoContainer = document.querySelector('[data-testid="collapsed-title-Ramo"]');
            if (ramoContainer) {
                ramoContainer.click();
                return true;
            }
            return false;
        });
        
        console.log('⏳ Aguardando popover abrir...');
        await sleep(2000);
        
        // Wait for the popover to appear
        await page.waitForFunction(
            () => {
                const popover = document.querySelector('.MuiPopover-paper[tabindex="-1"]');
                return popover && popover.style.opacity === '1';
            },
            { timeout: CONFIG.PAGE_TIMEOUT }
        );
        
        console.log('✅ Popover aberto. Procurando pela opção "Estadual"...');
        
        // Wait for "Estadual" option to be visible
        await page.waitForFunction(
            () => {
                const rows = Array.from(document.querySelectorAll('[role="row"]'));
                return rows.some(row => {
                    const label = row.getAttribute('aria-label');
                    return label && label.includes('Estadual');
                });
            },
            { timeout: CONFIG.PAGE_TIMEOUT }
        );
        
        console.log('✅ Opção "Estadual" encontrada. Tentando clicar...');
        
        // Try multiple click methods for better reliability
        const clickResult = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('[role="row"]'));
            
            // Find row with exact text "Estadual" (not Militar Estadual)
            const estadualRow = rows.find(row => {
                const spans = row.querySelectorAll('span');
                const texts = Array.from(spans).map(s => s.textContent.trim());
                // Must have "Estadual" but not "Militar"
                return texts.some(text => text === 'Estadual') && 
                       !texts.some(text => text.includes('Militar'));
            });
            
            if (!estadualRow) {
                const allOptions = rows.map(r => {
                    const spans = r.querySelectorAll('span');
                    return Array.from(spans).map(s => s.textContent.trim()).join(' ');
                }).filter(Boolean);
                return { success: false, error: 'not_found', options: allOptions };
            }
            
            // Get current selection before clicking
            const wasSelected = estadualRow.getAttribute('aria-selected') === 'true';
            
            // Try multiple click methods
            try {
                // Method 1: Click the row directly
                estadualRow.click();
                
                // Method 2: Dispatch mouse events for better compatibility
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                estadualRow.dispatchEvent(clickEvent);
                
                // Method 3: Click on the cell inside
                const cell = estadualRow.querySelector('.RowColumn-cell');
                if (cell) {
                    cell.click();
                }
                
                return { 
                    success: true, 
                    wasSelected: wasSelected,
                    ariaSelected: estadualRow.getAttribute('aria-selected')
                };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });
        
        if (!clickResult.success) {
            console.error('❌ Erro ao clicar:', clickResult.error);
            if (clickResult.options) {
                console.error('Debug - Opções encontradas:', clickResult.options);
            }
            throw new Error('Não foi possível clicar na opção "Estadual"');
        }
        
        console.log('✅ Clique executado!');
        console.log(`   Estado anterior: ${clickResult.wasSelected ? 'Selecionado' : 'Não selecionado'}`);
        console.log(`   Estado após clique: aria-selected="${clickResult.ariaSelected}"`);
        
        console.log('⏳ Aguardando seleção...');
        await sleep(2000);
        
        // Verify the selection was applied
        console.log('🔍 Verificando se "Estadual" foi realmente selecionado...');
        const isSelected = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('[role="row"]'));
            const estadualRow = rows.find(row => {
                const spans = row.querySelectorAll('span');
                const texts = Array.from(spans).map(s => s.textContent.trim());
                return texts.some(text => text === 'Estadual') && 
                       !texts.some(text => text.includes('Militar'));
            });
            
            if (estadualRow) {
                const selected = estadualRow.getAttribute('aria-selected') === 'true';
                const hasCheckIcon = estadualRow.querySelector('svg') !== null;
                return { selected, hasCheckIcon, found: true };
            }
            return { selected: false, hasCheckIcon: false, found: false };
        });
        
        console.log(`   Resultado: ${JSON.stringify(isSelected)}`);
        
        if (!isSelected.selected && !isSelected.hasCheckIcon) {
            console.warn('⚠️ AVISO: "Estadual" pode não estar selecionado!');
            // Try clicking again
            console.log('🔄 Tentando clicar novamente...');
            await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('[role="row"]'));
                const estadualRow = rows.find(row => {
                    const spans = row.querySelectorAll('span');
                    const texts = Array.from(spans).map(s => s.textContent.trim());
                    return texts.some(text => text === 'Estadual') && 
                           !texts.some(text => text.includes('Militar'));
                });
                if (estadualRow) {
                    estadualRow.click();
                    // Force focus and click
                    estadualRow.focus();
                    estadualRow.click();
                }
            });
            await sleep(1000);
        } else {
            console.log('✅ "Estadual" confirmado como selecionado!');
        }
        
        console.log('✅ Procurando botão de confirmar...');
        
        // Wait for and click the confirm button
        await page.waitForSelector('[data-testid="actions-toolbar-confirm"]', { 
            visible: true, 
            timeout: CONFIG.PAGE_TIMEOUT 
        });
        
        console.log('✅ Botão de confirmar encontrado. Clicando...');
        
        await page.click('[data-testid="actions-toolbar-confirm"]');
        
        console.log('⏳ Aguardando aplicação do filtro...');
        await sleep(3000);
        
        // Wait for the popover to close
        await page.waitForFunction(
            () => {
                const popover = document.querySelector('.MuiPopover-paper[tabindex="-1"]');
                return !popover || popover.style.opacity !== '1';
            },
            { timeout: CONFIG.PAGE_TIMEOUT }
        );
        
        console.log('✅ Filtro "Estadual" aplicado com sucesso!');
        
        // Take a screenshot after filter applied
        await page.screenshot({ 
            path: path.join(CONFIG.DOWNLOAD_DIR, 'screenshot_after_filter.png'), 
            fullPage: true 
        });
        
    } catch (error) {
        console.error('❌ Erro ao tentar selecionar "Estadual" no filtro "Ramo":', error.message);
        // Take a screenshot for debugging
        await page.screenshot({ 
            path: path.join(CONFIG.DOWNLOAD_DIR, 'error_ramo_filter.png'), 
            fullPage: true 
        });
        throw error;
    }
}

/**
 * Sets up download directories.
 */
function setupDirectories() {
    if (!fs.existsSync(CONFIG.DOWNLOAD_DIR)) {
        console.log(`Criando diretório de download em: ${CONFIG.DOWNLOAD_DIR}`);
        fs.mkdirSync(CONFIG.DOWNLOAD_DIR, { recursive: true });
    }
}

/**
 * Launches Puppeteer browser and a new page.
 * @returns {Promise<{browser: import('puppeteer').Browser, page: import('puppeteer').Page}>}
 */
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
 * Navigates to the URL, configures downloads, scrolls, and takes a screenshot.
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

    await autoScroll(page);

    // Selecionar "Estadual" no filtro "Ramo"
    await selectRamoEstadual(page);

    console.log('Tirando captura de tela inicial...');
    await page.screenshot({ path: path.join(CONFIG.DOWNLOAD_DIR, 'screenshot_initial_load.png'), fullPage: true });
}

/**
 * Waits for the table content and downloads the XLSX file.
 * @param {import('puppeteer').Page} page - The Puppeteer page object.
 * @returns {Promise<string>} - Path to the downloaded file.
 */
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

    // Wait for the file to be downloaded
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
    
    // Rename the generically downloaded file to our standard "tabela_atual.xlsx"
    fs.renameSync(downloadedFile, CONFIG.XLSX_PATH);
    console.log(`Arquivo renomeado para: ${CONFIG.XLSX_PATH}`);
    return CONFIG.XLSX_PATH;
}


// --- DATA PROCESSING AND COMPARISON FUNCTIONS ---

/**
 * Compares current data with previous data to find differences.
 * @param {Array<Object>} currentData - The current dataset.
 * @param {Array<Object>} previousData - The previous dataset.
 * @returns {Array<Object>} - An array of differences.
 */
function findDifferences(currentData, previousData) {
    console.log('Comparando dados atuais e anteriores...');
    const differences = [];
    const currentMap = toMapByKey(currentData, CONFIG.KEY_COLUMNS_FOR_DIFF);
    const previousMap = toMapByKey(previousData, CONFIG.KEY_COLUMNS_FOR_DIFF);

    // Check for changes and deletions
    for (const [key, prevRow] of previousMap.entries()) {
        const currentRow = currentMap.get(key);
        if (currentRow) {
            // Check if specified value columns have changed
            const hasChanged = CONFIG.VALUE_COLUMNS_FOR_DIFF.some(col => prevRow[col] !== currentRow[col]);
            if (hasChanged) {
                differences.push({
                    'Tribunal (Ant)': prevRow['Tribunal'],
                    'Requisito (Ant)': prevRow['Requisito'],
                    'Resultado (Ant)': prevRow['Resultado'],
                    'Pontuação (Ant)': prevRow['Pontuação'],
                    'Tribunal (Atual)': currentRow['Tribunal'],
                    'Requisito (Atual)': currentRow['Requisito'],
                    'Resultado (Atual)': currentRow['Resultado'],
                    'Pontuação (Atual)': currentRow['Pontuação'],
                });
            }
        } else {
            differences.push({
                'Tribunal (Ant)': prevRow['Tribunal'],
                'Requisito (Ant)': prevRow['Requisito'],
                'Resultado (Ant)': prevRow['Resultado'],
                'Pontuação (Ant)': prevRow['Pontuação'],
                'Tribunal (Atual)': 'Não encontrado',
                'Requisito (Atual)': 'Não encontrado',
                'Resultado (Atual)': 'Não encontrado',
                'Pontuação (Atual)': 'Não encontrado',
            });
        }
    }

    // Check for additions
    for (const [key, currentRow] of currentMap.entries()) {
        if (!previousMap.has(key)) {
            differences.push({
                'Tribunal (Ant)': 'Não encontrado',
                'Requisito (Ant)': 'Não encontrado',
                'Resultado (Ant)': 'Não encontrado',
                'Pontuação (Ant)': 'Não encontrado',
                'Tribunal (Atual)': currentRow['Tribunal'],
                'Requisito (Atual)': currentRow['Requisito'],
                'Resultado (Atual)': currentRow['Resultado'],
                'Pontuação (Atual)': currentRow['Pontuação'],
            });
        }
    }
    return differences;
}

/**
 * Handles the case where differences are found: saves reports and updates files.
 * @param {Array<Object>} differences - The array of differences.
 * @param {Array<Object>} currentData - The current full dataset.
 */
function handleDetectedDifferences(differences, currentData) {
    console.log('💾 Diferenças detectadas. Salvando relatórios...');

    // Save general differences
    writeXlsxFile(CONFIG.DIFF_XLSX_PATH, differences, 'Diferenças');
    console.log(`Relatório de diferenças gerais salvo em: ${CONFIG.DIFF_XLSX_PATH}`);

    // Filter and save TJMT specific differences
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

    // Save a copy of the current full table (dated)
    fs.copyFileSync(CONFIG.XLSX_PATH, CONFIG.GERAL_XLSX_PATH);
    console.log(`Cópia geral da tabela atual (com data) salva em: ${CONFIG.GERAL_XLSX_PATH}`);

    // Filter and save TJMT specific data from the current table (dated)
    const tjmtCurrentData = currentData.filter(row => row['Tribunal'] === CONFIG.TJMT_IDENTIFIER);
    if (tjmtCurrentData.length > 0) {
        writeXlsxFile(CONFIG.TJMT_XLSX_PATH, tjmtCurrentData, 'TJMT');
        console.log(`Dados atuais do TJMT (com data) salvos em: ${CONFIG.TJMT_XLSX_PATH}`);
    } else {
        console.log('Nenhum dado do TJMT encontrado na tabela atual para salvar separadamente.');
    }

    // Update the previous file to the current one for the next run
    fs.copyFileSync(CONFIG.XLSX_PATH, CONFIG.PREV_XLSX_PATH);
    console.log(`Arquivo base para comparação futura atualizado: ${CONFIG.PREV_XLSX_PATH}`);

    // Create a flag file indicating changes
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
            console.log('🔍 Caminho absoluto do arquivo anterior:', path.resolve(CONFIG.PREV_XLSX_PATH));
            console.log('📂 Conteúdo do diretório de downloads:', fs.readdirSync(CONFIG.DOWNLOAD_DIR).join(', '));
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
