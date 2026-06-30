// ============================================
// HDV Vendedor — Cartón (asistente acotado al vendedor)
// SOLO datos del propio vendedor: sus pedidos, cobros, créditos, meta, y
// consulta de stock/precio (SIN costos ni datos del negocio global).
// Determinístico (sin LLM), CSP-safe. Requiere: HDVStorage, formatearGuaranies,
// escapeHTML, lucide, globals `productos`.
// ============================================

(function () {
    let _iniciado = false;

    function _esc(s) { return (typeof escapeHTML === 'function') ? escapeHTML(String(s ?? '')) : String(s ?? ''); }
    function _fmt(n) { return (typeof formatearGuaranies === 'function') ? formatearGuaranies(Math.round(n || 0)) : ('Gs. ' + Math.round(n || 0).toLocaleString('es-PY')); }

    const SUGERENCIAS = [
        '¿Cuánto vendí hoy?',
        '¿Cuánto cobré hoy?',
        '¿Qué pedidos tengo pendientes?',
        '¿Quién me debe?',
        '¿Cómo voy con mi meta?',
        'Precio de ...',
    ];

    // ── Acceso a datos (solo del vendedor) ──
    async function _data() {
        const vid = window.hdvUsuario?.id || null;
        const pedidos = ((await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [])
            .filter(p => !vid || p.vendedor_id === vid);
        const pagos = ((await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [])
            .filter(pg => !pg.vendedor_id || pg.vendedor_id === vid);
        const gastos = ((await HDVStorage.getItem('hdv_gastos', { clone: false })) || [])
            .filter(g => !g.vendedor_id || g.vendedor_id === vid);
        const metas = (await HDVStorage.getItem('hdv_metas', { clone: false })) || {};
        return { pedidos, pagos, gastos, metas };
    }

    const _hoy = () => new Date().toISOString().slice(0, 10);

    // ── Intents ──
    async function _responder(q) {
        const t = q.toLowerCase().trim();
        const { pedidos, pagos, gastos, metas } = await _data();
        const hoy = _hoy();

        // Ventas hoy
        if (/vend[ií]|venta|vent[ae]s/.test(t) && !/ayer|semana|mes/.test(t)) {
            const ph = pedidos.filter(p => (p.fecha || '').startsWith(hoy));
            const total = ph.reduce((s, p) => s + (p.total || 0), 0);
            return `Hoy levantaste <b>${ph.length}</b> pedido${ph.length === 1 ? '' : 's'} por <b>${_fmt(total)}</b> en total.`;
        }
        // Cobrado hoy
        if (/cobr/.test(t)) {
            const ch = pagos.filter(pg => (pg.fecha || '').slice(0, 10) === hoy).reduce((s, pg) => s + (Number(pg.monto) || 0), 0);
            const gh = gastos.filter(g => (g.fecha || '').startsWith(hoy)).reduce((s, g) => s + (g.monto || 0), 0);
            return `Cobraste <b>${_fmt(ch)}</b> hoy. Con <b>${_fmt(gh)}</b> de gastos, tenés <b>${_fmt(ch - gh)}</b> para rendir.`;
        }
        // Meta
        if (/meta|objetiv|c[oó]mo voy|como voy/.test(t)) {
            const ph = pedidos.filter(p => (p.fecha || '').startsWith(hoy));
            const vendido = ph.reduce((s, p) => s + (p.total || 0), 0);
            const md = metas.diaria || 0;
            if (!md) return 'No tenés una meta diaria configurada todavía.';
            const pct = Math.round((vendido / md) * 100);
            const emoji = pct >= 100 ? '🟢' : pct >= 70 ? '🟡' : '🔴';
            return `${emoji} Vas <b>${pct}%</b> de tu meta diaria: <b>${_fmt(vendido)}</b> de <b>${_fmt(md)}</b>.` +
                (pct < 100 ? ` Te faltan <b>${_fmt(md - vendido)}</b>.` : ' ¡Meta cumplida! 🎉');
        }
        // Pendientes
        if (/pendient|por entregar|falta entregar/.test(t)) {
            const pend = pedidos.filter(p => p.estado === 'pedido_pendiente');
            if (!pend.length) return 'No tenés pedidos pendientes. ✅';
            const lista = pend.slice(0, 8).map(p => `• ${_esc(p.cliente?.nombre || p.clienteNombre || 'Cliente')} — ${_fmt(p.total)}`).join('<br>');
            return `Tenés <b>${pend.length}</b> pedido${pend.length === 1 ? '' : 's'} pendiente${pend.length === 1 ? '' : 's'}:<br>${lista}`;
        }
        // Créditos / quién me debe
        if (/cr[eé]dito|deb[eo]|saldo|me debe|cobrar/.test(t)) {
            const conSaldo = pedidos.filter(p => p.estado === 'entregado' && (p.saldo || 0) > 0);
            if (!conSaldo.length) return 'No tenés créditos por cobrar. ✅';
            const totalDeuda = conSaldo.reduce((s, p) => s + (p.saldo || 0), 0);
            const lista = conSaldo.slice(0, 8).map(p => `• ${_esc(p.cliente?.nombre || p.clienteNombre || 'Cliente')} — ${_fmt(p.saldo)}`).join('<br>');
            return `Te deben <b>${_fmt(totalDeuda)}</b> en <b>${conSaldo.length}</b> crédito${conSaldo.length === 1 ? '' : 's'}:<br>${lista}`;
        }
        // Entregados hoy
        if (/entreg/.test(t)) {
            const ent = pedidos.filter(p => (p.fecha || '').startsWith(hoy) && (p.estado === 'entregado' || p.estado === 'cobrado_sin_factura'));
            return `Hoy entregaste <b>${ent.length}</b> pedido${ent.length === 1 ? '' : 's'}.`;
        }
        // Stock / precio de un producto
        if (/stock|precio|hay |ten[eé]s|cu[aá]nto cuesta|cu[aá]nto sale/.test(t)) {
            const prods = (typeof productos !== 'undefined' && Array.isArray(productos)) ? productos : [];
            // quitar palabras de comando para quedarnos con el nombre
            const limpio = t.replace(/stock|precio|de |del |la |el |hay |ten[eé]s|cu[aá]nto cuesta|cu[aá]nto sale|\?/g, '').trim();
            if (!limpio) return 'Decime el nombre del producto. Ej: "precio de coca 2L".';
            const found = prods.filter(p => (p.nombre || '').toLowerCase().includes(limpio)).slice(0, 4);
            if (!found.length) return `No encontré ningún producto que coincida con "<b>${_esc(limpio)}</b>".`;
            return found.map(p => {
                const pres = (p.presentaciones || []).filter(v => v.activo !== false).map(v =>
                    `&nbsp;&nbsp;– ${_esc(v.tamano || 'unidad')}: <b>${_fmt(v.precio_base)}</b> · stock ${v.stock ?? 0}`
                ).join('<br>');
                return `<b>${_esc(p.nombre)}</b><br>${pres || '&nbsp;&nbsp;(sin presentaciones)'}`;
            }).join('<br><br>');
        }
        // Ayuda / fallback
        return 'Soy Cartón 🤖, tu asistente. Puedo ayudarte con <b>tus</b> números:<br>' +
            '• Cuánto vendiste / cobraste hoy<br>• Pedidos pendientes<br>• Quién te debe (créditos)<br>• Cómo vas con tu meta<br>• Precio y stock de un producto';
    }

    // ── UI ──
    function _push(rol, html) {
        const cont = document.getElementById('aiVendChatMsgs');
        if (!cont) return;
        const esUser = rol === 'user';
        const div = document.createElement('div');
        div.className = 'flex hdv-bubble-in ' + (esUser ? 'justify-end' : 'justify-start');
        div.innerHTML = `<div class="${esUser ? 'bg-steel text-white' : 'bg-panel-2 text-ink'} rounded-2xl px-3.5 py-2 max-w-[80%] text-sm leading-relaxed">${html}</div>`;
        cont.appendChild(div);
        cont.scrollTop = cont.scrollHeight;
    }

    async function _enviar(texto) {
        const t = (texto || '').trim();
        if (!t) return;
        _push('user', _esc(t));
        const cont = document.getElementById('aiVendChatMsgs');
        const typing = document.createElement('div');
        typing.className = 'flex justify-start hdv-bubble-in';
        typing.innerHTML = `<div class="bg-panel-2 rounded-2xl px-3.5 py-2.5"><span class="hdv-typing"><span></span><span></span><span></span></span></div>`;
        if (cont) { cont.appendChild(typing); cont.scrollTop = cont.scrollHeight; }
        let resp;
        try { resp = await _responder(t); } catch (e) { resp = 'Uy, no pude calcular eso ahora.'; }
        typing.remove();
        _push('bot', resp);
    }

    function _renderSugerencias() {
        const cont = document.getElementById('aiVendSugerencias');
        if (!cont) return;
        cont.innerHTML = SUGERENCIAS.map(s =>
            `<button type="button" class="ai-vend-sug text-xs px-2.5 py-1.5 rounded-full bg-panel-2 text-ink hover:bg-panel-3 transition-colors whitespace-nowrap">${_esc(s)}</button>`
        ).join('');
        cont.querySelectorAll('.ai-vend-sug').forEach(b => b.addEventListener('click', () => {
            const inp = document.getElementById('aiVendInput');
            if (inp) inp.value = b.textContent;
            _enviar(b.textContent);
        }));
    }

    function abrirChatIA() {
        const drawer = document.getElementById('aiChatDrawerVendedor');
        if (!drawer) return;
        if (!_iniciado) {
            const nombre = (window.hdvUsuario?.nombre || '').split(/\s+/)[0] || '';
            _push('bot', `¡Hola${nombre ? ' ' + _esc(nombre) : ''}! Soy <b>Cartón</b> 🤖. Preguntame por tus ventas, cobros, créditos o el precio de un producto.`);
            _renderSugerencias();
            _iniciado = true;
        }
        drawer.show();
        setTimeout(() => document.getElementById('aiVendInput')?.focus(), 120);
    }

    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('aiVendForm');
        const inp = document.getElementById('aiVendInput');
        if (form && inp) {
            form.addEventListener('submit', (e) => { e.preventDefault(); const v = inp.value; inp.value = ''; _enviar(v); });
        }
    });

    window.abrirChatIA = abrirChatIA;
})();
