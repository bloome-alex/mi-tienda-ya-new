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
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(projectRoot, 'api/data/uploads')),
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
}
