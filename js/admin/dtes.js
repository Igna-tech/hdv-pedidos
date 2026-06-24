// ============================================
// HDV Admin - Mis DTEs
// Módulo para emitir y consultar documentos tributarios electrónicos:
// Factura Electrónica (FAC-), Nota de Crédito (NC-), Nota de Remisión (NRE-)
// Requiere: admin.js (todosLosPedidos, productosData, hdvUsuario), ventas-data.js
// ============================================

// ---- Estado interno del formulario ----
const _dte = {
    tipo: null,       // 'factura' | 'nota_credito' | 'nota_remision'
    receptor: null,   // objeto cliente
    items: [],        // [{descripcion, codigoInterno, productoId, varianteId, cantidad, precio, tasa, iva, total}]
    datos_nc: { cdc_referenciado: '', tipo_doc_asociado: 'electronico', motivo: 'devolucion_ajuste', factura_ref_id: '' },
    datos_nre: { motivo: 'traslado_ventas', responsable: 'emisor', km: 0, tipo_transporte: 'propio', modalidad: 'terrestre', fecha_inicio: '', fecha_fin: '' },
    salida: { direccion: '', nro: '', dpto: '', ciudad: '' },
    entrega: { direccion: '', nro: '', dpto: '', ciudad: '' },
    condicion: 'contado',
    tipo_pago: 'efectivo',
    fecha: new Date().toISOString().substring(0, 10),
};

// ---- Cache de DTEs filtrados ----
let _dtesFiltrados = [];

// ---- Helpers IVA (fórmula SET Paraguay) ----
function _calcIVA(precio, cantidad, tasa) {
    const bruto = precio * cantidad;
    if (tasa === 10) return { bruto, iva: Math.round(bruto / 11), total: bruto };
    if (tasa === 5)  return { bruto, iva: Math.round(bruto / 21), total: bruto };
    return { bruto, iva: 0, total: bruto };
}

function _desgloseIVAItems(items) {
    let totalGravada5 = 0, liqIva5 = 0, totalGravada10 = 0, liqIva10 = 0, totalExentas = 0;
    items.forEach(it => {
        const { bruto, iva } = _calcIVA(it.precio || 0, it.cantidad || 0, it.tasa || 0);
        if (it.tasa === 10) { totalGravada10 += bruto; liqIva10 += iva; }
        else if (it.tasa === 5) { totalGravada5 += bruto; liqIva5 += iva; }
        else { totalExentas += bruto; }
    });
    return { totalGravada5, liqIva5, totalGravada10, liqIva10, totalExentas, totalIva: liqIva5 + liqIva10 };
}

// ---- Generar número de factura correlativo ----
function _generarNumFacturaDTE() {
    if (typeof generarNumeroFactura === 'function') return generarNumeroFactura();
    const stored = parseInt(localStorage.getItem('hdv_last_num_fac') || '0') + 1;
    localStorage.setItem('hdv_last_num_fac', stored);
    return `001-001-${String(stored).padStart(7, '0')}`;
}

function _generarCDCDTE() {
    if (typeof generarCDC === 'function') return generarCDC();
    return crypto.randomUUID().replace(/-/g, '').substring(0, 44);
}

// ============================================
// SELECCIONAR TIPO DTE → abre drawer
// Llamado desde admin.js ACTION_DISPATCH
// ncDesdeDetalle() pasa pedidoId como contexto para pre-fill NC
// ============================================

function seleccionarTipoDTE(tipo, contextoId) {
    _dte.tipo      = tipo;
    _dte.receptor  = null;
    _dte.items     = [];
    _dte.fecha     = new Date().toISOString().substring(0, 10);
    _dte.condicion = 'contado';
    _dte.tipo_pago = 'efectivo';
    _dte.datos_nc  = { cdc_referenciado: '', tipo_doc_asociado: 'electronico', motivo: 'devolucion_ajuste', factura_ref_id: '' };
    _dte.datos_nre = { motivo: 'traslado_ventas', responsable: 'emisor', km: 0, tipo_transporte: 'propio', modalidad: 'terrestre', fecha_inicio: '', fecha_fin: '' };
    _dte.salida    = { direccion: '', nro: '', dpto: '', ciudad: '' };
    _dte.entrega   = { direccion: '', nro: '', dpto: '', ciudad: '' };

    // Si viene desde ncDesdeDetalle, pre-cargar factura referenciada
    if (tipo === 'nota_credito' && contextoId) {
        _dte.datos_nc.factura_ref_id = contextoId;
        _preCargarFacturaNC(contextoId);
    }

    _actualizarDrawerHeader();
    renderFormDTE();

    const drawer = document.getElementById('drawerEmitirDTE');
    if (drawer) drawer.show();
}

function _actualizarDrawerHeader() {
    const config = {
        factura:      { titulo: 'Emitir Factura Electrónica',   sub: 'Complete todos los campos obligatorios', icono: 'receipt',      color: 'indigo' },
        nota_credito: { titulo: 'Emitir Nota de Crédito',       sub: 'Referencia una FAC emitida',            icono: 'file-minus-2', color: 'orange' },
        nota_remision:{ titulo: 'Emitir Nota de Remisión',      sub: 'Datos de traslado de mercaderías',      icono: 'truck',        color: 'teal' },
    }[_dte.tipo] || { titulo: 'Emitir DTE', sub: '', icono: 'file-plus-2', color: 'indigo' };

    const tituloEl = document.getElementById('drawerDTETitulo');
    const subEl    = document.getElementById('drawerDTESubtitulo');
    const iconoEl  = document.getElementById('drawerDTEIcono');
    if (tituloEl) tituloEl.textContent = config.titulo;
    if (subEl)    subEl.textContent    = config.sub;
    if (iconoEl) {
        iconoEl.className = `w-9 h-9 rounded-lg bg-${config.color}-100 flex items-center justify-center`;
        iconoEl.innerHTML = `<i data-lucide="${config.icono}" class="w-5 h-5 text-${config.color}-600"></i>`;
    }
}

function cerrarDrawerDTE() {
    const drawer = document.getElementById('drawerEmitirDTE');
    if (drawer) drawer.hide();
}

function limpiarFormDTE() {
    _dte.receptor = null;
    _dte.items    = [];
    _dte.datos_nc = { cdc_referenciado: '', tipo_doc_asociado: 'electronico', motivo: 'devolucion_ajuste', factura_ref_id: '' };
    renderFormDTE();
}

// ============================================
// RENDER FORM PRINCIPAL
// ============================================

function renderFormDTE() {
    const content = document.getElementById('drawerEmitirDTEContent');
    if (!content) return;

    if (_dte.tipo === 'factura')       content.innerHTML = _renderFormFAC();
    else if (_dte.tipo === 'nota_credito')  content.innerHTML = _renderFormNC();
    else if (_dte.tipo === 'nota_remision') content.innerHTML = _renderFormNRE();
    else content.innerHTML = '<div class="text-center py-10 text-gray-400 text-sm">Seleccioná un tipo de documento.</div>';

    _calcularTotalesDTE();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ---- Sección genérica de receptor (FAC y NC) ----
function _sectionReceptor(prefill) {
    const r = prefill || _dte.receptor || {};
    return `
    <sl-details summary="② Datos del Receptor" open class="mb-3">
        <div class="space-y-3 pt-1">
            <div class="relative">
                <label class="block text-xs font-bold text-gray-500 mb-1">BUSCAR CLIENTE <span class="text-red-500">*</span></label>
                <sl-input id="dteBuscarClienteInput" size="small" placeholder="Nombre o RUC..." clearable></sl-input>
                <div id="dteClienteResultados" class="hidden absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto"></div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">RUC</label>
                    <sl-input id="dteReceptorRUC" size="small" value="${escapeHTML(r.ruc || '')}" readonly></sl-input>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">DV</label>
                    <sl-input id="dteReceptorDV" size="small" value="${escapeHTML(r.dv || _extraerDV(r.ruc) || '')}" readonly></sl-input>
                </div>
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-500 mb-1">RAZÓN SOCIAL</label>
                <sl-input id="dteReceptorNombre" size="small" value="${escapeHTML(r.razon_social || r.nombre || '')}" readonly></sl-input>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">DIRECCIÓN</label>
                    <sl-input id="dteReceptorDireccion" size="small" value="${escapeHTML(r.direccion || '')}"></sl-input>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">TELÉFONO</label>
                    <sl-input id="dteReceptorTel" size="small" value="${escapeHTML(r.telefono || '')}"></sl-input>
                </div>
            </div>
        </div>
    </sl-details>`;
}

function _extraerDV(ruc) {
    if (!ruc) return '';
    const parts = ruc.split('-');
    return parts.length > 1 ? parts[parts.length - 1] : '';
}

// ---- Sección ítems FAC / NC ----
function _sectionItemsFAC(numSeccion) {
    const rows = _dte.items.map((it, idx) => _renderItemRow(idx, it)).join('');
    const totalGral = _dte.items.reduce((s, it) => s + (it.total || 0), 0);
    return `
    <sl-details summary="${numSeccion} Ítems" open class="mb-3">
        <div class="space-y-2 pt-1">
            <div id="dteItemsContainer" class="space-y-2">
                ${rows || '<p class="text-xs text-gray-400 text-center py-2">Agregá al menos un ítem.</p>'}
            </div>
            <sl-button data-action="agregarItemDTE" variant="neutral" size="small" outline class="w-full mt-2">
                <i data-lucide="plus" class="w-4 h-4 pointer-events-none"></i> Agregar ítem
            </sl-button>
            <div class="flex justify-between items-center pt-2 border-t border-gray-200 mt-2">
                <span class="text-sm font-bold text-gray-600">TOTAL</span>
                <span id="dteTotalGral" class="text-lg font-bold text-indigo-700">${typeof formatearGuaranies === 'function' ? formatearGuaranies(totalGral) : totalGral.toLocaleString()}</span>
            </div>
        </div>
    </sl-details>`;
}

function _renderItemRow(idx, it) {
    it = it || {};
    const tasaOpts = ['0', '5', '10'].map(t =>
        `<sl-option value="${t}">${t === '0' ? 'Exenta' : `IVA ${t}%`}</sl-option>`
    ).join('');
    return `
    <div class="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2" data-dte-item="${idx}">
        <div class="grid grid-cols-5 gap-1 items-end">
            <div class="col-span-3">
                <label class="block text-[10px] font-bold text-gray-400 mb-0.5">DESCRIPCIÓN <span class="text-red-500">*</span></label>
                <sl-input size="small" value="${escapeHTML(it.descripcion || '')}" placeholder="Nombre del producto"
                    data-dte-field="descripcion" data-dte-idx="${idx}"></sl-input>
            </div>
            <div>
                <label class="block text-[10px] font-bold text-gray-400 mb-0.5">CANT.</label>
                <sl-input size="small" type="number" min="1" step="1" value="${it.cantidad || 1}"
                    data-dte-field="cantidad" data-dte-idx="${idx}"></sl-input>
            </div>
            <div class="flex justify-end">
                <sl-icon-button name="trash-2" label="Quitar" style="color:#ef4444;"
                    data-action="quitarItemDTE" data-arg="${idx}"></sl-icon-button>
            </div>
        </div>
        <div class="grid grid-cols-3 gap-1 items-end">
            <div>
                <label class="block text-[10px] font-bold text-gray-400 mb-0.5">PRECIO (₲ c/IVA)</label>
                <sl-input size="small" type="number" min="0" step="1" value="${it.precio || ''}"
                    placeholder="0" data-dte-field="precio" data-dte-idx="${idx}"></sl-input>
            </div>
            <div>
                <label class="block text-[10px] font-bold text-gray-400 mb-0.5">TASA IVA</label>
                <sl-select size="small" hoist value="${it.tasa !== undefined ? String(it.tasa) : '10'}"
                    data-dte-field="tasa" data-dte-idx="${idx}">${tasaOpts}</sl-select>
            </div>
            <div>
                <label class="block text-[10px] font-bold text-gray-400 mb-0.5">SUBTOTAL</label>
                <sl-input size="small" id="dteSubtotal-${idx}" value="${it.total ? (typeof formatearGuaranies === 'function' ? formatearGuaranies(it.total) : it.total) : ''}" readonly></sl-input>
            </div>
        </div>
    </div>`;
}

// ---- Sección condición y pago ----
function _sectionCondicionPago(numSeccion) {
    return `
    <sl-details summary="${numSeccion} Condición y Pago" open class="mb-3">
        <div class="grid grid-cols-2 gap-3 pt-1">
            <div>
                <label class="block text-xs font-bold text-gray-500 mb-1">CONDICIÓN</label>
                <sl-select id="dteCondicion" size="small" hoist value="${_dte.condicion}">
                    <sl-option value="contado">Contado</sl-option>
                    <sl-option value="credito">Crédito</sl-option>
                </sl-select>
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-500 mb-1">TIPO DE PAGO</label>
                <sl-select id="dteTipoPago" size="small" hoist value="${_dte.tipo_pago}">
                    <sl-option value="efectivo">Efectivo</sl-option>
                    <sl-option value="transferencia">Transferencia</sl-option>
                    <sl-option value="cheque">Cheque</sl-option>
                    <sl-option value="tarjeta">Tarjeta</sl-option>
                </sl-select>
            </div>
        </div>
    </sl-details>`;
}

// ============================================
// FORM: FACTURA ELECTRÓNICA
// ============================================

function _renderFormFAC() {
    return `
    <div class="space-y-1">
        <sl-details summary="① Datos Generales" open class="mb-3">
            <div class="grid grid-cols-2 gap-3 pt-1">
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">FECHA <span class="text-red-500">*</span></label>
                    <sl-input id="dteFecha" type="date" size="small" value="${_dte.fecha}"></sl-input>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">TIPO DE TRANSACCIÓN</label>
                    <sl-select id="dteTipoTransaccion" size="small" hoist value="venta_mercaderia">
                        <sl-option value="venta_mercaderia">Venta de mercadería</sl-option>
                        <sl-option value="prestacion_servicios">Prestación de servicios</sl-option>
                    </sl-select>
                </div>
            </div>
        </sl-details>

        ${_sectionReceptor()}
        ${_sectionItemsFAC('③')}
        ${_sectionCondicionPago('④')}
    </div>`;
}

// ============================================
// FORM: NOTA DE CRÉDITO
// ============================================

function _renderFormNC() {
    const cdcRef = _dte.datos_nc.cdc_referenciado;
    return `
    <div class="space-y-1">
        <sl-details summary="① Datos Generales" open class="mb-3">
            <div class="grid grid-cols-2 gap-3 pt-1">
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">FECHA <span class="text-red-500">*</span></label>
                    <sl-input id="dteFecha" type="date" size="small" value="${_dte.fecha}"></sl-input>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">MOTIVO</label>
                    <sl-select id="dteMotivoNC" size="small" hoist value="${_dte.datos_nc.motivo}">
                        <sl-option value="devolucion_ajuste">Devolución y Ajuste</sl-option>
                        <sl-option value="error_cdc">Error en el CDC</sl-option>
                        <sl-option value="otros">Otros</sl-option>
                    </sl-select>
                </div>
            </div>
        </sl-details>

        <sl-details summary="② Documento Asociado (FAC)" open class="mb-3">
            <div class="space-y-3 pt-1">
                <div class="flex gap-2 items-end">
                    <div class="flex-1">
                        <label class="block text-xs font-bold text-gray-500 mb-1">Buscar N° Factura o CDC</label>
                        <sl-input id="dteBuscarNCRef" size="small" placeholder="FAC-... o número factura" value="${escapeHTML(_dte.datos_nc.factura_ref_id || '')}"></sl-input>
                    </div>
                    <sl-button data-action="buscarFacturaNCRef" variant="neutral" size="small">Buscar</sl-button>
                </div>
                <div id="dteNCRefResultados" class="${cdcRef ? '' : 'hidden'}">
                    ${cdcRef ? `<div class="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                        <strong>CDC:</strong> <span class="font-mono break-all">${escapeHTML(cdcRef)}</span>
                    </div>` : ''}
                </div>
            </div>
        </sl-details>

        ${_sectionReceptor()}
        ${_sectionItemsFAC('④')}
        ${_sectionCondicionPago('⑤')}
    </div>`;
}

// ============================================
// FORM: NOTA DE REMISIÓN ELECTRÓNICA
// ============================================

function _renderFormNRE() {
    return `
    <div class="space-y-1">
        <sl-details summary="① Datos Generales" open class="mb-3">
            <div class="pt-1">
                <label class="block text-xs font-bold text-gray-500 mb-1">FECHA <span class="text-red-500">*</span></label>
                <sl-input id="dteFecha" type="date" size="small" value="${_dte.fecha}" style="max-width:180px;"></sl-input>
            </div>
        </sl-details>

        <sl-details summary="② Documento Asociado (FAC, opcional)" class="mb-3">
            <div class="pt-1">
                <label class="block text-xs font-bold text-gray-500 mb-1">CDC de Factura Referenciada</label>
                <sl-input id="dteNRECDCRef" size="small" placeholder="44 dígitos (opcional)" value="${escapeHTML(_dte.datos_nc.cdc_referenciado || '')}"></sl-input>
            </div>
        </sl-details>

        <sl-details summary="③ Datos del Receptor" open class="mb-3">
            <div class="space-y-3 pt-1">
                <div class="relative">
                    <label class="block text-xs font-bold text-gray-500 mb-1">BUSCAR CLIENTE <span class="text-red-500">*</span></label>
                    <sl-input id="dteBuscarClienteInput" size="small" placeholder="Nombre o RUC..." clearable></sl-input>
                    <div id="dteClienteResultados" class="hidden absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto"></div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">RUC</label>
                        <sl-input id="dteReceptorRUC" size="small" value="${escapeHTML(_dte.receptor?.ruc || '')}" readonly></sl-input>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">RAZÓN SOCIAL</label>
                        <sl-input id="dteReceptorNombre" size="small" value="${escapeHTML(_dte.receptor?.razon_social || _dte.receptor?.nombre || '')}" readonly></sl-input>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">EMAIL</label>
                        <sl-input id="dteReceptorEmail" size="small" type="email" value="${escapeHTML(_dte.receptor?.email || '')}"></sl-input>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">TELÉFONO</label>
                        <sl-input id="dteReceptorTel" size="small" value="${escapeHTML(_dte.receptor?.telefono || '')}"></sl-input>
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">DOMICILIO FISCAL</label>
                    <sl-input id="dteReceptorDireccion" size="small" value="${escapeHTML(_dte.receptor?.direccion || '')}"></sl-input>
                </div>
            </div>
        </sl-details>

        <sl-details summary="④ Datos Específicos del Traslado" open class="mb-3">
            <div class="grid grid-cols-2 gap-3 pt-1">
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">MOTIVO TRASLADO</label>
                    <sl-select id="dteNREMotivo" size="small" hoist value="${_dte.datos_nre.motivo}">
                        <sl-option value="traslado_ventas">Traslado por ventas</sl-option>
                        <sl-option value="traslado_consignacion">Traslado en consignación</sl-option>
                        <sl-option value="traslado_entre_locales">Entre locales del mismo propietario</sl-option>
                        <sl-option value="traslado_devolucion">Devolución al proveedor</sl-option>
                        <sl-option value="otros">Otros</sl-option>
                    </sl-select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">RESPONSABLE</label>
                    <sl-select id="dteNREResponsable" size="small" hoist value="${_dte.datos_nre.responsable}">
                        <sl-option value="emisor">Emisor</sl-option>
                        <sl-option value="receptor">Receptor</sl-option>
                        <sl-option value="tercero">Tercero</sl-option>
                    </sl-select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">KM ESTIMADOS</label>
                    <sl-input id="dteNREKm" size="small" type="number" min="0" step="1" value="${_dte.datos_nre.km || ''}"></sl-input>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">FECHA FUTURA FACTURA</label>
                    <sl-input id="dteNREFechaFutura" size="small" type="date" value=""></sl-input>
                </div>
            </div>
        </sl-details>

        <sl-details summary="⑤ Transporte" class="mb-3">
            <div class="grid grid-cols-2 gap-3 pt-1">
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">TIPO TRANSPORTE</label>
                    <sl-select id="dteNRETipoTransporte" size="small" hoist value="${_dte.datos_nre.tipo_transporte}">
                        <sl-option value="propio">Propio</sl-option>
                        <sl-option value="tercero">Tercero</sl-option>
                    </sl-select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">MODALIDAD</label>
                    <sl-select id="dteNREModalidad" size="small" hoist value="${_dte.datos_nre.modalidad}">
                        <sl-option value="terrestre">Terrestre</sl-option>
                        <sl-option value="fluvial">Fluvial</sl-option>
                        <sl-option value="aereo">Aéreo</sl-option>
                    </sl-select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">INICIO TRASLADO</label>
                    <sl-input id="dteNREFechaInicio" size="small" type="date" value="${_dte.datos_nre.fecha_inicio}"></sl-input>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">FIN TRASLADO</label>
                    <sl-input id="dteNREFechaFin" size="small" type="date" value="${_dte.datos_nre.fecha_fin}"></sl-input>
                </div>
            </div>
        </sl-details>

        <sl-details summary="⑥ Lugar de Salida" open class="mb-3">
            <div class="grid grid-cols-2 gap-2 pt-1">
                <div class="col-span-2">
                    <label class="block text-xs font-bold text-gray-500 mb-1">DIRECCIÓN <span class="text-red-500">*</span></label>
                    <sl-input id="dteNRESalidaDireccion" size="small" value="${escapeHTML(_dte.salida.direccion)}"></sl-input>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">NRO. CASA</label>
                    <sl-input id="dteNRESalidaNro" size="small" value="${escapeHTML(_dte.salida.nro)}"></sl-input>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">CIUDAD</label>
                    <sl-input id="dteNRESalidaCiudad" size="small" value="${escapeHTML(_dte.salida.ciudad)}"></sl-input>
                </div>
            </div>
        </sl-details>

        <sl-details summary="⑦ Lugar de Entrega" class="mb-3">
            <div class="pt-1 mb-2">
                <label class="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" id="dteCopiarSalida" class="rounded"> Copiar datos de salida
                </label>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div class="col-span-2">
                    <label class="block text-xs font-bold text-gray-500 mb-1">DIRECCIÓN <span class="text-red-500">*</span></label>
                    <sl-input id="dteNREEntregaDireccion" size="small" value="${escapeHTML(_dte.entrega.direccion)}"></sl-input>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">NRO. CASA</label>
                    <sl-input id="dteNREEntregaNro" size="small" value="${escapeHTML(_dte.entrega.nro)}"></sl-input>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1">CIUDAD</label>
                    <sl-input id="dteNREEntregaCiudad" size="small" value="${escapeHTML(_dte.entrega.ciudad)}"></sl-input>
                </div>
            </div>
        </sl-details>

        <sl-details summary="⑧ Ítems (Mercaderías a Trasladar)" open class="mb-3">
            <div class="space-y-2 pt-1">
                <div id="dteItemsContainer" class="space-y-2">
                    ${_dte.items.length ? _dte.items.map((it, idx) => _renderItemRowNRE(idx, it)).join('') : '<p class="text-xs text-gray-400 text-center py-2">Agregá los ítems a trasladar.</p>'}
                </div>
                <sl-button data-action="agregarItemDTE" variant="neutral" size="small" outline class="w-full mt-2">
                    <i data-lucide="plus" class="w-4 h-4 pointer-events-none"></i> Agregar ítem
                </sl-button>
            </div>
        </sl-details>
    </div>`;
}

function _renderItemRowNRE(idx, it) {
    it = it || {};
    return `
    <div class="p-3 rounded-lg border border-gray-200 bg-gray-50" data-dte-item="${idx}">
        <div class="grid grid-cols-5 gap-1 items-end">
            <div>
                <label class="block text-[10px] font-bold text-gray-400 mb-0.5">CÓDIGO</label>
                <sl-input size="small" value="${escapeHTML(it.codigoInterno || '')}" placeholder="SKU"
                    data-dte-field="codigoInterno" data-dte-idx="${idx}"></sl-input>
            </div>
            <div class="col-span-2">
                <label class="block text-[10px] font-bold text-gray-400 mb-0.5">DESCRIPCIÓN <span class="text-red-500">*</span></label>
                <sl-input size="small" value="${escapeHTML(it.descripcion || '')}" placeholder="Nombre del artículo"
                    data-dte-field="descripcion" data-dte-idx="${idx}"></sl-input>
            </div>
            <div>
                <label class="block text-[10px] font-bold text-gray-400 mb-0.5">CANTIDAD</label>
                <sl-input size="small" type="number" min="1" step="1" value="${it.cantidad || 1}"
                    data-dte-field="cantidad" data-dte-idx="${idx}"></sl-input>
            </div>
            <div class="flex justify-between items-end">
                <div>
                    <label class="block text-[10px] font-bold text-gray-400 mb-0.5">UNIDAD</label>
                    <sl-input size="small" value="${escapeHTML(it.unidad || 'UN')}" style="width:60px;"
                        data-dte-field="unidad" data-dte-idx="${idx}"></sl-input>
                </div>
                <sl-icon-button name="trash-2" label="Quitar" style="color:#ef4444;"
                    data-action="quitarItemDTE" data-arg="${idx}"></sl-icon-button>
            </div>
        </div>
    </div>`;
}

// ============================================
// MANEJO DE ÍTEMS
// ============================================

function agregarItemDTE() {
    if (_dte.tipo === 'nota_remision') {
        _dte.items.push({ descripcion: '', codigoInterno: '', cantidad: 1, unidad: 'UN' });
    } else {
        _dte.items.push({ descripcion: '', codigoInterno: '', productoId: '', varianteId: '', cantidad: 1, precio: 0, tasa: 10, iva: 0, total: 0 });
    }
    renderFormDTE();
}

function quitarItemDTE(idx) {
    _dte.items.splice(idx, 1);
    renderFormDTE();
}

// ---- Leer valores del DOM para ítems ----
function _leerItemsDelDOM() {
    const content = document.getElementById('drawerEmitirDTEContent');
    if (!content) return;

    const rows = content.querySelectorAll('[data-dte-item]');
    rows.forEach(row => {
        const idx = parseInt(row.dataset.dteItem);
        if (!_dte.items[idx]) return;

        row.querySelectorAll('[data-dte-field]').forEach(el => {
            const field = el.dataset.dtefield || el.getAttribute('data-dte-field');
            const val = el.value;
            if (field === 'cantidad' || field === 'precio') {
                _dte.items[idx][field] = parseFloat(val) || 0;
            } else if (field === 'tasa') {
                _dte.items[idx][field] = parseInt(val) || 0;
            } else {
                _dte.items[idx][field] = val;
            }
        });

        // Recalcular IVA
        if (_dte.tipo !== 'nota_remision') {
            const { iva, total } = _calcIVA(_dte.items[idx].precio, _dte.items[idx].cantidad, _dte.items[idx].tasa);
            _dte.items[idx].iva   = iva;
            _dte.items[idx].total = total;
        }
    });
}

function _calcularTotalesDTE() {
    const content = document.getElementById('drawerEmitirDTEContent');
    if (!content || _dte.tipo === 'nota_remision') return;

    // Bind input events para recalcular en tiempo real
    const bindRecalc = (el) => {
        const eventName = el.tagName.toLowerCase().startsWith('sl-') ? 'sl-input' : 'input';
        el.addEventListener(eventName, () => {
            _leerItemsDelDOM();
            _actualizarSubtotalesDOM();
        });
        if (el.tagName.toLowerCase() === 'sl-select') {
            el.addEventListener('sl-change', () => {
                _leerItemsDelDOM();
                _actualizarSubtotalesDOM();
            });
        }
    };

    content.querySelectorAll('[data-dte-field="precio"], [data-dte-field="cantidad"], [data-dte-field="tasa"]').forEach(bindRecalc);

    // Bind copiar salida en NRE
    const copiarCb = document.getElementById('dteCopiarSalida');
    if (copiarCb) {
        copiarCb.addEventListener('change', () => {
            if (!copiarCb.checked) return;
            const dirEl   = document.getElementById('dteNREEntregaDireccion');
            const nroEl   = document.getElementById('dteNREEntregaNro');
            const ciudadEl = document.getElementById('dteNREEntregaCiudad');
            const salDir   = document.getElementById('dteNRESalidaDireccion');
            const salNro   = document.getElementById('dteNRESalidaNro');
            const salCiu   = document.getElementById('dteNRESalidaCiudad');
            if (dirEl && salDir) dirEl.value    = salDir.value;
            if (nroEl && salNro) nroEl.value    = salNro.value;
            if (ciudadEl && salCiu) ciudadEl.value = salCiu.value;
        });
    }

    // Bind búsqueda cliente
    const buscarInput = document.getElementById('dteBuscarClienteInput');
    if (buscarInput) {
        buscarInput.addEventListener('sl-input', () => buscarClienteDTEInput());
        buscarInput.addEventListener('sl-clear', () => {
            const res = document.getElementById('dteClienteResultados');
            if (res) res.classList.add('hidden');
        });
    }

    _actualizarSubtotalesDOM();
}

function _actualizarSubtotalesDOM() {
    _leerItemsDelDOM();
    let totalGral = 0;
    _dte.items.forEach((it, idx) => {
        const subEl = document.getElementById(`dteSubtotal-${idx}`);
        if (subEl) subEl.value = it.total ? (typeof formatearGuaranies === 'function' ? formatearGuaranies(it.total) : it.total.toLocaleString()) : '';
        totalGral += it.total || 0;
    });
    const totEl = document.getElementById('dteTotalGral');
    if (totEl) totEl.textContent = typeof formatearGuaranies === 'function' ? formatearGuaranies(totalGral) : totalGral.toLocaleString();
}

// ============================================
// BÚSQUEDA DE CLIENTE
// ============================================

function buscarClienteDTEInput() {
    const input   = document.getElementById('dteBuscarClienteInput');
    const resDiv  = document.getElementById('dteClienteResultados');
    if (!input || !resDiv) return;

    const q = input.value.toLowerCase().trim();
    if (!q) { resDiv.classList.add('hidden'); return; }

    const clientes = (window.productosData?.clientes || []).filter(c => !c.oculto);
    const matches  = clientes.filter(c =>
        (c.nombre || '').toLowerCase().includes(q) ||
        (c.razon_social || '').toLowerCase().includes(q) ||
        (c.ruc || '').toLowerCase().includes(q)
    ).slice(0, 8);

    if (!matches.length) {
        resDiv.innerHTML = '<div class="p-3 text-xs text-gray-400">Sin resultados</div>';
    } else {
        resDiv.innerHTML = matches.map(c => `
            <button class="w-full text-left px-3 py-2.5 text-xs hover:bg-indigo-50 border-b border-gray-100 last:border-0 transition-colors"
                data-action="seleccionarClienteDTE" data-arg="${escapeHTML(c.id)}">
                <span class="font-medium text-gray-800">${escapeHTML(c.razon_social || c.nombre)}</span>
                <span class="text-gray-400 ml-2">${escapeHTML(c.ruc || '')}</span>
            </button>`).join('');
    }
    resDiv.classList.remove('hidden');
}

function seleccionarClienteDTE(clienteId) {
    const clientes = window.productosData?.clientes || [];
    const cliente  = clientes.find(c => c.id === clienteId);
    if (!cliente) return;

    _dte.receptor = cliente;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('dteReceptorRUC',      cliente.ruc || '');
    set('dteReceptorDV',       _extraerDV(cliente.ruc));
    set('dteReceptorNombre',   cliente.razon_social || cliente.nombre || '');
    set('dteReceptorDireccion',cliente.direccion || '');
    set('dteReceptorTel',      cliente.telefono || '');
    set('dteReceptorEmail',    cliente.email || '');

    const buscarInput = document.getElementById('dteBuscarClienteInput');
    if (buscarInput) buscarInput.value = cliente.razon_social || cliente.nombre || '';

    const resDiv = document.getElementById('dteClienteResultados');
    if (resDiv) resDiv.classList.add('hidden');
}

function seleccionarProductoDTE(idx, productoId, varianteId) {
    if (!_dte.items[idx]) return;
    // future: pre-fill from catalog
}

// ============================================
// BUSCAR FACTURA REFERENCIADA (NC)
// ============================================

function buscarFacturaNCRef() {
    const input = document.getElementById('dteBuscarNCRef');
    const resDiv = document.getElementById('dteNCRefResultados');
    if (!input || !resDiv) return;

    const q = input.value.trim().toLowerCase();
    if (!q) return;

    const pedidos = window.todosLosPedidos || [];
    const match   = pedidos.find(p =>
        (p.id || '').toLowerCase().includes(q) ||
        (p.numFactura || '').toLowerCase().includes(q) ||
        (p.cdc || '').toLowerCase().includes(q)
    );

    if (!match) {
        resDiv.innerHTML = '<div class="p-2 text-xs text-red-500">No se encontró la factura.</div>';
        resDiv.classList.remove('hidden');
        return;
    }

    _dte.datos_nc.cdc_referenciado   = match.cdc || match.sifen_cdc || match.id;
    _dte.datos_nc.factura_ref_id     = match.id;
    _dte.receptor = _dte.receptor || window.productosData?.clientes?.find(c => c.id === match.cliente?.id) || null;
    if (!_dte.receptor && match.cliente) _dte.receptor = match.cliente;

    // Pre-fill ítems con los de la factura referenciada
    if (match.items && match.items.length && !_dte.items.length) {
        _dte.items = match.items.map(it => ({
            descripcion:  it.nombre || it.descripcion || '',
            codigoInterno: it.productoId || '',
            productoId:   it.productoId || '',
            varianteId:   it.varianteId || '',
            cantidad:     it.cantidad || 1,
            precio:       it.precio || 0,
            tasa:         10,
            iva:          0,
            total:        it.subtotal || (it.precio * it.cantidad) || 0,
        }));
    }

    resDiv.innerHTML = `<div class="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
        <strong>FAC encontrada:</strong> ${escapeHTML(match.numFactura || match.id)}<br>
        <span class="text-[10px] font-mono break-all">CDC: ${escapeHTML(_dte.datos_nc.cdc_referenciado)}</span>
    </div>`;
    resDiv.classList.remove('hidden');

    // Re-render con datos pre-llenados
    renderFormDTE();
}

async function _preCargarFacturaNC(pedidoId) {
    const pedidos = window.todosLosPedidos || [];
    let match = pedidos.find(p => p.id === pedidoId);
    if (!match) {
        try {
            const { data } = await SupabaseService.fetchPedidoDatos(pedidoId);
            match = data;
        } catch (_) {}
    }
    if (!match) return;

    _dte.datos_nc.cdc_referenciado = match.cdc || match.sifen_cdc || match.id;
    _dte.datos_nc.factura_ref_id   = match.id;
    _dte.receptor = _dte.receptor || window.productosData?.clientes?.find(c => c.id === match.cliente?.id) || match.cliente || null;

    if (match.items && match.items.length && !_dte.items.length) {
        _dte.items = match.items.map(it => ({
            descripcion:  it.nombre || it.descripcion || '',
            codigoInterno: it.productoId || '',
            productoId:   it.productoId || '',
            varianteId:   it.varianteId || '',
            cantidad:     it.cantidad || 1,
            precio:       it.precio || 0,
            tasa:         10,
            iva:          0,
            total:        it.subtotal || (it.precio * it.cantidad) || 0,
        }));
    }

    renderFormDTE();
}

// ============================================
// EMITIR DTE
// ============================================

async function emitirDTE() {
    _leerItemsDelDOM();

    // Validaciones básicas
    if (!_dte.tipo) { mostrarToast('Seleccioná un tipo de documento', 'error'); return; }

    if (_dte.tipo !== 'nota_remision') {
        if (!_dte.receptor && !document.getElementById('dteReceptorRUC')?.value) {
            mostrarToast('Seleccioná un cliente/receptor', 'error'); return;
        }
        if (!_dte.items.length) {
            mostrarToast('Agregá al menos un ítem', 'error'); return;
        }
        const sinPrecio = _dte.items.some(it => !it.precio || it.precio <= 0);
        if (sinPrecio) { mostrarToast('Todos los ítems deben tener precio mayor a 0', 'error'); return; }
    } else {
        if (!_dte.items.length) { mostrarToast('Agregá al menos un ítem a trasladar', 'error'); return; }
        const sinDesc = _dte.items.some(it => !it.descripcion?.trim());
        if (sinDesc) { mostrarToast('Todos los ítems deben tener descripción', 'error'); return; }
        const salidaDir = document.getElementById('dteNRESalidaDireccion')?.value?.trim();
        if (!salidaDir) { mostrarToast('Ingresá la dirección de salida', 'error'); return; }
    }

    const btn = document.getElementById('btnEmitirDTE');
    if (btn) { btn.loading = true; btn.disabled = true; }

    try {
        let pedido;

        if (_dte.tipo === 'factura') {
            pedido = await _buildPedidoFAC();
        } else if (_dte.tipo === 'nota_credito') {
            pedido = await _buildPedidoNC();
        } else {
            pedido = await _buildPedidoNRE();
        }

        if (!pedido) throw new Error('No se pudo construir el documento');

        // Guardar localmente
        try {
            await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
                const list = pedidos || [];
                list.push(pedido);
                return list;
            });
        } catch (e) {
            mostrarToast('DTE creado pero no se pudo guardar localmente. Sincronice cuanto antes.', 'warning');
        }

        // Sync a Supabase
        if (typeof guardarPedido === 'function') {
            guardarPedido(pedido).then(async ok => {
                if (ok) {
                    await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
                        const list = pedidos || [];
                        const p = list.find(x => x.id === pedido.id);
                        if (p) p.sincronizado = true;
                        return list;
                    });
                }
            }).catch(e => console.error('[DTE] Error sync:', e));
        } else if (typeof SupabaseService !== 'undefined') {
            SupabaseService.upsertPedido(pedido).catch(e => console.warn('[DTE] Error upsert:', e));
        }

        mostrarToast(`${_etiquetaTipoDTE()} emitido exitosamente`, 'success');
        cerrarDrawerDTE();

        // Refrescar tablas
        if (typeof cargarDTES === 'function') setTimeout(cargarDTES, 300);
        if (typeof cargarVentas === 'function') setTimeout(cargarVentas, 300);

    } catch (e) {
        console.error('[DTE] Error emitiendo:', e);
        mostrarToast('Error al emitir: ' + (e.message || e), 'error');
    } finally {
        if (btn) { btn.loading = false; btn.disabled = false; }
    }
}

function _etiquetaTipoDTE() {
    return { factura: 'Factura Electrónica', nota_credito: 'Nota de Crédito', nota_remision: 'Nota de Remisión' }[_dte.tipo] || 'DTE';
}

function _leerReceptorDOM() {
    return {
        id:          _dte.receptor?.id || '',
        ruc:         document.getElementById('dteReceptorRUC')?.value || '',
        nombre:      document.getElementById('dteReceptorNombre')?.value || '',
        razon_social:document.getElementById('dteReceptorNombre')?.value || '',
        direccion:   document.getElementById('dteReceptorDireccion')?.value || '',
        telefono:    document.getElementById('dteReceptorTel')?.value || '',
        email:       document.getElementById('dteReceptorEmail')?.value || '',
    };
}

async function _buildPedidoFAC() {
    const numFactura = _generarNumFacturaDTE();
    const cdc        = _generarCDCDTE();
    const receptor   = _leerReceptorDOM();
    const desgloseIVA = _desgloseIVAItems(_dte.items);
    const total      = _dte.items.reduce((s, it) => s + (it.total || 0), 0);
    const fecha      = document.getElementById('dteFecha')?.value || _dte.fecha;
    const condicion  = document.getElementById('dteCondicion')?.value || _dte.condicion;
    const tipoPago   = document.getElementById('dteTipoPago')?.value || _dte.tipo_pago;

    return {
        id: 'FAC-' + crypto.randomUUID(),
        fecha: new Date().toISOString(),
        cliente: { id: receptor.id, nombre: receptor.razon_social || receptor.nombre, ruc: receptor.ruc, telefono: receptor.telefono, direccion: receptor.direccion },
        items: _dte.items.map(it => ({ productoId: it.productoId || '', nombre: it.descripcion, presentacion: it.codigoInterno || '', precio: it.precio, cantidad: it.cantidad, subtotal: it.total })),
        total,
        tipoPago,
        condicion_pago: condicion,
        estado: 'facturado_mock',
        tipo_comprobante: 'factura_electronica',
        desgloseIVA,
        numFactura,
        cdc,
        sifen_estado: 'generado_local',
        vendedor_id: window.hdvUsuario?.id || null,
        sincronizado: false,
    };
}

async function _buildPedidoNC() {
    const numFactura  = _generarNumFacturaDTE();
    const cdcNC       = _generarCDCDTE();
    const receptor    = _leerReceptorDOM();
    const desgloseIVA = _desgloseIVAItems(_dte.items);
    const total       = _dte.items.reduce((s, it) => s + (it.total || 0), 0);
    const fecha       = document.getElementById('dteFecha')?.value || _dte.fecha;
    const motivo      = document.getElementById('dteMotivoNC')?.value || _dte.datos_nc.motivo;
    const condicion   = document.getElementById('dteCondicion')?.value || _dte.condicion;
    const tipoPago    = document.getElementById('dteTipoPago')?.value || _dte.tipo_pago;

    return {
        id: 'NC-' + crypto.randomUUID(),
        fecha: new Date().toISOString(),
        cliente: { id: receptor.id, nombre: receptor.razon_social || receptor.nombre, ruc: receptor.ruc, telefono: receptor.telefono, direccion: receptor.direccion },
        items: _dte.items.map(it => ({ productoId: it.productoId || '', nombre: it.descripcion, presentacion: it.codigoInterno || '', precio: it.precio, cantidad: it.cantidad, subtotal: it.total })),
        total,
        tipoPago,
        condicion_pago: condicion,
        estado: 'nota_credito_mock',
        tipo_comprobante: 'nota_credito_electronica',
        desgloseIVA,
        numFactura,
        cdc_nc:                cdcNC,
        cdc_referenciado:      _dte.datos_nc.cdc_referenciado,
        factura_referenciada_id: _dte.datos_nc.factura_ref_id,
        motivo_emision:        motivo,
        sifen_estado:          'generado_local',
        vendedor_id: window.hdvUsuario?.id || null,
        sincronizado: false,
    };
}

async function _buildPedidoNRE() {
    const receptor    = _leerReceptorDOM();
    const salidaDir   = document.getElementById('dteNRESalidaDireccion')?.value || '';
    const salidaNro   = document.getElementById('dteNRESalidaNro')?.value || '';
    const salidaCiud  = document.getElementById('dteNRESalidaCiudad')?.value || '';
    const entregaDir  = document.getElementById('dteNREEntregaDireccion')?.value || '';
    const entregaNro  = document.getElementById('dteNREEntregaNro')?.value || '';
    const entregaCiud = document.getElementById('dteNREEntregaCiudad')?.value || '';
    const cdcRef      = document.getElementById('dteNRECDCRef')?.value?.trim() || '';

    // Leer ítems NRE desde DOM
    const content = document.getElementById('drawerEmitirDTEContent');
    const rows = content ? content.querySelectorAll('[data-dte-item]') : [];
    rows.forEach(row => {
        const idx = parseInt(row.dataset.dteItem);
        if (!_dte.items[idx]) return;
        row.querySelectorAll('[data-dte-field]').forEach(el => {
            const field = el.getAttribute('data-dte-field');
            _dte.items[idx][field] = el.value;
        });
    });

    return {
        id: 'NRE-' + crypto.randomUUID(),
        fecha: new Date().toISOString(),
        estado: 'nota_remision',
        tipo_comprobante: 'nota_remision_electronica',
        sifen_estado: 'generado_local',
        receptor: { id: receptor.id, nombre: receptor.razon_social || receptor.nombre, ruc: receptor.ruc, direccion: receptor.direccion, telefono: receptor.telefono, email: receptor.email },
        items: _dte.items.map(it => ({ codigo: it.codigoInterno || '', descripcion: it.descripcion, cantidad: parseFloat(it.cantidad) || 1, unidad: it.unidad || 'UN' })),
        transporte: {
            motivo:         document.getElementById('dteNREMotivo')?.value || _dte.datos_nre.motivo,
            responsable:    document.getElementById('dteNREResponsable')?.value || _dte.datos_nre.responsable,
            km:             parseFloat(document.getElementById('dteNREKm')?.value) || 0,
            tipo_transporte:document.getElementById('dteNRETipoTransporte')?.value || 'propio',
            modalidad:      document.getElementById('dteNREModalidad')?.value || 'terrestre',
            fecha_inicio:   document.getElementById('dteNREFechaInicio')?.value || '',
            fecha_fin:      document.getElementById('dteNREFechaFin')?.value || '',
            fecha_futura_factura: document.getElementById('dteNREFechaFutura')?.value || '',
        },
        salida:  { direccion: salidaDir,  nro: salidaNro,  ciudad: salidaCiud },
        entrega: { direccion: entregaDir, nro: entregaNro, ciudad: entregaCiud },
        cdc_referenciado: cdcRef || undefined,
        vendedor_id: window.hdvUsuario?.id || null,
        sincronizado: false,
    };
}

// ============================================
// CONSULTAR DTES
// ============================================

function cargarDTES() {
    const pedidos = window.todosLosPedidos || [];
    _dtesFiltrados = pedidos.filter(p => {
        const id = p.id || '';
        const tc = p.tipo_comprobante || '';
        return id.startsWith('FAC-') || id.startsWith('NC-') || id.startsWith('NRE-') ||
               tc === 'factura_electronica' || tc === 'nota_credito_electronica' || tc === 'nota_remision_electronica';
    });
    _dtesFiltrados.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    _renderDTESTabla(_dtesFiltrados);
}

function filtrarDTES() {
    const q    = (document.getElementById('dtesBusqueda')?.value || '').toLowerCase().trim();
    const tipo = document.getElementById('dtesFiltroTipo')?.value || '';

    let base = window.todosLosPedidos || [];
    base = base.filter(p => {
        const id = p.id || '';
        const tc = p.tipo_comprobante || '';
        return id.startsWith('FAC-') || id.startsWith('NC-') || id.startsWith('NRE-') ||
               tc === 'factura_electronica' || tc === 'nota_credito_electronica' || tc === 'nota_remision_electronica';
    });

    if (tipo) base = base.filter(p => (p.tipo_comprobante || '') === tipo);

    if (q) base = base.filter(p => {
        const numF = (p.numFactura || p.sifen_numFactura || '').toLowerCase();
        const cdc  = (p.cdc || p.sifen_cdc || p.cdc_nc || '').toLowerCase();
        const nom  = (p.cliente?.nombre || p.receptor?.nombre || '').toLowerCase();
        const id   = (p.id || '').toLowerCase();
        return numF.includes(q) || cdc.includes(q) || nom.includes(q) || id.includes(q);
    });

    _dtesFiltrados = base.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    _renderDTESTabla(_dtesFiltrados);
}

function _renderDTESTabla(dtes) {
    const container = document.getElementById('dtesTabla');
    if (!container) return;

    if (!dtes.length) {
        container.innerHTML = '<div class="text-center py-12 text-gray-400 text-sm">No hay DTEs emitidos. Usá los botones de arriba para emitir.</div>';
        return;
    }

    const TIPO_LABEL = {
        'factura_electronica':       'Factura Electrónica',
        'nota_credito_electronica':  'Nota de Crédito',
        'nota_remision_electronica': 'Nota de Remisión',
    };

    const TIPO_BADGE = {
        'factura_electronica':       'bg-indigo-100 text-indigo-700',
        'nota_credito_electronica':  'bg-orange-100 text-orange-700',
        'nota_remision_electronica': 'bg-teal-100 text-teal-700',
    };

    const rows = dtes.map(d => {
        const fecha  = typeof formatearFecha === 'function' ? formatearFecha(d.fecha).substring(0, 10) : (d.fecha || '').substring(0, 10);
        const tc     = d.tipo_comprobante || '';
        const tipoCls= TIPO_BADGE[tc] || 'bg-gray-100 text-gray-500';
        const tipLbl = TIPO_LABEL[tc] || tc;
        const num    = d.numFactura || d.sifen_numFactura || d.id?.substring(0, 22) || '—';
        const recNom = d.cliente?.nombre || d.receptor?.nombre || '—';
        const total  = d.total ? (typeof formatearGuaranies === 'function' ? formatearGuaranies(d.total) : d.total.toLocaleString()) : '—';
        const sifen  = d.sifen_estado || 'generado_local';
        const sifenCls = sifen === 'aprobado' ? 'text-green-600' : sifen === 'rechazado' ? 'text-red-600' : 'text-amber-600';
        const cdc    = d.cdc || d.sifen_cdc || d.cdc_nc || '';

        return `<tr class="hover:bg-gray-50 border-b border-gray-100 last:border-0">
            <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">${fecha}</td>
            <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${tipoCls}">${escapeHTML(tipLbl)}</span>
            </td>
            <td class="px-4 py-3 text-xs font-mono text-gray-700">${escapeHTML(num)}</td>
            <td class="px-4 py-3 text-xs text-gray-800">${escapeHTML(recNom)}</td>
            <td class="px-4 py-3 text-xs ${sifenCls}">${escapeHTML(sifen.replace(/_/g, ' '))}</td>
            <td class="px-4 py-3 text-xs font-semibold text-right text-gray-800 whitespace-nowrap">${total}</td>
            <td class="px-4 py-3 text-xs">
                ${cdc ? `<button class="text-[10px] font-mono text-gray-400 hover:text-indigo-600 truncate max-w-[120px] block" title="${escapeHTML(cdc)}" data-action="copiarCDCDTE" data-arg="${escapeHTML(cdc)}">${escapeHTML(cdc.substring(0, 12))}…</button>` : '—'}
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `<table class="w-full text-left">
        <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase">Fecha</th>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase">Tipo</th>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase">Número</th>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase">Receptor</th>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase">Estado SIFEN</th>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase text-right">Total</th>
                <th class="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase">CDC</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================
// EXPORTAR CSV
// ============================================

function exportarDTEScsv() {
    if (!_dtesFiltrados.length) { mostrarToast('No hay DTEs para exportar', 'error'); return; }

    const TIPO_LABEL = {
        'factura_electronica':       'FAC',
        'nota_credito_electronica':  'NC',
        'nota_remision_electronica': 'NRE',
    };

    const header = ['Fecha', 'Tipo', 'Número', 'Receptor', 'RUC', 'Total', 'Estado SIFEN', 'CDC'];
    const rows   = _dtesFiltrados.map(d => [
        (d.fecha || '').substring(0, 10),
        TIPO_LABEL[d.tipo_comprobante] || d.tipo_comprobante || '',
        d.numFactura || d.sifen_numFactura || d.id || '',
        d.cliente?.nombre || d.receptor?.nombre || '',
        d.cliente?.ruc || d.receptor?.ruc || '',
        d.total || '',
        d.sifen_estado || 'generado_local',
        d.cdc || d.sifen_cdc || d.cdc_nc || '',
    ]);

    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `dtes_${new Date().toISOString().substring(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast(`Exportados ${_dtesFiltrados.length} DTEs`, 'success');
}
