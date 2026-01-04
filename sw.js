// sw.js
const CACHE_NAME = 'todo-live-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// --- PUSH NOTIFICATIONS & BADGES ---
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
            // iOS 17+ supports setting badges via push
            data.badgeCount ? navigator.setAppBadge(data.badgeCount) : Promise.resolve()
        ])
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});