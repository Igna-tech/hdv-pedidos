// ============================================
// HDV Admin - Seccion Ventas + Facturacion Admin
// Requiere: admin.js (todosLosPedidos, productosData, etc.)
// ============================================

let ventaReimprimirId = null;
let ultimaFacturaAdmin = null;

// --- Helpers ---

function generarNumeroFacturaAdmin() {
    const num = String(Math.floor(Math.random() * 9999999) + 1).padStart(7, '0');
    return `001-001-${num}`;
}

function generarCDCAdmin() {
    let cdc = '';
    for (let i = 0; i < 44; i++) cdc += Math.floor(Math.random() * 10);
    return cdc;
}

function formatearFechaAdmin(fecha) {
    const d = new Date(fecha);
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

// ============================================
// CARGAR Y MOSTRAR VENTAS
// ============================================

function cargarVentas() {
    todosLosPedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    filtrarVentas();
}

function filtrarVentas() {
    const fecha = document.getElementById('filtroFechaVentas')?.value;
    const tipo = document.getElementById('filtroTipoVenta')?.value;

    let ventas = todosLosPedidos.filter(p =>
        p.estado === 'cobrado_sin_factura' || p.estado === 'facturado_mock'
    );

    if (fecha) ventas = ventas.filter(p => new Date(p.fecha).toISOString().split('T')[0] === fecha);
    if (tipo) ventas = ventas.filter(p => p.estado === tipo);

    mostrarVentas(ventas);
    actualizarEstadisticasVentas(ventas);
}

function actualizarEstadisticasVentas(ventas) {
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('statTotalVentas', ventas.length);
    el('statRecibos', ventas.filter(v => v.estado === 'cobrado_sin_factura').length);
    el('statFacturados', ventas.filter(v => v.estado === 'facturado_mock').length);
}

function mostrarVentas(ventas) {
    const container = document.getElementById('listaVentas');
    if (!container) return;

    if (ventas.length === 0) {
        container.innerHTML = typeof generarAdminEmptyState === 'function'
            ? generarAdminEmptyState(typeof SVG_ADMIN_EMPTY_ORDERS !== 'undefined' ? SVG_ADMIN_EMPTY_ORDERS : '', 'No hay ventas registradas', 'Las ventas del vendedor apareceran aqui')
            : '<p class="p-8 text-center text-gray-400 italic">No hay ventas registradas</p>';
        return;
    }

    container.innerHTML = '';
    ventas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    ventas.forEach(v => {
        const esFactura = v.estado === 'facturado_mock';
        const badgeClass = esFactura
            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            : 'bg-amber-100 text-amber-800 border border-amber-200';
        const badgeText = esFactura ? 'FACTURADO SIFEN' : 'RECIBO INTERNO';
        const borderColor = esFactura ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-amber-400';

        const clienteInfo = productosData.clientes.find(c => c.id === v.cliente?.id);
        const zona = clienteInfo?.zona || clienteInfo?.direccion || '';
        const telefono = clienteInfo?.telefono || v.cliente?.telefono || '';

        const div = document.createElement('div');
        div.className = `p-6 hover:bg-gray-50 transition-colors ${borderColor}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">${v.cliente?.nombre || 'Sin cliente'}</h3>
                    <div class="text-sm text-gray-500 mt-1 flex items-center gap-1">
                        <i data-lucide="map-pin" class="w-3 h-3"></i> ${zona}
                        <span class="mx-1">·</span>
                        <i data-lucide="clock" class="w-3 h-3"></i> ${new Date(v.fecha).toLocaleString('es-PY')}
                    </div>
                    ${esFactura && v.numFactura ? `<p class="text-xs font-mono text-gray-400 mt-1">N° ${v.numFactura}</p>` : ''}
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-bold ${badgeClass}">${badgeText}</span>
            </div>
            <div class="mb-3 space-y-1">
                ${(v.items || []).map(i => `
                <div class="flex justify-between text-sm py-1">
                    <span>${i.nombre} <span class="text-gray-400">(${i.presentacion} x ${i.cantidad})</span></span>
                    <strong>Gs. ${(i.subtotal || 0).toLocaleString()}</strong>
                </div>`).join('')}
            </div>
            ${v.notas ? `<div class="text-sm text-gray-500 italic mb-3 flex items-start gap-1.5"><i data-lucide="message-square" class="w-3.5 h-3.5 mt-0.5 shrink-0"></i> ${v.notas}</div>` : ''}
            <div class="flex justify-between items-center pt-3 border-t border-gray-100">
                <span class="text-sm text-gray-500">${v.tipoPago || 'contado'}${v.descuento > 0 ? ` | ${v.descuento}% desc.` : ''}</span>
                <span class="text-xl font-bold text-gray-900">Gs. ${(v.total || 0).toLocaleString()}</span>
            </div>
            <div class="flex gap-2 mt-4 flex-wrap">
                <button class="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-700 inline-flex items-center gap-1.5" onclick="abrirReimpresion('${v.id}')"><i data-lucide="printer" class="w-3.5 h-3.5"></i> Re-imprimir</button>
                <button class="bg-[#25D366] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#1fad55] inline-flex items-center gap-1.5" onclick="enviarWhatsAppVenta('${v.id}')"><i data-lucide="message-circle" class="w-3.5 h-3.5"></i> WhatsApp</button>
            </div>`;
        container.appendChild(div);
    });
    lucide.createIcons();
}

// ============================================
// FACTURAR PEDIDO DESDE ADMIN
// ============================================

async function facturarPedidoAdmin(pedidoId) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }

    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    const ruc = clienteInfo?.ruc || pedido.cliente?.ruc || '';

    if (!ruc) {
        mostrarToast('El cliente no tiene RUC asignado. No se puede facturar.', 'error');
        return;
    }

    // Deshabilitar boton y mostrar loading
    const btn = document.getElementById(`btnFacturar-${pedidoId}`);
    let textoOriginal = '';
    if (btn) {
        textoOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<svg class="w-4 h-4 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Procesando con la SET...';
    }

    const numFactura = generarNumeroFacturaAdmin();
    const cdc = generarCDCAdmin();

    // TODO: Fase Futura - Integrar API FactPy aqui (Oficina) al facturar pedido pendiente.
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Actualizar estado
    pedido.estado = 'facturado_mock';
    pedido.numFactura = numFactura;
    pedido.cdc = cdc;
    pedido.sincronizado = false;
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));

    // Sincronizar con Supabase
    if (typeof guardarPedidoFirebase === 'function') {
        guardarPedidoFirebase(pedido).then(ok => {
            if (ok) {
                pedido.sincronizado = true;
                localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
            }
        });
    }

    // Guardar datos para impresion
    ultimaFacturaAdmin = { pedido, clienteInfo, numFactura, cdc };

    // Preparar modal
    document.getElementById('adminFacturaNumero').textContent = `N° ${numFactura} | CDC: ${cdc}`;

    const telefono = clienteInfo?.telefono || pedido.cliente?.telefono || '';
    const textoWA = `Factura Electronica HDV Distribuciones%0A` +
        `N°: ${numFactura}%0A` +
        `Fecha: ${formatearFechaAdmin(pedido.fecha)}%0A` +
        `Cliente: ${pedido.cliente?.nombre}%0A` +
        `RUC: ${ruc}%0A` +
        `Total: Gs. ${(pedido.total || 0).toLocaleString()}%0A` +
        `CDC: ${cdc}%0A` +
        `Consulta: https://ekuatia.set.gov.py`;
    const telLimpio = telefono.replace(/\D/g, '');
    document.getElementById('adminFacturaWhatsApp').href = telLimpio
        ? `https://wa.me/595${telLimpio.replace(/^0/, '')}?text=${textoWA}`
        : `https://wa.me/?text=${textoWA}`;

    // Mostrar modal
    document.getElementById('modalFacturaAdmin').classList.add('show');

    // Refrescar lista pedidos (el pedido ya no es pendiente)
    cargarPedidos();

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }

    lucide.createIcons();
}

// ============================================
// IMPRESION DUAL: Thermal / A4
// ============================================

function construirTicketThermal(pedido, clienteInfo) {
    const ruc = clienteInfo?.ruc || pedido.cliente?.ruc || '';
    const esFactura = pedido.estado === 'facturado_mock';
    const titulo = esFactura ? 'FACTURA ELECTRONICA' : 'RECIBO DE USO INTERNO - NO VALIDO COMO FACTURA';

    let html = `
        <p style="text-align:center; font-size:13px; font-weight:bold; margin:0 0 2px;">HDV DISTRIBUCIONES</p>
        ${esFactura ? `<p style="text-align:center; font-size:9px; margin:0 0 2px;">RUC: 80000000-0 | Timbrado: 12345678</p>` : ''}
        <p style="text-align:center; font-size:9px; margin:0 0 6px;">Tel: (0000) 000-000</p>
        <p style="text-align:center; font-weight:bold; font-size:${esFactura ? '12' : '10'}px; ${esFactura ? '' : 'border:1px solid #000; padding:3px;'} margin:0 0 4px;">${titulo}</p>
        ${esFactura && pedido.numFactura ? `<p style="text-align:center; font-size:11px; font-weight:bold; margin:0 0 6px;">${pedido.numFactura}</p>` : ''}
        <div style="font-size:10px; margin-bottom:6px;">
            <p>Fecha: ${formatearFechaAdmin(pedido.fecha)}</p>
            <p>Cliente: ${pedido.cliente?.nombre || 'N/A'}</p>
            ${ruc ? `<p>RUC: ${ruc}</p>` : ''}
            <p>Pago: ${pedido.tipoPago === 'credito' ? 'Credito' : 'Contado'}</p>
        </div>
        <hr style="border:none; border-top:1px dashed #000; margin:4px 0;">`;

    (pedido.items || []).forEach(i => {
        html += `<div style="display:flex; justify-content:space-between; font-size:10px; margin:2px 0;">
            <span style="flex:1;">${i.cantidad}x ${i.nombre} ${i.presentacion}</span>
            <span style="white-space:nowrap;">Gs.${(i.subtotal || 0).toLocaleString()}</span>
        </div>`;
    });

    html += `<hr style="border:none; border-top:1px dashed #000; margin:4px 0;">`;
    if (pedido.descuento > 0) {
        html += `<div style="font-size:10px; text-align:right;">Subtotal: Gs. ${(pedido.subtotal || 0).toLocaleString()}</div>`;
        html += `<div style="font-size:10px; text-align:right;">Desc: ${pedido.descuento}%</div>`;
    }
    html += `<div style="font-size:12px; font-weight:bold; text-align:right;">TOTAL: Gs. ${(pedido.total || 0).toLocaleString()}</div>`;
    html += `<hr style="border:none; border-top:1px dashed #000; margin:4px 0;">`;

    if (esFactura && pedido.cdc) {
        html += `<p style="text-align:center; font-size:9px; font-weight:bold; margin:4px 0 2px;">CDC:</p>`;
        html += `<p style="text-align:center; font-size:8px; font-family:monospace; word-break:break-all; margin:0 0 6px;">${pedido.cdc}</p>`;
        html += `<div style="width:80px; height:80px; border:2px solid #000; margin:4px auto; display:flex; align-items:center; justify-content:center; font-size:8px; text-align:center;">QR<br>SIFEN</div>`;
        html += `<p style="text-align:center; font-size:8px; margin:4px 0 0;">Consulte en: https://ekuatia.set.gov.py</p>`;
    } else {
        html += `<p style="text-align:center; font-size:9px; margin:6px 0 0;">Gracias por su compra</p>`;
    }

    return html;
}

function construirDocA4(pedido, clienteInfo) {
    const ruc = clienteInfo?.ruc || pedido.cliente?.ruc || '';
    const esFactura = pedido.estado === 'facturado_mock';
    const titulo = esFactura ? 'FACTURA ELECTRONICA' : 'RECIBO DE USO INTERNO';

    let itemsHTML = '';
    (pedido.items || []).forEach((i, idx) => {
        itemsHTML += `<tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:8px 12px; font-size:12px;">${idx + 1}</td>
            <td style="padding:8px 12px; font-size:12px;">${i.nombre} - ${i.presentacion}</td>
            <td style="padding:8px 12px; font-size:12px; text-align:center;">${i.cantidad}</td>
            <td style="padding:8px 12px; font-size:12px; text-align:right;">Gs. ${(i.precio || 0).toLocaleString()}</td>
            <td style="padding:8px 12px; font-size:12px; text-align:right; font-weight:bold;">Gs. ${(i.subtotal || 0).toLocaleString()}</td>
        </tr>`;
    });

    return `
        <div style="border-bottom:3px solid #111827; padding-bottom:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <h1 style="font-size:20px; font-weight:900; margin:0; color:#111827;">HDV DISTRIBUCIONES</h1>
                <p style="font-size:11px; color:#6b7280; margin:2px 0 0;">RUC: 80000000-0 | Tel: (0000) 000-000</p>
            </div>
            <div style="text-align:right;">
                <p style="font-size:14px; font-weight:700; color:${esFactura ? '#059669' : '#d97706'}; margin:0;">${titulo}</p>
                ${esFactura && pedido.numFactura ? `<p style="font-size:16px; font-weight:800; margin:2px 0 0;">${pedido.numFactura}</p>` : ''}
                ${!esFactura ? '<p style="font-size:10px; color:#dc2626; margin:2px 0 0;">NO VALIDO COMO FACTURA</p>' : ''}
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:12px;">
            <div>
                <p style="margin:2px 0;"><strong>Cliente:</strong> ${pedido.cliente?.nombre || 'N/A'}</p>
                ${ruc ? `<p style="margin:2px 0;"><strong>RUC:</strong> ${ruc}</p>` : ''}
                <p style="margin:2px 0;"><strong>Direccion:</strong> ${clienteInfo?.direccion || clienteInfo?.zona || ''}</p>
            </div>
            <div style="text-align:right;">
                <p style="margin:2px 0;"><strong>Fecha:</strong> ${formatearFechaAdmin(pedido.fecha)}</p>
                <p style="margin:2px 0;"><strong>Pago:</strong> ${pedido.tipoPago === 'credito' ? 'Credito' : 'Contado'}</p>
                <p style="margin:2px 0;"><strong>N° Doc:</strong> ${pedido.id}</p>
            </div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
            <thead>
                <tr style="background:#f1f5f9; border-bottom:2px solid #111827;">
                    <th style="padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase;">#</th>
                    <th style="padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase;">Descripcion</th>
                    <th style="padding:8px 12px; text-align:center; font-size:11px; text-transform:uppercase;">Cant.</th>
                    <th style="padding:8px 12px; text-align:right; font-size:11px; text-transform:uppercase;">P. Unit.</th>
                    <th style="padding:8px 12px; text-align:right; font-size:11px; text-transform:uppercase;">Subtotal</th>
                </tr>
            </thead>
            <tbody>${itemsHTML}</tbody>
        </table>
        <div style="text-align:right; margin-bottom:16px;">
            ${pedido.descuento > 0 ? `
                <p style="font-size:12px; margin:2px 0;">Subtotal: Gs. ${(pedido.subtotal || 0).toLocaleString()}</p>
                <p style="font-size:12px; margin:2px 0;">Descuento: ${pedido.descuento}%</p>
            ` : ''}
            <p style="font-size:18px; font-weight:900; margin:8px 0 0; border-top:2px solid #111827; padding-top:8px;">TOTAL: Gs. ${(pedido.total || 0).toLocaleString()}</p>
        </div>
        ${pedido.notas ? `<p style="font-size:11px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:8px;">Notas: ${pedido.notas}</p>` : ''}
        ${esFactura && pedido.cdc ? `
            <div style="margin-top:20px; padding-top:12px; border-top:1px solid #e5e7eb; display:flex; align-items:center; gap:16px;">
                <div style="width:80px; height:80px; border:2px solid #000; display:flex; align-items:center; justify-content:center; font-size:10px; text-align:center; flex-shrink:0;">QR<br>SIFEN</div>
                <div style="font-size:10px;">
                    <p style="margin:0 0 4px;"><strong>CDC:</strong> ${pedido.cdc}</p>
                    <p style="margin:0; color:#6b7280;">Consulte este documento en: https://ekuatia.set.gov.py</p>
                </div>
            </div>
        ` : ''}
    `;
}

function imprimirConFormato(formato, pedido, clienteInfo) {
    let printEl, contentEl;

    // Inyectar @page dinamicamente
    let pageStyle = document.getElementById('dynamicPageStyle');
    if (!pageStyle) {
        pageStyle = document.createElement('style');
        pageStyle.id = 'dynamicPageStyle';
        document.head.appendChild(pageStyle);
    }

    if (formato === 'thermal') {
        printEl = document.getElementById('adminPrintThermal');
        contentEl = document.getElementById('adminPrintThermalContent');
        contentEl.innerHTML = construirTicketThermal(pedido, clienteInfo);
        document.body.classList.add('print-thermal');
        document.body.classList.remove('print-a4');
        pageStyle.textContent = '@page { margin: 0; size: 58mm auto; }';
    } else {
        printEl = document.getElementById('adminPrintA4');
        contentEl = document.getElementById('adminPrintA4Content');
        contentEl.innerHTML = construirDocA4(pedido, clienteInfo);
        document.body.classList.add('print-a4');
        document.body.classList.remove('print-thermal');
        pageStyle.textContent = '@page { margin: 10mm; size: A4; }';
    }

    printEl.classList.add('active');
    printEl.style.display = 'block';

    setTimeout(() => {
        window.print();
        printEl.classList.remove('active');
        printEl.style.display = 'none';
        document.body.classList.remove('print-thermal', 'print-a4');
        pageStyle.textContent = '';
    }, 300);
}

// --- Imprimir desde modal factura admin ---
function adminImprimirVenta(formato) {
    if (!ultimaFacturaAdmin) return;
    imprimirConFormato(formato, ultimaFacturaAdmin.pedido, ultimaFacturaAdmin.clienteInfo);
}

function cerrarModalFacturaAdmin() {
    document.getElementById('modalFacturaAdmin').classList.remove('show');
}

// ============================================
// RE-IMPRIMIR DESDE VENTAS
// ============================================

function abrirReimpresion(ventaId) {
    ventaReimprimirId = ventaId;
    document.getElementById('modalElegirImpresion').classList.add('show');
    lucide.createIcons();
}

function cerrarModalElegirImpresion() {
    document.getElementById('modalElegirImpresion').classList.remove('show');
    ventaReimprimirId = null;
}

function ejecutarReimpresion(formato) {
    if (!ventaReimprimirId) return;
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedido = pedidos.find(p => p.id === ventaReimprimirId);
    if (!pedido) { mostrarToast('Venta no encontrada', 'error'); return; }

    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    cerrarModalElegirImpresion();
    imprimirConFormato(formato, pedido, clienteInfo);
}

// ============================================
// ENVIAR WHATSAPP DESDE VENTAS
// ============================================

function enviarWhatsAppVenta(ventaId) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedido = pedidos.find(p => p.id === ventaId);
    if (!pedido) return;

    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    const esFactura = pedido.estado === 'facturado_mock';
    const telefono = clienteInfo?.telefono || pedido.cliente?.telefono || '';

    let texto = esFactura
        ? `Factura Electronica HDV Distribuciones%0AN°: ${pedido.numFactura || 'N/A'}%0A`
        : `Recibo HDV Distribuciones%0AN°: ${pedido.id}%0A`;

    texto += `Fecha: ${formatearFechaAdmin(pedido.fecha)}%0A`;
    texto += `Cliente: ${pedido.cliente?.nombre}%0A`;
    texto += `Total: Gs. ${(pedido.total || 0).toLocaleString()}%0A`;

    if (esFactura && pedido.cdc) {
        texto += `CDC: ${pedido.cdc}%0AConsulta: https://ekuatia.set.gov.py`;
    }

    const telLimpio = telefono.replace(/\D/g, '');
    const url = telLimpio
        ? `https://wa.me/595${telLimpio.replace(/^0/, '')}?text=${texto}`
        : `https://wa.me/?text=${texto}`;

    window.open(url, '_blank');
}
