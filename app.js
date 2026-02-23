let productos = [], clientes = [], categorias = [], clienteActual = null, carrito = [], filtroCategoria = 'todas';
let historialCompras = {}; 

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
        const btnToggle = document.querySelector('.dark-mode-toggle');
        if(btnToggle) btnToggle.textContent = '☀️';
    }
}

function construirHistorialCompras() {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    historialCompras = {};
    
    pedidos.forEach(pedido => {
        if (!pedido.cliente) return;
        const clienteId = pedido.cliente.id;
        if (!historialCompras[clienteId]) historialCompras[clienteId] = {};
        
        pedido.items.forEach(item => {
            const productoId = item.nombre;
            if (!historialCompras[clienteId][productoId]) historialCompras[clienteId][productoId] = 0;
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
            verificarVendedor(); 
        }
    }
}

async function cargarDatos() {
    try {
        const timestamp = new Date().getTime();
        const response = await fetch(`productos.json?t=${timestamp}`);
        const data = await response.json();
        productos = data.productos;
        clientes = data.clientes;
        categorias = data.categorias;
        cargarClientes();
        cargarCategorias();
        mostrarProductos(); 
    } catch (error) {
        console.error('Error al cargar datos:', error);
        document.getElementById('productsContainer').innerHTML = '<div class="text-center text-red-500 py-10 font-bold">⚠️ Error al cargar los datos. Verifica tu conexión.</div>';
    }
}

function cargarClientes() {
    const select = document.getElementById('clienteSelect');
    if(!select) return;
    
    select.innerHTML = '<option value="" class="text-black">-- Seleccione Cliente --</option>';
    
    clientes.filter(c => !c.oculto).forEach(c => {
        const option = document.createElement('option');
        const razonSocial = c.razon_social || c.nombre;
        const direccion = c.direccion || c.zona || '';
        option.value = c.id;
        option.textContent = `${razonSocial} — ${direccion}`;
        option.className = "text-black";
        select.appendChild(option);
    });
}

function cargarCategorias() {
    const container = document.getElementById('categoryFilters');
    if(!container) return;
    container.innerHTML = '';
    
    const btnTodas = document.createElement('button');
    btnTodas.className = 'px-4 py-2 bg-gray-900 text-white rounded-full text-xs font-bold whitespace-nowrap transition-colors';
    btnTodas.textContent = 'Todas';
    btnTodas.onclick = (e) => filtrarPorCategoria('todas', e.target);
    container.appendChild(btnTodas);
    
    categorias.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'px-4 py-2 bg-gray-200 text-gray-700 rounded-full text-xs font-bold whitespace-nowrap transition-colors';
        btn.textContent = cat.nombre;
        btn.onclick = (e) => filtrarPorCategoria(cat.id, e.target);
        container.appendChild(btn);
    });
}

function inicializarEventListeners() {
    const clienteSelectObj = document.getElementById('clienteSelect');
    if(clienteSelectObj) {
        clienteSelectObj.addEventListener('change', (e) => {
            const clienteId = e.target.value;
            if (clienteId) {
                clienteActual = clientes.find(c => c.id === clienteId);
                document.getElementById('searchInput').disabled = false;
                document.getElementById('btnSeleccionarCliente').classList.replace('bg-gray-800', 'bg-blue-600');
                document.getElementById('btnSeleccionarCliente').classList.replace('border-gray-700', 'border-blue-500');
                carrito = [];
                actualizarCarrito();
                mostrarProductos();
            } else {
                clienteActual = null;
                document.getElementById('searchInput').disabled = true;
                document.getElementById('btnSeleccionarCliente').classList.replace('bg-blue-600', 'bg-gray-800');
                document.getElementById('btnSeleccionarCliente').classList.replace('border-blue-500', 'border-gray-700');
                document.getElementById('productsContainer').innerHTML = '<div class="text-center py-10 text-gray-500 italic">👤 Seleccione un cliente para comenzar</div>';
            }
        });
    }

    const searchInputObj = document.getElementById('searchInput');
    if(searchInputObj) {
        searchInputObj.addEventListener('input', (e) => {
            mostrarProductos(e.target.value.toLowerCase());
        });
    }
    
    window.addEventListener('online', actualizarEstadoConexion);
    window.addEventListener('offline', actualizarEstadoConexion);
}

function filtrarPorCategoria(categoriaId, btn) {
    filtroCategoria = categoriaId;
    const container = document.getElementById('categoryFilters');
    Array.from(container.children).forEach(b => {
        b.className = 'px-4 py-2 bg-gray-200 text-gray-700 rounded-full text-xs font-bold whitespace-nowrap transition-colors';
    });
    btn.className = 'px-4 py-2 bg-gray-900 text-white rounded-full text-xs font-bold whitespace-nowrap transition-colors';
    mostrarProductos();
}

function mostrarProductos(termino = '') {
    const container = document.getElementById('productsContainer');
    if(!container) return;
    
    let filtrados = productos.filter(p => !p.oculto);
    if (filtroCategoria !== 'todas') filtrados = filtrados.filter(p => p.categoria === filtroCategoria);
    if (termino) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(termino));
    
    if (filtrados.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-gray-500 italic">🔍 No se encontraron productos</div>';
        return;
    }
    
    container.innerHTML = '';
    filtrados.forEach(p => container.appendChild(crearTarjetaProducto(p)));
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

function crearTarjetaProducto(producto) {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-4 transition-all hover:shadow-md';
    card.id = `product-${producto.id}`;

    const catNombre = categorias.find(c => c.id === producto.categoria)?.nombre || '';
    
    const variantesHTML = producto.presentaciones.map((pres, i) => {
        const precio = obtenerPrecio(producto.id, pres);
        const idxCarrito = carrito.findIndex(item => item.productoId === producto.id && item.presentacion === pres.tamano);
        const cantidadEnCarrito = idxCarrito >= 0 ? carrito[idxCarrito].cantidad : 0;
        
        return `
        <div class="flex items-center justify-between py-2 border-t border-gray-50 mt-2">
            <div>
                <div class="font-bold text-gray-800 text-sm">${pres.tamano}</div>
                <div class="text-blue-600 font-bold text-xs">Gs. ${precio.toLocaleString()}</div>
            </div>
            ${cantidadEnCarrito > 0 ? `
                <div class="flex items-center gap-3 bg-gray-50 rounded-lg p-1 border border-gray-200">
                    <button onclick="cambiarCantidadVariante('${producto.id}', '${pres.tamano}', ${precio}, -1)" class="w-8 h-8 flex items-center justify-center bg-white text-blue-600 rounded-md shadow-sm font-bold text-lg">−</button>
                    <span class="font-bold w-6 text-center">${cantidadEnCarrito}</span>
                    <button onclick="cambiarCantidadVariante('${producto.id}', '${pres.tamano}', ${precio}, 1)" class="w-8 h-8 flex items-center justify-center bg-white text-blue-600 rounded-md shadow-sm font-bold text-lg">+</button>
                </div>
            ` : `
                <button onclick="cambiarCantidadVariante('${producto.id}', '${pres.tamano}', ${precio}, 1, '${producto.nombre}')" class="bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                    + Agregar
                </button>
            `}
        </div>
        `;
    }).join('');

    card.innerHTML = `
        <div class="flex items-center gap-4 mb-2">
            <div class="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-2xl shrink-0">
                ${obtenerEmojiProducto(producto)}
            </div>
            <div>
                <h3 class="font-bold text-gray-900 leading-tight">${producto.nombre}</h3>
                <span class="text-[10px] text-gray-500 uppercase tracking-wider">${catNombre}</span>
            </div>
        </div>
        <div class="space-y-1">
            ${variantesHTML}
        </div>
    `;

    return card;
}

function cambiarCantidadVariante(productoId, presentacion, precio, cambio, nombreProd = '') {
    if (!clienteActual) {
        alert('Debes seleccionar un cliente primero.');
        document.getElementById('clienteSelect').focus();
        return;
    }

    const idx = carrito.findIndex(i => i.productoId === productoId && i.presentacion === presentacion);
    
    if (idx >= 0) {
        carrito[idx].cantidad += cambio;
        if (carrito[idx].cantidad <= 0) carrito.splice(idx, 1);
    } else if (cambio > 0) {
        carrito.push({ productoId, nombre: nombreProd, presentacion, precio, cantidad: 1 });
        mostrarExito(`Agregado al pedido`);
    }
    
    actualizarCarrito();
    const tarjetaNueva = crearTarjetaProducto(productos.find(p => p.id === productoId));
    document.getElementById(`product-${productoId}`).replaceWith(tarjetaNueva);
}

function obtenerPrecio(productoId, pres) {
    if (!clienteActual) return pres.precio_base;
    const custom = clienteActual.precios_personalizados?.[productoId]?.find(p => p.tamano === pres.tamano);
    if (custom) return custom.precio;
    return pres.precio_base;
}

function actualizarCarrito() {
    const cantidad = carrito.reduce((s, i) => s + i.cantidad, 0);
    const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    
    const badge = document.getElementById('cartItems');
    if(badge) {
        badge.textContent = cantidad;
        badge.style.transform = 'scale(1.3)';
        setTimeout(() => badge.style.transform = 'scale(1)', 200);
    }
    
    const btn = document.getElementById('viewCartBtn');
    if(btn) btn.disabled = cantidad === 0;
}

function mostrarModalCarrito() {
    if (carrito.length === 0) return;
    
    const lista = document.getElementById('cartItemsList');
    lista.innerHTML = '';
    
    carrito.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100';
        div.innerHTML = `
            <div class="flex-1">
                <div class="font-bold text-gray-900 text-sm">${item.nombre}</div>
                <div class="text-gray-500 text-xs">${item.presentacion} • Gs. ${item.precio.toLocaleString()}</div>
            </div>
            <div class="flex items-center gap-3 bg-white rounded-lg p-1 shadow-sm">
                <button onclick="editarCantidadCarrito(${index}, -1)" class="w-8 h-8 text-blue-600 font-bold text-lg">−</button>
                <span class="font-bold text-sm w-4 text-center">${item.cantidad}</span>
                <button onclick="editarCantidadCarrito(${index}, 1)" class="w-8 h-8 text-blue-600 font-bold text-lg">+</button>
            </div>
        `;
        lista.appendChild(div);
    });
    
    calcularTotales();
    document.getElementById('totalSection').classList.remove('hidden');
    document.getElementById('cartModal').classList.remove('hidden');
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
        <div class="flex justify-between text-gray-500 text-sm">
            <span>Subtotal:</span>
            <span>Gs. ${subtotal.toLocaleString()}</span>
        </div>
        ${descuentoAplicado > 0 ? `
        <div class="flex justify-between text-red-500 text-sm font-bold">
            <span>Descuento (${descuentoAplicado}%):</span>
            <span>- Gs. ${montoDescuento.toLocaleString()}</span>
        </div>
        ` : ''}
        <div class="flex justify-between text-xl font-bold text-gray-900 pt-2 border-t border-gray-200 mt-2">
            <span>TOTAL:</span>
            <span class="text-blue-600">Gs. ${total.toLocaleString()}</span>
        </div>
    `;
}

function editarCantidadCarrito(index, cambio) {
    if (carrito[index]) {
        carrito[index].cantidad += cambio;
        if (carrito[index].cantidad <= 0) carrito.splice(index, 1);
        
        actualizarCarrito();
        if (carrito.length === 0) {
            closeCartModal();
            mostrarProductos(); 
        } else {
            mostrarModalCarrito(); 
        }
    }
}

function closeCartModal() {
    document.getElementById('cartModal').classList.add('hidden');
    mostrarProductos(); 
}

async function confirmarPedido() {
    if (carrito.length === 0 || !clienteActual) return;
    
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
        sincronizado: false
    };
    
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    pedidos.push(pedido);
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
    
    await enviarAGoogleSheets(pedido);
    
    if (confirm('¿Deseas compartir este pedido por WhatsApp?')) {
        compartirPorWhatsApp(pedido);
    }
    
    mostrarExito(`Pedido Guardado`);
    
    carrito = [];
    descuentoAplicado = 0;
    document.getElementById('descuento').value = 0;
    document.getElementById('notasPedido').value = '';
    document.getElementById('tipoPago').value = 'contado';
    
    actualizarCarrito();
    closeCartModal();
}

function compartirPorWhatsApp(pedido) {
    let mensaje = `*PEDIDO HDV DISTRIBUCIONES*\n\n`;
    mensaje += `📋 *Pedido #${pedido.id.slice(-6)}*\n📅 ${new Date(pedido.fecha).toLocaleString('es-PY')}\n👤 *Cliente:* ${pedido.cliente.nombre}\n📍 *Zona:* ${pedido.zona}\n👨‍💼 *Vendedor:* ${pedido.vendedor}\n\n*PRODUCTOS:*\n`;
    
    pedido.items.forEach(item => {
        mensaje += `• ${item.nombre} (${item.presentacion})\n  ${item.cantidad} × Gs. ${item.precio_unitario.toLocaleString()} = Gs. ${item.subtotal.toLocaleString()}\n`;
    });
    
    mensaje += `\n*TOTAL: Gs. ${pedido.total.toLocaleString()}*\n💰 *Tipo:* ${pedido.tipo_pago === 'credito' ? 'CRÉDITO' : 'CONTADO'}\n`;
    if (pedido.notas) mensaje += `\n📝 *Notas:* ${pedido.notas}`;
    
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
}

async function enviarAGoogleSheets(pedido) {
    const SHEET_URL = 'https://script.google.com/macros/s/AKfycbxowigrfPMtoVhSDklxpeSoIfaYxV56oHKB7oZYTGoGrShubG4BiLsOYW9FF4-eLij3/exec';
    try {
        await fetch(SHEET_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido) });
        const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
        const pedidoLocal = pedidos.find(p => p.id === pedido.id);
        if (pedidoLocal) {
            pedidoLocal.sincronizado = true;
            localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
        }
    } catch (error) { console.error('Error sheets:', error); }
}

function actualizarEstadoConexion() {
    const badge = document.getElementById('status-badge');
    if (!badge) return;
    const pendientes = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]').filter(p => !p.sincronizado).length;
    
    if (navigator.onLine) {
        badge.innerHTML = `<span class="w-2 h-2 bg-green-500 rounded-full mr-2"></span> En línea ${pendientes > 0 ? `(${pendientes} sync)` : ''}`;
        if (pendientes > 0) sincronizarPedidosPendientes();
    } else {
        badge.innerHTML = `<span class="w-2 h-2 bg-red-500 rounded-full mr-2"></span> Offline ${pendientes > 0 ? `(${pendientes})` : ''}`;
    }
}

async function sincronizarPedidosPendientes() {
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const pendientes = pedidos.filter(p => !p.sincronizado);
    for (const pedido of pendientes) {
        try {
            await enviarAGoogleSheets(pedido);
            pedido.sincronizado = true;
        } catch (error) {}
    }
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
    actualizarEstadoConexion();
}

function mostrarExito(msg) {
    const el = document.getElementById('successMessage');
    if (el) {
        el.textContent = '✓ ' + msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 3000);
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('dark_mode', document.body.classList.contains('dark-mode'));
}

async function registrarServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            // Ya no forzamos la recarga automática. Solo registramos.
            const registration = await navigator.serviceWorker.register('service-worker.js');
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        alert('🔄 ¡Nueva versión disponible! Pulsa el botón "Forzar" arriba para aplicarla.');
                    }
                });
            });
        } catch (e) { console.log('SW error:', e); }
    }
}

function forzarActualizacion() {
    if (confirm('¿Forzar actualización completa? (Esto limpiará el caché y traerá la última versión)')) {
        (async () => {
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let reg of registrations) await reg.unregister();
            }
            // Recargar saltando el caché
            window.location.href = window.location.href.split('?')[0] + '?t=' + new Date().getTime();
        })();
    }
}