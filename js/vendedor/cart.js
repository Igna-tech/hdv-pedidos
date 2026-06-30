// ============================================
// HDV Vendedor - Capa de Logica del Carrito
// Logica de negocio del carrito, precios, promociones.
// NO accede al DOM directamente (excepto para leer inputs del carrito).
// Depende de globals: productos, clientes, clienteActual, carrito
// ============================================

// ============================================
// PRECIOS
// ============================================
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

function obtenerEmoji(producto) {
    return '<i data-lucide="package" class="w-10 h-10 text-gray-300"></i>';
}

// ============================================
// CARRITO
// ============================================
function agregarAlCarrito(productoId, presIdx) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    const pres = producto.presentaciones[presIdx];
    const precio = obtenerPrecio(productoId, pres);
    const qtyInput = document.getElementById(`qty-${productoId}-${presIdx}`);
    const cantidad = parseInt(qtyInput?.value) || 1;

    const existente = carrito.findIndex(item => item.productoId === productoId && item.presentacion === pres.tamano);

    const esPrecioEspecial = precio !== pres.precio_base;
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
            subtotal: precio * cantidad,
            precioEspecial: esPrecioEspecial,
            tipo_impuesto: producto.tipo_impuesto || '10'
        });
    }

    actualizarContadorCarrito();
    guardarCarrito();
    mostrarExito(`${producto.nombre} agregado al carrito`);

    const modal = document.getElementById('productDetailModal');
    if (modal) modal.remove();
}

let _prevCartCount = 0;
function actualizarContadorCarrito() {
    const badge = document.getElementById('cartItems');
    const totalItems = carrito.reduce((sum, item) => sum + item.cantidad, 0);
    if (badge) {
        badge.textContent = totalItems;
        badge.style.display = totalItems > 0 ? 'flex' : 'none';
        if (totalItems > _prevCartCount) {
            badge.classList.remove('badge-pop'); void badge.offsetWidth; badge.classList.add('badge-pop');
            const fab = document.getElementById('viewCartBtn');
            if (fab) { fab.classList.remove('fab-bounce'); void fab.offsetWidth; fab.classList.add('fab-bounce'); }
        }
    }
    _prevCartCount = totalItems;
    // Píldora de total en el FAB (running total)
    const pill = document.getElementById('cartPillText');
    if (pill) {
        const totalGs = carrito.reduce((sum, item) => sum + (item.subtotal || 0), 0);
        if (totalItems > 0) { pill.textContent = formatearGuaranies(totalGs); pill.classList.remove('hidden'); }
        else pill.classList.add('hidden');
    }
    if (typeof _actualizarBadgesCarritoEnCatalogo === 'function') _actualizarBadgesCarritoEnCatalogo();
}

async function guardarCarrito() {
    const key = clienteActual ? `hdv_carrito_${clienteActual.id}` : 'hdv_carrito_temporal';
    await HDVStorage.setItem(key, carrito);
}

async function cargarCarritoGuardado() {
    if (clienteActual) {
        const saved = await HDVStorage.getItem(`hdv_carrito_${clienteActual.id}`);
        if (saved) carrito = saved;
        actualizarContadorCarrito();
    }
}

function eliminarDelCarrito(idx) {
    const finalizar = () => {
        carrito.splice(idx, 1);
        actualizarContadorCarrito();
        guardarCarrito();
        if (carrito.length === 0) closeCartModal();
        else renderizarCarrito(false);
    };
    const inner = document.querySelector('.cart-item-inner[data-idx="' + idx + '"]');
    const wrapper = inner ? inner.parentElement : null;
    if (wrapper) { wrapper.classList.add('cart-item-out'); setTimeout(finalizar, 240); }
    else finalizar();
}

function cambiarCantidadCarrito(idx, delta) {
    if (!carrito[idx]) return;
    carrito[idx].cantidad = Math.max(1, carrito[idx].cantidad + delta);
    carrito[idx].subtotal = carrito[idx].cantidad * carrito[idx].precio;
    actualizarContadorCarrito();
    guardarCarrito();
    renderizarCarrito(false);
}

function agregarMatrizAlCarrito(productoId) {
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return;

    let paresAgregados = 0;
    const presActivas = producto.presentaciones.filter(p => p.activo !== false);

    presActivas.forEach((pres, idx) => {
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
                subtotal: precio * cantidad,
                tipo_impuesto: producto.tipo_impuesto || '10'
            });
        }

        paresAgregados += cantidad;
    });

    if (paresAgregados === 0) {
        mostrarToast('Ingresa al menos 1 par', 'error');
        return;
    }

    actualizarContadorCarrito();
    guardarCarrito();
    mostrarExito(`${paresAgregados} pares de ${producto.nombre} agregados`);

    const modal = document.getElementById('productDetailModal');
    if (modal) modal.remove();
}

function agregarMasivoAlCarrito(productoId) {
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
                subtotal: precio * cantidad,
                tipo_impuesto: producto.tipo_impuesto || '10'
            });
        }

        itemsAgregados += cantidad;
    });

    if (itemsAgregados === 0) {
        mostrarToast('Ingresa al menos 1 unidad', 'error');
        return;
    }

    actualizarContadorCarrito();
    guardarCarrito();
    mostrarExito(`${itemsAgregados} unidades de ${producto.nombre} agregadas`);

    const modal = document.getElementById('productDetailModal');
    if (modal) modal.remove();
}

// ============================================
// CLIENTE NUEVO DESDE VENDEDOR (logica)
// ============================================
async function guardarNuevoClienteDesdeVendedor() {
    const campos = ['ncvNombre', 'ncvTelefono', 'ncvZona'];
    for (const id of campos) {
        const el = document.getElementById(id);
        if (el && typeof el.reportValidity === 'function' && !el.reportValidity()) return;
    }
    const nombre = document.getElementById('ncvNombre')?.value?.trim();
    const telefono = document.getElementById('ncvTelefono')?.value?.trim();
    const zona = document.getElementById('ncvZona')?.value?.trim();
    const direccion = document.getElementById('ncvDireccion')?.value?.trim();
    const ruc = document.getElementById('ncvRuc')?.value?.trim();
    const encargado = document.getElementById('ncvEncargado')?.value?.trim();

    if (!nombre) { mostrarToast('El nombre es obligatorio', 'error'); return; }
    if (!telefono) { mostrarToast('El telefono es obligatorio', 'error'); return; }
    if (!zona) { mostrarToast('La zona es obligatoria', 'error'); return; }

    const nuevoCliente = {
        id: 'CNUEVO-' + Date.now(),
        nombre, razon_social: nombre, telefono, zona,
        direccion: direccion || '', ruc: ruc || '', encargado: encargado || '',
        estado: 'pendiente_aprobacion',
        fechaSolicitud: new Date().toISOString()
    };

    const pendientes = (await HDVStorage.getItem('hdv_clientes_pendientes')) || [];
    pendientes.push(nuevoCliente);
    await HDVStorage.setItem('hdv_clientes_pendientes', pendientes);

    if (typeof guardarConfig === 'function') {
        guardarConfig('clientes_pendientes', { lista: pendientes })
            .catch(e => console.error('[Vendedor] Error al subir cliente pendiente:', e));
    }

    cerrarModalSinCliente();
    mostrarExito('Cliente enviado para aprobacion del administrador');
}

// ============================================
// PEDIDO HABITUAL (repeat-order)
// Carga al carrito el último pedido del cliente (o sus frecuentes como
// fallback), recalculando precios actuales. Merge no destructivo.
// ============================================
async function cargarPedidoHabitual() {
    if (!clienteActual) { mostrarToast('Elegí un cliente primero', 'warning'); return; }

    const allPedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const delCliente = allPedidos
        .filter(p => p.cliente?.id === clienteActual.id)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    let items = [];
    if (delCliente.length > 0 && (delCliente[0].items || []).length > 0) {
        items = delCliente[0].items.map(it => ({ productoId: it.productoId, presentacion: it.presentacion, cantidad: it.cantidad }));
    } else {
        const frec = (typeof obtenerProductosFrecuentes === 'function')
            ? await obtenerProductosFrecuentes(clienteActual.id, 12) : [];
        items = frec.map(f => ({ productoId: f.productoId, cantidad: f.cantidad }));
    }

    if (items.length === 0) { mostrarToast('Este cliente no tiene pedidos previos', 'info'); return; }

    let agregados = 0;
    items.forEach(it => {
        const prod = productos.find(p => p.id === it.productoId);
        if (!prod) return;
        const presActivas = (prod.presentaciones || []).filter(p => p.activo !== false);
        if (presActivas.length === 0) return;
        const pres = presActivas.find(p => p.tamano === it.presentacion) || presActivas[0];
        const precio = obtenerPrecio(prod.id, pres);
        const cantidad = Math.max(1, parseInt(it.cantidad) || 1);
        const existente = carrito.findIndex(item => item.productoId === prod.id && item.presentacion === pres.tamano);
        if (existente >= 0) {
            carrito[existente].cantidad += cantidad;
            carrito[existente].subtotal = carrito[existente].cantidad * carrito[existente].precio;
        } else {
            carrito.push({
                productoId: prod.id, nombre: prod.nombre, presentacion: pres.tamano,
                precio, cantidad, subtotal: precio * cantidad,
                precioEspecial: precio !== pres.precio_base, tipo_impuesto: prod.tipo_impuesto || '10'
            });
        }
        agregados += cantidad;
    });

    if (agregados === 0) { mostrarToast('No se pudieron cargar los productos (ya no existen)', 'warning'); return; }

    actualizarContadorCarrito();
    guardarCarrito();
    if (typeof _actualizarBadgesCarritoEnCatalogo === 'function') _actualizarBadgesCarritoEnCatalogo();
    mostrarExito(`Pedido habitual cargado: ${agregados} unidad${agregados !== 1 ? 'es' : ''}`);
}

// ============================================
// PRODUCTOS FRECUENTES
// ============================================
async function obtenerProductosFrecuentes(clienteId, limit = 6) {
    const allPedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedidos = allPedidos.filter(p => p.cliente?.id === clienteId);
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

// ============================================
// PROMOCIONES
// ============================================
async function obtenerPromocionesActivas() {
    const promos = (await HDVStorage.getItem('hdv_promociones', { clone: false })) || [];
    const hoy = new Date();
    return promos.filter(p => p.activa && hoy >= new Date(p.fechaInicio) && hoy <= new Date(p.fechaFin));
}

async function aplicarPromociones(cart) {
    const promos = await obtenerPromocionesActivas();
    const resultado = { descuentoTotal: 0, promocionesAplicadas: [], itemsGratis: [] };

    promos.forEach(promo => {
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
                        descripcion: `${cantidadTotal} x ${formatearGuaranies(promo.precioEspecial)} en vez de ${formatearGuaranies(itemsProducto[0]?.precio)}`
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

async function mostrarPromocionesEnProducto(productoId) {
    const promos = (await obtenerPromocionesActivas()).filter(p => p.productoId === productoId);
    if (promos.length === 0) return '';
    return promos.map(p => {
        if (p.tipo === 'combo') {
            return `<span class="inline-block bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full mt-1">Lleva ${p.cantidadMinima}+ y lleva gratis!</span>`;
        }
        return `<span class="inline-block bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full mt-1">${p.cantidadMinima}+ a ${formatearGuaranies(p.precioEspecial)}</span>`;
    }).join(' ');
}

function mostrarResumenPromociones(resultado) {
    if (!resultado || (resultado.promocionesAplicadas.length === 0 && resultado.itemsGratis.length === 0)) return '';
    let html = '<div class="bg-green-50 border border-green-200 rounded-xl p-4 mt-3">';
    html += '<p class="font-bold text-green-800 text-sm mb-2">Promociones Aplicadas</p>';
    resultado.promocionesAplicadas.forEach(p => {
        html += `<div class="text-sm text-green-700 mb-1">
            <strong>${p.nombre}</strong>: Ahorro ${formatearGuaranies(p.ahorro)}
            <br><span class="text-xs">${p.descripcion}</span>
        </div>`;
    });
    resultado.itemsGratis.forEach(g => {
        html += `<div class="text-sm text-green-700 mb-1"><strong>${g.nombre}</strong>: ${g.cantidad} unid. GRATIS</div>`;
    });
    if (resultado.descuentoTotal > 0) {
        html += `<p class="font-bold text-green-800 text-sm mt-2 pt-2 border-t border-green-200">Total Ahorro: ${formatearGuaranies(resultado.descuentoTotal)}</p>`;
    }
    html += '</div>';
    return html;
}
