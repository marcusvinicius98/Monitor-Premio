const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=c87073c8-32b3-4b3f-911a-b25063edf692&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Estadual&select=Ano,&select=tribunal_process';


const LAST_FILE = path.resolve(__dirname, 'last_table_data.txt');
const PREV_FILE = path.resolve(__dirname, 'prev_table_data.txt');
const FLAG_FILE = path.resolve(__dirname, 'monitor_flag.txt');
const DIFF_FILE = path.resolve(__dirname, 'diff_table.txt');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  try {
    console.log('🌐 Acessando painel...');
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForSelector('.qv-st-data .qv-st-value span', { timeout: 90000 });

    console.log('✅ Tabela localizada, extraindo conteúdo...');
    const lines = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.qv-st-data .qv-st-value span'))
        .map(el => el.innerText.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    });

    const tableText = lines.join('\n');
    if (!tableText || lines.length === 0) {
      console.log('⚠️ Tabela vazia ou ilegível. Nenhuma ação será tomada.');
      process.exit(0);
    }

    fs.writeFileSync(LAST_FILE, tableText);

    const lastSet = new Set(lines);
    const prevLines = fs.existsSync(PREV_FILE)
      ? fs.readFileSync(PREV_FILE, 'utf8').trim().split('\n')
      : [];
    const prevSet = new Set(prevLines);

    const added = [...lastSet].filter(line => !prevSet.has(line));
    const removed = [...prevSet].filter(line => !lastSet.has(line));

    if (added.length === 0 && removed.length === 0) {
      console.log('🟢 Nenhuma linha visivelmente alterada (mesmo com ordem diferente).');
      fs.writeFileSync(DIFF_FILE, 'Nenhuma linha visivelmente alterada.');
    } else {
      fs.copyFileSync(LAST_FILE, PREV_FILE);
      fs.writeFileSync(FLAG_FILE, 'HAS_CHANGES=1');

      let diffOutput = '';
      if (added.length > 0) {
        diffOutput += '➕ Linhas adicionadas:\n' + added.map(l => `+ ${l}`).join('\n') + '\n\n';
      }
      if (removed.length > 0) {
        diffOutput += '➖ Linhas removidas:\n' + removed.map(l => `- ${l}`).join('\n');
      }

      fs.writeFileSync(DIFF_FILE, diffOutput.trim());

      console.log('🔍 Diferenças detectadas:');
      console.log(diffOutput.trim());
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
