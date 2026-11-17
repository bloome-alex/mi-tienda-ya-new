import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientSourceFingerprint, buildInfoPath } from '../api/src/utils/clientBuild.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDirectory = path.join(root, 'client');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const info = { version, builtAt: new Date().toISOString(), fingerprint: clientSourceFingerprint(clientDirectory) };
fs.writeFileSync(buildInfoPath(clientDirectory), JSON.stringify(info, null, 2) + '\n');
console.log(`[build] client/dist/build-info.json · v${version} · ${info.fingerprint.slice(0, 12)}`);
