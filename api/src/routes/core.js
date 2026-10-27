import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { User, Plan, Store, Category, Product, Settings, AuditLog, Subscription, Session } from '../models/index.js';
import { config } from '../config.js';
import { AppError, asyncHandler, requireAuth, requireAdmin, requireStoreAccess, requireFeature, requireAnyFeature } from '../middleware/core.js';
import { ok, listResponse, pagination } from '../utils/http.js';
import { encryptSecret } from '../utils/crypto.js';
import { validateDesign } from '../utils/design.js';
import { AuthService, authService, SettingsService, EntitlementService, AuditService, safeUser, safeStore } from '../services/core.js';
import { whatsappService } from '../services/WhatsAppService.js';
import { quotaService } from '../services/QuotaService.js';
import { categoryService, safeCategory } from '../services/CategoryService.js';
import { imageService } from '../services/ImageService.js';
import { assetService } from '../services/AssetService.js';
import { domainService } from '../services/DomainService.js';
import { subscriptionService } from '../services/SubscriptionService.js';
import { subscriptionSupportService } from '../services/SubscriptionSupportService.js';
import { sellerMailService } from '../services/SellerMailService.js';
import { planFeatureService, PLAN_FEATURE_SCHEMA_VERSION } from '../services/PlanFeatureService.js';
import { storeTransferService } from '../services/StoreTransferService.js';
import { storeManagementService } from '../services/StoreManagementService.js';
import { customPlanRequestService } from '../services/CustomPlanRequestService.js';
import { facebookAdsService } from '../services/FacebookAdsService.js';
import { instagramAdsService } from '../services/InstagramAdsService.js';
import { googleAdsService } from '../services/GoogleAdsService.js';
import { youtubeAdsService } from '../services/YouTubeAdsService.js';
import { tiktokAdsService } from '../services/TikTokAdsService.js';
import { mercadoPagoAccountService } from '../services/MercadoPagoAccountService.js';
import { commercePlanLimitService } from '../services/CommercePlanLimitService.js';
import { bugReportService } from '../services/BugReportService.js';
import { adminDashboardService } from '../services/AdminDashboardService.js';
import { legalDocumentService, LEGAL_DOCUMENT_SCHEMA_VERSION } from '../services/LegalDocumentService.js';
import { normalizeDesign } from '../../../client/src/services/design.js';
const router = Router();
const text = (max = 500) => z.string().trim().max(max);
const money = z.coerce.number().finite().min(0).max(999999999).transform(n => Math.round(n * 100) / 100);
const integer = (max = 1000000) => z.coerce.number().int().min(0).max(max);
const nonnegativeInteger = z.coerce.number().int().min(0);
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
const assertPlanFeature = async (user, featureKey) => { if (user?.role === 'admin' || await planFeatureService.has(user, featureKey)) return; const label = planFeatureService.label(featureKey); throw new AppError(`Tu plan no incluye ${label}.`, 403, 'PLAN_FEATURE_REQUIRED', { featureKey, label }); };
const authLimiter = rateLimit({ windowMs: 15 * 60000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Demasiados intentos. Esperá unos minutos.' } } });
const subscriptionSupportUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 3 } });
const bugReportUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 5, fields: 4 }, fileFilter(_req, file, cb) { if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype)) return cb(new AppError('Los reportes admiten imágenes JPG, PNG, WebP o GIF.', 422, 'BUG_REPORT_INVALID_FILE')); cb(null, true); } });
const customPlanRequestLimiter = rateLimit({ windowMs: 15 * 60000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Recibimos varias solicitudes. Esperá unos minutos antes de volver a enviar.' } } });

router.get('/public/config', asyncHandler(async (_req, res) => {
  const settings = await SettingsService.get();
  const rows = await Plan.find({ active: true, visible: { $ne: false } }).sort({ sortOrder: 1, price: 1 }).lean();
  const plans = await planFeatureService.presentMany(rows);
  const legal = legalDocumentService.normalize(settings.legal);
  ok(res, { trialDays: settings.trialDays, contact: settings.contact, home: settings.home, plans, planFeatures: planFeatureService.catalog(), legal: { privacyEnabled: legal.privacy.enabled, termsEnabled: legal.terms.enabled } });
}));
router.get('/public/legal/:kind', asyncHandler(async (req, res) => {
  const kind = z.enum(['privacy', 'terms']).parse(req.params.kind);
  const settings = await SettingsService.get();
  const document = legalDocumentService.get(settings.legal, kind);
  if (!document?.enabled) throw new AppError('El documento solicitado no está publicado.', 404, 'LEGAL_DOCUMENT_NOT_PUBLISHED');
  ok(res, { ...document, contact: settings.contact || {} });
}));
router.post('/public/custom-plan-requests', customPlanRequestLimiter, asyncHandler(async (req, res) => {
  const body = z.object({ email, whatsapp: text(60).min(6), description: text(5000).min(10) }).parse(req.body);
  const item = await customPlanRequestService.create(body);
  ok(res, { _id: item._id, message: 'Recibimos tu solicitud. Vamos a contactarte con los datos que nos dejaste.' }, 201);
}));
router.get('/public/stores/:slug/manifest.webmanifest', asyncHandler(async (req, res) => {
  const store = await Store.findOne({ slug: req.params.slug, archived: { $ne: true } }).lean();
  if (!store) throw new AppError('Tienda no encontrada.', 404, 'STORE_NOT_FOUND');
  const owner = await User.findById(store.ownerId);
  if (!owner || !await planFeatureService.has(owner, 'store.pwa')) throw new AppError('La aplicación PWA no está incluida en el plan de esta tienda.', 404, 'PWA_NOT_AVAILABLE');
  const hosted = await domainService.resolveStoreByHost(req.hostname, { allowInactive: true });
  const onOwnHost = hosted && String(hosted._id) === String(store._id);
  const root = onOwnHost ? '/' : `/t/${store.slug}/`;
  const name = String(store.pwa?.name || store.name || 'Tienda').trim().slice(0, 120);
  const icon192 = store.pwa?.icon192Url || '/icons/icon-192.png';
  const icon512 = store.pwa?.iconUrl || '/icons/icon-512.png';
  res.set('Cache-Control', 'no-cache').type('application/manifest+json').send(JSON.stringify({
    id: root, name, short_name: name.slice(0, 30), description: String(store.description || `Tienda online ${name}`).slice(0, 300), lang: 'es-AR',
    start_url: root, scope: root, display: 'standalone', orientation: 'any', background_color: '#ffffff', theme_color: '#18181b',
    icons: [{ src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
  }));
}));
router.get('/auth/me', asyncHandler(async (req, res) => { const entitlement = req.user ? await EntitlementService.forUser(req.user) : null; ok(res, { user: req.user ? safeUser(req.user) : null, csrfToken: req.session?.csrfToken || null, features: { devImpersonation: config.devImpersonation.enabled }, entitlement, impersonation: { active: Boolean(req.session?.impersonatedByUserId) } }); }));
router.post('/auth/impersonation/exit', requireAuth, asyncHandler(async (req, res) => ok(res, await authService.exitImpersonation(req.session, res))));
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

const featureKey = z.string().refine(key => planFeatureService.isKnown(key), 'Funcionalidad de plan desconocida.');
const planSchema = z.object({
  name: text(100).min(1), icon: text(60).default('store'), previousPrice: money.default(0), price: money,
  durationDays: integer(3660).refine(n => n > 0).default(30), featureKeys: z.array(featureKey).max(50).default([]),
  featurePresentation: z.array(z.object({ key: featureKey, title: text(120).default(''), description: text(500).default('') })).max(50).default([]),
  inheritsPlanId: objectId.nullable().optional().default(null), maxStores: integer(1000).refine(n => n > 0).default(1),
  maxProducts: integer().default(100), maxPaymentMethods: nonnegativeInteger.default(3), maxDeliveryMethods: nonnegativeInteger.default(3), active: trueBoolean.default(true), visible: trueBoolean.default(true), featured: trueBoolean.default(false),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
});
const planPayload = body => {
  const payload = { ...body };
  if (Object.prototype.hasOwnProperty.call(body, 'featureKeys')) {
    payload.featureKeys = planFeatureService.normalize(body.featureKeys);
    payload.features = payload.featureKeys.map(key => planFeatureService.label(key));
    payload.featureSchemaVersion = PLAN_FEATURE_SCHEMA_VERSION;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'featurePresentation')) payload.featurePresentation = planFeatureService.normalizePresentation(body.featurePresentation, payload.featureKeys || body.featureKeys);
  return payload;
};
router.get('/admin/plan-features', requireAdmin, asyncHandler(async (_req, res) => {
  const rows = await Plan.find({}).sort({ sortOrder: 1, price: 1, createdAt: 1 }).lean();
  ok(res, { groups: planFeatureService.catalog(), plans: await planFeatureService.presentMany(rows, { admin: true }) });
}));
router.get('/admin/custom-plan-requests', requireAdmin, asyncHandler(async (req, res) => {
  const { page, limit } = pagination(req.query);
  const result = await customPlanRequestService.list({ page, limit, search: req.query.search });
  ok(res, result.items, 200, { page, limit, total: result.total });
}));
router.get('/admin/custom-plan-requests/:id', requireAdmin, asyncHandler(async (req, res) => {
  ok(res, await customPlanRequestService.getById(req.params.id));
}));
router.get('/admin/bug-reports', requireAdmin, asyncHandler(async (req, res) => {
  const { page, limit } = pagination(req.query);
  const result = await bugReportService.listAdmin({ page, limit, search: req.query.search, status: String(req.query.status || '') });
  ok(res, result.items, 200, { page, limit, total: result.total });
}));
router.get('/admin/bug-reports/:id/attachments/:attachmentId', requireAdmin, asyncHandler(async (req, res) => {
  const file = await bugReportService.attachment(req.params.id, req.params.attachmentId, req.user);
  res.set('Cache-Control', 'private, no-store').set('X-Content-Type-Options', 'nosniff').type(file.mimeType).set('Content-Disposition', 'inline').send(file.body);
}));
router.get('/admin/bug-reports/:id', requireAdmin, asyncHandler(async (req, res) => ok(res, await bugReportService.getAdmin(req.params.id))));
router.put('/admin/bug-reports/:id', requireAdmin, asyncHandler(async (req, res) => {
  const body = z.object({ status: z.enum(['new','reviewing','resolved','closed']).optional(), adminNote: text(5000).optional() }).parse(req.body);
  const before = await bugReportService.getAdmin(req.params.id);
  const item = await bugReportService.updateAdmin(req.params.id, req.user._id, body);
  await audit(req, 'bug_report.updated', 'bug_report', item._id, { changes: AuditService.changes(before, item, ['status','adminNote','resolvedAt']) }, item.storeId?._id || item.storeId || null);
  ok(res, item);
}));
router.delete('/admin/bug-reports/:id', requireAdmin, asyncHandler(async (req, res) => {
  const item = await bugReportService.getAdmin(req.params.id);
  const result = await bugReportService.deleteAdmin(req.params.id);
  await audit(req, 'bug_report.deleted', 'bug_report', req.params.id, { reporterId: item.reporterId?._id || item.reporterId, status: item.status }, item.storeId?._id || item.storeId || null);
  ok(res, result);
}));
router.get('/admin/plans', requireAdmin, asyncHandler(async (req, res) => {
  const { page, limit } = pagination(req.query);
  const filter = searchFilter(req.query, ['name']);
  const [rows, total] = await Promise.all([Plan.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Plan.countDocuments(filter)]);
  ok(res, await planFeatureService.presentMany(rows, { admin: true }), 200, { page, limit, total });
}));
router.get('/admin/plans/:id', requireAdmin, asyncHandler(async (req, res) => { const item = await Plan.findById(req.params.id); if (!item) throw new AppError('Plan no encontrado.', 404); ok(res, await planFeatureService.present(item, { admin: true })); }));
router.post('/admin/plans', requireAdmin, asyncHandler(async (req, res) => {
  const body = planSchema.parse(req.body); await planFeatureService.assertInheritance({ inheritsPlanId: body.inheritsPlanId });
  const directFeatureKeys = await planFeatureService.directKeysForSave(body.featureKeys, body.inheritsPlanId);
  await planFeatureService.assertDependencies({ featureKeys: directFeatureKeys, inheritsPlanId: body.inheritsPlanId });
  const item = await Plan.create(planPayload({ ...body, featureKeys: directFeatureKeys, featurePresentation: planFeatureService.normalizePresentation(body.featurePresentation, directFeatureKeys) }));
  await audit(req, 'plan.created', 'plan', item._id, { changes: AuditService.changes({}, item, Object.keys(planSchema.shape)) });
  ok(res, await planFeatureService.present(item, { admin: true }), 201);
}));
router.put('/admin/plans/:id', requireAdmin, asyncHandler(async (req, res) => {
  const body = parsePatch(planSchema, req.body);
  const current = await Plan.findById(req.params.id);
  if (!current) throw new AppError('Plan no encontrado.', 404);
  const nextParent = Object.hasOwn(body, 'inheritsPlanId') ? body.inheritsPlanId : current.inheritsPlanId;
  const nextFeatures = Object.hasOwn(body, 'featureKeys') ? body.featureKeys : current.featureKeys;
  if (Object.hasOwn(body, 'inheritsPlanId')) await planFeatureService.assertInheritance({ planId: req.params.id, inheritsPlanId: body.inheritsPlanId });
  const directFeatureKeys = await planFeatureService.directKeysForSave(nextFeatures, nextParent);
  await planFeatureService.assertDependencies({ featureKeys: directFeatureKeys, inheritsPlanId: nextParent });
  const nextPresentation = Object.hasOwn(body, 'featurePresentation') ? body.featurePresentation : current.featurePresentation;
  const payload = planPayload({ ...body, ...(Object.hasOwn(body, 'featureKeys') || Object.hasOwn(body, 'inheritsPlanId') ? { featureKeys: directFeatureKeys } : {}), ...(Object.hasOwn(body, 'featurePresentation') || Object.hasOwn(body, 'featureKeys') || Object.hasOwn(body, 'inheritsPlanId') ? { featurePresentation: planFeatureService.normalizePresentation(nextPresentation, directFeatureKeys) } : {}) });
  const before = await Plan.findByIdAndUpdate(req.params.id, { $set: payload }, { returnDocument: 'before', runValidators: true });
  const item = await Plan.findById(before._id);
  await quotaService.reconcilePlan(item._id);
  await audit(req, 'plan.updated', 'plan', item._id, { changes: AuditService.changes(before, { ...before.toObject(), ...payload }, Object.keys(payload)) });
  ok(res, await planFeatureService.present(item, { admin: true }));
}));
router.delete('/admin/plans/:id', requireAdmin, asyncHandler(async (req, res) => {
  const children = await Plan.countDocuments({ inheritsPlanId: req.params.id, active: true });
  if (children) throw new AppError('Este plan es base de otro plan activo. Cambiá primero su herencia.', 409, 'PLAN_HAS_CHILDREN');
  const before = await Plan.findByIdAndUpdate(req.params.id, { $set: { active: false } }, { returnDocument: 'before' });
  if (!before) throw new AppError('Plan no encontrado.', 404);
  await audit(req, 'plan.archived', 'plan', before._id, { changes: AuditService.changes(before, { active: false }, ['active']) }); ok(res, await Plan.findById(before._id));
}));

const userSchema = z.object({ name: text(100).min(1), email, active: trueBoolean.default(true) });
router.get('/admin/users', requireAdmin, asyncHandler(async (req, res) => {
  const { page, limit } = pagination(req.query); const settings = await SettingsService.get();
  const filter = { role: 'vendedor', ...searchFilter(req.query, ['name', 'email']) };
  if (req.query.billingStatus === 'grace_expired') {
    const threshold = new Date(Date.now() - Number(settings.subscriptionGraceDays || 0) * 86400000);
    const ids = await Subscription.distinct('userId', { current: true, cancelAtPeriodEnd: { $ne: true }, status: { $in: ['authorized', 'payment_failed', 'paused'] }, currentPeriodEnd: { $lte: threshold } });
    filter._id = { $in: ids };
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate({ path: 'planId', select: 'name price durationDays maxStores maxProducts' }).lean(),
    User.countDocuments(filter),
  ]);
  const subscriptions = await Subscription.find({ userId: { $in: items.map(item => item._id) }, current: true }).lean();
  const byUser = new Map(subscriptions.map(item => [String(item.userId), item]));
  const data = items.map(item => ({ ...item, subscription: subscriptionService.billingState({ user: item, subscription: byUser.get(String(item._id)), settings }) }));
  ok(res, data, 200, { page, limit, total });
}));
router.get('/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => { const item = await User.findOne({ _id: req.params.id, role: 'vendedor' }); if (!item) throw new AppError('Vendedor no encontrado.', 404); ok(res, { ...safeUser(item), entitlement: await EntitlementService.forUser(item), subscription: await subscriptionService.summaryForUser(item) }); }));
router.post('/admin/users/:id/impersonate', requireAdmin, asyncHandler(async (req, res) => {
  if (!config.devImpersonation.enabled || config.isProduction) throw new AppError('La personificación sólo está disponible en desarrollo o prueba.', 404, 'DEV_IMPERSONATION_DISABLED');
  const seller = await User.findOne({ _id: req.params.id, role: 'vendedor', active: true });
  if (!seller) throw new AppError('Vendedor activo no encontrado.', 404, 'SELLER_NOT_FOUND');
  ok(res, await authService.impersonate(req.user, seller, res, req.session));
}));
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
async function adminSettingsPayload() {
  let settings = await Settings.findOne({ key: 'global' }).select('+platformBilling.mercadopago.accessToken +platformBilling.mercadopago.webhookSecret');
  if (!settings || !settings.legal?.privacy?.sections?.length || !settings.legal?.terms?.sections?.length || Number(settings.legal?.schemaVersion || 1) < LEGAL_DOCUMENT_SCHEMA_VERSION) { await SettingsService.get(); settings = await Settings.findOne({ key: 'global' }).select('+platformBilling.mercadopago.accessToken +platformBilling.mercadopago.webhookSecret'); }
  const data = settings.toObject(); const mp = data.platformBilling?.mercadopago || {};
  data.platformBilling = { enabled: Boolean(data.platformBilling?.enabled), mercadopago: { sandbox: mp.sandbox !== false, hasAccessToken: Boolean(mp.accessToken), hasWebhookSecret: Boolean(mp.webhookSecret) } };
  data.legal = legalDocumentService.normalize(data.legal);
  data.subscriptionWebhookUrl = `${config.appUrl}/api/webhooks/platform/mercadopago`;
  data.legalUrls = { privacy: `${config.appUrl}/politica-de-privacidad`, terms: `${config.appUrl}/condiciones-del-servicio` };
  return { settings, data };
}
router.get('/admin/settings', requireAdmin, asyncHandler(async (_req, res) => { const { data } = await adminSettingsPayload(); ok(res, data); }));
router.put('/admin/settings', requireAdmin, asyncHandler(async (req, res) => {
  const billingSchema = z.object({ enabled: trueBoolean.optional(), mercadopago: z.object({ accessToken: text(1200).optional(), webhookSecret: text(1200).optional(), sandbox: trueBoolean.optional(), clearCredentials: trueBoolean.optional() }).optional() }).optional();
  const legalSectionSchema = z.object({ title: text(220).min(1), content: text(15000).min(1) });
  const legalDocumentSchema = z.object({ enabled: trueBoolean.optional(), title: text(240).min(1), intro: text(5000).min(1), sections: z.array(legalSectionSchema).min(1).max(40) });
  const legalSchema = z.object({ privacy: legalDocumentSchema.optional(), terms: legalDocumentSchema.optional() }).refine(value => Boolean(value.privacy || value.terms), 'Indicá al menos un documento legal.').optional();
  const body = z.object({ trialDays: integer(365).optional(), magicLinkMinutes: integer(1440).refine(n => n >= 1).optional(), subscriptionGraceDays: integer(3650).optional(), subscriptionPendingLinkHours: integer(720).refine(n => n >= 1).optional(), platformBilling: billingSchema, contact: contactSchema.partial().optional(), home: homeSchema.optional(), legal: legalSchema }).parse(req.body);
  const { settings } = await adminSettingsPayload(); const beforeSafe = (await adminSettingsPayload()).data;
  if (body.trialDays !== undefined) settings.trialDays = body.trialDays;
  if (body.magicLinkMinutes !== undefined) settings.magicLinkMinutes = body.magicLinkMinutes;
  if (body.subscriptionGraceDays !== undefined) settings.subscriptionGraceDays = body.subscriptionGraceDays;
  if (body.subscriptionPendingLinkHours !== undefined) settings.subscriptionPendingLinkHours = body.subscriptionPendingLinkHours;
  if (body.contact) settings.contact = { ...settings.contact.toObject(), ...Object.fromEntries(Object.keys(req.body.contact).filter(key => Object.hasOwn(body.contact, key)).map(key => [key, body.contact[key]])) };
  if (body.home) { settings.home = { ...settings.home, ...body.home }; settings.markModified('home'); }
  if (body.legal) { settings.legal = legalDocumentService.merge(settings.legal, body.legal); settings.markModified('legal'); }
  let billingCredentialsUpdated = false;
  if (body.platformBilling) {
    settings.platformBilling ||= {}; settings.platformBilling.mercadopago ||= {};
    if (body.platformBilling.enabled !== undefined) settings.platformBilling.enabled = body.platformBilling.enabled;
    const mp = body.platformBilling.mercadopago;
    if (mp) {
      if (mp.clearCredentials) { settings.platformBilling.mercadopago.accessToken = ''; settings.platformBilling.mercadopago.webhookSecret = ''; settings.platformBilling.enabled = false; billingCredentialsUpdated = true; }
      if (mp.accessToken) { settings.platformBilling.mercadopago.accessToken = encryptSecret(mp.accessToken); billingCredentialsUpdated = true; }
      if (mp.webhookSecret) { settings.platformBilling.mercadopago.webhookSecret = encryptSecret(mp.webhookSecret); billingCredentialsUpdated = true; }
      if (mp.sandbox !== undefined) settings.platformBilling.mercadopago.sandbox = mp.sandbox;
    }
    settings.markModified('platformBilling');
  }
  if (settings.platformBilling?.enabled && (!settings.platformBilling?.mercadopago?.accessToken || !settings.platformBilling?.mercadopago?.webhookSecret)) throw new AppError('Para habilitar suscripciones configurá el Access Token y la clave secreta de Webhooks de Mercado Pago.', 422, 'SUBSCRIPTIONS_NOT_CONFIGURED');
  await settings.save(); const afterSafe = (await adminSettingsPayload()).data;
  const legalComparable = document => JSON.stringify({ enabled: document?.enabled !== false, title: document?.title || '', intro: document?.intro || '', sections: document?.sections || [] });
  const legalDocumentsUpdated = body.legal ? Object.keys(body.legal).filter(key => legalComparable(beforeSafe.legal?.[key]) !== legalComparable(afterSafe.legal?.[key])) : [];
  await audit(req, 'settings.updated', 'settings', settings._id, { changes: AuditService.changes(beforeSafe, afterSafe, ['trialDays', 'magicLinkMinutes', 'subscriptionGraceDays', 'subscriptionPendingLinkHours', 'contact', 'home', 'platformBilling']), billingCredentialsUpdated, legalDocumentsUpdated });
  ok(res, afterSafe);
}));
router.get('/admin/subscription-support', requireAdmin, asyncHandler(async (_req, res) => ok(res, await subscriptionSupportService.listPending())));
router.get('/admin/subscription-support/:id/receipt', requireAdmin, asyncHandler(async (req, res) => {
  const file = await subscriptionSupportService.receipt(req.params.id);
  res.set('Cache-Control', 'no-store'); res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`); res.type(file.mimeType); res.send(file.body);
}));
router.post('/admin/subscription-support/:id/approve', requireAdmin, asyncHandler(async (req, res) => {
  const body = z.object({ note: text(2000).optional().default('') }).parse(req.body || {});
  const result = await subscriptionSupportService.approve(req.params.id, req.user._id, body);
  await quotaService.reconcilePublications(result.user._id);
  await audit(req, 'subscription.support.approved', 'subscription_support', result.request._id, { userId: result.user._id, manualAccessUntil: result.request.manualAccessUntil || null });
  ok(res, { request: result.request, user: safeUser(result.user), entitlement: await EntitlementService.forUser(result.user) });
}));
router.post('/admin/subscription-support/:id/reject', requireAdmin, asyncHandler(async (req, res) => {
  const body = z.object({ note: text(2000).optional().default('') }).parse(req.body || {});
  const item = await subscriptionSupportService.reject(req.params.id, req.user._id, body);
  await audit(req, 'subscription.support.rejected', 'subscription_support', item._id, { userId: item.userId });
  ok(res, item);
}));

router.get('/admin/emails', requireAdmin, asyncHandler(async (_req, res) => ok(res, { templates: sellerMailService.listTemplates(), recipientCount: await sellerMailService.recipientCount(), smtpConfigured: Boolean(config.smtp.host) })));
router.post('/admin/emails/send', requireAdmin, asyncHandler(async (req, res) => {
  const body = z.object({
    template: z.enum(['release', 'announcement', 'maintenance']),
    subject: text(180).min(1).refine(value => !/[\r\n]/.test(value), 'El asunto no puede contener saltos de línea.'), title: text(180).min(1), version: text(60).optional().default(''),
    message: text(5000).min(1), changes: z.array(text(500)).max(30).optional().default([]),
    ctaText: text(80).optional().default(''), ctaUrl: z.union([z.string().trim().max(2048).regex(/^https?:\/\//i, 'Usá una URL HTTP/HTTPS.'), z.literal('')]).optional().default(''),
  }).parse(req.body);
  const result = await sellerMailService.sendToAll(body);
  await audit(req, 'seller.email.broadcast', 'email', body.template, { template: body.template, subject: body.subject, total: result.total, sent: result.sent, failed: result.failed });
  ok(res, result);
}));
router.get('/admin/audit', requireAdmin, asyncHandler(async (req, res) => { const result = await AuditService.list(req.query); ok(res, result.data, 200, result.meta); }));
router.get('/admin/audit/:id', requireAdmin, asyncHandler(async (req, res) => ok(res, await AuditService.get(req.params.id))));
router.get('/admin/whatsapp/status', requireAdmin, (_req, res) => ok(res, whatsappService.status()));
router.post('/admin/whatsapp/connect', requireAdmin, asyncHandler(async (req, res) => { const result = await whatsappService.connect(); await audit(req, 'whatsapp.connect', 'integration', 'whatsapp'); ok(res, result); }));
router.post('/admin/whatsapp/disconnect', requireAdmin, asyncHandler(async (req, res) => { const result = await whatsappService.disconnect(); await audit(req, 'whatsapp.disconnect', 'integration', 'whatsapp'); ok(res, result); }));

const SOCIAL_AD_FEATURES = Object.freeze({
  facebook: 'ads.limited',
  instagram: 'ads.limited',
  google: 'ads.premium',
  youtube: 'ads.enterprise',
  tiktok: 'ads.enterprise',
});
const SOCIAL_AD_NETWORKS = Object.freeze([
  { key: 'facebook', label: 'Facebook', featureKey: SOCIAL_AD_FEATURES.facebook, service: facebookAdsService },
  { key: 'instagram', label: 'Instagram', featureKey: SOCIAL_AD_FEATURES.instagram, service: instagramAdsService },
  { key: 'google', label: 'Google Ads', featureKey: SOCIAL_AD_FEATURES.google, service: googleAdsService },
  { key: 'youtube', label: 'YouTube', featureKey: SOCIAL_AD_FEATURES.youtube, service: youtubeAdsService },
  { key: 'tiktok', label: 'TikTok', featureKey: SOCIAL_AD_FEATURES.tiktok, service: tiktokAdsService },
]);
const socialFeature = provider => SOCIAL_AD_FEATURES[provider];

router.get('/social/facebook/callback', requireAuth, asyncHandler(async (req, res) => {
  const target = new URL('/app/social', config.appUrl);
  if (req.query.error) {
    target.searchParams.set('facebook', 'error');
    target.searchParams.set('message', String(req.query.error_description || 'Facebook canceló la autorización.').slice(0, 300));
    return res.redirect(303, target.toString());
  }
  try {
    const body = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(req.query);
    await assertPlanFeature(req.user, socialFeature('facebook'));
    const store = await facebookAdsService.completeOAuth({ ...body, user: req.user });
    await AuditService.log({ actorId: req.user._id, actor: req.user, storeId: store._id, store, action: 'social.facebook.connected', entity: 'integration', entityId: 'facebook', details: { mode: 'oauth' } });
    target.searchParams.set('facebook', 'connected');
  } catch (error) {
    target.searchParams.set('facebook', 'error');
    target.searchParams.set('message', String(error.message || 'No se pudo conectar Facebook.').slice(0, 300));
  }
  return res.redirect(303, target.toString());
}));

router.get('/social/instagram/callback', requireAuth, asyncHandler(async (req, res) => {
  const target = new URL('/app/social', config.appUrl);
  target.searchParams.set('network', 'instagram');
  if (req.query.error) {
    target.searchParams.set('instagram', 'error');
    target.searchParams.set('message', String(req.query.error_description || 'Instagram canceló la autorización.').slice(0, 300));
    return res.redirect(303, target.toString());
  }
  try {
    const body = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(req.query);
    await assertPlanFeature(req.user, socialFeature('instagram'));
    const store = await instagramAdsService.completeOAuth({ ...body, user: req.user });
    await AuditService.log({ actorId: req.user._id, actor: req.user, storeId: store._id, store, action: 'social.instagram.connected', entity: 'integration', entityId: 'instagram', details: { mode: 'oauth' } });
    target.searchParams.set('instagram', 'connected');
  } catch (error) {
    target.searchParams.set('instagram', 'error');
    target.searchParams.set('message', String(error.message || 'No se pudo conectar Instagram.').slice(0, 300));
  }
  return res.redirect(303, target.toString());
}));

const socialOAuthCallback = (provider, service, label, { codeParam = 'code' } = {}) => asyncHandler(async (req, res) => {
  const target = new URL('/app/social', config.appUrl);
  target.searchParams.set('network', provider);
  if (req.query.error || req.query.error_code) {
    target.searchParams.set(provider, 'error');
    target.searchParams.set('message', String(req.query.error_description || req.query.error || `${label} canceló la autorización.`).slice(0, 300));
    return res.redirect(303, target.toString());
  }
  try {
    const state = z.string().min(1).parse(req.query.state);
    const rawCode = req.query[codeParam] || req.query.code || req.query.auth_code;
    const code = z.string().min(1).parse(rawCode);
    await assertPlanFeature(req.user, socialFeature(provider));
    const store = await service.completeOAuth({ state, code, authCode: code, user: req.user });
    await AuditService.log({ actorId: req.user._id, actor: req.user, storeId: store._id, store, action: `social.${provider}.connected`, entity: 'integration', entityId: provider, details: { mode: 'oauth' } });
    target.searchParams.set(provider, 'connected');
  } catch (error) {
    target.searchParams.set(provider, 'error');
    target.searchParams.set('message', String(error.message || `No se pudo conectar ${label}.`).slice(0, 300));
  }
  return res.redirect(303, target.toString());
});
router.get('/social/google/callback', requireAuth, socialOAuthCallback('google', googleAdsService, 'Google Ads'));
router.get('/social/youtube/callback', requireAuth, socialOAuthCallback('youtube', youtubeAdsService, 'YouTube Ads'));
router.get('/social/tiktok/callback', requireAuth, socialOAuthCallback('tiktok', tiktokAdsService, 'TikTok Ads', { codeParam: 'auth_code' }));


const storeSchema = z.object({ ownerId: objectId, name: text(120).min(1), slug: text(80).min(3).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Usá minúsculas, números y guiones.'), description: text(5000).default(''), active: trueBoolean.default(false) });
async function validateStoreOwner(ownerId) { const user = await User.findOne({ _id: ownerId, role: 'vendedor', active: true }); if (!user) throw new AppError('Seleccioná un vendedor activo.', 422); return user; }
router.get('/admin/stores', requireAdmin, asyncHandler(async (req, res) => {
  const { page, limit } = pagination(req.query); const filter = { archived: { $ne: true }, ...searchFilter(req.query, ['name', 'slug']) };
  const [items, total] = await Promise.all([Store.find(filter).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret +integrations.mercadopago.accounts.accessToken +integrations.mercadopago.accounts.webhookSecret').populate('ownerId', 'name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Store.countDocuments(filter)]);
  ok(res, items.map(safeStore), 200, { page, limit, total });
}));
router.get('/admin/stores/:id', requireAdmin, asyncHandler(async (req, res) => { const item = await Store.findOne({ _id: req.params.id, archived: { $ne: true } }).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret +integrations.mercadopago.accounts.accessToken +integrations.mercadopago.accounts.webhookSecret'); if (!item) throw new AppError('Tienda no encontrada.', 404); ok(res, safeStore(item)); }));
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
router.put('/admin/stores/:id', requireAdmin, asyncHandler(async (req, res) => { const item = await Store.findOne({ _id: req.params.id, archived: { $ne: true } }).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret +integrations.mercadopago.accounts.accessToken +integrations.mercadopago.accounts.webhookSecret'); if (!item) throw new AppError('Tienda no encontrada.', 404); ok(res, await updateStore(req, item, parsePatch(storeSchema, req.body))); }));
router.delete('/admin/stores/:id', requireAdmin, asyncHandler(async (req, res) => {
  const before = await Store.findByIdAndUpdate(req.params.id, { $set: { active: false, archived: true }, $inc: { __v: 1 } }, { returnDocument: 'before' });
  if (!before) throw new AppError('Tienda no encontrada.', 404);
  await domainService.deprovisionStore(before);
  await audit(req, 'store.archived', 'store', before._id, { changes: AuditService.changes(before, { active: false, archived: true }, ['active', 'archived']) }, before._id); ok(res, safeStore(await Store.findById(before._id)));
}));

// ABM propio para vendedores cuyo plan admite más de una tienda.
const sellerStoreSchema = storeSchema.omit({ ownerId: true });
router.get('/me/stores', requireAuth, asyncHandler(async (req, res) => {
  const { page, limit } = pagination(req.query);
  const result = await storeManagementService.list(req.user, { page, limit, search: req.query.search });
  ok(res, result.items.map(safeStore), 200, { page, limit, total: result.total });
}));
router.get('/me/stores/:id', requireAuth, asyncHandler(async (req, res) => ok(res, safeStore(await storeManagementService.get(req.user, req.params.id)))));
router.post('/me/stores', requireAuth, asyncHandler(async (req, res) => {
  const body = sellerStoreSchema.parse(req.body);
  const item = await storeManagementService.create(req.user, body);
  await audit(req, 'store.created', 'store', item._id, { changes: AuditService.changes({}, item, ['name', 'slug', 'active']) }, item._id);
  ok(res, safeStore(item), 201);
}));
router.put('/me/stores/:id', requireAuth, asyncHandler(async (req, res) => {
  const before = safeStore(await storeManagementService.get(req.user, req.params.id));
  const body = parsePatch(sellerStoreSchema, req.body);
  const item = await storeManagementService.update(req.user, req.params.id, body);
  await audit(req, 'store.updated', 'store', item._id, { changes: AuditService.changes(before, safeStore(item), Object.keys(body)) }, item._id);
  ok(res, safeStore(item));
}));
router.delete('/me/stores/:id', requireAuth, asyncHandler(async (req, res) => {
  const before = await storeManagementService.archive(req.user, req.params.id);
  await audit(req, 'store.archived', 'store', before._id, { changes: AuditService.changes(before, { active: false, archived: true }, ['active', 'archived']) }, before._id);
  ok(res, safeStore(await Store.findById(before._id)));
}));

router.get('/stores', requireAuth, asyncHandler(async (req, res) => {
  const filter = { archived: { $ne: true }, ...(req.user.role === 'admin' ? {} : { ownerId: req.user._id }) };
  const items = await Store.find(filter).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret +integrations.mercadopago.accounts.accessToken +integrations.mercadopago.accounts.webhookSecret').sort({ createdAt: 1 }); ok(res, items.map(safeStore));
}));
router.get('/stores/:storeId', requireStoreAccess, (req, res) => ok(res, safeStore(req.store)));
router.get('/stores/:storeId/domain', requireStoreAccess, (req, res) => ok(res, domainService.publicDomain(req.store)));
router.put('/stores/:storeId/domain', requireStoreAccess, asyncHandler(async (req, res) => {
  const requestedMode = String(req.body?.mode || 'path');
  if (requestedMode === 'subdomain') await assertPlanFeature(req.user, 'domain.subdomain');
  if (requestedMode === 'custom') await assertPlanFeature(req.user, 'domain.custom');
  const body = z.object({ mode: z.enum(['path', 'subdomain', 'custom']), subdomain: text(63).optional(), customDomain: text(253).optional() }).parse(req.body);
  const { before, after } = await domainService.configure(req.store, body);
  await audit(req, 'store.domain.updated', 'store', req.store._id, { changes: AuditService.changes({ domain: before }, { domain: after }, ['domain']) });
  ok(res, after);
}));
router.post('/stores/:storeId/domain/verify', requireStoreAccess, asyncHandler(async (req, res) => {
  await assertPlanFeature(req.user, 'domain.custom');
  const before = domainService.publicDomain(req.store);
  const after = await domainService.verify(req.store);
  await audit(req, 'store.domain.verified', 'store', req.store._id, { changes: AuditService.changes({ domain: before }, { domain: after }, ['domain']) });
  ok(res, after);
}));
const pwaSchema = z.object({ name: text(120).min(1), iconUrl: url.default(''), icon192Url: url.default('') });
router.get('/stores/:storeId/pwa', requireStoreAccess, requireFeature('store.pwa'), (req, res) => ok(res, { name: req.store.pwa?.name || req.store.name, iconUrl: req.store.pwa?.iconUrl || '', icon192Url: req.store.pwa?.icon192Url || '', manifestUrl: `/api/public/stores/${req.store.slug}/manifest.webmanifest` }));
router.put('/stores/:storeId/pwa', requireStoreAccess, requireFeature('store.pwa'), asyncHandler(async (req, res) => {
  const body = pwaSchema.parse(req.body); const before = { name: req.store.pwa?.name || '', iconUrl: req.store.pwa?.iconUrl || '', icon192Url: req.store.pwa?.icon192Url || '' };
  if (body.iconUrl || body.icon192Url) {
    const [large, small] = await Promise.all([imageService.validatePwaIcon(req.store._id, body.iconUrl), imageService.validatePwaIcon(req.store._id, body.icon192Url)]);
    if (!large || large.width !== 512 || large.height !== 512 || !small || small.width !== 192 || small.height !== 192) throw new AppError('Volvé a subir el ícono PWA para generar los tamaños 192 × 192 y 512 × 512.', 422, 'INVALID_PWA_ICON');
  }
  req.store.pwa = body; await req.store.save();
  await assetService.markAttached(req.store._id, [body.iconUrl, body.icon192Url]);
  await assetService.cleanupDifference(req.store._id, [before.iconUrl, before.icon192Url], [body.iconUrl, body.icon192Url]);
  await audit(req, 'store.pwa.updated', 'store', req.store._id, { changes: AuditService.changes({ pwa: before }, { pwa: body }, ['pwa']) });
  ok(res, { ...body, manifestUrl: `/api/public/stores/${req.store.slug}/manifest.webmanifest` });
}));
router.put('/stores/:storeId', requireStoreAccess, requireFeature('design.limited'), asyncHandler(async (req, res) => { const body = parsePatch(storeSchema.omit({ ownerId: true }), req.body); ok(res, await updateStore(req, req.store, body)); }));
const jsonSame = (left, right) => JSON.stringify(left) === JSON.stringify(right);
async function assertDesignFeatureChanges(user, before, after) {
  const premiumChanged = !jsonSame(
    { navbar: before.navbar, sections: before.sections, product: before.product, terms: before.terms },
    { navbar: after.navbar, sections: after.sections, product: after.product, terms: after.terms },
  );
  const enterpriseChanged = !jsonSame(
    { cart: before.cart, checkout: before.checkout },
    { cart: after.cart, checkout: after.checkout },
  );
  if (premiumChanged) await assertPlanFeature(user, 'design.premium');
  if (enterpriseChanged) await assertPlanFeature(user, 'design.enterprise');
}
router.put('/stores/:storeId/design', requireStoreAccess, requireFeature('design.limited'), asyncHandler(async (req, res) => {
  const { design } = z.object({ design: z.record(z.string(), z.unknown()) }).parse(req.body);
  const validated = validateDesign(design);
  await imageService.validateWallpapers(req.store._id, validated);
  await imageService.validateDesignAssets(req.store._id, validated);
  const before = normalizeDesign(req.store.design);
  await assertDesignFeatureChanges(req.user, before, validated);
  req.store.design = validated; req.store.markModified('design'); await req.store.save();
  await assetService.markDesignAttached(req.store._id, validated);
  await assetService.cleanupDesignImages(req.store._id, before, validated);
  await audit(req, 'store.design.updated', 'store', req.store._id, { changes: AuditService.changes({ design: before }, { design: validated }) });
  ok(res, safeStore(req.store));
}));
router.get('/stores/:storeId/social', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => {
  const featureKeys = req.user.role === 'admin' ? planFeatureService.allKeys() : await planFeatureService.keysForUser(req.user);
  const allowed = SOCIAL_AD_NETWORKS.filter(network => featureKeys.includes(network.featureKey));
  const statuses = await Promise.all(allowed.map(network => network.service.status(req.store._id)));
  const payload = { networks: allowed.map(({ key, label, featureKey }) => ({ key, label, status: 'available', featureKey })) };
  allowed.forEach((network, index) => { payload[network.key] = statuses[index]; });
  ok(res, payload);
}));
router.post('/stores/:storeId/social/facebook/connect', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => ok(res, await facebookAdsService.createOAuthUrl(req.store, req.user))));
router.post('/stores/:storeId/social/facebook/sandbox', requireAdmin, requireStoreAccess, asyncHandler(async (req, res) => {
  const body = z.object({ accessToken: z.string().trim().min(20).max(4096), adAccountId: text(80).min(1), pageId: text(80).min(1) }).parse(req.body);
  const integration = await facebookAdsService.connectSandbox(req.store, req.user, body);
  await audit(req, 'social.facebook.connected', 'integration', 'facebook', { mode: 'sandbox', adAccountId: integration.selectedAdAccountId, pageId: integration.selectedPageId });
  ok(res, integration);
}));
router.post('/stores/:storeId/social/facebook/refresh', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => ok(res, await facebookAdsService.refresh(req.store._id))));
router.put('/stores/:storeId/social/facebook/assets', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => {
  const body = z.object({ adAccountId: text(80).min(1), pageId: text(80).min(1) }).parse(req.body);
  const integration = await facebookAdsService.selectAssets(req.store._id, body);
  await audit(req, 'social.facebook.assets.updated', 'integration', 'facebook', { adAccountId: integration.selectedAdAccountId, pageId: integration.selectedPageId });
  ok(res, integration);
}));
router.delete('/stores/:storeId/social/facebook', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => {
  const result = await facebookAdsService.disconnect(req.store._id);
  await audit(req, 'social.facebook.disconnected', 'integration', 'facebook');
  ok(res, result);
}));
router.get('/stores/:storeId/social/facebook/products', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => ok(res, await facebookAdsService.products(req.store))));
router.post('/stores/:storeId/social/facebook/ads', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => {
  const body = z.object({ productId: objectId, name: text(120).min(1), primaryText: text(1000).min(1), headline: text(255).min(1), dailyBudget: z.coerce.number().finite().positive().max(999999999), countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default('AR') }).parse(req.body);
  const item = await facebookAdsService.createTrafficAd(req.store, req.user, body);
  await audit(req, 'social.facebook.ad.created', 'social_ad', item._id, { productId: item.productId, campaignId: item.external?.campaignId, adId: item.external?.adId, status: item.status });
  ok(res, item, 201);
}));

router.post('/stores/:storeId/social/instagram/connect', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => ok(res, await instagramAdsService.createOAuthUrl(req.store, req.user))));
router.post('/stores/:storeId/social/instagram/sandbox', requireAdmin, requireStoreAccess, asyncHandler(async (req, res) => {
  const body = z.object({ accessToken: z.string().trim().min(20).max(4096), adAccountId: text(80).min(1), pageId: text(80).min(1), instagramUserId: text(80).min(1) }).parse(req.body);
  const integration = await instagramAdsService.connectSandbox(req.store, req.user, body);
  await audit(req, 'social.instagram.connected', 'integration', 'instagram', { mode: 'sandbox', adAccountId: integration.selectedAdAccountId, pageId: integration.selectedPageId, instagramUserId: integration.selectedInstagramUserId });
  ok(res, integration);
}));
router.post('/stores/:storeId/social/instagram/refresh', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => ok(res, await instagramAdsService.refresh(req.store._id))));
router.put('/stores/:storeId/social/instagram/assets', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => {
  const body = z.object({ adAccountId: text(80).min(1), pageId: text(80).min(1), instagramUserId: text(80).min(1) }).parse(req.body);
  const integration = await instagramAdsService.selectAssets(req.store._id, body);
  await audit(req, 'social.instagram.assets.updated', 'integration', 'instagram', { adAccountId: integration.selectedAdAccountId, pageId: integration.selectedPageId, instagramUserId: integration.selectedInstagramUserId });
  ok(res, integration);
}));
router.delete('/stores/:storeId/social/instagram', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => {
  const result = await instagramAdsService.disconnect(req.store._id);
  await audit(req, 'social.instagram.disconnected', 'integration', 'instagram');
  ok(res, result);
}));
router.get('/stores/:storeId/social/instagram/products', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => ok(res, await instagramAdsService.products(req.store))));
router.post('/stores/:storeId/social/instagram/ads', requireStoreAccess, requireFeature('ads.limited'), asyncHandler(async (req, res) => {
  const body = z.object({ productId: objectId, name: text(120).min(1), primaryText: text(1000).min(1), headline: text(255).min(1), dailyBudget: z.coerce.number().finite().positive().max(999999999), countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default('AR') }).parse(req.body);
  const item = await instagramAdsService.createTrafficAd(req.store, req.user, body);
  await audit(req, 'social.instagram.ad.created', 'social_ad', item._id, { productId: item.productId, campaignId: item.external?.campaignId, adId: item.external?.adId, status: item.status });
  ok(res, item, 201);
}));

const commonProductAdSchema = z.object({ productId: objectId, name: text(120).min(1), primaryText: text(1000).min(1), headline: text(255).min(1), dailyBudget: z.coerce.number().finite().positive().max(999999999), countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default('AR') });
const registerGoogleLikeRoutes = (provider, service) => {
  const feature = socialFeature(provider);
  router.post(`/stores/:storeId/social/${provider}/connect`, requireStoreAccess, requireFeature(feature), asyncHandler(async (req, res) => ok(res, await service.createOAuthUrl(req.store, req.user))));
  router.post(`/stores/:storeId/social/${provider}/refresh`, requireStoreAccess, requireFeature(feature), asyncHandler(async (req, res) => ok(res, await service.refresh(req.store._id))));
  router.put(`/stores/:storeId/social/${provider}/assets`, requireStoreAccess, requireFeature(feature), asyncHandler(async (req, res) => {
    const body = z.object({ adAccountId: text(80).min(1) }).parse(req.body); const integration = await service.selectAssets(req.store._id, body);
    await audit(req, `social.${provider}.assets.updated`, 'integration', provider, { adAccountId: integration.selectedAdAccountId, managerCustomerId: integration.selectedManagerCustomerId || '' }); ok(res, integration);
  }));
  router.delete(`/stores/:storeId/social/${provider}`, requireStoreAccess, requireFeature(feature), asyncHandler(async (req, res) => { const result = await service.disconnect(req.store._id); await audit(req, `social.${provider}.disconnected`, 'integration', provider); ok(res, result); }));
  router.get(`/stores/:storeId/social/${provider}/products`, requireStoreAccess, requireFeature(feature), asyncHandler(async (req, res) => ok(res, await service.products(req.store))));
};
registerGoogleLikeRoutes('google', googleAdsService);
registerGoogleLikeRoutes('youtube', youtubeAdsService);
router.post('/stores/:storeId/social/google/ads', requireStoreAccess, requireFeature('ads.premium'), asyncHandler(async (req, res) => {
  const item = await googleAdsService.createTrafficAd(req.store, req.user, commonProductAdSchema.parse(req.body));
  await audit(req, 'social.google.ad.created', 'social_ad', item._id, { productId: item.productId, campaignId: item.external?.campaignId, adId: item.external?.adId, status: item.status }); ok(res, item, 201);
}));
router.post('/stores/:storeId/social/youtube/ads', requireStoreAccess, requireFeature('ads.enterprise'), asyncHandler(async (req, res) => {
  const body = commonProductAdSchema.extend({ youtubeVideo: text(2048).min(1), logoUrl: z.union([z.string().trim().max(2048).regex(/^https?:\/\//i, 'Usá una URL HTTP/HTTPS.'), z.literal('')]).optional().default('') }).parse(req.body);
  const item = await youtubeAdsService.createTrafficAd(req.store, req.user, body);
  await audit(req, 'social.youtube.ad.created', 'social_ad', item._id, { productId: item.productId, campaignId: item.external?.campaignId, adId: item.external?.adId, status: item.status }); ok(res, item, 201);
}));

router.post('/stores/:storeId/social/tiktok/connect', requireStoreAccess, requireFeature('ads.enterprise'), asyncHandler(async (req, res) => ok(res, await tiktokAdsService.createOAuthUrl(req.store, req.user))));
router.post('/stores/:storeId/social/tiktok/refresh', requireStoreAccess, requireFeature('ads.enterprise'), asyncHandler(async (req, res) => ok(res, await tiktokAdsService.refresh(req.store._id))));
router.put('/stores/:storeId/social/tiktok/assets', requireStoreAccess, requireFeature('ads.enterprise'), asyncHandler(async (req, res) => {
  const body = z.object({ adAccountId: text(80).min(1), identityId: text(160).optional().default(''), identityType: text(80).optional().default('') }).parse(req.body);
  const integration = await tiktokAdsService.selectAssets(req.store._id, body);
  await audit(req, 'social.tiktok.assets.updated', 'integration', 'tiktok', { adAccountId: integration.selectedAdAccountId, identityId: integration.selectedIdentityId, identityType: integration.selectedIdentityType }); ok(res, integration);
}));
router.delete('/stores/:storeId/social/tiktok', requireStoreAccess, requireFeature('ads.enterprise'), asyncHandler(async (req, res) => { const result = await tiktokAdsService.disconnect(req.store._id); await audit(req, 'social.tiktok.disconnected', 'integration', 'tiktok'); ok(res, result); }));
router.get('/stores/:storeId/social/tiktok/products', requireStoreAccess, requireFeature('ads.enterprise'), asyncHandler(async (req, res) => ok(res, await tiktokAdsService.products(req.store))));
router.post('/stores/:storeId/social/tiktok/ads', requireStoreAccess, requireFeature('ads.enterprise'), asyncHandler(async (req, res) => {
  const body = commonProductAdSchema.extend({ videoId: text(160).min(1) }).parse(req.body); const item = await tiktokAdsService.createTrafficAd(req.store, req.user, body);
  await audit(req, 'social.tiktok.ad.created', 'social_ad', item._id, { productId: item.productId, campaignId: item.external?.campaignId, adId: item.external?.adId, status: item.status }); ok(res, item, 201);
}));

const sellerContactSchema = contactSchema.extend({ message: text(1500).default('¡Hola! Quisiera hacer una consulta.'), showWhatsapp: trueBoolean.default(true), showContactForm: trueBoolean.default(false) });
router.put('/stores/:storeId/contact', requireStoreAccess, asyncHandler(async (req, res) => {
  const before = req.store.contact.toObject();
  const contact = sellerContactSchema.parse(req.body.contact);
  const previousWhatsapp = { whatsapp: before.whatsapp || '', message: before.message || '', showWhatsapp: before.showWhatsapp === true };
  const nextWhatsapp = { whatsapp: contact.whatsapp || '', message: contact.message || '', showWhatsapp: contact.showWhatsapp === true };
  const onlyDisabling = previousWhatsapp.showWhatsapp && !nextWhatsapp.showWhatsapp && previousWhatsapp.whatsapp === nextWhatsapp.whatsapp && previousWhatsapp.message === nextWhatsapp.message;
  if (!jsonSame(previousWhatsapp, nextWhatsapp) && !onlyDisabling) await assertPlanFeature(req.user, 'contact.whatsapp');
  req.store.contact = contact; await req.store.save();
  await audit(req, 'store.contact.updated', 'store', req.store._id, { changes: AuditService.changes({ contact: before }, { contact: req.store.contact.toObject() }) });
  ok(res, safeStore(req.store));
}));
const deliverySchema = z.object({ id: text(60).min(1), type: z.enum(['pickup', 'shipping', 'digital', 'custom']), name: text(120).min(1), description: text(1000).default(''), price: money.default(0), active: trueBoolean.default(true) });
const paymentSchema = z.object({ id: text(60).min(1), type: z.enum(['cash', 'transfer', 'mercadopago']), name: text(120).min(1), instructions: text(4000).default(''), deliveryIds: z.array(text(60)).max(20).default([]), active: trueBoolean.default(true), mercadoPagoAccountId: text(80).default(''), bank: z.object({ holder: text(180).optional(), bank: text(180).optional(), cbu: text(40).optional(), alias: text(60).optional(), cuit: text(30).optional() }).optional() });
const mercadoPagoAccountCreateSchema = z.object({ name: text(120).min(1), accessToken: text(1000).min(1).optional(), webhookSecret: text(1000).min(1).optional(), sandbox: trueBoolean.default(true) });
const mercadoPagoAccountUpdateSchema = z.object({ name: text(120).min(1).optional(), accessToken: text(1000).min(1).optional(), webhookSecret: text(1000).min(1).optional(), sandbox: trueBoolean.optional(), clearCredentials: trueBoolean.optional() }).refine(value => Object.keys(value).length > 0, 'No hay cambios para guardar.');

router.post('/stores/:storeId/mercadopago/accounts', requireStoreAccess, requireFeature('payments.mercadopago'), asyncHandler(async (req, res) => {
  const before = safeStore(req.store);
  const item = await mercadoPagoAccountService.create(req.store, mercadoPagoAccountCreateSchema.parse(req.body));
  await audit(req, 'store.mercadopago.account.created', 'store', req.store._id, { accountId: item.id, accountName: item.name, changes: AuditService.changes(before, safeStore(req.store), ['integrations']) });
  ok(res, item, 201);
}));
router.put('/stores/:storeId/mercadopago/accounts/:accountId', requireStoreAccess, requireFeature('payments.mercadopago'), asyncHandler(async (req, res) => {
  const before = safeStore(req.store);
  const item = await mercadoPagoAccountService.update(req.store, req.params.accountId, mercadoPagoAccountUpdateSchema.parse(req.body));
  await audit(req, 'store.mercadopago.account.updated', 'store', req.store._id, { accountId: item.id, accountName: item.name, credentialsUpdated: Boolean(req.body.accessToken || req.body.webhookSecret || req.body.clearCredentials), changes: AuditService.changes(before, safeStore(req.store), ['integrations']) });
  ok(res, item);
}));
router.delete('/stores/:storeId/mercadopago/accounts/:accountId', requireStoreAccess, requireFeature('payments.mercadopago'), asyncHandler(async (req, res) => {
  const before = safeStore(req.store);
  const result = await mercadoPagoAccountService.remove(req.store, req.params.accountId);
  await audit(req, 'store.mercadopago.account.removed', 'store', req.store._id, { accountId: req.params.accountId, changes: AuditService.changes(before, safeStore(req.store), ['integrations']) });
  ok(res, result);
}));

router.put('/stores/:storeId/payments', requireStoreAccess, asyncHandler(async (req, res) => {
  const body = z.object({ expectedUpdatedAt: z.string().datetime().optional(), payments: z.array(paymentSchema).max(20), deliveries: z.array(deliverySchema).max(20), mercadopago: z.object({ accessToken: text(1000).optional(), webhookSecret: text(1000).optional(), sandbox: trueBoolean.optional(), clearCredentials: trueBoolean.optional() }).optional() }).parse(req.body);
  if (body.expectedUpdatedAt && new Date(body.expectedUpdatedAt).getTime() !== req.store.updatedAt.getTime()) throw new AppError('La configuración de la tienda cambió. Recargá e intentá nuevamente.', 409, 'STORE_CONFLICT');
  if (new Set(body.payments.map(item => item.id)).size !== body.payments.length || new Set(body.deliveries.map(item => item.id)).size !== body.deliveries.length) throw new AppError('Los identificadores de cobros y entregas deben ser únicos.', 422);
  const deliveryIds = new Set(body.deliveries.map(item => item.id));
  if (body.payments.some(payment => payment.deliveryIds.some(id => !deliveryIds.has(id)))) throw new AppError('Un medio de pago referencia una entrega que no existe.', 422);

  const entitlement = await EntitlementService.forUser(req.user);
  commercePlanLimitService.assertUpdate({ currentPayments: req.store.payments || [], currentDeliveries: req.store.deliveries || [], nextPayments: body.payments, nextDeliveries: body.deliveries, entitlement });

  const currentPayments = (req.store.payments || []).map(item => item.toObject ? item.toObject() : item);
  const currentMercadoPago = currentPayments.filter(item => item.type === 'mercadopago');
  const nextMercadoPago = body.payments.filter(item => item.type === 'mercadopago');
  const credentialsChanged = Boolean(body.mercadopago && (body.mercadopago.clearCredentials || body.mercadopago.accessToken || body.mercadopago.webhookSecret || body.mercadopago.sandbox !== undefined));
  // Un downgrade nunca debe dejar al vendedor atrapado: quitar/convertir una forma
  // Checkout Pro o simplemente deshabilitarla sigue permitido. Crear, reactivar o
  // modificar una forma que use Mercado Pago sí requiere la funcionalidad del plan.
  const mercadoPagoRequiresFeature = credentialsChanged || nextMercadoPago.some(next => {
    const current = currentMercadoPago.find(item => item.id === next.id);
    if (!current) return true;
    if (jsonSame(current, next)) return false;
    const disabledOnly = current.active === true && next.active === false && jsonSame({ ...current, active: false }, next);
    return !disabledOnly;
  });
  if (mercadoPagoRequiresFeature) await assertPlanFeature(req.user, 'payments.mercadopago');

  const before = safeStore(req.store);
  req.store.payments = body.payments;
  req.store.deliveries = body.deliveries;
  if (body.mercadopago) await mercadoPagoAccountService.applyLegacyPayload(req.store, body.mercadopago);

  const accounts = mercadoPagoAccountService.safeAccounts(req.store);
  for (const payment of req.store.payments || []) {
    if (payment.type !== 'mercadopago') { payment.mercadoPagoAccountId = ''; continue; }
    if (!payment.mercadoPagoAccountId && accounts.length === 1) payment.mercadoPagoAccountId = accounts[0].id;
    if (!payment.mercadoPagoAccountId) throw new AppError('Seleccioná una cuenta de Mercado Pago para cada forma de pago Checkout Pro.', 422, 'MP_ACCOUNT_REQUIRED');
    if (!accounts.some(account => account.id === String(payment.mercadoPagoAccountId))) throw new AppError('La cuenta de Mercado Pago seleccionada no existe.', 422, 'MP_ACCOUNT_NOT_FOUND');
    if (payment.active && !mercadoPagoAccountService.configured(req.store, payment.mercadoPagoAccountId)) throw new AppError('La cuenta de Mercado Pago seleccionada no está completamente configurada.', 422, 'MP_NOT_CONFIGURED');
  }

  await req.store.save();
  await audit(req, 'store.payments.updated', 'store', req.store._id, { changes: AuditService.changes(before, safeStore(req.store), ['payments', 'deliveries', 'integrations']), credentialsUpdated: credentialsChanged });
  ok(res, safeStore(req.store));
}));
async function sellerSubscriptionPayload(user, { sync = false } = {}) {
  if (user.role !== 'vendedor') throw new AppError('Esta sección corresponde a vendedores.', 403, 'FORBIDDEN');
  if (sync) await subscriptionService.syncCurrent(user._id);
  const freshUser = await User.findById(user._id); const settings = await SettingsService.get();
  const [planRow, planRows, summary, entitlement] = await Promise.all([
    freshUser.planId ? Plan.findById(freshUser.planId).lean() : null,
    Plan.find({ active: true, price: { $gt: 0 }, $or: [{ visible: { $ne: false } }, ...(freshUser.planId ? [{ _id: freshUser.planId }] : [])] }).sort({ sortOrder: 1, price: 1 }).lean(),
    subscriptionService.summaryForUser(freshUser, { settings }),
    EntitlementService.forUser(freshUser),
  ]);
  const [plan, plans] = await Promise.all([
    planRow ? planFeatureService.present(planRow) : null,
    planFeatureService.presentMany(planRows),
  ]);
  const safeSettings = await adminSettingsPayload();
  return { user: safeUser(freshUser), plan, plans, subscription: summary, entitlement, contact: settings.contact, subscriptionsEnabled: Boolean(safeSettings.data.platformBilling?.enabled && safeSettings.data.platformBilling?.mercadopago?.hasAccessToken && safeSettings.data.platformBilling?.mercadopago?.hasWebhookSecret), graceDays: settings.subscriptionGraceDays, pendingLinkHours: settings.subscriptionPendingLinkHours || 24 };
}
router.get('/me/store-transfers', requireAuth, asyncHandler(async (req, res) => ok(res, await storeTransferService.summary(req.user))));
router.get('/me/store-transfers/history', requireAuth, requireFeature('stores.transfer'), asyncHandler(async (req, res) => {
  const { page, limit } = pagination(req.query);
  const result = await storeTransferService.transferredHistory(req.user, { page, limit, search: req.query.search });
  ok(res, result.rows, 200, { page: result.page, limit: result.limit, total: result.total });
}));
router.post('/me/store-transfers', requireAuth, requireFeature('stores.transfer'), asyncHandler(async (req, res) => {
  const body = z.object({ storeId: objectId, recipientEmail: email }).parse(req.body);
  const item = await storeTransferService.create(req.user, body);
  await audit(req, 'store.transfer.created', 'store_transfer', item._id, { storeId: item.storeId, recipientEmail: item.recipientEmail, kind: item.kind }, item.storeId);
  ok(res, await storeTransferService.summary(req.user), 201);
}));
router.post('/me/store-transfers/:id/cancel', requireAuth, asyncHandler(async (req, res) => {
  const item = await storeTransferService.cancel(req.user, req.params.id);
  await audit(req, 'store.transfer.cancelled', 'store_transfer', item._id, { storeId: item.storeId, recipientEmail: item.recipientEmail }, item.storeId);
  ok(res, await storeTransferService.summary(req.user));
}));
router.post('/me/store-transfers/:id/accept', requireAuth, asyncHandler(async (req, res) => {
  const result = await storeTransferService.accept(req.user, req.params.id);
  await audit(req, 'store.transfer.accepted', 'store_transfer', result.transfer._id, { storeId: result.store._id, previousOwnerId: result.transfer.fromUserId, newOwnerId: req.user._id }, result.store._id);
  ok(res, await storeTransferService.summary(req.user));
}));
router.post('/me/store-transfers/:id/return', requireAuth, asyncHandler(async (req, res) => {
  const item = await storeTransferService.createReturn(req.user, req.params.id);
  await audit(req, 'store.transfer.return.created', 'store_transfer', item._id, { storeId: item.storeId, recipientEmail: item.recipientEmail, previousTransferId: req.params.id }, item.storeId);
  ok(res, await storeTransferService.summary(req.user), 201);
}));

router.get('/me/plan', requireAuth, asyncHandler(async (req, res) => ok(res, await sellerSubscriptionPayload(req.user))));
router.get('/me/subscription', requireAuth, asyncHandler(async (req, res) => ok(res, await sellerSubscriptionPayload(req.user))));
router.post('/me/subscription/checkout', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'vendedor') throw new AppError('Esta sección corresponde a vendedores.', 403, 'FORBIDDEN');
  const { planId, payerEmail } = z.object({ planId: objectId, payerEmail: email.optional() }).parse(req.body);
  const result = await subscriptionService.createCheckout(req.user, planId, { payerEmail: payerEmail || req.user.email });
  await audit(req, 'subscription.checkout.created', 'subscription', result.subscription._id, { planId });
  ok(res, { checkoutUrl: result.checkoutUrl });
}));
router.post('/me/subscription/sync', requireAuth, asyncHandler(async (req, res) => { await subscriptionService.syncCurrent(req.user._id); ok(res, await sellerSubscriptionPayload(req.user)); }));
router.post('/me/subscription/cancel', requireAuth, asyncHandler(async (req, res) => {
  const item = await subscriptionService.cancelAtPeriodEnd(req.user._id); await audit(req, 'subscription.cancelled', 'subscription', item._id, { effectiveAt: item.currentPeriodEnd }); ok(res, await sellerSubscriptionPayload(req.user));
}));
router.post('/me/subscription/resume', requireAuth, asyncHandler(async (req, res) => {
  const item = await subscriptionService.resume(req.user._id); await audit(req, 'subscription.resumed', 'subscription', item._id); ok(res, await sellerSubscriptionPayload(req.user));
}));
router.post('/me/subscription/recover', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'vendedor') throw new AppError('Esta sección corresponde a vendedores.', 403, 'FORBIDDEN');
  const { payerEmail } = z.object({ payerEmail: email.optional() }).parse(req.body || {});
  const result = await subscriptionService.recover(req.user, { payerEmail: payerEmail || req.user.email });
  await audit(req, 'subscription.recovery.created', 'subscription', result.subscription._id, { replacedProviderSubscription: true });
  ok(res, { checkoutUrl: result.checkoutUrl });
}));
router.post('/me/subscription/detach', requireAuth, asyncHandler(async (req, res) => {
  const item = await subscriptionService.detach(req.user._id); await audit(req, 'subscription.detached', 'subscription', item._id); ok(res, await sellerSubscriptionPayload(req.user));
}));
router.post('/me/subscription/pending/cancel', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'vendedor') throw new AppError('Esta sección corresponde a vendedores.', 403, 'FORBIDDEN');
  const item = await subscriptionService.cancelPendingForUser(req.user._id, { reason: 'seller' });
  await audit(req, 'subscription.pending.cancelled', 'subscription', item._id, { reason: 'seller' });
  ok(res, await sellerSubscriptionPayload(req.user));
}));
router.post('/me/subscription/pending/help', requireAuth, subscriptionSupportUpload.single('file'), asyncHandler(async (req, res) => {
  if (req.user.role !== 'vendedor') throw new AppError('Esta sección corresponde a vendedores.', 403, 'FORBIDDEN');
  const note = text(2000).default('').parse(req.body?.note || '');
  const item = await subscriptionSupportService.create(req.user._id, req.file, { note });
  await audit(req, 'subscription.support.created', 'subscription_support', item._id, { subscriptionId: item.subscriptionId });
  ok(res, await sellerSubscriptionPayload(req.user), 201);
}));
router.post('/webhooks/platform/mercadopago', asyncHandler(async (req, res) => ok(res, await subscriptionService.webhook(req))));

const categorySchema = z.object({ name: text(120).min(1), description: text(3000).default(''), parentId: objectId.nullable().default(null), active: trueBoolean.default(true) });
router.get('/stores/:storeId/categories', requireStoreAccess, requireAnyFeature(['management.categories', 'management.products', 'design.limited']), asyncHandler((req, res) => {
  const parentFilter = req.query.parentId === 'null' || req.query.parentId === 'root' ? { parentId: null } : req.query.parentId ? { parentId: objectId.parse(req.query.parentId) } : {};
  return listResponse(res, Category, { storeId: req.store._id, archived: { $ne: true }, ...parentFilter, ...searchFilter(req.query, ['name', 'description']) }, req.query, { sort: { name: 1, _id: 1 } });
}));
router.get('/stores/:storeId/categories/:id', requireStoreAccess, requireFeature('management.categories'), asyncHandler(async (req, res) => ok(res, safeCategory(await categoryService.find(req.store._id, req.params.id)))));
router.post('/stores/:storeId/categories', requireStoreAccess, requireFeature('management.categories'), asyncHandler(async (req, res) => { const item = await categoryService.create(req.store._id, categorySchema.parse(req.body)); await audit(req, 'category.created', 'category', item._id, { changes: AuditService.changes({}, item, ['name', 'description', 'parentId', 'active']) }); ok(res, item, 201); }));
router.put('/stores/:storeId/categories/:id', requireStoreAccess, requireFeature('management.categories'), asyncHandler(async (req, res) => {
  const { item, before } = await categoryService.update(req.store._id, req.params.id, parsePatch(categorySchema, req.body), { includeBefore: true });
  await audit(req, 'category.updated', 'category', item._id, { changes: AuditService.changes(before, item, ['name', 'description', 'parentId', 'active']) }); ok(res, item);
}));
router.delete('/stores/:storeId/categories/:id', requireStoreAccess, requireFeature('management.categories'), asyncHandler(async (req, res) => {
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
router.get('/stores/:storeId/products', requireStoreAccess, requireAnyFeature(['management.products', 'management.orders', 'design.limited']), asyncHandler(async (req, res) => listResponse(res, Product, { storeId: req.store._id, archived: { $ne: true }, ...await categoryService.productFilter(req.store._id, req.query), ...searchFilter(req.query, ['name', 'description', 'variants.sku']) }, req.query, { select: '-reservations' })));
router.get('/stores/:storeId/products/:id', requireStoreAccess, requireFeature('management.products'), asyncHandler(async (req, res) => { const item = await Product.findOne({ _id: req.params.id, storeId: req.store._id, archived: { $ne: true } }).select('+digitalUrl -reservations'); if (!item) throw new AppError('Producto no encontrado.', 404); ok(res, item); }));
router.post('/stores/:storeId/products', requireStoreAccess, requireFeature('management.products'), asyncHandler(async (req, res) => {
  const body = productSchema.parse(req.body); await validateProduct(body, req.store._id);
  await assetService.assertOwned(req.store._id, body.images);
  const item = await quotaService.createProduct(req.store._id, body); await assetService.markAttached(req.store._id, item.images); await audit(req, 'product.created', 'product', item._id, { changes: AuditService.changes({}, item, Object.keys(productSchema.shape)) }); ok(res, item, 201);
}));
router.put('/stores/:storeId/products/:id', requireStoreAccess, requireFeature('management.products'), asyncHandler(async (req, res) => {
  const patch = parsePatch(productSchema, req.body);
  const currentForPlan = await Product.findOne({ _id: req.params.id, storeId: req.store._id, archived: { $ne: true } }).select('+digitalUrl -reservations');
  if (!currentForPlan) throw new AppError('Producto no encontrado.', 404);
  if (Object.keys(patch).length === 1 && Object.hasOwn(patch, 'featured')) {
    // La acción de destacado no reemplaza variantes ni cantidades leídas antes.
    // Se versiona para que una edición completa anterior detecte el cambio.
    const before = await Product.findOneAndUpdate({ _id: req.params.id, storeId: req.store._id, archived: { $ne: true } }, { $set: { featured: patch.featured }, $inc: { stockVersion: 1 } }, { returnDocument: 'before', runValidators: true }).select('+digitalUrl -reservations');
    if (!before) throw new AppError('Producto no encontrado.', 404);
    const item = await Product.findById(before._id).select('+digitalUrl -reservations');
    await audit(req, 'product.featured.updated', 'product', before._id, { changes: AuditService.changes(before, { featured: patch.featured }, ['featured']) }); ok(res, item); return;
  }
  const current = currentForPlan;
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
router.delete('/stores/:storeId/products/:id', requireStoreAccess, requireFeature('management.products'), asyncHandler(async (req, res) => {
  const before = await Product.findOneAndUpdate({ _id: req.params.id, storeId: req.store._id }, { $set: { active: false, archived: true }, $inc: { stockVersion: 1 } }, { returnDocument: 'before' });
  if (!before) throw new AppError('Producto no encontrado.', 404);
  await assetService.cleanupProductImages(before, []);
  await audit(req, 'product.archived', 'product', before._id, { changes: AuditService.changes(before, { active: false, archived: true }, ['active', 'archived']) }); ok(res, await Product.findById(before._id).select('-reservations'));
}));
router.get('/me/bug-reports', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'vendedor') throw new AppError('Esta sección está disponible para vendedores.', 403, 'BUG_REPORT_SELLER_ONLY');
  ok(res, await bugReportService.listForUser(req.user._id, { limit: req.query.limit }));
}));
router.get('/me/bug-reports/:id/attachments/:attachmentId', requireAuth, asyncHandler(async (req, res) => {
  const file = await bugReportService.attachment(req.params.id, req.params.attachmentId, req.user);
  res.set('Cache-Control', 'private, no-store').set('X-Content-Type-Options', 'nosniff').type(file.mimeType).set('Content-Disposition', 'inline').send(file.body);
}));
router.post('/me/bug-reports', requireAuth, bugReportUpload.array('files', 5), asyncHandler(async (req, res) => {
  const body = z.object({ comment: text(5000).min(10), storeId: z.union([objectId, z.literal('')]).optional() }).parse(req.body);
  const item = await bugReportService.create(req.user, body, req.files || []);
  await audit(req, 'bug_report.created', 'bug_report', item._id, { attachments: item.attachments?.length || 0 }, item.storeId?._id || item.storeId || null);
  ok(res, { ...item, notification: 'Gracias por reportar el error. Tendremos información en próximas novedades de versión.' }, 201);
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 5 * 1024 * 1024 }, fileFilter(_req, file, cb) { if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(new AppError('Solo imágenes JPG, PNG o WebP.', 422)); cb(null, true); } });
router.post('/stores/:storeId/uploads', requireStoreAccess, requireAnyFeature(['management.products','design.limited','store.pwa']), upload.array('files', 5), asyncHandler(async (req, res) => {
  const purpose = req.body.purpose === undefined ? 'image' : z.string().max(40).parse(req.body.purpose);
  const result = await imageService.upload({ files: req.files, purpose, storeId: req.store._id, actorId: req.user._id });
  await audit(req, purpose.startsWith('wallpaper-') ? 'wallpaper.uploaded' : 'image.uploaded', 'store', req.store._id, { count: result.length, purpose, images: result.map(({ width, height }) => ({ width, height })) });
  ok(res, result, 201);
}));
router.delete('/stores/:storeId/uploads', requireStoreAccess, requireAnyFeature(['management.products','design.limited','store.pwa']), asyncHandler(async (req, res) => {
  const { urls } = z.object({ urls: z.array(z.string().max(2048)).max(50) }).parse(req.body);
  const result = await assetService.deleteUnclaimed(req.store._id, urls);
  ok(res, result);
}));

router.get('/admin/dashboard', requireAdmin, asyncHandler(async (_req, res) => {
  const { Order } = await import('../models/commerce.js');
  const [users, stores, activeStores, products, paid, recentOrders, activity, salesSeries, subscriptions] = await Promise.all([
    User.countDocuments({ role: 'vendedor', active: true }), Store.countDocuments({ archived: { $ne: true } }), Store.countDocuments({ active: true, archived: { $ne: true } }), Product.countDocuments({ archived: { $ne: true } }),
    Order.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$total' }, productsSold: { $sum: { $sum: '$items.quantity' } } } }]),
    Order.find({ status: { $ne: 'creating' } }).sort({ createdAt: -1 }).limit(7).select('number total status createdAt storeId customer.name').populate('storeId', 'name').lean(),
    AuditService.recent(10),
    Order.aggregate([{ $match: { status: 'paid', paidAt: { $gte: new Date(Date.now() - 30 * 86400000) } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: 'America/Argentina/Buenos_Aires' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    adminDashboardService.subscriptionSummary(),
  ]);
  ok(res, { users, stores, activeStores, products, paidOrders: paid[0]?.count || 0, revenue: paid[0]?.revenue || 0, productsSold: paid[0]?.productsSold || 0, recentOrders, activity, salesSeries, subscriptions });
}));
export default router;
