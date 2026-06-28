// ============================================
// HDV Admin - Modulo de Pedidos
// Carga, filtros, edicion, reportes, PDF/ticket
// Depende de globals: todosLosPedidos, productosData, unsubscribePedidos
// ============================================

let pedidoEditandoId = null;
let paginaPedidos = 1;
const PEDIDOS_POR_PAGINA = 20;
let _pedidosFiltradosActuales = [];
let _pedidoExpandidoId = null;

// ============================================
// EVENT DELEGATION — despacho de acciones de pedidos
// ============================================
const _pedidosActionMap = {
    'toggle-pedido-accordion': (id) => _togglePedidoAccordion(id),
    'ver-pedido-completo':     (id) => _abrirModalPedidoCompleto(id),
    'wa-pedido':               (id) => _enviarWhatsAppPedidoAdmin(id),
    'marcar-entregado':        (id) => marcarEntregado(id),
    'marcar-pendiente':        (id) => marcarPendiente(id),
    'marcar-cobrado':          (id) => marcarCobrado(id),
    'editar':                  (id) => abrirModalEditarPedido(id),
    'pdf':                     (id) => generarPDFRemision(id),
    'eliminar':                (id) => eliminarPedidoAdmin(id),
};

function _handlePedidoAction(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    if (target.disabled) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    const handler = _pedidosActionMap[action];
    if (handler) handler(id);
}

function _initPedidosDelegation(container) {
    if (container && !container._delegated) {
        container.addEventListener('click', _handlePedidoAction);
        container._delegated = true;
    }
}

// Cache de perfiles para mostrar nombres de vendedores en tarjetas
let _pedidosPerfilesCache = null;
async function obtenerPerfilesPedidosMap() {
    if (_pedidosPerfilesCache) return _pedidosPerfilesCache;
    try {
        const { data } = await supabaseClient.from('perfiles').select('id, nombre_completo');
        _pedidosPerfilesCache = {};
        (data || []).forEach(p => { _pedidosPerfilesCache[p.id] = p.nombre_completo || 'Sin nombre'; });
    } catch (e) { _pedidosPerfilesCache = {}; }
    return _pedidosPerfilesCache;
}

// Poblar el select de vendedores con los perfiles
async function poblarFiltroVendedor() {
    const select = document.getElementById('filtroVendedor');
    if (!select) return;
    // Limpiar opciones previas (preservar la primera: "Todos")
    const existentes = select.querySelectorAll('sl-option[data-vendedor]');
    existentes.forEach(el => el.remove());
    const perfiles = await obtenerPerfilesPedidosMap();
    Object.entries(perfiles).forEach(([id, nombre]) => {
        const opt = document.createElement('sl-option');
        opt.value = id;
        opt.textContent = nombre;
        opt.setAttribute('data-vendedor', '');
        select.appendChild(opt);
    });
}

// Preservar referencia a eliminarPedido de supabase-config.js antes de que sea sobreescrita
const _eliminarPedidoSupabase = typeof eliminarPedido === 'function' ? eliminarPedido : null;

// ============================================
// CARGA Y FILTROS
// ============================================
// Online-first: Supabase como fuente primaria, IndexedDB solo como emergencia
async function cargarPedidos() {
    await poblarFiltroVendedor();
    try {
        const { data, error } = await SupabaseService.fetchPedidos();
        if (error) throw error;
        const pedidosRemoto = data.map(r => {
            const p = r.datos || {};
            if (r.numero_pedido != null) p.numero_pedido = r.numero_pedido;
            return p;
        });
        await HDVStorage.atomicUpdate('hdv_pedidos', (local) => {
            const list = local || [];
            const sinSync = list.filter(p => p.sincronizado === false);
            const remIds = new Set(pedidosRemoto.map(p => p.id));
            const extras = sinSync.filter(p => !remIds.has(p.id));
            return [...pedidosRemoto, ...extras];
        });
        todosLosPedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
        _pedidosBannerOcultar();
    } catch (e) {
        console.warn('[Pedidos] Sin conexión, usando caché local:', e?.message);
        todosLosPedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
        _pedidosBannerMostrar(todosLosPedidos.length > 0 ? 'stale' : 'error');
    }
    aplicarFiltrosPedidos();
}

function _pedidosBannerMostrar(tipo) {
    const lista = document.getElementById('listaPedidos');
    if (!lista) return;
    let banner = document.getElementById('pedidosBannerConexion');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'pedidosBannerConexion';
        lista.parentElement?.insertBefore(banner, lista);
    }
    if (tipo === 'stale') {
        banner.className = 'flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg mb-3 text-amber-700 text-xs font-medium';
        banner.innerHTML = `<i data-lucide="wifi-off" class="w-3.5 h-3.5 shrink-0 pointer-events-none"></i> Mostrando datos locales — sin conexión al servidor. <button data-action="recargarPedidos" class="ml-auto underline font-semibold hover:text-amber-900">Reintentar</button>`;
    } else {
        banner.className = 'flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg mb-3 text-red-700 text-xs font-medium';
        banner.innerHTML = `<i data-lucide="alert-circle" class="w-3.5 h-3.5 shrink-0 pointer-events-none"></i> No se pudo cargar pedidos desde el servidor. <button data-action="recargarPedidos" class="ml-auto underline font-semibold hover:text-red-900">Reintentar</button>`;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [banner] });
}

function _pedidosBannerOcultar() {
    document.getElementById('pedidosBannerConexion')?.remove();
}

function filtrarPedidos() { aplicarFiltrosPedidos(); }

function aplicarFiltrosPedidos(resetPagina = true) {
    const desde = document.getElementById('filtroFechaDesde')?.value;
    const hasta = document.getElementById('filtroFechaHasta')?.value;
    const cliente = document.getElementById('filtroCliente')?.value;
    const vendedor = document.getElementById('filtroVendedor')?.value;
    const estado = document.getElementById('filtroEstado')?.value;

    let filtrados = todosLosPedidos;
    // Filtrar por estado
    if (estado === 'activos') {
        // Invariante: los entregados (créditos) viven en la sección Créditos, no acá.
        filtrados = filtrados.filter(p => {
            const e = p.estado || PEDIDO_ESTADOS.PENDIENTE;
            return e === PEDIDO_ESTADOS.PENDIENTE || e === 'pendiente';
        });
    } else if (estado) {
        filtrados = filtrados.filter(p => p.estado === estado || (estado === PEDIDO_ESTADOS.PENDIENTE && p.estado === 'pendiente'));
    }
    if (desde || hasta) {
        filtrados = filtrados.filter(p => {
            const fechaPedido = new Date(p.fecha).toISOString().split('T')[0];
            if (desde && fechaPedido < desde) return false;
            if (hasta && fechaPedido > hasta) return false;
            return true;
        });
    }
    if (cliente) filtrados = filtrados.filter(p => p.cliente?.id === cliente);
    if (vendedor) filtrados = filtrados.filter(p => p.vendedor_id === vendedor);

    filtrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    _pedidosFiltradosActuales = filtrados;
    if (resetPagina) paginaPedidos = 1;
    mostrarPedidos(filtrados);
    actualizarEstadisticasPedidos(filtrados);
}

function mostrarPedidos(pedidos) {
    const container = document.getElementById('listaPedidos');
    if (!container) return;
    _initPedidosDelegation(container);

    const total = pedidos.length;
    const totalPaginas = Math.max(1, Math.ceil(total / PEDIDOS_POR_PAGINA));
    if (paginaPedidos > totalPaginas) paginaPedidos = totalPaginas;

    if (total === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_ORDERS, 'No hay pedidos para mostrar', 'Los pedidos nuevos apareceran aqui automaticamente');
        _renderPaginacionPedidos(0, 1);
        return;
    }

    const inicio = (paginaPedidos - 1) * PEDIDOS_POR_PAGINA;
    const paginados = pedidos.slice(inicio, inicio + PEDIDOS_POR_PAGINA);

    container.innerHTML = '';
    paginados.forEach(p => {
        const div = crearTarjetaPedidoAdmin(p);
        container.appendChild(div);
    });
    lucide.createIcons();
    _renderPaginacionPedidos(total, totalPaginas);
}

function _renderPaginacionPedidos(total, totalPaginas) {
    const pagEl = document.getElementById('paginacionPedidos');
    if (!pagEl) return;
    if (total === 0) { pagEl.innerHTML = ''; return; }
    pagEl.innerHTML = `<span>${total} pedidos | Pagina ${paginaPedidos} de ${totalPaginas}</span>
    <div class="flex gap-2">
        <sl-button variant="default" size="small" data-action="pedPagPrimera" ${paginaPedidos <= 1 ? 'disabled' : ''}>&lt;&lt;</sl-button>
        <sl-button variant="default" size="small" data-action="pedPagAnterior" ${paginaPedidos <= 1 ? 'disabled' : ''}>&lt;</sl-button>
        <sl-button variant="default" size="small" data-action="pedPagSiguiente" data-arg="${totalPaginas}" ${paginaPedidos >= totalPaginas ? 'disabled' : ''}>&gt;</sl-button>
        <sl-button variant="default" size="small" data-action="pedPagUltima" data-arg="${totalPaginas}" ${paginaPedidos >= totalPaginas ? 'disabled' : ''}>&gt;&gt;</sl-button>
    </div>`;
}

// ============================================
// TARJETA DE PEDIDO — accordion compacto con dropdown inteligente
// ============================================
const _WA_SVG_ADMIN = `<svg viewBox="0 0 24 24" fill="white" class="w-3.5 h-3.5 pointer-events-none" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`;

function crearTarjetaPedidoAdmin(p) {
    const estado = p.estado || PEDIDO_ESTADOS.PENDIENTE;
    const { clases: colorEstado, label: labelEstado } = obtenerEstadoUI(estado);
    const clienteInfo = productosData.clientes.find(c => c.id === p.cliente?.id);
    const zona = clienteInfo?.zona || clienteInfo?.direccion || '';
    const telefono = clienteInfo?.telefono || '';
    const vendedorNombre = p.vendedor_id && _pedidosPerfilesCache ? (_pedidosPerfilesCache[p.vendedor_id] || '') : '';

    const alertaFraude = p.alerta_fraude
        ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700" title="${escapeHTML(p.fraude_detalle || 'Alerta de fraude')}"><i data-lucide="alert-triangle" class="w-2.5 h-2.5"></i> FRAUDE</span>` : '';
    const editadoBadge = p.editado
        ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700" title="Editado"><i data-lucide="pencil" class="w-2.5 h-2.5"></i></span>` : '';

    const borderColor = (estado === PEDIDO_ESTADOS.PENDIENTE || estado === 'pendiente')
        ? 'border-l-amber-400'
        : estado === PEDIDO_ESTADOS.ENTREGADO ? 'border-l-emerald-400' : 'border-l-blue-400';

    const numPed = formatNumPedido(p);
    const items = p.items || [];
    const nArts = items.length;

    const diff = Date.now() - new Date(p.fecha).getTime();
    const mins = Math.floor(diff / 60000);
    const fechaRel = mins < 1 ? 'ahora'
        : mins < 60 ? `hace ${mins}m`
        : mins < 1440 ? `hace ${Math.floor(mins / 60)}h`
        : new Date(p.fecha).toLocaleDateString('es-PY');

    const MAX_PREVIEW = 3;
    const itemsPreview = items.slice(0, MAX_PREVIEW);
    const itemsRestantes = items.length - MAX_PREVIEW;

    const itemsPreviewHTML = itemsPreview.map(i => `
        <div class="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
            <span class="text-xs text-gray-700 truncate mr-2">${escapeHTML(i.nombre)} <span class="text-gray-400">(${escapeHTML(i.presentacion)}) ×${i.cantidad}</span></span>
            <span class="text-xs font-medium text-gray-700 shrink-0">${formatearGuaranies(i.subtotal)}</span>
        </div>`).join('');

    let botonesEstado = '';
    if (estado === PEDIDO_ESTADOS.PENDIENTE || estado === 'pendiente') {
        botonesEstado = `<sl-button class="btn-estado" variant="success" size="small" data-action="marcar-entregado" data-id="${p.id}"><i data-lucide="truck" class="w-3.5 h-3.5"></i> Entregado</sl-button>`;
    } else if (estado === PEDIDO_ESTADOS.ENTREGADO) {
        // Entregado = crédito (vive en Créditos). El cobro va por el flujo único de créditos.
        botonesEstado = `
            <sl-button class="btn-cobrar" variant="primary" size="small" data-action="marcar-cobrado" data-id="${p.id}"><i data-lucide="circle-check" class="w-3.5 h-3.5"></i> Cobrar crédito</sl-button>`;
    }

    const div = document.createElement('div');
    div.className = `border-b border-gray-100 hover:bg-slate-50/50 transition-colors border-l-4 ${borderColor}`;
    div.setAttribute('data-pedido-id', p.id);
    div.innerHTML = `
        <div class="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none"
             data-action="toggle-pedido-accordion" data-id="${p.id}">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="pedido-estado-badge px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${colorEstado}">${labelEstado}</span>
                    <span class="text-sm font-semibold text-gray-800 truncate">${escapeHTML(p.cliente?.nombre || 'Sin cliente')}</span>
                    ${numPed ? `<span class="text-[10px] font-mono text-gray-400 shrink-0">#${numPed}</span>` : ''}
                    ${alertaFraude}${editadoBadge}
                </div>
                <div class="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    ${zona ? `<span>${escapeHTML(zona)}</span><span>·</span>` : ''}
                    ${vendedorNombre ? `<span>${escapeHTML(vendedorNombre)}</span><span>·</span>` : ''}
                    <span>${fechaRel}</span><span>·</span><span>${nArts} art.</span>
                </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-sm font-bold text-gray-800 whitespace-nowrap">${formatearGuaranies(p.total)}</span>
                <button data-action="pdf" data-id="${p.id}"
                    class="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="PDF">
                    <i data-lucide="file-text" class="w-3.5 h-3.5 pointer-events-none"></i>
                </button>
                <button data-action="wa-pedido" data-id="${p.id}"
                    class="w-7 h-7 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors" title="WhatsApp">
                    ${_WA_SVG_ADMIN}
                </button>
                <span class="w-5 h-5 flex items-center justify-center text-gray-400">
                    <i data-lucide="chevron-down" class="w-3.5 h-3.5 pedido-chevron-icon pointer-events-none" style="transition:transform 0.22s ease;"></i>
                </span>
            </div>
        </div>
        <div class="pedido-accordion-body">
            <div class="px-5 pb-4">
                <div class="bg-gray-50 rounded-lg overflow-hidden mb-3">
                    <div class="px-3 pt-2 pb-1">${itemsPreviewHTML}</div>
                    <div class="px-3 py-2 flex items-center justify-between border-t border-gray-100">
                        ${itemsRestantes > 0
                            ? `<span class="text-[11px] text-gray-400">+${itemsRestantes} artículo${itemsRestantes > 1 ? 's' : ''} más</span>`
                            : '<span></span>'}
                        <button data-action="ver-pedido-completo" data-id="${p.id}"
                            class="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 transition-colors">
                            Ver pedido completo <i data-lucide="external-link" class="w-3 h-3 pointer-events-none"></i>
                        </button>
                    </div>
                    <div class="px-3 py-2 bg-white border-t border-gray-200 flex items-center justify-between">
                        <div class="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
                            <span class="flex items-center gap-1"><i data-lucide="credit-card" class="w-3 h-3"></i> ${escapeHTML(p.tipoPago || 'contado')}</span>
                            ${p.notas ? `<span class="flex items-center gap-1"><i data-lucide="message-square" class="w-3 h-3"></i> ${escapeHTML(p.notas)}</span>` : ''}
                            ${telefono ? `<span class="flex items-center gap-1"><i data-lucide="phone" class="w-3 h-3"></i> ${escapeHTML(telefono)}</span>` : ''}
                        </div>
                        <span class="text-sm font-bold text-gray-800 whitespace-nowrap">${formatearGuaranies(p.total)}</span>
                    </div>
                </div>
                <div class="pedido-acciones flex items-center gap-2 flex-wrap">
                    ${botonesEstado}
                    <div class="flex-1"></div>
                    <sl-button variant="default" size="small" data-action="editar" data-id="${p.id}"><i data-lucide="pencil" class="w-3.5 h-3.5"></i> Editar</sl-button>
                    <button data-action="eliminar" data-id="${p.id}"
                        class="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i>
                    </button>
                </div>
            </div>
        </div>`;
    return div;
}

function actualizarTarjetaPedidoAdminDOM(pedidoId, nuevoEstado) {
    const card = document.querySelector(`[data-pedido-id="${pedidoId}"]`);
    if (!card) return false;

    if (nuevoEstado === PEDIDO_ESTADOS.COBRADO) {
        eliminarTarjetaPedidoAdminDOM(pedidoId);
        return true;
    }

    // Actualizar borde izquierdo de color
    card.classList.remove('border-l-amber-400', 'border-l-emerald-400', 'border-l-blue-400');
    card.classList.add(
        nuevoEstado === PEDIDO_ESTADOS.PENDIENTE ? 'border-l-amber-400'
        : nuevoEstado === PEDIDO_ESTADOS.ENTREGADO ? 'border-l-emerald-400'
        : 'border-l-blue-400'
    );

    // Actualizar badge de estado
    const badge = card.querySelector('.pedido-estado-badge');
    if (badge) {
        const { clases, label } = obtenerEstadoUI(nuevoEstado);
        badge.className = 'pedido-estado-badge px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ' + clases;
        badge.textContent = label;
    }

    // Reemplazar botones de accion segun nuevo estado
    const accionesDiv = card.querySelector('.pedido-acciones');
    if (accionesDiv) {
        let botonesEstado = '';
        if (nuevoEstado === PEDIDO_ESTADOS.ENTREGADO) {
            botonesEstado = `
                <sl-button class="btn-cobrar" variant="primary" size="small" data-action="marcar-cobrado" data-id="${pedidoId}"><i data-lucide="circle-check" class="w-3.5 h-3.5"></i> Cobrar</sl-button>
                <sl-button class="btn-estado" variant="default" size="small" data-action="marcar-pendiente" data-id="${pedidoId}"><i data-lucide="undo-2" class="w-3.5 h-3.5"></i> Pendiente</sl-button>`;
        } else {
            botonesEstado = `<sl-button class="btn-estado" variant="success" size="small" data-action="marcar-entregado" data-id="${pedidoId}"><i data-lucide="truck" class="w-3.5 h-3.5"></i> Entregado</sl-button>`;
        }
        accionesDiv.innerHTML = `
            ${botonesEstado}
            <div class="flex-1"></div>
            <sl-button variant="default" size="small" data-action="editar" data-id="${pedidoId}"><i data-lucide="pencil" class="w-3.5 h-3.5"></i> Editar</sl-button>
            <button data-action="eliminar" data-id="${pedidoId}"
                class="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                <i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i>
            </button>`;
        lucide.createIcons({ nodes: [accionesDiv] });
    }

    card.classList.add('ring-1', 'ring-blue-300');
    setTimeout(() => card.classList.remove('ring-1', 'ring-blue-300'), TIEMPOS.SYNC_DELAY_ONLINE_MS);
    return true;
}

function eliminarTarjetaPedidoAdminDOM(pedidoId) {
    const card = document.querySelector(`[data-pedido-id="${pedidoId}"]`);
    if (!card) return;
    if (_pedidoExpandidoId === pedidoId) _pedidoExpandidoId = null;
    card.style.opacity = '0';
    card.style.transform = 'translateX(-100%)';
    setTimeout(() => card.remove(), TIEMPOS.DEBOUNCE_BUSQUEDA_MS);
}

// ============================================
// ACCORDION — toggle / estado visual
// ============================================
function _togglePedidoAccordion(id) {
    if (_pedidoExpandidoId === id) {
        _setPedidoAccordionState(id, false);
        _pedidoExpandidoId = null;
        return;
    }
    if (_pedidoExpandidoId) _setPedidoAccordionState(_pedidoExpandidoId, false);
    _setPedidoAccordionState(id, true);
    _pedidoExpandidoId = id;
}

function _setPedidoAccordionState(id, open) {
    const card = document.querySelector(`[data-pedido-id="${id}"]`);
    if (!card) return;
    card.querySelector('.pedido-accordion-body')?.classList.toggle('open', open);
    const chevron = card.querySelector('.pedido-chevron-icon');
    if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}

// ============================================
// MODAL — pedido completo (todos los items)
// ============================================
function _abrirModalPedidoCompleto(id) {
    const pedido = (todosLosPedidos || []).find(p => p.id === id);
    if (!pedido) return;
    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    const telefono = clienteInfo?.telefono || '';
    const numPed = formatNumPedido(pedido);
    const { label: labelEstado, clases: colorEstado } = obtenerEstadoUI(pedido.estado);
    const vendedorNombre = pedido.vendedor_id && _pedidosPerfilesCache ? (_pedidosPerfilesCache[pedido.vendedor_id] || '') : '';

    const itemsHTML = (pedido.items || []).map(i => `
        <tr class="border-b border-gray-100 last:border-0">
            <td class="py-2 px-3 text-sm text-gray-800">${escapeHTML(i.nombre)} <span class="text-xs text-gray-400">(${escapeHTML(i.presentacion)})</span></td>
            <td class="py-2 px-3 text-sm text-center text-gray-600 w-12">×${i.cantidad}</td>
            <td class="py-2 px-3 text-xs text-right text-gray-500 whitespace-nowrap">${formatearGuaranies(i.precio)}</td>
            <td class="py-2 px-3 text-sm font-medium text-right text-gray-800 whitespace-nowrap">${formatearGuaranies(i.subtotal)}</td>
        </tr>`).join('');

    let dialog = document.getElementById('dialogPedidoCompleto');
    if (!dialog) {
        dialog = document.createElement('sl-dialog');
        dialog.id = 'dialogPedidoCompleto';
        dialog.setAttribute('label', 'Detalle del Pedido');
        dialog.style.setProperty('--width', '600px');
        document.body.appendChild(dialog);
    }

    dialog.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-start justify-between">
                <div>
                    <h4 class="text-base font-bold text-gray-900">${escapeHTML(pedido.cliente?.nombre || 'Sin cliente')}</h4>
                    <div class="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                        ${numPed ? `<span class="font-mono">#${numPed}</span>` : ''}
                        <span>${new Date(pedido.fecha).toLocaleString('es-PY')}</span>
                        ${vendedorNombre ? `<span>· ${escapeHTML(vendedorNombre)}</span>` : ''}
                    </div>
                </div>
                <span class="px-2.5 py-1 rounded-full text-xs font-bold ${colorEstado}">${labelEstado}</span>
            </div>
            ${(telefono || clienteInfo?.zona) ? `
            <div class="flex items-center gap-3 text-xs text-gray-500">
                ${telefono ? `<span class="flex items-center gap-1.5"><i data-lucide="phone" class="w-3 h-3"></i>${escapeHTML(telefono)}</span>` : ''}
                ${clienteInfo?.zona ? `<span class="flex items-center gap-1.5"><i data-lucide="map-pin" class="w-3 h-3"></i>${escapeHTML(clienteInfo.zona)}</span>` : ''}
            </div>` : ''}
            <div class="border border-gray-200 rounded-lg overflow-hidden">
                <table class="w-full">
                    <thead class="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500">Producto</th>
                            <th class="px-3 py-2 text-center text-xs font-semibold text-gray-500 w-12">Cant.</th>
                            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">P. Unit.</th>
                            <th class="px-3 py-2 text-right text-xs font-semibold text-gray-500">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHTML}</tbody>
                    <tfoot>
                        <tr class="bg-gray-50 border-t border-gray-200">
                            <td colspan="3" class="px-3 py-2.5 text-sm font-semibold text-gray-700 text-right">Total</td>
                            <td class="px-3 py-2.5 text-base font-bold text-gray-900 text-right whitespace-nowrap">${formatearGuaranies(pedido.total)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div class="flex flex-wrap gap-3 text-xs text-gray-500">
                <span class="flex items-center gap-1.5"><i data-lucide="credit-card" class="w-3.5 h-3.5"></i>${escapeHTML(pedido.tipoPago || 'contado')}</span>
                ${pedido.notas ? `<span class="flex items-center gap-1.5"><i data-lucide="message-square" class="w-3.5 h-3.5"></i>${escapeHTML(pedido.notas)}</span>` : ''}
                ${pedido.cobro_parcial ? `<span class="flex items-center gap-1.5 text-amber-600 font-medium"><i data-lucide="alert-circle" class="w-3.5 h-3.5"></i>Cobro parcial: ${formatearGuaranies(pedido.monto_cobrado)} cobrado</span>` : ''}
            </div>
        </div>
        <div slot="footer" class="flex justify-between items-center w-full">
            <div class="flex gap-2">
                <button data-action="modal-pedido-pdf" data-arg="${pedido.id}"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <i data-lucide="file-text" class="w-3.5 h-3.5"></i> PDF
                </button>
                <button data-action="modal-pedido-wa" data-arg="${pedido.id}"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors">
                    WhatsApp
                </button>
            </div>
            <button data-action="modal-pedido-cerrar"
                class="inline-flex items-center px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cerrar
            </button>
        </div>`;
    dialog.show();
    setTimeout(() => lucide.createIcons({ nodes: [dialog] }), 50);
}

// ============================================
// WHATSAPP — mensaje institucional
// ============================================
function _enviarWhatsAppPedidoAdmin(id) {
    const pedido = (todosLosPedidos || []).find(p => p.id === id);
    if (!pedido) return;
    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    const telefono = (clienteInfo?.telefono || '').replace(/\D/g, '');
    const numPed = formatNumPedido(pedido) || pedido.id.slice(-8).toUpperCase();
    const itemLines = (pedido.items || []).map(i =>
        `• ${i.nombre} (${i.presentacion}) × ${i.cantidad} — ${formatearGuaranies(i.subtotal)}`
    ).join('\n');
    const msg = [
        '🏢 *HDV Distribuciones*',
        '──────────────────────',
        `📋 Pedido N° *${numPed}*`,
        `📅 ${new Date(pedido.fecha).toLocaleString('es-PY')}`,
        '',
        `👤 *Cliente:* ${pedido.cliente?.nombre || 'Sin cliente'}`,
        clienteInfo?.zona ? `📍 ${clienteInfo.zona}` : '',
        '',
        '📦 *Detalle:*',
        itemLines,
        '',
        `💰 *Total: ${formatearGuaranies(pedido.total)}*`,
        `💳 ${pedido.tipoPago || 'Contado'}`,
        `📊 Estado: ${(pedido.estado || PEDIDO_ESTADOS.PENDIENTE).toUpperCase().replace(/_/g, ' ')}`,
        pedido.notas ? `📝 Nota: ${pedido.notas}` : '',
    ].filter(Boolean).join('\n');
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Extender ACTION_DISPATCH del admin para botones del modal y paginacion (fuera de #listaPedidos)
if (typeof ACTION_DISPATCH !== 'undefined') {
    Object.assign(ACTION_DISPATCH, {
        'modal-pedido-pdf':    (btn, arg) => generarPDFRemision(arg),
        'modal-pedido-wa':     (btn, arg) => _enviarWhatsAppPedidoAdmin(arg),
        'modal-pedido-cerrar': () => document.getElementById('dialogPedidoCompleto')?.hide(),
        'recargarPedidos':  () => cargarPedidos(),
        'pedPagPrimera':    () => { paginaPedidos = 1; aplicarFiltrosPedidos(false); },
        'pedPagAnterior':   () => { if (paginaPedidos > 1) { paginaPedidos--; aplicarFiltrosPedidos(false); } },
        'pedPagSiguiente':  (btn) => { const t = parseInt(btn.dataset.arg || 1); if (paginaPedidos < t) { paginaPedidos++; aplicarFiltrosPedidos(false); } },
        'pedPagUltima':     (btn) => { paginaPedidos = parseInt(btn.dataset.arg || 1); aplicarFiltrosPedidos(false); },
    });
}

function actualizarEstadisticasPedidos(pedidos) {
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('statTotalPedidos', pedidos.length);
    el('statPendientes', pedidos.filter(p => (p.estado || PEDIDO_ESTADOS.PENDIENTE) === PEDIDO_ESTADOS.PENDIENTE || p.estado === 'pendiente').length);
    el('statEntregados', pedidos.filter(p => p.estado === PEDIDO_ESTADOS.ENTREGADO).length);
    el('statRecaudacion', formatearGuaranies(pedidos.reduce((s, p) => s + (p.total || 0), 0)));
}

// Lifecycle v2: al entregar se abre el modal compartido (Cobro total / parcial /
// Ingresar a créditos). El modal aplica el estado y registra el cobro en el libro.
async function marcarEntregado(id) {
    return window.abrirModalEntrega(id);
}

async function marcarPendiente(id) {
    // RPC primero: si falla, no mutar estado local
    if (typeof actualizarEstadoPedido === 'function') {
        try {
            await actualizarEstadoPedido(id, PEDIDO_ESTADOS.PENDIENTE);
        } catch(e) {
            console.error('[Pedidos] Error actualizando estado en Supabase:', e);
            mostrarToast('Error al actualizar estado en servidor', 'error');
            return;
        }
    }
    await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
        const list = pedidos || [];
        const p = list.find(x => x.id === id);
        if (p) p.estado = PEDIDO_ESTADOS.PENDIENTE;
        return list;
    });
    // Actualizar DOM inmediatamente sin re-renderizar toda la lista
    if (!actualizarTarjetaPedidoAdminDOM(id, PEDIDO_ESTADOS.PENDIENTE)) {
        cargarPedidos();
    }
    mostrarToast('Pedido marcado como pendiente', 'success');
}

// Lifecycle v2: cobrar un crédito (pedido entregado) usa el flujo ÚNICO de Créditos
// (registrarPagoCredito escribe el libro con numero_pedido y cierra a saldo 0).
async function marcarCobrado(id) {
    if (typeof registrarPagoCredito === 'function') return registrarPagoCredito(id);
    mostrarToast('Módulo de créditos no disponible', 'error');
}

async function eliminarPedidoAdmin(id) {
    if (!await mostrarConfirmModal('¿Eliminar este pedido?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    // Supabase primero: si falla, no borrar local
    if (_eliminarPedidoSupabase) {
        try {
            const ok = await _eliminarPedidoSupabase(id);
            if (!ok) {
                mostrarToast('Error al eliminar pedido en servidor', 'error');
                return;
            }
        } catch(e) {
            console.error('[Pedidos] Error eliminando pedido en Supabase:', e);
            mostrarToast('Error al eliminar pedido en servidor', 'error');
            return;
        }
    }
    await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
        return (pedidos || []).filter(p => p.id !== id);
    });
    // Animacion de eliminacion en DOM
    eliminarTarjetaPedidoAdminDOM(id);
    mostrarToast('Pedido eliminado', 'success');
}
// Mantener nombre original para onclick handlers
var eliminarPedido = eliminarPedidoAdmin;

function exportarExcelPedidos() {
    const pedidos = _pedidosFiltradosActuales || todosLosPedidos;
    if (pedidos.length === 0) { mostrarToast('No hay pedidos para exportar', 'error'); return; }
    let csv = 'Fecha,Cliente,Vendedor,Producto,Presentacion,Cantidad,Precio,Subtotal,Total Pedido,Estado,Pago,Tipo,Notas,Alerta Fraude\n';
    pedidos.forEach(p => {
        const vendedor = p.vendedor_id && _pedidosPerfilesCache ? (_pedidosPerfilesCache[p.vendedor_id] || '') : '';
        const tipo = p.tipo_comprobante || 'pedido';
        const notas = p.notas || '';
        const alerta = p.alerta_fraude ? 'SI' : '';
        (p.items || []).forEach(i => {
            csv += [
                escaparCSV(new Date(p.fecha).toLocaleDateString('es-PY')),
                escaparCSV(p.cliente?.nombre),
                escaparCSV(vendedor),
                escaparCSV(i.nombre),
                escaparCSV(i.presentacion),
                i.cantidad, i.precio, i.subtotal, p.total,
                escaparCSV(p.estado || PEDIDO_ESTADOS.PENDIENTE),
                escaparCSV(p.tipoPago || 'contado'),
                escaparCSV(tipo),
                escaparCSV(notas),
                escaparCSV(alerta)
            ].join(',') + '\n';
        });
    });
    const desde = document.getElementById('filtroFechaDesde')?.value;
    const hasta = document.getElementById('filtroFechaHasta')?.value;
    const sufijo = (desde && hasta) ? `_${desde}_${hasta}` : (desde ? `_desde_${desde}` : '');
    descargarCSV(csv, `pedidos_hdv${sufijo}.csv`);
}

// ============================================
// REPORTES
// ============================================
async function generarReporte(tipo) {
    const desde = document.getElementById('reporteFechaDesde')?.value;
    const hasta = document.getElementById('reporteFechaHasta')?.value;
    if (!desde || !hasta) { mostrarToast('Selecciona rango de fechas', 'error'); return; }

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const filtrados = pedidos.filter(p => {
        const fecha = new Date(p.fecha).toISOString().split('T')[0];
        return fecha >= desde && fecha <= hasta;
    });

    const container = document.getElementById('contenidoReporte');
    if (!container) return;

    if (filtrados.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8 font-medium">No hay datos para el rango seleccionado</p>';
        return;
    }

    if (tipo === 'vendedor') {
        if (typeof generarReporteVendedor === 'function') {
            generarReporteVendedor(filtrados, desde, hasta);
        } else {
            container.innerHTML = '<p class="text-center text-gray-500 py-8">Modulo de reportes por vendedor no disponible</p>';
        }
        return;
    }

    if (tipo === 'cliente') {
        const porCliente = {};
        filtrados.forEach(p => {
            const nombre = p.cliente?.nombre || 'Sin cliente';
            if (!porCliente[nombre]) porCliente[nombre] = { total: 0, pedidos: 0 };
            porCliente[nombre].total += p.total || 0;
            porCliente[nombre].pedidos++;
        });

        let html = '<table class="w-full text-sm"><thead class="bg-gray-50"><tr><th class="px-4 py-2 text-left">Cliente</th><th class="px-4 py-2 text-right">Pedidos</th><th class="px-4 py-2 text-right">Total</th></tr></thead><tbody>';
        Object.entries(porCliente).sort((a, b) => b[1].total - a[1].total).forEach(([nombre, data]) => {
            html += `<tr class="border-b"><td class="px-4 py-3 font-medium">${escapeHTML(nombre)}</td><td class="px-4 py-3 text-right">${data.pedidos}</td><td class="px-4 py-3 text-right font-bold">${formatearGuaranies(data.total)}</td></tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } else {
        const porProducto = {};
        filtrados.forEach(p => {
            (p.items || []).forEach(i => {
                const key = `${i.nombre} (${i.presentacion})`;
                if (!porProducto[key]) porProducto[key] = { cantidad: 0, total: 0 };
                porProducto[key].cantidad += i.cantidad;
                porProducto[key].total += i.subtotal || 0;
            });
        });

        let html = '<table class="w-full text-sm"><thead class="bg-gray-50"><tr><th class="px-4 py-2 text-left">Producto</th><th class="px-4 py-2 text-right">Cantidad</th><th class="px-4 py-2 text-right">Total</th></tr></thead><tbody>';
        Object.entries(porProducto).sort((a, b) => b[1].total - a[1].total).forEach(([nombre, data]) => {
            html += `<tr class="border-b"><td class="px-4 py-3 font-medium">${escapeHTML(nombre)}</td><td class="px-4 py-3 text-right">${data.cantidad}</td><td class="px-4 py-3 text-right font-bold">${formatearGuaranies(data.total)}</td></tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }
}

// ============================================
// EDICION DE PEDIDOS
// ============================================
function abrirModalEditarPedido(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === pedidoId);
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }
    pedidoEditandoId = pedidoId;

    document.getElementById('editPedidoId').textContent = pedidoId;
    document.getElementById('editPedidoCliente').textContent = pedido.cliente?.nombre || 'N/A';
    document.getElementById('editPedidoTipoPago').value = pedido.tipoPago || 'contado';
    document.getElementById('editPedidoNotas').value = pedido.notas || '';

    renderizarItemsEdicion(pedido.items || []);
    recalcularTotalEdicion();
    document.getElementById('modalEditarPedido')?.show();
}

function cerrarModalEditarPedido() {
    pedidoEditandoId = null;
    document.getElementById('modalEditarPedido')?.hide();
}

function renderizarItemsEdicion(items) {
    const container = document.getElementById('editPedidoItems');
    container.innerHTML = '';
    items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2 bg-gray-50 p-3 rounded-lg';
        div.innerHTML = `
            <sl-select hoist size="small" class="flex-1 edit-item-producto" data-idx="${idx}" value="${escapeHTML(item.nombre && item.presentacion ? productosData.productos.reduce((acc, p) => { const pres = p.presentaciones.find(pr => p.nombre === item.nombre && pr.tamano === item.presentacion); return pres ? `${p.id}|${pres.tamano}|${pres.precio_base}` : acc; }, '') : '')}">
                <sl-option value="">-- Producto --</sl-option>
                ${productosData.productos.map(p =>
                    p.presentaciones.map(pres =>
                        `<sl-option value="${escapeHTML(p.id)}|${escapeHTML(pres.tamano)}|${pres.precio_base}">${escapeHTML(p.nombre)} - ${escapeHTML(pres.tamano)} (${formatearGuaranies(pres.precio_base)})</sl-option>`
                    ).join('')
                ).join('')}
            </sl-select>
            <sl-input type="number" value="${item.cantidad}" min="1" size="small" class="edit-item-cantidad" data-idx="${idx}" style="width:4rem;--sl-input-font-weight:700;" no-spin-buttons></sl-input>
            <span class="text-sm font-bold text-gray-700 w-32 text-right edit-item-subtotal">${formatearGuaranies(item.subtotal)}</span>
            <sl-button variant="text" size="small" onclick="eliminarItemEdicion(${idx})">×</sl-button>
        `;
        container.appendChild(div);
    });
    // Event delegation: sl-change para selects y inputs dinamicos
    // Remover listener previo para evitar apilamiento
    if (container._editChangeHandler) {
        container.removeEventListener('sl-change', container._editChangeHandler);
    }
    container._editChangeHandler = (e) => {
        if (e.target.closest('.edit-item-producto') || e.target.closest('.edit-item-cantidad')) {
            recalcularTotalEdicion();
        }
    };
    container.addEventListener('sl-change', container._editChangeHandler);
}

function agregarItemEditPedido() {
    const container = document.getElementById('editPedidoItems');
    const idx = container.children.length;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 bg-green-50 p-3 rounded-lg';
    div.innerHTML = `
        <sl-select hoist size="small" class="flex-1 edit-item-producto">
            <sl-option value="">-- Seleccionar Producto --</sl-option>
            ${productosData.productos.map(p =>
                p.presentaciones.map(pres =>
                    `<sl-option value="${escapeHTML(p.id)}|${escapeHTML(pres.tamano)}|${pres.precio_base}">${escapeHTML(p.nombre)} - ${escapeHTML(pres.tamano)} (${formatearGuaranies(pres.precio_base)})</sl-option>`
                ).join('')
            ).join('')}
        </sl-select>
        <sl-input type="number" value="1" min="1" size="small" class="edit-item-cantidad" style="width:4rem;--sl-input-font-weight:700;" no-spin-buttons></sl-input>
        <span class="text-sm font-bold text-gray-700 w-32 text-right edit-item-subtotal">Gs. 0</span>
        <sl-button variant="text" size="small" onclick="this.parentElement.remove();recalcularTotalEdicion()">×</sl-button>
    `;
    container.appendChild(div);
    // sl-change listeners for new item
    div.querySelector('.edit-item-producto').addEventListener('sl-change', () => recalcularTotalEdicion());
    div.querySelector('.edit-item-cantidad').addEventListener('sl-change', () => recalcularTotalEdicion());
}

function eliminarItemEdicion(idx) {
    const container = document.getElementById('editPedidoItems');
    if (container.children.length <= 1) { mostrarToast('Debe haber al menos un producto', 'error'); return; }
    container.children[idx].remove();
    recalcularTotalEdicion();
}

function recalcularTotalEdicion() {
    const container = document.getElementById('editPedidoItems');
    let subtotal = 0;
    Array.from(container.children).forEach(div => {
        const select = div.querySelector('.edit-item-producto');
        const cantInput = div.querySelector('.edit-item-cantidad');
        const subtotalSpan = div.querySelector('.edit-item-subtotal');
        if (select && select.value && cantInput) {
            const parts = select.value.split('|');
            const precio = parseInt(parts[2]) || 0;
            const cant = parseInt(cantInput.value) || 1;
            const sub = precio * cant;
            subtotal += sub;
            if (subtotalSpan) subtotalSpan.textContent = formatearGuaranies(sub);
        }
    });
    const desc = parseFloat(document.getElementById('editPedidoDescuento')?.value) || 0;
    const total = Math.round(subtotal * (1 - desc / 100));
    document.getElementById('editPedidoTotal').textContent = formatearGuaranies(total);
}

async function guardarEdicionPedido() {
    if (!pedidoEditandoId) return;
    const container = document.getElementById('editPedidoItems');
    const items = [];
    Array.from(container.children).forEach(div => {
        const select = div.querySelector('.edit-item-producto');
        const cantInput = div.querySelector('.edit-item-cantidad');
        if (select && select.value) {
            const parts = select.value.split('|');
            const prodId = parts[0];
            const tamano = parts[1];
            const precio = parseInt(parts[2]) || 0;
            const cantidad = parseInt(cantInput.value) || 1;
            const prod = productosData.productos.find(p => p.id === prodId);
            items.push({
                productoId: prodId,
                nombre: prod?.nombre || 'Producto',
                presentacion: tamano,
                precio,
                cantidad,
                subtotal: precio * cantidad
            });
        }
    });
    if (items.length === 0) { mostrarToast('Agrega al menos un producto', 'error'); return; }

    await withButtonLock('btnGuardarEdicionPedido', async () => {
        const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
        const total = subtotal;

        // Update in HDVStorage (atomicUpdate previene race conditions con realtime)
        const tipoPago = document.getElementById('editPedidoTipoPago')?.value || 'contado';
        const notas = document.getElementById('editPedidoNotas')?.value.trim() || '';
        let pedidoActualizado = null;
        await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
            const list = pedidos || [];
            const idx = list.findIndex(p => p.id === pedidoEditandoId);
            if (idx >= 0) {
                list[idx].items = items;
                list[idx].subtotal = subtotal;
                list[idx].total = total;
                list[idx].tipoPago = tipoPago;
                list[idx].notas = notas;
                list[idx].editado = true;
                list[idx].fechaEdicion = new Date().toISOString();
                pedidoActualizado = list[idx];
            }
            return list;
        });

        // Sync con Supabase
        if (pedidoActualizado && typeof guardarPedido === 'function') {
            guardarPedido(pedidoActualizado);
        }

        cerrarModalEditarPedido();
        if (typeof cargarPedidos === 'function' && !unsubscribePedidos) cargarPedidos();
        else aplicarFiltrosPedidos();
    }, 'Guardando...')();
}

// ============================================
// PDF Y TICKET
// ============================================
function generarPDFRemision(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === (pedidoId || pedidoEditandoId));
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }
    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    generarPDFRemisionDoc(pedido, clienteInfo);
}

function generarTicketTermico(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === (pedidoId || pedidoEditandoId));
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }
    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    const ticketHTML = generarTicketHTML(pedido, {
        titulo: 'EAS - Nota de Remision',
        clienteInfo: clienteInfo || {},
        mostrarEstado: true
    });
    imprimirViaIframe('printFrame', ticketHTML);
}

// ============================================
// CALCULO DE GANANCIA NETA
// ============================================
// Cache de ganancia por pedido (hot path: .find por ítem en productosData).
// Clave: id + total + nº items + versión. La versión sube cuando cambian
// datos/catálogo (bumpGananciaCache) → cero riesgo de cifras stale.
const _gananciaCache = new Map();
let _gananciaVer = 0;
function bumpGananciaCache() { _gananciaVer++; if (_gananciaCache.size > 5000) _gananciaCache.clear(); }
if (typeof window !== 'undefined') window.bumpGananciaCache = bumpGananciaCache;

function calcularGananciaPedido(pedido) {
    if (!pedido) return { costoTotal: 0, gananciaTotal: 0, margenPromedio: 0, itemsConCosto: 0, itemsTotales: 0 };
    const _key = pedido.id ? `${pedido.id}:${pedido.total || 0}:${(pedido.items || []).length}:${_gananciaVer}` : null;
    if (_key) { const _hit = _gananciaCache.get(_key); if (_hit) return _hit; }
    const _res = _calcGananciaPedidoRaw(pedido);
    if (_key) _gananciaCache.set(_key, _res);
    return _res;
}

function _calcGananciaPedidoRaw(pedido) {
    let costoTotal = 0;
    let ventaTotal = pedido.total || 0;
    let itemsConCosto = 0;
    let itemsTotales = 0;

    (pedido.items || []).forEach(item => {
        itemsTotales++;
        const producto = (productosData.productos || []).find(p => p.id === item.productoId);
        if (!producto) return;
        const pres = (producto.presentaciones || []).find(pr => pr.tamano === item.presentacion);
        if (!pres) return;
        const costo = pres.costo || 0;
        if (costo > 0) {
            costoTotal += costo * (item.cantidad || 1);
            itemsConCosto++;
        }
    });

    const gananciaTotal = ventaTotal - costoTotal;
    const margenPromedio = ventaTotal > 0 ? Math.round((gananciaTotal / ventaTotal) * 100) : 0;

    return { costoTotal, gananciaTotal, margenPromedio, itemsConCosto, itemsTotales };
}

function calcularGananciaPedidos(pedidos) {
    let costoTotal = 0;
    let ventaTotal = 0;
    let itemsConCosto = 0;
    let itemsTotales = 0;

    pedidos.forEach(p => {
        ventaTotal += p.total || 0;
        const g = calcularGananciaPedido(p);
        costoTotal += g.costoTotal;
        itemsConCosto += g.itemsConCosto;
        itemsTotales += g.itemsTotales;
    });

    const gananciaTotal = ventaTotal - costoTotal;
    const margenPromedio = ventaTotal > 0 ? Math.round((gananciaTotal / ventaTotal) * 100) : 0;

    return { costoTotal, ventaTotal, gananciaTotal, margenPromedio, itemsConCosto, itemsTotales };
}
