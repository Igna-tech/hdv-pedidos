// ============================================
// HDV Admin — Módulo Consulta de Estado DTE / SIFEN
// Ciclo de vida de Documentos Tributarios Electrónicos
// ============================================

const SIFEN_ESTADO_UI = {
    generado_local: { label: 'Generado (Local)',  css: 'bg-yellow-100 text-yellow-800 border border-yellow-200' },
    enviado_set:    { label: 'Enviado a SET',      css: 'bg-blue-100 text-blue-800 border border-blue-200' },
    aprobado_set:   { label: 'Aprobado por SET',   css: 'bg-green-100 text-green-800 border border-green-200' },
    rechazado_set:  { label: 'Rechazado por SET',  css: 'bg-red-100 text-red-800 border border-red-200' },
    anulado_set:    { label: 'Anulado',            css: 'bg-gray-100 text-gray-500 border border-gray-200' },
};

const TIPO_COMPROBANTE_LABELS = {
    factura_electronica: 'Factura Electrónica (DE Tipo 1)',
    nota_credito: 'Nota de Crédito (DE Tipo 5)',
};

let _sifenDocs = [];
let _sifenFiltrados = [];

// ============================================
// CARGA
// ============================================

function cargarSifenEstado() {
    const contenedor = document.getElementById('sifenTabla');
    if (contenedor) contenedor.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm">Cargando...</div>';

    // Filtrar pedidos FAC- o estados de factura/nota de crédito
    const docs = (todosLosPedidos || []).filter(p =>
        p.id?.startsWith('FAC-') ||
        p.estado === 'facturado_mock' ||
        p.estado === 'nota_credito_mock'
    );

    _sifenDocs = docs.map(p => {
        const datos = p.datos || {};
        return {
            ...p,
            sifen_estado: datos.sifen_estado || p.sifen_estado || 'generado_local',
            numFactura:   datos.numFactura   || p.numFactura   || '',
            cdc:          datos.cdc          || p.cdc          || '',
            clienteNombre: datos.cliente?.nombre || '—',
            clienteRuc:    datos.cliente?.ruc    || '—',
            total:        datos.total        || p.total        || 0,
            tipoComprobante: datos.tipo_comprobante || 'factura_electronica',
        };
    }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    _sifenFiltrados = [..._sifenDocs];

    renderSifenResumen();
    renderSifenTabla();
}

// ============================================
// RENDER RESUMEN
// ============================================

function renderSifenResumen() {
    const el = document.getElementById('sifenResumen');
    if (!el) return;

    const total      = _sifenDocs.length;
    const pendientes = _sifenDocs.filter(d => d.sifen_estado === 'generado_local').length;
    const aprobados  = _sifenDocs.filter(d => d.sifen_estado === 'aprobado_set').length;
    const rechazados = _sifenDocs.filter(d => d.sifen_estado === 'rechazado_set').length;

    el.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="saas-card p-4 text-center">
                <div class="text-3xl font-bold text-gray-800">${total}</div>
                <div class="text-xs text-gray-500 mt-1 font-medium">Total DTEs</div>
            </div>
            <div class="saas-card p-4 text-center !border-yellow-200 bg-yellow-50/30">
                <div class="text-3xl font-bold text-yellow-700">${pendientes}</div>
                <div class="text-xs text-gray-500 mt-1 font-medium">Pendientes envío</div>
            </div>
            <div class="saas-card p-4 text-center !border-green-200 bg-green-50/20 ${aprobados === 0 ? 'opacity-40' : ''}">
                <div class="text-3xl font-bold text-green-700">${aprobados}</div>
                <div class="text-xs text-gray-500 mt-1 font-medium">Aprobados SET</div>
            </div>
            <div class="saas-card p-4 text-center !border-red-200 bg-red-50/20 ${rechazados === 0 ? 'opacity-40' : ''}">
                <div class="text-3xl font-bold text-red-700">${rechazados}</div>
                <div class="text-xs text-gray-500 mt-1 font-medium">Rechazados SET</div>
            </div>
        </div>
    `;
}

// ============================================
// RENDER TABLA
// ============================================

function renderSifenTabla() {
    const el = document.getElementById('sifenTabla');
    if (!el) return;

    if (_sifenFiltrados.length === 0) {
        el.innerHTML = `
            <div class="text-center py-16">
                <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <i data-lucide="file-x" class="w-6 h-6 text-gray-400"></i>
                </div>
                <p class="text-sm text-gray-500 font-medium">Sin documentos tributarios</p>
                <p class="text-xs text-gray-400 mt-1">Las facturas emitidas aparecerán aquí automáticamente.</p>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    const rows = _sifenFiltrados.map(doc => {
        const estadoUI = SIFEN_ESTADO_UI[doc.sifen_estado] || SIFEN_ESTADO_UI.generado_local;
        const cdcCorto  = doc.cdc ? doc.cdc.substring(0, 14) + '…' : '—';
        const fecha     = doc.fecha ? new Date(doc.fecha).toLocaleDateString('es-PY') : '—';
        const monto     = typeof doc.total === 'number' ? 'Gs. ' + doc.total.toLocaleString('es-PY') : '—';
        const esPendiente = doc.sifen_estado === 'generado_local';

        return `
            <tr class="border-b border-gray-100 hover:bg-gray-50/70 transition-colors">
                <td class="px-4 py-3 text-xs font-mono font-semibold text-gray-700">${escapeHTML(doc.numFactura || '—')}</td>
                <td class="px-4 py-3 text-xs font-mono text-gray-500 cursor-help" title="${escapeHTML(doc.cdc)}">${escapeHTML(cdcCorto)}</td>
                <td class="px-4 py-3 text-sm font-medium text-gray-800 max-w-[180px] truncate" title="${escapeHTML(doc.clienteNombre)}">${escapeHTML(doc.clienteNombre)}</td>
                <td class="px-4 py-3 text-xs text-gray-500 font-mono">${escapeHTML(doc.clienteRuc)}</td>
                <td class="px-4 py-3 text-sm font-semibold text-gray-800 text-right tabular-nums">${escapeHTML(monto)}</td>
                <td class="px-4 py-3 text-xs text-gray-500">${fecha}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${estadoUI.css}">
                        ${estadoUI.label}
                    </span>
                </td>
                <td class="px-4 py-3">
                    <div class="flex gap-1 items-center">
                        <button data-action="verDetalleSifen" data-arg="${escapeHTML(doc.id)}"
                            class="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition-colors whitespace-nowrap">
                            Ver detalle
                        </button>
                        <button data-action="irAVentasSifen" data-arg="${escapeHTML(doc.id)}"
                            class="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors whitespace-nowrap">
                            Ir a Ventas
                        </button>
                        ${esPendiente ? `<button disabled title="Requiere certificado digital. Ver pendientes en Notion."
                            class="text-xs text-gray-300 px-2 py-1 rounded cursor-not-allowed whitespace-nowrap" aria-disabled="true">
                            Enviar SET ⏳
                        </button>` : ''}
                    </div>
                </td>
            </tr>`;
    }).join('');

    el.innerHTML = `
        <div class="overflow-x-auto rounded-lg border border-gray-200">
            <table class="w-full text-left">
                <thead class="bg-gray-50/80 border-b border-gray-200">
                    <tr>
                        <th class="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide">N° Factura</th>
                        <th class="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide">CDC</th>
                        <th class="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Cliente</th>
                        <th class="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide">RUC</th>
                        <th class="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide text-right">Monto</th>
                        <th class="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Fecha</th>
                        <th class="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Estado SET</th>
                        <th class="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide">Acciones</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================
// FILTROS
// ============================================

function filtrarSifenEstado() {
    const busqueda    = document.getElementById('sifenBusqueda')?.value?.toLowerCase().trim() || '';
    const estadoFiltro = document.getElementById('sifenFiltroEstado')?.value || '';

    _sifenFiltrados = _sifenDocs.filter(d => {
        const coincideBusqueda = !busqueda ||
            d.numFactura?.toLowerCase().includes(busqueda) ||
            d.cdc?.toLowerCase().includes(busqueda) ||
            d.clienteNombre?.toLowerCase().includes(busqueda) ||
            d.clienteRuc?.toLowerCase().includes(busqueda) ||
            d.id?.toLowerCase().includes(busqueda);
        const coincideEstado = !estadoFiltro || d.sifen_estado === estadoFiltro;
        return coincideBusqueda && coincideEstado;
    });

    renderSifenTabla();
}

// ============================================
// ACCIONES
// ============================================

async function verDetalleSifen(pedidoId) {
    const doc = _sifenDocs.find(d => d.id === pedidoId);
    if (!doc) return;

    const datos    = doc.datos || {};
    const estadoUI = SIFEN_ESTADO_UI[doc.sifen_estado] || SIFEN_ESTADO_UI.generado_local;
    const fecha    = doc.fecha ? new Date(doc.fecha).toLocaleString('es-PY') : '—';
    const monto    = typeof doc.total === 'number' ? 'Gs. ' + doc.total.toLocaleString('es-PY') : '—';
    const tipoLabel = TIPO_COMPROBANTE_LABELS[doc.tipoComprobante] || 'Factura Electrónica (DE Tipo 1)';

    await mostrarConfirmModal(`
        <div class="space-y-4 text-sm">

            <div class="flex justify-between items-center pb-3 border-b">
                <span class="text-xs font-bold text-gray-500 uppercase tracking-wide">Estado actual SET</span>
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${estadoUI.css}">${estadoUI.label}</span>
            </div>

            <div class="space-y-2.5">
                <div class="flex justify-between gap-4">
                    <span class="text-gray-500 shrink-0">Tipo de documento</span>
                    <span class="font-medium text-right text-xs">${tipoLabel}</span>
                </div>
                <div class="flex justify-between gap-4">
                    <span class="text-gray-500 shrink-0">N° de Factura</span>
                    <span class="font-mono font-semibold">${escapeHTML(doc.numFactura || '—')}</span>
                </div>
                <div class="flex justify-between gap-4">
                    <span class="text-gray-500 shrink-0">Fecha de emisión</span>
                    <span>${fecha}</span>
                </div>
                <div class="flex justify-between gap-4">
                    <span class="text-gray-500 shrink-0">Cliente</span>
                    <span class="font-medium">${escapeHTML(doc.clienteNombre)}</span>
                </div>
                <div class="flex justify-between gap-4">
                    <span class="text-gray-500 shrink-0">RUC</span>
                    <span class="font-mono">${escapeHTML(doc.clienteRuc)}</span>
                </div>
                <div class="flex justify-between gap-4">
                    <span class="text-gray-500 shrink-0">Monto total</span>
                    <span class="font-bold text-gray-800">${monto}</span>
                </div>
            </div>

            <div class="border-t pt-3">
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">CDC — Código de Control Digital (44 dígitos)</div>
                <div class="font-mono text-[11px] break-all bg-gray-50 rounded-lg p-3 border border-gray-200 select-all">${escapeHTML(doc.cdc || '—')}</div>
            </div>

            ${datos.sifen_qr_url ? `
            <div class="border-t pt-3">
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">URL de verificación QR</div>
                <a href="${escapeHTML(datos.sifen_qr_url)}" target="_blank" rel="noopener noreferrer"
                   class="text-xs text-indigo-600 hover:underline break-all">${escapeHTML(datos.sifen_qr_url)}</a>
            </div>` : ''}

            <div class="border-t pt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 leading-relaxed">
                <strong>⚠ Pendiente de validación tributaria:</strong> El XML SIFEN v150 fue generado localmente con CDC válido.
                Para tener validez ante la SET, debe firmarse con el certificado digital DNIT y enviarse al servidor SIFEN.
            </div>

        </div>
    `, { titulo: `DTE — ${escapeHTML(doc.id)}`, confirmText: 'Cerrar', cancelText: null });
}

function irAVentasSifen(pedidoId) {
    cambiarSeccion('ventas');
    setTimeout(() => {
        const busq = document.getElementById('ventasBusqueda');
        if (busq) {
            busq.value = pedidoId;
            if (typeof cargarVentas === 'function') cargarVentas();
        }
    }, 350);
}

function exportarSifenCSV() {
    if (_sifenFiltrados.length === 0) {
        mostrarToast('No hay documentos para exportar', 'warning');
        return;
    }

    const headers = ['ID Pedido', 'N° Factura', 'CDC (44 dígitos)', 'Cliente', 'RUC', 'Monto (Gs)', 'Fecha', 'Estado SET', 'Tipo Comprobante'];
    const rows = _sifenFiltrados.map(d => [
        d.id,
        d.numFactura || '',
        d.cdc || '',
        d.clienteNombre,
        d.clienteRuc,
        d.total || 0,
        d.fecha ? new Date(d.fecha).toLocaleDateString('es-PY') : '',
        SIFEN_ESTADO_UI[d.sifen_estado]?.label || d.sifen_estado,
        TIPO_COMPROBANTE_LABELS[d.tipoComprobante] || 'factura_electronica',
    ]);

    const csv = [headers, ...rows]
        .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `dte_hdv_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarExito('CSV exportado correctamente');
}
