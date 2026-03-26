// ============================================
// HDV Admin - Modulo Dashboard
// Charts, KPIs, resumen mensual, metas, comisiones
// Depende de globals: todosLosPedidos, productosData
// Depende de: calcularGananciaPedidos (pedidos.js), Chart.js
// ============================================

let chartVentas7d = null;
let chartTopProd = null;

// ============================================
// DASHBOARD
// ============================================
function cargarDashboard() {
    const pedidos = todosLosPedidos;
    const hoy = new Date();

    // Stats del mes
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
    if (elDetalle) {
        if (gananciaMes.itemsConCosto === 0) {
            elDetalle.textContent = 'Define costos en productos para ver ganancia real';
        } else {
            elDetalle.textContent = `${gananciaMes.itemsConCosto}/${gananciaMes.itemsTotales} items con costo definido`;
        }
    }
    const elMargenDet = document.getElementById('dashMargenDetalle');
    if (elMargenDet) {
        elMargenDet.textContent = gananciaMes.costoTotal > 0
            ? `Ventas ${formatearGuaranies(ventasMes)} - Costos ${formatearGuaranies(gananciaMes.costoTotal)}`
            : 'Sin costos definidos aun';
    }
    const elCostoDet = document.getElementById('dashCostoDetalle');
    if (elCostoDet) {
        elCostoDet.textContent = gananciaMes.costoTotal > 0
            ? `${pedidosMes.length} pedidos este mes`
            : 'Agrega costos a tus productos';
    }

    // Chart: ventas ultimos 7 dias (ahora con ganancia)
    const labels7d = [];
    const datos7d = [];
    const ganancia7d = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(hoy);
        d.setDate(d.getDate() - i);
        const fechaStr = d.toISOString().split('T')[0];
        const diaNombre = d.toLocaleDateString('es-PY', { weekday: 'short' });
        labels7d.push(diaNombre);
        const pedidosDia = pedidos.filter(p => new Date(p.fecha).toISOString().split('T')[0] === fechaStr);
        const ventasDia = pedidosDia.reduce((s, p) => s + (p.total || 0), 0);
        datos7d.push(ventasDia);
        const gDia = calcularGananciaPedidos(pedidosDia);
        ganancia7d.push(gDia.gananciaTotal);
    }

    const ctx7d = document.getElementById('chartVentas7Dias');
    if (ctx7d) {
        if (chartVentas7d) chartVentas7d.destroy();
        chartVentas7d = new Chart(ctx7d, {
            type: 'bar',
            data: {
                labels: labels7d,
                datasets: [
                    {
                        label: 'Ventas (Gs.)',
                        data: datos7d,
                        backgroundColor: 'rgba(17, 24, 39, 0.8)',
                        borderRadius: 8,
                        borderSkipped: false
                    },
                    {
                        label: 'Ganancia (Gs.)',
                        data: ganancia7d,
                        backgroundColor: 'rgba(34, 197, 94, 0.7)',
                        borderRadius: 8,
                        borderSkipped: false
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: true, position: 'top' } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => 'Gs.' + (v/1000).toFixed(0) + 'k' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // Chart: top 5 productos del mes
    const prodCount = {};
    pedidosMes.forEach(p => {
        (p.items || []).forEach(i => {
            const key = i.nombre || 'N/A';
            prodCount[key] = (prodCount[key] || 0) + (i.cantidad || 1);
        });
    });
    const top5 = Object.entries(prodCount).sort((a,b) => b[1]-a[1]).slice(0, 5);
    const colores = ['#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db'];

    const ctxTop = document.getElementById('chartTopProductos');
    if (ctxTop) {
        if (chartTopProd) chartTopProd.destroy();
        chartTopProd = new Chart(ctxTop, {
            type: 'doughnut',
            data: {
                labels: top5.map(t => t[0]),
                datasets: [{
                    data: top5.map(t => t[1]),
                    backgroundColor: colores,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }
            }
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
                const medallas = ['#1','#2','#3'];
                const medal = i < 3 ? medallas[i] : `<span class="text-gray-400 text-xs">#${i+1}</span>`;
                return `<div class="flex items-center gap-3">
                    <span class="text-xl w-8 text-center">${medal}</span>
                    <div class="flex-1">
                        <div class="flex justify-between mb-1">
                            <span class="text-sm font-bold text-gray-800">${escapeHTML(nombre)}</span>
                            <span class="text-sm font-bold text-gray-600">${formatearGuaranies(data.total)} (${data.pedidos})</span>
                        </div>
                        <div class="w-full bg-gray-100 rounded-full h-2"><div class="bg-gray-800 h-2 rounded-full" style="width:${pct}%"></div></div>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // Cargar selector de meses
    cargarSelectorMeses();
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
        const opt = document.createElement('option');
        opt.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        opt.textContent = d.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });
        select.appendChild(opt);
    }
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
    const entregados = pedidosMes.filter(p => p.estado === 'entregado').length;
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

    const btn = document.getElementById('btnGuardarResumen');
    if (btn && btn.disabled) return;
    const textoOriginal = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = 'Guardando...'; }

    try {
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
            entregados: pedidosMes.filter(p => p.estado === 'entregado').length
        };

        if (typeof db !== 'undefined') {
            await db.collection('reportes_mensuales').doc(mesStr).set(resumen);
            mostrarToast(`Resumen de ${mesStr} guardado`, 'success');
        } else {
            mostrarToast('Error: cliente de base de datos no disponible', 'error');
        }
    } catch(e) {
        mostrarToast('Error guardando resumen: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
    }
}

// ============================================
// METAS Y COMISIONES
// ============================================
async function cargarMetas() {
    const metas = (await HDVStorage.getItem('hdv_metas')) || [];
    const mesActual = new Date().toISOString().slice(0, 7);
    const metaActiva = metas.find(m => m.mes === mesActual && m.activa) || metas.find(m => m.activa);

    // Calcular ventas del mes
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const pedidosMes = pedidos.filter(p => p.fecha && p.fecha.startsWith(mesActual));
    const totalVendido = pedidosMes.reduce((sum, p) => sum + (p.total || 0), 0);

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

    // Lista de metas
    const container = document.getElementById('metasContainer');
    if (metas.length === 0) {
        container.innerHTML = generarAdminEmptyState(SVG_ADMIN_EMPTY_ORDERS, 'Sin metas configuradas', 'Crea metas mensuales para los vendedores');
    } else {
        container.innerHTML = metas.map(m => {
            const pedMes = pedidos.filter(p => p.fecha && p.fecha.startsWith(m.mes));
            const vendMes = pedMes.reduce((s, p) => s + (p.total || 0), 0);
            const pct = m.monto > 0 ? Math.min(100, Math.round((vendMes / m.monto) * 100)) : 0;
            return `
            <div class="p-4 flex justify-between items-center">
                <div>
                    <p class="font-bold text-gray-800">${escapeHTML(m.vendedor)} - ${escapeHTML(m.mes)}</p>
                    <p class="text-sm text-gray-500">Meta: ${formatearGuaranies(m.monto)} | Comision: ${m.comision}%</p>
                    <div class="mt-2 w-48 bg-gray-200 rounded-full h-3">
                        <div class="h-3 rounded-full ${pct < 50 ? 'bg-red-500' : pct < 80 ? 'bg-yellow-500' : 'bg-green-500'}" style="width: ${pct}%"></div>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-sm font-bold ${pct >= 100 ? 'text-green-600' : 'text-gray-600'}">${pct}%</span>
                    <span class="text-xs px-2 py-1 rounded-full ${m.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${m.activa ? 'Activa' : 'Inactiva'}</span>
                    <button onclick="editarMeta('${m.id}')" class="text-blue-600 text-sm font-bold">Editar</button>
                    <button onclick="eliminarMeta('${m.id}')" class="text-red-600 text-sm font-bold">Eliminar</button>
                </div>
            </div>`;
        }).join('');
    }
}

async function abrirModalMeta(metaId) {
    document.getElementById('formMetaId').value = '';
    document.getElementById('formMetaVendedor').value = 'Vendedor Principal';
    document.getElementById('formMetaMonto').value = '';
    document.getElementById('formMetaComision').value = '5';
    document.getElementById('formMetaMes').value = new Date().toISOString().slice(0, 7);
    document.getElementById('formMetaActiva').value = 'true';
    if (metaId) {
        const metas = (await HDVStorage.getItem('hdv_metas')) || [];
        const m = metas.find(x => x.id === metaId);
        if (m) {
            document.getElementById('formMetaId').value = m.id;
            document.getElementById('formMetaVendedor').value = m.vendedor;
            document.getElementById('formMetaMonto').value = m.monto;
            document.getElementById('formMetaComision').value = m.comision;
            document.getElementById('formMetaMes').value = m.mes;
            document.getElementById('formMetaActiva').value = m.activa ? 'true' : 'false';
        }
    }
    document.getElementById('modalMeta').classList.add('show');
}

function cerrarModalMeta() { document.getElementById('modalMeta').classList.remove('show'); }
function editarMeta(id) { abrirModalMeta(id); }

async function guardarMeta() {
    const id = document.getElementById('formMetaId').value || 'META' + Date.now();
    const meta = {
        id,
        vendedor: document.getElementById('formMetaVendedor').value,
        monto: parseInt(document.getElementById('formMetaMonto').value) || 0,
        comision: parseFloat(document.getElementById('formMetaComision').value) || 0,
        mes: document.getElementById('formMetaMes').value,
        activa: document.getElementById('formMetaActiva').value === 'true'
    };
    if (!meta.monto) { mostrarToast('Monto de meta es obligatorio', 'error'); return; }

    const btn = document.getElementById('btnGuardarMeta');
    if (btn && btn.disabled) return;
    const textoOriginal = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = 'Guardando...'; }

    try {
        let metas = (await HDVStorage.getItem('hdv_metas')) || [];
        const idx = metas.findIndex(m => m.id === id);
        if (idx >= 0) metas[idx] = meta; else metas.push(meta);
        await HDVStorage.setItem('hdv_metas', metas);
        if (typeof guardarMetas === 'function') {
            try { await guardarMetas(metas); }
            catch (e) { console.error('[Metas] Error sincronizando:', e); mostrarToast('Meta guardada local pero fallo la sincronizacion', 'warning'); }
        }
        cerrarModalMeta();
        cargarMetas();
        mostrarToast('Meta guardada', 'success');
    } catch (err) {
        console.error('[Metas] Error:', err);
        mostrarToast('Error al guardar meta', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
    }
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
