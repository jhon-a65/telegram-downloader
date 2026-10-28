const test=require('node:test'),assert=require('node:assert/strict');
const {setup,until,tick,OFFSET}=require('./backup-fixture.cjs');

test('Un botón respalda todos los temas y General en carpetas separadas, con los bytes originales',async t=>{
  const h=await setup(t);h.start();await until(h.finished);
  assert.equal(h.backup.phase,'done');assert.equal(h.backup.saved,h.messages.length);assert.equal(h.manifest().topics.length,3);
  for(const topic of h.manifest().topics){const dir=h.directory().children.get(topic.folder);assert.ok(dir.children.has('Vídeos'));assert.ok(dir.children.has('Mensajes'));}
  for(const data of h.files().values())assert.deepEqual(data,h.fixture);
  assert.ok(h.historyCalls.some(x=>!x.threadId));assert.deepEqual(new Set(h.historyCalls.filter(x=>x.threadId).map(x=>x.threadId)),new Set([OFFSET+101,OFFSET+202]));
  assert.equal(h.forumCalls.length,6,'Actualiza los temas al iniciar y consulta después de las páginas cortas.');assert.deepEqual(h.errors,[]);
});
test('La selección de temas nunca descarga archivos de los temas no elegidos',async t=>{
  const h=await setup(t);h.choose([202]);h.start();await until(h.finished);
  assert.deepEqual(h.manifest().topics.map(t=>t.id),[202]);assert.ok(h.records().every(x=>x.topicId===202));assert.ok(h.historyCalls.every(x=>x.threadId===OFFSET+202));
});
test('Seleccionar General usa el historial general y filtra los mensajes de otros temas',async t=>{
  const h=await setup(t);h.choose([1]);h.start();await until(h.finished);
  assert.ok(h.historyCalls.every(x=>x.threadId===undefined));assert.equal(h.backup.saved,h.messages.filter(x=>x.topic===1).length);assert.ok(h.records().every(x=>x.topicId===1));
});
test('Fotos, audios y documentos se guardan por tipo, sin mezclar las imágenes individuales en memoria',async t=>{
  const h=await setup(t);const photo=h.addFile(101,'photos',Buffer.from([255,216,255,0,255,217]));const audio=h.addFile(101,'audio');const doc=h.addFile(202,'documents');
  for(const name of ['photos','audio','documents'])h.$('#backup-'+name).checked=true;
  const contents=new Map([[audio.id,audio.data],[doc.id,doc.data]]);h.onRead=({id,offset,limit})=>contents.has(id)?{bytes:new Uint8Array(contents.get(id).subarray(offset,offset+limit))}:undefined;
  h.start();await until(h.finished);assert.equal(h.backup.failed,0);assert.equal(h.backup.saved,h.messages.length);assert.equal(h.photoReads.length,1);
  const files=h.files();assert.ok([...files].some(([p,data])=>p.includes('/Imágenes/')&&data.equals(photo.data)));assert.ok([...files.keys()].some(p=>p.includes('/Audios/')));assert.ok([...files.keys()].some(p=>p.includes('/Documentos/')));
  assert.equal(h.directory().files.get('Telegram-respaldo.json').toString().includes('secret-not-exported'),false);
});
test('Mensajes sin archivos: guarda texto y JSON, ordenados, y no solicita bytes de medios',async t=>{
  const h=await setup(t);h.$('#backup-videos').checked=false;h.start();await until(h.finished);
  assert.equal(h.backup.saved,0);assert.equal(h.backup.messageCount,h.messages.length);assert.equal(h.calls.parts.length,0);
  for(const topic of h.manifest().topics){const messages=h.directory().children.get(topic.folder).children.get('Mensajes');assert.ok([...messages.files.keys()].some(x=>x.endsWith('.txt')));for(const[name,data]of messages.files)if(name.endsWith('.json')){const rows=JSON.parse(data).messages;assert.deepEqual(rows.map(x=>x.date),rows.map(x=>x.date).sort((a,b)=>a-b));}}
});
test('Actualizar conserva los existentes y descarga únicamente el archivo nuevo',async t=>{
  const h=await setup(t);h.start();await until(h.finished);const before=h.calls.parts.length,paths=[...h.files().keys()];
  const added=h.addFile(202,'videos');h.onRead=({id})=>id===added.id?{bytes:new Uint8Array(added.data)}:undefined;
  h.update();await until(h.finished);assert.equal(h.backup.saved,1);assert.equal(h.backup.skipped,before);assert.equal(h.calls.parts.length,before+1);
  for(const path of paths)assert.ok(h.files().has(path));assert.equal(new Set(h.records().map(x=>x.topicId+'/'+x.name)).size,h.records().length);
});
test('Renombrar el grupo y un tema mantiene las mismas carpetas y no repite descargas',async t=>{
  const h=await setup(t);h.start();await until(h.finished);const original=h.directory(),folders=h.manifest().topics.map(t=>t.folder),before=h.calls.parts.length;
  h.title='Grupo renombrado';h.titles.set(101,'Tema renombrado');await h.load();h.update();await until(h.finished);
  assert.equal(h.directory(),original);assert.deepEqual(h.manifest().topics.map(t=>t.folder),folders);assert.equal(h.calls.parts.length,before);assert.equal(h.manifest().topics.find(t=>t.id===101).title,'Tema renombrado');
});
test('Cerrar y volver a elegir la carpeta padre encuentra el respaldo aunque el grupo cambie de nombre',async t=>{
  const first=await setup(t);first.start();await until(first.finished);const root=first.root,storage=first.storage;await first.close();
  const h=await setup(t,{root,storage});h.title='Otro título del mismo grupo';await h.load();h.start();await until(h.finished);
  assert.equal(h.backup.saved,0);assert.equal(h.backup.skipped,h.messages.length);assert.equal(root.children.size,1);assert.equal(h.calls.parts.length,0);
});
test('Detener durante una descarga conserva los completos y vuelve a intentar exactamente el archivo pendiente',async t=>{
  const h=await setup(t);let release;h.onRead=async()=>{if(h.calls.parts.length===3)await new Promise(resolve=>release=resolve);};
  h.start();await until(()=>release);h.$('.backup-stop').click();await until(h.finished);
  assert.equal(h.records().filter(x=>x.status==='complete').length,2);const completed=h.records().filter(x=>x.status==='complete').map(x=>x.name);
  release();h.onRead=null;h.update();await until(h.finished);assert.equal(h.backup.skipped,2);assert.equal(h.backup.saved,h.messages.length-2);for(const name of completed)assert.ok(h.records().some(x=>x.name===name&&x.status==='complete'));
});
test('Un archivo borrado o de tamaño incorrecto se recupera al actualizar la copia',async t=>{
  const h=await setup(t);h.start();await until(h.finished);const first=h.records()[0],topic=h.manifest().topics.find(t=>t.id===first.topicId),dir=h.directory().children.get(topic.folder).children.get(first.subfolder);
  dir.files.delete(first.name);const before=h.calls.parts.length;h.update();await until(h.finished);assert.equal(h.calls.parts.length,before+1);assert.equal(h.backup.saved,1);assert.equal(dir.files.get(first.name).length,first.size);
  dir.files.set(first.name,Buffer.from('incorrecto'));h.update();await until(h.finished);assert.equal(h.backup.saved,1);assert.equal(dir.files.get(first.name).length,first.size);
});
test('Eliminar un mensaje de Telegram no elimina su archivo ni su texto de la copia',async t=>{
  const h=await setup(t);h.start();await until(h.finished);const count=h.records().length,paths=[...h.files().keys()];h.messages=h.messages.slice(3);h.update();await until(h.finished);
  assert.equal(h.records().length,count);assert.deepEqual([...h.files().keys()],paths);
});
test('Un rango de fechas filtra mensajes y archivos sin alterar los que ya se habían guardado',async t=>{
  const h=await setup(t);const chosen=h.messages[0];chosen.message.date=Date.parse('2026-10-15T12:00:00Z')/1000;
  h.$('#backup-from').value='2026-10-15';h.$('#backup-to').value='2026-10-15';h.start();await until(h.finished);assert.equal(h.backup.saved,1);assert.equal(h.backup.messageCount,1);
});
test('Un registro de otro grupo se rechaza sin sobrescribirlo ni descargar archivos',async t=>{
  const h=await setup(t);h.start();await until(h.finished);const dir=h.directory(),data=h.manifest();data.peerId=-999;dir.files.set('Telegram-respaldo.json',Buffer.from(JSON.stringify(data)));const before=h.calls.parts.length;
  h.root=dir;h.start();await until(()=>!h.backup.busy&&/otro grupo/.test(h.backup.message));assert.equal(h.calls.parts.length,before);assert.equal(JSON.parse(dir.files.get('Telegram-respaldo.json')).peerId,-999);
});
test('Un registro corrupto no se sustituye por uno vacío',async t=>{
  const h=await setup(t);h.start();await until(h.finished);const dir=h.directory();dir.files.set('Telegram-respaldo.json',Buffer.from('{corrupto'));h.root=dir;h.start();await until(()=>!h.backup.busy&&/JSON|position|property|Unexpected/.test(h.backup.message));assert.equal(dir.files.get('Telegram-respaldo.json').toString(),'{corrupto');
});
test('La paginación repetida de temas no se presenta como una copia completa',async t=>{
  const h=await setup(t,{autoLoad:false});h.repeatTopics=true;await h.load();assert.equal(h.backup.topicsReady,false);assert.match(h.backup.message,/dejó de avanzar/);assert.equal(h.calls.pickers,0);
});
test('La paginación repetida del historial conserva el registro y termina con error',async t=>{
  const h=await setup(t);h.repeatHistory=true;h.start();await until(h.finished);assert.equal(h.backup.phase,'error');assert.match(h.backup.message,/dejó de avanzar/);assert.equal(h.calls.parts.length,0);
});
test('Un mensaje de otro grupo detiene el respaldo antes de descargar',async t=>{
  const h=await setup(t);h.foreignHistory=true;h.start();await until(h.finished);assert.equal(h.backup.phase,'error');assert.match(h.backup.message,/otro grupo/);assert.equal(h.calls.parts.length,0);
});
test('Cambiar de grupo durante el selector evita crear carpetas',async t=>{
  const h=await setup(t);let release;h.w.showDirectoryPicker=()=>new Promise(resolve=>release=resolve);h.start();h.w.appImManager.chat.peerId=-999;release(h.root);
  await until(()=>!h.backup.busy);assert.match(h.backup.message,/Cambiaste/);assert.equal(h.root.children.size,0);
});
test('Cambiar de cuenta durante una parte pausa antes de escribir y requiere la cuenta original',async t=>{
  const h=await setup(t);let release;h.onRead=()=>new Promise(resolve=>release=resolve);h.start();await until(()=>release);h.w.rootScope.myId=99;release();await until(()=>h.backup.phase==='paused');
  assert.equal(h.records().filter(x=>x.status==='complete').length,0);h.$('.backup-resume').click();assert.equal(h.backup.phase,'paused');h.w.rootScope.myId=10;h.onRead=null;h.$('.backup-resume').click();await until(h.finished);assert.equal(h.backup.saved,h.messages.length);
});
test('El respaldo excluye otros trabajos mientras permite seguir añadiendo a Mi cola',async t=>{
  const h=await setup(t);let release;h.onRead=()=>new Promise(resolve=>release=resolve);h.start();await until(()=>release);
  h.$('.mode-group').click();assert.equal(h.$('.bulk-start').disabled,true);h.command('bulk-start',{mode:'topic',expectedScope:h.state.availableScope,limits:{maxFiles:10,maxBytes:null}});assert.equal(h.calls.pickers,1);
  h.$('.backup-stop').click();release();await until(h.finished);
});
test('Los clientes con la API antigua de temas usan el método compatible',async t=>{
  const h=await setup(t,{autoLoad:false});h.oldTopics=true;await h.load();assert.equal(h.backup.topicsReady,true);assert.ok(h.forumCalls.some(c=>c.method==='channels.getForumTopics'));h.start();await until(h.finished);assert.equal(h.backup.saved,h.messages.length);
});
test('Temas con nombres iguales o inválidos tienen rutas diferentes y seguras',async t=>{
  const h=await setup(t);h.titles.set(101,'CON / ..');h.titles.set(202,'CON / ..');await h.load();h.start();await until(h.finished);const names=h.manifest().topics.map(x=>x.folder);
  assert.equal(new Set(names).size,3);assert.ok(names.every(n=>!/[\\/:*?"<>|]/.test(n)));
});
test('Una página de mensajes vacíos no oculta el historial más antiguo del tema',async t=>{
  const h=await setup(t);h.choose([101]);const manager=h.w.appImManager.managers.appMessagesManager,original=manager.requestHistory;let empty=true;
  manager.requestHistory=async args=>{if(empty&&args.threadId===OFFSET+101&&!args.offsetId){empty=false;return {_: 'messages.channelMessages',messages:[{_: 'messageEmpty',id:3000000}]};}return original(args);};
  h.start();await until(h.finished);assert.equal(h.backup.phase,'done');assert.equal(h.backup.saved,h.messages.filter(row=>row.topic===101).length);
});
test('Una página de temas eliminados no se confunde con el final de la lista',async t=>{
  const h=await setup(t,{autoLoad:false});h.w.appImManager.managers.apiManager.invokeApi=async()=>({_: 'messages.forumTopics',topics:[{_: 'forumTopicDeleted',id:101}],messages:[]});
  await h.load();assert.equal(h.backup.topicsReady,false);assert.match(h.backup.message,/lista de temas cambió/);assert.equal(h.calls.pickers,0);
});
