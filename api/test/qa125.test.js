// Regresiones del informe de QA de la versión 1.25.1. Cada prueba lleva el
// identificador del hallazgo (C1, A1, ...) que corrige.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '34'.repeat(32);
process.env.SESSION_SECRET ||= 'qa125-test-session-secret';
const { config } = await import('../src/config.js');
const { Store, Product, User, Plan, Session, Settings, StoreTransfer, SocialIntegration } = await import('../src/models/index.js');
const { Order, StockMovement, MailJob } = await import('../src/models/commerce.js');
const { CommerceService, CommerceWorker } = await import('../src/services/commerce.js');
const { MercadoPagoService } = await import('../src/services/MercadoPagoService.js');
const { storeTransferService } = await import('../src/services/StoreTransferService.js');
const { ALL_PLAN_FEATURE_KEYS, planFeatureService } = await import('../src/services/PlanFeatureService.js');
const { authService } = await import('../src/services/core.js');
const { legalPageRenderer } = await import('../src/services/LegalPageRenderer.js');
const { clientBuildStatus, clientSourceFingerprint, buildInfoPath } = await import('../src/utils/clientBuild.js');
const { encryptSecret, hashToken, randomToken } = await import('../src/utils/crypto.js');
const { createApp } = await import('../src/app.js');

let mongo, app;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Store.init(), Product.init(), Plan.init(), Order.init(), StockMovement.init(), MailJob.init(), StoreTransfer.init(), SocialIntegration.init()]);
  config.appUrl = 'https://app.qa.test'; config.isProduction = false;
  app = createApp();
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => { await Promise.all([User, Store, Product, Plan, Session, Settings, StoreTransfer, SocialIntegration, Order, StockMovement, MailJob].map(model => model.deleteMany({}))); });

async function plan(overrides = {}) { return Plan.create({ name: 'Completo', price: 100, maxStores: 2, maxProducts: 50, featureKeys: [...ALL_PLAN_FEATURE_KEYS], ...overrides }); }
async function seller({ planDoc, email = `s-${crypto.randomUUID()}@example.test`, expired = false } = {}) {
  return User.create({ role: 'vendedor', email, name: 'Vendedor', active: true, trialStartedAt: new Date(Date.now() - 40 * 86400000), trialEndsAt: new Date(Date.now() - 20 * 86400000), ...(planDoc ? { planId: planDoc._id, planExpiresAt: new Date(Date.now() + (expired ? -30 : 30) * 86400000) } : {}) });
}
async function storeFor(user, extra = {}) {
  return Store.create({ ownerId: user._id, ownerSlot: 0, name: 'Tienda', slug: `qa-${crypto.randomUUID().slice(0, 8)}`, active: true, publicationSlot: 0,
    contact: { email: user.email, phone: '1111', whatsapp: '+5491100000000', showWhatsapp: true },
    payments: [{ id: 'cash', type: 'cash', name: 'Efectivo', deliveryIds: ['pickup'], active: true }, { id: 'transfer', type: 'transfer', name: 'Transferencia', deliveryIds: [], active: true, bank: { holder: 'Dueño A', cbu: '0000003100000000000001', alias: 'duenio.a' } }, { id: 'mp', type: 'mercadopago', name: 'Mercado Pago', deliveryIds: [], active: true, mercadoPagoAccountId: 'mp-a' }],
    deliveries: [{ id: 'pickup', type: 'pickup', name: 'Retiro', price: 0, active: true }],
    integrations: { mercadopago: { accounts: [{ id: 'mp-a', name: 'Cuenta A', accessToken: encryptSecret('APP_USR-owner-a'), webhookSecret: encryptSecret('whsec-a'), sandbox: true }] } }, ...extra });
}
async function agent(user) {
  const token = randomToken(), csrf = randomToken();
  await Session.create({ userId: user._id, tokenHash: hashToken(token), csrfToken: csrf, expiresAt: new Date(Date.now() + 86400000) });
  return (method, url, body) => { const r = request(app)[method](url).set('Cookie', `mt_session=${token}`).set('X-CSRF-Token', csrf); return body === undefined ? r : r.send(body); };
}
const orderInput = (product, extra = {}) => ({ idempotencyKey: crypto.randomUUID().replaceAll('-', ''), customer: { name: 'Comprador', email: 'buyer@example.test', phone: '1122' }, deliveryId: 'pickup', paymentId: 'cash', items: [{ productId: String(product._id), quantity: 1 }], ...extra });

test('C1: editar un producto devuelve 200 y conserva el bloqueo con reservas pendientes', async () => {
  const user = await seller({ planDoc: await plan() }); const store = await storeFor(user); const call = await agent(user);
  const category = await call('post', `/api/stores/${store._id}/categories`, { name: 'Cocina' });
  const related = await call('post', `/api/stores/${store._id}/products`, { name: 'Plato', price: 50 });
  const created = await call('post', `/api/stores/${store._id}/products`, { name: 'Taza', price: 100, categoryId: category.body.data._id, relatedProductIds: [related.body.data._id], variants: [{ id: 'roja', name: 'Roja', stock: 0 }] });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const edited = await call('put', `/api/stores/${store._id}/products/${created.body.data._id}`, { name: 'Taza grande', price: 150 });
  assert.equal(edited.status, 200, JSON.stringify(edited.body)); assert.equal(edited.body.data.name, 'Taza grande'); assert.equal(String(edited.body.data.categoryId), category.body.data._id); assert.equal(String(edited.body.data.relatedProductIds[0]), related.body.data._id); assert.equal(edited.body.data.reservations, undefined);
  await Product.updateOne({ _id: created.body.data._id }, { $push: { reservations: { orderId: new mongoose.Types.ObjectId(), variantId: 'roja', quantity: 1 } }, $inc: { stockVersion: 1 } });
  const blocked = await call('put', `/api/stores/${store._id}/products/${created.body.data._id}`, { variants: [] });
  assert.equal(blocked.status, 409); assert.equal(blocked.body.error.code, 'RESERVATIONS_PENDING');
});

test('A1: aceptar una transferencia quita cobros, banco, contacto e integraciones del dueño anterior', async () => {
  const p = await plan(); const from = await seller({ planDoc: p }); const to = await seller({ planDoc: p });
  const store = await storeFor(from);
  await SocialIntegration.create({ storeId: store._id, provider: 'facebook', accessToken: encryptSecret('meta-token-a'), connectedBy: from._id });
  const transfer = await storeTransferService.create(from, { storeId: store._id, recipientEmail: to.email });
  await storeTransferService.accept(to, transfer._id);
  const saved = await Store.findById(store._id).select('+integrations.mercadopago.accounts.accessToken').lean();
  assert.equal(String(saved.ownerId), String(to._id));
  assert.equal(saved.integrations.mercadopago.accounts.length, 0);
  assert.equal(saved.payments.some(item => item.type === 'mercadopago'), false);
  const bankPayment = saved.payments.find(item => item.type === 'transfer');
  assert.equal(bankPayment.active, false); assert.equal(bankPayment.bank.cbu, '');
  assert.equal(saved.contact.email, to.email); assert.equal(saved.contact.whatsapp, ''); assert.equal(saved.contact.showWhatsapp, false);
  assert.equal(await SocialIntegration.countDocuments({ storeId: store._id }), 0);
});

test('A1: no se puede transferir una tienda con pedidos sin finalizar', async () => {
  const p = await plan(); const from = await seller({ planDoc: p }); const to = await seller({ planDoc: p });
  const store = await storeFor(from); const product = await Product.create({ storeId: store._id, name: 'P', price: 10, stock: 5 });
  await new CommerceService().createOrder(store, orderInput(product));
  await assert.rejects(storeTransferService.create(from, { storeId: store._id, recipientEmail: to.email }), error => error.code === 'TRANSFER_ORDERS_PENDING');
});

test('A2: pedidos MP vencidos que no se pueden verificar no bloquean al resto y se cancelan a las 24 h', async () => {
  const user = await seller({ planDoc: await plan() }); const store = await storeFor(user);
  const product = await Product.create({ storeId: store._id, name: 'P', price: 10, stock: 100 });
  const healthyStore = await storeFor(user, { slug: `qa-ok-${crypto.randomUUID().slice(0, 6)}`, ownerSlot: 1, publicationSlot: 1 });
  const mpFetch = async url => {
    if (String(url).includes('/v1/payments/search')) return new Response(JSON.stringify({ results: [] }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const commerce = new CommerceService({ mercadoPago: new MercadoPagoService({ fetchImpl: mpFetch }) });
  const worker = new CommerceWorker({ commerce });
  const base = { customer: { name: 'C', email: 'c@example.test' }, subtotal: 10, total: 10, payment: { id: 'mp', type: 'mercadopago', name: 'MP', mercadoPagoAccountId: 'cuenta-borrada' }, delivery: { id: 'pickup', type: 'pickup', name: 'Retiro' }, items: [{ productId: product._id, name: 'P', type: 'physical', quantity: 1, unitPrice: 10, lineTotal: 10 }], requestHash: 'x', accessTokenHash: 'x', status: 'awaiting_payment' };
  const broken = await Order.insertMany(Array.from({ length: 10 }, (_, i) => ({ ...base, storeId: store._id, number: `B-${i}`, idempotencyHash: `b${i}`, reservationExpiresAt: new Date(Date.now() - 3600000) })));
  const healthy = await Order.create({ ...base, storeId: healthyStore._id, number: 'OK-1', idempotencyHash: 'ok1', reservationExpiresAt: new Date(Date.now() - 3600000), payment: { ...base.payment, mercadoPagoAccountId: 'mp-a' } });
  await worker.repairOrders(); await worker.repairOrders();
  assert.equal((await Order.findById(healthy._id)).status, 'cancelled', 'el pedido verificable debe procesarse aunque haya 10 con error');
  const failing = await Order.findById(broken[0]._id);
  assert.equal(failing.status, 'awaiting_payment'); assert.ok(failing.providerCheckedAt); assert.match(failing.paymentIssue, /No se pudo verificar/);
  await Order.updateMany({ _id: { $in: broken.map(item => item._id) } }, { $set: { reservationExpiresAt: new Date(Date.now() - 25 * 3600000) }, $unset: { providerCheckedAt: 1 } });
  await worker.repairOrders();
  assert.equal((await Order.findById(broken[0]._id)).status, 'cancelled');
});

test('A3: pedidos sin cuerpo JSON responden 4xx, no 500', async () => {
  const user = await seller({ planDoc: await plan() }); const store = await storeFor(user); const call = await agent(user);
  const product = await Product.create({ storeId: store._id, name: 'P', price: 10, stock: 5 });
  const { order } = await new CommerceService().createOrder(store, orderInput(product));
  const responses = await Promise.all([
    request(app).post(`/api/public/stores/${store.slug}/recommendations`),
    request(app).post(`/api/public/stores/${store.slug}/contact`),
    call('put', `/api/stores/${store._id}/orders/${order._id}/status`),
    call('put', `/api/stores/${store._id}/contact`),
    call('put', `/api/stores/${store._id}/stock`),
  ]);
  assert.equal(responses[0].status, 200, "recomendaciones sin cuerpo devuelven una lista vacía");
  for (const response of responses.slice(1)) assert.ok(response.status >= 400 && response.status < 500, `${response.req.path} → ${response.status}`);
});

test('B1: el seguimiento público no expone el identificador de la cuenta de Mercado Pago', async () => {
  const user = await seller({ planDoc: await plan() }); const store = await storeFor(user);
  const order = await Order.create({ storeId: store._id, number: 'MP-1', customer: { name: 'C', email: 'c@example.test' }, items: [{ productId: new mongoose.Types.ObjectId(), name: 'P', type: 'physical', quantity: 1, unitPrice: 10, lineTotal: 10 }], subtotal: 10, total: 10, payment: { id: 'mp', type: 'mercadopago', name: 'MP', mercadoPagoAccountId: 'mp-a' }, delivery: { id: 'pickup', type: 'pickup', name: 'Retiro' }, status: 'awaiting_payment', idempotencyHash: 'h', requestHash: 'r', accessTokenHash: crypto.createHash('sha256').update('a'.repeat(64)).digest('hex') });
  const response = await request(app).get(`/api/public/orders/${order._id}?token=${'a'.repeat(64)}`);
  assert.equal(response.status, 200); assert.equal(JSON.stringify(response.body).includes('mp-a'), false);
});

test('M1: con el plan vencido se respeta el tope de productos del plan', async () => {
  const p = await plan({ maxProducts: 2 }); const user = await seller({ planDoc: p, expired: true });
  await Settings.create({ key: 'global', subscriptionGraceDays: 0 });
  const store = await storeFor(user); const call = await agent(user);
  const codes = []; for (let i = 0; i < 3; i++) codes.push((await call('post', `/api/stores/${store._id}/products`, { name: `P${i}`, price: 10 })).status);
  assert.deepEqual(codes, [201, 201, 403]);
});

test('M2: una misma IP no puede abrir más de 3 pedidos impagos en efectivo por tienda', async () => {
  const user = await seller({ planDoc: await plan() }); const store = await storeFor(user);
  const product = await Product.create({ storeId: store._id, name: 'P', price: 10, stock: 50 });
  const previous = config.offlineOrdersPerIp; config.offlineOrdersPerIp = 3;
  const statuses = [];
  try { for (let i = 0; i < 4; i++) statuses.push((await request(app).post(`/api/public/stores/${store.slug}/orders`).send(orderInput(product))).status); }
  finally { config.offlineOrdersPerIp = previous; }
  assert.deepEqual(statuses, [201, 201, 201, 429]);
  assert.equal((await Product.findById(product._id)).stock, 47);
});

test('M2: OFFLINE_ORDER_RESERVATION_HOURS cancela pedidos impagos sin comprobante y libera stock', async () => {
  const previous = config.offlineOrderReservationHours; config.offlineOrderReservationHours = 1;
  try {
    const user = await seller({ planDoc: await plan() }); const store = await storeFor(user);
    const product = await Product.create({ storeId: store._id, name: 'P', price: 10, stock: 5 });
    const { order } = await new CommerceService().createOrder(store, orderInput(product), { clientIp: '10.0.0.1' });
    assert.ok(order.reservationExpiresAt);
    await Order.updateOne({ _id: order._id }, { $set: { reservationExpiresAt: new Date(Date.now() - 1000) } });
    await new CommerceWorker().expireOfflineOrders();
    assert.equal((await Order.findById(order._id)).status, 'cancelled'); assert.equal((await Product.findById(product._id)).stock, 5);
  } finally { config.offlineOrderReservationHours = previous; }
});

test('M3: al vencer la prueba sin plan se conserva la gestión de contenido, no la publicación ni integraciones', async () => {
  const user = await seller();
  const keys = await planFeatureService.keysForUser(user);
  assert.ok(keys.includes('management.products') && keys.includes('design.limited'));
  assert.ok(!keys.includes('payments.mercadopago') && !keys.includes('ads.limited') && !keys.includes('domain.custom'));
});

test('M4: los archivos estáticos no se bloquean por un Origin desconocido; la API sí', async () => {
  const asset = fs.readdirSync(path.join(config.projectRoot, 'client/dist/assets')).find(name => name.endsWith('.css'));
  if (asset) assert.equal((await request(app).get(`/assets/${asset}`).set('Origin', 'https://otro.example')).status, 200);
  assert.equal((await request(app).post('/api/auth/magic/request').set('Origin', 'https://otro.example').send({ email: 'x@example.test' })).status, 403);
});

test('C2: el build del cliente se detecta como desactualizado cuando cambia el código fuente', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-client-'));
  try {
    fs.mkdirSync(path.join(directory, 'src')); fs.mkdirSync(path.join(directory, 'dist'));
    fs.writeFileSync(path.join(directory, 'vite.config.js'), 'export default {}');
    fs.writeFileSync(path.join(directory, 'src/main.js'), 'console.log(1)');
    assert.equal(clientBuildStatus(directory).status, 'unknown');
    fs.writeFileSync(buildInfoPath(directory), JSON.stringify({ fingerprint: clientSourceFingerprint(directory), builtAt: 'hoy' }));
    assert.equal(clientBuildStatus(directory).status, 'ok');
    fs.writeFileSync(path.join(directory, 'src/main.js'), 'console.log(2)');
    assert.equal(clientBuildStatus(directory).status, 'stale');
    fs.rmSync(path.join(directory, 'vite.config.js'));
    assert.equal(clientBuildStatus(directory).status, 'no-source');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('B2: webhook firmado sin x-request-id es válido; la página legal tiene ícono y anclas limpias', () => {
  const service = new MercadoPagoService();
  const ts = String(Date.now()); const v1 = crypto.createHmac('sha256', 'secreto').update(`id:123;ts:${ts};`).digest('hex');
  assert.equal(service.verifySignature({ signature: `ts=${ts},v1=${v1}`, dataId: '123' }, 'secreto'), true);
  assert.equal(service.verifySignature({ signature: `ts=${ts},v1=${v1}`, dataId: '124' }, 'secreto'), false);
  const html = legalPageRenderer.render({ kind: 'terms', document: { title: 'T', sections: [{ title: '1. Aceptación', content: 'x' }] } });
  assert.match(html, /rel="icon"/); assert.match(html, /id="1-aceptacion"/);
});

test('B2: el login root tarda lo mismo con un usuario inexistente (compara contra un hash real)', async () => {
  const res = { cookie() {} };
  const started = Date.now();
  await assert.rejects(authService.rootLogin({ username: 'no-existe', password: 'cualquier-clave' }, res), error => error.code === 'INVALID_CREDENTIALS');
  assert.ok(await authService.dummyHash, 'debe generarse un hash bcrypt de referencia');
  assert.match(await authService.dummyHash, /^\$2[aby]\$\d{2}\$/);
  assert.ok(Date.now() - started >= 5);
});

test('la versión distribuida es 1.25.2 y documenta las correcciones del informe de QA', () => {
  for (const file of ['package.json', 'api/package.json', 'client/package.json']) assert.equal(JSON.parse(fs.readFileSync(path.join(config.projectRoot, file), 'utf8')).version, '1.25.2');
  const changes = fs.readFileSync(path.join(config.projectRoot, 'docs/CAMBIOS-1.25.2.md'), 'utf8');
  for (const id of ['C1', 'C2', 'A1', 'A2', 'A3', 'A4', 'A5', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'B1', 'B2']) assert.match(changes, new RegExp(`\\*\\*${id}\\b|\\b${id} ·`));
});

test('N1: el cliente de TikTok conserva el método de intercambio OAuth aunque reciba un token', async () => {
  const { TikTokMarketingClient } = await import('../src/services/TikTokAdsService.js');
  const calls = [];
  const client = new TikTokMarketingClient('TOKEN', { fetchImpl: async (url, init) => { calls.push({ url: String(url), headers: init.headers }); return new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 }); }, baseUrl: 'https://tiktok.test' });
  assert.equal(typeof client.accessToken, 'function');
  await client.accessToken('AUTH_CODE'); await client.identities('7001');
  assert.equal(calls[0].headers['Access-Token'], undefined, 'el intercambio OAuth no envía token');
  assert.equal(calls[1].headers['Access-Token'], 'TOKEN');
});
