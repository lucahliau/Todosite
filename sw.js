const CACHE_NAME = 'command-center-v5';
const ASSETS = [
  '/',
  '/index.html',
  '/config.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js',
  'https://unpkg.com/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((res) => res || fetch(event.request)));
});