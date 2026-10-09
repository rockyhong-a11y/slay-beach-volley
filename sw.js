const VERSION = 'slay-beach-volley-v1';
const ASSETS = [];
const SHELL = ['./', './index.html', './style.css', './src/app.js', './src/roster.js', './src/engine.js', './src/render.js', './src/audio.js', './src/sprites.json', './favicon.svg', './manifest.webmanifest'];
self.addEventListener('install', event => { event.waitUntil(caches.open(VERSION).then(cache => cache.addAll([...SHELL, ...ASSETS]))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('slay-beach-volley-') && key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(VERSION).then(cache => cache.match(event.request)).then(cached => {
    const fresh = fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(event.request, copy)); } return response; });
    if (cached) { event.waitUntil(fresh.catch(() => {})); return cached; }
    return fresh.catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : new Response('Offline', { status: 503 }));
  }));
});
