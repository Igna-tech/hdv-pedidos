// ============================================
// HDV Pedidos - App Vendedor v3.0 (Controlador)
// Entry point: inicializacion, eventos, navegacion.
// UI en js/vendedor/ui.js, carrito en js/vendedor/cart.js
// Estado global en js/core/state.js, utils en js/utils/
// ============================================

// ============================================
// EVENT DISPATCH — reemplaza handlers inline en index.html
// ============================================
const _vendedorActionMap = {
    // Header
    'forzarActualizacion':            () => typeof forzarActualizacion === 'function' && forzarActualizacion(),
    'cerrarSesion':                   () => typeof cerrarSesion === 'function' && cerrarSesion(),
    'abrirBusquedaGlobal':            () => typeof abrirBusquedaGlobal === 'function' && abrirBusquedaGlobal(),
    'cerrarBusquedaGlobal':           () => typeof cerrarBusquedaGlobal === 'function' && cerrarBusquedaGlobal(),
    'toggleNotificaciones':           () => typeof toggleNotificaciones === 'function' && toggleNotificaciones(),
    'abrirChatIA':                    () => typeof abrirChatIA === 'function' && abrirChatIA(),
    'cerrarChatIAVendedor':           () => document.getElementById('aiChatDrawerVendedor')?.hide(),
    'toggleCatDropdown':              () => typeof toggleCatDropdown === 'function' && toggleCatDropdown(),
    'cerrarClienteInfo':              () => document.getElementById('clienteInfo')?.classList.add('hidden'),
    // Bottom nav
    'cambiarVistaVendedor':           (_, a) => typeof cambiarVistaVendedor === 'function' && cambiarVistaVendedor(a),
    'mostrarModalCarrito':            () => typeof mostrarModalCarrito === 'function' && mostrarModalCarrito(),
    // Backup modal
    'exportarBackupVendedor':         () => typeof exportarBackupVendedor === 'function' && exportarBackupVendedor(),
    'exportarSoloPedidos':            () => typeof exportarSoloPedidos === 'function' && exportarSoloPedidos(),
    'compartirBackupWhatsApp':        () => typeof compartirBackupWhatsApp === 'function' && compartirBackupWhatsApp(),
    'triggerRestaurarFileVendedor':   () => document.getElementById('restaurarFileVendedor').click(),
    'cerrarModalBackup':              () => typeof cerrarModalBackup === 'function' && cerrarModalBackup(),
    // Cart drawer
    'closeCartModal':                 () => typeof closeCartModal === 'function' && closeCartModal(),
    'setTipoPago':                    (_, v) => typeof setTipoPago === 'function' && setTipoPago(v),
    'abrirNotasPedido':               () => typeof abrirNotasPedido === 'function' && abrirNotasPedido(),
    'vaciarCarrito':                  () => typeof vaciarCarrito === 'function' && vaciarCarrito(),
    'procesarPedido':                 () => typeof procesarPedido === 'function' && procesarPedido(),
    'procesarCobroInterno':           () => typeof procesarCobroInterno === 'function' && procesarCobroInterno(),
    'procesarFacturaMock':            () => typeof procesarFacturaMock === 'function' && procesarFacturaMock(),
    // Modal factura
    'imprimirFactura':                () => typeof imprimirFactura === 'function' && imprimirFactura(),
    'cerrarModalFactura':             () => typeof cerrarModalFactura === 'function' && cerrarModalFactura(),
    // Modal recibo
    'generarPDFRecibo':               () => typeof generarPDFRecibo === 'function' && generarPDFRecibo(),
    'cerrarModalRecibo':              () => typeof cerrarModalRecibo === 'function' && cerrarModalRecibo(),
    // Pedidos — acciones de tarjeta
    'imprimirTicketVendedor':         (_, id) => typeof imprimirTicketVendedor === 'function' && imprimirTicketVendedor(id),
    'generarPDFVendedor':             (_, id) => typeof generarPDFVendedor === 'function' && generarPDFVendedor(id),
    'compartirPedidoWA':              (_, id) => typeof enviarPedidoWhatsApp === 'function' && enviarPedidoWhatsApp(id),
    // Historial cliente
    'mostrarHistorialCliente':        (_, id) => typeof mostrarHistorialCliente === 'function' && mostrarHistorialCliente(id),
    'cerrarHistorialCliente':         () => typeof cerrarHistorialCliente === 'function' && cerrarHistorialCliente(),
    'repetirUltimoPedido':            (_, id) => typeof repetirUltimoPedido === 'function' && repetirUltimoPedido(id),
    // Mi Caja
    'setCajaModo':                    (_, modo) => typeof setCajaModo === 'function' && setCajaModo(modo),
    'enviarCierreWA':                 (btn) => { try { const d = JSON.parse(btn.getAttribute('data-arg') || '{}'); typeof enviarCierreWhatsApp === 'function' && enviarCierreWhatsApp(d); } catch(_){} },
    // Cobros en campo
    'abrirCobrosCliente':             (_, id) => typeof abrirCobrosCliente === 'function' && abrirCobrosCliente(id),
    'cerrarCobrosDrawer':             () => typeof cerrarCobrosDrawer === 'function' && cerrarCobrosDrawer(),
    'registrarPagoCobro':             (_, id) => typeof registrarPagoCobro === 'function' && registrarPagoCobro(id),
    'cobrarTodoEfectivo':             (_, id) => typeof cobrarTodoEfectivo === 'function' && cobrarTodoEfectivo(id),
    // Smart client search
    'limpiarZona':                    () => typeof resetearFiltroZona === 'function' && resetearFiltroZona(),
    'limpiarClienteSeleccionado':     () => typeof _limpiarClienteSeleccionado === 'function' && _limpiarClienteSeleccionado(),
    'seleccionarClienteId':           (_, id) => typeof _seleccionarCliente === 'function' && _seleccionarCliente(id),
    'toggleZonaPicker':               () => typeof _toggleZonaPicker === 'function' && _toggleZonaPicker(),
    'elegirZonaFiltro':               (_, zona) => { zonaActiva = zona || null; if (typeof _actualizarZonaBtn === 'function') _actualizarZonaBtn(zonaActiva); },
    // Sidebar menu
    'abrirSidebar':                   () => {
        const sidebar = document.getElementById('sidebarMenu');
        if (!sidebar) return;
        const nombre = window.hdvUsuario?.nombre || window.hdvUsuario?.email || 'Vendedor';
        const email = window.hdvUsuario?.email || '';
        const avatarEl = document.getElementById('sidebarAvatar');
        const nombreEl = document.getElementById('sidebarNombre');
        const emailEl = document.getElementById('sidebarEmail');
        if (avatarEl) avatarEl.textContent = nombre.charAt(0).toUpperCase();
        if (nombreEl) nombreEl.textContent = nombre.split(/\s+/)[0] || nombre;
        if (emailEl) emailEl.textContent = email;
        // Saludo segun horario + fecha/hora (igual a admin)
        const h = new Date().getHours();
        const saludoEl = document.getElementById('sidebarSaludo');
        if (saludoEl) saludoEl.textContent = h < 6 ? 'Buenas noches' : h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
        const fhEl = document.getElementById('sidebarFechaHora');
        if (fhEl) {
            const n = new Date();
            const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
            fhEl.textContent = `${dias[n.getDay()]} ${n.getDate()} ${meses[n.getMonth()]} · ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
        }
        if (typeof _actualizarBadgeCreditos === 'function') _actualizarBadgeCreditos();
        sidebar.show();
    },
    'cerrarSidebar':                  () => { const s = document.getElementById('sidebarMenu'); if (s) s.hide(); },
    // Configuracion
    'limpiarTodosDatos':              () => typeof limpiarTodosDatos === 'function' && limpiarTodosDatos(),
    'cambiarContrasenaVendedor':      () => typeof cambiarContrasenaVendedor === 'function' && cambiarContrasenaVendedor(),
    'sincronizarAhora':               () => typeof sincronizarAhoraVendedor === 'function' && sincronizarAhoraVendedor(),
    // Clientes (vendedor)
    'setClientesModo':                (_, m) => typeof setClientesModo === 'function' && setClientesModo(m),
    'setClientesZona':                (_, z) => typeof setClientesZona === 'function' && setClientesZona(z),
    'toggleClientesZona':             () => typeof toggleClientesZona === 'function' && toggleClientesZona(),
    'clientesVendPagina':             (_, a) => typeof clientesVendPaginaCambiar === 'function' && clientesVendPaginaCambiar(a),
    'crearPedidoDesdeCliente':        (_, id) => {
        if (typeof _seleccionarCliente === 'function') _seleccionarCliente(id);
        if (typeof cambiarVistaVendedor === 'function') cambiarVistaVendedor('lista');
    },
    'verClienteEnMapa':               (_, id) => {
        if (typeof cambiarVistaVendedor === 'function') cambiarVistaVendedor('mapa');
        setTimeout(() => { if (typeof HDVMapa !== 'undefined') HDVMapa.focusCliente(id); }, 400);
    },
    'toggleLeyendaMapa':              () => typeof HDVMapa !== 'undefined' && HDVMapa.toggleLeyenda(),
    'encuadrarMapa':                  () => typeof HDVMapa !== 'undefined' && HDVMapa.encuadrar(),
    'toggleMapaFiltro':               () => typeof HDVMapa !== 'undefined' && HDVMapa.toggleFiltro(),
    'marcarVisitaMapa':               (_, id) => typeof HDVMapa !== 'undefined' && HDVMapa.marcarVisita(id),
    // Mis Pedidos — acciones de tarjeta
    'abrirModalEntrega':                  (_, id) => window.abrirModalEntrega(id),
    'cobrarPedidoVendedor':               (_, id) => cobrarPedidoVendedor(id),
    'entregarCreditoVendedor':            (_, id) => entregarCreditoVendedor(id),
    'toggle-pedido-accordion-vendedor':   (_, id) => _togglePedidoAccordionVendedor(id),
    'ver-pedido-completo-vendedor':       (_, id) => _abrirModalPedidoCompletoVendedor(id),
    'cerrar-modal-pedido-vendedor':       () => document.getElementById('dialogVendedorPedidoCompleto')?.hide(),
    // Mis Pedidos — filtros y paginacion
    'setPedidosFiltro':               (_, f) => typeof _setPedidosFiltro === 'function' && _setPedidosFiltro(f),
    'setPedidosPagina':               (_, n) => typeof _setPedidosPagina === 'function' && _setPedidosPagina(n),
    'togglePedidosFiltroDropdown':    () => typeof _togglePedidosFiltroDropdown === 'function' && _togglePedidosFiltroDropdown(),
    // Creditos
    'mostrarCreditos':                () => typeof mostrarCreditos === 'function' && mostrarCreditos(),
    'registrarPagoManualVendedor':    (_, id) => typeof registrarPagoManualVendedor === 'function' && registrarPagoManualVendedor(id),
    // Mapa de clientes
    'setFiltroMapa':                  (_, f) => typeof HDVMapa !== 'undefined' && HDVMapa.setFiltroMapa(f),
    'iniciarColocacionPin':           (_, id) => typeof HDVMapa !== 'undefined' && HDVMapa.iniciarColocacionPin(id),
    'confirmarPin':                   () => typeof HDVMapa !== 'undefined' && HDVMapa.confirmarPin(),
    'cancelarColocacionPin':          () => typeof HDVMapa !== 'undefined' && HDVMapa.cancelarColocacionPin(),
    'cerrarBottomSheetMapa':          () => typeof HDVMapa !== 'undefined' && HDVMapa.cerrarBottomSheet(),
    'centrarEnMiUbicacion':           () => typeof HDVMapa !== 'undefined' && HDVMapa.centrarEnMiUbicacion(),
    'crearPedidoDesdeMapaCliente':    (_, id) => {
        if (typeof _seleccionarCliente === 'function') _seleccionarCliente(id);
        if (typeof HDVMapa !== 'undefined') HDVMapa.cerrarBottomSheet();
        cambiarVistaVendedor('lista');
    },
    'cobrarDesdeMapaCliente':         (_, id) => {
        if (typeof HDVMapa !== 'undefined') HDVMapa.cerrarBottomSheet();
        if (typeof abrirCobrosCliente === 'function') abrirCobrosCliente(id);
    },
    // Mi Jornada — timeline
    'toggleDiaJornada':               (_, d) => typeof _toggleDiaJornada === 'function' && _toggleDiaJornada(d),
    'agregarGastoVendedor':           () => typeof agregarGastoVendedor === 'function' && agregarGastoVendedor(),
    'cerrarSemanaVendedor':           (_, s) => typeof cerrarSemanaVendedor === 'function' && cerrarSemanaVendedor(s),
    'eliminarGastoVendedor':          (_, id) => typeof eliminarGastoVendedor === 'function' && eliminarGastoVendedor(id),
    'mostrarConfiguracion':           () => typeof mostrarConfiguracion === 'function' && mostrarConfiguracion(),
};

document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const arg = btn.getAttribute('data-arg') ?? undefined;
    if (_vendedorActionMap[action]) {
        _vendedorActionMap[action](btn, arg);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('restaurarFileVendedor')
        ?.addEventListener('change', (e) => typeof restaurarBackupVendedor === 'function' && restaurarBackupVendedor(e));
}, { once: true });

// --- Estado local del controlador ---
let categoriaActual = 'todas';
let vistaCatalogo = 'categorias'; // 'categorias' o 'productos'
let categoriaSeleccionada = null; // categoria clickeada en el grid
let vistaActual = 'lista'; // 'lista', 'pedidos' o 'config'
let autoBackupInterval = null;

// --- Accordion de tarjetas Mis Pedidos ---
let _pedidoVendedorExpandidoId = null;

function _togglePedidoAccordionVendedor(id) {
    if (_pedidoVendedorExpandidoId === id) {
        _setPedidoAccordionEstadoVendedor(id, false);
        _pedidoVendedorExpandidoId = null;
        return;
    }
    if (_pedidoVendedorExpandidoId) _setPedidoAccordionEstadoVendedor(_pedidoVendedorExpandidoId, false);
    _setPedidoAccordionEstadoVendedor(id, true);
    _pedidoVendedorExpandidoId = id;
}

function _setPedidoAccordionEstadoVendedor(id, open) {
    const card = document.querySelector(`[data-pedido-id="${id}"]`);
    if (!card) return;
    card.querySelector('.pedido-accordion-body')?.classList.toggle('open', open);
    const chevron = card.querySelector('.pedido-chevron-icon');
    if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}
window._hdvRestoreVendedorAccordion = () => {
    if (_pedidoVendedorExpandidoId) _setPedidoAccordionEstadoVendedor(_pedidoVendedorExpandidoId, true);
};

async function _abrirModalPedidoCompletoVendedor(id) {
    const todos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const pedido = todos.find(p => p.id === id);
    if (!pedido) return;
    const numPed = formatNumPedido(pedido);
    const { label: labelEstado, clases: colorEstado } = obtenerEstadoUI(pedido.estado, '700');
    const itemsHTML = (pedido.items || []).map(i => `
        <div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <span class="text-sm text-gray-700">${escapeHTML(i.nombre)} <span class="text-xs text-gray-400">(${escapeHTML(i.presentacion)}) ×${i.cantidad}</span></span>
            <span class="text-sm font-medium text-gray-800 ml-3 shrink-0">${formatearGuaranies(i.subtotal)}</span>
        </div>`).join('');

    let dialog = document.getElementById('dialogVendedorPedidoCompleto');
    if (!dialog) {
        dialog = document.createElement('sl-dialog');
        dialog.id = 'dialogVendedorPedidoCompleto';
        dialog.setAttribute('label', 'Detalle del Pedido');
        document.body.appendChild(dialog);
    }

    dialog.innerHTML = `
        <div class="space-y-3">
            <div class="flex items-start justify-between">
                <div>
                    <p class="font-bold text-gray-900">${escapeHTML(pedido.cliente?.nombre || 'Sin cliente')}</p>
                    <div class="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        ${numPed ? `<span class="font-mono">#${numPed}</span>` : ''}
                        <span>${new Date(pedido.fecha).toLocaleString('es-PY')}</span>
                    </div>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${colorEstado}">${labelEstado}</span>
            </div>
            <div class="bg-gray-50 rounded-lg px-3 py-2">
                ${itemsHTML}
                <div class="flex justify-between items-center pt-2 border-t border-gray-200 mt-1">
                    <span class="text-sm font-semibold text-gray-700">Total</span>
                    <span class="text-base font-bold text-gray-900">${formatearGuaranies(pedido.total)}</span>
                </div>
            </div>
            <div class="flex items-center gap-2 text-xs text-gray-500">
                <span>${escapeHTML(pedido.tipoPago || 'contado')}</span>
                ${pedido.notas ? `<span>·</span><span>${escapeHTML(pedido.notas)}</span>` : ''}
            </div>
        </div>
        <sl-button slot="footer" variant="default" data-action="cerrar-modal-pedido-vendedor">Cerrar</sl-button>`;
    dialog.show();
    if (typeof lucide !== 'undefined') setTimeout(() => lucide.createIcons({ nodes: [dialog] }), 50);
}

// Flag global: suprime toasts info/success durante carga inicial
window._hdvAppReady = false;

// ============================================
// INICIALIZACION
// ============================================
async function _cargarLogoVendedor() {
    // Fuente unica (bucket empresa_assets, mas reciente) — igual que el login
    const aplicar = (url) => {
        if (!url) return;
        window._empresaLogoUrl = url;
        const img = document.getElementById('vendorHeaderLogo');
        const svg = document.getElementById('vendorHeaderLogoSvg');
        if (img) {
            img.onload = () => { img.classList.remove('hidden'); if (svg) svg.classList.add('hidden'); };
            img.src = url;
        }
    };
    if (typeof aplicarLogoEmpresa === 'function') { await aplicarLogoEmpresa(aplicar); return; }
    try { const { data } = await SupabaseService.fetchConfigEmpresa(); if (data?.logo_url) aplicar(data.logo_url); } catch (_e) {}
}

document.addEventListener('DOMContentLoaded', async () => {
    await cargarDatos();
    _cargarLogoVendedor();
    configurarEventos();
    cargarCarritoGuardado();
    registrarSW();
    iniciarAutoBackup();
    actualizarInfoBackup();

    // Marcar app lista — los toasts info/success se desbloquean despues de la carga inicial
    setTimeout(() => { window._hdvAppReady = true; }, TIEMPOS.SYNC_DELAY_ONLINE_MS);

    // Alerta al cerrar/recargar si hay pedidos sin sincronizar
    // Usa lectura sincrona del cache en memoria (beforeunload no espera promesas)
    window.addEventListener('beforeunload', (e) => {
        try {
            const pedidos = HDVStorage.getCached('hdv_pedidos') || [];
            const sinSync = pedidos.filter(p => p.sincronizado === false);
            if (sinSync.length > 0) {
                e.preventDefault();
                e.returnValue = '';
            }
        } catch (_err) { /* silencioso si storage falla */ }
    });

    // Sincronizacion automatica de pedidos offline gestionada por SyncManager (js/services/sync.js)

    // ============================================
    // RADAR EN TIEMPO REAL — Suscripciones Supabase Realtime
    // ============================================

    // Canal 1: Catalogo (productos, precios, stock, clientes)
    if (typeof escucharCatalogoRealtime === 'function') {
        escucharCatalogoRealtime(async (data) => {
            if (data && data.categorias && data.productos) {
                categorias = data.categorias || [];
                productos = (data.productos || []).filter(p => !p.oculto && (p.estado || 'disponible') !== 'discontinuado');
                clientes = (data.clientes || []).filter(c => !c.oculto);
                poblarClientes();
                crearFiltrosCategorias();
                if (vistaActual === 'lista') mostrarProductos();
                try {
                    await HDVStorage.setItem('hdv_catalogo_local', {
                        categorias: data.categorias,
                        productos: data.productos,
                        clientes: data.clientes
                    });
                } catch(e) {}
                console.log('[Vendedor RT] Catalogo actualizado en tiempo real');
                if (typeof mostrarToast === 'function') {
                    mostrarToast('Catalogo actualizado', 'info');
                }
                if (typeof notifVendedorCatalogo === 'function') notifVendedorCatalogo();
            }
        });
    }

    // Canal 2: Pedidos — actualizaciones granulares de estado
    if (typeof escucharPedidosRealtimeVendedor === 'function') {
        escucharPedidosRealtimeVendedor({
            onEstadoCambiado: (pedidoId, nuevoEstado, datos) => {
                console.log(`[Vendedor RT] Pedido ${pedidoId} -> ${nuevoEstado}`);
                // Notificacion in-app
                if (typeof notifVendedorAgregar === 'function') {
                    const num = datos?.numero_pedido != null ? '#' + String(datos.numero_pedido).padStart(7, '0') : (pedidoId || '').slice(0, 10);
                    const esCredito = nuevoEstado === 'cobrado_sin_factura' || nuevoEstado === 'entregado';
                    const labelEstado = nuevoEstado === 'entregado' ? 'Entregado'
                        : nuevoEstado === 'cobrado_sin_factura' ? 'Cobrado'
                        : nuevoEstado === 'anulado' ? 'Anulado' : nuevoEstado;
                    notifVendedorAgregar(esCredito ? 'credito' : 'pedido', `Pedido ${num}: ${labelEstado}`, 'Actualizado por el administrador.');
                }
                // Actualizar tarjeta en el DOM si la vista de pedidos esta activa
                if (vistaActual === 'pedidos' && typeof actualizarTarjetaPedidoDOM === 'function') {
                    const updated = actualizarTarjetaPedidoDOM(pedidoId, nuevoEstado);
                    if (updated) {
                        mostrarToast(`Pedido actualizado: ${nuevoEstado === PEDIDO_ESTADOS.ENTREGADO ? 'Entregado' : nuevoEstado === PEDIDO_ESTADOS.ANULADO ? 'Anulado' : nuevoEstado}`, 'info');
                    }
                }
                // Actualizar widget de jornada si esta visible
                if (vistaActual === 'jornada' && typeof mostrarMiCaja === 'function') {
                    mostrarMiCaja();
                }
            },
            onPedidoEliminado: (pedidoId) => {
                console.log(`[Vendedor RT] Pedido eliminado: ${pedidoId}`);
                if (typeof notifVendedorAgregar === 'function') notifVendedorAgregar('pedido', 'Pedido eliminado', 'El administrador eliminó un pedido.');
                if (vistaActual === 'pedidos' && typeof eliminarTarjetaPedidoDOM === 'function') {
                    eliminarTarjetaPedidoDOM(pedidoId);
                    mostrarToast('Un pedido fue eliminado por el administrador', 'warning');
                }
            },
            onSync: (pedidosMerged) => {
                console.log(`[Vendedor RT] Sync completa: ${pedidosMerged.length} pedidos`);
                if (vistaActual === 'pedidos' && typeof mostrarMisPedidos === 'function') {
                    mostrarMisPedidos();
                }
            },
            onErrorConexion: (err) => {
                console.warn('[Vendedor RT] Sin conexión al servidor:', err?.message);
                // Solo mostrar toast si la vista está activa (no interrumpir otras vistas)
                if (vistaActual === 'pedidos') {
                    mostrarToast('Sin conexión — mostrando pedidos locales', 'warning', 4000);
                }
            }
        });
    }

    // Re-sync al reconectar: re-fetch silencioso de pedidos
    // (Supabase Realtime maneja la reconexion de canales automaticamente)
    window.addEventListener('online', async () => {
        console.log('[Vendedor RT] Conexion restaurada, re-sincronizando pedidos...');
        try {
            if (typeof SupabaseService !== 'undefined') {
                const { data, error } = await SupabaseService.fetchPedidos();
                if (!error && data) {
                    const pedidosRemoto = data.map(r => r.datos);
                    await HDVStorage.atomicUpdate('hdv_pedidos', (pedidosLocal) => {
                        const list = pedidosLocal || [];
                        const sinSync = list.filter(p => p.sincronizado === false);
                        const remIds = new Set(pedidosRemoto.map(p => p.id));
                        const localesExtra = sinSync.filter(p => !remIds.has(p.id));
                        return [...pedidosRemoto, ...localesExtra];
                    });
                    if (vistaActual === 'pedidos' && typeof mostrarMisPedidos === 'function') {
                        mostrarMisPedidos();
                    }
                    console.log('[Vendedor RT] Pedidos re-sincronizados');
                }
            }
        } catch(e) {
            console.warn('[Vendedor RT] Error re-sync online:', e);
        }
    });
});

async function cargarDatos() {
    await HDVStorage.ready();
    // Preferencia de vista de catálogo (grid/lista) recordada
    try {
        const _v = await HDVStorage.getItem('hdv_vista_catalogo');
        if (_v && typeof _initVistaProductos === 'function') _initVistaProductos(_v);
    } catch (_e) {}
    try {
        // Prioridad 1: Supabase (datos mas recientes en la nube)
        let data = null;
        if (typeof obtenerCatalogo === 'function') {
            try {
                data = await obtenerCatalogo();
                if (data && data.productos) {
                    console.log('[Vendedor] Catalogo cargado desde Supabase');
                    try {
                        await HDVStorage.setItem('hdv_catalogo_local', {
                            categorias: data.categorias,
                            productos: data.productos,
                            clientes: data.clientes
                        });
                    } catch(e) { console.warn('[Vendedor] No se pudo cachear en HDVStorage'); }
                } else {
                    data = null;
                }
            } catch (fbErr) {
                console.warn('[Vendedor] Supabase no disponible:', fbErr.message);
                data = null;
            }
        }

        // Prioridad 2: IndexedDB (cache local, funciona offline)
        if (!data || !data.productos) {
            try {
                const cached = await HDVStorage.getItem('hdv_catalogo_local');
                if (cached) {
                    data = cached;
                    if (data && data.productos) {
                        console.log('[Vendedor] Catalogo cargado desde HDVStorage (cache)');
                    } else {
                        data = null;
                    }
                }
            } catch(e) { console.warn('[Vendedor] Error leyendo HDVStorage'); data = null; }
        }

        // Prioridad 3: JSON local (archivo estatico)
        if (!data || !data.productos) {
            const response = await fetch('productos.json?t=' + Date.now());
            data = await response.json();
            console.log('[Vendedor] Catalogo cargado desde JSON local');
        }

        categorias = data.categorias || [];
        productos = (data.productos || []).filter(p => !p.oculto && (p.estado || 'disponible') !== 'discontinuado');
        clientes = (data.clientes || []).filter(c => !c.oculto);

        poblarClientes();
        crearFiltrosCategorias();
        mostrarProductos();

        document.getElementById('searchInput').disabled = false;
    } catch (e) {
        console.error('Error cargando datos:', e);
        document.getElementById('productsContainer').innerHTML = generarEmptyState(
            `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="80" r="35" stroke="#fca5a5" stroke-width="3" fill="#fef2f2"/><path d="M88 70l24 20M112 70L88 90" stroke="#f87171" stroke-width="3" stroke-linecap="round"/><path d="M60 140h80" stroke="#fca5a5" stroke-width="2" stroke-linecap="round"/><path d="M75 155h50" stroke="#fecaca" stroke-width="2" stroke-linecap="round"/></svg>`,
            'Error al cargar catalogo', 'Verifica tu conexion a internet e intenta de nuevo',
            'Reintentar', 'cargarDatos()'
        );
    }
}

function configurarEventos() {
    const searchInput = document.getElementById('searchInput');
    const mostrarProductosDebounced = debounce(() => mostrarProductos(), 300);
    searchInput.addEventListener('input', mostrarProductosDebounced);

    // Smart client search
    if (typeof _initClienteSearch === 'function') _initClienteSearch();

    // Zone pills
    poblarZonePills();

    // sl-switch: auto-backup toggle
    const autoBackupToggle = document.getElementById('autoBackupToggle');
    if (autoBackupToggle) {
        autoBackupToggle.addEventListener('sl-change', () => toggleAutoBackup());
    }
}

// ============================================
// DESGLOSE IVA (Paraguay — precios con IVA incluido)
// ============================================
// NAVEGACION DE VISTAS
// ============================================
function cambiarVistaVendedor(vista) {
    vistaActual = vista;

    // Ocultar mapa si se cambia a otra vista
    if (vista !== 'mapa' && typeof HDVMapa !== 'undefined') HDVMapa.ocultarMapa();

    // Transición suave del contenido (excepto mapa, pantalla aparte)
    if (vista !== 'mapa') {
        const pc = document.getElementById('productsContainer');
        if (pc) { pc.classList.remove('hdv-view-in'); void pc.offsetWidth; pc.classList.add('hdv-view-in'); }
    }

    const catFilters = document.getElementById('categoryFilters');
    const searchBox = document.getElementById('searchContainer');
    const clienteSearch = document.getElementById('clienteSearchWrapper');

    // FAB carrito: solo visible en catálogo
    const cartFab = document.getElementById('cartFabWrapper');
    if (cartFab) cartFab.style.display = vista === 'lista' ? '' : 'none';

    // Tarjeta del cliente (mini-perfil): SOLO en catálogo
    const _cInfo = document.getElementById('clienteInfo');
    if (_cInfo) {
        if (vista === 'lista' && clienteActual) _cInfo.classList.remove('hidden');
        else _cInfo.classList.add('hidden');
    }

    // Cerrar sidebar
    const sidebar = document.getElementById('sidebarMenu');
    if (sidebar) sidebar.hide();

    // Actualizar estado activo en el sidebar
    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
        btn.classList.remove('sidebar-nav-active');
        if (btn.dataset.section === vista) btn.classList.add('sidebar-nav-active');
    });

    if (vista === 'lista') {
        if (clienteSearch) clienteSearch.style.display = '';
        searchBox.style.display = '';
        catFilters.style.display = '';
        vistaCatalogo = 'categorias';
        categoriaSeleccionada = null;
        categoriaActual = 'todas';
        if (typeof _subcatSeleccionada !== 'undefined') _subcatSeleccionada = null;
        document.getElementById('searchInput').value = '';
        const catLbl = document.getElementById('catDropdownLabel');
        if (catLbl) catLbl.textContent = 'Categorías';
        mostrarProductos();
    } else if (vista === 'pedidos') {
        if (clienteSearch) clienteSearch.style.display = 'none';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        mostrarMisPedidos();
    } else if (vista === 'jornada') {
        if (clienteSearch) clienteSearch.style.display = 'none';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        mostrarMiCaja();
    } else if (vista === 'clientes') {
        if (clienteSearch) clienteSearch.style.display = 'none';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        if (typeof mostrarClientesVendedor === 'function') mostrarClientesVendedor();
    } else if (vista === 'creditos') {
        if (clienteSearch) clienteSearch.style.display = 'none';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        mostrarCreditos();
    } else if (vista === 'config') {
        if (clienteSearch) clienteSearch.style.display = 'none';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        mostrarConfiguracion();
    } else if (vista === 'mapa') {
        if (clienteSearch) clienteSearch.style.display = 'none';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        if (typeof mostrarMapa === 'function') mostrarMapa();
    }
}

// ============================================
// ZONAS Y RUTAS (logica)
// ============================================

let zonaActiva = null;

function obtenerZonasUnicas() {
    const zonasMap = {};
    clientes.forEach(c => {
        if (c.zona) {
            const z = c.zona.trim();
            zonasMap[z] = (zonasMap[z] || 0) + 1;
        }
    });
    return Object.entries(zonasMap).map(([zona, cantidad]) => ({ zona, cantidad })).sort((a, b) => a.zona.localeCompare(b.zona));
}

function seleccionarZona(zona) {
    zonaActiva = zona;
    poblarClientes();
    poblarZonePills();
    actualizarIndicadorZona(zona);
}

function resetearFiltroZona() {
    zonaActiva = null;
    poblarClientes();
    poblarZonePills();
    actualizarIndicadorZona(null);
}

function seleccionarClienteDesdeRuta(clienteId) {
    if (typeof _seleccionarCliente === 'function') _seleccionarCliente(clienteId);
    cambiarVistaVendedor('lista');
}

// ============================================
// MI CAJA - RENDICION Y GASTOS (logica)
// ============================================

function obtenerSemanaActualVendedor() {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function obtenerRangoSemanaVendedor(weekStr) {
    if (!weekStr) weekStr = obtenerSemanaActualVendedor();
    const parts = weekStr.split('-W');
    const year = parseInt(parts[0]);
    const week = parseInt(parts[1]);
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dayOfWeek = simple.getDay();
    const inicio = new Date(simple);
    inicio.setDate(simple.getDate() - dayOfWeek + 1);
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 6);
    fin.setHours(23, 59, 59, 999);
    return { inicio, fin };
}

function _esEstadoContadoVendedor(estado) {
    const norm = ESTADOS_ALIAS[estado] || estado;
    return norm === PEDIDO_ESTADOS.COBRADO;
}

// Lifecycle v2: ambas acciones convergen en el modal de entrega compartido
// (Cobro total / Cobro parcial / Ingresar a créditos). Se conservan como
// envoltorios por compatibilidad con cualquier llamador externo.
async function cobrarPedidoVendedor(pedidoId) {
    return window.abrirModalEntrega(pedidoId);
}

async function entregarCreditoVendedor(pedidoId) {
    return window.abrirModalEntrega(pedidoId);
}

async function agregarGastoVendedor() {
    const datos = await mostrarInputModal({
        titulo: 'Registrar Gasto',
        campos: [
            { key: 'concepto', label: 'Concepto', tipo: 'text', placeholder: 'Ej: Combustible, Almuerzo', requerido: true },
            { key: 'monto', label: 'Monto (Gs.)', tipo: 'number', placeholder: '0', requerido: true }
        ],
        textoConfirmar: 'Registrar'
    });
    if (!datos) return;
    if (datos.monto <= 0) { mostrarToast('Monto invalido', 'error'); return; }

    const gasto = {
        id: 'G' + Date.now(),
        concepto: datos.concepto,
        monto: datos.monto,
        vendedor_id: window.hdvUsuario?.id || null,
        fecha: new Date().toISOString()
    };

    const gastos = (await HDVStorage.getItem('hdv_gastos')) || [];
    gastos.push(gasto);
    await HDVStorage.setItem('hdv_gastos', gastos);

    if (typeof guardarGastos === 'function') {
        guardarGastos(gastos).catch(e => console.error(e));
    }

    mostrarExito('Gasto registrado');
    mostrarMiCaja();
}

async function eliminarGastoVendedor(gastoId) {
    if (!await mostrarConfirmModal('¿Eliminar este gasto?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    let gastos = (await HDVStorage.getItem('hdv_gastos')) || [];
    gastos = gastos.filter(g => g.id !== gastoId);
    await HDVStorage.setItem('hdv_gastos', gastos);
    if (typeof guardarGastos === 'function') guardarGastos(gastos).catch(e => console.error(e));
    mostrarMiCaja();
}

async function cerrarSemanaVendedor(semana) {
    const rendiciones = (await HDVStorage.getItem('hdv_rendiciones')) || [];
    const vendedorId = window.hdvUsuario?.id || null;
    if (rendiciones.find(r => r.semana === semana && r.vendedor_id === vendedorId)) {
        mostrarToast('Esta semana ya fue cerrada', 'warning');
        return;
    }

    const { inicio, fin } = obtenerRangoSemanaVendedor(semana);
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const gastos = (await HDVStorage.getItem('hdv_gastos', { clone: false })) || [];
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];

    const pedidosSemana = pedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= inicio && f <= fin && p.vendedor_id === vendedorId;
    });
    // Caja real de la semana = libro de cobros unificado (contado + créditos)
    const totalCobros = allPagos
        .filter(pg => {
            if (pg.vendedor_id && pg.vendedor_id !== vendedorId) return false;
            const f = new Date(pg.fecha);
            return f >= inicio && f <= fin;
        })
        .reduce((s, pg) => s + (Number(pg.monto) || 0), 0);
    const gastosSemana = gastos.filter(g => {
        const f = new Date(g.fecha);
        return f >= inicio && f <= fin && g.vendedor_id === vendedorId;
    });
    const totalGastos = gastosSemana.reduce((s, g) => s + (g.monto || 0), 0);

    const aRendir = totalCobros - totalGastos;

    if (!await mostrarConfirmModal(`Cerrar rendicion de la semana?\n\nCobrado: ${formatearGuaranies(totalCobros)}\nGastos: ${formatearGuaranies(totalGastos)}\n\nA RENDIR: ${formatearGuaranies(aRendir)}`, { textoConfirmar: 'Cerrar Semana' })) return;

    const rendicion = {
        id: 'REND' + Date.now(),
        semana,
        vendedor_id: vendedorId,
        fecha: new Date().toISOString(),
        cobros: totalCobros,
        gastos: totalGastos,
        aRendir,
        estado: 'pendiente',
        pedidos: pedidosSemana.length
    };

    rendiciones.push(rendicion);
    await HDVStorage.setItem('hdv_rendiciones', rendiciones);

    if (typeof guardarRendiciones === 'function') {
        guardarRendiciones(rendiciones).catch(e => console.error(e));
    }

    mostrarExito('Semana cerrada — pendiente aprobacion');
    mostrarMiCaja();
}

// ============================================
// WIDGET DE META / PROGRESO (VENDEDOR)
// ============================================

async function generarWidgetMeta() {
    const metas = (await HDVStorage.getItem('hdv_metas', { clone: false })) || [];
    const mesActual = new Date().toISOString().slice(0, 7);
    const metaActiva = metas.find(m => m.mes === mesActual && m.activa) || metas.find(m => m.activa);

    if (!metaActiva) return '';

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedidosMes = pedidos.filter(p => p.fecha && p.fecha.startsWith(mesActual));
    const totalVendido = pedidosMes.reduce((s, p) => s + (p.total || 0), 0);

    const objetivo = metaActiva.monto || 0;
    const comisionPct = metaActiva.comision || 0;
    const porcentaje = objetivo > 0 ? Math.min(100, Math.round((totalVendido / objetivo) * 100)) : 0;
    const comisionEstimada = Math.round(totalVendido * (comisionPct / 100));

    const barColor = porcentaje < 50 ? 'bg-red-500' : porcentaje < 80 ? 'bg-yellow-500' : 'bg-green-500';
    const iconName = porcentaje >= 100 ? 'trophy' : porcentaje >= 80 ? 'flame' : porcentaje >= 50 ? 'trending-up' : 'bar-chart-2';

    return `
    <div class="bg-gradient-to-r ${porcentaje >= 80 ? 'from-green-50 to-emerald-50 border-green-200' : porcentaje >= 50 ? 'from-yellow-50 to-amber-50 border-yellow-200' : 'from-red-50 to-orange-50 border-red-200'} rounded-xl p-4 shadow-sm border mb-3">
        <div class="flex justify-between items-center mb-2">
            <p class="text-xs font-bold text-gray-600 flex items-center gap-1"><i data-lucide="${iconName}" class="w-4 h-4"></i> META DEL MES</p>
            <p class="text-lg font-bold ${porcentaje >= 80 ? 'text-green-700' : porcentaje >= 50 ? 'text-yellow-700' : 'text-red-700'}">${porcentaje}%</p>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-4 mb-2 overflow-hidden">
            <div class="h-4 rounded-full ${barColor} transition-all duration-700 flex items-center justify-center text-white text-[10px] font-bold" style="width: ${porcentaje}%">${porcentaje > 15 ? porcentaje + '%' : ''}</div>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center mt-2">
            <div>
                <p class="text-xs text-gray-500">Vendido</p>
                <p class="text-sm font-bold text-gray-800">Gs. ${(totalVendido / 1000000).toFixed(1)}M</p>
            </div>
            <div>
                <p class="text-xs text-gray-500">Meta</p>
                <p class="text-sm font-bold text-gray-800">Gs. ${(objetivo / 1000000).toFixed(1)}M</p>
            </div>
            <div>
                <p class="text-xs text-gray-500">Comision</p>
                <p class="text-sm font-bold text-purple-700">${formatearGuaranies(comisionEstimada)}</p>
            </div>
        </div>
    </div>`;
}

// ============================================
// DATOS LIMPIEZA
// ============================================
async function limpiarTodosDatos() {
    if (!await mostrarConfirmModal('¿BORRAR TODOS los pedidos? Esta accion no se puede deshacer.', { destructivo: true, textoConfirmar: 'Eliminar Todo' })) return;
    if (!await mostrarConfirmModal('¿Estas completamente seguro?', { destructivo: true, textoConfirmar: 'Si, eliminar' })) return;
    await HDVStorage.removeItem('hdv_pedidos');
    const carritoKeys = await HDVStorage.keys('hdv_carrito_');
    for (const key of carritoKeys) await HDVStorage.removeItem(key);
    carrito = [];
    actualizarContadorCarrito();
    mostrarExito('Datos eliminados');
    mostrarConfiguracion();
}

// ============================================
// SERVICE WORKER
// ============================================
function forzarActualizacion() {
    if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
    }
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => r.unregister());
        });
    }
    setTimeout(() => location.reload(true), TIEMPOS.NAV_DELAY_MS);
}

function registrarSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => {
                console.log('[SW] Registrado');
                setInterval(() => { try { reg.update(); } catch(e) {} }, TIEMPOS.HEALTH_CHECK_INTERVAL_MS);
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', () => {
                        try {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                newWorker.postMessage('skipWaiting');
                                mostrarExito('Actualizando app...');
                                setTimeout(() => location.reload(true), TIEMPOS.PAGE_RELOAD_MS);
                            }
                        } catch(e) { console.log('[SW] statechange error ignorado'); }
                    });
                });
                // Suscribir push notifications tras registrar el SW
                setTimeout(() => suscribirPushNotifications(reg), 3000);
            })
            .catch(err => console.log('[SW] Error:', err));
        try {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log('[SW] Nuevo service worker activo');
            });
        } catch(e) {}
        // Escuchar clicks en notificaciones push para navegar a la vista pedidos
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data?.type === 'PUSH_CLICK' && event.data.data?.pedido_id) {
                cambiarVistaVendedor && cambiarVistaVendedor('pedidos');
            }
        });
    }
}

async function suscribirPushNotifications(reg) {
    try {
        if (!('PushManager' in window) || !('Notification' in window)) return;
        if (!window.hdvUsuario?.id) return;
        // Solo pedir permiso si no fue denegado anteriormente
        if (Notification.permission === 'denied') return;

        const existingSub = await reg.pushManager.getSubscription();
        if (existingSub) {
            // Ya suscripto — solo asegurar que está guardado en DB
            await _guardarSuscripcionDB(existingSub);
            return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        await _guardarSuscripcionDB(sub);
        console.log('[Push] Suscripción activada');
    } catch (err) {
        console.warn('[Push] No se pudo suscribir:', err.message);
    }
}

async function _guardarSuscripcionDB(sub) {
    const keys = sub.toJSON().keys || {};
    await SupabaseService.upsertPushSubscription({
        user_id: window.hdvUsuario.id,
        endpoint: sub.endpoint,
        p256dh: keys.p256dh || '',
        auth_key: keys.auth || ''
    });
}

function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Filtrar pedidos (alias for admin compatibility)
function filtrarPedidos() {
    aplicarFiltrosPedidos && aplicarFiltrosPedidos();
}

// ============================================
// SISTEMA DE BACKUP - VENDEDOR
// ============================================

// V2-M01: Sanitizar datos sensibles antes de exportar
function sanitizarDatosBackup(pedidos) {
    return pedidos.map(p => {
        const copia = JSON.parse(JSON.stringify(p));
        // Eliminar campos sensibles del cliente
        if (copia.cliente) {
            delete copia.cliente.precios_personalizados;
            if (copia.cliente.ruc && copia.cliente.ruc.length > 4) {
                copia.cliente.ruc = copia.cliente.ruc.slice(0, -4) + '****';
            }
        }
        // Eliminar costo de items
        if (copia.items) {
            copia.items.forEach(item => { delete item.costo; });
        }
        // Eliminar flags internos de seguridad
        delete copia.alerta_fraude;
        delete copia.fraude_detalle;
        delete copia.fraude_fecha;
        return copia;
    });
}

async function exportarBackupVendedor() {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const carritos = {};
    const carritoKeys = await HDVStorage.keys('hdv_carrito_');
    for (const key of carritoKeys) {
        carritos[key] = await HDVStorage.getItem(key);
    }

    const pedidosSanitizados = sanitizarDatosBackup(pedidos);

    const backup = {
        tipo: 'backup_vendedor_completo',
        fecha: new Date().toISOString(),
        version: '3.1',
        dispositivo: navigator.userAgent.substring(0, 50),
        datos: {
            pedidos: pedidosSanitizados,
            carritos,
            configuracion: {
                darkmode: await HDVStorage.getItem('hdv_darkmode'),
                autoBackup: (await HDVStorage.getItem('hdv_auto_backup')) !== 'false'
            }
        },
        resumen: {
            totalPedidos: pedidos.length,
            pedidosPendientes: pedidos.filter(p => p.estado === PEDIDO_ESTADOS.PENDIENTE || p.estado === 'pendiente').length,
            totalGuaranies: pedidos.reduce((s, p) => s + (p.total || 0), 0)
        }
    };

    descargarArchivoJSON(backup, `hdv_backup_completo_${formatearFechaArchivo()}.json`);
    await HDVStorage.setItem('hdv_ultimo_backup_fecha', new Date().toISOString());
    actualizarInfoBackup();
    mostrarExito('Backup descargado');
}

async function exportarSoloPedidos() {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    if (pedidos.length === 0) { mostrarToast('No hay pedidos para exportar', 'error'); return; }

    const backup = {
        tipo: 'backup_pedidos',
        fecha: new Date().toISOString(),
        version: '3.1',
        pedidos: sanitizarDatosBackup(pedidos)
    };

    descargarArchivoJSON(backup, `hdv_pedidos_${formatearFechaArchivo()}.json`);
    mostrarExito('Pedidos descargados');
}

async function compartirBackupWhatsApp() {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const hoy = new Date().toLocaleDateString('es-PY');
    const pedidosHoy = pedidos.filter(p => new Date(p.fecha).toLocaleDateString('es-PY') === hoy);

    let mensaje = `*HDV Pedidos - Resumen ${hoy}*\n\n`;
    mensaje += `Total pedidos hoy: ${pedidosHoy.length}\n`;
    mensaje += `Total general: ${formatearGuaranies(pedidosHoy.reduce((s, p) => s + (p.total || 0), 0))}\n\n`;

    if (pedidosHoy.length > 0) {
        pedidosHoy.forEach((p, i) => {
            mensaje += `${i + 1}. ${p.cliente?.nombre || 'N/A'}\n`;
            mensaje += `   ${p.items.map(it => `${it.nombre} x${it.cantidad}`).join(', ')}\n`;
            mensaje += `   Total: ${formatearGuaranies(p.total)} (${p.tipoPago || 'contado'})\n\n`;
        });
    } else {
        mensaje += 'Sin pedidos registrados hoy.\n';
    }

    mensaje += `\n_Total pedidos en sistema: ${pedidos.length}_`;

    const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
    mostrarExito('Abriendo WhatsApp...');
}

async function restaurarBackupVendedor(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!await mostrarConfirmModal('¿Restaurar datos desde este backup? Los datos actuales seran reemplazados.', { destructivo: true, textoConfirmar: 'Restaurar' })) {
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);

            if (data.tipo === 'backup_vendedor_completo' && data.datos) {
                if (data.datos.pedidos) {
                    await HDVStorage.setItem('hdv_pedidos', data.datos.pedidos);
                }
                if (data.datos.carritos) {
                    for (const [key, val] of Object.entries(data.datos.carritos)) {
                        await HDVStorage.setItem(key, val);
                    }
                }
                mostrarExito(`Backup restaurado: ${data.datos.pedidos?.length || 0} pedidos`);
            } else if (data.tipo === 'backup_pedidos' && data.pedidos) {
                await HDVStorage.setItem('hdv_pedidos', data.pedidos);
                mostrarExito(`${data.pedidos.length} pedidos restaurados`);
            } else if (data.datos?.pedidos) {
                await HDVStorage.setItem('hdv_pedidos', data.datos.pedidos);
                mostrarExito('Backup admin restaurado');
            } else {
                mostrarToast('Formato de backup no reconocido', 'error');
                event.target.value = '';
                return;
            }

            cerrarModalBackup();
            if (vistaActual === 'pedidos') mostrarMisPedidos();
        } catch (err) {
            mostrarToast('Error: El archivo no es valido', 'error');
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// ============================================
// AUTO-BACKUP
// ============================================
async function iniciarAutoBackup() {
    const enabled = (await HDVStorage.getItem('hdv_auto_backup')) !== 'false';
    const toggle = document.getElementById('autoBackupToggle');
    if (toggle) toggle.checked = enabled;

    if (enabled) {
        autoBackupInterval = setInterval(realizarAutoBackup, TIEMPOS.BACKOFF_MAX_MS);
        const ultimo = await HDVStorage.getItem('hdv_auto_backup_ultimo');
        if (!ultimo || (Date.now() - new Date(ultimo).getTime() > TIEMPOS.BACKOFF_MAX_MS)) {
            setTimeout(realizarAutoBackup, TIEMPOS.SYNC_INIT_DELAY_MS);
        }
    }
}

async function toggleAutoBackup() {
    const toggle = document.getElementById('autoBackupToggle');
    const enabled = toggle?.checked ?? true;
    await HDVStorage.setItem('hdv_auto_backup', enabled ? 'true' : 'false');

    if (enabled) {
        if (autoBackupInterval) clearInterval(autoBackupInterval);
        iniciarAutoBackup();
        mostrarExito('Auto-backup activado');
    } else {
        if (autoBackupInterval) clearInterval(autoBackupInterval);
        mostrarExito('Auto-backup desactivado');
    }
}

async function realizarAutoBackup() {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    if (pedidos.length === 0) return;

    const backup = {
        fecha: new Date().toISOString(),
        pedidos,
        totalPedidos: pedidos.length
    };

    let backups = (await HDVStorage.getItem('hdv_auto_backups')) || [];
    backups.unshift(backup);
    if (backups.length > 10) backups = backups.slice(0, 10);

    try {
        await HDVStorage.setItem('hdv_auto_backups', backups);
        await HDVStorage.setItem('hdv_auto_backup_ultimo', new Date().toISOString());

        const meta = backups.map(b => ({ fecha: b.fecha, totalPedidos: b.totalPedidos }));
        await HDVStorage.setItem('hdv_auto_backups_meta', meta);
    } catch (e) {
        console.warn('Auto-backup: espacio insuficiente, reduciendo historial');
        backups = backups.slice(0, 3);
        await HDVStorage.setItem('hdv_auto_backups', backups);
    }
}

async function restaurarAutoBackup(idx) {
    if (!await mostrarConfirmModal('¿Restaurar este auto-backup? Los pedidos actuales seran reemplazados.', { destructivo: true, textoConfirmar: 'Restaurar' })) return;

    const backups = (await HDVStorage.getItem('hdv_auto_backups')) || [];
    if (backups[idx] && backups[idx].pedidos) {
        await HDVStorage.setItem('hdv_pedidos', backups[idx].pedidos);
        mostrarExito(`Restaurado: ${backups[idx].pedidos.length} pedidos`);
        cerrarModalBackup();
        if (vistaActual === 'pedidos') mostrarMisPedidos();
    } else {
        mostrarToast('Error al restaurar este backup', 'error');
    }
}

// ============================================
// UTILIDADES BACKUP
// ============================================
function descargarArchivoJSON(data, nombre) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nombre;
    link.click();
    URL.revokeObjectURL(link.href);
}

// ============================================
// IMPRESION Y COMPARTIR POR PEDIDO
// ============================================
async function imprimirTicketVendedor(pedidoId) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const ticketHTML = generarTicketHTML(pedido);
    imprimirViaIframe('printFrameVendedor', ticketHTML);
}

async function generarPDFVendedor(pedidoId) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    if (generarPDFPedido(pedido)) mostrarExito('PDF generado');
}

// --- WhatsApp helpers ---

function _formatearTelefonoWA(tel) {
    if (!tel) return '';
    const limpio = tel.replace(/\D/g, '').replace(/^0/, '');
    if (limpio.length < 7) return '';
    return '595' + limpio;
}

// Genera el texto de mensaje WhatsApp segun el tipo de template.
// datos para 'pedido_confirmado'/'detalle_completo': objeto pedido
// datos para 'recibo_cobro': { pedidoId, monto, metodo, fecha, saldoRestante }
// datos para 'resumen_dia': { vendedor, fecha, pedidos, ventas, cobros, gastos, metaPct, aRendir }
function _templateWA(tipo, datos) {
    const empresa = 'HDV Distribuciones';
    const fecha = new Date(datos.fecha || Date.now()).toLocaleDateString('es-PY');
    const SEP = '─'.repeat(22);

    if (tipo === 'pedido_confirmado') {
        const items = (datos.items || []).map(i =>
            `• ${i.nombre} (${i.presentacion}) ×${i.cantidad} — ${formatearGuaranies(i.subtotal)}`
        ).join('\n');
        const notas = datos.notas ? `\n📝 Notas: ${datos.notas}` : '';
        return `🏪 *${empresa}*\n📋 Pedido N° ${datos.id} registrado ✅\n👤 ${datos.cliente?.nombre || ''}\n\n📦 *Detalle:*\n${items}\n\n💰 *Total: ${formatearGuaranies(datos.total)}*\n💳 Pago: ${datos.tipoPago || 'contado'}${notas}\n— ${empresa}`;
    }

    if (tipo === 'detalle_completo') {
        const items = (datos.items || []).map(i =>
            `• ${i.nombre} ×${i.cantidad} = ${formatearGuaranies(i.subtotal)}`
        ).join('\n');
        return `📋 *Pedido ${datos.id}*\n👤 ${datos.cliente?.nombre || ''}\n📅 ${fecha}\n\n${items}\n\n💰 *Total: ${formatearGuaranies(datos.total)}*`;
    }

    if (tipo === 'recibo_cobro') {
        const saldoLinea = (datos.saldoRestante > 0)
            ? `⏳ Saldo restante: ${formatearGuaranies(datos.saldoRestante)}`
            : `✅ Saldo cancelado`;
        return `✅ *Pago confirmado — ${empresa}*\n📋 Pedido: ${datos.pedidoId}\n💰 Cobrado: ${formatearGuaranies(datos.monto)}\n💳 Forma: ${datos.metodo || 'efectivo'}\n📅 ${fecha}\n${saldoLinea}`;
    }

    if (tipo === 'resumen_dia') {
        const icon = datos.metaPct >= 100 ? '🟢' : datos.metaPct >= 80 ? '🟡' : '🔴';
        return `📊 *Cierre de jornada — ${datos.vendedor}*\n📅 ${fecha}\n${SEP}\n📦 Pedidos: ${datos.pedidos}\n💰 Vendido: ${formatearGuaranies(datos.ventas)}\n💵 Cobrado: ${formatearGuaranies(datos.cobros)}\n📉 Gastos: ${formatearGuaranies(datos.gastos)}\n${SEP}\n${icon} Meta: ${datos.metaPct}%\n✅ A rendir: ${formatearGuaranies(datos.aRendir)}`;
    }

    return '';
}

async function enviarPedidoWhatsApp(pedidoId, tipo) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    const msg = _templateWA(tipo || 'pedido_confirmado', pedido);
    if (!msg) return;

    const tel = _formatearTelefonoWA(pedido.cliente?.telefono);
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    mostrarExito('Abriendo WhatsApp...');
}

function enviarCierreWhatsApp(datos) {
    const msg = _templateWA('resumen_dia', { ...datos, fecha: new Date().toISOString() });
    if (!msg) return;
    // Número del jefe desde configuracion empresa (si está disponible) o sin número
    const telJefe = _formatearTelefonoWA(window._empresaConfig?.telefono_empresa || '');
    window.open(`https://wa.me/${telJefe}?text=${encodeURIComponent(msg)}`, '_blank');
    mostrarExito('Enviando cierre al jefe...');
}

// ============================================
// HISTORIAL — REPETIR PEDIDO
// ============================================
async function repetirUltimoPedido(pedidoId) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido || !pedido.items?.length) return;

    const confirmar = await mostrarConfirmModal(
        `¿Agregar los ${pedido.items.length} producto(s) del pedido ${pedido.id} al carrito?`,
        { confirmLabel: 'Sí, agregar', cancelLabel: 'Cancelar' }
    );
    if (!confirmar) return;

    let agregados = 0;
    const noEncontrados = [];

    pedido.items.forEach(item => {
        const prod = productos.find(p => p.id === item.productoId);
        if (!prod) { noEncontrados.push(item.nombre); return; }
        const pres = (prod.presentaciones || []).find(p => p.tamano === item.presentacion);
        if (!pres) { noEncontrados.push(item.nombre); return; }

        const precio = obtenerPrecio(item.productoId, pres);
        const existente = carrito.findIndex(c => c.productoId === item.productoId && c.presentacion === item.presentacion);
        if (existente >= 0) {
            carrito[existente].cantidad += item.cantidad;
            carrito[existente].subtotal = carrito[existente].cantidad * carrito[existente].precio;
        } else {
            carrito.push({
                productoId: item.productoId,
                nombre: prod.nombre,
                presentacion: item.presentacion,
                precio,
                cantidad: item.cantidad,
                subtotal: precio * item.cantidad,
                precioEspecial: precio !== pres.precio_base,
                tipo_impuesto: prod.tipo_impuesto || '10'
            });
        }
        agregados++;
    });

    actualizarContadorCarrito();
    guardarCarrito();

    cerrarHistorialCliente();
    setTimeout(() => mostrarModalCarrito(), 350);

    if (noEncontrados.length > 0) {
        mostrarToast(`${agregados} productos agregados. No encontrados: ${noEncontrados.join(', ')}`, 'warning');
    } else {
        mostrarExito(`${agregados} productos agregados al carrito`);
    }
}
