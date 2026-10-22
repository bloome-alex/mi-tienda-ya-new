export const hostedStorefront = Object.freeze({
  slug: typeof document === 'undefined' ? '' : (document.querySelector('meta[name="mty-store-slug"]')?.content || ''),
  url: typeof document === 'undefined' ? '' : (document.querySelector('meta[name="mty-store-url"]')?.content || ''),
  platformUrl: typeof document === 'undefined' ? '' : (document.querySelector('meta[name="mty-platform-url"]')?.content || ''),
});
export const platformUrl = hostedStorefront.platformUrl || (typeof location === 'undefined' ? '/' : location.origin);

export function isHostedStorefront() { return Boolean(hostedStorefront.slug); }
export function storefrontSlug(route) { return String(route?.params?.slug || hostedStorefront.slug || ''); }
export function storefrontBasePath(route) { const slug=storefrontSlug(route); return route?.params?.slug ? `/t/${slug}` : ''; }
export function storefrontPath(route, suffix='') { return `${storefrontBasePath(route)}${suffix || ''}` || '/'; }

export function storePathFor(slug, suffix='') { return hostedStorefront.slug && hostedStorefront.slug===String(slug||'') ? (suffix || '/') : `/t/${slug}${suffix || ''}`; }

