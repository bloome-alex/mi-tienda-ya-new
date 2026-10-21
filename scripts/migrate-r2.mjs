import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from '../api/src/config.js';
import { UploadedImage, Product, Store } from '../api/src/models/index.js';
import { Order } from '../api/src/models/commerce.js';
import { r2Storage } from '../api/src/services/R2StorageService.js';

const contentTypeFor = extension => ({ '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf' }[extension.toLowerCase()] || 'application/octet-stream');
const replaceExact = (value, from, to) => {
  if (typeof value === 'string') return value === from ? to : value;
  if (Array.isArray(value)) return value.map(item => replaceExact(item, from, to));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceExact(child, from, to)]));
  return value;
};

async function migrateImage(asset) {
  if (asset.objectKey && asset.storage === 'r2') return false;
  const local = path.join(config.uploadDir, 'images', path.basename(asset.name));
  const body = await fs.readFile(local);
  const extension = path.extname(asset.name) || '.bin';
  const objectKey = r2Storage.objectKey({ storeId: asset.storeId, kind: 'images', extension: extension.slice(1), id: path.parse(asset.name).name });
  const publicUrl = r2Storage.publicUrl(objectKey);
  await r2Storage.put(objectKey, body, { contentType: contentTypeFor(extension), cacheControl: 'public, max-age=31536000, immutable' });

  const oldUrl = asset.url;
  await Product.updateMany({ storeId: asset.storeId, images: oldUrl }, { $set: { 'images.$[image]': publicUrl } }, { arrayFilters: [{ image: oldUrl }] });
  await Order.updateMany({ storeId: asset.storeId, 'items.image': oldUrl }, { $set: { 'items.$[item].image': publicUrl } }, { arrayFilters: [{ 'item.image': oldUrl }] });
  const store = await Store.findById(asset.storeId);
  if (store) {
    const next = replaceExact(store.design || {}, oldUrl, publicUrl);
    if (JSON.stringify(next) !== JSON.stringify(store.design || {})) { store.design = next; store.markModified('design'); await store.save(); }
  }
  await UploadedImage.updateOne({ _id: asset._id }, { $set: { objectKey, storage: 'r2', url: publicUrl, attached: true } });
  await fs.unlink(local).catch(() => {});
  return true;
}

async function migrateReceipt(order) {
  if (!order.receipt?.path || order.receipt?.objectKey) return false;
  const local = path.join(config.uploadDir, 'receipts', path.basename(order.receipt.path));
  const body = await fs.readFile(local);
  const extension = path.extname(order.receipt.path) || (order.receipt.mimeType === 'application/pdf' ? '.pdf' : '.jpg');
  const objectKey = r2Storage.objectKey({ storeId: order.storeId, kind: `receipts/${order._id}`, extension: extension.slice(1), id: path.parse(order.receipt.path).name });
  await r2Storage.put(objectKey, body, { contentType: order.receipt.mimeType || contentTypeFor(extension), cacheControl: 'private, no-store', bucket: config.r2.receiptsBucket, bucketVariable: 'R2_RECEIPTS_BUCKET_NAME' });
  await Order.updateOne({ _id: order._id, 'receipt.path': order.receipt.path }, { $set: { 'receipt.objectKey': objectKey }, $unset: { 'receipt.path': 1 } });
  await fs.unlink(local).catch(() => {});
  return true;
}

async function main() {
  r2Storage.assertConfigured({ publicAsset: true, bucket: config.r2.assetsBucket, bucketVariable: 'R2_ASSETS_BUCKET_NAME' });
  r2Storage.assertConfigured({ bucket: config.r2.receiptsBucket, bucketVariable: 'R2_RECEIPTS_BUCKET_NAME' });
  await mongoose.connect(config.mongoUri);
  let images = 0, receipts = 0, failures = 0;
  try {
    const legacyImages = await UploadedImage.find({ $or: [{ objectKey: { $exists: false } }, { objectKey: null }, { storage: { $ne: 'r2' } }] }).select('+contentHash').lean();
    for (const asset of legacyImages) {
      try { if (await migrateImage(asset)) { images++; console.log(`[R2] imagen ${asset._id} migrada`); } }
      catch (error) { failures++; console.error(`[R2] no se pudo migrar imagen ${asset._id}: ${error.message}`); }
    }
    const legacyReceipts = await Order.find({ 'receipt.path': { $type: 'string' }, 'receipt.objectKey': { $exists: false } }).select('+receipt.path +receipt.objectKey');
    for (const order of legacyReceipts) {
      try { if (await migrateReceipt(order)) { receipts++; console.log(`[R2] comprobante ${order.number} migrado`); } }
      catch (error) { failures++; console.error(`[R2] no se pudo migrar comprobante ${order.number}: ${error.message}`); }
    }
    console.log(`[R2] migración terminada: ${images} imágenes, ${receipts} comprobantes, ${failures} errores.`);
    if (failures) process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
}

main().catch(error => { console.error('[R2] migración abortada:', error.message); process.exitCode = 1; });
