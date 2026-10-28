/* Adaptador de lectura para el cliente de Telegram Web K ya iniciado por el usuario. */
(() => {
  'use strict';
  if (window.TGLocalBulk) return;
  const E = globalThis.TGLocalBulkEngine;
  const ID_OFFSET = 0x100000000; // Web K añade este prefijo a los IDs de mensajes de canales.
  const topicTitles = new Map();
  let channel = '', batch = null, choosing = false, preparation = 0, lastAvailability = '';
  let setupMessage = '', selectedMode = 'auto';

  function topicNumber(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0 || id >= ID_OFFSET * 2) return 0;
    return id >= ID_OFFSET ? id - ID_OFFSET : id;
  }
  function topicScope(ctx) { return `${ctx.baseScope}:topic:${ctx.topicId}`; }
  function loadTopicTitle(ctx) {
    if (!ctx.topicId) return;
    const key = topicScope(ctx), cached = topicTitles.get(key);
    if (cached && (cached.pending || Date.now() < cached.retryAt)) return;
    const entry = {title:cached?.title || '', pending:true, retryAt:0};
    topicTitles.set(key, entry);
    const dialogs = ctx.managers.dialogsStorage;
    Promise.resolve().then(() => {
      if (typeof dialogs?.getForumTopicOrReload === 'function') return dialogs.getForumTopicOrReload(ctx.peerId, ctx.threadId);
      return null;
    }).then(topic => {
      if (topicNumber(topic?.id) === ctx.topicId && typeof topic.title === 'string') entry.title = topic.title.trim().slice(0,140);
    }).catch(() => {}).finally(() => {
      entry.pending = false; entry.retryAt = Date.now() + 30000;
      if (topicTitles.size > 100) topicTitles.delete(topicTitles.keys().next().value);
      publish();
    });
  }

  function currentContext() {
    if (!/^\/k(?:\/|$)/.test(location.pathname)) throw new Error('La cola seleccionada y los lotes requieren Telegram Web K. Guardar un vídeo directamente sigue funcionando en Web A.');
    const im = window.appImManager;
    const managers = im?.managers || window.rootScope?.managers;
    const chat = im?.chat;
    const peerId = Number(chat?.peerId);
    const account = Number(window.rootScope?.myId || im?.myId);
    if (!managers?.appMessagesManager || !managers?.appDocsManager) throw new Error('Telegram todavía no está listo. Espera a que cargue tu cuenta y recarga esta pestaña.');
    if (!Number.isSafeInteger(account) || account <= 0 || !Number.isSafeInteger(peerId) || !peerId) throw new Error('Abre primero el grupo o chat que quieras descargar.');
    let title = '', peer;
    try {
      peer = peerId < 0 ? window.apiManagerProxy?.getChat(Math.abs(peerId)) : window.apiManagerProxy?.getUser(peerId);
      title = peer?.title || [peer?.first_name, peer?.last_name].filter(Boolean).join(' ');
    } catch { /* El título no es necesario para identificar el chat. */ }
    title ||= document.querySelector('#column-center .chat-info .peer-title, #column-center .topbar .peer-title')?.textContent?.trim();
    const isForum = peerId < 0 && (chat.isForum === true || peer?.pFlags?.forum === true);
    const threadId = Number(chat.threadId) || 0;
    const topicId = isForum ? topicNumber(threadId) : 0;
    const baseScope = `${account}:${peerId}`;
    const ctx = {account, peerId, managers, title: String(title || `Chat ${peerId}`).slice(0,140), baseScope, scope:baseScope, isForum, threadId, topicId};
    ctx.topicTitle = topicTitles.get(topicScope(ctx))?.title || (topicId === 1 ? 'General' : topicId ? `Tema #${topicId}` : '');
    return ctx;
  }
  function targetContext(mode) {
    const ctx = currentContext();
    if (!['group','topic'].includes(mode)) throw new Error('Selecciona qué vídeos quieres descargar.');
    if (mode === 'topic' && !ctx.topicId) throw new Error('Abre primero un tema del grupo para descargar solo sus vídeos.');
    return {...ctx, mode, scope:mode === 'topic' ? topicScope(ctx) : ctx.baseScope};
  }
  function messagePeer(message, fallback) {
    if (message.peerId) return Number(message.peerId);
    const peer = message.peer_id;
    return peer?.channel_id ? -Number(peer.channel_id) : peer?.chat_id ? -Number(peer.chat_id) : peer?.user_id ? Number(peer.user_id) : fallback;
  }
  function messageTopic(message) {
    const reply = message.reply_to;
    if (reply?.pFlags?.forum_topic || reply?.forum_topic === true) return topicNumber(reply.reply_to_top_id || reply.reply_to_msg_id);
    if (reply?.reply_to_top_id) throw Object.assign(new Error('No se pudo confirmar a qué tema pertenece un vídeo. No se inició su descarga.'), {permanent:true});
    return 1;
  }
  function captureAnchor(ctx) {
    // La misma selección que da «En pantalla», vinculada al visor nativo de Web K.
    const video = window.TGLocalSingle?.getActiveVideo?.();
    const viewer = window.appMediaViewer, whole = video?.closest('.media-viewer-whole.active');
    const mover = video?.closest('.media-viewer-mover.center');
    if (!video || !whole || viewer?.wholeDiv !== whole || !mover || viewer.content?.mover !== mover || mover.matches('.moving, .hiding')) {
      throw new Error('Abre el vídeo en el visor grande de Telegram y espera a que cargue. Después pulsa Actualizar vídeo.');
    }
    const target = viewer.target, peerId = Number(target?.peerId), mid = Number(target?.mid);
    if (!Number.isSafeInteger(peerId) || !peerId || !Number.isSafeInteger(mid) || mid <= 0) throw new Error('No se pudo identificar el mensaje del vídeo abierto. Ciérralo, ábrelo otra vez y pulsa Actualizar vídeo.');
    if (peerId !== ctx.peerId) throw new Error('El vídeo abierto pertenece a otro chat. Abre uno del grupo seleccionado.');
    const message = target.message;
    if (!message || messagePeer(message, peerId) !== peerId ||
        (message.mid && Number(message.mid) !== mid) || (message.id && topicNumber(message.id) !== topicNumber(mid))) {
      throw new Error('Telegram todavía no ha vinculado este vídeo con su mensaje. Espera un momento y pulsa Actualizar vídeo.');
    }
    if (target.index !== undefined && target.index !== null && message.media?.extended_media) throw new Error('Este tipo de álbum no permite fijar el punto de inicio. Abre un vídeo enviado como mensaje normal.');
    if (ctx.mode === 'topic' && messageTopic(message) !== ctx.topicId) throw new Error('El vídeo abierto pertenece a otro tema. Abre uno del tema seleccionado.');
    const item = E.videoDocument({...message, peerId, mid});
    if (!item || !Number.isSafeInteger(item.date) || item.date <= 0) throw new Error('El elemento abierto no es un vídeo con un mensaje y una fecha compatibles.');
    return {...item, token:`${ctx.account}:${peerId}:${mid}:${item.docId}`};
  }
  function anchorAvailability(ctx, mode) {
    try {
      const item = captureAnchor({...ctx, mode});
      return {available:true, token:item.token, name:item.name, date:item.date, messageId:topicNumber(item.mid)};
    } catch (error) { return {available:false, message:error.message}; }
  }
  function availability() {
    try {
      const ctx = currentContext();
      loadTopicTitle(ctx);
      const mode = selectedMode === 'auto' ? (ctx.topicId ? 'topic' : 'group') : selectedMode;
      const canStart = mode === 'group' || !!ctx.topicId;
      return {available:true, canStart, mode, topicAvailable:!!ctx.topicId, availableTopicTitle:ctx.topicTitle,
        availableTopicId:ctx.topicId, availableGroup:ctx.title, availableScope:canStart ? (mode === 'topic' ? topicScope(ctx) : ctx.baseScope) : '',
        anchor:anchorAvailability(ctx, mode), directoryPicker:typeof window.showDirectoryPicker === 'function', setup:canStart ? '' : 'Abre primero un tema del grupo para descargar solo sus vídeos.'};
    } catch (error) {
      return {available:false, canStart:false, mode:selectedMode === 'topic' ? 'topic' : 'group', topicAvailable:false,
        directoryPicker:typeof window.showDirectoryPicker === 'function', availableGroup:'', availableScope:'', setup:error.message};
    }
  }
  function send(type, fields) {
    if (channel && typeof document!=='undefined' && document?.documentElement) document.dispatchEvent(new CustomEvent('tg-local:reply', {detail: JSON.stringify({channel, type, ...fields})}));
  }
  function publish() {
    const data = availability();
    if (!choosing && batch && !batch.busy && batch.scope !== data.availableScope) batch = null;
    const state = batch?.state() || {phase:'idle', busy:false, found:0, saved:0, skipped:0, failed:0, pages:0, current:null, errors:[], completedScan:false};
    const topicTitle = batch?.mode === 'topic' ? topicTitles.get(batch.scope)?.title || batch.topicTitle || '' : '';
    send('bulk-state', {...data, ...state, mode:batch?.mode || data.mode, topicTitle,
      phase: choosing ? 'choosing' : state.phase, busy: choosing || state.busy, message: setupMessage || state.message || data.setup || ''});
  }
  function parseHistoryId(value, defaultPeer) {
    if (typeof value === 'object' && value) return {offsetId:Number(value.mid ?? value.id), offsetPeerId:Number(value.peerId || defaultPeer)};
    if (typeof value === 'string' && /^-?\d+_\d+$/.test(value)) {
      const [peer,mid] = value.split('_'); return {offsetId:Number(mid),offsetPeerId:Number(peer)};
    }
    return {offsetId:Number(value),offsetPeerId:defaultPeer};
  }
  function makeAdapter(ctx) {
    const messages = ctx.managers.appMessagesManager;
    const docs = ctx.managers.appDocsManager;
    const allowedPeers = new Set([ctx.peerId]);
    let migrationChecked = false;
    let adapter;
    const guard = signal => {signal?.throwIfAborted();adapter?.beforeRequest?.();};
    const problem = () => {
      try {
        const now = currentContext();
        if (now.baseScope !== ctx.baseScope) return `La cola está en pausa porque cambiaste de chat o cuenta. Vuelve a «${ctx.title}» y pulsa Reanudar.`;
        if (ctx.mode === 'topic' && now.topicId !== ctx.topicId) return `La cola está en pausa porque cambiaste de tema. Vuelve a «${topicTitles.get(ctx.scope)?.title || ctx.topicTitle}» del grupo «${ctx.title}» y pulsa Reanudar.`;
      } catch { return 'La cola está en pausa porque cambió la sesión. Vuelve a abrir el chat original y pulsa Reanudar.'; }
      return '';
    };
    let refreshTask=null,refreshOwner=null,refreshId='';
    const refresh=(item,signal)=>{
      guard(signal);
      if(refreshTask&&refreshOwner===signal&&refreshId===item.docId)return refreshTask;
      refreshOwner=signal;refreshId=item.docId;
      const pending=(async()=>{
        const updated=await messages.reloadMessage(item.peerId,item.mid,true);guard(signal);
        const doc=updated?.media?.document||await docs.getDoc(item.docId);guard(signal);
        if(!doc||String(doc.id)!==item.docId||(item.size&&Number(doc.size)!==item.size))throw Object.assign(new Error('El vídeo ya no está disponible o cambió en ese mensaje.'),{permanent:true});
        return doc;
      })();
      const owned=pending.finally(()=>{if(refreshTask===owned)refreshTask=null;});
      refreshTask=owned;return owned;
    };
    const topicPage = async (filter, cursor) => {
      guard();
      if (typeof messages.requestHistory !== 'function') throw Object.assign(new Error('Esta versión de Telegram no permite consultar el tema. Recarga Telegram Web K y vuelve a intentarlo.'), {permanent:true});
      // Consulta nativa al servidor con threadId: evita mezclar cachés y migraciones del grupo completo.
      const value = await messages.requestHistory({peerId:ctx.peerId, threadId:ctx.threadId, inputFilter:{_:filter}, query:'', limit:50,
        offsetId:cursor?.offsetId || 0, offsetPeerId:cursor?.offsetPeerId || 0});
      guard();
      if (!Array.isArray(value?.messages) || value.search_flood) throw Object.assign(new Error(value?.search_flood ? 'Telegram está limitando esta búsqueda. Inténtalo más tarde.' : 'Telegram no devolvió un listado de vídeos del tema compatible.'), {permanent:true});
      const list = value.messages.filter(Boolean), items = [];
      let nextCursor = null;
      for (const message of list) {
        const peerId = messagePeer(message, ctx.peerId);
        if (peerId !== ctx.peerId) throw Object.assign(new Error('Telegram devolvió un mensaje de otro chat. Se detuvo el recorrido.'), {permanent:true});
        const mid = Number(message.mid) || (topicNumber(message.id) ? ID_OFFSET + topicNumber(message.id) : 0);
        if (!Number.isSafeInteger(mid) || mid <= 0) throw Object.assign(new Error('Telegram cambió el formato de los mensajes del tema.'), {permanent:true});
        nextCursor = {offsetId:mid, offsetPeerId:peerId};
        const item = E.videoDocument({...message, mid, peerId});
        if (!item) continue;
        if (messageTopic(message) !== ctx.topicId) throw Object.assign(new Error('Telegram devolvió un vídeo de otro tema. Se detuvo el recorrido antes de descargar archivos.'), {permanent:true});
        items.push(item);
      }
      // Una página corta o un contador aproximado no garantizan el final: se pide hasta una página vacía.
      return {items, done:!list.length || value._ === 'messages.messages', nextCursor};
    };
    adapter = {
      contextProblem: problem,
      emptyMessage:ctx.mode === 'topic' ? 'No se encontraron vídeos en el historial accesible de este tema.' : '',
      async listPage(filter, cursor) {
        if (ctx.mode === 'topic') return topicPage(filter, cursor);
        guard();
        if (!migrationChecked) {
          migrationChecked = true;
          try { const migration = await messages.getMigration(ctx.peerId); if (migration?.prev && Number.isSafeInteger(Number(migration.prev))) allowedPeers.add(Number(migration.prev)); } catch { /* Compatibilidad con versiones anteriores. */ }
        }
        guard();
        const value = await messages.getHistory({peerId:ctx.peerId, inputFilter:{_:filter}, query:'', limit:50,
          offsetId:cursor?.offsetId || 0, offsetPeerId:cursor?.offsetPeerId || 0});
        if (!value || value.flood) throw new Error(value?.flood ? 'Telegram está limitando esta búsqueda. Detén la cola y vuelve a intentarlo más tarde.' : 'Telegram no devolvió un listado de mensajes compatible.');
        const history = Array.isArray(value.history) ? value.history : [];
        let list = Array.isArray(value.messages) ? value.messages.filter(Boolean) : null;
        if (!list) {
          guard();
          list = await Promise.all(history.map(id => {
            if (typeof id === 'object') return id;
            const entry = parseHistoryId(id, ctx.peerId);
            if (!allowedPeers.has(entry.offsetPeerId)) throw Object.assign(new Error('Telegram devolvió un mensaje de otro chat. Se detuvo el recorrido.'), {permanent:true});
            return messages.getMessageByPeer(entry.offsetPeerId, entry.offsetId);
          }));
          list = list.filter(Boolean);
        }
        const items = [];
        for (const message of list) {
          const peerId = Number(message.peerId || ctx.peerId);
          if (!allowedPeers.has(peerId)) throw Object.assign(new Error('Telegram devolvió un mensaje de otro chat. Se detuvo el recorrido.'), {permanent:true});
          const item = E.videoDocument({...message,peerId});
          if (item) items.push(item);
        }
        const last = list.at(-1) ?? history.at(-1);
        const nextCursor = last === undefined ? null : parseHistoryId(last,ctx.peerId);
        if (nextCursor && (!Number.isSafeInteger(nextCursor.offsetId) || nextCursor.offsetId <= 0 || !allowedPeers.has(nextCursor.offsetPeerId))) throw new Error('Telegram cambió el formato de paginación. No se puede continuar con seguridad.');
        return {items, done: value.isEnd?.top === true || (!history.length && !list.length), nextCursor};
      },
      async resolve(item) {
        guard();
        const doc = await docs.getDoc(item.docId);
        guard();
        if (!doc || String(doc.id) !== item.docId) return refresh(item);
        return doc;
      },
      async readPart(item, doc, offset, limit, signal) {
        guard(signal);
        try { return await docs.requestDocPart(item.docId,doc.dc_id,offset,limit); }
        catch (error) {
          if (!/FILE_REFERENCE|FILEREF|NO_DOC/.test(E.errorText(error))) throw error;
          guard(signal);const updated = await refresh(item,signal);
          guard(signal);
          if (Number(updated.size) !== Number(doc.size)) throw Object.assign(new Error('El vídeo cambió durante la descarga.'),{permanent:true});
          return docs.requestDocPart(item.docId,updated.dc_id,offset,limit);
        }
      }
    };
    return adapter;
  }

  async function start(command) {
    if (choosing || batch?.busy || window.TGLocalSingle?.isBusy() || window.TGLocalManual?.isBusy() || window.TGLocalBackup?.isBusy()) {
      setupMessage = 'Termina o detén la descarga actual antes de iniciar otra cola.'; publish(); return;
    }
    let ctx, requestedLimits, requestedBoundary = null;
    try {
      requestedLimits = E.limits(command.limits);
      E.parallelism(command.parallelism);
      if (!['asc','desc'].includes(command.order)) throw new Error('Elige el orden de la descarga.');
      ctx = targetContext(command.mode);
      if (command.expectedScope !== ctx.scope) throw new Error('Cambió el grupo o tema desde que se mostró el panel. Comprueba el nombre y vuelve a pulsar Descargar.');
      if (command.start && !['continue','video'].includes(command.start.mode)) throw new Error('Elige un punto de inicio válido.');
      if (command.start?.mode === 'video') {
        const anchor = captureAnchor(ctx);
        if (command.start.expectedAnchor !== anchor.token) throw new Error('Cambió el vídeo abierto desde que se mostró el panel. Comprueba el vídeo indicado y vuelve a pulsar Descargar.');
        requestedBoundary = E.boundary({...anchor, direction:command.order, include:command.start.include});
      }
      if (typeof window.showDirectoryPicker !== 'function') throw new Error('El selector de carpetas está desactivado en este navegador. En Brave, sigue las instrucciones que aparecen debajo.');
    } catch (error) { setupMessage = error.message; publish(); return; }
    selectedMode = ctx.mode;
    const turn = ++preparation;
    choosing = true; setupMessage = ''; batch = null; publish();
    try {
      // Se invoca dentro del clic del usuario y antes del primer await.
      const root = await window.showDirectoryPicker({id:'telegram-videos',mode:'readwrite'});
      if (turn !== preparation) return;
      const now = targetContext(ctx.mode);
      if (now.scope !== ctx.scope) throw new Error('Cambiaste de grupo o tema mientras elegías la carpeta. Vuelve a iniciar desde el que quieras guardar.');
      if (requestedBoundary && captureAnchor(now).token !== command.start.expectedAnchor) throw new Error('Cambiaste de vídeo mientras elegías la carpeta. Comprueba el vídeo de inicio y vuelve a iniciar la cola.');
      ctx.topicTitle = now.topicTitle;
      const folderName = `Telegram_${ctx.account}_${ctx.peerId}` + (ctx.mode === 'topic' ? `_Tema_${ctx.topicId}` : '');
      const directory = root.name === folderName ? root : await root.getDirectoryHandle(folderName,{create:true});
      if (turn !== preparation) return;
      const progress = await window.TGLocalProgress.Progress.open(directory, ctx.scope);
      if (turn !== preparation) return;
      const startBoundary = requestedBoundary || (command.continueProgress !== false ? progress.boundary : null);
      batch = new E.Batch({adapter:makeAdapter(ctx),directory,scope:ctx.scope,title:ctx.title, limits:requestedLimits,parallelism:command.parallelism,
        order:requestedBoundary ? command.order : command.continueProgress !== false && (progress.done.size || progress.boundary) ? progress.order : command.order,
        boundary:startBoundary, verifyBoundary:!!requestedBoundary, progress, continueProgress:command.continueProgress !== false,
        onState:()=>publish(),onRecord:record=>send('bulk-record',{record})});
      batch.mode = ctx.mode; batch.topicTitle = ctx.mode === 'topic' ? ctx.topicTitle : '';
      batch.rootFolder = root.name === folderName ? '' : root.name;
      choosing = false; publish();
      void batch.run();
    } catch (error) {
      if (turn !== preparation) return;
      setupMessage = error.name === 'AbortError' ? 'No se eligió una carpeta.' : E.errorText(error);
    } finally { if (turn === preparation) { choosing = false; publish(); } }
  }

  async function resume(retryOnly = false, command = {}, next = false) {
    if (!batch || choosing) return;
    const target = batch;
    if ((retryOnly || next) && (target.busy || window.TGLocalSingle?.isBusy() || window.TGLocalManual?.isBusy() || window.TGLocalBackup?.isBusy())) return;
    const reason = target.adapter.contextProblem();
    if (reason) { setupMessage = reason; publish(); return; }
    setupMessage = '';
    try {
      const requestedLimits = retryOnly || next ? E.limits(command.limits) : null;
      const parallel=E.parallelism(command.parallelism);
      if (next && command.continueProgress === false) throw new Error('Para iniciar de nuevo, usa el botón Elegir carpeta e iniciar otra cola.');
      if ((retryOnly || next) && command.expectedScope !== target.scope) throw new Error('Vuelve al grupo o tema original para continuar esta cola.');
      // El permiso se solicita desde el botón, también al reintentar tras una pausa larga.
      if (typeof target.directory.requestPermission === 'function') {
        const permission = await target.directory.requestPermission({mode:'readwrite'});
        if (permission !== 'granted') throw new Error('No se concedió permiso para escribir en la carpeta.');
      }
      if (target !== batch) return;
      const changed = target.adapter.contextProblem();
      if (changed) throw new Error(changed);
      if(retryOnly||next)target.parallelism=parallel;
      if (retryOnly) { if (!target.busy && target.failed) { target.limits = requestedLimits; void target.run(true); } }
      else if (next) { if (target.state().canNext) void target.next(requestedLimits); }
      else target.resume();
    } catch (error) { setupMessage = E.errorText(error); publish(); }
  }

  window.TGLocalBulk = Object.freeze({isBusy:()=>choosing || !!batch?.busy,
    backupContext:()=>currentContext(),
    captureOpenVideo:()=>{const ctx=currentContext();return {account:ctx.account,item:captureAnchor({...ctx,mode:'group'}),managers:ctx.managers};},
    accountContext:()=>{const ctx=currentContext();return {account:ctx.account,managers:ctx.managers};}
  });
  document.addEventListener('tg-local:command', event => {
    if (event.target !== document || typeof event.detail !== 'string' || event.detail.length > 6000) return;
    let message; try { message = JSON.parse(event.detail); } catch { return; }
    if (message.type === 'hello' && typeof message.channel === 'string' && /^[a-f0-9]{32}$/.test(message.channel)) { channel=message.channel; publish(); return; }
    if (!channel || message.channel !== channel) return;
    if (message.type === 'bulk-status') {
      // Al abrir el panel se fija la elección mostrada; salir de un tema nunca la amplía a todo el grupo.
      if (selectedMode === 'auto') { try { selectedMode = currentContext().topicId ? 'topic' : 'group'; } catch { /* publish muestra el motivo. */ } }
      publish();
    }
    if (message.type === 'bulk-mode' && ['group','topic'].includes(message.mode) && !choosing && !batch?.busy) {
      selectedMode = message.mode; batch = null; setupMessage = ''; publish();
    }
    if (message.type === 'bulk-start') void start(message);
    if (message.type === 'bulk-pause') batch?.pause();
    if (message.type === 'bulk-resume') void resume();
    if (message.type === 'bulk-retry') void resume(true, message);
    if (message.type === 'bulk-next') void resume(false, message, true);
    if (message.type === 'bulk-stop') {
      if (choosing) { preparation++; choosing=false; setupMessage='Selección cancelada.'; }
      batch?.stop(); publish();
    }
  });
  setInterval(() => {
    const info = availability(), text=JSON.stringify(info);
    if (lastAvailability !== text) { lastAvailability=text; if (!batch?.busy && batch && batch.scope !== info.availableScope) batch=null; publish(); }
    if (batch?.busy && batch.adapter.contextProblem()) batch.pause(batch.adapter.contextProblem());
  },2000);
})();
