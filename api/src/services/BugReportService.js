import mongoose from 'mongoose';
import sharp from 'sharp';
import { config } from '../config.js';
import { AppError } from '../middleware/core.js';
import { BugReport, Store, User } from '../models/index.js';
import { r2Storage } from './R2StorageService.js';
import { storageCleanupService } from './StorageCleanupService.js';

const privateStorage = { bucket: config.r2.receiptsBucket, bucketVariable: 'R2_RECEIPTS_BUCKET_NAME' };
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_TOTAL_SIZE = 24 * 1024 * 1024;
const MAX_FILES = 5;
const MIME_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/gif', 'gif'],
]);
const FORMAT_MIME = new Map([['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'], ['gif', 'image/gif']]);
const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const safeFilename = value => String(value || 'adjunto').replace(/[\r\n"\\/]+/g, '-').slice(0, 240) || 'adjunto';
const reportError = (message, status = 422, code = 'BUG_REPORT_ERROR') => new AppError(message, status, code);

/** Flujo de reportes de errores y sus adjuntos privados. */
export class BugReportService {
  constructor({ storage = r2Storage, cleanup = storageCleanupService } = {}) {
    this.storage = storage;
    this.cleanup = cleanup;
  }

  async normalizeAttachment(file) {
    if (!file?.buffer?.length) throw reportError('Uno de los adjuntos está vacío.');
    if (file.buffer.length > MAX_FILE_SIZE) throw reportError('Cada imagen o GIF puede pesar hasta 8 MB.', 413, 'BUG_REPORT_FILE_TOO_LARGE');
    if (!MIME_EXTENSIONS.has(file.mimetype)) throw reportError('Los adjuntos deben ser JPG, PNG, WebP o GIF.', 422, 'BUG_REPORT_INVALID_FILE');
    let metadata;
    try { metadata = await sharp(file.buffer, { animated: true, limitInputPixels: 25_000_000 }).metadata(); }
    catch { throw reportError('Uno de los adjuntos no es una imagen válida.', 422, 'BUG_REPORT_INVALID_FILE'); }
    const mimeType = FORMAT_MIME.get(metadata?.format);
    if (!mimeType || mimeType !== file.mimetype) throw reportError('El tipo real de uno de los adjuntos no coincide con el archivo enviado.', 422, 'BUG_REPORT_INVALID_FILE');
    const extension = MIME_EXTENSIONS.get(mimeType);
    if (!metadata?.width || !metadata?.height || metadata.width * metadata.height > 25_000_000) throw reportError('Las imágenes pueden tener hasta 25 megapíxeles.', 422, 'BUG_REPORT_INVALID_FILE');
    if (mimeType === 'image/gif' && (metadata.pages || 1) > 300) throw reportError('El GIF tiene demasiados cuadros. Usá uno más corto.', 422, 'BUG_REPORT_INVALID_FILE');
    return { buffer: file.buffer, extension, mimeType, size: file.buffer.length, name: safeFilename(file.originalname || `adjunto.${extension}`) };
  }

  async create(user, { comment, storeId = null } = {}, files = []) {
    if (!user || user.role !== 'vendedor') throw reportError('Solo los vendedores pueden crear reportes de errores.', 403, 'BUG_REPORT_SELLER_ONLY');
    const normalizedComment = String(comment || '').trim();
    if (normalizedComment.length < 10) throw reportError('Contanos el error con al menos 10 caracteres.');
    if (files.length > MAX_FILES) throw reportError(`Podés adjuntar hasta ${MAX_FILES} archivos.`, 422, 'BUG_REPORT_TOO_MANY_FILES');
    if (files.reduce((sum, file) => sum + Number(file?.buffer?.length || 0), 0) > MAX_TOTAL_SIZE) throw reportError('Los adjuntos del reporte pueden pesar hasta 24 MB en total.', 413, 'BUG_REPORT_TOTAL_TOO_LARGE');

    let store = null;
    if (storeId) {
      if (!mongoose.isValidObjectId(storeId)) throw reportError('La tienda seleccionada no es válida.');
      store = await Store.findOne({ _id: storeId, ownerId: user._id, archived: { $ne: true } }).select('_id name').lean();
      if (!store) throw reportError('La tienda seleccionada no pertenece a tu cuenta.', 403, 'BUG_REPORT_STORE_FORBIDDEN');
    }

    const normalized = [];
    for (const file of files) normalized.push(await this.normalizeAttachment(file));
    if (normalized.length) this.storage.assertConfigured(privateStorage);

    const reportId = new mongoose.Types.ObjectId();
    const stored = [];
    try {
      for (const attachment of normalized) {
        const objectKey = this.storage.objectKey({ storeId: user._id, kind: `bug-reports/${reportId}`, extension: attachment.extension });
        await this.storage.put(objectKey, attachment.buffer, { contentType: attachment.mimeType, cacheControl: 'private, no-store', ...privateStorage });
        stored.push({ ...attachment, objectKey });
      }
      const report = await BugReport.create({
        _id: reportId,
        reporterId: user._id,
        storeId: store?._id || null,
        comment: normalizedComment.slice(0, 5000),
        attachments: stored.map(({ name, mimeType, size, objectKey }) => ({ name, mimeType, size, objectKey })),
      });
      return this.getForUser(report._id, user._id);
    } catch (error) {
      for (const attachment of stored) {
        try { await this.storage.delete(attachment.objectKey, privateStorage); }
        catch (cleanupError) { await this.cleanup.schedule({ objectKey: attachment.objectKey, bucket: config.r2.receiptsBucket, reason: 'bug-report-uncommitted', error: cleanupError }); }
      }
      throw error;
    }
  }

  async listForUser(userId, { limit = 20 } = {}) {
    return BugReport.find({ reporterId: userId }).sort({ createdAt: -1 }).limit(Math.min(50, Math.max(1, Number(limit || 20)))).populate('storeId', 'name').lean();
  }

  async getForUser(id, userId) {
    if (!mongoose.isValidObjectId(id)) throw reportError('Reporte no encontrado.', 404, 'BUG_REPORT_NOT_FOUND');
    const item = await BugReport.findOne({ _id: id, reporterId: userId }).populate('storeId', 'name').lean();
    if (!item) throw reportError('Reporte no encontrado.', 404, 'BUG_REPORT_NOT_FOUND');
    return item;
  }

  async listAdmin({ page = 1, limit = 20, search = '', status = '' } = {}) {
    const term = String(search || '').trim().slice(0, 100);
    const filter = {};
    if (['new', 'reviewing', 'resolved', 'closed'].includes(status)) filter.status = status;
    if (term) {
      const regex = { $regex: escapeRegex(term), $options: 'i' };
      const [users, stores] = await Promise.all([
        User.find({ role: 'vendedor', $or: [{ name: regex }, { email: regex }] }).distinct('_id'),
        Store.find({ name: regex }).distinct('_id'),
      ]);
      filter.$or = [{ comment: regex }, { adminNote: regex }, { reporterId: { $in: users } }, { storeId: { $in: stores } }];
    }
    const [items, total] = await Promise.all([
      BugReport.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('reporterId', 'name email active').populate('storeId', 'name slug').lean(),
      BugReport.countDocuments(filter),
    ]);
    return { items, total };
  }

  async getAdmin(id) {
    if (!mongoose.isValidObjectId(id)) throw reportError('Reporte no encontrado.', 404, 'BUG_REPORT_NOT_FOUND');
    const item = await BugReport.findById(id).populate('reporterId', 'name email active').populate('storeId', 'name slug').populate('reviewedBy', 'name username').lean();
    if (!item) throw reportError('Reporte no encontrado.', 404, 'BUG_REPORT_NOT_FOUND');
    return item;
  }

  async updateAdmin(id, adminId, { status, adminNote } = {}) {
    if (!mongoose.isValidObjectId(id)) throw reportError('Reporte no encontrado.', 404, 'BUG_REPORT_NOT_FOUND');
    const item = await BugReport.findById(id);
    if (!item) throw reportError('Reporte no encontrado.', 404, 'BUG_REPORT_NOT_FOUND');
    if (status !== undefined) {
      if (!['new', 'reviewing', 'resolved', 'closed'].includes(status)) throw reportError('El estado del reporte no es válido.');
      item.status = status;
      item.resolvedAt = status === 'resolved' ? (item.resolvedAt || new Date()) : null;
    }
    if (adminNote !== undefined) item.adminNote = String(adminNote || '').trim().slice(0, 5000);
    item.reviewedBy = adminId;
    await item.save();
    return this.getAdmin(item._id);
  }

  async attachment(id, attachmentId, user) {
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(attachmentId)) throw reportError('Adjunto no encontrado.', 404, 'BUG_REPORT_ATTACHMENT_NOT_FOUND');
    const filter = user?.role === 'admin' ? { _id: id } : { _id: id, reporterId: user?._id };
    const report = await BugReport.findOne(filter).select('+attachments.objectKey');
    const attachment = report?.attachments?.id(attachmentId);
    if (!attachment?.objectKey) throw reportError('Adjunto no encontrado.', 404, 'BUG_REPORT_ATTACHMENT_NOT_FOUND');
    const remote = await this.storage.get(attachment.objectKey, privateStorage);
    return { body: remote.body, name: attachment.name || 'adjunto', mimeType: attachment.mimeType || remote.contentType };
  }

  async deleteAdmin(id) {
    if (!mongoose.isValidObjectId(id)) throw reportError('Reporte no encontrado.', 404, 'BUG_REPORT_NOT_FOUND');
    const report = await BugReport.findById(id).select('+attachments.objectKey');
    if (!report) throw reportError('Reporte no encontrado.', 404, 'BUG_REPORT_NOT_FOUND');
    const attachments = [...(report.attachments || [])].map(attachment => attachment.objectKey).filter(Boolean);
    await BugReport.deleteOne({ _id: report._id });
    for (const objectKey of attachments) {
      try { await this.storage.delete(objectKey, privateStorage); }
      catch (error) { await this.cleanup.schedule({ objectKey, bucket: config.r2.receiptsBucket, reason: 'bug-report-delete', error }); }
    }
    return { deleted: true };
  }
}

export const bugReportService = new BugReportService();
