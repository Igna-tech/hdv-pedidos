# AUDITORIA DE SEGURIDAD V3 — Amenazas Internas (Insider Threats)
**Fecha:** 2026-03-19
**Auditor:** Claude Opus 4.6 (Insider Threat Analyst / Forense)
**Metodologia:** Analisis de RLS policies, triggers, constraints, logica de negocio y edge-cases offline
**Alcance:** Manipulacion de estados, exfiltracion de datos entre vendedores, fraude de fechas/descuentos/creditos, evasion de trigger de precios
**Perfil del atacante:** Vendedor con JWT activo, acceso a DevTools y conocimiento de la API Supabase
**Notion:** https://www.notion.so/32848624596e81388598edf244e17919

---

## RESUMEN EJECUTIVO

| Severidad | Cantidad |
|-----------|----------|
| CRITICO   | 2        |
| ALTO      | 3        |
| MEDIO     | 3        |
| BAJO      | 2        |
| **Total** | **10**   |

> Las dos vulnerabilidades mas graves permiten a un vendedor **(1) modificar el JSONB de un pedido ya facturado** via `upsert` directo (sin restriccion de estado) y **(2) leer la base completa de clientes** incluyendo RUC, telefono y precios personalizados de TODOS los vendedores. Ambas son explotables hoy con la consola del navegador.

---

## CRITICO

### V3-C01: Vendedor puede mutar pedidos en cualquier estado via `upsert` directo ✅ REMEDIADO 2026-03-19

**Evidencia RLS:**
```
pedidos_update: qual = (es_admin() OR (vendedor_id = auth.uid()))
```
No hay restriccion por `estado`. No hay CHECK constraint en la columna `estado`. No hay trigger que impida transiciones.

**Vector de ataque:**
1. Vendedor abre DevTools → Console
2. Ejecuta:
```javascript
await supabaseClient.from('pedidos').update({
  datos: { ...datosManipulados, items: itemsCambiados, total: 500000 },
  estado: 'pedido_pendiente'
}).eq('id', 'FAC-1234-abcd')
```
3. Un pedido ya `facturado_mock` o `entregado` vuelve a `pedido_pendiente` con items/totales diferentes
4. Admin ve datos inconsistentes vs. la factura ya emitida

**Impacto:** Fraude contable, destruccion de trazabilidad fiscal, pedidos facturados que "desaparecen" o cambian de monto.

**Nota:** El RPC `actualizar_estado_pedido` SI valida ownership, pero NO valida transiciones de estado. Y el vendedor puede bypasear el RPC completamente usando `.update()` directo, que pasa por RLS (permitido) pero no por el RPC.

**Solucion propuesta:**
```sql
-- Trigger que bloquea mutacion de pedidos en estados terminales
CREATE OR REPLACE FUNCTION public.bloquear_mutacion_pedido_terminal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Estados terminales: no se permite UPDATE por vendedor
  IF OLD.estado IN ('facturado_mock', 'nota_credito_mock', 'cobrado_sin_factura')
    AND NOT (SELECT rol = 'admin' FROM public.perfiles WHERE id = auth.uid())
  THEN
    RAISE EXCEPTION 'No se puede modificar un pedido en estado %', OLD.estado;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bloquear_mutacion_terminal
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion_pedido_terminal();
```

---

### V3-C02: Tabla `clientes` SELECT con `qual = true` — exfiltracion masiva de cartera ✅ REMEDIADO 2026-03-19

**Evidencia RLS:**
```
clientes_select: qual = true
```
TODOS los usuarios autenticados (vendedores incluidos) pueden leer TODOS los clientes: nombre, razon social, RUC completo, telefono, direccion, zona, precios_personalizados (JSONB con descuentos por cliente).

**Vector de ataque:**
```javascript
// Desde consola del vendedor
const { data } = await supabaseClient.from('clientes').select('*')
console.log(JSON.stringify(data)) // Toda la cartera con precios secretos
```

**Impacto:** Un vendedor que renuncia puede llevarse la base completa de clientes con precios personalizados (inteligencia comercial sensible). Puede vender esa informacion a la competencia.

**Nota de contexto:** Esto puede ser *intencional* si todos los vendedores necesitan ver todos los clientes para poder venderles. Si es asi, la mitigacion es eliminar `precios_personalizados` del SELECT del vendedor.

**Solucion propuesta:** Crear una VIEW `clientes_vendedor` que excluya `precios_personalizados`, o usar column-level security:
```sql
-- Opcion 1: RLS mas restrictivo con campo 'encargado'
DROP POLICY clientes_select ON clientes;
CREATE POLICY clientes_select ON clientes FOR SELECT USING (
  es_admin() OR encargado IS NULL OR encargado = (SELECT nombre_completo FROM perfiles WHERE id = auth.uid())
);

-- Opcion 2: Si TODOS los vendedores deben ver TODOS los clientes,
-- crear VIEW sin precios_personalizados y exponer esa VIEW en lugar de la tabla
```

---

## ALTO

### V3-A01: Fraude de fechas — servidor confia en `fecha` del celular ✅ REMEDIADO 2026-03-19

**Evidencia codigo** (`checkout.js:95`, `upsertPedido` en `services/supabase.js:53`):
```javascript
fecha: new Date().toISOString()  // Viene del reloj del celular
row.fecha = pedido.fecha          // Se guarda tal cual
```

La columna `pedidos.fecha` es tipo `TEXT` sin default server-side. El campo `creado_en` SI tiene `DEFAULT now()`, pero `fecha` es el campo que se usa para reportes, comisiones y filtros.

**Vector de ataque:**
1. Vendedor cambia la fecha/hora de su tablet a hace 30 dias
2. Crea pedidos → `fecha` = mes anterior
3. Los pedidos aparecen en el reporte del mes anterior
4. Cobra comisiones del mes pasado (si el cierre ya se calculo, manipula el proximo calculo)

**Impacto:** Fraude de comisiones, reportes contables inconsistentes, cierre mensual corrupto.

**Solucion:**
```sql
-- Trigger que fuerza fecha server-side, ignorando la del cliente
CREATE OR REPLACE FUNCTION public.forzar_fecha_servidor()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- En INSERT: siempre usar fecha del servidor
  IF TG_OP = 'INSERT' THEN
    NEW.fecha := to_char(NOW() AT TIME ZONE 'America/Asuncion', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  END IF;
  RETURN NEW;
END;
$$;
```

---

### V3-A02: Vendedor puede borrar sus propios pedidos — destruccion de evidencia ✅ REMEDIADO 2026-03-19

**Evidencia RLS:**
```
pedidos_delete: qual = (es_admin() OR (vendedor_id = auth.uid()))
```

**Vector de ataque:**
```javascript
await supabaseClient.from('pedidos').delete().eq('id', 'PED-1234-abcd')
```
Un vendedor puede borrar pedidos que ya fueron vistos por el admin, incluso facturados.

**Impacto:** Destruccion de trazabilidad. Pedidos facturados borrados = descuadre contable.

**Solucion:** Revocar DELETE para vendedores:
```sql
DROP POLICY pedidos_delete ON pedidos;
CREATE POLICY pedidos_delete ON pedidos FOR DELETE USING (es_admin());
```

---

### V3-A03: Evasion del trigger de precios via campo `descuento` ✅ REMEDIADO 2026-03-19

**Evidencia trigger** (`validar_precios_pedido`): Solo valida `item->>'precio'` contra catalogo. NO valida el campo `descuento` del pedido ni recalcula el `total`.

**Vector de ataque:**
```javascript
// Poner precios al 51% (pasa el trigger) + descuento 99% en el JSONB
const pedido = {
  items: [{ productoId: 'X', precio: 76000, subtotal: 76000, cantidad: 1 }], // 51% de 150000
  descuento: 99,
  total: 760 // 76000 * 0.01
};
```
El trigger ve precio 76000 vs catalogo 150000 → 50.6% → PASA. Pero el total real es Gs. 760 por el descuento.

**Impacto:** Sangrado financiero progresivo. El trigger no detecta nada.

**Solucion:** El trigger debe validar el `total` del pedido contra la suma de items × precios de catalogo, aplicando un tope maximo de descuento (ej: 30%):
```sql
-- Agregar al trigger existente:
IF (NEW.datos->>'descuento')::NUMERIC > 30 THEN
  hay_fraude := true;
END IF;
```

---

## MEDIO

### V3-M01: Vendedor puede escribir en `configuracion` docs `pagos_credito` y `rendiciones` ✅ REMEDIADO 2026-03-19

**Evidencia RLS:**
```
config_update: qual = es_admin() OR (doc_id = ANY (ARRAY['gastos_vendedor', 'rendiciones', 'pagos_credito', 'clientes_pendientes']))
```

**Vector de ataque:** Un vendedor puede ejecutar:
```javascript
await supabaseClient.from('configuracion')
  .upsert({ doc_id: 'pagos_credito', datos: { /* pagos falsos */ } })
```
Puede registrar pagos de credito ficticios, marcar deudas como pagadas, o borrar el historial de rendiciones.

**Impacto:** Fraude contable en creditos y rendiciones. El admin confia en estos datos.

**Solucion:** Agregar validacion de `vendedor_id` dentro del JSONB, o restringir las operaciones a append-only con un trigger que no permita borrar registros existentes dentro del JSONB `datos`.

---

### V3-M02: `producto_variantes.costo` visible para vendedores ✅ REMEDIADO 2026-03-19

**Evidencia RLS:**
```
variantes_select: qual = true
```

**Vector de ataque:**
```javascript
const { data } = await supabaseClient.from('producto_variantes').select('producto_id, nombre_variante, precio, costo')
// Vendedor ve el margen de ganancia de cada producto
```

**Impacto:** Fuga de informacion de costos. El vendedor conoce los margenes y puede negociar sabiendo el piso de precio real.

**Solucion:** Column-level security o VIEW sin columna `costo`:
```sql
CREATE VIEW producto_variantes_vendedor AS
  SELECT id, producto_id, nombre_variante, precio, stock, activo, created_at
  FROM producto_variantes;
-- GRANT SELECT ON producto_variantes_vendedor TO authenticated;
-- Revocar SELECT directo en producto_variantes para no-admin
```

---

### V3-M03: `reportes_mensuales` y `configuracion_empresa` legibles por vendedor ✅ REMEDIADO 2026-03-19

**Evidencia RLS:**
```
reportes_select: qual = true
cfg_empresa_select: qual = true
```

**Vector:** Vendedor puede leer reportes mensuales consolidados (totales de venta de la empresa, metricas) y datos fiscales completos de la empresa (RUC, timbrado, direccion fiscal).

**Impacto:** Bajo-medio. Informacion corporativa sensible accesible, pero no modificable.

**Solucion:**
```sql
DROP POLICY reportes_select ON reportes_mensuales;
CREATE POLICY reportes_select ON reportes_mensuales FOR SELECT USING (es_admin());
```

---

## BAJO

### V3-B01: Pedido ID predecible (timestamp + 4 chars random) ✅ REMEDIADO 2026-03-19

**Evidencia** (`checkout.js:94`):
```javascript
id: 'PED-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
```
4 caracteres aleatorios = ~1.6M combinaciones. No es explotable hoy (RLS protege por `vendedor_id`), pero es debil como identificador.

**Impacto:** Bajo. Identificador adivinable pero protegido por RLS ownership.

---

### V3-B02: Sin validacion de stock negativo en servidor ✅ REMEDIADO 2026-03-19 (tope 9999 en trigger)

**Contexto:** CLAUDE.md dice explicitamente "NO bloquear por stock en la app del vendedor" porque el flujo es: levantar pedido → comprar mercaderia → entregar. Esto es **by design**.

**Riesgo residual:** Un vendedor puede crear pedidos por cantidades absurdas (100,000 unidades) que distorsionan los reportes de demanda.

**Solucion sugerida:** Agregar tope maximo de cantidad por item (ej: 9999) en el trigger de validacion.

---

## MATRIZ DE PRIORIDAD

| # | Severidad | Esfuerzo | Accion |
|---|-----------|----------|--------|
| V3-C01 | CRITICO | 15 min | Trigger bloqueo mutacion en estados terminales |
| V3-C02 | CRITICO | 10 min | Decision de negocio: aislar clientes por vendedor o restringir columnas |
| V3-A01 | ALTO | 10 min | Trigger forzar fecha servidor en INSERT |
| V3-A02 | ALTO | 5 min | Revocar DELETE de vendedor en pedidos |
| V3-A03 | ALTO | 15 min | Validar descuento max. + recalcular total en trigger |
| V3-M01 | MEDIO | 20 min | Restringir escritura en configuracion o validar ownership |
| V3-M02 | MEDIO | 15 min | VIEW sin columna costo para vendedores |
| V3-M03 | MEDIO | 5 min | Restringir SELECT de reportes a admin |
| V3-B01 | BAJO | 5 min | Usar crypto.randomUUID() para IDs |
| V3-B02 | BAJO | 5 min | Tope de cantidad por item en trigger |

---

## HALLAZGOS POSITIVOS (lo que resistio el ataque)

- **RLS de `perfiles`**: Correctamente aislado. Vendedor solo ve su propio perfil.
- **`reportes_mensuales` INSERT**: Solo admin. Vendedor no puede inyectar reportes falsos.
- **`configuracion_empresa` UPDATE**: Solo admin. Vendedor no puede cambiar datos fiscales.
- **DELETE en `configuracion_empresa`**: Bloqueado con `USING(false)`. Indestructible.
- **Trigger `trg_validar_precios`**: Funciona correctamente para precios manipulados bajo 50%. Flag silencioso es la estrategia correcta.
- **`pedidos.vendedor_id` DEFAULT `auth.uid()`**: Un vendedor no puede atribuir pedidos a otro vendedor.
- **Edge Function SIFEN**: Anti-doble facturacion, rate limit y sanitizacion XML intactos.
- **Storage bucket**: Restricciones de admin, tamano y MIME types correctas.
