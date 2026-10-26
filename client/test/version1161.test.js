import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('seller sees stores ABM only when Gestión de Tiendas is enabled',()=>{
  const layout=read('src/layouts/DashboardLayout.vue');
  const router=read('src/router.js');
  assert.match(layout,/\['Tiendas','\/app\/stores','store','management\.stores'\]/);
  assert.match(router,/path:'stores'.*feature:'management\.stores'/s);
  assert.match(router,/to\.meta\.feature/);
  assert.doesNotMatch(router,/multiStore/);
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
