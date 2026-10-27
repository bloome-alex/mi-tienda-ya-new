import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = file => readFileSync(resolve(here, '..', 'src', file), 'utf8');

test('Redes y anuncios reserva la ayuda técnica y el Sandbox para administradores', () => {
  const view = src('views/seller/SocialAdsView.vue');
  assert.match(view, /const isAdmin=computed\(\(\)=>auth\.user\?\.role==='admin'\)/);
  assert.match(view, /<section v-if="isAdmin" class="p-section-card setup-help">/);
  assert.match(view, /<details v-if="isAdmin&&current\.sandboxAllowed"/);
  assert.doesNotMatch(view, /El servidor todavía necesita META_APP_ID y META_APP_SECRET/);
  assert.doesNotMatch(view, /El token se envía únicamente al backend/);
  assert.match(view, /La conexión con \$\{providerLabel\} todavía no está disponible\. Contactá a la administración\./);
});

test('las pantallas del vendedor no explican infraestructura interna en sus ayudas', () => {
  const domain = src('views/seller/DomainView.vue');
  const product = src('views/seller/ProductFormView.vue');
  const payments = src('views/seller/PaymentsView.vue');
  const pwa = src('views/seller/StorePwaView.vue');
  const api = src('services/api.js');

  assert.doesNotMatch(domain, /Nginx|El servidor todavía|configurando SSL/);
  assert.doesNotMatch(product, /la API impedirá/);
  assert.doesNotMatch(payments, /al navegador|HTTPS en producción|Modo de prueba \(sandbox\)/);
  assert.doesNotMatch(pwa, /publica automáticamente su manifest|actualización del manifest/);
  assert.doesNotMatch(api, /El servidor devolvió una respuesta inesperada/);
});
