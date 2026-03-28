// ============================================
// HDV Admin - Ventas: Templates HTML
// Funciones puras que reciben datos y devuelven strings HTML.
// NO acceden al DOM, localStorage ni globals.
// ============================================

// TODO: Refactor Phase 1 - tplFormatearFechaAdmin ahora en js/utils/formatters.js

// --- Helpers internos ---

function _tplFeIniTimbrado(venc) {
    if (!venc) return '';
    const d = new Date(venc);
    const ini = new Date(d.getTime() - 365 * 24 * 60 * 60 * 1000);
    return ini.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ============================================
// LISTA DE VENTAS
// ============================================

function tplVentaCard(v, zona, telefono, esFactura) {
    const badgeClass = esFactura
        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
        : 'bg-amber-100 text-amber-800 border border-amber-200';
    const badgeText = esFactura ? 'FACTURADO SIFEN' : 'RECIBO INTERNO';
    const borderColor = esFactura ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-amber-400';

    const itemsHTML = (v.items || []).map(i => `
        <div class="flex justify-between text-sm py-1">
            <span>${escapeHTML(i.nombre)} <span class="text-gray-400">(${escapeHTML(i.presentacion)} x ${i.cantidad})</span></span>
            <strong>${formatearGuaranies(i.subtotal)}</strong>
        </div>`).join('');

    const notasHTML = v.notas
        ? `<div class="text-sm text-gray-500 italic mb-3 flex items-start gap-1.5"><i data-lucide="message-square" class="w-3.5 h-3.5 mt-0.5 shrink-0"></i> ${escapeHTML(v.notas)}</div>`
        : '';

    let botonesExtra = '';
    if (esFactura && v.sifen_cdc) {
        botonesExtra = `
            <button class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-500 inline-flex items-center gap-1.5" onclick="ventasCtrl.imprimirKuDE('${v.id}')"><i data-lucide="file-text" class="w-3.5 h-3.5"></i> Imprimir KuDE</button>
            <button class="bg-gray-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-gray-400 inline-flex items-center gap-1" onclick="ventasCtrl.verXMLSifen('${v.id}')" title="Ver XML"><i data-lucide="file-code" class="w-3.5 h-3.5"></i></button>`;
    } else if (esFactura) {
        botonesExtra = `<button class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-500 inline-flex items-center gap-1.5" onclick="ventasCtrl.verXMLSifen('${v.id}')"><i data-lucide="file-code" class="w-3.5 h-3.5"></i> XML SIFEN</button>`;
    }

    return `
        <div class="p-6 hover:bg-gray-50 transition-colors ${borderColor}">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">${escapeHTML(v.cliente?.nombre || 'Sin cliente')}</h3>
                    <div class="text-sm text-gray-500 mt-1 flex items-center gap-1">
                        <i data-lucide="map-pin" class="w-3 h-3"></i> ${escapeHTML(zona)}
                        <span class="mx-1">·</span>
                        <i data-lucide="clock" class="w-3 h-3"></i> ${new Date(v.fecha).toLocaleString('es-PY')}
                    </div>
                    ${esFactura && v.numFactura ? `<p class="text-xs font-mono text-gray-400 mt-1">N° ${v.numFactura}</p>` : ''}
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-bold ${badgeClass}">${badgeText}</span>
            </div>
            <div class="mb-3 space-y-1">${itemsHTML}</div>
            ${notasHTML}
            <div class="flex justify-between items-center pt-3 border-t border-gray-100">
                <span class="text-sm text-gray-500">${v.tipoPago || 'contado'}</span>
                <span class="text-xl font-bold text-gray-900">${formatearGuaranies(v.total)}</span>
            </div>
            <div class="flex gap-2 mt-4 flex-wrap">
                <button class="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-700 inline-flex items-center gap-1.5" onclick="ventasCtrl.abrirReimpresion('${v.id}')"><i data-lucide="printer" class="w-3.5 h-3.5"></i> Re-imprimir</button>
                <button class="bg-[#25D366] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#1fad55] inline-flex items-center gap-1.5" onclick="ventasCtrl.enviarWhatsAppVenta('${v.id}')"><i data-lucide="message-circle" class="w-3.5 h-3.5"></i> WhatsApp</button>
                ${botonesExtra}
            </div>
        </div>`;
}

// ============================================
// TICKET TERMICO 58mm
// ============================================

function tplTicketThermal(pedido, clienteInfo) {
    const ruc = clienteInfo?.ruc || pedido.cliente?.ruc || '';
    const esFactura = pedido.estado === PEDIDO_ESTADOS.FACTURADO;
    const titulo = esFactura ? 'FACTURA ELECTRONICA' : 'RECIBO DE USO INTERNO - NO VALIDO COMO FACTURA';

    let html = `
        <p style="text-align:center; font-size:13px; font-weight:bold; margin:0 0 2px;">HDV DISTRIBUCIONES</p>
        ${esFactura ? `<p style="text-align:center; font-size:9px; margin:0 0 2px;">RUC: 80000000-0 | Timbrado: 12345678</p>` : ''}
        <p style="text-align:center; font-size:9px; margin:0 0 6px;">Tel: (0000) 000-000</p>
        <p style="text-align:center; font-weight:bold; font-size:${esFactura ? '12' : '10'}px; ${esFactura ? '' : 'border:1px solid #000; padding:3px;'} margin:0 0 4px;">${titulo}</p>
        ${esFactura && pedido.numFactura ? `<p style="text-align:center; font-size:11px; font-weight:bold; margin:0 0 6px;">${pedido.numFactura}</p>` : ''}
        <div style="font-size:10px; margin-bottom:6px;">
            <p>Fecha: ${tplFormatearFechaAdmin(pedido.fecha)}</p>
            <p>Cliente: ${escapeHTML(pedido.cliente?.nombre || 'N/A')}</p>
            ${ruc ? `<p>RUC: ${escapeHTML(ruc)}</p>` : ''}
            <p>Pago: ${pedido.tipoPago === 'credito' ? 'Credito' : 'Contado'}</p>
        </div>
        <hr style="border:none; border-top:1px dashed #000; margin:4px 0;">`;

    (pedido.items || []).forEach(i => {
        html += `<div style="display:flex; justify-content:space-between; font-size:10px; margin:2px 0;">
            <span style="flex:1;">${i.cantidad}x ${escapeHTML(i.nombre)} ${escapeHTML(i.presentacion)}</span>
            <span style="white-space:nowrap;">${formatearGuaranies(i.subtotal)}</span>
        </div>`;
    });

    html += `<hr style="border:none; border-top:1px dashed #000; margin:4px 0;">`;
    html += `<div style="font-size:12px; font-weight:bold; text-align:right;">TOTAL: ${formatearGuaranies(pedido.total)}</div>`;

    if (esFactura && pedido.desgloseIVA) {
        const iva = pedido.desgloseIVA;
        html += `<hr style="border:none; border-top:1px dashed #000; margin:4px 0;">`;
        html += `<div style="font-size:9px;">`;
        html += `<div style="display:flex; justify-content:space-between;"><span>Sub. Exentas:</span><span>${formatearGuaranies(iva.totalExentas)}</span></div>`;
        html += `<div style="display:flex; justify-content:space-between;"><span>Sub. IVA 5%:</span><span>${formatearGuaranies(iva.totalGravada5)}</span></div>`;
        html += `<div style="display:flex; justify-content:space-between;"><span>Sub. IVA 10%:</span><span>${formatearGuaranies(iva.totalGravada10)}</span></div>`;
        html += `<div style="display:flex; justify-content:space-between; font-weight:bold; border-top:1px dotted #000; padding-top:2px; margin-top:2px;"><span>Liq. IVA 5%:</span><span>${formatearGuaranies(iva.liqIva5)}</span></div>`;
        html += `<div style="display:flex; justify-content:space-between; font-weight:bold;"><span>Liq. IVA 10%:</span><span>${formatearGuaranies(iva.liqIva10)}</span></div>`;
        html += `<div style="display:flex; justify-content:space-between; font-weight:bold; border-top:1px dotted #000; padding-top:2px; margin-top:2px;"><span>Total IVA:</span><span>${formatearGuaranies(iva.totalIva)}</span></div>`;
        html += `</div>`;
    }
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

// ============================================
// DOCUMENTO A4
// ============================================

function tplDocA4(pedido, clienteInfo) {
    const ruc = clienteInfo?.ruc || pedido.cliente?.ruc || '';
    const esFactura = pedido.estado === PEDIDO_ESTADOS.FACTURADO;
    const titulo = esFactura ? 'FACTURA ELECTRONICA' : 'RECIBO DE USO INTERNO';

    let itemsHTML = '';
    (pedido.items || []).forEach((i, idx) => {
        itemsHTML += `<tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:8px 12px; font-size:12px;">${idx + 1}</td>
            <td style="padding:8px 12px; font-size:12px;">${escapeHTML(i.nombre)} - ${escapeHTML(i.presentacion)}</td>
            <td style="padding:8px 12px; font-size:12px; text-align:center;">${i.cantidad}</td>
            <td style="padding:8px 12px; font-size:12px; text-align:right;">${formatearGuaranies(i.precio)}</td>
            <td style="padding:8px 12px; font-size:12px; text-align:right; font-weight:bold;">${formatearGuaranies(i.subtotal)}</td>
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
                <p style="margin:2px 0;"><strong>Cliente:</strong> ${escapeHTML(pedido.cliente?.nombre || 'N/A')}</p>
                ${ruc ? `<p style="margin:2px 0;"><strong>RUC:</strong> ${escapeHTML(ruc)}</p>` : ''}
                <p style="margin:2px 0;"><strong>Direccion:</strong> ${escapeHTML(clienteInfo?.direccion || clienteInfo?.zona || '')}</p>
            </div>
            <div style="text-align:right;">
                <p style="margin:2px 0;"><strong>Fecha:</strong> ${tplFormatearFechaAdmin(pedido.fecha)}</p>
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
            <p style="font-size:18px; font-weight:900; margin:8px 0 0; border-top:2px solid #111827; padding-top:8px;">TOTAL: ${formatearGuaranies(pedido.total)}</p>
        </div>
        ${esFactura && pedido.desgloseIVA ? `
            <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
                <table style="border-collapse:collapse; font-size:11px;">
                    <tr><td style="padding:2px 12px;">Sub. Exentas</td><td style="padding:2px 12px; text-align:right;">${formatearGuaranies(pedido.desgloseIVA.totalExentas)}</td></tr>
                    <tr><td style="padding:2px 12px;">Sub. Gravadas 5%</td><td style="padding:2px 12px; text-align:right;">${formatearGuaranies(pedido.desgloseIVA.totalGravada5)}</td></tr>
                    <tr><td style="padding:2px 12px;">Sub. Gravadas 10%</td><td style="padding:2px 12px; text-align:right;">${formatearGuaranies(pedido.desgloseIVA.totalGravada10)}</td></tr>
                    <tr style="border-top:1px solid #d1d5db;"><td style="padding:2px 12px; font-weight:bold;">Liquidacion IVA 5%</td><td style="padding:2px 12px; text-align:right; font-weight:bold;">${formatearGuaranies(pedido.desgloseIVA.liqIva5)}</td></tr>
                    <tr><td style="padding:2px 12px; font-weight:bold;">Liquidacion IVA 10%</td><td style="padding:2px 12px; text-align:right; font-weight:bold;">${formatearGuaranies(pedido.desgloseIVA.liqIva10)}</td></tr>
                    <tr style="border-top:2px solid #111827;"><td style="padding:4px 12px; font-weight:900;">Total IVA</td><td style="padding:4px 12px; text-align:right; font-weight:900;">${formatearGuaranies(pedido.desgloseIVA.totalIva)}</td></tr>
                </table>
            </div>
        ` : ''}
        ${pedido.notas ? `<p style="font-size:11px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:8px;">Notas: ${escapeHTML(pedido.notas)}</p>` : ''}
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

// ============================================
// MODAL XML SIFEN (e-Kuatia Simulador)
// ============================================

function tplXMLSifenModal(result) {
    const xmlEscaped = (result.xml || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const soapEscaped = (result.soap_simulado || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const desglose = result.desglose || {};

    return `
        <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col" style="animation: slideUp 0.2s ease-out;">
            <!-- Header -->
            <div class="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-t-2xl">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="text-lg font-bold text-white flex items-center gap-2">
                            <i data-lucide="shield-check" class="w-5 h-5"></i> Simulador e-Kuatia (SIFEN v150)
                        </h3>
                        <p class="text-blue-100 text-xs mt-1">Modo prueba — sin certificado digital</p>
                    </div>
                    <button onclick="document.getElementById('modalXMLSifen').remove()" class="text-white/70 hover:text-white p-1">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>

            <!-- CDC + Info -->
            <div class="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">CDC (44 digitos)</span>
                    <button onclick="navigator.clipboard.writeText('${result.cdc || ''}').then(()=>mostrarToast('CDC copiado','success'))" class="text-blue-500 hover:text-blue-700" title="Copiar CDC">
                        <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
                <p class="font-mono text-lg font-bold text-gray-900 tracking-wider break-all leading-relaxed">${result.cdc || 'N/A'}</p>
                <div class="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm text-gray-600">
                    <span><strong>Factura:</strong> ${result.numFactura || 'N/A'}</span>
                    <span><strong>Emisor:</strong> ${escapeHTML(result.empresa || '')}</span>
                    <span><strong>Receptor:</strong> ${escapeHTML(result.cliente || '')}</span>
                    <span><strong>Total:</strong> ${formatearGuaranies(result.total)}</span>
                    <span><strong>Fecha:</strong> ${result.fechaEmision || ''}</span>
                </div>
                ${result.qr_url ? `
                <div class="mt-3 flex items-center gap-2">
                    <i data-lucide="qr-code" class="w-4 h-4 text-gray-400"></i>
                    <a href="${result.qr_url}" target="_blank" rel="noopener" class="text-blue-600 hover:text-blue-800 text-xs font-medium underline underline-offset-2 break-all">Consultar en e-Kuatia (enlace QR simulado)</a>
                </div>` : ''}
                <div class="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs text-gray-500">
                    <span>Exentas: ${formatearGuaranies(desglose.totalExentas)}</span>
                    <span>Grav. 5%: ${formatearGuaranies(desglose.totalGravada5)}</span>
                    <span>Grav. 10%: ${formatearGuaranies(desglose.totalGravada10)}</span>
                    <span>IVA 5%: ${formatearGuaranies(desglose.totalIVA5)}</span>
                    <span>IVA 10%: ${formatearGuaranies(desglose.totalIVA10)}</span>
                    <span class="font-bold text-gray-700">Total IVA: ${formatearGuaranies(desglose.totalIVA)}</span>
                </div>
            </div>

            <!-- Tabs -->
            <div class="flex border-b border-gray-200 px-6 pt-2 gap-1" id="sifenTabs">
                <button onclick="ventasCtrl.sifenCambiarTab('xml')" id="sifenTabXml" class="px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 border-blue-600 text-blue-600 bg-blue-50">XML DTE</button>
                <button onclick="ventasCtrl.sifenCambiarTab('soap')" id="sifenTabSoap" class="px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 border-transparent text-gray-500 hover:text-gray-700">Sobre SOAP</button>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-auto p-4">
                <pre id="sifenContentXml" class="bg-gray-900 text-green-400 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">${xmlEscaped}</pre>
                <pre id="sifenContentSoap" class="bg-gray-900 text-amber-400 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed hidden">${soapEscaped}</pre>
            </div>

            <!-- Footer -->
            <div class="flex gap-3 px-6 py-4 border-t border-gray-100">
                <button onclick="ventasCtrl.copiarXMLSifen()" class="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-700 inline-flex items-center gap-1.5">
                    <i data-lucide="copy" class="w-3.5 h-3.5"></i> Copiar XML
                </button>
                <button onclick="ventasCtrl.descargarXMLSifen()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-500 inline-flex items-center gap-1.5">
                    <i data-lucide="download" class="w-3.5 h-3.5"></i> Descargar .xml
                </button>
                <button onclick="ventasCtrl.descargarSOAPSifen()" class="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-500 inline-flex items-center gap-1.5">
                    <i data-lucide="download" class="w-3.5 h-3.5"></i> Descargar SOAP
                </button>
                <button onclick="document.getElementById('modalXMLSifen').remove()" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-300 ml-auto">Cerrar</button>
            </div>
        </div>
    `;
}

// ============================================
// MODAL KuDE (selector de formato impresion)
// ============================================

function tplKuDEModal(pedidoId, numFactura, cdc, clienteNombre, total, qrUrl) {
    return `
        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full flex flex-col" style="animation: slideUp 0.2s ease-out;">
            <div class="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-emerald-600 to-teal-700 rounded-t-2xl">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="text-lg font-bold text-white flex items-center gap-2">
                            <i data-lucide="file-text" class="w-5 h-5"></i> KuDE - Representacion Grafica
                        </h3>
                        <p class="text-emerald-100 text-xs mt-1">Factura Electronica SIFEN</p>
                    </div>
                    <button onclick="document.getElementById('modalKuDE').remove()" class="text-white/70 hover:text-white p-1">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>

            <div class="px-6 py-5 space-y-4">
                <div>
                    <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Factura N°</p>
                    <p class="text-xl font-bold text-gray-900">${numFactura}</p>
                </div>
                <div>
                    <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">CDC (44 digitos)</p>
                    <p class="font-mono text-sm font-bold text-gray-800 break-all leading-relaxed bg-gray-50 p-3 rounded-lg">${cdc}</p>
                </div>
                <div class="flex justify-between text-sm">
                    <div><span class="text-gray-500">Cliente:</span> <strong>${escapeHTML(clienteNombre)}</strong></div>
                    <div><span class="text-gray-500">Total:</span> <strong>${formatearGuaranies(total)}</strong></div>
                </div>
                ${qrUrl ? `
                <div class="bg-gray-50 p-3 rounded-lg flex items-center gap-2">
                    <i data-lucide="qr-code" class="w-4 h-4 text-gray-400 shrink-0"></i>
                    <a href="${qrUrl}" target="_blank" rel="noopener" class="text-blue-600 hover:text-blue-800 text-xs underline underline-offset-2 break-all">Verificar en e-Kuatia</a>
                </div>` : ''}
            </div>

            <div class="flex gap-3 px-6 py-4 border-t border-gray-100">
                <button onclick="ventasCtrl.ejecutarImpresionKuDE('${pedidoId}', 'thermal')" class="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-700 inline-flex items-center gap-1.5 flex-1 justify-center">
                    <i data-lucide="receipt" class="w-3.5 h-3.5"></i> Ticket 58mm
                </button>
                <button onclick="ventasCtrl.ejecutarImpresionKuDE('${pedidoId}', 'a4')" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-500 inline-flex items-center gap-1.5 flex-1 justify-center">
                    <i data-lucide="file-text" class="w-3.5 h-3.5"></i> KuDE A4
                </button>
            </div>
        </div>
    `;
}

// ============================================
// KuDE A4 — Representacion Grafica Oficial SET
// ============================================

function tplKuDEA4(pedido, clienteInfo, empresa) {
    const cdc = pedido.sifen_cdc || pedido.cdc || '';
    const numFactura = pedido.sifen_numFactura || pedido.numFactura || '';
    const rucCliente = clienteInfo?.ruc || pedido.cliente?.ruc || '';
    const tipoDoc = clienteInfo?.tipo_documento || 'RUC';
    const razonCliente = clienteInfo?.razon_social || pedido.cliente?.razon_social || pedido.cliente?.nombre || '';
    const dirCliente = clienteInfo?.direccion || pedido.cliente?.direccion || '';
    const esCredito = pedido.tipoPago === 'credito';
    const fechaEmi = pedido.sifen_fecha_generacion || pedido.fecha || '';
    const fechaStr = fechaEmi ? new Date(fechaEmi).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const horaStr = fechaEmi ? new Date(fechaEmi).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '';

    const iva = pedido.desgloseIVA || {};
    const totalExe = iva.totalExentas || 0;
    const totalG5 = iva.totalGravada5 || 0;
    const totalG10 = iva.totalGravada10 || 0;
    const liqIva5 = iva.liqIva5 || 0;
    const liqIva10 = iva.liqIva10 || 0;
    const totalIva = iva.totalIva || (liqIva5 + liqIva10);

    const items = pedido.items || [];
    let itemsHTML = '';
    items.forEach((it, idx) => {
        const tipo = (it.tipo_impuesto || '10').toString();
        const colExe = (tipo === 'exenta' || tipo === '0') ? (it.subtotal || 0) : 0;
        const col5 = tipo === '5' ? (it.subtotal || 0) : 0;
        const col10 = (tipo === '10' || tipo === 'iva10' || (!tipo || tipo === '10')) ? (it.subtotal || 0) : 0;
        itemsHTML += `<tr>
            <td style="border:1px solid #000; padding:3px 5px; text-align:center; font-size:10px;">${it.productoId || (idx + 1)}</td>
            <td style="border:1px solid #000; padding:3px 5px; font-size:10px;">${escapeHTML(it.nombre || '')} ${escapeHTML(it.presentacion || '')}</td>
            <td style="border:1px solid #000; padding:3px 5px; text-align:center; font-size:10px;">UNI</td>
            <td style="border:1px solid #000; padding:3px 5px; text-align:center; font-size:10px;">${it.cantidad || 0}</td>
            <td style="border:1px solid #000; padding:3px 5px; text-align:right; font-size:10px;">${(it.precio || 0).toLocaleString()}</td>
            <td style="border:1px solid #000; padding:3px 5px; text-align:right; font-size:10px;">${colExe > 0 ? colExe.toLocaleString() : ''}</td>
            <td style="border:1px solid #000; padding:3px 5px; text-align:right; font-size:10px;">${col5 > 0 ? col5.toLocaleString() : ''}</td>
            <td style="border:1px solid #000; padding:3px 5px; text-align:right; font-size:10px;">${col10 > 0 ? col10.toLocaleString() : ''}</td>
        </tr>`;
    });

    const filasMin = Math.max(0, 8 - items.length);
    for (let i = 0; i < filasMin; i++) {
        itemsHTML += `<tr><td style="border:1px solid #000; padding:3px 5px;">&nbsp;</td><td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td></tr>`;
    }

    const totalOpe = pedido.total || 0;

    return `
    <div id="kudeA4Container" style="font-family: Arial, Helvetica, sans-serif; color: #000; width: 190mm; margin: 0 auto; font-size: 11px; line-height: 1.4;">

        <!-- CABECERA: Empresa + Datos Fiscales -->
        <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-bottom:0;">
            <tr>
                <td style="width:55%; border-right:2px solid #000; padding:10px 12px; vertical-align:top;">
                    <div style="font-size:18px; font-weight:900; margin-bottom:4px;">${escapeHTML(empresa.razonSocial)}</div>
                    ${empresa.nombreFantasia ? `<div style="font-size:12px; font-weight:bold; margin-bottom:6px;">${escapeHTML(empresa.nombreFantasia)}</div>` : ''}
                    <div style="font-size:10px; line-height:1.6;">
                        ${empresa.direccion ? `<div>${escapeHTML(empresa.direccion)}</div>` : ''}
                        ${empresa.telefono ? `<div>Tel: ${escapeHTML(empresa.telefono)}</div>` : ''}
                        ${empresa.email ? `<div>Email: ${escapeHTML(empresa.email)}</div>` : ''}
                        ${empresa.actividad ? `<div>Act. Econ.: ${escapeHTML(empresa.actividad)}</div>` : ''}
                    </div>
                </td>
                <td style="width:45%; padding:10px 12px; vertical-align:top;">
                    <div style="font-size:10px; line-height:1.8;">
                        <div><strong>RUC:</strong> ${empresa.ruc}</div>
                        <div><strong>Timbrado N°:</strong> ${empresa.timbrado}</div>
                        <div><strong>Inicio de Vigencia:</strong> ${_tplFeIniTimbrado(empresa.timbradoVenc)}</div>
                    </div>
                    <div style="text-align:center; margin:8px 0 4px; padding:6px; border:2px solid #000; font-size:14px; font-weight:900; letter-spacing:0.5px;">
                        FACTURA ELECTR&Oacute;NICA
                    </div>
                    <div style="text-align:center; font-size:16px; font-weight:900; letter-spacing:1px;">
                        ${numFactura}
                    </div>
                </td>
            </tr>
        </table>

        <!-- DATOS DEL CLIENTE -->
        <table style="width:100%; border-collapse:collapse; border:2px solid #000; border-top:none;">
            <tr>
                <td style="width:50%; padding:4px 10px; border-bottom:1px solid #000; border-right:1px solid #000; font-size:10px;">
                    <strong>Fecha de Emisi&oacute;n:</strong> ${fechaStr} ${horaStr}
                </td>
                <td style="width:50%; padding:4px 10px; border-bottom:1px solid #000; font-size:10px;">
                    <strong>Condici&oacute;n de Venta:</strong> ${esCredito ? 'CR&Eacute;DITO' : 'CONTADO'}
                </td>
            </tr>
            <tr>
                <td style="padding:4px 10px; border-bottom:1px solid #000; border-right:1px solid #000; font-size:10px;">
                    <strong>${escapeHTML(tipoDoc)}:</strong> ${escapeHTML(rucCliente)}
                </td>
                <td style="padding:4px 10px; border-bottom:1px solid #000; font-size:10px;">
                    <strong>Nombre / Raz&oacute;n Social:</strong> ${escapeHTML(razonCliente)}
                </td>
            </tr>
            <tr>
                <td style="padding:4px 10px; border-right:1px solid #000; font-size:10px;">
                    <strong>Direcci&oacute;n:</strong> ${escapeHTML(dirCliente)}
                </td>
                <td style="padding:4px 10px; font-size:10px;">
                    <strong>Moneda:</strong> Guaran&iacute; (PYG)
                </td>
            </tr>
        </table>

        <!-- TABLA DE PRODUCTOS -->
        <table style="width:100%; border-collapse:collapse; margin-top:-1px;">
            <thead>
                <tr style="background:#f0f0f0;">
                    <th style="border:2px solid #000; padding:5px 4px; font-size:9px; text-align:center; width:8%;">C&oacute;d.</th>
                    <th style="border:2px solid #000; padding:5px 4px; font-size:9px; text-align:center; width:30%;">Descripci&oacute;n</th>
                    <th style="border:2px solid #000; padding:5px 4px; font-size:9px; text-align:center; width:7%;">U.M.</th>
                    <th style="border:2px solid #000; padding:5px 4px; font-size:9px; text-align:center; width:7%;">Cant.</th>
                    <th style="border:2px solid #000; padding:5px 4px; font-size:9px; text-align:center; width:12%;">P. Unit.</th>
                    <th style="border:2px solid #000; padding:5px 4px; font-size:9px; text-align:center; width:12%;">Exentas</th>
                    <th style="border:2px solid #000; padding:5px 4px; font-size:9px; text-align:center; width:12%;">5%</th>
                    <th style="border:2px solid #000; padding:5px 4px; font-size:9px; text-align:center; width:12%;">10%</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHTML}
            </tbody>
        </table>

        <!-- TOTALES -->
        <table style="width:100%; border-collapse:collapse; margin-top:-1px;">
            <tr>
                <td style="width:48%; border:2px solid #000; padding:6px 10px; vertical-align:top; font-size:10px;">
                    <div><strong>Subtotal:</strong> ${formatearGuaranies(totalOpe)}</div>
                </td>
                <td style="width:52%; border:2px solid #000; border-left:none; padding:0; vertical-align:top;">
                    <table style="width:100%; border-collapse:collapse; font-size:10px;">
                        <tr>
                            <td style="padding:4px 8px; border-bottom:1px solid #000;"><strong>Total Operaci&oacute;n:</strong></td>
                            <td style="padding:4px 8px; border-bottom:1px solid #000; text-align:right; font-weight:bold;">${formatearGuaranies(totalOpe)}</td>
                        </tr>
                        <tr>
                            <td style="padding:4px 8px; border-bottom:1px solid #000;">Sub. Exentas:</td>
                            <td style="padding:4px 8px; border-bottom:1px solid #000; text-align:right;">${formatearGuaranies(totalExe)}</td>
                        </tr>
                        <tr>
                            <td style="padding:4px 8px; border-bottom:1px solid #000;">Sub. Gravadas 5%:</td>
                            <td style="padding:4px 8px; border-bottom:1px solid #000; text-align:right;">${formatearGuaranies(totalG5)}</td>
                        </tr>
                        <tr>
                            <td style="padding:4px 8px; border-bottom:1px solid #000;">Sub. Gravadas 10%:</td>
                            <td style="padding:4px 8px; border-bottom:1px solid #000; text-align:right;">${formatearGuaranies(totalG10)}</td>
                        </tr>
                        <tr>
                            <td style="padding:4px 8px; border-bottom:1px solid #000;">Liquidaci&oacute;n IVA 5%:</td>
                            <td style="padding:4px 8px; border-bottom:1px solid #000; text-align:right;">${formatearGuaranies(liqIva5)}</td>
                        </tr>
                        <tr>
                            <td style="padding:4px 8px; border-bottom:1px solid #000;">Liquidaci&oacute;n IVA 10%:</td>
                            <td style="padding:4px 8px; border-bottom:1px solid #000; text-align:right;">${formatearGuaranies(liqIva10)}</td>
                        </tr>
                        <tr>
                            <td style="padding:5px 8px; font-weight:900; font-size:12px;">TOTAL IVA:</td>
                            <td style="padding:5px 8px; text-align:right; font-weight:900; font-size:12px;">${formatearGuaranies(totalIva)}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <!-- PIE: QR + CDC + LEGAL -->
        <table style="width:100%; border-collapse:collapse; border:2px solid #000; border-top:none; margin-top:-1px;">
            <tr>
                <td style="width:120px; padding:10px; vertical-align:top; border-right:1px solid #000;">
                    <div id="kudeQRCode" style="width:100px; height:100px;"></div>
                </td>
                <td style="padding:10px; vertical-align:top; font-size:9px; line-height:1.5;">
                    <div style="margin-bottom:6px;">
                        Consulte la validez de esta Factura Electr&oacute;nica con el CDC impreso abajo en:<br>
                        <strong>https://ekuatia.set.gov.py/consultas/</strong>
                    </div>
                    <div style="margin-bottom:8px;">
                        <strong style="font-size:8px; letter-spacing:0.3px;">CDC:</strong><br>
                        <span style="font-family:'Courier New',monospace; font-size:13px; font-weight:900; letter-spacing:1.5px; word-break:break-all;">${cdc}</span>
                    </div>
                    <div style="border-top:1px solid #000; padding-top:6px; font-size:8px; font-weight:bold; text-transform:uppercase; text-align:center; letter-spacing:0.3px;">
                        Este documento es una representaci&oacute;n gr&aacute;fica de un Documento Electr&oacute;nico (XML)
                    </div>
                </td>
            </tr>
        </table>
    </div>`;
}
