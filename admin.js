// ============================================
// HDV Admin Panel v2.9 - Completo
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
// NAVEGACIÓN
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
        'pedidos': 'Gestión de Pedidos', 'creditos': 'Control de Créditos',
        'reportes': 'Análisis y Reportes', 'stock': 'Inventario',
        'productos': 'Catálogo de Productos', 'clientes': 'Base de Datos de Clientes',
        'precios': 'Configuración de Precios', 'herramientas': 'Sistema y Herramientas'
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
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================
// CAMBIOS SIN GUARDAR
// ============================================
function registrarCambio() {
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
    descargarJSON(productosData, 'productos.json');
    cambiosSinGuardar = 0;
    actualizarBarraCambios();
    productosDataOriginal = JSON.parse(JSON.stringify(productosData));
}

function descartarCambios() {
    if (!confirm('¿Descartar todos los cambios? Se perderán las modificaciones.')) return;
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
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await cargarDatosIniciales();
    cargarPedidos();
    setInterval(cargarPedidos, 30000);
    
    const filtroFecha = document.getElementById('filtroFecha');
    if (filtroFecha) filtroFecha.valueAsDate = new Date();
    
    const hoy = new Date();
    const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
    const desde = document.getElementById('reporteFechaDesde');
    const hasta = document.getElementById('reporteFechaHasta');
    if (desde) desde.valueAsDate = hace30;
    if (hasta) hasta.valueAsDate = hoy;
    
    cambiarSeccion('pedidos');
});

async function cargarDatosIniciales() {
    try {
        const response = await fetch('productos.json?t=' + Date.now());
        productosData = await response.json();
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
            <div class="flex gap-2 mt-4">
                ${estado === 'pendiente' ? 
                    `<button class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700" onclick="marcarEntregado('${p.id}')">✓ Entregado</button>` :
                    `<button class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-300" onclick="marcarPendiente('${p.id}')">↩ Pendiente</button>`}
                <button class="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100" onclick="eliminarPedido('${p.id}')">🗑️</button>
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
    if (p) { p.estado = 'entregado'; localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos)); cargarPedidos(); }
}

function marcarPendiente(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const p = pedidos.find(x => x.id === id);
    if (p) { p.estado = 'pendiente'; localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos)); cargarPedidos(); }
}

function eliminarPedido(id) {
    if (!confirm('¿Eliminar este pedido?')) return;
    let pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    pedidos = pedidos.filter(p => p.id !== id);
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
    cargarPedidos();
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
// CRÉDITOS
// ============================================
function cargarCreditos() {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const creditos = pedidos.filter(p => p.tipoPago === 'credito' && (p.estado || 'pendiente') !== 'pagado');
    
    const totalCreditos = creditos.reduce((s, p) => s + (p.total || 0), 0);
    const clientesUnicos = new Set(creditos.map(p => p.cliente?.id)).size;
    
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('totalCreditos', 'Gs. ' + totalCreditos.toLocaleString());
    el('clientesConCredito', clientesUnicos);
    el('pedidosCredito', creditos.length);
    
    const container = document.getElementById('listaCreditos');
    if (!container) return;
    
    if (creditos.length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-gray-400">Sin créditos pendientes</div>';
        return;
    }
    
    container.innerHTML = '';
    creditos.forEach(p => {
        const div = document.createElement('div');
        div.className = 'p-4 hover:bg-gray-50 flex justify-between items-center';
        div.innerHTML = `
            <div>
                <p class="font-bold text-gray-800">${p.cliente?.nombre || 'N/A'}</p>
                <p class="text-sm text-gray-500">${new Date(p.fecha).toLocaleDateString('es-PY')}</p>
            </div>
            <div class="text-right">
                <p class="font-bold text-red-600">Gs. ${(p.total || 0).toLocaleString()}</p>
                <button onclick="marcarPagado('${p.id}')" class="text-xs text-green-600 font-bold hover:underline mt-1">Marcar Pagado</button>
            </div>`;
        container.appendChild(div);
    });
}

function marcarPagado(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const p = pedidos.find(x => x.id === id);
    if (p) { p.estado = 'pagado'; localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos)); cargarCreditos(); }
}

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
                <input type="text" value="${prod.subcategoria || ''}" onchange="actualizarProducto('${prod.id}','subcategoria',this.value)" class="w-full mt-1 px-1 py-1 text-xs border border-transparent hover:border-gray-300 rounded bg-transparent text-gray-400" placeholder="Subcategoría">
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
    const url = prompt(`📷 Imagen para: ${prod.nombre}\n\nPega la URL (vacío para quitar):`, prod.imagen || '');
    if (url === null) return;
    if (url.trim()) prod.imagen = url.trim();
    else delete prod.imagen;
    registrarCambio();
    mostrarProductosGestion();
}

function eliminarPresentacion(id, idx) {
    const p = productosData.productos.find(x => x.id === id);
    if (p && p.presentaciones.length > 1) { p.presentaciones.splice(idx, 1); registrarCambio(); mostrarProductosGestion(); }
    else alert('Debe tener al menos una presentación');
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
                    <p class="text-sm text-gray-500">📍 ${cliente.direccion || cliente.zona || 'Sin dirección'}</p>
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
    
    if (!razon) { alert('Ingresa la razón social'); return; }
    
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
    const backup = {
        fecha: new Date().toISOString(),
        version: '2.9',
        datos: { productos: productosData, pedidos: JSON.parse(localStorage.getItem('hdv_pedidos') || '[]') }
    };
    descargarJSON(backup, `hdv_backup_${new Date().toISOString().split('T')[0]}.json`);
}

function restaurarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('¿Reemplazar todos los datos actuales con el backup?')) { event.target.value = ''; return; }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const backup = JSON.parse(e.target.result);
            if (backup.datos) {
                productosData = backup.datos.productos;
                if (backup.datos.pedidos) localStorage.setItem('hdv_pedidos', JSON.stringify(backup.datos.pedidos));
                productosDataOriginal = JSON.parse(JSON.stringify(productosData));
                alert('Backup restaurado. La página se recargará.');
                setTimeout(() => location.reload(), 1000);
            } else {
                alert('Formato de backup no reconocido');
            }
        } catch (err) { alert('Error: archivo inválido'); }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function importarProductosExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const lines = e.target.result.split('\n').filter(l => l.trim());
            if (lines.length < 2) { alert('Archivo vacío o sin datos'); return; }
            
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
            if (lines.length < 2) { alert('Archivo vacío'); return; }
            
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
    if (!confirm('¿Estás seguro? Todos los datos de pedidos se perderán.')) return;
    localStorage.removeItem('hdv_pedidos');
    todosLosPedidos = [];
    alert('Pedidos eliminados.');
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
