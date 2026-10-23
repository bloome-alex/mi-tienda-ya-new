import sharp from 'sharp';
import { config } from '../config.js';
import { AppError } from '../middleware/core.js';
import { Plan, Subscription, SubscriptionSupportRequest, User } from '../models/index.js';
import { r2Storage } from './R2StorageService.js';
import { storageCleanupService } from './StorageCleanupService.js';

const DAY = 86400000;
const receiptStorage = { bucket: config.r2.receiptsBucket, bucketVariable: 'R2_RECEIPTS_BUCKET_NAME' };
const supportError = (message, status = 422, code = 'SUBSCRIPTION_SUPPORT_ERROR') => new AppError(message, status, code);

export class SubscriptionSupportService {
  constructor({ storage = r2Storage, cleanup = storageCleanupService, subscriptionService } = {}) {
    this.storage = storage;
    this.cleanup = cleanup;
    this.subscriptionService = subscriptionService;
  }

  setSubscriptionService(service) { this.subscriptionService = service; return this; }

  async normalizeReceipt(file) {
    if (!file?.buffer || !file.buffer.length) throw supportError('Adjuntá un comprobante de pago.');
    if (file.buffer.length > 8 * 1024 * 1024) throw supportError('El comprobante puede pesar hasta 8 MB.');
    if (file.buffer.subarray(0, 5).toString() === '%PDF-') {
      if (!file.buffer.subarray(Math.max(0, file.buffer.length - 2048)).toString().includes('%%EOF')) throw supportError('El PDF está incompleto o no es válido.');
      return { buffer: file.buffer, extension: 'pdf', mimeType: 'application/pdf' };
    }
    try {
      const metadata = await sharp(file.buffer, { limitInputPixels: 25000000 }).metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('unsupported');
      const buffer = await sharp(file.buffer, { limitInputPixels: 25000000 }).rotate().resize({ width: 2000, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
      return { buffer, extension: 'jpg', mimeType: 'image/jpeg' };
    } catch {
      throw supportError('El comprobante debe ser una imagen JPEG, PNG, WebP o un PDF válido.');
    }
  }

  async create(userId, file, { note = '' } = {}) {
    const subscription = await Subscription.findOne({ userId, current: true, status: 'pending' });
    if (!subscription) throw supportError('No hay una vinculación pendiente para revisar.', 409, 'PENDING_SUBSCRIPTION_NOT_FOUND');
    if (subscription.pendingExpiresAt && subscription.pendingExpiresAt <= new Date()) throw supportError('La vinculación pendiente ya venció. Cancelala y generá una nueva.', 409, 'PENDING_SUBSCRIPTION_EXPIRED');
    if (await SubscriptionSupportRequest.exists({ subscriptionId: subscription._id, status: 'pending' })) throw supportError('Ya enviaste un comprobante para esta vinculación. Administración todavía lo está revisando.', 409, 'SUBSCRIPTION_SUPPORT_ALREADY_PENDING');
    const normalized = await this.normalizeReceipt(file);
    this.storage.assertConfigured(receiptStorage);
    const objectKey = this.storage.objectKey({ storeId: userId, kind: `subscription-support/${subscription._id}`, extension: normalized.extension });
    await this.storage.put(objectKey, normalized.buffer, { contentType: normalized.mimeType, cacheControl: 'private, no-store', ...receiptStorage });
    try {
      return await SubscriptionSupportRequest.create({
        userId, subscriptionId: subscription._id, planId: subscription.planId, note: String(note || '').trim().slice(0, 2000),
        receipt: { objectKey, name: `comprobante-suscripcion-${subscription._id}.${normalized.extension}`, mimeType: normalized.mimeType, uploadedAt: new Date() },
      });
    } catch (error) {
      try { await this.storage.delete(objectKey, receiptStorage); }
      catch (cleanupError) { await this.cleanup.schedule({ storeId: userId, objectKey, bucket: config.r2.receiptsBucket, reason: 'subscription-support-uncommitted', error: cleanupError }); }
      throw error;
    }
  }

  async currentForUser(userId, subscriptionId = null) {
    return SubscriptionSupportRequest.findOne({ userId, ...(subscriptionId ? { subscriptionId } : {}) }).sort({ createdAt: -1 }).lean();
  }

  async listPending() {
    return SubscriptionSupportRequest.find({ status: 'pending' }).sort({ createdAt: 1 }).populate('userId', 'name email active').populate('planId', 'name price durationDays').lean();
  }

  async closePendingForSubscription(subscriptionId, reason = 'La vinculación dejó de estar pendiente.') {
    await SubscriptionSupportRequest.updateMany({ subscriptionId, status: 'pending' }, { $set: { status: 'rejected', reviewedAt: new Date(), adminNote: String(reason).slice(0, 2000) } });
  }

  async resolveProviderConfirmed(subscriptionId) {
    await SubscriptionSupportRequest.updateMany({ subscriptionId, status: 'pending' }, { $set: { status: 'approved', reviewedAt: new Date(), adminNote: 'Mercado Pago confirmó la vinculación automáticamente.' } });
  }

  async receipt(id) {
    const request = await SubscriptionSupportRequest.findById(id).select('+receipt.objectKey');
    if (!request?.receipt?.objectKey) throw supportError('La solicitud no tiene comprobante.', 404, 'SUBSCRIPTION_SUPPORT_RECEIPT_NOT_FOUND');
    const remote = await this.storage.get(request.receipt.objectKey, receiptStorage);
    return { body: remote.body, name: request.receipt.name || 'comprobante', mimeType: request.receipt.mimeType || remote.contentType };
  }

  async approve(id, adminId, { note = '' } = {}) {
    const request = await SubscriptionSupportRequest.findOne({ _id: id, status: 'pending' });
    if (!request) throw supportError('La solicitud ya fue resuelta o no existe.', 404, 'SUBSCRIPTION_SUPPORT_NOT_FOUND');
    let subscription = await Subscription.findById(request.subscriptionId);
    if (!subscription) throw supportError('La suscripción asociada ya no existe.', 409, 'SUBSCRIPTION_NOT_FOUND');

    if (this.subscriptionService && subscription.current && subscription.providerSubscriptionId) {
      try { await this.subscriptionService.syncCurrent(subscription.userId); subscription = await Subscription.findById(subscription._id); }
      catch { /* La aprobación manual sigue disponible si Mercado Pago no responde. */ }
    }

    const user = await User.findById(request.userId);
    const plan = await Plan.findById(request.planId);
    if (!user || !plan) throw supportError('No se pudo resolver el vendedor o el plan de la solicitud.', 409, 'SUBSCRIPTION_SUPPORT_INVALID_REFERENCE');

    let manualAccessUntil = null;
    if (!(subscription.status === 'authorized' && user.planExpiresAt && user.planExpiresAt > new Date())) {
      const base = Math.max(Date.now(), +(user.planExpiresAt || 0), +(user.subscriptionManualAccessUntil || 0));
      manualAccessUntil = new Date(base + Number(plan.durationDays) * DAY);
      user.planId = plan._id;
      user.subscriptionManualAccessUntil = manualAccessUntil;
      await user.save();
    }

    request.status = 'approved'; request.reviewedBy = adminId; request.reviewedAt = new Date(); request.adminNote = String(note || '').trim().slice(0, 2000); request.manualAccessUntil = manualAccessUntil;
    await request.save();
    return { request, user, subscription };
  }

  async reject(id, adminId, { note = '' } = {}) {
    const request = await SubscriptionSupportRequest.findOne({ _id: id, status: 'pending' });
    if (!request) throw supportError('La solicitud ya fue resuelta o no existe.', 404, 'SUBSCRIPTION_SUPPORT_NOT_FOUND');
    request.status = 'rejected'; request.reviewedBy = adminId; request.reviewedAt = new Date(); request.adminNote = String(note || '').trim().slice(0, 2000);
    await request.save();
    return request;
  }
}

export const subscriptionSupportService = new SubscriptionSupportService();
