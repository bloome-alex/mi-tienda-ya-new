import { defaultDesign, normalizeDesign, sectionTemplate, blockTemplate, slideTemplate, navItemTemplate, socialLinkTemplate, storeTextFields, designEnums, designNumberRanges } from '../../../client/src/services/design.js';
import { AppError } from '../middleware/core.js';

const arrays = { sections: [sectionTemplate, 12], 'sections.*.blocks': [blockTemplate, 12], 'shop.heroSlides': [slideTemplate, 8], 'navbar.links': [navItemTemplate, 12], 'sections.*.socialLinks': [socialLinkTemplate, 12] };
const copyLimits = Object.fromEntries(storeTextFields.map(field=>['copy.'+field.key,field.max]));
const colors = new Set(['primary', 'accent', 'background', 'text', 'darkPrimary', 'darkAccent', 'darkBackground', 'darkText']);
const imageKeys = new Set(['logo', 'favicon', 'heroImage', 'image', 'desktopImage', 'mobileImage', 'sharedImage']);
const fail = (field, message) => { throw new AppError(message, 422, 'INVALID_DESIGN', [{ field, message }]); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function isDesignUrl(value) {
  if (!value) return true;
  if (/^\/uploads\/images\/[a-zA-Z0-9_.-]+$/.test(value) || /^\/demo\/[a-z0-9-]+\.svg$/.test(value)) return true;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !/[\s\\]/.test(value); } catch { return false; }
}

/** Validate the untrusted shape before normalization, which fills omissions for
 * stores created with previous versions. No type coercion is applied. */
export function validateDesign(input) {
  if (!object(input)) fail('design', 'El diseño debe ser un objeto.');
  const seen = new WeakSet(); let nodes = 0;
  function inspect(value, depth = 0) {
    if (++nodes > 20000 || depth > 8) fail('design', 'El diseño tiene demasiados elementos o niveles.');
    if (value && typeof value === 'object') {
      if (seen.has(value)) fail('design', 'El diseño contiene referencias circulares.');
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('design', 'Campo de diseño no permitido.');
        inspect(child, depth + 1);
      }
      seen.delete(value);
    }
  }
  inspect(input);
  let size;
  try { size = JSON.stringify(input).length; } catch { fail('design', 'El diseño no se puede guardar.'); }
  if (size > 160000) fail('design', 'El diseño supera los 160.000 caracteres permitidos.');
  const normalized = normalizeDesign(input);
  function check(value, provided, template, field = '') {
    if (Array.isArray(template)) {
      if (!Array.isArray(value) || (provided !== undefined && !Array.isArray(provided))) fail(field, 'El campo ' + field + ' debe ser una lista.');
      const [itemTemplate, max] = arrays[field];
      if (value.length > max) fail(field, 'El campo ' + field + ' admite hasta ' + max + ' elementos.');
      const ids = new Set();
      value.forEach((item, index) => {
        check(item, provided?.[index], itemTemplate, field + '.*');
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || ids.has(item.id)) fail(field + '.' + index + '.id', 'Cada elemento necesita un identificador válido y único dentro de su lista.');
        ids.add(item.id);
      });
      return;
    }
    if (object(template)) {
      if (!object(value) || (provided !== undefined && !object(provided))) fail(field, 'La sección ' + (field || 'diseño') + ' debe ser un objeto.');
      for (const [key, fallback] of Object.entries(template)) check(value[key], provided?.[key], fallback, field ? field + '.' + key : key);
      return;
    }
    if (typeof value !== typeof template || (provided !== undefined && typeof provided !== typeof template)) fail(field, 'El campo ' + field + ' no tiene el formato esperado.');
    if (designEnums[field] && !designEnums[field].includes(value)) fail(field, 'La opción ' + field + ' no es válida.');
    const key = field.split('.').at(-1);
    if (typeof value === 'number') {
      const range = designNumberRanges[field] || (/padding[XY]$/i.test(key) ? [0, 160] : null);
      if (!Number.isSafeInteger(value) || (range && (value < range[0] || value > range[1]))) fail(field, 'El campo ' + field + ' debe ser un entero' + (range ? ' entre ' + range[0] + ' y ' + range[1] : '') + '.');
    }
    if (typeof value === 'string') {
      const url = imageKeys.has(key) || key === 'termsUrl' || field === 'sections.*.socialLinks.*.url';
      const max = copyLimits[field] ?? (field === 'terms.content' ? 20000 : url ? 2048 : /title$/i.test(key) ? 240 : key === 'label' ? 120 : 4000);
      if (value.length > max) fail(field, 'El campo ' + field + ' admite hasta ' + max + ' caracteres.');
      if ((field.startsWith('brand.') && colors.has(key)) || field === 'shop.heroTextColor') if (!/^#[a-f\d]{6}$/i.test(value)) fail(field, 'Los colores deben tener formato hexadecimal de seis dígitos.');
      if (url && !isDesignUrl(value)) fail(field, 'Ingresá una URL HTTP/HTTPS válida o una imagen subida para ' + field + '.');
      if (field === 'sections.*.socialLinks.*.url' && value) {
        let parsed;
        try { parsed = new URL(value); } catch { fail(field, 'Ingresá el enlace completo de la red social, con https://.'); }
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || /[\s\\]/.test(value)) fail(field, 'El enlace de la red debe usar HTTP o HTTPS y no puede incluir credenciales.');
      }
      if (field === 'navbar.links.*.sectionId' && value && !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) fail(field, 'Elegí una sección válida de la tienda para el enlace.');
      if (field === 'terms.updatedAt' && value) {
        const parsed = new Date(value + 'T00:00:00.000Z');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) fail(field, 'La fecha debe ser una fecha real con formato AAAA-MM-DD.');
      }
    }
  }
  check(normalized, input, defaultDesign);
  for (const item of normalized.navbar.links) if (item.enabled && item.target === 'section' && !item.sectionId) fail('navbar.links', 'Elegí la sección a la que llevará cada enlace habilitado.');
  for (const section of normalized.sections) if (section.type === 'social' && section.enabled) for (const link of section.socialLinks) if (link.enabled && !link.url.trim()) fail('sections', 'Completá el enlace de cada red social visible o desactivala.');
  if (normalized.terms.enabled && (!normalized.terms.title.trim() || !normalized.terms.content.trim())) fail('terms', 'Completá el título y el contenido de los términos para publicarlos.');
  if (normalized.wallpaper.enabled) {
    const required = normalized.wallpaper.mode === 'responsive' ? ['desktopImage', 'mobileImage'] : ['sharedImage'];
    if (required.some(key => !normalized.wallpaper[key])) fail('wallpaper', normalized.wallpaper.mode === 'responsive' ? 'Subí un fondo para escritorio y otro para celular.' : 'Subí el fondo compartido para ambos dispositivos.');
  }
  return normalized;
}
