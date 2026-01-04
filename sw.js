// sw.js
const CACHE_NAME = 'todo-shell-v4'; // Increment this to force update

// 1. Assets to Cache Immediately (The App Shell)
// We must cache the CDNs you rely on, or the app breaks offline.
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/settings.js',
  '/config.js',
  '/icon.jpg',
  '/icon.png',
  // External CDNs
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://cdn.jsdelivr.net/npm/@alpinejs/collapse@3.x.x/dist/cdn.min.js',
  'https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];

// Install: Cache all static assets
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching App Shell');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

// Fetch: Network First for API, Cache First for Assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // A. Supabase API requests: Network Only (or handle in app.js)
  // We let app.js handle data caching via localStorage to avoid stale SW data logic
  if (url.hostname.includes('supabase.co')) {
    return; 
  }

  // B. Static Assets: Cache First, fall back to Network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      
      return fetch(event.request).then((networkResponse) => {
        // Optional: Cache new static assets dynamically if needed
        return networkResponse;
      });
    })
  );
});

// --- KEEP EXISTING PUSH NOTIFICATION LOGIC BELOW ---
self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const options = { 
        body: data.body, 
        icon: '/icon.jpg', 
        badge: '/icon.jpg', 
        data: { url: '/' } 
    };

    event.waitUntil(
        Promise.all([
            self.registration.showNotification(data.title, options),
            data.badgeCount ? navigator.setAppBadge(data.badgeCount) : Promise.resolve()
        ])
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});