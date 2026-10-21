import test from 'node:test';
import assert from 'node:assert/strict';
import { PREVIEW_MESSAGE, isTrustedPreviewMessage, previewSectionPath, readPreviewLocation } from '../src/services/previewProtocol.js';

const storeId = '64ab01234567890123456789';
const productId = '64ab98765432109876543210';
const source = {};
const trust = { origin: 'https://tienda.example', source, storeId, types: [PREVIEW_MESSAGE.ready, PREVIEW_MESSAGE.location] };
const ready = { origin: trust.origin, source, data: { type: PREVIEW_MESSAGE.ready, storeId, path: '/t/mi-tienda' } };

test('the preview handshake rejects a different window, origin or store', () => {
  assert.equal(isTrustedPreviewMessage(ready, trust), true);
  for (const event of [
    { ...ready, origin: 'https://otra.example' },
    { ...ready, source: {} },
    { ...ready, data: { ...ready.data, storeId: '64ab00000000000000000000' } },
    { ...ready, data: { ...ready.data, type: PREVIEW_MESSAGE.design } },
    { ...ready, data: null },
    { ...ready, data: [] }
  ]) assert.equal(isTrustedPreviewMessage(event, trust), false);
  assert.equal(isTrustedPreviewMessage({ ...ready, source: null }, { ...trust, source: null }), false);
  assert.equal(isTrustedPreviewMessage({ ...ready, origin: 'null' }, { ...trust, origin: 'null' }), false);
});

test('preview page reports identify all editable pages and their trailing-slash URLs', () => {
  const pages = [
    ['shop', '/t/mi-tienda'],
    ['product', `/t/mi-tienda/producto/${productId}`],
    ['cart', '/t/mi-tienda/carrito'],
    ['checkout', '/t/mi-tienda/checkout'],
    ['terms', '/t/mi-tienda/terminos']
  ];
  for (const [section, path] of pages) {
    assert.equal(readPreviewLocation(path, 'mi-tienda')?.section, section);
    assert.equal(readPreviewLocation(path + '/', 'mi-tienda')?.section, section);
    assert.equal(previewSectionPath(section, 'mi-tienda', productId), path);
  }
});

test('a page report cannot redirect or select controls for an unrelated route', () => {
  for (const path of [
    'https://tienda.example/t/mi-tienda/carrito',
    '//otra.example/t/mi-tienda',
    '/t/otra-tienda/checkout',
    '/t/mi-tienda-falsa/checkout',
    '/t/mi-tienda/../otra-tienda',
    '/t/mi-tienda/checkout?preview=otro',
    '/t/mi-tienda/producto/invalid',
    `/t/mi-tienda/producto/${productId}/extra`,
    '/root/login'
  ]) assert.equal(readPreviewLocation(path, 'mi-tienda'), null);
});

test('commands generate only store pages and never accept arbitrary URLs as destinations', () => {
  assert.equal(previewSectionPath('https://otra.example', 'mi-tienda'), null);
  assert.equal(previewSectionPath('brand', 'mi-tienda'), null);
  assert.equal(previewSectionPath('product', 'mi-tienda', '../carrito'), null);
  assert.equal(previewSectionPath('product', 'mi-tienda'), null);
  assert.equal(previewSectionPath('shop', '../otra-tienda'), null);
  assert.equal(previewSectionPath('shop', 'tienda?preview=otra'), null);
});
