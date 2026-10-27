import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const expectedFeatures = [
  'dashboard.statistics','management.products','management.stores','management.stock','management.categories','management.orders',
  'design.limited','design.premium','design.enterprise','domain.subdomain','domain.custom','store.pwa','payments.mercadopago','contact.whatsapp','stores.transfer',
  'ads.limited','ads.premium','ads.enterprise',
];

test('plan catalog contains the current commercial capabilities',()=>{
  const service=read('src/services/PlanFeatureService.js');
  const catalogBlock=service.slice(service.indexOf('PLAN_FEATURES'), service.indexOf('const featureMap'));
  for(const key of expectedFeatures) assert.match(catalogBlock,new RegExp(key.replaceAll('.','\\.')));
  assert.equal((catalogBlock.match(/\{ key: '/g)||[]).length,18);
  for(const removed of ['products.variants','products.digital','products.featured','products.related','orders.manual','payments.cash','payments.transfer','payments.delivery','design.custom_sections','design.theme_modes','design.backgrounds','design.social_links','checkout.terms']) assert.doesNotMatch(catalogBlock,new RegExp(removed.replaceAll('.','\\.')));
});

test('design levels are cumulative and card copy is stored separately from permission keys',()=>{
  const service=read('src/services/PlanFeatureService.js');
  const models=read('src/models/index.js');
  assert.match(service,/design\.premium[^\n]+implies: \['design\.limited'\]/);
  assert.match(service,/design\.enterprise[^\n]+implies: \['design\.premium', 'design\.limited'\]/);
  assert.match(service,/featurePresentation/);
  assert.match(service,/cardFeatures/);
  assert.match(models,/planFeaturePresentationSchema/);
  assert.match(models,/featureSchemaVersion/);
});

test('only the new capabilities gate plan-specific backend behavior',()=>{
  const core=read('src/routes/core.js');
  const commerce=read('src/routes/commerce.js');
  for(const key of ['management.products','management.categories','design.limited','store.pwa']) assert.match(core,new RegExp(key.replaceAll('.','\\.')));
  for(const key of ['dashboard.statistics','management.stock','management.orders']) assert.match(commerce,new RegExp(key.replaceAll('.','\\.')));
  assert.match(core,/payments\.mercadopago/);
  assert.match(core,/contact\.whatsapp/);
  assert.match(core,/categories', requireStoreAccess, requireAnyFeature\(\['management\.categories', 'management\.products', 'design\.limited'\]\)/);
  assert.match(core,/products', requireStoreAccess, requireAnyFeature\(\['management\.products', 'management\.orders', 'design\.limited'\]\)/);
  for(const removed of ['products.variants','products.digital','products.featured','products.related','orders.manual','payments.cash','payments.transfer','payments.delivery']) {
    assert.doesNotMatch(core,new RegExp(`requireFeature\\('${removed.replaceAll('.','\\.')}\\)`));
    assert.doesNotMatch(commerce,new RegExp(`requireFeature\\('${removed.replaceAll('.','\\.')}\\)`));
  }
});

test('custom plan requests are persisted and exposed only to administrators',()=>{
  const models=read('src/models/index.js');
  const routes=read('src/routes/core.js');
  const service=read('src/services/CustomPlanRequestService.js');
  assert.match(models,/customPlanRequestSchema/);
  assert.match(routes,/post\('\/public\/custom-plan-requests'/);
  assert.match(routes,/get\('\/admin\/custom-plan-requests', requireAdmin/);
  assert.match(service,/class CustomPlanRequestService/);
  assert.match(service,/email, whatsapp, description/);
});
