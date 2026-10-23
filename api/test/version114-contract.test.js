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

test('el catálogo inicial cubre secciones y capacidades vendibles', async () => {
  const service = await read('src/services/PlanFeatureService.js');
  for (const key of [
    'section.products','section.categories','section.stock','section.orders','section.payments','section.design','section.contact','section.domain','section.pwa',
    'domain.subdomain','domain.custom','products.variants','products.digital','products.featured','products.related','orders.manual',
    'payments.cash','payments.transfer','payments.mercadopago','payments.delivery','design.custom_sections','design.theme_modes','design.backgrounds','design.social_links','design.category_navigation','checkout.terms','contact.whatsapp',
  ]) assert.match(service, new RegExp(key.replaceAll('.', '\\.')));
});

test('backend protege secciones y operaciones por permiso del plan', async () => {
  const middleware = await read('src/middleware/core.js');
  const core = await read('src/routes/core.js');
  const commerceRoutes = await read('src/routes/commerce.js');
  const commerce = await read('src/services/commerce.js');
  assert.match(middleware, /requireFeature/);
  assert.match(middleware, /PLAN_FEATURE_REQUIRED/);
  for (const key of ['section.products','section.categories','section.design','section.contact','section.domain','section.pwa']) assert.match(core, new RegExp(`requireFeature\\('${key.replaceAll('.', '\\.')}'\\)`));
  for (const key of ['section.stock','section.orders','orders.manual','payments.transfer','products.digital']) assert.match(commerceRoutes, new RegExp(`requireFeature\\('${key.replaceAll('.', '\\.')}'\\)`));
  assert.match(commerce, /payments\.\$\{payment\.type\}/);
  assert.match(commerce, /products\.digital/);
  assert.match(commerce, /products\.variants/);
});

test('dominios, PWA y contacto público dejan de operar cuando el plan no los incluye', async () => {
  const domain = await read('src/services/DomainService.js');
  const core = await read('src/routes/core.js');
  const commerce = await read('src/services/commerce.js');
  assert.match(domain, /domain\.subdomain/);
  assert.match(domain, /domain\.custom/);
  assert.match(domain, /section\.domain/);
  assert.match(core, /PWA_NOT_AVAILABLE/);
  assert.match(core, /section\.pwa/);
  assert.match(commerce, /section\.contact/);
});
