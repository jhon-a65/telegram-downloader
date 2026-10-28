/* Latencia simulada: compara el motor, NO mide Telegram ni la conexión del usuario. */
const {createHash}=require('node:crypto');require('../core.js');require('../bulk-engine.js');
const E=TGLocalBulkEngine,P=E.PART_SIZE,data=Buffer.alloc(32*1024*1024+71);
for(let i=0;i<data.length;i++)data[i]=(i%251+Math.floor(i/P))%256;
const expected=createHash('sha256').update(data).digest('hex');
async function measure(parallelism){
  let active=0,maxActive=0,written=0,digest;const sum=createHash('sha256');
  const directory={name:'benchmark',getFileHandle:async(name,options)=>{if(!options?.create)throw new DOMException('No existe','NotFoundError');return {createWritable:async()=>({
    write:async bytes=>{written+=bytes.length;sum.update(bytes);},close:async()=>{digest=sum.digest('hex');},abort:async()=>{}})};}};
  const item={docId:'1',mid:1,peerId:-1,size:data.length,date:1,name:'Benchmark__tg_1.mp4'};
  const adapter={listPage:async filter=>({items:filter===E.FILTERS[0]?[item]:[],done:true}),resolve:async()=>({size:data.length}),readPart:async(item,doc,offset,limit)=>{
    active++;maxActive=Math.max(active,maxActive);await new Promise(resolve=>setTimeout(resolve,15));active--;return {bytes:new Uint8Array(data.subarray(offset,offset+limit))};}};
  const batch=new E.Batch({adapter,directory,scope:'1:-1',title:'benchmark',pageDelay:0,parallelism});
  const start=performance.now();await batch.run();const elapsed=performance.now()-start;
  if(batch.saved!==1||written!==data.length||digest!==expected)throw new Error('Falló la verificación del archivo del benchmark.');
  return {parallelism,maxActive,bytes:written,elapsedMs:Math.round(elapsed),sha256:digest};
}
(async()=>{
  const results=[];for(const value of [1,4,8,16])results.push(await measure(value));
  console.log(JSON.stringify({scope:'Transporte con 15 ms de latencia simulada por parte; no es una promesa de velocidad real.',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
