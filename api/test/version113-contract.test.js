import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('personificación sólo se habilita fuera de producción y por variable de entorno', async () => {
  const config = await read('src/config.js');
  const routes = await read('src/routes/core.js');
  const models = await read('src/models/index.js');
  assert.match(config, /DEV_IMPERSONATION_ENABLED/);
  assert.match(config, /config\.isProduction && process\.env\.DEV_IMPERSONATION_ENABLED === 'true'/);
  assert.match(routes, /\/admin\/users\/:id\/impersonate/);
  assert.match(routes, /\/auth\/impersonation\/exit/);
  assert.match(models, /impersonatedByUserId/);
});

test('administración dispone de plantillas y envío masivo a vendedores', async () => {
  const routes = await read('src/routes/core.js');
  const service = await read('src/services/SellerMailService.js');
  assert.match(routes, /\/admin\/emails/);
  assert.match(routes, /\/admin\/emails\/send/);
  assert.match(service, /release/);
  assert.match(service, /announcement/);
  assert.match(service, /maintenance/);
  assert.match(service, /role: 'vendedor'/);
  assert.doesNotMatch(service, /role: 'vendedor', active: true/);
  assert.match(service, /MiTiendaYa/);
});

test('asunto y CTA de emails masivos quedan validados', async () => {
  const routes = await read('src/routes/core.js');
  assert.match(routes, /El asunto no puede contener saltos de línea/);
  assert.match(routes, /\^https\?:\\\/\\\//);
});
