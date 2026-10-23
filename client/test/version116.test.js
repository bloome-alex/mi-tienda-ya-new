import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('navbar exposes transfer notification and pending store state',()=>{
  const layout=read('src/layouts/DashboardLayout.vue');
  assert.match(layout,/to="\/app\/transfers"/);
  assert.match(layout,/pendingIncomingCount/);
  assert.match(layout,/Transferencia pendiente/);
});

test('seller transfer screen supports create accept cancel return and history',()=>{
  const view=read('src/views/seller/TransfersView.vue');
  for(const fragment of ['/me/store-transfers','/accept','/cancel','/return','Historial','Devolver al dueño anterior']) assert.ok(view.includes(fragment),fragment);
});

test('plan form exposes public visibility and inherited card only lists extras',()=>{
  const form=read('src/views/admin/PlanFormView.vue');
  assert.match(form,/Visible públicamente/);
  assert.match(form,/Todo lo de \{\{parentPlan\.name\}\}/);
  assert.match(form,/directPreview/);
  const settings=read('src/views/admin/SettingsView.vue');
  assert.match(settings,/Público/); assert.match(settings,/Oculto/);
});
