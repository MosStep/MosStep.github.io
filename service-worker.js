const CACHE_NAME = 'unifeed-v1';
const urlsToCache = [
  './',
  './index_student.html',
  './index_teacher.html',
  './Login.html',
  './manifest.json',
  './offline.html'
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: navigation requests -> network fallback to offline.html
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // For navigation requests, try network first, then offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If we get a valid response, optionally update the cache
          return response;
        })
        .catch(() => caches.match('./offline.html'))
    );
    return;
  }

  // For other requests, respond with cache-first, then network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // optionally cache fetched assets (but avoid caching POST/opaque responses blindly)
          return response;
        })
        .catch(() => {
          // if asset missing and it's an image/font/etc, we could return a placeholder
          return caches.match('./offline.html');
        });
    })
  );
});
