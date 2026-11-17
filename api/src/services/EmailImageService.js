import sharp from 'sharp';
import { config } from '../config.js';
import { r2Storage } from './R2StorageService.js';

/**
 * Miniaturas JPG para mails. Las fotos se guardan en WebP y Outlook de escritorio no muestra WebP:
 * el mail apunta a /api/public/email-images/:storeId/:imageId.jpg y acá se convierte al vuelo.
 */
const ID = /^[a-f0-9]{24}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIZE = 160;

export class EmailImageService {
  constructor({ storage = r2Storage, settings = config, cacheSize = 200 } = {}) {
    this.storage = storage; this.settings = settings; this.cacheSize = cacheSize; this.cache = new Map();
  }

  /** Convierte la URL pública de una foto de producto en la URL de su miniatura JPG, o devuelve '' si no es una foto gestionada. */
  emailUrl(imageUrl) {
    const base = String(this.settings.r2?.publicUrl || '').replace(/\/$/, '');
    const appUrl = String(this.settings.appUrl || '').replace(/\/$/, '');
    if (!base || !appUrl || !String(imageUrl || '').startsWith(base + '/')) return '';
    const parts = String(imageUrl).slice(base.length + 1).split('/');
    const file = parts.pop(), kind = parts.pop(), storeId = parts.pop(), stores = parts.pop();
    const imageId = String(file || '').replace(/\.webp$/i, '');
    if (stores !== 'stores' || kind !== 'images' || !ID.test(storeId || '') || !UUID.test(imageId) || !/\.webp$/i.test(file || '')) return '';
    return `${appUrl}/api/public/email-images/${storeId}/${imageId}.jpg`;
  }

  async thumbnail(storeId, imageId) {
    if (!ID.test(String(storeId)) || !UUID.test(String(imageId))) return null;
    const cacheKey = `${storeId}/${imageId}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    const key = this.storage.objectKey({ storeId, kind: 'images', extension: 'webp', id: imageId });
    let source;
    try { source = await this.storage.get(key); } catch { return null; }
    const body = await sharp(source.body, { limitInputPixels: 25000000 }).resize(SIZE, SIZE, { fit: 'cover' }).flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    this.cache.set(cacheKey, body);
    if (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value);
    return body;
  }
}

export const emailImageService = new EmailImageService();
