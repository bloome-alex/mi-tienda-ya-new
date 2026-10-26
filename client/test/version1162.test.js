import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
const read=relative=>readFileSync(path.join(here,'..',relative),'utf8');

test('transfer-only empty blocks are hidden when the plan cannot transfer stores',()=>{
  const view=read('src/views/seller/TransfersView.vue');
  assert.doesNotMatch(view,/Tu plan no incluye transferencias de tiendas/);
  assert.match(view,/v-if="data\.canTransfer&&!useStoreAbm" class="p-section-card"/);
  assert.match(view,/v-if="data\.canTransfer" class="p-section-card"/);
});

test('seller navigation exposes a transfer history only with stores.transfer',()=>{
  const layout=read('src/layouts/DashboardLayout.vue');
  const router=read('src/router.js');
  assert.match(layout,/Historial de Transferencias/);
  assert.match(layout,/transfer-history.*stores\.transfer/);
  assert.match(router,/path:'transfer-history'.*feature:'stores\.transfer'/);
});

test('transfer history is a dedicated server-backed list without transfer actions',()=>{
  const view=read('src/views/seller/TransferHistoryView.vue');
  assert.match(view,/\/me\/store-transfers\/history/);
  assert.match(view,/Historial de Transferencias/);
  assert.doesNotMatch(view,/Devolver al dueño anterior/);
  assert.doesNotMatch(view,/Cancelar transferencia/);
});

test('visible app version comes from the root package.json through Vite',()=>{
  const config=read('vite.config.js');
  const layout=read('src/layouts/DashboardLayout.vue');
  const metadata=read('src/services/appMetadata.js');
  assert.match(config,/new URL\('\.\.\/package\.json', import\.meta\.url\)/);
  assert.match(config,/__APP_VERSION__.*rootPackage\.version/);
  assert.match(metadata,/new AppMetadataService\(__APP_VERSION__\)/);
  assert.match(layout,/appVersion/);
});
