// ============================================
// HDV Utils - Impresion (Thermal 58/80mm)
// Genera HTML completo para tickets termicos.
// Funciones puras que devuelven strings HTML.
// ============================================

// --- Ticket Termico 80mm — Pedido/Remision (usado por app.js y admin.js) ---

function generarTicketHTML(pedido, opciones) {
    const opt = opciones || {};
    const titulo = opt.titulo || 'EAS - Comprobante de Pedido';
    const subtitulo = opt.subtitulo || '';
    const clienteInfo = opt.clienteInfo || {};
    const ruc = clienteInfo.ruc || pedido.cliente?.ruc || '';
    const direccion = clienteInfo.direccion || clienteInfo.zona || '';
    const mostrarEstado = opt.mostrarEstado || false;

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
    @page { margin: 0; size: 80mm auto; }
    body { font-family: 'Courier New', monospace; width: 72mm; margin: 4mm; font-size: 11px; color: #000; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 4px 0; }
    .right { text-align: right; }
    .row { display: flex; justify-content: space-between; }
    .big { font-size: 16px; }
    .small { font-size: 9px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    .total-row { font-size: 14px; font-weight: bold; }
</style></head><body>
<div class="center bold big">HDV DISTRIBUCIONES</div>
<div class="center small">${titulo}</div>
${subtitulo ? `<div class="center small">${subtitulo}</div>` : ''}
<div class="line"></div>
<div class="row"><span>N°: ${pedido.id}</span></div>
<div class="row"><span>Fecha: ${new Date(pedido.fecha).toLocaleDateString('es-PY')}</span></div>
<div class="row"><span>Hora: ${new Date(pedido.fecha).toLocaleTimeString('es-PY')}</span></div>
<div class="line"></div>
<div class="bold">Cliente: ${pedido.cliente?.nombre || 'N/A'}</div>
${ruc ? `<div>RUC: ${ruc}</div>` : ''}
${direccion ? `<div>Dir: ${direccion}</div>` : ''}
<div class="line"></div>
<table>
${(pedido.items || []).map(i => `<tr>
    <td>${i.nombre}<br><span class="small">${i.presentacion} x${i.cantidad}</span></td>
    <td class="right bold">Gs.${(i.subtotal || 0).toLocaleString()}</td>
</tr>`).join('')}
</table>
<div class="line"></div>
<div class="row"><span>Subtotal:</span><span>Gs. ${(pedido.subtotal || pedido.total || 0).toLocaleString()}</span></div>
${pedido.descuento > 0 ? `<div class="row"><span>Desc. ${pedido.descuento}%:</span><span>-Gs. ${Math.round((pedido.subtotal || 0) * pedido.descuento / 100).toLocaleString()}</span></div>` : ''}
<div class="line"></div>
<div class="row total-row"><span>TOTAL:</span><span>Gs. ${(pedido.total || 0).toLocaleString()}</span></div>
<div class="line"></div>
<div class="row"><span>Pago: ${pedido.tipoPago || 'contado'}</span>${mostrarEstado ? `<span>Estado: ${(pedido.estado || 'pendiente').toUpperCase()}</span>` : ''}</div>
${pedido.notas ? `<div class="small">Notas: ${pedido.notas}</div>` : ''}
<div class="line"></div>
<div class="center small">Gracias por su compra</div>
<div class="center small">HDV Distribuciones EAS</div>
<div style="margin-bottom:10mm"></div>
</body></html>`;
}

// --- Ticket Termico 58mm — Factura/Recibo (usado por admin-ventas.js via ventas-templates.js) ---
// Nota: tplTicketThermal() esta en ventas-templates.js ya que fue extraido en la fase anterior.
// Aqui no se duplica; este archivo provee generarTicketHTML() para pedidos/remisiones.

// --- Funcion helper para imprimir via iframe ---

function imprimirViaIframe(frameId, htmlCompleto) {
    const printFrame = document.getElementById(frameId);
    if (!printFrame) return;
    printFrame.srcdoc = htmlCompleto;
    printFrame.onload = () => printFrame.contentWindow.print();
}
