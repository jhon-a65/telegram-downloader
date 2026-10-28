/* Respaldo local: identidades estables, mensajes por bloques y archivos originales. */
(() => {
  'use strict';
  const E = globalThis.TGLocalBulkEngine;
  const FILE = 'Telegram-respaldo.json', VERSION = 1, MAX_JSON = 32 * 1024 * 1024;
  const TYPES = ['videos', 'photos', 'audio', 'documents'];
  const FOLDERS = {videos:'Vídeos', photos:'Imágenes', audio:'Audios', documents:'Documentos'};
  const OFFSET = 0x100000000;
  const id = value => { const n=Number(value);return Number.isSafeInteger(n)&&n>0&&n<OFFSET*2 ? (n>=OFFSET?n-OFFSET:n) : 0; };
  const basename = value => typeof value==='string' && value.length>0 && value.length<=180 && value!=='.' && value!=='..' && !/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(value) && !/[. ]$/.test(value);
  const permanent = text => Object.assign(new Error(text), {permanent:true});
  function topicOf(message) {
    if(message.action?._==='messageActionTopicCreate')return id(message.id||message.mid);
    const reply=message.reply_to;
    const explicit=id(message.top_msg_id || message.topic_id);
    if(explicit)return explicit;
    if(reply?.pFlags?.forum_topic || reply?.forum_topic===true){
      const n=id(reply.reply_to_top_id || reply.reply_to_msg_id);
      if(!n)throw permanent('Un mensaje no tiene un tema identificable. Se detuvo el respaldo.');
      return n;
    }
    if(reply?.reply_to_top_id)throw permanent('No se pudo confirmar el tema de un mensaje.');
    return 1;
  }
  function options(raw={}) {
    const types=Array.isArray(raw.types) ? TYPES.filter(t=>raw.types.includes(t)) : ['videos'];
    if(typeof raw.messages!=='boolean' && raw.messages!==undefined)throw new Error('Elige si quieres conservar los mensajes.');
    if(!types.length && raw.messages!==true)throw new Error('Selecciona al menos un tipo de archivo o los mensajes.');
    const from=raw.from || '',to=raw.to || '';
    for(const date of [from,to])if(date && (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw new Error('Introduce fechas válidas.');
    if(from&&to&&from>to)throw new Error('La fecha inicial debe ser anterior a la final.');
    const end=to?new Date(to+'T00:00:00'):null;if(end)end.setDate(end.getDate()+1);
    return {types,messages:raw.messages===true,from,to,parallelism:E.parallelism(raw.parallelism),
      fromTime:from?new Date(from+'T00:00:00').getTime()/1000:0,toTime:end?end.getTime()/1000-1:Infinity};
  }
  function inDates(message,opts){return message.date>=opts.fromTime && message.date<=opts.toTime;}
  function photoSize(photo){
    return (photo?.sizes||[]).filter(s=>['photoSize','photoSizeProgressive','photoCachedSize'].includes(s._)&&typeof s.type==='string'&&/^[a-zA-Z0-9]{1,4}$/.test(s.type))
      .map(s=>({...s,size:Number(s.size)||(Array.isArray(s.sizes)?Math.max(...s.sizes):0)||(s.bytes?.byteLength||s.bytes?.length||0)}))
      .filter(s=>Number.isSafeInteger(s.size)&&s.size>0).sort((a,b)=>(b.w*b.h-a.w*a.h)||(b.size-a.size))[0];
  }
  function extension(name,mime,kind){
    const ext=/\.([a-zA-Z0-9]{1,10})$/.exec(name||'')?.[1]?.toLowerCase();
    if(ext)return ext;
    return ({'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','audio/ogg':'ogg','audio/mpeg':'mp3','audio/mp4':'m4a','audio/wav':'wav','application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/x-tgsticker':'tgs'})[mime] || (kind==='videos'?'mp4':kind==='photos'?'jpg':kind==='audio'?'ogg':'bin');
  }
  function attachment(message,peerId,topicId) {
    const media=message.media;
    if(!media)return {item:null};
    const doc=media.document,photo=media.photo,mid=id(message.id||message.mid),date=Number(message.date)||0;
    if(media.ttl_seconds || media.pFlags?.ttl_seconds)return {item:null,unsupported:'Archivo temporal: no se incluye en el respaldo.'};
    if(!doc&&!photo){
      const ok=['messageMediaEmpty','messageMediaWebPage','messageMediaPoll','messageMediaContact','messageMediaGeo','messageMediaVenue','messageMediaGeoLive','messageMediaDice','messageMediaGame','messageMediaInvoice','messageMediaStory'];
      return {item:null,unsupported:ok.includes(media._)?'':`Adjunto no compatible: ${String(media._||'desconocido').slice(0,70)}`};
    }
    const value=doc||photo,remoteId=String(value.id??''),attrs=Array.isArray(doc?.attributes)?doc.attributes:[];
    if(!/^-?\d{1,24}$/.test(remoteId)||!mid)throw permanent('Un archivo tiene un identificador incompatible.');
    const mime=String(doc?.mime_type||'image/jpeg').slice(0,150);
    const original=String(doc?.file_name||attrs.find(a=>a._==='documentAttributeFilename')?.file_name||'');
    const video=mime.startsWith('video/')||attrs.some(a=>a._==='documentAttributeVideo')||/\.(mp4|webm|mov|mkv|m4v|avi|3gp)$/i.test(original);
    const audio=mime.startsWith('audio/')||attrs.some(a=>a._==='documentAttributeAudio');
    const kind=photo?'photos':video?'videos':audio?'audio':'documents',sizeInfo=photo?photoSize(photo):null;
    const size=Number(doc?.size||sizeInfo?.size);
    if(!Number.isSafeInteger(size)||size<=0)return {item:null,unsupported:'Archivo sin tamaño o sin una versión descargable.'};
    const suffix=photo?'p':'d',key=`${mid}_${suffix}_${remoteId}${photo?'_'+sizeInfo.type:''}`;
    const stamp=date>0?new Date(date*1000).toISOString().slice(0,19).replace('T','_').replace(/:/g,'-'):'Sin-fecha';
    const ext=extension(original,mime,kind);
    const label=E.component(original.replace(/\.[a-zA-Z0-9]{1,10}$/,'')||(photo?'Imagen':video?'Vídeo':audio?'Audio':'Archivo'),46);
    return {item:{key,docId:remoteId,kind,photo:!!photo,thumb:sizeInfo?.type||'',size,mid:OFFSET+mid,messageId:mid,peerId,topicId,date,mime,
      name:`${stamp}_m${mid}_${suffix}${remoteId}_${label}.${ext}`,subfolder:FOLDERS[kind]}};
  }
  function messageRecord(message,item,author=''){
    const media=message.media;
    const record={id:id(message.id||message.mid),date:Number(message.date)||0,dateISO:message.date?new Date(message.date*1000).toISOString():'',
      text:String(message.message||''),author:String(author).slice(0,300),authorId:message.fromId||message.from_id?.user_id||message.from_id?.channel_id||null,
      editedAt:Number(message.edit_date)||null,replyTo:id(message.reply_to?.reply_to_msg_id)||null,album:message.grouped_id?String(message.grouped_id):null,
      service:message.action?._||null,mediaType:media?._||null,mediaId:media?.document?.id?String(media.document.id):media?.photo?.id?String(media.photo.id):null};
    if(item)record.file={key:item.key,path:item.subfolder+'/'+item.name,size:item.size,mime:item.mime};
    if(Array.isArray(message.entities))record.entities=message.entities.map(e=>({type:String(e._||''),offset:e.offset,length:e.length,...(e.url?{url:String(e.url)}:{})}));
    if(media?.poll)record.poll={question:media.poll.question?.text||media.poll.question,answers:(media.poll.answers||[]).map(a=>a.text?.text||a.text)};
    if(media?.phone_number)record.contact={phone:media.phone_number,firstName:media.first_name,lastName:media.last_name};
    if(media?.geo)record.location={latitude:media.geo.lat,longitude:media.geo.long,title:media.title||''};
    if(message.action?.title)record.title=String(message.action.title);
    return record;
  }
  async function readJSON(directory,name,max=MAX_JSON){
    try{const file=await (await directory.getFileHandle(name)).getFile();
      if(file.size>max)throw new Error('El registro es demasiado grande: '+name);
      if(!file.size)throw new Error('El registro está vacío: '+name);
      return JSON.parse(await file.text());
    }catch(error){if(error.name==='NotFoundError')return null;throw error;}
  }
  async function writeFile(directory,name,data){
    let writer;
    try{const handle=await directory.getFileHandle(name,{create:true});writer=await handle.createWritable({keepExistingData:false});await writer.write(data);await writer.close();writer=null;}
    catch(error){if(writer)try{await writer.abort();}catch{}throw Object.assign(error,{progressError:true});}
  }
  class Store {
    constructor(directory,ctx,data){
      this.directory=directory;this.scope=ctx.scope;this.ctx=ctx;this.data=data;this.entries=new Map(data.files.map(x=>[x.key,x]));
      this.directories=new Map();this.dirty=false;this.batchIndex=0;this.committedCount=this.entries.size;this.committedLast='';
    }
    static validate(data,ctx){
      if(data.version!==VERSION||data.scope!==ctx.scope||data.account!==ctx.account||data.peerId!==ctx.peerId||!Array.isArray(data.topics)||!Array.isArray(data.files))throw new Error('Esta carpeta pertenece a otro grupo, cuenta o formato de respaldo.');
      const topicIds=new Set(),folders=new Set();
      for(const t of data.topics){if(!id(t.id)||!basename(t.folder)||typeof t.title!=='string'||topicIds.has(t.id)||folders.has(t.folder.toLowerCase()))throw new Error('El registro contiene una carpeta de tema incompatible.');topicIds.add(t.id);folders.add(t.folder.toLowerCase());}
      const keys=new Set(),paths=new Set();
      for(const x of data.files){
        if(!/^\d+_[pd]_-?\d{1,24}(?:_[a-zA-Z0-9]{1,4})?$/.test(x.key)||keys.has(x.key)||!basename(x.name)||!TYPES.includes(x.kind)||x.subfolder!==FOLDERS[x.kind]||!topicIds.has(x.topicId)||!Number.isSafeInteger(x.size)||x.size<1||!['planned','complete'].includes(x.status))throw new Error('El registro de archivos no es compatible.');
        const path=x.topicId+'/'+x.subfolder+'/'+x.name.toLowerCase();if(paths.has(path))throw new Error('El registro contiene rutas repetidas.');keys.add(x.key);paths.add(path);
      }
    }
    static async open(root,ctx){
      let directory=root,data=await readJSON(root,FILE);
      if(!data){
        const suffix=`__tg_${ctx.account}_${Math.abs(ctx.peerId)}`,matches=[];
        if(typeof root.entries==='function')for await(const [name,handle] of root.entries())if(handle.kind==='directory'&&name.endsWith(suffix))matches.push(handle);
        if(matches.length>1)throw new Error('Hay varias copias de este grupo. Elige directamente la carpeta del respaldo que quieras actualizar.');
        directory=matches[0]||await root.getDirectoryHandle(`Respaldo_${E.component(ctx.title,32)}${suffix}`,{create:true});
        data=await readJSON(directory,FILE);
      }
      if(!data)data={version:VERSION,scope:ctx.scope,account:ctx.account,peerId:ctx.peerId,title:ctx.title,createdAt:Date.now(),updatedAt:Date.now(),topics:[],files:[]};
      Store.validate(data,ctx);
      const store=new Store(directory,ctx,data);store.data.title=ctx.title;store.dirty=true;await store.flush();return store;
    }
    async topic(topic){
      let saved=this.data.topics.find(x=>x.id===topic.id);
      if(!saved){saved={id:topic.id,title:topic.title,folder:`${String(topic.id).padStart(6,'0')} - ${E.component(topic.title,30)}`};this.data.topics.push(saved);this.dirty=true;}
      if(saved.title!==topic.title){saved.title=topic.title;this.dirty=true;}
      const directory=await this.directory.getDirectoryHandle(saved.folder,{create:true});this.directories.set(topic.id,directory);
      await writeFile(directory,'Tema.json',JSON.stringify({version:1,id:topic.id,title:topic.title,folder:saved.folder},null,2));return directory;
    }
    plan(item){
      const previous=this.entries.get(item.key);
      if(previous){
        if(previous.size!==item.size||previous.topicId!==item.topicId)throw permanent('Cambió un archivo que ya estaba registrado. Se conservó la copia anterior.');
        item.name=previous.name;item.subfolder=previous.subfolder;return;
      }
      this.entries.set(item.key,{key:item.key,topicId:item.topicId,name:item.name,subfolder:item.subfolder,kind:item.kind,size:item.size,status:'planned'});this.dirty=true;
    }
    async mediaDirectory(item){
      const directory=this.directories.get(item.topicId);
      if(!directory)throw permanent('No se encontró la carpeta del tema.');
      return directory.getDirectoryHandle(item.subfolder,{create:true});
    }
    async exists(item){
      if(this.entries.get(item.key)?.status!=='complete')return false;
      try{return (await (await (await this.mediaDirectory(item)).getFileHandle(item.name)).getFile()).size===item.size;}
      catch(error){if(error.name==='NotFoundError')return false;throw error;}
    }
    has(){return false;}
    async complete(item){
      const saved=this.entries.get(item.key);if(!saved)throw permanent('No se encontró el registro de este archivo.');
      saved.status='complete';saved.savedAt=Date.now();this.dirty=true;await this.flush();this.committedLast=item.name;
    }
    async flush(){
      if(!this.dirty)return;
      this.data.updatedAt=Date.now();this.data.files=[...this.entries.values()];
      await writeFile(this.directory,FILE,JSON.stringify(this.data));this.dirty=false;
      this.committedCount=[...this.entries.values()].filter(x=>x.status==='complete').length;
    }
    async messages(topicId,records){
      const directory=await this.directories.get(topicId).getDirectoryHandle('Mensajes',{create:true}),groups=new Map();
      for(const record of records){const block=Math.floor(record.id/500);if(!groups.has(block))groups.set(block,[]);groups.get(block).push(record);}
      for(const [block,added] of groups){
        const stem='mensajes-'+String(block).padStart(8,'0'),old=await readJSON(directory,stem+'.json');
        if(old&&(old.version!==1||old.scope!==this.scope||old.topicId!==topicId||!Array.isArray(old.messages)||old.messages.some(m=>!id(m.id)||Math.floor(m.id/500)!==block)))throw new Error('Un bloque de mensajes no corresponde a este respaldo.');
        const merged=new Map((old?.messages||[]).map(m=>[m.id,m]));for(const m of added){const previous=merged.get(m.id);if(!m.file&&previous?.file&&m.mediaId&&m.mediaId===previous.mediaId)m.file=previous.file;merged.set(m.id,m);}
        const messages=[...merged.values()].sort((a,b)=>a.date-b.date||a.id-b.id);
        await writeFile(directory,stem+'.json',JSON.stringify({version:1,scope:this.scope,topicId,messages},null,2));
        const text=messages.map(m=>`[${m.dateISO||'Sin fecha'}] ${m.author||'Mensaje'} · #${m.id}\n${m.text}${m.title?'\n'+m.title:''}${m.service?'\n[Servicio: '+m.service+']':''}${m.file?'\n[Archivo: ../'+m.file.path+']':''}${m.poll?'\n[Encuesta: '+JSON.stringify(m.poll)+']':''}${m.contact?'\n[Contacto: '+JSON.stringify(m.contact)+']':''}${m.location?'\n[Ubicación: '+JSON.stringify(m.location)+']':''}`).join('\n\n');
        await writeFile(directory,stem+'.txt',text+'\n');
      }
    }
  }
  globalThis.TGLocalBackupCore=Object.freeze({FILE,VERSION,TYPES,FOLDERS,OFFSET,id,basename,permanent,topicOf,options,inDates,photoSize,attachment,messageRecord,Store,readJSON,writeFile});
})();
