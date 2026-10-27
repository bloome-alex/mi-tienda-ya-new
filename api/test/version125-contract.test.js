import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LegalDocumentService, defaultLegalDocuments } from '../src/services/LegalDocumentService.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const appRoot=path.resolve(root,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const readApp=relative=>fs.readFileSync(path.join(appRoot,relative),'utf8');

test('los documentos legales iniciales cubren privacidad, seguridad e integraciones principales',()=>{
  assert.equal(defaultLegalDocuments.privacy.enabled,true);
  assert.equal(defaultLegalDocuments.terms.enabled,true);
  assert.ok(defaultLegalDocuments.privacy.sections.length>=15);
  assert.ok(defaultLegalDocuments.terms.sections.length>=20);
  const privacy=defaultLegalDocuments.privacy.sections.map(item=>`${item.title} ${item.content}`).join(' ');
  const terms=defaultLegalDocuments.terms.sections.map(item=>`${item.title} ${item.content}`).join(' ');
  for(const expected of ['Mercado Pago','Facebook Ads','Google Ads','TikTok Ads','Cloudflare R2','CSRF','CORS','bcrypt']) assert.match(privacy,new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
  for(const expected of ['suscripciones','productos digitales','dominios','PWA','publicidad','transferencia de tiendas','seguridad']) assert.match(terms,new RegExp(expected,'i'));
});

test('LegalDocumentService normaliza y conserva una estructura segura de texto plano',()=>{
  const service=new LegalDocumentService();
  const normalized=service.normalize({schemaVersion:2,privacy:{enabled:false,title:'Mi política',intro:'Resumen',updatedAt:'2026-10-20',sections:[{title:'Datos',content:'Contenido'}]}});
  assert.equal(normalized.privacy.enabled,false);
  assert.equal(normalized.privacy.title,'Mi política');
  assert.deepEqual(normalized.privacy.sections,[{title:'Datos',content:'Contenido'}]);
  assert.ok(normalized.terms.sections.length>=20);
});

test('la API publica documentos y administración puede modificarlos desde Settings',()=>{
  const model=read('src/models/index.js');
  const routes=read('src/routes/core.js');
  const core=read('src/services/core.js');
  assert.match(model,/legal: \{ type: Schema\.Types\.Mixed, default: \{\} \}/);
  assert.match(core,/legal: defaultLegalDocuments/);
  assert.match(routes,/router\.get\('\/public\/legal\/:kind'/);
  assert.match(routes,/LEGAL_DOCUMENT_NOT_PUBLISHED/);
  assert.match(routes,/legalDocumentService\.merge\(settings\.legal, body\.legal\)/);
  assert.match(routes,/legalDocumentsUpdated/);
});

test('el cliente expone las páginas globales y un editor administrativo',()=>{
  const router=readApp('client/src/router.js');
  const page=readApp('client/src/views/public/LegalDocumentView.vue');
  const settings=readApp('client/src/views/admin/SettingsView.vue');
  const home=readApp('client/src/views/public/HomeView.vue');
  assert.match(router,/politica-de-privacidad/);
  assert.match(router,/condiciones-del-servicio/);
  assert.match(router,/alias:'\/privacidad'/);
  assert.match(router,/alias:'\/terminos'/);
  assert.match(page,/public\/legal\/\$\{props\.kind\}/);
  assert.match(page,/white-space:pre-line/);
  assert.match(settings,/\['legal','Legales','shield'\]/);
  assert.match(settings,/Documentos legales de la aplicación/);
  assert.match(settings,/Agregar sección/);
  assert.match(home,/Política de privacidad/);
  assert.match(home,/Condiciones del servicio/);
});

test('la base legal permanece incluida en la versión 1.25.x',()=>{
  const rootPackage=JSON.parse(readApp('package.json'));
  const apiPackage=JSON.parse(read('package.json'));
  const clientPackage=JSON.parse(readApp('client/package.json'));
  assert.match(rootPackage.version,/^1\.25\./);
  assert.match(apiPackage.version,/^1\.25\./);
  assert.match(clientPackage.version,/^1\.25\./);
});
