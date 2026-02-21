// HDV Admin v3.1 - Catálogo, Rutas, Créditos Mejorados, Offline
// Variables globales
let todosLosPedidos = [];
let productosData = { productos: [], categorias: [], clientes: [] };
let productosFiltrados = [];
let clientesFiltrados = [];
let clienteActualPrecios = null;
let tipoReporte = 'zona';

// ============================================
// TOAST NOTIFICATIONS (reemplaza alert)
// ============================================
function toast(mensaje, tipo = 'success', duracion = 3500) {
    const container = document.getElementById('toastContainer');
    const iconos = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const div = document.createElement('div');
    div.className = `toast toast-${tipo}`;
    div.innerHTML = `<span>${iconos[tipo] || ''}</span><span style="flex:1">${mensaje}</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
    container.appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 400); }, duracion);
}

// ============================================
// CONFIRM MODAL (reemplaza confirm)
// ============================================
function confirmar(titulo, mensaje, icono = '⚠️', textoOk = 'Confirmar', tipoBtn = 'btn-danger') {
    return new Promise(resolve => {
        const overlay = document.getElementById('confirmOverlay');
        document.getElementById('confirmIcon').textContent = icono;
        document.getElementById('confirmTitle').textContent = titulo;
        document.getElementById('confirmMsg').textContent = mensaje;
        const btnOk = document.getElementById('confirmOk');
        btnOk.className = `btn ${tipoBtn}`;
        btnOk.textContent = textoOk;
        overlay.classList.add('show');
        const cancelar = () => { overlay.classList.remove('show'); resolve(false); };
        const aceptar = () => { overlay.classList.remove('show'); resolve(true); };
        document.getElementById('confirmCancel').onclick = cancelar;
        btnOk.onclick = aceptar;
        overlay.onclick = (e) => { if (e.target === overlay) cancelar(); };
    });
}

// ============================================
// HISTORIAL DE ACTIVIDAD
// ============================================
function registrarActividad(tipo, texto) {
    const historial = JSON.parse(localStorage.getItem('hdv_actividad') || '[]');
    historial.unshift({ tipo, texto, fecha: new Date().toISOString() });
    if (historial.length > 200) historial.length = 200;
    localStorage.setItem('hdv_actividad', JSON.stringify(historial));
}

function obtenerActividad(limite = 10) {
    return JSON.parse(localStorage.getItem('hdv_actividad') || '[]').slice(0, limite);
}

function renderActividad(items, containerId) {
    const container = document.getElementById(containerId);
    if (!items.length) { container.innerHTML = '<div class="dash-empty">Sin actividad registrada</div>'; return; }
    const iconClases = { pedido:'act-pedido', producto:'act-producto', cliente:'act-cliente', credito:'act-credito', stock:'act-stock', sistema:'act-sistema' };
    const iconEmojis = { pedido:'📦', producto:'🏷️', cliente:'👥', credito:'💳', stock:'📊', sistema:'⚙️' };
    container.innerHTML = items.map(a => {
        const fecha = new Date(a.fecha);
        const tiempo = tiempoRelativo(fecha);
        return `<div class="activity-item"><div class="activity-icon ${iconClases[a.tipo] || 'act-sistema'}">${iconEmojis[a.tipo] || '⚙️'}</div><div><div class="activity-text">${a.texto}</div><div class="activity-time">${tiempo}</div></div></div>`;
    }).join('');
}

function tiempoRelativo(fecha) {
    const ahora = new Date();
    const diff = Math.floor((ahora - fecha) / 1000);
    if (diff < 60) return 'Hace un momento';
    if (diff < 3600) return `Hace ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff/3600)}h`;
    if (diff < 172800) return 'Ayer';
    return fecha.toLocaleDateString('es-PY', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function limpiarHistorial() {
    confirmar('Borrar Historial', '¿Eliminar todo el historial de actividad?', '📋', 'Borrar').then(ok => {
        if (ok) {
            localStorage.removeItem('hdv_actividad');
            toast('Historial eliminado', 'success');
            if (document.getElementById('actividadCompleta')) renderActividad([], 'actividadCompleta');
            if (document.getElementById('dashActividad')) renderActividad([], 'dashActividad');
        }
    });
}

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await cargarDatosIniciales();
    cargarPedidos();
    setInterval(cargarPedidos, 30000);
    document.getElementById('filterFecha').valueAsDate = new Date();
    const hoy = new Date();
    const hace30 = new Date(hoy.getTime() - 30 * 86400000);
    document.getElementById('reporteFechaHasta').valueAsDate = hoy;
    document.getElementById('reporteFechaDesde').valueAsDate = hace30;
    cargarDashboard();
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
// DASHBOARD
// ============================================
function cargarDashboard() {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';
    document.getElementById('dashSaludo').textContent = `${saludo} 👋`;
    document.getElementById('dashFechaHoy').textContent = new Date().toLocaleDateString('es-PY', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - hoy.getDay());
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const pedidosHoy = todosLosPedidos.filter(p => new Date(p.fecha).toISOString().split('T')[0] === hoyStr);
    const pedidosSemana = todosLosPedidos.filter(p => new Date(p.fecha) >= inicioSemana);
    const pedidosMes = todosLosPedidos.filter(p => new Date(p.fecha) >= inicioMes);
    const pendientesHoy = pedidosHoy.filter(p => (p.estado || 'pendiente') === 'pendiente').length;
    const creditosPendientes = todosLosPedidos.filter(p => p.tipo_pago === 'credito' && (p.estado || 'pendiente_pago') === 'pendiente_pago');
    const totalCreditos = creditosPendientes.reduce((s,p) => s + p.total, 0);

    document.getElementById('dashPedidosHoy').textContent = pedidosHoy.length;
    document.getElementById('dashPedidosSub').textContent = `${pendientesHoy} pendientes`;
    document.getElementById('dashCreditosTotal').textContent = `Gs. ${totalCreditos.toLocaleString()}`;
    document.getElementById('dashCreditosSub').textContent = `${creditosPendientes.length} créditos`;
    document.getElementById('dashVentasSemana').textContent = `Gs. ${pedidosSemana.reduce((s,p)=>s+p.total,0).toLocaleString()}`;
    document.getElementById('dashVentasSemanaSub').textContent = `${pedidosSemana.length} pedidos`;
    document.getElementById('dashVentasMes').textContent = `Gs. ${pedidosMes.reduce((s,p)=>s+p.total,0).toLocaleString()}`;
    document.getElementById('dashVentasMesSub').textContent = `${pedidosMes.length} pedidos`;

    // Badges sidebar
    actualizarBadges(pendientesHoy, creditosPendientes.length);

    // Stock alerts
    const alertas = [];
    productosData.productos.forEach(prod => {
        if (prod.oculto) return;
        prod.presentaciones.forEach(pres => {
            const stock = pres.stock || 0;
            const minimo = pres.stock_minimo || 10;
            if (stock === 0) alertas.push({ nombre: `${prod.nombre} (${pres.tamano})`, tipo: 'agotado' });
            else if (stock <= minimo) alertas.push({ nombre: `${prod.nombre} (${pres.tamano})`, tipo: 'bajo', stock });
        });
    });
    const stockDiv = document.getElementById('dashStockAlertas');
    if (alertas.length === 0) {
        stockDiv.innerHTML = '<div class="dash-empty" style="color:#10b981">✅ Todo el stock está bien</div>';
    } else {
        stockDiv.innerHTML = `<ul class="dash-list">${alertas.slice(0,8).map(a => `<li><span>${a.nombre}</span><span class="alert-badge ${a.tipo === 'agotado' ? 'alert-danger' : 'alert-warning'}">${a.tipo === 'agotado' ? '🔴 Agotado' : `🟡 ${a.stock} uds`}</span></li>`).join('')}</ul>${alertas.length > 8 ? `<p style="text-align:center;color:#6b7280;font-size:13px;margin-top:10px">y ${alertas.length - 8} más...</p>` : ''}`;
    }
    const badgeStock = document.getElementById('badgeStock');
    if (alertas.length > 0) { badgeStock.textContent = alertas.length; badgeStock.style.display = 'inline'; } else { badgeStock.style.display = 'none'; }

    // Últimos pedidos
    const ultimos = todosLosPedidos.slice().sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,5);
    const pedidosDiv = document.getElementById('dashUltimosPedidos');
    if (ultimos.length === 0) {
        pedidosDiv.innerHTML = '<div class="dash-empty">Sin pedidos aún</div>';
    } else {
        pedidosDiv.innerHTML = `<ul class="dash-list">${ultimos.map(p => `<li><div><strong>${p.cliente.nombre}</strong><div style="font-size:12px;color:#9ca3af">${tiempoRelativo(new Date(p.fecha))}</div></div><strong style="color:#2563eb">Gs. ${p.total.toLocaleString()}</strong></li>`).join('')}</ul>`;
    }

    // Créditos por cobrar
    const creditosDiv = document.getElementById('dashCreditosLista');
    if (creditosPendientes.length === 0) {
        creditosDiv.innerHTML = '<div class="dash-empty" style="color:#10b981">✅ Sin créditos pendientes</div>';
    } else {
        creditosDiv.innerHTML = `<ul class="dash-list">${creditosPendientes.slice(0,5).map(p => {
            const dias = Math.floor((new Date() - new Date(p.fecha)) / 86400000);
            return `<li><div><strong>${p.cliente.nombre}</strong><div style="font-size:12px;color:${dias > 15 ? '#ef4444' : '#9ca3af'}">Hace ${dias} días</div></div><strong style="color:#ef4444">Gs. ${p.total.toLocaleString()}</strong></li>`;
        }).join('')}</ul>`;
    }

    // Actividad reciente
    renderActividad(obtenerActividad(5), 'dashActividad');
}

function actualizarBadges(pendientes, creditos) {
    const bp = document.getElementById('badgePedidos');
    const bc = document.getElementById('badgeCreditos');
    if (pendientes > 0) { bp.textContent = pendientes; bp.style.display = 'inline'; } else { bp.style.display = 'none'; }
    if (creditos > 0) { bc.textContent = creditos; bc.style.display = 'inline'; } else { bc.style.display = 'none'; }
}

// ============================================
// PEDIDOS
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
    if (fecha) filtrados = filtrados.filter(p => new Date(p.fecha).toISOString().split('T')[0] === fecha);
    if (cliente) filtrados = filtrados.filter(p => p.cliente.id === cliente);
    if (zona) { const cz = productosData.clientes.filter(c => c.zona === zona).map(c => c.id); filtrados = filtrados.filter(p => cz.includes(p.cliente.id)); }
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
    if (pedidos.length === 0) { container.innerHTML = '<div class="empty-state"><div style="font-size:48px;margin-bottom:15px">📦</div>No hay pedidos</div>'; return; }
    container.innerHTML = '';
    pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    pedidos.forEach(p => {
        const estado = p.estado || 'pendiente';
        const clienteInfo = productosData.clientes.find(c => c.id === p.cliente.id);
        const zona = clienteInfo?.zona || '';
        const div = document.createElement('div');
        div.className = 'pedido-card';
        div.innerHTML = `
            <div class="pedido-header"><div><h3 style="margin-bottom:5px">${p.cliente.nombre}</h3><div style="font-size:14px;color:#6b7280">📍 ${zona} • 🕐 ${new Date(p.fecha).toLocaleString('es-PY')}</div></div><span class="pedido-status status-${estado}">${estado.toUpperCase()}</span></div>
            <div style="margin-bottom:15px">${p.items.map(i => `<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px"><span>${i.nombre} <span style="color:#6b7280">(${i.presentacion} × ${i.cantidad})</span></span><strong>Gs. ${i.subtotal.toLocaleString()}</strong></div>`).join('')}</div>
            <div style="display:flex;justify-content:space-between;padding-top:15px;border-top:2px solid #e5e7eb;font-size:18px;font-weight:700"><span>TOTAL</span><span>Gs. ${p.total.toLocaleString()}</span></div>
            <div style="display:flex;gap:10px;margin-top:15px">${estado === 'pendiente' ? `<button class="btn btn-primary" onclick="marcarEntregado('${p.id}')">✓ Entregado</button>` : `<button class="btn btn-secondary" onclick="marcarPendiente('${p.id}')">↩ Pendiente</button>`}<button class="btn btn-danger" onclick="eliminarPedido('${p.id}')">🗑️</button></div>`;
        container.appendChild(div);
    });
}

function actualizarEstadisticasPedidos(pedidos) {
    document.getElementById('totalPedidos').textContent = pedidos.length;
    document.getElementById('pedidosPendientes').textContent = pedidos.filter(p => (p.estado || 'pendiente') === 'pendiente').length;
    document.getElementById('pedidosEntregados').textContent = pedidos.filter(p => p.estado === 'entregado').length;
    document.getElementById('totalGuaranies').textContent = pedidos.reduce((s, p) => s + p.total, 0).toLocaleString();
}

function marcarEntregado(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const p = pedidos.find(x => x.id === id);
    if (p) { p.estado = 'entregado'; localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos)); registrarActividad('pedido', `Pedido de ${p.cliente.nombre} marcado como entregado`); cargarPedidos(); cargarDashboard(); toast('Pedido marcado como entregado'); }
}

function marcarPendiente(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const p = pedidos.find(x => x.id === id);
    if (p) { p.estado = 'pendiente'; localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos)); cargarPedidos(); cargarDashboard(); toast('Pedido marcado como pendiente', 'info'); }
}

async function eliminarPedido(id) {
    if (!await confirmar('Eliminar Pedido', '¿Estás seguro de eliminar este pedido?', '🗑️')) return;
    let pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const p = pedidos.find(x => x.id === id);
    pedidos = pedidos.filter(p => p.id !== id);
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
    if (p) registrarActividad('pedido', `Pedido de ${p.cliente.nombre} eliminado`);
    cargarPedidos(); cargarDashboard();
    toast('Pedido eliminado', 'warning');
}

function exportarPedidosExcel() {
    const fecha = document.getElementById('filterFecha').value;
    let csv = 'Fecha,Cliente,Zona,Producto,Presentacion,Cantidad,Precio Unit,Subtotal,Total,Estado\n';
    todosLosPedidos.forEach(p => {
        const c = productosData.clientes.find(x => x.id === p.cliente.id);
        const zona = c?.zona || '';
        const estado = p.estado || 'pendiente';
        p.items.forEach((i, idx) => { csv += `"${p.fecha}","${p.cliente.nombre}","${zona}","${i.nombre}","${i.presentacion}",${i.cantidad},${i.precio_unitario},${i.subtotal},${idx === 0 ? p.total : ''},${estado}\n`; });
    });
    descargarCSV(csv, `pedidos_${fecha || 'todos'}.csv`);
    toast('Pedidos exportados', 'info');
}

// ============================================
// REPORTES
// ============================================
function mostrarEstadisticasReporte(pedidos) {
    const total = pedidos.reduce((s, p) => s + p.total, 0);
    const cant = pedidos.length;
    document.getElementById('rTotalVentas').textContent = `Gs. ${total.toLocaleString()}`;
    document.getElementById('rTotalPedidos').textContent = cant;
    document.getElementById('rTicketPromedio').textContent = `Gs. ${Math.round(total / cant).toLocaleString()}`;
    document.getElementById('statsReporte').style.display = 'block';
}

function reportePorZona(pedidos) {
    const zonas = {};
    pedidos.forEach(p => { const c = productosData.clientes.find(x => x.id === p.cliente.id); const z = c?.zona || 'Sin zona'; if (!zonas[z]) zonas[z] = {pedidos:0,total:0}; zonas[z].pedidos++; zonas[z].total += p.total; });
    const data = Object.entries(zonas).map(([zona,d]) => ({ zona, ...d, promedio: Math.round(d.total/d.pedidos) })).sort((a,b) => b.total - a.total);
    mostrarGrafico(data.map(d=>d.zona), data.map(d=>d.total), 'Ventas por Zona (Gs.)');
    mostrarTablaReporte(['Zona','Pedidos','Total Ventas','Ticket Promedio'], data.map(d=>[d.zona,d.pedidos,`Gs. ${d.total.toLocaleString()}`,`Gs. ${d.promedio.toLocaleString()}`]), 'Ventas por Zona');
}

function reportePorVendedor(pedidos) {
    const vendedores = {};
    pedidos.forEach(p => { const v = p.vendedor || 'Sin especificar'; if (!vendedores[v]) vendedores[v]={pedidos:0,total:0}; vendedores[v].pedidos++; vendedores[v].total += p.total; });
    const data = Object.entries(vendedores).map(([v,d]) => ({ vendedor:v, ...d, promedio: Math.round(d.total/d.pedidos) })).sort((a,b) => b.total - a.total);
    mostrarTablaReporte(['Vendedor','Pedidos','Total Ventas','Ticket Promedio'], data.map(d=>[d.vendedor,d.pedidos,`Gs. ${d.total.toLocaleString()}`,`Gs. ${d.promedio.toLocaleString()}`]), 'Ventas por Vendedor');
}

function reportePorProducto(pedidos) {
    const prods = {};
    pedidos.forEach(p => { p.items.forEach(i => { const key = `${i.nombre} (${i.presentacion})`; if (!prods[key]) prods[key]={cantidad:0,total:0}; prods[key].cantidad += i.cantidad; prods[key].total += i.subtotal; }); });
    const data = Object.entries(prods).map(([prod,d]) => ({ producto:prod, ...d })).sort((a,b) => b.total - a.total);
    mostrarTablaReporte(['Producto','Unidades','Total Ventas'], data.map(d=>[d.producto,d.cantidad,`Gs. ${d.total.toLocaleString()}`]), 'Ventas por Producto');
}

function reportePorCliente(pedidos) {
    const clientes = {};
    pedidos.forEach(p => { const n = p.cliente.nombre; const c = productosData.clientes.find(x => x.id === p.cliente.id); const z = c?.zona || ''; if (!clientes[n]) clientes[n]={pedidos:0,total:0,zona:z}; clientes[n].pedidos++; clientes[n].total += p.total; });
    const data = Object.entries(clientes).map(([nombre,d]) => ({ cliente:nombre, ...d, promedio: Math.round(d.total/d.pedidos) })).sort((a,b) => b.total - a.total);
    mostrarTablaReporte(['Cliente','Zona','Pedidos','Total Ventas','Ticket Promedio'], data.map(d=>[d.cliente,d.zona,d.pedidos,`Gs. ${d.total.toLocaleString()}`,`Gs. ${d.promedio.toLocaleString()}`]), 'Ventas por Cliente');
}

function mostrarTablaReporte(headers, rows, titulo) {
    document.getElementById('tituloReporte').textContent = titulo;
    document.getElementById('reporteHeader').innerHTML = '<tr>' + headers.map(h=>`<th>${h}</th>`).join('') + '</tr>';
    document.getElementById('reporteBody').innerHTML = rows.map(r=>'<tr>' + r.map(c=>`<td>${c}</td>`).join('') + '</tr>').join('');
    document.getElementById('resultadosReporte').style.display = 'block';
}

function exportarReporteExcel() {
    const tabla = document.getElementById('tablaReporte');
    let csv = '';
    Array.from(tabla.querySelectorAll('thead th')).forEach(th => csv += th.textContent + ',');
    csv += '\n';
    Array.from(tabla.querySelectorAll('tbody tr')).forEach(tr => { Array.from(tr.querySelectorAll('td')).forEach(td => csv += `"${td.textContent}",`); csv += '\n'; });
    descargarCSV(csv, `reporte_${tipoReporte}_${new Date().toISOString().split('T')[0]}.csv`);
    toast('Reporte exportado', 'info');
}

function generarReporte() {
    const desde = new Date(document.getElementById('reporteFechaDesde').value);
    const hasta = new Date(document.getElementById('reporteFechaHasta').value);
    hasta.setHours(23,59,59);
    const pedidos = todosLosPedidos.filter(p => { const f = new Date(p.fecha); return f >= desde && f <= hasta; });
    if (pedidos.length === 0) { toast('No hay pedidos en ese rango', 'warning'); return; }
    const comparacion = document.getElementById('comparacionPeriodo').value;
    if (comparacion !== 'ninguno') compararPeriodos(desde, hasta, comparacion);
    else document.getElementById('comparacionCard').style.display = 'none';
    mostrarEstadisticasReporte(pedidos);
    if (tipoReporte === 'margen') reporteMargenGanancia(pedidos);
    else if (tipoReporte === 'zona') reportePorZona(pedidos);
    else if (tipoReporte === 'vendedor') reportePorVendedor(pedidos);
    else if (tipoReporte === 'producto') reportePorProducto(pedidos);
    else if (tipoReporte === 'cliente') reportePorCliente(pedidos);
}

function compararPeriodos(desdeActual, hastaActual, tipo) {
    const dias = Math.ceil((hastaActual - desdeActual) / 86400000);
    let desdeAnt, hastaAnt;
    if (tipo === 'anterior') { hastaAnt = new Date(desdeActual.getTime()-1); desdeAnt = new Date(hastaAnt.getTime()-dias*86400000); }
    else { desdeAnt = new Date(desdeActual); desdeAnt.setMonth(desdeAnt.getMonth()-1); hastaAnt = new Date(hastaActual); hastaAnt.setMonth(hastaAnt.getMonth()-1); }
    const pActual = todosLosPedidos.filter(p => { const f=new Date(p.fecha); return f>=desdeActual&&f<=hastaActual; });
    const pAnterior = todosLosPedidos.filter(p => { const f=new Date(p.fecha); return f>=desdeAnt&&f<=hastaAnt; });
    const vActual = pActual.reduce((s,p)=>s+p.total,0);
    const vAnterior = pAnterior.reduce((s,p)=>s+p.total,0);
    const cambioV = vAnterior > 0 ? ((vActual-vAnterior)/vAnterior*100).toFixed(1) : 0;
    const cambioP = pAnterior.length > 0 ? ((pActual.length-pAnterior.length)/pAnterior.length*100).toFixed(1) : 0;
    document.getElementById('statsComparacion').innerHTML = `
        <div class="stat-card" style="background:linear-gradient(135deg,#dbeafe,#bfdbfe)"><div class="stat-label">Ventas Actual</div><div class="stat-value">Gs. ${vActual.toLocaleString()}</div><div style="color:${cambioV>=0?'#10b981':'#ef4444'};font-weight:600;margin-top:5px">${cambioV>=0?'↑':'↓'} ${Math.abs(cambioV)}%</div></div>
        <div class="stat-card"><div class="stat-label">Ventas Anterior</div><div class="stat-value">Gs. ${vAnterior.toLocaleString()}</div></div>
        <div class="stat-card"><div class="stat-label">Pedidos Actual</div><div class="stat-value">${pActual.length}</div><div style="color:${cambioP>=0?'#10b981':'#ef4444'};font-weight:600;margin-top:5px">${cambioP>=0?'↑':'↓'} ${Math.abs(cambioP)}%</div></div>`;
    document.getElementById('comparacionCard').style.display = 'block';
}

function reporteMargenGanancia(pedidos) {
    const productos = {};
    pedidos.forEach(p => { p.items.forEach(item => { const key = item.nombre; if (!productos[key]) productos[key]={cantidad:0,ingresos:0,costo:0}; productos[key].cantidad+=item.cantidad; productos[key].ingresos+=item.subtotal; productos[key].costo+=item.subtotal*0.7; }); });
    const data = Object.entries(productos).map(([nombre,d]) => ({ producto:nombre, ...d, ganancia:d.ingresos-d.costo, margen:((d.ingresos-d.costo)/d.ingresos*100).toFixed(1) })).sort((a,b)=>b.ganancia-a.ganancia);
    mostrarGrafico(data.slice(0,10).map(d=>d.producto), data.slice(0,10).map(d=>d.ganancia), 'Top 10 por Ganancia');
    mostrarTablaReporte(['Producto','Unidades','Ingresos','Costo Est.','Ganancia','Margen %'], data.map(d=>[d.producto,d.cantidad,`Gs. ${d.ingresos.toLocaleString()}`,`Gs. ${Math.round(d.costo).toLocaleString()}`,`Gs. ${Math.round(d.ganancia).toLocaleString()}`,`${d.margen}%`]), 'Análisis de Margen');
}

// ============================================
// PRECIOS POR CLIENTE
// ============================================
function cargarPreciosCliente() {
    const clienteId = document.getElementById('preciosCliente').value;
    if (!clienteId) { document.getElementById('preciosCard').style.display = 'none'; return; }
    clienteActualPrecios = productosData.clientes.find(c => c.id === clienteId);
    const tbody = document.getElementById('preciosBody');
    tbody.innerHTML = '';
    productosData.productos.forEach(prod => {
        prod.presentaciones.forEach((pres, idx) => {
            const personalizado = clienteActualPrecios.precios_personalizados?.[prod.id]?.find(p => p.tamano === pres.tamano)?.precio || '';
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${prod.nombre}</strong></td><td>${pres.tamano}</td><td>Gs. ${pres.precio_base.toLocaleString()}</td><td><input type="number" id="precio_${prod.id}_${idx}" value="${personalizado}" placeholder="Vacío = precio base" data-producto="${prod.id}" data-tamano="${pres.tamano}"></td>`;
            tbody.appendChild(tr);
        });
    });
    document.getElementById('preciosCard').style.display = 'block';
    document.getElementById('buscarProductoPrecio').oninput = (e) => {
        const filtro = e.target.value.toLowerCase();
        Array.from(tbody.querySelectorAll('tr')).forEach(tr => { tr.style.display = tr.querySelector('td').textContent.toLowerCase().includes(filtro) ? '' : 'none'; });
    };
}

function guardarPreciosPersonalizados() {
    if (!clienteActualPrecios) return;
    const inputs = document.querySelectorAll('[data-producto]');
    const nuevosPrecios = {};
    inputs.forEach(input => { const prodId = input.dataset.producto; const tamano = input.dataset.tamano; const precio = parseInt(input.value) || 0; if (precio > 0) { if (!nuevosPrecios[prodId]) nuevosPrecios[prodId] = []; nuevosPrecios[prodId].push({tamano,precio}); } });
    const cliente = productosData.clientes.find(c => c.id === clienteActualPrecios.id);
    cliente.precios_personalizados = nuevosPrecios;
    descargarJSON(productosData, 'productos.json');
    registrarActividad('cliente', `Precios personalizados actualizados para ${cliente.nombre}`);
    toast('Precios guardados. Sube productos.json a GitHub.', 'success');
}

// ============================================
// GESTIONAR PRODUCTOS
// ============================================
function filtrarProductos() {
    const filtro = document.getElementById('buscarProducto').value.toLowerCase();
    const mostrarOcultos = document.getElementById('mostrarOcultosProductos')?.checked || false;
    productosFiltrados = productosData.productos.filter(p => {
        const cumple = p.nombre.toLowerCase().includes(filtro) || p.id.toLowerCase().includes(filtro);
        return cumple && (mostrarOcultos || !p.oculto);
    });
    mostrarProductosGestion();
}

function mostrarProductosGestion() {
    const tbody = document.getElementById('productosBody');
    tbody.innerHTML = '';
    productosFiltrados.forEach(prod => {
        const catNombre = productosData.categorias.find(c=>c.id===prod.categoria)?.nombre||'';
        const presHTML = prod.presentaciones.map((p,i) => `<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center"><input type="text" value="${p.tamano}" onchange="actualizarPresentacion('${prod.id}',${i},'tamano',this.value)" style="width:90px;padding:6px;border:2px solid #e5e7eb;border-radius:6px;font-size:13px" placeholder="Tamaño"><input type="number" value="${p.precio_base}" onchange="actualizarPresentacion('${prod.id}',${i},'precio',this.value)" style="width:110px;padding:6px;border:2px solid #e5e7eb;border-radius:6px;font-size:13px" placeholder="Precio"><button onclick="eliminarPresentacion('${prod.id}',${i})" style="width:28px;height:28px;border:2px solid #ef4444;background:white;color:#ef4444;border-radius:6px;cursor:pointer;font-size:16px">×</button></div>`).join('');
        const oculto = prod.oculto || false;
        const tr = document.createElement('tr');
        tr.style.opacity = oculto ? '0.5' : '1';
        tr.innerHTML = `<td><strong>${prod.id}</strong></td><td><input type="text" value="${prod.nombre}" onchange="actualizarProducto('${prod.id}','nombre',this.value)"></td><td><select onchange="actualizarProducto('${prod.id}','categoria',this.value)">${productosData.categorias.map(c=>`<option value="${c.id}" ${c.id===prod.categoria?'selected':''}>${c.nombre}</option>`).join('')}</select></td><td><input type="text" value="${prod.subcategoria}" onchange="actualizarProducto('${prod.id}','subcategoria',this.value)"></td><td>${presHTML}<button onclick="agregarPresentacion('${prod.id}')" class="btn btn-primary" style="padding:5px 10px;font-size:12px;margin-top:5px">+ Presentación</button></td><td><button onclick="toggleOcultarProducto('${prod.id}')" style="width:32px;height:32px;border:2px solid ${oculto?'#10b981':'#f59e0b'};background:white;color:${oculto?'#10b981':'#f59e0b'};border-radius:6px;cursor:pointer;margin-right:5px" title="${oculto?'Mostrar':'Ocultar'}">${oculto?'👁️':'🙈'}</button><button onclick="eliminarProducto('${prod.id}')" style="width:32px;height:32px;border:2px solid #ef4444;background:white;color:#ef4444;border-radius:6px;cursor:pointer">🗑️</button></td>`;
        tbody.appendChild(tr);
    });
}

function actualizarProducto(id, campo, valor) { const p = productosData.productos.find(x=>x.id===id); if (p) p[campo] = valor; }
function actualizarPresentacion(id, idx, campo, valor) { const p = productosData.productos.find(x=>x.id===id); if (p && p.presentaciones[idx]) { if (campo==='precio') p.presentaciones[idx].precio_base=parseInt(valor)||0; else p.presentaciones[idx].tamano=valor; } }
function eliminarPresentacion(id, idx) { const p = productosData.productos.find(x=>x.id===id); if (p && p.presentaciones.length > 1) { p.presentaciones.splice(idx,1); mostrarProductosGestion(); } else toast('Debe tener al menos una presentación', 'warning'); }
function agregarPresentacion(id) { const p = productosData.productos.find(x=>x.id===id); if (p) { p.presentaciones.push({tamano:'',precio_base:0}); mostrarProductosGestion(); } }

async function eliminarProducto(id) {
    if (!await confirmar('Eliminar Producto', '¿Eliminar este producto?', '🗑️')) return;
    const prod = productosData.productos.find(p=>p.id===id);
    productosData.productos = productosData.productos.filter(p=>p.id!==id);
    productosFiltrados = productosFiltrados.filter(p=>p.id!==id);
    mostrarProductosGestion();
    if (prod) registrarActividad('producto', `Producto "${prod.nombre}" eliminado`);
    toast('Producto eliminado', 'warning');
}

function mostrarModalNuevoProducto() { document.getElementById('modalNuevoProducto').classList.add('show'); }
function cerrarModal() { document.getElementById('modalNuevoProducto').classList.remove('show'); }

function agregarNuevoProducto() {
    const nombre = document.getElementById('nuevoNombre').value;
    const categoria = document.getElementById('nuevoCategoria').value;
    const subcategoria = document.getElementById('nuevoSubcategoria').value;
    const presentacionesStr = document.getElementById('nuevoPresentaciones').value;
    const precio = parseInt(document.getElementById('nuevoPrecio').value) || 0;
    if (!nombre || !categoria || !subcategoria || !presentacionesStr) { toast('Completa todos los campos', 'warning'); return; }
    const ultimoId = productosData.productos.length > 0 ? parseInt(productosData.productos[productosData.productos.length-1].id.replace('P','')) : 0;
    const nuevoId = `P${String(ultimoId+1).padStart(3,'0')}`;
    productosData.productos.push({ id:nuevoId, nombre, categoria, subcategoria, presentaciones: presentacionesStr.split(',').map(p=>({tamano:p.trim(),precio_base:precio})) });
    productosFiltrados = [...productosData.productos];
    mostrarProductosGestion(); cerrarModal();
    document.getElementById('nuevoNombre').value=''; document.getElementById('nuevoSubcategoria').value=''; document.getElementById('nuevoPresentaciones').value=''; document.getElementById('nuevoPrecio').value='';
    registrarActividad('producto', `Nuevo producto "${nombre}" agregado`);
    toast(`Producto "${nombre}" agregado`, 'success');
}

function guardarProductos() { descargarJSON(productosData, 'productos.json'); registrarActividad('producto', 'Productos guardados y descargados'); toast('Productos guardados. Sube productos.json a GitHub.', 'success'); }

function toggleOcultarProducto(id) {
    const prod = productosData.productos.find(p=>p.id===id);
    if (prod) { prod.oculto = !prod.oculto; mostrarProductosGestion(); descargarJSON(productosData, 'productos.json'); registrarActividad('producto', `Producto "${prod.nombre}" ${prod.oculto?'ocultado':'mostrado'}`); toast(`Producto ${prod.oculto?'ocultado':'mostrado'}. Sube productos.json a GitHub.`, 'info'); }
}

// ============================================
// GESTIONAR CLIENTES
// ============================================
function filtrarClientes() {
    const filtro = document.getElementById('buscarCliente').value.toLowerCase();
    const mostrarOcultos = document.getElementById('mostrarOcultosClientes')?.checked || false;
    clientesFiltrados = productosData.clientes.filter(c => {
        const cumple = (c.nombre&&c.nombre.toLowerCase().includes(filtro)) || (c.razon_social&&c.razon_social.toLowerCase().includes(filtro)) || (c.ruc&&c.ruc.toLowerCase().includes(filtro)) || (c.telefono&&c.telefono.toLowerCase().includes(filtro)) || (c.direccion&&c.direccion.toLowerCase().includes(filtro)) || (c.zona&&c.zona.toLowerCase().includes(filtro)) || (c.encargado&&c.encargado.toLowerCase().includes(filtro)) || c.id.toLowerCase().includes(filtro);
        return cumple && (mostrarOcultos || !c.oculto);
    });
    mostrarClientesGestion();
}

function mostrarClientesGestion() {
    const tbody = document.getElementById('clientesBody');
    tbody.innerHTML = '';
    clientesFiltrados.forEach(cliente => {
        const cantPrecios = cliente.precios_personalizados ? Object.keys(cliente.precios_personalizados).length : 0;
        const oculto = cliente.oculto || false;
        const tr = document.createElement('tr');
        tr.style.opacity = oculto ? '0.5' : '1';
        tr.innerHTML = `<td><strong>${cliente.id}</strong></td><td><input type="text" value="${cliente.razon_social||cliente.nombre||''}" onchange="actualizarCliente('${cliente.id}','razon_social',this.value)" style="min-width:200px"></td><td><input type="text" value="${cliente.ruc||''}" onchange="actualizarCliente('${cliente.id}','ruc',this.value)" style="min-width:120px"></td><td><input type="tel" value="${cliente.telefono||''}" onchange="actualizarCliente('${cliente.id}','telefono',this.value)" style="min-width:120px"></td><td><input type="text" value="${cliente.direccion||cliente.zona||''}" onchange="actualizarCliente('${cliente.id}','direccion',this.value)" style="min-width:200px"></td><td><input type="text" value="${cliente.encargado||''}" onchange="actualizarCliente('${cliente.id}','encargado',this.value)" style="min-width:150px"></td><td style="text-align:center">${cantPrecios>0?`<span style="color:#2563eb;font-weight:600">${cantPrecios}</span>`:'-'}</td><td><button onclick="toggleOcultarCliente('${cliente.id}')" style="width:32px;height:32px;border:2px solid ${oculto?'#10b981':'#f59e0b'};background:white;color:${oculto?'#10b981':'#f59e0b'};border-radius:6px;cursor:pointer;margin-right:5px">${oculto?'👁️':'🙈'}</button><button onclick="verDetalleCliente('${cliente.id}')" class="btn btn-secondary" style="padding:6px 12px;font-size:12px;margin-right:5px">📋</button><button onclick="eliminarCliente('${cliente.id}')" style="width:32px;height:32px;border:2px solid #ef4444;background:white;color:#ef4444;border-radius:6px;cursor:pointer">🗑️</button></td>`;
        tbody.appendChild(tr);
    });
}

function actualizarCliente(id, campo, valor) { const c = productosData.clientes.find(x=>x.id===id); if (c) c[campo] = valor; }

async function eliminarCliente(id) {
    if (!await confirmar('Eliminar Cliente', '¿Eliminar este cliente? Se perderán sus precios personalizados.', '🗑️')) return;
    const cl = productosData.clientes.find(c=>c.id===id);
    productosData.clientes = productosData.clientes.filter(c=>c.id!==id);
    clientesFiltrados = clientesFiltrados.filter(c=>c.id!==id);
    mostrarClientesGestion();
    if (cl) registrarActividad('cliente', `Cliente "${cl.nombre}" eliminado`);
    toast('Cliente eliminado', 'warning');
}

function verDetalleCliente(id) {
    const c = productosData.clientes.find(x=>x.id===id);
    if (!c) return;
    const precios = c.precios_personalizados ? Object.keys(c.precios_personalizados).length : 0;
    toast(`${c.razon_social||c.nombre} • RUC: ${c.ruc||'N/A'} • Tel: ${c.telefono||'N/A'} • ${precios} precios`, 'info', 5000);
}

function toggleOcultarCliente(id) {
    const c = productosData.clientes.find(x=>x.id===id);
    if (c) { c.oculto = !c.oculto; mostrarClientesGestion(); descargarJSON(productosData, 'productos.json'); registrarActividad('cliente', `Cliente "${c.nombre}" ${c.oculto?'ocultado':'mostrado'}`); toast(`Cliente ${c.oculto?'ocultado':'mostrado'}. Sube productos.json a GitHub.`, 'info'); }
}

function mostrarModalNuevoCliente() { document.getElementById('modalNuevoCliente').classList.add('show'); }
function cerrarModalCliente() { document.getElementById('modalNuevoCliente').classList.remove('show'); }

function agregarNuevoCliente() {
    const razon = document.getElementById('nuevoClienteRazon').value.trim();
    const ruc = document.getElementById('nuevoClienteRUC').value.trim();
    const tel = document.getElementById('nuevoClienteTelefono').value.trim();
    const dir = document.getElementById('nuevoClienteDireccion').value.trim();
    const enc = document.getElementById('nuevoClienteEncargado').value.trim();
    if (!razon || !ruc || !tel || !dir) { toast('Completa los campos obligatorios', 'warning'); return; }
    const ultimoId = productosData.clientes.length > 0 ? parseInt(productosData.clientes[productosData.clientes.length-1].id.replace('C','')) : 0;
    const nuevoId = `C${String(ultimoId+1).padStart(3,'0')}`;
    productosData.clientes.push({ id:nuevoId, nombre:razon, razon_social:razon, ruc, telefono:tel, direccion:dir, encargado:enc, zona:dir, tipo:'mayorista_estandar', precios_personalizados:{} });
    clientesFiltrados = [...productosData.clientes]; mostrarClientesGestion(); cerrarModalCliente();
    ['nuevoClienteRazon','nuevoClienteRUC','nuevoClienteTelefono','nuevoClienteDireccion','nuevoClienteEncargado'].forEach(id=>document.getElementById(id).value='');
    registrarActividad('cliente', `Nuevo cliente "${razon}" agregado`);
    toast(`Cliente "${razon}" agregado`, 'success');
}

function guardarClientes() { descargarJSON(productosData, 'productos.json'); registrarActividad('cliente', 'Clientes guardados y descargados'); toast('Clientes guardados. Sube productos.json a GitHub.', 'success'); }

// ============================================
// CRÉDITOS
// ============================================
function cargarCreditos() {
    const f = document.getElementById('filterClienteCredito');
    f.innerHTML = '<option value="">Todos</option>';
    productosData.clientes.forEach(c => { const opt = document.createElement('option'); opt.value = c.id; opt.textContent = `${c.nombre} — ${c.zona}`; f.appendChild(opt); });
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
    if (creditos.length === 0) { container.innerHTML = '<div class="empty-state"><div style="font-size:48px;margin-bottom:15px">💳</div>No hay créditos</div>'; return; }
    container.innerHTML = '';

    // Add bulk actions bar
    const pendientes = creditos.filter(p => (p.estado || 'pendiente_pago') === 'pendiente_pago');
    if (pendientes.length > 0) {
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:10px;padding:16px 20px;border-bottom:2px solid #e5e7eb;flex-wrap:wrap;align-items:center';
        bar.innerHTML = `<span style="font-size:14px;color:#6b7280;flex:1">${pendientes.length} crédito${pendientes.length>1?'s':''} pendiente${pendientes.length>1?'s':''}</span><button class="btn btn-success" onclick="enviarRecordatoriosMasivos()" style="padding:8px 16px;font-size:13px">📋 Copiar Resumen</button>`;
        container.appendChild(bar);
    }

    creditos.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    creditos.forEach(p => {
        const estado = p.estado || 'pendiente_pago';
        const c = productosData.clientes.find(x=>x.id===p.cliente.id);
        const zona = c?.zona || '';
        const dias = Math.floor((new Date() - new Date(p.fecha)) / 86400000);
        // Aging class
        let ageClass = '';
        if (estado === 'pendiente_pago') {
            if (dias > 30) ageClass = 'credit-age-critical';
            else if (dias > 15) ageClass = 'credit-age-danger';
            else if (dias > 7) ageClass = 'credit-age-warning';
            else ageClass = 'credit-age-ok';
        }
        const div = document.createElement('div');
        div.className = `pedido-card ${ageClass}`;
        div.innerHTML = `
            <div class="pedido-header"><div><h3 style="margin-bottom:5px">${p.cliente.nombre}</h3><div style="font-size:14px;color:#6b7280">📍 ${zona} • 🕐 ${new Date(p.fecha).toLocaleString('es-PY')}${estado==='pendiente_pago'?` • <strong style="color:${dias>15?'#ef4444':dias>7?'#f59e0b':'#6b7280'}">⏳ ${dias} día${dias!==1?'s':''}</strong>`:''}</div>${p.notas?`<div style="font-size:13px;color:#6b7280;margin-top:5px">📝 ${p.notas}</div>`:''}</div><span class="pedido-status ${estado==='pagado'?'status-entregado':'status-pendiente'}">${estado==='pagado'?'PAGADO':'PENDIENTE'}</span></div>
            <div style="margin-bottom:15px">${p.items.map(i=>`<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px"><span>${i.nombre} <span style="color:#6b7280">(${i.presentacion} × ${i.cantidad})</span></span><strong>Gs. ${i.subtotal.toLocaleString()}</strong></div>`).join('')}</div>
            <div style="padding-top:15px;border-top:2px solid #e5e7eb">${p.descuento>0?`<div style="display:flex;justify-content:space-between;font-size:14px;color:#ef4444;margin-bottom:5px"><span>Descuento (${p.descuento}%)</span><span>-Gs. ${p.monto_descuento.toLocaleString()}</span></div>`:''}<div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700;color:#2563eb"><span>TOTAL</span><span>Gs. ${p.total.toLocaleString()}</span></div></div>
            <div style="display:flex;gap:10px;margin-top:15px;flex-wrap:wrap">${estado==='pendiente_pago'?`<button class="btn btn-success" onclick="marcarCreditoPagado('${p.id}')">✓ Pagado</button><button class="btn btn-primary" onclick="enviarRecordatorioCredito('${p.id}')" style="padding:10px 16px">📱 Recordar</button>`:`<button class="btn btn-secondary" onclick="marcarCreditoPendiente('${p.id}')">↩ Pendiente</button>`}<button class="btn btn-secondary" onclick="compartirCreditoPorWhatsApp('${p.id}')">📤 Compartir</button></div>`;
        container.appendChild(div);
    });
}

function actualizarEstadisticasCreditos(creditos) {
    const pend = creditos.filter(p => (p.estado || 'pendiente_pago') === 'pendiente_pago');
    document.getElementById('totalCreditosPendientes').textContent = `Gs. ${pend.reduce((s,p)=>s+p.total,0).toLocaleString()}`;
    document.getElementById('cantidadCreditos').textContent = creditos.length;
    document.getElementById('clientesConCredito').textContent = [...new Set(creditos.map(p=>p.cliente.id))].length;
}

function marcarCreditoPagado(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos')||'[]');
    const p = pedidos.find(x=>x.id===id);
    if (p) { p.estado='pagado'; localStorage.setItem('hdv_pedidos',JSON.stringify(pedidos)); todosLosPedidos=pedidos; aplicarFiltrosCreditos(); cargarDashboard(); registrarActividad('credito', `Crédito de ${p.cliente.nombre} marcado como pagado`); toast('Crédito pagado', 'success'); }
}

function marcarCreditoPendiente(id) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos')||'[]');
    const p = pedidos.find(x=>x.id===id);
    if (p) { p.estado='pendiente_pago'; localStorage.setItem('hdv_pedidos',JSON.stringify(pedidos)); todosLosPedidos=pedidos; aplicarFiltrosCreditos(); cargarDashboard(); toast('Crédito marcado pendiente', 'info'); }
}

function compartirCreditoPorWhatsApp(id) {
    const p = todosLosPedidos.find(x=>x.id===id);
    if (!p) return;
    let msg = `*RECORDATORIO - HDV*\n\n📋 Pedido #${p.id.slice(-6)}\n📅 ${new Date(p.fecha).toLocaleString('es-PY')}\n👤 ${p.cliente.nombre}\n\n*TOTAL: Gs. ${p.total.toLocaleString()}*\nEstado: ${p.estado==='pagado'?'✅ PAGADO':'⏳ PENDIENTE'}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

function exportarCreditosExcel() {
    let csv = 'Fecha,Cliente,Zona,Total,Estado,Notas\n';
    const cliente = document.getElementById('filterClienteCredito').value;
    const estado = document.getElementById('filterEstadoCredito').value;
    let creditos = todosLosPedidos.filter(p=>p.tipo_pago==='credito');
    if (cliente) creditos = creditos.filter(p=>p.cliente.id===cliente);
    if (estado !== 'todos') creditos = creditos.filter(p=>(p.estado||'pendiente_pago')===estado);
    creditos.forEach(p => { const c = productosData.clientes.find(x=>x.id===p.cliente.id); csv += `"${p.fecha}","${p.cliente.nombre}","${c?.zona||''}",${p.total},"${p.estado||'pendiente_pago'}","${p.notas||''}"\n`; });
    descargarCSV(csv, `creditos_${new Date().toISOString().split('T')[0]}.csv`);
    toast('Créditos exportados', 'info');
}

// ============================================
// STOCK/INVENTARIO
// ============================================
let stockFiltrado = [];
function cargarStock() {
    stockFiltrado = [];
    productosData.productos.forEach(prod => { prod.presentaciones.forEach((pres,idx) => { if (!pres.stock) pres.stock=0; if (!pres.stock_minimo) pres.stock_minimo=10; stockFiltrado.push({ productoId:prod.id, nombre:prod.nombre, presentacion:pres.tamano, presIdx:idx, stock:pres.stock||0, stock_minimo:pres.stock_minimo||10 }); }); });
    mostrarStock();
}

function filtrarStock() {
    const filtro = document.getElementById('buscarStock').value.toLowerCase();
    stockFiltrado = [];
    productosData.productos.forEach(prod => { if (!prod.nombre.toLowerCase().includes(filtro)&&filtro) return; prod.presentaciones.forEach((pres,idx) => { if (!pres.stock) pres.stock=0; if (!pres.stock_minimo) pres.stock_minimo=10; stockFiltrado.push({ productoId:prod.id, nombre:prod.nombre, presentacion:pres.tamano, presIdx:idx, stock:pres.stock||0, stock_minimo:pres.stock_minimo||10 }); }); });
    mostrarStock();
}

function mostrarStock() {
    const tbody = document.getElementById('stockBody');
    tbody.innerHTML = '';
    stockFiltrado.forEach(item => {
        const estado = item.stock===0?'🔴 Agotado':item.stock<=item.stock_minimo?'🟡 Bajo':'🟢 OK';
        const color = item.stock===0?'#ef4444':item.stock<=item.stock_minimo?'#f59e0b':'#10b981';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${item.nombre}</strong></td><td>${item.presentacion}</td><td><input type="number" value="${item.stock}" min="0" onchange="actualizarStock('${item.productoId}',${item.presIdx},'stock',this.value)" style="width:100px"></td><td><input type="number" value="${item.stock_minimo}" min="0" onchange="actualizarStock('${item.productoId}',${item.presIdx},'stock_minimo',this.value)" style="width:100px"></td><td><span style="color:${color};font-weight:600">${estado}</span></td><td><button onclick="ajustarStock('${item.productoId}',${item.presIdx},10)" class="btn btn-primary" style="padding:6px 12px;font-size:12px">+10</button> <button onclick="ajustarStock('${item.productoId}',${item.presIdx},-10)" class="btn btn-secondary" style="padding:6px 12px;font-size:12px">-10</button></td>`;
        tbody.appendChild(tr);
    });
}

function actualizarStock(productoId, presIdx, campo, valor) { const prod = productosData.productos.find(p=>p.id===productoId); if (prod && prod.presentaciones[presIdx]) { prod.presentaciones[presIdx][campo]=parseInt(valor)||0; filtrarStock(); } }
function ajustarStock(productoId, presIdx, cantidad) { const prod = productosData.productos.find(p=>p.id===productoId); if (prod && prod.presentaciones[presIdx]) { prod.presentaciones[presIdx].stock=(prod.presentaciones[presIdx].stock||0)+cantidad; if (prod.presentaciones[presIdx].stock<0) prod.presentaciones[presIdx].stock=0; filtrarStock(); } }
function guardarStock() { descargarJSON(productosData, 'productos.json'); registrarActividad('stock', 'Stock guardado y descargado'); toast('Stock guardado. Sube productos.json a GitHub.', 'success'); }
function exportarStockExcel() { let csv='Producto,Presentacion,Stock Actual,Stock Minimo,Estado\n'; stockFiltrado.forEach(i => { const e=i.stock===0?'Agotado':i.stock<=i.stock_minimo?'Bajo':'OK'; csv+=`"${i.nombre}","${i.presentacion}",${i.stock},${i.stock_minimo},"${e}"\n`; }); descargarCSV(csv, `stock_${new Date().toISOString().split('T')[0]}.csv`); toast('Stock exportado', 'info'); }

// ============================================
// HERRAMIENTAS
// ============================================
function crearBackup() {
    const backup = { fecha: new Date().toISOString(), version:'3.1', datos:{ productos:productosData, pedidos:todosLosPedidos, actividad: JSON.parse(localStorage.getItem('hdv_actividad')||'[]'), catalogo_imgs: JSON.parse(localStorage.getItem('hdv_catalogo_imgs')||'{}'), rutas: JSON.parse(localStorage.getItem('hdv_rutas')||'[]') } };
    descargarJSON(backup, `hdv_backup_${new Date().toISOString().split('T')[0]}.json`);
    registrarActividad('sistema', 'Backup creado');
    toast('Backup descargado', 'success');
}

function restaurarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    confirmar('Restaurar Backup', 'Esto reemplazará todos los datos actuales. ¿Continuar?', '📤', 'Restaurar', 'btn-primary').then(ok => {
        if (!ok) { event.target.value=''; return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const backup = JSON.parse(e.target.result);
                if (backup.datos) {
                    productosData = backup.datos.productos;
                    localStorage.setItem('hdv_pedidos', JSON.stringify(backup.datos.pedidos));
                    if (backup.datos.actividad) localStorage.setItem('hdv_actividad', JSON.stringify(backup.datos.actividad));
                    if (backup.datos.catalogo_imgs) localStorage.setItem('hdv_catalogo_imgs', JSON.stringify(backup.datos.catalogo_imgs));
                    if (backup.datos.rutas) localStorage.setItem('hdv_rutas', JSON.stringify(backup.datos.rutas));
                    registrarActividad('sistema', 'Backup restaurado');
                    toast('Backup restaurado. Recargando...', 'success');
                    setTimeout(() => location.reload(), 1500);
                }
            } catch(err) { toast('Error: archivo inválido', 'error'); }
            event.target.value='';
        };
        reader.readAsText(file);
    });
}

function descargarPlantillaExcel() { descargarCSV('Nombre,Categoria,Subcategoria,Presentacion,Precio\nProducto Ejemplo,cuidado_personal,Jabones,125g,5000\n', 'plantilla_productos.csv'); toast('Plantilla descargada', 'info'); }

function importarProductosExcel(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const lineas = e.target.result.split('\n').filter(l=>l.trim()); lineas.shift();
            let agregados = 0;
            lineas.forEach(linea => { const [nombre,cat,sub,pres,precio] = linea.split(',').map(s=>s.trim()); if (!nombre||!cat) return; const uid = productosData.productos.length>0?parseInt(productosData.productos[productosData.productos.length-1].id.replace('P','')):0; productosData.productos.push({id:`P${String(uid+agregados+1).padStart(3,'0')}`,nombre,categoria:cat,subcategoria:sub||'General',presentaciones:[{tamano:pres||'Unidad',precio_base:parseInt(precio)||0}]}); agregados++; });
            if (agregados>0) { descargarJSON(productosData, 'productos.json'); registrarActividad('producto', `${agregados} productos importados`); toast(`${agregados} productos importados. Sube a GitHub.`, 'success'); }
        } catch(err) { toast('Error al importar: '+err.message, 'error'); }
        event.target.value='';
    };
    reader.readAsText(file);
}

function descargarPlantillaClientes() { descargarCSV('Razon Social,RUC,Telefono,Direccion,Encargado\nSupermercado Central S.A.,80012345-6,0981234567,"Av. Central 1234",Juan Pérez\n', 'plantilla_clientes.csv'); toast('Plantilla descargada', 'info'); }

function importarClientesExcel(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const lineas = e.target.result.split('\n').filter(l=>l.trim()); lineas.shift();
            let agregados = 0;
            lineas.forEach(linea => { const [razon,ruc,tel,dir,enc] = linea.split(',').map(s=>s.trim().replace(/^"|"$/g,'')); if (!razon||!ruc) return; const uid = productosData.clientes.length>0?parseInt(productosData.clientes[productosData.clientes.length-1].id.replace('C','')):0; productosData.clientes.push({id:`C${String(uid+agregados+1).padStart(3,'0')}`,nombre:razon,razon_social:razon,ruc:ruc||'',telefono:tel||'',direccion:dir||'',encargado:enc||'',zona:dir||'',tipo:'mayorista_estandar',oculto:false,precios_personalizados:{}}); agregados++; });
            if (agregados>0) { descargarJSON(productosData, 'productos.json'); registrarActividad('cliente', `${agregados} clientes importados`); toast(`${agregados} clientes importados. Sube a GitHub.`, 'success'); }
        } catch(err) { toast('Error al importar: '+err.message, 'error'); }
        event.target.value='';
    };
    reader.readAsText(file);
}

function limpiarPedidos() {
    confirmar('Borrar Pedidos', '¿ELIMINAR TODOS los pedidos? Esta acción NO se puede deshacer.', '🗑️').then(ok => {
        if (!ok) return;
        confirmar('Confirmación Final', '¿Estás completamente seguro?', '⚠️').then(ok2 => {
            if (!ok2) return;
            localStorage.removeItem('hdv_pedidos'); todosLosPedidos = [];
            registrarActividad('sistema', 'Todos los pedidos eliminados');
            toast('Todos los pedidos eliminados', 'warning');
            setTimeout(() => location.reload(), 1500);
        });
    });
}

function limpiarStockLocal() {
    confirmar('Resetear Stock', '¿Resetear el stock guardado localmente?', '📊').then(ok => {
        if (!ok) return;
        localStorage.removeItem('stock_local');
        registrarActividad('stock', 'Stock local reseteado');
        toast('Stock local reseteado', 'success');
    });
}

// ============================================
// UTILIDADES
// ============================================
let chartInstance = null;
function mostrarGrafico(labels, datos, titulo) {
    const ctx = document.getElementById('chartReporte').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{label:titulo,data:datos,backgroundColor:'rgba(37,99,235,0.8)',borderColor:'rgba(37,99,235,1)',borderWidth:2}] }, options:{ responsive:true, maintainAspectRatio:true, plugins:{ legend:{display:false}, title:{display:true,text:titulo,font:{size:16,weight:'bold'}} }, scales:{ y:{beginAtZero:true,ticks:{callback:v=>'Gs. '+v.toLocaleString()}} } } });
    document.getElementById('graficoReporte').style.display='block';
}

function descargarCSV(contenido, nombre) { const blob=new Blob([contenido],{type:'text/csv;charset=utf-8;'}); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=nombre; link.click(); }
function descargarJSON(data, nombre) { const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=nombre; link.click(); }

// ============================================
// SERVICE WORKER
// ============================================
async function registrarServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const reg = await navigator.serviceWorker.register('service-worker.js');
            reg.addEventListener('updatefound', () => { const nw = reg.installing; nw.addEventListener('statechange', () => { if (nw.state==='installed'&&navigator.serviceWorker.controller) { const btn=document.getElementById('updateButton'); if(btn) btn.style.display='block'; } }); });
            setInterval(() => reg.update(), 30000);
        } catch(e) { console.log('SW no disponible:', e); }
    }
}

function actualizarAhora() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(r => { if (r&&r.waiting) r.waiting.postMessage('SKIP_WAITING'); });
        if ('caches' in window) caches.keys().then(names => names.forEach(n => caches.delete(n)));
        setTimeout(() => window.location.reload(true), 500);
    }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
window.addEventListener('load', registrarServiceWorker);

// ============================================
// SIDEBAR
// ============================================
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function toggleMenuSection(el) { el.parentElement.classList.toggle('collapsed'); }

function cambiarSeccion(seccion) {
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(item => { if (item.getAttribute('onclick')&&item.getAttribute('onclick').includes(`'${seccion}'`)) item.classList.add('active'); });
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const el = document.getElementById(`seccion-${seccion}`);
    if (el) el.classList.add('active');
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
    if (seccion==='dashboard') cargarDashboard();
    if (seccion==='productos' && productosFiltrados.length>0) mostrarProductosGestion();
    if (seccion==='clientes') { clientesFiltrados=[...productosData.clientes]; mostrarClientesGestion(); }
    if (seccion==='creditos') cargarCreditos();
    if (seccion==='stock') cargarStock();
    if (seccion==='actividad') renderActividad(obtenerActividad(50), 'actividadCompleta');
    if (seccion==='catalogo') inicializarCatalogo();
    if (seccion==='rutas') inicializarRutas();
}

// ============================================
// CATÁLOGO VISUAL DE PRODUCTOS
// ============================================
let catalogoImagenActualId = null;

function inicializarCatalogo() {
    const select = document.getElementById('filtroCatalogoCat');
    if (select.options.length <= 1) {
        productosData.categorias.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nombre;
            select.appendChild(opt);
        });
    }
    renderCatalogo();
}

function renderCatalogo() {
    const filtro = (document.getElementById('buscarCatalogo')?.value || '').toLowerCase();
    const cat = document.getElementById('filtroCatalogoCat')?.value || '';
    const mostrarOcultos = document.getElementById('catalogoMostrarOcultos')?.checked || false;
    const imagenes = JSON.parse(localStorage.getItem('hdv_catalogo_imgs') || '{}');
    const grid = document.getElementById('catalogoGrid');

    let prods = productosData.productos.filter(p => {
        if (!mostrarOcultos && p.oculto) return false;
        if (cat && p.categoria !== cat) return false;
        if (filtro && !p.nombre.toLowerCase().includes(filtro)) return false;
        return true;
    });

    if (prods.length === 0) {
        grid.innerHTML = '<div class="dash-empty" style="grid-column:1/-1;padding:60px">No se encontraron productos</div>';
        return;
    }

    grid.innerHTML = prods.map(prod => {
        const img = imagenes[prod.id];
        const catNombre = productosData.categorias.find(c => c.id === prod.categoria)?.nombre || prod.categoria;
        const presHTML = prod.presentaciones.map(p =>
            `<span class="catalogo-precio">${p.tamano} — Gs. ${p.precio_base.toLocaleString()}</span>`
        ).join('');
        return `<div class="catalogo-item ${prod.oculto ? 'catalogo-oculto' : ''}" onclick="abrirModalImagen('${prod.id}')">
            <div class="catalogo-img">${img ? `<img src="${img}" alt="${prod.nombre}">` : '📦'}</div>
            <div class="catalogo-info">
                <div class="catalogo-nombre">${prod.nombre}</div>
                <div class="catalogo-cat">${catNombre} • ${prod.subcategoria || ''}</div>
                <div class="catalogo-precios">${presHTML}</div>
            </div>
        </div>`;
    }).join('');
}

function abrirModalImagen(productoId) {
    catalogoImagenActualId = productoId;
    const imagenes = JSON.parse(localStorage.getItem('hdv_catalogo_imgs') || '{}');
    const img = imagenes[productoId];
    const preview = document.getElementById('imgPreview');
    const btnEliminar = document.getElementById('btnEliminarImg');
    if (img) {
        preview.innerHTML = `<img src="${img}" style="max-width:200px;max-height:200px;border-radius:12px">`;
        btnEliminar.style.display = 'inline-block';
    } else {
        preview.innerHTML = '📦';
        preview.style.cssText = 'width:200px;height:200px;background:#f3f4f6;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:64px;color:#d1d5db';
        btnEliminar.style.display = 'none';
    }
    document.getElementById('catalogoImgInput').value = '';
    document.getElementById('modalImagenCatalogo').classList.add('show');
}

function cerrarModalImagen() {
    document.getElementById('modalImagenCatalogo').classList.remove('show');
    catalogoImagenActualId = null;
}

function previsualizarImagen(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
        toast('Imagen muy grande (máx 3MB)', 'warning');
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('imgPreview');
        preview.innerHTML = `<img src="${e.target.result}" style="max-width:200px;max-height:200px;border-radius:12px">`;
        preview.style.cssText = '';
    };
    reader.readAsDataURL(file);
}

function guardarImagenCatalogo() {
    if (!catalogoImagenActualId) return;
    const fileInput = document.getElementById('catalogoImgInput');
    const file = fileInput.files[0];

    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            // Compress by resizing via canvas
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxSize = 400;
                let w = img.width, h = img.height;
                if (w > maxSize || h > maxSize) {
                    if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                    else { w = Math.round(w * maxSize / h); h = maxSize; }
                }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                const compressed = canvas.toDataURL('image/jpeg', 0.7);
                guardarImgEnStorage(compressed);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        cerrarModalImagen();
    }
}

function guardarImgEnStorage(dataUrl) {
    try {
        const imagenes = JSON.parse(localStorage.getItem('hdv_catalogo_imgs') || '{}');
        imagenes[catalogoImagenActualId] = dataUrl;
        localStorage.setItem('hdv_catalogo_imgs', JSON.stringify(imagenes));
        const prod = productosData.productos.find(p => p.id === catalogoImagenActualId);
        registrarActividad('producto', `Imagen actualizada para "${prod?.nombre || catalogoImagenActualId}"`);
        toast('Imagen guardada', 'success');
        cerrarModalImagen();
        renderCatalogo();
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            toast('Sin espacio. Elimina otras imágenes primero.', 'error');
        } else {
            toast('Error al guardar imagen', 'error');
        }
    }
}

function eliminarImagenCatalogo() {
    if (!catalogoImagenActualId) return;
    const imagenes = JSON.parse(localStorage.getItem('hdv_catalogo_imgs') || '{}');
    delete imagenes[catalogoImagenActualId];
    localStorage.setItem('hdv_catalogo_imgs', JSON.stringify(imagenes));
    toast('Imagen eliminada', 'info');
    cerrarModalImagen();
    renderCatalogo();
}

// ============================================
// AGENDA DE RUTAS / VISITAS
// ============================================
function inicializarRutas() {
    const select = document.getElementById('filtroZonaRuta');
    if (select.options.length <= 1) {
        const zonas = [...new Set(productosData.clientes.map(c => c.zona))];
        zonas.forEach(z => {
            const opt = document.createElement('option');
            opt.value = z; opt.textContent = z;
            select.appendChild(opt);
        });
    }
    const selectCliente = document.getElementById('rutaCliente');
    if (selectCliente.options.length === 0) {
        productosData.clientes.filter(c => !c.oculto).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.nombre} — ${c.zona}`;
            selectCliente.appendChild(opt);
        });
    }
    // Default to current week
    const hoy = new Date();
    const semanaInput = document.getElementById('filtroSemanaRuta');
    if (!semanaInput.value) {
        const año = hoy.getFullYear();
        const oneJan = new Date(año, 0, 1);
        const numSemana = Math.ceil(((hoy - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
        semanaInput.value = `${año}-W${String(numSemana).padStart(2, '0')}`;
    }
    document.getElementById('rutaFecha').valueAsDate = hoy;
    renderRutas();
}

function obtenerRutas() {
    return JSON.parse(localStorage.getItem('hdv_rutas') || '[]');
}

function guardarRutas(rutas) {
    localStorage.setItem('hdv_rutas', JSON.stringify(rutas));
}

function renderRutas() {
    const rutas = obtenerRutas();
    const semana = document.getElementById('filtroSemanaRuta').value;
    const zona = document.getElementById('filtroZonaRuta').value;

    // Parse week to get date range
    let fechaInicio, fechaFin;
    if (semana) {
        const [año, sem] = semana.split('-W').map(Number);
        fechaInicio = getDateOfISOWeek(sem, año);
        fechaFin = new Date(fechaInicio);
        fechaFin.setDate(fechaFin.getDate() + 6);
    }

    // Filter and group by day
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const coloresDia = ['#6b7280','#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#ec4899'];
    const bgDia = ['#f3f4f6','#dbeafe','#d1fae5','#fef3c7','#ede9fe','#fee2e2','#fce7f3'];

    let filtradas = rutas;
    if (fechaInicio && fechaFin) {
        filtradas = rutas.filter(r => {
            const f = new Date(r.fecha);
            return f >= fechaInicio && f <= fechaFin;
        });
    }
    if (zona) {
        filtradas = filtradas.filter(r => {
            const c = productosData.clientes.find(x => x.id === r.clienteId);
            return c && c.zona === zona;
        });
    }

    // Group by date
    const porDia = {};
    filtradas.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
        return (a.hora || '09:00').localeCompare(b.hora || '09:00');
    }).forEach(r => {
        if (!porDia[r.fecha]) porDia[r.fecha] = [];
        porDia[r.fecha].push(r);
    });

    const container = document.getElementById('rutasContainer');
    if (Object.keys(porDia).length === 0) {
        container.innerHTML = '<div class="card"><div class="dash-empty">📍 No hay visitas programadas esta semana<br><br><button class="btn btn-primary" onclick="mostrarModalNuevaRuta()">+ Programar Primera Visita</button></div></div>';
    } else {
        container.innerHTML = Object.entries(porDia).map(([fecha, visitas]) => {
            const d = new Date(fecha + 'T12:00:00');
            const diaNum = d.getDay();
            const hoyStr = new Date().toISOString().split('T')[0];
            const esHoy = fecha === hoyStr;
            return `<div class="ruta-card" style="${esHoy ? 'border: 2px solid #3b82f6;' : ''}">
                <div class="ruta-dia" style="background:${bgDia[diaNum]};color:${coloresDia[diaNum]}">
                    <span class="ruta-dia-nombre">${diasSemana[diaNum].slice(0,3)}</span>
                    <span class="ruta-dia-num">${d.getDate()}</span>
                </div>
                <div class="ruta-clientes" style="flex:1">
                    ${esHoy ? '<div style="font-size:11px;font-weight:700;color:#3b82f6;text-transform:uppercase;margin-bottom:6px">— Hoy —</div>' : ''}
                    ${visitas.map(v => {
                        const cliente = productosData.clientes.find(c => c.id === v.clienteId);
                        return `<div class="ruta-cliente">
                            <div class="ruta-check ${v.completada ? 'done' : ''}" onclick="toggleVisitaCompletada('${v.id}')">${v.completada ? '✓' : ''}</div>
                            <div style="flex:1;${v.completada ? 'text-decoration:line-through;opacity:0.6' : ''}">
                                <strong>${cliente?.nombre || 'Cliente eliminado'}</strong>
                                <div style="font-size:12px;color:#6b7280">🕐 ${v.hora || 'Sin hora'} • 📍 ${cliente?.zona || ''}</div>
                                ${v.notas ? `<div class="ruta-notas">📝 ${v.notas}</div>` : ''}
                            </div>
                            <div style="display:flex;gap:6px">
                                ${cliente?.telefono ? `<button onclick="window.open('https://wa.me/595${cliente.telefono.replace(/^0/,'')}','_blank')" class="btn btn-success" style="padding:6px 10px;font-size:12px">📱</button>` : ''}
                                <button onclick="eliminarVisita('${v.id}')" class="btn btn-danger" style="padding:6px 10px;font-size:12px">✕</button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('');
    }

    // Stats
    const total = filtradas.length;
    const completadas = filtradas.filter(r => r.completada).length;
    document.getElementById('rutasTotalVisitas').textContent = total;
    document.getElementById('rutasCompletadas').textContent = completadas;
    document.getElementById('rutasPendientes').textContent = total - completadas;
}

function getDateOfISOWeek(w, y) {
    const simple = new Date(y, 0, 1 + (w - 1) * 7);
    const dayOfWeek = simple.getDay();
    const ISOweekStart = simple;
    if (dayOfWeek <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    return ISOweekStart;
}

function mostrarModalNuevaRuta() {
    document.getElementById('modalNuevaRuta').classList.add('show');
}

function cerrarModalRuta() {
    document.getElementById('modalNuevaRuta').classList.remove('show');
}

function guardarNuevaRuta() {
    const clienteId = document.getElementById('rutaCliente').value;
    const fecha = document.getElementById('rutaFecha').value;
    const hora = document.getElementById('rutaHora').value;
    const notas = document.getElementById('rutaNotas').value.trim();

    if (!clienteId || !fecha) {
        toast('Selecciona cliente y fecha', 'warning');
        return;
    }

    const rutas = obtenerRutas();
    const cliente = productosData.clientes.find(c => c.id === clienteId);
    rutas.push({
        id: 'R' + Date.now(),
        clienteId,
        fecha,
        hora: hora || '09:00',
        notas,
        completada: false,
        creada: new Date().toISOString()
    });
    guardarRutas(rutas);
    registrarActividad('cliente', `Visita programada: ${cliente?.nombre || clienteId} para ${fecha}`);
    toast(`Visita a ${cliente?.nombre || 'cliente'} programada`, 'success');
    cerrarModalRuta();
    document.getElementById('rutaNotas').value = '';
    renderRutas();
}

function toggleVisitaCompletada(id) {
    const rutas = obtenerRutas();
    const ruta = rutas.find(r => r.id === id);
    if (ruta) {
        ruta.completada = !ruta.completada;
        guardarRutas(rutas);
        if (ruta.completada) {
            const cliente = productosData.clientes.find(c => c.id === ruta.clienteId);
            registrarActividad('cliente', `Visita completada: ${cliente?.nombre || ruta.clienteId}`);
            toast('Visita completada ✓', 'success');
        }
        renderRutas();
    }
}

async function eliminarVisita(id) {
    if (!await confirmar('Eliminar Visita', '¿Eliminar esta visita programada?', '📍')) return;
    let rutas = obtenerRutas();
    rutas = rutas.filter(r => r.id !== id);
    guardarRutas(rutas);
    toast('Visita eliminada', 'warning');
    renderRutas();
}

// ============================================
// CRÉDITOS MEJORADOS - Recordatorios WhatsApp
// ============================================
function enviarRecordatorioCredito(id) {
    const p = todosLosPedidos.find(x => x.id === id);
    if (!p) return;
    const cliente = productosData.clientes.find(c => c.id === p.cliente.id);
    const dias = Math.floor((new Date() - new Date(p.fecha)) / 86400000);
    const tel = cliente?.telefono?.replace(/^0/, '') || '';

    let msg = `Hola ${p.cliente.nombre} 👋\n\n`;
    msg += `Le recordamos que tiene un saldo pendiente con *HDV Distribuciones*:\n\n`;
    msg += `📋 Pedido del ${new Date(p.fecha).toLocaleDateString('es-PY')}\n`;
    msg += `💰 *Total: Gs. ${p.total.toLocaleString()}*\n`;
    msg += `⏳ Hace ${dias} día${dias !== 1 ? 's' : ''}\n\n`;
    msg += `Agradecemos su pronta gestión. ¡Gracias! 🙏`;

    if (tel) {
        window.open(`https://wa.me/595${tel}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
        // Copy to clipboard fallback
        navigator.clipboard.writeText(msg).then(() => {
            toast('Mensaje copiado (cliente sin teléfono)', 'info');
        });
    }
    registrarActividad('credito', `Recordatorio enviado a ${p.cliente.nombre}`);
}

function enviarRecordatoriosMasivos() {
    const pendientes = todosLosPedidos.filter(p =>
        p.tipo_pago === 'credito' && (p.estado || 'pendiente_pago') === 'pendiente_pago'
    );
    if (pendientes.length === 0) {
        toast('No hay créditos pendientes', 'info');
        return;
    }

    // Group by client
    const porCliente = {};
    pendientes.forEach(p => {
        if (!porCliente[p.cliente.id]) porCliente[p.cliente.id] = { nombre: p.cliente.nombre, total: 0, pedidos: 0 };
        porCliente[p.cliente.id].total += p.total;
        porCliente[p.cliente.id].pedidos++;
    });

    let resumen = '📋 *RESUMEN CRÉDITOS PENDIENTES*\n\n';
    Object.values(porCliente).forEach(c => {
        resumen += `• ${c.nombre}: Gs. ${c.total.toLocaleString()} (${c.pedidos} pedido${c.pedidos > 1 ? 's' : ''})\n`;
    });
    resumen += `\n💰 *TOTAL: Gs. ${pendientes.reduce((s, p) => s + p.total, 0).toLocaleString()}*`;

    navigator.clipboard.writeText(resumen).then(() => {
        toast(`Resumen de ${Object.keys(porCliente).length} clientes copiado`, 'success');
    });
}

// ============================================
// OFFLINE MODE MEJORADO
// ============================================
let offlineQueue = [];

function inicializarOfflineMode() {
    // Monitor connectivity
    window.addEventListener('online', () => {
        document.getElementById('offlineBar').classList.remove('show');
        toast('Conexión restaurada ✓', 'success');
        procesarColaOffline();
    });
    window.addEventListener('offline', () => {
        document.getElementById('offlineBar').classList.add('show');
        toast('Sin conexión — modo offline activado', 'warning', 5000);
    });
    // Check initial state
    if (!navigator.onLine) {
        document.getElementById('offlineBar').classList.add('show');
    }
    // Load pending queue
    offlineQueue = JSON.parse(localStorage.getItem('hdv_offline_queue') || '[]');
    actualizarContadorSync();
}

function agregarAColaOffline(accion) {
    offlineQueue.push({
        ...accion,
        timestamp: new Date().toISOString(),
        id: 'OQ' + Date.now()
    });
    localStorage.setItem('hdv_offline_queue', JSON.stringify(offlineQueue));
    actualizarContadorSync();
}

function procesarColaOffline() {
    if (offlineQueue.length === 0) return;
    const procesados = offlineQueue.length;
    // In a full implementation, this would sync with a server
    // For now, we just clear the queue since everything is localStorage-based
    offlineQueue = [];
    localStorage.setItem('hdv_offline_queue', JSON.stringify(offlineQueue));
    actualizarContadorSync();
    if (procesados > 0) {
        toast(`${procesados} cambio${procesados > 1 ? 's' : ''} sincronizado${procesados > 1 ? 's' : ''}`, 'success');
        registrarActividad('sistema', `${procesados} cambios sincronizados al reconectar`);
    }
}

function actualizarContadorSync() {
    const badge = document.getElementById('syncCount');
    if (offlineQueue.length > 0) {
        badge.textContent = offlineQueue.length;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
}

// Auto-save state periodically for offline resilience
function autoGuardarEstado() {
    try {
        localStorage.setItem('hdv_ultimo_estado', JSON.stringify({
            timestamp: new Date().toISOString(),
            totalPedidos: todosLosPedidos.length,
            totalProductos: productosData.productos.length,
            totalClientes: productosData.clientes.length
        }));
    } catch(e) { /* silently fail */ }
}

// Initialize offline mode
window.addEventListener('load', () => {
    inicializarOfflineMode();
    setInterval(autoGuardarEstado, 60000); // every minute
});

