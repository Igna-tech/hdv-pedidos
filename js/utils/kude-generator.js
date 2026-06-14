// ============================================
// HDV — Generador KuDE (Representación Gráfica DTE SIFEN)
// Genera PDF real con jsPDF + autoTable, fiel al formato e-Kuatia'i.
// Requiere: jsPDF (admin.html CDN), ventas-data.js, sanitizer.js, dialogs.js
// ============================================

async function _kudeAsDataUrl(url) {
    if (!url) return '';
    try {
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) return '';
        const blob = await res.blob();
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload  = e => resolve(e.target.result);
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
        });
    } catch(e) { return ''; }
}

async function _kudeQrDataUrl(text) {
    if (!text) return '';
    if (typeof QRCode === 'undefined') {
        await new Promise(resolve => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
            s.onload = resolve; s.onerror = resolve;
            document.head.appendChild(s);
        });
    }
    if (typeof QRCode === 'undefined') return '';
    return new Promise(resolve => {
        try {
            const canvas = document.createElement('canvas');
            new QRCode(canvas, {
                text, width: 120, height: 120,
                colorDark: '#000000', colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
            setTimeout(() => resolve(canvas.toDataURL('image/png')), 200);
        } catch(e) { resolve(''); }
    });
}

async function _kudeLoadAutoTable() {
    if (typeof window.jspdf === 'undefined') return false;
    const { jsPDF } = window.jspdf;
    const test = new jsPDF();
    if (typeof test.autoTable === 'function') return true;
    return new Promise(resolve => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
    });
}

async function _kudeImgDims(dataUrl) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 100, h: 50 });
        img.src = dataUrl;
    });
}

function _kudeFeIniTimbrado(venc) {
    if (!venc) return '';
    const d   = new Date(venc);
    const ini = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
    return ini.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function _kudeTipoDocLabel(pedido) {
    const id = pedido.id || '';
    const tc = pedido.tipo_comprobante || '';
    if (id.startsWith('NC-')  || tc === 'nota_credito_electronica')  return 'NOTA DE CRÉDITO ELECTRÓNICA';
    if (id.startsWith('NRE-') || tc === 'nota_remision_electronica') return 'NOTA DE REMISIÓN ELECTRÓNICA';
    return 'FACTURA ELECTRÓNICA';
}

function _kudeFmt(n) { return (Number(n) || 0).toLocaleString('es-PY'); }

async function generarKudePDF(pedidoId) {
    if (!pedidoId) return;

    if (typeof window.jspdf === 'undefined') {
        mostrarToast('jsPDF no disponible', 'error'); return;
    }

    const pedido = await ventasDataBuscarPedido(pedidoId);
    if (!pedido) { mostrarToast('Documento no encontrado', 'error'); return; }

    const clienteInfo = ventasDataBuscarCliente(pedido.cliente?.id);
    const empresa     = ventasDataObtenerEmpresa();

    const cdc     = pedido.sifen_cdc || pedido.cdc || pedido.cdc_nc || '';
    const numDoc  = pedido.numFactura || pedido.sifen_numFactura || pedido.id || '';
    const tipoLbl = _kudeTipoDocLabel(pedido);
    const tipoTxt = tipoLbl.includes('CRÉDITO') ? 'Nota de Crédito Electrónica'
                  : tipoLbl.includes('REMISIÓN') ? 'Nota de Remisión Electrónica'
                  : 'Factura Electrónica';

    const fechaEmi = pedido.sifen_fecha_generacion || pedido.fecha || '';
    const fechaStr = fechaEmi
        ? new Date(fechaEmi).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';

    const rucCliente    = clienteInfo?.ruc          || pedido.cliente?.ruc       || '';
    const nombreCliente = clienteInfo?.razon_social  || clienteInfo?.nombre || pedido.cliente?.nombre || '';
    const dirCliente    = clienteInfo?.direccion     || pedido.cliente?.direccion || '';
    const telCliente    = clienteInfo?.telefono      || pedido.cliente?.telefono  || '';
    const emailCliente  = clienteInfo?.email         || pedido.cliente?.email     || '';
    const esCredito     = pedido.tipoPago === 'credito' || pedido.condicion_pago === 'credito';
    const feIni         = _kudeFeIniTimbrado(empresa.timbradoVenc);

    // Cargar recursos en paralelo
    const [, qrDataUrl, logoDataUrl] = await Promise.all([
        _kudeLoadAutoTable(),
        _kudeQrDataUrl(cdc),
        _kudeAsDataUrl(empresa.logo_url)
    ]);

    // Calcular IVA (con fallback desde items si no hay desgloseIVA)
    const items = pedido.items || [];
    const iva   = pedido.desgloseIVA || {};
    let subExe   = iva.totalExentas   || 0;
    let sub5     = iva.totalGravada5  || 0;
    let sub10    = iva.totalGravada10 || 0;
    let liqIva5  = iva.liqIva5  || 0;
    let liqIva10 = iva.liqIva10 || 0;
    let totalIva = iva.totalIva || 0;

    if (!subExe && !sub5 && !sub10 && items.length > 0) {
        items.forEach(it => {
            const tipo = String(it.tipo_impuesto || '10').toLowerCase();
            const s = it.subtotal ?? ((it.precio || 0) * (it.cantidad || 0));
            if (tipo === 'exenta' || tipo === '0') subExe += s;
            else if (tipo === '5') sub5 += s;
            else sub10 += s;
        });
        liqIva5  = Math.round(sub5  / 21);
        liqIva10 = Math.round(sub10 / 11);
        totalIva = liqIva5 + liqIva10;
    } else if (!totalIva) {
        totalIva = liqIva5 + liqIva10;
    }
    const totalOpe = pedido.total || 0;

    // ===== CREAR DOCUMENTO =====
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const ML = 10;   // margen izquierdo/derecho
    const MT = 10;   // margen superior
    const PW = 190;  // ancho útil (210 - 20)

    const BLACK      = [0, 0, 0];
    const GRAY_BG    = [240, 240, 240];
    const BLUE_BG    = [220, 232, 248];
    const BLUE_BDR   = [170, 196, 232];
    const BLUE_TEXT  = [26, 86, 176];

    // ===== ENCABEZADO =====
    const HDR_H  = 38;
    const LEFT_W = 112;
    const RIGHT_W = PW - LEFT_W;  // 78mm

    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.5);
    doc.rect(ML, MT, PW, HDR_H);
    doc.line(ML + LEFT_W, MT, ML + LEFT_W, MT + HDR_H);

    // — Celda izquierda: logo + datos empresa —
    const cellCX = ML + LEFT_W / 2;
    let ly = MT + 2;

    if (logoDataUrl) {
        const dims = await _kudeImgDims(logoDataUrl);
        const maxW = 52, maxH = 18;
        const ratio = Math.min(maxW / dims.w, maxH / dims.h);
        const lw = Math.round(dims.w * ratio * 10) / 10;
        const lh = Math.round(dims.h * ratio * 10) / 10;
        const imgFmt = logoDataUrl.startsWith('data:image/webp') ? 'WEBP'
                     : logoDataUrl.startsWith('data:image/png')  ? 'PNG' : 'JPEG';
        doc.addImage(logoDataUrl, imgFmt, ML + (LEFT_W - lw) / 2, ly, lw, lh, '', 'FAST');
        ly += lh + 2;
    }

    doc.setTextColor(...BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(empresa.razonSocial || 'HDV DISTRIBUCIONES E.A.S.', cellCX, ly + 4, { align: 'center', maxWidth: LEFT_W - 4 });
    ly += 7;

    if (empresa.nombreFantasia && empresa.nombreFantasia !== empresa.razonSocial) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(empresa.nombreFantasia, cellCX, ly, { align: 'center', maxWidth: LEFT_W - 4 });
        ly += 4;
    }

    const addrLine = [empresa.direccion, empresa.telefono ? 'TELEF. ' + empresa.telefono : ''].filter(Boolean).join(' - ');
    if (addrLine) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const wrAddr = doc.splitTextToSize(addrLine, LEFT_W - 4);
        doc.text(wrAddr, cellCX, ly, { align: 'center' });
        ly += wrAddr.length * 3.8;
    }

    if (empresa.actividad) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        const wrAct = doc.splitTextToSize(empresa.actividad.toUpperCase(), LEFT_W - 4);
        doc.text(wrAct, cellCX, ly, { align: 'center' });
    }

    // — Celda derecha: timbrado + recuadro tipo/número —
    const RX = ML + PW;
    let ry = MT + 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    doc.text(`TIMBRADO N° ${empresa.timbrado || ''}`, RX - 3, ry, { align: 'right' });
    ry += 4.5;

    doc.setFont('helvetica', 'normal');
    if (feIni) {
        doc.text(`Fecha Inicio Vigencia: ${feIni}`, RX - 3, ry, { align: 'right' });
        ry += 4;
    }
    doc.text(`RUC ${empresa.ruc || ''}`, RX - 3, ry, { align: 'right' });
    ry += 6;

    // Recuadro que contiene tipo de documento + número
    const BOX_X = ML + LEFT_W + 3;
    const BOX_W = RIGHT_W - 6;
    const BOX_H = 16;
    doc.setLineWidth(0.5);
    doc.setDrawColor(...BLACK);
    doc.rect(BOX_X, ry, BOX_W, BOX_H);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(tipoLbl, BOX_X + BOX_W / 2, ry + 5.5, { align: 'center' });
    doc.setFontSize(10);
    doc.text(numDoc, BOX_X + BOX_W / 2, ry + 12, { align: 'center' });

    // ===== DATOS RECEPTOR =====
    let y = MT + HDR_H;
    const ROW_H = 6;
    const C1 = 48, C2 = 52, C3 = 42, C4 = 48;  // sum = 190

    const condContado = esCredito ? '[ ]' : '[X]';
    const condCredito = esCredito ? '[X]' : '[ ]';

    const ncRef = (pedido.tipo_comprobante === 'nota_credito_electronica' && pedido.factura_referenciada_id)
        ? `Ref: FAC ${pedido.factura_referenciada_id}${pedido.motivo_emision ? ' — ' + pedido.motivo_emision : ''}`
        : null;

    const recRows = [
        ...(ncRef ? [['Referencia NC:', ncRef, '', '']] : []),
        ['Fecha de emisión:', fechaStr, 'Tipo de transacción:', 'Venta de mercancía'],
        ['RUC/Doc. de Identidad N°:', rucCliente, 'Condición de venta:', `Contado ${condContado}  Crédito ${condCredito}`],
        ['Nombre o Razón Social:', nombreCliente, '', ''],
        ['Dirección:', dirCliente, '', ''],
        ['Teléfono:', telCliente, '', ''],
        ['Correo Electrónico:', emailCliente, '', ''],
    ];

    doc.setLineWidth(0.2);
    doc.setDrawColor(...BLACK);

    recRows.forEach((row, i) => {
        const ry2  = y + i * ROW_H;
        const txtY = ry2 + ROW_H * 0.65;
        doc.rect(ML, ry2, PW, ROW_H);
        doc.line(ML + C1,          ry2, ML + C1,          ry2 + ROW_H);
        doc.line(ML + C1 + C2,     ry2, ML + C1 + C2,     ry2 + ROW_H);
        doc.line(ML + C1 + C2 + C3, ry2, ML + C1 + C2 + C3, ry2 + ROW_H);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...BLACK);
        doc.text(row[0], ML + 1.5, txtY);
        doc.setFont('helvetica', 'normal');
        doc.text(doc.splitTextToSize(String(row[1] || ''), C2 - 2)[0] || '', ML + C1 + 1.5, txtY);
        if (row[2]) {
            doc.setFont('helvetica', 'bold');
            doc.text(row[2], ML + C1 + C2 + 1.5, txtY);
        }
        if (row[3]) {
            doc.setFont('helvetica', 'normal');
            doc.text(String(row[3]), ML + C1 + C2 + C3 + 1.5, txtY);
        }
    });

    y += recRows.length * ROW_H;

    // ===== TABLA DE ÍTEMS =====
    const esNRE = (pedido.id || '').startsWith('NRE-') || pedido.tipo_comprobante === 'nota_remision_electronica';

    const tblStyles = {
        fontSize: 8,
        cellPadding: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 },
        lineColor: BLACK,
        lineWidth: 0.2,
        textColor: BLACK,
        overflow: 'linebreak',
    };
    const hdStyles = {
        fillColor: GRAY_BG,
        textColor: BLACK,
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 7.5,
        lineColor: BLACK,
        lineWidth: 0.2,
    };

    if (esNRE) {
        doc.autoTable({
            startY: y, margin: { left: ML, right: ML }, tableWidth: PW,
            head: [['COD.', 'CANT.', { content: 'DESCRIPCIÓN', styles: { halign: 'left' } }, 'UNIDAD']],
            body: items.map((it, i) => [
                { content: it.productoId ? String(it.productoId).substring(0, 6) : String(i + 1), styles: { halign: 'center' } },
                { content: String(it.cantidad || 0), styles: { halign: 'center' } },
                { content: (it.nombre || '') + (it.presentacion ? ' ' + it.presentacion : '') },
                { content: it.unidad || 'UNI', styles: { halign: 'center' } },
            ]),
            theme: 'grid', styles: tblStyles, headStyles: hdStyles,
            columnStyles: {
                0: { cellWidth: 15 }, 1: { cellWidth: 15 },
                2: { cellWidth: 145 }, 3: { cellWidth: 15 },
            },
        });
    } else {
        // Columnas: 9+15+63+22+15+22+21+23 = 190mm
        const head = [
            [
                { content: 'COD.',     rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                { content: 'CANTIDAD', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                { content: 'DESCRIPCIÓN', rowSpan: 2, styles: { valign: 'middle', halign: 'left' } },
                { content: 'PRECIO UNITARIO\n(INCLUIDO IMPUESTO)', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                { content: 'DESCUENTO', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                { content: 'VALOR DE VENTA', colSpan: 3, styles: { halign: 'center' } },
            ],
            [
                { content: 'EXENTAS', styles: { halign: 'right' } },
                { content: '5%',      styles: { halign: 'right' } },
                { content: '10%',     styles: { halign: 'right' } },
            ],
        ];

        const body = items.map((it, i) => {
            const tipo = String(it.tipo_impuesto || '10').toLowerCase();
            const sub  = it.subtotal ?? ((it.precio || 0) * (it.cantidad || 0));
            const colExe = (tipo === 'exenta' || tipo === '0') ? sub : 0;
            const col5   = tipo === '5' ? sub : 0;
            const col10  = (!colExe && !col5) ? sub : 0;
            return [
                { content: it.productoId ? String(it.productoId).substring(0, 6) : String(i + 1), styles: { halign: 'center' } },
                { content: String(it.cantidad || 0), styles: { halign: 'center' } },
                { content: (it.nombre || '') + (it.presentacion ? ' ' + it.presentacion : '') },
                { content: _kudeFmt(it.precio || 0), styles: { halign: 'right' } },
                { content: '0', styles: { halign: 'right' } },
                { content: colExe > 0 ? _kudeFmt(colExe) : '', styles: { halign: 'right' } },
                { content: col5   > 0 ? _kudeFmt(col5)   : '', styles: { halign: 'right' } },
                { content: col10  > 0 ? _kudeFmt(col10)  : '', styles: { halign: 'right' } },
            ];
        });

        const blankCount = Math.max(0, 5 - items.length);
        for (let i = 0; i < blankCount; i++) body.push(['', '', '', '', '', '', '', '']);

        const footerIdx = items.length + blankCount;
        body.push([
            { content: 'SUBTOTAL:', colSpan: 5, styles: { fontStyle: 'bold' } },
            { content: _kudeFmt(subExe), styles: { halign: 'right', fontStyle: 'bold' } },
            { content: _kudeFmt(sub5),   styles: { halign: 'right', fontStyle: 'bold' } },
            { content: _kudeFmt(sub10),  styles: { halign: 'right', fontStyle: 'bold' } },
        ]);
        body.push([
            { content: 'TOTAL DE LA OPERACIÓN:', colSpan: 7, styles: { fontStyle: 'bold' } },
            { content: _kudeFmt(totalOpe), styles: { halign: 'right', fontStyle: 'bold' } },
        ]);
        body.push([
            { content: 'LIQUIDACIÓN IVA:', colSpan: 2, styles: { fontStyle: 'bold' } },
            { content: `(5%) ${_kudeFmt(liqIva5)}`,   colSpan: 2 },
            { content: `(10%) ${_kudeFmt(liqIva10)}`, colSpan: 2 },
            { content: `TOTAL IVA: ${_kudeFmt(totalIva)}`, colSpan: 2, styles: { fontStyle: 'bold' } },
        ]);

        doc.autoTable({
            startY: y, margin: { left: ML, right: ML }, tableWidth: PW,
            head, body,
            theme: 'grid', styles: tblStyles, headStyles: hdStyles,
            columnStyles: {
                0: { cellWidth: 9,  halign: 'center' },
                1: { cellWidth: 15, halign: 'center' },
                2: { cellWidth: 63, halign: 'left'   },
                3: { cellWidth: 22, halign: 'right'  },
                4: { cellWidth: 15, halign: 'right'  },
                5: { cellWidth: 22, halign: 'right'  },
                6: { cellWidth: 21, halign: 'right'  },
                7: { cellWidth: 23, halign: 'right'  },
            },
            didParseCell(data) {
                if (data.section === 'body' && data.row.index >= footerIdx) {
                    data.cell.styles.fillColor = [248, 248, 248];
                }
            },
        });
    }

    y = doc.lastAutoTable.finalY;

    // ===== PIE: QR + CDC + disclaimer =====
    const QR_SZ  = 30;
    const PAD    = 3;
    const TXT_X  = ML + QR_SZ + PAD * 2;
    const TXT_W  = PW - QR_SZ - PAD * 3;

    if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', ML + PAD, y + PAD, QR_SZ, QR_SZ);
    }

    let ty = y + PAD + 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    const consultaWr = doc.splitTextToSize(
        `Consulte la validez de esta ${tipoTxt} con el número de CDC impreso abajo en:`, TXT_W
    );
    doc.text(consultaWr, TXT_X, ty);
    ty += consultaWr.length * 3.8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...BLUE_TEXT);
    doc.text('https://ekuatia.set.gov.py/consultas/', TXT_X, ty);
    ty += 5;

    // Caja CDC
    const cdcTxt  = `CDC: ${cdc || 'Sin CDC — documento local (no enviado al SET)'}`;
    const cdcLines = doc.splitTextToSize(cdcTxt, TXT_W - 4);
    const CDC_H   = cdcLines.length * 4 + 4;
    doc.setFillColor(...BLUE_BG);
    doc.setDrawColor(...BLUE_BDR);
    doc.setLineWidth(0.2);
    doc.rect(TXT_X, ty - 2.5, TXT_W, CDC_H, 'FD');
    doc.setTextColor(...BLACK);
    doc.setFont('courier', 'bold');
    doc.setFontSize(7.5);
    doc.text(cdcLines, TXT_X + 2, ty + 1);
    ty += CDC_H + 3;

    // Disclaimer
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 30, 30);
    doc.text(
        'ESTE DOCUMENTO ES UNA REPRESENTACIÓN GRÁFICA DE UN DOCUMENTO ELECTRÓNICO (XML)',
        TXT_X, ty, { maxWidth: TXT_W }
    );
    ty += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('Información de interés del facturador electrónico emisor.', TXT_X, ty, { maxWidth: TXT_W });
    ty += 4;
    const disc2Wr = doc.splitTextToSize(
        'Si su documento electrónico presenta algún error, podrá solicitarlo dentro de las 72 horas siguientes a la emisión del presente documento, la cancelación del mismo y la generación de un nuevo comprobante.',
        TXT_W
    );
    doc.text(disc2Wr, TXT_X, ty);
    ty += disc2Wr.length * 3.2;

    // Borde exterior del pie
    const ftrH = Math.max(QR_SZ + PAD * 2, ty - y + PAD);
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.5);
    doc.rect(ML, y, PW, ftrH);

    // Abrir como PDF en nueva pestaña (igual que e-Kuatia'i)
    const blob    = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}
