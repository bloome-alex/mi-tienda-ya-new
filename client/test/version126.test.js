// 1.26.0: mejoras de experiencia para vendedor y comprador detectadas en la prueba en producción.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storeIdFromPath } from '../src/services/storeUpdates.js';

const source = file => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');

test('el aviso de instalación libera la esquina del botón de WhatsApp', () => {
  assert.match(source('App.vue'), /classList\.toggle\('pwa-prompt-open', promptVisible\.value\)/);
  assert.match(source('styles/storefront.css'), /\.pwa-prompt-open \.store-whatsapp,\.pwa-prompt-open \.store-whatsapp-pill\{bottom:104px!important/);
});

test('los carruseles se pausan unos segundos al tocarlos en pantallas táctiles', () => {
  assert.match(source('services/storePlayback.js'), /pointerDown: event => \{ if \(event\.pointerType === 'touch'\)/);
  assert.match(source('components/StoreHero.vue'), /@pointerdown="playback\.pointerDown"/);
  assert.match(source('components/StoreFeatured.vue'), /@pointerdown="playback\.pointerDown"/);
});

test('la tarjeta muestra “Desde” cuando las variantes tienen precios distintos', () => {
  assert.match(source('components/ProductCard.vue'), /copy\.text\('priceFrom',\{price:money\(priceRange\.min\)\}\)/);
  assert.match(source('services/storeCopy.js'), /\['priceFrom','Precio de productos con variantes de distinto valor','Desde \{price\}'\]/);
});

test('el resumen del vendedor usa singular y plural', () => {
  const view = source('views/seller/DashboardView.vue');
  assert.match(view, /plural\(data\.pendingOrders\|\|0,'pedido por resolver','pedidos por resolver'\)/);
  assert.match(view, /plural\(product\.quantity,'unidad vendida','unidades vendidas'\)/);
});

test('el editor lleva a la vista la sección que se abre y permite deshacer la restauración', () => {
  assert.match(source('components/editor/DesignGroup.vue'), /summary\.value\?\.scrollIntoView\(\{ block: 'nearest'/);
  const view = source('views/seller/DesignView.vue');
  assert.match(view, /function undoReset\(\)/);
  assert.match(view, /class="design-undo"/);
  assert.doesNotMatch(view, /abortUploads\(\);await cleanupSessionUploads\(\);const previous/);
});

test('la ayuda explica el estilo general y las columnas en pantallas angostas', () => {
  const fields = source('components/editor/fields.js');
  assert.match(fields, /Cambia la tipografía de los títulos/);
  assert.equal((fields.match(/En pantallas angostas/g) || []).length, 2);
});

test('el carrito de la vista previa aclara que es de prueba', () => {
  assert.match(source('views/public/CartView.vue'), /v-if="sf\.isPreview\.value" class="notice store-preview-cart-notice"/);
});

test('la tienda ofrece ver los cambios guardados desde el panel en otra pestaña', () => {
  assert.equal(storeIdFromPath('/stores/6afbc6966fa068d265309e3b/design'), '6afbc6966fa068d265309e3b');
  assert.equal(storeIdFromPath('/stores/6afbc6966fa068d265309e3b'), '6afbc6966fa068d265309e3b');
  assert.equal(storeIdFromPath('/stores/6afbc6966fa068d265309e3b/uploads'), '');
  assert.equal(storeIdFromPath('/public/stores/cafe-aurora'), '');
  assert.match(source('services/api.js'), /announceStoreChange\(method, path\)/);
  assert.match(source('layouts/StoreLayout.vue'), /class="store-update-banner"/);
});
