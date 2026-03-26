// ============================================
// HDV Pedidos - App Vendedor v3.0 (Controlador)
// Entry point: inicializacion, eventos, navegacion.
// UI en js/vendedor/ui.js, carrito en js/vendedor/cart.js
// Estado global en js/core/state.js, utils en js/utils/
// ============================================

// --- Estado local del controlador ---
// TODO: Refactor Phase 1 - Estado global movido a js/core/state.js
// let productos = [];
// let categorias = [];
// let clientes = [];
// let clienteActual = null;
// let carrito = [];
let categoriaActual = 'todas';
let vistaCatalogo = 'categorias'; // 'categorias' o 'productos'
let categoriaSeleccionada = null; // categoria clickeada en el grid
let vistaActual = 'lista'; // 'lista', 'pedidos' o 'config'
let autoBackupInterval = null;

// Flag global: suprime toasts info/success durante carga inicial
window._hdvAppReady = false;

// ============================================
// INICIALIZACION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await cargarDatos();
    configurarEventos();
    cargarCarritoGuardado();
    registrarSW();
    iniciarAutoBackup();
    actualizarInfoBackup();

    // Marcar app lista — los toasts info/success se desbloquean despues de la carga inicial
    setTimeout(() => { window._hdvAppReady = true; }, 2000);

    // Alerta al cerrar/recargar si hay pedidos sin sincronizar
    window.addEventListener('beforeunload', async (e) => {
        try {
            const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
            const sinSync = pedidos.filter(p => p.sincronizado === false);
            if (sinSync.length > 0) {
                e.preventDefault();
                // Navegadores modernos ignoran el mensaje custom pero requieren returnValue
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
            }
        });
    }

    // Canal 2: Pedidos — actualizaciones granulares de estado
    if (typeof escucharPedidosRealtimeVendedor === 'function') {
        escucharPedidosRealtimeVendedor({
            onEstadoCambiado: (pedidoId, nuevoEstado, datos) => {
                console.log(`[Vendedor RT] Pedido ${pedidoId} -> ${nuevoEstado}`);
                // Actualizar tarjeta en el DOM si la vista de pedidos esta activa
                if (vistaActual === 'pedidos' && typeof actualizarTarjetaPedidoDOM === 'function') {
                    const updated = actualizarTarjetaPedidoDOM(pedidoId, nuevoEstado);
                    if (updated) {
                        mostrarToast(`Pedido actualizado: ${nuevoEstado === 'entregado' ? 'Entregado' : nuevoEstado === 'anulado' ? 'Anulado' : nuevoEstado}`, 'info');
                    }
                }
                // Actualizar widget de caja si esta visible
                if (vistaActual === 'caja' && typeof mostrarMiCaja === 'function') {
                    mostrarMiCaja();
                }
            },
            onPedidoEliminado: (pedidoId) => {
                console.log(`[Vendedor RT] Pedido eliminado: ${pedidoId}`);
                if (vistaActual === 'pedidos' && typeof eliminarTarjetaPedidoDOM === 'function') {
                    eliminarTarjetaPedidoDOM(pedidoId);
                    mostrarToast('Un pedido fue eliminado por el administrador', 'warning');
                }
            },
            onSync: (pedidosMerged) => {
                console.log(`[Vendedor RT] Sync completa: ${pedidosMerged.length} pedidos`);
                // Re-renderizar vista completa solo si estamos en pedidos
                if (vistaActual === 'pedidos' && typeof mostrarMisPedidos === 'function') {
                    mostrarMisPedidos();
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
                    const pedidosLocal = (await HDVStorage.getItem('hdv_pedidos')) || [];
                    const sinSync = pedidosLocal.filter(p => p.sincronizado === false);
                    const remIds = new Set(pedidosRemoto.map(p => p.id));
                    const localesExtra = sinSync.filter(p => !remIds.has(p.id));
                    const merged = [...pedidosRemoto, ...localesExtra];
                    await HDVStorage.setItem('hdv_pedidos', merged);
                    if (vistaActual === 'pedidos' && typeof mostrarMisPedidos === 'function') {
                        mostrarMisPedidos();
                    }
                    console.log('[Vendedor RT] Pedidos re-sincronizados:', merged.length);
                }
            }
        } catch(e) {
            console.warn('[Vendedor RT] Error re-sync online:', e);
        }
    });
});

async function cargarDatos() {
    await HDVStorage.ready();
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

    // Busqueda de clientes por nombre o RUC
    const clienteSearch = document.getElementById('clienteSearchInput');
    if (clienteSearch) {
        const poblarClientesDebounced = debounce(() => poblarClientes(clienteSearch.value), 300);
        clienteSearch.addEventListener('input', poblarClientesDebounced);
    }

    document.getElementById('clienteSelect').addEventListener('change', async (e) => {
        const id = e.target.value;
        if (id) {
            const nuevoCliente = clientes.find(c => c.id === id);
            if (clienteActual && clienteActual.id !== id && carrito.length > 0) {
                const ok = await mostrarConfirmModal('Cambiar de cliente vaciara el carrito actual. ¿Continuar?', { destructivo: true });
                if (!ok) {
                    e.target.value = clienteActual.id;
                    return;
                }
                carrito = [];
                actualizarContadorCarrito();
                guardarCarrito();
            }
            clienteActual = nuevoCliente;
            mostrarInfoCliente(clienteActual);
            mostrarProductos();
        } else {
            clienteActual = null;
            mostrarInfoCliente(null);
        }
    });
}

// ============================================
// DESGLOSE IVA (Paraguay — precios con IVA incluido)
// ============================================
// TODO: Refactor Phase 1 - Movido a js/utils/formatters.js
// function calcularDesgloseIVA(items) { ... }

// ============================================
// NAVEGACION DE VISTAS
// ============================================
function cambiarVistaVendedor(vista) {
    vistaActual = vista;

    const btnLista = document.getElementById('btn-tab-lista');
    const btnPedidos = document.getElementById('btn-tab-pedidos');
    const btnCaja = document.getElementById('btn-tab-caja');
    const container = document.getElementById('productsContainer');
    const catFilters = document.getElementById('categoryFilters');
    const searchBox = document.getElementById('searchContainer');

    const btnZonas = document.getElementById('btn-tab-zonas');

    // Reset all tabs
    [btnLista, btnPedidos, btnCaja, btnZonas].forEach(btn => {
        if (btn) btn.className = 'flex flex-col items-center gap-1 text-gray-400 transition-colors';
    });

    if (vista === 'lista') {
        btnLista.className = 'flex flex-col items-center gap-1 text-gray-900 transition-colors';
        searchBox.style.display = '';
        catFilters.style.display = '';
        // Resetear a vista de categorias
        vistaCatalogo = 'categorias';
        categoriaSeleccionada = null;
        categoriaActual = 'todas';
        document.getElementById('searchInput').value = '';
        mostrarProductos();
    } else if (vista === 'pedidos') {
        btnPedidos.className = 'flex flex-col items-center gap-1 text-gray-900 transition-colors';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        mostrarMisPedidos();
    } else if (vista === 'caja') {
        if (btnCaja) btnCaja.className = 'flex flex-col items-center gap-1 text-gray-900 transition-colors';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        mostrarMiCaja();
    } else if (vista === 'zonas') {
        if (btnZonas) btnZonas.className = 'flex flex-col items-center gap-1 text-gray-900 transition-colors';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        if (zonaActiva) mostrarRutaHoy();
        else mostrarFiltroZonas();
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
    filtrarClientesPorZona(zona);
    mostrarRutaHoy();
}

function filtrarClientesPorZona(zona) {
    const select = document.getElementById('clienteSelect');
    if (!select) return;

    zonaActiva = zona;
    const options = select.querySelectorAll('option');
    options.forEach(opt => {
        if (opt.value === '') {
            opt.style.display = '';
        } else {
            const cliente = clientes.find(c => c.id == opt.value);
            opt.style.display = (cliente && cliente.zona && cliente.zona.trim() === zona) ? '' : 'none';
        }
    });

    actualizarIndicadorZona(zona);
}

function resetearFiltroZona() {
    zonaActiva = null;
    const select = document.getElementById('clienteSelect');
    if (select) {
        select.querySelectorAll('option').forEach(opt => opt.style.display = '');
    }
    actualizarIndicadorZona(null);
    cambiarVistaVendedor('lista');
}

function seleccionarClienteDesdeRuta(clienteId) {
    const select = document.getElementById('clienteSelect');
    if (select) {
        select.value = clienteId;
        select.dispatchEvent(new Event('change'));
    }
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
    const { inicio, fin } = obtenerRangoSemanaVendedor(semana);
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const gastos = (await HDVStorage.getItem('hdv_gastos')) || [];

    const pedidosSemana = pedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= inicio && f <= fin;
    });
    const totalContado = pedidosSemana
        .filter(p => p.tipoPago === 'contado' && (p.estado === 'entregado' || p.estado === 'pedido_pendiente' || p.estado === 'pendiente'))
        .reduce((s, p) => s + (p.total || 0), 0);
    const totalGastos = gastos.filter(g => {
        const f = new Date(g.fecha);
        return f >= inicio && f <= fin;
    }).reduce((s, g) => s + (g.monto || 0), 0);

    const aRendir = totalContado - totalGastos;

    if (!await mostrarConfirmModal(`Cerrar rendicion de la semana?\n\nContado cobrado: ${formatearGuaranies(totalContado)}\nGastos: ${formatearGuaranies(totalGastos)}\n\nA RENDIR: ${formatearGuaranies(aRendir)}`, { textoConfirmar: 'Cerrar Semana' })) return;

    const rendicion = {
        id: 'REND' + Date.now(),
        semana,
        fecha: new Date().toISOString(),
        contado: totalContado,
        gastos: totalGastos,
        aRendir,
        estado: 'rendido',
        pedidos: pedidosSemana.length
    };

    const rendiciones = (await HDVStorage.getItem('hdv_rendiciones')) || [];
    rendiciones.push(rendicion);
    await HDVStorage.setItem('hdv_rendiciones', rendiciones);

    if (typeof guardarRendiciones === 'function') {
        guardarRendiciones(rendiciones).catch(e => console.error(e));
    }

    mostrarExito('Semana cerrada exitosamente');
    mostrarMiCaja();
}

// ============================================
// WIDGET DE META / PROGRESO (VENDEDOR)
// ============================================

async function generarWidgetMeta() {
    const metas = (await HDVStorage.getItem('hdv_metas')) || [];
    const mesActual = new Date().toISOString().slice(0, 7);
    const metaActiva = metas.find(m => m.mes === mesActual && m.activa) || metas.find(m => m.activa);

    if (!metaActiva) return '';

    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
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
    setTimeout(() => location.reload(true), 500);
}

function registrarSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => {
                console.log('[SW] Registrado');
                setInterval(() => { try { reg.update(); } catch(e) {} }, 30000);
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', () => {
                        try {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                newWorker.postMessage('skipWaiting');
                                mostrarExito('Actualizando app...');
                                setTimeout(() => location.reload(true), 1500);
                            }
                        } catch(e) { console.log('[SW] statechange error ignorado'); }
                    });
                });
            })
            .catch(err => console.log('[SW] Error:', err));
        try {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log('[SW] Nuevo service worker activo');
            });
        } catch(e) {}
    }
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
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
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
            pedidosPendientes: pedidos.filter(p => p.estado === 'pedido_pendiente' || p.estado === 'pendiente').length,
            totalGuaranies: pedidos.reduce((s, p) => s + (p.total || 0), 0)
        }
    };

    descargarArchivoJSON(backup, `hdv_backup_completo_${formatearFechaArchivo()}.json`);
    await HDVStorage.setItem('hdv_ultimo_backup_fecha', new Date().toISOString());
    actualizarInfoBackup();
    mostrarExito('Backup descargado');
}

async function exportarSoloPedidos() {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
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
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
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
        autoBackupInterval = setInterval(realizarAutoBackup, 5 * 60 * 1000);
        const ultimo = await HDVStorage.getItem('hdv_auto_backup_ultimo');
        if (!ultimo || (Date.now() - new Date(ultimo).getTime() > 5 * 60 * 1000)) {
            setTimeout(realizarAutoBackup, 3000);
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
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
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

// TODO: Refactor Phase 1 - Movido a js/utils/formatters.js
// function formatearFechaArchivo() { ... }

// ============================================
// IMPRESION Y COMPARTIR POR PEDIDO
// ============================================
// TODO: Refactor Phase 1 - Usa js/utils/printer.js (generarTicketHTML + imprimirViaIframe)
async function imprimirTicketVendedor(pedidoId) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const ticketHTML = generarTicketHTML(pedido);
    imprimirViaIframe('printFrameVendedor', ticketHTML);
}

// TODO: Refactor Phase 1 - Usa js/utils/pdf-generator.js (generarPDFPedido)
async function generarPDFVendedor(pedidoId) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    if (generarPDFPedido(pedido)) mostrarExito('PDF generado');
}

async function enviarPedidoWhatsApp(pedidoId) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    let msg = `*HDV Distribuciones - Pedido*\n`;
    msg += `N°: ${pedido.id}\n`;
    msg += `Fecha: ${new Date(pedido.fecha).toLocaleDateString('es-PY')}\n`;
    msg += `Cliente: ${pedido.cliente?.nombre || 'N/A'}\n\n`;
    msg += `*Detalle:*\n`;
    (pedido.items || []).forEach(i => {
        msg += `• ${i.nombre} (${i.presentacion}) x${i.cantidad} = ${formatearGuaranies(i.subtotal)}\n`;
    });
    msg += `\n*TOTAL: ${formatearGuaranies(pedido.total)}*\n`;
    msg += `Pago: ${pedido.tipoPago || 'contado'}`;
    if (pedido.descuento > 0) msg += ` | Desc: ${pedido.descuento}%`;
    if (pedido.notas) msg += `\nNotas: ${pedido.notas}`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    mostrarExito('Abriendo WhatsApp...');
}
