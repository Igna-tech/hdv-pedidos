// ============================================
// HDV Admin - Modulo de Pedidos
// Carga, filtros, edicion, reportes, PDF/ticket
// Depende de globals: todosLosPedidos, productosData, unsubscribePedidos
// ============================================

let pedidoEditandoId = null;

// Cache de perfiles para mostrar nombres de vendedores en tarjetas
let _pedidosPerfilesCache = null;
async function obtenerPerfilesPedidosMap() {
    if (_pedidosPerfilesCache) return _pedidosPerfilesCache;
    try {
        const { data } = await supabaseClient.from('perfiles').select('id, nombre_completo');
        _pedidosPerfilesCache = {};
        (data || []).forEach(p => { _pedidosPerfilesCache[p.id] = p.nombre_completo || 'Sin nombre'; });
    } catch (e) { _pedidosPerfilesCache = {}; }
    return _pedidosPerfilesCache;
}

// Poblar el select de vendedores con los perfiles
async function poblarFiltroVendedor() {
    const select = document.getElementById('filtroVendedor');
    if (!select) return;
    const perfiles = await obtenerPerfilesPedidosMap();
    Object.entries(perfiles).forEach(([id, nombre]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = nombre;
        select.appendChild(opt);
    });
}

// Preservar referencia a eliminarPedido de supabase-config.js antes de que sea sobreescrita
const _eliminarPedidoSupabase = typeof eliminarPedido === 'function' ? eliminarPedido : null;

// ============================================
// CARGA Y FILTROS
// ============================================
async function cargarPedidos() {
    todosLosPedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    await poblarFiltroVendedor();
    aplicarFiltrosPedidos();
}

function filtrarPedidos() { aplicarFiltrosPedidos(); }

function aplicarFiltrosPedidos() {
    const fecha = document.getElementById('filtroFecha')?.value;
    const cliente = document.getElementById('filtroCliente')?.value;
    const vendedor = document.getElementById('filtroVendedor')?.value;
    const estado = document.getElementById('filtroEstado')?.value;

    let filtrados = todosLosPedidos;
    // Filtrar por estado (default: pedido_pendiente via select)
    if (estado) {
        filtrados = filtrados.filter(p => p.estado === estado || (estado === 'pedido_pendiente' && p.estado === 'pendiente'));
    }
    if (fecha) filtrados = filtrados.filter(p => new Date(p.fecha).toISOString().split('T')[0] === fecha);
    if (cliente) filtrados = filtrados.filter(p => p.cliente?.id === cliente);
    if (vendedor) filtrados = filtrados.filter(p => p.vendedor_id === vendedor);
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
        const div = crearTarjetaPedidoAdmin(p);
        container.appendChild(div);
    });
    lucide.createIcons();
}

// ============================================
// TARJETA DE PEDIDO — ESTADO COLORS & REACTIVE DOM
// ============================================
function obtenerColorEstadoAdmin(estado) {
    const colores = {
        'pedido_pendiente': 'bg-yellow-100 text-yellow-800',
        'pendiente': 'bg-yellow-100 text-yellow-800',
        'entregado': 'bg-green-100 text-green-800',
        'cobrado_sin_factura': 'bg-blue-100 text-blue-800',
        'facturado_mock': 'bg-indigo-100 text-indigo-800',
        'nota_credito_mock': 'bg-orange-100 text-orange-800',
        'anulado': 'bg-red-100 text-red-800'
    };
    return colores[estado] || 'bg-gray-100 text-gray-800';
}

function obtenerLabelEstadoAdmin(estado) {
    const labels = {
        'pedido_pendiente': 'PENDIENTE',
        'pendiente': 'PENDIENTE',
        'entregado': 'ENTREGADO',
        'cobrado_sin_factura': 'COBRADO',
        'facturado_mock': 'FACTURADO',
        'nota_credito_mock': 'NOTA CREDITO',
        'anulado': 'ANULADO'
    };
    return labels[estado] || estado.toUpperCase();
}

function crearTarjetaPedidoAdmin(p) {
    const estado = p.estado || 'pendiente';
    const colorEstado = obtenerColorEstadoAdmin(estado);
    const labelEstado = obtenerLabelEstadoAdmin(estado);
    const clienteInfo = productosData.clientes.find(c => c.id === p.cliente?.id);
    const zona = clienteInfo?.zona || clienteInfo?.direccion || '';

    // Nombre del vendedor desde cache de perfiles
    const vendedorNombre = p.vendedor_id && _pedidosPerfilesCache ? (_pedidosPerfilesCache[p.vendedor_id] || 'Vendedor desconocido') : '';

    // Tipo de comprobante
    const tipoComprobante = p.tipo_comprobante === 'recibo' ? 'REC' : p.tipo_comprobante === 'factura' ? 'FAC' : 'PED';
    const colorComprobante = tipoComprobante === 'FAC' ? 'bg-indigo-100 text-indigo-700' : tipoComprobante === 'REC' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600';

    // Indicadores de alerta y sync
    const alertaFraude = p.alerta_fraude ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700" title="${escapeHTML(p.fraude_detalle || 'Alerta de fraude detectada')}"><i data-lucide="alert-triangle" class="w-3 h-3"></i> FRAUDE</span>` : '';
    const editadoBadge = p.editado ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700" title="Editado: ${escapeHTML(p.fechaEdicion || '')}"><i data-lucide="pencil" class="w-3 h-3"></i></span>` : '';

    const div = document.createElement('div');
    div.className = 'p-6 hover:bg-gray-50 transition-all duration-300';
    div.setAttribute('data-pedido-id', p.id);
    div.innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <div>
                <h3 class="text-lg font-bold text-gray-800">${escapeHTML(p.cliente?.nombre || 'Sin cliente')}</h3>
                <div class="text-sm text-gray-500 mt-1 flex items-center gap-1 flex-wrap">
                    <i data-lucide="map-pin" class="w-3 h-3"></i> ${escapeHTML(zona)}
                    <span class="mx-1">·</span> <i data-lucide="clock" class="w-3 h-3"></i> ${new Date(p.fecha).toLocaleString('es-PY')}
                    ${vendedorNombre ? `<span class="mx-1">·</span> <i data-lucide="user" class="w-3 h-3"></i> ${escapeHTML(vendedorNombre)}` : ''}
                </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                ${alertaFraude}
                ${editadoBadge}
                <span class="px-2 py-0.5 rounded text-xs font-bold ${colorComprobante}">${tipoComprobante}</span>
                <span class="pedido-estado-badge px-3 py-1 rounded-full text-xs font-bold ${colorEstado}">${labelEstado}</span>
            </div>
        </div>
        <div class="mb-3 space-y-1">
            ${(p.items || []).map(i => `
            <div class="flex justify-between text-sm py-1">
                <span>${escapeHTML(i.nombre)} <span class="text-gray-400">(${escapeHTML(i.presentacion)} × ${i.cantidad})</span></span>
                <strong>${formatearGuaranies(i.subtotal)}</strong>
            </div>`).join('')}
        </div>
        ${p.notas ? `<div class="text-sm text-gray-500 italic mb-3 flex items-start gap-1.5"><i data-lucide="message-square" class="w-3.5 h-3.5 mt-0.5 shrink-0"></i> ${escapeHTML(p.notas)}</div>` : ''}
        <div class="flex justify-between items-center pt-3 border-t border-gray-100">
            <span class="text-sm text-gray-500">${p.tipoPago || 'contado'}${p.descuento > 0 ? ` | ${p.descuento}% desc.` : ''}${p.desgloseIVA ? ` | IVA 10%: ${formatearGuaranies(p.desgloseIVA.iva10)} · 5%: ${formatearGuaranies(p.desgloseIVA.iva5)} · Ex: ${formatearGuaranies(p.desgloseIVA.exenta)}` : ''}</span>
            <span class="text-xl font-bold text-gray-900">${formatearGuaranies(p.total)}</span>
        </div>
        <div class="pedido-acciones flex gap-2 mt-4 flex-wrap">
            <button class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 inline-flex items-center gap-1.5" id="btnFacturar-${p.id}" onclick="facturarPedidoAdmin('${p.id}')"><i data-lucide="file-check" class="w-3.5 h-3.5"></i> Facturar (SIFEN)</button>
            ${estado === 'pendiente' || estado === 'pedido_pendiente' ?
                `<button class="btn-estado bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 inline-flex items-center gap-1.5" onclick="marcarEntregado('${p.id}')"><i data-lucide="check" class="w-3.5 h-3.5"></i> Entregado</button>` :
                `<button class="btn-estado bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-300 inline-flex items-center gap-1.5" onclick="marcarPendiente('${p.id}')"><i data-lucide="undo-2" class="w-3.5 h-3.5"></i> Pendiente</button>`}
            <button class="bg-blue-50 text-blue-600 px-3 py-2 rounded-lg text-sm font-bold hover:bg-blue-100 inline-flex items-center gap-1" onclick="abrirModalEditarPedido('${p.id}')"><i data-lucide="pencil" class="w-3.5 h-3.5"></i> Editar</button>
            <button class="bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-100 inline-flex items-center gap-1" onclick="generarPDFRemision('${p.id}')"><i data-lucide="file-text" class="w-3.5 h-3.5"></i> PDF</button>
            <button class="bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-gray-100 inline-flex items-center gap-1" onclick="generarTicketTermico('${p.id}')"><i data-lucide="printer" class="w-3.5 h-3.5"></i> Ticket</button>
            <button class="bg-red-50 text-red-500 px-3 py-2 rounded-lg text-sm font-bold hover:bg-red-100 inline-flex items-center gap-1" onclick="eliminarPedido('${p.id}')"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>`;
    return div;
}

function actualizarTarjetaPedidoAdminDOM(pedidoId, nuevoEstado) {
    const card = document.querySelector(`[data-pedido-id="${pedidoId}"]`);
    if (!card) return false;

    // Actualizar badge de estado
    const badge = card.querySelector('.pedido-estado-badge');
    if (badge) {
        badge.className = 'pedido-estado-badge px-3 py-1 rounded-full text-xs font-bold ' + obtenerColorEstadoAdmin(nuevoEstado);
        badge.textContent = obtenerLabelEstadoAdmin(nuevoEstado);
    }

    // Actualizar boton de estado (Entregado ↔ Pendiente)
    const btnEstado = card.querySelector('.btn-estado');
    if (btnEstado) {
        if (nuevoEstado === 'entregado') {
            btnEstado.className = 'btn-estado bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-300 inline-flex items-center gap-1.5';
            btnEstado.innerHTML = `<i data-lucide="undo-2" class="w-3.5 h-3.5"></i> Pendiente`;
            btnEstado.setAttribute('onclick', `marcarPendiente('${pedidoId}')`);
        } else {
            btnEstado.className = 'btn-estado bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 inline-flex items-center gap-1.5';
            btnEstado.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i> Entregado`;
            btnEstado.setAttribute('onclick', `marcarEntregado('${pedidoId}')`);
        }
        lucide.createIcons({ nodes: [btnEstado] });
    }

    // Flash visual para destacar el cambio
    card.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50');
    setTimeout(() => card.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50'), 2000);

    return true;
}

function eliminarTarjetaPedidoAdminDOM(pedidoId) {
    const card = document.querySelector(`[data-pedido-id="${pedidoId}"]`);
    if (!card) return;
    card.style.opacity = '0';
    card.style.transform = 'translateX(-100%)';
    setTimeout(() => card.remove(), 300);
}

function actualizarEstadisticasPedidos(pedidos) {
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('statTotalPedidos', pedidos.length);
    el('statPendientes', pedidos.filter(p => (p.estado || 'pendiente') === 'pendiente').length);
    el('statEntregados', pedidos.filter(p => p.estado === 'entregado').length);
    el('statRecaudacion', formatearGuaranies(pedidos.reduce((s, p) => s + (p.total || 0), 0)));
}

async function marcarEntregado(id) {
    // RPC primero: si falla, no mutar estado local
    if (typeof actualizarEstadoPedido === 'function') {
        try {
            await actualizarEstadoPedido(id, 'entregado');
        } catch(e) {
            console.error('[Pedidos] Error actualizando estado en Supabase:', e);
            mostrarToast('Error al actualizar estado en servidor', 'error');
            return;
        }
    }
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const p = pedidos.find(x => x.id === id);
    if (p) {
        p.estado = 'entregado';
        await HDVStorage.setItem('hdv_pedidos', pedidos);
    }
    // Actualizar DOM inmediatamente sin re-renderizar toda la lista
    if (!actualizarTarjetaPedidoAdminDOM(id, 'entregado')) {
        // Fallback: si la tarjeta no existe en DOM, re-renderizar
        cargarPedidos();
    }
    mostrarToast('Pedido marcado como entregado', 'success');
}

async function marcarPendiente(id) {
    // RPC primero: si falla, no mutar estado local
    if (typeof actualizarEstadoPedido === 'function') {
        try {
            await actualizarEstadoPedido(id, 'pedido_pendiente');
        } catch(e) {
            console.error('[Pedidos] Error actualizando estado en Supabase:', e);
            mostrarToast('Error al actualizar estado en servidor', 'error');
            return;
        }
    }
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const p = pedidos.find(x => x.id === id);
    if (p) {
        p.estado = 'pedido_pendiente';
        await HDVStorage.setItem('hdv_pedidos', pedidos);
    }
    // Actualizar DOM inmediatamente sin re-renderizar toda la lista
    if (!actualizarTarjetaPedidoAdminDOM(id, 'pedido_pendiente')) {
        cargarPedidos();
    }
    mostrarToast('Pedido marcado como pendiente', 'success');
}

async function eliminarPedidoAdmin(id) {
    if (!await mostrarConfirmModal('¿Eliminar este pedido?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    // Supabase primero: si falla, no borrar local
    if (_eliminarPedidoSupabase) {
        try {
            const ok = await _eliminarPedidoSupabase(id);
            if (!ok) {
                mostrarToast('Error al eliminar pedido en servidor', 'error');
                return;
            }
        } catch(e) {
            console.error('[Pedidos] Error eliminando pedido en Supabase:', e);
            mostrarToast('Error al eliminar pedido en servidor', 'error');
            return;
        }
    }
    let pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    pedidos = pedidos.filter(p => p.id !== id);
    await HDVStorage.setItem('hdv_pedidos', pedidos);
    // Animacion de eliminacion en DOM
    eliminarTarjetaPedidoAdminDOM(id);
    mostrarToast('Pedido eliminado', 'success');
}
// Mantener nombre original para onclick handlers
var eliminarPedido = eliminarPedidoAdmin;

function exportarExcelPedidos() {
    const pedidos = todosLosPedidos;
    if (pedidos.length === 0) { mostrarToast('No hay pedidos para exportar', 'error'); return; }
    let csv = 'Fecha,Cliente,Vendedor,Producto,Presentacion,Cantidad,Precio,Subtotal,Total Pedido,Estado,Pago,Tipo,Notas,Alerta Fraude\n';
    pedidos.forEach(p => {
        const vendedor = p.vendedor_id && _pedidosPerfilesCache ? (_pedidosPerfilesCache[p.vendedor_id] || '') : '';
        const tipo = p.tipo_comprobante || 'pedido';
        const notas = p.notas || '';
        const alerta = p.alerta_fraude ? 'SI' : '';
        (p.items || []).forEach(i => {
            csv += [
                escaparCSV(new Date(p.fecha).toLocaleDateString('es-PY')),
                escaparCSV(p.cliente?.nombre),
                escaparCSV(vendedor),
                escaparCSV(i.nombre),
                escaparCSV(i.presentacion),
                i.cantidad, i.precio, i.subtotal, p.total,
                escaparCSV(p.estado || 'pendiente'),
                escaparCSV(p.tipoPago || 'contado'),
                escaparCSV(tipo),
                escaparCSV(notas),
                escaparCSV(alerta)
            ].join(',') + '\n';
        });
    });
    descargarCSV(csv, 'pedidos_hdv.csv');
}

// ============================================
// REPORTES
// ============================================
async function generarReporte(tipo) {
    const desde = document.getElementById('reporteFechaDesde')?.value;
    const hasta = document.getElementById('reporteFechaHasta')?.value;
    if (!desde || !hasta) { mostrarToast('Selecciona rango de fechas', 'error'); return; }

    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
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
            html += `<tr class="border-b"><td class="px-4 py-3 font-medium">${escapeHTML(nombre)}</td><td class="px-4 py-3 text-right">${data.pedidos}</td><td class="px-4 py-3 text-right font-bold">${formatearGuaranies(data.total)}</td></tr>`;
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
            html += `<tr class="border-b"><td class="px-4 py-3 font-medium">${escapeHTML(nombre)}</td><td class="px-4 py-3 text-right">${data.cantidad}</td><td class="px-4 py-3 text-right font-bold">${formatearGuaranies(data.total)}</td></tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }
}

// ============================================
// EDICION DE PEDIDOS
// ============================================
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
                        `<option value="${escapeHTML(p.id)}|${escapeHTML(pres.tamano)}|${pres.precio_base}" ${p.nombre === item.nombre && pres.tamano === item.presentacion ? 'selected' : ''}>${escapeHTML(p.nombre)} - ${escapeHTML(pres.tamano)} (${formatearGuaranies(pres.precio_base)})</option>`
                    ).join('')
                ).join('')}
            </select>
            <input type="number" value="${item.cantidad}" min="1" onchange="actualizarItemEdicion(${idx},'cantidad',this.value);recalcularTotalEdicion()" class="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center font-bold edit-item-cantidad">
            <span class="text-sm font-bold text-gray-700 w-32 text-right edit-item-subtotal">${formatearGuaranies(item.subtotal)}</span>
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
                    `<option value="${escapeHTML(p.id)}|${escapeHTML(pres.tamano)}|${pres.precio_base}">${escapeHTML(p.nombre)} - ${escapeHTML(pres.tamano)} (${formatearGuaranies(pres.precio_base)})</option>`
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
            if (subtotalSpan) subtotalSpan.textContent = formatearGuaranies(sub);
        }
    });
    const desc = parseFloat(document.getElementById('editPedidoDescuento')?.value) || 0;
    const total = Math.round(subtotal * (1 - desc / 100));
    document.getElementById('editPedidoTotal').textContent = formatearGuaranies(total);
}

async function guardarEdicionPedido() {
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

    await withButtonLock('btnGuardarEdicionPedido', async () => {
        const descuento = parseFloat(document.getElementById('editPedidoDescuento')?.value) || 0;
        const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
        const total = Math.round(subtotal * (1 - descuento / 100));

        // Update in HDVStorage
        const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
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
            await HDVStorage.setItem('hdv_pedidos', pedidos);

            // Sync con Supabase
            if (typeof guardarPedido === 'function') {
                guardarPedido(pedidos[idx]);
            }
        }

        cerrarModalEditarPedido();
        if (typeof cargarPedidos === 'function' && !unsubscribePedidos) cargarPedidos();
        else aplicarFiltrosPedidos();
    }, 'Guardando...')();
}

// ============================================
// PDF Y TICKET
// ============================================
function generarPDFRemision(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === (pedidoId || pedidoEditandoId));
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }
    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    generarPDFRemisionDoc(pedido, clienteInfo);
}

function generarTicketTermico(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === (pedidoId || pedidoEditandoId));
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }
    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    const ticketHTML = generarTicketHTML(pedido, {
        titulo: 'EAS - Nota de Remision',
        clienteInfo: clienteInfo || {},
        mostrarEstado: true
    });
    imprimirViaIframe('printFrame', ticketHTML);
}

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
