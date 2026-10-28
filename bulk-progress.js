/* Registro durable por carpeta. Se confirma después de cerrar cada vídeo. */
(() => {
  'use strict';
  const FILE = 'Telegram-progreso.json';
  const validId = id => /^-?\d{1,24}$/.test(String(id));
  class Progress {
    constructor(directory, scope, data = {}) {
      this.directory = directory; this.scope = scope; this.done = new Map(); this.dirty = false;
      this.order = data.order === 'desc' ? 'desc' : 'asc';
      this.boundary = globalThis.TGLocalBulkEngine.boundary(data.boundary);
      if (this.boundary && (this.boundary.peerId !== Number(scope.split(':')[1]) || this.boundary.direction !== this.order)) throw new Error('El punto de inicio no corresponde al chat o al orden del registro.');
      for (const item of data.completed || []) {
        if (!validId(item.docId) || !Number.isSafeInteger(item.size) || item.size <= 0 || typeof item.name !== 'string' || item.name.length > 200) throw new Error('El registro contiene un vídeo incompatible.');
        this.done.set(String(item.docId), item);
      }
      this.batchIndex = Number.isSafeInteger(data.batchIndex) && data.batchIndex >= 0 ? data.batchIndex : 0;
      this.lastCompleted = typeof data.lastCompleted === 'string' ? data.lastCompleted.slice(0,200) : [...this.done.values()].at(-1)?.name || '';
      this.committedCount = this.done.size; this.committedLast = this.lastCompleted;
    }
    static async open(directory, scope) {
      try {
        const handle = await directory.getFileHandle(FILE);
        const file = await handle.getFile();
        // Un cierre durante la creación inicial puede dejar el archivo vacío; se reconstruye desde los vídeos existentes.
        if (!file.size) return new Progress(directory, scope);
        if (file.size > 32 * 1024 * 1024) throw new Error('El registro de progreso es demasiado grande para leerlo.');
        const data = JSON.parse(await file.text());
        if (data.version !== 1 || data.scope !== scope || !['asc','desc'].includes(data.order) || !Array.isArray(data.completed)) throw new Error('El registro no corresponde a este grupo, tema o versión.');
        return new Progress(directory, scope, data);
      } catch (error) {
        if (error.name === 'NotFoundError') return new Progress(directory, scope);
        throw new Error('No se pudo leer Telegram-progreso.json. Conserva ese archivo y comprueba que elegiste la carpeta correcta. ' + (error.message || ''));
      }
    }
    has(item) { return this.done.get(item.docId)?.size === item.size && item.size > 0; }
    setPlan(value, order) {
      const start = globalThis.TGLocalBulkEngine.boundary(value);
      if (JSON.stringify(start) !== JSON.stringify(this.boundary) || this.order !== order) {
        this.boundary = start; this.order = order; this.dirty = true;
      }
    }
    async complete(item, order, batchIndex) {
      if (!this.has(item) || this.order !== order || this.batchIndex !== batchIndex) {
        this.order = order; this.batchIndex = batchIndex; this.lastCompleted = item.name;
        this.done.set(item.docId, {docId:item.docId, mid:item.mid, name:item.name, size:item.size, savedAt:Date.now()});
        this.dirty = true;
      }
      await this.flush();
    }
    async flush() {
      if (!this.dirty) return;
      let writer;
      try {
        const handle = await this.directory.getFileHandle(FILE, {create:true});
        writer = await handle.createWritable({keepExistingData:false});
        await writer.write(JSON.stringify({version:1, scope:this.scope, order:this.order, boundary:this.boundary, batchIndex:this.batchIndex, lastCompleted:this.lastCompleted, updatedAt:Date.now(), completed:[...this.done.values()]}));
        await writer.close(); writer = null; this.dirty = false;
        this.committedCount = this.done.size; this.committedLast = this.lastCompleted;
      } catch (error) {
        if (writer) { try { await writer.abort(); } catch {} }
        throw Object.assign(new Error('No se pudo confirmar su progreso en la carpeta. Se detuvo la cola para que revises el permiso o espacio disponible. ' + (error.message || '')), {progressError:true});
      }
    }
  }
  globalThis.TGLocalProgress = Object.freeze({Progress, FILE});
})();
