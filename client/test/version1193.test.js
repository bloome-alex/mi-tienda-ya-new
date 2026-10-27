import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = file => readFileSync(resolve(here, '..', 'src', file), 'utf8');

test('Facebook usa una sola columna completa para vendedores y conserva dos columnas para administración', () => {
  const view = src('views/seller/SocialAdsView.vue');
  assert.match(view, /class="facebook-connect-grid" :class="\{'facebook-connect-grid-seller':!isAdmin\}"/);
  assert.match(view, /\.facebook-connect-grid\{display:grid;grid-template-columns:1fr 1fr;gap:16px\}/);
  assert.match(view, /\.facebook-connect-grid-seller\{grid-template-columns:1fr\}/);
  assert.match(view, /<details v-if="isAdmin&&current\.sandboxAllowed"/);
});
