const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=c87073c8-32b3-4b3f-911a-b25063edf692&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Estadual&select=Ano,&select=tribunal_proces';

async function fetchContent() {
    try {
        const response = await axios.get(URL);
        return response.data;
    } catch (error) {
        console.error('Erro ao buscar o conteúdo:', error.message);
        return null;
    }
}

function getContentHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

async function checkForChanges() {
    const currentContent = await fetchContent();
    if (!currentContent) return false;

    const currentHash = getContentHash(currentContent);
    const filePath = path.join(__dirname, '../last_content.txt');

    try {
        if (fs.existsSync(filePath)) {
            const lastHash = fs.readFileSync(filePath, 'utf-8');
            if (lastHash === currentHash) {
                console.log('Nenhuma alteração detectada.');
                return false;
            }
        }

        // Salva o novo hash
        fs.writeFileSync(filePath, currentHash);
        console.log('Alteração detectada!');
        return true;
    } catch (error) {
        console.error('Erro ao verificar alterações:', error);
        return false;
    }
}

module.exports = checkForChanges;
