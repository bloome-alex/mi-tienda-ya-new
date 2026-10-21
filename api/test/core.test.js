import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { bootstrap, MailService, EntitlementService } from '../src/services/core.js';
import { User, Plan, Store, Product, Category, MagicLink, Session } from '../src/models/index.js';
import { encryptSecret, decryptSecret } from '../src/utils/crypto.js';
import { validateDesign } from '../src/utils/design.js';

let memory, app, admin, adminSession, seller, other, originalSend;
const rootInitial = 'Inicial-segura-2026';
const rootChanged = 'Cambio-seguro-2026';
const outbox = [];
async function sellerSession(email, name = 'Vendedor') {
  const agent = request.agent(app);
  const result = await agent.post('/api/auth/magic/request').send({ email, name });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const token = outbox.at(-1).text.match(/token=([a-f0-9]{64})/)[1];
  const login = await agent.post('/api/auth/magic/consume').send({ token });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { agent, token, ...login.body.data, store: (await agent.get('/api/stores')).body.data[0] };
}
const put = (who, url, body) => who.agent.put(url).set('X-CSRF-Token', who.csrfToken).send(body);
const post = (who, url, body) => who.agent.post(url).set('X-CSRF-Token', who.csrfToken).send(body);
before(async () => {
  config.rootUser = 'admin-test'; config.rootPassword = rootInitial; config.encryptionKey = 'a'.repeat(64); config.sessionSecret = config.encryptionKey; config.isProduction = false; config.appUrl = 'http://localhost:5000'; config.bcryptRounds = 10;
  if (process.env.TEST_MONGODB_URI) await mongoose.connect(process.env.TEST_MONGODB_URI);
  else { memory = await MongoMemoryServer.create({ instance: { dbName: 'core_test' } }); await mongoose.connect(memory.getUri()); }
  await bootstrap(); await Promise.all([Category.init(), Product.init()]);
  originalSend = MailService.send; MailService.send = async mail => { outbox.push(mail); return { messageId: 'test-only' }; };
  app = createApp(); admin = request.agent(app);
});
after(async () => { MailService.send = originalSend; await mongoose.disconnect(); if (memory) await memory.stop(); });

test('bootstrap enforces one admin and stores a bcrypt hash, never the initial password', async () => {
  const root = await User.findOne({ role: 'admin' }).select('+passwordHash');
  assert.match(root.passwordHash, /^\$2[ab]\$/); assert.notEqual(root.passwordHash, rootInitial); assert.equal(root.mustChangePassword, true);
  await assert.rejects(User.create({ role: 'admin', username: 'otro' }), error => error.code === 11000);
  await bootstrap(); assert.equal(await User.countDocuments({ role: 'admin' }), 1);
});

test('initial root session cannot administer until password is changed; CSRF is mandatory', async () => {
  const login = await admin.post('/api/auth/root/login').send({ username: config.rootUser, password: rootInitial });
  assert.equal(login.status, 200, JSON.stringify(login.body)); assert.equal(login.body.data.user.passwordHash, undefined);
  const blocked = await admin.get('/api/admin/settings'); assert.equal(blocked.status, 403); assert.equal(blocked.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await admin.post('/api/auth/root/password').send({ currentPassword: rootInitial, newPassword: rootChanged })).status, 403);
  const changed = await admin.post('/api/auth/root/password').set('X-CSRF-Token', login.body.data.csrfToken).send({ currentPassword: rootInitial, newPassword: rootChanged });
  assert.equal(changed.status, 200, JSON.stringify(changed.body)); assert.equal(changed.body.data.user.mustChangePassword, false); adminSession = changed.body.data;
  assert.equal((await admin.get('/api/admin/settings')).status, 200);
  const forbiddenMutation = await admin.put('/api/admin/settings').send({ trialDays: 21 }); assert.equal(forbiddenMutation.status, 403);
  const update = await admin.put('/api/admin/settings').set('X-CSRF-Token', adminSession.csrfToken).send({ trialDays: 21, magicLinkMinutes: 4 }); assert.equal(update.status, 200);
});

test('magic links are hashed, expire, work once, and start the configured trial', async () => {
  seller = await sellerSession('uno@example.test', 'Tienda Uno');
  const link = await MagicLink.findOne({ email: seller.user.email }).lean();
  assert.equal(link.token, undefined); assert.notEqual(link.tokenHash, seller.token); assert.ok(link.consumedAt);
  const duplicate = await request(app).post('/api/auth/magic/consume').send({ token: seller.token }); assert.equal(duplicate.status, 401);
  assert.ok(Math.abs((new Date(seller.user.trialEndsAt) - new Date(seller.user.trialStartedAt)) / 86400000 - 21) < 0.01);
  assert.equal(seller.store.active, false);
  const sessions = await Session.find({ userId: seller.user._id }).lean(); assert.equal(sessions[0].token, undefined); assert.equal(sessions[0].tokenHash.length, 64);
  await request(app).post('/api/auth/magic/request').send({ email: 'expired@example.test' });
  const token = outbox.at(-1).text.match(/token=([a-f0-9]{64})/)[1];
  await MagicLink.updateOne({ email: 'expired@example.test' }, { $set: { expiresAt: new Date(Date.now() - 60000) } });
  assert.equal((await request(app).post('/api/auth/magic/consume').send({ token })).status, 401);
  assert.equal(await User.countDocuments({ email: 'expired@example.test' }), 0);
});

test('a precreated seller receives trial time on first verified sign in', async () => {
  const user = await User.create({ role: 'vendedor', name: 'Precreado', email: 'precreated@example.test' });
  assert.equal(user.trialStartedAt, undefined);
  const login = await sellerSession(user.email); assert.ok(login.user.trialStartedAt); assert.ok(login.user.trialEndsAt);
});

test('tenant isolation applies to reads, mutations, categories and related products', async () => {
  other = await sellerSession('dos@example.test', 'Tienda Dos');
  assert.equal((await seller.agent.get(`/api/stores/${other.store._id}`)).status, 404);
  assert.equal((await put(seller, `/api/stores/${other.store._id}`, { name: 'Intrusión' })).status, 404);
  assert.equal((await seller.agent.get('/api/admin/users')).status, 403);
  const category = await post(other, `/api/stores/${other.store._id}/categories`, { name: 'Privada' }); assert.equal(category.status, 201);
  const foreignCategory = await post(seller, `/api/stores/${seller.store._id}/products`, { name: 'Inválido', price: 100, categoryId: category.body.data._id }); assert.equal(foreignCategory.status, 422);
  const foreignProduct = await post(other, `/api/stores/${other.store._id}/products`, { name: 'Ajeno', price: 500, stock: 4 }); assert.equal(foreignProduct.status, 201);
  const related = await post(seller, `/api/stores/${seller.store._id}/products`, { name: 'Inválido', price: 100, relatedProductIds: [foreignProduct.body.data._id] }); assert.equal(related.status, 422);
});

test('product edition preserves stock, supports variants and filters collection search', async () => {
  const created = await post(seller, `/api/stores/${seller.store._id}/products`, { name: 'Remera azul', price: 900, stock: 18, variants: [{ id: 's-azul', name: 'S / Azul', stock: 9 }] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data._id;
  const edited = await put(seller, `/api/stores/${seller.store._id}/products/${id}`, { name: 'Remera verde', stock: 999, variants: [{ id: 's-azul', name: 'S / Azul', stock: 999 }] });
  assert.equal(edited.status, 200, JSON.stringify(edited.body)); assert.equal(edited.body.data.stock, 18); assert.equal(edited.body.data.variants[0].stock, 9); assert.equal(edited.body.data.price, 900);
  const search = await seller.agent.get(`/api/stores/${seller.store._id}/products?search=verde&limit=1&page=1`);
  assert.equal(search.body.meta.total, 1); assert.equal(search.body.data.length, 1);
  await Product.updateOne({ _id: id }, { $push: { reservations: { orderId: new mongoose.Types.ObjectId(), variantId: 's-azul', quantity: 1 } }, $inc: { stockVersion: 1 } });
  const blocked = await put(seller, `/api/stores/${seller.store._id}/products/${id}`, { variants: [] }); assert.equal(blocked.status, 409); assert.equal(blocked.body.error.code, 'RESERVATIONS_PENDING');
});

test('expired trial prevents publishing but allows seller to keep editing products and store design', async () => {
  await User.updateOne({ _id: other.user._id }, { $set: { trialEndsAt: new Date(Date.now() - 1000) } });
  const entitlement = await EntitlementService.forUser(other.user._id); assert.equal(entitlement.allowed, false);
  const publish = await put(other, `/api/stores/${other.store._id}`, { active: true }); assert.equal(publish.status, 403); assert.equal(publish.body.error.code, 'PLAN_REQUIRED');
  const create = await post(other, `/api/stores/${other.store._id}/products`, { name: 'Sigo trabajando', price: 600 }); assert.equal(create.status, 201);
  const design = await put(other, `/api/stores/${other.store._id}/design`, { design: { shop: { heroTitle: 'Mi próxima temporada' } } }); assert.equal(design.status, 200, JSON.stringify(design.body)); assert.equal(design.body.data.design.shop.heroTitle, 'Mi próxima temporada');
});

test('credentials are encrypted at rest, omitted from owner read, and cross-origin writes are rejected', async () => {
  const configuration = await put(seller, `/api/stores/${seller.store._id}/payments`, { payments: [], deliveries: [], mercadopago: { accessToken: 'TEST-secret-token', webhookSecret: 'secret-for-webhook', sandbox: true } });
  assert.equal(configuration.status, 200, JSON.stringify(configuration.body)); assert.equal(configuration.body.data.integrations.mercadopago.hasAccessToken, true); assert.equal(configuration.body.data.integrations.mercadopago.accessToken, undefined);
  const store = await Store.findById(seller.store._id).select('+integrations.mercadopago.accessToken'); assert.match(store.integrations.mercadopago.accessToken, /^v1:/); assert.equal(decryptSecret(store.integrations.mercadopago.accessToken), 'TEST-secret-token');
  const rejection = await seller.agent.put(`/api/stores/${seller.store._id}`).set('Origin', 'https://attacker.example').set('X-CSRF-Token', seller.csrfToken).send({ name: 'Intrusión' }); assert.equal(rejection.status, 403);
});

test('secret ciphertext authentication and design validation reject malicious or malformed input', () => {
  const encrypted = encryptSecret('un secreto'); assert.equal(decryptSecret(encrypted), 'un secreto');
  const fields = encrypted.split(':'); fields[2] = '0'.repeat(32); assert.throws(() => decryptSecret(fields.join(':')));
  assert.throws(() => validateDesign({ brand: { primary: 'url(https://attacker.example)' } }));
  assert.throws(() => validateDesign({ shop: { columns: 999 } }));
  assert.throws(() => validateDesign({ checkout: { termsUrl: 'javascript:alert(1)' } }));
});

test('payment configuration rejects a stale editor snapshot and detects concurrent saves', async () => {
  const initial = (await seller.agent.get(`/api/stores/${seller.store._id}`)).body.data;
  const contact = await put(seller, `/api/stores/${seller.store._id}/contact`, { contact: { email: seller.user.email, message: 'Mensaje actualizado', showWhatsapp: false, showContactForm: false } });
  assert.equal(contact.status, 200);
  const stale = await put(seller, `/api/stores/${seller.store._id}/payments`, { payments: [], deliveries: [], expectedUpdatedAt: initial.updatedAt });
  assert.equal(stale.status, 409); assert.equal(stale.body.error.code, 'STORE_CONFLICT');
  const current = (await seller.agent.get(`/api/stores/${seller.store._id}`)).body.data;
  const results = await Promise.all([1, 2].map(i => put(seller, `/api/stores/${seller.store._id}/payments`, { payments: [], deliveries: [{ id: `pickup-${i}`, type: 'pickup', name: `Retiro ${i}`, price: 0, active: true }], expectedUpdatedAt: current.updatedAt })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});


test('entitlements resolve Mongo ObjectId values and enforce the current plan product limit', async () => {
  const entitlement = await EntitlementService.forUser(new mongoose.Types.ObjectId(seller.user._id));
  assert.equal(entitlement.allowed, true);
  const plan = await Plan.create({ name: 'Limitado', price: 100, maxProducts: 1, maxStores: 1 });
  await User.updateOne({ _id: seller.user._id }, { $set: { planId: plan._id, planExpiresAt: new Date(Date.now() + 86400000) } });
  const blocked = await post(seller, `/api/stores/${seller.store._id}/products`, { name: 'Supera el plan', price: 200 });
  assert.equal(blocked.status, 403); assert.equal(blocked.body.error.code, 'PRODUCT_LIMIT');
});
