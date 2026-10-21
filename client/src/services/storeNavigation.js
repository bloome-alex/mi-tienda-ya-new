/** Presentation rules shared by navbar and catalog. No browser or framework state. */
export class StoreNavigationService {
  static title(settings, storeName = '') {
    if (settings?.showTitle === false) return '';
    return settings?.useStoreName === false ? String(settings.title || '').trim() : String(storeName || '').trim();
  }

  static visibleCategories(categories = []) {
    const items = categories.filter(item => item && !item.archived);
    const byId = new Map(items.map(item => [String(item._id), item]));
    const visibility = new Map();
    const visible = item => {
      const chain = [], visiting = new Set();
      let current = item, result = true;
      while (current) {
        const id = String(current._id);
        if (visibility.has(id)) { result = visibility.get(id); break; }
        if (visiting.has(id) || current.active === false) { result = false; break; }
        visiting.add(id); chain.push(current);
        const parentId = current.parentId?._id ?? current.parentId;
        if (!parentId) break;
        current = byId.get(String(parentId));
        if (!current) { result = false; break; }
      }
      for (const value of chain) visibility.set(String(value._id), result);
      return result;
    };
    return items.filter(visible);
  }

  static destination(item, { base, design, store, products = [], isPreview = false } = {}) {
    if (!base || !item?.enabled || !String(item.label || '').trim()) return null;
    const anchor = hash => ({ ...base, hash });
    const contact = design.shop.showContact && (store?.contact?.email || store?.contact?.phone || store?.contact?.showContactForm);
    if (item.target === 'home') return { ...base };
    if (item.target === 'catalog' && design.shop.showCatalog) return anchor('#catalogo');
    if (item.target === 'featured' && design.shop.showFeatured && products.some(product => product.active && !product.archived && product.featured)) return anchor('#destacados');
    if (item.target === 'contact' && contact) return anchor('#store-contact');
    if (item.target === 'terms' && design.terms.enabled) return { ...base, path: base.path + '/terminos' };
    const sections = design.sections || [];
    const section = item.target === 'social' ? sections.find(value => value.enabled && value.type === 'social' && this.socialLinks(value).length) : item.target === 'section' ? sections.find(value => value.id === item.sectionId && value.enabled) : null;
    if (section) return anchor('#store-section-' + section.id);
    return null;
  }

  static socialLinks(section) {
    return (section?.socialLinks || []).filter(item => {
      if (!item.enabled || !item.url) return false;
      try { const url = new URL(item.url); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
      catch { return false; }
    });
  }
}

export class StoreTextLayout {
  static style(alignment = 'inherit', direction = 'inherit') {
    return {
      textAlign: ['left', 'center', 'right'].includes(alignment) ? alignment : 'inherit',
      ...(direction === 'ltr' || direction === 'rtl' ? { direction } : {}),
    };
  }
  static direction(value = 'inherit') { return ['ltr', 'rtl', 'auto'].includes(value) ? value : undefined; }
}
