# FASE 4: Auditoria de Rendimiento y Estres

**Fecha:** 2026-03-27
**Auditor:** Claude (Principal Cloud Performance Engineer)
**Perspectiva:** Android gama baja, 2GB RAM, 3G inestable, 50 vendedores, 5,000 productos, 10,000 pedidos.

---

## HALLAZGOS CRITICOS (Congelan la App)

### CRIT-01: Pedidos Admin Sin Paginacion — 20,000+ nodos DOM de golpe

**Archivo:** `js/admin/pedidos.js:96-111`

`mostrarPedidos()` renderiza TODOS los pedidos filtrados sin limite. Cada tarjeta genera ~40 nodos DOM (7 botones, items con map, badges, iconos Lucide).

**Impacto:** 500 pedidos = **20,000 nodos DOM** insertados sincrona y secuencialmente. En desktop medio: ~3 segundos de freeze. En laptop vieja: 8+ segundos de main thread bloqueado. `lucide.createIcons()` al final recorre TODOS los nodos buscando `<i data-lucide>` — O(n) sobre 20K nodos.

**Estrategia:**
```javascript
// Paginacion identica a clientes.js (ya existe el patron)
const PEDIDOS_POR_PAGINA = 20;
let paginaPedidos = 1;

function mostrarPedidos(pedidos) {
    const container = document.getElementById('listaPedidos');
    if (!container) return;
    _initPedidosDelegation(container);

    const inicio = (paginaPedidos - 1) * PEDIDOS_POR_PAGINA;
    const paginados = pedidos.slice(inicio, inicio + PEDIDOS_POR_PAGINA);
    // Renderizar solo 20 tarjetas + controles de paginacion
}
```

---

### CRIT-02: Vendedor Renderiza Catalogo Completo Sin Paginacion

**Archivo:** `js/vendedor/ui.js:323-348`

El bucle `for (let i = 0; i < filtrados.length; i++)` crea un `div` + asigna `innerHTML` por cada producto. Con 500 productos: 500 `createElement` + 500 `innerHTML` + 500 `appendChild` = **4,000+ nodos DOM** en un solo frame.

Agravante: linea 327 `card.style.animationDelay = \`${i * 0.03}s\`` programa 500 animaciones CSS simultaneas. En Android gama baja, cada animacion fuerza un repaint — **15 segundos de jank visible**.

**Estrategia:**
```javascript
// Renderizado chunked con requestAnimationFrame
function renderizarProductosChunked(filtrados, grid, chunkSize = 30) {
    let idx = 0;
    function renderChunk() {
        const end = Math.min(idx + chunkSize, filtrados.length);
        for (let i = idx; i < end; i++) {
            grid.appendChild(crearCardProducto(filtrados[i], i));
        }
        idx = end;
        if (idx < filtrados.length) requestAnimationFrame(renderChunk);
        else initLazyLoadImages(grid);
    }
    requestAnimationFrame(renderChunk);
}
```

---

### CRIT-03: Realtime Admin Re-Descarga TODOS los Pedidos por Cada Evento

**Archivo:** `supabase-config.js:124-152`

Cada evento realtime (INSERT/UPDATE/DELETE en tabla `pedidos`) dispara `fetchPedidos()` completo — que pagina hasta 5,000 registros. Si un admin cambia 10 estados en 5 segundos, el debounce de 500ms dispara ~2-3 fetches de **5MB cada uno**.

**Impacto en red:** Actividad normal de admin (20 cambios/minuto) = **~40MB de descarga/minuto** solo de pedidos. En 3G (1 Mbps) esto satura la conexion.

**Impacto en memoria:** Cada fetch crea un array nuevo de 5,000 objetos, luego `atomicUpdate` hace merge — dos arrays de 5,000 elementos coexisten en memoria simultaneamente = **~10MB pico por evento**.

**Estrategia:** Delta sync — solo pedir pedidos modificados desde el ultimo timestamp:
```javascript
let _lastFetchTimestamp = null;

// En el callback realtime, en vez de fetchPedidos() completo:
const since = _lastFetchTimestamp || new Date(Date.now() - 60000).toISOString();
const { data } = await supabaseClient
    .from('pedidos')
    .select('id, estado, fecha, datos, vendedor_id')
    .gte('actualizado_en', since)
    .order('actualizado_en', { ascending: false });
_lastFetchTimestamp = new Date().toISOString();
// Merge solo los deltas en el array local
```

---

### CRIT-04: `structuredClone()` en CADA lectura de HDVStorage

**Archivo:** `js/utils/storage.js` — funcion `getItem()`

Cada `getItem('hdv_pedidos')` ejecuta `structuredClone()` sobre el array completo. Con 5,000 pedidos (~4MB), cada lectura crea **4MB adicionales** en heap que el GC debe recolectar.

Frecuencia real: `cargarPedidos()` lee 1x, `aplicarFiltrosPedidos()` no lee (usa `todosLosPedidos`), pero `marcarEntregado/Pendiente` lee 1x + escribe 1x, `SyncManager` lee al arrancar, realtime lee via `atomicUpdate`. En sesion activa de admin: **~20 lecturas/minuto = 80MB de memory churn/minuto**.

En Android gama baja, esto dispara GC agresivo — **micro-freezes de 50-200ms** perceptibles al usuario.

**Estrategia:** Clone condicional — solo clonar cuando el consumidor va a mutar:
```javascript
async function getItem(key, { clone = true } = {}) {
    if (!_cache.has(key)) return null;
    const val = _cache.get(key);
    if (!clone || typeof val !== 'object' || val === null) return val;
    return _deepClone(val);
}
// Lecturas de solo-lectura (render, filtros):
const pedidos = await HDVStorage.getItem('hdv_pedidos', { clone: false });
// Lecturas de mutacion (marcarEntregado, atomicUpdate): clone: true (default)
```

---

## HALLAZGOS MEDIOS (App Lenta)

### MED-01: Cache de Imagenes SW — FIFO en vez de LRU, sin limite de tamano

**Archivo:** `service-worker.js:156-177`

La cache `hdv-imagenes` tiene un limite de **200 entradas** pero sin limite de **tamano total**. La eviccion es FIFO (`cache.delete(keys[0])`) — borra la imagen mas antigua, no la menos usada. Si un vendedor visita siempre los mismos 50 productos, sus imagenes podrian ser eviccionadas por productos que vio una sola vez.

**Impacto:** 200 imagenes WebP x 150KB promedio = **30MB**. Sin LRU, las imagenes utiles se pierden y se re-descargan — consumiendo datos moviles innecesariamente.

Ademas, `cache.keys()` se ejecuta en **cada fetch de imagen** (linea 166), no en background. Con 50 imagenes cargando en paralelo = 50 llamadas a `cache.keys()` simultaneas.

---

### MED-02: `cargarDatosNegocio()` es Secuencial — 8 Fetches en Serie

**Archivo:** `supabase-config.js:593-615`

El bucle `for...of` con `await` dentro ejecuta 8 queries de configuracion **una tras otra**. Si cada query tarda 200ms, la carga total es 1.6 segundos. En 3G con latencia de 500ms: **4 segundos** de espera innecesaria.

**Fix directo:**
```javascript
async function cargarDatosNegocio() {
    await Promise.all(mapeo.map(async (item) => {
        try {
            const datos = await obtenerConfig(item.doc);
            if (datos !== null) await HDVStorage.setItem(item.key, datos);
        } catch(e) { console.warn('[Supabase] Error cargando:', item.doc); }
    }));
}
```

---

### MED-03: `innerHTML +=` en Bucles de Dropdowns (Reflows Multiples)

**Archivos:** `js/admin/productos.js:272`, `js/admin/clientes.js:32-38`

Patron `sel.innerHTML += \`<option>\`` dentro de `forEach` causa N reflows del DOM para N categorias/zonas. Con 50 categorias: 50 reflows consecutivos.

**Fix:** Construir string completo primero, asignar una vez:
```javascript
sel.innerHTML += categorias.map(c =>
    `<option value="${escapeHTML(c.id)}">${escapeHTML(c.nombre)}</option>`
).join('');
```

---

### MED-04: `_cache` de HDVStorage Nunca Se Limpia

**Archivo:** `js/utils/storage.js` — `const _cache = new Map()`

El Map en memoria se carga al init y **nunca se evicta**. En una sesion larga de admin: `hdv_pedidos` (4MB) + `hdv_catalogo_local` (5MB) + 8 configs (~2MB) + carritos huerfanos (~500KB) = **~12MB permanentes** en heap.

En celulares de vendedor: el catalogo + pedidos + carritos puede llegar a **15-20MB** si hay muchos clientes con carritos guardados.

---

### MED-05: Tabs de Admin Persisten en DOM Simultaneamente

**Archivo:** `admin.js` — logica de tabs con `display: none`

Las 9+ secciones del admin (pedidos, productos, clientes, dashboard, creditos, ventas, contabilidad, config, forense) permanecen todas en DOM, solo ocultas con CSS. Los nodos DOM de cada tab se acumulan: ~500 nodos/tab x 9 tabs = **4,500 nodos siempre en memoria**.

---

### MED-06: `fetchPedidos()` Trunca Silenciosamente a 5,000

**Archivo:** `services/supabase.js:13-47`

El cap de 5,000 registros solo imprime `console.warn`. Si un negocio tiene 8,000 pedidos historicos, el admin ve solo 5,000 sin saberlo. Reportes y estadisticas se calculan sobre datos **incompletos**.

---

## HALLAZGOS BAJOS (Consumo Suboptimo)

### LOW-01: `select('*')` en fetchCategorias y fetchClientes

**Archivo:** `services/supabase.js:121-123, 137-140`

`fetchCategorias()` trae `select('*')` incluyendo `subcategorias TEXT[]` que puede ser pesado. `fetchClientes()` trae todas las columnas incluyendo `precios_personalizados JSONB` para admin (puede ser >1KB por cliente).

---

### LOW-02: 500 Animaciones CSS Simultaneas en Catalogo Vendedor

**Archivo:** `js/vendedor/ui.js:327`

`card.style.animationDelay = \`${i * 0.03}s\`` en 500 productos genera 500 timers de animacion. Cada uno fuerza un composite layer. En GPU de gama baja: **frame drops severos** durante los primeros 15 segundos.

---

### LOW-03: Chart.js Re-procesa Todos los Pedidos por Cada Chart

**Archivo:** `js/admin/dashboard.js`

Los charts de ventas semanales y mensuales iteran el array completo de pedidos con `.filter()` cada vez. Con 5,000 pedidos: 3 charts x 5,000 iteraciones = 15,000 operaciones de filtro. No hay cache de datos agregados.

---

### LOW-04: Carritos Huerfanos en IndexedDB

`hdv_carrito_${clienteId}` nunca se limpia cuando un cliente es eliminado. Con 500 clientes historicos: 500 keys huerfanas x ~500 bytes = 250KB de datos zombie.

---

### LOW-05: `fetchCatalogo()` sin Timeout Per-Query

**Archivo:** `services/supabase.js:174-179`

`Promise.all([fetchCategorias(), fetchClientes(), fetchProductosConVariantes()])` sin timeout individual. Si `fetchProductosConVariantes` (la mas pesada) cuelga, las otras dos ya resueltas esperan indefinidamente.

---

## MATRIZ DE PRIORIDAD

| ID | Hallazgo | Severidad | Esfuerzo | Impacto en UX |
|----|----------|-----------|----------|---------------|
| CRIT-01 | Pedidos admin sin paginacion | **CRITICO** | 2h | Freeze 3-8s con 500+ pedidos |
| CRIT-02 | Catalogo vendedor sin chunking | **CRITICO** | 3h | 15s jank en Android gama baja |
| CRIT-03 | Realtime re-descarga todo | **CRITICO** | 4h | 40MB/min descarga, freeze en merge |
| CRIT-04 | structuredClone en cada read | **CRITICO** | 2h | Micro-freezes GC cada 3 segundos |
| MED-01 | Cache imagenes FIFO sin LRU | Medio | 3h | Re-descargas innecesarias, datos moviles |
| MED-02 | Config carga secuencial | Medio | 30min | +4s en tiempo de arranque en 3G |
| MED-03 | innerHTML += en loops | Medio | 30min | Flicker en dropdowns |
| MED-04 | _cache nunca se limpia | Medio | 2h | 15-20MB permanentes en heap |
| MED-05 | Tabs admin persisten en DOM | Medio | 3h | 4,500 nodos zombies |
| MED-06 | Truncado silencioso 5,000 | Medio | 1h | Reportes incompletos sin aviso |
| LOW-01 | select('*') innecesario | Bajo | 1h | Bandwidth extra |
| LOW-02 | 500 animaciones simultaneas | Bajo | 30min | Frame drops 15s |
| LOW-03 | Charts sin cache agregado | Bajo | 2h | Lag en dashboard |
| LOW-04 | Carritos huerfanos | Bajo | 1h | 250KB zombie |
| LOW-05 | Sin timeout per-query | Bajo | 1h | Hang en carga lenta |

---

## PERFIL DE MEMORIA ESTIMADO

### Vendedor (Android gama baja, 2GB RAM)

| Componente | Tamano | Notas |
|------------|--------|-------|
| Browser base + Supabase SDK | ~20MB | Fijo |
| IndexedDB _cache en memoria | ~15MB | Pedidos (4MB) + Catalogo (5MB) + Carritos (1-5MB) + Config (3MB) |
| Arbol DOM catalogo | ~2MB | 1000 product cards en DOM |
| structuredClone durante sync | ~4MB | Temporal durante lecturas getItem |
| Service Worker caches (imagenes) | ~30MB | 200 imagenes WebP x 150KB promedio |
| **Total baseline** | **~71MB** | Puede superar 100MB si la red es lenta |

### Admin (Desktop, 8GB RAM)

| Componente | Tamano | Notas |
|------------|--------|-------|
| Browser base + Supabase SDK | ~25MB | Fijo |
| IndexedDB _cache | ~30MB | Catalogo (5MB) + Pedidos (20MB para admin) + Configs (5MB) |
| Arbol DOM admin | ~30MB | Tablas con 5000+ filas, 9 tabs sin descargar |
| Buffers de suscripcion realtime | ~20MB | Actualizaciones de pedidos en cola |
| Chart.js datasets | ~15MB | Historico 6+ meses |
| **Total baseline** | **~120MB** | Mucho mayor que mobile |

---

## RESUMEN

**4 criticos, 6 medios, 5 bajos.** Los 4 criticos comparten un patron: **se asume volumen pequeno y se opera sobre la totalidad de los datos en cada accion**. La solucion arquitectonica transversal es: paginacion local, delta sync, y clone condicional.

**Esfuerzo estimado total:** ~26 horas (11h criticos + 10h medios + 5.5h bajos)
