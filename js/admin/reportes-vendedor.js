// ============================================
// REPORTES POR VENDEDOR
// ============================================

let _reporteVendedorPerfiles = null;
let _reporteVendedorDatos = null;

async function _obtenerPerfilesReporte() {
    if (_reporteVendedorPerfiles) return _reporteVendedorPerfiles;
    try {
        const { data } = await supabaseClient.from('perfiles').select('id, nombre_completo, rol, activo');
        _reporteVendedorPerfiles = (data || []).filter(p => p.rol === 'vendedor');
    } catch (e) { _reporteVendedorPerfiles = []; }
    return _reporteVendedorPerfiles;
}

async function generarReporteVendedor(pedidosFiltrados, desde, hasta) {
    const container = document.getElementById('contenidoReporte');
    const detallePanel = document.getElementById('reporteVendedorDetalle');
    if (!container || !detallePanel) return;

    const perfiles = await _obtenerPerfilesReporte();
    const perfilesMap = {};
    perfiles.forEach(p => { perfilesMap[p.id] = p.nombre_completo || 'Sin nombre'; });

    const pagosCredito = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
    const metas = (await HDVStorage.getItem('hdv_metas', { clone: false })) || [];
    const mesActual = new Date().toISOString().slice(0, 7);

    const ranking = {};
    pedidosFiltrados.forEach(p => {
        const vid = p.vendedor_id || 'sin_vendedor';
        if (!ranking[vid]) ranking[vid] = {
            nombre: perfilesMap[vid] || 'Desconocido',
            ventas: 0, contado: 0, credito: 0, pedidos: 0,
            clientes: new Set(), items: 0
        };
        const r = ranking[vid];
        r.ventas += p.total || 0;
        r.pedidos++;
        if (p.tipoPago === 'contado') r.contado += p.total || 0;
        if (p.tipoPago === 'credito') r.credito += p.total || 0;
        if (p.cliente?.id) r.clientes.add(p.cliente.id);
        (p.items || []).forEach(i => { r.items += i.cantidad || 0; });
    });

    Object.keys(ranking).forEach(vid => {
        const r = ranking[vid];
        r.ticketPromedio = r.pedidos > 0 ? Math.round(r.ventas / r.pedidos) : 0;
        r.clientesCount = r.clientes.size;

        const creditosPedidos = pedidosFiltrados.filter(p => p.vendedor_id === vid && p.tipoPago === 'credito');
        const totalCreditoOtorgado = creditosPedidos.reduce((s, p) => s + (p.total || 0), 0);
        const cobrado = pagosCredito
            .filter(pg => creditosPedidos.some(cp => cp.id === pg.pedidoId))
            .reduce((s, pg) => s + (pg.monto || 0), 0);
        r.creditoOtorgado = totalCreditoOtorgado;
        r.creditoCobrado = cobrado;
        r.tasaCobranza = totalCreditoOtorgado > 0 ? Math.round((cobrado / totalCreditoOtorgado) * 100) : 0;

        const meta = metas.find(m => (m.vendedor_id === vid || m.vendedor === r.nombre) && m.mes === mesActual && m.activa);
        r.meta = meta ? meta.monto : 0;
        r.metaPct = meta && meta.monto > 0 ? Math.round((r.ventas / meta.monto) * 100) : 0;
    });

    _reporteVendedorDatos = { ranking, desde, hasta, perfilesMap };

    const sorted = Object.entries(ranking).sort((a, b) => b[1].ventas - a[1].ventas);

    let html = `<h4 class="font-bold text-gray-700 mb-3">Ranking de Vendedores (${desde} al ${hasta})</h4>`;
    html += '<table class="w-full text-sm"><thead class="bg-gray-50"><tr>';
    html += '<th class="px-3 py-2 text-left">#</th>';
    html += '<th class="px-3 py-2 text-left">Vendedor</th>';
    html += '<th class="px-3 py-2 text-right">Ventas</th>';
    html += '<th class="px-3 py-2 text-right">Pedidos</th>';
    html += '<th class="px-3 py-2 text-right">Ticket Prom.</th>';
    html += '<th class="px-3 py-2 text-right">Clientes</th>';
    html += '<th class="px-3 py-2 text-right">Cobranza %</th>';
    html += '<th class="px-3 py-2 text-right">Meta %</th>';
    html += '</tr></thead><tbody>';

    sorted.forEach(([vid, r], idx) => {
        const metaColor = r.metaPct >= 100 ? 'text-green-600' : r.metaPct >= 50 ? 'text-yellow-600' : 'text-red-600';
        const cobranzaColor = r.tasaCobranza >= 80 ? 'text-green-600' : r.tasaCobranza >= 50 ? 'text-yellow-600' : 'text-red-600';
        html += `<tr class="border-b hover:bg-gray-50 cursor-pointer" onclick="verDetalleVendedorReporte('${vid}')">`;
        html += `<td class="px-3 py-3 font-bold">${idx + 1}</td>`;
        html += `<td class="px-3 py-3 font-medium">${escapeHTML(r.nombre)}</td>`;
        html += `<td class="px-3 py-3 text-right font-bold">${formatearGuaranies(r.ventas)}</td>`;
        html += `<td class="px-3 py-3 text-right">${r.pedidos}</td>`;
        html += `<td class="px-3 py-3 text-right">${formatearGuaranies(r.ticketPromedio)}</td>`;
        html += `<td class="px-3 py-3 text-right">${r.clientesCount}</td>`;
        html += `<td class="px-3 py-3 text-right ${cobranzaColor} font-bold">${r.tasaCobranza}%</td>`;
        html += `<td class="px-3 py-3 text-right ${metaColor} font-bold">${r.meta > 0 ? r.metaPct + '%' : '-'}</td>`;
        html += '</tr>';
    });
    html += '</tbody></table>';

    if (sorted.length === 0) {
        html = '<p class="text-center text-gray-500 py-8 font-medium">No hay datos de vendedores para el rango seleccionado</p>';
    }

    container.innerHTML = html;

    detallePanel.style.display = 'block';
    poblarSelectReporteVendedor(perfiles);
}

function poblarSelectReporteVendedor(perfiles) {
    const select = document.getElementById('reporteVendedorSelect');
    if (!select) return;
    const existentes = select.querySelectorAll('sl-option[data-rv]');
    existentes.forEach(el => el.remove());
    perfiles.forEach(p => {
        const opt = document.createElement('sl-option');
        opt.value = p.id;
        opt.textContent = p.nombre_completo || 'Sin nombre';
        opt.setAttribute('data-rv', '');
        select.appendChild(opt);
    });
}

async function verDetalleVendedorReporte(vendedorId) {
    if (!_reporteVendedorDatos) return;
    const { ranking, desde, hasta, perfilesMap } = _reporteVendedorDatos;
    const r = ranking[vendedorId];
    if (!r) return;

    const select = document.getElementById('reporteVendedorSelect');
    if (select) select.value = vendedorId;

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedidosVend = pedidos.filter(p => {
        const fecha = new Date(p.fecha).toISOString().split('T')[0];
        return p.vendedor_id === vendedorId && fecha >= desde && fecha <= hasta;
    });

    const clientesVisitados = {};
    pedidosVend.forEach(p => {
        const cid = p.cliente?.id;
        if (!cid) return;
        if (!clientesVisitados[cid]) clientesVisitados[cid] = { nombre: p.cliente.nombre || 'Sin nombre', pedidos: 0, total: 0, ultimo: p.fecha };
        clientesVisitados[cid].pedidos++;
        clientesVisitados[cid].total += p.total || 0;
        if (p.fecha > clientesVisitados[cid].ultimo) clientesVisitados[cid].ultimo = p.fecha;
    });

    const todosClientes = productosData?.clientes || [];
    const clientesSinPedido = todosClientes.filter(c => !clientesVisitados[c.id] && !c.oculto);

    const container = document.getElementById('reporteVendedorContenido');
    if (!container) return;

    let html = `<h4 class="font-bold text-gray-800 mb-4">${escapeHTML(r.nombre)} — ${desde} al ${hasta}</h4>`;

    html += '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">';
    html += `<div class="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
        <p class="text-xs font-bold text-green-600">VENTAS</p>
        <p class="text-xl font-bold text-green-800">${formatearGuaranies(r.ventas)}</p>
    </div>`;
    html += `<div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
        <p class="text-xs font-bold text-blue-600">PEDIDOS</p>
        <p class="text-xl font-bold text-blue-800">${r.pedidos}</p>
    </div>`;
    html += `<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
        <p class="text-xs font-bold text-yellow-600">COBRANZA</p>
        <p class="text-xl font-bold text-yellow-800">${r.tasaCobranza}%</p>
        <p class="text-[10px] text-gray-500">Cobrado: ${formatearGuaranies(r.creditoCobrado)} / ${formatearGuaranies(r.creditoOtorgado)}</p>
    </div>`;
    html += `<div class="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
        <p class="text-xs font-bold text-purple-600">META</p>
        <p class="text-xl font-bold text-purple-800">${r.meta > 0 ? r.metaPct + '%' : 'Sin meta'}</p>
        ${r.meta > 0 ? `<div class="w-full bg-gray-200 rounded-full h-2 mt-1"><div class="h-2 rounded-full ${r.metaPct >= 100 ? 'bg-green-500' : r.metaPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}" style="width:${Math.min(r.metaPct, 100)}%"></div></div>` : ''}
    </div>`;
    html += '</div>';

    html += '<h5 class="font-bold text-gray-700 text-sm mb-2">Clientes visitados (' + r.clientesCount + ')</h5>';
    if (Object.keys(clientesVisitados).length > 0) {
        html += '<table class="w-full text-sm mb-4"><thead class="bg-gray-50"><tr><th class="px-3 py-2 text-left">Cliente</th><th class="px-3 py-2 text-right">Pedidos</th><th class="px-3 py-2 text-right">Total</th><th class="px-3 py-2 text-right">Ultimo</th></tr></thead><tbody>';
        Object.entries(clientesVisitados).sort((a, b) => b[1].total - a[1].total).forEach(([_, c]) => {
            html += `<tr class="border-b"><td class="px-3 py-2">${escapeHTML(c.nombre)}</td><td class="px-3 py-2 text-right">${c.pedidos}</td><td class="px-3 py-2 text-right font-bold">${formatearGuaranies(c.total)}</td><td class="px-3 py-2 text-right text-gray-500">${new Date(c.ultimo).toLocaleDateString('es-PY')}</td></tr>`;
        });
        html += '</tbody></table>';
    }

    if (clientesSinPedido.length > 0) {
        html += `<h5 class="font-bold text-gray-700 text-sm mb-2">Clientes sin pedido en el periodo (${clientesSinPedido.length})</h5>`;
        html += '<div class="flex flex-wrap gap-2 mb-4">';
        clientesSinPedido.slice(0, 20).forEach(c => {
            html += `<span class="text-xs px-2 py-1 bg-red-50 text-red-700 rounded-full">${escapeHTML(c.nombre)}</span>`;
        });
        if (clientesSinPedido.length > 20) html += `<span class="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">+${clientesSinPedido.length - 20} mas</span>`;
        html += '</div>';
    }

    container.innerHTML = html;
}

function exportarReporteVendedorCSV() {
    if (!_reporteVendedorDatos) { mostrarToast('Genera un reporte primero', 'warning'); return; }
    const { ranking, desde, hasta } = _reporteVendedorDatos;
    const sorted = Object.entries(ranking).sort((a, b) => b[1].ventas - a[1].ventas);

    let csv = '﻿';
    csv += 'Vendedor,Ventas,Pedidos,Ticket Promedio,Clientes,Contado,Credito,Cobrado,Tasa Cobranza %,Meta %\n';
    sorted.forEach(([_, r]) => {
        csv += `"${r.nombre}",${r.ventas},${r.pedidos},${r.ticketPromedio},${r.clientesCount},${r.contado},${r.credito},${r.creditoCobrado},${r.tasaCobranza},${r.metaPct}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Vendedores_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarExito('CSV descargado');
}

(function _initReporteVendedorListeners() {
    document.getElementById('reporteVendedorSelect')?.addEventListener('sl-change', (e) => {
        const val = e.target.value;
        if (val === 'todos') {
            if (_reporteVendedorDatos) {
                const container = document.getElementById('reporteVendedorContenido');
                if (container) container.innerHTML = '<p class="text-center text-gray-400 italic">Selecciona un vendedor o ve el ranking arriba</p>';
            }
        } else {
            verDetalleVendedorReporte(val);
        }
    });
})();
