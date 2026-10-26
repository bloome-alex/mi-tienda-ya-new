import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL('../src/'+file, import.meta.url),'utf8');

test('panel incorpora una sección Dominio por tienda', () => {
  const layout=source('layouts/DashboardLayout.vue');
  const router=source('router.js');
  assert.match(layout,/\['Dominio','\/app\/domain','globe',null\]/);
  assert.match(router,/path:'domain'.*DomainView\.vue/s);
});

test('pantalla de dominio permite URL clásica, subdominio y dominio propio', () => {
  const view=source('views/seller/DomainView.vue');
  assert.match(view,/value="path"/);
  assert.match(view,/value="subdomain"/);
  assert.match(view,/value="custom"/);
  assert.match(view,/Verificación DNS/);
  assert.match(view,/\/domain\/verify/);
  assert.match(view,/CNAME \/ ALIAS/);
});

test('tienda en hostname propio usa rutas limpias y conserva fallback por slug', () => {
  const host=source('services/storeHost.js');
  const router=source('router.js');
  assert.match(host,/mty-store-slug/);
  assert.match(host,/storefrontPath/);
  assert.match(router,/isHostedStorefront\(\)\?hostedRoutes:platformRoutes/);
  assert.match(router,/\{path:'\/t\/:slug'/);
});

test('vistas públicas consumen el slug resuelto por hostname', () => {
  for(const file of ['layouts/StoreLayout.vue','views/public/StoreView.vue','views/public/ProductView.vue','views/public/CartView.vue','views/public/CheckoutView.vue']){
    assert.match(source(file),/storefrontSlug/ ,file);
  }
});

test('enlaces del panel prefieren publicUrl de la tienda', () => {
  const layout=source('layouts/DashboardLayout.vue');
  const stores=source('views/admin/StoresView.vue');
  const design=source('views/seller/DesignView.vue');
  assert.match(layout,/store\.publicUrl/);
  assert.match(stores,/publicUrl/);
  assert.match(design,/store\.publicUrl/);
});
