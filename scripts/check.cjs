const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict'),vm=require('node:vm');
const base=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,3);assert.equal(manifest.version,JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8')).version);
assert.deepEqual(manifest.permissions,['storage']);
for(const group of manifest.content_scripts){assert.deepEqual(group.matches,['https://web.telegram.org/*']);for(const file of group.js)assert.ok(fs.existsSync(path.join(base,file)),file);}
for(const file of fs.readdirSync(base).filter(x=>x.endsWith('.js'))){const r=spawnSync(process.execPath,['--check',path.join(base,file)],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
const styles={};vm.runInNewContext(fs.readFileSync(path.join(base,'panel-styles.js'),'utf8'),styles);
assert.equal(styles.TGLocalPanelStyles,fs.readFileSync(path.join(base,'panel.css'),'utf8'),'Ejecuta npm run build para actualizar los estilos.');
const code=fs.readFileSync(path.join(base,'content.js'),'utf8'),literal=/\/\* PANEL_START \*\/([\s\S]*?)\/\* PANEL_END \*\//.exec(code);
assert.equal(JSON.parse(literal[1]),fs.readFileSync(path.join(base,'panel.html'),'utf8'),'Ejecuta npm run build para actualizar el panel.');
assert.ok(!manifest.content_scripts.flatMap(x=>x.js).some(x=>/transfer-gate/.test(x)));
assert.ok(!code.includes('tgLocalTransferOptions'));assert.ok(!fs.existsSync(path.join(base,'transfer-gate.js')));
console.log('Sintaxis, recursos, versión, permisos y plantillas: correctos.');
