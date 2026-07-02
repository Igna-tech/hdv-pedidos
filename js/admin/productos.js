// ============================================
// HDV Admin - Modulo de Productos
// Stock, CRUD productos, categorias, variantes, imagenes, importacion
// Depende de globals: productosData, productosFiltrados, registrarCambio
// ============================================

let stockNavNivel = 'categorias';
let stockNavCatId = null;
let stockNavSubId = null;
let paginaProductos = 1;
let productosPorPagina = 20;
let ordenProductos = { campo: 'id', asc: true };
let prodNavNivel = 'categorias';
let prodNavCatId = null;
let prodNavSubId = null;
let archivoImagenProducto = null;
let _importData = null;
let _importType = null;
let _seleccionProductos = new Set();
let _previewImportData = null; // datos parseados pendientes de aplicar
let _editandoCatalogo = false; // modo edición (drag & drop + controles inline por nivel)
let _dragCtx = null;           // { tipo:'cat'|'sub'|'prod', id, index }

// ============================================
// STOCK
// ============================================

function cargarStock() {
    stockNavNivel = 'categorias';
    stockNavCatId = null;
    stockNavSubId = null;
    actualizarBreadcrumbStock();
    renderizarStockGrid();
}

function stockNavegar(nivel) {
    if (nivel === 'inicio') { stockNavNivel = 'categorias'; stockNavCatId = null; stockNavSubId = null; }
    else if (nivel === 'categoria') { stockNavNivel = 'subcategorias'; stockNavSubId = null; }
    actualizarBreadcrumbStock();
    renderizarStockGrid();
}

// Navegación de stock por data-action (CSP-safe; reemplaza onclick inline)
function stockNavCategoria(catId) {
    stockNavCatId = catId;
    stockNavNivel = 'subcategorias';
    actualizarBreadcrumbStock();
    renderizarStockGrid();
}
function stockNavSubcategoria(sub) {
    stockNavSubId = sub || null;
    stockNavNivel = 'productos';
    actualizarBreadcrumbStock();
    renderizarStockGrid();
}

function actualizarBreadcrumbStock() {
    const cat = document.getElementById('stock-breadcrumb-cat');
    const sub = document.getElementById('stock-breadcrumb-sub');
    const sep1 = document.getElementById('stock-breadcrumb-sep1');
    const sep2 = document.getElementById('stock-breadcrumb-sep2');
    if (!cat) return;
    cat.classList.add('hidden'); sub.classList.add('hidden');
    sep1.classList.add('hidden'); sep2.classList.add('hidden');
    if (stockNavCatId) {
        const catObj = (productosData.categorias || []).find(c => c.id === stockNavCatId);
        cat.textContent = catObj?.nombre || stockNavCatId;
        cat.classList.remove('hidden'); sep1.classList.remove('hidden');
    }
    if (stockNavSubId) {
        sub.textContent = stockNavSubId;
        sub.classList.remove('hidden'); sep2.classList.remove('hidden');
    }
}

function filtrarStock() {
    renderizarStockGrid();
}

function aplicarFiltroStock() {
    renderizarStockGrid();
}

async function renderizarStockGrid() {
    const container = document.getElementById('stockGridContainer');
    if (!container) return;
    const busqueda = document.getElementById('buscarStock')?.value.toLowerCase() || '';
    const filtro = document.getElementById('filtroStock')?.value || '';

    // Si hay busqueda, mostrar productos directamente
    if (busqueda) {
        let items = [];
        productosData.productos.forEach(prod => {
            if (prod.nombre.toLowerCase().includes(busqueda) || prod.id.toLowerCase().includes(busqueda)) {
                items.push(prod);
            }
        });
        await renderizarProductosStock(container, items, filtro);
        return;
    }

    if (stockNavNivel === 'categorias') {
        renderizarCategoriasStock(container);
    } else if (stockNavNivel === 'subcategorias') {
        const catObj = (productosData.categorias || []).find(c => c.id === stockNavCatId);
        const subs = catObj?.subcategorias || [];
        if (subs.length === 0) {
            // Sin subcategorias, ir directo a productos
            const prods = productosData.productos.filter(p => p.categoria === stockNavCatId);
            await renderizarProductosStock(container, prods, filtro);
        } else {
            renderizarSubcategoriasStock(container, subs, filtro);
        }
    } else if (stockNavNivel === 'productos') {
        let prods = productosData.productos.filter(p => p.categoria === stockNavCatId && (stockNavSubId ? p.subcategoria === stockNavSubId : true));
        await renderizarProductosStock(container, prods, filtro);
    }
}

function renderizarCategoriasStock(container) {
    const cats = productosData.categorias || [];
    container.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        ${cats.map(cat => {
            const count = productosData.productos.filter(p => p.categoria === cat.id).length;
            const totalStock = productosData.productos.filter(p => p.categoria === cat.id)
                .reduce((s, p) => s + p.presentaciones.reduce((ss, pr) => ss + (pr.stock || 0), 0), 0);
            return `<div data-action="stockNavCategoria" data-cat="${escapeHTML(cat.id)}"
                class="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-md hover:border-gray-400 transition-all">
                <p class="font-bold text-gray-800 text-lg mb-1">${escapeHTML(cat.nombre)}</p>
                <p class="text-sm text-gray-500">${count} productos</p>
                <p class="text-xs font-bold mt-2 ${totalStock <= 0 ? 'text-red-600' : 'text-green-600'}">Stock: ${totalStock}</p>
            </div>`;
        }).join('')}
    </div>`;
}

function renderizarSubcategoriasStock(container, subs, filtro) {
    container.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div data-action="stockNavSubcategoria" data-sub=""
            class="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5 cursor-pointer hover:shadow-md transition-all flex items-center justify-center">
            <p class="font-bold text-gray-500 text-sm">Ver todos</p>
        </div>
        ${subs.map(sub => {
            const count = productosData.productos.filter(p => p.categoria === stockNavCatId && p.subcategoria === sub).length;
            const totalStock = productosData.productos.filter(p => p.categoria === stockNavCatId && p.subcategoria === sub)
                .reduce((s, p) => s + p.presentaciones.reduce((ss, pr) => ss + (pr.stock || 0), 0), 0);
            return `<div data-action="stockNavSubcategoria" data-sub="${escapeHTML(sub)}"
                class="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-md hover:border-gray-400 transition-all">
                <p class="font-bold text-gray-800 mb-1">${escapeHTML(sub)}</p>
                <p class="text-sm text-gray-500">${count} productos</p>
                <p class="text-xs font-bold mt-2 ${totalStock <= 0 ? 'text-red-600' : 'text-green-600'}">Stock: ${totalStock}</p>
            </div>`;
        }).join('')}
    </div>`;
}

async function renderizarProductosStock(container, prods, filtro) {
    // Aplicar ordenamiento/filtro
    if (filtro === 'az') prods = [...prods].sort((a, b) => a.nombre.localeCompare(b.nombre));
    else if (filtro === 'disponibles') prods = prods.filter(p => (p.estado || 'disponible') === 'disponible');
    else if (filtro === 'no-disponibles') prods = prods.filter(p => (p.estado || 'disponible') !== 'disponible');
    else if (filtro === 'mas-vendidos') {
        const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
        const conteo = {};
        pedidos.forEach(p => (p.items || []).forEach(it => { conteo[it.productoId] = (conteo[it.productoId] || 0) + (it.cantidad || 1); }));
        prods = [...prods].sort((a, b) => (conteo[b.id] || 0) - (conteo[a.id] || 0));
    } else if (filtro === 'menos-vendidos') {
        const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
        const conteo = {};
        pedidos.forEach(p => (p.items || []).forEach(it => { conteo[it.productoId] = (conteo[it.productoId] || 0) + (it.cantidad || 1); }));
        prods = [...prods].sort((a, b) => (conteo[a.id] || 0) - (conteo[b.id] || 0));
    }

    if (prods.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_PRODUCTS, 'Sin productos en esta categoria', 'Agrega productos usando el formulario');
        return;
    }

    container.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${prods.map(prod => {
            const stockTotal = prod.presentaciones.reduce((s, p) => s + (p.stock || 0), 0);
            const presRows = prod.presentaciones.map((p, i) => `
                <div class="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                    <span class="text-xs text-gray-500 w-14 shrink-0">${escapeHTML(p.tamano)}</span>
                    <input type="number" value="${p.precio_base || 0}" data-action-change="ajustarPrecioInline" data-pid="${escapeHTML(prod.id)}" data-tam="${escapeHTML(p.tamano)}" data-campo="precio_base"
                        class="w-16 text-xs text-right border border-gray-200 rounded px-1 py-0.5 focus:border-blue-400 outline-none" title="Precio">
                    <input type="number" value="${p.costo || 0}" data-action-change="ajustarPrecioInline" data-pid="${escapeHTML(prod.id)}" data-tam="${escapeHTML(p.tamano)}" data-campo="costo"
                        class="w-14 text-xs text-right border border-gray-200 rounded px-1 py-0.5 focus:border-blue-400 outline-none text-gray-400" title="Costo">
                    <span class="font-bold text-sm w-8 text-center ${(p.stock || 0) <= 0 ? 'text-red-600' : (p.stock || 0) < 10 ? 'text-yellow-600' : 'text-green-600'}">${p.stock || 0}</span>
                    <div class="flex gap-1 ml-auto shrink-0">
                        <sl-button data-action="ajustarStock" data-pid="${escapeHTML(prod.id)}" data-tam="${escapeHTML(p.tamano)}" data-delta="-1" variant="danger" size="small">−</sl-button>
                        <sl-button data-action="ajustarStock" data-pid="${escapeHTML(prod.id)}" data-tam="${escapeHTML(p.tamano)}" data-delta="1" variant="success" size="small">+</sl-button>
                        <sl-button data-action="ajustarStock" data-pid="${escapeHTML(prod.id)}" data-tam="${escapeHTML(p.tamano)}" data-delta="10" variant="primary" size="small">+10</sl-button>
                    </div>
                </div>`).join('');
            return `<div class="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <p class="font-bold text-gray-800 text-sm">${escapeHTML(prod.nombre)}</p>
                        <p class="text-xs text-gray-400">${prod.id}</p>
                    </div>
                    <span class="text-xs font-bold px-2 py-1 rounded-full ${stockTotal <= 0 ? 'bg-red-100 text-red-700' : stockTotal < 10 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}">
                        Total: ${stockTotal}
                    </span>
                </div>
                ${presRows}
            </div>`;
        }).join('')}
    </div>`;
}

function ajustarStock(prodId, tamano, cantidad) {
    const prod = productosData.productos.find(p => p.id === prodId);
    if (!prod) return;
    const pres = prod.presentaciones.find(p => p.tamano === tamano);
    if (pres) {
        pres.stock = Math.max(0, (pres.stock || 0) + cantidad);
        registrarCambio();
        cargarStock();
        // Upsert atómico a Supabase (no esperar a "Guardar Todo")
        _upsertVarianteAtomico(prod.id, pres);
    }
}

function ajustarPrecioInline(prodId, tamano, campo, valor) {
    const prod = productosData.productos.find(p => p.id === prodId);
    if (!prod) return;
    const pres = prod.presentaciones.find(p => p.tamano === tamano);
    if (pres) {
        pres[campo] = parseInt(valor) || 0;
        registrarCambio();
        _upsertVarianteAtomico(prod.id, pres);
    }
}

async function _upsertVarianteAtomico(productoId, pres) {
    try {
        if (pres.variante_id) {
            await SupabaseService.updateVariante(pres.variante_id, {
                precio: pres.precio_base || 0,
                costo: pres.costo || 0,
                stock: pres.stock || 0,
                activo: pres.activo !== false
            });
        } else {
            await SupabaseService.upsertVariante({
                producto_id: productoId,
                nombre_variante: pres.tamano || 'Unidad',
                precio: pres.precio_base || 0,
                costo: pres.costo || 0,
                stock: pres.stock || 0,
                activo: pres.activo !== false
            });
        }
    } catch (err) {
        console.error('[Admin] Error upsert atómico variante:', err);
    }
}

function guardarStock() { guardarTodosCambios(); }

// ============================================
// PRODUCT MANAGEMENT
// ============================================

function filtrarProductos() {
    const filtro = document.getElementById('buscarProducto')?.value.toLowerCase() || '';
    const catFiltro = document.getElementById('filtroCategoria')?.value || '';
    const subcatFiltro = document.getElementById('filtroSubcategoriaProducto')?.value || '';
    const estadoFiltro = document.getElementById('filtroEstadoProducto')?.value || '';
    const mostrarOcultos = document.getElementById('mostrarOcultosProductos')?.checked || false;
    const soloStockBajo = document.getElementById('filtroStockBajo')?.checked || false;
    productosFiltrados = productosData.productos.filter(p => {
        const match = !filtro || p.nombre.toLowerCase().includes(filtro)
            || p.id.toLowerCase().includes(filtro)
            || (p.subcategoria || '').toLowerCase().includes(filtro)
            || ((productosData.categorias.find(c => c.id === p.categoria)?.nombre || '').toLowerCase().includes(filtro));
        const visible = mostrarOcultos || !p.oculto;
        const catMatch = !catFiltro || p.categoria === catFiltro;
        const subcatMatch = !subcatFiltro || (p.subcategoria || '') === subcatFiltro;
        const estMatch = !estadoFiltro || (p.estado || 'disponible') === estadoFiltro;
        const stockMatch = !soloStockBajo || (p.presentaciones || []).some(v => (v.stock || 0) <= STOCK_BAJO_UMBRAL);
        return match && visible && catMatch && subcatMatch && estMatch && stockMatch;
    });
    paginaProductos = 1;
    const hayFiltro = filtro || catFiltro || subcatFiltro || estadoFiltro || soloStockBajo;
    if (hayFiltro) { prodNavNivel = 'categorias'; prodNavCatId = null; prodNavSubId = null; }
    mostrarProductosGestion();
}

function poblarFiltroCategorias() {
    const sel = document.getElementById('filtroCategoria');
    if (!sel) return;
    sel.innerHTML = '<sl-option value="">Todas las categorias</sl-option>';
    (productosData.categorias || []).forEach(c => {
        sel.innerHTML += `<sl-option value="${escapeHTML(c.id)}">${escapeHTML(c.nombre)}</sl-option>`;
    });
}

function poblarFiltroSubcategorias(catId) {
    const sel = document.getElementById('filtroSubcategoriaProducto');
    if (!sel) return;
    if (!catId) {
        sel.innerHTML = '<sl-option value="">Todas las subcats</sl-option>';
        sel.value = '';
        sel.disabled = true;
        return;
    }
    const cat = (productosData.categorias || []).find(c => c.id === catId);
    const subs = cat?.subcategorias || [];
    if (subs.length === 0) {
        sel.innerHTML = '<sl-option value="">Sin subcategorias</sl-option>';
        sel.value = '';
        sel.disabled = true;
        return;
    }
    sel.innerHTML = '<sl-option value="">Todas las subcats</sl-option>'
        + subs.map(s => `<sl-option value="${escapeHTML(s)}">${escapeHTML(s)}</sl-option>`).join('');
    sel.value = '';
    sel.disabled = false;
}

function ordenarProductos(campo) {
    if (ordenProductos.campo === campo) ordenProductos.asc = !ordenProductos.asc;
    else { ordenProductos.campo = campo; ordenProductos.asc = true; }
    productosFiltrados.sort((a, b) => {
        let va = a[campo] || '', vb = b[campo] || '';
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        return ordenProductos.asc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    mostrarProductosGestion();
}

function productosNavegar(nivel) {
    if (nivel === 'inicio') { prodNavNivel = 'categorias'; prodNavCatId = null; prodNavSubId = null; }
    else if (nivel === 'categoria') { prodNavNivel = 'subcategorias'; prodNavSubId = null; }
    actualizarBreadcrumbProductos();
    mostrarProductosGestion();
}

function actualizarBreadcrumbProductos() {
    const cat = document.getElementById('prod-breadcrumb-cat');
    const sub = document.getElementById('prod-breadcrumb-sub');
    const sep1 = document.getElementById('prod-breadcrumb-sep1');
    const sep2 = document.getElementById('prod-breadcrumb-sep2');
    if (!cat) return;
    cat.classList.add('hidden'); sub.classList.add('hidden');
    sep1.classList.add('hidden'); sep2.classList.add('hidden');
    if (prodNavCatId) {
        const catObj = (productosData.categorias || []).find(c => c.id === prodNavCatId);
        cat.textContent = catObj?.nombre || prodNavCatId;
        cat.classList.remove('hidden'); sep1.classList.remove('hidden');
    }
    if (prodNavSubId) {
        sub.textContent = prodNavSubId;
        sub.classList.remove('hidden'); sep2.classList.remove('hidden');
    }
}

// Score de calidad del catálogo: % de productos con imagen/costo/categoría/IVA.
// Incentiva completar datos → impacta la Ganancia Neta real del dashboard.
function _ccBar(label, pct) {
    return `<div class="cc-bar"><span class="cc-bar-l">${escapeHTML(label)}</span><span class="cc-bar-track"><span class="cc-bar-fill" style="width:${pct}%"></span></span><span class="cc-bar-v">${pct}%</span></div>`;
}
function _renderCalidadCatalogo() {
    const cont = document.getElementById('catalogoCalidad');
    if (!cont) return;
    const prods = (productosData.productos || []).filter(p => !p.oculto);
    const total = prods.length;
    if (total === 0) { cont.classList.add('hidden'); cont.innerHTML = ''; return; }
    let conImg = 0, conCosto = 0, conCat = 0, conIva = 0;
    prods.forEach(p => {
        if (p.imagen_url || p.imagen) conImg++;
        if ((p.presentaciones || []).some(pr => (pr.costo || 0) > 0)) conCosto++;
        if (p.categoria) conCat++;
        if (p.tipo_impuesto) conIva++;
    });
    const pct = (n) => Math.round(n / total * 100);
    const pImg = pct(conImg), pCosto = pct(conCosto), pCat = pct(conCat), pIva = pct(conIva);
    const score = Math.round((pImg + pCosto + pCat + pIva) / 4);
    const color = score >= 80 ? 'var(--ok)' : score >= 50 ? 'var(--warn)' : 'var(--alert)';
    cont.classList.remove('hidden');
    cont.innerHTML = `
      <div class="cc-score" style="--cc:${color}">
        <div class="cc-ring" style="background:conic-gradient(var(--cc) ${score * 3.6}deg, var(--panel-3) 0)"><span>${score}</span></div>
        <div class="cc-meta"><p class="cc-title">Calidad del catálogo</p><p class="cc-sub">${total} productos activos</p></div>
        <div class="cc-bars">${_ccBar('Imagen', pImg)}${_ccBar('Costo', pCosto)}${_ccBar('Categoría', pCat)}${_ccBar('IVA', pIva)}</div>
      </div>`;
}

// ID de producto unificado: P### incremental robusto (catálogo vacío o IDs no-P###).
function _siguienteIdProducto() {
    const maxN = (productosData.productos || []).reduce((m, p) => {
        const n = parseInt(String(p.id || '').replace(/\D/g, ''), 10) || 0;
        return n > m ? n : m;
    }, 0);
    return `P${String(maxN + 1).padStart(3, '0')}`;
}

// Orden siguiente para un producto nuevo dentro de su categoría (va al final).
function _siguienteOrdenProducto(catId) {
    const enCat = (productosData.productos || []).filter(p => p.categoria === catId);
    const maxO = enCat.reduce((m, p) => (Number.isFinite(p.orden) && p.orden > m ? p.orden : m), -1);
    return maxO + 1;
}

async function mostrarProductosGestion() {
    const container = document.getElementById('productosGridContainer');
    if (!container) return;
    _initProductosGridDelegation(container);
    poblarFiltroCategorias();
    _renderCalidadCatalogo();

    const busqueda = document.getElementById('buscarProducto')?.value.toLowerCase() || '';
    const catFiltro = document.getElementById('filtroCategoria')?.value || '';
    const subcatFiltro = document.getElementById('filtroSubcategoriaProducto')?.value || '';
    const estadoFiltro = document.getElementById('filtroEstadoProducto')?.value || '';
    const ordenFiltro = document.getElementById('filtroOrdenProductos')?.value || '';
    const mostrarOcultos = document.getElementById('mostrarOcultosProductos')?.checked || false;
    const soloStockBajo = document.getElementById('filtroStockBajo')?.checked || false;

    // Si hay filtros activos, mostrar grid de productos directamente
    const hayFiltro = busqueda || catFiltro || subcatFiltro || estadoFiltro || soloStockBajo;

    if (hayFiltro) {
        let prods = productosFiltrados;
        if (!mostrarOcultos) prods = prods.filter(p => !p.oculto);
        prods = await aplicarOrdenProductos(prods, ordenFiltro);
        renderizarProductosGestionGrid(container, prods);
        actualizarPaginacionProductos(prods.length);
        return;
    }

    // Sin filtros: navegacion por categoria
    if (prodNavNivel === 'categorias') {
        renderizarCategoriasGestion(container);
        actualizarPaginacionProductos(0);
    } else if (prodNavNivel === 'subcategorias') {
        const catObj = (productosData.categorias || []).find(c => c.id === prodNavCatId);
        const subs = catObj?.subcategorias || [];
        if (subs.length === 0) {
            let prods = productosData.productos.filter(p => p.categoria === prodNavCatId);
            if (!mostrarOcultos) prods = prods.filter(p => !p.oculto);
            prods = await aplicarOrdenProductos(prods, ordenFiltro);
            renderizarProductosGestionGrid(container, prods);
            actualizarPaginacionProductos(prods.length);
        } else {
            renderizarSubcategoriasGestion(container, subs);
            actualizarPaginacionProductos(0);
        }
    } else if (prodNavNivel === 'productos') {
        let prods = productosData.productos.filter(p => p.categoria === prodNavCatId && (prodNavSubId ? p.subcategoria === prodNavSubId : true));
        if (!mostrarOcultos) prods = prods.filter(p => !p.oculto);
        prods = await aplicarOrdenProductos(prods, ordenFiltro);
        renderizarProductosGestionGrid(container, prods);
        actualizarPaginacionProductos(prods.length);
    }

    actualizarBreadcrumbProductos();
    _actualizarAlertaStock();
}

// ============================================
// EVENT DELEGATION — Productos Grid + Paginacion
// ============================================

const _productosActionMap = {
    'toggle-seleccion': (id) => {
        if (!id) return;
        if (_seleccionProductos.has(id)) {
            _seleccionProductos.delete(id);
        } else {
            _seleccionProductos.add(id);
        }
        // Actualizar sólo el checkbox y el ring sin re-renderizar todo
        const grid = document.getElementById('productosGridContainer');
        const overlay = grid?.querySelector(`.card-checkbox-overlay[data-id="${CSS.escape(id)}"]`);
        if (overlay) {
            const cb = overlay.querySelector('input[type="checkbox"]');
            if (cb) cb.checked = _seleccionProductos.has(id);
            const card = overlay.closest('.catalog-card');
            if (card) {
                card.classList.toggle('ring-2', _seleccionProductos.has(id));
                card.classList.toggle('ring-indigo-500', _seleccionProductos.has(id));
            }
        }
        _actualizarBarraMasiva();
    },
    'nav-categoria': (id) => {
        prodNavCatId = id;
        prodNavNivel = 'subcategorias';
        actualizarBreadcrumbProductos();
        mostrarProductosGestion();
    },
    'nav-subcategoria': (id) => {
        prodNavSubId = id || null;
        prodNavNivel = 'productos';
        actualizarBreadcrumbProductos();
        mostrarProductosGestion();
    },
    'abrir-perfil': (id) => {
        abrirPerfilProducto(id);
    },
    'pag-primera': () => {
        paginaProductos = 1;
        mostrarProductosGestion();
    },
    'pag-anterior': () => {
        if (paginaProductos > 1) { paginaProductos--; mostrarProductosGestion(); }
    },
    'pag-siguiente': () => {
        paginaProductos++;
        mostrarProductosGestion();
    },
    'pag-ultima': (id) => {
        paginaProductos = parseInt(id) || 1;
        mostrarProductosGestion();
    },
    // --- Modo edición: controles inline por nivel ---
    'cat-rename':   (id, el) => _renombrarCategoriaGestion(el.dataset.cat),
    'cat-toggle':   (id, el) => _toggleActivoCategoriaGestion(el.dataset.cat),
    'cat-delete':   (id, el) => _eliminarCategoriaGestion(el.dataset.cat),
    'sub-rename':   (id, el) => _renombrarSubcategoriaGestion(el.dataset.cat, el.dataset.sub),
    'sub-delete':   (id, el) => _eliminarSubcategoriaGestion(el.dataset.cat, el.dataset.sub),
    'prod-edit':    (id, el) => editarProducto(el.dataset.id),
    'prod-hide':    (id, el) => _toggleOcultarProductoGestion(el.dataset.id),
    'prod-delete':  (id, el) => _eliminarProductoGestion(el.dataset.id)
};

function _handleProductoAction(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    if (target.disabled) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    const handler = _productosActionMap[action];
    if (handler) handler(id, target);
}

function _initProductosGridDelegation(container) {
    if (container && !container._delegated) {
        container.addEventListener('click', _handleProductoAction);
        container.addEventListener('dragstart', _onCatalogoDragStart);
        container.addEventListener('dragover', _onCatalogoDragOver);
        container.addEventListener('drop', _onCatalogoDrop);
        container.addEventListener('dragend', _onCatalogoDragEnd);
        container._delegated = true;
    }
}

function _initPaginacionDelegation(pagEl) {
    if (pagEl && !pagEl._delegated) {
        pagEl.addEventListener('click', _handleProductoAction);
        pagEl._delegated = true;
    }
}

// ============================================
// MODO EDICIÓN DEL CATÁLOGO (drag & drop + CRUD inline por nivel)
// ============================================

const SVG_ICON_PENCIL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const SVG_ICON_TRASH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
const SVG_ICON_EYE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const SVG_ICON_EYE_OFF = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A11 11 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';

function _dragHandleHTML() {
    return '<span class="catalogo-drag-handle" data-action="noop" title="Arrastrar para reordenar" style="position:absolute;top:6px;left:6px;z-index:6;cursor:grab;background:rgba(0,0,0,0.55);color:#fff;border-radius:6px;padding:3px;line-height:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg></span>';
}
function _ctrlBarHTML(inner) {
    return `<div class="catalogo-ctrl-bar" style="position:absolute;top:6px;right:6px;z-index:7;display:flex;gap:4px">${inner}</div>`;
}
function _ctrlBtnHTML(action, data, svg, title, bg) {
    const attrs = Object.entries(data || {}).map(([k, v]) => `data-${k}="${escapeHTML(String(v))}"`).join(' ');
    return `<button type="button" data-action="${action}" ${attrs} title="${escapeHTML(title)}" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:7px;background:${bg};color:#fff;border:none;cursor:pointer">${svg}</button>`;
}

function toggleEditarCatalogo() {
    _editandoCatalogo = !_editandoCatalogo;
    const lbl = document.getElementById('btnEditarCatalogoLabel');
    if (lbl) lbl.textContent = _editandoCatalogo ? 'Listo' : 'Editar';
    const btn = document.getElementById('btnEditarCatalogo');
    if (btn) btn.setAttribute('variant', _editandoCatalogo ? 'success' : 'neutral');
    if (!_editandoCatalogo) { _seleccionProductos.clear(); _actualizarBarraMasiva(); }
    mostrarProductosGestion();
}

// ---- Drag & drop nativo (reordenar + mover producto a subcategoría) ----
function _onCatalogoDragStart(e) {
    if (!_editandoCatalogo) return;
    const card = e.target.closest('[data-drag-type]');
    if (!card) return;
    const scope = card.parentElement?.getAttribute('data-drag-scope');
    _dragCtx = { tipo: card.getAttribute('data-drag-type'), id: card.getAttribute('data-drag-id'), scope };
    card.style.opacity = '0.4';
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', _dragCtx.id || ''); } catch (_) {}
}
function _onCatalogoDragOver(e) {
    if (!_editandoCatalogo || !_dragCtx) return;
    const overCard = e.target.closest(`[data-drag-type="${_dragCtx.tipo}"]`);
    const overRail = _dragCtx.tipo === 'prod' ? e.target.closest('[data-drop-sub]') : null;
    if (overCard || overRail) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (_) {} }
    if (overRail) overRail.style.background = 'var(--steel-soft, rgba(86,129,174,0.35))';
}
function _onCatalogoDrop(e) {
    if (!_editandoCatalogo || !_dragCtx) return;
    e.preventDefault();
    const ctx = _dragCtx;
    // 1) Producto soltado sobre una subcategoría → reasignar
    const rail = ctx.tipo === 'prod' ? e.target.closest('[data-drop-sub]') : null;
    if (rail) {
        rail.style.background = '';
        _moverProductoASubcategoria(ctx.id, rail.getAttribute('data-drop-sub'));
        return;
    }
    // 2) Reordenar dentro del mismo nivel
    const overCard = e.target.closest(`[data-drag-type="${ctx.tipo}"]`);
    if (!overCard) return;
    const destId = overCard.getAttribute('data-drag-id');
    if (destId === ctx.id) return;
    if (ctx.tipo === 'cat') _reordenarCategorias(ctx.id, destId);
    else if (ctx.tipo === 'sub') _reordenarSubcategorias(ctx.id, destId);
    else if (ctx.tipo === 'prod') _reordenarProductos(ctx.id, destId);
}
function _onCatalogoDragEnd(e) {
    const card = e.target.closest('[data-drag-type]');
    if (card) card.style.opacity = '';
    document.querySelectorAll('[data-drop-sub]').forEach(el => { el.style.background = ''; });
    _dragCtx = null;
}

async function _reordenarCategorias(dragId, destId) {
    const arr = productosData.categorias;
    const from = arr.findIndex(c => c.id === dragId);
    const to = arr.findIndex(c => c.id === destId);
    if (from < 0 || to < 0) return;
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    arr.forEach((c, i) => { c.orden = i; });
    mostrarProductosGestion();
    const ok = await persistirOrdenCategorias(arr.map(c => ({ id: c.id, orden: c.orden })));
    if (ok) mostrarToast('Orden de categorías guardado', 'success');
    else { registrarCambio(); mostrarToast('Orden local — sincronizá para publicarlo', 'warning'); }
}

async function _reordenarSubcategorias(dragSub, destSub) {
    const cat = productosData.categorias.find(c => c.id === prodNavCatId);
    if (!cat || !Array.isArray(cat.subcategorias)) return;
    const from = cat.subcategorias.indexOf(dragSub);
    const to = cat.subcategorias.indexOf(destSub);
    if (from < 0 || to < 0) return;
    const [m] = cat.subcategorias.splice(from, 1);
    cat.subcategorias.splice(to, 0, m);
    mostrarProductosGestion();
    const ok = await guardarCategoriaIndividual(cat);
    if (ok) mostrarToast('Orden de subcategorías guardado', 'success');
    else { registrarCambio(); mostrarToast('Orden local — sincronizá para publicarlo', 'warning'); }
}

async function _reordenarProductos(dragId, destId) {
    // Reordena dentro del subconjunto visible y reasigna orden secuencial.
    const arr = productosData.productos;
    const from = arr.findIndex(p => p.id === dragId);
    const to = arr.findIndex(p => p.id === destId);
    if (from < 0 || to < 0) return;
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    // Reasignar orden por categoría (secuencial) para los afectados de esa categoría
    const catId = m.categoria;
    let i = 0;
    const cambios = [];
    arr.forEach(p => { if (p.categoria === catId) { p.orden = i++; cambios.push({ id: p.id, orden: p.orden }); } });
    productosFiltrados = [...arr];
    mostrarProductosGestion();
    const ok = await persistirOrdenProductos(cambios);
    if (ok) mostrarToast('Orden de productos guardado', 'success');
    else { registrarCambio(); mostrarToast('Orden local — sincronizá para publicarlo', 'warning'); }
}

async function _moverProductoASubcategoria(prodId, sub) {
    const prod = productosData.productos.find(p => p.id === prodId);
    if (!prod) return;
    if (prod.subcategoria === sub) return;
    prod.subcategoria = sub;
    productosFiltrados = [...productosData.productos];
    mostrarProductosGestion();
    const ok = await guardarProductoIndividual(prod);
    mostrarToast(ok ? `"${prod.nombre}" movido a ${sub}` : 'Movido local — sincronizá para publicarlo', ok ? 'success' : 'warning');
}

// ---- CRUD inline por nivel (auto-guardado) ----
async function _renombrarCategoriaGestion(catId) {
    const cat = productosData.categorias.find(c => c.id === catId);
    if (!cat) return;
    const r = await mostrarInputModal({
        titulo: 'Renombrar categoría', icono: 'pencil',
        campos: [{ key: 'nombre', label: 'Nombre', tipo: 'text', valor: cat.nombre, requerido: true }],
        textoConfirmar: 'Guardar'
    });
    if (!r || !(r.nombre || '').trim() || r.nombre.trim() === cat.nombre) return;
    cat.nombre = r.nombre.trim();
    poblarFiltroCategorias();
    mostrarProductosGestion();
    const ok = await guardarCategoriaIndividual(cat);
    mostrarToast(ok ? 'Categoría renombrada' : 'Guardado local — sincronizá', ok ? 'success' : 'warning');
}

async function _toggleActivoCategoriaGestion(catId) {
    const cat = productosData.categorias.find(c => c.id === catId);
    if (!cat) return;
    const activa = !cat.estado || cat.estado === 'activo';
    if (activa) {
        const n = productosData.productos.filter(p => p.categoria === catId).length;
        if (n > 0 && !await mostrarConfirmModal(`¿Desactivar esta categoría? ${n} producto(s) dejarán de verse en la app del vendedor.`, { textoConfirmar: 'Desactivar' })) return;
    }
    cat.estado = activa ? 'inactivo' : 'activo';
    mostrarProductosGestion();
    const ok = await guardarCategoriaIndividual(cat);
    mostrarToast(ok ? `Categoría ${cat.estado === 'activo' ? 'activada' : 'desactivada'}` : 'Guardado local — sincronizá', ok ? 'success' : 'warning');
}

async function _eliminarCategoriaGestion(catId) {
    const prods = productosData.productos.filter(p => p.categoria === catId);
    if (prods.length > 0) { mostrarToast(`No se puede eliminar: ${prods.length} producto(s) usan esta categoría`, 'error'); return; }
    if (!await mostrarConfirmModal('¿Eliminar esta categoría?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    productosData.categorias = productosData.categorias.filter(c => c.id !== catId);
    poblarFiltroCategorias();
    mostrarProductosGestion();
    const ok = await eliminarCategoriaRemota(catId);
    mostrarToast(ok ? 'Categoría eliminada' : 'Eliminada local — sincronizá', ok ? 'success' : 'warning');
}

async function nuevaCategoriaInline() {
    const cat = await _crearCategoriaInlineDesdeModal();
    if (!cat) return;
    poblarFiltroCategorias();
    mostrarProductosGestion();
    const ok = await guardarCategoriaIndividual(cat);
    mostrarToast(ok ? `Categoría "${cat.nombre}" creada` : 'Creada local — sincronizá', ok ? 'success' : 'warning');
}

async function _renombrarSubcategoriaGestion(catId, sub) {
    const cat = productosData.categorias.find(c => c.id === catId);
    if (!cat) return;
    const r = await mostrarInputModal({
        titulo: 'Renombrar subcategoría', icono: 'pencil',
        campos: [{ key: 'nombre', label: 'Nombre', tipo: 'text', valor: sub, requerido: true }],
        textoConfirmar: 'Guardar'
    });
    const nuevo = (r?.nombre || '').trim();
    if (!nuevo || nuevo === sub) return;
    cat.subcategorias = (cat.subcategorias || []).map(s => s === sub ? nuevo : s);
    // Reasignar productos que usaban la subcategoría anterior
    const afectados = productosData.productos.filter(p => p.categoria === catId && p.subcategoria === sub);
    afectados.forEach(p => { p.subcategoria = nuevo; });
    mostrarProductosGestion();
    let ok = await guardarCategoriaIndividual(cat);
    for (const p of afectados) { const r2 = await guardarProductoIndividual(p); ok = ok && r2; }
    mostrarToast(ok ? `Subcategoría renombrada (${afectados.length} producto/s)` : 'Guardado local — sincronizá', ok ? 'success' : 'warning');
}

async function _eliminarSubcategoriaGestion(catId, sub) {
    const cat = productosData.categorias.find(c => c.id === catId);
    if (!cat) return;
    const afectados = productosData.productos.filter(p => p.categoria === catId && p.subcategoria === sub);
    const msg = afectados.length > 0
        ? `¿Eliminar la subcategoría "${sub}"? Sus ${afectados.length} producto(s) pasarán a "General".`
        : `¿Eliminar la subcategoría "${sub}"?`;
    if (!await mostrarConfirmModal(msg, { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    cat.subcategorias = (cat.subcategorias || []).filter(s => s !== sub);
    afectados.forEach(p => { p.subcategoria = 'General'; });
    mostrarProductosGestion();
    let ok = await guardarCategoriaIndividual(cat);
    for (const p of afectados) { const r2 = await guardarProductoIndividual(p); ok = ok && r2; }
    mostrarToast(ok ? 'Subcategoría eliminada' : 'Eliminada local — sincronizá', ok ? 'success' : 'warning');
}

async function nuevaSubcategoriaInline() {
    const cat = productosData.categorias.find(c => c.id === prodNavCatId);
    if (!cat) return;
    const r = await mostrarInputModal({
        titulo: 'Nueva subcategoría', icono: 'tag',
        campos: [{ key: 'nombre', label: 'Nombre de la subcategoría', tipo: 'text', requerido: true }],
        textoConfirmar: 'Crear'
    });
    const nombre = (r?.nombre || '').trim();
    if (!nombre) return;
    if (!Array.isArray(cat.subcategorias)) cat.subcategorias = [];
    if (cat.subcategorias.includes(nombre)) { mostrarToast('Ya existe esa subcategoría', 'error'); return; }
    cat.subcategorias.push(nombre);
    mostrarProductosGestion();
    const ok = await guardarCategoriaIndividual(cat);
    mostrarToast(ok ? `Subcategoría "${nombre}" creada` : 'Creada local — sincronizá', ok ? 'success' : 'warning');
}

async function _toggleOcultarProductoGestion(id) {
    const prod = productosData.productos.find(p => p.id === id);
    if (!prod) return;
    prod.oculto = !prod.oculto;
    mostrarProductosGestion();
    const ok = await guardarProductoIndividual(prod);
    mostrarToast(ok ? (prod.oculto ? 'Producto ocultado' : 'Producto visible') : 'Guardado local — sincronizá', ok ? 'success' : 'warning');
}

async function _eliminarProductoGestion(id) {
    const prod = productosData.productos.find(p => p.id === id);
    if (!prod) return;
    if (!await mostrarConfirmModal(`¿Eliminar "${prod.nombre}"?`, { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    productosData.productos = productosData.productos.filter(p => p.id !== id);
    productosFiltrados = productosFiltrados.filter(p => p.id !== id);
    mostrarProductosGestion();
    const ok = await eliminarProductoRemoto(id);
    mostrarToast(ok ? 'Producto eliminado' : 'Eliminado local — sincronizá', ok ? 'success' : 'warning');
}

// Acción masiva: mover productos seleccionados a una subcategoría.
async function moverProductosSeleccionados() {
    const ids = [..._seleccionProductos];
    if (ids.length === 0) { mostrarToast('No hay productos seleccionados', 'error'); return; }
    // Subcategorías candidatas: de la categoría del primer seleccionado (o de su categoría actual)
    const primero = productosData.productos.find(p => p.id === ids[0]);
    const cat = productosData.categorias.find(c => c.id === (primero?.categoria));
    const subs = (cat?.subcategorias || []);
    const opciones = subs.map(s => ({ value: s, label: s }));
    opciones.push({ value: 'General', label: 'General' });
    const r = await mostrarInputModal({
        titulo: `Mover ${ids.length} producto(s) a subcategoría`,
        campos: [{ key: 'sub', id: 'sub', label: 'Subcategoría destino', tipo: 'select', opciones, requerido: true }],
        textoConfirmar: 'Mover'
    });
    const sub = r?.sub;
    if (!sub) return;
    const afectados = ids.map(id => productosData.productos.find(p => p.id === id)).filter(Boolean);
    afectados.forEach(p => { p.subcategoria = sub; });
    _seleccionProductos.clear();
    _actualizarBarraMasiva();
    productosFiltrados = [...productosData.productos];
    mostrarProductosGestion();
    let ok = true;
    for (const p of afectados) { const r2 = await guardarProductoIndividual(p); ok = ok && r2; }
    mostrarToast(ok ? `${afectados.length} producto(s) movido(s) a ${sub}` : 'Movidos local — sincronizá', ok ? 'success' : 'warning');
}

async function aplicarOrdenProductos(prods, orden) {
    if (orden === 'az') return [...prods].sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (orden === 'za') return [...prods].sort((a, b) => b.nombre.localeCompare(a.nombre));
    if (orden === 'mas-vendidos') {
        const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
        const conteo = {};
        pedidos.forEach(p => (p.items || []).forEach(it => { conteo[it.productoId] = (conteo[it.productoId] || 0) + (it.cantidad || 1); }));
        return [...prods].sort((a, b) => (conteo[b.id] || 0) - (conteo[a.id] || 0));
    }
    if (orden === 'menos-vendidos') {
        const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
        const conteo = {};
        pedidos.forEach(p => (p.items || []).forEach(it => { conteo[it.productoId] = (conteo[it.productoId] || 0) + (it.cantidad || 1); }));
        return [...prods].sort((a, b) => (conteo[a.id] || 0) - (conteo[b.id] || 0));
    }
    return prods;
}

function renderizarCategoriasGestion(container) {
    const cats = productosData.categorias || [];
    const edit = _editandoCatalogo;
    const tiles = cats.map(cat => {
        const count = productosData.productos.filter(p => p.categoria === cat.id).length;
        const prods = productosData.productos.filter(p => p.categoria === cat.id && (p.imagen_url || p.imagen));
        const img = prods.length > 0 ? (prods[0].imagen_url || prods[0].imagen) : '';
        const inactiva = cat.estado && cat.estado !== 'activo';
        const ctrls = edit ? _ctrlBarHTML(
            _ctrlBtnHTML('cat-rename', { cat: cat.id }, SVG_ICON_PENCIL, 'Renombrar', 'rgba(37,99,235,0.92)') +
            _ctrlBtnHTML('cat-toggle', { cat: cat.id }, inactiva ? SVG_ICON_EYE : SVG_ICON_EYE_OFF, inactiva ? 'Activar' : 'Desactivar', 'rgba(100,116,139,0.92)') +
            _ctrlBtnHTML('cat-delete', { cat: cat.id }, SVG_ICON_TRASH, 'Eliminar', 'rgba(220,38,38,0.92)')
        ) : '';
        return `<div ${edit ? 'draggable="true"' : ''} data-drag-type="cat" data-drag-id="${escapeHTML(cat.id)}" data-action="nav-categoria" data-id="${escapeHTML(cat.id)}"
            class="catalog-card${inactiva ? ' opacity-50 grayscale' : ''}${edit ? ' is-editando' : ''}" ${img ? `data-bg="${img}"` : ''}>
            ${edit ? _dragHandleHTML() : ''}${ctrls}
            ${!img ? '<div class="catalog-card-noimg"><i data-lucide="folder-open" class="w-10 h-10 text-gray-400"></i></div>' : ''}
            ${inactiva ? '<span class="catalog-card-badge" style="background:#ef4444;color:#fff;top:8px;left:8px;right:auto;">INACTIVA</span>' : ''}
            <div class="catalog-card-label">
                <div>${escapeHTML(cat.nombre)}</div>
                <div class="card-sub">${count} productos</div>
            </div>
        </div>`;
    }).join('');
    const nuevaTile = edit ? `<div data-action="nuevaCategoriaInline" class="catalog-card catalog-card--loaded" style="border:2px dashed rgba(255,255,255,0.3);cursor:pointer">
        <div class="catalog-card-noimg" style="background:linear-gradient(135deg,#334155,#1e293b)"><i data-lucide="plus" class="w-10 h-10 text-gray-300"></i></div>
        <div class="catalog-card-label"><div>+ Nueva categoría</div></div></div>` : '';
    container.innerHTML = `<div class="catalog-grid" data-drag-scope="cat">${tiles}${nuevaTile}</div>`;
    lucide.createIcons();
    initLazyLoadCards(container);
}

function renderizarSubcategoriasGestion(container, subs) {
    const edit = _editandoCatalogo;
    const verTodos = `<div data-action="nav-subcategoria" data-id=""
        class="catalog-card catalog-card--loaded" style="border:2px dashed rgba(255,255,255,0.3)">
        <div class="catalog-card-noimg" style="background:linear-gradient(135deg,#4b5563,#374151)"><i data-lucide="list" class="w-10 h-10 text-gray-400"></i></div>
        <div class="catalog-card-label"><div>Ver todos</div></div>
    </div>`;
    const tiles = subs.map(sub => {
        const prods = productosData.productos.filter(p => p.categoria === prodNavCatId && p.subcategoria === sub);
        const count = prods.length;
        const imgProd = prods.find(p => p.imagen_url || p.imagen);
        const img = imgProd ? (imgProd.imagen_url || imgProd.imagen) : '';
        const ctrls = edit ? _ctrlBarHTML(
            _ctrlBtnHTML('sub-rename', { cat: prodNavCatId, sub }, SVG_ICON_PENCIL, 'Renombrar', 'rgba(37,99,235,0.92)') +
            _ctrlBtnHTML('sub-delete', { cat: prodNavCatId, sub }, SVG_ICON_TRASH, 'Eliminar', 'rgba(220,38,38,0.92)')
        ) : '';
        return `<div ${edit ? 'draggable="true"' : ''} data-drag-type="sub" data-drag-id="${escapeHTML(sub)}" data-action="nav-subcategoria" data-id="${escapeHTML(sub)}"
            class="catalog-card${edit ? ' is-editando' : ''}" ${img ? `data-bg="${img}"` : ''}>
            ${edit ? _dragHandleHTML() : ''}${ctrls}
            ${!img ? '<div class="catalog-card-noimg"><i data-lucide="folder" class="w-10 h-10 text-gray-400"></i></div>' : ''}
            <div class="catalog-card-label">
                <div>${escapeHTML(sub)}</div>
                <div class="card-sub">${count} productos</div>
            </div>
        </div>`;
    }).join('');
    const nuevaTile = edit ? `<div data-action="nuevaSubcategoriaInline" class="catalog-card catalog-card--loaded" style="border:2px dashed rgba(255,255,255,0.3);cursor:pointer">
        <div class="catalog-card-noimg" style="background:linear-gradient(135deg,#334155,#1e293b)"><i data-lucide="plus" class="w-10 h-10 text-gray-300"></i></div>
        <div class="catalog-card-label"><div>+ Nueva subcategoría</div></div></div>` : '';
    container.innerHTML = `<div class="catalog-grid" data-drag-scope="sub">${verTodos}${tiles}${nuevaTile}</div>`;
    lucide.createIcons();
    initLazyLoadCards(container);
}

function renderizarProductosGestionGrid(container, prods) {
    if (prods.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_PRODUCTS, 'Sin productos encontrados', 'Intenta con otro termino de busqueda');
        return;
    }
    const total = prods.length;
    const inicio = (paginaProductos - 1) * productosPorPagina;
    const paginados = prods.slice(inicio, inicio + productosPorPagina);

    const busquedaActiva = (document.getElementById('buscarProducto')?.value || '').trim();
    const edit = _editandoCatalogo;
    // Rail de subcategorías (drop targets) — solo en edición y si la categoría tiene subcats.
    const catActual = productosData.categorias.find(c => c.id === prodNavCatId);
    const subsRail = (edit && catActual && (catActual.subcategorias || []).length > 0)
        ? `<div class="mover-sub-rail" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px">
             <span class="text-xs text-gray-400 mr-1">Arrastrá productos a:</span>
             ${(catActual.subcategorias || []).map(s => `<span data-drop-sub="${escapeHTML(s)}" class="mover-sub-chip" style="border:1px dashed var(--hairline,#475569);border-radius:999px;padding:4px 10px;font-size:12px;color:var(--ink,#e5e7eb);background:var(--panel-2,#1e293b)">${escapeHTML(s)}</span>`).join('')}
           </div>`
        : '';
    const grid = `<div class="catalog-grid" data-drag-scope="prod">
        ${paginados.map(prod => {
            const estado = prod.estado || 'disponible';
            const estadoBg = estado === 'disponible' ? 'background:#059669;color:#fff' : estado === 'agotado' ? 'background:#d97706;color:#fff' : 'background:#dc2626;color:#fff';
            const oculto = prod.oculto || false;
            const img = prod.imagen_url || prod.imagen || '';
            const precio = prod.presentaciones && prod.presentaciones.length > 0 ? (prod.presentaciones[0].precio_base || 0) : 0;
            const tieneMargenBajo = prod.presentaciones.some(p => {
                const pr = p.precio_base || 0; const co = p.costo || 0;
                return pr > 0 && co > 0 && ((pr - co) / pr) < MARGEN_MINIMO_PCT;
            });
            const tieneStockBajo = (prod.presentaciones || []).some(v => (v.stock || 0) <= STOCK_BAJO_UMBRAL);
            const stockBadgeTop = tieneMargenBajo ? 48 : 28;
            const catNombre = busquedaActiva
                ? (productosData.categorias.find(c => c.id === prod.categoria)?.nombre || prod.categoria)
                : '';
            const isSelected = _seleccionProductos.has(prod.id);
            const ctrls = edit ? _ctrlBarHTML(
                _ctrlBtnHTML('prod-edit', { id: prod.id }, SVG_ICON_PENCIL, 'Editar', 'rgba(37,99,235,0.92)') +
                _ctrlBtnHTML('prod-hide', { id: prod.id }, oculto ? SVG_ICON_EYE : SVG_ICON_EYE_OFF, oculto ? 'Mostrar' : 'Ocultar', 'rgba(100,116,139,0.92)') +
                _ctrlBtnHTML('prod-delete', { id: prod.id }, SVG_ICON_TRASH, 'Eliminar', 'rgba(220,38,38,0.92)')
            ) : '';
            return `<div ${edit ? 'draggable="true"' : ''} data-drag-type="prod" data-drag-id="${escapeHTML(prod.id)}" data-action="abrir-perfil" data-id="${prod.id}" class="catalog-card ${oculto ? 'oculto' : ''}${isSelected ? ' ring-2 ring-indigo-500' : ''}${edit ? ' is-editando' : ''}" ${img ? `data-bg="${img}"` : ''}>
                <div class="card-checkbox-overlay" data-action="toggle-seleccion" data-id="${prod.id}" title="Seleccionar">
                    <input type="checkbox" class="pointer-events-none w-4 h-4 accent-indigo-600" ${isSelected ? 'checked' : ''}>
                </div>
                ${edit ? _dragHandleHTML() : ''}${ctrls}
                ${!img ? '<div class="catalog-card-noimg"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></div>' : ''}
                <span class="catalog-card-badge" style="${estadoBg}">${estado}</span>
                ${tieneMargenBajo ? '<span class="catalog-card-badge" style="background:#f59e0b;color:#fff;top:28px;">⚠ Margen</span>' : ''}
                ${tieneStockBajo ? `<span class="catalog-card-badge" style="background:#dc2626;color:#fff;top:${stockBadgeTop}px;">⚠ Stock</span>` : ''}
                <div class="catalog-card-label">
                    <div>${escapeHTML(prod.nombre)}</div>
                    <div class="card-sub">${catNombre ? escapeHTML(catNombre) + ' · ' : ''}${precio > 0 ? formatearGuaranies(precio) : prod.presentaciones.length + ' pres.'}</div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
    container.innerHTML = subsRail + grid;
    lucide.createIcons();
    initLazyLoadCards(container);
}

function actualizarPaginacionProductos(total) {
    const pagEl = document.getElementById('paginacionProductos');
    if (!pagEl || total === 0) { if (pagEl) pagEl.innerHTML = ''; return; }
    const totalPaginas = Math.ceil(total / productosPorPagina);
    pagEl.innerHTML = `<span class="text-sm">${total} productos | Pag. ${paginaProductos} de ${totalPaginas}</span>
    <div class="flex gap-2">
        <sl-button data-action="pag-primera" variant="default" size="small" ${paginaProductos <= 1 ? 'disabled' : ''}>|&lt;</sl-button>
        <sl-button data-action="pag-anterior" variant="default" size="small" ${paginaProductos <= 1 ? 'disabled' : ''}>&lt;</sl-button>
        <sl-button data-action="pag-siguiente" variant="default" size="small" ${paginaProductos >= totalPaginas ? 'disabled' : ''}>&gt;</sl-button>
        <sl-button data-action="pag-ultima" data-id="${totalPaginas}" variant="default" size="small" ${paginaProductos >= totalPaginas ? 'disabled' : ''}>&gt;|</sl-button>
    </div>`;
    _initPaginacionDelegation(pagEl);
}

// Perfil de producto
function abrirPerfilProducto(prodId) {
    const prod = productosData.productos.find(p => p.id === prodId);
    if (!prod) return;
    const estado = prod.estado || 'disponible';
    const estadoColor = estado === 'disponible' ? 'bg-green-100 text-green-700' : estado === 'agotado' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
    const oculto = prod.oculto || false;

    const img = document.getElementById('perfilProductoImg');
    const imgSrc = prod.imagen_url || prod.imagen || '';
    if (img) { img.src = imgSrc; img.style.display = imgSrc ? '' : 'none'; }
    document.getElementById('perfilProductoNombre').textContent = prod.nombre;
    const catObj = productosData.categorias.find(c => c.id === prod.categoria);
    document.getElementById('perfilProductoCategoria').textContent = `${catObj?.nombre || prod.categoria}${prod.subcategoria ? ' / ' + prod.subcategoria : ''}`;
    const badge = document.getElementById('perfilProductoEstadoBadge');
    badge.textContent = estado; badge.className = `inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold ${estadoColor}`;

    // Botones de accion
    document.getElementById('perfilProductoEditarBtn').onclick = () => { cerrarPerfilProducto(); editarProducto(prodId); };
    document.getElementById('perfilProductoClonarBtn').onclick = () => { cerrarPerfilProducto(); clonarProducto(prodId); };
    const ocultarBtn = document.getElementById('perfilProductoOcultarBtn');
    ocultarBtn.textContent = oculto ? 'Mostrar' : 'Ocultar';
    ocultarBtn.onclick = () => { toggleOcultarProducto(prodId); cerrarPerfilProducto(); };
    document.getElementById('perfilProductoEliminarBtn').onclick = () => { cerrarPerfilProducto(); eliminarProducto(prodId); };

    // Presentaciones
    const presEl = document.getElementById('perfilProductoPresentaciones');
    presEl.innerHTML = prod.presentaciones.map(p => {
        const costo = p.costo || 0;
        const precio = p.precio_base || 0;
        const margen = precio > 0 && costo > 0 ? Math.round(((precio - costo) / precio) * 100) : null;
        return `<div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0 text-sm">
            <span class="font-medium text-gray-700">${escapeHTML(p.tamano)}</span>
            <div class="flex gap-4 text-right">
                ${costo > 0 ? `<span class="text-gray-500">Costo: <strong>${formatearGuaranies(costo)}</strong></span>` : ''}
                <span class="text-gray-800">Precio: <strong>${formatearGuaranies(precio)}</strong></span>
                ${margen !== null ? `<span class="${margen > 30 ? 'text-green-600' : margen > 15 ? 'text-yellow-600' : 'text-red-600'} font-bold">${margen}%</span>${margen < (MARGEN_MINIMO_PCT * 100) ? ' <span class="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-1">MARGEN BAJO</span>' : ''}` : ''}
            </div>
        </div>`;
    }).join('');

    // Stock
    const stockEl = document.getElementById('perfilProductoStock');
    stockEl.innerHTML = prod.presentaciones.map(p => `
        <div class="flex items-center gap-3 py-1">
            <span class="text-sm text-gray-600 w-20">${escapeHTML(p.tamano)}</span>
            <span class="font-bold ${(p.stock || 0) <= 0 ? 'text-red-600' : 'text-green-600'}">${p.stock || 0}</span>
            <div class="flex gap-1 ml-auto">
                <sl-button data-action="ajustarStock" data-pid="${escapeHTML(prodId)}" data-tam="${escapeHTML(p.tamano)}" data-delta="-1" data-perfil="1" variant="danger" size="small">−</sl-button>
                <sl-button data-action="ajustarStock" data-pid="${escapeHTML(prodId)}" data-tam="${escapeHTML(p.tamano)}" data-delta="1" data-perfil="1" variant="success" size="small">+</sl-button>
                <sl-button data-action="ajustarStock" data-pid="${escapeHTML(prodId)}" data-tam="${escapeHTML(p.tamano)}" data-delta="10" data-perfil="1" variant="primary" size="small">+10</sl-button>
            </div>
        </div>`).join('');

    document.getElementById('modalPerfilProducto').show();
}

function cerrarPerfilProducto() {
    document.getElementById('modalPerfilProducto').hide();
}

function clonarProducto(prodId) {
    const original = productosData.productos.find(p => p.id === prodId);
    if (!original) return;
    const ultimoId = Math.max(...productosData.productos.map(p => parseInt(p.id.replace(/\D/g, '')) || 0), 0);
    const nuevoId = `P${String(ultimoId + 1).padStart(3, '0')}`;
    const clon = JSON.parse(JSON.stringify(original));
    clon.id = nuevoId;
    clon.nombre = `Copia de ${original.nombre}`;
    clon.imagen_url = '';
    clon.imagen = '';
    // Limpiar variante_id en presentaciones para que se creen como nuevas
    (clon.presentaciones || []).forEach(p => { delete p.variante_id; });
    productosData.productos.push(clon);
    productosFiltrados.push(clon);
    registrarCambio();
    mostrarProductosGestion();
    mostrarExito(`Producto clonado como "${clon.nombre}". Podés editarlo ahora.`);
    setTimeout(() => editarProducto(nuevoId), 400);
}

// ============================================
// DRAG & DROP — Zona de imagen en modal crear/editar
// ============================================
(function _initImageDragDrop() {
    document.addEventListener('DOMContentLoaded', () => {
        const zone = document.getElementById('productImagePreview');
        if (!zone) return;
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.style.borderColor = '#5681AE';
            zone.style.background = 'rgba(61,90,120,0.18)';
        });
        zone.addEventListener('dragleave', () => {
            zone.style.borderColor = '';
            zone.style.background = '';
        });
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.style.borderColor = '';
            zone.style.background = '';
            const file = e.dataTransfer?.files?.[0];
            if (!file || !file.type.startsWith('image/')) {
                mostrarToast('Solo se aceptan imágenes (JPG, PNG, WebP)', 'error');
                return;
            }
            archivoImagenProducto = file;
            const reader = new FileReader();
            reader.onload = (ev) => {
                zone.innerHTML = `<img src="${ev.target.result}" class="w-full h-full object-cover">`;
                const btnQuitar = document.getElementById('btnQuitarImagen');
                if (btnQuitar) btnQuitar.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        });
        // Clic en el área también abre el file picker
        zone.addEventListener('click', () => document.getElementById('productImageInput')?.click());
    });
})()

function guardarStockDesdePerfilProducto() {
    guardarStock();
    mostrarProductosGestion();
}

function actualizarProducto(id, campo, valor) {
    const p = productosData.productos.find(x => x.id === id);
    if (p) { p[campo] = valor; registrarCambio(); }
}

function actualizarPresentacion(id, idx, campo, valor) {
    const p = productosData.productos.find(x => x.id === id);
    if (p && p.presentaciones[idx]) {
        if (campo === 'precio') p.presentaciones[idx].precio_base = parseInt(valor) || 0;
        else if (campo === 'costo') p.presentaciones[idx].costo = parseInt(valor) || 0;
        else p.presentaciones[idx].tamano = valor;
        registrarCambio();
    }
}

function eliminarPresentacion(id, idx) {
    const p = productosData.productos.find(x => x.id === id);
    if (p && p.presentaciones.length > 1) { p.presentaciones.splice(idx, 1); registrarCambio(); mostrarProductosGestion(); }
    else mostrarToast('Debe tener al menos una presentacion', 'error');
}

function agregarPresentacion(id) {
    const p = productosData.productos.find(x => x.id === id);
    if (p) { p.presentaciones.push({ tamano: '', precio_base: 0, costo: 0 }); registrarCambio(); mostrarProductosGestion(); }
}

async function eliminarProducto(id) {
    if (!await mostrarConfirmModal('¿Eliminar este producto?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    productosData.productos = productosData.productos.filter(p => p.id !== id);
    productosFiltrados = productosFiltrados.filter(p => p.id !== id);
    registrarCambio();
    mostrarProductosGestion();
}

function toggleOcultarProducto(id) {
    const prod = productosData.productos.find(p => p.id === id);
    if (prod) { prod.oculto = !prod.oculto; registrarCambio(); mostrarProductosGestion(); }
}

// ============================================
// VARIANTES DE PRODUCTO
// ============================================

function toggleModoVariantes() {
    const activo = document.getElementById('toggleVariantes').checked;
    document.getElementById('camposSimple').classList.toggle('hidden', activo);
    document.getElementById('camposVariantes').classList.toggle('hidden', !activo);
    // Si se activa y no hay filas, agregar una vacia
    if (activo && document.getElementById('listaVariantes').children.length === 0) {
        agregarFilaVariante();
    }
}

function agregarFilaVariante(datos) {
    const container = document.getElementById('listaVariantes');
    const d = datos || { nombre: '', precio: '', costo: '', stock: '', activo: true };
    const fila = document.createElement('div');
    fila.className = 'variante-fila flex items-center gap-2 px-2 py-1.5 bg-white hover:bg-gray-50 transition-colors';
    fila.innerHTML = `
        <input type="text" placeholder="1L, 500ml, Talle 40..." value="${escapeHTML(String(d.nombre))}"
               class="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-sm var-nombre focus:ring-1 focus:ring-indigo-300 focus:outline-none">
        <input type="number" placeholder="0" value="${d.precio || ''}"
               class="w-24 border border-gray-200 rounded px-2 py-1 text-sm var-precio text-right focus:ring-1 focus:ring-indigo-300 focus:outline-none">
        <input type="number" placeholder="0" value="${d.costo || ''}"
               class="w-20 border border-gray-200 rounded px-2 py-1 text-sm var-costo text-right focus:ring-1 focus:ring-indigo-300 focus:outline-none">
        <input type="number" placeholder="0" value="${d.stock || ''}"
               class="w-16 border border-gray-200 rounded px-2 py-1 text-sm var-stock text-right focus:ring-1 focus:ring-indigo-300 focus:outline-none">
        <label class="w-8 flex items-center justify-center cursor-pointer shrink-0" title="Activo/Inactivo">
            <input type="checkbox" class="sr-only peer var-activo" ${d.activo !== false ? 'checked' : ''}>
            <div class="relative w-7 h-4 bg-gray-300 rounded-full peer peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-3"></div>
        </label>
        <button type="button" data-action="quitarFila" data-sel=".variante-fila"
                class="w-6 text-gray-300 hover:text-red-500 transition-colors shrink-0" title="Eliminar fila">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>`;
    container.appendChild(fila);
}

function recogerVariantes() {
    const filas = document.querySelectorAll('#listaVariantes .variante-fila');
    const variantes = [];
    filas.forEach(fila => {
        const nombre = fila.querySelector('.var-nombre')?.value.trim();
        if (!nombre) return;
        variantes.push({
            tamano: nombre,
            precio_base: parseInt(fila.querySelector('.var-precio')?.value) || 0,
            costo: parseInt(fila.querySelector('.var-costo')?.value) || 0,
            stock: parseInt(fila.querySelector('.var-stock')?.value) || 0,
            activo: fila.querySelector('.var-activo')?.checked ?? true
        });
    });
    return variantes;
}

function cargarVariantesEnModal(presentaciones) {
    const container = document.getElementById('listaVariantes');
    container.innerHTML = '';
    (presentaciones || []).forEach(p => {
        agregarFilaVariante({
            nombre: p.tamano || '',
            precio: p.precio_base || 0,
            costo: p.costo || 0,
            stock: p.stock || 0,
            activo: p.activo !== false
        });
    });
}

// ============================================
// IMAGEN DE PRODUCTO - Compresion y Upload
// ============================================

function previsualizarImagenProducto(event) {
    const file = event.target.files[0];
    if (!file) return;
    archivoImagenProducto = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('productImagePreview');
        preview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
        document.getElementById('btnQuitarImagen').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function quitarImagenProducto() {
    archivoImagenProducto = null;
    document.getElementById('productImageInput').value = '';
    document.getElementById('nuevoProductoImagen').value = '';
    document.getElementById('productImagePreview').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
    document.getElementById('btnQuitarImagen').classList.add('hidden');
}

async function comprimirImagen(file, maxSize = 800, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;
                // Redimensionar manteniendo aspecto
                if (w > maxSize || h > maxSize) {
                    if (w > h) {
                        h = Math.round((h * maxSize) / w);
                        w = maxSize;
                    } else {
                        w = Math.round((w * maxSize) / h);
                        h = maxSize;
                    }
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(
                    (blob) => blob ? resolve(blob) : reject(new Error('Error comprimiendo imagen')),
                    'image/webp',
                    quality
                );
            };
            img.onerror = () => reject(new Error('Error cargando imagen'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Error leyendo archivo'));
        reader.readAsDataURL(file);
    });
}

async function subirImagenProducto(file) {
    const blob = await comprimirImagen(file);
    const fileName = `prod_${Date.now()}.webp`;
    const { data, error } = await supabaseClient.storage
        .from('productos_img')
        .upload(fileName, blob, { contentType: 'image/webp', upsert: false });
    if (error) throw new Error('Error subiendo imagen: ' + error.message);
    const { data: urlData } = supabaseClient.storage
        .from('productos_img')
        .getPublicUrl(fileName);
    return urlData.publicUrl;
}

// ============================================
// MODAL PRODUCTO (crear/editar)
// ============================================

function abrirModalProducto(productoId) {
    const titulo = document.getElementById('modalProductoTitulo');
    const formId = document.getElementById('formProductoId');
    const presDetalladas = document.getElementById('presentacionesDetalladas');
    const presInput = document.getElementById('nuevoProductoPresentaciones');
    const presInfo = document.getElementById('modalProductoPresInfo');

    // Poblar categorias (+ opción crear al vuelo)
    const select = document.getElementById('nuevoProductoCategoria');
    if (select) {
        select.innerHTML = '';
        productosData.categorias.forEach(c => {
            select.innerHTML += `<sl-option value="${escapeHTML(c.id)}">${escapeHTML(c.nombre)}</sl-option>`;
        });
        select.innerHTML += `<sl-option value="__nueva__">+ Nueva categoría…</sl-option>`;
    }

    // Reset imagen
    archivoImagenProducto = null;
    document.getElementById('productImageInput').value = '';
    document.getElementById('btnQuitarImagen').classList.add('hidden');

    if (productoId) {
        // Modo edicion
        const prod = productosData.productos.find(p => p.id === productoId);
        if (!prod) return;
        titulo.textContent = 'Editar Producto';
        formId.value = prod.id;
        document.getElementById('nuevoProductoNombre').value = prod.nombre;
        const imgActual = prod.imagen_url || prod.imagen || '';
        document.getElementById('nuevoProductoImagen').value = imgActual;
        // Mostrar preview si tiene imagen
        const preview = document.getElementById('productImagePreview');
        if (imgActual) {
            preview.innerHTML = `<img src="${imgActual}" class="w-full h-full object-cover">`;
            document.getElementById('btnQuitarImagen').classList.remove('hidden');
        } else {
            preview.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
        }
        document.getElementById('nuevoProductoCategoria').value = prod.categoria;
        actualizarSubcategoriasModal();
        document.getElementById('nuevoProductoSubcategoria').value = prod.subcategoria || '';
        document.getElementById('nuevoProductoEstado').value = prod.estado || 'disponible';
        document.getElementById('nuevoProductoTipoImpuesto').value = _normalizarTipoImpuesto(prod.tipo_impuesto);
        document.getElementById('nuevoProductoUnidadMedida').value = prod.unidad_medida_set || '77';

        // Determinar si tiene multiples variantes
        const tieneVariantes = prod.presentaciones && prod.presentaciones.length > 1;
        const toggle = document.getElementById('toggleVariantes');
        toggle.checked = tieneVariantes;

        if (tieneVariantes) {
            // Modo variantes: cargar todas las presentaciones como filas
            document.getElementById('camposSimple').classList.add('hidden');
            document.getElementById('camposVariantes').classList.remove('hidden');
            cargarVariantesEnModal(prod.presentaciones);
            document.getElementById('nuevoProductoPrecio').value = '';
            document.getElementById('nuevoProductoCosto').value = '';
        } else {
            // Modo simple: una sola presentacion
            document.getElementById('camposSimple').classList.remove('hidden');
            document.getElementById('camposVariantes').classList.add('hidden');
            document.getElementById('nuevoProductoPrecio').value = prod.presentaciones[0]?.precio_base || 0;
            document.getElementById('nuevoProductoCosto').value = prod.presentaciones[0]?.costo || 0;
            document.getElementById('nuevoProductoStock').value = prod.presentaciones[0]?.stock || 0;
            document.getElementById('nuevoProductoPresentaciones').value = prod.presentaciones[0]?.tamano || 'Unidad';
            document.getElementById('listaVariantes').innerHTML = '';
        }
        presDetalladas.style.display = 'none';
    } else {
        // Modo creacion
        titulo.textContent = 'Nuevo Producto';
        formId.value = '';
        ['nuevoProductoNombre','nuevoProductoImagen','nuevoProductoPresentaciones','nuevoProductoPrecio','nuevoProductoCosto','nuevoProductoStock'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        document.getElementById('nuevoProductoEstado').value = 'disponible';
        document.getElementById('nuevoProductoTipoImpuesto').value = '10';
        document.getElementById('nuevoProductoUnidadMedida').value = '77';
        // Reset variantes
        document.getElementById('toggleVariantes').checked = false;
        document.getElementById('camposSimple').classList.remove('hidden');
        document.getElementById('camposVariantes').classList.add('hidden');
        document.getElementById('listaVariantes').innerHTML = '';
        presDetalladas.style.display = 'none';
        // Reset preview imagen
        document.getElementById('productImagePreview').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
        actualizarSubcategoriasModal();
    }
    document.getElementById('modalProducto')?.show();
    _actualizarVendibilidad();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function editarProducto(id) { abrirModalProducto(id); }

// Normaliza valores legacy ('iva10','iva5') a formato limpio ('10','5','exenta')
function _normalizarTipoImpuesto(val) {
    if (!val) return '10';
    const v = String(val).toLowerCase().trim();
    if (v === 'iva10' || v === '10') return '10';
    if (v === 'iva5' || v === '5') return '5';
    if (v === 'exenta' || v === 'exento' || v === '0') return 'exenta';
    return '10';
}

function agregarPresModal() {
    const container = document.getElementById('presentacionesDetalladas');
    const idx = container.querySelectorAll('[data-pres-idx]').length / 3;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 mb-2 bg-gray-50 p-2 rounded-lg';
    div.innerHTML = `
        <input type="text" data-pres-idx="${idx}" data-pres-field="tamano" class="w-20 px-2 py-1 text-sm border rounded" placeholder="Tamano">
        <label class="text-xs text-gray-400">Precio:</label>
        <input type="number" value="0" data-pres-idx="${idx}" data-pres-field="precio" class="w-24 px-2 py-1 text-sm border rounded">
        <label class="text-xs text-gray-400">Costo:</label>
        <input type="number" value="0" data-pres-idx="${idx}" data-pres-field="costo" class="w-24 px-2 py-1 text-sm border rounded">
        <sl-button data-action="quitarFila" data-sel="parent" variant="text" size="small">x</sl-button>`;
    container.querySelector('button:last-child').before(div);
}

function actualizarSubcategoriasModal() {
    const catId = document.getElementById('nuevoProductoCategoria')?.value;
    const subSel = document.getElementById('nuevoProductoSubcategoria');
    if (!subSel) return;
    const cat = productosData.categorias.find(c => c.id === catId);
    subSel.innerHTML = '<sl-option value="">Seleccionar...</sl-option>';
    if (cat && cat.subcategorias) {
        cat.subcategorias.forEach(s => {
            subSel.innerHTML += `<sl-option value="${escapeHTML(s)}">${escapeHTML(s)}</sl-option>`;
        });
    }
    subSel.innerHTML += '<sl-option value="__otra__">+ Otra...</sl-option>';
}

function cerrarModalProducto() {
    document.getElementById('modalProducto')?.hide();
}

function _leerFormProducto() {
    return {
        id: document.getElementById('formProductoId')?.value,
        nombre: document.getElementById('nuevoProductoNombre')?.value.trim(),
        imagen: document.getElementById('nuevoProductoImagen')?.value.trim(),
        categoria: document.getElementById('nuevoProductoCategoria')?.value,
        subcategoria: document.getElementById('nuevoProductoSubcategoria')?.value,
        estado: document.getElementById('nuevoProductoEstado')?.value || 'disponible',
        tipoImpuesto: document.getElementById('nuevoProductoTipoImpuesto')?.value || '10',
        unidadMedida: document.getElementById('nuevoProductoUnidadMedida')?.value || '77',
        precio: parseInt(document.getElementById('nuevoProductoPrecio')?.value) || 0,
        costo: parseInt(document.getElementById('nuevoProductoCosto')?.value) || 0,
        stockSimple: parseInt(document.getElementById('nuevoProductoStock')?.value) || 0
    };
}

function _parsearPresentaciones(precio, costo, stockSimple) {
    const modoVariantes = document.getElementById('toggleVariantes').checked;
    if (modoVariantes) {
        const variantes = recogerVariantes();
        if (variantes.length === 0) return null;
        return variantes;
    }
    const presStr = document.getElementById('nuevoProductoPresentaciones')?.value.trim();
    return presStr
        ? presStr.split(',').map(p => ({ tamano: p.trim(), precio_base: precio, costo, stock: stockSimple }))
        : [{ tamano: 'Unidad', precio_base: precio, costo, stock: stockSimple }];
}

// Aplica en memoria y devuelve el producto (para auto-guardado individual).
function _aplicarCambiosProducto(id, datos, presentaciones, imagenUrl) {
    if (id) {
        const prod = productosData.productos.find(p => p.id === id);
        if (!prod) return null;
        prod.nombre = datos.nombre;
        prod.imagen_url = imagenUrl || undefined;
        prod.imagen = imagenUrl || undefined;
        prod.categoria = datos.categoria;
        prod.subcategoria = datos.subcategoria || 'General';
        prod.estado = datos.estado;
        prod.tipo_impuesto = datos.tipoImpuesto;
        prod.unidad_medida_set = datos.unidadMedida;
        prod.presentaciones = presentaciones;
        return prod;
    }
    const nuevoId = _siguienteIdProducto();
    const catId = datos.categoria || (productosData.categorias[0]?.id) || null;
    const nuevo = {
        id: nuevoId, nombre: datos.nombre,
        categoria: catId,
        subcategoria: datos.subcategoria || 'General',
        presentaciones, estado: datos.estado,
        tipo_impuesto: datos.tipoImpuesto,
        unidad_medida_set: datos.unidadMedida,
        orden: _siguienteOrdenProducto(catId)
    };
    if (imagenUrl) { nuevo.imagen = imagenUrl; nuevo.imagen_url = imagenUrl; }
    productosData.productos.push(nuevo);
    return nuevo;
}

// ============================================
// VENDIBILIDAD (checklist en vivo) + MARGEN + CATEGORIA INLINE
// ============================================

// Presentaciones actuales del modal (mismo criterio que _parsearPresentaciones
// pero SIEMPRE devuelve array — para el checklist en vivo).
function _presentacionesActuales() {
    if (document.getElementById('toggleVariantes')?.checked) {
        return recogerVariantes();
    }
    const precio = parseInt(document.getElementById('nuevoProductoPrecio')?.value) || 0;
    const costo = parseInt(document.getElementById('nuevoProductoCosto')?.value) || 0;
    const stock = parseInt(document.getElementById('nuevoProductoStock')?.value) || 0;
    const presStr = (document.getElementById('nuevoProductoPresentaciones')?.value || '').trim();
    return presStr
        ? presStr.split(',').map(p => ({ tamano: p.trim(), precio_base: precio, costo, stock, activo: true }))
        : [{ tamano: 'Unidad', precio_base: precio, costo, stock, activo: true }];
}

// Valida requisitos estructurales de vendibilidad. Devuelve motivo (string) o null si OK.
function _validarVendibilidad(datos, presentaciones) {
    if (!datos.nombre) return 'Ingresá el nombre del producto';
    if (!datos.categoria || datos.categoria === '__nueva__') return 'Elegí o creá una categoría';
    if (!presentaciones || presentaciones.length === 0) return 'Agregá al menos una variante';
    const activas = presentaciones.filter(p => p.activo !== false && (p.tamano || '').trim() !== '');
    if (activas.length === 0) return 'Necesitás al menos una variante activa';
    if (!activas.some(p => (p.precio_base || 0) > 0)) return 'Poné un precio mayor a 0';
    return null;
}

function _actualizarMargenSimple() {
    const el = document.getElementById('modalMargenSimple');
    if (!el) return;
    if (document.getElementById('toggleVariantes')?.checked) { el.classList.add('hidden'); return; }
    const precio = parseInt(document.getElementById('nuevoProductoPrecio')?.value) || 0;
    const costo = parseInt(document.getElementById('nuevoProductoCosto')?.value) || 0;
    if (precio <= 0 || costo <= 0) { el.classList.add('hidden'); return; }
    const margen = Math.round(((precio - costo) / precio) * 100);
    const bajo = margen < (MARGEN_MINIMO_PCT * 100);
    el.className = `text-[11px] mb-3 font-semibold ${bajo ? 'text-amber-600' : 'text-green-600'}`;
    el.textContent = `Margen: ${margen}%${bajo ? ' — margen bajo' : ''}`;
    el.classList.remove('hidden');
}

// Recalcula el checklist en vivo + margen + habilita/deshabilita Guardar.
function _actualizarVendibilidad() {
    const ul = document.getElementById('vendibilidadChecklist');
    if (!ul) return;
    const nombre = (document.getElementById('nuevoProductoNombre')?.value || '').trim();
    const catVal = document.getElementById('nuevoProductoCategoria')?.value || '';
    const catOk = !!catVal && catVal !== '__nueva__';
    const estado = document.getElementById('nuevoProductoEstado')?.value || 'disponible';
    const pres = _presentacionesActuales();
    const activas = pres.filter(p => p.activo !== false && (p.tamano || '').trim() !== '');
    const tieneActiva = activas.length > 0;
    const tienePrecio = activas.some(p => (p.precio_base || 0) > 0);

    const items = [
        { label: 'Nombre', ok: nombre.length > 0 },
        { label: 'Categoría definida', ok: catOk },
        { label: 'Al menos una variante activa', ok: tieneActiva },
        { label: 'Precio mayor a 0', ok: tienePrecio },
        estado === 'discontinuado'
            ? { label: 'Está discontinuado — NO se mostrará', ok: false, warn: true }
            : { label: estado === 'agotado' ? 'Visible (agotado, igual se muestra)' : 'Visible en el catálogo', ok: true }
    ];
    ul.innerHTML = items.map(it => {
        const color = it.ok ? 'text-green-600' : (it.warn ? 'text-amber-600' : 'text-red-500');
        const icon = it.ok ? '✓' : (it.warn ? '!' : '✗');
        return `<li class="flex items-center gap-1.5 ${color}"><span class="font-bold w-3 text-center">${icon}</span> ${escapeHTML(it.label)}</li>`;
    }).join('');

    _actualizarMargenSimple();

    const bloqueado = !(nombre.length > 0 && catOk && tieneActiva && tienePrecio);
    ['btnGuardarProducto', 'btnGuardarProductoYOtro'].forEach(id => {
        const b = document.getElementById(id); if (b) b.disabled = bloqueado;
    });
}

// Crea una categoría al vuelo desde el modal de producto.
async function _crearCategoriaInlineDesdeModal() {
    const r = await mostrarInputModal({
        titulo: 'Nueva categoría', icono: 'folder-plus',
        campos: [{ key: 'nombre', label: 'Nombre de la categoría', tipo: 'text', requerido: true }],
        textoConfirmar: 'Crear'
    });
    if (!r || !(r.nombre || '').trim()) return null;
    const nombre = r.nombre.trim();
    const id = nombre.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
    if (!id) return null;
    let cat = productosData.categorias.find(c => c.id === id);
    if (!cat) {
        cat = { id, nombre, subcategorias: [], estado: 'activo', orden: productosData.categorias.length };
        productosData.categorias.push(cat);
        poblarFiltroCategorias();
    }
    return cat;
}

function _poblarSelectCategoriasModal(sel, valorSeleccionado) {
    if (!sel) return;
    sel.innerHTML = productosData.categorias
        .map(c => `<sl-option value="${escapeHTML(c.id)}">${escapeHTML(c.nombre)}</sl-option>`).join('')
        + `<sl-option value="__nueva__">+ Nueva categoría…</sl-option>`;
    if (valorSeleccionado) sel.value = valorSeleccionado;
}

async function _onCategoriaModalChange() {
    const sel = document.getElementById('nuevoProductoCategoria');
    if (sel && sel.value === '__nueva__') {
        const cat = await _crearCategoriaInlineDesdeModal();
        _poblarSelectCategoriasModal(sel, cat ? cat.id : (productosData.categorias[0]?.id || ''));
    }
    actualizarSubcategoriasModal();
    _actualizarVendibilidad();
}

function _resetModalProductoParaCrear() {
    abrirModalProducto(); // reusa el reset a modo creación
    setTimeout(() => {
        const n = document.getElementById('nuevoProductoNombre');
        if (n && typeof n.focus === 'function') n.focus();
    }, 60);
}

async function guardarProductoModal(opts = {}) {
    const cargarOtro = opts && opts.cargarOtro === true;
    const datos = _leerFormProducto();

    if (datos.subcategoria === '__otra__') {
        const modal = await mostrarInputModal({
            titulo: 'Nueva Subcategoria',
            icono: 'tag',
            campos: [{ key: 'nombre', label: 'Nombre de la subcategoria', tipo: 'text', requerido: true }],
            textoConfirmar: 'Crear'
        });
        if (!modal) return;
        datos.subcategoria = modal.nombre;
    }

    // Gate de vendibilidad (bloqueo si quedaría invisible/roto en la app del vendedor)
    const presentaciones = _parsearPresentaciones(datos.precio, datos.costo, datos.stockSimple);
    const motivo = _validarVendibilidad(datos, presentaciones);
    if (motivo) { mostrarToast(motivo, 'error'); return; }

    const btnId = cargarOtro ? 'btnGuardarProductoYOtro' : 'btnGuardarProducto';
    await withButtonLock(btnId, async () => {
        let imagenUrl = datos.imagen;
        if (archivoImagenProducto) {
            try {
                imagenUrl = await subirImagenProducto(archivoImagenProducto);
            } catch (e) {
                console.error('[Admin] Error subiendo imagen:', e);
                const seguir = await mostrarConfirmModal('No se pudo subir la imagen. ¿Guardar el producto sin imagen?', { textoConfirmar: 'Guardar sin imagen' });
                if (!seguir) return;
                imagenUrl = datos.imagen || '';
            }
            archivoImagenProducto = null;
        }

        const prod = _aplicarCambiosProducto(datos.id, datos, presentaciones, imagenUrl);
        if (!prod) { mostrarToast('No se pudo guardar el producto', 'error'); return; }

        productosFiltrados = [...productosData.productos];

        // Auto-guardado: publica el producto (y su categoría) al vendedor al instante.
        const cat = productosData.categorias.find(c => c.id === prod.categoria);
        const ok = await guardarProductoIndividual(prod, cat ? { categoria: cat } : {});
        if (ok) {
            mostrarToast('Guardado y publicado a la app del vendedor', 'success');
        } else {
            registrarCambio(); // fallback: quedará para "Guardar y Sincronizar"
            mostrarToast('Guardado local — sincronizá para publicarlo', 'warning');
        }

        mostrarProductosGestion();
        if (cargarOtro) _resetModalProductoParaCrear();
        else cerrarModalProducto();
    }, 'Guardando...')();
}

// ============================================
// GESTION DE CATEGORIAS
// ============================================

function abrirModalCategorias() {
    renderizarListaCategorias();
    document.getElementById('modalCategorias')?.show();
}
function cerrarModalCategorias() {
    document.getElementById('modalCategorias')?.hide();
}

function renderizarListaCategorias() {
    const container = document.getElementById('listaCategoriasCuerpo');
    if (!container) return;
    container.innerHTML = '';
    (productosData.categorias || []).forEach(cat => {
        const activa = !cat.estado || cat.estado === 'activo';
        const numProds = productosData.productos.filter(p => p.categoria === cat.id).length;
        const div = document.createElement('div');
        div.className = `rounded-xl p-4 border transition-all ${activa ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200 opacity-70'}`;
        div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <span id="cat-nombre-${escapeHTML(cat.id)}" class="font-bold text-gray-800 truncate">${escapeHTML(cat.nombre)}</span>
                    <span class="text-xs text-gray-400 shrink-0">(${escapeHTML(cat.id)})</span>
                    <button data-action="editarNombreCategoria" data-cat="${escapeHTML(cat.id)}" class="text-gray-400 hover:text-indigo-600 transition-colors shrink-0" title="Renombrar">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                    </button>
                    ${!activa ? '<span class="text-[10px] font-bold bg-red-200 text-red-700 px-1.5 py-0.5 rounded">INACTIVA</span>' : ''}
                </div>
                <div class="flex items-center gap-3 shrink-0">
                    <span class="text-xs text-gray-400">${numProds} prod.</span>
                    <sl-switch size="small" ${activa ? 'checked' : ''} title="${activa ? 'Desactivar categoría' : 'Activar categoría'}"
                        data-action-slchange="toggleEstadoCategoria" data-cat="${escapeHTML(cat.id)}"></sl-switch>
                    <sl-button data-action="eliminarCategoria" data-cat="${escapeHTML(cat.id)}" variant="text" size="small">Eliminar</sl-button>
                </div>
            </div>
            <div class="flex flex-wrap gap-2 mb-2">
                ${(cat.subcategorias || []).map(s => `
                    <span class="bg-white px-2 py-1 rounded-lg text-xs border border-gray-200 flex items-center gap-1">
                        ${escapeHTML(s)} <sl-button data-action="eliminarSubcategoria" data-cat="${escapeHTML(cat.id)}" data-sub="${escapeHTML(s)}" variant="text" size="small">x</sl-button>
                    </span>`).join('')}
            </div>
            <div class="flex gap-2">
                <input type="text" id="nuevaSub_${cat.id}" class="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs" placeholder="Nueva subcategoria...">
                <sl-button data-action="agregarSubcategoria" data-cat="${escapeHTML(cat.id)}" variant="neutral" size="small">+</sl-button>
            </div>`;
        container.appendChild(div);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function editarNombreCategoria(catId) {
    const cat = productosData.categorias.find(c => c.id === catId);
    if (!cat) return;
    const span = document.getElementById(`cat-nombre-${catId}`);
    if (!span) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = cat.nombre;
    input.className = 'border border-indigo-400 rounded-lg px-2 py-0.5 text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-40';
    span.replaceWith(input);
    input.focus();
    input.select();

    let guardado = false;
    const guardar = () => {
        if (guardado) return;
        guardado = true;
        const nuevoNombre = input.value.trim();
        if (!nuevoNombre) { mostrarToast('El nombre no puede estar vacío', 'error'); renderizarListaCategorias(); return; }
        if (nuevoNombre === cat.nombre) { renderizarListaCategorias(); return; }
        cat.nombre = nuevoNombre;
        registrarCambio();
        renderizarListaCategorias();
        mostrarExito('Nombre actualizado — guardá y sincronizá para aplicar');
    };
    input.addEventListener('blur', guardar);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); guardar(); }
        if (e.key === 'Escape') { guardado = true; renderizarListaCategorias(); }
    });
}

function toggleEstadoCategoria(catId, checked) {
    const cat = productosData.categorias.find(c => c.id === catId);
    if (!cat) return;
    const nuevoEstado = checked ? 'activo' : 'inactivo';
    if (nuevoEstado === 'inactivo') {
        const numProds = productosData.productos.filter(p => p.categoria === catId).length;
        if (numProds > 0 && !confirm(`¿Desactivar esta categoría? ${numProds} producto(s) dejarán de verse en la app del vendedor.`)) {
            renderizarListaCategorias(); return;
        }
    }
    cat.estado = nuevoEstado;
    registrarCambio();
    renderizarListaCategorias();
    mostrarExito(`Categoría ${nuevoEstado === 'activo' ? 'activada' : 'desactivada'} — guardá y sincronizá para aplicar`);
}

function agregarCategoriaModal() {
    const id = document.getElementById('nuevaCategoriaId')?.value.trim().toLowerCase().replace(/\s+/g, '_');
    const nombre = document.getElementById('nuevaCategoriaNombre')?.value.trim();
    if (!id || !nombre) { mostrarToast('ID y nombre son obligatorios', 'error'); return; }
    if (productosData.categorias.find(c => c.id === id)) { mostrarToast('Ya existe esta categoria', 'error'); return; }
    productosData.categorias.push({ id, nombre, subcategorias: [] });
    registrarCambio();
    document.getElementById('nuevaCategoriaId').value = '';
    document.getElementById('nuevaCategoriaNombre').value = '';
    renderizarListaCategorias();
}

async function eliminarCategoria(catId) {
    const prods = productosData.productos.filter(p => p.categoria === catId);
    if (prods.length > 0) { mostrarToast(`No se puede eliminar: ${prods.length} productos usan esta categoria`, 'error'); return; }
    if (!await mostrarConfirmModal('¿Eliminar esta categoria?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    productosData.categorias = productosData.categorias.filter(c => c.id !== catId);
    registrarCambio();
    renderizarListaCategorias();
}

function agregarSubcategoria(catId) {
    const input = document.getElementById('nuevaSub_' + catId);
    const nombre = input?.value.trim();
    if (!nombre) return;
    const cat = productosData.categorias.find(c => c.id === catId);
    if (cat) {
        if (!cat.subcategorias) cat.subcategorias = [];
        if (cat.subcategorias.includes(nombre)) { mostrarToast('Ya existe', 'error'); return; }
        cat.subcategorias.push(nombre);
        registrarCambio();
        input.value = '';
        renderizarListaCategorias();
    }
}

function eliminarSubcategoria(catId, subNombre) {
    const cat = productosData.categorias.find(c => c.id === catId);
    if (cat) {
        cat.subcategorias = (cat.subcategorias || []).filter(s => s !== subNombre);
        registrarCambio();
        renderizarListaCategorias();
    }
}

// ============================================
// IMPORTACION MASIVA
// ============================================

function _parsearArchivo(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                if (typeof XLSX !== 'undefined' && /\.(xlsx|xls)$/i.test(file.name)) {
                    const wb = XLSX.read(e.target.result, { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                    resolve(rows);
                } else {
                    // CSV/TSV fallback
                    const lines = e.target.result.split('\n').filter(l => l.trim());
                    const rows = lines.map(l => l.split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, '')));
                    resolve(rows);
                }
            } catch (err) { reject(err); }
        };
        if (/\.(xlsx|xls)$/i.test(file.name)) {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    });
}

function _mostrarModalMapeo(headers, rowCount, tipo) {
    _importType = tipo;
    const campos = tipo === 'productos'
        ? [
            { key: 'nombre', label: 'Nombre *', required: true },
            { key: 'categoria', label: 'Categoria' },
            { key: 'subcategoria', label: 'Subcategoria' },
            { key: 'presentacion', label: 'Presentacion/Variante' },
            { key: 'precio', label: 'Precio' },
            { key: 'costo', label: 'Costo' },
            { key: 'stock', label: 'Stock' }
          ]
        : [
            { key: 'nombre', label: 'Nombre/Razon Social *', required: true },
            { key: 'ruc', label: 'RUC' },
            { key: 'telefono', label: 'Telefono' },
            { key: 'direccion', label: 'Direccion' },
            { key: 'zona', label: 'Zona' },
            { key: 'encargado', label: 'Encargado' }
          ];

    const contenido = document.getElementById('mapeoContenido');
    document.getElementById('mapeoTitulo').textContent = tipo === 'productos' ? 'Mapear Columnas — Productos' : 'Mapear Columnas — Clientes';
    document.getElementById('mapeoPreview').textContent = `${rowCount} filas detectadas`;

    contenido.innerHTML = campos.map(campo => `
        <div class="flex items-center gap-3">
            <label class="text-sm font-medium text-gray-700 w-40 shrink-0">${campo.label}</label>
            <select id="map_${campo.key}" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="-1">-- No importar --</option>
                ${headers.map((h, i) => `<option value="${i}" ${h.toString().toLowerCase().includes(campo.key) || h.toString().toLowerCase().includes(campo.label.replace(' *', '').toLowerCase()) ? 'selected' : ''}>${escapeHTML(h) || 'Col ' + (i + 1)}</option>`).join('')}
            </select>
        </div>
    `).join('');

    const modal = document.getElementById('modalMapeoImport');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
}

function cerrarModalMapeo() {
    const modal = document.getElementById('modalMapeoImport');
    modal.style.display = 'none';
    modal.classList.add('hidden');
    _importData = null;
    _importType = null;
    _previewImportData = null;
    const prev = document.getElementById('importPreviewPanel');
    if (prev) prev.remove();
}

function previsualizarImportacion() {
    if (!_importData || !_importType) return;
    if (_importType !== 'productos') { confirmarImportacion(); return; }

    const rows = _importData;
    const getCol = (key) => parseInt(document.getElementById('map_' + key)?.value ?? -1);
    const colNombre = getCol('nombre');
    if (colNombre < 0) { mostrarToast('Debes mapear al menos el campo Nombre', 'error'); return; }

    const colCat = getCol('categoria'), colSub = getCol('subcategoria');
    const colPres = getCol('presentacion'), colPrecio = getCol('precio');
    const colCosto = getCol('costo'), colStock = getCol('stock');

    let nuevos = 0, actualizados = 0;
    const preview = [];
    rows.slice(1, 8).forEach(cols => {
        const nombre = String(cols[colNombre] || '').trim();
        if (!nombre) return;
        const existente = productosData.productos.find(p => p.nombre.toLowerCase() === nombre.toLowerCase());
        const tipo = existente ? 'actualizar' : 'nuevo';
        if (existente) actualizados++; else nuevos++;
        preview.push({
            nombre,
            categoria: colCat >= 0 ? String(cols[colCat] || '') : '',
            presentacion: colPres >= 0 ? String(cols[colPres] || 'Unidad') : 'Unidad',
            precio: colPrecio >= 0 ? (parseInt(cols[colPrecio]) || 0) : 0,
            tipo
        });
    });
    // Contar totales reales
    rows.slice(1).forEach(cols => {
        const nombre = String(cols[colNombre] || '').trim();
        if (!nombre) return;
        const existente = productosData.productos.find(p => p.nombre.toLowerCase() === nombre.toLowerCase());
        if (existente) actualizados++; else nuevos++;
    });
    // Corrección: preview ya contó primeras filas, restar
    actualizados = Math.max(0, actualizados - preview.filter(r => r.tipo === 'actualizar').length);
    nuevos = Math.max(0, nuevos - preview.filter(r => r.tipo === 'nuevo').length);
    // Sumar totales de las primeras filas nuevamente
    actualizados += preview.filter(r => r.tipo === 'actualizar').length;
    nuevos += preview.filter(r => r.tipo === 'nuevo').length;

    // Mostrar panel de preview en el modal
    let panel = document.getElementById('importPreviewPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'importPreviewPanel';
        const contenido = document.getElementById('mapeoContenido');
        contenido.after(panel);
    }
    panel.className = 'px-6 pb-4 space-y-3';
    panel.innerHTML = `
        <div class="flex gap-3 text-sm">
            <span class="flex-1 bg-green-50 border border-green-200 text-green-800 rounded-lg px-3 py-2 text-center font-bold">${nuevos} nuevos</span>
            <span class="flex-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2 text-center font-bold">${actualizados} actualizados</span>
        </div>
        <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">Vista previa (primeras filas)</p>
        <div class="overflow-x-auto rounded-lg border border-gray-200">
            <table class="w-full text-xs">
                <thead class="bg-gray-50"><tr class="text-left">
                    <th class="px-2 py-1.5 font-bold text-gray-600"></th>
                    <th class="px-2 py-1.5 font-bold text-gray-600">Nombre</th>
                    <th class="px-2 py-1.5 font-bold text-gray-600">Categoría</th>
                    <th class="px-2 py-1.5 font-bold text-gray-600">Presentación</th>
                    <th class="px-2 py-1.5 font-bold text-gray-600 text-right">Precio</th>
                </tr></thead>
                <tbody>
                    ${preview.map(r => `<tr class="border-t border-gray-100">
                        <td class="px-2 py-1.5"><span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${r.tipo === 'nuevo' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">${r.tipo === 'nuevo' ? 'NUEVO' : 'ACT'}</span></td>
                        <td class="px-2 py-1.5 text-gray-800 font-medium">${escapeHTML(r.nombre)}</td>
                        <td class="px-2 py-1.5 text-gray-500">${escapeHTML(r.categoria)}</td>
                        <td class="px-2 py-1.5 text-gray-500">${escapeHTML(r.presentacion)}</td>
                        <td class="px-2 py-1.5 text-gray-800 text-right">${r.precio > 0 ? formatearGuaranies(r.precio) : '—'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <div class="flex gap-3 justify-end pt-1">
            <sl-button data-action="cerrarModalMapeo" variant="default" size="small">Cancelar</sl-button>
            <sl-button data-action="confirmarImportacion" variant="primary" size="small">Aplicar ${nuevos + actualizados} registros</sl-button>
        </div>`;
    // Ocultar los botones del footer original del modal
    const footer = document.querySelector('#modalMapeoImport .border-t .flex.gap-3');
    if (footer) footer.style.display = 'none';
}

function confirmarImportacion() {
    if (!_importData || !_importType) return;
    const rows = _importData;
    const getCol = (key) => parseInt(document.getElementById('map_' + key)?.value ?? -1);

    if (_importType === 'productos') {
        const colNombre = getCol('nombre');
        if (colNombre < 0) { mostrarToast('Debes mapear al menos el campo Nombre', 'error'); return; }

        let agregados = 0, actualizados = 0;
        const ultimoId = Math.max(...productosData.productos.map(p => parseInt(p.id.replace('P', '')) || 0), 0);
        const colCat = getCol('categoria'), colSub = getCol('subcategoria');
        const colPres = getCol('presentacion'), colPrecio = getCol('precio');
        const colCosto = getCol('costo'), colStock = getCol('stock');

        // --- Resolver categorias del CSV: texto plano → categoria_id válido ---
        const categoriasExistentes = new Map(
            (productosData.categorias || []).map(c => [c.id, c])
        );
        // Indice por nombre normalizado para buscar por texto
        const catPorNombre = new Map(
            (productosData.categorias || []).map(c => [(c.nombre || c.id).toLowerCase().trim(), c])
        );

        function _resolverCategoriaId(textoCategoria, textoSubcategoria) {
            if (!textoCategoria) return '';
            const textoNorm = textoCategoria.toLowerCase().trim();
            // 1. Buscar por ID exacto
            if (categoriasExistentes.has(textoCategoria)) {
                // Agregar subcategoria si no existe
                const cat = categoriasExistentes.get(textoCategoria);
                if (textoSubcategoria && !cat.subcategorias.includes(textoSubcategoria)) {
                    cat.subcategorias.push(textoSubcategoria);
                }
                return textoCategoria;
            }
            // 2. Buscar por nombre (case-insensitive)
            if (catPorNombre.has(textoNorm)) {
                const cat = catPorNombre.get(textoNorm);
                if (textoSubcategoria && !cat.subcategorias.includes(textoSubcategoria)) {
                    cat.subcategorias.push(textoSubcategoria);
                }
                return cat.id;
            }
            // 3. No existe → crear nueva categoria
            const nuevoId = textoCategoria.toLowerCase().trim()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            const nuevaCat = {
                id: nuevoId,
                nombre: textoCategoria.trim(),
                subcategorias: textoSubcategoria ? [textoSubcategoria] : [],
                estado: 'activa'
            };
            productosData.categorias.push(nuevaCat);
            categoriasExistentes.set(nuevoId, nuevaCat);
            catPorNombre.set(textoNorm, nuevaCat);
            console.log(`[Import] Categoria creada: "${textoCategoria}" → id="${nuevoId}"`);
            return nuevoId;
        }

        rows.slice(1).forEach(cols => {
            const nombre = String(cols[colNombre] || '').trim();
            if (!nombre) return;

            const catTexto = colCat >= 0 ? String(cols[colCat] || '') : '';
            const subTexto = colSub >= 0 ? String(cols[colSub] || 'General') : 'General';
            const categoriaId = _resolverCategoriaId(catTexto, subTexto);

            // Upsert: buscar por nombre exacto
            const existente = productosData.productos.find(p => p.nombre.toLowerCase() === nombre.toLowerCase());
            const pres = {
                tamano: colPres >= 0 ? String(cols[colPres] || 'Unidad') : 'Unidad',
                precio_base: colPrecio >= 0 ? parseInt(cols[colPrecio]) || 0 : 0,
                costo: colCosto >= 0 ? parseInt(cols[colCosto]) || 0 : 0,
                stock: colStock >= 0 ? parseInt(cols[colStock]) || 0 : 0,
                activo: true
            };

            if (existente) {
                // Actualizar: agregar variante si no existe, o actualizar precio/stock
                const presExist = existente.presentaciones.find(p => p.tamano === pres.tamano);
                if (presExist) {
                    if (colPrecio >= 0) presExist.precio_base = pres.precio_base;
                    if (colCosto >= 0) presExist.costo = pres.costo;
                    if (colStock >= 0) presExist.stock = pres.stock;
                } else {
                    existente.presentaciones.push(pres);
                }
                // Actualizar categoria si venia vacia y el CSV la trae
                if (categoriaId && !existente.categoria) existente.categoria = categoriaId;
                actualizados++;
            } else {
                const nuevoId = `P${String(ultimoId + agregados + 1).padStart(3, '0')}`;
                productosData.productos.push({
                    id: nuevoId, nombre,
                    categoria: categoriaId,
                    subcategoria: subTexto,
                    estado: 'disponible', oculto: false, tipo_impuesto: '10',
                    presentaciones: [pres]
                });
                agregados++;
            }
        });

        if (agregados > 0 || actualizados > 0) {
            productosFiltrados = [...productosData.productos];
            registrarCambio();
            mostrarProductosGestion();
            mostrarToast(`${agregados} nuevos, ${actualizados} actualizados. Guarda para aplicar.`, 'success');
        } else {
            mostrarToast('No se encontraron datos validos', 'warning');
        }
    } else {
        const colNombre = getCol('nombre');
        if (colNombre < 0) { mostrarToast('Debes mapear al menos el campo Nombre', 'error'); return; }

        let agregados = 0, actualizados = 0, duplicadosRuc = 0;
        const ultimoId = Math.max(...productosData.clientes.map(c => parseInt(c.id.replace('C', '')) || 0), 0);
        const colRuc = getCol('ruc'), colTel = getCol('telefono');
        const colDir = getCol('direccion'), colZona = getCol('zona'), colEnc = getCol('encargado');

        // --- Indices para busqueda rapida ---
        const _normRuc = (r) => (r || '').replace(/[^0-9a-zA-Z]/g, '').trim();
        const indicePorRuc = new Map();
        const indicePorNombre = new Map();
        productosData.clientes.forEach(c => {
            const rNorm = _normRuc(c.ruc);
            if (rNorm) indicePorRuc.set(rNorm, c);
            indicePorNombre.set((c.razon_social || c.nombre || '').toLowerCase().trim(), c);
        });
        // Set para detectar RUCs duplicados dentro del mismo CSV
        const rucsEnCsv = new Set();

        rows.slice(1).forEach(cols => {
            const nombre = String(cols[colNombre] || '').trim();
            if (!nombre) return;

            const rucRaw = colRuc >= 0 ? String(cols[colRuc] || '').trim() : '';
            const rucNorm = _normRuc(rucRaw);
            const nombreNorm = nombre.toLowerCase().trim();

            // Detectar RUC duplicado dentro del mismo CSV
            if (rucNorm && rucsEnCsv.has(rucNorm)) {
                duplicadosRuc++;
                return; // Saltar fila duplicada
            }
            if (rucNorm) rucsEnCsv.add(rucNorm);

            // Buscar existente: 1) por RUC normalizado, 2) fallback por nombre
            let existente = null;
            if (rucNorm) {
                existente = indicePorRuc.get(rucNorm);
                // Si no coincidio por RUC, intentar por nombre como fallback
                if (!existente) existente = indicePorNombre.get(nombreNorm);
            } else {
                existente = indicePorNombre.get(nombreNorm);
            }

            if (existente) {
                // Actualizar todos los campos que vengan del CSV
                if (colRuc >= 0 && rucRaw) existente.ruc = rucRaw;
                existente.nombre = nombre;
                existente.razon_social = nombre;
                if (colTel >= 0 && cols[colTel]) existente.telefono = String(cols[colTel]);
                if (colDir >= 0 && cols[colDir]) existente.direccion = String(cols[colDir]);
                if (colZona >= 0 && cols[colZona]) existente.zona = String(cols[colZona]);
                if (colEnc >= 0 && cols[colEnc]) existente.encargado = String(cols[colEnc]);
                // Actualizar indices con nuevos datos
                if (rucNorm) indicePorRuc.set(rucNorm, existente);
                indicePorNombre.set(nombreNorm, existente);
                actualizados++;
            } else {
                const nuevoId = `C${String(ultimoId + agregados + 1).padStart(3, '0')}`;
                const nuevo = {
                    id: nuevoId, nombre, razon_social: nombre, ruc: rucRaw,
                    telefono: colTel >= 0 ? String(cols[colTel] || '') : '',
                    direccion: colDir >= 0 ? String(cols[colDir] || '') : '',
                    zona: colZona >= 0 ? String(cols[colZona] || '') : '',
                    encargado: colEnc >= 0 ? String(cols[colEnc] || '') : '',
                    tipo: 'minorista', oculto: false, precios_personalizados: {}
                };
                productosData.clientes.push(nuevo);
                // Registrar en indices para que filas siguientes del CSV lo encuentren
                if (rucNorm) indicePorRuc.set(rucNorm, nuevo);
                indicePorNombre.set(nombreNorm, nuevo);
                agregados++;
            }
        });

        if (agregados > 0 || actualizados > 0) {
            clientesFiltrados = [...productosData.clientes];
            registrarCambio();
            mostrarClientesGestion();
            let msg = `${agregados} nuevos, ${actualizados} actualizados.`;
            if (duplicadosRuc > 0) msg += ` ${duplicadosRuc} filas con RUC duplicado ignoradas.`;
            msg += ' Guarda para aplicar.';
            mostrarToast(msg, 'success');
        } else {
            mostrarToast('No se encontraron datos validos', 'warning');
        }
    }

    cerrarModalMapeo();
}

async function importarProductosExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const rows = await _parsearArchivo(file);
        if (rows.length < 2) { mostrarToast('Archivo vacio o sin datos', 'error'); return; }
        _importData = rows;
        await crearAutoBackupAdmin('Pre-importacion productos');
        _mostrarModalMapeo(rows[0], rows.length - 1, 'productos');
    } catch (err) { mostrarToast('Error al leer archivo: ' + err.message, 'error'); }
    event.target.value = '';
}

async function importarClientesExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const rows = await _parsearArchivo(file);
        if (rows.length < 2) { mostrarToast('Archivo vacio o sin datos', 'error'); return; }
        _importData = rows;
        await crearAutoBackupAdmin('Pre-importacion clientes');
        _mostrarModalMapeo(rows[0], rows.length - 1, 'clientes');
    } catch (err) { mostrarToast('Error al leer archivo: ' + err.message, 'error'); }
    event.target.value = '';
}

function descargarPlantillaProductosCSV() {
    const header = 'nombre,categoria,subcategoria,presentacion,precio,costo,stock';
    const ejemplo = 'Shampoo Sedal,cuidado_personal,Cabello,500ml,15000,10000,50\nShampoo Sedal,cuidado_personal,Cabello,1L,25000,18000,30';
    const bom = '\uFEFF';
    const blob = new Blob([bom + header + '\n' + ejemplo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla_productos.csv'; a.click();
    URL.revokeObjectURL(url);
}

function descargarPlantillaClientesCSV() {
    const header = 'nombre,ruc,telefono,direccion,zona,encargado';
    const ejemplo = 'Distribuidora Lopez,80012345-6,0981234567,Av. Mariscal Lopez 1234,Centro,Juan Lopez';
    const bom = '\uFEFF';
    const blob = new Blob([bom + header + '\n' + ejemplo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla_clientes.csv'; a.click();
    URL.revokeObjectURL(url);
}

function descargarPlantillaProductos() {
    const plantilla = {
        _instrucciones: "Completa el array 'productos' con tus productos. Campos requeridos: id, nombre, categoria. Presenta un array de presentaciones con tamano y precio_base.",
        _categorias_disponibles: (productosData.categorias || []).map(c => ({ id: c.id, nombre: c.nombre, subcategorias: c.subcategorias || [] })),
        productos: [
            {
                id: "P999",
                nombre: "Nombre del Producto",
                categoria: "categoria_id",
                subcategoria: "Subcategoria (opcional)",
                estado: "disponible",
                imagen: "URL de imagen (opcional)",
                presentaciones: [
                    { tamano: "1L", precio_base: 10000, costo: 7000, stock: 0 },
                    { tamano: "500ml", precio_base: 6000, costo: 4000, stock: 0 }
                ]
            }
        ]
    };
    descargarJSON(plantilla, 'plantilla_productos.json');
}

function descargarPlantillaClientes() {
    const zonas = [...new Set((productosData.clientes || []).map(c => c.zona).filter(Boolean))];
    const plantilla = {
        _instrucciones: "Completa el array 'clientes'. Campos requeridos: nombre/razon_social. Los campos marcados como opcional pueden omitirse.",
        _zonas_existentes: zonas,
        clientes: [
            {
                id: "C999",
                nombre: "Nombre del Cliente",
                razon_social: "Nombre o Razon Social (igual que nombre si es persona)",
                ruc: "80012345-6 (opcional)",
                telefono: "0981234567 (opcional)",
                direccion: "Direccion completa (opcional)",
                zona: "Nombre de la zona",
                encargado: "Nombre del encargado (opcional)"
            }
        ]
    };
    descargarJSON(plantilla, 'plantilla_clientes.json');
}

// ============================================
// GESTION MASIVA DE PRODUCTOS (Etapa 3)
// ============================================

function _actualizarBarraMasiva() {
    const barra = document.getElementById('barraAccionesMasivas');
    const cont = document.getElementById('contSeleccion');
    if (!barra) return;
    const n = _seleccionProductos.size;
    if (n === 0) {
        barra.classList.add('hidden');
    } else {
        barra.classList.remove('hidden');
        if (cont) cont.textContent = `${n} seleccionado${n > 1 ? 's' : ''}`;
    }
}

function masivoCambiarVisibilidad(ocultar) {
    const ids = [..._seleccionProductos];
    if (ids.length === 0) return;
    ids.forEach(id => {
        const p = productosData.productos.find(x => x.id === id);
        if (p) p.oculto = ocultar;
    });
    registrarCambio();
    _seleccionProductos.clear();
    _actualizarBarraMasiva();
    mostrarProductosGestion();
    mostrarExito(`${ids.length} producto(s) ${ocultar ? 'ocultado(s)' : 'mostrado(s)'} — guarda para aplicar`);
}

async function masivoCambiarCategoria() {
    const ids = [..._seleccionProductos];
    if (ids.length === 0) return;
    const opciones = (productosData.categorias || []).map(c => ({ value: c.id, label: c.nombre }));
    const resultado = await mostrarInputModal({
        titulo: `Cambiar categoría — ${ids.length} producto(s)`,
        campos: [{ id: 'categoria', label: 'Nueva categoría', tipo: 'select', opciones, requerido: true }]
    });
    if (!resultado) return;
    ids.forEach(id => {
        const p = productosData.productos.find(x => x.id === id);
        if (p) { p.categoria = resultado.categoria; p.subcategoria = ''; }
    });
    registrarCambio();
    _seleccionProductos.clear();
    _actualizarBarraMasiva();
    mostrarProductosGestion();
    mostrarExito(`Categoría actualizada en ${ids.length} producto(s) — guarda para aplicar`);
}

async function masivoEliminar() {
    const ids = [..._seleccionProductos];
    if (ids.length === 0) return;
    const ok = await mostrarConfirmModal(
        `¿Eliminar ${ids.length} producto(s) permanentemente? Esta acción no se puede deshacer.`,
        { confirmLabel: 'Eliminar todo', cancelLabel: 'Cancelar' }
    );
    if (!ok) return;
    productosData.productos = productosData.productos.filter(p => !ids.includes(p.id));
    productosFiltrados = productosFiltrados.filter(p => !ids.includes(p.id));
    registrarCambio();
    _seleccionProductos.clear();
    _actualizarBarraMasiva();
    mostrarProductosGestion();
    mostrarExito(`${ids.length} producto(s) eliminado(s) — guarda para aplicar`);
}

function limpiarSeleccionProductos() {
    _seleccionProductos.clear();
    _actualizarBarraMasiva();
    // Actualizar checkboxes sin re-renderizar
    const grid = document.getElementById('productosGridContainer');
    grid?.querySelectorAll('.card-checkbox-overlay input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    grid?.querySelectorAll('.catalog-card.ring-2').forEach(c => { c.classList.remove('ring-2', 'ring-indigo-500'); });
}

function seleccionarTodosProductos() {
    const grid = document.getElementById('productosGridContainer');
    const cards = [...(grid?.querySelectorAll('.catalog-card[data-action="abrir-perfil"]') || [])];
    const todosSeleccionados = cards.every(c => _seleccionProductos.has(c.dataset.id));
    if (todosSeleccionados && cards.length > 0) {
        _seleccionProductos.clear();
    } else {
        cards.forEach(c => _seleccionProductos.add(c.dataset.id));
    }
    _actualizarBarraMasiva();
    mostrarProductosGestion();
}

function exportarProductosCSV() {
    const bom = '﻿';
    const header = 'nombre,categoria,subcategoria,presentacion,precio,costo,stock,estado,oculto';
    const rows = [];
    (productosData.productos || []).forEach(p => {
        const catNombre = (productosData.categorias.find(c => c.id === p.categoria)?.nombre || p.categoria || '');
        (p.presentaciones || [{ tamano: 'Unidad', precio_base: 0, costo: 0, stock: 0 }]).forEach(v => {
            rows.push([
                p.nombre, catNombre, p.subcategoria || '', v.tamano || 'Unidad',
                v.precio_base || 0, v.costo || 0, v.stock || 0,
                p.estado || 'disponible', p.oculto ? 'si' : 'no'
            ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
        });
    });
    const csv = bom + header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catalogo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarExito(`${rows.length} filas exportadas`);
}

// ============================================
// PRECIOS Y MARGENES (Etapa 5)
// ============================================

async function masivoAjustarPrecios() {
    const ids = [..._seleccionProductos];
    if (ids.length === 0) {
        mostrarToast('Seleccioná al menos un producto', 'warning');
        return;
    }
    const resultado = await mostrarInputModal({
        titulo: `Ajustar precios — ${ids.length} producto(s)`,
        campos: [
            {
                id: 'tipo', label: 'Tipo de ajuste', tipo: 'select',
                opciones: [
                    { value: 'incrementar', label: 'Incrementar (+%)' },
                    { value: 'reducir',     label: 'Reducir (−%)' }
                ],
                valor: 'incrementar'
            },
            { id: 'porcentaje', label: 'Porcentaje (%)', tipo: 'number', valor: 10, min: 1, max: 99, requerido: true },
            {
                id: 'redondear', label: 'Redondear resultado', tipo: 'select',
                opciones: [
                    { value: '100',  label: 'Al 100 Gs más cercano (recomendado)' },
                    { value: '1000', label: 'Al 1000 Gs más cercano' },
                    { value: '1',    label: 'Sin redondeo' }
                ],
                valor: '100'
            }
        ]
    });
    if (!resultado) return;

    const pct = parseFloat(resultado.porcentaje);
    if (!pct || pct <= 0 || pct >= 100) { mostrarToast('Porcentaje inválido', 'error'); return; }

    const multiplier = resultado.tipo === 'incrementar' ? (1 + pct / 100) : (1 - pct / 100);
    const redondeo = parseInt(resultado.redondear) || 100;

    const historial = [];
    const ahora = new Date().toISOString();

    ids.forEach(id => {
        const prod = productosData.productos.find(p => p.id === id);
        if (!prod) return;
        (prod.presentaciones || []).forEach(v => {
            const precioAntes = v.precio_base || 0;
            if (precioAntes <= 0) return;
            const precioRaw = precioAntes * multiplier;
            const precioNuevo = Math.round(precioRaw / redondeo) * redondeo;
            if (precioNuevo === precioAntes) return;
            const costoRef = v.costo || 0;
            historial.push({
                id: crypto.randomUUID(),
                fecha: ahora,
                productoId: prod.id,
                nombre: prod.nombre,
                variante: v.tamano || 'Unidad',
                precioAntes,
                precioNuevo,
                costoRef,
                margenAntes: costoRef > 0 ? Math.round(((precioAntes - costoRef) / precioAntes) * 100) : null,
                margenNuevo: costoRef > 0 ? Math.round(((precioNuevo - costoRef) / precioNuevo) * 100) : null
            });
            v.precio_base = precioNuevo;
        });
    });

    if (historial.length === 0) { mostrarToast('Sin cambios (los precios ya tenían ese redondeo)', 'neutral'); return; }

    // Guardar en historial (máx 500 entradas)
    const prevHistorial = (await HDVStorage.getItem('hdv_historial_precios')) || [];
    const nuevoHistorial = [...historial, ...prevHistorial].slice(0, 500);
    await HDVStorage.setItem('hdv_historial_precios', nuevoHistorial);

    registrarCambio();
    _seleccionProductos.clear();
    _actualizarBarraMasiva();
    mostrarProductosGestion();
    const signo = resultado.tipo === 'incrementar' ? '+' : '−';
    mostrarExito(`${signo}${pct}% aplicado a ${historial.length} variante(s). Guarda para aplicar.`);
}

async function verMargenesCatalogo() {
    const modal = document.getElementById('modalMargenes');
    const body = document.getElementById('modalMargenesBody');
    if (!modal || !body) return;

    const cats = productosData.categorias || [];
    const prods = productosData.productos || [];

    // Calcular stats por categoría
    const stats = cats.map(cat => {
        const prodsCat = prods.filter(p => p.categoria === cat.id);
        const margenes = [];
        prodsCat.forEach(p => {
            (p.presentaciones || []).forEach(v => {
                const pr = v.precio_base || 0;
                const co = v.costo || 0;
                if (pr > 0 && co > 0) margenes.push(Math.round(((pr - co) / pr) * 100));
            });
        });
        const conMargenBajo = prodsCat.filter(p =>
            (p.presentaciones || []).some(v => {
                const pr = v.precio_base || 0; const co = v.costo || 0;
                return pr > 0 && co > 0 && ((pr - co) / pr) < MARGEN_MINIMO_PCT;
            })
        ).length;
        return {
            nombre: cat.nombre,
            id: cat.id,
            numProds: prodsCat.length,
            conMargenBajo,
            margenMin: margenes.length ? Math.min(...margenes) : null,
            margenProm: margenes.length ? Math.round(margenes.reduce((a, b) => a + b, 0) / margenes.length) : null,
            margenMax: margenes.length ? Math.max(...margenes) : null,
            sinCosto: prodsCat.reduce((acc, p) => acc + (p.presentaciones || []).filter(v => !v.costo || v.costo <= 0).length, 0)
        };
    }).filter(s => s.numProds > 0).sort((a, b) => (a.margenProm ?? 999) - (b.margenProm ?? 999));

    const totalProds = prods.length;
    const todosConCosto = prods.filter(p => (p.presentaciones || []).every(v => (v.costo || 0) > 0));
    const promedioGeneral = (() => {
        const m = [];
        prods.forEach(p => (p.presentaciones || []).forEach(v => {
            const pr = v.precio_base || 0; const co = v.costo || 0;
            if (pr > 0 && co > 0) m.push((pr - co) / pr * 100);
        }));
        return m.length ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : null;
    })();
    const totalMargenBajo = stats.reduce((s, c) => s + c.conMargenBajo, 0);

    const margenColor = (pct) => {
        if (pct === null) return 'text-gray-400';
        if (pct >= 30) return 'text-green-600 font-bold';
        if (pct >= 15) return 'text-yellow-600 font-bold';
        return 'text-red-600 font-bold';
    };

    body.innerHTML = `
        <!-- Resumen global -->
        <div class="grid grid-cols-3 gap-3 mb-2">
            <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                <p class="text-2xl font-bold text-indigo-700">${promedioGeneral !== null ? promedioGeneral + '%' : '—'}</p>
                <p class="text-xs text-indigo-500 font-bold mt-0.5">MARGEN PROMEDIO</p>
            </div>
            <div class="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                <p class="text-2xl font-bold text-amber-700">${totalMargenBajo}</p>
                <p class="text-xs text-amber-500 font-bold mt-0.5">PRODUCTOS MARGEN BAJO</p>
            </div>
            <div class="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                <p class="text-2xl font-bold text-gray-700">${totalProds - todosConCosto.length}</p>
                <p class="text-xs text-gray-500 font-bold mt-0.5">SIN COSTO CARGADO</p>
            </div>
        </div>
        <!-- Tabla por categoría -->
        <div class="overflow-x-auto rounded-xl border border-gray-200">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 text-xs text-gray-500 font-bold uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-3 py-2">Categoría</th>
                        <th class="px-3 py-2 text-right">Productos</th>
                        <th class="px-3 py-2 text-right">Margen mín</th>
                        <th class="px-3 py-2 text-right">Margen prom</th>
                        <th class="px-3 py-2 text-right">Margen máx</th>
                        <th class="px-3 py-2 text-right">Alerta</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${stats.map(s => `<tr class="hover:bg-gray-50 ${s.conMargenBajo > 0 && s.conMargenBajo / s.numProds >= 0.5 ? 'bg-red-50/40' : ''}">
                        <td class="px-3 py-2 font-medium text-gray-800">${escapeHTML(s.nombre)}</td>
                        <td class="px-3 py-2 text-right text-gray-600">${s.numProds}</td>
                        <td class="px-3 py-2 text-right ${margenColor(s.margenMin)}">${s.margenMin !== null ? s.margenMin + '%' : '—'}</td>
                        <td class="px-3 py-2 text-right ${margenColor(s.margenProm)}">${s.margenProm !== null ? s.margenProm + '%' : '—'}</td>
                        <td class="px-3 py-2 text-right ${margenColor(s.margenMax)}">${s.margenMax !== null ? s.margenMax + '%' : '—'}</td>
                        <td class="px-3 py-2 text-right">${s.conMargenBajo > 0 ? `<span class="text-xs font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">${s.conMargenBajo} ⚠</span>` : '<span class="text-gray-300">—</span>'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <p class="text-xs text-gray-400 mt-1">Ordenado de menor a mayor margen promedio. Solo incluye variantes con costo cargado.</p>`;

    modal.show();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function cerrarModalMargenes() {
    document.getElementById('modalMargenes')?.hide();
}

async function abrirHistorialPrecios() {
    const modal = document.getElementById('modalHistorialPrecios');
    const body = document.getElementById('modalHistorialPreciosBody');
    if (!modal || !body) return;

    const historial = (await HDVStorage.getItem('hdv_historial_precios')) || [];

    if (historial.length === 0) {
        body.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">No hay cambios registrados todavía. Los cambios de precio hechos con "Precio %" se guardan aquí.</p>';
        modal.show();
        return;
    }

    const signo = (antes, despues) => antes < despues ? '↑' : '↓';
    const signoColor = (antes, despues) => antes < despues ? 'text-green-600' : 'text-red-600';

    body.innerHTML = `
        <p class="text-xs text-gray-400">${historial.length} registro(s) — últimos 500 cambios</p>
        <div class="overflow-x-auto rounded-xl border border-gray-200 max-h-96 overflow-y-auto">
            <table class="w-full text-xs">
                <thead class="bg-gray-50 sticky top-0 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-3 py-2">Fecha</th>
                        <th class="text-left px-3 py-2">Producto</th>
                        <th class="px-3 py-2">Variante</th>
                        <th class="px-3 py-2 text-right">Precio antes</th>
                        <th class="px-3 py-2 text-right">Precio nuevo</th>
                        <th class="px-3 py-2 text-right">Margen</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${historial.map(h => `<tr class="hover:bg-gray-50">
                        <td class="px-3 py-2 text-gray-400 whitespace-nowrap">${new Date(h.fecha).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td class="px-3 py-2 font-medium text-gray-800 max-w-[140px] truncate" title="${escapeHTML(h.nombre)}">${escapeHTML(h.nombre)}</td>
                        <td class="px-3 py-2 text-gray-500 text-center">${escapeHTML(h.variante)}</td>
                        <td class="px-3 py-2 text-right text-gray-500">${formatearGuaranies(h.precioAntes)}</td>
                        <td class="px-3 py-2 text-right font-bold ${signoColor(h.precioAntes, h.precioNuevo)}">
                            ${signo(h.precioAntes, h.precioNuevo)} ${formatearGuaranies(h.precioNuevo)}
                        </td>
                        <td class="px-3 py-2 text-right">
                            ${h.margenAntes !== null ? `<span class="text-gray-400">${h.margenAntes}%</span> → <span class="${h.margenNuevo >= 20 ? 'text-green-600' : 'text-red-600'} font-bold">${h.margenNuevo}%</span>` : '—'}
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;

    modal.show();
}

async function limpiarHistorialPrecios() {
    const ok = await mostrarConfirmModal('¿Borrar todo el historial de cambios de precio?', {
        confirmLabel: 'Borrar', cancelLabel: 'Cancelar'
    });
    if (!ok) return;
    await HDVStorage.setItem('hdv_historial_precios', []);
    document.getElementById('modalHistorialPrecios')?.hide();
    mostrarExito('Historial borrado');
}

function cerrarModalHistorialPrecios() {
    document.getElementById('modalHistorialPrecios')?.hide();
}

// ============================================
// ESTADISTICAS DE CATALOGO (Etapa 6)
// ============================================

let _statsPeriodoActual = 30;

async function abrirEstadisticasCatalogo(dias) {
    const d = parseInt(dias) || _statsPeriodoActual;
    _statsPeriodoActual = d;
    const modal = document.getElementById('modalEstadisticasCatalogo');
    if (!modal) return;
    // Resaltar botón activo del período
    [7, 30, 90, 365].forEach(p => {
        const btn = document.getElementById(`statsPeriodo${p}`);
        if (btn) { btn.variant = p === d ? 'primary' : 'neutral'; btn.outline = p !== d; }
    });
    await _renderEstadisticas(d);
    modal.show();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function cambiarPeriodoStats(dias) {
    _statsPeriodoActual = parseInt(dias) || 30;
    [7, 30, 90, 365].forEach(p => {
        const btn = document.getElementById(`statsPeriodo${p}`);
        if (btn) { btn.variant = p === _statsPeriodoActual ? 'primary' : 'neutral'; btn.outline = p !== _statsPeriodoActual; }
    });
    await _renderEstadisticas(_statsPeriodoActual);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function _renderEstadisticas(dias) {
    const body = document.getElementById('modalStatsBody');
    if (!body) return;
    body.innerHTML = `<div class="flex items-center justify-center py-8"><div class="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full"></div><span class="ml-3 text-sm text-gray-500">Calculando...</span></div>`;

    const ahora = Date.now();
    const desde = ahora - dias * 86400000;
    const pedidos = ((await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [])
        .filter(p => p.estado !== 'anulado' && new Date(p.fecha).getTime() >= desde);

    // --- Conteo de unidades por producto+presentación ---
    const conteoUnidades = {}; // key: productoId
    const conteoVariante = {}; // key: productoId+':'+presentacion
    const ingresosPorProducto = {};
    pedidos.forEach(p => {
        (p.items || []).forEach(it => {
            const qty = it.cantidad || 1;
            conteoUnidades[it.productoId] = (conteoUnidades[it.productoId] || 0) + qty;
            const vKey = `${it.productoId}:${it.presentacion || ''}`;
            conteoVariante[vKey] = (conteoVariante[vKey] || 0) + qty;
            ingresosPorProducto[it.productoId] = (ingresosPorProducto[it.productoId] || 0) + (it.subtotal || it.precio * qty || 0);
        });
    });

    const productos = productosData.productos || [];
    const categorias = productosData.categorias || [];

    // --- Top / bottom vendidos ---
    const prodIdsConVentas = new Set(Object.keys(conteoUnidades));
    const vendidos = productos
        .map(p => ({ ...p, unidades: conteoUnidades[p.id] || 0, ingresos: ingresosPorProducto[p.id] || 0 }))
        .filter(p => !p.oculto);
    const top10 = [...vendidos].sort((a, b) => b.unidades - a.unidades).slice(0, 10);
    const sinMovimiento = vendidos.filter(p => !prodIdsConVentas.has(p.id));

    // --- Stock crítico ---
    const stockCritico = productos.filter(p =>
        !p.oculto && (p.presentaciones || []).some(v => (v.stock || 0) <= STOCK_BAJO_UMBRAL)
    ).map(p => {
        const varCriticas = (p.presentaciones || []).filter(v => (v.stock || 0) <= STOCK_BAJO_UMBRAL);
        return { ...p, varCriticas };
    }).sort((a, b) => Math.min(...a.varCriticas.map(v => v.stock || 0)) - Math.min(...b.varCriticas.map(v => v.stock || 0)));

    // --- Rentabilidad por categoría ---
    const rentCat = categorias.map(cat => {
        const prodsCat = productos.filter(p => p.categoria === cat.id && !p.oculto);
        let unidades = 0, ingresos = 0, costoEstimado = 0;
        prodsCat.forEach(p => {
            const u = conteoUnidades[p.id] || 0;
            unidades += u;
            ingresos += ingresosPorProducto[p.id] || 0;
            // Costo estimado: promedio de costos de variantes × unidades
            if (u > 0) {
                const varCostos = (p.presentaciones || []).map(v => v.costo || 0).filter(c => c > 0);
                const costoPromedio = varCostos.length ? varCostos.reduce((a, b) => a + b, 0) / varCostos.length : 0;
                costoEstimado += costoPromedio * u;
            }
        });
        const ganancia = ingresos - costoEstimado;
        const margenProm = ingresos > 0 ? Math.round((ganancia / ingresos) * 100) : null;
        return { nombre: cat.nombre, id: cat.id, numProds: prodsCat.length, unidades, ingresos, costoEstimado, ganancia, margenProm };
    }).filter(c => c.numProds > 0).sort((a, b) => b.ingresos - a.ingresos);

    const periodoLabel = dias === 7 ? 'última semana' : dias === 30 ? 'último mes' : dias === 90 ? 'últimos 3 meses' : 'último año';
    const totalUnidades = top10.reduce((s, p) => s + p.unidades, 0) + sinMovimiento.length;
    const totalIngresos = rentCat.reduce((s, c) => s + c.ingresos, 0);

    body.innerHTML = `
        <!-- Resumen rápido -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                <p class="text-xl font-bold text-indigo-700">${pedidos.length}</p>
                <p class="text-[10px] font-bold text-indigo-500 uppercase">Pedidos en período</p>
            </div>
            <div class="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                <p class="text-xl font-bold text-green-700">${formatearGuaranies(totalIngresos)}</p>
                <p class="text-[10px] font-bold text-green-500 uppercase">Ingresos estimados</p>
            </div>
            <div class="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                <p class="text-xl font-bold text-amber-700">${sinMovimiento.length}</p>
                <p class="text-[10px] font-bold text-amber-500 uppercase">Sin ventas en período</p>
            </div>
            <div class="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                <p class="text-xl font-bold text-red-700">${stockCritico.length}</p>
                <p class="text-[10px] font-bold text-red-500 uppercase">Stock crítico</p>
            </div>
        </div>

        <!-- Ranking de ventas -->
        <div>
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">🏆 Más vendidos — ${periodoLabel}</p>
            ${top10.filter(p => p.unidades > 0).length === 0
                ? '<p class="text-sm text-gray-400 py-3 text-center">No hay ventas registradas en este período.</p>'
                : `<div class="overflow-x-auto rounded-xl border border-gray-200">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                            <tr>
                                <th class="text-left px-3 py-2">#</th>
                                <th class="text-left px-3 py-2">Producto</th>
                                <th class="px-3 py-2 text-right">Unidades</th>
                                <th class="px-3 py-2 text-right">Ingresos</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${top10.filter(p => p.unidades > 0).map((p, i) => `<tr class="hover:bg-gray-50">
                                <td class="px-3 py-1.5 text-gray-400 font-bold">${i + 1}</td>
                                <td class="px-3 py-1.5 font-medium text-gray-800">${escapeHTML(p.nombre)}</td>
                                <td class="px-3 py-1.5 text-right font-bold text-indigo-600">${p.unidades}</td>
                                <td class="px-3 py-1.5 text-right text-gray-600">${formatearGuaranies(p.ingresos)}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`}
        </div>

        <!-- Sin movimiento -->
        ${sinMovimiento.length > 0 ? `<div>
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">⚠ Sin ventas en ${periodoLabel} (${sinMovimiento.length} productos)</p>
            <div class="flex flex-wrap gap-2">
                ${sinMovimiento.slice(0, 20).map(p => `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">${escapeHTML(p.nombre)}</span>`).join('')}
                ${sinMovimiento.length > 20 ? `<span class="text-xs text-gray-400">+${sinMovimiento.length - 20} más</span>` : ''}
            </div>
        </div>` : ''}

        <!-- Stock crítico -->
        ${stockCritico.length > 0 ? `<div>
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">🔴 Stock crítico (≤ ${STOCK_BAJO_UMBRAL} unidades)</p>
            <div class="overflow-x-auto rounded-xl border border-gray-200">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        <tr>
                            <th class="text-left px-3 py-2">Producto</th>
                            <th class="text-left px-3 py-2">Variantes críticas</th>
                            <th class="px-3 py-2 text-right">Stock mín</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${stockCritico.slice(0, 15).map(p => `<tr class="hover:bg-gray-50">
                            <td class="px-3 py-1.5 font-medium text-gray-800">${escapeHTML(p.nombre)}</td>
                            <td class="px-3 py-1.5 text-gray-500">${p.varCriticas.map(v => escapeHTML(v.tamano || 'Unidad')).join(', ')}</td>
                            <td class="px-3 py-1.5 text-right font-bold ${Math.min(...p.varCriticas.map(v => v.stock || 0)) <= 0 ? 'text-red-600' : 'text-amber-600'}">${Math.min(...p.varCriticas.map(v => v.stock || 0))}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>` : '<div class="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 text-center">✓ Sin productos en stock crítico</div>'}

        <!-- Rentabilidad por categoría -->
        <div>
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">💰 Rentabilidad por categoría — ${periodoLabel}</p>
            <div class="overflow-x-auto rounded-xl border border-gray-200">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        <tr>
                            <th class="text-left px-3 py-2">Categoría</th>
                            <th class="px-3 py-2 text-right">Unidades</th>
                            <th class="px-3 py-2 text-right">Ingresos</th>
                            <th class="px-3 py-2 text-right">Costo est.</th>
                            <th class="px-3 py-2 text-right">Ganancia est.</th>
                            <th class="px-3 py-2 text-right">Margen</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${rentCat.map(c => `<tr class="hover:bg-gray-50">
                            <td class="px-3 py-1.5 font-medium text-gray-800">${escapeHTML(c.nombre)}</td>
                            <td class="px-3 py-1.5 text-right text-gray-600">${c.unidades}</td>
                            <td class="px-3 py-1.5 text-right font-medium text-gray-800">${formatearGuaranies(c.ingresos)}</td>
                            <td class="px-3 py-1.5 text-right text-gray-500">${c.costoEstimado > 0 ? formatearGuaranies(Math.round(c.costoEstimado)) : '—'}</td>
                            <td class="px-3 py-1.5 text-right font-bold ${c.ganancia >= 0 ? 'text-green-600' : 'text-red-600'}">${c.costoEstimado > 0 ? formatearGuaranies(Math.round(c.ganancia)) : '—'}</td>
                            <td class="px-3 py-1.5 text-right font-bold ${c.margenProm === null ? 'text-gray-300' : c.margenProm >= 20 ? 'text-green-600' : 'text-red-600'}">${c.margenProm !== null ? c.margenProm + '%' : '—'}</td>
                        </tr>`).join('')}
                        ${rentCat.length === 0 ? '<tr><td colspan="6" class="px-3 py-4 text-center text-gray-400 text-sm">Sin ventas en este período</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
            <p class="text-xs text-gray-400 mt-1">Costo y ganancia son estimaciones basadas en costos actuales del catálogo.</p>
        </div>`;
}

function cerrarEstadisticasCatalogo() {
    document.getElementById('modalEstadisticasCatalogo')?.hide();
}

function activarFiltroStockBajo() {
    const sw = document.getElementById('filtroStockBajo');
    if (sw) { sw.checked = true; sw.dispatchEvent(new CustomEvent('sl-change')); }
}

function _actualizarAlertaStock() {
    const banner = document.getElementById('alertaStockCritico');
    const texto = document.getElementById('alertaStockCriticoTexto');
    if (!banner || !texto) return;
    const n = (productosData.productos || []).filter(p =>
        !p.oculto && (p.presentaciones || []).some(v => (v.stock || 0) <= STOCK_BAJO_UMBRAL)
    ).length;
    if (n > 0) {
        texto.textContent = `${n} producto${n > 1 ? 's' : ''} con stock crítico (≤ ${STOCK_BAJO_UMBRAL} unidades)`;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

// ============================================
// DEBOUNCED SEARCH WRAPPERS (300ms)
// ============================================
const filtrarStockDebounced = debounce(filtrarStock, 300);
const filtrarProductosDebounced = debounce(filtrarProductos, 300);

// ============================================
// SHOELACE EVENT LISTENERS (sl-change replaces native onchange)
// ============================================
(function _initProductosShoelaceListeners() {
    document.getElementById('filtroStock')?.addEventListener('sl-change', () => aplicarFiltroStock());
    document.getElementById('filtroCategoria')?.addEventListener('sl-change', (e) => {
        poblarFiltroSubcategorias(e.target.value);
        filtrarProductos();
    });
    document.getElementById('filtroSubcategoriaProducto')?.addEventListener('sl-change', () => filtrarProductos());
    document.getElementById('filtroEstadoProducto')?.addEventListener('sl-change', () => filtrarProductos());
    document.getElementById('filtroOrdenProductos')?.addEventListener('sl-change', () => filtrarProductos());
    document.getElementById('mostrarOcultosProductos')?.addEventListener('sl-change', () => filtrarProductos());
    document.getElementById('filtroStockBajo')?.addEventListener('sl-change', () => filtrarProductos());
    document.getElementById('toggleVariantes')?.addEventListener('sl-change', () => { toggleModoVariantes(); _actualizarVendibilidad(); });
    document.getElementById('nuevoProductoCategoria')?.addEventListener('sl-change', () => _onCategoriaModalChange());

    // Checklist de vendibilidad en vivo (modal de producto)
    ['nuevoProductoNombre', 'nuevoProductoPrecio', 'nuevoProductoCosto', 'nuevoProductoStock', 'nuevoProductoPresentaciones']
        .forEach(id => document.getElementById(id)?.addEventListener('sl-input', () => _actualizarVendibilidad()));
    document.getElementById('nuevoProductoEstado')?.addEventListener('sl-change', () => _actualizarVendibilidad());
    document.getElementById('nuevoProductoSubcategoria')?.addEventListener('sl-change', () => _actualizarVendibilidad());
    // Variantes: inputs nativos dentro de #listaVariantes
    const listaVar = document.getElementById('listaVariantes');
    if (listaVar) {
        listaVar.addEventListener('input', () => _actualizarVendibilidad());
        listaVar.addEventListener('change', () => _actualizarVendibilidad());
    }
})();
