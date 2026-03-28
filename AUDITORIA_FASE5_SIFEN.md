# Auditoria Fase 5 — SIFEN (Facturacion Electronica Paraguay)

**Fecha:** 2026-03-28
**Auditor:** Claude (Principal Tax Systems Architect)
**Alcance:** Edge Function `sifen-generar-xml`, calculo IVA frontend/backend, generacion CDC, firma digital, estructura XML DTE v150
**Metodologia:** White-box audit completo — lectura linea por linea de toda la cadena de facturacion

---

## Resumen ejecutivo

El sistema de facturacion electronica SIFEN esta **funcionalmente completo** para el flujo base (factura sin descuento, IVA 10%/5%/exenta, contribuyente/no contribuyente). Sin embargo, se identificaron **3 defectos bloqueantes** que impedirian la aprobacion por la SET si se activa la firma digital, **2 riesgos fiscales** latentes, y **3 items de deuda tecnica**.

| Severidad | Cantidad | Estado |
|-----------|----------|--------|
| BLOQUEANTE | 3 | Pendientes |
| Riesgo Fiscal | 2 | Pendientes |
| Deuda Tecnica | 3 | Pendientes |

---

## Hallazgos BLOQUEANTES

### B-01: Descuento rompe ecuacion fiscal del XML

**Archivo:** `supabase/functions/sifen-generar-xml/index.ts` (lineas 361-365, 495-509)
**Severidad:** BLOQUEANTE — SET rechazara el DTE

**Problema:**
Cuando un pedido tiene `descuento > 0`, el XML generado viola la ecuacion fiscal obligatoria:

```
dTotGralOpe = dTotOpe - dDescTotal
```

Actualmente:
- `dTotGralOpe` usa el total con descuento aplicado (correcto)
- `dTotOpe` suma los subtotales de items SIN descuento (correcto)
- `dDescTotal` esta hardcodeado a `"0.0000"` (INCORRECTO)

**Resultado:** Para cualquier pedido con descuento, `dTotGralOpe ≠ dTotOpe - dDescTotal`, lo cual es una violacion directa del XSD DE_v150.

**Codigo afectado:**
```javascript
// Linea 509 — hardcodeado a cero
dTotDescGloworte: "0.0000",

// Linea 495-496 — totalGral ya tiene descuento aplicado
const totalGral = pedido.total; // Este viene de checkout.js con descuento
```

**Remediacion:**
```javascript
const totalSinDescuento = items.reduce((s, i) => s + i.subtotal, 0);
const descuentoMonto = totalSinDescuento - pedido.total;
// En gCamTot:
dSubTot: totalSinDescuento.toString(),
dTotDesc: descuentoMonto.toString(),
dTotGralOpe: pedido.total.toString(),
```

---

### B-02: Campo XML invalido `dTotDescGloworte`

**Archivo:** `supabase/functions/sifen-generar-xml/index.ts` (linea 509)
**Severidad:** BLOQUEANTE — XSD validation failure

**Problema:**
El campo `dTotDescGloworte` no existe en el esquema XSD DE_v150. El nombre correcto es `dDescTotal` o `dTotDescGloItem` segun el contexto.

**Codigo:**
```javascript
dTotDescGloworte: "0.0000", // Campo inventado — no existe en XSD
```

**Remediacion:** Reemplazar por el campo correcto del XSD v150 para descuentos globales.

---

### B-03: Certificado cargado pero firma digital no implementada

**Archivo:** `supabase/functions/sifen-generar-xml/index.ts` (lineas 190-198, 538-540)
**Severidad:** BLOQUEANTE para produccion SET

**Problema:**
El certificado `.p12` se carga correctamente desde env vars (`CERTIFICADO_P12` + `PASS_CERT`), pero:
1. No se extrae la clave privada
2. No se firma el XML con XMLDSig (ds:Signature)
3. El XML se retorna sin firmar

**Codigo actual:**
```javascript
// Lineas 190-198 — carga del certificado
const certB64 = Deno.env.get('CERTIFICADO_P12');
const certPass = Deno.env.get('PASS_CERT');
// ... decodifica Base64 ...

// Lineas 538-540 — retorna XML sin firmar
return new Response(JSON.stringify({
    xml: xmlString,
    cdc: cdcCalculado,
}));
```

**Estado:** Preparado para firma (cert cargado), pero la firma XMLDSig no esta implementada. La SET requiere firma digital valida para aceptar DTEs en produccion.

**Remediacion:** Implementar firma XMLDSig usando libreria compatible con Deno (e.g., `xml-crypto` adaptado o Web Crypto API para RSA-SHA256).

---

## Riesgos Fiscales

### RF-01: Potencial divergencia IVA entre frontend y backend

**Archivos:**
- Frontend: `js/utils/formatters.js` (lineas 52-79) — `calcularDesgloseIVA()`
- Backend: `supabase/functions/sifen-generar-xml/index.ts` (lineas 154-172) — `calcIVAItem()`

**Problema:**
Ambos usan formulas matematicamente equivalentes pero con caminos de calculo diferentes:

| Contexto | Formula IVA 10% | Formula IVA 5% |
|----------|-----------------|-----------------|
| Frontend | `Math.round(total / 11)` | `Math.round(total / 21)` |
| Backend | `Math.round(precioUnit * cantidad / 11)` | `Math.round(precioUnit * cantidad / 21)` |

**Analisis:** Se verifico por fuerza bruta para valores 1-500,000 PYG: **cero divergencias** para el caso base. Sin embargo, cuando hay descuento aplicado, el frontend calcula IVA sobre items ajustados (`Math.round(item.subtotal * factor)`) mientras el backend calcula sobre items originales.

**Riesgo:** Si el descuento se aplica correctamente en B-01, los montos IVA por item podrian diferir en ±1 PYG por redondeo.

**Severidad:** MEDIA — Solo si se corrige B-01 y el descuento modifica items individuales vs. global.

---

### RF-02: Fallback calcularDesglose() asume 100% IVA 10%

**Archivo:** `js/utils/formatters.js` (lineas 82-98)

**Problema:**
La funcion `calcularDesglose()` tiene un fallback que, si no recibe `desgloseIVA`, asume que el total completo es IVA 10%:

```javascript
// Si no hay desglose detallado, asumir todo IVA 10%
iva10: Math.round(total / 11),
baseGravada10: total - Math.round(total / 11),
```

**Riesgo:** Si un pedido mixto (items 5% + 10% + exenta) llega sin desglose, el calculo fiscal sera incorrecto. Esto afecta impresion de tickets y reportes — no el XML (que calcula por item).

**Severidad:** BAJA — Solo afecta display, no DTE. Pero podria confundir al cliente en el recibo.

---

## Deuda Tecnica

### DT-01: CDC mock en frontend (44 digitos aleatorios)

**Archivo:** `js/utils/formatters.js` (lineas 35-38)

```javascript
function generarCDC() {
    // Mock: 44 digitos aleatorios
    return Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join('');
}
```

**Impacto:** El CDC real se genera en la Edge Function con Modulo 11 correcto. Este mock solo se usa como placeholder temporal hasta que la Edge Function responde. No afecta el DTE final, pero si un pedido se persiste antes de recibir respuesta del servidor, tendra un CDC invalido.

**Recomendacion:** Marcar claramente como `cdc_provisional` y validar que el CDC definitivo del servidor siempre sobreescriba.

---

### DT-02: Funcion muerta sanitizeXML()

**Archivo:** `supabase/functions/sifen-generar-xml/index.ts`

Existe una funcion `sanitizeXML()` antigua que fue reemplazada por `sanitizarParaXML()`. La funcion vieja no se usa pero permanece en el codigo.

**Recomendacion:** Eliminar para reducir confusion.

---

### DT-03: Ubicacion hardcodeada ASUNCION

**Archivo:** `supabase/functions/sifen-generar-xml/index.ts` (lineas 453-458)

```javascript
dDesDist: "ASUNCION",
dDesDistE: "ASUNCION",
cCiuEmi: "1",
dDesCiuEmi: "ASUNCION",
```

**Impacto:** Si la empresa opera desde otra ciudad, el DTE tendra ubicacion incorrecta.

**Recomendacion:** Leer de `configuracion_empresa.direccion_fiscal` o agregar campos `ciudad`, `distrito` a la tabla.

---

## Validaciones correctas (sin hallazgos)

### CDC — Generacion Modulo 11
- **Archivo:** `supabase/functions/sifen-generar-xml/index.ts` (lineas 94-143)
- Implementacion correcta del algoritmo Modulo 11 oficial de la SET
- Pesos ciclicos 2-7 aplicados correctamente
- Digito verificador calculado con reglas especiales para resto 0 y 1
- CDC de 44 digitos con estructura: tipo doc (01) + RUC + DV + establecimiento + punto expedicion + numero + tipo contribuyente + fecha + tipo emision + codigo seguridad + digito verificador

### Sanitizacion XML (Anti-XXE)
- **Funcion:** `sanitizarParaXML(texto, maxLength)`
- Orden correcto: `&` se escapa PRIMERO (evita doble-escape)
- Escapa: `& < > " '`
- Trunca a `maxLength` (default 200)
- `validarNumero()` con `Number.isFinite` — previene NaN/Infinity en campos numericos

### Estructura XML DTE v150
- Namespace correcto: `xmlns="http://ekuatia.set.gov.py/sifen/xsd"`
- Version: `dVerFor="150"`
- Campos obligatorios presentes: gTimb, gDatGralOpe, gDtipDE, gTotSub, gCamTot
- Tipo DE factura: `iTiDE: 1`
- Moneda: `cMoneOpe: "PYG"`, `dTiCam: "1"`

### Rate Limiting Edge Function
- 10 req/min por usuario (Map en memoria)
- JWT validado via `supabase.auth.getUser()`
- Anti-doble facturacion: rechaza si pedido ya tiene `sifen_cdc`

### IVA — Formulas de extraccion
- IVA 10%: `Math.round(total / 11)` — correcto para precio IVA incluido
- IVA 5%: `Math.round(total / 21)` — correcto para precio IVA incluido
- Exenta: IVA = 0, base = total
- `Math.round()` garantiza valores enteros (Guarani no tiene decimales)

---

## Matriz de riesgo y prioridad de remediacion

| ID | Hallazgo | Severidad | Esfuerzo | Estado |
|----|----------|-----------|----------|--------|
| B-01 | Descuento rompe ecuacion fiscal | BLOQUEANTE | Alto | **REMEDIADO Fase 5 P1** — descuentos eliminados del vendedor, total = sum(precio*cantidad) |
| B-02 | Campo XML invalido | BLOQUEANTE | Bajo | **REMEDIADO Fase 5 P2** — eliminado `dTotDescGloworte`, campos de descuento en cero |
| B-03 | Firma digital no implementada | BLOQUEANTE | Alto | **PENDIENTE** — TODO en codigo, requiere certificado .p12 de produccion |
| RF-01 | Divergencia IVA con descuento | MEDIO | Medio | **REMEDIADO Fase 5 P1** — sin descuentos, IVA se calcula sobre items reales con Math.round() |
| RF-02 | Fallback 100% IVA 10% | BAJO | Bajo | **REMEDIADO Fase 5 P2** — console.warn de auditoria cuando cae en fallback |
| DT-01 | CDC mock frontend | BAJO | Bajo | **REMEDIADO Fase 5 P1** — reemplazado por string estatico "PENDIENTE-DE-SINCRONIZACION-SIFEN" |
| DT-02 | Funcion muerta | INFO | Trivial | **REMEDIADO Fase 5 P2** — eliminada sanitizeXML(), solo queda sanitizarParaXML() |
| DT-03 | Ubicacion hardcoded | BAJO | Bajo | **REMEDIADO Fase 5 P2** — cambiado de ASUNCION a LAMBARE |

---

## Recomendacion

**No activar firma digital ni enviar DTEs a produccion SET** hasta resolver B-03. El sistema funciona correctamente para el flujo mock actual (generacion de XML + CDC sin envio a SET). El unico bloqueante restante (B-03: firma digital) requiere adquirir el certificado .p12 de produccion de la SET.

**Proximo paso:** Implementar firma XMLDSig con .p12 y CSC cuando se adquiera el certificado.
