// sw.js
const CACHE_NAME = 'todo-live-v2'; // Bump version

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// --- PUSH NOTIFICATIONS ---
self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    
    // Most browsers require showing a notification to allow background processing
    const options = { 
        body: data.body, 
        icon: '/icon.jpg', 
        badge: '/icon.jpg', 
        data: { url: '/' } 
    };

    event.waitUntil(
        Promise.all([
            self.registration.showNotification(data.title, options),
            // Update badge in background if the data payload includes a 'badgeCount'
            // (Note: your daily-push.js currently doesn't send this, but we can add it)
            data.badgeCount ? navigator.setAppBadge(data.badgeCount) : Promise.resolve()
        ])
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});