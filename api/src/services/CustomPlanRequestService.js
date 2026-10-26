import mongoose from 'mongoose';
import { CustomPlanRequest } from '../models/index.js';
import { AppError } from '../middleware/core.js';

const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Caso de uso de solicitudes de planes a medida. Mantiene la persistencia y
 * consulta fuera de las rutas HTTP para que el flujo quede encapsulado.
 */
export class CustomPlanRequestService {
  async create({ email, whatsapp, description }) {
    return CustomPlanRequest.create({ email, whatsapp, description, status: 'new' });
  }

  async getById(id) {
    if (!mongoose.isValidObjectId(id)) throw new AppError('Solicitud no encontrada.', 404, 'CUSTOM_PLAN_REQUEST_NOT_FOUND');
    const item = await CustomPlanRequest.findById(id).lean();
    if (!item) throw new AppError('Solicitud no encontrada.', 404, 'CUSTOM_PLAN_REQUEST_NOT_FOUND');
    return item;
  }

  async list({ page = 1, limit = 20, search = '' } = {}) {
    const term = String(search || '').trim().slice(0, 100);
    const filter = term ? { $or: ['email', 'whatsapp', 'description'].map(field => ({ [field]: { $regex: escapeRegex(term), $options: 'i' } })) } : {};
    const [items, total] = await Promise.all([
      CustomPlanRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      CustomPlanRequest.countDocuments(filter),
    ]);
    return { items, total };
  }
}

export const customPlanRequestService = new CustomPlanRequestService();
