import { watch, onUnmounted, toValue } from 'vue';
import { designStyle } from './design.js';
import { theme } from './theme.js';

// Conservar la identidad de la plataforma al salir de una tienda.
const defaultIcon = document.querySelector('link[rel="icon"]');
const originalIcon = { href: defaultIcon?.getAttribute('href') || '/icons/icon.svg', type: defaultIcon?.getAttribute('type') || 'image/svg+xml' };
let activeOwner;

export function useStoreBranding(design, { appearance = () => theme.resolved, preference = () => null } = {}) {
  const owner = Symbol('store-branding');
  watch(() => [toValue(design)?.brand, toValue(appearance), toValue(preference), theme.resolved], ([brand, deviceAppearance, customerPreference]) => {
    activeOwner = owner;
    let icon = document.querySelector('link[rel="icon"]');
    if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); }
    if (brand?.favicon) { icon.href = brand.favicon; icon.removeAttribute('type'); }
    else { icon.setAttribute('href', originalIcon.href); icon.setAttribute('type', originalIcon.type); }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = designStyle(toValue(design), deviceAppearance, customerPreference)['--store-surface'];
  }, { immediate: true, deep: true });
  onUnmounted(() => {
    if (activeOwner !== owner) return;
    activeOwner = undefined;
    const icon = document.querySelector('link[rel="icon"]');
    icon?.setAttribute('href', originalIcon.href);
    icon?.setAttribute('type', originalIcon.type);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme.resolved === 'dark' ? '#050607' : '#ffffff';
  });
}
