import { UploadedImage, Product, Store } from '../models/index.js';
import { AppError } from '../middleware/core.js';
import { r2Storage } from './R2StorageService.js';
import { storageCleanupService } from './StorageCleanupService.js';
import { collectDesignImageUrls } from '../utils/assets.js';

const unique = values => [...new Set((values || []).filter(Boolean))];

export class AssetService {
  constructor({ storage = r2Storage, cleanup = storageCleanupService } = {}) { this.storage = storage; this.cleanup = cleanup; }

  async managedAssets(storeId, urls) {
    const list = unique(urls);
    if (!list.length) return [];
    return UploadedImage.find({ storeId, url: { $in: list }, storage: 'r2' }).select('+contentHash').lean();
  }

  async assertOwned(storeId, urls) {
    const candidates = unique(urls).filter(url => !String(url).startsWith('/demo/'));
    if (!candidates.length) return;
    const assets = await UploadedImage.find({ storeId, url: { $in: candidates }, storage: 'r2' }).select('url').lean();
    const owned = new Set(assets.map(asset => asset.url));
    const foreign = candidates.filter(url => !owned.has(url));
    if (foreign.length) throw new AppError('Las imágenes de la tienda deben subirse desde esta aplicación para guardarse en Cloudflare R2.', 422, 'UNMANAGED_ASSET');
  }

  async deleteUrls(storeId, urls) {
    const assets = await this.managedAssets(storeId, urls);
    if (!assets.length) return { deleted: 0 };
    // La llamada espera a R2 antes de borrar los metadatos de MongoDB. Si R2
    // falla, el request falla y el documento queda disponible para reintentar.
    try { await this.storage.deleteMany(assets.map(asset => asset.objectKey)); }
    catch (error) {
      await Promise.allSettled(assets.map(asset => this.cleanup.schedule({ storeId, objectKey: asset.objectKey, reason: 'asset-unreferenced', error })));
      throw error;
    }
    await UploadedImage.deleteMany({ _id: { $in: assets.map(asset => asset._id) } });
    return { deleted: assets.length };
  }

  async cleanupDifference(storeId, beforeUrls, afterUrls) {
    const keep = new Set(unique(afterUrls));
    return this.deleteUnclaimed(storeId, unique(beforeUrls).filter(url => !keep.has(url)));
  }

  async markAttached(storeId, urls) {
    const list = unique(urls);
    if (!list.length) return;
    await UploadedImage.updateMany({ storeId, url: { $in: list }, storage: 'r2' }, { $set: { attached: true } });
  }

  async markDesignAttached(storeId, design) { return this.markAttached(storeId, collectDesignImageUrls(design)); }

  async cleanupProductImages(product, nextImages = []) {
    return this.cleanupDifference(product.storeId, product.images || [], nextImages);
  }

  async cleanupDesignImages(storeId, beforeDesign, nextDesign) {
    return this.cleanupDifference(storeId, collectDesignImageUrls(beforeDesign), collectDesignImageUrls(nextDesign));
  }

  async isReferenced(storeId, url) {
    if (await Product.exists({ storeId, archived: { $ne: true }, images: url })) return true;
    const store = await Store.findById(storeId).select('design').lean();
    return store ? collectDesignImageUrls(store.design).includes(url) : false;
  }

  async deleteUnclaimed(storeId, urls) {
    const removable = [];
    for (const url of unique(urls)) if (!await this.isReferenced(storeId, url)) removable.push(url);
    return this.deleteUrls(storeId, removable);
  }
}

export const assetService = new AssetService();
