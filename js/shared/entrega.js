// ============================================
// HDV — Modal de Entrega (componente compartido vendedor + admin)
// Corazón del ciclo de vida: al marcar ENTREGADO siempre se captura qué
// pago se recibió, mediante 3 opciones.
//
//   • Cobro total      → cobro = total  → estado cobrado_sin_factura → ARCHIVO
//   • Cobro parcial    → cobro = input  → estado entregado (saldo)  → CRÉDITOS
//   • Ingresar créditos→ sin cobro       → estado entregado (total)  → CRÉDITOS
//
// Invariante ERP: el crédito ES el propio pedido (mismo numero_pedido). El saldo
// se calcula como total − Σ pagos(pedidoId) leídos del libro hdv_pagos_credito.
//
// Depende de globals (presentes en vendedor y admin):
//   HDVStorage, actualizarEstadoPedido, guardarPagosCredito, guardarHistorialCreditos,
//   PEDIDO_ESTADOS, COBRO_TIPOS, displayNumPedido, formatearGuaranies, escapeHTML,
//   mostrarToast, mostrarExito, mostrarConfirmModal, window.hdvUsuario
// CSP-safe: sin handlers inline; listeners por addEventListener.
// ============================================

// --- Helpers de libro + historial (reutilizados también por cobros.js) ---

// Suma de pagos de un pedido leídos del libro (fuente de verdad del saldo).
function _entregaTotalPagado(pedidoId, pagos) {
    return (pagos || [])
        .filter(pg => pg.pedidoId === pedidoId)
        .reduce((s, pg) => s + (Number(pg.monto) || 0), 0);
}

// Registra un cobro en el libro unificado hdv_pagos_credito (+ sync en background).
async function registrarCobroLibro({ pedido, monto, tipo, metodo = 'efectivo', nota = '' }) {
    const registro = {
        id: 'PAG-' + crypto.randomUUID(),
        pedidoId: pedido.id,
        numero_pedido: pedido.numero_pedido ?? null,
        tipo: tipo || COBRO_TIPOS.CONTADO,
        monto: Number(monto) || 0,
        fecha: new Date().toISOString(),
        metodo,
        nota,
        clienteId: pedido.cliente?.id || null,
        clienteNombre: pedido.cliente?.nombre || '',
        vendedor_id: pedido.vendedor_id || window.hdvUsuario?.id || null,
        registrado_por: window.hdvUsuario?.rol === 'admin' ? 'admin' : 'vendedor',
        sincronizado: false
    };
    await HDVStorage.atomicUpdate('hdv_pagos_credito', (pagos) => (pagos || []).concat([registro]));
    if (typeof guardarPagosCredito === 'function') {
        const pagosAct = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
        guardarPagosCredito(pagosAct).catch(e => console.error('[Entrega] Error sync libro:', e));
    }
    return registro;
}

// Registra un evento en el historial de créditos (visible en el dashboard admin).
async function registrarEventoHistorialCredito(evento) {
    const item = {
        id: 'HCR-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        fecha: new Date().toISOString(),
        ...evento
    };
    await HDVStorage.atomicUpdate('hdv_historial_creditos', (h) => (h || []).concat([item]));
    if (typeof guardarHistorialCreditos === 'function') {
        const hAct = (await HDVStorage.getItem('hdv_historial_creditos', { clone: false })) || [];
        guardarHistorialCreditos(hAct).catch(e => console.error('[Entrega] Error sync historial:', e));
    }
    return item;
}

// Aplica un cambio de estado: RPC server-side + actualización local atómica.
// Mutator opcional para setear campos extra en el pedido local.
async function _entregaAplicarEstado(pedidoId, nuevoEstado, mutator) {
    let rpcOk = true;
    if (typeof actualizarEstadoPedido === 'function') {
        try { rpcOk = await actualizarEstadoPedido(pedidoId, nuevoEstado); }
        catch (e) { rpcOk = false; }
    }
    await HDVStorage.atomicUpdate('hdv_pedidos', (list) => {
        const p = (list || []).find(x => x.id === pedidoId);
        if (p) { p.estado = nuevoEstado; p.sincronizado = rpcOk; if (typeof mutator === 'function') mutator(p); }
        return list || [];
    });
    if (!rpcOk) mostrarToast('Sin conexión — el cambio se guardó local y se sincronizará luego', 'warning');
    return rpcOk;
}

// Refresca las vistas que existan en el contexto actual (vendedor o admin).
function _entregaRefrescarVistas() {
    if (typeof mostrarMisPedidos === 'function') { try { mostrarMisPedidos(); } catch (_) {} }
    if (typeof _actualizarBadgeCreditos === 'function') { try { _actualizarBadgeCreditos(); } catch (_) {} }
    if (typeof cargarCreditos === 'function') { try { cargarCreditos(); } catch (_) {} }
    if (typeof cargarPedidos === 'function') { try { cargarPedidos(); } catch (_) {} }
    if (typeof cargarDashboard === 'function') { try { cargarDashboard(); } catch (_) {} }
}

// --- Acciones de las 3 opciones ---

async function _entregaCobroTotal(pedido) {
    await registrarCobroLibro({ pedido, monto: pedido.total || 0, tipo: COBRO_TIPOS.CONTADO });
    await registrarEventoHistorialCredito({
        numero_pedido: pedido.numero_pedido ?? null, pedidoId: pedido.id,
        tipo: 'pedido', accion: 'cobro_total', monto: pedido.total || 0,
        saldoAnterior: pedido.total || 0, saldoNuevo: 0,
        clienteNombre: pedido.cliente?.nombre || '',
        registrado_por: window.hdvUsuario?.rol === 'admin' ? 'admin' : 'vendedor',
        vendedor_nombre: window.hdvUsuario?.nombre || ''
    });
    await _entregaAplicarEstado(pedido.id, PEDIDO_ESTADOS.COBRADO, (p) => {
        p.monto_cobrado = pedido.total || 0; p.saldo_credito = 0; p.cobro_parcial = false;
    });
    if (typeof navigator.vibrate === 'function') navigator.vibrate([80, 30, 80]);
    mostrarExito(`Cobro total de ${formatearGuaranies(pedido.total || 0)} registrado`);
}

async function _entregaCobroParcial(pedido, monto) {
    const total = pedido.total || 0;
    const m = Number(monto);
    if (!m || m <= 0 || m >= total) {
        mostrarToast('Monto parcial inválido — debe ser mayor a 0 y menor al total', 'error');
        return false;
    }
    const saldo = Math.max(0, Math.round(total - m));
    await registrarCobroLibro({ pedido, monto: m, tipo: COBRO_TIPOS.CONTADO, nota: 'Cobro parcial en entrega' });
    await registrarEventoHistorialCredito({
        numero_pedido: pedido.numero_pedido ?? null, pedidoId: pedido.id,
        tipo: 'pedido', accion: 'cobro_parcial', monto: m,
        saldoAnterior: total, saldoNuevo: saldo,
        clienteNombre: pedido.cliente?.nombre || '',
        registrado_por: window.hdvUsuario?.rol === 'admin' ? 'admin' : 'vendedor',
        vendedor_nombre: window.hdvUsuario?.nombre || ''
    });
    await _entregaAplicarEstado(pedido.id, PEDIDO_ESTADOS.ENTREGADO, (p) => {
        p.tipoPago = 'credito'; p.cobro_parcial = true; p.monto_cobrado = m; p.saldo_credito = saldo;
    });
    if (typeof navigator.vibrate === 'function') navigator.vibrate([80, 30, 80]);
    mostrarExito(`Cobro parcial de ${formatearGuaranies(m)} — saldo ${formatearGuaranies(saldo)} a créditos`);
    return true;
}

async function _entregaIngresarCredito(pedido) {
    const total = pedido.total || 0;
    await registrarEventoHistorialCredito({
        numero_pedido: pedido.numero_pedido ?? null, pedidoId: pedido.id,
        tipo: 'pedido', accion: 'ingreso_credito', monto: 0,
        saldoAnterior: total, saldoNuevo: total,
        clienteNombre: pedido.cliente?.nombre || '',
        registrado_por: window.hdvUsuario?.rol === 'admin' ? 'admin' : 'vendedor',
        vendedor_nombre: window.hdvUsuario?.nombre || ''
    });
    await _entregaAplicarEstado(pedido.id, PEDIDO_ESTADOS.ENTREGADO, (p) => {
        p.tipoPago = 'credito'; p.cobro_parcial = false; p.monto_cobrado = 0; p.saldo_credito = total;
    });
    if (typeof navigator.vibrate === 'function') navigator.vibrate(60);
    mostrarExito(`Pedido a créditos por ${formatearGuaranies(total)}`);
}

// --- Modal ---

async function abrirModalEntrega(pedidoId) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) { mostrarToast('Pedido no encontrado', 'error'); return; }

    const total = pedido.total || 0;
    const ref = displayNumPedido(pedido);
    const cliente = pedido.cliente?.nombre || 'Cliente';

    let dlg = document.getElementById('modalEntregaPedido');
    if (!dlg) {
        dlg = document.createElement('sl-dialog');
        dlg.id = 'modalEntregaPedido';
        dlg.style.setProperty('--width', '26rem');
        document.body.appendChild(dlg);
    }
    dlg.label = `Entregar ${ref}`;
    dlg.innerHTML = `
        <div class="space-y-4">
            <div class="bg-slate-50 rounded-xl p-3">
                <p class="text-xs text-slate-400 font-mono">${escapeHTML(ref)}</p>
                <p class="font-bold text-gray-800">${escapeHTML(cliente)}</p>
                <p class="text-lg font-bold text-gray-900">${formatearGuaranies(total)}</p>
            </div>
            <p class="text-sm font-semibold text-gray-600">¿Qué pago recibiste?</p>

            <button id="btnEntregaTotal"
                class="w-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                <i data-lucide="circle-check" class="w-4 h-4 pointer-events-none"></i>
                Cobro total — ${formatearGuaranies(total)}
            </button>

            <div class="border border-amber-200 rounded-xl p-3 space-y-2">
                <label class="text-xs font-semibold text-amber-700">Cobro parcial (lo que recibiste)</label>
                <sl-input id="inputEntregaParcial" type="number" min="1" placeholder="0" size="small"></sl-input>
                <button id="btnEntregaParcial"
                    class="w-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                    <i data-lucide="coins" class="w-4 h-4 pointer-events-none"></i>
                    Cobro parcial → saldo a créditos
                </button>
            </div>

            <button id="btnEntregaCredito"
                class="w-full bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                <i data-lucide="clock" class="w-4 h-4 pointer-events-none"></i>
                Ingresar todo a créditos
            </button>
        </div>
        <sl-button slot="footer" variant="default" id="btnEntregaCancelar">Cancelar</sl-button>
    `;
    dlg.show();
    if (typeof lucide !== 'undefined') lucide.createIcons();

    const cerrar = () => dlg.hide();
    const correr = async (fn) => {
        dlg.querySelectorAll('button').forEach(b => b.disabled = true);
        try { const r = await fn(); if (r !== false) { cerrar(); _entregaRefrescarVistas(); } }
        finally { dlg.querySelectorAll('button').forEach(b => b.disabled = false); }
    };

    dlg.querySelector('#btnEntregaTotal').addEventListener('click', () => correr(() => _entregaCobroTotal(pedido)));
    dlg.querySelector('#btnEntregaParcial').addEventListener('click', () => {
        const val = dlg.querySelector('#inputEntregaParcial')?.value;
        return correr(() => _entregaCobroParcial(pedido, val));
    });
    dlg.querySelector('#btnEntregaCredito').addEventListener('click', () => correr(() => _entregaIngresarCredito(pedido)));
    dlg.querySelector('#btnEntregaCancelar').addEventListener('click', cerrar);
}

// Exponer helpers reutilizables para cobros.js (Fase 3)
window.registrarCobroLibro = registrarCobroLibro;
window.registrarEventoHistorialCredito = registrarEventoHistorialCredito;
window.abrirModalEntrega = abrirModalEntrega;
