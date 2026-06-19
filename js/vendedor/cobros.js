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

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const allPagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];

    const pedidosCredito = pedidos
        .filter(p => p.cliente?.id === clienteId && p.tipoPago === 'credito')
        .filter(p => _calcularSaldoPedido(p, allPagos) > 0)
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    if (pedidosCredito.length === 0) {
        mostrarToast('Este cliente no tiene deuda pendiente', 'neutral');
        return;
    }

    const deudaTotal = pedidosCredito.reduce((s, p) => s + _calcularSaldoPedido(p, allPagos), 0);

    let drawer = document.getElementById('cobrosDrawer');
    if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'cobrosDrawer';
        drawer.style.cssText = 'position:fixed;inset:0;z-index:160;display:flex;flex-direction:column;background:white;transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.32,0.72,0,1);';
        document.body.appendChild(drawer);
    }

    const filasPedidos = pedidosCredito.map(p => {
        const saldo = _calcularSaldoPedido(p, allPagos);
        const totalPagado = (p.total || 0) - saldo;
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
            ${totalPagado > 0 ? `<div class="flex justify-between text-[11px] text-gray-500 mb-1">
                <span>Ya pagó:</span><span class="text-green-600 font-medium">${formatearGuaranies(totalPagado)}</span>
            </div>` : ''}
            <div class="flex justify-between text-[11px] font-bold mb-3">
                <span class="text-gray-700">Saldo pendiente:</span>
                <span class="text-red-600 text-sm">${formatearGuaranies(saldo)}</span>
            </div>
            <sl-button data-action="registrarPagoCobro" data-arg="${p.id}" variant="primary" size="small" class="w-full">
                Registrar pago
            </sl-button>
        </div>`;
    }).join('');

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
        <div class="px-4 py-3 border-b border-slate-100">
            <sl-button data-action="cobrarTodoEfectivo" data-arg="${clienteId}" variant="success" class="w-full">
                Cobrar todo en efectivo — ${formatearGuaranies(deudaTotal)}
            </sl-button>
        </div>
        <div class="flex-1 overflow-y-auto px-4 pt-4 pb-24">
            <p class="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Deuda por pedido</p>
            ${filasPedidos}
        </div>
    `;

    drawer.style.transform = 'translateY(0)';
    // Guardar contexto para cobros
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
            { id: 'monto', label: `Monto a cobrar (saldo: ${formatearGuaranies(saldo)})`, tipo: 'number', valor: saldo, min: 1, max: saldo, requerido: true },
            { id: 'metodo', label: 'Forma de pago', tipo: 'select', opciones: [
                { value: 'efectivo', label: 'Efectivo' },
                { value: 'transferencia', label: 'Transferencia' },
                { value: 'cheque', label: 'Cheque' }
            ], valor: 'efectivo' },
            { id: 'nota', label: 'Nota (opcional)', tipo: 'text', valor: '' }
        ]
    });

    if (!resultado) return;

    const monto = parseFloat(resultado.monto);
    if (!monto || monto <= 0 || monto > saldo + 1) {
        mostrarToast('Monto inválido', 'error');
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

    const nuevoPago = {
        id: 'PAG-' + crypto.randomUUID(),
        pedidoId,
        monto,
        fecha: new Date().toISOString(),
        metodo: resultado.metodo || 'efectivo',
        nota: resultado.nota || '',
        vendedor_id: window.hdvUsuario?.id || null,
        registrado_por: 'vendedor',
        sincronizado: false
    };

    await HDVStorage.atomicUpdate('hdv_pagos_credito', (pagos) => {
        const list = pagos || [];
        list.push(nuevoPago);
        return list;
    });

    // Sync en background
    if (typeof guardarPagosCredito === 'function') {
        const pagosActualizados = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
        guardarPagosCredito(pagosActualizados).catch(err => console.error('[Cobros] Error sync:', err));
    }

    if (typeof navigator.vibrate === 'function') navigator.vibrate([80, 30, 80]);
    mostrarExito(`Cobro de ${formatearGuaranies(monto)} registrado`);

    // Preguntar si enviar recibo por WhatsApp
    const saldoRestante = Math.max(0, saldo - monto);
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

    const ahora = new Date().toISOString();
    const nuevoPagos = pedidosCredito.map(p => ({
        id: 'PAG-' + crypto.randomUUID(),
        pedidoId: p.id,
        monto: _calcularSaldoPedido(p, allPagos),
        fecha: ahora,
        metodo: 'efectivo',
        nota: 'Cobro total en campo',
        vendedor_id: window.hdvUsuario?.id || null,
        registrado_por: 'vendedor',
        sincronizado: false
    }));

    await HDVStorage.atomicUpdate('hdv_pagos_credito', (pagos) => {
        return (pagos || []).concat(nuevoPagos);
    });

    if (typeof guardarPagosCredito === 'function') {
        const pagosActualizados = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
        guardarPagosCredito(pagosActualizados).catch(err => console.error('[Cobros] Error sync todo:', err));
    }

    if (typeof navigator.vibrate === 'function') navigator.vibrate([100, 50, 100]);
    mostrarExito(`${formatearGuaranies(deudaTotal)} cobrado. ${pedidosCredito.length} pedido(s) saldado(s).`);
    cerrarCobrosDrawer();
}
