// Se carga antes de cada archivo de prueba (node --test --import). Garantiza que la
// suite nunca use servicios reales configurados en .env: R2 queda en memoria y el
// SMTP real se desactiva. Cada prueba puede reemplazar estos dobles si lo necesita.
import { config } from '../src/config.js';
import { r2Storage } from '../src/services/R2StorageService.js';

Object.assign(config.r2, { accountId: 'test', accessKeyId: 'test', secretAccessKey: 'test', assetsBucket: 'assets-test', receiptsBucket: 'receipts-test', publicUrl: 'https://media.test', endpoint: 'https://r2.test', prefix: 'test' });
Object.assign(config.smtp, { host: '', user: '', pass: '' });

export const r2Objects = new Map();
r2Storage.fetch = async (url, { method, body, headers = {} } = {}) => {
  const target = new URL(url);
  if (target.hostname !== 'r2.test') throw new Error(`Las pruebas no pueden contactar R2 real (${target.hostname}).`);
  const key = decodeURIComponent(target.pathname);
  if (method === 'PUT') { r2Objects.set(key, { body: Buffer.from(body), type: headers['content-type'] }); return new Response('', { status: 200 }); }
  if (method === 'GET') { const item = r2Objects.get(key); return item ? new Response(item.body, { status: 200, headers: { 'content-type': item.type || 'application/octet-stream' } }) : new Response('', { status: 404 }); }
  if (method === 'DELETE') { r2Objects.delete(key); return new Response(null, { status: 204 }); }
  return new Response('', { status: 400 });
};
