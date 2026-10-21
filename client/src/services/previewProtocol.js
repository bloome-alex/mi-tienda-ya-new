export const PREVIEW_MESSAGE = Object.freeze({
  ready: 'MTY_PREVIEW_READY',
  design: 'MTY_DESIGN_PREVIEW',
  location: 'MTY_PREVIEW_LOCATION',
  navigate: 'MTY_PREVIEW_NAVIGATE'
});

const idPattern = /^[a-f\d]{24}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Trust only the expected window, origin and store, even for ready messages. */
export function isTrustedPreviewMessage(event, { origin, source, storeId, types }) {
  const data = event?.data;
  return !!source && typeof origin === 'string' && origin !== 'null'
    && event.origin === origin && event.source === source
    && typeof storeId === 'string' && idPattern.test(storeId)
    && !!data && typeof data === 'object' && !Array.isArray(data)
    && data.storeId === storeId && types.includes(data.type);
}

/** Navigation commands accept known pages, never arbitrary URLs. */
export function previewSectionPath(section, slug, productId) {
  if (typeof slug !== 'string' || !slugPattern.test(slug)) return null;
  const base = `/t/${slug}`;
  if (section === 'shop') return base;
  if (section === 'cart') return `${base}/carrito`;
  if (section === 'checkout') return `${base}/checkout`;
  if (section === 'terms') return `${base}/terminos`;
  if (section === 'product' && typeof productId === 'string' && idPattern.test(productId)) {
    return `${base}/producto/${productId}`;
  }
  return null;
}

/** Read the page from a route within this store; queries and external URLs are rejected. */
export function readPreviewLocation(path, slug) {
  const base = previewSectionPath('shop', slug);
  if (!base || typeof path !== 'string') return null;
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  if (normalized === base) return { section: 'shop', path: normalized, productId: '' };
  if (normalized === `${base}/carrito`) return { section: 'cart', path: normalized, productId: '' };
  if (normalized === `${base}/checkout`) return { section: 'checkout', path: normalized, productId: '' };
  if (normalized === `${base}/terminos`) return { section: 'terms', path: normalized, productId: '' };
  const prefix = `${base}/producto/`;
  if (normalized.startsWith(prefix)) {
    const productId = normalized.slice(prefix.length);
    if (idPattern.test(productId)) return { section: 'product', path: normalized, productId };
  }
  return null;
}
