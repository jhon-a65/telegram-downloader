/* Escenarios por temas con interfaz y disco simulados. */
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, until, tick, OFFSET} = require('./topic-fixture.cjs');

test('Descarga solo el tema abierto con paginación, archivos y vídeos redondos; nunca consulta el grupo completo', async t => {
  const h = harness(t);
  await until(() => h.$('.bulk-topic').textContent.includes('Clases de C'));
  assert.equal(h.$('#scope-topic').checked, true);
  h.start(); await until(h.done);
  assert.equal(h.state.found, 54); assert.equal(h.state.saved, 54);
  assert.deepEqual(new Set(h.calls.parts.map(part => part.id)), new Set(h.expected(101)));
  assert.equal(h.calls.groups.length, 0); assert.equal(h.calls.migrations, 0);
  assert.ok(h.calls.topics.length >= 7);
  assert.ok(h.calls.topics.every(call => call.threadId === OFFSET + 101));
  assert.equal(h.root.children.size, 1); assert.equal(h.dir(101).videoFiles.size, 54);
  for (const bytes of h.dir(101).videoFiles.values()) assert.deepEqual(bytes, h.fixture);
  await until(() => Object.keys(h.storage).filter(key => key.startsWith('tgLocalBulkHistory:10:-123:topic:101:')).length === 54);
  assert.deepEqual(h.errors, []);
});

test('Repetir el mismo tema omite completos y conserva carpeta e identidad aunque el tema se renombre', async t => {
  const h = harness(t, {count:1}); h.start(); await until(h.done);
  const reads = h.calls.parts.length, dir = h.dir(101);
  h.titles.set(101, 'C / avanzado'); h.title = 'Grupo renombrado';
  h.w.Date.now = () => Date.now() + 31000; h.refresh();
  await until(() => h.$('.bulk-topic').textContent.includes('C / avanzado'));
  h.root = dir; h.start(); await until(() => h.done() && h.state.skipped === 3);
  assert.equal(h.calls.parts.length, reads); assert.equal(h.root.children.size, 0); assert.equal(h.root.videoFiles.size, 3);
});

test('Todo el grupo sigue incluyendo los demás temas cuando se elige expresamente', async t => {
  const h = harness(t, {count:1}); h.select('group');
  assert.equal(h.$('.bulk-topic').hidden, true); h.start(); await until(h.done);
  assert.equal(h.state.saved, h.messages.length); assert.equal(h.calls.topics.length, 0);
  assert.ok(h.calls.groups.length >= 3); assert.ok(h.dir().videoFiles.size > h.expected(101).length);
  assert.equal(h.root.children.size, 1);
});

test('General se consulta como tema 1 e incluye respuestas normales sin incorporar otros temas', async t => {
  const h = harness(t, {count:1, threadId:OFFSET + 1}); h.start(); await until(h.done);
  assert.equal(h.state.saved, 5); assert.equal(h.dir(1).videoFiles.size, 5);
  assert.deepEqual(new Set(h.calls.parts.map(part => part.id)), new Set(h.expected(1)));
  assert.ok(h.calls.topics.every(call => call.threadId === OFFSET + 1));
  assert.equal(h.calls.groups.length, 0);
});

test('La búsqueda continúa tras páginas cortas y contadores aproximados', async t => {
  const h = harness(t, {count:18}); h.pageMaximum = 7; h.countHint = 1;
  h.start(); await until(h.done);
  assert.equal(h.state.saved, 20);
  const pages = h.calls.topics.filter(call => call.inputFilter._ === 'inputMessagesFilterVideo');
  assert.equal(pages.length, 4);
  assert.ok(pages.slice(1).every(call => call.offsetId > OFFSET));
});

test('Salir del tema deshabilita la descarga de ese tema y exige elegir Todo el grupo para ampliar el alcance', async t => {
  const h = harness(t, {count:1}); h.select('topic');
  h.w.appImManager.chat.threadId = 0; h.refresh();
  assert.equal(h.$('#scope-topic').checked, true); assert.equal(h.$('.bulk-start').disabled, true);
  h.start(); assert.equal(h.calls.pickers, 0); assert.equal(h.calls.groups.length, 0);
  h.select('group'); assert.equal(h.$('.bulk-start').disabled, false); h.start(); await until(h.done);
  assert.equal(h.calls.topics.length, 0); assert.equal(h.state.saved, h.messages.length);
});

test('Un hilo de comentarios de un chat sin temas no se confunde con un tema de foro', t => {
  const h = harness(t, {count:1, forum:false});
  assert.equal(h.$('#scope-topic').disabled, true); assert.equal(h.$('#scope-group').checked, true);
  h.select('topic'); assert.equal(h.$('#scope-group').checked, true);
});

test('Cambiar de tema antes del clic rechaza el destino antiguo sin abrir el selector ni buscar todo el grupo', async t => {
  const h = harness(t, {count:1});
  await until(() => h.$('.bulk-topic').textContent.includes('Clases de C'));
  h.w.appImManager.chat.threadId = OFFSET + 202; h.start();
  assert.match(h.$('.bulk-message').textContent, /Cambió el grupo o tema/);
  assert.equal(h.calls.pickers, 0); assert.equal(h.calls.topics.length, 0); assert.equal(h.calls.groups.length, 0);
  h.start(); await until(h.done);
  assert.deepEqual(new Set(h.calls.parts.map(part => part.id)), new Set(h.expected(202)));
  assert.equal(h.dir(202).videoFiles.size, 5);
});

test('Cambiar de tema mientras el selector está abierto no crea carpetas ni inicia solicitudes', async t => {
  const h = harness(t, {count:1}); let release;
  h.w.showDirectoryPicker = () => { h.calls.pickers++; return new Promise(resolve => { release = resolve; }); };
  h.start(); assert.ok(release);
  h.w.appImManager.chat.threadId = OFFSET + 202; release(h.root);
  await until(() => !h.state.busy && /Cambiaste de grupo o tema/.test(h.state.message));
  assert.equal(h.root.children.size, 0); assert.equal(h.calls.topics.length, 0); assert.equal(h.calls.groups.length, 0);
});

test('Cambiar de tema durante una parte pausa antes de escribir y solo permite reanudar en el tema original', async t => {
  const h = harness(t, {count:1}); let release, first = true;
  h.onRead = async () => { if (first) { first = false; await new Promise(resolve => { release = resolve; }); } };
  h.start(); await until(() => release);
  assert.equal(h.$('#scope-group').disabled, true); assert.equal(h.$('#scope-topic').disabled, true);
  h.w.appImManager.chat.threadId = OFFSET + 202; release();
  await until(() => h.state.phase === 'paused');
  assert.match(h.state.message, /cambiaste de tema/); assert.equal(h.dir(101).writes, 0);
  const before = h.calls.parts.length; h.$('.bulk-resume').click(); await tick(30);
  assert.equal(h.state.phase, 'paused'); assert.equal(h.calls.parts.length, before);
  h.w.appImManager.chat.threadId = OFFSET + 101; h.$('.bulk-resume').click(); await until(h.done);
  assert.equal(h.state.saved, 3); assert.equal(h.root.children.size, 1);
  assert.deepEqual(new Set(h.calls.parts.map(part => part.id)), new Set(h.expected(101)));
});

test('Un cambio de tema mientras llega una página pausa la búsqueda y no guarda resultados fuera del contexto', async t => {
  const h = harness(t, {count:1}); let release, first = true;
  h.onList = async () => { if (first) { first = false; await new Promise(resolve => { release = resolve; }); } };
  h.start(); await until(() => release);
  h.w.appImManager.chat.threadId = OFFSET + 202; release(); await until(() => h.state.phase === 'paused');
  assert.equal(h.calls.parts.length, 0);
  const before = h.calls.topics.length; await tick(30); assert.equal(h.calls.topics.length, before);
  h.w.appImManager.chat.threadId = OFFSET + 101; h.$('.bulk-resume').click(); await until(h.done);
  assert.equal(h.state.saved, 3);
});

test('Si Telegram devuelve un vídeo de otro tema, se detiene antes de descargar cualquier archivo', async t => {
  const h = harness(t, {count:1}); h.poison = true; h.start();
  await until(() => h.state.phase === 'error');
  assert.match(h.state.message, /otro tema/); assert.equal(h.calls.parts.length, 0); assert.equal(h.dir(101).videoFiles.size, 0);
});

test('La paginación repetida produce un error y no se declara falsamente una descarga completa', async t => {
  const h = harness(t, {count:4}); h.pageMaximum = 2; h.repeat = true; h.start();
  await until(() => h.state.phase === 'error');
  assert.match(h.state.message, /dejó de avanzar/); assert.equal(h.state.completedScan, false); assert.equal(h.calls.parts.length, 0);
});

test('Las referencias caducadas se renuevan con el ID local correcto del mensaje del tema', async t => {
  const h = harness(t, {count:1}); let expired = true;
  h.onRead = async () => { if (expired) { expired = false; throw {type:'FILE_REFERENCE_EXPIRED'}; } };
  h.start(); await until(h.done);
  assert.equal(h.calls.reloads, 1); assert.equal(h.state.failed, 0); assert.ok(h.calls.parts.some(part => part.dc === 3));
});

test('Descargar dos temas usa carpetas y registros separados', async t => {
  const h = harness(t, {count:1}); h.start(); await until(h.done);
  h.w.appImManager.chat.threadId = OFFSET + 202; h.refresh(); h.start();
  await until(() => h.done() && h.state.scope === '10:-123:topic:202');
  assert.equal(h.root.children.size, 2); assert.equal(h.dir(101).videoFiles.size, 3); assert.equal(h.dir(202).videoFiles.size, 5);
  await until(() => Object.keys(h.storage).filter(key => key.startsWith('tgLocalBulkHistory:10:-123:topic:202:')).length === 5);
  assert.equal(Object.keys(h.storage).filter(key => key.startsWith('tgLocalBulkHistory:10:-123:topic:101:')).length, 3);
});

test('La cola de Todo el grupo continúa al moverse entre sus temas', async t => {
  const h = harness(t, {count:1}); let release, first = true;
  h.select('group'); h.onRead = async () => { if (first) { first = false; await new Promise(resolve => { release = resolve; }); } };
  h.start(); await until(() => release); h.w.appImManager.chat.threadId = OFFSET + 202; release();
  await until(h.done); assert.equal(h.state.saved, h.messages.length); assert.equal(h.calls.topics.length, 0);
});

test('Si no se obtiene el título, el identificador del tema sigue delimitando correctamente la descarga', async t => {
  const h = harness(t, {count:1, failTitle:true}); h.start(); await until(h.done);
  assert.equal(h.state.saved, 3); assert.equal(h.dir(101).videoFiles.size, 3); assert.equal(h.calls.groups.length, 0);
});

test('Una API de temas ausente no se sustituye por la búsqueda de todo el grupo', async t => {
  const h = harness(t, {count:1}); h.w.appImManager.managers.appMessagesManager.requestHistory = undefined; h.start();
  await until(() => h.state.phase === 'error');
  assert.match(h.state.message, /consultar el tema/); assert.equal(h.calls.groups.length, 0); assert.equal(h.calls.parts.length, 0);
});

test('Un tema sin vídeos termina vacío y no busca archivos en los demás temas', async t => {
  const h = harness(t, {count:1}); h.messages = h.messages.filter(row => row.topic !== 101);
  h.start(); await until(h.done);
  assert.equal(h.state.saved, 0); assert.equal(h.state.found, 0); assert.equal(h.state.completedScan, true);
  assert.match(h.state.message, /este tema/); assert.equal(h.calls.groups.length, 0); assert.equal(h.calls.parts.length, 0);
  assert.equal(h.dir(101).videoFiles.size, 0);
});
