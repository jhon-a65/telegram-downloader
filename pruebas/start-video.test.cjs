/* Inicio desde el visor real de la extensión: DOM, Telegram y disco simulados. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, until, OFFSET} = require('./topic-fixture.cjs');
const FILE = 'Telegram-progreso.json';
const settled = h => () => !h.state.busy && ['done','batch-done','error'].includes(h.state.phase);
const ids = h => h.calls.parts.map(part => part.id);
const progress = h => JSON.parse(h.dir(101).files.get(FILE).toString());

function openVideo(h, index, topic = 101, refresh = true) {
  const w = h.w, d = w.document, rows = h.messages.filter(row => row.topic === topic);
  const message = rows[index].message;
  w.HTMLElement.prototype.getBoundingClientRect = () => ({left:20, top:20, right:900, bottom:700, width:880, height:680});
  let viewer = w.appMediaViewer;
  if (!viewer) {
    const whole = d.createElement('div'); whole.className = 'media-viewer-whole active'; d.body.append(whole);
    viewer = w.appMediaViewer = {wholeDiv:whole, content:{}};
  }
  const old = viewer.content.mover;
  if (old) { old.classList.remove('center'); old.classList.add('moving'); }
  const mover = d.createElement('div'); mover.className = 'media-viewer-mover center active';
  const video = d.createElement('video'); video.src = 'blob:https://web.telegram.org/video-' + message.id;
  mover.append(video); viewer.wholeDiv.append(mover); viewer.content.mover = mover;
  viewer.target = {peerId:-123, mid:OFFSET + message.id, message:{...message, peerId:-123, mid:OFFSET + message.id}};
  if (refresh) h.refresh();
  return {viewer, video, mover, message};
}
function fromVideo(h, {direction='asc', include=false, count=null} = {}) {
  h.$('#batch-start-mode').value = 'video'; h.$('#batch-direction').value = direction;
  h.$('#batch-include').checked = include;
  h.$('#batch-count').value = count === null ? 'all' : [10,20,50].includes(count) ? String(count) : 'custom';
  h.$('#batch-custom').value = String(count || 10);
  h.$('#batch-start-mode').dispatchEvent(new h.w.Event('change'));
}
function startCommand(h, overrides = {}) {
  h.w.document.dispatchEvent(new h.w.CustomEvent('tg-local:command', {detail:JSON.stringify({
    channel:h.state.channel, type:'bulk-start', mode:'topic', expectedScope:h.state.availableScope,
    order:'asc', limits:{maxFiles:10,maxBytes:null}, continueProgress:true,
    start:{mode:'video',include:false,expectedAnchor:h.state.anchor?.token || ''}, ...overrides
  })}));
}

for (const direction of ['asc','desc']) for (const include of [false,true]) {
  test(`El visor fija el inicio; dirección ${direction}, incluir ${include}`, async t => {
    const h = harness(t, {count:8}), selected = openVideo(h, 3);
    fromVideo(h, {direction, include});
    assert.equal(h.state.anchor.available, true); assert.equal(h.state.anchor.messageId, selected.message.id);
    assert.match(h.$('.start-anchor-name').textContent, /Tema-101-4/);
    h.start(); await until(settled(h));
    const all = h.expected(101), expected = direction === 'asc' ? all.slice(include ? 3 : 4) : all.slice(0, include ? 4 : 3).reverse();
    assert.equal(h.state.phase, 'done'); assert.deepEqual(ids(h), expected);
    assert.equal(h.state.found, expected.length); assert.equal(h.state.saved, expected.length);
    assert.equal(progress(h).boundary.mid, OFFSET + selected.message.id);
    assert.equal(progress(h).boundary.direction, direction); assert.equal(progress(h).boundary.include, include);
    assert.equal(progress(h).completed.length, expected.length);
    assert.match(h.$('.bulk-start-info').textContent, /Inicio fijado/);
    assert.ok(h.calls.topics.every(call => call.threadId === OFFSET + 101));
  });
}

test('Los primeros 20 movidos sin registro quedan fuera al abrir el último descargado', async t => {
  const h = harness(t, {count:25}); openVideo(h, 19); fromVideo(h);
  h.start(); await until(settled(h));
  assert.deepEqual(ids(h), h.expected(101).slice(20)); assert.equal(h.state.saved, 7);
  assert.equal(h.state.skipped, 0, 'Los excluidos no deben figurar falsamente como descargados.');
  assert.equal(progress(h).completed.length, 7);
});

test('El punto de inicio, sentido y omisión de movidos sobreviven a cerrar todo el navegador', async t => {
  const first = harness(t, {count:25}); openVideo(first, 9); fromVideo(first, {count:10});
  first.start(); await until(settled(first));
  assert.deepEqual(ids(first), first.expected(101).slice(10,20));
  const root = first.root, dir = first.dir(101), initial = progress(first).boundary;
  for (const name of dir.videoFiles.keys()) dir.files.delete(name);
  await first.close();
  const second = harness(t, {count:25, root});
  assert.equal(second.$('#batch-start-mode').value, 'continue');
  assert.equal(second.state.anchor.available, false, 'No hace falta reabrir el vídeo para recuperar el inicio.');
  second.start(); await until(settled(second));
  assert.deepEqual(ids(second), second.expected(101).slice(20)); assert.equal(second.state.skipped, 10);
  assert.deepEqual(progress(second).boundary, initial); assert.equal(progress(second).completed.length, 17);
  assert.equal(second.state.found, 17, 'Los 10 vídeos previos al punto siguen fuera de la cola.');
});

test('El sentido hacia antiguos también se restaura aunque el orden del panel diga antiguos primero', async t => {
  const first = harness(t, {count:25}); openVideo(first, 23); fromVideo(first, {direction:'desc',count:10});
  first.start(); await until(settled(first));
  assert.deepEqual(ids(first), first.expected(101).slice(13,23).reverse());
  const root = first.root, dir = first.dir(101);
  for (const name of dir.videoFiles.keys()) dir.files.delete(name);
  await first.close();
  const second = harness(t, {count:25,root}); second.start(); await until(settled(second));
  assert.equal(second.state.order, 'desc'); assert.deepEqual(ids(second), second.expected(101).slice(0,13).reverse());
});

test('Siguiente tanda conserva el punto aunque el usuario cierre el visor y lo abra en otro vídeo', async t => {
  const h = harness(t, {count:25}); openVideo(h, 4); fromVideo(h, {count:10}); h.start(); await until(settled(h));
  const searches = h.calls.topics.length, start = progress(h).boundary;
  openVideo(h, 0); h.w.appMediaViewer.wholeDiv.classList.remove('active'); h.refresh();
  assert.equal(h.state.anchor.available, false);
  h.$('.bulk-next').click(); await until(() => settled(h)() && h.state.batchIndex === 2);
  assert.deepEqual(ids(h), h.expected(101).slice(5,25)); assert.deepEqual(progress(h).boundary, start);
  assert.equal(h.calls.pickers, 1); assert.equal(h.calls.topics.length, searches);
});

test('Navegar deja como referencia únicamente el mover central actual', async t => {
  const h = harness(t, {count:8}); openVideo(h, 1); const current = openVideo(h, 5);
  fromVideo(h); assert.equal(h.state.anchor.messageId, current.message.id);
  h.start(); await until(settled(h)); assert.deepEqual(ids(h), h.expected(101).slice(6));
});

test('Un vídeo pausado y su blob sin metadatos siguen vinculados al mensaje nativo', async t => {
  const h = harness(t, {count:5}), selected = openVideo(h, 2);
  assert.equal(selected.video.paused, true); fromVideo(h, {include:true,count:1});
  h.start(); await until(settled(h)); assert.deepEqual(ids(h), [selected.message.media.document.id]);
});

test('No usa la miniatura ni una URL de recurso como sustituto de un visor sin mensaje', t => {
  const h = harness(t, {count:4}); const opened = openVideo(h, 1);
  opened.viewer.target.message = undefined; fromVideo(h);
  assert.equal(h.state.anchor.available, false); assert.equal(h.$('.bulk-start').disabled, true);
  startCommand(h); assert.equal(h.calls.pickers, 0); assert.equal(ids(h).length, 0);
  assert.match(h.state.message, /vinculado.*mensaje/);
});

test('Un visor cerrado o un mover distinto al nativo no puede fijar un inicio', t => {
  const h = harness(t, {count:4}), opened = openVideo(h, 1); fromVideo(h);
  opened.viewer.content.mover = h.w.document.createElement('div'); h.refresh();
  assert.equal(h.state.anchor.available, false); startCommand(h); assert.equal(h.calls.pickers, 0);
  opened.viewer.content.mover = opened.mover; opened.viewer.wholeDiv.classList.remove('active'); h.refresh();
  assert.equal(h.state.anchor.available, false); startCommand(h); assert.equal(h.calls.pickers, 0);
});

test('Cambiar el vídeo tras la vista previa se rechaza antes del selector de carpeta', t => {
  const h = harness(t, {count:6}); openVideo(h, 1); fromVideo(h);
  const old = h.state.anchor.token; openVideo(h, 4, 101, false);
  assert.equal(h.state.anchor.token, old); h.start();
  assert.equal(h.calls.pickers, 0); assert.equal(ids(h).length, 0);
  assert.match(h.state.message, /Cambió el vídeo abierto/);
  assert.notEqual(h.state.anchor.token, old, 'El error actualiza la referencia visible para revisar y repetir el clic.');
});

test('Cambiar de vídeo durante el selector de carpeta también detiene el inicio', async t => {
  const h = harness(t, {count:6}); openVideo(h, 1); fromVideo(h);
  h.w.showDirectoryPicker = async () => { h.calls.pickers++; openVideo(h, 4); return h.root; };
  h.start(); await until(() => /Cambiaste de vídeo mientras/.test(h.state.message));
  assert.equal(ids(h).length, 0); assert.equal(h.calls.topics.length, 0); assert.equal(h.root.children.size, 0);
});

test('El vídeo de otro tema se rechaza; elegir Todo el grupo lo permite de forma expresa', async t => {
  const h = harness(t, {count:4}); openVideo(h, 1, 202); fromVideo(h);
  assert.equal(h.state.anchor.available, false); assert.match(h.state.anchor.message, /otro tema/);
  startCommand(h); assert.equal(h.calls.pickers, 0);
  h.select('group'); assert.equal(h.state.anchor.available, true);
  h.start(); await until(settled(h));
  assert.equal(h.state.phase, 'done'); assert.ok(h.calls.groups.length > 0); assert.equal(h.calls.topics.length, 0);
  assert.equal(h.state.boundary.docId, h.expected(202)[1]);
});

test('El vídeo de otro chat y las identidades nativas contradictorias se rechazan', t => {
  const h = harness(t, {count:3}), opened = openVideo(h, 0); fromVideo(h);
  opened.viewer.target.peerId = -999; h.refresh(); startCommand(h);
  assert.equal(h.calls.pickers, 0); assert.match(h.state.message, /otro chat/);
  opened.viewer.target.peerId = -123; opened.viewer.target.message.mid++;
  h.refresh(); startCommand(h); assert.equal(h.calls.pickers, 0); assert.match(h.state.message, /vinculado.*mensaje/);
});

test('Un ancla que desaparece del listado se detecta antes de escribir vídeos o registro', async t => {
  const h = harness(t, {count:7}), opened = openVideo(h, 3); fromVideo(h);
  h.messages = h.messages.filter(row => row.message.id !== opened.message.id);
  h.start(); await until(settled(h)); assert.equal(h.state.phase, 'error');
  assert.equal(ids(h).length, 0); assert.equal(h.dir(101).files.has(FILE), false);
  assert.match(h.state.message, /No se encontró el vídeo abierto/);
});

test('Una fecha ausente en el listado detiene el tramo antes de descargar', async t => {
  const h = harness(t, {count:6}); openVideo(h, 2); fromVideo(h);
  h.messages[4].message.date = 0; h.start(); await until(settled(h));
  assert.equal(h.state.phase, 'error'); assert.equal(ids(h).length, 0);
  assert.equal(h.dir(101).files.has(FILE), false); assert.match(h.state.message, /no tiene una fecha válida/);
});

test('Un punto ya guardado sigue siendo útil aunque el mensaje de inicio se borre después', async t => {
  const first = harness(t, {count:8}), opened = openVideo(first, 2); fromVideo(first, {count:1});
  first.start(); await until(settled(first)); const root = first.root; await first.close();
  const second = harness(t, {count:8,root});
  second.messages = second.messages.filter(row => row.message.id !== opened.message.id);
  second.start(); await until(settled(second));
  assert.equal(second.state.phase, 'done'); assert.deepEqual(ids(second), first.expected(101).slice(4));
});

test('No hay siguientes: guarda el punto sin descargar ni inventar vídeos completados', async t => {
  const h = harness(t, {count:3}); openVideo(h, 4); fromVideo(h); h.start(); await until(settled(h));
  assert.equal(h.state.phase, 'done'); assert.equal(ids(h).length, 0); assert.equal(h.state.found, 0);
  assert.match(h.state.message, /No hay vídeos más recientes/); assert.equal(progress(h).completed.length, 0);
  assert.ok(progress(h).boundary);
});

test('Los IDs desempatan varios vídeos con la misma fecha, sin depender del filtro o nombre', async t => {
  const h = harness(t, {count:5});
  for (const row of h.messages.filter(row => row.topic === 101)) row.message.date = 1700000000;
  openVideo(h, 3); fromVideo(h); h.start(); await until(settled(h));
  // Los IDs de esta fixture descienden con el índice; a igual fecha manda el mensaje.
  assert.deepEqual(ids(h), h.expected(101).slice(0,3).reverse());
});

test('Deduplica después del límite: un reenvío fuera del tramo no oculta su copia dentro', async t => {
  const h = harness(t, {count:7}), rows = h.messages.filter(row => row.topic === 101);
  rows[6].message.media.document = rows[0].message.media.document;
  openVideo(h, 3); fromVideo(h); h.start(); await until(settled(h));
  const expected = h.expected(101).slice(4); assert.deepEqual(ids(h), expected);
  assert.ok(ids(h).includes(rows[0].message.media.document.id)); assert.equal(new Set(ids(h)).size, ids(h).length);
});

test('Un nuevo punto elegido expresamente sustituye el anterior sin perder completados', async t => {
  const h = harness(t, {count:10}); openVideo(h, 2); fromVideo(h, {count:1}); h.start(); await until(settled(h));
  openVideo(h, 7); fromVideo(h, {count:1}); h.start(); await until(() => settled(h)() && progress(h).boundary.mid === OFFSET + h.messages[7].message.id);
  assert.deepEqual(ids(h), [h.expected(101)[3],h.expected(101)[8]]); assert.equal(progress(h).completed.length, 2);
});

test('Desmarcar continuar y usar principio permite quitar el punto guardado de forma expresa', async t => {
  const first = harness(t, {count:6}); openVideo(first, 3); fromVideo(first, {count:1});
  first.start(); await until(settled(first)); const root = first.root, dir = first.dir(101);
  for (const name of dir.videoFiles.keys()) dir.files.delete(name); await first.close();
  const second = harness(t, {count:6,root}); second.$('#batch-continue').checked = false;
  second.start(); await until(settled(second));
  assert.deepEqual(ids(second), second.expected(101)); assert.equal(progress(second).boundary, null);
});

test('Un punto corrupto o de otro chat no provoca una descarga desde el principio', async t => {
  for (const boundary of [{peerId:-999}, {direction:'sideways'}, {include:'false'}, {date:0}]) {
    const h = harness(t, {count:3}); const message = h.messages[0].message;
    const dir = await h.root.getDirectoryHandle('Telegram_10_-123_Tema_101', {create:true});
    const text = JSON.stringify({version:1,scope:'10:-123:topic:101',order:'asc',completed:[],boundary:{
      peerId:-123,mid:OFFSET+message.id,docId:message.media.document.id,date:message.date,name:'inicio.mp4',direction:'asc',include:false,...boundary
    }});
    dir.files.set(FILE, Buffer.from(text)); h.start();
    await until(() => /No se pudo leer Telegram-progreso/.test(h.state.message));
    assert.equal(ids(h).length, 0); assert.equal(h.calls.topics.length, 0); assert.equal(dir.files.get(FILE).toString(), text);
    await h.close();
  }
});

test('Un fallo al guardar el punto para la primera tanda detiene antes de descargar', async t => {
  const h = harness(t, {count:6}); openVideo(h, 2); fromVideo(h);
  const dir = await h.root.getDirectoryHandle('Telegram_10_-123_Tema_101', {create:true});
  const native = dir.getFileHandle.bind(dir);
  dir.getFileHandle = async (name, opts) => {
    if (name === FILE && opts?.create) throw new Error('Disco no disponible');
    return native(name, opts);
  };
  h.start(); await until(settled(h)); assert.equal(h.state.phase, 'error'); assert.equal(ids(h).length, 0);
  assert.match(h.state.message, /confirmar su progreso/);
});
