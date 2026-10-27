import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { AppError, asyncHandler, requireStoreAccess, requireFeature } from '../middleware/core.js';
import { ok } from '../utils/http.js';
import { Product, Store } from '../models/index.js';
import { StockMovement } from '../models/commerce.js';
import { catalog, commerce, inventory, receipts, commerceWorker, safeOrder, safeProduct, safePublicStore, pagination } from '../services/commerce.js';
import { domainService } from '../services/DomainService.js';

const router = Router();
const rateMessage = { error: { message: 'Demasiadas solicitudes. Esperá unos minutos y volvé a intentar.', code: 'RATE_LIMITED' } };
const checkoutLimit = rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: rateMessage });
const contactLimit = rateLimit({ windowMs: 15 * 60000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: rateMessage });
const receiptLimit = rateLimit({ windowMs: 15 * 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: rateMessage });
const verificationLimit = rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: rateMessage });
const receiptUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2 } });

router.get('/stores/:storeId/dashboard', requireStoreAccess, requireFeature('dashboard.statistics'), asyncHandler(async (req, res) => ok(res, await commerce.dashboard(req.store._id))));

router.get('/stores/:storeId/stock', requireStoreAccess, requireFeature('management.stock'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination({ ...req.query, limit: req.query.limit || 500 });
  const filter = { storeId: req.store._id, archived: { $ne: true } };
  if (typeof req.query.search === 'string' && req.query.search.trim()) filter.name = new RegExp(req.query.search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [products, total] = await Promise.all([Product.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(), Product.countDocuments(filter)]);
  ok(res, products.map(p => ({ ...safeProduct(p), stockVersion: p.stockVersion, reservedStock: (p.reservations || []).reduce((sum, r) => sum + r.quantity, 0) })), 200, { page, limit, total });
}));
router.put('/stores/:storeId/stock', requireStoreAccess, requireFeature('management.stock'), asyncHandler(async (req, res) => ok(res, await inventory.setStock(req.store._id, req.body, req.user._id))));
router.get('/stores/:storeId/stock/movements', requireStoreAccess, requireFeature('management.stock'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query), filter = { storeId: req.store._id };
  const [rows, total] = await Promise.all([StockMovement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('productId', 'name').lean(), StockMovement.countDocuments(filter)]);
  ok(res, rows, 200, { page, limit, total });
}));

router.get('/stores/:storeId/orders', requireStoreAccess, requireFeature('management.orders'), asyncHandler(async (req, res) => {
  const result = await commerce.listOrders(req.store._id, req.query);
  ok(res, result.data, 200, result.meta);
}));
router.post('/stores/:storeId/orders', requireStoreAccess, requireFeature('management.orders'), asyncHandler(async (req, res) => ok(res, await commerce.createOrder(req.store, req.body, { actorId: req.user._id, manual: true }), 201)));
router.get('/stores/:storeId/orders/:id', requireStoreAccess, requireFeature('management.orders'), asyncHandler(async (req, res) => ok(res, safeOrder(await commerce.getOrder(req.store._id, req.params.id)))));
router.put('/stores/:storeId/orders/:id/status', requireStoreAccess, requireFeature('management.orders'), asyncHandler(async (req, res) => ok(res, await commerce.changeStatus(req.store._id, req.params.id, req.body, req.user._id))));
router.delete('/stores/:storeId/orders/:id', requireStoreAccess, requireFeature('management.orders'), asyncHandler(async (req, res) => ok(res, await commerce.changeStatus(req.store._id, req.params.id, { ...req.body, status: 'cancelled' }, req.user._id))));
router.put('/stores/:storeId/orders/:id/fulfillment', requireStoreAccess, requireFeature('management.orders'), asyncHandler(async (req, res) => ok(res, await commerce.fulfillment(req.store._id, req.params.id, req.body, req.user._id))));
router.post('/stores/:storeId/orders/:id/verify-payment', verificationLimit, requireStoreAccess, requireFeature('management.orders'), asyncHandler(async (req, res) => ok(res, await commerce.verifyPayment(req.store, req.params.id))));
router.post('/stores/:storeId/orders/:id/resend-digital', requireStoreAccess, requireFeature('management.orders'), asyncHandler(async (req, res) => ok(res, await commerceWorker.retryDigital(req.store._id, req.params.id))));
router.get('/stores/:storeId/orders/:id/receipt', requireStoreAccess, requireFeature('management.orders'), asyncHandler(async (req, res) => {
  const file = await receipts.file(req.store._id, req.params.id);
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.type(file.mimeType).attachment(file.name);
  if (file.body) return res.send(file.body);
  res.download(file.path, file.name);
}));

router.get('/public/host-store', asyncHandler(async (req, res) => {
  const store = await domainService.resolveStoreByHost(req.hostname, { allowInactive: true });
  if (!store) throw new AppError('Este dominio no está asociado a una tienda.', 404, 'STORE_HOST_NOT_FOUND');
  ok(res, { slug: store.slug, publicUrl: domainService.publicUrl(store) });
}));
router.get('/public/stores/:slug', asyncHandler(async (req, res) => ok(res, await catalog.catalog(req.params.slug, req.query))));
router.get('/public/stores/:slug/products/:id', asyncHandler(async (req, res) => ok(res, await catalog.product(req.params.slug, req.params.id))));
router.post('/public/stores/:slug/recommendations', asyncHandler(async (req, res) => {
  const store = await catalog.storeBySlug(req.params.slug);
  ok(res, await catalog.recommend(store, req.body.productIds || []));
}));
router.post('/public/stores/:slug/contact', contactLimit, asyncHandler(async (req, res) => ok(res, await catalog.contact(req.params.slug, req.body))));
router.post('/public/stores/:slug/orders', checkoutLimit, asyncHandler(async (req, res) => {
  const store = await catalog.storeBySlug(req.params.slug);
  ok(res, await commerce.createOrder(store, req.body), 201);
}));
router.get('/public/orders/:id', asyncHandler(async (req, res) => {
  const order = await commerce.publicOrder(req.params.id, req.query.token);
  const store = await Store.findById(order.storeId);
  res.set('Cache-Control', 'private, no-store');
  ok(res, { order: safeOrder(order, { publicView: true }), store: store ? safePublicStore(store) : null, paymentInstructions: order.payment, ...(!['paid', 'cancelled'].includes(order.status) && order.checkoutUrl ? { checkoutUrl: order.checkoutUrl } : {}) });
}));
router.post('/public/orders/:id/verify-payment', verificationLimit, asyncHandler(async (req, res) => {
  const order = await commerce.publicOrder(req.params.id, req.query.token);
  const store = await Store.findById(order.storeId).select('+integrations.mercadopago.accessToken +integrations.mercadopago.webhookSecret +integrations.mercadopago.accounts.accessToken +integrations.mercadopago.accounts.webhookSecret');
  await commerce.verifyPayment(store, String(order._id));
  ok(res, safeOrder(await commerce.getOrder(store._id, String(order._id)), { publicView: true }));
}));
router.post('/public/orders/:id/receipt', receiptLimit, asyncHandler(async (req, _res, next) => {
  req.order = await commerce.publicOrder(req.params.id, req.query.token);
  next();
}), receiptUpload.single('file'), asyncHandler(async (req, res) => ok(res, { order: await receipts.store(req.order, req.file) })));

router.post('/webhooks/mercadopago/:storeId/:accountId', asyncHandler(async (req, res) => ok(res, await commerce.webhook(req.params.storeId, req, req.params.accountId))));
router.post('/webhooks/mercadopago/:storeId', asyncHandler(async (req, res) => ok(res, await commerce.webhook(req.params.storeId, req))));

export default router;
