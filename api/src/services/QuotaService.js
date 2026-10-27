import mongoose from 'mongoose';
import { User, Store, Product } from '../models/index.js';
import { EntitlementService } from './core.js';
import { AppError } from '../middleware/core.js';

const rank = { createdAt: 1, _id: 1 };
const present = { archived: { $ne: true } };
const quotaDuplicate = error => error?.code === 11000 && ['quotaSlot', 'ownerSlot', 'publicationSlot'].some(field => Object.hasOwn(error.keyPattern || {}, field) || String(error.message).includes(`${field}_1`));
function freeSlot(rows, field, maximum = Infinity) {
  const used = new Set(rows.map(row => row[field]).filter(Number.isSafeInteger));
  let slot = 0;
  while (used.has(slot)) slot++;
  return slot < maximum ? slot : null;
}

/**
 * La adquisición de cuota ocurre en el mismo documento que la utiliza.
 * Los índices únicos parciales son la exclusión: no hay leases que puedan
 * expirar y permitir que un escritor antiguo conserve un permiso obsoleto.
 */
export class QuotaService {
  async ensureSlots(Model, scope, field) {
    let collisions = 0;
    while (collisions < 40) {
      const rows = await Model.find(scope).sort(rank).select(`_id ${field}`).lean();
      const missing = rows.find(row => !Number.isSafeInteger(row[field]) || row[field] < 0);
      if (!missing) return rows;
      const slot = freeSlot(rows, field);
      try {
        const result = await Model.updateOne({ ...scope, _id: missing._id, [field]: missing[field] ?? null }, { $set: { [field]: slot } });
        collisions = result.modifiedCount ? 0 : collisions + 1;
      } catch (error) { if (!quotaDuplicate(error)) throw error; collisions++; }
    }
    throw new AppError('Hay otra operación administrando esta cuota. Intentá nuevamente.', 409, 'QUOTA_BUSY');
  }

  async owner(ownerId) {
    const user = await User.findById(ownerId);
    if (!user || user.role !== 'vendedor' || !user.active) throw new AppError('Seleccioná un vendedor activo.', 422, 'INVALID_STORE_OWNER');
    return { user, entitlement: await EntitlementService.forUser(user) };
  }

  async createStore(data, { reuseSlug = false } = {}) {
    const documentId = data._id || new mongoose.Types.ObjectId();
    for (let attempt = 0; attempt < 40; attempt++) {
      if (reuseSlug) { const existing = await Store.findOne({ slug: data.slug, ownerId: data.ownerId, ...present }); if (existing) return existing; }
      const { entitlement } = await this.owner(data.ownerId);
      const rows = await this.ensureSlots(Store, { ownerId: data.ownerId, ...present }, 'ownerSlot');
      const ownerSlot = freeSlot(rows, 'ownerSlot', entitlement.maxStores);
      if (rows.length >= entitlement.maxStores || ownerSlot === null) throw new AppError('El plan del vendedor no admite más tiendas.', 403, 'STORE_LIMIT');
      let publicationSlot;
      if (data.active) {
        if (!entitlement.allowed) throw new AppError('La tienda necesita una prueba o un plan vigente para activarse.', 403, 'PLAN_REQUIRED');
        const active = await this.ensureSlots(Store, { ownerId: data.ownerId, active: true, ...present }, 'publicationSlot');
        publicationSlot = freeSlot(active, 'publicationSlot', entitlement.maxStores);
        if (active.length >= entitlement.maxStores || publicationSlot === null) throw new AppError('El plan no permite activar más tiendas.', 403, 'STORE_LIMIT');
      }
      try {
        const store = await Store.create({ ...data, _id: documentId, ownerSlot, ...(data.active ? { publicationSlot } : {}) });
        await this.reconcilePublications(store.ownerId);
        return Store.findById(store._id).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret +integrations.mercadopago.accounts.accessToken +integrations.mercadopago.accounts.webhookSecret');
      } catch (error) {
        if (reuseSlug && error.code === 11000) {
          const existing = await Store.findOne({ slug: data.slug, ownerId: data.ownerId, ...present });
          if (existing) return existing;
        }
        if (!quotaDuplicate(error)) throw error;
      }
    }
    throw new AppError('La cuota cambió durante la creación. Intentá nuevamente.', 409, 'QUOTA_BUSY');
  }

  async saveStore(store, { ownerChanged = false, activating = false } = {}) {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (ownerChanged) {
        const { entitlement } = await this.owner(store.ownerId);
        const owned = await this.ensureSlots(Store, { ownerId: store.ownerId, _id: { $ne: store._id }, ...present }, 'ownerSlot');
        const slot = freeSlot(owned, 'ownerSlot', entitlement.maxStores);
        if (owned.length >= entitlement.maxStores || slot === null) throw new AppError('El vendedor alcanzó su límite de tiendas.', 403, 'STORE_LIMIT');
        store.ownerSlot = slot;
      }
      if (store.active && (ownerChanged || activating)) {
        const { entitlement } = await this.owner(store.ownerId);
        if (!entitlement.allowed) throw new AppError('La tienda necesita una prueba o un plan vigente para activarse.', 403, 'PLAN_REQUIRED');
        const active = await this.ensureSlots(Store, { ownerId: store.ownerId, active: true, _id: { $ne: store._id }, ...present }, 'publicationSlot');
        const slot = freeSlot(active, 'publicationSlot', entitlement.maxStores);
        if (active.length >= entitlement.maxStores || slot === null) throw new AppError('El plan no permite activar más tiendas.', 403, 'STORE_LIMIT');
        store.publicationSlot = slot;
      }
      if (!store.active) store.publicationSlot = undefined;
      try {
        await store.save();
        if (ownerChanged || activating) await this.reconcilePublications(store.ownerId);
        return Store.findById(store._id).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret +integrations.mercadopago.accounts.accessToken +integrations.mercadopago.accounts.webhookSecret');
      } catch (error) { if (!quotaDuplicate(error)) throw error; }
    }
    throw new AppError('La cuota de tiendas cambió. Actualizá e intentá nuevamente.', 409, 'QUOTA_BUSY');
  }

  async createProduct(storeId, data) {
    const documentId = data._id || new mongoose.Types.ObjectId();
    for (let attempt = 0; attempt < 40; attempt++) {
      const store = await Store.findOne({ _id: storeId, ...present });
      if (!store) throw new AppError('Tienda no encontrada.', 404);
      const entitlement = await EntitlementService.forUser(store.ownerId);
      const maximum = entitlement.allowed && entitlement.maxProducts > 0 ? entitlement.maxProducts : Infinity;
      const rows = await this.ensureSlots(Product, { storeId, ...present }, 'quotaSlot');
      const slot = freeSlot(rows, 'quotaSlot', maximum);
      if (rows.length >= maximum || slot === null) throw new AppError('Alcanzaste el límite de productos de tu plan.', 403, 'PRODUCT_LIMIT');
      let product;
      try {
        // No publicar un producto tentativo antes de comprobar un cambio de plan.
        product = await Product.create({ ...data, _id: documentId, storeId, quotaSlot: slot, active: false });
      } catch (error) { if (quotaDuplicate(error)) continue; throw error; }
      const currentStore = await Store.findById(storeId);
      const current = await EntitlementService.forUser(currentStore.ownerId);
      if (current.allowed && current.maxProducts > 0) {
        const allowed = await Product.find({ storeId, ...present }).sort(rank).limit(current.maxProducts).select('_id').lean();
        if (!allowed.some(row => String(row._id) === String(product._id))) {
          // Sólo se archiva este intento que todavía no se devolvió al cliente.
          // Los productos previamente aceptados se conservan al reducir un plan.
          await Product.updateOne({ _id: product._id }, { $set: { archived: true, active: false } });
          throw new AppError('El plan cambió durante la creación. El nuevo producto no se publicó; revisá tu plan antes de reintentar.', 403, 'PRODUCT_LIMIT');
        }
      }
      return Product.findOneAndUpdate({ _id: product._id, archived: false }, { $set: { active: data.active ?? true } }, { returnDocument: 'after' }).select('+digitalUrl');
    }
    throw new AppError('La cuota de productos cambió. Actualizá e intentá nuevamente.', 409, 'QUOTA_BUSY');
  }

  async reconcilePublications(ownerId) {
    const owner = await User.findById(ownerId);
    const entitlement = await EntitlementService.forUser(owner || ownerId);
    const active = await Store.find({ ownerId, active: true, ...present }).sort(rank).select('_id');
    const excess = active.slice(entitlement.allowed ? entitlement.maxStores : 0);
    if (excess.length) await Store.updateMany({ ownerId, _id: { $in: excess.map(store => store._id) }, active: true }, { $set: { active: false }, $unset: { publicationSlot: 1 }, $inc: { __v: 1 } });
    return excess.map(store => store._id);
  }

  async reconcilePlan(planId) {
    const owners = await User.find({ role: 'vendedor', planId }).select('_id').lean();
    for (const owner of owners) await this.reconcilePublications(owner._id);
  }

  async initialize() {
    for (const ownerId of await Store.distinct('ownerId', present)) {
      await this.ensureSlots(Store, { ownerId, ...present }, 'ownerSlot');
      await this.ensureSlots(Store, { ownerId, active: true, ...present }, 'publicationSlot');
      await this.reconcilePublications(ownerId);
    }
    for (const storeId of await Product.distinct('storeId', present)) await this.ensureSlots(Product, { storeId, ...present }, 'quotaSlot');
  }
}
export const quotaService = new QuotaService();
