// Envia arquivos de diferenças gerados pelo monitor.
// NÃO faz novo scraping.

const fs   = require('fs');
const path = require('path');
const axios= require('axios');
const Form = require('form-data');

const DOWNLOAD_DIR = path.join(process.cwd(),'scripts','downloads');
const FLAG_FILE    = path.resolve(__dirname,'monitor_flag.txt');   // mesma flag do monitor

const BOT  = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
if(!BOT||!CHAT){ console.error('🔑 Defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID'); process.exit(1); }

const today         = new Date();
const formattedDate = `${String(today.getDate()).padStart(2,'0')}-${String(today.getMonth()+1).padStart(2,'0')}-${today.getFullYear()}`;
const FILES = [
  {file:'Diferencas_CNJ.xlsx',             caption:'📊 Diferenças CNJ'},
  {file:'Diferencas_CNJ_TJMT.xlsx',        caption:'📊 Diferenças TJMT'},
  {file:`PrêmioGeral-${formattedDate}.xlsx`,caption:`🏆 Prêmio Geral ${formattedDate}`},
  {file:`PrêmioTJMT-${formattedDate}.xlsx`, caption:`🏆 Prêmio TJMT ${formattedDate}`}
];

// ------------- FUNÇÃO DE ENVIO -------------
async function sendDoc(full,caption){
  const form=new Form();
  form.append('chat_id',CHAT);
  form.append('caption',caption);
  form.append('document',fs.createReadStream(full));
  await axios.post(`https://api.telegram.org/bot${BOT}/sendDocument`,form,{headers:form.getHeaders()});
  console.log('Enviado:',path.basename(full));
}

// ------------- EXECUÇÃO --------------------
(async()=>{
  if(!fs.existsSync(FLAG_FILE)){           // ★ NOVO: só manda se o monitor marcou diferença
    console.log('Sem flag → nada a enviar.');
    return;
  }

  for(const {file,caption} of FILES){
    const full=path.join(DOWNLOAD_DIR,file);
    if(fs.existsSync(full)) await sendDoc(full,caption);
    else console.log('Arquivo não encontrado, pulando:',file);
  }

  fs.unlinkSync(FLAG_FILE);                // limpa flag para o próximo ciclo
})();
