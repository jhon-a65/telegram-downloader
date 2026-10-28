/* Adaptadores y controles reales, respuestas nativas simuladas. */
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,until,tick,OFFSET}=require('./topic-fixture.cjs');
const P=512*1024;
function prepare(t){
  const h=harness(t,{count:0});h.manual=null;
  h.w.document.addEventListener('tg-local:reply',event=>{const data=JSON.parse(event.detail);if(data.type==='manual-state')h.manual=data;});
  h.command=(type,data={})=>h.w.document.dispatchEvent(new h.w.CustomEvent('tg-local:command',{detail:JSON.stringify({channel:h.state.channel,type,...data})}));
  const message=h.messages[0].message,doc=message.media.document;doc.size=20*P+71;
  h.doc=doc;h.message=message;
  h.seed=()=>h.command('manual-restore',{items:[{...h.w.TGLocalBulkEngine.videoDocument({...message,peerId:-123,mid:OFFSET+message.id}),account:10}]});
  return h;
}
for(const mode of ['topic','manual'])test(`Velocidad 16 en ${mode}: partes simultáneas y una sola renovación de referencia`,async t=>{
  const h=prepare(t);let active=0,maxActive=0;
  h.onRead=async({id,dc,offset,limit})=>{
    if(id!==h.doc.id)return;
    if(dc===2)throw new Error('FILE_REFERENCE_EXPIRED');
    active++;maxActive=Math.max(maxActive,active);await tick(3);active--;
    return {bytes:new Uint8Array(Math.min(limit,h.doc.size-offset)).fill(Math.floor(offset/P)%251)};
  };
  if(mode==='topic'){
    h.$('#batch-parallel').value='16';h.$('#batch-parallel').dispatchEvent(new h.w.Event('change'));h.start();await until(()=>!h.state.busy&&['done','error'].includes(h.state.phase));
    assert.equal(h.state.phase,'done');assert.equal(h.state.parallelism,16);assert.equal(h.storage.tgLocalBatchOptions.parallelism,16);
  }else{
    h.$('.mode-one').click();h.seed();h.$('#manual-parallel').value='16';h.$('#manual-parallel').dispatchEvent(new h.w.Event('change'));h.$('.manual-start').click();
    await until(()=>h.manual&&!h.manual.busy&&['done','error'].includes(h.manual.phase));assert.equal(h.manual.phase,'done');assert.equal(h.manual.parallelism,16);assert.equal(h.storage.tgLocalManualOptions.parallelism,16);
  }
  assert.equal(h.calls.reloads,1);assert.equal(maxActive,16);
  const dir=mode==='topic'?h.dir(101):h.root.children.get('Telegram_10_Cola');
  const bytes=[...dir.videoFiles].find(([name])=>name.includes(h.doc.id))[1];assert.equal(bytes.length,h.doc.size);
  for(let offset=0;offset<bytes.length;offset+=P)assert.equal(bytes[offset],Math.floor(offset/P)%251);
  assert.deepEqual(h.errors,[]);
});
test('Una referencia caducada que llega después de Detener no inicia una renovación huérfana',async t=>{
  const h=prepare(t);h.$('.mode-one').click();h.seed();let reject;
  const pending=new Promise((resolve,no)=>reject=no);h.onRead=()=>pending;
  h.$('.manual-start').click();await until(()=>h.calls.parts.length===8);h.$('.manual-stop').click();await until(()=>!h.w.TGLocalManual.isBusy());
  reject(new Error('FILE_REFERENCE_EXPIRED'));await tick(30);assert.equal(h.calls.reloads,0);assert.equal(h.manual.saved,0);assert.equal(h.manual.pending,1);
});
test('La selección de velocidad se conserva tras cerrar y abrir el navegador',async t=>{
  const first=prepare(t);first.$('#batch-parallel').value='4';first.$('#batch-parallel').dispatchEvent(new first.w.Event('change'));
  first.$('#manual-parallel').value='16';first.$('#manual-parallel').dispatchEvent(new first.w.Event('change'));
  const storage=first.storage;await first.close();const second=harness(t,{count:0,storage});await tick(0);
  assert.equal(second.$('#batch-parallel').value,'4');assert.equal(second.$('#manual-parallel').value,'16');
});
