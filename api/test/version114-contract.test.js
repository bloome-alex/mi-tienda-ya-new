import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('los planes guardan permisos reales y herencia de otro plan', async () => {
  const models = await read('src/models/index.js');
  const service = await read('src/services/PlanFeatureService.js');
  const routes = await read('src/routes/core.js');
  assert.match(models, /featureKeys/);
  assert.match(models, /inheritsPlanId/);
  assert.match(service, /PLAN_FEATURES/);
  assert.match(service, /PLAN_INHERITANCE_CYCLE/);
  assert.match(service, /Incluye todo lo de/);
  assert.match(service, /initializeLegacyPlans/);
  assert.match(routes, /\/admin\/plan-features/);
  assert.match(routes, /featureKeys/);
  assert.match(routes, /assertInheritance/);
});

test('el catálogo actual conserva migración de planes antiguos sin exponer permisos obsoletos', async () => {
  const service = await read('src/services/PlanFeatureService.js');
  const catalog = service.slice(service.indexOf('PLAN_FEATURES'), service.indexOf('const featureMap'));
  for (const key of ['dashboard.statistics','management.products','management.categories','management.stock','management.orders','design.limited','design.premium','design.enterprise','domain.subdomain','domain.custom','store.pwa','payments.mercadopago','contact.whatsapp','stores.transfer']) assert.match(catalog, new RegExp(key.replaceAll('.', '\\.')));
  assert.match(service, /LEGACY_FEATURE_MAP/);
  assert.match(service, /section\.products/);
  assert.doesNotMatch(catalog, /products\.variants|payments\.cash|orders\.manual|design\.custom_sections/);
});

test('backend protege solamente las capacidades comerciales vigentes', async () => {
  const middleware = await read('src/middleware/core.js');
  const core = await read('src/routes/core.js');
  const commerceRoutes = await read('src/routes/commerce.js');
  assert.match(middleware, /requireFeature/);
  assert.match(middleware, /PLAN_FEATURE_REQUIRED/);
  for (const key of ['management.products','management.categories','design.limited','store.pwa']) assert.match(core, new RegExp(key.replaceAll('.', '\\.')));
  for (const key of ['dashboard.statistics','management.stock','management.orders']) assert.match(commerceRoutes, new RegExp(key.replaceAll('.', '\\.')));
  assert.doesNotMatch(commerceRoutes, /orders\.manual|payments\.transfer|products\.digital/);
});

test('dominios, PWA y WhatsApp usan sus capacidades actuales', async () => {
  const domain = await read('src/services/DomainService.js');
  const core = await read('src/routes/core.js');
  const commerce = await read('src/services/commerce.js');
  assert.match(domain, /domain\.subdomain/);
  assert.match(domain, /domain\.custom/);
  assert.doesNotMatch(domain, /section\.domain/);
  assert.match(core, /PWA_NOT_AVAILABLE/);
  assert.match(core, /store\.pwa/);
  assert.match(core, /contact\.whatsapp/);
  assert.match(commerce, /contact\.whatsapp/);
});
