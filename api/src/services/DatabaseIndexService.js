import { UploadedImage, Category } from '../models/index.js';

const isObjectKeyIndex = index => {
  const key = index?.key || {};
  return key.objectKey === 1 && Object.keys(key).length === 1;
};

const isDesiredObjectKeyIndex = index =>
  isObjectKeyIndex(index) &&
  index.unique === true &&
  index.partialFilterExpression?.objectKey?.$type === 'string';

export class DatabaseIndexService {
  constructor({ uploadedImageModel = UploadedImage, categoryModel = Category } = {}) {
    this.uploadedImageModel = uploadedImageModel;
    this.categoryModel = categoryModel;
  }

  async listIndexes(collection) {
    try {
      return await collection.listIndexes().toArray();
    } catch (error) {
      if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
      throw error;
    }
  }

  async duplicateObjectKeys(collection) {
    return collection.aggregate([
      { $match: { objectKey: { $type: 'string' } } },
      { $group: { _id: '$objectKey', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 10 },
    ]).toArray();
  }

  async dropIndexIfPresent(collection, name) {
    try {
      await collection.dropIndex(name);
    } catch (error) {
      if (error?.code === 26 || error?.code === 27 || error?.codeName === 'NamespaceNotFound' || error?.codeName === 'IndexNotFound') return;
      throw error;
    }
  }


  async duplicateSiblingCategoryNames(collection) {
    return collection.aggregate([
      { $match: { archived: false } },
      { $group: { _id: { storeId: '$storeId', parentId: { $ifNull: ['$parentId', null] }, name: '$name' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray();
  }

  async reconcileCategoryUniquenessIndex() {
    const collection = this.categoryModel.collection;
    const indexes = await this.listIndexes(collection);
    const legacy = indexes.filter(index => {
      const key = index?.key || {};
      return key.storeId === 1 && key.name === 1 && Object.keys(key).length === 2;
    });
    if (!legacy.length) return { changed: false, reason: 'legacy-index-missing' };

    const duplicates = await this.duplicateSiblingCategoryNames(collection);
    if (duplicates.length) {
      const details = duplicates.map(item => {
        const parent = item._id.parentId ? String(item._id.parentId) : 'raíz';
        return `${item._id.name} (tienda ${item._id.storeId}, padre ${parent}, ${item.count})`;
      }).join(', ');
      throw new Error(`No se puede actualizar la unicidad de categorías porque existen nombres repetidos dentro de la misma rama: ${details}. Corregí esos registros antes de reiniciar.`);
    }

    for (const index of legacy) await this.dropIndexIfPresent(collection, index.name);
    return { changed: true, reason: 'legacy-category-index-removed' };
  }

  async reconcileUploadedImageObjectKeyIndex() {
    const collection = this.uploadedImageModel.collection;
    const indexes = await this.listIndexes(collection);
    const objectKeyIndexes = indexes.filter(isObjectKeyIndex);

    if (!objectKeyIndexes.length) return { changed: false, reason: 'missing' };
    if (objectKeyIndexes.length === 1 && objectKeyIndexes[0].name === 'objectKey_1' && isDesiredObjectKeyIndex(objectKeyIndexes[0])) {
      return { changed: false, reason: 'already-correct' };
    }

    const duplicates = await this.duplicateObjectKeys(collection);
    if (duplicates.length) {
      const details = duplicates.map(item => `${item._id} (${item.count})`).join(', ');
      throw new Error(`No se puede corregir el índice de UploadedImage.objectKey porque existen claves duplicadas: ${details}. Eliminá o consolidá esos registros antes de reiniciar.`);
    }

    for (const index of objectKeyIndexes) await this.dropIndexIfPresent(collection, index.name);
    return { changed: true, reason: 'legacy-index-removed' };
  }
}

export const databaseIndexService = new DatabaseIndexService();
