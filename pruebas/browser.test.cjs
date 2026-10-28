/* Requiere Playwright y Chrome for Testing. No inicia sesión en Telegram:
   todas las páginas y respuestas de web.telegram.org son fixtures locales. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {chromium} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright' : 'playwright');
const extension = path.resolve(__dirname, '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const fixture = await fs.readFile(path.join(__dirname,'fixture.mp4'));
  const work = await fs.mkdtemp(path.join(os.tmpdir(),'tg-local-browser-'));
  const context = await chromium.launchPersistentContext(path.join(work,'profile'), {
    executablePath: process.env.CHROME_EXECUTABLE,
    headless: true, acceptDownloads: true, locale: 'es-PE', viewport: {width: 1100, height: 900},
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  const errors = [], rangeRequests = [];
  let slow = false;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Fixture local · Telegram</title></head><body style="margin:0;background:#eaf1ee;font-family:system-ui;color:#23444a"><header style="background:#fff;padding:22px 34px;font-size:21px;font-weight:700">Telegram · Entorno local de prueba</header><main style="padding:35px"><h1>Comprobación de descarga</h1><p>Esta página simula fuentes de vídeo. No contiene una sesión de Telegram.</p><div id="videos"></div></main></body></html>`;
  await context.route('https://web.telegram.org/**', async route => {
    const request = route.request();
    if (new URL(request.url()).pathname.startsWith('/stream/')) {
      const range = request.headers()['range'];
      rangeRequests.push(range || 'full');
      if (slow) await delay(700);
      if (!range) return route.fulfill({status:200,contentType:'video/mp4',body:fixture});
      const [,a,b] = /bytes=(\d+)-(\d*)/.exec(range);
      const start = Number(a), end = Math.min(b ? Number(b) : fixture.length - 1, start + 1023, fixture.length - 1);
      return route.fulfill({status:206,headers:{'Content-Type':'video/mp4','Content-Range':`bytes ${start}-${end}/${fixture.length}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'},body:fixture.subarray(start,end+1)});
    }
    await route.fulfill({status:200,contentType:'text/html',body:html});
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('https://web.telegram.org/k/');
    await page.waitForFunction(() => window.__tgLocalVideoLoaded === true);
    await page.locator('#tg-local-video-tools').waitFor();
    const workers = context.serviceWorkers();
    const worker = workers[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    console.log('PASS: Chrome cargó la extensión MV3, el service worker y ambos mundos de scripts.');

    await page.evaluate(base64 => {
      const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], {type:'video/mp4'});
      const video = document.createElement('video'); video.controls=true; video.style.cssText='width:320px;height:180px;margin:15px';
      video.src=URL.createObjectURL(blob); document.getElementById('videos').appendChild(video);
      window.__fixtureBlobUrl=video.src;
    },fixture.toString('base64'));
    await page.locator('.launch').click();
    const blobRow = page.locator('.item').filter({has:page.locator('.tag.blob')}).first();
    await blobRow.waitFor();
    await page.locator('#memory').check(); await page.locator('#disk').uncheck();
    const save = async row => {
      const awaited = page.waitForEvent('download');
      await row.getByRole('button',{name:'Guardar',exact:true}).click();
      const download = await awaited;
      const saved = path.join(work,Date.now()+'-'+download.suggestedFilename());
      await download.saveAs(saved);
      assert.equal(hash(await fs.readFile(saved)),hash(fixture));
      await page.waitForFunction(() => document.querySelector('#tg-local-video-tools').shadowRoot.querySelector('.status-title').textContent.includes('descargas de Chrome'));
    };
    const beforeBlob = rangeRequests.length;
    await save(blobRow);
    assert.equal(rangeRequests.length,beforeBlob);
    console.log('PASS: guardado del Blob con SHA-256 idéntico y cero solicitudes de partes.');

    await page.evaluate(size => {
      const video = document.createElement('video'); video.controls=true; video.preload='none'; video.style.cssText='width:320px;height:180px;margin:15px';
      video.src='/stream/'+encodeURIComponent(JSON.stringify({fileName:'Por-partes.mp4',mimeType:'video/mp4',size}));
      document.getElementById('videos').appendChild(video);
    },fixture.length);
    await page.locator('.scan').click();
    const rangeRow = page.locator('.item').filter({hasText:'Por-partes.mp4'}).first();
    await rangeRow.waitFor();
    const beforeBlocked = rangeRequests.length;
    await rangeRow.getByRole('button',{name:'Guardar',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#tg-local-video-tools').shadowRoot.querySelector('.status-title').textContent.includes('Desmarca'));
    assert.equal(rangeRequests.length,beforeBlocked);
    console.log('PASS: el modo de datos cargados bloquea solicitudes HTTP nuevas.');

    await page.locator('#memory').uncheck();
    const beforeRange = rangeRequests.length;
    await save(rangeRow);
    assert.ok(rangeRequests.length-beforeRange>2);
    console.log('PASS: archivo por rangos reconstruido con SHA-256 idéntico.');

    for (let i=0;i<3;i++) await save(blobRow);
    console.log('PASS: cinco descargas consecutivas, sin cuota de tres vídeos.');

    await page.evaluate(() => {
      window.__diskTest={parts:[],closed:false,aborted:false,pickers:0};
      window.showSaveFilePicker=async () => {
        window.__diskTest.pickers++;
        return {createWritable:async () => ({
          write:async value => window.__diskTest.parts.push(Array.from(value)),
          close:async () => {window.__diskTest.closed=true;},
          abort:async () => {window.__diskTest.aborted=true;}
        })};
      };
    });
    await page.locator('#disk').check();
    await rangeRow.getByRole('button',{name:'Guardar',exact:true}).click();
    await page.waitForFunction(() => window.__diskTest.closed);
    const disk = await page.evaluate(() => ({...window.__diskTest,bytes:window.__diskTest.parts.flat(),parts:undefined}));
    assert.equal(hash(Buffer.from(disk.bytes)),hash(fixture)); assert.equal(disk.pickers,1); assert.equal(disk.aborted,false);
    console.log('PASS: ruta de escritura por partes y cierre correcto (selector de archivos simulado).');

    await page.evaluate(() => { window.__diskTest.closed=false;window.__diskTest.aborted=false;window.__diskTest.parts=[]; });
    slow=true;
    await rangeRow.getByRole('button',{name:'Guardar',exact:true}).click();
    await page.locator('.cancel').waitFor({state:'visible'});
    await page.locator('.cancel').click();
    await page.waitForFunction(() => window.__diskTest.aborted);
    assert.equal(await page.evaluate(() => window.__diskTest.closed),false);
    slow=false;
    console.log('PASS: Cancelar aborta la descarga y no confirma un archivo incompleto.');

    await page.evaluate(() => {
      const video=document.createElement('video');video.preload='none';video.src=URL.createObjectURL(new MediaSource());
      document.getElementById('videos').appendChild(video);
    });
    await page.locator('.scan').click();
    const mse = page.locator('.item').filter({has:page.locator('.tag.mse')});
    await mse.first().getByRole('button',{name:'Ver ayuda'}).click();
    assert.match(await page.locator('.status-title').textContent(),/flujo del reproductor/);
    console.log('PASS: MediaSource se identifica como flujo y no se ofrece como un archivo completo.');

    await page.screenshot({path:process.env.TG_SCREENSHOT || path.join(work,'panel.png'),fullPage:true});
    const help = await context.newPage();
    await help.goto(`chrome-extension://${extensionId}/ayuda.html`);
    assert.equal(await help.locator('h1').textContent(),'Tus vídeos, guardados.');
    assert.equal(await help.locator('a.button').getAttribute('href'),'https://web.telegram.org/k/');
    assert.deepEqual(errors,[]);
    console.log('PASS: guía incluida accesible y sin errores JavaScript en la página.');
    console.log('Chrome:',await context.browser()?.version());
  } finally {
    await context.close();
    await fs.rm(work,{recursive:true,force:true});
  }
})().catch(error => {console.error(error);process.exitCode=1;});
