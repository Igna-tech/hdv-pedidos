// ============================================
// HDV Pedidos - App Vendedor v3.0 (con Backup)
// ============================================
let productos = [];
let categorias = [];
let clientes = [];
let clienteActual = null;
let carrito = [];
let categoriaActual = 'todas';
let vistaActual = 'lista'; // 'lista', 'pedidos' o 'config'
let autoBackupInterval = null;

// ============================================
// INICIALIZACION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await cargarDatos();
    configurarEventos();
    cargarCarritoGuardado();
    registrarSW();
    iniciarAutoBackup();
    actualizarInfoBackup();

    // Sincronizar pedidos pendientes con Firebase
    if (typeof sincronizarPedidosLocales === 'function') {
        setTimeout(() => sincronizarPedidosLocales(), 2000);
    }

    // Escuchar catalogo en tiempo real desde Firebase
    if (typeof escucharCatalogoRealtime === 'function') {
        escucharCatalogoRealtime((data) => {
            if (data && data.categorias && data.productos) {
                categorias = data.categorias || [];
                productos = (data.productos || []).filter(p => !p.oculto && (p.estado || 'disponible') !== 'discontinuado');
                clientes = (data.clientes || []).filter(c => !c.oculto);
                poblarClientes();
                crearFiltrosCategorias();
                if (vistaActual === 'lista') mostrarProductos();
                // Cachear en localStorage para uso offline
                try {
                    localStorage.setItem('hdv_catalogo_local', JSON.stringify({
                        categorias: data.categorias,
                        productos: data.productos,
                        clientes: data.clientes
                    }));
                } catch(e) {}
                console.log('[Vendedor] Catalogo actualizado desde Firebase y cacheado');
            }
        });
    }
});

async function cargarDatos() {
    try {
        // Prioridad 1: Firebase (datos mas recientes en la nube)
        let data = null;
        if (typeof obtenerCatalogoFirebase === 'function') {
            try {
                data = await obtenerCatalogoFirebase();
                if (data && data.productos) {
                    console.log('[Vendedor] Catalogo cargado desde Firebase');
                    // Guardar en localStorage como cache
                    try {
                        localStorage.setItem('hdv_catalogo_local', JSON.stringify({
                            categorias: data.categorias,
                            productos: data.productos,
                            clientes: data.clientes
                        }));
                    } catch(e) { console.warn('[Vendedor] No se pudo cachear en localStorage'); }
                } else {
                    data = null;
                }
            } catch (fbErr) {
                console.warn('[Vendedor] Firebase no disponible:', fbErr.message);
                data = null;
            }
        }

        // Prioridad 2: localStorage (cache local, funciona offline)
        if (!data || !data.productos) {
            try {
                const cached = localStorage.getItem('hdv_catalogo_local');
                if (cached) {
                    data = JSON.parse(cached);
                    if (data && data.productos) {
                        console.log('[Vendedor] Catalogo cargado desde localStorage (cache)');
                    } else {
                        data = null;
                    }
                }
            } catch(e) { console.warn('[Vendedor] Error leyendo localStorage'); data = null; }
        }

        // Prioridad 3: JSON local (GitHub Pages - archivo estatico)
        if (!data || !data.productos) {
            const response = await fetch('productos.json?t=' + Date.now());
            data = await response.json();
            console.log('[Vendedor] Catalogo cargado desde JSON local');
        }

        categorias = data.categorias || [];
        productos = (data.productos || []).filter(p => !p.oculto && (p.estado || 'disponible') !== 'discontinuado');
        clientes = (data.clientes || []).filter(c => !c.oculto);

        poblarClientes();
        crearFiltrosCategorias();
        mostrarProductos();

        document.getElementById('searchInput').disabled = false;
    } catch (e) {
        console.error('Error cargando datos:', e);
        document.getElementById('productsContainer').innerHTML = '<div class="text-center text-red-500 mt-10 font-bold">Error al cargar catalogo. Verifica tu conexion.</div>';
    }
}

function configurarEventos() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', () => mostrarProductos());
    
    document.getElementById('clienteSelect').addEventListener('change', (e) => {
        const id = e.target.value;
        if (id) {
            const nuevoCliente = clientes.find(c => c.id === id);
            if (clienteActual && clienteActual.id !== id && carrito.length > 0) {
                if (!confirm('Cambiar de cliente vaciara el carrito actual. ¿Continuar?')) {
                    e.target.value = clienteActual.id;
                    return;
                }
                carrito = [];
                actualizarContadorCarrito();
                guardarCarrito();
            }
            clienteActual = nuevoCliente;
            mostrarProductos();
        } else {
            clienteActual = null;
        }
    });
}

// ============================================
// CLIENTES
// ============================================
function poblarClientes() {
    const select = document.getElementById('clienteSelect');
    select.innerHTML = '<option value="" class="text-black">-- Seleccione Cliente --</option>';
    clientes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.razon_social || c.nombre || c.id;
        opt.className = 'text-black';
        select.appendChild(opt);
    });
}

// ============================================
// CATEGORIAS
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
    document.querySelectorAll('.category-btn').forEach((btn, i) => {
        if ((catId === 'todas' && i === 0) || btn.textContent === categorias.find(c => c.id === catId)?.nombre) {
            btn.className = 'px-4 py-2 bg-gray-900 text-white rounded-full text-xs font-bold whitespace-nowrap category-btn';
        } else {
            btn.className = 'px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-xs font-bold whitespace-nowrap category-btn';
        }
    });
    mostrarProductos();
}

// ============================================
// PRODUCTOS
// ============================================
function mostrarProductos() {
    const container = document.getElementById('productsContainer');
    const busqueda = document.getElementById('searchInput').value.toLowerCase().trim();

    let filtrados = productos;

    if (categoriaActual !== 'todas') {
        filtrados = filtrados.filter(p => p.categoria === categoriaActual);
    }
    if (busqueda) {
        filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(busqueda));
    }

    if (filtrados.length === 0) {
        container.innerHTML = (typeof generarWidgetMeta === 'function' ? generarWidgetMeta() : '') + '<div class="text-center text-gray-400 mt-10"><div class="text-4xl mb-3">🔍</div><p class="font-bold">No se encontraron productos</p></div>';
        return;
    }
    
    container.innerHTML = '';
    // Widget de meta al inicio de la lista
    const metaHtml = typeof generarWidgetMeta === 'function' ? generarWidgetMeta() : '';
    if (metaHtml && !busqueda && categoriaActual === 'todas') {
        const metaDiv = document.createElement('div');
        metaDiv.innerHTML = metaHtml;
        container.appendChild(metaDiv);
    }

    // Productos frecuentes del cliente actual
    if (!busqueda && categoriaActual === 'todas' && clienteActual) {
        const frecuentes = obtenerProductosFrecuentes(clienteActual.id, 6);
        if (frecuentes.length > 0) {
            const frecDiv = document.createElement('div');
            frecDiv.className = 'mb-4';
            frecDiv.innerHTML = `<p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Frecuentes de ${clienteActual.razon_social || clienteActual.nombre}</p>`;
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

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 sm:grid-cols-3 gap-3';

    filtrados.forEach(prod => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl p-3 shadow-sm border border-gray-100 active:scale-95 transition-transform cursor-pointer';
        card.onclick = () => mostrarDetalleProducto(prod);
        
        const imgContent = prod.imagen
            ? `<img src="${prod.imagen}" class="w-full h-full object-contain" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
               <span class="text-4xl hidden items-center justify-center w-full h-full">${obtenerEmoji(prod)}</span>`
            : `<span class="text-4xl">${obtenerEmoji(prod)}</span>`;
        
        const promoBadge = typeof mostrarPromocionesEnProducto === 'function' ? mostrarPromocionesEnProducto(prod.id) : '';
        card.innerHTML = `
            <div class="w-full h-28 bg-gray-50 rounded-lg mb-2 flex items-center justify-center overflow-hidden">${imgContent}</div>
            <p class="text-sm font-bold text-gray-800 leading-tight">${prod.nombre}</p>
            ${promoBadge}
        `;
        grid.appendChild(card);
    });
    
    container.appendChild(grid);
}

function obtenerEmoji(producto) {
    const n = producto.nombre.toLowerCase();
    if (n.includes('jabon') || n.includes('jabon')) return '🧼';
    if (n.includes('shampoo')) return '🧴';
    if (n.includes('desodorante')) return '💨';
    if (n.includes('panal') || n.includes('panal')) return '🍼';
    if (n.includes('toallita')) return '🧻';
    if (n.includes('havaianas') || n.includes('ipanema')) return '🩴';
    if (n.includes('aceite')) return '🫗';
    if (n.includes('talco')) return '✨';
    return '📦';
}

function obtenerPrecio(productoId, presentacion) {
    if (clienteActual && clienteActual.precios_personalizados) {
        const preciosProd = clienteActual.precios_personalizados[productoId];
        if (preciosProd) {
            const precioCustom = preciosProd.find(p => p.tamano === presentacion.tamano);
            if (precioCustom) return precioCustom.precio;
        }
    }
    return presentacion.precio_base;
}

// ============================================
// DETALLE DE PRODUCTO (Modal inline)
// ============================================
function mostrarDetalleProducto(producto) {
    // Si tiene 6+ presentaciones, abrir modo MATRIZ (ideal para calzados con muchos talles)
    if (producto.presentaciones && producto.presentaciones.length >= 6) {
        mostrarMatrizProducto(producto);
        return;
    }
    // Si tiene 2-5 presentaciones, abrir modo MASIVO (todas las presentaciones con inputs)
    mostrarDetalleMasivo(producto);
}

// ============================================
// MODO MATRIZ - Carga rapida tipo Excel (6+ presentaciones)
// ============================================
function mostrarMatrizProducto(producto) {
    const existing = document.getElementById('productDetailModal');
    if (existing) existing.remove();

    const emoji = obtenerEmoji(producto);
    const catNombre = categorias.find(c => c.id === producto.categoria)?.nombre || '';

    const celdas = producto.presentaciones.map((pres, idx) => {
        const precio = obtenerPrecio(producto.id, pres);
        const estadoProd = producto.estado || 'disponible';
        const esAgotado = estadoProd === 'agotado';
        return `
            <div class="matriz-celda bg-white rounded-xl border-2 border-gray-200 p-3 text-center transition-all ${esAgotado ? 'opacity-50' : ''}" id="celda-${producto.id}-${idx}">
                <p class="text-xs font-bold text-gray-500 mb-1">${pres.tamano}</p>
                <input type="number" id="mtz-${producto.id}-${idx}" value="0" min="0"
                    ${esAgotado ? 'disabled' : ''}
                    class="w-full text-center text-2xl font-bold border-0 border-b-2 border-gray-200 focus:border-blue-500 outline-none bg-transparent py-1 mtz-input"
                    data-idx="${idx}" data-precio="${precio}"
                    oninput="actualizarCeldaMatriz('${producto.id}',${idx})">
                <p class="text-[10px] text-blue-600 font-bold mt-1">Gs. ${precio.toLocaleString()}</p>
                ${esAgotado ? '<p class="text-[10px] text-red-500 font-bold">AGOTADO</p>' : ''}
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
                    <span class="text-4xl">${emoji}</span>
                    <div>
                        <h3 class="text-lg font-bold">${producto.nombre}</h3>
                        <p class="text-xs text-gray-400">${catNombre} › ${producto.subcategoria}</p>
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

    // Hacer focus en la primera celda
    setTimeout(() => {
        const primerInput = document.getElementById(`mtz-${producto.id}-0`);
        if (primerInput) primerInput.focus();
    }, 300);
}

function actualizarCeldaMatriz(productoId, idx) {
    const input = document.getElementById(`mtz-${productoId}-${idx}`);
    const celda = document.getElementById(`celda-${productoId}-${idx}`);
    const val = parseInt(input.value) || 0;

    // Colorear celda segun tenga cantidad
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

    producto.presentaciones.forEach((pres, idx) => {
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
    if (elGs) elGs.textContent = 'Gs. ' + totalGs.toLocaleString();
    if (elBtn) elBtn.textContent = totalPares;
}

function limpiarMatriz(productoId) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    producto.presentaciones.forEach((pres, idx) => {
        const input = document.getElementById(`mtz-${productoId}-${idx}`);
        if (input) {
            input.value = 0;
            actualizarCeldaMatriz(productoId, idx);
        }
    });
}

function agregarMatrizAlCarrito(productoId) {
    if (!clienteActual) {
        alert('Selecciona un cliente primero');
        return;
    }

    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    let paresAgregados = 0;

    producto.presentaciones.forEach((pres, idx) => {
        const input = document.getElementById(`mtz-${productoId}-${idx}`);
        if (!input) return;
        const cantidad = parseInt(input.value) || 0;
        if (cantidad <= 0) return;

        const precio = parseFloat(input.dataset.precio);

        const existente = carrito.findIndex(item => item.productoId === productoId && item.presentacion === pres.tamano);
        if (existente >= 0) {
            carrito[existente].cantidad += cantidad;
            carrito[existente].subtotal = carrito[existente].cantidad * carrito[existente].precio;
        } else {
            carrito.push({
                productoId,
                nombre: producto.nombre,
                presentacion: pres.tamano,
                precio,
                cantidad,
                subtotal: precio * cantidad
            });
        }

        paresAgregados += cantidad;
    });

    if (paresAgregados === 0) {
        alert('Ingresa al menos 1 par');
        return;
    }

    actualizarContadorCarrito();
    guardarCarrito();
    mostrarExito(`${paresAgregados} pares de ${producto.nombre} agregados`);

    const modal = document.getElementById('productDetailModal');
    if (modal) modal.remove();
}

// ============================================
// MODO MASIVO - Todas las presentaciones a la vez (2-5 presentaciones)
// ============================================
function mostrarDetalleMasivo(producto) {
    const existing = document.getElementById('productDetailModal');
    if (existing) existing.remove();

    const catNombre = categorias.find(c => c.id === producto.categoria)?.nombre || '';
    const emoji = obtenerEmoji(producto);

    const imgContent = producto.imagen
        ? `<img src="${producto.imagen}" class="w-full h-full object-contain" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <span class="text-6xl hidden items-center justify-center w-full h-full">${emoji}</span>`
        : `<span class="text-6xl">${emoji}</span>`;

    const presHTML = producto.presentaciones.map((pres, idx) => {
        const precio = obtenerPrecio(producto.id, pres);
        return `
            <div class="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <div class="flex-1">
                    <p class="font-bold text-gray-800">${pres.tamano}</p>
                    <p class="text-blue-600 font-bold text-sm">Gs. ${precio.toLocaleString()}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="ajustarQty('${producto.id}',${idx},-1)" class="w-8 h-8 rounded-lg border-2 border-gray-300 flex items-center justify-center font-bold text-lg">-</button>
                    <input type="number" id="qty-${producto.id}-${idx}" value="0" min="0" data-precio="${precio}"
                        class="w-14 text-center border border-gray-300 rounded-lg py-1 font-bold masivo-input"
                        oninput="recalcularTotalMasivo('${producto.id}')">
                    <button onclick="ajustarQty('${producto.id}',${idx},1);recalcularTotalMasivo('${producto.id}')" class="w-8 h-8 rounded-lg border-2 border-gray-300 flex items-center justify-center font-bold text-lg">+</button>
                </div>
            </div>`;
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'productDetailModal';
    modal.className = 'fixed inset-0 bg-black/50 z-[100] flex items-end';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="bg-white w-full rounded-t-3xl max-h-[85vh] overflow-y-auto p-6 shadow-2xl" onclick="event.stopPropagation()">
            <div class="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4"></div>
            <div class="w-full h-32 bg-gray-50 rounded-xl mb-3 flex items-center justify-center overflow-hidden">${imgContent}</div>
            <h3 class="text-xl font-bold text-gray-900">${producto.nombre}</h3>
            <p class="text-sm text-gray-500 mb-1">${catNombre} › ${producto.subcategoria}</p>

            <div class="bg-blue-50 rounded-xl p-3 mb-4 flex justify-between items-center">
                <div>
                    <p class="text-xs text-gray-500 font-bold">TOTAL</p>
                    <p class="text-lg font-bold text-blue-800" id="masivoTotal-${producto.id}">Gs. 0</p>
                </div>
                <p class="text-sm font-bold text-gray-600"><span id="masivoItems-${producto.id}">0</span> items</p>
            </div>

            <div class="space-y-1">${presHTML}</div>

            <div class="flex gap-3 mt-6">
                <button onclick="document.getElementById('productDetailModal').remove()" class="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold">Cancelar</button>
                <button onclick="agregarMasivoAlCarrito('${producto.id}')" class="flex-1 bg-[#111827] text-white py-3 rounded-xl font-bold">Agregar Todo</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
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
    if (elTotal) elTotal.textContent = 'Gs. ' + totalGs.toLocaleString();
    if (elItems) elItems.textContent = totalItems;
}

function agregarMasivoAlCarrito(productoId) {
    if (!clienteActual) {
        alert('Selecciona un cliente primero');
        return;
    }

    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    let itemsAgregados = 0;

    producto.presentaciones.forEach((pres, idx) => {
        const input = document.getElementById(`qty-${productoId}-${idx}`);
        if (!input) return;
        const cantidad = parseInt(input.value) || 0;
        if (cantidad <= 0) return;

        const precio = parseFloat(input.dataset.precio);

        const existente = carrito.findIndex(item => item.productoId === productoId && item.presentacion === pres.tamano);
        if (existente >= 0) {
            carrito[existente].cantidad += cantidad;
            carrito[existente].subtotal = carrito[existente].cantidad * carrito[existente].precio;
        } else {
            carrito.push({
                productoId,
                nombre: producto.nombre,
                presentacion: pres.tamano,
                precio,
                cantidad,
                subtotal: precio * cantidad
            });
        }

        itemsAgregados += cantidad;
    });

    if (itemsAgregados === 0) {
        alert('Ingresa al menos 1 unidad');
        return;
    }

    actualizarContadorCarrito();
    guardarCarrito();
    mostrarExito(`${itemsAgregados} unidades de ${producto.nombre} agregadas`);

    const modal = document.getElementById('productDetailModal');
    if (modal) modal.remove();
}

function ajustarQty(prodId, idx, delta) {
    const input = document.getElementById(`qty-${prodId}-${idx}`);
    if (input) {
        let val = parseInt(input.value) || 0;
        val = Math.max(0, val + delta);
        input.value = val;
        recalcularTotalMasivo(prodId);
    }
}

// ============================================
// CARRITO
// ============================================
function agregarAlCarrito(productoId, presIdx) {
    if (!clienteActual) {
        mostrarExito('Selecciona un cliente primero');
        return;
    }
    
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;
    
    const pres = producto.presentaciones[presIdx];
    const precio = obtenerPrecio(productoId, pres);
    const qtyInput = document.getElementById(`qty-${productoId}-${presIdx}`);
    const cantidad = parseInt(qtyInput?.value) || 1;
    
    const existente = carrito.findIndex(item => item.productoId === productoId && item.presentacion === pres.tamano);
    
    if (existente >= 0) {
        carrito[existente].cantidad += cantidad;
        carrito[existente].subtotal = carrito[existente].cantidad * carrito[existente].precio;
    } else {
        carrito.push({
            productoId,
            nombre: producto.nombre,
            presentacion: pres.tamano,
            precio,
            cantidad,
            subtotal: precio * cantidad
        });
    }
    
    actualizarContadorCarrito();
    guardarCarrito();
    mostrarExito(`${producto.nombre} agregado al carrito`);
    
    const modal = document.getElementById('productDetailModal');
    if (modal) modal.remove();
}

function actualizarContadorCarrito() {
    const badge = document.getElementById('cartItems');
    const totalItems = carrito.reduce((sum, item) => sum + item.cantidad, 0);
    badge.textContent = totalItems;
    badge.style.display = totalItems > 0 ? 'flex' : 'none';
}

function guardarCarrito() {
    if (clienteActual) {
        localStorage.setItem(`hdv_carrito_${clienteActual.id}`, JSON.stringify(carrito));
    }
}

function cargarCarritoGuardado() {
    const selectEl = document.getElementById('clienteSelect');
    if (selectEl.value) {
        clienteActual = clientes.find(c => c.id === selectEl.value);
        if (clienteActual) {
            const saved = localStorage.getItem(`hdv_carrito_${clienteActual.id}`);
            if (saved) carrito = JSON.parse(saved);
            actualizarContadorCarrito();
        }
    }
}

// ============================================
// MODAL CARRITO
// ============================================
function mostrarModalCarrito() {
    if (carrito.length === 0) {
        mostrarExito('El carrito esta vacio');
        return;
    }
    
    const modal = document.getElementById('cartModal');
    modal.classList.remove('hidden');
    renderizarCarrito();
}

function closeCartModal() {
    document.getElementById('cartModal').classList.add('hidden');
}

function renderizarCarrito() {
    const container = document.getElementById('cartItemsList');
    container.innerHTML = '';
    
    carrito.forEach((item, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'relative overflow-hidden rounded-xl';
        wrapper.innerHTML = `
            <div class="absolute inset-y-0 right-0 w-20 bg-red-500 flex items-center justify-center text-white font-bold text-sm rounded-r-xl">Quitar</div>
            <div class="cart-item-inner relative bg-gray-50 p-3 transition-transform" style="touch-action: pan-y;" data-idx="${idx}">
                <div class="flex justify-between items-center">
                    <div class="flex-1">
                        <p class="font-bold text-gray-800 text-sm">${item.nombre}</p>
                        <p class="text-xs text-gray-500">${item.presentacion}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="cambiarCantidadCarrito(${idx},-1)" class="w-7 h-7 bg-gray-200 rounded-full font-bold text-sm">−</button>
                        <span class="font-bold text-sm w-6 text-center">${item.cantidad}</span>
                        <button onclick="cambiarCantidadCarrito(${idx},1)" class="w-7 h-7 bg-gray-200 rounded-full font-bold text-sm">+</button>
                        <p class="font-bold text-gray-900 ml-2 w-24 text-right">Gs. ${item.subtotal.toLocaleString()}</p>
                    </div>
                </div>
            </div>`;
        // Swipe to delete
        const inner = wrapper.querySelector('.cart-item-inner');
        let startX = 0, currentX = 0;
        inner.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
        inner.addEventListener('touchmove', e => {
            currentX = e.touches[0].clientX - startX;
            if (currentX < 0) inner.style.transform = `translateX(${Math.max(currentX, -80)}px)`;
        }, { passive: true });
        inner.addEventListener('touchend', () => {
            if (currentX < -50) { eliminarDelCarrito(idx); }
            else { inner.style.transform = ''; }
            currentX = 0;
        });
        container.appendChild(wrapper);
    });
    
    // Total
    const total = carrito.reduce((s, i) => s + i.subtotal, 0);
    const totalSection = document.getElementById('totalSection');
    totalSection.classList.remove('hidden');
    // Aplicar promociones
    let promoHTML = '';
    let descuentoPromo = 0;
    if (typeof aplicarPromociones === 'function') {
        const resultPromo = aplicarPromociones(carrito);
        descuentoPromo = resultPromo.descuentoTotal;
        promoHTML = typeof mostrarResumenPromociones === 'function' ? mostrarResumenPromociones(resultPromo) : '';
    }
    const totalConPromo = total - descuentoPromo;

    totalSection.innerHTML = `
        <div class="flex justify-between items-center">
            <span class="text-gray-500 font-bold">SUBTOTAL</span>
            <span class="text-xl font-bold text-gray-900" id="cartSubtotal">Gs. ${total.toLocaleString()}</span>
        </div>
        ${descuentoPromo > 0 ? `<div class="flex justify-between items-center text-green-600">
            <span class="font-bold">DESCUENTO PROMO</span>
            <span class="font-bold">-Gs. ${descuentoPromo.toLocaleString()}</span>
        </div>` : ''}
        <div class="flex justify-between items-center" id="cartTotalFinal">
            <span class="text-gray-500 font-bold">TOTAL</span>
            <span class="text-2xl font-bold text-gray-900">Gs. ${totalConPromo.toLocaleString()}</span>
        </div>
        ${promoHTML}
    `;
}

function eliminarDelCarrito(idx) {
    carrito.splice(idx, 1);
    actualizarContadorCarrito();
    guardarCarrito();
    if (carrito.length === 0) {
        closeCartModal();
    } else {
        renderizarCarrito();
    }
}

function cambiarCantidadCarrito(idx, delta) {
    if (!carrito[idx]) return;
    carrito[idx].cantidad = Math.max(1, carrito[idx].cantidad + delta);
    carrito[idx].subtotal = carrito[idx].cantidad * carrito[idx].precio;
    actualizarContadorCarrito();
    guardarCarrito();
    renderizarCarrito();
}

function aplicarDescuento() {
    const desc = parseFloat(document.getElementById('descuento').value) || 0;
    if (desc < 0 || desc > 100) { alert('Descuento invalido'); return; }
    
    const subtotal = carrito.reduce((s, i) => s + i.subtotal, 0);
    const totalConDesc = Math.round(subtotal * (1 - desc / 100));
    
    const totalFinal = document.getElementById('cartTotalFinal');
    if (totalFinal) {
        totalFinal.innerHTML = `
            <span class="text-gray-500 font-bold">TOTAL (${desc}% desc.)</span>
            <span class="text-2xl font-bold text-green-600">Gs. ${totalConDesc.toLocaleString()}</span>
        `;
    }
}

// ============================================
// CONFIRMAR PEDIDO
// ============================================
function confirmarPedido() {
    if (!clienteActual) {
        closeCartModal();
        mostrarModalSinCliente();
        return;
    }
    if (carrito.length === 0) { alert('El carrito esta vacio'); return; }

    const descuento = parseFloat(document.getElementById('descuento').value) || 0;
    const tipoPago = document.getElementById('tipoPago').value;
    const notas = document.getElementById('notasPedido').value.trim();

    const subtotal = carrito.reduce((s, i) => s + i.subtotal, 0);
    const total = Math.round(subtotal * (1 - descuento / 100));

    const pedido = {
        id: 'PED-' + Date.now(),
        fecha: new Date().toISOString(),
        cliente: { id: clienteActual.id, nombre: clienteActual.razon_social || clienteActual.nombre },
        items: carrito.map(i => ({...i})),
        subtotal,
        descuento,
        total,
        tipoPago,
        notas,
        estado: 'pendiente',
        sincronizado: false
    };

    // Guardar en localStorage (backup local)
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    pedidos.push(pedido);
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));

    // Guardar en Firebase (sincronizacion en tiempo real)
    if (typeof guardarPedidoFirebase === 'function') {
        guardarPedidoFirebase(pedido).then(ok => {
            if (ok) {
                pedido.sincronizado = true;
                localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
                console.log('[Vendedor] Pedido sincronizado con Firebase');
            }
        });
    }

    // Limpiar carrito
    carrito = [];
    actualizarContadorCarrito();
    guardarCarrito();
    closeCartModal();

    // Reset form
    document.getElementById('descuento').value = '0';
    document.getElementById('notasPedido').value = '';
    document.getElementById('tipoPago').value = 'contado';

    mostrarExito('Pedido confirmado correctamente');
}

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
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">NOMBRE *</label>
                        <input type="text" id="ncvNombre" class="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none text-sm" placeholder="Nombre del cliente">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">TELEFONO *</label>
                        <input type="tel" id="ncvTelefono" class="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none text-sm" placeholder="Ej: 0981234567">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">ZONA *</label>
                        <input type="text" id="ncvZona" class="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none text-sm" placeholder="Ej: Loma Plata">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">DIRECCION (opcional)</label>
                        <input type="text" id="ncvDireccion" class="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none text-sm" placeholder="Ej: Calle San Martin 123">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">RUC (opcional)</label>
                        <input type="text" id="ncvRuc" class="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none text-sm" placeholder="Ej: 80012345-6">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-1">ENCARGADO (opcional)</label>
                        <input type="text" id="ncvEncargado" class="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none text-sm" placeholder="Ej: Juan Perez">
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button onclick="cerrarModalSinCliente()" class="flex-1 bg-gray-100 text-gray-700 py-4 rounded-xl font-bold">Cancelar</button>
                        <button onclick="guardarNuevoClienteDesdeVendedor()" class="flex-1 bg-gray-900 text-white py-4 rounded-xl font-bold">Enviar para aprobacion</button>
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

function guardarNuevoClienteDesdeVendedor() {
    const nombre = document.getElementById('ncvNombre')?.value.trim();
    const telefono = document.getElementById('ncvTelefono')?.value.trim();
    const zona = document.getElementById('ncvZona')?.value.trim();
    const direccion = document.getElementById('ncvDireccion')?.value.trim();
    const ruc = document.getElementById('ncvRuc')?.value.trim();
    const encargado = document.getElementById('ncvEncargado')?.value.trim();

    if (!nombre) { alert('El nombre es obligatorio'); return; }
    if (!telefono) { alert('El telefono es obligatorio'); return; }
    if (!zona) { alert('La zona es obligatoria'); return; }

    const nuevoCliente = {
        id: 'CNUEVO-' + Date.now(),
        nombre, razon_social: nombre, telefono, zona,
        direccion: direccion || '', ruc: ruc || '', encargado: encargado || '',
        estado: 'pendiente_aprobacion',
        fechaSolicitud: new Date().toISOString()
    };

    // Guardar en la lista local de clientes pendientes
    const pendientes = JSON.parse(localStorage.getItem('hdv_clientes_pendientes') || '[]');
    pendientes.push(nuevoCliente);
    localStorage.setItem('hdv_clientes_pendientes', JSON.stringify(pendientes));

    // Intentar subir a Firebase si esta disponible
    if (typeof db !== 'undefined') {
        db.collection('configuracion').doc('clientes_pendientes').set({ lista: pendientes })
          .catch(e => console.error('[Vendedor] Error al subir cliente pendiente:', e));
    }

    cerrarModalSinCliente();
    mostrarExito('Cliente enviado para aprobacion del administrador');
}

// ============================================
// VISTA MIS PEDIDOS
// ============================================
function cambiarVistaVendedor(vista) {
    vistaActual = vista;

    const btnLista = document.getElementById('btn-tab-lista');
    const btnPedidos = document.getElementById('btn-tab-pedidos');
    const btnCaja = document.getElementById('btn-tab-caja');
    const container = document.getElementById('productsContainer');
    const catFilters = document.getElementById('categoryFilters');
    const searchBox = document.getElementById('searchContainer');

    const btnZonas = document.getElementById('btn-tab-zonas');

    // Reset all tabs
    [btnLista, btnPedidos, btnCaja, btnZonas].forEach(btn => {
        if (btn) btn.className = 'flex flex-col items-center gap-1 text-gray-400 transition-colors';
    });

    if (vista === 'lista') {
        btnLista.className = 'flex flex-col items-center gap-1 text-gray-900 transition-colors';
        catFilters.style.display = '';
        searchBox.style.display = '';
        mostrarProductos();
    } else if (vista === 'pedidos') {
        btnPedidos.className = 'flex flex-col items-center gap-1 text-gray-900 transition-colors';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        mostrarMisPedidos();
    } else if (vista === 'caja') {
        if (btnCaja) btnCaja.className = 'flex flex-col items-center gap-1 text-gray-900 transition-colors';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        mostrarMiCaja();
    } else if (vista === 'zonas') {
        if (btnZonas) btnZonas.className = 'flex flex-col items-center gap-1 text-gray-900 transition-colors';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        if (zonaActiva) mostrarRutaHoy();
        else mostrarFiltroZonas();
    }
}

function mostrarMisPedidos() {
    const container = document.getElementById('productsContainer');
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    
    let misPedidos = pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    if (misPedidos.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 mt-10"><div class="text-4xl mb-3">📋</div><p class="font-bold">No hay pedidos registrados</p></div>';
        return;
    }
    
    container.innerHTML = '<h3 class="text-lg font-bold text-gray-800 mb-4">Mis Pedidos</h3>';
    
    misPedidos.forEach(p => {
        const estado = p.estado || 'pendiente';
        const colorEstado = estado === 'entregado' 
            ? 'bg-green-100 text-green-700' 
            : 'bg-yellow-100 text-yellow-700';
        
        const div = document.createElement('div');
        div.className = 'bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3';
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold text-gray-800">${p.cliente.nombre}</p>
                    <p class="text-xs text-gray-500">${new Date(p.fecha).toLocaleString('es-PY')}</p>
                </div>
                <span class="px-2 py-1 rounded-full text-[10px] font-bold ${colorEstado}">${estado.toUpperCase()}</span>
            </div>
            <div class="text-sm text-gray-600 mb-2">
                ${p.items.map(i => `${i.nombre} (${i.presentacion} ×${i.cantidad})`).join(', ')}
            </div>
            <div class="flex justify-between items-center pt-2 border-t border-gray-100">
                <span class="text-xs text-gray-500">${p.tipoPago || 'contado'} ${p.descuento > 0 ? `| ${p.descuento}% desc.` : ''}</span>
                <span class="font-bold text-gray-900">Gs. ${p.total.toLocaleString()}</span>
            </div>
            <div class="flex gap-2 mt-3 pt-2 border-t border-gray-50">
                <button onclick="imprimirTicketVendedor('${p.id}')" class="flex-1 bg-purple-50 text-purple-700 py-2 rounded-lg text-xs font-bold active:scale-95 transition-transform">🖨️ Ticket</button>
                <button onclick="generarPDFVendedor('${p.id}')" class="flex-1 bg-red-50 text-red-700 py-2 rounded-lg text-xs font-bold active:scale-95 transition-transform">📄 PDF</button>
                <button onclick="enviarPedidoWhatsApp('${p.id}')" class="flex-1 bg-green-50 text-green-700 py-2 rounded-lg text-xs font-bold active:scale-95 transition-transform">📲 WhatsApp</button>
            </div>
        `;
        container.appendChild(div);
    });
}
function mostrarExito(msg) {
    const el = document.getElementById('successMessage');
    el.textContent = '✓ ' + msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('hdv_darkmode', document.body.classList.contains('dark-mode'));
}

// Cargar dark mode guardado
if (localStorage.getItem('hdv_darkmode') === 'true') {
    document.body.classList.add('dark-mode');
}

// Productos frecuentes por cliente
function obtenerProductosFrecuentes(clienteId, limit = 6) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]')
        .filter(p => p.cliente?.id === clienteId);
    const conteo = {};
    pedidos.forEach(p => {
        (p.items || []).forEach(it => {
            conteo[it.productoId] = (conteo[it.productoId] || 0) + (it.cantidad || 1);
        });
    });
    return Object.entries(conteo)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([productoId, cantidad]) => ({ productoId, cantidad }));
}

function forzarActualizacion() {
    if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)));
    }
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => r.unregister());
        });
    }
    setTimeout(() => location.reload(true), 500);
}

function registrarSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => {
                console.log('[SW] Registrado');
                // Buscar actualizaciones cada 30 segundos
                setInterval(() => reg.update(), 30000);
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            newWorker.postMessage('skipWaiting');
                            mostrarExito('Actualizando app...');
                            setTimeout(() => location.reload(true), 1500);
                        }
                    });
                });
            })
            .catch(err => console.log('[SW] Error:', err));
        // Recargar cuando el nuevo SW tome control
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[SW] Nuevo service worker activo');
        });
    }
}

// Filtrar pedidos (alias for admin compatibility)
function filtrarPedidos() {
    aplicarFiltrosPedidos && aplicarFiltrosPedidos();
}

// ============================================
// VISTA CONFIGURACION
// ============================================
function mostrarConfiguracion() {
    const container = document.getElementById('productsContainer');
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const autoBackups = JSON.parse(localStorage.getItem('hdv_auto_backups_meta') || '[]');
    const ultimoBackup = localStorage.getItem('hdv_ultimo_backup_fecha');

    const totalPedidos = pedidos.length;
    const pendientes = pedidos.filter(p => (p.estado || 'pendiente') === 'pendiente').length;
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

    // Calcular almacenamiento
    calcularAlmacenamiento();
}

function calcularAlmacenamiento() {
    let totalBytes = 0;
    for (let key in localStorage) {
        if (key.startsWith('hdv_')) {
            totalBytes += (localStorage[key] || '').length * 2; // UTF-16
        }
    }
    const kb = (totalBytes / 1024).toFixed(1);
    const el = document.getElementById('storageInfo');
    if (el) el.textContent = `Usando ${kb} KB de localStorage`;
}

function limpiarTodosDatos() {
    if (!confirm('¿BORRAR TODOS los pedidos? Esta accion no se puede deshacer.')) return;
    if (!confirm('¿Estas completamente seguro?')) return;
    localStorage.removeItem('hdv_pedidos');
    // Limpiar carritos
    for (let key in localStorage) {
        if (key.startsWith('hdv_carrito_')) localStorage.removeItem(key);
    }
    carrito = [];
    actualizarContadorCarrito();
    mostrarExito('Datos eliminados');
    mostrarConfiguracion();
}

// ============================================
// SISTEMA DE BACKUP - VENDEDOR
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

function actualizarInfoBackup() {
    const ultimaFecha = localStorage.getItem('hdv_ultimo_backup_fecha');
    const infoText = document.getElementById('backupInfoText');
    const infoDate = document.getElementById('backupInfoDate');
    if (!infoText || !infoDate) return;

    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    infoText.textContent = `${pedidos.length} pedidos en el dispositivo`;

    if (ultimaFecha) {
        infoDate.textContent = `Ultimo backup: ${new Date(ultimaFecha).toLocaleString('es-PY')}`;
    } else {
        infoDate.textContent = 'Nunca se ha hecho backup';
    }
}

// Exportar backup completo (pedidos + carritos + config)
function exportarBackupVendedor() {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const carritos = {};
    for (let key in localStorage) {
        if (key.startsWith('hdv_carrito_')) {
            carritos[key] = JSON.parse(localStorage.getItem(key));
        }
    }

    const backup = {
        tipo: 'backup_vendedor_completo',
        fecha: new Date().toISOString(),
        version: '3.0',
        dispositivo: navigator.userAgent.substring(0, 50),
        datos: {
            pedidos,
            carritos,
            configuracion: {
                darkmode: localStorage.getItem('hdv_darkmode'),
                autoBackup: localStorage.getItem('hdv_auto_backup') !== 'false'
            }
        },
        resumen: {
            totalPedidos: pedidos.length,
            pedidosPendientes: pedidos.filter(p => (p.estado || 'pendiente') === 'pendiente').length,
            totalGuaranies: pedidos.reduce((s, p) => s + (p.total || 0), 0)
        }
    };

    descargarArchivoJSON(backup, `hdv_backup_completo_${formatearFechaArchivo()}.json`);
    localStorage.setItem('hdv_ultimo_backup_fecha', new Date().toISOString());
    actualizarInfoBackup();
    mostrarExito('Backup descargado');
}

// Exportar solo pedidos
function exportarSoloPedidos() {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    if (pedidos.length === 0) { alert('No hay pedidos para exportar'); return; }

    const backup = {
        tipo: 'backup_pedidos',
        fecha: new Date().toISOString(),
        version: '3.0',
        pedidos
    };

    descargarArchivoJSON(backup, `hdv_pedidos_${formatearFechaArchivo()}.json`);
    mostrarExito('Pedidos descargados');
}

// Compartir resumen por WhatsApp
function compartirBackupWhatsApp() {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const hoy = new Date().toLocaleDateString('es-PY');
    const pedidosHoy = pedidos.filter(p => new Date(p.fecha).toLocaleDateString('es-PY') === hoy);

    let mensaje = `*HDV Pedidos - Resumen ${hoy}*\n\n`;
    mensaje += `Total pedidos hoy: ${pedidosHoy.length}\n`;
    mensaje += `Total general: Gs. ${pedidosHoy.reduce((s, p) => s + (p.total || 0), 0).toLocaleString()}\n\n`;

    if (pedidosHoy.length > 0) {
        pedidosHoy.forEach((p, i) => {
            mensaje += `${i + 1}. ${p.cliente?.nombre || 'N/A'}\n`;
            mensaje += `   ${p.items.map(it => `${it.nombre} x${it.cantidad}`).join(', ')}\n`;
            mensaje += `   Total: Gs. ${(p.total || 0).toLocaleString()} (${p.tipoPago || 'contado'})\n\n`;
        });
    } else {
        mensaje += 'Sin pedidos registrados hoy.\n';
    }

    mensaje += `\n_Total pedidos en sistema: ${pedidos.length}_`;

    const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
    mostrarExito('Abriendo WhatsApp...');
}

// Restaurar backup
function restaurarBackupVendedor(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('¿Restaurar datos desde este backup? Los datos actuales seran reemplazados.')) {
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            if (data.tipo === 'backup_vendedor_completo' && data.datos) {
                // Backup completo
                if (data.datos.pedidos) {
                    localStorage.setItem('hdv_pedidos', JSON.stringify(data.datos.pedidos));
                }
                if (data.datos.carritos) {
                    Object.entries(data.datos.carritos).forEach(([key, val]) => {
                        localStorage.setItem(key, JSON.stringify(val));
                    });
                }
                mostrarExito(`Backup restaurado: ${data.datos.pedidos?.length || 0} pedidos`);
            } else if (data.tipo === 'backup_pedidos' && data.pedidos) {
                // Solo pedidos
                localStorage.setItem('hdv_pedidos', JSON.stringify(data.pedidos));
                mostrarExito(`${data.pedidos.length} pedidos restaurados`);
            } else if (data.datos?.pedidos) {
                // Backup del admin
                localStorage.setItem('hdv_pedidos', JSON.stringify(data.datos.pedidos));
                mostrarExito('Backup admin restaurado');
            } else {
                alert('Formato de backup no reconocido');
                event.target.value = '';
                return;
            }

            cerrarModalBackup();
            if (vistaActual === 'pedidos') mostrarMisPedidos();
        } catch (err) {
            alert('Error: El archivo no es valido');
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// ============================================
// AUTO-BACKUP
// ============================================
function iniciarAutoBackup() {
    const enabled = localStorage.getItem('hdv_auto_backup') !== 'false';
    const toggle = document.getElementById('autoBackupToggle');
    if (toggle) toggle.checked = enabled;

    if (enabled) {
        autoBackupInterval = setInterval(realizarAutoBackup, 5 * 60 * 1000); // cada 5 min
        // Hacer un auto-backup inmediato si no hay ninguno reciente
        const ultimo = localStorage.getItem('hdv_auto_backup_ultimo');
        if (!ultimo || (Date.now() - new Date(ultimo).getTime() > 5 * 60 * 1000)) {
            setTimeout(realizarAutoBackup, 3000);
        }
    }
}

function toggleAutoBackup() {
    const toggle = document.getElementById('autoBackupToggle');
    const enabled = toggle?.checked ?? true;
    localStorage.setItem('hdv_auto_backup', enabled ? 'true' : 'false');

    if (enabled) {
        iniciarAutoBackup();
        mostrarExito('Auto-backup activado');
    } else {
        if (autoBackupInterval) clearInterval(autoBackupInterval);
        mostrarExito('Auto-backup desactivado');
    }
}

function realizarAutoBackup() {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    if (pedidos.length === 0) return; // No guardar backup vacio

    const backup = {
        fecha: new Date().toISOString(),
        pedidos,
        totalPedidos: pedidos.length
    };

    // Guardar en localStorage con rotacion (maximo 10 backups)
    let backups = JSON.parse(localStorage.getItem('hdv_auto_backups') || '[]');
    backups.unshift(backup);
    if (backups.length > 10) backups = backups.slice(0, 10);

    try {
        localStorage.setItem('hdv_auto_backups', JSON.stringify(backups));
        localStorage.setItem('hdv_auto_backup_ultimo', new Date().toISOString());

        // Guardar metadata (sin los datos pesados)
        const meta = backups.map(b => ({ fecha: b.fecha, totalPedidos: b.totalPedidos }));
        localStorage.setItem('hdv_auto_backups_meta', JSON.stringify(meta));
    } catch (e) {
        // Si se llena localStorage, eliminar backups viejos
        console.warn('Auto-backup: espacio insuficiente, reduciendo historial');
        backups = backups.slice(0, 3);
        localStorage.setItem('hdv_auto_backups', JSON.stringify(backups));
    }
}

function mostrarHistorialBackups() {
    const container = document.getElementById('historialBackups');
    if (!container) return;

    const meta = JSON.parse(localStorage.getItem('hdv_auto_backups_meta') || '[]');
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

function restaurarAutoBackup(idx) {
    if (!confirm('¿Restaurar este auto-backup? Los pedidos actuales seran reemplazados.')) return;

    const backups = JSON.parse(localStorage.getItem('hdv_auto_backups') || '[]');
    if (backups[idx] && backups[idx].pedidos) {
        localStorage.setItem('hdv_pedidos', JSON.stringify(backups[idx].pedidos));
        mostrarExito(`Restaurado: ${backups[idx].pedidos.length} pedidos`);
        cerrarModalBackup();
        if (vistaActual === 'pedidos') mostrarMisPedidos();
    } else {
        alert('Error al restaurar este backup');
    }
}

// ============================================
// UTILIDADES BACKUP
// ============================================
function descargarArchivoJSON(data, nombre) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nombre;
    link.click();
    URL.revokeObjectURL(link.href);
}

function formatearFechaArchivo() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

// ============================================
// IMPRESION Y COMPARTIR POR PEDIDO
// ============================================
function imprimirTicketVendedor(pedidoId) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    
    const ticketHTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
    @page { margin: 0; size: 80mm auto; }
    body { font-family: 'Courier New', monospace; width: 72mm; margin: 4mm; font-size: 11px; color: #000; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 4px 0; }
    .right { text-align: right; }
    .row { display: flex; justify-content: space-between; }
    .big { font-size: 16px; }
    .small { font-size: 9px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    .total-row { font-size: 14px; font-weight: bold; }
</style></head><body>
<div class="center bold big">HDV DISTRIBUCIONES</div>
<div class="center small">EAS - Comprobante de Pedido</div>
<div class="line"></div>
<div class="row"><span>N°: ${pedido.id}</span></div>
<div class="row"><span>Fecha: ${new Date(pedido.fecha).toLocaleDateString('es-PY')}</span></div>
<div class="row"><span>Hora: ${new Date(pedido.fecha).toLocaleTimeString('es-PY')}</span></div>
<div class="line"></div>
<div class="bold">Cliente: ${pedido.cliente?.nombre || 'N/A'}</div>
<div class="line"></div>
<table>
${(pedido.items || []).map(i => `<tr>
    <td>${i.nombre}<br><span class="small">${i.presentacion} x${i.cantidad}</span></td>
    <td class="right bold">Gs.${(i.subtotal || 0).toLocaleString()}</td>
</tr>`).join('')}
</table>
<div class="line"></div>
${pedido.descuento > 0 ? `<div class="row"><span>Desc. ${pedido.descuento}%:</span><span>-Gs. ${Math.round((pedido.subtotal||0)*pedido.descuento/100).toLocaleString()}</span></div>` : ''}
<div class="row total-row"><span>TOTAL:</span><span>Gs. ${(pedido.total || 0).toLocaleString()}</span></div>
<div class="line"></div>
<div class="row"><span>Pago: ${pedido.tipoPago || 'contado'}</span></div>
${pedido.notas ? `<div class="small">Notas: ${pedido.notas}</div>` : ''}
<div class="line"></div>
<div class="center small">Gracias por su compra</div>
<div class="center small">HDV Distribuciones EAS</div>
<div style="margin-bottom:10mm"></div>
</body></html>`;

    const printFrame = document.getElementById('printFrameVendedor');
    if (printFrame) {
        printFrame.srcdoc = ticketHTML;
        printFrame.onload = () => printFrame.contentWindow.print();
    }
}

function generarPDFVendedor(pedidoId) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    
    if (typeof window.jspdf === 'undefined') {
        alert('Cargando generador de PDF...');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('HDV Distribuciones', 15, 16);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('EAS - Comprobante de Pedido', 15, 24);
    doc.text(`N°: ${pedido.id}`, 195, 14, { align: 'right' });
    doc.text(`${new Date(pedido.fecha).toLocaleDateString('es-PY')}`, 195, 21, { align: 'right' });
    
    // Client
    let y = 45;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Cliente: ${pedido.cliente?.nombre || 'N/A'}`, 15, y);
    y += 10;
    
    // Items
    doc.setFillColor(17, 24, 39);
    doc.rect(10, y - 5, 190, 8, 'F');
    doc.setTextColor(255);
    doc.setFontSize(8);
    doc.text('PRODUCTO', 15, y);
    doc.text('PRES.', 90, y);
    doc.text('CANT.', 125, y);
    doc.text('SUBTOTAL', 190, y, { align: 'right' });
    y += 8;
    
    doc.setTextColor(0);
    doc.setFontSize(9);
    (pedido.items || []).forEach((item, i) => {
        if (i % 2 === 0) { doc.setFillColor(249,250,251); doc.rect(10, y-4, 190, 7, 'F'); }
        doc.setFont('helvetica', 'normal');
        doc.text(item.nombre, 15, y);
        doc.text(item.presentacion, 90, y);
        doc.text(String(item.cantidad), 130, y);
        doc.setFont('helvetica', 'bold');
        doc.text(`Gs. ${(item.subtotal||0).toLocaleString()}`, 190, y, { align: 'right' });
        y += 7;
    });
    
    y += 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL: Gs. ${(pedido.total||0).toLocaleString()}`, 190, y, { align: 'right' });
    
    y += 10;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text(`Pago: ${pedido.tipoPago || 'contado'}${pedido.descuento > 0 ? ` | Desc: ${pedido.descuento}%` : ''}`, 15, y);
    if (pedido.notas) { y += 5; doc.text(`Notas: ${pedido.notas}`, 15, y); }
    
    doc.save(`pedido_${pedido.id}.pdf`);
    mostrarExito('PDF generado');
}

function enviarPedidoWhatsApp(pedidoId) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    
    let msg = `*HDV Distribuciones - Pedido*\n`;
    msg += `N°: ${pedido.id}\n`;
    msg += `Fecha: ${new Date(pedido.fecha).toLocaleDateString('es-PY')}\n`;
    msg += `Cliente: ${pedido.cliente?.nombre || 'N/A'}\n\n`;
    msg += `*Detalle:*\n`;
    (pedido.items || []).forEach(i => {
        msg += `• ${i.nombre} (${i.presentacion}) x${i.cantidad} = Gs.${(i.subtotal||0).toLocaleString()}\n`;
    });
    msg += `\n*TOTAL: Gs. ${(pedido.total||0).toLocaleString()}*\n`;
    msg += `Pago: ${pedido.tipoPago || 'contado'}`;
    if (pedido.descuento > 0) msg += ` | Desc: ${pedido.descuento}%`;
    if (pedido.notas) msg += `\nNotas: ${pedido.notas}`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    mostrarExito('Abriendo WhatsApp...');
}

// ============================================
// ZONAS, RUTAS Y PROMOCIONES - VENDEDOR
// ============================================
// ============================================
// ZONAS Y RUTAS - App Vendedor
// ============================================

let zonaActiva = null;

function obtenerZonasUnicas() {
    const zonasMap = {};
    clientes.forEach(c => {
        if (c.zona) {
            const z = c.zona.trim();
            zonasMap[z] = (zonasMap[z] || 0) + 1;
        }
    });
    return Object.entries(zonasMap).map(([zona, cantidad]) => ({ zona, cantidad })).sort((a, b) => a.zona.localeCompare(b.zona));
}

function mostrarFiltroZonas() {
    const container = document.getElementById('productsContainer');
    const zonas = obtenerZonasUnicas();

    let html = '<h3 class="text-lg font-bold text-gray-800 mb-4">Seleccionar Zona</h3>';

    // Boton todas las zonas
    html += `<button onclick="resetearFiltroZona()" class="w-full bg-gray-800 text-white py-4 rounded-xl font-bold text-sm mb-3 active:scale-95 transition-transform">
        Todas las Zonas (${clientes.length} clientes)
    </button>`;

    html += '<div class="grid grid-cols-2 gap-3">';
    const colores = ['bg-blue-50 border-blue-200 text-blue-800', 'bg-green-50 border-green-200 text-green-800', 'bg-purple-50 border-purple-200 text-purple-800', 'bg-yellow-50 border-yellow-200 text-yellow-800', 'bg-red-50 border-red-200 text-red-800', 'bg-indigo-50 border-indigo-200 text-indigo-800'];
    zonas.forEach((z, i) => {
        const color = colores[i % colores.length];
        html += `<button onclick="seleccionarZona('${z.zona}')" class="${color} border-2 rounded-xl p-4 text-center active:scale-95 transition-transform">
            <p class="text-3xl mb-1">📍</p>
            <p class="font-bold text-sm">${z.zona}</p>
            <p class="text-xs opacity-70">${z.cantidad} clientes</p>
        </button>`;
    });
    html += '</div>';

    container.innerHTML = html;
}

function seleccionarZona(zona) {
    zonaActiva = zona;
    filtrarClientesPorZona(zona);
    mostrarRutaHoy();
}

function filtrarClientesPorZona(zona) {
    const select = document.getElementById('clienteSelect');
    if (!select) return;

    zonaActiva = zona;
    const options = select.querySelectorAll('option');
    options.forEach(opt => {
        if (opt.value === '') {
            opt.style.display = '';
        } else {
            const cliente = clientes.find(c => c.id == opt.value);
            opt.style.display = (cliente && cliente.zona && cliente.zona.trim() === zona) ? '' : 'none';
        }
    });

    // Actualizar indicador
    actualizarIndicadorZona(zona);
}

function resetearFiltroZona() {
    zonaActiva = null;
    const select = document.getElementById('clienteSelect');
    if (select) {
        select.querySelectorAll('option').forEach(opt => opt.style.display = '');
    }
    actualizarIndicadorZona(null);
    cambiarVistaVendedor('lista');
}

function actualizarIndicadorZona(zona) {
    let badge = document.getElementById('zonaActivaBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'zonaActivaBadge';
        badge.style.cssText = 'cursor:pointer;';
        badge.onclick = () => mostrarFiltroZonas();
        const header = document.querySelector('header .bg-gray-800');
        if (header) header.parentElement.insertBefore(badge, header);
    }
    if (zona) {
        badge.className = 'bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full mt-2 inline-block';
        badge.textContent = '📍 ' + zona;
        badge.style.display = '';
    } else {
        badge.style.display = 'none';
    }
}

function mostrarRutaHoy() {
    if (!zonaActiva) { mostrarFiltroZonas(); return; }
    const container = document.getElementById('productsContainer');
    const clientesZona = clientes.filter(c => c.zona && c.zona.trim() === zonaActiva);
    const pedidosHoy = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const hoy = new Date().toISOString().split('T')[0];

    let html = `<div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-gray-800">📍 ${zonaActiva}</h3>
        <button onclick="mostrarFiltroZonas()" class="text-sm text-blue-600 font-bold">Cambiar Zona</button>
    </div>`;
    html += `<p class="text-sm text-gray-500 mb-4">${clientesZona.length} clientes en esta zona</p>`;

    if (clientesZona.length === 0) {
        html += '<p class="text-center text-gray-400 mt-10">No hay clientes en esta zona</p>';
    } else {
        clientesZona.forEach((c, i) => {
            const tienePedidoHoy = pedidosHoy.some(p => p.cliente?.id === c.id && p.fecha && p.fecha.startsWith(hoy));
            const nombre = c.razon_social || c.nombre || c.id;
            html += `<div class="bg-white rounded-xl p-4 shadow-sm border ${tienePedidoHoy ? 'border-green-300 bg-green-50' : 'border-gray-100'} mb-3">
                <div class="flex justify-between items-start">
                    <div class="flex items-start gap-3">
                        <span class="bg-gray-800 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0">${i + 1}</span>
                        <div>
                            <p class="font-bold text-gray-800">${nombre}</p>
                            <p class="text-xs text-gray-500">${c.direccion || c.zona || ''}</p>
                            ${c.telefono ? `<a href="tel:${c.telefono}" class="text-xs text-blue-600 font-bold">📞 ${c.telefono}</a>` : ''}
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

function seleccionarClienteDesdeRuta(clienteId) {
    const select = document.getElementById('clienteSelect');
    if (select) {
        select.value = clienteId;
        select.dispatchEvent(new Event('change'));
    }
    cambiarVistaVendedor('lista');
}


// ============================================
// PROMOCIONES - App Vendedor
// ============================================

function obtenerPromocionesActivas() {
    const promos = JSON.parse(localStorage.getItem('hdv_promociones') || '[]');
    const hoy = new Date();
    return promos.filter(p => p.activa && hoy >= new Date(p.fechaInicio) && hoy <= new Date(p.fechaFin));
}

function aplicarPromociones(cart) {
    const promos = obtenerPromocionesActivas();
    const resultado = { descuentoTotal: 0, promocionesAplicadas: [], itemsGratis: [] };

    promos.forEach(promo => {
        // Contar items del producto en el carrito
        const itemsProducto = cart.filter(item => {
            if (item.productoId !== promo.productoId) return false;
            if (promo.presentacion !== 'todas' && item.presentacion !== promo.presentacion) return false;
            return true;
        });

        const cantidadTotal = itemsProducto.reduce((s, i) => s + i.cantidad, 0);

        if (cantidadTotal >= promo.cantidadMinima) {
            if (promo.tipo === 'descuento_cantidad' || promo.tipo === 'precio_mayorista') {
                let ahorro = 0;
                itemsProducto.forEach(item => {
                    const diferencia = item.precio - promo.precioEspecial;
                    if (diferencia > 0) {
                        ahorro += diferencia * item.cantidad;
                    }
                });
                if (ahorro > 0) {
                    resultado.descuentoTotal += ahorro;
                    resultado.promocionesAplicadas.push({
                        nombre: promo.nombre,
                        ahorro,
                        descripcion: `${cantidadTotal} x Gs.${promo.precioEspecial.toLocaleString()} en vez de Gs.${itemsProducto[0]?.precio.toLocaleString()}`
                    });
                }
            } else if (promo.tipo === 'combo' && promo.productoGratisId) {
                resultado.itemsGratis.push({
                    productoId: promo.productoGratisId,
                    nombre: promo.nombre,
                    cantidad: promo.cantidadGratis || 1,
                    descripcion: `Gratis por llevar ${cantidadTotal} de ${itemsProducto[0]?.nombre}`
                });
            }
        }
    });

    return resultado;
}

function mostrarPromocionesEnProducto(productoId) {
    const promos = obtenerPromocionesActivas().filter(p => p.productoId === productoId);
    if (promos.length === 0) return '';
    return promos.map(p => {
        if (p.tipo === 'combo') {
            return `<span class="inline-block bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full mt-1">🎁 Lleva ${p.cantidadMinima}+ y lleva gratis!</span>`;
        }
        return `<span class="inline-block bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full mt-1">🏷 ${p.cantidadMinima}+ a Gs.${(p.precioEspecial || 0).toLocaleString()}</span>`;
    }).join(' ');
}

function mostrarResumenPromociones(resultado) {
    if (!resultado || (resultado.promocionesAplicadas.length === 0 && resultado.itemsGratis.length === 0)) return '';
    let html = '<div class="bg-green-50 border border-green-200 rounded-xl p-4 mt-3">';
    html += '<p class="font-bold text-green-800 text-sm mb-2">🎉 Promociones Aplicadas</p>';
    resultado.promocionesAplicadas.forEach(p => {
        html += `<div class="text-sm text-green-700 mb-1">
            <strong>${p.nombre}</strong>: Ahorro Gs. ${p.ahorro.toLocaleString()}
            <br><span class="text-xs">${p.descripcion}</span>
        </div>`;
    });
    resultado.itemsGratis.forEach(g => {
        html += `<div class="text-sm text-green-700 mb-1">🎁 <strong>${g.nombre}</strong>: ${g.cantidad} unid. GRATIS</div>`;
    });
    if (resultado.descuentoTotal > 0) {
        html += `<p class="font-bold text-green-800 text-sm mt-2 pt-2 border-t border-green-200">Total Ahorro: Gs. ${resultado.descuentoTotal.toLocaleString()}</p>`;
    }
    html += '</div>';
    return html;
}

// ============================================
// MI CAJA - RENDICION Y GASTOS (VENDEDOR)
// ============================================

function obtenerSemanaActualVendedor() {
    const now = new Date();
    const year = now.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const week = Math.ceil(((now - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

function obtenerRangoSemanaVendedor(weekStr) {
    if (!weekStr) weekStr = obtenerSemanaActualVendedor();
    const parts = weekStr.split('-W');
    const year = parseInt(parts[0]);
    const week = parseInt(parts[1]);
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dayOfWeek = simple.getDay();
    const inicio = new Date(simple);
    inicio.setDate(simple.getDate() - dayOfWeek + 1);
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 6);
    fin.setHours(23, 59, 59, 999);
    return { inicio, fin };
}

function mostrarMiCaja() {
    const container = document.getElementById('productsContainer');
    const semana = obtenerSemanaActualVendedor();
    const { inicio, fin } = obtenerRangoSemanaVendedor(semana);

    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const gastos = JSON.parse(localStorage.getItem('hdv_gastos') || '[]');
    const cuentas = JSON.parse(localStorage.getItem('hdv_cuentas_bancarias') || '[]');
    const rendiciones = JSON.parse(localStorage.getItem('hdv_rendiciones') || '[]');

    // Pedidos de la semana
    const pedidosSemana = pedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= inicio && f <= fin;
    });
    const totalContado = pedidosSemana
        .filter(p => p.tipoPago === 'contado' && (p.estado === 'entregado' || p.estado === 'pendiente'))
        .reduce((s, p) => s + (p.total || 0), 0);
    const totalCredito = pedidosSemana
        .filter(p => p.tipoPago === 'credito')
        .reduce((s, p) => s + (p.total || 0), 0);

    // Gastos de la semana
    const gastosSemana = gastos.filter(g => {
        const f = new Date(g.fecha);
        return f >= inicio && f <= fin;
    });
    const totalGastos = gastosSemana.reduce((s, g) => s + (g.monto || 0), 0);
    const aRendir = totalContado - totalGastos;

    // Widget de meta
    const metaWidget = generarWidgetMeta();

    // Rendicion de esta semana
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
                    <p class="text-lg font-bold text-green-700">Gs. ${totalContado.toLocaleString()}</p>
                    <p class="text-[10px] text-gray-500 font-bold">CONTADO</p>
                </div>
                <div class="bg-yellow-50 rounded-lg p-3 text-center">
                    <p class="text-lg font-bold text-yellow-700">Gs. ${totalCredito.toLocaleString()}</p>
                    <p class="text-[10px] text-gray-500 font-bold">CREDITO</p>
                </div>
                <div class="bg-red-50 rounded-lg p-3 text-center">
                    <p class="text-lg font-bold text-red-700">Gs. ${totalGastos.toLocaleString()}</p>
                    <p class="text-[10px] text-gray-500 font-bold">GASTOS</p>
                </div>
                <div class="bg-blue-50 rounded-lg p-3 text-center">
                    <p class="text-lg font-bold text-blue-800">Gs. ${aRendir.toLocaleString()}</p>
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
                        <p class="text-sm font-bold text-gray-800">${g.concepto}</p>
                        <p class="text-xs text-gray-400">${new Date(g.fecha).toLocaleDateString('es-PY')}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-bold text-red-600">- Gs. ${(g.monto || 0).toLocaleString()}</p>
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
                    <p class="text-sm font-bold text-gray-800">🏦 ${c.banco}</p>
                    <p class="text-xs text-gray-600">${c.tipo === 'ahorro' ? 'Caja de Ahorro' : 'Cta. Corriente'} | ${c.moneda === 'USD' ? 'USD' : 'Gs.'}</p>
                    <p class="text-xs text-gray-500">Nro: <strong>${c.numero}</strong></p>
                    <p class="text-xs text-gray-400">Titular: ${c.titular}${c.ruc ? ' | RUC: ' + c.ruc : ''}</p>
                </div>
            `).join('')}
        </div>` : ''}

        <button onclick="mostrarConfiguracion()" class="w-full bg-gray-100 text-gray-600 py-3 rounded-xl text-sm font-bold mt-2">Configuracion y Backups</button>
    `;
}

function agregarGastoVendedor() {
    const concepto = prompt('Concepto del gasto (Ej: Combustible, Almuerzo):');
    if (!concepto) return;
    const montoStr = prompt('Monto del gasto (Gs.):');
    if (!montoStr) return;
    const monto = parseInt(montoStr);
    if (isNaN(monto) || monto <= 0) { alert('Monto invalido'); return; }

    const gasto = {
        id: 'G' + Date.now(),
        concepto,
        monto,
        fecha: new Date().toISOString()
    };

    const gastos = JSON.parse(localStorage.getItem('hdv_gastos') || '[]');
    gastos.push(gasto);
    localStorage.setItem('hdv_gastos', JSON.stringify(gastos));

    if (typeof guardarGastosFirebase === 'function') {
        guardarGastosFirebase(gastos).catch(e => console.error(e));
    }

    mostrarExito('Gasto registrado');
    mostrarMiCaja();
}

function eliminarGastoVendedor(gastoId) {
    if (!confirm('Eliminar este gasto?')) return;
    let gastos = JSON.parse(localStorage.getItem('hdv_gastos') || '[]');
    gastos = gastos.filter(g => g.id !== gastoId);
    localStorage.setItem('hdv_gastos', JSON.stringify(gastos));
    if (typeof guardarGastosFirebase === 'function') guardarGastosFirebase(gastos).catch(e => console.error(e));
    mostrarMiCaja();
}

function cerrarSemanaVendedor(semana) {
    const { inicio, fin } = obtenerRangoSemanaVendedor(semana);
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const gastos = JSON.parse(localStorage.getItem('hdv_gastos') || '[]');

    const pedidosSemana = pedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= inicio && f <= fin;
    });
    const totalContado = pedidosSemana
        .filter(p => p.tipoPago === 'contado' && (p.estado === 'entregado' || p.estado === 'pendiente'))
        .reduce((s, p) => s + (p.total || 0), 0);
    const totalGastos = gastos.filter(g => {
        const f = new Date(g.fecha);
        return f >= inicio && f <= fin;
    }).reduce((s, g) => s + (g.monto || 0), 0);

    const aRendir = totalContado - totalGastos;

    if (!confirm(`Cerrar rendicion de la semana?\n\nContado cobrado: Gs. ${totalContado.toLocaleString()}\nGastos: Gs. ${totalGastos.toLocaleString()}\n\nA RENDIR: Gs. ${aRendir.toLocaleString()}`)) return;

    const rendicion = {
        id: 'REND' + Date.now(),
        semana,
        fecha: new Date().toISOString(),
        contado: totalContado,
        gastos: totalGastos,
        aRendir,
        estado: 'rendido',
        pedidos: pedidosSemana.length
    };

    const rendiciones = JSON.parse(localStorage.getItem('hdv_rendiciones') || '[]');
    rendiciones.push(rendicion);
    localStorage.setItem('hdv_rendiciones', JSON.stringify(rendiciones));

    if (typeof guardarRendicionesFirebase === 'function') {
        guardarRendicionesFirebase(rendiciones).catch(e => console.error(e));
    }

    mostrarExito('Semana cerrada exitosamente');
    mostrarMiCaja();
}

// ============================================
// WIDGET DE META / PROGRESO (VENDEDOR)
// ============================================

function generarWidgetMeta() {
    const metas = JSON.parse(localStorage.getItem('hdv_metas') || '[]');
    const mesActual = new Date().toISOString().slice(0, 7);
    const metaActiva = metas.find(m => m.mes === mesActual && m.activa) || metas.find(m => m.activa);

    if (!metaActiva) return '';

    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedidosMes = pedidos.filter(p => p.fecha && p.fecha.startsWith(mesActual));
    const totalVendido = pedidosMes.reduce((s, p) => s + (p.total || 0), 0);

    const objetivo = metaActiva.monto || 0;
    const comisionPct = metaActiva.comision || 0;
    const porcentaje = objetivo > 0 ? Math.min(100, Math.round((totalVendido / objetivo) * 100)) : 0;
    const comisionEstimada = Math.round(totalVendido * (comisionPct / 100));

    const barColor = porcentaje < 50 ? 'bg-red-500' : porcentaje < 80 ? 'bg-yellow-500' : 'bg-green-500';
    const emoji = porcentaje >= 100 ? '🏆' : porcentaje >= 80 ? '🔥' : porcentaje >= 50 ? '💪' : '📈';

    return `
    <div class="bg-gradient-to-r ${porcentaje >= 80 ? 'from-green-50 to-emerald-50 border-green-200' : porcentaje >= 50 ? 'from-yellow-50 to-amber-50 border-yellow-200' : 'from-red-50 to-orange-50 border-red-200'} rounded-xl p-4 shadow-sm border mb-3">
        <div class="flex justify-between items-center mb-2">
            <p class="text-xs font-bold text-gray-600">${emoji} META DEL MES</p>
            <p class="text-lg font-bold ${porcentaje >= 80 ? 'text-green-700' : porcentaje >= 50 ? 'text-yellow-700' : 'text-red-700'}">${porcentaje}%</p>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-4 mb-2 overflow-hidden">
            <div class="h-4 rounded-full ${barColor} transition-all duration-700 flex items-center justify-center text-white text-[10px] font-bold" style="width: ${porcentaje}%">${porcentaje > 15 ? porcentaje + '%' : ''}</div>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center mt-2">
            <div>
                <p class="text-xs text-gray-500">Vendido</p>
                <p class="text-sm font-bold text-gray-800">Gs. ${(totalVendido / 1000000).toFixed(1)}M</p>
            </div>
            <div>
                <p class="text-xs text-gray-500">Meta</p>
                <p class="text-sm font-bold text-gray-800">Gs. ${(objetivo / 1000000).toFixed(1)}M</p>
            </div>
            <div>
                <p class="text-xs text-gray-500">Comision</p>
                <p class="text-sm font-bold text-purple-700">Gs. ${comisionEstimada.toLocaleString()}</p>
            </div>
        </div>
    </div>`;
}
