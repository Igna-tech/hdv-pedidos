// js/admin/proveedores.js
// Módulo: Gestión de Proveedores (Directorio / Órdenes de Compra / Cuentas x Pagar / Análisis)

// ============================================================
// ESTADO GLOBAL
// ============================================================

let proveedoresData     = [];
let ordenesCompraData   = [];
let pagosProveedorData  = [];

let _tabProvActual = 'directorio';
let _provFiltro    = { buscar: '', categoria: '', inactivos: false };
let _ocFiltro      = { estado: '', proveedorId: '' };
let _paginaProv    = 1;
let _paginaOC      = 1;
const PROV_POR_PAGINA = 20;
const OC_POR_PAGINA   = 25;

let _chartProvVolumen  = null;
let _chartProvScatter  = null;
let _itemsOCTemp       = [];
let _ocEditandoId      = null;
let _pagoOCId          = null;

// ============================================================
// ENTRY POINT
// ============================================================

async function cargarProveedores() {
    const [r1, r2, r3] = await Promise.all([
        SupabaseService.fetchProveedores(),
        SupabaseService.fetchOrdenesCompra(),
        SupabaseService.fetchPagosProveedor(),
    ]);

    proveedoresData    = r1.data || [];
    ordenesCompraData  = r2.data || [];
    pagosProveedorData = r3.data || [];

    _actualizarKPIsHeader();
    _actualizarBadgeSidebar();
    _poblarFiltroOCProveedor();
    _cambiarTabProv(_tabProvActual);
}

function _poblarFiltroOCProveedor() {
    const sl = document.getElementById('filtroOCProveedor');
    if (!sl) return;
    const activos = proveedoresData.filter(p => p.activo !== false);
    sl.innerHTML = `<sl-option value="">Todos los proveedores</sl-option>` +
        activos.map(p => `<sl-option value="${escapeHTML(p.id)}">${escapeHTML(p.nombre)}</sl-option>`).join('');
}

// ============================================================
// HELPERS KPIs
// ============================================================

function _saldoPendienteOC(oc) {
    return Math.max(0, (Number(oc.total) || 0) - (Number(oc.pagado) || 0));
}

function _deudaTotalProveedores() {
    return ordenesCompraData
        .filter(oc => oc.estado === 'recibida')
        .reduce((s, oc) => s + _saldoPendienteOC(oc), 0);
}

function _actualizarKPIsHeader() {
    const activos = proveedoresData.filter(p => p.activo !== false).length;
    const deudaTotal = _deudaTotalProveedores();

    const elTotal = document.getElementById('provKpiTotal');
    const elDeuda = document.getElementById('provKpiDeuda');
    if (elTotal) elTotal.textContent = `${proveedoresData.length} proveedores (${activos} activos)`;
    if (elDeuda && deudaTotal > 0) {
        elDeuda.textContent = `Deuda total: Gs. ${_fmt(deudaTotal)}`;
        elDeuda.classList.remove('hidden');
    } else if (elDeuda) {
        elDeuda.textContent = '';
        elDeuda.classList.add('hidden');
    }
}

function _actualizarBadgeSidebar() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const vencidas = ordenesCompraData.filter(oc => {
        if (oc.estado !== 'recibida') return false;
        if (!oc.fecha_vencimiento) return false;
        return new Date(oc.fecha_vencimiento) < hoy && _saldoPendienteOC(oc) > 0;
    }).length;

    const badge = document.getElementById('badgeProvCxP');
    if (!badge) return;
    if (vencidas > 0) {
        badge.textContent = vencidas;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function _fmt(n) {
    return Number(n || 0).toLocaleString('es-PY');
}

function _fmtFecha(str) {
    if (!str) return '—';
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
}

function _diasEntre(fechaA, fechaB) {
    if (!fechaA || !fechaB) return null;
    const a = new Date(fechaA), b = new Date(fechaB);
    return Math.round((b - a) / 86400000);
}

function _hoy() {
    return new Date().toISOString().slice(0, 10);
}

function _categoriaLabel(cat) {
    const map = { alimentos: 'Alimentos', bebidas: 'Bebidas', limpieza: 'Limpieza', higiene: 'Higiene', otros: 'Otros' };
    return map[cat] || cat || '—';
}

function _condPagoLabel(cond) {
    const map = { contado: 'Contado', credito_15: 'Crédito 15d', credito_30: 'Crédito 30d', credito_60: 'Crédito 60d' };
    return map[cond] || cond || 'Contado';
}

// ============================================================
// TAB SWITCHING
// ============================================================

function _cambiarTabProv(tab) {
    _tabProvActual = tab;
    document.querySelectorAll('#provTabs .prov-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.arg === tab);
    });
    document.querySelectorAll('.prov-panel').forEach(el => el.classList.add('hidden'));
    const panel = document.getElementById(`prov-${tab}`);
    if (panel) panel.classList.remove('hidden');

    if (tab === 'directorio') _renderTablaProveedores();
    if (tab === 'oc') _renderTablaOC();
    if (tab === 'cxp') _renderCuentasPagar();
    if (tab === 'analisis') _renderAnalisisProveedores();
}

// ============================================================
// TAB 1 — DIRECTORIO
// ============================================================

function _provFiltrados() {
    let lista = proveedoresData.filter(p => {
        if (!_provFiltro.inactivos && p.activo === false) return false;
        if (_provFiltro.categoria && p.categoria !== _provFiltro.categoria) return false;
        if (_provFiltro.buscar) {
            const q = _provFiltro.buscar.toLowerCase();
            const haystack = `${p.nombre} ${p.razon_social || ''} ${p.ruc || ''}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });
    return lista;
}

function _filtrarProveedores() {
    const buscar = document.getElementById('buscarProveedor')?.value || '';
    const categoria = document.getElementById('filtroCategoriaProveedor')?.value || '';
    const inactivos = document.getElementById('mostrarInactivosProv')?.checked || false;
    _provFiltro = { buscar, categoria, inactivos };
    _paginaProv = 1;
    _renderTablaProveedores();
}

function _renderTablaProveedores() {
    const tbody = document.getElementById('tablaProveedoresCuerpo');
    if (!tbody) return;

    const lista = _provFiltrados();
    const totalPags = Math.max(1, Math.ceil(lista.length / PROV_POR_PAGINA));
    if (_paginaProv > totalPags) _paginaProv = totalPags;
    const slice = lista.slice((_paginaProv - 1) * PROV_POR_PAGINA, _paginaProv * PROV_POR_PAGINA);

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-gray-400 text-sm">No hay proveedores que coincidan.</td></tr>`;
        document.getElementById('paginacionProveedores').textContent = '';
        return;
    }

    tbody.innerHTML = slice.map(p => _buildProveedorRow(p)).join('');

    const pag = document.getElementById('paginacionProveedores');
    if (pag) pag.textContent = lista.length > PROV_POR_PAGINA
        ? `Mostrando ${(_paginaProv - 1) * PROV_POR_PAGINA + 1}–${Math.min(_paginaProv * PROV_POR_PAGINA, lista.length)} de ${lista.length}`
        : `${lista.length} proveedor${lista.length !== 1 ? 'es' : ''}`;
}

function _buildProveedorRow(p) {
    const ocsProveedor = ordenesCompraData.filter(oc => oc.proveedor_id === p.id);
    const deuda = ocsProveedor
        .filter(oc => oc.estado === 'recibida')
        .reduce((s, oc) => s + _saldoPendienteOC(oc), 0);

    const catBadge = p.categoria
        ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">${escapeHTML(_categoriaLabel(p.categoria))}</span>`
        : '—';

    const condColor = { contado: 'bg-blue-50 text-blue-700', credito_15: 'bg-amber-50 text-amber-700', credito_30: 'bg-orange-50 text-orange-700', credito_60: 'bg-red-50 text-red-700' };
    const condBadge = `<span class="text-[10px] px-2 py-0.5 rounded-full font-medium ${condColor[p.condiciones_pago] || 'bg-gray-100 text-gray-600'}">${escapeHTML(_condPagoLabel(p.condiciones_pago))}</span>`;

    const deudaHtml = deuda > 0
        ? `<span class="text-red-600 font-semibold">Gs. ${_fmt(deuda)}</span>`
        : `<span class="text-gray-300">—</span>`;

    const inactivoBadge = p.activo === false
        ? `<span class="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">Inactivo</span>`
        : '';

    return `<tr class="hover:bg-gray-50 transition-colors">
        <td class="px-4 py-3">
            <div class="font-medium text-gray-900 text-sm">${escapeHTML(p.nombre)}${inactivoBadge}</div>
            ${p.razon_social ? `<div class="text-xs text-gray-400">${escapeHTML(p.razon_social)}</div>` : ''}
        </td>
        <td class="px-4 py-3 font-mono text-xs text-gray-500">${escapeHTML(p.ruc || '—')}</td>
        <td class="px-4 py-3 text-xs text-gray-600">
            <div>${escapeHTML(p.contacto_principal || '—')}</div>
            ${p.telefono ? `<div class="text-gray-400">${escapeHTML(p.telefono)}</div>` : ''}
        </td>
        <td class="px-4 py-3">${catBadge}</td>
        <td class="px-4 py-3">${condBadge}</td>
        <td class="px-4 py-3 text-center text-sm text-gray-600">${ocsProveedor.length}</td>
        <td class="px-4 py-3">${deudaHtml}</td>
        <td class="px-4 py-3">
            <div class="flex items-center gap-1">
                <button class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" data-action="abrirModalProveedor" data-arg="${escapeHTML(p.id)}" title="Editar">
                    <i data-lucide="pencil" class="w-3.5 h-3.5 pointer-events-none"></i>
                </button>
                <button class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" data-action="abrirModalOC" data-arg="nuevo-${escapeHTML(p.id)}" title="Nueva OC">
                    <i data-lucide="shopping-cart" class="w-3.5 h-3.5 pointer-events-none"></i>
                </button>
                <button class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" data-action="eliminarProveedor" data-arg="${escapeHTML(p.id)}" title="Eliminar">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i>
                </button>
            </div>
        </td>
    </tr>`;
}

function abrirModalProveedor(id = null) {
    const modal = document.getElementById('modalProveedor');
    if (!modal) return;

    const p = id ? proveedoresData.find(x => x.id === id) : null;
    modal.label = p ? 'Editar Proveedor' : 'Nuevo Proveedor';

    const f = (selector, val) => {
        const el = document.getElementById(selector);
        if (!el) return;
        if (el.tagName === 'SL-INPUT' || el.tagName === 'SL-TEXTAREA') el.value = val || '';
        else if (el.tagName === 'SL-SELECT') el.value = val || '';
        else if (el.tagName === 'SL-SWITCH') el.checked = val !== false;
        else el.value = val || '';
    };

    f('provNombre',           p?.nombre);
    f('provRazonSocial',      p?.razon_social);
    f('provRUC',              p?.ruc);
    f('provTelefono',         p?.telefono);
    f('provEmail',            p?.email);
    f('provDireccion',        p?.direccion);
    f('provCiudad',           p?.ciudad);
    f('provContacto',         p?.contacto_principal);
    f('provCategoria',        p?.categoria || 'otros');
    f('provCondPago',         p?.condiciones_pago || 'contado');
    f('provNotas',            p?.notas);
    f('provActivo',           p ? p.activo !== false : true);

    document.getElementById('modalProveedor').dataset.editId = id || '';
    modal.show();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function guardarProveedor() {
    const nombre = document.getElementById('provNombre')?.value?.trim();
    if (!nombre) { mostrarToast('El nombre del proveedor es obligatorio.', 'warning'); return; }

    const editId = document.getElementById('modalProveedor')?.dataset?.editId;
    const id = editId || ('PROV-' + crypto.randomUUID().slice(0, 8).toUpperCase());

    const condPago = document.getElementById('provCondPago')?.value || 'contado';
    const diasMap = { contado: 0, credito_15: 15, credito_30: 30, credito_60: 60 };

    const row = {
        id,
        nombre,
        razon_social:       document.getElementById('provRazonSocial')?.value?.trim() || null,
        ruc:                document.getElementById('provRUC')?.value?.trim() || null,
        telefono:           document.getElementById('provTelefono')?.value?.trim() || null,
        email:              document.getElementById('provEmail')?.value?.trim() || null,
        direccion:          document.getElementById('provDireccion')?.value?.trim() || null,
        ciudad:             document.getElementById('provCiudad')?.value?.trim() || null,
        contacto_principal: document.getElementById('provContacto')?.value?.trim() || null,
        categoria:          document.getElementById('provCategoria')?.value || 'otros',
        condiciones_pago:   condPago,
        dias_credito:       diasMap[condPago] || 0,
        notas:              document.getElementById('provNotas')?.value?.trim() || null,
        activo:             document.getElementById('provActivo')?.checked !== false,
        actualizado_en:     new Date().toISOString(),
    };
    if (!editId) row.created_at = new Date().toISOString();

    const btn = document.getElementById('btnGuardarProveedor');
    if (btn) { btn.loading = true; btn.disabled = true; }

    const { success, error } = await SupabaseService.upsertProveedores([row]);

    if (btn) { btn.loading = false; btn.disabled = false; }

    if (!success) {
        mostrarToast('Error al guardar el proveedor.', 'danger');
        console.error(error);
        return;
    }

    if (editId) {
        const idx = proveedoresData.findIndex(x => x.id === editId);
        if (idx >= 0) proveedoresData[idx] = { ...proveedoresData[idx], ...row };
        else proveedoresData.push(row);
    } else {
        proveedoresData.push(row);
    }

    cerrarModalProveedor();
    _actualizarKPIsHeader();
    _renderTablaProveedores();
    mostrarToast(editId ? 'Proveedor actualizado.' : 'Proveedor creado.', 'success');
}

function cerrarModalProveedor() {
    document.getElementById('modalProveedor')?.hide();
}

async function eliminarProveedor(id) {
    const p = proveedoresData.find(x => x.id === id);
    if (!p) return;

    const ok = await mostrarConfirmModal(
        `¿Eliminar al proveedor <strong>${escapeHTML(p.nombre)}</strong>? Esta acción no se puede deshacer.`,
        { confirmLabel: 'Eliminar', confirmVariant: 'danger' }
    );
    if (!ok) return;

    const { success } = await SupabaseService.deleteProveedores([id]);
    if (!success) { mostrarToast('Error al eliminar.', 'danger'); return; }

    proveedoresData = proveedoresData.filter(x => x.id !== id);
    _actualizarKPIsHeader();
    _renderTablaProveedores();
    mostrarToast('Proveedor eliminado.', 'success');
}

// ============================================================
// TAB 2 — ÓRDENES DE COMPRA
// ============================================================

function _buildOCEstadoBadge(estado) {
    const cfg = {
        borrador:   { cls: 'bg-gray-100 text-gray-600',       label: 'Borrador'    },
        confirmada: { cls: 'bg-blue-100 text-blue-700',       label: 'Confirmada'  },
        recibida:   { cls: 'bg-emerald-100 text-emerald-700', label: 'Recibida'    },
        pagada:     { cls: 'bg-green-100 text-green-800',     label: 'Pagada'      },
        cancelada:  { cls: 'bg-red-100 text-red-600',         label: 'Cancelada'   },
    };
    const c = cfg[estado] || cfg.borrador;
    return `<span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${c.cls}">${c.label}</span>`;
}

function _ocFiltradas() {
    return ordenesCompraData.filter(oc => {
        if (_ocFiltro.estado && oc.estado !== _ocFiltro.estado) return false;
        if (_ocFiltro.proveedorId && oc.proveedor_id !== _ocFiltro.proveedorId) return false;
        return true;
    });
}

function _filtrarOC() {
    _ocFiltro.estado      = document.getElementById('filtroOCEstado')?.value || '';
    _ocFiltro.proveedorId = document.getElementById('filtroOCProveedor')?.value || '';
    _paginaOC = 1;
    _renderTablaOC();
}

function _renderTablaOC() {
    const tbody = document.getElementById('tablaOCCuerpo');
    if (!tbody) return;

    const lista = _ocFiltradas().sort((a, b) => (b.fecha_emision || '').localeCompare(a.fecha_emision || ''));
    const totalPags = Math.max(1, Math.ceil(lista.length / OC_POR_PAGINA));
    if (_paginaOC > totalPags) _paginaOC = totalPags;
    const slice = lista.slice((_paginaOC - 1) * OC_POR_PAGINA, _paginaOC * OC_POR_PAGINA);

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-12 text-center text-gray-400 text-sm">No hay órdenes de compra.</td></tr>`;
        document.getElementById('paginacionOC').textContent = '';
        return;
    }

    tbody.innerHTML = slice.map(oc => {
        const prov = proveedoresData.find(p => p.id === oc.proveedor_id);
        const saldo = _saldoPendienteOC(oc);
        return `<tr class="hover:bg-gray-50 cursor-pointer transition-colors" data-action="abrirDrawerOC" data-arg="${escapeHTML(oc.id)}">
            <td class="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold">${escapeHTML(oc.id)}</td>
            <td class="px-4 py-3 text-sm font-medium text-gray-800">${escapeHTML(prov?.nombre || '—')}</td>
            <td class="px-4 py-3 text-xs text-gray-500">${_fmtFecha(oc.fecha_emision)}</td>
            <td class="px-4 py-3 text-xs text-gray-500">${_fmtFecha(oc.fecha_esperada)}</td>
            <td class="px-4 py-3">${_buildOCEstadoBadge(oc.estado)}</td>
            <td class="px-4 py-3 text-right text-sm font-medium text-gray-800">Gs. ${_fmt(oc.total)}</td>
            <td class="px-4 py-3 text-right text-sm text-emerald-600">Gs. ${_fmt(oc.pagado)}</td>
            <td class="px-4 py-3 text-right text-sm font-semibold ${saldo > 0 ? 'text-red-600' : 'text-gray-400'}">
                ${saldo > 0 ? `Gs. ${_fmt(saldo)}` : '—'}
            </td>
            <td class="px-4 py-3">
                <button class="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors" data-action="abrirDrawerOC" data-arg="${escapeHTML(oc.id)}" title="Ver detalle">
                    <i data-lucide="eye" class="w-3.5 h-3.5 pointer-events-none"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    const pag = document.getElementById('paginacionOC');
    if (pag) pag.textContent = lista.length > OC_POR_PAGINA
        ? `Mostrando ${(_paginaOC - 1) * OC_POR_PAGINA + 1}–${Math.min(_paginaOC * OC_POR_PAGINA, lista.length)} de ${lista.length} órdenes`
        : `${lista.length} orden${lista.length !== 1 ? 'es' : ''}`;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _poblarSelectProveedoresOC() {
    const sl = document.getElementById('ocProveedor');
    if (!sl) return;
    const activos = proveedoresData.filter(p => p.activo !== false);
    sl.innerHTML = activos.map(p =>
        `<sl-option value="${escapeHTML(p.id)}">${escapeHTML(p.nombre)}</sl-option>`
    ).join('');
}

function abrirModalOC(arg = null) {
    const modal = document.getElementById('modalOC');
    if (!modal) return;

    _poblarSelectProveedoresOC();
    _itemsOCTemp = [];
    _ocEditandoId = null;

    let provPrecarg = null;
    if (arg && arg.startsWith('nuevo-')) {
        provPrecarg = arg.replace('nuevo-', '');
    }

    document.getElementById('ocProveedor').value     = provPrecarg || '';
    document.getElementById('ocFechaEmision').value  = _hoy();
    document.getElementById('ocFechaEsperada').value = '';
    document.getElementById('ocNroFactura').value    = '';
    document.getElementById('ocNotas').value         = '';
    document.getElementById('ocTotalDisplay').textContent = 'Gs. 0';
    _renderItemsOCTemp();
    _initOCItemsListeners();

    modal.label = 'Nueva Orden de Compra';
    modal.show();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

let _ocItemsListenerAdded = false;
function _initOCItemsListeners() {
    if (_ocItemsListenerAdded) return;
    const ocTable = document.querySelector('#modalOC table');
    if (!ocTable) return;
    ocTable.addEventListener('input', _handleOCItemInput);
    _ocItemsListenerAdded = true;
}

function _handleOCItemInput(e) {
    const el = e.target;
    const row = el.closest('tr[data-item-idx]');
    if (!row) return;
    const idx = parseInt(row.dataset.itemIdx);
    if (isNaN(idx) || !_itemsOCTemp[idx]) return;
    if (el.classList.contains('oc-nombre'))        _itemsOCTemp[idx].nombre = el.value;
    else if (el.classList.contains('oc-presentacion')) _itemsOCTemp[idx].presentacion = el.value;
    else if (el.classList.contains('oc-cant') || el.classList.contains('oc-precio')) _recalcularTotalOC();
}

function cerrarModalOC() {
    document.getElementById('modalOC')?.hide();
}

function _agregarItemOC() {
    _itemsOCTemp.push({ nombre: '', presentacion: '', cantidad: 1, precio_unitario: 0, subtotal: 0 });
    _renderItemsOCTemp();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _eliminarItemOC(idx) {
    _itemsOCTemp.splice(idx, 1);
    _renderItemsOCTemp();
}

function _recalcularTotalOC() {
    const tbody = document.getElementById('ocItemsCuerpo');
    if (!tbody) return;

    tbody.querySelectorAll('tr[data-item-idx]').forEach(row => {
        const idx = parseInt(row.dataset.itemIdx);
        const cant = parseFloat(row.querySelector('.oc-cant')?.value) || 0;
        const precio = parseFloat(row.querySelector('.oc-precio')?.value) || 0;
        const sub = cant * precio;
        _itemsOCTemp[idx] = { ..._itemsOCTemp[idx], cantidad: cant, precio_unitario: precio, subtotal: sub };
        const subtotalEl = row.querySelector('.oc-subtotal');
        if (subtotalEl) subtotalEl.textContent = `Gs. ${_fmt(sub)}`;
    });

    const total = _itemsOCTemp.reduce((s, it) => s + (it.subtotal || 0), 0);
    const el = document.getElementById('ocTotalDisplay');
    if (el) el.textContent = `Gs. ${_fmt(total)}`;
}

function _renderItemsOCTemp() {
    const tbody = document.getElementById('ocItemsCuerpo');
    if (!tbody) return;

    if (_itemsOCTemp.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-sm text-gray-400">Sin ítems. Hacé clic en "+ Agregar ítem".</td></tr>`;
        document.getElementById('ocTotalDisplay').textContent = 'Gs. 0';
        return;
    }

    tbody.innerHTML = _itemsOCTemp.map((it, idx) => `
        <tr data-item-idx="${idx}" class="border-b border-gray-100">
            <td class="px-2 py-2">
                <input type="text" class="oc-nombre w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                    placeholder="Nombre del producto" value="${escapeHTML(it.nombre || '')}">
            </td>
            <td class="px-2 py-2">
                <input type="text" class="oc-presentacion w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                    placeholder="Presentación" value="${escapeHTML(it.presentacion || '')}">
            </td>
            <td class="px-2 py-2 w-20">
                <input type="number" class="oc-cant w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-indigo-400"
                    min="1" value="${it.cantidad || 1}">
            </td>
            <td class="px-2 py-2 w-32">
                <input type="number" class="oc-precio w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-indigo-400"
                    min="0" step="100" value="${it.precio_unitario || 0}">
            </td>
            <td class="px-2 py-2 text-right text-xs font-medium oc-subtotal text-gray-700">Gs. ${_fmt(it.subtotal)}</td>
            <td class="px-2 py-2 text-center">
                <button class="text-red-400 hover:text-red-600 transition-colors" data-action="eliminarItemOC" data-arg="${idx}" title="Eliminar ítem">
                    <i data-lucide="x" class="w-3.5 h-3.5 pointer-events-none"></i>
                </button>
            </td>
        </tr>
    `).join('');

    _recalcularTotalOC();
}

async function guardarOC() {
    const provId = document.getElementById('ocProveedor')?.value;
    if (!provId) { mostrarToast('Seleccioná un proveedor.', 'warning'); return; }

    const itemsValidos = _itemsOCTemp.filter(it => it.nombre?.trim());
    if (itemsValidos.length === 0) { mostrarToast('Agregá al menos un ítem.', 'warning'); return; }

    const prov = proveedoresData.find(p => p.id === provId);
    const fechaEmision  = document.getElementById('ocFechaEmision')?.value  || _hoy();
    const fechaEsperada = document.getElementById('ocFechaEsperada')?.value || null;
    const nroFactura    = document.getElementById('ocNroFactura')?.value?.trim() || null;
    const notas         = document.getElementById('ocNotas')?.value?.trim() || null;

    let fechaVencimiento = null;
    if (prov && prov.dias_credito > 0 && fechaEmision) {
        const d = new Date(fechaEmision);
        d.setDate(d.getDate() + prov.dias_credito);
        fechaVencimiento = d.toISOString().slice(0, 10);
    }

    const total = itemsValidos.reduce((s, it) => s + (it.subtotal || 0), 0);
    const id = _ocEditandoId || ('OC-' + crypto.randomUUID().slice(0, 8).toUpperCase());

    const row = {
        id,
        proveedor_id: provId,
        estado: _ocEditandoId
            ? (ordenesCompraData.find(o => o.id === _ocEditandoId)?.estado || 'borrador')
            : 'borrador',
        fecha_emision:    fechaEmision,
        fecha_esperada:   fechaEsperada,
        fecha_vencimiento: fechaVencimiento,
        nro_factura_prov: nroFactura,
        items:            itemsValidos,
        total,
        pagado:           _ocEditandoId ? (ordenesCompraData.find(o => o.id === _ocEditandoId)?.pagado || 0) : 0,
        notas,
        actualizado_en:   new Date().toISOString(),
    };
    if (!_ocEditandoId) row.created_at = new Date().toISOString();

    const btn = document.getElementById('btnGuardarOC');
    if (btn) { btn.loading = true; btn.disabled = true; }

    const { success, error } = await SupabaseService.upsertOrdenesCompra([row]);

    if (btn) { btn.loading = false; btn.disabled = false; }

    if (!success) {
        mostrarToast('Error al guardar la orden de compra.', 'danger');
        console.error(error);
        return;
    }

    if (_ocEditandoId) {
        const idx = ordenesCompraData.findIndex(o => o.id === _ocEditandoId);
        if (idx >= 0) ordenesCompraData[idx] = { ...ordenesCompraData[idx], ...row };
    } else {
        ordenesCompraData.unshift(row);
    }

    cerrarModalOC();
    _actualizarKPIsHeader();
    _actualizarBadgeSidebar();
    _renderTablaOC();
    mostrarToast('Orden de compra guardada.', 'success');
}

// ============================================================
// DRAWER DETALLE OC
// ============================================================

function abrirDrawerOC(ocId) {
    const drawer = document.getElementById('drawerOC');
    if (!drawer) return;

    const oc = ordenesCompraData.find(o => o.id === ocId);
    if (!oc) return;

    const prov = proveedoresData.find(p => p.id === oc.proveedor_id);
    const pagos = pagosProveedorData.filter(pp => pp.orden_compra_id === ocId);
    const saldo = _saldoPendienteOC(oc);

    const items = Array.isArray(oc.items) ? oc.items : [];

    const botonesContextuales = _buildBotonesDrawerOC(oc, saldo);

    document.getElementById('drawerOCContenido').innerHTML = `
        <div class="p-5 space-y-5">
            <!-- Header -->
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-mono text-sm font-bold text-indigo-600">${escapeHTML(oc.id)}</span>
                        ${_buildOCEstadoBadge(oc.estado)}
                    </div>
                    <div class="text-base font-semibold text-gray-900">${escapeHTML(prov?.nombre || '—')}</div>
                    <div class="text-xs text-gray-400 mt-0.5">
                        Emitida: ${_fmtFecha(oc.fecha_emision)} · Esperada: ${_fmtFecha(oc.fecha_esperada)}
                        ${oc.fecha_vencimiento ? `· Vence: ${_fmtFecha(oc.fecha_vencimiento)}` : ''}
                        ${oc.nro_factura_prov ? `· Factura prov: ${escapeHTML(oc.nro_factura_prov)}` : ''}
                    </div>
                </div>
            </div>

            <!-- Items -->
            <div>
                <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ítems</h4>
                <table class="w-full text-xs">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-3 py-2 text-left text-gray-500 font-medium">Producto</th>
                            <th class="px-3 py-2 text-left text-gray-500 font-medium">Presentación</th>
                            <th class="px-3 py-2 text-right text-gray-500 font-medium">Cant.</th>
                            <th class="px-3 py-2 text-right text-gray-500 font-medium">P. Unit.</th>
                            <th class="px-3 py-2 text-right text-gray-500 font-medium">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${items.length === 0
                            ? `<tr><td colspan="5" class="py-4 text-center text-gray-400">Sin ítems</td></tr>`
                            : items.map(it => `<tr>
                                <td class="px-3 py-2 font-medium text-gray-800">${escapeHTML(it.nombre || '—')}</td>
                                <td class="px-3 py-2 text-gray-500">${escapeHTML(it.presentacion || '—')}</td>
                                <td class="px-3 py-2 text-right">${it.cantidad || 0}</td>
                                <td class="px-3 py-2 text-right">Gs. ${_fmt(it.precio_unitario)}</td>
                                <td class="px-3 py-2 text-right font-medium">Gs. ${_fmt(it.subtotal)}</td>
                            </tr>`).join('')
                        }
                    </tbody>
                </table>
                <div class="flex justify-end mt-2 gap-8 text-sm pr-3">
                    <span class="text-gray-500">Total:</span>
                    <span class="font-bold text-gray-900">Gs. ${_fmt(oc.total)}</span>
                </div>
            </div>

            <!-- Pagos -->
            <div>
                <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pagos registrados</h4>
                ${pagos.length === 0
                    ? `<p class="text-xs text-gray-400 py-2">Sin pagos registrados.</p>`
                    : `<table class="w-full text-xs">
                        <thead class="bg-gray-50"><tr>
                            <th class="px-3 py-2 text-left text-gray-500 font-medium">Fecha</th>
                            <th class="px-3 py-2 text-left text-gray-500 font-medium">Método</th>
                            <th class="px-3 py-2 text-right text-gray-500 font-medium">Monto</th>
                            <th class="px-3 py-2 text-left text-gray-500 font-medium">Referencia</th>
                        </tr></thead>
                        <tbody class="divide-y divide-gray-100">
                            ${pagos.map(pp => `<tr>
                                <td class="px-3 py-2">${_fmtFecha(pp.fecha)}</td>
                                <td class="px-3 py-2 capitalize">${escapeHTML(pp.metodo_pago || '—')}</td>
                                <td class="px-3 py-2 text-right font-medium text-emerald-600">Gs. ${_fmt(pp.monto)}</td>
                                <td class="px-3 py-2 text-gray-400">${escapeHTML(pp.referencia || '—')}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                    <div class="flex justify-end gap-8 mt-2 pr-3 text-sm">
                        <span class="text-gray-500">Saldo pendiente:</span>
                        <span class="font-bold ${saldo > 0 ? 'text-red-600' : 'text-emerald-600'}">Gs. ${_fmt(saldo)}</span>
                    </div>`
                }
            </div>

            ${oc.notas ? `<div class="bg-gray-50 rounded-xl p-3 text-xs text-gray-600"><strong>Notas:</strong> ${escapeHTML(oc.notas)}</div>` : ''}

            <!-- Acciones contextuales -->
            <div class="pt-2 border-t border-gray-100">
                ${botonesContextuales}
            </div>
        </div>
    `;

    drawer.label = `OC — ${escapeHTML(oc.id)}`;
    drawer.show();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _buildBotonesDrawerOC(oc, saldo) {
    if (oc.estado === 'cancelada' || oc.estado === 'pagada') {
        return `<p class="text-xs text-gray-400 text-center">OC finalizada — solo lectura.</p>`;
    }
    if (oc.estado === 'borrador') {
        return `<div class="flex gap-2 flex-wrap">
            <sl-button size="small" variant="primary" data-action="cambiarEstadoOC" data-arg="${escapeHTML(oc.id)}" data-estado="confirmada">
                <i data-lucide="check-circle" class="w-3.5 h-3.5 mr-1 pointer-events-none"></i> Confirmar OC
            </sl-button>
            <sl-button size="small" variant="danger" data-action="cambiarEstadoOC" data-arg="${escapeHTML(oc.id)}" data-estado="cancelada">
                Cancelar OC
            </sl-button>
        </div>`;
    }
    if (oc.estado === 'confirmada') {
        return `<div class="flex gap-2 flex-wrap items-end">
            <div>
                <label class="text-xs text-gray-500 block mb-1">Fecha de recepción</label>
                <input type="date" id="ocFechaRecepcionDrawer" class="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-400" value="${_hoy()}">
            </div>
            <sl-button size="small" variant="success" data-action="cambiarEstadoOC" data-arg="${escapeHTML(oc.id)}" data-estado="recibida">
                <i data-lucide="package-check" class="w-3.5 h-3.5 mr-1 pointer-events-none"></i> Registrar Recepción
            </sl-button>
            <sl-button size="small" variant="danger" data-action="cambiarEstadoOC" data-arg="${escapeHTML(oc.id)}" data-estado="cancelada">
                Cancelar OC
            </sl-button>
        </div>`;
    }
    if (oc.estado === 'recibida') {
        return `<div class="flex gap-2 flex-wrap">
            ${saldo > 0 ? `<sl-button size="small" variant="primary" data-action="registrarPagoProveedor" data-arg="${escapeHTML(oc.id)}">
                <i data-lucide="banknote" class="w-3.5 h-3.5 mr-1 pointer-events-none"></i> Registrar Pago
            </sl-button>` : ''}
            <p class="text-xs text-gray-400 self-center">${saldo > 0 ? `Saldo: Gs. ${_fmt(saldo)}` : 'Totalmente pagada.'}</p>
        </div>`;
    }
    return '';
}

function cerrarDrawerOC() {
    document.getElementById('drawerOC')?.hide();
}

async function cambiarEstadoOC(ocId, nuevoEstado) {
    const oc = ordenesCompraData.find(o => o.id === ocId);
    if (!oc) return;

    const update = { ...oc, estado: nuevoEstado, actualizado_en: new Date().toISOString() };

    if (nuevoEstado === 'recibida') {
        const fechaInput = document.getElementById('ocFechaRecepcionDrawer');
        update.fecha_recepcion = fechaInput?.value || _hoy();
    }

    const { success, error } = await SupabaseService.upsertOrdenesCompra([update]);
    if (!success) { mostrarToast('Error al actualizar estado.', 'danger'); console.error(error); return; }

    const idx = ordenesCompraData.findIndex(o => o.id === ocId);
    if (idx >= 0) ordenesCompraData[idx] = update;

    cerrarDrawerOC();
    _actualizarKPIsHeader();
    _actualizarBadgeSidebar();
    _renderTablaOC();
    mostrarToast(`OC marcada como ${nuevoEstado}.`, 'success');
}

// ============================================================
// TAB 3 — CUENTAS POR PAGAR
// ============================================================

function _renderCuentasPagar() {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const ocsRecibidas = ordenesCompraData.filter(oc => oc.estado === 'recibida' && _saldoPendienteOC(oc) > 0);

    // KPIs
    const deudaTotal = ocsRecibidas.reduce((s, oc) => s + _saldoPendienteOC(oc), 0);
    const proximasVencer = ocsRecibidas.filter(oc => {
        if (!oc.fecha_vencimiento) return false;
        const d = new Date(oc.fecha_vencimiento);
        return d >= hoy && (d - hoy) / 86400000 <= 7;
    }).reduce((s, oc) => s + _saldoPendienteOC(oc), 0);
    const vencidas = ocsRecibidas.filter(oc => oc.fecha_vencimiento && new Date(oc.fecha_vencimiento) < hoy).length;

    document.getElementById('cxpDeudaTotal').textContent  = `Gs. ${_fmt(deudaTotal)}`;
    document.getElementById('cxpProxVencer').textContent  = `Gs. ${_fmt(proximasVencer)}`;
    document.getElementById('cxpVencidas').textContent    = vencidas;

    // Aging
    const aging = _calcularAgingCxP(ocsRecibidas, hoy);
    _renderAgingCxPChart(aging, deudaTotal);

    // Tabla
    _renderTablaCxP(ocsRecibidas, hoy);
}

function _calcularAgingCxP(ocsRecibidas, hoy) {
    let alDia = 0, proximo = 0, vencido = 0, critico = 0;
    ocsRecibidas.forEach(oc => {
        const saldo = _saldoPendienteOC(oc);
        if (!oc.fecha_vencimiento) { alDia += saldo; return; }
        const venc = new Date(oc.fecha_vencimiento);
        const diff = Math.round((hoy - venc) / 86400000); // días de atraso (negativo = aún no vence)
        if (diff < 0) {
            if ((venc - hoy) / 86400000 <= 7) proximo += saldo;
            else alDia += saldo;
        } else if (diff <= 30) {
            vencido += saldo;
        } else {
            critico += saldo;
        }
    });
    return { alDia, proximo, vencido, critico };
}

function _renderAgingCxPChart(aging, total) {
    const contenedor = document.getElementById('cxpAgingBars');
    if (!contenedor) return;
    if (total === 0) { contenedor.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Sin deuda pendiente.</p>'; return; }

    const bandas = [
        { label: 'Al día',   monto: aging.alDia,   color: 'bg-emerald-500' },
        { label: 'Próximo',  monto: aging.proximo,  color: 'bg-amber-400' },
        { label: 'Vencido',  monto: aging.vencido,  color: 'bg-orange-500' },
        { label: 'Crítico',  monto: aging.critico,  color: 'bg-red-600' },
    ].filter(b => b.monto > 0);

    contenedor.innerHTML = `
        <div class="flex rounded-full overflow-hidden h-4 w-full mb-3">
            ${bandas.map(b => `<div class="${b.color} transition-all" style="width:${(b.monto/total*100).toFixed(1)}%"></div>`).join('')}
        </div>
        <div class="flex gap-4 flex-wrap text-xs text-gray-600">
            ${bandas.map(b => `
                <div class="flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full ${b.color} inline-block"></span>
                    <span>${b.label}: <strong>Gs. ${_fmt(b.monto)}</strong></span>
                </div>
            `).join('')}
        </div>
    `;
}

function _renderTablaCxP(ocsRecibidas, hoy) {
    const tbody = document.getElementById('tablaCxPCuerpo');
    if (!tbody) return;

    if (ocsRecibidas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-gray-400 text-sm">Sin deudas pendientes.</td></tr>`;
        return;
    }

    const sorted = [...ocsRecibidas].sort((a, b) => {
        const da = a.fecha_vencimiento ? new Date(a.fecha_vencimiento) : new Date('9999');
        const db = b.fecha_vencimiento ? new Date(b.fecha_vencimiento) : new Date('9999');
        return da - db;
    });

    tbody.innerHTML = sorted.map(oc => {
        const prov = proveedoresData.find(p => p.id === oc.proveedor_id);
        const saldo = _saldoPendienteOC(oc);
        const venc = oc.fecha_vencimiento ? new Date(oc.fecha_vencimiento) : null;
        const diasAtraso = venc ? Math.round((hoy - venc) / 86400000) : null;
        let atrasoHtml = '—';
        if (diasAtraso !== null) {
            if (diasAtraso < 0) atrasoHtml = `<span class="text-emerald-600 text-xs">Vence en ${-diasAtraso}d</span>`;
            else if (diasAtraso === 0) atrasoHtml = `<span class="text-amber-600 text-xs font-semibold">Hoy</span>`;
            else atrasoHtml = `<span class="text-red-600 text-xs font-semibold">${diasAtraso}d atraso</span>`;
        }

        return `<tr class="hover:bg-gray-50 transition-colors">
            <td class="px-4 py-3 font-medium text-sm text-gray-800">${escapeHTML(prov?.nombre || '—')}</td>
            <td class="px-4 py-3 font-mono text-xs text-indigo-600">${escapeHTML(oc.id)}</td>
            <td class="px-4 py-3 text-xs text-gray-500">${_fmtFecha(oc.fecha_vencimiento)}</td>
            <td class="px-4 py-3">${atrasoHtml}</td>
            <td class="px-4 py-3 text-right text-sm text-gray-600">Gs. ${_fmt(oc.total)}</td>
            <td class="px-4 py-3 text-right text-sm text-emerald-600">Gs. ${_fmt(oc.pagado)}</td>
            <td class="px-4 py-3 text-right text-sm font-bold text-red-600">Gs. ${_fmt(saldo)}</td>
            <td class="px-4 py-3">
                <button class="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                    data-action="registrarPagoProveedor" data-arg="${escapeHTML(oc.id)}">
                    Pagar
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ============================================================
// MODAL REGISTRAR PAGO
// ============================================================

async function registrarPagoProveedor(ocId) {
    const oc = ordenesCompraData.find(o => o.id === ocId);
    if (!oc) return;
    const saldo = _saldoPendienteOC(oc);

    _pagoOCId = ocId;
    document.getElementById('pagoMonto').value      = saldo > 0 ? saldo : '';
    document.getElementById('pagoFecha').value      = _hoy();
    document.getElementById('pagoMetodo').value     = 'transferencia';
    document.getElementById('pagoReferencia').value = '';
    document.getElementById('pagoNotas').value      = '';
    document.getElementById('pagoOCLabel').textContent = `OC ${escapeHTML(oc.id)} — Saldo: Gs. ${_fmt(saldo)}`;

    cerrarDrawerOC();
    document.getElementById('modalRegistrarPago')?.show();
}

function cerrarModalPago() {
    document.getElementById('modalRegistrarPago')?.hide();
    _pagoOCId = null;
}

async function _guardarPago() {
    if (!_pagoOCId) return;
    const monto = parseFloat(document.getElementById('pagoMonto')?.value) || 0;
    if (monto <= 0) { mostrarToast('Ingresá un monto válido.', 'warning'); return; }

    const oc = ordenesCompraData.find(o => o.id === _pagoOCId);
    if (!oc) return;

    const pp = {
        id:             'PP-' + Date.now(),
        orden_compra_id: _pagoOCId,
        proveedor_id:   oc.proveedor_id,
        monto,
        fecha:          document.getElementById('pagoFecha')?.value || _hoy(),
        metodo_pago:    document.getElementById('pagoMetodo')?.value || 'transferencia',
        referencia:     document.getElementById('pagoReferencia')?.value?.trim() || null,
        notas:          document.getElementById('pagoNotas')?.value?.trim() || null,
        created_at:     new Date().toISOString(),
    };

    const nuevoPagado = Math.min((Number(oc.pagado) || 0) + monto, Number(oc.total) || 0);
    const nuevoEstado = nuevoPagado >= (Number(oc.total) || 0) ? 'pagada' : oc.estado;
    const ocUpdate = { ...oc, pagado: nuevoPagado, estado: nuevoEstado, actualizado_en: new Date().toISOString() };

    const btn = document.getElementById('btnGuardarPago');
    if (btn) { btn.loading = true; btn.disabled = true; }

    const [r1, r2] = await Promise.all([
        SupabaseService.upsertPagosProveedor([pp]),
        SupabaseService.upsertOrdenesCompra([ocUpdate]),
    ]);

    if (btn) { btn.loading = false; btn.disabled = false; }

    if (!r1.success || !r2.success) {
        mostrarToast('Error al registrar el pago.', 'danger');
        return;
    }

    pagosProveedorData.push(pp);
    const idx = ordenesCompraData.findIndex(o => o.id === _pagoOCId);
    if (idx >= 0) ordenesCompraData[idx] = ocUpdate;

    cerrarModalPago();
    _actualizarKPIsHeader();
    _actualizarBadgeSidebar();
    if (_tabProvActual === 'cxp') _renderCuentasPagar();
    if (_tabProvActual === 'oc') _renderTablaOC();
    mostrarToast(`Pago de Gs. ${_fmt(monto)} registrado.${nuevoEstado === 'pagada' ? ' OC completamente pagada.' : ''}`, 'success');
}

// ============================================================
// TAB 4 — ANÁLISIS
// ============================================================

function _calcularLeadTime(oc) {
    return _diasEntre(oc.fecha_emision, oc.fecha_recepcion);
}

function _calcularScorecardProveedor(prov, ocsDelProv, maxVolumen) {
    const ocRecibidas = ocsDelProv.filter(oc => oc.estado === 'recibida' || oc.estado === 'pagada');
    const total = ocRecibidas.length;

    // Cumplimiento (40 pts)
    const aTiempo = ocRecibidas.filter(oc =>
        oc.fecha_recepcion && oc.fecha_esperada && oc.fecha_recepcion <= oc.fecha_esperada
    ).length;
    const ptCumpl = total > 0 ? Math.round((aTiempo / total) * 40) : 0;

    // Lead time (30 pts)
    const leadTimes = ocRecibidas.map(_calcularLeadTime).filter(d => d !== null);
    const leadPromedio = leadTimes.length > 0 ? leadTimes.reduce((s, d) => s + d, 0) / leadTimes.length : null;
    let ptLead = 0;
    if (leadPromedio !== null) {
        if (leadPromedio <= 3) ptLead = 30;
        else if (leadPromedio <= 7) ptLead = 20;
        else if (leadPromedio <= 15) ptLead = 10;
    }

    // Volumen (20 pts)
    const volumen = ocsDelProv.reduce((s, oc) => s + (Number(oc.total) || 0), 0);
    const ptVol = maxVolumen > 0 ? Math.round((volumen / maxVolumen) * 20) : 0;

    // Antigüedad (10 pts)
    const fechaMas = ocsDelProv.length > 0
        ? Math.min(...ocsDelProv.map(oc => new Date(oc.fecha_emision || oc.created_at).getTime()))
        : Date.now();
    const meses = Math.min(12, Math.round((Date.now() - fechaMas) / (30 * 86400000)));
    const ptAntig = Math.round((meses / 12) * 10);

    const score = ptCumpl + ptLead + ptVol + ptAntig;
    return {
        score,
        volumen,
        total: ocsDelProv.length,
        leadPromedio,
        cumplimiento: total > 0 ? Math.round((aTiempo / total) * 100) : null,
        ultimaCompra: ocsDelProv.length > 0
            ? ocsDelProv.sort((a, b) => (b.fecha_emision || '').localeCompare(a.fecha_emision || ''))[0].fecha_emision
            : null,
    };
}

function _renderAnalisisProveedores() {
    const mesActual = new Date().toISOString().slice(0, 7);
    const ocsEsteMes = ordenesCompraData.filter(oc =>
        (oc.fecha_recepcion || '').startsWith(mesActual) && (oc.estado === 'recibida' || oc.estado === 'pagada')
    );

    const totalMes = ocsEsteMes.reduce((s, oc) => s + (Number(oc.total) || 0), 0);

    const leadTimes = ordenesCompraData
        .filter(oc => oc.fecha_recepcion && oc.fecha_emision)
        .map(_calcularLeadTime)
        .filter(d => d !== null);
    const leadPromedio = leadTimes.length > 0
        ? (leadTimes.reduce((s, d) => s + d, 0) / leadTimes.length).toFixed(1)
        : null;

    const ocConEsperada = ordenesCompraData.filter(oc => oc.fecha_recepcion && oc.fecha_esperada);
    const aTiempo = ocConEsperada.filter(oc => oc.fecha_recepcion <= oc.fecha_esperada).length;
    const cumplPct = ocConEsperada.length > 0
        ? Math.round((aTiempo / ocConEsperada.length) * 100)
        : null;

    // Scorecard por proveedor
    const stats = proveedoresData.map(prov => {
        const ocs = ordenesCompraData.filter(oc => oc.proveedor_id === prov.id);
        return { prov, ocs, ...{ volTmp: ocs.reduce((s, o) => s + (Number(o.total) || 0), 0) } };
    }).filter(x => x.ocs.length > 0);

    const maxVol = stats.length > 0 ? Math.max(...stats.map(x => x.volTmp)) : 1;
    const scoreStats = stats.map(x => ({
        prov: x.prov,
        ...  _calcularScorecardProveedor(x.prov, x.ocs, maxVol),
    })).sort((a, b) => b.volumen - a.volumen);

    // Top proveedor del mes
    const topMes = (() => {
        const volPorProv = {};
        ocsEsteMes.forEach(oc => {
            volPorProv[oc.proveedor_id] = (volPorProv[oc.proveedor_id] || 0) + (Number(oc.total) || 0);
        });
        const topId = Object.entries(volPorProv).sort((a, b) => b[1] - a[1])[0]?.[0];
        return proveedoresData.find(p => p.id === topId)?.nombre || '—';
    })();

    // Render KPIs
    document.getElementById('analisisTotalMes').textContent    = `Gs. ${_fmt(totalMes)}`;
    document.getElementById('analisisLeadTime').textContent    = leadPromedio !== null ? `${leadPromedio} días` : '—';
    document.getElementById('analisisCumplimiento').textContent = cumplPct !== null ? `${cumplPct}%` : '—';
    document.getElementById('analisisTopProv').textContent     = topMes;

    _renderChartVolumen(scoreStats, ocsEsteMes);
    _renderChartScatter(scoreStats);
    _renderTablaScorecardProveedores(scoreStats);
}

function _renderChartVolumen(scoreStats, ocsEsteMes) {
    const canvas = document.getElementById('chartProvVolumen');
    if (!canvas) return;

    const top5 = [...scoreStats].sort((a, b) => b.volumen - a.volumen).slice(0, 5);

    if (_chartProvVolumen) { _chartProvVolumen.destroy(); _chartProvVolumen = null; }

    _chartProvVolumen = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: top5.map(x => x.prov.nombre),
            datasets: [{
                label: 'Volumen comprado (Gs.)',
                data: top5.map(x => x.volumen),
                backgroundColor: ['#111827','#374151','#6b7280','#9ca3af','#d1d5db'],
                borderRadius: 6,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: ctx => `Gs. ${_fmt(ctx.raw)}` },
                },
            },
            scales: {
                x: {
                    grid: { color: '#f3f4f6' },
                    ticks: { callback: v => `Gs. ${_fmt(v)}`, font: { size: 10 } },
                },
                y: { ticks: { font: { size: 11 } } },
            },
        },
    });
}

function _renderChartScatter(scoreStats) {
    const canvas = document.getElementById('chartProvScatter');
    if (!canvas) return;

    const pts = scoreStats
        .filter(x => x.leadPromedio !== null && x.cumplimiento !== null)
        .map(x => ({
            x: x.leadPromedio,
            y: x.cumplimiento,
            r: Math.max(6, Math.min(20, Math.sqrt(x.volumen / 100000))),
            label: x.prov.nombre,
            score: x.score,
        }));

    if (_chartProvScatter) { _chartProvScatter.destroy(); _chartProvScatter = null; }

    if (pts.length === 0) {
        canvas.parentElement.innerHTML = `<p class="text-xs text-gray-400 text-center py-8">Sin datos suficientes para el gráfico.</p>`;
        return;
    }

    _chartProvScatter = new Chart(canvas, {
        type: 'bubble',
        data: {
            datasets: [{
                label: 'Proveedores',
                data: pts.map(p => ({ x: p.x, y: p.y, r: p.r })),
                backgroundColor: pts.map(p =>
                    p.score >= 70 ? 'rgba(16,185,129,0.7)' : p.score >= 40 ? 'rgba(245,158,11,0.7)' : 'rgba(239,68,68,0.7)'
                ),
            }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const p = pts[ctx.dataIndex];
                            return [`${p.label}`, `Lead time: ${p.x}d`, `Cumplimiento: ${p.y}%`];
                        },
                    },
                },
            },
            scales: {
                x: {
                    title: { display: true, text: 'Lead time promedio (días)', font: { size: 11 } },
                    grid: { color: '#f3f4f6' },
                },
                y: {
                    title: { display: true, text: '% Entregas a tiempo', font: { size: 11 } },
                    min: 0, max: 100,
                    grid: { color: '#f3f4f6' },
                },
            },
        },
    });
}

function _scoreLabel(score) {
    if (score >= 70) return `<span class="risk-verde">Score ${score}</span>`;
    if (score >= 40) return `<span class="risk-amarillo">Score ${score}</span>`;
    return `<span class="risk-rojo">Score ${score}</span>`;
}

function _renderTablaScorecardProveedores(scoreStats) {
    const tbody = document.getElementById('tablaScorecard');
    if (!tbody) return;

    if (scoreStats.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-gray-400 text-sm">Sin datos de proveedores con OC.</td></tr>`;
        return;
    }

    tbody.innerHTML = scoreStats.map(x => `<tr class="hover:bg-gray-50 transition-colors">
        <td class="px-4 py-3 font-medium text-sm text-gray-900">${escapeHTML(x.prov.nombre)}</td>
        <td class="px-4 py-3 text-right font-semibold text-sm text-gray-800">Gs. ${_fmt(x.volumen)}</td>
        <td class="px-4 py-3 text-center text-sm text-gray-600">${x.total}</td>
        <td class="px-4 py-3 text-center text-sm text-gray-600">${x.leadPromedio !== null ? `${Number(x.leadPromedio).toFixed(1)}d` : '—'}</td>
        <td class="px-4 py-3 text-center text-sm ${x.cumplimiento !== null ? (x.cumplimiento >= 80 ? 'text-emerald-600 font-semibold' : x.cumplimiento >= 60 ? 'text-amber-600' : 'text-red-500') : 'text-gray-400'}">${x.cumplimiento !== null ? `${x.cumplimiento}%` : '—'}</td>
        <td class="px-4 py-3 text-xs text-gray-500">${_fmtFecha(x.ultimaCompra)}</td>
        <td class="px-4 py-3">${_scoreLabel(x.score)}</td>
    </tr>`).join('');
}
