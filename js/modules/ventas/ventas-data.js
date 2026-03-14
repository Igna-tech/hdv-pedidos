// ============================================
// HDV Admin - Ventas: Capa de Datos
// Persistencia localStorage + Supabase.
// NO accede al DOM. Devuelve datos puros.
// Depende de globals: supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY,
//   guardarPedido (supabase-config.js), productosData (admin.js)
// ============================================

// TODO: Refactor Phase 1 - generarNumeroFacturaAdmin y generarCDCAdmin ahora en js/utils/formatters.js

// --- Lectura ---

function ventasDataObtenerPedidos() {
    return JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
}

function ventasDataFiltrar(pedidos, filtroFecha, filtroTipo) {
    let ventas = pedidos.filter(p =>
        p.estado === 'cobrado_sin_factura' || p.estado === 'facturado_mock'
    );
    if (filtroFecha) ventas = ventas.filter(p => new Date(p.fecha).toISOString().split('T')[0] === filtroFecha);
    if (filtroTipo) ventas = ventas.filter(p => p.estado === filtroTipo);
    return ventas;
}

function ventasDataBuscarPedido(pedidoId) {
    const pedidos = ventasDataObtenerPedidos();
    return pedidos.find(p => p.id === pedidoId) || null;
}

function ventasDataBuscarCliente(clienteId) {
    return productosData.clientes.find(c => c.id === clienteId) || null;
}

function ventasDataEstadisticas(ventas) {
    return {
        total: ventas.length,
        recibos: ventas.filter(v => v.estado === 'cobrado_sin_factura').length,
        facturados: ventas.filter(v => v.estado === 'facturado_mock').length,
    };
}

// --- Escritura ---

function ventasDataFacturar(pedidoId) {
    const pedidos = ventasDataObtenerPedidos();
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return null;

    const clienteInfo = ventasDataBuscarCliente(pedido.cliente?.id);
    const ruc = clienteInfo?.ruc || pedido.cliente?.ruc || '';
    if (!ruc) return { error: 'El cliente no tiene RUC asignado. No se puede facturar.' };

    const numFactura = generarNumeroFacturaAdmin();
    const cdc = generarCDCAdmin();

    pedido.estado = 'facturado_mock';
    pedido.numFactura = numFactura;
    pedido.cdc = cdc;
    pedido.sincronizado = false;
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));

    // Sync con Supabase (fire-and-forget)
    if (typeof guardarPedido === 'function') {
        guardarPedido(pedido).then(ok => {
            if (ok) {
                pedido.sincronizado = true;
                localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
            }
        });
    }

    return { pedido, clienteInfo, numFactura, cdc, ruc };
}

function ventasDataGuardarSifen(pedidoId, result) {
    const pedidos = ventasDataObtenerPedidos();
    const idx = pedidos.findIndex(p => p.id === pedidoId);
    if (idx === -1) return false;

    pedidos[idx].sifen_cdc = result.cdc;
    pedidos[idx].sifen_qr_url = result.qr_url;
    pedidos[idx].sifen_numFactura = result.numFactura;
    pedidos[idx].sifen_xml_generado = true;
    pedidos[idx].sifen_fecha_generacion = new Date().toISOString();
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
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

function ventasDataExportCSVSemanal() {
    const pedidos = ventasDataObtenerPedidos();

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
        if (p.estado !== 'cobrado_sin_factura' && p.estado !== 'facturado_mock') return false;
        const fecha = new Date(p.fecha);
        return fecha >= lunes && fecha <= domingo;
    });

    if (ventasSemana.length === 0) return null;

    let csv = '\uFEFF';
    csv += '"Fecha","Cliente","Producto","Presentacion","Cantidad","P. Unitario","Subtotal","Total Pedido","Estado","Tipo Pago","N° Factura","Notas"\n';

    ventasSemana.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    ventasSemana.forEach(p => {
        const estado = p.estado === 'facturado_mock' ? 'Facturado' : 'Recibo';
        const numFact = p.numFactura || '';
        const notas = (p.notas || '').replace(/"/g, '""');
        const clienteNombre = (p.cliente?.nombre || 'Sin cliente').replace(/"/g, '""');
        const fechaStr = new Date(p.fecha).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });

        (p.items || []).forEach(i => {
            csv += `"${fechaStr}","${clienteNombre}","${(i.nombre || '').replace(/"/g, '""')}","${(i.presentacion || '').replace(/"/g, '""')}",${i.cantidad || 0},${i.precio || 0},${i.subtotal || 0},${p.total || 0},"${estado}","${p.tipoPago || 'contado'}","${numFact}","${notas}"\n`;
        });
    });

    const rangoTexto = lunes.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' }) + '_al_' + domingo.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return { csv, filename: `ventas_semana_${rangoTexto}.csv`, count: ventasSemana.length };
}

// --- WhatsApp ---

function ventasDataBuildWhatsAppURL(pedidoId) {
    const pedido = ventasDataBuscarPedido(pedidoId);
    if (!pedido) return null;

    const clienteInfo = ventasDataBuscarCliente(pedido.cliente?.id);
    const esFactura = pedido.estado === 'facturado_mock';
    const telefono = clienteInfo?.telefono || pedido.cliente?.telefono || '';

    let texto = esFactura
        ? `Factura Electronica HDV Distribuciones%0AN°: ${pedido.numFactura || 'N/A'}%0A`
        : `Recibo HDV Distribuciones%0AN°: ${pedido.id}%0A`;

    texto += `Fecha: ${tplFormatearFechaAdmin(pedido.fecha)}%0A`;
    texto += `Cliente: ${pedido.cliente?.nombre}%0A`;
    texto += `Total: Gs. ${(pedido.total || 0).toLocaleString()}%0A`;

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
    };
}
