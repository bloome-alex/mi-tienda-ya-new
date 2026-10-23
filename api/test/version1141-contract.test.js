import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('WhatsApp activa no-sandbox automaticamente cuando Node corre como root', async () => {
  const config = await read('src/config.js');
  assert.match(config, /process\.getuid/);
  assert.match(config, /process\.getuid\(\) === 0/);
  assert.match(config, /WHATSAPP_NO_SANDBOX/);
});

test('Puppeteer usa flags compatibles con Chromium en servidor', async () => {
  const whatsapp = await read('src/services/WhatsAppService.js');
  for (const flag of [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
  ]) assert.match(whatsapp, new RegExp(flag.replaceAll('-', '\\-')));
  assert.match(whatsapp, /puppeteerArgs/);
  assert.match(whatsapp, /args:\s*puppeteerArgs/);
});
