
const CACHE_NAME = 'command-center-v10'; // Bump version

// CRITICAL: Only cache the files that act as the "Skeleton" of the app.
// We removed config.js and the CDNs from here to prevent installation failure.
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/icon.png'
];

// 1. INSTALL: Cache only the essentials
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force activation
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching App Shell');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// 2. ACTIVATE: Clean up old versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. FETCH: The "Stale-While-Revalidate" / Dynamic Strategy
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // STRATEGY: Return cache if available, but ALSO fetch update in background
      // This ensures you see content instantly, but the cache stays fresh.
      
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // If the network works, update the cache
          if (networkResponse && networkResponse.status === 200) {
             const responseClone = networkResponse.clone();
             caches.open(CACHE_NAME).then((cache) => {
               cache.put(event.request, responseClone);
             });
          }
          return networkResponse;
        })
        .catch(() => {
           // If network fails, do nothing (we rely on cachedResponse)
           console.log('[SW] Network failed for:', event.request.url);
        });

      // If we found it in cache, return it immediately!
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // If not in cache, wait for the network
      return fetchPromise;
    })
  );
});
