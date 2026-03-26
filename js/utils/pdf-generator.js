// ============================================
// HDV Utils - Generador PDF (jsPDF)
// Genera PDFs de pedidos y remisiones.
// Requiere: jsPDF cargado via CDN.
// ============================================

// --- PDF Vendedor (Comprobante de Pedido) ---

function generarPDFPedido(pedido, opciones) {
    if (typeof window.jspdf === 'undefined') {
        if (typeof mostrarToast === 'function') mostrarToast('Cargando generador de PDF...', 'info');
        else if (typeof mostrarExito === 'function') mostrarExito('Cargando generador de PDF...');
        return;
    }

    const opt = opciones || {};
    const titulo = opt.titulo || 'EAS - Comprobante de Pedido';
    const clienteInfo = opt.clienteInfo || {};

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header
    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('HDV Distribuciones', 15, 16);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(titulo, 15, 24);
    doc.text(`N°: ${pedido.id}`, 195, 14, { align: 'right' });
    doc.text(`${new Date(pedido.fecha).toLocaleDateString('es-PY')}`, 195, 21, { align: 'right' });

    // Client
    let y = 45;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Cliente: ${pedido.cliente?.nombre || 'N/A'}`, 15, y);
    y += 10;

    // Items header
    doc.setFillColor(17, 24, 39);
    doc.rect(10, y - 5, 190, 8, 'F');
    doc.setTextColor(255);
    doc.setFontSize(8);
    doc.text('PRODUCTO', 15, y);
    doc.text('PRES.', 90, y);
    doc.text('CANT.', 125, y);
    doc.text('SUBTOTAL', 190, y, { align: 'right' });
    y += 8;

    // Items
    doc.setTextColor(0);
    doc.setFontSize(9);
    (pedido.items || []).forEach((item, i) => {
        if (i % 2 === 0) { doc.setFillColor(249, 250, 251); doc.rect(10, y - 4, 190, 7, 'F'); }
        doc.setFont('helvetica', 'normal');
        doc.text(item.nombre, 15, y);
        doc.text(item.presentacion, 90, y);
        doc.text(String(item.cantidad), 130, y);
        doc.setFont('helvetica', 'bold');
        doc.text(formatearGuaranies(item.subtotal), 190, y, { align: 'right' });
        y += 7;
    });

    // Total
    y += 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL: ${formatearGuaranies(pedido.total)}`, 190, y, { align: 'right' });

    // Footer
    y += 10;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text(`Pago: ${pedido.tipoPago || 'contado'}${pedido.descuento > 0 ? ` | Desc: ${pedido.descuento}%` : ''}`, 15, y);
    if (pedido.notas) { y += 5; doc.text(`Notas: ${pedido.notas}`, 15, y); }

    const filename = opt.filename || `pedido_${pedido.id}.pdf`;
    doc.save(filename);
    return true;
}

// --- PDF Remision (admin) ---

function generarPDFRemisionDoc(pedido, clienteInfo) {
    if (typeof window.jspdf === 'undefined') {
        if (typeof mostrarToast === 'function') mostrarToast('Cargando generador de PDF...', 'info');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header
    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('HDV Distribuciones', 15, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('EAS - Nota de Remision', 15, 26);
    doc.text(`N°: ${pedido.id}`, 195, 14, { align: 'right' });
    doc.text(`Fecha: ${new Date(pedido.fecha).toLocaleDateString('es-PY')}`, 195, 20, { align: 'right' });
    doc.text(`Estado: ${(pedido.estado || 'pendiente').toUpperCase()}`, 195, 26, { align: 'right' });

    // Client info
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(249, 250, 251);
    doc.rect(10, 42, 190, 28, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL CLIENTE', 15, 50);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Razon Social: ${pedido.cliente?.nombre || 'N/A'}`, 15, 57);
    doc.text(`RUC: ${clienteInfo?.ruc || 'N/A'}`, 110, 57);
    doc.text(`Direccion: ${clienteInfo?.direccion || clienteInfo?.zona || 'N/A'}`, 15, 63);
    doc.text(`Tel: ${clienteInfo?.telefono || 'N/A'}`, 110, 63);

    // Table header
    let y = 80;
    doc.setFillColor(17, 24, 39);
    doc.rect(10, y - 6, 190, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('PRODUCTO', 15, y);
    doc.text('PRESENTACION', 80, y);
    doc.text('CANT.', 125, y);
    doc.text('P. UNIT.', 145, y);
    doc.text('SUBTOTAL', 175, y, { align: 'right' });

    // Table rows
    y += 10;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    (pedido.items || []).forEach((item, i) => {
        if (i % 2 === 0) {
            doc.setFillColor(249, 250, 251);
            doc.rect(10, y - 5, 190, 8, 'F');
        }
        doc.setFontSize(9);
        doc.text(item.nombre || '', 15, y);
        doc.text(item.presentacion || '', 80, y);
        doc.text(String(item.cantidad || 0), 130, y);
        doc.text(formatearGuaranies(item.precio), 145, y);
        doc.setFont('helvetica', 'bold');
        doc.text(formatearGuaranies(item.subtotal), 195, y, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        y += 8;
    });

    // Totals
    y += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(120, y, 200, y);
    y += 8;
    doc.setFontSize(9);
    doc.text('Subtotal:', 140, y);
    doc.text(formatearGuaranies(pedido.subtotal), 195, y, { align: 'right' });
    if (pedido.descuento > 0) {
        y += 7;
        doc.text(`Descuento (${pedido.descuento}%):`, 140, y);
        doc.text(`-${formatearGuaranies(Math.round((pedido.subtotal || 0) * pedido.descuento / 100))}`, 195, y, { align: 'right' });
    }
    y += 7;
    doc.setFillColor(17, 24, 39);
    doc.rect(130, y - 5, 70, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 135, y + 1);
    doc.text(formatearGuaranies(pedido.total), 195, y + 1, { align: 'right' });

    // Footer
    y += 20;
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Tipo de pago: ${pedido.tipoPago || 'contado'}`, 15, y);
    if (pedido.notas) doc.text(`Notas: ${pedido.notas}`, 15, y + 5);

    // Signatures
    y = 270;
    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, 80, y);
    doc.line(130, y, 195, y);
    doc.setFontSize(7);
    doc.text('Firma del Cliente', 35, y + 5);
    doc.text('Firma del Vendedor', 150, y + 5);

    doc.setTextColor(180, 180, 180);
    doc.text('HDV Distribuciones EAS - Documento generado automaticamente', 105, 290, { align: 'center' });

    doc.save(`remision_${pedido.id}_${pedido.cliente?.nombre || 'cliente'}.pdf`);
}
