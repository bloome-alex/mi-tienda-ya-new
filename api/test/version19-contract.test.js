import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('categorías usan unicidad por tienda, padre y nombre', async () => {
  const source = await read('models/index.js');
  assert.match(source, /categorySchema\.index\(\{ storeId: 1, parentId: 1, name: 1 \}, \{ unique: true/);
  assert.match(source, /name: 'category_sibling_name_unique'/);
  assert.doesNotMatch(source, /categorySchema\.index\(\{ storeId: 1, name: 1 \}, \{ unique: true/);
});

test('bootstrap reconcilia el índice legado antes de Category.init', async () => {
  const source = await read('services/core.js');
  const reconcile = source.indexOf('reconcileCategoryUniquenessIndex()');
  const init = source.indexOf('Category.init()');
  assert.ok(reconcile >= 0 && init > reconcile);
});

test('la migración elimina sólo el índice legado después de validar hermanos duplicados', async () => {
  const source = await read('services/DatabaseIndexService.js');
  assert.match(source, /duplicateSiblingCategoryNames/);
  assert.match(source, /key\.storeId === 1 && key\.name === 1 && Object\.keys\(key\)\.length === 2/);
  assert.match(source, /Corregí esos registros antes de reiniciar/);
  assert.match(source, /for \(const index of legacy\) await this\.dropIndexIfPresent/);
});
