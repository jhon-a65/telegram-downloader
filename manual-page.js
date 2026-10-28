/* Selección explícita: identidades de mensajes, nunca URLs temporales del reproductor. */
(() => {
  'use strict';
  if (window.TGLocalManual) return;
  const E=window.TGLocalBulkEngine, queue=new Map();
  let channel='', choosing=false, preparing=0, batch=null, directory=null, progress=null, account=0, message='', revision=0;
  let lastAnchor='', pendingPersistence=0, persistenceError='';
  const key=item=>`${item.account}:${item.docId}`;
  function valid(raw) {
    if (!raw || !Number.isSafeInteger(raw.account) || raw.account<=0 || !/^-?\d{1,24}$/.test(String(raw.docId)) ||
      !Number.isSafeInteger(raw.mid) || raw.mid<=0 || !Number.isSafeInteger(raw.peerId) || !raw.peerId ||
      !Number.isSafeInteger(raw.size) || raw.size<=0 || !Number.isSafeInteger(raw.date) || raw.date<=0 ||
      typeof raw.name!=='string' || raw.name.length>200 || !/\.(mp4|webm|mov|mkv|m4v|avi|mpg|mpeg|3gp|ts|wmv|flv)$/i.test(raw.name) || !raw.name.endsWith(`__tg_${raw.docId}${raw.name.slice(raw.name.lastIndexOf('.'))}`) ||
      /[\\/:*?"<>|\u0000-\u001f]/.test(raw.name)) return null;
    return {account:raw.account,docId:String(raw.docId),mid:raw.mid,peerId:raw.peerId,size:raw.size,date:raw.date,name:raw.name,
      mime:String(raw.mime || 'video/mp4').slice(0,100),status:raw.status==='saved'?'saved':'pending',addedAt:Number(raw.addedAt)||Date.now()};
  }
  function send(type,data={}) {
    if(channel && typeof document!=='undefined' && document?.documentElement)document.dispatchEvent(new CustomEvent('tg-local:reply',{detail:JSON.stringify({channel,type,...data})}));
  }
  function persist(operation,items=[],keys=[]) {
    if(keys.length>100){for(let n=0;n<keys.length;n+=100)persist(operation,[],keys.slice(n,n+100));return;}
    const id=++pendingPersistence;
    send('manual-persist',{id,operation,items,keys});
  }
  function anchor() {
    try {
      const selected=window.TGLocalBulk.captureOpenVideo();
      const item=valid({...selected.item,account:selected.account});
      if(!item)throw new Error('No se pudo confirmar el tamaño del vídeo abierto. Espera a que cargue.');
      return {available:true,token:selected.item.token,name:item.name,key:key(item),account:selected.account};
    } catch(error) { return {available:false,message:error.message}; }
  }
  function state() {
    let currentAccount=0;
    try {currentAccount=window.TGLocalBulk.accountContext().account;} catch{}
    const entries=[...queue.values()].filter(item=>item.account===currentAccount);
    const result=batch?.state() || {phase:'idle',busy:false,batchSaved:0,current:null};
    return {...result,busy:choosing||result.busy,phase:choosing?'choosing':result.phase,revision,account:currentAccount,
      pending:entries.filter(item=>item.status!=='saved').length,saved:entries.filter(item=>item.status==='saved').length,
      items:entries.slice(0,100).map(item=>({key:key(item),name:item.name,size:item.size,status:item.status})),
      total:entries.length,anchor:anchor(),folder:directory?.name || '',
      message:persistenceError || (result.busy ? result.message || message : message || result.message) || 'Añade los vídeos que quieras. Se guardarán en el orden de selección.',
      canStart:entries.some(item=>item.status!=='saved'),hasDirectory:!!directory&&account===currentAccount};
  }
  function publish() {send('manual-state',state());}
  function add(command) {
    try {
      if(persistenceError)throw new Error(persistenceError);
      const selected=window.TGLocalBulk.captureOpenVideo();
      if(command.expectedAnchor!==selected.item.token)throw new Error('Cambió el vídeo abierto. Comprueba el nombre y vuelve a pulsar Añadir.');
      const item=valid({...selected.item,account:selected.account});
      if(!item)throw new Error('El vídeo todavía no tiene un tamaño compatible. Espera a que cargue.');
      if(queue.has(key(item))) {message='Este vídeo ya está en tu selección.';publish();return;}
      if(queue.size>=10000)throw new Error('La cola llegó a 10000 vídeos. Quita los completados antes de añadir más.');
      queue.set(key(item),item);revision++;persist('upsert',[item]);
      message='Añadido a la cola. Puedes abrir el siguiente vídeo y seguir seleccionando.';publish();
    } catch(error){message=error.message;publish();}
  }
  function makeAdapter(ctx,items) {
    const docs=ctx.managers.appDocsManager,messages=ctx.managers.appMessagesManager;
    let adapter;
    const guard=signal=>{signal?.throwIfAborted();adapter.beforeRequest?.();};
    let refreshTask=null,refreshOwner=null,refreshId='';
    const refresh=(item,signal)=>{
      guard(signal);
      if(refreshTask&&refreshOwner===signal&&refreshId===item.docId)return refreshTask;
      refreshOwner=signal;refreshId=item.docId;
      const pending=(async()=>{
        const updated=await messages.reloadMessage(item.peerId,item.mid,true);guard(signal);
        const doc=updated?.media?.document;
        if(!doc||String(doc.id)!==item.docId||Number(doc.size)!==item.size)throw Object.assign(new Error('El vídeo seleccionado cambió o ya no está disponible.'),{permanent:true});
        return doc;
      })();
      const owned=pending.finally(()=>{if(refreshTask===owned)refreshTask=null;});
      refreshTask=owned;return owned;
    };
    adapter={
      contextProblem:()=>{
        try {if(window.TGLocalBulk.accountContext().account===ctx.account)return ''; }catch{}
        return 'La cola está en pausa porque cambió la cuenta. Abre un chat de la cuenta original y pulsa Reanudar.';
      },
      listPage:async filter=>({items:filter===E.FILTERS[0]?items:[],done:true}),
      resolve:async item=>{guard();const doc=await docs.getDoc(item.docId);guard();return doc&&String(doc.id)===item.docId?doc:refresh(item);},
      readPart:async(item,doc,offset,limit,signal)=>{
        guard(signal);
        try{return await docs.requestDocPart(item.docId,doc.dc_id,offset,limit);}
        catch(error){
          if(!/FILE_REFERENCE|FILEREF|NO_DOC/.test(E.errorText(error)))throw error;
          guard(signal);const renewed=await refresh(item,signal);guard(signal);return docs.requestDocPart(item.docId,renewed.dc_id,offset,limit);
        }
      }
    };return adapter;
  }
  async function start(command,reuse=false) {
    if(choosing||batch?.busy||window.TGLocalBulk.isBusy()||(window.TGLocalSingle.isBusy() || window.TGLocalBackup?.isBusy())) {message='Termina o detén la otra descarga antes de iniciar esta cola.';publish();return;}
    let ctx,limits,rootPromise;
    try{
      if(persistenceError)throw new Error(persistenceError);
      if(typeof window.showDirectoryPicker!=='function'&&!reuse)throw new Error('Activa el selector de carpetas en Brave como se indica en Grupo / tema.');
      ctx=window.TGLocalBulk.accountContext();
      if(![10,20,40,60,100,null].includes(command.limits?.maxFiles))throw new Error('Elige 10, 20, 40, 60, 100 o Todos.');
      limits=E.limits(command.limits);E.parallelism(command.parallelism);
      if(![...queue.values()].some(item=>item.account===ctx.account&&item.status!=='saved'))throw new Error('Añade primero algún vídeo a la cola.');
      if(reuse&&(!directory||account!==ctx.account))throw new Error('Elige de nuevo la carpeta para esta cuenta.');
      // Ambos permisos se solicitan desde el clic, antes de esperar cualquier lectura.
      rootPromise=reuse ? (directory.requestPermission?directory.requestPermission({mode:'readwrite'}).then(value=>{if(value!=='granted')throw new Error('No se concedió permiso para la carpeta.');return directory;}):Promise.resolve(directory))
        : window.showDirectoryPicker({id:'telegram-cola-manual',mode:'readwrite'});
    }catch(error){message=error.message;publish();return;}
    const turn=++preparing;choosing=true;message='';publish();
    try{
      const root=await rootPromise;
      if(turn!==preparing)return;
      if(window.TGLocalBulk.accountContext().account!==ctx.account)throw new Error('Cambió la cuenta mientras elegías la carpeta.');
      const folder=`Telegram_${ctx.account}_Cola`;
      const chosen=reuse||root.name===folder?root:await root.getDirectoryHandle(folder,{create:true});
      const record=await window.TGLocalProgress.Progress.open(chosen,`${ctx.account}:queue`);
      if(turn!==preparing)return;
      directory=chosen;progress=record;account=ctx.account;
      const selected=[...queue.values()].filter(item=>item.account===ctx.account&&item.status!=='saved');
      // Instantánea por tanda: los añadidos durante la descarga quedan para la siguiente.
      for(const item of selected)if(progress.has(item)){item.status='saved';persist('upsert',[item]);revision++;}
      const pending=selected.filter(item=>item.status!=='saved').map(item=>({...item}));
      const target=new E.Batch({adapter:makeAdapter(ctx,pending),directory,scope:`${ctx.account}:queue`,title:'Mi cola seleccionada',
        progress,limits,parallelism:command.parallelism,continueProgress:true,selectionOrder:true,pageDelay:0,
        onState:()=>{
          if(batch!==target)return;
          if(!target.busy)message='';
          for(const saved of target.files.values()){
            const item=queue.get(`${ctx.account}:${saved.docId}`);
            if(item&&item.status!=='saved'&&progress.has(saved)&&!progress.dirty){item.status='saved';revision++;persist('upsert',[item]);}
          }
          publish();
        }});
      batch=target;choosing=false;message='';publish();void target.run();
    }catch(error){if(turn===preparing){choosing=false;message=error.name==='AbortError'?'Selección de carpeta cancelada.':E.errorText(error);publish();}}
  }
  window.TGLocalManual=Object.freeze({isBusy:()=>choosing||!!batch?.busy});
  document.addEventListener('tg-local:command',event=>{
    if(event.target!==document||typeof event.detail!=='string'||event.detail.length>6000)return;
    let cmd;try{cmd=JSON.parse(event.detail);}catch{return;}
    if(cmd.type==='hello'&&/^[a-f0-9]{32}$/.test(cmd.channel)){channel=cmd.channel;publish();return;}
    if(!channel||cmd.channel!==channel)return;
    if(cmd.type==='manual-status')publish();
    if(cmd.type==='manual-add')add(cmd);
    if(cmd.type==='manual-restore'&&Array.isArray(cmd.items)&&cmd.items.length<=10){
      for(const raw of cmd.items){const item=valid(raw);if(item&&!queue.has(key(item))&&queue.size<10000)queue.set(key(item),item);}
      revision++;publish();
    }
    if(cmd.type==='manual-persist-result'&&cmd.ok!==true){persistenceError='No se pudo guardar la selección en el navegador. Detén la cola y comprueba el almacenamiento de la extensión.';batch?.pause(persistenceError);publish();}
    if(cmd.type==='manual-remove'&&typeof cmd.key==='string'){
      const item=queue.get(cmd.key);
      if(item&&batch?.busy&&batch.files.has(item.docId)){message='Detén la tanda antes de quitar uno de sus vídeos.';publish();return;}
      if(queue.delete(cmd.key)){revision++;persist('remove',[],[cmd.key]);message='Vídeo quitado de la selección.';publish();}
    }
    if(cmd.type==='manual-clear-done'){
      const keys=[...queue].filter(([,item])=>item.status==='saved').map(([k])=>k);
      for(const k of keys)queue.delete(k);revision++;persist('remove',[],keys);publish();
    }
    if(cmd.type==='manual-start')void start(cmd);
    if(cmd.type==='manual-next')void start(cmd,true);
    if(cmd.type==='manual-pause')batch?.pause('Tanda en pausa. Puedes seguir añadiendo vídeos.');
    if(cmd.type==='manual-resume'){if(persistenceError){publish();return;}message='';if(!window.TGLocalBulk.isBusy()&&!(window.TGLocalSingle.isBusy() || window.TGLocalBackup?.isBusy()))batch?.resume();publish();}
    if(cmd.type==='manual-stop'){preparing++;choosing=false;message='Tanda detenida. El vídeo incompleto sigue pendiente y se reinicia al continuar.';batch?.stop();publish();}
  });
  setInterval(()=>{
    const text=JSON.stringify(anchor());
    if(text!==lastAnchor){lastAnchor=text;publish();}
    if(batch?.busy&&batch.adapter.contextProblem())batch.pause(batch.adapter.contextProblem());
  },1000);
})();
