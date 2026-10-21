import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeDesign, designNumberRanges } from '../src/services/design.js';
import { editorGroups } from '../src/components/editor/fields.js';

const source = file => readFileSync(new URL('../src/'+file, import.meta.url),'utf8');

test('la cabecera de categorías no pierde el hover al cruzar hacia el submenú',()=>{
  const navigation=source('components/StoreCategoryNavigation.vue');
  assert.match(navigation,/queueCloseCategories/);
  assert.match(navigation,/setTimeout\(\(\)=>\{expanded\.value='';categoryCloseTimer=undefined;\},120\)/);
  assert.match(navigation,/top:calc\(100% - 1px\)/);
  assert.match(navigation,/@mouseenter="openCategory\(expandedCategory\)" @mouseleave="queueCloseCategories"/);
});

test('destacados y catálogo permiten columnas distintas en escritorio y celular',()=>{
  const design=normalizeDesign({});
  assert.equal(design.shop.featuredColumns,3);
  assert.equal(design.shop.featuredMobileColumns,2);
  assert.equal(design.shop.catalogColumns,3);
  assert.equal(design.shop.catalogMobileColumns,2);
  assert.deepEqual(designNumberRanges['shop.featuredColumns'],[1,5]);
  assert.deepEqual(designNumberRanges['shop.featuredMobileColumns'],[1,4]);
  assert.deepEqual(designNumberRanges['shop.catalogColumns'],[1,5]);
  assert.deepEqual(designNumberRanges['shop.catalogMobileColumns'],[1,4]);
  const shop=editorGroups.shop;
  const featured=shop.find(group=>group.key==='featured');
  const catalog=shop.find(group=>group.key==='catalog');
  assert.ok(featured.items.some(item=>item.key==='featuredColumns'));
  assert.ok(featured.items.some(item=>item.key==='featuredMobileColumns'));
  assert.ok(catalog.items.some(item=>item.key==='catalogColumns'));
  assert.ok(catalog.items.some(item=>item.key==='catalogMobileColumns'));
});

test('las columnas antiguas se migran a las nuevas grillas de escritorio sin cambiar MongoDB',()=>{
  const design=normalizeDesign({shop:{columns:5}});
  assert.equal(design.shop.catalogColumns,5);
  assert.equal(design.shop.featuredColumns,5);
  assert.equal(design.shop.catalogMobileColumns,2);
  assert.equal(design.shop.featuredMobileColumns,2);
});

test('las secciones personalizadas configuran columnas para escritorio y celular',()=>{
  const editor=source('components/editor/DesignSectionsEditor.vue');
  const renderer=source('components/StoreSections.vue');
  assert.match(editor,/key:'columns',label:'Columnas de complementos en escritorio'/);
  assert.match(editor,/key:'mobileColumns',label:'Columnas de complementos en celular'/);
  assert.match(renderer,/'--custom-mobile-columns': section\.mobileColumns/);
  assert.doesNotMatch(renderer,/grid-template-columns:1fr;gap:25px/);
  const design=normalizeDesign({sections:[{id:'s1',type:'gallery',columns:4}]});
  assert.equal(design.sections[0].columns,4);
  assert.equal(design.sections[0].mobileColumns,1);
  assert.deepEqual(designNumberRanges['sections.*.mobileColumns'],[1,4]);
});

test('la grilla de fotos del producto permite columnas distintas por dispositivo',()=>{
  const product=editorGroups.product.find(group=>group.key==='layout');
  assert.ok(product.items.some(item=>item.key==='galleryColumns'));
  assert.ok(product.items.some(item=>item.key==='galleryMobileColumns'));
  const view=source('views/public/ProductView.vue');
  const css=source('styles/storefront.css');
  assert.match(view,/'--gallery-cols':design\.galleryColumns/);
  assert.match(view,/'--gallery-mobile-cols':design\.galleryMobileColumns/);
  assert.match(css,/repeat\(var\(--gallery-cols,2\),minmax\(0,1fr\)\)/);
  assert.match(css,/repeat\(var\(--gallery-mobile-cols,2\),minmax\(0,1fr\)\)/);
});

test('la tienda publicada usa la configuración específica del catálogo y destacados',()=>{
  const store=source('views/public/StoreView.vue');
  const featured=source('components/StoreFeatured.vue');
  const layout=source('layouts/StoreLayout.vue');
  assert.match(store,/design\.shop\.catalogColumns/);
  assert.match(featured,/'--store-cols': settings\.value\.featuredColumns/);
  assert.match(featured,/'--store-mobile-cols': settings\.value\.featuredMobileColumns/);
  assert.match(layout,/'--store-mobile-cols':design\.value\.shop\.catalogMobileColumns/);
  assert.doesNotMatch(store,/design\.shop\.columns/);
});
