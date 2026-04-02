// ============================================
// HDV Admin - Devoluciones y Notas de Credito
// Requiere: admin.js, admin-ventas.js
// ============================================

let facturaSeleccionadaNC = null;
let ultimaNCEmitida = null;

// ============================================
// BUSCAR FACTURA
// ============================================

async function buscarFacturaDevolucion() {
    const query = (document.getElementById('devBuscarInput')?.value || '').trim().toLowerCase();
    if (!query) {
        mostrarToast('Ingresa un numero de factura, RUC o nombre de cliente', 'error');
        return;
    }

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const facturas = pedidos.filter(p => {
        if (p.estado !== PEDIDO_ESTADOS.FACTURADO) return false;
        const clienteInfo = productosData.clientes.find(c => c.id === p.cliente?.id);
        const ruc = (clienteInfo?.ruc || p.cliente?.ruc || '').toLowerCase();
        const nombre = (p.cliente?.nombre || '').toLowerCase();
        const numFac = (p.numFactura || '').toLowerCase();
        const idDoc = (p.id || '').toLowerCase();

        return numFac.includes(query) || ruc.includes(query) || nombre.includes(query) || idDoc.includes(query);
    });

    const container = document.getElementById('devResultados');
    const lista = document.getElementById('devListaResultados');
    container.classList.remove('hidden');

    if (facturas.length === 0) {
        lista.innerHTML = '<p class="text-sm text-gray-400 italic py-2">No se encontraron facturas con ese criterio</p>';
        return;
    }

    lista.innerHTML = '';
    facturas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    facturas.forEach(f => {
        const clienteInfo = productosData.clientes.find(c => c.id === f.cliente?.id);
        const ruc = clienteInfo?.ruc || f.cliente?.ruc || '';
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors';
        div.onclick = () => seleccionarFacturaNC(f.id);
        div.innerHTML = `
            <div>
                <p class="text-sm font-bold text-gray-800">${escapeHTML(f.cliente?.nombre || 'Sin cliente')}</p>
                <p class="text-xs text-gray-500">${escapeHTML(f.numFactura || f.id)} ${ruc ? '| RUC: ' + escapeHTML(ruc) : ''} | ${new Date(f.fecha).toLocaleDateString('es-PY')}</p>
            </div>
            <div class="text-right">
                <p class="text-sm font-bold text-gray-900">${formatearGuaranies(f.total)}</p>
                <p class="text-xs text-emerald-600 font-bold">${f.items?.length || 0} items</p>
            </div>`;
        lista.appendChild(div);
    });
}

// ============================================
// SELECCIONAR FACTURA Y MOSTRAR DETALLE
// ============================================

async function seleccionarFacturaNC(facturaId) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const factura = pedidos.find(p => p.id === facturaId);
    if (!factura) { mostrarToast('Factura no encontrada', 'error'); return; }

    facturaSeleccionadaNC = factura;
    const clienteInfo = productosData.clientes.find(c => c.id === factura.cliente?.id);
    const ruc = clienteInfo?.ruc || factura.cliente?.ruc || '';

    // Llenar info
    document.getElementById('devClienteNombre').textContent = factura.cliente?.nombre || 'Sin cliente';
    document.getElementById('devClienteMeta').textContent =
        `RUC: ${ruc || 'N/A'} | Fecha: ${formatearFechaAdmin(factura.fecha)} | Pago: ${factura.tipoPago || 'contado'}`;
    document.getElementById('devFacturaNumero').textContent =
        `N° ${factura.numFactura || factura.id} | CDC: ${factura.cdc || 'N/A'}`;
    document.getElementById('devFacturaTotal').textContent = formatearGuaranies(factura.total);

    // Llenar tabla de items
    const tbody = document.getElementById('devTablaItems');
    tbody.innerHTML = '';

    (factura.items || []).forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-4 py-3 font-medium text-gray-800">${escapeHTML(item.nombre)}</td>
            <td class="px-4 py-3 text-gray-500">${escapeHTML(item.presentacion)}</td>
            <td class="px-4 py-3 text-center font-bold">${item.cantidad}</td>
            <td class="px-4 py-3 text-center text-gray-500">${formatearGuaranies(item.precio)}</td>
            <td class="px-4 py-3 text-center">
                <sl-input type="number" id="devCant-${idx}" value="0" min="0" max="${item.cantidad}" size="small"
                    style="width:5rem; --sl-input-font-weight:700; text-align:center;"
                    oninput="recalcularTotalNC()"></sl-input>
            </td>
            <td class="px-4 py-3 text-right font-bold text-red-600" id="devMonto-${idx}">Gs. 0</td>`;
        tbody.appendChild(tr);
    });

    // Resetear motivo y total
    document.getElementById('devMotivo').value = '';
    document.getElementById('devTotalNC').textContent = 'Gs. 0';

    // Mostrar detalle y ocultar resultados
    document.getElementById('devDetalleFactura').classList.remove('hidden');
    document.getElementById('devResultados').classList.add('hidden');

    lucide.createIcons();
}

// ============================================
// RECALCULAR TOTAL NC EN TIEMPO REAL
// ============================================

function recalcularTotalNC() {
    if (!facturaSeleccionadaNC) return;
    let totalNC = 0;

    (facturaSeleccionadaNC.items || []).forEach((item, idx) => {
        const input = document.getElementById(`devCant-${idx}`);
        const cantDev = Math.min(Math.max(parseInt(input?.value) || 0, 0), item.cantidad);
        if (input) input.value = cantDev; // corregir si excede
        const monto = cantDev * (item.precio || 0);
        totalNC += monto;
        const montoEl = document.getElementById(`devMonto-${idx}`);
        if (montoEl) montoEl.textContent = monto > 0 ? `-${formatearGuaranies(monto)}` : formatearGuaranies(0);
    });

    document.getElementById('devTotalNC').textContent = totalNC > 0 ? `-${formatearGuaranies(totalNC)}` : formatearGuaranies(0);
}

// ============================================
// EMITIR NOTA DE CREDITO
// ============================================

async function procesarNotaCredito() {
    if (!facturaSeleccionadaNC) { mostrarToast('Selecciona una factura primero', 'error'); return; }

    const motivo = document.getElementById('devMotivo').value;
    if (!motivo) { mostrarToast('Selecciona un motivo SIFEN obligatorio', 'error'); return; }

    // Recopilar items devueltos
    const itemsDevueltos = [];
    let totalNC = 0;

    (facturaSeleccionadaNC.items || []).forEach((item, idx) => {
        const cantDev = parseInt(document.getElementById(`devCant-${idx}`)?.value) || 0;
        if (cantDev > 0) {
            const monto = cantDev * (item.precio || 0);
            totalNC += monto;
            itemsDevueltos.push({
                ...item,
                cantidad_original: item.cantidad,
                cantidad: -cantDev,          // NEGATIVO segun manual FactPy
                subtotal: -monto,            // NEGATIVO segun manual FactPy
                precio: item.precio
            });
        }
    });

    if (itemsDevueltos.length === 0) {
        mostrarToast('Ingresa al menos 1 producto a devolver', 'error');
        return;
    }

    await withButtonLock('btnEmitirNC', async () => {
        const numNC = 'NC-' + generarNumeroFacturaAdmin();
        const cdcNC = generarCDCAdmin();

        // TODO: Fase Futura - Enviar JSON a FactPy (tipoDocumento: 5) con los montos NEGATIVOS y el CDC original.
        await new Promise(resolve => setTimeout(resolve, 2500));

        // --- LOGICA DE STOCK: Sumar cantidades devueltas al inventario ---
        itemsDevueltos.forEach(devItem => {
            const cantDevuelta = Math.abs(devItem.cantidad);
            // Buscar el producto original en el catálogo
            const prod = productosData.productos.find(p => p.id === devItem.productoId || p.nombre === devItem.nombre);
            if (prod) {
                const pres = prod.presentaciones.find(pr => pr.tamano === devItem.presentacion);
                if (pres) {
                    pres.stock = (pres.stock || 0) + cantDevuelta;
                }
            }
        });
        // Persistir catalogo con stock actualizado
        if (typeof guardarTodosCambios === 'function') {
            await guardarTodosCambios();
        }

        // --- LOGICA FISCAL: Crear registro NC ---
        const motivosTexto = {
            'devolucion_ajuste': 'Devolucion y Ajuste de precios',
            'descuento': 'Descuento',
            'mercaderia_danada': 'Mercaderia Danada'
        };

        const notaCredito = {
            id: 'NC-' + Date.now(),
            fecha: new Date().toISOString(),
            cliente: { ...facturaSeleccionadaNC.cliente },
            items: itemsDevueltos,
            subtotal: -totalNC,      // NEGATIVO
            total: -totalNC,         // NEGATIVO
            tipoPago: facturaSeleccionadaNC.tipoPago,
            notas: `NC por: ${motivosTexto[motivo] || motivo}`,
            estado: PEDIDO_ESTADOS.NOTA_CREDITO,
            numFactura: numNC,
            cdc: cdcNC,
            facturaOrigenId: facturaSeleccionadaNC.id,
            facturaOrigenNum: facturaSeleccionadaNC.numFactura || '',
            cdcOriginal: facturaSeleccionadaNC.cdc || '',
            motivoSIFEN: motivo,
            sincronizado: false
        };

        // Guardar en HDVStorage
        const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
        pedidos.push(notaCredito);
        await HDVStorage.setItem('hdv_pedidos', pedidos);

        // Sincronizar con Supabase
        if (typeof guardarPedido === 'function') {
            guardarPedido(notaCredito).then(async (ok) => {
                if (ok) {
                    notaCredito.sincronizado = true;
                    const p = (await HDVStorage.getItem('hdv_pedidos')) || [];
                    const idx = p.findIndex(x => x.id === notaCredito.id);
                    if (idx >= 0) { p[idx].sincronizado = true; await HDVStorage.setItem('hdv_pedidos', p); }
                }
            });
        }

        // Guardar para impresion
        const clienteInfo = productosData.clientes.find(c => c.id === facturaSeleccionadaNC.cliente?.id);
        ultimaNCEmitida = { notaCredito, clienteInfo, totalNC };

        // Mostrar modal exito
        document.getElementById('ncNumeroDisplay').textContent = `${numNC} | CDC: ${cdcNC}\nRef: ${facturaSeleccionadaNC.numFactura || facturaSeleccionadaNC.id}`;
        document.getElementById('modalNCExito').classList.add('show');

        // Limpiar y refrescar historial
        limpiarDevolucion();
        cargarHistorialNC();

        lucide.createIcons();
        mostrarToast('Nota de Credito emitida correctamente', 'success');
    }, 'Conectando con SIFEN...')();
}

// ============================================
// CANCELAR FACTURA (<48hs)
// ============================================

async function cancelarFactura48hs() {
    if (!facturaSeleccionadaNC) return;

    const ahora = new Date();
    const fechaFactura = new Date(facturaSeleccionadaNC.fecha);
    const horasTranscurridas = (ahora - fechaFactura) / (1000 * 60 * 60);

    if (horasTranscurridas > 48) {
        mostrarToast('Han pasado mas de 48 horas. Debes emitir una Nota de Credito.', 'error');
        return;
    }

    if (typeof mostrarConfirmModal === 'function') {
        const ok = await mostrarConfirmModal(
            `¿Cancelar la factura ${facturaSeleccionadaNC.numFactura || facturaSeleccionadaNC.id}? Esta accion es irreversible.`,
            { destructivo: true, textoConfirmar: 'Cancelar Factura' }
        );
        if (!ok) return;
    }

    // Marcar todos los items como devueltos (devolucion total)
    (facturaSeleccionadaNC.items || []).forEach((item, idx) => {
        const input = document.getElementById(`devCant-${idx}`);
        if (input) input.value = item.cantidad;
    });
    document.getElementById('devMotivo').value = 'devolucion_ajuste';

    // Procesar como NC
    await procesarNotaCredito();
}

// ============================================
// LIMPIAR / RESETEAR
// ============================================

function limpiarDevolucion() {
    facturaSeleccionadaNC = null;
    document.getElementById('devDetalleFactura').classList.add('hidden');
    document.getElementById('devBuscarInput').value = '';
    document.getElementById('devResultados').classList.add('hidden');
}

function cerrarModalNC() {
    document.getElementById('modalNCExito').classList.remove('show');
}

// ============================================
// HISTORIAL DE NC
// ============================================

async function cargarHistorialNC() {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const ncs = pedidos.filter(p => p.estado === PEDIDO_ESTADOS.NOTA_CREDITO).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const container = document.getElementById('devHistorial');
    const countEl = document.getElementById('devHistorialCount');
    if (countEl) countEl.textContent = `${ncs.length} registros`;

    if (ncs.length === 0) {
        container.innerHTML = '<p class="p-6 text-center text-gray-400 italic text-sm">Sin notas de credito emitidas</p>';
        return;
    }

    container.innerHTML = '';
    ncs.forEach(nc => {
        const cantItems = (nc.items || []).reduce((s, i) => s + Math.abs(i.cantidad), 0);
        const div = document.createElement('div');
        div.className = 'p-5 hover:bg-gray-50 transition-colors border-l-4 border-l-red-400';
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <h4 class="text-sm font-bold text-gray-800">${nc.cliente?.nombre || 'Sin cliente'}</h4>
                    <p class="text-xs text-gray-500 mt-0.5">${formatearFechaAdmin(nc.fecha)} | ${nc.notas || ''}</p>
                    <p class="text-xs font-mono text-gray-400 mt-0.5">${nc.numFactura || nc.id}</p>
                    <p class="text-xs text-gray-400">Ref: ${nc.facturaOrigenNum || nc.facturaOrigenId || 'N/A'}</p>
                </div>
                <div class="text-right">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">NOTA DE CREDITO</span>
                    <p class="text-lg font-bold text-red-600 mt-1">-${formatearGuaranies(Math.abs(nc.total || 0))}</p>
                    <p class="text-xs text-gray-400">${cantItems} unid. devueltas</p>
                </div>
            </div>
            <div class="flex gap-2 mt-3">
                <sl-button variant="neutral" size="small" onclick="reimprimirNC('${nc.id}')">
                    <i data-lucide="printer" class="w-3 h-3"></i> Re-imprimir
                </sl-button>
            </div>`;
        container.appendChild(div);
    });
    lucide.createIcons();
}

// ============================================
// IMPRESION NC (reutiliza logica dual de admin-ventas.js)
// ============================================

function construirTicketNC(nc, clienteInfo) {
    const ruc = clienteInfo?.ruc || nc.cliente?.ruc || '';
    let html = `
        <p style="text-align:center; font-size:13px; font-weight:bold; margin:0 0 2px;">HDV DISTRIBUCIONES</p>
        <p style="text-align:center; font-size:9px; margin:0 0 2px;">RUC: 80000000-0 | Timbrado: 12345678</p>
        <p style="text-align:center; font-size:9px; margin:0 0 6px;">Tel: (0000) 000-000</p>
        <p style="text-align:center; font-weight:bold; font-size:12px; color:#000; margin:0 0 4px;">NOTA DE CREDITO ELECTRONICA</p>
        <p style="text-align:center; font-size:11px; font-weight:bold; margin:0 0 6px;">${nc.numFactura || nc.id}</p>
        <div style="font-size:10px; margin-bottom:6px;">
            <p>Fecha: ${formatearFechaAdmin(nc.fecha)}</p>
            <p>Cliente: ${nc.cliente?.nombre || 'N/A'}</p>
            ${ruc ? `<p>RUC: ${ruc}</p>` : ''}
            <p>Ref. Factura: ${nc.facturaOrigenNum || nc.facturaOrigenId || 'N/A'}</p>
            <p>Motivo: ${nc.notas || ''}</p>
        </div>
        <hr style="border:none; border-top:1px dashed #000; margin:4px 0;">`;

    (nc.items || []).forEach(i => {
        html += `<div style="display:flex; justify-content:space-between; font-size:10px; margin:2px 0;">
            <span style="flex:1;">${Math.abs(i.cantidad)}x ${i.nombre} ${i.presentacion}</span>
            <span style="white-space:nowrap;">-${formatearGuaranies(Math.abs(i.subtotal || 0))}</span>
        </div>`;
    });

    html += `
        <hr style="border:none; border-top:1px dashed #000; margin:4px 0;">
        <div style="font-size:12px; font-weight:bold; text-align:right;">TOTAL NC: -${formatearGuaranies(Math.abs(nc.total || 0))}</div>
        <hr style="border:none; border-top:1px dashed #000; margin:4px 0;">`;

    if (nc.cdc) {
        html += `<p style="text-align:center; font-size:9px; font-weight:bold; margin:4px 0 2px;">CDC:</p>`;
        html += `<p style="text-align:center; font-size:8px; font-family:monospace; word-break:break-all; margin:0 0 6px;">${nc.cdc}</p>`;
        html += `<div style="width:80px; height:80px; border:2px solid #000; margin:4px auto; display:flex; align-items:center; justify-content:center; font-size:8px; text-align:center;">QR<br>SIFEN</div>`;
        html += `<p style="text-align:center; font-size:8px; margin:4px 0 0;">Consulte en: https://ekuatia.set.gov.py</p>`;
    }
    return html;
}

function construirA4NC(nc, clienteInfo) {
    const ruc = clienteInfo?.ruc || nc.cliente?.ruc || '';

    let itemsHTML = '';
    (nc.items || []).forEach((i, idx) => {
        itemsHTML += `<tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:8px 12px; font-size:12px;">${idx + 1}</td>
            <td style="padding:8px 12px; font-size:12px;">${i.nombre} - ${i.presentacion}</td>
            <td style="padding:8px 12px; font-size:12px; text-align:center;">${Math.abs(i.cantidad)}</td>
            <td style="padding:8px 12px; font-size:12px; text-align:right;">${formatearGuaranies(i.precio)}</td>
            <td style="padding:8px 12px; font-size:12px; text-align:right; font-weight:bold; color:#dc2626;">-${formatearGuaranies(Math.abs(i.subtotal || 0))}</td>
        </tr>`;
    });

    return `
        <div style="border-bottom:3px solid #dc2626; padding-bottom:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <h1 style="font-size:20px; font-weight:900; margin:0; color:#111827;">HDV DISTRIBUCIONES</h1>
                <p style="font-size:11px; color:#6b7280; margin:2px 0 0;">RUC: 80000000-0 | Tel: (0000) 000-000</p>
            </div>
            <div style="text-align:right;">
                <p style="font-size:14px; font-weight:700; color:#dc2626; margin:0;">NOTA DE CREDITO ELECTRONICA</p>
                <p style="font-size:16px; font-weight:800; margin:2px 0 0;">${nc.numFactura || nc.id}</p>
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:12px;">
            <div>
                <p style="margin:2px 0;"><strong>Cliente:</strong> ${nc.cliente?.nombre || 'N/A'}</p>
                ${ruc ? `<p style="margin:2px 0;"><strong>RUC:</strong> ${ruc}</p>` : ''}
                <p style="margin:2px 0;"><strong>Motivo:</strong> ${nc.notas || 'N/A'}</p>
            </div>
            <div style="text-align:right;">
                <p style="margin:2px 0;"><strong>Fecha:</strong> ${formatearFechaAdmin(nc.fecha)}</p>
                <p style="margin:2px 0;"><strong>Ref. Factura:</strong> ${nc.facturaOrigenNum || nc.facturaOrigenId || 'N/A'}</p>
                <p style="margin:2px 0;"><strong>CDC Original:</strong> <span style="font-size:10px;">${nc.cdcOriginal || 'N/A'}</span></p>
            </div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
            <thead>
                <tr style="background:#fef2f2; border-bottom:2px solid #dc2626;">
                    <th style="padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase;">#</th>
                    <th style="padding:8px 12px; text-align:left; font-size:11px; text-transform:uppercase;">Descripcion</th>
                    <th style="padding:8px 12px; text-align:center; font-size:11px; text-transform:uppercase;">Cant.</th>
                    <th style="padding:8px 12px; text-align:right; font-size:11px; text-transform:uppercase;">P. Unit.</th>
                    <th style="padding:8px 12px; text-align:right; font-size:11px; text-transform:uppercase;">Monto NC</th>
                </tr>
            </thead>
            <tbody>${itemsHTML}</tbody>
        </table>
        <div style="text-align:right; margin-bottom:16px;">
            <p style="font-size:18px; font-weight:900; margin:8px 0 0; border-top:2px solid #dc2626; padding-top:8px; color:#dc2626;">TOTAL NC: -${formatearGuaranies(Math.abs(nc.total || 0))}</p>
        </div>
        ${nc.cdc ? `
            <div style="margin-top:20px; padding-top:12px; border-top:1px solid #e5e7eb; display:flex; align-items:center; gap:16px;">
                <div style="width:80px; height:80px; border:2px solid #000; display:flex; align-items:center; justify-content:center; font-size:10px; text-align:center; flex-shrink:0;">QR<br>SIFEN</div>
                <div style="font-size:10px;">
                    <p style="margin:0 0 4px;"><strong>CDC NC:</strong> ${nc.cdc}</p>
                    <p style="margin:0 0 4px;"><strong>CDC Factura Original:</strong> ${nc.cdcOriginal || 'N/A'}</p>
                    <p style="margin:0; color:#6b7280;">Consulte este documento en: https://ekuatia.set.gov.py</p>
                </div>
            </div>
        ` : ''}
    `;
}

function imprimirNC(formato) {
    if (!ultimaNCEmitida) return;
    const { notaCredito, clienteInfo } = ultimaNCEmitida;

    let printEl, contentEl;
    let pageStyle = document.getElementById('dynamicPageStyle');
    if (!pageStyle) {
        pageStyle = document.createElement('style');
        pageStyle.id = 'dynamicPageStyle';
        document.head.appendChild(pageStyle);
    }

    if (formato === 'thermal') {
        printEl = document.getElementById('adminPrintThermal');
        contentEl = document.getElementById('adminPrintThermalContent');
        contentEl.innerHTML = construirTicketNC(notaCredito, clienteInfo);
        document.body.classList.add('print-thermal');
        document.body.classList.remove('print-a4');
        pageStyle.textContent = '@page { margin: 0; size: 58mm auto; }';
    } else {
        printEl = document.getElementById('adminPrintA4');
        contentEl = document.getElementById('adminPrintA4Content');
        contentEl.innerHTML = construirA4NC(notaCredito, clienteInfo);
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

// Re-imprimir NC desde historial
async function reimprimirNC(ncId) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const nc = pedidos.find(p => p.id === ncId);
    if (!nc) { mostrarToast('NC no encontrada', 'error'); return; }

    const clienteInfo = productosData.clientes.find(c => c.id === nc.cliente?.id);
    ultimaNCEmitida = { notaCredito: nc, clienteInfo, totalNC: Math.abs(nc.total || 0) };

    // Mostrar modal elegir formato
    document.getElementById('modalElegirImpresion').classList.add('show');

    // Sobreescribir temporalmente la funcion de ejecucion
    window._reimprimirNCActiva = true;
    lucide.createIcons();
}

// Override ejecutarReimpresion para soportar NC
const _ejecutarReimpresionOriginal = typeof ejecutarReimpresion === 'function' ? ejecutarReimpresion : null;

window.ejecutarReimpresion = function(formato) {
    if (window._reimprimirNCActiva && ultimaNCEmitida) {
        window._reimprimirNCActiva = false;
        cerrarModalElegirImpresion();
        imprimirNC(formato);
        return;
    }
    if (_ejecutarReimpresionOriginal) {
        _ejecutarReimpresionOriginal(formato);
    }
};
