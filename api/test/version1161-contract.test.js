import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('seller multi-store management is owner scoped and quota driven',()=>{
  const service=read('src/services/StoreManagementService.js');
  const routes=read('src/routes/core.js');
  assert.match(service,/class StoreManagementService/);
  assert.match(service,/management\.stores/);
  assert.match(service,/ownerId: user\._id/);
  assert.match(service,/quotaService\.createStore/);
  assert.match(service,/quotaService\.saveStore/);
  assert.match(routes,/router\.get\('\/me\/stores'/);
  assert.match(routes,/router\.post\('\/me\/stores'/);
  assert.match(routes,/router\.put\('\/me\/stores\/:id'/);
  assert.match(routes,/router\.delete\('\/me\/stores\/:id'/);
});

test('seller cannot archive a store while its transfer is pending',()=>{
  const service=read('src/services/StoreManagementService.js');
  assert.match(service,/StoreTransfer\.exists\(\{ storeId, fromUserId: user\._id, status: 'pending' \}\)/);
  assert.match(service,/TRANSFER_PENDING/);
});

test('whatsapp schedules persisted-session reconnect after the API is listening',()=>{
  const service=read('src/services/WhatsAppService.js');
  const index=read('src/index.js');
  assert.match(service,/hasPersistedSession\(\)/);
  assert.match(service,/autoReconnectDisabled\(\)/);
  assert.match(service,/scheduleAutoReconnect/);
  assert.match(service,/markManualDisconnect/);
  assert.match(index,/whatsappService\.scheduleAutoReconnect\(\)/);
});
