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
    renderDashboard();
    // Ocultar barra del carrito en el dashboard
    const cartBar = document.getElementById('cartSummaryBar');
    if (cartBar) cartBar.style.display = 'none';
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

function mostrarUltimoPedidoCliente(clienteId) {
    const banner = document.getElementById('ultimoPedidoBanner');
    if (!banner) return;
    
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedidosCliente = pedidos.filter(p => p.cliente?.id === clienteId);
    
    if (pedidosCliente.length === 0) {
        banner.style.display = 'none';
        return;
    }
    
    const ultimo = pedidosCliente[pedidosCliente.length - 1];
    const fecha = new Date(ultimo.fecha).toLocaleDateString('es-PY');
    const itemsResumen = ultimo.items.slice(0, 3).map(i => `${i.nombre} (${i.cantidad})`).join(', ');
    const masItems = ultimo.items.length > 3 ? ` +${ultimo.items.length - 3} más` : '';
    
    banner.innerHTML = `📦 <strong>Último pedido (${fecha}):</strong> ${itemsResumen}${masItems} — <strong>Gs. ${(ultimo.total || 0).toLocaleString()}</strong> <span style="float:right;font-size:12px;">Tocar para repetir →</span>`;
    banner.style.display = 'block';
    
    banner.onclick = () => {
        if (!confirm(`¿Repetir el pedido del ${fecha}?\n\nSe agregarán ${ultimo.items.length} productos al carrito.`)) return;
        
        carrito = [];
        ultimo.items.forEach(item => {
            const producto = productos.find(p => p.nombre === item.nombre);
            if (producto) {
                const pres = producto.presentaciones.find(pr => pr.tamano === item.presentacion);
                if (pres) {
                    carrito.push({
                        productoId: producto.id,
                        nombre: producto.nombre,
                        presentacion: pres.tamano,
                        precio: obtenerPrecio(producto.id, pres),
                        cantidad: item.cantidad
                    });
                }
            }
        });
        actualizarCarrito();
        mostrarProductos();
        mostrarExito(`Pedido repetido: ${carrito.length} productos agregados`);
    };
}

function verificarVendedor() {
    const vendedor = localStorage.getItem('vendedor_nombre');
    if (!vendedor) {
        // Mostrar modal de login en vez de prompt recursivo
        mostrarLoginVendedor();
    }
}

function mostrarLoginVendedor() {
    // Crear modal de login si no existe
    if (!document.getElementById('loginVendedorModal')) {
        const modal = document.createElement('div');
        modal.id = 'loginVendedorModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = `
            <div style="background:white;border-radius:16px;padding:30px;max-width:400px;width:90%;text-align:center;">
                <div style="font-size:48px;margin-bottom:15px;">🚚</div>
                <h2 style="margin-bottom:5px;color:#111827;">HDV Distribuciones</h2>
                <p style="color:#6b7280;margin-bottom:20px;">Ingresá tu nombre para comenzar</p>
                <input type="text" id="loginVendedorInput" placeholder="Ej: Juan Pérez" 
                    style="width:100%;padding:14px;border:2px solid #e5e7eb;border-radius:10px;font-size:16px;text-align:center;margin-bottom:15px;"
                    onkeydown="if(event.key==='Enter')confirmarLoginVendedor()">
                <button onclick="confirmarLoginVendedor()" 
                    style="width:100%;padding:14px;background:#2563eb;color:white;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;">
                    Ingresar
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        // Focus automático
        setTimeout(() => document.getElementById('loginVendedorInput')?.focus(), 100);
    }
}

function confirmarLoginVendedor() {
    const input = document.getElementById('loginVendedorInput');
    const nombre = input?.value?.trim();
    if (!nombre) {
        input.style.borderColor = '#ef4444';
        input.placeholder = 'Debes ingresar tu nombre';
        return;
    }
    localStorage.setItem('vendedor_nombre', nombre);
    document.getElementById('loginVendedorModal')?.remove();
    mostrarNombreVendedorSidebar();
}

async function cargarDatos() {
    try {
        const response = await fetch('productos.json');
        const data = await response.json();
        productos = data.productos;
        clientes = data.clientes;
        categorias = data.categorias;
        
        // Guardar timestamp de última actualización
        localStorage.setItem('hdv_ultima_carga', new Date().toISOString());
        
        cargarClientes();
        cargarCategorias();
        mostrarProductos();
        actualizarIndicadorDatos();
    } catch (error) {
        document.getElementById('productsContainer').innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div>Error al cargar los datos</div>';
        actualizarIndicadorDatos();
    }
}

function actualizarIndicadorDatos() {
    const ultimaCarga = localStorage.getItem('hdv_ultima_carga');
    const dataInfo = document.getElementById('dataFreshness');
    if (!dataInfo) return;
    
    if (ultimaCarga) {
        const ahora = new Date();
        const carga = new Date(ultimaCarga);
        const diffMs = ahora - carga;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHrs = Math.floor(diffMin / 60);
        const diffDias = Math.floor(diffHrs / 24);
        
        let texto = '';
        if (diffMin < 1) texto = 'ahora';
        else if (diffMin < 60) texto = `hace ${diffMin}min`;
        else if (diffHrs < 24) texto = `hace ${diffHrs}h`;
        else texto = `hace ${diffDias}d`;
        
        dataInfo.textContent = `📊 ${texto}`;
        dataInfo.style.color = diffHrs >= 24 ? '#fbbf24' : '';
        if (diffHrs >= 24) dataInfo.textContent += ' ⚠️';
    }
}

function cargarClientes() {
    const select = document.getElementById('clienteSelect');
    select.style.display = 'none'; // Ocultar select original
    
    const container = select.parentElement;
    
    // Evitar crear duplicados si se llama múltiples veces
    if (document.getElementById('clienteSearch')) return;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'clienteSearch';
    input.className = 'search-input';
    input.placeholder = '🔍 Buscar cliente por nombre, RUC o dirección...';
    input.setAttribute('list', 'clientesDatalist');
    input.setAttribute('autocomplete', 'off');
    input.style.cssText = 'width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 16px;';
    
    const datalist = document.createElement('datalist');
    datalist.id = 'clientesDatalist';
    
    const clientesVisibles = clientes.filter(c => !c.oculto);
    
    clientesVisibles.forEach(c => {
        const option = document.createElement('option');
        const razonSocial = c.razon_social || c.nombre;
        const direccion = c.direccion || c.zona || '';
        const ruc = c.ruc ? ` - RUC: ${c.ruc}` : '';
        option.value = `${razonSocial}${ruc} — ${direccion}`;
        option.dataset.id = c.id;
        datalist.appendChild(option);
    });
    
    container.appendChild(input);
    container.appendChild(datalist);
    
    // Indicador visual de cliente seleccionado
    const badge = document.createElement('div');
    badge.id = 'clienteSeleccionadoBadge';
    badge.style.cssText = 'display:none;margin-top:8px;padding:8px 12px;background:#dcfce7;border:1px solid #86efac;border-radius:8px;font-size:14px;color:#166534;';
    container.appendChild(badge);
    
    // Indicador de último pedido del cliente
    const ultimoPedidoBanner = document.createElement('div');
    ultimoPedidoBanner.id = 'ultimoPedidoBanner';
    ultimoPedidoBanner.style.cssText = 'display:none;margin-top:8px;padding:10px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:13px;color:#1e40af;cursor:pointer;';
    container.appendChild(ultimoPedidoBanner);
    
    // Evento de búsqueda mejorado
    input.addEventListener('input', (e) => {
        const texto = e.target.value.toLowerCase().trim();
        if (!texto) {
            clienteActual = null;
            badge.style.display = 'none';
            document.getElementById('searchInput').disabled = true;
            return;
        }
        
        // Buscar match en clientes visibles
        const cliente = clientesVisibles.find(c => {
            const razonSocial = (c.razon_social || c.nombre || '').toLowerCase();
            const direccion = (c.direccion || c.zona || '').toLowerCase();
            const ruc = (c.ruc || '').toLowerCase();
            const valorCompleto = `${razonSocial}${ruc ? ` - ruc: ${ruc}` : ''} — ${direccion}`;
            return valorCompleto === texto || razonSocial === texto;
        });
        
        if (cliente) {
            // Si hay carrito con items y se cambia de cliente, confirmar
            if (carrito.length > 0 && clienteActual && clienteActual.id !== cliente.id) {
                if (!confirm(`⚠️ Tenés ${carrito.length} producto(s) en el pedido actual.\n\n¿Cambiar de cliente y vaciar el carrito?`)) {
                    // Restaurar texto del input al cliente anterior
                    const razon = clienteActual.razon_social || clienteActual.nombre;
                    input.value = razon;
                    return;
                }
            }
            clienteActual = cliente;
            document.getElementById('searchInput').disabled = false;
            badge.innerHTML = `✅ <strong>${cliente.razon_social || cliente.nombre}</strong>`;
            badge.style.display = 'block';
            input.style.borderColor = '#22c55e';
            carrito = [];
            actualizarCarrito();
            mostrarProductos();
            mostrarUltimoPedidoCliente(cliente.id);
            renderClienteSummary(cliente.id);
        } else {
            badge.style.display = 'none';
            input.style.borderColor = '#e5e7eb';
            renderClienteSummary(null);
        }
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
    document.getElementById('searchInput').addEventListener('input', (e) => {
        mostrarProductos(e.target.value.toLowerCase());
    });
    document.getElementById('viewCartBtn').addEventListener('click', mostrarModalCarrito);
    
    const searchPrecios = document.getElementById('searchPrecios');
    if (searchPrecios) {
        searchPrecios.addEventListener('input', (e) => {
            mostrarListaPrecios(e.target.value.toLowerCase());
        });
    }
    
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
    let filtrados = productos.filter(p => !p.oculto);
    if (filtroCategoria !== 'todas') filtrados = filtrados.filter(p => p.categoria === filtroCategoria);
    if (termino) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(termino));
    
    const countEl = document.getElementById('productCount');
    if (countEl) countEl.textContent = `${filtrados.length} producto${filtrados.length !== 1 ? 's' : ''}`;
    
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
    document.querySelectorAll('.view-toggle button').forEach(b => {
        if ((vista === 'lista' && b.textContent.includes('Lista')) || 
            (vista === 'cuadricula' && (b.textContent.includes('Grid') || b.textContent.includes('Cuadrícula')))) {
            b.classList.add('active');
        }
    });
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
    
    // Flash visual en modal
    const detailContent = document.querySelector('.product-detail-content');
    if (detailContent) {
        detailContent.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.5)';
        setTimeout(() => detailContent.style.boxShadow = '', 500);
    }
    
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
                <input type="number" class="quantity-display" id="qty-${producto.id}" value="1" min="1" style="border:2px solid #e5e7eb;border-radius:6px;text-align:center;width:50px;" onchange="actualizarCantidadDirecta('${producto.id}', this.value)">
                <button class="quantity-btn" onclick="cambiarCantidad('${producto.id}', 1)">+</button>
            </div>
        </div>
    `;

    const variantsContainer = card.querySelector(`#variants-${producto.id}`);
    producto.presentaciones.forEach((pres, i) => {
        const precio = obtenerPrecio(producto.id, pres);
        const inCart = carrito.some(item => item.productoId === producto.id && item.presentacion === pres.tamano);
        const chip = document.createElement('button');
        chip.className = 'variant-chip' + (inCart ? ' in-cart' : '');
        chip.innerHTML = `<span class="v-size">${pres.tamano}</span><span class="v-price">${precio > 0 ? 'Gs. ' + precio.toLocaleString() : 'S/P'}</span>`;
        chip.onclick = () => seleccionarVariante(producto, i);
        variantsContainer.appendChild(chip);
    });

    return card;
}

function seleccionarVariante(producto, index) {
    const pres = producto.presentaciones[index];
    const precio = obtenerPrecio(producto.id, pres);
    const sel = document.getElementById(`selected-${producto.id}`);
    
    const idx = carrito.findIndex(i => i.productoId === producto.id && i.presentacion === pres.tamano);
    
    if (idx < 0) {
        carrito.push({ productoId: producto.id, nombre: producto.nombre, presentacion: pres.tamano, precio, cantidad: 1 });
        document.getElementById(`qty-${producto.id}`).value = 1;
        mostrarExito(`${producto.nombre} (${pres.tamano}) agregado`);
        const card = document.getElementById(`product-${producto.id}`);
        if (card) { card.classList.add('added'); setTimeout(() => card.classList.remove('added'), 500); }
    }
    
    sel.classList.add('show');
    document.getElementById(`sel-variant-${producto.id}`).textContent = pres.tamano;
    document.getElementById(`sel-price-${producto.id}`).textContent = precio > 0 ? `Gs. ${precio.toLocaleString()}` : 'Sin precio';
    
    if (idx >= 0) {
        document.getElementById(`qty-${producto.id}`).value = carrito[idx].cantidad;
    }
    
    // Refresh chip states
    const chips = document.querySelectorAll(`#variants-${producto.id} .variant-chip`);
    chips.forEach((chip, i) => {
        const p = producto.presentaciones[i];
        const isInCart = carrito.some(item => item.productoId === producto.id && item.presentacion === p.tamano);
        chip.classList.toggle('in-cart', isInCart);
    });
    
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
    
    const btn = document.getElementById('viewCartBtn');
    btn.disabled = cantidad === 0;
    
    // Badge animado
    let badge = btn.querySelector('.cart-badge');
    if (cantidad > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'cart-badge';
            btn.appendChild(badge);
        }
        badge.textContent = cantidad;
        badge.classList.remove('pulse');
        void badge.offsetWidth; // Force reflow
        badge.classList.add('pulse');
        btn.textContent = 'Ver Pedido ';
        btn.appendChild(badge);
    } else if (badge) {
        badge.remove();
        btn.textContent = 'Ver Pedido';
    }
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
                    <div style="margin-top:6px;">
                        <input type="text" id="nota-item-${index}" value="${item.nota || ''}" placeholder="📝 Nota (ej: entregar martes)" 
                            onchange="actualizarNotaItem(${index}, this.value)"
                            style="width:100%;padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;color:#6b7280;">
                    </div>
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
const DESCUENTO_MAX = 50; // Máximo permitido
const DESCUENTO_ALERTA = 15; // Pedir confirmación si supera esto

function aplicarDescuento() {
    let valor = parseFloat(document.getElementById('descuento').value) || 0;
    if (valor < 0) valor = 0;
    
    if (valor > DESCUENTO_MAX) {
        alert(`⚠️ El descuento máximo permitido es ${DESCUENTO_MAX}%`);
        valor = DESCUENTO_MAX;
        document.getElementById('descuento').value = valor;
    } else if (valor > DESCUENTO_ALERTA) {
        if (!confirm(`⚠️ Estás aplicando un descuento de ${valor}%. ¿Confirmar?`)) {
            return;
        }
    }
    
    descuentoAplicado = valor;
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

function actualizarNotaItem(index, nota) {
    if (carrito[index]) {
        carrito[index].nota = nota.trim();
    }
}

function closeCartModal() {
    document.getElementById('cartModal').classList.remove('show');
}

async function confirmarPedido() {
    try {
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
        await procesarPedido();
    } catch (error) {
        console.error('Error al confirmar pedido:', error);
        alert('Ocurrió un error al procesar el pedido. El pedido fue guardado localmente.');
    }
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
    
    // Validación de campos obligatorios
    let errores = [];
    if (!razonSocial) errores.push('Razón Social es obligatorio');
    if (!ruc) {
        errores.push('RUC es obligatorio');
    } else if (!/^\d{1,8}-?\d{1}$/.test(ruc.replace(/\./g, ''))) {
        errores.push('RUC inválido (formato: 12345678-9 o 1234567-8)');
    }
    if (!telefono) {
        errores.push('Teléfono es obligatorio');
    } else if (!/^0\d{9,10}$/.test(telefono.replace(/[\s\-]/g, ''))) {
        errores.push('Teléfono inválido (formato: 0981234567)');
    }
    if (!direccion) errores.push('Dirección es obligatoria');
    
    if (errores.length > 0) {
        alert('⚠️ Por favor corrige:\n\n• ' + errores.join('\n• '));
        // Marcar campos con error
        if (!razonSocial) document.getElementById('clienteRapidoRazon').style.borderColor = '#ef4444';
        if (!ruc || !/^\d{1,8}-?\d{1}$/.test(ruc.replace(/\./g, ''))) document.getElementById('clienteRapidoRUC').style.borderColor = '#ef4444';
        if (!telefono || !/^0\d{9,10}$/.test(telefono.replace(/[\s\-]/g, ''))) document.getElementById('clienteRapidoTelefono').style.borderColor = '#ef4444';
        if (!direccion) document.getElementById('clienteRapidoDireccion').style.borderColor = '#ef4444';
        return;
    }
    
    // Resetear bordes
    ['clienteRapidoRazon','clienteRapidoRUC','clienteRapidoTelefono','clienteRapidoDireccion'].forEach(id => {
        document.getElementById(id).style.borderColor = '#e5e7eb';
    });
    
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
    try {
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
            subtotal: i.precio * i.cantidad,
            nota: i.nota || ''
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
    } catch (error) {
        console.error('Error al procesar pedido:', error);
        alert('Error al procesar el pedido. Se guardó localmente.');
    }
}

function compartirPorWhatsApp(pedido) {
    let mensaje = `*PEDIDO HDV DISTRIBUCIONES*\n\n`;
    mensaje += `📋 *Pedido #${pedido.id.slice(-6)}*\n`;
    mensaje += `📅 ${new Date(pedido.fecha).toLocaleString('es-PY')}\n`;
    mensaje += `👤 *Cliente:* ${pedido.cliente.nombre}\n`;
    if (pedido.cliente.ruc) mensaje += `🆔 *RUC:* ${pedido.cliente.ruc}\n`;
    mensaje += `📍 *Zona:* ${pedido.zona}\n`;
    mensaje += `👨‍💼 *Vendedor:* ${pedido.vendedor}\n\n`;
    
    mensaje += `*PRODUCTOS:*\n`;
    pedido.items.forEach(item => {
        mensaje += `• ${item.nombre} (${item.presentacion})\n`;
        mensaje += `  ${item.cantidad} × Gs. ${item.precio_unitario.toLocaleString()} = Gs. ${item.subtotal.toLocaleString()}\n`;
        if (item.nota) mensaje += `  📝 _${item.nota}_\n`;
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
    
    const encoded = encodeURIComponent(mensaje);
    
    // Número del admin guardado o pedir
    const numAdmin = localStorage.getItem('hdv_numero_admin') || '';
    const numCliente = pedido.cliente.telefono || '';
    
    // Mostrar opciones de envío
    const destino = numAdmin || numCliente ? 
        prompt(`¿A quién enviar?\n\n1) Admin: ${numAdmin || '(no configurado)'}\n2) Cliente: ${numCliente || '(sin teléfono)'}\n3) Elegir otro número\n\nEscribe 1, 2, 3 o un número de teléfono:`, '1') 
        : prompt('Número de WhatsApp (con código de país, ej: 595981234567):', '595');
    
    if (!destino) return;
    
    let numero = '';
    if (destino === '1' && numAdmin) numero = numAdmin;
    else if (destino === '2' && numCliente) numero = numCliente.replace(/\D/g, '');
    else if (destino === '3' || (!numAdmin && !numCliente)) {
        numero = prompt('Número de WhatsApp (con código de país):', '595') || '';
    } else {
        numero = destino.replace(/\D/g, '');
    }
    
    // Guardar número admin si es primera vez
    if (!numAdmin && numero) {
        if (confirm('¿Guardar este número como el del administrador para futuros envíos?')) {
            localStorage.setItem('hdv_numero_admin', numero);
        }
    }
    
    const url = numero ? 
        `https://wa.me/${numero}?text=${encoded}` : 
        `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
}

async function enviarAGoogleSheets(pedido) {
    const SHEET_URL = 'https://script.google.com/macros/s/AKfycbxowigrfPMtoVhSDklxpeSoIfaYxV56oHKB7oZYTGoGrShubG4BiLsOYW9FF4-eLij3/exec';
    
    if (!navigator.onLine) {
        console.log('Sin conexión - pedido queda pendiente de sync');
        return false;
    }
    
    try {
        await fetch(SHEET_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pedido)
        });
        
        // Con no-cors no podemos verificar la respuesta real,
        // pero si no hubo error de red, marcamos como enviado
        const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
        const pedidoLocal = pedidos.find(p => p.id === pedido.id);
        if (pedidoLocal) {
            pedidoLocal.sincronizado = true;
            pedidoLocal.fecha_sync = new Date().toISOString();
            localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
        }
        
        console.log('Pedido enviado a Google Sheets');
        return true;
    } catch (error) {
        console.error('Error al enviar a Google Sheets:', error);
        // No marcar como sincronizado - queda pendiente
        return false;
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
    
    actualizarIndicadorDatos();
}

let sincronizando = false;

async function sincronizarPedidosPendientes() {
    if (sincronizando) return; // Evitar llamadas simultáneas
    sincronizando = true;
    
    try {
        const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
        const pendientes = pedidos.filter(p => !p.sincronizado);
        
        for (const pedido of pendientes) {
            try {
                await enviarAGoogleSheets(pedido);
            } catch (error) {
                console.log('Error sincronizando pedido:', pedido.id);
            }
        }
        
        // Actualizar badge SIN disparar otra sincronización
        actualizarBadgeConexion();
    } finally {
        sincronizando = false;
    }
}

// Función separada para solo actualizar el badge visual
function actualizarBadgeConexion() {
    const badge = document.getElementById('statusBadge');
    const pedidosPendientes = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]')
        .filter(p => !p.sincronizado).length;
    
    if (navigator.onLine) {
        badge.textContent = pedidosPendientes > 0 ? 
            `● En línea (${pedidosPendientes} pendiente${pedidosPendientes > 1 ? 's' : ''})` : 
            '● En línea';
        badge.className = 'status-badge online';
    } else {
        badge.textContent = pedidosPendientes > 0 ? 
            `● Sin conexión (${pedidosPendientes} guardado${pedidosPendientes > 1 ? 's' : ''})` : 
            '● Sin conexión';
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
            const registration = await navigator.serviceWorker.register('service-worker.js');
            console.log('Service Worker registrado');
            
            // Auto-update: cuando hay nueva versión, activarla automáticamente
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // Activar inmediatamente sin preguntar
                        newWorker.postMessage('SKIP_WAITING');
                        mostrarExito('🔄 Actualizando app...');
                    }
                });
            });
            
            // Revisar updates cada 60 segundos
            setInterval(() => registration.update(), 60000);
            
        } catch (e) {
            console.log('SW no disponible:', e);
        }
    }
}

// Recargar automáticamente cuando el nuevo SW toma control
if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });
}

// ============================================
// LISTA DE PRECIOS
// ============================================
let filtroCategoriaPrecio = 'todas';

function cambiarTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    document.querySelectorAll('.tab').forEach(t => {
        if ((tab === 'dashboard' && t.textContent.includes('Inicio')) ||
            (tab === 'pedidos' && t.textContent.includes('Pedido')) || 
            (tab === 'precios' && t.textContent.includes('Precios')) ||
            (tab === 'historial' && t.textContent.includes('Historial'))) {
            t.classList.add('active');
        }
    });
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    // Mostrar/ocultar barra del carrito según el tab
    const cartBar = document.getElementById('cartSummaryBar');
    if (cartBar) cartBar.style.display = (tab === 'pedidos') ? 'flex' : 'none';
    
    if (tab === 'precios') cargarListaPrecios();
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'historial') renderHistorial();
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
    let filtrados = productos.filter(p => !p.oculto);
    
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
    
    let rows = '';
    filtrados.forEach(producto => {
        const catNombre = categorias.find(c => c.id === producto.categoria)?.nombre || '';
        producto.presentaciones.forEach((pres, i) => {
            let precio = pres.precio_base;
            let esPersonalizado = false;
            if (clienteActual && clienteActual.precios_personalizados && clienteActual.precios_personalizados[producto.id]) {
                const pp = clienteActual.precios_personalizados[producto.id].find(p => p.tamano === pres.tamano);
                if (pp) { precio = pp.precio; esPersonalizado = true; }
            }
            rows += `<tr>
                ${i === 0 ? `<td rowspan="${producto.presentaciones.length}"><div class="pn">${producto.nombre}</div><div class="pc">${catNombre}</div></td>` : ''}
                <td>${pres.tamano}</td>
                <td class="pp">${esPersonalizado ? '⭐ ' : ''}Gs. ${precio.toLocaleString()}</td>
            </tr>`;
        });
    });
    
    container.innerHTML = `
        <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">${filtrados.length} productos</div>
        <table class="precio-tabla">
            <thead><tr><th>Producto</th><th>Presentación</th><th style="text-align:right;">Precio</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

// ============================================
// DASHBOARD DEL VENDEDOR
// ============================================
function renderDashboard() {
    const container = document.getElementById('dashboardContent');
    if (!container) return;
    
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const vendedor = localStorage.getItem('vendedor_nombre') || 'Vendedor';
    const hoy = new Date().toDateString();
    
    const pedidosHoy = pedidos.filter(p => new Date(p.fecha).toDateString() === hoy);
    const montoHoy = pedidosHoy.reduce((s, p) => s + (p.total || 0), 0);
    const clientesHoy = new Set(pedidosHoy.map(p => p.cliente?.nombre)).size;
    const pendientes = pedidos.filter(p => !p.sincronizado).length;
    
    // Semana
    const inicioSemana = new Date();
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
    const pedidosSemana = pedidos.filter(p => new Date(p.fecha) >= inicioSemana);
    const montoSemana = pedidosSemana.reduce((s, p) => s + (p.total || 0), 0);
    
    // Últimos pedidos
    const ultimos = [...pedidos].reverse().slice(0, 5);
    
    let recentHTML = '';
    if (ultimos.length > 0) {
        recentHTML = ultimos.map(p => {
            const fecha = new Date(p.fecha);
            const esHoy = fecha.toDateString() === hoy;
            const fechaStr = esHoy ? fecha.toLocaleTimeString('es-PY', {hour: '2-digit', minute: '2-digit'}) : fecha.toLocaleDateString('es-PY');
            return `<div class="dash-recent-item" onclick="verDetallePedido('${p.id}')" style="cursor:pointer;">
                <div>
                    <div style="font-weight:600;font-size:14px;">👤 ${p.cliente?.nombre || 'Sin cliente'}</div>
                    <div style="font-size:12px;color:#6b7280;">${esHoy ? 'Hoy ' : ''}${fechaStr} · ${p.items?.length || 0} items</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:700;color:#2563eb;">Gs. ${(p.total || 0).toLocaleString()}</div>
                    <span class="pedido-badge ${p.sincronizado ? 'sync' : 'pending'}">${p.sincronizado ? '✅' : '⏳'}</span>
                </div>
            </div>`;
        }).join('');
    } else {
        recentHTML = '<div style="text-align:center;padding:20px;color:#6b7280;">Aún no hay pedidos</div>';
    }
    
    container.innerHTML = `
        <div style="margin-bottom:15px;">
            <div style="font-size:16px;font-weight:700;">👋 Hola, ${vendedor}</div>
            <div style="font-size:13px;color:#6b7280;">${new Date().toLocaleDateString('es-PY', {weekday: 'long', day: 'numeric', month: 'long'})}</div>
        </div>
        
        <div class="dash-grid">
            <div class="dash-card blue">
                <div class="dash-icon">📦</div>
                <div class="dash-value">${pedidosHoy.length}</div>
                <div class="dash-label">Pedidos hoy</div>
            </div>
            <div class="dash-card green">
                <div class="dash-icon">💰</div>
                <div class="dash-value">Gs. ${montoHoy > 999999 ? (montoHoy/1000000).toFixed(1)+'M' : montoHoy.toLocaleString()}</div>
                <div class="dash-label">Venta del día</div>
            </div>
            <div class="dash-card orange">
                <div class="dash-icon">👥</div>
                <div class="dash-value">${clientesHoy}</div>
                <div class="dash-label">Clientes hoy</div>
            </div>
            <div class="dash-card red">
                <div class="dash-icon">⏳</div>
                <div class="dash-value">${pendientes}</div>
                <div class="dash-label">Pendientes sync</div>
            </div>
        </div>
        
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                <span style="font-weight:700;font-size:14px;">📊 Esta semana</span>
                <span style="font-size:13px;color:#6b7280;">${pedidosSemana.length} pedidos</span>
            </div>
            <div style="font-size:20px;font-weight:700;color:#10b981;">Gs. ${montoSemana.toLocaleString()}</div>
        </div>
        
        <div style="font-size:15px;font-weight:700;margin:15px 0 10px;">📋 Últimos pedidos</div>
        <div class="card" style="padding:5px 15px;">${recentHTML}</div>
        
        <button onclick="cambiarTab('pedidos')" style="width:100%;padding:14px;margin-top:15px;background:#2563eb;color:white;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;">
            ➕ Nuevo Pedido
        </button>
    `;
}

// ============================================
// RESUMEN POR CLIENTE
// ============================================
function renderClienteSummary(clienteId) {
    const container = document.getElementById('clienteSummary');
    if (!container) return;
    
    if (!clienteId) {
        container.style.display = 'none';
        return;
    }
    
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedidosCliente = pedidos.filter(p => p.cliente?.id === clienteId);
    
    if (pedidosCliente.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    const totalCompras = pedidosCliente.reduce((s, p) => s + (p.total || 0), 0);
    const pedidosCredito = pedidosCliente.filter(p => p.tipo_pago === 'credito');
    const montoCredito = pedidosCredito.reduce((s, p) => s + (p.total || 0), 0);
    
    // Productos favoritos
    const productoCount = {};
    pedidosCliente.forEach(p => {
        (p.items || []).forEach(item => {
            productoCount[item.nombre] = (productoCount[item.nombre] || 0) + item.cantidad;
        });
    });
    const topProductos = Object.entries(productoCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topHTML = topProductos.map(([nombre, qty]) => `${nombre} (${qty})`).join(', ');
    
    const ultimaCompra = new Date(pedidosCliente[pedidosCliente.length - 1].fecha).toLocaleDateString('es-PY');
    
    container.style.display = 'block';
    container.innerHTML = `
        <div class="client-summary">
            <div style="font-weight:700;font-size:14px;margin-bottom:2px;">📊 Resumen del cliente</div>
            <div class="client-summary-grid">
                <div class="client-stat">
                    <div class="client-stat-value">${pedidosCliente.length}</div>
                    <div class="client-stat-label">Pedidos</div>
                </div>
                <div class="client-stat">
                    <div class="client-stat-value">Gs. ${totalCompras > 999999 ? (totalCompras/1000000).toFixed(1)+'M' : totalCompras.toLocaleString()}</div>
                    <div class="client-stat-label">Total compras</div>
                </div>
                <div class="client-stat">
                    <div class="client-stat-value" style="color:${montoCredito > 0 ? '#f59e0b' : '#10b981'}">Gs. ${montoCredito.toLocaleString()}</div>
                    <div class="client-stat-label">En crédito</div>
                </div>
            </div>
            ${topHTML ? `<div style="font-size:12px;color:#6b7280;margin-top:10px;">⭐ Más pedidos: ${topHTML}</div>` : ''}
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">📅 Última compra: ${ultimaCompra}</div>
        </div>
    `;
}

// ============================================
// HISTORIAL DE PEDIDOS
// ============================================
function renderHistorial() {
    const container = document.getElementById('historialContent');
    if (!container) return;
    
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    
    if (pedidos.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div>No hay pedidos guardados</div>';
        return;
    }
    
    const pedidosOrdenados = [...pedidos].reverse();
    
    container.innerHTML = `<div style="font-size:13px;color:#6b7280;margin-bottom:10px;">${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''} en total</div>`;
    
    pedidosOrdenados.forEach(pedido => {
        const fecha = new Date(pedido.fecha);
        const esHoy = fecha.toDateString() === new Date().toDateString();
        const fechaStr = esHoy ? 'Hoy ' + fecha.toLocaleTimeString('es-PY', {hour:'2-digit', minute:'2-digit'}) : fecha.toLocaleDateString('es-PY');
        
        const div = document.createElement('div');
        div.className = 'pedido-card';
        div.onclick = () => verDetallePedido(pedido.id);
        div.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <strong style="font-size:14px;">#${pedido.id.slice(-6)}</strong>
                <span class="pedido-badge ${pedido.sincronizado ? 'sync' : 'pending'}">${pedido.sincronizado ? '✅ Sincronizado' : '⏳ Pendiente'}</span>
            </div>
            <div style="font-size:13px;color:#6b7280;">📅 ${fechaStr}</div>
            <div style="font-size:14px;margin-top:4px;">👤 ${pedido.cliente?.nombre || 'Sin cliente'}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
                <span style="font-size:17px;font-weight:700;color:#2563eb;">Gs. ${(pedido.total || 0).toLocaleString()}</span>
                <span style="font-size:12px;color:#6b7280;">${pedido.items?.length || 0} items · ${pedido.tipo_pago === 'credito' ? 'Crédito' : 'Contado'}</span>
            </div>
        `;
        container.appendChild(div);
    });
}

// ============================================
// DETALLE DE PEDIDO
// ============================================
function verDetallePedido(pedidoId) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    
    const fecha = new Date(pedido.fecha).toLocaleString('es-PY');
    const content = document.getElementById('detallePedidoContent');
    const header = document.getElementById('detallePedidoHeader');
    const actions = document.getElementById('detallePedidoActions');
    
    header.textContent = `Pedido #${pedido.id.slice(-6)}`;
    
    const itemsHTML = (pedido.items || []).map(item => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;">
            <div>
                <div style="font-weight:600;">${item.nombre}</div>
                <div style="font-size:12px;color:#6b7280;">${item.presentacion} × ${item.cantidad}</div>
                ${item.nota ? `<div style="font-size:12px;color:#f59e0b;">📝 ${item.nota}</div>` : ''}
            </div>
            <div style="font-weight:600;color:#2563eb;">Gs. ${(item.subtotal || item.precio_unitario * item.cantidad).toLocaleString()}</div>
        </div>
    `).join('');
    
    content.innerHTML = `
        <div style="font-size:13px;color:#6b7280;margin-bottom:12px;">
            📅 ${fecha}<br>
            👤 ${pedido.cliente?.nombre || 'Sin cliente'}<br>
            👨‍💼 ${pedido.vendedor || 'N/A'}<br>
            💰 ${pedido.tipo_pago === 'credito' ? 'Crédito' : 'Contado'}
            ${pedido.notas ? `<br>📝 ${pedido.notas}` : ''}
        </div>
        ${itemsHTML}
        <div style="margin-top:12px;padding-top:12px;border-top:2px solid #e5e7eb;">
            ${pedido.descuento > 0 ? `<div style="display:flex;justify-content:space-between;font-size:14px;"><span>Subtotal</span><span>Gs. ${(pedido.subtotal || 0).toLocaleString()}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:14px;color:#ef4444;"><span>Descuento (${pedido.descuento}%)</span><span>-Gs. ${(pedido.monto_descuento || 0).toLocaleString()}</span></div>` : ''}
            <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700;color:#2563eb;margin-top:8px;">
                <span>TOTAL</span><span>Gs. ${(pedido.total || 0).toLocaleString()}</span>
            </div>
        </div>
    `;
    
    actions.innerHTML = `
        <button class="modal-btn btn-cancel" onclick="document.getElementById('detallePedidoModal').classList.remove('show')">Cerrar</button>
        <button class="modal-btn" style="background:#25d366;color:white;" onclick="compartirPorWhatsApp(JSON.parse(localStorage.getItem('hdv_pedidos')||'[]').find(p=>p.id==='${pedido.id}'))">📱 WhatsApp</button>
        <button class="modal-btn" style="background:#ef4444;color:white;" onclick="exportarPedidoPDF('${pedido.id}')">📄 PDF</button>
    `;
    
    document.getElementById('detallePedidoModal').classList.add('show');
}

// ============================================
// EXPORTAR PEDIDO A PDF
// ============================================
function exportarPedidoPDF(pedidoId) {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    
    const fecha = new Date(pedido.fecha).toLocaleString('es-PY');
    
    // Generar HTML para el PDF
    let itemsRows = (pedido.items || []).map((item, i) => `
        <tr>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${i+1}</td>
            <td style="padding:8px;border:1px solid #ddd;">${item.nombre}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${item.presentacion}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:center;">${item.cantidad}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:right;">Gs. ${(item.precio_unitario || 0).toLocaleString()}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:right;font-weight:bold;">Gs. ${(item.subtotal || item.precio_unitario * item.cantidad).toLocaleString()}</td>
        </tr>
        ${item.nota ? `<tr><td colspan="6" style="padding:4px 8px;border:1px solid #ddd;font-size:11px;color:#666;">📝 ${item.nota}</td></tr>` : ''}
    `).join('');
    
    const pdfHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pedido ${pedido.id.slice(-6)}</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 30px; color: #333; max-width: 800px; margin: 0 auto; }
        .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
        .header h1 { color: #2563eb; margin: 0; font-size: 24px; }
        .header p { margin: 5px 0; color: #666; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
        .info-box { background: #f9fafb; padding: 12px; border-radius: 8px; }
        .info-box h3 { font-size: 13px; color: #666; margin: 0 0 5px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #2563eb; color: white; padding: 10px; text-align: left; }
        .total-box { text-align: right; margin-top: 10px; }
        .total-box .grand { font-size: 22px; color: #2563eb; font-weight: bold; }
        .footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #999; }
        @media print { body { padding: 15px; } }
    </style></head><body>
        <div class="header">
            <h1>🚚 HDV DISTRIBUCIONES</h1>
            <p>Nota de Pedido</p>
        </div>
        <div class="info-grid">
            <div class="info-box">
                <h3>PEDIDO</h3>
                <div><strong>#${pedido.id.slice(-6)}</strong></div>
                <div>📅 ${fecha}</div>
                <div>💰 ${pedido.tipo_pago === 'credito' ? 'CRÉDITO' : 'CONTADO'}</div>
            </div>
            <div class="info-box">
                <h3>CLIENTE</h3>
                <div><strong>${pedido.cliente?.nombre || pedido.cliente?.razon_social || 'N/A'}</strong></div>
                ${pedido.cliente?.ruc ? `<div>RUC: ${pedido.cliente.ruc}</div>` : ''}
                ${pedido.cliente?.direccion ? `<div>${pedido.cliente.direccion}</div>` : ''}
                ${pedido.cliente?.telefono ? `<div>Tel: ${pedido.cliente.telefono}</div>` : ''}
            </div>
        </div>
        <div class="info-box" style="margin-bottom:15px;">
            <h3>VENDEDOR</h3>
            <div>${pedido.vendedor || 'N/A'} · Zona: ${pedido.zona || 'N/A'}</div>
        </div>
        ${pedido.notas ? `<div class="info-box" style="margin-bottom:15px;"><h3>NOTAS</h3><div>${pedido.notas}</div></div>` : ''}
        <table>
            <thead><tr>
                <th style="width:40px;">#</th><th>Producto</th><th>Presentación</th><th style="width:60px;">Cant.</th><th style="text-align:right;">P. Unit.</th><th style="text-align:right;">Subtotal</th>
            </tr></thead>
            <tbody>${itemsRows}</tbody>
        </table>
        <div class="total-box">
            ${pedido.descuento > 0 ? `
                <div>Subtotal: Gs. ${(pedido.subtotal || 0).toLocaleString()}</div>
                <div style="color:#ef4444;">Descuento (${pedido.descuento}%): -Gs. ${(pedido.monto_descuento || 0).toLocaleString()}</div>
            ` : ''}
            <div class="grand">TOTAL: Gs. ${(pedido.total || 0).toLocaleString()}</div>
        </div>
        <div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px;">
            <div style="text-align:center;border-top:1px solid #333;padding-top:8px;font-size:13px;">Firma Vendedor</div>
            <div style="text-align:center;border-top:1px solid #333;padding-top:8px;font-size:13px;">Firma Cliente</div>
        </div>
        <div class="footer">
            HDV Distribuciones · Generado el ${new Date().toLocaleString('es-PY')}
        </div>
    </body></html>`;
    
    // Abrir en nueva ventana para imprimir/guardar como PDF
    const win = window.open('', '_blank');
    if (win) {
        win.document.write(pdfHTML);
        win.document.close();
        setTimeout(() => win.print(), 500);
    } else {
        alert('Por favor permitir ventanas emergentes para exportar PDF');
    }
}

// Llamar al cargar
window.addEventListener('load', () => {
    // Nada extra necesario, DOMContentLoaded maneja todo
});
