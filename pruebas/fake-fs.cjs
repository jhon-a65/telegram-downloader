/* Sistema de archivos simulado para pruebas; no se carga en la extensión. */
class FakeDirectory {
  constructor(name='Grupo de prueba') { this.name=name;this.files=new Map();this.children=new Map();this.writes=0;this.aborts=0;this.closes=0;this.denied=false; }
  get videoFiles() { return new Map([...this.files].filter(([name]) => !/\.json$/.test(name))); }
  async requestPermission() { return this.denied?'denied':'granted'; }
  async getDirectoryHandle(name,options={}) {
    if(!this.children.has(name)) {
      if(!options.create)throw new DOMException('No existe','NotFoundError');
      this.children.set(name,new FakeDirectory(name));
    }
    return this.children.get(name);
  }
  async getFileHandle(name,options={}) {
    if(this.denied)throw new DOMException('Sin permiso','NotAllowedError');
    if(!this.files.has(name)) {
      if(!options.create)throw new DOMException('No existe','NotFoundError');
      this.files.set(name,Buffer.alloc(0));
    }
    return {
      getFile:async()=>({size:this.files.get(name).length,text:async()=>this.files.get(name).toString('utf8')}),
      createWritable:async()=>{
        const parts=[];
        return {write:async bytes=>{this.writes++;parts.push(Buffer.from(bytes));},
          close:async()=>{this.closes++;this.files.set(name,Buffer.concat(parts));},
          abort:async()=>{this.aborts++;}};
      }
    };
  }
}
module.exports={FakeDirectory};
