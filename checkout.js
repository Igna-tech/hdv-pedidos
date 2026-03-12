// ============================================
// HDV Checkout - 3 Flujos de venta
// Requiere: app.js (carrito, clienteActual, etc.)
// ============================================

// --- Helpers ---

function obtenerDatosVenta() {
    const descuento = parseFloat(document.getElementById('descuento').value) || 0;
    const tipoPago = document.getElementById('tipoPago').value;
    const notas = document.getElementById('notasPedido').value.trim();
    const subtotal = carrito.reduce((s, i) => s + i.subtotal, 0);
    const total = Math.round(subtotal * (1 - descuento / 100));

    return {
        items: carrito.map(i => ({ ...i })),
        subtotal,
        descuento,
        total,
        tipoPago,
        notas,
        cliente: {
            id: clienteActual.id,
            nombre: clienteActual.razon_social || clienteActual.nombre,
            ruc: clienteActual.ruc || '',
            telefono: clienteActual.telefono || '',
            direccion: clienteActual.direccion || ''
        }
    };
}

function validarCarritoYCliente() {
    if (!clienteActual) {
        closeCartModal();
        mostrarModalSinCliente();
        return false;
    }
    if (carrito.length === 0) {
        mostrarToast('El carrito esta vacio', 'error');
        return false;
    }
    return true;
}

function limpiarDespuesDeVenta() {
    carrito = [];
    actualizarContadorCarrito();
    guardarCarrito();
    closeCartModal();
    document.getElementById('descuento').value = '0';
    document.getElementById('notasPedido').value = '';
    document.getElementById('tipoPago').value = 'contado';
}

function generarNumeroFactura() {
    const num = String(Math.floor(Math.random() * 9999999) + 1).padStart(7, '0');
    return `001-001-${num}`;
}

function generarCDC() {
    let cdc = '';
    for (let i = 0; i < 44; i++) cdc += Math.floor(Math.random() * 10);
    return cdc;
}

function formatearFecha(fecha) {
    const d = new Date(fecha);
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

function generarHTMLItems(items) {
    return items.map(i =>
        `<div style="display:flex; justify-content:space-between; font-size:10px; margin:2px 0;">
            <span style="flex:1;">${i.cantidad}x ${i.nombre} ${i.presentacion}</span>
            <span style="white-space:nowrap;">Gs.${i.subtotal.toLocaleString()}</span>
        </div>`
    ).join('');
}

// ============================================
// FLUJO 1: Generar Pedido (sin impresion)
// ============================================
async function procesarPedido() {
    if (!validarCarritoYCliente()) return;

    const datos = obtenerDatosVenta();
    const pedido = {
        id: 'PED-' + Date.now(),
        fecha: new Date().toISOString(),
        cliente: datos.cliente,
        items: datos.items,
        subtotal: datos.subtotal,
        descuento: datos.descuento,
        total: datos.total,
        tipoPago: datos.tipoPago,
        notas: datos.notas,
        estado: 'pedido_pendiente',
        vendedor_id: window.hdvUsuario?.id || null,
        sincronizado: false
    };

    // Guardar local
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    pedidos.push(pedido);
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

    limpiarDespuesDeVenta();
    mostrarToast('Pedido enviado a oficina', 'success');
}

// ============================================
// FLUJO 2: Cobrar (Recibo Interno)
// ============================================
async function procesarCobroInterno() {
    if (!validarCarritoYCliente()) return;

    const datos = obtenerDatosVenta();
    const pedido = {
        id: 'REC-' + Date.now(),
        fecha: new Date().toISOString(),
        cliente: datos.cliente,
        items: datos.items,
        subtotal: datos.subtotal,
        descuento: datos.descuento,
        total: datos.total,
        tipoPago: datos.tipoPago,
        notas: datos.notas,
        estado: 'cobrado_sin_factura',
        vendedor_id: window.hdvUsuario?.id || null,
        sincronizado: false
    };

    // Guardar local
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    pedidos.push(pedido);
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));

    // Sincronizar
    if (typeof guardarPedidoFirebase === 'function') {
        guardarPedidoFirebase(pedido).then(ok => {
            if (ok) {
                pedido.sincronizado = true;
                localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
            }
        });
    }

    // Armar ticket de impresion
    const fechaStr = formatearFecha(pedido.fecha);
    document.getElementById('printReciboMeta').innerHTML =
        `<p>Fecha: ${fechaStr}</p>
         <p>Cliente: ${datos.cliente.nombre}</p>
         ${datos.cliente.ruc ? `<p>RUC: ${datos.cliente.ruc}</p>` : ''}
         <p>Pago: ${datos.tipoPago === 'credito' ? 'Credito' : 'Contado'}</p>`;

    document.getElementById('printReciboItems').innerHTML = generarHTMLItems(datos.items);

    let totalHTML = `<p>TOTAL: Gs. ${datos.total.toLocaleString()}</p>`;
    if (datos.descuento > 0) {
        totalHTML = `<p style="font-size:10px;">Subtotal: Gs. ${datos.subtotal.toLocaleString()}</p>
                     <p style="font-size:10px;">Desc: ${datos.descuento}%</p>` + totalHTML;
    }
    document.getElementById('printReciboTotal').innerHTML = totalHTML;

    // Activar para impresion
    const printEl = document.getElementById('printReciboInterno');
    printEl.classList.add('active');
    printEl.style.display = 'block';

    limpiarDespuesDeVenta();

    // Imprimir
    setTimeout(() => {
        window.print();
        printEl.classList.remove('active');
        printEl.style.display = 'none';
    }, 300);

    mostrarToast('Cobro registrado', 'success');
}

// ============================================
// FLUJO 3: Emitir Factura Mock (SIFEN)
// ============================================
async function procesarFacturaMock() {
    if (!validarCarritoYCliente()) return;

    const datos = obtenerDatosVenta();

    // Validar RUC y Razon Social
    if (!datos.cliente.ruc) {
        mostrarToast('El cliente no tiene RUC asignado. No se puede facturar.', 'error');
        return;
    }
    if (!datos.cliente.nombre) {
        mostrarToast('El cliente no tiene razon social. No se puede facturar.', 'error');
        return;
    }

    const btnFactura = document.getElementById('btnFactura');
    const textoOriginal = btnFactura.innerHTML;
    btnFactura.disabled = true;
    btnFactura.innerHTML = '<span class="flex items-center justify-center gap-2"><svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Conectando con SIFEN...</span>';

    const numFactura = generarNumeroFactura();
    const cdc = generarCDC();
    const fechaStr = formatearFecha(new Date().toISOString());

    const pedido = {
        id: 'FAC-' + Date.now(),
        fecha: new Date().toISOString(),
        cliente: datos.cliente,
        items: datos.items,
        subtotal: datos.subtotal,
        descuento: datos.descuento,
        total: datos.total,
        tipoPago: datos.tipoPago,
        notas: datos.notas,
        estado: 'facturado_mock',
        numFactura,
        cdc,
        vendedor_id: window.hdvUsuario?.id || null,
        sincronizado: false
    };

    // Guardar local
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    pedidos.push(pedido);
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));

    // Sincronizar
    if (typeof guardarPedidoFirebase === 'function') {
        guardarPedidoFirebase(pedido).then(ok => {
            if (ok) {
                pedido.sincronizado = true;
                localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
            }
        });
    }

    // Preparar KuDE para impresion
    document.getElementById('printKuDENumero').textContent = numFactura;
    document.getElementById('printKuDECDC').textContent = cdc;
    document.getElementById('printKuDEMeta').innerHTML =
        `<p>Fecha: ${fechaStr}</p>
         <p>RUC: ${datos.cliente.ruc}</p>
         <p>Cliente: ${datos.cliente.nombre}</p>
         <p>Pago: ${datos.tipoPago === 'credito' ? 'Credito' : 'Contado'}</p>`;
    document.getElementById('printKuDEItems').innerHTML = generarHTMLItems(datos.items);

    let totalHTML = `<p>TOTAL: Gs. ${datos.total.toLocaleString()}</p>`;
    if (datos.descuento > 0) {
        totalHTML = `<p style="font-size:10px;">Subtotal: Gs. ${datos.subtotal.toLocaleString()}</p>
                     <p style="font-size:10px;">Desc: ${datos.descuento}%</p>` + totalHTML;
    }
    document.getElementById('printKuDETotal').innerHTML = totalHTML;

    // TODO: Fase Futura - Reemplazar con fetch a API FactPy enviando JSON estructurado.
    await new Promise(resolve => setTimeout(resolve, 2500));

    btnFactura.disabled = false;
    btnFactura.innerHTML = textoOriginal;

    // Preparar link WhatsApp
    const textoWA = `Factura Electronica HDV Distribuciones%0A` +
        `N°: ${numFactura}%0A` +
        `Fecha: ${fechaStr}%0A` +
        `Cliente: ${datos.cliente.nombre}%0A` +
        `RUC: ${datos.cliente.ruc}%0A` +
        `Total: Gs. ${datos.total.toLocaleString()}%0A` +
        `CDC: ${cdc}%0A` +
        `Consulta: https://ekuatia.set.gov.py`;

    const telLimpio = (datos.cliente.telefono || '').replace(/\D/g, '');
    const waLink = telLimpio
        ? `https://wa.me/595${telLimpio.replace(/^0/, '')}?text=${textoWA}`
        : `https://wa.me/?text=${textoWA}`;

    document.getElementById('facturaWhatsAppLink').href = waLink;
    document.getElementById('facturaNumeroDisplay').textContent = `N° ${numFactura} | CDC: ${cdc}`;

    // Guardar datos para impresion posterior
    window._ultimaFactura = { pedido, datos };

    limpiarDespuesDeVenta();

    // Mostrar modal de exito
    const modal = document.getElementById('modalFacturaExito');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    lucide.createIcons();
}

// --- Imprimir KuDE desde el modal ---
function imprimirFactura() {
    const printEl = document.getElementById('printKuDE');
    printEl.classList.add('active');
    printEl.style.display = 'block';

    setTimeout(() => {
        window.print();
        printEl.classList.remove('active');
        printEl.style.display = 'none';
    }, 300);
}

// --- Cerrar modal factura ---
function cerrarModalFactura() {
    const modal = document.getElementById('modalFacturaExito');
    modal.style.display = 'none';
    modal.classList.add('hidden');
}
