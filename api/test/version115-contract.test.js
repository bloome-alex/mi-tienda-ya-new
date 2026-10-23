import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('la vinculacion pendiente tiene vencimiento configurable y worker automatico', async () => {
  const models = await read('src/models/index.js');
  const service = await read('src/services/SubscriptionService.js');
  const routes = await read('src/routes/core.js');
  const index = await read('src/index.js');
  assert.match(models, /subscriptionPendingLinkHours/);
  assert.match(models, /pendingExpiresAt/);
  assert.match(service, /startPendingWorker/);
  assert.match(service, /expireDuePending/);
  assert.match(service, /pendingHours/);
  assert.match(routes, /subscriptionPendingLinkHours/);
  assert.match(index, /startPendingWorker/);
  assert.match(index, /stopPendingWorker/);
});

test('antes de cancelar una vinculacion se vuelve a consultar Mercado Pago', async () => {
  const service = await read('src/services/SubscriptionService.js');
  assert.match(service, /getSubscription\(subscription\.providerSubscriptionId\)/);
  assert.match(service, /remoteStatus/);
  assert.match(service, /PENDING_SUBSCRIPTION_CHANGED/);
  assert.match(service, /status:\s*'canceled'/);
});

test('el vendedor puede cancelar manualmente una vinculacion pendiente', async () => {
  const routes = await read('src/routes/core.js');
  const view = await read('../client/src/views/seller/SubscriptionView.vue');
  assert.match(routes, /\/me\/subscription\/pending\/cancel/);
  assert.match(routes, /cancelPendingForUser/);
  assert.match(view, /Cancelar vinculaci[oó]n/);
  assert.match(view, /cancelPending/);
});

test('el vendedor puede enviar un comprobante privado si Mercado Pago sigue pendiente', async () => {
  const routes = await read('src/routes/core.js');
  const support = await read('src/services/SubscriptionSupportService.js');
  const storage = await read('src/services/StorageCleanupService.js');
  const view = await read('../client/src/views/seller/SubscriptionView.vue');
  assert.match(routes, /\/me\/subscription\/pending\/help/);
  assert.match(routes, /subscriptionSupportUpload\.single\('file'\)/);
  assert.match(support, /R2_RECEIPTS_BUCKET_NAME/);
  assert.match(support, /private, no-store/);
  assert.match(support, /SubscriptionSupportRequest/);
  assert.match(storage, /SubscriptionSupportRequest\.exists/);
  assert.match(view, /Me vincul[eé] pero sigue pendiente/);
  assert.match(view, /Enviar comprobante/);
});

test('administracion puede revisar comprobantes y habilitar acceso sin falsificar el estado del proveedor', async () => {
  const routes = await read('src/routes/core.js');
  const support = await read('src/services/SubscriptionSupportService.js');
  const settings = await read('../client/src/views/admin/SettingsView.vue');
  assert.match(routes, /\/admin\/subscription-support/);
  assert.match(routes, /\/approve/);
  assert.match(routes, /\/reject/);
  assert.match(support, /subscriptionManualAccessUntil/);
  assert.match(support, /manualAccessUntil/);
  assert.doesNotMatch(support, /providerStatus\s*=\s*['"]authorized['"]/);
  assert.match(settings, /Comprobantes para revisar/);
  assert.match(settings, /Habilitar por un per[ií]odo/);
});

test('la habilitacion manual participa del entitlement sin cambiar el cobro recurrente', async () => {
  const models = await read('src/models/index.js');
  const core = await read('src/services/core.js');
  assert.match(models, /subscriptionManualAccessUntil/);
  assert.match(core, /manualAccessUntil/);
  assert.match(core, /Habilitaci[oó]n manual de suscripci[oó]n/);
});

test('solicitudes pendientes se cierran si vence o se cancela la vinculacion', async () => {
  const service = await read('src/services/SubscriptionService.js');
  const support = await read('src/services/SubscriptionSupportService.js');
  assert.match(service, /closePendingForSubscription/);
  assert.match(service, /resolveProviderConfirmed/);
  assert.match(support, /closePendingForSubscription/);
  assert.match(support, /Mercado Pago confirm[oó] la vinculaci[oó]n autom[aá]ticamente/);
});
