const VERSION = 'slay-beach-volley-v7';
const ASSETS = [];
const SHELL = ['./', './index.html', './style.css', './src/app.js', './src/roster.js', './src/engine.js', './src/render.js', './src/audio.js', './src/court-scene.js', './src/impact-effects.js', './src/character-motion.js', './src/sprites.json', './assets/motions/manifest.json', './favicon.svg', './manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION)
    .then(cache => cache.addAll([...SHELL, ...ASSETS].map(url => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const oldCaches = (await caches.keys()).filter(key => key.startsWith('slay-beach-volley-') && key !== VERSION);
    await Promise.all(oldCaches.map(key => caches.delete(key)));
    await self.clients.claim();
    // Legacy workers may have served old app code for an explicit upgrade link.
    // Only that explicitly requested upgrade reloads; other matches continue.
    if (oldCaches.length) {
      const clients = await self.clients.matchAll({ type: 'window' });
      // Navigation requests wait for activation, so do not await them here.
      clients.filter(client => client.url.startsWith(self.registration.scope) && new URL(client.url).searchParams.get('v') === VERSION.split('-v').pop())
        .forEach(client => { client.navigate(client.url).catch(() => {}); });
    }
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    const fresh = fetch(event.request);
    event.waitUntil(fresh.then(response => {
      if (!response.ok) return;
      const copy = response.clone();
      return caches.open(VERSION).then(cache => cache.put(event.request, copy));
    }).catch(() => {}));
    event.respondWith(fresh.catch(() => caches.open(VERSION).then(cache => cache.match(event.request, { ignoreSearch: true })).then(cached => cached || caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.open(VERSION).then(cache => cache.match(event.request, { ignoreSearch: true })).then(cached => {
    const fresh = fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(event.request, copy)); } return response; });
    if (cached) { event.waitUntil(fresh.catch(() => {})); return cached; }
    return fresh.catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : new Response('Offline', { status: 503 }));
  }));
});
