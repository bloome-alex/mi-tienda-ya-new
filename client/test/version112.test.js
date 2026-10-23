import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const source = file => readFileSync(new URL('../src/'+file, import.meta.url),'utf8');
const publicSource = file => readFileSync(new URL('../public/'+file, import.meta.url),'utf8');

test('focus de campos queda delicado y sin marco azul fuerte', () => {
  const base=source('styles/base.css');
  const panel=source('styles/panel.css');
  assert.match(base,/input:focus-visible,select:focus-visible,textarea:focus-visible\{outline:none\}/);
  assert.match(base,/color-mix\(in srgb,var\(--text\) 6%,transparent\)/);
  assert.match(panel,/\.p-field input:focus/);
  assert.doesNotMatch(panel,/\.p-field input:focus[^}]*#(?:2196f3|1976d2|42a5f5)/i);
});

test('Tu plan desaparece y Mi suscripción concentra la gestión recurrente', () => {
  const router=source('router.js');
  const layout=source('layouts/DashboardLayout.vue');
  const view=source('views/seller/SubscriptionView.vue');
  assert.match(router,/path:'plan',redirect:'\/app\/subscription'/);
  assert.match(layout,/Mi suscripción/);
  assert.match(view,/Cancelar renovación/);
  assert.match(view,/Desvincular Mercado Pago/);
  assert.match(view,/Suscribirme con Mercado Pago/);
  assert.equal(existsSync(new URL('../src/views/seller/PlanView.vue', import.meta.url)),false);
});

test('panel vendedor muestra alerta de deuda al abrir la aplicación', () => {
  const layout=source('layouts/DashboardLayout.vue');
  assert.match(layout,/\/me\/subscription/);
  assert.match(layout,/No se pudo acreditar el último pago de tu suscripción/);
  assert.match(layout,/debtAmount/);
});

test('admin puede ver vendedores fuera de gracia', () => {
  const view=source('views/admin/UsersView.vue');
  assert.match(view,/billingStatus:'grace_expired'/);
  assert.match(view,/Ver fuera de gracia/);
  assert.match(view,/Fuera de gracia/);
});

test('cada tienda tiene configuración PWA propia en Tu Tienda', () => {
  const router=source('router.js');
  const layout=source('layouts/DashboardLayout.vue');
  const view=source('views/seller/StorePwaView.vue');
  const storeLayout=source('layouts/StoreLayout.vue');
  assert.match(router,/path:'pwa'/);
  assert.match(layout,/Aplicación PWA/);
  assert.match(view,/pwa-icon/);
  assert.match(view,/192/);
  assert.match(view,/512/);
  assert.match(storeLayout,/manifest\.webmanifest/);
});

test('prompt de instalación se descarta por tienda y el service worker renueva caché', () => {
  const app=source('App.vue');
  const sw=publicSource('sw.js');
  assert.match(app,/mty-install-dismissed:\$\{installScope\(\)\}/);
  assert.match(sw,/mty2-shell-v1\.12\.0/);
});
