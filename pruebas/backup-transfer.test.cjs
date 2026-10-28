const test=require('node:test'),assert=require('node:assert/strict');
const {setup,until,tick}=require('./backup-fixture.cjs');
const P=512*1024;
test('Respaldo intensivo: partes concurrentes, orden exacto y renovación única de referencias caducadas',async t=>{
  const h=await setup(t);h.choose([101]);h.messages=h.messages.filter(x=>x.topic!==101);
  const bytes=Buffer.alloc(P*20+19);for(let n=0;n<bytes.length;n++)bytes[n]=n%251;
  const row=h.addFile(101,'videos',bytes);h.$('#backup-parallel').value='16';let active=0,maximum=0,renewed=false,reloads=0;
  h.w.appImManager.managers.appMessagesManager.reloadMessage=async()=>{reloads++;await tick(12);renewed=true;return row.message;};
  h.onRead=async({id,offset,limit})=>{assert.equal(id,row.id);active++;maximum=Math.max(active,maximum);try{await tick(offset===0?12:1);if(!renewed)throw {type:'FILE_REFERENCE_EXPIRED'};return {bytes:new Uint8Array(bytes.subarray(offset,offset+limit))};}finally{active--;}};
  h.start();await until(h.finished);assert.equal(h.backup.failed,0);assert.equal(h.backup.saved,1);assert.equal(maximum,16);assert.equal(reloads,1);assert.deepEqual([...h.files().values()][0],bytes);
});
test('Un error de escritura no confirma el archivo ni continúa solicitando los siguientes',async t=>{
  const h=await setup(t);h.choose([101]);const root=h.root,get=root.getDirectoryHandle.bind(root);
  function poison(dir){const old=dir.getDirectoryHandle.bind(dir);dir.getDirectoryHandle=async(name,args)=>{
    const child=await old(name,args);if(name==='Vídeos'){
      const file=child.getFileHandle.bind(child);child.getFileHandle=async(...args)=>{const handle=await file(...args);handle.createWritable=async()=>({write:async()=>{throw new DOMException('Disco lleno','QuotaExceededError');},abort:async()=>{},close:async()=>{}});return handle;};
    }else poison(child);return child;};}
  root.getDirectoryHandle=async(...args)=>{const dir=await get(...args);poison(dir);return dir;};
  h.start();await until(h.finished);assert.equal(h.backup.phase,'error');assert.match(h.backup.message,/espacio/);assert.equal(h.records().filter(x=>x.status==='complete').length,0);assert.equal(h.calls.parts.length,1);
});
test('Permiso de escritura revocado: conserva los registros y permite reabrir la copia',async t=>{
  const h=await setup(t);h.start();await until(h.finished);const dir=h.directory(),before=dir.files.get('Telegram-respaldo.json');dir.denied=true;h.update();await until(()=>!h.backup.busy&&/permiso|Sin permiso/.test(h.backup.message));assert.deepEqual(dir.files.get('Telegram-respaldo.json'),before);
  dir.denied=false;h.update();await until(h.finished);assert.equal(h.backup.saved,0);
});
test('Un adjunto no compatible aparece como aviso y no como respaldo íntegro',async t=>{
  const h=await setup(t);h.messages[0].message.media={_:'messageMediaUnsupported'};h.start();await until(h.finished);assert.equal(h.backup.unsupported,1);const report=JSON.parse(h.directory().files.get('Ultimo-resumen.json'));assert.equal(report.complete,false);assert.ok(report.notes.length);assert.match(h.backup.message,/avisos/);
});
test('Una ruta manipulada en el registro se rechaza antes de escribir fuera de las carpetas esperadas',async t=>{
  const h=await setup(t);h.start();await until(h.finished);const dir=h.directory(),data=h.manifest();data.files[0].name='../fuera.mp4';const changed=Buffer.from(JSON.stringify(data));dir.files.set('Telegram-respaldo.json',changed);h.update();await until(()=>!h.backup.busy&&/registro de archivos/.test(h.backup.message));assert.deepEqual(dir.files.get('Telegram-respaldo.json'),changed);
});
