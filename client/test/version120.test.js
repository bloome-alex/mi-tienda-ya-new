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

test('Redes y anuncios permite alternar Facebook e Instagram y muestra Google Ads como Muy pronto',()=>{
  const view=source('views/seller/SocialAdsView.vue');
  assert.match(view,/activeNetwork=ref\('facebook'\)/);
  assert.match(view,/Instagram Ads/);
  assert.match(view,/Conectar con Instagram/);
  assert.match(view,/Google Ads/);
  assert.match(view,/Muy pronto/);
  assert.match(view,/social\/\$\{provider\}\/ads/);
});

test('los vendedores no reciben ayudas técnicas nuevas de Instagram',()=>{
  const view=source('views/seller/SocialAdsView.vue');
  assert.match(view,/<section v-if="isAdmin" class="p-section-card setup-help">/);
  assert.match(view,/META_INSTAGRAM_REDIRECT_URI/);
  assert.match(view,/La conexión con Instagram todavía no está disponible\. Contactá a la administración\./);
});
