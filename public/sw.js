// Offline support: network-first for the page and questions (so updates land fast),
// cache-first for hashed build assets (they never change).
const CACHE = 'ttetris-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  const immutable = url.pathname.includes('/assets/');
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      if (immutable) {
        const hit = await cache.match(req);
        if (hit) return hit;
      }
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(immutable ? req : new Request(url.pathname), res.clone());
        return res;
      } catch {
        return (await cache.match(immutable ? req : new Request(url.pathname))) ?? Response.error();
      }
    }),
  );
});
