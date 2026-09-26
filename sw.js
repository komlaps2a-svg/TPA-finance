const CACHE_NAME = 'tpa-finance-cache-v5.4.2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css?v=440',
  '/main.js?v=440',
  '/manifest.json',
  '/icon-192x192.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js'
];

// URLs yang butuh data real-time, wajib bypass cache jika koneksi tersedia
const API_ENDPOINTS = [
  'supabase.co',
  'api.aladhan.com'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Strategy: Network-First untuk API (Supabase / Jadwal Sholat)
  if (API_ENDPOINTS.some(domain => url.hostname.includes(domain))) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Strategy: Stale-While-Revalidate untuk aset statis lokal & CDN
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cachedRes) => {
      const networkFetch = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      }).catch((err) => {
        console.warn('[SW] Fetch gagal, mode offline aktif:', err);
      });

      return cachedRes || networkFetch;
    })
  );
});
