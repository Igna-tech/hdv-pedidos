// ============================================
// HDV Vendedor — Centro de notificaciones in-app
// Feed: cambios del admin en catálogo / pedidos / créditos + pedidos sin sincronizar.
// Estado leído/no-leído en IndexedDB (hdv_notif_vendedor). CSP-safe.
// Requiere: HDVStorage, escapeHTML, cambiarVistaVendedor, lucide.
// ============================================

(function () {
    const KEY = 'hdv_notif_vendedor';
    const MAX = 50;
    let _lista = [];
    let _hideTimer = null;
    let _catDebounce = null;

    function _esc(s) { return (typeof escapeHTML === 'function') ? escapeHTML(String(s ?? '')) : String(s ?? ''); }

    const ICONO = { catalogo: 'package', pedido: 'receipt', credito: 'credit-card', sync: 'cloud-off', info: 'bell' };

    async function _cargar() {
        try { _lista = (await HDVStorage.getItem(KEY)) || []; } catch (_) { _lista = []; }
        _actualizarBadge();
    }

    async function _persistir() {
        try { await HDVStorage.setItem(KEY, _lista.slice(0, MAX)); } catch (_) {}
    }

    function _unsyncCount() {
        try {
            const peds = (HDVStorage.getCached && HDVStorage.getCached('hdv_pedidos')) || [];
            return peds.filter(p => p && p.sincronizado === false).length;
        } catch (_) { return 0; }
    }

    function _noLeidas() {
        return _lista.filter(n => !n.leida).length + (_unsyncCount() > 0 ? 1 : 0);
    }

    function _actualizarBadge() {
        const badge = document.getElementById('notifBadge');
        if (!badge) return;
        const n = _noLeidas();
        if (n > 0) { badge.textContent = n > 9 ? '9+' : String(n); badge.classList.remove('hidden'); }
        else { badge.classList.add('hidden'); }
    }

    // Agrega una notificación al feed
    function notifVendedorAgregar(tipo, titulo, detalle) {
        _lista.unshift({
            id: 'n' + Date.now() + Math.random().toString(36).slice(2, 6),
            tipo: tipo || 'info', titulo: titulo || '', detalle: detalle || '',
            ts: Date.now(), leida: false
        });
        if (_lista.length > MAX) _lista = _lista.slice(0, MAX);
        _persistir();
        _actualizarBadge();
        const panel = document.getElementById('notifPanel');
        if (panel && !panel.classList.contains('hidden')) renderNotificaciones();
    }

    // Versión con debounce para el catálogo (evita spam ante ráfagas realtime)
    function notifVendedorCatalogo() {
        clearTimeout(_catDebounce);
        _catDebounce = setTimeout(() => {
            notifVendedorAgregar('catalogo', 'Catálogo actualizado', 'El administrador actualizó productos, precios o stock.');
        }, 1200);
    }

    function _fechaRel(ts) {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return 'hace un momento';
        if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
        if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
        return `hace ${Math.floor(s / 86400)} d`;
    }

    function renderNotificaciones() {
        const cont = document.getElementById('notifLista');
        if (!cont) return;
        const filas = [];

        // Item especial: pedidos sin sincronizar
        const sinSync = _unsyncCount();
        if (sinSync > 0) {
            filas.push(`<button type="button" class="notif-item notif-no-leida" data-notif-nav="pedidos">
                <div class="flex items-start gap-2.5">
                    <i data-lucide="cloud-off" class="w-4 h-4 text-amber-500 shrink-0 mt-0.5"></i>
                    <div class="min-w-0">
                        <p class="text-sm font-semibold text-ink leading-tight">${sinSync} pedido${sinSync > 1 ? 's' : ''} sin sincronizar</p>
                        <p class="text-[11px] text-slate-500 leading-tight mt-0.5">Se subirán al recuperar conexión.</p>
                    </div>
                </div>
            </button>`);
        }

        if (!_lista.length && !sinSync) {
            cont.innerHTML = `<p class="text-center text-slate-400 text-sm py-6">Sin notificaciones</p>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        _lista.forEach(n => {
            filas.push(`<button type="button" class="notif-item ${n.leida ? '' : 'notif-no-leida'}" data-notif-nav="${_esc(n.tipo === 'catalogo' ? 'lista' : n.tipo === 'credito' ? 'creditos' : n.tipo === 'pedido' ? 'pedidos' : '')}">
                <div class="flex items-start gap-2.5">
                    <i data-lucide="${_esc(ICONO[n.tipo] || 'bell')}" class="w-4 h-4 text-slate-400 shrink-0 mt-0.5"></i>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-semibold text-ink leading-tight">${_esc(n.titulo)}</p>
                        ${n.detalle ? `<p class="text-[11px] text-slate-500 leading-tight mt-0.5">${_esc(n.detalle)}</p>` : ''}
                        <p class="text-[10px] text-slate-600 mt-1">${_fechaRel(n.ts)}</p>
                    </div>
                </div>
            </button>`);
        });

        cont.innerHTML = filas.join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        cont.querySelectorAll('.notif-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const nav = btn.dataset.notifNav;
                toggleNotificaciones(true);
                if (nav && typeof cambiarVistaVendedor === 'function') cambiarVistaVendedor(nav);
            });
        });
    }

    function toggleNotificaciones(forzarCerrar) {
        const panel = document.getElementById('notifPanel');
        if (!panel) return;
        const abierto = !panel.classList.contains('hidden');
        if (abierto || forzarCerrar) {
            panel.classList.remove('notif-open');
            clearTimeout(_hideTimer);
            _hideTimer = setTimeout(() => { panel.classList.add('hidden'); _hideTimer = null; }, 160);
            return;
        }
        renderNotificaciones();
        panel.classList.remove('hidden');
        requestAnimationFrame(() => panel.classList.add('notif-open'));
        // Marcar todas como leídas
        _lista.forEach(n => n.leida = true);
        _persistir();
        _actualizarBadge();
    }

    // Cerrar al hacer click afuera
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('notifPanel');
        if (!panel || panel.classList.contains('hidden')) return;
        if (e.target.closest('#notifPanel') || e.target.closest('#btnNotificaciones')) return;
        toggleNotificaciones(true);
    });

    document.addEventListener('DOMContentLoaded', _cargar);

    // Exponer global
    window.notifVendedorAgregar = notifVendedorAgregar;
    window.notifVendedorCatalogo = notifVendedorCatalogo;
    window.toggleNotificaciones = toggleNotificaciones;
    window.renderNotificaciones = renderNotificaciones;
})();
