// Avisa entre pestañas del mismo navegador que el vendedor guardó cambios de una tienda,
// para que la tienda abierta en otra pestaña ofrezca recargar. No envía datos al servidor.
const CHANNEL = 'mty-store-updates';
let channel;
// Se crea sólo en el navegador y al primer uso (en Node un canal abierto mantiene vivo el proceso de pruebas).
function getChannel() {
  if (channel !== undefined) return channel;
  channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  return channel;
}
const STORE_PATH = /^\/stores\/([a-f0-9]{24})(?:\/|$)/i;
// Cargas temporales y lecturas de vista previa no cambian la tienda publicada.
const IGNORED = /^\/stores\/[a-f0-9]{24}\/(uploads|preview)/i;

export function storeIdFromPath(path) {
  const clean = String(path || '').split('?')[0];
  if (IGNORED.test(clean)) return '';
  return clean.match(STORE_PATH)?.[1] || '';
}

export function announceStoreChange(method, path) {
  if (method === 'GET' || !getChannel()) return;
  const storeId = storeIdFromPath(path);
  if (storeId) channel.postMessage({ type: 'store-updated', storeId, at: Date.now() });
}

export function onStoreChange(callback) {
  if (!getChannel()) return () => {};
  const listener = event => { if (event.data?.type === 'store-updated') callback(event.data); };
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}
