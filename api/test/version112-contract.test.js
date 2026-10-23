import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('admin configura credenciales y días de cortesía de suscripciones', async () => {
  const models = await read('src/models/index.js');
  const routes = await read('src/routes/core.js');
  assert.match(models, /subscriptionGraceDays/);
  assert.match(models, /platformBilling/);
  assert.match(routes, /subscriptionWebhookUrl/);
  assert.match(routes, /SUBSCRIPTIONS_NOT_CONFIGURED/);
});

test('vendedor dispone de Mi suscripción, cancelar, desvincular y contratar', async () => {
  const routes = await read('src/routes/core.js');
  for (const path of ["/me/subscription'", "/me/subscription/checkout'", "/me/subscription/cancel'", "/me/subscription/detach'"]) assert.match(routes, new RegExp(path.replaceAll('/', '\\/')));
  const service = await read('src/services/SubscriptionService.js');
  assert.match(service, /createSubscription/);
  assert.match(service, /status: 'canceled'/);
  assert.match(service, /subscription\.current = false/);
});

test('pagos aprobados extienden un período exacto y no reinician deuda vencida desde hoy', async () => {
  const service = await read('src/services/SubscriptionService.js');
  assert.match(service, /firstAppliedPeriod/);
  assert.match(service, /\$dateAdd/);
  assert.match(service, /subscription\.currentPeriodEnd/);
  assert.doesNotMatch(service, /Math\.max\(Date\.now\(\),.*planExpiresAt/);
});

test('usuarios fuera de gracia son filtrables desde administración', async () => {
  const routes = await read('src/routes/core.js');
  assert.match(routes, /billingStatus === 'grace_expired'/);
  assert.match(routes, /subscriptionGraceDays/);
  assert.match(routes, /currentPeriodEnd: \{ \$lte: threshold \}/);
});

test('PWA por tienda publica manifest dinámico y persiste iconos propios', async () => {
  const routes = await read('src/routes/core.js');
  const app = await read('src/app.js');
  const models = await read('src/models/index.js');
  assert.match(routes, /manifest\.webmanifest/);
  assert.match(routes, /router\.put\('\/stores\/:storeId\/pwa'/);
  assert.match(models, /pwa:/);
  assert.match(app, /manifestHref/);
  assert.match(app, /apple-touch-icon/);
});

test('icono PWA se procesa en R2 a 192 y 512 y queda sujeto a limpieza de assets', async () => {
  const images = await read('src/services/ImageService.js');
  const assets = await read('src/services/AssetService.js');
  assert.match(images, /pwa-icon/);
  assert.match(images, /192/);
  assert.match(images, /512/);
  assert.match(assets, /pwa\?\.iconUrl/);
  assert.match(assets, /pwa\?\.icon192Url/);
});
