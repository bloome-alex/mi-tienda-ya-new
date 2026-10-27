function metaContent(name) {
  return typeof document === 'undefined' ? '' : (document.querySelector(`meta[name="${name}"]`)?.content || '');
}

export const hostedStorefront = Object.freeze({
  slug: metaContent('mty-store-slug'),
  url: metaContent('mty-store-url'),
  pathUrl: metaContent('mty-store-path-url'),
  platformUrl: metaContent('mty-platform-url'),
  hosted: metaContent('mty-store-hosted') === '1',
});
export const platformUrl = hostedStorefront.platformUrl || (typeof location === 'undefined' ? '/' : location.origin);

/** A store can always be opened through /t/:slug. Clean routes are enabled only
 * when the current HTML was resolved by a custom/managed hostname. */
export function isHostedStorefront() { return Boolean(hostedStorefront.slug && hostedStorefront.hosted); }
export function storefrontSlug(route) { return String(route?.params?.slug || hostedStorefront.slug || ''); }
export function storefrontBasePath(route) { const slug=storefrontSlug(route); return route?.params?.slug ? `/t/${slug}` : ''; }
export function storefrontPath(route, suffix='') { return `${storefrontBasePath(route)}${suffix || ''}` || '/'; }

export function storePathFor(slug, suffix='') { return isHostedStorefront() && hostedStorefront.slug===String(slug||'') ? (suffix || '/') : `/t/${slug}${suffix || ''}`; }
