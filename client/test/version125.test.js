import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');

test('las páginas legales globales usan API pública y no interpretan HTML editable',()=>{
  const page=source('views/public/LegalDocumentView.vue');
  assert.match(page,/api\.get\(`\/public\/legal\/\$\{props\.kind\}`\)/);
  assert.match(page,/\{\{section\.content\}\}/);
  assert.doesNotMatch(page,/v-html/);
  assert.match(page,/white-space:pre-line/);
});

test('configuración permite administrar privacidad y condiciones con secciones',()=>{
  const view=source('views/admin/SettingsView.vue');
  assert.match(view,/tab==='legal'/);
  assert.match(view,/settings\.legal\[kind\]\.sections/);
  assert.match(view,/addLegalSection/);
  assert.match(view,/removeLegalSection/);
});
