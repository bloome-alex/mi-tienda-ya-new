import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');

test('las cards del Home muestran tiendas y productos por tienda antes de las funcionalidades',()=>{
  const home=source('views/public/HomeView.vue');
  assert.match(home,/plan-capacities/);
  assert.match(home,/plan\.maxStores/);
  assert.match(home,/plan\.maxProducts/);
  assert.match(home,/productos por tienda/);
  assert.match(home,/Productos ilimitados/);
  assert.ok(home.indexOf('plan-capacities')<home.indexOf('plan.cardFeatures'));
});

test('Redes y anuncios mantiene Facebook e Instagram disponibles aunque versiones posteriores sumen proveedores',()=>{
  const view=source('views/seller/SocialAdsView.vue');
  assert.match(view,/activeNetwork=ref\('facebook'\)/);
  assert.match(view,/facebook:'Facebook'/);
  assert.match(view,/instagram:'Instagram'/);
  assert.match(view,/google:'Google Ads'/);
  assert.match(view,/social\/\$\{provider\}\/ads/);
});
test('los vendedores no reciben ayudas técnicas nuevas de Instagram',()=>{
  const view=source('views/seller/SocialAdsView.vue');
  assert.match(view,/<section v-if="isAdmin" class="p-section-card setup-help">/);
  assert.match(view,/META_APP_ID \/ SECRET/);
  assert.match(view,/Contactá a la administración/);
});
