// ============================================
// HDV Vendedor - Capa de UI / Templates
// Toda la manipulacion DOM y rendering de la app vendedor.
// NO contiene logica de negocio ni persistencia.
// Depende de globals: productos, categorias, clientes, clienteActual, carrito,
//   categoriaActual, categoriaSeleccionada, vistaCatalogo, vistaActual, zonaActiva
// ============================================

// ============================================
// SVG EMPTY STATE ILLUSTRATIONS
// ============================================
const SVG_EMPTY_CART = `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="40" y="60" width="120" height="90" rx="12" stroke="#d1d5db" stroke-width="3" fill="#f3f4f6"/>
  <path d="M70 80h60M70 100h40M70 120h50" stroke="#d1d5db" stroke-width="3" stroke-linecap="round"/>
  <circle cx="140" cy="160" r="12" stroke="#d1d5db" stroke-width="3" fill="#f9fafb"/>
  <circle cx="80" cy="160" r="12" stroke="#d1d5db" stroke-width="3" fill="#f9fafb"/>
  <path d="M50 50l10 10M100 35v15M150 50l-10 10" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const SVG_EMPTY_ORDERS = `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="45" y="30" width="110" height="140" rx="10" stroke="#d1d5db" stroke-width="3" fill="#f3f4f6"/>
  <path d="M65 60h70M65 80h50M65 100h60M65 120h35" stroke="#d1d5db" stroke-width="3" stroke-linecap="round"/>
  <circle cx="150" cy="150" r="25" stroke="#e5e7eb" stroke-width="3" fill="#f9fafb"/>
  <path d="M143 150h14M150 143v14" stroke="#d1d5db" stroke-width="2.5" stroke-linecap="round"/>
</svg>`;

const SVG_EMPTY_SEARCH = `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="90" cy="85" r="40" stroke="#d1d5db" stroke-width="3" fill="#f3f4f6"/>
  <path d="M118 113l30 30" stroke="#d1d5db" stroke-width="4" stroke-linecap="round"/>
  <path d="M75 80h30M80 95h20" stroke="#e5e7eb" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M60 155h80" stroke="#e5e7eb" stroke-width="2" stroke-linecap="round" stroke-dasharray="6 4"/>
</svg>`;

function generarEmptyState(svgIcon, titulo, subtitulo, botonTexto, botonOnclick) {
    return `<div class="empty-state">
        ${svgIcon}
        <p>${titulo}</p>
        ${subtitulo ? `<p class="empty-sub">${subtitulo}</p>` : ''}
        ${botonTexto ? `<sl-button onclick="${botonOnclick}" variant="neutral" size="medium">${botonTexto}</sl-button>` : ''}
    </div>`;
}

function generarSkeletonProductos(count = 6) {
    let html = '<div class="grid grid-cols-2 gap-2">';
    for (let i = 0; i < count; i++) {
        html += `<div class="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div class="skeleton w-full h-28 mb-2"></div>
            <div class="skeleton h-4 w-3/4 mb-1"></div>
            <div class="skeleton h-3 w-1/2"></div>
        </div>`;
    }
    html += '</div>';
    return html;
}

// ============================================
// CLIENTES UI
// ============================================
function poblarClientes() { /* no-op — replaced by smart search */ }

function _renderClienteResults(query) {
    const dropdown = document.getElementById('clienteDropdown');
    const listado = document.getElementById('clienteDropdownListado');
    const pie = document.getElementById('clienteDropdownPie');
    if (!dropdown) return;
    const q = (query || '').toLowerCase().trim();

    // Sin query: mostrar todos; con query: filtrar por nombre/RUC
    let lista = q
        ? clientes.filter(c =>
            (c.razon_social || c.nombre || '').toLowerCase().includes(q) ||
            (c.ruc || '').toLowerCase().includes(q)
          )
        : [...clientes];

    if (typeof zonaActiva !== 'undefined' && zonaActiva) {
        lista = lista.filter(c => c.zona && c.zona.trim() === zonaActiva);
    }

    if (lista.length === 0) {
        const msg = q
            ? `Sin resultados para "<strong>${escapeHTML(query)}</strong>"`
            : (zonaActiva ? `No hay clientes en <strong>${escapeHTML(zonaActiva)}</strong>` : 'No hay clientes cargados');
        listado.innerHTML = `<div class="px-4 py-6 text-center text-sm text-slate-400">${msg}</div>`;
        pie.classList.add('hidden');
    } else {
        listado.innerHTML = lista.map(c => {
            const nombre = escapeHTML(c.razon_social || c.nombre || c.id);
            const inicial = (c.razon_social || c.nombre || '?').charAt(0).toUpperCase();
            const ruc = c.ruc ? escapeHTML(c.ruc) : '';
            const zona = c.zona ? escapeHTML(c.zona) : '';
            const sub = [ruc ? 'RUC ' + ruc : '', zona].filter(Boolean).join(' · ');
            return `<div class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 active:bg-slate-100 border-b border-slate-100 last:border-0"
                data-action="seleccionarClienteId" data-arg="${escapeHTML(c.id)}">
                <div class="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold shrink-0 pointer-events-none">${inicial}</div>
                <div class="flex-1 min-w-0 pointer-events-none">
                    <p class="text-sm font-semibold text-gray-800 truncate">${nombre}</p>
                    ${sub ? `<p class="text-xs text-slate-400 truncate">${sub}</p>` : ''}
                </div>
            </div>`;
        }).join('');
        if (!q) {
            const label = zonaActiva
                ? `${lista.length} cliente${lista.length !== 1 ? 's' : ''} en ${escapeHTML(zonaActiva)}`
                : `${lista.length} clientes disponibles`;
            pie.textContent = label;
            pie.classList.remove('hidden');
        } else if (lista.length > 5) {
            pie.textContent = lista.length + ' resultados · seguí escribiendo para filtrar';
            pie.classList.remove('hidden');
        } else {
            pie.classList.add('hidden');
        }
    }
    dropdown.classList.remove('hidden');
}

async function _seleccionarCliente(clienteId) {
    const cliente = clientes.find(c => c.id === clienteId);
    if (!cliente) return;
    if (typeof clienteActual !== 'undefined' && clienteActual && clienteActual.id !== clienteId &&
        typeof carrito !== 'undefined' && carrito.length > 0) {
        const ok = await mostrarConfirmModal('Cambiar de cliente vaciara el carrito actual. ¿Continuar?', { destructivo: true });
        if (!ok) return;
        carrito = [];
        if (typeof actualizarContadorCarrito === 'function') actualizarContadorCarrito();
        if (typeof guardarCarrito === 'function') guardarCarrito();
    }
    clienteActual = cliente;
    const nombre = cliente.razon_social || cliente.nombre || '';
    const avatar = document.getElementById('clienteChipAvatar');
    const chipNombre = document.getElementById('clienteChipNombre');
    const chipZona = document.getElementById('clienteChipZona');
    if (avatar) avatar.textContent = nombre.charAt(0).toUpperCase() || '?';
    if (chipNombre) chipNombre.textContent = nombre;
    if (chipZona) chipZona.textContent = cliente.zona || '';
    document.getElementById('clienteSearchBox').classList.add('hidden');
    document.getElementById('clienteSelectedChip').classList.remove('hidden');
    document.getElementById('clienteDropdown').classList.add('hidden');
    document.getElementById('clienteSearchInput').value = '';
    mostrarInfoCliente(clienteActual);
    if (typeof mostrarProductos === 'function') mostrarProductos();
}

function _limpiarClienteSeleccionado() {
    clienteActual = null;
    document.getElementById('clienteSearchBox').classList.remove('hidden');
    document.getElementById('clienteSelectedChip').classList.add('hidden');
    document.getElementById('clienteDropdown').classList.add('hidden');
    document.getElementById('clienteSearchInput').value = '';
    mostrarInfoCliente(null);
}

function _actualizarZonaBtn(zona) {
    const label = document.getElementById('zonaFilterLabel');
    const clearBtn = document.getElementById('zonaFilterClear');
    const input = document.getElementById('clienteSearchInput');
    const picker = document.getElementById('zonaPickerDropdown');
    if (label) label.textContent = zona || 'Todas';
    if (clearBtn) clearBtn.classList.toggle('hidden', !zona);
    if (input) input.placeholder = zona ? 'Buscar en ' + zona + '...' : 'Buscar cliente...';
    // Si el dropdown de clientes está visible, actualizarlo con la nueva zona
    const dropdown = document.getElementById('clienteDropdown');
    if (dropdown && !dropdown.classList.contains('hidden') && input) {
        _renderClienteResults(input.value);
    }
    if (picker) picker.classList.add('hidden');
}

function _renderZonaPicker() {
    const listado = document.getElementById('zonaPickerListado');
    if (!listado) return;
    const zonas = typeof obtenerZonasUnicas === 'function' ? obtenerZonasUnicas() : [];
    const totalClientes = (typeof clientes !== 'undefined' ? clientes : []).length;
    let html = `<div class="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50 ${!zonaActiva ? 'text-indigo-600 font-semibold bg-indigo-50' : 'text-slate-700'}"
        data-action="elegirZonaFiltro" data-arg="">
        <span class="text-sm">Todas las zonas</span>
        <span class="text-xs text-slate-400 ml-3">${totalClientes}</span>
    </div>`;
    zonas.forEach(z => {
        const active = zonaActiva === z.zona;
        html += `<div class="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50 border-t border-slate-50 ${active ? 'text-indigo-600 font-semibold bg-indigo-50' : 'text-slate-700'}"
            data-action="elegirZonaFiltro" data-arg="${escapeHTML(z.zona)}">
            <span class="text-sm">${escapeHTML(z.zona)}</span>
            <span class="text-xs text-slate-400 ml-3">${z.cantidad}</span>
        </div>`;
    });
    listado.innerHTML = html;
}

function _toggleZonaPicker() {
    const picker = document.getElementById('zonaPickerDropdown');
    const clienteDropdown = document.getElementById('clienteDropdown');
    if (!picker) return;
    if (picker.classList.contains('hidden')) {
        _renderZonaPicker();
        picker.classList.remove('hidden');
        if (clienteDropdown) clienteDropdown.classList.add('hidden');
    } else {
        picker.classList.add('hidden');
    }
}

function poblarZonePills() {
    _actualizarZonaBtn(typeof zonaActiva !== 'undefined' ? zonaActiva : null);
}

function _initClienteSearch() {
    const input = document.getElementById('clienteSearchInput');
    const dropdown = document.getElementById('clienteDropdown');
    if (!input) return;
    const debounced = (typeof debounce === 'function') ? debounce(q => _renderClienteResults(q), 200) : q => _renderClienteResults(q);
    input.addEventListener('input', e => debounced(e.target.value));
    input.addEventListener('focus', () => _renderClienteResults(input.value));
    document.addEventListener('click', e => {
        const wrapper = document.getElementById('clienteSearchWrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            if (dropdown) dropdown.classList.add('hidden');
            const picker = document.getElementById('zonaPickerDropdown');
            if (picker) picker.classList.add('hidden');
        }
        // Cerrar filtro de pedidos al hacer click fuera
        const pedidosDD = document.getElementById('pedidosFiltroDropdown');
        if (pedidosDD && !e.target.closest('[data-action="togglePedidosFiltroDropdown"]') && !pedidosDD.contains(e.target)) {
            pedidosDD.classList.add('hidden');
        }
    }, true);
}

async function mostrarInfoCliente(cliente) {
    const panel = document.getElementById('clienteInfo');
    if (!panel) return;
    if (!cliente) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');

    document.getElementById('clienteInfoNombre').textContent = cliente.razon_social || cliente.nombre;
    document.getElementById('clienteInfoRuc').textContent = cliente.ruc || 'Sin RUC';

    // Dias desde ultimo pedido
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedidosCliente = pedidos.filter(p => p.cliente && p.cliente.id === cliente.id);
    const elDias = document.getElementById('clienteInfoDias');
    if (pedidosCliente.length > 0) {
        const fechas = pedidosCliente.map(p => new Date(p.fecha)).sort((a, b) => b - a);
        const dias = Math.floor((Date.now() - fechas[0]) / 86400000);
        elDias.innerHTML = `<i data-lucide="calendar" class="w-3 h-3"></i> ${dias === 0 ? 'Hoy' : dias + 'd'}`;
        elDias.className = 'flex items-center gap-1 ' + (dias > 15 ? 'text-red-500' : dias > 7 ? 'text-amber-500' : 'text-green-600');
    } else {
        elDias.innerHTML = '<i data-lucide="calendar" class="w-3 h-3"></i> Sin pedidos';
        elDias.className = 'flex items-center gap-1 text-gray-400';
    }

    // Saldo de deuda
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
    const creditos = pedidosCliente.filter(p => p.tipoPago === 'credito');
    let deudaTotal = 0;
    creditos.forEach(p => {
        const pagosP = allPagos.filter(pg => pg.pedidoId === p.id).reduce((s, pg) => s + (pg.monto || 0), 0);
        deudaTotal += (p.total || 0) - pagosP;
    });
    const elDeuda = document.getElementById('clienteInfoDeuda');
    if (deudaTotal > 0) {
        elDeuda.innerHTML = `<i data-lucide="credit-card" class="w-3 h-3"></i> ${formatearGuaranies(deudaTotal)}`;
        elDeuda.className = 'flex items-center gap-1 text-red-500 font-bold';
    } else {
        elDeuda.innerHTML = '<i data-lucide="credit-card" class="w-3 h-3"></i> Al dia';
        elDeuda.className = 'flex items-center gap-1 text-green-600';
    }

    // Botones de accion del panel cliente
    const btnHistorial = document.getElementById('btnVerHistorial');
    if (btnHistorial) btnHistorial.setAttribute('data-arg', cliente.id);
    const btnCobrar = document.getElementById('btnCobrarCliente');
    if (btnCobrar) {
        btnCobrar.setAttribute('data-arg', cliente.id);
        if (deudaTotal > 0) {
            btnCobrar.classList.remove('hidden');
            const span = document.getElementById('btnCobrarMonto');
            if (span) span.textContent = `Cobrar ${formatearGuaranies(deudaTotal)}`;
        } else {
            btnCobrar.classList.add('hidden');
        }
    }

    // Top 3 productos
    const conteo = {};
    pedidosCliente.forEach(p => (p.items || []).forEach(i => {
        const key = i.nombre || i.productoId;
        conteo[key] = (conteo[key] || 0) + (i.cantidad || 1);
    }));
    const top3 = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const elTop = document.getElementById('clienteInfoTop');
    elTop.innerHTML = top3.length > 0
        ? top3.map(([n, q]) => `${q}x ${escapeHTML(n)}`).join('<br>')
        : '<span class="text-gray-300">Sin historial</span>';

    // Re-render lucide icons
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================
// CATEGORIAS UI
// ============================================
function crearFiltrosCategorias() {
    const container = document.getElementById('categoryFilters');
    const todasBtn = document.createElement('sl-button');
    todasBtn.pill = true;
    todasBtn.size = 'small';
    todasBtn.variant = 'primary';
    todasBtn.className = 'category-btn whitespace-nowrap';
    todasBtn.textContent = 'Todas';
    todasBtn.onclick = () => filtrarCategoria('todas');
    container.innerHTML = '';
    container.appendChild(todasBtn);

    categorias.forEach(cat => {
        const btn = document.createElement('sl-button');
        btn.pill = true;
        btn.size = 'small';
        btn.variant = 'default';
        btn.className = 'category-btn whitespace-nowrap';
        btn.textContent = cat.nombre;
        btn.onclick = () => filtrarCategoria(cat.id);
        container.appendChild(btn);
    });
}

function filtrarCategoria(catId) {
    categoriaActual = catId;
    _subcatSeleccionada = null;
    if (catId === 'todas') {
        categoriaSeleccionada = null;
        vistaCatalogo = 'categorias';
    } else {
        categoriaSeleccionada = null;
        vistaCatalogo = 'productos';
    }
    document.querySelectorAll('.category-btn').forEach((btn, i) => {
        if ((catId === 'todas' && i === 0) || btn.textContent === categorias.find(c => c.id === catId)?.nombre) {
            btn.variant = 'primary';
        } else {
            btn.variant = 'default';
        }
    });
    mostrarProductos();
}

function volverACategorias() {
    categoriaSeleccionada = null;
    _subcatSeleccionada = null;
    vistaCatalogo = 'categorias';
    mostrarProductos();
}

// ============================================
// PRODUCTOS UI
// ============================================
async function mostrarProductos() {
    const container = document.getElementById('productsContainer');
    const busqueda = document.getElementById('searchInput').value.toLowerCase().trim();

    if (busqueda || categoriaActual !== 'todas') {
        vistaCatalogo = 'productos';
        await renderizarProductosVendedor(container, busqueda);
        return;
    }

    if (vistaCatalogo === 'categorias') {
        await renderizarCategoriasVendedor(container);
    } else {
        await renderizarProductosVendedor(container, busqueda);
    }
}

async function renderizarCategoriasVendedor(container) {
    container.innerHTML = '';

    // Productos frecuentes del cliente actual
    if (clienteActual) {
        const frecuentes = typeof obtenerProductosFrecuentes === 'function' ? await obtenerProductosFrecuentes(clienteActual.id, 6) : [];
        if (frecuentes.length > 0) {
            const frecDiv = document.createElement('div');
            frecDiv.className = 'mb-4';
            frecDiv.innerHTML = `<p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Frecuentes de ${escapeHTML(clienteActual.razon_social || clienteActual.nombre)}</p>`;
            const frecGrid = document.createElement('div');
            frecGrid.className = 'flex gap-2 overflow-x-auto no-scrollbar pb-2';
            frecuentes.forEach(f => {
                const prod = productos.find(p => p.id === f.productoId);
                if (!prod) return;
                const chip = document.createElement('sl-button');
                chip.variant = 'default';
                chip.size = 'small';
                chip.style.cssText = '--sl-color-neutral-0: #eff6ff; --sl-color-neutral-700: #1e40af; border-color: #bfdbfe;';
                chip.className = 'shrink-0';
                chip.textContent = prod.nombre;
                chip.onclick = () => mostrarDetalleProducto(prod);
                frecGrid.appendChild(chip);
            });
            frecDiv.appendChild(frecGrid);
            container.appendChild(frecDiv);
        }
    }

    // Titulo
    const titulo = document.createElement('p');
    titulo.className = 'text-xs font-bold text-gray-500 uppercase tracking-wider mb-3';
    titulo.textContent = 'Categorias';
    container.appendChild(titulo);

    // Grid de categorias
    const grid = document.createElement('div');
    grid.className = 'vendor-catalog-grid';

    categorias.forEach(cat => {
        const prodsEnCat = productos.filter(p => p.categoria === cat.id);
        const count = prodsEnCat.length;
        if (count === 0) return;

        const imgProd = prodsEnCat.find(p => p.imagen || p.imagen_url);
        const img = imgProd ? (imgProd.imagen_url || imgProd.imagen) : '';

        const card = document.createElement('div');
        card.className = 'vendor-cat-card';
        if (img) {
            card.setAttribute('data-bg', img);
        }
        card.onclick = () => {
            categoriaSeleccionada = cat.id;
            vistaCatalogo = 'productos';
            mostrarProductos();
        };

        card.innerHTML = `
            ${!img ? '<div class="vendor-cat-card-noimg"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="7" height="5" x="7" y="7" rx="1"/><rect width="7" height="5" x="10" y="12" rx="1"/></svg></div>' : ''}
            <div class="vendor-cat-card-label">
                <div>${escapeHTML(cat.nombre)}</div>
                <div class="card-sub">${count} producto${count !== 1 ? 's' : ''}</div>
            </div>`;
        grid.appendChild(card);
    });

    container.appendChild(grid);
    initLazyLoadCatCards(grid);
}

async function renderizarProductosVendedor(container, busqueda) {
    // --- Filtrado ---
    let filtrados = productos;
    const catFiltro = categoriaActual !== 'todas' ? categoriaActual : categoriaSeleccionada;
    if (catFiltro) filtrados = filtrados.filter(p => p.categoria === catFiltro);
    if (_subcatSeleccionada) filtrados = filtrados.filter(p => p.subcategoria === _subcatSeleccionada);
    if (busqueda) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(busqueda));
    if (categoriaSeleccionada && !busqueda && categoriaActual === 'todas') {
        filtrados = filtrados.filter(p => { const e = p.estado || 'disponible'; return e !== 'discontinuado' && e !== 'agotado'; });
    }

    // --- Pre-computo última cantidad pedida (una sola lectura async) ---
    const ultimasQtys = {};
    if (clienteActual) {
        try {
            const hist = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
            hist.filter(p => p.cliente?.id === clienteActual.id)
                .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
                .forEach(pedido => {
                    (pedido.items || []).forEach(item => {
                        if (!ultimasQtys[item.productoId]) ultimasQtys[item.productoId] = item.cantidad;
                    });
                });
        } catch (_e) { /* silencioso */ }
    }

    // --- Empty state ---
    if (filtrados.length === 0) {
        const catNombre = categorias.find(c => c.id === catFiltro)?.nombre || '';
        container.innerHTML = generarEmptyState(SVG_EMPTY_SEARCH, 'No se encontraron productos',
            busqueda ? 'Intentá con otro término' : `No hay productos en ${escapeHTML(_subcatSeleccionada || catNombre)}`);
        if (categoriaSeleccionada) {
            const btn = document.createElement('div');
            btn.className = 'text-center mt-2';
            const sl = document.createElement('sl-button');
            sl.variant = 'neutral'; sl.textContent = 'Volver a Categorías';
            sl.onclick = () => volverACategorias();
            btn.appendChild(sl);
            container.appendChild(btn);
        }
        return;
    }

    container.innerHTML = '';

    // --- Barra superior (dentro de categoría) ---
    if (categoriaSeleccionada && categoriaActual === 'todas') {
        const cat = categorias.find(c => c.id === categoriaSeleccionada);
        const catNombre = cat?.nombre || '';
        const subcats = (cat?.subcategorias || []).filter(s => s);

        // Back bar con toggle vista
        const backBar = document.createElement('div');
        backBar.className = 'flex items-center gap-2 mb-2';

        const backBtn = document.createElement('sl-button');
        backBtn.variant = 'default'; backBtn.size = 'small';
        backBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" slot="prefix"><path d="m15 18-6-6 6-6"/></svg>Categorías`;
        backBtn.onclick = () => volverACategorias();

        const titleSpan = document.createElement('span');
        titleSpan.className = 'text-sm font-bold text-white flex-1 truncate';
        titleSpan.textContent = catNombre;

        const countSpan = document.createElement('span');
        countSpan.className = 'text-xs text-slate-400 shrink-0';
        countSpan.textContent = `${filtrados.length} prod.`;

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'p-1.5 rounded-lg bg-white/10 text-slate-300 hover:bg-white/20 transition-colors shrink-0';
        const isGrid = _vistaProductos === 'grid';
        toggleBtn.innerHTML = isGrid
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
        toggleBtn.onclick = () => _toggleVistaCatalogo();

        backBar.appendChild(backBtn);
        backBar.appendChild(titleSpan);
        backBar.appendChild(countSpan);
        backBar.appendChild(toggleBtn);
        container.appendChild(backBar);

        // Chips de subcategoría
        if (subcats.length > 0) {
            const chipsDiv = document.createElement('div');
            chipsDiv.className = 'subcat-chips mb-3';

            const chipTodas = document.createElement('button');
            chipTodas.className = 'subcat-chip' + (_subcatSeleccionada === null ? ' active' : '');
            chipTodas.textContent = 'Todas';
            chipTodas.onclick = () => _setSubcat(null);
            chipsDiv.appendChild(chipTodas);

            subcats.forEach(s => {
                const chip = document.createElement('button');
                chip.className = 'subcat-chip' + (_subcatSeleccionada === s ? ' active' : '');
                chip.textContent = s;
                chip.onclick = () => _setSubcat(s);
                chipsDiv.appendChild(chip);
            });
            container.appendChild(chipsDiv);
        }
    }

    // --- Render grid o lista ---
    const noImgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;

    const wrapper = document.createElement('div');
    wrapper.className = _vistaProductos === 'list' ? 'vpc-list' : 'vendor-prod-grid';
    container.appendChild(wrapper);

    const CHUNK_SIZE = 40;
    let idx = 0;

    function crearCardGrid(prod) {
        const presActivas = (prod.presentaciones || []).filter(p => p.activo !== false);
        const imgUrl = prod.imagen_url || prod.imagen;

        // Precio (con soporte precio personalizado)
        let precioMin = presActivas.length > 0 ? Math.min(...presActivas.map(p => p.precio_base || 0)) : 0;
        let precioCustomMin = null;
        if (clienteActual?.precios_personalizados?.[prod.id]) {
            const cps = clienteActual.precios_personalizados[prod.id];
            presActivas.forEach(pres => {
                const cp = cps.find(x => x.tamano === pres.tamano);
                if (cp && (precioCustomMin === null || cp.precio < precioCustomMin)) precioCustomMin = cp.precio;
            });
        }

        const card = document.createElement('div');
        card.className = 'vpc';
        card.dataset.prodId = prod.id;
        card.onclick = () => mostrarDetalleProducto(prod);

        // Imagen
        if (imgUrl) {
            const img = document.createElement('img');
            img.className = 'vpc-img lazy-img opacity-0';
            img.dataset.src = imgUrl;
            img.alt = prod.nombre;
            img.onerror = () => { img.style.display = 'none'; };
            card.appendChild(img);
        } else {
            const ni = document.createElement('div');
            ni.className = 'vpc-noimg';
            ni.innerHTML = noImgSvg;
            card.appendChild(ni);
        }

        // Badge cantidad (top-left)
        const badge = document.createElement('div');
        badge.className = 'vpc-badge';
        card.appendChild(badge);

        // Controles +/- (top-right)
        const ctrl = document.createElement('div');
        ctrl.className = 'vpc-ctrl';

        const minusBtn = document.createElement('button');
        minusBtn.className = 'vpc-btn vpc-minus';
        minusBtn.innerHTML = '&#x2212;';
        minusBtn.style.display = 'none';
        minusBtn.onclick = (e) => { e.stopPropagation(); _quickRemoveProd(prod); };

        const qtyNum = document.createElement('span');
        qtyNum.className = 'vpc-qty-num';

        const plusBtn = document.createElement('button');
        plusBtn.className = 'vpc-btn vpc-plus';
        plusBtn.innerHTML = '+';
        plusBtn.onclick = (e) => { e.stopPropagation(); _quickAddProd(prod); };

        ctrl.appendChild(minusBtn);
        ctrl.appendChild(qtyNum);
        ctrl.appendChild(plusBtn);
        card.appendChild(ctrl);

        // Info bottom
        const info = document.createElement('div');
        info.className = 'vpc-info';

        const nombre = document.createElement('div');
        nombre.className = 'vpc-nombre';
        nombre.textContent = prod.nombre;
        info.appendChild(nombre);

        if (precioCustomMin !== null && precioCustomMin !== precioMin) {
            const pRow = document.createElement('div');
            pRow.className = 'vpc-precio vpc-precio-custom';
            pRow.innerHTML = `${formatearGuaranies(precioCustomMin)}<span class="vpc-precio-base">${formatearGuaranies(precioMin)}</span>`;
            info.appendChild(pRow);
        } else if (precioMin > 0) {
            const pEl = document.createElement('div');
            pEl.className = 'vpc-precio';
            pEl.textContent = formatearGuaranies(precioMin);
            info.appendChild(pEl);
        }

        const ultQty = ultimasQtys[prod.id];
        if (ultQty) {
            const ultEl = document.createElement('div');
            ultEl.className = 'vpc-ultima';
            ultEl.textContent = `Última: ${ultQty} ud${ultQty !== 1 ? 's' : ''}`;
            info.appendChild(ultEl);
        }

        card.appendChild(info);
        return card;
    }

    function crearItemLista(prod) {
        const presActivas = (prod.presentaciones || []).filter(p => p.activo !== false);
        const imgUrl = prod.imagen_url || prod.imagen;

        let precioMin = presActivas.length > 0 ? Math.min(...presActivas.map(p => p.precio_base || 0)) : 0;
        let precioCustomMin = null;
        if (clienteActual?.precios_personalizados?.[prod.id]) {
            const cps = clienteActual.precios_personalizados[prod.id];
            presActivas.forEach(pres => {
                const cp = cps.find(x => x.tamano === pres.tamano);
                if (cp && (precioCustomMin === null || cp.precio < precioCustomMin)) precioCustomMin = cp.precio;
            });
        }

        const row = document.createElement('div');
        row.className = 'vpc-list-item';
        row.dataset.prodId = prod.id;
        row.onclick = () => mostrarDetalleProducto(prod);

        // Thumb
        if (imgUrl) {
            const img = document.createElement('img');
            img.className = 'vpc-list-thumb lazy-img opacity-0';
            img.dataset.src = imgUrl;
            img.alt = prod.nombre;
            row.appendChild(img);
        } else {
            const ni = document.createElement('div');
            ni.className = 'vpc-list-noimg';
            ni.innerHTML = noImgSvg;
            row.appendChild(ni);
        }

        // Meta
        const meta = document.createElement('div');
        meta.className = 'vpc-list-meta';

        const nombre = document.createElement('div');
        nombre.className = 'vpc-list-nombre';
        nombre.textContent = prod.nombre;
        meta.appendChild(nombre);

        if (precioCustomMin !== null && precioCustomMin !== precioMin) {
            const pRow = document.createElement('div');
            pRow.className = 'vpc-list-precio vpc-list-precio-custom';
            pRow.innerHTML = `${formatearGuaranies(precioCustomMin)}<span class="vpc-list-precio-base">${formatearGuaranies(precioMin)}</span>`;
            meta.appendChild(pRow);
        } else if (precioMin > 0) {
            const pEl = document.createElement('div');
            pEl.className = 'vpc-list-precio';
            pEl.textContent = formatearGuaranies(precioMin);
            meta.appendChild(pEl);
        }

        const ultQty = ultimasQtys[prod.id];
        if (ultQty) {
            const ultEl = document.createElement('div');
            ultEl.className = 'vpc-list-ultima';
            ultEl.textContent = `Última: ${ultQty} ud${ultQty !== 1 ? 's' : ''}`;
            meta.appendChild(ultEl);
        }

        row.appendChild(meta);

        // Controles lista
        const ctrl = document.createElement('div');
        ctrl.className = 'vpc-list-ctrl';

        const minusBtn = document.createElement('button');
        minusBtn.className = 'vpc-list-btn vpc-minus';
        minusBtn.innerHTML = '&#x2212;';
        minusBtn.style.display = 'none';
        minusBtn.onclick = (e) => { e.stopPropagation(); _quickRemoveProd(prod); };

        const qtyEl = document.createElement('span');
        qtyEl.className = 'vpc-list-qty';
        qtyEl.textContent = '0';
        qtyEl.style.display = 'none';

        const plusBtn = document.createElement('button');
        plusBtn.className = 'vpc-list-btn vpc-plus';
        plusBtn.innerHTML = '+';
        plusBtn.onclick = (e) => { e.stopPropagation(); _quickAddProd(prod); };

        ctrl.appendChild(minusBtn);
        ctrl.appendChild(qtyEl);
        ctrl.appendChild(plusBtn);
        row.appendChild(ctrl);

        return row;
    }

    function renderChunk() {
        const end = Math.min(idx + CHUNK_SIZE, filtrados.length);
        const isList = _vistaProductos === 'list';
        for (let i = idx; i < end; i++) {
            wrapper.appendChild(isList ? crearItemLista(filtrados[i]) : crearCardGrid(filtrados[i]));
        }
        idx = end;
        if (idx < filtrados.length) {
            requestAnimationFrame(renderChunk);
        } else {
            initLazyLoadImages(wrapper);
            _actualizarBadgesCarritoEnCatalogo();
        }
    }

    requestAnimationFrame(renderChunk);
}

// ============================================
// LAZY LOAD
// ============================================
function initLazyLoadCatCards(containerEl) {
    const cards = containerEl.querySelectorAll('.vendor-cat-card[data-bg]');
    if (!cards.length) return;
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const card = entry.target;
            const url = card.dataset.bg;
            const img = new Image();
            img.onload = () => {
                card.style.backgroundImage = `url('${url}')`;
                card.classList.add('vendor-cat-card--loaded');
            };
            img.src = url;
            card.removeAttribute('data-bg');
            obs.unobserve(card);
        });
    }, { rootMargin: '150px 0px', threshold: 0.01 });
    cards.forEach(c => observer.observe(c));
}

function initLazyLoadImages(containerEl) {
    const imgs = (containerEl || document).querySelectorAll('img.lazy-img[data-src]');
    if (!imgs.length) return;

    const noImgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;

    function revelarImagen(img) {
        img.classList.remove('opacity-0');
        img.classList.add('opacity-100');
        const skeleton = img.closest('.relative')?.querySelector('.img-skeleton');
        if (skeleton) skeleton.style.display = 'none';
    }

    function manejarErrorImagen(img) {
        img.style.display = 'none';
        const skeleton = img.closest('.relative')?.querySelector('.img-skeleton');
        if (skeleton) {
            skeleton.innerHTML = noImgSvg;
            skeleton.classList.remove('animate-pulse');
            skeleton.classList.add('flex', 'items-center', 'justify-center', 'bg-gray-800');
        }
    }

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const img = entry.target;
            img.onerror = () => manejarErrorImagen(img);
            img.src = img.dataset.src;
            if (img.complete && img.naturalWidth > 0) {
                revelarImagen(img);
            } else {
                img.onload = () => revelarImagen(img);
            }
            img.removeAttribute('data-src');
            obs.unobserve(img);
        });
    }, { rootMargin: '150px 0px', threshold: 0.01 });

    imgs.forEach(img => {
        if (img.complete && img.naturalWidth > 0) {
            revelarImagen(img);
        } else {
            observer.observe(img);
        }
    });
}

// ============================================
// CATALOG HELPERS — quick add/remove, badges, subcat, toggle vista
// ============================================

function _quickAddProd(prod) {
    const presActivas = (prod.presentaciones || []).filter(p => p.activo !== false);
    if (presActivas.length === 1) {
        const pres = presActivas[0];
        const precio = typeof obtenerPrecio === 'function' ? obtenerPrecio(prod.id, pres) : pres.precio_base;
        const existente = carrito.findIndex(item => item.productoId === prod.id && item.presentacion === pres.tamano);
        if (existente >= 0) {
            carrito[existente].cantidad++;
            carrito[existente].subtotal = carrito[existente].cantidad * carrito[existente].precio;
        } else {
            carrito.push({ productoId: prod.id, nombre: prod.nombre, presentacion: pres.tamano,
                precio, cantidad: 1, subtotal: precio,
                precioEspecial: precio !== pres.precio_base, tipo_impuesto: prod.tipo_impuesto || '10' });
        }
        if (typeof actualizarContadorCarrito === 'function') actualizarContadorCarrito();
        if (typeof guardarCarrito === 'function') guardarCarrito();
    } else {
        mostrarDetalleProducto(prod);
    }
}

function _quickRemoveProd(prod) {
    let idx;
    if (typeof carrito.findLastIndex === 'function') {
        idx = carrito.findLastIndex(item => item.productoId === prod.id);
    } else {
        const revIdx = [...carrito].reverse().findIndex(item => item.productoId === prod.id);
        idx = revIdx >= 0 ? carrito.length - 1 - revIdx : -1;
    }
    if (idx < 0) return;
    if (carrito[idx].cantidad > 1) {
        carrito[idx].cantidad--;
        carrito[idx].subtotal = carrito[idx].cantidad * carrito[idx].precio;
    } else {
        carrito.splice(idx, 1);
    }
    if (typeof actualizarContadorCarrito === 'function') actualizarContadorCarrito();
    if (typeof guardarCarrito === 'function') guardarCarrito();
}

function _actualizarBadgesCarritoEnCatalogo() {
    const qtyMap = {};
    (carrito || []).forEach(item => { qtyMap[item.productoId] = (qtyMap[item.productoId] || 0) + item.cantidad; });

    // Grid cards
    document.querySelectorAll('.vpc[data-prod-id]').forEach(card => {
        const qty = qtyMap[card.dataset.prodId] || 0;
        const badge = card.querySelector('.vpc-badge');
        const minus = card.querySelector('.vpc-minus');
        const qtyNum = card.querySelector('.vpc-qty-num');
        if (badge) { badge.textContent = qty; badge.style.display = qty > 0 ? 'flex' : 'none'; }
        if (minus) minus.style.display = qty > 0 ? 'flex' : 'none';
        if (qtyNum) { qtyNum.textContent = qty; qtyNum.style.display = qty > 0 ? 'flex' : 'none'; }
    });

    // List items
    document.querySelectorAll('.vpc-list-item[data-prod-id]').forEach(row => {
        const qty = qtyMap[row.dataset.prodId] || 0;
        const minus = row.querySelector('.vpc-minus');
        const qtyEl = row.querySelector('.vpc-list-qty');
        if (minus) minus.style.display = qty > 0 ? 'flex' : 'none';
        if (qtyEl) { qtyEl.textContent = qty; qtyEl.style.display = qty > 0 ? 'flex' : 'none'; }
    });
}

function _setSubcat(s) {
    _subcatSeleccionada = s;
    if (typeof mostrarProductos === 'function') mostrarProductos();
}

function _toggleVistaCatalogo() {
    _vistaProductos = _vistaProductos === 'grid' ? 'list' : 'grid';
    if (typeof mostrarProductos === 'function') mostrarProductos();
}

// ============================================
// DETALLE DE PRODUCTO (Modal inline)
// ============================================
function mostrarDetalleProducto(producto) {
    if (producto.presentaciones && producto.presentaciones.length >= 6) {
        mostrarMatrizProducto(producto);
        return;
    }
    mostrarDetalleMasivo(producto);
}

// ============================================
// MODO MATRIZ - Carga rapida tipo Excel (6+ presentaciones)
// ============================================
function mostrarMatrizProducto(producto) {
    const existing = document.getElementById('productDetailModal');
    if (existing) existing.remove();

    const iconHtml = (producto.imagen_url || producto.imagen) ? `<img src="${producto.imagen_url || producto.imagen}" class="w-10 h-10 rounded-lg object-contain">` : '<i data-lucide="package" class="w-8 h-8 text-gray-400"></i>';
    const catNombre = categorias.find(c => c.id === producto.categoria)?.nombre || '';

    const celdas = producto.presentaciones.filter(p => p.activo !== false).map((pres, idx) => {
        const precio = obtenerPrecio(producto.id, pres);
        const estadoProd = producto.estado || 'disponible';
        const esAgotado = estadoProd === 'agotado';
        return `
            <div class="matriz-celda bg-white rounded-xl border-2 border-gray-200 p-3 text-center transition-all ${esAgotado ? 'opacity-50' : ''}" id="celda-${producto.id}-${idx}">
                <p class="text-xs font-bold text-gray-500 mb-1">${escapeHTML(pres.tamano)}</p>
                <sl-input type="number" id="mtz-${producto.id}-${idx}" value="0" min="0"
                    ${esAgotado ? 'disabled' : ''}
                    class="mtz-input"
                    data-idx="${idx}" data-precio="${precio}" no-spin-buttons
                    oninput="actualizarCeldaMatriz('${producto.id}',${idx})"></sl-input>
                <p class="text-[10px] text-blue-600 font-bold mt-1">${formatearGuaranies(precio)}</p>
            </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'productDetailModal';
    modal.className = 'fixed inset-0 bg-black/50 z-[100] flex items-end';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="bg-white w-full rounded-t-3xl max-h-[90vh] overflow-y-auto shadow-2xl" onclick="event.stopPropagation()">
            <div class="border-b border-slate-100 p-4 rounded-t-3xl">
                <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-3"></div>
                <div class="flex items-center gap-3">
                    ${iconHtml}
                    <div>
                        <h3 class="text-lg font-bold text-slate-900">${escapeHTML(producto.nombre)}</h3>
                        <p class="text-xs text-slate-400">${escapeHTML(catNombre)} › ${escapeHTML(producto.subcategoria)}</p>
                    </div>
                </div>
                <div class="flex items-center justify-between mt-3 bg-indigo-50 rounded-xl p-3">
                    <div class="text-center">
                        <p class="text-2xl font-bold text-indigo-700" id="mtzTotalPares-${producto.id}">0</p>
                        <p class="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">PARES</p>
                    </div>
                    <div class="text-center">
                        <p class="text-lg font-bold text-indigo-700" id="mtzTotalGs-${producto.id}">Gs. 0</p>
                        <p class="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">TOTAL</p>
                    </div>
                    <sl-button onclick="limpiarMatriz('${producto.id}')" variant="default" size="small">Limpiar</sl-button>
                </div>
            </div>

            <div class="p-4">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Ingresá la cantidad por variante</p>
                <div class="grid grid-cols-3 gap-3" id="matrizGrid-${producto.id}">
                    ${celdas}
                </div>
            </div>

            <div class="sticky bottom-0 bg-white border-t border-slate-100 p-4 flex gap-3">
                <sl-button onclick="document.getElementById('productDetailModal').remove()" variant="default" class="flex-1">Cancelar</sl-button>
                <sl-button onclick="agregarMatrizAlCarrito('${producto.id}')" variant="primary" class="flex-1">
                    Agregar <span id="mtzBtnCount-${producto.id}">0</span> pares
                </sl-button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    lucide.createIcons();

    setTimeout(() => {
        const primerInput = document.getElementById(`mtz-${producto.id}-0`);
        if (primerInput) primerInput.focus();
    }, 300);
}

function actualizarCeldaMatriz(productoId, idx) {
    const input = document.getElementById(`mtz-${productoId}-${idx}`);
    const celda = document.getElementById(`celda-${productoId}-${idx}`);
    const val = parseInt(input.value) || 0;

    if (val > 0) {
        celda.className = 'matriz-celda bg-green-50 rounded-xl border-2 border-green-400 p-3 text-center transition-all';
    } else {
        celda.className = 'matriz-celda bg-white rounded-xl border-2 border-gray-200 p-3 text-center transition-all';
    }

    recalcularTotalesMatriz(productoId);
}

function recalcularTotalesMatriz(productoId) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    let totalPares = 0;
    let totalGs = 0;
    const presActivas = producto.presentaciones.filter(p => p.activo !== false);

    presActivas.forEach((pres, idx) => {
        const input = document.getElementById(`mtz-${productoId}-${idx}`);
        if (!input) return;
        const cant = parseInt(input.value) || 0;
        if (cant > 0) {
            totalPares += cant;
            totalGs += cant * parseFloat(input.dataset.precio);
        }
    });

    const elPares = document.getElementById(`mtzTotalPares-${productoId}`);
    const elGs = document.getElementById(`mtzTotalGs-${productoId}`);
    const elBtn = document.getElementById(`mtzBtnCount-${productoId}`);

    if (elPares) elPares.textContent = totalPares;
    if (elGs) elGs.textContent = formatearGuaranies(totalGs);
    if (elBtn) elBtn.textContent = totalPares;
}

function limpiarMatriz(productoId) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;
    const presActivas = producto.presentaciones.filter(p => p.activo !== false);

    presActivas.forEach((pres, idx) => {
        const input = document.getElementById(`mtz-${productoId}-${idx}`);
        if (input) {
            input.value = 0;
            actualizarCeldaMatriz(productoId, idx);
        }
    });
}

// ============================================
// MODO MASIVO - Todas las presentaciones a la vez (2-5 presentaciones)
// ============================================
function mostrarDetalleMasivo(producto) {
    const existing = document.getElementById('productDetailModal');
    if (existing) existing.remove();

    const catNombre = categorias.find(c => c.id === producto.categoria)?.nombre || '';

    const imgUrlMasivo = producto.imagen_url || producto.imagen;
    const imgContent = imgUrlMasivo
        ? `<img src="${imgUrlMasivo}" class="w-full h-full object-contain" onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden');this.nextElementSibling.classList.add('flex')">
           <span class="hidden items-center justify-center w-full h-full"><i data-lucide="package" class="w-12 h-12 text-gray-300"></i></span>`
        : `<span class="flex items-center justify-center w-full h-full"><i data-lucide="package" class="w-12 h-12 text-gray-300"></i></span>`;

    const presHTML = producto.presentaciones.map((pres, idx) => {
        const precio = obtenerPrecio(producto.id, pres);
        const activo = pres.activo !== false;
        if (!activo) return '';
        return `
            <div class="flex items-center justify-between py-3 px-4">
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-gray-800">${escapeHTML(pres.tamano)}</p>
                    <p class="text-blue-600 font-bold text-sm">${formatearGuaranies(precio)}</p>
                </div>
                <div class="flex items-center gap-2">
                    <sl-button onclick="ajustarQty('${producto.id}',${idx},-1)" variant="default" size="small" circle>-</sl-button>
                    <sl-input type="number" id="qty-${producto.id}-${idx}" value="0" min="0" data-precio="${precio}"
                        class="masivo-input" style="width:3.5rem;"
                        size="small" no-spin-buttons
                        oninput="recalcularTotalMasivo('${producto.id}')"></sl-input>
                    <sl-button onclick="ajustarQty('${producto.id}',${idx},1)" variant="default" size="small" circle>+</sl-button>
                </div>
            </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'productDetailModal';
    modal.className = 'fixed inset-0 bg-black/50 z-[100] flex items-end';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="bg-white w-full rounded-t-3xl max-h-[90vh] overflow-y-auto shadow-2xl" onclick="event.stopPropagation()">
            <div class="border-b border-slate-100 p-4 rounded-t-3xl">
                <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-3"></div>
                <div class="flex items-center gap-3">
                    ${imgUrlMasivo ? `<img src="${imgUrlMasivo}" class="w-12 h-12 rounded-xl object-contain bg-slate-100 p-1">` : '<i data-lucide="package" class="w-10 h-10 text-slate-300"></i>'}
                    <div class="min-w-0 flex-1">
                        <h3 class="text-lg font-bold text-slate-900 leading-tight truncate">${escapeHTML(producto.nombre)}</h3>
                        <p class="text-xs text-slate-400">${escapeHTML(catNombre)}${producto.subcategoria ? ' › ' + escapeHTML(producto.subcategoria) : ''}</p>
                    </div>
                </div>
                <div class="flex items-center justify-between mt-3 bg-indigo-50 rounded-xl p-3">
                    <div>
                        <p class="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">TOTAL</p>
                        <p class="text-lg font-bold text-indigo-700" id="masivoTotal-${producto.id}">Gs. 0</p>
                    </div>
                    <p class="text-sm font-semibold text-slate-400"><span id="masivoItems-${producto.id}">0</span> items</p>
                </div>
            </div>

            <div class="p-4">
                <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Seleccioná variantes</p>
                <div class="bg-white rounded-xl divide-y divide-slate-100 shadow-sm border border-slate-100">${presHTML}</div>
            </div>

            <div class="sticky bottom-0 bg-white border-t border-slate-100 p-4 flex gap-3">
                <sl-button onclick="document.getElementById('productDetailModal').remove()" variant="default" class="flex-1">Cancelar</sl-button>
                <sl-button onclick="agregarMasivoAlCarrito('${producto.id}')" variant="primary" class="flex-1">Agregar al carrito</sl-button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    lucide.createIcons();
}

function recalcularTotalMasivo(productoId) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    let totalItems = 0;
    let totalGs = 0;

    producto.presentaciones.forEach((pres, idx) => {
        const input = document.getElementById(`qty-${productoId}-${idx}`);
        if (!input) return;
        const cant = parseInt(input.value) || 0;
        if (cant > 0) {
            totalItems += cant;
            totalGs += cant * parseFloat(input.dataset.precio);
        }
    });

    const elTotal = document.getElementById(`masivoTotal-${productoId}`);
    const elItems = document.getElementById(`masivoItems-${productoId}`);
    if (elTotal) elTotal.textContent = formatearGuaranies(totalGs);
    if (elItems) elItems.textContent = totalItems;
}

function ajustarQty(prodId, idx, delta) {
    const input = document.getElementById(`qty-${prodId}-${idx}`);
    if (!input) return;
    let val = parseInt(input.value) || 0;
    val = Math.max(0, val + delta);
    input.value = val;
    recalcularTotalMasivo(prodId);
}

// ============================================
// MODAL CARRITO UI
// ============================================
function mostrarModalCarrito() {
    if (carrito.length === 0) {
        mostrarExito('El carrito esta vacio');
        return;
    }

    document.getElementById('cartDrawer').show();
    renderizarCarrito();
    lucide.createIcons();
}

function closeCartModal() {
    document.getElementById('cartDrawer').hide();
}

async function renderizarCarrito() {
    const container = document.getElementById('cartItemsList');
    container.innerHTML = '';

    const drawerCount = document.getElementById('drawerCartCount');
    if (drawerCount) drawerCount.textContent = carrito.length;

    carrito.forEach((item, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'relative overflow-hidden rounded-xl';
        wrapper.innerHTML = `
            <div class="absolute inset-y-0 right-0 w-16 bg-red-500 flex items-center justify-center text-white rounded-r-xl">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </div>
            <div class="cart-item-inner relative bg-gray-50 p-3 transition-transform rounded-xl" style="touch-action: pan-y;" data-idx="${idx}">
                <div class="flex justify-between items-center gap-2">
                    <div class="flex-1 min-w-0">
                        <p class="font-semibold text-gray-800 text-sm truncate">${escapeHTML(item.nombre)}${item.precioEspecial ? ' <span class="inline-block bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 align-middle">P.Esp</span>' : ''}</p>
                        <p class="text-xs text-gray-500">${escapeHTML(item.presentacion)} · ${formatearGuaranies(item.precio)} c/u</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <sl-icon-button name="dash-lg" label="Menos" onclick="cambiarCantidadCarrito(${idx},-1)" class="cart-qty-btn"></sl-icon-button>
                        <span class="font-bold text-base w-8 text-center">${item.cantidad}</span>
                        <sl-icon-button name="plus-lg" label="Mas" onclick="cambiarCantidadCarrito(${idx},1)" class="cart-qty-btn"></sl-icon-button>
                        <p class="font-bold text-gray-900 ml-1 text-sm text-right whitespace-nowrap">${formatearGuaranies(item.subtotal)}</p>
                    </div>
                </div>
            </div>`;
        // Swipe to delete
        const inner = wrapper.querySelector('.cart-item-inner');
        let startX = 0, currentX = 0;
        inner.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
        inner.addEventListener('touchmove', e => {
            currentX = e.touches[0].clientX - startX;
            if (currentX < 0) inner.style.transform = `translateX(${Math.max(currentX, -64)}px)`;
        }, { passive: true });
        inner.addEventListener('touchend', () => {
            if (currentX < -40) { eliminarDelCarrito(idx); }
            else { inner.style.transform = ''; }
            currentX = 0;
        });
        container.appendChild(wrapper);
    });
    lucide.createIcons();

    // Total
    const total = carrito.reduce((s, i) => s + i.subtotal, 0);
    const totalSection = document.getElementById('totalSection');
    totalSection.classList.remove('hidden');
    // Aplicar promociones
    let promoHTML = '';
    let descuentoPromo = 0;
    if (typeof aplicarPromociones === 'function') {
        const resultPromo = await aplicarPromociones(carrito);
        descuentoPromo = resultPromo.descuentoTotal;
        promoHTML = typeof mostrarResumenPromociones === 'function' ? mostrarResumenPromociones(resultPromo) : '';
    }
    const totalConPromo = total - descuentoPromo;

    totalSection.innerHTML = `
        <div class="flex justify-between items-center">
            <span class="text-gray-500 font-bold">SUBTOTAL</span>
            <span class="text-xl font-bold text-gray-900" id="cartSubtotal">${formatearGuaranies(total)}</span>
        </div>
        ${descuentoPromo > 0 ? `<div class="flex justify-between items-center text-green-600">
            <span class="font-bold">DESCUENTO PROMO</span>
            <span class="font-bold">-${formatearGuaranies(descuentoPromo)}</span>
        </div>` : ''}
        <div class="flex justify-between items-center" id="cartTotalFinal">
            <span class="text-gray-500 font-bold">TOTAL</span>
            <span class="text-2xl font-bold text-gray-900">${formatearGuaranies(totalConPromo)}</span>
        </div>
        ${promoHTML}
    `;
}

// ============================================
// VISTA MIS PEDIDOS
// ============================================
// ============================================
// PEDIDOS — ESTADO UI (usa obtenerEstadoUI de constants.js, intensidad 700)
// ============================================
const _WA_SVG_VENDEDOR = `<svg viewBox="0 0 24 24" fill="white" class="w-3.5 h-3.5 pointer-events-none" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`;

function crearTarjetaPedidoVendedor(p) {
    const estado = p.estado || PEDIDO_ESTADOS.PENDIENTE;
    const { clases: colorEstado, label: labelEstado } = obtenerEstadoUI(estado, '700');
    const esPendiente = estado === PEDIDO_ESTADOS.PENDIENTE || estado === 'pendiente';

    const items = p.items || [];
    const MAX_PREVIEW = 3;
    const itemsPreview = items.slice(0, MAX_PREVIEW);
    const itemsRestantes = items.length - MAX_PREVIEW;
    const numPed = formatNumPedido(p);

    const itemsPreviewHTML = itemsPreview.map(i => `
        <div class="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
            <span class="text-xs text-gray-600 truncate mr-2">${escapeHTML(i.nombre)} <span class="text-gray-400">(${escapeHTML(i.presentacion)}) ×${i.cantidad}</span></span>
            <span class="text-xs font-medium text-gray-700 shrink-0">${formatearGuaranies(i.subtotal)}</span>
        </div>`).join('');

    const div = document.createElement('div');
    div.className = 'bg-white rounded-xl shadow-sm border border-gray-100 mb-2 overflow-hidden transition-all duration-300';
    div.setAttribute('data-pedido-id', p.id);
    div.innerHTML = `
        <div class="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
             data-action="toggle-pedido-accordion-vendedor" data-arg="${p.id}">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <span class="font-semibold text-sm text-gray-800 truncate">${escapeHTML(p.cliente?.nombre || 'N/A')}</span>
                    <span class="pedido-estado-badge px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${colorEstado}">${labelEstado}</span>
                </div>
                <div class="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                    ${new Date(p.fecha).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
                    ${numPed ? `<span>·</span><span class="font-mono">#${numPed}</span>` : ''}
                    <span>·</span><span>${items.length} art.</span>
                </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-sm font-bold text-gray-900">${formatearGuaranies(p.total)}</span>
                <button data-action="compartirPedidoWA" data-arg="${p.id}"
                    class="w-7 h-7 rounded-full bg-green-500 hover:bg-green-600 active:bg-green-700 flex items-center justify-center transition-colors" title="WhatsApp">
                    ${_WA_SVG_VENDEDOR}
                </button>
                <button data-action="generarPDFVendedor" data-arg="${p.id}"
                    class="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors" title="PDF Recibo">
                    <i data-lucide="file-text" class="w-3.5 h-3.5 pointer-events-none"></i>
                </button>
                <span class="w-5 h-5 flex items-center justify-center text-gray-300">
                    <i data-lucide="chevron-down" class="w-3.5 h-3.5 pedido-chevron-icon pointer-events-none" style="transition:transform 0.22s ease;"></i>
                </span>
            </div>
        </div>
        <div class="pedido-accordion-body">
            <div class="px-4 pb-3">
                <div class="bg-gray-50 rounded-lg overflow-hidden mb-3">
                    <div class="px-3 pt-2 pb-1">${itemsPreviewHTML}</div>
                    <div class="px-3 py-1.5 flex items-center justify-between border-t border-gray-100">
                        ${itemsRestantes > 0
                            ? `<span class="text-[10px] text-gray-400">+${itemsRestantes} artículo${itemsRestantes > 1 ? 's' : ''} más</span>`
                            : '<span></span>'}
                        <button data-action="ver-pedido-completo-vendedor" data-arg="${p.id}"
                            class="text-[11px] text-indigo-600 font-medium flex items-center gap-1 transition-colors">
                            Ver completo <i data-lucide="external-link" class="w-3 h-3 pointer-events-none"></i>
                        </button>
                    </div>
                    <div class="px-3 py-1.5 bg-white border-t border-gray-200 flex justify-between items-center">
                        <span class="text-[11px] text-gray-400">${escapeHTML(p.tipoPago || 'contado')}</span>
                        <span class="text-sm font-bold text-gray-900">${formatearGuaranies(p.total)}</span>
                    </div>
                </div>
                ${esPendiente ? `
                <button data-action="abrirModalEntrega" data-arg="${p.id}"
                    class="w-full bg-indigo-600 active:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors">
                    <i data-lucide="truck" class="w-3.5 h-3.5 pointer-events-none"></i> Entregar
                </button>` : ''}
            </div>
        </div>`;
    return div;
}

function actualizarTarjetaPedidoDOM(pedidoId, nuevoEstado) {
    const card = document.querySelector(`[data-pedido-id="${pedidoId}"]`);
    if (!card) return false;

    const badge = card.querySelector('.pedido-estado-badge');
    if (badge) {
        // Limpiar clases de color anteriores
        const { clases, label } = obtenerEstadoUI(nuevoEstado, '700');
        badge.className = 'pedido-estado-badge px-2 py-1 rounded-full text-[10px] font-bold ' + clases;
        badge.textContent = label;

        // Animacion de flash para destacar el cambio
        card.classList.add('ring-2', 'ring-blue-400');
        setTimeout(() => card.classList.remove('ring-2', 'ring-blue-400'), TIEMPOS.SYNC_DELAY_ONLINE_MS);
    }
    return true;
}

function eliminarTarjetaPedidoDOM(pedidoId) {
    const card = document.querySelector(`[data-pedido-id="${pedidoId}"]`);
    if (!card) return;

    card.style.opacity = '0';
    card.style.transform = 'translateX(-100%)';
    setTimeout(() => card.remove(), TIEMPOS.DEBOUNCE_BUSQUEDA_MS);
}

// --- Estado de la vista Mis Pedidos ---
// Catalog state
let _subcatSeleccionada = null;
let _vistaProductos = 'grid'; // 'grid' | 'list'

let _pedidosFiltro = 'semana'; // 'hoy' | 'ayer' | 'semana' | 'todo'
let _pedidosPagina = 1;
const _PEDIDOS_POR_PAGINA = 50;

function _labelFiltroPedidos(f) {
    return { hoy: 'Hoy', ayer: 'Ayer', semana: 'Esta semana', todo: 'Todos' }[f] || f;
}

function _filtrarPedidosPorPeriodo(pedidos, filtro) {
    const hoy = new Date().toISOString().split('T')[0];
    const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const lunes = new Date();
    const dow = lunes.getDay();
    lunes.setDate(lunes.getDate() - (dow === 0 ? 6 : dow - 1));
    const inicioSemana = lunes.toISOString().split('T')[0];
    switch (filtro) {
        case 'hoy':    return pedidos.filter(p => (p.fecha || '').startsWith(hoy));
        case 'ayer':   return pedidos.filter(p => (p.fecha || '').startsWith(ayer));
        case 'semana': return pedidos.filter(p => (p.fecha || '').slice(0, 10) >= inicioSemana);
        default:       return pedidos;
    }
}

function _setPedidosFiltro(filtro) {
    _pedidosFiltro = filtro;
    _pedidosPagina = 1;
    mostrarMisPedidos();
}

function _setPedidosPagina(n) {
    _pedidosPagina = parseInt(n) || 1;
    mostrarMisPedidos();
}

function _togglePedidosFiltroDropdown() {
    const dd = document.getElementById('pedidosFiltroDropdown');
    if (dd) dd.classList.toggle('hidden');
}

async function mostrarMisPedidos() {
    const container = document.getElementById('productsContainer');
    const todos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    // Invariante "un número, un solo lugar": los pedidos ENTREGADOS viven en Créditos,
    // no en Mis Pedidos. Acá quedan los pendientes (activos) y los finalizados (historial).
    const visibles = todos.filter(p => p.estado !== PEDIDO_ESTADOS.ENTREGADO);
    const ordenados = [...visibles].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const filtrados = _filtrarPedidosPorPeriodo(ordenados, _pedidosFiltro);

    const total = filtrados.length;
    const totalPags = Math.max(1, Math.ceil(total / _PEDIDOS_POR_PAGINA));
    _pedidosPagina = Math.min(_pedidosPagina, totalPags);
    const desde = (_pedidosPagina - 1) * _PEDIDOS_POR_PAGINA;
    const pagina = filtrados.slice(desde, desde + _PEDIDOS_POR_PAGINA);

    const opcionesFiltro = ['hoy', 'ayer', 'semana', 'todo'].map(f => `
        <button data-action="setPedidosFiltro" data-arg="${f}"
            class="w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors ${_pedidosFiltro === f ? 'text-indigo-600 bg-indigo-50' : 'text-slate-700 hover:bg-slate-50'}">
            ${_labelFiltroPedidos(f)}
        </button>`).join('');

    let paginacionHtml = '';
    if (totalPags > 1) {
        const btns = [];
        for (let i = 1; i <= totalPags; i++) {
            btns.push(`<button data-action="setPedidosPagina" data-arg="${i}"
                class="w-8 h-8 rounded-lg text-xs font-bold ${i === _pedidosPagina ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
                ${i}</button>`);
        }
        paginacionHtml = `<div class="flex items-center justify-center gap-1 mt-4 pb-2">
            ${_pedidosPagina > 1 ? `<button data-action="setPedidosPagina" data-arg="${_pedidosPagina - 1}" class="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm font-bold">←</button>` : ''}
            ${btns.join('')}
            ${_pedidosPagina < totalPags ? `<button data-action="setPedidosPagina" data-arg="${_pedidosPagina + 1}" class="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm font-bold">→</button>` : ''}
        </div>`;
    }

    const subtitulo = total === 0 ? 'Sin pedidos' : `${desde + 1}–${Math.min(desde + _PEDIDOS_POR_PAGINA, total)} de ${total}`;

    container.innerHTML = `
        <div class="flex items-start justify-between mb-4">
            <div>
                <h3 class="text-lg font-bold text-gray-800">Mis Pedidos</h3>
                <p class="text-xs text-gray-400">${subtitulo}</p>
            </div>
            <div class="relative">
                <button data-action="togglePedidosFiltroDropdown"
                    class="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors">
                    <i data-lucide="calendar" class="w-3.5 h-3.5"></i>
                    <span>${_labelFiltroPedidos(_pedidosFiltro)}</span>
                    <i data-lucide="chevron-down" class="w-3 h-3"></i>
                </button>
                <div id="pedidosFiltroDropdown"
                    class="hidden absolute right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 overflow-hidden z-50 min-w-[150px]"
                    style="box-shadow:0 8px 24px rgba(0,0,0,0.12);">
                    ${opcionesFiltro}
                </div>
            </div>
        </div>
        <div id="pedidosListaContainer"></div>
        ${paginacionHtml}
    `;

    const listaEl = document.getElementById('pedidosListaContainer');
    if (total === 0) {
        const msg = { hoy: 'Sin pedidos hoy', ayer: 'Sin pedidos ayer', semana: 'Sin pedidos esta semana', todo: 'No hay pedidos registrados' }[_pedidosFiltro] || 'Sin pedidos';
        listaEl.innerHTML = generarEmptyState(SVG_EMPTY_ORDERS, msg, 'Los pedidos que realices apareceran aqui', 'Ir al catalogo', "cambiarVistaVendedor('lista')");
    } else {
        pagina.forEach(p => listaEl.appendChild(crearTarjetaPedidoVendedor(p)));
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
    if (typeof window._hdvRestoreVendedorAccordion === 'function') window._hdvRestoreVendedorAccordion();
}

// Toast, confirm, and input modals are in js/utils/dialogs.js (shared)

// ============================================
// CREDITOS PENDIENTES UI
// ============================================

function _agingCreditoBadge(fechaPedido) {
    const dias = Math.floor((Date.now() - new Date(fechaPedido)) / 86400000);
    if (dias <= 14)  return { texto: `${dias}d`,         clase: 'bg-green-100 text-green-700' };
    if (dias <= 30)  return { texto: `${dias}d ⚠`,       clase: 'bg-yellow-100 text-yellow-700' };
    if (dias <= 60)  return { texto: `${dias}d 🔴`,       clase: 'bg-red-100 text-red-700' };
    return            { texto: `${dias}d`,                clase: 'bg-red-200 text-red-900 font-black' };
}

async function _actualizarBadgeCreditos() {
    const badge = document.getElementById('sidebarCreditosBadge');
    if (!badge) return;
    const pedidos         = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pagos           = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
    const creditosManuales = (await HDVStorage.getItem('hdv_creditos_manuales', { clone: false })) || [];
    const excluir = new Set(['anulado', 'nota_credito_mock']);
    const deudores = new Set();

    pedidos.filter(p => p.tipoPago === 'credito' && !excluir.has(p.estado)).forEach(p => {
        const pagado = pagos.filter(pg => pg.pedidoId === p.id).reduce((s, pg) => s + (pg.monto || 0), 0);
        if (Math.max(0, (p.total || 0) - pagado) > 0 && p.cliente?.id) deudores.add(p.cliente.id);
    });
    creditosManuales.filter(c => !c.eliminado && !c.pagado).forEach(c => {
        const pagado = (c.pagos || []).reduce((s, p) => s + (p.monto || 0), 0);
        if (Math.max(0, (c.monto || 0) - pagado) > 0 && c.clienteId) deudores.add(c.clienteId);
    });

    const n = deudores.size;
    if (n > 0) {
        badge.textContent = n > 9 ? '9+' : String(n);
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

async function mostrarCreditos() {
    const container = document.getElementById('productsContainer');
    container.innerHTML = '<p class="text-center text-slate-400 py-8 text-sm">Cargando...</p>';

    const pedidos          = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pagos            = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
    const clientes_local   = typeof clientes !== 'undefined' ? clientes : [];

    // Agrupar por cliente
    const clientesMap = {};

    const _bucket = (cid, nombre, zona, fecha) => {
        if (!clientesMap[cid]) {
            clientesMap[cid] = { id: cid, nombre, zona, itemCount: 0, tieneManual: false, deudaTotal: 0, fechaMasAntigua: fecha };
        }
        if (fecha < clientesMap[cid].fechaMasAntigua) clientesMap[cid].fechaMasAntigua = fecha;
    };

    // Créditos del sistema = pedidos ENTREGADOS con saldo pendiente (por su número).
    // Los créditos manuales son recordatorios personales del dueño: el vendedor no los ve.
    pedidos.filter(p => p.estado === PEDIDO_ESTADOS.ENTREGADO).forEach(p => {
        const pagado = pagos.filter(pg => pg.pedidoId === p.id).reduce((s, pg) => s + (pg.monto || 0), 0);
        const saldo  = Math.max(0, (p.total || 0) - pagado);
        if (saldo <= 0 || !p.cliente?.id) return;
        const cid = p.cliente.id;
        const cli = clientes_local.find(c => c.id === cid);
        _bucket(cid, p.cliente.nombre || 'Sin nombre', cli?.zona || '', p.fecha);
        clientesMap[cid].deudaTotal += saldo;
        clientesMap[cid].itemCount++;
    });

    const deudores = Object.values(clientesMap).sort((a, b) => a.fechaMasAntigua.localeCompare(b.fechaMasAntigua));

    if (deudores.length === 0) {
        container.innerHTML = `
            <h3 class="text-lg font-bold text-gray-800 mb-4">Créditos Pendientes</h3>
            <div class="text-center py-12">
                <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i data-lucide="check-circle" class="w-8 h-8 text-green-500"></i>
                </div>
                <p class="font-bold text-gray-700">Todo al día</p>
                <p class="text-sm text-gray-400 mt-1">No hay créditos pendientes de cobro</p>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    const deudaGlobal = deudores.reduce((s, c) => s + c.deudaTotal, 0);

    const cards = deudores.map(c => {
        const aging = _agingCreditoBadge(c.fechaMasAntigua);
        const etiquetaItems = `${c.itemCount} ítem${c.itemCount !== 1 ? 's' : ''}${c.tieneManual ? ' · incluye manual' : ''}`;
        return `<div class="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-3">
            <div class="flex items-start justify-between mb-2">
                <div class="flex-1 min-w-0 mr-2">
                    <p class="font-bold text-gray-800 text-sm truncate">${escapeHTML(c.nombre)}</p>
                    <p class="text-xs text-slate-400 mt-0.5">${escapeHTML(c.zona)}${c.zona ? ' · ' : ''}${etiquetaItems}</p>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${aging.clase}">${aging.texto}</span>
            </div>
            <div class="flex items-center justify-between mt-1">
                <p class="text-lg font-bold text-red-600">${formatearGuaranies(c.deudaTotal)}</p>
                <sl-button data-action="abrirCobrosCliente" data-arg="${escapeHTML(c.id)}" variant="primary" size="small">
                    Cobrar
                </sl-button>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <h3 class="text-lg font-bold text-gray-800 mb-3">Créditos Pendientes</h3>
        <div class="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
            <div>
                <p class="text-xs font-bold text-red-700 uppercase tracking-wider mb-0.5">${deudores.length} cliente${deudores.length !== 1 ? 's' : ''} con deuda</p>
                <p class="text-2xl font-bold text-red-600">${formatearGuaranies(deudaGlobal)}</p>
            </div>
            <i data-lucide="alert-circle" class="w-8 h-8 text-red-300 shrink-0"></i>
        </div>
        ${cards}
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================
// HISTORIAL COMPLETO DEL CLIENTE
// ============================================
async function mostrarHistorialCliente(clienteId) {
    const cliente = clientes.find(c => c.id === clienteId);
    if (!cliente) return;

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];

    const pedidosCliente = pedidos
        .filter(p => p.cliente?.id === clienteId)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const totalPedidos = pedidosCliente.length;
    const ticketPromedio = totalPedidos > 0
        ? Math.round(pedidosCliente.reduce((s, p) => s + (p.total || 0), 0) / totalPedidos)
        : 0;

    let frecuenciaDias = 0;
    if (pedidosCliente.length > 1) {
        const fechas = pedidosCliente.map(p => new Date(p.fecha));
        let totalDiff = 0;
        for (let i = 0; i < fechas.length - 1; i++) totalDiff += (fechas[i] - fechas[i + 1]) / 86400000;
        frecuenciaDias = Math.round(totalDiff / (fechas.length - 1));
    }

    const creditos = pedidosCliente.filter(p => p.tipoPago === 'credito');
    let deudaTotal = 0;
    creditos.forEach(p => {
        const pagosP = allPagos.filter(pg => pg.pedidoId === p.id).reduce((s, pg) => s + (pg.monto || 0), 0);
        deudaTotal += Math.max(0, (p.total || 0) - pagosP);
    });

    const ultimoPedido = pedidosCliente[0];
    const frecuenciaStr = frecuenciaDias > 0 ? `c/${frecuenciaDias}d` : (totalPedidos === 1 ? '1 pedido' : '—');
    const deudaHtml = deudaTotal > 0
        ? `<span class="text-red-600 font-bold text-base">${formatearGuaranies(deudaTotal)}</span>`
        : `<span class="text-green-600 font-bold text-base">Al día</span>`;

    const listaPedidos = pedidosCliente.map(p => {
        const { clases: colorEst, label: labelEst } = obtenerEstadoUI(p.estado, '700');
        const fechaStr = new Date(p.fecha).toLocaleDateString('es-PY');
        const itemsHtml = (p.items || []).map(i =>
            `<div class="flex justify-between text-[11px] py-0.5 text-gray-600">
                <span>${escapeHTML(i.nombre)} ×${i.cantidad}</span>
                <span class="font-medium text-gray-800">${formatearGuaranies(i.subtotal)}</span>
            </div>`
        ).join('');
        return `<div class="bg-white border border-slate-100 rounded-xl p-3 mb-2 shadow-sm">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="text-[10px] font-mono text-gray-400">${escapeHTML(p.id)}</p>
                    <p class="text-xs text-gray-500">${fechaStr}</p>
                </div>
                <div class="text-right">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${colorEst}">${labelEst}</span>
                    <p class="font-bold text-gray-800 mt-0.5">${formatearGuaranies(p.total)}</p>
                </div>
            </div>
            <div class="border-t border-slate-50 pt-2 mb-2">${itemsHtml}</div>
            <div class="flex gap-2">
                <sl-button data-action="repetirUltimoPedido" data-arg="${p.id}" variant="default" size="small" class="flex-1">Pedir igual</sl-button>
                <sl-button data-action="compartirPedidoWA" data-arg="${p.id}" variant="success" size="small" class="flex-1">WhatsApp</sl-button>
            </div>
        </div>`;
    }).join('');

    const emptyState = totalPedidos === 0
        ? `<div class="empty-state"><p>Sin pedidos registrados</p><p class="empty-sub">Los pedidos de este cliente aparecerán aquí</p></div>`
        : '';

    let modal = document.getElementById('modalHistorialCliente');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalHistorialCliente';
        modal.style.cssText = 'position:fixed;inset:0;z-index:150;display:flex;flex-direction:column;background:white;transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.32,0.72,0,1);';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 border-b border-slate-100 bg-white sticky top-0 z-10">
            <button data-action="cerrarHistorialCliente" class="text-gray-400 hover:text-gray-600 p-1 -ml-1">
                <i data-lucide="arrow-left" class="w-5 h-5"></i>
            </button>
            <div class="flex-1">
                <p class="font-bold text-gray-800 text-sm">${escapeHTML(cliente.razon_social || cliente.nombre)}</p>
                <p class="text-[11px] text-gray-400">Historial de pedidos</p>
            </div>
        </div>
        <div class="grid grid-cols-3 bg-slate-50 border-b border-slate-100">
            <div class="text-center py-3">
                <p class="text-xl font-bold text-indigo-600">${totalPedidos}</p>
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">pedidos</p>
            </div>
            <div class="text-center py-3 border-x border-slate-200">
                <p class="text-xl font-bold text-indigo-600">${frecuenciaStr}</p>
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">frecuencia</p>
            </div>
            <div class="text-center py-3">
                ${deudaHtml}
                <p class="text-[10px] text-gray-400 uppercase tracking-wider">deuda</p>
            </div>
        </div>
        ${ultimoPedido ? `<div class="px-4 py-3 border-b border-slate-100">
            <sl-button data-action="repetirUltimoPedido" data-arg="${ultimoPedido.id}" variant="primary" class="w-full">
                Repetir último pedido (${(ultimoPedido.items || []).length} productos)
            </sl-button>
        </div>` : ''}
        <div class="flex-1 overflow-y-auto px-4 pt-4 pb-24">
            <p class="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Todos los pedidos (${totalPedidos})</p>
            ${listaPedidos}
            ${emptyState}
        </div>
    `;

    modal.style.transform = 'translateY(0)';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function cerrarHistorialCliente() {
    const modal = document.getElementById('modalHistorialCliente');
    if (modal) modal.style.transform = 'translateY(100%)';
}

// Dark mode permanente en app vendedor
document.body.classList.add('dark-mode');

// ============================================
// MODAL CLIENTE NUEVO DESDE VENDEDOR
// ============================================
function mostrarModalSinCliente() {
    let modal = document.getElementById('modalSinCliente');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalSinCliente';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:flex-end;';
        modal.innerHTML = `
            <div class="bg-white w-full rounded-t-3xl p-6 shadow-2xl pb-10" style="max-height:90vh;overflow-y:auto;">
                <div class="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6"></div>
                <h3 class="text-lg font-bold text-gray-900 mb-2">Sin cliente seleccionado</h3>
                <p class="text-sm text-gray-500 mb-6">¿Deseas agregar un nuevo cliente para continuar con el pedido?</p>
                <div id="modalSinClienteOpciones" class="space-y-3">
                    <sl-button onclick="mostrarFormNuevoCliente()" variant="neutral" class="w-full">
                        Agregar nuevo cliente
                    </sl-button>
                    <sl-button onclick="cerrarModalSinCliente()" variant="default" class="w-full">
                        Volver y seleccionar cliente
                    </sl-button>
                </div>
                <div id="formNuevoClienteVendedor" style="display:none;" class="space-y-3 mt-2">
                    <sl-input id="ncvNombre" label="NOMBRE *" placeholder="Nombre del cliente" required size="medium"></sl-input>
                    <sl-input id="ncvTelefono" label="TELEFONO *" placeholder="Ej: 0981234567" type="tel" required size="medium"></sl-input>
                    <sl-input id="ncvZona" label="ZONA *" placeholder="Ej: Loma Plata" required size="medium"></sl-input>
                    <sl-input id="ncvDireccion" label="DIRECCION (opcional)" placeholder="Ej: Calle San Martin 123" size="medium"></sl-input>
                    <sl-input id="ncvRuc" label="RUC (opcional)" placeholder="Ej: 80012345-6" size="medium"></sl-input>
                    <sl-input id="ncvEncargado" label="ENCARGADO (opcional)" placeholder="Ej: Juan Perez" size="medium"></sl-input>
                    <div class="flex gap-3 pt-2">
                        <sl-button onclick="cerrarModalSinCliente()" variant="default" size="large" class="flex-1">Cancelar</sl-button>
                        <sl-button onclick="guardarNuevoClienteDesdeVendedor()" variant="primary" size="large" class="flex-1">Enviar para aprobacion</sl-button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    document.getElementById('formNuevoClienteVendedor').style.display = 'none';
    document.getElementById('modalSinClienteOpciones').style.display = 'block';
}

function mostrarFormNuevoCliente() {
    document.getElementById('modalSinClienteOpciones').style.display = 'none';
    document.getElementById('formNuevoClienteVendedor').style.display = 'block';
}

function cerrarModalSinCliente() {
    const modal = document.getElementById('modalSinCliente');
    if (modal) modal.style.display = 'none';
}

// ============================================
// VISTA CONFIGURACION
// ============================================
async function mostrarConfiguracion() {
    const container = document.getElementById('productsContainer');
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const autoBackups = (await HDVStorage.getItem('hdv_auto_backups_meta', { clone: false })) || [];
    const ultimoBackup = await HDVStorage.getItem('hdv_ultimo_backup_fecha', { clone: false });

    const totalPedidos = pedidos.length;
    const pendientes = pedidos.filter(p => (p.estado || PEDIDO_ESTADOS.PENDIENTE) === PEDIDO_ESTADOS.PENDIENTE || p.estado === 'pendiente').length;
    const totalGs = pedidos.reduce((s, p) => s + (p.total || 0), 0);

    container.innerHTML = `
        <h3 class="text-lg font-bold text-gray-800 mb-4">Configuracion</h3>

        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Resumen de Datos</p>
            <div class="grid grid-cols-3 gap-3 text-center">
                <div class="bg-gray-50 rounded-lg p-3">
                    <p class="text-xl font-bold text-gray-800">${totalPedidos}</p>
                    <p class="text-[10px] text-gray-500 font-bold">PEDIDOS</p>
                </div>
                <div class="bg-yellow-50 rounded-lg p-3">
                    <p class="text-xl font-bold text-yellow-700">${pendientes}</p>
                    <p class="text-[10px] text-gray-500 font-bold">PENDIENTES</p>
                </div>
                <div class="bg-green-50 rounded-lg p-3">
                    <p class="text-lg font-bold text-green-700">Gs.${(totalGs/1000).toFixed(0)}k</p>
                    <p class="text-[10px] text-gray-500 font-bold">TOTAL</p>
                </div>
            </div>
        </div>

        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Estado de Backups</p>
            <p class="text-sm text-gray-700">${ultimoBackup ? 'Ultimo backup: ' + new Date(ultimoBackup).toLocaleString('es-PY') : 'Sin backups realizados'}</p>
            <p class="text-sm text-gray-500 mt-1">Auto-backups guardados: ${autoBackups.length}/10</p>
        </div>

        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Almacenamiento</p>
            <p class="text-sm text-gray-700" id="storageInfo">Calculando...</p>
        </div>

        <div class="bg-white rounded-xl p-4 shadow-sm border border-red-200 mb-3">
            <p class="text-xs font-bold text-red-500 uppercase tracking-wider mb-3">Zona de Peligro</p>
            <sl-button data-action="limpiarTodosDatos" variant="danger" class="w-full">Borrar Todos Mis Pedidos</sl-button>
        </div>

        <p class="text-center text-xs text-gray-400 mt-4">HDV Pedidos v3.0 - 2026</p>
    `;

    calcularAlmacenamiento();
}

async function calcularAlmacenamiento() {
    let totalBytes = 0;
    if (typeof HDVStorage.keys === 'function') {
        const allKeys = await HDVStorage.keys();
        for (const key of allKeys) {
            if (key.startsWith('hdv_')) {
                const val = await HDVStorage.getItem(key, { clone: false });
                totalBytes += JSON.stringify(val || '').length * 2;
            }
        }
    }
    const kb = (totalBytes / 1024).toFixed(1);
    const el = document.getElementById('storageInfo');
    if (el) el.textContent = `Usando ${kb} KB de almacenamiento`;
}

// ============================================
// ZONAS Y RUTAS UI
// ============================================
function mostrarFiltroZonas() {
    const container = document.getElementById('productsContainer');
    const zonas = obtenerZonasUnicas();

    let html = '<h3 class="text-lg font-bold text-gray-800 mb-4">Seleccionar Zona</h3>';

    html += `<sl-button onclick="resetearFiltroZona()" variant="neutral" class="w-full" style="margin-bottom:0.75rem;">
        Todas las Zonas (${clientes.length} clientes)
    </sl-button>`;

    html += '<div class="grid grid-cols-2 gap-3">';
    const colores = ['bg-blue-50 border-blue-200 text-blue-800', 'bg-green-50 border-green-200 text-green-800', 'bg-purple-50 border-purple-200 text-purple-800', 'bg-yellow-50 border-yellow-200 text-yellow-800', 'bg-red-50 border-red-200 text-red-800', 'bg-indigo-50 border-indigo-200 text-indigo-800'];
    zonas.forEach((z, i) => {
        const color = colores[i % colores.length];
        html += `<sl-button onclick="seleccionarZona('${z.zona}')" variant="default" class="${color} border-2 rounded-xl" style="width:100%;--sl-button-font-size-medium:0.875rem;">
            <div class="text-center py-1">
                <p class="mb-1"><i data-lucide="map-pin" class="w-8 h-8 text-gray-400 mx-auto"></i></p>
                <p class="font-bold">${escapeHTML(z.zona)}</p>
                <p class="text-xs opacity-70">${z.cantidad} clientes</p>
            </div>
        </sl-button>`;
    });
    html += '</div>';

    container.innerHTML = html;
}

function actualizarIndicadorZona(zona) {
    // Zone pills already show the active state — this is now a no-op placeholder
    // for any code that still calls it (e.g. realtime updates)
}

async function mostrarRutaHoy() {
    if (!zonaActiva) { mostrarFiltroZonas(); return; }
    const container = document.getElementById('productsContainer');
    const clientesZona = clientes.filter(c => c.zona && c.zona.trim() === zonaActiva);
    const pedidosHoy = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const hoy = new Date().toISOString().split('T')[0];

    let html = `<div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2"><i data-lucide="map-pin" class="w-5 h-5 text-gray-500"></i> ${escapeHTML(zonaActiva)}</h3>
        <sl-button onclick="mostrarFiltroZonas()" variant="text" size="small">Cambiar Zona</sl-button>
    </div>`;
    html += `<p class="text-sm text-gray-500 mb-4">${clientesZona.length} clientes en esta zona</p>`;

    if (clientesZona.length === 0) {
        html += generarEmptyState(SVG_EMPTY_SEARCH, 'No hay clientes en esta zona', 'Selecciona otra zona para continuar');
    } else {
        clientesZona.forEach((c, i) => {
            const tienePedidoHoy = pedidosHoy.some(p => p.cliente?.id === c.id && p.fecha && p.fecha.startsWith(hoy));
            const nombre = c.razon_social || c.nombre || c.id;
            html += `<div class="bg-white rounded-xl p-4 shadow-sm border ${tienePedidoHoy ? 'border-green-300 bg-green-50' : 'border-gray-100'} mb-3">
                <div class="flex justify-between items-start">
                    <div class="flex items-start gap-3">
                        <span class="bg-gray-800 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0">${i + 1}</span>
                        <div>
                            <p class="font-bold text-gray-800">${escapeHTML(nombre)}</p>
                            <p class="text-xs text-gray-500">${escapeHTML(c.direccion || c.zona || '')}</p>
                            ${c.telefono ? `<a href="tel:${escapeHTML(c.telefono)}" class="text-xs text-blue-600 font-bold inline-flex items-center gap-1"><i data-lucide="phone" class="w-3 h-3"></i> ${escapeHTML(c.telefono)}</a>` : ''}
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        ${tienePedidoHoy ? '<span class="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">PEDIDO HOY</span>' : ''}
                        <sl-button onclick="seleccionarClienteDesdeRuta('${c.id}')" variant="neutral" size="small">Seleccionar</sl-button>
                    </div>
                </div>
            </div>`;
        });
    }

    container.innerHTML = html;
}

// ============================================
// MI CAJA UI
// ============================================
let _vistaCajaModo = 'hoy'; // 'hoy' | 'semana'
let _diasExpanded = new Set();

function setCajaModo(modo) {
    _vistaCajaModo = modo;
    mostrarMiCaja();
}

function _toggleDiaJornada(fechaStr) {
    if (_diasExpanded.has(fechaStr)) {
        _diasExpanded.delete(fechaStr);
    } else {
        _diasExpanded.add(fechaStr);
    }
    mostrarMiCaja();
}

function _toggleCajaHTML() {
    return `<div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-gray-800">Mi Caja</h3>
        <div class="flex bg-slate-100 rounded-lg p-1 gap-1">
            <button data-action="setCajaModo" data-arg="hoy" class="px-3 py-1.5 rounded-md text-xs font-bold transition-all ${_vistaCajaModo === 'hoy' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}">Hoy</button>
            <button data-action="setCajaModo" data-arg="semana" class="px-3 py-1.5 rounded-md text-xs font-bold transition-all ${_vistaCajaModo === 'semana' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}">Esta semana</button>
        </div>
    </div>`;
}

async function mostrarMiCaja() {
    const container = document.getElementById('productsContainer');
    if (_vistaCajaModo === 'hoy') {
        await _renderResumenHoy(container);
    } else {
        await _renderResumenSemana(container);
    }
}

async function _renderResumenHoy(container) {
    const vendedorId = window.hdvUsuario?.id || null;
    const vendedorNombre = window.hdvUsuario?.nombre || 'Vendedor';
    const hoy = new Date().toISOString().split('T')[0];

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const gastos = (await HDVStorage.getItem('hdv_gastos', { clone: false })) || [];
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
    const metas = (await HDVStorage.getItem('hdv_metas', { clone: false })) || {};

    const pedidosHoy = pedidos.filter(p => p.fecha?.startsWith(hoy) && p.vendedor_id === vendedorId);
    // VENTAS = lo vendido hoy (todos los pedidos del día, sin importar el cobro)
    const ventasHoy = pedidosHoy.reduce((s, p) => s + (p.total || 0), 0);
    // COBRADO = caja real desde el libro unificado (única fuente: incluye contado y créditos)
    const cobrosHoy = allPagos
        .filter(pg => (pg.fecha || '').slice(0, 10) === hoy && (!pg.vendedor_id || pg.vendedor_id === vendedorId))
        .reduce((s, pg) => s + (Number(pg.monto) || 0), 0);
    const gastosHoy = gastos
        .filter(g => g.fecha?.startsWith(hoy) && g.vendedor_id === vendedorId)
        .reduce((s, g) => s + (g.monto || 0), 0);
    const totalVendido = ventasHoy;            // la meta se mide sobre lo vendido
    const netoRendir = cobrosHoy - gastosHoy;  // a rendir = caja (libro) − gastos

    const metaDiaria = metas.diaria || 0;
    const metaPct = metaDiaria > 0 ? Math.min(200, Math.round((totalVendido / metaDiaria) * 100)) : 0;
    const metaColor = metaPct >= 100 ? 'bg-green-500' : metaPct >= 70 ? 'bg-amber-400' : 'bg-red-400';
    const metaIcono = metaPct >= 100 ? '🟢' : metaPct >= 70 ? '🟡' : '🔴';

    const fechaLarga = new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' });

    const listaPedidosHoy = pedidosHoy.length > 0
        ? pedidosHoy.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).map(p => {
            const { clases: colorEst, label: labelEst } = obtenerEstadoUI(p.estado, '700');
            const hora = new Date(p.fecha).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
            return `<div class="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div class="flex items-center gap-2">
                    <span class="text-[10px] text-gray-400 w-10 shrink-0">${hora}</span>
                    <span class="text-sm font-medium text-gray-700 truncate max-w-[120px]">${escapeHTML(p.cliente?.nombre || 'N/A')}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${colorEst}">${labelEst}</span>
                    <span class="text-sm font-bold text-gray-800">${formatearGuaranies(p.total)}</span>
                </div>
            </div>`;
        }).join('')
        : `<p class="text-sm text-gray-400 text-center py-4">Sin pedidos por ahora</p>`;

    container.innerHTML = _toggleCajaHTML() + `
        <p class="text-xs text-gray-400 -mt-2 mb-4 capitalize">${fechaLarga}</p>

        ${metaDiaria > 0 ? `<div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 mb-3">
            <div class="flex justify-between items-center mb-2">
                <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">Meta del día</p>
                <span class="text-xs font-bold ${metaPct >= 100 ? 'text-green-600' : 'text-gray-600'}">${metaIcono} ${metaPct}%</span>
            </div>
            <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div class="${metaColor} h-2 rounded-full transition-all duration-700" style="width:${Math.min(100, metaPct)}%"></div>
            </div>
            <div class="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>${formatearGuaranies(totalVendido)}</span>
                <span>meta: ${formatearGuaranies(metaDiaria)}</span>
            </div>
        </div>` : ''}

        <div class="grid grid-cols-2 gap-2 mb-3">
            <div class="bg-indigo-50 rounded-xl p-3 text-center">
                <p class="text-xl font-bold text-indigo-600">${pedidosHoy.length}</p>
                <p class="text-[10px] text-gray-500 font-bold uppercase">PEDIDOS</p>
            </div>
            <div class="bg-green-50 rounded-xl p-3 text-center">
                <p class="text-base font-bold text-green-700">${formatearGuaranies(ventasHoy)}</p>
                <p class="text-[10px] text-gray-500 font-bold uppercase">VENTAS</p>
            </div>
            <div class="bg-amber-50 rounded-xl p-3 text-center">
                <p class="text-base font-bold text-amber-700">${formatearGuaranies(cobrosHoy)}</p>
                <p class="text-[10px] text-gray-500 font-bold uppercase">COBROS</p>
            </div>
            <div class="bg-red-50 rounded-xl p-3 text-center">
                <p class="text-base font-bold text-red-600">${formatearGuaranies(gastosHoy)}</p>
                <p class="text-[10px] text-gray-500 font-bold uppercase">GASTOS</p>
            </div>
        </div>

        <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-3 flex justify-between items-center">
            <div>
                <p class="text-xs font-bold text-blue-700 uppercase tracking-wider">A rendir hoy</p>
                <p class="text-2xl font-bold text-blue-800">${formatearGuaranies(netoRendir)}</p>
            </div>
            <i data-lucide="wallet" class="w-8 h-8 text-blue-300"></i>
        </div>

        <sl-button data-action="enviarCierreWA" data-arg="${JSON.stringify({ vendedor: vendedorNombre, ventas: ventasHoy, cobros: cobrosHoy, gastos: gastosHoy, pedidos: pedidosHoy.length, metaPct, aRendir: netoRendir })}" variant="default" class="w-full mb-3 sl-btn-whatsapp" style="--sl-color-neutral-600:#25D366;--sl-color-neutral-700:#1da851;">
            <i data-lucide="message-circle" class="w-4 h-4 mr-1"></i> Enviar cierre al jefe
        </sl-button>

        <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-100 mb-3">
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Pedidos de hoy (${pedidosHoy.length})</p>
            ${listaPedidosHoy}
        </div>

        <sl-button data-action="agregarGastoVendedor" variant="danger" size="small" class="w-full mb-3">+ Registrar Gasto</sl-button>
        <sl-button data-action="mostrarConfiguracion" variant="default" class="w-full">Configuracion y Backups</sl-button>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function _renderResumenSemana(container) {
    const semana = obtenerSemanaActualVendedor();
    const { inicio, fin } = obtenerRangoSemanaVendedor(semana);
    const vendedorId = window.hdvUsuario?.id || null;

    const pedidos     = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const allPagos    = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
    const gastos      = (await HDVStorage.getItem('hdv_gastos', { clone: false })) || [];
    const rendiciones = (await HDVStorage.getItem('hdv_rendiciones', { clone: false })) || [];

    const pedidosSemana = pedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= inicio && f <= fin && p.vendedor_id === vendedorId;
    });
    const pagosSemana = allPagos.filter(pg => {
        if (pg.vendedor_id && pg.vendedor_id !== vendedorId) return false;
        const f = new Date(pg.fecha);
        return f >= inicio && f <= fin;
    });
    const gastosSemana = gastos.filter(g => {
        const f = new Date(g.fecha);
        return f >= inicio && f <= fin && g.vendedor_id === vendedorId;
    });

    const totalVentas  = pedidosSemana.reduce((s, p) => s + (p.total || 0), 0);   // vendido
    const totalCobros  = pagosSemana.reduce((s, pg) => s + (pg.monto || 0), 0);   // caja (libro)
    const totalGastos  = gastosSemana.reduce((s, g) => s + (g.monto || 0), 0);
    const aRendir      = totalCobros - totalGastos;                               // caja − gastos
    const rendSemana   = rendiciones.find(r => r.semana === semana && r.vendedor_id === vendedorId);

    // Generar días de la semana desde lunes hasta hoy
    const dias = [];
    const cur = new Date(inicio);
    const hoyD = new Date();
    hoyD.setHours(23, 59, 59, 999);
    while (cur <= hoyD && cur <= fin) {
        dias.push(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 1);
    }

    const hoyStr  = new Date().toISOString().split('T')[0];
    const ayerStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const diasConActividad = dias.filter(d => {
        const pD  = pedidosSemana.some(p => (p.fecha || '').startsWith(d));
        const pgD = pagosSemana.some(pg => (pg.fecha || '').startsWith(d));
        return pD || pgD;
    }).reverse();

    const timelineHtml = diasConActividad.map(d => {
        const pDia  = pedidosSemana.filter(p => (p.fecha || '').startsWith(d)).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        const pgDia = pagosSemana.filter(pg => (pg.fecha || '').startsWith(d));
        const gDia  = gastosSemana.filter(g => (g.fecha || '').startsWith(d));

        const contDia   = pDia.filter(p => p.tipoPago === 'contado' && _esEstadoContadoVendedor(p.estado)).reduce((s, p) => s + (p.total || 0), 0);
        const credDia   = pDia.filter(p => p.tipoPago === 'credito').reduce((s, p) => s + (p.total || 0), 0);
        const cobrosDia = pgDia.reduce((s, pg) => s + (pg.monto || 0), 0);
        const gastosDia = gDia.reduce((s, g) => s + (g.monto || 0), 0);
        const totalDia  = contDia + credDia;

        const fechaObj = new Date(d + 'T12:00:00');
        const dLabel   = d === hoyStr ? 'Hoy' : d === ayerStr ? 'Ayer'
            : fechaObj.toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'short' });

        const expanded = _diasExpanded.has(d);

        const detalleItems = [
            ...pDia.map(p => {
                const hora = new Date(p.fecha).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
                const tipo = p.tipoPago === 'credito' ? '💳' : '💵';
                return `<div class="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] text-gray-400 w-10 shrink-0">${hora}</span>
                        <span class="text-[10px]">${tipo}</span>
                        <span class="text-xs font-medium text-gray-700 truncate max-w-[120px]">${escapeHTML(p.cliente?.nombre || 'N/A')}</span>
                    </div>
                    <span class="text-xs font-bold text-gray-800 shrink-0">${formatearGuaranies(p.total)}</span>
                </div>`;
            }),
            ...pgDia.map(pg => {
                const hora = new Date(pg.fecha).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
                return `<div class="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] text-gray-400 w-10 shrink-0">${hora}</span>
                        <span class="text-[10px]">🤝</span>
                        <span class="text-xs font-medium text-green-700 truncate max-w-[120px]">Cobro — ${escapeHTML(pg.clienteNombre || '')}</span>
                    </div>
                    <span class="text-xs font-bold text-green-700 shrink-0">+${formatearGuaranies(pg.monto)}</span>
                </div>`;
            })
        ].join('');

        const colCount = [contDia, credDia, cobrosDia, gastosDia].filter(v => v > 0).length || 2;

        return `<div class="bg-white rounded-xl border border-slate-100 shadow-sm mb-2 overflow-hidden">
            <button data-action="toggleDiaJornada" data-arg="${d}"
                class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors">
                <div>
                    <p class="text-xs font-bold text-gray-800 capitalize">${escapeHTML(dLabel)}</p>
                    <p class="text-[10px] text-slate-400 mt-0.5">
                        ${pDia.length} pedido${pDia.length !== 1 ? 's' : ''}${cobrosDia > 0 ? ` · ${pgDia.length} cobro${pgDia.length !== 1 ? 's' : ''}` : ''}
                    </p>
                </div>
                <div class="flex items-center gap-3">
                    <p class="text-sm font-bold text-gray-800">${formatearGuaranies(totalDia)}</p>
                    <i data-lucide="${expanded ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4 text-slate-400"></i>
                </div>
            </button>
            ${expanded ? `
            <div class="border-t border-slate-50 px-4 pt-1 pb-3">
                <div class="grid grid-cols-${Math.min(colCount, 4)} gap-1.5 mb-3 mt-2">
                    ${contDia > 0 ? `<div class="bg-green-50 rounded-lg p-2 text-center"><p class="text-xs font-bold text-green-700">${formatearGuaranies(contDia)}</p><p class="text-[9px] text-gray-400">CONTADO</p></div>` : ''}
                    ${credDia > 0 ? `<div class="bg-yellow-50 rounded-lg p-2 text-center"><p class="text-xs font-bold text-yellow-700">${formatearGuaranies(credDia)}</p><p class="text-[9px] text-gray-400">CRÉDITO</p></div>` : ''}
                    ${cobrosDia > 0 ? `<div class="bg-indigo-50 rounded-lg p-2 text-center"><p class="text-xs font-bold text-indigo-700">${formatearGuaranies(cobrosDia)}</p><p class="text-[9px] text-gray-400">COBROS</p></div>` : ''}
                    ${gastosDia > 0 ? `<div class="bg-red-50 rounded-lg p-2 text-center"><p class="text-xs font-bold text-red-600">${formatearGuaranies(gastosDia)}</p><p class="text-[9px] text-gray-400">GASTOS</p></div>` : ''}
                </div>
                <div>${detalleItems}</div>
            </div>` : ''}
        </div>`;
    }).join('');

    const fechaInicio = inicio.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
    const fechaFin    = fin.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });

    container.innerHTML = _toggleCajaHTML() + `
        <div class="grid grid-cols-4 gap-1.5 mb-3">
            <div class="bg-green-50 rounded-xl p-2.5 text-center">
                <p class="text-sm font-bold text-green-700">${formatearGuaranies(totalVentas)}</p>
                <p class="text-[9px] text-gray-400 font-bold">VENTAS</p>
            </div>
            <div class="bg-indigo-50 rounded-xl p-2.5 text-center">
                <p class="text-sm font-bold text-indigo-700">${formatearGuaranies(totalCobros)}</p>
                <p class="text-[9px] text-gray-400 font-bold">COBRADO</p>
            </div>
            <div class="bg-red-50 rounded-xl p-2.5 text-center">
                <p class="text-sm font-bold text-red-600">${formatearGuaranies(totalGastos)}</p>
                <p class="text-[9px] text-gray-400 font-bold">GASTOS</p>
            </div>
            <div class="bg-blue-50 rounded-xl p-2.5 text-center">
                <p class="text-sm font-bold text-blue-700">${formatearGuaranies(aRendir)}</p>
                <p class="text-[9px] text-gray-400 font-bold">A RENDIR</p>
            </div>
        </div>

        <div class="flex justify-between items-center mb-2">
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">Semana ${fechaInicio} – ${fechaFin}</p>
            ${rendSemana ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${rendSemana.estado === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">${rendSemana.estado === 'pagado' ? 'PAGADO' : 'PENDIENTE'}</span>` : ''}
        </div>

        ${timelineHtml || '<p class="text-sm text-slate-400 text-center py-8">Sin actividad esta semana</p>'}

        <div class="flex gap-2 mt-3">
            <sl-button data-action="agregarGastoVendedor" variant="danger" size="small" class="flex-1">+ Gasto</sl-button>
            ${!rendSemana ? `<sl-button data-action="cerrarSemanaVendedor" data-arg="${semana}" variant="primary" size="small" class="flex-1">Cerrar Semana</sl-button>` : ''}
        </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================
// BACKUP UI
// ============================================
function mostrarModalBackup() {
    actualizarInfoBackup();
    mostrarHistorialBackups();
    document.getElementById('backupModal').show();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function cerrarModalBackup() {
    document.getElementById('backupModal').hide();
}

async function actualizarInfoBackup() {
    const ultimaFecha = await HDVStorage.getItem('hdv_ultimo_backup_fecha', { clone: false });
    const infoText = document.getElementById('backupInfoText');
    const infoDate = document.getElementById('backupInfoDate');
    if (!infoText || !infoDate) return;

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    infoText.textContent = `${pedidos.length} pedidos en el dispositivo`;

    if (ultimaFecha) {
        infoDate.textContent = `Ultimo backup: ${new Date(ultimaFecha).toLocaleString('es-PY')}`;
    } else {
        infoDate.textContent = 'Nunca se ha hecho backup';
    }
}

async function mostrarHistorialBackups() {
    const container = document.getElementById('historialBackups');
    if (!container) return;

    const meta = (await HDVStorage.getItem('hdv_auto_backups_meta', { clone: false })) || [];
    if (meta.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 italic">Sin auto-backups aun</p>';
        return;
    }

    container.innerHTML = '';
    meta.forEach((b, idx) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-50 rounded-lg p-2';
        div.innerHTML = `
            <div>
                <p class="text-xs font-medium text-gray-700">${new Date(b.fecha).toLocaleString('es-PY')}</p>
                <p class="text-[10px] text-gray-500">${b.totalPedidos} pedidos</p>
            </div>
            <sl-button onclick="restaurarAutoBackup(${idx})" variant="primary" size="small">Restaurar</sl-button>
        `;
        container.appendChild(div);
    });
}
