import { reactive } from 'vue';
import { storeColorMode } from './design.js';

const choices = new Set(['light', 'dark']);

/** Each store keeps its visitor preference separate from the platform and previews. */
export class StoreThemeService {
  constructor({ storage = null, media = null, events = null } = {}) {
    this.storage = storage;
    this.media = media;
    this.events = events;
    this.key = '';
    this.state = reactive({ preference: null, deviceAppearance: media?.matches ? 'dark' : 'light' });
    this.onMediaChange = () => { this.state.deviceAppearance = this.media?.matches ? 'dark' : 'light'; };
    this.onStorage = event => {
      if (this.key && (event.key === this.key || event.key === null)) this.state.preference = this.read();
    };
    media?.addEventListener?.('change', this.onMediaChange);
    events?.addEventListener?.('storage', this.onStorage);
  }

  useStore(identifier, { preview = false } = {}) {
    const key = identifier ? `mty:store-appearance:${encodeURIComponent(identifier)}${preview ? ':preview' : ''}` : '';
    if (this.key === key) return;
    this.key = key;
    this.state.preference = this.read();
  }

  read() {
    try {
      const value = this.key ? this.storage?.getItem(this.key) : null;
      return choices.has(value) ? value : null;
    } catch { return null; }
  }

  setPreference(value) {
    if (value !== null && !choices.has(value)) throw new TypeError('Modo de apariencia no válido.');
    this.state.preference = value;
    try {
      if (!this.key) return;
      if (value === null) this.storage?.removeItem(this.key);
      else this.storage?.setItem(this.key, value);
    } catch { /* A blocked storage must not prevent the visitor from changing appearance. */ }
  }

  resolved(design) { return storeColorMode(design, this.state.deviceAppearance, this.state.preference); }
  toggle(design) {
    if (!design?.brand?.allowThemeToggle) return;
    this.setPreference(this.resolved(design) === 'dark' ? 'light' : 'dark');
  }

  dispose() {
    this.media?.removeEventListener?.('change', this.onMediaChange);
    this.events?.removeEventListener?.('storage', this.onStorage);
  }
}

export function browserStoreThemeEnvironment() {
  if (typeof window === 'undefined') return {};
  let storage;
  try { storage = window.localStorage; } catch { storage = null; }
  return { storage, media: window.matchMedia?.('(prefers-color-scheme: dark)'), events: window };
}
