import mongoose from 'mongoose';
import { config, validateConfig } from './config.js';
import { createApp } from './app.js';
import { bootstrap } from './services/core.js';
import { whatsappService } from './services/WhatsAppService.js';
import { initCommerce, stopCommerce } from './services/commerce.js';
import { subscriptionService } from './services/SubscriptionService.js';
import path from 'node:path';
import { clientBuildStatus } from './utils/clientBuild.js';

let server, closing = false;
async function close(signal = 'shutdown') {
  if (closing) return; closing = true;
  console.log(`[api] Cerrando por ${signal}.`);
  const timeout = setTimeout(() => process.exit(1), 15000); timeout.unref();
  try {
    if (server) await new Promise(resolve => server.close(resolve));
    subscriptionService.stopPendingWorker(); await stopCommerce(); await whatsappService.close(); await mongoose.disconnect();
    clearTimeout(timeout); process.exit(0);
  } catch (error) { console.error(`[api] Error de cierre: ${error.message}`); process.exit(1); }
}
try {
  validateConfig(); mongoose.set('sanitizeFilter', false);
  const build = clientBuildStatus(path.join(config.projectRoot, 'client'));
  if (['stale', 'unknown'].includes(build.status)) {
    const message = build.status === 'stale' ? `El frontend compilado (client/dist, ${build.builtAt || 'fecha desconocida'}) no corresponde al código actual de client/.` : 'client/dist no tiene build-info.json: no se puede verificar que el frontend esté actualizado.';
    if (config.isProduction && process.env.ALLOW_STALE_CLIENT_BUILD !== 'true') throw new Error(`${message} Ejecutá "npm run build" antes de iniciar.`);
    console.warn(`[api] ADVERTENCIA: ${message} Ejecutá "npm run build".`);
  }
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  await bootstrap(); await initCommerce(); subscriptionService.startPendingWorker();
  const app = createApp();
  server = app.listen(config.port, '0.0.0.0', () => { console.log(`[api] MiTiendaYa disponible en puerto ${config.port}.`); if (process.send) process.send('ready'); whatsappService.scheduleAutoReconnect(); });
  server.on('error', error => { console.error(`[api] No se pudo escuchar: ${error.message}`); close('listen-error'); });
  process.on('SIGTERM', () => close('SIGTERM')); process.on('SIGINT', () => close('SIGINT'));
  process.on('unhandledRejection', error => { console.error('[api] Promesa no controlada.', error?.message); close('unhandledRejection'); });
} catch (error) { console.error(`[api] No se pudo iniciar: ${error.message}`); await mongoose.disconnect(); process.exit(1); }
