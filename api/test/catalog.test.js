import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { User, Store, Product, Category, CategoryHierarchy, Plan, Session, AuditLog } from '../src/models/index.js';
import { Order, StockMovement, MailJob } from '../src/models/commerce.js';
import { CategoryService, categoryService } from '../src/services/CategoryService.js';
import { CommerceService } from '../src/services/commerce.js';
import { hashToken } from '../src/utils/crypto.js';

let mongo, app;
before(async () => {
  config.encryptionKey = 'ac'.repeat(32); config.sessionSecret = 'catalog-test-private-secret'; config.isProduction = false; config.appUrl = 'http://localhost:5000'; config.trustProxy = 0;
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User, Store, Product, Category, CategoryHierarchy, Plan, Session, AuditLog, Order, StockMovement, MailJob].map(model => model.init()));
  app = createApp();
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => { await Promise.all([User, Store, Product, Category, CategoryHierarchy, Plan, Session, AuditLog, Order, StockMovement, MailJob].map(model => model.deleteMany({}))); });

async function fixture() {
  const user = await User.create({ role: 'vendedor', email: `${crypto.randomUUID()}@example.test`, name: 'Vendedor de catálogo', trialEndsAt: new Date(Date.now() + 86400000), active: true });
  const store = await Store.create({ ownerId: user._id, name: 'Catálogo de prueba', slug: `catalogo-${crypto.randomUUID().slice(0, 8)}`, active: true,
    payments: [{ id: 'cash', type: 'cash', name: 'Efectivo', active: true, deliveryIds: ['pickup'] }],
    deliveries: [{ id: 'pickup', type: 'pickup', name: 'Retiro', price: 0, active: true }],
  });
  const token = crypto.randomBytes(32).toString('hex'), csrfToken = crypto.randomUUID();
  await Session.create({ userId: user._id, tokenHash: hashToken(token), csrfToken, expiresAt: new Date(Date.now() + 86400000) });
  return { user, store, token, csrfToken };
}
function api(who, method, suffix, body) {
  const call = request(app)[method](`/api/stores/${who.store._id}${suffix}`).set('Cookie', `mt_session=${who.token}`);
  return ['get', 'head'].includes(method) ? call : call.set('X-CSRF-Token', who.csrfToken).send(body || {});
}
const objectIds = products => products.map(product => String(product._id)).sort();
const category = (who, name, parentId = null, extra = {}) => categoryService.create(who.store._id, { name, parentId, active: true, ...extra });
const product = (who, name, extra = {}) => Product.create({ storeId: who.store._id, name, price: 100, stock: 20, active: true, ...extra });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('categorías y subcategorías se administran por API sin exponer referencias internas', async () => {
  const who = await fixture();
  const root = await api(who, 'post', '/categories', { name: 'Indumentaria' });
  assert.equal(root.status, 201); assert.equal(root.body.data.parentId, null);
  const child = await api(who, 'post', '/categories', { name: 'Remeras', parentId: root.body.data._id });
  assert.equal(child.status, 201); assert.equal(child.body.data.parentId, root.body.data._id);
  const duplicate = await api(who, 'post', '/categories', { name: 'Remeras', parentId: root.body.data._id });
  assert.equal(duplicate.status, 409);
  assert.equal((await Category.findById(root.body.data._id).select('+hierarchyLinks')).hierarchyLinks.length, 1, 'una creación rechazada libera sólo su propia referencia');
  const detail = await api(who, 'get', `/categories/${child.body.data._id}`);
  assert.equal(detail.body.data.parentLinkToken, undefined); assert.equal(detail.body.data.hierarchyLinks, undefined);
  const list = await api(who, 'get', '/categories');
  assert.equal(list.body.meta.total, 2); assert.ok(list.body.data.every(item => item.parentLinkToken === undefined && item.hierarchyLinks === undefined));
  assert.equal((await api(who, 'get', '/categories?parentId=root')).body.meta.total, 1);
  assert.equal((await api(who, 'get', `/categories?parentId=${root.body.data._id}`)).body.data[0]._id, child.body.data._id);
  const rename = await api(who, 'put', `/categories/${child.body.data._id}`, { name: 'Remeras de algodón' });
  assert.equal(rename.body.data.parentId, root.body.data._id, 'una edición parcial conserva su padre');
  for (const categoryId of [root.body.data._id, child.body.data._id]) {
    const created = await api(who, 'post', '/products', { name: `Producto ${categoryId}`, price: 900, categoryId });
    assert.equal(created.status, 201, JSON.stringify(created.body)); assert.equal(created.body.data.categoryId, categoryId); assert.equal(created.body.data.featured, false);
  }
});

test('la jerarquía permite varios niveles y rechaza autorreferencia, ciclos y padres ajenos o archivados', async () => {
  const who = await fixture(), other = await fixture();
  const root = await category(who, 'Hogar'), child = await category(who, 'Cocina', root._id), foreign = await category(other, 'Ajena'), removed = await category(who, 'Archivada');
  await categoryService.archive(who.store._id, removed._id);
  const self = await api(who, 'put', `/categories/${root._id}`, { parentId: String(root._id) });
  assert.equal(self.status, 422); assert.equal(self.body.error.code, 'CATEGORY_SELF_PARENT');
  const third = await api(who, 'post', '/categories', { name: 'Accesorios', parentId: String(child._id) });
  assert.equal(third.status, 201); assert.equal(third.body.data.parentId, String(child._id));
  for (const parentId of [foreign._id, removed._id]) {
    const result = await api(who, 'post', '/categories', { name: `Inválida ${parentId}`, parentId: String(parentId) });
    assert.equal(result.status, 422); assert.equal(result.body.error.code, 'CATEGORY_PARENT_INVALID');
  }
  const cycle = await api(who, 'put', `/categories/${root._id}`, { parentId: third.body.data._id });
  assert.equal(cycle.status, 422); assert.equal(cycle.body.error.code, 'CATEGORY_CYCLE');
  assert.equal((await Category.findById(root._id)).parentId, null);
  assert.equal((await api(who, 'post', '/categories', { name: 'Inválida', parentId: 'not-an-id' })).status, 422);
  assert.equal((await request(app).put(`/api/stores/${other.store._id}/categories/${foreign._id}`).set('Cookie', `mt_session=${who.token}`).set('X-CSRF-Token', who.csrfToken).send({ name: 'Intrusión' })).status, 404);
});

test('una rama con hijos inactivos se puede mover, conserva sus productos y no se puede borrar mientras tenga hijos', async () => {
  const who = await fixture();
  const root = await category(who, 'Casa'), otherRoot = await category(who, 'Otra principal');
  const child = await category(who, 'Dormitorio', root._id, { active: false });
  const direct = await product(who, 'Directo', { categoryId: root._id }), nested = await product(who, 'En subcategoría', { categoryId: child._id });
  const removed = await api(who, 'delete', `/categories/${root._id}`);
  assert.equal(removed.status, 409); assert.equal(removed.body.error.code, 'CATEGORY_HAS_CHILDREN');
  const branchMove = await api(who, 'put', `/categories/${root._id}`, { parentId: String(otherRoot._id) });
  assert.equal(branchMove.status, 200, JSON.stringify(branchMove.body)); assert.equal(branchMove.body.data.parentId, String(otherRoot._id));
  assert.equal(String((await Category.findById(child._id)).parentId), String(root._id));
  assert.equal(String((await Product.findById(direct._id)).categoryId), String(root._id));
  assert.equal(String((await Product.findById(nested._id)).categoryId), String(child._id));
  const moved = await api(who, 'put', `/categories/${child._id}`, { parentId: null });
  assert.equal(moved.status, 200); assert.equal(moved.body.data.parentId, null);
  assert.equal((await api(who, 'delete', `/categories/${root._id}`)).status, 200);
  assert.equal((await Product.findById(direct._id)).categoryId, undefined);
  assert.equal(String((await Product.findById(nested._id)).categoryId), String(child._id));
  assert.equal(await Product.countDocuments({ storeId: who.store._id, archived: false }), 2);
});

test('los filtros públicos y privados incluyen todos los descendientes del nivel seleccionado', async () => {
  const who = await fixture(), other = await fixture();
  const root = await category(who, 'Ropa'), child = await category(who, 'Remeras', root._id), sibling = await category(who, 'Pantalones', root._id), different = await category(who, 'Decoración'), foreign = await category(other, 'Privada');
  const direct = await product(who, 'A', { categoryId: root._id }), nested = await product(who, 'B', { categoryId: child._id }), next = await product(who, 'C', { categoryId: sibling._id });
  const third = await category(who, 'Algodón', child._id), fourth = await category(who, 'Talles especiales', third._id);
  const deep = await product(who, 'Algodón básico', { categoryId: third._id }), deepest = await product(who, 'Remera XXL', { categoryId: fourth._id });
  await product(who, 'D', { categoryId: different._id });
  const catalog = await request(app).get(`/api/public/stores/${who.store.slug}?categoryId=${root._id}&limit=2&page=1&sort=name`);
  assert.equal(catalog.status, 200); assert.equal(catalog.body.data.meta.total, 5); assert.equal(catalog.body.data.products.length, 2);
  assert.equal(catalog.body.data.categories.find(item => item._id === String(child._id)).parentId, String(root._id));
  const alias = await request(app).get(`/api/public/stores/${who.store.slug}?category=${root._id}`);
  assert.deepEqual(objectIds(alias.body.data.products), objectIds([direct, nested, next, deep, deepest]));
  const leaf = await request(app).get(`/api/public/stores/${who.store.slug}?categoryId=${child._id}`);
  assert.deepEqual(objectIds(leaf.body.data.products), objectIds([nested, deep, deepest]));
  assert.deepEqual(objectIds((await request(app).get(`/api/public/stores/${who.store.slug}?categoryId=${fourth._id}`)).body.data.products), objectIds([deepest]));
  const privateList = await api(who, 'get', `/products?category=${root._id}`);
  assert.equal(privateList.body.meta.total, 5);
  assert.equal((await api(who, 'get', `/products?categoryId=${String(child._id).toUpperCase()}`)).body.meta.total, 3);
  const foreignFilter = await request(app).get(`/api/public/stores/${who.store.slug}?categoryId=${foreign._id}`);
  assert.equal(foreignFilter.body.data.meta.total, 0);
  assert.equal((await api(who, 'get', `/products?categoryId=${root._id}&category=${child._id}`)).status, 422);
});

test('los destacados son globales, tienen límite y no dependen de filtros ni de la página de productos', async () => {
  const who = await fixture(), other = await fixture();
  const selected = await category(who, 'Seleccionada');
  const flags = [];
  for (let i = 0; i < 14; i++) flags.push(await product(who, `Destacado ${String(i).padStart(2, '0')}`, { featured: true, type: 'digital', digitalUrl: 'https://private.example.test/download', createdAt: new Date(1700000000000 + i * 1000) }));
  await product(who, 'Resultado buscado', { categoryId: selected._id });
  await product(who, 'Oculto destacado', { featured: true, active: false });
  await product(who, 'Borrado destacado', { featured: true, archived: true });
  await product(other, 'De otra tienda', { featured: true });
  const response = await request(app).get(`/api/public/stores/${who.store.slug}?categoryId=${selected._id}&search=buscado&featured=false&limit=1&page=2`);
  assert.equal(response.status, 200); assert.equal(response.body.data.products.length, 0); assert.equal(response.body.data.meta.total, 1);
  assert.equal(response.body.data.featuredProducts.length, 12);
  assert.deepEqual(objectIds(response.body.data.featuredProducts), objectIds(flags.slice(2)));
  for (const item of response.body.data.featuredProducts) { assert.equal(item.featured, true); assert.equal(item.digitalUrl, undefined); assert.equal(item.reservations, undefined); }
  const pageOne = await request(app).get(`/api/public/stores/${who.store.slug}?page=1&limit=1&featured=true`);
  assert.equal(pageOne.body.data.meta.total, 14); assert.equal(pageOne.body.data.products.length, 1);
  assert.deepEqual(objectIds(pageOne.body.data.featuredProducts), objectIds(response.body.data.featuredProducts));
});

test('marcar un producto destacado en paralelo con una compra conserva stock, reservas y variantes', async () => {
  const who = await fixture();
  const original = await product(who, 'Remera con variantes', { stock: 30, price: 800, variants: [{ id: 'azul-s', name: 'Azul S', sku: 'REM-AS', stock: 7, price: 850, attributes: { color: 'azul', talle: 'S' } }] });
  const orderInput = { customer: { name: 'Comprador', email: 'buyer@example.test', phone: '1122334455' }, items: [{ productId: String(original._id), variantId: 'azul-s', quantity: 2 }], paymentId: 'cash', deliveryId: 'pickup', idempotencyKey: crypto.randomUUID() };
  const [toggle, purchase] = await Promise.all([api(who, 'put', `/products/${original._id}`, { featured: true }), new CommerceService().createOrder(who.store, orderInput)]);
  assert.equal(toggle.status, 200, JSON.stringify(toggle.body)); assert.ok(purchase.order._id);
  const current = await Product.findById(original._id);
  assert.equal(current.featured, true); assert.equal(current.name, original.name); assert.equal(current.price, 800); assert.equal(current.stock, 30);
  assert.equal(current.variants[0].stock, 5); assert.equal(current.variants[0].sku, 'REM-AS'); assert.equal(current.reservations.length, 1); assert.equal(current.reservations[0].quantity, 2);
  const edited = await api(who, 'put', `/products/${original._id}`, { description: 'Nueva descripción' });
  assert.equal(edited.status, 200, JSON.stringify(edited.body)); assert.equal(edited.body.data.featured, true); assert.equal(edited.body.data.variants[0].stock, 5);
  assert.deepEqual(edited.body.data.variants[0].attributes, { color: 'azul', talle: 'S' });
  const detail = await request(app).get(`/api/public/stores/${who.store.slug}/products/${original._id}`);
  assert.equal(detail.body.data.product.featured, true); assert.equal(detail.body.data.product.reservations, undefined);
});

test('los destacados mantienen permisos, CSRF, validación booleana y filtros compatibles con datos anteriores', async () => {
  const who = await fixture(), other = await fixture();
  const item = await product(who, 'Actual'), old = await product(who, 'Anterior'), foreign = await product(other, 'Ajeno');
  await Product.updateOne({ _id: old._id }, { $unset: { featured: 1 } });
  assert.equal((await api(who, 'put', `/products/${item._id}`, { featured: 'false' })).status, 422);
  assert.equal((await request(app).put(`/api/stores/${who.store._id}/products/${item._id}`).set('Cookie', `mt_session=${who.token}`).send({ featured: true })).status, 403);
  assert.equal((await request(app).put(`/api/stores/${other.store._id}/products/${foreign._id}`).set('Cookie', `mt_session=${who.token}`).set('X-CSRF-Token', who.csrfToken).send({ featured: true })).status, 404);
  assert.equal((await api(who, 'put', `/products/${item._id}`, { featured: true })).status, 200);
  assert.equal((await api(who, 'get', '/products?featured=true')).body.meta.total, 1);
  assert.equal((await api(who, 'get', '/products?featured=false')).body.meta.total, 1);
  assert.equal((await api(who, 'get', '/products?featured=anything')).status, 422);
  const catalog = await request(app).get(`/api/public/stores/${who.store.slug}?featured=false`);
  assert.equal(catalog.body.data.products[0].featured, false); assert.equal(catalog.body.data.products[0]._id, String(old._id));
});

test('una creación en curso serializa cambios de esa tienda pero permite trabajar en otras tiendas', async () => {
  const who = await fixture(), root = await category(who, 'Padre'), otherRoot = await category(who, 'Destino');
  const reserved = deferred(), release = deferred(), service = new CategoryService();
  const reserveParent = service.reserveParent.bind(service);
  service.reserveParent = async (...args) => { await reserveParent(...args); reserved.resolve(); await release.promise; };
  const pending = service.create(who.store._id, { name: 'Hijo en creación', parentId: root._id });
  await reserved.promise;
  try {
    const removed = await api(who, 'delete', `/categories/${root._id}`);
    const moved = await api(who, 'put', `/categories/${root._id}`, { parentId: String(otherRoot._id) });
    assert.equal(removed.status, 409); assert.equal(moved.status, 409);
    assert.equal(removed.body.error.code, 'CATEGORY_CONFLICT'); assert.equal(moved.body.error.code, 'CATEGORY_CONFLICT');
    const other = await fixture();
    assert.equal((await api(other, 'post', '/categories', { name: 'Otra tienda sigue disponible' })).status, 201);
  } finally { release.resolve(); }
  const child = await pending;
  assert.equal(String(child.parentId), String(root._id)); assert.equal((await Category.findById(root._id)).parentId, null);
});

test('dos movimientos concurrentes no forman ciclos ni eliminan la referencia del ganador', async () => {
  const who = await fixture(), a = await category(who, 'A'), b = await category(who, 'B');
  const competing = await Promise.allSettled([categoryService.update(who.store._id, a._id, { parentId: b._id }), new CategoryService().update(who.store._id, b._id, { parentId: a._id })]);
  assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(competing.some(result => result.status === 'rejected' && ['CATEGORY_CONFLICT', 'CATEGORY_CYCLE'].includes(result.reason.code)));
  for (const item of await Category.find({ storeId: who.store._id })) if (item.parentId) assert.equal((await Category.findById(item.parentId)).parentId, null);

  const source = await category(who, 'Origen'), destination = await category(who, 'Destino'), child = await category(who, 'Hijo', source._id);
  const ready = deferred(), release = deferred(), service = new CategoryService();
  const reserveParent = service.reserveParent.bind(service);
  service.reserveParent = async (...args) => { await reserveParent(...args); ready.resolve(); await release.promise; };
  const winningMove = service.update(who.store._id, child._id, { parentId: destination._id });
  await ready.promise;
  try {
    await assert.rejects(new CategoryService().update(who.store._id, child._id, { parentId: source._id }), error => error.code === 'CATEGORY_CONFLICT');
    await assert.rejects(new CategoryService().update(who.store._id, destination._id, { parentId: child._id }), error => error.code === 'CATEGORY_CONFLICT');
  } finally { release.resolve(); }
  await winningMove;
  const parent = await Category.findById(destination._id).select('+hierarchyLinks');
  assert.equal(parent.hierarchyLinks.length, 1); assert.equal(String(parent.hierarchyLinks[0].childId), String(child._id));
  assert.equal((await Category.findById(source._id).select('+hierarchyLinks')).hierarchyLinks.length, 0);
  await assert.rejects(categoryService.update(who.store._id, destination._id, { parentId: child._id }), error => error.code === 'CATEGORY_CYCLE');
  await assert.rejects(categoryService.archive(who.store._id, destination._id), error => error.code === 'CATEGORY_HAS_CHILDREN');
  await categoryService.update(who.store._id, child._id, { parentId: null });
  assert.equal((await categoryService.archive(who.store._id, destination._id)).archived, true);
});

test('el arranque recupera referencias de operaciones interrumpidas y preserva categorías y productos', async () => {
  const who = await fixture(), root = await category(who, 'Principal');
  const child = await Category.create({ storeId: who.store._id, name: 'Subcategoría anterior', parentId: root._id });
  const grandchild = await Category.create({ storeId: who.store._id, name: 'Tercer nivel anterior', parentId: child._id });
  const item = await product(who, 'Conservado', { categoryId: grandchild._id });
  const archived = await category(who, 'Borrado interrumpido'), detached = await product(who, 'Pendiente de desasignar', { categoryId: archived._id });
  await Category.updateOne({ _id: archived._id }, { $set: { active: false, archived: true } });
  await CategoryHierarchy.updateOne({ _id: who.store._id }, { $set: { token: 'operacion-interrumpida' } });
  await categoryService.reserveParent(who.store._id, root._id, new mongoose.Types.ObjectId(), crypto.randomUUID());
  await Category.collection.updateOne({ _id: root._id }, { $unset: { parentId: 1 } });
  await categoryService.initialize();
  const freshRoot = await Category.findById(root._id).select('+hierarchyLinks').lean();
  const freshChild = await Category.findById(child._id).select('+parentLinkToken').lean();
  assert.equal(freshRoot.parentId, null); assert.equal(freshRoot.hierarchyLinks.length, 1);
  assert.equal(String(freshRoot.hierarchyLinks[0].childId), String(child._id)); assert.equal(freshRoot.hierarchyLinks[0].token, freshChild.parentLinkToken);
  assert.equal(String((await Product.findById(item._id)).categoryId), String(grandchild._id));
  assert.equal((await Product.findById(detached._id)).categoryId, undefined);
  const freshGrandchild = await Category.findById(grandchild._id).select('+parentLinkToken');
  const childLinks = (await Category.findById(child._id).select('+hierarchyLinks')).hierarchyLinks;
  assert.equal(childLinks.length, 1); assert.equal(childLinks[0].token, freshGrandchild.parentLinkToken);
  assert.equal((await CategoryHierarchy.findById(who.store._id)).token, undefined);
  assert.equal(await Category.countDocuments({ storeId: who.store._id, archived: false }), 3);
  await categoryService.initialize(); assert.equal((await Category.findById(root._id).select('+hierarchyLinks')).hierarchyLinks.length, 1);
});

test('un ancestro oculto también oculta todos sus descendientes del menú público sin borrar productos', async () => {
  const who = await fixture(), root = await category(who, 'Principal'), child = await category(who, 'Secundaria', root._id);
  const third = await category(who, 'Tercera', child._id), fourth = await category(who, 'Cuarta', third._id);
  await product(who, 'Visible en catálogo general', { categoryId: fourth._id });
  await categoryService.update(who.store._id, child._id, { active: false });
  const intermediate = await request(app).get(`/api/public/stores/${who.store.slug}`);
  assert.deepEqual(objectIds(intermediate.body.data.categories), [String(root._id)]);
  await categoryService.update(who.store._id, root._id, { active: false });
  const response = await request(app).get(`/api/public/stores/${who.store.slug}`);
  assert.equal(response.body.data.categories.length, 0); assert.equal(response.body.data.products.length, 1);
  assert.equal((await api(who, 'get', '/categories')).body.meta.total, 4);
});

test('el arranque rechaza datos cíclicos o con padres de otra tienda antes de quitar bloqueos pendientes', async () => {
  const who = await fixture(), other = await fixture(), root = await category(who, 'Raíz'), child = await category(who, 'Hija', root._id), foreign = await category(other, 'Otra tienda');
  await CategoryHierarchy.updateOne({ _id: who.store._id }, { $set: { token: 'no-quitar-antes-de-validar' } });
  await Category.updateOne({ _id: root._id }, { $set: { parentId: child._id } });
  await assert.rejects(categoryService.initialize(), error => error.code === 'CATEGORY_HIERARCHY_INVALID');
  assert.equal((await CategoryHierarchy.findById(who.store._id)).token, 'no-quitar-antes-de-validar');
  await Category.updateOne({ _id: root._id }, { $set: { parentId: foreign._id } });
  await assert.rejects(categoryService.initialize(), error => error.code === 'CATEGORY_HIERARCHY_INVALID');
  assert.equal((await CategoryHierarchy.findById(who.store._id)).token, 'no-quitar-antes-de-validar');
  await Category.updateOne({ _id: root._id }, { $set: { parentId: null } });
  await categoryService.initialize();
  assert.equal((await CategoryHierarchy.findById(who.store._id)).token, undefined);
});

test('un resultado de escritura incierto conserva el bloqueo hasta recuperar la jerarquía en el arranque', async () => {
  const who = await fixture(), root = await category(who, 'Principal'), service = new CategoryService();
  const reserveParent = service.reserveParent.bind(service);
  service.reserveParent = async (...args) => { await reserveParent(...args); throw new Error('La conexión se perdió después de escribir la reserva'); };
  await assert.rejects(service.create(who.store._id, { name: 'Creación interrumpida', parentId: root._id }), /conexión se perdió/);
  const interrupted = await CategoryHierarchy.findById(who.store._id);
  assert.ok(interrupted.token);
  await CategoryHierarchy.collection.updateOne({ _id: who.store._id }, { $set: { updatedAt: new Date(0) } });
  await assert.rejects(new CategoryService().update(who.store._id, root._id, { name: 'No debe adelantarse' }), error => error.code === 'CATEGORY_CONFLICT');
  assert.equal((await CategoryHierarchy.findById(who.store._id)).token, interrupted.token, 'el bloqueo no vence por tiempo');
  await categoryService.initialize();
  assert.equal((await Category.findById(root._id).select('+hierarchyLinks')).hierarchyLinks.length, 0);
  assert.equal((await category(who, 'Reintento después de recuperar', root._id)).parentId.toString(), root._id.toString());
});

test('una rama profunda puede cambiar de ubicación conservando asignaciones, auditoría y filtros completos', async () => {
  const who = await fixture(), top = await category(who, 'Indumentaria'), destination = await category(who, 'Feria'), section = await category(who, 'Diseño independiente', destination._id);
  let parent = top;
  const branch = [top];
  for (let i = 1; i < 18; i++) { parent = await category(who, `Nivel ${String(i).padStart(2, '0')}`, parent._id); branch.push(parent); }
  const assigned = await product(who, 'Producto del último nivel', { categoryId: parent._id });
  const result = await api(who, 'put', `/categories/${top._id}`, { parentId: String(section._id) });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(String((await Product.findById(assigned._id)).categoryId), String(parent._id));
  assert.equal((await api(who, 'get', `/products?categoryId=${destination._id}`)).body.meta.total, 1);
  assert.equal((await api(who, 'get', `/products?categoryId=${branch[12]._id}`)).body.meta.total, 1);
  await assert.rejects(categoryService.update(who.store._id, section._id, { parentId: parent._id }), error => error.code === 'CATEGORY_CYCLE');
  const audit = await AuditLog.findOne({ storeId: who.store._id, action: 'category.updated', entityId: String(top._id) }).lean();
  assert.ok(audit, 'el movimiento de rama conserva su registro de auditoría');
  assert.equal(await Category.countDocuments({ storeId: who.store._id, archived: false }), 20);
});
