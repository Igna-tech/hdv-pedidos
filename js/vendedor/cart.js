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

function agregarMatrizAlCarrito(productoId) {
    if (!clienteActual) {
        mostrarToast('Selecciona un cliente primero', 'error');
        return;
    }

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
    if (!clienteActual) {
        mostrarToast('Selecciona un cliente primero', 'error');
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
// CONFIRMAR PEDIDO
// ============================================
function confirmarPedido() {
    if (!clienteActual) {
        closeCartModal();
        mostrarModalSinCliente();
        return;
    }
    if (carrito.length === 0) { mostrarToast('El carrito esta vacio', 'error'); return; }

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
        vendedor_id: window.hdvUsuario?.id || null,
        sincronizado: false
    };

    // Guardar en localStorage
    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    pedidos.push(pedido);
    localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));

    // Guardar en Supabase
    if (typeof guardarPedido === 'function') {
        guardarPedido(pedido).then(ok => {
            if (ok) {
                pedido.sincronizado = true;
                localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
                console.log('[Vendedor] Pedido sincronizado con Supabase');
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
// CLIENTE NUEVO DESDE VENDEDOR (logica)
// ============================================
function guardarNuevoClienteDesdeVendedor() {
    const nombre = document.getElementById('ncvNombre')?.value.trim();
    const telefono = document.getElementById('ncvTelefono')?.value.trim();
    const zona = document.getElementById('ncvZona')?.value.trim();
    const direccion = document.getElementById('ncvDireccion')?.value.trim();
    const ruc = document.getElementById('ncvRuc')?.value.trim();
    const encargado = document.getElementById('ncvEncargado')?.value.trim();

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

    const pendientes = JSON.parse(localStorage.getItem('hdv_clientes_pendientes') || '[]');
    pendientes.push(nuevoCliente);
    localStorage.setItem('hdv_clientes_pendientes', JSON.stringify(pendientes));

    if (typeof db !== 'undefined') {
        db.collection('configuracion').doc('clientes_pendientes').set({ lista: pendientes })
          .catch(e => console.error('[Vendedor] Error al subir cliente pendiente:', e));
    }

    cerrarModalSinCliente();
    mostrarExito('Cliente enviado para aprobacion del administrador');
}

// ============================================
// PRODUCTOS FRECUENTES
// ============================================
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

// ============================================
// PROMOCIONES
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
            return `<span class="inline-block bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full mt-1">Lleva ${p.cantidadMinima}+ y lleva gratis!</span>`;
        }
        return `<span class="inline-block bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full mt-1">${p.cantidadMinima}+ a Gs.${(p.precioEspecial || 0).toLocaleString()}</span>`;
    }).join(' ');
}

function mostrarResumenPromociones(resultado) {
    if (!resultado || (resultado.promocionesAplicadas.length === 0 && resultado.itemsGratis.length === 0)) return '';
    let html = '<div class="bg-green-50 border border-green-200 rounded-xl p-4 mt-3">';
    html += '<p class="font-bold text-green-800 text-sm mb-2">Promociones Aplicadas</p>';
    resultado.promocionesAplicadas.forEach(p => {
        html += `<div class="text-sm text-green-700 mb-1">
            <strong>${p.nombre}</strong>: Ahorro Gs. ${p.ahorro.toLocaleString()}
            <br><span class="text-xs">${p.descripcion}</span>
        </div>`;
    });
    resultado.itemsGratis.forEach(g => {
        html += `<div class="text-sm text-green-700 mb-1"><strong>${g.nombre}</strong>: ${g.cantidad} unid. GRATIS</div>`;
    });
    if (resultado.descuentoTotal > 0) {
        html += `<p class="font-bold text-green-800 text-sm mt-2 pt-2 border-t border-green-200">Total Ahorro: Gs. ${resultado.descuentoTotal.toLocaleString()}</p>`;
    }
    html += '</div>';
    return html;
}
