import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const appRoot=path.resolve(root,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const readApp=relative=>fs.readFileSync(path.join(appRoot,relative),'utf8');

test('Mercado Pago admite múltiples cuentas cifradas por tienda y no expone secretos',()=>{
  const model=read('src/models/index.js');
  const service=read('src/services/MercadoPagoAccountService.js');
  const core=read('src/services/core.js');
  assert.match(model,/mercadoPagoAccountSchema/);
  assert.match(model,/accounts: \{ type: \[mercadoPagoAccountSchema\], default: \[\] \}/);
  assert.match(model,/mercadoPagoAccountId: \{ type: String, default: '' \}/);
  assert.match(service,/encryptSecret\(input\.accessToken\)/);
  assert.match(service,/encryptSecret\(input\.webhookSecret\)/);
  assert.match(core,/safeAccounts/);
  assert.doesNotMatch(core,/data\.integrations[^\n]+accounts[^\n]+accessToken:/);
});

test('cada forma Checkout Pro selecciona una cuenta y los pedidos conservan ese snapshot',()=>{
  const routes=read('src/routes/core.js');
  const commerce=read('src/services/commerce.js');
  const form=readApp('client/src/views/seller/PaymentMethodFormView.vue');
  assert.match(routes,/mercadoPagoAccountId: text\(80\)\.default\(''\)/);
  assert.match(routes,/Seleccioná una cuenta de Mercado Pago para cada forma de pago Checkout Pro/);
  assert.match(form,/Cuenta que recibirá el cobro/);
  assert.match(form,/v-model="form\.mercadoPagoAccountId"/);
  assert.match(commerce,/payment: \{[^\n]+mercadoPagoAccountId:/);
  assert.match(commerce,/order\.payment\?\.mercadoPagoAccountId/);
});

test('los webhooks y verificaciones usan la cuenta concreta y conservan compatibilidad legada',()=>{
  const mp=read('src/services/MercadoPagoService.js');
  const routes=read('src/routes/commerce.js');
  assert.match(mp,/notification_url: `\$\{webhookBaseUrl\}\/api\/webhooks\/mercadopago\/\$\{store\._id\}\/\$\{encodeURIComponent\(account\.id\)\}/);
  assert.match(mp,/metadata: \{[^\n]+mercado_pago_account_id: account\.id/);
  assert.match(routes,/webhooks\/mercadopago\/:storeId\/:accountId/);
  assert.match(routes,/webhooks\/mercadopago\/:storeId'/);
  assert.match(mp,/webhookCredentials\(store, request, accountId = ''\)/);
});

test('una cuenta usada no puede eliminarse porque pedidos históricos pueden recibir eventos posteriores',()=>{
  const service=read('src/services/MercadoPagoAccountService.js');
  assert.match(service,/relatedOrders = await Order\.countDocuments/);
  assert.match(service,/reembolsos o contracargos históricos/);
  assert.match(service,/MP_ACCOUNT_HAS_ORDERS/);
});

test('los planes incorporan cupos de formas de pago y entrega y el backend los hace cumplir',()=>{
  const model=read('src/models/index.js');
  const routes=read('src/routes/core.js');
  const limits=read('src/services/CommercePlanLimitService.js');
  const entitlement=read('src/services/core.js');
  assert.match(model,/maxPaymentMethods: \{ type: Number, min: 0, max: 20, default: 3 \}/);
  assert.match(model,/maxDeliveryMethods: \{ type: Number, min: 0, max: 20, default: 3 \}/);
  assert.match(routes,/commercePlanLimitService\.assertUpdate/);
  assert.match(limits,/PAYMENT_METHOD_LIMIT/);
  assert.match(limits,/DELIVERY_METHOD_LIMIT/);
  assert.match(limits,/next <= limit \|\| next <= current/);
  assert.match(entitlement,/maxPaymentMethods/);
  assert.match(entitlement,/maxDeliveryMethods/);
});

test('los cupos se administran y se muestran en Home, comparación y suscripción',()=>{
  const plan=readApp('client/src/views/admin/PlanFormView.vue');
  const home=readApp('client/src/views/public/HomeView.vue');
  const plans=readApp('client/src/views/public/PlansView.vue');
  const subscription=readApp('client/src/views/seller/SubscriptionView.vue');
  assert.match(plan,/maxPaymentMethods/);
  assert.match(plan,/maxDeliveryMethods/);
  assert.match(home,/Formas de pago/);
  assert.match(home,/Formas de entrega/);
  assert.match(plans,/__payments/);
  assert.match(plans,/__deliveries/);
  assert.match(subscription,/Formas de pago por tienda/);
  assert.match(subscription,/Formas de entrega por tienda/);
});

test('la migración preserva planes y cuentas Mercado Pago existentes',()=>{
  const limits=read('src/services/CommercePlanLimitService.js');
  const accounts=read('src/services/MercadoPagoAccountService.js');
  const core=read('src/services/core.js');
  assert.match(limits,/maxPaymentMethods: 20/);
  assert.match(limits,/maxDeliveryMethods: 20/);
  assert.match(accounts,/id: 'mp-default'/);
  assert.match(accounts,/payment\.mercadoPagoAccountId = String\(first\.id\)/);
  assert.match(core,/initializeLegacyPlanLimits/);
  assert.match(core,/initializeLegacyStores/);
});

test('Dirección para recibir notificaciones tiene contraste específico también en modo oscuro',()=>{
  const view=readApp('client/src/views/seller/PaymentsView.vue');
  assert.match(view,/Dirección para recibir notificaciones/);
  assert.match(view,/\.mp-webhook-url\{[^}]+background:var\(--surface-alt\)[^}]+color:var\(--text\)/);
  assert.ok(view.includes(':global([data-theme="dark"]) .mp-webhook-url{background:var(--surface-strong);color:var(--text);border-color:var(--line-strong)}'));
});

test('un downgrade permite reducir configuración Checkout Pro sin bloquear el cupo',()=>{
  const routes=read('src/routes/core.js');
  const view=readApp('client/src/views/seller/PaymentsView.vue');
  assert.match(routes,/mercadoPagoRequiresFeature/);
  assert.match(routes,/disabledOnly/);
  assert.match(routes,/quitar\/convertir una forma/);
  assert.match(view,/const visiblePayments=computed\(\(\)=>store\.value\?\.payments\|\|\[\]\)/);
});
