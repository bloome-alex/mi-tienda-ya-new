const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 25_000_000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export function validateImageFile(file) {
  if (!file || !IMAGE_TYPES.has(file.type)) throw new Error('Elegí una imagen JPG, PNG o WebP.');
  if (!file.size) throw new Error('La imagen está vacía. Elegí otro archivo.');
  if (file.size > MAX_IMAGE_SIZE) throw new Error('La imagen supera los 5 MiB permitidos. Reducí su peso y volvé a subirla.');
}
export function validateWallpaperDimensions(actual, specification = {}) {
  const label = specification.label || 'Fondo';
  if (!actual || !Number.isSafeInteger(actual.width) || !Number.isSafeInteger(actual.height) || actual.width < 1 || actual.height < 1) {
    throw new Error(`${label}: no se pudo determinar una resolución válida para la imagen.`);
  }
  if (actual.width * actual.height > MAX_IMAGE_PIXELS) {
    throw new Error(`${label}: la imagen mide ${actual.width} × ${actual.height} px y supera los 25 megapíxeles permitidos. Reducí su resolución y volvé a subirla.`);
  }
}
export async function orientedImageDimensions(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    } catch { /* Image.decode is the fallback for browsers without this decoder. */ }
  }
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch { throw new Error('No pudimos leer esa imagen. Probá volver a exportarla como JPG, PNG o WebP.'); }
  finally { URL.revokeObjectURL(source); }
}
