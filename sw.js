// Service worker: maakt de site installeerbaar en bruikbaar zonder internet.
// Pagina's en het rooster: eerst internet proberen (zo zie je altijd het nieuwste rooster),
// en alleen als dat niet lukt de opgeslagen versie tonen.
// Verander je iets aan de bestanden? Verhoog dan het versienummer hieronder.

const CACHE = 'helpdesk-v1';

const APP_SHELL = [
  './',
  'index.html',
  'zelf-oplossen.html',
  'style.css',
  'script.js',
  'rooster.js',
  'logo%20kleur.svg',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Eerst netwerk, bij geen verbinding de opgeslagen versie (ook voor Google Fonts).
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok || response.type === 'opaque') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })),
  );
});
