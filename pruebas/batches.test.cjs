/* Tandas, orden y reinicios completos con una carpeta persistente simulada. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, until, tick, OFFSET} = require('./topic-fixture.cjs');
const FILE = 'Telegram-progreso.json';
const settled = h => () => !h.state.busy && ['done','batch-done','error'].includes(h.state.phase);
const ids = h => h.calls.parts.map(part => part.id);
const progress = dir => JSON.parse(dir.files.get(FILE).toString('utf8'));
function configure(h, {count=10, bytes=null, order='asc', continueProgress=true} = {}) {
  h.$('#batch-count').value = count === null ? 'all' : [10,20,50].includes(count) ? String(count) : 'custom';
  h.$('#batch-custom').value = count === null ? '10' : String(count);
  h.$('#batch-gb').value = bytes === null ? '' : String(bytes / 1024 ** 3);
  h.$('#batch-order').value = order;
  h.$('#batch-continue').checked = continueProgress;
  h.$('#batch-count').dispatchEvent(new h.w.Event('change'));
}

test('Por defecto son 10 nuevos; tres tandas automáticas 10+10+7, sin otro selector ni nueva búsqueda', async t => {
  const h = harness(t, {count:25, batchSize:'default'});
  assert.equal(h.$('#batch-count').value, '10');
  h.start(); await until(settled(h));
  assert.equal(h.state.phase, 'batch-done'); assert.equal(h.state.batchSaved, 10); assert.equal(h.state.pending, 17);
  assert.deepEqual(ids(h), h.expected(101).slice(0,10));
  const searches = h.calls.topics.length;
  h.$('.bulk-next').click(); await until(() => settled(h)() && h.state.batchIndex === 2);
  assert.equal(h.state.batchSaved, 10); assert.equal(h.state.pending, 7);
  h.$('.bulk-next').click(); await until(() => h.done() && h.state.batchIndex === 3);
  assert.equal(h.state.batchSaved, 7); assert.equal(h.state.saved, 27);
  assert.equal(h.calls.pickers, 1); assert.equal(h.calls.topics.length, searches);
  assert.deepEqual(ids(h), h.expected(101)); assert.equal(new Set(ids(h)).size, 27);
  assert.equal(progress(h.dir(101)).completed.length, 27); assert.equal(h.$('.bulk-next').hidden, true);
});

for (const count of [20,50,7]) test('Respeta la tanda de ' + count + ' vídeos', async t => {
  const h = harness(t, {count:55}); configure(h, {count}); h.start(); await until(settled(h));
  assert.equal(h.state.batchSaved, count); assert.equal(h.state.saved, count); assert.equal(h.state.pending, 57-count);
  assert.equal(h.dir(101).videoFiles.size, count); assert.equal(progress(h.dir(101)).completed.length, count);
});

test('Todos completa la cola sin una cuota de tanda', async t => {
  const h = harness(t, {count:12}); configure(h, {count:null}); h.start(); await until(h.done);
  assert.equal(h.state.saved, 14); assert.equal(h.state.canNext, false);
});

test('Se puede cambiar de 10 a 20 para la siguiente tanda', async t => {
  const h = harness(t, {count:35}); configure(h); h.start(); await until(settled(h));
  configure(h, {count:20}); h.$('.bulk-next').click(); await until(() => settled(h)() && h.state.batchIndex === 2);
  assert.equal(h.state.batchSaved, 20); assert.equal(h.state.saved, 30); assert.equal(h.state.pending, 7);
});

test('El tope de GB detiene antes de superar el acumulado y se reinicia en la siguiente tanda', async t => {
  const h = harness(t, {count:8}); const cap = h.fixture.length * 2 + Math.floor(h.fixture.length / 2);
  configure(h, {count:10, bytes:cap}); h.start(); await until(settled(h));
  assert.equal(h.state.batchSaved, 2); assert.equal(h.state.limitReason, 'bytes');
  assert.equal(h.state.batchBytes, h.fixture.length * 2); assert.ok(h.state.batchBytes <= cap);
  assert.equal(ids(h).length, 2);
  h.$('.bulk-next').click(); await until(() => settled(h)() && h.state.batchIndex === 2);
  assert.equal(h.state.batchSaved, 2); assert.equal(h.state.saved, 4); assert.equal(ids(h).length, 4);
});

test('Un vídeo mayor que el tope no se empieza ni se marca; aumentar el tope permite continuar', async t => {
  const h = harness(t, {count:4}); configure(h, {bytes:h.fixture.length-1}); h.start(); await until(settled(h));
  assert.equal(h.state.limitReason, 'file-too-large'); assert.equal(h.state.saved, 0); assert.equal(ids(h).length, 0);
  assert.equal(h.dir(101).files.has(FILE), false); assert.equal(h.$('.bulk-next').disabled, true);
  configure(h, {bytes:h.fixture.length*2}); assert.equal(h.$('.bulk-next').disabled, false);
  h.$('.bulk-next').click(); await until(() => settled(h)() && h.state.batchIndex === 2);
  assert.equal(h.state.batchSaved, 2); assert.equal(progress(h.dir(101)).completed.length, 2);
});

test('Cantidades inválidas y topes negativos se rechazan antes de abrir la carpeta', t => {
  const h = harness(t, {count:1}); configure(h, {count:0}); h.start();
  assert.equal(h.calls.pickers, 0); assert.match(h.$('.bulk-message').textContent, /cantidad/);
  configure(h, {count:1.5}); h.start(); assert.equal(h.calls.pickers, 0);
  configure(h, {bytes:-1}); h.start(); assert.equal(h.calls.pickers, 0);
});

test('Cerrar y volver a crear el navegador conserva orden y omite vídeos movidos o borrados', async t => {
  const first = harness(t, {count:25}); configure(first); first.start(); await until(settled(first));
  const root = first.root, dir = first.dir(101), completed = progress(dir).completed.map(item => item.docId);
  assert.deepEqual(completed, first.expected(101).slice(0,10));
  for (const name of dir.videoFiles.keys()) dir.files.delete(name);
  await first.close();
  const second = harness(t, {count:25, root, batchSize:'default'}); second.start(); await until(settled(second));
  assert.equal(second.state.batchSaved, 10); assert.equal(second.state.skipped, 10); assert.equal(second.state.pending, 7);
  assert.equal(second.state.batchIndex, 2); assert.equal(second.state.progressCount, 20);
  assert.ok(second.$('.bulk-resume-info').textContent.includes(second.state.lastCompleted));
  assert.deepEqual(ids(second), second.expected(101).slice(10,20));
  assert.equal(progress(dir).completed.length, 20); assert.equal(dir.videoFiles.size, 10);
});

test('El orden recientes primero se recupera del archivo aunque se pierdan las preferencias del navegador', async t => {
  const first = harness(t, {count:12}); configure(first, {count:3,order:'desc'}); first.start(); await until(settled(first));
  assert.deepEqual(ids(first), first.expected(101).slice().reverse().slice(0,3));
  const root = first.root; await first.close();
  const second = harness(t, {count:12,root}); configure(second, {count:3,order:'asc'}); second.start(); await until(settled(second));
  assert.equal(second.state.order, 'desc'); assert.equal(second.$('#batch-order').value, 'desc');
  assert.deepEqual(ids(second), second.expected(101).slice().reverse().slice(3,6));
});

test('Antiguos primero mezcla cronológicamente vídeos normales, archivos y vídeos redondos', async t => {
  const h = harness(t, {count:3});
  const file = h.messages.find(row => row.topic===101 && row.filter==='inputMessagesFilterDocument');
  const round = h.messages.find(row => row.topic===101 && row.filter==='inputMessagesFilterRoundVideo');
  file.message.date -= 10000; round.message.date -= 9000;
  configure(h, {count:4}); h.start(); await until(settled(h));
  const expected = h.messages.filter(row => row.topic===101).sort((a,b)=>a.message.date-b.message.date).slice(0,4).map(row=>row.message.media.document.id);
  assert.deepEqual(ids(h), expected);
});

test('Los archivos completos existentes se registran y no consumen los 10 nuevos', async t => {
  const h = harness(t, {count:12}); const dir = await h.root.getDirectoryHandle('Telegram_10_-123_Tema_101',{create:true});
  for (const row of h.messages.filter(row=>row.topic===101).slice(0,3)) {
    const item = h.w.TGLocalBulkEngine.videoDocument({...row.message,mid:OFFSET+row.message.id,peerId:-123});
    dir.files.set(item.name, Buffer.from(h.fixture));
  }
  configure(h); h.start(); await until(settled(h));
  assert.equal(h.state.saved, 10); assert.equal(h.state.skipped, 3); assert.equal(h.state.pending, 1);
  assert.equal(progress(dir).completed.length, 13); assert.equal(ids(h).length, 10);
});

test('Un vídeo interrumpido no se registra y vuelve a descargarse después de reiniciar', async t => {
  const first = harness(t, {count:4}); let release;
  configure(first, {count:2});
  first.onRead = async () => { if (first.calls.parts.length===2) await new Promise(resolve=>{release=resolve;}); };
  first.start(); await until(()=>release);
  const root=first.root,dir=first.dir(101); assert.equal(progress(dir).completed.length, 1);
  first.$('.bulk-stop').click(); release(); await first.close();
  const second=harness(t,{count:4,root});configure(second,{count:2});second.start();await until(settled(second));
  assert.deepEqual(ids(second),second.expected(101).slice(1,3));assert.equal(progress(dir).completed.length,3);
});

test('Reintentar fallidos respeta la tanda y no descarga otros pendientes', async t => {
  const h=harness(t,{count:1});let fail=true;configure(h,{count:1});
  h.onRead=async({id})=>fail&&id===h.expected(101)[0]?{bytes:new Uint8Array(1)}:undefined;
  h.start();await until(settled(h));assert.equal(h.state.saved,1);assert.equal(h.state.failed,1);assert.equal(h.state.pending,1);
  fail=false;const before=ids(h).length;h.$('.bulk-retry').click();await until(()=>settled(h)()&&h.state.batchIndex===2);
  assert.equal(h.state.batchSaved,1);assert.equal(h.state.failed,0);assert.equal(h.state.pending,1);assert.equal(ids(h).length,before+1);
  assert.equal(progress(h.dir(101)).completed.length,2);
});

test('Registro dañado o de otro tema detiene el inicio sin sobrescribirlo', async t => {
  for(const text of ['{"version":',JSON.stringify({version:1,scope:'10:-123:topic:202',completed:[]})]) {
    const h=harness(t,{count:1});const dir=await h.root.getDirectoryHandle('Telegram_10_-123_Tema_101',{create:true});
    dir.files.set(FILE,Buffer.from(text));configure(h);h.start();
    await until(()=>/No se pudo leer Telegram-progreso/.test(h.state.message));
    assert.equal(h.calls.topics.length,0);assert.equal(ids(h).length,0);assert.equal(dir.files.get(FILE).toString(),text);await h.close();
  }
});

test('Si falla guardar el registro, se detiene tras el vídeo y se recupera el registro antes de la siguiente tanda', async t => {
  const h=harness(t,{count:3});const dir=await h.root.getDirectoryHandle('Telegram_10_-123_Tema_101',{create:true});
  const native=dir.getFileHandle.bind(dir);let fail=true;
  dir.getFileHandle=async(name,options)=>{
    const handle=await native(name,options);
    if(name!==FILE||!options?.create)return handle;
    return {...handle,createWritable:async()=>{
      const writer=await handle.createWritable();
      return {...writer,write:async bytes=>{
        assert.ok([...dir.videoFiles.values()].some(data=>data.length===h.fixture.length),'El vídeo debe estar confirmado antes del registro.');
        if(fail)throw new Error('Disco no disponible');return writer.write(bytes);
      }};
    }};
  };
  configure(h,{count:1});h.start();await until(()=>h.state.phase==='error');
  assert.equal(h.state.saved,1);assert.equal(ids(h).length,1);assert.match(h.state.message,/confirmar su progreso/);
  fail=false;h.$('.bulk-next').click();await until(()=>settled(h)()&&h.state.batchIndex===2);
  assert.equal(progress(dir).completed.length,2);assert.equal(ids(h).length,2);
});

test('Desmarcar continuar permite recuperar vídeos eliminados sin usar el registro para omitirlos', async t => {
  const first=harness(t,{count:3});configure(first,{count:2});first.start();await until(settled(first));
  const root=first.root,dir=first.dir(101);for(const name of dir.videoFiles.keys())dir.files.delete(name);await first.close();
  const second=harness(t,{count:3,root});configure(second,{count:2,continueProgress:false});second.start();await until(settled(second));
  assert.deepEqual(ids(second),second.expected(101).slice(0,2));assert.equal(second.state.skipped,0);
});

test('Un registro inicial vacío se reconstruye sin bloquear la continuación', async t => {
  const h=harness(t,{count:1});const dir=await h.root.getDirectoryHandle('Telegram_10_-123_Tema_101',{create:true});
  dir.files.set(FILE,Buffer.alloc(0));configure(h,{count:2});h.start();await until(settled(h));
  assert.equal(h.state.saved,2);assert.equal(progress(dir).completed.length,2);
});

test('Mensajes nuevos entre sesiones quedan después de los antiguos pendientes al continuar', async t => {
  const first=harness(t,{count:6});configure(first,{count:2});first.start();await until(settled(first));const root=first.root;await first.close();
  const second=harness(t,{count:6,root});
  const row=second.messages.find(item=>item.topic===202);row.topic=101;row.message.reply_to={_: 'messageReplyHeader',pFlags:{forum_topic:true},reply_to_top_id:101};row.message.date+=10000;
  configure(second,{count:null});second.start();await until(second.done);
  const ordered=second.messages.filter(item=>item.topic===101).sort((a,b)=>a.message.date-b.message.date).map(item=>item.message.media.document.id);
  assert.deepEqual(ids(second),ordered.slice(2));assert.equal(ids(second).at(-1),row.message.media.document.id);
});
