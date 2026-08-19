const CACHE_NAME = 'aj-dolly-ledger-v2';
const APP_SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/app.js', './js/cloud.js', './js/supabase-config.js', './js/storage.js', './js/format.js', './js/ui.js',
  './assets/icon-192.png', './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const url = new URL(request.url);
      // Cache the app shell AND the sign-in library (esm.sh) so refreshing —
      // even offline — keeps the app and its saved session working.
      if (response.ok && (url.origin === self.location.origin || url.hostname === 'esm.sh')) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => {
      // Only page navigations fall back to the shell. Serving HTML to a
      // script/module request used to break the app offline.
      if (request.mode === 'navigate') return caches.match('./index.html');
      return undefined;
    }))
  );
});
