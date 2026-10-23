const CACHE = 'mty2-shell-v1.16.0';
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mty2-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  // No cachear credenciales, API, pedidos privados ni comprobantes.
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/uploads/'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match('/offline.html');}));return;
  }
  if(url.pathname.startsWith('/assets/')||url.pathname.startsWith('/icons/'))event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;})));
});
