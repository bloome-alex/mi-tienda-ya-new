import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Category, CategoryHierarchy, Product } from '../models/index.js';
import { AppError } from '../middleware/core.js';

const present = { archived: { $ne: true } };
const same = (left, right) => String(left || '') === String(right || '');
const conflict = () => new AppError('La organización de categorías está cambiando. Volvé a intentar cuando termine la operación en curso.', 409, 'CATEGORY_CONFLICT');
const childrenError = () => new AppError('Esta categoría tiene subcategorías. Movelas a otra ubicación o eliminá primero cada subcategoría, incluso las inactivas.', 409, 'CATEGORY_HAS_CHILDREN');
const invalidHierarchy = () => new AppError('La jerarquía de categorías contiene un ciclo o una referencia inválida. Revisá los datos antes de iniciar.', 500, 'CATEGORY_HIERARCHY_INVALID');
const parentError = () => new AppError('Elegí una categoría de esta tienda que no esté eliminada.', 422, 'CATEGORY_PARENT_INVALID');

export function safeCategory(value) {
  const item = value?.toObject ? value.toObject() : value;
  return { _id: item._id, storeId: item.storeId, parentId: item.parentId || null, name: item.name, description: item.description || '', active: item.active, archived: item.archived, createdAt: item.createdAt, updatedAt: item.updatedAt };
}

/** Multilevel topology for MongoDB standalone. Every mutation first acquires a
 * store-scoped MongoDB token with an atomic unique _id write. There is no lease:
 * a slow writer never loses exclusion to a newer writer. A concurrent request
 * gets 409 and can retry. Interrupted tokens and parent references are rebuilt
 * only by initialize(), before traffic, in the supported single-process mode.
 * Category.parentId is authoritative; reference tokens make interrupted cleanup
 * conservative. Moves change one parent pointer and keep the entire subtree.
 */
export class CategoryService {
  async withHierarchyLock(storeId, action) {
    const token = randomUUID();
    try {
      const acquired = await CategoryHierarchy.findOneAndUpdate(
        { _id: storeId, token: { $exists: false } },
        { $set: { token }, $inc: { revision: 1 } },
        { upsert: true, returnDocument: 'after' },
      ).select('_id');
      if (!acquired) throw conflict();
    } catch (error) { if (error?.code === 11000) throw conflict(); throw error; }
    let release = true;
    try { return await action(); }
    catch (error) {
      // A network/timeout error may mean a write is still being acknowledged.
      // Never let a new writer overlap that uncertain result. Bootstrap will
      // reconcile the persisted parent pointers before releasing this token.
      release = error instanceof AppError || error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError || error?.code === 11000;
      throw error;
    }
    finally { if (release) await CategoryHierarchy.updateOne({ _id: storeId, token }, { $unset: { token: 1 } }); }
  }

  async find(storeId, categoryId) {
    if (!mongoose.isValidObjectId(categoryId)) throw new AppError('Categoría no encontrada.', 404, 'CATEGORY_NOT_FOUND');
    const item = await Category.findOne({ _id: categoryId, storeId, ...present }).select('+hierarchyLinks +parentLinkToken');
    if (!item) throw new AppError('Categoría no encontrada.', 404, 'CATEGORY_NOT_FOUND');
    return item;
  }

  async assertParent(storeId, parentId, childId) {
    if (same(parentId, childId)) throw new AppError('Una categoría no puede ser su propia categoría contenedora.', 422, 'CATEGORY_SELF_PARENT');
    if (!mongoose.isValidObjectId(parentId)) throw parentError();
    const records = await Category.find({ storeId, ...present }).select('_id parentId').lean();
    const byId = new Map(records.map(item => [String(item._id), item]));
    let cursor = byId.get(String(parentId));
    if (!cursor) throw parentError();
    const seen = new Set();
    while (cursor) {
      const id = String(cursor._id);
      if (same(id, childId)) throw new AppError('No podés mover una categoría dentro de una de sus propias subcategorías.', 422, 'CATEGORY_CYCLE');
      if (seen.has(id)) throw invalidHierarchy();
      seen.add(id);
      if (!cursor.parentId) break;
      cursor = byId.get(String(cursor.parentId));
      if (!cursor) throw parentError();
    }
  }

  async reserveParent(storeId, parentId, childId, token) {
    await this.assertParent(storeId, parentId, childId);
    const parent = await Category.findOneAndUpdate(
      { _id: parentId, storeId, ...present },
      { $push: { hierarchyLinks: { childId, token } }, $inc: { __v: 1 } },
      { returnDocument: 'after' },
    ).select('_id');
    if (!parent) throw parentError();
  }

  async releaseParent(storeId, parentId, childId, token) {
    if (!parentId || !token) return;
    await Category.updateOne({ _id: parentId, storeId }, { $pull: { hierarchyLinks: { childId, token } }, $inc: { __v: 1 } });
  }

  async assertLeaf(item) {
    if (item.hierarchyLinks?.length || await Category.exists({ storeId: item.storeId, parentId: item._id, ...present })) throw childrenError();
  }

  async create(storeId, input) {
    return this.withHierarchyLock(storeId, async () => {
      const childId = new mongoose.Types.ObjectId(), parentId = input.parentId || null;
      const token = parentId ? randomUUID() : undefined;
      let reserved = false;
      try {
        if (parentId) { await this.reserveParent(storeId, parentId, childId, token); reserved = true; }
        return safeCategory(await Category.create({ ...input, _id: childId, storeId, parentId, ...(token ? { parentLinkToken: token } : {}) }));
      } catch (error) {
        // Preserve a confirmed reference if an acknowledged write was lost.
        if (reserved && !await Category.exists({ _id: childId, storeId, parentId, parentLinkToken: token, ...present })) await this.releaseParent(storeId, parentId, childId, token);
        throw error;
      }
    });
  }

  async update(storeId, categoryId, patch, { includeBefore = false } = {}) {
    return this.withHierarchyLock(storeId, async () => {
      const current = await this.find(storeId, categoryId);
      const parentId = Object.hasOwn(patch, 'parentId') ? patch.parentId : current.parentId || null;
      const changingParent = !same(parentId, current.parentId);
      if (same(parentId, current._id)) throw new AppError('Una categoría no puede ser su propia categoría contenedora.', 422, 'CATEGORY_SELF_PARENT');
      const token = changingParent && parentId ? randomUUID() : undefined;
      let reserved = false, item;
      try {
        if (token) { await this.reserveParent(storeId, parentId, current._id, token); reserved = true; }
        const update = { $set: { ...patch, parentId }, $inc: { __v: 1 } };
        if (changingParent && token) update.$set.parentLinkToken = token;
        else if (changingParent) update.$unset = { parentLinkToken: 1 };
        item = await Category.findOneAndUpdate({ _id: current._id, storeId, ...present, __v: current.__v }, update, { returnDocument: 'after', runValidators: true });
        if (!item) throw conflict();
      } catch (error) {
        if (reserved && !await Category.exists({ _id: current._id, storeId, parentId, parentLinkToken: token, ...present })) await this.releaseParent(storeId, parentId, current._id, token);
        throw error;
      }
      if (changingParent) await this.releaseParent(storeId, current.parentId, current._id, current.parentLinkToken);
      return includeBefore ? { item: safeCategory(item), before: safeCategory(current) } : safeCategory(item);
    });
  }

  async archive(storeId, categoryId, { includeBefore = false } = {}) {
    return this.withHierarchyLock(storeId, async () => {
      const current = await this.find(storeId, categoryId);
      await this.assertLeaf(current);
      const item = await Category.findOneAndUpdate(
        { _id: current._id, storeId, ...present, __v: current.__v, 'hierarchyLinks.0': { $exists: false } },
        { $set: { active: false, archived: true }, $inc: { __v: 1 } },
        { returnDocument: 'after' },
      );
      if (!item) throw conflict();
      await this.releaseParent(storeId, current.parentId, current._id, current.parentLinkToken);
      const unassigned = await Product.updateMany({ storeId, categoryId: current._id }, { $unset: { categoryId: 1 }, $inc: { stockVersion: 1 } });
      return includeBefore ? { item: safeCategory(item), before: safeCategory(current), unassignedProducts: unassigned.modifiedCount } : safeCategory(item);
    });
  }

  async productFilter(storeId, query = {}) {
    if (query.categoryId && query.category && query.categoryId !== query.category) throw new AppError('Indicá un único filtro de categoría.', 422, 'CATEGORY_FILTER_INVALID');
    const selected = query.categoryId || query.category, filter = {};
    if (selected) {
      if (typeof selected !== 'string' || !/^[a-f\d]{24}$/i.test(selected)) throw new AppError('El filtro de categoría no es válido.', 422, 'CATEGORY_FILTER_INVALID');
      const categories = await Category.find({ storeId, ...present }).select('_id parentId').lean();
      const byId = new Map(categories.map(item => [String(item._id), item]));
      const children = new Map();
      for (const item of categories) { const key = String(item.parentId || ''); if (!children.has(key)) children.set(key, []); children.get(key).push(item); }
      const selectedId = selected.toLowerCase();
      const ids = [], seen = new Set(), queue = byId.has(selectedId) ? [byId.get(selectedId)] : [];
      for (let i = 0; i < queue.length; i++) {
        const current = queue[i], key = String(current._id);
        if (seen.has(key)) continue;
        seen.add(key); ids.push(current._id); queue.push(...(children.get(key) || []));
      }
      filter.categoryId = { $in: ids };
    }
    if (query.featured !== undefined && query.featured !== '') {
      if (query.featured !== 'true' && query.featured !== 'false') throw new AppError('El filtro de destacados debe ser true o false.', 422, 'FEATURED_FILTER_INVALID');
      filter.featured = query.featured === 'true' ? true : { $ne: true };
    }
    return filter;
  }

  visibleCategories(categories) {
    const byId = new Map(categories.filter(item => !item.archived).map(item => [String(item._id), item]));
    const visible = new Map();
    const allowed = item => {
      const chain = [], seen = new Set(); let cursor = item, result = true;
      while (cursor) {
        const id = String(cursor._id);
        if (visible.has(id)) { result = visible.get(id); break; }
        if (seen.has(id) || !cursor.active) { result = false; break; }
        seen.add(id); chain.push(id);
        if (!cursor.parentId) break;
        cursor = byId.get(String(cursor.parentId));
        if (!cursor) { result = false; break; }
      }
      chain.forEach(id => visible.set(id, result));
      return result;
    };
    return [...byId.values()].filter(allowed);
  }

  async initialize() {
    // No requests may be running. parentId is the source of truth; validate the
    // complete forest first, then rebuild interrupted references and unlock.
    const categories = await Category.find(present).select('+hierarchyLinks +parentLinkToken').lean();
    const byId = new Map(categories.map(item => [String(item._id), item])), checked = new Set(), links = new Map();
    for (const item of categories) {
      const seen = new Set(); let cursor = item;
      while (cursor && !checked.has(String(cursor._id))) {
        const id = String(cursor._id);
        if (seen.has(id)) throw invalidHierarchy();
        seen.add(id);
        if (!cursor.parentId) break;
        const parent = byId.get(String(cursor.parentId));
        if (!parent || !same(parent.storeId, cursor.storeId)) throw invalidHierarchy();
        cursor = parent;
      }
      seen.forEach(id => checked.add(id));
    }
    for (const item of categories) {
      if (!item.parentId) continue;
      if (!item.parentLinkToken) {
        item.parentLinkToken = randomUUID();
        await Category.updateOne({ _id: item._id }, { $set: { parentLinkToken: item.parentLinkToken }, $inc: { __v: 1 } });
      }
      const parentLinks = links.get(String(item.parentId)) || [];
      parentLinks.push({ childId: item._id, token: item.parentLinkToken }); links.set(String(item.parentId), parentLinks);
    }
    const canonical = values => (values || []).map(link => `${link.childId}:${link.token}`).sort().join('|');
    for (const item of categories) {
      const expected = links.get(String(item._id)) || [], patch = {};
      if (!Object.hasOwn(item, 'parentId')) patch.parentId = null;
      if (canonical(item.hierarchyLinks) !== canonical(expected)) patch.hierarchyLinks = expected;
      if (Object.keys(patch).length) await Category.updateOne({ _id: item._id }, { $set: patch, $inc: { __v: 1 } });
    }
    // Complete the unassignment if a process stopped after archiving a leaf.
    const archived = await Category.find({ archived: true }).select('_id storeId').lean();
    for (const item of archived) await Product.updateMany({ storeId: item.storeId, categoryId: item._id }, { $unset: { categoryId: 1 }, $inc: { stockVersion: 1 } });
    await CategoryHierarchy.updateMany({ token: { $exists: true } }, { $unset: { token: 1 } });
  }
}
export const categoryService = new CategoryService();
