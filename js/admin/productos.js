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
            return `<div onclick="stockNavCatId='${cat.id}';stockNavNivel='subcategorias';actualizarBreadcrumbStock();renderizarStockGrid()"
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
        <div onclick="stockNavSubId=null;stockNavNivel='productos';actualizarBreadcrumbStock();renderizarStockGrid()"
            class="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-5 cursor-pointer hover:shadow-md transition-all flex items-center justify-center">
            <p class="font-bold text-gray-500 text-sm">Ver todos</p>
        </div>
        ${subs.map(sub => {
            const count = productosData.productos.filter(p => p.categoria === stockNavCatId && p.subcategoria === sub).length;
            const totalStock = productosData.productos.filter(p => p.categoria === stockNavCatId && p.subcategoria === sub)
                .reduce((s, p) => s + p.presentaciones.reduce((ss, pr) => ss + (pr.stock || 0), 0), 0);
            return `<div onclick="stockNavSubId='${sub}';stockNavNivel='productos';actualizarBreadcrumbStock();renderizarStockGrid()"
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
        const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
        const conteo = {};
        pedidos.forEach(p => (p.items || []).forEach(it => { conteo[it.productoId] = (conteo[it.productoId] || 0) + (it.cantidad || 1); }));
        prods = [...prods].sort((a, b) => (conteo[b.id] || 0) - (conteo[a.id] || 0));
    } else if (filtro === 'menos-vendidos') {
        const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
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
                    <input type="number" value="${p.precio_base || 0}" onchange="ajustarPrecioInline('${prod.id}','${p.tamano}','precio_base',this.value)"
                        class="w-16 text-xs text-right border border-gray-200 rounded px-1 py-0.5 focus:border-blue-400 outline-none" title="Precio">
                    <input type="number" value="${p.costo || 0}" onchange="ajustarPrecioInline('${prod.id}','${p.tamano}','costo',this.value)"
                        class="w-14 text-xs text-right border border-gray-200 rounded px-1 py-0.5 focus:border-blue-400 outline-none text-gray-400" title="Costo">
                    <span class="font-bold text-sm w-8 text-center ${(p.stock || 0) <= 0 ? 'text-red-600' : (p.stock || 0) < 10 ? 'text-yellow-600' : 'text-green-600'}">${p.stock || 0}</span>
                    <div class="flex gap-1 ml-auto shrink-0">
                        <button onclick="ajustarStock('${prod.id}','${p.tamano}',-1)" class="w-6 h-6 bg-red-50 text-red-600 rounded font-bold text-sm">−</button>
                        <button onclick="ajustarStock('${prod.id}','${p.tamano}',1)" class="w-6 h-6 bg-green-50 text-green-600 rounded font-bold text-sm">+</button>
                        <button onclick="ajustarStock('${prod.id}','${p.tamano}',10)" class="w-6 h-6 bg-blue-50 text-blue-600 rounded text-[10px] font-bold">+10</button>
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
    const estadoFiltro = document.getElementById('filtroEstadoProducto')?.value || '';
    const mostrarOcultos = document.getElementById('mostrarOcultosProductos')?.checked || false;
    productosFiltrados = productosData.productos.filter(p => {
        const match = p.nombre.toLowerCase().includes(filtro) || p.id.toLowerCase().includes(filtro);
        const visible = mostrarOcultos || !p.oculto;
        const catMatch = !catFiltro || p.categoria === catFiltro;
        const estMatch = !estadoFiltro || (p.estado || 'disponible') === estadoFiltro;
        return match && visible && catMatch && estMatch;
    });
    paginaProductos = 1;
    // Resetear navegacion si se aplica un filtro global
    const hayFiltro = filtro || catFiltro || estadoFiltro;
    if (hayFiltro) { prodNavNivel = 'categorias'; prodNavCatId = null; prodNavSubId = null; }
    mostrarProductosGestion();
}

function poblarFiltroCategorias() {
    const sel = document.getElementById('filtroCategoria');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todas las categorias</option>';
    (productosData.categorias || []).forEach(c => {
        sel.innerHTML += `<option value="${escapeHTML(c.id)}">${escapeHTML(c.nombre)}</option>`;
    });
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

async function mostrarProductosGestion() {
    const container = document.getElementById('productosGridContainer');
    if (!container) return;
    poblarFiltroCategorias();

    const busqueda = document.getElementById('buscarProducto')?.value.toLowerCase() || '';
    const catFiltro = document.getElementById('filtroCategoria')?.value || '';
    const estadoFiltro = document.getElementById('filtroEstadoProducto')?.value || '';
    const ordenFiltro = document.getElementById('filtroOrdenProductos')?.value || '';
    const mostrarOcultos = document.getElementById('mostrarOcultosProductos')?.checked || false;

    // Si hay filtros activos de busqueda/categoria/estado, mostrar grid de productos directamente
    const hayFiltro = busqueda || catFiltro || estadoFiltro;

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
}

async function aplicarOrdenProductos(prods, orden) {
    if (orden === 'az') return [...prods].sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (orden === 'za') return [...prods].sort((a, b) => b.nombre.localeCompare(a.nombre));
    if (orden === 'mas-vendidos') {
        const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
        const conteo = {};
        pedidos.forEach(p => (p.items || []).forEach(it => { conteo[it.productoId] = (conteo[it.productoId] || 0) + (it.cantidad || 1); }));
        return [...prods].sort((a, b) => (conteo[b.id] || 0) - (conteo[a.id] || 0));
    }
    if (orden === 'menos-vendidos') {
        const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
        const conteo = {};
        pedidos.forEach(p => (p.items || []).forEach(it => { conteo[it.productoId] = (conteo[it.productoId] || 0) + (it.cantidad || 1); }));
        return [...prods].sort((a, b) => (conteo[a.id] || 0) - (conteo[b.id] || 0));
    }
    return prods;
}

function renderizarCategoriasGestion(container) {
    const cats = productosData.categorias || [];
    container.innerHTML = `<div class="catalog-grid">
        ${cats.map(cat => {
            const count = productosData.productos.filter(p => p.categoria === cat.id).length;
            const prods = productosData.productos.filter(p => p.categoria === cat.id && (p.imagen_url || p.imagen));
            const img = prods.length > 0 ? (prods[0].imagen_url || prods[0].imagen) : '';
            return `<div onclick="prodNavCatId='${cat.id}';prodNavNivel='subcategorias';actualizarBreadcrumbProductos();mostrarProductosGestion()"
                class="catalog-card" ${img ? `data-bg="${img}"` : ''}>
                ${!img ? '<div class="catalog-card-noimg"><i data-lucide="folder-open" class="w-10 h-10 text-gray-400"></i></div>' : ''}
                <div class="catalog-card-label">
                    <div>${escapeHTML(cat.nombre)}</div>
                    <div class="card-sub">${count} productos</div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
    lucide.createIcons();
    initLazyLoadCards(container);
}

function renderizarSubcategoriasGestion(container, subs) {
    container.innerHTML = `<div class="catalog-grid">
        <div onclick="prodNavSubId=null;prodNavNivel='productos';actualizarBreadcrumbProductos();mostrarProductosGestion()"
            class="catalog-card catalog-card--loaded" style="border:2px dashed rgba(255,255,255,0.3)">
            <div class="catalog-card-noimg" style="background:linear-gradient(135deg,#4b5563,#374151)"><i data-lucide="list" class="w-10 h-10 text-gray-400"></i></div>
            <div class="catalog-card-label"><div>Ver todos</div></div>
        </div>
        ${subs.map(sub => {
            const prods = productosData.productos.filter(p => p.categoria === prodNavCatId && p.subcategoria === sub);
            const count = prods.length;
            const imgProd = prods.find(p => p.imagen_url || p.imagen);
            const img = imgProd ? (imgProd.imagen_url || imgProd.imagen) : '';
            return `<div onclick="prodNavSubId='${sub}';prodNavNivel='productos';actualizarBreadcrumbProductos();mostrarProductosGestion()"
                class="catalog-card" ${img ? `data-bg="${img}"` : ''}>
                ${!img ? '<div class="catalog-card-noimg"><i data-lucide="folder" class="w-10 h-10 text-gray-400"></i></div>' : ''}
                <div class="catalog-card-label">
                    <div>${escapeHTML(sub)}</div>
                    <div class="card-sub">${count} productos</div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
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

    container.innerHTML = `<div class="catalog-grid">
        ${paginados.map(prod => {
            const estado = prod.estado || 'disponible';
            const estadoBg = estado === 'disponible' ? 'background:#059669;color:#fff' : estado === 'agotado' ? 'background:#d97706;color:#fff' : 'background:#dc2626;color:#fff';
            const oculto = prod.oculto || false;
            const img = prod.imagen_url || prod.imagen || '';
            const precio = prod.presentaciones && prod.presentaciones.length > 0 ? (prod.presentaciones[0].precio_base || 0) : 0;
            return `<div onclick="abrirPerfilProducto('${prod.id}')" class="catalog-card ${oculto ? 'oculto' : ''}" ${img ? `data-bg="${img}"` : ''}>
                ${!img ? '<div class="catalog-card-noimg"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></div>' : ''}
                <span class="catalog-card-badge" style="${estadoBg}">${estado}</span>
                <div class="catalog-card-label">
                    <div>${escapeHTML(prod.nombre)}</div>
                    <div class="card-sub">${precio > 0 ? 'Gs. ' + precio.toLocaleString() : prod.presentaciones.length + ' pres.'}</div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
    lucide.createIcons();
    initLazyLoadCards(container);
}

function actualizarPaginacionProductos(total) {
    const pagEl = document.getElementById('paginacionProductos');
    if (!pagEl || total === 0) { if (pagEl) pagEl.innerHTML = ''; return; }
    const totalPaginas = Math.ceil(total / productosPorPagina);
    pagEl.innerHTML = `<span class="text-sm">${total} productos | Pag. ${paginaProductos} de ${totalPaginas}</span>
    <div class="flex gap-2">
        <button onclick="paginaProductos=1;mostrarProductosGestion()" class="px-3 py-1 rounded border text-xs ${paginaProductos <= 1 ? 'opacity-30' : 'hover:bg-gray-100'}" ${paginaProductos <= 1 ? 'disabled' : ''}>|&lt;</button>
        <button onclick="if(paginaProductos>1){paginaProductos--;mostrarProductosGestion()}" class="px-3 py-1 rounded border text-xs ${paginaProductos <= 1 ? 'opacity-30' : 'hover:bg-gray-100'}">&lt;</button>
        <button onclick="if(paginaProductos<${totalPaginas}){paginaProductos++;mostrarProductosGestion()}" class="px-3 py-1 rounded border text-xs ${paginaProductos >= totalPaginas ? 'opacity-30' : 'hover:bg-gray-100'}">&gt;</button>
        <button onclick="paginaProductos=${totalPaginas};mostrarProductosGestion()" class="px-3 py-1 rounded border text-xs ${paginaProductos >= totalPaginas ? 'opacity-30' : 'hover:bg-gray-100'}" ${paginaProductos >= totalPaginas ? 'disabled' : ''}>&gt;|</button>
    </div>`;
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
                ${costo > 0 ? `<span class="text-gray-500">Costo: <strong>Gs. ${costo.toLocaleString()}</strong></span>` : ''}
                <span class="text-gray-800">Precio: <strong>Gs. ${precio.toLocaleString()}</strong></span>
                ${margen !== null ? `<span class="${margen > 30 ? 'text-green-600' : margen > 15 ? 'text-yellow-600' : 'text-red-600'} font-bold">${margen}%</span>` : ''}
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
                <button onclick="ajustarStock('${prodId}','${p.tamano}',-1);abrirPerfilProducto('${prodId}')" class="w-7 h-7 bg-red-50 text-red-600 rounded font-bold">−</button>
                <button onclick="ajustarStock('${prodId}','${p.tamano}',1);abrirPerfilProducto('${prodId}')" class="w-7 h-7 bg-green-50 text-green-600 rounded font-bold">+</button>
                <button onclick="ajustarStock('${prodId}','${p.tamano}',10);abrirPerfilProducto('${prodId}')" class="w-7 h-7 bg-blue-50 text-blue-600 rounded text-xs font-bold">+10</button>
            </div>
        </div>`).join('');

    document.getElementById('modalPerfilProducto').classList.add('show');
}

function cerrarPerfilProducto() {
    document.getElementById('modalPerfilProducto').classList.remove('show');
}

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
    const idx = container.children.length;
    const d = datos || { nombre: '', precio: '', costo: '', stock: '', activo: true };
    const fila = document.createElement('div');
    fila.className = 'bg-white border border-gray-200 rounded-lg p-3 space-y-2 variante-fila';
    fila.innerHTML = `
        <div class="flex items-center justify-between gap-2">
            <input type="text" placeholder="Nombre (ej: 1 Litro, Talle 40)" value="${d.nombre}" class="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm var-nombre" required>
            <div class="flex items-center gap-2 shrink-0">
                <label class="relative inline-flex items-center cursor-pointer" title="Activo/Inactivo">
                    <input type="checkbox" class="sr-only peer var-activo" ${d.activo ? 'checked' : ''}>
                    <div class="w-8 h-4.5 bg-gray-300 rounded-full peer peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5" style="height:18px"></div>
                </label>
                <button type="button" onclick="this.closest('.variante-fila').remove()" class="text-red-400 hover:text-red-600 p-1" title="Eliminar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            </div>
        </div>
        <div class="grid grid-cols-3 gap-2">
            <div>
                <label class="block text-[10px] font-bold text-gray-400">PRECIO</label>
                <input type="number" placeholder="0" value="${d.precio}" class="w-full border border-gray-300 rounded px-2 py-1 text-sm var-precio">
            </div>
            <div>
                <label class="block text-[10px] font-bold text-gray-400">COSTO</label>
                <input type="number" placeholder="0" value="${d.costo}" class="w-full border border-gray-300 rounded px-2 py-1 text-sm var-costo">
            </div>
            <div>
                <label class="block text-[10px] font-bold text-gray-400">STOCK</label>
                <input type="number" placeholder="0" value="${d.stock}" class="w-full border border-gray-300 rounded px-2 py-1 text-sm var-stock">
            </div>
        </div>`;
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

    // Poblar categorias
    const select = document.getElementById('nuevoProductoCategoria');
    if (select) {
        select.innerHTML = '';
        productosData.categorias.forEach(c => {
            select.innerHTML += `<option value="${escapeHTML(c.id)}">${escapeHTML(c.nombre)}</option>`;
        });
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
    document.getElementById('modalProducto')?.classList.add('show');
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
        <button onclick="this.parentElement.remove()" class="text-red-400 font-bold">x</button>`;
    container.querySelector('button:last-child').before(div);
}

function actualizarSubcategoriasModal() {
    const catId = document.getElementById('nuevoProductoCategoria')?.value;
    const subSel = document.getElementById('nuevoProductoSubcategoria');
    if (!subSel) return;
    const cat = productosData.categorias.find(c => c.id === catId);
    subSel.innerHTML = '<option value="">Seleccionar...</option>';
    if (cat && cat.subcategorias) {
        cat.subcategorias.forEach(s => {
            subSel.innerHTML += `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`;
        });
    }
    subSel.innerHTML += '<option value="__otra__">+ Otra...</option>';
}

function cerrarModalProducto() {
    document.getElementById('modalProducto')?.classList.remove('show');
}

async function guardarProductoModal() {
    const id = document.getElementById('formProductoId')?.value;
    const nombre = document.getElementById('nuevoProductoNombre')?.value.trim();
    let imagen = document.getElementById('nuevoProductoImagen')?.value.trim();
    const categoria = document.getElementById('nuevoProductoCategoria')?.value;
    let subcategoria = document.getElementById('nuevoProductoSubcategoria')?.value;
    const estado = document.getElementById('nuevoProductoEstado')?.value || 'disponible';
    const tipoImpuesto = document.getElementById('nuevoProductoTipoImpuesto')?.value || '10';
    const unidadMedida = document.getElementById('nuevoProductoUnidadMedida')?.value || '77';
    const precio = parseInt(document.getElementById('nuevoProductoPrecio')?.value) || 0;
    const costo = parseInt(document.getElementById('nuevoProductoCosto')?.value) || 0;
    const stockSimple = parseInt(document.getElementById('nuevoProductoStock')?.value) || 0;

    if (subcategoria === '__otra__') {
        const datos = await mostrarInputModal({
            titulo: 'Nueva Subcategoria',
            icono: 'tag',
            campos: [{ key: 'nombre', label: 'Nombre de la subcategoria', tipo: 'text', requerido: true }],
            textoConfirmar: 'Crear'
        });
        if (!datos) return;
        subcategoria = datos.nombre;
    }

    if (!nombre) { mostrarToast('Ingresa el nombre del producto', 'error'); return; }

    // Bloquear boton para prevenir doble envio
    const btnGuardar = document.getElementById('btnGuardarProducto');
    const textoOriginalBtn = btnGuardar ? btnGuardar.innerHTML : 'Guardar';
    if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.classList.add('opacity-50', 'cursor-not-allowed');
        btnGuardar.innerHTML = '<svg class="w-4 h-4 animate-spin inline mr-1.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Guardando...';
    }

    try {
        // Subir imagen si hay archivo seleccionado
        let imagenUrl = imagen;
        if (archivoImagenProducto) {
            imagenUrl = await subirImagenProducto(archivoImagenProducto);
            archivoImagenProducto = null;
        }

        // Construir presentaciones segun el modo
        const modoVariantes = document.getElementById('toggleVariantes').checked;
        let presentaciones;
        if (modoVariantes) {
            presentaciones = recogerVariantes();
            if (presentaciones.length === 0) {
                mostrarToast('Agrega al menos una variante', 'error');
                return;
            }
        } else {
            const presStr = document.getElementById('nuevoProductoPresentaciones')?.value.trim();
            presentaciones = presStr
                ? presStr.split(',').map(p => ({ tamano: p.trim(), precio_base: precio, costo, stock: stockSimple }))
                : [{ tamano: 'Unidad', precio_base: precio, costo, stock: stockSimple }];
        }

        if (id) {
            // Edicion
            const prod = productosData.productos.find(p => p.id === id);
            if (!prod) return;
            prod.nombre = nombre;
            prod.imagen_url = imagenUrl || undefined;
            prod.imagen = imagenUrl || undefined;
            prod.categoria = categoria;
            prod.subcategoria = subcategoria || 'General';
            prod.estado = estado;
            prod.tipo_impuesto = tipoImpuesto;
            prod.unidad_medida_set = unidadMedida;
            prod.presentaciones = presentaciones;
        } else {
            // Creacion
            const ultimoId = productosData.productos.length > 0 ?
                Math.max(...productosData.productos.map(p => parseInt(p.id.replace('P', '')) || 0)) : 0;
            const nuevoId = `P${String(ultimoId + 1).padStart(3, '0')}`;
            const nuevo = { id: nuevoId, nombre, categoria: categoria || 'cuidado_personal', subcategoria: subcategoria || 'General', presentaciones, estado, tipo_impuesto: tipoImpuesto, unidad_medida_set: unidadMedida };
            if (imagenUrl) { nuevo.imagen = imagenUrl; nuevo.imagen_url = imagenUrl; }
            productosData.productos.push(nuevo);
        }

        productosFiltrados = [...productosData.productos];
        registrarCambio();
        mostrarProductosGestion();
        cerrarModalProducto();
        mostrarToast('Producto guardado correctamente', 'success');
    } catch (err) {
        console.error('[Admin] Error guardando producto:', err);
        mostrarToast('Error al guardar: ' + err.message, 'error');
    } finally {
        // Restaurar boton siempre
        if (btnGuardar) {
            btnGuardar.disabled = false;
            btnGuardar.classList.remove('opacity-50', 'cursor-not-allowed');
            btnGuardar.innerHTML = textoOriginalBtn;
        }
    }
}

// ============================================
// GESTION DE CATEGORIAS
// ============================================

function abrirModalCategorias() {
    renderizarListaCategorias();
    document.getElementById('modalCategorias')?.classList.add('show');
}
function cerrarModalCategorias() {
    document.getElementById('modalCategorias')?.classList.remove('show');
}

function renderizarListaCategorias() {
    const container = document.getElementById('listaCategoriasCuerpo');
    if (!container) return;
    container.innerHTML = '';
    (productosData.categorias || []).forEach(cat => {
        const div = document.createElement('div');
        div.className = 'bg-gray-50 rounded-xl p-4';
        div.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <div>
                    <span class="font-bold text-gray-800">${escapeHTML(cat.nombre)}</span>
                    <span class="text-xs text-gray-400 ml-2">(${escapeHTML(cat.id)})</span>
                </div>
                <button onclick="eliminarCategoria('${cat.id}')" class="text-red-500 text-xs font-bold hover:underline">Eliminar</button>
            </div>
            <div class="flex flex-wrap gap-2 mb-2">
                ${(cat.subcategorias || []).map(s => `
                    <span class="bg-white px-2 py-1 rounded-lg text-xs border border-gray-200 flex items-center gap-1">
                        ${escapeHTML(s)} <button onclick="eliminarSubcategoria('${escapeHTML(cat.id)}','${escapeHTML(s)}')" class="text-red-400 hover:text-red-600 font-bold">x</button>
                    </span>`).join('')}
            </div>
            <div class="flex gap-2">
                <input type="text" id="nuevaSub_${cat.id}" class="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs" placeholder="Nueva subcategoria...">
                <button onclick="agregarSubcategoria('${cat.id}')" class="bg-gray-800 text-white px-3 py-1 rounded-lg text-xs font-bold">+</button>
            </div>`;
        container.appendChild(div);
    });
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
// DEBOUNCED SEARCH WRAPPERS (300ms)
// ============================================
const filtrarStockDebounced = debounce(filtrarStock, 300);
const filtrarProductosDebounced = debounce(filtrarProductos, 300);
