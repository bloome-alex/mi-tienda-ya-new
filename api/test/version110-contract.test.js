import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('Store persiste dominio por tienda con índices únicos para subdominio y dominio propio', async () => {
  const source = await read('models/index.js');
  assert.match(source, /domain:\s*\{\s*mode:/);
  assert.match(source, /enum: \['path', 'subdomain', 'custom'\]/);
  assert.match(source, /store_subdomain_unique/);
  assert.match(source, /store_custom_domain_unique/);
});

test('configuración del dominio base y destino DNS sale de variables de entorno', async () => {
  const source = await read('config.js');
  assert.match(source, /STOREFRONT_BASE_DOMAIN/);
  assert.match(source, /STOREFRONT_CNAME_TARGET/);
  assert.match(source, /STOREFRONT_VERIFICATION_PREFIX/);
  assert.match(source, /STOREFRONT_RESERVED_SUBDOMAINS/);
});

test('DomainService normaliza, valida unicidad y verifica TXT de dominios propios', async () => {
  const source = await read('services/DomainService.js');
  assert.match(source, /normalizeSubdomain\(/);
  assert.match(source, /normalizeCustomDomain\(/);
  assert.match(source, /ensureUnique\('domain\.subdomain'/);
  assert.match(source, /ensureUnique\('domain\.customDomain'/);
  assert.match(source, /resolveTxt\(name\)/);
  assert.match(source, /hostname === appHost/);
  assert.match(source, /hostname === this\.storefront\.cnameTarget/);
  assert.match(source, /status = 'verified'/);
});

test('Host público resuelve la tienda y CORS acepta sólo dominios asociados', async () => {
  const source = await read('app.js');
  assert.match(source, /resolveStoreByHost\(req\.hostname/);
  assert.match(source, /mty-store-slug/);
  assert.match(source, /mty-store-url/);
  assert.match(source, /domainService\.isAllowedOrigin/);
});

test('API ofrece configuración y verificación de dominio por tienda', async () => {
  const source = await read('routes/core.js');
  assert.match(source, /router\.get\('\/stores\/:storeId\/domain'/);
  assert.match(source, /router\.put\('\/stores\/:storeId\/domain'/);
  assert.match(source, /router\.post\('\/stores\/:storeId\/domain\/verify'/);
  assert.match(source, /store\.domain\.updated/);
  assert.match(source, /store\.domain\.verified/);
});

test('Mercado Pago vuelve al dominio de la tienda pero conserva webhook estable de plataforma', async () => {
  const source = await read('services/MercadoPagoService.js');
  assert.match(source, /domainService\.publicUrl\(store\)/);
  assert.match(source, /webhookBaseUrl = String\(config\.appUrl/);
  assert.match(source, /notification_url: `\$\{webhookBaseUrl\}/);
});
