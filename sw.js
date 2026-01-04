// sw.js
const CACHE_NAME = 'todo-live-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  // Clear all old caches immediately to fix the blank screen
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// We REMOVE the 'fetch' listener entirely so the browser 
// loads index, app, and settings directly from Vercel.

// --- KEEP: PUSH NOTIFICATIONS ---
self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const options = { body: data.body, icon: '/icon.jpg', badge: '/icon.jpg', data: { url: '/' } };
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});