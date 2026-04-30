# Auditoría del Pipeline de Datos — HDV Distribuciones

**Fecha**: 2026-04-03  
**Alcance**: Análisis exhaustivo del flujo completo de datos: escritura, lectura, sincronización, persistencia offline y propagación realtime.  
**Archivos analizados**: 14 archivos de código fuente + tests unitarios  
**Hallazgos**: 6 (2 Críticos, 2 Altos, 1 Medio, 1 Bajo)

---

## Tabla de contenidos

1. [H1 — CRITICO: Race conditions en mutaciones de hdv_pedidos](#h1--critico-race-conditions-en-mutaciones-de-hdv_pedidos)
2. [H2 — CRITICO: sincronizarDatosNegocio usa doc_ids incorrectos](#h2--critico-sincronizardatosnegocio-usa-doc_ids-incorrectos)
3. [H3 — ALTO: SyncManager bypasa el Repository Pattern](#h3--alto-syncmanager-bypasa-el-repository-pattern)
4. [H4 — ALTO: ventas-data.js muta el cache de HDVStorage](#h4--alto-ventas-datajs-muta-el-cache-de-hdvstorage)
5. [H5 — MEDIO: Clientes y productos sin auto-paginación](#h5--medio-clientes-y-productos-sin-auto-paginación)
6. [H6 — BAJO: hdvState es dead code](#h6--bajo-hdvstate-es-dead-code)
7. [Resumen ejecutivo](#resumen-ejecutivo)

---

## H1 — CRITICO: Race conditions en mutaciones de hdv_pedidos

### Descripción

La key `hdv_pedidos` en IndexedDB es el recurso compartido más crítico del sistema: la leen y escriben simultáneamente los callbacks realtime, el SyncManager, el checkout, las funciones de edición del admin y las funciones de facturación.

El archivo `CLAUDE.md` establece explícitamente:

> **`atomicUpdate(key, updaterFn)` — OBLIGATORIO para toda mutación de `hdv_pedidos` en callbacks realtime.**

`HDVStorage.atomicUpdate` implementa un mutex per-key (promise-queue) que serializa las operaciones read-modify-write. Sin embargo, **solo `supabase-config.js`** (los callbacks realtime) lo utiliza. Los demás 8 archivos que mutan `hdv_pedidos` hacen el patrón inseguro:

```js
// PATRON INSEGURO — getItem + modificar + setItem sin mutex
const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
pedidos.push(nuevoPedido);
await HDVStorage.setItem('hdv_pedidos', pedidos);
```

Entre el `getItem` y el `setItem`, un evento realtime puede ejecutar un `atomicUpdate` concurrente. El `setItem` posterior sobreescribe el resultado del `atomicUpdate`, descartando la actualización remota.

### Escenario de pérdida de datos

```
T0 — Vendedor confirma pedido → checkout.js: getItem() → lee [A, B]
T1 — Llega evento realtime (admin entregó pedido B) → atomicUpdate: lee [A, B], escribe [A, B']
T2 — checkout.js: setItem([A, B, C]) → sobreescribe [A, B', C] con [A, B, C]
     → Se pierde la actualización B→B' (estado "entregado" revertido a "pendiente" localmente)
```

### Archivos afectados

| Archivo | Líneas | Operación | Contexto |
|---------|--------|-----------|----------|
| `checkout.js` | 95-97 | `push + setItem` | Flujo 1: Generar Pedido |
| `checkout.js` | 107-110 | `findIndex + setItem` | Callback sync pedido |
| `checkout.js` | 145-147 | `push + setItem` | Flujo 2: Cobro Interno |
| `checkout.js` | 156-159 | `findIndex + setItem` | Callback sync cobro |
| `checkout.js` | 236-238 | `push + setItem` | Flujo 3: Factura Mock |
| `checkout.js` | 247-250 | `findIndex + setItem` | Callback sync factura |
| `js/vendedor/cart.js` | 250-252 | `push + setItem` | Confirmar pedido vendedor |
| `js/vendedor/cart.js` | 259-262 | `findIndex + setItem` | Callback sync vendedor |
| `js/admin/pedidos.js` | 271-275 | `find + mutate + setItem` | `marcarEntregado()` |
| `js/admin/pedidos.js` | 296-300 | `find + mutate + setItem` | `marcarPendiente()` |
| `js/admin/pedidos.js` | 325-327 | `filter + setItem` | `eliminarPedidoAdmin()` |
| `js/admin/pedidos.js` | 567-577 | `findIndex + mutate + setItem` | `guardarEdicionPedido()` |
| `admin-devoluciones.js` | 221-223 | `push + setItem` | Emitir Nota de Crédito |
| `admin-devoluciones.js` | 230-232 | `findIndex + setItem` | Callback sync NC |
| `js/modules/ventas/ventas-data.js` | 61 | `mutate + setItem` | `ventasDataFacturar()` |
| `js/modules/ventas/ventas-data.js` | 68 | `mutate + setItem` | Callback sync factura |
| `js/modules/ventas/ventas-data.js` | 86 | `mutate + setItem` | `ventasDataGuardarSifen()` |
| `js/admin/creditos.js` | 241-245 | `find + mutate + setItem` | `marcarPagado()` |
| `app.js` | 125-130 | `merge + setItem` | Re-sync al volver online |
| `supabase-config.js` | 113 | `merge + setItem` | Carga inicial admin |
| `supabase-config.js` | 196 | `merge + setItem` | Carga inicial vendedor |

### Código afectado (ejemplos representativos)

**checkout.js — Flujo 1 (líneas 93-110):**

```js
// ❌ Sin atomicUpdate — race condition con realtime
const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
pedidos.push(pedido);
const persisted = await HDVStorage.setItem('hdv_pedidos', pedidos);

// ❌ Callback async sin atomicUpdate — segunda race condition
guardarPedido(pedido).then(async (ok) => {
    if (ok) {
        const pedidosActuales = (await HDVStorage.getItem('hdv_pedidos')) || [];
        const idx = pedidosActuales.findIndex(p => p.id === pedido.id);
        if (idx >= 0) { pedidosActuales[idx].sincronizado = true; }
        await HDVStorage.setItem('hdv_pedidos', pedidosActuales);
    }
});
```

**js/admin/pedidos.js — marcarEntregado (líneas 271-275):**

```js
// ❌ Sin atomicUpdate — si llega un realtime event entre getItem y setItem, se pierde
const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
const p = pedidos.find(x => x.id === id);
if (p) {
    p.estado = PEDIDO_ESTADOS.ENTREGADO;
    await HDVStorage.setItem('hdv_pedidos', pedidos);
}
```

**app.js — Re-sync online (líneas 122-130):**

```js
// ❌ Merge completo sin atomicUpdate — puede sobreescribir un pedido
// que el realtime callback acaba de actualizar
const pedidosLocal = (await HDVStorage.getItem('hdv_pedidos')) || [];
const sinSync = pedidosLocal.filter(p => p.sincronizado === false);
const remIds = new Set(pedidosRemoto.map(p => p.id));
const localesExtra = sinSync.filter(p => !remIds.has(p.id));
const merged = [...pedidosRemoto, ...localesExtra];
await HDVStorage.setItem('hdv_pedidos', merged);
```

### Solución propuesta

Migrar **todas** las mutaciones de `hdv_pedidos` a `HDVStorage.atomicUpdate()`. El patrón correcto:

**Para push (agregar pedido):**

```js
// ✅ atomicUpdate — serializado con realtime callbacks
const persisted = await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
    const list = pedidos || [];
    list.push(pedido);
    return list;
});
```

**Para update (cambiar estado):**

```js
// ✅ atomicUpdate — no pierde cambios concurrentes
await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
    const list = pedidos || [];
    const p = list.find(x => x.id === id);
    if (p) p.estado = PEDIDO_ESTADOS.ENTREGADO;
    return list;
});
```

**Para delete (eliminar pedido):**

```js
// ✅ atomicUpdate — serializado
await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
    return (pedidos || []).filter(p => p.id !== id);
});
```

**Para marcar sincronizado (callback sync):**

```js
// ✅ atomicUpdate — no sobreescribe actualizaciones intermedias
guardarPedido(pedido).then(async (ok) => {
    if (ok) {
        await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
            const list = pedidos || [];
            const p = list.find(x => x.id === pedido.id);
            if (p) p.sincronizado = true;
            return list;
        });
    }
});
```

**Para merge online re-sync (app.js):**

```js
// ✅ atomicUpdate — merge atómico que no descarta cambios intermedios
await HDVStorage.atomicUpdate('hdv_pedidos', (pedidosLocal) => {
    const list = pedidosLocal || [];
    const sinSync = list.filter(p => p.sincronizado === false);
    const remIds = new Set(pedidosRemoto.map(p => p.id));
    const localesExtra = sinSync.filter(p => !remIds.has(p.id));
    return [...pedidosRemoto, ...localesExtra];
});
```

**Nota sobre el retorno de `atomicUpdate`**: actualmente retorna el valor actualizado, pero no retorna el boolean de persistencia como `setItem`. Para los flujos de checkout que verifican persistencia, se podría envolver con un try/catch o extender `atomicUpdate` para que retorne `{ value, persisted }`. Alternativa pragmática: dado que `atomicUpdate` llama internamente a `setItem`, si el IDB falla, el error se loguea y el fallback a localStorage para keys críticas ya está implementado.

---

## H2 — CRITICO: sincronizarDatosNegocio usa doc_ids incorrectos

### Descripción

En la Fase 1 de Integridad de Datos (2026-03-25), las funciones `guardarGastos()` y `guardarRendiciones()` fueron correctamente migradas a doc_ids particionados por vendedor:

```js
// supabase-config.js líneas 530-549 — CORRECTO
function guardarGastos(gastos) {
    const vendedorId = window.hdvUsuario?.id;
    const docId = vendedorId ? `gastos_vendedor_${vendedorId}` : 'gastos_vendedor';
    return guardarConfig(docId, gastos);
}

function guardarRendiciones(rendiciones) {
    const vendedorId = window.hdvUsuario?.id;
    const docId = vendedorId ? `rendiciones_${vendedorId}` : 'rendiciones';
    return guardarConfig(docId, rendiciones);
}
```

Sin embargo, las funciones de sincronización masiva **nunca fueron actualizadas** y siguen usando los doc_ids legacy (sin particionar):

### Código afectado

**`sincronizarDatosNegocio()` — supabase-config.js líneas 593-610:**

```js
// ❌ doc_ids hardcodeados SIN partición por vendedor_id
const mapeo = [
    { key: 'hdv_pagos_credito', doc: 'pagos_credito' },
    { key: 'hdv_creditos_manuales', doc: 'creditos_manuales' },
    { key: 'hdv_promociones', doc: 'promociones' },
    { key: 'hdv_whatsapp_mensaje_credito', doc: 'whatsapp_plantilla' },
    { key: 'hdv_gastos', doc: 'gastos_vendedor' },         // ← INCORRECTO: debería ser gastos_vendedor_${id}
    { key: 'hdv_rendiciones', doc: 'rendiciones' },          // ← INCORRECTO: debería ser rendiciones_${id}
    { key: 'hdv_cuentas_bancarias', doc: 'cuentas_bancarias' },
    { key: 'hdv_metas', doc: 'metas_vendedor' }
];
```

**`cargarDatosNegocio()` — supabase-config.js líneas 613-635:**

```js
// ❌ Mismo mapeo incorrecto — lee del doc_id compartido (vacío o datos de otro vendedor)
const mapeo = [
    // ...
    { key: 'hdv_gastos', doc: 'gastos_vendedor' },         // ← LEE doc equivocado
    { key: 'hdv_rendiciones', doc: 'rendiciones' },          // ← LEE doc equivocado
    // ...
];
```

**`iniciarListenersDatosNegocio()` — supabase-config.js líneas 637-646:**

```js
// ❌ Escucha cambios en doc_ids incorrectos — nunca se dispara
escucharConfigRealtime('gastos_vendedor', 'hdv_gastos');     // ← Escucha doc equivocado
escucharConfigRealtime('rendiciones', 'hdv_rendiciones');     // ← Escucha doc equivocado
```

### Impacto

1. **`sincronizarDatosNegocio()`**: Sube gastos y rendiciones al doc_id compartido `gastos_vendedor` en vez de `gastos_vendedor_abc123`. Los datos van a un registro que nadie consume.
2. **`cargarDatosNegocio()`**: Al inicio de sesión, intenta cargar gastos y rendiciones desde el doc_id compartido. Si existe, puede cargar datos de otro vendedor o datos obsoletos. Si no existe, el vendedor arranca con gastos/rendiciones vacíos.
3. **`iniciarListenersDatosNegocio()`**: Los listeners realtime escuchan el doc_id sin particionar. Cuando un vendedor guarda gastos con `guardarGastos()` (que escribe en `gastos_vendedor_${id}`), el listener no se dispara porque está suscrito a `gastos_vendedor`.

### Solución propuesta

Hacer que las tres funciones lean el `vendedor_id` del usuario actual y construyan los doc_ids dinámicamente:

```js
async function sincronizarDatosNegocio() {
    const vendedorId = window.hdvUsuario?.id;
    const mapeo = [
        { key: 'hdv_pagos_credito', doc: 'pagos_credito' },
        { key: 'hdv_creditos_manuales', doc: 'creditos_manuales' },
        { key: 'hdv_promociones', doc: 'promociones' },
        { key: 'hdv_whatsapp_mensaje_credito', doc: 'whatsapp_plantilla' },
        { key: 'hdv_gastos', doc: vendedorId ? `gastos_vendedor_${vendedorId}` : 'gastos_vendedor' },
        { key: 'hdv_rendiciones', doc: vendedorId ? `rendiciones_${vendedorId}` : 'rendiciones' },
        { key: 'hdv_cuentas_bancarias', doc: 'cuentas_bancarias' },
        { key: 'hdv_metas', doc: 'metas_vendedor' }
    ];
    // ... resto igual
}
```

Aplicar el mismo patrón a `cargarDatosNegocio()` y `iniciarListenersDatosNegocio()`.

**Nota sobre el admin**: El admin no tiene `vendedor_id` en el sentido de partición. Verificar que el admin use `obtenerGastos()` / `obtenerRendiciones()` directamente (que ya manejan la lógica de partición) en vez de pasar por `cargarDatosNegocio()`.

---

## H3 — ALTO: SyncManager bypasa el Repository Pattern

### Descripción

El sistema define un Repository Pattern estricto en `services/supabase.js` (singleton `SupabaseService`). CLAUDE.md establece:

> **"Centraliza TODAS las queries. Ningun otro archivo debe hacer `supabaseClient.from()` directamente."**

Sin embargo, `SyncManager` hace un upsert batch directamente contra el cliente Supabase:

### Código afectado

**js/services/sync.js — líneas 138-143:**

```js
// ❌ Bypasa SupabaseService — no pasa por _reportError, no respeta el patrón
const { error } = await supabaseClient
    .from('pedidos')
    .upsert(rows, { onConflict: 'id' });
```

### Impacto

1. **Errores silenciados**: Si el batch upsert falla por un error de red no-trivial, `_reportError` de `SupabaseService` no se invoca, y Sentry no recibe el error.
2. **Inconsistencia**: Si en el futuro se agregan interceptores, logging, o transformaciones en `SupabaseService.upsertPedido`, el batch del SyncManager las saltea.
3. **Violación de arquitectura**: El Repository Pattern existe para tener un único punto de contacto con la base de datos. Este bypass lo debilita.

### Solución propuesta

**Opción A — Agregar `batchUpsertPedidos` a SupabaseService:**

```js
// services/supabase.js — nueva función
async function batchUpsertPedidos(pedidos) {
    try {
        const rows = pedidos.map(pedido => ({
            id: pedido.id,
            estado: pedido.estado || PEDIDO_ESTADOS.PENDIENTE,
            fecha: pedido.fecha || null,
            datos: pedido,
            actualizado_en: new Date().toISOString(),
            vendedor_id: pedido.vendedor_id || window.hdvUsuario?.id || null
        }));
        const { error } = await supabaseClient
            .from('pedidos')
            .upsert(rows, { onConflict: 'id' });
        if (error) throw error;
        return { success: true, error: null };
    } catch (error) {
        console.error('[SupabaseService] batchUpsertPedidos:', error);
        _reportError('batchUpsertPedidos', error);
        return { success: false, error };
    }
}
```

Luego en `sync.js`:

```js
// ✅ Usa SupabaseService
const { success, error } = await SupabaseService.batchUpsertPedidos(batch);
if (!success) throw error;
```

**Opción B — Más simple**: Reutilizar `upsertPedido` existente pasando cada pedido individualmente (ya es el fallback actual). Pero esto es más lento (N requests vs 1).

**Recomendación**: Opción A. Centraliza la lógica de construcción de rows y el error reporting.

---

## H4 — ALTO: ventas-data.js muta el cache de HDVStorage

### Descripción

`ventasDataObtenerPedidos()` obtiene la referencia directa al cache de HDVStorage (sin clonar), y luego las funciones de escritura mutan esos objetos directamente antes de llamar a `setItem`.

### Código afectado

**js/modules/ventas/ventas-data.js — líneas 13-14:**

```js
async function ventasDataObtenerPedidos() {
    // ❌ clone: false = referencia directa al Map interno de HDVStorage._cache
    return (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
}
```

**js/modules/ventas/ventas-data.js — líneas 45-68 (ventasDataFacturar):**

```js
async function ventasDataFacturar(pedidoId) {
    const pedidos = await ventasDataObtenerPedidos(); // ← referencia directa al cache

    const pedido = pedidos.find(p => p.id === pedidoId);
    // ...
    pedido.estado = PEDIDO_ESTADOS.FACTURADO;  // ❌ Muta el cache directamente
    pedido.numFactura = numFactura;             // ❌ Muta el cache directamente
    pedido.cdc = cdc;                           // ❌ Muta el cache directamente
    pedido.sincronizado = false;                // ❌ Muta el cache directamente

    await HDVStorage.setItem('hdv_pedidos', pedidos); // Persiste, pero el cache YA fue mutado

    guardarPedido(pedido).then(async ok => {
        if (ok) {
            pedido.sincronizado = true;          // ❌ Muta el cache sin setItem
            await HDVStorage.setItem('hdv_pedidos', pedidos); // Persiste estado parcial
        }
    });
}
```

### Impacto

1. **Cache corrupto**: La mutación directa modifica el `Map` interno de `HDVStorage._cache` antes de que `setItem` persista en IDB. Si `setItem` falla (IDB lleno, tab cerrada), el cache tiene un estado que nunca se persistió. Un `getItem` posterior con `clone: false` devuelve ese estado fantasma.
2. **Race condition amplificada**: Si un `atomicUpdate` se ejecuta entre las mutaciones del cache y el `setItem`, el `atomicUpdate` lee el cache ya mutado (estado parcial), aplica su transformación sobre datos sucios, y persiste un resultado incorrecto.
3. **Violación del contrato**: `clone: false` está documentado como "solo-lectura" (`{ clone: false }` devuelve referencia directa). Mutar la referencia rompe el contrato.

### Solución propuesta

**Opción A — Usar `clone: true` (default) en funciones de escritura:**

```js
async function ventasDataObtenerPedidos() {
    // Para lectura pura (renderizado): clone: false está bien
    return (await HDVStorage.getItem('hdv_pedidos', { clone: false })) || [];
}

// Nueva función para obtener copia mutable
async function _ventasDataObtenerPedidosMut() {
    // ✅ clone: true — copia independiente que se puede mutar
    return (await HDVStorage.getItem('hdv_pedidos')) || [];
}
```

**Opción B — Migrar a `atomicUpdate` (resuelve H1 y H4 simultáneamente):**

```js
async function ventasDataFacturar(pedidoId) {
    // ✅ atomicUpdate: lee copia, muta, persiste atómicamente
    let resultado = null;
    await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
        const list = pedidos || [];
        const pedido = list.find(p => p.id === pedidoId);
        if (!pedido) return list;

        pedido.estado = PEDIDO_ESTADOS.FACTURADO;
        pedido.numFactura = numFactura;
        pedido.cdc = cdc;
        pedido.sincronizado = false;
        resultado = { pedido, numFactura, cdc };
        return list;
    });
    return resultado;
}
```

**Recomendación**: Opción B. Resuelve tanto la corrupción de cache como la race condition (H1) de un solo golpe.

---

## H5 — MEDIO: Clientes y productos sin auto-paginación

### Descripción

`SupabaseService.fetchPedidos()` implementa auto-paginación con un loop y un safety cap de 5000 registros:

```js
// services/supabase.js línea 23 — fetchPedidos: auto-paginación correcta
async function fetchPedidos(limit = 500, offset = 0) {
    let allData = [];
    let hasMore = true;
    while (hasMore) {
        const { data } = await supabaseClient.from('pedidos')
            .select('...').range(currentOffset, currentOffset + PAGE_SIZE - 1);
        allData = allData.concat(data || []);
        if (!data || data.length < PAGE_SIZE) hasMore = false;
        else currentOffset += PAGE_SIZE;
        if (allData.length >= PAGE_SIZE * 10) hasMore = false; // Safety cap
    }
    return { data: allData, error: null };
}
```

Sin embargo, `fetchClientes` y `fetchProductosConVariantes` **no paginan** — hacen una sola query con `limit=1000`:

### Código afectado

**services/supabase.js — líneas 148-167 (fetchClientes):**

```js
async function fetchClientes(limit = 1000, offset = 0) {
    const { data, error } = await supabaseClient
        .from(tabla)
        .select('*')
        .range(offset, offset + limit - 1);
    // Solo un console.warn si se alcanza el límite — no intenta obtener más
    if (data && data.length === limit) {
        console.warn(`[SupabaseService] fetchClientes: se alcanzo el limite de ${limit} registros`);
    }
    return { data: data || [], error: null };
}
```

**services/supabase.js — líneas 169-189 (fetchProductosConVariantes):**

```js
async function fetchProductosConVariantes(limit = 1000, offset = 0) {
    const { data, error } = await supabaseClient
        .from('productos')
        .select(`*, ${variantesSelect}`)
        .range(offset, offset + limit - 1);
    // Mismo patrón: solo warn, no pagina
    if (data && data.length === limit) {
        console.warn(`[SupabaseService] fetchProductosConVariantes: se alcanzo el limite de ${limit} registros`);
    }
    return { data: data || [], error: null };
}
```

### Impacto

Si el negocio crece a más de 1000 clientes o productos, los que excedan el límite no se cargarán. El vendedor no verá todos los clientes/productos disponibles. La truncación es silenciosa (solo un `console.warn` que nadie ve en producción).

### Solución propuesta

Aplicar el mismo patrón de auto-paginación de `fetchPedidos`:

```js
async function fetchClientes(limit = 500, offset = 0) {
    try {
        const esAdmin = window.hdvUsuario?.rol === 'admin';
        const tabla = esAdmin ? 'clientes' : 'clientes_vendedor';
        const PAGE_SIZE = limit;
        let allData = [];
        let currentOffset = offset;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabaseClient
                .from(tabla)
                .select('*')
                .range(currentOffset, currentOffset + PAGE_SIZE - 1);
            if (error) throw error;
            allData = allData.concat(data || []);
            if (!data || data.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                currentOffset += PAGE_SIZE;
                if (allData.length >= PAGE_SIZE * 20) { // Cap: 10,000 clientes
                    console.warn(`[SupabaseService] fetchClientes: cap de ${allData.length} alcanzado`);
                    hasMore = false;
                }
            }
        }
        return { data: allData, error: null };
    } catch (error) {
        console.error('[SupabaseService] fetchClientes:', error);
        _reportError('fetchClientes', error);
        return { data: [], error };
    }
}
```

Aplicar el mismo patrón a `fetchProductosConVariantes`.

---

## H6 — BAJO: hdvState es dead code

### Descripción

El archivo `js/core/state.js` define un singleton `hdvState` con getters y setters para todas las variables de estado:

```js
const hdvState = (function () {
    let _todosLosPedidos = [];
    let _productosData = { productos: [], categorias: [], clientes: [] };
    // ...
    return {
        getPedidos() { return _todosLosPedidos; },
        setPedidos(v) { _todosLosPedidos = v; },
        getProductosData() { return _productosData; },
        // ... 10 pares getter/setter más
    };
})();
```

Pero inmediatamente después, las líneas 61-71 re-declaran las mismas variables como globales `var`:

```js
var todosLosPedidos = [];
var productosData = { productos: [], categorias: [], clientes: [] };
var productosFiltrados = [];
// ...
var productos = [];
var categorias = [];
var clientes = [];
var clienteActual = null;
var carrito = [];
```

**Todos los archivos** (`admin.js`, `app.js`, `checkout.js`, etc.) usan las variables globales directamente. Ningún archivo invoca `hdvState.getPedidos()` ni `hdvState.setPedidos()`.

### Impacto

- **Confusión de mantenimiento**: Un desarrollador nuevo podría asumir que `hdvState` es el mecanismo oficial y intentar usarlo, sin saber que está desconectado.
- **Dos fuentes de verdad**: `hdvState._todosLosPedidos` siempre está vacío; `todosLosPedidos` (global) es el que tiene los datos reales.
- **Peso muerto**: ~50 líneas de código que no hacen nada.

### Solución propuesta

**Opción A — Eliminar hdvState** (pragmática): Borrar el bloque del singleton (líneas 7-51) y dejar solo las variables globales. Es el enfoque más seguro: no cambia comportamiento y elimina la confusión.

**Opción B — Migrar a hdvState** (ambiciosa): En una fase futura, migrar todos los accesos a variables globales para que pasen por `hdvState.get/set`. Esto daría un punto central para interceptar cambios (logging, reactivity). Pero requiere modificar ~15 archivos y tiene alto riesgo de regresión.

**Recomendación**: Opción A ahora. Si en el futuro se necesita estado reactivo, reimplementar con un diseño basado en las necesidades reales.

---

## Resumen ejecutivo

| # | Severidad | Hallazgo | Archivos | Impacto | Esfuerzo |
|---|-----------|----------|----------|---------|----------|
| H1 | **CRITICO** | Race conditions: mutaciones de `hdv_pedidos` sin `atomicUpdate` | 8 archivos, 21 sitios | Pérdida de pedidos y reversión de estados | Medio (migrar a atomicUpdate) |
| H2 | **CRITICO** | `sincronizarDatosNegocio` / `cargarDatosNegocio` / listeners con doc_ids sin particionar | `supabase-config.js` | Gastos y rendiciones nunca sincronizan correctamente entre sesiones | Bajo (ajustar 3 mapeos) |
| H3 | **ALTO** | SyncManager bypasa SupabaseService (Repository Pattern) | `js/services/sync.js` | Errores no llegan a Sentry, inconsistencia arquitectural | Bajo (agregar función batch) |
| H4 | **ALTO** | `ventas-data.js` muta cache de HDVStorage via `clone: false` | `js/modules/ventas/ventas-data.js` | Corrupción de cache en memoria, estados fantasma | Bajo (cambiar a clone:true o atomicUpdate) |
| H5 | **MEDIO** | Clientes y productos sin auto-paginación (cap 1000) | `services/supabase.js` | Truncamiento silencioso con >1000 registros | Bajo (replicar patrón de fetchPedidos) |
| H6 | **BAJO** | `hdvState` es dead code (singleton nunca usado) | `js/core/state.js` | Confusión de mantenimiento, peso muerto | Trivial (eliminar bloque) |

### Orden de remediación recomendado

1. **H2** (esfuerzo bajo, impacto crítico) — Corregir los 3 mapeos en `supabase-config.js`. Fix de 10 minutos que restaura la sincronización de gastos y rendiciones.
2. **H1** (esfuerzo medio, impacto crítico) — Migrar las 21 mutaciones a `atomicUpdate`. Es el cambio más extenso pero el más importante para la integridad de datos.
3. **H4** (esfuerzo bajo, impacto alto) — Se resuelve como parte de H1 si se migra `ventas-data.js` a `atomicUpdate`. Alternativa: cambiar a `clone: true`.
4. **H3** (esfuerzo bajo, impacto alto) — Agregar `batchUpsertPedidos` a `SupabaseService` y usarlo en `SyncManager`.
5. **H5** (esfuerzo bajo, impacto medio) — Auto-paginar clientes y productos replicando el patrón existente.
6. **H6** (trivial) — Eliminar el singleton muerto.
