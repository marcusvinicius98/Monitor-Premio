const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=b532a1c7-3028-4041-80e2-9620527bd3fa&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Trabalho&select=Ano,&select=tribunal_proces';

const HASH_FILE = path.resolve(__dirname, 'last_hash.txt');
const DATA_FILE = path.resolve(__dirname, 'last_table_data.txt');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  try {
    await page.goto(URL, { waitUntil: 'networkidle2' });

    // Aguarda o carregamento da tabela
    await page.waitForSelector('.qv-object-table table', { timeout: 30000 });

    // Extrai os textos das células (em ordem visual)
    const tableText = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.qv-object-table table tr'));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('th span, td span'));
        return cells.map(cell => cell.innerText.trim()).join('\t');
      }).join('\n');
    });

    fs.writeFileSync(DATA_FILE, tableText);

    if (!tableText || tableText.length < 10) {
      console.log('⚠️ Tabela vazia ou ilegível. Abortando notificação.');
      process.exit(0);
    }

    const currentHash = Buffer.from(tableText).toString('base64');
    const previousHash = fs.existsSync(HASH_FILE) ? fs.readFileSync(HASH_FILE, 'utf8') : null;

    if (currentHash !== previousHash) {
      fs.writeFileSync(HASH_FILE, currentHash);
      console.log('✅ Alteração detectada na tabela.');
      process.exit(1);
    } else {
      console.log('🟢 Sem alteração nos dados da tabela.');
      process.exit(0);
    }

  } catch (err) {
    console.error('❌ Erro ao processar a tabela:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
