// ============================================
// HDV Vendedor — Buscador global (command palette)
// Busca clientes, productos, pedidos y navega entre vistas.
// CSP-safe: cero handlers inline; todo via addEventListener.
// Requiere: globals `clientes`, `productos`, HDVStorage, _seleccionarCliente,
//           cambiarVistaVendedor, escapeHTML.
// ============================================

(function () {
    let _idx = 0;
    let _items = [];

    const NAV = [
        { tipo: 'nav', id: 'lista',     label: 'Catálogo',       icon: 'home' },
        { tipo: 'nav', id: 'pedidos',   label: 'Mis Pedidos',    icon: 'file-text' },
        { tipo: 'nav', id: 'creditos',  label: 'Créditos',       icon: 'credit-card' },
        { tipo: 'nav', id: 'mapa',      label: 'Mapa',           icon: 'map-pin' },
        { tipo: 'nav', id: 'jornada',   label: 'Mi Jornada',     icon: 'bar-chart-2' },
        { tipo: 'nav', id: 'config',    label: 'Configuración',  icon: 'settings' },
    ];

    function _esc(s) { return (typeof escapeHTML === 'function') ? escapeHTML(String(s ?? '')) : String(s ?? ''); }

    function abrirBusquedaGlobal() {
        const ov = document.getElementById('vendorSearchOverlay');
        const inp = document.getElementById('vendorSearchInput');
        if (!ov || !inp) return;
        ov.classList.remove('hidden');
        ov.classList.add('flex');
        inp.value = '';
        _buscar('');
        setTimeout(() => inp.focus(), 30);
    }

    function cerrarBusquedaGlobal() {
        const ov = document.getElementById('vendorSearchOverlay');
        if (!ov) return;
        ov.classList.add('hidden');
        ov.classList.remove('flex');
    }

    function _buscar(q) {
        q = (q || '').trim().toLowerCase();
        const res = [];

        // Navegación (siempre, filtrada por texto)
        NAV.forEach(n => { if (!q || n.label.toLowerCase().includes(q)) res.push(n); });

        if (q.length >= 1) {
            // Clientes
            const cli = (typeof clientes !== 'undefined' && Array.isArray(clientes)) ? clientes : [];
            cli.filter(c => (c.nombre || '').toLowerCase().includes(q) || (c.ruc || '').toLowerCase().includes(q))
               .slice(0, 6)
               .forEach(c => res.push({ tipo: 'cliente', id: c.id, label: c.nombre || 'Sin nombre', sub: c.zona || c.ruc || '', icon: 'user' }));

            // Productos
            const prod = (typeof productos !== 'undefined' && Array.isArray(productos)) ? productos : [];
            prod.filter(p => (p.nombre || '').toLowerCase().includes(q))
                .slice(0, 6)
                .forEach(p => res.push({ tipo: 'producto', id: p.id, label: p.nombre, sub: p.categoria || '', icon: 'package' }));

            // Pedidos (cache sincronico)
            let peds = [];
            try { peds = (HDVStorage.getCached && HDVStorage.getCached('hdv_pedidos')) || []; } catch (_) {}
            peds.filter(p => {
                const num = p.numero_pedido != null ? ('#' + String(p.numero_pedido).padStart(7, '0')) : '';
                const nom = (p.cliente?.nombre || p.clienteNombre || '').toLowerCase();
                return num.toLowerCase().includes(q) || nom.includes(q) || (p.id || '').toLowerCase().includes(q);
            }).slice(0, 5)
              .forEach(p => res.push({
                  tipo: 'pedido', id: p.id,
                  label: (p.numero_pedido != null ? '#' + String(p.numero_pedido).padStart(7, '0') + ' · ' : '') + (p.cliente?.nombre || p.clienteNombre || 'Pedido'),
                  sub: p.estado || '', icon: 'receipt'
              }));
        }

        _items = res;
        _idx = 0;
        _render();
    }

    function _render() {
        const cont = document.getElementById('vendorSearchResults');
        if (!cont) return;
        if (!_items.length) {
            cont.innerHTML = `<p class="text-center text-slate-400 text-sm py-6">Sin resultados</p>`;
            return;
        }
        const TIPO_LABEL = { nav: 'Ir a', cliente: 'Cliente', producto: 'Producto', pedido: 'Pedido' };
        cont.innerHTML = _items.map((it, i) => `
            <button type="button" data-vsi="${i}" class="vendor-search-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${i === _idx ? 'bg-panel-2' : ''}">
                <i data-lucide="${_esc(it.icon)}" class="w-4 h-4 text-slate-400 shrink-0"></i>
                <span class="flex-1 min-w-0">
                    <span class="block text-sm text-ink truncate">${_esc(it.label)}</span>
                    ${it.sub ? `<span class="block text-[11px] text-slate-500 truncate">${_esc(it.sub)}</span>` : ''}
                </span>
                <span class="text-[10px] uppercase tracking-wide text-slate-500 shrink-0">${TIPO_LABEL[it.tipo] || ''}</span>
            </button>`).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function _activar(i) {
        const it = _items[i];
        if (!it) return;
        cerrarBusquedaGlobal();
        if (it.tipo === 'nav') {
            if (typeof cambiarVistaVendedor === 'function') cambiarVistaVendedor(it.id);
        } else if (it.tipo === 'cliente') {
            if (typeof cambiarVistaVendedor === 'function') cambiarVistaVendedor('lista');
            if (typeof _seleccionarCliente === 'function') _seleccionarCliente(it.id);
        } else if (it.tipo === 'producto') {
            if (typeof cambiarVistaVendedor === 'function') cambiarVistaVendedor('lista');
            // El buscador de catalogo (sl-input) esta deshabilitado hasta elegir cliente
            const cInput = document.getElementById('searchInput');
            if (cInput && !cInput.disabled) {
                cInput.value = it.label;
                cInput.dispatchEvent(new Event('sl-input', { bubbles: true }));
            }
        } else if (it.tipo === 'pedido') {
            if (typeof cambiarVistaVendedor === 'function') cambiarVistaVendedor('pedidos');
        }
    }

    function _mover(delta) {
        if (!_items.length) return;
        _idx = (_idx + delta + _items.length) % _items.length;
        _render();
        const el = document.querySelector(`.vendor-search-item[data-vsi="${_idx}"]`);
        if (el) el.scrollIntoView({ block: 'nearest' });
    }

    // ── Listeners ──
    document.addEventListener('DOMContentLoaded', () => {
        const ov = document.getElementById('vendorSearchOverlay');
        const inp = document.getElementById('vendorSearchInput');
        const cont = document.getElementById('vendorSearchResults');
        if (!ov || !inp || !cont) return;

        inp.addEventListener('input', () => _buscar(inp.value));
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); _mover(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); _mover(-1); }
            else if (e.key === 'Enter') { e.preventDefault(); _activar(_idx); }
            else if (e.key === 'Escape') { e.preventDefault(); cerrarBusquedaGlobal(); }
        });
        // Backdrop cierra; click dentro del box no
        ov.addEventListener('click', (e) => { if (e.target === ov) cerrarBusquedaGlobal(); });
        cont.addEventListener('click', (e) => {
            const item = e.target.closest('.vendor-search-item');
            if (item) _activar(parseInt(item.dataset.vsi, 10));
        });
    });

    // Atajo Ctrl/Cmd + K
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            const ov = document.getElementById('vendorSearchOverlay');
            if (ov && !ov.classList.contains('hidden')) cerrarBusquedaGlobal();
            else abrirBusquedaGlobal();
        }
    });

    // Exponer global
    window.abrirBusquedaGlobal = abrirBusquedaGlobal;
    window.cerrarBusquedaGlobal = cerrarBusquedaGlobal;
})();
