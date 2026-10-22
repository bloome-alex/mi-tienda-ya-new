import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL('../src/'+file, import.meta.url),'utf8');

test('pantalla de dominio activa Nginx y SSL desde la misma verificación', () => {
  const view=source('views/seller/DomainView.vue');
  assert.match(view,/Verificación DNS y SSL/);
  assert.match(view,/Verificar y activar dominio/);
  assert.match(view,/Validando y configurando SSL/);
  assert.match(view,/Nginx configurado y certificado SSL emitido/);
  assert.match(view,/provisioningError/);
});
