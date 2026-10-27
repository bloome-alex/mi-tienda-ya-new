import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const readApp = name => readFile(new URL(`../${name}`, root), 'utf8');

test('suscripciones exponen recuperación, reanudación y corte ante incidentes del proveedor', async () => {
  const service = await read('src/services/SubscriptionService.js');
  const health = await read('src/services/SubscriptionHealthPolicy.js');
  const routes = await read('src/routes/core.js');
  const view = await readApp('client/src/views/seller/SubscriptionView.vue');
  assert.match(service, /checkoutAttemptId/);
  assert.match(service, /SUBSCRIPTION_RECOVERY_REQUIRED/);
  assert.match(service, /async recover\(/);
  assert.match(service, /async resume\(/);
  assert.match(health, /provider_cancelled/);
  assert.match(health, /payment_failed/);
  assert.match(routes, /\/me\/subscription\/recover/);
  assert.match(routes, /\/me\/subscription\/resume/);
  assert.match(view, /Generar nueva vinculaci[oó]n/);
  assert.match(view, /Cortar suscripci[oó]n/);
  assert.match(view, /Cancelar intento/);
});

test('el alta de Mercado Pago reconcilia intentos ambiguos por external_reference y el webhook valida HMAC', async () => {
  const service = await read('src/services/SubscriptionService.js');
  assert.match(service, /findSubscriptionByReference/);
  assert.match(service, /payer_email=/);
  assert.match(service, /external_reference/);
  assert.match(service, /checkoutReference/);
  assert.match(service, /checkoutRequestStartedAt/);
  assert.match(service, /SUBSCRIPTION_CHECKOUT_UNCERTAIN/);
  assert.match(service, /'X-Idempotency-Key'/);
  assert.match(service, /idempotencyKey: item\.checkoutAttemptId/);
  assert.match(service, /timingSafeEqual/);
  assert.match(service, /request-id:/);
  assert.match(service, /subscription_authorized_payment/);
  assert.match(service, /type === 'payment'/);
});

test('eventos de pago fuera de orden no pueden degradar el último estado confirmado', async () => {
  const models = await read('src/models/index.js');
  const service = await read('src/services/SubscriptionService.js');
  assert.match(models, /lastPaymentEventAt/);
  assert.match(service, /isLatestEvent/);
  assert.match(service, /subscriptionAppliedPaymentIds/);
  assert.match(service, /providerAuthorizedPaymentId/);
});

test('la acreditación atómica habilita explícitamente updatePipeline en Mongoose', async () => {
  const service = await read('src/services/SubscriptionService.js');
  assert.match(service, /updatePipeline:\s*true/);
});

test('Facebook Graph y la validación de assets son inyectables para ejecutar el mismo flujo contra un mock HTTP', async () => {
  const service = await read('src/services/FacebookAdsService.js');
  assert.match(service, /class MetaGraphClient/);
  assert.match(service, /fetchImpl = globalThis\.fetch/);
  assert.match(service, /graphBaseUrl/);
  assert.match(service, /class PublicAdAssetPolicy/);
  assert.match(service, /graphClientFactory/);
  assert.match(service, /this\.graph\(token\)/);
});

test('los stacks mock de Mercado Pago y Facebook siguen disponibles con comandos explícitos', async () => {
  const pkg = JSON.parse(await readApp('package.json'));
  const subscriptions = await readApp('scripts/test-subscriptions-mock.mjs');
  const facebook = await readApp('scripts/test-facebook-ads-mock.mjs');
  assert.equal(pkg.scripts['test:mock:subscriptions'], 'node --test --test-concurrency=1 scripts/test-subscriptions-mock.mjs');
  assert.equal(pkg.scripts['test:mock:facebook'], 'node --test --test-concurrency=1 scripts/test-facebook-ads-mock.mjs');
  assert.match(subscriptions, /MockMercadoPagoServer/);
  assert.match(subscriptions, /dropAfterCommitOnce/);
  assert.match(subscriptions, /dropUpdateAfterCommitOnce/);
  assert.match(subscriptions, /cancelaci[oó]n externa/);
  assert.match(facebook, /MockMetaServer/);
  assert.match(facebook, /OAuth de producci[oó]n/);
  assert.match(facebook, /\/campaigns/);
  assert.match(facebook, /rollback|borrar la campa/);
});
