// HDV Admin v2.7 - Updated 2024-02-20 03:30 UTC
// VERSIÓN CORRECTA CON HIDE/SHOW FUNCIONAL
// Variables globales
let todosLosPedidos = [];
let productosData = { productos: [], categorias: [], clientes: [] };
let productosFiltrados = [];
let clientesFiltrados = [];
let clienteActualPrecios = null;
let tipoReporte = 'zona';

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await cargarDatosIniciales();
    cargarPedidos();
    setInterval(cargarPedidos, 30000);
    document.getElementById('filterFecha').valueAsDate = new Date();
    
    const hoy = new Date();
    const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
    document.getElementById('reporteFechaHasta').valueAsDate = hoy;
    document.getElementById('reporteFechaDesde').valueAsDate = hace30;
});

async function cargarDatosIniciales() {
    try {
        const response = await fetch('productos.json');
        productosData = await response.json();
        productosFiltrados = [...productosData.productos];
        
        const filterCliente = document.getElementById('filterCliente');
        const filterZona = document.getElementById('filterZona');
        const preciosCliente = document.getElementById('preciosCliente');
        const nuevoCategoria = document.getElementById('nuevoCategoria');
        
        productosData.clientes.forEach(c => {
            const opt1 = document.createElement('option');
            opt1.value = c.id;
            opt1.textContent = `${c.nombre} — ${c.zona}`;
            filterCliente.appendChild(opt1.cloneNode(true));
            preciosCliente.appendChild(opt1);
        });
        
        const zonas = [...new Set(productosData.clientes.map(c => c.zona))];
        zonas.forEach(z => {
            const opt = document.createElement('option');
            opt.value = z;
            opt.textContent = z;
            filterZona.appendChild(opt);
        });
        
        productosData.categorias.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nombre;
            nuevoCategoria.appendChild(opt);
        });
    } catch (error) {
        console.error('Error:', error);
    }
}


// ============================================
// SECCIÓN PEDIDOS
// ============================================
function cargarPedidos() {
    todosLosPedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    aplicarFiltrosPedidos();
}

function aplicarFiltrosPedidos() {
    const fecha = document.getElementById('filterFecha').value;
    const cliente = document.getElementById('filterCliente').value;
    const zona = document.getElementById('filterZona').value;
    const estado = document.getElementById('filterEstado').value;
    
    let filtrados = todosLosPedidos;
    
    if (fecha) {
        filtrados = filtrados.filter(p => {
            const pFecha = new Date(p.fecha).toISOString().split('T')[0];
            return pFecha === fecha;
        });
    }
    if (cliente) filtrados = filtrados.filter(p => p.cliente.id === cliente);
    if (zona) {
        const clientesZona = productosData.clientes.filter(c => c.zona === zona).map(c => c.id);
        filtrados = filtrados.filter(p => clientesZona.includes(p.cliente.id));
    }
    if (estado) filtrados = filtrados.filter(p => (p.estado || 'pendiente') === estado);
    
    mostrarPedidos(filtrados);
    actualizarEstadisticasPedidos(filtrados);
}

function limpiarFiltrosPedidos() {
    document.getElementById('filterFecha').valueAsDate = new Date();
    document.getElementById('filterCliente').value = '';
    document.getElementById('filterZona').value = '';
    document.getElementById('filterEstado').value = '';
    aplicarFiltrosPedidos();
}

function mostrarPedidos(pedidos) {
    const container = document.getElementById('pedidosList');
    if (pedidos.length === 0) {
        container.innerHTML = '<div class="empty-state"><div style="font-size:48px;margin-bottom:15px;">📦</div>No hay pedidos</div>';
        return;
    }
    
    container.innerHTML = '';
    pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    pedidos.forEach(p => {
        const estado = p.estado || 'pendiente';
        const clienteInfo = productosData.clientes.find(c => c.id === p.cliente.id);
        const zona = clienteInfo?.zona || '';
        
        const div = document.createElement('div');
        div.className = 'pedido-card';
        div.innerHTML = `
            <div class="pedido-header">
                <div>
                    <h3 style="margin-bottom:5px;">${p.cliente.nombre}</h3>
                    <div style="font-size:14px;color:#6b7280;">📍 ${zona} • 🕐 ${new Date(p.fecha).toLocaleString('es-PY')}</div>
                </div>
                <span class="pedido-status status-${estado}">${estado.toUpperCase()}</span>
            </div>
            <div style="margin-bottom:15px;">
                ${p.items.map(i => `<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;">
                    <span>${i.nombre} <span style="color:#6b7280;">(${i.presentacion} × ${i.cantidad})</span></span>
                    <strong>Gs. ${i.subtotal.toLocaleString()}</strong>
                </div>`).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;padding-top:15px;border-top:2px solid #e5e7eb;font-size:18px;font-weight:700;">
                <span>TOTAL</span><span>Gs. ${p.total.toLocaleString()}</span>
            </div>
            <div style="display:flex;gap:10px;margin-top:15px;">
                ${estado === 'pendiente' ? 
                    `<button class="btn btn-primary" onclick="marcarEntregado('${p.id}')">✓ Marcar Entregado</button>` :
                    `<button class="btn btn-secondary" onclick="marcarPendiente('${p.id}')">↩ Marcar Pendiente</button>`
                }
                <button class="btn btn-danger" onclick="eliminarPedido('${p.id}')">🗑️ Eliminar</button>
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
    
    document.getElementById('totalPedidos').textContent = total;
    document.getElementById('pedidosPendientes').textContent = pendientes;
    document.getElementById('pedidosEntregados').textContent = entregados;
    document.getElementById('totalGuaranies').textContent = totalGs.toLocaleString();
}

function marcarEntregado(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const p = pedidos.find(x => x.id === id);
    if (p) {
        p.estado = 'entregado';
        localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
        cargarPedidos();
    }
}

function marcarPendiente(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const p = pedidos.find(x => x.id === id);
    if (p) {
        p.estado = 'pendiente';
        localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
        cargarPedidos();
    }
}

function eliminarPedido(id) {
    if (!confirm('¿Eliminar este pedido?')) return;
    let pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    pedidos = pedidos.filter(p => p.id !== id);
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
    cargarPedidos();
}

function exportarPedidosExcel() {
    const fecha = document.getElementById('filterFecha').value;
    let csv = 'Fecha,Cliente,Zona,Producto,Presentacion,Cantidad,Precio Unit,Subtotal,Total,Estado\n';
    
    todosLosPedidos.forEach(p => {
        const c = productosData.clientes.find(x => x.id === p.cliente.id);
        const zona = c?.zona || '';
        const estado = p.estado || 'pendiente';
        p.items.forEach((i, idx) => {
            csv += `"${p.fecha}","${p.cliente.nombre}","${zona}","${i.nombre}","${i.presentacion}",${i.cantidad},${i.precio_unitario},${i.subtotal},${idx === 0 ? p.total : ''},${estado}\n`;
        });
    });
    
    descargarCSV(csv, `pedidos_${fecha || 'todos'}.csv`);
}

// ============================================
// SECCIÓN REPORTES
// ============================================
function generarReporte() {
    const desde = new Date(document.getElementById('reporteFechaDesde').value);
    const hasta = new Date(document.getElementById('reporteFechaHasta').value);
    hasta.setHours(23, 59, 59);
    
    const pedidos = todosLosPedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= desde && f <= hasta;
    });
    
    if (pedidos.length === 0) {
        alert('No hay pedidos en ese rango');
        return;
    }
    
    mostrarEstadisticasReporte(pedidos);
    
    if (tipoReporte === 'zona') reportePorZona(pedidos);
    else if (tipoReporte === 'vendedor') reportePorVendedor(pedidos);
    else if (tipoReporte === 'producto') reportePorProducto(pedidos);
    else if (tipoReporte === 'cliente') reportePorCliente(pedidos);
}

function mostrarEstadisticasReporte(pedidos) {
    const total = pedidos.reduce((s, p) => s + p.total, 0);
    const cant = pedidos.length;
    const promedio = total / cant;
    
    document.getElementById('rTotalVentas').textContent = `Gs. ${total.toLocaleString()}`;
    document.getElementById('rTotalPedidos').textContent = cant;
    document.getElementById('rTicketPromedio').textContent = `Gs. ${Math.round(promedio).toLocaleString()}`;
    document.getElementById('statsReporte').style.display = 'block';
}

function reportePorZona(pedidos) {
    const zonas = {};
    pedidos.forEach(p => {
        const c = productosData.clientes.find(x => x.id === p.cliente.id);
        const zona = c?.zona || 'Sin zona';
        if (!zonas[zona]) zonas[zona] = { pedidos: 0, total: 0 };
        zonas[zona].pedidos++;
        zonas[zona].total += p.total;
    });
    
    const data = Object.entries(zonas).map(([zona, d]) => ({
        zona, ...d, promedio: Math.round(d.total / d.pedidos)
    })).sort((a, b) => b.total - a.total);
    
    // Generar gráfico
    mostrarGrafico(
        data.map(d => d.zona),
        data.map(d => d.total),
        'Ventas por Zona (Gs.)'
    );
    
    mostrarTablaReporte(
        ['Zona', 'Pedidos', 'Total Ventas', 'Ticket Promedio'],
        data.map(d => [d.zona, d.pedidos, `Gs. ${d.total.toLocaleString()}`, `Gs. ${d.promedio.toLocaleString()}`]),
        'Ventas por Zona'
    );
}

function reportePorVendedor(pedidos) {
    const vendedores = {};
    pedidos.forEach(p => {
        const v = p.vendedor || 'Sin especificar';
        if (!vendedores[v]) vendedores[v] = { pedidos: 0, total: 0 };
        vendedores[v].pedidos++;
        vendedores[v].total += p.total;
    });
    
    const data = Object.entries(vendedores).map(([v, d]) => ({
        vendedor: v, ...d, promedio: Math.round(d.total / d.pedidos)
    })).sort((a, b) => b.total - a.total);
    
    mostrarTablaReporte(
        ['Vendedor', 'Pedidos', 'Total Ventas', 'Ticket Promedio'],
        data.map(d => [d.vendedor, d.pedidos, `Gs. ${d.total.toLocaleString()}`, `Gs. ${d.promedio.toLocaleString()}`]),
        'Ventas por Vendedor'
    );
}

function reportePorProducto(pedidos) {
    const prods = {};
    pedidos.forEach(p => {
        p.items.forEach(i => {
            const key = `${i.nombre} (${i.presentacion})`;
            if (!prods[key]) prods[key] = { cantidad: 0, total: 0 };
            prods[key].cantidad += i.cantidad;
            prods[key].total += i.subtotal;
        });
    });
    
    const data = Object.entries(prods).map(([prod, d]) => ({
        producto: prod, ...d
    })).sort((a, b) => b.total - a.total);
    
    mostrarTablaReporte(
        ['Producto', 'Unidades', 'Total Ventas'],
        data.map(d => [d.producto, d.cantidad, `Gs. ${d.total.toLocaleString()}`]),
        'Ventas por Producto'
    );
}

function reportePorCliente(pedidos) {
    const clientes = {};
    pedidos.forEach(p => {
        const nombre = p.cliente.nombre;
        const c = productosData.clientes.find(x => x.id === p.cliente.id);
        const zona = c?.zona || '';
        if (!clientes[nombre]) clientes[nombre] = { pedidos: 0, total: 0, zona };
        clientes[nombre].pedidos++;
        clientes[nombre].total += p.total;
    });
    
    const data = Object.entries(clientes).map(([nombre, d]) => ({
        cliente: nombre, ...d, promedio: Math.round(d.total / d.pedidos)
    })).sort((a, b) => b.total - a.total);
    
    mostrarTablaReporte(
        ['Cliente', 'Zona', 'Pedidos', 'Total Ventas', 'Ticket Promedio'],
        data.map(d => [d.cliente, d.zona, d.pedidos, `Gs. ${d.total.toLocaleString()}`, `Gs. ${d.promedio.toLocaleString()}`]),
        'Ventas por Cliente'
    );
}

function mostrarTablaReporte(headers, rows, titulo) {
    document.getElementById('tituloReporte').textContent = titulo;
    document.getElementById('reporteHeader').innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    document.getElementById('reporteBody').innerHTML = rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('');
    document.getElementById('resultadosReporte').style.display = 'block';
}

function exportarReporteExcel() {
    const tabla = document.getElementById('tablaReporte');
    let csv = '';
    Array.from(tabla.querySelectorAll('thead th')).forEach(th => csv += th.textContent + ',');
    csv += '\n';
    Array.from(tabla.querySelectorAll('tbody tr')).forEach(tr => {
        Array.from(tr.querySelectorAll('td')).forEach(td => csv += `"${td.textContent}",`);
        csv += '\n';
    });
    descargarCSV(csv, `reporte_${tipoReporte}_${new Date().toISOString().split('T')[0]}.csv`);
}

// ============================================
// SECCIÓN PRECIOS POR CLIENTE
// ============================================
function cargarPreciosCliente() {
    const clienteId = document.getElementById('preciosCliente').value;
    if (!clienteId) {
        document.getElementById('preciosCard').style.display = 'none';
        return;
    }
    
    clienteActualPrecios = productosData.clientes.find(c => c.id === clienteId);
    const tbody = document.getElementById('preciosBody');
    tbody.innerHTML = '';
    
    productosData.productos.forEach(prod => {
        prod.presentaciones.forEach((pres, idx) => {
            const personalizado = clienteActualPrecios.precios_personalizados?.[prod.id]?.find(p => p.tamano === pres.tamano)?.precio || '';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${prod.nombre}</strong></td>
                <td>${pres.tamano}</td>
                <td>Gs. ${pres.precio_base.toLocaleString()}</td>
                <td><input type="number" id="precio_${prod.id}_${idx}" value="${personalizado}" placeholder="Vacío = precio base" data-producto="${prod.id}" data-tamano="${pres.tamano}"></td>
            `;
            tbody.appendChild(tr);
        });
    });
    
    document.getElementById('preciosCard').style.display = 'block';
    
    document.getElementById('buscarProductoPrecio').oninput = (e) => {
        const filtro = e.target.value.toLowerCase();
        Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
            const nombre = tr.querySelector('td').textContent.toLowerCase();
            tr.style.display = nombre.includes(filtro) ? '' : 'none';
        });
    };
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
    cliente.precios_personalizados = nuevosPrecios;
    
    descargarJSON(productosData, 'productos.json');
    document.getElementById('successPrecios').style.display = 'block';
    setTimeout(() => document.getElementById('successPrecios').style.display = 'none', 3000);
}

// ============================================
// SECCIÓN GESTIONAR PRODUCTOS
// ============================================
function filtrarProductos() {
    const filtro = document.getElementById('buscarProducto').value.toLowerCase();
    const mostrarOcultos = document.getElementById('mostrarOcultosProductos')?.checked || false;
    
    productosFiltrados = productosData.productos.filter(p => {
        const cumpleFiltro = p.nombre.toLowerCase().includes(filtro) || p.id.toLowerCase().includes(filtro);
        const noOculto = mostrarOcultos || !p.oculto;
        return cumpleFiltro && noOculto;
    });
    mostrarProductosGestion();
}

function mostrarProductosGestion() {
    const tbody = document.getElementById('productosBody');
    tbody.innerHTML = '';
    
    productosFiltrados.forEach(prod => {
        const catNombre = productosData.categorias.find(c => c.id === prod.categoria)?.nombre || '';
        const presHTML = prod.presentaciones.map((p, i) => `
            <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
                <input type="text" value="${p.tamano}" onchange="actualizarPresentacion('${prod.id}', ${i}, 'tamano', this.value)" style="width:90px;padding:6px;border:2px solid #e5e7eb;border-radius:6px;font-size:13px;" placeholder="Tamaño">
                <input type="number" value="${p.precio_base}" onchange="actualizarPresentacion('${prod.id}', ${i}, 'precio', this.value)" style="width:110px;padding:6px;border:2px solid #e5e7eb;border-radius:6px;font-size:13px;" placeholder="Precio">
                <button onclick="eliminarPresentacion('${prod.id}', ${i})" style="width:28px;height:28px;border:2px solid #ef4444;background:white;color:#ef4444;border-radius:6px;cursor:pointer;font-size:16px;">×</button>
            </div>
        `).join('');
        
        const estaOculto = prod.oculto || false;
        const tr = document.createElement('tr');
        tr.style.opacity = estaOculto ? '0.5' : '1';
        tr.innerHTML = `
            <td><strong>${prod.id}</strong></td>
            <td><input type="text" value="${prod.nombre}" onchange="actualizarProducto('${prod.id}', 'nombre', this.value)"></td>
            <td><select onchange="actualizarProducto('${prod.id}', 'categoria', this.value)">
                ${productosData.categorias.map(c => `<option value="${c.id}" ${c.id === prod.categoria ? 'selected' : ''}>${c.nombre}</option>`).join('')}
            </select></td>
            <td><input type="text" value="${prod.subcategoria}" onchange="actualizarProducto('${prod.id}', 'subcategoria', this.value)"></td>
            <td>
                ${presHTML}
                <button onclick="agregarPresentacion('${prod.id}')" class="btn btn-primary" style="padding:5px 10px;font-size:12px;margin-top:5px;">+ Presentación</button>
            </td>
            <td>
                <button onclick="toggleOcultarProducto('${prod.id}')" style="width:32px;height:32px;border:2px solid ${estaOculto ? '#10b981' : '#f59e0b'};background:white;color:${estaOculto ? '#10b981' : '#f59e0b'};border-radius:6px;cursor:pointer;margin-right:5px;" title="${estaOculto ? 'Mostrar' : 'Ocultar'}">${estaOculto ? '👁️' : '🙈'}</button>
                <button onclick="eliminarProducto('${prod.id}')" style="width:32px;height:32px;border:2px solid #ef4444;background:white;color:#ef4444;border-radius:6px;cursor:pointer;">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function actualizarProducto(id, campo, valor) {
    const p = productosData.productos.find(x => x.id === id);
    if (p) p[campo] = valor;
}

function actualizarPresentacion(id, idx, campo, valor) {
    const p = productosData.productos.find(x => x.id === id);
    if (p && p.presentaciones[idx]) {
        if (campo === 'precio') p.presentaciones[idx].precio_base = parseInt(valor) || 0;
        else p.presentaciones[idx].tamano = valor;
    }
}

function eliminarPresentacion(id, idx) {
    const p = productosData.productos.find(x => x.id === id);
    if (p && p.presentaciones.length > 1) {
        p.presentaciones.splice(idx, 1);
        mostrarProductosGestion();
    } else {
        alert('Debe tener al menos una presentación');
    }
}

function agregarPresentacion(id) {
    const p = productosData.productos.find(x => x.id === id);
    if (p) {
        p.presentaciones.push({ tamano: '', precio_base: 0 });
        mostrarProductosGestion();
    }
}

function eliminarProducto(id) {
    if (!confirm('¿Eliminar este producto?')) return;
    productosData.productos = productosData.productos.filter(p => p.id !== id);
    productosFiltrados = productosFiltrados.filter(p => p.id !== id);
    mostrarProductosGestion();
}

function mostrarModalNuevoProducto() {
    document.getElementById('modalNuevoProducto').classList.add('show');
}

function cerrarModal() {
    document.getElementById('modalNuevoProducto').classList.remove('show');
}

function agregarNuevoProducto() {
    const nombre = document.getElementById('nuevoNombre').value;
    const categoria = document.getElementById('nuevoCategoria').value;
    const subcategoria = document.getElementById('nuevoSubcategoria').value;
    const presentacionesStr = document.getElementById('nuevoPresentaciones').value;
    const precio = parseInt(document.getElementById('nuevoPrecio').value) || 0;
    
    if (!nombre || !categoria || !subcategoria || !presentacionesStr) {
        alert('Completa todos los campos');
        return;
    }
    
    const ultimoId = productosData.productos.length > 0 ? 
        parseInt(productosData.productos[productosData.productos.length - 1].id.replace('P', '')) : 0;
    const nuevoId = `P${String(ultimoId + 1).padStart(3, '0')}`;
    
    const presentaciones = presentacionesStr.split(',').map(p => ({
        tamano: p.trim(),
        precio_base: precio
    }));
    
    productosData.productos.push({
        id: nuevoId,
        nombre: nombre,
        categoria: categoria,
        subcategoria: subcategoria,
        presentaciones: presentaciones
    });
    
    productosFiltrados = [...productosData.productos];
    mostrarProductosGestion();
    cerrarModal();
    
    document.getElementById('nuevoNombre').value = '';
    document.getElementById('nuevoSubcategoria').value = '';
    document.getElementById('nuevoPresentaciones').value = '';
    document.getElementById('nuevoPrecio').value = '';
}

function guardarProductos() {
    descargarJSON(productosData, 'productos.json');
    document.getElementById('successProductos').style.display = 'block';
    setTimeout(() => document.getElementById('successProductos').style.display = 'none', 3000);
}

// ============================================

function filtrarClientes() {
    const filtro = document.getElementById('buscarCliente').value.toLowerCase();
    const mostrarOcultos = document.getElementById('mostrarOcultosClientes')?.checked || false;
    
    clientesFiltrados = productosData.clientes.filter(c => {
        const cumpleFiltro = (c.nombre && c.nombre.toLowerCase().includes(filtro)) ||
               (c.razon_social && c.razon_social.toLowerCase().includes(filtro)) ||
               (c.ruc && c.ruc.toLowerCase().includes(filtro)) ||
               (c.telefono && c.telefono.toLowerCase().includes(filtro)) ||
               (c.direccion && c.direccion.toLowerCase().includes(filtro)) ||
               (c.zona && c.zona.toLowerCase().includes(filtro)) ||
               (c.encargado && c.encargado.toLowerCase().includes(filtro)) ||
               c.id.toLowerCase().includes(filtro);
        const noOculto = mostrarOcultos || !c.oculto;
        return cumpleFiltro && noOculto;
    });
    mostrarClientesGestion();
}

function mostrarClientesGestion() {
    const tbody = document.getElementById('clientesBody');
    tbody.innerHTML = '';
    
    clientesFiltrados.forEach(cliente => {
        const cantidadPrecios = cliente.precios_personalizados ? Object.keys(cliente.precios_personalizados).length : 0;
        const estaOculto = cliente.oculto || false;
        
        const tr = document.createElement('tr');
        tr.style.opacity = estaOculto ? '0.5' : '1';
        tr.innerHTML = `
            <td><strong>${cliente.id}</strong></td>
            <td><input type="text" value="${cliente.razon_social || cliente.nombre || ''}" onchange="actualizarCliente('${cliente.id}', 'razon_social', this.value)" style="min-width:200px;"></td>
            <td><input type="text" value="${cliente.ruc || ''}" onchange="actualizarCliente('${cliente.id}', 'ruc', this.value)" style="min-width:120px;"></td>
            <td><input type="tel" value="${cliente.telefono || ''}" onchange="actualizarCliente('${cliente.id}', 'telefono', this.value)" style="min-width:120px;"></td>
            <td><input type="text" value="${cliente.direccion || cliente.zona || ''}" onchange="actualizarCliente('${cliente.id}', 'direccion', this.value)" style="min-width:200px;"></td>
            <td><input type="text" value="${cliente.encargado || ''}" onchange="actualizarCliente('${cliente.id}', 'encargado', this.value)" style="min-width:150px;"></td>
            <td style="text-align:center;">${cantidadPrecios > 0 ? `<span style="color:#2563eb;font-weight:600;">${cantidadPrecios}</span>` : '-'}</td>
            <td>
                <button onclick="toggleOcultarCliente('${cliente.id}')" style="width:32px;height:32px;border:2px solid ${estaOculto ? '#10b981' : '#f59e0b'};background:white;color:${estaOculto ? '#10b981' : '#f59e0b'};border-radius:6px;cursor:pointer;margin-right:5px;" title="${estaOculto ? 'Mostrar' : 'Ocultar'}">${estaOculto ? '👁️' : '🙈'}</button>
                <button onclick="verDetalleCliente('${cliente.id}')" class="btn btn-secondary" style="padding:6px 12px;font-size:12px;margin-right:5px;">📋</button>
                <button onclick="eliminarCliente('${cliente.id}')" style="width:32px;height:32px;border:2px solid #ef4444;background:white;color:#ef4444;border-radius:6px;cursor:pointer;">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function actualizarCliente(id, campo, valor) {
    const c = productosData.clientes.find(x => x.id === id);
    if (c) c[campo] = valor;
}

function eliminarCliente(id) {

function verDetalleCliente(id) {
    const cliente = productosData.clientes.find(c => c.id === id);
    if (!cliente) return;
    
    const preciosPersonalizados = cliente.precios_personalizados ? Object.keys(cliente.precios_personalizados).length : 0;
    
    alert(`📋 DETALLES DEL CLIENTE

ID: ${cliente.id}
Razón Social: ${cliente.razon_social || cliente.nombre || "N/A"}
RUC: ${cliente.ruc || "N/A"}
Teléfono: ${cliente.telefono || "N/A"}
Dirección: ${cliente.direccion || cliente.zona || "N/A"}
Encargado: ${cliente.encargado || "N/A"}

Precios Personalizados: ${preciosPersonalizados} productos

Puedes editar los datos directamente en la tabla.`);
}
    if (!confirm('¿Eliminar este cliente? Se perderán sus precios personalizados.')) return;
    productosData.clientes = productosData.clientes.filter(c => c.id !== id);
    clientesFiltrados = clientesFiltrados.filter(c => c.id !== id);
    mostrarClientesGestion();
}

function mostrarModalNuevoCliente() {
    document.getElementById('modalNuevoCliente').classList.add('show');
}

function cerrarModalCliente() {
    document.getElementById('modalNuevoCliente').classList.remove('show');
}

function agregarNuevoCliente() {
    const razonSocial = document.getElementById('nuevoClienteRazon').value.trim();
    const ruc = document.getElementById('nuevoClienteRUC').value.trim();
    const telefono = document.getElementById('nuevoClienteTelefono').value.trim();
    const direccion = document.getElementById('nuevoClienteDireccion').value.trim();
    const encargado = document.getElementById('nuevoClienteEncargado').value.trim();
    
    if (!razonSocial || !ruc || !telefono || !direccion) {
        alert('Completa todos los campos obligatorios (Razón Social, RUC, Teléfono, Dirección)');
        return;
    }
    
    const ultimoId = productosData.clientes.length > 0 ? 
        parseInt(productosData.clientes[productosData.clientes.length - 1].id.replace('C', '')) : 0;
    const nuevoId = `C${String(ultimoId + 1).padStart(3, '0')}`;
    
    productosData.clientes.push({
        id: nuevoId,
        nombre: razonSocial, // Por compatibilidad
        razon_social: razonSocial,
        ruc: ruc,
        telefono: telefono,
        direccion: direccion,
        encargado: encargado,
        zona: direccion, // Por compatibilidad con código antiguo
        tipo: 'mayorista_estandar',
        precios_personalizados: {}
    });
    
    clientesFiltrados = [...productosData.clientes];
    mostrarClientesGestion();
    cerrarModalCliente();
    
    // Limpiar formulario
    document.getElementById('nuevoClienteRazon').value = '';
    document.getElementById('nuevoClienteRUC').value = '';
    document.getElementById('nuevoClienteTelefono').value = '';
    document.getElementById('nuevoClienteDireccion').value = '';
    document.getElementById('nuevoClienteEncargado').value = '';
}

function guardarClientes() {
    descargarJSON(productosData, 'productos.json');
    document.getElementById('successClientes').style.display = 'block';
    setTimeout(() => document.getElementById('successClientes').style.display = 'none', 3000);
}

// ============================================
// SECCIÓN CRÉDITOS
// ============================================
function cargarCreditos() {
    const filterClienteCredito = document.getElementById('filterClienteCredito');
    filterClienteCredito.innerHTML = '<option value="">Todos</option>';
    productosData.clientes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.nombre} — ${c.zona}`;
        filterClienteCredito.appendChild(opt);
    });
    aplicarFiltrosCreditos();
}

function aplicarFiltrosCreditos() {
    const cliente = document.getElementById('filterClienteCredito').value;
    const estado = document.getElementById('filterEstadoCredito').value;
    let creditos = todosLosPedidos.filter(p => p.tipo_pago === 'credito');
    if (cliente) creditos = creditos.filter(p => p.cliente.id === cliente);
    if (estado !== 'todos') creditos = creditos.filter(p => (p.estado || 'pendiente_pago') === estado);
    mostrarCreditos(creditos);
    actualizarEstadisticasCreditos(creditos);
}

function mostrarCreditos(creditos) {
    const container = document.getElementById('creditosList');
    if (creditos.length === 0) {
        container.innerHTML = '<div class="empty-state"><div style="font-size:48px;margin-bottom:15px;">💳</div>No hay créditos</div>';
        return;
    }
    container.innerHTML = '';
    creditos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    creditos.forEach(p => {
        const estado = p.estado || 'pendiente_pago';
        const clienteInfo = productosData.clientes.find(c => c.id === p.cliente.id);
        const zona = clienteInfo?.zona || '';
        const div = document.createElement('div');
        div.className = 'pedido-card';
        div.innerHTML = `
            <div class="pedido-header">
                <div>
                    <h3 style="margin-bottom:5px;">${p.cliente.nombre}</h3>
                    <div style="font-size:14px;color:#6b7280;">📍 ${zona} • 🕐 ${new Date(p.fecha).toLocaleString('es-PY')}</div>
                    ${p.notas ? `<div style="font-size:13px;color:#6b7280;margin-top:5px;">📝 ${p.notas}</div>` : ''}
                </div>
                <span class="pedido-status ${estado === 'pagado' ? 'status-entregado' : 'status-pendiente'}">${estado === 'pagado' ? 'PAGADO' : 'PENDIENTE PAGO'}</span>
            </div>
            <div style="margin-bottom:15px;">
                ${p.items.map(i => `<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;">
                    <span>${i.nombre} <span style="color:#6b7280;">(${i.presentacion} × ${i.cantidad})</span></span>
                    <strong>Gs. ${i.subtotal.toLocaleString()}</strong>
                </div>`).join('')}
            </div>
            <div style="padding-top:15px;border-top:2px solid #e5e7eb;">
                ${p.subtotal ? `<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:5px;">
                    <span>Subtotal:</span><span>Gs. ${p.subtotal.toLocaleString()}</span>
                </div>` : ''}
                ${p.descuento > 0 ? `<div style="display:flex;justify-content:space-between;font-size:14px;color:#ef4444;margin-bottom:5px;">
                    <span>Descuento (${p.descuento}%):</span><span>-Gs. ${p.monto_descuento.toLocaleString()}</span>
                </div>` : ''}
                <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700;color:#2563eb;padding-top:10px;border-top:2px solid #e5e7eb;">
                    <span>TOTAL:</span><span>Gs. ${p.total.toLocaleString()}</span>
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-top:15px;flex-wrap:wrap;">
                ${estado === 'pendiente_pago' ? 
                    `<button class="btn btn-success" onclick="marcarCreditoPagado('${p.id}')">✓ Marcar Pagado</button>` :
                    `<button class="btn btn-secondary" onclick="marcarCreditoPendiente('${p.id}')">↩ Marcar Pendiente</button>`
                }
                <button class="btn btn-secondary" onclick="compartirCreditoPorWhatsApp('${p.id}')">📱 WhatsApp</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function actualizarEstadisticasCreditos(creditos) {
    const pendientes = creditos.filter(p => (p.estado || 'pendiente_pago') === 'pendiente_pago');
    const totalPendiente = pendientes.reduce((s, p) => s + p.total, 0);
    document.getElementById('totalCreditosPendientes').textContent = totalPendiente.toLocaleString();
    document.getElementById('cantidadCreditos').textContent = creditos.length;
    document.getElementById('clientesConCredito').textContent = [...new Set(creditos.map(p => p.cliente.id))].length;
}

function marcarCreditoPagado(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const p = pedidos.find(x => x.id === id);
    if (p) {
        p.estado = 'pagado';
        localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
        todosLosPedidos = pedidos;
        aplicarFiltrosCreditos();
    }
}

function marcarCreditoPendiente(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const p = pedidos.find(x => x.id === id);
    if (p) {
        p.estado = 'pendiente_pago';
        localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
        todosLosPedidos = pedidos;
        aplicarFiltrosCreditos();
    }
}

function compartirCreditoPorWhatsApp(id) {
    const pedido = todosLosPedidos.find(p => p.id === id);
    if (!pedido) return;
    let mensaje = `*RECORDATORIO DE CRÉDITO - HDV*\n\n📋 *Pedido #${pedido.id.slice(-6)}*\n📅 ${new Date(pedido.fecha).toLocaleString('es-PY')}\n👤 *Cliente:* ${pedido.cliente.nombre}\n\n*TOTAL A PAGAR: Gs. ${pedido.total.toLocaleString()}*\nEstado: ${pedido.estado === 'pagado' ? '✅ PAGADO' : '⏳ PENDIENTE DE PAGO'}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
}

function exportarCreditosExcel() {
    let csv = 'Fecha,Cliente,Zona,Total,Estado,Notas\n';
    const cliente = document.getElementById('filterClienteCredito').value;
    const estado = document.getElementById('filterEstadoCredito').value;
    let creditos = todosLosPedidos.filter(p => p.tipo_pago === 'credito');
    if (cliente) creditos = creditos.filter(p => p.cliente.id === cliente);
    if (estado !== 'todos') creditos = creditos.filter(p => (p.estado || 'pendiente_pago') === estado);
    creditos.forEach(p => {
        const c = productosData.clientes.find(x => x.id === p.cliente.id);
        csv += `"${p.fecha}","${p.cliente.nombre}","${c?.zona || ''}",${p.total},"${p.estado || 'pendiente_pago'}","${p.notas || ''}"\n`;
    });
    descargarCSV(csv, `creditos_${new Date().toISOString().split('T')[0]}.csv`);
}

// ============================================
// SECCIÓN STOCK/INVENTARIO
// ============================================
let stockFiltrado = [];

function cargarStock() {
    stockFiltrado = [];
    productosData.productos.forEach(prod => {
        prod.presentaciones.forEach((pres, idx) => {
            if (!pres.stock) pres.stock = 0;
            if (!pres.stock_minimo) pres.stock_minimo = 10;
            stockFiltrado.push({
                productoId: prod.id,
                nombre: prod.nombre,
                presentacion: pres.tamano,
                presIdx: idx,
                stock: pres.stock || 0,
                stock_minimo: pres.stock_minimo || 10
            });
        });
    });
    mostrarStock();
}

function filtrarStock() {
    const filtro = document.getElementById('buscarStock').value.toLowerCase();
    stockFiltrado = [];
    productosData.productos.forEach(prod => {
        if (!prod.nombre.toLowerCase().includes(filtro) && filtro) return;
        prod.presentaciones.forEach((pres, idx) => {
            if (!pres.stock) pres.stock = 0;
            if (!pres.stock_minimo) pres.stock_minimo = 10;
            stockFiltrado.push({
                productoId: prod.id,
                nombre: prod.nombre,
                presentacion: pres.tamano,
                presIdx: idx,
                stock: pres.stock || 0,
                stock_minimo: pres.stock_minimo || 10
            });
        });
    });
    mostrarStock();
}

function mostrarStock() {
    const tbody = document.getElementById('stockBody');
    tbody.innerHTML = '';
    
    stockFiltrado.forEach(item => {
        const estado = item.stock === 0 ? '🔴 Agotado' : 
                      item.stock <= item.stock_minimo ? '🟡 Bajo' : '🟢 OK';
        const colorEstado = item.stock === 0 ? '#ef4444' : 
                           item.stock <= item.stock_minimo ? '#f59e0b' : '#10b981';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.nombre}</strong></td>
            <td>${item.presentacion}</td>
            <td><input type="number" value="${item.stock}" min="0" onchange="actualizarStock('${item.productoId}', ${item.presIdx}, 'stock', this.value)" style="width:100px;"></td>
            <td><input type="number" value="${item.stock_minimo}" min="0" onchange="actualizarStock('${item.productoId}', ${item.presIdx}, 'stock_minimo', this.value)" style="width:100px;"></td>
            <td><span style="color:${colorEstado};font-weight:600;">${estado}</span></td>
            <td>
                <button onclick="ajustarStock('${item.productoId}', ${item.presIdx}, 10)" class="btn btn-primary" style="padding:6px 12px;font-size:12px;">+10</button>
                <button onclick="ajustarStock('${item.productoId}', ${item.presIdx}, -10)" class="btn btn-secondary" style="padding:6px 12px;font-size:12px;">-10</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function actualizarStock(productoId, presIdx, campo, valor) {
    const prod = productosData.productos.find(p => p.id === productoId);
    if (prod && prod.presentaciones[presIdx]) {
        prod.presentaciones[presIdx][campo] = parseInt(valor) || 0;
        filtrarStock();
    }
}

function ajustarStock(productoId, presIdx, cantidad) {
    const prod = productosData.productos.find(p => p.id === productoId);
    if (prod && prod.presentaciones[presIdx]) {
        prod.presentaciones[presIdx].stock = (prod.presentaciones[presIdx].stock || 0) + cantidad;
        if (prod.presentaciones[presIdx].stock < 0) prod.presentaciones[presIdx].stock = 0;
        filtrarStock();
    }
}

function guardarStock() {
    descargarJSON(productosData, 'productos.json');
    document.getElementById('successStock').style.display = 'block';
    setTimeout(() => document.getElementById('successStock').style.display = 'none', 3000);
}

function exportarStockExcel() {
    let csv = 'Producto,Presentacion,Stock Actual,Stock Minimo,Estado\n';
    stockFiltrado.forEach(item => {
        const estado = item.stock === 0 ? 'Agotado' : item.stock <= item.stock_minimo ? 'Bajo' : 'OK';
        csv += `"${item.nombre}","${item.presentacion}",${item.stock},${item.stock_minimo},"${estado}"\n`;
    });
    descargarCSV(csv, `stock_${new Date().toISOString().split('T')[0]}.csv`);
}

// ============================================
// COMPARACIÓN DE PERÍODOS Y MÁRGENES
// ============================================
function generarReporte() {
    const desde = new Date(document.getElementById('reporteFechaDesde').value);
    const hasta = new Date(document.getElementById('reporteFechaHasta').value);
    hasta.setHours(23, 59, 59);
    
    const pedidos = todosLosPedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= desde && f <= hasta;
    });
    
    if (pedidos.length === 0) {
        alert('No hay pedidos en ese rango');
        return;
    }
    
    // Comparación de períodos
    const comparacion = document.getElementById('comparacionPeriodo').value;
    if (comparacion !== 'ninguno') {
        compararPeriodos(desde, hasta, comparacion);
    } else {
        document.getElementById('comparacionCard').style.display = 'none';
    }
    
    mostrarEstadisticasReporte(pedidos);
    
    if (tipoReporte === 'margen') {
        reporteMargenGanancia(pedidos);
    } else if (tipoReporte === 'zona') {
        reportePorZona(pedidos);
    } else if (tipoReporte === 'vendedor') {
        reportePorVendedor(pedidos);
    } else if (tipoReporte === 'producto') {
        reportePorProducto(pedidos);
    } else if (tipoReporte === 'cliente') {
        reportePorCliente(pedidos);
    }
}

function compararPeriodos(desdeActual, hastaActual, tipoComparacion) {
    const diasDiferencia = Math.ceil((hastaActual - desdeActual) / (1000 * 60 * 60 * 24));
    let desdeAnterior, hastaAnterior;
    
    if (tipoComparacion === 'anterior') {
        hastaAnterior = new Date(desdeActual.getTime() - 1);
        desdeAnterior = new Date(hastaAnterior.getTime() - diasDiferencia * 24 * 60 * 60 * 1000);
    } else if (tipoComparacion === 'mesanterior') {
        desdeAnterior = new Date(desdeActual);
        desdeAnterior.setMonth(desdeAnterior.getMonth() - 1);
        hastaAnterior = new Date(hastaActual);
        hastaAnterior.setMonth(hastaAnterior.getMonth() - 1);
    }
    
    const pedidosActual = todosLosPedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= desdeActual && f <= hastaActual;
    });
    
    const pedidosAnterior = todosLosPedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= desdeAnterior && f <= hastaAnterior;
    });
    
    const ventasActual = pedidosActual.reduce((s, p) => s + p.total, 0);
    const ventasAnterior = pedidosAnterior.reduce((s, p) => s + p.total, 0);
    const cambioVentas = ventasAnterior > 0 ? ((ventasActual - ventasAnterior) / ventasAnterior * 100).toFixed(1) : 0;
    
    const cambioPedidos = pedidosAnterior.length > 0 ? 
        ((pedidosActual.length - pedidosAnterior.length) / pedidosAnterior.length * 100).toFixed(1) : 0;
    
    document.getElementById('statsComparacion').innerHTML = `
        <div class="stat-card" style="background:linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);">
            <div class="stat-label">Ventas Período Actual</div>
            <div class="stat-value">Gs. ${ventasActual.toLocaleString()}</div>
            <div style="color:${cambioVentas >= 0 ? '#10b981' : '#ef4444'};font-weight:600;margin-top:5px;">
                ${cambioVentas >= 0 ? '↑' : '↓'} ${Math.abs(cambioVentas)}% vs anterior
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Ventas Período Anterior</div>
            <div class="stat-value">Gs. ${ventasAnterior.toLocaleString()}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Pedidos Actual</div>
            <div class="stat-value">${pedidosActual.length}</div>
            <div style="color:${cambioPedidos >= 0 ? '#10b981' : '#ef4444'};font-weight:600;margin-top:5px;">
                ${cambioPedidos >= 0 ? '↑' : '↓'} ${Math.abs(cambioPedidos)}%
            </div>
        </div>
    `;
    document.getElementById('comparacionCard').style.display = 'block';
}

function reporteMargenGanancia(pedidos) {
    const productos = {};
    
    pedidos.forEach(p => {
        p.items.forEach(item => {
            const key = item.nombre;
            if (!productos[key]) {
                productos[key] = { 
                    cantidad: 0, 
                    ingresos: 0,
                    costo: 0 // Aquí podrías agregar el costo real desde productos.json
                };
            }
            productos[key].cantidad += item.cantidad;
            productos[key].ingresos += item.subtotal;
            // Asumimos un margen del 30% por defecto si no hay costo definido
            productos[key].costo += item.subtotal * 0.7;
        });
    });
    
    const data = Object.entries(productos).map(([nombre, d]) => ({
        producto: nombre,
        ...d,
        ganancia: d.ingresos - d.costo,
        margen: ((d.ingresos - d.costo) / d.ingresos * 100).toFixed(1)
    })).sort((a, b) => b.ganancia - a.ganancia);
    
    mostrarGrafico(
        data.slice(0, 10).map(d => d.producto),
        data.slice(0, 10).map(d => d.ganancia),
        'Top 10 Productos por Ganancia (Gs.)'
    );
    
    mostrarTablaReporte(
        ['Producto', 'Unidades', 'Ingresos', 'Costo Est.', 'Ganancia', 'Margen %'],
        data.map(d => [
            d.producto,
            d.cantidad,
            `Gs. ${d.ingresos.toLocaleString()}`,
            `Gs. ${Math.round(d.costo).toLocaleString()}`,
            `Gs. ${Math.round(d.ganancia).toLocaleString()}`,
            `${d.margen}%`
        ]),
        'Análisis de Margen de Ganancia'
    );
}

// ============================================
// HERRAMIENTAS: BACKUP Y RESTAURAR
// ============================================
function crearBackup() {
    const backup = {
        fecha: new Date().toISOString(),
        version: '1.0',
        datos: {
            productos: productosData,
            pedidos: todosLosPedidos
        }
    };
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `hdv_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    mostrarMensajeHerramientas('Backup descargado correctamente');
}

function restaurarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!confirm('¿Estás seguro? Esto reemplazará todos los datos actuales.')) {
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const backup = JSON.parse(e.target.result);
            
            if (backup.datos) {
                productosData = backup.datos.productos;
                localStorage.setItem('hdv_pedidos', JSON.stringify(backup.datos.pedidos));
                
                mostrarMensajeHerramientas('Backup restaurado. Recarga la página.');
                setTimeout(() => location.reload(), 2000);
            }
        } catch (error) {
            alert('Error al restaurar backup: archivo inválido');
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function descargarPlantillaExcel() {
    let csv = 'Nombre,Categoria,Subcategoria,Presentacion,Precio\n';
    csv += 'Producto Ejemplo,cuidado_personal,Jabones,125g,5000\n';
    csv += 'Otro Producto,bebe,Pañales,M,7000\n';
    descargarCSV(csv, 'plantilla_productos.csv');
}

function importarProductosExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const texto = e.target.result;
            const lineas = texto.split('\n').filter(l => l.trim());
            lineas.shift(); // Remover encabezados
            
            let agregados = 0;
            lineas.forEach(linea => {
                const [nombre, categoria, subcategoria, presentacion, precio] = linea.split(',').map(s => s.trim());
                if (!nombre || !categoria) return;
                
                const ultimoId = productosData.productos.length > 0 ? 
                    parseInt(productosData.productos[productosData.productos.length - 1].id.replace('P', '')) : 0;
                const nuevoId = `P${String(ultimoId + agregados + 1).padStart(3, '0')}`;
                
                productosData.productos.push({
                    id: nuevoId,
                    nombre: nombre,
                    categoria: categoria,
                    subcategoria: subcategoria || 'General',
                    presentaciones: [{
                        tamano: presentacion || 'Unidad',
                        precio_base: parseInt(precio) || 0
                    }]
                });
                agregados++;
            });
            
            if (agregados > 0) {
                descargarJSON(productosData, 'productos.json');
                mostrarMensajeHerramientas(`${agregados} productos importados. Descarga el archivo y súbelo a GitHub.`);
            }
        } catch (error) {
            alert('Error al importar: ' + error.message);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function limpiarPedidos() {
    if (!confirm('¿ELIMINAR TODOS LOS PEDIDOS? Esta acción no se puede deshacer.')) return;
    if (!confirm('¿Estás completamente seguro? Todos los pedidos se perderán.')) return;
    

// Importar clientes masivamente
function descargarPlantillaClientes() {
    let csv = 'Razon Social,RUC,Telefono,Direccion,Encargado\n';
    csv += 'Supermercado Central S.A.,80012345-6,0981234567,"Av. Central 1234, Loma Plata",Juan Pérez\n';
    csv += 'Comercial Norte,80067890-1,0982345678,"Ruta 3 Km 45, Filadelfia",María González\n';
    descargarCSV(csv, 'plantilla_clientes.csv');
}

function importarClientesExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const texto = e.target.result;
            const lineas = texto.split('\n').filter(l => l.trim());
            lineas.shift(); // Remover encabezados
            
            let agregados = 0;
            lineas.forEach(linea => {
                const [razonSocial, ruc, telefono, direccion, encargado] = linea.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
                if (!razonSocial || !ruc) return;
                
                const ultimoId = productosData.clientes.length > 0 ? 
                    parseInt(productosData.clientes[productosData.clientes.length - 1].id.replace('C', '')) : 0;
                const nuevoId = `C${String(ultimoId + agregados + 1).padStart(3, '0')}`;
                
                productosData.clientes.push({
                    id: nuevoId,
                    nombre: razonSocial,
                    razon_social: razonSocial,
                    ruc: ruc || '',
                    telefono: telefono || '',
                    direccion: direccion || '',
                    encargado: encargado || '',
                    zona: direccion || '',
                    tipo: 'mayorista_estandar',
                    oculto: false,
                    precios_personalizados: {}
                });
                agregados++;
            });
            
            if (agregados > 0) {
                descargarJSON(productosData, 'productos.json');
                mostrarMensajeHerramientas(`${agregados} clientes importados. Descarga el archivo y súbelo a GitHub.`);
            }
        } catch (error) {
            alert('Error al importar: ' + error.message);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// Toggle hide/show productos
function toggleOcultarProducto(id) {
    const prod = productosData.productos.find(p => p.id === id);
    if (prod) {
        prod.oculto = !prod.oculto;
        mostrarProductosGestion();
        // Descargar automáticamente el JSON actualizado
        descargarJSON(productosData, 'productos.json');
        alert(`Producto ${prod.oculto ? 'ocultado' : 'mostrado'}. Descarga el productos.json y súbelo a GitHub.`);
    }
}

// Toggle hide/show clientes
function toggleOcultarCliente(id) {
    const cliente = productosData.clientes.find(c => c.id === id);
    if (cliente) {
        cliente.oculto = !cliente.oculto;
        mostrarClientesGestion();
        // Descargar automáticamente el JSON actualizado
        descargarJSON(productosData, 'productos.json');
        alert(`Cliente ${cliente.oculto ? 'ocultado' : 'mostrado'}. Descarga el productos.json y súbelo a GitHub.`);
    }
}
    localStorage.removeItem('hdv_pedidos');
    todosLosPedidos = [];
    mostrarMensajeHerramientas('Todos los pedidos han sido eliminados');
    setTimeout(() => location.reload(), 1500);
}

function limpiarStockLocal() {
    if (!confirm('¿Resetear el stock guardado localmente?')) return;
    localStorage.removeItem('stock_local');
    mostrarMensajeHerramientas('Stock local reseteado');
}

function mostrarMensajeHerramientas(mensaje) {
    const el = document.getElementById('successHerramientas');
    el.textContent = '✓ ' + mensaje;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
}

// ============================================
// UTILIDADES
// ============================================
let chartInstance = null;

function mostrarGrafico(labels, datos, titulo) {
    const canvas = document.getElementById('chartReporte');
    const ctx = canvas.getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: titulo,
                data: datos,
                backgroundColor: 'rgba(37, 99, 235, 0.8)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: titulo,
                    font: { size: 16, weight: 'bold' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'Gs. ' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
    
    document.getElementById('graficoReporte').style.display = 'block';
}

// ============================================
// UTILIDADES
// ============================================
function descargarCSV(contenido, nombreArchivo) {
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nombreArchivo;
    link.click();
}

function descargarJSON(data, nombreArchivo) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nombreArchivo;
    link.click();
}

// ============================================
// SISTEMA DE ACTUALIZACIÓN
// ============================================
async function registrarServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('service-worker.js');
            console.log('Service Worker registrado');
            
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        mostrarBotonActualizacion();
                    }
                });
            });
            
            setInterval(() => {
                registration.update();
            }, 30000);
            
        } catch (e) {
            console.log('SW no disponible:', e);
        }
    }
}

function mostrarBotonActualizacion() {
    const btn = document.getElementById('updateButton');
    if (btn) {
        btn.style.display = 'block';
    }
}

function actualizarAhora() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
            if (reg && reg.waiting) {
                reg.waiting.postMessage('SKIP_WAITING');
            }
        });
        
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
            });
        }
        
        setTimeout(() => {
            window.location.reload(true);
        }, 500);
    }
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });
}

// Registrar al cargar
window.addEventListener('load', registrarServiceWorker);

// ============================================
// FUNCIONES SIDEBAR
// ============================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

function toggleMenuSection(element) {
    element.parentElement.classList.toggle('collapsed');
}

function cambiarSeccion(seccion) {
    // Remover active de todos los menu items
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    
    // Agregar active al item clickeado (buscar por onclick que contenga la seccion)
    document.querySelectorAll('.menu-item').forEach(item => {
        if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(`'${seccion}'`)) {
            item.classList.add('active');
        }
    });
    
    // Cambiar contenido
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const seccionElement = document.getElementById(`seccion-${seccion}`);
    if (seccionElement) {
        seccionElement.classList.add('active');
    }
    
    // Ejecutar funciones de carga según sección
    if (seccion === 'productos' && productosFiltrados.length > 0) {
        mostrarProductosGestion();
    }
    if (seccion === 'clientes') {
        clientesFiltrados = [...productosData.clientes];
        mostrarClientesGestion();
    }
    if (seccion === 'creditos') {
        cargarCreditos();
    }
    if (seccion === 'stock') {
        cargarStock();
    }
}

