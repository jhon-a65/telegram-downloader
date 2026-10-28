/* Documentation previews: real extension UI, explicit sample data, no Telegram or disk requests. */
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..'),output=path.resolve(process.argv[2]||path.join(base,'preview-output'));
fs.mkdirSync(output,{recursive:true});
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://web.telegram.org/k/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document;Object.defineProperty(w.navigator,'language',{value:'en-US'});
w.chrome={runtime:{sendMessage:async()=>{},onMessage:{addListener(){}}},storage:{local:{get:async()=>({}),set:async()=>{}}}};
let channel='';const reply=data=>d.dispatchEvent(new w.CustomEvent('tg-local:reply',{detail:JSON.stringify({channel,...data})}));
const group='Learning Library · sample',scope='10:-123:backup';
const state={type:'backup-state',available:true,availableScope:scope,availableGroup:group,group,topicsReady:true,busy:false,phase:'idle',hasDirectory:false,found:0,saved:0,skipped:0,failed:0,message:'Elige qué conservar y dónde guardar tu copia.'};
d.addEventListener('tg-local:command',event=>{
  const command=JSON.parse(event.detail);if(command.type==='hello'){
    channel=command.channel;
    reply({type:'state',picker:true,items:[{id:'sample-1',name:'Lesson-01.mp4',kind:'range',size:320*1024**2,visible:true},{id:'sample-2',name:'Lesson-02.mp4',kind:'blob',size:128*1024**2,visible:false}]});
    reply({type:'bulk-state',available:true,availableScope:'10:-123',availableGroup:group,mode:'group',canStart:true,directoryPicker:true,topicAvailable:true,availableTopicTitle:'Video lessons',availableTopicId:101,phase:'idle',busy:false});
    reply({type:'manual-state',phase:'idle',busy:false,pending:0,saved:0,items:[],anchor:{available:false},message:'Añade los vídeos que quieras. Se guardarán en el orden de selección.'});
    reply(state);
    reply({type:'backup-topics',scope,revision:1,reset:true,done:true,topics:[{id:1,title:'General'},{id:101,title:'Video lessons'},{id:202,title:'Resources'}]});
    reply({type:'photo-state',available:false,busy:false,reason:'Abre la foto en el visor grande de Telegram, haciendo clic sobre ella.'});
  }
});
for(const file of ['i18n.js','panel-styles.js','content.js'])w.eval(fs.readFileSync(path.join(base,file),'utf8'));
const root=d.getElementById('tg-local-video-tools').shadowRoot,$=selector=>root.querySelector(selector);
const escape=value=>value.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function language(lang){$('#tg-language').value=lang;$('#tg-language').dispatchEvent(new w.Event('change'));}
function snapshot(name,{title,subtitle,step,body,kind='walkthrough'}){
  // Native form values and checks are properties; serialize them explicitly for a static renderer.
  const copy=root.querySelector('div').cloneNode(true);
  const originals=[...root.querySelectorAll('input')];
  for(const [index,input] of [...copy.querySelectorAll('input')].entries()){
    const original=originals[index];
    if(original?.checked)input.setAttribute('checked','');else input.removeAttribute('checked');
    if(original&&original.type!=='checkbox'&&original.type!=='radio')input.setAttribute('value',original.value);
  }
  for(const select of copy.querySelectorAll('select')){
    const original=root.querySelector('#'+select.id);
    for(const option of select.options)option.toggleAttribute('selected',option.value===original.value);
  }
  for(const p of copy.querySelectorAll('progress')){const original=root.querySelector('.'+[...p.classList].join('.'));if(original?.hasAttribute('value'))p.setAttribute('value',original.value);}
  for(const progress of [...copy.querySelectorAll('progress')]){
    const bar=d.createElement('div'),fill=d.createElement('span');bar.className=progress.className;bar.hidden=progress.hidden;
    bar.style.cssText='height:7px;background:#dce5f2;border-radius:5px;margin:12px 0;overflow:hidden;width:100%';
    fill.style.cssText='display:block;height:7px;background:#9a620e;width:'+Number(progress.getAttribute('value')||0)+'%';bar.append(fill);progress.replaceWith(bar);
  }
  if(kind==='walkthrough'){
    // Model the panel's scroll viewport for print rendering; live UI and preview data are unchanged.
    const view=copy.querySelector('.backup-view'),inner=d.createElement('div');while(view.firstChild)inner.append(view.firstChild);
    view.style.cssText='position:relative;height:690px;overflow:hidden;padding:0';inner.style.cssText='position:absolute;left:18px;right:18px;top:'+(name==='walkthrough-1'?18:-620)+'px';view.append(inner);
  }
  const css=fs.readFileSync(path.join(base,'panel.css'),'utf8').replace(/:host/g,'.demo-ui');
  const html=`<!doctype html><html lang="${$('#tg-language').value}"><head><meta charset="utf-8"><style>${css}
@page{size:${kind==='interface'?'650px 900px':'1100px 1050px'};margin:0}body{margin:0;background:#edf2f9;font-family:DejaVu Sans,sans-serif;color:#203149}.story{padding:48px;display:flex;gap:38px;align-items:flex-start}.intro{width:400px;padding-top:110px;flex-shrink:0}.intro h1{font-size:40px;line-height:1.15;color:#142a47;letter-spacing:-1px;margin:22px 0}.intro h2{font-size:25px;line-height:1.3;margin:0 0 20px}.intro p{font-size:17px;line-height:1.65;color:#526780}.step{display:inline-block;background:#e2eafb;color:#245bd4;padding:10px 15px;border-radius:12px;font-size:12px;font-weight:bold;letter-spacing:1px}.label{font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#71839d}.demo-ui{width:510px;flex-shrink:0;font-family:DejaVu Sans,sans-serif}.demo-ui .panel{position:relative;bottom:auto;right:auto;width:510px;max-height:none;display:block}.demo-ui .mode-tabs{display:flex}.demo-ui .mode-tabs button{width:25%}.demo-ui .mode-tabs .tab-icon{display:block}.demo-ui .launcher-row{margin-top:14px}.demo-ui .brand-mark{display:none}.demo-ui .head{gap:8px}.demo-ui .head-copy{min-width:0}.demo-ui .head-copy h2{font-size:20px}.demo-ui .individual-view,.demo-ui .backup-view{overflow:visible}.demo-ui details:not([open])>:not(summary){display:none!important}.demo-ui .backup-types{display:block}.demo-ui .backup-types label{display:inline-block;vertical-align:top;width:46%;margin:0 2% 8px 0;min-height:36px}.demo-ui .backup-types .messages-choice{width:96%}.demo-ui .footer{font-size:9px}.demo-ui .tiny-badge{font-size:8px}.demo-ui select{appearance:none}.demo-ui input[type=checkbox]:checked{background:#245be4}.single{padding:28px 70px}.single .label{margin:0 0 14px}.single .demo-ui{width:510px}.single .settings-toggle{background:#466392}.note{margin-top:26px;font-size:11px!important;color:#71839d!important}.demo-ui .item .download{display:block;flex:0 0 82px;width:82px;height:34px;min-height:34px;line-height:18px;padding:8px 10px}.demo-ui .item .info{flex:1;min-width:0}.demo-ui .item{min-height:72px}.demo-ui .toolbar .count{white-space:nowrap;flex:1}.demo-ui .toolbar>div{display:flex;gap:6px}.demo-ui .launch{width:160px;min-height:44px;line-height:20px}.demo-ui .language-settings label{display:inline}.demo-ui .language-settings select{margin-left:8px}
</style></head><body>${kind==='interface'?`<div class="single"><p class="label">${escape(subtitle)} · UI preview / Vista previa</p><div class="demo-ui">${copy.innerHTML}</div><p class="note">Sample data / Datos de ejemplo · v3.1.0</p></div>`:`<div class="story"><div class="intro"><span class="step">${escape(step)}</span><h1>Telegram<br>Downloader</h1><h2>${escape(title)}</h2><p>${escape(body)}</p><p class="label">${escape(subtitle)}</p><p class="note">Illustrated workflow · sample data<br>Not a live Telegram recording.</p></div><div class="demo-ui">${copy.innerHTML}</div></div>`}</body></html>`;
  fs.writeFileSync(path.join(output,name+'.html'),html);
}
(async()=>{
  // Let preference restoration finish before choosing explicit preview languages.
  await new Promise(resolve=>setTimeout(resolve,0));$('.launch').click();$('.settings-toggle').click();
  for(const lang of ['en','es']){language(lang);snapshot('interface-'+lang,{subtitle:lang==='en'?'English':'Español',kind:'interface'});}
  language('en');$('.settings-toggle').click();$('.mode-backup').click();$('#backup-selected').click();
  for(const input of root.querySelectorAll('.backup-topic-list input'))if(input.dataset.topic==='101'||input.dataset.topic==='202'){input.checked=true;input.dispatchEvent(new w.Event('change'));}
  $('#backup-photos').checked=true;$('#backup-documents').checked=true;
  snapshot('walkthrough-1',{step:'01 · CHOOSE',title:'Only the topics you want.',subtitle:'Your group → topic folders',body:'Select topics and file types. Choose a destination folder, then let the download run.'});
  reply({...state,phase:'downloading',busy:true,hasDirectory:true,found:24,saved:7,skipped:0,topicsTotal:2,topicsDone:2,messageCount:32,totalBytes:4.2*1024**3,completedScan:true,folder:'Respaldo_Learning-Library__tg_10_123',message:'Descargando la cola…',current:{name:'Lesson-08.mp4',bytes:192*1024**2,total:320*1024**2,speed:24*1024**2}});
  snapshot('walkthrough-2',{step:'02 · DOWNLOAD',title:'Files download automatically.',subtitle:'Parallel chunks · ordered disk writes',body:'Track completed files and the current download. Pause or stop whenever you need.'});
  reply({...state,phase:'done',busy:false,hasDirectory:true,found:27,saved:3,skipped:24,topicsTotal:2,topicsDone:2,messageCount:36,totalBytes:4.8*1024**3,completedScan:true,folder:'Respaldo_Learning-Library__tg_10_123',message:'Respaldo actualizado. Los archivos anteriores se conservan y no se descargaron otra vez.'});
  snapshot('walkthrough-3',{step:'03 · CONTINUE',title:'Come back. Keep your progress.',subtitle:'24 skipped · 3 new files',body:'Choose the same backup folder next time. Completed files are checked and skipped while missing files are added.'});
  w.close();console.log('Exported five UI previews with sample data to '+output);
})().catch(error=>{w.close();console.error(error);process.exitCode=1;});
