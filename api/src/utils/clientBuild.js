import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Huella del código fuente del cliente. Se guarda en client/dist/build-info.json
 * al compilar y el servidor la compara al arrancar para detectar un build viejo.
 */
const SOURCES = ['src', 'public', 'index.html', 'vite.config.js', 'package.json'];

function files(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true })
    .filter(entry => !entry.name.startsWith('.'))
    .flatMap(entry => files(path.join(target, entry.name)));
}

export function clientSourceFingerprint(clientDirectory) {
  const hash = createHash('sha256');
  const list = SOURCES.flatMap(item => files(path.join(clientDirectory, item))).sort();
  for (const file of list) {
    hash.update(path.relative(clientDirectory, file).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export const buildInfoPath = clientDirectory => path.join(clientDirectory, 'dist', 'build-info.json');

export function readBuildInfo(clientDirectory) {
  try { return JSON.parse(fs.readFileSync(buildInfoPath(clientDirectory), 'utf8')); } catch { return null; }
}

/** Devuelve { status: 'ok' | 'stale' | 'unknown' | 'no-source', ... }. */
export function clientBuildStatus(clientDirectory) {
  // En la imagen Docker sólo viaja client/dist (sin vite.config.js): el build se hizo en la misma imagen.
  if (!fs.existsSync(path.join(clientDirectory, 'vite.config.js'))) return { status: 'no-source' };
  const info = readBuildInfo(clientDirectory);
  if (!info?.fingerprint) return { status: 'unknown' };
  const current = clientSourceFingerprint(clientDirectory);
  return { status: current === info.fingerprint ? 'ok' : 'stale', builtAt: info.builtAt, version: info.version };
}
