import test from 'node:test';
import assert from 'node:assert/strict';
import { ThemeService } from '../src/services/theme.js';
import { designStyle, normalizeDesign, storeColorMode } from '../src/services/design.js';

class Signals {
  listeners = new Map();
  addEventListener(name, callback) { const set = this.listeners.get(name) || new Set(); set.add(callback); this.listeners.set(name, set); }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name, event = {}) { this.listeners.get(name)?.forEach(callback => callback(event)); }
}
function fixture() {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const media = Object.assign(new Signals(), { matches: false });
  const events = new Signals();
  return { storage, media, events };
}

test('el modo elegido persiste y tiene prioridad sobre cambios del sistema', () => {
  const env = fixture();
  const service = new ThemeService(env);
  env.media.matches = true; env.media.emit('change');
  assert.equal(service.state.resolved, 'dark');
  service.toggle();
  env.media.matches = false; env.media.emit('change');
  env.media.matches = true; env.media.emit('change');
  assert.equal(service.state.resolved, 'light');
  const reload = new ThemeService(env);
  assert.equal(reload.state.resolved, 'light');
  service.dispose(); reload.dispose();
});

test('los documentos de vista previa reciben la preferencia y dejan de escuchar al liberarse', () => {
  const env = fixture();
  const first = new ThemeService(env), second = new ThemeService(env);
  first.setPreference('dark'); env.events.emit('storage', { key: 'mty:appearance' });
  assert.equal(second.state.resolved, 'dark');
  second.dispose(); first.setPreference('light'); env.events.emit('storage', { key: 'mty:appearance' });
  assert.equal(second.state.resolved, 'dark');
  first.dispose();
});

test('la apariencia sigue funcionando si el navegador bloquea el almacenamiento', () => {
  const service = new ThemeService({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
  service.setPreference('dark');
  assert.equal(service.state.resolved, 'dark');
  assert.throws(() => service.setPreference('invalid'), TypeError);
  service.dispose();
});

test('los diseños anteriores se completan sin mutarse y los colores incompletos no rompen la preview', () => {
  const old = { brand: { primary: '#00796b' }, shop: { heroTitle: 'Mi colección' } };
  const design = normalizeDesign(old);
  assert.equal(design.brand.colorMode, 'system');
  assert.equal(design.shop.showFeatured, true);
  assert.equal(old.brand.colorMode, undefined);
  assert.equal(storeColorMode(design, 'dark'), 'dark');
  assert.equal(storeColorMode({ brand: { colorMode: 'light' } }, 'dark'), 'light');
  const style = designStyle({ brand: { primary: '#1', background: '' } }, 'dark');
  assert.match(style['--store-primary'], /^#[a-f\d]{6}$/i);
  assert.equal(style['color-scheme'], 'dark');
  assert.equal(designStyle({ brand: { primary: '#777777' } })['--store-on-primary'], '#000000');
});
