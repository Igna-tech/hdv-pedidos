# Auditoria de Flujo de Datos End-to-End (Vendedor → Admin)

**Fecha:** 2026-03-25
**Alcance:** Mapeo completo de escrituras del vendedor, verificacion de transporte a Supabase, auditoria de visibilidad en panel admin, cumplimiento SIFEN v150, reparaciones aplicadas.

---

## 1. Operaciones de Escritura del Vendedor

### 1.1 Pedidos (checkout.js)

El vendedor genera pedidos mediante 3 flujos distintos:

| Flujo | Prefijo ID | Estado inicial | Campos extra |
|-------|-----------|---------------|--------------|
| Pedido pendiente | `PED-` | `pedido_pendiente` | — |
| Recibo interno | `REC-` | `cobrado_sin_factura` | `numRecibo` |
| Factura mock | `FAC-` | `facturado_mock` | `numFactura`, `cdc` |

**Estructura completa del pedido:**
```
id, fecha, cliente{id,nombre,ruc,telefono,direccion}, items[{productoId,nombre,presentacion,
precio,cantidad,subtotal,precioEspecial,tipo_impuesto}], subtotal, descuento, total, tipoPago,
notas, estado, tipo_comprobante, desgloseIVA{iva10,iva5,exenta,totalIVA}, vendedor_id, sincronizado
```

**Ruta de datos:** `checkout.js` → `HDVStorage('hdv_pedidos')` → `SyncManager` → `guardarPedido()` → `SupabaseService.upsertPedido()` → tabla `pedidos` (columna `datos` JSONB)

### 1.2 Gastos del Vendedor (app.js)

```
{id, concepto, monto, fecha}
```
**Ruta:** `app.js` → `HDVStorage('hdv_gastos')` → `guardarGastos()` → `SupabaseService.upsertConfig('gastos_vendedor', datos)` → tabla `configuracion`

### 1.3 Rendiciones (app.js)

```
{id, semana, fecha, contado, gastos, aRendir, estado, pedidos[]}
```
**Ruta:** `app.js` → `HDVStorage('hdv_rendiciones')` → `guardarRendiciones()` → `SupabaseService.upsertConfig('rendiciones', datos)` → tabla `configuracion`

### 1.4 Clientes Pendientes (app.js)

```
{id, nombre, razon_social, telefono, zona, direccion, ruc, encargado, estado:'pendiente_aprobacion', fechaSolicitud}
```
**Ruta:** Almacenado como parte del catalogo local. Sync via `guardarCatalogo()` → `SupabaseService.upsertClientes()` → tabla `clientes`

### 1.5 Backups Locales (app.js)

- Backup JSON sanitizado (sin `costo`, sin `precios_personalizados`, RUC truncado)
- Solo descarga local, NO se sube a Supabase

---

## 2. Transporte a Supabase (SyncManager)

**Archivo:** `js/services/sync.js`

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Trigger | OK | `online` event + arranque de app |
| Mutex | OK | `this._syncing` flag impide concurrencia |
| Backoff | OK | 5s → 15s → 30s → 60s progresivo |
| Pre-sync auth check | OK | `verificar_estado_cuenta()` RPC antes de cada sync |
| Kill Switch purge | OK | Si `activo=false` → purga IndexedDB + signOut |
| Filtro de sync | OK | Solo sincroniza pedidos con `sincronizado: false` |
| Post-sync marca | OK | Marca `sincronizado: true` tras exito |

**Veredicto:** El transporte es robusto. No hay perdida de datos en condiciones normales.

---

## 3. Puntos Ciegos Detectados en Admin (ANTES de reparaciones)

### 3.1 CRITICOS

| # | Punto ciego | Impacto | Reparado |
|---|------------|---------|----------|
| B1 | **vendedor_id invisible** en tarjetas de pedidos | Admin no sabe QUIEN levanto cada pedido | SI |
| B2 | **alerta_fraude invisible** en vista de pedidos | Fraudes solo visibles en seccion Forense separada | SI |
| B3 | **Filtro de estado hardcodeado** a `pedido_pendiente` | Admin no puede ver pedidos entregados, cobrados, etc. | SI |

### 3.2 IMPORTANTES

| # | Punto ciego | Impacto | Reparado |
|---|------------|---------|----------|
| B4 | **tipo_comprobante ausente** | No se distingue PED/REC/FAC visualmente | SI |
| B5 | **desgloseIVA oculto** | Desglose fiscal no visible en tarjeta | SI |
| B6 | **CSV export incompleto** | Faltaba: vendedor, notas, tipo, alerta_fraude | SI |
| B7 | **editado/fechaEdicion invisible** | No se sabe si un pedido fue modificado post-creacion | SI |

### 3.3 MENORES (no reparados — requieren decision de negocio)

| # | Punto ciego | Nota |
|---|------------|------|
| B8 | Datos SIFEN (cdc, xml, qr_url) siloed en seccion Ventas | Arquitecturalmente correcto — SIFEN es post-facturacion |
| B9 | precios_personalizados aplicados pero no destacados visualmente | El precio final es correcto; el "por que" requiere lookup |
| B10 | Filtro por vendedor no existia | SI — agregado select `filtroVendedor` |

---

## 4. Reparaciones Aplicadas

### 4.1 admin.html — Filtros expandidos (linea 513+)

**Agregados:**
- `<select id="filtroVendedor">` — poblado dinamicamente desde tabla `perfiles`
- `<select id="filtroEstado">` — todas las opciones de estado, default `pedido_pendiente`

### 4.2 js/admin/pedidos.js — Tarjeta de pedido enriquecida

**Funcion `crearTarjetaPedidoAdmin()` ahora muestra:**
1. **Vendedor** — icono user + nombre del vendedor (lookup desde `perfiles`)
2. **Alerta de fraude** — badge rojo "FRAUDE" con tooltip del detalle
3. **Tipo comprobante** — badge PED/REC/FAC con color diferenciado
4. **Badge editado** — icono lapiz ambar si `p.editado === true`
5. **Desglose IVA** — IVA 10%, 5%, Exenta inline en la linea de pago/total
6. **Estado (cualquier)** — ya no limitado a pendientes

**Funcion `aplicarFiltrosPedidos()` actualizada:**
- Respeta filtro de vendedor (`filtroVendedor`)
- Respeta filtro de estado (`filtroEstado`) — default "Pendiente" pero seleccionable
- Mantiene compatibilidad con estados legacy (`pendiente` = `pedido_pendiente`)

**Funcion `exportarExcelPedidos()` ampliada:**
- Columnas nuevas: Vendedor, Tipo, Notas, Alerta Fraude

**Funcion `poblarFiltroVendedor()` agregada:**
- Carga perfiles desde Supabase al iniciar seccion pedidos
- Cache en `_pedidosPerfilesCache` (reutilizado por tarjetas y CSV)

### 4.3 dist/tailwind.css — Recompilado

Clases nuevas utilizadas (`bg-amber-100`, `text-amber-700`, `bg-indigo-100`, etc.) ya estaban en el purge de Tailwind.

---

## 5. Cumplimiento SIFEN v150

**Fuente:** `docs-sifen/Manual Tecnico v150.pdf`, XSD schemas en `docs-sifen/`

### 5.1 Edge Function `sifen-generar-xml`

| Requisito SIFEN | Estado | Detalle |
|----------------|--------|---------|
| CDC 44 digitos | OK | Modulo 11 real implementado |
| XML DTE v150 | OK | Namespace y estructura correctos |
| Anti-XXE | OK | `sanitizarParaXML()` escapa `& < > " '` |
| Rate limit | OK | 10 req/min por usuario |
| Anti-doble facturacion | OK | Rechaza pedidos con `sifen_cdc` existente |
| SERVICE_ROLE para escritura | OK | Privilegios divididos correctamente |

### 5.2 Campos requeridos por SIFEN presentes en pedido

| Campo SIFEN | Fuente en pedido | Estado |
|------------|-----------------|--------|
| RUC emisor | `configuracion_empresa.ruc_empresa` | OK |
| Razon social emisor | `configuracion_empresa.razon_social` | OK |
| Timbrado | `configuracion_empresa.timbrado_numero` | OK |
| RUC receptor | `pedido.cliente.ruc` | OK |
| Nombre receptor | `pedido.cliente.nombre` | OK |
| Items con precio | `pedido.items[].precio` | OK |
| Items con cantidad | `pedido.items[].cantidad` | OK |
| tipo_impuesto por item | `pedido.items[].tipo_impuesto` | OK |
| Desglose IVA | `pedido.desgloseIVA` | OK |
| Fecha emision | `pedido.fecha` (server-side via trigger) | OK |

### 5.3 Sugerencias de mejora SIFEN

1. **Firma digital pendiente**: El certificado .p12 esta preparado en env vars pero la firma digital real NO esta implementada. Esto es bloqueante para produccion SIFEN.
2. **Ambiente de pruebas SET**: No hay evidencia de testing contra el endpoint de pruebas del SET (`https://sifen-test.set.gov.py`).
3. **Validacion XSD local**: Los XSD estan en `docs-sifen/` pero no hay validacion automatizada pre-envio.

---

## 6. Validacion de Tests

```
Test Files: 4 passed (4)
Tests:     46 passed (46)
```

Todas las pruebas unitarias existentes siguen pasando tras las reparaciones. Los cambios son puramente en la capa de presentacion admin (HTML + JS de renderizado), sin modificar logica de negocio ni funciones utilitarias testeadas.

---

## 7. Resumen Ejecutivo

| Metrica | Valor |
|---------|-------|
| Operaciones de escritura mapeadas | 5 (pedidos 3 flujos, gastos, rendiciones) |
| Puntos ciegos detectados | 10 |
| Puntos ciegos reparados | 7 |
| Puntos ciegos pendientes (decision negocio) | 3 |
| Tests afectados | 0 (46/46 passing) |
| Cumplimiento SIFEN v150 | Alto (firma digital pendiente) |
| Archivos modificados | 3 (admin.html, js/admin/pedidos.js, dist/tailwind.css) |
