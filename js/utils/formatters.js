// ============================================
// HDV Utils - Formateadores y Generadores
// Funciones puras reutilizables. Sin acceso al DOM.
// ============================================

// --- Formato de fecha ---

function formatearFecha(fecha) {
    const d = new Date(fecha);
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

// Alias para compatibilidad con admin-ventas.js y admin-devoluciones.js
function formatearFechaAdmin(fecha) { return formatearFecha(fecha); }

// Alias para compatibilidad con ventas-templates.js
function tplFormatearFechaAdmin(fecha) { return formatearFecha(fecha); }

function formatearFechaArchivo() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

// --- Generadores mock SIFEN ---

function generarNumeroFactura() {
    const num = String(Math.floor(Math.random() * 9999999) + 1).padStart(7, '0');
    return `001-001-${num}`;
}

// Alias admin
function generarNumeroFacturaAdmin() { return generarNumeroFactura(); }

function generarCDC() {
    let cdc = '';
    for (let i = 0; i < 44; i++) cdc += Math.floor(Math.random() * 10);
    return cdc;
}

// Alias admin
function generarCDCAdmin() { return generarCDC(); }

// --- Desglose IVA (Paraguay — precios con IVA incluido) ---

function calcularDesgloseIVA(items) {
    let totalExentas = 0, totalGravada5 = 0, totalGravada10 = 0;

    items.forEach(item => {
        const tipo = (item.tipo_impuesto || '10').toString();
        if (tipo === 'exenta' || tipo === '0') {
            totalExentas += item.subtotal;
        } else if (tipo === '5') {
            totalGravada5 += item.subtotal;
        } else {
            totalGravada10 += item.subtotal;
        }
    });

    const liqIva5 = Math.round(totalGravada5 / 21);
    const liqIva10 = Math.round(totalGravada10 / 11);
    const totalIva = liqIva5 + liqIva10;

    return {
        totalExentas,
        totalGravada5,
        liqIva5,
        totalGravada10,
        liqIva10,
        totalIva,
        total: totalExentas + totalGravada5 + totalGravada10
    };
}

// Wrapper para admin-contabilidad.js: usa desglose guardado o fallback 10%
function calcularDesglose(total, pedido) {
    if (pedido && pedido.desgloseIVA) {
        const d = pedido.desgloseIVA;
        return {
            exentas: d.totalExentas || 0,
            gravada5: d.totalGravada5 || 0,
            iva5: d.liqIva5 || 0,
            gravada10: d.totalGravada10 || 0,
            iva10: d.liqIva10 || 0,
            totalIva: d.totalIva || 0,
            total: total
        };
    }
    const base10 = Math.round(total / 1.10);
    const iva10 = total - base10;
    return { exentas: 0, gravada5: 0, iva5: 0, gravada10: base10, iva10: iva10, totalIva: iva10, total: total };
}

// --- Utilidades de descarga ---

function descargarCSV(contenido, nombreArchivo) {
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nombreArchivo;
    link.click();
}

function descargarJSON(data, nombreArchivo) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nombreArchivo;
    link.click();
    URL.revokeObjectURL(link.href);
}
