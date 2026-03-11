const VERSION = '7.7';
const CACHE_NAME = `hdv-pedidos-v${VERSION}`;

const urlsToCache = [
    './',
    './index.html',
    './login.html',
    './login.js',
    './guard.js',
    './supabase-init.js',
    './app.js',
    './checkout.js',
    './admin.html',
    './admin.js',
    './supabase-config.js',
    './productos.json',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// Archivos que SIEMPRE deben buscar la version mas reciente de la red
const networkFirstFiles = [
    'index.html',
    'login.html',
    'admin.html',
    'app.js',
    'checkout.js',
    'admin.js',
    'login.js',
    'guard.js',
    'supabase-init.js',
    'supabase-config.js',
    'productos.json'
];

self.addEventListener('install', event => {
    console.log('[SW] Instalando version:', VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('[SW] Activando version:', VERSION);
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Eliminando cache viejo:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// Determinar si un request debe usar network-first
function esNetworkFirst(url) {
    return networkFirstFiles.some(file => url.includes(file));
}

self.addEventListener('fetch', event => {
    const requestUrl = event.request.url;

    if (esNetworkFirst(requestUrl)) {
        // NETWORK-FIRST: Intenta red primero, cache como fallback offline
        event.respondWith(
            fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Sin conexion: usar cache
                return caches.match(event.request).then(cachedResponse => {
                    return cachedResponse || new Response('Sin conexion', { status: 503 });
                });
            })
        );
    } else {
        // CACHE-FIRST: Para iconos, manifest, CDNs (no cambian seguido)
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
                    return new Response('Sin conexion', { status: 503 });
                });
            })
        );
    }
});

// Escuchar mensaje para forzar actualizacion
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
