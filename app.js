let productos = [], clientes = [], categorias = [], clienteActual = null, carrito = [], filtroCategoria = 'todas';
let vistaActual = 'lista'; // lista o cuadricula
let historialCompras = {}; // para productos sugeridos

document.addEventListener('DOMContentLoaded', async () => {
    verificarVendedor();
    await cargarDatos();
    inicializarEventListeners();
    actualizarEstadoConexion();
    registrarServiceWorker();
    cargarModoOscuro();
    construirHistorialCompras();
});

function cargarModoOscuro() {
    const darkMode = localStorage.getItem('dark_mode') === 'true';
    if (darkMode) {
        document.body.classList.add('dark-mode');
        document.querySelector('.dark-mode-toggle').textContent = '☀️';
    }
}

function construirHistorialCompras() {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    historialCompras = {};
    
    pedidos.forEach(pedido => {
        if (!pedido.cliente) return;
        const clienteId = pedido.cliente.id;
        if (!historialCompras[clienteId]) {
            historialCompras[clienteId] = {};
        }
        
        pedido.items.forEach(item => {
            const productoId = item.nombre; // usamos nombre como key
            if (!historialCompras[clienteId][productoId]) {
                historialCompras[clienteId][productoId] = 0;
            }
            historialCompras[clienteId][productoId] += item.cantidad;
        });
    });
}

function verificarVendedor() {
    const vendedor = localStorage.getItem('vendedor_nombre');
    if (!vendedor) {
        const nombre = prompt('Por favor, ingresa tu nombre (vendedor):');
        if (nombre && nombre.trim()) {
            localStorage.setItem('vendedor_nombre', nombre.trim());
        } else {
            verificarVendedor(); // Volver a preguntar si no ingresa nada
        }
    }
}

async function cargarDatos() {
    try {
        const response = await fetch('productos.json');
        const data = await response.json();
        productos = data.productos;
        clientes = data.clientes;
        categorias = data.categorias;
        cargarClientes();
        cargarCategorias();
        mostrarProductos(); // Mostrar productos desde el inicio
    } catch (error) {
        document.getElementById('productsContainer').innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div>Error al cargar los datos</div>';
    }
}

function cargarClientes() {
    const select = document.getElementById('clienteSelect');
    select.innerHTML = '<option value="">-- Escribe para buscar cliente --</option>';
    
    // Convertir select en input con datalist para buscador
    const container = select.parentElement;
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'clienteSearch';
    input.className = 'search-input';
    input.placeholder = '🔍 Buscar cliente por nombre, RUC o dirección...';
    input.setAttribute('list', 'clientesDatalist');
    input.style.cssText = 'width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 16px;';
    
    const datalist = document.createElement('datalist');
    datalist.id = 'clientesDatalist';
    
    clientes.filter(c => !c.oculto).forEach(c => {
        const option = document.createElement('option');
        const razonSocial = c.razon_social || c.nombre;
        const direccion = c.direccion || c.zona || '';
        const ruc = c.ruc ? ` - RUC: ${c.ruc}` : '';
        option.value = `${razonSocial}${ruc} — ${direccion}`;
        option.dataset.id = c.id;
        datalist.appendChild(option);
    });
    
    select.style.display = 'none';
    container.appendChild(input);
    container.appendChild(datalist);
    
    // Evento de búsqueda
    input.addEventListener('input', (e) => {
        const texto = e.target.value.toLowerCase();
        const cliente = clientes.find(c => {
            const razonSocial = (c.razon_social || c.nombre || '').toLowerCase();
            const direccion = (c.direccion || c.zona || '').toLowerCase();
            const ruc = (c.ruc || '').toLowerCase();
            const busqueda = `${razonSocial} ${direccion} ${ruc}`;
            return busqueda.includes(texto) || 
                   razonSocial === texto ||
                   ruc === texto;
        });
        
        if (cliente) {
            clienteActual = cliente;
            document.getElementById('searchInput').disabled = false;
            carrito = [];
            actualizarCarrito();
            mostrarProductos();
        }
    });
    
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
    const container = document.getElementById('productsContainer');
    let filtrados = productos.filter(p => !p.oculto); // Excluir productos ocultos
    if (filtroCategoria !== 'todas') filtrados = filtrados.filter(p => p.categoria === filtroCategoria);
    if (termino) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(termino));
    if (filtrados.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div>No se encontraron productos</div>';
        return;
    }
    const grid = document.createElement('div');
    grid.className = `products-grid ${vistaActual === 'cuadricula' ? 'grid-view' : ''}`;
    filtrados.forEach(p => grid.appendChild(vistaActual === 'cuadricula' ? crearTarjetaProductoCuadricula(p) : crearTarjetaProducto(p)));
    container.innerHTML = '';
    container.appendChild(grid);
}

function cambiarVista(vista) {
    vistaActual = vista;
    document.querySelectorAll('.view-toggle button').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    mostrarProductos();
}

function crearTarjetaProductoCuadricula(producto) {
    const card = document.createElement('div');
    card.className = 'product-card grid-view';
    card.onclick = () => mostrarDetalleProducto(producto);
    
    const emoji = obtenerEmojiProducto(producto);
    
    card.innerHTML = `
        <div class="product-image">${emoji}</div>
        <div class="product-name">${producto.nombre}</div>
    `;
    
    return card;
}

function obtenerEmojiProducto(producto) {
    const nombre = producto.nombre.toLowerCase();
    if (nombre.includes('jabón') || nombre.includes('jabon')) return '🧼';
    if (nombre.includes('shampoo')) return '🧴';
    if (nombre.includes('desodorante')) return '💨';
    if (nombre.includes('pañal') || nombre.includes('panal')) return '🍼';
    if (nombre.includes('toallita')) return '🧻';
    if (nombre.includes('havaianas') || nombre.includes('ipanema')) return '🩴';
    if (nombre.includes('aceite')) return '🫗';
    if (nombre.includes('talco')) return '✨';
    return '📦';
}

function mostrarDetalleProducto(producto) {
    const modal = document.getElementById('productDetailModal');
    const emoji = obtenerEmojiProducto(producto);
    const catNombre = categorias.find(c => c.id === producto.categoria)?.nombre || '';
    
    document.getElementById('detailImage').textContent = emoji;
    document.getElementById('detailTitle').textContent = producto.nombre;
    document.getElementById('detailCategory').textContent = `${catNombre} › ${producto.subcategoria}`;
    
    // Info de presentaciones con opción de agregar
    const infoHTML = producto.presentaciones.map((pres, idx) => {
        const precio = obtenerPrecio(producto.id, pres);
        return `
            <div class="product-detail-info-row" style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;">
                <div style="flex:1;">
                    <div style="font-weight:600;margin-bottom:4px;">${pres.tamano}</div>
                    <div style="color:#2563eb;font-weight:700;">Gs. ${precio.toLocaleString()}</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button onclick="ajustarCantidadDetalle('${producto.id}', ${idx}, -1)" style="width:32px;height:32px;border:2px solid #2563eb;background:white;color:#2563eb;border-radius:6px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button>
                    <input type="number" id="detail-qty-${producto.id}-${idx}" value="1" min="1" style="width:50px;padding:6px;border:2px solid #e5e7eb;border-radius:6px;text-align:center;font-weight:600;">
                    <button onclick="ajustarCantidadDetalle('${producto.id}', ${idx}, 1)" style="width:32px;height:32px;border:2px solid #2563eb;background:white;color:#2563eb;border-radius:6px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>
                    <button onclick="agregarDesdeDetalle('${producto.id}', ${idx})" style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer;white-space:nowrap;">+ Agregar</button>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('detailInfo').innerHTML = infoHTML;
    
    // Productos sugeridos (solo si hay cliente)
    if (clienteActual) {
        mostrarProductosSugeridos(producto);
    } else {
        document.getElementById('detailSuggestions').style.display = 'none';
    }
    
    modal.classList.add('show');
}

function ajustarCantidadDetalle(productoId, presIdx, cambio) {
    const input = document.getElementById(`detail-qty-${productoId}-${presIdx}`);
    if (input) {
        let valor = parseInt(input.value) || 1;
        valor += cambio;
        if (valor < 1) valor = 1;
        input.value = valor;
    }
}

function agregarDesdeDetalle(productoId, presIdx) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;
    
    const pres = producto.presentaciones[presIdx];
    const input = document.getElementById(`detail-qty-${productoId}-${presIdx}`);
    const cantidad = parseInt(input.value) || 1;
    const precio = obtenerPrecio(productoId, pres);
    
    // Confirmación
    if (!confirm(`¿Agregar ${cantidad}x ${producto.nombre} (${pres.tamano}) al pedido?`)) {
        return;
    }
    
    // Verificar si ya existe en el carrito
    const existe = carrito.find(i => i.productoId === productoId && i.presentacion === pres.tamano);
    
    if (existe) {
        existe.cantidad += cantidad;
    } else {
        carrito.push({
            productoId: productoId,
            nombre: producto.nombre,
            presentacion: pres.tamano,
            precio: precio,
            cantidad: cantidad
        });
    }
    
    actualizarCarrito();
    mostrarExito(`${cantidad}x ${producto.nombre} agregado al pedido`);
    
    // Resetear cantidad a 1
    input.value = 1;
}

function cerrarDetalleProducto() {
    document.getElementById('productDetailModal').classList.remove('show');
}

function mostrarProductosSugeridos(productoActual) {
    if (!clienteActual || !historialCompras[clienteActual.id]) {
        document.getElementById('detailSuggestions').style.display = 'none';
        return;
    }
    
    const compras = historialCompras[clienteActual.id];
    const sugeridos = Object.entries(compras)
        .filter(([nombre, _]) => nombre !== productoActual.nombre)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    
    if (sugeridos.length === 0) {
        document.getElementById('detailSuggestions').style.display = 'none';
        return;
    }
    
    const html = sugeridos.map(([nombre, cantidad]) => {
        const prod = productos.find(p => p.nombre === nombre);
        const emoji = prod ? obtenerEmojiProducto(prod) : '📦';
        return `
            <div class="suggestion-item">
                <div class="suggestion-icon">${emoji}</div>
                <div style="flex:1;">
                    <div style="font-weight:600;font-size:14px;">${nombre}</div>
                    <div style="font-size:12px;color:#6b7280;">Comprado ${cantidad} veces</div>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('detailSuggestions').innerHTML = `
        <h3>✨ Este cliente también compra:</h3>
        ${html}
    `;
    document.getElementById('detailSuggestions').style.display = 'block';
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('dark_mode', isDark);
    document.querySelector('.dark-mode-toggle').textContent = isDark ? '☀️' : '🌙';
}

function mostrarMenuOpciones(e) {
    e.preventDefault();
    const menu = document.getElementById('optionsMenu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function cerrarMenuOpciones() {
    document.getElementById('optionsMenu').style.display = 'none';
}

function forzarActualizacion() {
    if (confirm('¿Forzar recarga completa? Esto limpiará el caché y recargará la app.')) {
        cerrarMenuOpciones();
        
        // Limpiar caché
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
            });
        }
        
        // Desregistrar service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                registrations.forEach(reg => reg.unregister());
            });
        }
        
        // Limpiar localStorage de sync
        const keysToKeep = ['vendedor_nombre', 'dark_mode'];
        const allKeys = Object.keys(localStorage);
        allKeys.forEach(key => {
            if (!keysToKeep.includes(key)) {
                // No borrar, solo marcar para re-sync
            }
        });
        
        // Recargar forzado
        setTimeout(() => {
            window.location.reload(true);
        }, 500);
    }
}

function limpiarTodoElCache() {
    if (confirm('⚠️ ¿BORRAR TODO EL CACHÉ? Esto eliminará datos temporales pero NO los pedidos guardados.')) {
        cerrarMenuOpciones();
        
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
            });
        }
        
        alert('✓ Caché limpiado. Recarga la página para ver los cambios.');
    }
}

// Cerrar menú si se hace click fuera
document.addEventListener('click', (e) => {
    const menu = document.getElementById('optionsMenu');
    const btn = document.querySelector('.dark-mode-toggle');
    if (menu && !menu.contains(e.target) && e.target !== btn) {
        menu.style.display = 'none';
    }
});

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
                <input type="number" class="quantity-display" id="qty-${producto.id}" value="1" min="1" style="border:2px solid #e5e7eb;border-radius:6px;text-align:center;" onchange="actualizarCantidadDirecta('${producto.id}', this.value)">
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
    
    const idx = carrito.findIndex(i => i.productoId === producto.id && i.presentacion === pres.tamano);
    
    // Si no está en el carrito, pedir confirmación
    if (idx < 0) {
        if (!confirm(`¿Agregar ${producto.nombre} (${pres.tamano}) al pedido?`)) {
            return;
        }
        carrito.push({ productoId: producto.id, nombre: producto.nombre, presentacion: pres.tamano, precio, cantidad: 1 });
        document.getElementById(`qty-${producto.id}`).value = 1;
        mostrarExito(`${producto.nombre} agregado al pedido`);
    }
    
    sel.classList.add('show');
    document.getElementById(`sel-variant-${producto.id}`).textContent = pres.tamano;
    document.getElementById(`sel-price-${producto.id}`).textContent = precio > 0 ? `Gs. ${precio.toLocaleString()}` : 'Sin precio cargado';
    
    if (idx >= 0) {
        document.getElementById(`qty-${producto.id}`).value = carrito[idx].cantidad;
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
            const input = document.getElementById(`qty-${productoId}`);
            if (input) input.value = carrito[idx].cantidad;
        }
        actualizarCarrito();
    }
}

function actualizarCantidadDirecta(productoId, nuevaCantidad) {
    const cantidad = parseInt(nuevaCantidad) || 1;
    const idx = carrito.findIndex(i => i.productoId === productoId);
    if (idx >= 0) {
        if (cantidad <= 0) {
            carrito.splice(idx, 1);
            document.getElementById(`selected-${productoId}`).classList.remove('show');
        } else {
            carrito[idx].cantidad = cantidad;
            const input = document.getElementById(`qty-${productoId}`);
            if (input) input.value = cantidad;
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
        document.getElementById('totalSection').style.display = 'none';
    } else {
        carrito.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div style="flex:1">
                    <strong>${item.nombre}</strong><br>
                    <span style="color:#6b7280;font-size:14px">${item.presentacion}</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px">
                    <button onclick="editarCantidadCarrito(${index}, -1)" style="width:32px;height:32px;border:2px solid #2563eb;background:white;color:#2563eb;border-radius:6px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center">−</button>
                    <input type="number" id="cart-qty-${index}" value="${item.cantidad}" min="1" onchange="cambiarCantidadCarrito(${index}, this.value)" style="width:60px;padding:6px;border:2px solid #e5e7eb;border-radius:6px;text-align:center;font-size:14px;font-weight:600">
                    <button onclick="editarCantidadCarrito(${index}, 1)" style="width:32px;height:32px;border:2px solid #2563eb;background:white;color:#2563eb;border-radius:6px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center">+</button>
                </div>
                <div style="text-align:right;min-width:120px">
                    <strong>Gs. ${(item.precio * item.cantidad).toLocaleString()}</strong><br>
                    <span style="color:#6b7280;font-size:13px">@Gs. ${item.precio.toLocaleString()}</span>
                </div>
                <button onclick="eliminarDelCarrito(${index})" style="width:32px;height:32px;border:2px solid #ef4444;background:white;color:#ef4444;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center">🗑️</button>
            `;
            lista.appendChild(div);
        });
        
        calcularTotales();
        document.getElementById('totalSection').style.display = 'block';
    }
    document.getElementById('cartModal').classList.add('show');
}

let descuentoAplicado = 0;

function aplicarDescuento() {
    descuentoAplicado = parseFloat(document.getElementById('descuento').value) || 0;
    if (descuentoAplicado < 0) descuentoAplicado = 0;
    if (descuentoAplicado > 100) descuentoAplicado = 100;
    document.getElementById('descuento').value = descuentoAplicado;
    calcularTotales();
}

function calcularTotales() {
    const subtotal = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const montoDescuento = subtotal * (descuentoAplicado / 100);
    const total = subtotal - montoDescuento;
    
    const totalSection = document.getElementById('totalSection');
    totalSection.innerHTML = `
        <div class="total-row">
            <span>Subtotal:</span>
            <span>Gs. ${subtotal.toLocaleString()}</span>
        </div>
        ${descuentoAplicado > 0 ? `
        <div class="total-row" style="color:#ef4444;">
            <span>Descuento (${descuentoAplicado}%):</span>
            <span>- Gs. ${montoDescuento.toLocaleString()}</span>
        </div>
        ` : ''}
        <div class="total-row final">
            <span>TOTAL:</span>
            <span>Gs. ${total.toLocaleString()}</span>
        </div>
    `;
}

function editarCantidadCarrito(index, cambio) {
    if (carrito[index]) {
        carrito[index].cantidad += cambio;
        if (carrito[index].cantidad <= 0) {
            carrito.splice(index, 1);
        }
        actualizarCarrito();
        mostrarModalCarrito();
    }
}

function cambiarCantidadCarrito(index, nuevaCantidad) {
    const cantidad = parseInt(nuevaCantidad) || 1;
    if (carrito[index]) {
        if (cantidad <= 0) {
            carrito.splice(index, 1);
        } else {
            carrito[index].cantidad = cantidad;
        }
        actualizarCarrito();
        mostrarModalCarrito();
    }
}

function eliminarDelCarrito(index) {
    if (confirm('¿Eliminar este producto del pedido?')) {
        carrito.splice(index, 1);
        actualizarCarrito();
        mostrarModalCarrito();
    }
}

function closeCartModal() {
    document.getElementById('cartModal').classList.remove('show');
}

async function confirmarPedido() {
    if (carrito.length === 0) {
        alert('El carrito está vacío');
        return;
    }
    
    // Si no hay cliente seleccionado, pedir datos
    if (!clienteActual) {
        closeCartModal();
        document.getElementById('clienteRapidoModal').classList.add('show');
        return;
    }
    
    // Proceder con el pedido normal
    procesarPedido();
}

function cerrarClienteRapido() {
    document.getElementById('clienteRapidoModal').classList.remove('show');
    document.getElementById('clienteRapidoRazon').value = '';
    document.getElementById('clienteRapidoRUC').value = '';
    document.getElementById('clienteRapidoTelefono').value = '';
    document.getElementById('clienteRapidoDireccion').value = '';
    document.getElementById('clienteRapidoEncargado').value = '';
}

function confirmarConClienteRapido() {
    const razonSocial = document.getElementById('clienteRapidoRazon').value.trim();
    const ruc = document.getElementById('clienteRapidoRUC').value.trim();
    const telefono = document.getElementById('clienteRapidoTelefono').value.trim();
    const direccion = document.getElementById('clienteRapidoDireccion').value.trim();
    const encargado = document.getElementById('clienteRapidoEncargado').value.trim();
    const guardar = document.getElementById('guardarClienteCheck').checked;
    
    if (!razonSocial || !ruc || !telefono || !direccion) {
        alert('Por favor completa todos los campos obligatorios (*)');
        return;
    }
    
    // Crear cliente temporal con todos los datos
    const clienteTemporal = {
        id: 'TEMP_' + Date.now(),
        nombre: razonSocial,
        razon_social: razonSocial,
        ruc: ruc,
        telefono: telefono,
        direccion: direccion,
        encargado: encargado || '',
        zona: direccion, // Por compatibilidad
        tipo: 'mayorista_estandar',
        esTemporalNuevo: true,
        guardarEnSistema: guardar
    };
    
    clienteActual = clienteTemporal;
    cerrarClienteRapido();
    
    // Procesar el pedido
    procesarPedido();
}

async function procesarPedido() {
    const tipoPago = document.getElementById('tipoPago').value;
    const descuento = descuentoAplicado;
    const notas = document.getElementById('notasPedido').value.trim();
    
    const subtotal = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const montoDescuento = subtotal * (descuento / 100);
    const total = subtotal - montoDescuento;
    
    const pedido = {
        id: Date.now().toString(),
        fecha: new Date().toISOString(),
        cliente: { 
            id: clienteActual.id, 
            nombre: clienteActual.nombre,
            razon_social: clienteActual.razon_social || clienteActual.nombre,
            ruc: clienteActual.ruc || '',
            telefono: clienteActual.telefono || '',
            direccion: clienteActual.direccion || clienteActual.zona || '',
            encargado: clienteActual.encargado || ''
        },
        zona: clienteActual.direccion || clienteActual.zona || '',
        vendedor: localStorage.getItem('vendedor_nombre') || 'Vendedor',
        items: carrito.map(i => ({ 
            nombre: i.nombre,
            presentacion: i.presentacion,
            cantidad: i.cantidad,
            precio_unitario: i.precio,
            subtotal: i.precio * i.cantidad 
        })),
        subtotal: subtotal,
        descuento: descuento,
        monto_descuento: montoDescuento,
        total: total,
        tipo_pago: tipoPago,
        notas: notas,
        estado: tipoPago === 'credito' ? 'pendiente_pago' : 'pendiente',
        sincronizado: false,
        clienteNuevo: clienteActual.esTemporalNuevo ? {
            razon_social: clienteActual.razon_social,
            ruc: clienteActual.ruc,
            telefono: clienteActual.telefono,
            direccion: clienteActual.direccion,
            encargado: clienteActual.encargado,
            guardar: clienteActual.guardarEnSistema
        } : null
    };
    
    // Guardar localmente
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    pedidos.push(pedido);
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
    
    // Enviar a Google Sheets
    await enviarAGoogleSheets(pedido);
    
    // Preguntar si quiere compartir por WhatsApp
    if (confirm('¿Deseas compartir este pedido por WhatsApp?')) {
        compartirPorWhatsApp(pedido);
    }
    
    mostrarExito(`Pedido de ${clienteActual.nombre} guardado`);
    
    // Si era cliente temporal, mostrar mensaje
    if (clienteActual.esTemporalNuevo && clienteActual.guardarEnSistema) {
        setTimeout(() => {
            alert('💡 Cliente guardado temporalmente. El administrador puede agregarlo permanentemente desde el panel admin.');
        }, 1000);
    }
    
    // Limpiar
    carrito = [];
    descuentoAplicado = 0;
    document.getElementById('descuento').value = 0;
    document.getElementById('notasPedido').value = '';
    document.getElementById('tipoPago').value = 'contado';
    
    // Si era cliente temporal, limpiar selección
    if (clienteActual.esTemporalNuevo) {
        clienteActual = null;
        document.getElementById('clienteSelect').value = '';
    }
    
    actualizarCarrito();
    closeCartModal();
    mostrarProductos();
}

function compartirPorWhatsApp(pedido) {
    let mensaje = `*PEDIDO HDV DISTRIBUCIONES*\n\n`;
    mensaje += `📋 *Pedido #${pedido.id.slice(-6)}*\n`;
    mensaje += `📅 ${new Date(pedido.fecha).toLocaleString('es-PY')}\n`;
    mensaje += `👤 *Cliente:* ${pedido.cliente.nombre}\n`;
    mensaje += `📍 *Zona:* ${pedido.zona}\n`;
    mensaje += `👨‍💼 *Vendedor:* ${pedido.vendedor}\n\n`;
    
    mensaje += `*PRODUCTOS:*\n`;
    pedido.items.forEach(item => {
        mensaje += `• ${item.nombre} (${item.presentacion})\n`;
        mensaje += `  ${item.cantidad} × Gs. ${item.precio_unitario.toLocaleString()} = Gs. ${item.subtotal.toLocaleString()}\n`;
    });
    
    mensaje += `\n*TOTALES:*\n`;
    mensaje += `Subtotal: Gs. ${pedido.subtotal.toLocaleString()}\n`;
    if (pedido.descuento > 0) {
        mensaje += `Descuento (${pedido.descuento}%): -Gs. ${pedido.monto_descuento.toLocaleString()}\n`;
    }
    mensaje += `*TOTAL: Gs. ${pedido.total.toLocaleString()}*\n\n`;
    mensaje += `💰 *Tipo de pago:* ${pedido.tipo_pago === 'credito' ? 'CRÉDITO' : 'CONTADO'}\n`;
    
    if (pedido.notas) {
        mensaje += `\n📝 *Notas:* ${pedido.notas}`;
    }
    
    const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
}

async function enviarAGoogleSheets(pedido) {
    const SHEET_URL = 'https://script.google.com/macros/s/AKfycbxowigrfPMtoVhSDklxpeSoIfaYxV56oHKB7oZYTGoGrShubG4BiLsOYW9FF4-eLij3/exec';
    
    try {
        const response = await fetch(SHEET_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pedido)
        });
        
        // Marcar como sincronizado
        const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
        const pedidoLocal = pedidos.find(p => p.id === pedido.id);
        if (pedidoLocal) {
            pedidoLocal.sincronizado = true;
            localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
        }
        
        console.log('Pedido enviado a Google Sheets');
    } catch (error) {
        console.error('Error al enviar a Google Sheets:', error);
        // El pedido queda guardado localmente de todos modos
    }
}

function actualizarEstadoConexion() {
    const badge = document.getElementById('statusBadge');
    const pedidosPendientes = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]')
        .filter(p => !p.sincronizado).length;
    
    if (navigator.onLine) {
        badge.textContent = pedidosPendientes > 0 ? 
            `● En línea (${pedidosPendientes} pendiente${pedidosPendientes > 1 ? 's' : ''} de sync)` : 
            '● En línea';
        badge.className = 'status-badge online';
        
        // Intentar sincronizar pedidos pendientes
        if (pedidosPendientes > 0) {
            sincronizarPedidosPendientes();
        }
    } else {
        badge.textContent = pedidosPendientes > 0 ? 
            `● Sin conexión (${pedidosPendientes} guardado${pedidosPendientes > 1 ? 's' : ''})` : 
            '● Sin conexión';
        badge.className = 'status-badge offline';
    }
}

async function sincronizarPedidosPendientes() {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pendientes = pedidos.filter(p => !p.sincronizado);
    
    for (const pedido of pendientes) {
        try {
            await enviarAGoogleSheets(pedido);
            pedido.sincronizado = true;
        } catch (error) {
            console.log('Error sincronizando pedido:', pedido.id);
        }
    }
    
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
    actualizarEstadoConexion();
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
            const registration = await navigator.serviceWorker.register('service-worker.js');
            console.log('Service Worker registrado');
            
            // Detectar cuando hay una actualización disponible
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // Hay una nueva versión disponible
                        mostrarBotonActualizacion();
                    }
                });
            });
            
            // Revisar updates cada 30 segundos
            setInterval(() => {
                registration.update();
            }, 30000);
            
        } catch (e) {
            console.log('SW no disponible:', e);
        }
    }
}

function mostrarBotonActualizacion() {
    const btn = document.getElementById('updateButton');
    if (btn) {
        btn.style.display = 'block';
        // También mostrar notificación
        if (Notification.permission === 'granted') {
            new Notification('HDV Distribuciones', {
                body: '🔄 Nueva versión disponible. Haz click para actualizar.',
                icon: '/icon-192.png'
            });
        }
    }
}

function actualizarAhora() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
            if (reg && reg.waiting) {
                // Decirle al service worker que se active inmediatamente
                reg.waiting.postMessage('SKIP_WAITING');
            }
        });
        
        // Limpiar caché y recargar
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
            });
        }
        
        // Esperar un momento y recargar
        setTimeout(() => {
            window.location.reload(true);
        }, 500);
    }
}

// Detectar cuando el SW se activa y recargar
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });
}

// ============================================
// LISTA DE PRECIOS
// ============================================
let filtroCategoriaPrecio = 'todas';

function cambiarTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    if (tab === 'precios') {
        cargarListaPrecios();
    }
}

function cargarListaPrecios() {
    if (!productos || productos.length === 0) {
        document.getElementById('preciosContainer').innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div>Primero carga los productos</div>';
        return;
    }
    
    // Cargar filtros de categoría
    const container = document.getElementById('categoryFiltersPrecio');
    if (!container) return; // Protección adicional
    
    container.innerHTML = '';
    const btnTodas = document.createElement('button');
    btnTodas.className = 'category-btn active';
    btnTodas.textContent = 'Todas';
    btnTodas.onclick = (e) => {
        filtroCategoriaPrecio = 'todas';
        document.querySelectorAll('#categoryFiltersPrecio .category-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        mostrarListaPrecios();
    };
    container.appendChild(btnTodas);
    
    categorias.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-btn';
        btn.textContent = cat.nombre;
        btn.onclick = (e) => {
            filtroCategoriaPrecio = cat.id;
            document.querySelectorAll('#categoryFiltersPrecio .category-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            mostrarListaPrecios();
        };
        container.appendChild(btn);
    });
    
    // Búsqueda
    const searchInput = document.getElementById('searchPrecios');
    if (searchInput) {
        searchInput.oninput = (e) => {
            mostrarListaPrecios(e.target.value.toLowerCase());
        };
    }
    
    mostrarListaPrecios();
}

function mostrarListaPrecios(termino = '') {
    const container = document.getElementById('preciosContainer');
    let filtrados = productos;
    
    if (filtroCategoriaPrecio !== 'todas') {
        filtrados = filtrados.filter(p => p.categoria === filtroCategoriaPrecio);
    }
    
    if (termino) {
        filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(termino));
    }
    
    if (filtrados.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div>No se encontraron productos</div>';
        return;
    }
    
    container.innerHTML = '';
    
    filtrados.forEach(producto => {
        const div = document.createElement('div');
        div.className = 'precio-lista-item';
        
        const catNombre = categorias.find(c => c.id === producto.categoria)?.nombre || '';
        
        const presentacionesHTML = producto.presentaciones.map(pres => {
            let precio = pres.precio_base;
            
            // Si hay cliente seleccionado, mostrar su precio personalizado
            if (clienteActual && clienteActual.precios_personalizados && clienteActual.precios_personalizados[producto.id]) {
                const precioPersonalizado = clienteActual.precios_personalizados[producto.id].find(p => p.tamano === pres.tamano);
                if (precioPersonalizado) {
                    precio = precioPersonalizado.precio;
                }
            }
            
            return `
                <div class="precio-lista-presentacion">
                    <span class="precio-lista-tamano">${pres.tamano}</span>
                    <span class="precio-lista-precio">Gs. ${precio.toLocaleString()}</span>
                </div>
            `;
        }).join('');
        
        div.innerHTML = `
            <h3>${producto.nombre}</h3>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 10px;">${catNombre} › ${producto.subcategoria}</div>
            ${presentacionesHTML}
        `;
        
        container.appendChild(div);
    });
}

// ============================================
// FUNCIONES SIDEBAR VENDEDORES
// ============================================
function toggleVendorSidebar() {
    const sidebar = document.getElementById('vendorSidebar');
    sidebar.classList.toggle('open');
}

function cambiarVistaVendedor(vista) {
    // Remover active de todos los menu items
    document.querySelectorAll('.vendor-menu-item').forEach(item => item.classList.remove('active'));
    
    // Agregar active al item clickeado
    event.target.closest('.vendor-menu-item')?.classList.add('active');
    
    // Cambiar contenido
    document.querySelectorAll('.vendor-view').forEach(v => v.classList.remove('active'));
    const vistaElement = document.getElementById(`vista-${vista}`);
    if (vistaElement) {
        vistaElement.classList.add('active');
    }
    
    // Ejecutar funciones específicas según vista
    if (vista === 'precios') {
        cargarListaPrecios();
    }
    if (vista === 'pedidos') {
        cargarPedidosOffline();
    }
    
    // Cerrar sidebar en móvil
    if (window.innerWidth < 768) {
        document.getElementById('vendorSidebar').classList.remove('open');
    }
}

// Mostrar nombre del vendedor en sidebar
function mostrarNombreVendedorSidebar() {
    const nombre = localStorage.getItem('vendedor_nombre');
    const display = document.getElementById('vendorNameDisplay');
    if (display && nombre) {
        display.textContent = `👤 ${nombre}`;
    }
}

// Llamar al cargar
window.addEventListener('load', mostrarNombreVendedorSidebar);
