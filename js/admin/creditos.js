// ============================================
// HDV Admin - Modulo de Creditos
// Sistema de creditos, pagos parciales, promociones, rendiciones, cuentas bancarias
// Depende de globals: todosLosPedidos, productosData
// ============================================

let chartCred = null;
let chartCredPie = null;

// ============================================
// SISTEMA DE CREDITOS COMPLETO
// ============================================

function calcularDiasDesde(fecha) {
    return Math.floor((new Date() - new Date(fecha)) / (1000 * 60 * 60 * 24));
}

async function obtenerPagosCredito(pedidoId) {
    const pagos = (await HDVStorage.getItem('hdv_pagos_credito')) || [];
    return pagos.filter(p => p.pedidoId === pedidoId);
}

async function obtenerSaldoPendiente(pedido) {
    const pagos = await obtenerPagosCredito(pedido.id);
    const totalPagado = pagos.reduce((s, p) => s + (p.monto || 0), 0);
    return (pedido.total || 0) - totalPagado;
}

async function obtenerCreditosManuales() {
    return (await HDVStorage.getItem('hdv_creditos_manuales')) || [];
}

function obtenerSaldoManual(credito) {
    const pagos = credito.pagos || [];
    const totalPagado = pagos.reduce((s, p) => s + (p.monto || 0), 0);
    return (credito.monto || 0) - totalPagado;
}

async function cargarCreditos() {
    // Pedidos a credito
    const pedidosCredito = todosLosPedidos.filter(p => p.tipoPago === 'credito' && p.estado !== 'pagado');
    const creditosManuales = (await obtenerCreditosManuales()).filter(c => !c.pagado);
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito')) || [];

    // Calcular stats
    let totalDeuda = 0, totalCobrado = 0;
    pedidosCredito.forEach(p => {
        const pagos = allPagos.filter(pg => pg.pedidoId === p.id);
        const pagado = pagos.reduce((s, pg) => s + (pg.monto || 0), 0);
        totalDeuda += (p.total || 0) - pagado;
        totalCobrado += pagado;
    });
    creditosManuales.forEach(c => {
        const pagado = (c.pagos || []).reduce((s, p) => s + (p.monto || 0), 0);
        totalDeuda += (c.monto || 0) - pagado;
        totalCobrado += pagado;
    });

    const clientesUnicos = new Set([
        ...pedidosCredito.map(p => p.cliente?.id),
        ...creditosManuales.map(c => c.clienteId)
    ]).size;

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('totalCreditos', 'Gs. ' + totalDeuda.toLocaleString());
    el('totalCobrado', 'Gs. ' + totalCobrado.toLocaleString());
    el('clientesConCredito', clientesUnicos);
    el('pedidosCredito', pedidosCredito.length + creditosManuales.length);

    const container = document.getElementById('listaCreditos');
    if (!container) return;

    if (pedidosCredito.length === 0 && creditosManuales.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_ORDERS, 'Sin creditos pendientes', 'No hay pedidos a credito pendientes de pago');
        return;
    }

    container.innerHTML = '';

    // Pedidos a credito
    pedidosCredito.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).forEach(p => {
        const dias = calcularDiasDesde(p.fecha);
        const saldo = obtenerSaldoPendiente(p);
        const pagos = obtenerPagosCredito(p.id);
        const totalPagado = pagos.reduce((s, pg) => s + (pg.monto || 0), 0);
        const esVencido = dias > 15;
        const clienteInfo = productosData.clientes.find(c => c.id === p.cliente?.id);

        if (saldo <= 0) return; // Ya pagado

        const div = document.createElement('div');
        div.className = `p-5 hover:bg-gray-50 transition-colors ${esVencido ? 'bg-red-50 border-l-4 border-red-500' : ''}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold text-gray-800 text-lg">${escapeHTML(p.cliente?.nombre || 'N/A')}</p>
                    <p class="text-sm text-gray-500">${new Date(p.fecha).toLocaleDateString('es-PY')} - Pedido #${escapeHTML(p.id)}</p>
                </div>
                <div class="text-right">
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${esVencido ? 'bg-red-200 text-red-800' : 'bg-yellow-100 text-yellow-800'}">
                        ${dias} dias ${esVencido ? '- VENCIDO' : ''}
                    </span>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-4 mb-3 text-sm">
                <div><span class="text-gray-500">Total:</span> <strong>Gs. ${(p.total || 0).toLocaleString()}</strong></div>
                <div><span class="text-gray-500">Pagado:</span> <strong class="text-green-600">Gs. ${totalPagado.toLocaleString()}</strong></div>
                <div><span class="text-gray-500">Saldo:</span> <strong class="text-red-600">Gs. ${saldo.toLocaleString()}</strong></div>
            </div>
            ${totalPagado > 0 ? `
                <div class="w-full bg-gray-200 rounded-full h-2 mb-3">
                    <div class="bg-green-500 h-2 rounded-full" style="width:${Math.min(100, (totalPagado / p.total * 100)).toFixed(0)}%"></div>
                </div>` : ''}
            <div class="flex gap-2 flex-wrap">
                <button onclick="registrarPagoCredito('${p.id}')" class="bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-bold">Registrar Pago</button>
                <button onclick="enviarRecordatorioWhatsApp('${p.id}')" class="bg-[#25D366] text-white px-3 py-2 rounded-lg text-xs font-bold">WhatsApp</button>
                <button onclick="verHistorialPagos('${p.id}')" class="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-xs font-bold">Historial</button>
                ${saldo <= 0 ? `<button onclick="marcarPagado('${p.id}')" class="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-bold">Marcar Pagado</button>` : ''}
                <button onclick="editarPagosCreditoPedido('${p.id}')" class="bg-yellow-500 text-white px-3 py-2 rounded-lg text-xs font-bold">Editar Pagos</button>
                <button onclick="eliminarCreditoPedido('${p.id}')" class="bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-bold">Eliminar</button>
            </div>`;
        container.appendChild(div);
    });

    // Creditos manuales
    creditosManuales.forEach(c => {
        const dias = calcularDiasDesde(c.fecha);
        const saldo = obtenerSaldoManual(c);
        const totalPagado = (c.pagos || []).reduce((s, p) => s + (p.monto || 0), 0);
        const esVencido = dias > 15;

        if (saldo <= 0) return;

        const div = document.createElement('div');
        div.className = `p-5 hover:bg-gray-50 transition-colors ${esVencido ? 'bg-red-50 border-l-4 border-red-500' : ''}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold text-gray-800 text-lg">${escapeHTML(c.clienteNombre || 'N/A')}</p>
                    <p class="text-sm text-gray-500">${new Date(c.fecha).toLocaleDateString('es-PY')} - Manual: ${escapeHTML(c.descripcion || '')}</p>
                </div>
                <div class="text-right">
                    <span class="px-2 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">MANUAL</span>
                    <span class="ml-1 px-3 py-1 rounded-full text-xs font-bold ${esVencido ? 'bg-red-200 text-red-800' : 'bg-yellow-100 text-yellow-800'}">
                        ${dias} dias
                    </span>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-4 mb-3 text-sm">
                <div><span class="text-gray-500">Total:</span> <strong>Gs. ${(c.monto || 0).toLocaleString()}</strong></div>
                <div><span class="text-gray-500">Pagado:</span> <strong class="text-green-600">Gs. ${totalPagado.toLocaleString()}</strong></div>
                <div><span class="text-gray-500">Saldo:</span> <strong class="text-red-600">Gs. ${saldo.toLocaleString()}</strong></div>
            </div>
            <div class="flex gap-2 flex-wrap">
                <button onclick="registrarPagoManual('${c.id}')" class="bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-bold">Registrar Pago</button>
                <button onclick="enviarRecordatorioManualWhatsApp('${c.id}')" class="bg-[#25D366] text-white px-3 py-2 rounded-lg text-xs font-bold">WhatsApp</button>
                <button onclick="editarCreditoManualItem('${c.id}')" class="bg-yellow-500 text-white px-3 py-2 rounded-lg text-xs font-bold">Editar</button>
                <button onclick="eliminarCreditoManualItem('${c.id}')" class="bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-bold">Eliminar</button>
            </div>`;
        container.appendChild(div);
    });
}

async function registrarPagoCredito(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const saldo = obtenerSaldoPendiente(pedido);

    const datos = await mostrarInputModal({
        titulo: 'Registrar Pago',
        subtitulo: `Cliente: ${pedido.cliente?.nombre || 'N/A'} — Saldo: Gs. ${saldo.toLocaleString()}`,
        icono: 'banknote',
        campos: [
            { key: 'monto', label: 'Monto del pago (Gs.)', tipo: 'number', placeholder: saldo.toLocaleString(), requerido: true },
            { key: 'nota', label: 'Nota (opcional)', tipo: 'text', placeholder: 'Ej: Pago parcial, transferencia...' }
        ],
        textoConfirmar: 'Registrar Pago'
    });
    if (!datos) return;
    const monto = datos.monto;
    if (monto <= 0) { mostrarToast('Monto invalido', 'error'); return; }
    if (monto > saldo) { mostrarToast('El monto excede el saldo pendiente', 'error'); return; }

    const pago = { id: 'PAG' + Date.now(), pedidoId, monto, fecha: new Date().toISOString(), nota: datos.nota || '' };
    const pagos = (await HDVStorage.getItem('hdv_pagos_credito')) || [];
    pagos.push(pago);
    await HDVStorage.setItem('hdv_pagos_credito', pagos);

    if (typeof guardarPagosCredito === 'function') {
        try {
            await guardarPagosCredito(pagos);
        } catch(e) {
            console.error('[Creditos] Error sincronizando pago con Supabase:', e);
        }
    }

    if (saldo - monto <= 0) {
        marcarPagado(pedidoId);
    }

    mostrarToast(`Pago de Gs. ${monto.toLocaleString()} registrado exitosamente`, 'success');
    cargarCreditos();
}

async function registrarPagoManual(creditoId) {
    const creditos = await obtenerCreditosManuales();
    const credito = creditos.find(c => c.id === creditoId);
    if (!credito) return;
    const saldo = obtenerSaldoManual(credito);

    const datos = await mostrarInputModal({
        titulo: 'Registrar Pago',
        subtitulo: `Cliente: ${credito.clienteNombre} — Saldo: Gs. ${saldo.toLocaleString()}`,
        icono: 'banknote',
        campos: [
            { key: 'monto', label: 'Monto del pago (Gs.)', tipo: 'number', placeholder: saldo.toLocaleString(), requerido: true },
            { key: 'nota', label: 'Nota (opcional)', tipo: 'text', placeholder: 'Ej: Pago parcial, transferencia...' }
        ],
        textoConfirmar: 'Registrar Pago'
    });
    if (!datos) return;
    const monto = datos.monto;
    if (monto <= 0 || monto > saldo) { mostrarToast('Monto invalido o excede saldo', 'error'); return; }

    if (!credito.pagos) credito.pagos = [];
    credito.pagos.push({ monto, fecha: new Date().toISOString(), nota: datos.nota || '' });
    if (saldo - monto <= 0) credito.pagado = true;
    await HDVStorage.setItem('hdv_creditos_manuales', creditos);
    if (typeof guardarCreditosManuales === 'function') {
        try {
            await guardarCreditosManuales(creditos);
        } catch(e) {
            console.error('[Creditos] Error sincronizando pago manual con Supabase:', e);
        }
    }
    mostrarToast(`Pago de Gs. ${monto.toLocaleString()} registrado`, 'success');
    cargarCreditos();
}

async function marcarPagado(id) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const p = pedidos.find(x => x.id === id);
    if (p) {
        p.estado = 'pagado';
        await HDVStorage.setItem('hdv_pedidos', pedidos);
        if (typeof actualizarEstadoPedido === 'function') actualizarEstadoPedido(id, 'pagado');
    }
    cargarCreditos();
}

async function verHistorialPagos(pedidoId) {
    const pagos = await obtenerPagosCredito(pedidoId);
    if (pagos.length === 0) { mostrarToast('Sin pagos registrados para este credito', 'info'); return; }
    let msg = 'HISTORIAL DE PAGOS\n' + '='.repeat(30) + '\n';
    pagos.forEach((p, i) => {
        msg += `\n${i + 1}. Gs. ${p.monto.toLocaleString()} - ${new Date(p.fecha).toLocaleDateString('es-PY')}`;
        if (p.nota) msg += ` (${p.nota})`;
    });
    msg += `\n\nTotal pagado: Gs. ${pagos.reduce((s, p) => s + p.monto, 0).toLocaleString()}`;
    mostrarConfirmModal(msg, { textoConfirmar: 'Cerrar' });
}

async function enviarRecordatorioWhatsApp(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const clienteInfo = productosData.clientes.find(c => c.id === pedido.cliente?.id);
    const telefono = clienteInfo?.telefono || '';
    if (!telefono) { mostrarToast('Este cliente no tiene telefono registrado', 'error'); return; }

    const saldo = await obtenerSaldoPendiente(pedido);
    const dias = calcularDiasDesde(pedido.fecha);

    let plantilla = await HDVStorage.getItem('hdv_whatsapp_mensaje_credito');
    if (!plantilla) {
        plantilla = 'Hola {cliente}, le recordamos que tiene un saldo pendiente de Gs. {saldo} desde hace {dias} dias. Total original: Gs. {monto}. Fecha del pedido: {fecha}. Agradecemos su pronto pago. HDV Distribuciones';
        // Primera vez: permitir editar via modal
        const datos = await mostrarInputModal({
            titulo: 'Plantilla de Recordatorio',
            subtitulo: 'Placeholders: {cliente}, {monto}, {saldo}, {dias}, {fecha}',
            icono: 'message-square',
            campos: [
                { key: 'plantilla', label: 'Mensaje', tipo: 'textarea', valor: plantilla, requerido: true }
            ],
            textoConfirmar: 'Guardar y Enviar'
        });
        if (!datos) return;
        plantilla = datos.plantilla;
        await HDVStorage.setItem('hdv_whatsapp_mensaje_credito', plantilla);
    }

    const mensaje = plantilla
        .replace(/{cliente}/g, pedido.cliente?.nombre || '')
        .replace(/{monto}/g, (pedido.total || 0).toLocaleString())
        .replace(/{saldo}/g, saldo.toLocaleString())
        .replace(/{dias}/g, dias)
        .replace(/{fecha}/g, new Date(pedido.fecha).toLocaleDateString('es-PY'));

    let tel = telefono.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '595' + tel.substring(1);
    else if (!tel.startsWith('595')) tel = '595' + tel;

    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
}

async function enviarRecordatorioManualWhatsApp(creditoId) {
    const creditos = await obtenerCreditosManuales();
    const credito = creditos.find(c => c.id === creditoId);
    if (!credito) return;
    const clienteInfo = productosData.clientes.find(c => c.id === credito.clienteId);
    const telefono = clienteInfo?.telefono || '';
    if (!telefono) { mostrarToast('Sin telefono registrado', 'error'); return; }

    const saldo = obtenerSaldoManual(credito);
    const dias = calcularDiasDesde(credito.fecha);
    const mensaje = `Hola ${credito.clienteNombre}, le recordamos que tiene un saldo pendiente de Gs. ${saldo.toLocaleString()} desde hace ${dias} dias por: ${credito.descripcion}. Agradecemos su pronto pago. HDV Distribuciones`;

    let tel = telefono.replace(/\D/g, '');
    if (tel.startsWith('0')) tel = '595' + tel.substring(1);
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
}

async function editarMensajeRecordatorio() {
    let plantilla = (await HDVStorage.getItem('hdv_whatsapp_mensaje_credito')) ||
        'Hola {cliente}, le recordamos que tiene un saldo pendiente de Gs. {saldo} desde hace {dias} dias. Total original: Gs. {monto}. Fecha del pedido: {fecha}. Agradecemos su pronto pago. HDV Distribuciones';
    const datos = await mostrarInputModal({
        titulo: 'Editar Plantilla WhatsApp',
        subtitulo: 'Placeholders: {cliente}, {monto}, {saldo}, {dias}, {fecha}',
        icono: 'message-square',
        campos: [
            { key: 'plantilla', label: 'Mensaje de recordatorio', tipo: 'textarea', valor: plantilla, requerido: true }
        ],
        textoConfirmar: 'Guardar'
    });
    if (datos) {
        await HDVStorage.setItem('hdv_whatsapp_mensaje_credito', datos.plantilla);
        if (typeof guardarPlantillaWhatsApp === 'function') {
            guardarPlantillaWhatsApp(datos.plantilla).catch(e => console.error(e));
        }
        mostrarToast('Mensaje actualizado', 'success');
    }
}

async function agregarCreditoManual() {
    const clienteOpts = (productosData.clientes || [])
        .filter(c => !c.oculto)
        .map(c => ({
            value: c.id,
            label: `${c.razon_social || c.nombre}${c.ruc ? ' — RUC: ' + c.ruc : ''}`
        }));

    const datos = await mostrarInputModal({
        titulo: 'Nuevo Credito Manual',
        icono: 'credit-card',
        campos: [
            { key: 'clienteId', label: 'Cliente', tipo: 'select-search', opciones: clienteOpts, requerido: true },
            { key: 'monto', label: 'Monto (Gs.)', tipo: 'number', placeholder: '0', requerido: true },
            { key: 'descripcion', label: 'Descripcion', tipo: 'text', placeholder: 'Ej: Mercaderia a credito', valor: '' }
        ],
        textoConfirmar: 'Crear Credito'
    });
    if (!datos) return;
    if (datos.monto <= 0) { mostrarToast('Monto invalido', 'error'); return; }

    const cliente = productosData.clientes.find(c => c.id === datos.clienteId);
    const nombre = cliente ? (cliente.razon_social || cliente.nombre) : datos.clienteId;

    const creditos = await obtenerCreditosManuales();
    const nuevo = {
        id: 'CM' + Date.now(),
        clienteId: datos.clienteId,
        clienteNombre: nombre,
        monto: datos.monto,
        descripcion: datos.descripcion || 'Credito manual',
        fecha: new Date().toISOString(),
        pagos: [], pagado: false
    };
    creditos.push(nuevo);
    await HDVStorage.setItem('hdv_creditos_manuales', creditos);

    if (typeof guardarCreditosManuales === 'function') {
        try {
            const ok = await guardarCreditosManuales(creditos);
            if (!ok) {
                console.error('[Creditos] Error guardando credito en Supabase');
                mostrarToast('Credito guardado localmente, error al sincronizar con servidor', 'warning');
            } else {
                mostrarToast('Credito manual agregado y sincronizado', 'success');
            }
        } catch(e) {
            console.error('[Creditos] Error guardando credito en Supabase:', e);
            mostrarToast('Credito guardado localmente, error al sincronizar', 'warning');
        }
    } else {
        mostrarToast('Credito manual agregado', 'success');
    }
    cargarCreditos();
}

// Editar/eliminar creditos
async function editarCreditoManualItem(creditoId) {
    const creditos = await obtenerCreditosManuales();
    const c = creditos.find(x => x.id === creditoId);
    if (!c) return;

    const datos = await mostrarInputModal({
        titulo: 'Editar Credito Manual',
        subtitulo: `Cliente: ${c.clienteNombre}`,
        icono: 'edit-3',
        campos: [
            { key: 'monto', label: 'Monto (Gs.)', tipo: 'number', valor: c.monto || 0, requerido: true },
            { key: 'descripcion', label: 'Descripcion', tipo: 'text', valor: c.descripcion || '' }
        ],
        textoConfirmar: 'Guardar Cambios'
    });
    if (!datos) return;
    if (datos.monto > 0) c.monto = datos.monto;
    if (datos.descripcion.trim()) c.descripcion = datos.descripcion;
    await HDVStorage.setItem('hdv_creditos_manuales', creditos);
    if (typeof guardarCreditosManuales === 'function') {
        try {
            await guardarCreditosManuales(creditos);
        } catch(e) {
            console.error('[Creditos] Error sincronizando edicion con Supabase:', e);
        }
    }
    mostrarToast('Credito actualizado', 'success');
    cargarCreditos();
}

async function eliminarCreditoManualItem(creditoId) {
    const creditos = await obtenerCreditosManuales();
    const c = creditos.find(x => x.id === creditoId);
    if (!c) return;
    if (!await mostrarConfirmModal(`¿Eliminar credito manual de ${c.clienteNombre} (Gs. ${(c.monto || 0).toLocaleString()})?\nEsta accion es irreversible.`, { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    const nuevos = creditos.filter(x => x.id !== creditoId);
    await HDVStorage.setItem('hdv_creditos_manuales', nuevos);
    if (typeof guardarCreditosManuales === 'function') {
        try {
            await guardarCreditosManuales(nuevos);
        } catch(e) {
            console.error('[Creditos] Error sincronizando eliminacion con Supabase:', e);
        }
    }
    cargarCreditos();
}

async function editarPagosCreditoPedido(pedidoId) {
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito')) || [];
    const pagos = allPagos.filter(p => p.pedidoId === pedidoId);
    if (pagos.length === 0) { mostrarToast('Sin pagos registrados para este pedido', 'info'); return; }

    const pagoOpts = pagos.map((p, i) => ({
        value: String(i),
        label: `Gs. ${(p.monto || 0).toLocaleString()} — ${new Date(p.fecha).toLocaleDateString('es-PY')}${p.nota ? ' — ' + p.nota : ''}`
    }));

    const datos = await mostrarInputModal({
        titulo: 'Eliminar Pago',
        subtitulo: 'Selecciona el pago que deseas eliminar',
        icono: 'trash-2',
        destructivo: true,
        campos: [
            { key: 'idx', label: 'Pago a eliminar', tipo: 'select', opciones: pagoOpts, requerido: true }
        ],
        textoConfirmar: 'Eliminar Pago'
    });
    if (!datos) return;
    const idx = parseInt(datos.idx);
    if (isNaN(idx) || idx < 0 || idx >= pagos.length) { mostrarToast('Seleccion invalida', 'error'); return; }

    if (!await mostrarConfirmModal(`¿Eliminar pago de Gs. ${pagos[idx].monto.toLocaleString()}?`, { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    const pagoAEliminar = pagos[idx];
    const nuevosPagos = allPagos.filter(p => !(p.pedidoId === pedidoId && p.fecha === pagoAEliminar.fecha && p.monto === pagoAEliminar.monto));
    await HDVStorage.setItem('hdv_pagos_credito', nuevosPagos);
    cargarCreditos();
}

async function eliminarCreditoPedido(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    if (!await mostrarConfirmModal(`¿Marcar como pagado el credito de ${pedido.cliente?.nombre}?\nEsto lo marcara como pagado en el sistema.`, { textoConfirmar: 'Marcar Pagado' })) return;
    marcarPagado(pedidoId);
}

function toggleVistaCreditos(vista) {
    document.getElementById('vistaListaCreditos').style.display = vista === 'lista' ? '' : 'none';
    document.getElementById('vistaResumenCreditos').style.display = vista === 'resumen' ? '' : 'none';
    document.getElementById('vistaGraficosCreditos').style.display = vista === 'graficos' ? '' : 'none';
    if (vista === 'resumen') mostrarDeudaPorCliente();
    if (vista === 'graficos') renderizarGraficoCreditos();
}

async function mostrarDeudaPorCliente() {
    const pedidosCredito = todosLosPedidos.filter(p => p.tipoPago === 'credito' && p.estado !== 'pagado');
    const creditosManuales = (await obtenerCreditosManuales()).filter(c => !c.pagado);
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito')) || [];
    const resumen = {};

    pedidosCredito.forEach(p => {
        const nombre = p.cliente?.nombre || 'N/A';
        if (!resumen[nombre]) resumen[nombre] = { creditos: 0, deuda: 0, pagado: 0 };
        const pagado = allPagos.filter(pg => pg.pedidoId === p.id).reduce((s, pg) => s + pg.monto, 0);
        resumen[nombre].creditos++;
        resumen[nombre].deuda += (p.total || 0);
        resumen[nombre].pagado += pagado;
    });
    creditosManuales.forEach(c => {
        const nombre = c.clienteNombre || 'N/A';
        if (!resumen[nombre]) resumen[nombre] = { creditos: 0, deuda: 0, pagado: 0 };
        const pagado = (c.pagos || []).reduce((s, p) => s + p.monto, 0);
        resumen[nombre].creditos++;
        resumen[nombre].deuda += c.monto;
        resumen[nombre].pagado += pagado;
    });

    const container = document.getElementById('resumenDeudaClientes');
    if (!container) return;
    const sorted = Object.entries(resumen).sort((a, b) => (b[1].deuda - b[1].pagado) - (a[1].deuda - a[1].pagado));

    container.innerHTML = `
        <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 uppercase text-[11px]">
                <tr><th class="px-4 py-2 text-left">Cliente</th><th class="px-4 py-2">Creditos</th><th class="px-4 py-2">Deuda Total</th><th class="px-4 py-2">Pagado</th><th class="px-4 py-2">Saldo</th></tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
                ${sorted.map(([nombre, d]) => {
                    const saldo = d.deuda - d.pagado;
                    return `<tr class="${saldo > 0 ? 'bg-red-50' : 'bg-green-50'}">
                        <td class="px-4 py-3 font-bold">${escapeHTML(nombre)}</td>
                        <td class="px-4 py-3 text-center">${d.creditos}</td>
                        <td class="px-4 py-3 text-center">Gs. ${d.deuda.toLocaleString()}</td>
                        <td class="px-4 py-3 text-center text-green-600 font-bold">Gs. ${d.pagado.toLocaleString()}</td>
                        <td class="px-4 py-3 text-center text-red-600 font-bold">Gs. ${saldo.toLocaleString()}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
}

async function renderizarGraficoCreditos() {
    const pedidosCredito = todosLosPedidos.filter(p => p.tipoPago === 'credito' && p.estado !== 'pagado');
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito')) || [];
    const porCliente = {};
    let totalPagadoGlobal = 0, totalPendienteGlobal = 0;

    pedidosCredito.forEach(p => {
        const nombre = p.cliente?.nombre || 'N/A';
        const pagado = allPagos.filter(pg => pg.pedidoId === p.id).reduce((s, pg) => s + pg.monto, 0);
        const saldo = (p.total || 0) - pagado;
        if (!porCliente[nombre]) porCliente[nombre] = 0;
        porCliente[nombre] += saldo;
        totalPagadoGlobal += pagado;
        totalPendienteGlobal += saldo;
    });

    const top10 = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const ctx1 = document.getElementById('chartCreditos');
    if (ctx1) {
        if (chartCred) chartCred.destroy();
        chartCred = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: top10.map(t => t[0]),
                datasets: [{ label: 'Deuda (Gs.)', data: top10.map(t => t[1]), backgroundColor: 'rgba(220, 38, 38, 0.7)', borderRadius: 6 }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => 'Gs.' + (v / 1000).toFixed(0) + 'k' } } } }
        });
    }

    const ctx2 = document.getElementById('chartCreditosPagados');
    if (ctx2) {
        if (chartCredPie) chartCredPie.destroy();
        chartCredPie = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: ['Cobrado', 'Pendiente'],
                datasets: [{ data: [totalPagadoGlobal, totalPendienteGlobal], backgroundColor: ['#16a34a', '#dc2626'], borderWidth: 0 }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }
}


// ============================================
// MOTOR DE PROMOCIONES
// ============================================

async function cargarPromocionesDesdeStorage() {
    return (await HDVStorage.getItem('hdv_promociones')) || [];
}

async function guardarPromocionesEnStorage(promos) {
    await HDVStorage.setItem('hdv_promociones', promos);
    // Sincronizar con Supabase
    if (typeof guardarPromociones === 'function') {
        guardarPromociones(promos).catch(e => console.error(e));
    }
}

function esPromocionActiva(promo) {
    if (!promo.activa) return false;
    const hoy = new Date();
    return hoy >= new Date(promo.fechaInicio) && hoy <= new Date(promo.fechaFin);
}

async function cargarPromociones() {
    const container = document.getElementById('promocionesContainer');
    if (!container) return;
    const promos = await cargarPromocionesDesdeStorage();

    if (promos.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_ORDERS, 'Sin promociones configuradas', 'Crea una nueva promocion para tus productos');
        return;
    }

    container.innerHTML = '';
    promos.forEach(p => {
        const activa = esPromocionActiva(p);
        const prod = productosData.productos.find(pr => pr.id === p.productoId);
        const tipoLabels = { descuento_cantidad: 'Descuento x Cant.', combo: 'Combo', precio_mayorista: 'Mayorista' };
        const div = document.createElement('div');
        div.className = `p-5 hover:bg-gray-50 ${!activa ? 'opacity-50' : ''}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold text-gray-800">${p.nombre}</p>
                    <p class="text-sm text-gray-500">${p.descripcion || ''}</p>
                </div>
                <div class="flex gap-2 items-center">
                    <span class="px-2 py-1 rounded-full text-[10px] font-bold ${activa ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}">${activa ? 'ACTIVA' : 'INACTIVA'}</span>
                    <span class="px-2 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">${tipoLabels[p.tipo] || p.tipo}</span>
                </div>
            </div>
            <div class="text-sm text-gray-600 mb-3">
                <span class="font-medium">${prod?.nombre || p.productoId}</span>
                ${p.presentacion !== 'todas' ? ` (${p.presentacion})` : ' (todas)'}
                - Min: ${p.cantidadMinima} unid.
                ${p.tipo !== 'combo' ? ` - Precio: Gs. ${(p.precioEspecial || 0).toLocaleString()}` : ` - Gratis: ${p.cantidadGratis} unid.`}
            </div>
            <div class="text-xs text-gray-400 mb-3">${new Date(p.fechaInicio).toLocaleDateString('es-PY')} al ${new Date(p.fechaFin).toLocaleDateString('es-PY')}</div>
            <div class="flex gap-2">
                <button onclick="abrirModalPromocion('${p.id}')" class="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-xs font-bold">Editar</button>
                <button onclick="togglePromocion('${p.id}')" class="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-xs font-bold">${p.activa ? 'Desactivar' : 'Activar'}</button>
                <button onclick="eliminarPromocion('${p.id}')" class="bg-red-50 text-red-600 px-3 py-1 rounded-lg text-xs font-bold">Eliminar</button>
            </div>`;
        container.appendChild(div);
    });
}

async function abrirModalPromocion(promoId) {
    // Poblar selects de productos
    const selectProd = document.getElementById('formPromoProducto');
    const selectGratis = document.getElementById('formPromoProductoGratis');
    if (selectProd) {
        selectProd.innerHTML = '<option value="">-- Seleccionar --</option>' +
            productosData.productos.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nombre)}</option>`).join('');
    }
    if (selectGratis) {
        selectGratis.innerHTML = '<option value="">-- Ninguno --</option>' +
            productosData.productos.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nombre)}</option>`).join('');
    }

    if (promoId) {
        const promo = (await cargarPromocionesDesdeStorage()).find(p => p.id === promoId);
        if (promo) {
            document.getElementById('formPromoId').value = promo.id;
            document.getElementById('formPromoNombre').value = promo.nombre;
            document.getElementById('formPromoDescripcion').value = promo.descripcion || '';
            document.getElementById('formPromoTipo').value = promo.tipo;
            document.getElementById('formPromoProducto').value = promo.productoId;
            actualizarPresentacionesPromo();
            setTimeout(() => {
                document.getElementById('formPromoPresentacion').value = promo.presentacion || 'todas';
            }, 50);
            document.getElementById('formPromoCantidad').value = promo.cantidadMinima;
            document.getElementById('formPromoPrecio').value = promo.precioEspecial || '';
            if (selectGratis) selectGratis.value = promo.productoGratisId || '';
            document.getElementById('formPromoCantidadGratis').value = promo.cantidadGratis || 1;
            document.getElementById('formPromoActiva').checked = promo.activa;
            document.getElementById('formPromoFechaInicio').value = promo.fechaInicio;
            document.getElementById('formPromoFechaFin').value = promo.fechaFin;
        }
    } else {
        document.getElementById('formPromoId').value = 'PROMO' + Date.now();
        document.getElementById('formPromoNombre').value = '';
        document.getElementById('formPromoDescripcion').value = '';
        document.getElementById('formPromoCantidad').value = 12;
        document.getElementById('formPromoPrecio').value = '';
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('formPromoFechaInicio').value = hoy;
        const fin = new Date(); fin.setFullYear(fin.getFullYear() + 1);
        document.getElementById('formPromoFechaFin').value = fin.toISOString().split('T')[0];
    }

    toggleCamposPromo();
    document.getElementById('modalPromocion')?.classList.add('show');
}

function cerrarModalPromocion() {
    document.getElementById('modalPromocion')?.classList.remove('show');
}

function actualizarPresentacionesPromo() {
    const prodId = document.getElementById('formPromoProducto')?.value;
    const select = document.getElementById('formPromoPresentacion');
    if (!select) return;
    select.innerHTML = '<option value="todas">Todas</option>';
    if (prodId) {
        const prod = productosData.productos.find(p => p.id === prodId);
        if (prod) {
            prod.presentaciones.forEach(pres => {
                select.innerHTML += `<option value="${escapeHTML(pres.tamano)}">${escapeHTML(pres.tamano)} - Gs.${pres.precio_base.toLocaleString()}</option>`;
            });
        }
    }
}

function toggleCamposPromo() {
    const tipo = document.getElementById('formPromoTipo')?.value;
    document.getElementById('campoPrecioEspecial').style.display = tipo !== 'combo' ? '' : 'none';
    document.getElementById('camposCombo').style.display = tipo === 'combo' ? '' : 'none';
}

async function guardarPromocion() {
    const id = document.getElementById('formPromoId').value;
    const nombre = document.getElementById('formPromoNombre').value.trim();
    const productoId = document.getElementById('formPromoProducto').value;
    if (!nombre || !productoId) { mostrarToast('Completa nombre y producto', 'error'); return; }

    const btn = document.getElementById('btnGuardarPromo');
    if (btn && btn.disabled) return;
    const textoOriginal = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = 'Guardando...'; }

    try {
        const promo = {
            id,
            tipo: document.getElementById('formPromoTipo').value,
            nombre,
            descripcion: document.getElementById('formPromoDescripcion').value.trim(),
            productoId,
            presentacion: document.getElementById('formPromoPresentacion').value,
            cantidadMinima: parseInt(document.getElementById('formPromoCantidad').value) || 1,
            precioEspecial: parseInt(document.getElementById('formPromoPrecio').value) || 0,
            productoGratisId: document.getElementById('formPromoProductoGratis')?.value || null,
            cantidadGratis: parseInt(document.getElementById('formPromoCantidadGratis').value) || 1,
            activa: document.getElementById('formPromoActiva').checked,
            fechaInicio: document.getElementById('formPromoFechaInicio').value,
            fechaFin: document.getElementById('formPromoFechaFin').value
        };

        const promos = await cargarPromocionesDesdeStorage();
        const idx = promos.findIndex(p => p.id === id);
        if (idx >= 0) promos[idx] = promo;
        else promos.push(promo);
        await guardarPromocionesEnStorage(promos);

        if (typeof db !== 'undefined') {
            db.collection('promociones').doc(id).set(promo).catch(e => console.error(e));
        }

        cerrarModalPromocion();
        cargarPromociones();
        mostrarToast('Promocion guardada', 'success');
    } catch (err) {
        console.error('[Promos] Error:', err);
        mostrarToast('Error al guardar promocion', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
    }
}

async function togglePromocion(promoId) {
    const promos = await cargarPromocionesDesdeStorage();
    const p = promos.find(pr => pr.id === promoId);
    if (p) { p.activa = !p.activa; await guardarPromocionesEnStorage(promos); cargarPromociones(); }
}

async function eliminarPromocion(promoId) {
    if (!await mostrarConfirmModal('¿Eliminar esta promocion?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    let promos = await cargarPromocionesDesdeStorage();
    promos = promos.filter(p => p.id !== promoId);
    await guardarPromocionesEnStorage(promos);
    cargarPromociones();
}

// ============================================
// RENDICIONES DE CAJA Y GASTOS
// ============================================

function obtenerSemanaActual() {
    const now = new Date();
    const year = now.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const week = Math.ceil(((now - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

function obtenerRangoSemana(weekStr) {
    if (!weekStr) weekStr = obtenerSemanaActual();
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

async function cargarRendiciones() {
    const weekInput = document.getElementById('rendSemana');
    if (!weekInput.value) weekInput.value = obtenerSemanaActual();
    const { inicio, fin } = obtenerRangoSemana(weekInput.value);

    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const gastos = (await HDVStorage.getItem('hdv_gastos')) || [];

    // Filtrar pedidos de la semana
    const pedidosSemana = pedidos.filter(p => {
        const fecha = new Date(p.fecha);
        return fecha >= inicio && fecha <= fin;
    });

    const totalContado = pedidosSemana
        .filter(p => p.tipoPago === 'contado' && (p.estado === 'entregado' || p.estado === 'pendiente'))
        .reduce((sum, p) => sum + (p.total || 0), 0);
    const totalCredito = pedidosSemana
        .filter(p => p.tipoPago === 'credito')
        .reduce((sum, p) => sum + (p.total || 0), 0);

    // Gastos de la semana
    const gastosSemana = gastos.filter(g => {
        const fecha = new Date(g.fecha);
        return fecha >= inicio && fecha <= fin;
    });
    const totalGastos = gastosSemana.reduce((sum, g) => sum + (g.monto || 0), 0);
    const aRendir = totalContado - totalGastos;

    document.getElementById('rendContado').textContent = `Gs. ${totalContado.toLocaleString()}`;
    document.getElementById('rendCredito').textContent = `Gs. ${totalCredito.toLocaleString()}`;
    document.getElementById('rendGastos').textContent = `Gs. ${totalGastos.toLocaleString()}`;
    document.getElementById('rendTotal').textContent = `Gs. ${aRendir.toLocaleString()}`;

    // Mostrar gastos
    const gastosEl = document.getElementById('rendGastosLista');
    if (gastosSemana.length === 0) {
        gastosEl.innerHTML = '<p class="p-6 text-center text-gray-500 font-medium">Sin gastos registrados esta semana</p>';
    } else {
        gastosEl.innerHTML = gastosSemana.map(g => `
            <div class="p-4 flex justify-between items-center">
                <div>
                    <p class="font-bold text-gray-800">${escapeHTML(g.concepto)}</p>
                    <p class="text-xs text-gray-400">${new Date(g.fecha).toLocaleDateString('es-PY')}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-red-600">- Gs. ${(g.monto || 0).toLocaleString()}</p>
                    <button onclick="eliminarGastoAdmin('${g.id}')" class="text-xs text-red-400 hover:underline">Eliminar</button>
                </div>
            </div>
        `).join('');
    }

    // Historial de rendiciones
    const rendiciones = (await HDVStorage.getItem('hdv_rendiciones')) || [];
    const histEl = document.getElementById('rendHistorial');
    if (rendiciones.length === 0) {
        histEl.innerHTML = '<p class="p-6 text-center text-gray-500 font-medium">Sin rendiciones anteriores</p>';
    } else {
        histEl.innerHTML = rendiciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).map(r => `
            <div class="p-4 flex justify-between items-center">
                <div>
                    <p class="font-bold text-gray-800">Semana ${r.semana}</p>
                    <p class="text-xs text-gray-400">Rendido: ${new Date(r.fecha).toLocaleDateString('es-PY')} - Contado: Gs. ${(r.contado || 0).toLocaleString()} | Gastos: Gs. ${(r.gastos || 0).toLocaleString()}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold ${r.aRendir >= 0 ? 'text-green-600' : 'text-red-600'}">Gs. ${(r.aRendir || 0).toLocaleString()}</p>
                    <span class="text-xs px-2 py-1 rounded-full ${r.estado === 'rendido' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">${r.estado || 'pendiente'}</span>
                </div>
            </div>
        `).join('');
    }

    // Cuentas bancarias
    cargarCuentasBancariasAdmin();
}

async function eliminarGastoAdmin(gastoId) {
    if (!await mostrarConfirmModal('¿Eliminar este gasto?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    let gastos = (await HDVStorage.getItem('hdv_gastos')) || [];
    gastos = gastos.filter(g => g.id !== gastoId);
    await HDVStorage.setItem('hdv_gastos', gastos);
    if (typeof guardarGastos === 'function') guardarGastos(gastos).catch(e => console.error(e));
    cargarRendiciones();
}

// Cuentas bancarias
async function cargarCuentasBancariasAdmin() {
    const cuentas = (await HDVStorage.getItem('hdv_cuentas_bancarias')) || [];
    const el = document.getElementById('cuentasBancariasAdmin');
    if (cuentas.length === 0) {
        el.innerHTML = '<p class="p-6 text-center text-gray-500 font-medium">Sin cuentas bancarias configuradas</p>';
        return;
    }
    el.innerHTML = cuentas.map(c => `
        <div class="p-4 flex justify-between items-center">
            <div>
                <p class="font-bold text-gray-800">${c.banco} - ${c.tipo === 'ahorro' ? 'Caja de Ahorro' : 'Cuenta Corriente'}${c.alias ? ` <span class="text-blue-600 font-medium">(${c.alias})</span>` : ''}</p>
                <p class="text-sm text-gray-600">Nro: ${c.numero} | ${c.moneda === 'USD' ? 'Dolares' : 'Guaranies'}</p>
                <p class="text-xs text-gray-400">Titular: ${c.titular} | RUC: ${c.ruc || '-'}</p>
            </div>
            <div class="flex gap-2">
                <button onclick="editarCuentaBancaria('${c.id}')" class="text-blue-600 text-sm font-bold hover:underline">Editar</button>
                <button onclick="eliminarCuentaBancaria('${c.id}')" class="text-red-600 text-sm font-bold hover:underline">Eliminar</button>
            </div>
        </div>
    `).join('');
}

async function abrirModalCuentaBancaria(cuentaId) {
    document.getElementById('formCuentaId').value = '';
    document.getElementById('formCuentaBanco').value = '';
    document.getElementById('formCuentaTipo').value = 'ahorro';
    document.getElementById('formCuentaMoneda').value = 'PYG';
    document.getElementById('formCuentaNumero').value = '';
    document.getElementById('formCuentaAlias').value = '';
    document.getElementById('formCuentaTitular').value = 'HDV Distribuciones EAS';
    document.getElementById('formCuentaRUC').value = '';
    if (cuentaId) {
        const cuentas = (await HDVStorage.getItem('hdv_cuentas_bancarias')) || [];
        const c = cuentas.find(x => x.id === cuentaId);
        if (c) {
            document.getElementById('formCuentaId').value = c.id;
            document.getElementById('formCuentaBanco').value = c.banco;
            document.getElementById('formCuentaTipo').value = c.tipo;
            document.getElementById('formCuentaMoneda').value = c.moneda || 'PYG';
            document.getElementById('formCuentaNumero').value = c.numero;
            document.getElementById('formCuentaAlias').value = c.alias || '';
            document.getElementById('formCuentaTitular').value = c.titular;
            document.getElementById('formCuentaRUC').value = c.ruc || '';
        }
    }
    document.getElementById('modalCuentaBancaria').classList.add('show');
}

function cerrarModalCuentaBancaria() {
    document.getElementById('modalCuentaBancaria').classList.remove('show');
}

function editarCuentaBancaria(id) { abrirModalCuentaBancaria(id); }

async function guardarCuentaBancaria() {
    const id = document.getElementById('formCuentaId').value || 'CTA' + Date.now();
    const cuenta = {
        id,
        banco: document.getElementById('formCuentaBanco').value,
        tipo: document.getElementById('formCuentaTipo').value,
        moneda: document.getElementById('formCuentaMoneda').value,
        numero: document.getElementById('formCuentaNumero').value,
        alias: document.getElementById('formCuentaAlias').value,
        titular: document.getElementById('formCuentaTitular').value,
        ruc: document.getElementById('formCuentaRUC').value
    };
    if (!cuenta.banco || !cuenta.numero) { mostrarToast('Banco y numero de cuenta son obligatorios', 'error'); return; }
    let cuentas = (await HDVStorage.getItem('hdv_cuentas_bancarias')) || [];
    const idx = cuentas.findIndex(c => c.id === id);
    if (idx >= 0) cuentas[idx] = cuenta; else cuentas.push(cuenta);
    await HDVStorage.setItem('hdv_cuentas_bancarias', cuentas);
    if (typeof guardarCuentasBancarias === 'function') guardarCuentasBancarias(cuentas).catch(e => console.error(e));
    cerrarModalCuentaBancaria();
    cargarCuentasBancariasAdmin();
    mostrarToast('Cuenta bancaria guardada', 'success');
}

async function eliminarCuentaBancaria(id) {
    if (!await mostrarConfirmModal('¿Eliminar esta cuenta bancaria?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    let cuentas = (await HDVStorage.getItem('hdv_cuentas_bancarias')) || [];
    cuentas = cuentas.filter(c => c.id !== id);
    await HDVStorage.setItem('hdv_cuentas_bancarias', cuentas);
    if (typeof guardarCuentasBancarias === 'function') guardarCuentasBancarias(cuentas).catch(e => console.error(e));
    cargarCuentasBancariasAdmin();
}
