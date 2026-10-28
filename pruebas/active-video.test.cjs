/* Regresión de «En pantalla». DOM simulado; no requiere una sesión de Telegram.
   TG_DOM_MODULES=/ruta/node_modules node --test pruebas/active-video.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {JSDOM, VirtualConsole} = require(process.env.TG_DOM_MODULES ? path.join(process.env.TG_DOM_MODULES, 'jsdom') : 'jsdom');
const channel = '1234567890abcdef1234567890abcdef';
const base = path.resolve(__dirname, '..');

function setup(t, variant = 'k') {
  const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', {
    url: `https://web.telegram.org/${variant}/`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole()
  });
  const w = dom.window, d = w.document, states = [], boxes = new WeakMap(), media = new WeakMap(), observers = [];
  Object.defineProperty(w.navigator,'language',{value:'es-PE',configurable:true});
  const NativeObserver = w.MutationObserver;
  w.MutationObserver = class extends NativeObserver {
    constructor(callback) { super(callback); observers.push(this); }
  };
  // En jsdom close() elimina el DOM antes de destruir el contexto del observador.
  t.after(() => { for (const observer of observers) observer.disconnect(); w.close(); });
  Object.defineProperties(w, {innerWidth: {value: 1200}, innerHeight: {value: 900}});
  w.Blob = Blob;
  w.URL.createObjectURL = () => 'blob:https://web.telegram.org/unused';
  w.URL.revokeObjectURL = () => {};
  w.fetch = async () => { throw new Error('No debe descargar durante la detección.'); };
  w.performance.getEntriesByType = () => [];
  w.HTMLElement.prototype.getBoundingClientRect = function() {
    return boxes.get(this) || {left: 0, top: 0, right: 1200, bottom: 900, width: 1200, height: 900};
  };
  d.addEventListener('tg-local:reply', event => {
    const data = JSON.parse(event.detail);
    if (data.type === 'state') states.push(data);
  });
  for (const file of ['core.js', 'page.js', 'photo-page.js']) w.eval(fs.readFileSync(path.join(base, file), 'utf8'));
  const command = type => d.dispatchEvent(new w.CustomEvent('tg-local:command', {detail: JSON.stringify({channel, type})}));
  command('hello');
  const add = (name, parent = d.querySelector('main')) => {
    const v = d.createElement('video');
    v.src = 'https://web.telegram.org/stream/' + encodeURIComponent(JSON.stringify({fileName: name + '.mp4', mimeType: 'video/mp4'}));
    const status = {paused: true, ended: false};
    media.set(v, status);
    Object.defineProperties(v, {paused: {get: () => status.paused}, ended: {get: () => status.ended}});
    boxes.set(v, {left: 100, top: 100, right: 900, bottom: 700, width: 800, height: 600});
    parent.appendChild(v);
    return v;
  };
  const play = v => { media.get(v).paused = false; v.dispatchEvent(new w.Event('play')); };
  const scan = () => { command('scan'); return states.at(-1); };
  const marked = state => state.items.filter(item => item.visible).map(item => item.name);
  const expect = (...names) => {
    assert.deepEqual(marked(scan()), names.map(name => name + '.mp4'));
    for (const state of states) assert.ok(state.items.filter(item => item.visible).length <= 1, 'Nunca debe publicarse más de una marca.');
  };
  const element = (className, parent = d.body) => {
    const node = d.createElement('div'); node.className = className; parent.appendChild(node); return node;
  };
  return {w, d, states, boxes, media, add, play, scan, marked, expect, element};
}

test('Cambiar de vídeo deja una sola marca aunque los anteriores sigan reproduciéndose en el DOM', t => {
  const h = setup(t), old = h.add('anterior'), current = h.add('actual'), third = h.add('siguiente');
  h.play(old); h.expect('anterior');
  h.play(current); h.expect('actual');
  h.play(third); h.expect('siguiente');
  h.play(current); h.expect('actual');
  old.dispatchEvent(new h.w.Event('pointerdown', {bubbles: true})); h.expect('anterior');
});

test('Web K: el visor central tiene prioridad frente a miniaturas y reproductores salientes', t => {
  const h = setup(t), background = h.add('miniatura');
  const viewer = h.element('media-viewer-whole active');
  const outgoing = h.element('media-viewer-mover active moving', viewer);
  const old = h.add('saliente', outgoing);
  const currentSlide = h.element('media-viewer-mover active center', viewer);
  h.add('abierto', currentSlide);
  h.play(old); h.play(background);
  h.expect('abierto');
});

test('Web K: abrir una foto no conserva la marca del vídeo saliente', t => {
  const h = setup(t), viewer = h.element('media-viewer-whole active');
  const outgoing = h.element('media-viewer-mover active moving', viewer);
  h.play(h.add('saliente', outgoing));
  const current = h.element('media-viewer-mover active center', viewer);
  current.appendChild(h.d.createElement('img'));
  h.expect();
});

test('Web A: solo la diapositiva activa se marca aunque las adyacentes conserven vídeo', t => {
  const h = setup(t, 'a');
  const viewer = h.d.createElement('dialog'); viewer.id = 'MediaViewer'; viewer.open = true; viewer.className = 'shown open'; h.d.body.appendChild(viewer);
  const adjacent = h.element('MediaViewerSlide', viewer), current = h.element('MediaViewerSlide MediaViewerSlide--active', viewer);
  h.add('abierto', current); h.play(h.add('adyacente', adjacent));
  h.expect('abierto');
  current.classList.remove('MediaViewerSlide--active'); adjacent.classList.add('MediaViewerSlide--active');
  h.expect('adyacente');
});

test('Se ignoran ancestros ocultos, transparentes o fuera de la ventana aunque el vídeo conserve su rectángulo', t => {
  const h = setup(t), good = h.add('actual'); h.play(good);
  const hidden = h.element('old-player'), old = h.add('anterior', hidden);
  for (const style of ['display: none', 'visibility: hidden', 'opacity: 0', 'content-visibility: hidden']) {
    hidden.style.cssText = style; h.play(old); h.expect('actual');
  }
  hidden.style.cssText = ''; hidden.setAttribute('aria-hidden', 'true'); h.expect('actual');
  hidden.removeAttribute('aria-hidden');
  h.boxes.set(old, {left: 1300, top: 0, right: 1500, bottom: 300, width: 200, height: 300}); h.expect('actual');
});

test('El recorte del contenedor impide marcar vídeos de una lista que han quedado fuera de su área', t => {
  const h = setup(t), clip = h.element('scrollable'); clip.style.overflow = 'hidden';
  h.boxes.set(clip, {left: 0, top: 0, right: 50, bottom: 50, width: 50, height: 50});
  h.play(h.add('recortado', clip)); h.expect();
});

test('Pausar conserva la marca del vídeo abierto y quitarlo del DOM la elimina', t => {
  const h = setup(t), v = h.add('actual'); h.play(v); h.expect('actual');
  h.media.get(v).paused = true; v.dispatchEvent(new h.w.Event('pause')); h.expect('actual');
  v.remove(); h.expect();
  assert.ok(h.scan().items.some(item => item.name === 'actual.mp4'), 'El historial detectado sigue disponible.');
});

test('Cambiar src en el mismo elemento no conserva la marca de currentSrc anterior', t => {
  const h = setup(t), v = h.add('anterior'), oldSrc = v.src;
  Object.defineProperty(v, 'currentSrc', {get: () => oldSrc});
  h.play(v); h.expect('anterior');
  const next = h.add('nuevo'); v.src = next.src; next.remove();
  v.dispatchEvent(new h.w.Event('loadstart')); h.expect('nuevo');
  v.src = ''; v.dispatchEvent(new h.w.Event('emptied')); h.expect();
  v.removeAttribute('src'); v.dispatchEvent(new h.w.Event('emptied')); h.expect();
  const source = h.d.createElement('source'); source.src = next.src; v.appendChild(source); h.expect('nuevo');
});

test('Un vídeo cubierto por otro no puede conservar la marca gracias a su rectángulo antiguo', t => {
  const h = setup(t), old = h.add('anterior'), current = h.add('frontal');
  h.d.elementsFromPoint = () => [current, old, h.d.body, h.d.documentElement];
  h.play(current); h.play(old); h.expect('frontal');
  const image = h.d.createElement('img'); h.d.body.appendChild(image);
  h.d.elementsFromPoint = () => [image, current, old, h.d.body, h.d.documentElement]; h.expect();
});

test('Los controles del reproductor y el panel de la extensión no ocultan la marca del vídeo', t => {
  const h = setup(t), player = h.element('VideoPlayer'), v = h.add('actual', player), controls = h.element('controls', player);
  const host = h.element(''); host.id = 'tg-local-video-tools';
  h.d.elementsFromPoint = () => [host, controls, player, v, h.d.body];
  h.play(v); h.expect('actual');
});

test('Pantalla completa tiene prioridad frente a vídeos que se reproducen en el fondo', t => {
  const h = setup(t), container = h.element('fullscreen-player'); h.add('pantalla-completa', container);
  Object.defineProperty(h.d, 'fullscreenElement', {get: () => container});
  h.play(h.add('fondo')); h.expect('pantalla-completa');
});

test('Un visor cerrado no deja vídeos marcados aunque todavía existan en el DOM', t => {
  const h = setup(t), viewer = h.element('media-viewer-whole active'), slide = h.element('media-viewer-mover center active', viewer);
  h.play(h.add('cerrado', slide)); h.expect('cerrado');
  viewer.classList.remove('active'); viewer.classList.add('backwards'); h.expect();
  viewer.classList.add('active'); h.expect('cerrado');
});

test('La lista muestra una sola etiqueta durante 40 cambios seguidos y conserva la identidad correcta', t => {
  const h = setup(t), old = h.add('primero'), current = h.add('segundo');
  h.w.chrome = {runtime: {onMessage: {addListener() {}}, sendMessage: async () => {}}, storage: {local: {get: async () => ({}), set: async () => {}}}};
  h.w.eval(fs.readFileSync(path.join(base, 'i18n.js'), 'utf8'));
  h.w.eval(fs.readFileSync(path.join(base, 'content.js'), 'utf8'));
  const root = h.d.getElementById('tg-local-video-tools').shadowRoot;
  root.querySelector('.launch').click();
  for (let i = 0; i < 40; i++) {
    h.play(i % 2 ? current : old); root.querySelector('.scan').click();
    assert.equal(root.querySelectorAll('.visible').length, 1);
    assert.equal(root.querySelector('.visible').closest('.item').querySelector('.name').textContent, (i % 2 ? 'segundo' : 'primero') + '.mp4');
  }
  const cleared = h.states.flatMap(state => state.items.filter(item => item.visible));
  assert.ok(cleared.length >= 40);
  assert.ok(h.states.every(state => state.items.filter(item => item.visible).length <= 1));
});

test('Los cambios de visibilidad se reflejan automáticamente sin pulsar Buscar ni reiniciar', async t => {
  const h = setup(t), viewer = h.element('media-viewer-whole active'), slide = h.element('media-viewer-mover active center', viewer);
  h.play(h.add('actual', slide)); h.expect('actual');
  const before = h.states.length;
  viewer.style.display = 'none';
  for (let i = 0; i < 60 && !(h.states.length > before && h.marked(h.states.at(-1)).length === 0); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(h.states.length > before, 'El observador debe publicar el cambio.');
  assert.deepEqual(h.marked(h.states.at(-1)), []);
});
