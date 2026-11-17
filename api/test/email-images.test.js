// 1.26.0: los mails usan miniaturas JPG de las fotos de producto (Outlook no muestra WebP).
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

process.env.ENCRYPTION_KEY ||= '7b'.repeat(32);
process.env.SESSION_SECRET ||= 'email-images-secret';
const { EmailImageService } = await import('../src/services/EmailImageService.js');

const storeId = '6afbc6966fa068d265309e3b', imageId = '249da0cf-b414-4463-a8e2-1c2d3e4f5a6b';
const settings = { appUrl: 'https://mitiendaya.com.ar', r2: { publicUrl: 'https://pub-x.r2.dev' } };

test('convierte la URL de una foto gestionada en su miniatura JPG y rechaza el resto', () => {
  const service = new EmailImageService({ settings, storage: {} });
  assert.equal(service.emailUrl(`https://pub-x.r2.dev/mty/stores/${storeId}/images/${imageId}.webp`), `https://mitiendaya.com.ar/api/public/email-images/${storeId}/${imageId}.jpg`);
  assert.equal(service.emailUrl('https://otro.example.com/foto.webp'), '');
  assert.equal(service.emailUrl(`https://pub-x.r2.dev/mty/stores/${storeId}/receipts/${imageId}.webp`), '');
  assert.equal(service.emailUrl(`https://pub-x.r2.dev/mty/stores/../images/${imageId}.webp`), '');
});

test('genera un JPG de 160 px desde el WebP guardado y lo cachea', async () => {
  const webp = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#6b3e26' } }).webp().toBuffer();
  let reads = 0;
  const storage = { objectKey: ({ storeId, id, extension }) => `mty/stores/${storeId}/images/${id}.${extension}`, async get(key) { reads++; assert.equal(key, `mty/stores/${storeId}/images/${imageId}.webp`); return { body: webp }; } };
  const service = new EmailImageService({ settings, storage });
  const jpg = await service.thumbnail(storeId, imageId);
  const meta = await sharp(jpg).metadata();
  assert.equal(meta.format, 'jpeg'); assert.equal(meta.width, 160); assert.equal(meta.height, 160);
  await service.thumbnail(storeId, imageId);
  assert.equal(reads, 1);
  assert.equal(await service.thumbnail('no-es-un-id', imageId), null);
  assert.equal(await service.thumbnail(storeId, '../../secreto'), null);
});
