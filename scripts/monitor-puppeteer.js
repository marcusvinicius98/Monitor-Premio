const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=c87073c8-32b3-4b3f-911a-b25063edf692&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Estadual&select=Ano,&select=tribunal_process';

const HASH_FILE = path.resolve(__dirname, 'last_hash.txt');
const DATA_FILE = path.resolve(__dirname, 'last_table_data.txt');
const PREV_DATA_FILE = path.resolve(__dirname, 'prev_table_data.txt');
const FLAG_FILE = path.resolve(__dirname, 'monitor_flag.txt');
const DIFF_FILE = path.resolve(__dirname, 'diff_table.txt');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  try {
    await page.goto(URL, { waitUntil: 'networkidle2' });
    console.log('⏳ Aguardando renderização da tabela Qlik...');
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForSelector('.qv-st-data .qv-st-value span', { timeout: 90000 });
    console.log('✅ Tabela localizada, iniciando extração...');

    const lines = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.qv-st-data .qv-st-value span'))
        .map(el => el.innerText.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    });

    const tableText = lines.join('\n');
    if (!tableText || tableText.length < 10) {
      console.log('⚠️ Tabela vazia ou ilegível. Abortando notificação.');
      process.exit(0);
    }

    fs.writeFileSync(DATA_FILE, tableText);
    const currentHash = Buffer.from(tableText).toString('base64');

    const previousLines = fs.existsSync(PREV_DATA_FILE)
      ? fs.readFileSync(PREV_DATA_FILE, 'utf8').split('\n')
      : [];

    const changed = lines.filter((line, idx) => line !== previousLines[idx]);

    if (changed.length === 0) {
      console.log('🟢 Nenhuma linha visivelmente alterada. Sem notificação.');
      fs.writeFileSync(DIFF_FILE, 'Nenhuma linha visivelmente alterada.');
    } else {
      fs.writeFileSync(HASH_FILE, currentHash);
      fs.copyFileSync(DATA_FILE, PREV_DATA_FILE);
      fs.writeFileSync(FLAG_FILE, 'HAS_CHANGES=1');

      console.log('🔍 Linhas alteradas:');
      const diffOutput = changed.map((line, i) => {
        console.log(`Linha ${i + 1}: ${line}`);
        return `Linha ${i + 1}: ${line}`;
      }).join('\n');
      fs.writeFileSync(DIFF_FILE, diffOutput);

      console.log('✅ Alteração detectada na tabela.');
    }

    process.exit(0);

  } catch (err) {
    await page.screenshot({ path: 'scripts/erro_tabela.png' });
    console.error('❌ Erro ao processar a tabela:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
