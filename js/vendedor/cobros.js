// ============================================
// HDV Vendedor — Cobros en Campo
// Permite al vendedor registrar pagos de créditos en terreno.
// Depende de: HDVStorage, guardarPagosCredito, formatearGuaranies,
//             mostrarConfirmModal, mostrarInputModal, mostrarToast,
//             mostrarExito, escapeHTML, _templateWA, _formatearTelefonoWA
// ============================================

// ============================================
// HELPERS DE COBROS
// ============================================

function _calcularSaldoPedido(pedido, pagos) {
    const totalPagado = pagos
        .filter(pg => pg.pedidoId === pedido.id)
        .reduce((s, pg) => s + (pg.monto || 0), 0);
    return Math.max(0, (pedido.total || 0) - totalPagado);
}

function _saldoCreditoManual(credito) {
    const totalPagado = (credito.pagos || []).reduce((s, p) => s + (p.monto || 0), 0);
    return Math.max(0, (credito.monto || 0) - totalPagado);
}

// Escribe en hdv_historial_creditos y sincroniza con Supabase — visible tanto en admin como en vendedor
async function _registrarHistorialCredito(evento) {
    const historial = (await HDVStorage.getItem('hdv_historial_creditos')) || [];
    historial.push({ id: 'HCR-' + Date.now(), ...evento, fecha: new Date().toISOString() });
    await HDVStorage.setItem('hdv_historial_creditos', historial);
    if (typeof guardarHistorialCreditos === 'function') {
        guardarHistorialCreditos(historial).catch(e => console.error('[Cobros] Error sync historial:', e));
    }
}

function _badgeAging(fechaPedido) {
    const dias = Math.floor((Date.now() - new Date(fechaPedido)) / 86400000);
    if (dias <= 7)  return { texto: `${dias}d`,             clase: 'bg-green-100 text-green-700' };
    if (dias <= 15) return { texto: `${dias}d`,             clase: 'bg-yellow-100 text-yellow-700' };
    if (dias <= 30) return { texto: `⚠️ ${dias}d`,          clase: 'bg-orange-100 text-orange-700' };
    return           { texto: `🔴 VENCIDO ${dias}d`,        clase: 'bg-red-100 text-red-700' };
}

// ============================================
// DRAWER DE COBROS
// ============================================

async function abrirCobrosCliente(clienteId) {
    const clientes_local = typeof clientes !== 'undefined' ? clientes : [];
    const cliente = clientes_local.find(c => c.id === clienteId);
    if (!cliente) return;

    const pedidos         = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const allPagos        = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];

    // Créditos del sistema = pedidos ENTREGADOS con saldo pendiente (por su número).
    const pedidosCredito = pedidos
        .filter(p => p.cliente?.id === clienteId && p.estado === PEDIDO_ESTADOS.ENTREGADO)
        .filter(p => _calcularSaldoPedido(p, allPagos) > 0)
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Créditos manuales = recordatorios personales del dueño: el vendedor no los cobra.
    const manualesCliente = [];

    if (pedidosCredito.length === 0 && manualesCliente.length === 0) {
        mostrarToast('Este cliente no tiene deuda pendiente', 'neutral');
        return;
    }

    const deudaPedidos  = pedidosCredito.reduce((s, p) => s + _calcularSaldoPedido(p, allPagos), 0);
    const deudaManuales = manualesCliente.reduce((s, c) => s + _saldoCreditoManual(c), 0);
    const deudaTotal    = deudaPedidos + deudaManuales;

    let drawer = document.getElementById('cobrosDrawer');
    if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'cobrosDrawer';
        drawer.style.cssText = 'position:fixed;inset:0;z-index:160;display:flex;flex-direction:column;background:var(--ground);color:var(--ink);transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.32,0.72,0,1);';
        document.body.appendChild(drawer);
    }

    const filasPedidos = pedidosCredito.map(p => {
        const saldo = _calcularSaldoPedido(p, allPagos);
        const totalPagado = (p.total || 0) - saldo;
        const pct = p.total > 0 ? Math.min(100, Math.round((totalPagado / p.total) * 100)) : 0;
        const aging = _badgeAging(p.fecha);
        const fechaStr = new Date(p.fecha).toLocaleDateString('es-PY');
        return `<div class="bg-white border border-slate-100 rounded-xl p-3 mb-2 shadow-sm">
            <div class="flex items-start justify-between mb-2">
                <div>
                    <p class="text-[10px] font-mono text-gray-400">${escapeHTML(p.id)}</p>
                    <p class="text-xs text-gray-500">${fechaStr}</p>
                    <p class="font-bold text-gray-800">${formatearGuaranies(p.total || 0)} total</p>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${aging.clase}">${aging.texto}</span>
            </div>
            <div class="mb-2">
                <div class="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>${totalPagado > 0 ? `Pagado: ${formatearGuaranies(totalPagado)}` : 'Sin pagos'}</span>
                    <span class="font-bold ${pct >= 100 ? 'text-green-600' : pct > 0 ? 'text-amber-600' : 'text-gray-400'}">${pct}%</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div class="h-2 rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}" style="width:${pct}%"></div>
                </div>
            </div>
            <div class="flex justify-between text-[11px] font-bold mb-3">
                <span class="text-gray-500">Saldo pendiente:</span>
                <span class="text-red-600 text-sm font-bold">${formatearGuaranies(saldo)}</span>
            </div>
            <sl-button data-action="registrarPagoCobro" data-arg="${p.id}" variant="primary" size="small" class="w-full">
                Registrar pago
            </sl-button>
        </div>`;
    }).join('');

    const filasManuales = manualesCliente.map(c => {
        const saldo = _saldoCreditoManual(c);
        const totalPagado = (c.monto || 0) - saldo;
        const pct = c.monto > 0 ? Math.min(100, Math.round((totalPagado / c.monto) * 100)) : 0;
        const aging = _badgeAging(c.fecha);
        const fechaStr = new Date(c.fecha).toLocaleDateString('es-PY');
        return `<div class="bg-purple-50 border border-purple-100 rounded-xl p-3 mb-2">
            <div class="flex items-start justify-between mb-1">
                <div>
                    <span class="text-[9px] font-bold bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded uppercase">Manual</span>
                    <p class="text-xs font-semibold text-gray-700 mt-1">${escapeHTML(c.descripcion || 'Crédito manual')}</p>
                    <p class="text-xs text-gray-400">${fechaStr}</p>
                    <p class="font-bold text-gray-800">${formatearGuaranies(c.monto || 0)} total</p>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${aging.clase}">${aging.texto}</span>
            </div>
            <div class="mb-2">
                <div class="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>${totalPagado > 0 ? `Pagado: ${formatearGuaranies(totalPagado)}` : 'Sin pagos'}</span>
                    <span class="font-bold ${pct >= 100 ? 'text-green-600' : pct > 0 ? 'text-amber-600' : 'text-gray-400'}">${pct}%</span>
                </div>
                <div class="w-full bg-purple-100 rounded-full h-2 overflow-hidden">
                    <div class="h-2 rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-purple-400'}" style="width:${pct}%"></div>
                </div>
            </div>
            <div class="flex justify-between text-[11px] font-bold mb-3">
                <span class="text-gray-500">Saldo pendiente:</span>
                <span class="text-red-600 text-sm font-bold">${formatearGuaranies(saldo)}</span>
            </div>
            <sl-button data-action="registrarPagoManualVendedor" data-arg="${c.id}" variant="primary" size="small" class="w-full">
                Registrar pago
            </sl-button>
        </div>`;
    }).join('');

    const seccionManuales = manualesCliente.length > 0 ? `
        <p class="text-[11px] font-bold text-purple-400 uppercase tracking-wider mb-3 mt-4">Créditos manuales (${manualesCliente.length})</p>
        ${filasManuales}` : '';

    drawer.innerHTML = `
        <div class="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 border-b border-slate-100 bg-white sticky top-0 z-10">
            <button data-action="cerrarCobrosDrawer" class="text-gray-400 hover:text-gray-600 p-1 -ml-1">
                <i data-lucide="arrow-left" class="w-5 h-5"></i>
            </button>
            <div class="flex-1">
                <p class="font-bold text-gray-800 text-sm">${escapeHTML(cliente.razon_social || cliente.nombre)}</p>
                <p class="text-[11px] text-gray-400">Cobros pendientes</p>
            </div>
        </div>
        <div class="bg-red-50 border-b border-red-100 px-4 py-3 flex items-center justify-between">
            <span class="text-sm font-bold text-red-700">Deuda total</span>
            <span class="text-xl font-bold text-red-700">${formatearGuaranies(deudaTotal)}</span>
        </div>
        ${deudaPedidos > 0 ? `<div class="px-4 py-3 border-b border-slate-100">
            <sl-button data-action="cobrarTodoEfectivo" data-arg="${clienteId}" variant="success" class="w-full">
                Cobrar pedidos en efectivo — ${formatearGuaranies(deudaPedidos)}
            </sl-button>
        </div>` : ''}
        <div class="flex-1 overflow-y-auto px-4 pt-4 pb-24">
            ${pedidosCredito.length > 0 ? `<p class="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Deuda por pedido (${pedidosCredito.length})</p>${filasPedidos}` : ''}
            ${seccionManuales}
        </div>
    `;

    drawer.style.transform = 'translateY(0)';
    drawer._clienteId = clienteId;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function cerrarCobrosDrawer() {
    const drawer = document.getElementById('cobrosDrawer');
    if (drawer) drawer.style.transform = 'translateY(100%)';
}

// ============================================
// REGISTRAR PAGO INDIVIDUAL
// ============================================

async function registrarPagoCobro(pedidoId) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
    const saldo = _calcularSaldoPedido(pedido, allPagos);
    if (saldo <= 0) { mostrarToast('Este pedido ya está saldado', 'neutral'); return; }

    const resultado = await mostrarInputModal({
        titulo: `Pagar — ${pedidoId}`,
        campos: [
            { key: 'monto', label: `Monto a cobrar (saldo: ${formatearGuaranies(saldo)})`, tipo: 'number', valor: saldo, requerido: true },
            { key: 'metodo', label: 'Forma de pago', tipo: 'select', opciones: [
                { value: 'efectivo', label: 'Efectivo' },
                { value: 'transferencia', label: 'Transferencia' },
                { value: 'cheque', label: 'Cheque' }
            ], valor: 'efectivo' },
            { key: 'nota', label: 'Nota (opcional)', tipo: 'text', valor: '' }
        ]
    });

    if (!resultado) return;

    const monto = parseFloat(resultado.monto);
    if (!monto || monto <= 0 || monto > saldo + 0.01) {
        mostrarToast('Monto inválido — debe ser mayor a 0 y no superar el saldo', 'error');
        return;
    }

    // Confirmar si es casi el total (previene doble cobro accidental)
    if (monto >= saldo * 0.99 && saldo > 0) {
        const ok = await mostrarConfirmModal(
            `¿Confirmar cobro total de ${formatearGuaranies(monto)} para el pedido ${pedidoId}?`,
            { confirmLabel: 'Confirmar', cancelLabel: 'Revisar' }
        );
        if (!ok) return;
    }

    // Registrar en el libro unificado (con numero_pedido) — helper compartido (entrega.js)
    const nuevoPago = await registrarCobroLibro({
        pedido, monto, tipo: COBRO_TIPOS.CREDITO,
        metodo: resultado.metodo || 'efectivo', nota: resultado.nota || ''
    });

    const saldoRestante = Math.max(0, saldo - monto);

    // Evento en el historial de créditos (visible en el dashboard admin)
    await registrarEventoHistorialCredito({
        numero_pedido: pedido.numero_pedido ?? null, pedidoId,
        tipo: 'pedido', accion: 'pago_registrado', monto,
        saldoAnterior: saldo, saldoNuevo: saldoRestante,
        clienteNombre: pedido.cliente?.nombre || '',
        metodo: nuevoPago.metodo, nota: nuevoPago.nota,
        registrado_por: 'vendedor', vendedor_nombre: window.hdvUsuario?.nombre || ''
    });

    // Si quedó saldado, cerrar el pedido → sale de Créditos, entra a Archivo
    if (saldoRestante <= 0) {
        let rpcOk = true;
        if (typeof actualizarEstadoPedido === 'function') {
            try { rpcOk = await actualizarEstadoPedido(pedidoId, PEDIDO_ESTADOS.COBRADO); }
            catch (e) { rpcOk = false; }
        }
        await HDVStorage.atomicUpdate('hdv_pedidos', (list) => {
            const p = (list || []).find(x => x.id === pedidoId);
            if (p) { p.estado = PEDIDO_ESTADOS.COBRADO; p.saldo_credito = 0; p.sincronizado = rpcOk; }
            return list || [];
        });
        await registrarEventoHistorialCredito({
            numero_pedido: pedido.numero_pedido ?? null, pedidoId,
            tipo: 'pedido', accion: 'credito_saldado', monto: 0,
            saldoAnterior: 0, saldoNuevo: 0,
            clienteNombre: pedido.cliente?.nombre || '', registrado_por: 'vendedor'
        });
    }

    if (typeof navigator.vibrate === 'function') navigator.vibrate([80, 30, 80]);
    mostrarExito(saldoRestante <= 0
        ? `Crédito saldado — ${formatearGuaranies(monto)} cobrado`
        : `Cobro de ${formatearGuaranies(monto)} registrado`);

    // Preguntar si enviar recibo por WhatsApp
    const enviarWA = await mostrarConfirmModal(
        `¿Enviar recibo de cobro por WhatsApp al cliente?`,
        { confirmLabel: 'Sí, enviar', cancelLabel: 'No' }
    );
    if (enviarWA) {
        const msgData = { pedidoId, monto, metodo: nuevoPago.metodo, fecha: nuevoPago.fecha, saldoRestante };
        const msg = typeof _templateWA === 'function' ? _templateWA('recibo_cobro', msgData) : '';
        if (msg) {
            const tel = typeof _formatearTelefonoWA === 'function' ? _formatearTelefonoWA(pedido.cliente?.telefono) : '';
            window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
        }
    }

    // Reabrir el drawer actualizado
    const clienteId = pedido.cliente?.id;
    if (clienteId) {
        cerrarCobrosDrawer();
        setTimeout(() => abrirCobrosCliente(clienteId), 400);
    }
}

// ============================================
// REGISTRAR PAGO EN CREDITO MANUAL (creado por admin)
// ============================================

async function registrarPagoManualVendedor(creditoId) {
    const creditosManuales = (await HDVStorage.getItem('hdv_creditos_manuales', { clone: false })) || [];
    const credito = creditosManuales.find(c => c.id === creditoId);
    if (!credito) { mostrarToast('Crédito no encontrado', 'error'); return; }

    const saldo = _saldoCreditoManual(credito);
    if (saldo <= 0) { mostrarToast('Este crédito ya está saldado', 'neutral'); return; }

    const resultado = await mostrarInputModal({
        titulo: `Pagar — ${credito.descripcion || 'Crédito manual'}`,
        subtitulo: `Cliente: ${credito.clienteNombre || 'N/A'}`,
        icono: 'banknote',
        campos: [
            { key: 'monto', label: `Monto a cobrar (saldo: ${formatearGuaranies(saldo)})`, tipo: 'number', valor: saldo, requerido: true },
            { key: 'metodo', label: 'Forma de pago', tipo: 'select', opciones: [
                { value: 'efectivo', label: 'Efectivo' },
                { value: 'transferencia', label: 'Transferencia' },
                { value: 'cheque', label: 'Cheque' }
            ], valor: 'efectivo' },
            { key: 'nota', label: 'Nota (opcional)', tipo: 'text', valor: '' }
        ]
    });

    if (!resultado) return;

    const monto = parseFloat(resultado.monto);
    if (!monto || monto <= 0 || monto > saldo + 0.01) {
        mostrarToast('Monto inválido — debe ser mayor a 0 y no superar el saldo', 'error');
        return;
    }

    const ahora = new Date().toISOString();
    const pagoObj = {
        monto,
        fecha: ahora,
        metodo: resultado.metodo || 'efectivo',
        nota: resultado.nota || '',
        registrado_por: 'vendedor',
        vendedor_id: window.hdvUsuario?.id || null,
        vendedor_nombre: window.hdvUsuario?.nombre || ''
    };

    // 1. Actualizar hdv_creditos_manuales → admin ve el pago inmediatamente
    const creditosAct = (await HDVStorage.getItem('hdv_creditos_manuales')) || [];
    const credAct = creditosAct.find(c => c.id === creditoId);
    if (credAct) {
        if (!credAct.pagos) credAct.pagos = [];
        credAct.pagos.push(pagoObj);
        const saldoNuevo = _saldoCreditoManual(credAct);
        if (saldoNuevo <= 0) credAct.pagado = true;
    }
    await HDVStorage.setItem('hdv_creditos_manuales', creditosAct);
    if (typeof guardarCreditosManuales === 'function') {
        guardarCreditosManuales(creditosAct).catch(e => console.error('[Cobros] Error sync creditos manuales:', e));
    }

    // Lifecycle v2: los créditos manuales son recordatorios personales AISLADOS.
    // NO se registran en el libro del sistema (hdv_pagos_credito) ni en el
    // historial de créditos del dashboard. Solo viven en hdv_creditos_manuales.
    const saldoNuevo = Math.max(0, saldo - monto);

    if (typeof navigator.vibrate === 'function') navigator.vibrate([80, 30, 80]);
    mostrarExito(`Cobro de ${formatearGuaranies(monto)} registrado`);

    // Preguntar WhatsApp
    const enviarWA = await mostrarConfirmModal(
        '¿Enviar recibo de cobro por WhatsApp al cliente?',
        { confirmLabel: 'Sí, enviar', cancelLabel: 'No' }
    );
    if (enviarWA) {
        const msg = `🏪 *HDV Distribuciones*\n✅ *Recibo de Cobro*\n👤 ${credito.clienteNombre || ''}\n📋 ${credito.descripcion || 'Crédito manual'}\n💰 Cobrado: ${formatearGuaranies(monto)}\n📊 Saldo restante: ${formatearGuaranies(saldoNuevo)}\n📅 ${new Date(ahora).toLocaleDateString('es-PY')}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }

    // Reabrir drawer actualizado
    const clienteId = credito.clienteId;
    cerrarCobrosDrawer();
    if (clienteId) setTimeout(() => abrirCobrosCliente(clienteId), 400);
}

// ============================================
// COBRAR TODO EN EFECTIVO (atajo rápido)
// ============================================

async function cobrarTodoEfectivo(clienteId) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];

    const pedidosCredito = pedidos
        .filter(p => p.cliente?.id === clienteId && p.tipoPago === 'credito')
        .filter(p => _calcularSaldoPedido(p, allPagos) > 0);

    const deudaTotal = pedidosCredito.reduce((s, p) => s + _calcularSaldoPedido(p, allPagos), 0);
    if (deudaTotal <= 0) return;

    const ok = await mostrarConfirmModal(
        `¿Registrar cobro total de ${formatearGuaranies(deudaTotal)} en efectivo por ${pedidosCredito.length} pedido(s)?`,
        { confirmLabel: 'Sí, cobrar todo', cancelLabel: 'Cancelar' }
    );
    if (!ok) return;

    // Registrar cada cobro en el libro unificado (con numero_pedido) + historial,
    // y cerrar cada pedido saldado → sale de Créditos, entra a Archivo.
    for (const p of pedidosCredito) {
        const saldoP = _calcularSaldoPedido(p, allPagos);
        await registrarCobroLibro({ pedido: p, monto: saldoP, tipo: COBRO_TIPOS.CREDITO, nota: 'Cobro total en campo' });
        await registrarEventoHistorialCredito({
            numero_pedido: p.numero_pedido ?? null, pedidoId: p.id,
            tipo: 'pedido', accion: 'credito_saldado', monto: saldoP,
            saldoAnterior: saldoP, saldoNuevo: 0,
            clienteNombre: p.cliente?.nombre || '', registrado_por: 'vendedor'
        });
    }

    await HDVStorage.atomicUpdate('hdv_pedidos', (list) => {
        const updated = list || [];
        pedidosCredito.forEach(p => {
            const found = updated.find(x => x.id === p.id);
            if (found) { found.estado = PEDIDO_ESTADOS.COBRADO; found.saldo_credito = 0; }
        });
        return updated;
    });
    if (typeof actualizarEstadoPedido === 'function') {
        pedidosCredito.forEach(p => {
            actualizarEstadoPedido(p.id, PEDIDO_ESTADOS.COBRADO)
                .catch(err => console.error('[Cobros] Error sync estado pedido:', err));
        });
    }

    if (typeof navigator.vibrate === 'function') navigator.vibrate([100, 50, 100]);
    mostrarExito(`${formatearGuaranies(deudaTotal)} cobrado. ${pedidosCredito.length} pedido(s) saldado(s).`);
    cerrarCobrosDrawer();
}
