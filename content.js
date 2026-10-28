(() => {
  'use strict';
  if (document.getElementById('tg-local-video-tools')) return;
  const channel = [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2, '0')).join('');
  const host = document.createElement('div');
  host.id = 'tg-local-video-tools';
  host.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;display:block;color-scheme:light;';
  const root = host.attachShadow({mode: 'open'});
  const style = document.createElement('style');
  style.textContent = globalThis.TGLocalPanelStyles || '';
  root.appendChild(style);
  const wrap = document.createElement('div');
  wrap.innerHTML = /* PANEL_START */ "<section class=\"panel\" hidden role=\"dialog\" aria-labelledby=\"tg-title\">\n  <header class=\"head\">\n    <span class=\"brand-mark\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#dbeafe\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3v12m-4-4 4 4 4-4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4\"/></svg></span>\n    <div class=\"head-copy\"><div class=\"eyebrow\">DESCARGADOR DE ARCHIVOS</div><h2 id=\"tg-title\">Telegram Downloader</h2></div>\n    <button class=\"close\" title=\"Cerrar\" aria-label=\"Cerrar panel\">×</button>\n  </header>\n  <nav class=\"mode-tabs\" role=\"tablist\" aria-label=\"Qué quieres hacer\">\n    <button class=\"mode-one\" id=\"tg-tab-one\" role=\"tab\" aria-selected=\"true\" aria-controls=\"tg-view-one\"><span class=\"tab-icon\" aria-hidden=\"true\">▷</span><span>Vídeo abierto</span></button>\n    <button class=\"mode-manual\" id=\"tg-tab-manual\" role=\"tab\" aria-selected=\"false\" aria-controls=\"tg-view-manual\" tabindex=\"-1\"><span class=\"tab-icon\" aria-hidden=\"true\">☷</span><span>Mi cola <span class=\"tab-count\">0</span></span></button>\n    <button class=\"mode-group\" id=\"tg-tab-group\" role=\"tab\" aria-selected=\"false\" aria-controls=\"tg-view-group\" tabindex=\"-1\"><span class=\"tab-icon\" aria-hidden=\"true\">▤</span><span>Grupo / tema</span></button>\n    <button class=\"mode-backup\" id=\"tg-tab-backup\" role=\"tab\" aria-selected=\"false\" aria-controls=\"tg-view-backup\" tabindex=\"-1\"><span class=\"tab-icon\" aria-hidden=\"true\">▣</span><span>Respaldo</span></button>\n  </nav>\n  <div class=\"individual-view\" id=\"tg-view-one\" role=\"tabpanel\" aria-labelledby=\"tg-tab-one\">\n    <div class=\"view-heading\"><div><h3>El vídeo que estás viendo</h3><p>Guárdalo ahora o añádelo a tu selección para descargarlo después.</p></div><span class=\"tiny-badge\">INDIVIDUAL</span></div>\n    <div class=\"quick-actions\"><button class=\"quick-add\" disabled>+ Añadir vídeo abierto a Mi cola</button><button class=\"subtle go-queue\">Ver cola →</button></div>\n    <div class=\"toolbar\"><span class=\"count\">Buscando vídeos…</span><div><button class=\"subtle clear\" title=\"Quitar los vídeos que ya no están en pantalla\">Limpiar</button><button class=\"subtle scan\">↻ Buscar</button></div></div>\n    <div class=\"list\"></div>\n    <details class=\"advanced\"><summary>Opciones de guardado</summary><div class=\"options\"><label><input id=\"memory\" type=\"checkbox\">Usar solo los datos ya cargados</label><label><input id=\"disk\" type=\"checkbox\" checked>Elegir ubicación al guardar</label><p class=\"helper\">Elegir ubicación permite guardar vídeos grandes sin reunir todo el archivo en memoria.</p></div></details>\n    <div class=\"status\" hidden aria-live=\"polite\"><div class=\"status-title\"></div><progress class=\"progress\" max=\"100\" aria-label=\"Avance de la descarga\"></progress><div class=\"status-foot\"><div class=\"detail\"></div><button class=\"cancel\" hidden>Cancelar</button></div></div>\n  </div>\n  <div class=\"manual-view\" id=\"tg-view-manual\" role=\"tabpanel\" aria-labelledby=\"tg-tab-manual\" hidden>\n    <div class=\"view-heading\"><div><h3>Tu selección, a tu ritmo</h3><p>Abre vídeos y añádelos. Se descargarán en el orden en que los elegiste.</p></div><span class=\"tiny-badge\">SELECCIÓN</span></div>\n    <section class=\"manual-box\" aria-label=\"Mi cola de vídeos\">\n      <div class=\"card-title\"><span class=\"step-number\">1</span> Añade el vídeo abierto</div>\n      <div class=\"manual-anchor\">Abre un vídeo en el visor grande de Web K.</div>\n      <button class=\"download manual-add\" disabled>+ Añadir vídeo abierto a la cola</button>\n      <div class=\"manual-summary\">0 pendientes</div><div class=\"manual-list\"></div>\n      <fieldset class=\"batch-options\"><legend>2 · Elige tu tanda</legend><label>Vídeos por tanda<select id=\"manual-count\"><option value=\"10\">10 vídeos</option><option value=\"20\">20 vídeos</option><option value=\"40\">40 vídeos</option><option value=\"60\">60 vídeos</option><option value=\"100\">100 vídeos</option><option value=\"all\">Todos</option></select></label><label>Velocidad<select id=\"manual-parallel\"><option value=\"1\">Conservadora</option><option value=\"4\">Equilibrada</option><option value=\"8\" selected>Rápida</option><option value=\"16\">Intensiva</option></select></label></fieldset>\n      <button class=\"manual-next\" hidden>Descargar siguiente tanda</button><button class=\"manual-start\" disabled>Elegir carpeta y descargar selección</button>\n      <div class=\"manual-message\" aria-live=\"polite\">Selecciona los vídeos que quieras. Puedes seguir añadiendo mientras se descarga una tanda.</div>\n      <div class=\"manual-current\"></div><progress class=\"manual-progress\" max=\"100\" hidden aria-label=\"Avance del vídeo de tu cola\"></progress>\n      <div class=\"manual-controls\"><button class=\"manual-pause\" hidden>Pausar</button><button class=\"manual-resume\" hidden>Reanudar</button><button class=\"manual-stop\" hidden>Detener</button><button class=\"manual-clear-done\" hidden>Quitar completados de la lista</button></div>\n    </section>\n  </div>\n  <div class=\"bulk-view\" id=\"tg-view-group\" role=\"tabpanel\" aria-labelledby=\"tg-tab-group\" hidden>\n    <div class=\"view-heading\"><div><h3>Descargar por tandas</h3><p>Elige un tema o todos los vídeos del grupo. Continúa después desde lo pendiente.</p></div><span class=\"tiny-badge\">VÍDEOS</span></div>\n    <div class=\"card\"><div class=\"card-title\">Grupo abierto</div><div class=\"bulk-group\">Abre un grupo en Telegram Web K</div><div class=\"bulk-topic\" hidden></div></div>\n    <fieldset class=\"bulk-scope\"><legend>1 · Qué descargar</legend><label><input id=\"scope-topic\" type=\"radio\" name=\"bulk-scope\" value=\"topic\" aria-describedby=\"scope-note\">Solo el tema abierto</label><label><input id=\"scope-group\" type=\"radio\" name=\"bulk-scope\" value=\"group\" checked>Todos los vídeos del grupo</label><p class=\"bulk-scope-note\" id=\"scope-note\">Abre un tema para descargar solo sus vídeos.</p></fieldset>\n    <fieldset class=\"batch-options\"><legend>2 · Tamaño de tu tanda</legend><label>Vídeos nuevos<select id=\"batch-count\"><option value=\"10\" selected>10 vídeos</option><option value=\"20\">20 vídeos</option><option value=\"50\">50 vídeos</option><option value=\"custom\">Otra cantidad</option><option value=\"all\">Todos</option></select></label><label class=\"batch-custom-row\" hidden>Cantidad<input id=\"batch-custom\" type=\"number\" min=\"1\" max=\"10000\" step=\"1\" value=\"10\"></label><label>Velocidad<select id=\"batch-parallel\"><option value=\"1\">Conservadora</option><option value=\"4\">Equilibrada</option><option value=\"8\" selected>Rápida</option><option value=\"16\">Intensiva</option></select></label><p class=\"batch-hint\">La tanda termina al completar la cantidad elegida.</p></fieldset>\n    <details class=\"advanced\"><summary>Punto de inicio, orden y límite de tamaño</summary>\n      <fieldset class=\"batch-options start-options\"><legend>Desde dónde continuar</legend><label>Empezar<select id=\"batch-start-mode\"><option value=\"continue\">Progreso guardado / inicio</option><option value=\"video\">Desde el vídeo abierto</option></select></label>\n        <div class=\"start-video-options\" hidden><div class=\"start-anchor\" aria-live=\"polite\"><strong>Vídeo de inicio</strong><div class=\"start-anchor-name\"></div><div class=\"start-anchor-detail\"></div></div><button class=\"subtle start-refresh\" type=\"button\">↻ Actualizar vídeo</button><label>Continuar hacia<select id=\"batch-direction\"><option value=\"asc\">Vídeos más recientes</option><option value=\"desc\">Vídeos más antiguos</option></select></label><label class=\"start-include\"><input id=\"batch-include\" type=\"checkbox\">Incluir también el vídeo abierto</label><p class=\"start-note\">Si ya lo descargaste, deja esa casilla desmarcada.</p></div>\n        <p class=\"start-default-note start-note\">Lee el inicio y el progreso de la carpeta elegida. Si no hay registro, usa el orden que selecciones.</p>\n      </fieldset>\n      <fieldset class=\"batch-options\"><legend>Orden y espacio</legend><label class=\"batch-order-row\">Orden<select id=\"batch-order\"><option value=\"asc\">Antiguos primero</option><option value=\"desc\">Recientes primero</option></select></label><label>Máximo por tanda, GB<input id=\"batch-gb\" type=\"number\" min=\"0\" step=\"any\" placeholder=\"Sin límite\"></label><label class=\"batch-continue\"><input id=\"batch-continue\" type=\"checkbox\" checked>Continuar desde el progreso guardado</label></fieldset>\n    </details>\n    <button class=\"bulk-next\" hidden>Descargar siguiente tanda</button><button class=\"bulk-start\">Elegir carpeta y descargar</button>\n    <div class=\"bulk-start-info\" hidden></div><div class=\"bulk-batch-summary\" hidden></div><div class=\"bulk-resume-info batch-hint\" hidden></div><div class=\"bulk-blocked\" hidden></div>\n    <div class=\"bulk-setup\" hidden><strong>Selector de carpetas no disponible</strong><p>Usa Brave o Chrome de escritorio actualizado y recarga Telegram Web K. Si tu navegador tiene desactivado el acceso a archivos, actívalo en su configuración.</p></div>\n    <div class=\"bulk-stats\" hidden><div><strong class=\"bulk-found\">0</strong><small>Encontrados</small></div><div><strong class=\"bulk-saved\">0</strong><small>Guardados</small></div><div><strong class=\"bulk-skipped\">0</strong><small>Ya guardados</small></div><div><strong class=\"bulk-failed\">0</strong><small>Fallidos</small></div></div>\n    <div class=\"bulk-message\" aria-live=\"polite\">Preparando la conexión con Telegram…</div><div class=\"bulk-folder\"></div><div class=\"bulk-total bulk-folder\"></div>\n    <progress class=\"progress bulk-overall\" hidden max=\"100\" aria-label=\"Avance de la tanda\"></progress><div class=\"bulk-current\" hidden></div><div class=\"bulk-bytes\"></div><progress class=\"progress bulk-file-progress\" hidden max=\"100\" aria-label=\"Avance del vídeo actual\"></progress>\n    <div class=\"bulk-controls\"><button class=\"bulk-pause\" hidden>Pausar</button><button class=\"bulk-resume\" hidden>Reanudar</button><button class=\"bulk-stop\" hidden>Detener</button><button class=\"bulk-retry\" hidden>Reintentar fallidos</button></div>\n    <details class=\"bulk-errors\" hidden><summary>Ver últimos errores</summary><ul></ul></details><div class=\"bulk-record-status\"></div>\n  </div>\n  <div class=\"backup-view\" id=\"tg-view-backup\" role=\"tabpanel\" aria-labelledby=\"tg-tab-backup\" hidden>\n    <div class=\"view-heading\"><div><h3>Tu grupo, bien guardado</h3><p>Una copia organizada por temas. Actualízala después para añadir lo que falte.</p></div><span class=\"tiny-badge local\">EN TU DISCO</span></div>\n    <section class=\"backup-step\"><div class=\"card-title\"><span class=\"step-number\">1</span> Comprueba el grupo</div><div class=\"backup-context\">Abre el grupo en Telegram Web K</div><button class=\"subtle backup-refresh\">↻ Cargar temas del grupo</button><p class=\"helper\">Incluye General. No necesitas abrir los temas uno por uno.</p></section>\n    <section class=\"backup-step\"><div class=\"card-title\"><span class=\"step-number\">2</span> Elige los temas</div><div class=\"backup-scope\"><label><input type=\"radio\" name=\"backup-scope\" id=\"backup-all\" checked>Todos los temas</label><label><input type=\"radio\" name=\"backup-scope\" id=\"backup-selected\">Elegir algunos</label></div><div class=\"backup-topic-picker\" hidden><input type=\"search\" class=\"backup-topic-filter\" aria-label=\"Buscar un tema\" placeholder=\"Buscar tema…\"><div class=\"backup-topic-tools\"><span class=\"backup-topic-caption\">Marca los temas que quieras conservar.</span><button class=\"subtle backup-select-all\">Seleccionar todos</button></div><div class=\"backup-topic-list\"></div></div><p class=\"backup-selected-summary\">Carga los temas para continuar.</p></section>\n    <section class=\"backup-step\"><div class=\"card-title\"><span class=\"step-number\">3</span> Qué quieres conservar</div><div class=\"backup-types\"><label><input id=\"backup-videos\" type=\"checkbox\" checked>Vídeos</label><label><input id=\"backup-photos\" type=\"checkbox\">Imágenes</label><label><input id=\"backup-audio\" type=\"checkbox\">Audios</label><label><input id=\"backup-documents\" type=\"checkbox\">Documentos</label><label class=\"messages-choice\"><input id=\"backup-messages\" type=\"checkbox\" checked>Mensajes y descripciones</label></div><p class=\"helper\">Los mensajes se guardan como texto legible y JSON. Cada tipo de archivo tiene su propia subcarpeta.</p></section>\n    <details class=\"advanced\"><summary>Fechas y velocidad</summary><div class=\"two-fields\"><label>Desde<input id=\"backup-from\" type=\"date\"></label><label>Hasta<input id=\"backup-to\" type=\"date\"></label></div><div class=\"batch-options\" style=\"margin-top:12px\"><label>Velocidad<select id=\"backup-parallel\"><option value=\"1\">Conservadora</option><option value=\"4\">Equilibrada</option><option value=\"8\" selected>Rápida</option><option value=\"16\">Intensiva</option></select></label><p class=\"helper\">Sin fechas se incluye todo el historial accesible. Las fechas siguen el horario de tu PC. La copia descarga los archivos de Telegram usando tu sesión.</p></div></details>\n    <div class=\"backup-hint\">Se conservan tus copias anteriores. Si cierras el navegador, vuelve a elegir la misma carpeta para continuar.</div>\n    <button class=\"backup-update\" hidden>Continuar / actualizar esta copia</button><button class=\"backup-start\" disabled>Elegir carpeta y crear copia</button><p class=\"backup-start-note\">Nombres estables · Orden por fecha · Sin borrado automático</p>\n    <div class=\"backup-stats\" hidden><div><strong class=\"backup-found\">0</strong><small>Archivos</small></div><div><strong class=\"backup-saved\">0</strong><small>Nuevos</small></div><div><strong class=\"backup-skipped\">0</strong><small>Ya guardados</small></div><div><strong class=\"backup-failed\">0</strong><small>Fallidos</small></div></div>\n    <div class=\"backup-message\" aria-live=\"polite\">Carga los temas del grupo para preparar tu copia.</div><div class=\"backup-folder\"></div><div class=\"backup-detail\"></div><progress class=\"backup-progress backup-overall\" hidden max=\"100\" aria-label=\"Avance del respaldo\"></progress><div class=\"backup-current\"></div><div class=\"backup-bytes\"></div><progress class=\"backup-progress backup-file\" hidden max=\"100\" aria-label=\"Avance del archivo actual\"></progress>\n    <div class=\"backup-controls\"><button class=\"backup-pause\" hidden>Pausar</button><button class=\"backup-resume\" hidden>Reanudar</button><button class=\"backup-stop\" hidden>Detener</button></div><details class=\"backup-errors\" hidden><summary>Revisar avisos y errores</summary><ul></ul></details>\n  </div>\n  <div class=\"photo-notice\" hidden role=\"status\" aria-live=\"polite\"></div>\n  <footer class=\"footer\"><span>v3.0.1 · Sin cuota diaria</span><button class=\"photo-save\" type=\"button\" aria-label=\"Guardar la imagen abierta\" title=\"Guardar la imagen abierta desde los datos locales del navegador\">↓ Imagen abierta</button><span><a href=\"https://web.telegram.org/k/\" target=\"_blank\" rel=\"noopener noreferrer\">Web K</a> · <a href=\"https://web.telegram.org/a/\" target=\"_blank\" rel=\"noopener noreferrer\">Web A</a></span></footer>\n</section>\n<div class=\"launcher-row\"><a class=\"support\" href=\"https://paypal.me/jhonanthony229\" target=\"_blank\" rel=\"noopener noreferrer\" aria-label=\"Apoya al creador con una donación en PayPal\"><span aria-hidden=\"true\">♡</span> Apoya al creador</a><button class=\"launch\" aria-expanded=\"false\" aria-label=\"Abrir Telegram Downloader\"><span aria-hidden=\"true\">↓</span> Descargar <span class=\"number\">0</span></button></div>\n" /* PANEL_END */;
  root.appendChild(wrap);
  document.documentElement.appendChild(host);
  const $ = selector => root.querySelector(selector);
  let items = [], active = false, lastRendered = '', connected = false, bulkBusy = false, bulkState = null, manualBusy=false, manualState=null, manualSignature='';
  let photoState=null,photoNoticeTimer=0,backupBusy=false,backupState=null,view='one';
  let backupTopics=[],backupTopicScope='',backupTopicRevision=0;const selectedBackupTopics=new Set();
  let backupSelections={},appliedBackupSelection='';
  const manualRows=new Map();
  let recordTimer, recordWrites = Promise.resolve(), lastBadge = -1;
  const pendingRecords = new Map();

  function command(type, data = {}) {
    if(typeof document==='undefined'||!document?.documentElement)return;
    document.dispatchEvent(new CustomEvent('tg-local:command', {detail: JSON.stringify({channel, type, ...data})}));
  }
  function bytes(value) {
    if (!value) return '0 B';
    const unit = Math.min(3, Math.floor(Math.log(value) / Math.log(1024)));
    return (value / 1024 ** unit).toLocaleString('es', {maximumFractionDigits: unit ? 1 : 0}) + ' ' + ['B', 'KB', 'MB', 'GB'][unit];
  }
  function notice(text, error = false) {
    $('.status').hidden = false; $('.status').classList.toggle('error', error);
    $('.status-title').textContent = text; $('.detail').textContent = '';
    $('.progress').hidden = true; $('.cancel').hidden = true;
  }
  function toggle(force) {
    const open = typeof force === 'boolean' ? force : $('.panel').hidden;
    $('.panel').hidden = !open; $('.launch').setAttribute('aria-expanded', String(open));
    if (open) { render(true); command('scan'); }
  }
  function render(force = false) {
    const badgeCount = bulkBusy || !$('.bulk-view').hidden ? bulkState?.found || 0 : items.filter(e => e.kind !== 'mse').length;
    $('.number').textContent = String(badgeCount);
    if (lastBadge !== badgeCount) { lastBadge=badgeCount; chrome.runtime.sendMessage({type:'tg-local-count',count:badgeCount}).catch(()=>{}); }
    $('.count').textContent = `${items.length} ${items.length === 1 ? 'elemento detectado' : 'elementos detectados'}`;
    if ($('.panel').hidden || $('.individual-view').hidden) return;
    const signature = JSON.stringify([items, active, bulkBusy, manualBusy, backupBusy]);
    if (!force && signature === lastRendered) return;
    lastRendered = signature;
    const list = $('.list'), scroll = list.scrollTop;
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div'); empty.className = 'empty';
      const title = document.createElement('strong'); title.textContent = 'Abre el vídeo que quieras guardar';
      empty.append(title, document.createTextNode('Deja que empiece a cargar y pulsa Buscar. Si acabas de instalar la extensión, recarga primero Telegram.'));
      list.appendChild(empty); return;
    }
    for (const item of items) {
      const row = document.createElement('div'); row.className = 'item'; row.dataset.id = item.id;
      const icon = document.createElement('div'); icon.className = 'file'; icon.textContent = '▷'; icon.setAttribute('aria-hidden', 'true');
      const info = document.createElement('div'); info.className = 'info';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = item.name; name.title = item.name;
      const meta = document.createElement('div'); meta.className = 'meta';
      const kind = document.createElement('span'); kind.className = 'tag ' + item.kind;
      kind.textContent = item.kind === 'blob' ? 'Cargado' : item.kind === 'mse' ? 'Flujo del reproductor' : 'Archivo por partes';
      meta.appendChild(kind);
      if (item.size) { const size = document.createElement('span'); size.textContent = bytes(item.size); meta.appendChild(size); }
      if (item.visible) { const visible = document.createElement('span'); visible.className = 'visible'; visible.textContent = 'En pantalla'; meta.appendChild(visible); }
      info.append(name, meta);
      const button = document.createElement('button'); button.className = 'download'; button.textContent = item.kind === 'mse' ? 'Ver ayuda' : 'Guardar';
      button.disabled = active || bulkBusy || manualBusy || backupBusy;
      button.addEventListener('click', () => {
        if (item.kind === 'mse') { notice('Este es el flujo del reproductor, no el archivo completo. Busca otro elemento del mismo vídeo o ábrelo en Web K y pulsa Buscar.'); return; }
        command('download', {id: item.id, disk: $('#disk').checked, memoryOnly: $('#memory').checked});
      });
      row.append(icon, info, button); list.appendChild(row);
    }
    list.scrollTop = scroll;
  }

  function setView(next) {
    view=next;
    for(const [name,selector] of [['one','.individual-view'],['manual','.manual-view'],['group','.bulk-view'],['backup','.backup-view']]){
      $(selector).hidden=name!==next;const tab=$('.mode-'+name);tab.setAttribute('aria-selected',String(name===next));tab.tabIndex=name===next?0:-1;
    }
    if(next==='group')command('bulk-status');
    else if(next==='backup')command('backup-status');
    else {render(true);command('manual-status');}
  }
  function setMode(group) {setView(group?'group':'one');}
  function batchOptions() {
    const selection = $('#batch-count').value;
    const maxFiles = selection === 'all' ? null : Number(selection === 'custom' ? $('#batch-custom').value : selection);
    if (maxFiles !== null && (!Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 10000)) throw new Error('Elige una cantidad de 1 a 10000 vídeos, o Todos.');
    const text = $('#batch-gb').value.trim(), gb = Number(text);
    const maxBytes = text ? Math.floor(gb * 1024 ** 3) : null;
    if (text && (!Number.isSafeInteger(maxBytes) || maxBytes < 1)) throw new Error('El tope en GB debe ser positivo o quedar vacío.');
    return {parallelism:Number($('#batch-parallel').value),limits:{maxFiles,maxBytes}, order:$('#batch-start-mode').value === 'video' ? $('#batch-direction').value : $('#batch-order').value, continueProgress:$('#batch-continue').checked};
  }
  function batchCommand(type) {
    try {
      const options = batchOptions();
      const start = {mode:$('#batch-start-mode').value, include:$('#batch-include').checked, expectedAnchor:bulkState?.anchor?.token || ''};
      command(type, {...options, start, mode:$('#scope-topic').checked ? 'topic' : 'group', expectedScope:type === 'bulk-start' ? bulkState?.availableScope || '' : bulkState?.scope || ''});
    } catch (error) { $('.bulk-message').textContent = error.message; }
  }
  function renderBatchOptions() {
    const fromVideo = $('#batch-start-mode').value === 'video';
    $('.start-video-options').hidden = !fromVideo; $('.start-default-note').hidden = fromVideo;
    $('.batch-order-row').hidden = fromVideo;
    const anchor = bulkState?.anchor;
    $('.start-anchor-name').textContent = anchor?.available ? anchor.name : 'Ningún vídeo de inicio confirmado';
    $('.start-anchor-detail').textContent = anchor?.available ? new Date(anchor.date * 1000).toLocaleString('es') + ' · Mensaje ' + anchor.messageId : anchor?.message || 'Abre el vídeo en el visor grande de Telegram.';
    $('.start-refresh').disabled = bulkBusy || active || manualBusy || backupBusy;
    for (const id of ['batch-start-mode','batch-direction','batch-include']) $('#' + id).disabled = bulkBusy || active || manualBusy || backupBusy;
    $('.bulk-start').disabled = bulkBusy || active || manualBusy || backupBusy || !bulkState?.available || !bulkState?.canStart || (fromVideo && !anchor?.available);
    $('.batch-custom-row').hidden = $('#batch-count').value !== 'custom';
    for (const id of ['batch-count','batch-custom','batch-gb','batch-order','batch-continue','batch-parallel']) $('#' + id).disabled = bulkBusy || active || manualBusy || backupBusy;
    if (!fromVideo && (bulkState?.progressCount || bulkState?.boundary) && $('#batch-continue').checked) { $('#batch-order').value = bulkState.order; $('#batch-order').disabled = true; }
    let options;
    try { options = batchOptions(); } catch { $('.batch-hint').textContent = 'Introduce una cantidad y un tope válidos antes de empezar.'; return; }
    $('.batch-hint').textContent = (options.limits.maxFiles === null ? 'Toda la cola' : 'Hasta ' + options.limits.maxFiles + ' vídeos nuevos por tanda') + (options.limits.maxBytes ? ', sin superar ' + bytes(options.limits.maxBytes) + '.' : '.') + ' El progreso queda en Telegram-progreso.json.';
    const blocked = bulkState?.limitReason === 'file-too-large' && options.limits.maxBytes !== null && bulkState.blocked?.size > options.limits.maxBytes;
    $('.bulk-next').disabled = bulkBusy || active || manualBusy || backupBusy || !!blocked || !options.continueProgress;
  }
  function renderBulk(data) {
    bulkState = data; bulkBusy = !!data.busy;updateBackupButtons();
    if(manualState)renderManual(manualState);
    const topicMode = data.mode === 'topic';
    $('#scope-topic').checked = topicMode; $('#scope-group').checked = !topicMode;
    $('#scope-topic').disabled = bulkBusy || active || manualBusy || backupBusy || !data.topicAvailable;
    $('#scope-group').disabled = bulkBusy || active || manualBusy || backupBusy;
    $('.bulk-scope-note').textContent = data.topicAvailable ? 'Tema abierto: ' + (data.availableTopicTitle || 'Tema #' + data.availableTopicId) : 'Abre un tema del grupo para descargar solo sus vídeos.';
    $('.bulk-group').textContent = data.busy || data.found ? data.group || data.availableGroup || '' : data.availableGroup || 'Abre el grupo en Telegram Web K';
    $('.bulk-topic').hidden = !topicMode;
    $('.bulk-topic').textContent = 'Tema: ' + (data.topicTitle || data.availableTopicTitle || 'abre uno en Telegram');
    $('.bulk-start').disabled = bulkBusy || active || manualBusy || backupBusy || !data.available || !data.canStart;
    $('.bulk-start').textContent = data.phase === 'choosing' ? 'Elige una carpeta…' : data.canNext ? 'Elegir carpeta e iniciar otra cola' : topicMode ? 'Elegir carpeta y descargar tema' : 'Elegir carpeta y descargar';
    $('.bulk-start').classList.toggle('secondary', !!data.canNext);
    $('.bulk-next').hidden = !data.canNext;
    $('.bulk-batch-summary').hidden = !data.batchIndex;
    $('.bulk-batch-summary').textContent = data.batchIndex ? 'Tanda ' + data.batchIndex + ': ' + (data.batchSaved || 0) + ' nuevos · ' + bytes(data.batchBytes || 0) + ' · ' + (data.pending || 0) + ' pendientes. Orden: ' + (data.order === 'desc' ? 'recientes primero' : 'antiguos primero') + '.' : '';
    $('.bulk-resume-info').hidden = !data.progressCount;
    $('.bulk-resume-info').textContent = data.progressCount ? data.progressCount + ' vídeos registrados en esta carpeta.' + (data.lastCompleted ? ' Último: ' + data.lastCompleted : '') : '';
    $('.bulk-start-info').hidden = !data.boundary;
    $('.bulk-start-info').textContent = data.boundary ? 'Inicio fijado: ' + data.boundary.name + '. Hacia vídeos más ' + (data.boundary.direction === 'asc' ? 'recientes' : 'antiguos') + ' · ' + (data.boundary.include ? 'incluye el vídeo de inicio' : 'excluye el vídeo de inicio') + '. Al volver, elige Inicio guardado y la misma carpeta.' : '';
    $('.bulk-blocked').hidden = !data.blocked;
    $('.bulk-blocked').textContent = data.blocked ? 'Próximo vídeo: ' + data.blocked.name + ' (' + bytes(data.blocked.size) + ').' : '';
    renderBatchOptions();
    $('.bulk-setup').hidden = !!data.directoryPicker || !data.available;
    $('.bulk-stats').hidden = !data.busy && !data.found && data.phase === 'idle';
    for (const key of ['found','saved','skipped','failed']) $('.bulk-' + key).textContent = String(data[key] || 0);
    const labels = {choosing:topicMode ? 'Elige una carpeta. Se creará una subcarpeta para este tema.' : 'Elige una carpeta. Se creará una subcarpeta para este grupo.', scanning:topicMode ? 'Buscando solo los vídeos de este tema…' : 'Buscando todos los vídeos del historial accesible…', downloading:'Descargando la cola…', paused:'En pausa.', stopping:'Deteniendo la cola…'};
    const message = data.message || labels[data.phase] || data.setup || 'Elige una carpeta para empezar. Mantén abierta esta pestaña.';
    if ($('.bulk-message').textContent !== message) $('.bulk-message').textContent = message;
    $('.bulk-folder').textContent = data.folder ? 'Carpeta: ' + (data.rootFolder ? data.rootFolder + ' / ' : '') + data.folder : '';
    $('.bulk-total').textContent = data.totalBytes ? 'Tamaño de toda la cola: ' + bytes(data.totalBytes) : '';
    const overall = $('.bulk-overall'); overall.hidden = !data.busy && !data.found;
    if (data.completedScan && data.found) overall.value = Math.min(100,((data.saved || 0)+(data.skipped || 0)+(data.failed || 0))*100/data.found);
    else overall.removeAttribute('value');
    $('.bulk-current').hidden = !data.current;
    $('.bulk-current').textContent = data.current?.name || '';
    $('.bulk-bytes').textContent = data.current ? bytes(data.current.bytes) + ' de ' + bytes(data.current.total)+(data.current.speed?' · '+bytes(data.current.speed)+'/s':'') : '';
    $('.bulk-file-progress').hidden = !data.current;
    $('.bulk-file-progress').value = data.current?.total ? data.current.bytes*100/data.current.total : 0;
    $('.bulk-pause').hidden = !data.busy || ['paused','choosing','stopping'].includes(data.phase);
    $('.bulk-resume').hidden = data.phase !== 'paused';
    $('.bulk-stop').hidden = !data.busy;
    $('.bulk-retry').hidden = !data.canRetry;
    const errors = Array.isArray(data.errors) ? data.errors : [];
    $('.bulk-errors').hidden = !errors.length;
    const list = $('.bulk-errors ul'); list.replaceChildren();
    for (const error of errors.slice(-8)) { const li=document.createElement('li');li.textContent=String(error.name || '')+': '+String(error.message || '');list.appendChild(li); }
    if (!data.busy) flushRecords();
    render();
  }
  function flushRecords() {
    clearTimeout(recordTimer); recordTimer=null;
    if (!pendingRecords.size) return;
    const entries=[...pendingRecords.entries()];pendingRecords.clear();
    recordWrites=recordWrites.then(async()=>{
      const updates={};
      for (const [scope,records] of entries) {
        for (const record of records.values()) updates['tgLocalBulkHistory:'+scope+':'+record.docId]={mid:record.mid,name:record.name,size:record.size,savedAt:record.savedAt};
      }
      await chrome.storage.local.set(updates);
    }).catch(()=>{$('.bulk-record-status').textContent='El registro local no pudo actualizarse. La cola seguirá comprobando los archivos existentes en la carpeta.';});
  }
  function rememberRecord(record) {
    if (!record || !/^\d+:-?\d+(?::topic:\d+)?$/.test(String(record.scope)) || !/^-?\d{1,24}$/.test(String(record.docId)) || typeof record.name!=='string' || record.name.length>200 || !Number.isSafeInteger(record.size) || record.size<=0) return;
    if (!pendingRecords.has(record.scope)) pendingRecords.set(record.scope,new Map());
    pendingRecords.get(record.scope).set(record.docId,record);
    if (!recordTimer) recordTimer=setTimeout(flushRecords,600);
  }

  document.addEventListener('tg-local:reply', event => {
    if (event.target !== document || typeof event.detail !== 'string' || event.detail.length > 150000) return;
    let data;
    try { data = JSON.parse(event.detail); } catch { return; }
    if (data.channel !== channel) return;
    connected = true;
    if (data.type === 'state') {
      items = Array.isArray(data.items) ? data.items.slice(0,60) : [];
      if (!data.picker) { $('#disk').checked = false; $('#disk').disabled = true; }
      render();
    } else if (data.type === 'notice') {
      notice(data.message, true);
    } else if (data.type === 'progress') {
      active = ['preparing', 'downloading', 'saving'].includes(data.phase);
      $('.status').hidden = false; $('.status').classList.toggle('error', data.phase === 'error');
      $('.cancel').hidden = !active || data.phase === 'saving';
      $('.progress').hidden = !active;
      const labels = {preparing: 'Elige dónde guardar el vídeo…', downloading: 'Guardando vídeo…', saving: 'Terminando el archivo…'};
      $('.status-title').textContent = active ? labels[data.phase] : data.message;
      $('.detail').textContent = data.bytes ? bytes(data.bytes) + (data.total ? ' de ' + bytes(data.total) : '') : '';
      if (data.total && data.phase === 'downloading') $('.progress').value = Math.min(100, data.bytes / data.total * 100);
      else $('.progress').removeAttribute('value');
      render();
      if (bulkState) renderBulk(bulkState);
      if (manualState) renderManual(manualState);updateBackupButtons();
    } else if (data.type === 'bulk-state') renderBulk(data);
    else if (data.type === 'bulk-record') rememberRecord(data.record);
    else if (data.type === 'manual-state') renderManual(data);
    else if (data.type === 'manual-persist') saveManualPatch(data);
    else if(data.type==='backup-state')renderBackup(data);
    else if(data.type==='backup-topics')receiveBackupTopics(data);
    else if(data.type==='photo-state'){photoState=data;$('.photo-save').disabled=!!data.busy;$('.photo-save').classList.toggle('unavailable',!data.available);$('.photo-save').textContent=data.busy?'… Imagen':'↓ Imagen';$('.photo-save').title=data.busy?'Guardando imagen…':data.available?'Guardar imagen desde el navegador ('+data.width+' × '+data.height+')':data.reason||'Abre una imagen y espera a que sus datos locales estén disponibles.';}
    else if(data.type==='photo-result'){clearTimeout(photoNoticeTimer);$('.photo-notice').textContent=String(data.message||'');$('.photo-notice').classList.toggle('error',!!data.error);$('.photo-notice').hidden=false;photoNoticeTimer=setTimeout(()=>{$('.photo-notice').hidden=true;},7000);}
  });
  function renderManual(data) {
    manualState=data;manualBusy=!!data.busy;
    const anchor=data.anchor||{};
    $('.manual-anchor').textContent=anchor.available?anchor.name:anchor.message||'Abre un vídeo en el visor grande de Web K.';
    const already=Array.isArray(data.items)&&data.items.some(item=>item.key===anchor.key);
    $('.manual-add').disabled=!anchor.available;$('.quick-add').disabled=!anchor.available;
    $('.quick-add').textContent=already?'✓ Vídeo añadido a Mi cola':'+ Añadir vídeo abierto a Mi cola';
    $('.tab-count').textContent=String(data.pending||0);
    $('.manual-add').textContent=already?'✓ Vídeo ya seleccionado':'+ Añadir vídeo abierto a la cola';
    $('.manual-summary').textContent=(data.pending||0)+' pendientes · '+(data.saved||0)+' completados'+(data.total>100?' · mostrando los primeros 100':'');
    $('.manual-message').textContent=data.message||'';$('.manual-message').dataset.phase=data.phase||'idle';
    $('.manual-start').classList.toggle('secondary',!!data.hasDirectory);$('.manual-start').textContent=data.hasDirectory?'Elegir otra carpeta':'Elegir carpeta y descargar selección';
    $('.manual-start').disabled=active||bulkBusy||manualBusy||backupBusy||!data.canStart;
    $('.manual-next').hidden=!data.hasDirectory||!data.canStart;
    $('.manual-next').disabled=active||bulkBusy||manualBusy||backupBusy;
    $('#manual-count').disabled=manualBusy;$('#manual-parallel').disabled=manualBusy;
    $('.manual-pause').hidden=!manualBusy||['paused','choosing','stopping'].includes(data.phase);
    $('.manual-resume').hidden=data.phase!=='paused';$('.manual-stop').hidden=!manualBusy;
    $('.manual-clear-done').hidden=!data.saved;$('.manual-clear-done').disabled=manualBusy;
    $('.manual-current').textContent=(data.folder?'Carpeta: '+data.folder+'. ':'')+(data.current?data.current.name+' · '+bytes(data.current.bytes)+' de '+bytes(data.current.total)+(data.current.speed?' · '+bytes(data.current.speed)+'/s':''):'');
    $('.manual-progress').hidden=!data.current;$('.manual-progress').value=data.current?.total?100*data.current.bytes/data.current.total:0;
    const signature=JSON.stringify([(data.items||[]).map(item=>[item.key,item.name,item.size]),manualBusy]);
    if(signature!==manualSignature){
      manualSignature=signature;const list=$('.manual-list'),scroll=list.scrollTop;list.replaceChildren();manualRows.clear();
      for(const item of data.items||[]){
        const row=document.createElement('div');row.className='manual-row';
        const name=document.createElement('span');name.textContent=item.name;
        const detail=document.createElement('small');detail.textContent=(item.status==='saved'?'Completado':'Pendiente')+' · '+bytes(item.size);name.append(detail);manualRows.set(item.key,detail);
        const remove=document.createElement('button');remove.className='subtle';remove.textContent='Quitar';remove.disabled=manualBusy;
        remove.addEventListener('click',()=>command('manual-remove',{key:item.key}));row.append(name,remove);list.append(row);
      }list.scrollTop=scroll;
    }
    for(const item of data.items||[]){const detail=manualRows.get(item.key),text=(item.status==='saved'?'Completado':'Pendiente')+' · '+bytes(item.size);if(detail&&detail.textContent!==text)detail.textContent=text;}
    updateBackupButtons();render();if(bulkState)renderBatchOptions();
  }
  function backupOptions(){
    return {types:['videos','photos','audio','documents'].filter(name=>$('#backup-'+name).checked),messages:$('#backup-messages').checked,
      from:$('#backup-from').value,to:$('#backup-to').value,parallelism:Number($('#backup-parallel').value)};
  }
  function backupPreferences(){
    chrome.storage.local.set({tgLocalBackupOptions:backupOptions()}).catch(()=>{});
  }
  function restoreBackupSelection(scope){
    if(!scope||appliedBackupSelection===scope)return;
    appliedBackupSelection=scope;selectedBackupTopics.clear();
    const saved=backupSelections[scope];
    $('#backup-selected').checked=saved?.mode==='selected';$('#backup-all').checked=!$('#backup-selected').checked;
    for(const id of saved?.ids||[])if(Number.isSafeInteger(id)&&id>0)selectedBackupTopics.add(id);
    for(const input of root.querySelectorAll('.backup-topic-list input'))input.checked=selectedBackupTopics.has(Number(input.dataset.topic));
    renderTopicSelection();
  }
  function saveBackupSelection(){
    const scope=backupState?.availableScope;if(!scope)return;
    backupSelections[scope]={mode:$('#backup-all').checked?'all':'selected',ids:[...selectedBackupTopics]};
    chrome.storage.local.set({tgLocalBackupSelections:backupSelections}).catch(()=>{});
  }
  function updateBackupButtons(){
    if(!$('.backup-start'))return;
    const locked=active||bulkBusy||manualBusy||backupBusy;
    $('.backup-start').disabled=locked||!backupState?.available||!backupState?.topicsReady;
    $('.backup-update').disabled=locked||!backupState?.topicsReady;
    $('.backup-refresh').disabled=locked||!backupState?.available;
    for(const selector of ['#backup-all','#backup-selected','#backup-videos','#backup-photos','#backup-audio','#backup-documents','#backup-messages','#backup-from','#backup-to','#backup-parallel','.backup-select-all'])$(selector).disabled=backupBusy;
    for(const input of root.querySelectorAll('.backup-topic-list input'))input.disabled=backupBusy;
  }
  function renderTopicSelection(){
    $('.backup-topic-picker').hidden=!$('#backup-selected').checked;
    const ready=backupState?.topicsReady&&backupTopicScope===backupState.availableScope;
    $('.backup-selected-summary').textContent=!ready?'Carga los temas para continuar.':$('#backup-all').checked?backupTopics.length+' temas · se creará una carpeta por tema.':selectedBackupTopics.size+' de '+backupTopics.length+' temas seleccionados.';
  }
  function receiveBackupTopics(data){
    if(typeof data.scope!=='string'||!Array.isArray(data.topics)||data.topics.length>100||data.scope!==backupState?.availableScope)return;
    if(data.reset){
      const same=backupTopicScope===data.scope;
      if(!same)restoreBackupSelection(data.scope);backupTopics=[];backupTopicScope=data.scope;backupTopicRevision=data.revision;
    }
    if(data.revision!==backupTopicRevision)return;
    for(const t of data.topics)if(Number.isSafeInteger(t.id)&&t.id>0&&typeof t.title==='string'&&!backupTopics.some(x=>x.id===t.id))backupTopics.push({id:t.id,title:t.title.slice(0,140)});
    if(!data.done)return;
    const valid=new Set(backupTopics.map(t=>t.id));for(const id of selectedBackupTopics)if(!valid.has(id))selectedBackupTopics.delete(id);
    const list=$('.backup-topic-list');list.replaceChildren();
    for(const topic of backupTopics){
      const label=document.createElement('label'),check=document.createElement('input'),title=document.createElement('span');check.type='checkbox';check.dataset.topic=String(topic.id);check.checked=selectedBackupTopics.has(topic.id);check.disabled=backupBusy;
      check.addEventListener('change',()=>{if(check.checked)selectedBackupTopics.add(topic.id);else selectedBackupTopics.delete(topic.id);renderTopicSelection();saveBackupSelection();});
      title.textContent=topic.title+' · #'+topic.id;label.dataset.search=topic.title.toLocaleLowerCase('es');label.append(check,title);list.append(label);
    }
    renderTopicSelection();
  }
  function renderBackup(data){
    backupState=data;backupBusy=!!data.busy;
    if(!backupBusy){
      if(backupTopicScope&&backupTopicScope!==data.availableScope){backupTopics=[];backupTopicScope='';$('.backup-topic-list').replaceChildren();}
      restoreBackupSelection(data.availableScope);
    }
    $('.backup-context').textContent=data.busy?data.group||data.availableGroup:data.availableGroup||'Abre el grupo en Telegram Web K';
    $('.backup-message').textContent=data.message||'';$('.backup-message').dataset.phase=data.phase||'idle';
    $('.backup-start').textContent=data.phase==='choosing'?'Elige una carpeta…':data.hasDirectory?'Elegir otra carpeta':'Elegir carpeta y crear copia';$('.backup-start').classList.toggle('secondary',!!data.hasDirectory);
    $('.backup-update').hidden=!data.hasDirectory;
    $('.backup-stats').hidden=!data.found&&!data.messageCount&&!data.busy;
    for(const key of ['found','saved','skipped','failed'])$('.backup-'+key).textContent=String(data[key]||0);
    $('.backup-folder').textContent=data.folder?'Carpeta: '+data.folder:'';
    $('.backup-detail').textContent=data.topicsTotal?(data.phase==='scanning'?'Revisando: '+data.currentTopic+' · ':'')+data.topicsDone+' / '+data.topicsTotal+' temas revisados · '+(data.messageCount||0)+' mensajes · '+bytes(data.totalBytes||0)+' en archivos':'';
    const overall=$('.backup-overall');overall.hidden=!data.busy&&!data.found;
    if(data.completedScan&&data.found)overall.value=100*((data.saved||0)+(data.skipped||0)+(data.failed||0))/data.found;else overall.removeAttribute('value');
    $('.backup-current').textContent=data.current?.name||'';$('.backup-bytes').textContent=data.current?bytes(data.current.bytes)+' de '+bytes(data.current.total)+(data.current.speed?' · '+bytes(data.current.speed)+'/s':''):'';
    $('.backup-file').hidden=!data.current;$('.backup-file').value=data.current?.total?100*data.current.bytes/data.current.total:0;
    $('.backup-pause').hidden=!data.busy||['paused','choosing','topics','stopping'].includes(data.phase);$('.backup-resume').hidden=data.phase!=='paused';$('.backup-stop').hidden=!data.busy;
    const warnings=[...(data.errors||[]),...(data.notes||[])].slice(-12),list=$('.backup-errors ul');list.replaceChildren();$('.backup-errors').hidden=!warnings.length;
    for(const warning of warnings){const li=document.createElement('li');li.textContent=(warning.name||'')+': '+(warning.message||'');list.append(li);}
    updateBackupButtons();renderTopicSelection();if(manualState)renderManual(manualState);if(bulkState)renderBatchOptions();render(true);
  }
  function backupCommand(type){
    if($('#backup-selected').checked){
      const ids=[...selectedBackupTopics];if(!ids.length){$('.backup-message').textContent='Selecciona al menos un tema.';return;}
      for(let n=0;n<ids.length;n+=200)command('backup-select',{expectedScope:backupState?.availableScope,reset:n===0,done:n+200>=ids.length,ids:ids.slice(n,n+200)});
    }
    command(type,{expectedScope:backupState?.availableScope||'',selection:$('#backup-all').checked?'all':'selected',options:backupOptions()});
  }
  $('.backup-refresh').addEventListener('click',()=>command('backup-topics-load'));
  $('.backup-start').addEventListener('click',()=>backupCommand('backup-start'));$('.backup-update').addEventListener('click',()=>backupCommand('backup-update'));
  for(const action of ['pause','resume','stop'])$('.backup-'+action).addEventListener('click',()=>command('backup-'+action));
  for(const id of ['backup-all','backup-selected'])$('#'+id).addEventListener('change',()=>{renderTopicSelection();saveBackupSelection();});
  for(const id of ['backup-videos','backup-photos','backup-audio','backup-documents','backup-messages','backup-from','backup-to','backup-parallel'])$('#'+id).addEventListener('change',backupPreferences);
  $('.backup-select-all').addEventListener('click',()=>{for(const t of backupTopics)selectedBackupTopics.add(t.id);for(const input of root.querySelectorAll('.backup-topic-list input'))input.checked=true;renderTopicSelection();saveBackupSelection();});
  $('.backup-topic-filter').addEventListener('input',()=>{const query=$('.backup-topic-filter').value.toLocaleLowerCase('es');for(const label of root.querySelectorAll('.backup-topic-list label'))label.hidden=!label.dataset.search.includes(query);});
  chrome.storage.local.get('tgLocalBackupOptions').then(({tgLocalBackupOptions:opts})=>{
    if(!opts)return;for(const name of ['videos','photos','audio','documents'])$('#backup-'+name).checked=Array.isArray(opts.types)&&opts.types.includes(name);
    $('#backup-messages').checked=opts.messages!==false;
    for(const key of ['from','to'])if(typeof opts[key]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(opts[key]))$('#backup-'+key).value=opts[key];
    if([1,4,8,16].includes(opts.parallelism))$('#backup-parallel').value=String(opts.parallelism);
  }).catch(()=>{});
  chrome.storage.local.get('tgLocalBackupSelections').then(({tgLocalBackupSelections:scopes})=>{
    if(!scopes||typeof scopes!=='object')return;
    for(const [scope,value]of Object.entries(scopes))if(/^\d+:-?\d+:backup$/.test(scope)&&['all','selected'].includes(value?.mode)&&Array.isArray(value.ids))backupSelections[scope]={mode:value.mode,ids:value.ids.filter(id=>Number.isSafeInteger(id)&&id>0).slice(0,10000)};
    appliedBackupSelection='';if(!backupBusy)restoreBackupSelection(backupState?.availableScope);
  }).catch(()=>{});
  const manualCache=new Map();let manualWrites=Promise.resolve();
  const restored=chrome.storage.local.get('tgLocalManualQueue').then(result=>{
    const entries=result.tgLocalManualQueue?.items;
    if(Array.isArray(entries))for(const item of entries.slice(0,10000)){
      if(item&&Number.isSafeInteger(item.account)&&/^-?\d{1,24}$/.test(String(item.docId)))manualCache.set(item.account+':'+item.docId,item);
    }
    const values=[...manualCache.values()];
    for(let n=0;n<values.length;n+=10)command('manual-restore',{items:values.slice(n,n+10)});
  }).catch(()=>{command('manual-persist-result',{ok:false});});
  function saveManualPatch(data){
    manualWrites=manualWrites.then(async()=>{
      await restored;
      if(data.operation==='upsert')for(const item of data.items||[])manualCache.set(item.account+':'+item.docId,item);
      if(data.operation==='remove')for(const key of data.keys||[])manualCache.delete(key);
      await chrome.storage.local.set({tgLocalManualQueue:{version:1,items:[...manualCache.values()]}});
      command('manual-persist-result',{id:data.id,ok:true});
    }).catch(()=>{command('manual-persist-result',{id:data.id,ok:false});});
  }
  function manualCommand(type){
    command(type,{parallelism:Number($('#manual-parallel').value),limits:{maxFiles:$('#manual-count').value==='all'?null:Number($('#manual-count').value),maxBytes:null}});
  }
  $('.quick-add').addEventListener('click',()=>command('manual-add',{expectedAnchor:manualState?.anchor?.token||''}));
  $('.go-queue').addEventListener('click',()=>setView('manual'));
  $('.manual-add').addEventListener('click',()=>command('manual-add',{expectedAnchor:manualState?.anchor?.token||''}));
  $('.manual-start').addEventListener('click',()=>manualCommand('manual-start'));
  $('.manual-next').addEventListener('click',()=>manualCommand('manual-next'));
  for(const action of ['pause','resume','stop','clear-done'])$('.manual-'+action).addEventListener('click',()=>command('manual-'+action));
  for(const id of ['manual-count','manual-parallel'])$('#'+id).addEventListener('change',()=>{chrome.storage.local.set({tgLocalManualOptions:{count:$('#manual-count').value,parallelism:Number($('#manual-parallel').value)}}).catch(()=>{});});
  chrome.storage.local.get('tgLocalManualOptions').then(({tgLocalManualOptions:opts})=>{if(['10','20','40','60','100','all'].includes(opts?.count))$('#manual-count').value=opts.count;if([1,4,8,16].includes(opts?.parallelism))$('#manual-parallel').value=String(opts.parallelism);}).catch(()=>{});
  $('.photo-save').addEventListener('click',()=>command('photo-save',{token:photoState?.token||''}));
  $('.launch').addEventListener('click', () => toggle());
  $('.close').addEventListener('click', () => toggle(false));
  $('.scan').addEventListener('click', () => { command('hello'); command('scan'); });
  $('.clear').addEventListener('click', () => command('clear'));
  $('.cancel').addEventListener('click', () => command('cancel'));
  $('.mode-one').addEventListener('click',()=>setMode(false));
  $('.mode-group').addEventListener('click',()=>setMode(true));
  $('.mode-manual').addEventListener('click',()=>setView('manual'));
  $('.mode-backup').addEventListener('click',()=>setView('backup'));
  $('.mode-tabs').addEventListener('keydown',event=>{
    const names=['one','manual','group','backup'];let next=names.indexOf(view);
    if(event.key==='ArrowRight')next=(next+1)%4;else if(event.key==='ArrowLeft')next=(next+3)%4;else if(event.key==='Home')next=0;else if(event.key==='End')next=3;else return;
    event.preventDefault();setView(names[next]);$('.mode-'+names[next]).focus();
  });
  $('.bulk-start').addEventListener('click', () => batchCommand('bulk-start'));
  $('.bulk-next').addEventListener('click', () => batchCommand('bulk-next'));
  $('.bulk-retry').addEventListener('click', () => batchCommand('bulk-retry'));
  $('.start-refresh').addEventListener('click', () => command('bulk-status'));
  for (const id of ['batch-start-mode','batch-direction','batch-include']) $('#' + id).addEventListener('change', () => { renderBatchOptions(); command('bulk-status'); });
  for (const id of ['scope-topic','scope-group']) $('#' + id).addEventListener('change', () => { if ($('#' + id).checked) command('bulk-mode', {mode:$('#scope-topic').checked ? 'topic' : 'group'}); });
  for (const [selector,type] of [['.bulk-pause','bulk-pause'],['.bulk-resume','bulk-resume'],['.bulk-stop','bulk-stop']]) $(selector).addEventListener('click',()=>command(type));
  for (const id of ['batch-count','batch-custom','batch-gb','batch-order','batch-continue','batch-parallel']) $('#' + id).addEventListener('change', () => {
    renderBatchOptions();
    try { batchOptions(); chrome.storage.local.set({tgLocalBatchOptions:{parallelism:Number($('#batch-parallel').value),selection:$('#batch-count').value,custom:$('#batch-custom').value,gb:$('#batch-gb').value,order:$('#batch-order').value,continueProgress:$('#batch-continue').checked}}).catch(()=>{}); } catch {}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flushRecords();});
  root.addEventListener('keydown', event => { if (event.key === 'Escape') { toggle(false); $('.launch').focus(); } });
  chrome.runtime.onMessage.addListener(message => { if (message?.type === 'tg-local-toggle') toggle(); });
  for (const id of ['memory','disk']) {
    $('#' + id).addEventListener('change', () => {
      chrome.storage.local.set({tgLocalOptions: {memoryOnly: $('#memory').checked, disk: $('#disk').checked}}).catch(() => {});
    });
  }
  chrome.storage.local.get('tgLocalOptions').then(({tgLocalOptions: opts}) => {
    if (opts) { $('#memory').checked = !!opts.memoryOnly; if (!$('#disk').disabled) $('#disk').checked = opts.disk !== false; }
  }).catch(() => {});
  chrome.storage.local.get('tgLocalBatchOptions').then(({tgLocalBatchOptions: opts}) => {
    if (!opts) return;
    if (['10','20','50','custom','all'].includes(opts.selection)) $('#batch-count').value = opts.selection;
    if([1,4,8,16].includes(opts.parallelism))$('#batch-parallel').value=String(opts.parallelism);
    if (opts.custom !== undefined) $('#batch-custom').value = opts.custom;
    if (opts.gb !== undefined) $('#batch-gb').value = opts.gb;
    if (['asc','desc'].includes(opts.order)) $('#batch-order').value = opts.order;
    $('#batch-continue').checked = opts.continueProgress !== false;
    renderBatchOptions();
  }).catch(() => {});
  command('hello');
  setTimeout(() => {
    if (!connected) { command('hello'); notice('Recarga esta pestaña de Telegram para activar la extensión. Si tienes otro descargador, desactívalo mientras pruebas esta versión.'); }
  }, 2500);
})();
