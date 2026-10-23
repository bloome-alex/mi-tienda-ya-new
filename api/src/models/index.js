import mongoose from 'mongoose';
const { Schema } = mongoose;
const ref = name => ({ type: Schema.Types.ObjectId, ref: name });
const options = { timestamps: true, minimize: false };
const nonnegative = { type: Number, min: 0, default: 0 };
const userSchema = new Schema({
  role: { type: String, enum: ['admin', 'vendedor'], default: 'vendedor', required: true },
  name: { type: String, trim: true, maxlength: 100, default: '' }, email: { type: String, lowercase: true, trim: true },
  username: { type: String, trim: true }, passwordHash: { type: String, select: false }, mustChangePassword: { type: Boolean, default: false },
  active: { type: Boolean, default: true }, planId: ref('Plan'), planExpiresAt: Date, trialStartedAt: Date, trialEndsAt: Date,
  subscriptionAppliedPaymentIds: { type: [String], default: [], select: false },
}, options);
userSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: 'admin' } });
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.set('optimisticConcurrency', true);
const planSchema = new Schema({ name: { type: String, required: true, maxlength: 100 }, icon: { type: String, default: 'store' }, previousPrice: nonnegative, price: nonnegative, durationDays: { type: Number, min: 1, default: 30 }, features: [String], maxStores: { type: Number, min: 1, default: 1 }, maxProducts: { type: Number, min: 0, default: 100 }, active: { type: Boolean, default: true }, featured: { type: Boolean, default: false }, sortOrder: { type: Number, default: 0 } }, options);
const deliverySchema = new Schema({ id: { type: String, required: true }, type: { type: String, enum: ['pickup', 'shipping', 'digital', 'custom'], required: true }, name: { type: String, required: true }, description: String, price: nonnegative, active: { type: Boolean, default: true } }, { _id: false });
const paymentSchema = new Schema({ id: { type: String, required: true }, type: { type: String, enum: ['cash', 'transfer', 'mercadopago'], required: true }, name: { type: String, required: true }, instructions: String, deliveryIds: [String], active: { type: Boolean, default: true }, bank: { holder: String, bank: String, cbu: String, alias: String, cuit: String } }, { _id: false });
const storeSchema = new Schema({ ownerSlot: { type: Number, min: 0, validate: Number.isSafeInteger }, publicationSlot: { type: Number, min: 0, validate: Number.isSafeInteger }, ownerId: { ...ref('User'), required: true, index: true }, name: { type: String, required: true, maxlength: 120 }, slug: { type: String, required: true, unique: true, lowercase: true }, description: { type: String, default: '' }, active: { type: Boolean, default: false }, archived: { type: Boolean, default: false },
 domain: { mode: { type: String, enum: ['path', 'subdomain', 'custom'], default: 'path' }, subdomain: { type: String, lowercase: true, trim: true, default: null }, customDomain: { type: String, lowercase: true, trim: true, default: null }, status: { type: String, enum: ['unconfigured', 'pending', 'verified'], default: 'unconfigured' }, verificationToken: { type: String, default: '' }, dnsVerifiedAt: Date, verifiedAt: Date, provisionedAt: Date, provisioningError: { type: String, default: '' } },
 contact: { email: { type: String, default: '' }, phone: { type: String, default: '' }, whatsapp: { type: String, default: '' }, message: { type: String, default: '¡Hola! Quisiera hacer una consulta.' }, showWhatsapp: { type: Boolean, default: true }, showContactForm: { type: Boolean, default: false } },
 design: { type: Schema.Types.Mixed, default: {} }, payments: { type: [paymentSchema], default: [] }, deliveries: { type: [deliverySchema], default: [{ id: 'pickup', type: 'pickup', name: 'Retiro en el local', description: '', price: 0, active: true }] },
 integrations: { mercadopago: { accessToken: { type: String, select: false }, webhookSecret: { type: String, select: false }, sandbox: { type: Boolean, default: true } } },
 pwa: { name: { type: String, trim: true, maxlength: 120, default: '' }, iconUrl: { type: String, default: '' }, icon192Url: { type: String, default: '' } },
}, options);
storeSchema.set('optimisticConcurrency', true);
storeSchema.index({ ownerId: 1, ownerSlot: 1 }, { unique: true, partialFilterExpression: { archived: false, ownerSlot: { $type: 'number' } } });
storeSchema.index({ ownerId: 1, publicationSlot: 1 }, { unique: true, partialFilterExpression: { active: true, archived: false, publicationSlot: { $type: 'number' } } });
storeSchema.index({ 'domain.subdomain': 1 }, { unique: true, partialFilterExpression: { archived: false, 'domain.subdomain': { $type: 'string' } }, name: 'store_subdomain_unique' });
storeSchema.index({ 'domain.customDomain': 1 }, { unique: true, partialFilterExpression: { archived: false, 'domain.customDomain': { $type: 'string' } }, name: 'store_custom_domain_unique' });
const categoryLinkSchema = new Schema({ childId: { ...ref('Category'), required: true }, token: { type: String, required: true } }, { _id: false });
const categorySchema = new Schema({ storeId: { ...ref('Store'), required: true, index: true }, parentId: { ...ref('Category'), default: null }, name: { type: String, required: true, trim: true }, description: { type: String, default: '' }, active: { type: Boolean, default: true }, archived: { type: Boolean, default: false }, hierarchyLinks: { type: [categoryLinkSchema], default: [], select: false }, parentLinkToken: { type: String, select: false } }, options);
categorySchema.index({ storeId: 1, parentId: 1, name: 1 }, { unique: true, partialFilterExpression: { archived: false }, name: 'category_sibling_name_unique' });
categorySchema.index({ storeId: 1, parentId: 1, archived: 1 });
// A non-expiring exclusion token serializes topology changes per store. It is
// reconciled only during the single-process bootstrap, before accepting traffic.
const categoryHierarchySchema = new Schema({ _id: { ...ref('Store') }, token: String, revision: { type: Number, default: 0 } }, { timestamps: true });
const variantSchema = new Schema({ id: { type: String, required: true }, name: { type: String, required: true }, sku: { type: String, default: '' }, stock: nonnegative, price: { type: Number, min: 0 }, attributes: { type: Map, of: String, default: {} } }, { _id: false });
const productSchema = new Schema({ quotaSlot: { type: Number, min: 0, validate: Number.isSafeInteger }, storeId: { ...ref('Store'), required: true, index: true }, name: { type: String, required: true, maxlength: 180 }, description: { type: String, default: '' }, categoryId: ref('Category'), type: { type: String, enum: ['physical', 'digital'], default: 'physical' }, digitalUrl: { type: String, default: '', select: false }, images: { type: [String], validate: [arr => arr.length <= 5, 'Hasta 5 imágenes.'] }, price: { type: Number, min: 0, required: true }, previousPrice: nonnegative, active: { type: Boolean, default: true }, featured: { type: Boolean, default: false }, archived: { type: Boolean, default: false }, madeToOrder: { type: Boolean, default: false }, stock: nonnegative, variants: { type: [variantSchema], default: [] }, relatedProductIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }], reservations: { type: [new Schema({ orderId: { type: Schema.Types.ObjectId, required: true }, variantId: { type: String, default: '' }, quantity: { type: Number, required: true, min: 1 }, released: { type: Boolean, default: false } }, { _id: false })], default: [] }, stockVersion: { type: Number, default: 0 } }, options);
productSchema.index({ storeId: 1, active: 1, archived: 1 });
productSchema.index({ storeId: 1, featured: 1, active: 1, archived: 1, createdAt: -1 });
productSchema.index({ storeId: 1, quotaSlot: 1 }, { unique: true, partialFilterExpression: { archived: false, quotaSlot: { $type: 'number' } } });
const settingsSchema = new Schema({ key: { type: String, default: 'global', unique: true }, trialDays: { type: Number, min: 0, max: 365, default: 15 }, magicLinkMinutes: { type: Number, min: 1, max: 1440, default: 15 }, subscriptionGraceDays: { type: Number, min: 0, max: 3650, default: 7 }, contact: { email: { type: String, default: '' }, phone: { type: String, default: '' }, whatsapp: { type: String, default: '' } }, platformBilling: { enabled: { type: Boolean, default: false }, mercadopago: { accessToken: { type: String, select: false }, webhookSecret: { type: String, select: false }, sandbox: { type: Boolean, default: true } } }, home: { type: Schema.Types.Mixed, default: {} } }, options);
settingsSchema.set('optimisticConcurrency', true);
const auditSchema = new Schema({ actorId: ref('User'), storeId: ref('Store'), action: String, entity: String, entityId: String, actorSnapshot: Schema.Types.Mixed, storeSnapshot: Schema.Types.Mixed, entitySnapshot: Schema.Types.Mixed, details: Schema.Types.Mixed }, { timestamps: { createdAt: true, updatedAt: false } });
auditSchema.index({ createdAt: -1 });
auditSchema.index({ action: 1, createdAt: -1 });
auditSchema.index({ storeId: 1, createdAt: -1 });
auditSchema.index({ actorId: 1, createdAt: -1 });
const uploadedImageSchema = new Schema({ storeId: { ...ref('Store'), required: true, index: true }, uploadedBy: ref('User'), url: { type: String, required: true, unique: true }, name: { type: String, required: true }, objectKey: { type: String }, storage: { type: String, enum: ['r2', 'legacy-local'], default: 'r2', index: true }, attached: { type: Boolean, default: false, index: true }, purpose: { type: String, enum: ['image', 'wallpaper-desktop', 'wallpaper-mobile', 'wallpaper-shared', 'pwa-icon'], required: true }, width: Number, height: Number, size: Number, contentHash: { type: String, required: true, select: false } }, { timestamps: true });
uploadedImageSchema.index({ objectKey: 1 }, { unique: true, partialFilterExpression: { objectKey: { $type: 'string' } } });
const storageCleanupSchema = new Schema({ storeId: ref('Store'), bucket: { type: String, required: true }, objectKey: { type: String, required: true, unique: true }, reason: { type: String, default: 'cleanup' }, attempts: { type: Number, default: 0 }, lastError: String, availableAt: { type: Date, default: Date.now, index: true } }, options);

const subscriptionPlanSnapshotSchema = new Schema({
  name: { type: String, required: true }, price: { type: Number, min: 0, required: true }, durationDays: { type: Number, min: 1, required: true }, maxStores: { type: Number, min: 1, required: true }, maxProducts: { type: Number, min: 0, required: true },
}, { _id: false });
const subscriptionSchema = new Schema({
  userId: { ...ref('User'), required: true, index: true },
  planId: { ...ref('Plan'), required: true },
  provider: { type: String, enum: ['mercadopago'], default: 'mercadopago', required: true },
  providerSubscriptionId: { type: String, trim: true },
  checkoutUrl: { type: String, default: '' },
  current: { type: Boolean, default: true },
  status: { type: String, enum: ['pending', 'authorized', 'payment_failed', 'paused', 'cancelled', 'detached'], default: 'pending', index: true },
  providerStatus: { type: String, default: '' },
  payerEmail: { type: String, lowercase: true, trim: true, default: '' },
  payerId: { type: String, default: '' },
  paymentMethodId: { type: String, default: '' },
  planSnapshot: { type: subscriptionPlanSnapshotSchema, required: true },
  startedAt: Date,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  nextPaymentAt: Date,
  lastPaymentAt: Date,
  lastPaymentId: String,
  lastPaymentStatus: String,
  lastPaymentStatusDetail: String,
  lastFailureAt: Date,
  cancelAtPeriodEnd: { type: Boolean, default: false },
  canceledAt: Date,
  detachedAt: Date,
  lastProviderSyncAt: Date,
}, options);
subscriptionSchema.index({ userId: 1, current: 1 }, { unique: true, partialFilterExpression: { current: true }, name: 'user_current_subscription_unique' });
subscriptionSchema.index({ providerSubscriptionId: 1 }, { unique: true, partialFilterExpression: { providerSubscriptionId: { $type: 'string' } }, name: 'provider_subscription_unique' });
const subscriptionChargeSchema = new Schema({
  subscriptionId: { ...ref('Subscription'), required: true, index: true }, userId: { ...ref('User'), required: true, index: true }, planId: { ...ref('Plan'), required: true },
  providerAuthorizedPaymentId: { type: String, required: true, unique: true }, providerPaymentId: String,
  status: { type: String, default: 'pending', index: true }, statusDetail: String, amount: { type: Number, min: 0, default: 0 }, currency: { type: String, default: 'ARS' }, dueAt: Date, paidAt: Date,
}, options);
subscriptionChargeSchema.index({ providerPaymentId: 1 }, { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } }, name: 'subscription_payment_unique' });

const sessionSchema = new Schema({ userId: { ...ref('User'), required: true, index: true }, tokenHash: { type: String, required: true, unique: true }, csrfToken: { type: String, required: true }, expiresAt: { type: Date, required: true } }, options);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const magicSchema = new Schema({ email: { type: String, required: true }, name: String, tokenHash: { type: String, required: true, unique: true }, expiresAt: { type: Date, required: true }, consumedAt: Date }, options);
magicSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Plan = mongoose.models.Plan || mongoose.model('Plan', planSchema);
export const Store = mongoose.models.Store || mongoose.model('Store', storeSchema);
export const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);
export const CategoryHierarchy = mongoose.models.CategoryHierarchy || mongoose.model('CategoryHierarchy', categoryHierarchySchema);
export const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
export const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditSchema);
export const UploadedImage = mongoose.models.UploadedImage || mongoose.model('UploadedImage', uploadedImageSchema);
export const StorageCleanup = mongoose.models.StorageCleanup || mongoose.model('StorageCleanup', storageCleanupSchema);
export const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);
export const SubscriptionCharge = mongoose.models.SubscriptionCharge || mongoose.model('SubscriptionCharge', subscriptionChargeSchema);
export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
export const MagicLink = mongoose.models.MagicLink || mongoose.model('MagicLink', magicSchema);
