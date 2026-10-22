import crypto from 'node:crypto';
import { config } from '../config.js';
import { decryptSecret } from '../utils/crypto.js';
import { domainService } from './DomainService.js';

function failure(message, status = 400, code = 'PAYMENT_ERROR') {
  return Object.assign(new Error(message), { status, statusCode: status, code });
}

/** Checkout Pro via Preferences API. Nunca se confía en el retorno del navegador. */
export class MercadoPagoService {
  constructor({ fetchImpl = globalThis.fetch } = {}) { this.fetch = fetchImpl; }

  credentials(store) {
    const mp = store.integrations?.mercadopago || {};
    const accessToken = mp.accessToken ? decryptSecret(mp.accessToken) : '';
    const webhookSecret = mp.webhookSecret ? decryptSecret(mp.webhookSecret) : '';
    if (!accessToken || !webhookSecret) throw failure('Completá el Access Token y la clave secreta de Webhooks de Mercado Pago.', 422, 'MERCADOPAGO_NOT_CONFIGURED');
    return { accessToken, webhookSecret, sandbox: mp.sandbox === true };
  }

  async request(store, endpoint, { method = 'GET', body, idempotencyKey } = {}) {
    const { accessToken } = this.credentials(store);
    const response = await this.fetch(`https://api.mercadopago.com${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    }).catch(() => { throw failure('Mercado Pago no respondió. Intentá nuevamente en unos instantes.', 502, 'PAYMENT_PROVIDER_UNAVAILABLE'); });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Nunca devolver a usuarios el cuerpo remoto: puede contener datos sensibles.
      throw failure(response.status === 401 || response.status === 403 ? 'Las credenciales de Mercado Pago no son válidas.' : 'Mercado Pago no pudo completar la operación. Revisá la configuración e intentá nuevamente.', 502, 'PAYMENT_PROVIDER_ERROR');
    }
    return payload;
  }

  async createPreference(store, order, token) {
    const baseUrl = domainService.publicUrl(store).replace(/\/$/, '');
    const webhookBaseUrl = String(config.appUrl || '').replace(/\/$/, '');
    if (!baseUrl.startsWith('https://') || !webhookBaseUrl.startsWith('https://')) throw failure('Mercado Pago requiere APP_URL con HTTPS y acceso público para recibir pagos.', 422, 'HTTPS_REQUIRED');
    const { sandbox } = this.credentials(store);
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
      metadata: { store_id: String(store._id), order_id: String(order._id) },
      back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
      auto_return: 'approved',
      notification_url: `${webhookBaseUrl}/api/webhooks/mercadopago/${store._id}?source_news=webhooks`,
      binary_mode: true,
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(order.reservationExpiresAt).toISOString(),
    };
    const preference = await this.request(store, '/checkout/preferences', { method: 'POST', body, idempotencyKey: String(order._id) });
    const checkoutUrl = sandbox ? preference.sandbox_init_point : preference.init_point;
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
    // Replay is harmless: order transition + effect jobs are idempotent. No short
    // timestamp window, because provider redelivery may legitimately arrive late.
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  async payment(store, paymentId) {
    if (!/^\d{1,30}$/.test(String(paymentId))) throw failure('Identificador de pago inválido.', 400, 'INVALID_PAYMENT_ID');
    return this.request(store, `/v1/payments/${encodeURIComponent(paymentId)}`);
  }

  async findPayments(store, orderId) {
    const result = await this.request(store, `/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=20`);
    return Array.isArray(result.results) ? result.results : [];
  }
}
