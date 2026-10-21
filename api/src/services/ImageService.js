import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { UploadedImage } from '../models/index.js';
import { AppError } from '../middleware/core.js';
import { wallpaperSpecs } from '../../../client/src/services/design.js';

const maxSize = 5 * 1024 * 1024;
const specs = Object.fromEntries(Object.values(wallpaperSpecs).map(spec => [spec.purpose, spec]));
const digest = value => createHash('sha256').update(value).digest('hex');
const dimensions = meta => [5, 6, 7, 8].includes(meta.orientation) ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
const invalid = message => new AppError(message, 422, 'INVALID_WALLPAPER');

export class ImageService {
  async upload({ files, purpose = 'image', storeId, actorId }) {
    if (!files?.length) throw new AppError('Seleccioná al menos una imagen.', 422);
    if (purpose !== 'image' && !specs[purpose]) throw invalid('El propósito de la imagen no es válido.');
    const spec = specs[purpose];
    if (spec && files.length !== 1) throw invalid('Subí un solo fondo por vez.');
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
      // WebP cannot encode an axis longer than 16,383 pixels. A valid panorama
      // still fits our pixel budget, so retain its resolution using PNG.
      const outputFormat = spec && (oriented.width > 16383 || oriented.height > 16383) ? 'png' : 'webp';
      let output;
      try { output = await (outputFormat === 'png' ? transform.png({ compressionLevel: 9 }) : transform.webp({ quality: 86 })).toBuffer({ resolveWithObject: true }); }
      catch { throw new AppError('No se pudo procesar la imagen. Revisá el archivo.', 422, 'INVALID_IMAGE'); }
      if (spec && (output.info.width !== oriented.width || output.info.height !== oriented.height)) throw invalid('No se pudieron conservar las dimensiones del fondo.');
      if (output.data.length > maxSize) throw new AppError('La imagen procesada supera 5 MiB. Usá una imagen más liviana.', 413, 'FILE_TOO_LARGE');
      const name = randomUUID() + '.' + outputFormat;
      prepared.push({ name, url: '/uploads/images/' + name, width: output.info.width, height: output.info.height, size: output.data.length, purpose, data: output.data, contentHash: digest(output.data) });
    }
    const directory = path.join(config.uploadDir, 'images');
    await fs.mkdir(directory, { recursive: true });
    const written = [];
    try {
      for (const image of prepared) {
        await fs.writeFile(path.join(directory, image.name), image.data, { flag: 'wx' }); written.push(image);
        const { data, ...metadata } = image;
        await UploadedImage.create({ ...metadata, storeId, uploadedBy: actorId });
      }
    } catch (error) {
      await Promise.allSettled(written.map(image => fs.unlink(path.join(directory, image.name))));
      await UploadedImage.deleteMany({ storeId, url: { $in: written.map(image => image.url) } }).catch(() => {});
      throw error;
    }
    return prepared.map(({ url, name, width, height, purpose }) => ({ url, name, width, height, purpose }));
  }

  async validateWallpapers(storeId, design) {
    for (const [device, spec] of Object.entries(wallpaperSpecs)) {
      const url = design.wallpaper[device + 'Image'];
      if (!url) continue;
      // Only app-owned immutable files with provenance for this exact store and
      // purpose can become backgrounds. The server never fetches image URLs.
      const asset = await UploadedImage.findOne({ storeId, url, purpose: spec.purpose }).select('+contentHash').lean();
      if (!asset || !/^[a-f\d-]{36}\.(webp|png)$/i.test(asset.name) || asset.url !== '/uploads/images/' + asset.name) throw invalid('Volvé a subir el fondo de ' + spec.label.toLowerCase() + ' desde esta tienda.');
      const filename = path.join(config.uploadDir, 'images', asset.name);
      const stat = await fs.lstat(filename).catch(() => null);
      if (!stat?.isFile() || stat.size > maxSize) throw invalid('El fondo guardado no está disponible o supera el tamaño permitido.');
      const buffer = await fs.readFile(filename).catch(() => null);
      const meta = buffer ? await sharp(buffer, { limitInputPixels: 25000000, animated: false }).metadata().catch(() => null) : null;
      if (!meta || !['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages || 1) !== 1) throw invalid('El fondo guardado ya no es una imagen válida.');
      const actual = dimensions(meta);
      if (!Number.isSafeInteger(actual.width) || !Number.isSafeInteger(actual.height) || actual.width < 1 || actual.height < 1 || actual.width * actual.height > 25000000 || actual.width !== asset.width || actual.height !== asset.height || digest(buffer) !== asset.contentHash) throw invalid('El fondo guardado cambió o no coincide con su archivo original. Volvé a subirlo.');
    }
  }
}
export const imageService = new ImageService();
