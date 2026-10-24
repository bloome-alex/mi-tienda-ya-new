import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('seller sees stores ABM only when the plan allows multiple stores',()=>{
  const layout=read('src/layouts/DashboardLayout.vue');
  const router=read('src/router.js');
  assert.match(layout,/canManageMultipleStores/);
  assert.match(layout,/Number\(auth\.entitlement\?\.maxStores\|\|1\)>1/);
  assert.match(layout,/\['Tiendas','\/app\/stores'/);
  assert.match(router,/meta:\{multiStore:true,title:'Tiendas'\}/);
  assert.match(router,/to\.meta\.multiStore.*maxStores/);
});

test('seller store ABM centralizes outgoing transfer state and cancellation',()=>{
  const view=read('src/views/admin/StoresView.vue');
  for(const fragment of ['/me/stores','/me/store-transfers','Pendiente de aceptación','Cancelar transferencia','Iniciar transferencia']) assert.ok(view.includes(fragment),fragment);
  assert.match(view,/pendingOutgoing/);
  assert.match(view,/canFeature\('stores\.transfer'\)/);
});

test('multi-store seller form uses own-store routes without owner reassignment',()=>{
  const form=read('src/views/admin/StoreFormView.vue');
  assert.match(form,/isAdmin\.value\?'\/admin\/stores':'\/me\/stores'/);
  assert.match(form,/isAdmin\.value\?\{ownerId:form\.ownerId\}:\{\}/);
  assert.match(form,/v-if="isAdmin"/);
});
