import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.join(projectRoot, '.env'), quiet: true });
const number = (name, fallback) => Number.parseInt(process.env[name] || fallback, 10);
export const config = {
  projectRoot,
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: number('PORT', 5000),
  apiPort: number('PORT', 5000),
  appUrl: (process.env.APP_URL || 'http://localhost:5000').replace(/\/$/, ''),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mi_tienda_ya_2',
  rootUser: process.env.ROOT_USER || '',
  rootPassword: process.env.ROOT_PASSWORD || '',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  sessionSecret: process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY || '',
  sessionDays: number('SESSION_DAYS', 7),
  bcryptRounds: number('BCRYPT_ROUNDS', 12),
  trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false,
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(projectRoot, 'api/data/uploads')), // legado: sólo migración de archivos locales previos a v1.8
  storefront: {
    baseDomain: (process.env.STOREFRONT_BASE_DOMAIN || 'mitiendaya.com.ar').trim().toLowerCase().replace(/^\.+|\.+$/g, ''),
    cnameTarget: (process.env.STOREFRONT_CNAME_TARGET || process.env.STOREFRONT_BASE_DOMAIN || 'mitiendaya.com.ar').trim().toLowerCase().replace(/^\.+|\.+$/g, ''),
    verificationPrefix: (process.env.STOREFRONT_VERIFICATION_PREFIX || '_mitiendaya-verification').trim().toLowerCase(),
    reservedSubdomains: (process.env.STOREFRONT_RESERVED_SUBDOMAINS || 'www,app,api,admin,root,mail,static,assets,media,cdn,stores').split(',').map(value => value.trim().toLowerCase()).filter(Boolean),
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    assetsBucket: process.env.R2_ASSETS_BUCKET_NAME || process.env.R2_BUCKET_NAME || '',
    receiptsBucket: process.env.R2_RECEIPTS_BUCKET_NAME || '',
    publicUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/$/, ''),
    endpoint: (process.env.R2_ENDPOINT || '').replace(/\/$/, ''),
    prefix: process.env.R2_PREFIX || 'mi-tienda-ya-2',
  },
  whatsappClientId: process.env.WHATSAPP_CLIENT_ID || 'mi-tienda-ya-2',
  whatsappDataPath: path.resolve(process.env.WHATSAPP_DATA_PATH || path.join(projectRoot, 'api/data/whatsapp')),
  whatsappExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  whatsappNoSandbox: process.env.WHATSAPP_NO_SANDBOX === 'true',
  orderReservationMinutes: number('ORDER_RESERVATION_MINUTES', 60),
  smtp: { host: process.env.SMTP_HOST, port: number('SMTP_PORT', 587), secure: process.env.SMTP_SECURE === 'true', user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS, from: process.env.SMTP_FROM || 'Mi Tienda Ya <no-reply@example.com>' },
};
export function validateConfig() {
  if (!config.rootUser || !config.rootPassword) throw new Error('Configurá ROOT_USER y ROOT_PASSWORD en .env antes de iniciar.');
  if (config.rootPassword.length < 12 || Buffer.byteLength(config.rootPassword, 'utf8') > 72) throw new Error('ROOT_PASSWORD debe tener al menos 12 caracteres y hasta 72 bytes.');
  if (!/^[a-fA-F0-9]{64}$/.test(config.encryptionKey)) throw new Error('ENCRYPTION_KEY debe contener 64 caracteres hexadecimales (32 bytes).');
  if (!/^[\w-]+$/.test(config.whatsappClientId)) throw new Error('WHATSAPP_CLIENT_ID solo admite letras, números, guiones y guiones bajos.');
  if (!Number.isInteger(config.bcryptRounds) || config.bcryptRounds < 10 || config.bcryptRounds > 14) throw new Error('BCRYPT_ROUNDS debe estar entre 10 y 14.');
  if (!Number.isInteger(config.sessionDays) || config.sessionDays < 1 || config.sessionDays > 90) throw new Error('SESSION_DAYS debe estar entre 1 y 90.');
  if (config.rootUser.length > 100) throw new Error('ROOT_USER no puede superar 100 caracteres.');
  if (config.isProduction && !config.appUrl.startsWith('https://')) throw new Error('APP_URL debe usar HTTPS en producción.');
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(config.storefront.baseDomain)) throw new Error('STOREFRONT_BASE_DOMAIN debe ser un dominio válido.');
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(config.storefront.cnameTarget)) throw new Error('STOREFRONT_CNAME_TARGET debe ser un dominio válido.');
  if (config.isProduction) {
    const missingR2 = [['R2_ACCOUNT_ID', config.r2.accountId], ['R2_ACCESS_KEY_ID', config.r2.accessKeyId], ['R2_SECRET_ACCESS_KEY', config.r2.secretAccessKey], ['R2_ASSETS_BUCKET_NAME', config.r2.assetsBucket], ['R2_RECEIPTS_BUCKET_NAME', config.r2.receiptsBucket], ['R2_PUBLIC_URL', config.r2.publicUrl]].filter(([,value]) => !value).map(([name]) => name);
    if (missingR2.length) throw new Error('Configurá Cloudflare R2 antes de iniciar en producción: ' + missingR2.join(', ') + '.');
    if (!config.r2.publicUrl.startsWith('https://')) throw new Error('R2_PUBLIC_URL debe usar HTTPS en producción.');
  }
}
