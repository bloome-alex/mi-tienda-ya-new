// Validaciones del editor de diseño. Reflejan las reglas del servidor para avisar antes de guardar.
export function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Number.isFinite(min) ? min : 0;
  return Math.min(Number.isFinite(max) ? max : number, Math.max(Number.isFinite(min) ? min : number, number));
}

/** Devuelve el color como #rrggbb en minúsculas, o '' si no es un hexadecimal válido. Acepta #abc y sin numeral. */
export function normalizeHexColor(value) {
  const raw = String(value || '').trim().replace(/^#?/, '#');
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) return ('#' + raw.slice(1).split('').map(char => char + char).join('')).toLowerCase();
  return '';
}

export function isWebUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') && !url.username && !url.password;
  } catch { return false; }
}
