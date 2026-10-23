import { reactive } from 'vue';

const STORAGE_KEY = 'mty:appearance';
const preferences = new Set(['system', 'light', 'dark']);

/** Preferencia de apariencia compartida entre el panel, las tiendas y sus previews. */
export class ThemeService {
  constructor({ storage = null, media = null, document: doc = null, events = null } = {}) {
    this.storage = storage;
    this.media = media;
    this.document = doc;
    this.events = events;
    this.state = reactive({ preference: this.read(), resolved: 'light' });
    this.onMediaChange = () => { if (this.state.preference === 'system') this.apply(); };
    this.onStorage = event => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      this.state.preference = this.read();
      this.apply();
    };
    media?.addEventListener?.('change', this.onMediaChange);
    events?.addEventListener?.('storage', this.onStorage);
    this.apply();
  }

  read() {
    try { const value = this.storage?.getItem(STORAGE_KEY); return preferences.has(value) ? value : 'system'; }
    catch { return 'system'; }
  }

  setPreference(value) {
    if (!preferences.has(value)) throw new TypeError('Modo de apariencia no válido.');
    this.state.preference = value;
    try { this.storage?.setItem(STORAGE_KEY, value); } catch { /* El cambio sigue funcionando sin almacenamiento. */ }
    this.apply();
  }

  toggle() { this.setPreference(this.state.resolved === 'dark' ? 'light' : 'dark'); }

  apply() {
    this.state.resolved = this.state.preference === 'system' ? (this.media?.matches ? 'dark' : 'light') : this.state.preference;
    if (!this.document) return;
    this.document.documentElement.dataset.theme = this.state.resolved;
    this.document.documentElement.style.colorScheme = this.state.resolved;
    const meta = this.document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = this.state.resolved === 'dark' ? '#050607' : '#ffffff';
  }

  dispose() {
    this.media?.removeEventListener?.('change', this.onMediaChange);
    this.events?.removeEventListener?.('storage', this.onStorage);
  }
}

function browserEnvironment() {
  if (typeof window === 'undefined') return {};
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  return { storage, media: window.matchMedia?.('(prefers-color-scheme: dark)'), document: window.document, events: window };
}

export const themeService = new ThemeService(browserEnvironment());
export const theme = themeService.state;
