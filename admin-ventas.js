// ============================================
// HDV Admin - Ventas: Controlador (rediseño tabla + drawer)
// Requiere: ventas-data.js, ventas-templates.js, admin.js, kude-generator.js
// ============================================

const ventasCtrl = {};

let paginaVentas = 1;
const VENTAS_POR_PAGINA = 50;
let _ventasFiltradas = [];

// ---- Helpers de badge ----

function _tipoBadge(pedido) {
    const id = pedido.id || '';
    const tc = pedido.tipo_comprobante || '';
    const est = pedido.estado || '';
    if (id.startsWith('FAC-') || tc === 'factura_electronica' || est === 'facturado_mock')
        return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">FAC</span>';
    if (id.startsWith('NC-') || tc === 'nota_credito_electronica' || est === 'nota_credito_mock')
        return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700">NC</span>';
    if (id.startsWith('NRE-') || tc === 'nota_remision_electronica' || est === 'nota_remision')
        return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-700">NRE</span>';
    if (id.startsWith('REC-') || tc === 'recibo_interno' || est === 'cobrado_sin_factura')
        return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">REC</span>';
    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">PED</span>';
}

const ESTADO_BADGE_VENTAS = {
    'pedido_pendiente':   'bg-yellow-100 text-yellow-700',
    'entregado':          'bg-blue-100 text-blue-700',
    'cobrado_sin_factura':'bg-amber-100 text-amber-700',
    'facturado_mock':     'bg-emerald-100 text-emerald-700',
    'nota_credito_mock':  'bg-orange-100 text-orange-700',
    'nota_remision':      'bg-teal-100 text-teal-700',
    'anulado':            'bg-gray-100 text-gray-500',
};

const ESTADO_LABEL_VENTAS = {
    'pedido_pendiente':   'Pendiente',
    'entregado':          'Entregado',
    'cobrado_sin_factura':'Cobrado',
    'facturado_mock':     'Facturado',
    'nota_credito_mock':  'NC',
    'nota_remision':      'Remisión',
    'anulado':            'Anulado',
};

function _estadoBadge(estado) {
    const cls = ESTADO_BADGE_VENTAS[estado] || 'bg-gray-100 text-gray-500';
    const label = ESTADO_LABEL_VENTAS[estado] || estado;
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}">${escapeHTML(label)}</span>`;
}

// Cache de vendedores id→nombre
let _vendedoresMap = {};

// ============================================
// CARGAR VENTAS
// ============================================

async function cargarVentas() {
    todosLosPedidos = await ventasDataObtenerPedidos();

    // Cargar lista de vendedores para el filtro
    const sel = document.getElementById('filtroVendedorVentas');
    if (sel && sel.querySelectorAll('sl-option').length <= 1) {
        try {
            const { data: perfiles } = await supabaseClient.from('perfiles').select('id, nombre_completo').eq('rol', 'vendedor');
            if (perfiles && perfiles.length) {
                _vendedoresMap = {};
                perfiles.forEach(p => { _vendedoresMap[p.id] = p.nombre_completo; });
                const existingOptions = sel.querySelectorAll('sl-option[data-vendedor]');
                existingOptions.forEach(o => o.remove());
                perfiles.forEach(p => {
                    const opt = document.createElement('sl-option');
                    opt.value = p.id;
                    opt.textContent = p.nombre_completo;
                    opt.dataset.vendedor = '1';
                    sel.appendChild(opt);
                });
            }
        } catch (e) { console.warn('[Ventas] Error cargando vendedores:', e); }
    }

    filtrarVentas();
}

function filtrarVentas() {
    const desde  = document.getElementById('filtroFechaVentasDesde')?.value || '';
    const hasta  = document.getElementById('filtroFechaVentasHasta')?.value || '';
    const tipo   = document.getElementById('filtroTipoVenta')?.value || '';
    const vend   = document.getElementById('filtroVendedorVentas')?.value || '';
    const texto  = (document.getElementById('filtroTextoVentas')?.value || '').toLowerCase().trim();

    let ventas = [...(todosLosPedidos || [])];

    if (desde) ventas = ventas.filter(p => {
        const d = (p.fecha || '').substring(0, 10);
        return d >= desde;
    });
    if (hasta) ventas = ventas.filter(p => {
        const d = (p.fecha || '').substring(0, 10);
        return d <= hasta;
    });
    if (tipo) {
        ventas = ventas.filter(p => {
            const est = p.estado || '';
            const tc  = p.tipo_comprobante || '';
            const id  = p.id || '';
            return est === tipo || tc === tipo || id.startsWith(tipo.toUpperCase() + '-');
        });
    }
    if (vend) ventas = ventas.filter(p => (p.vendedor_id || '') === vend);
    if (texto) ventas = ventas.filter(p => {
        const nom = (p.cliente?.nombre || '').toLowerCase();
        const ruc = (p.cliente?.ruc || '').toLowerCase();
        const fac = (p.numFactura || p.sifen_numFactura || '').toLowerCase();
        const cdc = (p.cdc || p.sifen_cdc || p.cdc_nc || '').toLowerCase();
        const pid = (p.id || '').toLowerCase();
        return nom.includes(texto) || ruc.includes(texto) || fac.includes(texto) || cdc.includes(texto) || pid.includes(texto);
    });

    ventas.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    paginaVentas = 1;
    mostrarVentas(ventas);
    actualizarEstadisticasVentas(ventas);
}

function actualizarEstadisticasVentas(ventas) {
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    const recibos    = ventas.filter(v => v.estado === 'cobrado_sin_factura' || (v.id || '').startsWith('REC-')).length;
    const facturados = ventas.filter(v => v.estado === 'facturado_mock' || (v.id || '').startsWith('FAC-')).length;
    const recaudado  = ventas
        .filter(v => v.estado !== 'pedido_pendiente' && v.estado !== 'entregado' && v.estado !== 'anulado')
        .reduce((s, v) => s + (v.total || 0), 0);
    el('statTotalVentas', ventas.length);
    el('statRecibos', recibos);
    el('statFacturados', facturados);
    el('statRecaudacionVentas', typeof formatearGuaranies === 'function' ? formatearGuaranies(recaudado) : recaudado.toLocaleString());
    const cnt = document.getElementById('ventasCount');
    if (cnt) cnt.textContent = ventas.length;
}

function mostrarVentas(ventas) {
    _ventasFiltradas = ventas;
    const container = document.getElementById('ventasTabla');
    if (!container) return;

    if (!ventas.length) {
        container.innerHTML = '<div class="text-center py-12 text-gray-400 text-sm">No hay documentos que coincidan con los filtros.</div>';
        _renderPaginacionVentas(0, 1);
        return;
    }

    const totalPaginas = Math.max(1, Math.ceil(ventas.length / VENTAS_POR_PAGINA));
    paginaVentas = Math.max(1, Math.min(paginaVentas, totalPaginas));
    const inicio = (paginaVentas - 1) * VENTAS_POR_PAGINA;
    const pagina = ventas.slice(inicio, inicio + VENTAS_POR_PAGINA);

    const rows = pagina.map(v => {
        const fecha  = typeof formatearFecha === 'function' ? formatearFecha(v.fecha).substring(0, 10) : (v.fecha || '').substring(0, 10);
        const nombre = escapeHTML(v.cliente?.nombre || '—');
        const num    = escapeHTML(v.numFactura || v.sifen_numFactura || v.id?.substring(0, 18) || '—');
        const total  = typeof formatearGuaranies === 'function' ? formatearGuaranies(v.total || 0) : (v.total || 0).toLocaleString();
        const fraude = v.alerta_fraude ? '<span title="Alerta fraude" class="text-red-500 ml-1">⚠</span>' : '';
        const vendNom = _vendedoresMap[v.vendedor_id] || '';
        return `<tr class="hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0" data-action="abrirDetalleVenta" data-arg="${escapeHTML(v.id)}">
            <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">${fecha}</td>
            <td class="px-4 py-3 text-xs">${_tipoBadge(v)}</td>
            <td class="px-4 py-3 text-xs font-mono text-gray-700">${num}${fraude}</td>
            <td class="px-4 py-3 text-xs text-gray-800">${nombre}</td>
            <td class="px-4 py-3 text-xs text-gray-500">${escapeHTML(vendNom)}</td>
            <td class="px-4 py-3 text-xs">${_estadoBadge(v.estado)}</td>
            <td class="px-4 py-3 text-xs font-semibold text-right text-gray-800 whitespace-nowrap">${total}</td>
            <td class="px-4 py-3 text-xs text-right">
                <button class="text-gray-400 hover:text-indigo-600 transition-colors" data-action="abrirDetalleVenta" data-arg="${escapeHTML(v.id)}" title="Ver detalle">
                    <i data-lucide="chevron-right" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `<table class="w-full text-left">
        <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Fecha</th>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tipo</th>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Número</th>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cliente</th>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Vendedor</th>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Total</th>
                <th class="px-4 py-2.5"></th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;

    _renderPaginacionVentas(ventas.length, totalPaginas);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _renderPaginacionVentas(total, totalPaginas) {
    const el = document.getElementById('paginacionVentas');
    if (!el) return;
    if (totalPaginas <= 1) { el.innerHTML = ''; return; }

    const esPrimera = paginaVentas === 1;
    const esUltima  = paginaVentas === totalPaginas;
    const ini  = (paginaVentas - 1) * VENTAS_POR_PAGINA + 1;
    const fin  = Math.min(paginaVentas * VENTAS_POR_PAGINA, total);

    el.innerHTML = `
        <span>${ini}–${fin} de ${total} documentos</span>
        <div class="flex gap-1 items-center">
            <sl-button variant="default" size="small" data-action="paginaVentasFirst" ${esPrimera ? 'disabled' : ''}>«</sl-button>
            <sl-button variant="default" size="small" data-action="paginaVentasPrev" ${esPrimera ? 'disabled' : ''}>‹</sl-button>
            <span class="px-2 text-xs font-medium text-gray-600">${paginaVentas} / ${totalPaginas}</span>
            <sl-button variant="default" size="small" data-action="paginaVentasNext" data-total="${totalPaginas}" ${esUltima ? 'disabled' : ''}>›</sl-button>
            <sl-button variant="default" size="small" data-action="paginaVentasLast" data-total="${totalPaginas}" ${esUltima ? 'disabled' : ''}>»</sl-button>
        </div>`;
}

function _paginaVentasCambiar(nueva) {
    const total = Math.max(1, Math.ceil(_ventasFiltradas.length / VENTAS_POR_PAGINA));
    paginaVentas = Math.max(1, Math.min(nueva, total));
    mostrarVentas(_ventasFiltradas);
}

// ============================================
// DRAWER DETALLE VENTA
// ============================================

async function abrirDetalleVenta(pedidoId) {
    const drawer  = document.getElementById('drawerDetalleVenta');
    const content = document.getElementById('drawerDetalleVentaContent');
    const footer  = document.getElementById('drawerDetalleVentaFooter');
    if (!drawer) return;

    content.innerHTML = '<div class="text-center py-12 text-gray-400 text-sm animate-pulse">Cargando...</div>';
    footer.innerHTML  = '';
    drawer.show();

    const pedido = await ventasDataBuscarPedido(pedidoId);
    if (!pedido) {
        content.innerHTML = '<div class="text-center py-10 text-red-400 text-sm">Documento no encontrado.</div>';
        return;
    }

    const clienteInfo = ventasDataBuscarCliente(pedido.cliente?.id);
    const fecha  = typeof formatearFecha === 'function' ? formatearFecha(pedido.fecha) : pedido.fecha;
    const total  = typeof formatearGuaranies === 'function' ? formatearGuaranies(pedido.total || 0) : (pedido.total || 0).toLocaleString();
    const num    = pedido.numFactura || pedido.sifen_numFactura || pedido.id;
    const cdc    = pedido.cdc || pedido.sifen_cdc || pedido.cdc_nc || '';
    const items  = pedido.items || [];
    const iva    = pedido.desgloseIVA;
    const est    = pedido.estado || '';

    const tituloEl = document.getElementById('drawerDetalleVentaTitulo');
    const subEl    = document.getElementById('drawerDetalleVentaSubtitulo');
    if (tituloEl) tituloEl.textContent = `${num}`;
    if (subEl)    subEl.textContent    = `${fecha}`;

    const itemsHtml = items.map(it => `
        <tr class="border-b border-gray-50 last:border-0">
            <td class="py-2 text-xs text-gray-700">${escapeHTML(it.nombre || it.descripcion || '')}</td>
            <td class="py-2 text-xs text-gray-500 text-center">${escapeHTML(it.presentacion || it.unidad || '')}</td>
            <td class="py-2 text-xs text-gray-700 text-center">${it.cantidad}</td>
            <td class="py-2 text-xs text-gray-700 text-right">${typeof formatearGuaranies === 'function' ? formatearGuaranies(it.precio || 0) : (it.precio || 0).toLocaleString()}</td>
            <td class="py-2 text-xs font-medium text-gray-800 text-right">${typeof formatearGuaranies === 'function' ? formatearGuaranies(it.subtotal || (it.precio * it.cantidad) || 0) : ''}</td>
        </tr>`).join('');

    const ivaHtml = iva ? `
        <div class="mt-4 pt-3 border-t border-gray-200 space-y-1">
            <div class="flex justify-between text-xs text-gray-500"><span>Sub. Exentas</span><span>${typeof formatearGuaranies === 'function' ? formatearGuaranies(iva.totalExentas || 0) : iva.totalExentas}</span></div>
            <div class="flex justify-between text-xs text-gray-500"><span>Sub. IVA 5%</span><span>${typeof formatearGuaranies === 'function' ? formatearGuaranies(iva.totalGravada5 || 0) : iva.totalGravada5}</span></div>
            <div class="flex justify-between text-xs text-gray-500"><span>Sub. IVA 10%</span><span>${typeof formatearGuaranies === 'function' ? formatearGuaranies(iva.totalGravada10 || 0) : iva.totalGravada10}</span></div>
            <div class="flex justify-between text-xs text-gray-500"><span>Liq. IVA 5%</span><span>${typeof formatearGuaranies === 'function' ? formatearGuaranies(iva.liqIva5 || 0) : iva.liqIva5}</span></div>
            <div class="flex justify-between text-xs text-gray-500"><span>Liq. IVA 10%</span><span>${typeof formatearGuaranies === 'function' ? formatearGuaranies(iva.liqIva10 || 0) : iva.liqIva10}</span></div>
        </div>` : '';

    const fraudeHtml = pedido.alerta_fraude ? `
        <div class="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            <strong>⚠ Alerta de fraude:</strong> ${escapeHTML(pedido.fraude_detalle || 'Anomalía detectada')}
        </div>` : '';

    const cdcHtml = cdc ? `<div class="mt-3 p-2 bg-gray-50 rounded text-[10px] font-mono text-gray-500 break-all">${escapeHTML(cdc)}</div>` : '';

    content.innerHTML = `
        ${fraudeHtml}
        <div class="grid grid-cols-2 gap-3 mb-5">
            <div class="p-3 bg-gray-50 rounded-lg">
                <p class="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Cliente</p>
                <p class="text-sm font-semibold text-gray-800">${escapeHTML(pedido.cliente?.nombre || '—')}</p>
                ${pedido.cliente?.ruc ? `<p class="text-xs text-gray-500">RUC: ${escapeHTML(pedido.cliente.ruc)}</p>` : ''}
                ${pedido.cliente?.telefono ? `<p class="text-xs text-gray-500">${escapeHTML(pedido.cliente.telefono)}</p>` : ''}
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
                <p class="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Documento</p>
                <div>${_tipoBadge(pedido)} ${_estadoBadge(est)}</div>
                <p class="text-xs text-gray-500 mt-1">Pago: ${escapeHTML(pedido.tipoPago || pedido.condicion_pago || '—')}</p>
                ${pedido.notas ? `<p class="text-xs text-gray-400 italic mt-1">${escapeHTML(pedido.notas)}</p>` : ''}
            </div>
        </div>

        <div class="rounded-xl border border-gray-200 overflow-hidden mb-4">
            <table class="w-full">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase text-left">Producto</th>
                        <th class="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase text-center">Pres.</th>
                        <th class="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase text-center">Cant.</th>
                        <th class="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase text-right">P.Unit.</th>
                        <th class="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase text-right">Subtotal</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 px-3">${itemsHtml || '<tr><td colspan="5" class="py-4 text-center text-xs text-gray-400">Sin ítems</td></tr>'}</tbody>
            </table>
        </div>

        <div class="flex justify-between items-center pt-3 border-t border-gray-200">
            <span class="text-sm font-bold text-gray-600">TOTAL</span>
            <span class="text-xl font-bold text-indigo-700">${total}</span>
        </div>
        ${ivaHtml}
        ${cdcHtml}`;

    footer.innerHTML = _renderFooterVenta(pedido);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _renderFooterVenta(pedido) {
    const id  = escapeHTML(pedido.id);
    const est = pedido.estado || '';
    const btns = [];

    if (est === 'pedido_pendiente') {
        btns.push(`<sl-button variant="primary" size="small" data-action="facturarDesdeDetalle" data-arg="${id}"><i data-lucide="receipt" class="w-4 h-4 pointer-events-none"></i> Facturar</sl-button>`);
        btns.push(`<sl-button variant="neutral" size="small" data-action="editarPedidoDesdeDetalle" data-arg="${id}"><i data-lucide="pencil" class="w-4 h-4 pointer-events-none"></i> Editar</sl-button>`);
        btns.push(`<sl-button variant="danger" size="small" data-action="anularDocumentoDesdeDetalle" data-arg="${id}">Anular</sl-button>`);
    } else if (est === 'entregado') {
        btns.push(`<sl-button variant="primary" size="small" data-action="facturarDesdeDetalle" data-arg="${id}"><i data-lucide="receipt" class="w-4 h-4 pointer-events-none"></i> Facturar</sl-button>`);
        btns.push(`<sl-button variant="danger" size="small" data-action="anularDocumentoDesdeDetalle" data-arg="${id}">Anular</sl-button>`);
    } else if (est === 'cobrado_sin_factura') {
        btns.push(`<sl-button variant="primary" size="small" data-action="verKudePDF" data-arg="${id}"><i data-lucide="file-text" class="w-4 h-4 pointer-events-none"></i> Ver PDF</sl-button>`);
        btns.push(`<sl-button variant="success" size="small" data-action="whatsappDesdeDetalle" data-arg="${id}"><i data-lucide="message-circle" class="w-4 h-4 pointer-events-none"></i> WhatsApp</sl-button>`);
        btns.push(`<sl-button variant="danger" size="small" data-action="anularDocumentoDesdeDetalle" data-arg="${id}">Anular</sl-button>`);
    } else if (est === 'facturado_mock') {
        btns.push(`<sl-button variant="primary" size="small" data-action="verKudePDF" data-arg="${id}"><i data-lucide="file-text" class="w-4 h-4 pointer-events-none"></i> Ver PDF</sl-button>`);
        btns.push(`<sl-button variant="success" size="small" data-action="whatsappDesdeDetalle" data-arg="${id}"><i data-lucide="message-circle" class="w-4 h-4 pointer-events-none"></i> WhatsApp</sl-button>`);
        btns.push(`<sl-button variant="warning" size="small" data-action="ncDesdeDetalle" data-arg="${id}"><i data-lucide="file-minus-2" class="w-4 h-4 pointer-events-none"></i> Nota Crédito</sl-button>`);
    } else if (est === 'nota_credito_mock') {
        btns.push(`<sl-button variant="primary" size="small" data-action="verKudePDF" data-arg="${id}"><i data-lucide="file-text" class="w-4 h-4 pointer-events-none"></i> Ver PDF NC</sl-button>`);
    }
    // nota_remision y anulado: sin botones
    return btns.join('');
}

// ============================================
// ACCIONES DEL DRAWER
// ============================================

async function facturarDesdeDetalle(pedidoId) {
    document.getElementById('drawerDetalleVenta')?.hide();
    await facturarPedidoAdmin(pedidoId);
}

function editarPedidoDesdeDetalle(pedidoId) {
    document.getElementById('drawerDetalleVenta')?.hide();
    if (typeof abrirModalEditarPedido === 'function') abrirModalEditarPedido(pedidoId);
}

async function anularDocumentoDesdeDetalle(pedidoId) {
    const ok = await mostrarConfirmModal('¿Anular este documento? Esta acción no se puede deshacer.', { textoConfirmar: 'Anular', destructivo: true });
    if (!ok) return;
    try {
        const { success, error } = await SupabaseService.updateEstadoPedido(pedidoId, 'anulado');
        if (!success) throw new Error(error);
        mostrarToast('Documento anulado', 'success');
        document.getElementById('drawerDetalleVenta')?.hide();
        await cargarVentas();
    } catch (e) {
        mostrarToast('Error al anular: ' + (e.message || e), 'error');
    }
}

async function reimprimirDesdeDetalle(pedidoId) {
    document.getElementById('drawerDetalleVenta')?.hide();
    if (typeof generarKudePDF === 'function') await generarKudePDF(pedidoId);
}

async function whatsappDesdeDetalle(pedidoId) {
    document.getElementById('drawerDetalleVenta')?.hide();
    const url = await ventasDataBuildWhatsAppURL(pedidoId);
    if (url) window.open(url, '_blank');
}

async function kudeDesdeDetalle(pedidoId) {
    document.getElementById('drawerDetalleVenta')?.hide();
    if (typeof generarKudePDF === 'function') await generarKudePDF(pedidoId);
}

function ncDesdeDetalle(pedidoId) {
    document.getElementById('drawerDetalleVenta')?.hide();
    if (typeof seleccionarTipoDTE === 'function') seleccionarTipoDTE('nota_credito', pedidoId);
}

async function reimprimirNCDesdeDetalle(pedidoId) {
    document.getElementById('drawerDetalleVenta')?.hide();
    if (typeof generarKudePDF === 'function') await generarKudePDF(pedidoId);
}

// ============================================
// FACTURAR PEDIDO
// ============================================

async function facturarPedidoAdmin(pedidoId) {
    const pedido = await ventasDataBuscarPedido(pedidoId);
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }

    const clienteInfo = ventasDataBuscarCliente(pedido.cliente?.id);
    const ruc = clienteInfo?.ruc || pedido.cliente?.ruc || '';
    if (!ruc) {
        mostrarToast('El cliente no tiene RUC asignado. No se puede facturar.', 'error');
        return;
    }

    const btnId = `btnFacturar-${pedidoId}`;
    await withButtonLock(btnId, async () => {
        await new Promise(resolve => setTimeout(resolve, 2500));

        const resultado = await ventasDataFacturar(pedidoId);
        if (!resultado) { mostrarToast('Pedido no encontrado', 'error'); return; }
        if (resultado.error) { mostrarToast(resultado.error, 'error'); return; }

        const { pedido: pedidoActualizado, numFactura } = resultado;
        mostrarToast(`✓ Factura ${numFactura} emitida`, 'success', 4000);
        cargarPedidos();
        if (typeof cargarVentas === 'function') cargarVentas();
        if (typeof generarKudePDF === 'function') await generarKudePDF(pedidoActualizado.id || pedidoId);
    }, 'Procesando con la SET...')();
}

// ============================================
// WHATSAPP
// ============================================

ventasCtrl.enviarWhatsAppVenta = async function(ventaId) {
    const url = await ventasDataBuildWhatsAppURL(ventaId);
    if (url) window.open(url, '_blank');
};

function enviarWhatsAppVenta(ventaId) { ventasCtrl.enviarWhatsAppVenta(ventaId); }

// ============================================
// EXPORTAR CSV
// ============================================

async function exportarVentasSemanalesCSV() {
    const result = await ventasDataExportCSVSemanal();
    if (!result) {
        mostrarToast('No hay ventas esta semana para exportar', 'error');
        return;
    }
    descargarCSV(result.csv, result.filename);
    mostrarToast(`Exportadas ${result.count} ventas de la semana`, 'success');
}
