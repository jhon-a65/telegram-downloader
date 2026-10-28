const {harness,until,tick,OFFSET}=require('./topic-fixture.cjs');
const {FakeDirectory}=require('./fake-fs.cjs');
const assert=require('node:assert/strict');
FakeDirectory.prototype.kind='directory';
FakeDirectory.prototype.entries=async function*(){for(const x of this.children)yield x;};
const topicId=x=>x>=OFFSET?x-OFFSET:x;
async function setup(t,options={}){
  const h=harness(t,{count:options.count??2,...options});h.backup=null;h.backupStates=[];h.forumPageSize=2;h.historyPageSize=3;h.backupReads=[];h.photoReads=[];h.photoData=new Map();h.photos=new Map();h.historyCalls=[];h.forumCalls=[];
  h.w.document.addEventListener('tg-local:reply',event=>{const data=JSON.parse(event.detail);if(data.type==='backup-state'){h.backup=data;h.backupStates.push(data);}});
  const managers=h.w.appImManager.managers,original=managers.appMessagesManager.requestHistory;
  managers.appMessagesManager.requestHistory=async args=>{
    if(args.inputFilter)return original(args);
    assert.equal(args.peerId,-123);assert.equal(args.limit,100);h.historyCalls.push({...args});
    if(h.onHistory)await h.onHistory(args);
    const topic=args.threadId?topicId(args.threadId):null;
    let list=h.messages.filter(row=>(!topic||row.topic===topic)&&(!args.offsetId||row.message.id<topicId(args.offsetId))).map(row=>row.message);
    list=list.sort((a,b)=>b.id-a.id);
    if(h.repeatHistory&&args.offsetId)list=h.messages.filter(row=>!topic||row.topic===topic).map(row=>row.message).sort((a,b)=>b.id-a.id);
    if(h.foreignHistory)list=[{...list[0],peer_id:{channel_id:999}}];
    return {_:options.historyType||'messages.channelMessages',count:1,messages:list.slice(0,h.historyPageSize)};
  };
  managers.appPeersManager={getInputPeerById:async peer=>({_:'inputPeerChannel',channel_id:Math.abs(peer),access_hash:'local-only'})};
  managers.appChatsManager={getChannelInput:async id=>({_:'inputChannel',channel_id:id,access_hash:'local-only'})};
  managers.apiManager={invokeApi:async(method,args)=>{
    h.forumCalls.push({method,...args});if(h.onForum)await h.onForum(method,args);
    if(h.oldTopics&&method==='messages.getForumTopics')throw {type:'METHOD_INVALID'};
    assert.ok(['messages.getForumTopics','channels.getForumTopics'].includes(method));
    const list=[...h.titles].reverse().map(([id,title],n)=>({_: 'forumTopic',id,title,top_message:300000-n,date:1700000000+n}));
    let start=args.offset_topic?list.findIndex(x=>x.id===args.offset_topic)+1:0;if(h.repeatTopics)start=0;
    const topics=list.slice(start,start+h.forumPageSize);
    return {_: 'messages.forumTopics',count:1,topics,messages:topics.map(t=>({id:t.top_message,date:t.date}))};
  }};
  managers.appPhotosManager={getPhoto:async id=>h.photos.get(id)};
  managers.apiFileManager={requestFilePart:async args=>{
    h.photoReads.push(args);assert.equal(args.location._,'inputPhotoFileLocation');assert.equal(args.location.thumb_size,'y');
    if(h.onPhotoRead)await h.onPhotoRead(args);
    const data=h.photoData.get(String(args.location.id));return {bytes:new Uint8Array(data.subarray(args.offset,args.offset+args.limit))};
  }};
  h.command=(type,fields={})=>h.w.document.dispatchEvent(new h.w.CustomEvent('tg-local:command',{detail:JSON.stringify({channel:h.state.channel,type,...fields})}));
  h.w.document.addEventListener('tg-local:command',event=>{const data=JSON.parse(event.detail);if(data.type==='backup-stop')h.wasStopped=true;});
  h.$('.scan').click();h.$('.mode-backup').click();
  h.load=async()=>{h.$('.backup-refresh').click();await until(()=>h.backup&&!h.backup.busy);};
  h.start=()=>h.$('.backup-start').click();h.update=()=>h.$('.backup-update').click();
  h.finished=()=>h.backup&&!h.backup.busy&&['done','error','stopped'].includes(h.backup.phase);
  h.directory=()=>[...h.root.children.values()].find(x=>x.name.startsWith('Respaldo_'))||(h.root.files.has('Telegram-respaldo.json')?h.root:null);
  h.manifest=()=>JSON.parse(h.directory().files.get('Telegram-respaldo.json').toString());
  h.records=()=>h.manifest().files;
  h.files=()=>{
    const result=new Map();function visit(dir,prefix=''){for(const [name,data]of dir.files)if(!/\.json$|\.txt$/.test(name))result.set(prefix+name,data);for(const[name,child]of dir.children)visit(child,prefix+name+'/');}if(h.directory())visit(h.directory());return result;
  };
  h.choose=(ids)=>{h.$('#backup-selected').click();const inputs=[...h.ui.querySelectorAll('.backup-topic-list input')];for(let n=0;n<inputs.length;n++){const topic=[...h.titles.keys()].sort((a,b)=>a-b)[n];if(ids.includes(topic)&&!inputs[n].checked)inputs[n].click();}};
  let serial=400000;
  h.addFile=(topic,kind,data=Buffer.from('bytes de prueba'))=>{
    const mid=++serial,remote=String(90000000000000000n+BigInt(mid));
    let media;
    if(kind==='photos'){
      const photo={_: 'photo',id:remote,dc_id:2,access_hash:'secret-not-exported',file_reference:[1,2,3],sizes:[{_: 'photoSize',type:'y',w:1920,h:1080,size:data.length}]};
      h.photos.set(remote,photo);h.photoData.set(remote,data);media={_: 'messageMediaPhoto',photo};
    }else{
      const mime={videos:'video/mp4',audio:'audio/ogg',documents:'application/pdf'}[kind],ext={videos:'mp4',audio:'ogg',documents:'pdf'}[kind];
      const doc={_: 'document',id:remote,dc_id:2,size:data.length,mime_type:mime,file_name:'Mismo nombre.'+ext,attributes:[]};media={_: 'messageMediaDocument',document:doc};
      h.docs.set(remote,{doc,topic});
    }
    const message={_: 'message',id:mid,peer_id:{channel_id:123},date:1700000000+mid,message:'Descripción '+mid,media,...(topic!==1?{reply_to:{pFlags:{forum_topic:true},reply_to_top_id:topic}}:{})};
    h.messages.push({topic,message});return {message,id:remote,data};
  };
  const close=h.close;h.close=async()=>{if(!h.closed){h.command('backup-stop');await tick(0);}await close();};
  if(options.autoLoad!==false)await h.load();
  return h;
}
module.exports={setup,until,tick,OFFSET};
