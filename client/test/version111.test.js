import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL('../src/'+file, import.meta.url),'utf8');

test('pantalla de dominio permite verificar y activar sin exponer infraestructura interna al vendedor', () => {
  const view=source('views/seller/DomainView.vue');
  assert.match(view,/Verificación del dominio/);
  assert.match(view,/Verificar y activar dominio/);
  assert.match(view,/Validando y activando/);
  assert.match(view,/Dominio verificado y activado correctamente/);
  assert.match(view,/provisioningError/);
  assert.doesNotMatch(view,/Nginx configurado|certificado SSL emitido|configurando SSL/);
});
