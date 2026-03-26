// ============================================
// HDV Checkout - 3 Flujos de venta
// Requiere: app.js (carrito, clienteActual, etc.)
// ============================================

// --- Helpers ---

function obtenerDatosVenta() {
    const descuento = parseFloat(document.getElementById('descuento').value) || 0;
    const tipoPago = document.getElementById('tipoPago').value;
    const notas = document.getElementById('notasPedido').value.trim();
    const items = carrito.map(i => ({ ...i }));
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const total = Math.round(subtotal * (1 - descuento / 100));

    // Calcular desglose IVA sobre items con descuento aplicado proporcionalmente
    const factor = descuento > 0 ? (1 - descuento / 100) : 1;
    const itemsAjustados = items.map(i => ({ ...i, subtotal: Math.round(i.subtotal * factor) }));
    const desgloseIVA = typeof calcularDesgloseIVA === 'function' ? calcularDesgloseIVA(itemsAjustados) : null;

    return {
        items,
        subtotal,
        descuento,
        total,
        tipoPago,
        notas,
        desgloseIVA,
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

// TODO: Refactor Phase 1 - Movido a js/utils/formatters.js
// function generarNumeroFactura() { ... }
// function generarCDC() { ... }
// function formatearFecha(fecha) { ... }

function generarHTMLItems(items) {
    return items.map(i =>
        `<div style="display:flex; justify-content:space-between; font-size:10px; margin:2px 0;">
            <span style="flex:1;">${i.cantidad}x ${escapeHTML(i.nombre)} ${escapeHTML(i.presentacion)}</span>
            <span style="white-space:nowrap;">${formatearGuaranies(i.subtotal)}</span>
        </div>`
    ).join('');
}

// ============================================
// FLUJO 1: Generar Pedido (sin impresion)
// ============================================
async function procesarPedido() {
    if (!validarCarritoYCliente()) return;

    await withButtonLock('btnPedido', async () => {
        const datos = obtenerDatosVenta();
        const pedido = {
            id: 'PED-' + crypto.randomUUID(),
            fecha: new Date().toISOString(),
            cliente: datos.cliente,
            items: datos.items,
            subtotal: datos.subtotal,
            descuento: datos.descuento,
            total: datos.total,
            tipoPago: datos.tipoPago,
            notas: datos.notas,
            estado: 'pedido_pendiente',
            tipo_comprobante: 'pedido',
            desgloseIVA: datos.desgloseIVA,
            vendedor_id: window.hdvUsuario?.id || null,
            sincronizado: false
        };

        // Guardar local
        const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
        pedidos.push(pedido);
        const persisted = await HDVStorage.setItem('hdv_pedidos', pedidos);
        if (!persisted) {
            mostrarToast('Pedido creado pero no se pudo guardar localmente. Sincronice cuanto antes.', 'warning');
        }

        // Sincronizar con Supabase
        if (typeof guardarPedido === 'function') {
            guardarPedido(pedido).then(async (ok) => {
                if (ok) {
                    // Re-leer pedidos para evitar race condition
                    const pedidosActuales = (await HDVStorage.getItem('hdv_pedidos')) || [];
                    const idx = pedidosActuales.findIndex(p => p.id === pedido.id);
                    if (idx >= 0) { pedidosActuales[idx].sincronizado = true; }
                    await HDVStorage.setItem('hdv_pedidos', pedidosActuales);
                }
            }).catch(err => console.error('[Checkout] Error sync pedido:', err));
        }

        limpiarDespuesDeVenta();
        mostrarToast('Pedido enviado a oficina', 'success');
    }, 'Enviando...')();
}

// ============================================
// FLUJO 2: Cobrar (Recibo Interno)
// ============================================
async function procesarCobroInterno() {
    if (!validarCarritoYCliente()) return;

    await withButtonLock('btnCobro', async () => {
        const datos = obtenerDatosVenta();
        const pedido = {
            id: 'REC-' + crypto.randomUUID(),
            fecha: new Date().toISOString(),
            cliente: datos.cliente,
            items: datos.items,
            subtotal: datos.subtotal,
            descuento: datos.descuento,
            total: datos.total,
            tipoPago: datos.tipoPago,
            notas: datos.notas,
            estado: 'cobrado_sin_factura',
            tipo_comprobante: 'recibo_interno',
            desgloseIVA: datos.desgloseIVA,
            vendedor_id: window.hdvUsuario?.id || null,
            sincronizado: false
        };

        // Guardar local
        const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
        pedidos.push(pedido);
        const persisted = await HDVStorage.setItem('hdv_pedidos', pedidos);
        if (!persisted) {
            mostrarToast('Cobro creado pero no se pudo guardar localmente. Sincronice cuanto antes.', 'warning');
        }

        // Sincronizar
        if (typeof guardarPedido === 'function') {
            guardarPedido(pedido).then(async (ok) => {
                if (ok) {
                    const pedidosActuales = (await HDVStorage.getItem('hdv_pedidos')) || [];
                    const idx = pedidosActuales.findIndex(p => p.id === pedido.id);
                    if (idx >= 0) { pedidosActuales[idx].sincronizado = true; }
                    await HDVStorage.setItem('hdv_pedidos', pedidosActuales);
                }
            }).catch(err => console.error('[Checkout] Error sync cobro:', err));
        }

        // Armar ticket de impresion
        const fechaStr = formatearFecha(pedido.fecha);
        document.getElementById('printReciboMeta').innerHTML =
            `<p>Fecha: ${fechaStr}</p>
             <p>Cliente: ${escapeHTML(datos.cliente.nombre)}</p>
             ${datos.cliente.ruc ? `<p>RUC: ${escapeHTML(datos.cliente.ruc)}</p>` : ''}
             <p>Pago: ${datos.tipoPago === 'credito' ? 'Credito' : 'Contado'}</p>`;

        document.getElementById('printReciboItems').innerHTML = generarHTMLItems(datos.items);

        let totalHTML = `<p>TOTAL: ${formatearGuaranies(datos.total)}</p>`;
        if (datos.descuento > 0) {
            totalHTML = `<p style="font-size:10px;">Subtotal: ${formatearGuaranies(datos.subtotal)}</p>
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
    }, 'Procesando...')();
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

    await withButtonLock('btnFactura', async () => {
        const numFactura = generarNumeroFactura();
        const cdc = generarCDC();
        const fechaStr = formatearFecha(new Date().toISOString());

        const pedido = {
            id: 'FAC-' + crypto.randomUUID(),
            fecha: new Date().toISOString(),
            cliente: datos.cliente,
            items: datos.items,
            subtotal: datos.subtotal,
            descuento: datos.descuento,
            total: datos.total,
            tipoPago: datos.tipoPago,
            notas: datos.notas,
            estado: 'facturado_mock',
            tipo_comprobante: 'factura_electronica',
            desgloseIVA: datos.desgloseIVA,
            numFactura,
            cdc,
            vendedor_id: window.hdvUsuario?.id || null,
            sincronizado: false
        };

        // Guardar local
        const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
        pedidos.push(pedido);
        const persisted = await HDVStorage.setItem('hdv_pedidos', pedidos);
        if (!persisted) {
            mostrarToast('Factura creada pero no se pudo guardar localmente. Sincronice cuanto antes.', 'warning');
        }

        // Sincronizar
        if (typeof guardarPedido === 'function') {
            guardarPedido(pedido).then(async (ok) => {
                if (ok) {
                    const pedidosActuales = (await HDVStorage.getItem('hdv_pedidos')) || [];
                    const idx = pedidosActuales.findIndex(p => p.id === pedido.id);
                    if (idx >= 0) { pedidosActuales[idx].sincronizado = true; }
                    await HDVStorage.setItem('hdv_pedidos', pedidosActuales);
                }
            }).catch(err => console.error('[Checkout] Error sync factura:', err));
        }

        // Preparar KuDE para impresion
        document.getElementById('printKuDENumero').textContent = numFactura;
        document.getElementById('printKuDECDC').textContent = cdc;
        document.getElementById('printKuDEMeta').innerHTML =
            `<p>Fecha: ${fechaStr}</p>
             <p>RUC: ${escapeHTML(datos.cliente.ruc)}</p>
             <p>Cliente: ${escapeHTML(datos.cliente.nombre)}</p>
             <p>Pago: ${datos.tipoPago === 'credito' ? 'Credito' : 'Contado'}</p>`;
        document.getElementById('printKuDEItems').innerHTML = generarHTMLItems(datos.items);

        let totalHTML = `<p>TOTAL: ${formatearGuaranies(datos.total)}</p>`;
        if (datos.descuento > 0) {
            totalHTML = `<p style="font-size:10px;">Subtotal: ${formatearGuaranies(datos.subtotal)}</p>
                         <p style="font-size:10px;">Desc: ${datos.descuento}%</p>` + totalHTML;
        }
        document.getElementById('printKuDETotal').innerHTML = totalHTML;

        // Desglose IVA para Factura Electronica (formato SET)
        const iva = datos.desgloseIVA;
        if (iva) {
            document.getElementById('printKuDEIVA').innerHTML = `
                <div style="display:flex; justify-content:space-between;"><span>Sub. Exentas:</span><span>${formatearGuaranies(iva.totalExentas)}</span></div>
                <div style="display:flex; justify-content:space-between;"><span>Sub. IVA 5%:</span><span>${formatearGuaranies(iva.totalGravada5)}</span></div>
                <div style="display:flex; justify-content:space-between;"><span>Sub. IVA 10%:</span><span>${formatearGuaranies(iva.totalGravada10)}</span></div>
                <div style="display:flex; justify-content:space-between; margin-top:2px; font-weight:bold; border-top:1px dotted #000; padding-top:2px;">
                    <span>Liq. IVA 5%:</span><span>${formatearGuaranies(iva.liqIva5)}</span></div>
                <div style="display:flex; justify-content:space-between; font-weight:bold;">
                    <span>Liq. IVA 10%:</span><span>${formatearGuaranies(iva.liqIva10)}</span></div>
                <div style="display:flex; justify-content:space-between; font-weight:bold; border-top:1px dotted #000; padding-top:2px; margin-top:2px;">
                    <span>Total IVA:</span><span>${formatearGuaranies(iva.totalIva)}</span></div>`;
        }

        // TODO: Fase Futura - Reemplazar con fetch a API FactPy enviando JSON estructurado.
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Preparar link WhatsApp
        const textoWA = encodeURIComponent(
            `Factura Electronica HDV Distribuciones\n` +
            `N°: ${numFactura}\n` +
            `Fecha: ${fechaStr}\n` +
            `Cliente: ${datos.cliente.nombre}\n` +
            `RUC: ${datos.cliente.ruc}\n` +
            `Total: ${formatearGuaranies(datos.total)}\n` +
            `CDC: ${cdc}\n` +
            `Consulta: https://ekuatia.set.gov.py`
        );

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
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 'Conectando con SIFEN...')();
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
