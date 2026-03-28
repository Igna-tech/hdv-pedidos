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
        ${botonTexto ? `<button onclick="${botonOnclick}" class="mt-4 px-5 py-3 bg-[#111827] text-white rounded-xl font-bold text-sm active:scale-95 transition-transform">${botonTexto}</button>` : ''}
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
function poblarClientes(filtro) {
    const select = document.getElementById('clienteSelect');
    const valorActual = select.value;
    select.innerHTML = '';
    const q = (filtro || '').toLowerCase().trim();
    let lista = q ? clientes.filter(c =>
        (c.razon_social || c.nombre || '').toLowerCase().includes(q) ||
        (c.ruc || '').toLowerCase().includes(q) ||
        (c.id || '').toLowerCase().includes(q)
    ) : clientes;
    // Filtrar por zona activa si hay una seleccionada
    if (typeof zonaActiva !== 'undefined' && zonaActiva) {
        lista = lista.filter(c => c.zona && c.zona.trim() === zonaActiva);
    }
    lista.forEach(c => {
        const nombre = escapeHTML(c.razon_social || c.nombre || c.id);
        const ruc = c.ruc ? escapeHTML(c.ruc) : '';
        const zona = c.zona ? escapeHTML(c.zona) : '';
        const opt = document.createElement('sl-option');
        opt.value = c.id;
        opt.textContent = nombre;
        // Keywords para busqueda: nombre + ruc + zona
        const keywords = [c.razon_social, c.nombre, c.ruc, c.zona, c.id].filter(Boolean).join(' ');
        opt.setAttribute('data-keywords', keywords);
        // Contenido rico
        let suffix = '';
        if (ruc) suffix += `<small style="color:#9ca3af;margin-left:8px;">${ruc}</small>`;
        if (zona) suffix += `<sl-badge variant="neutral" pill style="margin-left:6px;font-size:10px;">${zona}</sl-badge>`;
        if (suffix) opt.innerHTML = `${nombre}${suffix}`;
        select.appendChild(opt);
    });
    if (valorActual && !filtro) select.value = valorActual;
}

function poblarZonePills() {
    const container = document.getElementById('zonePills');
    if (!container) return;
    const zonas = typeof obtenerZonasUnicas === 'function' ? obtenerZonasUnicas() : [];
    if (zonas.length === 0) { container.innerHTML = ''; return; }

    let html = `<sl-tag size="medium" pill class="zone-pill shrink-0 cursor-pointer${!zonaActiva ? ' zone-pill-active' : ''}" data-zona="" style="scroll-snap-align:start;">Todas</sl-tag>`;
    zonas.forEach(z => {
        const active = zonaActiva === z.zona;
        html += `<sl-tag size="medium" pill class="zone-pill shrink-0 cursor-pointer${active ? ' zone-pill-active' : ''}" data-zona="${escapeHTML(z.zona)}" style="scroll-snap-align:start;">${escapeHTML(z.zona)} <sl-badge pill variant="neutral" style="margin-left:4px;font-size:10px;">${z.cantidad}</sl-badge></sl-tag>`;
    });
    container.innerHTML = html;

    container.querySelectorAll('.zone-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const zona = pill.dataset.zona;
            if (zona) {
                zonaActiva = zona;
            } else {
                zonaActiva = null;
            }
            poblarClientes();
            poblarZonePills();
            if (typeof actualizarIndicadorZona === 'function') actualizarIndicadorZona(zonaActiva);
        });
    });
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
    const pagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || {};
    const creditos = pedidosCliente.filter(p => p.tipoPago === 'credito');
    let deudaTotal = 0;
    creditos.forEach(p => {
        const pagosP = (pagos[p.id] || []).reduce((s, pg) => s + (pg.monto || 0), 0);
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
    container.innerHTML = '<button class="px-4 py-2 bg-gray-900 text-white rounded-full text-xs font-bold whitespace-nowrap category-btn" onclick="filtrarCategoria(\'todas\')">Todas</button>';

    categorias.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-xs font-bold whitespace-nowrap category-btn';
        btn.textContent = cat.nombre;
        btn.onclick = () => filtrarCategoria(cat.id);
        container.appendChild(btn);
    });
}

function filtrarCategoria(catId) {
    categoriaActual = catId;
    if (catId === 'todas') {
        categoriaSeleccionada = null;
        vistaCatalogo = 'categorias';
    } else {
        categoriaSeleccionada = null;
        vistaCatalogo = 'productos';
    }
    document.querySelectorAll('.category-btn').forEach((btn, i) => {
        if ((catId === 'todas' && i === 0) || btn.textContent === categorias.find(c => c.id === catId)?.nombre) {
            btn.className = 'px-4 py-2 bg-gray-900 text-white rounded-full text-xs font-bold whitespace-nowrap category-btn';
        } else {
            btn.className = 'px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-xs font-bold whitespace-nowrap category-btn';
        }
    });
    mostrarProductos();
}

function volverACategorias() {
    categoriaSeleccionada = null;
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

    // Widget de meta al inicio
    const metaHtml = typeof generarWidgetMeta === 'function' ? await generarWidgetMeta() : '';
    if (metaHtml) {
        const metaDiv = document.createElement('div');
        metaDiv.innerHTML = metaHtml;
        container.appendChild(metaDiv);
    }

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
                const chip = document.createElement('button');
                chip.className = 'shrink-0 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs font-bold text-blue-800 active:scale-95 transition-transform';
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
    let filtrados = productos;

    const catFiltro = categoriaActual !== 'todas' ? categoriaActual : categoriaSeleccionada;
    if (catFiltro) {
        filtrados = filtrados.filter(p => p.categoria === catFiltro);
    }
    if (busqueda) {
        filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(busqueda));
    }

    if (categoriaSeleccionada && !busqueda && categoriaActual === 'todas') {
        filtrados = filtrados.filter(p => {
            const estado = p.estado || 'disponible';
            if (estado === 'discontinuado' || estado === 'agotado') return false;
            return true;
        });
    }

    if (filtrados.length === 0) {
        const catNombre = categorias.find(c => c.id === catFiltro)?.nombre || '';
        container.innerHTML = generarEmptyState(SVG_EMPTY_SEARCH, 'No se encontraron productos',
            busqueda ? 'Intenta con otro termino de busqueda' : `No hay productos disponibles en ${escapeHTML(catNombre)}`);
        if (categoriaSeleccionada) {
            container.innerHTML += `<div class="text-center mt-2"><button onclick="volverACategorias()" class="px-5 py-3 bg-[#111827] text-white rounded-xl font-bold text-sm active:scale-95 transition-transform">Volver a Categorias</button></div>`;
        }
        return;
    }

    container.innerHTML = '';

    if (categoriaSeleccionada && categoriaActual === 'todas') {
        const catNombre = categorias.find(c => c.id === categoriaSeleccionada)?.nombre || '';
        const backBar = document.createElement('div');
        backBar.className = 'flex items-center gap-3 mb-3';
        backBar.innerHTML = `
            <button onclick="volverACategorias()" class="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900 active:scale-95 transition-all bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                Categorias
            </button>
            <span class="text-sm font-bold text-gray-800">${catNombre}</span>
            <span class="text-xs text-gray-400">${filtrados.length} producto${filtrados.length !== 1 ? 's' : ''}</span>`;
        container.appendChild(backBar);
    }

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 gap-2';
    container.appendChild(grid);

    const noImgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;

    // CRIT-02: Renderizado chunked con requestAnimationFrame
    // Renderiza lotes de 40 productos por frame para no bloquear el main thread
    const CHUNK_SIZE = 40;
    let idx = 0;

    async function renderChunk() {
        const end = Math.min(idx + CHUNK_SIZE, filtrados.length);
        for (let i = idx; i < end; i++) {
            const prod = filtrados[i];
            const card = document.createElement('div');
            card.className = 'product-card bg-white rounded-xl p-2 shadow-sm border border-gray-100 active:scale-95 transition-transform cursor-pointer';
            card.onclick = () => mostrarDetalleProducto(prod);

            const imgUrl = prod.imagen_url || prod.imagen;
            let imgContent;
            if (imgUrl) {
                imgContent = `<div class="relative w-full h-24 rounded-lg overflow-hidden bg-gray-100">
                    <div class="absolute inset-0 bg-gray-200 animate-pulse rounded-lg img-skeleton"></div>
                    <img data-src="${imgUrl}" class="absolute inset-0 w-full h-full object-contain lazy-img opacity-0 transition-opacity duration-300">
                </div>`;
            } else {
                imgContent = `<div class="w-full h-24 rounded-lg bg-gray-800 flex items-center justify-center">${noImgSvg}</div>`;
            }

            const promoBadge = typeof mostrarPromocionesEnProducto === 'function' ? await mostrarPromocionesEnProducto(prod.id) : '';
            card.innerHTML = `
                ${imgContent}
                <p class="text-xs font-bold text-gray-800 leading-tight mt-1.5">${escapeHTML(prod.nombre)}</p>
                ${promoBadge}
            `;
            grid.appendChild(card);
        }
        idx = end;
        if (idx < filtrados.length) {
            requestAnimationFrame(renderChunk);
        } else {
            // Ultimo chunk: activar lazy load e iconos solo sobre los nodos renderizados
            if (typeof lucide !== 'undefined') lucide.createIcons({ node: grid });
            initLazyLoadImages(grid);
        }
    }

    if (filtrados.length > 0) {
        requestAnimationFrame(renderChunk);
    }
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
                <input type="number" id="mtz-${producto.id}-${idx}" value="0" min="0"
                    ${esAgotado ? 'disabled' : ''}
                    class="w-full text-center text-2xl font-bold border-0 border-b-2 border-gray-200 focus:border-blue-500 outline-none bg-transparent py-1 mtz-input"
                    data-idx="${idx}" data-precio="${precio}"
                    oninput="actualizarCeldaMatriz('${producto.id}',${idx})">
                <p class="text-[10px] text-blue-600 font-bold mt-1">${formatearGuaranies(precio)}</p>
            </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'productDetailModal';
    modal.className = 'fixed inset-0 bg-black/50 z-[100] flex items-end';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="bg-gray-50 w-full rounded-t-3xl max-h-[90vh] overflow-y-auto shadow-2xl" onclick="event.stopPropagation()">
            <div class="bg-[#111827] text-white p-4 rounded-t-3xl">
                <div class="w-12 h-1.5 bg-gray-600 rounded-full mx-auto mb-3"></div>
                <div class="flex items-center gap-3">
                    ${iconHtml}
                    <div>
                        <h3 class="text-lg font-bold">${escapeHTML(producto.nombre)}</h3>
                        <p class="text-xs text-gray-400">${escapeHTML(catNombre)} › ${escapeHTML(producto.subcategoria)}</p>
                    </div>
                </div>
                <div class="flex items-center justify-between mt-3 bg-gray-800 rounded-xl p-3">
                    <div class="text-center">
                        <p class="text-2xl font-bold" id="mtzTotalPares-${producto.id}">0</p>
                        <p class="text-[10px] text-gray-400 font-bold">PARES</p>
                    </div>
                    <div class="text-center">
                        <p class="text-lg font-bold text-green-400" id="mtzTotalGs-${producto.id}">Gs. 0</p>
                        <p class="text-[10px] text-gray-400 font-bold">TOTAL</p>
                    </div>
                    <button onclick="limpiarMatriz('${producto.id}')" class="bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-xs font-bold">Limpiar</button>
                </div>
            </div>

            <div class="p-4">
                <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Toca cada talle e ingresa la cantidad</p>
                <div class="grid grid-cols-3 gap-3" id="matrizGrid-${producto.id}">
                    ${celdas}
                </div>
            </div>

            <div class="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex gap-3">
                <button onclick="document.getElementById('productDetailModal').remove()" class="flex-1 bg-gray-100 text-gray-700 py-4 rounded-xl font-bold">Cancelar</button>
                <button onclick="agregarMatrizAlCarrito('${producto.id}')" class="flex-1 bg-[#111827] text-white py-4 rounded-xl font-bold shadow-lg">
                    Agregar <span id="mtzBtnCount-${producto.id}">0</span> pares
                </button>
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
                    <button onclick="ajustarQty('${producto.id}',${idx},-1)" class="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center font-bold text-lg text-gray-700 active:scale-90 transition-transform">-</button>
                    <input type="number" id="qty-${producto.id}-${idx}" value="0" min="0" data-precio="${precio}"
                        class="w-14 text-center border border-gray-200 rounded-xl py-1.5 font-bold text-lg masivo-input"
                        oninput="recalcularTotalMasivo('${producto.id}')">
                    <button onclick="ajustarQty('${producto.id}',${idx},1)" class="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center font-bold text-lg text-gray-700 active:scale-90 transition-transform">+</button>
                </div>
            </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'productDetailModal';
    modal.className = 'fixed inset-0 bg-black/50 z-[100] flex items-end';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="bg-gray-50 w-full rounded-t-3xl max-h-[90vh] overflow-y-auto shadow-2xl" onclick="event.stopPropagation()">
            <div class="bg-[#111827] text-white p-4 rounded-t-3xl">
                <div class="w-12 h-1.5 bg-gray-600 rounded-full mx-auto mb-3"></div>
                <div class="flex items-center gap-3">
                    ${imgUrlMasivo ? `<img src="${imgUrlMasivo}" class="w-12 h-12 rounded-xl object-contain bg-white/10">` : '<i data-lucide="package" class="w-10 h-10 text-gray-400"></i>'}
                    <div class="min-w-0 flex-1">
                        <h3 class="text-lg font-bold leading-tight truncate">${escapeHTML(producto.nombre)}</h3>
                        <p class="text-xs text-gray-400">${escapeHTML(catNombre)}${producto.subcategoria ? ' › ' + escapeHTML(producto.subcategoria) : ''}</p>
                    </div>
                </div>
                <div class="flex items-center justify-between mt-3 bg-gray-800 rounded-xl p-3">
                    <div>
                        <p class="text-xs text-gray-400 font-bold">TOTAL</p>
                        <p class="text-lg font-bold text-green-400" id="masivoTotal-${producto.id}">Gs. 0</p>
                    </div>
                    <p class="text-sm font-bold text-gray-300"><span id="masivoItems-${producto.id}">0</span> items</p>
                </div>
            </div>

            <div class="p-4">
                <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Selecciona variantes</p>
                <div class="bg-white rounded-xl divide-y divide-gray-100 shadow-sm">${presHTML}</div>
            </div>

            <div class="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex gap-3">
                <button onclick="document.getElementById('productDetailModal').remove()" class="flex-1 bg-gray-100 text-gray-700 py-4 rounded-xl font-bold">Cancelar</button>
                <button onclick="agregarMasivoAlCarrito('${producto.id}')" class="flex-1 bg-[#111827] text-white py-4 rounded-xl font-bold shadow-lg">Agregar al carrito</button>
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

    const backdrop = document.getElementById('cartBackdrop');
    const drawer = document.getElementById('cartDrawer');
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => {
        backdrop.classList.add('open');
        drawer.classList.add('open');
    });
    renderizarCarrito();
    lucide.createIcons();
}

function closeCartModal() {
    const backdrop = document.getElementById('cartBackdrop');
    const drawer = document.getElementById('cartDrawer');
    backdrop.classList.remove('open');
    drawer.classList.remove('open');
    setTimeout(() => backdrop.classList.add('hidden'), 350);
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
                        <sl-icon-button name="dash-lg" label="Menos" onclick="cambiarCantidadCarrito(${idx},-1)" style="font-size:1.2rem;--sl-input-border-radius-medium:10px;" class="cart-qty-btn"></sl-icon-button>
                        <span class="font-bold text-base w-8 text-center">${item.cantidad}</span>
                        <sl-icon-button name="plus-lg" label="Mas" onclick="cambiarCantidadCarrito(${idx},1)" style="font-size:1.2rem;--sl-input-border-radius-medium:10px;" class="cart-qty-btn"></sl-icon-button>
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
function crearTarjetaPedidoVendedor(p) {
    const estado = p.estado || PEDIDO_ESTADOS.PENDIENTE;
    const { clases: colorEstado, label: labelEstado } = obtenerEstadoUI(estado, '700');

    const div = document.createElement('div');
    div.className = 'bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3 transition-all duration-300';
    div.setAttribute('data-pedido-id', p.id);
    div.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div>
                <p class="font-bold text-gray-800">${escapeHTML(p.cliente?.nombre || 'N/A')}</p>
                <p class="text-xs text-gray-500">${new Date(p.fecha).toLocaleString('es-PY')}</p>
            </div>
            <span class="pedido-estado-badge px-2 py-1 rounded-full text-[10px] font-bold ${colorEstado}">${labelEstado}</span>
        </div>
        <div class="text-sm text-gray-600 mb-2">
            ${(p.items || []).map(i => `${escapeHTML(i.nombre)} (${escapeHTML(i.presentacion)} ×${i.cantidad})`).join(', ')}
        </div>
        <div class="flex justify-between items-center pt-2 border-t border-gray-100">
            <span class="text-xs text-gray-500">${p.tipoPago || 'contado'}</span>
            <span class="font-bold text-gray-900">${formatearGuaranies(p.total)}</span>
        </div>
        <div class="flex gap-2 mt-3 pt-2 border-t border-gray-50">
            <button onclick="imprimirTicketVendedor('${p.id}')" class="flex-1 bg-purple-50 text-purple-700 py-2 rounded-lg text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"><i data-lucide="printer" class="w-3 h-3"></i> Ticket</button>
            <button onclick="generarPDFVendedor('${p.id}')" class="flex-1 bg-red-50 text-red-700 py-2 rounded-lg text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"><i data-lucide="file-text" class="w-3 h-3"></i> PDF</button>
            <button onclick="enviarPedidoWhatsApp('${p.id}')" class="flex-1 bg-green-50 text-green-700 py-2 rounded-lg text-xs font-bold active:scale-95 transition-transform flex items-center justify-center gap-1"><i data-lucide="send" class="w-3 h-3"></i> WhatsApp</button>
        </div>
    `;
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

async function mostrarMisPedidos() {
    const container = document.getElementById('productsContainer');
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];

    let misPedidos = pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (misPedidos.length === 0) {
        container.innerHTML = generarEmptyState(SVG_EMPTY_ORDERS, 'No hay pedidos registrados', 'Los pedidos que realices apareceran aqui', 'Ir al catalogo', "cambiarVistaVendedor('lista')");
        return;
    }

    container.innerHTML = '<h3 class="text-lg font-bold text-gray-800 mb-4">Mis Pedidos</h3>';

    misPedidos.forEach(p => {
        const div = crearTarjetaPedidoVendedor(p);
        container.appendChild(div);
    });
    lucide.createIcons();
}

// ============================================
// TOAST / MODALES UI — con agrupacion y silenciado en carga inicial
// ============================================
const _toastQueue = {};
let _toastDebounceTimer = {};

function mostrarToast(mensaje, tipo = 'info', duracion = 3500) {
    // Suprimir toasts informativos durante carga inicial (errores siempre pasan)
    if (!window._hdvAppReady && (tipo === 'info' || tipo === 'success')) return;

    const container = document.getElementById('toastContainer');
    if (!container) return;

    // Agrupacion: si llegan multiples toasts del mismo tipo en 500ms, agrupar
    const key = tipo + ':' + mensaje.replace(/[0-9]+/g, '#');
    if (!_toastQueue[key]) _toastQueue[key] = [];
    _toastQueue[key].push(mensaje);

    clearTimeout(_toastDebounceTimer[key]);
    _toastDebounceTimer[key] = setTimeout(() => {
        const mensajes = _toastQueue[key] || [];
        delete _toastQueue[key];
        delete _toastDebounceTimer[key];

        if (mensajes.length === 0) return;

        let textoFinal;
        if (mensajes.length === 1) {
            textoFinal = mensajes[0];
        } else {
            textoFinal = `(${mensajes.length}) ${mensajes[0]}`;
        }

        _renderToast(container, textoFinal, tipo, duracion);
    }, 500);
}

function _renderToast(container, mensaje, tipo, duracion) {
    const variantMap = { success: 'success', error: 'danger', info: 'neutral', warning: 'warning' };
    const iconMap = { success: 'check2-circle', error: 'exclamation-octagon', info: 'info-circle', warning: 'exclamation-triangle' };
    const alert = document.createElement('sl-alert');
    alert.variant = variantMap[tipo] || 'neutral';
    alert.closable = true;
    alert.duration = duracion;
    alert.open = true;
    alert.style.marginBottom = '8px';
    alert.innerHTML = `<sl-icon name="${iconMap[tipo] || 'info-circle'}" slot="icon"></sl-icon>${escapeHTML(mensaje)}`;
    container.appendChild(alert);
    alert.addEventListener('sl-after-hide', () => alert.remove(), { once: true });
}

function mostrarExito(msg) {
    mostrarToast(msg, 'success');
}

function mostrarConfirmModal(mensaje, opciones = {}) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'confirm-backdrop';
        backdrop.innerHTML = `
            <div class="confirm-box">
                <div class="text-center mb-5">
                    <div class="w-14 h-14 mx-auto mb-3 rounded-full ${opciones.destructivo ? 'bg-red-100' : 'bg-gray-100'} flex items-center justify-center">
                        <i data-lucide="${opciones.destructivo ? 'alert-triangle' : 'help-circle'}" class="w-6 h-6 ${opciones.destructivo ? 'text-red-500' : 'text-gray-500'}"></i>
                    </div>
                    <p class="text-gray-800 font-semibold text-sm whitespace-pre-line leading-relaxed">${escapeHTML(mensaje)}</p>
                </div>
                <div class="flex gap-3">
                    <button class="confirm-cancel-btn flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform">Cancelar</button>
                    <button class="confirm-ok-btn flex-1 ${opciones.destructivo ? 'bg-red-600' : 'bg-[#111827]'} text-white py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform">${opciones.textoConfirmar || 'Confirmar'}</button>
                </div>
            </div>`;
        document.body.appendChild(backdrop);
        lucide.createIcons();

        const cerrar = (result) => { backdrop.remove(); resolve(result); };
        backdrop.querySelector('.confirm-cancel-btn').onclick = () => cerrar(false);
        backdrop.querySelector('.confirm-ok-btn').onclick = () => cerrar(true);
        backdrop.onclick = (e) => { if (e.target === backdrop) cerrar(false); };
    });
}

function mostrarInputModal(opciones = {}) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'confirm-backdrop';

        let camposHTML = '';
        for (const campo of (opciones.campos || [])) {
            const req = campo.requerido ? 'required' : '';
            const labelHTML = `<label class="block text-sm font-semibold text-gray-300 mb-1.5">${campo.label}${campo.requerido ? ' <span class="text-red-400">*</span>' : ''}</label>`;
            if (campo.tipo === 'select') {
                const optsHTML = (campo.opciones || []).map(o => `<option value="${o.value}">${o.label}</option>`).join('');
                camposHTML += `<div class="mb-3">${labelHTML}<select id="modal_field_${campo.key}" class="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm" ${req}><option value="">-- Seleccionar --</option>${optsHTML}</select></div>`;
            } else if (campo.tipo === 'textarea') {
                camposHTML += `<div class="mb-3">${labelHTML}<textarea id="modal_field_${campo.key}" rows="3" class="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm" placeholder="${campo.placeholder || ''}" ${req}>${campo.valor || ''}</textarea></div>`;
            } else {
                camposHTML += `<div class="mb-3">${labelHTML}<input type="${campo.tipo || 'text'}" id="modal_field_${campo.key}" value="${campo.valor ?? ''}" placeholder="${campo.placeholder || ''}" class="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2.5 text-sm" ${req} ${campo.tipo === 'number' ? 'min="0" inputmode="numeric"' : ''}></div>`;
            }
        }

        backdrop.innerHTML = `
            <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden border border-gray-700" onclick="event.stopPropagation()">
                <div class="p-5">
                    <h3 class="text-base font-bold text-white mb-4">${opciones.titulo || 'Ingrese datos'}</h3>
                    <div>${camposHTML}</div>
                </div>
                <div class="flex gap-3 p-4 bg-gray-800/50 border-t border-gray-700">
                    <button class="modal-cancel-btn flex-1 bg-gray-700 text-gray-300 py-2.5 rounded-xl font-bold text-sm active:scale-95 transition-transform">Cancelar</button>
                    <button class="modal-ok-btn flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-bold text-sm active:scale-95 transition-transform">${opciones.textoConfirmar || 'Confirmar'}</button>
                </div>
            </div>`;

        document.body.appendChild(backdrop);

        const primerInput = backdrop.querySelector('input, textarea');
        if (primerInput) primerInput.focus();

        const cerrar = (result) => { backdrop.remove(); resolve(result); };
        const confirmar = () => {
            const datos = {};
            for (const campo of (opciones.campos || [])) {
                const el = backdrop.querySelector(`#modal_field_${campo.key}`);
                if (!el) continue;
                const val = el.value;
                if (campo.requerido && !val.trim()) { el.classList.add('ring-2', 'ring-red-500'); el.focus(); return; }
                datos[campo.key] = campo.tipo === 'number' ? (parseFloat(val) || 0) : val;
            }
            cerrar(datos);
        };
        backdrop.querySelector('.modal-cancel-btn').onclick = () => cerrar(null);
        backdrop.querySelector('.modal-ok-btn').onclick = confirmar;
        backdrop.onclick = (e) => { if (e.target === backdrop) cerrar(null); };
        backdrop.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmar(); });
        });
    });
}

// ============================================
// DARK MODE
// ============================================
async function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    await HDVStorage.setItem('hdv_darkmode', document.body.classList.contains('dark-mode'));
}

// Cargar dark mode guardado
(async () => {
    await HDVStorage.ready();
    const darkMode = await HDVStorage.getItem('hdv_darkmode', { clone: false });
    if (darkMode === true || darkMode === 'true') {
        document.body.classList.add('dark-mode');
    }
})();

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
                    <button onclick="mostrarFormNuevoCliente()" class="w-full bg-gray-900 text-white py-4 rounded-xl font-bold">
                        Agregar nuevo cliente
                    </button>
                    <button onclick="cerrarModalSinCliente()" class="w-full bg-gray-100 text-gray-700 py-4 rounded-xl font-bold">
                        Volver y seleccionar cliente
                    </button>
                </div>
                <div id="formNuevoClienteVendedor" style="display:none;" class="space-y-3 mt-2">
                    <sl-input id="ncvNombre" label="NOMBRE *" placeholder="Nombre del cliente" required size="medium"></sl-input>
                    <sl-input id="ncvTelefono" label="TELEFONO *" placeholder="Ej: 0981234567" type="tel" required size="medium"></sl-input>
                    <sl-input id="ncvZona" label="ZONA *" placeholder="Ej: Loma Plata" required size="medium"></sl-input>
                    <sl-input id="ncvDireccion" label="DIRECCION (opcional)" placeholder="Ej: Calle San Martin 123" size="medium"></sl-input>
                    <sl-input id="ncvRuc" label="RUC (opcional)" placeholder="Ej: 80012345-6" size="medium"></sl-input>
                    <sl-input id="ncvEncargado" label="ENCARGADO (opcional)" placeholder="Ej: Juan Perez" size="medium"></sl-input>
                    <div class="flex gap-3 pt-2">
                        <sl-button onclick="cerrarModalSinCliente()" variant="default" size="large" class="flex-1" style="--sl-input-border-radius-large:12px;">Cancelar</sl-button>
                        <sl-button onclick="guardarNuevoClienteDesdeVendedor()" variant="primary" size="large" class="flex-1" style="--sl-input-border-radius-large:12px;">Enviar para aprobacion</sl-button>
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
            <button onclick="limpiarTodosDatos()" class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold w-full">Borrar Todos Mis Pedidos</button>
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

    html += `<button onclick="resetearFiltroZona()" class="w-full bg-gray-800 text-white py-4 rounded-xl font-bold text-sm mb-3 active:scale-95 transition-transform">
        Todas las Zonas (${clientes.length} clientes)
    </button>`;

    html += '<div class="grid grid-cols-2 gap-3">';
    const colores = ['bg-blue-50 border-blue-200 text-blue-800', 'bg-green-50 border-green-200 text-green-800', 'bg-purple-50 border-purple-200 text-purple-800', 'bg-yellow-50 border-yellow-200 text-yellow-800', 'bg-red-50 border-red-200 text-red-800', 'bg-indigo-50 border-indigo-200 text-indigo-800'];
    zonas.forEach((z, i) => {
        const color = colores[i % colores.length];
        html += `<button onclick="seleccionarZona('${z.zona}')" class="${color} border-2 rounded-xl p-4 text-center active:scale-95 transition-transform">
            <p class="mb-1"><i data-lucide="map-pin" class="w-8 h-8 text-gray-400 mx-auto"></i></p>
            <p class="font-bold text-sm">${escapeHTML(z.zona)}</p>
            <p class="text-xs opacity-70">${z.cantidad} clientes</p>
        </button>`;
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
        <button onclick="mostrarFiltroZonas()" class="text-sm text-blue-600 font-bold">Cambiar Zona</button>
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
                        <button onclick="seleccionarClienteDesdeRuta('${c.id}')" class="bg-gray-800 text-white px-3 py-2 rounded-lg text-xs font-bold active:scale-95 transition-transform">Seleccionar</button>
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
async function mostrarMiCaja() {
    const container = document.getElementById('productsContainer');
    const semana = obtenerSemanaActualVendedor();
    const { inicio, fin } = obtenerRangoSemanaVendedor(semana);

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const gastos = (await HDVStorage.getItem('hdv_gastos', { clone: false })) || [];
    const cuentas = (await HDVStorage.getItem('hdv_cuentas_bancarias', { clone: false })) || [];
    const rendiciones = (await HDVStorage.getItem('hdv_rendiciones', { clone: false })) || [];

    const pedidosSemana = pedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= inicio && f <= fin;
    });
    const totalContado = pedidosSemana
        .filter(p => p.tipoPago === 'contado' && (p.estado === PEDIDO_ESTADOS.ENTREGADO || p.estado === 'pendiente'))
        .reduce((s, p) => s + (p.total || 0), 0);
    const totalCredito = pedidosSemana
        .filter(p => p.tipoPago === 'credito')
        .reduce((s, p) => s + (p.total || 0), 0);

    const gastosSemana = gastos.filter(g => {
        const f = new Date(g.fecha);
        return f >= inicio && f <= fin;
    });
    const totalGastos = gastosSemana.reduce((s, g) => s + (g.monto || 0), 0);
    const aRendir = totalContado - totalGastos;

    const metaWidget = await generarWidgetMeta();

    const rendSemana = rendiciones.find(r => r.semana === semana);

    const fechaInicio = inicio.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
    const fechaFin = fin.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });

    container.innerHTML = `
        <h3 class="text-lg font-bold text-gray-800 mb-4">Mi Caja</h3>

        ${metaWidget}

        <div class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Semana: ${fechaInicio} - ${fechaFin}</p>
            ${rendSemana ? '<span class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">RENDIDO</span>' : ''}
            <div class="grid grid-cols-2 gap-3 mt-3">
                <div class="bg-green-50 rounded-lg p-3 text-center">
                    <p class="text-lg font-bold text-green-700">${formatearGuaranies(totalContado)}</p>
                    <p class="text-[10px] text-gray-500 font-bold">CONTADO</p>
                </div>
                <div class="bg-yellow-50 rounded-lg p-3 text-center">
                    <p class="text-lg font-bold text-yellow-700">${formatearGuaranies(totalCredito)}</p>
                    <p class="text-[10px] text-gray-500 font-bold">CREDITO</p>
                </div>
                <div class="bg-red-50 rounded-lg p-3 text-center">
                    <p class="text-lg font-bold text-red-700">${formatearGuaranies(totalGastos)}</p>
                    <p class="text-[10px] text-gray-500 font-bold">GASTOS</p>
                </div>
                <div class="bg-blue-50 rounded-lg p-3 text-center">
                    <p class="text-lg font-bold text-blue-800">${formatearGuaranies(aRendir)}</p>
                    <p class="text-[10px] text-gray-500 font-bold">A RENDIR</p>
                </div>
            </div>
        </div>

        <div class="flex gap-2 mb-3">
            <button onclick="agregarGastoVendedor()" class="flex-1 bg-red-50 text-red-700 py-3 rounded-xl text-sm font-bold active:scale-95 transition-transform">+ Agregar Gasto</button>
            ${!rendSemana ? `<button onclick="cerrarSemanaVendedor('${semana}')" class="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-bold active:scale-95 transition-transform">Cerrar Semana</button>` : ''}
        </div>

        ${gastosSemana.length > 0 ? `
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 mb-3 overflow-hidden">
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider p-3 bg-gray-50">Gastos de la Semana</p>
            ${gastosSemana.map(g => `
                <div class="p-3 border-t border-gray-100 flex justify-between items-center">
                    <div>
                        <p class="text-sm font-bold text-gray-800">${escapeHTML(g.concepto)}</p>
                        <p class="text-xs text-gray-400">${new Date(g.fecha).toLocaleDateString('es-PY')}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-bold text-red-600">- ${formatearGuaranies(g.monto)}</p>
                        <button onclick="eliminarGastoVendedor('${g.id}')" class="text-[10px] text-red-400">Eliminar</button>
                    </div>
                </div>
            `).join('')}
        </div>` : ''}

        ${cuentas.length > 0 ? `
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 mb-3 overflow-hidden">
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider p-3 bg-gray-50">Cuentas Bancarias de la Empresa</p>
            ${cuentas.map(c => `
                <div class="p-3 border-t border-gray-100">
                    <p class="text-sm font-bold text-gray-800">${escapeHTML(c.banco)}</p>
                    <p class="text-xs text-gray-600">${c.tipo === 'ahorro' ? 'Caja de Ahorro' : 'Cta. Corriente'} | ${c.moneda === 'USD' ? 'USD' : 'Gs.'}</p>
                    <p class="text-xs text-gray-500">Nro: <strong>${escapeHTML(c.numero)}</strong></p>
                    <p class="text-xs text-gray-400">Titular: ${escapeHTML(c.titular)}${c.ruc ? ' | RUC: ' + escapeHTML(c.ruc) : ''}</p>
                </div>
            `).join('')}
        </div>` : ''}

        <button onclick="mostrarConfiguracion()" class="w-full bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-bold mt-2">Configuracion y Backups</button>
    `;
}

// ============================================
// BACKUP UI
// ============================================
function mostrarModalBackup() {
    const modal = document.getElementById('backupModal');
    modal.classList.remove('hidden');
    actualizarInfoBackup();
    mostrarHistorialBackups();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function cerrarModalBackup() {
    document.getElementById('backupModal').classList.add('hidden');
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
            <button onclick="restaurarAutoBackup(${idx})" class="text-xs text-blue-600 font-bold px-2 py-1 bg-blue-50 rounded">Restaurar</button>
        `;
        container.appendChild(div);
    });
}
