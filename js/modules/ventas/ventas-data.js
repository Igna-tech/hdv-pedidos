// ============================================
// HDV Admin - Ventas: Capa de Datos
// Persistencia IndexedDB (HDVStorage) + Supabase.
// NO accede al DOM. Devuelve datos puros.
// Depende de globals: supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY,
//   guardarPedido (supabase-config.js), productosData (admin.js)
// ============================================

// --- Lectura ---

async function ventasDataObtenerPedidos() {
    return (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
}

function ventasDataFiltrar(pedidos, filtroFecha, filtroTipo) {
    let ventas = pedidos.filter(p =>
        p.estado === PEDIDO_ESTADOS.COBRADO || p.estado === PEDIDO_ESTADOS.FACTURADO
    );
    if (filtroFecha) ventas = ventas.filter(p => new Date(p.fecha).toISOString().split('T')[0] === filtroFecha);
    if (filtroTipo) ventas = ventas.filter(p => p.estado === filtroTipo);
    return ventas;
}

async function ventasDataBuscarPedido(pedidoId) {
    const pedidos = await ventasDataObtenerPedidos();
    return pedidos.find(p => p.id === pedidoId) || null;
}

function ventasDataBuscarCliente(clienteId) {
    return productosData.clientes.find(c => c.id === clienteId) || null;
}

function ventasDataEstadisticas(ventas) {
    return {
        total: ventas.length,
        recibos: ventas.filter(v => v.estado === PEDIDO_ESTADOS.COBRADO).length,
        facturados: ventas.filter(v => v.estado === PEDIDO_ESTADOS.FACTURADO).length,
    };
}

// --- Libro de cobros unificado (hdv_pagos_credito) ---
// Fuente ÚNICA de "caja / cobrado". Suma los cobros reales en un rango de fechas
// [desde, hasta] (YYYY-MM-DD, inclusive). Opcional: filtrar por vendedorId.
// Devuelve { total, pagos } donde pagos es el detalle dentro del rango.
// Usar esto para todo cálculo de cobrado/recaudado (evita doble conteo por estado).
async function ventasDataCobrosPorPeriodo(desde, hasta, vendedorId) {
    const pagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
    const filtrados = pagos.filter(pg => {
        const f = (pg.fecha || '').slice(0, 10);
        if (desde && f < desde) return false;
        if (hasta && f > hasta) return false;
        if (vendedorId && pg.vendedor_id && pg.vendedor_id !== vendedorId) return false;
        return true;
    });
    const total = filtrados.reduce((s, pg) => s + (Number(pg.monto) || 0), 0);
    return { total, pagos: filtrados };
}

// --- Escritura (atomicUpdate previene race conditions con realtime) ---

async function ventasDataFacturar(pedidoId) {
    // Leer con clone:true para validacion previa (no mutar cache)
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const pedidoOrig = pedidos.find(p => p.id === pedidoId);
    if (!pedidoOrig) return null;

    const clienteInfo = ventasDataBuscarCliente(pedidoOrig.cliente?.id);
    const ruc = clienteInfo?.ruc || pedidoOrig.cliente?.ruc || '';
    if (!ruc) return { error: 'El cliente no tiene RUC asignado. No se puede facturar.' };

    const numFactura = generarNumeroFacturaAdmin();
    const cdc = generarCDCAdmin();

    let pedidoActualizado = null;
    await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
        const list = pedidos || [];
        const p = list.find(x => x.id === pedidoId);
        if (p) {
            p.estado = PEDIDO_ESTADOS.FACTURADO;
            p.numFactura = numFactura;
            p.cdc = cdc;
            p.sincronizado = false;
            pedidoActualizado = { ...p };
        }
        return list;
    });

    // Sync con Supabase (fire-and-forget)
    if (pedidoActualizado && typeof guardarPedido === 'function') {
        guardarPedido(pedidoActualizado).then(async ok => {
            if (ok) {
                await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
                    const list = pedidos || [];
                    const p = list.find(x => x.id === pedidoId);
                    if (p) p.sincronizado = true;
                    return list;
                });
            }
        });
    }

    return { pedido: pedidoActualizado || pedidoOrig, clienteInfo, numFactura, cdc, ruc };
}

async function ventasDataGuardarSifen(pedidoId, result) {
    await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
        const list = pedidos || [];
        const p = list.find(x => x.id === pedidoId);
        if (p) {
            p.sifen_cdc = result.cdc;
            p.sifen_qr_url = result.qr_url;
            p.sifen_numFactura = result.numFactura;
            p.sifen_xml_generado = true;
            p.sifen_fecha_generacion = new Date().toISOString();
        }
        return list;
    });
    return true;
}

// --- Edge Function SIFEN ---

async function ventasDataGenerarXMLSifen(pedidoId) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) throw new Error('Sesion expirada. Reingrese al sistema.');

    const response = await fetch(`${SUPABASE_URL}/functions/v1/sifen-generar-xml`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ pedido_id: pedidoId }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Error al generar XML');
    return result;
}

// --- Export CSV semanal ---

async function ventasDataExportCSVSemanal() {
    const pedidos = await ventasDataObtenerPedidos();

    const hoy = new Date();
    const diaSemana = hoy.getDay();
    const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() + diffLunes);
    lunes.setHours(0, 0, 0, 0);

    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23, 59, 59, 999);

    const ventasSemana = pedidos.filter(p => {
        if (p.estado !== PEDIDO_ESTADOS.COBRADO && p.estado !== PEDIDO_ESTADOS.FACTURADO) return false;
        const fecha = new Date(p.fecha);
        return fecha >= lunes && fecha <= domingo;
    });

    if (ventasSemana.length === 0) return null;

    let csv = '\uFEFF';
    csv += '"Fecha","Cliente","Producto","Presentacion","Cantidad","P. Unitario","Subtotal","Total Pedido","Estado","Tipo Pago","N° Factura","Notas"\n';

    ventasSemana.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    ventasSemana.forEach(p => {
        const estado = p.estado === PEDIDO_ESTADOS.FACTURADO ? 'Facturado' : 'Recibo';
        const numFact = p.numFactura || '';
        const notas = p.notas || '';
        const clienteNombre = p.cliente?.nombre || 'Sin cliente';
        const fechaStr = new Date(p.fecha).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });

        (p.items || []).forEach(i => {
            csv += [
                escaparCSV(fechaStr), escaparCSV(clienteNombre),
                escaparCSV(i.nombre), escaparCSV(i.presentacion),
                i.cantidad || 0, i.precio || 0, i.subtotal || 0, p.total || 0,
                escaparCSV(estado), escaparCSV(p.tipoPago || 'contado'),
                escaparCSV(numFact), escaparCSV(notas)
            ].join(',') + '\n';
        });
    });

    const rangoTexto = lunes.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' }) + '_al_' + domingo.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return { csv, filename: `ventas_semana_${rangoTexto}.csv`, count: ventasSemana.length };
}

// --- WhatsApp ---

async function ventasDataBuildWhatsAppURL(pedidoId) {
    const pedido = await ventasDataBuscarPedido(pedidoId);
    if (!pedido) return null;

    const clienteInfo = ventasDataBuscarCliente(pedido.cliente?.id);
    const esFactura = pedido.estado === PEDIDO_ESTADOS.FACTURADO;
    const telefono = clienteInfo?.telefono || pedido.cliente?.telefono || '';

    let texto = esFactura
        ? `Factura Electronica HDV Distribuciones%0AN°: ${pedido.numFactura || 'N/A'}%0A`
        : `Recibo HDV Distribuciones%0AN°: ${pedido.id}%0A`;

    texto += `Fecha: ${tplFormatearFechaAdmin(pedido.fecha)}%0A`;
    texto += `Cliente: ${pedido.cliente?.nombre}%0A`;
    texto += `Total: ${formatearGuaranies(pedido.total)}%0A`;

    if (esFactura && pedido.cdc) {
        texto += `CDC: ${pedido.cdc}%0AConsulta: https://ekuatia.set.gov.py`;
    }

    const telLimpio = telefono.replace(/\D/g, '');
    return telLimpio
        ? `https://wa.me/595${telLimpio.replace(/^0/, '')}?text=${texto}`
        : `https://wa.me/?text=${texto}`;
}

// --- Datos empresa (desde DOM — unico punto que lee inputs de config) ---

function ventasDataObtenerEmpresa() {
    return {
        ruc: document.getElementById('cfgEmpresaRuc')?.value || '',
        razonSocial: document.getElementById('cfgEmpresaRazon')?.value || 'HDV DISTRIBUCIONES',
        nombreFantasia: document.getElementById('cfgEmpresaNombreFantasia')?.value || '',
        timbrado: document.getElementById('cfgEmpresaTimbrado')?.value || '',
        timbradoVenc: document.getElementById('cfgEmpresaTimbradoVenc')?.value || '',
        establecimiento: document.getElementById('cfgEmpresaEstablecimiento')?.value || '001',
        puntoExp: document.getElementById('cfgEmpresaPuntoExp')?.value || '001',
        direccion: document.getElementById('cfgEmpresaDireccion')?.value || '',
        telefono: document.getElementById('cfgEmpresaTelefono')?.value || '',
        email: document.getElementById('cfgEmpresaEmail')?.value || '',
        actividad: document.getElementById('cfgEmpresaActividad')?.value || '',
        logo_url: window._empresaLogoUrl || '',
    };
}
