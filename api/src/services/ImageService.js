import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import { UploadedImage } from '../models/index.js';
import { AppError } from '../middleware/core.js';
import { wallpaperSpecs } from '../../../client/src/services/design.js';
import { r2Storage } from './R2StorageService.js';
import { assetService } from './AssetService.js';
import { storageCleanupService } from './StorageCleanupService.js';
import { collectDesignImageUrls } from '../utils/assets.js';

const maxSize = 5 * 1024 * 1024;
const specs = Object.fromEntries(Object.values(wallpaperSpecs).map(spec => [spec.purpose, spec]));
const digest = value => createHash('sha256').update(value).digest('hex');
const dimensions = meta => [5, 6, 7, 8].includes(meta.orientation) ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
const invalid = message => new AppError(message, 422, 'INVALID_WALLPAPER');

export class ImageService {
  constructor({ storage = r2Storage, assets = assetService, cleanup = storageCleanupService } = {}) { this.storage = storage; this.assets = assets; this.cleanup = cleanup; }

  async upload({ files, purpose = 'image', storeId, actorId }) {
    if (!files?.length) throw new AppError('Seleccioná al menos una imagen.', 422);
    if (purpose !== 'image' && !specs[purpose]) throw invalid('El propósito de la imagen no es válido.');
    const spec = specs[purpose];
    if (spec && files.length !== 1) throw invalid('Subí un solo fondo por vez.');
    this.storage.assertConfigured({ publicAsset: true });
    const prepared = [];
    for (const file of files) {
      if (!file.buffer || file.buffer.length > maxSize) throw new AppError('La imagen supera el máximo de 5 MiB.', 413, 'FILE_TOO_LARGE');
      const processor = sharp(file.buffer, { limitInputPixels: 25000000, animated: false });
      const meta = await processor.metadata().catch(() => null);
      if (!meta || !['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages || 1) !== 1) throw new AppError('Usá una imagen estática JPG, PNG o WebP válida.', 422, 'INVALID_IMAGE');
      const oriented = dimensions(meta);
      if (!Number.isSafeInteger(oriented.width) || !Number.isSafeInteger(oriented.height) || oriented.width < 1 || oriented.height < 1 || oriented.width * oriented.height > 25000000) throw new AppError('La imagen debe tener dimensiones válidas y hasta 25 megapíxeles.', 422, 'INVALID_IMAGE');
      let transform = processor.rotate();
      if (!spec) transform = transform.resize(2000, 2000, { fit: 'inside', withoutEnlargement: true });
      const outputFormat = spec && (oriented.width > 16383 || oriented.height > 16383) ? 'png' : 'webp';
      let output;
      try { output = await (outputFormat === 'png' ? transform.png({ compressionLevel: 9 }) : transform.webp({ quality: 86 })).toBuffer({ resolveWithObject: true }); }
      catch { throw new AppError('No se pudo procesar la imagen. Revisá el archivo.', 422, 'INVALID_IMAGE'); }
      if (spec && (output.info.width !== oriented.width || output.info.height !== oriented.height)) throw invalid('No se pudieron conservar las dimensiones del fondo.');
      if (output.data.length > maxSize) throw new AppError('La imagen procesada supera 5 MiB. Usá una imagen más liviana.', 413, 'FILE_TOO_LARGE');
      const id = randomUUID();
      const name = `${id}.${outputFormat}`;
      const objectKey = this.storage.objectKey({ storeId, kind: 'images', extension: outputFormat, id });
      prepared.push({ name, objectKey, url: this.storage.publicUrl(objectKey), width: output.info.width, height: output.info.height, size: output.data.length, purpose, data: output.data, contentHash: digest(output.data), contentType: outputFormat === 'png' ? 'image/png' : 'image/webp' });
    }
    const stored = [];
    try {
      for (const image of prepared) {
        await this.storage.put(image.objectKey, image.data, { contentType: image.contentType, cacheControl: 'public, max-age=31536000, immutable' });
        stored.push(image);
        const { data, contentType, ...metadata } = image;
        await UploadedImage.create({ ...metadata, storage: 'r2', storeId, uploadedBy: actorId });
      }
    } catch (error) {
      for (const image of stored) {
        try { await this.storage.delete(image.objectKey); }
        catch (cleanupError) { await this.cleanup.schedule({ storeId, objectKey: image.objectKey, reason: 'image-upload-rollback', error: cleanupError }); }
      }
      await UploadedImage.deleteMany({ storeId, objectKey: { $in: stored.map(image => image.objectKey) } }).catch(() => {});
      throw error;
    }
    return prepared.map(({ url, name, objectKey, width, height, purpose }) => ({ url, name, objectKey, width, height, purpose }));
  }

  async validateWallpapers(storeId, design) {
    for (const [device, spec] of Object.entries(wallpaperSpecs)) {
      const url = design.wallpaper[device + 'Image'];
      if (!url) continue;
      const asset = await UploadedImage.findOne({ storeId, url, purpose: spec.purpose, storage: 'r2' }).select('+contentHash').lean();
      if (!asset?.objectKey) throw invalid('Volvé a subir el fondo de ' + spec.label.toLowerCase() + ' desde esta tienda.');
      const remote = await this.storage.get(asset.objectKey).catch(() => null);
      if (!remote?.body || remote.body.length > maxSize || remote.body.length !== asset.size || digest(remote.body) !== asset.contentHash) throw invalid('El fondo guardado en R2 no está disponible o cambió. Volvé a subirlo.');
      const meta = await sharp(remote.body, { limitInputPixels: 25000000, animated: false }).metadata().catch(() => null);
      if (!meta || !['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages || 1) !== 1) throw invalid('El fondo guardado ya no es una imagen válida.');
      const actual = dimensions(meta);
      if (!Number.isSafeInteger(actual.width) || !Number.isSafeInteger(actual.height) || actual.width < 1 || actual.height < 1 || actual.width * actual.height > 25000000 || actual.width !== asset.width || actual.height !== asset.height) throw invalid('El fondo guardado no coincide con el archivo original. Volvé a subirlo.');
    }
  }

  async validateDesignAssets(storeId, design) { await this.assets.assertOwned(storeId, collectDesignImageUrls(design)); }
}
export const imageService = new ImageService();
