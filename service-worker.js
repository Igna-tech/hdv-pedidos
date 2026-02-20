// CAMBIAR ESTE NÚMERO CADA VEZ QUE ACTUALICES
const VERSION = '3.0'; // <-- INCREMENTA ESTO EN CADA ACTUALIZACIÓN
const CACHE_NAME = `hdv-pedidos-v${VERSION}`;

const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './admin.html',
    './admin.js',
    './productos.json',
    './manifest.json'
];

// Archivos que SIEMPRE deben buscar en red primero (para updates rápidos)
const networkFirstFiles = [
    './app.js',
    './index.html',
    './admin.html',
    './admin.js',
    './productos.json'
];

// INSTALL: Cachear archivos iniciales
self.addEventListener('install', event => {
    console.log('[SW] Instalando versión:', VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Archivos cacheados');
            return cache.addAll(urlsToCache);
        })
    );
    // Activar inmediatamente sin esperar
    self.skipWaiting();
});

// ACTIVATE: Limpiar cachés viejos
self.addEventListener('activate', event => {
    console.log('[SW] Activando versión:', VERSION);
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Borrando caché viejo:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    // Tomar control inmediatamente
    return self.clients.claim();
});

// FETCH: Estrategia mixta (Network First para archivos críticos, Cache First para otros)
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Network First para archivos que cambian frecuentemente
    if (networkFirstFiles.some(file => url.pathname.endsWith(file))) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Guardar en caché si es exitoso
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Si falla la red, usar caché
                    return caches.match(event.request);
                })
        );
    } else {
        // Cache First para otros archivos (imágenes, CSS, etc)
        event.respondWith(
            caches.match(event.request).then(response => {
                return response || fetch(event.request).then(fetchResponse => {
                    if (fetchResponse && fetchResponse.status === 200) {
                        const clone = fetchResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, clone);
                        });
                    }
                    return fetchResponse;
                });
            }).catch(() => new Response('Sin conexión', { status: 503 }))
        );
    }
});

// Escuchar mensajes para forzar actualización
self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then(keys => {
                return Promise.all(keys.map(key => caches.delete(key)));
            })
        );
    }
});
