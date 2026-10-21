import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeDesign, designEnums, designNumberRanges } from '../src/services/design.js';
import { editorGroups } from '../src/components/editor/fields.js';

const source = file => readFileSync(new URL('../src/'+file, import.meta.url),'utf8');

test('las categorías de cabecera expanden cada nivel por hover hasta la última rama',()=>{
  const branch=source('components/StoreCategoryBranch.vue');
  const navigation=source('components/StoreCategoryNavigation.vue');
  assert.match(branch,/:hover-expand="hoverExpand"/);
  assert.match(branch,/@mouseenter="openOnHover"/);
  assert.match(branch,/@focusin="focusIn"/);
  assert.match(navigation,/hover-expand @select="select"/);
});

test('el panel desplegable se superpone al catálogo sin drawer global y permite animación configurable',()=>{
  const navigation=source('components/StoreCategoryNavigation.vue');
  const store=source('views/public/StoreView.vue');
  assert.match(store,/with-overlay-panel/);
  assert.match(store,/grid-area:1\/1/);
  assert.match(navigation,/category-panel-slide/);
  assert.match(navigation,/category-panel-fade/);
  assert.match(navigation,/category-panel-scale/);
  assert.doesNotMatch(navigation,/position:fixed;inset:0/);
  const design=normalizeDesign({});
  assert.equal(design.shop.categoryPanelAnimation,'slide');
  assert.equal(design.shop.categoryPanelDuration,260);
  assert.deepEqual(designEnums['shop.categoryPanelAnimation'],['slide','fade','scale']);
  assert.deepEqual(designNumberRanges['shop.categoryPanelDuration'],[120,700]);
  const catalog=editorGroups.shop.find(group=>group.key==='catalog');
  assert.ok(catalog.items.some(item=>item.key==='categoryPanelAnimation'));
  assert.ok(catalog.items.some(item=>item.key==='categoryPanelDuration'));
});

test('Textos no muestra la explicación funcional solicitada',()=>{
  const copy=source('components/editor/DesignCopyEditor.vue');
  assert.doesNotMatch(copy,/Todos los textos visibles de la tienda se editan acá/);
  assert.doesNotMatch(copy,/Incluye títulos, descripciones, etiquetas, botones/);
});

test('el ABM de categorías conserva sólo el control de despliegue y elimina el segundo chevron decorativo',()=>{
  const categories=source('views/seller/CategoriesView.vue');
  assert.match(categories,/class="category-expand"/);
  assert.doesNotMatch(categories,/class="category-branch"/);
  assert.doesNotMatch(categories,/v-else name="chevron-right"/);
});

test('Diseño elimina el encabezado promocional y ubica estado y guardado después de Ver tienda',()=>{
  const design=source('views/seller/DesignView.vue');
  assert.doesNotMatch(design,/TU MARCA, TU ESTILO/);
  assert.doesNotMatch(design,/>Diseño de tu tienda</);
  assert.doesNotMatch(design,/Personalizá cada detalle y recorré el resultado en tiempo real/);
  const view=design.indexOf('<span>Ver tienda</span>');
  const state=design.indexOf('class="design-save-state"');
  const save=design.indexOf('class="btn btn-primary btn-sm design-save-button"');
  assert.ok(view>=0 && state>view && save>state);
});
