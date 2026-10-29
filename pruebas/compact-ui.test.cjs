/* Flujo compacto bilingüe: selección y descarga desde la pantalla principal. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {harness,until,tick,OFFSET}=require('./topic-fixture.cjs');
const {JSDOM}=require(process.env.TG_DOM_MODULES?path.join(process.env.TG_DOM_MODULES,'jsdom'):'jsdom');
function setup(t,options={}){
  const h=harness(t,{count:15,...options});
  h.w.document.addEventListener('tg-local:reply',event=>{const data=JSON.parse(event.detail);if(data.type==='manual-state')h.manual=data;});
  h.command=(type,data={})=>h.w.document.dispatchEvent(new h.w.CustomEvent('tg-local:command',{detail:JSON.stringify({channel:h.state.channel,type,...data})}));
  h.$('.mode-one').click();
  h.add=index=>{
    const message=h.messages.filter(row=>row.topic===101)[index].message,w=h.w,d=w.document;
    w.HTMLElement.prototype.getBoundingClientRect=()=>({left:20,top:20,right:900,bottom:700,width:880,height:680});
    if(!w.appMediaViewer){const whole=d.createElement('div');whole.className='media-viewer-whole active';d.body.append(whole);w.appMediaViewer={wholeDiv:whole,content:{}};}
    const viewer=w.appMediaViewer;
    if(viewer.content.mover){viewer.content.mover.classList.remove('center');viewer.content.mover.classList.add('moving');}
    const mover=d.createElement('div'),video=d.createElement('video');mover.className='media-viewer-mover center active';video.src='blob:https://web.telegram.org/test-'+message.id;mover.append(video);viewer.wholeDiv.append(mover);viewer.content.mover=mover;
    viewer.target={peerId:-123,mid:OFFSET+message.id,message:{...message,peerId:-123,mid:OFFSET+message.id}};
    h.command('manual-status');h.$('.quick-add').click();return message.media.document.id;
  };
  h.choose=value=>{h.$('#quick-count').value=String(value);h.$('#quick-count').dispatchEvent(new h.w.Event('change'));};
  h.finished=()=>h.manual&&!h.manual.busy&&['done','batch-done','error','stopped'].includes(h.manual.phase);
  return h;
}
const actual=h=>h.calls.parts.map(part=>part.id);

test('La pantalla principal selecciona y descarga solo la cola, en el orden elegido',async t=>{
  const h=setup(t);await tick(0);const selected=[h.add(5),h.add(1),h.add(7)];h.$('.quick-add').click();
  assert.equal(h.manual.pending,3);assert.equal(h.$('.manual-view').hidden,true);
  h.choose('all');h.$('.quick-start').click();await until(h.finished);
  assert.deepEqual(actual(h),selected);assert.equal(h.manual.saved,3);assert.equal(h.calls.pickers,1);
  assert.equal(h.calls.topics.length+h.calls.groups.length,0);assert.equal(h.$('.manual-view').hidden,true);
  assert.match(h.$('.quick-summary').textContent,/0 pendientes · 3 completados/);assert.deepEqual(h.errors,[]);
});

test('El botón principal respeta 10 y la siguiente tanda continúa desde el pendiente usando la misma carpeta',async t=>{
  const h=setup(t);await tick(0);const selected=Array.from({length:12},(_,i)=>h.add(i));
  h.$('.quick-start').click();await until(h.finished);
  assert.equal(h.manual.saved,10);assert.equal(h.manual.pending,2);assert.deepEqual(actual(h),selected.slice(0,10));
  assert.equal(h.$('.quick-start-label').textContent,'Siguiente tanda');assert.equal(h.$('.quick-folder').hidden,false);
  h.$('.quick-start').click();await until(h.finished);
  assert.equal(h.manual.saved,12);assert.deepEqual(actual(h),selected);assert.equal(h.calls.pickers,1);assert.equal(h.$('.quick-start').disabled,true);
});

test('Los dos selectores de tanda comparten valor y conservan la elección al reabrir',async t=>{
  const h=setup(t,{storage:{tgLocalManualOptions:{count:'60',parallelism:4}}});await tick(0);
  assert.equal(h.$('#quick-count').value,'60');assert.equal(h.$('#manual-count').value,'60');
  h.choose(20);assert.equal(h.$('#manual-count').value,'20');assert.equal(h.storage.tgLocalManualOptions.count,'20');
  h.$('#manual-count').value='all';h.$('#manual-count').dispatchEvent(new h.w.Event('change'));
  assert.equal(h.$('#quick-count').value,'all');const storage=h.storage;await h.close();
  const reopened=setup(t,{storage});await tick(0);assert.equal(reopened.$('#quick-count').value,'all');assert.equal(reopened.$('#manual-parallel').value,'4');
});

test('Detener desde el vídeo abierto conserva completados y reinicia el interrumpido sin saltos',async t=>{
  const h=setup(t);await tick(0);const selected=Array.from({length:12},(_,i)=>h.add(i));
  let release;const held=new Promise(resolve=>release=resolve);h.onRead=async()=>{if(h.calls.parts.length===3)await held;};
  h.$('.quick-start').click();await until(()=>h.calls.parts.length===3);
  assert.equal(h.$('.quick-start').disabled,true);assert.equal(h.$('#quick-count').disabled,true);assert.equal(h.$('.quick-stop').hidden,false);
  h.$('.quick-stop').click();await until(h.finished);assert.equal(h.manual.saved,2);assert.equal(h.manual.pending,10);
  release();h.onRead=null;h.$('.quick-start').click();await until(h.finished);
  assert.equal(h.manual.saved,12);assert.deepEqual(actual(h),[...selected.slice(0,3),...selected.slice(2)]);assert.equal(h.calls.pickers,1);
});

test('Pausar y reanudar la cola desde la pantalla principal mantiene la selección',async t=>{
  const h=setup(t);await tick(0);const selected=[h.add(0),h.add(2)];
  let release;const held=new Promise(resolve=>release=resolve);h.onRead=async()=>held;
  h.$('.quick-start').click();await until(()=>h.calls.parts.length===1);
  h.$('.quick-pause').click();await until(()=>h.manual.phase==='paused');assert.equal(h.$('.quick-resume').hidden,false);
  release();h.onRead=null;h.$('.quick-resume').click();await until(h.finished);
  assert.equal(h.manual.saved,2);assert.equal(h.manual.pending,0);assert.ok(actual(h).every(id=>selected.includes(id)));assert.equal(h.$('.manual-view').hidden,true);
});

test('La cola vacía no abre el selector y un fallo de almacenamiento se muestra en la pantalla principal',async t=>{
  const h=setup(t);await tick(0);assert.equal(h.$('.quick-start').disabled,true);h.$('.quick-start').click();assert.equal(h.calls.pickers,0);
  h.w.chrome.storage.local.set=async()=>{throw new Error('sin espacio');};h.add(0);await until(()=>/No se pudo guardar/.test(h.manual.message));
  assert.equal(h.$('.quick-message').hidden,false);assert.match(h.$('.quick-message').textContent,/No se pudo guardar/);
  h.$('.quick-start').click();await tick(0);assert.equal(h.calls.pickers,0);
});

test('Guardar usa exclusivamente el elemento en pantalla y se desactiva si la identidad es ambigua',t=>{
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://web.telegram.org/k/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,commands=[];let channel;
  t.after(()=>w.close());w.chrome={runtime:{sendMessage:async()=>{},onMessage:{addListener(){}}},storage:{local:{get:async()=>({}),set:async()=>{}}}};
  d.addEventListener('tg-local:command',event=>{const cmd=JSON.parse(event.detail);channel=cmd.channel;commands.push(cmd);});
  const base=path.resolve(__dirname,'..');for(const file of ['i18n.js','panel-styles.js','content.js'])w.eval(fs.readFileSync(path.join(base,file),'utf8'));
  const root=d.getElementById('tg-local-video-tools').shadowRoot,$=selector=>root.querySelector(selector);
  const reply=items=>d.dispatchEvent(new w.CustomEvent('tg-local:reply',{detail:JSON.stringify({channel,type:'state',picker:true,items})}));
  const a={id:'a',name:'Anterior.mp4',kind:'blob',visible:false,size:1024},b={id:'b',name:'Abierto.mp4',kind:'blob',visible:true,size:2048};
  reply([a,b]);$('.launch').click();assert.equal($('.current-name').textContent,b.name);$('#memory').checked=true;$('.current-save').click();
  let downloads=commands.filter(cmd=>cmd.type==='download');assert.equal(downloads.length,1);assert.equal(downloads[0].id,'b');assert.equal(downloads[0].memoryOnly,true);
  reply([{...a,visible:true},b]);assert.equal($('.current-save').disabled,true);$('.current-save').click();assert.equal(commands.filter(cmd=>cmd.type==='download').length,1);
  reply([{...a,visible:true},{...b,visible:false}]);$('.current-save').click();downloads=commands.filter(cmd=>cmd.type==='download');assert.equal(downloads.at(-1).id,'a');
  assert.equal($('.detected-videos').open,false);assert.equal($('.list').children.length,2);
});

test('English compact controls switch to Spanish during a queue download without changing the batch or files',async t=>{
  const h=setup(t,{browserLanguage:'en-US'});await tick(0);const selected=[h.add(1),h.add(4),h.add(0)];
  assert.equal(h.$('#tg-language').value,'auto');assert.equal(h.$('.current-label').textContent,'OPEN VIDEO');
  assert.equal(h.$('.quick-start-label').textContent,'Download queue');assert.equal(h.$('.quick-start-note').textContent,'Choose folder');
  assert.equal(h.$('.quick-add').textContent,'✓ Already queued');
  h.choose('all');
  let release;const held=new Promise(resolve=>release=resolve);h.onRead=async()=>held;
  try{
    h.$('.quick-start').click();await until(()=>h.calls.parts.length===1);
    const requests=h.calls.parts.length,pickers=h.calls.pickers,name=h.$('.current-name').textContent;
    const queueNames=h.manual.items.map(item=>item.name);
    h.$('#tg-language').value='es';h.$('#tg-language').dispatchEvent(new h.w.Event('change'));
    assert.equal(h.$('.current-name').textContent,name);
    await tick(0);
    assert.deepEqual(h.manual.items.map(item=>item.name),queueNames);
    assert.equal(h.$('.quick-start-label').textContent,'Siguiente tanda');assert.equal(h.$('.quick-pause').textContent,'Pausar');
    assert.equal(h.$('#quick-count').value,'all');assert.equal(h.$('#manual-count').value,'all');
    assert.equal(h.calls.parts.length,requests);assert.equal(h.calls.pickers,pickers);assert.equal(h.manual.busy,true);
  }finally{h.onRead=null;release();}
  await until(h.finished);assert.deepEqual(actual(h),selected);assert.equal(h.manual.saved,3);
  const files=new Map(h.root.children.get('Telegram_10_Cola').videoFiles);assert.equal(files.size,3);
  for(const bytes of files.values())assert.deepEqual(Buffer.from(bytes),Buffer.from(h.fixture));
  h.$('#tg-language').value='en';h.$('#tg-language').dispatchEvent(new h.w.Event('change'));
  assert.equal(h.$('.quick-summary').textContent,'0 pending · 3 completed');assert.equal(h.$('.manual-view').hidden,true);
  assert.deepEqual(actual(h),selected);assert.deepEqual(h.errors,[]);
});

test('An unsupported browser language starts the compact panel in English and saves a manual Spanish choice',async t=>{
  const first=setup(t,{browserLanguage:'fr-FR'});await tick(0);
  assert.equal(first.$('#tg-language').value,'auto');assert.equal(first.$('.quick-start-label').textContent,'Download queue');
  first.$('#tg-language').value='es';first.$('#tg-language').dispatchEvent(new first.w.Event('change'));await tick(0);
  assert.equal(first.storage.tgLocalLanguage,'es');const storage=first.storage;await first.close();
  const reopened=setup(t,{storage,browserLanguage:'en-US'});await tick(0);assert.equal(reopened.$('.quick-start-label').textContent,'Descargar cola');
  reopened.$('#tg-language').value='auto';reopened.$('#tg-language').dispatchEvent(new reopened.w.Event('change'));
  assert.equal(reopened.$('.quick-start-label').textContent,'Download queue');
});
