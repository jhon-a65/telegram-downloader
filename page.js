(() => {
  'use strict';
  if (window.__tgLocalVideoLoaded) return;
  window.__tgLocalVideoLoaded = true;
  const C = globalThis.TGLocalCore;
  const fetchOriginal = window.fetch.bind(window);
  const createObjectURL = URL.createObjectURL.bind(URL);
  const revokeObjectURL = URL.revokeObjectURL.bind(URL);
  const entries = new Map();
  const objectInfo = new Map();
  const dismissed = new Set();
  const activity = new WeakMap();
  const VIEWERS = '.media-viewer-whole, #MediaViewer';
  const PLAYERS = '.ckin__player, .VideoPlayer, .video-player';
  let serial = 0, channel = '', notifyTimer, lastState = '', job = null;
  let activeUrl = '', activeVideo = null, activitySerial = 0, scanTimer = 0;

  function send(type, payload) {
    if (!channel || typeof document==='undefined' || !document?.documentElement) return;
    document.dispatchEvent(new CustomEvent('tg-local:reply', {detail: JSON.stringify({channel, type, ...payload})}));
  }

  function snapshot(force = false) {
    // La marca se deriva de UNA URL, nunca de banderas acumuladas por elemento.
    const items = [...entries.values()].sort((a,b) => Number(b.url === activeUrl) - Number(a.url === activeUrl) || b.seen - a.seen).slice(0, 60).map(e => ({
      id: e.id, name: e.name, kind: e.kind, size: e.size || 0, visible: e.url === activeUrl,
      duration: e.duration || 0, mime: e.mime || ''
    }));
    const state = {items, picker: typeof window.showSaveFilePicker === 'function'};
    const text = JSON.stringify(state);
    if (force || text !== lastState) { lastState = text; send('state', state); }
    if (force && job) send('progress', publicJob());
  }

  function notify() {
    if (!notifyTimer) notifyTimer = setTimeout(() => { notifyTimer = null; snapshot(); }, 200);
  }

  function remember(value, info = {}) {
    const url = C.safeUrl(value, location.origin);
    if (!url) return null;
    if (dismissed.has(url)) {
      if (!info.video && !info.fresh) return null;
      dismissed.delete(url);
    }
    const meta = C.metadata(url);
    const mime = info.mime || meta.mime || '';
    if (/^(audio|image)\//i.test(mime)) return null;
    if (!info.video && !mime.startsWith('video/') && !/\/(stream|progressive|download)\//i.test(url) && !/\.(mp4|webm|mov|mkv|m4v)(?:[?#]|$)/i.test(url)) return null;
    let entry = entries.get(url);
    const blob = objectInfo.get(url);
    if (!entry) {
      entry = {id: 'video-' + (++serial), url, seen: Date.now(), name: ''};
      entries.set(url, entry);
    }
    entry.kind = blob?.kind || (url.startsWith('blob:') ? 'blob' : 'range');
    entry.mime = mime || blob?.mime || entry.mime || '';
    entry.size = blob?.size || meta.size || entry.size || 0;
    const priorName = entry.name && !/^Telegram-video-\d+\./.test(entry.name) ? entry.name : '';
    entry.name = C.filename(meta.name || priorName || `Telegram-video-${String(Number(entry.id.split('-')[1])).padStart(3, '0')}`, entry.mime);
    if (info.duration) entry.duration = info.duration;
    if (entries.size > 120) {
      for (const [key, item] of entries) {
        if (key !== activeUrl && item.id !== job?.id && key !== url) { entries.delete(key); break; }
      }
    }
    notify();
    return entry;
  }

  // Solo se registran referencias y URLs; no se clonan todas las respuestas ni se retienen vídeos completos.
  URL.createObjectURL = function(object) {
    const url = createObjectURL(object);
    const isBlob = object instanceof Blob;
    const kind = isBlob ? 'blob' : 'mse';
    objectInfo.set(url, {kind, size: isBlob ? object.size : 0, mime: object.type || '', ref: isBlob ? new WeakRef(object) : null});
    if (objectInfo.size > 180) objectInfo.delete(objectInfo.keys().next().value);
    if (object.type?.startsWith('video/')) remember(url, {video: true, mime: object.type});
    return url;
  };

  URL.revokeObjectURL = function(url) {
    const value = String(url);
    const result = revokeObjectURL(value);
    objectInfo.delete(value);
    if (entries.get(value)?.id !== job?.id) entries.delete(value);
    else entries.get(value).revoked = true;
    notify();
    return result;
  };

  window.fetch = function(input, init) {
    const value = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
    const promise = fetchOriginal(input, init);
    if (value && /\/(stream|progressive|download)\//i.test(value)) {
      promise.then(response => {
        if (response.ok) remember(value, {mime: response.headers.get('Content-Type')?.split(';')[0] || '', fresh: true});
      }).catch(() => {});
    }
    return promise;
  };

  function videoSource(video) {
    // currentSrc puede seguir apuntando al vídeo anterior durante un cambio de src.
    if (video.srcObject) return '';
    if (video.hasAttribute('src')) return video.getAttribute('src').trim() ? C.safeUrl(video.src, location.origin) || '' : '';
    const sources = [...video.querySelectorAll('source[src]')].filter(source => source.getAttribute('src').trim()).map(source => C.safeUrl(source.src, location.origin)).filter(Boolean);
    return sources.includes(video.currentSrc) ? video.currentSrc : sources[0] || '';
  }

  function visibleRect(element, styles) {
    if (!element.isConnected) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 20 || rect.height <= 20) return null;
    let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
    let right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
    for (let node = element; node; node = node.parentElement) {
      let style = styles.get(node);
      if (!style) { style = getComputedStyle(node); styles.set(node, style); }
      if (node.hidden || node.getAttribute('aria-hidden') === 'true' ||
          style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
          style.contentVisibility === 'hidden' || (style.opacity !== '' && Number(style.opacity) <= 0.01)) return null;
      if (node !== element && /hidden|clip|auto|scroll/.test(style.overflow + style.overflowX + style.overflowY)) {
        const bounds = node.getBoundingClientRect();
        if (/hidden|clip|auto|scroll/.test(style.overflowX || style.overflow)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
        if (/hidden|clip|auto|scroll/.test(style.overflowY || style.overflow)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
      }
    }
    return right - left > 20 && bottom - top > 20 ? {left, top, right, bottom, area: (right - left) * (bottom - top)} : null;
  }

  function viewerIsOpen(viewer) {
    if (viewer.matches('.media-viewer-whole')) return viewer.classList.contains('active');
    return !viewer.matches('.closing, .not-open') && (viewer.tagName !== 'DIALOG' || viewer.hasAttribute('open'));
  }

  function exposedPoints(video, rect) {
    if (typeof document.elementsFromPoint !== 'function') return 1;
    let exposed = 0, tested = 0;
    const player = video.closest(PLAYERS);
    for (const [x, y] of [[0.5,0.5], [0.25,0.25], [0.75,0.25], [0.25,0.75], [0.75,0.75]]) {
      const stack = document.elementsFromPoint(rect.left + (rect.right - rect.left) * x, rect.top + (rect.bottom - rect.top) * y);
      const top = stack.find(node => node !== document.body && node !== document.documentElement && !node.closest('#tg-local-video-tools'));
      if (!top) continue; // Sin información de hit-test (por ejemplo, un DOM simulado).
      tested++;
      if (top === video || video.contains(top) ||
          (player && player.contains(top) && top.closest(PLAYERS) === player && !top.matches('video, img, canvas'))) exposed++;
    }
    return tested ? exposed : 1;
  }

  function selectActive(candidates, styles) {
    const fullscreen = document.fullscreenElement;
    if (fullscreen) candidates = candidates.filter(item => fullscreen === item.video || fullscreen.contains(item.video));
    else {
      const viewers = [...document.querySelectorAll(VIEWERS)].filter(viewer => viewerIsOpen(viewer) && visibleRect(viewer, styles));
      const viewer = viewers.at(-1);
      if (viewer) {
        candidates = candidates.filter(item => viewer.contains(item.video));
        // Telegram conserva diapositivas adyacentes y movers salientes al navegar.
        const current = viewer.querySelector('.MediaViewerSlide--active, .media-viewer-mover.center');
        if (current) candidates = candidates.filter(item => current.contains(item.video));
        else candidates = candidates.filter(item => !item.video.closest('.media-viewer-mover.moving, .media-viewer-mover.hiding, .MediaViewerSlide:not(.MediaViewerSlide--active)'));
      } else candidates = candidates.filter(item => !item.video.closest(VIEWERS));
    }
    candidates = candidates.map(item => ({...item, exposed: exposedPoints(item.video, item.rect)})).filter(item => item.exposed > 0);
    candidates.sort((a, b) => {
      const recent = item => activity.get(item.video)?.src === item.src ? activity.get(item.video).order : 0;
      return Number(!b.video.loop) - Number(!a.video.loop) || recent(b) - recent(a) ||
        Number(!b.video.paused && !b.video.ended) - Number(!a.video.paused && !a.video.ended) ||
        b.rect.area - a.rect.area || Number(b.video === activeVideo) - Number(a.video === activeVideo);
    });
    return candidates[0] || null;
  }

  function scan() {
    const styles = new WeakMap(), candidates = [];
    for (const video of document.querySelectorAll('video')) {
      const src = videoSource(video);
      if (!src) continue;
      const item = remember(src, {video: true, duration: Number.isFinite(video.duration) ? video.duration : 0});
      const rect = item && visibleRect(video, styles);
      if (rect) candidates.push({video, src, rect});
    }
    const selected = selectActive(candidates, styles);
    activeUrl = selected?.src || '';
    activeVideo = selected?.video || null;
    if (entries.has(activeUrl)) entries.get(activeUrl).seen = Date.now();
    for (const resource of performance.getEntriesByType('resource').slice(-250)) {
      if (/\/(stream|progressive|download)\//i.test(resource.name)) remember(resource.name);
    }
    notify();
  }

  function scheduleScan() {
    // Agrupa ráfagas de cambios del visor sin recorrer el DOM en cada fotograma.
    if (!scanTimer) scanTimer = setTimeout(() => { scanTimer = 0; scan(); }, 80);
  }

  function videoActivity(event) {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('#tg-local-video-tools')) return;
    const video = target.matches('video') ? target : target.closest(PLAYERS)?.querySelector('video');
    if (video) activity.set(video, {src: videoSource(video), order: ++activitySerial});
    scan();
  }

  function publicJob() {
    if (!job) return null;
    return {id: job.id, name: job.name, bytes: job.bytes, total: job.total, phase: job.phase, message: job.message || ''};
  }

  async function download(command) {
    if ((window.TGLocalBulk?.isBusy() || window.TGLocalManual?.isBusy() || window.TGLocalBackup?.isBusy())) { send('notice', {message: 'Detén la cola del grupo antes de iniciar una descarga individual.'}); return; }
    if (job) { send('notice', {message: 'Espera a que termine la descarga actual o pulsa Cancelar.'}); return; }
    const entry = [...entries.values()].find(e => e.id === command.id);
    if (!entry) { send('notice', {message: 'Ese vídeo ya no está disponible. Ábrelo otra vez y pulsa Buscar.'}); return; }
    if (entry.kind === 'mse') {
      send('notice', {message: 'Este elemento es el flujo del reproductor. Busca en la lista el archivo del mismo vídeo. Si no aparece, vuelve a abrirlo o prueba Telegram Web K.'});
      return;
    }
    if (command.memoryOnly && !entry.url.startsWith('blob:')) {
      send('notice', {message: 'Este vídeo necesita solicitar partes a Telegram. Desmarca «Solo datos ya cargados» para permitirlo.'});
      return;
    }
    const abort = new AbortController();
    job = {id: entry.id, name: C.filename(command.name || entry.name, entry.mime), bytes: 0, total: entry.size || null, phase: 'preparing', abort};
    const current = job;
    let writer = null, chunks = [], buffered = 0, lastProgress = 0, disk = false;
    const update = (bytes, total) => {
      current.bytes = bytes; current.total = total;
      if (performance.now() - lastProgress > 100 || (total && bytes >= total)) {
        lastProgress = performance.now(); send('progress', publicJob());
      }
    };
    try {
      send('progress', publicJob());
      if (command.disk && typeof window.showSaveFilePicker === 'function') {
        // La llamada ocurre antes del primer await, conservando el clic del usuario.
        const handle = await window.showSaveFilePicker({suggestedName: current.name});
        abort.signal.throwIfAborted();
        writer = await handle.createWritable();
        disk = true;
      }
      abort.signal.throwIfAborted();
      current.phase = 'downloading';
      send('progress', publicJob());
      const write = async bytes => {
        abort.signal.throwIfAborted();
        if (writer) return writer.write(bytes);
        buffered += bytes.byteLength;
        if (buffered > C.MAX_MEMORY) throw new Error('Este vídeo es grande para guardarlo en RAM. Activa «Elegir ubicación al guardar» y vuelve a intentarlo.');
        chunks.push(bytes);
      };
      const blob = objectInfo.get(entry.url)?.ref?.deref();
      let mime = entry.mime;
      if (blob) {
        await C.copyStream(blob.stream(), write, abort.signal, update, blob.size);
        mime = blob.type || mime;
      } else {
        const result = await C.transfer({url: entry.url, fetcher: fetchOriginal, write, signal: abort.signal, onProgress: update});
        mime = result.mime || mime;
      }
      abort.signal.throwIfAborted();
      current.phase = 'saving'; send('progress', publicJob());
      if (writer) {
        await writer.close(); writer = null;
      } else {
        const file = new Blob(chunks, {type: mime || 'video/mp4'});
        chunks = [];
        const url = createObjectURL(file);
        const link = document.createElement('a');
        link.href = url; link.download = current.name; link.style.display = 'none';
        document.documentElement.appendChild(link); link.click(); link.remove();
        setTimeout(() => revokeObjectURL(url), 60000);
      }
      current.phase = 'done'; current.message = disk ? 'Vídeo guardado.' : 'Vídeo enviado a las descargas de Chrome.';
      send('progress', publicJob());
    } catch (error) {
      if (writer) { try { await writer.abort(); } catch { /* No se confirma un archivo incompleto. */ } }
      current.phase = error.name === 'AbortError' || abort.signal.aborted ? 'cancelled' : 'error';
      current.message = current.phase === 'cancelled' ? 'Descarga cancelada.' : error.name === 'SecurityError' || error.name === 'NotAllowedError'
        ? 'Chrome no permitió elegir ubicación. Desmarca esa opción y prueba de nuevo.'
        : error instanceof TypeError
          ? 'No se pudo leer este recurso. Abre de nuevo el vídeo, pulsa Buscar o prueba la otra versión de Telegram Web.'
          : error.message || 'No se pudo guardar el vídeo. Vuelve a abrirlo y pulsa Buscar.';
      send('progress', publicJob());
    } finally {
      chunks = [];
      if (job === current) job = null;
      if (entry.revoked) { entries.delete(entry.url); notify(); }
    }
  }

  document.addEventListener('tg-local:command', event => {
    if (event.target !== document || typeof event.detail !== 'string' || event.detail.length > 6000) return;
    let command;
    try { command = JSON.parse(event.detail); } catch { return; }
    if (command.type === 'hello' && typeof command.channel === 'string' && /^[a-f0-9]{32}$/.test(command.channel)) {
      channel = command.channel; scan(); snapshot(true); return;
    }
    if (!channel || command.channel !== channel) return;
    if (command.type === 'scan') { scan(); snapshot(true); }
    if (command.type === 'download') void download(command);
    if (command.type === 'cancel' && job) job.abort.abort(new DOMException('Cancelado', 'AbortError'));
    if (command.type === 'clear') {
      scan();
      for (const [url, entry] of entries) {
        if (url !== activeUrl && entry.id !== job?.id) { entries.delete(url); dismissed.add(url); }
      }
      if (dismissed.size > 180) dismissed.clear();
      snapshot(true);
    }
  });

  setInterval(scan, 1500);
  for (const type of ['loadedmetadata', 'loadstart', 'emptied', 'pause', 'ended', 'error', 'fullscreenchange']) document.addEventListener(type, scan, true);
  for (const type of ['play', 'playing']) document.addEventListener(type, videoActivity, true);
  document.addEventListener('pointerdown', videoActivity, true);
  document.addEventListener('scroll', scheduleScan, true);
  document.addEventListener('transitionend', scheduleScan, true);
  window.addEventListener('resize', scheduleScan);
  const observer = new MutationObserver(records => {
    const relevant = node => node instanceof Element && !node.closest('#tg-local-video-tools') &&
      (node.matches('video, source, ' + VIEWERS) || node.closest(VIEWERS) || node.querySelector('video, ' + VIEWERS));
    if (records.some(record => relevant(record.target) || [...record.addedNodes, ...record.removedNodes].some(relevant))) scheduleScan();
  });
  observer.observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'class', 'style', 'hidden', 'aria-hidden', 'open']});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scan(); });
  window.TGLocalSingle = Object.freeze({isBusy: () => !!job, getActiveVideo: () => { scan(); return activeVideo; }});
})();
