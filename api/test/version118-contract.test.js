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

test('custom plan requests have a dedicated admin detail route and page',()=>{
  const routes=read('src/routes/core.js');
  const router=readApp('client/src/router.js');
  const list=readApp('client/src/views/admin/CustomPlanRequestsView.vue');
  const detail=readApp('client/src/views/admin/CustomPlanRequestDetailView.vue');
  assert.match(routes,/get\('\/admin\/custom-plan-requests\/:id', requireAdmin/);
  assert.match(router,/path:'custom-plan-requests\/:id'/);
  assert.match(list,/Visualizar/);
  assert.match(detail,/Solicitud de plan/);
  assert.doesNotMatch(detail,/<[^>]*modal/i);
});

test('social ads expose the complete network catalog',()=>{
  const routes=read('src/routes/core.js');
  const view=readApp('client/src/views/seller/SocialAdsView.vue');
  for(const network of ['facebook','instagram','youtube','tiktok','google']) assert.match(routes,new RegExp(`key: '${network}'`));
  assert.match(routes,/status: 'available'/);
  for(const label of ['Facebook','Instagram','YouTube','TikTok','Google Ads']) assert.match(view,new RegExp(label));
});
test('Facebook credentials and OAuth state are protected at rest',()=>{
  const models=read('src/models/index.js');
  const service=read('src/services/FacebookAdsService.js');
  assert.match(models,/accessToken: \{ type: String, select: false/);
  assert.match(models,/socialOAuthStateSchema\.index\(\{ expiresAt: 1 \}, \{ expireAfterSeconds: 0 \}\)/);
  assert.match(service,/encryptSecret\(accessToken\)/);
  assert.match(service,/hashToken\(rawState\)/);
  assert.match(service,/delete data\.accessToken/);
});

test('Facebook ad creation is server-side, store scoped and paused by default',()=>{
  const service=read('src/services/FacebookAdsService.js');
  const routes=read('src/routes/core.js');
  for(const endpoint of ['campaigns','adsets','adimages','adcreatives','ads']) assert.match(service,new RegExp(endpoint));
  assert.ok((service.match(/status: 'PAUSED'/g)||[]).length >= 3);
  assert.match(service,/storeId: store\._id/);
  assert.match(service,/Product\.findOne\(\{ _id: productId, storeId: store\._id/);
  assert.match(service,/if \(campaignId\) await graph\.delete\(campaignId\)/);
  assert.match(routes,/post\('\/stores\/:storeId\/social\/facebook\/ads', requireStoreAccess/);
});

test('remote product images reject private destinations before Facebook upload',()=>{
  const service=read('src/services/FacebookAdsService.js');
  assert.match(service,/dns\.lookup\(hostname, \{ all: true \}\)/);
  assert.match(service,/isPrivateAddress/);
  assert.match(service,/value\.startsWith\('\:\:ffff:'/);
  assert.match(service,/MAX_IMAGE_BYTES = 10 \* 1024 \* 1024/);
});

test('sandbox is optional and social ads are governed by cumulative plan capabilities',()=>{
  const config=read('src/config.js');
  const service=read('src/services/PlanFeatureService.js');
  const catalog=service.slice(service.indexOf('PLAN_FEATURES'),service.indexOf('const featureMap'));
  assert.match(config,/META_SANDBOX_CONNECT_ENABLED/);
  assert.equal((catalog.match(/\{ key: '/g)||[]).length,18);
  for(const key of ['ads.limited','ads.premium','ads.enterprise']) assert.match(catalog,new RegExp(key.replaceAll('.','\\.')));
});
