const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=b532a1c7-3028-4041-80e2-9620527bd3fa&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Trabalho&select=Ano,&select=tribunal_proces';

const HASH_FILE = path.resolve(__dirname, 'last_hash.txt');
const DATA_FILE = path.resolve(__dirname, 'last_table_data.txt');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  try {
    await page.goto(URL, { waitUntil: 'networkidle2' });

    // Scroll para garantir que os dados carreguem
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));

    // Espera pelos dados reais da tabela
    await page.waitForSelector('.qv-st-data .qv-st-value span', { timeout: 60000 });

    // Extrai todos os textos visíveis das células
    const tableText = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.qv-st-data .qv-st-value span'))
        .map(el => el.innerText.trim())
        .filter(Boolean)
        .join('|'); // ou '\n' para linha por linha
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
