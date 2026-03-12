// ============================================
// HDV Admin Panel v4.0 - Dashboard, PDF, Edicion de Pedidos
// ============================================
let todosLosPedidos = [];
let productosData = { productos: [], categorias: [], clientes: [] };
let productosDataOriginal = null;
let productosFiltrados = [];
let clientesFiltrados = [];
let cambiosSinGuardar = 0;
let stockFiltrado = [];

// ============================================
// LAZY LOAD - IntersectionObserver for catalog cards
// ============================================
function initLazyLoadCards(containerEl) {
    const cards = (containerEl || document).querySelectorAll('.catalog-card[data-bg]');
    if (!cards.length) return;

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const card = entry.target;
            const url = card.dataset.bg;
            if (!url) return;
            // Preload image then apply
            const img = new Image();
            img.onload = () => {
                card.style.backgroundImage = `url('${url}')`;
                card.classList.add('catalog-card--loaded');
            };
            img.src = url;
            obs.unobserve(card);
        });
    }, { rootMargin: '200px 0px', threshold: 0.01 });

    cards.forEach(card => {
        // Mark cards without images as loaded immediately
        if (!card.dataset.bg) { card.classList.add('catalog-card--loaded'); return; }
        observer.observe(card);
    });
}

// ============================================
// SVG EMPTY STATE ILLUSTRATIONS & SKELETONS
// ============================================
const SVG_ADMIN_EMPTY_ORDERS = `<svg viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="30" y="20" width="140" height="30" rx="8" stroke="#d1d5db" stroke-width="2" fill="#f3f4f6"/>
  <rect x="30" y="60" width="140" height="22" rx="6" stroke="#e5e7eb" stroke-width="1.5" fill="#f9fafb"/>
  <rect x="30" y="88" width="140" height="22" rx="6" stroke="#e5e7eb" stroke-width="1.5" fill="#f9fafb"/>
  <rect x="30" y="116" width="140" height="22" rx="6" stroke="#e5e7eb" stroke-width="1.5" fill="#f9fafb"/>
  <circle cx="160" cy="155" r="20" stroke="#d1d5db" stroke-width="2" fill="#f3f4f6"/>
  <path d="M153 155h14M160 148v14" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const SVG_ADMIN_EMPTY_PRODUCTS = `<svg viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="25" y="25" width="65" height="65" rx="12" stroke="#d1d5db" stroke-width="2" fill="#f3f4f6"/>
  <rect x="110" y="25" width="65" height="65" rx="12" stroke="#d1d5db" stroke-width="2" fill="#f3f4f6"/>
  <rect x="25" y="105" width="65" height="65" rx="12" stroke="#e5e7eb" stroke-width="1.5" fill="#f9fafb" stroke-dasharray="5 3"/>
  <path d="M50 130h15M57 123v14" stroke="#d1d5db" stroke-width="2" stroke-linecap="round"/>
  <rect x="35" y="45" width="20" height="3" rx="1.5" fill="#d1d5db"/><rect x="35" y="52" width="30" height="3" rx="1.5" fill="#e5e7eb"/>
  <rect x="120" y="45" width="25" height="3" rx="1.5" fill="#d1d5db"/><rect x="120" y="52" width="35" height="3" rx="1.5" fill="#e5e7eb"/>
</svg>`;

const SVG_ADMIN_EMPTY_CLIENTS = `<svg viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="60" r="28" stroke="#d1d5db" stroke-width="2.5" fill="#f3f4f6"/>
  <circle cx="100" cy="52" r="10" stroke="#d1d5db" stroke-width="2" fill="#f9fafb"/>
  <path d="M80 75c0-11 8.9-20 20-20s20 9 20 20" stroke="#d1d5db" stroke-width="2" fill="none"/>
  <path d="M60 120h80M70 135h60" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/>
  <path d="M75 150h50" stroke="#e5e7eb" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="4 3"/>
</svg>`;

function generarAdminEmptyState(svgIcon, titulo, subtitulo, botonTexto, botonOnclick) {
    return `<div class="empty-state">
        ${svgIcon}
        <p>${titulo}</p>
        ${subtitulo ? `<p class="empty-sub">${subtitulo}</p>` : ''}
        ${botonTexto ? `<button onclick="${botonOnclick}" class="empty-action">${botonTexto}</button>` : ''}
    </div>`;
}

function generarSkeletonTabla(filas = 5, columnas = 4) {
    let html = '<div class="overflow-hidden rounded-xl border border-gray-200 bg-white">';
    html += '<div class="flex gap-4 p-4 bg-gray-50 border-b border-gray-200">';
    for (let c = 0; c < columnas; c++) {
        const w = c === 0 ? 'w-1/4' : c === columnas - 1 ? 'w-16' : 'w-1/5';
        html += `<div class="skeleton h-4 ${w}"></div>`;
    }
    html += '</div>';
    for (let r = 0; r < filas; r++) {
        html += '<div class="flex gap-4 p-4 border-b border-gray-100">';
        for (let c = 0; c < columnas; c++) {
            const w = c === 0 ? 'w-1/3' : c === columnas - 1 ? 'w-16' : 'w-1/4';
            html += `<div class="skeleton h-3.5 ${w}"></div>`;
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function generarSkeletonCards(count = 6) {
    let html = '<div class="catalog-grid">';
    for (let i = 0; i < count; i++) {
        html += `<div class="rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100">
            <div class="skeleton w-full" style="aspect-ratio:1/1"></div>
        </div>`;
    }
    html += '</div>';
    return html;
}

// ============================================
// NAVEGACION
// ============================================
function cambiarSeccion(seccionId) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    const seccion = document.getElementById(`seccion-${seccionId}`);
    if (seccion) { seccion.classList.add('active'); seccion.style.display = 'block'; }
    
    const btn = document.querySelector(`button[onclick="cambiarSeccion('${seccionId}')"]`);
    if (btn) btn.classList.add('active');
    
    const titulos = {
        'dashboard': 'Dashboard', 'pedidos': 'Pedidos Entrantes', 'ventas': 'Ventas',
        'devoluciones': 'Devoluciones (NC)', 'cierre': 'Cierre Mensual',
        'creditos': 'Control de Creditos',
        'reportes': 'Analisis y Reportes', 'stock': 'Inventario',
        'productos': 'Catalogo de Productos', 'clientes': 'Base de Datos de Clientes',
        'promociones': 'Motor de Promociones',
        'rendiciones': 'Rendiciones de Caja', 'metas': 'Metas y Comisiones',
        'inactivos': 'Clientes en Riesgo', 'herramientas': 'Sistema y Herramientas'
    };
    const titleEl = document.getElementById('currentSectionTitle');
    if (titleEl) titleEl.textContent = titulos[seccionId] || 'Panel Admin';
    
    // Cargar datos al entrar
    if (seccionId === 'pedidos') {
        const listaPed = document.getElementById('listaPedidos');
        if (listaPed && todosLosPedidos.length === 0) listaPed.innerHTML = generarSkeletonTabla(5, 4);
        cargarPedidos();
    }
    if (seccionId === 'productos') { productosFiltrados = [...productosData.productos]; mostrarProductosGestion(); }
    if (seccionId === 'clientes') { clientesFiltrados = [...productosData.clientes]; mostrarClientesGestion(); }
    if (seccionId === 'creditos') cargarCreditos();
    if (seccionId === 'stock') cargarStock();
    if (seccionId === 'herramientas') actualizarInfoBackupAdmin();
    if (seccionId === 'dashboard') cargarDashboard();
    if (seccionId === 'creditos') cargarCreditos();
    if (seccionId === 'promociones') cargarPromociones();
    if (seccionId === 'rendiciones') cargarRendiciones();
    if (seccionId === 'metas') cargarMetas();
    if (seccionId === 'ventas' && typeof cargarVentas === 'function') cargarVentas();
    if (seccionId === 'devoluciones' && typeof cargarHistorialNC === 'function') cargarHistorialNC();
    if (seccionId === 'cierre' && typeof inicializarCierreMensual === 'function') inicializarCierreMensual();
    if (seccionId === 'inactivos') cargarClientesInactivos();

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================
// CAMBIOS SIN GUARDAR
// ============================================
function registrarCambio() {
    // Auto-backup en el primer cambio de la sesion
    if (cambiosSinGuardar === 0) {
        crearAutoBackupAdmin('Antes de ediciones');
    }
    cambiosSinGuardar++;
    actualizarBarraCambios();
}

function actualizarBarraCambios() {
    const bar = document.getElementById('unsavedBar');
    const badge = document.getElementById('unsavedCount');
    if (bar && badge) {
        if (cambiosSinGuardar > 0) { bar.classList.add('visible'); badge.textContent = cambiosSinGuardar; }
        else { bar.classList.remove('visible'); }
    }
}

function guardarTodosCambios() {
    cambiosSinGuardar = 0;
    actualizarBarraCambios();
    productosDataOriginal = JSON.parse(JSON.stringify(productosData));

    // PASO 1: Siempre guardar en localStorage como respaldo inmediato
    try {
        const dataLimpia = { categorias: productosData.categorias, productos: productosData.productos, clientes: productosData.clientes };
        localStorage.setItem('hdv_catalogo_local', JSON.stringify(dataLimpia));
        console.log('[Admin] Catalogo guardado en localStorage');
    } catch (e) {
        console.error('[Admin] Error guardando en localStorage:', e);
    }

    // PASO 2: Sincronizar con Firebase
    if (typeof guardarCatalogoFirebase === 'function') {
        const dataParaFirebase = { categorias: productosData.categorias, productos: productosData.productos, clientes: productosData.clientes };
        guardarCatalogoFirebase(dataParaFirebase).then(ok => {
            if (ok) {
                mostrarToast('Cambios guardados y sincronizados. Los vendedores ya ven los cambios.', 'success');
            } else {
                mostrarToast('Error al sincronizar con Firebase. Cambios guardados localmente.', 'warning');
                descargarJSON(productosData, 'productos.json');
            }
        }).catch(err => {
            console.error('[Admin] Error Firebase:', err);
            mostrarToast('Error de Firebase: ' + err.message, 'error');
            descargarJSON(productosData, 'productos.json');
        });
    } else {
        descargarJSON(productosData, 'productos.json');
        mostrarToast('Firebase no disponible. JSON descargado como respaldo.', 'warning');
    }
}

async function descartarCambios() {
    if (!await mostrarConfirmModal('¿Descartar todos los cambios? Se perderan las modificaciones.', { destructivo: true, textoConfirmar: 'Descartar' })) return;
    productosData = JSON.parse(JSON.stringify(productosDataOriginal));
    productosFiltrados = [...productosData.productos];
    clientesFiltrados = [...productosData.clientes];
    cambiosSinGuardar = 0;
    actualizarBarraCambios();
    mostrarProductosGestion();
    mostrarClientesGestion();
}

window.addEventListener('beforeunload', (e) => {
    if (cambiosSinGuardar > 0) { e.preventDefault(); e.returnValue = ''; }
});

// ============================================
// INICIALIZACION
// ============================================
let unsubscribePedidos = null; // Listener de Firebase

document.addEventListener('DOMContentLoaded', async () => {
    await cargarDatosIniciales();

    // Intentar escuchar pedidos en tiempo real desde Firebase
    if (typeof escucharPedidosRealtime === 'function') {
        unsubscribePedidos = escucharPedidosRealtime((pedidos, cambios) => {
            todosLosPedidos = pedidos;
            aplicarFiltrosPedidos();

            // Notificar pedidos nuevos
            const nuevos = cambios.filter(c => c.type === 'added');
            if (nuevos.length > 0 && todosLosPedidos.length > 0) {
                const badge = document.getElementById('currentSectionTitle');
                if (badge && badge.textContent.includes('Pedidos')) {
                    // Flash sutil para indicar actualizacion
                    badge.style.transition = 'color 0.3s';
                    badge.style.color = '#059669';
                    setTimeout(() => badge.style.color = '', 1500);
                }
            }
            console.log(`[Admin] Pedidos actualizados en tiempo real: ${pedidos.length}`);
        });
        console.log('[Admin] Escuchando pedidos en tiempo real desde Firebase');
    } else {
        // Fallback sin Firebase
        cargarPedidos();
        setInterval(cargarPedidos, 30000);
    }

    const filtroFecha = document.getElementById('filtroFecha');
    if (filtroFecha) filtroFecha.valueAsDate = new Date();

    const hoy = new Date();
    const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
    const desde = document.getElementById('reporteFechaDesde');
    const hasta = document.getElementById('reporteFechaHasta');
    if (desde) desde.valueAsDate = hace30;
    if (hasta) hasta.valueAsDate = hoy;

    cambiarSeccion('pedidos');

    // Inicializar auto-backup admin
    const autoBackupToggle = document.getElementById('adminAutoBackupToggle');
    if (autoBackupToggle) autoBackupToggle.checked = localStorage.getItem('hdv_admin_auto_backup') !== 'false';
});

async function cargarDatosIniciales() {
    try {
        let data = null;

        // PRIORIDAD 1: Firebase (datos mas frescos, sincronizados)
        if (typeof obtenerCatalogoFirebase === 'function') {
            try {
                data = await obtenerCatalogoFirebase();
                if (data && data.productos) {
                    console.log('[Admin] Catalogo cargado desde Firebase (' + data.productos.length + ' productos)');
                } else {
                    data = null;
                }
            } catch (e) { console.warn('[Admin] Firebase no disponible:', e.message); data = null; }
        }

        // PRIORIDAD 2: localStorage (cambios guardados localmente)
        if (!data || !data.productos) {
            try {
                const local = localStorage.getItem('hdv_catalogo_local');
                if (local) {
                    data = JSON.parse(local);
                    if (data && data.productos) {
                        console.log('[Admin] Catalogo cargado desde localStorage (' + data.productos.length + ' productos)');
                    } else { data = null; }
                }
            } catch (e) { data = null; }
        }

        // PRIORIDAD 3: JSON local (archivo en GitHub Pages, fallback)
        if (!data || !data.productos) {
            const response = await fetch('productos.json?t=' + Date.now());
            data = await response.json();
            console.log('[Admin] Catalogo cargado desde JSON local (' + (data.productos?.length || 0) + ' productos)');
        }

        productosData = data;
        productosDataOriginal = JSON.parse(JSON.stringify(productosData));
        productosFiltrados = [...productosData.productos];
        clientesFiltrados = [...productosData.clientes];
        
        const filterCliente = document.getElementById('filtroCliente');
        if (filterCliente) {
            productosData.clientes.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.razon_social || c.nombre || c.id;
                filterCliente.appendChild(opt);
            });
        }
    } catch (error) { console.error('Error cargando datos:', error); }
}

// ============================================
// PEDIDOS
// ============================================
function cargarPedidos() {
    todosLosPedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    aplicarFiltrosPedidos();
}

function filtrarPedidos() { aplicarFiltrosPedidos(); }

function aplicarFiltrosPedidos() {
    const fecha = document.getElementById('filtroFecha')?.value;
    const cliente = document.getElementById('filtroCliente')?.value;
    // Solo mostrar pedidos pendientes en esta seccion
    let filtrados = todosLosPedidos.filter(p => p.estado === 'pedido_pendiente' || p.estado === 'pendiente');
    if (fecha) filtrados = filtrados.filter(p => new Date(p.fecha).toISOString().split('T')[0] === fecha);
    if (cliente) filtrados = filtrados.filter(p => p.cliente?.id === cliente);
    mostrarPedidos(filtrados);
    actualizarEstadisticasPedidos(filtrados);
}

function mostrarPedidos(pedidos) {
    const container = document.getElementById('listaPedidos');
    if (!container) return;
    if (pedidos.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_ORDERS, 'No hay pedidos para mostrar', 'Los pedidos nuevos apareceran aqui automaticamente');
        return;
    }
    container.innerHTML = '';
    pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    pedidos.forEach(p => {
        const estado = p.estado || 'pendiente';
        const colorEstado = estado === 'entregado' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
        const clienteInfo = productosData.clientes.find(c => c.id === p.cliente?.id);
        const zona = clienteInfo?.zona || clienteInfo?.direccion || '';
        
        const div = document.createElement('div');
        div.className = 'p-6 hover:bg-gray-50 transition-colors';
        div.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">${p.cliente?.nombre || 'Sin cliente'}</h3>
                    <div class="text-sm text-gray-500 mt-1 flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3"></i> ${zona} <span class="mx-1">·</span> <i data-lucide="clock" class="w-3 h-3"></i> ${new Date(p.fecha).toLocaleString('es-PY')}</div>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-bold ${colorEstado}">${estado.toUpperCase()}</span>
            </div>
            <div class="mb-3 space-y-1">
                ${(p.items || []).map(i => `
                <div class="flex justify-between text-sm py-1">
                    <span>${i.nombre} <span class="text-gray-400">(${i.presentacion} × ${i.cantidad})</span></span>
                    <strong>Gs. ${(i.subtotal || 0).toLocaleString()}</strong>
                </div>`).join('')}
            </div>
            ${p.notas ? `<div class="text-sm text-gray-500 italic mb-3 flex items-start gap-1.5"><i data-lucide="message-square" class="w-3.5 h-3.5 mt-0.5 shrink-0"></i> ${p.notas}</div>` : ''}
            <div class="flex justify-between items-center pt-3 border-t border-gray-100">
                <span class="text-sm text-gray-500">${p.tipoPago || 'contado'}${p.descuento > 0 ? ` | ${p.descuento}% desc.` : ''}</span>
                <span class="text-xl font-bold text-gray-900">Gs. ${(p.total || 0).toLocaleString()}</span>
            </div>
            <div class="flex gap-2 mt-4 flex-wrap">
                <button class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 inline-flex items-center gap-1.5" id="btnFacturar-${p.id}" onclick="facturarPedidoAdmin('${p.id}')"><i data-lucide="file-check" class="w-3.5 h-3.5"></i> Facturar (SIFEN)</button>
                ${estado === 'pendiente' || estado === 'pedido_pendiente' ?
                    `<button class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 inline-flex items-center gap-1.5" onclick="marcarEntregado('${p.id}')"><i data-lucide="check" class="w-3.5 h-3.5"></i> Entregado</button>` :
                    `<button class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-300 inline-flex items-center gap-1.5" onclick="marcarPendiente('${p.id}')"><i data-lucide="undo-2" class="w-3.5 h-3.5"></i> Pendiente</button>`}
                <button class="bg-blue-50 text-blue-600 px-3 py-2 rounded-lg text-sm font-bold hover:bg-blue-100 inline-flex items-center gap-1" onclick="abrirModalEditarPedido('${p.id}')"><i data-lucide="pencil" class="w-3.5 h-3.5"></i> Editar</button>
                <button class="bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-100 inline-flex items-center gap-1" onclick="generarPDFRemision('${p.id}')"><i data-lucide="file-text" class="w-3.5 h-3.5"></i> PDF</button>
                <button class="bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-100 inline-flex items-center gap-1" onclick="generarTicketTermico('${p.id}')"><i data-lucide="printer" class="w-3.5 h-3.5"></i> Ticket</button>
                <button class="bg-red-50 text-red-500 px-3 py-2 rounded-lg text-sm font-bold hover:bg-red-100 inline-flex items-center gap-1" onclick="eliminarPedido('${p.id}')"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </div>`;
        container.appendChild(div);
    });
    lucide.createIcons();
}

function actualizarEstadisticasPedidos(pedidos) {
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('statTotalPedidos', pedidos.length);
    el('statPendientes', pedidos.filter(p => (p.estado || 'pendiente') === 'pendiente').length);
    el('statEntregados', pedidos.filter(p => p.estado === 'entregado').length);
    el('statRecaudacion', 'Gs. ' + pedidos.reduce((s, p) => s + (p.total || 0), 0).toLocaleString());
}

function marcarEntregado(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const p = pedidos.find(x => x.id === id);
    if (p) {
        p.estado = 'entregado';
        localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
        // Sincronizar con Firebase
        if (typeof actualizarEstadoPedidoFirebase === 'function') {
            actualizarEstadoPedidoFirebase(id, 'entregado');
        }
        if (!unsubscribePedidos) cargarPedidos(); // Solo recargar manual si no hay listener
    }
}

function marcarPendiente(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const p = pedidos.find(x => x.id === id);
    if (p) {
        p.estado = 'pendiente';
        localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
        if (typeof actualizarEstadoPedidoFirebase === 'function') {
            actualizarEstadoPedidoFirebase(id, 'pendiente');
        }
        if (!unsubscribePedidos) cargarPedidos();
    }
}

async function eliminarPedido(id) {
    if (!await mostrarConfirmModal('¿Eliminar este pedido?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    let pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    pedidos = pedidos.filter(p => p.id !== id);
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
    // Eliminar de Firebase
    if (typeof eliminarPedidoFirebase === 'function') {
        eliminarPedidoFirebase(id);
    }
    if (!unsubscribePedidos) cargarPedidos();
}

function exportarExcelPedidos() {
    const pedidos = todosLosPedidos;
    if (pedidos.length === 0) { mostrarToast('No hay pedidos para exportar', 'error'); return; }
    let csv = 'Fecha,Cliente,Producto,Presentacion,Cantidad,Precio,Subtotal,Total Pedido,Estado,Pago\n';
    pedidos.forEach(p => {
        (p.items || []).forEach(i => {
            csv += `"${new Date(p.fecha).toLocaleDateString('es-PY')}","${p.cliente?.nombre}","${i.nombre}","${i.presentacion}",${i.cantidad},${i.precio},${i.subtotal},${p.total},${p.estado || 'pendiente'},${p.tipoPago || 'contado'}\n`;
        });
    });
    descargarCSV(csv, 'pedidos_hdv.csv');
}

// ============================================
// CREDITOS (ver funciones completas al final)
// ============================================

// ============================================
// REPORTES
// ============================================
function generarReporte(tipo) {
    const desde = document.getElementById('reporteFechaDesde')?.value;
    const hasta = document.getElementById('reporteFechaHasta')?.value;
    if (!desde || !hasta) { mostrarToast('Selecciona rango de fechas', 'error'); return; }
    
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const filtrados = pedidos.filter(p => {
        const fecha = new Date(p.fecha).toISOString().split('T')[0];
        return fecha >= desde && fecha <= hasta;
    });
    
    const container = document.getElementById('contenidoReporte');
    if (!container) return;
    
    if (filtrados.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8 font-medium">No hay datos para el rango seleccionado</p>';
        return;
    }
    
    if (tipo === 'cliente') {
        const porCliente = {};
        filtrados.forEach(p => {
            const nombre = p.cliente?.nombre || 'Sin cliente';
            if (!porCliente[nombre]) porCliente[nombre] = { total: 0, pedidos: 0 };
            porCliente[nombre].total += p.total || 0;
            porCliente[nombre].pedidos++;
        });
        
        let html = '<table class="w-full text-sm"><thead class="bg-gray-50"><tr><th class="px-4 py-2 text-left">Cliente</th><th class="px-4 py-2 text-right">Pedidos</th><th class="px-4 py-2 text-right">Total</th></tr></thead><tbody>';
        Object.entries(porCliente).sort((a, b) => b[1].total - a[1].total).forEach(([nombre, data]) => {
            html += `<tr class="border-b"><td class="px-4 py-3 font-medium">${nombre}</td><td class="px-4 py-3 text-right">${data.pedidos}</td><td class="px-4 py-3 text-right font-bold">Gs. ${data.total.toLocaleString()}</td></tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } else {
        const porProducto = {};
        filtrados.forEach(p => {
            (p.items || []).forEach(i => {
                const key = `${i.nombre} (${i.presentacion})`;
                if (!porProducto[key]) porProducto[key] = { cantidad: 0, total: 0 };
                porProducto[key].cantidad += i.cantidad;
                porProducto[key].total += i.subtotal || 0;
            });
        });
        
        let html = '<table class="w-full text-sm"><thead class="bg-gray-50"><tr><th class="px-4 py-2 text-left">Producto</th><th class="px-4 py-2 text-right">Cantidad</th><th class="px-4 py-2 text-right">Total</th></tr></thead><tbody>';
        Object.entries(porProducto).sort((a, b) => b[1].total - a[1].total).forEach(([nombre, data]) => {
            html += `<tr class="border-b"><td class="px-4 py-3 font-medium">${nombre}</td><td class="px-4 py-3 text-right">${data.cantidad}</td><td class="px-4 py-3 text-right font-bold">Gs. ${data.total.toLocaleString()}</td></tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }
}

// ============================================
// STOCK
// ============================================
// Stock grid navigation state
let stockNavNivel = 'categorias'; // 'categorias' | 'subcategorias' | 'productos'
let stockNavCatId = null;
let stockNavSubId = null;

function cargarStock() {
    stockNavNivel = 'categorias';
    stockNavCatId = null;
    stockNavSubId = null;
    actualizarBreadcrumbStock();
    renderizarStockGrid();
}

function stockNavegar(nivel) {
    if (nivel === 'inicio') { stockNavNivel = 'categorias'; stockNavCatId = null; stockNavSubId = null; }
    else if (nivel === 'categoria') { stockNavNivel = 'subcategorias'; stockNavSubId = null; }
    actualizarBreadcrumbStock();
    renderizarStockGrid();
}

function actualizarBreadcrumbStock() {
    const cat = document.getElementById('stock-breadcrumb-cat');
    const sub = document.getElementById('stock-breadcrumb-sub');
    const sep1 = document.getElementById('stock-breadcrumb-sep1');
    const sep2 = document.getElementById('stock-breadcrumb-sep2');
    if (!cat) return;
    cat.classList.add('hidden'); sub.classList.add('hidden');
    sep1.classList.add('hidden'); sep2.classList.add('hidden');
    if (stockNavCatId) {
        const catObj = (productosData.categorias || []).find(c => c.id === stockNavCatId);
        cat.textContent = catObj?.nombre || stockNavCatId;
        cat.classList.remove('hidden'); sep1.classList.remove('hidden');
    }
    if (stockNavSubId) {
        sub.textContent = stockNavSubId;
        sub.classList.remove('hidden'); sep2.classList.remove('hidden');
    }
}

function filtrarStock() {
    renderizarStockGrid();
}

function aplicarFiltroStock() {
    renderizarStockGrid();
}

function renderizarStockGrid() {
    const container = document.getElementById('stockGridContainer');
    if (!container) return;
    const busqueda = document.getElementById('buscarStock')?.value.toLowerCase() || '';
    const filtro = document.getElementById('filtroStock')?.value || '';

    // Si hay busqueda, mostrar productos directamente
    if (busqueda) {
        let items = [];
        productosData.productos.forEach(prod => {
            if (prod.nombre.toLowerCase().includes(busqueda) || prod.id.toLowerCase().includes(busqueda)) {
                items.push(prod);
            }
        });
        renderizarProductosStock(container, items, filtro);
        return;
    }

    if (stockNavNivel === 'categorias') {
        renderizarCategoriasStock(container);
    } else if (stockNavNivel === 'subcategorias') {
        const catObj = (productosData.categorias || []).find(c => c.id === stockNavCatId);
        const subs = catObj?.subcategorias || [];
        if (subs.length === 0) {
            // Sin subcategorias, ir directo a productos
            const prods = productosData.productos.filter(p => p.categoria === stockNavCatId);
            renderizarProductosStock(container, prods, filtro);
        } else {
            renderizarSubcategoriasStock(container, subs, filtro);
        }
    } else if (stockNavNivel === 'productos') {
        let prods = productosData.productos.filter(p => p.categoria === stockNavCatId && (stockNavSubId ? p.subcategoria === stockNavSubId : true));
        renderizarProductosStock(container, prods, filtro);
    }
}

function renderizarCategoriasStock(container) {
    const cats = productosData.categorias || [];
    container.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        ${cats.map(cat => {
            const count = productosData.productos.filter(p => p.categoria === cat.id).length;
            const totalStock = productosData.productos.filter(p => p.categoria === cat.id)
                .reduce((s, p) => s + p.presentaciones.reduce((ss, pr) => ss + (pr.stock || 0), 0), 0);
            return `<div onclick="stockNavCatId='${cat.id}';stockNavNivel='subcategorias';actualizarBreadcrumbStock();renderizarStockGrid()"
                class="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-md hover:border-gray-400 transition-all">
                <p class="font-bold text-gray-800 text-lg mb-1">${cat.nombre}</p>
                <p class="text-sm text-gray-500">${count} productos</p>
                <p class="text-xs font-bold mt-2 ${totalStock <= 0 ? 'text-red-600' : 'text-green-600'}">Stock: ${totalStock}</p>
            </div>`;
        }).join('')}
    </div>`;
}

function renderizarSubcategoriasStock(container, subs, filtro) {
    container.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div onclick="stockNavSubId=null;stockNavNivel='productos';actualizarBreadcrumbStock();renderizarStockGrid()"
            class="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5 cursor-pointer hover:shadow-md transition-all flex items-center justify-center">
            <p class="font-bold text-gray-500 text-sm">Ver todos</p>
        </div>
        ${subs.map(sub => {
            const count = productosData.productos.filter(p => p.categoria === stockNavCatId && p.subcategoria === sub).length;
            const totalStock = productosData.productos.filter(p => p.categoria === stockNavCatId && p.subcategoria === sub)
                .reduce((s, p) => s + p.presentaciones.reduce((ss, pr) => ss + (pr.stock || 0), 0), 0);
            return `<div onclick="stockNavSubId='${sub}';stockNavNivel='productos';actualizarBreadcrumbStock();renderizarStockGrid()"
                class="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-md hover:border-gray-400 transition-all">
                <p class="font-bold text-gray-800 mb-1">${sub}</p>
                <p class="text-sm text-gray-500">${count} productos</p>
                <p class="text-xs font-bold mt-2 ${totalStock <= 0 ? 'text-red-600' : 'text-green-600'}">Stock: ${totalStock}</p>
            </div>`;
        }).join('')}
    </div>`;
}

function renderizarProductosStock(container, prods, filtro) {
    // Aplicar ordenamiento/filtro
    if (filtro === 'az') prods = [...prods].sort((a, b) => a.nombre.localeCompare(b.nombre));
    else if (filtro === 'disponibles') prods = prods.filter(p => (p.estado || 'disponible') === 'disponible');
    else if (filtro === 'no-disponibles') prods = prods.filter(p => (p.estado || 'disponible') !== 'disponible');
    else if (filtro === 'mas-vendidos') {
        const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
        const conteo = {};
        pedidos.forEach(p => (p.items || []).forEach(it => { conteo[it.productoId] = (conteo[it.productoId] || 0) + (it.cantidad || 1); }));
        prods = [...prods].sort((a, b) => (conteo[b.id] || 0) - (conteo[a.id] || 0));
    } else if (filtro === 'menos-vendidos') {
        const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
        const conteo = {};
        pedidos.forEach(p => (p.items || []).forEach(it => { conteo[it.productoId] = (conteo[it.productoId] || 0) + (it.cantidad || 1); }));
        prods = [...prods].sort((a, b) => (conteo[a.id] || 0) - (conteo[b.id] || 0));
    }

    if (prods.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_PRODUCTS, 'Sin productos en esta categoria', 'Agrega productos usando el formulario');
        return;
    }

    container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${prods.map(prod => {
            const stockTotal = prod.presentaciones.reduce((s, p) => s + (p.stock || 0), 0);
            const presRows = prod.presentaciones.map((p, i) => `
                <div class="flex items-center gap-2 py-1 border-b border-gray-50 last:border-0">
                    <span class="text-xs text-gray-500 w-16">${p.tamano}</span>
                    <span class="font-bold text-sm ${(p.stock || 0) <= 0 ? 'text-red-600' : (p.stock || 0) < 10 ? 'text-yellow-600' : 'text-green-600'}">${p.stock || 0}</span>
                    <div class="flex gap-1 ml-auto">
                        <button onclick="ajustarStock('${prod.id}','${p.tamano}',-1)" class="w-6 h-6 bg-red-50 text-red-600 rounded font-bold text-sm">−</button>
                        <button onclick="ajustarStock('${prod.id}','${p.tamano}',1)" class="w-6 h-6 bg-green-50 text-green-600 rounded font-bold text-sm">+</button>
                        <button onclick="ajustarStock('${prod.id}','${p.tamano}',10)" class="w-6 h-6 bg-blue-50 text-blue-600 rounded text-[10px] font-bold">+10</button>
                    </div>
                </div>`).join('');
            return `<div class="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <p class="font-bold text-gray-800 text-sm">${prod.nombre}</p>
                        <p class="text-xs text-gray-400">${prod.id}</p>
                    </div>
                    <span class="text-xs font-bold px-2 py-1 rounded-full ${stockTotal <= 0 ? 'bg-red-100 text-red-700' : stockTotal < 10 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}">
                        Total: ${stockTotal}
                    </span>
                </div>
                ${presRows}
            </div>`;
        }).join('')}
    </div>`;
}

function ajustarStock(prodId, tamano, cantidad) {
    const prod = productosData.productos.find(p => p.id === prodId);
    if (!prod) return;
    const pres = prod.presentaciones.find(p => p.tamano === tamano);
    if (pres) {
        pres.stock = Math.max(0, (pres.stock || 0) + cantidad);
        registrarCambio();
        cargarStock();
    }
}

function guardarStock() { guardarTodosCambios(); }

// ============================================
// GESTIONAR PRODUCTOS
// ============================================
let paginaProductos = 1;
let productosPorPagina = 20;
let ordenProductos = { campo: 'id', asc: true };
let paginaClientes = 1;
let clientesPorPagina = 20;
let ordenClientes = { campo: 'nombre', asc: true };
let chartPerfilClienteInstance = null;

function filtrarProductos() {
    const filtro = document.getElementById('buscarProducto')?.value.toLowerCase() || '';
    const catFiltro = document.getElementById('filtroCategoria')?.value || '';
    const estadoFiltro = document.getElementById('filtroEstadoProducto')?.value || '';
    const mostrarOcultos = document.getElementById('mostrarOcultosProductos')?.checked || false;
    productosFiltrados = productosData.productos.filter(p => {
        const match = p.nombre.toLowerCase().includes(filtro) || p.id.toLowerCase().includes(filtro);
        const visible = mostrarOcultos || !p.oculto;
        const catMatch = !catFiltro || p.categoria === catFiltro;
        const estMatch = !estadoFiltro || (p.estado || 'disponible') === estadoFiltro;
        return match && visible && catMatch && estMatch;
    });
    paginaProductos = 1;
    // Resetear navegacion si se aplica un filtro global
    const hayFiltro = filtro || catFiltro || estadoFiltro;
    if (hayFiltro) { prodNavNivel = 'categorias'; prodNavCatId = null; prodNavSubId = null; }
    mostrarProductosGestion();
}

function poblarFiltroCategorias() {
    const sel = document.getElementById('filtroCategoria');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todas las categorias</option>';
    (productosData.categorias || []).forEach(c => {
        sel.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
    });
}

function ordenarProductos(campo) {
    if (ordenProductos.campo === campo) ordenProductos.asc = !ordenProductos.asc;
    else { ordenProductos.campo = campo; ordenProductos.asc = true; }
    productosFiltrados.sort((a, b) => {
        let va = a[campo] || '', vb = b[campo] || '';
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        return ordenProductos.asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    mostrarProductosGestion();
}

// Productos grid navigation state
let prodNavNivel = 'categorias';
let prodNavCatId = null;
let prodNavSubId = null;

function productosNavegar(nivel) {
    if (nivel === 'inicio') { prodNavNivel = 'categorias'; prodNavCatId = null; prodNavSubId = null; }
    else if (nivel === 'categoria') { prodNavNivel = 'subcategorias'; prodNavSubId = null; }
    actualizarBreadcrumbProductos();
    mostrarProductosGestion();
}

function actualizarBreadcrumbProductos() {
    const cat = document.getElementById('prod-breadcrumb-cat');
    const sub = document.getElementById('prod-breadcrumb-sub');
    const sep1 = document.getElementById('prod-breadcrumb-sep1');
    const sep2 = document.getElementById('prod-breadcrumb-sep2');
    if (!cat) return;
    cat.classList.add('hidden'); sub.classList.add('hidden');
    sep1.classList.add('hidden'); sep2.classList.add('hidden');
    if (prodNavCatId) {
        const catObj = (productosData.categorias || []).find(c => c.id === prodNavCatId);
        cat.textContent = catObj?.nombre || prodNavCatId;
        cat.classList.remove('hidden'); sep1.classList.remove('hidden');
    }
    if (prodNavSubId) {
        sub.textContent = prodNavSubId;
        sub.classList.remove('hidden'); sep2.classList.remove('hidden');
    }
}

function mostrarProductosGestion() {
    const container = document.getElementById('productosGridContainer');
    if (!container) return;
    poblarFiltroCategorias();

    const busqueda = document.getElementById('buscarProducto')?.value.toLowerCase() || '';
    const catFiltro = document.getElementById('filtroCategoria')?.value || '';
    const estadoFiltro = document.getElementById('filtroEstadoProducto')?.value || '';
    const ordenFiltro = document.getElementById('filtroOrdenProductos')?.value || '';
    const mostrarOcultos = document.getElementById('mostrarOcultosProductos')?.checked || false;

    // Si hay filtros activos de busqueda/categoria/estado, mostrar grid de productos directamente
    const hayFiltro = busqueda || catFiltro || estadoFiltro;

    if (hayFiltro) {
        let prods = productosFiltrados;
        if (!mostrarOcultos) prods = prods.filter(p => !p.oculto);
        prods = aplicarOrdenProductos(prods, ordenFiltro);
        renderizarProductosGestionGrid(container, prods);
        actualizarPaginacionProductos(prods.length);
        return;
    }

    // Sin filtros: navegacion por categoria
    if (prodNavNivel === 'categorias') {
        renderizarCategoriasGestion(container);
        actualizarPaginacionProductos(0);
    } else if (prodNavNivel === 'subcategorias') {
        const catObj = (productosData.categorias || []).find(c => c.id === prodNavCatId);
        const subs = catObj?.subcategorias || [];
        if (subs.length === 0) {
            let prods = productosData.productos.filter(p => p.categoria === prodNavCatId);
            if (!mostrarOcultos) prods = prods.filter(p => !p.oculto);
            prods = aplicarOrdenProductos(prods, ordenFiltro);
            renderizarProductosGestionGrid(container, prods);
            actualizarPaginacionProductos(prods.length);
        } else {
            renderizarSubcategoriasGestion(container, subs);
            actualizarPaginacionProductos(0);
        }
    } else if (prodNavNivel === 'productos') {
        let prods = productosData.productos.filter(p => p.categoria === prodNavCatId && (prodNavSubId ? p.subcategoria === prodNavSubId : true));
        if (!mostrarOcultos) prods = prods.filter(p => !p.oculto);
        prods = aplicarOrdenProductos(prods, ordenFiltro);
        renderizarProductosGestionGrid(container, prods);
        actualizarPaginacionProductos(prods.length);
    }

    actualizarBreadcrumbProductos();
}

function aplicarOrdenProductos(prods, orden) {
    if (orden === 'az') return [...prods].sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (orden === 'za') return [...prods].sort((a, b) => b.nombre.localeCompare(a.nombre));
    if (orden === 'mas-vendidos') {
        const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
        const conteo = {};
        pedidos.forEach(p => (p.items || []).forEach(it => { conteo[it.productoId] = (conteo[it.productoId] || 0) + (it.cantidad || 1); }));
        return [...prods].sort((a, b) => (conteo[b.id] || 0) - (conteo[a.id] || 0));
    }
    if (orden === 'menos-vendidos') {
        const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
        const conteo = {};
        pedidos.forEach(p => (p.items || []).forEach(it => { conteo[it.productoId] = (conteo[it.productoId] || 0) + (it.cantidad || 1); }));
        return [...prods].sort((a, b) => (conteo[a.id] || 0) - (conteo[b.id] || 0));
    }
    return prods;
}

function renderizarCategoriasGestion(container) {
    const cats = productosData.categorias || [];
    container.innerHTML = `<div class="catalog-grid">
        ${cats.map(cat => {
            const count = productosData.productos.filter(p => p.categoria === cat.id).length;
            const prods = productosData.productos.filter(p => p.categoria === cat.id && p.imagen);
            const img = prods.length > 0 ? prods[0].imagen : '';
            return `<div onclick="prodNavCatId='${cat.id}';prodNavNivel='subcategorias';actualizarBreadcrumbProductos();mostrarProductosGestion()"
                class="catalog-card" ${img ? `data-bg="${img}"` : ''}>
                ${!img ? '<div class="catalog-card-noimg"><i data-lucide="folder-open" class="w-10 h-10 text-gray-400"></i></div>' : ''}
                <div class="catalog-card-label">
                    <div>${cat.nombre}</div>
                    <div class="card-sub">${count} productos</div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
    lucide.createIcons();
    initLazyLoadCards(container);
}

function renderizarSubcategoriasGestion(container, subs) {
    container.innerHTML = `<div class="catalog-grid">
        <div onclick="prodNavSubId=null;prodNavNivel='productos';actualizarBreadcrumbProductos();mostrarProductosGestion()"
            class="catalog-card catalog-card--loaded" style="border:2px dashed rgba(255,255,255,0.3)">
            <div class="catalog-card-noimg" style="background:linear-gradient(135deg,#4b5563,#374151)"><i data-lucide="list" class="w-10 h-10 text-gray-400"></i></div>
            <div class="catalog-card-label"><div>Ver todos</div></div>
        </div>
        ${subs.map(sub => {
            const prods = productosData.productos.filter(p => p.categoria === prodNavCatId && p.subcategoria === sub);
            const count = prods.length;
            const imgProd = prods.find(p => p.imagen);
            const img = imgProd ? imgProd.imagen : '';
            return `<div onclick="prodNavSubId='${sub}';prodNavNivel='productos';actualizarBreadcrumbProductos();mostrarProductosGestion()"
                class="catalog-card" ${img ? `data-bg="${img}"` : ''}>
                ${!img ? '<div class="catalog-card-noimg"><i data-lucide="folder" class="w-10 h-10 text-gray-400"></i></div>' : ''}
                <div class="catalog-card-label">
                    <div>${sub}</div>
                    <div class="card-sub">${count} productos</div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
    lucide.createIcons();
    initLazyLoadCards(container);
}

function renderizarProductosGestionGrid(container, prods) {
    if (prods.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_PRODUCTS, 'Sin productos encontrados', 'Intenta con otro termino de busqueda');
        return;
    }
    const total = prods.length;
    const inicio = (paginaProductos - 1) * productosPorPagina;
    const paginados = prods.slice(inicio, inicio + productosPorPagina);

    container.innerHTML = `<div class="catalog-grid">
        ${paginados.map(prod => {
            const estado = prod.estado || 'disponible';
            const estadoBg = estado === 'disponible' ? 'background:#059669;color:#fff' : estado === 'agotado' ? 'background:#d97706;color:#fff' : 'background:#dc2626;color:#fff';
            const oculto = prod.oculto || false;
            const img = prod.imagen || '';
            const precio = prod.presentaciones && prod.presentaciones.length > 0 ? (prod.presentaciones[0].precio_base || 0) : 0;
            return `<div onclick="abrirPerfilProducto('${prod.id}')" class="catalog-card ${oculto ? 'oculto' : ''}" ${img ? `data-bg="${img}"` : ''}>
                ${!img ? '<div class="catalog-card-noimg"><i data-lucide="package" class="w-10 h-10 text-gray-400"></i></div>' : ''}
                <span class="catalog-card-badge" style="${estadoBg}">${estado}</span>
                <div class="catalog-card-label">
                    <div>${prod.nombre}</div>
                    <div class="card-sub">${precio > 0 ? 'Gs. ' + precio.toLocaleString() : prod.presentaciones.length + ' pres.'}</div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
    lucide.createIcons();
    initLazyLoadCards(container);
}

function actualizarPaginacionProductos(total) {
    const pagEl = document.getElementById('paginacionProductos');
    if (!pagEl || total === 0) { if (pagEl) pagEl.innerHTML = ''; return; }
    const totalPaginas = Math.ceil(total / productosPorPagina);
    pagEl.innerHTML = `<span class="text-sm">${total} productos | Pag. ${paginaProductos} de ${totalPaginas}</span>
    <div class="flex gap-2">
        <button onclick="paginaProductos=1;mostrarProductosGestion()" class="px-3 py-1 rounded border text-xs ${paginaProductos <= 1 ? 'opacity-30' : 'hover:bg-gray-100'}" ${paginaProductos <= 1 ? 'disabled' : ''}>|&lt;</button>
        <button onclick="if(paginaProductos>1){paginaProductos--;mostrarProductosGestion()}" class="px-3 py-1 rounded border text-xs ${paginaProductos <= 1 ? 'opacity-30' : 'hover:bg-gray-100'}">&lt;</button>
        <button onclick="if(paginaProductos<${totalPaginas}){paginaProductos++;mostrarProductosGestion()}" class="px-3 py-1 rounded border text-xs ${paginaProductos >= totalPaginas ? 'opacity-30' : 'hover:bg-gray-100'}">&gt;</button>
        <button onclick="paginaProductos=${totalPaginas};mostrarProductosGestion()" class="px-3 py-1 rounded border text-xs ${paginaProductos >= totalPaginas ? 'opacity-30' : 'hover:bg-gray-100'}" ${paginaProductos >= totalPaginas ? 'disabled' : ''}>&gt;|</button>
    </div>`;
}

// Perfil de producto
function abrirPerfilProducto(prodId) {
    const prod = productosData.productos.find(p => p.id === prodId);
    if (!prod) return;
    const estado = prod.estado || 'disponible';
    const estadoColor = estado === 'disponible' ? 'bg-green-100 text-green-700' : estado === 'agotado' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
    const oculto = prod.oculto || false;

    const img = document.getElementById('perfilProductoImg');
    if (img) { img.src = prod.imagen || ''; img.style.display = prod.imagen ? '' : 'none'; }
    document.getElementById('perfilProductoNombre').textContent = prod.nombre;
    const catObj = productosData.categorias.find(c => c.id === prod.categoria);
    document.getElementById('perfilProductoCategoria').textContent = `${catObj?.nombre || prod.categoria}${prod.subcategoria ? ' / ' + prod.subcategoria : ''}`;
    const badge = document.getElementById('perfilProductoEstadoBadge');
    badge.textContent = estado; badge.className = `inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold ${estadoColor}`;

    // Botones de accion
    document.getElementById('perfilProductoEditarBtn').onclick = () => { cerrarPerfilProducto(); editarProducto(prodId); };
    const ocultarBtn = document.getElementById('perfilProductoOcultarBtn');
    ocultarBtn.textContent = oculto ? 'Mostrar' : 'Ocultar';
    ocultarBtn.onclick = () => { toggleOcultarProducto(prodId); cerrarPerfilProducto(); };
    document.getElementById('perfilProductoEliminarBtn').onclick = () => { cerrarPerfilProducto(); eliminarProducto(prodId); };

    // Presentaciones
    const presEl = document.getElementById('perfilProductoPresentaciones');
    presEl.innerHTML = prod.presentaciones.map(p => {
        const costo = p.costo || 0;
        const precio = p.precio_base || 0;
        const margen = precio > 0 && costo > 0 ? Math.round(((precio - costo) / precio) * 100) : null;
        return `<div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0 text-sm">
            <span class="font-medium text-gray-700">${p.tamano}</span>
            <div class="flex gap-4 text-right">
                ${costo > 0 ? `<span class="text-gray-500">Costo: <strong>Gs. ${costo.toLocaleString()}</strong></span>` : ''}
                <span class="text-gray-800">Precio: <strong>Gs. ${precio.toLocaleString()}</strong></span>
                ${margen !== null ? `<span class="${margen > 30 ? 'text-green-600' : margen > 15 ? 'text-yellow-600' : 'text-red-600'} font-bold">${margen}%</span>` : ''}
            </div>
        </div>`;
    }).join('');

    // Stock
    const stockEl = document.getElementById('perfilProductoStock');
    stockEl.innerHTML = prod.presentaciones.map(p => `
        <div class="flex items-center gap-3 py-1">
            <span class="text-sm text-gray-600 w-20">${p.tamano}</span>
            <span class="font-bold ${(p.stock || 0) <= 0 ? 'text-red-600' : 'text-green-600'}">${p.stock || 0}</span>
            <div class="flex gap-1 ml-auto">
                <button onclick="ajustarStock('${prodId}','${p.tamano}',-1);abrirPerfilProducto('${prodId}')" class="w-7 h-7 bg-red-50 text-red-600 rounded font-bold">−</button>
                <button onclick="ajustarStock('${prodId}','${p.tamano}',1);abrirPerfilProducto('${prodId}')" class="w-7 h-7 bg-green-50 text-green-600 rounded font-bold">+</button>
                <button onclick="ajustarStock('${prodId}','${p.tamano}',10);abrirPerfilProducto('${prodId}')" class="w-7 h-7 bg-blue-50 text-blue-600 rounded text-xs font-bold">+10</button>
            </div>
        </div>`).join('');

    document.getElementById('modalPerfilProducto').classList.add('show');
}

function cerrarPerfilProducto() {
    document.getElementById('modalPerfilProducto').classList.remove('show');
}

function guardarStockDesdePerfilProducto() {
    guardarStock();
    mostrarProductosGestion();
}

function actualizarProducto(id, campo, valor) {
    const p = productosData.productos.find(x => x.id === id);
    if (p) { p[campo] = valor; registrarCambio(); }
}

function actualizarPresentacion(id, idx, campo, valor) {
    const p = productosData.productos.find(x => x.id === id);
    if (p && p.presentaciones[idx]) {
        if (campo === 'precio') p.presentaciones[idx].precio_base = parseInt(valor) || 0;
        else if (campo === 'costo') p.presentaciones[idx].costo = parseInt(valor) || 0;
        else p.presentaciones[idx].tamano = valor;
        registrarCambio();
    }
}

function eliminarPresentacion(id, idx) {
    const p = productosData.productos.find(x => x.id === id);
    if (p && p.presentaciones.length > 1) { p.presentaciones.splice(idx, 1); registrarCambio(); mostrarProductosGestion(); }
    else mostrarToast('Debe tener al menos una presentacion', 'error');
}

function agregarPresentacion(id) {
    const p = productosData.productos.find(x => x.id === id);
    if (p) { p.presentaciones.push({ tamano: '', precio_base: 0, costo: 0 }); registrarCambio(); mostrarProductosGestion(); }
}

async function eliminarProducto(id) {
    if (!await mostrarConfirmModal('¿Eliminar este producto?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    productosData.productos = productosData.productos.filter(p => p.id !== id);
    productosFiltrados = productosFiltrados.filter(p => p.id !== id);
    registrarCambio();
    mostrarProductosGestion();
}

function toggleOcultarProducto(id) {
    const prod = productosData.productos.find(p => p.id === id);
    if (prod) { prod.oculto = !prod.oculto; registrarCambio(); mostrarProductosGestion(); }
}

// Modal Producto (crear/editar)
function abrirModalProducto(productoId) {
    const titulo = document.getElementById('modalProductoTitulo');
    const formId = document.getElementById('formProductoId');
    const presDetalladas = document.getElementById('presentacionesDetalladas');
    const presInput = document.getElementById('nuevoProductoPresentaciones');
    const presInfo = document.getElementById('modalProductoPresInfo');

    // Poblar categorias
    const select = document.getElementById('nuevoProductoCategoria');
    if (select) {
        select.innerHTML = '';
        productosData.categorias.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
        });
    }

    if (productoId) {
        // Modo edicion
        const prod = productosData.productos.find(p => p.id === productoId);
        if (!prod) return;
        titulo.textContent = 'Editar Producto';
        formId.value = prod.id;
        document.getElementById('nuevoProductoNombre').value = prod.nombre;
        document.getElementById('nuevoProductoImagen').value = prod.imagen || '';
        document.getElementById('nuevoProductoCategoria').value = prod.categoria;
        actualizarSubcategoriasModal();
        document.getElementById('nuevoProductoSubcategoria').value = prod.subcategoria || '';
        document.getElementById('nuevoProductoEstado').value = prod.estado || 'disponible';
        document.getElementById('nuevoProductoPrecio').value = prod.presentaciones[0]?.precio_base || 0;
        document.getElementById('nuevoProductoCosto').value = prod.presentaciones[0]?.costo || 0;

        // Mostrar presentaciones detalladas
        presInput.style.display = 'none';
        presInfo.style.display = 'none';
        presDetalladas.style.display = '';
        presDetalladas.innerHTML = '<p class="text-xs font-bold text-gray-500 mb-2">PRESENTACIONES</p>' +
            prod.presentaciones.map((p, i) => `
            <div class="flex items-center gap-2 mb-2 bg-gray-50 p-2 rounded-lg">
                <input type="text" value="${p.tamano}" data-pres-idx="${i}" data-pres-field="tamano" class="w-20 px-2 py-1 text-sm border rounded" placeholder="Tamano">
                <label class="text-xs text-gray-400">Precio:</label>
                <input type="number" value="${p.precio_base}" data-pres-idx="${i}" data-pres-field="precio" class="w-24 px-2 py-1 text-sm border rounded">
                <label class="text-xs text-gray-400">Costo:</label>
                <input type="number" value="${p.costo || 0}" data-pres-idx="${i}" data-pres-field="costo" class="w-24 px-2 py-1 text-sm border rounded">
                ${prod.presentaciones.length > 1 ? `<button onclick="this.parentElement.remove()" class="text-red-400 font-bold">x</button>` : ''}
            </div>`).join('') +
            '<button onclick="agregarPresModal()" class="text-xs text-blue-600 font-bold mt-1">+ Agregar presentacion</button>';
    } else {
        // Modo creacion
        titulo.textContent = 'Nuevo Producto';
        formId.value = '';
        ['nuevoProductoNombre','nuevoProductoImagen','nuevoProductoPresentaciones','nuevoProductoPrecio','nuevoProductoCosto'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        document.getElementById('nuevoProductoEstado').value = 'disponible';
        presInput.style.display = '';
        presInfo.style.display = '';
        presDetalladas.style.display = 'none';
        actualizarSubcategoriasModal();
    }
    document.getElementById('modalProducto')?.classList.add('show');
}

function editarProducto(id) { abrirModalProducto(id); }

function agregarPresModal() {
    const container = document.getElementById('presentacionesDetalladas');
    const idx = container.querySelectorAll('[data-pres-idx]').length / 3;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 mb-2 bg-gray-50 p-2 rounded-lg';
    div.innerHTML = `
        <input type="text" data-pres-idx="${idx}" data-pres-field="tamano" class="w-20 px-2 py-1 text-sm border rounded" placeholder="Tamano">
        <label class="text-xs text-gray-400">Precio:</label>
        <input type="number" value="0" data-pres-idx="${idx}" data-pres-field="precio" class="w-24 px-2 py-1 text-sm border rounded">
        <label class="text-xs text-gray-400">Costo:</label>
        <input type="number" value="0" data-pres-idx="${idx}" data-pres-field="costo" class="w-24 px-2 py-1 text-sm border rounded">
        <button onclick="this.parentElement.remove()" class="text-red-400 font-bold">x</button>`;
    container.querySelector('button:last-child').before(div);
}

function actualizarSubcategoriasModal() {
    const catId = document.getElementById('nuevoProductoCategoria')?.value;
    const subSel = document.getElementById('nuevoProductoSubcategoria');
    if (!subSel) return;
    const cat = productosData.categorias.find(c => c.id === catId);
    subSel.innerHTML = '<option value="">Seleccionar...</option>';
    if (cat && cat.subcategorias) {
        cat.subcategorias.forEach(s => {
            subSel.innerHTML += `<option value="${s}">${s}</option>`;
        });
    }
    subSel.innerHTML += '<option value="__otra__">+ Otra...</option>';
}

function cerrarModalProducto() {
    document.getElementById('modalProducto')?.classList.remove('show');
}

function guardarProductoModal() {
    const id = document.getElementById('formProductoId')?.value;
    const nombre = document.getElementById('nuevoProductoNombre')?.value.trim();
    const imagen = document.getElementById('nuevoProductoImagen')?.value.trim();
    const categoria = document.getElementById('nuevoProductoCategoria')?.value;
    let subcategoria = document.getElementById('nuevoProductoSubcategoria')?.value;
    const estado = document.getElementById('nuevoProductoEstado')?.value || 'disponible';
    const precio = parseInt(document.getElementById('nuevoProductoPrecio')?.value) || 0;
    const costo = parseInt(document.getElementById('nuevoProductoCosto')?.value) || 0;

    if (subcategoria === '__otra__') {
        subcategoria = prompt('Nombre de la nueva subcategoria:');
        if (!subcategoria) return;
    }

    if (!nombre) { mostrarToast('Ingresa el nombre del producto', 'error'); return; }

    if (id) {
        // Edicion
        const prod = productosData.productos.find(p => p.id === id);
        if (!prod) return;
        prod.nombre = nombre;
        prod.imagen = imagen || undefined;
        prod.categoria = categoria;
        prod.subcategoria = subcategoria || 'General';
        prod.estado = estado;
        // Recoger presentaciones detalladas
        const presContainer = document.getElementById('presentacionesDetalladas');
        const presRows = presContainer.querySelectorAll('.bg-gray-50');
        const nuevasPres = [];
        presRows.forEach(row => {
            const tamano = row.querySelector('[data-pres-field="tamano"]')?.value || '';
            const precioVal = parseInt(row.querySelector('[data-pres-field="precio"]')?.value) || 0;
            const costoVal = parseInt(row.querySelector('[data-pres-field="costo"]')?.value) || 0;
            if (tamano) nuevasPres.push({ tamano, precio_base: precioVal, costo: costoVal });
        });
        if (nuevasPres.length > 0) prod.presentaciones = nuevasPres;
    } else {
        // Creacion
        const ultimoId = productosData.productos.length > 0 ?
            Math.max(...productosData.productos.map(p => parseInt(p.id.replace('P', '')) || 0)) : 0;
        const nuevoId = `P${String(ultimoId + 1).padStart(3, '0')}`;
        const presStr = document.getElementById('nuevoProductoPresentaciones')?.value.trim();
        const presentaciones = presStr
            ? presStr.split(',').map(p => ({ tamano: p.trim(), precio_base: precio, costo }))
            : [{ tamano: 'Unidad', precio_base: precio, costo }];
        const nuevo = { id: nuevoId, nombre, categoria: categoria || 'cuidado_personal', subcategoria: subcategoria || 'General', presentaciones, estado };
        if (imagen) nuevo.imagen = imagen;
        productosData.productos.push(nuevo);
    }

    productosFiltrados = [...productosData.productos];
    registrarCambio();
    mostrarProductosGestion();
    cerrarModalProducto();
}

// ============================================
// GESTION DE CATEGORIAS
// ============================================
function abrirModalCategorias() {
    renderizarListaCategorias();
    document.getElementById('modalCategorias')?.classList.add('show');
}
function cerrarModalCategorias() {
    document.getElementById('modalCategorias')?.classList.remove('show');
}

function renderizarListaCategorias() {
    const container = document.getElementById('listaCategoriasCuerpo');
    if (!container) return;
    container.innerHTML = '';
    (productosData.categorias || []).forEach(cat => {
        const div = document.createElement('div');
        div.className = 'bg-gray-50 rounded-xl p-4';
        div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <div>
                    <span class="font-bold text-gray-800">${cat.nombre}</span>
                    <span class="text-xs text-gray-400 ml-2">(${cat.id})</span>
                </div>
                <button onclick="eliminarCategoria('${cat.id}')" class="text-red-500 text-xs font-bold hover:underline">Eliminar</button>
            </div>
            <div class="flex flex-wrap gap-2 mb-2">
                ${(cat.subcategorias || []).map(s => `
                    <span class="bg-white px-2 py-1 rounded-lg text-xs border border-gray-200 flex items-center gap-1">
                        ${s} <button onclick="eliminarSubcategoria('${cat.id}','${s}')" class="text-red-400 hover:text-red-600 font-bold">x</button>
                    </span>`).join('')}
            </div>
            <div class="flex gap-2">
                <input type="text" id="nuevaSub_${cat.id}" class="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs" placeholder="Nueva subcategoria...">
                <button onclick="agregarSubcategoria('${cat.id}')" class="bg-gray-800 text-white px-3 py-1 rounded-lg text-xs font-bold">+</button>
            </div>`;
        container.appendChild(div);
    });
}

function agregarCategoriaModal() {
    const id = document.getElementById('nuevaCategoriaId')?.value.trim().toLowerCase().replace(/\s+/g, '_');
    const nombre = document.getElementById('nuevaCategoriaNombre')?.value.trim();
    if (!id || !nombre) { mostrarToast('ID y nombre son obligatorios', 'error'); return; }
    if (productosData.categorias.find(c => c.id === id)) { mostrarToast('Ya existe esta categoria', 'error'); return; }
    productosData.categorias.push({ id, nombre, subcategorias: [] });
    registrarCambio();
    document.getElementById('nuevaCategoriaId').value = '';
    document.getElementById('nuevaCategoriaNombre').value = '';
    renderizarListaCategorias();
}

async function eliminarCategoria(catId) {
    const prods = productosData.productos.filter(p => p.categoria === catId);
    if (prods.length > 0) { mostrarToast(`No se puede eliminar: ${prods.length} productos usan esta categoria`, 'error'); return; }
    if (!await mostrarConfirmModal('¿Eliminar esta categoria?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    productosData.categorias = productosData.categorias.filter(c => c.id !== catId);
    registrarCambio();
    renderizarListaCategorias();
}

function agregarSubcategoria(catId) {
    const input = document.getElementById('nuevaSub_' + catId);
    const nombre = input?.value.trim();
    if (!nombre) return;
    const cat = productosData.categorias.find(c => c.id === catId);
    if (cat) {
        if (!cat.subcategorias) cat.subcategorias = [];
        if (cat.subcategorias.includes(nombre)) { mostrarToast('Ya existe', 'error'); return; }
        cat.subcategorias.push(nombre);
        registrarCambio();
        input.value = '';
        renderizarListaCategorias();
    }
}

function eliminarSubcategoria(catId, subNombre) {
    const cat = productosData.categorias.find(c => c.id === catId);
    if (cat) {
        cat.subcategorias = (cat.subcategorias || []).filter(s => s !== subNombre);
        registrarCambio();
        renderizarListaCategorias();
    }
}

// ============================================
// GESTIONAR CLIENTES
// ============================================
function filtrarClientes() {
    const filtro = document.getElementById('buscarCliente')?.value.toLowerCase() || '';
    const zonaFiltro = document.getElementById('filtroZonaCliente')?.value || '';
    const mostrarOcultos = document.getElementById('mostrarOcultosClientes')?.checked || false;
    clientesFiltrados = productosData.clientes.filter(c => {
        const match = (c.razon_social || c.nombre || '').toLowerCase().includes(filtro) ||
                      (c.ruc || '').toLowerCase().includes(filtro) ||
                      (c.id || '').toLowerCase().includes(filtro) ||
                      (c.direccion || c.zona || '').toLowerCase().includes(filtro);
        const visible = mostrarOcultos || !c.oculto;
        const zonaMatch = !zonaFiltro || (c.zona || '') === zonaFiltro;
        return match && visible && zonaMatch;
    });
    paginaClientes = 1;
    mostrarClientesGestion();
}

function poblarFiltroZonas() {
    const sel = document.getElementById('filtroZonaCliente');
    if (!sel) return;
    const zonas = [...new Set(productosData.clientes.map(c => c.zona).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Todas las zonas</option>';
    zonas.forEach(z => { sel.innerHTML += `<option value="${z}">${z}</option>`; });
}

function ordenarClientes(campo) {
    if (ordenClientes.campo === campo) ordenClientes.asc = !ordenClientes.asc;
    else { ordenClientes.campo = campo; ordenClientes.asc = true; }
    clientesFiltrados.sort((a, b) => {
        let va = campo === 'nombre' ? (a.razon_social || a.nombre || '') : (a[campo] || '');
        let vb = campo === 'nombre' ? (b.razon_social || b.nombre || '') : (b[campo] || '');
        va = va.toLowerCase(); vb = vb.toLowerCase();
        return ordenClientes.asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    mostrarClientesGestion();
}

function mostrarClientesGestion() {
    const tbody = document.getElementById('tablaClientesCuerpo');
    if (!tbody) return;
    tbody.innerHTML = '';
    poblarFiltroZonas();
    mostrarClientesPendientes();

    const total = clientesFiltrados.length;
    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="5">${generarAdminEmptyState(SVG_ADMIN_EMPTY_CLIENTS, 'Sin clientes encontrados', 'Agrega clientes o ajusta los filtros de busqueda')}</td></tr>`;
        const pag = document.getElementById('paginacionClientes');
        if (pag) pag.innerHTML = '';
        return;
    }
    const inicio = (paginaClientes - 1) * clientesPorPagina;
    const paginados = clientesFiltrados.slice(inicio, inicio + clientesPorPagina);

    paginados.forEach(c => {
        const oculto = c.oculto || false;
        const precios = c.precios_personalizados ? Object.keys(c.precios_personalizados).length : 0;
        const nombre = c.razon_social || c.nombre || 'Sin nombre';
        const tel = c.telefono || '';
        const tr = document.createElement('tr');
        tr.className = `hover:bg-gray-50 cursor-pointer ${oculto ? 'opacity-40' : ''}`;
        tr.innerHTML = `
            <td class="px-4 py-3" onclick="abrirPerfilCliente('${c.id}')">
                <p class="font-medium text-gray-800">${nombre}</p>
                <p class="text-xs text-gray-500">${c.ruc || ''} ${c.encargado ? '| ' + c.encargado : ''}</p>
            </td>
            <td class="px-4 py-3 text-sm text-gray-500">${c.zona || c.direccion || '-'}</td>
            <td class="px-4 py-3 text-sm text-gray-500">${tel || '-'}</td>
            <td class="px-4 py-3">${precios > 0 ? `<span class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">${precios}</span>` : '<span class="text-xs text-gray-300">0</span>'}</td>`;
        tbody.appendChild(tr);
    });

    const totalPaginas = Math.ceil(total / clientesPorPagina);
    const pagEl = document.getElementById('paginacionClientes');
    if (pagEl) {
        pagEl.innerHTML = `<span>${total} clientes | Pagina ${paginaClientes} de ${totalPaginas}</span>
        <div class="flex gap-2">
            <button onclick="paginaClientes=1;mostrarClientesGestion()" class="px-3 py-1 rounded border text-xs ${paginaClientes <= 1 ? 'opacity-30' : 'hover:bg-gray-100'}" ${paginaClientes <= 1 ? 'disabled' : ''}>&lt;&lt;</button>
            <button onclick="paginaClientes--;mostrarClientesGestion()" class="px-3 py-1 rounded border text-xs ${paginaClientes <= 1 ? 'opacity-30' : 'hover:bg-gray-100'}" ${paginaClientes <= 1 ? 'disabled' : ''}>&lt;</button>
            <button onclick="paginaClientes++;mostrarClientesGestion()" class="px-3 py-1 rounded border text-xs ${paginaClientes >= totalPaginas ? 'opacity-30' : 'hover:bg-gray-100'}" ${paginaClientes >= totalPaginas ? 'disabled' : ''}>&gt;</button>
            <button onclick="paginaClientes=${totalPaginas};mostrarClientesGestion()" class="px-3 py-1 rounded border text-xs ${paginaClientes >= totalPaginas ? 'opacity-30' : 'hover:bg-gray-100'}" ${paginaClientes >= totalPaginas ? 'disabled' : ''}>&gt;&gt;</button>
        </div>`;
    }
}

function mostrarClientesPendientes() {
    const pendientes = JSON.parse(localStorage.getItem('hdv_clientes_pendientes') || '[]')
        .filter(c => c.estado === 'pendiente_aprobacion');

    // Buscar o crear el banner de pendientes en la seccion clientes
    let banner = document.getElementById('bannerClientesPendientes');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'bannerClientesPendientes';
        const seccion = document.getElementById('seccion-clientes');
        if (seccion) seccion.insertBefore(banner, seccion.firstChild);
    }

    if (pendientes.length === 0) { banner.innerHTML = ''; return; }

    banner.innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
            <div class="flex justify-between items-center mb-3">
                <h4 class="font-bold text-yellow-800 flex items-center gap-1.5"><i data-lucide="clock" class="w-4 h-4"></i> Clientes pendientes de aprobacion (${pendientes.length})</h4>
            </div>
            <div class="space-y-2">
                ${pendientes.map(c => `
                    <div class="bg-white border border-yellow-100 rounded-lg p-3 flex justify-between items-center">
                        <div>
                            <p class="font-bold text-gray-800 text-sm">${c.nombre}</p>
                            <p class="text-xs text-gray-500">Tel: ${c.telefono || '-'} | Zona: ${c.zona || '-'}${c.direccion ? ' | Dir: ' + c.direccion : ''}</p>
                            <p class="text-xs text-gray-400">${new Date(c.fechaSolicitud).toLocaleDateString('es-PY')}</p>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="aprobarClientePendiente('${c.id}')" class="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Aprobar</button>
                            <button onclick="rechazarClientePendiente('${c.id}')" class="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-xs font-bold">Rechazar</button>
                        </div>
                    </div>`).join('')}
            </div>
        </div>`;
}

function aprobarClientePendiente(id) {
    const pendientes = JSON.parse(localStorage.getItem('hdv_clientes_pendientes') || '[]');
    const cliente = pendientes.find(c => c.id === id);
    if (!cliente) return;
    // Generar ID definitivo
    const ultimoId = Math.max(...productosData.clientes.map(c => parseInt(c.id.replace('C', '')) || 0), 0);
    const nuevoId = `C${String(ultimoId + 1).padStart(3, '0')}`;
    const clienteAprobado = { ...cliente, id: nuevoId, estado: 'activo', precios_personalizados: {} };
    delete clienteAprobado.fechaSolicitud;
    productosData.clientes.push(clienteAprobado);
    registrarCambio();
    // Marcar como aprobado
    const idx = pendientes.findIndex(c => c.id === id);
    if (idx >= 0) pendientes.splice(idx, 1);
    localStorage.setItem('hdv_clientes_pendientes', JSON.stringify(pendientes));
    clientesFiltrados = [...productosData.clientes];
    mostrarClientesGestion();
}

async function rechazarClientePendiente(id) {
    if (!await mostrarConfirmModal('¿Rechazar esta solicitud de cliente?', { destructivo: true, textoConfirmar: 'Rechazar' })) return;
    const pendientes = JSON.parse(localStorage.getItem('hdv_clientes_pendientes') || '[]');
    const nuevos = pendientes.filter(c => c.id !== id);
    localStorage.setItem('hdv_clientes_pendientes', JSON.stringify(nuevos));
    mostrarClientesPendientes();
}

function enviarWhatsAppCliente(telefono, nombre) {
    let tel = telefono.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '595' + tel.substring(1);
    const msg = `Hola ${nombre}, le saludamos de HDV Distribuciones. `;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
}

function toggleOcultarCliente(id) {
    const c = productosData.clientes.find(x => x.id === id);
    if (c) { c.oculto = !c.oculto; registrarCambio(); filtrarClientes(); }
}

async function eliminarCliente(id) {
    if (!await mostrarConfirmModal('¿Eliminar este cliente y sus precios personalizados?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    productosData.clientes = productosData.clientes.filter(c => c.id !== id);
    clientesFiltrados = clientesFiltrados.filter(c => c.id !== id);
    registrarCambio();
    mostrarClientesGestion();
}

// Modal Cliente (crear/editar)
function abrirModalCliente(clienteId) {
    const titulo = document.getElementById('modalClienteTitulo');
    const formId = document.getElementById('formClienteId');
    if (clienteId) {
        const c = productosData.clientes.find(x => x.id === clienteId);
        if (!c) return;
        titulo.textContent = 'Editar Cliente';
        formId.value = c.id;
        document.getElementById('nuevoClienteRazon').value = c.razon_social || c.nombre || '';
        document.getElementById('nuevoClienteRUC').value = c.ruc || '';
        document.getElementById('nuevoClienteTelefono').value = c.telefono || '';
        document.getElementById('nuevoClienteDireccion').value = c.direccion || '';
        document.getElementById('nuevoClienteZona').value = c.zona || '';
        document.getElementById('nuevoClienteEncargado').value = c.encargado || '';
    } else {
        titulo.textContent = 'Nuevo Cliente';
        formId.value = '';
        ['nuevoClienteRazon','nuevoClienteRUC','nuevoClienteTelefono','nuevoClienteDireccion','nuevoClienteZona','nuevoClienteEncargado'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
    }
    document.getElementById('modalCliente')?.classList.add('show');
}

function editarCliente(id) { abrirModalCliente(id); }

function cerrarModalCliente() {
    document.getElementById('modalCliente')?.classList.remove('show');
}

function guardarClienteModal() {
    const id = document.getElementById('formClienteId')?.value;
    const razon = document.getElementById('nuevoClienteRazon')?.value.trim();
    const ruc = document.getElementById('nuevoClienteRUC')?.value.trim();
    const telefono = document.getElementById('nuevoClienteTelefono')?.value.trim();
    const direccion = document.getElementById('nuevoClienteDireccion')?.value.trim();
    const zona = document.getElementById('nuevoClienteZona')?.value.trim();
    const encargado = document.getElementById('nuevoClienteEncargado')?.value.trim();

    if (!razon) { mostrarToast('Ingresa la razon social', 'error'); return; }

    if (id) {
        // Edicion
        const c = productosData.clientes.find(x => x.id === id);
        if (c) {
            c.nombre = razon; c.razon_social = razon;
            c.ruc = ruc; c.telefono = telefono;
            c.direccion = direccion; c.zona = zona || direccion;
            c.encargado = encargado;
        }
    } else {
        // Creacion
        const ultimoId = productosData.clientes.length > 0 ?
            Math.max(...productosData.clientes.map(c => parseInt(c.id.replace('C', '')) || 0)) : 0;
        const nuevoId = `C${String(ultimoId + 1).padStart(3, '0')}`;
        productosData.clientes.push({
            id: nuevoId, nombre: razon, razon_social: razon, ruc: ruc || '',
            telefono: telefono || '', direccion: direccion || '', zona: zona || direccion || '',
            encargado: encargado || '', tipo: 'mayorista_estandar', precios_personalizados: {}
        });
    }

    clientesFiltrados = [...productosData.clientes];
    registrarCambio();
    mostrarClientesGestion();
    cerrarModalCliente();
}

// ============================================
// PERFIL DE CLIENTE (Master-Detail)
// ============================================
let clientePerfilActual = null;

function abrirPerfilCliente(clienteId) {
    const cliente = productosData.clientes.find(c => c.id === clienteId);
    if (!cliente) return;
    clientePerfilActual = cliente;
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedidosCliente = pedidos.filter(p => p.cliente?.id === clienteId);
    const nombre = cliente.razon_social || cliente.nombre || clienteId;

    // Header
    document.getElementById('perfilClienteNombre').textContent = nombre;
    document.getElementById('perfilClienteInfo').textContent = `${cliente.id} | ${cliente.zona || ''} | Tel: ${cliente.telefono || '-'} | RUC: ${cliente.ruc || '-'}`;

    // WhatsApp button
    const waBtn = document.getElementById('perfilWhatsAppBtn');
    if (cliente.telefono) {
        waBtn.style.display = '';
        waBtn.onclick = () => enviarWhatsAppCliente(cliente.telefono, nombre);
    } else {
        waBtn.style.display = 'none';
    }

    // Botones Editar / Ocultar / Eliminar
    const editarBtn = document.getElementById('perfilClienteEditarBtn');
    if (editarBtn) editarBtn.onclick = () => { cerrarPerfilCliente(); editarCliente(clienteId); };

    const ocultarBtn = document.getElementById('perfilClienteOcultarBtn');
    if (ocultarBtn) {
        ocultarBtn.textContent = cliente.oculto ? 'Mostrar' : 'Ocultar';
        ocultarBtn.className = cliente.oculto
            ? 'bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold'
            : 'bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-bold';
        ocultarBtn.onclick = () => { cerrarPerfilCliente(); toggleOcultarCliente(clienteId); };
    }

    const eliminarBtn = document.getElementById('perfilClienteEliminarBtn');
    if (eliminarBtn) eliminarBtn.onclick = () => { cerrarPerfilCliente(); eliminarCliente(clienteId); };

    // Stats
    const totalComprado = pedidosCliente.reduce((s, p) => s + (p.total || 0), 0);
    const ultimoPedido = pedidosCliente.length > 0 ?
        pedidosCliente.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0] : null;
    const preciosEsp = cliente.precios_personalizados ? Object.keys(cliente.precios_personalizados).length : 0;

    document.getElementById('perfilTotalComprado').textContent = `Gs. ${totalComprado.toLocaleString()}`;
    document.getElementById('perfilTotalPedidos').textContent = pedidosCliente.length;
    document.getElementById('perfilUltimoPedido').textContent = ultimoPedido ? new Date(ultimoPedido.fecha).toLocaleDateString('es-PY') : '-';
    document.getElementById('perfilPreciosEsp').textContent = preciosEsp;

    cambiarTabPerfil('precios');
    document.getElementById('modalPerfilCliente')?.classList.add('show');
}

function cerrarPerfilCliente() {
    document.getElementById('modalPerfilCliente')?.classList.remove('show');
    clientePerfilActual = null;
}

function cambiarTabPerfil(tab) {
    ['precios', 'historial', 'estadisticas'].forEach(t => {
        const el = document.getElementById('perfilTab-' + t);
        const btn = document.getElementById('tabPerfil-' + t);
        if (el) el.style.display = t === tab ? '' : 'none';
        if (btn) {
            btn.className = t === tab
                ? 'px-6 py-3 text-sm font-bold border-b-2 border-gray-800 text-gray-800'
                : 'px-6 py-3 text-sm font-bold border-b-2 border-transparent text-gray-400 hover:text-gray-600';
        }
    });
    if (!clientePerfilActual) return;
    if (tab === 'precios') renderizarPerfilPrecios();
    if (tab === 'historial') renderizarPerfilHistorial();
    if (tab === 'estadisticas') renderizarPerfilEstadisticas();
}

function renderizarPerfilPrecios() {
    const container = document.getElementById('perfilTab-precios');
    const cliente = clientePerfilActual;
    if (!container || !cliente) return;

    let html = '<div class="flex justify-between items-center mb-4"><h4 class="font-bold text-gray-700">Precios Especiales</h4>' +
        `<button onclick="agregarPrecioEspecial()" class="bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold">+ Agregar precio especial</button></div>`;

    const precios = cliente.precios_personalizados || {};
    const keys = Object.keys(precios);
    if (keys.length === 0) {
        html += '<p class="text-gray-400 italic text-sm">Sin precios especiales configurados</p>';
    } else {
        html += '<table class="w-full text-sm"><thead class="bg-gray-50 text-xs text-gray-500 uppercase"><tr><th class="px-4 py-2 text-left">Producto</th><th class="px-4 py-2 text-left">Presentacion</th><th class="px-4 py-2 text-left">Precio Base</th><th class="px-4 py-2 text-left">Precio Especial</th><th class="px-4 py-2">Accion</th></tr></thead><tbody class="divide-y">';
        keys.forEach(prodId => {
            const prod = productosData.productos.find(p => p.id === prodId);
            (precios[prodId] || []).forEach(pe => {
                const pres = prod?.presentaciones.find(p => p.tamano === pe.tamano);
                const precioBase = pres?.precio_base || 0;
                html += `<tr class="hover:bg-gray-50">
                    <td class="px-4 py-2 font-medium">${prod?.nombre || prodId}</td>
                    <td class="px-4 py-2 text-gray-500">${pe.tamano}</td>
                    <td class="px-4 py-2 text-gray-400">Gs. ${precioBase.toLocaleString()}</td>
                    <td class="px-4 py-2 font-bold text-blue-700">Gs. ${(pe.precio || 0).toLocaleString()}</td>
                    <td class="px-4 py-2 text-center"><button onclick="eliminarPrecioEspecial('${prodId}','${pe.tamano}')" class="text-red-500 text-xs font-bold">x</button></td>
                </tr>`;
            });
        });
        html += '</tbody></table>';
    }
    container.innerHTML = html;
}

function agregarPrecioEspecial() {
    if (!clientePerfilActual) return;
    const prodNombre = prompt('Nombre o ID del producto:');
    if (!prodNombre) return;
    const prod = productosData.productos.find(p => p.id === prodNombre || p.nombre.toLowerCase().includes(prodNombre.toLowerCase()));
    if (!prod) { mostrarToast('Producto no encontrado', 'error'); return; }

    let tamano = prod.presentaciones[0]?.tamano;
    if (prod.presentaciones.length > 1) {
        const opciones = prod.presentaciones.map((p, i) => `${i + 1}. ${p.tamano} (Gs. ${p.precio_base.toLocaleString()})`).join('\n');
        const sel = prompt(`Seleccione presentacion:\n${opciones}\n\nNumero:`);
        if (!sel) return;
        const idx = parseInt(sel) - 1;
        if (prod.presentaciones[idx]) tamano = prod.presentaciones[idx].tamano;
    }

    const precioBase = prod.presentaciones.find(p => p.tamano === tamano)?.precio_base || 0;
    const precioStr = prompt(`Precio especial para ${prod.nombre} (${tamano})\nPrecio base: Gs. ${precioBase.toLocaleString()}\n\nNuevo precio:`);
    if (!precioStr) return;
    const precio = parseInt(precioStr);
    if (isNaN(precio) || precio <= 0) { mostrarToast('Precio invalido', 'error'); return; }

    if (!clientePerfilActual.precios_personalizados) clientePerfilActual.precios_personalizados = {};
    if (!clientePerfilActual.precios_personalizados[prod.id]) clientePerfilActual.precios_personalizados[prod.id] = [];
    const existing = clientePerfilActual.precios_personalizados[prod.id].findIndex(p => p.tamano === tamano);
    if (existing >= 0) clientePerfilActual.precios_personalizados[prod.id][existing].precio = precio;
    else clientePerfilActual.precios_personalizados[prod.id].push({ tamano, precio });

    registrarCambio();
    renderizarPerfilPrecios();
}

function eliminarPrecioEspecial(prodId, tamano) {
    if (!clientePerfilActual) return;
    const precios = clientePerfilActual.precios_personalizados;
    if (precios && precios[prodId]) {
        precios[prodId] = precios[prodId].filter(p => p.tamano !== tamano);
        if (precios[prodId].length === 0) delete precios[prodId];
        registrarCambio();
        renderizarPerfilPrecios();
    }
}

function renderizarPerfilHistorial() {
    const container = document.getElementById('perfilTab-historial');
    if (!container || !clientePerfilActual) return;
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedidosCliente = pedidos.filter(p => p.cliente?.id === clientePerfilActual.id)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (pedidosCliente.length === 0) {
        container.innerHTML = '<p class="text-gray-400 italic text-sm">Sin pedidos registrados</p>';
        return;
    }

    container.innerHTML = '<div class="space-y-3">' + pedidosCliente.map(p => {
        const items = (p.items || []).map(i => `${i.nombre} x${i.cantidad}`).join(', ');
        const estadoColor = p.estado === 'entregado' ? 'bg-green-100 text-green-700' :
                            p.estado === 'pagado' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700';
        return `<div class="bg-gray-50 rounded-lg p-3">
            <div class="flex justify-between items-center mb-1">
                <span class="text-xs text-gray-400">${new Date(p.fecha).toLocaleDateString('es-PY')} | ${p.id}</span>
                <span class="text-xs px-2 py-0.5 rounded-full font-bold ${estadoColor}">${p.estado || 'pendiente'}</span>
            </div>
            <p class="text-sm text-gray-600">${items || 'Sin items'}</p>
            <div class="flex justify-between items-center mt-1">
                <span class="text-xs text-gray-400">${p.tipoPago || 'contado'}</span>
                <span class="font-bold text-gray-800">Gs. ${(p.total || 0).toLocaleString()}</span>
            </div>
        </div>`;
    }).join('') + '</div>';
}

function renderizarPerfilEstadisticas() {
    if (!clientePerfilActual) return;
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedidosCliente = pedidos.filter(p => p.cliente?.id === clientePerfilActual.id);
    const hoy = new Date();

    // Top 5 productos
    const conteoProductos = {};
    pedidosCliente.forEach(p => {
        (p.items || []).forEach(item => {
            const key = item.nombre || item.productoId;
            conteoProductos[key] = (conteoProductos[key] || 0) + (item.cantidad || 1);
        });
    });
    const top5 = Object.entries(conteoProductos).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topEl = document.getElementById('perfilTopProductos');
    if (topEl) {
        topEl.innerHTML = top5.length === 0 ? '<p class="text-gray-400 italic text-sm">Sin datos</p>' :
            top5.map((t, i) => `<div class="flex justify-between items-center py-1.5 ${i < 4 ? 'border-b border-gray-100' : ''}">
                <span class="text-sm text-gray-700">${i + 1}. ${t[0]}</span>
                <span class="text-sm font-bold text-gray-800">${t[1]} unid.</span>
            </div>`).join('');
    }

    // Grafico ultimos 6 meses
    const meses = [];
    const montos = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const mesKey = d.toISOString().slice(0, 7);
        const mesNombre = d.toLocaleDateString('es-PY', { month: 'short' });
        const total = pedidosCliente.filter(p => p.fecha && p.fecha.startsWith(mesKey))
            .reduce((s, p) => s + (p.total || 0), 0);
        meses.push(mesNombre);
        montos.push(total);
    }

    const canvas = document.getElementById('chartPerfilCliente');
    if (canvas && typeof Chart !== 'undefined') {
        if (chartPerfilClienteInstance) chartPerfilClienteInstance.destroy();
        chartPerfilClienteInstance = new Chart(canvas, {
            type: 'bar',
            data: { labels: meses, datasets: [{ label: 'Compras (Gs.)', data: montos, backgroundColor: '#3b82f6', borderRadius: 6 }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => 'Gs.' + (v/1000) + 'k' } } } }
        });
    }

    // Desglose por periodo
    const desglose = document.getElementById('perfilDesglosePeriodo');
    if (desglose) {
        const mesActual = hoy.toISOString().slice(0, 7);
        const totalMes = pedidosCliente.filter(p => p.fecha?.startsWith(mesActual)).reduce((s, p) => s + (p.total || 0), 0);
        const hace6m = new Date(hoy); hace6m.setMonth(hace6m.getMonth() - 6);
        const total6m = pedidosCliente.filter(p => new Date(p.fecha) >= hace6m).reduce((s, p) => s + (p.total || 0), 0);
        const hace1a = new Date(hoy); hace1a.setFullYear(hace1a.getFullYear() - 1);
        const total1a = pedidosCliente.filter(p => new Date(p.fecha) >= hace1a).reduce((s, p) => s + (p.total || 0), 0);
        desglose.innerHTML = `
            <div class="bg-blue-50 rounded-lg p-3 text-center"><p class="text-xs text-blue-600 font-bold">ESTE MES</p><p class="text-lg font-bold text-blue-800">Gs. ${totalMes.toLocaleString()}</p></div>
            <div class="bg-green-50 rounded-lg p-3 text-center"><p class="text-xs text-green-600 font-bold">ULTIMOS 6 MESES</p><p class="text-lg font-bold text-green-800">Gs. ${total6m.toLocaleString()}</p></div>
            <div class="bg-purple-50 rounded-lg p-3 text-center"><p class="text-xs text-purple-600 font-bold">ULTIMO ANO</p><p class="text-lg font-bold text-purple-800">Gs. ${total1a.toLocaleString()}</p></div>`;
    }
}

// ============================================
// HERRAMIENTAS
// ============================================
function crearBackup() {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const backup = {
        tipo: 'backup_admin_completo',
        fecha: new Date().toISOString(),
        version: '3.0',
        datos: { productos: productosData, pedidos },
        resumen: {
            totalProductos: productosData.productos?.length || 0,
            totalClientes: productosData.clientes?.length || 0,
            totalPedidos: pedidos.length,
            totalGuaranies: pedidos.reduce((s, p) => s + (p.total || 0), 0)
        }
    };
    const fecha = new Date().toISOString().split('T')[0];
    descargarJSON(backup, `hdv_backup_completo_${fecha}.json`);
    localStorage.setItem('hdv_admin_ultimo_backup', new Date().toISOString());
    actualizarInfoBackupAdmin();
}

function crearBackupSoloProductos() {
    const backup = {
        tipo: 'backup_catalogo',
        fecha: new Date().toISOString(),
        version: '3.0',
        datos: {
            categorias: productosData.categorias,
            productos: productosData.productos,
            clientes: productosData.clientes
        }
    };
    descargarJSON(backup, `hdv_catalogo_${new Date().toISOString().split('T')[0]}.json`);
}

function crearBackupSoloPedidos() {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    if (pedidos.length === 0) { mostrarToast('No hay pedidos', 'error'); return; }
    const backup = {
        tipo: 'backup_pedidos',
        fecha: new Date().toISOString(),
        version: '3.0',
        pedidos
    };
    descargarJSON(backup, `hdv_pedidos_${new Date().toISOString().split('T')[0]}.json`);
}

async function restaurarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!await mostrarConfirmModal('¿Reemplazar todos los datos actuales con el backup?', { destructivo: true, textoConfirmar: 'Restaurar' })) { event.target.value = ''; return; }

    // Auto-backup antes de restaurar
    crearAutoBackupAdmin('Pre-restauracion');

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const backup = JSON.parse(e.target.result);

            if (backup.tipo === 'backup_admin_completo' && backup.datos) {
                productosData = backup.datos.productos;
                if (backup.datos.pedidos) localStorage.setItem('hdv_pedidos', JSON.stringify(backup.datos.pedidos));
                productosDataOriginal = JSON.parse(JSON.stringify(productosData));
                mostrarToast(`Backup completo restaurado. ${backup.resumen?.totalProductos || '?'} productos, ${backup.resumen?.totalPedidos || '?'} pedidos`, 'success');
                setTimeout(() => location.reload(), 1000);
            } else if (backup.tipo === 'backup_catalogo' && backup.datos) {
                productosData.categorias = backup.datos.categorias || productosData.categorias;
                productosData.productos = backup.datos.productos || productosData.productos;
                productosData.clientes = backup.datos.clientes || productosData.clientes;
                productosDataOriginal = JSON.parse(JSON.stringify(productosData));
                mostrarToast('Catalogo restaurado.', 'success');
                setTimeout(() => location.reload(), 1000);
            } else if (backup.tipo === 'backup_pedidos' && backup.pedidos) {
                localStorage.setItem('hdv_pedidos', JSON.stringify(backup.pedidos));
                mostrarToast(`${backup.pedidos.length} pedidos restaurados.`, 'success');
                cargarPedidos();
            } else if (backup.tipo === 'backup_vendedor_completo' && backup.datos?.pedidos) {
                localStorage.setItem('hdv_pedidos', JSON.stringify(backup.datos.pedidos));
                mostrarToast(`Pedidos del vendedor restaurados: ${backup.datos.pedidos.length}`, 'success');
                cargarPedidos();
            } else if (backup.datos) {
                productosData = backup.datos.productos;
                if (backup.datos.pedidos) localStorage.setItem('hdv_pedidos', JSON.stringify(backup.datos.pedidos));
                productosDataOriginal = JSON.parse(JSON.stringify(productosData));
                mostrarToast('Backup restaurado (formato anterior).', 'success');
                setTimeout(() => location.reload(), 1000);
            } else {
                mostrarToast('Formato de backup no reconocido', 'error');
            }
        } catch (err) { mostrarToast('Error: archivo invalido', 'error'); }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// ============================================
// AUTO-BACKUP ADMIN
// ============================================
function toggleAdminAutoBackup() {
    const toggle = document.getElementById('adminAutoBackupToggle');
    localStorage.setItem('hdv_admin_auto_backup', toggle?.checked ? 'true' : 'false');
}

function crearAutoBackupAdmin(motivo) {
    const enabled = localStorage.getItem('hdv_admin_auto_backup') !== 'false';
    if (!enabled) return;

    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const backup = {
        motivo: motivo || 'Auto-backup',
        fecha: new Date().toISOString(),
        datos: { productos: JSON.parse(JSON.stringify(productosData)), pedidos },
        resumen: {
            totalProductos: productosData.productos?.length || 0,
            totalClientes: productosData.clientes?.length || 0,
            totalPedidos: pedidos.length
        }
    };

    let historial = JSON.parse(localStorage.getItem('hdv_admin_auto_backups') || '[]');
    historial.unshift(backup);
    if (historial.length > 5) historial = historial.slice(0, 5);

    try {
        localStorage.setItem('hdv_admin_auto_backups', JSON.stringify(historial));
    } catch (e) {
        console.warn('Auto-backup admin: espacio insuficiente');
        historial = historial.slice(0, 2);
        localStorage.setItem('hdv_admin_auto_backups', JSON.stringify(historial));
    }
}

function actualizarInfoBackupAdmin() {
    const ultimo = localStorage.getItem('hdv_admin_ultimo_backup');
    const el = document.getElementById('adminUltimoBackup');
    if (el) el.textContent = ultimo ? `Ultimo: ${new Date(ultimo).toLocaleString('es-PY')}` : 'Sin backups';

    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    setEl('adminBackupProductos', productosData.productos?.length || 0);
    setEl('adminBackupClientes', productosData.clientes?.length || 0);
    setEl('adminBackupPedidos', pedidos.length);

    mostrarHistorialBackupsAdmin();
}

function mostrarHistorialBackupsAdmin() {
    const container = document.getElementById('adminHistorialBackups');
    if (!container) return;

    const historial = JSON.parse(localStorage.getItem('hdv_admin_auto_backups') || '[]');
    if (historial.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 italic">Sin auto-backups</p>';
        return;
    }

    container.innerHTML = '';
    historial.forEach((b, idx) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-50 rounded-lg p-3 hover:bg-gray-100';
        div.innerHTML = `
            <div>
                <p class="text-sm font-medium text-gray-700">${b.motivo || 'Auto-backup'}</p>
                <p class="text-xs text-gray-500">${new Date(b.fecha).toLocaleString('es-PY')} - ${b.resumen?.totalProductos || '?'} prod, ${b.resumen?.totalPedidos || '?'} ped</p>
            </div>
            <div class="flex gap-2">
                <button onclick="restaurarAutoBackupAdmin(${idx})" class="text-xs text-blue-600 font-bold px-3 py-1 bg-blue-50 rounded hover:bg-blue-100">Restaurar</button>
                <button onclick="descargarAutoBackupAdmin(${idx})" class="text-xs text-green-600 font-bold px-3 py-1 bg-green-50 rounded hover:bg-green-100">Descargar</button>
            </div>
        `;
        container.appendChild(div);
    });
}

async function restaurarAutoBackupAdmin(idx) {
    if (!await mostrarConfirmModal('¿Restaurar este auto-backup? Los datos actuales seran reemplazados.', { destructivo: true, textoConfirmar: 'Restaurar' })) return;
    const historial = JSON.parse(localStorage.getItem('hdv_admin_auto_backups') || '[]');
    if (historial[idx]?.datos) {
        productosData = historial[idx].datos.productos;
        if (historial[idx].datos.pedidos) localStorage.setItem('hdv_pedidos', JSON.stringify(historial[idx].datos.pedidos));
        productosDataOriginal = JSON.parse(JSON.stringify(productosData));
        mostrarToast('Auto-backup restaurado. Recargando...', 'success');
        setTimeout(() => location.reload(), 1000);
    }
}

function descargarAutoBackupAdmin(idx) {
    const historial = JSON.parse(localStorage.getItem('hdv_admin_auto_backups') || '[]');
    if (historial[idx]) {
        descargarJSON(historial[idx], `hdv_autobackup_${new Date(historial[idx].fecha).toISOString().split('T')[0]}.json`);
    }
}

function importarProductosExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const lines = e.target.result.split('\n').filter(l => l.trim());
            if (lines.length < 2) { mostrarToast('Archivo vacio o sin datos', 'error'); return; }
            
            let agregados = 0;
            const ultimoId = Math.max(...productosData.productos.map(p => parseInt(p.id.replace('P', '')) || 0), 0);
            
            lines.slice(1).forEach((line, i) => {
                const cols = line.split(/[,;|\t]/).map(c => c.trim().replace(/^"|"$/g, ''));
                if (cols.length < 2) return;
                const [nombre, categoria, subcategoria, presentacion, precio] = cols;
                if (!nombre) return;
                
                const nuevoId = `P${String(ultimoId + agregados + 1).padStart(3, '0')}`;
                productosData.productos.push({
                    id: nuevoId, nombre, categoria: categoria || 'cuidado_personal',
                    subcategoria: subcategoria || 'General',
                    presentaciones: [{ tamano: presentacion || 'Unidad', precio_base: parseInt(precio) || 0 }]
                });
                agregados++;
            });
            
            if (agregados > 0) {
                productosFiltrados = [...productosData.productos];
                for (let i = 0; i < agregados; i++) registrarCambio();
                mostrarProductosGestion();
                mostrarToast(`${agregados} productos importados. Guarda para aplicar.`, 'success');
            }
        } catch (err) { mostrarToast('Error al importar: ' + err.message, 'error'); }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function importarClientesExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const lines = e.target.result.split('\n').filter(l => l.trim());
            if (lines.length < 2) { mostrarToast('Archivo vacio', 'error'); return; }
            
            let agregados = 0;
            const ultimoId = Math.max(...productosData.clientes.map(c => parseInt(c.id.replace('C', '')) || 0), 0);
            
            lines.slice(1).forEach((line, i) => {
                const cols = line.split(/[,;|\t]/).map(c => c.trim().replace(/^"|"$/g, ''));
                if (cols.length < 1) return;
                const [razon, ruc, telefono, direccion, encargado] = cols;
                if (!razon) return;
                
                const nuevoId = `C${String(ultimoId + agregados + 1).padStart(3, '0')}`;
                productosData.clientes.push({
                    id: nuevoId, nombre: razon, razon_social: razon, ruc: ruc || '',
                    telefono: telefono || '', direccion: direccion || '', zona: direccion || '',
                    encargado: encargado || '', tipo: 'mayorista_estandar', precios_personalizados: {}
                });
                agregados++;
            });
            
            if (agregados > 0) {
                clientesFiltrados = [...productosData.clientes];
                for (let i = 0; i < agregados; i++) registrarCambio();
                mostrarClientesGestion();
                mostrarToast(`${agregados} clientes importados. Guarda para aplicar.`, 'success');
            }
        } catch (err) { mostrarToast('Error al importar: ' + err.message, 'error'); }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function descargarPlantillaProductos() {
    const plantilla = {
        _instrucciones: "Completa el array 'productos' con tus productos. Campos requeridos: id, nombre, categoria. Presenta un array de presentaciones con tamano y precio_base.",
        _categorias_disponibles: (productosData.categorias || []).map(c => ({ id: c.id, nombre: c.nombre, subcategorias: c.subcategorias || [] })),
        productos: [
            {
                id: "P999",
                nombre: "Nombre del Producto",
                categoria: "categoria_id",
                subcategoria: "Subcategoria (opcional)",
                estado: "disponible",
                imagen: "URL de imagen (opcional)",
                presentaciones: [
                    { tamano: "1L", precio_base: 10000, costo: 7000, stock: 0 },
                    { tamano: "500ml", precio_base: 6000, costo: 4000, stock: 0 }
                ]
            }
        ]
    };
    descargarJSON(plantilla, 'plantilla_productos.json');
}

function descargarPlantillaClientes() {
    const zonas = [...new Set((productosData.clientes || []).map(c => c.zona).filter(Boolean))];
    const plantilla = {
        _instrucciones: "Completa el array 'clientes'. Campos requeridos: nombre/razon_social. Los campos marcados como opcional pueden omitirse.",
        _zonas_existentes: zonas,
        clientes: [
            {
                id: "C999",
                nombre: "Nombre del Cliente",
                razon_social: "Nombre o Razon Social (igual que nombre si es persona)",
                ruc: "80012345-6 (opcional)",
                telefono: "0981234567 (opcional)",
                direccion: "Direccion completa (opcional)",
                zona: "Nombre de la zona",
                encargado: "Nombre del encargado (opcional)"
            }
        ]
    };
    descargarJSON(plantilla, 'plantilla_clientes.json');
}

async function limpiarPedidos() {
    if (!await mostrarConfirmModal('¿ELIMINAR TODOS LOS PEDIDOS? Esto no se puede deshacer.', { destructivo: true, textoConfirmar: 'Eliminar Todo' })) return;
    if (!await mostrarConfirmModal('¿Estas seguro? Todos los datos de pedidos se perderan.', { destructivo: true, textoConfirmar: 'Si, eliminar' })) return;
    crearAutoBackupAdmin('Pre-limpieza de pedidos');
    localStorage.removeItem('hdv_pedidos');
    todosLosPedidos = [];
    mostrarToast('Pedidos eliminados. Se guardo un auto-backup por seguridad.', 'success');
    cargarPedidos();
}

// ============================================
// UTILIDADES
// ============================================
function descargarJSON(data, nombreArchivo) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nombreArchivo;
    link.click();
}

function descargarCSV(contenido, nombreArchivo) {
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nombreArchivo;
    link.click();
}

// ============================================
// EDICION DE PEDIDOS, PDF, DASHBOARD, REPORTES
// ============================================
// ===== 1. EDIT PEDIDO FUNCTIONS =====

let pedidoEditandoId = null;

function abrirModalEditarPedido(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === pedidoId);
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }
    pedidoEditandoId = pedidoId;

    document.getElementById('editPedidoId').textContent = pedidoId;
    document.getElementById('editPedidoCliente').textContent = pedido.cliente?.nombre || 'N/A';
    document.getElementById('editPedidoTipoPago').value = pedido.tipoPago || 'contado';
    document.getElementById('editPedidoDescuento').value = pedido.descuento || 0;
    document.getElementById('editPedidoNotas').value = pedido.notas || '';
    
    renderizarItemsEdicion(pedido.items || []);
    recalcularTotalEdicion();
    document.getElementById('modalEditarPedido')?.classList.add('show');
}

function cerrarModalEditarPedido() {
    pedidoEditandoId = null;
    document.getElementById('modalEditarPedido')?.classList.remove('show');
}

function renderizarItemsEdicion(items) {
    const container = document.getElementById('editPedidoItems');
    container.innerHTML = '';
    items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2 bg-gray-50 p-3 rounded-lg';
        div.innerHTML = `
            <select onchange="actualizarItemEdicion(${idx},'producto',this.value);recalcularTotalEdicion()" class="flex-1 border border-gray-300 rounded px-2 py-1 text-sm edit-item-producto">
                <option value="">-- Producto --</option>
                ${productosData.productos.map(p => 
                    p.presentaciones.map(pres => 
                        `<option value="${p.id}|${pres.tamano}|${pres.precio_base}" ${p.nombre === item.nombre && pres.tamano === item.presentacion ? 'selected' : ''}>${p.nombre} - ${pres.tamano} (Gs.${pres.precio_base.toLocaleString()})</option>`
                    ).join('')
                ).join('')}
            </select>
            <input type="number" value="${item.cantidad}" min="1" onchange="actualizarItemEdicion(${idx},'cantidad',this.value);recalcularTotalEdicion()" class="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center font-bold edit-item-cantidad">
            <span class="text-sm font-bold text-gray-700 w-32 text-right edit-item-subtotal">Gs. ${(item.subtotal || 0).toLocaleString()}</span>
            <button onclick="eliminarItemEdicion(${idx})" class="text-red-500 font-bold text-lg">×</button>
        `;
        container.appendChild(div);
    });
}

function actualizarItemEdicion(idx, campo, valor) {
    // This gets called when editing items, will be processed in guardarEdicionPedido
}

function agregarItemEditPedido() {
    const container = document.getElementById('editPedidoItems');
    const idx = container.children.length;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 bg-green-50 p-3 rounded-lg';
    div.innerHTML = `
        <select onchange="recalcularTotalEdicion()" class="flex-1 border border-gray-300 rounded px-2 py-1 text-sm edit-item-producto">
            <option value="">-- Seleccionar Producto --</option>
            ${productosData.productos.map(p => 
                p.presentaciones.map(pres => 
                    `<option value="${p.id}|${pres.tamano}|${pres.precio_base}">${p.nombre} - ${pres.tamano} (Gs.${pres.precio_base.toLocaleString()})</option>`
                ).join('')
            ).join('')}
        </select>
        <input type="number" value="1" min="1" onchange="recalcularTotalEdicion()" class="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center font-bold edit-item-cantidad">
        <span class="text-sm font-bold text-gray-700 w-32 text-right edit-item-subtotal">Gs. 0</span>
        <button onclick="this.parentElement.remove();recalcularTotalEdicion()" class="text-red-500 font-bold text-lg">×</button>
    `;
    container.appendChild(div);
}

function eliminarItemEdicion(idx) {
    const container = document.getElementById('editPedidoItems');
    if (container.children.length <= 1) { mostrarToast('Debe haber al menos un producto', 'error'); return; }
    container.children[idx].remove();
    recalcularTotalEdicion();
}

function recalcularTotalEdicion() {
    const container = document.getElementById('editPedidoItems');
    let subtotal = 0;
    Array.from(container.children).forEach(div => {
        const select = div.querySelector('.edit-item-producto');
        const cantInput = div.querySelector('.edit-item-cantidad');
        const subtotalSpan = div.querySelector('.edit-item-subtotal');
        if (select && select.value && cantInput) {
            const parts = select.value.split('|');
            const precio = parseInt(parts[2]) || 0;
            const cant = parseInt(cantInput.value) || 1;
            const sub = precio * cant;
            subtotal += sub;
            if (subtotalSpan) subtotalSpan.textContent = `Gs. ${sub.toLocaleString()}`;
        }
    });
    const desc = parseFloat(document.getElementById('editPedidoDescuento')?.value) || 0;
    const total = Math.round(subtotal * (1 - desc / 100));
    document.getElementById('editPedidoTotal').textContent = `Gs. ${total.toLocaleString()}`;
}

function guardarEdicionPedido() {
    if (!pedidoEditandoId) return;
    const container = document.getElementById('editPedidoItems');
    const items = [];
    Array.from(container.children).forEach(div => {
        const select = div.querySelector('.edit-item-producto');
        const cantInput = div.querySelector('.edit-item-cantidad');
        if (select && select.value) {
            const parts = select.value.split('|');
            const prodId = parts[0];
            const tamano = parts[1];
            const precio = parseInt(parts[2]) || 0;
            const cantidad = parseInt(cantInput.value) || 1;
            const prod = productosData.productos.find(p => p.id === prodId);
            items.push({
                productoId: prodId,
                nombre: prod?.nombre || 'Producto',
                presentacion: tamano,
                precio,
                cantidad,
                subtotal: precio * cantidad
            });
        }
    });
    if (items.length === 0) { mostrarToast('Agrega al menos un producto', 'error'); return; }
    
    const descuento = parseFloat(document.getElementById('editPedidoDescuento')?.value) || 0;
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const total = Math.round(subtotal * (1 - descuento / 100));
    
    // Update in localStorage
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const idx = pedidos.findIndex(p => p.id === pedidoEditandoId);
    if (idx >= 0) {
        pedidos[idx].items = items;
        pedidos[idx].subtotal = subtotal;
        pedidos[idx].descuento = descuento;
        pedidos[idx].total = total;
        pedidos[idx].tipoPago = document.getElementById('editPedidoTipoPago')?.value || 'contado';
        pedidos[idx].notas = document.getElementById('editPedidoNotas')?.value.trim() || '';
        pedidos[idx].editado = true;
        pedidos[idx].fechaEdicion = new Date().toISOString();
        localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
        
        // Sync with Firebase
        if (typeof guardarPedidoFirebase === 'function') {
            guardarPedidoFirebase(pedidos[idx]);
        }
    }
    
    cerrarModalEditarPedido();
    if (typeof cargarPedidos === 'function' && !unsubscribePedidos) cargarPedidos();
    else aplicarFiltrosPedidos();
}


// ===== 2. PDF GENERATION (A4 Remission Note) =====

function generarPDFRemision(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === (pedidoId || pedidoEditandoId));
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    
    // Header
    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('HDV Distribuciones', 15, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('EAS - Nota de Remision', 15, 26);
    
    // Pedido info right
    doc.setFontSize(10);
    doc.text(`N°: ${pedido.id}`, 195, 14, { align: 'right' });
    doc.text(`Fecha: ${new Date(pedido.fecha).toLocaleDateString('es-PY')}`, 195, 20, { align: 'right' });
    doc.text(`Estado: ${(pedido.estado || 'pendiente').toUpperCase()}`, 195, 26, { align: 'right' });
    
    // Client info
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(249, 250, 251);
    doc.rect(10, 42, 190, 28, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL CLIENTE', 15, 50);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Razon Social: ${pedido.cliente?.nombre || 'N/A'}`, 15, 57);
    doc.text(`RUC: ${clienteInfo?.ruc || 'N/A'}`, 110, 57);
    doc.text(`Direccion: ${clienteInfo?.direccion || clienteInfo?.zona || 'N/A'}`, 15, 63);
    doc.text(`Tel: ${clienteInfo?.telefono || 'N/A'}`, 110, 63);
    
    // Table header
    let y = 80;
    doc.setFillColor(17, 24, 39);
    doc.rect(10, y - 6, 190, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('PRODUCTO', 15, y);
    doc.text('PRESENTACION', 80, y);
    doc.text('CANT.', 125, y);
    doc.text('P. UNIT.', 145, y);
    doc.text('SUBTOTAL', 175, y, { align: 'right' });
    
    // Table rows
    y += 10;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    (pedido.items || []).forEach((item, i) => {
        if (i % 2 === 0) {
            doc.setFillColor(249, 250, 251);
            doc.rect(10, y - 5, 190, 8, 'F');
        }
        doc.setFontSize(9);
        doc.text(item.nombre || '', 15, y);
        doc.text(item.presentacion || '', 80, y);
        doc.text(String(item.cantidad || 0), 130, y);
        doc.text(`Gs. ${(item.precio || 0).toLocaleString()}`, 145, y);
        doc.setFont('helvetica', 'bold');
        doc.text(`Gs. ${(item.subtotal || 0).toLocaleString()}`, 195, y, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        y += 8;
    });
    
    // Totals
    y += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(120, y, 200, y);
    y += 8;
    doc.setFontSize(9);
    doc.text('Subtotal:', 140, y);
    doc.text(`Gs. ${(pedido.subtotal || 0).toLocaleString()}`, 195, y, { align: 'right' });
    if (pedido.descuento > 0) {
        y += 7;
        doc.text(`Descuento (${pedido.descuento}%):`, 140, y);
        doc.text(`-Gs. ${Math.round((pedido.subtotal || 0) * pedido.descuento / 100).toLocaleString()}`, 195, y, { align: 'right' });
    }
    y += 7;
    doc.setFillColor(17, 24, 39);
    doc.rect(130, y - 5, 70, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 135, y + 1);
    doc.text(`Gs. ${(pedido.total || 0).toLocaleString()}`, 195, y + 1, { align: 'right' });
    
    // Footer
    y += 20;
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Tipo de pago: ${pedido.tipoPago || 'contado'}`, 15, y);
    if (pedido.notas) doc.text(`Notas: ${pedido.notas}`, 15, y + 5);
    
    y = 270;
    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, 80, y);
    doc.line(130, y, 195, y);
    doc.setFontSize(7);
    doc.text('Firma del Cliente', 35, y + 5);
    doc.text('Firma del Vendedor', 150, y + 5);
    
    doc.setTextColor(180, 180, 180);
    doc.text('HDV Distribuciones EAS - Documento generado automaticamente', 105, 290, { align: 'center' });
    
    doc.save(`remision_${pedido.id}_${pedido.cliente?.nombre || 'cliente'}.pdf`);
}


// ===== 3. THERMAL TICKET =====

function generarTicketTermico(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === (pedidoId || pedidoEditandoId));
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }

    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);

    const ticketHTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
    @page { margin: 0; size: 80mm auto; }
    body { font-family: 'Courier New', monospace; width: 72mm; margin: 4mm; font-size: 11px; color: #000; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 4px 0; }
    .right { text-align: right; }
    .row { display: flex; justify-content: space-between; }
    .big { font-size: 16px; }
    .small { font-size: 9px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    .total-row { font-size: 14px; font-weight: bold; }
</style></head><body>
<div class="center bold big">HDV DISTRIBUCIONES</div>
<div class="center small">EAS - Nota de Remision</div>
<div class="line"></div>
<div class="row"><span>N°: ${pedido.id}</span></div>
<div class="row"><span>Fecha: ${new Date(pedido.fecha).toLocaleDateString('es-PY')}</span></div>
<div class="row"><span>Hora: ${new Date(pedido.fecha).toLocaleTimeString('es-PY')}</span></div>
<div class="line"></div>
<div class="bold">Cliente: ${pedido.cliente?.nombre || 'N/A'}</div>
<div>RUC: ${clienteInfo?.ruc || 'N/A'}</div>
<div>Dir: ${clienteInfo?.direccion || clienteInfo?.zona || ''}</div>
<div class="line"></div>
<table>
${(pedido.items || []).map(i => `<tr>
    <td>${i.nombre}<br><span class="small">${i.presentacion} x${i.cantidad}</span></td>
    <td class="right bold">Gs.${(i.subtotal || 0).toLocaleString()}</td>
</tr>`).join('')}
</table>
<div class="line"></div>
<div class="row"><span>Subtotal:</span><span>Gs. ${(pedido.subtotal || 0).toLocaleString()}</span></div>
${pedido.descuento > 0 ? `<div class="row"><span>Desc. ${pedido.descuento}%:</span><span>-Gs. ${Math.round((pedido.subtotal||0)*pedido.descuento/100).toLocaleString()}</span></div>` : ''}
<div class="line"></div>
<div class="row total-row"><span>TOTAL:</span><span>Gs. ${(pedido.total || 0).toLocaleString()}</span></div>
<div class="line"></div>
<div class="row"><span>Pago: ${pedido.tipoPago || 'contado'}</span><span>Estado: ${(pedido.estado||'pendiente').toUpperCase()}</span></div>
${pedido.notas ? `<div class="small">Notas: ${pedido.notas}</div>` : ''}
<div class="line"></div>
<div class="center small">Gracias por su compra</div>
<div class="center small">HDV Distribuciones EAS</div>
<div style="margin-bottom:10mm"></div>
</body></html>`;

    const printFrame = document.getElementById('printFrame');
    printFrame.srcdoc = ticketHTML;
    printFrame.onload = () => {
        printFrame.contentWindow.print();
    };
}


// ===== 4. DASHBOARD FUNCTIONS =====

let chartVentas7d = null;
let chartTopProd = null;

// ============================================
// CALCULO DE GANANCIA NETA
// ============================================
function calcularGananciaPedido(pedido) {
    let costoTotal = 0;
    let ventaTotal = pedido.total || 0;
    let itemsConCosto = 0;
    let itemsTotales = 0;

    (pedido.items || []).forEach(item => {
        itemsTotales++;
        const producto = (productosData.productos || []).find(p => p.id === item.productoId);
        if (!producto) return;
        const pres = (producto.presentaciones || []).find(pr => pr.tamano === item.presentacion);
        if (!pres) return;
        const costo = pres.costo || 0;
        if (costo > 0) {
            costoTotal += costo * (item.cantidad || 1);
            itemsConCosto++;
        }
    });

    const gananciaTotal = ventaTotal - costoTotal;
    const margenPromedio = ventaTotal > 0 ? Math.round((gananciaTotal / ventaTotal) * 100) : 0;

    return { costoTotal, gananciaTotal, margenPromedio, itemsConCosto, itemsTotales };
}

function calcularGananciaPedidos(pedidos) {
    let costoTotal = 0;
    let ventaTotal = 0;
    let itemsConCosto = 0;
    let itemsTotales = 0;

    pedidos.forEach(p => {
        ventaTotal += p.total || 0;
        const g = calcularGananciaPedido(p);
        costoTotal += g.costoTotal;
        itemsConCosto += g.itemsConCosto;
        itemsTotales += g.itemsTotales;
    });

    const gananciaTotal = ventaTotal - costoTotal;
    const margenPromedio = ventaTotal > 0 ? Math.round((gananciaTotal / ventaTotal) * 100) : 0;

    return { costoTotal, ventaTotal, gananciaTotal, margenPromedio, itemsConCosto, itemsTotales };
}

function cargarDashboard() {
    const pedidos = todosLosPedidos;
    const hoy = new Date();

    // Stats del mes
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const pedidosMes = pedidos.filter(p => new Date(p.fecha) >= inicioMes);
    const ventasMes = pedidosMes.reduce((s, p) => s + (p.total || 0), 0);
    const clientesActivosMes = new Set(pedidosMes.map(p => p.cliente?.id)).size;
    const ticketPromedio = pedidosMes.length > 0 ? Math.round(ventasMes / pedidosMes.length) : 0;

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('dashVentasMes', `Gs. ${ventasMes.toLocaleString()}`);
    el('dashPedidosMes', pedidosMes.length);
    el('dashClientesActivos', clientesActivosMes);
    el('dashTicketPromedio', `Gs. ${ticketPromedio.toLocaleString()}`);

    // Ganancia Neta del Mes
    const gananciaMes = calcularGananciaPedidos(pedidosMes);
    el('dashGananciaNeta', `Gs. ${gananciaMes.gananciaTotal.toLocaleString()}`);
    el('dashCostoTotal', `Gs. ${gananciaMes.costoTotal.toLocaleString()}`);

    const elMargen = document.getElementById('dashMargenPromedio');
    if (elMargen) {
        elMargen.textContent = gananciaMes.margenPromedio + '%';
        elMargen.className = 'text-2xl font-bold mt-1 ' + (
            gananciaMes.margenPromedio > 30 ? 'text-green-700' :
            gananciaMes.margenPromedio > 15 ? 'text-yellow-700' : 'text-red-700'
        );
    }

    const elDetalle = document.getElementById('dashGananciaDetalle');
    if (elDetalle) {
        if (gananciaMes.itemsConCosto === 0) {
            elDetalle.textContent = 'Define costos en productos para ver ganancia real';
        } else {
            elDetalle.textContent = `${gananciaMes.itemsConCosto}/${gananciaMes.itemsTotales} items con costo definido`;
        }
    }
    const elMargenDet = document.getElementById('dashMargenDetalle');
    if (elMargenDet) {
        elMargenDet.textContent = gananciaMes.costoTotal > 0
            ? `Ventas Gs. ${ventasMes.toLocaleString()} - Costos Gs. ${gananciaMes.costoTotal.toLocaleString()}`
            : 'Sin costos definidos aun';
    }
    const elCostoDet = document.getElementById('dashCostoDetalle');
    if (elCostoDet) {
        elCostoDet.textContent = gananciaMes.costoTotal > 0
            ? `${pedidosMes.length} pedidos este mes`
            : 'Agrega costos a tus productos';
    }

    // Chart: ventas ultimos 7 dias (ahora con ganancia)
    const labels7d = [];
    const datos7d = [];
    const ganancia7d = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(hoy);
        d.setDate(d.getDate() - i);
        const fechaStr = d.toISOString().split('T')[0];
        const diaNombre = d.toLocaleDateString('es-PY', { weekday: 'short' });
        labels7d.push(diaNombre);
        const pedidosDia = pedidos.filter(p => new Date(p.fecha).toISOString().split('T')[0] === fechaStr);
        const ventasDia = pedidosDia.reduce((s, p) => s + (p.total || 0), 0);
        datos7d.push(ventasDia);
        const gDia = calcularGananciaPedidos(pedidosDia);
        ganancia7d.push(gDia.gananciaTotal);
    }

    const ctx7d = document.getElementById('chartVentas7Dias');
    if (ctx7d) {
        if (chartVentas7d) chartVentas7d.destroy();
        chartVentas7d = new Chart(ctx7d, {
            type: 'bar',
            data: {
                labels: labels7d,
                datasets: [
                    {
                        label: 'Ventas (Gs.)',
                        data: datos7d,
                        backgroundColor: 'rgba(17, 24, 39, 0.8)',
                        borderRadius: 8,
                        borderSkipped: false
                    },
                    {
                        label: 'Ganancia (Gs.)',
                        data: ganancia7d,
                        backgroundColor: 'rgba(34, 197, 94, 0.7)',
                        borderRadius: 8,
                        borderSkipped: false
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: true, position: 'top' } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => 'Gs.' + (v/1000).toFixed(0) + 'k' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }
    
    // Chart: top 5 productos del mes
    const prodCount = {};
    pedidosMes.forEach(p => {
        (p.items || []).forEach(i => {
            const key = i.nombre || 'N/A';
            prodCount[key] = (prodCount[key] || 0) + (i.cantidad || 1);
        });
    });
    const top5 = Object.entries(prodCount).sort((a,b) => b[1]-a[1]).slice(0, 5);
    const colores = ['#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db'];
    
    const ctxTop = document.getElementById('chartTopProductos');
    if (ctxTop) {
        if (chartTopProd) chartTopProd.destroy();
        chartTopProd = new Chart(ctxTop, {
            type: 'doughnut',
            data: {
                labels: top5.map(t => t[0]),
                datasets: [{
                    data: top5.map(t => t[1]),
                    backgroundColor: colores,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }
            }
        });
    }
    
    // Ranking clientes semana
    const hace7d = new Date(hoy.getTime() - 7*24*60*60*1000);
    const pedidosSemana = pedidos.filter(p => new Date(p.fecha) >= hace7d);
    const clienteRanking = {};
    pedidosSemana.forEach(p => {
        const nombre = p.cliente?.nombre || 'N/A';
        if (!clienteRanking[nombre]) clienteRanking[nombre] = { total: 0, pedidos: 0 };
        clienteRanking[nombre].total += p.total || 0;
        clienteRanking[nombre].pedidos++;
    });
    
    const rankDiv = document.getElementById('rankingClientes');
    if (rankDiv) {
        const sorted = Object.entries(clienteRanking).sort((a,b) => b[1].total - a[1].total).slice(0, 10);
        if (sorted.length === 0) {
            rankDiv.innerHTML = '<p class="text-gray-400 text-sm italic">Sin pedidos esta semana</p>';
        } else {
            const maxTotal = sorted[0][1].total;
            rankDiv.innerHTML = sorted.map(([nombre, data], i) => {
                const pct = maxTotal > 0 ? (data.total / maxTotal * 100) : 0;
                const medallas = ['#1','#2','#3'];
                const medal = i < 3 ? medallas[i] : `<span class="text-gray-400 text-xs">#${i+1}</span>`;
                return `<div class="flex items-center gap-3">
                    <span class="text-xl w-8 text-center">${medal}</span>
                    <div class="flex-1">
                        <div class="flex justify-between mb-1">
                            <span class="text-sm font-bold text-gray-800">${nombre}</span>
                            <span class="text-sm font-bold text-gray-600">Gs. ${data.total.toLocaleString()} (${data.pedidos})</span>
                        </div>
                        <div class="w-full bg-gray-100 rounded-full h-2"><div class="bg-gray-800 h-2 rounded-full" style="width:${pct}%"></div></div>
                    </div>
                </div>`;
            }).join('');
        }
    }
    
    // Cargar selector de meses
    cargarSelectorMeses();
}

function cargarSelectorMeses() {
    const select = document.getElementById('dashMesSelect');
    if (!select) return;
    select.innerHTML = '';
    const hoy = new Date();
    for (let i = 0; i < 12; i++) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const opt = document.createElement('option');
        opt.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        opt.textContent = d.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });
        select.appendChild(opt);
    }
    cargarResumenMensual();
}

function cargarResumenMensual() {
    const mesStr = document.getElementById('dashMesSelect')?.value;
    if (!mesStr) return;
    const [anio, mes] = mesStr.split('-').map(Number);
    const inicio = new Date(anio, mes - 1, 1);
    const fin = new Date(anio, mes, 0, 23, 59, 59);
    
    const pedidosMes = todosLosPedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= inicio && f <= fin;
    });
    
    const totalVentas = pedidosMes.reduce((s, p) => s + (p.total || 0), 0);
    const totalPedidos = pedidosMes.length;
    const contado = pedidosMes.filter(p => (p.tipoPago || 'contado') === 'contado').reduce((s,p) => s + (p.total||0), 0);
    const credito = pedidosMes.filter(p => p.tipoPago === 'credito').reduce((s,p) => s + (p.total||0), 0);
    const entregados = pedidosMes.filter(p => p.estado === 'entregado').length;
    const clientesUnicos = new Set(pedidosMes.map(p => p.cliente?.id)).size;
    
    const container = document.getElementById('resumenMensualContenido');
    if (container) {
        container.innerHTML = `
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-green-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Total Ventas</p><p class="font-bold text-green-700">Gs. ${totalVentas.toLocaleString()}</p></div>
                <div class="bg-blue-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Pedidos</p><p class="font-bold text-blue-700">${totalPedidos}</p></div>
                <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Contado</p><p class="font-bold">Gs. ${contado.toLocaleString()}</p></div>
                <div class="bg-red-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Credito</p><p class="font-bold text-red-600">Gs. ${credito.toLocaleString()}</p></div>
                <div class="bg-purple-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Entregados</p><p class="font-bold text-purple-700">${entregados} / ${totalPedidos}</p></div>
                <div class="bg-yellow-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Clientes</p><p class="font-bold text-yellow-700">${clientesUnicos}</p></div>
            </div>
        `;
    }

    // Ganancia neta del mes seleccionado
    const gananciaContainer = document.getElementById('resumenGananciaContenido');
    if (gananciaContainer) {
        const gMes = calcularGananciaPedidos(pedidosMes);
        const margenColor = gMes.margenPromedio > 30 ? 'text-green-700' :
                            gMes.margenPromedio > 15 ? 'text-yellow-700' : 'text-red-700';
        if (gMes.costoTotal > 0) {
            gananciaContainer.innerHTML = `
                <div class="grid grid-cols-3 gap-3 border-t border-gray-200 pt-3">
                    <div class="bg-orange-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Costo Total</p><p class="font-bold text-orange-700">Gs. ${gMes.costoTotal.toLocaleString()}</p></div>
                    <div class="bg-green-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Ganancia Neta</p><p class="font-bold text-green-700">Gs. ${gMes.gananciaTotal.toLocaleString()}</p></div>
                    <div class="bg-blue-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Margen</p><p class="font-bold ${margenColor}">${gMes.margenPromedio}%</p></div>
                </div>
                <p class="text-xs text-gray-400 mt-2">${gMes.itemsConCosto}/${gMes.itemsTotales} items con costo definido</p>
            `;
        } else {
            gananciaContainer.innerHTML = `<p class="text-xs text-gray-400 mt-2 italic">Define costos en tus productos para ver la ganancia neta de este mes</p>`;
        }
    }
}

function exportarResumenMensualPDF() {
    const mesStr = document.getElementById('dashMesSelect')?.value;
    if (!mesStr) return;
    const [anio, mes] = mesStr.split('-').map(Number);
    const inicio = new Date(anio, mes - 1, 1);
    const fin = new Date(anio, mes, 0, 23, 59, 59);
    const mesNombre = inicio.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });
    
    const pedidosMes = todosLosPedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= inicio && f <= fin;
    });
    
    const totalVentas = pedidosMes.reduce((s, p) => s + (p.total || 0), 0);
    const contado = pedidosMes.filter(p => (p.tipoPago || 'contado') === 'contado').reduce((s,p) => s + (p.total||0), 0);
    const credito = pedidosMes.filter(p => p.tipoPago === 'credito').reduce((s,p) => s + (p.total||0), 0);
    
    // Por cliente
    const porCliente = {};
    pedidosMes.forEach(p => {
        const n = p.cliente?.nombre || 'N/A';
        if (!porCliente[n]) porCliente[n] = { total: 0, pedidos: 0 };
        porCliente[n].total += p.total || 0;
        porCliente[n].pedidos++;
    });
    
    // Por producto
    const porProducto = {};
    pedidosMes.forEach(p => {
        (p.items || []).forEach(i => {
            const k = i.nombre;
            if (!porProducto[k]) porProducto[k] = { cantidad: 0, total: 0 };
            porProducto[k].cantidad += i.cantidad || 1;
            porProducto[k].total += i.subtotal || 0;
        });
    });
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('HDV Distribuciones - Reporte Mensual', 15, 15);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1), 15, 23);
    
    let y = 42;
    doc.setTextColor(0, 0, 0);
    
    // Resumen
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen General', 15, y); y += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Ventas: Gs. ${totalVentas.toLocaleString()}`, 15, y); y += 6;
    doc.text(`Total Pedidos: ${pedidosMes.length}`, 15, y); y += 6;
    doc.text(`Ventas Contado: Gs. ${contado.toLocaleString()}`, 15, y); y += 6;
    doc.text(`Ventas Credito: Gs. ${credito.toLocaleString()}`, 15, y); y += 6;
    doc.text(`Clientes Activos: ${Object.keys(porCliente).length}`, 15, y); y += 12;
    
    // Top clientes
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Top Clientes', 15, y); y += 8;
    doc.setFontSize(9);
    const topClientes = Object.entries(porCliente).sort((a,b) => b[1].total - a[1].total).slice(0, 10);
    topClientes.forEach(([nombre, data]) => {
        doc.setFont('helvetica', 'normal');
        doc.text(`${nombre}`, 15, y);
        doc.text(`${data.pedidos} pedidos`, 120, y);
        doc.setFont('helvetica', 'bold');
        doc.text(`Gs. ${data.total.toLocaleString()}`, 195, y, { align: 'right' });
        y += 6;
    });
    
    y += 8;
    // Top productos
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Top Productos', 15, y); y += 8;
    doc.setFontSize(9);
    const topProductos = Object.entries(porProducto).sort((a,b) => b[1].total - a[1].total).slice(0, 10);
    topProductos.forEach(([nombre, data]) => {
        doc.setFont('helvetica', 'normal');
        doc.text(`${nombre}`, 15, y);
        doc.text(`${data.cantidad} unid.`, 120, y);
        doc.setFont('helvetica', 'bold');
        doc.text(`Gs. ${data.total.toLocaleString()}`, 195, y, { align: 'right' });
        y += 6;
    });
    
    // Footer
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(7);
    doc.text(`Generado: ${new Date().toLocaleString('es-PY')} - HDV Distribuciones EAS`, 105, 290, { align: 'center' });
    
    doc.save(`hdv_reporte_${mesStr}.pdf`);
}

async function guardarResumenMensualFirebase() {
    const mesStr = document.getElementById('dashMesSelect')?.value;
    if (!mesStr) return;
    const [anio, mes] = mesStr.split('-').map(Number);
    const inicio = new Date(anio, mes - 1, 1);
    const fin = new Date(anio, mes, 0, 23, 59, 59);
    
    const pedidosMes = todosLosPedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= inicio && f <= fin;
    });
    
    const resumen = {
        mes: mesStr,
        fechaGeneracion: new Date().toISOString(),
        totalVentas: pedidosMes.reduce((s, p) => s + (p.total || 0), 0),
        totalPedidos: pedidosMes.length,
        contado: pedidosMes.filter(p => (p.tipoPago||'contado') === 'contado').reduce((s,p) => s + (p.total||0), 0),
        credito: pedidosMes.filter(p => p.tipoPago === 'credito').reduce((s,p) => s + (p.total||0), 0),
        clientesActivos: new Set(pedidosMes.map(p => p.cliente?.id)).size,
        entregados: pedidosMes.filter(p => p.estado === 'entregado').length
    };
    
    if (typeof db !== 'undefined') {
        try {
            await db.collection('reportes_mensuales').doc(mesStr).set(resumen);
            mostrarToast(`Resumen de ${mesStr} guardado en Firebase`, 'success');
        } catch(e) {
            mostrarToast('Error guardando: ' + e.message, 'error');
        }
    } else {
        mostrarToast('Firebase no disponible', 'warning');
    }
}

// ============================================
// CREDITOS, PROMOCIONES - FUNCIONES COMPLETAS
// ============================================
// ============================================
// SISTEMA DE CREDITOS COMPLETO
// ============================================

function calcularDiasDesde(fecha) {
    return Math.floor((new Date() - new Date(fecha)) / (1000 * 60 * 60 * 24));
}

function obtenerPagosCredito(pedidoId) {
    const pagos = JSON.parse(localStorage.getItem('hdv_pagos_credito') || '[]');
    return pagos.filter(p => p.pedidoId === pedidoId);
}

function obtenerSaldoPendiente(pedido) {
    const pagos = obtenerPagosCredito(pedido.id);
    const totalPagado = pagos.reduce((s, p) => s + (p.monto || 0), 0);
    return (pedido.total || 0) - totalPagado;
}

function obtenerCreditosManuales() {
    return JSON.parse(localStorage.getItem('hdv_creditos_manuales') || '[]');
}

function obtenerSaldoManual(credito) {
    const pagos = credito.pagos || [];
    const totalPagado = pagos.reduce((s, p) => s + (p.monto || 0), 0);
    return (credito.monto || 0) - totalPagado;
}

function cargarCreditos() {
    // Pedidos a credito
    const pedidosCredito = todosLosPedidos.filter(p => p.tipoPago === 'credito' && p.estado !== 'pagado');
    const creditosManuales = obtenerCreditosManuales().filter(c => !c.pagado);
    const allPagos = JSON.parse(localStorage.getItem('hdv_pagos_credito') || '[]');

    // Calcular stats
    let totalDeuda = 0, totalCobrado = 0;
    pedidosCredito.forEach(p => {
        const pagos = allPagos.filter(pg => pg.pedidoId === p.id);
        const pagado = pagos.reduce((s, pg) => s + (pg.monto || 0), 0);
        totalDeuda += (p.total || 0) - pagado;
        totalCobrado += pagado;
    });
    creditosManuales.forEach(c => {
        const pagado = (c.pagos || []).reduce((s, p) => s + (p.monto || 0), 0);
        totalDeuda += (c.monto || 0) - pagado;
        totalCobrado += pagado;
    });

    const clientesUnicos = new Set([
        ...pedidosCredito.map(p => p.cliente?.id),
        ...creditosManuales.map(c => c.clienteId)
    ]).size;

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('totalCreditos', 'Gs. ' + totalDeuda.toLocaleString());
    el('totalCobrado', 'Gs. ' + totalCobrado.toLocaleString());
    el('clientesConCredito', clientesUnicos);
    el('pedidosCredito', pedidosCredito.length + creditosManuales.length);

    const container = document.getElementById('listaCreditos');
    if (!container) return;

    if (pedidosCredito.length === 0 && creditosManuales.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_ORDERS, 'Sin creditos pendientes', 'No hay pedidos a credito pendientes de pago');
        return;
    }

    container.innerHTML = '';

    // Pedidos a credito
    pedidosCredito.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).forEach(p => {
        const dias = calcularDiasDesde(p.fecha);
        const saldo = obtenerSaldoPendiente(p);
        const pagos = obtenerPagosCredito(p.id);
        const totalPagado = pagos.reduce((s, pg) => s + (pg.monto || 0), 0);
        const esVencido = dias > 15;
        const clienteInfo = productosData.clientes.find(c => c.id === p.cliente?.id);

        if (saldo <= 0) return; // Ya pagado

        const div = document.createElement('div');
        div.className = `p-5 hover:bg-gray-50 transition-colors ${esVencido ? 'bg-red-50 border-l-4 border-red-500' : ''}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold text-gray-800 text-lg">${p.cliente?.nombre || 'N/A'}</p>
                    <p class="text-sm text-gray-500">${new Date(p.fecha).toLocaleDateString('es-PY')} - Pedido #${p.id}</p>
                </div>
                <div class="text-right">
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${esVencido ? 'bg-red-200 text-red-800' : 'bg-yellow-100 text-yellow-800'}">
                        ${dias} dias ${esVencido ? '- VENCIDO' : ''}
                    </span>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-4 mb-3 text-sm">
                <div><span class="text-gray-500">Total:</span> <strong>Gs. ${(p.total || 0).toLocaleString()}</strong></div>
                <div><span class="text-gray-500">Pagado:</span> <strong class="text-green-600">Gs. ${totalPagado.toLocaleString()}</strong></div>
                <div><span class="text-gray-500">Saldo:</span> <strong class="text-red-600">Gs. ${saldo.toLocaleString()}</strong></div>
            </div>
            ${totalPagado > 0 ? `
                <div class="w-full bg-gray-200 rounded-full h-2 mb-3">
                    <div class="bg-green-500 h-2 rounded-full" style="width:${Math.min(100, (totalPagado / p.total * 100)).toFixed(0)}%"></div>
                </div>` : ''}
            <div class="flex gap-2 flex-wrap">
                <button onclick="registrarPagoCredito('${p.id}')" class="bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-bold">Registrar Pago</button>
                <button onclick="enviarRecordatorioWhatsApp('${p.id}')" class="bg-[#25D366] text-white px-3 py-2 rounded-lg text-xs font-bold">WhatsApp</button>
                <button onclick="verHistorialPagos('${p.id}')" class="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-xs font-bold">Historial</button>
                ${saldo <= 0 ? `<button onclick="marcarPagado('${p.id}')" class="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-bold">Marcar Pagado</button>` : ''}
                <button onclick="editarPagosCreditoPedido('${p.id}')" class="bg-yellow-500 text-white px-3 py-2 rounded-lg text-xs font-bold">Editar Pagos</button>
                <button onclick="eliminarCreditoPedido('${p.id}')" class="bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-bold">Eliminar</button>
            </div>`;
        container.appendChild(div);
    });

    // Creditos manuales
    creditosManuales.forEach(c => {
        const dias = calcularDiasDesde(c.fecha);
        const saldo = obtenerSaldoManual(c);
        const totalPagado = (c.pagos || []).reduce((s, p) => s + (p.monto || 0), 0);
        const esVencido = dias > 15;

        if (saldo <= 0) return;

        const div = document.createElement('div');
        div.className = `p-5 hover:bg-gray-50 transition-colors ${esVencido ? 'bg-red-50 border-l-4 border-red-500' : ''}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold text-gray-800 text-lg">${c.clienteNombre || 'N/A'}</p>
                    <p class="text-sm text-gray-500">${new Date(c.fecha).toLocaleDateString('es-PY')} - Manual: ${c.descripcion || ''}</p>
                </div>
                <div class="text-right">
                    <span class="px-2 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">MANUAL</span>
                    <span class="ml-1 px-3 py-1 rounded-full text-xs font-bold ${esVencido ? 'bg-red-200 text-red-800' : 'bg-yellow-100 text-yellow-800'}">
                        ${dias} dias
                    </span>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-4 mb-3 text-sm">
                <div><span class="text-gray-500">Total:</span> <strong>Gs. ${(c.monto || 0).toLocaleString()}</strong></div>
                <div><span class="text-gray-500">Pagado:</span> <strong class="text-green-600">Gs. ${totalPagado.toLocaleString()}</strong></div>
                <div><span class="text-gray-500">Saldo:</span> <strong class="text-red-600">Gs. ${saldo.toLocaleString()}</strong></div>
            </div>
            <div class="flex gap-2 flex-wrap">
                <button onclick="registrarPagoManual('${c.id}')" class="bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-bold">Registrar Pago</button>
                <button onclick="enviarRecordatorioManualWhatsApp('${c.id}')" class="bg-[#25D366] text-white px-3 py-2 rounded-lg text-xs font-bold">WhatsApp</button>
                <button onclick="editarCreditoManualItem('${c.id}')" class="bg-yellow-500 text-white px-3 py-2 rounded-lg text-xs font-bold">Editar</button>
                <button onclick="eliminarCreditoManualItem('${c.id}')" class="bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-bold">Eliminar</button>
            </div>`;
        container.appendChild(div);
    });
}

function registrarPagoCredito(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const saldo = obtenerSaldoPendiente(pedido);
    const montoStr = prompt(`Registrar pago para ${pedido.cliente?.nombre}\nSaldo pendiente: Gs. ${saldo.toLocaleString()}\n\nMonto del pago (Gs.):`);
    if (!montoStr) return;
    const monto = parseInt(montoStr);
    if (isNaN(monto) || monto <= 0) { mostrarToast('Monto invalido', 'error'); return; }
    if (monto > saldo) { mostrarToast('El monto excede el saldo pendiente', 'error'); return; }

    const nota = prompt('Nota del pago (opcional):') || '';
    const pago = { id: 'PAG' + Date.now(), pedidoId, monto, fecha: new Date().toISOString(), nota };
    const pagos = JSON.parse(localStorage.getItem('hdv_pagos_credito') || '[]');
    pagos.push(pago);
    localStorage.setItem('hdv_pagos_credito', JSON.stringify(pagos));

    if (typeof guardarPagosCreditoFirebase === 'function') {
        guardarPagosCreditoFirebase(pagos).catch(e => console.error(e));
    }

    if (saldo - monto <= 0) {
        marcarPagado(pedidoId);
    }

    mostrarToast(`Pago de Gs. ${monto.toLocaleString()} registrado exitosamente`, 'success');
    cargarCreditos();
}

function registrarPagoManual(creditoId) {
    const creditos = obtenerCreditosManuales();
    const credito = creditos.find(c => c.id === creditoId);
    if (!credito) return;
    const saldo = obtenerSaldoManual(credito);
    const montoStr = prompt(`Registrar pago para ${credito.clienteNombre}\nSaldo: Gs. ${saldo.toLocaleString()}\n\nMonto:`);
    if (!montoStr) return;
    const monto = parseInt(montoStr);
    if (isNaN(monto) || monto <= 0 || monto > saldo) { mostrarToast('Monto invalido', 'error'); return; }

    const nota = prompt('Nota (opcional):') || '';
    if (!credito.pagos) credito.pagos = [];
    credito.pagos.push({ monto, fecha: new Date().toISOString(), nota });
    if (saldo - monto <= 0) credito.pagado = true;
    localStorage.setItem('hdv_creditos_manuales', JSON.stringify(creditos));
    if (typeof guardarCreditosManualesFirebase === 'function') {
        guardarCreditosManualesFirebase(creditos).catch(e => console.error(e));
    }
    mostrarToast(`Pago de Gs. ${monto.toLocaleString()} registrado`, 'success');
    cargarCreditos();
}

function marcarPagado(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const p = pedidos.find(x => x.id === id);
    if (p) {
        p.estado = 'pagado';
        localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
        if (typeof actualizarEstadoPedidoFirebase === 'function') actualizarEstadoPedidoFirebase(id, 'pagado');
    }
    cargarCreditos();
}

function verHistorialPagos(pedidoId) {
    const pagos = obtenerPagosCredito(pedidoId);
    if (pagos.length === 0) { mostrarToast('Sin pagos registrados para este credito', 'info'); return; }
    let msg = 'HISTORIAL DE PAGOS\n' + '='.repeat(30) + '\n';
    pagos.forEach((p, i) => {
        msg += `\n${i + 1}. Gs. ${p.monto.toLocaleString()} - ${new Date(p.fecha).toLocaleDateString('es-PY')}`;
        if (p.nota) msg += ` (${p.nota})`;
    });
    msg += `\n\nTotal pagado: Gs. ${pagos.reduce((s, p) => s + p.monto, 0).toLocaleString()}`;
    mostrarConfirmModal(msg, { textoConfirmar: 'Cerrar' });
}

function enviarRecordatorioWhatsApp(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    const telefono = clienteInfo?.telefono || '';
    if (!telefono) { mostrarToast('Este cliente no tiene telefono registrado', 'error'); return; }

    const saldo = obtenerSaldoPendiente(pedido);
    const dias = calcularDiasDesde(pedido.fecha);

    let plantilla = localStorage.getItem('hdv_whatsapp_mensaje_credito');
    if (!plantilla) {
        plantilla = 'Hola {cliente}, le recordamos que tiene un saldo pendiente de Gs. {saldo} desde hace {dias} dias. Total original: Gs. {monto}. Fecha del pedido: {fecha}. Agradecemos su pronto pago. HDV Distribuciones';
        // Primera vez: permitir editar
        const editada = prompt('Mensaje de recordatorio (primera vez, podes editarlo):\nPlaceholders: {cliente}, {monto}, {saldo}, {dias}, {fecha}', plantilla);
        if (!editada) return;
        plantilla = editada;
        localStorage.setItem('hdv_whatsapp_mensaje_credito', plantilla);
    }

    const mensaje = plantilla
        .replace(/{cliente}/g, pedido.cliente?.nombre || '')
        .replace(/{monto}/g, (pedido.total || 0).toLocaleString())
        .replace(/{saldo}/g, saldo.toLocaleString())
        .replace(/{dias}/g, dias)
        .replace(/{fecha}/g, new Date(pedido.fecha).toLocaleDateString('es-PY'));

    let tel = telefono.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '595' + tel.substring(1);
    else if (!tel.startsWith('595')) tel = '595' + tel;

    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
}

function enviarRecordatorioManualWhatsApp(creditoId) {
    const creditos = obtenerCreditosManuales();
    const credito = creditos.find(c => c.id === creditoId);
    if (!credito) return;
    const clienteInfo = productosData.clientes.find(c => c.id === credito.clienteId);
    const telefono = clienteInfo?.telefono || '';
    if (!telefono) { mostrarToast('Sin telefono registrado', 'error'); return; }

    const saldo = obtenerSaldoManual(credito);
    const dias = calcularDiasDesde(credito.fecha);
    const mensaje = `Hola ${credito.clienteNombre}, le recordamos que tiene un saldo pendiente de Gs. ${saldo.toLocaleString()} desde hace ${dias} dias por: ${credito.descripcion}. Agradecemos su pronto pago. HDV Distribuciones`;

    let tel = telefono.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '595' + tel.substring(1);
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
}

function editarMensajeRecordatorio() {
    let plantilla = localStorage.getItem('hdv_whatsapp_mensaje_credito') ||
        'Hola {cliente}, le recordamos que tiene un saldo pendiente de Gs. {saldo} desde hace {dias} dias. Total original: Gs. {monto}. Fecha del pedido: {fecha}. Agradecemos su pronto pago. HDV Distribuciones';
    const nueva = prompt('Editar mensaje de recordatorio WhatsApp:\nPlaceholders: {cliente}, {monto}, {saldo}, {dias}, {fecha}', plantilla);
    if (nueva) {
        localStorage.setItem('hdv_whatsapp_mensaje_credito', nueva);
        // Sincronizar con Firebase
        if (typeof guardarPlantillaWhatsAppFirebase === 'function') {
            guardarPlantillaWhatsAppFirebase(nueva).catch(e => console.error(e));
        }
        mostrarToast('Mensaje actualizado', 'success');
    }
}

function agregarCreditoManual() {
    const clienteId = prompt('ID del cliente (o nombre):');
    if (!clienteId) return;
    const cliente = productosData.clientes.find(c => c.id === clienteId || c.nombre === clienteId || c.razon_social === clienteId);
    const nombre = cliente ? (cliente.razon_social || cliente.nombre) : clienteId;
    const montoStr = prompt('Monto del credito (Gs.):');
    if (!montoStr) return;
    const monto = parseInt(montoStr);
    if (isNaN(monto) || monto <= 0) { mostrarToast('Monto invalido', 'error'); return; }
    const descripcion = prompt('Descripcion:') || 'Credito manual';

    const creditos = obtenerCreditosManuales();
    const nuevo = {
        id: 'CM' + Date.now(),
        clienteId: cliente?.id || clienteId,
        clienteNombre: nombre,
        monto, descripcion,
        fecha: new Date().toISOString(),
        pagos: [], pagado: false
    };
    creditos.push(nuevo);
    localStorage.setItem('hdv_creditos_manuales', JSON.stringify(creditos));

    if (typeof guardarCreditosManualesFirebase === 'function') {
        guardarCreditosManualesFirebase(creditos).catch(e => console.error(e));
    }
    mostrarToast('Credito manual agregado', 'success');
    cargarCreditos();
}

// Editar/eliminar creditos
function editarCreditoManualItem(creditoId) {
    const creditos = obtenerCreditosManuales();
    const c = creditos.find(x => x.id === creditoId);
    if (!c) return;
    const nuevoMonto = prompt(`Editar credito manual de ${c.clienteNombre}\nMonto actual: Gs. ${(c.monto || 0).toLocaleString()}\nDescripcion: ${c.descripcion || ''}\n\nNuevo monto (dejar en blanco para mantener):`);
    if (nuevoMonto !== null && nuevoMonto.trim() !== '') {
        const monto = parseInt(nuevoMonto);
        if (!isNaN(monto) && monto > 0) c.monto = monto;
    }
    const nuevaDesc = prompt('Nueva descripcion (dejar en blanco para mantener):', c.descripcion || '');
    if (nuevaDesc !== null && nuevaDesc.trim() !== '') c.descripcion = nuevaDesc;
    localStorage.setItem('hdv_creditos_manuales', JSON.stringify(creditos));
    if (typeof guardarCreditosManualesFirebase === 'function') guardarCreditosManualesFirebase(creditos).catch(e => console.error(e));
    cargarCreditos();
}

async function eliminarCreditoManualItem(creditoId) {
    const creditos = obtenerCreditosManuales();
    const c = creditos.find(x => x.id === creditoId);
    if (!c) return;
    if (!await mostrarConfirmModal(`¿Eliminar credito manual de ${c.clienteNombre} (Gs. ${(c.monto || 0).toLocaleString()})?\nEsta accion es irreversible.`, { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    const nuevos = creditos.filter(x => x.id !== creditoId);
    localStorage.setItem('hdv_creditos_manuales', JSON.stringify(nuevos));
    if (typeof guardarCreditosManualesFirebase === 'function') guardarCreditosManualesFirebase(nuevos).catch(e => console.error(e));
    cargarCreditos();
}

async function editarPagosCreditoPedido(pedidoId) {
    const allPagos = JSON.parse(localStorage.getItem('hdv_pagos_credito') || '[]');
    const pagos = allPagos.filter(p => p.pedidoId === pedidoId);
    if (pagos.length === 0) { mostrarToast('Sin pagos registrados para este pedido', 'info'); return; }
    const lista = pagos.map((p, i) => `${i + 1}. Gs. ${(p.monto || 0).toLocaleString()} - ${new Date(p.fecha).toLocaleDateString('es-PY')}${p.nota ? ' - ' + p.nota : ''}`).join('\n');
    const eliminarIdx = prompt(`Pagos registrados:\n${lista}\n\nIngresa el numero del pago a eliminar (o Cancelar):`);
    if (!eliminarIdx) return;
    const idx = parseInt(eliminarIdx) - 1;
    if (isNaN(idx) || idx < 0 || idx >= pagos.length) { mostrarToast('Numero invalido', 'error'); return; }
    if (!await mostrarConfirmModal(`¿Eliminar pago de Gs. ${pagos[idx].monto.toLocaleString()}?`, { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    const pagoAEliminar = pagos[idx];
    const nuevosPagos = allPagos.filter(p => !(p.pedidoId === pedidoId && p.fecha === pagoAEliminar.fecha && p.monto === pagoAEliminar.monto));
    localStorage.setItem('hdv_pagos_credito', JSON.stringify(nuevosPagos));
    cargarCreditos();
}

async function eliminarCreditoPedido(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    if (!await mostrarConfirmModal(`¿Marcar como pagado el credito de ${pedido.cliente?.nombre}?\nEsto lo marcara como pagado en el sistema.`, { textoConfirmar: 'Marcar Pagado' })) return;
    marcarPagado(pedidoId);
}

function toggleVistaCreditos(vista) {
    document.getElementById('vistaListaCreditos').style.display = vista === 'lista' ? '' : 'none';
    document.getElementById('vistaResumenCreditos').style.display = vista === 'resumen' ? '' : 'none';
    document.getElementById('vistaGraficosCreditos').style.display = vista === 'graficos' ? '' : 'none';
    if (vista === 'resumen') mostrarDeudaPorCliente();
    if (vista === 'graficos') renderizarGraficoCreditos();
}

function mostrarDeudaPorCliente() {
    const pedidosCredito = todosLosPedidos.filter(p => p.tipoPago === 'credito' && p.estado !== 'pagado');
    const creditosManuales = obtenerCreditosManuales().filter(c => !c.pagado);
    const allPagos = JSON.parse(localStorage.getItem('hdv_pagos_credito') || '[]');
    const resumen = {};

    pedidosCredito.forEach(p => {
        const nombre = p.cliente?.nombre || 'N/A';
        if (!resumen[nombre]) resumen[nombre] = { creditos: 0, deuda: 0, pagado: 0 };
        const pagado = allPagos.filter(pg => pg.pedidoId === p.id).reduce((s, pg) => s + pg.monto, 0);
        resumen[nombre].creditos++;
        resumen[nombre].deuda += (p.total || 0);
        resumen[nombre].pagado += pagado;
    });
    creditosManuales.forEach(c => {
        const nombre = c.clienteNombre || 'N/A';
        if (!resumen[nombre]) resumen[nombre] = { creditos: 0, deuda: 0, pagado: 0 };
        const pagado = (c.pagos || []).reduce((s, p) => s + p.monto, 0);
        resumen[nombre].creditos++;
        resumen[nombre].deuda += c.monto;
        resumen[nombre].pagado += pagado;
    });

    const container = document.getElementById('resumenDeudaClientes');
    if (!container) return;
    const sorted = Object.entries(resumen).sort((a, b) => (b[1].deuda - b[1].pagado) - (a[1].deuda - a[1].pagado));

    container.innerHTML = `
        <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 uppercase text-[11px]">
                <tr><th class="px-4 py-2 text-left">Cliente</th><th class="px-4 py-2">Creditos</th><th class="px-4 py-2">Deuda Total</th><th class="px-4 py-2">Pagado</th><th class="px-4 py-2">Saldo</th></tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
                ${sorted.map(([nombre, d]) => {
                    const saldo = d.deuda - d.pagado;
                    return `<tr class="${saldo > 0 ? 'bg-red-50' : 'bg-green-50'}">
                        <td class="px-4 py-3 font-bold">${nombre}</td>
                        <td class="px-4 py-3 text-center">${d.creditos}</td>
                        <td class="px-4 py-3 text-center">Gs. ${d.deuda.toLocaleString()}</td>
                        <td class="px-4 py-3 text-center text-green-600 font-bold">Gs. ${d.pagado.toLocaleString()}</td>
                        <td class="px-4 py-3 text-center text-red-600 font-bold">Gs. ${saldo.toLocaleString()}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
}

let chartCred = null, chartCredPie = null;
function renderizarGraficoCreditos() {
    const pedidosCredito = todosLosPedidos.filter(p => p.tipoPago === 'credito' && p.estado !== 'pagado');
    const allPagos = JSON.parse(localStorage.getItem('hdv_pagos_credito') || '[]');
    const porCliente = {};
    let totalPagadoGlobal = 0, totalPendienteGlobal = 0;

    pedidosCredito.forEach(p => {
        const nombre = p.cliente?.nombre || 'N/A';
        const pagado = allPagos.filter(pg => pg.pedidoId === p.id).reduce((s, pg) => s + pg.monto, 0);
        const saldo = (p.total || 0) - pagado;
        if (!porCliente[nombre]) porCliente[nombre] = 0;
        porCliente[nombre] += saldo;
        totalPagadoGlobal += pagado;
        totalPendienteGlobal += saldo;
    });

    const top10 = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const ctx1 = document.getElementById('chartCreditos');
    if (ctx1) {
        if (chartCred) chartCred.destroy();
        chartCred = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: top10.map(t => t[0]),
                datasets: [{ label: 'Deuda (Gs.)', data: top10.map(t => t[1]), backgroundColor: 'rgba(220, 38, 38, 0.7)', borderRadius: 6 }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => 'Gs.' + (v / 1000).toFixed(0) + 'k' } } } }
        });
    }

    const ctx2 = document.getElementById('chartCreditosPagados');
    if (ctx2) {
        if (chartCredPie) chartCredPie.destroy();
        chartCredPie = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: ['Cobrado', 'Pendiente'],
                datasets: [{ data: [totalPagadoGlobal, totalPendienteGlobal], backgroundColor: ['#16a34a', '#dc2626'], borderWidth: 0 }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }
}


// ============================================
// MOTOR DE PROMOCIONES
// ============================================

function cargarPromocionesDesdeStorage() {
    return JSON.parse(localStorage.getItem('hdv_promociones') || '[]');
}

function guardarPromocionesEnStorage(promos) {
    localStorage.setItem('hdv_promociones', JSON.stringify(promos));
    // Sincronizar con Firebase
    if (typeof guardarPromocionesFirebase === 'function') {
        guardarPromocionesFirebase(promos).catch(e => console.error(e));
    }
}

function esPromocionActiva(promo) {
    if (!promo.activa) return false;
    const hoy = new Date();
    return hoy >= new Date(promo.fechaInicio) && hoy <= new Date(promo.fechaFin);
}

function cargarPromociones() {
    const container = document.getElementById('promocionesContainer');
    if (!container) return;
    const promos = cargarPromocionesDesdeStorage();

    if (promos.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_ORDERS, 'Sin promociones configuradas', 'Crea una nueva promocion para tus productos');
        return;
    }

    container.innerHTML = '';
    promos.forEach(p => {
        const activa = esPromocionActiva(p);
        const prod = productosData.productos.find(pr => pr.id === p.productoId);
        const tipoLabels = { descuento_cantidad: 'Descuento x Cant.', combo: 'Combo', precio_mayorista: 'Mayorista' };
        const div = document.createElement('div');
        div.className = `p-5 hover:bg-gray-50 ${!activa ? 'opacity-50' : ''}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold text-gray-800">${p.nombre}</p>
                    <p class="text-sm text-gray-500">${p.descripcion || ''}</p>
                </div>
                <div class="flex gap-2 items-center">
                    <span class="px-2 py-1 rounded-full text-[10px] font-bold ${activa ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}">${activa ? 'ACTIVA' : 'INACTIVA'}</span>
                    <span class="px-2 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">${tipoLabels[p.tipo] || p.tipo}</span>
                </div>
            </div>
            <div class="text-sm text-gray-600 mb-3">
                <span class="font-medium">${prod?.nombre || p.productoId}</span>
                ${p.presentacion !== 'todas' ? ` (${p.presentacion})` : ' (todas)'}
                - Min: ${p.cantidadMinima} unid.
                ${p.tipo !== 'combo' ? ` - Precio: Gs. ${(p.precioEspecial || 0).toLocaleString()}` : ` - Gratis: ${p.cantidadGratis} unid.`}
            </div>
            <div class="text-xs text-gray-400 mb-3">${new Date(p.fechaInicio).toLocaleDateString('es-PY')} al ${new Date(p.fechaFin).toLocaleDateString('es-PY')}</div>
            <div class="flex gap-2">
                <button onclick="abrirModalPromocion('${p.id}')" class="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-xs font-bold">Editar</button>
                <button onclick="togglePromocion('${p.id}')" class="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-xs font-bold">${p.activa ? 'Desactivar' : 'Activar'}</button>
                <button onclick="eliminarPromocion('${p.id}')" class="bg-red-50 text-red-600 px-3 py-1 rounded-lg text-xs font-bold">Eliminar</button>
            </div>`;
        container.appendChild(div);
    });
}

function abrirModalPromocion(promoId) {
    // Poblar selects de productos
    const selectProd = document.getElementById('formPromoProducto');
    const selectGratis = document.getElementById('formPromoProductoGratis');
    if (selectProd) {
        selectProd.innerHTML = '<option value="">-- Seleccionar --</option>' +
            productosData.productos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    }
    if (selectGratis) {
        selectGratis.innerHTML = '<option value="">-- Ninguno --</option>' +
            productosData.productos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    }

    if (promoId) {
        const promo = cargarPromocionesDesdeStorage().find(p => p.id === promoId);
        if (promo) {
            document.getElementById('formPromoId').value = promo.id;
            document.getElementById('formPromoNombre').value = promo.nombre;
            document.getElementById('formPromoDescripcion').value = promo.descripcion || '';
            document.getElementById('formPromoTipo').value = promo.tipo;
            document.getElementById('formPromoProducto').value = promo.productoId;
            actualizarPresentacionesPromo();
            setTimeout(() => {
                document.getElementById('formPromoPresentacion').value = promo.presentacion || 'todas';
            }, 50);
            document.getElementById('formPromoCantidad').value = promo.cantidadMinima;
            document.getElementById('formPromoPrecio').value = promo.precioEspecial || '';
            if (selectGratis) selectGratis.value = promo.productoGratisId || '';
            document.getElementById('formPromoCantidadGratis').value = promo.cantidadGratis || 1;
            document.getElementById('formPromoActiva').checked = promo.activa;
            document.getElementById('formPromoFechaInicio').value = promo.fechaInicio;
            document.getElementById('formPromoFechaFin').value = promo.fechaFin;
        }
    } else {
        document.getElementById('formPromoId').value = 'PROMO' + Date.now();
        document.getElementById('formPromoNombre').value = '';
        document.getElementById('formPromoDescripcion').value = '';
        document.getElementById('formPromoCantidad').value = 12;
        document.getElementById('formPromoPrecio').value = '';
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('formPromoFechaInicio').value = hoy;
        const fin = new Date(); fin.setFullYear(fin.getFullYear() + 1);
        document.getElementById('formPromoFechaFin').value = fin.toISOString().split('T')[0];
    }

    toggleCamposPromo();
    document.getElementById('modalPromocion')?.classList.add('show');
}

function cerrarModalPromocion() {
    document.getElementById('modalPromocion')?.classList.remove('show');
}

function actualizarPresentacionesPromo() {
    const prodId = document.getElementById('formPromoProducto')?.value;
    const select = document.getElementById('formPromoPresentacion');
    if (!select) return;
    select.innerHTML = '<option value="todas">Todas</option>';
    if (prodId) {
        const prod = productosData.productos.find(p => p.id === prodId);
        if (prod) {
            prod.presentaciones.forEach(pres => {
                select.innerHTML += `<option value="${pres.tamano}">${pres.tamano} - Gs.${pres.precio_base.toLocaleString()}</option>`;
            });
        }
    }
}

function toggleCamposPromo() {
    const tipo = document.getElementById('formPromoTipo')?.value;
    document.getElementById('campoPrecioEspecial').style.display = tipo !== 'combo' ? '' : 'none';
    document.getElementById('camposCombo').style.display = tipo === 'combo' ? '' : 'none';
}

function guardarPromocion() {
    const id = document.getElementById('formPromoId').value;
    const nombre = document.getElementById('formPromoNombre').value.trim();
    const productoId = document.getElementById('formPromoProducto').value;
    if (!nombre || !productoId) { mostrarToast('Completa nombre y producto', 'error'); return; }

    const promo = {
        id,
        tipo: document.getElementById('formPromoTipo').value,
        nombre,
        descripcion: document.getElementById('formPromoDescripcion').value.trim(),
        productoId,
        presentacion: document.getElementById('formPromoPresentacion').value,
        cantidadMinima: parseInt(document.getElementById('formPromoCantidad').value) || 1,
        precioEspecial: parseInt(document.getElementById('formPromoPrecio').value) || 0,
        productoGratisId: document.getElementById('formPromoProductoGratis')?.value || null,
        cantidadGratis: parseInt(document.getElementById('formPromoCantidadGratis').value) || 1,
        activa: document.getElementById('formPromoActiva').checked,
        fechaInicio: document.getElementById('formPromoFechaInicio').value,
        fechaFin: document.getElementById('formPromoFechaFin').value
    };

    const promos = cargarPromocionesDesdeStorage();
    const idx = promos.findIndex(p => p.id === id);
    if (idx >= 0) promos[idx] = promo;
    else promos.push(promo);
    guardarPromocionesEnStorage(promos);

    if (typeof db !== 'undefined') {
        db.collection('promociones').doc(id).set(promo).catch(e => console.error(e));
    }

    cerrarModalPromocion();
    cargarPromociones();
    mostrarToast('Promocion guardada', 'success');
}

function togglePromocion(promoId) {
    const promos = cargarPromocionesDesdeStorage();
    const p = promos.find(pr => pr.id === promoId);
    if (p) { p.activa = !p.activa; guardarPromocionesEnStorage(promos); cargarPromociones(); }
}

async function eliminarPromocion(promoId) {
    if (!await mostrarConfirmModal('¿Eliminar esta promocion?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    let promos = cargarPromocionesDesdeStorage();
    promos = promos.filter(p => p.id !== promoId);
    guardarPromocionesEnStorage(promos);
    cargarPromociones();
}

// ============================================
// RENDICIONES DE CAJA Y GASTOS
// ============================================

function obtenerSemanaActual() {
    const now = new Date();
    const year = now.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const week = Math.ceil(((now - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

function obtenerRangoSemana(weekStr) {
    if (!weekStr) weekStr = obtenerSemanaActual();
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

function cargarRendiciones() {
    const weekInput = document.getElementById('rendSemana');
    if (!weekInput.value) weekInput.value = obtenerSemanaActual();
    const { inicio, fin } = obtenerRangoSemana(weekInput.value);

    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const gastos = JSON.parse(localStorage.getItem('hdv_gastos') || '[]');

    // Filtrar pedidos de la semana
    const pedidosSemana = pedidos.filter(p => {
        const fecha = new Date(p.fecha);
        return fecha >= inicio && fecha <= fin;
    });

    const totalContado = pedidosSemana
        .filter(p => p.tipoPago === 'contado' && (p.estado === 'entregado' || p.estado === 'pendiente'))
        .reduce((sum, p) => sum + (p.total || 0), 0);
    const totalCredito = pedidosSemana
        .filter(p => p.tipoPago === 'credito')
        .reduce((sum, p) => sum + (p.total || 0), 0);

    // Gastos de la semana
    const gastosSemana = gastos.filter(g => {
        const fecha = new Date(g.fecha);
        return fecha >= inicio && fecha <= fin;
    });
    const totalGastos = gastosSemana.reduce((sum, g) => sum + (g.monto || 0), 0);
    const aRendir = totalContado - totalGastos;

    document.getElementById('rendContado').textContent = `Gs. ${totalContado.toLocaleString()}`;
    document.getElementById('rendCredito').textContent = `Gs. ${totalCredito.toLocaleString()}`;
    document.getElementById('rendGastos').textContent = `Gs. ${totalGastos.toLocaleString()}`;
    document.getElementById('rendTotal').textContent = `Gs. ${aRendir.toLocaleString()}`;

    // Mostrar gastos
    const gastosEl = document.getElementById('rendGastosLista');
    if (gastosSemana.length === 0) {
        gastosEl.innerHTML = '<p class="p-6 text-center text-gray-500 font-medium">Sin gastos registrados esta semana</p>';
    } else {
        gastosEl.innerHTML = gastosSemana.map(g => `
            <div class="p-4 flex justify-between items-center">
                <div>
                    <p class="font-bold text-gray-800">${g.concepto}</p>
                    <p class="text-xs text-gray-400">${new Date(g.fecha).toLocaleDateString('es-PY')}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-red-600">- Gs. ${(g.monto || 0).toLocaleString()}</p>
                    <button onclick="eliminarGastoAdmin('${g.id}')" class="text-xs text-red-400 hover:underline">Eliminar</button>
                </div>
            </div>
        `).join('');
    }

    // Historial de rendiciones
    const rendiciones = JSON.parse(localStorage.getItem('hdv_rendiciones') || '[]');
    const histEl = document.getElementById('rendHistorial');
    if (rendiciones.length === 0) {
        histEl.innerHTML = '<p class="p-6 text-center text-gray-500 font-medium">Sin rendiciones anteriores</p>';
    } else {
        histEl.innerHTML = rendiciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).map(r => `
            <div class="p-4 flex justify-between items-center">
                <div>
                    <p class="font-bold text-gray-800">Semana ${r.semana}</p>
                    <p class="text-xs text-gray-400">Rendido: ${new Date(r.fecha).toLocaleDateString('es-PY')} - Contado: Gs. ${(r.contado || 0).toLocaleString()} | Gastos: Gs. ${(r.gastos || 0).toLocaleString()}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold ${r.aRendir >= 0 ? 'text-green-600' : 'text-red-600'}">Gs. ${(r.aRendir || 0).toLocaleString()}</p>
                    <span class="text-xs px-2 py-1 rounded-full ${r.estado === 'rendido' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">${r.estado || 'pendiente'}</span>
                </div>
            </div>
        `).join('');
    }

    // Cuentas bancarias
    cargarCuentasBancariasAdmin();
}

async function eliminarGastoAdmin(gastoId) {
    if (!await mostrarConfirmModal('¿Eliminar este gasto?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    let gastos = JSON.parse(localStorage.getItem('hdv_gastos') || '[]');
    gastos = gastos.filter(g => g.id !== gastoId);
    localStorage.setItem('hdv_gastos', JSON.stringify(gastos));
    if (typeof guardarGastosFirebase === 'function') guardarGastosFirebase(gastos).catch(e => console.error(e));
    cargarRendiciones();
}

// Cuentas bancarias
function cargarCuentasBancariasAdmin() {
    const cuentas = JSON.parse(localStorage.getItem('hdv_cuentas_bancarias') || '[]');
    const el = document.getElementById('cuentasBancariasAdmin');
    if (cuentas.length === 0) {
        el.innerHTML = '<p class="p-6 text-center text-gray-500 font-medium">Sin cuentas bancarias configuradas</p>';
        return;
    }
    el.innerHTML = cuentas.map(c => `
        <div class="p-4 flex justify-between items-center">
            <div>
                <p class="font-bold text-gray-800">${c.banco} - ${c.tipo === 'ahorro' ? 'Caja de Ahorro' : 'Cuenta Corriente'}${c.alias ? ` <span class="text-blue-600 font-medium">(${c.alias})</span>` : ''}</p>
                <p class="text-sm text-gray-600">Nro: ${c.numero} | ${c.moneda === 'USD' ? 'Dolares' : 'Guaranies'}</p>
                <p class="text-xs text-gray-400">Titular: ${c.titular} | RUC: ${c.ruc || '-'}</p>
            </div>
            <div class="flex gap-2">
                <button onclick="editarCuentaBancaria('${c.id}')" class="text-blue-600 text-sm font-bold hover:underline">Editar</button>
                <button onclick="eliminarCuentaBancaria('${c.id}')" class="text-red-600 text-sm font-bold hover:underline">Eliminar</button>
            </div>
        </div>
    `).join('');
}

function abrirModalCuentaBancaria(cuentaId) {
    document.getElementById('formCuentaId').value = '';
    document.getElementById('formCuentaBanco').value = '';
    document.getElementById('formCuentaTipo').value = 'ahorro';
    document.getElementById('formCuentaMoneda').value = 'PYG';
    document.getElementById('formCuentaNumero').value = '';
    document.getElementById('formCuentaAlias').value = '';
    document.getElementById('formCuentaTitular').value = 'HDV Distribuciones EAS';
    document.getElementById('formCuentaRUC').value = '';
    if (cuentaId) {
        const cuentas = JSON.parse(localStorage.getItem('hdv_cuentas_bancarias') || '[]');
        const c = cuentas.find(x => x.id === cuentaId);
        if (c) {
            document.getElementById('formCuentaId').value = c.id;
            document.getElementById('formCuentaBanco').value = c.banco;
            document.getElementById('formCuentaTipo').value = c.tipo;
            document.getElementById('formCuentaMoneda').value = c.moneda || 'PYG';
            document.getElementById('formCuentaNumero').value = c.numero;
            document.getElementById('formCuentaAlias').value = c.alias || '';
            document.getElementById('formCuentaTitular').value = c.titular;
            document.getElementById('formCuentaRUC').value = c.ruc || '';
        }
    }
    document.getElementById('modalCuentaBancaria').classList.add('show');
}

function cerrarModalCuentaBancaria() {
    document.getElementById('modalCuentaBancaria').classList.remove('show');
}

function editarCuentaBancaria(id) { abrirModalCuentaBancaria(id); }

function guardarCuentaBancaria() {
    const id = document.getElementById('formCuentaId').value || 'CTA' + Date.now();
    const cuenta = {
        id,
        banco: document.getElementById('formCuentaBanco').value,
        tipo: document.getElementById('formCuentaTipo').value,
        moneda: document.getElementById('formCuentaMoneda').value,
        numero: document.getElementById('formCuentaNumero').value,
        alias: document.getElementById('formCuentaAlias').value,
        titular: document.getElementById('formCuentaTitular').value,
        ruc: document.getElementById('formCuentaRUC').value
    };
    if (!cuenta.banco || !cuenta.numero) { mostrarToast('Banco y numero de cuenta son obligatorios', 'error'); return; }
    let cuentas = JSON.parse(localStorage.getItem('hdv_cuentas_bancarias') || '[]');
    const idx = cuentas.findIndex(c => c.id === id);
    if (idx >= 0) cuentas[idx] = cuenta; else cuentas.push(cuenta);
    localStorage.setItem('hdv_cuentas_bancarias', JSON.stringify(cuentas));
    if (typeof guardarCuentasBancariasFirebase === 'function') guardarCuentasBancariasFirebase(cuentas).catch(e => console.error(e));
    cerrarModalCuentaBancaria();
    cargarCuentasBancariasAdmin();
    mostrarToast('Cuenta bancaria guardada', 'success');
}

async function eliminarCuentaBancaria(id) {
    if (!await mostrarConfirmModal('¿Eliminar esta cuenta bancaria?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    let cuentas = JSON.parse(localStorage.getItem('hdv_cuentas_bancarias') || '[]');
    cuentas = cuentas.filter(c => c.id !== id);
    localStorage.setItem('hdv_cuentas_bancarias', JSON.stringify(cuentas));
    if (typeof guardarCuentasBancariasFirebase === 'function') guardarCuentasBancariasFirebase(cuentas).catch(e => console.error(e));
    cargarCuentasBancariasAdmin();
}

// ============================================
// METAS Y COMISIONES
// ============================================

function cargarMetas() {
    const metas = JSON.parse(localStorage.getItem('hdv_metas') || '[]');
    const mesActual = new Date().toISOString().slice(0, 7); // YYYY-MM
    const metaActiva = metas.find(m => m.mes === mesActual && m.activa) || metas.find(m => m.activa);

    // Calcular ventas del mes
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedidosMes = pedidos.filter(p => p.fecha && p.fecha.startsWith(mesActual));
    const totalVendido = pedidosMes.reduce((sum, p) => sum + (p.total || 0), 0);

    if (metaActiva) {
        const objetivo = metaActiva.monto || 0;
        const comisionPct = metaActiva.comision || 0;
        const porcentaje = objetivo > 0 ? Math.min(100, Math.round((totalVendido / objetivo) * 100)) : 0;
        const comisionEstimada = Math.round(totalVendido * (comisionPct / 100));
        const faltante = Math.max(0, objetivo - totalVendido);

        document.getElementById('metaObjetivo').textContent = `Gs. ${objetivo.toLocaleString()}`;
        document.getElementById('metaVendido').textContent = `Gs. ${totalVendido.toLocaleString()}`;
        document.getElementById('metaComision').textContent = `Gs. ${comisionEstimada.toLocaleString()}`;
        document.getElementById('metaPorcentaje').textContent = `${porcentaje}%`;
        document.getElementById('metaFaltante').textContent = faltante > 0
            ? `Faltan Gs. ${faltante.toLocaleString()} para alcanzar la meta`
            : 'Meta alcanzada!';

        const barra = document.getElementById('metaBarraProgreso');
        barra.style.width = `${porcentaje}%`;
        barra.textContent = `${porcentaje}%`;
        barra.className = `h-6 rounded-full transition-all duration-700 flex items-center justify-center text-white text-xs font-bold ${porcentaje < 50 ? 'bg-red-500' : porcentaje < 80 ? 'bg-yellow-500' : 'bg-green-500'}`;
    } else {
        document.getElementById('metaObjetivo').textContent = 'Sin meta';
        document.getElementById('metaVendido').textContent = `Gs. ${totalVendido.toLocaleString()}`;
        document.getElementById('metaComision').textContent = 'Gs. 0';
        document.getElementById('metaPorcentaje').textContent = '-';
        document.getElementById('metaFaltante').textContent = 'Configure una meta para ver el progreso';
        document.getElementById('metaBarraProgreso').style.width = '0%';
    }

    // Lista de metas
    const container = document.getElementById('metasContainer');
    if (metas.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_ORDERS, 'Sin metas configuradas', 'Crea metas mensuales para los vendedores');
    } else {
        container.innerHTML = metas.map(m => {
            const pedMes = pedidos.filter(p => p.fecha && p.fecha.startsWith(m.mes));
            const vendMes = pedMes.reduce((s, p) => s + (p.total || 0), 0);
            const pct = m.monto > 0 ? Math.min(100, Math.round((vendMes / m.monto) * 100)) : 0;
            return `
            <div class="p-4 flex justify-between items-center">
                <div>
                    <p class="font-bold text-gray-800">${m.vendedor} - ${m.mes}</p>
                    <p class="text-sm text-gray-500">Meta: Gs. ${(m.monto || 0).toLocaleString()} | Comision: ${m.comision}%</p>
                    <div class="mt-2 w-48 bg-gray-200 rounded-full h-3">
                        <div class="h-3 rounded-full ${pct < 50 ? 'bg-red-500' : pct < 80 ? 'bg-yellow-500' : 'bg-green-500'}" style="width: ${pct}%"></div>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-sm font-bold ${pct >= 100 ? 'text-green-600' : 'text-gray-600'}">${pct}%</span>
                    <span class="text-xs px-2 py-1 rounded-full ${m.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${m.activa ? 'Activa' : 'Inactiva'}</span>
                    <button onclick="editarMeta('${m.id}')" class="text-blue-600 text-sm font-bold">Editar</button>
                    <button onclick="eliminarMeta('${m.id}')" class="text-red-600 text-sm font-bold">Eliminar</button>
                </div>
            </div>`;
        }).join('');
    }
}

function abrirModalMeta(metaId) {
    document.getElementById('formMetaId').value = '';
    document.getElementById('formMetaVendedor').value = 'Vendedor Principal';
    document.getElementById('formMetaMonto').value = '';
    document.getElementById('formMetaComision').value = '5';
    document.getElementById('formMetaMes').value = new Date().toISOString().slice(0, 7);
    document.getElementById('formMetaActiva').value = 'true';
    if (metaId) {
        const metas = JSON.parse(localStorage.getItem('hdv_metas') || '[]');
        const m = metas.find(x => x.id === metaId);
        if (m) {
            document.getElementById('formMetaId').value = m.id;
            document.getElementById('formMetaVendedor').value = m.vendedor;
            document.getElementById('formMetaMonto').value = m.monto;
            document.getElementById('formMetaComision').value = m.comision;
            document.getElementById('formMetaMes').value = m.mes;
            document.getElementById('formMetaActiva').value = m.activa ? 'true' : 'false';
        }
    }
    document.getElementById('modalMeta').classList.add('show');
}

function cerrarModalMeta() { document.getElementById('modalMeta').classList.remove('show'); }
function editarMeta(id) { abrirModalMeta(id); }

function guardarMeta() {
    const id = document.getElementById('formMetaId').value || 'META' + Date.now();
    const meta = {
        id,
        vendedor: document.getElementById('formMetaVendedor').value,
        monto: parseInt(document.getElementById('formMetaMonto').value) || 0,
        comision: parseFloat(document.getElementById('formMetaComision').value) || 0,
        mes: document.getElementById('formMetaMes').value,
        activa: document.getElementById('formMetaActiva').value === 'true'
    };
    if (!meta.monto) { mostrarToast('Monto de meta es obligatorio', 'error'); return; }
    let metas = JSON.parse(localStorage.getItem('hdv_metas') || '[]');
    const idx = metas.findIndex(m => m.id === id);
    if (idx >= 0) metas[idx] = meta; else metas.push(meta);
    localStorage.setItem('hdv_metas', JSON.stringify(metas));
    if (typeof guardarMetasFirebase === 'function') guardarMetasFirebase(metas).catch(e => console.error(e));
    cerrarModalMeta();
    cargarMetas();
    mostrarToast('Meta guardada', 'success');
}

async function eliminarMeta(id) {
    if (!await mostrarConfirmModal('¿Eliminar esta meta?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    let metas = JSON.parse(localStorage.getItem('hdv_metas') || '[]');
    metas = metas.filter(m => m.id !== id);
    localStorage.setItem('hdv_metas', JSON.stringify(metas));
    if (typeof guardarMetasFirebase === 'function') guardarMetasFirebase(metas).catch(e => console.error(e));
    cargarMetas();
}

// ============================================
// CLIENTES EN RIESGO (INACTIVOS)
// ============================================

function cargarClientesInactivos() {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const clientesData = productosData.clientes || [];
    const filtro = document.getElementById('filtroInactivos')?.value || 'todos';
    const hoy = new Date();

    // Calcular ultimo pedido y frecuencia por cliente
    const analisis = clientesData.filter(c => !c.oculto).map(cliente => {
        const pedidosCliente = pedidos.filter(p => p.cliente?.id === cliente.id);
        const ultimoPedido = pedidosCliente.length > 0
            ? pedidosCliente.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0]
            : null;

        const diasInactivo = ultimoPedido
            ? Math.floor((hoy - new Date(ultimoPedido.fecha)) / 86400000)
            : 999;

        const totalHistorico = pedidosCliente.reduce((sum, p) => sum + (p.total || 0), 0);
        const cantidadPedidos = pedidosCliente.length;

        // Calcular promedio mensual (ultimos 3 meses)
        const hace3Meses = new Date(hoy);
        hace3Meses.setMonth(hace3Meses.getMonth() - 3);
        const pedidosRecientes = pedidosCliente.filter(p => new Date(p.fecha) >= hace3Meses);
        const promedioMensual = pedidosRecientes.length > 0
            ? Math.round(pedidosRecientes.reduce((s, p) => s + (p.total || 0), 0) / 3)
            : Math.round(totalHistorico / Math.max(1, cantidadPedidos));

        let nivel = 'activo';
        if (diasInactivo >= 60) nivel = 'perdido';
        else if (diasInactivo >= 30) nivel = 'riesgo';
        else if (diasInactivo >= 15) nivel = 'atencion';

        return {
            cliente,
            ultimoPedido,
            diasInactivo,
            totalHistorico,
            cantidadPedidos,
            promedioMensual,
            nivel
        };
    });

    // Filtrar solo inactivos (15+ dias)
    let inactivos = analisis.filter(a => a.nivel !== 'activo');
    inactivos.sort((a, b) => b.diasInactivo - a.diasInactivo);

    if (filtro !== 'todos') {
        inactivos = inactivos.filter(a => a.nivel === filtro);
    }

    // Stats
    const atencion = analisis.filter(a => a.nivel === 'atencion').length;
    const riesgo = analisis.filter(a => a.nivel === 'riesgo').length;
    const perdidos = analisis.filter(a => a.nivel === 'perdido').length;
    const ingresoRiesgo = analisis
        .filter(a => a.nivel !== 'activo')
        .reduce((sum, a) => sum + a.promedioMensual, 0);

    document.getElementById('inactivosAtencion').textContent = atencion;
    document.getElementById('inactivosRiesgo').textContent = riesgo;
    document.getElementById('inactivosPerdidos').textContent = perdidos;
    document.getElementById('inactivosIngreso').textContent = `Gs. ${ingresoRiesgo.toLocaleString()}`;

    // Renderizar lista
    const container = document.getElementById('inactivosContainer');
    if (inactivos.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <svg viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:120px;height:120px">
                <circle cx="100" cy="80" r="40" stroke="#86efac" stroke-width="3" fill="#f0fdf4"/>
                <path d="M82 80l12 12 24-24" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M60 145h80" stroke="#bbf7d0" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <p style="color:#166534">Todos los clientes estan activos</p>
            <p class="empty-sub">No hay clientes en riesgo de inactividad</p>
        </div>`;
        return;
    }

    container.innerHTML = inactivos.map(a => {
        const nombre = a.cliente.razon_social || a.cliente.nombre || a.cliente.id;
        const zona = a.cliente.zona || '-';
        const tel = a.cliente.telefono || '';
        const badgeColor = a.nivel === 'perdido' ? 'bg-gray-800 text-white' :
                           a.nivel === 'riesgo' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700';
        const badgeText = a.nivel === 'perdido' ? 'PERDIDO' :
                          a.nivel === 'riesgo' ? 'EN RIESGO' : 'ATENCION';
        const ultimaFecha = a.ultimoPedido ? new Date(a.ultimoPedido.fecha).toLocaleDateString('es-PY') : 'Nunca';

        return `
        <div class="p-4 hover:bg-gray-50 transition-colors">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <p class="font-bold text-gray-800">${nombre}</p>
                        <span class="text-xs px-2 py-0.5 rounded-full font-bold ${badgeColor}">${badgeText}</span>
                    </div>
                    <p class="text-sm text-gray-500">Zona: ${zona} | ${a.cantidadPedidos} pedidos historicos</p>
                    <p class="text-xs text-gray-400 mt-1">Ultimo pedido: ${ultimaFecha} (hace ${a.diasInactivo} dias) | Total historico: Gs. ${a.totalHistorico.toLocaleString()}</p>
                    <p class="text-xs text-blue-600 mt-1">Promedio mensual estimado: Gs. ${a.promedioMensual.toLocaleString()}</p>
                </div>
                <div class="flex gap-2 ml-4">
                    ${tel ? `<button onclick="enviarWhatsAppReactivacion('${tel}', '${nombre.replace(/'/g, '')}')" class="bg-green-50 text-green-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-green-100 inline-flex items-center gap-1"><i data-lucide="send" class="w-3 h-3"></i> WhatsApp</button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
}

function enviarWhatsAppReactivacion(telefono, nombre) {
    let tel = telefono.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '595' + tel.substring(1);
    const mensaje = `Hola ${nombre}, desde HDV Distribuciones le saludamos! Hace un tiempo que no nos visita y queremos ofrecerle nuestras ultimas promociones. Estamos para servirle! Contactenos para su proximo pedido.`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function mostrarConfirmModal(mensaje, opciones = {}) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'confirm-backdrop';
        backdrop.innerHTML = `
            <div class="confirm-box">
                <div class="text-center mb-5">
                    <div class="w-14 h-14 mx-auto mb-3 rounded-full ${opciones.destructivo ? 'bg-red-100' : 'bg-blue-100'} flex items-center justify-center">
                        <i data-lucide="${opciones.destructivo ? 'alert-triangle' : 'help-circle'}" class="w-6 h-6 ${opciones.destructivo ? 'text-red-500' : 'text-blue-500'}"></i>
                    </div>
                    <p class="text-gray-800 font-semibold text-sm whitespace-pre-line leading-relaxed">${mensaje}</p>
                </div>
                <div class="flex gap-3">
                    <button class="confirm-cancel-btn flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors">Cancelar</button>
                    <button class="confirm-ok-btn flex-1 ${opciones.destructivo ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'} text-white py-3 rounded-xl font-bold text-sm transition-colors">${opciones.textoConfirmar || 'Confirmar'}</button>
                </div>
            </div>`;
        document.body.appendChild(backdrop);
        lucide.createIcons();

        const cerrar = (result) => { backdrop.remove(); resolve(result); };
        backdrop.querySelector('.confirm-cancel-btn').onclick = () => cerrar(false);
        backdrop.querySelector('.confirm-ok-btn').onclick = () => cerrar(true);
        backdrop.onclick = (e) => { if (e.target === backdrop) cerrar(false); };
    });
}

function mostrarToast(mensaje, tipo = 'info', duracion = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const iconos = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = `<span style="font-size:18px">${iconos[tipo] || ''}</span><span>${mensaje}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, duracion);
}

// ============================================
// FORZAR ACTUALIZACION ADMIN
// ============================================
function forzarActualizacionAdmin() {
    mostrarToast('Limpiando cache y actualizando...', 'info');
    if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
    }
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => r.unregister());
        });
    }
    setTimeout(() => location.reload(true), 800);
}

// Registrar SW tambien desde admin
(function registrarSWAdmin() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => {
                console.log('[Admin SW] Registrado');
                setInterval(() => reg.update(), 30000);
                reg.addEventListener('updatefound', () => {
                    const nw = reg.installing;
                    nw.addEventListener('statechange', () => {
                        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                            nw.postMessage('skipWaiting');
                            mostrarToast('Nueva version disponible. Recargando...', 'info');
                            setTimeout(() => location.reload(true), 1500);
                        }
                    });
                });
            }).catch(err => console.log('[Admin SW] Error:', err));
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[Admin SW] Nuevo service worker activo');
        });
    }
})();

// ============================================
// SIDEBAR RESPONSIVE
// ============================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
}

// Cerrar sidebar al navegar en mobile
const _cambiarSeccionOriginal = cambiarSeccion;
cambiarSeccion = function(seccionId) {
    _cambiarSeccionOriginal(seccionId);
    if (window.innerWidth <= 1024) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
    }
};

// ============================================
// BUSQUEDA GLOBAL (Ctrl+K)
// ============================================
function abrirBusquedaGlobal() {
    const overlay = document.getElementById('globalSearchOverlay');
    overlay.classList.add('show');
    const input = document.getElementById('globalSearchInput');
    input.value = '';
    input.focus();
    document.getElementById('globalSearchResults').innerHTML = '<p class="p-6 text-center text-gray-500 text-sm">Escribe para buscar en productos, clientes y pedidos</p>';
}

function cerrarBusquedaGlobal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('globalSearchOverlay').classList.remove('show');
}

function ejecutarBusquedaGlobal() {
    const q = document.getElementById('globalSearchInput').value.toLowerCase().trim();
    const results = document.getElementById('globalSearchResults');
    if (q.length < 2) {
        results.innerHTML = '<p class="p-6 text-center text-gray-500 text-sm">Escribe al menos 2 caracteres</p>';
        return;
    }

    let html = '';

    // Buscar productos
    const prods = (productosData.productos || []).filter(p => p.nombre.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)).slice(0, 5);
    if (prods.length > 0) {
        html += '<p class="px-4 py-2 text-xs font-bold text-gray-500 uppercase">Productos</p>';
        prods.forEach(p => {
            html += `<button onclick="cerrarBusquedaGlobal({target:{currentTarget:{}}});cambiarSeccion('productos');setTimeout(()=>{document.getElementById('buscarProducto').value='${p.nombre.replace(/'/g, "\\'")}';filtrarProductos()},100)" class="w-full text-left px-4 py-3 hover:bg-gray-100 rounded-lg flex items-center gap-3">
                <i data-lucide="package" class="w-5 h-5 text-gray-400"></i>
                <div><p class="font-medium text-gray-800 text-sm">${p.nombre}</p><p class="text-xs text-gray-400">${p.id} - ${p.categoria}</p></div>
            </button>`;
        });
    }

    // Buscar clientes
    const clis = (productosData.clientes || []).filter(c => (c.razon_social || c.nombre || '').toLowerCase().includes(q) || (c.ruc || '').includes(q) || (c.telefono || '').includes(q)).slice(0, 5);
    if (clis.length > 0) {
        html += '<p class="px-4 py-2 text-xs font-bold text-gray-500 uppercase">Clientes</p>';
        clis.forEach(c => {
            html += `<button onclick="cerrarBusquedaGlobal({target:{currentTarget:{}}});cambiarSeccion('clientes');setTimeout(()=>abrirPerfilCliente('${c.id}'),200)" class="w-full text-left px-4 py-3 hover:bg-gray-100 rounded-lg flex items-center gap-3">
                <i data-lucide="user" class="w-5 h-5 text-gray-400"></i>
                <div><p class="font-medium text-gray-800 text-sm">${c.razon_social || c.nombre}</p><p class="text-xs text-gray-400">${c.zona || ''} - ${c.telefono || ''}</p></div>
            </button>`;
        });
    }

    // Buscar pedidos
    const peds = (todosLosPedidos || []).filter(p => p.id?.toLowerCase().includes(q) || (p.cliente?.nombre || '').toLowerCase().includes(q)).slice(0, 5);
    if (peds.length > 0) {
        html += '<p class="px-4 py-2 text-xs font-bold text-gray-500 uppercase">Pedidos</p>';
        peds.forEach(p => {
            html += `<button onclick="cerrarBusquedaGlobal({target:{currentTarget:{}}});cambiarSeccion('pedidos');setTimeout(()=>editarPedido('${p.id}'),200)" class="w-full text-left px-4 py-3 hover:bg-gray-100 rounded-lg flex items-center gap-3">
                <i data-lucide="clipboard-list" class="w-5 h-5 text-gray-400"></i>
                <div><p class="font-medium text-gray-800 text-sm">${p.cliente?.nombre || 'N/A'}</p><p class="text-xs text-gray-400">${p.id} - Gs. ${(p.total || 0).toLocaleString()}</p></div>
            </button>`;
        });
    }

    if (!html) html = '<p class="p-6 text-center text-gray-500 text-sm font-medium">Sin resultados para esta busqueda</p>';
    results.innerHTML = html;
    lucide.createIcons();
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    // Ctrl+K = busqueda global
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const overlay = document.getElementById('globalSearchOverlay');
        if (overlay.classList.contains('show')) cerrarBusquedaGlobal({target:{currentTarget:{}}});
        else abrirBusquedaGlobal();
    }
    // Ctrl+S = guardar cambios
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (cambiosSinGuardar > 0) {
            guardarTodosCambios();
            mostrarToast('Cambios guardados y sincronizados', 'success');
        } else {
            mostrarToast('No hay cambios pendientes', 'info');
        }
    }
    // ESC = cerrar busqueda global o modales
    if (e.key === 'Escape') {
        const search = document.getElementById('globalSearchOverlay');
        if (search.classList.contains('show')) { cerrarBusquedaGlobal({target:{currentTarget:{}}}); return; }
    }
});
