// ============================================
// Sentry — Inicializacion y contexto de usuario
// Se carga PRIMERO en todos los HTML, antes de supabase-init.js.
// Loader Script: carga lazy, solo descarga el SDK completo al primer error.
// Offline-safe: Sentry bufferea eventos internamente si no hay red.
// ============================================

window.sentryOnLoad = function () {
    Sentry.init({
        environment: location.hostname === 'localhost' ? 'development' : 'production',
        release: 'hdv-pedidos@1.0.0',

        // Tracing conservador (20%) para no saturar la capa gratuita
        tracesSampleRate: 0.2,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,

        // Ignorar errores de red esperados (offline, timeout) — estos NO son bugs
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

            // Tag de salud del storage para correlacionar errores con problemas IDB
            if (typeof HDVStorage !== 'undefined' && HDVStorage.isHealthy) {
                event.tags.storage_healthy = HDVStorage.isHealthy() ? 'yes' : 'no';
            }

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

// Helper seguro para capturar excepciones desde cualquier modulo
// Nunca lanza — si Sentry no esta cargado, es un no-op silencioso
window.sentryCaptureException = function (err, context) {
    try {
        if (typeof Sentry !== 'undefined' && Sentry.captureException) {
            Sentry.captureException(err, context ? { extra: context } : undefined);
        }
    } catch (_e) { /* Sentry no debe romper la app */ }
};

window.sentryCaptureMessage = function (msg, level, context) {
    try {
        if (typeof Sentry !== 'undefined' && Sentry.captureMessage) {
            Sentry.captureMessage(msg, {
                level: level || 'warning',
                extra: context || {},
            });
        }
    } catch (_e) { /* no-op */ }
};
