import crypto from 'node:crypto';
import { config } from '../config.js';
import { domainService } from './DomainService.js';
import { mercadoPagoAccountService } from './MercadoPagoAccountService.js';

function failure(message, status = 400, code = 'PAYMENT_ERROR') {
  return Object.assign(new Error(message), { status, statusCode: status, code });
}

/** Checkout Pro via Preferences API. Nunca se confía en el retorno del navegador. */
export class MercadoPagoService {
  constructor({ fetchImpl = globalThis.fetch, accounts = mercadoPagoAccountService } = {}) { this.fetch = fetchImpl; this.accounts = accounts; }

  credentials(store, accountId) {
    try { return this.accounts.credentials(store, accountId); }
    catch (error) { throw failure(error.message, error.status || 422, error.code || 'MERCADOPAGO_NOT_CONFIGURED'); }
  }

  async request(store, endpoint, { method = 'GET', body, idempotencyKey, accountId } = {}) {
    const { accessToken } = this.credentials(store, accountId);
    const response = await this.fetch(`https://api.mercadopago.com${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    }).catch(() => { throw failure('Mercado Pago no respondió. Intentá nuevamente en unos instantes.', 502, 'PAYMENT_PROVIDER_UNAVAILABLE'); });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw failure(response.status === 401 || response.status === 403 ? 'Las credenciales de Mercado Pago no son válidas.' : 'Mercado Pago no pudo completar la operación. Revisá la configuración e intentá nuevamente.', 502, 'PAYMENT_PROVIDER_ERROR');
    }
    return payload;
  }

  async createPreference(store, order, token, accountId = order?.payment?.mercadoPagoAccountId) {
    const account = this.credentials(store, accountId);
    const baseUrl = domainService.publicUrl(store).replace(/\/$/, '');
    const webhookBaseUrl = String(config.appUrl || '').replace(/\/$/, '');
    if (!baseUrl.startsWith('https://') || !webhookBaseUrl.startsWith('https://')) throw failure('Mercado Pago requiere APP_URL con HTTPS y acceso público para recibir pagos.', 422, 'HTTPS_REQUIRED');
    const returnUrl = `${baseUrl}/pedido/${order._id}?token=${encodeURIComponent(token)}`;
    const items = order.items.map(item => ({
      id: `${item.productId}${item.variantId ? `:${item.variantId}` : ''}`,
      title: `${item.name}${item.variantName ? ` · ${item.variantName}` : ''}`.slice(0, 250),
      quantity: item.quantity,
      unit_price: item.unitPrice,
      currency_id: 'ARS',
    }));
    if (order.deliveryCost > 0) items.push({ id: 'delivery', title: order.delivery.name, quantity: 1, unit_price: order.deliveryCost, currency_id: 'ARS' });
    const body = {
      items,
      payer: { name: order.customer.name, email: order.customer.email },
      external_reference: String(order._id),
      metadata: { store_id: String(store._id), order_id: String(order._id), mercado_pago_account_id: account.id },
      back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
      auto_return: 'approved',
      notification_url: `${webhookBaseUrl}/api/webhooks/mercadopago/${store._id}/${encodeURIComponent(account.id)}?source_news=webhooks`,
      binary_mode: true,
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(order.reservationExpiresAt).toISOString(),
    };
    const preference = await this.request(store, '/checkout/preferences', { method: 'POST', body, idempotencyKey: String(order._id), accountId: account.id });
    const checkoutUrl = account.sandbox ? preference.sandbox_init_point : preference.init_point;
    if (!preference.id || !checkoutUrl || !/^https:\/\//.test(checkoutUrl)) throw failure('Mercado Pago no devolvió una pasarela válida.', 502);
    return { preferenceId: String(preference.id), checkoutUrl, collectorId: String(preference.collector_id) };
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

  webhookCredentials(store, request, accountId = '') {
    const dataId = request.query?.['data.id'];
    if (accountId) {
      const credentials = this.credentials(store, accountId);
      if (!this.verifySignature({ signature: request.headers['x-signature'], requestId: request.headers['x-request-id'], dataId }, credentials.webhookSecret)) throw failure('Firma de notificación inválida.', 401, 'INVALID_WEBHOOK_SIGNATURE');
      return credentials;
    }
    const matches = [];
    for (const item of this.accounts.safeAccounts(store)) {
      try {
        const credentials = this.credentials(store, item.id);
        if (this.verifySignature({ signature: request.headers['x-signature'], requestId: request.headers['x-request-id'], dataId }, credentials.webhookSecret)) matches.push(credentials);
      } catch { /* cuenta incompleta */ }
    }
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw failure('La notificación no identifica de forma unívoca la cuenta de Mercado Pago.', 409, 'AMBIGUOUS_WEBHOOK_ACCOUNT');
    // Compatibilidad con el formato anterior a múltiples cuentas. Una tienda ya
    // migrada con varias cuentas no puede inferirse por la URL vieja.
    try {
      const legacy = this.credentials(store, '');
      if (this.verifySignature({ signature: request.headers['x-signature'], requestId: request.headers['x-request-id'], dataId }, legacy.webhookSecret)) return legacy;
    } catch { /* no hay una cuenta única/legada que pueda inferirse */ }
    throw failure('Firma de notificación inválida o cuenta de Mercado Pago no identificada.', 401, 'INVALID_WEBHOOK_SIGNATURE');
  }

  async payment(store, paymentId, accountId) {
    if (!/^\d{1,30}$/.test(String(paymentId))) throw failure('Identificador de pago inválido.', 400, 'INVALID_PAYMENT_ID');
    return this.request(store, `/v1/payments/${encodeURIComponent(paymentId)}`, { accountId });
  }

  async findPayments(store, orderId, accountId) {
    const result = await this.request(store, `/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=20`, { accountId });
    return Array.isArray(result.results) ? result.results : [];
  }
}

export const mercadoPagoService = new MercadoPagoService();
