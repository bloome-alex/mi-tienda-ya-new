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
import { sellerMailService } from '../services/SellerMailService.js';
import { planFeatureService } from '../services/PlanFeatureService.js';
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
const assertPlanFeature = async (user, featureKey) => { if (user?.role === 'admin' || await planFeatureService.has(user, featureKey)) return; const label = planFeatureService.label(featureKey); throw new AppError(`Tu plan no incluye ${label}.`, 403, 'PLAN_FEATURE_REQUIRED', { featureKey, label }); };
const authLimiter = rateLimit({ windowMs: 15 * 60000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Demasiados intentos. Esperá unos minutos.' } } });

router.get('/public/config', asyncHandler(async (_req, res) => {
  const settings = await SettingsService.get();
  const rows = await Plan.find({ active: true }).sort({ sortOrder: 1, price: 1 }).lean();
  const plans = await planFeatureService.presentMany(rows);
  ok(res, { trialDays: settings.trialDays, contact: settings.contact, home: settings.home, plans });
}));
router.get('/public/stores/:slug/manifest.webmanifest', asyncHandler(async (req, res) => {
  const store = await Store.findOne({ slug: req.params.slug, archived: { $ne: true } }).lean();
  if (!store) throw new AppError('Tienda no encontrada.', 404, 'STORE_NOT_FOUND');
  const owner = await User.findById(store.ownerId);
  if (!owner || !await planFeatureService.has(owner, 'section.pwa')) throw new AppError('La aplicación PWA no está incluida en el plan de esta tienda.', 404, 'PWA_NOT_AVAILABLE');
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
  durationDays: integer(3660).refine(n => n > 0).default(30), featureKeys: z.array(featureKey).max(100).default([]),
  inheritsPlanId: objectId.nullable().optional().default(null), maxStores: integer(1000).refine(n => n > 0).default(1),
  maxProducts: integer().default(100), active: trueBoolean.default(true), featured: trueBoolean.default(false),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
});
const planPayload = body => {
  const payload = { ...body };
  if (Object.prototype.hasOwnProperty.call(body, 'featureKeys')) {
    payload.featureKeys = planFeatureService.normalize(body.featureKeys);
    payload.features = payload.featureKeys.map(key => planFeatureService.label(key));
  }
  return payload;
};
router.get('/admin/plan-features', requireAdmin, asyncHandler(async (_req, res) => {
  const rows = await Plan.find({}).sort({ sortOrder: 1, price: 1, createdAt: 1 }).lean();
  ok(res, { groups: planFeatureService.catalog(), plans: await planFeatureService.presentMany(rows, { admin: true }) });
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
  await planFeatureService.assertDependencies({ featureKeys: body.featureKeys, inheritsPlanId: body.inheritsPlanId });
  const item = await Plan.create(planPayload(body));
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
  await planFeatureService.assertDependencies({ featureKeys: nextFeatures, inheritsPlanId: nextParent });
  const payload = planPayload(body);
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
  if (!settings) { await SettingsService.get(); settings = await Settings.findOne({ key: 'global' }).select('+platformBilling.mercadopago.accessToken +platformBilling.mercadopago.webhookSecret'); }
  const data = settings.toObject(); const mp = data.platformBilling?.mercadopago || {};
  data.platformBilling = { enabled: Boolean(data.platformBilling?.enabled), mercadopago: { sandbox: mp.sandbox !== false, hasAccessToken: Boolean(mp.accessToken), hasWebhookSecret: Boolean(mp.webhookSecret) } };
  data.subscriptionWebhookUrl = `${config.appUrl}/api/webhooks/platform/mercadopago`;
  return { settings, data };
}
router.get('/admin/settings', requireAdmin, asyncHandler(async (_req, res) => { const { data } = await adminSettingsPayload(); ok(res, data); }));
router.put('/admin/settings', requireAdmin, asyncHandler(async (req, res) => {
  const billingSchema = z.object({ enabled: trueBoolean.optional(), mercadopago: z.object({ accessToken: text(1200).optional(), webhookSecret: text(1200).optional(), sandbox: trueBoolean.optional(), clearCredentials: trueBoolean.optional() }).optional() }).optional();
  const body = z.object({ trialDays: integer(365).optional(), magicLinkMinutes: integer(1440).refine(n => n >= 1).optional(), subscriptionGraceDays: integer(3650).optional(), platformBilling: billingSchema, contact: contactSchema.partial().optional(), home: homeSchema.optional() }).parse(req.body);
  const { settings } = await adminSettingsPayload(); const beforeSafe = (await adminSettingsPayload()).data;
  if (body.trialDays !== undefined) settings.trialDays = body.trialDays;
  if (body.magicLinkMinutes !== undefined) settings.magicLinkMinutes = body.magicLinkMinutes;
  if (body.subscriptionGraceDays !== undefined) settings.subscriptionGraceDays = body.subscriptionGraceDays;
  if (body.contact) settings.contact = { ...settings.contact.toObject(), ...Object.fromEntries(Object.keys(req.body.contact).filter(key => Object.hasOwn(body.contact, key)).map(key => [key, body.contact[key]])) };
  if (body.home) { settings.home = { ...settings.home, ...body.home }; settings.markModified('home'); }
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
  await audit(req, 'settings.updated', 'settings', settings._id, { changes: AuditService.changes(beforeSafe, afterSafe, ['trialDays', 'magicLinkMinutes', 'subscriptionGraceDays', 'contact', 'home', 'platformBilling']), billingCredentialsUpdated });
  ok(res, afterSafe);
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
  await domainService.deprovisionStore(before);
  await audit(req, 'store.archived', 'store', before._id, { changes: AuditService.changes(before, { active: false, archived: true }, ['active', 'archived']) }, before._id); ok(res, safeStore(await Store.findById(before._id)));
}));
router.get('/stores', requireAuth, asyncHandler(async (req, res) => {
  const filter = { archived: { $ne: true }, ...(req.user.role === 'admin' ? {} : { ownerId: req.user._id }) };
  const items = await Store.find(filter).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret').sort({ createdAt: 1 }); ok(res, items.map(safeStore));
}));
router.get('/stores/:storeId', requireStoreAccess, (req, res) => ok(res, safeStore(req.store)));
router.get('/stores/:storeId/domain', requireStoreAccess, requireFeature('section.domain'), (req, res) => ok(res, domainService.publicDomain(req.store)));
router.put('/stores/:storeId/domain', requireStoreAccess, requireFeature('section.domain'), asyncHandler(async (req, res) => {
  const requestedMode = String(req.body?.mode || 'path');
  if (requestedMode === 'subdomain') await assertPlanFeature(req.user, 'domain.subdomain');
  if (requestedMode === 'custom') await assertPlanFeature(req.user, 'domain.custom');
  const body = z.object({ mode: z.enum(['path', 'subdomain', 'custom']), subdomain: text(63).optional(), customDomain: text(253).optional() }).parse(req.body);
  const { before, after } = await domainService.configure(req.store, body);
  await audit(req, 'store.domain.updated', 'store', req.store._id, { changes: AuditService.changes({ domain: before }, { domain: after }, ['domain']) });
  ok(res, after);
}));
router.post('/stores/:storeId/domain/verify', requireStoreAccess, requireFeature('section.domain'), asyncHandler(async (req, res) => {
  await assertPlanFeature(req.user, 'domain.custom');
  const before = domainService.publicDomain(req.store);
  const after = await domainService.verify(req.store);
  await audit(req, 'store.domain.verified', 'store', req.store._id, { changes: AuditService.changes({ domain: before }, { domain: after }, ['domain']) });
  ok(res, after);
}));
const pwaSchema = z.object({ name: text(120).min(1), iconUrl: url.default(''), icon192Url: url.default('') });
router.get('/stores/:storeId/pwa', requireStoreAccess, requireFeature('section.pwa'), (req, res) => ok(res, { name: req.store.pwa?.name || req.store.name, iconUrl: req.store.pwa?.iconUrl || '', icon192Url: req.store.pwa?.icon192Url || '', manifestUrl: `/api/public/stores/${req.store.slug}/manifest.webmanifest` }));
router.put('/stores/:storeId/pwa', requireStoreAccess, requireFeature('section.pwa'), asyncHandler(async (req, res) => {
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
router.put('/stores/:storeId', requireStoreAccess, requireFeature('section.design'), asyncHandler(async (req, res) => { const body = parsePatch(storeSchema.omit({ ownerId: true }), req.body); ok(res, await updateStore(req, req.store, body)); }));
const jsonSame = (left, right) => JSON.stringify(left) === JSON.stringify(right);
async function assertDesignFeatureChanges(user, before, after) {
  const checks = [
    ['design.custom_sections', before.sections, after.sections],
    ['design.theme_modes', { colorMode: before.brand?.colorMode, allowThemeToggle: before.brand?.allowThemeToggle, darkPrimary: before.brand?.darkPrimary, darkAccent: before.brand?.darkAccent, darkBackground: before.brand?.darkBackground, darkText: before.brand?.darkText }, { colorMode: after.brand?.colorMode, allowThemeToggle: after.brand?.allowThemeToggle, darkPrimary: after.brand?.darkPrimary, darkAccent: after.brand?.darkAccent, darkBackground: after.brand?.darkBackground, darkText: after.brand?.darkText }],
    ['design.backgrounds', before.wallpaper, after.wallpaper],
    ['design.social_links', { sections: (before.sections || []).filter(item => item.type === 'social'), links: (before.navbar?.links || []).filter(item => item.target === 'social') }, { sections: (after.sections || []).filter(item => item.type === 'social'), links: (after.navbar?.links || []).filter(item => item.target === 'social') }],
    ['design.category_navigation', { navigation: before.shop?.categoryNavigation, animation: before.shop?.categoryPanelAnimation, duration: before.shop?.categoryPanelDuration }, { navigation: after.shop?.categoryNavigation, animation: after.shop?.categoryPanelAnimation, duration: after.shop?.categoryPanelDuration }],
    ['checkout.terms', { terms: before.terms, url: before.checkout?.termsUrl, label: before.checkout?.termsLabel }, { terms: after.terms, url: after.checkout?.termsUrl, label: after.checkout?.termsLabel }],
  ];
  for (const [featureKey, previous, next] of checks) if (!jsonSame(previous, next)) await assertPlanFeature(user, featureKey);
}
router.put('/stores/:storeId/design', requireStoreAccess, requireFeature('section.design'), asyncHandler(async (req, res) => {
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
const sellerContactSchema = contactSchema.extend({ message: text(1500).default('¡Hola! Quisiera hacer una consulta.'), showWhatsapp: trueBoolean.default(true), showContactForm: trueBoolean.default(false) });
router.put('/stores/:storeId/contact', requireStoreAccess, requireFeature('section.contact'), asyncHandler(async (req, res) => { const before = req.store.contact.toObject(); const contact = sellerContactSchema.parse(req.body.contact); if (contact.showWhatsapp) await assertPlanFeature(req.user, 'contact.whatsapp'); req.store.contact = contact; await req.store.save(); await audit(req, 'store.contact.updated', 'store', req.store._id, { changes: AuditService.changes({ contact: before }, { contact: req.store.contact.toObject() }) }); ok(res, safeStore(req.store)); }));
const deliverySchema = z.object({ id: text(60).min(1), type: z.enum(['pickup', 'shipping', 'digital', 'custom']), name: text(120).min(1), description: text(1000).default(''), price: money.default(0), active: trueBoolean.default(true) });
const paymentSchema = z.object({ id: text(60).min(1), type: z.enum(['cash', 'transfer', 'mercadopago']), name: text(120).min(1), instructions: text(4000).default(''), deliveryIds: z.array(text(60)).max(20).default([]), active: trueBoolean.default(true), bank: z.object({ holder: text(180).optional(), bank: text(180).optional(), cbu: text(40).optional(), alias: text(60).optional(), cuit: text(30).optional() }).optional() });
router.put('/stores/:storeId/payments', requireStoreAccess, requireFeature('section.payments'), asyncHandler(async (req, res) => {
  const body = z.object({ expectedUpdatedAt: z.string().datetime().optional(), payments: z.array(paymentSchema).max(20), deliveries: z.array(deliverySchema).max(20), mercadopago: z.object({ accessToken: text(1000).optional(), webhookSecret: text(1000).optional(), sandbox: trueBoolean.optional(), clearCredentials: trueBoolean.optional() }).optional() }).parse(req.body);
  if (body.expectedUpdatedAt && new Date(body.expectedUpdatedAt).getTime() !== req.store.updatedAt.getTime()) throw new AppError('La configuración de la tienda cambió. Recargá e intentá nuevamente.', 409, 'STORE_CONFLICT');
  if (new Set(body.payments.map(item => item.id)).size !== body.payments.length || new Set(body.deliveries.map(item => item.id)).size !== body.deliveries.length) throw new AppError('Los identificadores de cobros y entregas deben ser únicos.', 422);
  const deliveryIds = new Set(body.deliveries.map(item => item.id));
  if (body.payments.some(payment => payment.deliveryIds.some(id => !deliveryIds.has(id)))) throw new AppError('Un medio de pago referencia una entrega que no existe.', 422);
  for (const payment of body.payments.filter(item => item.active)) await assertPlanFeature(req.user, `payments.${payment.type}`);
  const currentDeliveries = (req.store.deliveries || []).map(item => item.toObject ? item.toObject() : item);
  if (!jsonSame(currentDeliveries, body.deliveries)) await assertPlanFeature(req.user, 'payments.delivery');
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
async function sellerSubscriptionPayload(user, { sync = false } = {}) {
  if (user.role !== 'vendedor') throw new AppError('Esta sección corresponde a vendedores.', 403, 'FORBIDDEN');
  if (sync) await subscriptionService.syncCurrent(user._id);
  const freshUser = await User.findById(user._id); const settings = await SettingsService.get();
  const [planRow, planRows, summary, entitlement] = await Promise.all([
    freshUser.planId ? Plan.findById(freshUser.planId).lean() : null,
    Plan.find({ active: true, price: { $gt: 0 } }).sort({ sortOrder: 1, price: 1 }).lean(),
    subscriptionService.summaryForUser(freshUser, { settings }),
    EntitlementService.forUser(freshUser),
  ]);
  const [plan, plans] = await Promise.all([
    planRow ? planFeatureService.present(planRow) : null,
    planFeatureService.presentMany(planRows),
  ]);
  const safeSettings = await adminSettingsPayload();
  return { user: safeUser(freshUser), plan, plans, subscription: summary, entitlement, contact: settings.contact, subscriptionsEnabled: Boolean(safeSettings.data.platformBilling?.enabled && safeSettings.data.platformBilling?.mercadopago?.hasAccessToken && safeSettings.data.platformBilling?.mercadopago?.hasWebhookSecret), graceDays: settings.subscriptionGraceDays };
}
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
router.post('/me/subscription/detach', requireAuth, asyncHandler(async (req, res) => {
  const item = await subscriptionService.detach(req.user._id); await audit(req, 'subscription.detached', 'subscription', item._id); ok(res, await sellerSubscriptionPayload(req.user));
}));
router.post('/webhooks/platform/mercadopago', asyncHandler(async (req, res) => ok(res, await subscriptionService.webhook(req))));

const categorySchema = z.object({ name: text(120).min(1), description: text(3000).default(''), parentId: objectId.nullable().default(null), active: trueBoolean.default(true) });
router.get('/stores/:storeId/categories', requireStoreAccess, requireFeature('section.categories'), asyncHandler((req, res) => {
  const parentFilter = req.query.parentId === 'null' || req.query.parentId === 'root' ? { parentId: null } : req.query.parentId ? { parentId: objectId.parse(req.query.parentId) } : {};
  return listResponse(res, Category, { storeId: req.store._id, archived: { $ne: true }, ...parentFilter, ...searchFilter(req.query, ['name', 'description']) }, req.query, { sort: { name: 1, _id: 1 } });
}));
router.get('/stores/:storeId/categories/:id', requireStoreAccess, requireFeature('section.categories'), asyncHandler(async (req, res) => ok(res, safeCategory(await categoryService.find(req.store._id, req.params.id)))));
router.post('/stores/:storeId/categories', requireStoreAccess, requireFeature('section.categories'), asyncHandler(async (req, res) => { const item = await categoryService.create(req.store._id, categorySchema.parse(req.body)); await audit(req, 'category.created', 'category', item._id, { changes: AuditService.changes({}, item, ['name', 'description', 'parentId', 'active']) }); ok(res, item, 201); }));
router.put('/stores/:storeId/categories/:id', requireStoreAccess, requireFeature('section.categories'), asyncHandler(async (req, res) => {
  const { item, before } = await categoryService.update(req.store._id, req.params.id, parsePatch(categorySchema, req.body), { includeBefore: true });
  await audit(req, 'category.updated', 'category', item._id, { changes: AuditService.changes(before, item, ['name', 'description', 'parentId', 'active']) }); ok(res, item);
}));
router.delete('/stores/:storeId/categories/:id', requireStoreAccess, requireFeature('section.categories'), asyncHandler(async (req, res) => {
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
async function validateProductPlanFeatures(user, body, { patch = false, current = null } = {}) {
  const changed = key => !patch || !current || JSON.stringify(body[key]) !== JSON.stringify(current[key]?.toObject ? current[key].toObject() : current[key]);
  if (((!patch || Object.hasOwn(body, 'type')) && body.type === 'digital' && changed('type')) || (patch && current?.type === 'digital' && Object.hasOwn(body, 'digitalUrl') && changed('digitalUrl'))) await assertPlanFeature(user, 'products.digital');
  if ((!patch || Object.hasOwn(body, 'variants')) && body.variants?.length && changed('variants')) await assertPlanFeature(user, 'products.variants');
  if ((!patch || Object.hasOwn(body, 'featured')) && body.featured === true && changed('featured')) await assertPlanFeature(user, 'products.featured');
  if ((!patch || Object.hasOwn(body, 'relatedProductIds')) && body.relatedProductIds?.length && changed('relatedProductIds')) await assertPlanFeature(user, 'products.related');
}
router.get('/stores/:storeId/products', requireStoreAccess, requireFeature('section.products'), asyncHandler(async (req, res) => listResponse(res, Product, { storeId: req.store._id, archived: { $ne: true }, ...await categoryService.productFilter(req.store._id, req.query), ...searchFilter(req.query, ['name', 'description', 'variants.sku']) }, req.query, { select: '-reservations' })));
router.get('/stores/:storeId/products/:id', requireStoreAccess, requireFeature('section.products'), asyncHandler(async (req, res) => { const item = await Product.findOne({ _id: req.params.id, storeId: req.store._id, archived: { $ne: true } }).select('+digitalUrl -reservations'); if (!item) throw new AppError('Producto no encontrado.', 404); ok(res, item); }));
router.post('/stores/:storeId/products', requireStoreAccess, requireFeature('section.products'), asyncHandler(async (req, res) => {
  const body = productSchema.parse(req.body); await validateProductPlanFeatures(req.user, body); await validateProduct(body, req.store._id);
  await assetService.assertOwned(req.store._id, body.images);
  const item = await quotaService.createProduct(req.store._id, body); await assetService.markAttached(req.store._id, item.images); await audit(req, 'product.created', 'product', item._id, { changes: AuditService.changes({}, item, Object.keys(productSchema.shape)) }); ok(res, item, 201);
}));
router.put('/stores/:storeId/products/:id', requireStoreAccess, requireFeature('section.products'), asyncHandler(async (req, res) => {
  const patch = parsePatch(productSchema, req.body);
  const currentForPlan = await Product.findOne({ _id: req.params.id, storeId: req.store._id, archived: { $ne: true } }).select('+digitalUrl -reservations');
  if (!currentForPlan) throw new AppError('Producto no encontrado.', 404);
  await validateProductPlanFeatures(req.user, patch, { patch: true, current: currentForPlan });
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
router.delete('/stores/:storeId/products/:id', requireStoreAccess, requireFeature('section.products'), asyncHandler(async (req, res) => {
  const before = await Product.findOneAndUpdate({ _id: req.params.id, storeId: req.store._id }, { $set: { active: false, archived: true }, $inc: { stockVersion: 1 } }, { returnDocument: 'before' });
  if (!before) throw new AppError('Producto no encontrado.', 404);
  await assetService.cleanupProductImages(before, []);
  await audit(req, 'product.archived', 'product', before._id, { changes: AuditService.changes(before, { active: false, archived: true }, ['active', 'archived']) }); ok(res, await Product.findById(before._id).select('-reservations'));
}));
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 5 * 1024 * 1024 }, fileFilter(_req, file, cb) { if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(new AppError('Solo imágenes JPG, PNG o WebP.', 422)); cb(null, true); } });
router.post('/stores/:storeId/uploads', requireStoreAccess, requireAnyFeature(['section.products','section.design','section.pwa']), upload.array('files', 5), asyncHandler(async (req, res) => {
  const purpose = req.body.purpose === undefined ? 'image' : z.string().max(40).parse(req.body.purpose);
  const result = await imageService.upload({ files: req.files, purpose, storeId: req.store._id, actorId: req.user._id });
  await audit(req, purpose.startsWith('wallpaper-') ? 'wallpaper.uploaded' : 'image.uploaded', 'store', req.store._id, { count: result.length, purpose, images: result.map(({ width, height }) => ({ width, height })) });
  ok(res, result, 201);
}));
router.delete('/stores/:storeId/uploads', requireStoreAccess, requireAnyFeature(['section.products','section.design','section.pwa']), asyncHandler(async (req, res) => {
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
