const CACHE_NAME = 'tpa-finance-v4.3-cache';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.json'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Hapus cache versi lama secara agresif
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    // Abaikan request API Supabase & EmailJS dari caching (wajib real-time)
    if (event.request.url.includes('supabase.co') || event.request.url.includes('emailjs.com')) {
        return;
    }

    // Strategi Network-First untuk memastikan aset UI & State Publik selalu yang terbaru
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });
                return response;
            })
            .catch(() => {
                // Fallback ke cache jika offline
                return caches.match(event.request);
            })
    );
});
