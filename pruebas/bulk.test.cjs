const {test}=require('node:test');
const assert=require('node:assert/strict');
const {FakeDirectory}=require('./fake-fs.cjs');
require('../core.js');require('../bulk-engine.js');
const E=globalThis.TGLocalBulkEngine;
const fixture=Buffer.from('vídeo sintético para verificar los bytes');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<300;i++){if(fn())return;await sleep(5);}throw new Error('Tiempo agotado');}
function item(index,size=fixture.length){return{docId:String(10000000000000000n+BigInt(index)),mid:index+1,peerId:-123,size,mime:'video/mp4',name:`v_${index}.mp4`};}
function adapter(items,options={}){
  const calls={pages:[],read:0,maxActive:0,active:0};
  const result={calls,problem:'',contextProblem:()=>result.problem,
    listPage:async(filter,cursor)=>{
      calls.pages.push({filter,cursor});
      const list=filter===E.FILTERS[0]?items:(options.additional?.[filter]||[]),offset=cursor?.offset||0;
      const selected=list.slice(offset,offset+25);
      return{items:selected,done:offset+selected.length>=list.length,nextCursor:{offset:offset+selected.length}};
    },
    resolve:async video=>({id:video.docId,size:video.size,dc_id:2}),
    readPart:async(video,doc,offset,limit)=>{
      calls.read++;calls.active++;calls.maxActive=Math.max(calls.maxActive,calls.active);
      await sleep(0);calls.active--;
      const data=options.data||fixture;
      return{bytes:new Uint8Array(data.subarray(offset,offset+limit))};
    }};
  return result;
}
function make(adapter,directory=new FakeDirectory(),extra={}){return new E.Batch({adapter,directory,scope:'10:-123',title:'Grupo',pageDelay:0,...extra});}

test('Recorre más de 120 vídeos, tres filtros y elimina documentos repetidos',async()=>{
  const videos=Array.from({length:181},(_,i)=>item(i));
  const a=adapter(videos,{additional:{[E.FILTERS[1]]:[videos[0],item(200)], [E.FILTERS[2]]:[videos[1],item(201)]}});
  const dir=new FakeDirectory(),batch=make(a,dir);await batch.run();
  assert.equal(batch.state().phase,'done');assert.equal(batch.files.size,183);assert.equal(batch.saved,183);
  assert.equal(dir.closes,183);assert.equal(a.calls.maxActive,1);
  assert.equal(a.calls.pages.filter(c=>c.filter===E.FILTERS[0]).length,8);
  for(const buffer of dir.files.values())assert.deepEqual(buffer,fixture);
});

test('Partes de 512 KB: archivo grande con bytes idénticos y cola secuencial',async()=>{
  const data=Buffer.from(Uint8Array.from({length:E.PART_SIZE*2+137},(_,i)=>i%251));
  const a=adapter([item(1,data.length)],{data}),dir=new FakeDirectory();await make(a,dir).run();
  assert.equal(a.calls.read,3);assert.deepEqual(dir.files.get('v_1.mp4'),data);
});

test('Reiniciar en la misma carpeta omite archivos completos y reemplaza los incompletos',async()=>{
  const a=adapter([item(1),item(2)]),dir=new FakeDirectory();dir.files.set('v_1.mp4',fixture);dir.files.set('v_2.mp4',Buffer.from('incompleto'));
  const first=make(a,dir);await first.run();assert.equal(first.skipped,1);assert.equal(first.saved,1);assert.equal(a.calls.read,1);
  const b=adapter([item(1),item(2)]),next=make(b,dir);await next.run();assert.equal(next.skipped,2);assert.equal(b.calls.read,0);
});

test('Pausar mientras llega una parte no inicia otra solicitud ni confirma el archivo',async()=>{
  const a=adapter([item(1)]),dir=new FakeDirectory();let batch;const original=a.readPart;
  a.readPart=async(...args)=>{const value=await original(...args);batch.pause();return value;};
  batch=make(a,dir);const run=batch.run();await until(()=>batch.paused);await sleep(20);
  assert.equal(a.calls.read,1);assert.equal(dir.writes,0);assert.equal(dir.closes,0);
  batch.resume();await run;assert.equal(batch.saved,1);assert.deepEqual(dir.files.get('v_1.mp4'),fixture);
});

test('Cambiar de cuenta o chat pausa y exige volver al contexto original',async()=>{
  const a=adapter([item(1)]),dir=new FakeDirectory();const original=a.readPart;
  a.readPart=async(...args)=>{const result=await original(...args);a.problem='Cambió el chat';return result;};
  const batch=make(a,dir),run=batch.run();await until(()=>batch.paused);
  assert.equal(batch.resume(),false);assert.equal(dir.writes,0);
  a.problem='';assert.equal(batch.resume(),true);await run;assert.equal(batch.saved,1);
});

test('Detener una solicitud pendiente aborta la escritura y no guarda el registro',async()=>{
  const a=adapter([item(1)]),dir=new FakeDirectory(),records=[];let release;
  a.readPart=()=>new Promise(resolve=>{release=resolve;});
  const batch=make(a,dir,{onRecord:r=>records.push(r)}),run=batch.run();await until(()=>release);
  batch.stop();await run;release({bytes:fixture});await sleep(0);
  assert.equal(batch.state().phase,'stopped');assert.equal(dir.aborts,1);assert.equal(dir.closes,0);assert.equal(records.length,0);
});

test('Una parte truncada se registra como fallo y Reintentar fallidos puede recuperarla',async()=>{
  const a=adapter([item(1)]),original=a.readPart,dir=new FakeDirectory(),records=[];
  a.readPart=async()=>({bytes:new Uint8Array(2)});
  const batch=make(a,dir,{onRecord:r=>records.push(r)});await batch.run();
  assert.equal(batch.failed,1);assert.equal(batch.saved,0);assert.equal(records.length,0);assert.equal(batch.state().canRetry,true);assert.equal(dir.aborts,1);
  a.readPart=original;await batch.run(true);assert.equal(batch.failed,0);assert.equal(batch.saved,1);assert.equal(records.length,1);assert.deepEqual(dir.files.get('v_1.mp4'),fixture);
});

test('No se declara recorrido completo si la paginación repite el mismo cursor',async()=>{
  const a=adapter([item(1)]);a.listPage=async()=>({items:[item(1)],done:false,nextCursor:{offset:1}});
  const batch=make(a);await batch.run();assert.equal(batch.state().phase,'error');assert.equal(batch.completedScan,false);assert.equal(a.calls.read,0);assert.match(batch.message,/listado dejó de avanzar/);
});

test('La pérdida de permisos detiene toda la cola en vez de generar cientos de fallos',async()=>{
  const a=adapter([item(1),item(2)]),dir=new FakeDirectory();dir.denied=true;const batch=make(a,dir);await batch.run();
  assert.equal(batch.state().phase,'error');assert.equal(a.calls.read,0);assert.equal(batch.failed,0);assert.match(batch.message,/permiso/);
});

test('Un fallo transitorio de red se reintenta antes de escribir bytes',async()=>{
  const a=adapter([item(1)]),original=a.readPart;let attempt=0;
  a.readPart=async(...args)=>{if(++attempt===1)throw new Error('NETWORK_TIMEOUT');return original(...args);};
  const dir=new FakeDirectory(),batch=make(a,dir);await batch.run();assert.equal(attempt,2);assert.equal(batch.saved,1);assert.deepEqual(dir.files.get('v_1.mp4'),fixture);
});

test('Normaliza vídeos adjuntos y redondos, excluye PDF y GIF y preserva extensiones',()=>{
  const message={mid:7,peerId:-123,media:{document:{_: 'document',id:'34567891234567890',size:20,file_name:'Clase.avi',mime_type:'application/octet-stream',attributes:[]}}};
  assert.match(E.videoDocument(message).name,/\.avi$/);
  message.media.document.file_name='texto.pdf';assert.equal(E.videoDocument(message),null);
  message.media.document.attributes=[{_:'documentAttributeVideo',pFlags:{round_message:true}}];assert.ok(E.videoDocument(message));
  message.media.document.attributes.push({_:'documentAttributeAnimated'});assert.equal(E.videoDocument(message),null);
  assert.equal(E.component('../Grupo:prueba?'),'_Grupo_prueba_');
});
