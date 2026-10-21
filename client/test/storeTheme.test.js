import test from 'node:test';
import assert from 'node:assert/strict';
import { StoreThemeService } from '../src/services/storeTheme.js';

class Events {
  handlers = new Map();
  addEventListener(type, callback) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(callback); }
  removeEventListener(type, callback) { this.handlers.get(type)?.delete(callback); }
  emit(type, event = {}) { for (const handler of this.handlers.get(type) || []) handler(event); }
  count() { return [...this.handlers.values()].reduce((sum, handlers) => sum + handlers.size, 0); }
}
function fixture() {
  const values = new Map([['mty:appearance', 'dark']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const media = Object.assign(new Events(), { matches: false }), events = new Events();
  return { values, storage, media, events };
}
const design = (colorMode = 'system', allowThemeToggle = true) => ({ brand: { colorMode, allowThemeToggle } });

test('la elección se conserva por tienda y queda separada de otras tiendas, de la vista previa y del panel', () => {
  const env = fixture(), theme = new StoreThemeService(env);
  theme.useStore('tienda-a');
  assert.equal(theme.state.preference, null);
  assert.equal(theme.resolved(design()), 'light');
  theme.toggle(design());
  assert.equal(theme.resolved(design()), 'dark');
  const reloaded = new StoreThemeService(env);
  reloaded.useStore('tienda-a');
  assert.equal(reloaded.state.preference, 'dark');
  theme.useStore('tienda-b');
  assert.equal(theme.state.preference, null);
  theme.setPreference('light');
  theme.useStore('tienda-a', { preview: true });
  assert.equal(theme.state.preference, null);
  theme.setPreference('light');
  theme.useStore('tienda-a');
  assert.equal(theme.state.preference, 'dark');
  assert.equal(env.values.get('mty:appearance'), 'dark');
  assert.equal(env.values.get('mty:store-appearance:tienda-a:preview'), 'light');
  assert.equal(env.values.get('mty:store-appearance:tienda-b'), 'light');
  theme.dispose(); reloaded.dispose();
});

test('un modo inicial fijo permite elegir el opuesto y deshabilitar el control vuelve a respetar el modo de la tienda', () => {
  const theme = new StoreThemeService(fixture());
  theme.useStore('tienda');
  assert.equal(theme.resolved(design('dark')), 'dark');
  theme.toggle(design('dark'));
  assert.equal(theme.resolved(design('dark')), 'light');
  assert.equal(theme.resolved(design('dark', false)), 'dark');
  theme.toggle(design('dark', false));
  assert.equal(theme.state.preference, 'light');
  assert.equal(theme.resolved(design('dark', true)), 'light');
  theme.setPreference('dark');
  assert.equal(theme.resolved(design('light', false)), 'light');
  theme.dispose();
});

test('el modo de dispositivo sigue cambios del sistema sin sobrescribir la selección del visitante', () => {
  const env = fixture(), theme = new StoreThemeService(env);
  theme.useStore('tienda');
  env.media.matches = true; env.media.emit('change');
  assert.equal(theme.resolved(design()), 'dark');
  theme.setPreference('light');
  assert.equal(theme.resolved(design()), 'light');
  theme.setPreference(null);
  assert.equal(theme.resolved(design()), 'dark');
  assert.equal(env.values.has(theme.key), false);
  theme.dispose();
});

test('un almacenamiento bloqueado no impide cambiar la apariencia ni liberar los listeners', () => {
  const env = fixture();
  env.storage = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); }, removeItem() { throw new Error('Blocked'); } };
  const theme = new StoreThemeService(env);
  theme.useStore('tienda'); theme.toggle(design('light'));
  assert.equal(theme.resolved(design('light')), 'dark');
  assert.doesNotThrow(() => theme.setPreference(null));
  assert.equal(env.media.count(), 1); assert.equal(env.events.count(), 1);
  theme.dispose();
  assert.equal(env.media.count(), 0); assert.equal(env.events.count(), 0);
});

test('los eventos entre pestañas sólo leen la tienda actual e ignoran preferencias inválidas', () => {
  const env = fixture(), theme = new StoreThemeService(env);
  theme.useStore('tienda');
  env.values.set(theme.key, 'dark'); env.events.emit('storage', { key: 'mty:appearance' });
  assert.equal(theme.state.preference, null);
  env.events.emit('storage', { key: theme.key });
  assert.equal(theme.state.preference, 'dark');
  env.values.set(theme.key, 'invalid'); env.events.emit('storage', { key: theme.key });
  assert.equal(theme.state.preference, null);
  assert.throws(() => theme.setPreference('system'), /no válido/);
  theme.setPreference('dark'); env.values.delete(theme.key); env.events.emit('storage', { key: null });
  assert.equal(theme.state.preference, null);
  theme.dispose();
  env.media.matches = true; env.media.emit('change');
  assert.equal(theme.state.deviceAppearance, 'light');
});
