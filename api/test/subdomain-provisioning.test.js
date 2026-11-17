// 1.25.7: el subdominio de la plataforma se activa sólo después de crear su sitio y certificado.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '9a'.repeat(32);
process.env.SESSION_SECRET ||= 'subdomain-provisioning-secret';
const { Store, User } = await import('../src/models/index.js');
const { DomainService } = await import('../src/services/DomainService.js');

let mongo;
before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

const storefront = { baseDomain: 'mitiendaya.com.ar', cnameTarget: 'stores.mitiendaya.com.ar', verificationPrefix: '_mty', reservedSubdomains: ['www'] };
function fakeProvisioner({ enabled = true, fail = false } = {}) {
  const calls = [];
  return { calls, enabled: () => enabled, async provision(args) { calls.push(['provision', args.domain]); if (fail) throw new Error('certbot falló'); }, async deprovision() { calls.push(['deprovision']); return true; } };
}
async function newStore(slug) {
  const owner = await User.create({ email: `${slug}@example.com`, name: slug, role: 'vendedor' });
  return Store.create({ name: slug, slug, ownerId: owner._id });
}

test('con aprovisionamiento activo, el subdominio queda activo sólo tras crear el certificado', async () => {
  const provisioner = fakeProvisioner();
  const service = new DomainService({ storefront, appUrl: 'https://mitiendaya.com.ar', provisioner });
  const store = await newStore('cafe-uno');
  await service.configure(store, { mode: 'subdomain', subdomain: 'cafe-uno' });
  assert.deepEqual(provisioner.calls, [['provision', 'cafe-uno.mitiendaya.com.ar']]);
  assert.equal(store.domain.status, 'verified');
  assert.ok(store.domain.provisionedAt);
  assert.equal(service.publicUrl(store), 'https://cafe-uno.mitiendaya.com.ar');
});

test('si el certificado falla, el subdominio queda pendiente y la tienda sigue en /t/', async () => {
  const provisioner = fakeProvisioner({ fail: true });
  const service = new DomainService({ storefront, appUrl: 'https://mitiendaya.com.ar', provisioner });
  const store = await newStore('cafe-dos');
  await assert.rejects(service.configure(store, { mode: 'subdomain', subdomain: 'cafe-dos' }), err => err.code === 'SUBDOMAIN_PROVISIONING_FAILED');
  const saved = await Store.findById(store._id);
  assert.equal(saved.domain.status, 'pending');
  assert.match(saved.domain.provisioningError, /certbot/);
  assert.equal(service.publicUrl(saved), 'https://mitiendaya.com.ar/t/cafe-dos');
});

test('volver al enlace /t/ elimina el sitio del subdominio aprovisionado', async () => {
  const provisioner = fakeProvisioner();
  const service = new DomainService({ storefront, appUrl: 'https://mitiendaya.com.ar', provisioner });
  const store = await newStore('cafe-tres');
  await service.configure(store, { mode: 'subdomain', subdomain: 'cafe-tres' });
  await service.configure(store, { mode: 'path' });
  assert.deepEqual(provisioner.calls.map(c => c[0]), ['provision', 'deprovision']);
});

test('sin aprovisionamiento automático se conserva el comportamiento anterior (certificado comodín)', async () => {
  const provisioner = fakeProvisioner({ enabled: false });
  const service = new DomainService({ storefront, appUrl: 'https://mitiendaya.com.ar', provisioner });
  const store = await newStore('cafe-cuatro');
  await service.configure(store, { mode: 'subdomain', subdomain: 'cafe-cuatro' });
  assert.deepEqual(provisioner.calls, []);
  assert.equal(store.domain.status, 'verified');
});
