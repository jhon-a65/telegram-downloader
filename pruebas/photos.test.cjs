/* Imagen abierta: interfaz real y bytes originales; Telegram y disco de navegador simulados. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require(process.env.TG_DOM_MODULES?path.join(process.env.TG_DOM_MODULES,'jsdom'):'jsdom');
const base=path.resolve(__dirname,'..');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const JPEG=Buffer.from([255,216,255,224,0,8,74,70,73,70,0,255,217]);
const tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let n=0;n<600;n++){if(fn())return;await tick(5);}throw new Error('No llegó la respuesta de imagen.');}
function setup(t,variant='k'){
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM('<!doctype html><html><body><main></main></body></html>',{url:`https://web.telegram.org/${variant}/`,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window,d=w.document,objects=new Map(),states=[],results=[],saved=[],requests=[],observers=[];
  let serial=0;
  const NativeObserver=w.MutationObserver;w.MutationObserver=class extends NativeObserver{constructor(cb){super(cb);observers.push(this);}};
  w.Blob=Blob;w.AbortController=AbortController;w.AbortSignal=AbortSignal;
  w.URL.createObjectURL=blob=>{const url='blob:https://web.telegram.org/photo-'+(++serial);objects.set(url,blob);return url;};
  w.URL.revokeObjectURL=url=>objects.delete(url);
  w.performance.getEntriesByType=()=>[];
  w.HTMLElement.prototype.getBoundingClientRect=()=>({left:40,top:40,right:1040,bottom:740,width:1000,height:700});
  w.chrome={runtime:{onMessage:{addListener(){}},sendMessage:async()=>{}},storage:{local:{get:async()=>({}),set:async()=>{}}}};
  const h={w,d,dom,objects,states,results,saved,requests,errors,beforeResponse:null,customResponse:null};
  w.fetch=async(url,options)=>{
    requests.push({url,options});if(h.beforeResponse)await h.beforeResponse();
    options.signal.throwIfAborted();
    if(h.customResponse)return h.customResponse();
    if(!objects.has(url))throw new TypeError('URL caducada');
    return new Response(objects.get(url));
  };
  w.HTMLAnchorElement.prototype.click=function(){const blob=objects.get(this.href);assert.ok(blob);saved.push({name:this.download,blob});};
  d.addEventListener('tg-local:reply',event=>{const data=JSON.parse(event.detail);if(data.type==='photo-state')states.push(data);if(data.type==='photo-result')results.push(data);});
  const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
  for(const file of manifest.content_scripts.flatMap(entry=>entry.js))w.eval(fs.readFileSync(file==='photo-page.js'&&process.env.TG_PHOTO_SCRIPT?path.resolve(process.env.TG_PHOTO_SCRIPT):path.join(base,file),'utf8'));
  h.ui=d.getElementById('tg-local-video-tools').shadowRoot;h.$=s=>h.ui.querySelector(s);h.$('.launch').click();
  h.state=()=>states.at(-1);
  h.command=(type,fields={})=>d.dispatchEvent(new w.CustomEvent('tg-local:command',{detail:JSON.stringify({channel:h.state().channel,type,...fields})}));
  h.scan=()=>h.command('photo-status');
  h.image=(parent,bytes=PNG,{width=1280,height=720,className='',complete=true,url}={})=>{
    const img=d.createElement('img');img.className=className;img.src=url||w.URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    Object.defineProperties(img,{naturalWidth:{value:width,configurable:true},naturalHeight:{value:height,configurable:true},complete:{value:complete,configurable:true}});parent.append(img);return img;
  };
  h.open=(bytes=PNG,opts={})=>{
    let viewer=d.querySelector(variant==='k'?'.media-viewer-whole':'#MediaViewer');
    if(!viewer){viewer=d.createElement(variant==='k'?'div':'dialog');if(variant==='k')viewer.className='media-viewer-whole active';else{viewer.id='MediaViewer';viewer.open=true;}d.body.append(viewer);}
    const old=viewer.querySelector('.media-viewer-mover.center, .MediaViewerSlide--active');if(old){old.classList.remove('center','MediaViewerSlide--active');old.classList.add('moving');}
    const slide=d.createElement('div');slide.className=variant==='k'?'media-viewer-mover center active':'MediaViewerSlide MediaViewerSlide--active';viewer.append(slide);
    const image=h.image(slide,bytes,opts);
    if(variant==='k')w.appMediaViewer={wholeDiv:viewer,content:{mover:slide},target:{mid:100+serial,message:{media:{photo:{id:String(7000+serial),sizes:[{w:opts.width||1280,h:opts.height||720}]}}}}};
    h.scan();return {viewer,slide,image};
  };
  h.save=async()=>{const count=results.length;h.$('.photo-save').click();await until(()=>results.length>count&&!h.state().busy);return results.at(-1);};
  t.after(()=>{for(const o of observers)o.disconnect();w.close();});return h;
}
for(const variant of ['k','a'])test(`Web ${variant.toUpperCase()}: guarda solo la imagen abierta, con bytes idénticos y nombre de imagen`,async t=>{
  const h=setup(t,variant);h.image(h.d.querySelector('main'),JPEG);h.open();
  assert.equal(h.state().available,true);const result=await h.save();assert.equal(result.error,false);
  assert.equal(h.saved.length,1);assert.deepEqual(Buffer.from(await h.saved[0].blob.arrayBuffer()),PNG);assert.match(h.saved[0].name,/\.png$/);assert.doesNotMatch(h.saved[0].name,/\.mp4/);
  assert.equal(h.requests.length,1);assert.deepEqual(h.errors,[]);
});
test('El botón es pequeño, está en el pie, y no añade bloques ni activa ninguna descarga al instalar',t=>{
  const h=setup(t);const button=h.$('.photo-save');assert.ok(button.closest('.footer'));assert.equal(button.textContent,'↓ Imagen');assert.equal(button.disabled,false);assert.equal(button.classList.contains('unavailable'),true);
  assert.equal(h.$('.photo-notice').hidden,true);assert.equal(h.requests.length,0);assert.equal(h.saved.length,0);assert.match(h.ui.querySelector('style').textContent,/\.photo-save\{[^}]*font-size:10px/);
});
test('Navegar entre fotos ignora la anterior, las miniaturas y la galería del chat',async t=>{
  const h=setup(t);h.image(h.d.querySelector('main'),PNG);h.open(JPEG);const chosen=h.open(PNG);
  h.image(chosen.viewer,JPEG,{width:2000,height:2000});h.scan();await h.save();assert.deepEqual(Buffer.from(await h.saved[0].blob.arrayBuffer()),PNG);
});
test('Un vídeo abierto no ofrece guardar su póster como si fuera una foto',t=>{
  const h=setup(t),{slide}=h.open();slide.append(h.d.createElement('video'));h.scan();assert.equal(h.state().available,false);assert.equal(h.$('.photo-save').classList.contains('unavailable'),true);
});
test('La identidad nativa de un vídeo también bloquea un póster antes de crear el reproductor',t=>{
  const h=setup(t);h.open();h.w.appMediaViewer.target.message.media={document:{id:'700',mime_type:'video/mp4'}};h.scan();assert.equal(h.state().available,false);
});
test('Cerrar u ocultar el visor elimina inmediatamente la imagen candidata',t=>{
  const h=setup(t),{viewer}=h.open();viewer.classList.remove('active');h.scan();assert.equal(h.state().available,false);
  viewer.classList.add('active');viewer.style.opacity='0';h.scan();assert.equal(h.state().available,false);
});
test('Una foto a medio cargar o solo su vista previa no se ofrece como completa',t=>{
  const h=setup(t),{image}=h.open();Object.defineProperty(image,'complete',{value:false,configurable:true});h.scan();assert.equal(h.state().available,false);
  Object.defineProperties(image,{complete:{value:true,configurable:true},naturalWidth:{value:40,configurable:true},naturalHeight:{value:40,configurable:true}});h.scan();assert.equal(h.state().available,false);
});
test('Web A prefiere full-media y nunca una diapositiva adyacente o un avatar',async t=>{
  const h=setup(t,'a'),{slide}=h.open(JPEG,{className:'thumbnail'});h.image(slide,PNG,{className:'full-media'});
  const avatar=h.d.createElement('div');avatar.className='Avatar';slide.append(avatar);h.image(avatar,JPEG,{width:3000,height:3000});h.scan();await h.save();assert.deepEqual(Buffer.from(await h.saved[0].blob.arrayBuffer()),PNG);
});
test('Cambiar src no reutiliza el currentSrc anterior; el nombre conserva el formato real',async t=>{
  const h=setup(t),{image}=h.open();const old=image.src;
  image.src=h.w.URL.createObjectURL(new Blob([JPEG],{type:'image/jpeg'}));Object.defineProperty(image,'currentSrc',{value:old});h.scan();await h.save();
  assert.deepEqual(Buffer.from(await h.saved[0].blob.arrayBuffer()),JPEG);assert.match(h.saved[0].name,/\.jpg$/);
});
test('Un clic con la referencia antigua se rechaza sin descargar otra imagen por error',async t=>{
  const h=setup(t);h.open();const token=h.state().token;h.open(JPEG);h.command('photo-save',{token});await tick(0);
  assert.equal(h.requests.length,0);assert.equal(h.saved.length,0);assert.match(h.results.at(-1).message,/Cambió/);
});
test('La foto elegida queda fijada al pulsar, aunque se navegue durante la lectura',async t=>{
  const h=setup(t);h.open();let release;const held=new Promise(resolve=>release=resolve);h.beforeResponse=()=>held;
  h.$('.photo-save').click();assert.equal(h.$('.photo-save').disabled,true);h.open(JPEG);release();await until(()=>h.saved.length===1&&!h.state().busy);
  assert.deepEqual(Buffer.from(await h.saved[0].blob.arrayBuffer()),PNG);
});
test('HTML disfrazado de imagen se rechaza y se muestra un aviso pequeño',async t=>{
  const h=setup(t);h.open();h.customResponse=()=>new Response('<html>Error</html>',{headers:{'Content-Type':'image/png'}});
  const result=await h.save();assert.equal(result.error,true);assert.equal(h.saved.length,0);assert.equal(h.$('.photo-notice').hidden,false);assert.match(h.$('.photo-notice').textContent,/no es una imagen/);
});
test('Una URL caducada, una respuesta incompleta o demasiado grande no se guarda',async t=>{
  const h=setup(t),{image}=h.open();h.objects.delete(image.src);assert.equal((await h.save()).error,true);
  h.customResponse=()=>new Response(PNG,{headers:{'Content-Length':String(PNG.length+1)}});assert.equal((await h.save()).error,true);
  h.customResponse=()=>new Response(PNG,{headers:{'Content-Length':String(65*1024*1024)}});assert.equal((await h.save()).error,true);assert.equal(h.saved.length,0);
});
test('Rechaza URLs ajenas, datos incrustados inválidos y órdenes de otra instancia del panel',async t=>{
  const h=setup(t),{image}=h.open();const token=h.state().token;h.command('photo-save',{token,channel:'f'.repeat(32)});await tick(0);assert.equal(h.requests.length,0);
  for(const src of ['https://example.com/picture.png','data:image/png;base64,AAAA']){image.src=src;h.scan();assert.equal(h.state().available,false);}assert.equal(h.saved.length,0);
});
test('Los nombres de imágenes diferentes siguen siendo distintos al cerrar y abrir el navegador',async t=>{
  const first=setup(t,'a');first.open();await first.save();const second=setup(t,'a');second.open();await second.save();assert.notEqual(first.saved[0].name,second.saved[0].name);
});
test('Guardar una imagen no cancela, pausa, registra ni añade nada a una cola de vídeos activa',async t=>{
  const h=setup(t);h.open();h.w.TGLocalBulk={isBusy:()=>true};h.w.TGLocalManual={isBusy:()=>true};
  await h.save();assert.equal(h.saved.length,1);assert.equal(h.w.TGLocalBulk.isBusy(),true);assert.equal(h.w.TGLocalManual.isBusy(),true);
  assert.equal(h.ui.querySelectorAll('.manual-row').length,0);
});
test('La imagen se guarda desde blob: sin invocar ningún recurso de red de Telegram',async t=>{
  const h=setup(t);h.open();await h.save();
  assert.equal(h.saved.length,1);assert.equal(h.requests.length,1);
  assert.ok(h.requests.every(request=>new URL(request.url).protocol==='blob:'));
  assert.deepEqual(Buffer.from(await h.saved[0].blob.arrayBuffer()),PNG);
});
for(const variant of ['k','a'])test(`Web ${variant.toUpperCase()}: una imagen HTTPS ya visible se bloquea sin pedirla a la red`,async t=>{
  const h=setup(t,variant),{image}=h.open();image.src='https://web.telegram.org/photo/original.png';h.scan();
  assert.equal(image.complete,true);assert.equal(h.state().available,false);assert.equal(h.$('.photo-save').classList.contains('unavailable'),true);
  h.command('photo-save',{token:h.state().token});await tick(0);
  assert.equal(h.requests.length,0);assert.equal(h.saved.length,0);assert.match(h.results.at(-1).message,/archivo local/);
});
test('Perder el blob de memoria no intenta recuperarlo de Telegram por HTTP',async t=>{
  const h=setup(t),{image}=h.open();h.objects.delete(image.src);const result=await h.save();
  assert.equal(result.error,true);assert.equal(h.saved.length,0);assert.equal(h.requests.length,1);
  assert.ok(h.requests.every(request=>request.url.startsWith('blob:')));
});
test('srcset y picture tampoco permiten recurrir a una imagen HTTPS',async t=>{
  const h=setup(t),{slide,image}=h.open();image.srcset='https://web.telegram.org/photo/imagen.png 1x';
  Object.defineProperty(image,'currentSrc',{value:'https://web.telegram.org/photo/imagen.png'});h.scan();assert.equal(h.state().available,false);
  const picture=h.d.createElement('picture');slide.append(picture);picture.append(image);h.scan();assert.equal(h.state().available,false);
  assert.equal(h.requests.length,0);assert.equal(h.saved.length,0);
});
test('Regresión: la foto local visible se puede guardar aunque no tenga la resolución máxima de Telegram',async t=>{
  const h=setup(t);h.open(PNG,{width:800,height:450});
  h.w.appMediaViewer.target.message.media.photo.sizes.push({w:2560,h:1440});h.scan();
  assert.equal(h.state().available,true);assert.equal(h.$('.photo-save').disabled,false);
  await h.save();assert.deepEqual(Buffer.from(await h.saved[0].blob.arrayBuffer()),PNG);assert.ok(h.requests.every(r=>r.url.startsWith('blob:')));
});
test('El mover nativo activo funciona sin depender de que tenga la clase center',async t=>{
  const h=setup(t),{slide}=h.open();slide.classList.remove('center');h.scan();assert.equal(h.state().available,true);
  slide.classList.add('moving');h.scan();assert.equal(h.state().available,false);
  slide.classList.remove('moving');h.scan();await h.save();assert.equal(h.saved.length,1);
});
test('Contenedores sin caja propia no ocultan una imagen visible de un visor abierto',async t=>{
  const h=setup(t),{viewer,slide}=h.open();
  for(const node of [viewer,slide])node.getBoundingClientRect=()=>({left:0,top:0,right:0,bottom:0,width:0,height:0});
  h.scan();assert.equal(h.state().available,true);await h.save();assert.equal(h.saved.length,1);
});
test('Una imagen picture cargada con src blob no depende de un currentSrc vacío',async t=>{
  const h=setup(t),{slide,image}=h.open();const picture=h.d.createElement('picture');slide.append(picture);picture.append(image);
  Object.defineProperty(image,'currentSrc',{value:''});h.scan();assert.equal(h.state().available,true);await h.save();assert.equal(h.saved.length,1);
});
test('Un visor nativo de otra ventana no invalida el visor de imagen que está abierto',async t=>{
  const h=setup(t);h.open();h.w.appMediaViewer={wholeDiv:h.d.createElement('div'),content:{mover:null},target:{}};
  h.scan();assert.equal(h.state().available,true);await h.save();assert.equal(h.saved.length,1);
});
test('Una imagen local data base64 conserva sus bytes sin realizar ninguna llamada fetch',async t=>{
  const h=setup(t),{image}=h.open();image.src='data:image/png;base64,'+PNG.toString('base64');h.scan();
  assert.equal(h.state().available,true);await h.save();assert.deepEqual(Buffer.from(await h.saved[0].blob.arrayBuffer()),PNG);assert.equal(h.requests.length,0);
});
test('Una imagen pequeña identificada como tal también se guarda desde los datos locales',async t=>{
  const h=setup(t),{image}=h.open(PNG,{width:1,height:1});image.src='data:image/png;base64,'+PNG.toString('base64');h.scan();
  assert.equal(h.state().available,true);await h.save();assert.equal(h.saved.length,1);assert.equal(h.requests.length,0);
});
test('Pulsar Imagen cuando no está disponible muestra el motivo en lugar de quedar deshabilitado',async t=>{
  const h=setup(t);assert.equal(h.$('.photo-save').disabled,false);const result=await h.save();
  assert.equal(result.error,true);assert.match(result.message,/visor grande/);assert.equal(h.$('.photo-notice').hidden,false);assert.equal(h.requests.length,0);
});
test('Una imagen enviada como archivo se reconoce por el nombre si su MIME es genérico',async t=>{
  const h=setup(t);h.open();h.w.appMediaViewer.target.message.media={document:{id:'123',mime_type:'application/octet-stream',attributes:[{_:'documentAttributeFilename',file_name:'Mi foto.png'}]}};
  h.scan();assert.equal(h.state().available,true);await h.save();assert.equal(h.saved.length,1);
});
test('Metadatos opcionales en otro formato no bloquean el aviso ni la foto ya cargada',async t=>{
  const h=setup(t);h.open();h.w.appMediaViewer.target.message.media.photo.sizes={};h.scan();
  assert.equal(h.state().available,true);await h.save();assert.deepEqual(h.errors,[]);
});
test('Se respeta la visibilidad de una imagen que sobrescribe visibility:hidden de un contenedor',async t=>{
  const h=setup(t),{slide,image}=h.open();const wrapper=h.d.createElement('div');wrapper.style.visibility='hidden';slide.append(wrapper);wrapper.append(image);image.style.visibility='visible';h.scan();
  assert.equal(h.state().available,true);await h.save();assert.equal(h.saved.length,1);
});
test('HTML y SVG incrustados no se guardan como imágenes raster, ni recurren a la red',async t=>{
  const h=setup(t),{image}=h.open();
  for(const src of ['data:image/png;base64,'+Buffer.from('<html>error</html>').toString('base64'),'data:image/svg+xml;base64,'+Buffer.from('<svg/>').toString('base64')]){
    image.src=src;h.scan();assert.equal(h.state().available,false);await h.save();
  }assert.equal(h.requests.length,0);assert.equal(h.saved.length,0);
});
