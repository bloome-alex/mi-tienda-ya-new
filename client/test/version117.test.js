import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL('../src/'+file, import.meta.url),'utf8');

test('home cards use editable presentation and expose the full plans page',()=>{
  const home=source('views/public/HomeView.vue');
  assert.match(home,/plan\.cardFeatures/);
  assert.match(home,/feature\.description/);
  assert.match(home,/to="\/planes"/);
  assert.match(home,/>Ver más/);
});

test('plans page compares capacities and every backend-provided feature',()=>{
  const plans=source('views/public/PlansView.vue');
  assert.match(plans,/Cantidad de tiendas/);
  assert.match(plans,/Productos por tienda/);
  assert.match(plans,/config\.value\?\.planFeatures/);
  assert.match(plans,/resolvedFeatureKeys/);
  assert.match(plans,/custom-plan-requests/);
  assert.match(plans,/form\.email/);
  assert.match(plans,/form\.whatsapp/);
  assert.match(plans,/form\.description/);
});

test('admin can edit feature card title/description and see custom plan requests',()=>{
  const form=source('views/admin/PlanFormView.vue');
  const requests=source('views/admin/CustomPlanRequestsView.vue');
  const layout=source('layouts/DashboardLayout.vue');
  assert.match(form,/featurePresentation/);
  assert.match(form,/Título en la card/);
  assert.match(form,/Descripción en la card/);
  assert.match(requests,/\/admin\/custom-plan-requests/);
  assert.match(layout,/Solicitudes de planes/);
});

test('shared reads keep independent plan sections usable without reopening their ABMs',()=>{
  const order=source('views/seller/OrderFormView.vue');
  const payments=source('views/seller/PaymentsView.vue');
  assert.match(order,/p\.type!==['"]mercadopago['"]\|\|canFeature\(['"]payments\.mercadopago['"]\)/);
  assert.match(payments,/visiblePayments/);
  assert.match(payments,/payment\.type!==['"]mercadopago['"]\|\|canFeature\(['"]payments\.mercadopago['"]\)/);
});

test('new plan gates are used by navigation and design levels',()=>{
  const layout=source('layouts/DashboardLayout.vue');
  const design=source('views/seller/DesignView.vue');
  for(const key of ['dashboard.statistics','management.products','management.stores','management.stock','management.categories','management.orders']) assert.match(layout,new RegExp(key.replaceAll('.','\\.')));
  assert.match(design,/design\.premium/);
  assert.match(design,/design\.enterprise/);
  assert.doesNotMatch(design,/design\.custom_sections|design\.theme_modes|checkout\.terms/);
});
