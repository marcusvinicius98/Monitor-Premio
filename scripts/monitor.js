const axios = require('axios');
const fs = require('fs');
const path = require('path');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=c87073c8-32b3-4b3f-911a-b25063edf692&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Estadual&select=Ano,&select=tribunal_proces';

const HASH_FILE = path.resolve(__dirname, 'last_hash.txt');
const DATA_FILE = path.resolve(__dirname, 'last_table_data.txt');

(async () => {
  try {
    const response = await axios.get(URL);
    const html = response.data;

    // Extrai conteúdo visível das células <td>
    const rawMatches = Array.from(html.matchAll(/<td[^>]*>(.*?)<\/td>/gi));
    const tableCells = rawMatches
      .map(match => match[1]
        .replace(/<[^>]+>/g, '')    // remove tags internas
        .replace(/&nbsp;/g, ' ')    // converte espaços não separáveis
        .trim()
      )
      .filter(text => text !== '') // remove células vazias
      .join('|');

    // Salva conteúdo atual da tabela para inspeção
    fs.writeFileSync(DATA_FILE, tableCells);

    // Se não extraiu nada relevante, cancela a execução silenciosamente
    if (!tableCells || tableCells.length < 10) {
      console.log('⚠️ Nenhum conteúdo útil extraído da tabela. Abortando notificação.');
      process.exit(0);
    }

    const currentHash = Buffer.from(tableCells).toString('base64');

    let previousHash = null;
    if (fs.existsSync(HASH_FILE)) {
      previousHash = fs.readFileSync(HASH_FILE, 'utf8');
    }

    if (currentHash !== previousHash) {
      fs.writeFileSync(HASH_FILE, currentHash);
      console.log('✅ Alteração real detectada na tabela.');
      process.exit(1);
    } else {
      console.log('🟢 Sem alteração nos dados da tabela.');
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Erro ao acessar o painel CNJ:', error.message);
    process.exit(1); // por segurança, alerta se falhou
  }
})();
