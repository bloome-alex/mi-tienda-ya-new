import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('config expone el aprovisionamiento automático de dominios por variables de entorno', async () => {
  const source = await read('src/config.js');
  for (const variable of ['DOMAIN_PROVISIONING_ENABLED','DOMAIN_PROVISIONER_BIN','DOMAIN_PROVISIONING_USE_SUDO','DOMAIN_PROVISIONER_SUDO_BIN','DOMAIN_PROVISIONING_TIMEOUT_MS']) assert.match(source, new RegExp(variable));
});

test('DomainProvisioningService usa execFile sin shell y sudo no interactivo', async () => {
  const source = await read('src/services/DomainProvisioningService.js');
  assert.match(source, /execFile/);
  assert.match(source, /args: \['-n', this\.settings\.provisionerBin/);
  assert.doesNotMatch(source, /exec\(/);
  assert.match(source, /DOMAIN_PROVISIONING_FAILED/);
});

test('verificar TXT aprovisiona Nginx y SSL antes de marcar el dominio verified', async () => {
  const source = await read('src/services/DomainService.js');
  const txt = source.indexOf('resolveTxt(name)');
  const provision = source.indexOf('this.provisioner.provision');
  const verified = source.indexOf("store.domain.status = 'verified'", provision);
  assert.ok(txt >= 0 && provision > txt && verified > provision);
  assert.match(source, /store\.domain\.provisioningError = error\.message/);
  assert.match(source, /store\.domain\.provisionedAt = now/);
  assert.match(source, /catch \(error\) \{\s*await this\.provisioner\.deprovision/);
});

test('cambiar o archivar una tienda limpia el sitio Nginx anterior', async () => {
  const domain = await read('src/services/DomainService.js');
  const routes = await read('src/routes/core.js');
  assert.match(domain, /previousCustomDomain !== currentCustomDomain/);
  assert.match(domain, /deprovisionStore\(store\)/);
  assert.match(routes, /domainService\.deprovisionStore\(before\)/);
});

test('helper privilegiado valida entradas, usa ACME webroot y valida Nginx', async () => {
  const helper = await read('../scripts/server/mitiendaya-domain-provision');
  assert.match(helper, /STORE_ID.*\^\[a-fA-F0-9\]/s);
  assert.match(helper, /\.well-known\/acme-challenge/);
  assert.match(helper, /certonly/);
  assert.match(helper, /--webroot/);
  assert.match(helper, /"\$NGINX_BIN" -t/);
  assert.match(helper, /ssl_certificate \/etc\/letsencrypt\/live\/\$\{CERT_NAME\}\/fullchain\.pem/);
});

test('instalador limita sudo al helper root-owned y agrega hook de renovación', async () => {
  const installer = await read('../scripts/server/install-domain-provisioner.sh');
  assert.match(installer, /install -o root -g root -m 0755/);
  assert.match(installer, /NOPASSWD: \$\{HELPER_TARGET\} \*/);
  assert.match(installer, /renewal-hooks\/deploy/);
  assert.match(installer, /visudo -cf/);
});
