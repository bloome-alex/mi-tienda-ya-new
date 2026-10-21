import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const roots=['api/src','scripts'];
let count=0;
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())await walk(p);else if(/\.(m?js|cjs)$/.test(p)){const r=spawnSync(process.execPath,['--check',p],{stdio:'inherit'});if(r.status)process.exit(r.status);count++;}}}
for(const root of roots)await walk(root);
console.log(`Sintaxis válida en ${count} archivos JavaScript.`);
