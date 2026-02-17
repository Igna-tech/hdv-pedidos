let productos = [], clientes = [], categorias = [], clienteActual = null, carrito = [], filtroCategoria = 'todas';

document.addEventListener('DOMContentLoaded', async () => {
    await cargarDatos();
    inicializarEventListeners();
    actualizarEstadoConexion();
    registrarServiceWorker();
});

async function cargarDatos() {
    try {
        const response = await fetch('productos.json');
        const data = await response.json();
        productos = data.productos;
        clientes = data.clientes;
        categorias = data.categorias;
        cargarClientes();
        cargarCategorias();
    } catch (error) {
        document.getElementById('productsContainer').innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div>Error al cargar los datos</div>';
    }
}

function cargarClientes() {
    const select = document.getElementById('clienteSelect');
    select.innerHTML = '<option value="">-- Seleccione un cliente --</option>';
    clientes.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.nombre + ' — ' + (c.zona || '');
        select.appendChild(option);
    });
}

function cargarCategorias() {
    const container = document.getElementById('categoryFilters');
    container.innerHTML = '';
    const btnTodas = document.createElement('button');
    btnTodas.className = 'category-btn active';
    btnTodas.textContent = 'Todas';
    btnTodas.onclick = (e) => filtrarPorCategoria('todas', e.target);
    container.appendChild(btnTodas);
    categorias.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-btn';
        btn.textContent = cat.nombre;
        btn.onclick = (e) => filtrarPorCategoria(cat.id, e.target);
        container.appendChild(btn);
    });
}

function inicializarEventListeners() {
    document.getElementById('clienteSelect').addEventListener('change', (e) => {
        const clienteId = e.target.value;
        if (clienteId) {
            clienteActual = clientes.find(c => c.id === clienteId);
            document.getElementById('searchInput').disabled = false;
            carrito = [];
            actualizarCarrito();
            mostrarProductos();
        } else {
            clienteActual = null;
            document.getElementById('searchInput').disabled = true;
            document.getElementById('productsContainer').innerHTML = '<div class="empty-state"><div class="empty-state-icon">👤</div>Seleccione un cliente para comenzar</div>';
        }
    });
    document.getElementById('searchInput').addEventListener('input', (e) => {
        mostrarProductos(e.target.value.toLowerCase());
    });
    document.getElementById('viewCartBtn').addEventListener('click', mostrarModalCarrito);
    window.addEventListener('online', actualizarEstadoConexion);
    window.addEventListener('offline', actualizarEstadoConexion);
}

function filtrarPorCategoria(categoriaId, btn) {
    filtroCategoria = categoriaId;
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mostrarProductos();
}

function mostrarProductos(termino = '') {
    if (!clienteActual) return;
    const container = document.getElementById('productsContainer');
    let filtrados = productos;
    if (filtroCategoria !== 'todas') filtrados = filtrados.filter(p => p.categoria === filtroCategoria);
    if (termino) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(termino));
    if (filtrados.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div>No se encontraron productos</div>';
        return;
    }
    const grid = document.createElement('div');
    grid.className = 'products-grid';
    filtrados.forEach(p => grid.appendChild(crearTarjetaProducto(p)));
    container.innerHTML = '';
    container.appendChild(grid);
}

function crearTarjetaProducto(producto) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.id = `product-${producto.id}`;

    const catNombre = categorias.find(c => c.id === producto.categoria)?.nombre || '';
    card.innerHTML = `
        <div class="product-name">${producto.nombre}</div>
        <div class="product-cat">${catNombre} › ${producto.subcategoria}</div>
        <div class="product-variants" id="variants-${producto.id}"></div>
        <div class="variant-selected" id="selected-${producto.id}">
            <div>
                <strong id="sel-variant-${producto.id}"></strong><br>
                <span style="color:#6b7280;font-size:13px" id="sel-price-${producto.id}"></span>
            </div>
            <div class="quantity-controls">
                <button class="quantity-btn" onclick="cambiarCantidad('${producto.id}', -1)">−</button>
                <div class="quantity-display" id="qty-${producto.id}">1</div>
                <button class="quantity-btn" onclick="cambiarCantidad('${producto.id}', 1)">+</button>
            </div>
        </div>
    `;

    const variantsContainer = card.querySelector(`#variants-${producto.id}`);
    producto.presentaciones.forEach((pres, i) => {
        const btn = document.createElement('button');
        btn.className = 'variant-btn';
        btn.textContent = pres.tamano;
        btn.onclick = () => seleccionarVariante(producto, i);
        variantsContainer.appendChild(btn);
    });

    return card;
}

function seleccionarVariante(producto, index) {
    const pres = producto.presentaciones[index];
    const precio = obtenerPrecio(producto.id, pres);
    const sel = document.getElementById(`selected-${producto.id}`);
    sel.classList.add('show');
    document.getElementById(`sel-variant-${producto.id}`).textContent = pres.tamano;
    document.getElementById(`sel-price-${producto.id}`).textContent = precio > 0 ? `Gs. ${precio.toLocaleString()}` : 'Sin precio cargado';
    const idx = carrito.findIndex(i => i.productoId === producto.id && i.presentacion === pres.tamano);
    if (idx >= 0) {
        document.getElementById(`qty-${producto.id}`).textContent = carrito[idx].cantidad;
    } else {
        carrito.push({ productoId: producto.id, nombre: producto.nombre, presentacion: pres.tamano, precio, cantidad: 1 });
        document.getElementById(`qty-${producto.id}`).textContent = 1;
    }
    actualizarCarrito();
}

function cambiarCantidad(productoId, cambio) {
    const idx = carrito.findIndex(i => i.productoId === productoId);
    if (idx >= 0) {
        carrito[idx].cantidad += cambio;
        if (carrito[idx].cantidad <= 0) {
            carrito.splice(idx, 1);
            document.getElementById(`selected-${productoId}`).classList.remove('show');
        } else {
            document.getElementById(`qty-${productoId}`).textContent = carrito[idx].cantidad;
        }
        actualizarCarrito();
    }
}

function obtenerPrecio(productoId, pres) {
    if (!clienteActual) return 0;
    const custom = clienteActual.precios_personalizados?.[productoId]?.find(p => p.tamano === pres.tamano);
    if (custom) return custom.precio;
    return pres.precio_base;
}

function actualizarCarrito() {
    const cantidad = carrito.reduce((s, i) => s + i.cantidad, 0);
    const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    document.getElementById('cartItems').textContent = `${cantidad} producto${cantidad !== 1 ? 's' : ''}`;
    document.getElementById('cartTotal').textContent = `Gs. ${total.toLocaleString()}`;
    document.getElementById('viewCartBtn').disabled = cantidad === 0;
}

function mostrarModalCarrito() {
    const lista = document.getElementById('cartItemsList');
    lista.innerHTML = '';
    if (carrito.length === 0) {
        lista.innerHTML = '<div class="empty-state">El carrito está vacío</div>';
    } else {
        carrito.forEach(item => {
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div>
                    <strong>${item.nombre}</strong><br>
                    <span style="color:#6b7280;font-size:14px">${item.presentacion} × ${item.cantidad}</span>
                </div>
                <div style="text-align:right">
                    <strong>Gs. ${(item.precio * item.cantidad).toLocaleString()}</strong><br>
                    <span style="color:#6b7280;font-size:13px">@Gs. ${item.precio.toLocaleString()}</span>
                </div>
            `;
            lista.appendChild(div);
        });
        const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
        const totalDiv = document.createElement('div');
        totalDiv.style.cssText = 'margin-top:20px;padding-top:20px;border-top:2px solid #e5e7eb;';
        totalDiv.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700"><span>TOTAL</span><span>Gs. ${total.toLocaleString()}</span></div>`;
        lista.appendChild(totalDiv);
    }
    document.getElementById('cartModal').classList.add('show');
}

function closeCartModal() {
    document.getElementById('cartModal').classList.remove('show');
}

async function confirmarPedido() {
    if (!clienteActual || carrito.length === 0) return;
    const pedido = {
        id: Date.now().toString(),
        fecha: new Date().toLocaleString('es-PY'),
        cliente: { id: clienteActual.id, nombre: clienteActual.nombre },
        items: carrito.map(i => ({ ...i, subtotal: i.precio * i.cantidad })),
        total: carrito.reduce((s, i) => s + i.precio * i.cantidad, 0),
        sincronizado: false
    };
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    pedidos.push(pedido);
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
    mostrarExito(`Pedido de ${clienteActual.nombre} guardado`);
    carrito = [];
    actualizarCarrito();
    closeCartModal();
    mostrarProductos();
}

function actualizarEstadoConexion() {
    const badge = document.getElementById('statusBadge');
    if (navigator.onLine) {
        badge.textContent = '● En línea';
        badge.className = 'status-badge online';
    } else {
        badge.textContent = '● Sin conexión';
        badge.className = 'status-badge offline';
    }
}

function mostrarExito(msg) {
    const el = document.getElementById('successMessage');
    el.textContent = '✓ ' + msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
}

async function registrarServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('service-worker.js');
        } catch (e) {
            console.log('SW no disponible:', e);
        }
    }
}
