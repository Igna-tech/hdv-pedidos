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
let _leaderboardPeriodo = 'mes';
let _perfilesMap = {};
let _metaMap = {};

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

    // Chart: top 5 productos del mes (doughnut — sin cambios)
    const prodCount = {};
    pedidosMes.forEach(p => (p.items || []).forEach(i => {
        const key = i.nombre || 'N/A';
        prodCount[key] = (prodCount[key] || 0) + (i.cantidad || 1);
    }));
    const top5 = Object.entries(prodCount).sort((a,b) => b[1]-a[1]).slice(0, 5);
    const coloresDoughnut = ['#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db'];
    const ctxTop = document.getElementById('chartTopProductos');
    if (ctxTop) {
        if (chartTopProd) chartTopProd.destroy();
        chartTopProd = new Chart(ctxTop, {
            type: 'doughnut',
            data: {
                labels: top5.map(t => t[0]),
                datasets: [{ data: top5.map(t => t[1]), backgroundColor: coloresDoughnut, borderWidth: 0 }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
        });
    }

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

    // NUEVOS MÓDULOS
    _actualizarKPIsRealtime(pedidos);
    _initChartTemporal(_chartPeriodo);
    _renderFeedActividad(pedidos);
    _renderLeaderboard(_leaderboardPeriodo);

    // Selector de meses
    cargarSelectorMeses();
}

// ============================================
// MÓDULO 1 — KPI HOY EN VIVO (real-time)
// ============================================
function _actualizarKPIsRealtime(pedidos) {
    const hoy = new Date().toISOString().split('T')[0];
    const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const estadosCobrado = new Set(['cobrado_sin_factura', 'facturado_mock']);

    const pedidosHoy = pedidos.filter(p => (p.fecha || '').slice(0, 10) === hoy);
    const pedidosAyer = pedidos.filter(p => (p.fecha || '').slice(0, 10) === ayer);

    const ventasHoy   = pedidosHoy.reduce((s, p) => s + (p.total || 0), 0);
    const ventasAyer  = pedidosAyer.reduce((s, p) => s + (p.total || 0), 0);
    const countHoy    = pedidosHoy.length;
    const countAyer   = pedidosAyer.length;
    const pendientes  = pedidos.filter(p => p.estado === 'pedido_pendiente').length;
    const cobradoHoy  = pedidosHoy.filter(p => estadosCobrado.has(p.estado)).reduce((s, p) => s + (p.total || 0), 0);
    const cobradoAyer = pedidosAyer.filter(p => estadosCobrado.has(p.estado)).reduce((s, p) => s + (p.total || 0), 0);

    _animarValor('kpiVentasHoy',  ventasHoy,  v => formatearGuaranies(v));
    _animarValor('kpiPedidosHoy', countHoy);
    _animarValor('kpiPendientes', pendientes);
    _animarValor('kpiCobradoHoy', cobradoHoy, v => formatearGuaranies(v));

    const setTrend = (id, hoyVal, ayerVal) => {
        const e = document.getElementById(id);
        if (!e) return;
        if (ayerVal === 0) { e.textContent = '— vs ayer'; e.className = 'text-xs text-gray-400 mt-1'; return; }
        const pct = Math.round((hoyVal - ayerVal) / ayerVal * 100);
        const sube = pct >= 0;
        e.textContent = `${sube ? '↑' : '↓'} ${Math.abs(pct)}% vs ayer`;
        e.className = `text-xs mt-1 font-semibold ${sube ? 'text-emerald-600' : 'text-red-500'}`;
    };
    setTrend('kpiVentasHoyTrend',   ventasHoy,   ventasAyer);
    setTrend('kpiPedidosHoyTrend',  countHoy,    countAyer);
    setTrend('kpiCobradoHoyTrend',  cobradoHoy,  cobradoAyer);

    const feedEl = document.getElementById('feedContador');
    if (feedEl) feedEl.textContent = `${pedidosHoy.length} hoy`;
}

function _animarValor(id, target, fmt) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = parseFloat(el.dataset.valor || '0');
    el.dataset.valor = target;
    if (start === target) { el.textContent = fmt ? fmt(target) : target; return; }
    const dur = 550, t0 = performance.now();
    const step = (now) => {
        const p = Math.min((now - t0) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        const val = Math.round(start + (target - start) * ease);
        el.textContent = fmt ? fmt(val) : val;
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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
                    borderColor: '#111827',
                    backgroundColor: 'rgba(17,24,39,0.06)',
                    fill: true, tension: 0.4, borderWidth: 2,
                    pointRadius: puntos, pointHoverRadius: 5,
                    pointBackgroundColor: '#111827'
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
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
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

    const sorted = Object.entries(stats).sort((a, b) => b[1].total - a[1].total);
    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 italic text-center py-4">Sin pedidos en este período</p>';
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
