import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { User, Plan, Store, Category, Product, Settings, AuditLog, Session } from '../models/index.js';
import { config } from '../config.js';
import { AppError, asyncHandler, requireAuth, requireAdmin, requireStoreAccess } from '../middleware/core.js';
import { ok, listResponse, pagination } from '../utils/http.js';
import { encryptSecret } from '../utils/crypto.js';
import { validateDesign } from '../utils/design.js';
import { AuthService, authService, SettingsService, EntitlementService, AuditService, safeUser, safeStore } from '../services/core.js';
import { whatsappService } from '../services/WhatsAppService.js';
import { quotaService } from '../services/QuotaService.js';
import { categoryService, safeCategory } from '../services/CategoryService.js';
import { imageService } from '../services/ImageService.js';
import { assetService } from '../services/AssetService.js';
import { normalizeDesign } from '../../../client/src/services/design.js';
const router = Router();
const text = (max = 500) => z.string().trim().max(max);
const money = z.coerce.number().finite().min(0).max(999999999).transform(n => Math.round(n * 100) / 100);
const integer = (max = 1000000) => z.coerce.number().int().min(0).max(max);
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identificador inválido.');
const email = z.string().trim().toLowerCase().email().max(254);
const maybeEmail = z.union([email, z.literal('')]);
const url = z.string().max(2048).refine(value => !value || /^https?:\/\//i.test(value) || /^\/uploads\/images\/[\w.-]+$/.test(value) || /^\/demo\/[a-z0-9-]+\.svg$/.test(value), 'Usá una URL HTTP/HTTPS o una imagen subida.');
const trueBoolean = z.boolean();
const parsePatch = (schema, body) => { const parsed = schema.partial().parse(body); return Object.fromEntries(Object.keys(body || {}).filter(key => Object.hasOwn(parsed, key)).map(key => [key, parsed[key]])); };
const searchFilter = (query, fields) => {
  const search = String(query.search || '').trim().slice(0, 100);
  if (!search) return {};
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $or: fields.map(field => ({ [field]: { $regex: escaped, $options: 'i' } })) };
};
const audit = (req, action, entity, entityId, details, storeId = req.store?._id) => AuditService.log({ actorId: req.user?._id, actor: req.user, storeId, store: req.store, action, entity, entityId, details });
const authLimiter = rateLimit({ windowMs: 15 * 60000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Demasiados intentos. Esperá unos minutos.' } } });

router.get('/public/config', asyncHandler(async (_req, res) => {
  const settings = await SettingsService.get();
  const plans = await Plan.find({ active: true }).sort({ sortOrder: 1, price: 1 }).lean();
  ok(res, { trialDays: settings.trialDays, contact: settings.contact, home: settings.home, plans });
}));
router.get('/auth/me', asyncHandler(async (req, res) => ok(res, { user: req.user ? safeUser(req.user) : null, csrfToken: req.session?.csrfToken || null })));
router.post('/auth/root/login', authLimiter, asyncHandler(async (req, res) => {
  const body = z.object({ username: text(100).min(1), password: z.string().min(1).max(200) }).parse(req.body);
  if (req.session) await Session.deleteOne({ _id: req.session._id });
  ok(res, await authService.rootLogin(body, res));
}));
router.post('/auth/root/password', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') throw new AppError('Acceso denegado.', 403, 'FORBIDDEN');
  const body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(12, 'Usá al menos 12 caracteres.').max(72, 'Hasta 72 caracteres para bcrypt.').refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'La contraseña no puede superar 72 bytes.') }).parse(req.body);
  ok(res, await authService.changePassword(req.user, body, res));
}));
router.post('/auth/magic/request', authLimiter, asyncHandler(async (req, res) => ok(res, await authService.requestMagic(z.object({ email, name: text(100).optional() }).parse(req.body)))));
router.post('/auth/magic/consume', authLimiter, asyncHandler(async (req, res) => {
  const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body);
  if (req.session) await Session.deleteOne({ _id: req.session._id });
  ok(res, await authService.consumeMagic(token, res));
}));
router.post('/auth/logout', requireAuth, asyncHandler(async (req, res) => {
  await Session.deleteOne({ _id: req.session._id }); res.clearCookie('mt_session', { path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProduction || config.appUrl.startsWith('https:') }); ok(res, { message: 'Sesión cerrada.' });
}));

const planSchema = z.object({ name: text(100).min(1), icon: text(60).default('store'), previousPrice: money.default(0), price: money, durationDays: integer(3660).refine(n => n > 0).default(30), features: z.array(text(300).min(1)).max(40).default([]), maxStores: integer(1000).refine(n => n > 0).default(1), maxProducts: integer().default(100), active: trueBoolean.default(true), featured: trueBoolean.default(false), sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0) });
router.get('/admin/plans', requireAdmin, asyncHandler((req, res) => listResponse(res, Plan, searchFilter(req.query, ['name']), req.query, { sort: { sortOrder: 1, createdAt: -1 } })));
router.get('/admin/plans/:id', requireAdmin, asyncHandler(async (req, res) => { const item = await Plan.findById(req.params.id); if (!item) throw new AppError('Plan no encontrado.', 404); ok(res, item); }));
router.post('/admin/plans', requireAdmin, asyncHandler(async (req, res) => { const item = await Plan.create(planSchema.parse(req.body)); await audit(req, 'plan.created', 'plan', item._id, { changes: AuditService.changes({}, item, Object.keys(planSchema.shape)) }); ok(res, item, 201); }));
router.put('/admin/plans/:id', requireAdmin, asyncHandler(async (req, res) => {
  const body = parsePatch(planSchema, req.body);
  const before = await Plan.findByIdAndUpdate(req.params.id, { $set: body }, { returnDocument: 'before', runValidators: true });
  if (!before) throw new AppError('Plan no encontrado.', 404);
  const item = await Plan.findById(before._id); await quotaService.reconcilePlan(item._id);
  await audit(req, 'plan.updated', 'plan', item._id, { changes: AuditService.changes(before, { ...before.toObject(), ...body }, Object.keys(body)) }); ok(res, item);
}));
router.delete('/admin/plans/:id', requireAdmin, asyncHandler(async (req, res) => {
  const before = await Plan.findByIdAndUpdate(req.params.id, { $set: { active: false } }, { returnDocument: 'before' });
  if (!before) throw new AppError('Plan no encontrado.', 404);
  await audit(req, 'plan.archived', 'plan', before._id, { changes: AuditService.changes(before, { active: false }, ['active']) }); ok(res, await Plan.findById(before._id));
}));

const userSchema = z.object({ name: text(100).min(1), email, active: trueBoolean.default(true) });
router.get('/admin/users', requireAdmin, asyncHandler((req, res) => listResponse(res, User, { role: 'vendedor', ...searchFilter(req.query, ['name', 'email']) }, req.query, { populate: { path: 'planId', select: 'name price durationDays maxStores maxProducts' } })));
router.get('/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => { const item = await User.findOne({ _id: req.params.id, role: 'vendedor' }); if (!item) throw new AppError('Vendedor no encontrado.', 404); ok(res, { ...safeUser(item), entitlement: await EntitlementService.forUser(item) }); }));
router.post('/admin/users', requireAdmin, asyncHandler(async (req, res) => {
  const body = userSchema.parse(req.body);
  // La prueba comienza con el primer acceso verificado, incluso si el admin creó la cuenta.
  const item = await User.create({ ...body, role: 'vendedor' }); await audit(req, 'user.created', 'user', item._id, { changes: AuditService.changes({}, item, ['name', 'email', 'active', 'role']) }); ok(res, safeUser(item), 201);
}));
router.put('/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const body = parsePatch(userSchema, req.body);
  const before = await User.findOneAndUpdate({ _id: req.params.id, role: 'vendedor' }, { $set: body, $inc: { __v: 1 } }, { returnDocument: 'before', runValidators: true });
  if (!before) throw new AppError('Vendedor no encontrado.', 404);
  if (body.active === false) await Session.deleteMany({ userId: before._id });
  await audit(req, 'user.updated', 'user', before._id, { changes: AuditService.changes(before, { ...before.toObject(), ...body }, Object.keys(body)) }); ok(res, safeUser(await User.findById(before._id)));
}));
router.delete('/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const before = await User.findOneAndUpdate({ _id: req.params.id, role: 'vendedor' }, { $set: { active: false }, $inc: { __v: 1 } }, { returnDocument: 'before' });
  if (!before) throw new AppError('Vendedor no encontrado.', 404);
  await Session.deleteMany({ userId: before._id }); await Store.updateMany({ ownerId: before._id }, { $set: { active: false }, $inc: { __v: 1 } });
  await audit(req, 'user.disabled', 'user', before._id, { changes: AuditService.changes(before, { active: false }, ['active']) }); ok(res, safeUser(await User.findById(before._id)));
}));
router.put('/admin/users/:id/plan', requireAdmin, asyncHandler(async (req, res) => {
  const body = z.object({ planId: objectId.nullable(), days: integer(3660).optional(), expiresAt: z.string().datetime().optional() }).parse(req.body);
  const user = await User.findOne({ _id: req.params.id, role: 'vendedor' }); if (!user) throw new AppError('Vendedor no encontrado.', 404);
  const before = user.toObject();
  const previousPlan = before.planId ? await Plan.findById(before.planId).select('name').lean() : null;
  let planName = '';
  if (!body.planId) { user.planId = undefined; user.planExpiresAt = undefined; }
  else {
    const plan = await Plan.findById(body.planId); if (!plan) throw new AppError('Plan no encontrado.', 404);
    planName = plan.name; user.planId = plan._id; user.planExpiresAt = body.expiresAt ? new Date(body.expiresAt) : new Date(Math.max(Date.now(), +(user.planExpiresAt || 0)) + (body.days || plan.durationDays) * 86400000);
  }
  await user.save();
  const entitlement = await EntitlementService.forUser(user);
  await quotaService.reconcilePublications(user._id);
  await audit(req, 'user.plan.assigned', 'user', user._id, { previousPlanName: previousPlan?.name || '', planName, changes: AuditService.changes(before, user, ['planId', 'planExpiresAt']) });
  ok(res, { ...safeUser(user), entitlement });
}));

const contactSchema = z.object({ email: maybeEmail.default(''), phone: text(40).default(''), whatsapp: text(40).default('') });
const homeSchema = z.object({ eyebrow: text(150), title: text(240), subtitle: text(1000), ctaText: text(80), heroImage: url, benefits: z.array(z.object({ icon: text(60), title: text(150), description: text(1000) })).max(20), testimonials: z.array(z.object({ name: text(100), business: text(150), quote: text(1500) })).max(30), faq: z.array(z.object({ question: text(300), answer: text(2000) })).max(30) }).partial();
router.get('/admin/settings', requireAdmin, asyncHandler(async (_req, res) => ok(res, await SettingsService.get())));
router.put('/admin/settings', requireAdmin, asyncHandler(async (req, res) => {
  const body = z.object({ trialDays: integer(365).optional(), magicLinkMinutes: integer(1440).refine(n => n >= 1).optional(), contact: contactSchema.partial().optional(), home: homeSchema.optional() }).parse(req.body);
  const settings = await SettingsService.get(); const before = settings.toObject();
  if (body.trialDays !== undefined) settings.trialDays = body.trialDays;
  if (body.magicLinkMinutes !== undefined) settings.magicLinkMinutes = body.magicLinkMinutes;
  if (body.contact) settings.contact = { ...settings.contact.toObject(), ...Object.fromEntries(Object.keys(req.body.contact).filter(key => Object.hasOwn(body.contact, key)).map(key => [key, body.contact[key]])) };
  if (body.home) { settings.home = { ...settings.home, ...body.home }; settings.markModified('home'); }
  await settings.save(); await audit(req, 'settings.updated', 'settings', settings._id, { changes: AuditService.changes(before, settings, Object.keys(body)) }); ok(res, settings);
}));
router.get('/admin/audit', requireAdmin, asyncHandler(async (req, res) => { const result = await AuditService.list(req.query); ok(res, result.data, 200, result.meta); }));
router.get('/admin/audit/:id', requireAdmin, asyncHandler(async (req, res) => ok(res, await AuditService.get(req.params.id))));
router.get('/admin/whatsapp/status', requireAdmin, (_req, res) => ok(res, whatsappService.status()));
router.post('/admin/whatsapp/connect', requireAdmin, asyncHandler(async (req, res) => { const result = await whatsappService.connect(); await audit(req, 'whatsapp.connect', 'integration', 'whatsapp'); ok(res, result); }));
router.post('/admin/whatsapp/disconnect', requireAdmin, asyncHandler(async (req, res) => { const result = await whatsappService.disconnect(); await audit(req, 'whatsapp.disconnect', 'integration', 'whatsapp'); ok(res, result); }));

const storeSchema = z.object({ ownerId: objectId, name: text(120).min(1), slug: text(80).min(3).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Usá minúsculas, números y guiones.'), description: text(5000).default(''), active: trueBoolean.default(false) });
async function validateStoreOwner(ownerId) { const user = await User.findOne({ _id: ownerId, role: 'vendedor', active: true }); if (!user) throw new AppError('Seleccioná un vendedor activo.', 422); return user; }
router.get('/admin/stores', requireAdmin, asyncHandler(async (req, res) => {
  const { page, limit } = pagination(req.query); const filter = { archived: { $ne: true }, ...searchFilter(req.query, ['name', 'slug']) };
  const [items, total] = await Promise.all([Store.find(filter).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret').populate('ownerId', 'name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Store.countDocuments(filter)]);
  ok(res, items.map(safeStore), 200, { page, limit, total });
}));
router.get('/admin/stores/:id', requireAdmin, asyncHandler(async (req, res) => { const item = await Store.findOne({ _id: req.params.id, archived: { $ne: true } }).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret'); if (!item) throw new AppError('Tienda no encontrada.', 404); ok(res, safeStore(item)); }));
router.post('/admin/stores', requireAdmin, asyncHandler(async (req, res) => {
  const body = storeSchema.parse(req.body); const owner = await validateStoreOwner(body.ownerId);
  const item = await quotaService.createStore({ ...body, contact: { email: owner.email }, payments: [{ id: 'cash', type: 'cash', name: 'Efectivo', deliveryIds: ['pickup'], active: true }] });
  await audit(req, 'store.created', 'store', item._id, { changes: AuditService.changes({}, item, ['name', 'slug', 'ownerId', 'active']) }, item._id); ok(res, safeStore(item), 201);
}));
async function updateStore(req, item, body) {
  const before = safeStore(item);
  const wasActive = item.active;
  const ownerChanged = Boolean(body.ownerId && String(body.ownerId) !== String(item.ownerId));
  if (ownerChanged) await validateStoreOwner(body.ownerId);
  Object.assign(item, body);
  const saved = await quotaService.saveStore(item, { ownerChanged, activating: item.active && !wasActive });
  await audit(req, 'store.updated', 'store', saved._id, { changes: AuditService.changes(before, safeStore(saved), Object.keys(body)) }, saved._id);
  return safeStore(saved);
}
router.put('/admin/stores/:id', requireAdmin, asyncHandler(async (req, res) => { const item = await Store.findOne({ _id: req.params.id, archived: { $ne: true } }).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret'); if (!item) throw new AppError('Tienda no encontrada.', 404); ok(res, await updateStore(req, item, parsePatch(storeSchema, req.body))); }));
router.delete('/admin/stores/:id', requireAdmin, asyncHandler(async (req, res) => {
  const before = await Store.findByIdAndUpdate(req.params.id, { $set: { active: false, archived: true }, $inc: { __v: 1 } }, { returnDocument: 'before' });
  if (!before) throw new AppError('Tienda no encontrada.', 404);
  await audit(req, 'store.archived', 'store', before._id, { changes: AuditService.changes(before, { active: false, archived: true }, ['active', 'archived']) }, before._id); ok(res, safeStore(await Store.findById(before._id)));
}));
router.get('/stores', requireAuth, asyncHandler(async (req, res) => {
  const filter = { archived: { $ne: true }, ...(req.user.role === 'admin' ? {} : { ownerId: req.user._id }) };
  const items = await Store.find(filter).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret').sort({ createdAt: 1 }); ok(res, items.map(safeStore));
}));
router.get('/stores/:storeId', requireStoreAccess, (req, res) => ok(res, safeStore(req.store)));
router.put('/stores/:storeId', requireStoreAccess, asyncHandler(async (req, res) => { const body = parsePatch(storeSchema.omit({ ownerId: true }), req.body); ok(res, await updateStore(req, req.store, body)); }));
router.put('/stores/:storeId/design', requireStoreAccess, asyncHandler(async (req, res) => {
  const { design } = z.object({ design: z.record(z.string(), z.unknown()) }).parse(req.body);
  const validated = validateDesign(design);
  await imageService.validateWallpapers(req.store._id, validated);
  await imageService.validateDesignAssets(req.store._id, validated);
  const before = normalizeDesign(req.store.design);
  req.store.design = validated; req.store.markModified('design'); await req.store.save();
  await assetService.markDesignAttached(req.store._id, validated);
  await assetService.cleanupDesignImages(req.store._id, before, validated);
  await audit(req, 'store.design.updated', 'store', req.store._id, { changes: AuditService.changes({ design: before }, { design: validated }) });
  ok(res, safeStore(req.store));
}));
const sellerContactSchema = contactSchema.extend({ message: text(1500).default('¡Hola! Quisiera hacer una consulta.'), showWhatsapp: trueBoolean.default(true), showContactForm: trueBoolean.default(false) });
router.put('/stores/:storeId/contact', requireStoreAccess, asyncHandler(async (req, res) => { const before = req.store.contact.toObject(); req.store.contact = sellerContactSchema.parse(req.body.contact); await req.store.save(); await audit(req, 'store.contact.updated', 'store', req.store._id, { changes: AuditService.changes({ contact: before }, { contact: req.store.contact.toObject() }) }); ok(res, safeStore(req.store)); }));
const deliverySchema = z.object({ id: text(60).min(1), type: z.enum(['pickup', 'shipping', 'digital', 'custom']), name: text(120).min(1), description: text(1000).default(''), price: money.default(0), active: trueBoolean.default(true) });
const paymentSchema = z.object({ id: text(60).min(1), type: z.enum(['cash', 'transfer', 'mercadopago']), name: text(120).min(1), instructions: text(4000).default(''), deliveryIds: z.array(text(60)).max(20).default([]), active: trueBoolean.default(true), bank: z.object({ holder: text(180).optional(), bank: text(180).optional(), cbu: text(40).optional(), alias: text(60).optional(), cuit: text(30).optional() }).optional() });
router.put('/stores/:storeId/payments', requireStoreAccess, asyncHandler(async (req, res) => {
  const body = z.object({ expectedUpdatedAt: z.string().datetime().optional(), payments: z.array(paymentSchema).max(20), deliveries: z.array(deliverySchema).max(20), mercadopago: z.object({ accessToken: text(1000).optional(), webhookSecret: text(1000).optional(), sandbox: trueBoolean.optional(), clearCredentials: trueBoolean.optional() }).optional() }).parse(req.body);
  if (body.expectedUpdatedAt && new Date(body.expectedUpdatedAt).getTime() !== req.store.updatedAt.getTime()) throw new AppError('La configuración de la tienda cambió. Recargá e intentá nuevamente.', 409, 'STORE_CONFLICT');
  if (new Set(body.payments.map(item => item.id)).size !== body.payments.length || new Set(body.deliveries.map(item => item.id)).size !== body.deliveries.length) throw new AppError('Los identificadores de cobros y entregas deben ser únicos.', 422);
  const deliveryIds = new Set(body.deliveries.map(item => item.id));
  if (body.payments.some(payment => payment.deliveryIds.some(id => !deliveryIds.has(id)))) throw new AppError('Un medio de pago referencia una entrega que no existe.', 422);
  const before = safeStore(req.store);
  req.store.payments = body.payments; req.store.deliveries = body.deliveries;
  if (body.mercadopago) {
    const mp = req.store.integrations?.mercadopago || {};
    if (body.mercadopago.clearCredentials) { mp.accessToken = ''; mp.webhookSecret = ''; }
    if (body.mercadopago.accessToken) mp.accessToken = encryptSecret(body.mercadopago.accessToken);
    if (body.mercadopago.webhookSecret) mp.webhookSecret = encryptSecret(body.mercadopago.webhookSecret);
    if (body.mercadopago.sandbox !== undefined) mp.sandbox = body.mercadopago.sandbox;
    req.store.integrations = { mercadopago: mp };
  }
  if (body.payments.some(payment => payment.type === 'mercadopago' && payment.active) && (!req.store.integrations?.mercadopago?.accessToken || !req.store.integrations?.mercadopago?.webhookSecret)) throw new AppError('Configurá Access Token y secreto de Webhooks para habilitar Mercado Pago.', 422, 'MP_NOT_CONFIGURED');
  await req.store.save(); await audit(req, 'store.payments.updated', 'store', req.store._id, { changes: AuditService.changes(before, safeStore(req.store), ['payments', 'deliveries', 'integrations']), credentialsUpdated: Boolean(body.mercadopago?.clearCredentials || body.mercadopago?.accessToken || body.mercadopago?.webhookSecret) }); ok(res, safeStore(req.store));
}));
router.get('/me/plan', requireAuth, asyncHandler(async (req, res) => { const settings = await SettingsService.get(); const plan = req.user.planId ? await Plan.findById(req.user.planId) : null; ok(res, { user: safeUser(req.user), plan, entitlement: await EntitlementService.forUser(req.user), contact: settings.contact }); }));

const categorySchema = z.object({ name: text(120).min(1), description: text(3000).default(''), parentId: objectId.nullable().default(null), active: trueBoolean.default(true) });
router.get('/stores/:storeId/categories', requireStoreAccess, asyncHandler((req, res) => {
  const parentFilter = req.query.parentId === 'null' || req.query.parentId === 'root' ? { parentId: null } : req.query.parentId ? { parentId: objectId.parse(req.query.parentId) } : {};
  return listResponse(res, Category, { storeId: req.store._id, archived: { $ne: true }, ...parentFilter, ...searchFilter(req.query, ['name', 'description']) }, req.query, { sort: { name: 1, _id: 1 } });
}));
router.get('/stores/:storeId/categories/:id', requireStoreAccess, asyncHandler(async (req, res) => ok(res, safeCategory(await categoryService.find(req.store._id, req.params.id)))));
router.post('/stores/:storeId/categories', requireStoreAccess, asyncHandler(async (req, res) => { const item = await categoryService.create(req.store._id, categorySchema.parse(req.body)); await audit(req, 'category.created', 'category', item._id, { changes: AuditService.changes({}, item, ['name', 'description', 'parentId', 'active']) }); ok(res, item, 201); }));
router.put('/stores/:storeId/categories/:id', requireStoreAccess, asyncHandler(async (req, res) => {
  const { item, before } = await categoryService.update(req.store._id, req.params.id, parsePatch(categorySchema, req.body), { includeBefore: true });
  await audit(req, 'category.updated', 'category', item._id, { changes: AuditService.changes(before, item, ['name', 'description', 'parentId', 'active']) }); ok(res, item);
}));
router.delete('/stores/:storeId/categories/:id', requireStoreAccess, asyncHandler(async (req, res) => {
  const { item, before, unassignedProducts } = await categoryService.archive(req.store._id, req.params.id, { includeBefore: true });
  await audit(req, 'category.archived', 'category', item._id, { changes: AuditService.changes(before, item, ['active', 'archived']), unassignedProducts }); ok(res, item);
}));
const variantSchema = z.object({ id: text(80).min(1), name: text(120).min(1), sku: text(100).default(''), stock: integer().default(0), price: money.optional(), attributes: z.record(z.string(), text(100)).default({}) });
const productSchema = z.object({ name: text(180).min(1), description: text(15000).default(''), categoryId: objectId.nullable().optional(), type: z.enum(['physical', 'digital']).default('physical'), digitalUrl: z.string().max(2048).default(''), images: z.array(url).max(5).default([]), price: money, previousPrice: money.default(0), active: trueBoolean.default(true), featured: trueBoolean.default(false), madeToOrder: trueBoolean.default(false), stock: integer().default(0), variants: z.array(variantSchema).max(100).default([]), relatedProductIds: z.array(objectId).max(50).default([]) });
async function validateProduct(body, storeId, currentId) {
  if (body.type === 'digital' && !/^https?:\/\//i.test(body.digitalUrl || '')) throw new AppError('Ingresá un enlace HTTP/HTTPS para el producto digital.', 422);
  if (body.categoryId && !await Category.exists({ _id: body.categoryId, storeId, archived: { $ne: true } })) throw new AppError('La categoría no pertenece a esta tienda.', 422);
  if (new Set(body.variants.map(variant => variant.id)).size !== body.variants.length) throw new AppError('Cada variante necesita un identificador diferente.', 422);
  if (body.relatedProductIds.length) {
    if (currentId && body.relatedProductIds.includes(String(currentId))) throw new AppError('El producto no puede relacionarse consigo mismo.', 422);
    const count = await Product.countDocuments({ _id: { $in: [...new Set(body.relatedProductIds)] }, storeId, archived: { $ne: true } });
    if (count !== new Set(body.relatedProductIds).size) throw new AppError('Los productos relacionados deben pertenecer a la misma tienda.', 422);
  }
}
router.get('/stores/:storeId/products', requireStoreAccess, asyncHandler(async (req, res) => listResponse(res, Product, { storeId: req.store._id, archived: { $ne: true }, ...await categoryService.productFilter(req.store._id, req.query), ...searchFilter(req.query, ['name', 'description', 'variants.sku']) }, req.query, { select: '-reservations' })));
router.get('/stores/:storeId/products/:id', requireStoreAccess, asyncHandler(async (req, res) => { const item = await Product.findOne({ _id: req.params.id, storeId: req.store._id, archived: { $ne: true } }).select('+digitalUrl -reservations'); if (!item) throw new AppError('Producto no encontrado.', 404); ok(res, item); }));
router.post('/stores/:storeId/products', requireStoreAccess, asyncHandler(async (req, res) => {
  const body = productSchema.parse(req.body); await validateProduct(body, req.store._id);
  await assetService.assertOwned(req.store._id, body.images);
  const item = await quotaService.createProduct(req.store._id, body); await assetService.markAttached(req.store._id, item.images); await audit(req, 'product.created', 'product', item._id, { changes: AuditService.changes({}, item, Object.keys(productSchema.shape)) }); ok(res, item, 201);
}));
router.put('/stores/:storeId/products/:id', requireStoreAccess, asyncHandler(async (req, res) => {
  const patch = parsePatch(productSchema, req.body);
  if (Object.keys(patch).length === 1 && Object.hasOwn(patch, 'featured')) {
    // La acción de destacado no reemplaza variantes ni cantidades leídas antes.
    // Se versiona para que una edición completa anterior detecte el cambio.
    const before = await Product.findOneAndUpdate({ _id: req.params.id, storeId: req.store._id, archived: { $ne: true } }, { $set: { featured: patch.featured }, $inc: { stockVersion: 1 } }, { returnDocument: 'before', runValidators: true }).select('+digitalUrl -reservations');
    if (!before) throw new AppError('Producto no encontrado.', 404);
    const item = await Product.findById(before._id).select('+digitalUrl -reservations');
    await audit(req, 'product.featured.updated', 'product', before._id, { changes: AuditService.changes(before, { featured: patch.featured }, ['featured']) }); ok(res, item); return;
  }
  const current = await Product.findOne({ _id: req.params.id, storeId: req.store._id, archived: { $ne: true } }).select('+digitalUrl'); if (!current) throw new AppError('Producto no encontrado.', 404);
  const merged = productSchema.parse({ ...current.toObject({ flattenMaps: true }), ...patch }); await validateProduct(merged, req.store._id, current._id);
  await assetService.assertOwned(req.store._id, merged.images);
  delete merged.stock; merged.variants = merged.variants.map(variant => ({ ...variant, stock: current.variants.find(existing => existing.id === variant.id)?.stock || 0 }));
  if (current.reservations.length && (merged.type !== current.type || merged.madeToOrder !== current.madeToOrder || JSON.stringify(merged.variants.map(v => v.id)) !== JSON.stringify(current.variants.map(v => v.id)))) throw new AppError('Hay pedidos pendientes. Resolvelos antes de cambiar el tipo o la estructura de variantes.', 409, 'RESERVATIONS_PENDING');
  const item = await Product.findOneAndUpdate({ _id: current._id, storeId: req.store._id, stockVersion: current.stockVersion }, { $set: merged, $inc: { stockVersion: 1 } }, { returnDocument: 'after', runValidators: true }).select('+digitalUrl -reservations');
  if (!item) throw new AppError('El stock cambió mientras editabas. Recargá el producto e intentá nuevamente.', 409, 'STOCK_CONFLICT');
  await assetService.markAttached(req.store._id, item.images);
  await assetService.cleanupProductImages(current, item.images);
  await audit(req, 'product.updated', 'product', item._id, { changes: AuditService.changes(current, item, Object.keys(productSchema.shape)) }); ok(res, item);
}));
router.delete('/stores/:storeId/products/:id', requireStoreAccess, asyncHandler(async (req, res) => {
  const before = await Product.findOneAndUpdate({ _id: req.params.id, storeId: req.store._id }, { $set: { active: false, archived: true }, $inc: { stockVersion: 1 } }, { returnDocument: 'before' });
  if (!before) throw new AppError('Producto no encontrado.', 404);
  await assetService.cleanupProductImages(before, []);
  await audit(req, 'product.archived', 'product', before._id, { changes: AuditService.changes(before, { active: false, archived: true }, ['active', 'archived']) }); ok(res, await Product.findById(before._id).select('-reservations'));
}));
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 5 * 1024 * 1024 }, fileFilter(_req, file, cb) { if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(new AppError('Solo imágenes JPG, PNG o WebP.', 422)); cb(null, true); } });
router.post('/stores/:storeId/uploads', requireStoreAccess, upload.array('files', 5), asyncHandler(async (req, res) => {
  const purpose = req.body.purpose === undefined ? 'image' : z.string().max(40).parse(req.body.purpose);
  const result = await imageService.upload({ files: req.files, purpose, storeId: req.store._id, actorId: req.user._id });
  await audit(req, purpose.startsWith('wallpaper-') ? 'wallpaper.uploaded' : 'image.uploaded', 'store', req.store._id, { count: result.length, purpose, images: result.map(({ width, height }) => ({ width, height })) });
  ok(res, result, 201);
}));
router.delete('/stores/:storeId/uploads', requireStoreAccess, asyncHandler(async (req, res) => {
  const { urls } = z.object({ urls: z.array(z.string().max(2048)).max(50) }).parse(req.body);
  const result = await assetService.deleteUnclaimed(req.store._id, urls);
  ok(res, result);
}));

router.get('/admin/dashboard', requireAdmin, asyncHandler(async (_req, res) => {
  const { Order } = await import('../models/commerce.js');
  const [users, stores, activeStores, products, paid, recentOrders, activity, salesSeries] = await Promise.all([
    User.countDocuments({ role: 'vendedor', active: true }), Store.countDocuments({ archived: { $ne: true } }), Store.countDocuments({ active: true, archived: { $ne: true } }), Product.countDocuments({ archived: { $ne: true } }),
    Order.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' }, productsSold: { $sum: { $sum: '$items.quantity' } } } }]),
    Order.find({ status: { $ne: 'creating' } }).sort({ createdAt: -1 }).limit(7).select('number total status createdAt storeId customer.name').populate('storeId', 'name').lean(),
    AuditService.recent(10),
    Order.aggregate([{ $match: { status: 'paid', paidAt: { $gte: new Date(Date.now() - 30 * 86400000) } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: 'America/Argentina/Buenos_Aires' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
  ]);
  ok(res, { users, stores, activeStores, products, paidOrders: paid[0]?.count || 0, revenue: paid[0]?.revenue || 0, productsSold: paid[0]?.productsSold || 0, recentOrders, activity, salesSeries });
}));
export default router;
