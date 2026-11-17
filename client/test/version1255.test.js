// 1.25.5: correcciones de experiencia del editor de diseño y de la tienda detectadas en la prueba en producción.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clampNumber, normalizeHexColor, isWebUrl } from '../src/components/editor/fieldValidation.js';

const source = file => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');

test('los números del editor se ajustan al rango permitido', () => {
  assert.equal(clampNumber(99999, 240, 900), 900);
  assert.equal(clampNumber(-5, 0, 160), 0);
  assert.equal(clampNumber(560, 240, 900), 560);
  assert.equal(clampNumber('abc', 240, 900), 240);
});

test('los colores aceptan hexadecimales de 3 o 6 dígitos y rechazan los inválidos', () => {
  assert.equal(normalizeHexColor('#6B3E26'), '#6b3e26');
  assert.equal(normalizeHexColor('6b3e26'), '#6b3e26');
  assert.equal(normalizeHexColor('#abc'), '#aabbcc');
  assert.equal(normalizeHexColor('#zzzzzz'), '');
  assert.equal(normalizeHexColor(''), '');
});

test('los enlaces de redes sólo aceptan direcciones web completas', () => {
  assert.equal(isWebUrl('https://www.instagram.com/tienda'), true);
  assert.equal(isWebUrl('http://tienda.com.ar'), true);
  assert.equal(isWebUrl('javascript:alert(1)'), false);
  assert.equal(isWebUrl('instagram.com/tienda'), false);
  assert.equal(isWebUrl('https://usuario:clave@tienda.com'), false);
});

test('el campo del editor no aplica valores inválidos y muestra el error', () => {
  const field = source('components/editor/DesignField.vue');
  assert.match(field, /@input="typeNumber" @change="commitNumber"/);
  assert.match(field, /@input="typeColor" @blur="commitColor"/);
  assert.match(field, /class="ed-field-error" role="alert"/);
  assert.match(source('components/editor/DesignSocialEditor.vue'), /Revisá el enlace: debe empezar con https:\/\//);
});

test('el texto del enlace del menú acompaña el destino si no fue personalizado', () => {
  const nav = source('components/editor/DesignNavigationEditor.vue');
  assert.match(nav, /function followsDefault\(item\)/);
  assert.match(nav, /if\(automatic\)item\.label=suggestedLabel\(item\)/);
});

test('los avisos del panel no tapan el botón Guardar cambios', () => {
  assert.match(source('components/Notifications.vue'), /p-notifications-bottom/);
  assert.match(source('styles/panel.css'), /\.p-notifications\.p-notifications-bottom\{top:auto;bottom:22px/);
});

test('la tienda abre la sección del #ancla y el panel lateral no duplica el botón en escritorio', () => {
  assert.match(source('layouts/StoreLayout.vue'), /scrollToHashAfterLoad\(seq\)/);
  const nav = source('components/StoreCategoryNavigation.vue');
  assert.match(nav, /\.category-mode-sidebar>\.category-filter-button,\.category-mode-sidebar \.category-inline-panel\{display:none\}/);
  assert.match(nav, /open&&\(mode==='drawer'\|\|mode==='sidebar'\)/);
  assert.match(source('styles/storefront.css'), /\.store-contact-form \.notice\.success\{background:var\(--store-soft\)/);
  assert.match(source('views/seller/DesignView.vue'), /<strong class="ed-nowrap">Guardar cambios<\/strong>/);
});
