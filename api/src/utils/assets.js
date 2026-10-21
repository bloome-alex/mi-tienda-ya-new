const designImageKeys = new Set(['logo', 'favicon', 'heroImage', 'image', 'desktopImage', 'mobileImage', 'sharedImage']);
export function collectDesignImageUrls(design) {
  const urls = new Set();
  function visit(value, key = '') {
    if (typeof value === 'string') { if (value && designImageKeys.has(key)) urls.add(value); return; }
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (value && typeof value === 'object') for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
  }
  visit(design);
  return [...urls];
}
