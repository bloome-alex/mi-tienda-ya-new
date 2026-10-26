import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('transfer history endpoint is plan gated and only queries accepted outgoing transfers',()=>{
  const routes=read('src/routes/core.js');
  const service=read('src/services/StoreTransferService.js');
  assert.match(routes,/\/me\/store-transfers\/history/);
  assert.match(routes,/requireFeature\('stores\.transfer'\)/);
  assert.match(service,/transferredHistory/);
  assert.match(service,/status: 'accepted', fromUserId: user\._id/);
  assert.match(service,/sort\(\{ acceptedAt: -1, updatedAt: -1 \}\)/);
});
