import { UploadedImage } from '../models/index.js';

const isObjectKeyIndex = index => {
  const key = index?.key || {};
  return key.objectKey === 1 && Object.keys(key).length === 1;
};

const isDesiredObjectKeyIndex = index =>
  isObjectKeyIndex(index) &&
  index.unique === true &&
  index.partialFilterExpression?.objectKey?.$type === 'string';

export class DatabaseIndexService {
  constructor({ uploadedImageModel = UploadedImage } = {}) {
    this.uploadedImageModel = uploadedImageModel;
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
