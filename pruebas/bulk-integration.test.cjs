/* Integración del adaptador Web K, cola e interfaz; clientes y disco simulados. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {FakeDirectory}=require('./fake-fs.cjs');
const {JSDOM,VirtualConsole}=require(process.env.TG_DOM_MODULES?path.join(process.env.TG_DOM_MODULES,'jsdom'):'jsdom');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<700;i++){if(fn())return;await pause(5);}throw new Error('Tiempo agotado esperando la cola');}
async function harness(count=62){
  const base=path.resolve(__dirname,'..'),fixture=await fs.readFile(path.join(__dirname,'fixture.mp4'));
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="column-center"><div class="chat-info"><span class="peer-title">Grupo de prueba</span></div></div></body></html>',{url:'https://web.telegram.org/k/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window,storage={},docs=new Map(),allMessages=[],calls={history:[],parts:[],pickers:0,reloads:0,migrations:0,hydrates:0};
  const h={dom,w,storage,fixture,calls,errors,root:new FakeDirectory('Destino'),title:'Grupo de prueba',onRead:null,wrongPeer:false,migrationWait:null};
  w.Blob=Blob;w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.MediaSource=class{};
  w.URL.createObjectURL=()=>`blob:https://web.telegram.org/test-${Math.random()}`;w.URL.revokeObjectURL=()=>{};
  w.performance.getEntriesByType=()=>[];w.fetch=async()=>{throw new Error('No debe usar fetch para el lote del grupo');};
  w.chrome={runtime:{onMessage:{addListener:()=>{}},sendMessage:async()=>{}},storage:{local:{get:async key=>({[key]:storage[key]}),set:async value=>{Object.assign(storage,value);}}}};
  function message(index,kind='video',peerId=-123){
    const id=String(80000000000000000n+BigInt(index));
    const doc={_: 'document',id,dc_id:2,size:fixture.length,file_name:`Clase-${index}.mp4`,mime_type:'video/mp4',attributes:[{_:'documentAttributeVideo'}]};
    if(kind==='file'){doc.attributes=[{_:'documentAttributeFilename',file_name:doc.file_name}];}
    if(kind==='round'){doc.attributes=[{_:'documentAttributeVideo',pFlags:{round_message:true}}];}
    if(kind==='pdf'){doc.mime_type='application/pdf';doc.file_name='documento.pdf';doc.attributes=[];}
    docs.set(id,doc);const value={mid:10000-index,peerId,date:1700000000+index,media:{document:doc}};allMessages.push(value);return value;
  }
  const videos=Array.from({length:count},(_,i)=>message(i+1)),extra=message(501,'file'),round=message(502,'round'),pdf=message(503,'pdf');
  const data={inputMessagesFilterVideo:videos,inputMessagesFilterDocument:[videos[0],extra,pdf].filter(Boolean),inputMessagesFilterRoundVideo:[round]};
  const manager={
    getMigration:async()=>{calls.migrations++;if(h.migrationWait)await h.migrationWait;return h.migration || null;},
    getHistory:async options=>{
      assert.equal(options.peerId,-123);assert.equal(options.limit,50);assert.equal(options.query,'');
      calls.history.push(options);
      const list=data[options.inputFilter._].filter(m=>!options.offsetId||m.mid<options.offsetId),selected=list.slice(0,options.limit);
      const messages=selected.map(m=>h.wrongPeer?{...m,peerId:-999}:m);
      return{history:messages.map(m=>h.numericHistory?m.mid:`${m.peerId}_${m.mid}`),messages:h.historyOnly?undefined:messages,isEnd:{top:list.length<=options.limit},count:list.length};
    },
    reloadMessage:async(peerId,mid)=>{calls.reloads++;assert.equal(peerId,-123);const found=allMessages.find(m=>m.mid===mid);if(found)found.media.document.dc_id=3;return found;},
    getMessageByPeer:async(peerId,mid)=>{calls.hydrates++;return allMessages.find(m=>m.peerId===peerId&&m.mid===mid);}
  };
  w.rootScope={myId:10};w.appImManager={chat:{peerId:-123},managers:{appMessagesManager:manager,appDocsManager:{
    getDoc:async id=>docs.get(id),
    requestDocPart:async(id,dc,offset,limit)=>{
      assert.ok(docs.has(id));assert.equal(limit,512*1024);assert.equal(offset%(512*1024),0);calls.parts.push({id,dc,offset,limit});
      if(h.onRead){const result=await h.onRead({id,dc,offset,limit});if(result!==undefined)return result;}
      return{bytes:new Uint8Array(fixture.subarray(offset,offset+limit))};
    }
  }}};
  w.apiManagerProxy={getChat:()=>({title:h.title})};
  h.data=data;
  for(const file of JSON.parse(require('node:fs').readFileSync(path.join(base,'manifest.json'),'utf8')).content_scripts.flatMap(entry=>entry.js))w.eval(await fs.readFile(path.join(base,file),'utf8'));
  h.rootUI=w.document.getElementById('tg-local-video-tools').shadowRoot;h.$=s=>h.rootUI.querySelector(s);
  h.open=()=>{h.$('.launch').click();h.$('.mode-group').click();h.$('#batch-count').value='all';h.$('#batch-count').dispatchEvent(new w.Event('change'));};
  h.enablePicker=()=>{w.showDirectoryPicker=async()=>{calls.pickers++;return h.root;};h.$('.mode-group').click();};
  h.finished=()=>!h.$('.bulk-start').disabled && /terminad/.test(h.$('.bulk-message').textContent);
  h.close=()=>w.close();
  return h;
}

(async()=>{
  let h=await harness();
  try{
    h.open();assert.equal(h.$('.bulk-view').hidden,false);assert.equal(h.$('.bulk-setup').hidden,false);
    h.$('.bulk-start').click();assert.match(h.$('.bulk-message').textContent,/selector de carpetas/);assert.equal(h.calls.history.length,0);
    console.log('PASS: detecta selector desactivado en Brave y muestra instrucciones sin iniciar solicitudes.');
    h.enablePicker();h.$('.bulk-start').click();await until(h.finished);
    assert.equal(h.calls.pickers,1);assert.equal(h.$('.bulk-found').textContent,'64');assert.equal(h.$('.bulk-saved').textContent,'64');
    assert.ok(h.calls.history.filter(o=>o.inputFilter._==='inputMessagesFilterVideo').length===2);
    const dir=h.root.children.get('Telegram_10_-123');assert.equal(dir.videoFiles.size,64);
    for(const buffer of dir.videoFiles.values())assert.deepEqual(buffer,h.fixture);
    await until(()=>Object.keys(h.storage).filter(k=>k.startsWith('tgLocalBulkHistory:10:-123:')).length===64);
    console.log('PASS: desde la interfaz descubre 64 vídeos con paginación Web K, deduplicación y bytes idénticos.');
    console.log('PASS: registro local escrito después de confirmar los archivos.');
    const oldReads=h.calls.parts.length;h.title='Grupo renombrado';h.$('.bulk-start').click();await until(h.finished);
    assert.equal(h.calls.pickers,2);assert.equal(h.$('.bulk-skipped').textContent,'64');assert.equal(h.calls.parts.length,oldReads);
    assert.equal(h.root.children.size,1);
    console.log('PASS: nuevo recorrido en la misma carpeta omite completos incluso tras renombrar el grupo.');
    h.root=dir;h.$('.bulk-start').click();await until(h.finished);
    assert.equal(h.$('.bulk-skipped').textContent,'64');assert.equal(dir.children.size,0);
    console.log('PASS: seleccionar directamente la subcarpeta anterior no crea carpetas anidadas ni duplica vídeos.');
    assert.deepEqual(h.errors,[]);
  }finally{h.close();}

  h=await harness(1);
  try{
    h.open();h.enablePicker();h.historyOnly=true;h.$('.bulk-start').click();await until(h.finished);
    assert.equal(h.$('.bulk-saved').textContent,'3');assert.ok(h.calls.hydrates>=3);
    console.log('PASS: listados de identificadores sin mensajes se resuelven usando la caché del cliente.');
  }finally{h.close();}

  h=await harness();
  try{
    h.open();h.enablePicker();h.migration={prev:-111};h.numericHistory=true;
    for(const msg of h.data.inputMessagesFilterVideo.slice(45))msg.peerId=-111;
    h.$('.bulk-start').click();await until(h.finished);
    const pages=h.calls.history.filter(o=>o.inputFilter._==='inputMessagesFilterVideo');
    assert.equal(pages[1].offsetPeerId,-111);assert.equal(h.$('.bulk-saved').textContent,'64');
    console.log('PASS: historial migrado conserva el chat de origen del cursor sin aceptar chats ajenos.');
  }finally{h.close();}

  h=await harness(1);
  try{
    h.open();h.enablePicker();let release,first=true;
    h.onRead=async()=>{if(first){first=false;await new Promise(resolve=>{release=resolve;});}};
    h.$('.bulk-start').click();await until(()=>release);h.$('.bulk-pause').click();release();
    await until(()=>!h.$('.bulk-resume').hidden);await pause(20);
    const before=h.calls.parts.length;h.$('.bulk-stop').click();await until(()=>/Cola detenida/.test(h.$('.bulk-message').textContent));await pause(10);
    assert.equal(h.calls.parts.length,before);assert.equal(h.root.children.get('Telegram_10_-123').closes,0);
    console.log('PASS: los controles Pausar y Detener frenan la cola y abortan el archivo pendiente.');
  }finally{h.close();}

  h=await harness(1);
  try{
    h.open();h.enablePicker();let fail=true;h.onRead=async()=>fail?{bytes:new Uint8Array(1)}:undefined;
    h.$('.bulk-start').click();await until(h.finished);assert.equal(h.$('.bulk-failed').textContent,'3');
    assert.equal(h.$('.bulk-retry').hidden,false);fail=false;h.$('.bulk-retry').click();
    await until(()=>h.finished()&&h.$('.bulk-failed').textContent==='0');
    assert.equal(h.$('.bulk-saved').textContent,'3');assert.equal(h.calls.pickers,1);
    console.log('PASS: Reintentar fallidos reutiliza la carpeta y guarda correctamente los archivos recuperados.');
  }finally{h.close();}

  h=await harness(1);
  try{
    h.open();h.enablePicker();let expired=true;
    h.onRead=async()=>{if(expired){expired=false;throw{type:'FILE_REFERENCE_EXPIRED'};}};
    h.$('.bulk-start').click();await until(h.finished);assert.equal(h.$('.bulk-failed').textContent,'0');
    assert.equal(h.calls.reloads,1);assert.ok(h.calls.parts.some(p=>p.dc===3));
    console.log('PASS: referencia caducada se renueva a través del mensaje original antes de continuar.');
  }finally{h.close();}

  h=await harness(1);
  try{
    h.open();h.enablePicker();h.wrongPeer=true;h.$('.bulk-start').click();
    await until(()=>/otro chat/.test(h.$('.bulk-message').textContent));assert.equal(h.calls.parts.length,0);
    console.log('PASS: respuesta inesperada de otro chat se rechaza antes de descargar.');
  }finally{h.close();}

  h=await harness(1);
  try{
    h.open();h.enablePicker();let release;h.migrationWait=new Promise(resolve=>{release=resolve;});
    h.$('.bulk-start').click();await until(()=>h.calls.migrations>0);h.$('.bulk-stop').click();release();
    await until(()=>/Cola detenida/.test(h.$('.bulk-message').textContent));await pause(10);assert.equal(h.calls.history.length,0);
    console.log('PASS: detener durante una preparación pendiente no inicia después consultas huérfanas.');
  }finally{h.close();}

  h=await harness(1);
  try{
    h.open();h.enablePicker();h.dom.reconfigure({url:'https://web.telegram.org/a/'});h.$('.mode-group').click();
    assert.equal(h.$('.bulk-start').disabled,true);assert.match(h.$('.bulk-message').textContent,/Web K/);assert.equal(h.calls.history.length,0);
    console.log('PASS: el modo masivo limita explícitamente la compatibilidad a Web K.');
  }finally{h.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
