import mongoose from 'mongoose';

const { Schema } = mongoose;
const objectId = Schema.Types.ObjectId;

const itemSchema = new Schema({
  productId: { type: objectId, required: true, ref: 'Product' },
  variantId: { type: String, default: '' },
  name: { type: String, required: true },
  variantName: String,
  type: { type: String, enum: ['physical', 'digital'], required: true },
  image: String,
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
  trackedStock: { type: Boolean, default: false },
  digitalUrl: { type: String, select: false },
}, { _id: false });

const historySchema = new Schema({
  status: String,
  at: { type: Date, default: Date.now },
  note: { type: String, maxlength: 1500 },
  actorId: { type: objectId, ref: 'User' },
}, { _id: false });

const termsAcceptanceSchema = new Schema({
  required: { type: Boolean, required: true }, accepted: { type: Boolean, required: true },
  source: { type: String, enum: ['internal', 'external', 'none', 'manual'], required: true },
  acceptedAt: Date, contentHash: String,
  snapshot: { title: String, intro: String, content: String, url: String, updatedAt: String },
}, { _id: false });

const orderSchema = new Schema({
  storeId: { type: objectId, required: true, ref: 'Store', index: true },
  number: { type: String, required: true, unique: true },
  customer: {
    name: { type: String, required: true, maxlength: 150 },
    email: { type: String, required: true, lowercase: true, maxlength: 254 },
    phone: { type: String, maxlength: 50 },
    address: { type: String, maxlength: 300 },
    city: { type: String, maxlength: 120 },
    postalCode: { type: String, maxlength: 30 },
    notes: { type: String, maxlength: 1500 },
  },
  items: { type: [itemSchema], required: true },
  subtotal: { type: Number, required: true, min: 0 },
  deliveryCost: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'ARS', enum: ['ARS'] },
  payment: { type: Schema.Types.Mixed, required: true },
  delivery: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['creating', 'pending', 'awaiting_payment', 'processing', 'paid', 'cancelled'], default: 'creating', index: true },
  fulfillmentStatus: { type: String, enum: ['unfulfilled', 'preparing', 'shipped', 'delivered'], default: 'unfulfilled' },
  history: { type: [historySchema], default: [] },
  termsAcceptance: { type: termsAcceptanceSchema, default: undefined },
  paidAt: Date,
  cancelledAt: Date,
  finalEffectsAt: Date,
  reservationExpiresAt: Date,
  idempotencyHash: { type: String, required: true, select: false },
  requestHash: { type: String, required: true, select: false },
  accessTokenHash: { type: String, required: true, select: false },
  accessTokenEncrypted: { type: String, select: false },
  preferenceId: String,
  checkoutUrl: String,
  collectorId: String,
  paymentId: String,
  paymentProviderStatus: String,
  paymentIssue: String,
  providerCheckedAt: Date,
  digitalDeliveryStatus: { type: String, enum: ['not_applicable', 'pending', 'sent', 'failed'], default: 'not_applicable' },
  digitalDeliveryError: String,
  digitalDeliveredAt: Date,
  receipt: {
    objectKey: { type: String, select: false },
    path: { type: String, select: false }, // legado anterior a R2
    name: String,
    mimeType: String,
    uploadedAt: Date,
  },
}, { timestamps: true });
orderSchema.index({ storeId: 1, idempotencyHash: 1 }, { unique: true });
orderSchema.index({ storeId: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, finalEffectsAt: 1 });
orderSchema.index({ paymentId: 1 }, { unique: true, partialFilterExpression: { paymentId: { $type: 'string' } } });

const stockMovementSchema = new Schema({
  storeId: { type: objectId, required: true, ref: 'Store', index: true },
  productId: { type: objectId, required: true, ref: 'Product' },
  variantId: { type: String, default: '' },
  orderId: { type: objectId, ref: 'Order' },
  actorId: { type: objectId, ref: 'User' },
  kind: { type: String, enum: ['adjustment', 'reservation', 'release', 'sale'], required: true },
  before: Number,
  after: Number,
  delta: Number,
  reason: String,
  operationId: { type: String, required: true, unique: true },
}, { timestamps: true });

const mailJobSchema = new Schema({
  key: { type: String, required: true, unique: true },
  orderId: { type: objectId, required: true, ref: 'Order', index: true },
  kind: { type: String, enum: ['digital', 'confirmation'], required: true },
  state: { type: String, enum: ['pending', 'sending', 'sent', 'failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  availableAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  lastError: String,
  sentAt: Date,
}, { timestamps: true });

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
export const StockMovement = mongoose.models.StockMovement || mongoose.model('StockMovement', stockMovementSchema);
export const MailJob = mongoose.models.MailJob || mongoose.model('MailJob', mailJobSchema);
