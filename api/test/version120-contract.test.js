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

test('Instagram Ads usa una integración propia sobre Meta y persiste una identidad profesional por tienda',()=>{
  const models=read('src/models/index.js');
  const service=read('src/services/InstagramAdsService.js');
  assert.match(models,/enum: \['facebook', 'instagram', 'google', 'youtube', 'tiktok'\]/);
  assert.match(models,/selectedInstagramUserId/);
  assert.match(service,/class InstagramAdsService extends FacebookAdsService/);
  assert.match(service,/provider: 'instagram'/);
  assert.match(service,/instagram_business_account/);
  assert.match(service,/instagram_user_id/);
});

test('Instagram crea anuncios pausados sólo para placements de Instagram y conserva rollback',()=>{
  const service=read('src/services/InstagramAdsService.js');
  assert.match(service,/publisher_platforms: \['instagram'\]/);
  assert.ok((service.match(/status: 'PAUSED'/g)||[]).length>=3);
  assert.match(service,/if \(campaignId\) await graph\.delete\(campaignId\)/);
  assert.doesNotMatch(service,/instagram_actor_id/);
});

test('las rutas públicas de anuncios mantienen Instagram disponible y permiten que versiones posteriores amplíen proveedores',()=>{
  const routes=read('src/routes/core.js');
  assert.match(routes,/social\/instagram\/callback/);
  assert.match(routes,/social\/instagram\/connect/);
  assert.match(routes,/social\/instagram\/assets/);
  assert.match(routes,/social\/instagram\/ads/);
  assert.match(routes,/key: 'instagram', label: 'Instagram', featureKey: SOCIAL_AD_FEATURES\.instagram/);
  assert.match(routes,/status: 'available'/);
});

test('existe un stack mock independiente de Instagram y el comando combinado lo ejecuta',()=>{
  const pkg=JSON.parse(readApp('package.json'));
  const mock=readApp('scripts/test-instagram-ads-mock.mjs');
  assert.equal(pkg.scripts['test:mock:instagram'],'node --test --test-concurrency=1 scripts/test-instagram-ads-mock.mjs');
  assert.match(pkg.scripts['test:mock:ads'],/test:mock:instagram/);
  assert.match(mock,/MockMetaInstagramServer/);
  assert.match(mock,/instagram_user_id/);
  assert.match(mock,/publisher_platforms/);
  assert.match(mock,/rollback|limpia la campaña/i);
});

test('la configuración separa el callback de Instagram sin duplicar las credenciales Meta',()=>{
  const config=read('src/config.js');
  const env=readApp('.env.example');
  assert.match(config,/META_INSTAGRAM_REDIRECT_URI/);
  assert.match(env,/META_INSTAGRAM_REDIRECT_URI=/);
  assert.doesNotMatch(env,/META_INSTAGRAM_APP_ID|META_INSTAGRAM_APP_SECRET/);
});
