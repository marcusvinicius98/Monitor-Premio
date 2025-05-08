const axios = require('axios');
const fs = require('fs');
const path = require('path');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=c87073c8-32b3-4b3f-911a-b25063edf692&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Estadual&select=Ano,&select=tribunal_proces';
const HASH_FILE = path.resolve(__dirname, 'last_hash.txt');

(async () => {
  try {
    const response = await axios.get(URL);
    const currentContent = response.data;

    // Gera um hash simples com base no conteúdo (ou use um trecho específico)
    const currentHash = Buffer.from(currentContent).toString('base64').substring(0, 100); // reduzido para desempenho

    let previousHash = null;
    if (fs.existsSync(HASH_FILE)) {
      previousHash = fs.readFileSync(HASH_FILE, 'utf8');
    }

    if (currentHash !== previousHash) {
      // Conteúdo mudou
      fs.writeFileSync(HASH_FILE, currentHash);
      console.log('Alteração detectada.');
      process.exit(1); // <- Indica que houve alteração
    } else {
      console.log('Sem alteração.');
      process.exit(0); // <- Nada mudou
    }

  } catch (error) {
    console.error('Erro ao acessar o painel CNJ:', error.message);
    process.exit(1); // <- Em caso de erro, notifica como se fosse mudança para garantir alerta
  }
})();
