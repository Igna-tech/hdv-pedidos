// ============================================
// HDV Admin - Modulo Dashboard v2
// KPIs realtime, chart temporal, feed actividad, leaderboard vendedores
// Depende de globals: todosLosPedidos, productosData
// Depende de: calcularGananciaPedidos (pedidos.js), Chart.js
// ============================================

let chartVentas7d = null;  // legacy ref, no usado
let chartTopProd = null;
let _chartTemporal = null;
let _chartPeriodo = '7d';
let _chartMix = null, _chartEmbudo = null, _chartHora = null, _chartMetas = null, _chartMargen = null, _chartRadar = null;
let _chartMixDona = null, _chartCategoria = null, _chartZona = null, _chartGaugeMeta = null, _chartTreemap = null;
let _chartHeatmap = null, _chartWaterfall = null;
let _leaderboardPeriodo = 'mes';
let _perfilesMap = {};
let _metaMap = {};

// Período global de la sección de análisis: 'hoy' | 'semana' | 'mes' | '90d'
let _periodoActivo = 'mes';
let _periodoSelectorWired = false;
let _waterfallModo = 'caja'; // 'caja' | 'rentabilidad'
let _waterfallToggleWired = false;
let _gastosCache = { periodo: null, valor: 0, ts: 0 };
const _PERIODO_LABEL = { hoy: 'Hoy', semana: 'Esta semana', mes: 'Este mes', '90d': 'Últimos 90 días' };

// Suma de gastos de TODOS los vendedores dentro del período activo.
// Los gastos viven particionados en configuracion (doc gastos_vendedor_<id>).
// Cache 30s por período; degrada a 0 ante cualquier fallo (no rompe el waterfall).
async function _obtenerGastosPeriodo() {
    if (_gastosCache.periodo === _periodoActivo && (Date.now() - _gastosCache.ts) < 30000) return _gastosCache.valor;
    let total = 0;
    try {
        const ini = _inicioDePeriodo(_periodoActivo);
        const ids = (typeof _perfilesMap !== 'undefined') ? Object.keys(_perfilesMap) : [];
        if (!ids.length || typeof obtenerConfig !== 'function') return 0;
        const results = await Promise.all(ids.map(id => obtenerConfig('gastos_vendedor_' + id).catch(() => null)));
        results.forEach(datos => {
            const arr = Array.isArray(datos) ? datos : (datos && Array.isArray(datos.gastos) ? datos.gastos : []);
            arr.forEach(g => { if (g && g.fecha && new Date(g.fecha) >= ini) total += Number(g.monto) || 0; });
        });
    } catch (e) { console.warn('[Dashboard] Gastos período:', e); return 0; }
    _gastosCache = { periodo: _periodoActivo, valor: total, ts: Date.now() };
    return total;
}

// Inicio del período activo (Date). La semana arranca el domingo.
function _inicioDePeriodo(periodo) {
    const now = new Date();
    if (periodo === 'hoy') { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
    if (periodo === 'semana') { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()); return d; }
    if (periodo === '90d') { const d = new Date(now); d.setDate(d.getDate() - 89); d.setHours(0, 0, 0, 0); return d; }
    return new Date(now.getFullYear(), now.getMonth(), 1); // mes
}

// Pedidos dentro del período activo (excluye anulados)
function _pedidosDelPeriodo(pedidos) {
    const ini = _inicioDePeriodo(_periodoActivo);
    return (pedidos || []).filter(p => p.fecha && new Date(p.fecha) >= ini && p.estado !== 'anulado');
}

// Estado vacío reutilizable para un canvas de gráfico.
// mostrar=true oculta el canvas y pinta un placeholder; mostrar=false lo restaura.
function _estadoVacioGrafico(canvasId, mostrar, mensaje) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const cont = canvas.parentElement;
    if (!cont) return;
    let ph = cont.querySelector('.chart-empty');
    if (mostrar) {
        canvas.style.display = 'none';
        if (!ph) {
            ph = document.createElement('div');
            ph.className = 'chart-empty absolute inset-0 flex flex-col items-center justify-center text-center gap-2';
            cont.appendChild(ph);
        }
        ph.innerHTML = `<i data-lucide="inbox" class="w-6 h-6"></i><span class="text-xs">${escapeHTML(mensaje || 'Sin datos en este período')}</span>`;
        if (window.lucide) { try { lucide.createIcons(); } catch (_) {} }
    } else {
        canvas.style.display = '';
        if (ph) ph.remove();
    }
}

// Top 5 productos (unidades) del período — dona compacta
function _renderTopProductos(pedidos) {
    const ctxTop = document.getElementById('chartTopProductos');
    if (!ctxTop) return;
    try {
        const prodCount = {};
        _pedidosDelPeriodo(pedidos).forEach(p => (p.items || []).forEach(i => {
            const key = i.nombre || 'N/A';
            prodCount[key] = (prodCount[key] || 0) + (i.cantidad || 1);
        }));
        const top5 = Object.entries(prodCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (!top5.length) { if (chartTopProd) { chartTopProd.destroy(); chartTopProd = null; } _estadoVacioGrafico('chartTopProductos', true, 'Sin ventas en este período'); return; }
        _estadoVacioGrafico('chartTopProductos', false);
        const coloresDoughnut = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#22d3ee'];
        if (chartTopProd) chartTopProd.destroy();
        chartTopProd = new Chart(ctxTop, {
            type: 'doughnut',
            data: { labels: top5.map(t => t[0]), datasets: [{ data: top5.map(t => t[1]), backgroundColor: coloresDoughnut, borderWidth: 0, hoverOffset: 6 }] },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '70%', animation: { duration: 700 },
                onHover: _chartHoverPointer,
                onClick: (evt, els) => { if (!els.length) return; const nombre = top5[els[0].index] && top5[els[0].index][0]; if (nombre) _dashDrillVentas({ texto: nombre }); },
                plugins: {
                    legend: { position: 'right', labels: { font: { size: 10 }, boxWidth: 10, padding: 8, color: '#9ca3af' } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} u` } }
                }
            }
        });
    } catch (e) { console.warn('[Dashboard] Top productos:', e); }
}

// Click-through: navega a Ventas aplicando filtro de estado y/o texto.
function _dashDrillVentas({ estado = '', texto = '' } = {}) {
    try {
        const selEstado = document.getElementById('filtroTipoVenta');
        if (selEstado) selEstado.value = estado;
        const inpTexto = document.getElementById('filtroTextoVentas');
        if (inpTexto) inpTexto.value = texto;
        if (typeof cambiarSeccion === 'function') cambiarSeccion('ventas');
        setTimeout(() => { if (typeof filtrarVentas === 'function') filtrarVentas(); }, 80);
    } catch (e) { console.warn('[Dashboard] Drill ventas:', e); }
}

// Cursor pointer sobre elementos clickeables de un chart
function _chartHoverPointer(evt, elements) {
    const t = evt && evt.native && evt.native.target;
    if (t) t.style.cursor = elements && elements.length ? 'pointer' : 'default';
}

// Orquestador: TODOS los visuales que dependen del período global.
function _renderVisuales(pedidos) {
    _renderAnalisisAvanzado(pedidos);
    _renderRadarVendedores(pedidos);
    _renderMixDona(pedidos);
    _renderCategoria(pedidos);
    _renderZona(pedidos);
    _renderTreemap(pedidos);
    _renderTopProductos(pedidos);
    if (typeof _renderHeatmap === 'function') _renderHeatmap(pedidos);
    if (typeof _renderWaterfall === 'function') _renderWaterfall(pedidos);
}

// Banda de alertas inteligentes (chips navegables) arriba del dashboard.
// Solo lectura: deriva señales de datos ya cargados y navega vía data-section.
async function _renderInsights(pedidos) {
    const cont = document.getElementById('dashInsights');
    if (!cont) return;
    try {
        pedidos = pedidos || [];
        const insights = [];
        const dias = (f) => Math.floor((Date.now() - new Date(f)) / 86400000);

        // 1) Tendencia de ventas: esta semana vs mismo tramo de la anterior (domingo→ahora)
        const now = new Date();
        const iniSem = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        const iniSemAnt = new Date(iniSem); iniSemAnt.setDate(iniSem.getDate() - 7);
        const sumEntre = (a, b) => pedidos.filter(p => { const f = new Date(p.fecha); return p.estado !== 'anulado' && f >= a && f < b; }).reduce((s, p) => s + (p.total || 0), 0);
        const vSem = sumEntre(iniSem, new Date(now.getTime() + 1));
        const vSemAnt = sumEntre(iniSemAnt, new Date(iniSemAnt.getTime() + (now.getTime() - iniSem.getTime())));
        if (vSemAnt > 0) {
            const pct = Math.round((vSem - vSemAnt) / vSemAnt * 100);
            if (pct <= -10) insights.push({ tone: 'alert', icon: 'trending-down', txt: `Ventas ↓${Math.abs(pct)}% vs semana pasada`, section: 'ventas' });
            else if (pct >= 10) insights.push({ tone: 'ok', icon: 'trending-up', txt: `Ventas ↑${pct}% vs semana pasada`, section: 'ventas' });
        }

        // 2) Créditos vencidos: entregado con saldo y +30 días
        const pagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
        const saldoDe = (p) => { const pagado = pagos.filter(pg => pg.pedidoId === p.id).reduce((s, pg) => s + (Number(pg.monto) || 0), 0); return Math.max(0, (p.total || 0) - pagado); };
        const vencidos = pedidos.filter(p => p.estado === 'entregado' && saldoDe(p) > 0 && dias(p.fecha) > 30).length;
        if (vencidos) insights.push({ tone: 'warn', icon: 'alert-triangle', txt: `${vencidos} crédito${vencidos > 1 ? 's' : ''} vencido${vencidos > 1 ? 's' : ''} (+30 días)`, section: 'creditos' });

        // 3) Stock bajo (< 5) en presentaciones activas
        let bajos = 0;
        if (typeof productosData !== 'undefined' && productosData && productosData.productos) {
            productosData.productos.forEach(p => (p.presentaciones || []).forEach(pr => {
                if (pr.activo !== false && typeof pr.stock === 'number' && pr.stock < 5) bajos++;
            }));
        }
        if (bajos) insights.push({ tone: 'warn', icon: 'package', txt: `${bajos} con stock bajo (<5)`, section: 'stock' });

        // 4) Pedidos pendientes con demora (+3 días)
        const pendViejos = pedidos.filter(p => (p.estado === 'pedido_pendiente' || p.estado === 'pendiente') && dias(p.fecha) > 3).length;
        if (pendViejos) insights.push({ tone: 'alert', icon: 'clock', txt: `${pendViejos} pedido${pendViejos > 1 ? 's' : ''} sin finalizar (+3 días)`, section: 'pedidos' });

        if (!insights.length) insights.push({ tone: 'ok', icon: 'check-circle', txt: 'Todo en orden — sin alertas' });

        cont.innerHTML = insights.map(it => {
            const sec = it.section ? ` data-section="${escapeHTML(it.section)}"` : '';
            return `<button type="button" class="dash-insight tone-${it.tone}"${sec}><i data-lucide="${escapeHTML(it.icon)}" class="di-ico"></i><span>${escapeHTML(it.txt)}</span></button>`;
        }).join('');
        if (window.lucide) { try { lucide.createIcons(); } catch (_) {} }
    } catch (e) { console.warn('[Dashboard] Insights:', e); }
}

// Selector de período global (segmented). Se cablea una sola vez.
function _initPeriodoSelector() {
    if (_periodoSelectorWired) return;
    const cont = document.getElementById('dashPeriodoSelector');
    if (!cont) return;
    _periodoSelectorWired = true;
    cont.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-periodo]');
        if (!btn) return;
        const nuevo = btn.getAttribute('data-periodo');
        if (!nuevo || nuevo === _periodoActivo) return;
        _periodoActivo = nuevo;
        cont.querySelectorAll('.dash-seg-btn').forEach(b => b.classList.toggle('is-active', b === btn));
        const lbl = document.getElementById('dashPeriodoLabel');
        if (lbl) lbl.textContent = '· ' + (_PERIODO_LABEL[nuevo] || '');
        const grid = document.getElementById('dashVisualesGrid');
        if (grid) grid.classList.add('is-updating');
        requestAnimationFrame(() => {
            try { _renderVisuales(typeof todosLosPedidos !== 'undefined' ? todosLosPedidos : []); }
            finally { if (grid) setTimeout(() => grid.classList.remove('is-updating'), 60); }
        });
    });
}

// ============================================
// Chart.js — tema oscuro global (command center)
// Se aplica UNA vez al cargar. Afecta a TODOS los charts del admin
// (dashboard, creditos, clientes, proveedores) sin tocar cada config.
// ============================================
(function _aplicarTemaChartJsOscuro() {
    if (typeof Chart === 'undefined' || Chart.__hdvDark) return;
    Chart.__hdvDark = true;
    const css = getComputedStyle(document.documentElement);
    const val = (n, f) => (css.getPropertyValue(n) || f).trim();
    const ink = val('--ink', '#E9E7E1');
    const muted = val('--muted', '#8A8F98');
    const panel = val('--panel-2', '#191C21');
    const hairline = 'rgba(255,255,255,0.09)';
    Chart.defaults.color = muted;                 // ticks / texto general
    Chart.defaults.borderColor = hairline;        // grid lines + ejes
    if (Chart.defaults.font) Chart.defaults.font.family = "'Geist', system-ui, sans-serif";
    Chart.defaults.plugins = Chart.defaults.plugins || {};
    if (Chart.defaults.plugins.legend) {
        Chart.defaults.plugins.legend.labels = Chart.defaults.plugins.legend.labels || {};
        Chart.defaults.plugins.legend.labels.color = ink;
    }
    if (Chart.defaults.plugins.tooltip) {
        Object.assign(Chart.defaults.plugins.tooltip, {
            backgroundColor: panel, titleColor: ink, bodyColor: ink,
            borderColor: hairline, borderWidth: 1
        });
    }
})();

// ============================================
// DASHBOARD — Carga principal
// ============================================
async function cargarDashboard() {
    const pedidos = todosLosPedidos;
    const hoy = new Date();

    // Cargar perfiles y metas (necesario para feed y leaderboard)
    const perfiles = await _obtenerPerfilesMetas();
    _perfilesMap = {};
    perfiles.forEach(p => { _perfilesMap[p.id] = p.nombre_completo || 'Sin nombre'; });

    const metas = (await HDVStorage.getItem('hdv_metas')) || [];
    const mesActual = hoy.toISOString().slice(0, 7);
    _metaMap = {};
    metas.filter(m => m.activa && m.mes === mesActual && m.vendedor_id)
         .forEach(m => { _metaMap[m.vendedor_id] = m.monto || 0; });

    // KPIs mensuales
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const pedidosMes = pedidos.filter(p => new Date(p.fecha) >= inicioMes);
    const ventasMes = pedidosMes.reduce((s, p) => s + (p.total || 0), 0);
    const clientesActivosMes = new Set(pedidosMes.map(p => p.cliente?.id)).size;
    const ticketPromedio = pedidosMes.length > 0 ? Math.round(ventasMes / pedidosMes.length) : 0;

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('dashVentasMes', formatearGuaranies(ventasMes));
    el('dashPedidosMes', pedidosMes.length);
    el('dashClientesActivos', clientesActivosMes);
    el('dashTicketPromedio', formatearGuaranies(ticketPromedio));

    // Sparkline 14 días + delta mes-a-mes (al mismo día del mes)
    const _serie14 = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(hoy); d.setDate(hoy.getDate() - i);
        const k = d.toISOString().slice(0, 10);
        _serie14.push(pedidos.filter(p => (p.fecha || '').slice(0, 10) === k).reduce((s, p) => s + (p.total || 0), 0));
    }
    const _spark = document.getElementById('dashVentasSparkline');
    if (_spark) _spark.innerHTML = _sparklineSVG(_serie14, { color: '#e4e4e7' });

    const _diaHoy = hoy.getDate();
    const _inicioMesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const _ventasMesAntMTD = pedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= _inicioMesAnt && f < inicioMes && f.getDate() <= _diaHoy;
    }).reduce((s, p) => s + (p.total || 0), 0);
    const _trEl = document.getElementById('dashVentasMesTrend');
    if (_trEl) {
        if (_ventasMesAntMTD === 0) {
            _trEl.textContent = 'Sin datos del mes anterior';
            _trEl.className = 'text-xs text-gray-400 mt-1';
        } else {
            const pct = Math.round((ventasMes - _ventasMesAntMTD) / _ventasMesAntMTD * 100);
            const sube = pct >= 0;
            _trEl.textContent = `${sube ? '↑' : '↓'} ${Math.abs(pct)}% vs mes anterior (al día ${_diaHoy})`;
            _trEl.className = `text-xs mt-1 font-semibold ${sube ? 'text-emerald-600' : 'text-red-500'}`;
        }
    }

    // Ganancia Neta del Mes
    const gananciaMes = calcularGananciaPedidos(pedidosMes);
    el('dashGananciaNeta', formatearGuaranies(gananciaMes.gananciaTotal));
    el('dashCostoTotal', formatearGuaranies(gananciaMes.costoTotal));

    const elMargen = document.getElementById('dashMargenPromedio');
    if (elMargen) {
        elMargen.textContent = gananciaMes.margenPromedio + '%';
        elMargen.className = 'text-2xl font-bold mt-1 ' + (
            gananciaMes.margenPromedio > 30 ? 'text-green-700' :
            gananciaMes.margenPromedio > 15 ? 'text-yellow-700' : 'text-red-700'
        );
    }
    const elDetalle = document.getElementById('dashGananciaDetalle');
    if (elDetalle) elDetalle.textContent = gananciaMes.itemsConCosto === 0
        ? 'Define costos en productos para ver ganancia real'
        : `${gananciaMes.itemsConCosto}/${gananciaMes.itemsTotales} items con costo definido`;
    const elMargenDet = document.getElementById('dashMargenDetalle');
    if (elMargenDet) elMargenDet.textContent = gananciaMes.costoTotal > 0
        ? `Ventas ${formatearGuaranies(ventasMes)} - Costos ${formatearGuaranies(gananciaMes.costoTotal)}`
        : 'Sin costos definidos aun';
    const elCostoDet = document.getElementById('dashCostoDetalle');
    if (elCostoDet) elCostoDet.textContent = gananciaMes.costoTotal > 0
        ? `${pedidosMes.length} pedidos este mes` : 'Agrega costos a tus productos';

    // Chart: top 5 productos → función period-aware (se refresca en _renderVisuales)
    _renderTopProductos(pedidos);

    // Ranking clientes semana
    const hace7d = new Date(hoy.getTime() - 7*24*60*60*1000);
    const pedidosSemana = pedidos.filter(p => new Date(p.fecha) >= hace7d);
    const clienteRanking = {};
    pedidosSemana.forEach(p => {
        const nombre = p.cliente?.nombre || 'N/A';
        if (!clienteRanking[nombre]) clienteRanking[nombre] = { total: 0, pedidos: 0 };
        clienteRanking[nombre].total += p.total || 0;
        clienteRanking[nombre].pedidos++;
    });
    const rankDiv = document.getElementById('rankingClientes');
    if (rankDiv) {
        const sorted = Object.entries(clienteRanking).sort((a,b) => b[1].total - a[1].total).slice(0, 10);
        if (sorted.length === 0) {
            rankDiv.innerHTML = '<p class="text-gray-400 text-sm italic">Sin pedidos esta semana</p>';
        } else {
            const maxTotal = sorted[0][1].total;
            rankDiv.innerHTML = sorted.map(([nombre, data], i) => {
                const pct = maxTotal > 0 ? (data.total / maxTotal * 100) : 0;
                const medals = ['🥇','🥈','🥉'];
                const medal = i < 3 ? medals[i] : `<span class="text-gray-400 text-xs font-bold">#${i+1}</span>`;
                return `<div class="flex items-center gap-3">
                    <span class="text-lg w-8 text-center">${medal}</span>
                    <div class="flex-1">
                        <div class="flex justify-between mb-1">
                            <span class="text-sm font-semibold text-gray-800">${escapeHTML(nombre)}</span>
                            <span class="text-sm font-bold text-gray-700 tabular-nums">${formatearGuaranies(data.total)} <span class="text-xs font-normal text-gray-400">(${data.pedidos})</span></span>
                        </div>
                        <div class="w-full bg-gray-100 rounded-full h-1.5"><div class="bg-gray-800 h-1.5 rounded-full" style="width:${pct}%"></div></div>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // MÓDULOS DASHBOARD
    _actualizarKPIsRealtime(pedidos);
    _initChartTemporal(_chartPeriodo);
    _renderFeedActividad(pedidos);
    _renderPedidosSinFinalizar(pedidos);
    _renderHistorialCobros();
    _initPeriodoSelector();          // segmented Hoy/Semana/Mes/90d (una sola vez)
    _initWaterfallToggle();          // toggle flujo de caja ⇄ rentabilidad (una sola vez)
    if (typeof _renderInsights === 'function') _renderInsights(pedidos); // banda de alertas
    _renderGaugeMeta(pedidos);       // gauge de meta = mensual (fijo, no sigue el período)
    _renderVisuales(pedidos);        // resto de visuales, según el período activo
    _initPersonalizacion();          // drag/ocultar/densidad (una sola vez)
    _aplicarLayout();                // aplica layout guardado (una sola vez)

    // MÓDULO INTELIGENCIA — carga tab por defecto
    _cargarIntelProyeccion();
}

// ============================================
// MÓDULO 1 — KPI SEMANA EN VIVO (real-time, semana arranca el domingo)
// ============================================
// Inicio de la semana actual (domingo 00:00) — la semana se reinicia los domingos
function _inicioSemana(ref) {
    const d = ref ? new Date(ref) : new Date();
    const ini = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()); // getDay()=0 → domingo
    return ini;
}

async function _actualizarKPIsRealtime(pedidos) {
    const iniSemana = _inicioSemana();
    const iniSemanaAnt = new Date(iniSemana); iniSemanaAnt.setDate(iniSemana.getDate() - 7);

    const enSemana = (fecha) => { const f = new Date(fecha); return f >= iniSemana; };
    const enSemanaAnt = (fecha) => { const f = new Date(fecha); return f >= iniSemanaAnt && f < iniSemana; };

    const pedidosSem    = pedidos.filter(p => p.fecha && enSemana(p.fecha));
    const pedidosSemAnt = pedidos.filter(p => p.fecha && enSemanaAnt(p.fecha));

    const ventasSem    = pedidosSem.reduce((s, p) => s + (p.total || 0), 0);
    const ventasSemAnt = pedidosSemAnt.reduce((s, p) => s + (p.total || 0), 0);
    const countSem     = pedidosSem.length;
    const countSemAnt  = pedidosSemAnt.length;
    const pendientes   = pedidos.filter(p => p.estado === 'pedido_pendiente').length;
    // Cobrado = caja real desde el libro unificado (contado + créditos cobrados en la semana)
    const pagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
    const cobradoSem    = pagos.filter(pg => pg.fecha && enSemana(pg.fecha)).reduce((s, pg) => s + (Number(pg.monto) || 0), 0);
    const cobradoSemAnt = pagos.filter(pg => pg.fecha && enSemanaAnt(pg.fecha)).reduce((s, pg) => s + (Number(pg.monto) || 0), 0);

    _animarValor('kpiVentasHoy',  ventasSem,  v => formatearGuaranies(v));
    _animarValor('kpiPedidosHoy', countSem);
    _animarValor('kpiPendientes', pendientes);
    _animarValor('kpiCobradoHoy', cobradoSem, v => formatearGuaranies(v));

    const setTrend = (id, val, prev) => {
        const e = document.getElementById(id);
        if (!e) return;
        if (prev === 0) { e.textContent = '— vs semana anterior'; e.className = 'text-xs text-gray-400 mt-1'; return; }
        const pct = Math.round((val - prev) / prev * 100);
        const sube = pct >= 0;
        e.textContent = `${sube ? '↑' : '↓'} ${Math.abs(pct)}% vs sem. anterior`;
        e.className = `text-xs mt-1 font-semibold ${sube ? 'text-emerald-600' : 'text-red-500'}`;
    };
    setTrend('kpiVentasHoyTrend',   ventasSem,   ventasSemAnt);
    setTrend('kpiPedidosHoyTrend',  countSem,    countSemAnt);
    setTrend('kpiCobradoHoyTrend',  cobradoSem,  cobradoSemAnt);

    const feedEl = document.getElementById('feedContador');
    if (feedEl) feedEl.textContent = `${pedidosSem.length} esta semana`;
}

function _animarValor(id, target, fmt) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = parseFloat(el.dataset.valor || '0');
    el.dataset.valor = target;
    if (start === target) { el.textContent = fmt ? fmt(target) : target; return; }
    const dur = 400, t0 = performance.now();
    const step = (now) => {
        const p = Math.min((now - t0) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        const val = Math.round(start + (target - start) * ease);
        el.textContent = fmt ? fmt(val) : val;
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// Sparkline SVG inline (sin Chart.js): tendencia compacta para tarjetas KPI.
// Valores numéricos → polilínea + punto final con color semántico.
function _sparklineSVG(valores, opts = {}) {
    const w = opts.w || 116, h = opts.h || 28, pad = 3;
    if (!valores || valores.length < 2) return '';
    const max = Math.max(...valores), min = Math.min(...valores);
    const rango = (max - min) || 1;
    const n = valores.length;
    const dx = (w - pad * 2) / (n - 1);
    const pts = valores.map((v, i) => {
        const x = pad + i * dx;
        const y = h - pad - ((v - min) / rango) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const color = opts.color || '#e4e4e7';
    const sube = valores[n - 1] >= valores[n - 2];
    const [lx, ly] = pts[pts.length - 1].split(',');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="hdv-sparkline" aria-hidden="true">
        <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${lx}" cy="${ly}" r="2.4" fill="${sube ? '#34D399' : '#E05252'}"/>
    </svg>`;
}

// ============================================
// MÓDULO — RADAR: PEDIDOS SIN FINALIZAR
// Lente de solo lectura: pendientes + entregados con saldo (no es una ubicación).
// ============================================
async function _renderPedidosSinFinalizar(pedidos) {
    const cont = document.getElementById('dashPedidosSinFinalizar');
    const countEl = document.getElementById('dashSinFinalizarCount');
    if (!cont) return;

    const pagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
    const saldoDe = (p) => {
        const pagado = pagos.filter(pg => pg.pedidoId === p.id).reduce((s, pg) => s + (Number(pg.monto) || 0), 0);
        return Math.max(0, (p.total || 0) - pagado);
    };

    const abiertos = (pedidos || []).filter(p => {
        const e = p.estado || PEDIDO_ESTADOS.PENDIENTE;
        if (e === PEDIDO_ESTADOS.PENDIENTE || e === 'pendiente') return true;
        if (e === PEDIDO_ESTADOS.ENTREGADO) return saldoDe(p) > 0;
        return false;
    }).map(p => {
        const dias = Math.floor((Date.now() - new Date(p.fecha)) / 86400000);
        return { p, dias };
    }).sort((a, b) => b.dias - a.dias);

    if (countEl) countEl.textContent = abiertos.length;

    if (abiertos.length === 0) {
        cont.innerHTML = '<p class="text-xs text-gray-400 italic text-center py-6">Todo finalizado — nada pendiente 🎉</p>';
        return;
    }

    cont.innerHTML = abiertos.map(({ p, dias }) => {
        const esPend = (p.estado === PEDIDO_ESTADOS.PENDIENTE || p.estado === 'pendiente');
        const estadoLabel = esPend ? 'Pendiente' : 'En crédito';
        const estadoClase = esPend ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700';
        const agingClase = dias <= 3 ? 'text-emerald-600' : dias <= 7 ? 'text-amber-600' : 'text-red-600';
        const saldo = esPend ? (p.total || 0) : saldoDe(p);
        return `<div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div class="min-w-0">
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-mono text-gray-400">${escapeHTML(displayNumPedido(p))}</span>
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full ${estadoClase}">${estadoLabel}</span>
                </div>
                <p class="text-xs text-gray-700 truncate mt-0.5">${escapeHTML(p.cliente?.nombre || 'Sin cliente')}</p>
            </div>
            <div class="text-right shrink-0 ml-2">
                <p class="text-xs font-bold text-gray-800">${formatearGuaranies(saldo)}</p>
                <p class="text-[10px] font-bold ${agingClase}">${dias}d</p>
            </div>
        </div>`;
    }).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ============================================
// MÓDULO — HISTORIAL DE COBROS (feed de eventos del libro)
// ============================================
const _HCR_ACCION_LABEL = {
    cobro_total:     { txt: 'Cobro total',  cls: 'text-emerald-600' },
    cobro_parcial:   { txt: 'Cobro parcial',cls: 'text-amber-600' },
    ingreso_credito: { txt: 'A créditos',   cls: 'text-blue-600' },
    pago_registrado: { txt: 'Pago',         cls: 'text-emerald-600' },
    credito_saldado: { txt: 'Saldado',      cls: 'text-emerald-700' }
};

async function _renderHistorialCobros() {
    const cont = document.getElementById('dashHistorialCobros');
    const totalEl = document.getElementById('dashHistorialCobrosTotal');
    if (!cont) return;

    const historial = (await HDVStorage.getItem('hdv_historial_creditos', { clone: false })) || [];
    const eventos = [...historial]
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, 40);

    if (totalEl) totalEl.textContent = historial.length ? `${historial.length} eventos` : '';

    if (eventos.length === 0) {
        cont.innerHTML = '<p class="text-xs text-gray-400 italic text-center py-6">Sin cobros registrados aún</p>';
        return;
    }

    cont.innerHTML = eventos.map(h => {
        const lbl = _HCR_ACCION_LABEL[h.accion] || { txt: h.accion || 'Evento', cls: 'text-gray-600' };
        const ref = h.numero_pedido != null ? ('#' + String(h.numero_pedido).padStart(7, '0')) : '';
        const quien = h.registrado_por === 'admin' ? 'Admin' : (h.vendedor_nombre || 'Vendedor');
        const fechaStr = new Date(h.fecha).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const montoStr = (h.monto > 0) ? formatearGuaranies(h.monto) : '—';
        return `<div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <div class="min-w-0">
                <div class="flex items-center gap-2">
                    ${ref ? `<span class="text-[10px] font-mono text-gray-400">${escapeHTML(ref)}</span>` : ''}
                    <span class="text-[11px] font-bold ${lbl.cls}">${escapeHTML(lbl.txt)}</span>
                </div>
                <p class="text-[11px] text-gray-500 truncate mt-0.5">${escapeHTML(h.clienteNombre || '')} · ${escapeHTML(quien)}</p>
            </div>
            <div class="text-right shrink-0 ml-2">
                <p class="text-xs font-bold text-gray-800">${montoStr}</p>
                <p class="text-[10px] text-gray-400">${fechaStr}</p>
            </div>
        </div>`;
    }).join('');
}

// ============================================
// MÓDULO 2 — GRÁFICO VENTAS TEMPORAL
// ============================================
function _calcularDatosChart(periodo) {
    const pedidos = window.todosLosPedidos || [];
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    let labels = [], ventasData = [], gananciaData = [];

    if (periodo === 'hoy') {
        for (let h = 0; h <= 22; h++) {
            labels.push(`${String(h).padStart(2,'0')}:00`);
            const pp = pedidos.filter(p => {
                const f = new Date(p.fecha);
                return f.toISOString().split('T')[0] === hoyStr && f.getHours() === h;
            });
            ventasData.push(pp.reduce((s, p) => s + (p.total || 0), 0));
            gananciaData.push(calcularGananciaPedidos(pp).gananciaTotal);
        }
    } else if (periodo === '7d') {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(hoy); d.setDate(d.getDate() - i);
            const fs = d.toISOString().split('T')[0];
            labels.push(d.toLocaleDateString('es-PY', { weekday: 'short' }));
            const pp = pedidos.filter(p => (p.fecha || '').slice(0, 10) === fs);
            ventasData.push(pp.reduce((s, p) => s + (p.total || 0), 0));
            gananciaData.push(calcularGananciaPedidos(pp).gananciaTotal);
        }
    } else if (periodo === '30d') {
        for (let i = 29; i >= 0; i--) {
            const d = new Date(hoy); d.setDate(d.getDate() - i);
            const fs = d.toISOString().split('T')[0];
            labels.push(d.toLocaleDateString('es-PY', { day: 'numeric', month: 'numeric' }));
            const pp = pedidos.filter(p => (p.fecha || '').slice(0, 10) === fs);
            ventasData.push(pp.reduce((s, p) => s + (p.total || 0), 0));
            gananciaData.push(calcularGananciaPedidos(pp).gananciaTotal);
        }
    } else {
        const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
        const mesStr = hoy.toISOString().slice(0, 7);
        for (let d = 1; d <= diasEnMes; d++) {
            const fs = `${mesStr}-${String(d).padStart(2, '0')}`;
            labels.push(String(d));
            const pp = pedidos.filter(p => (p.fecha || '').slice(0, 10) === fs);
            ventasData.push(pp.reduce((s, p) => s + (p.total || 0), 0));
            gananciaData.push(calcularGananciaPedidos(pp).gananciaTotal);
        }
    }
    return { labels, ventasData, gananciaData };
}

function _initChartTemporal(periodo) {
    _chartPeriodo = periodo;
    const canvas = document.getElementById('chartVentasTemporal');
    if (!canvas) return;
    if (_chartTemporal) { _chartTemporal.destroy(); _chartTemporal = null; }

    const { labels, ventasData, gananciaData } = _calcularDatosChart(periodo);
    const puntos = ventasData.length > 15 ? 0 : 3;

    _chartTemporal = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Ventas',
                    data: ventasData,
                    borderColor: '#fafafa',
                    backgroundColor: 'rgba(250,250,250,0.08)',
                    fill: true, tension: 0.4, borderWidth: 2,
                    pointRadius: puntos, pointHoverRadius: 5,
                    pointBackgroundColor: '#fafafa'
                },
                {
                    label: 'Ganancia',
                    data: gananciaData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16,185,129,0.05)',
                    fill: true, tension: 0.4, borderWidth: 2,
                    pointRadius: puntos, pointHoverRadius: 5,
                    pointBackgroundColor: '#10b981'
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937', titleColor: '#f9fafb',
                    bodyColor: '#d1d5db', padding: 10, cornerRadius: 8,
                    callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatearGuaranies(ctx.parsed.y)}` }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#9ca3af', maxRotation: 0 } },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.06)', drawBorder: false },
                    ticks: {
                        font: { size: 11 }, color: '#9ca3af',
                        callback: v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v
                    }
                }
            }
        }
    });
}

function _cambiarPeriodoChart(periodo) {
    document.querySelectorAll('#chartPeriodoTabs .chart-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.arg === periodo);
    });
    if (!_chartTemporal) { _initChartTemporal(periodo); return; }
    _chartPeriodo = periodo;
    const { labels, ventasData, gananciaData } = _calcularDatosChart(periodo);
    const puntos = ventasData.length > 15 ? 0 : 3;
    _chartTemporal.data.labels = labels;
    _chartTemporal.data.datasets[0].data = ventasData;
    _chartTemporal.data.datasets[0].pointRadius = puntos;
    _chartTemporal.data.datasets[1].data = gananciaData;
    _chartTemporal.data.datasets[1].pointRadius = puntos;
    _chartTemporal.update('active');
}

// ============================================
// MÓDULO 3 — FEED DE ACTIVIDAD EN VIVO
// ============================================
function _vendorColor(id) {
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
    return `hsl(${Math.abs(h) % 360}, 52%, 42%)`;
}

function _timeAgo(fecha) {
    const diff = (Date.now() - new Date(fecha).getTime()) / 1000;
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
    return `hace ${Math.floor(diff / 86400)}d`;
}

function _estadoBadge(estado) {
    const map = {
        pedido_pendiente:    ['bg-yellow-100 text-yellow-700', 'Pendiente'],
        entregado:           ['bg-blue-100 text-blue-700', 'Entregado'],
        cobrado_sin_factura: ['bg-green-100 text-green-700', 'Cobrado'],
        facturado_mock:      ['bg-indigo-100 text-indigo-700', 'Facturado'],
        nota_remision:       ['bg-purple-100 text-purple-700', 'Remisión'],
        anulado:             ['bg-red-100 text-red-700', 'Anulado'],
    };
    const [cls, label] = map[estado] || ['bg-gray-100 text-gray-500', estado || '?'];
    return `<span class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${cls}">${label}</span>`;
}

function _renderFeedItem(p) {
    const nombre = escapeHTML((p.cliente?.nombre || 'Cliente').substring(0, 22));
    const vendorNombre = escapeHTML(_perfilesMap[p.vendedor_id] || 'Vendedor');
    const inicial = vendorNombre.charAt(0).toUpperCase();
    const color = _vendorColor(p.vendedor_id || 'x');
    const monto = formatearGuaranies(p.total || 0);
    const tiempo = _timeAgo(p.fecha);
    return `
    <div class="feed-item flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
      <div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
           style="background:${color}">${inicial}</div>
      <div class="flex-1 min-w-0">
        <div class="text-xs font-semibold text-gray-900 truncate">${nombre}</div>
        <div class="text-[10px] text-gray-400 truncate">${vendorNombre} · ${tiempo}</div>
      </div>
      <div class="text-right flex-shrink-0 space-y-0.5">
        <div class="text-xs font-bold text-gray-800 tabular-nums">${monto}</div>
        ${_estadoBadge(p.estado)}
      </div>
    </div>`;
}

function _renderFeedActividad(pedidos) {
    const container = document.getElementById('dashFeedActividad');
    if (!container) return;
    const sorted = [...pedidos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 25);
    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 italic text-center py-6">Sin actividad reciente</p>';
    } else {
        container.innerHTML = sorted.map(p => _renderFeedItem(p)).join('');
    }
    const hoy = new Date().toISOString().split('T')[0];
    const feedEl = document.getElementById('feedContador');
    if (feedEl) feedEl.textContent = `${pedidos.filter(p => (p.fecha || '').slice(0,10) === hoy).length} hoy`;
}

function _addFeedItem(pedidoDatos) {
    const container = document.getElementById('dashFeedActividad');
    if (!container) return;
    container.querySelector('.italic')?.remove();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = _renderFeedItem(pedidoDatos);
    const feedItem = wrapper.firstElementChild;
    if (feedItem) {
        container.insertBefore(feedItem, container.firstChild);
        while (container.children.length > 25) container.removeChild(container.lastChild);
    }
    const hoy = new Date().toISOString().split('T')[0];
    const feedEl = document.getElementById('feedContador');
    if (feedEl && (pedidoDatos.fecha || '').slice(0, 10) === hoy) {
        const current = parseInt(feedEl.textContent) || 0;
        feedEl.textContent = `${current + 1} hoy`;
    }
}

// ============================================
// MÓDULO 4 — LEADERBOARD DE VENDEDORES
// ============================================
function _pedidosEnPeriodo(pedidos, periodo) {
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    if (periodo === 'hoy') return pedidos.filter(p => (p.fecha || '').slice(0, 10) === hoyStr);
    if (periodo === 'sem') {
        const semStr = new Date(hoy.getTime() - 7 * 86400000).toISOString().split('T')[0];
        return pedidos.filter(p => (p.fecha || '').slice(0, 10) >= semStr);
    }
    const mesStr = hoy.toISOString().slice(0, 7);
    return pedidos.filter(p => (p.fecha || '').slice(0, 7) === mesStr);
}

function _renderLeaderboard(periodo) {
    _leaderboardPeriodo = periodo;
    const container = document.getElementById('dashLeaderboard');
    if (!container) return;

    const pedidosPeriodo = _pedidosEnPeriodo(window.todosLosPedidos || [], periodo)
        .filter(p => p.estado !== 'anulado');

    const stats = {};
    pedidosPeriodo.forEach(p => {
        const vid = p.vendedor_id || 'sin_vendedor';
        if (!stats[vid]) stats[vid] = { total: 0, count: 0 };
        stats[vid].total += p.total || 0;
        stats[vid].count++;
    });

    const sorted = Object.entries(stats).sort((a, b) => b[1].total - a[1].total).slice(0, 2);
    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 italic text-center py-3">Sin pedidos en este período</p>';
        return;
    }

    const maxTotal = sorted[0][1].total;
    const medals = ['🥇', '🥈', '🥉'];

    container.innerHTML = sorted.map(([vid, s], i) => {
        const nombre = escapeHTML(_perfilesMap[vid] || (vid === 'sin_vendedor' ? 'Sin vendedor' : 'Vendedor'));
        const color = _vendorColor(vid);
        const inicial = nombre.charAt(0).toUpperCase();
        const pct = maxTotal > 0 ? Math.round(s.total / maxTotal * 100) : 0;
        const ticketProm = s.count > 0 ? Math.round(s.total / s.count) : 0;
        const meta = _metaMap[vid] || 0;
        const pctMeta = meta > 0 ? Math.min(100, Math.round(s.total / meta * 100)) : null;
        const medal = i < 3 ? medals[i] : `<span class="text-xs font-bold text-gray-400">#${i+1}</span>`;
        return `
        <div class="flex items-center gap-3">
          <span class="text-lg w-7 text-center leading-none">${medal}</span>
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
               style="background:${color}">${inicial}</div>
          <div class="flex-1 min-w-0">
            <div class="flex justify-between items-baseline mb-1">
              <span class="text-sm font-semibold text-gray-800 truncate">${nombre}</span>
              <span class="text-sm font-bold text-gray-900 ml-2 tabular-nums">${formatearGuaranies(s.total)}</span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-1.5 mb-1">
              <div class="bg-gray-800 h-1.5 rounded-full transition-all duration-700" style="width:${pct}%"></div>
            </div>
            <div class="flex justify-between text-[10px] text-gray-400">
              <span>${s.count} pedido${s.count !== 1 ? 's' : ''} · TP ${formatearGuaranies(ticketProm)}</span>
              ${pctMeta !== null ? `<span class="font-semibold ${pctMeta >= 100 ? 'text-emerald-600' : 'text-gray-500'}">${pctMeta}% meta</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
}

function _cambiarPeriodoLeaderboard(periodo) {
    document.querySelectorAll('#leaderboardTabs .chart-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.arg === periodo);
    });
    _renderLeaderboard(periodo);
}

// ============================================
// INTELIGENCIA DE NEGOCIO — Globals
// ============================================
let _intelTabActual = 'proyeccion';
let _intelCargado   = { proyeccion: false, creditos: false, margen: false, clientes: false };
let _chartProyeccion = null;
let _chartAging      = null;
let _chartBurbuja    = null;
let _chartRFM        = null;
let _margenOrden     = { campo: 'ganancia', dir: 'desc' };
let _rfmFiltroActual = null;
let _rfmRows         = [];
let _margenRows      = [];

function _cambiarIntelTab(tab) {
    _intelTabActual = tab;
    document.querySelectorAll('#intelTabs .intel-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.arg === tab);
    });
    document.querySelectorAll('.intel-panel').forEach(p => p.classList.add('hidden'));
    const panel = document.getElementById(`intel-${tab}`);
    if (panel) panel.classList.remove('hidden');

    if (!_intelCargado[tab]) {
        if (tab === 'proyeccion') _cargarIntelProyeccion();
        else if (tab === 'creditos') _cargarIntelCreditos();
        else if (tab === 'margen') _cargarIntelMargen();
        else if (tab === 'clientes') _cargarIntelClientes();
    }
}

// ============================================
// INTELIGENCIA 1 — PROYECCIÓN DEL MES
// ============================================
function _regresionLineal(puntos) {
    const n = puntos.length;
    if (n < 2) return { m: 0, b: puntos[0]?.y || 0, r2: 0 };
    const sx = puntos.reduce((s, p) => s + p.x, 0);
    const sy = puntos.reduce((s, p) => s + p.y, 0);
    const sxy = puntos.reduce((s, p) => s + p.x * p.y, 0);
    const sxx = puntos.reduce((s, p) => s + p.x * p.x, 0);
    const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const b = (sy - m * sx) / n;
    const yMean = sy / n;
    const ssTot = puntos.reduce((s, p) => s + Math.pow(p.y - yMean, 2), 0);
    const ssRes = puntos.reduce((s, p) => s + Math.pow(p.y - (m * p.x + b), 2), 0);
    const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
    return { m, b, r2 };
}

function _proyectarMes(pedidos) {
    const hoy = new Date();
    const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const diaHoy = hoy.getDate();
    const diasRestantes = diasEnMes - diaHoy;
    const mesStr = hoy.toISOString().slice(0, 7);

    const ventasPorDia = {};
    pedidos.filter(p => (p.fecha || '').slice(0, 7) === mesStr && p.estado !== 'anulado').forEach(p => {
        const d = parseInt((p.fecha || '').slice(8, 10), 10);
        ventasPorDia[d] = (ventasPorDia[d] || 0) + (p.total || 0);
    });

    const ventasActuales = Object.values(ventasPorDia).reduce((s, v) => s + v, 0);
    const puntos = [];
    for (let d = 1; d <= diaHoy; d++) {
        puntos.push({ x: d, y: ventasPorDia[d] || 0 });
    }

    const naive = diaHoy > 0 ? Math.round(ventasActuales / diaHoy * diasEnMes) : 0;
    const reg = _regresionLineal(puntos);
    let proyeccionReg = ventasActuales;
    for (let d = diaHoy + 1; d <= diasEnMes; d++) {
        proyeccionReg += Math.max(0, Math.round(reg.m * d + reg.b));
    }

    const metaTotal = Object.values(_metaMap).reduce((s, v) => s + v, 0);
    const pace = metaTotal > 0 ? Math.round(ventasActuales / metaTotal * 100) : Math.round(diaHoy / diasEnMes * 100);
    const objDiario = diasRestantes > 0 && metaTotal > ventasActuales
        ? Math.round((metaTotal - ventasActuales) / diasRestantes) : 0;

    return { ventasActuales, naive, regresion: proyeccionReg, r2: reg.r2, pace, objDiario, diasRestantes, diasEnMes, diaHoy, ventasPorDia, metaTotal };
}

async function _cargarIntelProyeccion() {
    _intelCargado.proyeccion = true;
    const pedidos = window.todosLosPedidos || [];
    const hoy = new Date();
    const p = _proyectarMes(pedidos);

    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('projFinalMes', formatearGuaranies(p.regresion));
    el('projPace', `${p.pace}%`);
    el('projObjDiario', p.objDiario > 0 ? formatearGuaranies(p.objDiario) : '— (meta no config.)');
    el('projDiasRestantes', `${p.diasRestantes} días restantes`);
    el('projR2', `${Math.round(p.r2 * 100)}%`);
    el('projMetodo', `Regresión lineal · Naive: ${formatearGuaranies(p.naive)}`);

    const bar = document.getElementById('projPaceBar');
    if (bar) {
        const pct = Math.min(100, p.pace);
        bar.style.width = `${pct}%`;
        bar.className = `h-1.5 rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-indigo-500' : 'bg-amber-500'}`;
    }

    // Chart: días reales + proyección
    const labels = Array.from({ length: p.diasEnMes }, (_, i) => String(i + 1));
    const real = labels.map((_, i) => i + 1 <= p.diaHoy ? (p.ventasPorDia[i + 1] || 0) : null);
    const puntosReg = Array.from({ length: p.diaHoy }, (_, j) => ({ x: j + 1, y: p.ventasPorDia[j + 1] || 0 }));
    const reg2 = _regresionLineal(puntosReg);
    const proyec = labels.map((_, i) => {
        if (i + 1 < p.diaHoy) return null;
        if (i + 1 === p.diaHoy) return p.ventasPorDia[i + 1] || 0;
        return Math.max(0, Math.round(reg2.m * (i + 1) + reg2.b));
    });
    const meta = p.metaTotal > 0 ? labels.map(() => p.metaTotal) : null;

    const canvas = document.getElementById('chartProyeccion');
    if (canvas) {
        if (_chartProyeccion) _chartProyeccion.destroy();
        const datasets = [
            { label: 'Real', data: real, borderColor: '#E9E7E1', backgroundColor: 'rgba(233,231,225,0.06)', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 2, spanGaps: false },
            { label: 'Proyección', data: proyec, borderColor: '#a1a1aa', backgroundColor: 'rgba(161,161,170,0.08)', fill: true, tension: 0.3, borderWidth: 2, borderDash: [6, 3], pointRadius: 0, spanGaps: false }
        ];
        if (meta) datasets.push({ label: 'Meta', data: meta, borderColor: '#f59e0b', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0, fill: false });
        _chartProyeccion = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatearGuaranies(ctx.parsed.y || 0)}` } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af', maxTicksLimit: 10 } },
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { font: { size: 10 }, color: '#9ca3af', callback: v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v } }
                }
            }
        });
    }

    // Tabla vendedores
    const mesStr = hoy.toISOString().slice(0, 7);
    const pMes = pedidos.filter(q => (q.fecha || '').slice(0, 7) === mesStr && q.estado !== 'anulado');
    const vStats = {};
    pMes.forEach(q => {
        const vid = q.vendedor_id || 'sin_vendedor';
        if (!vStats[vid]) vStats[vid] = { total: 0, count: 0 };
        vStats[vid].total += q.total || 0;
        vStats[vid].count++;
    });
    const vRows = Object.entries(vStats).sort((a, b) => b[1].total - a[1].total);
    const tbl = document.getElementById('projTablaVendedores');
    if (tbl && vRows.length > 0) {
        tbl.innerHTML = `<table class="w-full text-xs">
          <thead><tr class="text-gray-400 text-[10px] uppercase tracking-wide border-b border-gray-100">
            <th class="text-left py-1.5 pr-3">Vendedor</th>
            <th class="text-right py-1.5 pr-3">Ventas Mes</th>
            <th class="text-right py-1.5 pr-3">Proyección</th>
            <th class="text-right py-1.5">Estado</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-50">
            ${vRows.map(([vid, s]) => {
                const nombre = escapeHTML(_perfilesMap[vid] || 'Vendedor');
                const metaV = _metaMap[vid] || 0;
                const paceV = p.diaHoy > 0 ? Math.round(s.total / p.diaHoy * p.diasEnMes) : 0;
                const pctMeta = metaV > 0 ? Math.round(paceV / metaV * 100) : null;
                const estado = pctMeta === null ? `<span class="text-gray-400">sin meta</span>`
                    : pctMeta >= 100 ? `<span class="text-emerald-600 font-semibold">✓ En meta</span>`
                    : pctMeta >= 70  ? `<span class="text-amber-500 font-semibold">⚠ Riesgo</span>`
                    :                  `<span class="text-red-500 font-semibold">✗ Crítico</span>`;
                return `<tr class="hover:bg-gray-50">
                  <td class="py-2 pr-3 font-semibold text-gray-800">${nombre}</td>
                  <td class="py-2 pr-3 text-right tabular-nums text-gray-700">${formatearGuaranies(s.total)}</td>
                  <td class="py-2 pr-3 text-right tabular-nums text-indigo-700 font-semibold">${formatearGuaranies(paceV)}</td>
                  <td class="py-2 text-right">${estado}${pctMeta !== null ? ` <span class="text-gray-400">(${pctMeta}%)</span>` : ''}</td>
                </tr>`;
            }).join('')}
          </tbody></table>`;
    }
}

// ============================================
// INTELIGENCIA 2 — CRÉDITOS
// ============================================
function _obtenerSaldoPendienteCredito(pedido, pagosArr) {
    const pagos = pagosArr.filter(pg => pg.pedidoId === pedido.id);
    const pagado = pagos.reduce((s, pg) => s + (pg.monto || 0), 0);
    return Math.max(0, (pedido.total || 0) - pagado);
}

async function _cargarIntelCreditos() {
    _intelCargado.creditos = true;
    const pedidos = (window.todosLosPedidos || []).filter(p => p.datos?.tipoPago === 'credito' && p.estado !== 'anulado');
    const pagosRaw = (await HDVStorage.getItem('hdv_pagos_credito')) || [];
    const diasVenc = window._diasVencimientoCredito || 15;
    const hoy = Date.now();

    // Aging buckets
    const aging = { alDia: 0, proximo: 0, vencido: 0, critico: 0 };
    let deudaTotal = 0, clientesMoraSet = new Set(), vencidosCount = 0;
    const diasCobro = [];

    pedidos.forEach(p => {
        const saldo = _obtenerSaldoPendienteCredito(p, pagosRaw);
        if (saldo <= 0) return;
        deudaTotal += saldo;
        const dias = Math.floor((hoy - new Date(p.fecha).getTime()) / 86400000);
        if (dias <= diasVenc) aging.alDia += saldo;
        else if (dias <= 30) aging.proximo += saldo;
        else if (dias <= 60) { aging.vencido += saldo; vencidosCount++; clientesMoraSet.add(p.cliente?.id); }
        else { aging.critico += saldo; vencidosCount++; clientesMoraSet.add(p.cliente?.id); }
    });

    // Días promedio de cobro
    pagosRaw.forEach(pg => {
        const pedido = pedidos.find(p => p.id === pg.pedidoId);
        if (!pedido) return;
        const d = Math.floor((new Date(pg.fecha).getTime() - new Date(pedido.fecha).getTime()) / 86400000);
        if (d >= 0) diasCobro.push(d);
    });
    const diasProm = diasCobro.length > 0 ? Math.round(diasCobro.reduce((s, v) => s + v, 0) / diasCobro.length) : null;

    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('credDeudaTotal', formatearGuaranies(deudaTotal));
    el('credVencidos', vencidosCount);
    el('credDiasPromedio', diasProm !== null ? `${diasProm}d` : '—');
    el('credClientesMora', clientesMoraSet.size);

    // Chart aging horizontal
    const canvas = document.getElementById('chartAging');
    if (canvas) {
        if (_chartAging) _chartAging.destroy();
        _chartAging = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: ['Deuda por antigüedad'],
                datasets: [
                    { label: `Al día (0-${diasVenc}d)`, data: [aging.alDia], backgroundColor: '#10b981' },
                    { label: 'Próx. vencer (≤30d)', data: [aging.proximo], backgroundColor: '#f59e0b' },
                    { label: 'Vencido (≤60d)', data: [aging.vencido], backgroundColor: '#f97316' },
                    { label: 'Crítico (60d+)', data: [aging.critico], backgroundColor: '#ef4444' }
                ]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatearGuaranies(ctx.parsed.x || 0)}` } }
                },
                scales: {
                    x: { stacked: true, ticks: { callback: v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : `${(v/1e3).toFixed(0)}K`, font: { size: 10 } } },
                    y: { stacked: true, display: false }
                }
            }
        });
    }

    // Score por cliente
    const clienteStats = {};
    pedidos.forEach(p => {
        const cid = p.cliente?.id || 'x';
        if (!clienteStats[cid]) clienteStats[cid] = { nombre: p.cliente?.nombre || '—', pedidos: [], saldo: 0, totalCredito: 0 };
        clienteStats[cid].pedidos.push(p);
        clienteStats[cid].saldo += _obtenerSaldoPendienteCredito(p, pagosRaw);
        clienteStats[cid].totalCredito += p.total || 0;
    });

    const scores = Object.entries(clienteStats).map(([cid, cs]) => {
        const puntuales = cs.pedidos.filter(p => {
            const pags = pagosRaw.filter(pg => pg.pedidoId === p.id);
            return pags.some(pg => Math.floor((new Date(pg.fecha) - new Date(p.fecha)) / 86400000) <= diasVenc);
        }).length;
        const ptPuntual  = cs.pedidos.length > 0 ? Math.round(puntuales / cs.pedidos.length * 40) : 0;
        const ptSaldo    = cs.totalCredito > 0 ? Math.round((1 - cs.saldo / cs.totalCredito) * 25) : 25;
        const ptFrec     = Math.min(20, cs.pedidos.length * 2);
        const primerPed  = cs.pedidos.reduce((m, p) => (!m || p.fecha < m) ? p.fecha : m, null);
        const meses      = primerPed ? Math.min(12, Math.floor((hoy - new Date(primerPed)) / (30 * 86400000))) : 0;
        const ptAntig    = Math.round(meses / 12 * 15);
        const score      = ptPuntual + ptSaldo + ptFrec + ptAntig;
        const pagsCliente = pagosRaw.filter(pg => cs.pedidos.find(p => p.id === pg.pedidoId));
        const diasPC     = pagsCliente.map(pg => {
            const ped = cs.pedidos.find(p => p.id === pg.pedidoId);
            return ped ? Math.max(0, Math.floor((new Date(pg.fecha) - new Date(ped.fecha)) / 86400000)) : null;
        }).filter(d => d !== null);
        const diasPromC  = diasPC.length > 0 ? Math.round(diasPC.reduce((s, v) => s + v, 0) / diasPC.length) : null;
        return { nombre: cs.nombre, saldo: cs.saldo, diasProm: diasPromC, score };
    }).sort((a, b) => a.score - b.score);

    const tbl = document.getElementById('credTablaScore');
    if (tbl) {
        tbl.innerHTML = `<table class="w-full text-xs">
          <thead><tr class="text-gray-400 text-[10px] uppercase tracking-wide border-b border-gray-100">
            <th class="text-left py-1.5 pr-3">Cliente</th>
            <th class="text-right py-1.5 pr-3">Saldo pendiente</th>
            <th class="text-right py-1.5 pr-3">Días prom. cobro</th>
            <th class="text-right py-1.5 pr-3">Score</th>
            <th class="text-right py-1.5">Riesgo</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-50">
            ${scores.map(s => {
                const badge = s.score >= 80 ? `<span class="risk-verde">Excelente</span>`
                    : s.score >= 50 ? `<span class="risk-amarillo">Regular</span>`
                    : `<span class="risk-rojo">Problemático</span>`;
                return `<tr class="hover:bg-gray-50">
                  <td class="py-1.5 pr-3 font-semibold text-gray-800">${escapeHTML(s.nombre)}</td>
                  <td class="py-1.5 pr-3 text-right tabular-nums ${s.saldo > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}">${formatearGuaranies(s.saldo)}</td>
                  <td class="py-1.5 pr-3 text-right text-gray-600">${s.diasProm !== null ? `${s.diasProm}d` : '—'}</td>
                  <td class="py-1.5 pr-3 text-right font-bold text-gray-900">${s.score}/100</td>
                  <td class="py-1.5 text-right">${badge}</td>
                </tr>`;
            }).join('')}
          </tbody></table>`;
    }
}

// ============================================
// INTELIGENCIA 3 — ANÁLISIS DE MARGEN
// ============================================
async function _cargarIntelMargen() {
    _intelCargado.margen = true;
    const hoy = new Date();
    const mesStr = hoy.toISOString().slice(0, 7);
    const pedidosMes = (window.todosLosPedidos || []).filter(p => (p.fecha || '').slice(0, 7) === mesStr && p.estado !== 'anulado');

    // KPIs globales
    const ganGlobal = calcularGananciaPedidos(pedidosMes);
    document.getElementById('margenGlobal')?.textContent && (document.getElementById('margenGlobal').textContent = `${ganGlobal.margenPromedio}%`);

    // Cobertura de costos
    let totalVariantes = 0, conCosto = 0;
    (productosData?.productos || []).forEach(pr => {
        (pr.presentaciones || []).forEach(v => { totalVariantes++; if ((v.costo || 0) > 0) conCosto++; });
    });
    const cobStr = totalVariantes > 0 ? `${Math.round(conCosto / totalVariantes * 100)}%` : '0%';
    const elCob = document.getElementById('margenCobertura'); if (elCob) elCob.textContent = cobStr;

    // Margen por producto
    const prodMap = {};
    (productosData?.productos || []).forEach(pr => {
        (pr.presentaciones || []).forEach(v => {
            const key = `${pr.id}||${v.tamano}`;
            prodMap[key] = { nombre: escapeHTML(`${pr.nombre} ${v.tamano}`), categoria: pr.categoria || '—', costo: v.costo || 0 };
        });
    });

    const filas = {};
    pedidosMes.forEach(p => {
        (p.items || []).forEach(item => {
            const key = `${item.productoId}||${item.presentacion}`;
            if (!filas[key]) filas[key] = { nombre: escapeHTML(item.nombre || '?'), categoria: prodMap[key]?.categoria || '—', unidades: 0, ventas: 0, costo: 0, ganancia: 0 };
            const costoUnit = prodMap[key]?.costo || 0;
            const cant = item.cantidad || 0;
            const subtotal = item.subtotal || item.precio * cant || 0;
            filas[key].unidades += cant;
            filas[key].ventas   += subtotal;
            filas[key].costo    += costoUnit * cant;
            filas[key].ganancia += subtotal - costoUnit * cant;
        });
    });
    _margenRows = Object.values(filas).map(f => ({ ...f, margenPct: f.ventas > 0 ? Math.round(f.ganancia / f.ventas * 100) : 0 }));

    // Mejor categoría
    const catMap = {};
    _margenRows.forEach(r => {
        if (!catMap[r.categoria]) catMap[r.categoria] = { ganancia: 0, ventas: 0 };
        catMap[r.categoria].ganancia += r.ganancia;
        catMap[r.categoria].ventas   += r.ventas;
    });
    const mejorCat = Object.entries(catMap).sort((a, b) => (b[1].ventas > 0 ? b[1].ganancia/b[1].ventas : 0) - (a[1].ventas > 0 ? a[1].ganancia/a[1].ventas : 0))[0];
    const elMC = document.getElementById('margenMejorCat'); if (elMC) elMC.textContent = mejorCat ? escapeHTML(mejorCat[0]) : '—';

    // Producto estrella
    const estrella = [..._margenRows].sort((a, b) => b.ganancia - a.ganancia)[0];
    const elPE = document.getElementById('margenProductoEstrella'); if (elPE) elPE.textContent = estrella ? estrella.nombre : '—';

    _renderTablaMargen();
    _renderBurbujaMargen();
}

function _renderTablaMargen() {
    const tbl = document.getElementById('margenTablaProductos');
    if (!tbl) return;
    const rows = [..._margenRows].sort((a, b) => {
        const va = a[_margenOrden.campo] ?? 0, vb = b[_margenOrden.campo] ?? 0;
        return _margenOrden.dir === 'desc' ? vb - va : va - vb;
    }).slice(0, 20);
    tbl.innerHTML = `<table class="w-full">
      <thead><tr class="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100 sticky top-0 bg-white">
        <th class="text-left py-1.5 pr-2">Producto</th>
        <th class="text-right py-1.5 pr-2 cursor-pointer hover:text-gray-700" data-action="sortTablaMargen" data-arg="ventas">Ventas</th>
        <th class="text-right py-1.5 pr-2 cursor-pointer hover:text-gray-700" data-action="sortTablaMargen" data-arg="ganancia">Ganancia</th>
        <th class="text-right py-1.5 cursor-pointer hover:text-gray-700" data-action="sortTablaMargen" data-arg="margenPct">Margen</th>
      </tr></thead>
      <tbody class="divide-y divide-gray-50">
        ${rows.map(r => `<tr class="hover:bg-gray-50">
          <td class="py-1.5 pr-2 font-semibold text-gray-800 max-w-[120px] truncate">${r.nombre}</td>
          <td class="py-1.5 pr-2 text-right tabular-nums text-gray-600">${formatearGuaranies(r.ventas)}</td>
          <td class="py-1.5 pr-2 text-right tabular-nums font-semibold ${r.ganancia > 0 ? 'text-emerald-600' : 'text-red-500'}">${formatearGuaranies(r.ganancia)}</td>
          <td class="py-1.5 text-right">
            ${r.costo === 0 ? '<span class="text-[9px] text-gray-400 italic">sin costo</span>' : `<span class="${r.margenPct < 10 ? 'risk-rojo' : r.margenPct < 25 ? 'risk-amarillo' : 'risk-verde'}">${r.margenPct}%</span>`}
          </td>
        </tr>`).join('')}
      </tbody></table>`;
}

function _sortTablaMargen(campo) {
    if (_margenOrden.campo === campo) _margenOrden.dir = _margenOrden.dir === 'desc' ? 'asc' : 'desc';
    else { _margenOrden.campo = campo; _margenOrden.dir = 'desc'; }
    _renderTablaMargen();
}

function _renderBurbujaMargen() {
    const canvas = document.getElementById('chartBurbuja');
    if (!canvas || _margenRows.length === 0) return;
    if (_chartBurbuja) _chartBurbuja.destroy();

    const top25 = [..._margenRows].filter(r => r.ventas > 0).sort((a, b) => b.ganancia - a.ganancia).slice(0, 25);
    const colorBurbuja = r => r.costo === 0 ? 'rgba(156,163,175,0.6)' : r.margenPct >= 25 ? 'rgba(16,185,129,0.65)' : r.margenPct >= 10 ? 'rgba(245,158,11,0.65)' : 'rgba(239,68,68,0.65)';

    _chartBurbuja = new Chart(canvas, {
        type: 'bubble',
        data: {
            datasets: [{
                label: 'Productos',
                data: top25.map(r => ({ x: r.unidades, y: r.margenPct, r: Math.min(30, Math.max(4, Math.sqrt(r.ganancia / 3000))), _nombre: r.nombre })),
                backgroundColor: top25.map(r => colorBurbuja(r))
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => {
                    const d = ctx.raw;
                    return ` ${d._nombre}: ${d.y}% margen · ${d.x} unid.`;
                }}}
            },
            scales: {
                x: { title: { display: true, text: 'Unidades vendidas', font: { size: 10 } }, ticks: { font: { size: 10 } } },
                y: { title: { display: true, text: 'Margen %', font: { size: 10 } }, ticks: { font: { size: 10 }, callback: v => `${v}%` } }
            }
        }
    });
}

// ============================================
// INTELIGENCIA 4 — CLIENTES RFM
// ============================================
function _rfmScore(valor, breaks) {
    for (let i = 0; i < breaks.length; i++) if (valor >= breaks[i]) return 5 - i;
    return 1;
}

function _rfmSegmento(r, f, m) {
    if (r >= 4 && f >= 4 && m >= 4) return { label: 'Campeones',      clase: 'bg-emerald-100 text-emerald-800' };
    if (f >= 4 && m >= 3)           return { label: 'Leales',          clase: 'bg-blue-100 text-blue-800' };
    if (r >= 4 && f <= 3)           return { label: 'Potencial fiel',  clase: 'bg-indigo-100 text-indigo-800' };
    if (r <= 2 && (f >= 3 || m >= 3)) return { label: 'En riesgo',    clase: 'bg-amber-100 text-amber-800' };
    if (r <= 2 && f <= 2)           return { label: 'Hibernando',      clase: 'bg-orange-100 text-orange-800' };
    if (r === 5 && f === 1)         return { label: 'Nuevos',          clase: 'bg-violet-100 text-violet-800' };
    return                                  { label: 'Perdidos',        clase: 'bg-red-100 text-red-800' };
}

async function _cargarIntelClientes() {
    _intelCargado.clientes = true;
    const hoy = Date.now();
    const d90 = new Date(hoy - 90 * 86400000).toISOString().split('T')[0];
    const pedidos90 = (window.todosLosPedidos || []).filter(p => (p.fecha || '').slice(0, 10) >= d90 && p.estado !== 'anulado');
    const mesStr = new Date().toISOString().slice(0, 7);
    const mesPasSrt = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7);

    // RFM por cliente
    const cMap = {};
    pedidos90.forEach(p => {
        const cid = p.cliente?.id || 'x';
        if (!cMap[cid]) cMap[cid] = { nombre: p.cliente?.nombre || '—', pedidos: [], totalGs: 0, items: {} };
        cMap[cid].pedidos.push(p);
        cMap[cid].totalGs += p.total || 0;
        (p.items || []).forEach(it => { cMap[cid].items[it.nombre] = (cMap[cid].items[it.nombre] || 0) + (it.cantidad || 1); });
    });

    _rfmRows = Object.entries(cMap).map(([cid, cs]) => {
        const ultimo = cs.pedidos.reduce((m, p) => p.fecha > m ? p.fecha : m, '');
        const diasR  = Math.floor((hoy - new Date(ultimo).getTime()) / 86400000);
        // Recency: menos días = mejor score (invertido)
        const R = diasR <= 7 ? 5 : diasR <= 14 ? 4 : diasR <= 30 ? 3 : diasR <= 60 ? 2 : 1;
        const F = _rfmScore(cs.pedidos.length, [10, 7, 4, 2, 1]);
        const M = _rfmScore(cs.totalGs,        [10e6, 5e6, 2e6, 500e3, 0]);
        const seg = _rfmSegmento(R, F, M);
        const favItem = Object.entries(cs.items).sort((a, b) => b[1] - a[1])[0];
        return { nombre: cs.nombre, R, F, M, segmento: seg.label, segClase: seg.clase, ultimoPedido: ultimo.slice(0, 10), productoFav: favItem ? escapeHTML(favItem[0]) : '—' };
    });

    // KPIs
    const campeones = _rfmRows.filter(r => r.segmento === 'Campeones').length;
    const enRiesgo  = _rfmRows.filter(r => ['En riesgo', 'Hibernando'].includes(r.segmento)).length;
    const clientesPasP = new Set((window.todosLosPedidos || []).filter(p => (p.fecha || '').slice(0, 7) === mesPasSrt).map(p => p.cliente?.id));
    const clientesMesActual = new Set((window.todosLosPedidos || []).filter(p => (p.fecha || '').slice(0, 7) === mesStr).map(p => p.cliente?.id));
    const retenidos = [...clientesMesActual].filter(id => clientesPasP.has(id)).length;
    const retenPct = clientesPasP.size > 0 ? Math.round(retenidos / clientesPasP.size * 100) : 0;

    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('rfmActivos', _rfmRows.length);
    el('rfmRetencion', `${retenPct}%`);
    el('rfmCampeones', campeones);
    el('rfmEnRiesgo', enRiesgo);

    // Pills de segmento
    const segmentos = [...new Set(_rfmRows.map(r => r.segmento))];
    const pillsEl = document.getElementById('rfmPills');
    if (pillsEl) {
        pillsEl.innerHTML = `<button class="rfm-chip bg-gray-800 text-white px-3 py-1 text-xs rounded-full cursor-pointer" data-action="filtrarRFMSegmento" data-arg="">Todos (${_rfmRows.length})</button>`
            + segmentos.map(s => {
                const count = _rfmRows.filter(r => r.segmento === s).length;
                const cls = _rfmRows.find(r => r.segmento === s)?.segClase || '';
                return `<button class="rfm-chip ${cls} px-3 py-1 text-xs rounded-full cursor-pointer" data-action="filtrarRFMSegmento" data-arg="${escapeHTML(s)}">${escapeHTML(s)} (${count})</button>`;
            }).join('');
    }

    _renderTablaRFM(_rfmRows);
    _renderChartRFM(_rfmRows);
}

function _filtrarRFMPorSegmento(seg) {
    _rfmFiltroActual = seg || null;
    const rows = seg ? _rfmRows.filter(r => r.segmento === seg) : _rfmRows;
    _renderTablaRFM(rows);
}

function _renderTablaRFM(rows) {
    const tbl = document.getElementById('rfmTabla');
    if (!tbl) return;
    tbl.innerHTML = `<table class="w-full">
      <thead><tr class="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100 sticky top-0 bg-white">
        <th class="text-left py-1.5 pr-2">Cliente</th>
        <th class="text-center py-1.5 pr-2">R</th>
        <th class="text-center py-1.5 pr-2">F</th>
        <th class="text-center py-1.5 pr-2">M</th>
        <th class="text-left py-1.5 pr-2">Segmento</th>
        <th class="text-left py-1.5">Producto fav.</th>
      </tr></thead>
      <tbody class="divide-y divide-gray-50">
        ${rows.map(r => `<tr class="hover:bg-gray-50">
          <td class="py-1.5 pr-2 font-semibold text-gray-800 max-w-[100px] truncate">${escapeHTML(r.nombre)}</td>
          <td class="py-1.5 pr-2 text-center font-bold text-gray-700">${r.R}</td>
          <td class="py-1.5 pr-2 text-center font-bold text-gray-700">${r.F}</td>
          <td class="py-1.5 pr-2 text-center font-bold text-gray-700">${r.M}</td>
          <td class="py-1.5 pr-2"><span class="rfm-chip ${r.segClase} px-1.5 py-0.5 rounded-full">${escapeHTML(r.segmento)}</span></td>
          <td class="py-1.5 text-gray-500 max-w-[100px] truncate">${r.productoFav}</td>
        </tr>`).join('')}
      </tbody></table>`;
}

function _renderChartRFM(rows) {
    const canvas = document.getElementById('chartRFM');
    if (!canvas || rows.length === 0) return;
    if (_chartRFM) _chartRFM.destroy();

    const segColores = {
        'Campeones':     'rgba(16,185,129,0.7)',
        'Leales':        'rgba(59,130,246,0.7)',
        'Potencial fiel':'rgba(86,129,174,0.7)',
        'En riesgo':     'rgba(245,158,11,0.7)',
        'Hibernando':    'rgba(249,115,22,0.7)',
        'Nuevos':        'rgba(61,90,120,0.7)',
        'Perdidos':      'rgba(239,68,68,0.7)',
    };
    const segs = [...new Set(rows.map(r => r.segmento))];
    const datasets = segs.map(s => ({
        label: s,
        data: rows.filter(r => r.segmento === s).map(r => ({ x: r.F, y: r.M * 1e-6, r: r.R * 3 })),
        backgroundColor: segColores[s] || 'rgba(107,114,128,0.6)'
    }));

    _chartRFM = new Chart(canvas, {
        type: 'bubble',
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: F=${ctx.parsed.x} M=${formatearGuaranies(ctx.parsed.y * 1e6)}` } }
            },
            scales: {
                x: { title: { display: true, text: 'Frecuencia (F)', font: { size: 10 } }, min: 0, max: 6, ticks: { stepSize: 1, font: { size: 10 } } },
                y: { title: { display: true, text: 'Monetario (M en millones Gs.)', font: { size: 10 } }, beginAtZero: true, ticks: { font: { size: 10 } } }
            }
        }
    });
}

// ============================================
// MÓDULO RT — Listener de pedidos en tiempo real
// ============================================
document.addEventListener('hdv:pedidos-rt', (e) => {
    if (document.getElementById('seccion-dashboard')?.style.display === 'none') return;
    const { pedidos, cambio } = e.detail;
    _actualizarKPIsRealtime(pedidos);
    if (cambio?.type === 'added') {
        _addFeedItem(cambio.datos);
    } else {
        _renderFeedActividad(pedidos);
    }
    _renderLeaderboard(_leaderboardPeriodo);
});

async function _renderVentasHoyPorVendedor(pedidos, hoy) {
    const container = document.getElementById('dashVendedoresHoy');
    if (!container) return;
    const hoyStr = hoy.toISOString().split('T')[0];
    const pedidosHoy = pedidos.filter(p => (p.fecha || '').slice(0, 10) === hoyStr);

    if (pedidosHoy.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm italic">Sin pedidos hoy</p>';
        return;
    }

    const perfiles = await _obtenerPerfilesMetas();
    const perfilesMap = {};
    perfiles.forEach(p => { perfilesMap[p.id] = p.nombre_completo || 'Sin nombre'; });

    const porVendedor = {};
    pedidosHoy.forEach(p => {
        const vid = p.vendedor_id || 'sin_vendedor';
        if (!porVendedor[vid]) porVendedor[vid] = { nombre: perfilesMap[vid] || 'Desconocido', ventas: 0, pedidos: 0 };
        porVendedor[vid].ventas += p.total || 0;
        porVendedor[vid].pedidos++;
    });

    const sorted = Object.entries(porVendedor).sort((a, b) => b[1].ventas - a[1].ventas);
    container.innerHTML = sorted.map(([_, v]) =>
        `<div class="bg-gray-50 rounded-lg p-3 text-center min-w-[120px]">
            <p class="text-xs text-gray-500 font-bold truncate">${escapeHTML(v.nombre)}</p>
            <p class="text-lg font-bold text-gray-800">${formatearGuaranies(v.ventas)}</p>
            <p class="text-[10px] text-gray-400">${v.pedidos} pedidos</p>
        </div>`
    ).join('');
}

// ============================================
// RESUMEN MENSUAL
// ============================================
function cargarSelectorMeses() {
    const select = document.getElementById('dashMesSelect');
    if (!select) return;
    select.innerHTML = '';
    const hoy = new Date();
    for (let i = 0; i < 12; i++) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const opt = document.createElement('sl-option');
        opt.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        opt.textContent = d.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });
        select.appendChild(opt);
    }
    // Shoelace sl-select: set value after options are appended
    select.value = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
    // Listen for sl-change (replaces onchange attribute removed from HTML)
    select.addEventListener('sl-change', () => cargarResumenMensual());
    cargarResumenMensual();
}

function cargarResumenMensual() {
    const mesStr = document.getElementById('dashMesSelect')?.value;
    if (!mesStr) return;
    const [anio, mes] = mesStr.split('-').map(Number);
    const inicio = new Date(anio, mes - 1, 1);
    const fin = new Date(anio, mes, 0, 23, 59, 59);

    const pedidosMes = todosLosPedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= inicio && f <= fin;
    });

    const totalVentas = pedidosMes.reduce((s, p) => s + (p.total || 0), 0);
    const totalPedidos = pedidosMes.length;
    const contado = pedidosMes.filter(p => (p.tipoPago || 'contado') === 'contado').reduce((s,p) => s + (p.total||0), 0);
    const credito = pedidosMes.filter(p => p.tipoPago === 'credito').reduce((s,p) => s + (p.total||0), 0);
    const entregados = pedidosMes.filter(p => p.estado === PEDIDO_ESTADOS.ENTREGADO).length;
    const clientesUnicos = new Set(pedidosMes.map(p => p.cliente?.id)).size;

    const container = document.getElementById('resumenMensualContenido');
    if (container) {
        container.innerHTML = `
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-green-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Total Ventas</p><p class="font-bold text-green-700">${formatearGuaranies(totalVentas)}</p></div>
                <div class="bg-blue-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Pedidos</p><p class="font-bold text-blue-700">${totalPedidos}</p></div>
                <div class="bg-gray-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Contado</p><p class="font-bold">${formatearGuaranies(contado)}</p></div>
                <div class="bg-red-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Credito</p><p class="font-bold text-red-600">${formatearGuaranies(credito)}</p></div>
                <div class="bg-purple-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Entregados</p><p class="font-bold text-purple-700">${entregados} / ${totalPedidos}</p></div>
                <div class="bg-yellow-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Clientes</p><p class="font-bold text-yellow-700">${clientesUnicos}</p></div>
            </div>
        `;
    }

    // Ganancia neta del mes seleccionado
    const gananciaContainer = document.getElementById('resumenGananciaContenido');
    if (gananciaContainer) {
        const gMes = calcularGananciaPedidos(pedidosMes);
        const margenColor = gMes.margenPromedio > 30 ? 'text-green-700' :
                            gMes.margenPromedio > 15 ? 'text-yellow-700' : 'text-red-700';
        if (gMes.costoTotal > 0) {
            gananciaContainer.innerHTML = `
                <div class="grid grid-cols-3 gap-3 border-t border-gray-200 pt-3">
                    <div class="bg-orange-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Costo Total</p><p class="font-bold text-orange-700">${formatearGuaranies(gMes.costoTotal)}</p></div>
                    <div class="bg-green-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Ganancia Neta</p><p class="font-bold text-green-700">${formatearGuaranies(gMes.gananciaTotal)}</p></div>
                    <div class="bg-blue-50 p-3 rounded-lg"><p class="text-xs text-gray-500">Margen</p><p class="font-bold ${margenColor}">${gMes.margenPromedio}%</p></div>
                </div>
                <p class="text-xs text-gray-400 mt-2">${gMes.itemsConCosto}/${gMes.itemsTotales} items con costo definido</p>
            `;
        } else {
            gananciaContainer.innerHTML = `<p class="text-xs text-gray-400 mt-2 italic">Define costos en tus productos para ver la ganancia neta de este mes</p>`;
        }
    }
}

function exportarResumenMensualPDF() {
    const mesStr = document.getElementById('dashMesSelect')?.value;
    if (!mesStr) return;
    const [anio, mes] = mesStr.split('-').map(Number);
    const inicio = new Date(anio, mes - 1, 1);
    const fin = new Date(anio, mes, 0, 23, 59, 59);
    const mesNombre = inicio.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });

    const pedidosMes = todosLosPedidos.filter(p => {
        const f = new Date(p.fecha);
        return f >= inicio && f <= fin;
    });

    const totalVentas = pedidosMes.reduce((s, p) => s + (p.total || 0), 0);
    const contado = pedidosMes.filter(p => (p.tipoPago || 'contado') === 'contado').reduce((s,p) => s + (p.total||0), 0);
    const credito = pedidosMes.filter(p => p.tipoPago === 'credito').reduce((s,p) => s + (p.total||0), 0);

    // Por cliente
    const porCliente = {};
    pedidosMes.forEach(p => {
        const n = p.cliente?.nombre || 'N/A';
        if (!porCliente[n]) porCliente[n] = { total: 0, pedidos: 0 };
        porCliente[n].total += p.total || 0;
        porCliente[n].pedidos++;
    });

    // Por producto
    const porProducto = {};
    pedidosMes.forEach(p => {
        (p.items || []).forEach(i => {
            const k = i.nombre;
            if (!porProducto[k]) porProducto[k] = { cantidad: 0, total: 0 };
            porProducto[k].cantidad += i.cantidad || 1;
            porProducto[k].total += i.subtotal || 0;
        });
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header
    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('HDV Distribuciones - Reporte Mensual', 15, 15);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1), 15, 23);

    let y = 42;
    doc.setTextColor(0, 0, 0);

    // Resumen
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumen General', 15, y); y += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Ventas: ${formatearGuaranies(totalVentas)}`, 15, y); y += 6;
    doc.text(`Total Pedidos: ${pedidosMes.length}`, 15, y); y += 6;
    doc.text(`Ventas Contado: ${formatearGuaranies(contado)}`, 15, y); y += 6;
    doc.text(`Ventas Credito: ${formatearGuaranies(credito)}`, 15, y); y += 6;
    doc.text(`Clientes Activos: ${Object.keys(porCliente).length}`, 15, y); y += 12;

    // Top clientes
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Top Clientes', 15, y); y += 8;
    doc.setFontSize(9);
    const topClientes = Object.entries(porCliente).sort((a,b) => b[1].total - a[1].total).slice(0, 10);
    topClientes.forEach(([nombre, data]) => {
        doc.setFont('helvetica', 'normal');
        doc.text(`${nombre}`, 15, y);
        doc.text(`${data.pedidos} pedidos`, 120, y);
        doc.setFont('helvetica', 'bold');
        doc.text(formatearGuaranies(data.total), 195, y, { align: 'right' });
        y += 6;
    });

    y += 8;
    // Top productos
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Top Productos', 15, y); y += 8;
    doc.setFontSize(9);
    const topProductos = Object.entries(porProducto).sort((a,b) => b[1].total - a[1].total).slice(0, 10);
    topProductos.forEach(([nombre, data]) => {
        doc.setFont('helvetica', 'normal');
        doc.text(`${nombre}`, 15, y);
        doc.text(`${data.cantidad} unid.`, 120, y);
        doc.setFont('helvetica', 'bold');
        doc.text(formatearGuaranies(data.total), 195, y, { align: 'right' });
        y += 6;
    });

    // Footer
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(7);
    doc.text(`Generado: ${new Date().toLocaleString('es-PY')} - HDV Distribuciones EAS`, 105, 290, { align: 'center' });

    doc.save(`hdv_reporte_${mesStr}.pdf`);
}

async function guardarResumenMensual() {
    const mesStr = document.getElementById('dashMesSelect')?.value;
    if (!mesStr) return;

    await withButtonLock('btnGuardarResumen', async () => {
        const [anio, mes] = mesStr.split('-').map(Number);
        const inicio = new Date(anio, mes - 1, 1);
        const fin = new Date(anio, mes, 0, 23, 59, 59);

        const pedidosMes = todosLosPedidos.filter(p => {
            const f = new Date(p.fecha);
            return f >= inicio && f <= fin;
        });

        const resumen = {
            mes: mesStr,
            fechaGeneracion: new Date().toISOString(),
            totalVentas: pedidosMes.reduce((s, p) => s + (p.total || 0), 0),
            totalPedidos: pedidosMes.length,
            contado: pedidosMes.filter(p => (p.tipoPago||'contado') === 'contado').reduce((s,p) => s + (p.total||0), 0),
            credito: pedidosMes.filter(p => p.tipoPago === 'credito').reduce((s,p) => s + (p.total||0), 0),
            clientesActivos: new Set(pedidosMes.map(p => p.cliente?.id)).size,
            entregados: pedidosMes.filter(p => p.estado === PEDIDO_ESTADOS.ENTREGADO).length
        };

        const { success, error } = await SupabaseService.upsertReporteMensual(mesStr, resumen);
        if (success) {
            mostrarToast(`Resumen de ${mesStr} guardado`, 'success');
        } else {
            console.error('[Dashboard] Error guardando resumen:', error);
            mostrarToast('Error guardando resumen mensual', 'error');
        }
    }, 'Guardando...')();
}

// ============================================
// METAS Y COMISIONES
// ============================================

let _metasPerfilesCache = null;

async function _obtenerPerfilesMetas() {
    if (_metasPerfilesCache) return _metasPerfilesCache;
    try {
        const { data } = await supabaseClient.from('perfiles').select('id, nombre_completo, rol');
        _metasPerfilesCache = (data || []).filter(p => p.rol === 'vendedor');
    } catch (e) { _metasPerfilesCache = []; }
    return _metasPerfilesCache;
}

function _obtenerNombreVendedorMeta(m, perfilesMap) {
    if (m.vendedor_id && perfilesMap[m.vendedor_id]) return perfilesMap[m.vendedor_id];
    return m.vendedor || 'Sin vendedor';
}

async function cargarMetas() {
    let metas = (await HDVStorage.getItem('hdv_metas')) || [];
    const mesActual = new Date().toISOString().slice(0, 7);
    const perfiles = await _obtenerPerfilesMetas();
    const perfilesMap = {};
    perfiles.forEach(p => { perfilesMap[p.id] = p.nombre_completo || 'Sin nombre'; });

    let cambio = false;
    metas.forEach(m => {
        if (m.activa && m.mes < mesActual) {
            m.activa = false;
            cambio = true;
        }
        if (m.vendedor && !m.vendedor_id) {
            const perfil = perfiles.find(p => (p.nombre_completo || '').toLowerCase() === m.vendedor.toLowerCase());
            if (perfil) { m.vendedor_id = perfil.id; cambio = true; }
        }
    });
    if (cambio) {
        await HDVStorage.setItem('hdv_metas', metas);
        if (typeof guardarMetas === 'function') guardarMetas(metas).catch(() => {});
    }

    const metaActiva = metas.find(m => m.mes === mesActual && m.activa) || metas.find(m => m.activa);

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
    const pedidosMes = pedidos.filter(p => p.fecha && p.fecha.startsWith(mesActual));

    let totalVendido = pedidosMes.reduce((sum, p) => sum + (p.total || 0), 0);
    if (metaActiva && metaActiva.vendedor_id) {
        totalVendido = pedidosMes.filter(p => p.vendedor_id === metaActiva.vendedor_id).reduce((sum, p) => sum + (p.total || 0), 0);
    }

    if (metaActiva) {
        const objetivo = metaActiva.monto || 0;
        const comisionPct = metaActiva.comision || 0;
        const porcentaje = objetivo > 0 ? Math.min(100, Math.round((totalVendido / objetivo) * 100)) : 0;
        const comisionEstimada = Math.round(totalVendido * (comisionPct / 100));
        const faltante = Math.max(0, objetivo - totalVendido);

        document.getElementById('metaObjetivo').textContent = formatearGuaranies(objetivo);
        document.getElementById('metaVendido').textContent = formatearGuaranies(totalVendido);
        document.getElementById('metaComision').textContent = formatearGuaranies(comisionEstimada);
        document.getElementById('metaPorcentaje').textContent = `${porcentaje}%`;
        document.getElementById('metaFaltante').textContent = faltante > 0
            ? `Faltan ${formatearGuaranies(faltante)} para alcanzar la meta`
            : 'Meta alcanzada!';

        const barra = document.getElementById('metaBarraProgreso');
        barra.style.width = `${porcentaje}%`;
        barra.textContent = `${porcentaje}%`;
        barra.className = `h-6 rounded-full transition-all duration-700 flex items-center justify-center text-white text-xs font-bold ${porcentaje < 50 ? 'bg-red-500' : porcentaje < 80 ? 'bg-yellow-500' : 'bg-green-500'}`;
    } else {
        document.getElementById('metaObjetivo').textContent = 'Sin meta';
        document.getElementById('metaVendido').textContent = formatearGuaranies(totalVendido);
        document.getElementById('metaComision').textContent = 'Gs. 0';
        document.getElementById('metaPorcentaje').textContent = '-';
        document.getElementById('metaFaltante').textContent = 'Configure una meta para ver el progreso';
        document.getElementById('metaBarraProgreso').style.width = '0%';
    }

    const verHistorial = document.getElementById('metasVerHistorial')?.checked;
    const metasFiltradas = verHistorial ? metas : metas.filter(m => m.activa || m.mes === mesActual);

    const container = document.getElementById('metasContainer');
    if (metasFiltradas.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_ORDERS, 'Sin metas configuradas', 'Crea metas mensuales para los vendedores');
    } else {
        container.innerHTML = metasFiltradas.sort((a, b) => b.mes.localeCompare(a.mes)).map(m => {
            const nombre = _obtenerNombreVendedorMeta(m, perfilesMap);
            const pedMes = pedidos.filter(p => p.fecha && p.fecha.startsWith(m.mes) && (!m.vendedor_id || p.vendedor_id === m.vendedor_id));
            const vendMes = pedMes.reduce((s, p) => s + (p.total || 0), 0);
            const pct = m.monto > 0 ? Math.min(100, Math.round((vendMes / m.monto) * 100)) : 0;
            const comisionEst = Math.round(vendMes * ((m.comision || 0) / 100));
            const pagadaBadge = m.comision_pagada
                ? '<span class="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Comision Pagada</span>'
                : (pct >= 100 ? `<sl-button onclick="marcarComisionPagada('${m.id}')" variant="success" size="small">Pagar Comision</sl-button>` : '');
            return `
            <div class="p-4 flex justify-between items-center">
                <div>
                    <p class="font-bold text-gray-800">${escapeHTML(nombre)} - ${escapeHTML(m.mes)}</p>
                    <p class="text-sm text-gray-500">Meta: ${formatearGuaranies(m.monto)} | Comision: ${m.comision}% (${formatearGuaranies(comisionEst)})</p>
                    <div class="mt-2 w-48 bg-gray-200 rounded-full h-3">
                        <div class="h-3 rounded-full ${pct < 50 ? 'bg-red-500' : pct < 80 ? 'bg-yellow-500' : 'bg-green-500'}" style="width: ${pct}%"></div>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-sm font-bold ${pct >= 100 ? 'text-green-600' : 'text-gray-600'}">${pct}%</span>
                    <span class="text-xs px-2 py-1 rounded-full ${m.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${m.activa ? 'Activa' : 'Inactiva'}</span>
                    ${pagadaBadge}
                    <button onclick="editarMeta('${m.id}')" class="text-blue-600 text-sm font-bold">Editar</button>
                    <button onclick="eliminarMeta('${m.id}')" class="text-red-600 text-sm font-bold">Eliminar</button>
                </div>
            </div>`;
        }).join('');
    }
}

async function _poblarSelectVendedorMeta() {
    const select = document.getElementById('formMetaVendedor');
    if (!select) return;
    const existentes = select.querySelectorAll('sl-option');
    existentes.forEach(el => el.remove());
    const perfiles = await _obtenerPerfilesMetas();
    perfiles.forEach(p => {
        const opt = document.createElement('sl-option');
        opt.value = p.id;
        opt.textContent = p.nombre_completo || 'Sin nombre';
        select.appendChild(opt);
    });
}

async function abrirModalMeta(metaId) {
    await _poblarSelectVendedorMeta();
    document.getElementById('formMetaId').value = '';
    document.getElementById('formMetaVendedor').value = '';
    document.getElementById('formMetaMonto').value = '';
    document.getElementById('formMetaComision').value = '5';
    document.getElementById('formMetaMes').value = new Date().toISOString().slice(0, 7);
    document.getElementById('formMetaActiva').value = 'true';
    if (metaId) {
        const metas = (await HDVStorage.getItem('hdv_metas', { clone: false })) || [];
        const m = metas.find(x => x.id === metaId);
        if (m) {
            document.getElementById('formMetaId').value = m.id;
            document.getElementById('formMetaVendedor').value = m.vendedor_id || '';
            document.getElementById('formMetaMonto').value = m.monto;
            document.getElementById('formMetaComision').value = m.comision;
            document.getElementById('formMetaMes').value = m.mes;
            document.getElementById('formMetaActiva').value = m.activa ? 'true' : 'false';
        }
    }
    document.getElementById('modalMeta').show();
}

function cerrarModalMeta() { document.getElementById('modalMeta').hide(); }
function editarMeta(id) { abrirModalMeta(id); }

async function guardarMeta() {
    const id = document.getElementById('formMetaId').value || 'META' + Date.now();
    const vendedorId = document.getElementById('formMetaVendedor').value;
    const perfiles = await _obtenerPerfilesMetas();
    const perfil = perfiles.find(p => p.id === vendedorId);
    const meta = {
        id,
        vendedor_id: vendedorId || null,
        vendedor: perfil ? perfil.nombre_completo : (vendedorId || 'Sin vendedor'),
        monto: parseInt(document.getElementById('formMetaMonto').value) || 0,
        comision: parseFloat(document.getElementById('formMetaComision').value) || 0,
        mes: document.getElementById('formMetaMes').value,
        activa: document.getElementById('formMetaActiva').value === 'true'
    };
    if (!meta.monto) { mostrarToast('Monto de meta es obligatorio', 'error'); return; }
    if (!meta.vendedor_id) { mostrarToast('Selecciona un vendedor', 'error'); return; }

    await withButtonLock('btnGuardarMeta', async () => {
        let metas = (await HDVStorage.getItem('hdv_metas')) || [];
        const existente = metas.find(m => m.id !== id && m.vendedor_id === meta.vendedor_id && m.mes === meta.mes);
        if (existente) { mostrarToast('Ya existe una meta para este vendedor en ese mes', 'error'); return; }
        const idx = metas.findIndex(m => m.id === id);
        if (idx >= 0) { meta.comision_pagada = metas[idx].comision_pagada; meta.fecha_pago = metas[idx].fecha_pago; metas[idx] = meta; }
        else metas.push(meta);
        await HDVStorage.setItem('hdv_metas', metas);
        if (typeof guardarMetas === 'function') {
            try { await guardarMetas(metas); }
            catch (e) { console.error('[Metas] Error sincronizando:', e); mostrarToast('Meta guardada local pero fallo la sincronizacion', 'warning'); }
        }
        cerrarModalMeta();
        cargarMetas();
        mostrarToast('Meta guardada', 'success');
    }, 'Guardando...')();
}

async function marcarComisionPagada(metaId) {
    if (!await mostrarConfirmModal('¿Marcar la comision como PAGADA?', { textoConfirmar: 'Marcar Pagada' })) return;
    let metas = (await HDVStorage.getItem('hdv_metas')) || [];
    const m = metas.find(x => x.id === metaId);
    if (!m) return;
    m.comision_pagada = true;
    m.fecha_pago = new Date().toISOString();
    await HDVStorage.setItem('hdv_metas', metas);
    if (typeof guardarMetas === 'function') {
        try { await guardarMetas(metas); }
        catch (e) { console.error('[Metas] Error sincronizando pago comision:', e); }
    }
    mostrarExito('Comision marcada como pagada');
    cargarMetas();
}

async function eliminarMeta(id) {
    if (!await mostrarConfirmModal('¿Eliminar esta meta?', { destructivo: true, textoConfirmar: 'Eliminar' })) return;
    let metas = (await HDVStorage.getItem('hdv_metas')) || [];
    metas = metas.filter(m => m.id !== id);
    await HDVStorage.setItem('hdv_metas', metas);
    if (typeof guardarMetas === 'function') {
        try { await guardarMetas(metas); }
        catch (e) { console.error('[Metas] Error sincronizando eliminacion:', e); mostrarToast('Meta eliminada local pero fallo la sincronizacion', 'warning'); }
    }
    cargarMetas();
}

(function _initMetasListeners() {
    document.getElementById('metasVerHistorial')?.addEventListener('sl-change', () => cargarMetas());
})();

// ============================================
// MÓDULO ANÁLISIS AVANZADO — KPIs + 5 gráficos modernos
// ============================================
function _gradV(canvas, c1, c2) {
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 220);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
}
function _gradH(canvas, c1, c2) {
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, canvas.clientWidth || 300, 0);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    return g;
}
const _ANIM_CHART = { duration: 800, easing: 'easeOutQuart' };
const _fmtAbrev = v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v;

function _renderAnalisisAvanzado(pedidos) {
    try {
        pedidos = pedidos || [];
        const hoy = new Date();
        // El período de esta sección lo controla el selector global (_periodoActivo).
        const pedidosMes = _pedidosDelPeriodo(pedidos);

        // ---- KPIs ----
        const ventasMes = pedidosMes.reduce((s, p) => s + (p.total || 0), 0);
        const ticket = pedidosMes.length ? ventasMes / pedidosMes.length : 0;
        const contadoMes = pedidosMes.filter(p => (p.tipoPago || 'contado') === 'contado').reduce((s, p) => s + (p.total || 0), 0);
        const contadoPct = ventasMes > 0 ? Math.round(contadoMes / ventasMes * 100) : 0;
        const clientesActivos = new Set(pedidosMes.map(p => p.cliente && p.cliente.id).filter(Boolean)).size;
        _animarValor('kpiTicketProm', Math.round(ticket), v => formatearGuaranies(v));
        _animarValor('kpiContadoPct', contadoPct, v => Math.round(v) + '%');
        _animarValor('kpiClientesActivos', clientesActivos);

        // ---- 1) Mix contado vs crédito (últimos 14 días, stacked) ----
        const cMix = document.getElementById('chartMixPago');
        if (cMix) {
            const dias = [], labels = [], contadoArr = [], creditoArr = [];
            for (let i = 13; i >= 0; i--) {
                const d = new Date(hoy); d.setDate(d.getDate() - i);
                dias.push(d.toISOString().slice(0, 10));
                labels.push(d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' }));
            }
            dias.forEach(k => {
                const delDia = pedidos.filter(p => (p.fecha || '').slice(0, 10) === k && p.estado !== 'anulado');
                contadoArr.push(delDia.filter(p => (p.tipoPago || 'contado') === 'contado').reduce((s, p) => s + (p.total || 0), 0));
                creditoArr.push(delDia.filter(p => p.tipoPago === 'credito').reduce((s, p) => s + (p.total || 0), 0));
            });
            if (_chartMix) _chartMix.destroy();
            _chartMix = new Chart(cMix, {
                type: 'bar',
                data: { labels, datasets: [
                    { label: 'Contado', data: contadoArr, backgroundColor: _gradV(cMix, '#34d399', '#0f9b6c'), borderRadius: 6, stack: 's' },
                    { label: 'Crédito', data: creditoArr, backgroundColor: _gradV(cMix, '#a78bfa', '#6d4fd1'), borderRadius: 6, stack: 's' }
                ] },
                options: { responsive: true, maintainAspectRatio: false, animation: _ANIM_CHART,
                    plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
                        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatearGuaranies(ctx.parsed.y)}` } } },
                    scales: { x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, color: '#9ca3af', autoSkip: true, maxTicksLimit: 8 } },
                        y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9ca3af', callback: _fmtAbrev } } } }
            });
        }

        // ---- 2) Embudo del ciclo de vida (etapas acumulativas + % conversión) ----
        const cEmb = document.getElementById('chartEmbudo');
        if (cEmb) {
            const ENTREGADO_PLUS = ['entregado', 'cobrado_sin_factura', 'facturado_mock', 'nota_credito_mock'];
            const COBRADO_PLUS = ['cobrado_sin_factura', 'facturado_mock', 'nota_credito_mock'];
            const enEstado = (arr) => pedidosMes.filter(p => arr.includes(p.estado)).length;
            const etapas = [
                { label: 'Creados', n: pedidosMes.length, c1: '#818cf8', c2: '#6366f1' },
                { label: 'Entregados', n: enEstado(ENTREGADO_PLUS), c1: '#60a5fa', c2: '#2563eb' },
                { label: 'Cobrados', n: enEstado(COBRADO_PLUS), c1: '#34d399', c2: '#059669' },
                { label: 'Facturados', n: enEstado(['facturado_mock']), c1: '#a78bfa', c2: '#7c3aed' }
            ];
            if (_chartEmbudo) _chartEmbudo.destroy();
            if (!pedidosMes.length) { _chartEmbudo = null; _estadoVacioGrafico('chartEmbudo', true, 'Sin pedidos en este período'); }
            else {
                _estadoVacioGrafico('chartEmbudo', false);
                _chartEmbudo = new Chart(cEmb, {
                    type: 'bar',
                    data: { labels: etapas.map(e => e.label), datasets: [{ data: etapas.map(e => e.n), backgroundColor: etapas.map(e => _gradH(cEmb, e.c1, e.c2)), borderRadius: 7, barThickness: 22 }] },
                    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: _ANIM_CHART,
                        onHover: _chartHoverPointer,
                        onClick: (evt, els) => { if (!els.length) return; const map = ['', 'entregado', 'cobrado_sin_factura', 'facturado_mock']; _dashDrillVentas({ estado: map[els[0].index] || '' }); },
                        plugins: { legend: { display: false }, tooltip: { callbacks: {
                            label: ctx => ` ${ctx.parsed.x} pedidos`,
                            afterLabel: ctx => { const i = ctx.dataIndex; if (i === 0) return ''; const prev = etapas[i - 1].n; const pct = prev > 0 ? Math.round(etapas[i].n / prev * 100) : 0; return `${pct}% del paso anterior · (click: ver en Ventas)`; }
                        } } },
                        scales: { x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { precision: 0, color: '#9ca3af' } }, y: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#d1d5db' } } } }
                });
            }
        }

        // ---- 3) Ventas por hora (últimos 30 días) ----
        const cHora = document.getElementById('chartVentasHora');
        if (cHora) {
            const hace30 = new Date(hoy); hace30.setDate(hace30.getDate() - 30);
            const horas = new Array(24).fill(0);
            pedidos.filter(p => p.fecha && new Date(p.fecha) >= hace30 && p.estado !== 'anulado').forEach(p => {
                const h = new Date(p.fecha).getHours();
                if (h >= 0 && h < 24) horas[h] += p.total || 0;
            });
            if (_chartHora) _chartHora.destroy();
            _chartHora = new Chart(cHora, {
                type: 'bar',
                data: { labels: horas.map((_, h) => `${h}h`), datasets: [{ data: horas, backgroundColor: _gradV(cHora, '#818cf8', '#4338ca'), borderRadius: 5 }] },
                options: { responsive: true, maintainAspectRatio: false, animation: _ANIM_CHART,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { title: items => `${items[0].label}`, label: ctx => ` ${formatearGuaranies(ctx.parsed.y)}` } } },
                    scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#9ca3af', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9ca3af', callback: _fmtAbrev } } } }
            });
        }

        // ---- 4) Cumplimiento de metas por vendedor ----
        const cMet = document.getElementById('chartMetasVendedor');
        if (cMet) {
            const ventasVend = {};
            pedidosMes.forEach(p => { if (p.vendedor_id) ventasVend[p.vendedor_id] = (ventasVend[p.vendedor_id] || 0) + (p.total || 0); });
            let ids = Object.keys(ventasVend);
            if (!ids.length && typeof _metaMap !== 'undefined') ids = Object.keys(_metaMap);
            const labels = ids.map(id => (typeof _perfilesMap !== 'undefined' && _perfilesMap[id]) ? _perfilesMap[id].split(' ')[0] : 'Vend.');
            const ventasArr = ids.map(id => ventasVend[id] || 0);
            const metasArr = ids.map(id => (typeof _metaMap !== 'undefined' && _metaMap[id]) || 0);
            if (_chartMetas) _chartMetas.destroy();
            _chartMetas = new Chart(cMet, {
                type: 'bar',
                data: { labels, datasets: [
                    { label: 'Ventas', data: ventasArr, backgroundColor: _gradV(cMet, '#34d399', '#0f9b6c'), borderRadius: 6 },
                    { label: 'Meta', data: metasArr, backgroundColor: 'rgba(255,255,255,0.10)', borderColor: '#9ca3af', borderWidth: 1, borderRadius: 6 }
                ] },
                options: { responsive: true, maintainAspectRatio: false, animation: _ANIM_CHART,
                    plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
                        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatearGuaranies(ctx.parsed.y)}` } } },
                    scales: { x: { grid: { display: false }, ticks: { color: '#d1d5db', font: { size: 11 } } },
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9ca3af', callback: _fmtAbrev } } } }
            });
        }

        // ---- 5) Margen por categoría ----
        const cMar = document.getElementById('chartMargenCategoria');
        if (cMar && typeof productosData !== 'undefined' && productosData && productosData.productos) {
            const costoMap = {}, catDe = {}, catNombre = {};
            (productosData.categorias || []).forEach(c => { catNombre[c.id] = c.nombre; });
            productosData.productos.forEach(prod => {
                catDe[prod.id] = catNombre[prod.categoria] || prod.categoria || 'Sin categoría';
                (prod.presentaciones || []).forEach(pr => { costoMap[`${prod.id}|${pr.tamano}`] = pr.costo || 0; });
            });
            const margenCat = {};
            pedidosMes.forEach(p => {
                (p.items || []).forEach(it => {
                    const cat = catDe[it.productoId] || 'Sin categoría';
                    const costo = (costoMap[`${it.productoId}|${it.presentacion}`] || 0) * (it.cantidad || 0);
                    margenCat[cat] = (margenCat[cat] || 0) + ((it.subtotal || 0) - costo);
                });
            });
            const entries = Object.entries(margenCat).sort((a, b) => b[1] - a[1]).slice(0, 10);
            if (_chartMargen) _chartMargen.destroy();
            if (!entries.length) { _chartMargen = null; _estadoVacioGrafico('chartMargenCategoria', true, 'Sin datos de margen en este período'); }
            else {
                _estadoVacioGrafico('chartMargenCategoria', false);
                _chartMargen = new Chart(cMar, {
                    type: 'bar',
                    data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: _gradH(cMar, '#818cf8', '#6d4fd1'), borderRadius: 6 }] },
                    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: _ANIM_CHART,
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${formatearGuaranies(ctx.parsed.x)}` } } },
                        scales: { x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9ca3af', callback: _fmtAbrev } }, y: { grid: { display: false }, ticks: { color: '#d1d5db', font: { size: 11 } } } } }
                });
            }
        }
    } catch (e) {
        console.warn('[Dashboard] Análisis avanzado:', e);
    }
}

// ============================================
// RADAR — Comparativa de vendedores (normalizado 0-100 vs el mejor)
// ============================================
function _renderRadarVendedores(pedidos) {
    const canvas = document.getElementById('chartRadarVendedores');
    if (!canvas) return;
    try {
        pedidos = pedidos || [];
        const pmes = _pedidosDelPeriodo(pedidos);

        const agg = {};
        pmes.forEach(p => {
            const id = p.vendedor_id; if (!id) return;
            if (!agg[id]) agg[id] = { ventas: 0, pedidos: 0, clientes: new Set() };
            agg[id].ventas += p.total || 0;
            agg[id].pedidos++;
            if (p.cliente && p.cliente.id) agg[id].clientes.add(p.cliente.id);
        });
        let ids = Object.keys(agg);
        if (!ids.length) { if (_chartRadar) { _chartRadar.destroy(); _chartRadar = null; } _estadoVacioGrafico('chartRadarVendedores', true, 'Sin ventas de vendedores en este período'); return; }
        _estadoVacioGrafico('chartRadarVendedores', false);
        ids.sort((a, b) => agg[b].ventas - agg[a].ventas);
        ids = ids.slice(0, 6); // top 6 por ventas para legibilidad

        const raws = {};
        ids.forEach(id => {
            const a = agg[id];
            const ticket = a.pedidos ? a.ventas / a.pedidos : 0;
            const meta = (typeof _metaMap !== 'undefined' && _metaMap[id]) || 0;
            const pctMeta = meta > 0 ? Math.min(100, a.ventas / meta * 100) : 0;
            raws[id] = { ventas: a.ventas, pedidos: a.pedidos, clientes: a.clientes.size, ticket, pctMeta };
        });
        const axes = ['ventas', 'pedidos', 'clientes', 'ticket', 'pctMeta'];
        const axisLabel = { ventas: 'Ventas', pedidos: 'Pedidos', clientes: 'Clientes', ticket: 'Ticket prom.', pctMeta: '% Meta' };
        const max = {};
        axes.forEach(ax => { max[ax] = Math.max(1, ...ids.map(id => raws[id][ax])); });

        const datasets = ids.map(id => {
            const col = _vendorColor(id);
            const fill = col.replace('hsl', 'hsla').replace(')', ',0.15)');
            return {
                label: (typeof _perfilesMap !== 'undefined' && _perfilesMap[id]) ? _perfilesMap[id].split(' ')[0] : 'Vend.',
                data: axes.map(ax => Math.round(raws[id][ax] / max[ax] * 100)),
                _raw: axes.map(ax => raws[id][ax]),
                borderColor: col, backgroundColor: fill, pointBackgroundColor: col,
                borderWidth: 2, pointRadius: 3, pointHoverRadius: 5
            };
        });

        if (_chartRadar) _chartRadar.destroy();
        _chartRadar = new Chart(canvas, {
            type: 'radar',
            data: { labels: axes.map(a => axisLabel[a]), datasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: _ANIM_CHART,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
                    tooltip: { callbacks: { label: ctx => {
                        const ax = axes[ctx.dataIndex];
                        const raw = ctx.dataset._raw[ctx.dataIndex];
                        const val = (ax === 'ventas' || ax === 'ticket') ? formatearGuaranies(raw)
                            : (ax === 'pctMeta' ? Math.round(raw) + '%' : Math.round(raw));
                        return ` ${ctx.dataset.label}: ${val}`;
                    } } }
                },
                scales: { r: {
                    beginAtZero: true, max: 100,
                    ticks: { display: false, stepSize: 25 },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    angleLines: { color: 'rgba(255,255,255,0.08)' },
                    pointLabels: { color: '#d1d5db', font: { size: 11 } }
                } }
            }
        });
    } catch (e) { console.warn('[Dashboard] Radar vendedores:', e); }
}

// ============================================
// GRÁFICOS VISUALES — dona mix, dona categoría, polar zona, gauge meta, treemap
// ============================================
const _PALETA = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#a78bfa', '#fb923c', '#4ade80', '#60a5fa', '#f87171'];

function _pedidosDelMes(pedidos) {
    const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
    return (pedidos || []).filter(p => p.fecha && new Date(p.fecha) >= ini && p.estado !== 'anulado');
}

// 1) Dona — Mix de cobro (contado vs crédito) del mes
function _renderMixDona(pedidos) {
    const c = document.getElementById('chartMixDona');
    if (!c) return;
    try {
        const pm = _pedidosDelPeriodo(pedidos);
        const contado = pm.filter(p => (p.tipoPago || 'contado') === 'contado').reduce((s, p) => s + (p.total || 0), 0);
        const credito = pm.filter(p => p.tipoPago === 'credito').reduce((s, p) => s + (p.total || 0), 0);
        if (contado + credito === 0) { if (_chartMixDona) { _chartMixDona.destroy(); _chartMixDona = null; } _estadoVacioGrafico('chartMixDona', true, 'Sin ventas en este período'); return; }
        _estadoVacioGrafico('chartMixDona', false);
        if (_chartMixDona) _chartMixDona.destroy();
        _chartMixDona = new Chart(c, {
            type: 'doughnut',
            data: { labels: ['Contado', 'Crédito'], datasets: [{ data: [contado, credito], backgroundColor: ['#34d399', '#a78bfa'], borderWidth: 0, hoverOffset: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '68%', animation: _ANIM_CHART,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, color: '#9ca3af' } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatearGuaranies(ctx.parsed)}` } } } }
        });
    } catch (e) { console.warn('[Dashboard] Mix dona:', e); }
}

// 2) Dona — Ventas por categoría del mes
function _renderCategoria(pedidos) {
    const c = document.getElementById('chartCategoria');
    if (!c) return;
    try {
        const catDe = {}, catNombre = {};
        if (typeof productosData !== 'undefined' && productosData) {
            (productosData.categorias || []).forEach(x => { catNombre[x.id] = x.nombre; });
            (productosData.productos || []).forEach(p => { catDe[p.id] = catNombre[p.categoria] || p.categoria || 'Sin categoría'; });
        }
        const acc = {};
        _pedidosDelPeriodo(pedidos).forEach(p => (p.items || []).forEach(it => {
            const cat = catDe[it.productoId] || 'Sin categoría';
            acc[cat] = (acc[cat] || 0) + (it.subtotal || 0);
        }));
        let entries = Object.entries(acc).sort((a, b) => b[1] - a[1]);
        if (!entries.length) { if (_chartCategoria) { _chartCategoria.destroy(); _chartCategoria = null; } _estadoVacioGrafico('chartCategoria', true, 'Sin ventas en este período'); return; }
        _estadoVacioGrafico('chartCategoria', false);
        if (entries.length > 8) {
            const otras = entries.slice(8).reduce((s, e) => s + e[1], 0);
            entries = entries.slice(0, 8); entries.push(['Otras', otras]);
        }
        if (_chartCategoria) _chartCategoria.destroy();
        _chartCategoria = new Chart(c, {
            type: 'doughnut',
            data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: _PALETA, borderWidth: 0, hoverOffset: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '62%', animation: _ANIM_CHART,
                plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 }, padding: 8, color: '#9ca3af' } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatearGuaranies(ctx.parsed)}` } } } }
        });
    } catch (e) { console.warn('[Dashboard] Categoría:', e); }
}

// 3) Polar Area — Ventas por zona del mes
function _renderZona(pedidos) {
    const c = document.getElementById('chartZona');
    if (!c) return;
    try {
        const zonaDe = {};
        if (typeof productosData !== 'undefined' && productosData) {
            (productosData.clientes || []).forEach(cl => { zonaDe[cl.id] = cl.zona || 'Sin zona'; });
        }
        const acc = {};
        _pedidosDelPeriodo(pedidos).forEach(p => {
            const z = (p.cliente && zonaDe[p.cliente.id]) || 'Sin zona';
            acc[z] = (acc[z] || 0) + (p.total || 0);
        });
        const entries = Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 8);
        if (!entries.length) { if (_chartZona) { _chartZona.destroy(); _chartZona = null; } _estadoVacioGrafico('chartZona', true, 'Sin ventas en este período'); return; }
        _estadoVacioGrafico('chartZona', false);
        if (_chartZona) _chartZona.destroy();
        _chartZona = new Chart(c, {
            type: 'polarArea',
            data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1]), backgroundColor: _PALETA.map(col => col + 'cc'), borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, animation: _ANIM_CHART,
                plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 }, padding: 8, color: '#9ca3af' } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatearGuaranies(ctx.parsed.r)}` } } },
                scales: { r: { grid: { color: 'rgba(255,255,255,0.08)' }, angleLines: { color: 'rgba(255,255,255,0.08)' }, ticks: { display: false, backdropColor: 'transparent' } } } }
        });
    } catch (e) { console.warn('[Dashboard] Zona:', e); }
}

// 4) Gauge — Cumplimiento de meta global del mes
function _renderGaugeMeta(pedidos) {
    const c = document.getElementById('chartGaugeMeta');
    if (!c) return;
    try {
        const ventasMes = _pedidosDelMes(pedidos).reduce((s, p) => s + (p.total || 0), 0);
        const sumMetas = (typeof _metaMap !== 'undefined') ? Object.values(_metaMap).reduce((s, m) => s + (m || 0), 0) : 0;
        const pct = sumMetas > 0 ? Math.round(ventasMes / sumMetas * 100) : 0;
        const capped = Math.min(100, pct);
        const color = pct >= 100 ? '#34d399' : pct >= 70 ? '#fbbf24' : '#f87171';
        if (_chartGaugeMeta) _chartGaugeMeta.destroy();
        _chartGaugeMeta = new Chart(c, {
            type: 'doughnut',
            data: { datasets: [{ data: [capped, 100 - capped], backgroundColor: [color, 'rgba(255,255,255,0.08)'], borderWidth: 0, circumference: 180, rotation: 270 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '76%', animation: _ANIM_CHART,
                plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
        const pctEl = document.getElementById('gaugeMetaPct');
        if (pctEl) { pctEl.textContent = (sumMetas > 0 ? pct : 0) + '%'; pctEl.style.color = color; }
        const subEl = document.getElementById('gaugeMetaSub');
        if (subEl) subEl.textContent = sumMetas > 0 ? `${formatearGuaranies(ventasMes)} / ${formatearGuaranies(sumMetas)}` : 'Sin metas cargadas';

        // Proyección a fin de mes según el ritmo actual (ventas/día × días del mes)
        const proyEl = document.getElementById('gaugeMetaProy');
        if (proyEl) {
            if (sumMetas > 0) {
                const now = new Date();
                const diaActual = now.getDate();
                const diasMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                const proy = diaActual > 0 ? Math.round(ventasMes / diaActual * diasMes) : ventasMes;
                const pctProy = Math.round(proy / sumMetas * 100);
                const cProy = pctProy >= 100 ? '#34d399' : pctProy >= 80 ? '#fbbf24' : '#f87171';
                proyEl.innerHTML = `Proyección fin de mes: <span style="color:${cProy};font-weight:600">${formatearGuaranies(proy)} · ${pctProy}%</span>`;
            } else {
                proyEl.textContent = '';
            }
        }
    } catch (e) { console.warn('[Dashboard] Gauge meta:', e); }
}

// 5) Treemap — Facturación por categoría del mes (requiere plugin chartjs-chart-treemap)
function _renderTreemap(pedidos) {
    const c = document.getElementById('chartTreemap');
    if (!c) return;
    let hasTreemap = false;
    try { hasTreemap = !!Chart.registry.getController('treemap'); } catch (_) { hasTreemap = false; }
    if (!hasTreemap) return;
    try {
        const catDe = {}, catNombre = {};
        if (typeof productosData !== 'undefined' && productosData) {
            (productosData.categorias || []).forEach(x => { catNombre[x.id] = x.nombre; });
            (productosData.productos || []).forEach(p => { catDe[p.id] = catNombre[p.categoria] || p.categoria || 'Sin categoría'; });
        }
        const acc = {};
        _pedidosDelPeriodo(pedidos).forEach(p => (p.items || []).forEach(it => {
            const cat = catDe[it.productoId] || 'Sin categoría';
            acc[cat] = (acc[cat] || 0) + (it.subtotal || 0);
        }));
        const entries = Object.entries(acc).sort((a, b) => b[1] - a[1]);
        if (_chartTreemap) _chartTreemap.destroy();
        if (!entries.length) { _chartTreemap = null; _estadoVacioGrafico('chartTreemap', true, 'Sin ventas en este período'); return; }
        _estadoVacioGrafico('chartTreemap', false);
        _chartTreemap = new Chart(c, {
            type: 'treemap',
            data: { datasets: [{
                tree: entries.map(([cat, v]) => ({ cat, v })),
                key: 'v', groups: ['cat'], spacing: 1.5, borderWidth: 0, borderRadius: 4,
                backgroundColor: (ctx) => ctx.type === 'data' ? _PALETA[ctx.dataIndex % _PALETA.length] : 'transparent',
                labels: { display: true, color: '#0b0b0d', font: { size: 11, weight: '600' },
                    formatter: (ctx) => { const n = ctx.raw; return n && n._data ? n._data.cat : ''; } }
            }] },
            options: { responsive: true, maintainAspectRatio: false, animation: _ANIM_CHART,
                plugins: { legend: { display: false },
                    tooltip: { callbacks: { title: () => '', label: (ctx) => { const n = ctx.raw; const cat = n && n._data ? n._data.cat : ''; return ` ${cat}: ${formatearGuaranies(n ? n.v : 0)}`; } } } } }
        });
    } catch (e) { console.warn('[Dashboard] Treemap:', e); }
}

// 6) Heatmap semana × hora (CSS grid, sin plugin) — intensidad = ventas
function _renderHeatmap(pedidos) {
    const cont = document.getElementById('dashHeatmap');
    if (!cont) return;
    try {
        const H0 = 8, H1 = 19;                 // 8:00 → 19:00 = 12 columnas
        const nCols = H1 - H0 + 1;
        const dLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const matriz = Array.from({ length: 7 }, () => new Array(nCols).fill(0));
        let max = 0;
        _pedidosDelPeriodo(pedidos).forEach(p => {
            const f = new Date(p.fecha);
            const d = f.getDay();
            let h = f.getHours();
            if (h < H0) h = H0; if (h > H1) h = H1;
            const col = h - H0;
            matriz[d][col] += p.total || 0;
            if (matriz[d][col] > max) max = matriz[d][col];
        });
        if (max === 0) {
            cont.removeAttribute('style'); cont.className = '';
            cont.innerHTML = '<p class="chart-empty text-xs" style="padding:2rem 0;text-align:center">Sin ventas en este período</p>';
            return;
        }
        cont.className = 'heatmap-grid';
        cont.style.gridTemplateColumns = `auto repeat(${nCols}, 1fr)`;
        let html = '<div></div>';              // esquina superior izquierda
        for (let c = 0; c < nCols; c++) html += `<div class="heatmap-collabel">${H0 + c}</div>`;
        for (let d = 0; d < 7; d++) {
            html += `<div class="heatmap-rowlabel">${dLabels[d]}</div>`;
            for (let c = 0; c < nCols; c++) {
                const v = matriz[d][c];
                const bg = v > 0 ? `background:rgba(99,102,241,${(0.12 + 0.88 * (v / max)).toFixed(3)})` : '';
                const title = `${dLabels[d]} ${H0 + c}:00 — ${formatearGuaranies(v)}`;
                html += `<div class="heatmap-cell" style="${bg}" title="${escapeHTML(title)}"></div>`;
            }
        }
        cont.innerHTML = html;
    } catch (e) { console.warn('[Dashboard] Heatmap:', e); }
}

// 7) Waterfall / cascada financiera — alterna Flujo de caja ⇄ Rentabilidad
async function _renderWaterfall(pedidos) {
    const c = document.getElementById('chartWaterfall');
    if (!c) return;
    try {
        const pm = _pedidosDelPeriodo(pedidos);
        const V = pm.reduce((s, p) => s + (p.total || 0), 0);
        const subEl = document.getElementById('waterfallSub');
        if (V === 0) { if (_chartWaterfall) { _chartWaterfall.destroy(); _chartWaterfall = null; } _estadoVacioGrafico('chartWaterfall', true, 'Sin ventas en este período'); return; }
        _estadoVacioGrafico('chartWaterfall', false);

        let labels, data, colors, mags;
        if (_waterfallModo === 'rentabilidad') {
            const g = (typeof calcularGananciaPedidos === 'function') ? calcularGananciaPedidos(pm) : { costoTotal: 0, gananciaTotal: V };
            const costo = g.costoTotal || 0;
            const bruta = V - costo;
            const gastos = await _obtenerGastosPeriodo();
            const conGastos = gastos > 0;
            const neta = bruta - gastos;
            const final = conGastos ? neta : bruta;
            labels = ['Ventas', 'Costo', ...(conGastos ? ['Gastos'] : []), conGastos ? 'Ganancia neta' : 'Ganancia bruta'];
            data = [[0, V], [bruta, V], ...(conGastos ? [[neta, bruta]] : []), [0, Math.max(0, final)]];
            mags = [V, costo, ...(conGastos ? [gastos] : []), final];
            colors = ['#60a5fa', '#f87171', ...(conGastos ? ['#f87171'] : []), final >= 0 ? '#34d399' : '#f87171'];
            if (subEl) subEl.textContent = conGastos ? 'Ventas − costo − gastos = ganancia neta' : 'Ventas − costo = ganancia bruta (sin gastos cargados)';
        } else {
            const pagos = (await HDVStorage.getItem('hdv_pagos_credito', { clone: false })) || [];
            const saldoDe = (p) => { const pagado = pagos.filter(pg => pg.pedidoId === p.id).reduce((s, pg) => s + (Number(pg.monto) || 0), 0); return Math.max(0, (p.total || 0) - pagado); };
            const porCobrar = pm.reduce((s, p) => s + saldoDe(p), 0);
            const cobrado = Math.max(0, V - porCobrar);
            labels = ['Ventas', 'Por cobrar', 'Cobrado'];
            data = [[0, V], [cobrado, V], [0, cobrado]];
            mags = [V, porCobrar, cobrado];
            colors = ['#60a5fa', '#f59e0b', '#34d399'];
            if (subEl) subEl.textContent = 'De las ventas al efectivo cobrado';
        }

        if (_chartWaterfall) _chartWaterfall.destroy();
        _chartWaterfall = new Chart(c, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.8 }] },
            options: {
                responsive: true, maintainAspectRatio: false, animation: _ANIM_CHART,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${formatearGuaranies(mags[ctx.dataIndex])}` } } },
                scales: { x: { grid: { display: false }, ticks: { color: '#d1d5db', font: { size: 11 } } },
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9ca3af', callback: _fmtAbrev } } }
            }
        });
    } catch (e) { console.warn('[Dashboard] Waterfall:', e); }
}

// ============================================
// PERSONALIZACIÓN — reordenar (drag), ocultar y densidad (persistido)
// Acotado al grid de visuales #dashVisualesGrid (contenedor único de tarjetas).
// ============================================
let _personalizacionWired = false;
let _layoutAplicado = false;
let _ordenOriginal = [];
const _LAYOUT_KEY = 'hdv_dashboard_layout';

function _dashCardKey(card) {
    const el = card.querySelector('canvas[id], [id^="dashHeatmap"]');
    if (el && el.id) return el.id.replace(/^chart/, '').toLowerCase();
    const h = card.querySelector('h3');
    return h ? 'c-' + h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) : 'card-' + Math.random().toString(36).slice(2, 7);
}
function _ordenActualCards() {
    const grid = document.getElementById('dashVisualesGrid');
    return grid ? Array.from(grid.children).map(c => c.getAttribute('data-card')).filter(Boolean) : [];
}
function _cardsOcultas() {
    const grid = document.getElementById('dashVisualesGrid');
    return grid ? Array.from(grid.children).filter(c => c.classList.contains('card-hidden')).map(c => c.getAttribute('data-card')).filter(Boolean) : [];
}
async function _guardarLayout(patch) {
    try {
        const prev = (await HDVStorage.getItem(_LAYOUT_KEY)) || {};
        await HDVStorage.setItem(_LAYOUT_KEY, Object.assign({ orden: [], ocultas: [], densidad: false }, prev, patch));
    } catch (e) { console.warn('[Dashboard] Guardar layout:', e); }
}

// Aplica el layout guardado (orden, ocultas, densidad). Corre una sola vez por carga.
async function _aplicarLayout() {
    if (_layoutAplicado) return;
    const grid = document.getElementById('dashVisualesGrid');
    if (!grid) return;
    _layoutAplicado = true;
    Array.from(grid.children).forEach(card => { if (!card.getAttribute('data-card')) card.setAttribute('data-card', _dashCardKey(card)); });
    if (!_ordenOriginal.length) _ordenOriginal = _ordenActualCards();
    let layout = null;
    try { layout = await HDVStorage.getItem(_LAYOUT_KEY); } catch (_) {}
    if (!layout) return;
    if (Array.isArray(layout.orden) && layout.orden.length) {
        const byKey = {};
        Array.from(grid.children).forEach(c => { byKey[c.getAttribute('data-card')] = c; });
        layout.orden.forEach(k => { if (byKey[k]) grid.appendChild(byKey[k]); });
    }
    Array.from(grid.children).forEach(c => c.classList.toggle('card-hidden', Array.isArray(layout.ocultas) && layout.ocultas.includes(c.getAttribute('data-card'))));
    const sec = document.getElementById('seccion-dashboard');
    if (sec) sec.classList.toggle('dashboard-compact', !!layout.densidad);
    const btnDens = document.getElementById('btnDensidadDash');
    if (btnDens) btnDens.classList.toggle('is-active', !!layout.densidad);
}

function _initPersonalizacion() {
    if (_personalizacionWired) return;
    const grid = document.getElementById('dashVisualesGrid');
    const btnPers = document.getElementById('btnPersonalizarDash');
    if (!grid || !btnPers) return;
    _personalizacionWired = true;
    const sec = document.getElementById('seccion-dashboard');
    const editBar = document.getElementById('dashEditBar');

    // Inyectar handle + botón ocultar en cada tarjeta (una sola vez)
    Array.from(grid.children).forEach(card => {
        if (!card.getAttribute('data-card')) card.setAttribute('data-card', _dashCardKey(card));
        if (!card.style.position) card.style.position = 'relative';
        if (!card.querySelector('.card-drag-handle')) {
            const h = document.createElement('span');
            h.className = 'card-drag-handle';
            h.innerHTML = '<i data-lucide="grip-vertical" class="w-4 h-4"></i>';
            card.appendChild(h);
        }
        if (!card.querySelector('.card-hide-btn')) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'card-hide-btn';
            b.innerHTML = '<i data-lucide="x" class="w-4 h-4"></i>';
            b.addEventListener('click', async (e) => {
                e.stopPropagation();
                card.classList.add('card-hidden');
                await _guardarLayout({ ocultas: _cardsOcultas() });
            });
            card.appendChild(b);
        }
    });
    if (!_ordenOriginal.length) _ordenOriginal = _ordenActualCards();
    if (window.lucide) { try { lucide.createIcons(); } catch (_) {} }

    const setEdit = (on) => {
        if (sec) sec.classList.toggle('is-editando', on);
        if (editBar) { editBar.classList.toggle('hidden', !on); editBar.classList.toggle('flex', on); }
        btnPers.classList.toggle('is-active', on);
        Array.from(grid.children).forEach(c => { c.draggable = on; });
    };
    btnPers.addEventListener('click', () => setEdit(!(sec && sec.classList.contains('is-editando'))));
    const btnListo = document.getElementById('btnListoDash');
    if (btnListo) btnListo.addEventListener('click', () => setEdit(false));

    const btnDens = document.getElementById('btnDensidadDash');
    if (btnDens) btnDens.addEventListener('click', async () => {
        const on = sec.classList.toggle('dashboard-compact');
        btnDens.classList.toggle('is-active', on);
        await _guardarLayout({ densidad: on });
    });

    const btnReset = document.getElementById('btnRestablecerDash');
    if (btnReset) btnReset.addEventListener('click', async () => {
        Array.from(grid.children).forEach(c => c.classList.remove('card-hidden'));
        if (_ordenOriginal.length) {
            const byKey = {};
            Array.from(grid.children).forEach(c => { byKey[c.getAttribute('data-card')] = c; });
            _ordenOriginal.forEach(k => { if (byKey[k]) grid.appendChild(byKey[k]); });
        }
        if (sec) sec.classList.remove('dashboard-compact');
        if (btnDens) btnDens.classList.remove('is-active');
        try { await HDVStorage.removeItem(_LAYOUT_KEY); } catch (_) {}
        if (typeof mostrarToast === 'function') mostrarToast('Dashboard restablecido', 'success');
    });

    // Drag & drop reorder (nativo, CSP-safe)
    let dragEl = null;
    grid.addEventListener('dragstart', (e) => {
        const card = e.target.closest('[data-card]');
        if (!card || !card.draggable) return;
        dragEl = card; card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', card.getAttribute('data-card') || ''); } catch (_) {}
    });
    grid.addEventListener('dragend', () => {
        if (dragEl) dragEl.classList.remove('dragging');
        dragEl = null;
        grid.querySelectorAll('.drop-target').forEach(c => c.classList.remove('drop-target'));
    });
    grid.addEventListener('dragover', (e) => {
        if (!dragEl) return;
        e.preventDefault();
        const over = e.target.closest('[data-card]');
        grid.querySelectorAll('.drop-target').forEach(c => { if (c !== over) c.classList.remove('drop-target'); });
        if (over && over !== dragEl) over.classList.add('drop-target');
    });
    grid.addEventListener('drop', async (e) => {
        if (!dragEl) return;
        e.preventDefault();
        const over = e.target.closest('[data-card]');
        if (over && over !== dragEl) {
            const rect = over.getBoundingClientRect();
            const after = (e.clientY - rect.top) > rect.height / 2;
            grid.insertBefore(dragEl, after ? over.nextSibling : over);
        }
        grid.querySelectorAll('.drop-target').forEach(c => c.classList.remove('drop-target'));
        await _guardarLayout({ orden: _ordenActualCards() });
    });
}

// Toggle del waterfall (Flujo de caja ⇄ Rentabilidad). Se cablea una sola vez.
function _initWaterfallToggle() {
    if (_waterfallToggleWired) return;
    const cont = document.getElementById('dashWaterfallToggle');
    if (!cont) return;
    _waterfallToggleWired = true;
    cont.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-wf]');
        if (!btn) return;
        const modo = btn.getAttribute('data-wf');
        if (!modo || modo === _waterfallModo) return;
        _waterfallModo = modo;
        cont.querySelectorAll('.dash-seg-btn').forEach(b => b.classList.toggle('is-active', b === btn));
        _renderWaterfall(typeof todosLosPedidos !== 'undefined' ? todosLosPedidos : []);
    });
}
