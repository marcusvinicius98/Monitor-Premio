const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
// const core = require('@actions/core'); // Removido se não estiver usando GitHub Actions diretamente neste script modificado

// --- CONFIGURATION ---
const today = new Date();
const formattedDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

const CONFIG = {
    URL: 'https://paineisanalytics.cnj.jus.br/single/?appid=b532a1c7-3028-4041-80e2-9620527bd3fa&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Trabalho&select=Ano,&select=tribunal_proces',
    DOWNLOAD_DIR: path.join(process.cwd(), 'scripts', 'downloads'),
    XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'tabela_atual.xlsx'),
    PREV_XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'prev_tabela.xlsx'),
    DIFF_XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'Diferencas_CNJ.xlsx'),
    DIFF_TJMT_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'Diferencas_CNJ_TJMT.xlsx'),
    FLAG_FILE: path.resolve(__dirname, 'monitor_flag.txt'),
    GERAL_XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', `PrêmioGeral-${formattedDate}.xlsx`),
    TJMT_XLSX_PATH: path.join(process.cwd(), 'scripts', 'downloads', `PrêmioTJMT-${formattedDate}.xlsx`),
    PAGE_TIMEOUT: 90000,
    DOWNLOAD_TIMEOUT_S: 30, // Segundos
    DOWNLOAD_CHECK_INTERVAL_MS: 1000,
    TABLE_INDICATOR_TEXT: 'Tabela com os Indicadores Relacionados à Pontua', // Texto para aguardar na página
    DOWNLOAD_BUTTON_TEXT: 'Download da Tabela', // Texto exato no botão/span
    DOWNLOAD_BUTTON_SELECTOR: 'div.btn.btn-primary', // Seletor do elemento botão
    DOWNLOAD_BUTTON_SPAN_SELECTOR: 'span.ng-binding', // Seletor do span dentro do botão que contém o texto
    KEY_COLUMNS_FOR_DIFF: ['Tribunal', 'Requisito'], // Colunas chave para identificar uma linha única
    VALUE_COLUMNS_TO_CHECK_FOR_DIFF: ['Pontuação', 'Resultado'], // Colunas para verificar mudanças
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

// Função auxiliar para converter pontuação e tratar "Não encontrado"
function parsePontuacao(value) {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'não encontrado') {
    return 0;
  }
  const num = parseFloat(String(value).replace(',', '.'));
  return isNaN(num) ? 0 : num;
}

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

// --- CORE FUNCTIONS ---
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
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: CONFIG.DOWNLOAD_DIR
    });
    return { browser, page };
}

async function navigateAndDownload(page) {
    console.log('Navegando para a URL:', CONFIG.URL);
    await page.goto(CONFIG.URL, { waitUntil: 'networkidle2', timeout: CONFIG.PAGE_TIMEOUT });

    console.log('Rolando a página para carregar todos os elementos...');
    await autoScroll(page);
    
    // Aguarda o texto da seção da tabela para garantir que a página foi carregada (opcional, mas bom)
    // console.log('Aguardando a seção da tabela...');
    // await page.waitForFunction(
    //   (text) => document.querySelector('body')?.innerText.includes(text),
    //   { timeout: CONFIG.PAGE_TIMEOUT },
    //   CONFIG.TABLE_INDICATOR_TEXT
    // );
    // console.log('Seção da tabela encontrada!');

    console.log(`Aguardando o botão "${CONFIG.DOWNLOAD_BUTTON_TEXT}"...`);
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
    console.log(`Aguardando download do arquivo .xlsx em ${CONFIG.DOWNLOAD_DIR} por ${CONFIG.DOWNLOAD_TIMEOUT_S}s...`);
    for (let i = 0; i < CONFIG.DOWNLOAD_TIMEOUT_S; i++) {
      const files = fs.readdirSync(CONFIG.DOWNLOAD_DIR).filter(f =>
        f.endsWith('.xlsx') &&
        f !== path.basename(CONFIG.XLSX_PATH) && // não pode ser o 'tabela_atual.xlsx' (se já existir de um run anterior)
        f !== path.basename(CONFIG.PREV_XLSX_PATH) && // nem o 'prev_tabela.xlsx'
        !f.startsWith('Diferencas_') && // nem arquivos de diferença já existentes
        !f.startsWith('PrêmioGeral-') && !f.startsWith('PrêmioTJMT-') // nem arquivos de prêmio já existentes
      );
      if (files.length > 0) {
        // Pega o arquivo mais recente caso haja múltiplos arquivos inesperados
        downloadedFile = files.map(file => ({ file, mtime: fs.statSync(path.join(CONFIG.DOWNLOAD_DIR, file)).mtime }))
                              .sort((a, b) => b.mtime - a.mtime)[0].file;
        downloadedFile = path.join(CONFIG.DOWNLOAD_DIR, downloadedFile);
        console.log('Arquivo baixado detectado:', downloadedFile);
        break;
      }
      await sleep(CONFIG.DOWNLOAD_CHECK_INTERVAL_MS);
    }

    if (!downloadedFile) {
      throw new Error(`Download não encontrado após ${CONFIG.DOWNLOAD_TIMEOUT_S} segundos.`);
    }
    
    fs.renameSync(downloadedFile, CONFIG.XLSX_PATH);
    console.log('Nova tabela salva como:', CONFIG.XLSX_PATH);
    return CONFIG.XLSX_PATH;
}

function findDifferences(currentData, previousData) {
    console.log('Comparando dados atuais e anteriores...');
    const diffs = [];
    const atualMap = toMapByKey(currentData, CONFIG.KEY_COLUMNS_FOR_DIFF);
    const anteriorMap = toMapByKey(previousData, CONFIG.KEY_COLUMNS_FOR_DIFF);

    // Loop 1: Itera sobre os dados anteriores para encontrar mudanças e itens removidos
    for (const [key, ant] of anteriorMap.entries()) {
        const atu = atualMap.get(key);

        const pontAntNum = parsePontuacao(ant['Pontuação']);
        const resAntText = (typeof ant['Resultado'] === 'string' && ant['Resultado'].trim() !== '') ? ant['Resultado'] : 'Não encontrado';

        if (atu) { // O item existe nos dados anteriores e atuais
            let changed = false;
            for (const col of CONFIG.VALUE_COLUMNS_TO_CHECK_FOR_DIFF) {
                if (String(ant[col]) !== String(atu[col])) { // Comparar como string para cobrir variações
                    changed = true;
                    break;
                }
            }

            if (changed) {
                const pontAtuNum = parsePontuacao(atu['Pontuação']);
                const resAtuText = (typeof atu['Resultado'] === 'string' && atu['Resultado'].trim() !== '') ? atu['Resultado'] : 'Não encontrado';

                const diferencaPontuacao = pontAtuNum - pontAntNum;
                let statusResultado;
                if (resAntText === resAtuText) {
                    statusResultado = `Permanece '${resAtuText}'`;
                } else {
                    statusResultado = `De '${resAntText}' para '${resAtuText}'`;
                }

                diffs.push({
                    'Tribunal (Ant)': ant['Tribunal'],
                    'Requisito (Ant)': ant['Requisito'],
                    'Resultado (Ant)': ant['Resultado'],
                    'Pontuação (Ant)': ant['Pontuação'],
                    'Tribunal (Atual)': atu['Tribunal'],
                    'Requisito (Atual)': atu['Requisito'],
                    'Resultado (Atual)': atu['Resultado'],
                    'Pontuação (Atual)': atu['Pontuação'],
                    'Diferença Pontuação': diferencaPontuacao,
                    'Status Resultado': statusResultado,
                });
            }
        } else { // O item existia nos dados anteriores, mas foi removido
            const pontAtuNum = 0; // Atual é "Não encontrado"
            const resAtuText = 'Não encontrado';

            const diferencaPontuacao = pontAtuNum - pontAntNum;
            const statusResultado = `De '${resAntText}' para '${resAtuText}'`;

            diffs.push({
                'Tribunal (Ant)': ant['Tribunal'],
                'Requisito (Ant)': ant['Requisito'],
                'Resultado (Ant)': ant['Resultado'],
                'Pontuação (Ant)': ant['Pontuação'],
                'Tribunal (Atual)': 'Não encontrado',
                'Requisito (Atual)': 'Não encontrado',
                'Resultado (Atual)': 'Não encontrado',
                'Pontuação (Atual)': 'Não encontrado',
                'Diferença Pontuação': diferencaPontuacao,
                'Status Resultado': statusResultado,
            });
        }
    }

    // Loop 2: Itera sobre os dados atuais para encontrar novos itens adicionados
    for (const [key, atu] of atualMap.entries()) {
        if (!anteriorMap.has(key)) { // O item é novo
            const pontAntNum = 0; // Anterior é "Não encontrado"
            const resAntText = 'Não encontrado';

            const pontAtuNum = parsePontuacao(atu['Pontuação']);
            const resAtuText = (typeof atu['Resultado'] === 'string' && atu['Resultado'].trim() !== '') ? atu['Resultado'] : 'Não encontrado';
            
            const diferencaPontuacao = pontAtuNum - pontAntNum;
            const statusResultado = `De '${resAntText}' para '${resAtuText}'`;

            diffs.push({
                'Tribunal (Ant)': 'Não encontrado',
                'Requisito (Ant)': 'Não encontrado',
                'Resultado (Ant)': 'Não encontrado',
                'Pontuação (Ant)': 'Não encontrado',
                'Tribunal (Atual)': atu['Tribunal'],
                'Requisito (Atual)': atu['Requisito'],
                'Resultado (Atual)': atu['Resultado'],
                'Pontuação (Atual)': atu['Pontuação'],
                'Diferença Pontuação': diferencaPontuacao,
                'Status Resultado': statusResultado,
            });
        }
    }
    return diffs;
}


// --- MAIN EXECUTION ---
(async () => {
    let browser;
    let hasChanges = false;

    try {
        setupDirectories();

        console.log('Verificando arquivo anterior para comparação...');
        const prevFileExists = fs.existsSync(CONFIG.PREV_XLSX_PATH);
        console.log('Arquivo anterior existe?', prevFileExists ? 'Sim' : 'Não');

        const { browser: b, page } = await launchBrowserAndPage();
        browser = b;

        await navigateAndDownload(page); // Baixa e salva como CONFIG.XLSX_PATH

        const currentData = readXlsxSheet(CONFIG.XLSX_PATH);

        if (prevFileExists) {
            console.log('Lendo dados da tabela anterior...');
            const previousData = readXlsxSheet(CONFIG.PREV_XLSX_PATH);
            const differences = findDifferences(currentData, previousData);

            if (differences.length > 0) {
                hasChanges = true;
                console.log(`📝 ${differences.length} diferença(s) detectada(s).`);
                writeXlsxFile(CONFIG.DIFF_XLSX_PATH, differences, 'Diferenças');
                console.log(`Relatório de diferenças gerais salvo em: ${CONFIG.DIFF_XLSX_PATH}`);

                const tjmtDifferences = differences.filter(d =>
                    (d['Tribunal (Ant)'] === CONFIG.TJMT_IDENTIFIER && d['Tribunal (Ant)'] !== 'Não encontrado') ||
                    (d['Tribunal (Atual)'] === CONFIG.TJMT_IDENTIFIER && d['Tribunal (Atual)'] !== 'Não encontrado')
                );
                if (tjmtDifferences.length > 0) {
                    writeXlsxFile(CONFIG.DIFF_TJMT_PATH, tjmtDifferences, 'TJMT');
                    console.log(`Relatório de diferenças TJMT salvo em: ${CONFIG.DIFF_TJMT_PATH}`);
                }
            } else {
                console.log('✅ Nenhuma diferença detectada em comparação com a execução anterior.');
            }
        } else {
            console.log('📥 Primeira execução ou arquivo anterior não encontrado. Marcando como mudança.');
            hasChanges = true; // Considera como mudança para salvar os arquivos base e flag
        }

        // Se houver mudanças (ou primeira execução), salva os arquivos "Prêmio" e atualiza o flag
        if (hasChanges) {
            // Salva cópia geral da tabela atual (com data)
            fs.copyFileSync(CONFIG.XLSX_PATH, CONFIG.GERAL_XLSX_PATH);
            console.log(`Cópia geral da tabela atual (com data) salva em: ${CONFIG.GERAL_XLSX_PATH}`);

            // Filtra e salva dados do TJMT da tabela atual (com data)
            const tjmtCurrentData = currentData.filter(row => row['Tribunal'] === CONFIG.TJMT_IDENTIFIER);
            if (tjmtCurrentData.length > 0) {
                writeXlsxFile(CONFIG.TJMT_XLSX_PATH, tjmtCurrentData, 'TJMT');
                console.log(`Dados atuais do TJMT (com data) salvos em: ${CONFIG.TJMT_XLSX_PATH}`);
            }
            
            // Cria/atualiza o arquivo de flag
            fs.writeFileSync(CONFIG.FLAG_FILE, 'HAS_CHANGES=1'); // Conteúdo pode ser qualquer coisa
            console.log(`🚩 Arquivo de flag criado/atualizado: ${CONFIG.FLAG_FILE}`);
            // core.setOutput('has_changes', 'true'); // Se for usar com GitHub Actions
        } else {
            // core.setOutput('has_changes', 'false'); // Se for usar com GitHub Actions
             if (fs.existsSync(CONFIG.FLAG_FILE)) { // Remove flag se não houve mudanças
                fs.unlinkSync(CONFIG.FLAG_FILE);
                console.log('🚩 Flag removida, sem mudanças.');
            }
        }

        // Sempre atualiza o arquivo anterior com o atual para a próxima execução
        fs.copyFileSync(CONFIG.XLSX_PATH, CONFIG.PREV_XLSX_PATH);
        console.log(`Arquivo base para comparação futura atualizado: ${CONFIG.PREV_XLSX_PATH}`);

        console.log('🚀 Processo concluído com sucesso.');
        process.exitCode = 0;

    } catch (err) {
        console.error('❌ Erro fatal no script:', err.message);
        console.error(err.stack);
        // core.setFailed(err.message); // Se for usar com GitHub Actions
        process.exitCode = 1;
    } finally {
        if (browser) {
            console.log('Fechando o navegador...');
            await browser.close();
        }
        console.log(`Script finalizado.`);
        // process.exit(process.exitCode || 0); // Garante a saída com o código correto
    }
})();
