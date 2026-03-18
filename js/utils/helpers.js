// ============================================
// HDV Helpers - Utilidades de control de flujo
// debounce: retrasa ejecucion hasta que el usuario deje de interactuar
// throttle: limita ejecucion a maximo 1 vez cada X ms
// withButtonLock: envuelve funcion async con bloqueo automatico de boton
// Se carga ANTES de cualquier script de UI.
// ============================================

/**
 * Retrasa la ejecucion de `func` hasta que pasen `wait` ms sin otra invocacion.
 * Ideal para inputs de busqueda.
 */
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Limita la ejecucion de `func` a maximo 1 vez cada `limit` ms.
 * Ideal para scroll, resize o botones de paginacion.
 */
function throttle(func, limit) {
    let inThrottle = false;
    return function (...args) {
        if (inThrottle) return;
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => { inThrottle = false; }, limit);
    };
}

/**
 * Envuelve una funcion async con bloqueo automatico de boton.
 * Al hacer clic: desactiva el boton, muestra spinner, ejecuta fn, restaura en finally.
 * @param {string} btnId - ID del boton HTML
 * @param {Function} fn - Funcion async a ejecutar
 * @param {string} [loadingText] - Texto mientras carga (default: 'Guardando...')
 */
function withButtonLock(btnId, fn, loadingText) {
    return async function (...args) {
        const btn = document.getElementById(btnId);
        if (!btn || btn.disabled) return;

        const textoOriginal = btn.innerHTML;
        const texto = loadingText || 'Guardando...';
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = '<svg class="w-4 h-4 animate-spin inline mr-1.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> ' + texto;

        try {
            return await fn.apply(this, args);
        } finally {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = textoOriginal;
        }
    };
}
