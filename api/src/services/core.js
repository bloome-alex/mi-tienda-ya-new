import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { User, Plan, Store, Category, CategoryHierarchy, Product, Settings, AuditLog, UploadedImage, StorageCleanup, Session, MagicLink } from '../models/index.js';
import { config } from '../config.js';
import { AppError } from '../middleware/core.js';
import { randomToken, hashToken } from '../utils/crypto.js';
import { escapeHtml } from '../utils/http.js';
import { AuditService, auditService } from './AuditService.js';
import { databaseIndexService } from './DatabaseIndexService.js';
export { AuditService, auditService };

export const defaultHome = {
  eyebrow: 'TU NEGOCIO, SU PRÓXIMO PASO',
  title: 'Lo que hacés merece su propia tienda.',
  subtitle: 'Creá tu catálogo, compartí tus productos y empezá a vender desde un solo lugar. Simple para vos. Cómodo para tus clientes.',
  ctaText: 'Crear mi tienda', heroImage: '',
  benefits: [{ icon: 'palette', title: 'Una tienda muy tuya', description: 'Personalizá colores, portadas y cada paso de la experiencia de compra.' }, { icon: 'package', title: 'Todo bajo control', description: 'Productos, variantes, stock y pedidos organizados en un mismo panel.' }, { icon: 'credit-card', title: 'Vendé a tu manera', description: 'Mercado Pago, transferencia o efectivo. Elegí cómo cobrar y entregar.' }],
  testimonials: [],
  faq: [{ question: '¿Necesito saber programar?', answer: 'No. Configurás tus productos y el diseño desde tu panel, sin escribir código.' }, { question: '¿Qué pasa cuando termina la prueba?', answer: 'Podés seguir administrando tu contenido. Para publicar la tienda y recibir pedidos necesitás un plan vigente.' }, { question: '¿Puedo vender productos digitales?', answer: 'Sí. El enlace de descarga se envía por correo cuando el pedido queda pagado.' }],
};

export class SettingsService {
  async get() { return Settings.findOneAndUpdate({ key: 'global' }, { $setOnInsert: { key: 'global', trialDays: 15, magicLinkMinutes: 15, home: defaultHome, contact: { email: '', phone: '', whatsapp: '' } } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }); }
  static get() { return settingsService.get(); }
}
export class EntitlementService {
  async forUser(input) {
    const user = input && typeof input === 'object' && typeof input.role === 'string' ? input : await User.findById(input?._id || input);
    if (!user || !user.active) return { allowed: false, trial: false, expiresAt: null, maxStores: 1, maxProducts: 0, reason: 'Usuario inactivo.' };
    if (user.role === 'admin') return { allowed: true, trial: false, expiresAt: null, maxStores: 1000, maxProducts: 0, reason: 'Administración' };
    const planId = user.planId?._id || user.planId;
    const plan = planId ? await Plan.findById(planId) : null;
    if (plan && user.planExpiresAt && new Date(user.planExpiresAt) > new Date()) return { allowed: true, trial: false, expiresAt: user.planExpiresAt, maxStores: plan.maxStores, maxProducts: plan.maxProducts, reason: plan.name };
    if (user.trialEndsAt && new Date(user.trialEndsAt) > new Date()) return { allowed: true, trial: true, expiresAt: user.trialEndsAt, maxStores: 1, maxProducts: 0, reason: 'Período de prueba' };
    return { allowed: false, trial: false, expiresAt: user.planExpiresAt || user.trialEndsAt || null, maxStores: plan?.maxStores || 1, maxProducts: plan?.maxProducts || 0, reason: plan ? 'Tu plan venció.' : 'Tu prueba finalizó. Elegí un plan para publicar.' };
  }
  static forUser(user) { return entitlementService.forUser(user); }
}
export class MailService {
  constructor() { this.transport = null; }
  async send({ to, subject, html, text, replyTo, messageId }) {
    if (!config.smtp.host) throw new AppError('El correo SMTP aún no está configurado.', 503, 'SMTP_NOT_CONFIGURED');
    if (!this.transport) this.transport = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure, ...(config.smtp.user ? { auth: { user: config.smtp.user, pass: config.smtp.pass } } : {}), connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
    try { return await this.transport.sendMail({ from: config.smtp.from, to, subject, html, text, ...(replyTo ? { replyTo } : {}), ...(messageId ? { messageId } : {}) }); }
    catch (error) { console.error(`[mail] ${error.code || error.name}: no se pudo enviar el correo.`); throw new AppError('No se pudo enviar el correo. Revisá la configuración SMTP e intentá nuevamente.', 503, 'MAIL_UNAVAILABLE'); }
  }
  static send(message) { return mailService.send(message); }
}
export const settingsService = new SettingsService();
export const entitlementService = new EntitlementService();
export const mailService = new MailService();

export function safeUser(user) { const data = user?.toObject ? user.toObject() : { ...user }; delete data.passwordHash; return data; }
export function safeStore(store) {
  const data = store?.toObject ? store.toObject() : JSON.parse(JSON.stringify(store));
  delete data.ownerSlot; delete data.publicationSlot;
  const mp = data.integrations?.mercadopago || {};
  data.integrations = { mercadopago: { sandbox: mp.sandbox ?? true, hasAccessToken: Boolean(mp.accessToken), hasWebhookSecret: Boolean(mp.webhookSecret) } };
  return data;
}
export function publicStore(store) { const data = safeStore(store); delete data.ownerId; delete data.integrations; delete data.archived; delete data.__v; return data; }

export class AuthService {
  async session(user, res) {
    const token = randomToken(), csrfToken = randomToken();
    const expiresAt = new Date(Date.now() + config.sessionDays * 86400000);
    await Session.create({ userId: user._id, tokenHash: hashToken(token), csrfToken, expiresAt });
    res.cookie('mt_session', token, { httpOnly: true, secure: config.isProduction || config.appUrl.startsWith('https:'), sameSite: 'lax', expires: expiresAt, path: '/' });
    return { user: safeUser(user), csrfToken };
  }
  async rootLogin({ username, password }, res) {
    const admin = await User.findOne({ role: 'admin', username }).select('+passwordHash');
    const valid = admin ? await bcrypt.compare(password, admin.passwordHash) : await bcrypt.compare(password, '$2b$12$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX').catch(() => false);
    if (!admin || !admin.active || !valid) throw new AppError('Usuario o contraseña incorrectos.', 401, 'INVALID_CREDENTIALS');
    await AuditService.log({ actorId: admin._id, action: 'auth.root.login', entity: 'user', entityId: admin._id });
    return this.session(admin, res);
  }
  async changePassword(user, { currentPassword, newPassword }, res) {
    const admin = await User.findById(user._id).select('+passwordHash');
    if (admin.role !== 'admin' || !await bcrypt.compare(currentPassword, admin.passwordHash)) throw new AppError('La contraseña actual es incorrecta.', 422, 'INVALID_PASSWORD');
    if (await bcrypt.compare(newPassword, admin.passwordHash)) throw new AppError('Elegí una contraseña distinta de la actual.', 422, 'PASSWORD_UNCHANGED');
    admin.passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds); admin.mustChangePassword = false;
    await admin.save(); await Session.deleteMany({ userId: admin._id });
    await AuditService.log({ actorId: admin._id, action: 'auth.password.changed', entity: 'user', entityId: admin._id });
    return this.session(admin, res);
  }
  async requestMagic({ email, name = '' }) {
    const user = await User.findOne({ email });
    if (user && (!user.active || user.role !== 'vendedor')) return { message: 'Si el correo puede acceder, recibirá un enlace en unos instantes.' };
    const settings = await SettingsService.get();
    const token = randomToken();
    const link = await MagicLink.create({ email, name, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + settings.magicLinkMinutes * 60000) });
    const url = `${config.appUrl}/auth/verify?token=${token}`;
    try {
      await MailService.send({ to: email, subject: 'Tu enlace de acceso a Mi Tienda Ya', text: `Ingresá a Mi Tienda Ya: ${url}\nEste enlace se puede usar una sola vez y vence en ${settings.magicLinkMinutes} minutos. Si no lo solicitaste, ignorá este correo.`, html: `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;padding:32px;color:#153b36"><h1>Tu tienda te espera.</h1><p>Usá este enlace para ingresar a tu panel:</p><p><a style="background:#00796b;color:white;padding:14px 24px;display:inline-block;border-radius:8px;text-decoration:none" href="${escapeHtml(url)}">Ingresar a Mi Tienda Ya</a></p><p>Vence en ${settings.magicLinkMinutes} minutos y se puede usar una sola vez.</p><p>Si no solicitaste este acceso, podés ignorar el correo.</p></div>` });
    } catch (error) { await MagicLink.deleteOne({ _id: link._id }); throw error; }
    return { message: 'Si el correo puede acceder, recibirá un enlace en unos instantes.' };
  }
  async consumeMagic(token, res) {
    const link = await MagicLink.findOneAndUpdate({ tokenHash: hashToken(token), consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { returnDocument: 'after' });
    if (!link) throw new AppError('El enlace venció o ya fue utilizado. Solicitá uno nuevo.', 401, 'MAGIC_LINK_INVALID');
    let user = await User.findOne({ email: link.email });
    if (!user) {
      const settings = await SettingsService.get(); const now = new Date();
      try { user = await User.create({ role: 'vendedor', email: link.email, name: link.name || link.email.split('@')[0], trialStartedAt: now, trialEndsAt: new Date(+now + settings.trialDays * 86400000) }); }
      catch (error) { if (error.code !== 11000) throw error; user = await User.findOne({ email: link.email }); }
    }
    if (user && !user.trialStartedAt) {
      const settings = await SettingsService.get();
      user = await User.findOneAndUpdate({ _id: user._id, trialStartedAt: null }, { $set: { trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + settings.trialDays * 86400000) } }, { returnDocument: 'after' }) || await User.findById(user._id);
    }
    if (!user?.active || user.role !== 'vendedor') throw new AppError('Este usuario no tiene acceso.', 403, 'USER_INACTIVE');
    const stores = await Store.countDocuments({ ownerId: user._id });
    if (stores === 0) {
      const { quotaService } = await import('./QuotaService.js');
      const slug = `tienda-${String(user._id).slice(-10)}`;
      await quotaService.createStore({ ownerId: user._id, name: `Tienda de ${user.name}`, slug, active: false, contact: { email: user.email }, payments: [{ id: 'cash', type: 'cash', name: 'Efectivo', deliveryIds: ['pickup'], active: true }] }, { reuseSlug: true });
    }
    await AuditService.log({ actorId: user._id, action: 'auth.seller.login', entity: 'user', entityId: user._id });
    return this.session(user, res);
  }
}
export const authService = new AuthService();
export async function bootstrap() {
  await databaseIndexService.reconcileUploadedImageObjectKeyIndex();
  await Promise.all([User.init(), Plan.init(), Store.init(), Category.init(), CategoryHierarchy.init(), Product.init(), Settings.init(), AuditLog.init(), UploadedImage.init(), StorageCleanup.init(), Session.init(), MagicLink.init()]);
  if (!await User.exists({ role: 'admin' })) {
    try { await User.create({ role: 'admin', username: config.rootUser, name: 'Administración', passwordHash: await bcrypt.hash(config.rootPassword, config.bcryptRounds), mustChangePassword: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
  }
  await SettingsService.get();
  const { quotaService } = await import('./QuotaService.js');
  await quotaService.initialize();
  const { categoryService } = await import('./CategoryService.js');
  await categoryService.initialize();
  await Product.updateMany({ featured: { $exists: false } }, { $set: { featured: false } });
  // Los precios comerciales se configuran expresamente desde administración.
}
