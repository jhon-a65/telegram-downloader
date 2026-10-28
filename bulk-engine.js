/* Descubrimiento paginado y cola secuencial. No contiene credenciales ni una API externa. */
(() => {
  'use strict';
  const PART_SIZE = 512 * 1024;
  const FILTERS = ['inputMessagesFilterVideo', 'inputMessagesFilterDocument', 'inputMessagesFilterRoundVideo'];

  function errorText(error) {
    return String(error?.type || error?.message || error?.name || error || 'Error desconocido').slice(0, 400);
  }
  const abortListeners=new WeakMap();
  function listenAbort(signal,callback){
    if(!signal)return ()=>{};
    let group=abortListeners.get(signal);
    if(!group){
      group={callbacks:new Set(),dispatch:null};
      group.dispatch=()=>{for(const fn of [...group.callbacks])fn();group.callbacks.clear();if(abortListeners.get(signal)===group)abortListeners.delete(signal);};
      abortListeners.set(signal,group);signal.addEventListener('abort',group.dispatch,{once:true});
    }
    group.callbacks.add(callback);
    let subscribed=true;
    return ()=>{if(!subscribed)return;subscribed=false;group.callbacks.delete(callback);if(!group.callbacks.size){signal.removeEventListener('abort',group.dispatch);if(abortListeners.get(signal)===group)abortListeners.delete(signal);}};
  }
  function parallelism(value=8){
    if(![1,4,8,16].includes(value))throw new Error('Elige un modo de descarga válido.');
    return value;
  }
  function stopError() { return new DOMException('Detenido', 'AbortError'); }
  function wait(ms,signal){
    return new Promise((resolve,reject)=>{
      signal?.throwIfAborted();let off=()=>{};
      const timer=setTimeout(()=>{off();resolve();},ms);
      off=listenAbort(signal,()=>{clearTimeout(timer);off();reject(signal.reason||stopError());});
    });
  }
  function cancellable(promise,signal,timeout=120000){
    return new Promise((resolve,reject)=>{
      signal?.throwIfAborted();let off=()=>{};
      const clean=()=>{clearTimeout(timer);off();};
      const timer=setTimeout(()=>{clean();reject(new Error('Telegram tardó demasiado en responder.'));},timeout);
      off=listenAbort(signal,()=>{clean();reject(signal.reason||stopError());});
      Promise.resolve(promise).then(value=>{clean();resolve(value);},error=>{clean();reject(error);});
    });
  }
  function component(value, max = 90) {
    let text = String(value || '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
      .replace(/[\u202a-\u202e\u2066-\u2069]/g, '').replace(/^\.+|[. ]+$/g, '').trim();
    if (!text) text = 'Telegram';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(text)) text = '_' + text;
    return text.slice(0, max).replace(/[. ]+$/g, '') || 'Telegram';
  }
  function videoDocument(message) {
    const media = message?.media;
    const doc = media?.document;
    if (!doc || (doc._ && doc._ !== 'document')) return null;
    const attrs = Array.isArray(doc.attributes) ? doc.attributes : [];
    if (doc.type === 'gif' || attrs.some(a => a._ === 'documentAttributeAnimated')) return null;
    const originalName = doc.file_name || attrs.find(a => a._ === 'documentAttributeFilename')?.file_name || '';
    const mime = String(doc.mime_type || '');
    const video = mime.startsWith('video/') || ['video', 'round'].includes(doc.type) ||
      attrs.some(a => a._ === 'documentAttributeVideo') || /\.(mp4|webm|mov|mkv|m4v|avi|mpg|mpeg|3gp|ts|wmv|flv)$/i.test(originalName);
    const id = String(doc.id ?? '');
    if (!video || !/^-?\d{1,24}$/.test(id)) return null;
    const mid = Number(message.mid ?? message.id);
    const peerId = Number(message.peerId);
    if (!Number.isSafeInteger(mid) || mid <= 0 || !Number.isSafeInteger(peerId) || !peerId) return null;
    const safe = globalThis.TGLocalCore.filename(originalName || 'Telegram-video', mime);
    const dot = safe.lastIndexOf('.');
    const name = `${safe.slice(0,dot).slice(0,110)}__tg_${id}${safe.slice(dot)}`;
    return {docId: id, mid, peerId, size: Number(doc.size) || 0, mime,
      name, date: Number(message.date) || 0};
  }
  function byteArray(part) {
    const value = part?.bytes ?? part;
    if (value instanceof Uint8Array) return value;
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (Array.isArray(value) && value.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) return Uint8Array.from(value);
    throw Object.assign(new Error('Telegram devolvió una parte de vídeo incompatible.'), {permanent: true});
  }

  function limits(value = {}) {
    const maxFiles = value.maxFiles ?? null, maxBytes = value.maxBytes ?? null;
    if (maxFiles !== null && (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 10000)) throw new Error('Elige Todos o una cantidad de 1 a 10000 vídeos por tanda.');
    if (maxBytes !== null && (!Number.isSafeInteger(maxBytes) || maxBytes < 1)) throw new Error('El tope de tamaño debe ser positivo o quedar vacío.');
    return {maxFiles, maxBytes};
  }

  function boundary(value) {
    if (value == null) return null;
    if (!Number.isSafeInteger(value.peerId) || !value.peerId || !Number.isSafeInteger(value.mid) || value.mid <= 0 ||
        !/^-?\d{1,24}$/.test(String(value.docId)) || !Number.isSafeInteger(value.date) || value.date <= 0 ||
        typeof value.name !== 'string' || !value.name || value.name.length > 200 ||
        !['asc','desc'].includes(value.direction) || typeof value.include !== 'boolean') throw new Error('El punto de inicio guardado no es válido. No se inició la descarga.');
    return {peerId:value.peerId, mid:value.mid, docId:String(value.docId), date:value.date, name:value.name, direction:value.direction, include:value.include};
  }
  function comparePosition(a, b) {
    return (a.date - b.date) || (a.mid - b.mid) || (a.peerId - b.peerId);
  }
  function inRange(item, start) {
    if (!start) return true;
    const difference = comparePosition(item, start);
    return difference === 0 ? start.include : start.direction === 'asc' ? difference > 0 : difference < 0;
  }

  // Ventana acotada de partes del MISMO archivo. Solo el consumidor escribe, en orden.
  class PartWindow{
    constructor(batch,item,doc,size){
      Object.assign(this,{batch,item,doc,size});this.jobs=new Map();this.next=0;this.failure=null;
      this.controller=new AbortController();
      batch.abort.signal.throwIfAborted();
      this.off=listenAbort(batch.abort.signal,()=>this.controller.abort(batch.abort.signal.reason));
    }
    fill(){
      const signal=this.controller.signal;signal.throwIfAborted();
      while(this.next<this.size&&this.jobs.size<this.batch.parallelism){
        const offset=this.next;this.next+=PART_SIZE;
        const task=this.batch.retry(()=>this.batch.adapter.readPart(this.item,this.doc,offset,PART_SIZE,signal),signal)
          .then(result=>{
            signal.throwIfAborted();const bytes=byteArray(result),expected=Math.min(PART_SIZE,this.size-offset);
            if(bytes.byteLength!==expected)throw Object.assign(new Error('Una parte del vídeo llegó incompleta o con un tamaño inesperado.'),{permanent:true});
            return {bytes};
          }).catch(error=>{
            if(!this.failure)this.failure=error;
            if(!signal.aborted)this.controller.abort(error);
            return {error};
          });
        this.jobs.set(offset,task);
      }
    }
    async take(offset){
      if(this.failure)throw this.failure;
      this.fill();const job=this.jobs.get(offset);
      if(!job)throw new Error('No se pudo confirmar el orden de las partes del vídeo.');
      const result=await job;this.jobs.delete(offset);
      if(this.failure)throw this.failure;if(result.error)throw result.error;
      return result.bytes;
    }
    async close(){
      if(!this.controller.signal.aborted)this.controller.abort(stopError());
      this.off();await Promise.allSettled([...this.jobs.values()]);this.jobs.clear();
    }
  }

  class Batch {
    constructor({adapter, directory, scope, title, onState = () => {}, onRecord = () => {}, pageDelay = 150, limits:requestedLimits, order = 'asc', progress = null, continueProgress = true, boundary:requestedBoundary = null, verifyBoundary = false, selectionOrder = false, parallelism:requestedParallelism = 8}) {
      Object.assign(this, {adapter, directory, scope, title, onState, onRecord, pageDelay, progress, continueProgress});
      this.parallelism=parallelism(requestedParallelism);this.pausePromise=null;
      this.selectionOrder = selectionOrder;
      this.boundary = boundary(requestedBoundary); this.verifyBoundary = verifyBoundary; this.anchorFound = false;
      this.limits = limits(requestedLimits); this.order = this.boundary?.direction || (order === 'desc' ? 'desc' : 'asc');
      this.batchIndex = progress?.batchIndex || 0; this.batchSaved = 0; this.batchBytes = 0; this.limitReason = ''; this.blocked = null;
      this.files = new Map();
      this.abort = new AbortController();
      this.stage = 'idle'; this.paused = false; this.running = false;
      this.completedScan = false; this.pages = 0;
      this.totalBytes = 0;
      this.saved = 0; this.skipped = 0; this.failed = 0;
      this.errors = []; this.message = ''; this.current = null;
      this.lastProgress = 0;
      this.adapter.beforeRequest = () => {
        this.abort.signal.throwIfAborted();
        const reason = this.adapter.contextProblem?.();
        if (reason && !this.paused) this.pause(reason);
        if (this.paused) throw Object.assign(new Error('La solicitud se reanudará con la cola.'), {defer:true});
      };
    }
    get busy() { return this.running; }
    state() {
      const pending = [...this.files.values()].filter(item => item.status === 'pending').length;
      return {phase: this.paused && this.running ? 'paused' : this.stage, busy: this.running,
        scope: this.scope, group: this.title, folder: this.directory.name || '', rootFolder: this.rootFolder || '', found: this.files.size,
        saved: this.saved, skipped: this.skipped, failed: this.failed, pages: this.pages,
        totalBytes: this.totalBytes, parallelism:this.parallelism, limits:{...this.limits}, order:this.order, boundary:this.boundary ? {...this.boundary} : null, batchIndex:this.batchIndex,
        batchSaved:this.batchSaved, batchBytes:this.batchBytes, pending, limitReason:this.limitReason, blocked:this.blocked,
        canNext:this.completedScan && pending > 0 && !this.running, progressCount:this.progress?.committedCount || 0, lastCompleted:this.progress?.committedLast || '',
        completedScan: this.completedScan, message: this.message, current: this.current ? {...this.current} : null,
        errors: this.errors.slice(-8), canRetry: this.completedScan && this.failed > 0 && !this.running};
    }
    publish() { this.onState(this.state()); }
    pause(message = 'En pausa. La parte que esté en curso puede terminar antes de detenerse.') {
      if (!this.running) return;
      this.paused = true; this.message = message; this.publish();
    }
    resume() {
      if (!this.running || !this.paused) return false;
      const reason = this.adapter.contextProblem?.();
      if (reason) { this.message = reason; this.publish(); return false; }
      this.paused = false; this.message = ''; this.wake?.(); this.publish(); return true;
    }
    stop() {
      if (!this.running) return;
      this.stage = 'stopping'; this.paused = false; this.abort.abort(stopError()); this.wake?.(); this.publish();
    }
    async checkpoint(signal = this.abort.signal) {
      this.abort.signal.throwIfAborted();
      signal.throwIfAborted();
      const reason = this.adapter.contextProblem?.();
      if (reason && !this.paused) this.pause(reason);
      while (this.paused) {
        if(!this.pausePromise)this.pausePromise=new Promise(resolve=>{this.wake=()=>{this.pausePromise=null;this.wake=null;resolve();};});
        await cancellable(this.pausePromise, signal, 24 * 60 * 60 * 1000);
        signal.throwIfAborted();
        if (this.adapter.contextProblem?.()) { this.paused = true; continue; }
      }
      signal.throwIfAborted();
    }
    async retry(task,signal=this.abort.signal,beforeAttempt) {
      for (let attempt = 0; ; attempt++) {
        await this.checkpoint(signal);
        await beforeAttempt?.();
        await this.checkpoint(signal);
        try { return await cancellable(Promise.resolve().then(task), signal); }
        catch (error) {
          signal.throwIfAborted();
          if (error?.defer) { attempt--; await this.checkpoint(signal); continue; }
          const text = errorText(error);
          const flood = /FLOOD(?:_PREMIUM)?_WAIT_?(\d+)/i.exec(text);
          const permanent = error?.permanent || /AUTH_|SESSION_|CHANNEL_PRIVATE|CHAT_ADMIN_REQUIRED|DOCUMENT_INVALID|FILE_ID_INVALID|NO_DOC/i.test(text);
          if (permanent || attempt >= 2) throw error;
          const milliseconds = flood ? Number(flood[1]) * 1000 + 500 : 500 * (attempt + 1);
          this.message = flood ? `Telegram pide esperar ${Number(flood[1])} segundos. Puedes pausar o detener la cola.` : 'Reintentando una solicitud a Telegram…';
          this.publish();
          // Esperas cortas permiten atender pausa, cambio de chat y cancelación.
          let remaining = milliseconds;
          while (remaining > 0) { await this.checkpoint(signal); const step = Math.min(remaining, 500); await wait(step, signal); remaining -= step; }
          this.message = ''; this.publish();
        }
      }
    }
    async discover() {
      this.stage = 'scanning'; this.publish();
      for (const filter of FILTERS) {
        let cursor = null;
        const seenCursors = new Set();
        while (true) {
          const page = await this.retry(() => this.adapter.listPage(filter, cursor));
          await this.checkpoint();
          this.pages++;
          if (!Array.isArray(page.items)) throw new Error('Telegram cambió el formato del listado de vídeos.');
          for (const item of page.items) {
            if (!item?.docId) continue;
            if (this.boundary && (!Number.isSafeInteger(item.date) || item.date <= 0)) throw new Error('Un vídeo del listado no tiene una fecha válida. No se puede confirmar su posición respecto al punto de inicio.');
            if (this.boundary && item.peerId === this.boundary.peerId && item.mid === this.boundary.mid) {
              if (String(item.docId) !== this.boundary.docId || item.date !== this.boundary.date) throw new Error('El vídeo de inicio cambió durante la búsqueda. Abre de nuevo ese vídeo y vuelve a iniciar la cola.');
              this.anchorFound = true;
            }
            // Filtrar ANTES de deduplicar: una copia fuera del tramo no debe ocultar otra dentro.
            if (!inRange(item, this.boundary)) continue;
            if (this.files.has(item.docId)) {
              const old = this.files.get(item.docId), difference = comparePosition(item, old);
              if (this.order === 'asc' ? difference < 0 : difference > 0) this.files.set(item.docId, {...item, status:'pending'});
              continue;
            }
            this.files.set(item.docId, {...item, status: 'pending'});
            if (Number.isSafeInteger(item.size) && item.size > 0) this.totalBytes += item.size;
          }
          this.publish();
          if (page.done) break;
          const token = JSON.stringify(page.nextCursor);
          if (!page.nextCursor || seenCursors.has(token) || token === JSON.stringify(cursor)) {
            throw new Error('El listado dejó de avanzar. No se puede confirmar que estén todos los vídeos. Vuelve a intentarlo.');
          }
          seenCursors.add(token); cursor = page.nextCursor;
          if (this.pageDelay) await wait(this.pageDelay, this.abort.signal);
        }
      }
      if (this.boundary && this.verifyBoundary && !this.anchorFound) throw new Error('No se encontró el vídeo abierto en el grupo o tema elegido. No se descargó ningún vídeo. Abre uno de ese tema y vuelve a intentarlo.');
      const direction = this.order === 'asc' ? 1 : -1;
      if (!this.selectionOrder) this.files = new Map([...this.files].sort(([,a],[,b]) => direction * (comparePosition(a,b) || a.docId.localeCompare(b.docId))));
      if (this.continueProgress && this.progress) for (const item of this.files.values()) {
        if (this.progress.has(item)) { item.status = 'skipped'; this.skipped++; }
      }
      this.completedScan = true;
    }
    async save(item) {
      let writer = null, parts=null;
      try {
        await this.checkpoint();
        const doc = await this.retry(() => this.adapter.resolve(item));
        await this.checkpoint();
        const size = Number(doc?.size ?? item.size);
        if (!Number.isSafeInteger(size) || size <= 0) throw Object.assign(new Error('No se conoce un tamaño válido para este vídeo.'), {permanent: true});
        if (item.size && size !== item.size) throw Object.assign(new Error('El tamaño del vídeo cambió durante el listado.'), {permanent: true});
        item.size = size;
        this.current = {name: item.name, bytes: 0, total: size}; this.publish();
        try {
          const existing = await this.directory.getFileHandle(item.name);
          const file = await existing.getFile();
          if (file.size === size) {
            item.status = 'skipped'; this.skipped++;
            await this.record(item); this.publish(); return 'skipped';
          }
        } catch (error) { if (error.name !== 'NotFoundError') throw error; }
        if (this.continueProgress && this.progress?.has(item)) {
          item.status = 'skipped'; this.skipped++; this.publish(); return 'skipped';
        }
        if (this.limits.maxBytes !== null && size > this.limits.maxBytes - this.batchBytes) {
          this.limitReason = size > this.limits.maxBytes ? 'file-too-large' : 'bytes';
          this.blocked = {name:item.name, size}; return 'limited';
        }
        await this.checkpoint();
        const handle = await this.directory.getFileHandle(item.name, {create: true});
        writer = await handle.createWritable({keepExistingData: false});
        let offset=0;const started=performance.now();
        parts=new PartWindow(this,item,doc,size);
        while(offset<size){
          await this.checkpoint();
          const bytes=await parts.take(offset);
          await this.checkpoint();
          await writer.write(bytes);offset+=bytes.byteLength;
          this.current.bytes=offset;
          const elapsed=performance.now()-started;this.current.speed=elapsed>=1000?offset*1000/elapsed:0;
          if(performance.now()-this.lastProgress>100||offset===size){this.lastProgress=performance.now();this.publish();}
        }
        await parts.close();parts=null;
        await this.checkpoint();
        await writer.close(); writer = null;
        item.status = 'saved'; this.saved++; this.batchSaved++; this.batchBytes += size;
        await this.record(item); this.publish(); return 'saved';
      } catch (error) {
        if(parts){await parts.close();parts=null;}
        if (writer) { try { await writer.abort(); } catch { /* No se confirma el archivo incompleto. */ } }
        if (this.abort.signal.aborted) { item.status = 'pending'; throw error; }
        if (error.progressError) throw error;
        if (['NotAllowedError','SecurityError','QuotaExceededError','NotReadableError'].includes(error.name)) throw error;
        item.status = 'failed'; item.error = errorText(error); this.failed++;
        this.errors.push({name: item.name, message: item.error}); this.publish();
      } finally {if(parts)await parts.close();}
    }
    async record(item) {
      if (this.progress) await this.progress.complete(item, this.order, this.batchIndex);
      try { this.onRecord({scope: this.scope, docId: item.docId, mid: item.mid, name: item.name, size: item.size, savedAt: Date.now(), status: item.status}); }
      catch { /* El archivo es el registro primario; un registro auxiliar no debe parar la cola. */ }
    }
    async process(retryOnly = false) {
      this.stage = 'downloading'; this.current = null; this.publish();
      for (const item of this.files.values()) {
        if (item.status !== (retryOnly ? 'failed' : 'pending')) continue;
        if (this.limits.maxFiles !== null && this.batchSaved >= this.limits.maxFiles) { this.limitReason = 'count'; break; }
        const previousError = item.error;
        if (retryOnly) { this.failed--; item.status = 'pending'; item.error = ''; }
        const result = await this.save(item);
        if (result === 'limited') {
          if (retryOnly) { item.status = 'failed'; item.error = previousError; this.failed++; }
          break;
        }
      }
      this.current = null;
      if (this.limitReason) {
        this.stage = 'batch-done';
        this.message = this.limitReason === 'file-too-large' ? 'El próximo vídeo supera el tope de tamaño de una tanda. Aumenta ese tope o déjalo vacío para continuar.'
          : this.limitReason === 'bytes' ? 'Tanda terminada para respetar el tope de tamaño. Puedes liberar espacio y descargar la siguiente tanda.'
          : `Tanda terminada: ${this.batchSaved} vídeos nuevos guardados. ${retryOnly ? 'Puedes reintentar los fallidos restantes.' : 'Pulsa Siguiente tanda cuando quieras continuar.'}`;
        return;
      }
      if ([...this.files.values()].some(item => item.status === 'pending')) {
        this.stage = 'batch-done'; this.message = 'Reintentos terminados. Todavía quedan vídeos pendientes para la siguiente tanda.'; return;
      }
      this.stage = 'done';
      this.message = this.failed ? 'Cola terminada con archivos fallidos. Puedes reintentarlos.' : this.files.size ? 'Recorrido y descargas terminados.'
        : this.boundary ? 'No hay vídeos ' + (this.order === 'asc' ? 'más recientes' : 'más antiguos') + ' en el tramo elegido.' : this.adapter.emptyMessage || 'No se encontraron vídeos en el historial accesible de este chat.';
    }
    async next(requestedLimits = this.limits) {
      if (this.running || !this.completedScan) return;
      this.limits = limits(requestedLimits);
      return this.run(false, true);
    }
    async run(retryOnly = false, continueQueue = false) {
      if (this.running) return;
      this.running = true; this.paused = false; this.pausePromise=null;this.wake=null; this.abort = new AbortController();
      this.message = ''; this.batchIndex++; this.batchSaved = 0; this.batchBytes = 0; this.limitReason = ''; this.blocked = null;
      try {
        await this.progress?.flush();
        if (retryOnly) this.errors = [];
        else if (!continueQueue) {
          await this.discover();
          if (this.progress && (this.boundary || this.progress.boundary)) {
            this.progress.setPlan(this.boundary, this.order);
            await this.progress.flush();
          }
        }
        await this.process(retryOnly);
      } catch (error) {
        this.current = null;
        this.stage = this.abort.signal.aborted ? 'stopped' : 'error';
        this.message = this.stage === 'stopped' ? 'Cola detenida. Los vídeos que ya se guardaron se conservan. Inicia otra vez en la misma carpeta para continuar.'
          : ['NotAllowedError','SecurityError'].includes(error.name) ? 'Se perdió el permiso de la carpeta. Inicia otra vez y vuelve a seleccionarla.'
          : error.name === 'QuotaExceededError' ? 'No queda espacio disponible para guardar más archivos.' : errorText(error);
      } finally { this.running = false; this.paused = false; this.publish(); }
    }
  }
  globalThis.TGLocalBulkEngine = Object.freeze({Batch, FILTERS, PART_SIZE, videoDocument, component, cancellable, errorText, limits, boundary, inRange, parallelism, listenAbort});
})();
