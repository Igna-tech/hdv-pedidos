// ============================================
// HDV Admin — Asistente de Inteligencia de Negocios
// Pre-carga todos los datos al iniciar sesión.
// Requiere: supabase-init.js, services/supabase.js
// ============================================

(function () {

    // ── Estado del módulo ──────────────────────────────────────────────────
    let _historial    = [];
    let _cargando     = false;
    let _iniciado     = false;
    let _cache        = null;   // datos pre-cargados
    let _cargandoDatos = false;

    const SUGERENCIAS = [
        '¿Cómo fueron las ventas este mes?',
        '¿Quién vendió más?',
        'Top 5 productos más vendidos',
        '¿Qué clientes deben más dinero?',
        'Comparame este mes con el anterior',
        '¿Cómo vamos contra las metas?',
        '¿Cuánto se cobró en créditos?',
        'Dame un resumen ejecutivo del negocio',
    ];

    // ── Formato de números ─────────────────────────────────────────────────
    function _fmt(n) {
        return 'Gs. ' + Math.round(n || 0).toLocaleString('es-PY');
    }
    function _fmtM(n) {
        const v = Math.round(n || 0);
        if (v >= 1_000_000) return 'Gs. ' + (v / 1_000_000).toFixed(1) + 'M';
        if (v >= 1_000)     return 'Gs. ' + (v / 1_000).toFixed(0) + 'k';
        return 'Gs. ' + v;
    }
    function _dias(fecha) {
        return Math.floor((Date.now() - new Date(fecha || 0).getTime()) / 86_400_000);
    }

    // ── Pre-carga de datos desde Supabase ──────────────────────────────────
    async function precargarDatosIA() {
        if (_cargandoDatos) return;
        _cargandoDatos = true;
        try {
            // 1. Pedidos (todos, hasta 5000)
            const { data: pedidosRaw } = await SupabaseService.fetchPedidos(5000, 0);
            const pedidos = (pedidosRaw || []).map(p => {
                // Normalizar: algunos campos vienen en .datos JSONB, otros al nivel raíz
                const d = p.datos || {};
                return {
                    id:          p.id,
                    estado:      p.estado || d.estado,
                    fecha:       p.fecha   || d.fecha || p.creado_en,
                    vendedor_id: p.vendedor_id || d.vendedor_id,
                    total:       d.total    || p.total    || 0,
                    tipoPago:    d.tipoPago || p.tipoPago || '',
                    cliente:     d.cliente  || p.cliente  || {},
                    items:       d.items    || p.items    || [],
                    creado_en:   p.creado_en,
                };
            });

            // 2. Vendedores
            let vendMap = {};
            try {
                const { data: perfiles } = await supabaseClient
                    .from('perfiles')
                    .select('id, nombre_completo')
                    .eq('rol', 'vendedor');
                (perfiles || []).forEach(p => { vendMap[p.id] = p.nombre_completo; });
            } catch (_) {}

            // 3. Créditos manuales
            let creditosManuales = [];
            try {
                const { data: cfgC } = await SupabaseService.fetchConfig('creditos_manuales');
                creditosManuales = Array.isArray(cfgC?.datos) ? cfgC.datos : [];
            } catch (_) {}

            // 4. Pagos de crédito (de pedidos)
            let pagosCredito = [];
            try {
                const { data: cfgP } = await SupabaseService.fetchConfig('pagos_credito');
                pagosCredito = Array.isArray(cfgP?.datos) ? cfgP.datos : [];
            } catch (_) {}

            // 5. Metas
            let metas = [];
            try {
                const { data: cfgM } = await SupabaseService.fetchConfig('metas_vendedor');
                metas = Array.isArray(cfgM?.datos) ? cfgM.datos : [];
            } catch (_) {}

            // 6. Clientes desde Supabase
            let clientes = [];
            let clientesMap = {};
            try {
                const { data: cls } = await SupabaseService.fetchClientes(5000, 0);
                clientes = cls || [];
                clientes.forEach(c => { clientesMap[c.id] = c.nombre; });
            } catch (_) {
                // Fallback a productosData si ya está cargado
                if (typeof productosData !== 'undefined' && Array.isArray(productosData.clientes)) {
                    clientes = productosData.clientes;
                    clientes.forEach(c => { clientesMap[c.id] = c.nombre; });
                }
            }

            // 7. Productos y variantes desde Supabase
            let productos = [];
            try {
                const { data: prods } = await SupabaseService.fetchProductosConVariantes(5000, 0);
                productos = prods || [];
            } catch (_) {
                if (typeof productosData !== 'undefined' && Array.isArray(productosData.productos)) {
                    productos = productosData.productos;
                }
            }

            // 8. Reporte mensual anterior (para comparativas históricas)
            let reporteMesAnt = null;
            try {
                const mesAnt = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
                    .toISOString().slice(0, 7);
                const { data: rep } = await SupabaseService.fetchReporteMensual(mesAnt);
                reporteMesAnt = rep?.datos || null;
            } catch (_) {}

            // 9. Configuracion empresa
            let empresa = null;
            try {
                const { data: emp } = await SupabaseService.fetchConfigEmpresa();
                empresa = emp;
            } catch (_) {}

            // Sincronizar _vendedoresMap global si existe
            if (typeof _vendedoresMap !== 'undefined') Object.assign(vendMap, _vendedoresMap);

            _cache = {
                pedidos, vendMap, creditosManuales, pagosCredito, metas,
                clientes, clientesMap, productos, reporteMesAnt, empresa,
                ts: Date.now()
            };

            console.log(`[AI] Datos pre-cargados: ${pedidos.length} pedidos | ${clientes.length} clientes | ${productos.length} productos | ${creditosManuales.length} créditos manuales`);
        } catch (e) {
            console.warn('[AI] Error en precarga:', e);
        } finally {
            _cargandoDatos = false;
        }
    }

    // ── Context Builder ────────────────────────────────────────────────────
    function _construirContexto() {
        if (!_cache) return {};

        const { pedidos, vendMap, creditosManuales, pagosCredito, metas,
                clientes, clientesMap, productos, reporteMesAnt, empresa } = _cache;
        const ahora = new Date();
        const mesActual  = ahora.toISOString().slice(0, 7);
        const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).toISOString().slice(0, 7);

        const estadosVenta = ['entregado', 'cobrado_sin_factura', 'facturado_mock'];

        // Pedidos del mes actual (vendidos)
        const pedMes = pedidos.filter(p =>
            (p.fecha || '').startsWith(mesActual) && estadosVenta.includes(p.estado)
        );
        // Pedidos del mes anterior
        const pedMesAnt = pedidos.filter(p =>
            (p.fecha || '').startsWith(mesAnterior) && estadosVenta.includes(p.estado)
        );
        // Pendientes
        const pedPend = pedidos.filter(p => p.estado === 'pedido_pendiente');

        const totalMes    = pedMes.reduce((s, p) => s + p.total, 0);
        const totalMesAnt = pedMesAnt.reduce((s, p) => s + p.total, 0);
        const ticketProm  = pedMes.length ? totalMes / pedMes.length : 0;
        const totalPend   = pedPend.reduce((s, p) => s + p.total, 0);

        let comparativa = null;
        if (totalMesAnt > 0) {
            const diff = ((totalMes - totalMesAnt) / totalMesAnt * 100).toFixed(1);
            comparativa = (diff >= 0 ? '+' : '') + diff + '%';
        }

        // ── Ventas por vendedor ────────────────────────────────────────────
        const vendAcc = {};
        pedMes.forEach(p => {
            const vid = p.vendedor_id || 'desconocido';
            if (!vendAcc[vid]) vendAcc[vid] = { nombre: vendMap[vid] || 'Vendedor ' + vid.slice(0, 6), total: 0, cantidad: 0 };
            vendAcc[vid].total    += p.total;
            vendAcc[vid].cantidad += 1;
        });

        // Metas del mes actual por vendedor
        const metasMes = metas.filter(m => m.mes === mesActual && m.activa);
        const metaMap  = {};
        metasMes.forEach(m => { metaMap[m.vendedor_id] = m; });

        const vendedores = Object.entries(vendAcc)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([vid, v]) => {
                const obj = {
                    nombre:     v.nombre,
                    total_fmt:  _fmt(v.total),
                    cantidad:   v.cantidad,
                    ticket_fmt: _fmt(v.total / v.cantidad),
                };
                if (metaMap[vid]) {
                    obj.meta_objetivo = _fmt(metaMap[vid].monto);
                    obj.meta_pct = metaMap[vid].monto > 0
                        ? Math.round((v.total / metaMap[vid].monto) * 100) : null;
                }
                return obj;
            });

        // ── Top productos (últimos 30 días) ────────────────────────────────
        const hace30 = new Date(ahora.getTime() - 30 * 86_400_000);
        const prodAcc = {};
        pedidos
            .filter(p => new Date(p.fecha || p.creado_en || 0) >= hace30 && estadosVenta.includes(p.estado))
            .forEach(p => {
                (p.items || []).forEach(it => {
                    const k = it.nombre || it.productoId;
                    if (!prodAcc[k]) prodAcc[k] = { nombre: k, unidades: 0, total: 0 };
                    prodAcc[k].unidades += (it.cantidad || 0);
                    prodAcc[k].total    += (it.subtotal || 0);
                });
            });
        const topProductos = Object.values(prodAcc)
            .sort((a, b) => b.total - a.total)
            .slice(0, 10)
            .map(p => ({ nombre: p.nombre, unidades: p.unidades, total_fmt: _fmtM(p.total) }));

        // ── Créditos: deuda por cliente ────────────────────────────────────
        const deudaMap = {};

        // Créditos de pedidos
        pedidos
            .filter(p => p.tipoPago === 'credito' && p.estado !== 'anulado' && p.estado !== 'pagado')
            .forEach(p => {
                const pagado = pagosCredito
                    .filter(pg => pg.pedidoId === p.id)
                    .reduce((s, pg) => s + (pg.monto || 0), 0);
                const saldo = p.total - pagado;
                if (saldo <= 0) return;
                const cid = p.cliente?.id || 'sin-cliente';
                const nom = p.cliente?.nombre || clientesMap[cid] || cid;
                if (!deudaMap[cid]) deudaMap[cid] = { nombre: nom, deuda: 0, diasMax: 0, tipo: 'pedido' };
                deudaMap[cid].deuda   += saldo;
                deudaMap[cid].diasMax  = Math.max(deudaMap[cid].diasMax, _dias(p.fecha));
            });

        // Créditos manuales
        creditosManuales
            .filter(c => !c.eliminado && !c.pagado)
            .forEach(c => {
                const pagado = (c.pagos || []).reduce((s, pg) => s + (pg.monto || 0), 0);
                const saldo  = (c.monto || 0) - pagado;
                if (saldo <= 0) return;
                const cid = c.clienteId || 'manual';
                const nom = clientesMap[cid] || c.nombre || c.cliente || 'Crédito manual';
                if (!deudaMap[cid]) deudaMap[cid] = { nombre: nom, deuda: 0, diasMax: 0, tipo: 'manual' };
                deudaMap[cid].deuda   += saldo;
                deudaMap[cid].diasMax  = Math.max(deudaMap[cid].diasMax, _dias(c.fecha));
            });

        const deudores = Object.values(deudaMap)
            .filter(d => d.deuda > 0)
            .sort((a, b) => b.deuda - a.deuda)
            .slice(0, 15)
            .map(d => ({
                nombre:    d.nombre,
                deuda_fmt: _fmt(d.deuda),
                dias:      d.diasMax,
                tipo:      d.tipo,
            }));

        const totalDeuda = Object.values(deudaMap).reduce((s, d) => s + d.deuda, 0);

        // ── Metas resumen ──────────────────────────────────────────────────
        const metasResumen = metasMes.map(m => {
            const vid = m.vendedor_id;
            const realMes = (vendAcc[vid]?.total || 0);
            return {
                vendedor:       vendMap[vid] || 'Vendedor',
                objetivo_fmt:   _fmt(m.monto),
                real_fmt:       _fmt(realMes),
                pct:            m.monto > 0 ? Math.round((realMes / m.monto) * 100) : 0,
                comision_fmt:   _fmt(realMes * ((m.comision || 0) / 100)),
            };
        });

        // ── Histórico mensual completo (todos los meses disponibles) ──────
        const mesMap = {};
        pedidos
            .filter(p => estadosVenta.includes(p.estado))
            .forEach(p => {
                // fecha puede ser "2026-04-15T..." o "2026-04-15" — tomar primeros 7 chars
                const mes = (p.fecha || p.creado_en || '').substring(0, 7);
                if (!mes || mes.length < 7) return;
                if (!mesMap[mes]) mesMap[mes] = { total: 0, cantidad: 0 };
                mesMap[mes].total    += p.total;
                mesMap[mes].cantidad += 1;
            });

        const historicoMensual = Object.entries(mesMap)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([mes, v]) => ({
                mes,
                total_fmt:  _fmt(v.total),
                cantidad:   v.cantidad,
                ticket_fmt: _fmt(v.cantidad ? v.total / v.cantidad : 0),
            }));

        // Mejor mes histórico
        const mejorMes = historicoMensual.reduce((best, m) => {
            const raw = mesMap[m.mes].total;
            return raw > (mesMap[best?.mes]?.total || 0) ? m : best;
        }, null);

        // ── Alertas automáticas ────────────────────────────────────────────
        const alertas = [];
        if (totalMesAnt > 0 && totalMes < totalMesAnt * 0.85) {
            const caida = Math.round((1 - totalMes / totalMesAnt) * 100);
            alertas.push(`Caída de ventas del ${caida}% respecto al mes anterior.`);
        }
        if (pedPend.length >= 10) {
            alertas.push(`${pedPend.length} pedidos pendientes acumulados por ${_fmtM(totalPend)}.`);
        }
        if (deudores.length > 0 && deudores[0].deuda > 500_000) {
            alertas.push(`Mayor deudor: ${deudores[0].nombre} — ${deudores[0].deuda_fmt} (${deudores[0].dias} días).`);
        }
        metasResumen.forEach(m => {
            if (m.pct < 50 && ahora.getDate() >= 15) {
                alertas.push(`${m.vendedor} lleva solo el ${m.pct}% de su meta a mitad de mes.`);
            }
        });

        // ── Catálogo: clientes, productos, stock ───────────────────────────
        const clientesActivos  = (clientes || []).filter(c => !c.oculto);
        const clientesPorZona  = {};
        clientesActivos.forEach(c => {
            const z = c.zona || 'Sin zona';
            clientesPorZona[z] = (clientesPorZona[z] || 0) + 1;
        });

        // Stock crítico y productos sin ventas recientes
        const prodIds30 = new Set();
        pedidos
            .filter(p => new Date(p.fecha || p.creado_en || 0) >= new Date(ahora.getTime() - 30 * 86_400_000))
            .forEach(p => (p.items || []).forEach(it => prodIds30.add(it.productoId)));

        let stockCritico = [];
        let productosTotal = 0;
        let variantesTotal = 0;
        if (Array.isArray(productos)) {
            productosTotal = productos.filter(p => !p.oculto && p.estado !== 'discontinuado').length;
            productos.forEach(p => {
                (p.presentaciones || []).forEach(v => {
                    if (v.activo !== false) {
                        variantesTotal++;
                        if ((v.stock || 0) <= 5 && (v.stock || 0) >= 0) {
                            stockCritico.push({
                                producto: p.nombre,
                                variante: v.tamano || v.nombre_variante,
                                stock:    v.stock || 0,
                            });
                        }
                    }
                });
            });
            stockCritico = stockCritico.sort((a, b) => a.stock - b.stock).slice(0, 10);
        }

        if (stockCritico.length > 0) {
            alertas.push(`${stockCritico.length} variante(s) con stock crítico (≤5 unidades).`);
        }

        const periodoLabel = ahora.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });

        return {
            periodo: periodoLabel,
            empresa: empresa ? {
                nombre: empresa.nombre_fantasia || empresa.razon_social,
                ruc:    empresa.ruc_empresa,
            } : null,
            resumen: {
                total_fmt:           _fmt(totalMes),
                cantidad:            pedMes.length,
                ticket_fmt:          _fmt(ticketProm),
                pendientes_cantidad: pedPend.length,
                pendientes_fmt:      _fmt(totalPend),
                comparativa,
                mes_anterior_fmt:    totalMesAnt > 0 ? _fmt(totalMesAnt) : null,
            },
            vendedores,
            top_productos: topProductos,
            clientes_deudores: deudores,
            total_deuda_fmt:   _fmt(totalDeuda),
            metas: metasResumen,
            catalogo: {
                total_clientes:    clientesActivos.length,
                clientes_por_zona: clientesPorZona,
                total_productos:   productosTotal,
                total_variantes:   variantesTotal,
                stock_critico:     stockCritico,
            },
            historico_mensual: historicoMensual,
            mejor_mes:         mejorMes,
            alertas,
        };
    }

    // ── Renderizado de mensajes ────────────────────────────────────────────
    function _mdToHtml(texto) {
        return escapeHTML(texto)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^### (.+)$/gm, '<p class="font-semibold text-gray-800 mt-2 mb-0.5">$1</p>')
            .replace(/^## (.+)$/gm, '<p class="font-bold text-gray-900 mt-2">$1</p>')
            .replace(/^- (.+)$/gm, '<li class="ml-3 list-disc">$1</li>')
            .replace(/(<li[\s\S]*?<\/li>\n?)+/g, m => `<ul class="space-y-0.5 my-1 ml-2">${m}</ul>`)
            .replace(/\n{2,}/g, '</p><p class="mt-1.5">')
            .replace(/\n/g, '<br>');
    }

    function _agregarMensaje(rol, contenido) {
        const cont = document.getElementById('aiChatMessages');
        if (!cont) return;
        const isUser = rol === 'user';
        const div = document.createElement('div');
        div.className = `flex ${isUser ? 'justify-end' : 'justify-start'} gap-2 items-end`;

        if (isUser) {
            div.innerHTML = `
                <div style="max-width:85%; background:var(--steel); color:#fff; border-radius:16px 16px 4px 16px;"
                    class="px-3 py-2 text-sm leading-relaxed">
                    ${escapeHTML(contenido).replace(/\n/g, '<br>')}
                </div>`;
        } else {
            div.innerHTML = `
                <div style="width:24px;height:24px;border-radius:8px;background:linear-gradient(135deg,#5681AE,#3D5A78);flex-shrink:0;"
                    class="flex items-center justify-center mb-0.5">
                    <svg style="width:12px;height:12px;color:#fff;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                </div>
                <div style="max-width:85%;background:var(--panel-2);border:1px solid var(--hairline);border-radius:4px 16px 16px 16px;"
                    class="shadow-sm px-3.5 py-2.5 text-sm text-gray-700 leading-relaxed">
                    <p>${_mdToHtml(contenido)}</p>
                </div>`;
        }

        cont.appendChild(div);
        cont.scrollTop = cont.scrollHeight;
    }

    function _mostrarTyping() {
        const cont = document.getElementById('aiChatMessages');
        if (!cont) return;
        const div = document.createElement('div');
        div.id = 'aiTypingDot';
        div.className = 'flex justify-start gap-2 items-end';
        div.innerHTML = `
            <div style="width:24px;height:24px;border-radius:8px;background:linear-gradient(135deg,#5681AE,#3D5A78);"
                class="flex items-center justify-center shrink-0">
                <svg style="width:12px;height:12px;color:#fff;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
            </div>
            <div style="background:var(--panel-2);border:1px solid var(--hairline);border-radius:4px 16px 16px 16px;"
                class="shadow-sm px-4 py-3 flex gap-1 items-center">
                <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0ms"></span>
                <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay:150ms"></span>
                <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay:300ms"></span>
            </div>`;
        cont.appendChild(div);
        cont.scrollTop = cont.scrollHeight;
    }

    function _quitarTyping() { document.getElementById('aiTypingDot')?.remove(); }

    function _mostrarSugerencias() {
        const div = document.getElementById('aiChatSugerencias');
        if (!div) return;
        div.innerHTML = `
            <p style="font-size:10px;color:#9ca3af;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:6px;">Preguntas frecuentes</p>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${SUGERENCIAS.map(s => `
                    <button class="ai-sug" data-sug="${escapeHTML(s)}"
                        style="font-size:11px;background:var(--panel-3);color:var(--ink-2);padding:4px 10px;border-radius:999px;border:1px solid var(--hairline);cursor:pointer;transition:all .15s;"
                        onmouseover="this.style.background='var(--steel-soft)';this.style.color='var(--steel-bright)';this.style.borderColor='var(--steel)';"
                        onmouseout="this.style.background='var(--panel-3)';this.style.color='var(--ink-2)';this.style.borderColor='var(--hairline)';">
                        ${escapeHTML(s)}
                    </button>`).join('')}
            </div>`;
        div.classList.remove('hidden');
    }

    // ── Enviar mensaje ─────────────────────────────────────────────────────
    async function enviarMensajeIA(textoForzado) {
        if (_cargando) return;
        const input    = document.getElementById('aiChatInput');
        const pregunta = (textoForzado || input?.value || '').trim();
        if (!pregunta) return;
        if (input) { input.value = ''; input.style.height = 'auto'; }
        document.getElementById('aiChatSugerencias')?.classList.add('hidden');
        _agregarMensaje('user', pregunta);
        _historial.push({ role: 'user', content: pregunta });
        _cargando = true;
        document.getElementById('aiChatSend').disabled = true;
        _mostrarTyping();

        try {
            // Refrescar caché si tiene más de 5 minutos
            if (!_cache || (Date.now() - _cache.ts) > 300_000) await precargarDatosIA();

            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) throw new Error('Sesión expirada.');

            const contexto = _construirContexto();

            const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey':        SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                    pregunta,
                    historial: _historial.slice(0, -1).slice(-10),
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
            _agregarMensaje('assistant', '⚠️ No pude conectar. Verificá tu conexión e intentá de nuevo.');
            console.error('[ai-assistant]', e);
        } finally {
            _cargando = false;
            document.getElementById('aiChatSend').disabled = false;
        }
    }

    // ── Análisis proactivo ─────────────────────────────────────────────────
    async function _analisisProactivo() {
        if (!_cache) await precargarDatosIA();
        const ctx = _construirContexto();
        if (!ctx.resumen) return;

        let msg = '¡Hola! Analicé los datos del negocio.\n\n';
        msg += `**Ventas de ${ctx.periodo}:** ${ctx.resumen.total_fmt} (${ctx.resumen.cantidad} pedidos`;
        if (ctx.resumen.comparativa) msg += `, **${ctx.resumen.comparativa}** vs el mes anterior`;
        msg += `). Ticket promedio: ${ctx.resumen.ticket_fmt}.\n\n`;

        if (ctx.alertas?.length) {
            msg += `**${ctx.alertas.length} alerta(s) detectada(s):**\n`;
            ctx.alertas.forEach(a => { msg += `- ${a}\n`; });
            msg += '\n';
        }

        if (ctx.clientes_deudores?.length) {
            msg += `**Deuda total en créditos:** ${ctx.total_deuda_fmt} (${ctx.clientes_deudores.length} cliente(s)).\n\n`;
        }

        msg += 'Podés preguntarme lo que necesites sobre ventas, créditos, metas o productos.';
        _agregarMensaje('assistant', msg);
        _historial.push({ role: 'assistant', content: msg });
    }

    // ── Abrir / cerrar / resetear ──────────────────────────────────────────
    function abrirChatIA() {
        document.getElementById('aiChatDrawer')?.show();
        if (!_iniciado) {
            _iniciado = true;
            _mostrarSugerencias();
            _analisisProactivo();
        }
    }

    function cerrarChatIA() { document.getElementById('aiChatDrawer')?.hide(); }

    function nuevaConversacionIA() {
        _historial = [];
        const cont = document.getElementById('aiChatMessages');
        if (cont) cont.innerHTML = '';
        _mostrarSugerencias();
        _analisisProactivo();
    }

    // ── Init: adjuntar listeners ───────────────────────────────────────────
    function _init() {
        const input   = document.getElementById('aiChatInput');
        const sendBtn = document.getElementById('aiChatSend');

        if (input) {
            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 120) + 'px';
            });
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensajeIA(); }
            });
        }
        if (sendBtn) sendBtn.addEventListener('click', () => enviarMensajeIA());

        document.getElementById('aiChatNuevoBtn')?.addEventListener('click', () => nuevaConversacionIA());
        document.getElementById('aiChatCerrarBtn')?.addEventListener('click', () => cerrarChatIA());

        // Chips de sugerencias
        document.getElementById('aiChatSugerencias')?.addEventListener('click', e => {
            const chip = e.target.closest('.ai-sug');
            if (chip) enviarMensajeIA(chip.dataset.sug);
        });

        // Pre-cargar datos en background al cargar el módulo
        setTimeout(precargarDatosIA, 2000);
    }

    // ── Exponer globales ───────────────────────────────────────────────────
    window.abrirChatIA         = abrirChatIA;
    window.cerrarChatIA        = cerrarChatIA;
    window.nuevaConversacionIA = nuevaConversacionIA;
    window.enviarMensajeIA     = enviarMensajeIA;
    window.precargarDatosIA    = precargarDatosIA;

    document.addEventListener('DOMContentLoaded', _init);

})();
