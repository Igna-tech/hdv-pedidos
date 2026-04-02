const VERSION = '60.1';
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
    './admin-ventas.js',
    './admin-devoluciones.js',
    './admin-contabilidad.js',
    './js/core/state.js',
    './js/utils/formatters.js',
    './js/utils/printer.js',
    './js/utils/pdf-generator.js',
    './js/modules/ventas/ventas-data.js',
    './js/modules/ventas/ventas-templates.js',
    './js/vendedor/ui.js',
    './js/vendedor/cart.js',
    './js/admin/pedidos.js',
    './js/admin/dashboard.js',
    './js/admin/productos.js',
    './js/admin/clientes.js',
    './js/admin/creditos.js',
    './services/supabase.js',
    './js/utils/storage.js',
    './js/utils/sanitizer.js',
    './js/utils/helpers.js',
    './js/services/sync.js',
    './supabase-config.js',
    './productos.json',
    './manifest.json',
    './dist/tailwind.css',
    // Shoelace Web Components (core — chunks se cachean on-demand via cache-first)
    './assets/lib/shoelace/themes/light.css',
    './assets/lib/shoelace/themes/dark.css',
    './assets/lib/shoelace/shoelace.js',
    './assets/lib/shoelace/utilities/base-path.js'
];

// Archivos que SIEMPRE deben buscar la version mas reciente de la red
const networkFirstFiles = [
    'index.html',
    'login.html',
    'admin.html',
    'app.js',
    'checkout.js',
    'admin.js',
    'admin-ventas.js',
    'admin-devoluciones.js',
    'admin-contabilidad.js',
    'state.js',
    'formatters.js',
    'printer.js',
    'pdf-generator.js',
    'ventas-data.js',
    'ventas-templates.js',
    'vendedor/ui.js',
    'vendedor/cart.js',
    'admin/pedidos.js',
    'admin/dashboard.js',
    'admin/productos.js',
    'admin/clientes.js',
    'admin/creditos.js',
    'login.js',
    'guard.js',
    'supabase-init.js',
    'services/supabase.js',
    'js/utils/storage.js',
    'js/utils/sanitizer.js',
    'js/utils/helpers.js',
    'js/services/sync.js',
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
                    // Preservar cache de imagenes (no cambia con VERSION) y cache actual
                    if (key !== CACHE_NAME && key !== 'hdv-imagenes') {
                        console.log('[SW] Eliminando cache viejo:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// Imagenes de productos en Supabase Storage (cache-first, larga duracion)
function esImagenProducto(url) {
    return url.includes('supabase.co/storage/v1/object/public/productos_img');
}

// Shoelace Web Components: chunks con hash en nombre — cache-first (estaticos, nunca cambian)
function esShoelaceAsset(url) {
    return url.includes('/assets/lib/shoelace/');
}

// Supabase API/REST/Auth/Realtime — Network-First (red primero, cache como fallback offline)
function esSupabaseAPI(url) {
    return url.includes('supabase.co/rest/') ||
           url.includes('supabase.co/auth/') ||
           url.includes('supabase.co/functions/') ||
           url.includes('supabase.co/realtime/') ||
           (url.includes('supabase.co') && !esImagenProducto(url) && url.includes('/v1/'));
}

// Determinar si un request debe usar network-first
function esNetworkFirst(url) {
    return networkFirstFiles.some(file => url.endsWith(file) || url.includes('/' + file));
}

self.addEventListener('fetch', event => {
    const requestUrl = event.request.url;

    // SUPABASE API: Network-First (primero red, cache solo como fallback offline)
    // Si hay internet, el admin NUNCA ve datos cacheados.
    // Si no hay internet, se usa la ultima respuesta cacheada como salvavidas.
    if (esSupabaseAPI(requestUrl)) {
        event.respondWith(
            fetch(event.request).then(networkResponse => {
                // Solo cachear GETs exitosos (lecturas), no mutaciones
                if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
                    const responseClone = networkResponse.clone();
                    caches.open('hdv-supabase-api').then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Sin conexion: intentar cache como fallback
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) return cachedResponse;
                    return new Response(JSON.stringify({ error: 'Sin conexion' }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    });
                });
            })
        );
        return;
    }

    // SHOELACE ASSETS: cache-first (chunks con hash, estaticos)
    if (esShoelaceAsset(requestUrl)) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return response;
                }).catch(() => new Response('', { status: 404 }));
            })
        );
        return;
    }

    // IMAGENES DE PRODUCTOS: cache-first con cache dedicado (no se purga con VERSION)
    if (esImagenProducto(requestUrl)) {
        event.respondWith(
            caches.open('hdv-imagenes').then(cache => {
                return cache.match(event.request).then(cached => {
                    if (cached) return cached;
                    return fetch(event.request).then(response => {
                        if (response && response.status === 200) {
                            cache.put(event.request, response.clone());
                            // Limitar cache de imagenes a 200 entradas
                            cache.keys().then(keys => {
                                if (keys.length > 200) {
                                    cache.delete(keys[0]);
                                }
                            });
                        }
                        return response;
                    }).catch(() => new Response('', { status: 404 }));
                });
            })
        );
        return;
    }

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
