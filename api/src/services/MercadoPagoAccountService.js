import crypto from 'node:crypto';
import { Order } from '../models/commerce.js';
import { Store } from '../models/index.js';
import { AppError } from '../middleware/core.js';
import { decryptSecret, encryptSecret } from '../utils/crypto.js';

const asPlain = value => value?.toObject ? value.toObject() : { ...(value || {}) };
const accountError = (message, code = 'MP_ACCOUNT_INVALID', status = 422) => new AppError(message, status, code);

/**
 * Administra las cuentas Checkout Pro de una tienda.
 * Las credenciales permanecen cifradas; hacia el frontend sólo se exponen flags.
 */
export class MercadoPagoAccountService {
  records(store) { return Array.from(store?.integrations?.mercadopago?.accounts || []); }

  safeAccounts(store) {
    return this.records(store).map(record => {
      const item = asPlain(record);
      return {
        id: String(item.id || ''),
        name: String(item.name || 'Cuenta de Mercado Pago'),
        sandbox: item.sandbox === true,
        hasAccessToken: Boolean(item.accessToken),
        hasWebhookSecret: Boolean(item.webhookSecret),
      };
    }).filter(item => item.id);
  }

  record(store, accountId, { allowSingle = true } = {}) {
    const id = String(accountId || '').trim();
    const rows = this.records(store);
    if (id) return rows.find(row => String(row.id) === id) || null;
    if (allowSingle && rows.length === 1) return rows[0];
    return null;
  }

  credentials(store, accountId, { allowSingle = true } = {}) {
    const record = this.record(store, accountId, { allowSingle });
    if (record) {
      const accessToken = record.accessToken ? decryptSecret(record.accessToken) : '';
      const webhookSecret = record.webhookSecret ? decryptSecret(record.webhookSecret) : '';
      if (!accessToken || !webhookSecret) throw accountError('La cuenta de Mercado Pago seleccionada no está completamente configurada.', 'MERCADOPAGO_NOT_CONFIGURED');
      return { id: String(record.id), name: String(record.name || ''), accessToken, webhookSecret, sandbox: record.sandbox === true };
    }
    // Compatibilidad durante el arranque/migración desde v1.22 y anteriores.
    const legacy = store?.integrations?.mercadopago || {};
    const accessToken = legacy.accessToken ? decryptSecret(legacy.accessToken) : '';
    const webhookSecret = legacy.webhookSecret ? decryptSecret(legacy.webhookSecret) : '';
    if ((!accountId || accountId === 'mp-default') && accessToken && webhookSecret) return { id: 'mp-default', name: 'Cuenta principal', accessToken, webhookSecret, sandbox: legacy.sandbox === true };
    throw accountError('Seleccioná una cuenta de Mercado Pago configurada.', 'MERCADOPAGO_ACCOUNT_REQUIRED');
  }

  configured(store, accountId) {
    try { this.credentials(store, accountId); return true; } catch { return false; }
  }

  async create(store, input) {
    if (this.records(store).length >= 20) throw accountError('Alcanzaste el máximo técnico de cuentas de Mercado Pago para esta tienda.', 'MP_ACCOUNT_LIMIT');
    const id = `mp-${crypto.randomUUID()}`;
    const name = String(input.name || '').trim();
    if (!name) throw accountError('Ingresá un nombre para identificar la cuenta.');
    store.integrations ||= {};
    store.integrations.mercadopago ||= {};
    store.integrations.mercadopago.accounts ||= [];
    store.integrations.mercadopago.accounts.push({ id, name, accessToken: input.accessToken ? encryptSecret(input.accessToken) : '', webhookSecret: input.webhookSecret ? encryptSecret(input.webhookSecret) : '', sandbox: input.sandbox === true });
    await store.save();
    return this.safeAccounts(store).find(item => item.id === id);
  }

  async update(store, accountId, input) {
    const record = this.record(store, accountId, { allowSingle: false });
    if (!record) throw accountError('La cuenta de Mercado Pago no existe.', 'MP_ACCOUNT_NOT_FOUND', 404);
    if (input.clearCredentials) { record.accessToken = ''; record.webhookSecret = ''; }
    if (Object.hasOwn(input, 'name')) {
      const name = String(input.name || '').trim();
      if (!name) throw accountError('Ingresá un nombre para identificar la cuenta.');
      record.name = name;
    }
    if (input.accessToken) record.accessToken = encryptSecret(input.accessToken);
    if (input.webhookSecret) record.webhookSecret = encryptSecret(input.webhookSecret);
    if (Object.hasOwn(input, 'sandbox')) record.sandbox = input.sandbox === true;
    await store.save();
    return this.safeAccounts(store).find(item => item.id === String(accountId));
  }

  async remove(store, accountId) {
    const record = this.record(store, accountId, { allowSingle: false });
    if (!record) throw accountError('La cuenta de Mercado Pago no existe.', 'MP_ACCOUNT_NOT_FOUND', 404);
    if ((store.payments || []).some(payment => payment.type === 'mercadopago' && String(payment.mercadoPagoAccountId || '') === String(accountId))) {
      throw accountError('Esta cuenta está asociada a una forma de pago. Cambiá o eliminá esa forma de pago antes de quitar la cuenta.', 'MP_ACCOUNT_IN_USE', 409);
    }
    const relatedOrders = await Order.countDocuments({ storeId: store._id, 'payment.type': 'mercadopago', 'payment.mercadoPagoAccountId': String(accountId) });
    if (relatedOrders) throw accountError('Esta cuenta tiene pedidos asociados y debe conservarse para poder verificar pagos, reembolsos o contracargos históricos.', 'MP_ACCOUNT_HAS_ORDERS', 409);
    store.integrations.mercadopago.accounts = this.records(store).filter(item => String(item.id) !== String(accountId));
    await store.save();
    return { removed: true };
  }

  async applyLegacyPayload(store, payload) {
    if (!payload) return;
    store.integrations ||= {};
    store.integrations.mercadopago ||= {};
    let record = this.record(store, 'mp-default', { allowSingle: false }) || this.records(store)[0];
    if (!record && !payload.clearCredentials) {
      store.integrations.mercadopago.accounts.push({ id: 'mp-default', name: 'Cuenta principal', sandbox: payload.sandbox !== false });
      record = this.record(store, 'mp-default', { allowSingle: false });
    }
    if (!record) return;
    if (payload.clearCredentials) { record.accessToken = ''; record.webhookSecret = ''; }
    if (payload.accessToken) record.accessToken = encryptSecret(payload.accessToken);
    if (payload.webhookSecret) record.webhookSecret = encryptSecret(payload.webhookSecret);
    if (payload.sandbox !== undefined) record.sandbox = payload.sandbox === true;
    for (const payment of store.payments || []) if (payment.type === 'mercadopago' && !payment.mercadoPagoAccountId) payment.mercadoPagoAccountId = String(record.id);
  }

  async initializeLegacyStores() {
    const stores = await Store.find({ $or: [
      { 'integrations.mercadopago.accessToken': { $exists: true, $ne: '' } },
      { 'integrations.mercadopago.webhookSecret': { $exists: true, $ne: '' } },
      { 'payments.type': 'mercadopago' },
    ] }).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret +integrations.mercadopago.accounts.accessToken +integrations.mercadopago.accounts.webhookSecret');
    for (const store of stores) {
      store.integrations ||= {};
      store.integrations.mercadopago ||= {};
      const mp = store.integrations.mercadopago;
      if (!this.records(store).length && (mp.accessToken || mp.webhookSecret)) {
        mp.accounts = [{ id: 'mp-default', name: 'Cuenta principal', accessToken: mp.accessToken || '', webhookSecret: mp.webhookSecret || '', sandbox: mp.sandbox === true }];
      }
      const first = this.records(store)[0];
      if (first) for (const payment of store.payments || []) if (payment.type === 'mercadopago' && !payment.mercadoPagoAccountId) payment.mercadoPagoAccountId = String(first.id);
      mp.accessToken = ''; mp.webhookSecret = '';
      await store.save();
    }
  }
}

export const mercadoPagoAccountService = new MercadoPagoAccountService();
