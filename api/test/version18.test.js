import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createSignedR2Request, encodeR2Key } from '../src/utils/r2Signature.js';
import { collectDesignImageUrls } from '../src/utils/assets.js';

test('la firma S3 para R2 usa el endpoint, scope auto y headers esperados', () => {
  const signed=createSignedR2Request({method:'PUT',endpoint:'https://account123.r2.cloudflarestorage.com',bucket:'mi-tienda',key:'mi-tienda-ya-2/stores/store-1/images/asset-1.webp',accessKeyId:'access123',secretAccessKey:'secret123',body:Buffer.from('imagen'),contentType:'image/webp',cacheControl:'public, max-age=31536000, immutable',now:new Date('2026-10-21T18:00:00.000Z')});
  assert.equal(signed.url,'https://account123.r2.cloudflarestorage.com/mi-tienda/mi-tienda-ya-2/stores/store-1/images/asset-1.webp');
  assert.match(signed.headers.authorization,/^AWS4-HMAC-SHA256 Credential=access123\/20261021\/auto\/s3\/aws4_request,/);
  assert.equal(signed.headers['x-amz-date'],'20261021T180000Z');
  assert.equal(signed.headers['content-type'],'image/webp');
  assert.equal(encodeR2Key('carpeta con espacio/imagen.webp'),'carpeta%20con%20espacio/imagen.webp');
});

test('el recolector de diseño incluye imágenes anidadas y excluye enlaces que no son archivos', () => {
  const urls = collectDesignImageUrls({
    brand: { logo: 'https://media/logo.webp', favicon: 'https://media/favicon.webp' },
    shop: { heroImage: 'https://media/hero.webp', heroSlides: [{ image: 'https://media/slide.webp', buttonTarget: 'catalog' }] },
    sections: [{ image: 'https://media/section.webp', blocks: [{ image: 'https://media/block.webp', buttonTarget: 'https://example.test' }], socialLinks: [{ url: 'https://instagram.com/example' }] }],
    wallpaper: { desktopImage: 'https://media/desktop.webp', mobileImage: '', sharedImage: '' }
  });
  assert.deepEqual(new Set(urls), new Set(['https://media/logo.webp','https://media/favicon.webp','https://media/hero.webp','https://media/slide.webp','https://media/section.webp','https://media/block.webp','https://media/desktop.webp']));
});

test('los formularios limpian uploads temporales y las rutas sincronizan bajas con el gestor de assets', async () => {
  const [product, design, routes, imageService] = await Promise.all([
    fs.readFile(new URL('../../client/src/views/seller/ProductFormView.vue', import.meta.url), 'utf8'),
    fs.readFile(new URL('../../client/src/views/seller/DesignView.vue', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/routes/core.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/services/ImageService.js', import.meta.url), 'utf8')
  ]);
  assert.match(product, /sessionUploads/); assert.match(product, /delete\(`\/stores\/\$\{storeId\}\/uploads`/);
  assert.match(design, /cleanupSessionUploads/); assert.match(design, /Imagen cargada en R2/);
  assert.match(routes, /cleanupProductImages\(current, item\.images\)/); assert.match(routes, /cleanupDesignImages\(req\.store\._id, before, validated\)/);
  assert.match(imageService, /image-upload-rollback/); assert.match(imageService, /cleanup\.schedule/);
});

test('R2 separa assets públicos de comprobantes privados', async () => {
  const [configSource, commerceSource, cleanupSource, envSource] = await Promise.all([
    fs.readFile(new URL('../src/config.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/services/commerce.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/services/StorageCleanupService.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../../.env.example', import.meta.url), 'utf8')
  ]);
  assert.match(configSource, /R2_ASSETS_BUCKET_NAME/);
  assert.match(configSource, /R2_RECEIPTS_BUCKET_NAME/);
  assert.match(commerceSource, /bucket:\s*config\.r2\.receiptsBucket/);
  assert.match(commerceSource, /R2_RECEIPTS_BUCKET_NAME/);
  assert.match(cleanupSource, /job\.bucket/);
  assert.match(envSource, /Nunca conectes R2_RECEIPTS_BUCKET_NAME a un dominio público/);
});
