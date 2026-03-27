// ============================================
// HDV Admin - Ventas: Controlador
// Orquesta eventos del DOM, delega datos a ventas-data.js
// y renderizado a ventas-templates.js
// Requiere: ventas-data.js, ventas-templates.js, admin.js (todosLosPedidos, productosData)
// ============================================

// Namespace para onclick handlers en templates
const ventasCtrl = {};

// ============================================
// CARGAR Y MOSTRAR VENTAS
// ============================================

async function cargarVentas() {
    todosLosPedidos = await ventasDataObtenerPedidos();
    filtrarVentas();
}

function filtrarVentas() {
    const fecha = document.getElementById('filtroFechaVentas')?.value;
    const tipo = document.getElementById('filtroTipoVenta')?.value;
    const ventas = ventasDataFiltrar(todosLosPedidos, fecha, tipo);

    mostrarVentas(ventas);
    actualizarEstadisticasVentas(ventas);
}

function actualizarEstadisticasVentas(ventas) {
    const stats = ventasDataEstadisticas(ventas);
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('statTotalVentas', stats.total);
    el('statRecibos', stats.recibos);
    el('statFacturados', stats.facturados);
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
        const esFactura = v.estado === PEDIDO_ESTADOS.FACTURADO;
        const clienteInfo = ventasDataBuscarCliente(v.cliente?.id);
        const zona = clienteInfo?.zona || clienteInfo?.direccion || '';

        const div = document.createElement('div');
        div.innerHTML = tplVentaCard(v, zona, '', esFactura);
        container.appendChild(div.firstElementChild);
    });
    lucide.createIcons();
}

// ============================================
// FACTURAR PEDIDO DESDE ADMIN
// ============================================

async function facturarPedidoAdmin(pedidoId) {
    const pedido = await ventasDataBuscarPedido(pedidoId);
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }

    const clienteInfo = ventasDataBuscarCliente(pedido.cliente?.id);
    const ruc = clienteInfo?.ruc || pedido.cliente?.ruc || '';
    if (!ruc) {
        mostrarToast('El cliente no tiene RUC asignado. No se puede facturar.', 'error');
        return;
    }

    // Dynamic button ID per pedido
    const btnId = `btnFacturar-${pedidoId}`;

    await withButtonLock(btnId, async () => {
        // Simular latencia SET
        await new Promise(resolve => setTimeout(resolve, 2500));

        const resultado = await ventasDataFacturar(pedidoId);
        if (!resultado) {
            mostrarToast('Pedido no encontrado', 'error');
            return;
        }
        if (resultado.error) {
            mostrarToast(resultado.error, 'error');
            return;
        }

        const { pedido: pedidoActualizado, numFactura, cdc } = resultado;

        // Preparar modal factura
        document.getElementById('adminFacturaNumero').textContent = `N° ${numFactura} | CDC: ${cdc}`;

        const telefono = clienteInfo?.telefono || pedido.cliente?.telefono || '';
        const textoWA = `Factura Electronica HDV Distribuciones%0A` +
            `N°: ${numFactura}%0A` +
            `Fecha: ${tplFormatearFechaAdmin(pedido.fecha)}%0A` +
            `Cliente: ${pedido.cliente?.nombre}%0A` +
            `RUC: ${ruc}%0A` +
            `Total: ${formatearGuaranies(pedido.total)}%0A` +
            `CDC: ${cdc}%0A` +
            `Consulta: https://ekuatia.set.gov.py`;
        const telLimpio = telefono.replace(/\D/g, '');
        document.getElementById('adminFacturaWhatsApp').href = telLimpio
            ? `https://wa.me/595${telLimpio.replace(/^0/, '')}?text=${textoWA}`
            : `https://wa.me/?text=${textoWA}`;

        // Guardar referencia para impresion post-facturacion via closure
        _ultimaFactura = { pedido: pedidoActualizado, clienteInfo, numFactura, cdc };

        document.getElementById('modalFacturaAdmin').classList.add('show');

        // Refrescar lista pedidos
        cargarPedidos();

        lucide.createIcons();
    }, 'Procesando con la SET...')();
}

// Closure para impresion post-facturacion
let _ultimaFactura = null;

function adminImprimirVenta(formato) {
    if (!_ultimaFactura) return;
    imprimirConFormato(formato, _ultimaFactura.pedido, _ultimaFactura.clienteInfo);
}

function cerrarModalFacturaAdmin() {
    document.getElementById('modalFacturaAdmin').classList.remove('show');
}

// ============================================
// IMPRESION DUAL: Thermal / A4
// ============================================

function imprimirConFormato(formato, pedido, clienteInfo) {
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
        contentEl.innerHTML = tplTicketThermal(pedido, clienteInfo);
        document.body.classList.add('print-thermal');
        document.body.classList.remove('print-a4');
        pageStyle.textContent = '@page { margin: 0; size: 58mm auto; }';
    } else {
        printEl = document.getElementById('adminPrintA4');
        contentEl = document.getElementById('adminPrintA4Content');
        contentEl.innerHTML = tplDocA4(pedido, clienteInfo);
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

// ============================================
// RE-IMPRIMIR DESDE VENTAS
// ============================================

ventasCtrl.abrirReimpresion = function(ventaId) {
    // Guardar ID en data-attr del modal para evitar global mutable
    const modal = document.getElementById('modalElegirImpresion');
    modal.dataset.ventaId = ventaId;
    modal.classList.add('show');
    lucide.createIcons();
};

function cerrarModalElegirImpresion() {
    const modal = document.getElementById('modalElegirImpresion');
    modal.classList.remove('show');
    delete modal.dataset.ventaId;
    // Limpiar flag NC para evitar que quede activa
    window._reimprimirNCActiva = false;
}

async function ejecutarReimpresion(formato) {
    const modal = document.getElementById('modalElegirImpresion');
    const ventaId = modal.dataset.ventaId;
    if (!ventaId) return;

    const pedido = await ventasDataBuscarPedido(ventaId);
    if (!pedido) { mostrarToast('Venta no encontrada', 'error'); return; }

    const clienteInfo = ventasDataBuscarCliente(pedido.cliente?.id);
    cerrarModalElegirImpresion();
    imprimirConFormato(formato, pedido, clienteInfo);
}

// ============================================
// ENVIAR WHATSAPP DESDE VENTAS
// ============================================

ventasCtrl.enviarWhatsAppVenta = async function(ventaId) {
    const url = await ventasDataBuildWhatsAppURL(ventaId);
    if (url) window.open(url, '_blank');
};

// Mantener compatibilidad con onclick existentes en admin.html
function enviarWhatsAppVenta(ventaId) { ventasCtrl.enviarWhatsAppVenta(ventaId); }

// ============================================
// EXPORTAR VENTAS SEMANALES A CSV
// ============================================

async function exportarVentasSemanalesCSV() {
    const result = await ventasDataExportCSVSemanal();
    if (!result) {
        mostrarToast('No hay ventas esta semana para exportar', 'error');
        return;
    }
    descargarCSV(result.csv, result.filename);
    mostrarToast(`Exportadas ${result.count} ventas de la semana`, 'success');
}

// ============================================
// VER XML SIFEN (PRUEBA) — Edge Function
// ============================================

ventasCtrl.verXMLSifen = async function(pedidoId) {
    mostrarToast('Generando XML SIFEN...', 'info');

    try {
        const result = await ventasDataGenerarXMLSifen(pedidoId);

        // Guardar datos SIFEN en IndexedDB
        try {
            await ventasDataGuardarSifen(pedidoId, result);
            if (typeof cargarVentas === 'function') await cargarVentas();
        } catch (e) { console.warn('[SIFEN] Error guardando en IndexedDB:', e); }

        // Mostrar XML en modal
        _mostrarXMLSifenModal(result);

    } catch (err) {
        console.error('[SIFEN] Error:', err);
        mostrarToast(err.message || 'Error de conexion al generar XML SIFEN', 'error');
    }
};

// Mantener compatibilidad
function verXMLSifen(pedidoId) { ventasCtrl.verXMLSifen(pedidoId); }

// --- Estado SIFEN en closure ---
let _sifenState = { xml: '', cdc: '', soap: '' };

function _mostrarXMLSifenModal(result) {
    let modal = document.getElementById('modalXMLSifen');
    if (modal) modal.remove();

    // Guardar en closure
    _sifenState = { xml: result.xml || '', cdc: result.cdc || '', soap: result.soap_simulado || '' };

    modal = document.createElement('div');
    modal.id = 'modalXMLSifen';
    modal.className = 'fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4';
    modal.style.display = 'flex';
    modal.innerHTML = tplXMLSifenModal(result);

    document.body.appendChild(modal);
    lucide.createIcons();
}

ventasCtrl.sifenCambiarTab = function(tab) {
    const xmlEl = document.getElementById('sifenContentXml');
    const soapEl = document.getElementById('sifenContentSoap');
    const tabXml = document.getElementById('sifenTabXml');
    const tabSoap = document.getElementById('sifenTabSoap');
    if (!xmlEl || !soapEl) return;

    const activeClass = 'border-b-2 text-blue-600 bg-blue-50';
    const inactiveClass = 'border-b-2 border-transparent text-gray-500 hover:text-gray-700';

    if (tab === 'xml') {
        xmlEl.classList.remove('hidden');
        soapEl.classList.add('hidden');
        tabXml.className = `px-4 py-2 text-sm font-bold rounded-t-lg border-blue-600 ${activeClass}`;
        tabSoap.className = `px-4 py-2 text-sm font-bold rounded-t-lg ${inactiveClass}`;
    } else {
        xmlEl.classList.add('hidden');
        soapEl.classList.remove('hidden');
        tabSoap.className = `px-4 py-2 text-sm font-bold rounded-t-lg border-amber-600 ${activeClass.replace('blue', 'amber')}`;
        tabXml.className = `px-4 py-2 text-sm font-bold rounded-t-lg ${inactiveClass}`;
    }
};

// Mantener compatibilidad
function sifenCambiarTab(tab) { ventasCtrl.sifenCambiarTab(tab); }

ventasCtrl.copiarXMLSifen = function() {
    if (!_sifenState.xml) return;
    navigator.clipboard.writeText(_sifenState.xml).then(() => {
        mostrarToast('XML copiado al portapapeles', 'success');
    }).catch(() => {
        mostrarToast('Error al copiar', 'error');
    });
};

function copiarXMLSifen() { ventasCtrl.copiarXMLSifen(); }

ventasCtrl.descargarXMLSifen = function() {
    if (!_sifenState.xml) return;
    const blob = new Blob([_sifenState.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DTE_${_sifenState.cdc || 'sifen'}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast('XML descargado', 'success');
};

function descargarXMLSifen() { ventasCtrl.descargarXMLSifen(); }

ventasCtrl.descargarSOAPSifen = function() {
    if (!_sifenState.soap) return;
    const blob = new Blob([_sifenState.soap], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SOAP_${_sifenState.cdc || 'sifen'}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast('SOAP descargado', 'success');
};

function descargarSOAPSifen() { ventasCtrl.descargarSOAPSifen(); }

// ============================================
// IMPRIMIR KuDE
// ============================================

ventasCtrl.imprimirKuDE = async function(pedidoId) {
    const pedido = await ventasDataBuscarPedido(pedidoId);
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }

    const cdc = pedido.sifen_cdc || pedido.cdc || '';
    const numFactura = pedido.sifen_numFactura || pedido.numFactura || '';
    const qrUrl = pedido.sifen_qr_url || '';

    let modal = document.getElementById('modalKuDE');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'modalKuDE';
    modal.className = 'fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4';
    modal.style.display = 'flex';
    modal.innerHTML = tplKuDEModal(
        pedidoId, numFactura, cdc,
        pedido.cliente?.nombre || 'N/A',
        pedido.total, qrUrl
    );

    document.body.appendChild(modal);
    lucide.createIcons();
};

function imprimirKuDE(pedidoId) { ventasCtrl.imprimirKuDE(pedidoId); }

ventasCtrl.ejecutarImpresionKuDE = async function(pedidoId, formato) {
    const pedido = await ventasDataBuscarPedido(pedidoId);
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }

    const clienteInfo = ventasDataBuscarCliente(pedido.cliente?.id);

    const modalKuDE = document.getElementById('modalKuDE');
    if (modalKuDE) modalKuDE.remove();

    if (formato === 'thermal') {
        imprimirConFormato('thermal', pedido, clienteInfo);
        return;
    }

    // KuDE A4 oficial
    _imprimirKuDEA4(pedido, clienteInfo);
};

function ejecutarImpresionKuDE(pedidoId, formato) { ventasCtrl.ejecutarImpresionKuDE(pedidoId, formato); }

// ============================================
// KuDE A4 — Representacion Grafica Oficial SET
// ============================================

function _imprimirKuDEA4(pedido, clienteInfo) {
    const empresa = ventasDataObtenerEmpresa();
    const qrUrl = pedido.sifen_qr_url || '';
    const html = tplKuDEA4(pedido, clienteInfo, empresa);

    const printEl = document.getElementById('adminPrintA4');
    const contentEl = document.getElementById('adminPrintA4Content');
    contentEl.innerHTML = html;

    let pageStyle = document.getElementById('dynamicPageStyle');
    if (!pageStyle) {
        pageStyle = document.createElement('style');
        pageStyle.id = 'dynamicPageStyle';
        document.head.appendChild(pageStyle);
    }
    pageStyle.textContent = '@page { margin: 8mm; size: A4 portrait; }';
    document.body.classList.add('print-a4');
    document.body.classList.remove('print-thermal');
    printEl.classList.add('active');
    printEl.style.display = 'block';

    // Cargar QRCode.js y generar QR
    const qrTarget = contentEl.querySelector('#kudeQRCode');

    function generarQRyImprimir() {
        if (qrTarget && qrUrl && typeof QRCode !== 'undefined') {
            try {
                new QRCode(qrTarget, {
                    text: qrUrl,
                    width: 100,
                    height: 100,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M,
                });
            } catch (e) { console.warn('[KuDE] Error generando QR:', e); }
        }
        setTimeout(() => {
            window.print();
            printEl.classList.remove('active');
            printEl.style.display = 'none';
            document.body.classList.remove('print-a4');
            pageStyle.textContent = '';
        }, 400);
    }

    if (typeof QRCode !== 'undefined') {
        generarQRyImprimir();
    } else {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        script.onload = generarQRyImprimir;
        script.onerror = () => {
            console.warn('[KuDE] No se pudo cargar QRCode.js, imprimiendo sin QR');
            if (qrTarget) qrTarget.innerHTML = '<div style="width:100px;height:100px;border:1px solid #000;display:flex;align-items:center;justify-content:center;font-size:9px;text-align:center;">QR no<br>disponible</div>';
            generarQRyImprimir();
        };
        document.head.appendChild(script);
    }
}
