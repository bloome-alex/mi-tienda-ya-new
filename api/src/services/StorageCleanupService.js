import { StorageCleanup, UploadedImage, Product, Store, SubscriptionSupportRequest } from '../models/index.js';
import { Order } from '../models/commerce.js';
import { r2Storage } from './R2StorageService.js';
import { config } from '../config.js';

export class StorageCleanupService {
  constructor({ storage = r2Storage } = {}) { this.storage = storage; }

  async schedule({ storeId, objectKey, bucket = config.r2.assetsBucket, reason = 'cleanup', error }) {
    if (!objectKey) return;
    await StorageCleanup.updateOne(
      { objectKey },
      { $setOnInsert: { storeId, bucket, objectKey, reason }, $set: { bucket, lastError: String(error?.message || error || '').slice(0, 1000), availableAt: new Date(Date.now() + 30_000) } },
      { upsert: true }
    ).catch(() => {});
  }

  async referenced(objectKey) {
    if (await UploadedImage.exists({ objectKey, attached: true })) {
      const asset = await UploadedImage.findOne({ objectKey }).select('storeId url').lean();
      if (asset) {
        if (await Product.exists({ storeId: asset.storeId, archived: { $ne: true }, images: asset.url })) return true;
        const store = await Store.findById(asset.storeId).select('design').lean();
        if (store && JSON.stringify(store.design || {}).includes(asset.url)) return true;
      }
    }
    if (await Order.exists({ 'receipt.objectKey': objectKey })) return true;
    if (await SubscriptionSupportRequest.exists({ 'receipt.objectKey': objectKey })) return true;
    return false;
  }

  async run(limit = 30) {
    const jobs = await StorageCleanup.find({ availableAt: { $lte: new Date() } }).sort({ createdAt: 1 }).limit(limit);
    for (const job of jobs) {
      if (await this.referenced(job.objectKey)) { await StorageCleanup.deleteOne({ _id: job._id }); continue; }
      try {
        await this.storage.delete(job.objectKey, { bucket: job.bucket || config.r2.assetsBucket, bucketVariable: job.bucket === config.r2.receiptsBucket ? 'R2_RECEIPTS_BUCKET_NAME' : 'R2_ASSETS_BUCKET_NAME' });
        await UploadedImage.deleteOne({ objectKey: job.objectKey });
        await StorageCleanup.deleteOne({ _id: job._id });
      } catch (error) {
        job.attempts += 1;
        job.lastError = String(error.message || error).slice(0, 1000);
        job.availableAt = new Date(Date.now() + Math.min(3600_000, 30_000 * 2 ** Math.min(job.attempts, 7)));
        await job.save();
      }
    }
  }

  async sweepUnattached({ olderThanMs = 24 * 3600_000, limit = 50 } = {}) {
    const assets = await UploadedImage.find({ storage: 'r2', attached: false, createdAt: { $lt: new Date(Date.now() - olderThanMs) } }).limit(limit).lean();
    for (const asset of assets) {
      const productRef = await Product.exists({ storeId: asset.storeId, archived: { $ne: true }, images: asset.url });
      const store = await Store.findById(asset.storeId).select('design').lean();
      const designRef = store && JSON.stringify(store.design || {}).includes(asset.url);
      if (productRef || designRef) { await UploadedImage.updateOne({ _id: asset._id }, { $set: { attached: true } }); continue; }
      try { await this.storage.delete(asset.objectKey); await UploadedImage.deleteOne({ _id: asset._id }); }
      catch (error) { await this.schedule({ storeId: asset.storeId, objectKey: asset.objectKey, reason: 'unattached-upload', error }); }
    }
  }
}

export const storageCleanupService = new StorageCleanupService();
