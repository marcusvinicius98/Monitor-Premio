const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');
const XLSX      = require('xlsx');

const URL = 'https://paineisanalytics.cnj.jus.br/single/?appid=b532a1c7-3028-4041-80e2-9620527bd3fa&sheet=fb006575-35ca-4ccd-928c-368edd2045ba&theme=cnj_theme&opt=ctxmenu&select=Ramo%20de%20justi%C3%A7a,Trabalho&select=Ano,&select=tribunal_proces';

const DOWNLOAD_DIR   = path.join(process.cwd(), 'scripts', 'downloads');
const XLSX_PATH      = path.join(DOWNLOAD_DIR, 'tabela_atual.xlsx');
const PREV_XLSX_PATH = path.join(DOWNLOAD_DIR, 'prev_tabela.xlsx');
const DIFF_XLSX_PATH = path.join(DOWNLOAD_DIR, 'Diferencas_CNJ.xlsx');
const DIFF_TJMT_PATH = path.join(DOWNLOAD_DIR, 'Diferencas_CNJ_TJMT.xlsx');
const FLAG_FILE      = path.resolve(__dirname, 'monitor_flag.txt');      // ★ NOVO (já existia, mas vamos usar melhor)

const today          = new Date();
const formattedDate  = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth()+1).padStart(2,'0')}-${today.getFullYear()}`;
const GERAL_XLSX_PATH= path.join(DOWNLOAD_DIR, `PrêmioGeral-${formattedDate}.xlsx`);
const TJMT_XLSX_PATH = path.join(DOWNLOAD_DIR, `PrêmioTJMT-${formattedDate}.xlsx`);

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function toKey(row){ return `${row.Tribunal}|${row.Requisito}`; }

(async ()=>{
  if(!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR,{recursive:true});
  const hasPrev = fs.existsSync(PREV_XLSX_PATH);

  const browser = await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-setuid-sandbox']});
  const page    = await browser.newPage();

  try{
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:DOWNLOAD_DIR});

    console.log('→ Abrindo painel...');
    await page.goto(URL,{waitUntil:'networkidle2'});

    // Faz scroll pra carregar tudo
    await page.evaluate(async()=>{
      await new Promise(res=>{
        let y=0; const d=100;
        const i=setInterval(()=>{
          window.scrollBy(0,d); y+=d;
          if(y>=document.body.scrollHeight){clearInterval(i); res();}
        },100);
      });
    });

    // Espera e clica no botão "Download da Tabela"
    await page.waitForFunction(()=>!![...document.querySelectorAll('div.btn.btn-primary span.ng-binding')].find(s=>s.innerText.includes('Download da Tabela')),{timeout:90000});
    (await page.$('div.btn.btn-primary')).click();

    // espera download
    let dl=null;
    for(let i=0;i<30;i++){
      const f=fs.readdirSync(DOWNLOAD_DIR).find(fn=>fn.endsWith('.xlsx') && fn!=='tabela_atual.xlsx');
      if(f){dl=path.join(DOWNLOAD_DIR,f);break;}
      await sleep(1000);
    }
    if(!dl) throw new Error('Arquivo .xlsx não baixado');
    fs.renameSync(dl,XLSX_PATH);

    const atual   = XLSX.utils.sheet_to_json(XLSX.readFile(XLSX_PATH).Sheets.Sheet1);
    if(!hasPrev){
      // ★ NOVO → cria flag já na primeira vez, para notificar
      fs.copyFileSync(XLSX_PATH,PREV_XLSX_PATH);
      fs.writeFileSync(FLAG_FILE,'HAS_CHANGES=1');
      console.log('Primeira execução — base salva, flag criada.');
      return;
    }

    // compara
    const anterior = XLSX.utils.sheet_to_json(XLSX.readFile(PREV_XLSX_PATH).Sheets.Sheet1);
    const mapAnt   = new Map(anterior.map(r=>[toKey(r),r]));
    const mapAtu   = new Map(atual   .map(r=>[toKey(r),r]));
    const diffs    = [];

    for(const [k,ant] of mapAnt){
      const atu=mapAtu.get(k);
      if(!atu||ant.Resultado!==atu.Resultado||ant['Pontuação']!==atu['Pontuação']) diffs.push({ ...ant, ...{'Resultado (Atual)':atu?.Resultado,'Pontuação (Atual)':atu?.['Pontuação']}});
    }
    for(const [k,atu] of mapAtu) if(!mapAnt.has(k)) diffs.push({ ...{'Resultado (Ant)':'Não encontrado','Pontuação (Ant)':'Não encontrado'}, ...atu });

    if(diffs.length){
      // salva tudo
      fs.copyFileSync(XLSX_PATH, PREV_XLSX_PATH);
      fs.writeFileSync(FLAG_FILE,'HAS_CHANGES=1');                       // ★ NOVO (antes só criava se tivesse diffs)
      XLSX.writeFile({SheetNames:['Diferenças'],Sheets:{Diferenças:XLSX.utils.json_to_sheet(diffs)}},DIFF_XLSX_PATH);
      XLSX.writeFile({SheetNames:['TJMT'],Sheets:{TJMT:XLSX.utils.json_to_sheet(diffs.filter(d=>d.Tribunal==='TJMT'))}},DIFF_TJMT_PATH);
      fs.copyFileSync(XLSX_PATH,GERAL_XLSX_PATH);
      XLSX.writeFile({SheetNames:['TJMT'],Sheets:{TJMT:XLSX.utils.json_to_sheet(atual.filter(r=>r.Tribunal==='TJMT'))}},TJMT_XLSX_PATH);
      console.log(`Δ ${diffs.length} diferenças salvas.`);
    }else{
      console.log('Nenhuma diferença.');
    }
  }catch(e){
    console.error('Erro:',e);
    process.exitCode=1;
  }finally{
    await browser.close();
  }
})();
