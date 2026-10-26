import { StoreTransfer, Store, User } from '../models/index.js';
import { AppError } from '../middleware/core.js';
import { EntitlementService } from './core.js';
import { quotaService } from './QuotaService.js';
import { planFeatureService } from './PlanFeatureService.js';
import { storeTransferPolicy } from './StoreTransferPolicy.js';

const lowerEmail = value => String(value || '').trim().toLowerCase();
const idOf = value => value?._id ? String(value._id) : value ? String(value) : '';
const pendingStore = { archived: { $ne: true } };

function publicParty(value, fallback = {}) {
  if (value && typeof value === 'object' && (value.email || value.name)) return { id: idOf(value), name: value.name || '', email: value.email || '' };
  return { id: idOf(value), name: fallback.name || '', email: fallback.email || '' };
}

export class StoreTransferService {
  async recipientEligibility(user) {
    const [entitlement, ownedCount] = await Promise.all([
      EntitlementService.forUser(user),
      Store.countDocuments({ ownerId: user._id, ...pendingStore }),
    ]);
    return storeTransferPolicy.eligibility({ user, entitlement, ownedCount });
  }

  present(row, viewerId = '') {
    const item = row?.toObject ? row.toObject() : { ...row };
    const storeDoc = item.storeId && typeof item.storeId === 'object' ? item.storeId : null;
    const store = storeDoc ? { id: idOf(storeDoc), name: storeDoc.name || item.storeSnapshot?.name || '', slug: storeDoc.slug || item.storeSnapshot?.slug || '', ownerId: idOf(storeDoc.ownerId), archived: Boolean(storeDoc.archived) } : { id: idOf(item.storeId), name: item.storeSnapshot?.name || '', slug: item.storeSnapshot?.slug || '', ownerId: '', archived: false };
    const from = publicParty(item.fromUserId, item.fromUserSnapshot);
    const to = publicParty(item.toUserId, item.toUserSnapshot || { email: item.recipientEmail });
    const viewer = String(viewerId || '');
    return {
      _id: idOf(item), status: item.status, kind: item.kind || 'transfer', recipientEmail: item.recipientEmail,
      createdAt: item.createdAt, acceptedAt: item.acceptedAt || null, cancelledAt: item.cancelledAt || null,
      store, from, to,
      direction: viewer && viewer === from.id ? 'outgoing' : viewer && viewer === to.id ? 'incoming' : '',
      canReturn: Boolean(item.status === 'accepted' && viewer && viewer === to.id && store.ownerId === viewer && from.email),
    };
  }

  baseQuery() {
    return StoreTransfer.find({}).populate('storeId', 'name slug ownerId archived').populate('fromUserId', 'name email').populate('toUserId', 'name email');
  }

  async summary(user) {
    if (!user || user.role !== 'vendedor') throw new AppError('Esta sección corresponde a vendedores.', 403, 'FORBIDDEN');
    const email = lowerEmail(user.email);
    const [incomingRows, outgoingRows, historyRows, eligibility, canTransfer] = await Promise.all([
      StoreTransfer.find({ status: 'pending', recipientEmail: email }).sort({ createdAt: -1 }).populate('storeId', 'name slug ownerId archived').populate('fromUserId', 'name email').populate('toUserId', 'name email'),
      StoreTransfer.find({ status: 'pending', fromUserId: user._id }).sort({ createdAt: -1 }).populate('storeId', 'name slug ownerId archived').populate('fromUserId', 'name email').populate('toUserId', 'name email'),
      StoreTransfer.find({ status: { $in: ['accepted', 'cancelled'] }, $or: [{ fromUserId: user._id }, { toUserId: user._id }, { recipientEmail: email }] }).sort({ updatedAt: -1 }).limit(100).populate('storeId', 'name slug ownerId archived').populate('fromUserId', 'name email').populate('toUserId', 'name email'),
      this.recipientEligibility(user),
      planFeatureService.has(user, 'stores.transfer'),
    ]);
    return {
      pendingIncoming: incomingRows.map(row => this.present(row, user._id)),
      pendingOutgoing: outgoingRows.map(row => this.present(row, user._id)),
      history: historyRows.map(row => this.present(row, user._id)),
      pendingIncomingCount: incomingRows.length,
      pendingOutgoingStoreIds: outgoingRows.map(row => idOf(row.storeId)),
      eligibility,
      canTransfer,
    };
  }

  async transferredHistory(user, { page = 1, limit = 50, search = '' } = {}) {
    if (!user || user.role !== 'vendedor') throw new AppError('Esta sección corresponde a vendedores.', 403, 'FORBIDDEN');
    const filter = { status: 'accepted', fromUserId: user._id };
    const term = String(search || '').trim().slice(0, 100);
    if (term) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { 'storeSnapshot.name': { $regex: escaped, $options: 'i' } },
        { recipientEmail: { $regex: escaped, $options: 'i' } },
        { 'toUserSnapshot.name': { $regex: escaped, $options: 'i' } },
        { 'toUserSnapshot.email': { $regex: escaped, $options: 'i' } },
      ];
    }
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 50));
    const [rows, total] = await Promise.all([
      StoreTransfer.find(filter).sort({ acceptedAt: -1, updatedAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).populate('storeId', 'name slug ownerId archived').populate('fromUserId', 'name email').populate('toUserId', 'name email'),
      StoreTransfer.countDocuments(filter),
    ]);
    return {
      rows: rows.map(row => this.present(row, user._id)),
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async create(user, { storeId, recipientEmail, kind = 'transfer', previousTransferId = null } = {}) {
    if (!user || user.role !== 'vendedor') throw new AppError('Esta sección corresponde a vendedores.', 403, 'FORBIDDEN');
    const email = lowerEmail(recipientEmail);
    if (!email) throw new AppError('Ingresá el email de la persona destinataria.', 422, 'TRANSFER_EMAIL_REQUIRED');
    if (email === lowerEmail(user.email)) throw new AppError('No podés transferirte una tienda a tu propia cuenta.', 422, 'TRANSFER_SAME_OWNER');
    const store = await Store.findOne({ _id: storeId, ownerId: user._id, ...pendingStore });
    if (!store) throw new AppError('La tienda no existe o ya no te pertenece.', 404, 'STORE_NOT_FOUND');
    const existing = await StoreTransfer.findOne({ storeId: store._id, status: 'pending' });
    if (existing) throw new AppError('Esta tienda ya tiene una transferencia pendiente.', 409, 'TRANSFER_ALREADY_PENDING');
    const recipient = await User.findOne({ role: 'vendedor', email });
    try {
      return await StoreTransfer.create({
        storeId: store._id, fromUserId: user._id, toUserId: recipient?._id || null, recipientEmail: email, kind,
        ...(previousTransferId ? { previousTransferId } : {}),
        storeSnapshot: { name: store.name, slug: store.slug },
        fromUserSnapshot: { name: user.name || '', email: user.email || '' },
        toUserSnapshot: { name: recipient?.name || '', email },
      });
    } catch (error) {
      if (error?.code === 11000) throw new AppError('Esta tienda ya tiene una transferencia pendiente.', 409, 'TRANSFER_ALREADY_PENDING');
      throw error;
    }
  }

  async cancel(user, transferId) {
    const item = await StoreTransfer.findOneAndUpdate({ _id: transferId, fromUserId: user._id, status: 'pending', processingAt: { $exists: false } }, { $set: { status: 'cancelled', cancelledAt: new Date() } }, { returnDocument: 'after' });
    if (!item) throw new AppError('La transferencia ya no está pendiente o no te pertenece.', 409, 'TRANSFER_NOT_PENDING');
    return item;
  }

  async accept(user, transferId) {
    const email = lowerEmail(user.email);
    let transfer = await StoreTransfer.findOne({ _id: transferId, status: 'pending', recipientEmail: email });
    if (!transfer) throw new AppError('La transferencia ya no está disponible para esta cuenta.', 404, 'TRANSFER_NOT_FOUND');
    const eligibility = await this.recipientEligibility(user);
    if (!eligibility.allowed) throw new AppError(eligibility.reason, 403, eligibility.code, eligibility);

    const claim = await StoreTransfer.updateOne({ _id: transfer._id, status: 'pending', processingAt: { $exists: false } }, { $set: { processingAt: new Date(), toUserId: user._id, 'toUserSnapshot.name': user.name || '', 'toUserSnapshot.email': email } });
    if (!claim.modifiedCount) throw new AppError('La transferencia está siendo procesada en otra sesión.', 409, 'TRANSFER_BUSY');
    try {
      transfer = await StoreTransfer.findById(transfer._id);
      const store = await Store.findOne({ _id: transfer.storeId, ownerId: transfer.fromUserId, ...pendingStore }).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret');
      if (!store) throw new AppError('La tienda cambió de propietario o ya no está disponible.', 409, 'TRANSFER_STORE_CHANGED');
      store.ownerId = user._id;
      const saved = await quotaService.saveStore(store, { ownerChanged: true });
      const accepted = await StoreTransfer.findOneAndUpdate({ _id: transfer._id, status: 'pending' }, { $set: { status: 'accepted', acceptedAt: new Date(), toUserId: user._id, 'toUserSnapshot.name': user.name || '', 'toUserSnapshot.email': email }, $unset: { processingAt: 1 } }, { returnDocument: 'after' });
      if (!accepted) throw new AppError('No se pudo cerrar la transferencia. Recargá la página antes de continuar.', 409, 'TRANSFER_FINALIZE_FAILED');
      return { transfer: accepted, store: saved };
    } catch (error) {
      await StoreTransfer.updateOne({ _id: transfer._id, status: 'pending' }, { $unset: { processingAt: 1 } }).catch(() => {});
      throw error;
    }
  }

  async createReturn(user, acceptedTransferId) {
    const previous = await StoreTransfer.findOne({ _id: acceptedTransferId, status: 'accepted', toUserId: user._id }).populate('fromUserId', 'name email');
    if (!previous) throw new AppError('No se encontró una transferencia recibida que puedas devolver.', 404, 'TRANSFER_RETURN_NOT_FOUND');
    const store = await Store.findOne({ _id: previous.storeId, ownerId: user._id, ...pendingStore });
    if (!store) throw new AppError('La tienda ya no te pertenece.', 409, 'TRANSFER_RETURN_OWNER_CHANGED');
    const email = lowerEmail(previous.fromUserId?.email || previous.fromUserSnapshot?.email);
    if (!email) throw new AppError('El dueño anterior no tiene un email disponible.', 422, 'TRANSFER_RETURN_EMAIL_MISSING');
    return this.create(user, { storeId: store._id, recipientEmail: email, kind: 'return', previousTransferId: previous._id });
  }
}

export const storeTransferService = new StoreTransferService();
