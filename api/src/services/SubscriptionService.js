import crypto from 'node:crypto';
import { User, Plan, Settings, Subscription, SubscriptionCharge } from '../models/index.js';
import { config } from '../config.js';
import { AppError } from '../middleware/core.js';
import { decryptSecret } from '../utils/crypto.js';
import { subscriptionBillingPolicy } from './SubscriptionBillingPolicy.js';
const providerError = (message, status = 502, code = 'SUBSCRIPTION_PROVIDER_ERROR') => new AppError(message, status, code);
const asDate = value => value ? new Date(value) : null;
const finiteMoney = value => Math.round(Number(value || 0) * 100) / 100;

function snapshot(plan) {
  return { name: plan.name, price: finiteMoney(plan.price), durationDays: Number(plan.durationDays), maxStores: Number(plan.maxStores), maxProducts: Number(plan.maxProducts) };
}

export class PlatformMercadoPagoService {
  constructor({ fetchImpl = globalThis.fetch } = {}) { this.fetch = fetchImpl; }

  async credentials({ requireEnabled = false } = {}) {
    const settings = await Settings.findOne({ key: 'global' }).select('+platformBilling.mercadopago.accessToken +platformBilling.mercadopago.webhookSecret');
    const mp = settings?.platformBilling?.mercadopago || {};
    const accessToken = mp.accessToken ? decryptSecret(mp.accessToken) : '';
    const webhookSecret = mp.webhookSecret ? decryptSecret(mp.webhookSecret) : '';
    if (requireEnabled && !settings?.platformBilling?.enabled) throw new AppError('Las suscripciones con Mercado Pago todavía no están habilitadas por la administración.', 503, 'SUBSCRIPTIONS_NOT_CONFIGURED');
    if (!accessToken) throw new AppError('Las credenciales de Mercado Pago para suscripciones no están configuradas.', 503, 'SUBSCRIPTIONS_NOT_CONFIGURED');
    return { accessToken, webhookSecret, sandbox: mp.sandbox === true, settings };
  }

  async request(endpoint, { method = 'GET', body, idempotencyKey } = {}) {
    const { accessToken } = await this.credentials();
    let response;
    try {
      response = await this.fetch(`https://api.mercadopago.com${endpoint}`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw providerError('Mercado Pago no respondió. Intentá nuevamente en unos instantes.', 502, 'SUBSCRIPTION_PROVIDER_UNAVAILABLE');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw providerError('Las credenciales de Mercado Pago configuradas para suscripciones no son válidas.', 502, 'SUBSCRIPTION_CREDENTIALS_INVALID');
      throw providerError('Mercado Pago no pudo completar la operación de suscripción.', 502);
    }
    return payload;
  }

  verifySignature({ signature, requestId, dataId }, secret) {
    if (!secret || typeof signature !== 'string' || typeof requestId !== 'string' || !dataId) return false;
    const parts = Object.fromEntries(signature.split(',').map(part => part.trim().split('=')));
    if (!/^\d{10,16}$/.test(parts.ts || '') || !/^[a-f\d]{64}$/i.test(parts.v1 || '')) return false;
    const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
    const actual = Buffer.from(parts.v1, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  async createSubscription({ user, plan, payerEmail = user.email }) {
    await this.credentials({ requireEnabled: true });
    if (!config.appUrl.startsWith('https://') && config.isProduction) throw new AppError('APP_URL debe usar HTTPS para recibir el retorno de Mercado Pago.', 422, 'HTTPS_REQUIRED');
    const body = {
      reason: `Mi Tienda Ya · ${plan.name}`.slice(0, 255),
      external_reference: `mty-user-${user._id}-plan-${plan._id}`,
      payer_email: payerEmail,
      auto_recurring: { frequency: Number(plan.durationDays), frequency_type: 'days', transaction_amount: finiteMoney(plan.price), currency_id: 'ARS' },
      back_url: `${config.appUrl}/app/subscription?mercadopago=return`,
      status: 'pending',
    };
    return this.request('/preapproval', { method: 'POST', body, idempotencyKey: `mty-subscription-${user._id}-${plan._id}-${Date.now()}` });
  }

  getSubscription(id) { return this.request(`/preapproval/${encodeURIComponent(id)}`); }
  updateSubscription(id, body) { return this.request(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body }); }
  getAuthorizedPayment(id) { return this.request(`/authorized_payments/${encodeURIComponent(id)}`); }
  async authorizedPayments(subscriptionId) {
    const result = await this.request(`/authorized_payments/search?preapproval_id=${encodeURIComponent(subscriptionId)}&limit=100&offset=0`);
    return Array.isArray(result.results) ? result.results : [];
  }
}

export class SubscriptionService {
  constructor({ provider = new PlatformMercadoPagoService() } = {}) { this.provider = provider; }

  async current(userId) {
    return Subscription.findOne({ userId, current: true }).sort({ createdAt: -1 });
  }

  billingState({ user, subscription, settings, now = new Date() }) {
    return subscriptionBillingPolicy.state({ user, subscription, settings, now });
  }

  async summaryForUser(user, { settings, subscription } = {}) {
    settings ||= await Settings.findOne({ key: 'global' });
    subscription ||= await this.current(user._id);
    const state = this.billingState({ user, subscription, settings });
    return {
      ...state,
      subscriptionId: subscription?._id || null,
      planId: subscription?.planId || user.planId || null,
      providerSubscriptionId: subscription?.providerSubscriptionId || '',
      checkoutUrl: subscription?.status === 'pending' ? subscription.checkoutUrl : '',
      payerEmail: subscription?.payerEmail || '',
      paymentMethodId: subscription?.paymentMethodId || '',
      planSnapshot: subscription?.planSnapshot || null,
      current: Boolean(subscription?.current),
    };
  }

  async createCheckout(user, planId, { payerEmail = user.email } = {}) {
    const plan = await Plan.findOne({ _id: planId, active: true });
    if (!plan) throw new AppError('El plan seleccionado no está disponible.', 404, 'PLAN_NOT_FOUND');
    if (!(Number(plan.price) > 0)) throw new AppError('Este plan no puede contratarse como suscripción porque no tiene un precio mayor a cero.', 422, 'PLAN_NOT_SUBSCRIBABLE');
    const existing = await this.current(user._id);
    if (existing?.providerSubscriptionId && !['cancelled', 'detached'].includes(existing.status)) {
      if (existing.status === 'pending' && String(existing.planId) === String(plan._id) && existing.checkoutUrl) return { checkoutUrl: existing.checkoutUrl, subscription: existing };
      throw new AppError('Ya tenés una vinculación de Mercado Pago activa o pendiente. Cancelala o desvinculala antes de contratar otra.', 409, 'SUBSCRIPTION_ALREADY_LINKED');
    }
    if (existing) await Subscription.updateOne({ _id: existing._id }, { $set: { current: false } });
    const remote = await this.provider.createSubscription({ user, plan, payerEmail });
    if (!remote?.id || !remote?.init_point || !/^https:\/\//i.test(remote.init_point)) throw providerError('Mercado Pago no devolvió un enlace de suscripción válido.');
    const item = await Subscription.create({
      userId: user._id, planId: plan._id, providerSubscriptionId: String(remote.id), checkoutUrl: remote.init_point, current: true, status: 'pending', providerStatus: String(remote.status || 'pending'), payerEmail, planSnapshot: snapshot(plan), nextPaymentAt: asDate(remote.next_payment_date), lastProviderSyncAt: new Date(),
    });
    return { checkoutUrl: item.checkoutUrl, subscription: item };
  }

  async syncCurrent(userId) {
    const subscription = await this.current(userId);
    if (!subscription?.providerSubscriptionId) return subscription;
    const remote = await this.provider.getSubscription(subscription.providerSubscriptionId);
    await this.applyRemoteSubscription(subscription, remote);
    const invoices = await this.provider.authorizedPayments(subscription.providerSubscriptionId).catch(() => []);
    invoices.sort((a, b) => new Date(a.debit_date || a.date_created || 0) - new Date(b.debit_date || b.date_created || 0));
    for (const invoice of invoices) await this.applyAuthorizedPayment(subscription, invoice);
    return Subscription.findById(subscription._id);
  }

  async applyRemoteSubscription(subscription, remote) {
    const providerStatus = String(remote?.status || '');
    const next = { providerStatus, payerId: remote?.payer_id ? String(remote.payer_id) : subscription.payerId, paymentMethodId: remote?.payment_method_id || subscription.paymentMethodId, nextPaymentAt: asDate(remote?.next_payment_date), lastProviderSyncAt: new Date() };
    if (providerStatus === 'authorized' && !subscription.cancelAtPeriodEnd) { next.status = subscription.lastPaymentStatus && subscription.lastPaymentStatus !== 'approved' ? 'payment_failed' : 'authorized'; next.startedAt = subscription.startedAt || new Date(); }
    else if (providerStatus === 'paused') next.status = 'paused';
    else if (providerStatus === 'cancelled' || providerStatus === 'canceled') {
      if (subscription.cancelAtPeriodEnd) {
        next.status = 'cancelled';
        next.canceledAt = subscription.canceledAt || new Date();
      } else {
        // Mercado Pago puede cancelar la autorización luego de varios cobros rechazados.
        // No lo tratamos como una baja voluntaria: la deuda y la cortesía deben seguir corriendo.
        next.status = 'payment_failed';
        next.lastFailureAt = subscription.lastFailureAt || new Date();
      }
    }
    else if (providerStatus === 'pending') next.status = 'pending';
    await Subscription.updateOne({ _id: subscription._id }, { $set: next });
    Object.assign(subscription, next);
    return subscription;
  }

  async applyAuthorizedPayment(subscriptionOrId, invoice) {
    const subscription = subscriptionOrId?._id ? subscriptionOrId : await Subscription.findById(subscriptionOrId);
    if (!subscription || !invoice?.id) return null;
    const paymentStatus = String(invoice.payment?.status || invoice.summarized || invoice.status || 'pending');
    const paymentId = invoice.payment?.id ? String(invoice.payment.id) : '';
    const approved = paymentStatus === 'approved';
    const paidAt = approved ? asDate(invoice.last_modified || invoice.debit_date || invoice.date_created) || new Date() : null;
    const amount = finiteMoney(invoice.transaction_amount || subscription.planSnapshot.price);
    const charge = await SubscriptionCharge.findOneAndUpdate(
      { providerAuthorizedPaymentId: String(invoice.id) },
      { $set: { subscriptionId: subscription._id, userId: subscription.userId, planId: subscription.planId, providerPaymentId: paymentId || undefined, status: paymentStatus, statusDetail: String(invoice.payment?.status_detail || ''), amount, currency: invoice.currency_id || 'ARS', dueAt: asDate(invoice.debit_date), ...(paidAt ? { paidAt } : {}) } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    if (approved && paymentId) {
      const duration = Number(subscription.planSnapshot.durationDays);
      const paymentDate = paidAt || new Date();
      const firstAppliedPeriod = !subscription.currentPeriodEnd;
      const applied = await User.findOneAndUpdate(
        { _id: subscription.userId, subscriptionAppliedPaymentIds: { $ne: paymentId } },
        [{ $set: {
          planId: subscription.planId,
          planExpiresAt: firstAppliedPeriod
            ? { $dateAdd: { startDate: { $cond: [{ $gt: [{ $ifNull: ['$planExpiresAt', paymentDate] }, paymentDate] }, '$planExpiresAt', paymentDate] }, unit: 'day', amount: duration } }
            : { $dateAdd: { startDate: { $ifNull: ['$planExpiresAt', paymentDate] }, unit: 'day', amount: duration } },
          subscriptionAppliedPaymentIds: { $slice: [{ $concatArrays: [{ $ifNull: ['$subscriptionAppliedPaymentIds', []] }, [paymentId]] }, -100] },
        } }],
        { returnDocument: 'after' },
      ).select('+subscriptionAppliedPaymentIds');
      const user = applied || await User.findById(subscription.userId);
      const end = user?.planExpiresAt || subscription.currentPeriodEnd;
      const periodStart = firstAppliedPeriod ? (subscription.currentPeriodStart || paymentDate) : (subscription.currentPeriodEnd || paymentDate);
      const patch = { status: 'authorized', providerStatus: 'authorized', startedAt: subscription.startedAt || paymentDate, currentPeriodStart: periodStart, currentPeriodEnd: end, lastPaymentAt: paymentDate, lastPaymentId: paymentId, lastPaymentStatus: 'approved', lastPaymentStatusDetail: String(invoice.payment?.status_detail || ''), lastFailureAt: null };
      await Subscription.updateOne({ _id: subscription._id }, { $set: patch });
      Object.assign(subscription, patch);
    } else if (!approved && !['pending', 'scheduled', 'in_process'].includes(paymentStatus)) {
      await Subscription.updateOne({ _id: subscription._id }, { $set: { status: 'payment_failed', lastPaymentStatus: paymentStatus, lastPaymentStatusDetail: String(invoice.payment?.status_detail || ''), lastFailureAt: new Date() } });
    } else {
      await Subscription.updateOne({ _id: subscription._id }, { $set: { lastPaymentStatus: paymentStatus, lastPaymentStatusDetail: String(invoice.payment?.status_detail || '') } });
    }
    return charge;
  }

  async cancelAtPeriodEnd(userId) {
    const subscription = await this.current(userId);
    if (!subscription?.providerSubscriptionId) throw new AppError('No hay una suscripción vinculada para cancelar.', 404, 'SUBSCRIPTION_NOT_FOUND');
    if (!['cancelled', 'detached'].includes(subscription.status)) await this.provider.updateSubscription(subscription.providerSubscriptionId, { status: 'canceled' });
    subscription.status = 'cancelled'; subscription.providerStatus = 'cancelled'; subscription.cancelAtPeriodEnd = true; subscription.canceledAt = new Date(); subscription.checkoutUrl = '';
    await subscription.save();
    return subscription;
  }

  async detach(userId) {
    const subscription = await this.current(userId);
    if (!subscription) throw new AppError('No hay una cuenta de Mercado Pago vinculada.', 404, 'SUBSCRIPTION_NOT_FOUND');
    if (subscription.providerSubscriptionId && !['cancelled', 'detached'].includes(subscription.status)) await this.provider.updateSubscription(subscription.providerSubscriptionId, { status: 'canceled' });
    subscription.status = 'detached'; subscription.providerStatus = 'cancelled'; subscription.current = false; subscription.cancelAtPeriodEnd = true; subscription.detachedAt = new Date(); subscription.canceledAt ||= new Date(); subscription.checkoutUrl = '';
    await subscription.save();
    return subscription;
  }

  async webhook(req) {
    const { webhookSecret } = await this.provider.credentials();
    if (!webhookSecret) throw new AppError('La clave de Webhooks de suscripciones no está configurada.', 503, 'SUBSCRIPTION_WEBHOOK_SECRET_MISSING');
    const dataId = req.body?.data?.id || req.query?.['data.id'] || req.query?.id;
    const signature = req.get('x-signature'); const requestId = req.get('x-request-id');
    if (!this.provider.verifySignature({ signature, requestId, dataId }, webhookSecret)) throw new AppError('Firma de Mercado Pago inválida.', 401, 'INVALID_WEBHOOK_SIGNATURE');
    const type = String(req.body?.type || req.query?.type || req.query?.topic || '');
    if (type === 'subscription_preapproval') {
      const subscription = await Subscription.findOne({ providerSubscriptionId: String(dataId) });
      if (subscription) await this.applyRemoteSubscription(subscription, await this.provider.getSubscription(dataId));
    } else if (type === 'subscription_authorized_payment') {
      const invoice = await this.provider.getAuthorizedPayment(dataId);
      const subscription = await Subscription.findOne({ providerSubscriptionId: String(invoice.preapproval_id) });
      if (subscription) await this.applyAuthorizedPayment(subscription, invoice);
    } else if (type === 'payment') {
      // Los webhooks de factura autorizada contienen el vínculo inequívoco con la suscripción.
      // El tópico payment se acepta para que Mercado Pago pueda estar configurado con los tres eventos recomendados.
    }
    return { received: true };
  }
}

export const platformMercadoPagoService = new PlatformMercadoPagoService();
export const subscriptionService = new SubscriptionService({ provider: platformMercadoPagoService });
