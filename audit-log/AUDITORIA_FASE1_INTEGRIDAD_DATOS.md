# FASE 1: Auditoria Integral — Integridad y Flujo de Datos

**Fecha:** 2026-03-25
**Auditor:** Lead Data Architect / Especialista en Sistemas Distribuidos Offline-First
**Mentalidad:** Destructiva. Cada linea analizada bajo la pregunta: "¿como rompo esto en un celular gama baja con 3G intermitente en la ruta paraguaya?"
**Alcance:** El viaje completo del dato:

```
[Celular/IndexedDB] → [Eventos Online/Offline] → [SyncManager] → [API Supabase/PostgreSQL] → [Suscripciones Realtime] → [Panel Admin UI]
```

---

## INDICE

1. [Mapa del pipeline de datos](#1-mapa-del-pipeline-de-datos)
2. [Fallas criticas (C)](#2-fallas-criticas-c)
3. [Fallas medias (M)](#3-fallas-medias-m)
4. [Fallas bajas (B)](#4-fallas-bajas-b)
5. [Matriz de riesgo consolidada](#5-matriz-de-riesgo-consolidada)
6. [Soluciones arquitectonicas detalladas](#6-soluciones-arquitectonicas-detalladas)
7. [Veredicto y hoja de ruta](#7-veredicto-y-hoja-de-ruta)

---

## 1. Mapa del pipeline de datos

### 1.1 Escritura del vendedor (checkout.js)

El vendedor genera pedidos mediante 3 flujos, cada uno con un prefijo de ID distinto:

| Flujo | Funcion | Prefijo | Estado inicial | Archivo |
|-------|---------|---------|---------------|---------|
| Pedido pendiente | `procesarPedido()` | `PED-` | `pedido_pendiente` | checkout.js:79 |
| Recibo interno | `procesarCobroInterno()` | `REC-` | `cobrado_sin_factura` | checkout.js:145 |
| Factura mock SIFEN | `procesarFacturaMock()` | `FAC-` | `facturado_mock` | checkout.js:240 |

Los 3 flujos siguen el mismo patron:

```
1. Construir objeto pedido con crypto.randomUUID()
2. Leer hdv_pedidos de IndexedDB (HDVStorage.getItem)
3. Push al array
4. Escribir array de vuelta a IndexedDB (HDVStorage.setItem)
5. Fire-and-forget: guardarPedido(pedido).then() → marcar sincronizado si exito
6. Limpiar carrito y mostrar toast "Pedido enviado"
```

**Estructura completa del pedido:**
```javascript
{
    id: 'PED-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    fecha: '2026-03-25T14:30:00.000Z',
    cliente: { id, nombre, ruc, telefono, direccion },
    items: [{ productoId, nombre, presentacion, precio, cantidad, subtotal, precioEspecial, tipo_impuesto }],
    subtotal: 500000,
    descuento: 5,
    total: 475000,
    tipoPago: 'contado',
    notas: 'Entregar por la tarde',
    estado: 'pedido_pendiente',
    tipo_comprobante: 'pedido',
    desgloseIVA: { iva10: 43182, iva5: 0, exenta: 0, totalIVA: 43182, ... },
    vendedor_id: 'uuid-del-vendedor',
    sincronizado: false
}
```

### 1.2 Persistencia local (js/utils/storage.js)

`HDVStorage` es un wrapper de IndexedDB con cache en memoria (`Map`):

```
┌──────────────────────────────────────────┐
│  _cache (Map en RAM)                     │  ← Siempre disponible, volatil
│  ↕ sync                                  │
│  IndexedDB (HDV_ERP_DB.keyval)           │  ← Persistente, puede fallar
│  ↕ fallback                              │
│  localStorage                            │  ← Limite 5MB, ultima defensa
└──────────────────────────────────────────┘
```

**Flujo de setItem:**
1. `_cache.set(key, value)` — siempre exitoso (RAM)
2. `_idbPut(key, value)` — puede fallar (cuota, corrupcion)
3. Si IDB falla → `localStorage.setItem()` — puede fallar (5MB)
4. Si todo falla → **solo log en consola, sin excepcion, sin alerta**

**Flujo de getItem:**
1. Retorna directo de `_cache` — retorna la **referencia** al objeto, no una copia

### 1.3 Sincronizacion (js/services/sync.js)

`SyncManager` es un singleton IIFE que sincroniza pedidos con `sincronizado === false`:

```
┌─ Trigger ──────────────────────────────────────┐
│  window 'online' event (2s delay)              │
│  Arranque de app (3s delay si navigator.onLine)│
└───────────────────────┬────────────────────────┘
                        ▼
┌─ Pre-checks ──────────────────────────────────┐
│  1. Mutex: _syncing === true? → abort         │
│  2. navigator.onLine === false? → abort       │
│  3. Leer hdv_pedidos, filtrar sincronizado=F  │
│  4. Kill Switch: RPC verificar_estado_cuenta  │
└───────────────────────┬───────────────────────┘
                        ▼
┌─ Sync Loop ───────────────────────────────────┐
│  for (pedido of pendientes) {                 │
│    guardarPedido(pedido)  ← 1 HTTP por pedido │
│    if (ok) pedido.sincronizado = true (RAM)   │
│  }                                            │
│  HDVStorage.setItem(pedidos) ← 1 write al fin│
└───────────────────────┬───────────────────────┘
                        ▼
┌─ Post-sync ───────────────────────────────────┐
│  Si hubo fallos → scheduleRetry(backoff)      │
│  Backoff: 5s → 15s → 30s → 60s (4 intentos)  │
└───────────────────────────────────────────────┘
```

### 1.4 API Supabase (services/supabase.js)

`SupabaseService.upsertPedido()` construye una fila con:
```javascript
{
    id: pedido.id,                        // PK — onConflict: 'id'
    estado: pedido.estado,
    fecha: pedido.fecha,                  // Sobreescrito por trigger server-side
    datos: pedido,                        // JSONB con todo el objeto
    vendedor_id: pedido.vendedor_id,
    actualizado_en: new Date().toISOString()  // ← Reloj del CLIENTE
}
```

El upsert con `onConflict: 'id'` es **idempotente**: enviar el mismo pedido dos veces no crea duplicados, solo actualiza.

### 1.5 Realtime (supabase-config.js)

**Admin** (`escucharPedidosRealtime`):
- Cada evento postgres_changes → `fetchPedidos(500)` completo
- Merge: remoto + local `sincronizado === false` que no este en remoto
- Sin debounce

**Vendedor** (`escucharPedidosRealtimeVendedor`):
- Granular: maneja INSERT/UPDATE/DELETE individualmente
- UPDATE: modifica el pedido en IndexedDB, dispara callback `onEstadoCambiado`
- DELETE: elimina de IndexedDB, dispara callback `onPedidoEliminado`
- INSERT: agrega si no existe, dispara callback `onSync`

---

## 2. Fallas criticas (C)

### C-01: Perdida silenciosa y permanente de datos por eviccion de IndexedDB

**Archivos afectados:** `js/utils/storage.js:152-173`
**Probabilidad:** Media (comun en Safari iOS, navegadores con poco espacio)
**Impacto:** Perdida total e irrecuperable de todos los pedidos offline

#### Descripcion del problema

Los navegadores moviles evictan IndexedDB sin aviso previo bajo presion de almacenamiento. Esto es especialmente comun en:

- **Safari iOS**: Evicta despues de 7 dias de inactividad en el dominio
- **Chrome Android**: Evicta cuando el almacenamiento del dispositivo esta bajo presion
- **Modo incognito/privado**: IndexedDB se elimina al cerrar la ventana
- **PWA sin persistent storage**: El navegador trata los datos como "best effort"

#### Escenario catastrofico paso a paso

```
Estado inicial: Vendedor tiene 50 pedidos sin sincronizar en IndexedDB.
              El celular tiene poco espacio (WhatsApp, fotos, etc.)

Paso 1: El SO o navegador decide liberar espacio
        → Borra HDV_ERP_DB completa (sin notificacion a la PWA)

Paso 2: Vendedor abre la app al dia siguiente

Paso 3: HDVStorage._init() ejecuta:
        → _openDB() → EXITO (crea DB nueva y vacia, version 1)
        → _migrateFromLocalStorage() → No encuentra nada
          (localStorage ya fue limpiado en la migracion original)
        → _loadCache() → Carga 0 entries de la DB vacia
        → console.log('[HDVStorage] Inicializado con 0 keys en cache')

Paso 4: SyncManager.init() ejecuta:
        → syncPedidosPendientes()
        → HDVStorage.getItem('hdv_pedidos') → null
        → pendientes = [] → "No hay pedidos pendientes de sync"

Paso 5: 50 pedidos PERDIDOS PARA SIEMPRE.
        El vendedor no recibe NINGUNA alerta.
        La oficina nunca ve esos pedidos.
        El dinero cobrado (si eran REC- o FAC-) no tiene registro.
```

#### Por que es critico

1. **No hay deteccion**: El codigo no distingue entre "nunca hubo datos" y "los datos fueron evictados"
2. **No hay alerta**: `_init()` reporta exito con 0 keys como si fuera una instalacion fresca
3. **No hay recuperacion**: Sin los datos en IDB ni en localStorage, no hay copia local
4. **No se pide almacenamiento persistente**: `navigator.storage.persist()` nunca se llama. En cero lineas del codebase aparece esta API (verificado con grep)
5. **No hay monitoreo de cuota**: `navigator.storage.estimate()` no se usa en ningun lugar

#### Evidencia de ausencia

```bash
# Busqueda en todo el codebase:
grep -r "navigator.storage" .  → 0 resultados
grep -r "StorageManager" .     → 0 resultados
grep -r "storage.persist" .    → 0 resultados
grep -r "storage.estimate" .   → 0 resultados
```

---

### C-02: HDVStorage.setItem falla silenciosamente — datos solo en RAM

**Archivos afectados:** `js/utils/storage.js:181-196`
**Probabilidad:** Media (cuota agotada, disco lleno, DB corrupta, tab en background throttled)
**Impacto:** Pedido recien creado existe solo en RAM, se pierde al cerrar pestana

#### Descripcion del problema

```javascript
// storage.js:181-196
async function setItem(key, value) {
    _cache.set(key, value);           // ← (1) Siempre "exito" en memoria
    if (_db) {
        try {
            await _idbPut(key, value);  // ← (2) Puede fallar
        } catch (err) {
            console.error('[HDVStorage] Error escribiendo a IDB:', key, err);
            // ← (3) NO throw. NO return false. NO alerta al usuario.
            //       El dato SOLO vive en _cache (RAM).
        }
    } else {
        // Fallback localStorage
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn('[HDVStorage] Fallback localStorage lleno:', key);
            // ← (4) Tambien silencioso. Dato solo en RAM.
        }
    }
}
```

#### Escenarios de fallo de _idbPut

| Escenario | Causa | Frecuencia |
|-----------|-------|------------|
| `QuotaExceededError` | Disco lleno o cuota IDB agotada | Media en celulares baratos |
| `AbortError` | Transaccion abortada (tab en background, timeout) | Media en uso real |
| `InvalidStateError` | DB cerrada por otra pestana | Baja |
| `DataCloneError` | Objeto no serializable (funciones, DOM nodes) | Rara en este proyecto |
| `UnknownError` | Corrupcion de la base de datos | Baja |

#### Flujo de fallo

```
Vendedor crea pedido → checkout.js:111-113:
  const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
  pedidos.push(pedido);
  await HDVStorage.setItem('hdv_pedidos', pedidos);
                     ↓
  _cache.set('hdv_pedidos', [...pedidos, nuevoPedido])  ✅ RAM
  _idbPut('hdv_pedidos', [...])                         ❌ QuotaExceededError
                     ↓
  console.error(...)  ← Solo esto. Nadie lo ve.
                     ↓
  checkout.js continua: mostrarToast('Pedido enviado a oficina', 'success')
  El vendedor CREE que su pedido esta guardado.
                     ↓
  Vendedor cierra la app / cambia a WhatsApp
                     ↓
  _cache (Map) es garbage-collected
                     ↓
  Pedido PERDIDO. No esta en IDB. No esta en Supabase.
```

#### Agravante: el fallback a localStorage tambien es insuficiente

Si IndexedDB no esta disponible (`_db === null`), se usa localStorage. Pero localStorage tiene un limite de 5MB. Un array de 200 pedidos con items detallados, desglose IVA y datos de cliente facilmente pesa 2-4MB en JSON. Combinado con otras keys (`hdv_catalogo_local`, `hdv_gastos`, etc.), el limite se alcanza rapidamente.

Y cuando localStorage.setItem lanza `QuotaExceededError`, el catch **tambien es silencioso**.

---

### C-03: Gastos y rendiciones usan last-write-wins en fila compartida — destruccion de datos entre vendedores

**Archivos afectados:** `app.js:395-412`, `supabase-config.js:456-460`, `services/supabase.js:393-408`
**Probabilidad:** Alta (ocurre en operacion NORMAL con 2+ vendedores)
**Impacto:** Perdida total de gastos/rendiciones de un vendedor al sincronizar otro

#### Descripcion del problema

Todos los vendedores escriben sus gastos a **una unica fila** en la tabla `configuracion`:

```javascript
// app.js:399-400 — Vendedor A guarda SUS gastos:
if (typeof guardarGastos === 'function') {
    guardarGastos(gastos).catch(e => console.error(e));
}

// supabase-config.js:456
function guardarGastos(gastos) { return guardarConfig('gastos_vendedor', gastos); }

// supabase-config.js:410-415
async function guardarConfig(docId, datos) {
    const { success } = await SupabaseService.upsertConfig(docId, datos);
    // ...
}

// services/supabase.js:393-408
async function upsertConfig(docId, datos) {
    const { error } = await supabaseClient
        .from('configuracion')
        .upsert({
            doc_id: docId,           // ← 'gastos_vendedor' para TODOS
            datos: datos,            // ← El array COMPLETO del vendedor
            actualizado_en: new Date().toISOString()
        }, { onConflict: 'doc_id' }); // ← REEMPLAZA el existente
}
```

#### Escenario de destruccion de datos

```
Lunes 8:00 — Vendedor A (zona Norte) sin señal:
  Registra gastos: [{combustible: 150000}, {almuerzo: 35000}, {estacionamiento: 10000}]
  → HDVStorage('hdv_gastos') = [g1, g2, g3]

Lunes 8:30 — Vendedor B (zona Sur) sin señal:
  Registra gastos: [{combustible: 120000}, {peaje: 25000}]
  → HDVStorage('hdv_gastos') = [g4, g5]

Lunes 12:00 — Vendedor A recupera señal:
  guardarGastos([g1, g2, g3])
  → configuracion.gastos_vendedor.datos = [g1, g2, g3]  ✅

Lunes 12:01 — Vendedor B recupera señal:
  guardarGastos([g4, g5])
  → configuracion.gastos_vendedor.datos = [g4, g5]       ← SOBREESCRIBE
  → g1, g2, g3 de Vendedor A → DESTRUIDOS

Resultado: La empresa pierde registro de Gs. 195.000 en gastos de Vendedor A.
```

#### Tablas afectadas por el mismo patron

| doc_id en configuracion | Riesgo | Impacto |
|------------------------|--------|---------|
| `gastos_vendedor` | **CRITICO** | Perdida de gastos entre vendedores |
| `rendiciones` | **CRITICO** | Perdida de rendiciones semanales |
| `creditos_manuales` | Alto | Creditos duplicados o perdidos |
| `pagos_credito` | Alto | Pagos de credito sobreescritos |
| `promociones` | Medio | Promos inconsistentes |
| `metas_vendedor` | Bajo | Admin es unico escritor |

#### Agravante: Realtime propaga la destruccion

Cuando Vendedor B sobreescribe gastos_vendedor, el listener realtime del admin actualiza su cache local:
```javascript
escucharConfigRealtime('gastos_vendedor', 'hdv_gastos');
// → HDVStorage.setItem('hdv_gastos', [g4, g5])
```
El admin ahora tambien ve solo los gastos de B. La destruccion se propaga a todos los dispositivos conectados.

---

### C-04: SyncManager no es atomico — tab kill entre sync y persistencia causa re-envios

**Archivos afectados:** `js/services/sync.js:57-90`
**Probabilidad:** Media (comun en uso real: vendedor cierra Chrome, recibe llamada, bateria muere)
**Impacto:** Re-envio innecesario de pedidos ya sincronizados, feedback incorrecto al usuario

#### Descripcion del problema

El SyncManager marca los pedidos como sincronizados **en memoria** durante el loop, pero solo **persiste a IndexedDB una vez al final**:

```javascript
// sync.js:57-90
for (const pedido of pendientes) {
    try {
        const ok = await guardarPedido(pedido);  // ← HTTP a Supabase
        if (ok) {
            pedido.sincronizado = true;           // ← SOLO en RAM
            synced++;
        }
    } catch (err) {
        failed++;
    }
}

// ... lineas de codigo intermedias (93-96 toast, 99-101 retry) ...

if (synced > 0) {
    await HDVStorage.setItem('hdv_pedidos', pedidos);  // ← UNICA escritura a IDB
}
```

#### Ventana de vulnerabilidad

```
Timeline con 20 pedidos a sincronizar:
─────────────────────────────────────────────────────
t=0s    → Sync empieza. Loop inicia.
t=0.3s  → Pedido 1 enviado a Supabase ✅ sincronizado=true (RAM)
t=0.6s  → Pedido 2 enviado ✅ (RAM)
...
t=3.0s  → Pedido 10 enviado ✅ (RAM)
t=3.1s  → ☠️ VENDEDOR CIERRA LA PESTANA ☠️
         → JavaScript execution context destruido
         → _cache (Map) garbage-collected
         → Linea 90 (HDVStorage.setItem) NUNCA SE EJECUTA
─────────────────────────────────────────────────────

Resultado en IndexedDB: 20 pedidos con sincronizado=false
Resultado en Supabase:  10 pedidos recibidos correctamente

Al reabrir la app:
  SyncManager lee 20 pedidos con sincronizado=false
  Re-envia los 20 (10 duplicados + 10 nuevos)
  Supabase upsert es idempotente → NO hay duplicados en DB
  PERO: Toast dice "20 pedidos sincronizados" → FEEDBACK INCORRECTO
  PERO: 10 HTTP requests desperdiciados → ANCHO DE BANDA PERDIDO
```

#### Analisis de riesgo real

El upsert idempotente (`onConflict: 'id'`) evita duplicados en PostgreSQL, lo que convierte esta falla de "perdida de datos" a "desperdicio de recursos + feedback incorrecto". Sin embargo, hay un edge case mas peligroso:

**¿Que pasa si el tab muere DURANTE la escritura de `_idbPut`?**

IndexedDB transactions son atomicas a nivel de transaccion individual, pero si el proceso muere durante la escritura, la transaccion queda en estado indeterminado. En la practica, los navegadores garantizan que una transaccion abortada no deja datos corruptos (rollback automatico). Pero el estado que ya se habia comprometido en transacciones anteriores se pierde si no se habian escrito.

---

## 3. Fallas medias (M)

### M-01: `navigator.onLine` es un detector fantasma — portales cautivos y redes zombi

**Archivos afectados:** `js/services/sync.js:18-19, 142-144`
**Probabilidad:** Alta (portales cautivos en hoteles, aeropuertos, centros comerciales de Paraguay)
**Impacto:** SyncManager arranca innecesariamente, HTTP requests cuelgan por minutos

#### Descripcion del problema

```javascript
// sync.js:18-19
if (!navigator.onLine) {
    console.log('[SyncManager] Sin conexion, sync pospuesto');
    return { synced: 0, failed: 0 };
}
```

`navigator.onLine` es un indicador de **capa de enlace**, no de **capa de aplicacion**. Retorna `true` cuando:

| Situacion | `navigator.onLine` | Supabase accesible | Resultado |
|-----------|--------------------|--------------------|-----------|
| WiFi conectado, internet OK | `true` | Si | ✅ OK |
| WiFi portal cautivo (hotel) | `true` | No (redirect a login) | ❌ Sync cuelga |
| Datos moviles 1 barra (3G) | `true` | Timeout en 30s+ | ❌ Sync lento |
| VPN activa, tunel roto | `true` | No | ❌ Sync falla |
| Modo avion | `false` | No | ✅ No intenta |

#### Escenario real

```
Vendedor entra a un shopping con WiFi del centro comercial.
WiFi se conecta → portal cautivo (requiere login via navegador).
navigator.onLine cambia a true.
window 'online' event se dispara.

SyncManager espera 2 segundos, luego:
  syncPedidosPendientes()
  → navigator.onLine === true ✅
  → verificar_estado_cuenta() → HTTP POST → portal cautivo responde con HTML de login
    → Supabase SDK trata la respuesta HTML como error → catch silencioso
  → guardarPedido(pedido1) → HTTP POST → mismo resultado
    → "Fallo sync pedido PED-xxx"
  → guardarPedido(pedido2) → misma historia
  → ... repite N veces
  → scheduleRetry(0) → 5 segundos → vuelve a fallar
  → scheduleRetry(1) → 15 segundos → vuelve a fallar
  → scheduleRetry(2) → 30 segundos → vuelve a fallar
  → scheduleRetry(3) → 60 segundos → vuelve a fallar
  → SE RINDE. 4 intentos consumidos contra un portal cautivo.

Vendedor sale del shopping, recupera datos moviles reales.
navigator.onLine nunca cambio (siempre fue true).
NO se dispara evento 'online'.
SyncManager NO se reactiva.
Pedidos quedan sin sincronizar hasta que el vendedor cierre y reabra la app.
```

#### Agravante: no hay timeout en las peticiones HTTP

El codigo no configura ningun `AbortController` ni timeout para las llamadas a Supabase. El timeout default de `fetch` en Chrome es de ~300 segundos (5 minutos). En una red 3G lenta, cada `guardarPedido()` podria colgar **5 minutos** antes de fallar. Con 20 pedidos pendientes, eso es potencialmente **100 minutos** de sync colgado.

---

### M-02: Sin batching — N pedidos = N HTTP requests secuenciales

**Archivos afectados:** `js/services/sync.js:57-86`, `services/supabase.js:46-69`
**Probabilidad:** Baja (requiere 3+ dias offline con actividad alta)
**Impacto:** Degradacion severa de UX, consumo excesivo de datos moviles

#### Descripcion del problema

```javascript
// sync.js:57-86
for (const pedido of pendientes) {
    const ok = await guardarPedido(pedido);  // ← 1 HTTP request por pedido
    // ...
}
```

Cada `guardarPedido()` hace UN request HTTP individual a Supabase:

```javascript
// services/supabase.js:60-62
const { error } = await supabaseClient
    .from('pedidos')
    .upsert(row, { onConflict: 'id' });  // ← 1 row por request
```

#### Calculo de impacto

| Pedidos offline | Tiempo estimado (3G ~800ms/req) | Datos moviles (~2KB/req) |
|----------------|---------------------------------|--------------------------|
| 10 | 8 segundos | 20 KB |
| 50 | 40 segundos | 100 KB |
| 200 | 2 minutos 40 segundos | 400 KB |
| 500 | 6 minutos 40 segundos | 1 MB |

#### Lo que Supabase soporta pero no usamos

El SDK de Supabase acepta **batch upsert** nativo:

```javascript
// UNA sola peticion para N pedidos:
const { error } = await supabaseClient
    .from('pedidos')
    .upsert(arrayDe50Rows, { onConflict: 'id' });
```

Supabase/PostgREST acepta hasta **1000 filas** en un solo upsert. En lugar de 500 requests, podriamos hacer 1 (o 10 batches de 50).

#### Riesgos adicionales del loop secuencial

1. **Token JWT puede expirar mid-sync**: Si el token de Supabase tiene 1 hora de vida y el sync toma mas de 1 hora (500+ pedidos en 3G), las ultimas requests fallan con 401
2. **Sin indicador de progreso**: El vendedor no ve "Sincronizando 45/200". Solo ve "Sincronizado" o nada
3. **Cualquier interrupcion reinicia desde cero**: Si el tab se cierra en el pedido #100 de 200, al reabrir se re-envian los 200 (ver C-04)

---

### M-03: Race condition latente por semantica de referencia en cache de HDVStorage

**Archivos afectados:** `js/utils/storage.js:177-178`, `checkout.js:111-125`, `js/services/sync.js:28-90`
**Probabilidad:** Baja (requiere refactoring futuro para manifestarse)
**Impacto:** Perdida de pedidos o flags de sincronizacion si se cambia la implementacion

#### Descripcion del problema

`getItem()` retorna la **referencia directa** al objeto en `_cache`:

```javascript
// storage.js:177-178
async function getItem(key) {
    return _cache.has(key) ? _cache.get(key) : null;
    //                        ↑ REFERENCIA directa, no copia
}
```

Esto significa que **todos los consumidores que llaman `getItem('hdv_pedidos')` reciben el MISMO array**. Las mutaciones de un consumidor son visibles para todos los demas.

#### Por que funciona HOY (accidentalmente)

```javascript
// checkout.js:111-113
const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
pedidos.push(pedido);           // ← Muta el array en _cache directamente
await HDVStorage.setItem('hdv_pedidos', pedidos);

// sync.js:28 (ejecutandose simultaneamente en otro async context)
const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
// ↑ MISMO array que checkout.js esta mutando
// sync.js VE el pedido recien pusheado por checkout.js
```

La concurrencia funciona porque:
1. JavaScript es single-threaded
2. `_cache.set()` en `setItem` es sincronico
3. Todos comparten la misma referencia al array

#### Como se rompe con un cambio inocente

Basta con que **cualquier desarrollador futuro** haga una copia defensiva:

```javascript
// "Mejora" que parece inofensiva:
const pedidos = [...(await HDVStorage.getItem('hdv_pedidos'))];
// ↑ Spread crea una COPIA del array. Ya no comparte referencia.
```

O que `getItem` se "mejore" para retornar copias:

```javascript
async function getItem(key) {
    return _cache.has(key) ? structuredClone(_cache.get(key)) : null;
}
```

Cualquiera de estos cambios **introduce race conditions reales** entre checkout y SyncManager, entre multiples callbacks de sync, y entre el realtime listener y el checkout.

#### Patron de race condition que emergiria

```
t=0ms  checkout lee pedidos: [A, B]       (copia 1)
t=1ms  sync lee pedidos: [A, B]           (copia 2, independiente)
t=5ms  checkout pushes C: [A, B, C]       (copia 1)
t=6ms  checkout escribe [A, B, C]         → cache = [A, B, C]
t=10ms sync marca A.sincronizado=true     (copia 2, stale)
t=11ms sync escribe [A(synced), B]        → cache = [A(synced), B]
                                          → C SE PIERDE
```

---

### M-04: Sin `beforeunload` en la app del vendedor

**Archivos afectados:** `app.js`, `index.html` — handler AUSENTE
**Probabilidad:** Alta (vendedor cierra Chrome para atender llamada, bateria baja, etc.)
**Impacto:** Pedidos no persistidos si IDB fallo (ver C-02), sync interrumpido sin aviso

#### Evidencia

```bash
# admin.js TIENE beforeunload:
admin.js:282: window.addEventListener('beforeunload', (e) => {
    if (cambiosSinGuardar > 0) { e.preventDefault(); e.returnValue = ''; }
});

# app.js / index.html NO LO TIENEN.
# grep confirma: solo admin.js tiene beforeunload
```

#### Escenario

El vendedor esta en una tienda, crea 5 pedidos rapidamente. El SyncManager esta intentando sincronizar. Recibe una llamada telefonica → Android cierra la pestana de Chrome en background despues de unos minutos (memory pressure). No hubo dialogo de confirmacion.

Si `setItem` fallo silenciosamente (C-02), esos 5 pedidos estaban solo en RAM y se pierden.

---

### M-05: Realtime admin hace full re-fetch sin debounce en canal de pedidos

**Archivos afectados:** `supabase-config.js:123-141`
**Probabilidad:** Media (ocurre cuando vendedor sincroniza multiples pedidos)
**Impacto:** Rafaga de N requests al API de Supabase, posible rate limiting

#### Descripcion del problema

```javascript
// supabase-config.js:123-141
const unsub = SupabaseService.subscribeTo('pedidos-realtime', 'pedidos', async () => {
    const { data } = await SupabaseService.fetchPedidos();  // ← 500 rows CADA VEZ
    // ... merge logic ...
});
```

Comparar con el canal de catalogo que SI tiene debounce:

```javascript
// supabase-config.js:389-396
let reloadTimeout = null;
const recargar = () => {
    clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(async () => {
        const data = await obtenerCatalogo();
        if (data) callback(data);
    }, 500);  // ← 500ms debounce
};
```

Cuando el vendedor sincroniza 50 pedidos (SyncManager envia uno por uno), Supabase realtime emite 50 eventos. El admin dispara **50 fetchPedidos(500)** simultaneos. Cada uno retorna hasta 500 filas.

---

### M-06: fetchPedidos trunca silenciosamente en 500 registros

**Archivos afectados:** `services/supabase.js:13-29`
**Probabilidad:** Baja (requiere acumulacion de 500+ pedidos en la base)
**Impacto:** Admin pierde visibilidad sobre pedidos antiguos sin saberlo

```javascript
// services/supabase.js:13-29
async function fetchPedidos(limit = 500, offset = 0) {
    const { data, error } = await supabaseClient
        .from('pedidos')
        .select(/* ... */)
        .order('fecha', { ascending: false })
        .range(offset, offset + limit - 1);
    if (data && data.length === limit) {
        console.warn(/* solo warning en consola */);
    }
    return { data: data || [], error: null };
}
```

El warning solo aparece en la consola del desarrollador. El admin no ve ningun indicador de que hay mas pedidos. Los 100+ pedidos mas antiguos son completamente invisibles.

---

## 4. Fallas bajas (B)

### B-01: `actualizado_en` usa reloj del cliente

**Archivo:** `services/supabase.js:53`

```javascript
actualizado_en: new Date().toISOString()  // ← Reloj del celular
```

El trigger `trg_forzar_fecha_servidor` sobreescribe `pedidos.fecha` con `NOW()` del servidor, pero `actualizado_en` queda con el timestamp del dispositivo. Si el celular tiene el reloj adelantado 1 hora, los pedidos aparecen como "actualizados en el futuro", lo que puede confundir al admin en el ordenamiento.

### B-02: Kill Switch check silencia error de red

**Archivo:** `js/services/sync.js:37-53`

```javascript
try {
    const { data: activo } = await supabaseClient.rpc('verificar_estado_cuenta');
    if (activo === false) { /* kill switch logic */ }
} catch (e) { /* Si falla, continuar sync normalmente */ }
```

El catch vacio es intencional (no bloquear sync por red inestable), pero deberia al menos loguear el tipo de error para debugging. En un portal cautivo, el RPC retorna HTML en lugar de JSON, lo que causa un error de parsing que se traga silenciosamente.

### B-03: Retry de SyncManager limitado a 4 intentos con backoff corto

**Archivo:** `js/services/sync.js:10, 113-125`

```javascript
const RETRY_DELAYS = [5000, 15000, 30000, 60000];
// Total: 5 + 15 + 30 + 60 = 110 segundos (menos de 2 minutos)
```

Si el vendedor tiene señal intermitente durante horas (comun en ruta), despues de 2 minutos el SyncManager se rinde. Solo se reactiva cuando:
1. `window.addEventListener('online')` se dispara (puede no pasar si la red nunca se desconecto totalmente)
2. El usuario cierra y reabre la app

No hay un retry periodico "heartbeat" (ej: intentar cada 5 minutos indefinidamente).

### B-04: Cache de imagenes del Service Worker usa eviccion FIFO en lugar de LRU

**Archivo:** `service-worker.js:165-169`

```javascript
cache.keys().then(keys => {
    if (keys.length > 200) {
        cache.delete(keys[0]);  // ← Borra la PRIMERA, no la menos usada
    }
});
```

Una imagen de producto que se cacheo hace tiempo pero se usa frecuentemente puede ser evictada antes que una imagen que se cacheo ayer pero nunca se volvio a mostrar.

---

## 5. Matriz de riesgo consolidada

| ID | Severidad | Probabilidad | Falla | Datos en riesgo | Escenario trigger |
|----|-----------|-------------|-------|-----------------|-------------------|
| **C-01** | **CRITICA** | Media | Eviccion IDB sin deteccion ni recovery | Todos los pedidos offline del vendedor | Safari iOS 7 dias, Android low-storage |
| **C-02** | **CRITICA** | Media | setItem falla silencioso, dato solo en RAM | Pedido recien creado | Disco lleno, cuota IDB, tab throttled |
| **C-03** | **CRITICA** | **Alta** | Last-write-wins en config compartida | Gastos/rendiciones de N-1 vendedores | Operacion normal con 2+ vendedores |
| **C-04** | **CRITICA** | Media | Tab kill entre sync loop y persistencia | Estado de sincronizacion | Llamada telefonica, battery save |
| **M-01** | Media | **Alta** | navigator.onLine fantasma | Intentos de sync desperdiciados | Portal cautivo, 3G zombie |
| **M-02** | Media | Baja | Sin batching (N HTTP requests) | Nada (UX degradada) | 3+ dias offline |
| **M-03** | Media | Baja | Race condition latente en cache | Pedidos si se refactoriza | Cambio de getItem/setItem |
| **M-04** | Media | **Alta** | Sin beforeunload en vendedor | Datos en RAM no persistidos | Cierre de app cotidiano |
| **M-05** | Media | Media | Re-fetch masivo sin debounce | Performance admin | Sync de batch de vendedor |
| **M-06** | Media | Baja | Truncamiento 500 pedidos | Visibilidad admin | Acumulacion de historico |
| **B-01** | Baja | Media | Reloj del cliente en actualizado_en | Timestamps | Celular con hora mal |
| **B-02** | Baja | Baja | Kill switch silencia error | Logs de debugging | Portal cautivo |
| **B-03** | Baja | Media | Retry limitado a 4 intentos | Sync tardio en red intermitente | Ruta con señal inestable |
| **B-04** | Baja | Baja | FIFO en lugar de LRU en cache SW | Cache suboptimo de imagenes | 200+ imagenes de productos |

---

## 6. Soluciones arquitectonicas detalladas

### 6.1 Solucion para C-01 y C-02: Storage Guardian

**Objetivo:** Detectar eviccion, solicitar persistencia, alertar al usuario, retornar estado de exito/fallo.

#### Paso 1: Solicitar almacenamiento persistente (una vez)

Agregar al final de `_init()` en `js/utils/storage.js`:

```javascript
async function _requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persisted();
        if (!isPersisted) {
            const granted = await navigator.storage.persist();
            console.log('[HDVStorage] Persistent storage:', granted ? 'GRANTED' : 'DENIED');
            if (!granted) {
                console.warn('[HDVStorage] ⚠️ Datos locales pueden ser evictados por el navegador');
            }
        }
    }
}
```

**Nota:** `navigator.storage.persist()` retorna `true` automaticamente en la mayoria de navegadores si la PWA esta instalada como app. En Safari iOS, la persistencia se otorga automaticamente para apps en Home Screen.

#### Paso 2: Monitorear cuota disponible

```javascript
async function _checkStorageQuota() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    const pctUsado = quota > 0 ? Math.round((usage / quota) * 100) : 0;
    const mbLibres = Math.round((quota - usage) / (1024 * 1024));
    if (pctUsado > 90) {
        console.error(`[HDVStorage] ALERTA: almacenamiento al ${pctUsado}% (${mbLibres}MB libres)`);
        if (typeof mostrarToast === 'function') {
            mostrarToast(`Almacenamiento casi lleno (${pctUsado}%). Sincronice sus datos.`, 'warning');
        }
    }
    return { usage, quota, pctUsado, mbLibres };
}
```

Llamar periodicamente (ej: cada 5 minutos) o antes de escrituras criticas.

#### Paso 3: Detectar eviccion post-init

```javascript
async function _detectarEviccion() {
    // Si hay sesion activa pero IndexedDB esta vacia, posible eviccion
    const tieneSession = !!localStorage.getItem('sb-' + /* project-ref */ '-auth-token');
    const tieneData = _cache.size > 0;

    if (tieneSession && !tieneData) {
        console.error('[HDVStorage] ⚠️ POSIBLE EVICCION: sesion activa pero 0 datos en cache');
        // Marcar flag para que SyncManager fuerce re-descarga
        _cache.set('_hdv_eviction_detected', true);
        if (typeof mostrarToast === 'function') {
            mostrarToast('Datos locales perdidos. Reconectando con servidor...', 'error');
        }
        return true;
    }
    return false;
}
```

#### Paso 4: setItem con retorno de estado

```javascript
async function setItem(key, value) {
    _cache.set(key, value);
    if (_db) {
        try {
            await _idbPut(key, value);
            return true;  // ← Persistido exitosamente
        } catch (err) {
            console.error('[HDVStorage] ❌ FALLO ESCRITURA IDB:', key, err.name, err.message);
            // Intentar fallback a localStorage para datos criticos
            if (key.startsWith('hdv_pedidos') || key.startsWith('hdv_gastos')) {
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                    console.warn('[HDVStorage] Fallback a localStorage para:', key);
                    return true;
                } catch (e2) {
                    console.error('[HDVStorage] ❌ Fallback localStorage TAMBIEN fallo:', key);
                }
            }
            // ALERTAR AL USUARIO
            if (typeof mostrarToast === 'function') {
                mostrarToast('Error guardando datos. NO cierre la app hasta sincronizar.', 'error');
            }
            return false;  // ← El llamador SABE que fallo
        }
    }
    return false;
}
```

Los consumidores pueden entonces reaccionar:

```javascript
// checkout.js — Ejemplo de uso mejorado:
const ok = await HDVStorage.setItem('hdv_pedidos', pedidos);
if (!ok) {
    mostrarToast('⚠️ Pedido en memoria. Mantenga la app abierta y sincronice.', 'warning');
}
```

---

### 6.2 Solucion para C-03: Gastos/Config particionados por vendedor

#### Opcion A: doc_id compuesto (cambio minimo)

Modificar las funciones de guardar gastos/rendiciones para incluir el vendedor_id en el doc_id:

```javascript
// supabase-config.js — Cambiar de:
function guardarGastos(gastos) { return guardarConfig('gastos_vendedor', gastos); }

// A:
function guardarGastos(gastos) {
    const vendedorId = window.hdvUsuario?.id;
    if (!vendedorId) {
        console.error('[Config] No hay vendedor autenticado para guardar gastos');
        return false;
    }
    return guardarConfig(`gastos_vendedor_${vendedorId}`, gastos);
}

function guardarRendiciones(rendiciones) {
    const vendedorId = window.hdvUsuario?.id;
    if (!vendedorId) return false;
    return guardarConfig(`rendiciones_${vendedorId}`, rendiciones);
}
```

El admin necesita leer todos:

```javascript
// admin.js — Para cargar gastos de TODOS los vendedores:
async function cargarTodosLosGastos() {
    const { data } = await supabaseClient
        .from('configuracion')
        .select('doc_id, datos')
        .like('doc_id', 'gastos_vendedor_%');
    // data = [{ doc_id: 'gastos_vendedor_uuid1', datos: [...] }, ...]
    return data;
}
```

#### Opcion B: Tabla dedicada (mejor a largo plazo)

```sql
-- Migracion SQL:
CREATE TABLE gastos_vendedor (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vendedor_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
    concepto TEXT NOT NULL,
    monto INTEGER NOT NULL CHECK (monto > 0),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- RLS:
ALTER TABLE gastos_vendedor ENABLE ROW LEVEL SECURITY;
-- Vendedor solo ve/escribe los suyos:
CREATE POLICY "vendedor_own_gastos" ON gastos_vendedor
    FOR ALL USING (vendedor_id = auth.uid());
-- Admin ve todos:
CREATE POLICY "admin_all_gastos" ON gastos_vendedor
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin')
    );
```

**Ventaja clave de Opcion B:** Cada gasto es una fila independiente. No hay posibilidad de last-write-wins. RLS aísla vendedores automaticamente. El admin puede hacer queries SQL (ej: total gastos por vendedor por mes).

---

### 6.3 Solucion para C-04: Persistencia incremental en SyncManager

**Objetivo:** Persistir `sincronizado: true` inmediatamente despues de cada pedido exitoso, no al final del batch.

```javascript
// sync.js — Reemplazar el loop actual:

// ANTES (vulnerable):
for (const pedido of pendientes) {
    const ok = await guardarPedido(pedido);
    if (ok) {
        pedido.sincronizado = true;  // Solo RAM
        synced++;
    }
}
if (synced > 0) {
    await HDVStorage.setItem('hdv_pedidos', pedidos);  // 1 write al final
}

// DESPUES (resiliente):
for (const pedido of pendientes) {
    try {
        const ok = await guardarPedido(pedido);
        if (ok) {
            pedido.sincronizado = true;
            // PERSISTIR INMEDIATAMENTE cada pedido exitoso
            await HDVStorage.setItem('hdv_pedidos', pedidos);
            synced++;
            console.log(`[SyncManager] ✅ ${pedido.id} sync + persistido (${synced}/${pendientes.length})`);
        } else {
            // ... manejo de error existente ...
        }
    } catch (err) {
        failed++;
    }
}
// Ya no necesitamos el write final
```

**Costo:** N escrituras a IDB en lugar de 1. En la practica, cada `_idbPut` toma ~1-5ms en IDB (extremadamente rapido comparado con los ~300ms del HTTP request). El overhead total para 50 pedidos: ~250ms adicionales vs ~0ms antes. Completamente aceptable.

**Beneficio:** Si el tab muere despues del pedido #10, los primeros 10 quedan correctamente marcados como sincronizados en IDB.

---

### 6.4 Solucion para M-01: Pre-flight health check con timeout

```javascript
// sync.js — Agregar verificacion real de conectividad:

async function _isSupabaseReachable(timeoutMs = 5000) {
    if (!navigator.onLine) return false;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        // healthCheck hace: SELECT id FROM categorias LIMIT 1
        const ok = await SupabaseService.healthCheck();
        clearTimeout(timer);
        return ok;
    } catch (e) {
        return false;
    }
}

async function syncPedidosPendientes() {
    if (_syncing) return { synced: 0, failed: 0 };

    // Pre-flight: verificar conectividad REAL, no solo navigator.onLine
    if (!await _isSupabaseReachable(5000)) {
        console.warn('[SyncManager] Supabase no accesible (portal cautivo? red lenta?)');
        scheduleRetry(0);
        return { synced: 0, failed: 0 };
    }

    _syncing = true;
    // ... resto del flujo existente
}
```

Para el timeout de las peticiones individuales:

```javascript
// services/supabase.js — Agregar timeout a upsertPedido:
async function upsertPedido(pedido) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000); // 15s max
        const row = { /* ... */ };
        const { error } = await supabaseClient
            .from('pedidos')
            .upsert(row, { onConflict: 'id' })
            // Nota: supabase-js no soporta AbortSignal nativo en .upsert()
            // Alternativa: usar fetch wrapper o Promise.race
        clearTimeout(timer);
        if (error) throw error;
        return { success: true, error: null };
    } catch (error) {
        // ...
    }
}

// Alternativa con Promise.race:
async function upsertPedidoConTimeout(pedido, timeoutMs = 15000) {
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    );
    return Promise.race([
        SupabaseService.upsertPedido(pedido),
        timeoutPromise
    ]);
}
```

---

### 6.5 Solucion para M-02: Batch upsert con progreso visible

```javascript
// sync.js — Reemplazar loop secuencial por batches:

const BATCH_SIZE = 50; // Supabase soporta hasta 1000, 50 es conservador

async function syncPedidosPendientes() {
    // ... pre-checks existentes ...

    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const pendientes = pedidos.filter(p => p.sincronizado === false);
    if (pendientes.length === 0) return { synced: 0, failed: 0 };

    console.log(`[SyncManager] Sincronizando ${pendientes.length} pedidos en batches de ${BATCH_SIZE}...`);

    for (let i = 0; i < pendientes.length; i += BATCH_SIZE) {
        const batch = pendientes.slice(i, i + BATCH_SIZE);
        const rows = batch.map(p => ({
            id: p.id,
            estado: p.estado || 'pedido_pendiente',
            fecha: p.fecha || null,
            datos: p,
            vendedor_id: p.vendedor_id || window.hdvUsuario?.id || null,
            actualizado_en: new Date().toISOString()
        }));

        try {
            const { error } = await supabaseClient
                .from('pedidos')
                .upsert(rows, { onConflict: 'id' });

            if (error) throw error;

            // Marcar todo el batch como sincronizado
            batch.forEach(p => { p.sincronizado = true; });
            synced += batch.length;

            // Persistir despues de cada batch exitoso (solucion C-04)
            await HDVStorage.setItem('hdv_pedidos', pedidos);

            // Progreso visible
            if (typeof mostrarToast === 'function') {
                mostrarToast(`Sincronizando... ${synced}/${pendientes.length}`, 'info');
            }
        } catch (err) {
            console.error(`[SyncManager] Error en batch ${i}-${i + batch.length}:`, err);
            failed += batch.length;
            // No romper el loop — intentar siguiente batch
        }
    }

    // Toast final
    if (typeof mostrarToast === 'function' && synced > 0) {
        mostrarToast(`${synced} pedido${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''}`, 'success');
    }

    if (failed > 0) scheduleRetry(0);
    return { synced, failed };
}
```

**Performance comparado:**

| Escenario | Antes (1 req/pedido) | Despues (batch 50) | Mejora |
|-----------|---------------------|-------------------|--------|
| 50 pedidos, 3G | 40 segundos | 0.8 segundos | **50x** |
| 200 pedidos, 3G | 160 segundos | 3.2 segundos | **50x** |
| 500 pedidos, 3G | 400 segundos | 8 segundos | **50x** |

---

### 6.6 Solucion para M-03: Deep clone en getItem

```javascript
// storage.js — Proteger contra mutacion accidental de cache:

async function getItem(key) {
    if (!_cache.has(key)) return null;
    const val = _cache.get(key);
    // Deep clone para que cada consumidor tenga su propia copia
    if (val !== null && typeof val === 'object') {
        return structuredClone(val);
        // Fallback para navegadores viejos:
        // return JSON.parse(JSON.stringify(val));
    }
    return val;
}
```

**Tradeoff:** `structuredClone` de un array de 500 pedidos (~2MB JSON) toma ~5-15ms en un celular gama media. Es un costo aceptable para la seguridad que provee.

**IMPORTANTE:** Este cambio requiere actualizar TODOS los patrones de read-modify-write en el codebase. Actualmente, el patron es:

```javascript
const pedidos = await HDVStorage.getItem('hdv_pedidos'); // Referencia
pedidos.push(nuevo); // Muta la referencia (muta el cache)
await HDVStorage.setItem('hdv_pedidos', pedidos); // "Guarda" (no-op en cache)
```

Con deep clone seria:

```javascript
const pedidos = await HDVStorage.getItem('hdv_pedidos'); // COPIA independiente
pedidos.push(nuevo); // Muta la copia (cache NO cambia)
await HDVStorage.setItem('hdv_pedidos', pedidos); // Actualiza cache con la copia
```

La semantica es la misma. El unico riesgo es codigo que lea del cache entre el getItem y el setItem — pero con JavaScript single-threaded y sin yields intermedios, esto es seguro.

---

### 6.7 Solucion para M-04: beforeunload en vendedor

```javascript
// Agregar en app.js o al final de sync.js:

window.addEventListener('beforeunload', (e) => {
    // Verificar si hay pedidos sin sincronizar
    // Nota: getItem es async pero podemos leer _cache directamente via la referencia
    // Solucion pragmatica: usar una variable global que SyncManager mantiene
    if (SyncManager._hasPendingSync()) {
        e.preventDefault();
        e.returnValue = 'Tiene pedidos sin sincronizar. ¿Cerrar de todos modos?';
    }
});

// En SyncManager, agregar metodo sync:
function _hasPendingSync() {
    // Acceso directo a cache para evitar async
    const pedidos = HDVStorage._getCacheRef('hdv_pedidos') || [];
    return pedidos.some(p => p.sincronizado === false);
}
```

**Nota sobre `beforeunload` en mobile:** En iOS Safari y Chrome Android, `beforeunload` no es confiable. Los navegadores pueden cerrar pestanas sin disparar el evento. Por eso esta solucion es complementaria a C-01/C-02 (almacenamiento persistente + deteccion de fallo), no un reemplazo.

---

### 6.8 Solucion para M-05: Debounce en canal realtime de pedidos (admin)

```javascript
// supabase-config.js — Agregar debounce al canal de pedidos:

// ANTES:
const unsub = SupabaseService.subscribeTo('pedidos-realtime', 'pedidos', async () => {
    const { data } = await SupabaseService.fetchPedidos();
    // ...
});

// DESPUES:
let _pedidosRealtimeTimeout = null;
const unsub = SupabaseService.subscribeTo('pedidos-realtime', 'pedidos', () => {
    clearTimeout(_pedidosRealtimeTimeout);
    _pedidosRealtimeTimeout = setTimeout(async () => {
        const { data } = await SupabaseService.fetchPedidos();
        // ... merge logic existente ...
    }, 500); // 500ms debounce (igual que catalogo)
});
```

Con esto, 50 eventos realtime en rapida sucesion producen 1 solo fetchPedidos en lugar de 50.

---

### 6.9 Solucion para M-06: Paginacion automatica en fetchPedidos

```javascript
// services/supabase.js — Fetch con paginacion automatica:

async function fetchAllPedidos() {
    const PAGE_SIZE = 500;
    let allData = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await fetchPedidos(PAGE_SIZE, offset);
        if (error) return { data: allData, error };
        allData = allData.concat(data);
        hasMore = data.length === PAGE_SIZE;
        offset += PAGE_SIZE;
    }

    return { data: allData, error: null };
}
```

---

### 6.10 Solucion para B-03: Retry infinito con backoff exponencial

```javascript
// sync.js — Retry que nunca se rinde (con limite maximo):

const MAX_RETRY_DELAY = 300000; // 5 minutos maximo entre reintentos

function scheduleRetry(attempt) {
    if (_retryTimeout) clearTimeout(_retryTimeout);
    // Backoff exponencial con jitter: 5s, 10s, 20s, 40s, 80s, ... max 300s
    const baseDelay = Math.min(5000 * Math.pow(2, attempt), MAX_RETRY_DELAY);
    const jitter = Math.random() * baseDelay * 0.3; // ±30% jitter
    const delay = Math.round(baseDelay + jitter);

    console.log(`[SyncManager] Reintento #${attempt + 1} en ${Math.round(delay / 1000)}s`);

    _retryTimeout = setTimeout(async () => {
        if (navigator.onLine) {
            const result = await syncPedidosPendientes();
            if (result.failed > 0) {
                scheduleRetry(attempt + 1); // SIEMPRE reintenta, sin limite
            }
        } else {
            // Offline: esperar evento 'online' (ya registrado en init)
        }
    }, delay);
}
```

---

## 7. Veredicto y hoja de ruta

### Diagnostico general

El sistema tiene una arquitectura offline-first conceptualmente solida:
- **Local-first:** IndexedDB como fuente primaria, Supabase como sync target
- **Idempotencia:** `upsert` con `onConflict: 'id'` previene duplicados
- **Merge inteligente:** Preserva pedidos locales no sincronizados durante realtime

Sin embargo, la implementacion carece de **defensa en profundidad**. Las 4 fallas criticas revelan un patron comun: **el sistema asume que la persistencia local siempre funciona y que solo hay un escritor por recurso**. En condiciones reales de campo — celulares gama baja, zonas rurales paraguayas con 3G intermitente, portales cautivos de WiFi publico, multiples vendedores — estas suposiciones se rompen.

### Prioridad de remediacion

| Prioridad | ID | Esfuerzo | Riesgo de regresion | Descripcion |
|-----------|-----|---------|---------------------|-------------|
| **1 (URGENTE)** | C-03 | Medio | Bajo | Gastos/config por vendedor. Ocurre en uso NORMAL. |
| **2 (URGENTE)** | C-02 | Bajo | Bajo | setItem retorna exito/fallo + alerta al usuario |
| **3 (ALTO)** | C-01 | Bajo | Ninguno | storage.persist() + deteccion de eviccion |
| **4 (ALTO)** | C-04 | Bajo | Ninguno | Persistencia incremental en SyncManager |
| **5** | M-01 | Bajo | Ninguno | Health check pre-sync + timeout |
| **6** | M-02 | Medio | Bajo | Batch upsert de pedidos |
| **7** | M-04 | Bajo | Ninguno | beforeunload en vendedor |
| **8** | M-05 | Bajo | Ninguno | Debounce en realtime pedidos |
| **9** | M-03 | Medio | Medio | Deep clone en getItem |
| **10** | M-06 | Bajo | Ninguno | Paginacion automatica |
| **11** | B-03 | Bajo | Ninguno | Retry infinito con backoff exponencial |
| **12** | B-01 | Bajo | Ninguno | Server-side actualizado_en |

### Estimacion de esfuerzo total

- Prioridades 1-4 (criticas): ~4 horas de desarrollo + testing
- Prioridades 5-8 (medias): ~3 horas de desarrollo + testing
- Prioridades 9-12 (bajas): ~2 horas de desarrollo + testing
- **Total: ~9 horas para alcanzar 100% de cobertura de las fallas identificadas**

### Metricas de exito post-remediacion

| Metrica | Antes | Despues |
|---------|-------|---------|
| Persistencia detecta fallo y alerta | ❌ | ✅ |
| Almacenamiento persistente solicitado | ❌ | ✅ |
| Eviccion de IDB detectada | ❌ | ✅ |
| Gastos por vendedor aislados | ❌ | ✅ |
| Sync sobrevive tab kill parcial | ❌ | ✅ |
| Portal cautivo detectado pre-sync | ❌ | ✅ |
| Batch sync (50 pedidos = 1 request) | ❌ | ✅ |
| Vendedor ve progreso de sync | ❌ | ✅ |
| beforeunload con pedidos pendientes | ❌ | ✅ |
| Realtime admin con debounce | ❌ | ✅ |

---

*Documento generado como parte de la Auditoria Integral de HDV Distribuciones, Fase 1.*
*Proximo paso: Fase 2 — Seguridad y Autenticacion bajo ataque activo.*
