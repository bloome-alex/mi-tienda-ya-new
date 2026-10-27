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

test('publicidad agrega tres niveles acumulativos al catálogo comercial v3',()=>{
  const service=read('src/services/PlanFeatureService.js');
  const catalog=service.slice(service.indexOf('PLAN_FEATURES'),service.indexOf('const featureMap'));
  assert.match(service,/PLAN_FEATURE_SCHEMA_VERSION = 3/);
  assert.match(catalog,/ads\.limited[^\n]+Facebook Ads e Instagram Ads/);
  assert.match(catalog,/ads\.premium[^\n]+Google Ads[^\n]+implies: \['ads\.limited'\]/);
  assert.match(catalog,/ads\.enterprise[^\n]+YouTube Ads y TikTok Ads[^\n]+implies: \['ads\.premium', 'ads\.limited'\]/);
  assert.equal((catalog.match(/\{ key: '/g)||[]).length,18);
});

test('la migración asigna niveles conocidos y conserva acceso completo en planes personalizados anteriores',()=>{
  const service=read('src/services/PlanFeatureService.js');
  assert.match(service,/name\.includes\('emprendedor'\).*ads\.limited/s);
  assert.match(service,/name\.includes\('profesional'\).*ads\.premium/s);
  assert.match(service,/name\.includes\('empresarial'\).*name\.includes\('creador'\).*ads\.enterprise/s);
  assert.match(service,/personalizados\/desconocidos/);
  assert.match(service,/conserva el acceso completo al migrar/);
  assert.match(service,/next\.add\(this\.legacyAdvertisingKey\(row\)\)/);
});

test('cada proveedor publicitario está protegido por el nivel correcto también en backend',()=>{
  const routes=read('src/routes/core.js');
  assert.match(routes,/facebook: 'ads\.limited'/);
  assert.match(routes,/instagram: 'ads\.limited'/);
  assert.match(routes,/google: 'ads\.premium'/);
  assert.match(routes,/youtube: 'ads\.enterprise'/);
  assert.match(routes,/tiktok: 'ads\.enterprise'/);
  assert.match(routes,/stores\/:storeId\/social', requireStoreAccess, requireFeature\('ads\.limited'\)/);
  assert.match(routes,/social\/facebook\/connect', requireStoreAccess, requireFeature\('ads\.limited'\)/);
  assert.match(routes,/social\/instagram\/ads', requireStoreAccess, requireFeature\('ads\.limited'\)/);
  assert.match(routes,/social\/google\/ads', requireStoreAccess, requireFeature\('ads\.premium'\)/);
  assert.match(routes,/social\/youtube\/ads', requireStoreAccess, requireFeature\('ads\.enterprise'\)/);
  assert.match(routes,/social\/tiktok\/ads', requireStoreAccess, requireFeature\('ads\.enterprise'\)/);
  assert.match(routes,/await assertPlanFeature\(req\.user, socialFeature\(provider\)\)/);
});

test('la API social sólo devuelve redes permitidas por el plan efectivo',()=>{
  const routes=read('src/routes/core.js');
  assert.match(routes,/const allowed = SOCIAL_AD_NETWORKS\.filter\(network => featureKeys\.includes\(network\.featureKey\)\)/);
  assert.match(routes,/networks: allowed\.map/);
  assert.match(routes,/allowed\.map\(network => network\.service\.status/);
});

test('Vue oculta Redes y anuncios sin nivel limitado y carga sólo proveedores habilitados',()=>{
  const router=readApp('client/src/router.js');
  const layout=readApp('client/src/layouts/DashboardLayout.vue');
  const view=readApp('client/src/views/seller/SocialAdsView.vue');
  assert.match(router,/path:'social'[^\n]+feature:'ads\.limited'/);
  assert.match(layout,/\['Redes y anuncios','\/app\/social','megaphone','ads\.limited'\]/);
  assert.match(view,/const allowed=\(data\.value\?\.networks\|\|\[\]\)\.map\(item=>item\.key\)/);
  assert.match(view,/await Promise\.all\(allowed\.map\(loadProducts\)\)/);
});

test('el modelo y guardado usan feature schema v3 sin hardcodear una versión anterior',()=>{
  const model=read('src/models/index.js');
  const routes=read('src/routes/core.js');
  assert.match(model,/featureSchemaVersion: \{ type: Number, default: 3 \}/);
  assert.match(routes,/PLAN_FEATURE_SCHEMA_VERSION/);
  assert.match(routes,/payload\.featureSchemaVersion = PLAN_FEATURE_SCHEMA_VERSION/);
  assert.doesNotMatch(routes,/payload\.featureSchemaVersion = 2/);
});
