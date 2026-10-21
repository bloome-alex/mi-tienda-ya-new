import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '12'.repeat(32);
process.env.SESSION_SECRET ||= 'commerce-test-session-secret';
const { config } = await import('../src/config.js');
const { Store, Product, User, Plan, Category, AuditLog, Session } = await import('../src/models/index.js');
const { Order, StockMovement, MailJob } = await import('../src/models/commerce.js');
const { CommerceService, InventoryService, CatalogService, CommerceWorker, safeOrder, safeProduct, safePublicStore, ReceiptService } = await import('../src/services/commerce.js');
const { MercadoPagoService } = await import('../src/services/MercadoPagoService.js');
const { encryptSecret } = await import('../src/utils/crypto.js');
const { createApp } = await import('../src/app.js');

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create();
  config.uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mi-tienda-commerce-test-'));
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Store.init(), Product.init(), Order.init(), StockMovement.init(), MailJob.init()]);
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); await fs.rm(config.uploadDir, { recursive: true, force: true }); });
beforeEach(async () => {
  await Promise.all([User, Store, Product, Plan, Category, AuditLog, Order, StockMovement, MailJob, Session].map(model => model.deleteMany({})));
});

async function fixture({ stock = 10, type = 'physical', variants = [], madeToOrder = false } = {}) {
  const user = await User.create({ role: 'vendedor', email: `seller-${crypto.randomUUID()}@example.com`, name: 'Vendedor', trialEndsAt: new Date(Date.now() + 86400000), active: true });
  const store = await Store.create({ ownerId: user._id, name: 'Tienda de prueba', slug: `prueba-${crypto.randomUUID().slice(0, 8)}`, active: true,
    payments: [{ id: 'cash', type: 'cash', name: 'Efectivo', deliveryIds: ['pickup'], active: true }, { id: 'transfer', type: 'transfer', name: 'Transferencia', deliveryIds: ['pickup', 'digital'], active: true, bank: { alias: 'tienda.alias', holder: 'Vendedor' } }, { id: 'mp', type: 'mercadopago', name: 'Mercado Pago', active: true }],
    deliveries: [{ id: 'pickup', type: 'pickup', name: 'Retiro', price: 0, active: true }, { id: 'shipping', type: 'shipping', name: 'Envío', price: 1500, active: true }, { id: 'digital', type: 'digital', name: 'Correo', price: 0, active: true }],
    integrations: { mercadopago: { accessToken: encryptSecret('private-token'), webhookSecret: encryptSecret('private-webhook-secret'), sandbox: true } },
  });
  const product = await Product.create({ storeId: store._id, name: 'Producto A', price: 123.45, type, stock, variants, madeToOrder, active: true, ...(type === 'digital' ? { digitalUrl: 'https://private.example.com/my-paid-digital-file' } : {}) });
  const input = { customer: { name: 'Comprador', email: 'buyer@example.com', phone: '1122334455' }, items: [{ productId: String(product._id), quantity: 1 }], deliveryId: type === 'digital' ? 'digital' : 'pickup', paymentId: type === 'digital' ? 'transfer' : 'cash', idempotencyKey: crypto.randomUUID() };
  return { user, store, product, input };
}

test('dos compras concurrentes no venden más stock del disponible', async () => {
  const { store, product, input } = await fixture({ stock: 5 });
  const service = new CommerceService();
  const results = await Promise.allSettled([
    service.createOrder(store, { ...input, items: [{ productId: String(product._id), quantity: 4 }] }),
    service.createOrder(store, { ...input, items: [{ productId: String(product._id), quantity: 4 }], idempotencyKey: crypto.randomUUID() }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'INSUFFICIENT_STOCK').length, 1);
  const current = await Product.findById(product._id);
  assert.equal(current.stock, 1);
  assert.equal(current.reservations.length, 1);
});

test('si falla el proveedor después de reservar, se compensa el stock una sola vez', async () => {
  const { store, product, input } = await fixture({ stock: 8 });
  const service = new CommerceService({ mercadoPago: { credentials() {}, async createPreference() { throw new Error('Provider test failure'); } } });
  await assert.rejects(service.createOrder(store, { ...input, paymentId: 'mp', items: [{ productId: String(product._id), quantity: 3 }] }));
  const cancelled = await Order.findOne({ storeId: store._id });
  assert.equal(cancelled.status, 'cancelled');
  await service.finalize(cancelled);
  await service.finalize(cancelled);
  const current = await Product.findById(product._id);
  assert.equal(current.stock, 8);
  assert.equal(current.reservations.length, 0);
  assert.equal(await StockMovement.countDocuments({ orderId: cancelled._id, kind: 'release' }), 1);
});

test('idempotencia devuelve el mismo pedido y evita repetir descuentos o cambiar sus datos', async () => {
  const { store, product, input } = await fixture();
  const service = new CommerceService();
  const first = await service.createOrder(store, input);
  const again = await service.createOrder(store, input);
  assert.equal(String(again.order._id), String(first.order._id));
  assert.equal(again.accessToken, first.accessToken);
  assert.equal((await Product.findById(product._id)).stock, 9);
  await assert.rejects(service.createOrder(store, { ...input, customer: { ...input.customer, name: 'Otro nombre' } }), e => e.code === 'IDEMPOTENCY_CONFLICT');
  assert.equal(await Order.countDocuments({}), 1);
});

test('los precios y la compatibilidad pago-entrega se determinan en el servidor', async () => {
  const { store, product, input } = await fixture();
  const service = new CommerceService();
  const result = await service.createOrder(store, { ...input, subtotal: 0, total: 0, items: [{ productId: String(product._id), quantity: 2, price: 0.01 }] });
  assert.equal(result.order.total, 246.9);
  await assert.rejects(service.createOrder(store, { ...input, idempotencyKey: crypto.randomUUID(), deliveryId: 'shipping', customer: { ...input.customer, address: 'Calle 123' } }), e => e.code === 'PAYMENT_DELIVERY_MISMATCH');
  await assert.rejects(service.createOrder(store, { ...input, idempotencyKey: crypto.randomUUID(), deliveryId: 'digital', paymentId: 'transfer' }), /físicos/);
});

test('variantes reservan y devuelven únicamente su propia cantidad', async () => {
  const { store, product, input } = await fixture({ variants: [{ id: 'red-m', name: 'Rojo M', stock: 4 }, { id: 'blue-l', name: 'Azul L', stock: 7, price: 200 }] });
  const service = new CommerceService();
  const result = await service.createOrder(store, { ...input, items: [{ productId: String(product._id), variantId: 'blue-l', quantity: 3 }] });
  assert.equal(result.order.total, 600);
  let current = await Product.findById(product._id);
  assert.equal(current.variants.find(v => v.id === 'blue-l').stock, 4);
  assert.equal(current.variants.find(v => v.id === 'red-m').stock, 4);
  await service.changeStatus(store._id, String(result.order._id), { status: 'cancelled', confirmFinal: true });
  current = await Product.findById(product._id);
  assert.equal(current.variants.find(v => v.id === 'blue-l').stock, 7);
  assert.equal(current.reservations.length, 0);
});

test('los estados finales requieren confirmación y no se pueden reabrir', async () => {
  const { store, input, product } = await fixture();
  const service = new CommerceService();
  const { order } = await service.createOrder(store, input);
  await assert.rejects(service.changeStatus(store._id, String(order._id), { status: 'paid' }), e => e.code === 'CONFIRM_FINAL_REQUIRED');
  await service.changeStatus(store._id, String(order._id), { status: 'paid', confirmFinal: true });
  await assert.rejects(service.changeStatus(store._id, String(order._id), { status: 'cancelled', confirmFinal: true }), e => e.code === 'FINAL_ORDER');
  assert.equal((await Product.findById(product._id)).stock, 9);
  assert.equal((await Product.findById(product._id)).reservations.length, 0);
});

test('asignaciones de stock detectan ventas concurrentes sin pisarlas', async () => {
  const { store, product, input, user } = await fixture();
  const service = new CommerceService();
  await service.createOrder(store, { ...input, items: [{ productId: String(product._id), quantity: 3 }] });
  const inventory = new InventoryService();
  const conflict = await inventory.setStock(store._id, { reason: 'Conteo de depósito', items: [{ productId: String(product._id), stock: 25, expectedStock: 10 }] }, user._id);
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(conflict.conflicts[0].currentStock, 7);
  assert.equal((await Product.findById(product._id)).stock, 7);
  const success = await inventory.setStock(store._id, { reason: 'Conteo confirmado', items: [{ productId: String(product._id), stock: 25, expectedStock: 7 }] }, user._id);
  assert.equal(success.updated.length, 1);
  assert.equal((await Product.findById(product._id)).stock, 25);
});

test('ningún endpoint de catálogo o pedido público expone enlaces digitales ni credenciales', async () => {
  const { store, product, input } = await fixture({ type: 'digital' });
  const catalog = new CatalogService();
  const service = new CommerceService();
  const payload = await catalog.catalog(store.slug);
  const result = await service.createOrder(store, input);
  const detail = await catalog.product(store.slug, String(product._id));
  const publiclyVisible = JSON.stringify({ payload, detail, order: result.order, raw: safeProduct(product), store: safePublicStore(store) });
  assert.equal(publiclyVisible.includes('private.example.com'), false);
  assert.equal(publiclyVisible.includes('private-token'), false);
  assert.equal(publiclyVisible.includes('webhookSecret'), false);
  assert.equal(publiclyVisible.includes('digitalUrl'), false);
  await assert.rejects(service.publicOrder(String(result.order._id), 'a'.repeat(64)), e => e.code === 'ORDER_NOT_FOUND');
  assert.equal(String((await service.publicOrder(String(result.order._id), result.accessToken))._id), String(result.order._id));
});

test('la entrega digital sólo se envía tras pago confirmado y no se duplica en reintentos normales', async () => {
  const { store, input } = await fixture({ type: 'digital' });
  const service = new CommerceService();
  const sent = [];
  const worker = new CommerceWorker({ commerce: service, mail: { async send(message) { sent.push(message); } } });
  const { order } = await service.createOrder(store, input);
  await worker.processMail();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text.includes('private.example.com'), false);
  await service.changeStatus(store._id, String(order._id), { status: 'paid', confirmFinal: true });
  await worker.processMail();
  await service.changeStatus(store._id, String(order._id), { status: 'paid', confirmFinal: true });
  await worker.processMail();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].text.includes('private.example.com'), true);
  const current = await Order.findById(order._id);
  assert.equal(current.digitalDeliveryStatus, 'sent');
  assert.equal(JSON.stringify(safeOrder(current, { publicView: true })).includes('private.example.com'), false);
  assert.equal(await MailJob.countDocuments({ kind: 'digital' }), 1);
});

test('el proveedor debe coincidir en tienda, pedido, monto y moneda para acreditar', async () => {
  const { store, input } = await fixture();
  const service = new CommerceService({ mercadoPago: { credentials() {}, async createPreference() { return { preferenceId: 'pref-1', collectorId: '42', checkoutUrl: 'https://www.mercadopago.com.ar/checkout/mock' }; } } });
  const result = await service.createOrder(store, { ...input, paymentId: 'mp' });
  const order = await Order.findById(result.order._id);
  const payment = { id: '5678', external_reference: String(order._id), metadata: { store_id: String(store._id), order_id: String(order._id) }, collector_id: 42, status: 'approved', currency_id: 'ARS', transaction_amount: order.total };
  await assert.rejects(service.reconcilePayment(store, order, { ...payment, transaction_amount: 1 }), e => e.code === 'PAYMENT_AMOUNT_MISMATCH');
  assert.notEqual((await Order.findById(order._id)).status, 'paid');
  await assert.rejects(service.reconcilePayment(store, order, { ...payment, metadata: { ...payment.metadata, store_id: String(new mongoose.Types.ObjectId()) } }), e => e.code === 'PAYMENT_MISMATCH');
  await assert.rejects(service.changeStatus(store._id, String(order._id), { status: 'paid', confirmFinal: true }), e => e.code === 'PAYMENT_VERIFICATION_REQUIRED');
  await service.reconcilePayment(store, order, payment);
  assert.equal((await Order.findById(order._id)).status, 'paid');
});

test('firma webhook sólo acepta el manifiesto HMAC con los parámetros correctos', () => {
  const mp = new MercadoPagoService();
  const secret = 'test-secret';
  const manifest = 'id:123456;request-id:request-123;ts:1742505638683;';
  const signature = `ts=1742505638683,v1=${crypto.createHmac('sha256', secret).update(manifest).digest('hex')}`;
  assert.equal(mp.verifySignature({ signature, requestId: 'request-123', dataId: '123456' }, secret), true);
  assert.equal(mp.verifySignature({ signature, requestId: 'request-123', dataId: '123457' }, secret), false);
  assert.equal(mp.verifySignature({ signature, requestId: 'request-123', dataId: '123456' }, 'wrong-secret'), false);
  assert.equal(mp.verifySignature({ signature: 'ts=no,v1=bad', requestId: 'request-123', dataId: '123456' }, secret), false);
});

test('plan vencido oculta tienda pública pero no elimina productos', async () => {
  const { user, store } = await fixture();
  await User.updateOne({ _id: user._id }, { $set: { trialEndsAt: new Date(Date.now() - 1000) } });
  await assert.rejects(new CatalogService().catalog(store.slug), e => e.code === 'STORE_UNAVAILABLE');
  assert.equal(await Product.countDocuments({ storeId: store._id }), 1);
});

test('la API exige teléfono también para digitales si el diseño lo requiere', async () => {
  const { store, input } = await fixture({ type: 'digital' });
  store.design = { checkout: { requirePhone: true } };
  await store.save();
  const service = new CommerceService();
  await assert.rejects(service.createOrder(store, { ...input, customer: { ...input.customer, phone: '' } }), /teléfono/);
  assert.equal(await Order.countDocuments({ storeId: store._id }), 0);
  const result = await service.createOrder(store, input);
  assert.equal(result.order.customer.phone, input.customer.phone);
});

test('reducir maxStores bloquea catálogo y checkout excedentes conservando el contenido', async () => {
  const first = await fixture();
  const plan = await Plan.create({ name: 'Dos tiendas', price: 1000, maxStores: 2 });
  await User.updateOne({ _id: first.user._id }, { $set: { planId: plan._id, planExpiresAt: new Date(Date.now() + 86400000) } });
  const second = await Store.create({ ownerId: first.user._id, name: 'Segunda tienda', slug: `segunda-${crypto.randomUUID().slice(0, 8)}`, active: true, payments: first.store.payments, deliveries: first.store.deliveries });
  const product = await Product.create({ storeId: second._id, name: 'Producto de segunda tienda', price: 50, stock: 8 });
  const service = new CatalogService();
  await service.catalog(first.store.slug);
  await service.catalog(second.slug);
  // Simula una edición del plan que todavía no ejecutó la reconciliación.
  await Plan.updateOne({ _id: plan._id }, { $set: { maxStores: 1 } });
  await service.catalog(first.store.slug);
  await assert.rejects(service.catalog(second.slug), e => e.code === 'STORE_UNAVAILABLE');
  await assert.rejects(new CommerceService().createOrder(second, { ...first.input, items: [{ productId: String(product._id), quantity: 1 }] }), e => e.code === 'STORE_UNAVAILABLE');
  assert.equal(await Product.countDocuments({ storeId: second._id }), 1);
  assert.equal((await Store.findById(second._id)).active, true);
  assert.equal(await Order.countDocuments({ storeId: second._id }), 0);
});

test('vencer un plan múltiple y volver a prueba sólo mantiene disponible una tienda', async () => {
  const first = await fixture();
  const plan = await Plan.create({ name: 'Múltiple vencido', price: 1000, maxStores: 3 });
  await User.updateOne({ _id: first.user._id }, { $set: { planId: plan._id, planExpiresAt: new Date(Date.now() - 1000), trialEndsAt: new Date(Date.now() + 86400000) } });
  const second = await Store.create({ ownerId: first.user._id, name: 'Otra tienda', slug: `otra-${crypto.randomUUID().slice(0, 8)}`, active: true });
  const service = new CatalogService();
  await service.catalog(first.store.slug);
  await assert.rejects(service.catalog(second.slug), e => e.code === 'STORE_UNAVAILABLE');
});

test('no se pueden comprar ni consultar productos de otra tienda', async () => {
  const first = await fixture(), second = await fixture();
  await assert.rejects(new CommerceService().createOrder(first.store, { ...first.input, items: [{ productId: String(second.product._id), quantity: 1 }] }), e => e.code === 'PRODUCT_UNAVAILABLE');
  await assert.rejects(new CatalogService().product(first.store.slug, String(second.product._id)), e => e.code === 'PRODUCT_NOT_FOUND');
});

test('un pago aprobado después de cancelar requiere revisión y no vuelve a vender stock', async () => {
  const { store, input, product } = await fixture();
  const service = new CommerceService({ mercadoPago: { credentials() {}, async createPreference() { return { preferenceId: 'pref-2', collectorId: '42', checkoutUrl: 'https://www.mercadopago.com.ar/checkout/mock' }; } } });
  const { order } = await service.createOrder(store, { ...input, paymentId: 'mp' });
  await service.changeStatus(store._id, String(order._id), { status: 'cancelled', confirmFinal: true });
  const cancelled = await Order.findById(order._id);
  await service.reconcilePayment(store, cancelled, { id: '99887', external_reference: String(order._id), metadata: { store_id: String(store._id), order_id: String(order._id) }, collector_id: 42, status: 'approved', currency_id: 'ARS', transaction_amount: order.total });
  const final = await Order.findById(order._id);
  assert.equal(final.status, 'cancelled');
  assert.match(final.paymentIssue, /después de cancelar/);
  assert.equal((await Product.findById(product._id)).stock, 10);
  assert.equal(await MailJob.countDocuments({ orderId: order._id, kind: 'digital' }), 0);
});

test('comprobantes validan contenido real, se guardan privados y requieren acceso a la tienda', async () => {
  const first = await fixture(), other = await fixture();
  const service = new CommerceService();
  const { order, accessToken } = await service.createOrder(first.store, { ...first.input, paymentId: 'transfer' });
  const objects = new Map();
  const storage = { assertConfigured() {}, objectKey({storeId,kind,extension}) { return `test/${storeId}/${kind}/receipt.${extension}`; }, async put(key, body, options) { objects.set(key, { body: Buffer.from(body), contentType: options.contentType }); }, async get(key) { const value=objects.get(key); if(!value) throw new Error('missing'); return value; }, async delete(key) { objects.delete(key); } };
  const receipt = new ReceiptService({ storage, cleanup: { async schedule() {} } });
  await assert.rejects(receipt.store(await Order.findById(order._id), { buffer: Buffer.from('<svg onload="alert(1)"></svg>'), mimetype: 'image/png' }), /válido/);
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const uploaded = await receipt.store(await Order.findById(order._id), { buffer: png, mimetype: 'application/octet-stream' });
  assert.equal(uploaded.receipt.mimeType, 'image/jpeg');
  assert.equal('path' in uploaded.receipt, false);
  const file = await receipt.file(first.store._id, String(order._id));
  assert.equal(file.body.length > 0, true);
  await assert.rejects(receipt.file(other.store._id, String(order._id)), e => e.status === 404);
  const app = createApp();
  const token = crypto.randomBytes(32).toString('hex');
  await Session.create({ userId: other.user._id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), csrfToken: crypto.randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 60000) });
  const forbidden = await request(app).get(`/api/stores/${first.store._id}/orders/${order._id}/receipt`).set('Cookie', `mt_session=${token}`);
  assert.equal(forbidden.status, 404);
  const publicView = await request(app).get(`/api/public/orders/${order._id}?token=${accessToken}`);
  assert.equal(publicView.status, 200);
  assert.equal(JSON.stringify(publicView.body).includes('objectKey'), false);
  const staticLeak = await request(app).get('/uploads/receipts/receipt-test.pdf');
  assert.notEqual(staticLeak.status, 200);
});
