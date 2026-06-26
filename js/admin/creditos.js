// ============================================
// HDV Admin - Modulo de Creditos
// Sistema de creditos, pagos parciales, promociones, rendiciones, cuentas bancarias
// Depende de globals: todosLosPedidos, productosData
// ============================================

let chartCred = null;
let chartCredPie = null;
let _diasVencimientoCredito = 15;

async function _cargarConfigCreditos() {
    try {
        const config = await HDVStorage.getItem('hdv_config_creditos');
        if (config && config.diasVencimiento > 0) {
            _diasVencimientoCredito = config.diasVencimiento;
            const el = document.getElementById('configDiasVencimiento');
            if (el) el.value = _diasVencimientoCredito;
        }
    } catch (e) {}
}
_cargarConfigCreditos();

async function guardarConfigCreditos() {
    const el = document.getElementById('configDiasVencimiento');
    const dias = parseInt(el?.value) || 15;
    if (dias < 1 || dias > 365) { mostrarToast('Dias debe ser entre 1 y 365', 'error'); return; }
    _diasVencimientoCredito = dias;
    await HDVStorage.setItem('hdv_config_creditos', { diasVencimiento: dias });
    mostrarExito(`Vencimiento configurado a ${dias} dias`);
}

// ============================================
// HISTORIAL DE CREDITOS — Registro de eventos
// ============================================

async function registrarEventoCredito(evento) {
    const historial = (await HDVStorage.getItem('hdv_historial_creditos')) || [];
    historial.push({
        id: 'HCR' + Date.now(),
        ...evento,
        fecha: new Date().toISOString()
    });
    await HDVStorage.setItem('hdv_historial_creditos', historial);
    if (typeof guardarHistorialCreditos === 'function') {
        try { await guardarHistorialCreditos(historial); } catch(e) { console.error('[Creditos] Error sync historial:', e); }
    }
}

function obtenerEstadoCredito(credito, tipo) {
    if (tipo === 'manual') {
        if (credito.eliminado) return { estado: 'eliminado', clase: 'bg-gray-200 text-gray-700', label: 'Eliminado' };
        if (credito.pagado) return { estado: 'pagado', clase: 'bg-green-100 text-green-800', label: 'Pagado' };
        const saldo = obtenerSaldoManual(credito);
        if (saldo <= 0) return { estado: 'pagado', clase: 'bg-green-100 text-green-800', label: 'Pagado' };
        const dias = calcularDiasDesde(credito.fecha);
        if (dias > _diasVencimientoCredito) return { estado: 'vencido', clase: 'bg-red-100 text-red-800', label: 'Vencido' };
        if ((credito.pagos || []).length > 0) return { estado: 'parcial', clase: 'bg-yellow-100 text-yellow-800', label: 'Parcial' };
        return { estado: 'pendiente', clase: 'bg-blue-100 text-blue-800', label: 'Pendiente' };
    }
    // tipo === 'pedido'
    if (credito.estado === PEDIDO_ESTADOS.ANULADO) return { estado: 'anulado', clase: 'bg-red-200 text-red-800', label: 'Anulado' };
    if (credito.estado === PEDIDO_ESTADOS.COBRADO) return { estado: 'pagado', clase: 'bg-green-100 text-green-800', label: 'Saldado' };
    return { estado: 'pendiente', clase: 'bg-blue-100 text-blue-800', label: 'Pendiente' };
}

async function actualizarBadgeCreditosVencer() {
    const badge = document.getElementById('badgeCreditosVencer');
    if (!badge) return;
    try {
        const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
        const pagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
        const umbral = _diasVencimientoCredito - 3;
        let count = 0;

        // Solo créditos del sistema = pedidos entregados con saldo pendiente (manuales no cuentan)
        pedidos.filter(p => p.estado === PEDIDO_ESTADOS.ENTREGADO).forEach(p => {
            const dias = calcularDiasDesde(p.fecha);
            const totalPagado = pagos.filter(pg => pg.pedidoId === p.id).reduce((s, pg) => s + (pg.monto || 0), 0);
            if (totalPagado < (p.total || 0) && dias >= umbral) count++;
        });

        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (e) {}
}

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
    // Créditos del sistema = pedidos ENTREGADOS (con saldo pendiente). Viven aquí por su número.
    const pedidosCredito = todosLosPedidos.filter(p => p.estado === PEDIDO_ESTADOS.ENTREGADO);
    // Créditos manuales = recordatorios personales AISLADOS (no entran en stats del sistema).
    const creditosManuales = (await obtenerCreditosManuales()).filter(c => !c.pagado && !c.eliminado);
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito')) || [];

    // Stats SOLO del sistema (los manuales no cuentan)
    let totalDeuda = 0, totalCobrado = 0;
    pedidosCredito.forEach(p => {
        const pagos = allPagos.filter(pg => pg.pedidoId === p.id);
        const pagado = pagos.reduce((s, pg) => s + (pg.monto || 0), 0);
        totalDeuda += (p.total || 0) - pagado;
        totalCobrado += pagado;
    });

    const clientesUnicos = new Set(pedidosCredito.map(p => p.cliente?.id)).size;

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('totalCreditos', formatearGuaranies(totalDeuda));
    el('totalCobrado', formatearGuaranies(totalCobrado));
    el('clientesConCredito', clientesUnicos);
    el('pedidosCredito', pedidosCredito.length);

    const container = document.getElementById('listaCreditos');
    if (!container) return;

    if (pedidosCredito.length === 0 && creditosManuales.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_ORDERS, 'Sin creditos pendientes', 'No hay pedidos a credito pendientes de pago');
        return;
    }

    container.innerHTML = '';

    // Pedidos a credito
    pedidosCredito.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    for (const p of pedidosCredito) {
        const dias = calcularDiasDesde(p.fecha);
        const saldo = await obtenerSaldoPendiente(p);
        const pagos = await obtenerPagosCredito(p.id);
        const totalPagado = pagos.reduce((s, pg) => s + (pg.monto || 0), 0);
        const esVencido = dias > _diasVencimientoCredito;
        const clienteInfo = productosData.clientes.find(c => c.id === p.cliente?.id);

        if (saldo <= 0) continue; // Ya pagado

        const div = document.createElement('div');
        div.className = `p-5 hover:bg-gray-50 transition-colors ${esVencido ? 'bg-red-50 border-l-4 border-red-500' : ''}`;
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold text-gray-800 text-lg">${escapeHTML(p.cliente?.nombre || 'N/A')}</p>
                    <p class="text-sm text-gray-500">${new Date(p.fecha).toLocaleDateString('es-PY')} - Pedido ${escapeHTML(displayNumPedido(p))}</p>
                </div>
                <div class="text-right">
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${esVencido ? 'bg-red-200 text-red-800' : 'bg-yellow-100 text-yellow-800'}">
                        ${dias} dias ${esVencido ? '- VENCIDO' : ''}
                    </span>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-4 mb-3 text-sm">
                <div><span class="text-gray-500">Total:</span> <strong>${formatearGuaranies(p.total)}</strong></div>
                <div><span class="text-gray-500">Pagado:</span> <strong class="text-green-600">${formatearGuaranies(totalPagado)}</strong></div>
                <div><span class="text-gray-500">Saldo:</span> <strong class="text-red-600">${formatearGuaranies(saldo)}</strong></div>
            </div>
            ${totalPagado > 0 ? `
                <div class="w-full bg-gray-200 rounded-full h-2 mb-3">
                    <div class="bg-green-500 h-2 rounded-full" style="width:${Math.min(100, (totalPagado / p.total * 100)).toFixed(0)}%"></div>
                </div>` : ''}
            <div class="flex gap-2 flex-wrap">
                <sl-button data-action="registrarPagoCredito" data-arg="${p.id}" variant="success" size="small">Registrar Pago</sl-button>
                <sl-button data-action="enviarRecordatorioWhatsApp" data-arg="${p.id}" variant="success" size="small">WhatsApp</sl-button>
                <sl-button data-action="verHistorialPagos" data-arg="${p.id}" variant="default" size="small">Historial</sl-button>
                ${saldo <= 0 ? `<sl-button data-action="marcarPagado" data-arg="${p.id}" variant="primary" size="small">Marcar Pagado</sl-button>` : ''}
                <sl-button data-action="editarPagosCreditoPedido" data-arg="${p.id}" variant="warning" size="small">Editar Pagos</sl-button>
                <sl-button data-action="eliminarCreditoPedido" data-arg="${p.id}" variant="danger" size="small">Eliminar</sl-button>
            </div>`;
        container.appendChild(div);
    }

    // Creditos manuales = recordatorios personales aislados (no afectan stats ni el sistema)
    if (creditosManuales.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'px-5 py-2 bg-purple-50 border-y border-purple-100';
        sep.innerHTML = `<p class="text-xs font-bold text-purple-700 uppercase tracking-wider">Recordatorios personales (${creditosManuales.length}) — no afectan el sistema</p>`;
        container.appendChild(sep);
    }
    creditosManuales.forEach(c => {
        const dias = calcularDiasDesde(c.fecha);
        const saldo = obtenerSaldoManual(c);
        const totalPagado = (c.pagos || []).reduce((s, p) => s + (p.monto || 0), 0);
        const esVencido = dias > _diasVencimientoCredito;

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
                <div><span class="text-gray-500">Total:</span> <strong>${formatearGuaranies(c.monto)}</strong></div>
                <div><span class="text-gray-500">Pagado:</span> <strong class="text-green-600">${formatearGuaranies(totalPagado)}</strong></div>
                <div><span class="text-gray-500">Saldo:</span> <strong class="text-red-600">${formatearGuaranies(saldo)}</strong></div>
            </div>
            <div class="flex gap-2 flex-wrap">
                <sl-button data-action="registrarPagoManual" data-arg="${c.id}" variant="success" size="small">Registrar Pago</sl-button>
                <sl-button data-action="enviarRecordatorioManualWhatsApp" data-arg="${c.id}" variant="success" size="small">WhatsApp</sl-button>
                <sl-button data-action="editarCreditoManualItem" data-arg="${c.id}" variant="warning" size="small">Editar</sl-button>
                <sl-button data-action="eliminarCreditoManualItem" data-arg="${c.id}" variant="danger" size="small">Eliminar</sl-button>
            </div>`;
        container.appendChild(div);
    });
}

async function registrarPagoCredito(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const saldo = await obtenerSaldoPendiente(pedido);

    const datos = await mostrarInputModal({
        titulo: 'Registrar Pago',
        subtitulo: `Cliente: ${pedido.cliente?.nombre || 'N/A'} — Saldo: ${formatearGuaranies(saldo)}`,
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

    // Registrar en el libro unificado (con numero_pedido, tipo crédito, registrado_por admin)
    await registrarCobroLibro({ pedido, monto, tipo: COBRO_TIPOS.CREDITO, nota: datos.nota || '' });

    const saldoNuevo = Math.max(0, saldo - monto);
    registrarEventoCredito({ numero_pedido: pedido.numero_pedido ?? null, creditoId: pedidoId, pedidoId, tipo: 'pedido', accion: 'pago_registrado', monto, saldoAnterior: saldo, saldoNuevo, clienteNombre: pedido.cliente?.nombre, nota: datos.nota || '' });

    // Si quedó saldado → cerrar el crédito (sale de Créditos, entra a Archivo)
    if (saldoNuevo <= 0) {
        await marcarPagado(pedidoId);
    }

    mostrarToast(saldoNuevo <= 0
        ? `Crédito saldado — ${formatearGuaranies(monto)} cobrado`
        : `Pago de ${formatearGuaranies(monto)} registrado`, 'success');
    cargarCreditos();
}

async function registrarPagoManual(creditoId) {
    const creditos = await obtenerCreditosManuales();
    const credito = creditos.find(c => c.id === creditoId);
    if (!credito) return;
    const saldo = obtenerSaldoManual(credito);

    const datos = await mostrarInputModal({
        titulo: 'Registrar Pago',
        subtitulo: `Cliente: ${credito.clienteNombre} — Saldo: ${formatearGuaranies(saldo)}`,
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
    registrarEventoCredito({ creditoId, tipo: 'manual', accion: 'pago_registrado', monto, saldoAnterior: saldo, saldoNuevo: saldo - monto, clienteNombre: credito.clienteNombre, nota: datos.nota || '' });
    if (credito.pagado) {
        registrarEventoCredito({ creditoId, tipo: 'manual', accion: 'marcado_pagado', monto: 0, saldoAnterior: saldo - monto, saldoNuevo: 0, clienteNombre: credito.clienteNombre });
    }
    mostrarToast(`Pago de ${formatearGuaranies(monto)} registrado`, 'success');
    cargarCreditos();
}

async function marcarPagado(id) {
    const pedido = todosLosPedidos.find(p => p.id === id);
    await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
        const list = pedidos || [];
        const p = list.find(x => x.id === id);
        if (p) { p.estado = PEDIDO_ESTADOS.COBRADO; p.saldo_credito = 0; }
        return list;
    });
    if (typeof actualizarEstadoPedido === 'function') actualizarEstadoPedido(id, PEDIDO_ESTADOS.COBRADO);
    registrarEventoCredito({ numero_pedido: pedido?.numero_pedido ?? null, creditoId: id, pedidoId: id, tipo: 'pedido', accion: 'credito_saldado', monto: 0, saldoAnterior: 0, saldoNuevo: 0, clienteNombre: pedido?.cliente?.nombre });
    cargarCreditos();
}

async function verHistorialPagos(pedidoId) {
    const pagos = await obtenerPagosCredito(pedidoId);
    if (pagos.length === 0) { mostrarToast('Sin pagos registrados para este credito', 'info'); return; }
    let msg = 'HISTORIAL DE PAGOS\n' + '='.repeat(30) + '\n';
    pagos.forEach((p, i) => {
        msg += `\n${i + 1}. ${formatearGuaranies(p.monto)} - ${new Date(p.fecha).toLocaleDateString('es-PY')}`;
        if (p.nota) msg += ` (${p.nota})`;
    });
    msg += `\n\nTotal pagado: ${formatearGuaranies(pagos.reduce((s, p) => s + p.monto, 0))}`;
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
        .replace(/{monto}/g, formatearGuaranies(pedido.total))
        .replace(/{saldo}/g, formatearGuaranies(saldo))
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
    const mensaje = `Hola ${credito.clienteNombre}, le recordamos que tiene un saldo pendiente de ${formatearGuaranies(saldo)} desde hace ${dias} dias por: ${credito.descripcion}. Agradecemos su pronto pago. HDV Distribuciones`;

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
            try {
                await guardarPlantillaWhatsApp(datos.plantilla);
            } catch (e) {
                console.error('[WhatsApp] Error sincronizando plantilla:', e);
                mostrarToast('Plantilla guardada local pero fallo la sincronizacion', 'warning');
            }
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
    registrarEventoCredito({ creditoId: nuevo.id, tipo: 'manual', accion: 'credito_creado', monto: nuevo.monto, saldoAnterior: 0, saldoNuevo: nuevo.monto, clienteNombre: nombre });

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
    const montoAnterior = c.monto;
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
    registrarEventoCredito({ creditoId, tipo: 'manual', accion: 'editado', monto: datos.monto, saldoAnterior: montoAnterior, saldoNuevo: datos.monto, clienteNombre: c.clienteNombre });
    mostrarToast('Credito actualizado', 'success');
    cargarCreditos();
}

async function eliminarCreditoManualItem(creditoId) {
    const creditos = await obtenerCreditosManuales();
    const c = creditos.find(x => x.id === creditoId);
    if (!c) return;
    if (!await mostrarConfirmModal(`¿Eliminar credito manual de ${c.clienteNombre} (${formatearGuaranies(c.monto)})?\nEl credito se movera al historial como eliminado.`, { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    const saldoAlEliminar = obtenerSaldoManual(c);
    c.eliminado = true;
    c.fechaEliminacion = new Date().toISOString();
    await HDVStorage.setItem('hdv_creditos_manuales', creditos);
    if (typeof guardarCreditosManuales === 'function') {
        try {
            await guardarCreditosManuales(creditos);
        } catch(e) {
            console.error('[Creditos] Error sincronizando eliminacion con Supabase:', e);
        }
    }
    registrarEventoCredito({ creditoId, tipo: 'manual', accion: 'eliminado', monto: c.monto, saldoAnterior: saldoAlEliminar, saldoNuevo: 0, clienteNombre: c.clienteNombre });
    cargarCreditos();
}

async function editarPagosCreditoPedido(pedidoId) {
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito')) || [];
    const pagos = allPagos.filter(p => p.pedidoId === pedidoId);
    if (pagos.length === 0) { mostrarToast('Sin pagos registrados para este pedido', 'info'); return; }

    const pagoOpts = pagos.map((p, i) => ({
        value: String(i),
        label: `${formatearGuaranies(p.monto)} — ${new Date(p.fecha).toLocaleDateString('es-PY')}${p.nota ? ' — ' + p.nota : ''}`
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

    if (!await mostrarConfirmModal(`¿Eliminar pago de ${formatearGuaranies(pagos[idx].monto)}?`, { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    const pagoAEliminar = pagos[idx];
    const pedido = todosLosPedidos.find(p => p.id === pedidoId);
    const totalPagadoAntes = pagos.reduce((s, p) => s + (p.monto || 0), 0);
    const saldoAntes = (pedido?.total || 0) - totalPagadoAntes;
    const saldoDespues = saldoAntes + pagoAEliminar.monto;
    const nuevosPagos = allPagos.filter(p => !(p.pedidoId === pedidoId && p.fecha === pagoAEliminar.fecha && p.monto === pagoAEliminar.monto));
    await HDVStorage.setItem('hdv_pagos_credito', nuevosPagos);
    registrarEventoCredito({ creditoId: pedidoId, tipo: 'pedido', accion: 'pago_eliminado', monto: pagoAEliminar.monto, saldoAnterior: saldoAntes, saldoNuevo: saldoDespues, clienteNombre: pedido?.cliente?.nombre });
    cargarCreditos();
}

async function eliminarCreditoPedido(pedidoId) {
    const pedido = todosLosPedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    if (!await mostrarConfirmModal(`¿Eliminar credito de ${pedido.cliente?.nombre}?\nEl credito se movera al historial como eliminado.`, { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito')) || [];
    const pagos = allPagos.filter(p => p.pedidoId === pedidoId);
    const totalPagado = pagos.reduce((s, p) => s + (p.monto || 0), 0);
    const saldo = (pedido.total || 0) - totalPagado;
    registrarEventoCredito({ creditoId: pedidoId, tipo: 'pedido', accion: 'eliminado', monto: pedido.total, saldoAnterior: saldo, saldoNuevo: 0, clienteNombre: pedido.cliente?.nombre });
    // Marcar como pagado para que salga de la lista activa
    await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
        const list = pedidos || [];
        const p = list.find(x => x.id === pedidoId);
        if (p) p.estado = 'pagado';
        return list;
    });
    if (typeof actualizarEstadoPedido === 'function') actualizarEstadoPedido(pedidoId, 'pagado');
    cargarCreditos();
}

function toggleVistaCreditos(vista) {
    document.getElementById('vistaListaCreditos').style.display = vista === 'lista' ? '' : 'none';
    document.getElementById('vistaResumenCreditos').style.display = vista === 'resumen' ? '' : 'none';
    document.getElementById('vistaGraficosCreditos').style.display = vista === 'graficos' ? '' : 'none';
    document.getElementById('vistaHistorialCreditos').style.display = vista === 'historial' ? '' : 'none';
    if (vista === 'resumen') mostrarDeudaPorCliente();
    if (vista === 'graficos') renderizarGraficoCreditos();
    if (vista === 'historial') cargarHistorialCreditos();
}

async function mostrarDeudaPorCliente() {
    const pedidosCredito = todosLosPedidos.filter(p => p.tipoPago === 'credito' && p.estado !== 'pagado');
    const creditosManuales = (await obtenerCreditosManuales()).filter(c => !c.pagado && !c.eliminado);
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
                        <td class="px-4 py-3 text-center">${formatearGuaranies(d.deuda)}</td>
                        <td class="px-4 py-3 text-center text-green-600 font-bold">${formatearGuaranies(d.pagado)}</td>
                        <td class="px-4 py-3 text-center text-red-600 font-bold">${formatearGuaranies(saldo)}</td>
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
// HISTORIAL DE CREDITOS — Vista y detalle
// ============================================

async function cargarHistorialCreditos() {
    const container = document.getElementById('listaHistorialCreditos');
    if (!container) return;

    const filtroEl = document.getElementById('filtroEstadoHistorial');
    const filtro = filtroEl?.value || 'todos';

    // Recopilar creditos cerrados
    const cerrados = [];

    // Pedidos a credito pagados/anulados
    const pedidosCredito = todosLosPedidos.filter(p => p.tipoPago === 'credito' && (p.estado === 'pagado' || p.estado === 'anulado'));
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito')) || [];
    const historial = (await HDVStorage.getItem('hdv_historial_creditos')) || [];

    for (const p of pedidosCredito) {
        const eventos = historial.filter(e => e.creditoId === p.id);
        const tieneEliminar = eventos.some(e => e.accion === 'eliminado');
        const est = tieneEliminar
            ? { estado: 'eliminado', clase: 'bg-gray-200 text-gray-700', label: 'Eliminado' }
            : obtenerEstadoCredito(p, 'pedido');
        if (filtro !== 'todos' && est.estado !== filtro) continue;
        const pagos = allPagos.filter(pg => pg.pedidoId === p.id);
        const totalPagado = pagos.reduce((s, pg) => s + (pg.monto || 0), 0);
        const fechaCierre = eventos.length > 0 ? eventos[eventos.length - 1].fecha : null;
        cerrados.push({
            id: p.id, tipo: 'pedido', clienteNombre: p.cliente?.nombre || 'N/A',
            monto: p.total, totalPagado, fechaCreacion: p.fecha, fechaCierre,
            estado: est, eventos
        });
    }

    // Creditos manuales cerrados (pagados o eliminados)
    const creditosManuales = await obtenerCreditosManuales();
    for (const c of creditosManuales) {
        if (!c.pagado && !c.eliminado) continue;
        const est = obtenerEstadoCredito(c, 'manual');
        if (filtro !== 'todos' && est.estado !== filtro) continue;
        const totalPagado = (c.pagos || []).reduce((s, p) => s + (p.monto || 0), 0);
        const eventos = historial.filter(e => e.creditoId === c.id);
        const fechaCierre = c.fechaEliminacion || (eventos.length > 0 ? eventos[eventos.length - 1].fecha : null);
        cerrados.push({
            id: c.id, tipo: 'manual', clienteNombre: c.clienteNombre || 'N/A',
            monto: c.monto, totalPagado, fechaCreacion: c.fecha, fechaCierre,
            descripcion: c.descripcion, estado: est, eventos
        });
    }

    // Ordenar por fecha de cierre (mas reciente primero)
    cerrados.sort((a, b) => new Date(b.fechaCierre || b.fechaCreacion) - new Date(a.fechaCierre || a.fechaCreacion));

    if (cerrados.length === 0) {
        container.innerHTML = '<p class="p-8 text-center text-gray-400 italic">Sin creditos en el historial</p>';
        return;
    }

    container.innerHTML = cerrados.map(c => `
        <div class="p-5 hover:bg-gray-50 transition-colors">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold text-gray-800 text-lg">${escapeHTML(c.clienteNombre)}</p>
                    <p class="text-sm text-gray-500">${new Date(c.fechaCreacion).toLocaleDateString('es-PY')} — ${c.tipo === 'manual' ? 'Manual' : 'Pedido'} #${escapeHTML(c.id)}</p>
                    ${c.descripcion ? `<p class="text-xs text-gray-400">${escapeHTML(c.descripcion)}</p>` : ''}
                </div>
                <div class="text-right flex flex-col items-end gap-1">
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${c.estado.clase}">${escapeHTML(c.estado.label)}</span>
                    ${c.fechaCierre ? `<span class="text-xs text-gray-400">Cerrado: ${new Date(c.fechaCierre).toLocaleDateString('es-PY')}</span>` : ''}
                </div>
            </div>
            <div class="grid grid-cols-3 gap-4 mb-3 text-sm">
                <div><span class="text-gray-500">Total:</span> <strong>${formatearGuaranies(c.monto)}</strong></div>
                <div><span class="text-gray-500">Pagado:</span> <strong class="text-green-600">${formatearGuaranies(c.totalPagado)}</strong></div>
                <div><span class="text-gray-500">Saldo final:</span> <strong class="${c.monto - c.totalPagado > 0 ? 'text-red-600' : 'text-green-600'}">${formatearGuaranies(Math.max(0, c.monto - c.totalPagado))}</strong></div>
            </div>
            <sl-button data-action="mostrarDetalleCredito" data-arg="${c.id}" variant="default" size="small">Ver Detalle</sl-button>
        </div>
    `).join('');
}

async function mostrarDetalleCredito(creditoId) {
    const historial = (await HDVStorage.getItem('hdv_historial_creditos')) || [];
    const eventos = historial.filter(e => e.creditoId === creditoId).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const accionLabels = {
        credito_creado: 'Credito creado',
        pago_registrado: 'Pago registrado',
        pago_eliminado: 'Pago eliminado',
        marcado_pagado: 'Marcado como pagado',
        eliminado: 'Eliminado',
        editado: 'Editado',
        anulado: 'Anulado'
    };

    const accionIconos = {
        credito_creado: '🟢',
        pago_registrado: '💰',
        pago_eliminado: '🔴',
        marcado_pagado: '✅',
        eliminado: '🗑️',
        editado: '✏️',
        anulado: '❌'
    };

    let clienteNombre = eventos.length > 0 ? eventos[0].clienteNombre : creditoId;

    const timelineHTML = eventos.length === 0
        ? '<p class="text-center text-gray-400 italic py-4">Sin eventos registrados para este credito</p>'
        : eventos.map(e => `
            <div class="flex gap-3 py-3">
                <div class="flex-shrink-0 text-lg">${accionIconos[e.accion] || '●'}</div>
                <div class="flex-1">
                    <p class="font-bold text-gray-800 text-sm">${accionLabels[e.accion] || e.accion}</p>
                    <p class="text-xs text-gray-500">${new Date(e.fecha).toLocaleString('es-PY')}</p>
                    ${e.monto > 0 ? `<p class="text-sm text-gray-700 mt-1">Monto: <strong>${formatearGuaranies(e.monto)}</strong></p>` : ''}
                    ${e.saldoAnterior !== undefined && e.accion !== 'credito_creado' && e.accion !== 'marcado_pagado' ? `<p class="text-xs text-gray-500">Saldo: ${formatearGuaranies(e.saldoAnterior)} → ${formatearGuaranies(e.saldoNuevo)}</p>` : ''}
                    ${e.nota ? `<p class="text-xs text-gray-400 italic mt-0.5">${escapeHTML(e.nota)}</p>` : ''}
                </div>
            </div>
        `).join('<div class="border-l-2 border-gray-200 ml-3 h-2"></div>');

    // Dialog dinamico
    let dialog = document.getElementById('dialogDetalleCredito');
    if (!dialog) {
        dialog = document.createElement('sl-dialog');
        dialog.id = 'dialogDetalleCredito';
        dialog.style.setProperty('--width', '500px');
        document.body.appendChild(dialog);
    }
    dialog.label = `Detalle: ${escapeHTML(clienteNombre)}`;
    dialog.innerHTML = `<div class="divide-y divide-gray-100">${timelineHTML}</div>`;
    dialog.show();
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
        try {
            await guardarPromociones(promos);
        } catch (e) {
            console.error('[Promos] Error sincronizando promociones:', e);
            mostrarToast('Promociones guardadas local pero fallo la sincronizacion', 'warning');
        }
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
                ${p.tipo !== 'combo' ? ` - Precio: ${formatearGuaranies(p.precioEspecial)}` : ` - Gratis: ${p.cantidadGratis} unid.`}
            </div>
            <div class="text-xs text-gray-400 mb-3">${new Date(p.fechaInicio).toLocaleDateString('es-PY')} al ${new Date(p.fechaFin).toLocaleDateString('es-PY')}</div>
            <div class="flex gap-2">
                <sl-button data-action="abrirModalPromocion" data-arg="${p.id}" variant="primary" size="small">Editar</sl-button>
                <sl-button data-action="togglePromocion" data-arg="${p.id}" variant="default" size="small">${p.activa ? 'Desactivar' : 'Activar'}</sl-button>
                <sl-button data-action="eliminarPromocion" data-arg="${p.id}" variant="danger" size="small">Eliminar</sl-button>
            </div>`;
        container.appendChild(div);
    });
}

async function abrirModalPromocion(promoId) {
    // Poblar selects de productos
    const selectProd = document.getElementById('formPromoProducto');
    const selectGratis = document.getElementById('formPromoProductoGratis');
    if (selectProd) {
        selectProd.innerHTML = '<sl-option value="">-- Seleccionar --</sl-option>' +
            productosData.productos.map(p => `<sl-option value="${escapeHTML(p.id)}">${escapeHTML(p.nombre)}</sl-option>`).join('');
    }
    if (selectGratis) {
        selectGratis.innerHTML = '<sl-option value="">-- Ninguno --</sl-option>' +
            productosData.productos.map(p => `<sl-option value="${escapeHTML(p.id)}">${escapeHTML(p.nombre)}</sl-option>`).join('');
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
    document.getElementById('modalPromocion')?.show();
}

function cerrarModalPromocion() {
    document.getElementById('modalPromocion')?.hide();
}

function actualizarPresentacionesPromo() {
    const prodId = document.getElementById('formPromoProducto')?.value;
    const select = document.getElementById('formPromoPresentacion');
    if (!select) return;
    select.innerHTML = '<sl-option value="todas">Todas</sl-option>';
    if (prodId) {
        const prod = productosData.productos.find(p => p.id === prodId);
        if (prod) {
            prod.presentaciones.forEach(pres => {
                select.innerHTML += `<sl-option value="${escapeHTML(pres.tamano)}">${escapeHTML(pres.tamano)} - ${formatearGuaranies(pres.precio_base)}</sl-option>`;
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

    await withButtonLock('btnGuardarPromo', async () => {
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

        cerrarModalPromocion();
        cargarPromociones();
        mostrarToast('Promocion guardada', 'success');
    }, 'Guardando...')();
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

let _rendPerfilesCache = null;

function obtenerSemanaActual() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
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

function _esEstadoContado(estado) {
    const norm = ESTADOS_ALIAS[estado] || estado;
    return norm === PEDIDO_ESTADOS.ENTREGADO || norm === PEDIDO_ESTADOS.PENDIENTE;
}

async function _obtenerPerfilesRendiciones() {
    if (_rendPerfilesCache) return _rendPerfilesCache;
    try {
        const { data } = await supabaseClient.from('perfiles').select('id, nombre_completo, rol, activo');
        _rendPerfilesCache = (data || []).filter(p => p.rol === 'vendedor');
    } catch (e) { _rendPerfilesCache = []; }
    return _rendPerfilesCache;
}

async function poblarFiltroVendedorRendiciones() {
    const select = document.getElementById('rendVendedor');
    if (!select) return;
    const existentes = select.querySelectorAll('sl-option[data-vendedor-rend]');
    existentes.forEach(el => el.remove());
    const perfiles = await _obtenerPerfilesRendiciones();
    perfiles.forEach(p => {
        const opt = document.createElement('sl-option');
        opt.value = p.id;
        opt.textContent = p.nombre_completo || 'Sin nombre';
        opt.setAttribute('data-vendedor-rend', '');
        select.appendChild(opt);
    });
}

async function cargarRendiciones() {
    const weekInput = document.getElementById('rendSemana');
    if (!weekInput.value) weekInput.value = obtenerSemanaActual();
    const { inicio, fin } = obtenerRangoSemana(weekInput.value);
    const vendedorId = document.getElementById('rendVendedor')?.value || 'todos';

    await poblarFiltroVendedorRendiciones();

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const gastos = (await HDVStorage.getItem('hdv_gastos', { clone: false })) || [];
    const perfiles = await _obtenerPerfilesRendiciones();
    const perfilesMap = {};
    perfiles.forEach(p => { perfilesMap[p.id] = p.nombre_completo || 'Sin nombre'; });

    let pedidosSemana = pedidos.filter(p => {
        const fecha = new Date(p.fecha);
        return fecha >= inicio && fecha <= fin;
    });
    let gastosSemana = gastos.filter(g => {
        const fecha = new Date(g.fecha);
        return fecha >= inicio && fecha <= fin;
    });

    if (vendedorId !== 'todos') {
        pedidosSemana = pedidosSemana.filter(p => p.vendedor_id === vendedorId);
        gastosSemana = gastosSemana.filter(g => g.vendedor_id === vendedorId);
    }

    const totalContado = pedidosSemana
        .filter(p => p.tipoPago === 'contado' && _esEstadoContado(p.estado))
        .reduce((sum, p) => sum + (p.total || 0), 0);
    const totalCredito = pedidosSemana
        .filter(p => p.tipoPago === 'credito')
        .reduce((sum, p) => sum + (p.total || 0), 0);
    const totalGastos = gastosSemana.reduce((sum, g) => sum + (g.monto || 0), 0);
    const aRendir = totalContado - totalGastos;

    document.getElementById('rendContado').textContent = formatearGuaranies(totalContado);
    document.getElementById('rendCredito').textContent = formatearGuaranies(totalCredito);
    document.getElementById('rendGastos').textContent = formatearGuaranies(totalGastos);
    document.getElementById('rendTotal').textContent = formatearGuaranies(aRendir);

    const gastosEl = document.getElementById('rendGastosLista');
    if (gastosSemana.length === 0) {
        gastosEl.innerHTML = '<p class="p-6 text-center text-gray-500 font-medium">Sin gastos registrados esta semana</p>';
    } else {
        gastosEl.innerHTML = gastosSemana.map(g => `
            <div class="p-4 flex justify-between items-center">
                <div>
                    <p class="font-bold text-gray-800">${escapeHTML(g.concepto)}</p>
                    <p class="text-xs text-gray-400">${new Date(g.fecha).toLocaleDateString('es-PY')}${g.vendedor_id && perfilesMap[g.vendedor_id] ? ' — ' + escapeHTML(perfilesMap[g.vendedor_id]) : ''}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-red-600">- ${formatearGuaranies(g.monto)}</p>
                    <sl-button data-action="eliminarGastoAdmin" data-arg="${g.id}" variant="text" size="small">Eliminar</sl-button>
                </div>
            </div>
        `).join('');
    }

    let rendiciones = (await HDVStorage.getItem('hdv_rendiciones')) || [];
    if (vendedorId !== 'todos') {
        rendiciones = rendiciones.filter(r => r.vendedor_id === vendedorId);
    }
    const histEl = document.getElementById('rendHistorial');
    if (rendiciones.length === 0) {
        histEl.innerHTML = '<p class="p-6 text-center text-gray-500 font-medium">Sin rendiciones anteriores</p>';
    } else {
        const estadoClases = {
            'pendiente': 'bg-yellow-100 text-yellow-700',
            'rendido': 'bg-yellow-100 text-yellow-700',
            'aprobado': 'bg-blue-100 text-blue-700',
            'pagado': 'bg-green-100 text-green-700'
        };
        const estadoLabels = {
            'pendiente': 'Pendiente',
            'rendido': 'Pendiente',
            'aprobado': 'Aprobado',
            'pagado': 'Pagado'
        };
        histEl.innerHTML = rendiciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).map(r => {
            const vendNombre = r.vendedor_id && perfilesMap[r.vendedor_id] ? escapeHTML(perfilesMap[r.vendedor_id]) : '';
            const clsEstado = estadoClases[r.estado] || 'bg-gray-100 text-gray-700';
            const lblEstado = estadoLabels[r.estado] || r.estado || 'Pendiente';
            const botonesAccion = (r.estado === 'pendiente' || r.estado === 'rendido')
                ? `<sl-button data-action="aprobarRendicion" data-arg="${r.id}" variant="primary" size="small">Aprobar</sl-button>`
                : r.estado === 'aprobado'
                    ? `<sl-button data-action="marcarRendicionPagada" data-arg="${r.id}" variant="success" size="small">Marcar Pagado</sl-button>`
                    : '';
            return `<div class="p-4 flex justify-between items-center">
                <div>
                    <p class="font-bold text-gray-800">Semana ${r.semana}${vendNombre ? ' — ' + vendNombre : ''}</p>
                    <p class="text-xs text-gray-400">Rendido: ${new Date(r.fecha).toLocaleDateString('es-PY')} - Contado: ${formatearGuaranies(r.contado)} | Gastos: ${formatearGuaranies(r.gastos)}</p>
                </div>
                <div class="text-right flex items-center gap-2">
                    <div>
                        <p class="font-bold ${(r.aRendir || 0) >= 0 ? 'text-green-600' : 'text-red-600'}">${formatearGuaranies(r.aRendir)}</p>
                        <span class="text-xs px-2 py-1 rounded-full ${clsEstado}">${lblEstado}</span>
                    </div>
                    ${botonesAccion}
                </div>
            </div>`;
        }).join('');
    }

    cargarCuentasBancariasAdmin();
}

async function agregarGastoAdmin() {
    const perfiles = await _obtenerPerfilesRendiciones();
    const opcionesVendedor = perfiles.map(p => ({ value: p.id, label: p.nombre_completo || 'Sin nombre' }));
    if (opcionesVendedor.length === 0) { mostrarToast('No hay vendedores registrados', 'warning'); return; }

    const datos = await mostrarInputModal({
        titulo: 'Registrar Gasto (Admin)',
        campos: [
            { key: 'vendedor_id', label: 'Vendedor', tipo: 'select', opciones: opcionesVendedor, requerido: true },
            { key: 'concepto', label: 'Concepto', tipo: 'text', placeholder: 'Ej: Combustible, Almuerzo', requerido: true },
            { key: 'monto', label: 'Monto (Gs.)', tipo: 'number', placeholder: '0', requerido: true }
        ],
        textoConfirmar: 'Registrar'
    });
    if (!datos) return;
    if (datos.monto <= 0) { mostrarToast('Monto invalido', 'error'); return; }

    const gasto = {
        id: 'GA' + Date.now(),
        concepto: datos.concepto,
        monto: datos.monto,
        vendedor_id: datos.vendedor_id,
        origen: 'admin',
        fecha: new Date().toISOString()
    };

    const gastos = (await HDVStorage.getItem('hdv_gastos')) || [];
    gastos.push(gasto);
    await HDVStorage.setItem('hdv_gastos', gastos);
    if (typeof guardarGastos === 'function') {
        try { await guardarGastos(gastos); }
        catch (e) { console.error('[Gastos] Error sincronizando:', e); }
    }
    mostrarExito('Gasto registrado');
    cargarRendiciones();
}

async function eliminarGastoAdmin(gastoId) {
    if (!await mostrarConfirmModal('¿Eliminar este gasto?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    let gastos = (await HDVStorage.getItem('hdv_gastos')) || [];
    gastos = gastos.filter(g => g.id !== gastoId);
    await HDVStorage.setItem('hdv_gastos', gastos);
    if (typeof guardarGastos === 'function') {
        try { await guardarGastos(gastos); }
        catch (e) { console.error('[Gastos] Error sincronizando:', e); mostrarToast('Gasto eliminado local pero fallo la sincronizacion', 'warning'); }
    }
    cargarRendiciones();
}

async function aprobarRendicion(rendId) {
    if (!await mostrarConfirmModal('¿Aprobar esta rendicion?', { textoConfirmar: 'Aprobar' })) return;
    const rendiciones = (await HDVStorage.getItem('hdv_rendiciones')) || [];
    const r = rendiciones.find(x => x.id === rendId);
    if (!r) return;
    r.estado = 'aprobado';
    r.fechaAprobacion = new Date().toISOString();
    await HDVStorage.setItem('hdv_rendiciones', rendiciones);
    if (typeof guardarRendiciones === 'function') {
        try { await guardarRendiciones(rendiciones); }
        catch (e) { console.error('[Rendiciones] Error sincronizando aprobacion:', e); }
    }
    mostrarExito('Rendicion aprobada');
    cargarRendiciones();
}

async function marcarRendicionPagada(rendId) {
    if (!await mostrarConfirmModal('¿Marcar esta rendicion como PAGADA?', { textoConfirmar: 'Marcar Pagado' })) return;
    const rendiciones = (await HDVStorage.getItem('hdv_rendiciones')) || [];
    const r = rendiciones.find(x => x.id === rendId);
    if (!r) return;
    r.estado = 'pagado';
    r.fechaPago = new Date().toISOString();
    await HDVStorage.setItem('hdv_rendiciones', rendiciones);
    if (typeof guardarRendiciones === 'function') {
        try { await guardarRendiciones(rendiciones); }
        catch (e) { console.error('[Rendiciones] Error sincronizando pago:', e); }
    }
    mostrarExito('Rendicion marcada como pagada');
    cargarRendiciones();
}

async function exportarRendicionPDF() {
    if (typeof jspdf === 'undefined' && typeof jsPDF === 'undefined') { mostrarToast('jsPDF no disponible', 'error'); return; }
    const JsPDF = typeof jspdf !== 'undefined' ? jspdf.jsPDF : jsPDF;

    const weekInput = document.getElementById('rendSemana');
    const semana = weekInput?.value || obtenerSemanaActual();
    const { inicio, fin } = obtenerRangoSemana(semana);
    const vendedorId = document.getElementById('rendVendedor')?.value || 'todos';
    const perfiles = await _obtenerPerfilesRendiciones();
    const perfilesMap = {};
    perfiles.forEach(p => { perfilesMap[p.id] = p.nombre_completo || 'Sin nombre'; });

    const vendNombre = vendedorId === 'todos' ? 'Todos los vendedores' : (perfilesMap[vendedorId] || 'Vendedor');
    const contado = document.getElementById('rendContado').textContent;
    const credito = document.getElementById('rendCredito').textContent;
    const gastos = document.getElementById('rendGastos').textContent;
    const aRendir = document.getElementById('rendTotal').textContent;

    const fechaIni = inicio.toLocaleDateString('es-PY');
    const fechaFin = fin.toLocaleDateString('es-PY');

    const doc = new JsPDF({ unit: 'mm', format: 'a4' });
    let y = 20;
    doc.setFontSize(16);
    doc.text('HDV Distribuciones — Rendicion de Caja', 15, y);
    y += 10;
    doc.setFontSize(11);
    doc.text(`Vendedor: ${vendNombre}`, 15, y); y += 7;
    doc.text(`Semana: ${semana} (${fechaIni} - ${fechaFin})`, 15, y); y += 7;
    doc.text(`Fecha de emision: ${new Date().toLocaleDateString('es-PY')}`, 15, y); y += 12;

    doc.setFontSize(12);
    doc.text('Resumen', 15, y); y += 8;
    doc.setFontSize(11);
    doc.text(`Contado cobrado:    ${contado}`, 20, y); y += 7;
    doc.text(`Credito entregado:  ${credito}`, 20, y); y += 7;
    doc.text(`Gastos:             ${gastos}`, 20, y); y += 7;
    doc.setFontSize(13);
    doc.text(`A RENDIR EN MANO:   ${aRendir}`, 20, y); y += 12;

    const gastosData = (await HDVStorage.getItem('hdv_gastos', { clone: false })) || [];
    let gastosSemana = gastosData.filter(g => {
        const f = new Date(g.fecha);
        return f >= inicio && f <= fin;
    });
    if (vendedorId !== 'todos') gastosSemana = gastosSemana.filter(g => g.vendedor_id === vendedorId);

    if (gastosSemana.length > 0) {
        doc.setFontSize(12);
        doc.text('Detalle de Gastos', 15, y); y += 8;
        doc.setFontSize(10);
        gastosSemana.forEach(g => {
            if (y > 270) { doc.addPage(); y = 20; }
            doc.text(`${new Date(g.fecha).toLocaleDateString('es-PY')}  ${g.concepto}  -${formatearGuaranies(g.monto)}`, 20, y);
            y += 6;
        });
    }

    doc.save(`Rendicion_${semana}_${vendNombre.replace(/\s/g, '_')}.pdf`);
    mostrarExito('PDF generado');
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
                <sl-button data-action="editarCuentaBancaria" data-arg="${c.id}" variant="text" size="small">Editar</sl-button>
                <sl-button data-action="eliminarCuentaBancaria" data-arg="${c.id}" variant="text" size="small">Eliminar</sl-button>
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
    document.getElementById('modalCuentaBancaria').show();
}

function cerrarModalCuentaBancaria() {
    document.getElementById('modalCuentaBancaria').hide();
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
    if (typeof guardarCuentasBancarias === 'function') {
        try { await guardarCuentasBancarias(cuentas); }
        catch (e) { console.error('[Cuentas] Error sincronizando:', e); mostrarToast('Cuenta guardada local pero fallo la sincronizacion', 'warning'); }
    }
    cerrarModalCuentaBancaria();
    cargarCuentasBancariasAdmin();
    mostrarToast('Cuenta bancaria guardada', 'success');
}

async function eliminarCuentaBancaria(id) {
    if (!await mostrarConfirmModal('¿Eliminar esta cuenta bancaria?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    let cuentas = (await HDVStorage.getItem('hdv_cuentas_bancarias')) || [];
    cuentas = cuentas.filter(c => c.id !== id);
    await HDVStorage.setItem('hdv_cuentas_bancarias', cuentas);
    if (typeof guardarCuentasBancarias === 'function') {
        try { await guardarCuentasBancarias(cuentas); }
        catch (e) { console.error('[Cuentas] Error sincronizando eliminacion:', e); mostrarToast('Cuenta eliminada local pero fallo la sincronizacion', 'warning'); }
    }
    cargarCuentasBancariasAdmin();
}

// ============================================
// SHOELACE EVENT LISTENERS (sl-change replaces native onchange)
// ============================================
(function _initCreditosShoelaceListeners() {
    document.getElementById('formPromoTipo')?.addEventListener('sl-change', () => toggleCamposPromo());
    document.getElementById('formPromoProducto')?.addEventListener('sl-change', () => actualizarPresentacionesPromo());
    document.getElementById('rendSemana')?.addEventListener('sl-change', () => cargarRendiciones());
    document.getElementById('rendVendedor')?.addEventListener('sl-change', () => cargarRendiciones());
    document.getElementById('filtroEstadoHistorial')?.addEventListener('sl-change', () => cargarHistorialCreditos());
})();
