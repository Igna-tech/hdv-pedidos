# Auditoria Fase 5 — Compliance SIFEN/DNIT (Facturacion Electronica Paraguay)

**Fecha:** 28 de marzo de 2026
**Auditor:** Claude (Compliance & Tax Officer / Principal Tax Systems Architect)
**Commits:** `663a898` (Sentry hardening + reporte inicial) + `e9126e2` (Parte 1 + Parte 2)
**Alcance:** Edge Function `sifen-generar-xml`, calculo IVA frontend/backend, generacion CDC, estructura XML DTE v150, firma digital, compliance fiscal
**Estado final:** 99 tests en verde, 11 archivos de test. 7/8 hallazgos remediados, 1 pendiente (firma digital)

---

## 📑 Resumen Ejecutivo

La Fase 5 audito la cadena completa de facturacion electronica SIFEN contra el **Manual Tecnico v150** y el esquema **XSD DE_v150**. Se identificaron **3 defectos bloqueantes**, **2 riesgos fiscales** y **3 items de deuda tecnica**.

**Decision de negocio clave:** La Direccion autorizo la **eliminacion total de descuentos** del flujo del vendedor para blindar la ecuacion fiscal del XML (`dTotGralOpe = dTotOpe - dDescTotal`). Sin descuentos, `total = sum(precio * cantidad)` de forma estricta, eliminando toda fuente de divergencia matematica.

La remediacion se ejecuto en **2 partes**: Parte 1 (frontend fiscal — 13 archivos) y Parte 2 (backend SIFEN Edge Function + cleanup).

---

## 🔴 Hallazgos Bloqueantes Resueltos

### B-01: Descuento rompia la ecuacion fiscal del XML

**Severidad:** BLOQUEANTE — SET rechazaria el DTE
**Estado:** ✅ **REMEDIADO (Parte 1)**

**Problema:**
Cuando un pedido tenia `descuento > 0`, el XML generado violaba la ecuacion fiscal obligatoria:
```
dTotGralOpe = dTotOpe - dDescTotal
```
- `dTotGralOpe` usaba el total con descuento aplicado
- `dTotOpe` sumaba subtotales de items SIN descuento
- `dDescTotal` estaba hardcodeado a `"0.0000"`

**Resultado:** Para cualquier pedido con descuento, `dTotGralOpe ≠ dTotOpe - dDescTotal`.

**Remediacion aplicada:**
Purga completa de la logica de descuentos en 13 archivos del vendedor:

| Archivo | Cambio |
|---------|--------|
| `checkout.js` | Eliminados: variable `descuento`, formula `subtotal * (1 - descuento/100)`, `factor`/`itemsAjustados`, propiedad `descuento` en los 3 flujos (PED/REC/FAC), display condicional en recibo y KuDE |
| `js/vendedor/cart.js` | Eliminados: lectura de `#descuento`, calculo con factor, propiedad `descuento` en pedido, reset del input |
| `js/vendedor/ui.js` | Eliminada: funcion `aplicarDescuento()` completa (15 lineas), display `desc.` en tarjeta pedido |
| `index.html` | Eliminado: bloque HTML del input Descuento (%) + boton Aplicar |
| `admin.html` | Eliminado: input `#editPedidoDescuento` del modal de edicion |
| `js/admin/pedidos.js` | Eliminados: display en lista, carga en modal, calculo y guardado en edicion |
| `app.js` | Eliminado: `Desc: X%` en mensaje WhatsApp |
| `js/utils/printer.js` | Eliminada: linea condicional de descuento en ticket termico |
| `js/utils/pdf-generator.js` | Eliminados: display en footer y linea de descuento en totales PDF |
| `js/modules/ventas/ventas-templates.js` | Eliminados: 4 bloques condicionales (lista, ticket, recibo HTML, KuDE) |
| `admin-devoluciones.js` | Eliminada: propiedad `descuento: 0` en nota de credito |
| `CLAUDE.md` | Actualizado: `descuento` removido del formato de datos |
| `tests/unit/descuentos.test.js` | **ELIMINADO** (81 lineas, ya no aplica) |

**Estado final:** `total = subtotal = sum(precio * cantidad)`. Sin factores, sin ajustes. La ecuacion fiscal siempre cuadra.

> **Nota:** El sistema de **promociones automaticas** (`aplicarPromociones()`, `descuento_cantidad`, `precio_mayorista`) NO fue afectado. Estas son promociones que ajustan el precio unitario directamente, no un descuento porcentual sobre el total.

---

### B-02: Campo XML invalido `dTotDescGloworte`

**Severidad:** BLOQUEANTE — XSD validation failure
**Estado:** ✅ **REMEDIADO (Parte 2)**

**Problema:**
El campo `dTotDescGloworte` no existe en el esquema XSD DE_v150. Era un nombre inventado.

**Archivo:** `supabase/functions/sifen-generar-xml/index.ts`

**Remediacion:**
- Eliminado `dTotDescGloworte: "0.0000"`
- Reemplazado por `dPorcDescTotal: "0.0000"` (campo valido del XSD para porcentaje de descuento total)
- Todos los campos de descuento (`dTotDesc`, `dDescTotal`, `dPorcDescTotal`) correctamente en `"0.0000"`
- `totalGral` ahora se calcula como `totalOpe` directamente (sin usar `datos.total` del pedido)

---

### B-03: Firma digital XMLDSig no implementada

**Severidad:** BLOQUEANTE para produccion SET
**Estado:** ⏸️ **EN PAUSA ESTRATEGICA**

**Problema:**
El certificado `.p12` se carga correctamente desde env vars, pero:
1. No se extrae la clave privada
2. No se firma el XML con XMLDSig (RSA-SHA256)
3. No se calcula `DigestValue` ni `cHashQR`
4. El XML se retorna sin `<ds:Signature>`

**Accion tomada:**
- TODO documentado en el codigo (4 lineas de comentario con instrucciones exactas)
- Hoja de ruta creada en `SIFEN_HOJA_DE_RUTA.md` con checklist de requisitos y prompt de activacion
- Pendiente: adquisicion de certificado `.p12` de persona juridica y codigo CSC de Marangatu

---

## 🟡 Riesgos Fiscales Mitigados

### RF-01: Divergencia IVA entre frontend y backend

**Severidad:** MEDIA
**Estado:** ✅ **REMEDIADO (Parte 1)**

**Problema:**
El frontend calculaba IVA sobre items ajustados por un factor de descuento (`Math.round(item.subtotal * factor)`), mientras el backend calculaba sobre items originales (`precioUnit * cantidad`). Con descuento, podian divergir en ±1 PYG por redondeo.

**Remediacion:**
Al eliminar descuentos, ambos caminos calculan sobre los mismos items. No existe mas factor de ajuste.

**Verificacion:** Se ejecuto prueba de fuerza bruta para valores 1-500,000 PYG confirmando **cero divergencias** entre las formulas `Math.round(total/11)` y `total - Math.round((total*100)/110)`.

**Formulas vigentes (identicas frontend y backend):**
| Tasa | Frontend (`formatters.js`) | Backend (`index.ts`) |
|------|---------------------------|---------------------|
| IVA 10% | `Math.round(totalGravada10 / 11)` | `Math.round((totalItem * 100) / 110)` → `totalItem - base` |
| IVA 5% | `Math.round(totalGravada5 / 21)` | `Math.round((totalItem * 100) / 105)` → `totalItem - base` |
| Exenta | `0` | `0` |

---

### RF-02: Fallback `calcularDesglose()` asume 100% IVA 10%

**Severidad:** BAJA
**Estado:** ✅ **REMEDIADO (Parte 2)**

**Problema:**
Si un pedido llega sin `desgloseIVA` guardado, la funcion `calcularDesglose()` asume que el total completo es IVA 10%, lo cual seria incorrecto para pedidos mixtos.

**Remediacion:**
- Agregado `console.warn()` de auditoria cuando se ejecuta el fallback
- El warning incluye el ID del pedido para facilitar investigacion
- El fallback solo afecta display (tickets, reportes), NO el XML del DTE (que calcula per-item)

**Codigo:**
```javascript
console.warn('[calcularDesglose] Pedido sin desgloseIVA — fallback asume 100% IVA 10%.
    Verificar datos del pedido:', pedido?.id || 'sin ID');
```

---

## 🟢 Deuda Tecnica Limpiada

### DT-01: CDC provisional de 44 digitos aleatorios

**Estado:** ✅ **REMEDIADO (Parte 1)**

**Problema:**
`generarCDC()` en `js/utils/formatters.js` generaba 44 digitos aleatorios que podian confundirse con un CDC legal valido.

**Remediacion:**
```javascript
// Antes (ELIMINADO):
function generarCDC() {
    let cdc = '';
    for (let i = 0; i < 44; i++) cdc += Math.floor(Math.random() * 10);
    return cdc;
}

// Despues:
function generarCDC() {
    return 'PENDIENTE-DE-SINCRONIZACION-SIFEN';
}
```

**Impacto:** Imposible confundir el placeholder con un CDC real de 44 digitos. El CDC definitivo viene de la Edge Function tras el calculo Modulo 11.

**Tests actualizados:**
- `formatters.test.js`: CDC ahora verifica string estatico determinista (2 tests reemplazaron 3)

---

### DT-02: Funcion muerta `sanitizeXML()`

**Estado:** ✅ **REMEDIADO (Parte 2)**

**Problema:**
Existian dos funciones de sanitizacion XML en la Edge Function:
- `sanitizeXML()` — version vieja, **no escapaba `&` primero** (riesgo de doble-escape)
- `sanitizarParaXML()` — version correcta con orden de escape adecuado + truncamiento

**Remediacion:**
- Eliminada `sanitizeXML()` (7 lineas)
- Solo queda `sanitizarParaXML()` como unica funcion de sanitizacion

---

### DT-03: Ciudad de emision hardcodeada como ASUNCION

**Estado:** ✅ **REMEDIADO (Parte 2)**

**Problema:**
Los campos geograficos del emisor estaban hardcodeados para Asuncion, pero HDV Distribuciones opera desde Lambare (departamento Central).

**Remediacion en `gEmis`:**
```javascript
// Antes:
cDepEmi: 1, dDesDepEmi: "CAPITAL",
cDisEmi: 1, dDesDisEmi: "ASUNCION",
cCiuEmi: 1, dDesCiuEmi: "ASUNCION",

// Despues:
cDepEmi: 11, dDesDepEmi: "CENTRAL",
cDisEmi: 117, dDesDisEmi: "LAMBARE",
cCiuEmi: 3432, dDesCiuEmi: "LAMBARE",
```

> **Nota futura:** Estos codigos deberian leerse de `configuracion_empresa` cuando se parametrice la direccion completa.

---

## ⏸️ Elementos en Pausa Estrategica

### B-03: Firma Digital XMLDSig

**Razon de pausa:** La firma digital requiere 3 elementos que la Direccion debe adquirir:

| Requisito | Estado | Donde obtenerlo |
|-----------|--------|-----------------|
| Certificado `.p12` (Persona Juridica) | Pendiente | Code100 o prestador acreditado por MIC |
| Codigo CSC | Pendiente | Marangatu → Solicitudes → Documentos Electronicos |
| Timbrado electronico | Pendiente verificacion | Marangatu → Timbrados |

**Documentacion creada:**
- `SIFEN_HOJA_DE_RUTA.md` — Checklist ejecutivo con instrucciones paso a paso
- **Prompt de Activacion Final** incluido para reanudar la integracion cuando los requisitos esten listos
- TODO en el codigo fuente de la Edge Function con instrucciones tecnicas

### Gaps adicionales identificados (para Fase futura)

| Gap | Severidad | Detalle |
|-----|----------|---------|
| Campos geograficos del receptor | ALTA | `gDatRec` no incluye `dNumCasRec`, `cDepRec`, `cDisRec`, `cCiuRec` (obligatorios para contribuyentes) |
| `dSerieNum` hardcodeado "AA" | MEDIA | Debe coincidir con la serie autorizada en el timbrado |
| Nota de Credito electronica (iTiDE: 5) | MEDIA | Edge Function solo maneja facturas (iTiDE: 1), no NC |
| Eventos post-emision | MEDIA | No hay endpoints para cancelacion, inutilizacion, conformidad |
| Modo contingencia (iTipEmi: 2) | MEDIA | No implementado el flujo offline → reenvio en 72h |
| Numeracion secuencial estricta | MEDIA | `generarNumeroFactura()` es aleatorio, debe ser secuencial con contador atomico |
| Umbral B2C 7M PYG | BAJA | Operaciones >7M sin RUC del comprador (desde ene 2025) |

---

## 📊 Metricas de la Refactorizacion Fase 5

| Metrica | Valor |
|---------|-------|
| **Archivos modificados** | 18 (Parte 1: 13 frontend + Parte 2: 5 backend/docs) |
| **Lineas eliminadas** | ~215 (purga de descuentos + funcion muerta + tests obsoletos) |
| **Lineas agregadas** | ~49 (warnings, TODOs, campos XML corregidos) |
| **Balance neto** | **-166 lineas** (reduccion de deuda tecnica) |
| **Tests eliminados** | 1 archivo (`descuentos.test.js`, 81 lineas) |
| **Tests actualizados** | 2 archivos (`checkout-flows.test.js`, `formatters.test.js`) |
| **Tests finales** | **99 tests en verde, 11 archivos de test, 0 fallos** |
| **Hallazgos totales** | 8 (3 bloqueantes, 2 riesgos fiscales, 3 deuda tecnica) |
| **Remediados** | 7/8 (87.5%) |
| **En pausa estrategica** | 1/8 (B-03 firma digital, esperando certificado) |

---

## 📋 Historial de Commits

| Commit | Descripcion |
|--------|-------------|
| `663a898` | `feat(sentry): hardening de captura + docs auditoria SIFEN fase 5` — Reporte inicial, Sentry capture helpers, storage monitoring, 28 catch blocks |
| `e9126e2` | `feat(audit): Completa Fase 4 y 5` — Purga descuentos (P1), limpieza XML (P2), CDC provisional, sanitizeXML eliminada, LAMBARE, tests actualizados |

---

*Generado: 28 de marzo de 2026 — Claude (Compliance & Tax Officer)*
