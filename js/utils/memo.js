// ============================================
// HDV memo — Memoización por clave con TTL e invalidación por prefijo
// Para cachear cálculos costosos (KPIs del dashboard) y evitar
// recomputarlos en cada render/realtime. Funciones puras, sin DOM.
// Se carga ANTES de los módulos que la consumen.
// ============================================

const _hdvMemoCache = new Map();

/**
 * Envuelve `fn` cacheando su resultado por una clave derivada.
 * @param {Function} fn        Función a memoizar (idealmente pura).
 * @param {Function} [keyFn]   Deriva la clave de cache desde los args.
 *                             DEBE ser barata (no serializar arrays grandes):
 *                             p.ej. () => `${pedidos.length}:${ultimaActualizacion}`.
 * @param {Object}   [opts]    { ttl: ms (0 = sin expiración por tiempo), namespace }
 * @returns {Function} versión memoizada
 */
function memoizarPorClave(fn, keyFn, opts = {}) {
    const ttl = opts.ttl || 0;
    const ns = opts.namespace || fn.name || 'memo';
    return function (...args) {
        let sub;
        try {
            sub = keyFn ? keyFn.apply(this, args) : JSON.stringify(args);
        } catch (e) {
            // Clave no serializable → no cachear, ejecutar directo
            return fn.apply(this, args);
        }
        const key = ns + '|' + sub;
        const ahora = Date.now();
        const hit = _hdvMemoCache.get(key);
        if (hit && (ttl === 0 || (ahora - hit.t) < ttl)) return hit.v;
        const v = fn.apply(this, args);
        _hdvMemoCache.set(key, { v, t: ahora });
        return v;
    };
}

/**
 * Invalida entradas de cache. Sin prefijo → limpia todo.
 * @param {string} [prefijo] namespace o prefijo de clave a purgar.
 */
function invalidarMemo(prefijo) {
    if (!prefijo) { _hdvMemoCache.clear(); return; }
    for (const k of _hdvMemoCache.keys()) {
        if (k === prefijo || k.startsWith(prefijo + '|') || k.startsWith(prefijo)) {
            _hdvMemoCache.delete(k);
        }
    }
}
