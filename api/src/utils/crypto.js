import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { config } from '../config.js';
export const randomToken = () => randomBytes(32).toString('hex');
export const hashToken = value => createHash('sha256').update(String(value)).digest('hex');
export function encryptSecret(value) {
  if (!value) return '';
  const key = Buffer.from(config.encryptionKey, 'hex');
  if (key.length !== 32) throw new Error('Configurá ENCRYPTION_KEY para guardar credenciales.');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join(':');
}
export function decryptSecret(value) {
  if (!value) return '';
  const [version, iv, tag, ciphertext] = String(value).split(':');
  if (version !== 'v1') throw new Error('Credencial cifrada no válida.');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(config.encryptionKey, 'hex'), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8');
}
