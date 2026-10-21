import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('UploadedImage declara objectKey una sola vez y conserva el índice único parcial', async () => {
  const source = await fs.readFile(new URL('../src/models/index.js', import.meta.url), 'utf8');
  assert.match(source, /objectKey:\s*\{\s*type:\s*String\s*\}/);
  assert.doesNotMatch(source, /objectKey:\s*\{[^}]*index:\s*true/);
  assert.match(source, /uploadedImageSchema\.index\(\{\s*objectKey:\s*1\s*\},\s*\{\s*unique:\s*true,\s*partialFilterExpression:/);
});

test('el bootstrap reconcilia el índice legado antes de UploadedImage.init', async () => {
  const source = await fs.readFile(new URL('../src/services/core.js', import.meta.url), 'utf8');
  const reconcile = source.indexOf('reconcileUploadedImageObjectKeyIndex()');
  const init = source.indexOf('UploadedImage.init()');
  assert.ok(reconcile >= 0);
  assert.ok(init > reconcile);
});

test('la reconciliación valida duplicados antes de eliminar el índice anterior', async () => {
  const source = await fs.readFile(new URL('../src/services/DatabaseIndexService.js', import.meta.url), 'utf8');
  assert.match(source, /duplicateObjectKeys/);
  assert.match(source, /count:\s*\{\s*\$gt:\s*1\s*\}/);
  assert.match(source, /for \(const index of objectKeyIndexes\).*dropIndexIfPresent/s);
  assert.match(source, /No se puede corregir el índice de UploadedImage\.objectKey/);
});
