import { Store, StoreTransfer } from '../models/index.js';
import { AppError } from '../middleware/core.js';
import { EntitlementService } from './core.js';
import { quotaService } from './QuotaService.js';
import { planFeatureService } from './PlanFeatureService.js';
import { domainService } from './DomainService.js';

const present = { archived: { $ne: true } };
const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Encapsula el ABM de tiendas propio de un vendedor con capacidad multi-tienda.
 * La administración conserva sus rutas independientes y este servicio nunca
 * permite operar sobre tiendas de otro propietario.
 */
export class StoreManagementService {
  async entitlement(user) {
    if (!user || user.role !== 'vendedor') throw new AppError('Esta sección corresponde a vendedores.', 403, 'FORBIDDEN');
    const entitlement = await EntitlementService.forUser(user);
    if (!await planFeatureService.has(user, 'management.stores')) throw new AppError('Tu plan no incluye Gestión de Tiendas.', 403, 'PLAN_FEATURE_REQUIRED');
    return entitlement;
  }

  async list(user, { page = 1, limit = 15, search = '' } = {}) {
    await this.entitlement(user);
    const term = String(search || '').trim().slice(0, 100);
    const filter = {
      ownerId: user._id,
      ...present,
      ...(term ? { $or: ['name', 'slug'].map(field => ({ [field]: { $regex: escapeRegex(term), $options: 'i' } })) } : {}),
    };
    const [items, total] = await Promise.all([
      Store.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Store.countDocuments(filter),
    ]);
    return { items, total };
  }

  async get(user, storeId) {
    await this.entitlement(user);
    const item = await Store.findOne({ _id: storeId, ownerId: user._id, ...present });
    if (!item) throw new AppError('Tienda no encontrada.', 404, 'STORE_NOT_FOUND');
    return item;
  }

  async create(user, data) {
    await this.entitlement(user);
    return quotaService.createStore({
      ...data,
      ownerId: user._id,
      contact: { email: user.email },
      payments: [{ id: 'cash', type: 'cash', name: 'Efectivo', deliveryIds: ['pickup'], active: true }],
    });
  }

  async update(user, storeId, data) {
    const item = await this.get(user, storeId);
    const wasActive = item.active;
    Object.assign(item, data);
    return quotaService.saveStore(item, { activating: item.active && !wasActive });
  }

  async archive(user, storeId) {
    await this.entitlement(user);
    const pendingTransfer = await StoreTransfer.exists({ storeId, fromUserId: user._id, status: 'pending' });
    if (pendingTransfer) throw new AppError('Cancelá la transferencia pendiente antes de archivar esta tienda.', 409, 'TRANSFER_PENDING');
    const before = await Store.findOneAndUpdate(
      { _id: storeId, ownerId: user._id, ...present },
      { $set: { active: false, archived: true }, $inc: { __v: 1 } },
      { returnDocument: 'before' },
    );
    if (!before) throw new AppError('Tienda no encontrada.', 404, 'STORE_NOT_FOUND');
    await domainService.deprovisionStore(before);
    return before;
  }
}

export const storeManagementService = new StoreManagementService();
