const CACHE_NAME = 'command-center-v14'; 
const STATIC_ASSETS = ['/', '/index.html'];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null)))); self.clients.claim(); });
self.addEventListener('fetch', (e) => { if (e.request.method !== 'GET') return; e.respondWith(caches.match(e.request).then(res => { const f = fetch(e.request).then(nr => { if (nr.status === 200) { const rc = nr.clone(); caches.open(CACHE_NAME).then(c => c.put(e.request, rc)); } return nr; }).catch(() => {}); return res || f; })); });
