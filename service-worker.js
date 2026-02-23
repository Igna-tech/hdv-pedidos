const VERSION = '6.2';
const CACHE_NAME = `hdv-pedidos-v${VERSION}`;

const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './admin.html',
    './admin.js',
    './productos.json',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', event => {
    console.log('[SW] Instalando versión:', VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('[SW] Activando versión:', VERSION);
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                 return new Response('Sin conexión', { status: 503 });
            });
        })
    );
});s