/* Imagen del visor activo. No recorre fotos del chat ni modifica las colas de vídeo. */
(() => {
  'use strict';
  if (window.__tgLocalPhotoLoaded) return;
  window.__tgLocalPhotoLoaded=true;
  const C=window.TGLocalCore, MAX=64*1024*1024;
  const fetchImage=window.fetch.bind(window), createURL=URL.createObjectURL.bind(URL), revokeURL=URL.revokeObjectURL.bind(URL);
  const identities=new WeakMap();
  let channel='',busy=false,lastState='',timer=0,reason='';
  function send(type,fields={}) {
    if(channel&&typeof document!=='undefined'&&document?.documentElement)document.dispatchEvent(new CustomEvent('tg-local:reply',{detail:JSON.stringify({channel,type,...fields})}));
  }
  function visible(element,box=true) {
    if(!element?.isConnected)return false;
    if(['hidden','collapse'].includes(getComputedStyle(element).visibility))return false;
    for(let node=element;node;node=node.parentElement){
      const style=getComputedStyle(node);
      if(node.hidden||node.getAttribute('aria-hidden')==='true'||style.display==='none'||style.contentVisibility==='hidden'||(style.opacity!==''&&Number(style.opacity)<=0.01))return false;
    }
    if(!box)return true;
    const rect=element.getBoundingClientRect();
    return rect.width>0&&rect.height>0&&rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight;
  }
  function inlineImage(value) {
    if(typeof value!=='string'||value.length>Math.ceil(MAX*4/3)+256)return null;
    const comma=value.indexOf(',');if(comma<0||comma>80)return null;
    const header=value.slice(0,comma);
    if(!/^data:image\/(?:jpeg|png|webp|gif|avif|bmp|tiff);base64$/i.test(header))return null;
    try{
      const head=value.slice(comma+1,comma+81).replace(/\s/g,'').slice(0,48);
      if(!head||!format(Uint8Array.from(atob(head),c=>c.charCodeAt(0))))return null;
      return {comma,mime:header.slice(5,-7)};
    }catch{return null;}
  }
  function localUrl(value) {
    const url=C.safeUrl(value,location.origin);
    if(url?.startsWith('blob:'))return url;
    return inlineImage(value)?value:null;
  }
  function source(image) {
    if(image.hasAttribute('srcset')||image.parentElement?.tagName==='PICTURE')return localUrl(image.currentSrc||image.src);
    const declared=image.getAttribute('src')?.trim();
    return declared?localUrl(image.src):localUrl(image.currentSrc);
  }
  function missing(message){reason=message;return null;}
  function current() {
    reason='';
    const viewers=[...document.querySelectorAll('.media-viewer-whole, #MediaViewer')].filter(viewer=>visible(viewer,false)&&
      (viewer.matches('.media-viewer-whole')?viewer.classList.contains('active'):!viewer.matches('.closing, .not-open')&&(viewer.tagName!=='DIALOG'||viewer.open)));
    const viewer=viewers.at(-1);if(!viewer)return missing('Abre la foto en el visor grande de Telegram, haciendo clic sobre ella.');
    const isK=viewer.matches('.media-viewer-whole'),native=isK&&window.appMediaViewer?.wholeDiv===viewer?window.appMediaViewer:null;
    let slide;
    const nativeMover=native?.content?.mover;
    if(nativeMover&&viewer.contains(nativeMover)&&nativeMover.matches('.media-viewer-mover:not(.moving):not(.hiding)')&&visible(nativeMover,false))slide=nativeMover;
    else{
      const slides=[...viewer.querySelectorAll(isK?'.media-viewer-mover.center:not(.moving):not(.hiding)':'.MediaViewerSlide--active')].filter(node=>visible(node,false));
      if(slides.length!==1)return missing('Espera a que termine el cambio de foto y vuelve a pulsar Imagen.');
      slide=slides[0];
    }
    if(slide.querySelector('video, .VideoPlayer, .ckin__player'))return missing('El elemento abierto es un vídeo. Abre una foto para guardar su imagen.');
    let nativeId='',expected=null;
    const media=native?.target?.message?.media;
    if(media){
      const photo=media.photo||media.webpage?.photo,doc=media.document;
      if(photo){
        nativeId=String(photo.id||'');
        const sizes=Array.isArray(photo.sizes)?photo.sizes:[];
        expected=sizes.filter(size=>Number(size.w)>0&&Number(size.h)>0).sort((a,b)=>b.w*b.h-a.w*a.h)[0];
      }else if(doc){
        const attrs=Array.isArray(doc.attributes)?doc.attributes:[];
        if(/^video\//.test(doc.mime_type||'')||['video','gif','round'].includes(doc.type)||attrs.some(attr=>attr._==='documentAttributeVideo'))return missing('El elemento abierto es un vídeo; su portada no se guarda como foto.');
        const name=doc.file_name||attrs.find(attr=>attr._==='documentAttributeFilename')?.file_name||'';
        if(!/^image\//.test(doc.mime_type||'')&&!/\.(jpe?g|png|webp|gif|avif|bmp|tiff?)$/i.test(name))return missing('El archivo abierto no está identificado como una imagen.');
        nativeId=String(doc.id||'');expected=attrs.find(attr=>attr._==='documentAttributeImageSize');
      }
      nativeId+=':'+String(native.target.mid||'');
    }
    const full=isK?[]:[...slide.querySelectorAll('img.full-media, .full-media img')];
    const images=(full.length?full:[...slide.querySelectorAll('img')]).filter(image=>!image.closest('.media-viewer-caption, .media-viewer-thumbs, .media-viewer-album-thumbs')&&
      (full.length||!image.closest('.Avatar, .avatar'))&&(isK||full.length||!image.matches('.thumbnail, .preview, .blurred, .poster')));
    const loaded=images.filter(image=>image.complete&&image.naturalWidth>0&&image.naturalHeight>0&&visible(image));
    if(!loaded.length)return missing('La imagen todavía no está lista para leer. Espera unos segundos y vuelve a pulsar Imagen.');
    const candidates=loaded.filter(image=>source(image)&&
      (image.naturalWidth*image.naturalHeight>=4096||(expected&&expected.w*expected.h<=4096)||(!isK&&full.length)));
    candidates.sort((a,b)=>b.naturalWidth*b.naturalHeight-a.naturalWidth*a.naturalHeight);
    const image=candidates[0];
    if(!image)return missing(loaded.some(source)?'Solo está lista una vista previa pequeña. Espera a que se cargue la foto y vuelve a pulsar Imagen.':'La foto se ve, pero su archivo local aún no se puede leer. Ciérrala y vuelve a abrirla antes de pulsar Imagen.');
    // Guardar lo que ya está cargado no exige que coincida con la mayor resolución del servidor.
    const url=source(image);let identity=identities.get(image);
    if(!identity||identity.url!==url||identity.nativeId!==nativeId){
      const random=[...crypto.getRandomValues(new Uint8Array(8))].map(n=>n.toString(16).padStart(2,'0')).join('');
      const id=/^-?\d{1,24}:\d+$/.test(nativeId)?nativeId.replace(':','_'):`${Date.now()}_${random}`;
      identity={url,nativeId,token:random,name:'Telegram-imagen_'+id};identities.set(image,identity);
    }
    return {...identity,width:image.naturalWidth,height:image.naturalHeight};
  }
  function publish(force=false) {
    let selected;try{selected=current();}catch{reason='No se pudo reconocer el visor. Cierra la foto, ábrela otra vez y pulsa Imagen.';}
    const state={available:!!selected,busy,token:selected?.token||'',width:selected?.width||0,height:selected?.height||0,reason:selected?'':reason};
    const text=JSON.stringify(state);if(force||text!==lastState){lastState=text;send('photo-state',state);}
  }
  function format(bytes) {
    if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return {mime:'image/jpeg',ext:'jpg'};
    if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return {mime:'image/png',ext:'png'};
    const ascii=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
    if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return {mime:'image/webp',ext:'webp'};
    if(['GIF87a','GIF89a'].includes(ascii(0,6)))return {mime:'image/gif',ext:'gif'};
    if(ascii(4,8)==='ftyp'&&/avif|avis/.test(ascii(8,32)))return {mime:'image/avif',ext:'avif'};
    if(ascii(0,2)==='BM')return {mime:'image/bmp',ext:'bmp'};
    if(['II*\x00','MM\x00*'].includes(ascii(0,4)))return {mime:'image/tiff',ext:'tif'};
    return null;
  }
  async function read(url,signal) {
    if(!localUrl(url))throw new Error('Esta imagen no está disponible como datos locales del navegador. Vuelve a abrirla y espera a que cargue.');
    if(url.startsWith('data:')){
      const info=inlineImage(url);if(!info)throw new Error('La imagen local no tiene un formato compatible.');
      const binary=atob(url.slice(info.comma+1).replace(/\s/g,''));signal.throwIfAborted();
      if(binary.length>MAX)throw new Error('Esta imagen supera el límite de 64 MB para esta opción.');
      const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),kind=format(bytes.slice(0,32));
      if(!kind)throw new Error('El recurso local no es una imagen compatible.');
      return {blob:new Blob([bytes],{type:kind.mime}),...kind};
    }
    const response=await fetchImage(url,{signal,credentials:'same-origin'});
    if(!response.ok||response.status===206||!response.body)throw new Error('No se pudo leer la imagen. Ábrela de nuevo y espera a que cargue.');
    const length=Number(response.headers.get('Content-Length'))||0;
    if(length>MAX){await response.body.cancel();throw new Error('Esta imagen supera el límite de 64 MB para esta opción.');}
    const reader=response.body.getReader(),parts=[];let size=0;
    const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
    try{
      for(;;){signal.throwIfAborted();const result=await reader.read();signal.throwIfAborted();if(result.done)break;
        size+=result.value.byteLength;if(size>MAX)throw new Error('Esta imagen supera el límite de 64 MB para esta opción.');parts.push(result.value);
      }
      if(!size||(length&&!response.headers.get('Content-Encoding')&&length!==size))throw new Error('La imagen llegó incompleta. Vuelve a abrirla antes de guardar.');
      const blob=new Blob(parts),kind=format(new Uint8Array(await blob.slice(0,32).arrayBuffer()));
      if(!kind)throw new Error('El recurso no es una imagen compatible. No se guardó ningún archivo.');
      return {blob:new Blob(parts,{type:kind.mime}),...kind};
    }finally{signal.removeEventListener('abort',abort);try{await reader.cancel();}catch{}reader.releaseLock();}
  }
  async function save(command) {
    if(busy)return;
    let selected;try{selected=current();}catch{reason='No se pudo reconocer el visor. Cierra la foto y vuelve a abrirla.';}
    if(!selected){send('photo-result',{error:true,message:reason||'No se pudo leer la imagen abierta.'});publish(true);return;}
    if(command.token!==selected.token){send('photo-result',{error:true,message:'Cambió la imagen abierta. Compruébala y vuelve a pulsar Imagen.'});publish(true);return;}
    busy=true;publish();
    const controller=new AbortController();
    const deadline=setTimeout(()=>controller.abort(new Error('La imagen tardó demasiado en responder. Ábrela de nuevo e inténtalo otra vez.')),30000);
    try{
      // La URL queda fijada al hacer clic. Cambiar de foto después no cambia el archivo elegido.
      const data=await read(selected.url,controller.signal);controller.signal.throwIfAborted();
      const name=selected.name+'.'+data.ext;
      const url=createURL(data.blob),link=document.createElement('a');
      link.href=url;link.download=name;link.style.display='none';document.documentElement.append(link);
      try{link.click();}finally{link.remove();setTimeout(()=>revokeURL(url),60000);}
      send('photo-result',{error:false,message:'Imagen enviada a las descargas del navegador.'});
    }catch(error){
      send('photo-result',{error:true,message:controller.signal.aborted?String(controller.signal.reason?.message||'Descarga cancelada.'):error.name==='TypeError'?'La imagen ya no está disponible. Ábrela otra vez y espera a que cargue.':error.message||'No se pudo guardar la imagen.'});
    }finally{clearTimeout(deadline);busy=false;publish(true);}
  }
  document.addEventListener('tg-local:command',event=>{
    if(event.target!==document||typeof event.detail!=='string'||event.detail.length>6000)return;
    let cmd;try{cmd=JSON.parse(event.detail);}catch{return;}
    if(cmd.type==='hello'&&/^[a-f0-9]{32}$/.test(cmd.channel)){channel=cmd.channel;publish(true);return;}
    if(!channel||cmd.channel!==channel)return;
    if(cmd.type==='scan'||cmd.type==='photo-status')publish(true);
    if(cmd.type==='photo-save')void save(cmd);
  });
  const schedule=()=>{if(!timer)timer=setTimeout(()=>{timer=0;publish();},100);};
  const observer=new MutationObserver(records=>{
    if(records.some(record=>record.target instanceof Element&&!record.target.closest('#tg-local-video-tools')&&
      (record.target.closest('.media-viewer-whole, #MediaViewer')||[...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element&&node.matches('.media-viewer-whole, #MediaViewer')))))schedule();
  });
  observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['src','srcset','class','style','hidden','aria-hidden','open']});
  document.addEventListener('load',schedule,true);document.addEventListener('error',schedule,true);
  document.addEventListener('transitionend',schedule,true);window.addEventListener('resize',schedule);
  setInterval(()=>publish(),1500);
})();
