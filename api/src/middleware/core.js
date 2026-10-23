import mongoose from 'mongoose';
import { Session, User, Store } from '../models/index.js';
import { hashToken } from '../utils/crypto.js';
import { planFeatureService } from '../services/PlanFeatureService.js';
export class AppError extends Error {
  constructor(message, status = 400, code = 'VALIDATION_ERROR', details) { super(message); this.status = status; this.statusCode = status; this.code = code; this.details = details; }
}
export const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
export const loadAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.mt_session;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
    if (session) {
      const user = await User.findById(session.userId);
      if (user?.active) { req.user = user; req.session = session; }
    }
  }
  next();
});
export function requireAuth(req, _res, next) {
  if (!req.user) return next(new AppError('Necesitás iniciar sesión.', 401, 'UNAUTHENTICATED'));
  if (req.user.mustChangePassword && !['/auth/root/password', '/auth/me', '/auth/logout'].includes(req.path)) return next(new AppError('Cambiá tu contraseña inicial para continuar.', 403, 'PASSWORD_CHANGE_REQUIRED'));
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-CSRF-Token') !== req.session?.csrfToken) return next(new AppError('La sesión de seguridad venció. Recargá la página.', 403, 'CSRF_INVALID'));
  next();
}
export function requireAdmin(req, res, next) {
  requireAuth(req, res, error => {
    if (error) return next(error);
    if (req.user.role !== 'admin') return next(new AppError('Acceso exclusivo de administración.', 403, 'FORBIDDEN'));
    next();
  });
}

export const requireFeature = featureKey => asyncHandler(async (req, res, next) => {
  await new Promise((resolve, reject) => requireAuth(req, res, error => error ? reject(error) : resolve()));
  if (req.user.role === 'admin' || await planFeatureService.has(req.user, featureKey)) return next();
  const label = planFeatureService.label(featureKey);
  throw new AppError(`Tu plan no incluye ${label}.`, 403, 'PLAN_FEATURE_REQUIRED', { featureKey, label });
});

export const requireAnyFeature = featureKeys => asyncHandler(async (req, res, next) => {
  await new Promise((resolve, reject) => requireAuth(req, res, error => error ? reject(error) : resolve()));
  if (req.user.role === 'admin') return next();
  const keys = await planFeatureService.keysForUser(req.user);
  if (featureKeys.some(key => keys.includes(key))) return next();
  throw new AppError('Tu plan no incluye esta funcionalidad.', 403, 'PLAN_FEATURE_REQUIRED', { featureKeys });
});

export const requireStoreAccess = asyncHandler(async (req, res, next) => {
  await new Promise((resolve, reject) => requireAuth(req, res, error => error ? reject(error) : resolve()));
  const id = req.params.storeId;
  if (!mongoose.isValidObjectId(id)) throw new AppError('Tienda no encontrada.', 404, 'NOT_FOUND');
  const store = await Store.findOne({ _id: id, archived: { $ne: true } }).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret');
  if (!store || (req.user.role !== 'admin' && String(store.ownerId) !== String(req.user._id))) throw new AppError('Tienda no encontrada.', 404, 'NOT_FOUND');
  req.store = store;
  next();
});
export function errorHandler(error, _req, res, _next) {
  if (res.headersSent) return _next(error);
  let status = error.status || error.statusCode || 500;
  let message = error.message, code = error.code || 'INTERNAL_ERROR', details = error.details;
  if (error.name === 'ZodError') { status = 422; code = 'VALIDATION_ERROR'; message = 'Revisá los campos del formulario.'; details = error.issues?.map(item => ({ field: item.path.join('.'), message: item.message })); }
  if (error.name === 'ValidationError') { status = 422; code = 'VALIDATION_ERROR'; message = 'Hay datos que no son válidos.'; details = Object.entries(error.errors).map(([field, item]) => ({ field, message: item.message })); }
  if (error.name === 'VersionError') { status = 409; code = 'DOCUMENT_CONFLICT'; message = 'Los datos cambiaron en otra sesión. Recargá la página e intentá nuevamente.'; }
  if (error.name === 'CastError') { status = 404; code = 'NOT_FOUND'; message = 'El recurso solicitado no existe.'; }
  if (error.code === 11000) { status = 409; code = 'DUPLICATE'; message = 'Ya existe un registro con esos datos.'; }
  if (error.code === 'LIMIT_FILE_SIZE') { status = 413; code = 'FILE_TOO_LARGE'; message = 'El archivo supera el tamaño permitido.'; }
  if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') { status = 422; code = 'INVALID_FILES'; message = 'Revisá la cantidad y el nombre de los archivos.'; }
  if (status >= 500) { console.error(`[api] ${error.name || 'Error'}: ${error.message}`); if (!(error instanceof AppError)) message = 'No se pudo completar la operación. Intentá nuevamente.'; }
  return res.status(status).json({ error: { message, code: String(code), ...(details ? { details } : {}) } });
}
