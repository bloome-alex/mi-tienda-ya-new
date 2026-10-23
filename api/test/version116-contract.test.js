import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoreTransferPolicy } from '../src/services/StoreTransferPolicy.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('plan inheritance stores only extras and supports hidden plans',()=>{
  const features=read('src/services/PlanFeatureService.js');
  const routes=read('src/routes/core.js');
  const models=read('src/models/index.js');
  assert.match(features,/directKeysForSave/);
  assert.match(features,/Incluye todo lo de/);
  assert.match(features,/stores\.transfer/);
  assert.match(models,/visible: \{ type: Boolean, default: true \}/);
  assert.match(routes,/visible: \{ \$ne: false \}/);
  assert.match(routes,/visible: trueBoolean\.default\(true\)/);
});

test('recipient must have a paid plan and an available store slot',()=>{
  const policy=new StoreTransferPolicy();
  const trial=policy.eligibility({user:{role:'vendedor',active:true,planId:null},entitlement:{allowed:true,trial:true,maxStores:1},ownedCount:0});
  assert.equal(trial.allowed,false); assert.equal(trial.code,'TRANSFER_SUBSCRIPTION_REQUIRED');
  const full=policy.eligibility({user:{role:'vendedor',active:true,planId:'plan'},entitlement:{allowed:true,trial:false,maxStores:2},ownedCount:2});
  assert.equal(full.allowed,false); assert.equal(full.code,'TRANSFER_STORE_LIMIT');
  const ok=policy.eligibility({user:{role:'vendedor',active:true,planId:'plan'},entitlement:{allowed:true,trial:false,maxStores:2},ownedCount:1});
  assert.equal(ok.allowed,true); assert.equal(ok.availableStores,1);
});

test('transfer API keeps ownership pending and changes it only on acceptance',()=>{
  const service=read('src/services/StoreTransferService.js');
  const routes=read('src/routes/core.js');
  assert.match(service,/status: 'pending'/);
  assert.match(service,/Store\.findOne\(\{ _id: storeId, ownerId: user\._id/);
  assert.match(service,/store\.ownerId = user\._id/);
  assert.match(service,/quotaService\.saveStore\(store, \{ ownerChanged: true \}\)/);
  assert.match(routes,/\/me\/store-transfers\/.*\/accept/);
  assert.match(routes,/\/me\/store-transfers\/.*\/cancel/);
  assert.match(routes,/\/me\/store-transfers\/.*\/return/);
});

test('only one pending transfer can exist for the same store',()=>{
  const models=read('src/models/index.js');
  assert.match(models,/store_transfer_pending_unique/);
  assert.match(models,/partialFilterExpression: \{ status: 'pending' \}/);
});

test('first login with a pending incoming transfer does not consume the first store slot',()=>{
  const core=read('src/services/core.js');
  assert.match(core,/StoreTransfer\.exists\(\{ recipientEmail:/);
  assert.match(core,/stores === 0 && !pendingTransfer/);
});
