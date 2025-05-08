const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

const mensagem = `📢 <b>Alteração detectada no painel CNJ!</b>\n🔗 <a href="https://paineisanalytics.cnj.jus.br/single/?appid=c87073c8-32b3-4b3f-911a-b25063edf692&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Estadual&select=Ano,&select=tribunal_proces">Acesse o painel</a>\n📎 Arquivos com as diferenças estão em anexo.`;

// Envia a mensagem
async function enviarMensagemTexto() {
  return axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: mensagem,
    parse_mode: 'HTML',
    disable_web_page_preview: false
  });
}

// Envia arquivo
function enviarArquivo(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) return resolve();

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('document', fs.createReadStream(filePath));

    axios.post(`https://api.telegram.org/bot${token}/sendDocument`, form, {
      headers: form.getHeaders()
    }).then(() => {
      console.log(`✅ Arquivo enviado: ${filePath}`);
      resolve();
    }).catch(err => {
      console.error(`❌ Erro ao enviar ${filePath}:`, err.response?.data || err.message);
      reject(err);
    });
  });
}

(async () => {
  try {
    await enviarMensagemTexto();
    await enviarArquivo(path.resolve(__dirname, 'downloads/Diferencas_CNJ.xlsx'));
    await enviarArquivo(path.resolve(__dirname, 'downloads/Diferencas_CNJ_TJMT.xlsx'));
  } catch (err) {
    process.exit(1);
  }
})();
