import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('el enlace /t/:slug queda expuesto como acceso permanente aunque exista dominio',()=>{
  const domain=read('src/services/DomainService.js');
  const core=read('src/services/core.js');
  assert.match(domain,/pathUrl\(store\)/);
  assert.match(domain,/pathUrl: this\.pathUrl\(store\)/);
  assert.match(core,/data\.pathUrl = data\.domain\.pathUrl/);
  assert.match(core,/pathUrl: data\.pathUrl/);
});

test('el HTML distingue acceso por hostname de acceso por path sin deshabilitar /t/:slug',()=>{
  const app=read('src/app.js');
  assert.match(app,/const resolvedByHostname = Boolean\(store\)/);
  assert.match(app,/req\.path\.match\(\/\^\\\/t\\\//);
  assert.match(app,/mty-store-hosted/);
  assert.match(app,/resolvedByHostname \? '1' : '0'/);
  assert.match(app,/mty-store-path-url/);
  assert.doesNotMatch(app,/domain\.mode[^\n]*(?:path|slug)[^\n]*(?:return|redirect)/i);
});
