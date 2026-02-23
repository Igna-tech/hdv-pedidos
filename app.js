let todosLosPedidos = [];
let productosData = { productos: [], categorias: [], clientes: [] };
let productosDataOriginal = null; 
let productosFiltrados = [];
let clientesFiltrados = [];
let cambiosSinGuardar = 0;

// ============================================
// 1. NAVEGACIÓN DEL MENÚ (¡CORREGIDO!)
// ============================================
function cambiarSeccion(seccionId) {
    // Ocultar todas las pestañas
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    
    // Quitar color a todos los botones del menú
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
    });
    
    // Mostrar la pestaña seleccionada
    const seccionActiva = document.getElementById(`seccion-${seccionId}`);
    if (seccionActiva) {
        seccionActiva.classList.add('active');
        seccionActiva.style.display = 'block';
    }
    
    // Pintar el botón seleccionado
    const botonMenu = document.querySelector(`button[onclick="cambiarSeccion('${seccionId}')"]`);
    if (botonMenu) botonMenu.classList.add('active');

    // Cambiar Título Superior
    const titulos = {
        'pedidos': 'Gestión de Pedidos', 'stock': 'Inventario', 'productos': 'Catálogo de Productos',
        'clientes': 'Directorio de Clientes', 'herramientas': 'Mantenimiento'
    };
    const tituloHeader = document.getElementById('currentSectionTitle');
    if (tituloHeader) tituloHeader.textContent = titulos[seccionId] || 'Panel Admin';

    // Cargar datos al entrar a la sección
    if (seccionId === 'pedidos') cargarPedidos();
    if (seccionId === 'productos') mostrarProductosGestion();
    if (seccionId === 'clientes') mostrarClientesGestion();
}

// ============================================
// 2. INICIO Y CARGA DE DATOS
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await cargarDatosIniciales();
    cargarPedidos();
    
    // Iniciar en la pestaña de pedidos
    cambiarSeccion('pedidos');
    
    setInterval(cargarPedidos, 30000);
    if(document.getElementById('filtroFecha')) document.getElementById('filtroFecha').valueAsDate = new Date();
});

async function cargarDatosIniciales() {
    try {
        const response = await fetch('productos.json?t=' + new Date().getTime());
        productosData = await response.json();
        productosDataOriginal = JSON.parse(JSON.stringify(productosData));
        productosFiltrados = [...productosData.productos];
        
        const filterCliente = document.getElementById('filtroCliente');
        if (filterCliente) {
            productosData.clientes.forEach(c => {
                const opt1 = document.createElement('option');
                opt1.value = c.id;
                opt1.textContent = `${c.nombre} — ${c.zona || ''}`;
                filterCliente.appendChild(opt1);
            });
        }
    } catch (error) { console.error('Error:', error); }
}

// ============================================
// 3. CAMBIOS SIN GUARDAR (JSON)
// ============================================
function registrarCambio() {
    cambiosSinGuardar++;
    actualizarBarraCambios();
}

function actualizarBarraCambios() {
    const bar = document.getElementById('unsavedBar');
    const badge = document.getElementById('unsavedCount');
    if (bar && badge) {
        if (cambiosSinGuardar > 0) {
            bar.classList.add('visible');
            badge.textContent = cambiosSinGuardar;
        } else {
            bar.classList.remove('visible');
        }
    }
}

function guardarTodosCambios() {
    descargarJSON(productosData, 'productos.json');
    cambiosSinGuardar = 0;
    actualizarBarraCambios();
    productosDataOriginal = JSON.parse(JSON.stringify(productosData));
}

function descartarCambios() {
    if (!confirm('¿Descartar todos los cambios sin guardar? Se perderán las modificaciones.')) return;
    productosData = JSON.parse(JSON.stringify(productosDataOriginal));
    productosFiltrados = [...productosData.productos];
    cambiosSinGuardar = 0;
    actualizarBarraCambios();
    mostrarProductosGestion();
}

window.addEventListener('beforeunload', (e) => {
    if (cambiosSinGuardar > 0) { e.preventDefault(); e.returnValue = ''; }
});

// ============================================
// 4. GESTIÓN DE PEDIDOS
// ============================================
function cargarPedidos() {
    todosLosPedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    aplicarFiltrosPedidos();
}

function aplicarFiltrosPedidos() {
    const fecha = document.getElementById('filtroFecha')?.value;
    const cliente = document.getElementById('filtroCliente')?.value;
    
    let filtrados = todosLosPedidos;
    
    if (fecha) {
        filtrados = filtrados.filter(p => {
            const pFecha = new Date(p.fecha).toISOString().split('T')[0];
            return pFecha === fecha;
        });
    }
    if (cliente) filtrados = filtrados.filter(p => p.cliente.id === cliente);
    
    mostrarPedidos(filtrados);
    actualizarEstadisticasPedidos(filtrados);
}

function mostrarPedidos(pedidos) {
    const container = document.getElementById('listaPedidos');
    if (!container) return;
    if (pedidos.length === 0) {
        container.innerHTML = '<div class="p-8 text-center"><div style="font-size:48px;margin-bottom:15px;">📦</div><p class="text-gray-500">No hay pedidos</p></div>';
        return;
    }
    
    container.innerHTML = '';
    pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    pedidos.forEach(p => {
        const estado = p.estado || 'pendiente';
        const clienteInfo = productosData.clientes.find(c => c.id === p.cliente.id);
        const zona = clienteInfo?.zona || '';
        let colorEstado = estado === 'entregado' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
        
        const div = document.createElement('div');
        div.className = 'p-6 hover:bg-gray-50 transition-colors border-b border-gray-100';
        div.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">${p.cliente.nombre}</h3>
                    <div class="text-sm text-gray-500 mt-1">📍 ${zona} • 🕐 ${new Date(p.fecha).toLocaleString('es-PY')}</div>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-bold ${colorEstado}">${estado.toUpperCase()}</span>
            </div>
            <div class="mb-4 space-y-2">
                ${p.items.map(i => `
                <div class="flex justify-between items-center text-sm border-b border-gray-50 pb-2">
                    <span>${i.nombre} <span class="text-gray-500">(${i.presentacion} × ${i.cantidad})</span></span>
                    <strong class="text-gray-800">Gs. ${i.subtotal.toLocaleString()}</strong>
                </div>`).join('')}
            </div>
            <div class="flex justify-between items-center pt-4 mt-4 border-t border-gray-100">
                <span class="text-gray-500 font-bold">TOTAL</span>
                <span class="text-xl font-bold text-gray-900">Gs. ${p.total.toLocaleString()}</span>
            </div>
            <div class="flex gap-3 mt-4">
                ${estado === 'pendiente' ? 
                    `<button class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors" onclick="marcarEntregado('${p.id}')">✓ Marcar Entregado</button>` :
                    `<button class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm font-semibold transition-colors" onclick="marcarPendiente('${p.id}')">↩ Marcar Pendiente</button>`
                }
                <button class="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-lg text-sm font-semibold transition-colors" onclick="eliminarPedido('${p.id}')">🗑️ Eliminar</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function actualizarEstadisticasPedidos(pedidos) {
    const total = pedidos.length;
    const pendientes = pedidos.filter(p => (p.estado || 'pendiente') === 'pendiente').length;
    const entregados = pedidos.filter(p => p.estado === 'entregado').length;
    const totalGs = pedidos.reduce((s, p) => s + p.total, 0);
    
    if(document.getElementById('statTotalPedidos')) document.getElementById('statTotalPedidos').textContent = total;
    if(document.getElementById('statPendientes')) document.getElementById('statPendientes').textContent = pendientes;
    if(document.getElementById('statEntregados')) document.getElementById('statEntregados').textContent = entregados;
    if(document.getElementById('statRecaudacion')) document.getElementById('statRecaudacion').textContent = `Gs. ${totalGs.toLocaleString()}`;
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

// ============================================
// 5. GESTIÓN DE PRODUCTOS
// ============================================
function mostrarProductosGestion() {
    const tbody = document.getElementById('tablaProductosCuerpo');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    productosFiltrados.forEach(prod => {
        const presHTML = prod.presentaciones.map((p, i) => `
            <div class="flex items-center gap-2 mb-2">
                <input type="text" value="${p.tamano}" onchange="actualizarPresentacion('${prod.id}', ${i}, 'tamano', this.value)" class="w-24 px-2 py-1 text-xs border border-gray-300 rounded" placeholder="Tamaño">
                <input type="number" value="${p.precio_base}" onchange="actualizarPresentacion('${prod.id}', ${i}, 'precio', this.value)" class="w-24 px-2 py-1 text-xs border border-gray-300 rounded" placeholder="Precio">
                <button onclick="eliminarPresentacion('${prod.id}', ${i})" class="text-red-500 font-bold px-2">×</button>
            </div>
        `).join('');
        
        const tr = document.createElement('tr');
        tr.className = `border-b border-gray-50 hover:bg-gray-50`;
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-gray-500">${prod.id}</td>
            <td class="px-6 py-4 text-2xl text-center">📦</td>
            <td class="px-6 py-4"><input type="text" value="${prod.nombre}" onchange="actualizarProducto('${prod.id}', 'nombre', this.value)" class="w-full px-2 py-1 border border-transparent hover:border-gray-300 rounded bg-transparent"></td>
            <td class="px-6 py-4"><input type="text" value="${prod.subcategoria || ''}" onchange="actualizarProducto('${prod.id}', 'subcategoria', this.value)" class="w-full px-2 py-1 border border-transparent hover:border-gray-300 rounded bg-transparent text-xs text-gray-500" placeholder="Subcategoría"></td>
            <td class="px-6 py-4">${presHTML}<button onclick="agregarPresentacion('${prod.id}')" class="text-xs text-blue-600 font-bold">+ Agregar</button></td>
            <td class="px-6 py-4"><button onclick="eliminarProducto('${prod.id}')" class="p-2 rounded text-red-600 hover:bg-red-100">🗑️</button></td>
        `;
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

function eliminarPresentacion(id, idx) {
    const p = productosData.productos.find(x => x.id === id);
    if (p && p.presentaciones.length > 1) {
        p.presentaciones.splice(idx, 1);
        registrarCambio();
        mostrarProductosGestion();
    } else { alert('El producto debe tener al menos una presentación'); }
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

// ============================================
// 6. GESTIÓN DE CLIENTES
// ============================================
function mostrarClientesGestion() {
    const container = document.getElementById('listaClientes');
    if (!container) return;
    container.innerHTML = '';
    
    productosData.clientes.forEach(cliente => {
        const div = document.createElement('div');
        div.className = 'bg-white p-5 rounded-xl border border-gray-200 shadow-sm';
        div.innerHTML = `
            <div class="font-bold text-gray-800 text-lg">${cliente.nombre}</div>
            <div class="text-sm text-gray-500 mb-2">📍 ${cliente.zona || cliente.direccion || 'Sin zona'}</div>
            <div class="text-xs text-gray-400 mb-3">RUC: ${cliente.ruc || 'N/A'} | Tel: ${cliente.telefono || 'N/A'}</div>
            <button onclick="eliminarCliente('${cliente.id}')" class="text-xs text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg border border-red-100 font-bold transition-colors">🗑️ Eliminar Cliente</button>
        `;
        container.appendChild(div);
    });
}

function eliminarCliente(id) {
    if (!confirm('¿Eliminar este cliente?')) return;
    productosData.clientes = productosData.clientes.filter(c => c.id !== id);
    registrarCambio();
    mostrarClientesGestion();
}

// ============================================
// 7. HERRAMIENTAS Y EXTRAS
// ============================================
function limpiarPedidos() {
    if (!confirm('¿ELIMINAR TODOS LOS PEDIDOS? Esta acción no se puede deshacer.')) return;
    if (!confirm('¿Estás completamente seguro?')) return;
    localStorage.removeItem('hdv_pedidos');
    todosLosPedidos = [];
    alert('Todos los pedidos han sido eliminados');
    setTimeout(() => location.reload(), 1000);
}

function descargarJSON(data, nombreArchivo) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nombreArchivo;
    link.click();
}