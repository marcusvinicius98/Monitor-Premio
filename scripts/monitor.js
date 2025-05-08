const axios = require('axios');
const fs = require('fs');
const path = require('path');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=c87073c8-32b3-4b3f-911a-b25063edf692&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Estadual&select=Ano,&select=tribunal_proces';
const HASH_FILE = path.resolve(__dirname, 'last_hash.txt');

(async () => {
  try {
    const response = await axios.get(URL);
    const html = response.data;

    // Captura apenas os valores textuais das células <td> que estão na tabela
    const tableData = Array.from(html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
      .map(match => match[1].replace(/<[^>]+>/g, '').trim()) // remove tags internas e espaços
      .join('|'); // separa com pipe para manter consistência na ordenação

    const currentHash = Buffer.from(tableData).toString('base64');

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
    console.error('❌ Erro ao acessar o painel:', error.message);
    process.exit(1); // melhor enviar alerta por segurança
  }
})();
