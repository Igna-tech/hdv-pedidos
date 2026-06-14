// ============================================
// HDV — Generador KuDE (Representación Gráfica DTE SIFEN)
// Fiel al formato e-Kuatia'i. Abre en nueva pestaña como blob HTML.
// Requiere: ventas-data.js, sanitizer.js, dialogs.js
// ============================================

async function _kudeAsDataUrl(url) {
    if (!url) return '';
    try {
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) return '';
        const blob = await res.blob();
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload  = e => resolve(e.target.result);
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
        });
    } catch(e) { return ''; }
}

async function _kudeQrDataUrl(text) {
    if (!text) return '';
    if (typeof QRCode === 'undefined') {
        await new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
            s.onload = resolve; s.onerror = resolve;
            document.head.appendChild(s);
        });
    }
    if (typeof QRCode === 'undefined') return '';
    return new Promise(resolve => {
        try {
            const canvas = document.createElement('canvas');
            new QRCode(canvas, {
                text, width: 120, height: 120,
                colorDark: '#000000', colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
            setTimeout(() => resolve(canvas.toDataURL('image/png')), 200);
        } catch(e) { resolve(''); }
    });
}

function _kudeFeIniTimbrado(venc) {
    if (!venc) return '';
    const d = new Date(venc);
    const ini = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
    return ini.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function _kudeTipoDocLabel(pedido) {
    const id = pedido.id || '';
    const tc = pedido.tipo_comprobante || '';
    if (id.startsWith('NC-')  || tc === 'nota_credito_electronica')  return 'NOTA DE CRÉDITO ELECTRÓNICA';
    if (id.startsWith('NRE-') || tc === 'nota_remision_electronica') return 'NOTA DE REMISIÓN ELECTRÓNICA';
    return 'FACTURA ELECTRÓNICA';
}

function _kudeFmt(n) { return (Number(n) || 0).toLocaleString('es-PY'); }

function _kudeTh(txt, extra) {
    return `<th style="border:1px solid #000;padding:3px 5px;font-size:9px;text-align:center;background:#f5f5f5;${extra||''}">${txt}</th>`;
}

function _kudeTd(txt, align, extra) {
    return `<td style="border:1px solid #000;padding:2px 5px;font-size:10px;vertical-align:top;text-align:${align||'left'};${extra||''}">${txt}</td>`;
}

function _kudeItemsTable(pedido) {
    const id  = pedido.id || '';
    const tc  = pedido.tipo_comprobante || '';
    const esNRE = id.startsWith('NRE-') || tc === 'nota_remision_electronica';
    const items = pedido.items || [];

    if (esNRE) {
        const head = `<tr>
            ${_kudeTh('COD.')}${_kudeTh('CANT.')}
            ${_kudeTh('DESCRIPCI&Oacute;N', 'width:55%;text-align:left;')}
            ${_kudeTh('UNIDAD')}
        </tr>`;
        const rows = items.map((it, i) => `<tr>
            ${_kudeTd(escapeHTML(it.productoId ? String(it.productoId).substring(0,6) : String(i+1)), 'center')}
            ${_kudeTd(String(it.cantidad||0), 'center')}
            ${_kudeTd(escapeHTML((it.nombre||'') + (it.presentacion ? ' '+it.presentacion : '')))}
            ${_kudeTd(escapeHTML(it.unidad||'UNI'), 'center')}
        </tr>`).join('');
        return `<table style="width:100%;border-collapse:collapse;">
            <thead>${head}</thead><tbody>${rows}</tbody></table>`;
    }

    // FAC- / NC-: tabla con columnas IVA — fiel al formato e-Kuatia'i
    const head = `<tr>
        ${_kudeTh('COD.','width:5%;')}
        ${_kudeTh('CANT.','width:5%;')}
        ${_kudeTh('DESCRIPCI&Oacute;N','width:32%;text-align:left;')}
        ${_kudeTh('PRECIO UNITARIO<br>(INCLUIDO IMPUESTO)','width:12%;')}
        ${_kudeTh('DESCUENTO','width:8%;')}
        <th colspan="3" style="border:1px solid #000;padding:3px 5px;font-size:9px;text-align:center;background:#f5f5f5;">VALOR DE VENTA</th>
    </tr>
    <tr>
        <th colspan="5" style="border:0;padding:0;"></th>
        ${_kudeTh('EXENTAS','width:13%;')}
        ${_kudeTh('5%','width:12%;')}
        ${_kudeTh('10%','width:13%;')}
    </tr>`;

    const rows = items.map((it, i) => {
        const tipo = String(it.tipo_impuesto || '10').toLowerCase();
        const sub  = it.subtotal ?? ((it.precio||0) * (it.cantidad||0));
        const colExe = (tipo === 'exenta' || tipo === '0') ? sub : 0;
        const col5   = (tipo === '5') ? sub : 0;
        const col10  = (!colExe && !col5) ? sub : 0;
        return `<tr>
            ${_kudeTd(escapeHTML(it.productoId ? String(it.productoId).substring(0,6) : String(i+1)), 'center')}
            ${_kudeTd(String(it.cantidad||0), 'center')}
            ${_kudeTd(escapeHTML((it.nombre||'') + (it.presentacion ? ' '+it.presentacion : '')))}
            ${_kudeTd(_kudeFmt(it.precio||0), 'right')}
            ${_kudeTd('0', 'right')}
            ${_kudeTd(colExe > 0 ? _kudeFmt(colExe) : '', 'right')}
            ${_kudeTd(col5   > 0 ? _kudeFmt(col5)   : '', 'right')}
            ${_kudeTd(col10  > 0 ? _kudeFmt(col10)  : '', 'right')}
        </tr>`;
    }).join('');

    const emptyRows = Math.max(0, 5 - items.length);
    const blanks = Array(emptyRows).fill(`<tr>
        <td style="border:1px solid #000;padding:5px 5px;">&nbsp;</td>
        <td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td>
        <td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td>
        <td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td>
        <td style="border:1px solid #000;"></td>
    </tr>`).join('');

    const iva      = pedido.desgloseIVA || {};
    let subExe   = iva.totalExentas   || 0;
    let sub5     = iva.totalGravada5  || 0;
    let sub10    = iva.totalGravada10 || 0;
    let liqIva5  = iva.liqIva5  || 0;
    let liqIva10 = iva.liqIva10 || 0;
    let totalIva = iva.totalIva || 0;

    // Calcular desde items si desgloseIVA no está disponible
    if (!subExe && !sub5 && !sub10 && items.length > 0) {
        items.forEach(it => {
            const tipo = String(it.tipo_impuesto || '10').toLowerCase();
            const s = it.subtotal ?? ((it.precio||0) * (it.cantidad||0));
            if (tipo === 'exenta' || tipo === '0') subExe += s;
            else if (tipo === '5') sub5 += s;
            else sub10 += s;
        });
        liqIva5  = Math.round(sub5  / 21);
        liqIva10 = Math.round(sub10 / 11);
        totalIva = liqIva5 + liqIva10;
    } else if (!totalIva) {
        totalIva = liqIva5 + liqIva10;
    }
    const totalOpe = pedido.total || 0;

    const foot = `
    <tr style="font-weight:bold;background:#f8f8f8;">
        <td colspan="5" style="border:1px solid #000;padding:3px 5px;font-size:10px;font-weight:bold;">SUBTOTAL:</td>
        <td style="border:1px solid #000;padding:3px 5px;font-size:10px;text-align:right;">${_kudeFmt(subExe)}</td>
        <td style="border:1px solid #000;padding:3px 5px;font-size:10px;text-align:right;">${_kudeFmt(sub5)}</td>
        <td style="border:1px solid #000;padding:3px 5px;font-size:10px;text-align:right;">${_kudeFmt(sub10)}</td>
    </tr>
    <tr>
        <td colspan="7" style="border:1px solid #000;padding:3px 5px;font-size:10px;font-weight:bold;">TOTAL DE LA OPERACI&Oacute;N:</td>
        <td style="border:1px solid #000;padding:3px 5px;font-size:10px;font-weight:bold;text-align:right;">${_kudeFmt(totalOpe)}</td>
    </tr>
    <tr>
        <td colspan="2" style="border:1px solid #000;padding:3px 5px;font-size:10px;font-weight:bold;">LIQUIDACI&Oacute;N IVA:</td>
        <td colspan="2" style="border:1px solid #000;padding:3px 5px;font-size:10px;">(5%) ${_kudeFmt(liqIva5)}</td>
        <td colspan="2" style="border:1px solid #000;padding:3px 5px;font-size:10px;">(10%) ${_kudeFmt(liqIva10)}</td>
        <td colspan="2" style="border:1px solid #000;padding:3px 5px;font-size:10px;font-weight:bold;">TOTAL IVA: ${_kudeFmt(totalIva)}</td>
    </tr>`;

    return `<table style="width:100%;border-collapse:collapse;">
        <thead>${head}</thead><tbody>${rows}${blanks}${foot}</tbody></table>`;
}

async function generarKudePDF(pedidoId) {
    if (!pedidoId) return;
    const pedido = await ventasDataBuscarPedido(pedidoId);
    if (!pedido) { mostrarToast('Documento no encontrado', 'error'); return; }

    const clienteInfo = ventasDataBuscarCliente(pedido.cliente?.id);
    const empresa     = ventasDataObtenerEmpresa();

    const cdc     = pedido.sifen_cdc || pedido.cdc || pedido.cdc_nc || '';
    const numDoc  = pedido.numFactura || pedido.sifen_numFactura || pedido.id || '';
    const tipoLbl = _kudeTipoDocLabel(pedido);
    const tipoTxt = tipoLbl.includes('CRÉDITO') ? 'Nota de Crédito Electrónica'
                  : tipoLbl.includes('REMISIÓN') ? 'Nota de Remisión Electrónica'
                  : 'Factura Electrónica';

    const fechaEmi = pedido.sifen_fecha_generacion || pedido.fecha || '';
    const fechaStr = fechaEmi
        ? new Date(fechaEmi).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';

    const rucCliente    = clienteInfo?.ruc       || pedido.cliente?.ruc       || '';
    const nombreCliente = clienteInfo?.razon_social || clienteInfo?.nombre || pedido.cliente?.nombre || '';
    const dirCliente    = clienteInfo?.direccion || pedido.cliente?.direccion || '';
    const telCliente    = clienteInfo?.telefono  || pedido.cliente?.telefono  || '';
    const emailCliente  = clienteInfo?.email     || pedido.cliente?.email     || '';
    const esCredito     = pedido.tipoPago === 'credito' || pedido.condicion_pago === 'credito';

    const feIni = _kudeFeIniTimbrado(empresa.timbradoVenc);

    const [qrDataUrl, logoDataUrl] = await Promise.all([
        _kudeQrDataUrl(cdc),
        _kudeAsDataUrl(empresa.logo_url)
    ]);

    const logoHtml = logoDataUrl
        ? `<img src="${logoDataUrl}" alt="Logo" style="max-height:75px;max-width:160px;object-fit:contain;display:block;margin:0 auto 5px;">`
        : '';

    const ncRefHtml = (pedido.tipo_comprobante === 'nota_credito_electronica' && pedido.factura_referenciada_id)
        ? `<tr><td colspan="4" style="border-bottom:1px solid #ddd;padding:4px 8px;font-size:10px;background:#fff8e1;">
            <strong>Referencia:</strong> FAC ${escapeHTML(String(pedido.factura_referenciada_id))}
            ${pedido.motivo_emision ? ' &mdash; ' + escapeHTML(pedido.motivo_emision) : ''}
           </td></tr>`
        : '';

    const condContado = !esCredito ? '&#9746;' : '&#9744;';
    const condCredito =  esCredito ? '&#9746;' : '&#9744;';

    const qrHtml = qrDataUrl
        ? `<img src="${qrDataUrl}" style="width:110px;height:110px;display:block;">`
        : `<div style="width:110px;height:110px;border:2px solid #000;display:flex;align-items:center;justify-content:center;font-size:9px;text-align:center;color:#666;">QR<br>SIFEN</div>`;

    const itemsHtml = _kudeItemsTable(pedido);

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>${tipoLbl} ${escapeHTML(numDoc)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;background:#fff;}
@page{margin:10mm;size:A4 portrait;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
.page{width:190mm;margin:0 auto;}
table.hdr{width:100%;border-collapse:collapse;border:2px solid #000;}
table.hdr td{vertical-align:top;padding:8px 10px;}
.td-l{width:55%;border-right:2px solid #000;text-align:center;}
.td-r{width:45%;text-align:center;}
.tipo-box{border:2px solid #000;padding:6px 8px;text-align:center;margin-top:6px;}
table.rec{width:100%;border-collapse:collapse;border:2px solid #000;border-top:none;}
table.rec td{padding:3px 8px;font-size:10px;border-bottom:1px solid #ddd;}
table.rec .lbl{font-weight:bold;width:28%;white-space:nowrap;}
.items-wrap{border:2px solid #000;border-top:none;overflow:hidden;}
.ftr{border:2px solid #000;border-top:none;padding:10px 12px;display:flex;gap:14px;align-items:flex-start;}
.cdc-box{background:#dce8f8;border:1px solid #aac4e8;padding:5px 10px;font-family:monospace;font-size:9px;font-weight:bold;word-break:break-all;margin:5px 0;border-radius:2px;}
.disc{border-top:1px solid #ccc;margin-top:8px;padding-top:7px;font-size:9px;color:#333;text-align:center;line-height:1.5;}
</style></head>
<body><div class="page">

<table class="hdr"><tr>
  <td class="td-l">
    ${logoHtml}
    <div style="font-size:13px;font-weight:900;line-height:1.3;margin-bottom:3px;">${escapeHTML(empresa.razonSocial||'HDV DISTRIBUCIONES E.A.S.')}</div>
    ${empresa.nombreFantasia && empresa.nombreFantasia !== empresa.razonSocial
        ? `<div style="font-size:10px;font-weight:bold;margin-bottom:2px;">${escapeHTML(empresa.nombreFantasia)}</div>` : ''}
    <div style="font-size:10px;line-height:1.6;">
      ${(empresa.direccion || empresa.telefono)
          ? `<div>${[empresa.direccion, empresa.telefono ? 'TELEF. '+empresa.telefono : ''].filter(Boolean).map(s=>escapeHTML(s)).join(' - ')}</div>`
          : ''}
      ${empresa.actividad ? `<div style="font-weight:bold;text-transform:uppercase;margin-top:3px;">${escapeHTML(empresa.actividad)}</div>` : ''}
    </div>
  </td>
  <td class="td-r">
    <div style="font-size:10px;text-align:right;line-height:1.8;margin-bottom:4px;">
      <div><strong>TIMBRADO N&deg; ${escapeHTML(empresa.timbrado||'')}</strong></div>
      ${feIni ? `<div>Fecha Inicio Vigencia: ${feIni}</div>` : ''}
      <div>RUC ${escapeHTML(empresa.ruc||'')}</div>
    </div>
    <div class="tipo-box">
      <div style="font-size:12px;font-weight:900;letter-spacing:.3px;">${tipoLbl}</div>
      <div style="font-size:13px;font-weight:900;letter-spacing:1px;margin-top:3px;">${escapeHTML(numDoc)}</div>
    </div>
  </td>
</tr></table>

<table class="rec">
  ${ncRefHtml}
  <tr>
    <td class="lbl">Fecha de emisi&oacute;n:</td>
    <td>${fechaStr}</td>
    <td class="lbl">Tipo de transacci&oacute;n:</td>
    <td>Venta de mercanc&iacute;a</td>
  </tr>
  <tr>
    <td class="lbl">RUC/Documento de Identidad N&deg;:</td>
    <td>${escapeHTML(rucCliente)}</td>
    <td class="lbl">Condici&oacute;n de venta:</td>
    <td>Contado ${condContado} &nbsp; Cr&eacute;dito ${condCredito}</td>
  </tr>
  <tr>
    <td class="lbl">Nombre o Raz&oacute;n Social:</td>
    <td colspan="3">${escapeHTML(nombreCliente)}</td>
  </tr>
  <tr>
    <td class="lbl">Direcci&oacute;n:</td>
    <td colspan="3">${escapeHTML(dirCliente)}</td>
  </tr>
  <tr>
    <td class="lbl">Tel&eacute;fono:</td>
    <td colspan="3">${escapeHTML(telCliente)}</td>
  </tr>
  <tr style="border-bottom:none;">
    <td class="lbl">Correo Electr&oacute;nico:</td>
    <td colspan="3">${escapeHTML(emailCliente)}</td>
  </tr>
</table>

<div class="items-wrap">${itemsHtml}</div>

<div class="ftr">
  <div style="flex-shrink:0;">${qrHtml}</div>
  <div style="flex:1;font-size:10px;padding-top:2px;">
    <div>Consulte la validez de esta ${tipoTxt} con el n&uacute;mero de CDC impreso abajo en:</div>
    <div style="color:#1a56b0;font-weight:bold;margin:2px 0;">https://ekuatia.set.gov.py/consultas/</div>
    <div class="cdc-box">CDC: ${escapeHTML(cdc || 'Sin CDC — documento local (no enviado al SET)')}</div>
    <div class="disc">
      <strong>ESTE DOCUMENTO ES UNA REPRESENTACI&Oacute;N GR&Aacute;FICA DE UN DOCUMENTO ELECTR&Oacute;NICO (XML)</strong><br>
      Informaci&oacute;n de inter&eacute;s del facturador electr&oacute;nico emisor.<br>
      Si su documento electr&oacute;nico presenta alg&uacute;n error, podr&aacute; solicitarlo dentro de las 72 horas
      siguientes a la emisi&oacute;n del presente documento, la cancelaci&oacute;n del mismo y la generaci&oacute;n de un nuevo comprobante.
    </div>
  </div>
</div>

</div></body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
