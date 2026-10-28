/* Integración DOM simulada; no reemplaza la prueba en Chrome real.
   Requiere jsdom 26: TG_DOM_MODULES=/ruta/node_modules node pruebas/integration.test.cjs */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const {createHash} = require('node:crypto');
const {JSDOM,VirtualConsole} = require(process.env.TG_DOM_MODULES ? path.join(process.env.TG_DOM_MODULES,'jsdom') : 'jsdom');
const hash = data => createHash('sha256').update(data).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
async function until(fn) { for(let i=0;i<300;i++){if(fn())return;await pause(10);}throw new Error('Tiempo agotado esperando el estado de la interfaz.'); }

(async () => {
  const base = path.resolve(__dirname,'..');
  const fixture = await fs.readFile(path.join(__dirname,'fixture.mp4'));
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError',error=>errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><head><title>Fixture</title></head><body><main></main></body></html>',{
    url:'https://web.telegram.org/k/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole
  });
  const w = dom.window;
  Object.defineProperty(w.navigator,'language',{value:'es-PE',configurable:true});
  const storage={},runtimeListeners=[],blobMap=new Map(),saved=[],requests=[],performanceEntries=[];
  let serial=0,slow=false;
  w.Blob=Blob;w.AbortSignal=AbortSignal;w.AbortController=AbortController;
  w.MediaSource=class MediaSource {};
  w.URL.createObjectURL=object=>{const url=`blob:https://web.telegram.org/local-${++serial}`;blobMap.set(url,object);return url;};
  w.URL.revokeObjectURL=url=>blobMap.delete(url);
  w.performance.getEntriesByType=()=>performanceEntries;
  w.HTMLElement.prototype.getBoundingClientRect=function(){return this.style.display==='none'?{x:0,y:0,top:0,left:0,bottom:0,right:0,width:0,height:0}:{x:30,y:30,top:30,left:30,bottom:210,right:350,width:320,height:180};};
  w.HTMLAnchorElement.prototype.click=function(){const blob=blobMap.get(this.href);if(!blob)throw new Error('URL de descarga no local');blob.arrayBuffer().then(buffer=>saved.push(Buffer.from(buffer)));};
  w.chrome={
    runtime:{onMessage:{addListener:fn=>runtimeListeners.push(fn)},sendMessage:async()=>{}},
    storage:{local:{get:async key=>({[key]:storage[key]}),set:async obj=>Object.assign(storage,obj)}}
  };
  w.showSaveFilePicker=async()=>{throw new Error('El selector debe configurarse explícitamente en esta prueba');};
  w.fetch=async (url,init={})=>{
    url=String(url);requests.push({url,range:init.headers?.Range});
    if(slow)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,400);init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(init.signal.reason);},{once:true});});
    if(url.startsWith('blob:'))return new Response(blobMap.get(url),{headers:{'Content-Type':'video/mp4'}});
    assert.ok(url.startsWith('https://web.telegram.org/stream/'));
    const [,a,b]=/bytes=(\d+)-(\d+)/.exec(init.headers.Range);
    const start=Number(a),end=Math.min(Number(b),start+1023,fixture.length-1);
    return new Response(fixture.subarray(start,end+1),{status:206,headers:{'Content-Type':'video/mp4','Content-Range':`bytes ${start}-${end}/${fixture.length}`}});
  };
  try {
    for(const file of JSON.parse(require('node:fs').readFileSync(path.join(base,'manifest.json'),'utf8')).content_scripts.flatMap(entry=>entry.js))w.eval(await fs.readFile(path.join(base,file),'utf8'));
    const root=w.document.getElementById('tg-local-video-tools').shadowRoot;
    const $=selector=>root.querySelector(selector);
    const row=pattern=>[...root.querySelectorAll('.item')].find(el=>pattern.test(el.textContent));
    const status=()=>$('.status-title').textContent;
    const scan=()=>$('.scan').click();
    const addVideo=src=>{const video=w.document.createElement('video');video.src=src;w.document.querySelector('main').appendChild(video);return video;};
    const blobUrl=w.URL.createObjectURL(new Blob([fixture],{type:'video/mp4'}));
    addVideo(blobUrl);
    $('.launch').click();scan();
    await until(()=>row(/Cargado/));
    assert.equal($('.launch').getAttribute('aria-expanded'),'true');
    assert.ok(row(/Cargado/).textContent.includes('En pantalla'));
    console.log('PASS: arranque, puente de eventos, detección del Blob y panel.');

    $('#memory').checked=true;$('#disk').checked=false;
    const save=async pattern=>{
      const before=saved.length;
      row(pattern).querySelector('.download').click();
      await until(()=>saved.length>before && status().includes('descargas de Chrome'));
      assert.equal(hash(saved.at(-1)),hash(fixture));
    };
    const beforeBlob=requests.length;
    await save(/Cargado/);
    assert.equal(requests.length,beforeBlob);
    console.log('PASS: Blob guardado con bytes idénticos y cero solicitudes fetch.');

    const rangeUrl='https://web.telegram.org/stream/'+encodeURIComponent(JSON.stringify({fileName:'Por-partes.mp4',mimeType:'video/mp4',size:fixture.length}));
    const rangeVideo=addVideo(rangeUrl);performanceEntries.push({name:rangeUrl});scan();
    assert.ok(row(/Por-partes.mp4/));
    const beforeBlocked=requests.length;
    row(/Por-partes.mp4/).querySelector('.download').click();
    assert.match(status(),/Desmarca/);assert.equal(requests.length,beforeBlocked);
    console.log('PASS: solo datos cargados impide nuevas solicitudes de partes.');

    $('#memory').checked=false;
    await save(/Por-partes.mp4/);
    assert.ok(requests.length-beforeBlocked>2);
    console.log('PASS: ensamblado segmentado a través de la interfaz, checksum idéntico.');
    for(let i=0;i<3;i++)await save(/Cargado/);
    assert.equal(saved.length,5);
    console.log('PASS: cinco descargas consecutivas sin cuota diaria.');

    let disk;
    w.showSaveFilePicker=async()=>({createWritable:async()=>({write:async bytes=>disk.parts.push(Buffer.from(bytes)),close:async()=>{disk.closed=true;},abort:async()=>{disk.aborted=true;}})});
    disk={parts:[],closed:false,aborted:false};$('#disk').checked=true;
    row(/Por-partes.mp4/).querySelector('.download').click();
    await until(()=>disk.closed && status()==='Vídeo guardado.');
    assert.equal(hash(Buffer.concat(disk.parts)),hash(fixture));assert.equal(disk.aborted,false);
    console.log('PASS: escritura por partes y cierre correcto con selector simulado.');

    disk={parts:[],closed:false,aborted:false};slow=true;
    row(/Por-partes.mp4/).querySelector('.download').click();
    await until(()=>status()==='Guardando vídeo…');$('.cancel').click();
    await until(()=>status()==='Descarga cancelada.');
    assert.equal(disk.closed,false);assert.equal(disk.aborted,true);slow=false;
    console.log('PASS: cancelar aborta la escritura sin confirmar un archivo incompleto.');

    addVideo(w.URL.createObjectURL(new w.MediaSource()));scan();
    const mse=row(/Flujo del reproductor/);assert.ok(mse);mse.querySelector('.download').click();
    assert.match(status(),/flujo del reproductor/);
    console.log('PASS: un MediaSource no se presenta como un archivo completo.');

    rangeVideo.remove();scan();$('.clear').click();scan();
    assert.equal(row(/Por-partes.mp4/),undefined);
    console.log('PASS: limpiar descarta elementos antiguos aunque sigan en el historial de recursos.');

    $('#memory').checked=true;$('#memory').dispatchEvent(new w.Event('change'));
    assert.equal(storage.tgLocalOptions.memoryOnly,true);
    runtimeListeners[0]({type:'tg-local-toggle'});assert.equal($('.panel').hidden,true);
    runtimeListeners[0]({type:'tg-local-toggle'});assert.equal($('.panel').hidden,false);
    assert.deepEqual(errors,[]);
    console.log('PASS: preferencias y acción de la barra de Chrome (API simulada).');

    const manifest=JSON.parse(await fs.readFile(path.join(base,'manifest.json'),'utf8'));
    assert.deepEqual(manifest.permissions,['storage']);
    assert.ok(manifest.content_scripts.every(entry=>entry.matches.length===1&&entry.matches[0]==='https://web.telegram.org/*'));
    for(const item of manifest.content_scripts)for(const file of item.js)await fs.access(path.join(base,file));
    await fs.access(path.join(base,manifest.background.service_worker));
    console.log('PASS: manifiesto MV3 y archivos declarados, permiso limitado a preferencias locales.');
  } finally {w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
