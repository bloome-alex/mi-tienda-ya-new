import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL('../src/'+file, import.meta.url),'utf8');
const publicSource = file => readFileSync(new URL('../public/'+file, import.meta.url),'utf8');

test('hint de contratación automática queda debajo de la card del checkbox', () => {
  const settings=source('views/admin/SettingsView.vue');
  assert.match(settings, /<div class="p-field full"><label class="p-tag-option"><input[^>]*platformBilling\.enabled[^>]*><span><strong>Habilitar contratación automática<\/strong><\/span><\/label><small>Los vendedores podrán suscribirse/);
  assert.doesNotMatch(settings, /Habilitar contratación automática<\/strong><small>/);
});

test('ABM de usuarios expone personificación sólo con feature flag de desarrollo', () => {
  const users=source('views/admin/UsersView.vue');
  const auth=source('services/auth.js');
  const layout=source('layouts/DashboardLayout.vue');
  assert.match(users,/auth\.features\.devImpersonation/);
  assert.match(users,/\/impersonate/);
  assert.match(auth,/impersonation/);
  assert.match(layout,/Volver a Administración/);
});

test('administración tiene módulo de emails y plantilla de novedades', () => {
  const router=source('router.js');
  const layout=source('layouts/DashboardLayout.vue');
  const emails=source('views/admin/EmailsView.vue');
  assert.match(router,/path:'emails'/);
  assert.match(layout,/\['Emails','\/app\/emails','mail'\]/);
  assert.match(emails,/Novedades de versión|NOVEDADES DE PRODUCTO/);
  assert.match(emails,/Enviar a \$\{meta\.recipientCount\} vendedores/);
});

test('branding visible usa MiTiendaYa y wordmark especial en navbars', () => {
  const platform=source('layouts/PlatformLayout.vue');
  const dashboard=source('layouts/DashboardLayout.vue');
  const brand=source('components/BrandWordmark.vue');
  const index=readFileSync(new URL('../index.html', import.meta.url),'utf8');
  assert.match(platform,/BrandWordmark/);
  assert.match(dashboard,/BrandWordmark/);
  assert.match(brand,/>MiTienda/);
  assert.match(brand,/>Ya/);
  assert.match(index,/MiTiendaYa/);
});

test('modo oscuro global usa una paleta crema y focus de campos sin halo', () => {
  const base=source('styles/base.css');
  const panel=source('styles/panel.css');
  const design=source('services/design.js');
  const offline=publicSource('offline.html');
  assert.match(base,/--primary:#72e3ad/);
  assert.match(base,/--text:#f1e7d9/);
  assert.match(base,/\.field input:focus[^}]*box-shadow:none/);
  assert.match(panel,/\.p-field input:focus[^}]*box-shadow:none/);
  assert.match(panel,/\.p-search:focus-within\{box-shadow:none/);
  assert.match(design,/darkPrimary: '#72e3ad'/);
  assert.match(offline,/#050607/);
});
