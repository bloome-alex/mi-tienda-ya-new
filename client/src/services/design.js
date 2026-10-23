/** Shared, serializable storefront contract. Keep this module free of browser/Vue dependencies. */
import { defaultStoreCopy } from './storeCopy.js';
export { storeTextFields, storeTextSections } from './storeCopy.js';
export const socialNetworks = Object.freeze([
  {value:'instagram',label:'Instagram'}, {value:'facebook',label:'Facebook'}, {value:'tiktok',label:'TikTok'},
  {value:'youtube',label:'YouTube'}, {value:'x',label:'X'}, {value:'linkedin',label:'LinkedIn'},
  {value:'pinterest',label:'Pinterest'}, {value:'threads',label:'Threads'}, {value:'twitch',label:'Twitch'},
  {value:'whatsapp',label:'WhatsApp'}, {value:'website',label:'Sitio web'}
]);
export const navItemTemplate = {id:'',target:'home',sectionId:'',label:'',enabled:true};
export const socialLinkTemplate = {id:'',network:'instagram',label:'',url:'',enabled:true};
export const wallpaperSpecs = Object.freeze({
  desktop: { width: 1920, height: 1080, recommended: true, label: 'Escritorio', purpose: 'wallpaper-desktop' },
  mobile: { width: 1080, height: 1920, recommended: true, label: 'Celular', purpose: 'wallpaper-mobile' },
  shared: { width: 1920, height: 1920, recommended: true, label: 'Ambos dispositivos', purpose: 'wallpaper-shared' }
});
export const slideTemplate = { id: '', image: '', title: '', subtitle: '', buttonText: '', buttonTarget: 'catalog' };
export const blockTemplate = { id: '', type: 'text', enabled: true, title: '', text: '', image: '', buttonText: 'Ver productos', buttonTarget: 'catalog', icon: 'star', alignment: 'inherit', textDirection: 'inherit' };
export const sectionTemplate = {
  id: '', type: 'text', enabled: true, title: '', subtitle: '', body: '', image: '',
  buttonText: '', buttonTarget: 'catalog', alignment: 'left', variant: 'plain',
  placement: 'afterCatalog', paddingX: 32, paddingY: 48, fullWidth: false,
  background: 'surface', columns: 3, mobileColumns: 1, textDirection: 'inherit', socialVariant: 'labels', socialIconSize: 24, socialNewTab: true, socialLinks: [], blocks: []
};
export const defaultDesign = {
  brand: {
    primary: '#18181b', accent: '#71717a', background: '#ffffff', text: '#202024',
    darkPrimary: '#72e3ad', darkAccent: '#5bc5f4', darkBackground: '#050607', darkText: '#f1e7d9',
    font: 'modern', radius: 10, logo: '', favicon: '', colorMode: 'system', allowThemeToggle: true, textDirection: 'ltr'
  },
  navbar: {height:82,mobileHeight:72,paddingX:32,sticky:true,title:'',useStoreName:true,showTitle:true,logoWidth:160,logoHeight:48,mobileLogoWidth:120,mobileLogoHeight:40,logoShape:'natural',logoRadius:12,logoFit:'contain',linksAlign:'center',links:[{...navItemTemplate,id:'home',target:'home',label:'Tienda'},{...navItemTemplate,id:'contact',target:'contact',label:'Contacto'}]},
  copy: { ...defaultStoreCopy },
  wallpaper: { enabled: false, mode: 'shared', desktopImage: '', mobileImage: '', sharedImage: '', overlay: 15, darkOverlay: 35, position: 'center', attachment: 'scroll', fit: 'cover' },
  shop: {
    announcementAlign:'center',announcementDirection:'inherit',heroDirection:'inherit',featuredAlign:'left',featuredDirection:'inherit',catalogAlign:'left',catalogDirection:'inherit',cardAlign:'left',cardDirection:'inherit',contactAlign:'left',contactDirection:'inherit',footerAlign:'left',footerDirection:'inherit',categoryNavigation:'chips',categoryPanelAnimation:'slide',categoryPanelDuration:260,
    layout: 'minimal', announcement: 'Tu próxima elección está acá.', showAnnouncement: true,
    heroTitle: 'Tu estilo. Tus elegidos.', heroSubtitle: 'Descubrí nuestra colección y encontrá algo para vos.',
    heroImage: '', heroButton: 'Ver productos', showHero: true,
    heroVariant: 'split', heroShowText: true, heroShowButton: true, heroAlign: 'left', heroTextColor: '#ffffff', heroOverlay: 35,
    heroHeight: 480, heroMobileHeight: 400, heroFullWidth: false, heroPaddingX: 32, heroPaddingY: 40,
    heroSlides: [], heroAutoplay: false, heroInterval: 5,
    showSearch: true, showCategories: true, showCatalog: true, catalogTitle: 'Descubrí nuestra colección',
    showFeatured: true, featuredTitle: 'Productos destacados', featuredLayout: 'grid', featuredAutoplay: false,
    featuredInterval: 4, featuredSpeed: 500, featuredLoop: true, featuredPauseOnHover: true,
    featuredPaddingX: 32, featuredPaddingY: 48, featuredFullWidth: false, featuredColumns: 3, featuredMobileColumns: 2,
    catalogPaddingX: 32, catalogPaddingY: 48, catalogFullWidth: false, catalogVariant: 'grid', catalogColumns: 3, catalogMobileColumns: 2,
    columns: 3, imageRatio: 'square', cardVariant: 'minimal', cardShowButton: true, productHoverSwap: false, productHoverEffect: 'none',
    showPreviousPrice: true, showStock: false, showDescription: true,
    footerText: 'Gracias por elegir nuestro negocio.', showContact: true, footerPaddingX: 32, footerPaddingY: 48
  },
  product: {
    textAlign:'left',textDirection:'inherit',
    galleryLayout: 'thumbnails', galleryColumns: 2, galleryMobileColumns: 2, layout: 'classic', paddingX: 32, paddingY: 48, fullWidth: false,
    showBreadcrumbs: true, showCategory: true, showStock: true, showSku: false,
    showRelated: true, showRecommendations: true, relatedTitle: 'Completá tu elección', recommendationTitle: 'También te puede interesar',
    addButton: 'Agregar al carrito', madeToOrderText: 'Lo hacemos especialmente para vos.', showShare: true
  },
  cart: {
    textAlign:'left',textDirection:'inherit',
    title: 'Tu carrito', layout: 'split', summaryStyle: 'card', paddingX: 32, paddingY: 48, fullWidth: false,
    showImages: true, showRecommendations: true, recommendationTitle: 'Quedan bien juntos', showNotes: true,
    showContinueShopping: true, buttonText: 'Continuar con mi compra', emptyText: 'Todavía no hay productos en tu carrito.', trustMessage: 'Tu pedido se prepara con mucho cuidado.'
  },
  checkout: {
    textAlign:'left',textDirection:'inherit',
    title: 'Ya casi es tuyo', layout: 'steps', style: 'cards', paddingX: 32, paddingY: 48, fullWidth: false,
    showOrderSummary: true, showPhone: true, requirePhone: false, showNotes: true, showTrust: true, trustMessage: 'Tus datos están protegidos.',
    thankYouTitle: '¡Gracias por tu compra!', thankYouMessage: 'Tu pago fue confirmado. Podés consultar el estado de la entrega desde esta página.',
    termsUrl: '', termsLabel: 'Acepto los términos y condiciones'
  },
  terms: { textAlign:'left',textDirection:'inherit',enabled: false, title: 'Términos y condiciones', intro: '', content: '', showUpdatedAt: true, updatedAt: '', contentWidth: 'narrow', paddingX: 32, paddingY: 48 },
  sections: []
};

export const designEnums = {
  'brand.textDirection':['ltr','rtl','auto'],
  'navbar.logoShape':['natural','square','rounded','circle'], 'navbar.logoFit':['contain','cover'], 'navbar.linksAlign':['left','center','right'],
  'navbar.links.*.target':['home','catalog','featured','contact','terms','social','section'],
  'shop.categoryNavigation':['chips','navbar','drawer','select','sidebar'], 'shop.categoryPanelAnimation':['slide','fade','scale'],
  ...Object.fromEntries(['announcement','hero','featured','catalog','card','contact','footer'].map(key=>['shop.'+key+'Direction',['inherit','ltr','rtl','auto']])),
  ...Object.fromEntries(['announcement','featured','catalog','card','contact','footer'].map(key=>['shop.'+key+'Align',['left','center','right']])),
  ...Object.fromEntries(['product','cart','checkout','terms'].flatMap(key=>[[key+'.textAlign',['left','center','right']],[key+'.textDirection',['inherit','ltr','rtl','auto']]])),
  'sections.*.textDirection':['inherit','ltr','rtl','auto'], 'sections.*.blocks.*.alignment':['inherit','left','center','right'], 'sections.*.blocks.*.textDirection':['inherit','ltr','rtl','auto'],
  'sections.*.socialVariant':['icons','labels','cards'], 'sections.*.socialLinks.*.network':socialNetworks.map(network=>network.value),
  'brand.font': ['modern', 'classic', 'friendly'], 'brand.colorMode': ['system', 'light', 'dark'],
  'wallpaper.mode': ['responsive', 'shared'], 'wallpaper.position': ['center', 'top', 'bottom'], 'wallpaper.attachment': ['scroll', 'fixed'], 'wallpaper.fit': ['cover', 'contain'],
  'shop.layout': ['editorial', 'minimal', 'bold'], 'shop.imageRatio': ['square', 'portrait', 'landscape'],
  'shop.heroVariant': ['split', 'cover', 'image', 'centered', 'carousel'], 'shop.heroAlign': ['left', 'center', 'right'],
  'shop.featuredLayout': ['grid', 'rail'], 'shop.catalogVariant': ['grid', 'compact', 'editorial'],
  'shop.cardVariant': ['minimal', 'bordered', 'elevated', 'overlay'], 'shop.productHoverEffect': ['none', 'lift', 'zoom'],
  'product.galleryLayout': ['thumbnails', 'grid'], 'product.layout': ['classic', 'focus', 'wide'],
  'cart.layout': ['split', 'stacked'], 'cart.summaryStyle': ['card', 'minimal'],
  'checkout.layout': ['steps', 'single'], 'checkout.style': ['cards', 'minimal'], 'terms.contentWidth': ['narrow', 'normal', 'wide'],
  'sections.*.type': ['text', 'imageText', 'banner', 'benefits', 'faq', 'gallery', 'social'],
  'sections.*.alignment': ['left', 'center', 'right'], 'sections.*.variant': ['plain', 'card', 'contrast', 'split', 'overlay'],
  'sections.*.placement': ['beforeCatalog', 'afterCatalog'], 'sections.*.background': ['transparent', 'surface', 'muted', 'contrast'],
  'sections.*.blocks.*.type': ['text', 'image', 'button', 'benefit', 'faq'],
  'sections.*.blocks.*.icon': ['star', 'heart', 'truck', 'shield', 'store', 'package', 'check', 'gift', 'mail'],
  'sections.*.buttonTarget': ['catalog', 'contact', 'terms'], 'sections.*.blocks.*.buttonTarget': ['catalog', 'contact', 'terms'],
  'shop.heroSlides.*.buttonTarget': ['catalog', 'contact', 'terms']
};
export const designNumberRanges = {
  'navbar.height':[48,220], 'navbar.mobileHeight':[48,160], 'navbar.paddingX':[0,120],
  'navbar.logoWidth':[24,480], 'navbar.logoHeight':[24,200], 'navbar.mobileLogoWidth':[24,280], 'navbar.mobileLogoHeight':[24,144], 'navbar.logoRadius':[0,100],
  'sections.*.socialIconSize':[16,64],
  'brand.radius': [0, 40], 'wallpaper.overlay': [0, 90], 'wallpaper.darkOverlay': [0, 90],
  'shop.columns': [1, 5], 'shop.featuredColumns': [1, 5], 'shop.featuredMobileColumns': [1, 4], 'shop.catalogColumns': [1, 5], 'shop.catalogMobileColumns': [1, 4], 'product.galleryColumns': [1, 4], 'product.galleryMobileColumns': [1, 4], 'shop.heroOverlay': [0, 90], 'shop.heroHeight': [240, 900], 'shop.heroMobileHeight': [200, 800],
  'shop.heroInterval': [3, 20], 'shop.featuredInterval': [2, 20], 'shop.featuredSpeed': [150, 1500], 'shop.categoryPanelDuration': [120, 700], 'sections.*.columns': [1, 4], 'sections.*.mobileColumns': [1, 4]
};

function mergeKnown(base, value, path = '') {
  if (Array.isArray(base)) {
    if (value === undefined || value === null) return structuredClone(base);
    if (!Array.isArray(value)) return value;
    const template = path === 'sections' ? sectionTemplate : path.endsWith('.blocks') ? blockTemplate : path.endsWith('.socialLinks') ? socialLinkTemplate : path === 'navbar.links' ? navItemTemplate : path === 'shop.heroSlides' ? slideTemplate : null;
    return template ? value.map(item => item && typeof item === 'object' && !Array.isArray(item) ? mergeKnown(template, item, path + '.*') : item) : value.map(item => structuredClone(item));
  }
  if (base && typeof base === 'object') {
    if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) return value;
    return Object.fromEntries(Object.entries(base).map(([key, fallback]) => [key, mergeKnown(fallback, value?.[key], path ? path + '.' + key : key)]));
  }
  return value === undefined || value === null ? base : value;
}
export function normalizeDesign(value) {
  const normalized = mergeKnown(defaultDesign, value);
  // Before v1.3 a supplied logo replaced the navbar title. Preserve that initial presentation.
  if (!value?.navbar && value?.brand?.logo) normalized.navbar.showTitle = false;
  // v1.6 splits product grids by section while preserving the desktop density chosen in previous versions.
  if (value?.shop) {
    const legacyColumns = Number.isSafeInteger(value.shop.columns) ? Math.min(5, Math.max(1, value.shop.columns)) : normalized.shop.columns;
    if (value.shop.catalogColumns === undefined) normalized.shop.catalogColumns = legacyColumns;
    if (value.shop.featuredColumns === undefined) normalized.shop.featuredColumns = legacyColumns;
  }
  // Custom sections used one column on small phones before v1.6. Keep that result until the seller chooses another mobile density.
  if (Array.isArray(value?.sections)) normalized.sections.forEach((section,index)=>{ if (value.sections[index]?.mobileColumns === undefined) section.mobileColumns = 1; });
  // Existing stores keep their previous automatic dark primary until they customize it.
  if (normalized?.brand && value?.brand && value.brand.darkPrimary === undefined && /^#[a-f\d]{6}$/i.test(value.brand.primary || '')) {
    const color = value.brand.primary, channels = rgb(color);
    normalized.brand.darkPrimary = luminance(color) < 0.25 ? (Math.max(...channels) - Math.min(...channels) < 25 ? '#72e3ad' : mix(color, '#72e3ad', 0.55)) : color;
  }
  return normalized;
}
export function createDesignSection(type, id) {
  const section = { ...structuredClone(sectionTemplate), id, type };
  const child = (suffix, data) => ({ ...structuredClone(blockTemplate), id: id + '-' + suffix, ...data });
  const presets = {
    text: { title: 'Conocé nuestra historia', body: 'Contá qué hace especial a tu tienda.', variant: 'plain' },
    imageText: { title: 'Hecho para vos', body: 'Un espacio para presentar tu colección, tus materiales o tu forma de trabajar.', variant: 'split', buttonText: 'Ver colección' },
    banner: { title: 'Una nueva colección te espera', subtitle: 'Tus próximos favoritos están acá.', variant: 'contrast', background: 'contrast', alignment: 'center', buttonText: 'Descubrir productos' },
    benefits: { title: 'Comprá con confianza', columns: 3, blocks: [child('1', { type: 'benefit', title: 'Atención cercana', text: 'Te acompañamos en cada compra.', icon: 'heart' }), child('2', { type: 'benefit', title: 'Entrega coordinada', text: 'Elegí la forma de recibir tu pedido.', icon: 'truck' }), child('3', { type: 'benefit', title: 'Cada detalle cuenta', text: 'Preparamos tu pedido con dedicación.', icon: 'package' })] },
    faq: { title: 'Preguntas frecuentes', columns: 1, blocks: [child('1', { type: 'faq', title: '¿Cómo recibo mi pedido?', text: 'Revisá las opciones disponibles al realizar tu compra.' })] },
    social: { title:'Encontranos en redes',subtitle:'Seguí nuestras novedades y conocé más de la tienda.',alignment:'center',variant:'plain',background:'transparent',socialVariant:'labels',socialLinks:[],blocks:[] },
    gallery: { title: 'Inspiración para tu día a día', columns: 3, blocks: [child('1', { type: 'image', title: 'Tu colección' }), child('2', { type: 'image', title: 'Tus favoritos' }), child('3', { type: 'image', title: 'Novedades' })] }
  };
  return Object.assign(section, presets[type] || presets.text);
}
export function sectionSpacing(settings = {}) {
  const safe = (value, fallback) => Number.isFinite(Number(value)) ? Math.min(160, Math.max(0, Number(value))) : fallback;
  return { '--section-px': safe(settings.paddingX, 32) + 'px', '--section-py': safe(settings.paddingY, 48) + 'px', '--section-max': settings.fullWidth ? '100%' : '1280px' };
}
function rgb(color) { return [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)); }
function mix(left, right, amount) { return '#' + rgb(left).map((n, i) => Math.round(n * (1 - amount) + rgb(right)[i] * amount).toString(16).padStart(2, '0')).join(''); }
function luminance(color) { return rgb(color).map(n => n / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0); }
function readableOn(color) { return luminance(color) > 0.179 ? '#000000' : '#ffffff'; }
export function storeColorMode(design, appearance = 'light', customerPreference = null) {
  if (design?.brand?.allowThemeToggle && ['light', 'dark'].includes(customerPreference)) return customerPreference;
  const mode = design?.brand?.colorMode;
  return mode === 'dark' || mode === 'light' ? mode : (appearance === 'dark' ? 'dark' : 'light');
}
export function designStyle(design, appearance = 'light', customerPreference = null) {
  const d = normalizeDesign(design);
  for (const key of ['primary','accent','background','text','darkPrimary','darkAccent','darkBackground','darkText']) if (!/^#[a-f\d]{6}$/i.test(d.brand[key])) d.brand[key] = defaultDesign.brand[key];
  const font = d.brand.font === 'classic' ? 'Georgia, serif' : d.brand.font === 'friendly' ? "'Trebuchet MS', sans-serif" : "'Inter', 'Segoe UI', sans-serif";
  const dark = storeColorMode(d, appearance, customerPreference) === 'dark';
  const primary = dark ? d.brand.darkPrimary : d.brand.primary;
  const background = dark ? d.brand.darkBackground : d.brand.background;
  const text = dark ? d.brand.darkText : d.brand.text;
  const surface = dark ? mix(background, text, 0.04) : d.brand.background;
  const alternate = mix(background, text, dark ? 0.08 : 0.035);
  const line = mix(background, text, dark ? 0.18 : 0.14);
  const muted = mix(text, background, dark ? 0.32 : 0.35);
  return {
    '--store-primary': primary, '--store-on-primary': readableOn(primary), '--store-accent': dark ? d.brand.darkAccent : d.brand.accent,
    '--store-bg': background, '--store-text': text, '--store-surface': surface, '--store-surface-alt': alternate,
    '--store-muted': muted, '--store-line': line, '--store-radius': `${d.brand.radius}px`, '--store-font': font, '--store-cols': String(d.shop.catalogColumns), '--store-mobile-cols': String(d.shop.catalogMobileColumns),
    '--primary': primary, '--primary-dark': dark ? mix(primary, '#000000', 0.15) : mix(primary, '#ffffff', 0.13), '--on-primary': readableOn(primary),
    '--surface': surface, '--surface-alt': alternate, '--surface-strong': mix(background, text, dark ? 0.16 : 0.08),
    '--bg': background, '--text': text, '--text-secondary': text, '--muted': muted, '--line': line, 'color-scheme': dark ? 'dark' : 'light'
  };
}
