const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require(process.env.TG_DOM_MODULES?path.join(process.env.TG_DOM_MODULES,'jsdom'):'jsdom');
const {setup,until,tick}=require('./backup-fixture.cjs');
const base=path.resolve(__dirname,'..'),compiled=fs.readFileSync(path.join(base,'i18n.js'),'utf8');
const context={};vm.runInNewContext(compiled,context);const I=context.TGLocalI18n;
function language(h,value){h.$('#tg-language').value=value;h.$('#tg-language').dispatchEvent(new h.w.Event('change'));}

test('Auto language: Spanish regional locales, English and unsupported languages',()=>{
  for(const locale of ['es','es-PE','es-ES','ES_mx'])assert.equal(I.resolve('auto',locale),'es');
  for(const locale of ['en','en-GB','fr-FR','de',''])assert.equal(I.resolve('auto',locale),'en');
  assert.equal(I.resolve('es','en-US'),'es');assert.equal(I.resolve('en','es-PE'),'en');assert.equal(I.resolve('invalid','es-PE'),'es');
});
test('Messages translate complete templates and preserve names, placeholders and technical errors',()=>{
  const i=I.create('en','es-PE'),title='Carpeta: {count} <b>Grupo</b>';
  assert.equal(i.text('Tema abierto: {title}',{title}),'Open topic: '+title);
  assert.equal(i.message('La cola está en pausa porque cambiaste de chat o cuenta. Vuelve a «'+title+'» y pulsa Reanudar.'),'The queue is paused because you changed chats or accounts. Return to “'+title+'” and click Resume.');
  assert.equal(i.message('No se pudo obtener el vídeo (HTTP 503).'),'Could not fetch the video (HTTP 503).');
  assert.equal(i.message('Telegram pide esperar 23 segundos. Puedes pausar o detener la cola.'),'Telegram requests a 23-second wait. You can pause or stop the queue.');
  assert.equal(i.message('Los archivos se conservaron, pero no se pudo guardar el resumen: No queda espacio disponible para guardar más archivos.'),'Your files were kept, but the summary could not be saved: There is no space left to save more files.');
  assert.equal(i.message('FILE_REFERENCE_EXPIRED'),'FILE_REFERENCE_EXPIRED');
  assert.equal(i.message('Mensaje externo de prueba'),'Mensaje externo de prueba');
  i.set('es');assert.equal(i.message('Vídeo guardado.'),'Vídeo guardado.');
});
test('Every static panel label and accessible attribute has an English translation',()=>{
  const dom=new JSDOM('<main>'+fs.readFileSync(path.join(base,'panel.html'),'utf8')+'</main>'),root=dom.window.document.querySelector('main');
  const allowed=new Set(['Telegram Downloader','English','Español','Web K','Web A','×','⚙','▷','☷','▤','▣','♡','↓','·']);
  const walker=dom.window.document.createTreeWalker(root,4);let node;
  while((node=walker.nextNode())){const value=node.nodeValue.trim();if(value&&!/^\d+$/.test(value)&&!allowed.has(value))assert.ok(Object.hasOwn(context.TGLocalEnglish,value),'Missing: '+value);}
  for(const element of root.querySelectorAll('[title],[aria-label],[placeholder]'))for(const attr of ['title','aria-label','placeholder']){const value=element.getAttribute(attr);if(value)assert.ok(Object.hasOwn(context.TGLocalEnglish,value),value);}
  dom.window.close();
});
test('Binding switches text and accessible labels without replacing controls or touching user content',()=>{
  const dom=new JSDOM('<main><label><input type="checkbox" checked>Vídeos</label><input placeholder="Buscar tema…"><b data-user-content>Respaldo</b></main>');
  const root=dom.window.document.querySelector('main'),check=root.querySelector('input'),i=I.create('en','en-US');let clicks=0;check.addEventListener('change',()=>clicks++);
  i.bind(root);assert.equal(root.querySelector('label').textContent,'Videos');assert.equal(root.querySelector('[placeholder]').placeholder,'Search topics…');assert.equal(root.querySelector('b').textContent,'Respaldo');
  i.set('es');assert.equal(root.querySelector('input'),check);assert.equal(check.checked,true);assert.equal(root.querySelector('label').textContent,'Vídeos');check.click();assert.equal(clicks,1);
  dom.window.close();
});
test('English browser gets four English sections and a working language selector',async t=>{
  const h=await setup(t,{browserLanguage:'en-US'});assert.equal(h.$('.mode-one').textContent.trim(),'▷Open video');assert.match(h.$('.mode-manual').textContent,/My queue/);assert.match(h.$('.mode-group').textContent,/Group \/ topic/);assert.match(h.$('.mode-backup').textContent,/Backup/);
  h.$('.settings-toggle').click();assert.equal(h.$('.language-settings').hidden,false);assert.equal(h.$('.settings-toggle').getAttribute('aria-expanded'),'true');
  assert.equal(h.$('#tg-language').value,'auto');assert.equal(h.$('.language-guide').href,'https://github.com/jhon-a65/telegram-downloader/blob/main/README.md');
  assert.match(h.$('.backup-start').textContent,/Choose folder/);assert.match(h.$('.backup-selected-summary').textContent,/topics/);
  assert.match(h.$('.support').textContent,/Support the creator/);assert.equal(h.$('.backup-topic-list span').textContent.includes('Clases de C')||h.$('.backup-topic-list').textContent.includes('Python'),true);
  language(h,'es');await tick(0);assert.equal(h.storage.tgLocalLanguage,'es');assert.match(h.$('.mode-backup').textContent,/Respaldo/);assert.match(h.$('.support').textContent,/Apoya al creador/);assert.match(h.$('.language-guide').href,/README.es.md$/);
  language(h,'auto');assert.match(h.$('.mode-backup').textContent,/Backup/);assert.deepEqual(h.errors,[]);
});
test('Saved language overrides browser language and persists after reopening',async t=>{
  const first=await setup(t,{browserLanguage:'es-PE'});language(first,'en');await tick(0);const storage=first.storage;await first.close();
  const h=await setup(t,{storage,browserLanguage:'es-PE'});assert.equal(h.$('#tg-language').value,'en');assert.match(h.$('.backup-message').textContent,/Choose what to keep/);
});
test('A slow preference read cannot overwrite a newer language choice',async t=>{
  let finish;const pending=new Promise(resolve=>finish=resolve);const h=await setup(t,{browserLanguage:'en-US',storage:{tgLocalLanguage:'es'},languageRead:pending});
  language(h,'en');finish();await tick(0);assert.equal(h.$('#tg-language').value,'en');assert.match(h.$('.mode-backup').textContent,/Backup/);assert.equal(h.storage.tgLocalLanguage,'en');
});
test('Switch languages during a backup: same selection, exact file bytes and no repeat downloads',async t=>{
  const h=await setup(t);h.choose([101]);let release;const held=new Promise(resolve=>release=resolve);h.onRead=async()=>held;
  try{
    h.start();await until(()=>h.calls.parts.length>0&&h.backup.busy);const filesBefore=h.calls.parts.length,pickers=h.calls.pickers;
    language(h,'en');await tick(0);assert.equal(h.backup.busy,true);assert.equal(h.calls.parts.length,filesBefore);assert.equal(h.calls.pickers,pickers);assert.equal(h.wasStopped,undefined);assert.equal(h.$('#backup-selected').checked,true);
    assert.equal(h.ui.querySelectorAll('.backup-topic-list input:checked').length,1);assert.match(h.$('.backup-folder').textContent,/^Folder: Respaldo_/);
  }finally{h.onRead=null;release();}
  await until(h.finished);assert.equal(h.backup.failed,0);assert.match(h.$('.backup-message').textContent,/Backup updated/);const originals=new Map(h.files()),paths=[...originals.keys()];
  language(h,'es');const requests=h.calls.parts.length;h.update();await until(h.finished);assert.equal(h.backup.saved,0);assert.equal(h.calls.parts.length,requests);assert.deepEqual([...h.files().keys()],paths);
  for(const [name,data]of originals)assert.deepEqual(h.files().get(name),data);assert.deepEqual(h.manifest().topics.map(t=>t.id),[101]);
});
test('Live notices, errors and photo tooltips switch languages without translating file names',async t=>{
  const h=await setup(t,{browserLanguage:'en-US'}),send=data=>h.w.document.dispatchEvent(new h.w.CustomEvent('tg-local:reply',{detail:JSON.stringify({channel:h.state.channel,...data})}));
  send({type:'progress',phase:'error',message:'No queda espacio disponible para guardar más archivos.',bytes:0});assert.match(h.$('.status-title').textContent,/no space left/);
  send({type:'photo-state',available:true,busy:false,width:1200,height:800,token:'sample'});assert.equal(h.$('.photo-save').title,'Save photo from browser (1200 × 800)');
  send({type:'photo-result',message:'Imagen enviada a las descargas del navegador.',error:false});assert.match(h.$('.photo-notice').textContent,/Photo sent/);
  language(h,'es');assert.match(h.$('.status-title').textContent,/No queda espacio/);assert.match(h.$('.photo-save').title,/Guardar imagen/);assert.match(h.$('.photo-notice').textContent,/Imagen enviada/);
});
