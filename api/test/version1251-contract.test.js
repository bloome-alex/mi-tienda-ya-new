import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LegalDocumentService, defaultLegalDocuments, LEGAL_DOCUMENT_SCHEMA_VERSION } from '../src/services/LegalDocumentService.js';
import { LegalPageRenderer } from '../src/services/LegalPageRenderer.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const appRoot=path.resolve(root,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const readApp=relative=>fs.readFileSync(path.join(appRoot,relative),'utf8');

test('la política divulga específicamente acceso, uso, almacenamiento y compartición de datos Google',()=>{
  const privacy=defaultLegalDocuments.privacy.sections.map(x=>`${x.title}\n${x.content}`).join('\n');
  for(const expected of ['https://www.googleapis.com/auth/adwords','access token','refresh token','Google Ads API','Limited Use','no solicita acceso a Gmail','no vende','retargeting','inteligencia artificial','revocar']) assert.match(privacy,new RegExp(expected,'i'));
  assert.ok(defaultLegalDocuments.privacy.sections.length>=24);
  assert.equal(LEGAL_DOCUMENT_SCHEMA_VERSION,2);
});

test('la migración legal conserva contenido existente y agrega divulgaciones Google una sola vez',()=>{
  const service=new LegalDocumentService();
  const legacy={schemaVersion:1,privacy:{enabled:true,title:'Privacidad personalizada',intro:'Mi intro',updatedAt:'2026-10-20',sections:[{title:'1. Sección propia',content:'No reemplazar'}]},terms:defaultLegalDocuments.terms};
  const migrated=service.normalize(legacy);
  assert.equal(migrated.schemaVersion,2);
  assert.equal(migrated.privacy.title,'Privacidad personalizada');
  assert.equal(migrated.privacy.sections[0].content,'No reemplazar');
  assert.match(migrated.privacy.sections.map(x=>x.title).join(' '),/Google Ads y datos de usuario de Google/i);
  const again=service.normalize(migrated);
  const googleSections=again.privacy.sections.filter(x=>/datos de usuario de Google/i.test(x.title));
  assert.equal(googleSections.length,1);
});

test('el renderer legal genera HTML completo y escapa contenido administrativo',()=>{
  const renderer=new LegalPageRenderer();
  const html=renderer.render({kind:'privacy',appUrl:'https://mitiendaya.com.ar',document:{title:'Privacidad <script>',intro:'Datos & uso',updatedAt:'2026-10-27',sections:[{title:'Google',content:'No <script>alert(1)</script>'}]},contact:{email:'privacidad@mitiendaya.com.ar'}});
  assert.match(html,/<!doctype html>/i);
  assert.match(html,/rel="canonical" href="https:\/\/mitiendaya\.com\.ar\/politica-de-privacidad"/);
  assert.match(html,/Datos &amp; uso/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('Express sirve las páginas legales antes del fallback SPA',()=>{
  const app=read('src/app.js');
  const legalIndex=app.indexOf("app.get('/politica-de-privacidad'");
  const fallbackIndex=app.indexOf("app.get('/{*path}'");
  assert.ok(legalIndex>=0 && fallbackIndex>legalIndex);
  assert.match(app,/legalPageRenderer\.render/);
  assert.match(app,/res\.redirect\(301, '\/politica-de-privacidad'\)/);
});

test('la versión distribuida es 1.25.1',()=>{
  for(const file of ['package.json','api/package.json','client/package.json']) assert.equal(JSON.parse(readApp(file)).version,'1.25.1');
});
