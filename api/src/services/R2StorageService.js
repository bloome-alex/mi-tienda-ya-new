import crypto from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../middleware/core.js';
import { createSignedR2Request, encodeR2Key } from '../utils/r2Signature.js';

export class R2StorageService {
  constructor({ fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {
    this.fetch = fetchImpl;
    this.clock = clock;
  }

  assertConfigured({ publicAsset = false, bucket = config.r2.assetsBucket, bucketVariable = 'R2_ASSETS_BUCKET_NAME' } = {}) {
    const required = [['R2_ACCOUNT_ID', config.r2.accountId], ['R2_ACCESS_KEY_ID', config.r2.accessKeyId], ['R2_SECRET_ACCESS_KEY', config.r2.secretAccessKey], [bucketVariable, bucket]];
    if (publicAsset) required.push(['R2_PUBLIC_URL', config.r2.publicUrl]);
    const missing = required.filter(([, value]) => !String(value || '').trim()).map(([name]) => name);
    if (missing.length) throw new AppError(`Configurá ${missing.join(', ')} para usar Cloudflare R2.`, 503, 'R2_NOT_CONFIGURED');
  }

  endpoint() {
    return String(config.r2.endpoint || `https://${config.r2.accountId}.r2.cloudflarestorage.com`).replace(/\/$/, '');
  }

  objectKey({ storeId, kind = 'images', extension = 'bin', id = crypto.randomUUID() }) {
    const prefix = String(config.r2.prefix || 'mi-tienda-ya-2').replace(/^\/+|\/+$/g, '');
    const cleanKind = String(kind).replace(/[^a-z0-9/_-]+/gi, '-').replace(/^\/+|\/+$/g, '');
    const cleanExt = String(extension).replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'bin';
    return [prefix, 'stores', String(storeId), cleanKind, `${id}.${cleanExt}`].filter(Boolean).join('/');
  }

  publicUrl(key) {
    this.assertConfigured({ publicAsset: true });
    return `${String(config.r2.publicUrl).replace(/\/$/, '')}/${encodeR2Key(key)}`;
  }

  signedRequest(method, key, { body = Buffer.alloc(0), contentType = '', cacheControl = '', extraHeaders = {}, bucket = config.r2.assetsBucket, bucketVariable = 'R2_ASSETS_BUCKET_NAME' } = {}) {
    this.assertConfigured({ bucket, bucketVariable });
    return createSignedR2Request({ method, endpoint: this.endpoint(), bucket, key, accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey, body, contentType, cacheControl, extraHeaders, now: this.clock() });
  }

  async request(method, key, options = {}) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      const signed = this.signedRequest(method, key, options);
      let response;
      try { response = await this.fetch(signed.url, { method, headers: signed.headers, body: ['GET', 'HEAD', 'DELETE'].includes(method) ? undefined : signed.body }); }
      catch (error) {
        lastError = new AppError(`No se pudo conectar con Cloudflare R2: ${error.message}`, 503, 'R2_UNAVAILABLE');
        if (attempt < 2) { await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1))); continue; }
        throw lastError;
      }
      if (response.ok) return response;
      const detail = await response.text().catch(() => '');
      lastError = new AppError(`Cloudflare R2 rechazó la operación (${response.status}).${detail ? ' ' + detail.slice(0, 300) : ''}`, 503, 'R2_ERROR');
      if (attempt < 2 && (response.status === 429 || response.status >= 500)) { await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1))); continue; }
      throw lastError;
    }
    throw lastError;
  }

  async put(key, body, { contentType = 'application/octet-stream', cacheControl = '', bucket = config.r2.assetsBucket, bucketVariable = 'R2_ASSETS_BUCKET_NAME' } = {}) {
    await this.request('PUT', key, { body, contentType, cacheControl, bucket, bucketVariable });
    return { key };
  }

  async get(key, { bucket = config.r2.assetsBucket, bucketVariable = 'R2_ASSETS_BUCKET_NAME' } = {}) {
    const response = await this.request('GET', key, { bucket, bucketVariable });
    return { body: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || 'application/octet-stream', size: Number(response.headers.get('content-length') || 0) || undefined };
  }

  async delete(key, { bucket = config.r2.assetsBucket, bucketVariable = 'R2_ASSETS_BUCKET_NAME' } = {}) {
    await this.request('DELETE', key, { bucket, bucketVariable });
  }

  async deleteMany(keys, options = {}) {
    const unique = [...new Set((keys || []).filter(Boolean))];
    for (const key of unique) await this.delete(key, options);
  }
}

export const r2Storage = new R2StorageService();
