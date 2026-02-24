// ============================================
// HDV Pedidos - App Vendedor v2.8
// ============================================
let productos = [];
let categorias = [];
let clientes = [];
let clienteActual = null;
let carrito = [];
let categoriaActual = 'todas';
let vistaActual = 'lista'; // 'lista' o 'pedidos'

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await cargarDatos();
    configurarEventos();
    cargarCarritoGuardado();
    registrarSW();
});

async function cargarDatos() {
    try {
        const response = await fetch('productos.json?t=' + Date.now());
        const data = await response.json();
        categorias = data.categorias || [];
        productos = (data.productos || []).filter(p => !p.oculto);
        clientes = (data.clientes || []).filter(c => !c.oculto);
        
        poblarClientes();
        crearFiltrosCategorias();
        mostrarProductos();
        
        document.getElementById('searchInput').disabled = false;
    } catch (e) {
        console.error('Error cargando datos:', e);
        document.getElementById('productsContainer').innerHTML = '<div class="text-center text-red-500 mt-10 font-bold">Error al cargar catálogo. Verifica tu conexión.</div>';
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
                if (!confirm('Cambiar de cliente vaciará el carrito actual. ¿Continuar?')) {
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
// CATEGORÍAS
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
        container.innerHTML = '<div class="text-center text-gray-400 mt-10"><div class="text-4xl mb-3">🔍</div><p class="font-bold">No se encontraron productos</p></div>';
        return;
    }
    
    container.innerHTML = '';
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
        
        card.innerHTML = `
            <div class="w-full h-28 bg-gray-50 rounded-lg mb-2 flex items-center justify-center overflow-hidden">${imgContent}</div>
            <p class="text-sm font-bold text-gray-800 leading-tight">${prod.nombre}</p>
        `;
        grid.appendChild(card);
    });
    
    container.appendChild(grid);
}

function obtenerEmoji(producto) {
    const n = producto.nombre.toLowerCase();
    if (n.includes('jabón') || n.includes('jabon')) return '🧼';
    if (n.includes('shampoo')) return '🧴';
    if (n.includes('desodorante')) return '💨';
    if (n.includes('pañal') || n.includes('panal')) return '🍼';
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
    // Remover modal existente si hay
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
                <div>
                    <p class="font-bold text-gray-800">${pres.tamano}</p>
                    <p class="text-blue-600 font-bold">Gs. ${precio.toLocaleString()}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="ajustarQty('${producto.id}',${idx},-1)" class="w-8 h-8 rounded-lg border-2 border-gray-300 flex items-center justify-center font-bold text-lg">−</button>
                    <input type="number" id="qty-${producto.id}-${idx}" value="1" min="1" class="w-12 text-center border border-gray-300 rounded-lg py-1 font-bold">
                    <button onclick="ajustarQty('${producto.id}',${idx},1)" class="w-8 h-8 rounded-lg border-2 border-gray-300 flex items-center justify-center font-bold text-lg">+</button>
                    <button onclick="agregarAlCarrito('${producto.id}',${idx})" class="ml-2 bg-[#111827] text-white px-4 py-2 rounded-lg font-bold text-sm">Agregar</button>
                </div>
            </div>`;
    }).join('');
    
    const modal = document.createElement('div');
    modal.id = 'productDetailModal';
    modal.className = 'fixed inset-0 bg-black/50 z-[100] flex items-end';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="bg-white w-full rounded-t-3xl max-h-[85vh] overflow-y-auto p-6 shadow-2xl">
            <div class="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4"></div>
            <div class="w-full h-40 bg-gray-50 rounded-xl mb-4 flex items-center justify-center overflow-hidden">${imgContent}</div>
            <h3 class="text-xl font-bold text-gray-900">${producto.nombre}</h3>
            <p class="text-sm text-gray-500 mb-4">${catNombre} › ${producto.subcategoria}</p>
            <div class="space-y-1">${presHTML}</div>
            <button onclick="document.getElementById('productDetailModal').remove()" class="w-full mt-6 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold">Cerrar</button>
        </div>`;
    document.body.appendChild(modal);
}

function ajustarQty(prodId, idx, delta) {
    const input = document.getElementById(`qty-${prodId}-${idx}`);
    if (input) {
        let val = parseInt(input.value) || 1;
        val = Math.max(1, val + delta);
        input.value = val;
    }
}

// ============================================
// CARRITO
// ============================================
function agregarAlCarrito(productoId, presIdx) {
    if (!clienteActual) {
        alert('Selecciona un cliente primero');
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
        alert('El carrito está vacío');
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
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-xl';
        div.innerHTML = `
            <div class="flex-1">
                <p class="font-bold text-gray-800 text-sm">${item.nombre}</p>
                <p class="text-xs text-gray-500">${item.presentacion} × ${item.cantidad}</p>
            </div>
            <div class="flex items-center gap-3">
                <p class="font-bold text-gray-900">Gs. ${item.subtotal.toLocaleString()}</p>
                <button onclick="eliminarDelCarrito(${idx})" class="text-red-500 text-lg font-bold">×</button>
            </div>
        `;
        container.appendChild(div);
    });
    
    // Total
    const total = carrito.reduce((s, i) => s + i.subtotal, 0);
    const totalSection = document.getElementById('totalSection');
    totalSection.classList.remove('hidden');
    totalSection.innerHTML = `
        <div class="flex justify-between items-center">
            <span class="text-gray-500 font-bold">SUBTOTAL</span>
            <span class="text-xl font-bold text-gray-900" id="cartSubtotal">Gs. ${total.toLocaleString()}</span>
        </div>
        <div class="flex justify-between items-center" id="cartTotalFinal">
            <span class="text-gray-500 font-bold">TOTAL</span>
            <span class="text-2xl font-bold text-gray-900">Gs. ${total.toLocaleString()}</span>
        </div>
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

function aplicarDescuento() {
    const desc = parseFloat(document.getElementById('descuento').value) || 0;
    if (desc < 0 || desc > 100) { alert('Descuento inválido'); return; }
    
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
    if (!clienteActual) { alert('Selecciona un cliente'); return; }
    if (carrito.length === 0) { alert('El carrito está vacío'); return; }
    
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
    
    // Guardar en localStorage
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    pedidos.push(pedido);
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
    
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
// VISTA MIS PEDIDOS
// ============================================
function cambiarVistaVendedor(vista) {
    vistaActual = vista;
    
    const btnLista = document.getElementById('btn-tab-lista');
    const btnPedidos = document.getElementById('btn-tab-pedidos');
    const container = document.getElementById('productsContainer');
    const catFilters = document.getElementById('categoryFilters');
    const searchBox = document.getElementById('searchContainer');
    
    if (vista === 'lista') {
        btnLista.className = 'flex flex-col items-center gap-1 text-gray-900 transition-colors';
        btnPedidos.className = 'flex flex-col items-center gap-1 text-gray-400 transition-colors';
        catFilters.style.display = '';
        searchBox.style.display = '';
        mostrarProductos();
    } else {
        btnLista.className = 'flex flex-col items-center gap-1 text-gray-400 transition-colors';
        btnPedidos.className = 'flex flex-col items-center gap-1 text-gray-900 transition-colors';
        catFilters.style.display = 'none';
        searchBox.style.display = 'none';
        mostrarMisPedidos();
    }
}

function mostrarMisPedidos() {
    const container = document.getElementById('productsContainer');
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    
    // Filtrar pedidos del cliente actual o mostrar todos
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
        `;
        container.appendChild(div);
    });
}

// ============================================
// UTILIDADES
// ============================================
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
                console.log('SW registrado');
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            if (confirm('Hay una actualización disponible. ¿Actualizar ahora?')) {
                                location.reload(true);
                            }
                        }
                    });
                });
            })
            .catch(err => console.log('SW error:', err));
    }
}

// Filtrar pedidos (alias for admin compatibility)
function filtrarPedidos() {
    aplicarFiltrosPedidos && aplicarFiltrosPedidos();
}
