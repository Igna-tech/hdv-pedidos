// ============================================
// HDV virtual-list — Windowing client-side para listas/tablas grandes
// Renderiza solo las filas visibles (+ buffer), manteniendo scroll fluido
// con miles de registros. Filas de ALTURA FIJA. Los handlers por fila deben
// usar event delegation (data-action/ACTION_DISPATCH) o re-enlazarse en
// onRender(). Sin acceso a lógica de negocio.
//
// Uso:
//   const vl = montarListaVirtual(contenedorScrollable, {
//       items, alturaFila: 56, renderRow: (item, i) => `<div ...>...</div>`,
//       overscan: 6, onRender: (layer, start, end) => {}
//   });
//   vl.actualizar(nuevosItems);  vl.scrollA(i);  vl.destruir();
// ============================================

/**
 * @param {HTMLElement} container  Contenedor con altura acotada (overflow-y se fuerza a auto).
 * @param {Object} opts { items:[], alturaFila:Number, renderRow:Function, overscan?:Number, onRender?:Function }
 * @returns {{actualizar:Function, scrollA:Function, destruir:Function}|null}
 */
function montarListaVirtual(container, opts = {}) {
    if (!container) return null;
    const renderRow = opts.renderRow;
    if (typeof renderRow !== 'function') {
        console.warn('[virtual-list] renderRow es obligatorio');
        return null;
    }
    let items = opts.items || [];
    const alturaFila = opts.alturaFila || 52;
    const overscan = opts.overscan != null ? opts.overscan : 6;
    const onRender = opts.onRender;

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.style.overflowY = 'auto';

    const sizer = document.createElement('div');
    sizer.style.position = 'relative';
    sizer.style.width = '100%';

    const layer = document.createElement('div');
    layer.style.position = 'absolute';
    layer.style.top = '0';
    layer.style.left = '0';
    layer.style.right = '0';
    layer.style.willChange = 'transform';
    sizer.appendChild(layer);

    container.innerHTML = '';
    container.appendChild(sizer);

    let ticking = false;

    function pintar() {
        ticking = false;
        const total = items.length;
        sizer.style.height = (total * alturaFila) + 'px';

        const scrollTop = container.scrollTop;
        const alturaVisible = container.clientHeight || 600;

        let start = Math.floor(scrollTop / alturaFila) - overscan;
        if (start < 0) start = 0;
        let count = Math.ceil(alturaVisible / alturaFila) + overscan * 2;
        let end = start + count;
        if (end > total) end = total;

        let html = '';
        for (let i = start; i < end; i++) {
            html += renderRow(items[i], i);
        }
        layer.style.transform = `translateY(${start * alturaFila}px)`;
        layer.innerHTML = html;
        if (typeof onRender === 'function') onRender(layer, start, end);
    }

    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(pintar);
    }

    container.addEventListener('scroll', onScroll, { passive: true });

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => { if (!ticking) { ticking = true; requestAnimationFrame(pintar); } });
        ro.observe(container);
    }

    pintar();

    return {
        actualizar(nuevos) {
            items = nuevos || [];
            if (container.scrollTop > items.length * alturaFila) container.scrollTop = 0;
            pintar();
        },
        scrollA(index) { container.scrollTop = Math.max(0, index) * alturaFila; },
        get length() { return items.length; },
        destruir() {
            container.removeEventListener('scroll', onScroll);
            if (ro) ro.disconnect();
            container.innerHTML = '';
        }
    };
}
