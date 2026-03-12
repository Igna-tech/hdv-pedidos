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
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        if (a === anioActual) opt.selected = true;
        anioSelect.appendChild(opt);
    }
}

// ============================================
// OBTENER REGISTROS DEL PERIODO
// ============================================

function obtenerRegistrosPeriodo() {
    const mes = parseInt(document.getElementById('cierreMes').value);
    const anio = parseInt(document.getElementById('cierreAnio').value);

    const pedidos = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');

    return pedidos.filter(p => {
        if (p.estado !== 'facturado_mock' && p.estado !== 'nota_credito_mock') return false;
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
// Por ahora todo se asume IVA 10%
// ============================================

function calcularDesglose(total) {
    // IVA 10%: base = total / 1.10, iva = total - base
    const base10 = Math.round(total / 1.10);
    const iva10 = total - base10;
    return { exentas: 0, iva5: 0, iva10: iva10, total: total };
}

// ============================================
// PREVISUALIZAR
// ============================================

function previsualizarCierre() {
    registrosCierreMensual = obtenerRegistrosPeriodo();

    const resumen = document.getElementById('cierreResumen');
    resumen.classList.remove('hidden');

    const facturas = registrosCierreMensual.filter(r => r.estado === 'facturado_mock');
    const ncs = registrosCierreMensual.filter(r => r.estado === 'nota_credito_mock');
    const totalBruto = facturas.reduce((s, r) => s + (r.total || 0), 0);
    const totalNCs = ncs.reduce((s, r) => s + Math.abs(r.total || 0), 0);

    document.getElementById('cierreFacturas').textContent = facturas.length;
    document.getElementById('cierreNCs').textContent = ncs.length;
    document.getElementById('cierreTotalBruto').textContent = 'Gs. ' + totalBruto.toLocaleString();
    document.getElementById('cierreTotalNeto').textContent = 'Gs. ' + (totalBruto - totalNCs).toLocaleString();
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
        const esNC = r.estado === 'nota_credito_mock';
        const tipo = esNC ? 'NC' : 'Venta';
        const total = r.total || 0;
        const desglose = calcularDesglose(total);

        const tr = document.createElement('tr');
        tr.className = esNC ? 'bg-red-50/50' : '';
        tr.innerHTML = `
            <td class="px-4 py-2.5 text-xs">${new Date(r.fecha).toLocaleDateString('es-PY')}</td>
            <td class="px-4 py-2.5 text-xs font-mono">${ruc || '-'}</td>
            <td class="px-4 py-2.5 text-sm font-medium">${r.cliente?.nombre || '-'}</td>
            <td class="px-4 py-2.5 text-xs font-mono">${r.numFactura || r.id}</td>
            <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${esNC ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}">${tipo}</span>
            </td>
            <td class="px-4 py-2.5 text-right text-xs">${desglose.exentas === 0 ? '-' : 'Gs. ' + desglose.exentas.toLocaleString()}</td>
            <td class="px-4 py-2.5 text-right text-xs">${desglose.iva5 === 0 ? '-' : 'Gs. ' + desglose.iva5.toLocaleString()}</td>
            <td class="px-4 py-2.5 text-right text-xs">Gs. ${desglose.iva10.toLocaleString()}</td>
            <td class="px-4 py-2.5 text-right font-bold text-sm ${esNC ? 'text-red-600' : ''}">${esNC ? '-' : ''}Gs. ${Math.abs(total).toLocaleString()}</td>`;
        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

// ============================================
// EXPORTAR LIBRO RG90 (CSV)
// ============================================

async function exportarLibroRG90() {
    const registros = obtenerRegistrosPeriodo();
    if (registros.length === 0) {
        mostrarToast('No hay registros en el periodo seleccionado', 'error');
        return;
    }

    const btn = document.getElementById('btnRG90');
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin inline mr-1.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Generando reporte...';

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
        const esNC = r.estado === 'nota_credito_mock';
        const tipo = esNC ? 'Nota de Credito' : 'Factura Electronica';
        const total = r.total || 0;
        const desglose = calcularDesglose(total);
        const gravada10 = total - desglose.iva10;

        const fecha = new Date(r.fecha).toLocaleDateString('es-PY');
        const nombre = (r.cliente?.nombre || '').replace(/,/g, ' ');
        const numDoc = r.numFactura || r.id;
        const cdc = r.cdc || '';

        csv += `${fecha},${ruc},"${nombre}",${numDoc},${tipo},${cdc},`;
        csv += `${desglose.exentas},0,0,${gravada10},${desglose.iva10},${total}\n`;
    });

    // Descargar
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RG90_${nombreMes}_${anio}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    btn.disabled = false;
    btn.innerHTML = textoOriginal;
    mostrarToast(`Libro RG90 de ${nombreMes} ${anio} descargado`, 'success');
}

// ============================================
// EXPORTAR PAQUETE ZIP (Mock KuDE + XML)
// ============================================

async function exportarPaqueteZIP() {
    const registros = obtenerRegistrosPeriodo();
    if (registros.length === 0) {
        mostrarToast('No hay registros en el periodo seleccionado', 'error');
        return;
    }

    if (typeof JSZip === 'undefined') {
        mostrarToast('Error: libreria JSZip no cargada', 'error');
        return;
    }

    const btn = document.getElementById('btnZIP');
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin inline mr-1.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Comprimiendo archivos...';

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
        const esNC = r.estado === 'nota_credito_mock';
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
                `${Math.abs(i.cantidad)}x ${i.nombre} ${i.presentacion} ... Gs. ${(i.subtotal || 0).toLocaleString()}`
            ),
            ``,
            `TOTAL: Gs. ${(r.total || 0).toLocaleString()}`,
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
                `      <dCantProSer>${i.cantidad}</dCantProSer>`,
                `      <gValorItem>`,
                `        <dPUniProSer>${i.precio || 0}</dPUniProSer>`,
                `        <dTotBruOpeItem>${i.subtotal || 0}</dTotBruOpeItem>`,
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

        zip.file(`${cdc}_KuDE.pdf`, kudeContent);
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

    btn.disabled = false;
    btn.innerHTML = textoOriginal;
    mostrarToast(`Paquete tributario de ${nombreMes} ${anio} descargado (${registros.length} documentos)`, 'success');
}
