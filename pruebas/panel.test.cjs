const test=require('node:test'),assert=require('node:assert/strict');
const {setup,until,tick}=require('./backup-fixture.cjs');
test('Cuatro secciones accesibles: solo una visible y navegación con flechas',async t=>{
  const h=await setup(t),tabs=[...h.ui.querySelectorAll('[role=tab]')];assert.equal(tabs.length,4);
  for(const name of ['one','manual','group','backup']){
    h.$('.mode-'+name).click();const visible=[...h.ui.querySelectorAll('[role=tabpanel]')].filter(x=>!x.hidden);assert.equal(visible.length,1);assert.equal(visible[0].id,'tg-view-'+name);
    assert.equal(h.ui.querySelectorAll('[role=tab][aria-selected=true]').length,1);
  }
  h.$('.mode-tabs').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(h.$('.mode-one').getAttribute('aria-selected'),'true');
});
test('Apoya al creador está en la esquina del lanzador y usa exactamente el enlace indicado',async t=>{
  const h=await setup(t),a=h.$('.support');assert.equal(a.href,'https://paypal.me/jhonanthony229');assert.equal(a.target,'_blank');assert.ok(a.rel.includes('noopener'));assert.ok(a.rel.includes('noreferrer'));assert.ok(a.closest('.launcher-row'));assert.equal(a.closest('.panel'),null);assert.match(a.textContent,/Apoya al creador/);
  assert.equal(h.$('.sync-box'),null);assert.equal(h.$('#sync-enabled'),null);assert.equal(h.calls.pickers,0);assert.equal(h.calls.parts.length,0);
});
test('Elegir algunos temas se conserva tras reabrir y no se amplía automáticamente a todos',async t=>{
  const first=await setup(t);first.choose([101]);await tick(0);assert.equal(first.$('#backup-selected').checked,true);const storage=first.storage;await first.close();
  const h=await setup(t,{storage});assert.equal(h.$('#backup-selected').checked,true);assert.equal(h.ui.querySelectorAll('.backup-topic-list input:checked').length,1);
  h.start();await until(h.finished);assert.deepEqual(h.manifest().topics.map(x=>x.id),[101]);
});
test('La búsqueda de temas solo filtra la lista y conserva las casillas elegidas',async t=>{
  const h=await setup(t);h.choose([101,202]);const input=h.$('.backup-topic-filter');input.value='Python';input.dispatchEvent(new h.w.Event('input'));
  assert.equal([...h.ui.querySelectorAll('.backup-topic-list label')].filter(x=>!x.hidden).length,1);assert.equal(h.ui.querySelectorAll('.backup-topic-list input:checked').length,2);
});
test('La actualización con Todos incorpora automáticamente temas creados desde la copia anterior',async t=>{
  const h=await setup(t);h.start();await until(h.finished);h.titles.set(303,'Tema nuevo');const file=h.addFile(303,'videos');h.onRead=({id})=>id===file.id?{bytes:new Uint8Array(file.data)}:undefined;
  h.update();await until(h.finished);assert.equal(h.backup.saved,1);assert.ok(h.manifest().topics.some(t=>t.id===303));assert.equal(h.backup.topicsTotal,4);
});
test('Actualizar una selección conserva su alcance aunque aparezcan temas nuevos',async t=>{
  const h=await setup(t);h.choose([101]);h.start();await until(h.finished);h.titles.set(303,'Tema nuevo');h.addFile(303,'videos');h.update();await until(h.finished);assert.deepEqual(h.manifest().topics.map(x=>x.id),[101]);assert.equal(h.backup.saved,0);
});
