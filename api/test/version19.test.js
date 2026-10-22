import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Category, CategoryHierarchy, Store, User } from '../src/models/index.js';
import { categoryService } from '../src/services/CategoryService.js';
import { DatabaseIndexService } from '../src/services/DatabaseIndexService.js';

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Store.init(), CategoryHierarchy.init()]);
  await new DatabaseIndexService().reconcileCategoryUniquenessIndex();
  await Category.init();
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => { await Promise.all([Category.deleteMany({}), CategoryHierarchy.deleteMany({}), Store.deleteMany({}), User.deleteMany({})]); });

async function fixture() {
  const user = await User.create({ role: 'vendedor', email: `${new mongoose.Types.ObjectId()}@test.local`, active: true });
  const store = await Store.create({ ownerId: user._id, name: 'Tienda', slug: `tienda-${new mongoose.Types.ObjectId()}` });
  return store;
}
const create = (storeId, name, parentId = null) => categoryService.create(storeId, { name, parentId, active: true });

test('el mismo nombre puede repetirse en ramas diferentes pero no entre hermanos', async () => {
  const store = await fixture();
  const buzos = await create(store._id, 'Buzos');
  const remeras = await create(store._id, 'Remeras');
  const narutoBuzos = await create(store._id, 'Naruto', buzos._id);
  const narutoRemeras = await create(store._id, 'Naruto', remeras._id);
  assert.equal(narutoBuzos.name, 'Naruto');
  assert.equal(narutoRemeras.name, 'Naruto');
  await assert.rejects(create(store._id, 'Naruto', buzos._id), error => error?.code === 11000);
});

test('las categorías raíz siguen siendo únicas dentro de la tienda', async () => {
  const store = await fixture();
  await create(store._id, 'Buzos');
  await assert.rejects(create(store._id, 'Buzos'), error => error?.code === 11000);
});

test('mover una categoría a una rama con un hermano del mismo nombre se rechaza y conserva el padre', async () => {
  const store = await fixture();
  const buzos = await create(store._id, 'Buzos');
  const remeras = await create(store._id, 'Remeras');
  await create(store._id, 'Naruto', buzos._id);
  const moving = await create(store._id, 'Naruto', remeras._id);
  await assert.rejects(categoryService.update(store._id, moving._id, { parentId: buzos._id }), error => error?.code === 11000);
  const persisted = await Category.findById(moving._id);
  assert.equal(String(persisted.parentId), String(remeras._id));
});
