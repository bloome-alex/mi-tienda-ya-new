import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL('../src/'+file, import.meta.url),'utf8');
const publicSource = file => readFileSync(new URL('../public/'+file, import.meta.url),'utf8');

test('wordmark queda limpio y responde al tema sin contornos tipográficos', () => {
  const brand = source('components/BrandWordmark.vue');
  assert.match(brand, />MiTienda</);
  assert.match(brand, />Ya</);
  assert.doesNotMatch(brand, /-webkit-text-stroke|text-shadow:[^;]*0 0 1px/);
  assert.match(brand, /color:var\(--text\)/);
  assert.match(brand, /color:var\(--primary\)/);
});

test('modo oscuro conserva negro profundo, texto crema y acentos vivos controlados', () => {
  const base = source('styles/base.css');
  const panel = source('styles/panel.css');
  const design = source('services/design.js');
  const offline = publicSource('offline.html');
  assert.match(base, /--bg:#050607/);
  assert.match(base, /--surface:#0c0e0f/);
  assert.match(base, /--text:#f1e7d9/);
  assert.match(base, /--success:#58d98d/);
  assert.match(base, /--info:#5bc5f4/);
  assert.match(panel, /v1\.14 · contraste oscuro firme/);
  assert.match(design, /darkPrimary: '#72e3ad'/);
  assert.match(design, /darkBackground: '#050607'/);
  assert.match(offline, /#050607/);
});

test('ABM de planes permite permisos reales, herencia y marca funcionalidades heredadas', () => {
  const form = source('views/admin/PlanFormView.vue');
  const settings = source('views/admin/SettingsView.vue');
  assert.match(form, /Heredar funcionalidades de otro plan/);
  assert.match(form, /Heredada/);
  assert.match(form, /resolvedFeatureKeys/);
  assert.match(form, /inheritanceChain/);
  assert.match(settings, /Todo lo de \{\{row\.inheritsPlan\.name\}\}/);
});

test('menú, rutas y editores respetan permisos del plan en frontend', () => {
  const auth = source('services/auth.js');
  const router = source('router.js');
  const layout = source('layouts/DashboardLayout.vue');
  const design = source('views/seller/DesignView.vue');
  assert.match(auth, /canFeature/);
  assert.match(router, /meta\.feature/);
  assert.match(layout, /canFeature/);
  assert.match(design, /design\.custom_sections/);
  assert.match(design, /design\.theme_modes/);
  assert.match(design, /checkout\.terms/);
});

test('botones secundarios tienen outline y elementos clickeables muestran cursor', () => {
  const base = source('styles/base.css');
  const panel = source('styles/panel.css');
  assert.match(base, /\.btn-ghost\{border-color:var\(--line\)\}/);
  assert.match(panel, /\.p-app \.btn-text\{border:1px solid var\(--line\)/);
  assert.match(panel, /button:not\(:disabled\)[^}]*cursor:pointer/);
  assert.match(panel, /\.p-tag-option[^}]*cursor:pointer/);
  assert.match(panel, /\.p-modal-backdrop\{cursor:pointer\}/);
});

test('navegación directa no recupera pestañas o medios de pago fuera del plan', () => {
  const payments = source('views/seller/PaymentsView.vue');
  const method = source('views/seller/PaymentMethodFormView.vue');
  assert.match(payments, /normalizeTab/);
  assert.match(payments, /payments\.delivery/);
  assert.match(payments, /payments\.mercadopago/);
  assert.match(method, /Object\.keys\(types\)\.find\(type=>canFeature/);
});
