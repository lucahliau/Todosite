const CACHE_NAME = 'command-center-v9'; // Bumped version

// We list EXACTLY the same URLs used in index.html
const ASSETS = [
  '/',
  '/index.html',
  '/config.js',
  '/icon.png', // Make sure you actually have this file
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js',
  'https://unpkg.com/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

// 1. INSTALL: Download all assets immediately
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force this SW to become active immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching all assets...');
      return cache.addAll(ASSETS);
    })
  );
});

// 2. ACTIVATE: Clean up old caches (v1-v8) to save space
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
  self.clients.claim(); // Take control of all pages immediately
});

// 3. FETCH: The "Offline First" Strategy
self.addEventListener('fetch', (event) => {
  // We only cache GET requests (not Supabase writes/updates)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // A. If found in cache, return it (Instant load)
      if (cachedResponse) {
        return cachedResponse;
      }

      // B. If not in cache, fetch from internet
      return fetch(event.request)
        .then((networkResponse) => {
          // Check if valid response
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          // C. Cache the new file for next time (Dynamic Caching)
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // D. If offline and not in cache, we're stuck. 
          // Usually we just return nothing, or a generic offline.html if you had one.
          console.log('[SW] Offline and item not in cache:', event.request.url);
        });
    })
  );
});