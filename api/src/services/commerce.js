import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { config } from '../config.js';
import { Store, Product, Category, User } from '../models/index.js';
import { Order, StockMovement, MailJob } from '../models/commerce.js';
import { EntitlementService, MailService, AuditService } from './core.js';
import { termsService } from './TermsService.js';
import { defaultDesign, normalizeDesign } from '../../../client/src/services/design.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { MercadoPagoService } from './MercadoPagoService.js';
import { categoryService } from './CategoryService.js';
import { r2Storage } from './R2StorageService.js';
import { storageCleanupService } from './StorageCleanupService.js';
import { domainService } from './DomainService.js';

export const FINAL_STATUSES = Object.freeze(['paid', 'cancelled']);
const ACTIVE_STATUSES = ['pending', 'awaiting_payment', 'processing'];
const ALL_VISIBLE_STATUSES = [...ACTIVE_STATUSES, ...FINAL_STATUSES];
const MAX_STOCK = 100000000;
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const regexText = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const same = (a, b) => String(a || '') === String(b || '');
const plain = value => value?.toObject ? value.toObject() : value;

export function commerceError(message, status = 400, code = 'VALIDATION_ERROR', details) {
  return Object.assign(new Error(message), { status, statusCode: status, code, ...(details ? { details } : {}) });
}
export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1000000000) throw commerceError('El importe es inválido.');
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function cents(value) { return Math.round(money(value) * 100); }
function id(value, label = 'Identificador') {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw commerceError(`${label} inválido.`);
  return value;
}
function text(value, label, { required = false, max = 300 } = {}) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw commerceError(`${label} inválido.`);
  const result = value.trim();
  if ((required && !result) || result.length > max) throw commerceError(`Revisá ${label.toLowerCase()} (máximo ${max} caracteres).`);
  return result;
}
function email(value) {
  const result = text(value, 'Correo electrónico', { required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw commerceError('Ingresá un correo electrónico válido.');
  return result;
}
function stockNumber(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_STOCK) throw commerceError('El stock debe ser un número entero entre 0 y 100.000.000.');
  return value;
}
export function pagination(query = {}) {
  const page = Math.max(1, Math.min(100000, parseInt(query.page, 10) || 1));
  const limit = Math.max(1, Math.min(500, parseInt(query.limit, 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

export function safeProduct(product) {
  const p = plain(product);
  return {
    _id: p._id, storeId: p.storeId, name: p.name, description: p.description,
    categoryId: p.categoryId, type: p.type, images: p.images || [], price: p.price,
    previousPrice: p.previousPrice, active: p.active, featured: p.featured === true, madeToOrder: p.madeToOrder,
    stock: p.stock, createdAt: p.createdAt, relatedProductIds: p.relatedProductIds || [],
    variants: (p.variants || []).map(v => ({ id: v.id, name: v.name, sku: v.sku, stock: v.stock, price: v.price, attributes: v.attributes })),
  };
}
export function safePublicStore(store) {
  const s = plain(store);
  const design = normalizeDesign(s.design || {});
  if (!design.terms.enabled) design.terms = structuredClone(defaultDesign.terms);
  return {
    _id: s._id, name: s.name, slug: s.slug, description: s.description, design,
    contact: s.contact || {},
    payments: (s.payments || []).filter(p => p.active).map(p => ({ id: p.id, type: p.type, name: p.name, instructions: p.instructions, deliveryIds: p.deliveryIds || [], active: true })),
    deliveries: (s.deliveries || []).filter(d => d.active).map(d => ({ id: d.id, type: d.type, name: d.name, description: d.description, price: d.price, active: true })),
  };
}
export function safeOrder(order, { publicView = false } = {}) {
  const o = plain(order);
  const result = {
    _id: o._id, storeId: o.storeId, number: o.number, customer: o.customer,
    items: o.items.map(item => ({ productId: item.productId, variantId: item.variantId, name: item.name, variantName: item.variantName, type: item.type, image: item.image, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })),
    subtotal: o.subtotal, deliveryCost: o.deliveryCost, total: o.total, currency: o.currency,
    payment: o.payment, delivery: o.delivery, status: o.status, isFinal: FINAL_STATUSES.includes(o.status),
    fulfillmentStatus: o.fulfillmentStatus, createdAt: o.createdAt, updatedAt: o.updatedAt,
    paidAt: o.paidAt, cancelledAt: o.cancelledAt,
    reservationExpiresAt: o.reservationExpiresAt,
    termsAcceptance: o.termsAcceptance ? { required: o.termsAcceptance.required, accepted: o.termsAcceptance.accepted, source: o.termsAcceptance.source, acceptedAt: o.termsAcceptance.acceptedAt, contentHash: o.termsAcceptance.contentHash, title: o.termsAcceptance.snapshot?.title, url: o.termsAcceptance.snapshot?.url } : undefined,
    receipt: o.receipt?.uploadedAt ? { name: o.receipt.name, mimeType: o.receipt.mimeType, uploadedAt: o.receipt.uploadedAt } : null,
    digitalDeliveryStatus: o.digitalDeliveryStatus, digitalDeliveredAt: o.digitalDeliveredAt,
    checkoutUrl: !FINAL_STATUSES.includes(o.status) ? o.checkoutUrl : undefined,
  };
  if (!publicView) Object.assign(result, { history: o.history || [], paymentId: o.paymentId, paymentProviderStatus: o.paymentProviderStatus, paymentIssue: o.paymentIssue, digitalDeliveryError: o.digitalDeliveryError });
  return result;
}

async function audit({ entity = 'order', ...entry }) { return AuditService.log({ ...entry, entity }); }
async function movement(values) {
  await StockMovement.updateOne({ operationId: values.operationId }, { $setOnInsert: values }, { upsert: true });
}

/** Verifica la vigencia y el cupo efectivo en cada acceso público. Un cambio de
 * plan o el regreso a prueba no depende de que un proceso haya despublicado
 * físicamente las tiendas excedentes: sólo las primeras del cupo pueden vender. */
export async function assertPublicStoreAllowed(store, { status = 404 } = {}) {
  const unavailable = () => commerceError('Esta tienda no está disponible por el momento.', status, 'STORE_UNAVAILABLE');
  if (!store || !store.active || store.archived) throw unavailable();
  const owner = await User.findById(store.ownerId);
  const entitlement = owner?.active ? await EntitlementService.forUser(owner) : null;
  if (!entitlement?.allowed) throw unavailable();
  const admitted = await Store.find({ ownerId: owner._id, active: true, archived: { $ne: true } })
    .sort({ createdAt: 1, _id: 1 }).limit(Math.max(1, entitlement.maxStores)).select('_id').lean();
  if (!admitted.some(item => same(item._id, store._id))) throw unavailable();
  return entitlement;
}

export class CatalogService {
  async storeBySlug(slug, { allowInactive = false } = {}) {
    if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug)) throw commerceError('La tienda no existe.', 404, 'STORE_NOT_FOUND');
    const store = await Store.findOne({ slug, archived: { $ne: true } }).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret');
    if (!store || (!allowInactive && !store.active)) throw commerceError('Esta tienda no está disponible por el momento.', 404, 'STORE_UNAVAILABLE');
    if (!allowInactive) await assertPublicStoreAllowed(store);
    return store;
  }

  async catalog(slug, query = {}) {
    const store = await this.storeBySlug(slug);
    const available = { storeId: store._id, active: true, archived: { $ne: true } };
    const filter = { ...available, ...await categoryService.productFilter(store._id, query) };
    if (typeof query.search === 'string' && query.search.trim()) filter.name = new RegExp(regexText(query.search.trim().slice(0, 100)), 'i');
    const { page, limit, skip } = pagination({ ...query, limit: query.limit || 500 });
    const sort = ({ price_asc: { price: 1, _id: 1 }, price_desc: { price: -1, _id: 1 }, name: { name: 1, _id: 1 } })[query.sort] || { createdAt: -1, _id: -1 };
    const [categoryRows, products, total, featuredProducts] = await Promise.all([
      Category.find({ storeId: store._id, active: true, archived: { $ne: true } }).sort({ name: 1, _id: 1 }).select('name description active parentId').lean(),
      Product.find(filter).sort(sort).skip(skip).limit(limit).lean(), Product.countDocuments(filter),
      Product.find({ ...available, featured: true }).sort({ createdAt: -1, _id: -1 }).limit(12).lean(),
    ]);
    const categories = categoryService.visibleCategories(categoryRows).map(category => ({ ...category, parentId: category.parentId || null }));
    return { store: safePublicStore(store), categories, products: products.map(safeProduct), featuredProducts: featuredProducts.map(safeProduct), meta: { total, page, limit } };
  }

  async product(slug, productId) {
    const store = await this.storeBySlug(slug);
    const product = await Product.findOne({ _id: id(productId), storeId: store._id, active: true, archived: { $ne: true } }).lean();
    if (!product) throw commerceError('El producto no está disponible.', 404, 'PRODUCT_NOT_FOUND');
    const related = await Product.find({ _id: { $in: product.relatedProductIds || [] }, storeId: store._id, active: true, archived: { $ne: true } }).limit(24).lean();
    const recommendations = await this.recommend(store, [productId]);
    return { product: safeProduct(product), related: related.map(safeProduct), recommendations };
  }

  async recommend(store, productIds = []) {
    if (!Array.isArray(productIds) || productIds.length > 100) throw commerceError('Selección de productos inválida.');
    const ids = [...new Set(productIds.map(value => id(value)))].map(value => new mongoose.Types.ObjectId(value));
    if (!ids.length) return [];
    const associations = await Order.aggregate([
      { $match: { storeId: store._id, status: 'paid', 'items.productId': { $in: ids } } },
      { $unwind: '$items' },
      { $match: { 'items.productId': { $nin: ids } } },
      { $group: { _id: '$items.productId', count: { $sum: '$items.quantity' } } },
      { $sort: { count: -1 } }, { $limit: 24 },
    ]);
    const byPurchase = associations.map(a => String(a._id));
    const selected = await Product.find({ _id: { $in: ids }, storeId: store._id }).select('relatedProductIds categoryId').lean();
    const relatedIds = selected.flatMap(p => p.relatedProductIds || []).map(String);
    const candidates = [...new Set([...byPurchase, ...relatedIds])].filter(value => !ids.some(i => same(i, value)));
    let results = await Product.find({ _id: { $in: candidates }, storeId: store._id, active: true, archived: { $ne: true } }).lean();
    results.sort((a, b) => candidates.indexOf(String(a._id)) - candidates.indexOf(String(b._id)));
    if (results.length < 6) {
      const categories = selected.map(p => p.categoryId).filter(Boolean);
      const fallback = await Product.find({ storeId: store._id, active: true, archived: { $ne: true }, _id: { $nin: [...ids, ...results.map(p => p._id)] }, ...(categories.length ? { categoryId: { $in: categories } } : {}) }).sort({ createdAt: -1 }).limit(6 - results.length).lean();
      results = [...results, ...fallback];
    }
    return results.slice(0, 6).map(safeProduct);
  }

  async contact(slug, input) {
    const store = await this.storeBySlug(slug);
    if (!store.contact?.showContactForm || !store.contact?.email) throw commerceError('La tienda no habilitó el formulario de contacto.', 404);
    if (input.website) return { message: 'Recibimos tu consulta.' };
    const name = text(input.name, 'Nombre', { required: true, max: 150 });
    const from = email(input.email);
    const message = text(input.message, 'Mensaje', { required: true, max: 3000 });
    await MailService.send({ to: store.contact.email, subject: `Consulta en ${store.name}`.slice(0, 200), replyTo: from, text: `Nombre: ${name}\nCorreo: ${from}\n\n${message}`, html: `<h2>Consulta en ${escapeHtml(store.name)}</h2><p>${escapeHtml(name)} · ${escapeHtml(from)}</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>` });
    return { message: 'Tu consulta fue enviada. La tienda te responderá por correo.' };
  }
}

export class InventoryService {
  async reserve(order, item, { allowInactive = false } = {}) {
    if (!item.trackedStock) return;
    const reservation = { orderId: order._id, variantId: item.variantId || '', quantity: item.quantity };
    const filter = { _id: item.productId, storeId: order.storeId, ...(allowInactive ? {} : { active: true }), archived: { $ne: true }, reservations: { $not: { $elemMatch: { orderId: order._id, variantId: item.variantId || '' } } } };
    const increment = { stockVersion: 1 };
    if (item.variantId) {
      filter.variants = { $elemMatch: { id: item.variantId, stock: { $gte: item.quantity } } };
      increment['variants.$.stock'] = -item.quantity;
    } else {
      filter.stock = { $gte: item.quantity };
      increment.stock = -item.quantity;
    }
    const before = await Product.findOneAndUpdate(filter, { $inc: increment, $push: { reservations: reservation } }, { returnDocument: 'before' });
    if (!before) {
      const existing = await Product.findOne({ _id: item.productId, reservations: { $elemMatch: { orderId: order._id, variantId: item.variantId || '' } } });
      if (existing) return;
      throw commerceError(`No hay stock suficiente de ${item.name}${item.variantName ? ` (${item.variantName})` : ''}. Actualizá el carrito.`, 409, 'INSUFFICIENT_STOCK');
    }
    const beforeStock = item.variantId ? before.variants.find(v => v.id === item.variantId).stock : before.stock;
    await movement({ operationId: `reserve:${order._id}:${item.productId}:${item.variantId}`, storeId: order.storeId, productId: item.productId, variantId: item.variantId, orderId: order._id, kind: 'reservation', before: beforeStock, after: beforeStock - item.quantity, delta: -item.quantity, reason: `Reserva ${order.number}` });
  }

  async release(order) {
    for (const item of order.items) {
      if (!item.trackedStock) continue;
      const match = { orderId: order._id, variantId: item.variantId || '' };
      const filter = { _id: item.productId, storeId: order.storeId, reservations: { $elemMatch: match } };
      const increment = { stockVersion: 1 };
      if (item.variantId) { filter['variants.id'] = item.variantId; increment['variants.$.stock'] = item.quantity; }
      else increment.stock = item.quantity;
      const before = await Product.findOneAndUpdate(filter, { $inc: increment, $pull: { reservations: match } }, { returnDocument: 'before' });
      if (before) {
        const old = item.variantId ? before.variants.find(v => v.id === item.variantId).stock : before.stock;
        await movement({ operationId: `release:${order._id}:${item.productId}:${item.variantId}`, storeId: order.storeId, productId: item.productId, variantId: item.variantId, orderId: order._id, kind: 'release', before: old, after: old + item.quantity, delta: item.quantity, reason: `Cancelación ${order.number}` });
      }
    }
  }

  async commit(order) {
    for (const item of order.items) {
      if (!item.trackedStock) continue;
      await movement({ operationId: `sale:${order._id}:${item.productId}:${item.variantId}`, storeId: order.storeId, productId: item.productId, variantId: item.variantId, orderId: order._id, kind: 'sale', delta: 0, reason: `Reserva confirmada en ${order.number}. El stock ya se descontó al reservar.` });
      await Product.updateOne({ _id: item.productId, storeId: order.storeId }, { $pull: { reservations: { orderId: order._id, variantId: item.variantId || '' } } });
    }
  }

  async setStock(storeId, input, actorId) {
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 500) throw commerceError('Enviá entre 1 y 500 cantidades de stock.');
    const reason = text(input.reason, 'Motivo del ajuste', { required: true, max: 300 });
    const keys = new Set();
    const items = input.items.map(item => {
      const value = { productId: id(item.productId), variantId: text(item.variantId, 'Variante', { max: 100 }), stock: stockNumber(item.stock), expectedStock: stockNumber(item.expectedStock) };
      const key = `${value.productId}:${value.variantId}`;
      if (keys.has(key)) throw commerceError('El mismo producto o variante aparece más de una vez.');
      keys.add(key); return value;
    });
    // Cada fila es una asignación atómica independiente. Los conflictos no
    // revierten ajustes correctos ni pisan una venta concurrente.
    const updated = [], conflicts = [], adjustments = [];
    for (const item of items) {
      const query = { _id: item.productId, storeId, archived: { $ne: true }, type: 'physical', madeToOrder: { $ne: true } };
      const update = { $inc: { stockVersion: 1 }, $set: {} };
      if (item.variantId) {
        query.variants = { $elemMatch: { id: item.variantId, stock: item.expectedStock } };
        update.$set['variants.$.stock'] = item.stock;
      } else { query.stock = item.expectedStock; query['variants.0'] = { $exists: false }; update.$set.stock = item.stock; }
      const product = await Product.findOneAndUpdate(query, update, { returnDocument: 'after' });
      if (!product) {
        const current = await Product.findOne({ _id: item.productId, storeId }).lean();
        const currentStock = item.variantId ? current?.variants?.find(v => v.id === item.variantId)?.stock : current?.stock;
        conflicts.push({ ...item, currentStock, message: 'La cantidad cambió o el producto no administra stock. Revisá el valor actualizado.' });
        continue;
      }
      await movement({ operationId: `adjust:${crypto.randomUUID()}`, storeId, productId: item.productId, variantId: item.variantId, actorId, kind: 'adjustment', before: item.expectedStock, after: item.stock, delta: item.stock - item.expectedStock, reason });
      updated.push({ ...item, stockVersion: product.stockVersion });
      adjustments.push({ productId: item.productId, productName: product.name, variantId: item.variantId, variantName: product.variants?.find(v => v.id === item.variantId)?.name || '', before: item.expectedStock, after: item.stock, delta: item.stock - item.expectedStock });
    }
    await audit({ actorId, storeId, action: 'stock.adjusted', entity: 'Product', details: { updated: updated.length, conflicts: conflicts.length, reason, adjustments, conflictDetails: conflicts.map(item => ({ productId: item.productId, variantId: item.variantId, currentStock: item.currentStock })) } });
    return { updated, conflicts };
  }
}

export class CommerceService {
  constructor({ inventory = new InventoryService(), mercadoPago = new MercadoPagoService() } = {}) {
    this.inventory = inventory;
    this.mercadoPago = mercadoPago;
  }

  normalizeInput(input) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) throw commerceError('El pedido debe contener entre 1 y 100 productos.');
    const customer = input.customer || {};
    const normalized = {
      customer: { name: text(customer.name, 'Nombre', { required: true, max: 150 }), email: email(customer.email), phone: text(customer.phone, 'Teléfono', { max: 50 }), address: text(customer.address, 'Dirección', { max: 300 }), city: text(customer.city, 'Localidad', { max: 120 }), postalCode: text(customer.postalCode, 'Código postal', { max: 30 }), notes: text(customer.notes, 'Notas', { max: 1500 }) },
      deliveryId: text(input.deliveryId, 'Entrega', { required: true, max: 100 }), paymentId: text(input.paymentId, 'Pago', { required: true, max: 100 }),
      idempotencyKey: text(input.idempotencyKey, 'Clave de pedido', { required: true, max: 160 }), items: [],
    };
    if (normalized.idempotencyKey.length < 16 || !/^[a-zA-Z0-9_-]+$/.test(normalized.idempotencyKey)) throw commerceError('La clave de pedido debe contener al menos 16 caracteres seguros.');
    const combined = new Map();
    for (const item of input.items) {
      const productId = id(item.productId, 'Producto'), variantId = text(item.variantId, 'Variante', { max: 100 });
      if (typeof item.quantity !== 'number' || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) throw commerceError('Las cantidades deben ser enteros entre 1 y 999.');
      const key = `${productId}:${variantId}`;
      const quantity = (combined.get(key)?.quantity || 0) + item.quantity;
      if (quantity > 999) throw commerceError('No se admiten más de 999 unidades de un producto por pedido.');
      combined.set(key, { productId, variantId, quantity });
    }
    normalized.items = [...combined.values()].sort((a, b) => `${a.productId}:${a.variantId}`.localeCompare(`${b.productId}:${b.variantId}`));
    return normalized;
  }

  token(orderId, key) {
    const secret = config.sessionSecret || config.encryptionKey;
    if (!secret) throw commerceError('El servidor no tiene configurada la clave de seguridad.', 503, 'SERVER_NOT_CONFIGURED');
    return crypto.createHmac('sha256', secret).update(`${orderId}:${key}`).digest('hex');
  }

  async createOrder(store, input, { actorId, manual = false } = {}) {
    const normalized = this.normalizeInput(input);
    const idempotencyHash = hash(normalized.idempotencyKey);
    const requestHash = hash(JSON.stringify({ ...normalized, idempotencyKey: undefined }));
    const existing = await Order.findOne({ storeId: store._id, idempotencyHash }).select('+requestHash');
    if (existing) return this.existingResponse(existing, normalized.idempotencyKey, requestHash);
    if (!manual) await assertPublicStoreAllowed(store, { status: 403 });
    // Idempotent replays above keep their original acceptance even if the shop
    // has since changed its terms or the browser no longer has the checkbox.
    const termsAcceptance = termsService.acceptance(store, input, { manual });
    const delivery = (store.deliveries || []).find(d => d.id === normalized.deliveryId && d.active);
    const payment = (store.payments || []).find(p => p.id === normalized.paymentId && p.active);
    if (!delivery || !payment) throw commerceError('Seleccioná una forma de entrega y un medio de pago disponibles.');
    if (payment.deliveryIds?.length && !payment.deliveryIds.includes(delivery.id)) throw commerceError('El medio de pago no está disponible para la entrega seleccionada.', 422, 'PAYMENT_DELIVERY_MISMATCH');
    const products = await Product.find({ _id: { $in: normalized.items.map(i => i.productId) }, storeId: store._id, archived: { $ne: true }, ...(manual ? {} : { active: true }) }).select('+digitalUrl');
    const snapshots = normalized.items.map(item => {
      const product = products.find(p => same(p._id, item.productId));
      if (!product) throw commerceError('Uno de los productos ya no está disponible. Actualizá el carrito.', 409, 'PRODUCT_UNAVAILABLE');
      const variant = item.variantId ? product.variants?.find(v => v.id === item.variantId) : null;
      if ((product.variants?.length && !variant) || (item.variantId && !variant)) throw commerceError(`Seleccioná una variante válida de ${product.name}.`);
      const unitPrice = money(variant?.price != null ? variant.price : product.price);
      if (product.type === 'digital' && !product.digitalUrl) throw commerceError(`El producto ${product.name} no tiene un enlace de entrega configurado.`, 409, 'DIGITAL_PRODUCT_NOT_CONFIGURED');
      return { productId: product._id, variantId: item.variantId, name: product.name, variantName: variant?.name || '', type: product.type, image: product.images?.[0] || '', quantity: item.quantity, unitPrice, lineTotal: (cents(unitPrice) * item.quantity) / 100, trackedStock: product.type === 'physical' && !product.madeToOrder, ...(product.type === 'digital' ? { digitalUrl: product.digitalUrl } : {}) };
    });
    const hasPhysical = snapshots.some(i => i.type === 'physical');
    if (hasPhysical && delivery.type === 'digital') throw commerceError('Los productos físicos necesitan retiro o envío.');
    if (['shipping', 'custom'].includes(delivery.type) && (!normalized.customer.address || !normalized.customer.city || !normalized.customer.postalCode)) throw commerceError('Completá dirección, localidad y código postal para la entrega.', 422, 'DELIVERY_ADDRESS_REQUIRED');
    if ((hasPhysical || store.design?.checkout?.requirePhone === true) && !normalized.customer.phone) throw commerceError('Ingresá un teléfono para completar el pedido.');
    const subtotalCents = snapshots.reduce((sum, i) => sum + cents(i.unitPrice) * i.quantity, 0);
    const deliveryCost = money(delivery.price || 0);
    const total = money((subtotalCents + cents(deliveryCost)) / 100);
    if (payment.type === 'mercadopago' && total <= 0) throw commerceError('Mercado Pago requiere un importe mayor a cero.');
    if (payment.type === 'mercadopago') this.mercadoPago.credentials(store);
    const orderId = new mongoose.Types.ObjectId();
    const token = this.token(orderId, normalized.idempotencyKey);
    const minutes = Math.max(15, Math.min(1440, Number(config.orderReservationMinutes) || 60));
    let order;
    try {
      order = await Order.create({
        _id: orderId, storeId: store._id, number: `MT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(orderId).slice(-12).toUpperCase()}`,
        customer: normalized.customer, termsAcceptance, items: snapshots, subtotal: subtotalCents / 100, deliveryCost, total,
        payment: { id: payment.id, type: payment.type, name: payment.name, instructions: payment.instructions || '', bank: payment.type === 'transfer' ? plain(payment.bank || {}) : undefined },
        delivery: { id: delivery.id, type: delivery.type, name: delivery.name, description: delivery.description || '', price: deliveryCost },
        idempotencyHash, requestHash, accessTokenHash: hash(token), accessTokenEncrypted: encryptSecret(token),
        digitalDeliveryStatus: snapshots.some(i => i.type === 'digital') ? 'pending' : 'not_applicable',
        reservationExpiresAt: payment.type === 'mercadopago' ? new Date(Date.now() + minutes * 60000) : undefined,
        history: [{ status: 'creating', actorId, note: manual ? 'Pedido creado desde administración.' : 'Pedido iniciado desde la tienda.' }],
      });
    } catch (error) {
      if (error.code === 11000) {
        const concurrent = await Order.findOne({ storeId: store._id, idempotencyHash }).select('+requestHash');
        if (concurrent) return this.existingResponse(concurrent, normalized.idempotencyKey, requestHash);
      }
      throw error;
    }
    try {
      for (const item of order.items) await this.inventory.reserve(order, item, { allowInactive: manual });
      let provider = {};
      if (payment.type === 'mercadopago') provider = await this.mercadoPago.createPreference(store, order, token);
      const status = payment.type === 'cash' ? 'pending' : 'awaiting_payment';
      const ready = await Order.findOneAndUpdate({ _id: order._id, status: 'creating' }, { $set: { ...provider, status }, $push: { history: { status, at: new Date(), actorId, note: 'Stock reservado. El pedido espera confirmación de pago.' } } }, { returnDocument: 'after' });
      if (!ready) throw commerceError('No fue posible completar el pedido. Volvé a intentarlo con un nuevo carrito.', 409, 'ORDER_CANCELLED');
      order = ready;
      await this.enqueue(order, 'confirmation');
      await audit({ actorId, actorType: manual ? undefined : 'customer', actor: manual ? undefined : { name: normalized.customer.name, email: normalized.customer.email }, storeId: store._id, store, action: 'order.created', entityId: order._id, entityName: order.number, details: { number: order.number, total, manual, status: order.status, termsAccepted: termsAcceptance.accepted, termsSource: termsAcceptance.source } });
      return { order: safeOrder(order, { publicView: !manual }), accessToken: token, ...(provider.checkoutUrl ? { checkoutUrl: provider.checkoutUrl } : {}) };
    } catch (error) {
      await Order.updateOne({ _id: order._id, status: 'creating' }, { $set: { status: 'cancelled', cancelledAt: new Date() }, $push: { history: { status: 'cancelled', at: new Date(), note: 'La creación no pudo completarse; se libera el stock reservado.' } } });
      const current = await Order.findById(order._id);
      if (current?.status === 'cancelled') await this.finalize(current);
      throw error;
    }
  }

  async existingResponse(order, key, requestHash) {
    if (order.requestHash !== requestHash) throw commerceError('Esta clave de pedido ya fue usada con otros datos.', 409, 'IDEMPOTENCY_CONFLICT');
    if (order.status === 'creating') throw commerceError('El pedido todavía se está preparando. Esperá unos segundos y volvé a intentar.', 409, 'ORDER_IN_PROGRESS');
    if (order.status === 'cancelled') throw commerceError('El intento anterior fue cancelado. Iniciá un nuevo pedido.', 409, 'ORDER_ALREADY_CANCELLED');
    return { order: safeOrder(order, { publicView: true }), accessToken: this.token(order._id, key), ...(order.checkoutUrl && !FINAL_STATUSES.includes(order.status) ? { checkoutUrl: order.checkoutUrl } : {}) };
  }

  async getOrder(storeId, orderId, select = '') {
    const order = await Order.findOne({ _id: id(orderId, 'Pedido'), storeId }).select(select);
    if (!order) throw commerceError('El pedido no existe.', 404, 'ORDER_NOT_FOUND');
    return order;
  }

  async publicOrder(orderId, token) {
    id(orderId, 'Pedido');
    if (typeof token !== 'string' || !/^[a-f\d]{64}$/i.test(token)) throw commerceError('El enlace del pedido no es válido.', 404, 'ORDER_NOT_FOUND');
    const order = await Order.findOne({ _id: orderId, accessTokenHash: hash(token) });
    if (!order || order.status === 'creating') throw commerceError('El pedido no está disponible.', 404, 'ORDER_NOT_FOUND');
    return order;
  }

  async listOrders(storeId, query = {}) {
    const filter = { storeId, status: { $ne: 'creating' } };
    if (query.status && ALL_VISIBLE_STATUSES.includes(query.status)) filter.status = query.status;
    if (typeof query.search === 'string' && query.search.trim()) {
      const search = new RegExp(regexText(query.search.trim().slice(0, 100)), 'i');
      filter.$or = [{ number: search }, { 'customer.name': search }, { 'customer.email': search }];
    }
    const { page, limit, skip } = pagination(query);
    const [orders, total] = await Promise.all([Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), Order.countDocuments(filter)]);
    return { data: orders.map(order => safeOrder(order)), meta: { page, limit, total } };
  }

  async changeStatus(storeId, orderId, input, actorId, { verifiedPayment = false } = {}) {
    if (!ALL_VISIBLE_STATUSES.includes(input.status)) throw commerceError('El estado seleccionado no es válido.');
    const note = text(input.note, 'Nota', { max: 1500 });
    let order = await this.getOrder(storeId, orderId);
    if (order.status === input.status) {
      if (FINAL_STATUSES.includes(order.status)) await this.finalize(order);
      return safeOrder(order);
    }
    if (FINAL_STATUSES.includes(order.status)) throw commerceError('Este pedido está en un estado final y no puede modificarse. Podés gestionar su entrega por separado.', 409, 'FINAL_ORDER');
    if (order.status === 'creating') throw commerceError('El pedido aún está en preparación.', 409, 'ORDER_IN_PROGRESS');
    if (FINAL_STATUSES.includes(input.status) && input.confirmFinal !== true) throw commerceError('Confirmá la acción: el estado seleccionado es final y no puede revertirse.', 409, 'CONFIRM_FINAL_REQUIRED');
    // Un admin puede registrar un cobro manual, pero no suplanta un cobro MP.
    if (input.status === 'paid' && order.payment.type === 'mercadopago' && !verifiedPayment) throw commerceError('El pago de Mercado Pago debe verificarse con el proveedor. Usá «Verificar pago».', 422, 'PAYMENT_VERIFICATION_REQUIRED');
    const before = order.toObject();
    const set = { status: input.status };
    if (input.status === 'paid') set.paidAt = new Date();
    if (input.status === 'cancelled') set.cancelledAt = new Date();
    const changed = await Order.findOneAndUpdate({ _id: order._id, status: order.status }, { $set: set, $push: { history: { status: input.status, at: new Date(), note: note || (verifiedPayment ? 'Pago verificado por Mercado Pago.' : 'Cambio manual de estado.'), actorId } } }, { returnDocument: 'after' });
    if (!changed) throw commerceError('El pedido cambió en otra sesión. Actualizá la página.', 409, 'ORDER_CONFLICT');
    order = changed;
    if (FINAL_STATUSES.includes(order.status)) await this.finalize(order);
    await audit({ actorId, storeId, action: `order.${input.status}`, entityId: order._id, actorType: verifiedPayment ? 'integration' : actorId ? undefined : 'system', entityName: order.number, details: { number: order.number, verifiedPayment, note, changes: AuditService.changes(before, order, ['status', 'paidAt', 'cancelledAt']) } });
    return safeOrder(order);
  }

  async fulfillment(storeId, orderId, input, actorId) {
    if (!['unfulfilled', 'preparing', 'shipped', 'delivered'].includes(input.fulfillmentStatus)) throw commerceError('El estado de entrega no es válido.');
    const note = text(input.note, 'Nota', { max: 1500 });
    const order = await this.getOrder(storeId, orderId);
    if (order.status === 'cancelled') throw commerceError('No puede enviarse un pedido cancelado.', 409);
    if (['shipped', 'delivered'].includes(input.fulfillmentStatus) && order.status !== 'paid') throw commerceError('Confirmá el cobro antes de marcar el pedido como enviado o entregado.', 409);
    const updated = await Order.findOneAndUpdate({ _id: order._id, status: order.status, fulfillmentStatus: order.fulfillmentStatus }, { $set: { fulfillmentStatus: input.fulfillmentStatus }, $push: { history: { status: `delivery:${input.fulfillmentStatus}`, actorId, note, at: new Date() } } }, { returnDocument: 'after' });
    if (!updated) throw commerceError('El pedido cambió en otra sesión. Actualizá la página.', 409);
    await audit({ actorId, storeId, action: 'order.fulfillment', entityId: order._id, entityName: order.number, details: { note, changes: AuditService.changes(order, updated, ['fulfillmentStatus']) } });
    return safeOrder(updated);
  }

  async enqueue(order, kind) {
    if (kind === 'digital' && !order.items.some(item => item.type === 'digital')) return;
    await MailJob.updateOne({ key: `${kind}:${order._id}` }, { $setOnInsert: { key: `${kind}:${order._id}`, orderId: order._id, kind, state: 'pending', availableAt: new Date() } }, { upsert: true });
  }

  async finalize(order) {
    // Persistir el estado final antes del efecto permite que el worker repare
    // un proceso detenido. Cada mutación de stock y clave outbox es idempotente.
    if (order.status === 'paid') { await this.inventory.commit(order); await this.enqueue(order, 'digital'); }
    else if (order.status === 'cancelled') await this.inventory.release(order);
    else return;
    await Order.updateOne({ _id: order._id }, { $set: { finalEffectsAt: new Date() } });
  }

  async reconcilePayment(store, order, payment) {
    if (!same(payment.external_reference, order._id) || !same(payment.metadata?.store_id, store._id) || !same(payment.metadata?.order_id, order._id)) throw commerceError('El pago no corresponde a este pedido.', 422, 'PAYMENT_MISMATCH');
    if (order.payment.type !== 'mercadopago' || (order.collectorId && !same(payment.collector_id, order.collectorId))) throw commerceError('El destinatario del pago no coincide.', 422, 'PAYMENT_MISMATCH');
    const providerStatus = String(payment.status || '').slice(0, 100);
    await Order.updateOne({ _id: order._id }, { $set: { paymentProviderStatus: providerStatus, providerCheckedAt: new Date() } });
    if (payment.status !== 'approved') {
      if (order.status === 'paid' && ['refunded', 'charged_back'].includes(payment.status)) await Order.updateOne({ _id: order._id }, { $set: { paymentIssue: 'El proveedor informó un reembolso o contracargo. Revisá el pago en Mercado Pago; la entrega requiere intervención del vendedor.' } });
      return;
    }
    if (payment.currency_id !== 'ARS' || cents(payment.transaction_amount) !== cents(order.total)) {
      await Order.updateOne({ _id: order._id }, { $set: { paymentIssue: 'Se recibió un pago con un importe o moneda diferente. Revisión manual requerida; no se entregaron productos digitales.' } });
      throw commerceError('El importe o la moneda del pago no coincide con el pedido.', 422, 'PAYMENT_AMOUNT_MISMATCH');
    }
    if (order.status === 'cancelled') {
      await Order.updateOne({ _id: order._id }, { $set: { paymentId: String(payment.id), paymentIssue: 'Se recibió un pago después de cancelar el pedido. Revisá y reintegrá el importe desde Mercado Pago; no se entregaron productos.' } });
      return;
    }
    if (order.paymentId && !same(order.paymentId, payment.id)) {
      await Order.updateOne({ _id: order._id }, { $set: { paymentIssue: 'El proveedor informó más de un pago aprobado. Revisá los cobros duplicados en Mercado Pago.' } });
      return;
    }
    await Order.updateOne({ _id: order._id, $or: [{ paymentId: { $exists: false } }, { paymentId: String(payment.id) }] }, { $set: { paymentId: String(payment.id), paymentProviderStatus: 'approved' }, $unset: { paymentIssue: 1 } });
    await this.changeStatus(store._id, String(order._id), { status: 'paid', confirmFinal: true }, undefined, { verifiedPayment: true });
  }

  async verifyPayment(store, orderId) {
    let order = await this.getOrder(store._id, orderId);
    if (order.payment.type !== 'mercadopago') throw commerceError('Este pedido no usa Mercado Pago.');
    const payments = order.paymentId ? [await this.mercadoPago.payment(store, order.paymentId)] : await this.mercadoPago.findPayments(store, order._id);
    for (const payment of payments) { await this.reconcilePayment(store, order, payment); order = await this.getOrder(store._id, orderId); }
    await Order.updateOne({ _id: order._id }, { $set: { providerCheckedAt: new Date() } });
    return safeOrder(await this.getOrder(store._id, orderId));
  }

  async webhook(storeId, request) {
    const store = await Store.findById(id(storeId, 'Tienda')).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret');
    if (!store) throw commerceError('La tienda no existe.', 404);
    const dataId = request.query?.['data.id'];
    const { webhookSecret } = this.mercadoPago.credentials(store);
    if (!this.mercadoPago.verifySignature({ signature: request.headers['x-signature'], requestId: request.headers['x-request-id'], dataId }, webhookSecret)) throw commerceError('Firma de notificación inválida.', 401, 'INVALID_WEBHOOK_SIGNATURE');
    if (request.body?.data?.id && !same(request.body.data.id, dataId)) throw commerceError('La notificación contiene identificadores incompatibles.', 400);
    if ((request.body?.type || request.query?.type) !== 'payment') return { received: true };
    const payment = await this.mercadoPago.payment(store, dataId);
    if (!/^[a-f\d]{24}$/i.test(String(payment.external_reference || ''))) return { received: true };
    const order = await Order.findOne({ _id: payment.external_reference, storeId: store._id });
    if (!order) return { received: true };
    await this.reconcilePayment(store, order, payment);
    return { received: true };
  }

  async dashboard(storeId) {
    const storeFilter = storeId ? { storeId: new mongoose.Types.ObjectId(storeId) } : {};
    const since = new Date(); since.setUTCDate(since.getUTCDate() - 29); since.setUTCHours(0, 0, 0, 0);
    const [products, lowStock, pendingOrders, paidOrders, totals, recentOrders, salesSeries, topProducts] = await Promise.all([
      Product.countDocuments({ ...storeFilter, archived: { $ne: true } }),
      Product.countDocuments({ ...storeFilter, archived: { $ne: true }, type: 'physical', madeToOrder: { $ne: true }, $or: [{ 'variants.0': { $exists: false }, stock: { $lte: 5 } }, { variants: { $elemMatch: { stock: { $lte: 5 } } } }] }),
      Order.countDocuments({ ...storeFilter, status: { $in: ACTIVE_STATUSES } }),
      Order.countDocuments({ ...storeFilter, status: 'paid' }),
      Order.aggregate([{ $match: { ...storeFilter, status: 'paid' } }, { $group: { _id: null, revenue: { $sum: '$total' }, unitsSold: { $sum: { $sum: '$items.quantity' } } } }]),
      Order.find({ ...storeFilter, status: { $ne: 'creating' } }).sort({ createdAt: -1 }).limit(6).lean(),
      Order.aggregate([{ $match: { ...storeFilter, status: 'paid', paidAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: 'America/Argentina/Buenos_Aires' } }, total: { $sum: '$total' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Order.aggregate([{ $match: { ...storeFilter, status: 'paid' } }, { $unwind: '$items' }, { $group: { _id: '$items.productId', name: { $first: '$items.name' }, quantity: { $sum: '$items.quantity' }, total: { $sum: '$items.lineTotal' } } }, { $sort: { quantity: -1 } }, { $limit: 5 }]),
    ]);
    return { products, lowStock, pendingOrders, paidOrders, revenue: money(totals[0]?.revenue || 0), unitsSold: totals[0]?.unitsSold || 0, recentOrders: recentOrders.map(o => safeOrder(o)), salesSeries: salesSeries.map(s => ({ date: s._id, total: s.total, count: s.count })), topProducts };
  }
}

export class ReceiptService {
  constructor({ storage = r2Storage, cleanup = storageCleanupService } = {}) { this.storage = storage; this.cleanup = cleanup; }
  get legacyDirectory() { return path.resolve(config.uploadDir, 'receipts'); }
  async store(order, file) {
    if (order.payment.type !== 'transfer') throw commerceError('Este pedido no permite adjuntar un comprobante.', 422);
    if (FINAL_STATUSES.includes(order.status)) throw commerceError('Este pedido ya fue finalizado.', 409);
    if (!file?.buffer || file.buffer.length > 8 * 1024 * 1024) throw commerceError('Adjuntá una imagen o un PDF de hasta 8 MB.');
    let buffer, ext, mimeType;
    if (file.buffer.subarray(0, 5).toString() === '%PDF-') {
      if (!file.buffer.subarray(Math.max(0, file.buffer.length - 2048)).toString().includes('%%EOF')) throw commerceError('El PDF está incompleto o no es válido.');
      buffer = file.buffer; ext = 'pdf'; mimeType = 'application/pdf';
    } else {
      try {
        const metadata = await sharp(file.buffer, { limitInputPixels: 25000000 }).metadata();
        if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error();
        buffer = await sharp(file.buffer, { limitInputPixels: 25000000 }).rotate().resize({ width: 2000, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
        ext = 'jpg'; mimeType = 'image/jpeg';
      } catch { throw commerceError('El archivo debe ser una imagen JPEG, PNG, WebP o un PDF válido.'); }
    }
    const receiptStorage = { bucket: config.r2.receiptsBucket, bucketVariable: 'R2_RECEIPTS_BUCKET_NAME' };
    this.storage.assertConfigured(receiptStorage);
    const objectKey = this.storage.objectKey({ storeId: order.storeId, kind: `receipts/${order._id}`, extension: ext });
    await this.storage.put(objectKey, buffer, { contentType: mimeType, cacheControl: 'private, no-store', ...receiptStorage });
    const before = await Order.findOneAndUpdate(
      { _id: order._id, status: { $in: ACTIVE_STATUSES }, 'payment.type': 'transfer' },
      { $set: { receipt: { objectKey, name: `comprobante-${order.number}.${ext}`, mimeType, uploadedAt: new Date() } }, $push: { history: { status: 'receipt_uploaded', at: new Date(), note: 'El comprador adjuntó un comprobante. El vendedor debe verificar el ingreso del dinero.' } } },
      { returnDocument: 'before' }
    ).select('+receipt.objectKey +receipt.path');
    if (!before) {
      try { await this.storage.delete(objectKey, receiptStorage); } catch (error) { await this.cleanup.schedule({ storeId: order.storeId, objectKey, bucket: config.r2.receiptsBucket, reason: 'receipt-uncommitted', error }); }
      throw commerceError('El pedido cambió y no admite comprobantes.', 409);
    }
    // El reemplazo espera la confirmación de borrado de R2 antes de responder.
    if (before.receipt?.objectKey) {
      try { await this.storage.delete(before.receipt.objectKey, receiptStorage); }
      catch (error) { await this.cleanup.schedule({ storeId: order.storeId, objectKey: before.receipt.objectKey, bucket: config.r2.receiptsBucket, reason: 'receipt-replaced', error }); throw error; }
    }
    else if (before.receipt?.path) await fs.unlink(path.join(this.legacyDirectory, path.basename(before.receipt.path))).catch(() => {});
    await audit({ actorType: 'customer', storeId: order.storeId, action: 'order.receipt.uploaded', entityId: order._id, entityName: order.number, details: { number: order.number, fileType: mimeType, replaced: Boolean(before.receipt?.uploadedAt), storage: 'r2' } });
    return safeOrder(await Order.findById(order._id), { publicView: true });
  }
  async file(storeId, orderId) {
    const order = await Order.findOne({ _id: id(orderId), storeId }).select('+receipt.objectKey +receipt.path');
    if (!order?.receipt?.objectKey && !order?.receipt?.path) throw commerceError('Este pedido no tiene comprobante.', 404);
    if (order.receipt.objectKey) {
      const remote = await this.storage.get(order.receipt.objectKey, { bucket: config.r2.receiptsBucket, bucketVariable: 'R2_RECEIPTS_BUCKET_NAME' });
      return { body: remote.body, name: order.receipt.name, mimeType: order.receipt.mimeType };
    }
    // Compatibilidad temporal para instalaciones que todavía no ejecutaron migrate:r2.
    return { path: path.join(this.legacyDirectory, path.basename(order.receipt.path)), name: order.receipt.name, mimeType: order.receipt.mimeType };
  }
}

export class CommerceWorker {
  constructor({ commerce = new CommerceService(), mail = MailService } = {}) { this.commerce = commerce; this.mail = mail; this.timer = null; this.busy = false; }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.run().catch(error => console.error('[commerce-worker]', error.code || error.name)), 30000);
    this.timer.unref();
    this.run().catch(error => console.error('[commerce-worker]', error.code || error.name));
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async run() {
    if (this.busy) return;
    this.busy = true;
    try { await this.repairOrders(); await this.processMail(); await storageCleanupService.run(); await storageCleanupService.sweepUnattached(); } finally { this.busy = false; }
  }

  async repairOrders() {
    const stale = await Order.find({ status: 'creating', createdAt: { $lt: new Date(Date.now() - 10 * 60000) } }).limit(30);
    for (const order of stale) {
      const cancelled = await Order.findOneAndUpdate({ _id: order._id, status: 'creating' }, { $set: { status: 'cancelled', cancelledAt: new Date() }, $push: { history: { status: 'cancelled', at: new Date(), note: 'Creación interrumpida; reserva liberada automáticamente.' } } }, { returnDocument: 'after' });
      if (cancelled) await this.commerce.finalize(cancelled);
    }
    const unfinished = await Order.find({ status: { $in: FINAL_STATUSES }, finalEffectsAt: { $exists: false } }).limit(50);
    for (const order of unfinished) await this.commerce.finalize(order);
    // Check the provider before expiry so a delayed webhook never cancels a
    // known approved payment. On provider outage retain stock and retry.
    const expired = await Order.find({ status: { $in: ACTIVE_STATUSES }, 'payment.type': 'mercadopago', reservationExpiresAt: { $lt: new Date() }, $or: [{ providerCheckedAt: { $lt: new Date(Date.now() - 120000) } }, { providerCheckedAt: { $exists: false } }] }).limit(10);
    for (const order of expired) {
      try {
        const store = await Store.findById(order.storeId).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret');
        if (!store) continue;
        const checked = await this.commerce.verifyPayment(store, String(order._id));
        if (ACTIVE_STATUSES.includes(checked.status)) await this.commerce.changeStatus(store._id, String(order._id), { status: 'cancelled', confirmFinal: true, note: 'La reserva de Mercado Pago venció sin un pago aprobado.' });
      } catch (error) { console.error('[payment-reconcile]', error.code || error.name); }
    }
    // Handles a reservation write that completes late after a crashed creator
    // was cancelled by another worker. Pending order reservations remain intact.
    const dangling = await Product.find({ 'reservations.0': { $exists: true } }).select('_id reservations').limit(100).lean();
    const orderIds = [...new Set(dangling.flatMap(p => p.reservations.map(r => String(r.orderId))))];
    const finals = await Order.find({ _id: { $in: orderIds }, status: { $in: FINAL_STATUSES } });
    for (const order of finals) await this.commerce.finalize(order);
  }

  async processMail() {
    for (let i = 0; i < 10; i++) {
      const now = new Date();
      const job = await MailJob.findOneAndUpdate({ $or: [{ state: { $in: ['pending', 'failed'] }, availableAt: { $lte: now }, attempts: { $lt: 8 } }, { state: 'sending', leaseUntil: { $lt: now } }] }, { $set: { state: 'sending', leaseUntil: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { returnDocument: 'after', sort: { availableAt: 1 } });
      if (!job) return;
      try {
        const order = await Order.findById(job.orderId).select('+items.digitalUrl +accessTokenEncrypted');
        if (!order || (job.kind === 'digital' && order.status !== 'paid')) {
          await MailJob.updateOne({ _id: job._id }, { $set: { state: 'failed', lastError: 'El pedido no está pagado.', availableAt: new Date(Date.now() + 86400000) } });
          continue;
        }
        const store = await Store.findById(order.storeId);
        if (!store) throw commerceError('No se encontró la tienda.');
        const baseUrl = domainService.publicUrl(store).replace(/\/$/, '');
        const accessToken = order.accessTokenEncrypted ? decryptSecret(order.accessTokenEncrypted) : '';
        const orderUrl = `${baseUrl}/pedido/${order._id}?token=${encodeURIComponent(accessToken)}`;
        const lines = order.items.map(item => `${item.quantity} × ${item.name}${item.variantName ? ` (${item.variantName})` : ''}: $${item.lineTotal.toFixed(2)}`).join('\n');
        let subject, bodyText, html;
        if (job.kind === 'digital') {
          const digital = order.items.filter(item => item.type === 'digital');
          if (digital.some(item => !/^https?:\/\//.test(item.digitalUrl || ''))) throw commerceError('Falta un enlace digital válido en el pedido.');
          subject = `Tu compra digital · ${order.number}`;
          bodyText = `Hola ${order.customer.name}, tu pago en ${store.name} está confirmado.\n\n${digital.map(item => `${item.name}: ${item.digitalUrl}`).join('\n')}\n\nPedido: ${orderUrl}`;
          html = `<h2>Tu compra está lista</h2><p>Hola ${escapeHtml(order.customer.name)}, confirmamos tu pago en ${escapeHtml(store.name)}.</p><ul>${digital.map(item => `<li><a href="${escapeHtml(item.digitalUrl)}">${escapeHtml(item.name)}</a></li>`).join('')}</ul><p><a href="${escapeHtml(orderUrl)}">Ver pedido ${escapeHtml(order.number)}</a></p>`;
        } else {
          subject = `Recibimos tu pedido ${order.number}`;
          bodyText = `Hola ${order.customer.name}, recibimos tu pedido en ${store.name}.\n\n${lines}\n\nTotal: $${order.total.toFixed(2)} ARS\nEl pedido todavía debe ser abonado y confirmado.\n\nConsultá su estado y las instrucciones de pago: ${orderUrl}`;
          html = `<h2>Recibimos tu pedido</h2><p>${escapeHtml(store.name)} · ${escapeHtml(order.number)}</p><p style="white-space:pre-wrap">${escapeHtml(lines)}</p><p><strong>Total: $${order.total.toFixed(2)} ARS</strong></p><p>La recepción del pedido no confirma su pago.</p><p><a href="${escapeHtml(orderUrl)}">Consultar estado e instrucciones</a></p>`;
        }
        await this.mail.send({ to: order.customer.email, subject, text: bodyText, html, messageId: `<${job.kind}-${order._id}@mi-tienda-ya.local>` });
        await MailJob.updateOne({ _id: job._id }, { $set: { state: 'sent', sentAt: new Date() }, $unset: { leaseUntil: 1, lastError: 1 } });
        if (job.kind === 'digital') await Order.updateOne({ _id: order._id, status: 'paid' }, { $set: { digitalDeliveryStatus: 'sent', digitalDeliveredAt: new Date() }, $unset: { digitalDeliveryError: 1 } });
      } catch (error) {
        const safeError = 'No se pudo enviar el correo. Revisá la configuración SMTP e intentá nuevamente.';
        await MailJob.updateOne({ _id: job._id }, { $set: { state: 'failed', lastError: safeError, availableAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** job.attempts)) }, $unset: { leaseUntil: 1 } });
        if (job.kind === 'digital') await Order.updateOne({ _id: job.orderId }, { $set: { digitalDeliveryStatus: 'failed', digitalDeliveryError: safeError } });
      }
    }
  }

  async retryDigital(storeId, orderId) {
    const order = await this.commerce.getOrder(storeId, orderId);
    if (order.status !== 'paid' || !order.items.some(item => item.type === 'digital')) throw commerceError('Sólo pueden reenviarse productos digitales de pedidos pagados.', 422);
    const existing = await MailJob.findOne({ key: `digital:${order._id}` });
    if (existing?.state === 'sending' && existing.leaseUntil > new Date()) throw commerceError('El correo ya se está enviando. Esperá unos instantes.', 409);
    await MailJob.updateOne({ key: `digital:${order._id}` }, { $set: { orderId: order._id, kind: 'digital', state: 'pending', attempts: 0, availableAt: new Date() }, $unset: { lastError: 1, leaseUntil: 1 } }, { upsert: true });
    await Order.updateOne({ _id: order._id }, { $set: { digitalDeliveryStatus: 'pending' }, $unset: { digitalDeliveryError: 1 } });
    return { message: 'La entrega digital quedó programada para su envío.' };
  }
}

export const commerce = new CommerceService();
export const catalog = new CatalogService();
export const inventory = new InventoryService();
export const receipts = new ReceiptService();
export const commerceWorker = new CommerceWorker({ commerce });
export const initCommerce = async () => {
  await Promise.all([Order.init(), StockMovement.init(), MailJob.init()]);
  commerceWorker.start();
};
export const stopCommerce = () => commerceWorker.stop();
