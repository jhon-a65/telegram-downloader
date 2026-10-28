/* Ejecutar con Node 22+: node --test pruebas/core.test.cjs */
const {test} = require('node:test');
const assert = require('node:assert/strict');
require('../core.js');
const C = globalThis.TGLocalCore;
const original = Uint8Array.from({length: 23579}, (_, i) => (i * 137 + (i >> 3)) % 256);
const options = {url: 'https://web.telegram.org/stream/video', chunkSize: 8192};

function collect() {
  const chunks = [];
  return {chunks, write: async bytes => chunks.push(bytes.slice()), value: () => Buffer.concat(chunks.map(v => Buffer.from(v)))};
}
function ranged(extra = () => {}) {
  let call = 0;
  return async (_, init) => {
    const result = extra(++call, init);
    if (result) return result;
    const [start, requested] = /bytes=(\d+)-(\d+)/.exec(init.headers.Range).slice(1).map(Number);
    const end = Math.min(requested, start + 3070, original.length - 1);
    return new Response(original.slice(start, end + 1), {status: 206, headers: {
      'Content-Range': `bytes ${start}-${end}/${original.length}`, 'Content-Type': 'video/mp4', ETag: 'stable-file'
    }});
  };
}

test('Descarga segmentada: bytes exactos cuando el servidor devuelve partes menores', async () => {
  const sink = collect(); const progress = [];
  const result = await C.transfer({...options, fetcher: ranged(), write: sink.write, onProgress: n => progress.push(n)});
  assert.deepEqual(sink.value(), Buffer.from(original));
  assert.equal(result.bytes, original.length);
  assert.ok(progress.every((n,i) => !i || n > progress[i-1]));
});

test('Respuesta 200: admite archivo completo aunque el servidor ignore Range inicial', async () => {
  const sink = collect();
  await C.transfer({...options, write: sink.write, fetcher: async () => new Response(original, {headers: {'Content-Type': 'video/mp4', 'Content-Length': String(original.length)}})});
  assert.deepEqual(sink.value(), Buffer.from(original));
});

test('Reintenta HTTP 503 sin duplicar partes', async () => {
  const sink = collect(); let failures = 0;
  const fetcher = ranged(call => call === 2 ? (failures++, new Response('', {status: 503})) : null);
  await C.transfer({...options, write: sink.write, fetcher});
  assert.equal(failures, 1); assert.deepEqual(sink.value(), Buffer.from(original));
});

test('Reintenta una respuesta parcial truncada antes de escribirla', async () => {
  const sink = collect();
  const fetcher = ranged(call => call === 1 ? new Response(original.slice(0,4), {status: 206, headers: {'Content-Range': `bytes 0-3070/${original.length}`}}) : null);
  await C.transfer({...options, write: sink.write, fetcher});
  assert.deepEqual(sink.value(), Buffer.from(original));
});

test('Rechaza saltos de posición en lugar de ensamblar un vídeo corrupto', async () => {
  const sink = collect();
  const fetcher = ranged(call => call === 2 ? new Response(original.slice(4000,5000), {status: 206, headers: {'Content-Range': `bytes 4000-4999/${original.length}`}}) : null);
  await assert.rejects(C.transfer({...options, write: sink.write, fetcher}), /no coinciden/);
  assert.deepEqual(sink.value(), Buffer.from(original.slice(0,3071)));
});

test('Rechaza respuesta 200 después de haber guardado una parte', async () => {
  const sink = collect();
  await assert.rejects(C.transfer({...options, write: sink.write, fetcher: ranged(call => call === 2 ? new Response(original) : null)}), /ignoró la posición/);
  assert.deepEqual(sink.value(), Buffer.from(original.slice(0,3071)));
});

test('No guarda páginas HTML ni JSON como si fueran vídeos', async () => {
  for (const type of ['text/html','application/json']) {
    const sink = collect();
    await assert.rejects(C.transfer({...options, write: sink.write, fetcher: async () => new Response('error', {headers: {'Content-Type': type}})}), /en lugar del vídeo/);
    assert.equal(sink.chunks.length, 0);
  }
});

test('Un archivo completo truncado no se confirma como correcto', async () => {
  const sink = collect();
  await assert.rejects(C.transfer({...options, write: sink.write, fetcher: async () => new Response(original.slice(0,30), {headers: {'Content-Length': '100'}})}), /incompleta/);
});

test('Detiene la descarga si el archivo cambia entre partes', async () => {
  const sink = collect();
  const fetcher = ranged(call => call === 2 ? new Response(original.slice(3071,6142), {status: 206, headers: {'Content-Range': `bytes 3071-6141/${original.length}`, ETag: 'changed-file'}}) : null);
  await assert.rejects(C.transfer({...options, write: sink.write, fetcher}), /cambió/);
});

test('La cancelación no continúa solicitando más partes', async () => {
  const sink = collect(); const abort = new AbortController(); let requests = 0;
  const base = ranged();
  await assert.rejects(C.transfer({...options, signal: abort.signal, fetcher: (...args) => { requests++; return base(...args); }, write: async bytes => { await sink.write(bytes); abort.abort(); }}), {name: 'AbortError'});
  assert.equal(requests, 1);
});

test('No reintenta ni duplica una escritura fallida en disco', async () => {
  let writes = 0;
  await assert.rejects(C.transfer({...options, fetcher: ranged(), write: async () => { writes++; throw new Error('Sin espacio'); }}), /Sin espacio/);
  assert.equal(writes, 1);
});

test('Limita URLs a la sesión de Telegram y conserva nombres seguros en Windows', () => {
  const origin = 'https://web.telegram.org';
  for (const value of ['https://evil.example/video.mp4','https://web.telegram.org.evil.example/video.mp4','javascript:alert(1)','data:video/mp4,abc','blob:https://evil.example/123','https://user:pass@web.telegram.org/stream/x']) assert.equal(C.safeUrl(value, origin), null);
  assert.equal(C.safeUrl('/stream/test', origin), origin + '/stream/test');
  assert.equal(C.safeUrl('blob:https://web.telegram.org/123', origin), 'blob:https://web.telegram.org/123');
  assert.equal(C.filename('con'), '_con.mp4');
  assert.equal(C.filename('../mi:vídeo?.mp4'), '_mi_vídeo_.mp4');
  assert.equal(C.filename('vídeo','video/webm'), 'vídeo.webm');
  const meta = C.metadata(origin+'/stream/'+encodeURIComponent(JSON.stringify({fileName:'Clase 01.mp4',mimeType:'video/mp4',size:99})));
  assert.deepEqual(meta, {name:'Clase 01.mp4',mime:'video/mp4',size:99});
});
