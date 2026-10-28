const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const base=path.resolve(__dirname,'..');
const files=fs.readdirSync(path.join(base,'pruebas')).filter(x=>x.endsWith('.test.cjs')&&x!=='browser.test.cjs').sort().map(x=>'pruebas/'+x);
const result=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{cwd:base,stdio:'inherit',env:process.env});
process.exit(result.status??1);
