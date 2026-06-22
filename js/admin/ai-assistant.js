// ============================================
// HDV Admin — Asistente de Inteligencia de Negocios
// Chat IA para análisis de rendimiento del negocio.
// Requiere: supabase-init.js, admin-ventas.js, admin.js
// ============================================

(function () {
    // ── Estado del chat ────────────────────────────────────────────────────
    let _historial = [];
    let _cargando  = false;
    let _iniciado  = false;

    const SUGERENCIAS = [
        '¿Cómo fueron las ventas esta semana?',
        '¿Quién vendió más este mes?',
        'Top 5 productos más vendidos',
        '¿Qué clientes tienen más deuda?',
        'Comparame los vendedores',
        '¿Cómo vamos contra las metas?',
        'Productos sin movimiento reciente',
        'Dame un resumen ejecutivo',
    ];

    // ── Helpers de formato ─────────────────────────────────────────────────
    function _fmt(n) {
        return 'Gs. ' + Math.round(n || 0).toLocaleString('es-PY');
    }

    function _fmtCorto(n) {
        const v = Math.round(n || 0);
        if (v >= 1_000_000) return 'Gs. ' + (v / 1_000_000).toFixed(1) + 'M';
        if (v >= 1_000)     return 'Gs. ' + (v / 1_000).toFixed(0) + 'k';
        return 'Gs. ' + v;
    }

    // ── Context Builder ────────────────────────────────────────────────────
    async function _construirContexto() {
        try {
            const ahora   = new Date();
            const inicio30 = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
            const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
            const inicioMesAnt = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
            const finMesAnt    = new Date(ahora.getFullYear(), ahora.getMonth(), 0);

            // Pedidos desde admin-ventas.js (global todosLosPedidos)
            const todos = (typeof todosLosPedidos !== 'undefined' ? todosLosPedidos : null) || [];

            const estadosVenta = ['entregado', 'cobrado_sin_factura', 'facturado_mock'];
            const pedidosMes   = todos.filter(p => {
                const f = new Date(p.fecha || p.creado_en || 0);
                return f >= inicioMes && estadosVenta.includes(p.estado);
            });
            const pedidosMesAnt = todos.filter(p => {
                const f = new Date(p.fecha || p.creado_en || 0);
                return f >= inicioMesAnt && f <= finMesAnt && estadosVenta.includes(p.estado);
            });
            const pendientes = todos.filter(p => p.estado === 'pedido_pendiente');

            const totalMes    = pedidosMes.reduce((s, p) => s + (p.datos?.total || p.total || 0), 0);
            const totalMesAnt = pedidosMesAnt.reduce((s, p) => s + (p.datos?.total || p.total || 0), 0);
            const ticketProm  = pedidosMes.length ? totalMes / pedidosMes.length : 0;
            const totalPend   = pendientes.reduce((s, p) => s + (p.datos?.total || p.total || 0), 0);

            let comparativa = null;
            if (totalMesAnt > 0) {
                const diff = ((totalMes - totalMesAnt) / totalMesAnt * 100).toFixed(1);
                comparativa = diff >= 0 ? `+${diff}%` : `${diff}%`;
            }

            const periodoLabel = `${inicioMes.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' })} (mes actual)`;

            // Ventas por vendedor
            const mapaVend = typeof _vendedoresMap !== 'undefined' ? _vendedoresMap : {};
            const vendMap  = {};
            pedidosMes.forEach(p => {
                const vid  = p.vendedor_id || 'desconocido';
                const nom  = mapaVend[vid] || vid.substring(0, 8) + '...';
                const tot  = p.datos?.total || p.total || 0;
                if (!vendMap[vid]) vendMap[vid] = { nombre: nom, total: 0, cantidad: 0 };
                vendMap[vid].total    += tot;
                vendMap[vid].cantidad += 1;
            });

            // Metas
            let metas = null;
            try {
                metas = await HDVStorage.getItem('hdv_metas', { clone: false });
            } catch (_) {}

            const vendedoresArr = Object.values(vendMap)
                .sort((a, b) => b.total - a.total)
                .map(v => {
                    const obj = {
                        nombre:     v.nombre,
                        total_fmt:  _fmt(v.total),
                        cantidad:   v.cantidad,
                        ticket_fmt: _fmt(v.total / v.cantidad),
                    };
                    if (metas && metas[Object.keys(vendMap).find(k => mapaVend[k] === v.nombre)]) {
                        const meta = metas[Object.keys(vendMap).find(k => mapaVend[k] === v.nombre)];
                        obj.meta_pct = meta.objetivo > 0
                            ? Math.round((v.total / meta.objetivo) * 100) : null;
                    }
                    return obj;
                });

            // Top productos (últimos 30 días)
            const pedidos30 = todos.filter(p => {
                const f = new Date(p.fecha || p.creado_en || 0);
                return f >= inicio30 && estadosVenta.includes(p.estado);
            });
            const prodMap = {};
            pedidos30.forEach(p => {
                (p.datos?.items || p.items || []).forEach(it => {
                    const key = `${it.productoId}|${it.nombre}`;
                    if (!prodMap[key]) prodMap[key] = { nombre: it.nombre, unidades: 0, total: 0 };
                    prodMap[key].unidades += (it.cantidad || 0);
                    prodMap[key].total    += (it.subtotal || 0);
                });
            });
            const topProductos = Object.values(prodMap)
                .sort((a, b) => b.total - a.total)
                .slice(0, 10)
                .map(p => ({ nombre: p.nombre, unidades: p.unidades, total_fmt: _fmtCorto(p.total) }));

            // Clientes deudores (créditos)
            let deudores = [];
            try {
                const creditos = await HDVStorage.getItem('hdv_creditos_manuales', { clone: false }) || {};
                const pagos    = await HDVStorage.getItem('hdv_pagos_credito',     { clone: false }) || {};

                const clientesMap = {};
                if (typeof productosData !== 'undefined' && productosData?.clientes) {
                    productosData.clientes.forEach(c => { clientesMap[c.id] = c.nombre; });
                }

                deudores = Object.entries(creditos)
                    .map(([cid, arr]) => {
                        const deuda = (Array.isArray(arr) ? arr : []).reduce((s, cr) => {
                            if (cr.estado === 'activo' || !cr.estado) return s + (cr.monto || 0);
                            return s;
                        }, 0);
                        const pagado = (pagos[cid] || []).reduce((s, pg) => s + (pg.monto || 0), 0);
                        return {
                            nombre:    clientesMap[cid] || cid,
                            deuda_neta: Math.max(0, deuda - pagado),
                            deuda_fmt:  _fmt(Math.max(0, deuda - pagado)),
                        };
                    })
                    .filter(d => d.deuda_neta > 0)
                    .sort((a, b) => b.deuda_neta - a.deuda_neta)
                    .slice(0, 10);
            } catch (_) {}

            // Alertas automáticas
            const alertas = [];
            if (totalMesAnt > 0 && totalMes < totalMesAnt * 0.8) {
                alertas.push(`Caída de ventas del ${Math.round((1 - totalMes / totalMesAnt) * 100)}% vs el mes anterior.`);
            }
            if (pendientes.length > 10) {
                alertas.push(`${pendientes.length} pedidos pendientes sin procesar por ${_fmtCorto(totalPend)}.`);
            }
            if (deudores.length > 0 && deudores[0].deuda_neta > 1_000_000) {
                alertas.push(`Cliente con mayor deuda: ${deudores[0].nombre} — ${deudores[0].deuda_fmt}.`);
            }

            return {
                periodo: periodoLabel,
                resumen: {
                    total_fmt:           _fmt(totalMes),
                    cantidad:            pedidosMes.length,
                    ticket_fmt:          _fmt(ticketProm),
                    pendientes_cantidad: pendientes.length,
                    pendientes_fmt:      _fmt(totalPend),
                    comparativa,
                },
                vendedores:       vendedoresArr,
                top_productos:    topProductos,
                clientes_deudores: deudores,
                alertas,
            };
        } catch (e) {
            console.warn('[ai-assistant] Error construyendo contexto:', e);
            return {};
        }
    }

    // ── Renderizado de mensajes ────────────────────────────────────────────
    function _mdToHtml(texto) {
        return texto
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^### (.+)$/gm, '<p class="font-semibold text-gray-800 mt-2 mb-0.5">$1</p>')
            .replace(/^## (.+)$/gm, '<p class="font-bold text-gray-900 mt-2">$1</p>')
            .replace(/^- (.+)$/gm, '<li class="ml-3">• $1</li>')
            .replace(/(<li.*<\/li>\n?)+/g, m => `<ul class="space-y-0.5 my-1">${m}</ul>`)
            .replace(/\n{2,}/g, '</p><p class="mt-1">')
            .replace(/\n/g, '<br>');
    }

    function _agregarMensaje(rol, contenido) {
        const contenedor = document.getElementById('aiChatMessages');
        if (!contenedor) return;

        const isUser = rol === 'user';
        const div = document.createElement('div');
        div.className = `flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`;

        if (!isUser) {
            div.innerHTML = `
                <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                </div>
                <div class="max-w-[85%] rounded-2xl rounded-tl-sm bg-white border border-gray-100 shadow-sm px-3.5 py-2.5 text-sm text-gray-700 leading-relaxed ai-msg-content">
                    ${_mdToHtml(contenido)}
                </div>`;
        } else {
            div.innerHTML = `
                <div class="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600 px-3.5 py-2.5 text-sm text-white leading-relaxed">
                    ${escapeHTML(contenido).replace(/\n/g, '<br>')}
                </div>`;
        }

        contenedor.appendChild(div);
        contenedor.scrollTop = contenedor.scrollHeight;
    }

    function _mostrarTyping() {
        const contenedor = document.getElementById('aiChatMessages');
        if (!contenedor) return;
        const div = document.createElement('div');
        div.id = 'aiTypingIndicator';
        div.className = 'flex justify-start gap-2';
        div.innerHTML = `
            <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
            </div>
            <div class="rounded-2xl rounded-tl-sm bg-white border border-gray-100 shadow-sm px-4 py-3 flex gap-1 items-center">
                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0ms"></span>
                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:150ms"></span>
                <span class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style="animation-delay:300ms"></span>
            </div>`;
        contenedor.appendChild(div);
        contenedor.scrollTop = contenedor.scrollHeight;
    }

    function _quitarTyping() {
        document.getElementById('aiTypingIndicator')?.remove();
    }

    function _mostrarSugerencias() {
        const div = document.getElementById('aiChatSugerencias');
        if (!div) return;
        div.innerHTML = `<p class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-2">Preguntas frecuentes</p>
            <div class="flex flex-wrap gap-1.5">
                ${SUGERENCIAS.map(s =>
                    `<button class="ai-sugerencia text-[11px] bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 px-2.5 py-1 rounded-full transition-colors border border-transparent hover:border-indigo-200"
                        data-sugerencia="${escapeHTML(s)}">${escapeHTML(s)}</button>`
                ).join('')}
            </div>`;
        div.classList.remove('hidden');
    }

    function _ocultarSugerencias() {
        document.getElementById('aiChatSugerencias')?.classList.add('hidden');
    }

    // ── Enviar mensaje ─────────────────────────────────────────────────────
    async function enviarMensajeIA(textoForzado) {
        if (_cargando) return;

        const input = document.getElementById('aiChatInput');
        const pregunta = (textoForzado || input?.value || '').trim();
        if (!pregunta) return;

        if (input) input.value = '';
        _actualizarBotonEnviar(false);
        _ocultarSugerencias();
        _agregarMensaje('user', pregunta);
        _historial.push({ role: 'user', content: pregunta });

        _cargando = true;
        _mostrarTyping();

        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) throw new Error('Sesión expirada.');

            const contexto = await _construirContexto();

            const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey':        SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                    pregunta,
                    historial: _historial.slice(0, -1),
                    contexto,
                }),
            });

            const data = await res.json();

            _quitarTyping();

            if (data.error) {
                _agregarMensaje('assistant', `⚠️ ${data.error}`);
            } else {
                _agregarMensaje('assistant', data.respuesta);
                _historial.push({ role: 'assistant', content: data.respuesta });
            }
        } catch (e) {
            _quitarTyping();
            _agregarMensaje('assistant', '⚠️ No pude conectar con el asistente. Verificá tu conexión e intentá de nuevo.');
            console.error('[ai-assistant]', e);
        } finally {
            _cargando = false;
            _actualizarBotonEnviar(true);
        }
    }

    // ── Análisis proactivo al abrir ────────────────────────────────────────
    async function _analisisProactivo() {
        const ctx = await _construirContexto();
        if (!ctx.alertas?.length && !ctx.resumen) return;

        let intro = '¡Hola! Analicé los datos del negocio. ';

        if (ctx.alertas?.length) {
            intro += `Detecté **${ctx.alertas.length} alerta(s)**:\n`;
            ctx.alertas.forEach(a => { intro += `- ${a}\n`; });
            intro += '\n';
        } else {
            intro += 'Todo parece estar en orden. ';
        }

        if (ctx.resumen) {
            intro += `**Ventas del mes:** ${ctx.resumen.total_fmt} (${ctx.resumen.cantidad} pedidos`;
            if (ctx.resumen.comparativa) intro += `, ${ctx.resumen.comparativa} vs el mes anterior`;
            intro += ').\n\nPodés preguntarme lo que necesites.';
        }

        _agregarMensaje('assistant', intro);
        _historial.push({ role: 'assistant', content: intro });
    }

    // ── Abrir / cerrar / resetear ──────────────────────────────────────────
    function abrirChatIA() {
        const drawer = document.getElementById('aiChatDrawer');
        if (!drawer) return;
        drawer.show();

        if (!_iniciado) {
            _iniciado = true;
            _mostrarSugerencias();
            _analisisProactivo();
        }
    }

    function cerrarChatIA() {
        document.getElementById('aiChatDrawer')?.hide();
    }

    function nuevaConversacionIA() {
        _historial = [];
        const contenedor = document.getElementById('aiChatMessages');
        if (contenedor) contenedor.innerHTML = '';
        _mostrarSugerencias();
        _analisisProactivo();
    }

    // ── Helpers UI ─────────────────────────────────────────────────────────
    function _actualizarBotonEnviar(habilitado) {
        const btn = document.getElementById('aiChatSend');
        if (btn) btn.disabled = !habilitado;
    }

    function _autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    // ── Init: adjuntar listeners ───────────────────────────────────────────
    function _init() {
        const drawer  = document.getElementById('aiChatDrawer');
        const input   = document.getElementById('aiChatInput');
        const sendBtn = document.getElementById('aiChatSend');
        const nuevoBtn = document.getElementById('aiChatNuevoBtn');
        const cerrarBtn = document.getElementById('aiChatCerrarBtn');

        if (!drawer) return;

        if (input) {
            input.addEventListener('input', () => _autoResize(input));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    enviarMensajeIA();
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => enviarMensajeIA());
        }

        if (nuevoBtn) {
            nuevoBtn.addEventListener('click', () => nuevaConversacionIA());
        }

        if (cerrarBtn) {
            cerrarBtn.addEventListener('click', () => cerrarChatIA());
        }

        // Chips de sugerencias (delegación desde contenedor)
        const sugerDiv = document.getElementById('aiChatSugerencias');
        if (sugerDiv) {
            sugerDiv.addEventListener('click', (e) => {
                const chip = e.target.closest('.ai-sugerencia');
                if (chip) enviarMensajeIA(chip.dataset.sugerencia);
            });
        }
    }

    // ── Exponer globales ───────────────────────────────────────────────────
    window.abrirChatIA   = abrirChatIA;
    window.cerrarChatIA  = cerrarChatIA;
    window.nuevaConversacionIA = nuevaConversacionIA;
    window.enviarMensajeIA     = enviarMensajeIA;

    document.addEventListener('DOMContentLoaded', _init);
})();
