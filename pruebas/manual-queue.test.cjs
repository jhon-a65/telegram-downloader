/* Flujos de selección y recuperación con la interfaz real. Sin cuenta ni envíos a Telegram. */
const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,until,tick,OFFSET}=require('./topic-fixture.cjs');

function view(h,index,topic=101){
  const w=h.w,d=w.document,message=h.messages.filter(row=>row.topic===topic)[index].message;
  w.HTMLElement.prototype.getBoundingClientRect=()=>({left:20,top:20,right:900,bottom:700,width:880,height:680});
  let viewer=w.appMediaViewer;
  if(!viewer){const whole=d.createElement('div');whole.className='media-viewer-whole active';d.body.append(whole);viewer=w.appMediaViewer={wholeDiv:whole,content:{}};}
  if(viewer.content.mover){viewer.content.mover.classList.remove('center');viewer.content.mover.classList.add('moving');}
  const mover=d.createElement('div');mover.className='media-viewer-mover center active';
  const video=d.createElement('video');video.src='blob:https://web.telegram.org/v-'+message.id;mover.append(video);viewer.wholeDiv.append(mover);viewer.content.mover=mover;
  viewer.target={peerId:-123,mid:OFFSET+message.id,message:{...message,peerId:-123,mid:OFFSET+message.id}};
  h.command('manual-status');return message.media.document.id;
}
function setup(t,options={}){
  const h=harness(t,options);h.manual=null;h.manualStates=[];
  h.w.document.addEventListener('tg-local:reply',event=>{const data=JSON.parse(event.detail);if(data.type==='manual-state'){h.manual=data;h.manualStates.push(data);}});
  h.command=(type,data={})=>h.w.document.dispatchEvent(new h.w.CustomEvent('tg-local:command',{detail:JSON.stringify({channel:h.state.channel,type,...data})}));
  h.$('.mode-one').click();
  h.queueDir=()=>h.root.children.get('Telegram_10_Cola');
  h.add=(index,topic)=>{const id=view(h,index,topic);h.$('.manual-add').click();return id;};
  h.complete=()=>!h.manual.busy&&['done','batch-done','error','stopped'].includes(h.manual.phase);
  return h;
}
function seed(h,count){
  const rows=h.messages.filter(row=>row.topic===101).slice(0,count);
  const items=rows.map(({message})=>({...h.w.TGLocalBulkEngine.videoDocument({...message,peerId:-123,mid:OFFSET+message.id}),account:10}));
  for(let n=0;n<items.length;n+=10)h.command('manual-restore',{items:items.slice(n,n+10)});
  return items.map(item=>item.docId);
}
const actual=h=>h.calls.parts.map(part=>part.id);

test('Selecciona solo tres, conserva el orden elegido, evita duplicados y no busca el historial',async t=>{
  const h=setup(t,{count:12});await tick(0);
  const expected=[h.add(7),h.add(1),h.add(4)];h.$('.manual-add').click();
  assert.equal(h.manual.pending,3);assert.match(h.manual.message,/ya está/);
  h.$('#manual-count').value='all';h.$('.manual-start').click();await until(h.complete);
  assert.equal(h.manual.phase,'done');assert.deepEqual(actual(h),expected);assert.equal(h.manual.saved,3);assert.equal(h.manual.pending,0);
  assert.equal(h.calls.topics.length,0);assert.equal(h.calls.groups.length,0);
  assert.equal(h.queueDir().videoFiles.size,3);assert.equal(h.storage.tgLocalManualQueue.items.length,3);assert.deepEqual(h.errors,[]);
});
for(const size of [10,20,40,60,100,'all'])test('La cola respeta exactamente la tanda '+size,async t=>{
  const h=setup(t,{count:105});await tick(0);const expected=seed(h,103);
  h.$('#manual-count').value=String(size);h.$('.manual-start').click();await until(h.complete);
  const saved=size==='all'?103:size;
  assert.equal(h.manual.batchSaved,saved);assert.equal(h.manual.pending,103-saved);assert.deepEqual(actual(h),expected.slice(0,saved));
  assert.equal(h.calls.pickers,1);assert.equal(h.calls.groups.length+h.calls.topics.length,0);
  if(size!=='all'){
    h.$('#manual-count').value='all';h.$('.manual-next').click();await until(h.complete);
    assert.deepEqual(actual(h),expected);assert.equal(h.manual.pending,0);assert.equal(h.calls.pickers,1);
  }
});
test('Se puede seguir seleccionando y cambiar de tema mientras descarga; los nuevos quedan para la siguiente tanda',async t=>{
  const h=setup(t,{count:5});await tick(0);const expected=[h.add(0),h.add(2)];
  let release;const held=new Promise(resolve=>release=resolve);h.onRead=async()=>held;
  h.$('#manual-count').value='all';h.$('.manual-start').click();await until(()=>h.calls.parts.length===1);
  h.w.appImManager.chat.threadId=OFFSET+202;
  const next=h.add(0,202);assert.equal(h.manual.pending,3);assert.equal(h.w.TGLocalManual.isBusy(),true);
  h.onRead=null;release();await until(h.complete);assert.deepEqual(actual(h),expected);assert.equal(h.manual.pending,1);
  h.$('.manual-next').click();await until(h.complete);assert.deepEqual(actual(h),[...expected,next]);
});
test('Detener a mitad de una tanda conserva completados y reinicia el vídeo interrumpido',async t=>{
  const h=setup(t,{count:15});await tick(0);const expected=seed(h,12);
  let hold;const held=new Promise(resolve=>hold=resolve);
  h.onRead=async()=>{if(h.calls.parts.length===5)await held;};
  h.$('.manual-start').click();await until(()=>h.calls.parts.length===5);h.$('.manual-stop').click();await until(h.complete);
  assert.equal(h.manual.saved,4);assert.equal(h.manual.pending,8);assert.equal(h.queueDir().videoFiles.size,5,'El handle abortado puede quedar vacío, nunca completo.');
  hold();h.onRead=null;h.$('.manual-next').click();await until(h.complete);
  assert.equal(h.manual.saved,12);assert.deepEqual(actual(h),[...expected.slice(0,5),...expected.slice(4)]);
});
test('Selección y completados sobreviven a cerrar la pestaña aunque se muevan los archivos',async t=>{
  const first=setup(t,{count:15});await tick(0);const expected=[];for(let i=0;i<12;i++)expected.push(first.add(i));
  first.$('.manual-start').click();await until(first.complete);await tick(0);
  assert.equal(first.manual.saved,10);const storage=first.storage,root=first.root,dir=first.queueDir();
  for(const name of dir.videoFiles.keys())dir.files.delete(name);await first.close();
  const h=setup(t,{count:15,storage,root});await until(()=>h.manual.saved===10&&h.manual.pending===2);
  h.$('.manual-start').click();await until(h.complete);assert.deepEqual(actual(h),expected.slice(10));assert.equal(h.manual.saved,12);
});
test('Quitar uno de la selección evita su descarga; abrir otro vídeo no lo selecciona automáticamente',async t=>{
  const h=setup(t,{count:5});await tick(0);const first=h.add(0);h.add(1);view(h,3);
  const rows=[...h.ui.querySelectorAll('.manual-row')];rows[1].querySelector('button').click();
  assert.equal(h.manual.pending,1);h.$('.manual-start').click();await until(h.complete);assert.deepEqual(actual(h),[first]);
});
test('Un cambio de cuenta pausa y no descarga identidades de la otra cuenta',async t=>{
  const h=setup(t,{count:5});await tick(0);h.add(0);let release;
  const held=new Promise(resolve=>release=resolve);h.onRead=async()=>held;
  h.$('.manual-start').click();await until(()=>h.calls.parts.length===1);h.w.rootScope.myId=99;release();
  await until(()=>h.manual.phase==='paused');assert.equal(h.queueDir().videoFiles.size,1);
  assert.equal(JSON.parse(h.queueDir().files.get('Telegram-progreso.json')||'{"completed":[]}').completed.length,0);
  h.w.rootScope.myId=10;h.onRead=null;h.$('.manual-resume').click();await until(h.complete);assert.equal(h.manual.saved,1);
});
test('Cambiar rápidamente de visor rechaza una selección con identidad antigua',async t=>{
  const h=setup(t,{count:5});await tick(0);view(h,0);const token=h.manual.anchor.token;const newest=view(h,1);
  h.command('manual-add',{expectedAnchor:token});assert.equal(h.manual.pending,0);assert.match(h.manual.message,/Cambió/);
  h.$('.manual-add').click();h.$('.manual-start').click();await until(h.complete);assert.deepEqual(actual(h),[newest]);
});
test('El fallo de almacenamiento muestra un error y no permite iniciar una selección que podría perderse',async t=>{
  const h=setup(t,{count:5});await tick(0);h.w.chrome.storage.local.set=async()=>{throw new Error('sin espacio');};h.add(0);
  await until(()=>/No se pudo guardar/.test(h.manual.message));h.$('.manual-start').click();await tick(0);assert.equal(h.calls.pickers,0);
});
test('La selección descarga sin el antiguo subidor aunque queden preferencias anteriores',async t=>{
  const h=setup(t,{count:5,storage:{tgLocalTransferOptions:{enabled:true,maxPending:1,reserveBytes:99999999999}}});await tick(0);h.add(0);h.add(1);
  assert.equal(h.$('#sync-enabled'),null);h.$('#manual-count').value='all';h.$('.manual-start').click();await until(h.complete);
  assert.equal(h.manual.saved,2);assert.equal(h.queueDir().files.has('Telegram-descarga-control.json'),false);
});
test('Las tandas por tema no esperan ningún programa externo',async t=>{
  const h=setup(t,{count:5,storage:{tgLocalTransferOptions:{enabled:true}}});await tick(0);h.$('.mode-group').click();
  h.$('#batch-count').value='all';h.$('.bulk-start').click();await until(()=>!h.state.busy&&h.state.phase==='done');
  assert.equal(h.state.saved,7);assert.equal(h.dir(101).files.has('Telegram-descarga-control.json'),false);assert.equal(h.w.TGLocalTransferGate,undefined);
});
module.exports={setup,seed,view};
