// ============================================
// Sentry — Inicializacion y contexto de usuario
// Se carga PRIMERO en todos los HTML, antes de supabase-init.js.
// Loader Script: carga lazy, solo descarga el SDK completo al primer error.
// ============================================

window.sentryOnLoad = function () {
    Sentry.init({
        environment: location.hostname === 'localhost' ? 'development' : 'production',
        release: 'hdv-pedidos@1.0.0',

        // Solo captura 100% de errores, sin tracing ni replay (ahorro de cuota)
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,

        // Ignorar errores de red esperados (offline, timeout)
        ignoreErrors: [
            'Failed to fetch',
            'NetworkError',
            'Load failed',
            'AbortError',
            'TypeError: cancelled',
            'ResizeObserver loop',
        ],

        beforeSend(event) {
            // No enviar errores en desarrollo local
            if (location.hostname === 'localhost') return null;

            // Enriquecer con estado de conexion y storage
            event.tags = event.tags || {};
            event.tags.online = navigator.onLine ? 'yes' : 'no';
            event.tags.page = location.pathname;

            return event;
        },
    });
};

// Setear contexto de usuario despues de login (llamar desde guard.js)
window.sentrySetUser = function (user) {
    if (typeof Sentry !== 'undefined' && Sentry.setUser) {
        Sentry.setUser({
            id: user.id,
            email: user.email,
            username: user.nombre || user.email,
            rol: user.rol,
        });
        if (Sentry.setTag) {
            Sentry.setTag('user.rol', user.rol);
        }
    }
};
