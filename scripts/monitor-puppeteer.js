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
    RANKING_HTML_PATH: path.join(process.cwd(), 'scripts', 'downloads', `Ranking_Tribunais_Medios-${formattedDate}.html`),
    RANKING_JSON_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'ranking_data.json'),
    TRIBUNAIS_MEDIOS: ['TJSC', 'TJGO', 'TJPE', 'TJDFT', 'TJCE', 'TJMT', 'TJPA', 'TJMA', 'TJES'],
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
        
        // Find the row selector for "Estadual" (not "Militar Estadual")
        const estadualSelector = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('[role="row"]'));
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const spans = row.querySelectorAll('span');
                const texts = Array.from(spans).map(s => s.textContent.trim());
                
                // Must have "Estadual" but not "Militar"
                const hasEstadual = texts.some(text => text === 'Estadual');
                const hasMilitar = texts.some(text => text.includes('Militar'));
                
                if (hasEstadual && !hasMilitar) {
                    // Generate unique selector for this specific row
                    const ariaLabel = row.getAttribute('aria-label');
                    if (ariaLabel) {
                        return `[role="row"][aria-label="${ariaLabel}"]`;
                    }
                    // Fallback: use data-n attribute
                    const dataN = row.getAttribute('data-n');
                    if (dataN) {
                        return `[role="row"][data-n="${dataN}"]`;
                    }
                }
            }
            
            // Return all available options for debugging
            const allOptions = rows.map(r => {
                const spans = r.querySelectorAll('span');
                const label = r.getAttribute('aria-label');
                return { label, texts: Array.from(spans).map(s => s.textContent.trim()) };
            }).filter(o => o.texts.length > 0);
            
            return { error: 'not_found', options: allOptions };
        });
        
        if (typeof estadualSelector === 'object' && estadualSelector.error) {
            console.error('❌ Não foi possível encontrar "Estadual"');
            console.error('Debug - Opções:', JSON.stringify(estadualSelector.options, null, 2));
            throw new Error('Opção "Estadual" não encontrada');
        }
        
        console.log(`✅ Seletor encontrado: ${estadualSelector}`);
        console.log('🖱️  Clicando usando page.click() nativo do Puppeteer...');
        
        // Use Puppeteer's native click - this triggers proper browser events
        await page.click(estadualSelector);
        
        console.log('✅ Clique executado!');
        
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
                const pontAnt = typeof prevRow['Pontuação'] === 'number' ? prevRow['Pontuação'] : null;
                const pontAtual = typeof currentRow['Pontuação'] === 'number' ? currentRow['Pontuação'] : null;
                const diferenca = (pontAnt !== null && pontAtual !== null) ? pontAtual - pontAnt : '';
                differences.push({
                    'Tribunal (Ant)': prevRow['Tribunal'],
                    'Requisito (Ant)': prevRow['Requisito'],
                    'Resultado (Ant)': prevRow['Resultado'],
                    'Pontuação (Ant)': prevRow['Pontuação'],
                    'Tribunal (Atual)': currentRow['Tribunal'],
                    'Requisito (Atual)': currentRow['Requisito'],
                    'Resultado (Atual)': currentRow['Resultado'],
                    'Pontuação (Atual)': currentRow['Pontuação'],
                    'Diferença': diferenca,
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
                'Diferença': typeof prevRow['Pontuação'] === 'number' ? -prevRow['Pontuação'] : '',
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
                'Diferença': typeof currentRow['Pontuação'] === 'number' ? currentRow['Pontuação'] : '',
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
function handleDetectedDifferences(differences, currentData, previousData) {
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
    // Generate ranking report for tribunais médios
    generateRankingHtml(currentData, previousData);

    console.log('✅ Diferenças detectadas e salvas.');
}

/**
 * Calculates total score per tribunal from dataset.
 */
function calcTotalByTribunal(data) {
    const totals = new Map();
    for (const row of data) {
        const trib = row['Tribunal'];
        const pts = typeof row['Pontuação'] === 'number' ? row['Pontuação'] : 0;
        totals.set(trib, (totals.get(trib) || 0) + pts);
    }
    return totals;
}

/**
 * Generates ranking HTML report for tribunais médios comparing previous vs current scores.
 */
function generateRankingHtml(currentData, previousData) {
    const currentTotals = calcTotalByTribunal(currentData);
    const previousTotals = calcTotalByTribunal(previousData);
    const tribunais = CONFIG.TRIBUNAIS_MEDIOS;

    const rankingData = tribunais.map(trib => {
        const atual = currentTotals.get(trib) || 0;
        const ant = previousTotals.get(trib) || 0;
        return { trib, ant, atual, diff: atual - ant };
    });

    const sorted = [...rankingData].sort((a, b) => b.atual - a.atual);
    const sortedAnt = [...rankingData].sort((a, b) => b.ant - a.ant);
    sorted.forEach((r, i) => { r.rankAtual = i + 1; });
    sortedAnt.forEach((r, i) => { r.rankAnt = i + 1; });
    const rankMap = {};
    sorted.forEach(r => { rankMap[r.trib] = { rankAtual: r.rankAtual }; });
    sortedAnt.forEach(r => { rankMap[r.trib] = { ...rankMap[r.trib], rankAnt: r.rankAnt }; });
    rankingData.forEach(r => {
        r.rankAtual = rankMap[r.trib].rankAtual;
        r.rankAnt = rankMap[r.trib].rankAnt;
        r.rankDiff = r.rankAnt - r.rankAtual;
    });
    rankingData.sort((a, b) => a.rankAtual - b.rankAtual);

    const maxScore = Math.max(...rankingData.map(r => Math.max(r.ant, r.atual, 1)));
    const today = new Date();
    const dateStr = String(today.getDate()).padStart(2,'0') + '/' + String(today.getMonth()+1).padStart(2,'0') + '/' + today.getFullYear();

    const rows = rankingData.map(r => {
        const diffSign = r.diff > 0 ? '+' : '';
        const diffColor = r.diff > 0 ? '#3fb950' : r.diff < 0 ? '#f85149' : '#8b949e';
        const rankMoveIcon = r.rankDiff > 0 ? '&#9650;' : r.rankDiff < 0 ? '&#9660;' : '&mdash;';
        const rankMoveColor = r.rankDiff > 0 ? '#3fb950' : r.rankDiff < 0 ? '#f85149' : '#8b949e';
        const isTJMT = r.trib === 'TJMT';
        const barPct = Math.round((r.atual / maxScore) * 100);
        const barPctAnt = Math.round((r.ant / maxScore) * 100);
        const badge = isTJMT ? ' <span class="badge-tjmt">voce</span>' : '';
        return `<tr class="${isTJMT ? 'highlight' : ''}"><td class="rank">#${r.rankAtual}</td><td class="trib-name">${r.trib}${badge}</td><td class="score-col"><div class="bar-wrap"><div class="bar-bg"><div class="bar-ant" style="width:${barPctAnt}%"></div><div class="bar-atual" style="width:${barPct}%"></div></div><span class="score-val">${r.atual}</span></div></td><td class="prev-score">${r.ant}</td><td class="diff-col" style="color:${diffColor}">${diffSign}${r.diff}</td><td class="rank-move" style="color:${rankMoveColor}">${rankMoveIcon} ${Math.abs(r.rankDiff) > 0 ? Math.abs(r.rankDiff) : ''}</td><td class="prev-rank">#${r.rankAnt}</td></tr>`;
    }).join('');

    const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Ranking Tribunais Medios CNJ</title><link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"><style>:root{--bg:#0d1117;--surface:#161b22;--surface2:#1c2330;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--gain:#3fb950;--loss:#f85149;--accent:#58a6ff;--tjmt:#e3b341}*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--text);font-family:\'DM Sans\',sans-serif;font-size:14px}body::before{content:\'\';position:fixed;inset:0;background:radial-gradient(ellipse 80% 50% at 20% 10%,rgba(88,166,255,.04) 0%,transparent 60%),radial-gradient(ellipse 60% 40% at 80% 90%,rgba(63,185,80,.03) 0%,transparent 60%);pointer-events:none;z-index:0}.container{max-width:900px;margin:0 auto;padding:48px 24px 80px;position:relative;z-index:1}.header{margin-bottom:40px;border-bottom:1px solid var(--border);padding-bottom:28px}.header-label{font-family:\'DM Mono\',monospace;font-size:11px;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;margin-bottom:8px}.header h1{font-family:\'DM Serif Display\',serif;font-size:32px;font-weight:400;line-height:1.2;margin-bottom:6px}.header h1 span{color:var(--accent);font-style:italic}.header-sub{color:var(--muted);font-size:13px;font-weight:300}table{width:100%;border-collapse:collapse}thead tr{border-bottom:2px solid var(--border)}th{font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:10px 14px;text-align:left;font-weight:500}td{padding:12px 14px;border-bottom:1px solid var(--border);vertical-align:middle}tr.highlight{background:rgba(227,179,65,.06)}tr.highlight td{border-bottom-color:rgba(227,179,65,.2)}.rank{font-family:\'DM Serif Display\',serif;font-size:22px;color:var(--muted);width:48px}tr.highlight .rank{color:var(--tjmt)}.trib-name{font-weight:600;font-size:15px;white-space:nowrap}.badge-tjmt{background:rgba(227,179,65,.15);border:1px solid rgba(227,179,65,.4);color:var(--tjmt);font-size:9px;font-family:\'DM Mono\',monospace;padding:1px 7px;border-radius:10px;vertical-align:middle;margin-left:6px;letter-spacing:.05em;text-transform:uppercase}.score-col{width:240px}.bar-wrap{display:flex;align-items:center;gap:10px}.bar-bg{flex:1;height:6px;background:var(--surface2);border-radius:3px;position:relative;overflow:hidden}.bar-ant{position:absolute;top:0;left:0;height:100%;background:var(--border);border-radius:3px}.bar-atual{position:absolute;top:0;left:0;height:100%;background:linear-gradient(90deg,#388bfd,#58a6ff);border-radius:3px}tr.highlight .bar-atual{background:linear-gradient(90deg,#c99a2e,var(--tjmt))}.score-val{font-family:\'DM Serif Display\',serif;font-size:20px;white-space:nowrap;min-width:38px}.prev-score{font-family:\'DM Mono\',monospace;font-size:12px;color:var(--muted)}.diff-col{font-family:\'DM Serif Display\',serif;font-size:18px}.rank-move{font-family:\'DM Mono\',monospace;font-size:12px;white-space:nowrap}.prev-rank{font-family:\'DM Mono\',monospace;font-size:11px;color:var(--muted)}.legend{display:flex;gap:20px;margin-top:24px;padding-top:20px;border-top:1px solid var(--border)}.legend-item{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);font-family:\'DM Mono\',monospace}.legend-bar{width:24px;height:5px;border-radius:2px}.footer{border-top:1px solid var(--border);margin-top:40px;padding-top:20px;display:flex;justify-content:space-between;color:var(--muted);font-size:11px;font-family:\'DM Mono\',monospace}</style></head><body><div class="container"><div class="header"><div class="header-label">Premio CNJ de Qualidade - Tribunais Medios</div><h1>Ranking <span>Comparativo</span></h1><div class="header-sub">Pontuacao anterior vs. atual · 9 tribunais · gerado em ' + dateStr + '</div></div><table><thead><tr><th>Pos.</th><th>Tribunal</th><th>Pontuacao Atual</th><th>Anterior</th><th>&#916; Pts</th><th>Mov.</th><th>Pos. Ant.</th></tr></thead><tbody>' + rows + '</tbody></table><div class="legend"><div class="legend-item"><div class="legend-bar" style="background:#30363d"></div> Pontuacao anterior</div><div class="legend-item"><div class="legend-bar" style="background:#58a6ff"></div> Pontuacao atual</div></div><div class="footer"><span>CNJ · Premio Gestao e Qualidade · Tribunais Medios</span><span>' + dateStr + '</span></div></div></body></html>';

    fs.writeFileSync(CONFIG.RANKING_JSON_PATH, JSON.stringify(rankingData, null, 2), 'utf8');
    console.log('Ranking JSON salvo em: ' + CONFIG.RANKING_JSON_PATH);
    fs.writeFileSync(CONFIG.RANKING_HTML_PATH, html, 'utf8');
    console.log('Ranking HTML de Tribunais Medios salvo em: ' + CONFIG.RANKING_HTML_PATH);
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
                handleDetectedDifferences(differences, currentData, previousData);
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
