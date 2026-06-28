// ============================================
// NOTIFICACIONES.JS — Centro de notificaciones in-app (admin)
// Feed unificado de señales operativas YA disponibles en memoria:
//   • Fraude: pedidos con alerta_fraude
//   • Pedidos sin finalizar: pendientes con antigüedad > 2 días
//   • Créditos por vencer/vencidos: entregados con saldo y fecha pasada
// Estado leído/no-leído persistido en IndexedDB (hdv_notif_leidas).
// Cero acceso a lógica de negocio: solo lee y navega. CSP-safe.
// ============================================

let _notifLeidas = new Set();
let _notifActuales = [];
let _notifPanelAbierto = false;
let _notifHideTimer = null;

const _NOTIF_AGING_PENDIENTE_DIAS = 2;
const _NOTIF_VENC_DIAS = 30; // fallback si no hay config

async function _notifCargarLeidas() {
    try {
        const arr = (await HDVStorage.getItem('hdv_notif_leidas')) || [];
        _notifLeidas = new Set(arr);
    } catch (e) { _notifLeidas = new Set(); }
}

async function _notifGuardarLeidas() {
    try { await HDVStorage.setItem('hdv_notif_leidas', Array.from(_notifLeidas).slice(-500)); } catch (e) {}
}

function _notifDiasDesde(fecha) {
    const t = new Date(fecha).getTime();
    if (!t) return 0;
    return Math.floor((Date.now() - t) / 86400000);
}

// Recolecta las notificaciones desde los datos en memoria.
function _recolectarNotificaciones() {
    const pedidos = (typeof todosLosPedidos !== 'undefined' && todosLosPedidos) ? todosLosPedidos : [];
    const items = [];

    // 1) Fraude
    pedidos.filter(p => p.alerta_fraude).forEach(p => {
        items.push({
            id: 'fraude:' + p.id,
            tipo: 'alert',
            icono: 'shield-alert',
            titulo: 'Alerta de fraude',
            detalle: `${p.cliente?.nombre || 'Cliente'} · ${formatearGuaranies(p.total)}`,
            ts: new Date(p.fecha).getTime() || 0,
            seccion: 'forense'
        });
    });

    // 2) Créditos por vencer/vencidos (entregados con saldo, fecha pasada)
    let diasVenc = _NOTIF_VENC_DIAS;
    try {
        const cfg = parseInt(document.getElementById('configDiasVencimiento')?.value, 10);
        if (cfg > 0) diasVenc = cfg;
    } catch (e) {}
    pedidos.filter(p => p.estado === 'entregado').forEach(p => {
        const dias = _notifDiasDesde(p.fecha);
        if (dias >= diasVenc) {
            items.push({
                id: 'credito:' + p.id,
                tipo: 'warn',
                icono: 'hand-coins',
                titulo: 'Crédito por revisar',
                detalle: `${p.cliente?.nombre || 'Cliente'} · ${dias} días · ${formatearGuaranies(p.total)}`,
                ts: new Date(p.fecha).getTime() || 0,
                seccion: 'creditos'
            });
        }
    });

    // 3) Pedidos sin finalizar (pendientes con antigüedad)
    pedidos.filter(p => p.estado === 'pedido_pendiente').forEach(p => {
        const dias = _notifDiasDesde(p.fecha);
        if (dias >= _NOTIF_AGING_PENDIENTE_DIAS) {
            items.push({
                id: 'pendiente:' + p.id,
                tipo: 'info',
                icono: 'clock',
                titulo: 'Pedido sin finalizar',
                detalle: `${p.cliente?.nombre || 'Cliente'} · ${dias} días en espera`,
                ts: new Date(p.fecha).getTime() || 0,
                seccion: 'pedidos'
            });
        }
    });

    items.sort((a, b) => b.ts - a.ts);
    return items.slice(0, 50);
}

function _notifColor(tipo) {
    return tipo === 'alert' ? 'var(--alert)' : tipo === 'warn' ? 'var(--warn)' : 'var(--steel-bright)';
}

function renderNotificaciones() {
    _notifActuales = _recolectarNotificaciones();
    const noLeidas = _notifActuales.filter(n => !_notifLeidas.has(n.id));

    const badge = document.getElementById('notifBadge');
    if (badge) {
        if (noLeidas.length > 0) {
            badge.textContent = noLeidas.length > 99 ? '99+' : String(noLeidas.length);
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    const lista = document.getElementById('notifLista');
    if (!lista) return;
    if (_notifActuales.length === 0) {
        lista.innerHTML = `<div class="notif-empty"><i data-lucide="check-circle"></i><p>Todo al día</p></div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }
    lista.innerHTML = _notifActuales.map(n => {
        const noLeida = !_notifLeidas.has(n.id);
        return `<button type="button" class="notif-item ${noLeida ? 'notif-no-leida' : ''}" data-notif-id="${escapeHTML(n.id)}" data-notif-sec="${escapeHTML(n.seccion)}">
            <span class="notif-dot" style="background:${_notifColor(n.tipo)}"></span>
            <span class="notif-ico"><i data-lucide="${escapeHTML(n.icono)}"></i></span>
            <span class="notif-txt">
                <span class="notif-titulo">${escapeHTML(n.titulo)}</span>
                <span class="notif-detalle">${escapeHTML(n.detalle)}</span>
            </span>
        </button>`;
    }).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();

    lista.querySelectorAll('.notif-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const sec = btn.getAttribute('data-notif-sec');
            toggleNotificaciones(true); // cerrar
            if (sec && typeof cambiarSeccion === 'function') cambiarSeccion(sec);
        });
    });
}

async function toggleNotificaciones(forzarCerrar) {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    const abrir = forzarCerrar ? false : !_notifPanelAbierto;
    _notifPanelAbierto = abrir;
    if (abrir) {
        // Interrumpe un cierre en curso (evita que el timeout viejo oculte el panel reabierto)
        if (_notifHideTimer) { clearTimeout(_notifHideTimer); _notifHideTimer = null; }
        renderNotificaciones();
        panel.classList.remove('hidden');
        requestAnimationFrame(() => panel.classList.add('notif-open'));
        // marcar como leídas las visibles
        _notifActuales.forEach(n => _notifLeidas.add(n.id));
        await _notifGuardarLeidas();
        const badge = document.getElementById('notifBadge');
        if (badge) badge.classList.add('hidden');
    } else {
        panel.classList.remove('notif-open');
        if (_notifHideTimer) clearTimeout(_notifHideTimer);
        _notifHideTimer = setTimeout(() => { panel.classList.add('hidden'); _notifHideTimer = null; }, 160);
    }
}

// Cerrar al click afuera
document.addEventListener('click', (e) => {
    if (!_notifPanelAbierto) return;
    const panel = document.getElementById('notifPanel');
    const btn = document.getElementById('btnNotificaciones');
    if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
        toggleNotificaciones(true);
    }
});

// Inicialización: cargar estado leído y refrescar badge
(async function _initNotificaciones() {
    await _notifCargarLeidas();
    // Refrescar badge cuando el dashboard ya tenga pedidos (reintento suave)
    let intentos = 0;
    const tick = () => {
        if (typeof todosLosPedidos !== 'undefined' && todosLosPedidos && todosLosPedidos.length >= 0) {
            renderNotificaciones();
        }
        if (++intentos < 6) setTimeout(tick, 2000);
    };
    setTimeout(tick, 1500);
})();
