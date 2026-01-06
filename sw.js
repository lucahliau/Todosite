// sw.js
const CACHE_NAME = 'todo-shell-v11'; // Bumped version to force update

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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        STATIC_ASSETS.map(url => {
          return cache.add(url).catch(err => console.error('Failed to cache:', url, err));
        })
      );
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

// Fetch: Navigation Fallback strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. OAUTH FIX: Bypass Service Worker for Auth Redirects
  // This ensures Safari/Browsers handle the login code parameter via network strictly
  if (url.searchParams.has('code') || url.searchParams.has('error') || url.hash.includes('access_token')) {
    return; 
  }

  // 2. Navigation Strategy (HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) => {
        return cached || fetch(event.request).catch(() => {
            return caches.match('/index.html');
        });
      })
    );
    return;
  }

  // 3. Ignore Supabase API
  if (url.hostname.includes('supabase.co')) {
    return; 
  }

  // 4. Asset Strategy
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request);
    })
  );
});

// --- Push Notifications ---
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