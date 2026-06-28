// ============================================
// HDV async-ui — Patrón único de carga: skeleton + error/reintento
// Resuelve estados de carga consistentes y errores recuperables en
// TODAS las secciones async (admin + vendedor). Depende de sanitizer.js
// (escapeHTML) y, opcionalmente, de lucide para los íconos.
// Se carga tras dialogs.js.
// ============================================

/**
 * Pinta skeletons coherentes en un contenedor mientras carga.
 * Reusa la clase .skeleton (shimmer oscuro) de src/input.css.
 * @param {HTMLElement} container
 * @param {Object} [opts] { filas=6, altura='52px', clase='' }
 */
function renderSkeletonLista(container, opts = {}) {
    if (!container) return;
    const filas = opts.filas || 6;
    const altura = opts.altura || '52px';
    let html = `<div class="hdv-skeleton-wrap ${opts.clase || ''}" aria-busy="true" aria-live="polite">`;
    for (let i = 0; i < filas; i++) {
        html += `<div class="skeleton" style="height:${altura};margin-bottom:8px;"></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

/**
 * Pinta un estado de error recuperable con botón "Reintentar".
 * El handler se enlaza por addEventListener (cero JS inline → CSP-safe).
 * @param {HTMLElement} container
 * @param {Object} [opts] { mensaje, detalle, onReintentar, icono='wifi-off' }
 */
function renderEstadoError(container, opts = {}) {
    if (!container) return;
    const mensaje = opts.mensaje || 'No se pudieron cargar los datos.';
    const icono = opts.icono || 'wifi-off';
    const detalle = opts.detalle
        ? `<p class="hdv-error-detalle">${escapeHTML(String(opts.detalle))}</p>` : '';
    const retry = (typeof opts.onReintentar === 'function')
        ? `<button type="button" class="hdv-error-retry">
               <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Reintentar
           </button>` : '';
    container.innerHTML = `
        <div class="hdv-error-state" role="alert">
            <div class="hdv-error-icon"><i data-lucide="${escapeHTML(icono)}"></i></div>
            <p class="hdv-error-msg">${escapeHTML(mensaje)}</p>
            ${detalle}
            ${retry}
        </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    const btn = container.querySelector('.hdv-error-retry');
    if (btn && typeof opts.onReintentar === 'function') {
        btn.addEventListener('click', () => opts.onReintentar());
    }
}

/**
 * Envuelve una carga async: skeleton → ejecuta → pinta / error+retry.
 * El `asyncFn` normalmente pinta el contenedor por su cuenta; si devuelve
 * un string HTML, se inyecta. Ante excepción, muestra error con reintento.
 * @param {HTMLElement} container
 * @param {Function} asyncFn  () => Promise<any|string>
 * @param {Object} [opts] { skeleton=true, skeletonOpts, mensajeError, mostrarDetalle=false }
 */
async function withCarga(container, asyncFn, opts = {}) {
    if (!container) return asyncFn();
    if (opts.skeleton !== false) renderSkeletonLista(container, opts.skeletonOpts || {});
    try {
        const resultado = await asyncFn();
        if (typeof resultado === 'string') container.innerHTML = resultado;
        return resultado;
    } catch (err) {
        console.error('[withCarga]', err);
        renderEstadoError(container, {
            mensaje: opts.mensajeError || 'No se pudieron cargar los datos.',
            detalle: opts.mostrarDetalle ? (err && err.message) : null,
            onReintentar: () => withCarga(container, asyncFn, opts)
        });
        return null;
    }
}
