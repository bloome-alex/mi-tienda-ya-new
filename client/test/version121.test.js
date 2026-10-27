import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
test('Redes y anuncios habilita los cinco proveedores y ninguno queda como Muy pronto',()=>{const view=source('views/seller/SocialAdsView.vue');for(const provider of ['facebook','instagram','youtube','tiktok','google'])assert.match(view,new RegExp(provider));for(const label of ['Facebook','Instagram','YouTube Ads','TikTok Ads','Google Ads'])assert.match(view,new RegExp(label));assert.doesNotMatch(view,/Muy pronto/);});
test('YouTube pide video y TikTok usa identidad más video de biblioteca',()=>{const view=source('views/seller/SocialAdsView.vue');assert.match(view,/youtubeVideo/);assert.match(view,/logoUrl/);assert.match(view,/identityKey/);assert.match(view,/videoId/);assert.match(view,/Cargar activos de la cuenta/);});
test('la ayuda técnica sigue restringida a administradores',()=>{const view=source('views/seller/SocialAdsView.vue');assert.match(view,/<section v-if="isAdmin" class="p-section-card setup-help">/);assert.match(view,/GOOGLE_ADS_CLIENT_ID/);assert.match(view,/TikTok for Business/);});
