/* Coordinador de copias por temas. Reutiliza exclusivamente la sesión nativa de Web K. */
(() => {
  'use strict';
  if(window.TGLocalBackup)return;
  const E=window.TGLocalBulkEngine,B=window.TGLocalBackupCore;
  let channel='',job=null,choosing=false,loading=false,sequence=0,loader=null,root=null,lastScope='',topics=[],topicsScope='',topicsRevision=0,message='';
  let selection={scope:'',ids:new Set(),ready:false};
  const send=(type,data={})=>{if(channel&&document.documentElement)document.dispatchEvent(new CustomEvent('tg-local:reply',{detail:JSON.stringify({channel,type,...data})}));};
  function context(){
    const ctx=window.TGLocalBulk.backupContext();
    if(ctx.peerId>=0)throw new Error('Abre el grupo que quieras respaldar.');
    if(typeof ctx.managers.appMessagesManager.requestHistory!=='function')throw new Error('Recarga Telegram Web K para activar el respaldo.');
    return {...ctx,scope:ctx.baseScope+':backup'};
  }
  function problem(ctx){
    try{if(context().scope===ctx.scope)return '';}catch{}
    return 'El respaldo está en pausa porque cambiaste de grupo o cuenta. Vuelve al grupo original y pulsa Reanudar.';
  }
  function availability(){
    try{const ctx=context();return {available:true,availableScope:ctx.scope,availableGroup:ctx.title,isForum:ctx.isForum,directoryPicker:typeof window.showDirectoryPicker==='function'};}
    catch(error){return {available:false,availableScope:'',availableGroup:'',message:error.message};}
  }
  function publish(){
    const info=availability(),visible=job&&(job.busy||job.ctx.scope===info.availableScope)?job:null,state=visible?.state()||{phase:'idle',busy:false,found:0,saved:0,skipped:0,failed:0,current:null};
    send('backup-state',{...info,...state,busy:choosing||loading||state.busy,phase:choosing?'choosing':loading?'topics':state.phase,
      topicCount:topicsScope===info.availableScope?topics.length:0,topicsReady:topicsScope===info.availableScope&&!!topics.length,
      hasDirectory:!!root&&job?.ctx.scope===info.availableScope,message:message||state.message||info.message||'Elige qué conservar y dónde guardar tu copia.'});
  }
  function publishTopics(){
    const revision=++topicsRevision;
    for(let n=0;n<topics.length;n+=100)send('backup-topics',{scope:topicsScope,revision,reset:n===0,done:n+100>=topics.length,topics:topics.slice(n,n+100)});
  }
  async function topicList(ctx,check,signal){
    if(!ctx.isForum)return [{id:1,title:'General'}];
    const api=ctx.managers.apiManager,peers=ctx.managers.appPeersManager;
    if(typeof api?.invokeApi!=='function'||typeof peers?.getInputPeerById!=='function')throw B.permanent('Esta versión de Web K no expone la lista de temas. Recarga Telegram y vuelve a probar.');
    await check();const peer=await E.cancellable(peers.getInputPeerById(ctx.peerId),signal);await check();
    let cursor={offset_date:0,offset_id:0,offset_topic:0},method='messages.getForumTopics',channelInput=null;
    const found=new Map(),seen=new Set();
    for(;;){
      await check();let value;
      const request=()=>api.invokeApi(method,{...(method.startsWith('channels.')?{channel:channelInput}:{peer}),...cursor,limit:100},{noErrorBox:true});
      try{value=await E.cancellable(request(),signal);}
      catch(error){
        if(method==='messages.getForumTopics'&&/METHOD_INVALID|METHOD_NOT_FOUND|CONSTRUCTOR_INVALID/.test(E.errorText(error))&&typeof ctx.managers.appChatsManager?.getChannelInput==='function'){
          await check();channelInput=await ctx.managers.appChatsManager.getChannelInput(Math.abs(ctx.peerId));await check();method='channels.getForumTopics';value=await E.cancellable(request(),signal);
        }else throw error;
      }
      await check();
      if(!Array.isArray(value?.topics))throw B.permanent('Telegram devolvió una lista de temas incompatible.');
      const page=value.topics.filter(t=>t._!=='forumTopicDeleted');
      if(!value.topics.length)break;
      if(!page.length)throw B.permanent('La lista de temas cambió durante la consulta. Vuelve a cargarla para confirmar todos los temas.');
      for(const t of page){const topicId=B.id(t.id);if(!topicId||typeof t.title!=='string')throw B.permanent('No se pudo identificar un tema del grupo.');found.set(topicId,{id:topicId,title:t.title.trim().slice(0,140)||`Tema ${topicId}`});}
      const last=page.at(-1),top=B.id(last.top_message),created=value.pFlags?.order_by_create_date===true||value.order_by_create_date===true;
      let date=created?Number(last.date):Number(value.messages?.find(m=>B.id(m.id||m.mid)===top)?.date);
      if(!date&&!created&&top){
        const cached=await ctx.managers.appMessagesManager.getMessageByPeer?.(ctx.peerId,B.OFFSET+top);await check();date=Number(cached?.date);
      }
      if(!Number.isSafeInteger(date)||date<=0||!top)throw B.permanent('No se pudo confirmar la siguiente página de temas. Vuelve a cargar la lista.');
      const next={offset_date:date,offset_id:top,offset_topic:B.id(last.id)},token=JSON.stringify(next);
      if(seen.has(token)||token===JSON.stringify(cursor))throw B.permanent('La lista de temas dejó de avanzar. El respaldo no se inició.');
      seen.add(token);cursor=next;
    }
    if(!found.has(1))found.set(1,{id:1,title:'General'});
    return [...found.values()].sort((a,b)=>a.id-b.id);
  }
  async function loadTopics(){
    if(choosing||loading||job?.busy)return;
    let ctx;try{ctx=context();}catch(error){message=error.message;publish();return;}
    const turn=++sequence;loading=true;message='Consultando los temas del grupo…';loader=new AbortController();const controller=loader;publish();
    const check=async()=>{controller.signal.throwIfAborted();if(problem(ctx))throw B.permanent('Cambió el grupo mientras se consultaban sus temas. Vuelve a cargar la lista.');};
    try{const loaded=await topicList(ctx,check,controller.signal);if(turn!==sequence)return;topics=loaded;topicsScope=ctx.scope;selection={scope:'',ids:new Set(),ready:false};message='';publishTopics();}
    catch(error){if(turn===sequence){topics=[];topicsScope='';message=error.name==='AbortError'?'Consulta detenida.':E.errorText(error);}}
    finally{if(turn===sequence){loading=false;loader=null;publish();}}
  }
  function makeAdapter(ctx,opts){
    const managers=ctx.managers,messages=managers.appMessagesManager,docs=managers.appDocsManager;
    let adapter,renewing=null,renewedKey='',renewedOwner=null;
    const guard=signal=>{signal?.throwIfAborted();adapter.beforeRequest?.();};
    const renew=(item,signal)=>{
      guard(signal);
      if(renewing&&renewedKey===item.key&&renewedOwner===signal)return renewing;
      renewedKey=item.key;renewedOwner=signal;
      const task=(async()=>{
        const fresh=await messages.reloadMessage(item.peerId,item.mid,true);guard(signal);
        const candidate=B.attachment(fresh,item.peerId,item.topicId).item;
        if(!candidate||candidate.key!==item.key||candidate.size!==item.size||B.topicOf(fresh)!==item.topicId)throw B.permanent('El archivo cambió o ya no está disponible en su mensaje.');
        const value=item.photo?fresh.media.photo:fresh.media.document;return {...value,size:item.size};
      })();
      const owned=task.finally(()=>{if(renewing===owned)renewing=null;});renewing=owned;return owned;
    };
    const read=(item,value,offset,limit,signal)=>{
      guard(signal);
      if(!item.photo)return docs.requestDocPart(item.docId,value.dc_id,offset,limit);
      const bytes=value.sizes?.find(s=>s.type===item.thumb&&s._==='photoCachedSize')?.bytes;
      if(bytes){const data=bytes instanceof Uint8Array?bytes:Uint8Array.from(bytes);return {bytes:data.slice(offset,offset+limit)};}
      if(typeof managers.apiFileManager?.requestFilePart!=='function')throw B.permanent('Esta versión de Web K no permite guardar fotos en el respaldo.');
      return managers.apiFileManager.requestFilePart({dcId:value.dc_id,location:{_:'inputPhotoFileLocation',id:value.id,access_hash:value.access_hash,file_reference:value.file_reference,thumb_size:item.thumb},offset,limit});
    };
    adapter={contextProblem:()=>problem(ctx),
      history:async(topic,offset)=>{
        guard();const value=await messages.requestHistory({peerId:ctx.peerId,...(ctx.isForum&&topic.id!==1?{threadId:B.OFFSET+topic.id}:{}),offsetId:offset,limit:100});guard();
        if(!Array.isArray(value?.messages)||value.search_flood)throw B.permanent('No se pudo consultar todo el historial del tema.');return value;
      },
      resolve:async item=>{
        guard();let value=item.photo?await managers.appPhotosManager?.getPhoto(item.docId):await docs.getDoc(item.docId);guard();
        if(!value||String(value.id)!==item.docId)return renew(item);
        if(!item.photo&&Number(value.size)!==item.size)throw B.permanent('El tamaño del archivo cambió desde el análisis.');
        if(item.photo){const size=B.photoSize(value);if(!size||size.type!==item.thumb||size.size!==item.size)return renew(item);}
        return {...value,size:item.size};
      },
      readPart:async(item,value,offset,limit,signal)=>{
        try{return await read(item,value,offset,limit,signal);}
        catch(error){if(!/FILE_REFERENCE|FILEREF|NO_DOC/.test(E.errorText(error)))throw error;guard(signal);const fresh=await renew(item,signal);guard(signal);return read(item,fresh,offset,limit,signal);}
      }
    };return adapter;
  }
  class BackupJob extends E.Batch {
    get busy(){return this.running||!!this.finalizing;}
    constructor(ctx,opts,selected,store,allTopics){
      const lookup=new Map();
      const directory={name:store.directory.name,getFileHandle:async(name,flags)=>{
        const item=lookup.get(name);if(!item)throw B.permanent('No se encontró la ruta del archivo del respaldo.');
        return (await store.mediaDirectory(item)).getFileHandle(name,flags);
      }};
      super({adapter:makeAdapter(ctx,opts),directory,scope:ctx.scope,title:ctx.title,progress:store,continueProgress:false,parallelism:opts.parallelism,pageDelay:0,onState:()=>publish()});
      Object.assign(this,{ctx,opts,selected,store,lookup,allTopics,topicsDone:0,currentTopic:'',messageCount:0,unsupported:0,notes:[]});
    }
    state(){const state=super.state();return {...state,busy:this.busy,phase:this.finalizing&&!this.running?'finishing':state.phase,topicsDone:this.topicsDone||0,topicsTotal:this.selected?.length||0,currentTopic:this.currentTopic||'',messageCount:this.messageCount||0,unsupported:this.unsupported||0,notes:this.notes?.slice(-8)||[]};}
    async discover(){
      this.stage='scanning';this.publish();
      const refreshed=await this.retry(()=>topicList(this.ctx,()=>this.checkpoint(),this.abort.signal));
      if(this.allTopics)this.selected=refreshed;
      else{
        const ids=new Set(this.selected.map(t=>t.id));this.selected=refreshed.filter(t=>ids.has(t.id));
        if(ids.size!==this.selected.length)throw B.permanent('Uno de los temas elegidos ya no está disponible. Carga la lista y revisa tu selección.');
      }
      topics=refreshed;topicsScope=this.ctx.scope;publishTopics();this.publish();
      this.store.data.lastOptions={types:this.opts.types,messages:this.opts.messages,from:this.opts.from,to:this.opts.to,parallelism:this.opts.parallelism};this.store.dirty=true;
      this.store.data.lastSelection={mode:this.allTopics?'all':'selected',topicIds:this.selected.map(t=>t.id)};
      for(const topic of this.selected){
        await this.checkpoint();this.currentTopic=topic.title;this.publish();await this.store.topic(topic);await this.store.flush();
        let offset=0;const seen=new Set();
        for(;;){
          const page=await this.retry(()=>this.adapter.history(topic,offset));await this.checkpoint();this.pages++;
          const list=page.messages.filter(Boolean),records=[];
          if(!list.length)break;
          let minimum=Infinity;
          for(const raw of list){
            const mid=B.id(raw.id||raw.mid);if(!mid)throw B.permanent('El historial contiene un mensaje incompatible.');minimum=Math.min(minimum,mid);
            if(raw._==='messageEmpty')continue;
            const peer=Number(raw.peerId|| (raw.peer_id?.channel_id?-Number(raw.peer_id.channel_id):raw.peer_id?.chat_id?-Number(raw.peer_id.chat_id):this.ctx.peerId));
            if(peer!==this.ctx.peerId)throw B.permanent('Telegram devolvió un mensaje de otro grupo.');
            const topicId=this.ctx.isForum?B.topicOf(raw):1;
            if(topicId!==topic.id){if(topic.id===1)continue;throw B.permanent('Telegram devolvió un mensaje de otro tema.');}
            if(!B.inDates(raw,this.opts))continue;
            const {item,unsupported}=B.attachment(raw,this.ctx.peerId,topic.id);
            if(unsupported){this.unsupported++;this.notes.push({name:`${topic.title} · mensaje ${mid}`,message:unsupported});if(this.notes.length>100)this.notes.shift();}
            const chosen=item&&this.opts.types.includes(item.kind)?item:null;
            if(chosen){
              this.store.plan(chosen);
              if(!this.files.has(chosen.key)){this.files.set(chosen.key,{...chosen,status:'pending'});this.lookup.set(chosen.name,this.files.get(chosen.key));this.totalBytes+=chosen.size;}
            }
            if(this.opts.messages){
              let author='';const authorId=Number(raw.fromId||raw.from_id?.user_id||0);
              try{const u=authorId>0?window.apiManagerProxy?.getUser(authorId):null;author=u?[u.first_name,u.last_name].filter(Boolean).join(' '):raw.post_author||'';}catch{}
              records.push(B.messageRecord(raw,chosen,author));this.messageCount++;
            }
          }
          await this.checkpoint();await this.store.flush();if(records.length)await this.store.messages(topic.id,records);await this.checkpoint();this.publish();
          if(page._==='messages.messages')break;
          if(!Number.isFinite(minimum)||seen.has(minimum)||(offset&&minimum>=B.id(offset)))throw B.permanent('El historial dejó de avanzar. No se declaró completo el respaldo.');
          seen.add(minimum);offset=B.OFFSET+minimum;
          await E.cancellable(new Promise(resolve=>setTimeout(resolve,100)),this.abort.signal);
        }
        this.topicsDone++;this.publish();
      }
      this.files=new Map([...this.files].sort(([,a],[,b])=>a.date-b.date||a.messageId-b.messageId||a.key.localeCompare(b.key)));
      for(const item of this.files.values()){
        await this.checkpoint();if(await this.store.exists(item)){item.status='skipped';this.skipped++;}
      }
      this.completedScan=true;this.publish();
    }
    async process(){
      await super.process();
      if(this.stage==='done')this.message=this.failed||this.unsupported?'Respaldo terminado con avisos. Revisa los archivos fallidos o no compatibles.':'Respaldo actualizado. Los archivos anteriores se conservan y no se descargaron otra vez.';
    }
    async run(){
      this.finalizing=true;
      await super.run();
      if(this.stage==='stopped')this.message='Respaldo detenido. Los archivos terminados se conservan. Pulsa Continuar / actualizar para retomar lo pendiente; el archivo interrumpido volverá a empezar.';
      try{await B.writeFile(this.store.directory,'Ultimo-resumen.json',JSON.stringify({version:1,scope:this.scope,updatedAt:Date.now(),phase:this.stage,complete:this.stage==='done'&&!this.failed&&!this.unsupported,topics:this.selected,messageCount:this.messageCount,found:this.files.size,saved:this.saved,existing:this.skipped,failed:this.failed,unsupported:this.unsupported,errors:this.errors,notes:this.notes,options:this.store.data.lastOptions},null,2));}
      catch(error){this.stage='error';this.message='Los archivos se conservaron, pero no se pudo guardar el resumen: '+E.errorText(error);}
      finally{this.finalizing=false;this.publish();}
    }
  }
  async function start(command,reuse=false){
    if(choosing||loading||job?.busy||window.TGLocalSingle.isBusy()||window.TGLocalBulk.isBusy()||window.TGLocalManual.isBusy()){message='Termina o detén la otra descarga antes de iniciar el respaldo.';publish();return;}
    let ctx,opts,selected,picker;
    try{
      ctx=context();opts=B.options(command.options);
      if(command.expectedScope!==ctx.scope||topicsScope!==ctx.scope)throw new Error('Cambió el grupo. Carga sus temas antes de iniciar el respaldo.');
      if(command.selection==='all')selected=topics.map(t=>({...t}));
      else if(command.selection==='selected'&&selection.ready&&selection.scope===ctx.scope){selected=topics.filter(t=>selection.ids.has(t.id)).map(t=>({...t}));if(selected.length!==selection.ids.size)throw new Error('Cambió la lista de temas. Comprueba tu selección.');}
      else throw new Error('Elige todos los temas o selecciona algunos.');
      if(!selected.length)throw new Error('Selecciona al menos un tema.');
      if(reuse){
        if(!root||job?.ctx.scope!==ctx.scope)throw new Error('Elige la carpeta de este respaldo.');
        picker=typeof root.requestPermission==='function'?root.requestPermission({mode:'readwrite'}).then(p=>{if(p!=='granted')throw new Error('No se concedió permiso para la carpeta.');return root;}):Promise.resolve(root);
      }else{
        if(typeof window.showDirectoryPicker!=='function')throw new Error('El selector de carpetas no está disponible. Usa Brave o Chrome de escritorio actualizado.');
        picker=window.showDirectoryPicker({id:'telegram-respaldo',mode:'readwrite'});
      }
    }catch(error){message=error.message;publish();return;}
    const turn=++sequence;choosing=true;message='';publish();
    try{
      const chosen=await picker;if(turn!==sequence)return;
      if(problem(ctx))throw new Error('Cambiaste de grupo mientras elegías la carpeta.');
      const store=await B.Store.open(chosen,ctx);if(turn!==sequence)return;
      if(problem(ctx))throw new Error('Cambiaste de grupo antes de iniciar el respaldo.');
      root=store.directory;job=new BackupJob(ctx,opts,selected,store,command.selection==='all');choosing=false;publish();void job.run();
    }catch(error){if(turn===sequence){choosing=false;message=error.name==='AbortError'?'No se eligió una carpeta.':E.errorText(error);publish();}}
  }
  window.TGLocalBackup=Object.freeze({isBusy:()=>choosing||loading||!!job?.busy});
  document.addEventListener('tg-local:command',event=>{
    if(event.target!==document||typeof event.detail!=='string'||event.detail.length>6000)return;
    let cmd;try{cmd=JSON.parse(event.detail);}catch{return;}
    if(cmd.type==='hello'&&/^[a-f0-9]{32}$/.test(cmd.channel)){channel=cmd.channel;publish();if(topics.length)publishTopics();return;}
    if(!channel||cmd.channel!==channel)return;
    if(cmd.type==='backup-status'){publish();if(topicsScope===availability().availableScope&&topics.length)publishTopics();}
    if(cmd.type==='backup-topics-load')void loadTopics();
    if(cmd.type==='backup-select'&&!window.TGLocalBackup.isBusy()&&Array.isArray(cmd.ids)&&cmd.ids.length<=200&&cmd.expectedScope===topicsScope){
      if(cmd.reset)selection={scope:topicsScope,ids:new Set(),ready:false};
      for(const raw of cmd.ids)if(Number.isSafeInteger(raw)&&raw>0)selection.ids.add(raw);
      selection.ready=cmd.done===true;
    }
    if(cmd.type==='backup-start')void start(cmd);
    if(cmd.type==='backup-update')void start(cmd,true);
    if(cmd.type==='backup-pause')job?.pause('Respaldo en pausa. Pulsa Reanudar para continuar.');
    if(cmd.type==='backup-resume'){message='';job?.resume();publish();}
    if(cmd.type==='backup-stop'){
      if(choosing||loading){sequence++;choosing=false;loading=false;loader?.abort();message='Preparación detenida.';}
      job?.stop();publish();
    }
  });
  setInterval(()=>{
    const scope=availability().availableScope;if(scope!==lastScope){lastScope=scope;publish();}
    if(job?.busy&&problem(job.ctx))job.pause(problem(job.ctx));
  },1500);
})();
