/* Integración por temas: interfaz real de la extensión, Web K y disco simulados.
   TG_DOM_MODULES=/ruta/node_modules node --test pruebas/topics.test.cjs */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {FakeDirectory} = require('./fake-fs.cjs');
const {JSDOM, VirtualConsole} = require(process.env.TG_DOM_MODULES ? path.join(process.env.TG_DOM_MODULES, 'jsdom') : 'jsdom');
const OFFSET = 0x100000000;
const base = path.resolve(__dirname, '..');
const tick = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 1500; i++) { if (fn()) return; await tick(5); }
  throw new Error('Tiempo agotado esperando el estado de la cola por temas.');
}

function harness(t, options = {}) {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><div id="column-center"><div class="chat-info"><span class="peer-title">Grupo de prueba</span></div></div></body></html>', {
    url:'https://web.telegram.org/k/', runScripts:'outside-only', pretendToBeVisual:true, virtualConsole:vc
  });
  const w = dom.window, fixture = fs.readFileSync(path.join(__dirname, 'fixture.mp4'));
  Object.defineProperty(w.navigator,'language',{value:options.browserLanguage || 'es-PE',configurable:true});
  const h = {w, dom, errors, fixture, state:null, states:[], storage:options.storage || {}, root:options.root || new FakeDirectory('Destino'),
    docs:new Map(), messages:[], title:'Grupo de prueba', titles:new Map([[101,'Clases de C'],[202,'Python'],[1,'General']]),
    calls:{topics:[], groups:[], parts:[], metadata:[], migrations:0, pickers:0, reloads:0}, pageMaximum:50,
    onList:null, onRead:null, poison:false, repeat:false, failTitle:!!options.failTitle, countHint:undefined};
  const observers = [], NativeObserver = w.MutationObserver;
  w.MutationObserver = class extends NativeObserver { constructor(callback) { super(callback); observers.push(this); } };
  w.Blob = Blob; w.AbortController = AbortController; w.AbortSignal = AbortSignal;
  w.URL.createObjectURL = () => 'blob:https://web.telegram.org/test'; w.URL.revokeObjectURL = () => {};
  w.performance.getEntriesByType = () => [];
  w.fetch = async () => { throw new Error('La descarga por temas no debe usar fetch.'); };
  w.chrome = {runtime:{onMessage:{addListener() {}}, sendMessage:async () => {}},
    storage:{local:{get:async key => {const value=h.storage[key];if(key==='tgLocalLanguage'&&options.languageRead)await options.languageRead;return {[key]:value};}, set:async values => Object.assign(h.storage, values)}}};
  let serial = 0;
  function add(topic, filter, style = 'top') {
    const n = ++serial, id = 200000 - n;
    const doc = {_: 'document', id:String(80000000000000000n + BigInt(n)), dc_id:2, size:fixture.length,
      file_name:'Tema-' + topic + '-' + n + '.mp4', mime_type:'video/mp4', attributes:[{_:'documentAttributeVideo'}]};
    if (filter === 'inputMessagesFilterDocument') doc.attributes = [{_:'documentAttributeFilename', file_name:doc.file_name}];
    if (filter === 'inputMessagesFilterRoundVideo') doc.attributes[0].pFlags = {round_message:true};
    const message = {_: 'message', id, peer_id:{_:'peerChannel', channel_id:123}, date:1700000000 + n, media:{document:doc}};
    if (topic !== 1) message.reply_to = {_: 'messageReplyHeader', pFlags:{forum_topic:true},
      ...(style === 'direct' ? {reply_to_msg_id:topic} : {reply_to_top_id:n % 2 ? OFFSET + topic : topic, reply_to_msg_id:id + 1})};
    else if (style === 'reply') message.reply_to = {_: 'messageReplyHeader', pFlags:{}, reply_to_msg_id:id + 1};
    h.docs.set(doc.id, {doc, topic, message}); h.messages.push({message, topic, filter});
    return message;
  }
  const filters = ['inputMessagesFilterVideo','inputMessagesFilterDocument','inputMessagesFilterRoundVideo'];
  for (const topic of [101,202,1]) {
    for (let i = 0; i < (topic === 101 ? options.count ?? 52 : 3); i++) add(topic, filters[0], i % 2 ? 'direct' : 'reply');
    add(topic, filters[1], 'direct'); add(topic, filters[2], 'reply');
  }
  const requestedTopic = value => Number(value) >= OFFSET ? Number(value) - OFFSET : Number(value);
  const manager = {
    getMigration:async () => { h.calls.migrations++; return {prev:-111}; },
    requestHistory:async args => {
      assert.equal(args.peerId, -123); assert.equal(args.limit, 50); assert.equal(args.query, '');
      const topic = requestedTopic(args.threadId);
      assert.ok([101,202,1].includes(topic), 'Siempre debe enviarse un tema concreto a Telegram.');
      h.calls.topics.push({...args});
      if (h.onList) await h.onList(args);
      const list = h.messages.filter(row => row.topic === topic && row.filter === args.inputFilter._ &&
        (!args.offsetId || row.message.id < requestedTopic(args.offsetId)));
      let selected = list.slice(0, h.pageMaximum).map(row => row.message);
      if (h.repeat && args.offsetId) selected = h.messages.filter(row => row.topic === topic && row.filter === args.inputFilter._).slice(0, h.pageMaximum).map(row => row.message);
      if (h.poison) selected = [h.messages.find(row => row.topic !== topic).message];
      return {_: 'messages.channelMessages', count:h.countHint ?? list.length, pFlags:{inexact:true}, messages:selected};
    },
    getHistory:async args => {
      assert.equal(args.threadId, undefined, 'La opción de grupo completo no debe heredar el filtro del tema.');
      h.calls.groups.push({...args});
      const all = h.messages.filter(row => row.filter === args.inputFilter._ && (!args.offsetId || OFFSET + row.message.id < args.offsetId));
      const messages = all.slice(0, 50).map(row => ({...row.message, mid:OFFSET + row.message.id, peerId:-123}));
      return {messages, history:messages.map(m => m.mid), isEnd:{top:all.length <= 50}};
    },
    getMessageByPeer:async (peer, mid) => h.messages.find(row => OFFSET + row.message.id === mid)?.message,
    reloadMessage:async (peer, mid) => {
      h.calls.reloads++; assert.equal(peer, -123); assert.ok(mid > OFFSET, 'La renovación requiere el ID local de Web K.');
      const row = h.messages.find(row => OFFSET + row.message.id === mid);
      if (row) row.message.media.document.dc_id = 3;
      return row?.message;
    }
  };
  w.rootScope = {myId:10};
  w.appImManager = {chat:{peerId:-123, isForum:options.forum !== false, threadId:options.threadId ?? OFFSET + 101}, managers:{
    appMessagesManager:manager,
    dialogsStorage:{getForumTopicOrReload:async (peer, threadId) => {
      h.calls.metadata.push({peer,threadId});
      if (h.failTitle) throw new Error('No disponible');
      return {_: 'forumTopic', id:threadId, title:h.titles.get(requestedTopic(threadId))};
    }},
    appDocsManager:{getDoc:async id => h.docs.get(id)?.doc, requestDocPart:async (id, dc, offset, limit) => {
      h.calls.parts.push({id,dc,offset,limit});
      assert.equal(limit, 512 * 1024);
      if (h.onRead) { const part = await h.onRead({id,dc,offset,limit}); if (part !== undefined) return part; }
      return {bytes:new Uint8Array(fixture.subarray(offset, offset + limit))};
    }}
  }};
  w.apiManagerProxy = {getChat:() => ({title:h.title, pFlags:{forum:options.forum !== false}})};
  w.showDirectoryPicker = async () => { h.calls.pickers++; return h.root; };
  w.document.addEventListener('tg-local:reply', event => {
    const data = JSON.parse(event.detail);
    if (data.type === 'bulk-state') { h.state = data; h.states.push(data); }
  });
  for (const file of JSON.parse(require('node:fs').readFileSync(path.join(base,'manifest.json'),'utf8')).content_scripts.flatMap(entry=>entry.js)) w.eval(fs.readFileSync(path.join(base, file), 'utf8'));
  h.ui = w.document.getElementById('tg-local-video-tools').shadowRoot;
  h.$ = selector => h.ui.querySelector(selector);
  h.refresh = () => h.$('.mode-group').click();
  h.open = () => { h.$('.launch').click(); h.refresh(); };
  h.select = mode => h.$('#scope-' + mode).click();
  h.start = () => h.$('.bulk-start').click();
  h.done = () => !h.state.busy && h.state.phase === 'done';
  h.dir = topic => h.root.children.get('Telegram_10_-123' + (topic ? '_Tema_' + topic : ''));
  h.expected = topic => h.messages.filter(row => row.topic === topic).map(row => row.message.media.document.id);
  h.close = async () => {
    if (h.closed) return;
    h.$('.bulk-stop').click();h.$('.manual-stop').click();
    await until(() => !w.TGLocalBulk.isBusy()&&!w.TGLocalManual?.isBusy());
    for (const observer of observers) observer.disconnect();
    w.close(); h.closed = true;
  };
  t.after(h.close);
  h.open();
  if (options.batchSize !== 'default') { h.$('#batch-count').value = 'all'; h.$('#batch-count').dispatchEvent(new w.Event('change')); }
  return h;
}


module.exports = {harness, until, tick, OFFSET};
