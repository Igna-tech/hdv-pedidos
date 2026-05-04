// ============================================
// HDV Admin - Cierre Mensual / Contabilidad
// Requiere: admin.js, JSZip (CDN)
// ============================================

let registrosCierreMensual = [];

// ============================================
// INICIALIZAR
// ============================================

function inicializarCierreMensual() {
    const mesSelect = document.getElementById('cierreMes');
    const anioSelect = document.getElementById('cierreAnio');

    // Mes actual por defecto
    const ahora = new Date();
    mesSelect.value = ahora.getMonth() + 1;

    // Poblar años (2024 hasta actual + 1)
    anioSelect.innerHTML = '';
    const anioActual = ahora.getFullYear();
    for (let a = anioActual + 1; a >= 2024; a--) {
        const opt = document.createElement('sl-option');
        opt.value = a;
        opt.textContent = a;
        anioSelect.appendChild(opt);
    }
    // Set default value on sl-select after options are appended
    anioSelect.value = anioActual;
}

// ============================================
// OBTENER REGISTROS DEL PERIODO
// ============================================

async function obtenerRegistrosPeriodo() {
    const mes = parseInt(document.getElementById('cierreMes').value);
    const anio = parseInt(document.getElementById('cierreAnio').value);

    const pedidos = (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];

    return pedidos.filter(p => {
        if (p.estado !== PEDIDO_ESTADOS.FACTURADO && p.estado !== PEDIDO_ESTADOS.NOTA_CREDITO) return false;
        const fecha = new Date(p.fecha);
        return fecha.getMonth() + 1 === mes && fecha.getFullYear() === anio;
    }).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

function getNombreMes(mes) {
    return ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
            'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes - 1];
}

// ============================================
// DESGLOSE IVA (Paraguay: 10% general, 5% canasta basica)
// Usa desglose por item si esta guardado en el pedido, sino fallback a 10%
// ============================================

// ============================================
// PREVISUALIZAR
// ============================================

async function previsualizarCierre() {
    registrosCierreMensual = await obtenerRegistrosPeriodo();

    const resumen = document.getElementById('cierreResumen');
    resumen.classList.remove('hidden');

    const facturas = registrosCierreMensual.filter(r => r.estado === PEDIDO_ESTADOS.FACTURADO);
    const ncs = registrosCierreMensual.filter(r => r.estado === PEDIDO_ESTADOS.NOTA_CREDITO);
    const totalBruto = facturas.reduce((s, r) => s + (r.total || 0), 0);
    const totalNCs = ncs.reduce((s, r) => s + Math.abs(r.total || 0), 0);

    document.getElementById('cierreFacturas').textContent = facturas.length;
    document.getElementById('cierreNCs').textContent = ncs.length;
    document.getElementById('cierreTotalBruto').textContent = formatearGuaranies(totalBruto);
    document.getElementById('cierreTotalNeto').textContent = formatearGuaranies(totalBruto - totalNCs);
    document.getElementById('cierreRegistrosCount').textContent = registrosCierreMensual.length + ' registros';

    // Tabla preview
    const tbody = document.getElementById('cierreTablaBody');
    tbody.innerHTML = '';

    if (registrosCierreMensual.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="px-4 py-8 text-center text-gray-400 italic">Sin registros en este periodo</td></tr>';
        return;
    }

    registrosCierreMensual.forEach(r => {
        const clienteInfo = productosData.clientes.find(c => c.id === r.cliente?.id);
        const ruc = clienteInfo?.ruc || r.cliente?.ruc || '';
        const esNC = r.estado === PEDIDO_ESTADOS.NOTA_CREDITO;
        const tipo = esNC ? 'NC' : 'Venta';
        const total = r.total || 0;
        const desglose = calcularDesglose(total, r);

        const tr = document.createElement('tr');
        tr.className = esNC ? 'bg-red-50/50' : '';
        tr.innerHTML = `
            <td class="px-4 py-2.5 text-xs">${new Date(r.fecha).toLocaleDateString('es-PY')}</td>
            <td class="px-4 py-2.5 text-xs font-mono">${escapeHTML(ruc) || '-'}</td>
            <td class="px-4 py-2.5 text-sm font-medium">${escapeHTML(r.cliente?.nombre) || '-'}</td>
            <td class="px-4 py-2.5 text-xs font-mono">${escapeHTML(r.numFactura || r.id)}</td>
            <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${esNC ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}">${tipo}</span>
            </td>
            <td class="px-4 py-2.5 text-right text-xs">${desglose.exentas === 0 ? '-' : formatearGuaranies(desglose.exentas)}</td>
            <td class="px-4 py-2.5 text-right text-xs">${desglose.iva5 === 0 ? '-' : formatearGuaranies(desglose.iva5)}</td>
            <td class="px-4 py-2.5 text-right text-xs">${formatearGuaranies(desglose.iva10)}</td>
            <td class="px-4 py-2.5 text-right font-bold text-sm ${esNC ? 'text-red-600' : ''}">${esNC ? '-' : ''}${formatearGuaranies(Math.abs(total))}</td>`;
        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

// ============================================
// EXPORTAR LIBRO RG90 (CSV)
// ============================================

async function exportarLibroRG90() {
    const registros = await obtenerRegistrosPeriodo();
    if (registros.length === 0) {
        mostrarToast('No hay registros en el periodo seleccionado', 'error');
        return;
    }

    await withButtonLock('btnRG90', async () => {
        // Simular procesamiento
        await new Promise(r => setTimeout(r, 800));

        const mes = document.getElementById('cierreMes').value;
        const anio = document.getElementById('cierreAnio').value;
        const nombreMes = getNombreMes(parseInt(mes));

        // Header CSV
        let csv = '\uFEFF'; // BOM para Excel
        csv += 'Fecha,RUC,Razon Social,Nro Comprobante,Tipo Documento,CDC,Exentas,Gravada 5%,IVA 5%,Gravada 10%,IVA 10%,Total\n';

        registros.forEach(r => {
            const clienteInfo = productosData.clientes.find(c => c.id === r.cliente?.id);
            const ruc = clienteInfo?.ruc || r.cliente?.ruc || '';
            const esNC = r.estado === PEDIDO_ESTADOS.NOTA_CREDITO;
            const tipo = esNC ? 'Nota de Credito' : 'Factura Electronica';
            const total = r.total || 0;
            const desglose = calcularDesglose(total, r);

            const fecha = new Date(r.fecha).toLocaleDateString('es-PY');
            const nombre = r.cliente?.nombre || '';
            const numDoc = r.numFactura || r.id;
            const cdc = r.cdc || '';

            csv += [
                escaparCSV(fecha), escaparCSV(ruc), escaparCSV(nombre),
                escaparCSV(numDoc), escaparCSV(tipo), escaparCSV(cdc),
                desglose.exentas, desglose.gravada5 || 0, desglose.iva5,
                desglose.gravada10 || 0, desglose.iva10, total
            ].join(',') + '\n';
        });

        // Descargar
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `RG90_${nombreMes}_${anio}.csv`;
        link.click();
        URL.revokeObjectURL(url);

        mostrarToast(`Libro RG90 de ${nombreMes} ${anio} descargado`, 'success');
    }, 'Generando reporte...')();
}

// ============================================
// EXPORTAR PAQUETE ZIP (Mock KuDE + XML)
// ============================================

async function exportarPaqueteZIP() {
    const registros = await obtenerRegistrosPeriodo();
    if (registros.length === 0) {
        mostrarToast('No hay registros en el periodo seleccionado', 'error');
        return;
    }

    if (typeof JSZip === 'undefined') {
        mostrarToast('Error: libreria JSZip no cargada', 'error');
        return;
    }

    await withButtonLock('btnZIP', async () => {
        const mes = document.getElementById('cierreMes').value;
        const anio = document.getElementById('cierreAnio').value;
        const nombreMes = getNombreMes(parseInt(mes));

        const zip = new JSZip();

        // Simular procesamiento
        await new Promise(r => setTimeout(r, 1200));

        registros.forEach(r => {
            const cdc = r.cdc || r.id.replace(/[^a-zA-Z0-9]/g, '');
            const clienteInfo = productosData.clientes.find(c => c.id === r.cliente?.id);
            const ruc = clienteInfo?.ruc || r.cliente?.ruc || 'SIN_RUC';
            const esNC = r.estado === PEDIDO_ESTADOS.NOTA_CREDITO;
            const tipoDoc = esNC ? 'NotaCredito' : 'Factura';

            // Mock KuDE (contenido simulado de texto)
            const kudeContent = [
                `=== ${tipoDoc.toUpperCase()} ELECTRONICA - KuDE ===`,
                ``,
                `HDV DISTRIBUCIONES`,
                `RUC Emisor: 80000000-0`,
                `Timbrado: 12345678`,
                ``,
                `Documento: ${r.numFactura || r.id}`,
                `CDC: ${cdc}`,
                `Fecha: ${new Date(r.fecha).toLocaleString('es-PY')}`,
                ``,
                `Cliente: ${r.cliente?.nombre || 'N/A'}`,
                `RUC Cliente: ${ruc}`,
                ``,
                `--- DETALLE ---`,
                ...(r.items || []).map(i =>
                    `${Math.abs(i.cantidad)}x ${i.nombre} ${i.presentacion} ... ${formatearGuaranies(i.subtotal)}`
                ),
                ``,
                `TOTAL: ${formatearGuaranies(r.total)}`,
                ``,
                `[QR SIFEN - Simulado]`,
                `Consulte en: https://ekuatia.set.gov.py/consultas/qr?cdc=${cdc}`,
            ].join('\n');

            // Mock XML (estructura simulada SIFEN)
            const xmlContent = [
                `<?xml version="1.0" encoding="UTF-8"?>`,
                `<!-- DOCUMENTO ELECTRONICO SIMULADO - FASE MOCK -->`,
                `<!-- TODO: Fase Futura - Reemplazar con XML real de FactPy -->`,
                `<rDE xmlns="http://ekuatia.set.gov.py/sifen/xsd">`,
                `  <dVerFor>150</dVerFor>`,
                `  <gTimb>`,
                `    <iTiDE>${esNC ? 5 : 1}</iTiDE>`,
                `    <dNumTim>12345678</dNumTim>`,
                `    <dEst>001</dEst>`,
                `    <dPunExp>001</dPunExp>`,
                `    <dNumDoc>${(r.numFactura || r.id).split('-').pop() || '0000001'}</dNumDoc>`,
                `  </gTimb>`,
                `  <gDatGralOpe>`,
                `    <dFeEmiDE>${new Date(r.fecha).toISOString()}</dFeEmiDE>`,
                `  </gDatGralOpe>`,
                `  <gDatRec>`,
                `    <dRucRec>${ruc}</dRucRec>`,
                `    <dNomRec>${r.cliente?.nombre || 'N/A'}</dNomRec>`,
                `  </gDatRec>`,
                `  <gDtipDE>`,
                ...(r.items || []).map(i => [
                    `    <gCamItem>`,
                    `      <dDesProSer>${i.nombre} ${i.presentacion}</dDesProSer>`,
                    `      <dCantProSer>${Math.abs(i.cantidad)}</dCantProSer>`,
                    `      <gValorItem>`,
                    `        <dPUniProSer>${Math.abs(i.precio || 0)}</dPUniProSer>`,
                    `        <dTotBruOpeItem>${Math.abs(i.subtotal || 0)}</dTotBruOpeItem>`,
                    `      </gValorItem>`,
                    `    </gCamItem>`,
                ].join('\n')),
                `  </gDtipDE>`,
                `  <gTotSub>`,
                `    <dTotGralOpe>${r.total || 0}</dTotGralOpe>`,
                `  </gTotSub>`,
                `  <dCDC>${cdc}</dCDC>`,
                `</rDE>`,
            ].join('\n');

            zip.file(`${cdc}_KuDE.txt`, kudeContent);
            zip.file(`${cdc}_${tipoDoc}.xml`, xmlContent);
        });

        // Generar y descargar ZIP
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Facturas_Electronicas_${nombreMes}_${anio}.zip`;
        link.click();
        URL.revokeObjectURL(url);

        mostrarToast(`Paquete tributario de ${nombreMes} ${anio} descargado (${registros.length} documentos)`, 'success');
    }, 'Comprimiendo archivos...')();
}

// ============================================
// LIBRO DIARIO (CSV)
// ============================================

async function exportarLibroDiario() {
    const registros = await obtenerRegistrosPeriodo();
    const mes = parseInt(document.getElementById('cierreMes').value);
    const anio = parseInt(document.getElementById('cierreAnio').value);
    const nombreMes = getNombreMes(mes);

    if (registros.length === 0) {
        mostrarToast('No hay registros en el periodo seleccionado', 'warning');
        return;
    }

    await withButtonLock('btnLibroDiario', async () => {
        const gastos = await _obtenerGastosPeriodo(mes, anio);

        let csv = '﻿';
        csv += 'Fecha,Cuenta,Debe,Haber,Concepto,Referencia\n';
        let asiento = 1;

        registros.forEach(r => {
            const fecha = new Date(r.fecha).toLocaleDateString('es-PY');
            const esNC = r.estado === PEDIDO_ESTADOS.NOTA_CREDITO;
            const total = Math.abs(r.total || 0);
            const desglose = calcularDesglose(total, r);
            const ref = r.numFactura || r.id;
            const concepto = esNC ? 'Nota de Credito' : `Venta ${r.tipoPago === 'credito' ? 'credito' : 'contado'}`;
            const cuentaCobro = r.tipoPago === 'credito' ? 'Cuentas por Cobrar' : 'Caja';

            if (esNC) {
                csv += `${escaparCSV(fecha)},Ventas,${total},0,${escaparCSV(concepto)},${escaparCSV(ref)}\n`;
                if (desglose.iva10 > 0) csv += `${escaparCSV(fecha)},IVA Debito Fiscal 10%,${desglose.iva10},0,${escaparCSV(concepto)},${escaparCSV(ref)}\n`;
                if (desglose.iva5 > 0) csv += `${escaparCSV(fecha)},IVA Debito Fiscal 5%,${desglose.iva5},0,${escaparCSV(concepto)},${escaparCSV(ref)}\n`;
                csv += `${escaparCSV(fecha)},${escaparCSV(cuentaCobro)},0,${total},${escaparCSV(concepto)},${escaparCSV(ref)}\n`;
            } else {
                csv += `${escaparCSV(fecha)},${escaparCSV(cuentaCobro)},${total},0,${escaparCSV(concepto)},${escaparCSV(ref)}\n`;
                const ventaNeta = total - (desglose.iva10 || 0) - (desglose.iva5 || 0);
                csv += `${escaparCSV(fecha)},Ventas,0,${ventaNeta},${escaparCSV(concepto)},${escaparCSV(ref)}\n`;
                if (desglose.iva10 > 0) csv += `${escaparCSV(fecha)},IVA Debito Fiscal 10%,0,${desglose.iva10},${escaparCSV(concepto)},${escaparCSV(ref)}\n`;
                if (desglose.iva5 > 0) csv += `${escaparCSV(fecha)},IVA Debito Fiscal 5%,0,${desglose.iva5},${escaparCSV(concepto)},${escaparCSV(ref)}\n`;
            }
            asiento++;
        });

        gastos.forEach(g => {
            const fecha = g.fecha ? new Date(g.fecha).toLocaleDateString('es-PY') : '-';
            csv += `${escaparCSV(fecha)},Gastos Operativos,${g.monto || 0},0,${escaparCSV(g.concepto || 'Gasto')},${escaparCSV('GASTO-' + (g.id || ''))}\n`;
            csv += `${escaparCSV(fecha)},Caja,0,${g.monto || 0},${escaparCSV(g.concepto || 'Gasto')},${escaparCSV('GASTO-' + (g.id || ''))}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `LibroDiario_${nombreMes}_${anio}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        mostrarExito(`Libro Diario de ${nombreMes} ${anio} descargado`);
    }, 'Generando libro diario...')();
}

async function _obtenerGastosPeriodo(mes, anio) {
    const allGastos = (await HDVStorage.getItem('hdv_gastos', { clone: false })) || [];
    return allGastos.filter(g => {
        if (!g.fecha) return false;
        const f = new Date(g.fecha);
        return f.getMonth() + 1 === mes && f.getFullYear() === anio;
    });
}

// ============================================
// RESUMEN IVA
// ============================================

async function generarResumenIVA() {
    const registros = await obtenerRegistrosPeriodo();
    const mes = parseInt(document.getElementById('cierreMes').value);
    const anio = parseInt(document.getElementById('cierreAnio').value);
    const nombreMes = getNombreMes(mes);

    let totalExentas = 0, totalGravada5 = 0, totalIva5 = 0, totalGravada10 = 0, totalIva10 = 0;
    let totalVentas = 0, totalNCs = 0;

    registros.forEach(r => {
        const esNC = r.estado === PEDIDO_ESTADOS.NOTA_CREDITO;
        const total = Math.abs(r.total || 0);
        const d = calcularDesglose(total, r);
        const signo = esNC ? -1 : 1;

        totalExentas += d.exentas * signo;
        totalGravada5 += (d.gravada5 || 0) * signo;
        totalIva5 += d.iva5 * signo;
        totalGravada10 += (d.gravada10 || 0) * signo;
        totalIva10 += d.iva10 * signo;

        if (esNC) totalNCs += total;
        else totalVentas += total;
    });

    const totalIva = totalIva5 + totalIva10;
    const netoDeclarar = totalIva;

    const gastos = await _obtenerGastosPeriodo(mes, anio);
    const totalGastos = gastos.reduce((s, g) => s + (g.monto || 0), 0);
    const utilidadBruta = totalVentas - totalNCs - totalGastos;

    const html = `<div class="space-y-4">
        <h4 class="font-bold text-gray-800">Resumen IVA — ${nombreMes} ${anio}</h4>
        <table class="w-full text-sm">
            <thead class="bg-gray-50"><tr><th class="px-4 py-2 text-left">Concepto</th><th class="px-4 py-2 text-right">Base Gravada</th><th class="px-4 py-2 text-right">IVA Liquidado</th></tr></thead>
            <tbody class="divide-y">
                <tr><td class="px-4 py-2">Gravado 10%</td><td class="px-4 py-2 text-right">${formatearGuaranies(totalGravada10)}</td><td class="px-4 py-2 text-right font-bold">${formatearGuaranies(totalIva10)}</td></tr>
                <tr><td class="px-4 py-2">Gravado 5%</td><td class="px-4 py-2 text-right">${formatearGuaranies(totalGravada5)}</td><td class="px-4 py-2 text-right font-bold">${formatearGuaranies(totalIva5)}</td></tr>
                <tr><td class="px-4 py-2">Exentas</td><td class="px-4 py-2 text-right">${formatearGuaranies(totalExentas)}</td><td class="px-4 py-2 text-right text-gray-400">-</td></tr>
                <tr class="bg-blue-50 font-bold"><td class="px-4 py-2">Total IVA a Declarar</td><td class="px-4 py-2 text-right">${formatearGuaranies(totalVentas - totalNCs)}</td><td class="px-4 py-2 text-right text-blue-700">${formatearGuaranies(netoDeclarar)}</td></tr>
            </tbody>
        </table>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div class="bg-green-50 rounded-lg p-3 text-center"><p class="text-xs text-green-600 font-bold">VENTAS BRUTAS</p><p class="text-lg font-bold text-green-800">${formatearGuaranies(totalVentas)}</p></div>
            <div class="bg-red-50 rounded-lg p-3 text-center"><p class="text-xs text-red-600 font-bold">NOTAS CREDITO</p><p class="text-lg font-bold text-red-800">-${formatearGuaranies(totalNCs)}</p></div>
            <div class="bg-yellow-50 rounded-lg p-3 text-center"><p class="text-xs text-yellow-600 font-bold">GASTOS</p><p class="text-lg font-bold text-yellow-800">-${formatearGuaranies(totalGastos)}</p></div>
            <div class="bg-blue-50 rounded-lg p-3 text-center"><p class="text-xs text-blue-600 font-bold">UTILIDAD BRUTA</p><p class="text-lg font-bold text-blue-800">${formatearGuaranies(utilidadBruta)}</p></div>
        </div>
        <p class="text-xs text-gray-400 text-right">${registros.length} documentos | ${gastos.length} gastos</p>
    </div>`;

    await mostrarConfirmModal(html, { titulo: `Resumen IVA — ${nombreMes} ${anio}`, textoConfirmar: 'Cerrar', ocultarCancelar: true, html: true });
}
