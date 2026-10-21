import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { bootstrap } from '../src/services/core.js';
import { quotaService } from '../src/services/QuotaService.js';
import { User, Plan, Store, Product, Session } from '../src/models/index.js';
import { hashToken, randomToken } from '../src/utils/crypto.js';
let memory, app, admin;
async function actor(user) {
  const token = randomToken(), csrf = randomToken();
  await Session.create({ userId: user._id, tokenHash: hashToken(token), csrfToken: csrf, expiresAt: new Date(Date.now() + 86400000) });
  return { user, call(method, url, body) { const req = request(app)[method](url).set('Cookie', `mt_session=${token}`).set('X-CSRF-Token', csrf); return body === undefined ? req : req.send(body); } };
}
async function owner(name, maxStores = 2, maxProducts = 2) {
  const plan = await Plan.create({ name: `Plan ${name}`, price: 100, maxStores, maxProducts });
  const user = await User.create({ role: 'vendedor', name, email: `${name}@example.test`, planId: plan._id, planExpiresAt: new Date(Date.now() + 86400000), trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 86400000) });
  return { ...(await actor(user)), plan };
}
const createStore = (who, suffix, active = false) => admin.call('post', '/api/admin/stores', { ownerId: String(who.user._id), name: `${who.user.name} ${suffix}`, slug: `${who.user.name}-${suffix}`, active });
before(async () => {
  config.rootUser = 'quota-admin'; config.rootPassword = 'Cuotas-seguras-2026'; config.encryptionKey = 'c'.repeat(64); config.sessionSecret = config.encryptionKey; config.isProduction = false; config.appUrl = 'http://localhost:5000'; config.bcryptRounds = 10;
  memory = await MongoMemoryServer.create({ instance: { dbName: 'quota_test' } });
  await mongoose.connect(memory.getUri()); await bootstrap(); app = createApp();
  admin = await actor(await User.findOneAndUpdate({ role: 'admin' }, { $set: { mustChangePassword: false } }, { returnDocument: 'after' }));
});
after(async () => { await mongoose.disconnect(); await memory?.stop(); });

test('concurrent store creation atomically acquires only available owner slots', async () => {
  const who = await owner('concurrent-stores');
  const results = await Promise.all(['uno', 'dos', 'tres', 'cuatro'].map(suffix => createStore(who, suffix)));
  assert.equal(results.filter(r => r.status === 201).length, 2, JSON.stringify(results.map(r => r.body)));
  assert.equal(results.filter(r => r.status === 403).length, 2);
  const stores = await Store.find({ ownerId: who.user._id, archived: false }).sort({ ownerSlot: 1 });
  assert.deepEqual(stores.map(s => s.ownerSlot), [0, 1]);
});

test('concurrent product creation cannot exceed maxProducts and an archived slot can be reused', async () => {
  const who = await owner('concurrent-products');
  const created = await createStore(who, 'tienda'); assert.equal(created.status, 201);
  const storeId = created.body.data._id;
  const results = await Promise.all([1, 2, 3, 4].map(i => who.call('post', `/api/stores/${storeId}/products`, { name: `Producto ${i}`, price: 100, stock: 4 })));
  assert.equal(results.filter(r => r.status === 201).length, 2, JSON.stringify(results.map(r => r.body)));
  assert.equal(results.filter(r => r.status === 403).length, 2);
  let products = await Product.find({ storeId, archived: false }).sort({ quotaSlot: 1 });
  assert.deepEqual(products.map(p => p.quotaSlot), [0, 1]);
  assert.equal((await who.call('delete', `/api/stores/${storeId}/products/${products[0]._id}`)).status, 200);
  const replacement = await who.call('post', `/api/stores/${storeId}/products`, { name: 'Reemplazo', price: 150 });
  assert.equal(replacement.status, 201, JSON.stringify(replacement.body));
  products = await Product.find({ storeId, archived: false }).sort({ quotaSlot: 1 }); assert.deepEqual(products.map(p => p.quotaSlot), [0, 1]);
});

test('concurrent activation honors the publication limit and preserves both stores', async () => {
  const who = await owner('concurrent-activation');
  const a = await createStore(who, 'primera'), b = await createStore(who, 'segunda');
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  assert.equal((await admin.call('put', `/api/admin/plans/${who.plan._id}`, { maxStores: 1 })).status, 200);
  const results = await Promise.all([a.body.data._id, b.body.data._id].map(id => who.call('put', `/api/stores/${id}`, { active: true })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 403], JSON.stringify(results.map(r => r.body)));
  assert.equal(await Store.countDocuments({ ownerId: who.user._id, active: true }), 1);
  assert.equal(await Store.countDocuments({ ownerId: who.user._id, archived: false }), 2);
});

test('editing a plan deactivates excess stores by the same deterministic public ranking without losing content', async () => {
  const who = await owner('plan-downgrade');
  const first = await createStore(who, 'primera', true), second = await createStore(who, 'segunda', true);
  assert.equal(first.status, 201); assert.equal(second.status, 201);
  await Product.create({ storeId: second.body.data._id, name: 'Contenido conservado', price: 500, stock: 3 });
  const result = await admin.call('put', `/api/admin/plans/${who.plan._id}`, { maxStores: 1 }); assert.equal(result.status, 200);
  const stores = await Store.find({ ownerId: who.user._id }).sort({ createdAt: 1, _id: 1 });
  assert.equal(stores[0].active, true); assert.equal(stores[1].active, false);
  assert.equal(await Product.countDocuments({ storeId: second.body.data._id, archived: false }), 1);
  assert.equal((await who.call('get', `/api/stores/${second.body.data._id}/products`)).status, 200);
  assert.equal((await request(app).get(`/api/public/stores/${stores[1].slug}`)).status, 404);
});

test('legacy rows receive unique slots before new writes; direct index collisions fail atomically', async () => {
  const who = await owner('legacy-quotas', 2, 3);
  const store = await Store.create({ ownerId: who.user._id, name: 'Antes de la migración', slug: 'legacy-quotas-existing', active: true });
  await Product.create([{ storeId: store._id, name: 'Anterior 1', price: 100 }, { storeId: store._id, name: 'Anterior 2', price: 100 }]);
  await quotaService.initialize();
  const reloaded = await Store.findById(store._id); assert.equal(reloaded.ownerSlot, 0); assert.equal(reloaded.publicationSlot, 0);
  const rows = await Product.find({ storeId: store._id }).sort({ quotaSlot: 1 }); assert.deepEqual(rows.map(p => p.quotaSlot), [0, 1]);
  const results = await Promise.all([1, 2].map(i => who.call('post', `/api/stores/${store._id}/products`, { name: `Nuevo ${i}`, price: 200 })));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 403]);
  await assert.rejects(Product.create({ storeId: store._id, name: 'Colisión de índice', price: 1, quotaSlot: 0 }), error => error.code === 11000);
});
