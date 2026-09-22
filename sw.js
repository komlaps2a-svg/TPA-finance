const CACHE_NAME = 'tpa-finance-cache-v4.6';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
    'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js'
];

// 1. INSTALLATION: Pre-cache semua aset penting
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Memaksa SW baru segera mengambil alih
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching App Shell v4.6');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. ACTIVATION: Hapus cache dari versi lama untuk mencegah bentrok
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Menghapus cache lama:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Langsung pegang kendali semua client
    );
});

// 3. FETCH: Network-First Strategy dengan Cache Fallback
self.addEventListener('fetch', (event) => {
    // Abaikan request API Supabase atau EmailJS dari caching SW (Selalu butuh jaringan asli)
    if (event.request.url.includes('supabase.co') || event.request.url.includes('api.emailjs.com')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Jika koneksi berhasil, update cache secara diam-diam
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Jika koneksi gagal (OFFLINE), ambil dari cache
                console.log('[Service Worker] Mode Offline aktif, mengambil dari cache:', event.request.url);
                return caches.match(event.request);
            })
    );
});
