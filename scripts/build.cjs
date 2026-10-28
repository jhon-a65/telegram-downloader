/* Compila las dos plantillas locales. La extensión distribuida ya viene preparada. */
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(base,'panel.css'),'utf8');
const html=fs.readFileSync(path.join(base,'panel.html'),'utf8');
const p=path.join(base,'content.js'),code=fs.readFileSync(p,'utf8');
if(!code.includes('/* PANEL_START */'))throw new Error('No se encontró el marcador de la plantilla.');
fs.writeFileSync(p,code.replace(/\/\* PANEL_START \*\/[\s\S]*?\/\* PANEL_END \*\//,()=>`/* PANEL_START */ ${JSON.stringify(html)} /* PANEL_END */`));
fs.writeFileSync(path.join(base,'panel-styles.js'),'/* Generado por scripts/build.cjs a partir de panel.css. */\nglobalThis.TGLocalPanelStyles = '+JSON.stringify(css)+';\n');
console.log('Interfaz preparada.');
