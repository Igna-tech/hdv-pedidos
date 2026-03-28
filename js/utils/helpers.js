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
        if (!btn || btn.disabled || btn.loading) return;

        const isShoelace = btn.tagName && btn.tagName.toLowerCase() === 'sl-button';
        const textoOriginal = isShoelace ? null : btn.innerHTML;
        const texto = loadingText || 'Guardando...';

        if (isShoelace) {
            btn.loading = true;
            btn.disabled = true;
        } else {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = SPINNER_SVG + ' ' + texto;
        }

        try {
            return await fn.apply(this, args);
        } finally {
            if (isShoelace) {
                btn.loading = false;
                btn.disabled = false;
            } else {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                btn.innerHTML = textoOriginal;
            }
        }
    };
}
