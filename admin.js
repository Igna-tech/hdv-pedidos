// ============================================
// HDV Admin Panel v5.0 - Controller
// Navegacion, inicializacion, cambios, backup, modales, busqueda global
// Modulos: js/admin/pedidos.js, dashboard.js, productos.js, clientes.js, creditos.js
// ============================================
let productosDataOriginal = null;
let cambiosSinGuardar = 0;
let stockFiltrado = [];
window._empresaLogoUrl = '';

// ============================================
// LAZY LOAD - IntersectionObserver for catalog cards
// ============================================
function initLazyLoadCards(containerEl) {
    const cards = (containerEl || document).querySelectorAll('.catalog-card[data-bg]');
    if (!cards.length) return;

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const card = entry.target;
            const url = card.dataset.bg;
            if (!url) return;
            const img = new Image();
            img.onload = () => {
                card.style.backgroundImage = `url('${url}')`;
                card.classList.add('catalog-card--loaded');
            };
            img.src = url;
            obs.unobserve(card);
        });
    }, { rootMargin: '200px 0px', threshold: 0.01 });

    cards.forEach(card => {
        if (!card.dataset.bg) { card.classList.add('catalog-card--loaded'); return; }
        observer.observe(card);
    });
}

// ============================================
// SVG EMPTY STATE ILLUSTRATIONS & SKELETONS
// ============================================
const SVG_ADMIN_EMPTY_ORDERS = `<svg viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="30" y="20" width="140" height="30" rx="8" stroke="#d1d5db" stroke-width="2" fill="#f3f4f6"/>
  <rect x="30" y="60" width="140" height="22" rx="6" stroke="#e5e7eb" stroke-width="1.5" fill="#f9fafb"/>
  <rect x="30" y="88" width="140" height="22" rx="6" stroke="#e5e7eb" stroke-width="1.5" fill="#f9fafb"/>
  <rect x="30" y="116" width="140" height="22" rx="6" stroke="#e5e7eb" stroke-width="1.5" fill="#f9fafb"/>
  <circle cx="160" cy="155" r="20" stroke="#d1d5db" stroke-width="2" fill="#f3f4f6"/>
  <path d="M153 155h14M160 148v14" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const SVG_ADMIN_EMPTY_PRODUCTS = `<svg viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="25" y="25" width="65" height="65" rx="12" stroke="#d1d5db" stroke-width="2" fill="#f3f4f6"/>
  <rect x="110" y="25" width="65" height="65" rx="12" stroke="#d1d5db" stroke-width="2" fill="#f3f4f6"/>
  <rect x="25" y="105" width="65" height="65" rx="12" stroke="#e5e7eb" stroke-width="1.5" fill="#f9fafb" stroke-dasharray="5 3"/>
  <path d="M50 130h15M57 123v14" stroke="#d1d5db" stroke-width="2" stroke-linecap="round"/>
  <rect x="35" y="45" width="20" height="3" rx="1.5" fill="#d1d5db"/><rect x="35" y="52" width="30" height="3" rx="1.5" fill="#e5e7eb"/>
  <rect x="120" y="45" width="25" height="3" rx="1.5" fill="#d1d5db"/><rect x="120" y="52" width="35" height="3" rx="1.5" fill="#e5e7eb"/>
</svg>`;

const SVG_ADMIN_EMPTY_CLIENTS = `<svg viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="60" r="28" stroke="#d1d5db" stroke-width="2.5" fill="#f3f4f6"/>
  <circle cx="100" cy="52" r="10" stroke="#d1d5db" stroke-width="2" fill="#f9fafb"/>
  <path d="M80 75c0-11 8.9-20 20-20s20 9 20 20" stroke="#d1d5db" stroke-width="2" fill="none"/>
  <path d="M60 120h80M70 135h60" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/>
  <path d="M75 150h50" stroke="#e5e7eb" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="4 3"/>
</svg>`;

function generarAdminEmptyState(svgIcon, titulo, subtitulo, botonTexto, botonOnclick) {
    return `<div class="empty-state">
        ${svgIcon}
        <p>${titulo}</p>
        ${subtitulo ? `<p class="empty-sub">${subtitulo}</p>` : ''}
        ${botonTexto ? `<sl-button data-action="${escapeHTML(botonOnclick)}" class="empty-action" variant="primary" size="small">${botonTexto}</sl-button>` : ''}
    </div>`;
}

// V2-A02: Whitelist dispatcher para empty-state buttons (reemplaza new Function)
// Mapa centralizado de acciones. Cada handler recibe (btn, arg) donde:
//   btn = elemento DOM que disparó el click
//   arg = btn.dataset.arg (string, puede ser undefined)
// Para args múltiples se usan dataset.arg1, dataset.arg2, etc.
const ACTION_DISPATCH = {
    // === Navegación ===
    'cambiarSeccion':                   (_, a) => cambiarSeccion(a),
    'toggleSidebar':                    ()     => toggleSidebar(),
    'cerrarBusquedaGlobal':             ()     => cerrarBusquedaGlobal(),
    'abrirBusquedaGlobal':              ()     => abrirBusquedaGlobal(),
    'abrirChatIA':                      ()     => typeof abrirChatIA === 'function' && abrirChatIA(),
    'toggleNotificaciones':             ()     => typeof toggleNotificaciones === 'function' && toggleNotificaciones(),
    'forzarActualizacionAdmin':         ()     => forzarActualizacionAdmin(),
    'cerrarSesion':                     ()     => cerrarSesion(),

    // === Dashboard / Cierre mensual ===
    'cambiarPeriodoChart':              (_, a) => typeof _cambiarPeriodoChart === 'function' && _cambiarPeriodoChart(a),
    'cambiarPeriodoLeaderboard':        (_, a) => typeof _cambiarPeriodoLeaderboard === 'function' && _cambiarPeriodoLeaderboard(a),
    'cambiarIntelTab':                  (_, a) => typeof _cambiarIntelTab === 'function' && _cambiarIntelTab(a),
    'sortTablaMargen':                  (_, a) => typeof _sortTablaMargen === 'function' && _sortTablaMargen(a),
    'filtrarRFMSegmento':               (_, a) => typeof _filtrarRFMPorSegmento === 'function' && _filtrarRFMPorSegmento(a),
    'exportarResumenMensualPDF':        ()     => exportarResumenMensualPDF(),
    'guardarResumenMensual':            ()     => guardarResumenMensual(),
    'previsualizarCierre':              ()     => previsualizarCierre(),
    'exportarLibroRG90':                ()     => exportarLibroRG90(),
    'exportarPaqueteZIP':               ()     => exportarPaqueteZIP(),
    'exportarLibroDiario':              ()     => exportarLibroDiario(),
    'generarResumenIVA':                ()     => generarResumenIVA(),

    // === Pedidos ===
    'filtrarPedidos':                   ()     => filtrarPedidos(),
    'exportarExcelPedidos':             ()     => exportarExcelPedidos(),

    // === Ventas ===
    'filtrarVentas':                    ()     => typeof filtrarVentas === 'function' && filtrarVentas(),
    'ventasSegmento':                   (_, a) => typeof setVentasSegmento === 'function' && setVentasSegmento(a),
    'exportarVentasSemanalesCSV':       ()     => typeof exportarVentasSemanalesCSV === 'function' && exportarVentasSemanalesCSV(),
    'paginaVentasFirst': ()    => typeof _paginaVentasCambiar === 'function' && _paginaVentasCambiar(1),
    'paginaVentasPrev':  ()    => typeof _paginaVentasCambiar === 'function' && _paginaVentasCambiar(Math.max(1, paginaVentas - 1)),
    'paginaVentasNext':  (btn) => typeof _paginaVentasCambiar === 'function' && _paginaVentasCambiar(Math.min(parseInt(btn.dataset.total || 1), paginaVentas + 1)),
    'paginaVentasLast':  (btn) => typeof _paginaVentasCambiar === 'function' && _paginaVentasCambiar(parseInt(btn.dataset.total || 1)),
    'verKudePDF':   (_, a) => typeof generarKudePDF === 'function' && generarKudePDF(a),
    'verKudePDFNC': ()    => { const id = document.getElementById('modalNCExito')?.dataset?.pedidoId; if (id && typeof generarKudePDF === 'function') generarKudePDF(id); },
    'cfgEmpresaLogoSeleccionar': () => document.getElementById('cfgEmpresaLogoInput')?.click(),
    'cfgEmpresaLogoQuitar': () => {
        window._empresaLogoUrl = '';
        const preview = document.getElementById('cfgEmpresaLogoPreview');
        const placeholder = document.getElementById('cfgEmpresaLogoPlaceholder');
        const btnQuitar = document.getElementById('btnCfgEmpresaLogoQuitar');
        if (preview) { preview.src = ''; preview.classList.add('hidden'); }
        if (placeholder) placeholder.classList.remove('hidden');
        if (btnQuitar) btnQuitar.classList.add('hidden');
    },

    // === Devoluciones ===
    'buscarFacturaDevolucion':          ()     => typeof buscarFacturaDevolucion === 'function' && buscarFacturaDevolucion(),
    'cancelarFactura48hs':              ()     => typeof cancelarFactura48hs === 'function' && cancelarFactura48hs(),
    'procesarNotaCredito':              ()     => typeof procesarNotaCredito === 'function' && procesarNotaCredito(),
    'limpiarDevolucion':                ()     => typeof limpiarDevolucion === 'function' && limpiarDevolucion(),
    'imprimirNC':                       (_, a) => typeof imprimirNC === 'function' && imprimirNC(a),
    'cerrarModalNC':                    ()     => typeof cerrarModalNC === 'function' && cerrarModalNC(),
    'reimprimirNC':                     (_, a) => typeof reimprimirNC === 'function' && reimprimirNC(a),

    // === Créditos ===
    'guardarConfigCreditos':            ()     => typeof guardarConfigCreditos === 'function' && guardarConfigCreditos(),
    'agregarCreditoManual':             ()     => typeof agregarCreditoManual === 'function' && agregarCreditoManual(),
    'editarMensajeRecordatorio':        ()     => typeof editarMensajeRecordatorio === 'function' && editarMensajeRecordatorio(),
    'toggleVistaCreditos':              (_, a) => typeof toggleVistaCreditos === 'function' && toggleVistaCreditos(a),
    'registrarPagoCredito':             (_, a) => typeof registrarPagoCredito === 'function' && registrarPagoCredito(a),
    'enviarRecordatorioWhatsApp':       (_, a) => typeof enviarRecordatorioWhatsApp === 'function' && enviarRecordatorioWhatsApp(a),
    'verHistorialPagos':                (_, a) => typeof verHistorialPagos === 'function' && verHistorialPagos(a),
    'marcarPagado':                     (_, a) => typeof marcarPagado === 'function' && marcarPagado(a),
    'editarPagosCreditoPedido':         (_, a) => typeof editarPagosCreditoPedido === 'function' && editarPagosCreditoPedido(a),
    'eliminarCreditoPedido':            (_, a) => typeof eliminarCreditoPedido === 'function' && eliminarCreditoPedido(a),
    'registrarPagoManual':              (_, a) => typeof registrarPagoManual === 'function' && registrarPagoManual(a),
    'enviarRecordatorioManualWhatsApp': (_, a) => typeof enviarRecordatorioManualWhatsApp === 'function' && enviarRecordatorioManualWhatsApp(a),
    'editarCreditoManualItem':          (_, a) => typeof editarCreditoManualItem === 'function' && editarCreditoManualItem(a),
    'eliminarCreditoManualItem':        (_, a) => typeof eliminarCreditoManualItem === 'function' && eliminarCreditoManualItem(a),
    'mostrarDetalleCredito':            (_, a) => typeof mostrarDetalleCredito === 'function' && mostrarDetalleCredito(a),

    // === Reportes ===
    'generarReporte':                   (_, a) => typeof generarReporte === 'function' && generarReporte(a),
    'exportarReporteVendedorCSV':       ()     => typeof exportarReporteVendedorCSV === 'function' && exportarReporteVendedorCSV(),

    // === Stock ===
    'stockNavegar':                     (_, a) => typeof stockNavegar === 'function' && stockNavegar(a),
    'guardarStock':                     ()     => typeof guardarStock === 'function' && guardarStock(),
    'guardarStockDesdePerfilProducto':  ()     => typeof guardarStockDesdePerfilProducto === 'function' && guardarStockDesdePerfilProducto(),
    'cerrarPerfilProducto':             ()     => typeof cerrarPerfilProducto === 'function' && cerrarPerfilProducto(),

    // === Productos ===
    'productosNavegar':                 (_, a) => typeof productosNavegar === 'function' && productosNavegar(a),
    'abrirModalCategorias':             ()     => typeof abrirModalCategorias === 'function' && abrirModalCategorias(),
    'abrirModalProducto':               ()     => typeof abrirModalProducto === 'function' && abrirModalProducto(),
    'cerrarModalProducto':              ()     => typeof cerrarModalProducto === 'function' && cerrarModalProducto(),
    'guardarProductoModal':             ()     => typeof guardarProductoModal === 'function' && guardarProductoModal(),
    'quitarImagenProducto':             ()     => typeof quitarImagenProducto === 'function' && quitarImagenProducto(),
    'agregarFilaVariante':              ()     => typeof agregarFilaVariante === 'function' && agregarFilaVariante(),
    'agregarCategoriaModal':            ()     => typeof agregarCategoriaModal === 'function' && agregarCategoriaModal(),

    // === Clientes ===
    'abrirModalCliente':                ()     => typeof abrirModalCliente === 'function' && abrirModalCliente(),
    'cerrarModalCliente':               ()     => typeof cerrarModalCliente === 'function' && cerrarModalCliente(),
    'guardarClienteModal':              ()     => typeof guardarClienteModal === 'function' && guardarClienteModal(),
    'abrirMinimapAdmin':                ()     => typeof abrirMinimapAdmin === 'function' && abrirMinimapAdmin(),
    'geocodificarEnMinimapa':           ()     => typeof geocodificarEnMinimapa === 'function' && geocodificarEnMinimapa(),
    'confirmarUbicacionAdmin':          ()     => typeof confirmarUbicacionAdmin === 'function' && confirmarUbicacionAdmin(),
    'cancelarMinimapAdmin':             ()     => typeof cancelarMinimapAdmin === 'function' && cancelarMinimapAdmin(),
    'limpiarUbicacionAdmin':            ()     => typeof limpiarUbicacionAdmin === 'function' && limpiarUbicacionAdmin(),
    'abrirPerfilCliente':               (_, a) => typeof abrirPerfilCliente === 'function' && abrirPerfilCliente(a),
    'cerrarPerfilCliente':              ()     => typeof cerrarPerfilCliente === 'function' && cerrarPerfilCliente(),
    'cambiarTabPerfil':                 (_, a) => typeof cambiarTabPerfil === 'function' && cambiarTabPerfil(a),
    'ordenarClientes':                  (_, a) => typeof ordenarClientes === 'function' && ordenarClientes(a),
    'paginaClientesFirst':              ()     => { if (typeof paginaClientes !== 'undefined') { paginaClientes = 1; mostrarClientesGestion(); } },
    'paginaClientesPrev':               ()     => { if (typeof paginaClientes !== 'undefined') { paginaClientes--; mostrarClientesGestion(); } },
    'paginaClientesNext':               ()     => { if (typeof paginaClientes !== 'undefined') { paginaClientes++; mostrarClientesGestion(); } },
    'paginaClientesLast':               (btn)  => { if (typeof paginaClientes !== 'undefined') { paginaClientes = parseInt(btn.dataset.total); mostrarClientesGestion(); } },
    'aprobarClientePendiente':          (_, a) => typeof aprobarClientePendiente === 'function' && aprobarClientePendiente(a),
    'rechazarClientePendiente':         (_, a) => typeof rechazarClientePendiente === 'function' && rechazarClientePendiente(a),
    'mostrarDetallePedidoCliente':      (_, a) => typeof mostrarDetallePedidoCliente === 'function' && mostrarDetallePedidoCliente(a),
    'renderizarPerfilHistorial':        ()     => typeof renderizarPerfilHistorial === 'function' && renderizarPerfilHistorial(),
    'exportarHistorialClienteCSV':      ()     => typeof exportarHistorialClienteCSV === 'function' && exportarHistorialClienteCSV(),
    'enviarWhatsAppReactivacion':       (btn)  => typeof enviarWhatsAppReactivacion === 'function' && enviarWhatsAppReactivacion(btn.dataset.tel, btn.dataset.nombre),
    'aplicarDescuentoCategoria':        ()     => typeof aplicarDescuentoCategoria === 'function' && aplicarDescuentoCategoria(),
    'copiarPreciosDeCliente':           ()     => typeof copiarPreciosDeCliente === 'function' && copiarPreciosDeCliente(),
    'importarPreciosCSV':               ()     => typeof importarPreciosCSV === 'function' && importarPreciosCSV(),
    'agregarPrecioEspecial':            ()     => typeof agregarPrecioEspecial === 'function' && agregarPrecioEspecial(),
    'eliminarPrecioEspecial':           (btn)  => typeof eliminarPrecioEspecial === 'function' && eliminarPrecioEspecial(btn.dataset.prodId, btn.dataset.tamano),

    // === Proveedores ===
    'cambiarTabProv':                   (_, a) => typeof _cambiarTabProv === 'function' && _cambiarTabProv(a),
    'abrirModalProveedor':              (_, a) => typeof abrirModalProveedor === 'function' && abrirModalProveedor(a),
    'guardarProveedor':                 ()     => typeof guardarProveedor === 'function' && guardarProveedor(),
    'cerrarModalProveedor':             ()     => typeof cerrarModalProveedor === 'function' && cerrarModalProveedor(),
    'eliminarProveedor':                (_, a) => typeof eliminarProveedor === 'function' && eliminarProveedor(a),
    'abrirModalOC':                     (_, a) => typeof abrirModalOC === 'function' && abrirModalOC(a),
    'guardarOC':                        ()     => typeof guardarOC === 'function' && guardarOC(),
    'cerrarModalOC':                    ()     => typeof cerrarModalOC === 'function' && cerrarModalOC(),
    'abrirDrawerOC':                    (_, a) => typeof abrirDrawerOC === 'function' && abrirDrawerOC(a),
    'cerrarDrawerOC':                   ()     => typeof cerrarDrawerOC === 'function' && cerrarDrawerOC(),
    'cambiarEstadoOC':                  (btn)  => typeof cambiarEstadoOC === 'function' && cambiarEstadoOC(btn.dataset.arg, btn.dataset.estado),
    'registrarPagoProveedor':           (_, a) => typeof registrarPagoProveedor === 'function' && registrarPagoProveedor(a),
    'cerrarModalPago':                  ()     => typeof cerrarModalPago === 'function' && cerrarModalPago(),
    'guardarPagoProveedor':             ()     => typeof _guardarPago === 'function' && _guardarPago(),
    'filtrarProveedores':               ()     => typeof _filtrarProveedores === 'function' && _filtrarProveedores(),
    'filtrarOC':                        ()     => typeof _filtrarOC === 'function' && _filtrarOC(),
    'agregarItemOC':                    ()     => typeof _agregarItemOC === 'function' && _agregarItemOC(),
    'eliminarItemOC':                   (_, a) => typeof _eliminarItemOC === 'function' && _eliminarItemOC(parseInt(a)),

    // === Promociones ===
    'abrirModalPromocion':              (_, a) => typeof abrirModalPromocion === 'function' && abrirModalPromocion(a),
    'cerrarModalPromocion':             ()     => typeof cerrarModalPromocion === 'function' && cerrarModalPromocion(),
    'guardarPromocion':                 ()     => typeof guardarPromocion === 'function' && guardarPromocion(),
    'togglePromocion':                  (_, a) => typeof togglePromocion === 'function' && togglePromocion(a),
    'eliminarPromocion':                (_, a) => typeof eliminarPromocion === 'function' && eliminarPromocion(a),

    // === Rendiciones / Gastos / Cuentas bancarias ===
    'cargarRendiciones':                ()     => typeof cargarRendiciones === 'function' && cargarRendiciones(),
    'exportarRendicionPDF':             ()     => typeof exportarRendicionPDF === 'function' && exportarRendicionPDF(),
    'agregarGastoAdmin':                ()     => typeof agregarGastoAdmin === 'function' && agregarGastoAdmin(),
    'eliminarGastoAdmin':               (_, a) => typeof eliminarGastoAdmin === 'function' && eliminarGastoAdmin(a),
    'abrirModalCuentaBancaria':         ()     => typeof abrirModalCuentaBancaria === 'function' && abrirModalCuentaBancaria(),
    'cerrarModalCuentaBancaria':        ()     => typeof cerrarModalCuentaBancaria === 'function' && cerrarModalCuentaBancaria(),
    'guardarCuentaBancaria':            ()     => typeof guardarCuentaBancaria === 'function' && guardarCuentaBancaria(),
    'editarCuentaBancaria':             (_, a) => typeof editarCuentaBancaria === 'function' && editarCuentaBancaria(a),
    'eliminarCuentaBancaria':           (_, a) => typeof eliminarCuentaBancaria === 'function' && eliminarCuentaBancaria(a),
    'aprobarRendicion':                 (_, a) => typeof aprobarRendicion === 'function' && aprobarRendicion(a),
    'marcarRendicionPagada':            (_, a) => typeof marcarRendicionPagada === 'function' && marcarRendicionPagada(a),

    // === Metas ===
    'abrirModalMeta':                   ()     => typeof abrirModalMeta === 'function' && abrirModalMeta(),
    'cerrarModalMeta':                  ()     => typeof cerrarModalMeta === 'function' && cerrarModalMeta(),
    'guardarMeta':                      ()     => typeof guardarMeta === 'function' && guardarMeta(),

    // === Configuración empresa ===
    'guardarConfigEmpresa':             ()     => guardarConfigEmpresa(),

    // === Herramientas / Backups ===
    'crearBackup':                      ()     => crearBackup(),
    'crearBackupSoloProductos':         ()     => crearBackupSoloProductos(),
    'crearBackupSoloPedidos':           ()     => crearBackupSoloPedidos(),
    'restaurarAutoBackupAdmin':         (_, a) => typeof restaurarAutoBackupAdmin === 'function' && restaurarAutoBackupAdmin(parseInt(a)),
    'descargarAutoBackupAdmin':         (_, a) => typeof descargarAutoBackupAdmin === 'function' && descargarAutoBackupAdmin(parseInt(a)),
    'toggleAccesoVendedor':             (btn)  => typeof toggleAccesoVendedor === 'function' && toggleAccesoVendedor(btn.dataset.uid, btn.dataset.activo === 'true'),
    'triggerRestaurarFile':             ()     => document.getElementById('restaurarFile').click(),
    'triggerImportarFile':              ()     => document.getElementById('importarFile').click(),
    'triggerImportarClientesFile':      ()     => document.getElementById('importarClientesFile').click(),
    'descargarPlantillaProductosCSV':   ()     => typeof descargarPlantillaProductosCSV === 'function' && descargarPlantillaProductosCSV(),
    'descargarPlantillaClientesCSV':    ()     => typeof descargarPlantillaClientesCSV === 'function' && descargarPlantillaClientesCSV(),
    'descargarPlantillaProductos':      ()     => typeof descargarPlantillaProductos === 'function' && descargarPlantillaProductos(),
    'descargarPlantillaClientes':       ()     => typeof descargarPlantillaClientes === 'function' && descargarPlantillaClientes(),
    'limpiarPedidos':                   ()     => limpiarPedidos(),
    'descartarCambios':                 ()     => descartarCambios(),
    'guardarTodosCambios':              ()     => guardarTodosCambios(),

    // === Modal editar pedido ===
    'agregarItemEditPedido':            ()     => typeof agregarItemEditPedido === 'function' && agregarItemEditPedido(),
    'generarPDFRemisionEditing':        ()     => typeof generarPDFRemision === 'function' && generarPDFRemision(pedidoEditandoId),
    'generarTicketTermicoEditing':      ()     => typeof generarTicketTermico === 'function' && generarTicketTermico(pedidoEditandoId),
    'cerrarModalEditarPedido':          ()     => typeof cerrarModalEditarPedido === 'function' && cerrarModalEditarPedido(),
    'guardarEdicionPedido':             ()     => typeof guardarEdicionPedido === 'function' && guardarEdicionPedido(),

    // === Forense / Mapeo importación ===
    'cerrarModalForense':               ()     => cerrarModalForense(),
    'cerrarModalMapeo':                 ()     => typeof cerrarModalMapeo === 'function' && cerrarModalMapeo(),
    'previsualizarImportacion':         ()     => typeof previsualizarImportacion === 'function' && previsualizarImportacion(),
    'confirmarImportacion':             ()     => typeof confirmarImportacion === 'function' && confirmarImportacion(),

    // === Gestión masiva de productos (Etapa 3) ===
    'masivo-ocultar':                   ()     => typeof masivoCambiarVisibilidad === 'function' && masivoCambiarVisibilidad(true),
    'masivo-mostrar':                   ()     => typeof masivoCambiarVisibilidad === 'function' && masivoCambiarVisibilidad(false),
    'masivo-cambiar-cat':               ()     => typeof masivoCambiarCategoria === 'function' && masivoCambiarCategoria(),
    'masivo-eliminar':                  ()     => typeof masivoEliminar === 'function' && masivoEliminar(),
    'limpiar-seleccion-productos':      ()     => typeof limpiarSeleccionProductos === 'function' && limpiarSeleccionProductos(),
    'seleccionar-todo-productos':       ()     => typeof seleccionarTodosProductos === 'function' && seleccionarTodosProductos(),
    'exportarProductosCSV':             ()     => typeof exportarProductosCSV === 'function' && exportarProductosCSV(),

    // === Estadísticas de catálogo (Etapa 6) ===
    'abrirEstadisticasCatalogo':        ()     => typeof abrirEstadisticasCatalogo === 'function' && abrirEstadisticasCatalogo(),
    'cerrarEstadisticasCatalogo':       ()     => typeof cerrarEstadisticasCatalogo === 'function' && cerrarEstadisticasCatalogo(),
    'cambiarPeriodoStats':              (_, a) => typeof cambiarPeriodoStats === 'function' && cambiarPeriodoStats(a),
    'activarFiltroStockBajo':           ()     => typeof activarFiltroStockBajo === 'function' && activarFiltroStockBajo(),

    // === Precios y márgenes (Etapa 5) ===
    'masivo-ajustar-precios':           ()     => typeof masivoAjustarPrecios === 'function' && masivoAjustarPrecios(),
    'verMargenesCatalogo':              ()     => typeof verMargenesCatalogo === 'function' && verMargenesCatalogo(),
    'cerrarModalMargenes':              ()     => typeof cerrarModalMargenes === 'function' && cerrarModalMargenes(),
    'abrirHistorialPrecios':            ()     => typeof abrirHistorialPrecios === 'function' && abrirHistorialPrecios(),
    'cerrarModalHistorialPrecios':      ()     => typeof cerrarModalHistorialPrecios === 'function' && cerrarModalHistorialPrecios(),
    'limpiarHistorialPrecios':          ()     => typeof limpiarHistorialPrecios === 'function' && limpiarHistorialPrecios(),

    // === SIFEN Estado ===
    'verDetalleSifen':    (_, a) => typeof verDetalleSifen === 'function' && verDetalleSifen(a),
    'irAVentasSifen':     (_, a) => typeof irAVentasSifen === 'function' && irAVentasSifen(a),
    'filtrarSifenEstado': ()     => typeof filtrarSifenEstado === 'function' && filtrarSifenEstado(),
    'exportarSifenCSV':   ()     => typeof exportarSifenCSV === 'function' && exportarSifenCSV(),
    'copiarCDCDTE':       (_, a) => navigator.clipboard?.writeText(a).then(() => mostrarToast('CDC copiado', 'success')).catch(() => mostrarToast('No se pudo copiar', 'error')),

    // === Ventas (nuevo sistema tabla + drawer) ===
    'abrirDetalleVenta':            (_, a) => typeof abrirDetalleVenta === 'function' && abrirDetalleVenta(a),
    'facturarDesdeDetalle':         (_, a) => typeof facturarDesdeDetalle === 'function' && facturarDesdeDetalle(a),
    'editarPedidoDesdeDetalle':     (_, a) => typeof editarPedidoDesdeDetalle === 'function' && editarPedidoDesdeDetalle(a),
    'anularDocumentoDesdeDetalle':  (_, a) => typeof anularDocumentoDesdeDetalle === 'function' && anularDocumentoDesdeDetalle(a),
    'reimprimirDesdeDetalle':       (_, a) => typeof reimprimirDesdeDetalle === 'function' && reimprimirDesdeDetalle(a),
    'whatsappDesdeDetalle':         (_, a) => typeof whatsappDesdeDetalle === 'function' && whatsappDesdeDetalle(a),
    'kudeDesdeDetalle':             (_, a) => typeof kudeDesdeDetalle === 'function' && kudeDesdeDetalle(a),
    'ncDesdeDetalle':               (_, a) => typeof ncDesdeDetalle === 'function' && ncDesdeDetalle(a),
    'reimprimirNCDesdeDetalle':     (_, a) => typeof reimprimirNCDesdeDetalle === 'function' && reimprimirNCDesdeDetalle(a),

    // === Mis DTEs ===
    'cerrarDrawerDetalleVenta': () => document.getElementById('drawerDetalleVenta')?.hide(),
    'seleccionarTipoDTE':   (_, a) => typeof seleccionarTipoDTE === 'function' && seleccionarTipoDTE(a),
    'emitirDTE':            ()     => typeof emitirDTE === 'function' && emitirDTE(),
    'cerrarDrawerDTE':      ()     => typeof cerrarDrawerDTE === 'function' && cerrarDrawerDTE(),
    'limpiarFormDTE':       ()     => typeof limpiarFormDTE === 'function' && limpiarFormDTE(),
    'agregarItemDTE':       ()     => typeof agregarItemDTE === 'function' && agregarItemDTE(),
    'quitarItemDTE':        (_, a) => typeof quitarItemDTE === 'function' && quitarItemDTE(parseInt(a)),
    'cargarDTES':           ()     => typeof cargarDTES === 'function' && cargarDTES(),
    'filtrarDTES':          ()     => typeof filtrarDTES === 'function' && filtrarDTES(),
    'exportarDTEScsv':      ()     => typeof exportarDTEScsv === 'function' && exportarDTEScsv(),
    'seleccionarClienteDTE': (_, a) => typeof seleccionarClienteDTE === 'function' && seleccionarClienteDTE(a),
    'seleccionarProductoDTE': (btn) => typeof seleccionarProductoDTE === 'function' && seleccionarProductoDTE(parseInt(btn.dataset.idx), btn.dataset.prodId, btn.dataset.varId),
    'buscarFacturaNCRef':    ()     => typeof buscarFacturaNCRef === 'function' && buscarFacturaNCRef(),
    'seleccionarFacturaNC':  (_, a) => typeof seleccionarFacturaNC === 'function' && seleccionarFacturaNC(a),
};

document.addEventListener('click', function(e) {
    // Navegación por sección (sidebar)
    const navBtn = e.target.closest('[data-section]');
    if (navBtn) { cambiarSeccion(navBtn.getAttribute('data-section')); return; }

    // Acciones generales
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const arg = btn.getAttribute('data-arg') ?? undefined;
    if (ACTION_DISPATCH[action]) {
        ACTION_DISPATCH[action](btn, arg);
    } else {
        console.warn('[Admin] Accion no registrada:', action);
    }
});

// Bindings para eventos que no son click (oninput, onchange)
document.addEventListener('DOMContentLoaded', () => {
    // oninput en sl-input usa el evento 'sl-input' de Shoelace
    document.getElementById('globalSearchInput')
        ?.addEventListener('sl-input', () => ejecutarBusquedaGlobalDebounced());
    document.getElementById('buscarStock')
        ?.addEventListener('sl-input', () => typeof filtrarStockDebounced === 'function' && filtrarStockDebounced());
    document.getElementById('buscarProducto')
        ?.addEventListener('sl-input', () => typeof filtrarProductosDebounced === 'function' && filtrarProductosDebounced());
    document.getElementById('buscarCliente')
        ?.addEventListener('sl-input', () => typeof filtrarClientesDebounced === 'function' && filtrarClientesDebounced());
    document.getElementById('sifenBusqueda')
        ?.addEventListener('sl-input', () => typeof filtrarSifenEstado === 'function' && filtrarSifenEstado());
    document.getElementById('sifenFiltroEstado')
        ?.addEventListener('sl-change', () => typeof filtrarSifenEstado === 'function' && filtrarSifenEstado());
    document.getElementById('dtesBusqueda')
        ?.addEventListener('sl-input', () => typeof filtrarDTES === 'function' && filtrarDTES());
    document.getElementById('dtesFiltroTipo')
        ?.addEventListener('sl-change', () => typeof filtrarDTES === 'function' && filtrarDTES());
    document.getElementById('filtroFechaVentasDesde')
        ?.addEventListener('sl-change', () => typeof filtrarVentas === 'function' && filtrarVentas());
    document.getElementById('filtroFechaVentasHasta')
        ?.addEventListener('sl-change', () => typeof filtrarVentas === 'function' && filtrarVentas());
    document.getElementById('filtroTipoVenta')
        ?.addEventListener('sl-change', () => typeof filtrarVentas === 'function' && filtrarVentas());
    document.getElementById('filtroVendedorVentas')
        ?.addEventListener('sl-change', () => typeof filtrarVentas === 'function' && filtrarVentas());
    document.getElementById('filtroTextoVentas')
        ?.addEventListener('sl-input', () => typeof filtrarVentas === 'function' && filtrarVentas());

    // Proveedores — filtros
    document.getElementById('buscarProveedor')
        ?.addEventListener('sl-input', () => typeof _filtrarProveedores === 'function' && _filtrarProveedores());
    document.getElementById('filtroCategoriaProveedor')
        ?.addEventListener('sl-change', () => typeof _filtrarProveedores === 'function' && _filtrarProveedores());
    document.getElementById('mostrarInactivosProv')
        ?.addEventListener('sl-change', () => typeof _filtrarProveedores === 'function' && _filtrarProveedores());
    document.getElementById('filtroOCEstado')
        ?.addEventListener('sl-change', () => typeof _filtrarOC === 'function' && _filtrarOC());
    document.getElementById('filtroOCProveedor')
        ?.addEventListener('sl-change', () => typeof _filtrarOC === 'function' && _filtrarOC());

    // onchange en file inputs nativos
    document.getElementById('restaurarFile')
        ?.addEventListener('change', (e) => restaurarBackup(e));
    document.getElementById('importarFile')
        ?.addEventListener('change', (e) => typeof importarProductosExcel === 'function' && importarProductosExcel(e));
    document.getElementById('importarClientesFile')
        ?.addEventListener('change', (e) => typeof importarClientesExcel === 'function' && importarClientesExcel(e));
    document.getElementById('productImageInput')
        ?.addEventListener('change', (e) => typeof previsualizarImagenProducto === 'function' && previsualizarImagenProducto(e));
}, { once: true });

function generarSkeletonTabla(filas = 5, columnas = 4) {
    let html = '<div class="overflow-hidden rounded-xl border border-gray-200 bg-white">';
    html += '<div class="flex gap-4 p-4 bg-gray-50 border-b border-gray-200">';
    for (let c = 0; c < columnas; c++) {
        const w = c === 0 ? 'w-1/4' : c === columnas - 1 ? 'w-16' : 'w-1/5';
        html += `<div class="skeleton h-4 ${w}"></div>`;
    }
    html += '</div>';
    for (let r = 0; r < filas; r++) {
        html += '<div class="flex gap-4 p-4 border-b border-gray-100">';
        for (let c = 0; c < columnas; c++) {
            const w = c === 0 ? 'w-1/3' : c === columnas - 1 ? 'w-16' : 'w-1/4';
            html += `<div class="skeleton h-3.5 ${w}"></div>`;
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function generarSkeletonCards(count = 6) {
    let html = '<div class="catalog-grid">';
    for (let i = 0; i < count; i++) {
        html += `<div class="rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100">
            <div class="skeleton w-full" style="aspect-ratio:1/1"></div>
        </div>`;
    }
    html += '</div>';
    return html;
}

// ============================================
// NAVEGACION
// ============================================
let _seccionActiva = 'pedidos';

// Callback global: supabase-config.js lo invoca cuando llega un update realtime de config
function _hdvRefrescarSeccionActiva(docId) {
    const mapeoDocSeccion = {
        'creditos_manuales': 'creditos',
        'pagos_credito': 'creditos',
        'promociones': 'promociones',
        'rendiciones': 'rendiciones',
        'metas_vendedor': 'metas',
        'gastos_vendedor': 'rendiciones',
        'cuentas_bancarias': 'rendiciones'
    };
    const seccion = mapeoDocSeccion[docId];
    if (seccion && seccion === _seccionActiva) {
        console.log('[Admin] Re-renderizando seccion activa por update realtime:', docId);
        if (seccion === 'creditos' && typeof cargarCreditos === 'function') cargarCreditos();
        if (seccion === 'promociones' && typeof cargarPromociones === 'function') cargarPromociones();
        if (seccion === 'rendiciones' && typeof cargarRendiciones === 'function') cargarRendiciones();
        if (seccion === 'metas' && typeof cargarMetas === 'function') cargarMetas();
    }
}

function cambiarSeccion(seccionId) {
    _seccionActiva = seccionId;
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const seccion = document.getElementById(`seccion-${seccionId}`);
    if (seccion) { seccion.classList.add('active'); seccion.style.display = 'block'; }

    const contentArea = document.getElementById('adminContentArea');
    if (contentArea) contentArea.scrollTop = 0;

    const btn = document.querySelector(`button[data-section="${seccionId}"]`);
    if (btn) btn.classList.add('active');

    const titulos = {
        'dashboard': 'Dashboard', 'pedidos': 'Pedidos Entrantes', 'ventas': 'Ventas',
        'cierre': 'Cierre Mensual',
        'creditos': 'Control de Creditos',
        'reportes': 'Analisis y Reportes', 'stock': 'Inventario',
        'productos': 'Catalogo de Productos', 'clientes': 'Base de Datos de Clientes',
        'promociones': 'Motor de Promociones',
        'rendiciones': 'Rendiciones de Caja', 'metas': 'Metas y Comisiones',
        'inactivos': 'Clientes en Riesgo', 'forense': 'Seguridad / Forense',
        'herramientas': 'Sistema y Herramientas',
        'sifen-estado': 'Consulta de Estado DTE / SIFEN',
        'dtes': 'Mis DTEs',
        'proveedores': 'Proveedores',
    };
    const titleEl = document.getElementById('currentSectionTitle');
    if (titleEl) titleEl.textContent = titulos[seccionId] || 'Panel Admin';

    // Cargar datos al entrar
    if (seccionId === 'pedidos') {
        const listaPed = document.getElementById('listaPedidos');
        if (listaPed && todosLosPedidos.length === 0) listaPed.innerHTML = generarSkeletonTabla(5, 4);
        cargarPedidos();
    }
    if (seccionId === 'productos') { productosFiltrados = [...productosData.productos]; mostrarProductosGestion(); }
    if (seccionId === 'clientes') { clientesFiltrados = [...productosData.clientes]; mostrarClientesGestion(); }
    if (seccionId === 'creditos') cargarCreditos();
    if (seccionId === 'stock') cargarStock();
    if (seccionId === 'herramientas') { actualizarInfoBackupAdmin(); cargarListaVendedores(); }
    if (seccionId === 'dashboard') cargarDashboard();
    if (seccionId === 'promociones') cargarPromociones();
    if (seccionId === 'rendiciones') cargarRendiciones();
    if (seccionId === 'metas') cargarMetas();
    if (seccionId === 'ventas' && typeof cargarVentas === 'function') cargarVentas();
    if (seccionId === 'dtes' && typeof cargarDTES === 'function') cargarDTES();
    if (seccionId === 'cierre' && typeof inicializarCierreMensual === 'function') inicializarCierreMensual();
    if (seccionId === 'inactivos') cargarClientesInactivos();
    if (seccionId === 'forense') { renderForenseFraudes(); renderForenseLogs(); }
    if (seccionId === 'sifen-estado' && typeof cargarSifenEstado === 'function') cargarSifenEstado();
    if (seccionId === 'proveedores' && typeof cargarProveedores === 'function') cargarProveedores();

    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Cerrar sidebar en mobile al navegar
    if (window.innerWidth <= 1024) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
    }
}

// ============================================
// CAMBIOS SIN GUARDAR
// ============================================
function registrarCambio() {
    if (cambiosSinGuardar === 0) {
        crearAutoBackupAdmin('Antes de ediciones'); // fire-and-forget async
    }
    cambiosSinGuardar++;
    actualizarBarraCambios();
}

function actualizarBarraCambios() {
    const bar = document.getElementById('unsavedBar');
    const badge = document.getElementById('unsavedCount');
    if (bar && badge) {
        if (cambiosSinGuardar > 0) { bar.classList.add('visible'); badge.textContent = cambiosSinGuardar; }
        else { bar.classList.remove('visible'); }
    }
}

async function guardarTodosCambios() {
    await withButtonLock('btnGuardarSync', async () => {
        cambiosSinGuardar = 0;
        actualizarBarraCambios();
        productosDataOriginal = JSON.parse(JSON.stringify(productosData));

        const dataLimpia = { categorias: productosData.categorias, productos: productosData.productos, clientes: productosData.clientes };
        await HDVStorage.setItem('hdv_catalogo_local', dataLimpia);
        console.log('[Admin] Catalogo guardado en IndexedDB');

        if (typeof guardarCatalogo === 'function') {
            console.log('[Admin] Llamando guardarCatalogo...');
            const dataParaSync = { categorias: productosData.categorias, productos: productosData.productos, clientes: productosData.clientes };
            const ok = await guardarCatalogo(dataParaSync);
            console.log('[Admin] Resultado guardarCatalogo:', ok);
            if (ok) {
                mostrarToast('Cambios guardados y sincronizados. Los vendedores ya ven los cambios.', 'success');
            } else {
                mostrarToast('Error al sincronizar con Supabase. Revisa la consola (F12) para mas detalles. Cambios guardados localmente.', 'warning');
            }
        } else {
            console.error('[Admin] guardarCatalogo no esta definida. supabase-config.js puede tener un error de carga.');
            mostrarToast('Error: modulo de sincronizacion no cargado. Cambios guardados localmente.', 'error');
        }
    }, 'Sincronizando...')();
}

async function descartarCambios() {
    if (!await mostrarConfirmModal('¿Descartar todos los cambios? Se perderan las modificaciones.', { destructivo: true, textoConfirmar: 'Descartar' })) return;
    productosData = JSON.parse(JSON.stringify(productosDataOriginal));
    productosFiltrados = [...productosData.productos];
    clientesFiltrados = [...productosData.clientes];
    cambiosSinGuardar = 0;
    actualizarBarraCambios();
    mostrarProductosGestion();
    mostrarClientesGestion();
}

window.addEventListener('beforeunload', (e) => {
    if (cambiosSinGuardar > 0) { e.preventDefault(); e.returnValue = ''; }
});

// ============================================
// INICIALIZACION
// ============================================
let unsubscribePedidos = null;

// Flag global: suprime toasts info/success durante carga inicial
window._hdvAppReady = false;

document.addEventListener('DOMContentLoaded', async () => {
    // V2-M03: Verificacion server-side del rol admin (no confiar solo en window.hdvUsuario)
    try {
        const { data: rol } = await supabaseClient.rpc('obtener_mi_rol');
        if (rol !== 'admin') {
            console.warn('[Admin] Rol server-side no es admin:', rol);
            window.location.replace('/');
            return;
        }
    } catch (err) {
        console.error('[Admin] Error verificando rol server-side:', err);
        window.location.replace('/login.html');
        return;
    }

    await Promise.all([
        cargarDatosIniciales(),
        typeof esperarDatosNegocio === 'function' ? esperarDatosNegocio() : Promise.resolve()
    ]);
    cargarConfigEmpresa();

    if (typeof escucharPedidosRealtime === 'function') {
        unsubscribePedidos = await escucharPedidosRealtime((pedidos, cambios, errorConexion) => {
            // Carga inicial: pedidos es el array completo (puede ser null si Supabase falló y IndexedDB vacía)
            if (pedidos !== null || errorConexion) {
                if (pedidos !== null) {
                    todosLosPedidos = pedidos;
                    aplicarFiltrosPedidos();
                }
                if (errorConexion) {
                    console.warn('[Admin] Error carga pedidos:', errorConexion.message);
                    if (typeof _pedidosBannerMostrar === 'function') {
                        _pedidosBannerMostrar(pedidos !== null ? 'stale' : 'error');
                    }
                } else if (typeof _pedidosBannerOcultar === 'function') {
                    _pedidosBannerOcultar();
                }
                console.log(`[Admin] Carga inicial pedidos: ${pedidos?.length ?? 0}${errorConexion ? ' (caché local)' : ''}`);
                if (pedidos !== null) {
                    document.dispatchEvent(new CustomEvent('hdv:pedidos-rt', { detail: { pedidos: todosLosPedidos, cambio: null } }));
                }
                return;
            }

            // Delta sync: pedidos es null, cambios tiene el evento granular
            const cambio = cambios[0];
            if (!cambio) return;

            if (cambio.type === 'updated') {
                const idx = todosLosPedidos.findIndex(p => p.id === cambio.pedidoId);
                if (idx >= 0) {
                    todosLosPedidos[idx] = { ...todosLosPedidos[idx], ...cambio.datos, sincronizado: true };
                    // Intentar actualizar solo la tarjeta en DOM (preserva pagina)
                    if (!actualizarTarjetaPedidoAdminDOM(cambio.pedidoId, cambio.datos.estado)) {
                        aplicarFiltrosPedidos(false);
                    }
                }
            } else if (cambio.type === 'deleted') {
                todosLosPedidos = todosLosPedidos.filter(p => p.id !== cambio.pedidoId);
                eliminarTarjetaPedidoAdminDOM(cambio.pedidoId);
                actualizarEstadisticasPedidos(todosLosPedidos);
            } else if (cambio.type === 'added') {
                if (!todosLosPedidos.find(p => p.id === cambio.pedidoId)) {
                    todosLosPedidos.push({ ...cambio.datos, sincronizado: true });
                }
                aplicarFiltrosPedidos(false);
                // Flash visual en titulo
                const badge = document.getElementById('currentSectionTitle');
                if (badge && badge.textContent.includes('Pedidos')) {
                    badge.style.transition = 'color 0.3s';
                    badge.style.color = '#059669';
                    setTimeout(() => badge.style.color = '', TIEMPOS.PAGE_RELOAD_MS);
                }
            }
            document.dispatchEvent(new CustomEvent('hdv:pedidos-rt', { detail: { pedidos: todosLosPedidos, cambio } }));
            console.log(`[Admin] Delta sync: ${cambio.type} pedido ${cambio.pedidoId || ''}`);
        });
        console.log('[Admin] Escuchando pedidos en tiempo real (delta sync) desde Supabase');
    } else {
        cargarPedidos();
        setInterval(cargarPedidos, TIEMPOS.HEALTH_CHECK_INTERVAL_MS);
    }

    // Sin fecha pre-seleccionada: el filtro de estado (pendiente) es el filtro primario

    const hoy = new Date();
    const hace30 = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
    const desde = document.getElementById('reporteFechaDesde');
    const hasta = document.getElementById('reporteFechaHasta');
    if (desde) desde.valueAsDate = hace30;
    if (hasta) hasta.valueAsDate = hoy;

    cambiarSeccion('pedidos');

    const autoBackupToggle = document.getElementById('adminAutoBackupToggle');
    if (autoBackupToggle) {
        autoBackupToggle.checked = (await HDVStorage.getItem('hdv_admin_auto_backup')) !== 'false';
        autoBackupToggle.addEventListener('sl-change', () => toggleAdminAutoBackup());
    }

    if (typeof actualizarBadgeCreditosVencer === 'function') actualizarBadgeCreditosVencer();

    // Marcar app lista — los toasts info/success se desbloquean despues de la carga inicial
    setTimeout(() => { window._hdvAppReady = true; }, TIEMPOS.SYNC_DELAY_ONLINE_MS);
});

async function cargarDatosIniciales() {
    await HDVStorage.ready();
    try {
        let data = null;

        if (typeof obtenerCatalogo === 'function') {
            try {
                data = await obtenerCatalogo();
                if (data && data.productos) {
                    console.log('[Admin] Catalogo cargado desde Supabase (' + data.productos.length + ' productos)');
                } else {
                    data = null;
                }
            } catch (e) { console.warn('[Admin] Supabase no disponible:', e.message); data = null; }
        }

        if (!data || !data.productos) {
            try {
                const local = await HDVStorage.getItem('hdv_catalogo_local');
                if (local) {
                    data = local;
                    if (data && data.productos) {
                        console.log('[Admin] Catalogo cargado desde IndexedDB (' + data.productos.length + ' productos)');
                    } else { data = null; }
                }
            } catch (e) { data = null; }
        }

        if (!data || !data.productos) {
            const response = await fetch('productos.json?t=' + Date.now());
            data = await response.json();
            console.log('[Admin] Catalogo cargado desde JSON local (' + (data.productos?.length || 0) + ' productos)');
        }

        productosData = data;
        productosDataOriginal = JSON.parse(JSON.stringify(productosData));
        productosFiltrados = [...productosData.productos];
        clientesFiltrados = [...productosData.clientes];
        // Costos pueden haber cambiado → invalidar cache de ganancia
        if (typeof bumpGananciaCache === 'function') bumpGananciaCache();

        const filterCliente = document.getElementById('filtroCliente');
        if (filterCliente) {
            productosData.clientes.forEach(c => {
                const opt = document.createElement('sl-option');
                opt.value = c.id;
                opt.textContent = c.razon_social || c.nombre || c.id;
                filterCliente.appendChild(opt);
            });
        }
    } catch (error) { console.error('Error cargando datos:', error); }
}

// ============================================
// CONTROL DE ACCESO - BOTON DE PANICO
// ============================================
async function cargarListaVendedores() {
    const container = document.getElementById('listaVendedores');
    if (!container) return;
    try {
        const { data, error } = await supabaseClient.from('perfiles').select('id, nombre_completo, rol, activo');
        if (error) throw error;
        const vendedores = (data || []).filter(p => p.rol === 'vendedor');
        if (vendedores.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-400 italic">Sin vendedores registrados</p>';
            return;
        }
        container.innerHTML = vendedores.map(v => `
            <div class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full ${v.activo ? 'bg-green-500' : 'bg-red-500'}"></span>
                    <span class="text-sm font-medium text-gray-700">${escapeHTML(v.nombre_completo || 'Sin nombre')}</span>
                    <span class="text-[10px] text-gray-400">${v.activo ? 'Activo' : 'Bloqueado'}</span>
                </div>
                <sl-button data-action="toggleAccesoVendedor" data-uid="${escapeHTML(v.id)}" data-activo="${v.activo}"
                    variant="${v.activo ? 'danger' : 'success'}" size="small">
                    ${v.activo ? 'Bloquear' : 'Reactivar'}
                </sl-button>
            </div>
        `).join('');
    } catch (err) {
        console.error('[Admin] Error cargando vendedores:', err);
        container.innerHTML = '<p class="text-xs text-red-400">Error cargando vendedores</p>';
    }
}

async function toggleAccesoVendedor(userId, estaActivo) {
    const accion = estaActivo ? 'BLOQUEAR' : 'REACTIVAR';
    const msg = estaActivo
        ? 'Se borraran los datos locales del dispositivo y se bloqueara la sincronizacion.'
        : 'El vendedor podra iniciar sesion y sincronizar nuevamente.';
    if (!await mostrarConfirmModal(`¿${accion} este vendedor?\n${msg}`, { destructivo: estaActivo, textoConfirmar: accion })) return;
    try {
        const { error } = await supabaseClient.from('perfiles').update({ activo: !estaActivo, actualizado_en: new Date().toISOString() }).eq('id', userId);
        if (error) throw error;
        mostrarToast(`Vendedor ${estaActivo ? 'bloqueado' : 'reactivado'}`, estaActivo ? 'error' : 'success');
        cargarListaVendedores();
    } catch (err) {
        console.error('[Admin] Error toggle acceso:', err);
        mostrarToast('Error al cambiar estado del vendedor', 'error');
    }
}

// ============================================
// CENTRO DE COMANDO FORENSE
// ============================================

// --- Cache de nombres de perfiles para audit logs ---
let _perfilesCache = null;
async function obtenerPerfilesMap() {
    if (_perfilesCache) return _perfilesCache;
    try {
        const { data } = await supabaseClient.from('perfiles').select('id, nombre_completo');
        _perfilesCache = {};
        (data || []).forEach(p => { _perfilesCache[p.id] = p.nombre_completo || 'Sin nombre'; });
    } catch (e) { _perfilesCache = {}; }
    return _perfilesCache;
}

// --- MODULO 1: RADAR DE FRAUDES ---
async function renderForenseFraudes() {
    const container = document.getElementById('forenseFraudes');
    if (!container) return;
    container.innerHTML = generarSkeletonTabla(3, 5);
    try {
        const { data, error } = await supabaseClient
            .from('pedidos')
            .select('id, fecha, datos, vendedor_id, creado_en')
            .filter('datos->>alerta_fraude', 'eq', 'true')
            .order('creado_en', { ascending: false })
            .limit(30);
        if (error) throw error;

        const perfiles = await obtenerPerfilesMap();

        if (!data || data.length === 0) {
            container.innerHTML = `<div class="text-center py-6">
                <i data-lucide="shield-check" class="w-10 h-10 text-green-400 mx-auto mb-2"></i>
                <p class="text-sm font-medium text-green-600">Sin alertas de fraude</p>
                <p class="text-xs text-gray-400 mt-1">El sistema no ha detectado manipulaciones de precios</p>
            </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        let html = `<div class="overflow-x-auto rounded-xl border border-red-200">
            <table class="w-full text-sm">
                <thead><tr class="bg-red-50 text-left">
                    <th class="px-3 py-2 text-xs font-bold text-red-700">Fecha</th>
                    <th class="px-3 py-2 text-xs font-bold text-red-700">Vendedor</th>
                    <th class="px-3 py-2 text-xs font-bold text-red-700">Cliente</th>
                    <th class="px-3 py-2 text-xs font-bold text-red-700 text-right">Total</th>
                    <th class="px-3 py-2 text-xs font-bold text-red-700 text-center">Detalle</th>
                </tr></thead><tbody class="divide-y divide-red-100">`;

        data.forEach(p => {
            const d = p.datos || {};
            const vendedor = perfiles[p.vendedor_id] || 'Desconocido';
            const clienteNombre = d.cliente?.nombre || 'N/A';
            const total = d.total || 0;
            const fecha = p.fecha || p.creado_en?.substring(0, 10) || '';
            const detalle = d.fraude_detalle || 'Sin detalle';

            html += `<tr class="bg-red-50/50 hover:bg-red-100/50">
                <td class="px-3 py-2 text-xs text-gray-600">${escapeHTML(fecha)}</td>
                <td class="px-3 py-2 text-xs font-medium text-gray-800">${escapeHTML(vendedor)}</td>
                <td class="px-3 py-2 text-xs text-gray-600">${escapeHTML(clienteNombre)}</td>
                <td class="px-3 py-2 text-xs text-red-700 font-bold text-right">${escapeHTML(formatearGuaranies(total))}</td>
                <td class="px-3 py-2 text-center">
                    <sl-button data-forense-fraude-id="${escapeHTML(p.id)}" variant="danger" size="small">Ver</sl-button>
                </td>
            </tr>`;
        });

        html += '</tbody></table></div>';
        html += `<p class="text-[10px] text-gray-400 mt-2">${data.length} alerta${data.length > 1 ? 's' : ''} detectada${data.length > 1 ? 's' : ''}</p>`;
        container.innerHTML = html;

        // Event delegation para ver detalle fraude
        container.querySelectorAll('[data-forense-fraude-id]').forEach(btn => {
            btn.addEventListener('click', function () {
                const pedidoId = this.getAttribute('data-forense-fraude-id');
                const pedido = data.find(p => p.id === pedidoId);
                if (pedido) mostrarModalForense('Detalle de Fraude — ' + pedidoId, pedido.datos);
            });
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error('[Forense] Error cargando fraudes:', err);
        container.innerHTML = '<p class="text-xs text-red-400">Error al cargar alertas de fraude</p>';
    }
}

// --- MODULO 2: VISOR CAJA NEGRA (AUDIT LOGS) ---
async function renderForenseLogs() {
    const container = document.getElementById('forenseLogs');
    if (!container) return;
    container.innerHTML = generarSkeletonTabla(5, 4);
    try {
        const { data, error } = await supabaseClient
            .from('audit_logs')
            .select('id, accion, tabla, usuario_id, datos_anteriores, datos_nuevos, creado_en')
            .order('creado_en', { ascending: false })
            .limit(50);
        if (error) throw error;

        const perfiles = await obtenerPerfilesMap();

        if (!data || data.length === 0) {
            container.innerHTML = `<div class="text-center py-6">
                <i data-lucide="file-text" class="w-10 h-10 text-gray-300 mx-auto mb-2"></i>
                <p class="text-sm text-gray-500">Sin registros de auditoria</p>
            </div>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        const accionBadge = {
            'INSERT': 'bg-green-100 text-green-700',
            'UPDATE': 'bg-blue-100 text-blue-700',
            'DELETE': 'bg-red-100 text-red-700'
        };

        let html = `<div class="overflow-x-auto rounded-xl border border-orange-200">
            <table class="w-full text-sm">
                <thead><tr class="bg-orange-50 text-left">
                    <th class="px-3 py-2 text-xs font-bold text-orange-700">Fecha / Hora</th>
                    <th class="px-3 py-2 text-xs font-bold text-orange-700">Accion</th>
                    <th class="px-3 py-2 text-xs font-bold text-orange-700">Tabla</th>
                    <th class="px-3 py-2 text-xs font-bold text-orange-700">Usuario</th>
                    <th class="px-3 py-2 text-xs font-bold text-orange-700 text-center">Cambios</th>
                </tr></thead><tbody class="divide-y divide-orange-100">`;

        data.forEach((log, idx) => {
            const fechaRaw = log.creado_en || '';
            const fecha = fechaRaw ? new Date(fechaRaw).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            const badge = accionBadge[log.accion] || 'bg-gray-100 text-gray-700';
            const usuario = perfiles[log.usuario_id] || log.usuario_id?.substring(0, 8) || 'Sistema';

            html += `<tr class="hover:bg-orange-50/50">
                <td class="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">${escapeHTML(fecha)}</td>
                <td class="px-3 py-2"><span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${badge}">${escapeHTML(log.accion)}</span></td>
                <td class="px-3 py-2 text-xs font-medium text-gray-800">${escapeHTML(log.tabla)}</td>
                <td class="px-3 py-2 text-xs text-gray-600">${escapeHTML(usuario)}</td>
                <td class="px-3 py-2 text-center">
                    <sl-button data-forense-log-idx="${idx}" variant="warning" size="small">Ver Cambios</sl-button>
                </td>
            </tr>`;
        });

        html += '</tbody></table></div>';
        html += `<p class="text-[10px] text-gray-400 mt-2">Mostrando ultimos ${data.length} eventos</p>`;
        container.innerHTML = html;

        // Event delegation para ver cambios
        container.querySelectorAll('[data-forense-log-idx]').forEach(btn => {
            btn.addEventListener('click', function () {
                const idx = parseInt(this.getAttribute('data-forense-log-idx'));
                const log = data[idx];
                if (log) {
                    mostrarModalForenseDiff(
                        `${log.accion} en ${log.tabla}`,
                        log.datos_anteriores,
                        log.datos_nuevos
                    );
                }
            });
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        console.error('[Forense] Error cargando audit logs:', err);
        container.innerHTML = '<p class="text-xs text-red-400">Error al cargar logs de auditoria</p>';
    }
}

// --- MODAL FORENSE: mostrar JSON generico ---
function mostrarModalForense(titulo, datos) {
    const modal = document.getElementById('modalForenseDetalle');
    const tituloEl = document.getElementById('modalForenseTitulo');
    const body = document.getElementById('modalForenseBody');
    tituloEl.textContent = titulo;

    const pre = document.createElement('pre');
    pre.className = 'bg-gray-900 text-green-400 p-4 rounded-xl text-xs overflow-auto max-h-[60vh] font-mono leading-relaxed';
    pre.textContent = JSON.stringify(datos, null, 2);
    body.innerHTML = '';
    body.appendChild(pre);

    modal.show();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- MODAL FORENSE: diff antes/despues ---
function mostrarModalForenseDiff(titulo, antes, despues) {
    const modal = document.getElementById('modalForenseDetalle');
    const tituloEl = document.getElementById('modalForenseTitulo');
    const body = document.getElementById('modalForenseBody');
    tituloEl.textContent = titulo;
    body.innerHTML = '';

    if (antes) {
        const labelAntes = document.createElement('p');
        labelAntes.className = 'text-xs font-bold text-red-500 mb-1 flex items-center gap-1';
        labelAntes.textContent = 'ANTES (datos_anteriores)';
        body.appendChild(labelAntes);

        const preAntes = document.createElement('pre');
        preAntes.className = 'bg-gray-900 text-red-400 p-4 rounded-xl text-xs overflow-auto max-h-[30vh] font-mono leading-relaxed mb-4';
        preAntes.textContent = JSON.stringify(antes, null, 2);
        body.appendChild(preAntes);
    }

    if (despues) {
        const labelDespues = document.createElement('p');
        labelDespues.className = 'text-xs font-bold text-green-500 mb-1 flex items-center gap-1';
        labelDespues.textContent = 'DESPUES (datos_nuevos)';
        body.appendChild(labelDespues);

        const preDespues = document.createElement('pre');
        preDespues.className = 'bg-gray-900 text-green-400 p-4 rounded-xl text-xs overflow-auto max-h-[30vh] font-mono leading-relaxed';
        preDespues.textContent = JSON.stringify(despues, null, 2);
        body.appendChild(preDespues);
    }

    if (!antes && !despues) {
        const empty = document.createElement('p');
        empty.className = 'text-sm text-gray-500 text-center py-8';
        empty.textContent = 'Sin datos de cambio registrados para este evento.';
        body.appendChild(empty);
    }

    modal.show();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function cerrarModalForense() {
    document.getElementById('modalForenseDetalle').hide();
}

// ============================================
// HERRAMIENTAS Y BACKUP
// ============================================
async function crearBackup() {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const backup = {
        tipo: 'backup_admin_completo',
        fecha: new Date().toISOString(),
        version: '3.0',
        datos: { productos: productosData, pedidos },
        resumen: {
            totalProductos: productosData.productos?.length || 0,
            totalClientes: productosData.clientes?.length || 0,
            totalPedidos: pedidos.length,
            totalGuaranies: pedidos.reduce((s, p) => s + (p.total || 0), 0)
        }
    };
    const fecha = new Date().toISOString().split('T')[0];
    descargarJSON(backup, `hdv_backup_completo_${fecha}.json`);
    await HDVStorage.setItem('hdv_admin_ultimo_backup', new Date().toISOString());
    actualizarInfoBackupAdmin();
}

function crearBackupSoloProductos() {
    const backup = {
        tipo: 'backup_catalogo',
        fecha: new Date().toISOString(),
        version: '3.0',
        datos: {
            categorias: productosData.categorias,
            productos: productosData.productos,
            clientes: productosData.clientes
        }
    };
    descargarJSON(backup, `hdv_catalogo_${new Date().toISOString().split('T')[0]}.json`);
}

async function crearBackupSoloPedidos() {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    if (pedidos.length === 0) { mostrarToast('No hay pedidos', 'error'); return; }
    const backup = {
        tipo: 'backup_pedidos',
        fecha: new Date().toISOString(),
        version: '3.0',
        pedidos
    };
    descargarJSON(backup, `hdv_pedidos_${new Date().toISOString().split('T')[0]}.json`);
}

async function restaurarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!await mostrarConfirmModal('¿Reemplazar todos los datos actuales con el backup?', { destructivo: true, textoConfirmar: 'Restaurar' })) { event.target.value = ''; return; }

    await crearAutoBackupAdmin('Pre-restauracion');

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const backup = JSON.parse(e.target.result);

            if (backup.tipo === 'backup_admin_completo' && backup.datos) {
                productosData = backup.datos.productos;
                if (backup.datos.pedidos) await HDVStorage.setItem('hdv_pedidos', backup.datos.pedidos);
                productosDataOriginal = JSON.parse(JSON.stringify(productosData));
                mostrarToast(`Backup completo restaurado. ${backup.resumen?.totalProductos || '?'} productos, ${backup.resumen?.totalPedidos || '?'} pedidos`, 'success');
                setTimeout(() => location.reload(), 1000);
            } else if (backup.tipo === 'backup_catalogo' && backup.datos) {
                productosData.categorias = backup.datos.categorias || productosData.categorias;
                productosData.productos = backup.datos.productos || productosData.productos;
                productosData.clientes = backup.datos.clientes || productosData.clientes;
                productosDataOriginal = JSON.parse(JSON.stringify(productosData));
                mostrarToast('Catalogo restaurado.', 'success');
                setTimeout(() => location.reload(), 1000);
            } else if (backup.tipo === 'backup_pedidos' && backup.pedidos) {
                await HDVStorage.setItem('hdv_pedidos', backup.pedidos);
                mostrarToast(`${backup.pedidos.length} pedidos restaurados.`, 'success');
                cargarPedidos();
            } else if (backup.tipo === 'backup_vendedor_completo' && backup.datos?.pedidos) {
                await HDVStorage.setItem('hdv_pedidos', backup.datos.pedidos);
                mostrarToast(`Pedidos del vendedor restaurados: ${backup.datos.pedidos.length}`, 'success');
                cargarPedidos();
            } else if (backup.datos) {
                productosData = backup.datos.productos;
                if (backup.datos.pedidos) await HDVStorage.setItem('hdv_pedidos', backup.datos.pedidos);
                productosDataOriginal = JSON.parse(JSON.stringify(productosData));
                mostrarToast('Backup restaurado (formato anterior).', 'success');
                setTimeout(() => location.reload(), 1000);
            } else {
                mostrarToast('Formato de backup no reconocido', 'error');
            }
        } catch (err) { mostrarToast('Error: archivo invalido', 'error'); }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// ============================================
// AUTO-BACKUP ADMIN
// ============================================
async function toggleAdminAutoBackup() {
    const toggle = document.getElementById('adminAutoBackupToggle');
    await HDVStorage.setItem('hdv_admin_auto_backup', toggle?.checked ? 'true' : 'false');
}

async function crearAutoBackupAdmin(motivo) {
    const enabled = (await HDVStorage.getItem('hdv_admin_auto_backup', { clone: false })) !== 'false';
    if (!enabled) return;

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const backup = {
        motivo: motivo || 'Auto-backup',
        fecha: new Date().toISOString(),
        datos: { productos: JSON.parse(JSON.stringify(productosData)), pedidos },
        resumen: {
            totalProductos: productosData.productos?.length || 0,
            totalClientes: productosData.clientes?.length || 0,
            totalPedidos: pedidos.length
        }
    };

    let historial = (await HDVStorage.getItem('hdv_admin_auto_backups')) || [];
    historial.unshift(backup);
    if (historial.length > 5) historial = historial.slice(0, 5);

    try {
        await HDVStorage.setItem('hdv_admin_auto_backups', historial);
    } catch (e) {
        console.warn('Auto-backup admin: espacio insuficiente');
        historial = historial.slice(0, 2);
        await HDVStorage.setItem('hdv_admin_auto_backups', historial);
    }
}

async function actualizarInfoBackupAdmin() {
    const ultimo = await HDVStorage.getItem('hdv_admin_ultimo_backup', { clone: false });
    const el = document.getElementById('adminUltimoBackup');
    if (el) el.textContent = ultimo ? `Ultimo: ${new Date(ultimo).toLocaleString('es-PY')}` : 'Sin backups';

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    setEl('adminBackupProductos', productosData.productos?.length || 0);
    setEl('adminBackupClientes', productosData.clientes?.length || 0);
    setEl('adminBackupPedidos', pedidos.length);

    await mostrarHistorialBackupsAdmin();
}

async function mostrarHistorialBackupsAdmin() {
    const container = document.getElementById('adminHistorialBackups');
    if (!container) return;

    const historial = (await HDVStorage.getItem('hdv_admin_auto_backups')) || [];
    if (historial.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 italic">Sin auto-backups</p>';
        return;
    }

    container.innerHTML = '';
    historial.forEach((b, idx) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-50 rounded-lg p-3 hover:bg-gray-100';
        div.innerHTML = `
            <div>
                <p class="text-sm font-medium text-gray-700">${b.motivo || 'Auto-backup'}</p>
                <p class="text-xs text-gray-500">${new Date(b.fecha).toLocaleString('es-PY')} - ${b.resumen?.totalProductos || '?'} prod, ${b.resumen?.totalPedidos || '?'} ped</p>
            </div>
            <div class="flex gap-2">
                <sl-button data-action="restaurarAutoBackupAdmin" data-arg="${idx}" variant="primary" size="small">Restaurar</sl-button>
                <sl-button data-action="descargarAutoBackupAdmin" data-arg="${idx}" variant="success" size="small">Descargar</sl-button>
            </div>
        `;
        container.appendChild(div);
    });
}

async function restaurarAutoBackupAdmin(idx) {
    if (!await mostrarConfirmModal('¿Restaurar este auto-backup? Los datos actuales seran reemplazados.', { destructivo: true, textoConfirmar: 'Restaurar' })) return;
    const historial = (await HDVStorage.getItem('hdv_admin_auto_backups')) || [];
    if (historial[idx]?.datos) {
        productosData = historial[idx].datos.productos;
        if (historial[idx].datos.pedidos) await HDVStorage.setItem('hdv_pedidos', historial[idx].datos.pedidos);
        productosDataOriginal = JSON.parse(JSON.stringify(productosData));
        mostrarToast('Auto-backup restaurado. Recargando...', 'success');
        setTimeout(() => location.reload(), 1000);
    }
}

async function descargarAutoBackupAdmin(idx) {
    const historial = (await HDVStorage.getItem('hdv_admin_auto_backups')) || [];
    if (historial[idx]) {
        descargarJSON(historial[idx], `hdv_autobackup_${new Date(historial[idx].fecha).toISOString().split('T')[0]}.json`);
    }
}

async function limpiarPedidos() {
    if (!await mostrarConfirmModal('¿ELIMINAR TODOS LOS PEDIDOS? Esto no se puede deshacer.', { destructivo: true, textoConfirmar: 'Eliminar Todo' })) return;
    if (!await mostrarConfirmModal('¿Estas seguro? Todos los datos de pedidos se perderan.', { destructivo: true, textoConfirmar: 'Si, eliminar' })) return;
    await crearAutoBackupAdmin('Pre-limpieza de pedidos');
    await HDVStorage.removeItem('hdv_pedidos');
    todosLosPedidos = [];
    mostrarToast('Pedidos eliminados. Se guardo un auto-backup por seguridad.', 'success');
    cargarPedidos();
}

// Toast, confirm, and input modals are in js/utils/dialogs.js (shared)

// ============================================
// CONFIGURACION EMPRESA (SIFEN)
// ============================================
async function cargarConfigEmpresa() {
    try {
        const { data, error } = await SupabaseService.fetchConfigEmpresa();
        if (error) { console.log('[Config Empresa] No cargada:', error.message); return; }
        if (!data) return;
        const campos = {
            cfgEmpresaRuc: data.ruc_empresa,
            cfgEmpresaRazon: data.razon_social,
            cfgEmpresaNombreFantasia: data.nombre_fantasia,
            cfgEmpresaTimbrado: data.timbrado_numero,
            cfgEmpresaTimbradoVenc: data.timbrado_vencimiento,
            cfgEmpresaEstablecimiento: data.establecimiento,
            cfgEmpresaPuntoExp: data.punto_expedicion,
            cfgEmpresaDireccion: data.direccion_fiscal,
            cfgEmpresaTelefono: data.telefono_empresa,
            cfgEmpresaEmail: data.email_empresa,
            cfgEmpresaActividad: data.actividad_economica
        };
        for (const [elId, valor] of Object.entries(campos)) {
            const el = document.getElementById(elId);
            if (el && valor) el.value = valor;
        }
        if (data.logo_url) {
            window._empresaLogoUrl = data.logo_url;
            const preview = document.getElementById('cfgEmpresaLogoPreview');
            const placeholder = document.getElementById('cfgEmpresaLogoPlaceholder');
            const btnQuitar = document.getElementById('btnCfgEmpresaLogoQuitar');
            if (preview) { preview.src = data.logo_url; preview.classList.remove('hidden'); }
            if (placeholder) placeholder.classList.add('hidden');
            if (btnQuitar) btnQuitar.classList.remove('hidden');
            _aplicarLogoHeaders(data.logo_url);
        }
        console.log('[Config Empresa] Datos cargados');
    } catch (e) {
        console.error('[Config Empresa] Error:', e);
    }
}

async function guardarConfigEmpresa() {
    const datos = {
        id: 1,
        ruc_empresa: document.getElementById('cfgEmpresaRuc')?.value.trim() || '',
        razon_social: document.getElementById('cfgEmpresaRazon')?.value.trim() || '',
        nombre_fantasia: document.getElementById('cfgEmpresaNombreFantasia')?.value.trim() || '',
        timbrado_numero: document.getElementById('cfgEmpresaTimbrado')?.value.trim() || '',
        timbrado_vencimiento: document.getElementById('cfgEmpresaTimbradoVenc')?.value || null,
        establecimiento: document.getElementById('cfgEmpresaEstablecimiento')?.value.trim() || '001',
        punto_expedicion: document.getElementById('cfgEmpresaPuntoExp')?.value.trim() || '001',
        direccion_fiscal: document.getElementById('cfgEmpresaDireccion')?.value.trim() || '',
        telefono_empresa: document.getElementById('cfgEmpresaTelefono')?.value.trim() || '',
        email_empresa: document.getElementById('cfgEmpresaEmail')?.value.trim() || '',
        actividad_economica: document.getElementById('cfgEmpresaActividad')?.value.trim() || '',
        logo_url: window._empresaLogoUrl || null,
        actualizado_en: new Date().toISOString()
    };

    if (!datos.ruc_empresa) { mostrarToast('Ingresa el RUC de la empresa', 'error'); return; }
    if (!datos.razon_social) { mostrarToast('Ingresa la razon social', 'error'); return; }

    await withButtonLock('btnGuardarConfigEmpresa', async () => {
        try {
            const { success, error } = await SupabaseService.upsertConfigEmpresa(datos);
            if (!success) throw error;
            mostrarToast('Datos fiscales guardados correctamente', 'success');
        } catch (e) {
            console.error('[Config Empresa] Error guardando:', e);
            mostrarToast('Error al guardar: ' + (e?.message || e), 'error');
        }
    }, 'Guardando...')();
}

// ============================================
// LOGO EMPRESA (para KuDE y headers)
// ============================================
function _aplicarLogoHeaders(url) {
    if (!url) return;
    [['adminSidebarLogo', 'adminSidebarLogoSvg'], ['adminHeaderLogo', 'adminHeaderLogoSvg']].forEach(([imgId, svgId]) => {
        const img = document.getElementById(imgId);
        const svg = document.getElementById(svgId);
        if (img) { img.src = url; img.classList.remove('hidden'); }
        if (svg) svg.classList.add('hidden');
    });
}

async function subirLogoEmpresa(file) {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) { mostrarToast('Solo se aceptan JPEG, PNG o WebP', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { mostrarToast('El archivo supera los 2MB', 'error'); return; }

    // Comprimir via Canvas → WebP
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const max = 400;
                const scale = Math.min(1, max / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/webp', 0.85));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    }).catch(() => null);
    if (!dataUrl) { mostrarToast('Error al procesar la imagen', 'error'); return; }

    // Convertir a Blob y subir
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const filename = `logo_${Date.now()}.webp`;

    mostrarToast('Subiendo logo...', 'info');
    const { data, error } = await supabaseClient.storage.from('empresa_assets').upload(filename, blob, {
        contentType: 'image/webp', upsert: false
    });
    if (error) { mostrarToast('Error al subir: ' + error.message, 'error'); return; }

    const { data: { publicUrl } } = supabaseClient.storage.from('empresa_assets').getPublicUrl(filename);
    window._empresaLogoUrl = publicUrl;

    const preview = document.getElementById('cfgEmpresaLogoPreview');
    const placeholder = document.getElementById('cfgEmpresaLogoPlaceholder');
    const btnQuitar = document.getElementById('btnCfgEmpresaLogoQuitar');
    if (preview) { preview.src = publicUrl; preview.classList.remove('hidden'); }
    if (placeholder) placeholder.classList.add('hidden');
    if (btnQuitar) btnQuitar.classList.remove('hidden');
    _aplicarLogoHeaders(publicUrl);

    mostrarToast('Logo subido. Guardá los datos fiscales para confirmar.', 'success', 5000);
}

document.addEventListener('DOMContentLoaded', () => {
    const logoInput = document.getElementById('cfgEmpresaLogoInput');
    if (logoInput) logoInput.addEventListener('change', e => {
        if (e.target.files?.[0]) subirLogoEmpresa(e.target.files[0]);
        e.target.value = '';
    });

});

// ============================================
// FORZAR ACTUALIZACION ADMIN
// ============================================
function forzarActualizacionAdmin() {
    mostrarToast('Limpiando cache y actualizando...', 'info');
    if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
    }
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => r.unregister());
        });
    }
    setTimeout(() => location.reload(true), 800);
}

// Registrar SW tambien desde admin
(function registrarSWAdmin() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => {
                console.log('[Admin SW] Registrado');
                setInterval(() => { try { reg.update(); } catch(e) {} }, TIEMPOS.HEALTH_CHECK_INTERVAL_MS);
                reg.addEventListener('updatefound', () => {
                    const nw = reg.installing;
                    if (!nw) return;
                    nw.addEventListener('statechange', () => {
                        try {
                            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                                nw.postMessage('skipWaiting');
                                mostrarToast('Nueva version disponible. Recargando...', 'info');
                                setTimeout(() => location.reload(true), TIEMPOS.PAGE_RELOAD_MS);
                            }
                        } catch(e) { console.log('[Admin SW] statechange error ignorado'); }
                    });
                });
            }).catch(err => console.log('[Admin SW] Error:', err));
        try {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log('[Admin SW] Nuevo service worker activo');
            });
        } catch(e) {}
    }
})();

// ============================================
// SIDEBAR RESPONSIVE
// ============================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
}

// ============================================
// BUSQUEDA GLOBAL (Ctrl+K)
// ============================================
// Command palette: secciones navegables + acciones rápidas
const _GS_SECCIONES = [
    ['dashboard', 'Dashboard', 'layout-dashboard'],
    ['pedidos', 'Pedidos', 'clipboard-list'],
    ['ventas', 'Ventas', 'receipt'],
    ['dtes', 'Mis DTEs', 'file-text'],
    ['creditos', 'Créditos', 'hand-coins'],
    ['reportes', 'Reportes', 'bar-chart-3'],
    ['stock', 'Stock', 'boxes'],
    ['productos', 'Productos', 'package'],
    ['clientes', 'Clientes', 'users'],
    ['promociones', 'Promociones', 'tag'],
    ['proveedores', 'Proveedores', 'truck'],
    ['rendiciones', 'Rendiciones', 'wallet'],
    ['metas', 'Metas', 'target'],
    ['inactivos', 'Clientes inactivos', 'user-x'],
    ['cierre', 'Cierre mensual', 'calendar-check'],
    ['sifen-estado', 'Estado SIFEN', 'shield-check'],
    ['forense', 'Forense', 'search'],
    ['herramientas', 'Herramientas', 'wrench'],
];
const _GS_ACCIONES = [
    ['Actualizar datos', 'refresh-cw', () => { if (typeof forzarActualizacionAdmin === 'function') forzarActualizacionAdmin(); }],
    ['Asistente CartónIA', 'sparkles', () => { if (typeof abrirChatIA === 'function') abrirChatIA(); }],
];
let _gsSel = -1; // índice seleccionado para navegación por teclado

function abrirBusquedaGlobal() {
    const overlay = document.getElementById('globalSearchOverlay');
    overlay.classList.add('show');
    const input = document.getElementById('globalSearchInput');
    input.value = '';
    ejecutarBusquedaGlobal();   // pinta acciones + secciones de entrada
    input.focus();
}

function cerrarBusquedaGlobal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('globalSearchOverlay').classList.remove('show');
}

function _gsItem(attrs, icon, titulo, subtitulo) {
    return `<sl-button ${attrs} variant="text" size="small" class="gs-item w-full text-left px-4 py-3 rounded-lg flex items-center gap-3">
        <i data-lucide="${icon}" class="w-5 h-5 text-gray-400"></i>
        <div><p class="font-medium text-gray-800 text-sm">${escapeHTML(titulo)}</p>${subtitulo ? `<p class="text-xs text-gray-400">${escapeHTML(subtitulo)}</p>` : ''}</div>
    </sl-button>`;
}

function ejecutarBusquedaGlobal() {
    const q = document.getElementById('globalSearchInput').value.toLowerCase().trim();
    const results = document.getElementById('globalSearchResults');
    let html = '';

    // Acciones rápidas (siempre que coincidan o query vacío)
    const accs = _GS_ACCIONES.filter(a => !q || a[0].toLowerCase().includes(q));
    if (accs.length > 0) {
        html += '<p class="px-4 py-2 text-xs font-bold text-gray-500 uppercase">Acciones</p>';
        accs.forEach(a => {
            const idx = _GS_ACCIONES.indexOf(a);
            html += _gsItem(`data-gs-action="${idx}"`, a[1], a[0], '');
        });
    }

    // Navegar a sección
    const secs = _GS_SECCIONES.filter(s => !q || s[1].toLowerCase().includes(q) || s[0].includes(q));
    if (secs.length > 0) {
        html += '<p class="px-4 py-2 text-xs font-bold text-gray-500 uppercase">Ir a sección</p>';
        secs.slice(0, q ? 6 : 18).forEach(s => {
            html += _gsItem(`data-gs-nav="${escapeHTML(s[0])}"`, s[2], s[1], '');
        });
    }

    if (q.length >= 2) {
        // Productos
        const prods = (productosData.productos || []).filter(p => p.nombre.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)).slice(0, 5);
        if (prods.length > 0) {
            html += '<p class="px-4 py-2 text-xs font-bold text-gray-500 uppercase">Productos</p>';
            prods.forEach(p => {
                html += _gsItem(`data-search-type="producto" data-search-nombre="${escapeHTML(p.nombre)}"`, 'package', p.nombre, `${p.id} · ${p.categoria}`);
            });
        }
        // Clientes
        const clis = (productosData.clientes || []).filter(c => (c.razon_social || c.nombre || '').toLowerCase().includes(q) || (c.ruc || '').includes(q) || (c.telefono || '').includes(q)).slice(0, 5);
        if (clis.length > 0) {
            html += '<p class="px-4 py-2 text-xs font-bold text-gray-500 uppercase">Clientes</p>';
            clis.forEach(c => {
                html += _gsItem(`data-search-type="cliente" data-search-id="${escapeHTML(c.id)}"`, 'user', c.razon_social || c.nombre, `${c.zona || ''} ${c.telefono || ''}`.trim());
            });
        }
        // Pedidos
        const peds = (todosLosPedidos || []).filter(p => p.id?.toLowerCase().includes(q) || (p.cliente?.nombre || '').toLowerCase().includes(q)).slice(0, 5);
        if (peds.length > 0) {
            html += '<p class="px-4 py-2 text-xs font-bold text-gray-500 uppercase">Pedidos</p>';
            peds.forEach(p => {
                html += _gsItem(`data-search-type="pedido"`, 'clipboard-list', p.cliente?.nombre || 'N/A', `${p.id} · ${formatearGuaranies(p.total)}`);
            });
        }
    }

    if (!html) html = '<p class="p-6 text-center text-gray-500 text-sm font-medium">Sin resultados</p>';
    results.innerHTML = html;
    lucide.createIcons();

    // Activación (click o Enter) — event delegation
    results.querySelectorAll('.gs-item').forEach(btn => {
        btn.addEventListener('click', () => _gsActivar(btn));
    });

    // Reset de selección de teclado al primer item
    _gsSel = -1;
    _gsMover(1);
}

function _gsActivar(btn) {
    if (!btn) return;
    const navSec = btn.getAttribute('data-gs-nav');
    const accIdx = btn.getAttribute('data-gs-action');
    const type = btn.getAttribute('data-search-type');
    cerrarBusquedaGlobal(null);
    if (navSec) { cambiarSeccion(navSec); return; }
    if (accIdx != null) { const a = _GS_ACCIONES[parseInt(accIdx, 10)]; if (a && a[2]) a[2](); return; }
    if (type === 'producto') {
        cambiarSeccion('productos');
        const nombre = btn.getAttribute('data-search-nombre');
        setTimeout(() => { const input = document.getElementById('buscarProducto'); if (input) { input.value = nombre; filtrarProductos(); } }, 100);
    } else if (type === 'cliente') {
        cambiarSeccion('clientes');
        const clienteId = btn.getAttribute('data-search-id');
        setTimeout(() => abrirPerfilCliente(clienteId), 200);
    } else if (type === 'pedido') {
        cambiarSeccion('pedidos');
    }
}

function _gsMover(delta) {
    const items = Array.from(document.querySelectorAll('#globalSearchResults .gs-item'));
    if (items.length === 0) { _gsSel = -1; return; }
    if (_gsSel >= 0 && items[_gsSel]) items[_gsSel].classList.remove('gs-selected');
    _gsSel = (_gsSel + delta + items.length) % items.length;
    const sel = items[_gsSel];
    sel.classList.add('gs-selected');
    sel.scrollIntoView({ block: 'nearest' });
}

function _gsActivarSeleccionado() {
    const items = document.querySelectorAll('#globalSearchResults .gs-item');
    if (_gsSel >= 0 && items[_gsSel]) _gsActivar(items[_gsSel]);
    else if (items[0]) _gsActivar(items[0]);
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const overlay = document.getElementById('globalSearchOverlay');
        if (overlay.classList.contains('show')) cerrarBusquedaGlobal(null);
        else abrirBusquedaGlobal();
    }
    // Command palette: navegación por teclado cuando está abierto
    const gsOverlay = document.getElementById('globalSearchOverlay');
    if (gsOverlay && gsOverlay.classList.contains('show')) {
        if (e.key === 'ArrowDown') { e.preventDefault(); _gsMover(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); _gsMover(-1); return; }
        if (e.key === 'Enter') { e.preventDefault(); _gsActivarSeleccionado(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (cambiosSinGuardar > 0) {
            guardarTodosCambios(); // ya muestra su propio toast
        } else {
            mostrarToast('No hay cambios pendientes', 'info');
        }
    }
    if (e.key === 'Escape') {
        const search = document.getElementById('globalSearchOverlay');
        if (search.classList.contains('show')) { cerrarBusquedaGlobal(null); return; }
        if (typeof _notifPanelAbierto !== 'undefined' && _notifPanelAbierto) { toggleNotificaciones(true); return; }
    }
});

// ============================================
// DEBOUNCED SEARCH WRAPPERS (300ms)
// ============================================
const ejecutarBusquedaGlobalDebounced = debounce(ejecutarBusquedaGlobal, 300);
