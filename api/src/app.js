import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { config } from './config.js';
import { AppError, asyncHandler, loadAuth, errorHandler } from './middleware/core.js';
import coreRouter from './routes/core.js';
import commerceRouter from './routes/commerce.js';
import { domainService } from './services/DomainService.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by'); app.set('trust proxy', config.trustProxy);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'https:', 'http:', 'data:', 'blob:'], connectSrc: ["'self'"], fontSrc: ["'self'", 'data:'], frameSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], ...(config.isProduction ? {} : { upgradeInsecureRequests: null }) } }, crossOriginResourcePolicy: { policy: 'same-origin' }, referrerPolicy: { policy: 'no-referrer' } }));
  const origins = new Set([new URL(config.appUrl).origin, ...(!config.isProduction ? ['http://localhost:5173', 'http://127.0.0.1:5173', `http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`] : [])]);
  const originAllowed = async origin => !origin || origins.has(origin) || await domainService.isAllowedOrigin(origin);
  app.use(cors({ credentials: true, origin(origin, callback) { Promise.resolve(originAllowed(origin)).then(allowed => allowed ? callback(null, true) : callback(new AppError('Origen no permitido.', 403, 'ORIGIN_REJECTED'))).catch(() => callback(new AppError('Origen no permitido.', 403, 'ORIGIN_REJECTED'))); } }));
  app.use(express.json({ limit: '512kb' })); app.use(cookieParser());
  app.use('/api', asyncHandler(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.path.startsWith('/webhooks/') && req.get('origin') && !await originAllowed(req.get('origin'))) throw new AppError('Origen no permitido.', 403, 'ORIGIN_REJECTED');
    next();
  }));
  app.get('/api/health', (_req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ data: { status: mongoose.connection.readyState === 1 ? 'ok' : 'unavailable', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' } }));
  app.use('/api', rateLimit({ windowMs: 60000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes. Esperá un momento.' } } }), loadAuth, coreRouter, commerceRouter);
  app.use('/api', (_req, _res, next) => next(new AppError('La ruta solicitada no existe.', 404, 'NOT_FOUND')));
  app.use('/uploads/images', express.static(path.join(config.uploadDir, 'images'), { maxAge: '30d', immutable: true, dotfiles: 'deny', setHeaders(res) { res.set('X-Content-Type-Options', 'nosniff'); } }));
  // Los comprobantes nunca se exponen por express.static; se sirven mediante rutas autenticadas.
  const clientDirectory = path.join(config.projectRoot, 'client', 'dist');
  if (fs.existsSync(path.join(clientDirectory, 'index.html'))) {
    const indexTemplate = fs.readFileSync(path.join(clientDirectory, 'index.html'), 'utf8');
    app.use(express.static(clientDirectory, { index: false, setHeaders(res, file) { if (/\.(?:html|webmanifest)$|[\/]sw\.js$/.test(file)) res.set('Cache-Control', 'no-cache'); } }));
    app.get('/{*path}', asyncHandler(async (req, res, next) => {
      if (path.extname(req.path)) return next(new AppError('Archivo no encontrado.', 404, 'NOT_FOUND'));
      const store = await domainService.resolveStoreByHost(req.hostname, { allowInactive: true });
      const meta = store ? `<meta name="mty-store-slug" content="${store.slug}"><meta name="mty-store-url" content="${domainService.publicUrl(store)}"><meta name="mty-platform-url" content="${config.appUrl}">` : '';
      const html = meta ? indexTemplate.replace('</head>', `${meta}</head>`) : indexTemplate;
      res.set('Cache-Control', 'no-cache').type('html').send(html);
    }));
  } else app.get('/', (_req, res) => res.status(503).type('text').send('La API está iniciada. Ejecutá npm run build para generar el cliente, o npm run dev para desarrollar.'));
  app.use(errorHandler);
  return app;
}
export default createApp;
