// ============================================
// HDV Admin Panel v4.0 - Dashboard, PDF, Edicion de Pedidos
// ============================================
let todosLosPedidos = [];
let productosData = { productos: [], categorias: [], clientes: [] };
let productosDataOriginal = null;
let productosFiltrados = [];
let clientesFiltrados = [];
let clienteActualPrecios = null;
let cambiosSinGuardar = 0;
let stockFiltrado = [];

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
        'dashboard': 'Dashboard', 'pedidos': 'Gestion de Pedidos', 'creditos': 'Control de Creditos',
        'reportes': 'Analisis y Reportes', 'stock': 'Inventario',
        'productos': 'Catalogo de Productos', 'clientes': 'Base de Datos de Clientes',
        'precios': 'Configuracion de Precios', 'promociones': 'Motor de Promociones',
        'rendiciones': 'Rendiciones de Caja', 'metas': 'Metas y Comisiones',
        'inactivos': 'Clientes en Riesgo', 'herramientas': 'Sistema y Herramientas'
    };
    const titleEl = document.getElementById('currentSectionTitle');
    if (titleEl) titleEl.textContent = titulos[seccionId] || 'Panel Admin';
    
    // Cargar datos al entrar
    if (seccionId === 'pedidos') cargarPedidos();
    if (seccionId === 'productos') { productosFiltrados = [...productosData.productos]; mostrarProductosGestion(); }
    if (seccionId === 'clientes') { clientesFiltrados = [...productosData.clientes]; mostrarClientesGestion(); }
    if (seccionId === 'creditos') cargarCreditos();
    if (seccionId === 'stock') cargarStock();
    if (seccionId === 'precios') cargarSelectPreciosCliente();
    if (seccionId === 'herramientas') actualizarInfoBackupAdmin();
    if (seccionId === 'dashboard') cargarDashboard();
    if (seccionId === 'creditos') cargarCreditos();
    if (seccionId === 'promociones') cargarPromociones();
    if (seccionId === 'rendiciones') cargarRendiciones();
    if (seccionId === 'metas') cargarMetas();
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
                alert('Cambios guardados y sincronizados. Los vendedores ya ven los cambios.');
            } else {
                alert('Error al sincronizar con Firebase. Los cambios se guardaron localmente. Tambien se descarga el JSON como respaldo.');
                descargarJSON(productosData, 'productos.json');
            }
        }).catch(err => {
            console.error('[Admin] Error Firebase:', err);
            alert('Error de Firebase: ' + err.message + '\nLos cambios estan guardados localmente.');
            descargarJSON(productosData, 'productos.json');
        });
    } else {
        descargarJSON(productosData, 'productos.json');
        alert('Firebase no disponible. JSON descargado como respaldo.');
    }
}

function descartarCambios() {
    if (!confirm('¿Descartar todos los cambios? Se perderan las modificaciones.')) return;
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
    let filtrados = todosLosPedidos;
    if (fecha) filtrados = filtrados.filter(p => new Date(p.fecha).toISOString().split('T')[0] === fecha);
    if (cliente) filtrados = filtrados.filter(p => p.cliente?.id === cliente);
    mostrarPedidos(filtrados);
    actualizarEstadisticasPedidos(filtrados);
}

function mostrarPedidos(pedidos) {
    const container = document.getElementById('listaPedidos');
    if (!container) return;
    if (pedidos.length === 0) {
        container.innerHTML = '<div class="p-8 text-center"><div class="text-5xl mb-3">📦</div><p class="text-gray-400 font-medium">No hay pedidos para mostrar</p></div>';
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
                    <div class="text-sm text-gray-500 mt-1">📍 ${zona} • 🕐 ${new Date(p.fecha).toLocaleString('es-PY')}</div>
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
            ${p.notas ? `<div class="text-sm text-gray-500 italic mb-3">📝 ${p.notas}</div>` : ''}
            <div class="flex justify-between items-center pt-3 border-t border-gray-100">
                <span class="text-sm text-gray-500">${p.tipoPago || 'contado'}${p.descuento > 0 ? ` | ${p.descuento}% desc.` : ''}</span>
                <span class="text-xl font-bold text-gray-900">Gs. ${(p.total || 0).toLocaleString()}</span>
            </div>
            <div class="flex gap-2 mt-4 flex-wrap">
                ${estado === 'pendiente' ?
                    `<button class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700" onclick="marcarEntregado('${p.id}')">✓ Entregado</button>` :
                    `<button class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-300" onclick="marcarPendiente('${p.id}')">↩ Pendiente</button>`}
                <button class="bg-blue-50 text-blue-600 px-3 py-2 rounded-lg text-sm font-bold hover:bg-blue-100" onclick="abrirModalEditarPedido('${p.id}')">✏️ Editar</button>
                <button class="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-red-100" onclick="generarPDFRemision('${p.id}')">📄 PDF</button>
                <button class="bg-purple-50 text-purple-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-purple-100" onclick="generarTicketTermico('${p.id}')">🖨️ Ticket</button>
                <button class="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm font-bold hover:bg-red-100" onclick="eliminarPedido('${p.id}')">🗑️</button>
            </div>`;
        container.appendChild(div);
    });
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

function eliminarPedido(id) {
    if (!confirm('¿Eliminar este pedido?')) return;
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
    if (pedidos.length === 0) { alert('No hay pedidos para exportar'); return; }
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
    if (!desde || !hasta) { alert('Selecciona rango de fechas'); return; }
    
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const filtrados = pedidos.filter(p => {
        const fecha = new Date(p.fecha).toISOString().split('T')[0];
        return fecha >= desde && fecha <= hasta;
    });
    
    const container = document.getElementById('contenidoReporte');
    if (!container) return;
    
    if (filtrados.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-8">No hay datos para el rango seleccionado</p>';
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
function cargarStock() {
    stockFiltrado = [];
    productosData.productos.forEach(prod => {
        prod.presentaciones.forEach(pres => {
            stockFiltrado.push({
                productoId: prod.id,
                nombre: prod.nombre,
                tamano: pres.tamano,
                stock: pres.stock || 0
            });
        });
    });
    filtrarStock();
}

function filtrarStock() {
    const filtro = document.getElementById('buscarStock')?.value.toLowerCase() || '';
    const tbody = document.getElementById('tablaStock');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    stockFiltrado.filter(s => s.nombre.toLowerCase().includes(filtro)).forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50';
        tr.innerHTML = `
            <td class="px-6 py-3 font-medium">${item.nombre}</td>
            <td class="px-6 py-3 text-gray-500">${item.tamano}</td>
            <td class="px-6 py-3"><span class="font-bold ${item.stock <= 0 ? 'text-red-600' : item.stock < 10 ? 'text-yellow-600' : 'text-green-600'}">${item.stock}</span></td>
            <td class="px-6 py-3">
                <div class="flex items-center gap-2">
                    <button onclick="ajustarStock('${item.productoId}','${item.tamano}',-1)" class="w-7 h-7 bg-red-50 text-red-600 rounded font-bold">−</button>
                    <button onclick="ajustarStock('${item.productoId}','${item.tamano}',1)" class="w-7 h-7 bg-green-50 text-green-600 rounded font-bold">+</button>
                    <button onclick="ajustarStock('${item.productoId}','${item.tamano}',10)" class="w-7 h-7 bg-blue-50 text-blue-600 rounded text-xs font-bold">+10</button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
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
function filtrarProductos() {
    const filtro = document.getElementById('buscarProducto')?.value.toLowerCase() || '';
    const mostrarOcultos = document.getElementById('mostrarOcultosProductos')?.checked || false;
    productosFiltrados = productosData.productos.filter(p => {
        const match = p.nombre.toLowerCase().includes(filtro) || p.id.toLowerCase().includes(filtro);
        const visible = mostrarOcultos || !p.oculto;
        return match && visible;
    });
    mostrarProductosGestion();
}

function mostrarProductosGestion() {
    const tbody = document.getElementById('tablaProductosCuerpo');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    productosFiltrados.forEach(prod => {
        const presHTML = prod.presentaciones.map((p, i) => `
            <div class="flex items-center gap-2 mb-1">
                <input type="text" value="${p.tamano}" onchange="actualizarPresentacion('${prod.id}',${i},'tamano',this.value)" class="w-20 px-2 py-1 text-xs border border-gray-200 rounded">
                <span class="text-gray-400 text-xs">Gs.</span>
                <input type="number" value="${p.precio_base}" onchange="actualizarPresentacion('${prod.id}',${i},'precio',this.value)" class="w-24 px-2 py-1 text-xs border border-gray-200 rounded">
                <button onclick="eliminarPresentacion('${prod.id}',${i})" class="text-red-400 hover:text-red-600 font-bold text-sm">×</button>
            </div>`).join('');
        
        const imgHTML = prod.imagen 
            ? `<img src="${prod.imagen}" class="w-12 h-12 object-contain rounded border border-gray-200 cursor-pointer" onclick="editarImagenProducto('${prod.id}')" onerror="this.outerHTML='<div class=\\'w-12 h-12 bg-gray-100 rounded flex items-center justify-center cursor-pointer text-xl\\' onclick=\\'editarImagenProducto(\\\"${prod.id}\\\")\\'>📷</div>'">`
            : `<div class="w-12 h-12 bg-gray-100 rounded flex items-center justify-center cursor-pointer text-xl hover:bg-gray-200" onclick="editarImagenProducto('${prod.id}')">📷</div>`;
        
        const oculto = prod.oculto || false;
        const tr = document.createElement('tr');
        tr.className = `hover:bg-gray-50 ${oculto ? 'opacity-40' : ''}`;
        tr.innerHTML = `
            <td class="px-4 py-3 text-xs text-gray-400 font-mono">${prod.id}</td>
            <td class="px-4 py-3">${imgHTML}</td>
            <td class="px-4 py-3"><input type="text" value="${prod.nombre}" onchange="actualizarProducto('${prod.id}','nombre',this.value)" class="w-full px-2 py-1 border border-transparent hover:border-gray-300 rounded bg-transparent font-medium"></td>
            <td class="px-4 py-3">
                <select onchange="actualizarProducto('${prod.id}','categoria',this.value)" class="w-full px-1 py-1 text-xs border border-transparent hover:border-gray-300 rounded bg-transparent">
                    ${productosData.categorias.map(c => `<option value="${c.id}" ${c.id === prod.categoria ? 'selected' : ''}>${c.nombre}</option>`).join('')}
                </select>
                <input type="text" value="${prod.subcategoria || ''}" onchange="actualizarProducto('${prod.id}','subcategoria',this.value)" class="w-full mt-1 px-1 py-1 text-xs border border-transparent hover:border-gray-300 rounded bg-transparent text-gray-400" placeholder="Subcategoria">
            </td>
            <td class="px-4 py-3">${presHTML}<button onclick="agregarPresentacion('${prod.id}')" class="text-xs text-blue-600 font-bold hover:underline">+ Agregar</button></td>
            <td class="px-4 py-3">
                <div class="flex gap-1">
                    <button onclick="toggleOcultarProducto('${prod.id}')" class="p-2 rounded hover:bg-gray-200 text-lg" title="${oculto ? 'Mostrar' : 'Ocultar'}">${oculto ? '👁️' : '🙈'}</button>
                    <button onclick="eliminarProducto('${prod.id}')" class="p-2 rounded hover:bg-red-100 text-lg text-red-500">🗑️</button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
}

function actualizarProducto(id, campo, valor) {
    const p = productosData.productos.find(x => x.id === id);
    if (p) { p[campo] = valor; registrarCambio(); }
}

function actualizarPresentacion(id, idx, campo, valor) {
    const p = productosData.productos.find(x => x.id === id);
    if (p && p.presentaciones[idx]) {
        if (campo === 'precio') p.presentaciones[idx].precio_base = parseInt(valor) || 0;
        else p.presentaciones[idx].tamano = valor;
        registrarCambio();
    }
}

function editarImagenProducto(id) {
    const prod = productosData.productos.find(p => p.id === id);
    if (!prod) return;
    const url = prompt(`📷 Imagen para: ${prod.nombre}\n\nPega la URL (vacio para quitar):`, prod.imagen || '');
    if (url === null) return;
    if (url.trim()) prod.imagen = url.trim();
    else delete prod.imagen;
    registrarCambio();
    mostrarProductosGestion();
}

function eliminarPresentacion(id, idx) {
    const p = productosData.productos.find(x => x.id === id);
    if (p && p.presentaciones.length > 1) { p.presentaciones.splice(idx, 1); registrarCambio(); mostrarProductosGestion(); }
    else alert('Debe tener al menos una presentacion');
}

function agregarPresentacion(id) {
    const p = productosData.productos.find(x => x.id === id);
    if (p) { p.presentaciones.push({ tamano: '', precio_base: 0 }); registrarCambio(); mostrarProductosGestion(); }
}

function eliminarProducto(id) {
    if (!confirm('¿Eliminar este producto?')) return;
    productosData.productos = productosData.productos.filter(p => p.id !== id);
    productosFiltrados = productosFiltrados.filter(p => p.id !== id);
    registrarCambio();
    mostrarProductosGestion();
}

function toggleOcultarProducto(id) {
    const prod = productosData.productos.find(p => p.id === id);
    if (prod) { prod.oculto = !prod.oculto; registrarCambio(); mostrarProductosGestion(); }
}

function abrirModalProducto() {
    const select = document.getElementById('nuevoProductoCategoria');
    if (select) {
        select.innerHTML = '';
        productosData.categorias.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
        });
    }
    document.getElementById('modalProducto')?.classList.add('show');
}

function cerrarModalProducto() {
    document.getElementById('modalProducto')?.classList.remove('show');
}

function agregarNuevoProducto() {
    const nombre = document.getElementById('nuevoProductoNombre')?.value.trim();
    const imagen = document.getElementById('nuevoProductoImagen')?.value.trim();
    const categoria = document.getElementById('nuevoProductoCategoria')?.value;
    const subcategoria = document.getElementById('nuevoProductoSubcategoria')?.value.trim();
    const presentacionesStr = document.getElementById('nuevoProductoPresentaciones')?.value.trim();
    const precio = parseInt(document.getElementById('nuevoProductoPrecio')?.value) || 0;
    
    if (!nombre) { alert('Ingresa el nombre del producto'); return; }
    
    const ultimoId = productosData.productos.length > 0 ? 
        Math.max(...productosData.productos.map(p => parseInt(p.id.replace('P', '')) || 0)) : 0;
    const nuevoId = `P${String(ultimoId + 1).padStart(3, '0')}`;
    
    const presentaciones = presentacionesStr 
        ? presentacionesStr.split(',').map(p => ({ tamano: p.trim(), precio_base: precio }))
        : [{ tamano: 'Unidad', precio_base: precio }];
    
    const nuevo = { id: nuevoId, nombre, categoria: categoria || 'cuidado_personal', subcategoria: subcategoria || 'General', presentaciones };
    if (imagen) nuevo.imagen = imagen;
    
    productosData.productos.push(nuevo);
    productosFiltrados = [...productosData.productos];
    registrarCambio();
    mostrarProductosGestion();
    cerrarModalProducto();
    
    // Limpiar form
    ['nuevoProductoNombre','nuevoProductoImagen','nuevoProductoSubcategoria','nuevoProductoPresentaciones','nuevoProductoPrecio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

// ============================================
// GESTIONAR CLIENTES
// ============================================
function filtrarClientes() {
    const filtro = document.getElementById('buscarCliente')?.value.toLowerCase() || '';
    const mostrarOcultos = document.getElementById('mostrarOcultosClientes')?.checked || false;
    clientesFiltrados = productosData.clientes.filter(c => {
        const match = (c.razon_social || c.nombre || '').toLowerCase().includes(filtro) || 
                      (c.ruc || '').toLowerCase().includes(filtro) ||
                      (c.id || '').toLowerCase().includes(filtro) ||
                      (c.direccion || c.zona || '').toLowerCase().includes(filtro);
        const visible = mostrarOcultos || !c.oculto;
        return match && visible;
    });
    mostrarClientesGestion();
}

function mostrarClientesGestion() {
    const container = document.getElementById('listaClientes');
    if (!container) return;
    container.innerHTML = '';
    
    clientesFiltrados.forEach(cliente => {
        const oculto = cliente.oculto || false;
        const precios = cliente.precios_personalizados ? Object.keys(cliente.precios_personalizados).length : 0;
        const div = document.createElement('div');
        div.className = `bg-white p-5 rounded-xl border border-gray-200 shadow-sm ${oculto ? 'opacity-40' : ''}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold text-gray-800 text-lg">${cliente.razon_social || cliente.nombre || 'Sin nombre'}</p>
                    <p class="text-sm text-gray-500">📍 ${cliente.direccion || cliente.zona || 'Sin direccion'}</p>
                </div>
                <span class="text-xs text-gray-400 font-mono">${cliente.id}</span>
            </div>
            <div class="text-xs text-gray-400 mb-3 space-y-1">
                <p>RUC: ${cliente.ruc || 'N/A'} • Tel: ${cliente.telefono || 'N/A'}</p>
                ${cliente.encargado ? `<p>Encargado: ${cliente.encargado}</p>` : ''}
                ${precios > 0 ? `<p class="text-blue-600 font-bold">${precios} precios personalizados</p>` : ''}
            </div>
            <div class="flex gap-2">
                <button onclick="toggleOcultarCliente('${cliente.id}')" class="text-xs px-3 py-1 rounded-lg border font-bold ${oculto ? 'text-green-600 border-green-200 bg-green-50' : 'text-yellow-600 border-yellow-200 bg-yellow-50'}">${oculto ? '👁️ Mostrar' : '🙈 Ocultar'}</button>
                <button onclick="eliminarCliente('${cliente.id}')" class="text-xs text-red-600 bg-red-50 px-3 py-1 rounded-lg border border-red-100 font-bold">🗑️ Eliminar</button>
            </div>`;
        container.appendChild(div);
    });
}

function toggleOcultarCliente(id) {
    const c = productosData.clientes.find(x => x.id === id);
    if (c) { c.oculto = !c.oculto; registrarCambio(); clientesFiltrados = [...productosData.clientes]; mostrarClientesGestion(); }
}

function eliminarCliente(id) {
    if (!confirm('¿Eliminar este cliente y sus precios personalizados?')) return;
    productosData.clientes = productosData.clientes.filter(c => c.id !== id);
    clientesFiltrados = clientesFiltrados.filter(c => c.id !== id);
    registrarCambio();
    mostrarClientesGestion();
}

function abrirModalCliente() {
    document.getElementById('modalCliente')?.classList.add('show');
}

function cerrarModalCliente() {
    document.getElementById('modalCliente')?.classList.remove('show');
}

function agregarNuevoCliente() {
    const razon = document.getElementById('nuevoClienteRazon')?.value.trim();
    const ruc = document.getElementById('nuevoClienteRUC')?.value.trim();
    const telefono = document.getElementById('nuevoClienteTelefono')?.value.trim();
    const direccion = document.getElementById('nuevoClienteDireccion')?.value.trim();
    const encargado = document.getElementById('nuevoClienteEncargado')?.value.trim();
    
    if (!razon) { alert('Ingresa la razon social'); return; }
    
    const ultimoId = productosData.clientes.length > 0 ?
        Math.max(...productosData.clientes.map(c => parseInt(c.id.replace('C', '')) || 0)) : 0;
    const nuevoId = `C${String(ultimoId + 1).padStart(3, '0')}`;
    
    productosData.clientes.push({
        id: nuevoId, nombre: razon, razon_social: razon, ruc: ruc || '',
        telefono: telefono || '', direccion: direccion || '', zona: direccion || '',
        encargado: encargado || '', tipo: 'mayorista_estandar', precios_personalizados: {}
    });
    
    clientesFiltrados = [...productosData.clientes];
    registrarCambio();
    mostrarClientesGestion();
    cerrarModalCliente();
    
    ['nuevoClienteRazon','nuevoClienteRUC','nuevoClienteTelefono','nuevoClienteDireccion','nuevoClienteEncargado'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
}

// ============================================
// PRECIOS POR CLIENTE
// ============================================
function cargarSelectPreciosCliente() {
    const select = document.getElementById('preciosCliente');
    if (!select) return;
    select.innerHTML = '<option value="">-- Seleccione un cliente --</option>';
    productosData.clientes.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.razon_social || c.nombre} (${c.id})</option>`;
    });
}

function cargarPreciosCliente() {
    const clienteId = document.getElementById('preciosCliente')?.value;
    if (!clienteId) { document.getElementById('preciosCard').style.display = 'none'; return; }
    
    clienteActualPrecios = productosData.clientes.find(c => c.id === clienteId);
    if (!clienteActualPrecios) return;
    
    document.getElementById('preciosCard').style.display = '';
    const tbody = document.getElementById('preciosBody');
    tbody.innerHTML = '';
    
    productosData.productos.forEach(prod => {
        prod.presentaciones.forEach(pres => {
            const precioPersonalizado = clienteActualPrecios.precios_personalizados?.[prod.id]?.find(p => p.tamano === pres.tamano);
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50';
            tr.innerHTML = `
                <td class="px-6 py-3 font-medium">${prod.nombre}</td>
                <td class="px-6 py-3 text-gray-500">${pres.tamano}</td>
                <td class="px-6 py-3 text-gray-400">Gs. ${pres.precio_base.toLocaleString()}</td>
                <td class="px-6 py-3">
                    <input type="number" value="${precioPersonalizado?.precio || ''}" placeholder="${pres.precio_base}" 
                        data-producto="${prod.id}" data-tamano="${pres.tamano}"
                        class="w-32 px-2 py-1 border border-gray-200 rounded text-sm">
                </td>`;
            tbody.appendChild(tr);
        });
    });
    
    // Filtro
    const buscar = document.getElementById('buscarProductoPrecio');
    if (buscar) {
        buscar.oninput = () => {
            const filtro = buscar.value.toLowerCase();
            tbody.querySelectorAll('tr').forEach(tr => {
                const nombre = tr.querySelector('td')?.textContent.toLowerCase() || '';
                tr.style.display = nombre.includes(filtro) ? '' : 'none';
            });
        };
    }
}

function guardarPreciosPersonalizados() {
    if (!clienteActualPrecios) return;
    
    const inputs = document.querySelectorAll('[data-producto]');
    const nuevosPrecios = {};
    
    inputs.forEach(input => {
        const prodId = input.dataset.producto;
        const tamano = input.dataset.tamano;
        const precio = parseInt(input.value) || 0;
        if (precio > 0) {
            if (!nuevosPrecios[prodId]) nuevosPrecios[prodId] = [];
            nuevosPrecios[prodId].push({ tamano, precio });
        }
    });
    
    const cliente = productosData.clientes.find(c => c.id === clienteActualPrecios.id);
    if (cliente) {
        cliente.precios_personalizados = nuevosPrecios;
        registrarCambio();
        alert('Precios guardados en memoria. Usa "Guardar y Descargar JSON" para aplicar.');
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
    if (pedidos.length === 0) { alert('No hay pedidos'); return; }
    const backup = {
        tipo: 'backup_pedidos',
        fecha: new Date().toISOString(),
        version: '3.0',
        pedidos
    };
    descargarJSON(backup, `hdv_pedidos_${new Date().toISOString().split('T')[0]}.json`);
}

function restaurarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('¿Reemplazar todos los datos actuales con el backup?')) { event.target.value = ''; return; }

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
                alert(`Backup completo restaurado.\n${backup.resumen?.totalProductos || '?'} productos, ${backup.resumen?.totalPedidos || '?'} pedidos`);
                setTimeout(() => location.reload(), 1000);
            } else if (backup.tipo === 'backup_catalogo' && backup.datos) {
                productosData.categorias = backup.datos.categorias || productosData.categorias;
                productosData.productos = backup.datos.productos || productosData.productos;
                productosData.clientes = backup.datos.clientes || productosData.clientes;
                productosDataOriginal = JSON.parse(JSON.stringify(productosData));
                alert('Catalogo restaurado.');
                setTimeout(() => location.reload(), 1000);
            } else if (backup.tipo === 'backup_pedidos' && backup.pedidos) {
                localStorage.setItem('hdv_pedidos', JSON.stringify(backup.pedidos));
                alert(`${backup.pedidos.length} pedidos restaurados.`);
                cargarPedidos();
            } else if (backup.tipo === 'backup_vendedor_completo' && backup.datos?.pedidos) {
                // Compatible con backups del vendedor
                localStorage.setItem('hdv_pedidos', JSON.stringify(backup.datos.pedidos));
                alert(`Pedidos del vendedor restaurados: ${backup.datos.pedidos.length}`);
                cargarPedidos();
            } else if (backup.datos) {
                // Formato legacy v2.9
                productosData = backup.datos.productos;
                if (backup.datos.pedidos) localStorage.setItem('hdv_pedidos', JSON.stringify(backup.datos.pedidos));
                productosDataOriginal = JSON.parse(JSON.stringify(productosData));
                alert('Backup restaurado (formato anterior).');
                setTimeout(() => location.reload(), 1000);
            } else {
                alert('Formato de backup no reconocido');
            }
        } catch (err) { alert('Error: archivo invalido'); }
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

function restaurarAutoBackupAdmin(idx) {
    if (!confirm('¿Restaurar este auto-backup? Los datos actuales seran reemplazados.')) return;
    const historial = JSON.parse(localStorage.getItem('hdv_admin_auto_backups') || '[]');
    if (historial[idx]?.datos) {
        productosData = historial[idx].datos.productos;
        if (historial[idx].datos.pedidos) localStorage.setItem('hdv_pedidos', JSON.stringify(historial[idx].datos.pedidos));
        productosDataOriginal = JSON.parse(JSON.stringify(productosData));
        alert('Auto-backup restaurado. La pagina se recargara.');
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
            if (lines.length < 2) { alert('Archivo vacio o sin datos'); return; }
            
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
                alert(`${agregados} productos importados. Usa "Guardar y Descargar JSON" para aplicar.`);
            }
        } catch (err) { alert('Error al importar: ' + err.message); }
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
            if (lines.length < 2) { alert('Archivo vacio'); return; }
            
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
                alert(`${agregados} clientes importados. Usa "Guardar y Descargar JSON" para aplicar.`);
            }
        } catch (err) { alert('Error al importar: ' + err.message); }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function limpiarPedidos() {
    if (!confirm('¿ELIMINAR TODOS LOS PEDIDOS? Esto no se puede deshacer.')) return;
    if (!confirm('¿Estas seguro? Todos los datos de pedidos se perderan.')) return;
    crearAutoBackupAdmin('Pre-limpieza de pedidos');
    localStorage.removeItem('hdv_pedidos');
    todosLosPedidos = [];
    alert('Pedidos eliminados. Se guardo un auto-backup por seguridad.');
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
    if (!pedido) { alert('Pedido no encontrado'); return; }
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
    if (container.children.length <= 1) { alert('Debe haber al menos un producto'); return; }
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
    if (items.length === 0) { alert('Agrega al menos un producto'); return; }
    
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
    if (!pedido) { alert('Pedido no encontrado'); return; }
    
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
    if (!pedido) { alert('Pedido no encontrado'); return; }
    
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
    
    // Chart: ventas ultimos 7 dias
    const labels7d = [];
    const datos7d = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(hoy);
        d.setDate(d.getDate() - i);
        const fechaStr = d.toISOString().split('T')[0];
        const diaNombre = d.toLocaleDateString('es-PY', { weekday: 'short' });
        labels7d.push(diaNombre);
        const ventasDia = pedidos.filter(p => new Date(p.fecha).toISOString().split('T')[0] === fechaStr).reduce((s, p) => s + (p.total || 0), 0);
        datos7d.push(ventasDia);
    }
    
    const ctx7d = document.getElementById('chartVentas7Dias');
    if (ctx7d) {
        if (chartVentas7d) chartVentas7d.destroy();
        chartVentas7d = new Chart(ctx7d, {
            type: 'bar',
            data: {
                labels: labels7d,
                datasets: [{
                    label: 'Ventas (Gs.)',
                    data: datos7d,
                    backgroundColor: 'rgba(17, 24, 39, 0.8)',
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
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
                const medallas = ['🥇','🥈','🥉'];
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
            alert(`Resumen de ${mesStr} guardado en Firebase`);
        } catch(e) {
            alert('Error guardando: ' + e.message);
        }
    } else {
        alert('Firebase no disponible');
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
        container.innerHTML = '<div class="p-8 text-center text-gray-400">Sin creditos pendientes</div>';
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
    if (isNaN(monto) || monto <= 0) { alert('Monto invalido'); return; }
    if (monto > saldo) { alert('El monto excede el saldo pendiente'); return; }

    const nota = prompt('Nota del pago (opcional):') || '';
    const pago = { id: 'PAG' + Date.now(), pedidoId, monto, fecha: new Date().toISOString(), nota };
    const pagos = JSON.parse(localStorage.getItem('hdv_pagos_credito') || '[]');
    pagos.push(pago);
    localStorage.setItem('hdv_pagos_credito', JSON.stringify(pagos));

    // Sincronizar pagos con Firebase
    if (typeof guardarPagosCreditoFirebase === 'function') {
        guardarPagosCreditoFirebase(pagos).catch(e => console.error(e));
    }

    // Si saldo = 0, marcar pagado
    if (saldo - monto <= 0) {
        marcarPagado(pedidoId);
    }

    alert(`Pago de Gs. ${monto.toLocaleString()} registrado exitosamente`);
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
    if (isNaN(monto) || monto <= 0 || monto > saldo) { alert('Monto invalido'); return; }

    const nota = prompt('Nota (opcional):') || '';
    if (!credito.pagos) credito.pagos = [];
    credito.pagos.push({ monto, fecha: new Date().toISOString(), nota });
    if (saldo - monto <= 0) credito.pagado = true;
    localStorage.setItem('hdv_creditos_manuales', JSON.stringify(creditos));
    // Sincronizar con Firebase
    if (typeof guardarCreditosManualesFirebase === 'function') {
        guardarCreditosManualesFirebase(creditos).catch(e => console.error(e));
    }
    alert(`Pago de Gs. ${monto.toLocaleString()} registrado`);
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
    if (pagos.length === 0) { alert('Sin pagos registrados para este credito'); return; }
    let msg = 'HISTORIAL DE PAGOS\n' + '='.repeat(30) + '\n';
    pagos.forEach((p, i) => {
        msg += `\n${i + 1}. Gs. ${p.monto.toLocaleString()} - ${new Date(p.fecha).toLocaleDateString('es-PY')}`;
        if (p.nota) msg += ` (${p.nota})`;
    });
    msg += `\n\nTotal pagado: Gs. ${pagos.reduce((s, p) => s + p.monto, 0).toLocaleString()}`;
    alert(msg);
}

function enviarRecordatorioWhatsApp(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    const telefono = clienteInfo?.telefono || '';
    if (!telefono) { alert('Este cliente no tiene telefono registrado'); return; }

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
    if (!telefono) { alert('Sin telefono'); return; }

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
        alert('Mensaje actualizado');
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
    if (isNaN(monto) || monto <= 0) { alert('Monto invalido'); return; }
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

    // Sincronizar con Firebase
    if (typeof guardarCreditosManualesFirebase === 'function') {
        guardarCreditosManualesFirebase(creditos).catch(e => console.error(e));
    }
    alert('Credito manual agregado');
    cargarCreditos();
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
        container.innerHTML = '<p class="p-8 text-center text-gray-400 italic">Sin promociones configuradas. Crea una nueva.</p>';
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
    if (!nombre || !productoId) { alert('Completa nombre y producto'); return; }

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
    alert('Promocion guardada');
}

function togglePromocion(promoId) {
    const promos = cargarPromocionesDesdeStorage();
    const p = promos.find(pr => pr.id === promoId);
    if (p) { p.activa = !p.activa; guardarPromocionesEnStorage(promos); cargarPromociones(); }
}

function eliminarPromocion(promoId) {
    if (!confirm('Eliminar esta promocion?')) return;
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
        gastosEl.innerHTML = '<p class="p-6 text-center text-gray-400 italic">Sin gastos registrados esta semana</p>';
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
        histEl.innerHTML = '<p class="p-6 text-center text-gray-400 italic">Sin rendiciones anteriores</p>';
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

function eliminarGastoAdmin(gastoId) {
    if (!confirm('Eliminar este gasto?')) return;
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
        el.innerHTML = '<p class="p-6 text-center text-gray-400 italic">Sin cuentas configuradas</p>';
        return;
    }
    el.innerHTML = cuentas.map(c => `
        <div class="p-4 flex justify-between items-center">
            <div>
                <p class="font-bold text-gray-800">🏦 ${c.banco} - ${c.tipo === 'ahorro' ? 'Caja de Ahorro' : 'Cuenta Corriente'}</p>
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
        titular: document.getElementById('formCuentaTitular').value,
        ruc: document.getElementById('formCuentaRUC').value
    };
    if (!cuenta.banco || !cuenta.numero) { alert('Banco y numero de cuenta son obligatorios'); return; }
    let cuentas = JSON.parse(localStorage.getItem('hdv_cuentas_bancarias') || '[]');
    const idx = cuentas.findIndex(c => c.id === id);
    if (idx >= 0) cuentas[idx] = cuenta; else cuentas.push(cuenta);
    localStorage.setItem('hdv_cuentas_bancarias', JSON.stringify(cuentas));
    if (typeof guardarCuentasBancariasFirebase === 'function') guardarCuentasBancariasFirebase(cuentas).catch(e => console.error(e));
    cerrarModalCuentaBancaria();
    cargarCuentasBancariasAdmin();
    alert('Cuenta bancaria guardada');
}

function eliminarCuentaBancaria(id) {
    if (!confirm('Eliminar esta cuenta bancaria?')) return;
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
        container.innerHTML = '<p class="p-6 text-center text-gray-400 italic">Sin metas configuradas</p>';
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
    if (!meta.monto) { alert('Monto de meta es obligatorio'); return; }
    let metas = JSON.parse(localStorage.getItem('hdv_metas') || '[]');
    const idx = metas.findIndex(m => m.id === id);
    if (idx >= 0) metas[idx] = meta; else metas.push(meta);
    localStorage.setItem('hdv_metas', JSON.stringify(metas));
    if (typeof guardarMetasFirebase === 'function') guardarMetasFirebase(metas).catch(e => console.error(e));
    cerrarModalMeta();
    cargarMetas();
    alert('Meta guardada');
}

function eliminarMeta(id) {
    if (!confirm('Eliminar esta meta?')) return;
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
        container.innerHTML = '<p class="p-8 text-center text-gray-400 italic">Todos los clientes estan activos. Excelente!</p>';
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
                    ${tel ? `<button onclick="enviarWhatsAppReactivacion('${tel}', '${nombre.replace(/'/g, '')}')" class="bg-green-50 text-green-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-green-100">📲 WhatsApp</button>` : ''}
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
