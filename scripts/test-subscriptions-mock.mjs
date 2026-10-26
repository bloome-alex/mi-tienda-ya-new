import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.APP_URL ||= 'http://localhost:5000';
process.env.ENCRYPTION_KEY ||= '11'.repeat(32);
process.env.SESSION_SECRET ||= 'mock-session-secret';

class MockMercadoPagoServer {
  constructor() { this.server = null; this.url = ''; this.reset(); }
  reset() {
    this.subscriptions = new Map();
    this.invoices = new Map();
    this.idempotency = new Map();
    this.requests = [];
    this.sequence = 0;
    this.dropAfterCommitOnce = false;
    this.dropUpdateAfterCommitOnce = false;
    this.failAuthorizedSearchOnce = false;
    this.rejectAuthorizationOnce = false;
  }
  async start() {
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise(resolve => this.server.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    this.url = `http://127.0.0.1:${address.port}`;
  }
  async stop() { if (this.server) await new Promise(resolve => this.server.close(resolve)); }
  json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
  async body(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  externalStatus(id, status) {
    const item = this.subscriptions.get(id); assert.ok(item, `mock subscription ${id} must exist`);
    item.status = status; item.last_modified = new Date().toISOString();
  }
  seedSubscription({ externalReference, payerEmail, status = 'pending' }) {
    const id = `preapproval_${++this.sequence}`;
    const item = {
      id, status, init_point: `https://mock.mercadopago.test/checkout/${id}`, payer_id: null, payment_method_id: null,
      next_payment_date: new Date(Date.now() + 86400000).toISOString(), external_reference: externalReference, payer_email: payerEmail, reason: 'Seeded after process crash',
    };
    this.subscriptions.set(id, item); return item;
  }
  addInvoice(subscriptionId, { id, status, paymentId = '', when = new Date(), amount = 5500, statusDetail = '' } = {}) {
    const invoiceId = id || `invoice_${this.invoices.size + 1}`;
    const iso = new Date(when).toISOString();
    const item = {
      id: invoiceId, preapproval_id: subscriptionId, status: status === 'approved' ? 'processed' : status === 'rejected' ? 'recycling' : status,
      summarized: status === 'rejected' ? 'recycling' : status, transaction_amount: amount, currency_id: 'ARS', debit_date: iso, date_created: iso, last_modified: iso,
      payment: { id: paymentId || (status === 'approved' ? `payment_${invoiceId}` : `payment_${invoiceId}_${status}`), status, status_detail: statusDetail },
    };
    this.invoices.set(invoiceId, item); return item;
  }
  async handle(req, res) {
    const url = new URL(req.url, 'http://mock.local');
    const body = ['POST', 'PUT'].includes(req.method) ? await this.body(req).catch(() => ({})) : {};
    this.requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, headers: req.headers });
    if (this.rejectAuthorizationOnce) { this.rejectAuthorizationOnce = false; return this.json(res, 401, { message: 'mock credential rejected' }); }
    if (req.headers.authorization !== 'Bearer TEST_MP_TOKEN') return this.json(res, 401, { message: 'unauthorized' });

    if (req.method === 'POST' && url.pathname === '/preapproval') {
      const key = String(req.headers['x-idempotency-key'] || '');
      if (!key) return this.json(res, 400, { message: 'missing idempotency key' });
      let item = this.idempotency.get(key);
      if (!item) {
        const id = `preapproval_${++this.sequence}`;
        item = {
          id, status: 'pending', init_point: `https://mock.mercadopago.test/checkout/${id}`, payer_id: null, payment_method_id: null,
          next_payment_date: new Date(Date.now() + 86400000).toISOString(), external_reference: body.external_reference, payer_email: body.payer_email, reason: body.reason,
        };
        this.idempotency.set(key, item); this.subscriptions.set(id, item);
      }
      if (this.dropAfterCommitOnce) { this.dropAfterCommitOnce = false; req.socket.destroy(); return; }
      return this.json(res, 201, item);
    }

    if (req.method === 'GET' && url.pathname === '/preapproval/search') {
      const payerEmail = String(url.searchParams.get('payer_email') || '').toLowerCase();
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)));
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
      const rows = [...this.subscriptions.values()].filter(item => !payerEmail || String(item.payer_email || '').toLowerCase() === payerEmail);
      return this.json(res, 200, { paging: { total: rows.length, limit, offset }, results: rows.slice(offset, offset + limit) });
    }

    const preapprovalMatch = url.pathname.match(/^\/preapproval\/([^/]+)$/);
    if (preapprovalMatch) {
      const id = decodeURIComponent(preapprovalMatch[1]); const item = this.subscriptions.get(id);
      if (!item) return this.json(res, 404, { message: 'not found' });
      if (req.method === 'GET') return this.json(res, 200, item);
      if (req.method === 'PUT') {
        if (body.status) item.status = body.status;
        item.last_modified = new Date().toISOString();
        if (this.dropUpdateAfterCommitOnce) { this.dropUpdateAfterCommitOnce = false; req.socket.destroy(); return; }
        return this.json(res, 200, item);
      }
    }

    if (req.method === 'GET' && url.pathname === '/authorized_payments/search') {
      if (this.failAuthorizedSearchOnce) { this.failAuthorizedSearchOnce = false; return this.json(res, 500, { message: 'temporary failure' }); }
      const subscriptionId = url.searchParams.get('preapproval_id'); const paymentId = url.searchParams.get('payment_id');
      return this.json(res, 200, { results: [...this.invoices.values()].filter(item => subscriptionId ? item.preapproval_id === subscriptionId : paymentId ? String(item.payment?.id || '') === paymentId : false) });
    }
    const invoiceMatch = url.pathname.match(/^\/authorized_payments\/([^/]+)$/);
    if (req.method === 'GET' && invoiceMatch) {
      const item = this.invoices.get(decodeURIComponent(invoiceMatch[1]));
      return item ? this.json(res, 200, item) : this.json(res, 404, { message: 'not found' });
    }
    return this.json(res, 404, { message: 'unhandled mock route', path: url.pathname });
  }
}

const WEBHOOK_SECRET = 'mock-webhook-secret';
const signWebhook = ({ dataId, requestId = 'request-123', ts = String(Math.floor(Date.now() / 1000)) }) => {
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
  return { signature: `ts=${ts},v1=${signature}`, requestId };
};
const webhookRequest = ({ type, dataId, valid = true }) => {
  const signed = signWebhook({ dataId });
  return {
    body: { type, data: { id: dataId } }, query: {},
    get(name) {
      if (name.toLowerCase() === 'x-signature') return valid ? signed.signature : 'ts=1700000000,v1=' + '0'.repeat(64);
      if (name.toLowerCase() === 'x-request-id') return signed.requestId;
      return undefined;
    },
  };
};

let mongod;
let mock;
let models;
let SubscriptionService;
let PlatformMercadoPagoService;
let service;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('mitiendaya_subscription_mock'));
  models = await import('../api/src/models/index.js');
  ({ SubscriptionService, PlatformMercadoPagoService } = await import('../api/src/services/SubscriptionService.js'));
  mock = new MockMercadoPagoServer(); await mock.start();
  const provider = new PlatformMercadoPagoService({
    baseUrl: mock.url,
    timeoutMs: 2000,
    credentialsResolver: async () => ({ accessToken: 'TEST_MP_TOKEN', webhookSecret: WEBHOOK_SECRET, sandbox: true, settings: { platformBilling: { enabled: true } } }),
  });
  service = new SubscriptionService({ provider });
});

after(async () => { service?.stopPendingWorker(); await mongoose.disconnect(); await mongod?.stop(); await mock?.stop(); });

beforeEach(async () => {
  mock.reset();
  await Promise.all([
    models.SubscriptionSupportRequest.deleteMany({}), models.SubscriptionCharge.deleteMany({}), models.Subscription.deleteMany({}),
    models.Store.deleteMany({}), models.User.deleteMany({}), models.Plan.deleteMany({}), models.Settings.deleteMany({}),
  ]);
  await models.Settings.create({ key: 'global', subscriptionGraceDays: 7, subscriptionPendingLinkHours: 24 });
});

async function fixture() {
  const plan = await models.Plan.create({ name: 'Mock Pro', price: 5500, durationDays: 30, maxStores: 2, maxProducts: 500, active: true, visible: true });
  const user = await models.User.create({ role: 'vendedor', name: 'Tester', email: `tester-${crypto.randomUUID()}@example.com`, active: true });
  return { plan, user };
}
async function createAndAuthorize(user, plan) {
  const checkout = await service.createCheckout(user, plan._id, { payerEmail: user.email });
  mock.externalStatus(checkout.subscription.providerSubscriptionId, 'authorized');
  await service.webhook(webhookRequest({ type: 'subscription_preapproval', dataId: checkout.subscription.providerSubscriptionId }));
  return models.Subscription.findById(checkout.subscription._id);
}

test('alta positiva: checkout -> autorización -> cobro aprobado; webhook duplicado no duplica días', async () => {
  const { user, plan } = await fixture();
  let subscription = await createAndAuthorize(user, plan);
  assert.equal(subscription.status, 'authorized');
  const invoice = mock.addInvoice(subscription.providerSubscriptionId, { id: 'invoice_ok', status: 'approved', paymentId: 'payment_ok' });
  await service.webhook(webhookRequest({ type: 'subscription_authorized_payment', dataId: invoice.id }));
  const once = await models.User.findById(user._id); const firstExpiry = once.planExpiresAt.getTime();
  assert.equal(String(once.planId), String(plan._id));
  await service.webhook(webhookRequest({ type: 'subscription_authorized_payment', dataId: invoice.id }));
  const twice = await models.User.findById(user._id);
  assert.equal(twice.planExpiresAt.getTime(), firstExpiry, 'el webhook repetido no debe sumar otro período');
  assert.equal(await models.SubscriptionCharge.countDocuments({ providerAuthorizedPaymentId: invoice.id }), 1);
});

test('alta ambigua: si se pierde la respuesta, reconcilia por external_reference y no crea otra preapproval', async () => {
  const { user, plan } = await fixture(); mock.dropAfterCommitOnce = true;
  const result = await service.createCheckout(user, plan._id, { payerEmail: user.email });
  const local = await models.Subscription.findOne({ userId: user._id, current: true });
  assert.ok(local.checkoutAttemptId); assert.ok(local.providerSubscriptionId); assert.equal(local.lastSyncError, '');
  assert.equal(mock.subscriptions.size, 1, 'Mercado Pago mock debe tener una sola suscripción');
  assert.equal(result.subscription.providerSubscriptionId, [...mock.subscriptions.keys()][0]);
  const createRequests = mock.requests.filter(item => item.method === 'POST' && item.path === '/preapproval');
  assert.equal(createRequests.length, 1);
  assert.match(createRequests[0].body.external_reference, new RegExp(local.checkoutAttemptId));
  assert.ok(mock.requests.some(item => item.method === 'GET' && item.path === '/preapproval/search'));
});

test('reinicio después de commit remoto: recupera un preapproval sin ID local antes de volver a hacer POST', async () => {
  const { user, plan } = await fixture(); const attemptId = crypto.randomUUID();
  const local = await models.Subscription.create({
    userId: user._id, planId: plan._id, checkoutAttemptId: attemptId, current: true, status: 'pending', providerStatus: 'pending', payerEmail: user.email,
    planSnapshot: { name: plan.name, price: plan.price, durationDays: plan.durationDays, maxStores: plan.maxStores, maxProducts: plan.maxProducts }, pendingExpiresAt: new Date(Date.now() + 86400000), checkoutRequestStartedAt: new Date(),
  });
  const externalReference = service.checkoutReference(local);
  const remote = mock.seedSubscription({ externalReference, payerEmail: user.email });
  const result = await service.createCheckout(user, plan._id, { payerEmail: user.email });
  assert.equal(result.subscription.providerSubscriptionId, remote.id);
  assert.equal(mock.requests.filter(item => item.method === 'POST' && item.path === '/preapproval').length, 0);
  assert.ok(mock.requests.some(item => item.method === 'GET' && item.path === '/preapproval/search'));
});

test('intento enviado pero no reconciliable no repite el POST: exige cancelar antes de crear otro', async () => {
  const { user, plan } = await fixture();
  await models.Subscription.create({
    userId: user._id, planId: plan._id, checkoutAttemptId: crypto.randomUUID(), checkoutRequestStartedAt: new Date(), current: true, status: 'pending', providerStatus: 'pending', payerEmail: user.email,
    planSnapshot: { name: plan.name, price: plan.price, durationDays: plan.durationDays, maxStores: plan.maxStores, maxProducts: plan.maxProducts }, pendingExpiresAt: new Date(Date.now() + 86400000),
  });
  await assert.rejects(() => service.createCheckout(user, plan._id, { payerEmail: user.email }), error => error.code === 'SUBSCRIPTION_CHECKOUT_UNCERTAIN');
  assert.equal(mock.requests.filter(item => item.method === 'POST' && item.path === '/preapproval').length, 0, 'no debe crear una segunda autorización mientras el intento anterior sea incierto');
  await service.cancelPendingForUser(user._id);
  const replacement = await service.createCheckout(user, plan._id, { payerEmail: user.email });
  assert.ok(replacement.subscription.providerSubscriptionId); assert.equal(mock.subscriptions.size, 1);
});

test('seguridad: webhook con firma inválida es rechazado y no altera la suscripción', async () => {
  const { user, plan } = await fixture(); const checkout = await service.createCheckout(user, plan._id);
  mock.externalStatus(checkout.subscription.providerSubscriptionId, 'authorized');
  await assert.rejects(() => service.webhook(webhookRequest({ type: 'subscription_preapproval', dataId: checkout.subscription.providerSubscriptionId, valid: false })), error => error.code === 'INVALID_WEBHOOK_SIGNATURE' && error.status === 401);
  const stored = await models.Subscription.findById(checkout.subscription._id); assert.equal(stored.status, 'pending');
});

test('credenciales rechazadas por Mercado Pago se informan y el intento queda auditable para reintento', async () => {
  const { user, plan } = await fixture(); mock.rejectAuthorizationOnce = true;
  await assert.rejects(() => service.createCheckout(user, plan._id), error => error.code === 'SUBSCRIPTION_CREDENTIALS_INVALID');
  const stored = await models.Subscription.findOne({ userId: user._id, current: true });
  assert.equal(stored.status, 'pending'); assert.equal(stored.providerSubscriptionId, undefined); assert.match(stored.lastSyncError, /SUBSCRIPTION_CREDENTIALS_INVALID/);
});

test('cobro rechazado/recycling: muestra incidente y un reintento aprobado recupera sin doble cobro', async () => {
  const { user, plan } = await fixture(); const subscription = await createAndAuthorize(user, plan);
  const failedAt = new Date(Date.now() - 60000);
  const invoice = mock.addInvoice(subscription.providerSubscriptionId, { id: 'invoice_retry', status: 'rejected', paymentId: 'payment_rejected', when: failedAt, statusDetail: 'cc_rejected_insufficient_amount' });
  await service.webhook(webhookRequest({ type: 'subscription_authorized_payment', dataId: invoice.id }));
  let current = await models.Subscription.findById(subscription._id); assert.equal(current.status, 'payment_failed');
  let summary = await service.summaryForUser(await models.User.findById(user._id), { subscription: current });
  assert.equal(summary.issue?.code, 'payment_failed'); assert.equal(summary.issue?.canCut, true);

  invoice.payment = { id: 'payment_retry_ok', status: 'approved', status_detail: 'accredited' }; invoice.summarized = 'processed'; invoice.status = 'processed'; invoice.last_modified = new Date().toISOString();
  await service.webhook(webhookRequest({ type: 'subscription_authorized_payment', dataId: invoice.id }));
  current = await models.Subscription.findById(subscription._id); assert.equal(current.status, 'authorized'); assert.equal(current.lastPaymentStatus, 'approved');
  const expiry = (await models.User.findById(user._id)).planExpiresAt.getTime();
  await service.webhook(webhookRequest({ type: 'subscription_authorized_payment', dataId: invoice.id }));
  assert.equal((await models.User.findById(user._id)).planExpiresAt.getTime(), expiry);
});

test('webhooks fuera de orden: un rechazo antiguo no pisa un cobro aprobado más nuevo', async () => {
  const { user, plan } = await fixture(); const subscription = await createAndAuthorize(user, plan);
  const newer = mock.addInvoice(subscription.providerSubscriptionId, { id: 'invoice_new', status: 'approved', paymentId: 'payment_new', when: new Date() });
  await service.webhook(webhookRequest({ type: 'subscription_authorized_payment', dataId: newer.id }));
  const older = mock.addInvoice(subscription.providerSubscriptionId, { id: 'invoice_old', status: 'rejected', paymentId: 'payment_old', when: new Date(Date.now() - 86400000) });
  await service.webhook(webhookRequest({ type: 'subscription_authorized_payment', dataId: older.id }));
  const current = await models.Subscription.findById(subscription._id);
  assert.equal(current.status, 'authorized'); assert.equal(current.lastPaymentStatus, 'approved'); assert.equal(current.lastPaymentId, 'payment_new');
});

test('cancelación desde MiTiendaYa: cancela en proveedor, evita futuros cobros y conserva el período ya acreditado', async () => {
  const { user, plan } = await fixture(); const subscription = await createAndAuthorize(user, plan);
  const invoice = mock.addInvoice(subscription.providerSubscriptionId, { id: 'invoice_cancel', status: 'approved', paymentId: 'payment_cancel' });
  await service.webhook(webhookRequest({ type: 'subscription_authorized_payment', dataId: invoice.id }));
  const expiryBefore = (await models.User.findById(user._id)).planExpiresAt.getTime();
  const cancelled = await service.cancelAtPeriodEnd(user._id);
  assert.equal(cancelled.cancelAtPeriodEnd, true); assert.equal(cancelled.status, 'cancelled'); assert.equal(mock.subscriptions.get(subscription.providerSubscriptionId).status, 'canceled');
  assert.equal((await models.User.findById(user._id)).planExpiresAt.getTime(), expiryBefore);
});

test('cancelación resiste una respuesta perdida después del commit remoto y queda reconciliada', async () => {
  const { user, plan } = await fixture(); const subscription = await createAndAuthorize(user, plan);
  mock.dropUpdateAfterCommitOnce = true;
  const cancelled = await service.cancelAtPeriodEnd(user._id);
  assert.equal(mock.subscriptions.get(subscription.providerSubscriptionId).status, 'canceled');
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.cancelAtPeriodEnd, true); assert.equal(cancelled.cancellationReason, 'seller_cancel');
  const current = await service.syncCurrent(user._id);
  assert.equal(current.status, 'cancelled'); assert.equal(current.cancelAtPeriodEnd, true);
});

test('cancelación externa: detecta incidente, bloquea alta paralela y permite generar una nueva vinculación', async () => {
  const { user, plan } = await fixture(); const subscription = await createAndAuthorize(user, plan);
  mock.externalStatus(subscription.providerSubscriptionId, 'canceled');
  let current = await service.syncCurrent(user._id);
  assert.equal(current.status, 'payment_failed'); assert.equal(current.providerStatus, 'canceled');
  const summary = await service.summaryForUser(await models.User.findById(user._id), { subscription: current });
  assert.equal(summary.issue?.code, 'provider_cancelled'); assert.equal(summary.issue?.canRecover, true); assert.equal(summary.issue?.canCut, true);
  const refreshedUser = await models.User.findById(user._id);
  await assert.rejects(() => service.createCheckout(refreshedUser, plan._id), error => error.code === 'SUBSCRIPTION_RECOVERY_REQUIRED');
  const replacement = await service.recover(refreshedUser, {});
  assert.notEqual(replacement.subscription.providerSubscriptionId, subscription.providerSubscriptionId);
  const old = await models.Subscription.findById(subscription._id); assert.equal(old.current, false); assert.equal(old.status, 'detached'); assert.ok(old.replacedAt);
  assert.equal(mock.subscriptions.size, 2);
});

test('pausa externa: se informa y puede reanudarse desde MiTiendaYa', async () => {
  const { user, plan } = await fixture(); const subscription = await createAndAuthorize(user, plan);
  mock.externalStatus(subscription.providerSubscriptionId, 'paused');
  let current = await service.syncCurrent(user._id); assert.equal(current.status, 'paused');
  let summary = await service.summaryForUser(await models.User.findById(user._id), { subscription: current }); assert.equal(summary.issue?.code, 'provider_paused'); assert.equal(summary.issue?.canResume, true);
  current = await service.resume(user._id); assert.equal(current.status, 'authorized'); assert.equal(mock.subscriptions.get(subscription.providerSubscriptionId).status, 'authorized');
});

test('desvincular una suscripción ya cancelada externamente no envía un PUT redundante', async () => {
  const { user, plan } = await fixture(); const subscription = await createAndAuthorize(user, plan);
  mock.externalStatus(subscription.providerSubscriptionId, 'canceled'); await service.syncCurrent(user._id);
  const before = mock.requests.filter(item => item.method === 'PUT').length;
  const detached = await service.detach(user._id); const after = mock.requests.filter(item => item.method === 'PUT').length;
  assert.equal(after, before); assert.equal(detached.current, false); assert.equal(detached.status, 'detached');
});

test('error al consultar cuotas no se oculta: queda registrado como problema de sincronización', async () => {
  const { user, plan } = await fixture(); const subscription = await createAndAuthorize(user, plan);
  mock.failAuthorizedSearchOnce = true;
  await assert.rejects(() => service.syncCurrent(user._id), error => error.code === 'SUBSCRIPTION_PROVIDER_ERROR');
  const current = await models.Subscription.findById(subscription._id); assert.ok(current.lastSyncErrorAt); assert.ok(current.lastSyncError);
  const summary = await service.summaryForUser(await models.User.findById(user._id), { subscription: current }); assert.equal(summary.issue?.code, 'sync_error');
});

test('cancelación pendiente: reconcilia el estado remoto y deja de ser current', async () => {
  const { user, plan } = await fixture(); const checkout = await service.createCheckout(user, plan._id);
  const cancelled = await service.cancelPendingForUser(user._id);
  assert.equal(cancelled.current, false); assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.pendingCancelReason, 'seller');
  assert.equal(mock.subscriptions.get(checkout.subscription.providerSubscriptionId).status, 'canceled');
});

test('el tópico payment reconcilia la factura por payment_id y sigue siendo idempotente', async () => {
  const { user, plan } = await fixture(); const subscription = await createAndAuthorize(user, plan);
  const invoice = mock.addInvoice(subscription.providerSubscriptionId, { id: 'invoice_payment_topic', status: 'approved', paymentId: '123456' });
  const result = await service.webhook(webhookRequest({ type: 'payment', dataId: '123456' }));
  assert.deepEqual(result, { received: true }); const firstExpiry = (await models.User.findById(user._id)).planExpiresAt.getTime();
  await service.webhook(webhookRequest({ type: 'payment', dataId: '123456' }));
  assert.equal((await models.User.findById(user._id)).planExpiresAt.getTime(), firstExpiry);
  assert.equal((await models.Subscription.findById(subscription._id)).status, 'authorized');
  assert.equal(await models.SubscriptionCharge.countDocuments({ providerAuthorizedPaymentId: invoice.id }), 1);
});
