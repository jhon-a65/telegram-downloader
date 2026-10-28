/* Motor independiente de la interfaz. Sin bibliotecas ni servicios externos. */
(() => {
  'use strict';
  const CHUNK = 4 * 1024 * 1024;
  const MAX_MEMORY = 512 * 1024 * 1024;

  function fail(message, retryable = false) {
    return Object.assign(new Error(message), {retryable});
  }

  function safeUrl(value, origin) {
    if (typeof value !== 'string' || value.length > 12000) return null;
    try {
      const url = new URL(value, origin);
      if (url.username || url.password) return null;
      if (url.protocol === 'blob:') return url.origin === origin ? url.href : null;
      return url.protocol === 'https:' && url.origin === origin ? url.href : null;
    } catch { return null; }
  }

  function metadata(url) {
    let name = '', mime = '', size = 0;
    const candidates = String(url).split('/').reverse().slice(0, 4);
    for (let text of candidates) {
      for (let i = 0; i < 3; i++) {
        try { text = decodeURIComponent(text); } catch { break; }
        if (text.startsWith('{')) {
          try {
            const obj = JSON.parse(text);
            name ||= obj.fileName || obj.file_name || obj.filename || '';
            mime ||= obj.mimeType || obj.mime_type || obj.type || '';
            size ||= Number(obj.size) || 0;
          } catch { /* No todos los identificadores son JSON. */ }
        }
      }
      if (!name && /\.(mp4|webm|mkv|mov|m4v)(?:[?#]|$)/i.test(text)) name = text.split(/[?#]/)[0];
    }
    return {name: typeof name === 'string' ? name : '', mime: typeof mime === 'string' ? mime : '', size};
  }

  function filename(value, mime = 'video/mp4') {
    let text = String(value || 'Telegram-video').normalize('NFC')
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
      .replace(/[\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/^\.+|[. ]+$/g, '').trim();
    if (!text) text = 'Telegram-video';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(text)) text = '_' + text;
    const extension = /webm/i.test(mime) ? 'webm' : /quicktime/i.test(mime) ? 'mov' : /matroska/i.test(mime) ? 'mkv'
      : /x-msvideo/i.test(mime) ? 'avi' : /mpeg/i.test(mime) ? 'mpg' : /mp2t/i.test(mime) ? 'ts' : /3gpp/i.test(mime) ? '3gp' : 'mp4';
    if (!/\.(mp4|webm|mov|mkv|m4v|avi|mpg|mpeg|3gp|ts|wmv|flv)$/i.test(text)) text += '.' + extension;
    if (text.length > 160) text = text.slice(0, 145) + '.' + text.split('.').pop();
    return text;
  }

  function checkMime(mime) {
    if (/^(text\/|application\/(?:json|xml|xhtml))/i.test(mime || '')) {
      throw fail('Telegram devolvió una página o un error en lugar del vídeo. Abre de nuevo el vídeo y pulsa Buscar.');
    }
  }

  function throwIfAborted(signal) { signal?.throwIfAborted(); }

  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      throwIfAborted(signal);
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
      function abort() { clearTimeout(timer); reject(signal.reason || new DOMException('Cancelado', 'AbortError')); }
      signal?.addEventListener('abort', abort, {once: true});
    });
  }

  async function copyStream(stream, write, signal, onProgress, total = null) {
    const reader = stream.getReader();
    let received = 0;
    const abort = () => { reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', abort, {once: true});
    try {
      while (true) {
        throwIfAborted(signal);
        const {done, value} = await reader.read();
        throwIfAborted(signal);
        if (done) break;
        await write(value);
        received += value.byteLength;
        onProgress(received, total);
      }
      if (!received) throw fail('El archivo está vacío. Vuelve a abrir el vídeo.');
      if (total && received !== total) throw fail('La descarga llegó incompleta. No se guardó como un vídeo correcto.');
      return received;
    } finally {
      signal?.removeEventListener('abort', abort);
      try { await reader.cancel(); } catch { /* Puede estar cerrado. */ }
      reader.releaseLock();
    }
  }

  async function transfer({url, fetcher, write, signal, onProgress = () => {}, chunkSize = CHUNK}) {
    let offset = 0, total = null, mime = '', etag = null;
    while (total === null || offset < total) {
      throwIfAborted(signal);
      const endRequested = Math.min(offset + chunkSize - 1, total === null ? Number.MAX_SAFE_INTEGER : total - 1);
      let response, bytes, range;
      for (let attempt = 0; ; attempt++) {
        try {
          const deadline = new AbortController();
          const alarm = setTimeout(() => deadline.abort(new DOMException('Telegram tardó demasiado en responder.', 'TimeoutError')), 45000);
          const requestSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
          try {
            response = await fetcher(url, {
              credentials: 'include', redirect: 'error', signal: requestSignal,
              headers: {Range: `bytes=${offset}-${endRequested}`}
            });
          } finally {
            // El plazo es para iniciar la respuesta, no para terminar un vídeo grande.
            clearTimeout(alarm);
          }
          if (!response.ok) {
            if (response.status === 401 || response.status === 403) throw fail('Telegram no permite acceder ahora a este archivo. Ábrelo de nuevo en tu sesión.');
            throw fail(`No se pudo obtener el vídeo (HTTP ${response.status}).`, [408, 429, 500, 502, 503, 504].includes(response.status));
          }
          mime = response.headers.get('Content-Type')?.split(';')[0] || mime;
          checkMime(mime);
          if (response.status === 200) {
            if (offset !== 0) throw fail('El servidor ignoró la posición del archivo. Se detuvo la descarga para evitar un vídeo duplicado o corrupto.');
            break;
          }
          if (response.status !== 206) throw fail('La respuesta de Telegram no es compatible con esta descarga.');
          const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') || '');
          if (!match) throw fail('Telegram no indicó qué parte del vídeo devolvió. Prueba a abrirlo de nuevo.');
          range = match.slice(1).map(Number);
          const [start, end, length] = range;
          if (![start, end, length].every(Number.isSafeInteger) || start !== offset || end < start || end > endRequested || end >= length || (total !== null && total !== length)) {
            throw fail('Las partes del archivo no coinciden. La descarga se detuvo para evitar un vídeo corrupto.');
          }
          const nextEtag = response.headers.get('ETag');
          if (etag && nextEtag && etag !== nextEtag) throw fail('El archivo cambió durante la descarga. Vuelve a intentarlo.');
          etag ||= nextEtag;
          bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.byteLength !== end - start + 1) throw fail('Una parte del vídeo llegó incompleta.', true);
          break;
        } catch (error) {
          throwIfAborted(signal);
          const transient = error.retryable || error instanceof TypeError || error.name === 'TimeoutError';
          if (!transient || attempt >= 2) throw error;
          try { await response?.body?.cancel(); } catch { /* Ya consumido. */ }
          await wait([400, 1200][attempt], signal);
        }
      }
      if (response.status === 200) {
        const headerLength = Number(response.headers.get('Content-Length'));
        const length = Number.isSafeInteger(headerLength) && headerLength > 0 ? headerLength : null;
        if (!response.body) throw fail('El navegador no entregó el contenido del vídeo.');
        const received = await copyStream(response.body, write, signal, onProgress, length);
        return {bytes: received, mime};
      }
      throwIfAborted(signal);
      await write(bytes);
      offset += bytes.byteLength;
      total = range[2];
      onProgress(offset, total);
    }
    if (!offset) throw fail('El archivo está vacío.');
    return {bytes: offset, mime};
  }

  globalThis.TGLocalCore = Object.freeze({safeUrl, metadata, filename, transfer, copyStream, MAX_MEMORY});
})();
