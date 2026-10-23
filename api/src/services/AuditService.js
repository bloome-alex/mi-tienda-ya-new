import mongoose from 'mongoose';
import { AuditLog, User, Store, Plan, Product, Category } from '../models/index.js';
import { AppError } from '../middleware/core.js';
import { pagination } from '../utils/http.js';
import { auditLabels as fields } from '../../../client/src/services/audit.js';

export const auditActions = Object.freeze({
  'auth.root.login': 'Ingreso de administración', 'auth.seller.login': 'Ingreso de vendedor', 'auth.password.changed': 'Contraseña de administración cambiada',
  'plan.created': 'Plan creado', 'plan.updated': 'Plan actualizado', 'plan.archived': 'Plan desactivado',
  'user.created': 'Vendedor creado', 'user.updated': 'Vendedor actualizado', 'user.disabled': 'Vendedor desactivado', 'user.plan.assigned': 'Plan del vendedor actualizado',
  'settings.updated': 'Configuración de la plataforma actualizada', 'store.created': 'Tienda creada', 'store.updated': 'Tienda actualizada', 'store.archived': 'Tienda archivada',
  'store.transfer.created': 'Transferencia de tienda iniciada', 'store.transfer.cancelled': 'Transferencia de tienda cancelada', 'store.transfer.accepted': 'Transferencia de tienda aceptada', 'store.transfer.return.created': 'Devolución de tienda iniciada',
  'store.design.updated': 'Diseño de tienda actualizado', 'store.contact.updated': 'Contacto de tienda actualizado', 'store.payments.updated': 'Cobros y entregas actualizados', 'store.domain.updated': 'Dominio de tienda actualizado', 'store.domain.verified': 'Dominio propio verificado',
  'category.created': 'Categoría creada', 'category.updated': 'Categoría actualizada', 'category.archived': 'Categoría archivada',
  'product.created': 'Producto creado', 'product.updated': 'Producto actualizado', 'product.featured.updated': 'Producto destacado actualizado', 'product.archived': 'Producto archivado',
  'image.uploaded': 'Imágenes subidas', 'wallpaper.uploaded': 'Fondo de tienda subido', 'stock.adjusted': 'Stock ajustado',
  'order.created': 'Pedido creado', 'order.pending': 'Pedido pendiente', 'order.awaiting_payment': 'Pedido esperando pago', 'order.processing': 'Pedido en proceso',
  'order.paid': 'Pedido pagado', 'order.cancelled': 'Pedido cancelado', 'order.fulfillment': 'Entrega del pedido actualizada', 'order.receipt.uploaded': 'Comprobante de transferencia recibido',
  'subscription.pending.cancelled': 'Vinculación pendiente de suscripción cancelada', 'subscription.support.created': 'Comprobante de suscripción enviado', 'subscription.support.approved': 'Comprobante de suscripción aprobado', 'subscription.support.rejected': 'Comprobante de suscripción rechazado',
  'whatsapp.connect': 'Conexión de WhatsApp solicitada', 'whatsapp.disconnect': 'WhatsApp desconectado',
});
export const auditEntities = Object.freeze({ user: 'Usuario', store: 'Tienda', plan: 'Plan', category: 'Categoría', product: 'Producto', order: 'Pedido', settings: 'Configuración', integration: 'Integración', subscription_support: 'Revisión de suscripción', store_transfer: 'Transferencia de tienda' });

const secret = /password|passwd|contrase[nñ]a|secret|token|csrf|authorization|cookie|credential|api[_-]?key|private[_-]?key|encryption[_-]?key|digital[_-]?url/i;
const unsafeKey = key => ['__proto__', 'constructor', 'prototype'].includes(key);
const publicFlag = (key, value) => typeof value === 'boolean' && ['hasAccessToken', 'hasWebhookSecret', 'credentialsUpdated'].includes(String(key).split('.').at(-1));
const hiddenField = (key, value) => secret.test(key) && !publicFlag(key, value);
const internal = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'stockVersion', 'quotaSlot', 'ownerSlot', 'publicationSlot', 'reservations', 'hierarchyLinks', 'parentLinkToken']);
const plain = value => typeof value?.toObject === 'function' ? value.toObject({ flattenMaps: true }) : value;
export const auditFieldLabel = field => String(field || '').split('.').map(part => (Object.hasOwn(fields, part) ? fields[part] : '') || (/^\d+$/.test(part) ? 'Elemento ' + (Number(part) + 1) : part)).join(' · ');

/** Secrets are removed on write AND on read so older events cannot leak values.
 * Descriptors such as { field: 'accessToken', before, after } are also handled. */
export function redactAudit(value) {
  const visited = new WeakSet(); let count = 0;
  function walk(input, depth = 0, key = '') {
    if (hiddenField(key, input) || key === 'path') return '[Oculto]';
    if (++count > 30000 || depth > 12) return '[Detalle limitado]';
    const v = plain(input);
    if (v == null) return v;
    if (v instanceof Date) return Number.isFinite(+v) ? v.toISOString() : null;
    if (v?._bsontype === 'ObjectId') return String(v);
    if (typeof v === 'string') {
      const safe = v.replace(/([?&#](?:[^=&\s]*(?:token|secret|password|api[_-]?key|signature)[^=&\s]*)=)[^&#\s]*/gi, '$1[Oculto]')
        .replace(/(https?:\/\/)[^/\s@]+:[^/\s@]+@/gi, '$1[Oculto]@')
        .replace(/\bBearer\s+[a-zA-Z0-9._~+/-]+=*/gi, 'Bearer [Oculto]');
      return safe.length > 20000 ? safe.slice(0, 20000) + '… [contenido abreviado]' : safe;
    }
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v;
    if (typeof v !== 'object') return undefined;
    if (visited.has(v)) return '[Referencia omitida]';
    visited.add(v);
    let out;
    if (Array.isArray(v)) { const max = key === 'changes' ? 2000 : 500; out = v.slice(0, max).map(item => walk(item, depth + 1)); if (v.length > max) out.push('[Lista abreviada]'); }
    else {
      out = {};
      const descriptor = [v.field, v.key, v.name].filter(item => typeof item === 'string').find(item => secret.test(item));
      for (const [childKey, child] of Object.entries(v).slice(0, 200)) {
        if (unsafeKey(childKey)) continue;
        out[childKey] = descriptor && hiddenField(descriptor, child) && ['before', 'after', 'value', 'oldValue', 'newValue'].includes(childKey) ? '[Oculto]' : walk(child, depth + 1, childKey);
      }
    }
    visited.delete(v);
    return out;
  }
  return walk(value);
}

export function auditChanges(before, after, allowedFields) {
  const left = redactAudit(plain(before) || {}), right = redactAudit(plain(after) || {});
  const result = [];
  const readableItem = item => {
    const title = [item?.title,item?.label,item?.network].find(value=>typeof value==='string' && value.trim())?.trim() || '';
    return title ? title.slice(0, 70) + (title.length > 70 ? '…' : '') : String(item?.id || 'Sin título');
  };
  const hasStableIds = value => Array.isArray(value) && value.every(item => item && typeof item === 'object' && typeof item.id === 'string' && item.id) && new Set(value.map(item => item.id)).size === value.length;
  function collection(a, b, path, context) {
    const kind = path.endsWith('heroSlides') ? ['Diapositiva', 'las diapositivas'] : path.endsWith('blocks') ? ['Complemento', 'los complementos'] : path.endsWith('socialLinks') ? ['Red social','las redes sociales'] : path === 'design.navbar.links' ? ['Enlace','los enlaces'] : ['Sección', 'las secciones'];
    const scope = context || (path.endsWith('heroSlides') ? 'Diseño · Portada' : path === 'design.navbar.links' ? 'Diseño · Cabecera' : 'Diseño');
    const gender = ['Complemento','Enlace'].includes(kind[0]) ? 'o' : 'a';
    const oldById = new Map(a.map((item, index) => [item.id, { item, index }]));
    const newById = new Map(b.map((item, index) => [item.id, { item, index }]));
    const oldCommon = a.filter(item => newById.has(item.id)).map(item => item.id);
    const newCommon = b.filter(item => oldById.has(item.id)).map(item => item.id);
    if (JSON.stringify(oldCommon) !== JSON.stringify(newCommon)) result.push({
      field: path + '.order', label: scope + ' · Orden de ' + kind[1],
      before: a.map(item => readableItem(item) + ' [' + item.id + ']'), after: b.map(item => readableItem(item) + ' [' + item.id + ']'),
    });
    for (const { item, index } of oldById.values()) if (!newById.has(item.id)) result.push({
      field: path + '.' + index, label: scope + ' · ' + kind[0] + ' quitad' + gender + ': ' + readableItem(item), before: item, after: null,
    });
    for (const { item, index } of newById.values()) {
      const label = scope + ' · ' + kind[0] + ' ' + (index + 1) + ': ' + readableItem(item);
      const old = oldById.get(item.id);
      if (!old) result.push({ field: path + '.' + index, label: label + ' (agregad' + gender + ')', before: null, after: item });
      else compare(old.item, item, path + '.' + index, label);
    }
  }
  function compare(a, b, prefix = '', context = '') {
    const keys = prefix ? new Set([...Object.keys(a || {}), ...Object.keys(b || {})]) : new Set(allowedFields || [...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const key of keys) {
      if ((internal.has(key) && !(key === 'updatedAt' && prefix === 'design.terms')) || unsafeKey(key) || hiddenField(key, b?.[key] ?? a?.[key])) continue;
      const path = prefix ? prefix + '.' + key : key;
      const oldValue = a?.[key] ?? null, newValue = b?.[key] ?? null;
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
      const structuredList = path === 'design.sections' || path === 'design.shop.heroSlides' || path === 'design.navbar.links' || /^design\.sections\.\d+\.(blocks|socialLinks)$/.test(path);
      if (structuredList && hasStableIds(oldValue) && hasStableIds(newValue)) collection(oldValue, newValue, path, context);
      else if (oldValue && newValue && typeof oldValue === 'object' && typeof newValue === 'object' && !Array.isArray(oldValue) && !Array.isArray(newValue)) compare(oldValue, newValue, path, context ? context + ' · ' + auditFieldLabel(key) : '');
      else result.push({ field: path, before: oldValue, after: newValue, ...(context ? { label: context + ' · ' + auditFieldLabel(key) } : {}) });
    }
  }
  compare(left, right);
  return result;
}

function present(entry, detailed = false) {
  const row = redactAudit(plain(entry));
  const entity = String(row.entity || '').toLowerCase();
  const actionLabel = Object.hasOwn(auditActions, row.action) ? auditActions[row.action] : 'Actividad registrada';
  const changes = Array.isArray(row.details?.changes) ? row.details.changes.filter(change => change && typeof change.field === 'string').map(change => ({
    field: change.field, label: typeof change.label === 'string' ? change.label : auditFieldLabel(change.field),
    beforeRecorded: Object.hasOwn(change, 'before'), afterRecorded: Object.hasOwn(change, 'after'),
    ...(Object.hasOwn(change, 'before') ? { before: change.before } : {}), ...(Object.hasOwn(change, 'after') ? { after: change.after } : {}),
  })) : [];
  const facts = row.details && typeof row.details === 'object' ? Object.entries(row.details).filter(([key, value]) => key !== 'changes' && value !== undefined).map(([key, value]) => ({ key, label: auditFieldLabel(key), value })) : [];
  const entityLabel = Object.hasOwn(auditEntities, entity) ? auditEntities[entity] : 'Recurso';
  const entityName = row.entitySnapshot?.name || '';
  const actor = row.actorSnapshot ? { ...row.actorSnapshot, id: row.actorId || null } : { id: row.actorId || null, type: 'unknown', name: row.actorId ? 'Nombre del actor no registrado' : 'Actor no registrado' };
  const store = row.storeSnapshot ? { ...row.storeSnapshot, id: row.storeId || null } : row.storeId ? { id: row.storeId, name: 'Nombre de tienda no registrado' } : null;
  const summary = entityName ? actionLabel + ' · ' + entityName : actionLabel;
  const result = { _id: row._id, createdAt: row.createdAt, action: row.action, actionLabel, entity, entityLabel, entityId: row.entityId, entityName, actor, store, summary, changesCount: changes.length, hasDetails: changes.length > 0 || facts.length > 0 };
  if (detailed) Object.assign(result, { changes, facts, details: row.details || {}, detailNotice: changes.length ? '' : 'Este evento no registró valores anteriores y posteriores.' });
  return result;
}

function filterFor(query = {}) {
  const filter = {};
  for (const field of ['actorId', 'storeId']) if (query[field]) {
    if (typeof query[field] !== 'string' || !/^[a-f\d]{24}$/i.test(query[field])) throw new AppError('El filtro de usuario o tienda no es válido.', 422);
    filter[field] = query[field];
  }
  if (query.action) { if (typeof query.action !== 'string' || query.action.length > 100) throw new AppError('Acción de auditoría inválida.', 422); filter.action = query.action; }
  if (query.entity) { const value = String(query.entity).toLowerCase(); if (!Object.hasOwn(auditEntities, value)) throw new AppError('Recurso de auditoría inválido.', 422); filter.entity = { $in: [value, value[0].toUpperCase() + value.slice(1)] }; }
  for (const key of ['from', 'to']) if (query[key]) {
    const value = query[key];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new AppError('Usá fechas válidas para filtrar la auditoría.', 422);
    filter.createdAt ||= {};
    filter.createdAt[key === 'from' ? '$gte' : '$lt'] = new Date(Date.parse(value) + (key === 'to' ? 86400000 : 0));
  }
  if (filter.createdAt?.$gte && filter.createdAt?.$lt && filter.createdAt.$gte >= filter.createdAt.$lt) throw new AppError('La fecha inicial debe ser anterior a la final.', 422);
  if (query.search) {
    const search = String(query.search).trim().slice(0, 100);
    const escaped = search.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
    const regex = { $regex: escaped, $options: 'i' };
    filter.$or = ['action', 'entity', 'entityId', 'actorSnapshot.name', 'actorSnapshot.email', 'storeSnapshot.name', 'storeSnapshot.slug', 'entitySnapshot.name'].map(field => ({ [field]: regex }));
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const matching = Object.entries(auditActions).filter(([, label]) => normalize(label).includes(normalize(search))).map(([code]) => code);
    if (matching.length) filter.$or.push({ action: { $in: matching } });
  }
  return filter;
}

export class AuditService {
  async log({ actorId, actor, actorType, storeId, store, action, entity, entityId, entityName, details = {} }) {
    const kind = String(entity || '').toLowerCase();
    const actorDoc = actor || (actorId ? await User.findById(actorId).select('name email role').lean() : null);
    const storeDoc = store || (storeId ? await Store.findById(storeId).select('name slug').lean() : null);
    let name = entityName;
    if (name === undefined && entityId && mongoose.isValidObjectId(entityId)) {
      const model = { user: User, store: Store, plan: Plan, product: Product, category: Category, order: mongoose.models.Order }[kind];
      const doc = model ? await model.findById(entityId).select(kind === 'order' ? 'number' : 'name').lean() : null;
      name = doc?.name || doc?.number;
    }
    const snapshotActor = actorDoc ? { name: actorDoc.name || actorDoc.email || 'Usuario registrado', email: actorDoc.email, role: actorDoc.role, type: actorType || 'user' }
      : actorType ? { name: { customer: 'Cliente de la tienda', system: 'Sistema', integration: 'Integración de pagos' }[actorType] || 'Actor no registrado', type: actorType } : undefined;
    return AuditLog.create({
      actorId, storeId, action, entity: kind, entityId: entityId ? String(entityId) : undefined,
      actorSnapshot: snapshotActor ? redactAudit(snapshotActor) : undefined,
      storeSnapshot: storeDoc ? redactAudit({ name: storeDoc.name, slug: storeDoc.slug }) : undefined,
      entitySnapshot: name ? redactAudit({ name }) : undefined, details: redactAudit(details),
    });
  }
  async list(query = {}) {
    const filter = filterFor(query), { page, limit } = pagination(query);
    const [rows, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), AuditLog.countDocuments(filter)]);
    return { data: rows.map(row => present(row)), meta: { page, limit, total, actions: auditActions, entities: auditEntities } };
  }
  async get(id) {
    if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) throw new AppError('Registro de auditoría no encontrado.', 404);
    const entry = await AuditLog.findById(id).lean();
    if (!entry) throw new AppError('Registro de auditoría no encontrado.', 404);
    return present(entry, true);
  }
  async recent(limit = 10) { const result = await this.list({ limit }); return result.data; }
  static log(entry) { return auditService.log(entry); }
  static changes(before, after, fields) { return auditChanges(before, after, fields); }
  static list(query) { return auditService.list(query); }
  static get(id) { return auditService.get(id); }
  static recent(limit) { return auditService.recent(limit); }
}
export const auditService = new AuditService();
