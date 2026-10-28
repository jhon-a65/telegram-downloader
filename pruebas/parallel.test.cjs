/* Partes simultáneas de un archivo: transporte simulado, bytes y escritura reales en memoria. */
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {FakeDirectory}=require('./fake-fs.cjs');require('../core.js');require('../bulk-engine.js');
const E=TGLocalBulkEngine,P=E.PART_SIZE,tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let n=0;n<1000;n++){if(fn())return;await tick(3);}throw new Error('La descarga paralela no alcanzó el estado esperado.');}
const hash=data=>createHash('sha256').update(data).digest('hex');
function setup(count=24,parallelism=8,options={}){
  const data=Buffer.alloc(P*count+71);for(let n=0;n<data.length;n++)data[n]=(Math.floor(n/P)*17+n%251)%256;
  const items=Array.from({length:options.files||1},(_,i)=>({docId:String(i+1),mid:i+1,peerId:-1,size:data.length,date:i+1,name:`Video__tg_${i+1}.mp4`}));
  const directory=new FakeDirectory(),calls=[],finished=[],records=[];
  const h={data,items,directory,calls,finished,records,active:0,maxActive:0,read:null};
  const adapter={problem:'',contextProblem:()=>adapter.problem,listPage:async filter=>({items:filter===E.FILTERS[0]?items:[],done:true}),resolve:async item=>({size:item.size}),
    readPart:async(item,doc,offset,limit,signal)=>{
      adapter.beforeRequest?.();signal?.throwIfAborted();calls.push({doc:item.docId,offset});h.active++;h.maxActive=Math.max(h.maxActive,h.active);
      try{
        if(h.read){const custom=await h.read({item,offset,limit,signal});if(custom!==undefined)return custom;}
        await tick(1);finished.push(offset);return {bytes:new Uint8Array(data.subarray(offset,offset+limit))};
      }finally{h.active--;}
    }};
  const batch=new E.Batch({adapter,directory,scope:'10:-1',title:'Test',pageDelay:0,parallelism,onRecord:record=>records.push(record),...options});
  return Object.assign(h,{adapter,batch});
}
for(const parallel of [1,4,8,16])test(`Modo ${parallel}: recibe fuera de orden y confirma los bytes correctos`,async()=>{
  const h=setup(20,parallel);h.read=async({offset})=>{await tick(offset===0?15:1);};
  await h.batch.run();assert.equal(h.batch.saved,1);assert.equal(h.batch.failed,0);assert.equal(h.maxActive,parallel);
  assert.equal(hash(h.directory.files.get(h.items[0].name)),hash(h.data));assert.equal(h.records.length,1);
  if(parallel>1)assert.notEqual(h.finished[0],0);
});
test('La ventana permanece acotada aunque la primera parte llegue mucho después',async()=>{
  const h=setup(32,4);let release;const held=new Promise(resolve=>release=resolve);h.read=async({offset})=>{if(!offset)await held;};
  const run=h.batch.run();await until(()=>h.calls.length===4);await tick(20);assert.equal(h.calls.length,4);assert.equal(h.directory.writes,0);
  release();await run;assert.equal(h.batch.saved,1);assert.equal(h.maxActive,4);
});
test('Un disco lento aplica contrapresión sin solicitar todo el archivo de antemano',async()=>{
  const h=setup(32,8),original=h.directory.getFileHandle.bind(h.directory);let release,entered=false;
  const held=new Promise(resolve=>release=resolve);
  h.directory.getFileHandle=async(...args)=>{const handle=await original(...args),create=handle.createWritable;handle.createWritable=async()=>{
    const writer=await create();const write=writer.write;writer.write=async bytes=>{if(!entered){entered=true;await held;}await write(bytes);};return writer;};return handle;};
  const run=h.batch.run();await until(()=>entered);await tick(20);assert.equal(h.calls.length,8);release();await run;assert.equal(h.batch.saved,1);
});
test('Reanudar despierta a todas las partes que esperaban una pausa, sin bloquear la cola',async()=>{
  const h=setup(12,8);let release;const held=new Promise(resolve=>release=resolve);let first=0;
  h.read=async()=>{if(first++<8){await held;throw Object.assign(new Error('pausa'),{defer:true});}};
  const run=h.batch.run();await until(()=>h.calls.length===8);h.batch.pause();release();await tick(20);
  assert.equal(h.calls.length,8);assert.equal(h.directory.writes,0);assert.equal(h.batch.resume(),true);await run;
  assert.equal(h.batch.saved,1);assert.equal(hash(h.directory.files.get(h.items[0].name)),hash(h.data));
});
test('Detener cancela enseguida todas las esperas aunque las solicitudes nativas no respondan',async()=>{
  const h=setup(32,16);h.read=()=>new Promise(()=>{});const run=h.batch.run();await until(()=>h.calls.length===16);
  h.batch.stop();await run;assert.equal(h.batch.stage,'stopped');assert.equal(h.directory.aborts,1);assert.equal(h.directory.closes,0);assert.equal(h.records.length,0);
  await tick(20);assert.equal(h.calls.length,16);
});
test('Una parte futura truncada cancela la ventana y nunca confirma un archivo incompleto',async()=>{
  const h=setup(16,8);let release;const held=new Promise(resolve=>release=resolve);
  h.read=async({offset})=>{if(!offset)await held;if(offset===P)return {bytes:new Uint8Array(2)};};
  const run=h.batch.run();await until(()=>h.batch.failed===1);release();await run;
  assert.equal(h.batch.saved,0);assert.equal(h.directory.closes,0);assert.equal(h.directory.aborts,1);assert.equal(h.records.length,0);
});
test('Un fallo de escritura detiene la cola sin iniciar solicitudes posteriores',async()=>{
  const h=setup(20,8),get=h.directory.getFileHandle.bind(h.directory);
  h.directory.getFileHandle=async(...args)=>{const handle=await get(...args),create=handle.createWritable;handle.createWritable=async()=>{
    const writer=await create();writer.write=async()=>{throw new DOMException('sin espacio','QuotaExceededError');};return writer;};return handle;};
  await h.batch.run();assert.equal(h.batch.stage,'error');assert.equal(h.directory.closes,0);assert.equal(h.directory.aborts,1);
  const calls=h.calls.length;await tick(10);assert.equal(h.calls.length,calls);assert.equal(h.records.length,0);
});
test('Cambiar de cuenta pausa antes de escribir y exige volver a la cuenta original',async()=>{
  const h=setup(20,8);let release;const held=new Promise(resolve=>release=resolve);h.read=async()=>held;
  const run=h.batch.run();await until(()=>h.calls.length===8);h.adapter.problem='Cambiaste de cuenta';release();await until(()=>h.batch.paused);
  assert.equal(h.directory.writes,0);assert.equal(h.batch.resume(),false);h.adapter.problem='';h.read=null;h.batch.resume();await run;assert.equal(h.batch.saved,1);
});
test('Las partes paralelas no descargan varios vídeos ni exceden el límite de tanda',async()=>{
  const h=setup(8,8,{files:3,limits:{maxFiles:1}});await h.batch.run();assert.equal(h.batch.batchSaved,1);assert.equal(h.batch.stage,'batch-done');
  assert.ok(h.calls.every(call=>call.doc==='1'));const before=h.calls.length;await h.batch.next();assert.equal(h.batch.batchSaved,1);
  assert.ok(h.calls.slice(before).every(call=>call.doc==='2'));assert.equal(h.records.length,2);
});
test('Tamaños de 4 GiB conservan los offsets largos sin reunir el vídeo en RAM',async()=>{
  const size=4*1024**3,part=new Uint8Array(P),item={docId:'99',mid:1,peerId:-1,size,date:1,name:'Grande__tg_99.mp4'};
  let written=0,maxOffset=0,closed=false;
  const directory={name:'virtual',getFileHandle:async(name,options)=>{if(!options?.create)throw new DOMException('No existe','NotFoundError');return {createWritable:async()=>({write:async bytes=>{written+=bytes.length;},close:async()=>{closed=true;},abort:async()=>{}})};}};
  const adapter={listPage:async filter=>({items:filter===E.FILTERS[0]?[item]:[],done:true}),resolve:async()=>({size}),readPart:async(item,doc,offset)=>{maxOffset=Math.max(maxOffset,offset);assert.ok(Number.isSafeInteger(offset));return {bytes:part};}};
  const batch=new E.Batch({directory,adapter,scope:'10:-1',title:'virtual',pageDelay:0,parallelism:16});await batch.run();
  assert.equal(batch.saved,1);assert.equal(written,size);assert.equal(closed,true);assert.equal(maxOffset,size-P);assert.ok(maxOffset>2**31);
});
test('Configuraciones inválidas no crean una cola con miles de solicitudes',()=>{
  for(const value of [0,-1,2,32,'8',NaN])assert.throws(()=>setup(1,value),/modo de descarga/);
});
test('Una respuesta que llega después de su timeout no elimina los listeners de los nuevos reintentos',async()=>{
  const controller=new AbortController(),signal=controller.signal,callbacks=new Set();
  const add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
  signal.addEventListener=(type,callback,...rest)=>{if(type==='abort')callbacks.add(callback);return add(type,callback,...rest);};
  signal.removeEventListener=(type,callback,...rest)=>{if(type==='abort')callbacks.delete(callback);return remove(type,callback,...rest);};
  let late;const old=E.cancellable(new Promise(resolve=>late=resolve),signal,5).catch(error=>error);
  await old;const second=E.cancellable(new Promise(()=>{}),signal).catch(error=>error);
  late('respuesta antigua');await tick(0);
  const third=E.cancellable(new Promise(()=>{}),signal).catch(error=>error);
  assert.equal(callbacks.size,1);controller.abort();
  const errors=await Promise.all([second,third]);assert.ok(errors.every(error=>error.name==='AbortError'));assert.equal(callbacks.size,0);
});
