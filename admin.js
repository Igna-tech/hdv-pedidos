// ============================================
// HDV Admin Panel v5.0 - Controller
// Navegacion, inicializacion, cambios, backup, modales, busqueda global
// Modulos: js/admin/pedidos.js, dashboard.js, productos.js, clientes.js, creditos.js
// ============================================
let productosDataOriginal = null;
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
        ${botonTexto ? `<button data-action="${escapeHTML(botonOnclick)}" class="empty-action">${botonTexto}</button>` : ''}
    </div>`;
}

// V2-A02: Whitelist dispatcher para empty-state buttons (reemplaza new Function)
const ACTION_DISPATCH = {
    "cambiarSeccion('productos')": () => cambiarSeccion('productos'),
    "cambiarSeccion('clientes')": () => cambiarSeccion('clientes'),
    "cambiarSeccion('pedidos')": () => cambiarSeccion('pedidos'),
    "cambiarSeccion('creditos')": () => cambiarSeccion('creditos'),
    "cambiarSeccion('stock')": () => cambiarSeccion('stock'),
    "cambiarSeccion('dashboard')": () => cambiarSeccion('dashboard'),
    "cambiarSeccion('ventas')": () => cambiarSeccion('ventas'),
    "cambiarSeccion('herramientas')": () => cambiarSeccion('herramientas'),
};
document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (btn) {
        const action = btn.getAttribute('data-action');
        if (ACTION_DISPATCH[action]) ACTION_DISPATCH[action]();
        else console.warn('[Admin] Accion no registrada:', action);
    }
});

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
    if (seccionId === 'herramientas') { actualizarInfoBackupAdmin(); cargarListaVendedores(); }
    if (seccionId === 'dashboard') cargarDashboard();
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
    if (cambiosSinGuardar === 0) {
        crearAutoBackupAdmin('Antes de ediciones'); // fire-and-forget async
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

async function guardarTodosCambios() {
    const btn = document.getElementById('btnGuardarSync');
    if (btn && btn.disabled) return;
    const textoOriginal = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = '<svg class="w-4 h-4 animate-spin inline mr-1.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Sincronizando...';
    }

    try {
        cambiosSinGuardar = 0;
        actualizarBarraCambios();
        productosDataOriginal = JSON.parse(JSON.stringify(productosData));

        const dataLimpia = { categorias: productosData.categorias, productos: productosData.productos, clientes: productosData.clientes };
        await HDVStorage.setItem('hdv_catalogo_local', dataLimpia);
        console.log('[Admin] Catalogo guardado en IndexedDB');

        if (typeof guardarCatalogo === 'function') {
            console.log('[Admin] Llamando guardarCatalogo...');
            const dataParaSync = { categorias: productosData.categorias, productos: productosData.productos, clientes: productosData.clientes };
            const ok = await guardarCatalogo(dataParaSync);
            console.log('[Admin] Resultado guardarCatalogo:', ok);
            if (ok) {
                mostrarToast('Cambios guardados y sincronizados. Los vendedores ya ven los cambios.', 'success');
            } else {
                mostrarToast('Error al sincronizar con Supabase. Revisa la consola (F12) para mas detalles. Cambios guardados localmente.', 'warning');
            }
        } else {
            console.error('[Admin] guardarCatalogo no esta definida. supabase-config.js puede tener un error de carga.');
            mostrarToast('Error: modulo de sincronizacion no cargado. Cambios guardados localmente.', 'error');
        }
    } catch (err) {
        console.error('[Admin] Error guardando:', err);
        mostrarToast('Error de sincronizacion: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = textoOriginal;
        }
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
let unsubscribePedidos = null;

document.addEventListener('DOMContentLoaded', async () => {
    // V2-M03: Verificacion server-side del rol admin (no confiar solo en window.hdvUsuario)
    try {
        const { data: rol } = await supabaseClient.rpc('obtener_mi_rol');
        if (rol !== 'admin') {
            console.warn('[Admin] Rol server-side no es admin:', rol);
            window.location.replace('/');
            return;
        }
    } catch (err) {
        console.error('[Admin] Error verificando rol server-side:', err);
        window.location.replace('/login.html');
        return;
    }

    await cargarDatosIniciales();
    cargarConfigEmpresa();

    if (typeof escucharPedidosRealtime === 'function') {
        unsubscribePedidos = escucharPedidosRealtime((pedidos, cambios) => {
            todosLosPedidos = pedidos;
            aplicarFiltrosPedidos();

            const nuevos = cambios.filter(c => c.type === 'added');
            if (nuevos.length > 0 && todosLosPedidos.length > 0) {
                const badge = document.getElementById('currentSectionTitle');
                if (badge && badge.textContent.includes('Pedidos')) {
                    badge.style.transition = 'color 0.3s';
                    badge.style.color = '#059669';
                    setTimeout(() => badge.style.color = '', 1500);
                }
            }
            console.log(`[Admin] Pedidos actualizados en tiempo real: ${pedidos.length}`);
        });
        console.log('[Admin] Escuchando pedidos en tiempo real desde Supabase');
    } else {
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

    const autoBackupToggle = document.getElementById('adminAutoBackupToggle');
    if (autoBackupToggle) autoBackupToggle.checked = (await HDVStorage.getItem('hdv_admin_auto_backup')) !== 'false';
});

async function cargarDatosIniciales() {
    await HDVStorage.ready();
    try {
        let data = null;

        if (typeof obtenerCatalogo === 'function') {
            try {
                data = await obtenerCatalogo();
                if (data && data.productos) {
                    console.log('[Admin] Catalogo cargado desde Supabase (' + data.productos.length + ' productos)');
                } else {
                    data = null;
                }
            } catch (e) { console.warn('[Admin] Supabase no disponible:', e.message); data = null; }
        }

        if (!data || !data.productos) {
            try {
                const local = await HDVStorage.getItem('hdv_catalogo_local');
                if (local) {
                    data = local;
                    if (data && data.productos) {
                        console.log('[Admin] Catalogo cargado desde IndexedDB (' + data.productos.length + ' productos)');
                    } else { data = null; }
                }
            } catch (e) { data = null; }
        }

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
// CONTROL DE ACCESO - BOTON DE PANICO
// ============================================
async function cargarListaVendedores() {
    const container = document.getElementById('listaVendedores');
    if (!container) return;
    try {
        const { data, error } = await supabaseClient.from('perfiles').select('id, nombre_completo, rol, activo');
        if (error) throw error;
        const vendedores = (data || []).filter(p => p.rol === 'vendedor');
        if (vendedores.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-400 italic">Sin vendedores registrados</p>';
            return;
        }
        container.innerHTML = vendedores.map(v => `
            <div class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full ${v.activo ? 'bg-green-500' : 'bg-red-500'}"></span>
                    <span class="text-sm font-medium text-gray-700">${escapeHTML(v.nombre_completo || 'Sin nombre')}</span>
                    <span class="text-[10px] text-gray-400">${v.activo ? 'Activo' : 'Bloqueado'}</span>
                </div>
                <button onclick="toggleAccesoVendedor('${escapeHTML(v.id)}', ${v.activo})"
                    class="text-[11px] px-2 py-1 rounded font-bold ${v.activo
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'}">
                    ${v.activo ? 'Bloquear' : 'Reactivar'}
                </button>
            </div>
        `).join('');
    } catch (err) {
        console.error('[Admin] Error cargando vendedores:', err);
        container.innerHTML = '<p class="text-xs text-red-400">Error cargando vendedores</p>';
    }
}

async function toggleAccesoVendedor(userId, estaActivo) {
    const accion = estaActivo ? 'BLOQUEAR' : 'REACTIVAR';
    const msg = estaActivo
        ? 'Se borraran los datos locales del dispositivo y se bloqueara la sincronizacion.'
        : 'El vendedor podra iniciar sesion y sincronizar nuevamente.';
    if (!await mostrarConfirmModal(`¿${accion} este vendedor?\n${msg}`, { destructivo: estaActivo, textoConfirmar: accion })) return;
    try {
        const { error } = await supabaseClient.from('perfiles').update({ activo: !estaActivo, actualizado_en: new Date().toISOString() }).eq('id', userId);
        if (error) throw error;
        mostrarToast(`Vendedor ${estaActivo ? 'bloqueado' : 'reactivado'}`, estaActivo ? 'error' : 'success');
        cargarListaVendedores();
    } catch (err) {
        console.error('[Admin] Error toggle acceso:', err);
        mostrarToast('Error al cambiar estado del vendedor', 'error');
    }
}

// ============================================
// HERRAMIENTAS Y BACKUP
// ============================================
async function crearBackup() {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
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
    await HDVStorage.setItem('hdv_admin_ultimo_backup', new Date().toISOString());
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

async function crearBackupSoloPedidos() {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
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

    await crearAutoBackupAdmin('Pre-restauracion');

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const backup = JSON.parse(e.target.result);

            if (backup.tipo === 'backup_admin_completo' && backup.datos) {
                productosData = backup.datos.productos;
                if (backup.datos.pedidos) await HDVStorage.setItem('hdv_pedidos', backup.datos.pedidos);
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
                await HDVStorage.setItem('hdv_pedidos', backup.pedidos);
                mostrarToast(`${backup.pedidos.length} pedidos restaurados.`, 'success');
                cargarPedidos();
            } else if (backup.tipo === 'backup_vendedor_completo' && backup.datos?.pedidos) {
                await HDVStorage.setItem('hdv_pedidos', backup.datos.pedidos);
                mostrarToast(`Pedidos del vendedor restaurados: ${backup.datos.pedidos.length}`, 'success');
                cargarPedidos();
            } else if (backup.datos) {
                productosData = backup.datos.productos;
                if (backup.datos.pedidos) await HDVStorage.setItem('hdv_pedidos', backup.datos.pedidos);
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
async function toggleAdminAutoBackup() {
    const toggle = document.getElementById('adminAutoBackupToggle');
    await HDVStorage.setItem('hdv_admin_auto_backup', toggle?.checked ? 'true' : 'false');
}

async function crearAutoBackupAdmin(motivo) {
    const enabled = (await HDVStorage.getItem('hdv_admin_auto_backup')) !== 'false';
    if (!enabled) return;

    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
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

    let historial = (await HDVStorage.getItem('hdv_admin_auto_backups')) || [];
    historial.unshift(backup);
    if (historial.length > 5) historial = historial.slice(0, 5);

    try {
        await HDVStorage.setItem('hdv_admin_auto_backups', historial);
    } catch (e) {
        console.warn('Auto-backup admin: espacio insuficiente');
        historial = historial.slice(0, 2);
        await HDVStorage.setItem('hdv_admin_auto_backups', historial);
    }
}

async function actualizarInfoBackupAdmin() {
    const ultimo = await HDVStorage.getItem('hdv_admin_ultimo_backup');
    const el = document.getElementById('adminUltimoBackup');
    if (el) el.textContent = ultimo ? `Ultimo: ${new Date(ultimo).toLocaleString('es-PY')}` : 'Sin backups';

    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    setEl('adminBackupProductos', productosData.productos?.length || 0);
    setEl('adminBackupClientes', productosData.clientes?.length || 0);
    setEl('adminBackupPedidos', pedidos.length);

    await mostrarHistorialBackupsAdmin();
}

async function mostrarHistorialBackupsAdmin() {
    const container = document.getElementById('adminHistorialBackups');
    if (!container) return;

    const historial = (await HDVStorage.getItem('hdv_admin_auto_backups')) || [];
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
    const historial = (await HDVStorage.getItem('hdv_admin_auto_backups')) || [];
    if (historial[idx]?.datos) {
        productosData = historial[idx].datos.productos;
        if (historial[idx].datos.pedidos) await HDVStorage.setItem('hdv_pedidos', historial[idx].datos.pedidos);
        productosDataOriginal = JSON.parse(JSON.stringify(productosData));
        mostrarToast('Auto-backup restaurado. Recargando...', 'success');
        setTimeout(() => location.reload(), 1000);
    }
}

async function descargarAutoBackupAdmin(idx) {
    const historial = (await HDVStorage.getItem('hdv_admin_auto_backups')) || [];
    if (historial[idx]) {
        descargarJSON(historial[idx], `hdv_autobackup_${new Date(historial[idx].fecha).toISOString().split('T')[0]}.json`);
    }
}

async function limpiarPedidos() {
    if (!await mostrarConfirmModal('¿ELIMINAR TODOS LOS PEDIDOS? Esto no se puede deshacer.', { destructivo: true, textoConfirmar: 'Eliminar Todo' })) return;
    if (!await mostrarConfirmModal('¿Estas seguro? Todos los datos de pedidos se perderan.', { destructivo: true, textoConfirmar: 'Si, eliminar' })) return;
    await crearAutoBackupAdmin('Pre-limpieza de pedidos');
    await HDVStorage.removeItem('hdv_pedidos');
    todosLosPedidos = [];
    mostrarToast('Pedidos eliminados. Se guardo un auto-backup por seguridad.', 'success');
    cargarPedidos();
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function mostrarToast(mensaje, tipo = 'info', duracion = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const iconos = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = `<span style="font-size:18px">${iconos[tipo] || ''}</span><span>${escapeHTML(mensaje)}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, duracion);
}

// ============================================
// CONFIRM MODAL
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
                    <p class="text-gray-800 font-semibold text-sm whitespace-pre-line leading-relaxed">${escapeHTML(mensaje)}</p>
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

// ============================================
// MODAL INPUT GENERICO
// ============================================
function mostrarInputModal(opciones = {}) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'confirm-backdrop';

        let camposHTML = '';
        for (const campo of (opciones.campos || [])) {
            const req = campo.requerido ? 'required' : '';
            const labelHTML = `<label class="block text-sm font-semibold text-gray-300 mb-1.5">${campo.label}${campo.requerido ? ' <span class="text-red-400">*</span>' : ''}</label>`;
            if (campo.tipo === 'select') {
                const optsHTML = (campo.opciones || []).map(o =>
                    `<option value="${escapeHTML(o.value)}" ${o.value === campo.valor ? 'selected' : ''}>${escapeHTML(o.label)}</option>`
                ).join('');
                camposHTML += `<div class="mb-3">${labelHTML}<select id="modal_field_${campo.key}" class="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" ${req}><option value="">-- Seleccionar --</option>${optsHTML}</select></div>`;
            } else if (campo.tipo === 'select-search') {
                const optsHTML = (campo.opciones || []).map(o =>
                    `<option value="${escapeHTML(o.value)}" ${o.value === campo.valor ? 'selected' : ''}>${escapeHTML(o.label)}</option>`
                ).join('');
                camposHTML += `<div class="mb-3">${labelHTML}
                    <input type="text" id="modal_search_${campo.key}" placeholder="Buscar..." class="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm mb-1 focus:ring-2 focus:ring-blue-500">
                    <select id="modal_field_${campo.key}" size="5" class="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500" ${req}>${optsHTML}</select>
                </div>`;
            } else if (campo.tipo === 'textarea') {
                camposHTML += `<div class="mb-3">${labelHTML}<textarea id="modal_field_${campo.key}" rows="4" class="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500" placeholder="${campo.placeholder || ''}" ${req}>${campo.valor || ''}</textarea></div>`;
            } else {
                camposHTML += `<div class="mb-3">${labelHTML}<input type="${campo.tipo || 'text'}" id="modal_field_${campo.key}" value="${campo.valor ?? ''}" placeholder="${campo.placeholder || ''}" class="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500" ${req} ${campo.tipo === 'number' ? 'min="0"' : ''}></div>`;
            }
        }

        const iconClass = opciones.destructivo ? 'bg-red-500/20' : 'bg-blue-500/20';
        const iconColor = opciones.destructivo ? 'text-red-400' : 'text-blue-400';
        const iconName = opciones.destructivo ? 'alert-triangle' : opciones.icono || 'edit-3';
        const btnClass = opciones.destructivo ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';

        backdrop.innerHTML = `
            <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-gray-700" onclick="event.stopPropagation()">
                <div class="p-6">
                    <div class="flex items-center gap-3 mb-5">
                        <div class="w-10 h-10 rounded-xl ${iconClass} flex items-center justify-center shrink-0">
                            <i data-lucide="${iconName}" class="w-5 h-5 ${iconColor}"></i>
                        </div>
                        <h3 class="text-lg font-bold text-white">${opciones.titulo || 'Ingrese datos'}</h3>
                    </div>
                    ${opciones.subtitulo ? `<p class="text-sm text-gray-400 mb-4">${opciones.subtitulo}</p>` : ''}
                    <div>${camposHTML}</div>
                </div>
                <div class="flex gap-3 p-4 bg-gray-800/50 border-t border-gray-700">
                    <button class="modal-cancel-btn flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2.5 rounded-xl font-bold text-sm transition-colors">Cancelar</button>
                    <button class="modal-ok-btn flex-1 ${btnClass} text-white py-2.5 rounded-xl font-bold text-sm transition-colors">${opciones.textoConfirmar || 'Confirmar'}</button>
                </div>
            </div>`;

        document.body.appendChild(backdrop);
        lucide.createIcons();

        for (const campo of (opciones.campos || [])) {
            if (campo.tipo === 'select-search') {
                const searchInput = backdrop.querySelector(`#modal_search_${campo.key}`);
                const selectEl = backdrop.querySelector(`#modal_field_${campo.key}`);
                const allOpts = (campo.opciones || []);
                searchInput.addEventListener('input', () => {
                    const q = searchInput.value.toLowerCase();
                    selectEl.innerHTML = allOpts.filter(o => o.label.toLowerCase().includes(q))
                        .map(o => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('');
                });
                searchInput.focus();
            }
        }

        const primerInput = backdrop.querySelector('input[type="text"], input[type="number"], textarea');
        if (primerInput && !backdrop.querySelector('[id^="modal_search_"]')) primerInput.focus();

        const cerrar = (result) => { backdrop.remove(); resolve(result); };

        const confirmar = () => {
            const datos = {};
            for (const campo of (opciones.campos || [])) {
                const el = backdrop.querySelector(`#modal_field_${campo.key}`);
                if (!el) continue;
                const val = el.value;
                if (campo.requerido && !val.trim()) {
                    el.classList.add('ring-2', 'ring-red-500');
                    el.focus();
                    return;
                }
                datos[campo.key] = campo.tipo === 'number' ? (parseFloat(val) || 0) : val;
            }
            cerrar(datos);
        };

        backdrop.querySelector('.modal-cancel-btn').onclick = () => cerrar(null);
        backdrop.querySelector('.modal-ok-btn').onclick = confirmar;
        backdrop.onclick = (e) => { if (e.target === backdrop) cerrar(null); };
        backdrop.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmar(); });
        });
    });
}

// ============================================
// CONFIGURACION EMPRESA (SIFEN)
// ============================================
async function cargarConfigEmpresa() {
    try {
        const { data, error } = await SupabaseService.fetchConfigEmpresa();
        if (error) { console.log('[Config Empresa] No cargada:', error.message); return; }
        if (!data) return;
        const campos = {
            cfgEmpresaRuc: data.ruc_empresa,
            cfgEmpresaRazon: data.razon_social,
            cfgEmpresaNombreFantasia: data.nombre_fantasia,
            cfgEmpresaTimbrado: data.timbrado_numero,
            cfgEmpresaTimbradoVenc: data.timbrado_vencimiento,
            cfgEmpresaEstablecimiento: data.establecimiento,
            cfgEmpresaPuntoExp: data.punto_expedicion,
            cfgEmpresaDireccion: data.direccion_fiscal,
            cfgEmpresaTelefono: data.telefono_empresa,
            cfgEmpresaEmail: data.email_empresa,
            cfgEmpresaActividad: data.actividad_economica
        };
        for (const [elId, valor] of Object.entries(campos)) {
            const el = document.getElementById(elId);
            if (el && valor) el.value = valor;
        }
        console.log('[Config Empresa] Datos cargados');
    } catch (e) {
        console.error('[Config Empresa] Error:', e);
    }
}

async function guardarConfigEmpresa() {
    const datos = {
        id: 1,
        ruc_empresa: document.getElementById('cfgEmpresaRuc')?.value.trim() || '',
        razon_social: document.getElementById('cfgEmpresaRazon')?.value.trim() || '',
        nombre_fantasia: document.getElementById('cfgEmpresaNombreFantasia')?.value.trim() || '',
        timbrado_numero: document.getElementById('cfgEmpresaTimbrado')?.value.trim() || '',
        timbrado_vencimiento: document.getElementById('cfgEmpresaTimbradoVenc')?.value || null,
        establecimiento: document.getElementById('cfgEmpresaEstablecimiento')?.value.trim() || '001',
        punto_expedicion: document.getElementById('cfgEmpresaPuntoExp')?.value.trim() || '001',
        direccion_fiscal: document.getElementById('cfgEmpresaDireccion')?.value.trim() || '',
        telefono_empresa: document.getElementById('cfgEmpresaTelefono')?.value.trim() || '',
        email_empresa: document.getElementById('cfgEmpresaEmail')?.value.trim() || '',
        actividad_economica: document.getElementById('cfgEmpresaActividad')?.value.trim() || '',
        actualizado_en: new Date().toISOString()
    };

    if (!datos.ruc_empresa) { mostrarToast('Ingresa el RUC de la empresa', 'error'); return; }
    if (!datos.razon_social) { mostrarToast('Ingresa la razon social', 'error'); return; }

    const btn = document.getElementById('btnGuardarConfigEmpresa');
    if (btn && btn.disabled) return;
    const textoOriginal = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = '<svg class="w-4 h-4 animate-spin inline mr-1.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Guardando...';
    }

    try {
        const { success, error } = await SupabaseService.upsertConfigEmpresa(datos);
        if (!success) throw error;
        mostrarToast('Datos fiscales guardados correctamente', 'success');
    } catch (e) {
        console.error('[Config Empresa] Error guardando:', e);
        mostrarToast('Error al guardar: ' + (e?.message || e), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = textoOriginal;
        }
    }
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
                setInterval(() => { try { reg.update(); } catch(e) {} }, 30000);
                reg.addEventListener('updatefound', () => {
                    const nw = reg.installing;
                    if (!nw) return;
                    nw.addEventListener('statechange', () => {
                        try {
                            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                                nw.postMessage('skipWaiting');
                                mostrarToast('Nueva version disponible. Recargando...', 'info');
                                setTimeout(() => location.reload(true), 1500);
                            }
                        } catch(e) { console.log('[Admin SW] statechange error ignorado'); }
                    });
                });
            }).catch(err => console.log('[Admin SW] Error:', err));
        try {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log('[Admin SW] Nuevo service worker activo');
            });
        } catch(e) {}
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

    // Buscar productos (A-07: data-attributes en lugar de inline onclick)
    const prods = (productosData.productos || []).filter(p => p.nombre.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)).slice(0, 5);
    if (prods.length > 0) {
        html += '<p class="px-4 py-2 text-xs font-bold text-gray-500 uppercase">Productos</p>';
        prods.forEach(p => {
            html += `<button data-search-type="producto" data-search-nombre="${escapeHTML(p.nombre)}" class="w-full text-left px-4 py-3 hover:bg-gray-100 rounded-lg flex items-center gap-3">
                <i data-lucide="package" class="w-5 h-5 text-gray-400"></i>
                <div><p class="font-medium text-gray-800 text-sm">${escapeHTML(p.nombre)}</p><p class="text-xs text-gray-400">${escapeHTML(p.id)} - ${escapeHTML(p.categoria)}</p></div>
            </button>`;
        });
    }

    // Buscar clientes (A-07: data-attributes en lugar de inline onclick)
    const clis = (productosData.clientes || []).filter(c => (c.razon_social || c.nombre || '').toLowerCase().includes(q) || (c.ruc || '').includes(q) || (c.telefono || '').includes(q)).slice(0, 5);
    if (clis.length > 0) {
        html += '<p class="px-4 py-2 text-xs font-bold text-gray-500 uppercase">Clientes</p>';
        clis.forEach(c => {
            html += `<button data-search-type="cliente" data-search-id="${escapeHTML(c.id)}" class="w-full text-left px-4 py-3 hover:bg-gray-100 rounded-lg flex items-center gap-3">
                <i data-lucide="user" class="w-5 h-5 text-gray-400"></i>
                <div><p class="font-medium text-gray-800 text-sm">${escapeHTML(c.razon_social || c.nombre)}</p><p class="text-xs text-gray-400">${escapeHTML(c.zona || '')} - ${escapeHTML(c.telefono || '')}</p></div>
            </button>`;
        });
    }

    // Buscar pedidos
    const peds = (todosLosPedidos || []).filter(p => p.id?.toLowerCase().includes(q) || (p.cliente?.nombre || '').toLowerCase().includes(q)).slice(0, 5);
    if (peds.length > 0) {
        html += '<p class="px-4 py-2 text-xs font-bold text-gray-500 uppercase">Pedidos</p>';
        peds.forEach(p => {
            html += `<button data-search-type="pedido" class="w-full text-left px-4 py-3 hover:bg-gray-100 rounded-lg flex items-center gap-3">
                <i data-lucide="clipboard-list" class="w-5 h-5 text-gray-400"></i>
                <div><p class="font-medium text-gray-800 text-sm">${escapeHTML(p.cliente?.nombre || 'N/A')}</p><p class="text-xs text-gray-400">${escapeHTML(p.id)} - Gs. ${(p.total || 0).toLocaleString()}</p></div>
            </button>`;
        });
    }

    if (!html) html = '<p class="p-6 text-center text-gray-500 text-sm font-medium">Sin resultados para esta busqueda</p>';
    results.innerHTML = html;
    lucide.createIcons();

    // A-07: Event delegation para resultados de busqueda global
    results.querySelectorAll('[data-search-type]').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.getAttribute('data-search-type');
            cerrarBusquedaGlobal(null);
            if (type === 'producto') {
                cambiarSeccion('productos');
                const nombre = this.getAttribute('data-search-nombre');
                setTimeout(() => {
                    const input = document.getElementById('buscarProducto');
                    if (input) { input.value = nombre; filtrarProductos(); }
                }, 100);
            } else if (type === 'cliente') {
                cambiarSeccion('clientes');
                const clienteId = this.getAttribute('data-search-id');
                setTimeout(() => abrirPerfilCliente(clienteId), 200);
            } else if (type === 'pedido') {
                cambiarSeccion('pedidos');
            }
        });
    });
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const overlay = document.getElementById('globalSearchOverlay');
        if (overlay.classList.contains('show')) cerrarBusquedaGlobal(null);
        else abrirBusquedaGlobal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (cambiosSinGuardar > 0) {
            guardarTodosCambios(); // ya muestra su propio toast
        } else {
            mostrarToast('No hay cambios pendientes', 'info');
        }
    }
    if (e.key === 'Escape') {
        const search = document.getElementById('globalSearchOverlay');
        if (search.classList.contains('show')) { cerrarBusquedaGlobal(null); return; }
    }
});

// ============================================
// DEBOUNCED SEARCH WRAPPERS (300ms)
// ============================================
const ejecutarBusquedaGlobalDebounced = debounce(ejecutarBusquedaGlobal, 300);
