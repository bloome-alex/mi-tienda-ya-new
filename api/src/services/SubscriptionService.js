import crypto from 'node:crypto';
import { User, Plan, Settings, Subscription, SubscriptionCharge } from '../models/index.js';
import { config } from '../config.js';
import { AppError } from '../middleware/core.js';
import { decryptSecret } from '../utils/crypto.js';
import { subscriptionBillingPolicy } from './SubscriptionBillingPolicy.js';
import { subscriptionHealthPolicy } from './SubscriptionHealthPolicy.js';
import { subscriptionSupportService } from './SubscriptionSupportService.js';

const providerError = (message, status = 502, code = 'SUBSCRIPTION_PROVIDER_ERROR') => new AppError(message, status, code);
const asDate = value => value ? new Date(value) : null;
const finiteMoney = value => Math.round(Number(value || 0) * 100) / 100;
const HOUR = 3600000;
const stoppedProviderStatus = value => ['cancelled', 'canceled'].includes(String(value || '').toLowerCase());
const pendingPaymentStatuses = new Set(['pending', 'scheduled', 'in_process', 'waiting for gateway', 'waiting_for_gateway', 'recycling', 'processed']);
const failedPaymentStatuses = new Set(['rejected', 'cancelled', 'canceled', 'refunded', 'charged_back']);

function snapshot(plan) {
  return { name: plan.name, price: finiteMoney(plan.price), durationDays: Number(plan.durationDays), maxStores: Number(plan.maxStores), maxProducts: Number(plan.maxProducts) };
}

function validDate(...values) {
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

/** Cliente de la API de Suscripciones de Mercado Pago. El transporte es inyectable para QA/mock. */
export class PlatformMercadoPagoService {
  constructor({ fetchImpl = globalThis.fetch, baseUrl = 'https://api.mercadopago.com', credentialsResolver = null, timeoutMs = 15000 } = {}) {
    this.fetch = fetchImpl;
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.credentialsResolver = credentialsResolver;
    this.timeoutMs = timeoutMs;
  }

  async credentials({ requireEnabled = false } = {}) {
    if (this.credentialsResolver) return this.credentialsResolver({ requireEnabled });
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
      response = await this.fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
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
    if (!secret || typeof signature !== 'string' || !dataId) return false;
    const parts = {};
    for (const raw of signature.split(',')) {
      const index = raw.indexOf('=');
      if (index < 1) continue;
      parts[raw.slice(0, index).trim()] = raw.slice(index + 1).trim();
    }
    if (!/^\d{10,16}$/.test(parts.ts || '') || !/^[a-f\d]{64}$/i.test(parts.v1 || '')) return false;
    // La documentación vigente indica omitir del manifest los pares que no estén presentes.
    const manifest = [`id:${String(dataId).toLowerCase()}`, ...(requestId ? [`request-id:${requestId}`] : []), `ts:${parts.ts}`].join(';') + ';';
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
    const actual = Buffer.from(parts.v1, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  async createSubscription({ user, plan, payerEmail = user.email, externalReference, idempotencyKey }) {
    await this.credentials({ requireEnabled: true });
    if (!config.appUrl.startsWith('https://') && config.isProduction) throw new AppError('APP_URL debe usar HTTPS para recibir el retorno de Mercado Pago.', 422, 'HTTPS_REQUIRED');
    const body = {
      reason: `MiTiendaYa · ${plan.name}`.slice(0, 255),
      external_reference: externalReference || `mty-user-${user._id}-plan-${plan._id}`,
      payer_email: payerEmail,
      auto_recurring: { frequency: Number(plan.durationDays), frequency_type: 'days', transaction_amount: finiteMoney(plan.price), currency_id: 'ARS' },
      back_url: `${config.appUrl}/app/subscription?mercadopago=return`,
      status: 'pending',
    };
    return this.request('/preapproval', { method: 'POST', body, idempotencyKey: idempotencyKey || crypto.randomUUID() });
  }

  getSubscription(id) { return this.request(`/preapproval/${encodeURIComponent(id)}`); }
  updateSubscription(id, body) { return this.request(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body }); }
  getAuthorizedPayment(id) { return this.request(`/authorized_payments/${encodeURIComponent(id)}`); }
  async authorizedPayments(subscriptionId) {
    const result = await this.request(`/authorized_payments/search?preapproval_id=${encodeURIComponent(subscriptionId)}&limit=100&offset=0`);
    return Array.isArray(result.results) ? result.results : [];
  }
  async authorizedPaymentsByPaymentId(paymentId) {
    const result = await this.request(`/authorized_payments/search?payment_id=${encodeURIComponent(paymentId)}&limit=100&offset=0`);
    return Array.isArray(result.results) ? result.results : [];
  }
  async findSubscriptionByReference({ payerEmail, externalReference, maxPages = 10 }) {
    if (!payerEmail || !externalReference) return null;
    const limit = 100;
    for (let page = 0; page < maxPages; page += 1) {
      const offset = page * limit;
      const result = await this.request(`/preapproval/search?payer_email=${encodeURIComponent(payerEmail)}&limit=${limit}&offset=${offset}`);
      const rows = Array.isArray(result.results) ? result.results : [];
      const exact = rows.find(item => String(item.external_reference || '') === String(externalReference));
      if (exact) return exact;
      const total = Number(result?.paging?.total || rows.length);
      if (rows.length < limit || offset + rows.length >= total) break;
    }
    return null;
  }
}

export class SubscriptionService {
  constructor({ provider = new PlatformMercadoPagoService(), billingPolicy = subscriptionBillingPolicy, healthPolicy = subscriptionHealthPolicy } = {}) {
    this.provider = provider;
    this.billingPolicy = billingPolicy;
    this.healthPolicy = healthPolicy;
    this.pendingTimer = null;
  }

  pendingHours(settings) { return Math.max(1, Math.min(720, Number(settings?.subscriptionPendingLinkHours || 24))); }

  async ensurePendingExpiry(subscription, settings) {
    if (!subscription || subscription.status !== 'pending') return subscription;
    if (!subscription.pendingExpiresAt) {
      const base = subscription.createdAt ? new Date(subscription.createdAt).getTime() : Date.now();
      subscription.pendingExpiresAt = new Date(base + this.pendingHours(settings) * HOUR);
      await subscription.save();
    }
    return subscription;
  }

  async cancellationIntent(subscription, reason) {
    subscription.cancellationRequestedAt = subscription.cancellationRequestedAt || new Date();
    subscription.cancellationReason = reason;
    await subscription.save();
  }

  async clearCancellationIntent(subscription) {
    subscription.cancellationRequestedAt = undefined;
    subscription.cancellationReason = '';
    await subscription.save();
  }

  async ensureProviderCancelled(subscription, reason) {
    if (!subscription?.providerSubscriptionId || stoppedProviderStatus(subscription.providerStatus)) return;
    await this.cancellationIntent(subscription, reason);
    try {
      const remote = await this.provider.updateSubscription(subscription.providerSubscriptionId, { status: 'canceled' });
      if (remote?.status) subscription.providerStatus = String(remote.status);
    } catch (error) {
      // El PUT puede perder su respuesta después de que el proveedor ya haya cancelado.
      // Reconciliamos antes de informar error para no dejar la UI trabada.
      const remote = await this.provider.getSubscription(subscription.providerSubscriptionId).catch(() => null);
      if (remote && stoppedProviderStatus(remote.status)) {
        subscription.providerStatus = String(remote.status);
        return;
      }
      await this.clearCancellationIntent(subscription).catch(() => {});
      throw error;
    }
  }

  async cancelPendingSubscription(subscription, { reason = 'seller' } = {}) {
    if (!subscription || subscription.status !== 'pending') throw new AppError('No hay una vinculación pendiente para cancelar.', 409, 'PENDING_SUBSCRIPTION_NOT_FOUND');
    if (subscription.providerSubscriptionId) {
      const remote = await this.provider.getSubscription(subscription.providerSubscriptionId);
      const remoteStatus = String(remote?.status || '').toLowerCase();
      if (remoteStatus && remoteStatus !== 'pending') {
        if (stoppedProviderStatus(remoteStatus)) {
          subscription.status = 'cancelled'; subscription.providerStatus = remoteStatus; subscription.current = false; subscription.checkoutUrl = '';
          subscription.pendingCancelledAt = subscription.pendingCancelledAt || new Date(); subscription.pendingCancelReason = reason; subscription.canceledAt = subscription.canceledAt || new Date();
          await subscription.save();
          await subscriptionSupportService.closePendingForSubscription(subscription._id, reason === 'expired' ? 'La vinculación venció automáticamente.' : 'El vendedor canceló la vinculación pendiente.');
          return subscription;
        }
        await this.applyRemoteSubscription(subscription, remote);
        throw new AppError('Mercado Pago ya cambió el estado de esta vinculación. Actualizá la pantalla antes de cancelarla.', 409, 'PENDING_SUBSCRIPTION_CHANGED');
      }
      await this.ensureProviderCancelled(subscription, reason === 'expired' ? 'expired' : 'pending_cancel');
    }
    subscription.status = 'cancelled'; subscription.providerStatus = 'cancelled'; subscription.current = false; subscription.checkoutUrl = '';
    subscription.pendingCancelledAt = new Date(); subscription.pendingCancelReason = reason; subscription.canceledAt = subscription.canceledAt || new Date();
    await subscription.save();
    await subscriptionSupportService.closePendingForSubscription(subscription._id, reason === 'expired' ? 'La vinculación venció automáticamente.' : 'El vendedor canceló la vinculación pendiente.');
    return subscription;
  }

  async cancelPendingForUser(userId, { reason = 'seller' } = {}) {
    const subscription = await this.current(userId);
    return this.cancelPendingSubscription(subscription, { reason });
  }

  async expirePendingForUser(userId, { settings, now = new Date() } = {}) {
    settings ||= await Settings.findOne({ key: 'global' });
    const subscription = await this.current(userId);
    if (!subscription || subscription.status !== 'pending') return subscription;
    await this.ensurePendingExpiry(subscription, settings);
    if (subscription.pendingExpiresAt > now) return subscription;
    return this.cancelPendingSubscription(subscription, { reason: 'expired' });
  }

  async expireDuePending(limit = 50) {
    const settings = await Settings.findOne({ key: 'global' });
    const rows = await Subscription.find({ current: true, status: 'pending' }).sort({ createdAt: 1 }).limit(limit);
    for (const subscription of rows) {
      try {
        await this.ensurePendingExpiry(subscription, settings);
        if (subscription.pendingExpiresAt <= new Date()) await this.cancelPendingSubscription(subscription, { reason: 'expired' });
      } catch (error) {
        console.error(`[subscription-pending-worker] ${subscription._id}: ${error.code || error.name} ${error.message}`);
      }
    }
  }

  startPendingWorker() {
    if (this.pendingTimer) return;
    const run = () => this.expireDuePending().catch(error => console.error('[subscription-pending-worker]', error.code || error.name, error.message));
    this.pendingTimer = setInterval(run, 60000); this.pendingTimer.unref?.(); run();
  }

  stopPendingWorker() { if (this.pendingTimer) clearInterval(this.pendingTimer); this.pendingTimer = null; }

  checkoutReference(item) { return `mty-sub-${item.userId}-plan-${item.planId}-attempt-${item.checkoutAttemptId}`; }

  async attachRemoteCheckout(item, remote) {
    if (!remote?.id || !remote?.init_point || !/^https:\/\//i.test(remote.init_point)) throw providerError('Mercado Pago no devolvió un enlace de suscripción válido.');
    item.providerSubscriptionId = String(remote.id);
    item.checkoutUrl = remote.init_point;
    item.providerStatus = String(remote.status || 'pending');
    item.nextPaymentAt = asDate(remote.next_payment_date);
    item.lastProviderSyncAt = new Date();
    item.lastSyncError = '';
    item.lastSyncErrorAt = undefined;
    await item.save();
    return { checkoutUrl: item.checkoutUrl, subscription: item };
  }

  async current(userId) { return Subscription.findOne({ userId, current: true }).sort({ createdAt: -1 }); }

  billingState({ user, subscription, settings, now = new Date() }) { return this.billingPolicy.state({ user, subscription, settings, now }); }

  async summaryForUser(user, { settings, subscription } = {}) {
    settings ||= await Settings.findOne({ key: 'global' });
    subscription ||= await this.current(user._id);
    if (subscription?.status === 'pending') {
      await this.ensurePendingExpiry(subscription, settings);
      if (subscription.pendingExpiresAt <= new Date()) {
        try { await this.cancelPendingSubscription(subscription, { reason: 'expired' }); subscription = null; }
        catch { /* El worker reintentará; la UI muestra el intento como vencido. */ }
      }
    }
    const state = this.billingState({ user, subscription, settings });
    const supportRequest = subscription ? await subscriptionSupportService.currentForUser(user._id, subscription._id) : null;
    const pendingExpired = Boolean(subscription?.status === 'pending' && subscription.pendingExpiresAt && subscription.pendingExpiresAt <= new Date());
    return {
      ...state,
      subscriptionId: subscription?._id || null,
      planId: subscription?.planId || user.planId || null,
      providerSubscriptionId: subscription?.providerSubscriptionId || '',
      checkoutUrl: subscription?.status === 'pending' && !pendingExpired ? subscription.checkoutUrl : '',
      payerEmail: subscription?.payerEmail || '',
      paymentMethodId: subscription?.paymentMethodId || '',
      planSnapshot: subscription?.planSnapshot || null,
      current: Boolean(subscription?.current),
      pendingExpiresAt: subscription?.pendingExpiresAt || null,
      pendingExpired,
      pendingLinkHours: this.pendingHours(settings),
      manualAccessUntil: user.subscriptionManualAccessUntil || null,
      issue: this.healthPolicy.issue({ subscription }),
      supportRequest: supportRequest ? { id: supportRequest._id, status: supportRequest.status, note: supportRequest.note || '', adminNote: supportRequest.adminNote || '', createdAt: supportRequest.createdAt, reviewedAt: supportRequest.reviewedAt, manualAccessUntil: supportRequest.manualAccessUntil || null } : null,
    };
  }

  async createCheckout(user, planId, { payerEmail = user.email } = {}) {
    const plan = await Plan.findOne({ _id: planId, active: true });
    if (!plan) throw new AppError('El plan seleccionado no está disponible.', 404, 'PLAN_NOT_FOUND');
    const currentPlanId = user.planId?._id || user.planId;
    if (plan.visible === false && String(currentPlanId || '') !== String(plan._id)) throw new AppError('Este plan sólo puede ser asignado por Administración.', 403, 'PLAN_HIDDEN');
    if (!(Number(plan.price) > 0)) throw new AppError('Este plan no puede contratarse como suscripción porque no tiene un precio mayor a cero.', 422, 'PLAN_NOT_SUBSCRIBABLE');
    const settings = await Settings.findOne({ key: 'global' });
    let existing = await this.current(user._id);
    if (existing?.status === 'pending') {
      await this.ensurePendingExpiry(existing, settings);
      if (existing.pendingExpiresAt <= new Date()) { await this.cancelPendingSubscription(existing, { reason: 'expired' }); existing = null; }
    }
    if (existing?.providerSubscriptionId && !['cancelled', 'detached'].includes(existing.status)) {
      if (existing.status === 'pending' && String(existing.planId) === String(plan._id) && existing.checkoutUrl) return { checkoutUrl: existing.checkoutUrl, subscription: existing };
      if (stoppedProviderStatus(existing.providerStatus) && !existing.cancelAtPeriodEnd) throw new AppError('Mercado Pago canceló esta autorización. Usá la opción para generar una nueva vinculación o cortá la suscripción actual.', 409, 'SUBSCRIPTION_RECOVERY_REQUIRED');
      throw new AppError('Ya tenés una vinculación de Mercado Pago activa o pendiente. Cancelala o desvinculala antes de contratar otra.', 409, 'SUBSCRIPTION_ALREADY_LINKED');
    }

    let item = existing?.status === 'pending' && !existing.providerSubscriptionId && String(existing.planId) === String(plan._id) && existing.checkoutAttemptId ? existing : null;
    const resumingAmbiguousAttempt = Boolean(item);
    if (!item) {
      if (existing) await Subscription.updateOne({ _id: existing._id }, { $set: { current: false } });
      item = await Subscription.create({
        userId: user._id, planId: plan._id, providerSubscriptionId: undefined, checkoutUrl: '', checkoutAttemptId: crypto.randomUUID(), current: true, status: 'pending', providerStatus: 'pending', payerEmail, planSnapshot: snapshot(plan), pendingExpiresAt: new Date(Date.now() + this.pendingHours(settings) * HOUR), lastProviderSyncAt: null,
      });
    }

    const externalReference = this.checkoutReference(item);
    // Si un intento anterior quedó ambiguo por un corte de red, primero reconciliamos por
    // payer_email + external_reference (ambos documentados por Mercado Pago) antes de volver a crear.
    if (!item.providerSubscriptionId && resumingAmbiguousAttempt && item.checkoutRequestStartedAt) {
      const recovered = await this.provider.findSubscriptionByReference({ payerEmail: item.payerEmail || payerEmail, externalReference }).catch(() => null);
      if (recovered) return this.attachRemoteCheckout(item, recovered);
      throw new AppError('No pudimos confirmar si Mercado Pago llegó a crear esta vinculación. Para evitar una suscripción duplicada, cancelá este intento pendiente y generá uno nuevo sólo después de verificarlo.', 409, 'SUBSCRIPTION_CHECKOUT_UNCERTAIN');
    }

    try {
      item.checkoutRequestStartedAt = new Date();
      await item.save();
      const remote = await this.provider.createSubscription({ user, plan, payerEmail, externalReference, idempotencyKey: item.checkoutAttemptId });
      return this.attachRemoteCheckout(item, remote);
    } catch (error) {
      // Un timeout no prueba que el POST haya fallado. Buscamos la referencia exacta para
      // recuperar el preapproval ya creado y evitar una segunda vinculación.
      const recovered = await this.provider.findSubscriptionByReference({ payerEmail: item.payerEmail || payerEmail, externalReference }).catch(() => null);
      if (recovered) return this.attachRemoteCheckout(item, recovered);
      if (error.code === 'SUBSCRIPTION_CREDENTIALS_INVALID') item.checkoutRequestStartedAt = undefined;
      item.lastSyncError = String(error.code || error.message || 'SUBSCRIPTION_PROVIDER_ERROR').slice(0, 300); item.lastSyncErrorAt = new Date();
      await item.save().catch(() => {});
      throw error;
    }
  }

  async markSyncError(subscription, error) {
    if (!subscription?._id) return;
    const message = String(error?.code || error?.message || 'SUBSCRIPTION_PROVIDER_ERROR').slice(0, 300);
    await Subscription.updateOne({ _id: subscription._id }, { $set: { lastSyncError: message, lastSyncErrorAt: new Date() } }).catch(() => {});
  }

  async syncCurrent(userId) {
    const subscription = await this.current(userId);
    if (!subscription?.providerSubscriptionId) return subscription;
    try {
      const remote = await this.provider.getSubscription(subscription.providerSubscriptionId);
      await this.applyRemoteSubscription(subscription, remote);
      const invoices = await this.provider.authorizedPayments(subscription.providerSubscriptionId);
      invoices.sort((a, b) => validDate(a.last_modified, a.debit_date, a.date_created) - validDate(b.last_modified, b.debit_date, b.date_created));
      for (const invoice of invoices) await this.applyAuthorizedPayment(subscription, invoice);
      await Subscription.updateOne({ _id: subscription._id }, { $set: { lastSyncError: '' }, $unset: { lastSyncErrorAt: 1 } });
      return Subscription.findById(subscription._id);
    } catch (error) {
      await this.markSyncError(subscription, error);
      throw error;
    }
  }

  async applyRemoteSubscription(subscription, remote) {
    const providerStatus = String(remote?.status || '').toLowerCase();
    const next = {
      providerStatus,
      payerId: remote?.payer_id ? String(remote.payer_id) : subscription.payerId,
      paymentMethodId: remote?.payment_method_id || subscription.paymentMethodId,
      nextPaymentAt: asDate(remote?.next_payment_date),
      lastProviderSyncAt: new Date(),
      lastSyncError: '',
    };
    const intentionalCancellation = Boolean(subscription.cancelAtPeriodEnd || subscription.cancellationRequestedAt);
    if (providerStatus === 'authorized' && !subscription.cancelAtPeriodEnd && !subscription.cancellationRequestedAt) {
      next.status = subscription.lastPaymentStatus && failedPaymentStatuses.has(String(subscription.lastPaymentStatus).toLowerCase()) ? 'payment_failed' : 'authorized';
      next.startedAt = subscription.startedAt || new Date(); next.checkoutUrl = ''; next.pendingExpiresAt = null;
    } else if (providerStatus === 'paused') next.status = 'paused';
    else if (stoppedProviderStatus(providerStatus)) {
      if (subscription.status === 'pending') {
        next.status = 'cancelled'; next.current = false; next.checkoutUrl = ''; next.pendingCancelledAt = subscription.pendingCancelledAt || new Date(); next.canceledAt = subscription.canceledAt || new Date();
      } else if (intentionalCancellation) {
        // La intención se guarda antes del PUT a Mercado Pago. Si la respuesta se pierde
        // o el proceso cae después del cambio remoto, un sync/webhook completa el estado local.
        const reason = String(subscription.cancellationReason || 'seller_cancel');
        next.status = reason === 'detach' ? 'detached' : 'cancelled';
        next.cancelAtPeriodEnd = true;
        next.canceledAt = subscription.canceledAt || new Date();
        next.checkoutUrl = '';
        if (reason === 'detach') {
          next.current = false;
          next.detachedAt = subscription.detachedAt || new Date();
        } else if (['pending_cancel', 'expired'].includes(reason)) {
          next.current = false;
          next.pendingCancelledAt = subscription.pendingCancelledAt || new Date();
        }
      } else {
        // Mercado Pago puede cancelar desde su panel o luego de varios cobros rechazados.
        // Se conserva la deuda/cortesía pero se exige una nueva autorización para futuros cobros.
        next.status = 'payment_failed'; next.lastFailureAt = subscription.lastFailureAt || new Date(); next.checkoutUrl = '';
      }
    } else if (providerStatus === 'pending') next.status = 'pending';
    await Subscription.updateOne({ _id: subscription._id }, { $set: next, $unset: { lastSyncErrorAt: 1 } });
    Object.assign(subscription, next); subscription.lastSyncErrorAt = undefined;
    if (next.status === 'authorized') await subscriptionSupportService.resolveProviderConfirmed(subscription._id);
    else if (next.status === 'cancelled' && next.current === false) await subscriptionSupportService.closePendingForSubscription(subscription._id, 'Mercado Pago informó que la vinculación ya no está pendiente.');
    return subscription;
  }

  async applyAuthorizedPayment(subscriptionOrId, invoice) {
    const subscription = subscriptionOrId?._id ? subscriptionOrId : await Subscription.findById(subscriptionOrId);
    if (!subscription || !invoice?.id) return null;
    const rawPaymentStatus = String(invoice.payment?.status || invoice.summarized || invoice.status || 'pending').toLowerCase();
    const paymentStatus = rawPaymentStatus.replaceAll('_', ' ');
    const paymentId = invoice.payment?.id ? String(invoice.payment.id) : '';
    const applicationId = paymentId || `authorized:${invoice.id}`;
    const approved = rawPaymentStatus === 'approved';
    const failed = failedPaymentStatuses.has(rawPaymentStatus);
    const pending = pendingPaymentStatuses.has(rawPaymentStatus) || pendingPaymentStatuses.has(paymentStatus);
    const eventAt = validDate(invoice.last_modified, invoice.date_created, invoice.debit_date);
    const isLatestEvent = !subscription.lastPaymentEventAt || eventAt.getTime() >= new Date(subscription.lastPaymentEventAt).getTime();
    const paidAt = approved ? validDate(invoice.last_modified, invoice.debit_date, invoice.date_created) : null;
    const amount = finiteMoney(invoice.transaction_amount || subscription.planSnapshot.price);
    const statusDetail = String(invoice.payment?.status_detail || '');
    const charge = await SubscriptionCharge.findOneAndUpdate(
      { providerAuthorizedPaymentId: String(invoice.id) },
      { $set: { subscriptionId: subscription._id, userId: subscription.userId, planId: subscription.planId, providerPaymentId: paymentId || undefined, status: rawPaymentStatus, statusDetail, amount, currency: invoice.currency_id || 'ARS', dueAt: asDate(invoice.debit_date), ...(paidAt ? { paidAt } : {}) } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );

    if (approved) {
      const duration = Number(subscription.planSnapshot.durationDays);
      const paymentDate = paidAt || new Date();
      const firstAppliedPeriod = !subscription.currentPeriodEnd;
      const applied = await User.findOneAndUpdate(
        { _id: subscription.userId, subscriptionAppliedPaymentIds: { $ne: applicationId } },
        [{ $set: {
          planId: subscription.planId,
          planExpiresAt: firstAppliedPeriod
            ? { $dateAdd: { startDate: { $cond: [{ $gt: [{ $ifNull: ['$planExpiresAt', paymentDate] }, paymentDate] }, '$planExpiresAt', paymentDate] }, unit: 'day', amount: duration } }
            : { $dateAdd: { startDate: { $ifNull: ['$planExpiresAt', paymentDate] }, unit: 'day', amount: duration } },
          subscriptionAppliedPaymentIds: { $slice: [{ $concatArrays: [{ $ifNull: ['$subscriptionAppliedPaymentIds', []] }, [applicationId]] }, -100] },
        } }],
        // Este update usa un aggregation pipeline (array) para acreditar el
        // periodo y registrar el payment id de forma atómica. Mongoose exige
        // declarar explícitamente updatePipeline cuando el update es un array.
        { returnDocument: 'after', updatePipeline: true },
      ).select('+subscriptionAppliedPaymentIds');
      const user = applied || await User.findById(subscription.userId);
      const end = user?.planExpiresAt || subscription.currentPeriodEnd;
      const periodStart = firstAppliedPeriod ? (subscription.currentPeriodStart || paymentDate) : (subscription.currentPeriodEnd || paymentDate);
      const patch = { startedAt: subscription.startedAt || paymentDate, currentPeriodStart: periodStart, currentPeriodEnd: end };
      if (isLatestEvent) {
        const providerStoppedUnexpectedly = stoppedProviderStatus(subscription.providerStatus) && !subscription.cancelAtPeriodEnd;
        patch.status = providerStoppedUnexpectedly ? 'payment_failed' : subscription.providerStatus === 'paused' ? 'paused' : subscription.cancelAtPeriodEnd ? 'cancelled' : 'authorized';
        patch.lastPaymentAt = paymentDate; patch.lastPaymentId = paymentId || applicationId; patch.lastPaymentStatus = 'approved'; patch.lastPaymentStatusDetail = statusDetail; patch.lastPaymentEventAt = eventAt;
        if (patch.status === 'authorized') patch.lastFailureAt = null;
      }
      await Subscription.updateOne({ _id: subscription._id }, { $set: patch });
      Object.assign(subscription, patch);
    } else if (failed && isLatestEvent && !subscription.cancelAtPeriodEnd) {
      const patch = { status: 'payment_failed', lastPaymentStatus: rawPaymentStatus, lastPaymentStatusDetail: statusDetail, lastPaymentEventAt: eventAt, lastFailureAt: new Date() };
      await Subscription.updateOne({ _id: subscription._id }, { $set: patch }); Object.assign(subscription, patch);
    } else if ((pending || !failed) && isLatestEvent) {
      const patch = { lastPaymentStatus: rawPaymentStatus, lastPaymentStatusDetail: statusDetail, lastPaymentEventAt: eventAt };
      await Subscription.updateOne({ _id: subscription._id }, { $set: patch }); Object.assign(subscription, patch);
    }
    return charge;
  }

  async cancelAtPeriodEnd(userId) {
    const subscription = await this.current(userId);
    if (!subscription?.providerSubscriptionId) throw new AppError('No hay una suscripción vinculada para cancelar.', 404, 'SUBSCRIPTION_NOT_FOUND');
    if (subscription.status === 'pending') throw new AppError('Cancelá primero la vinculación pendiente.', 409, 'SUBSCRIPTION_PENDING');
    if (!['cancelled', 'detached'].includes(subscription.status) && !stoppedProviderStatus(subscription.providerStatus)) await this.ensureProviderCancelled(subscription, 'seller_cancel');
    subscription.status = 'cancelled'; subscription.providerStatus = 'cancelled'; subscription.cancelAtPeriodEnd = true; subscription.cancellationRequestedAt ||= new Date(); subscription.cancellationReason = 'seller_cancel'; subscription.canceledAt = new Date(); subscription.checkoutUrl = '';
    await subscription.save();
    return subscription;
  }

  async detach(userId) {
    const subscription = await this.current(userId);
    if (!subscription) throw new AppError('No hay una cuenta de Mercado Pago vinculada.', 404, 'SUBSCRIPTION_NOT_FOUND');
    if (subscription.providerSubscriptionId && !['cancelled', 'detached'].includes(subscription.status) && !stoppedProviderStatus(subscription.providerStatus)) await this.ensureProviderCancelled(subscription, 'detach');
    subscription.status = 'detached'; subscription.providerStatus = stoppedProviderStatus(subscription.providerStatus) ? subscription.providerStatus : 'cancelled'; subscription.current = false; subscription.cancelAtPeriodEnd = true; subscription.cancellationRequestedAt ||= new Date(); subscription.cancellationReason = 'detach'; subscription.detachedAt = new Date(); subscription.canceledAt ||= new Date(); subscription.checkoutUrl = '';
    await subscription.save();
    return subscription;
  }

  async resume(userId) {
    const subscription = await this.current(userId);
    if (!subscription?.providerSubscriptionId) throw new AppError('No hay una suscripción vinculada para reanudar.', 404, 'SUBSCRIPTION_NOT_FOUND');
    if (subscription.cancelAtPeriodEnd || subscription.status === 'detached' || stoppedProviderStatus(subscription.providerStatus)) throw new AppError('Esta suscripción ya no puede reanudarse. Generá una nueva vinculación.', 409, 'SUBSCRIPTION_RECOVERY_REQUIRED');
    if (String(subscription.providerStatus).toLowerCase() !== 'paused' && subscription.status !== 'paused') throw new AppError('La suscripción no está pausada.', 409, 'SUBSCRIPTION_NOT_PAUSED');
    await this.provider.updateSubscription(subscription.providerSubscriptionId, { status: 'authorized' });
    return this.applyRemoteSubscription(subscription, await this.provider.getSubscription(subscription.providerSubscriptionId));
  }

  async recover(user, { payerEmail } = {}) {
    const subscription = await this.current(user._id);
    if (!subscription?.providerSubscriptionId || !stoppedProviderStatus(subscription.providerStatus) || subscription.cancelAtPeriodEnd) throw new AppError('La suscripción actual no necesita una nueva vinculación.', 409, 'SUBSCRIPTION_RECOVERY_NOT_REQUIRED');
    const planId = subscription.planId;
    const email = payerEmail || subscription.payerEmail || user.email;
    subscription.status = 'detached'; subscription.current = false; subscription.detachedAt = new Date(); subscription.replacedAt = new Date(); subscription.checkoutUrl = '';
    await subscription.save();
    return this.createCheckout(user, planId, { payerEmail: email });
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
      // Mercado Pago recomienda habilitar payments junto con los tópicos de Suscripciones.
      // Buscamos la factura por payment_id y aplicamos exactamente la misma ruta idempotente.
      const invoices = await this.provider.authorizedPaymentsByPaymentId(dataId);
      for (const invoice of invoices) {
        const subscription = await Subscription.findOne({ providerSubscriptionId: String(invoice.preapproval_id) });
        if (subscription) await this.applyAuthorizedPayment(subscription, invoice);
      }
    }
    return { received: true };
  }
}

export const platformMercadoPagoService = new PlatformMercadoPagoService();
export const subscriptionService = new SubscriptionService({ provider: platformMercadoPagoService });
subscriptionSupportService.setSubscriptionService(subscriptionService);
