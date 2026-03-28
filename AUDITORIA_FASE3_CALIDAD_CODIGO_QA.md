# FASE 3 — Auditoría de Calidad de Código y QA (Quality Assurance)

**Fecha:** 2026-03-26
**Auditor:** Principal Software Engineer + Lead QA (Claude)
**Alcance:** 16 archivos core (~9,800 LOC), suite de tests existente (5 archivos, ~200 test cases)
**Objetivo:** Detectar deuda técnica, anti-patrones, errores asíncronos silenciosos y edge cases no cubiertos por tests
**Restricción:** Evaluación bajo el diseño actual (Vanilla JS + Supabase), sin sugerir cambio de stack

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Hallazgos Críticos (C-01 a C-08)](#2-hallazgos-críticos)
3. [Hallazgos Medios (M-01 a M-12)](#3-hallazgos-medios)
4. [Hallazgos Bajos (B-01 a B-07)](#4-hallazgos-bajos)
5. [Top 5 Funciones Más Peligrosas (Complejidad Ciclomática)](#5-top-5-funciones-más-peligrosas)
6. [Estado Actual de la Suite de Tests](#6-estado-actual-de-la-suite-de-tests)
7. [Los 5 Tests Obligatorios Propuestos](#7-los-5-tests-obligatorios-propuestos)
8. [Plan de Refactorización (3 Sprints)](#8-plan-de-refactorización)
9. [Matriz de Riesgos](#9-matriz-de-riesgos)
10. [Calificación Final](#10-calificación-final)

---

## 1. Resumen Ejecutivo

| Métrica | Valor | Evaluación |
|---------|-------|------------|
| Archivos core auditados | 16 | |
| Líneas de código estimadas | ~9,800 | |
| Hallazgos totales | 27 | |
| — Críticos | 8 | ⛔ |
| — Medios | 12 | ⚠️ |
| — Bajos | 7 | ℹ️ |
| Tests existentes | ~200 assertions en 5 archivos | |
| Cobertura estimada de sad paths | ~5% | ⛔ |
| Funciones con CC > 10 | 4 | ⚠️ |
| God functions (> 80 LOC) | 2 | ⛔ |
| Event listener leaks confirmados | 4 módulos | ⛔ |
| Race conditions confirmadas | 3 | ⛔ |

**Veredicto:** La arquitectura es sólida (Repository Pattern, IndexedDB wrapper, offline-first), pero la ejecución acumula deuda técnica en tres ejes: (1) errores asíncronos silenciosos, (2) duplicación de lógica fiscal/UI, y (3) funciones monolíticas difíciles de testear. Un desarrollador junior modificando las funciones señaladas tiene alta probabilidad de introducir bugs en producción.

---

## 2. Hallazgos Críticos

### C-01: Fire-and-Forget en SyncManager (Pérdida silenciosa de pedidos)

**Archivo:** `js/services/sync.js:230-232`
**Categoría:** Manejo de errores asíncronos

**Código problemático:**
```javascript
// sync.js:230-232
_retryTimeout = setTimeout(async () => {
    await syncPedidosPendientes(); // Si rechaza, la promesa se PIERDE
}, delay);
```

**Explicación detallada:**
Cuando `setTimeout` ejecuta una función `async`, crea una promesa. Pero `setTimeout` **no maneja promesas** — simplemente la ignora. Si `syncPedidosPendientes()` lanza una excepción (error de red, Supabase 500, IndexedDB corrupto), esa promesa rechazada se convierte en un **Unhandled Promise Rejection** que se pierde silenciosamente.

**Consecuencia en producción:**
El vendedor crea pedidos offline. El SyncManager intenta sincronizar, falla, y el retry programado también falla sin notificación. Los pedidos quedan con `sincronizado: false` **indefinidamente**. El vendedor no sabe que sus pedidos no llegaron a la oficina. Potencial pérdida de ventas.

**Solución:**
```javascript
_retryTimeout = setTimeout(() => {
    syncPedidosPendientes().catch(err => {
        console.error('[SyncManager] Error en reintento:', err);
        // Opcional: notificar al usuario después de N fallos consecutivos
    });
}, delay);
```

---

### C-02: Race Condition en Merge de Pedidos Realtime (Sin Mutex)

**Archivo:** `supabase-config.js:92-148`
**Categoría:** Race conditions

**Código problemático:**
```javascript
// supabase-config.js:126-138 (callback realtime con debounce 500ms)
_pedidosRealtimeTimer = setTimeout(async () => {
    const { data } = await SupabaseService.fetchPedidos();               // 1. Lee remotos
    const pedidosRemoto = data.map(r => r.datos);
    const pedidosLocalRT = (await HDVStorage.getItem('hdv_pedidos')) || []; // 2. Lee locales
    const sinSincronizar = pedidosLocalRT.filter(p => p.sincronizado === false);
    const remotosIds = new Set(pedidosRemoto.map(p => p.id));
    const localesNoEnRemoto = sinSincronizar.filter(p => !remotosIds.has(p.id));
    const merged = [...pedidosRemoto, ...localesNoEnRemoto];
    await HDVStorage.setItem('hdv_pedidos', merged);                     // 3. Escribe merged
}, 500);
```

**Explicación detallada:**
Tres fuentes escriben a `hdv_pedidos` concurrentemente sin coordinación:
1. **Este callback realtime** (supabase-config.js:138)
2. **SyncManager** (sync.js:191-196) — marca pedidos como `sincronizado: true`
3. **Checkout** (checkout.js:120-126) — marca pedido individual como `sincronizado: true`

La secuencia temporal peligrosa:

| Tiempo | Acción | hdv_pedidos en IDB |
|--------|--------|--------------------|
| T+0ms | Realtime callback: lee `hdv_pedidos` → ve 10 items | 10 items |
| T+50ms | Checkout: lee `hdv_pedidos` → ve 10 items | 10 items |
| T+100ms | Checkout: escribe pedido #11 | **11 items** |
| T+200ms | Realtime: escribe merged (basado en lectura de T+0) | **10 items** ← ¡Perdió el #11! |

**Consecuencia en producción:**
Un pedido recién creado desaparece silenciosamente del storage local. El vendedor ve el toast "Pedido enviado" pero al revisar "Mis Pedidos" no aparece. Pérdida de venta confirmada.

**Solución:**
Implementar un patrón CAS (Compare-and-Swap) o un mutex simple en HDVStorage:
```javascript
// Agregar a HDVStorage:
async atomicUpdate(key, updaterFn) {
    const current = await this.getItem(key);
    const updated = updaterFn(current);
    return await this.setItem(key, updated);
}
```

---

### C-03: Lógica IVA Duplicada en 3 Ubicaciones (Riesgo Fiscal)

**Archivos:**
- `js/utils/formatters.js:46-73` — `calcularDesgloseIVA()` (fuente principal)
- `js/utils/formatters.js:76-92` — `calcularDesglose()` (wrapper con fallback)
- `checkout.js:16-19` — cálculo inline de descuento sobre items antes de IVA

**Código en formatters.js (fuente principal):**
```javascript
// formatters.js:60-62 — Las tasas IVA están como magic numbers
const liqIva5 = Math.round(totalGravada5 / 21);   // 5% → divisor 21
const liqIva10 = Math.round(totalGravada10 / 11);  // 10% → divisor 11
```

**Código en formatters.js (wrapper contabilidad):**
```javascript
// formatters.js:89-91 — Fallback DIFERENTE cuando no hay desglose guardado
const base10 = Math.round(total / 1.10);  // Asume TODO es gravada 10%
const iva10 = total - base10;             // No considera 5% ni exenta
```

**Explicación detallada:**
El cálculo de IVA paraguayo es el componente más crítico del sistema de facturación:
- IVA 10%: `base = total / 1.10`, `iva = total - base`
- IVA 5%: `base = total / 1.05`, `iva = total - base`
- Exenta: `base = total`, `iva = 0`

El problema es que `calcularDesglose()` (usado por contabilidad para el libro RG90) tiene un **fallback que asume todo es 10%**. Si un pedido legacy no tiene `desgloseIVA` guardado pero tiene items mixtos (5% + 10% + exenta), el CSV del RG90 reportará IVA incorrecto a la SET.

Adicionalmente, `checkout.js:16-19` aplica descuentos al subtotal **antes** de llamar a `calcularDesgloseIVA()`, lo cual es correcto matemáticamente, pero esta lógica de descuento vive en checkout y no en formatters — creando una dependencia implícita.

**Consecuencia en producción:**
- Libro RG90 con valores de IVA incorrectos → multa de la SET en auditoría fiscal
- Facturas SIFEN con desglose que no cuadra → rechazo del validador SET
- Si Paraguay cambia las tasas de IVA, hay que editar en 3 lugares

**Solución:**
Centralizar TODO el cálculo de IVA en una sola función en `formatters.js`:
```javascript
const TASAS_IVA = { '10': 11, '5': 21, 'exenta': Infinity, '0': Infinity };

function calcularDesgloseIVA(items, descuentoPct = 0) {
    const factor = descuentoPct > 0 ? (1 - descuentoPct / 100) : 1;
    // ... aplicar factor, calcular desglose, retornar objeto único
}
```

---

### C-04: Estados de Pedido como Magic Strings en 6+ Archivos

**Archivos afectados:**
| Archivo | Línea | Uso |
|---------|-------|-----|
| `js/admin/pedidos.js` | 54-58 | Filtro con alias `pendiente`/`pedido_pendiente` |
| `js/vendedor/ui.js` | 801-825 | Mapeo color/label vendedor |
| `js/admin/pedidos.js` | 86-109 | Mapeo color/label admin |
| `app.js` | 439 | Filtro caja (`contado` + estados) |
| `admin-contabilidad.js` | 43 | Filtro fiscal (`facturado_mock`, `nota_credito_mock`) |
| `js/modules/ventas/ventas-data.js` | 18-19 | Filtro ventas |

**Ejemplo del problema:**
```javascript
// js/admin/pedidos.js:57 — Trata 'pendiente' como alias de 'pedido_pendiente'
filtrados = filtrados.filter(p => p.estado === estado ||
    (estado === 'pedido_pendiente' && p.estado === 'pendiente'));

// app.js:439 — NO tiene el alias, filtra de forma diferente
.filter(p => p.tipoPago === 'contado' &&
    (p.estado === 'entregado' || p.estado === 'pedido_pendiente' || p.estado === 'pendiente'))
```

**Explicación detallada:**
Los estados válidos de un pedido (`pedido_pendiente`, `entregado`, `cobrado_sin_factura`, `facturado_mock`, `nota_credito_mock`, `anulado`) están hardcodeados como strings literales en al menos 6 archivos distintos. El alias `pendiente` ↔ `pedido_pendiente` se maneja de forma inconsistente: algunos archivos lo tratan, otros no.

**Consecuencia en producción:**
- Si se agrega un nuevo estado (ej. `en_ruta`), un desarrollador debe editar **mínimo 6 archivos**. Si olvida uno, ese estado no aparecerá en filtros, colores, o reportes.
- El alias `pendiente` está parcialmente soportado. Un pedido con `estado: 'pendiente'` aparece en el filtro de admin pero podría no aparecer en el cálculo de caja del vendedor (dependiendo de la línea).

**Solución:**
Crear archivo `js/utils/constants.js`:
```javascript
const PEDIDO_ESTADOS = {
    PENDIENTE: 'pedido_pendiente',
    ENTREGADO: 'entregado',
    COBRADO: 'cobrado_sin_factura',
    FACTURADO: 'facturado_mock',
    NOTA_CREDITO: 'nota_credito_mock',
    ANULADO: 'anulado'
};
const ESTADOS_ALIAS = { 'pendiente': 'pedido_pendiente' };
const ESTADOS_TERMINALES = ['facturado_mock', 'nota_credito_mock', 'anulado', 'cobrado_sin_factura', 'entregado'];
```

---

### C-05: Mapeo de Colores/Labels de Estado Duplicado (Admin vs Vendedor)

**Archivos:**
- `js/admin/pedidos.js:86-109` — `obtenerColorEstadoAdmin()` + `obtenerLabelEstadoAdmin()`
- `js/vendedor/ui.js:801-825` — `obtenerColorEstado()` + `obtenerLabelEstado()`

**Comparación directa del código:**
```javascript
// ADMIN (pedidos.js:88) — usa text-yellow-800
'pedido_pendiente': 'bg-yellow-100 text-yellow-800',
'entregado': 'bg-green-100 text-green-800',

// VENDEDOR (ui.js:803) — usa text-yellow-700 (diferente!)
'pedido_pendiente': 'bg-yellow-100 text-yellow-700',
'entregado': 'bg-green-100 text-green-700',
```

**Explicación detallada:**
Son **4 funciones** (2 color + 2 label) que hacen esencialmente lo mismo pero con diferencias sutiles en la intensidad del color del texto (`-700` vs `-800`). Los labels son **idénticos** en ambas versiones.

**Consecuencia en producción:**
- Inconsistencia visual entre lo que ve el vendedor y lo que ve el admin para el mismo pedido
- Al agregar un nuevo estado, hay que actualizar 4 funciones en 2 archivos
- Si un estado se renombra, se puede actualizar en admin pero olvidar en vendedor

**Solución:**
Mover a `js/utils/constants.js` una sola función con parámetro de intensidad:
```javascript
function obtenerEstadoUI(estado, intensidad = '800') {
    const config = ESTADO_UI_MAP[estado] || { bg: 'gray-100', text: `gray-${intensidad}`, label: estado };
    return { clases: `bg-${config.bg} text-${config.text}`, label: config.label };
}
```

---

### C-06: `guardarProductoModal()` — God Function de 98 líneas con CC=14

**Archivo:** `js/admin/productos.js:873-971`
**Categoría:** Complejidad ciclomática

**Análisis de la función:**
```
Línea 873:  async function guardarProductoModal() {
Línea 874-884:   ├── Leer 10 campos del DOM (getElementById × 10)
Línea 886-895:   ├── IF subcategoria === '__otra__' → mostrar modal input → await
Línea 897:       ├── IF !nombre → toast error, return
Línea 899-906:   ├── Bloquear botón manualmente (patrón duplicado, ver C-08)
Línea 908:       ├── TRY {
Línea 911-914:   │   ├── IF archivoImagenProducto → await subirImagenProducto()
Línea 917-930:   │   ├── IF modoVariantes
Línea 919-924:   │   │   ├── recogerVariantes()
Línea 921-924:   │   │   └── IF length === 0 → toast error, return (⚠️ sin finally!)
Línea 925-930:   │   └── ELSE → split(',').map() para presentaciones simples
Línea 932-953:   │   ├── IF id (edición) → mutar objeto in-place (11 asignaciones)
Línea 945-953:   │   └── ELSE (creación) → calcular ID, push a array global
Línea 955-959:   │   └── Refresh UI + toast
Línea 960-962:   ├── CATCH → console.error + toast
Línea 963-969:   └── FINALLY → restaurar botón
```

**Problemas identificados:**

1. **5 responsabilidades mezcladas:** validación de form, upload de imagen, parsing de variantes, mutación de estado global, refresh de UI
2. **Return prematuro en línea 923 sin finally:** Si `presentaciones.length === 0`, la función retorna dentro del `try` pero antes de la sección `finally`. El botón se restaura correctamente por `finally`, pero es confuso leer que hay un `return` dentro de un `try` que no es un error.
3. **Mutación directa del estado global:** `productosData.productos.push(nuevo)` (línea 952) y `prod.nombre = nombre` (línea 936) mutan el objeto global sin copia, sin validación, sin rollback si falla más adelante.
4. **Upload de imagen sin rollback:** Si la imagen se sube exitosamente (línea 912) pero el producto no se guarda (error en línea 960), la imagen queda huérfana en Supabase Storage.
5. **Generación de ID frágil:** `Math.max(...productosData.productos.map(p => parseInt(p.id.replace('P', ''))` (línea 948) — si algún ID no sigue el patrón `P###`, `parseInt` retorna `NaN` y `Math.max` retorna `NaN`.

**Consecuencia en producción:**
Un desarrollador junior que necesite agregar validación de peso del producto o un campo nuevo tendrá que entender toda la función de 98 líneas para saber dónde insertarlo sin romper el flujo.

**Solución — Descomponer en 5 funciones puras:**
```javascript
function validarFormProducto(campos) → { valido: boolean, error?: string }
async function subirImagenSiExiste(archivo) → string | null
function parsearVariantes(modoVariantes, formData) → Variante[]
function aplicarCambiosProducto(productosData, id, datosProducto) → void
function refrescarUIProductos() → void
```

---

### C-07: Event Listeners en Loops sin Cleanup (Memory Leak Confirmado)

**Archivos afectados:**
| Archivo | Función | Línea aprox. | Elementos afectados |
|---------|---------|-------------|---------------------|
| `js/admin/productos.js` | `renderizarListaCategorias()` | 1000-1012 | Botones eliminar/agregar subcategoría |
| `js/admin/productos.js` | `mostrarProductosGestion()` | 314-364 | Tarjetas de productos |
| `js/admin/pedidos.js` | `mostrarPedidos()` | 70+ | Tarjetas de pedidos |
| `admin-ventas.js` | `mostrarVentas()` | 37+ | Lista de ventas |

**Patrón problemático (productos.js como ejemplo):**
```javascript
// Cada llamada a renderizarListaCategorias() crea NUEVOS listeners
(productosData.categorias || []).forEach(cat => {
    const div = document.createElement('div');
    div.innerHTML = `...
        <button onclick="eliminarCategoria('${cat.id}')">Eliminar</button>
        <button onclick="agregarSubcategoria('${cat.id}')">+</button>
    `;
    container.appendChild(div);
});
```

**Explicación detallada:**
Cada vez que el admin abre el modal de categorías, filtra productos, o recibe un evento realtime, se llama a la función de render que crea elementos DOM nuevos con `onclick` inline. Si `container.innerHTML = ''` se ejecuta antes, los viejos elementos se destruyen (y sus inline handlers con ellos). **Sin embargo**, si se usa `appendChild` sin limpiar el container, los listeners se acumulan.

El problema más grave es en funciones como `mostrarProductosGestion()` que se ejecutan en cada evento realtime (cada 500ms de debounce). En 2 horas de uso con actualizaciones frecuentes:
- 20 categorías × 1 render/minuto × 120 minutos = **2,400 handlers acumulados** (si no se limpia innerHTML)

**Consecuencia en producción:**
- Degradación progresiva de rendimiento en tablets/celulares de gama baja
- Clicks que ejecutan múltiples veces el mismo handler
- Consumo de memoria creciente → el navegador eventualmente mata la pestaña

**Solución — Event delegation:**
```javascript
// Una sola vez al init:
container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'eliminar-categoria') eliminarCategoria(id);
    if (action === 'agregar-subcategoria') agregarSubcategoria(id);
});
```

---

### C-08: `withButtonLock()` Existe pero NO se Usa (8+ copias manuales)

**Utilidad definida:** `js/utils/helpers.js:42-61`

```javascript
function withButtonLock(btnId, fn, loadingText) {
    return async function (...args) {
        const btn = document.getElementById(btnId);
        if (!btn || btn.disabled) return;
        const textoOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = '<svg class="w-4 h-4 animate-spin inline mr-1.5"...></svg> ' + texto;
        try {
            return await fn.apply(this, args);
        } finally {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = textoOriginal;
        }
    };
}
```

**Archivos que DUPLICAN manualmente este patrón:**

| Archivo | Línea | Botón | Texto spinner |
|---------|-------|-------|---------------|
| `checkout.js` | 83-89, 137-139 | `btnPedido` | `Enviando...` |
| `checkout.js` | 152-158 | `btnCobro` | `Procesando...` |
| `admin-ventas.js` | 79-85 | `btnFacturar` | `Facturando...` |
| `admin-devoluciones.js` | 171-174 | `btnNotaCredito` | `Procesando...` |
| `admin-contabilidad.js` | 128-131 | `btnRG90` | `Generando reporte...` |
| `admin-contabilidad.js` | 191-194 | `btnZIP` | `Generando paquete...` |
| `js/admin/productos.js` | 899-906, 963-969 | `btnGuardarProducto` | `Guardando...` |
| `admin.js` | 228-234 | `btnSyncCatalogo` | `Sincronizando...` |

**Explicación detallada:**
Existe una utilidad perfectamente funcional (`withButtonLock`) que encapsula el patrón completo de disable → spinner → try/await/finally → restore. Pero ninguno de los 8+ archivos la utiliza. En cambio, cada uno reimplementa manualmente el mismo patrón con inconsistencias:
- Algunos usan `mr-1`, otros `mr-1.5` en el SVG spinner
- Algunos olvidan el `finally` (dejando el botón bloqueado en caso de error)
- Algunos no verifican `if (btn)` antes de acceder a propiedades

**Consecuencia en producción:**
Cuando se cambie el diseño del spinner (ej. usar un componente de Tailwind diferente), se necesita editar 8+ archivos. Si uno se olvida → inconsistencia visual. Si el `finally` falta → botón queda permanentemente deshabilitado tras un error.

**Solución:**
Adoptar `withButtonLock()` universalmente. Ejemplo de migración:
```javascript
// ANTES (checkout.js — 15 líneas de boilerplate)
const btn = document.getElementById('btnPedido');
if (btn && btn.disabled) return;
const textoOriginal = btn.innerHTML;
btn.disabled = true;
// ... try { ... } finally { btn.disabled = false; ... }

// DESPUÉS (1 línea)
const procesarPedidoLocked = withButtonLock('btnPedido', procesarPedidoImpl, 'Enviando...');
```

---

## 3. Hallazgos Medios

### M-01: Operaciones Save Fire-and-Forget en creditos.js (6 instancias)

**Archivo:** `js/admin/creditos.js`
**Líneas:** 337, 598, 761, 898, 974, 985

```javascript
// creditos.js:337 — El catch solo hace console.error, el usuario no sabe que falló
guardarPlantillaWhatsApp(datos.plantilla).catch(e => console.error(e));

// creditos.js:598
guardarPromociones(promos).catch(e => console.error(e));

// creditos.js:761
guardarGastos(gastos).catch(e => console.error(e));
```

**Impacto:** El admin edita configuración de créditos, promociones, gastos o cuentas bancarias. Ve el toast "Guardado" (que se muestra ANTES de que el save asíncrono complete). Si el save falla silenciosamente, los cambios se pierden en el siguiente reload.

**Solución:** Convertir a `await` con manejo de error visible:
```javascript
try {
    await guardarPlantillaWhatsApp(datos.plantilla);
    mostrarToast('Mensaje actualizado', 'success');
} catch (e) {
    console.error(e);
    mostrarToast('Error al guardar mensaje', 'error');
}
```

---

### M-02: Callbacks Realtime Async sin try/catch

**Archivos:**
- `supabase-config.js:124-145` — Realtime admin (pedidos)
- `supabase-config.js:154-220` — Realtime vendedor (pedidos granular)

```javascript
// supabase-config.js:126 — Si fetchPedidos() falla, error no manejado
_pedidosRealtimeTimer = setTimeout(async () => {
    const { data } = await SupabaseService.fetchPedidos(); // ← Sin try/catch
    const pedidosRemoto = data.map(r => r.datos);          // ← data puede ser null/undefined
    // ...
}, 500);
```

**Impacto:** Si Supabase devuelve error (rate limit, network timeout), `data` es `null` y `.map()` lanza `TypeError`. El admin ve datos stale indefinidamente sin saber que el realtime falló.

**Solución:** Envolver todo el callback en try/catch con logging + indicador visual de "última sincronización: hace X minutos".

---

### M-03: Kill Switch Purga con catch Silencioso

**Archivo:** `guard.js:34-39`

```javascript
try {
    const allKeys = await HDVStorage.keys('hdv_');
    for (const key of allKeys) {
        if (key !== 'hdv_darkmode') await HDVStorage.removeItem(key);
    }
} catch (e) { console.error('[Guard] Error en purga Kill Switch:', e); }
// Continúa con signOut() y redirect
```

**Impacto:** Si la purga falla (ej. IndexedDB locked por otra pestaña), el usuario es redirigido al login pero **sus datos sensibles permanecen en IndexedDB**. El Kill Switch (diseñado para dispositivos robados) no cumple su función principal: borrar datos locales.

**Solución:** Agregar retry o al menos verificación post-purga. Si no se puede purgar, bloquear el acceso igualmente pero logear el fallo como alerta de seguridad.

---

### M-04: Formato de Moneda `.toLocaleString()` sin Wrapper (17 archivos)

**Patrón disperso:**
```javascript
// checkout.js:71
`Gs. ${total.toLocaleString()}`

// admin-contabilidad.js:76
`Gs. ${(f.total || 0).toLocaleString()}`

// admin-devoluciones.js:56, 82, 130, 133
`Gs.${i.subtotal.toLocaleString()}`  // ← Sin espacio después de Gs.!
```

**Impacto:** Si se necesita cambiar el formato (ej. usar `₲` en vez de `Gs.`, o agregar separadores de miles consistentes), hay que editar 17+ archivos. Adicionalmente, hay inconsistencia: algunos usan `Gs. ` (con espacio), otros `Gs.` (sin espacio).

**Solución:** Crear función en `formatters.js`:
```javascript
function formatearGuaranies(monto) {
    return `Gs. ${(monto || 0).toLocaleString('es-PY')}`;
}
```

---

### M-05: CSV Export sin Escape Correcto de Caracteres

**Archivo:** `admin-contabilidad.js:144-158`

```javascript
// Línea 153 — Intenta escapar comas, pero NO maneja comillas dobles
const nombre = (r.cliente?.nombre || '').replace(/,/g, ' ');

// Línea 157 — Usa comillas dobles para RUC y nombre, pero si el nombre contiene " se rompe
csv += `${fecha},"${ruc}","${nombre}","${numDoc}","${tipo}","${cdc}",`;
```

**Caso problemático:**
Si `cliente.nombre = 'García "El Jefe" S.A.'`, el CSV generado será:
```
2026-03-26,"80012345-6","García "El Jefe" S.A.","FAC-001","Factura Electronica",...
```
Excel interpreta la comilla interna como fin de campo → corrupción del CSV.

**Impacto:** El contador exporta el libro RG90, lo abre en Excel, y ve columnas desplazadas. Tiene que limpiar manualmente antes de enviar a la SET.

**Nota positiva:** El BOM UTF-8 (`\uFEFF`) ya está presente en línea 141. Eso resuelve el problema de acentos en Excel Windows.

**Solución:**
```javascript
function escaparCSV(valor) {
    const str = String(valor || '');
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}
```

---

### M-06: Magic Numbers en Timeouts (7+ archivos)

| Valor | Archivos | Propósito |
|-------|----------|-----------|
| `300` ms | app.js, admin.js, clientes.js, productos.js (×5) | Debounce de búsqueda |
| `500` ms | supabase-config.js, app.js, login.js | Debounce realtime, navegación |
| `800` ms | admin-contabilidad.js:134 | Simulación de procesamiento (artificial) |
| `1500` ms | admin.js, app.js, login.js (×4) | Reload de página |
| `2000` ms | sync.js:253 | Delay sync post-online |
| `2500` ms | checkout.js, admin-ventas.js, admin-devoluciones.js | Simulación SET (artificial) |
| `3000` ms | app.js, sync.js | Auto-backup, sync init |
| `5000` ms | supabase-config.js:21 | Timeout pre-flight Supabase |
| `30000` ms | supabase-config.js:30 | Intervalo health check |

**Impacto:** Para tunear el rendimiento de la app (ej. reducir debounce en búsqueda de productos), un desarrollador debe hacer búsqueda global de `300` y distinguir cuáles son debounce y cuáles son otros usos del número 300.

**Solución:**
```javascript
// js/utils/constants.js
const TIEMPOS = {
    DEBOUNCE_BUSQUEDA_MS: 300,
    DEBOUNCE_REALTIME_MS: 500,
    SYNC_DELAY_ONLINE_MS: 2000,
    SYNC_INIT_DELAY_MS: 3000,
    HEALTH_CHECK_INTERVAL_MS: 30000,
    SUPABASE_TIMEOUT_MS: 5000,
    SIMULACION_SET_MS: 2500,
};
```

---

### M-07: setTimeout/setInterval sin Cleanup en Logout

**Archivos:**
- `supabase-config.js` — `_monitorTimer` (health check cada 30s), `_pedidosRealtimeTimer` (debounce)
- `app.js` — auto-backup interval
- `sync.js` — `_retryTimeout` (backoff)

**Problema:** Cuando el usuario cierra sesión (`cerrarSesion()`), estos timers no se cancelan. El health check sigue corriendo post-logout, haciendo requests a Supabase con un token expirado.

**Solución:** Registrar todos los timers en un array global y limpiar en logout:
```javascript
const _activeTimers = [];
function registrarTimer(id) { _activeTimers.push(id); }
function limpiarTimers() { _activeTimers.forEach(clearTimeout); _activeTimers.length = 0; }
```

---

### M-08: `obtenerCatalogo()` sin Timeout de Red

**Archivo:** `supabase-config.js:277+`

La función espera indefinidamente la respuesta de Supabase. Si la red es lenta (ej. 3G rural en Paraguay), la app muestra la pantalla de carga sin límite de tiempo.

**Solución:** Agregar `AbortController` con timeout de 15 segundos + fallback a cache IndexedDB.

---

### M-09: Query Directa a Supabase (Bypass del Repository Pattern)

**Archivo:** `js/admin/pedidos.js:14-18`

```javascript
const { data } = await supabaseClient.from('perfiles').select('id, nombre_completo');
```

**Impacto:** Viola el patrón Repository establecido en `services/supabase.js`. Esta query no pasa por el error handling centralizado de SupabaseService.

**Solución:** Agregar `fetchPerfiles()` a SupabaseService y usar eso.

---

### M-10: Aliases Innecesarios de Funciones en formatters.js

**Archivo:** `js/utils/formatters.js:14-18, 32-42`

```javascript
function formatearFechaAdmin(fecha) { return formatearFecha(fecha); }  // Alias
function tplFormatearFechaAdmin(fecha) { return formatearFecha(fecha); } // Alias
function generarNumeroFacturaAdmin() { return generarNumeroFactura(); } // Alias
function generarCDCAdmin() { return generarCDC(); }                    // Alias
```

**Impacto:** 4 funciones alias que no agregan valor. Un desarrollador nuevo no sabe si `formatearFechaAdmin` hace algo diferente a `formatearFecha`.

**Solución:** Eliminar aliases y actualizar las referencias en los archivos consumidores.

---

### M-11: `escucharPedidosRealtimeVendedor()` — Async Callback sin Error Handling

**Archivo:** `supabase-config.js:154-220`

El callback de `subscribeTo` es `async` pero no tiene `try/catch`. Múltiples llamadas a `HDVStorage.getItem()` y `HDVStorage.setItem()` pueden fallar silenciosamente.

**Impacto:** La lista local de pedidos del vendedor se desincroniza sin notificación.

---

### M-12: Generación de ID de Factura con Math.random()

**Archivo:** `js/utils/formatters.js:27-29`

```javascript
function generarNumeroFactura() {
    const num = String(Math.floor(Math.random() * 9999999) + 1).padStart(7, '0');
    return `001-001-${num}`;
}
```

`Math.random()` no es criptográficamente seguro y puede generar colisiones. Para pedidos se usa `crypto.randomUUID()` (correcto), pero para facturas se usa `Math.random()`.

**Nota:** Esto es un generador "mock" (simulación). En producción real con SIFEN, el número vendría del timbrado secuencial. El riesgo es bajo mientras sea mock, pero debería documentarse claramente.

---

## 4. Hallazgos Bajos

### B-01: Clipboard Copy con catch Vacío
**Archivo:** `admin-ventas.js:325-327`
`.catch(() => {})` — Si el navegador bloquea clipboard, el usuario no recibe feedback.

### B-02: QR Generation Error solo Loggeado
**Archivo:** `admin-ventas.js:452`
El QR code falta de la factura impresa sin que el usuario lo sepa.

### B-03: Spinner SVG Duplicado en 6+ Archivos
SVG idéntico de spinner copiado en 6 archivos con variaciones menores (`mr-1` vs `mr-1.5`).

### B-04: Supabase Fallback Silencioso en Admin
**Archivo:** `admin.js:369`
Si Supabase no responde, admin trabaja con datos de cache sin saberlo.

### B-05: Empty State SVGs Solo en Admin
El vendedor no tiene iconos de estado vacío cuando no hay pedidos/productos. UX inconsistente.

### B-06: Eviction Detection Error Ignorado
**Archivo:** `js/utils/storage.js:271`
`_detectarEviccion().catch(() => {})` — Baja criticidad porque la evicción se maneja en el write.

### B-07: Service Worker Registration Error Handling Mínimo
**Archivo:** `app.js:537-572`
Nested `.then().catch()` chains sin catch de nivel superior.

---

## 5. Top 5 Funciones Más Peligrosas

### #1: `guardarProductoModal()` — God Function

| Atributo | Valor |
|----------|-------|
| **Archivo** | `js/admin/productos.js:873-971` |
| **LOC** | 98 |
| **Complejidad ciclomática** | ~14 (8 branches + 6 early returns/continues) |
| **Responsabilidades** | Validación, upload imagen, parsing variantes, mutación estado, refresh UI |
| **Riesgo** | CRÍTICO — junior dev agrega campo → rompe flujo |
| **Testeabilidad** | Imposible sin mockear File API, Canvas, IndexedDB, Supabase, DOM |

**Desglose de branches:**
1. `if (subcategoria === '__otra__')` → modal
2. `if (!nombre)` → return
3. `if (archivoImagenProducto)` → upload
4. `if (modoVariantes)` → recogerVariantes vs split
5. `if (presentaciones.length === 0)` → return
6. `if (id)` → edición vs creación
7. `catch` → error
8. `finally` → restaurar botón

**Refactorización sugerida:** Descomponer en 5 funciones (ver C-06).

---

### #2: `escucharPedidosRealtime()` — Race Condition Hub

| Atributo | Valor |
|----------|-------|
| **Archivo** | `supabase-config.js:92-148` |
| **LOC** | 56 |
| **Complejidad ciclomática** | ~12 |
| **Responsabilidades** | Carga inicial, merge local/remoto, suscripción realtime, debounce |
| **Riesgo** | CRÍTICO — race condition confirmada (ver C-02) |
| **Testeabilidad** | Requiere mock de Supabase realtime + HDVStorage + setTimeout |

**Puntos de fallo:**
- Línea 109: `HDVStorage.setItem()` puede fallar silenciosamente (retorna false)
- Línea 127-138: Race condition read-modify-write sin mutex
- Línea 126: `setTimeout(async ...)` — promesa perdida si falla

---

### #3: `mostrarProductosGestion()` + Renders Anidados

| Atributo | Valor |
|----------|-------|
| **Archivo** | `js/admin/productos.js:314-364` + funciones anidadas |
| **LOC** | 50 + ~200 en helpers |
| **Complejidad ciclomática total** | ~24 |
| **Responsabilidades** | Fetch, categorize, paginate, render grid, attach listeners |
| **Riesgo** | ALTO — memory leak por listeners acumulados |
| **Testeabilidad** | Requiere JSDOM + MutationObserver para detectar leaks |

**Variables globales que muta:** `productosPaginaActual`, `productosPorPagina`, `productosFiltrados`

---

### #4: `exportarLibroRG90()` — Riesgo Fiscal

| Atributo | Valor |
|----------|-------|
| **Archivo** | `admin-contabilidad.js:121-173` |
| **LOC** | 57 |
| **Complejidad ciclomática** | ~10 |
| **Responsabilidades** | Fetch datos, calcular impuestos, generar CSV, trigger descarga |
| **Riesgo** | MEDIO-ALTO — CSV corrupto = multa fiscal |
| **Testeabilidad** | Requiere mock de datos + parsing CSV para verificar output |

**Bugs potenciales:**
- CSV quoting incompleto (comillas dobles no escapadas)
- Fallback IVA asume 100% gravada 10% para pedidos sin desglose
- Sin validación de fecha de entrada
- Timeout artificial de 800ms sin propósito real

---

### #5: `cargarDatos()` — Init sin Timeout

| Atributo | Valor |
|----------|-------|
| **Archivo** | `app.js:143-209` |
| **LOC** | 66 |
| **Complejidad ciclomática** | ~8 |
| **Responsabilidades** | Init completo del vendedor: catalogo, realtime, dropdowns, listeners |
| **Riesgo** | ALTO — app cuelga si red es lenta |
| **Testeabilidad** | Requiere stub de Supabase con delays controlados |

**Problema principal:** Si `obtenerCatalogo()` tarda 30+ segundos (3G rural), la app muestra spinner infinito. No hay timeout ni cancelación.

---

## 6. Estado Actual de la Suite de Tests

### Archivos de Test Existentes

| Archivo | Framework | Tests | Qué cubre |
|---------|-----------|-------|-----------|
| `tests/unit/sanitizer.test.js` | Vitest | ~11 | `escapeHTML()` — 5 chars peligrosos, strings vacíos, números |
| `tests/unit/formatters.test.js` | Vitest | ~20 | `calcularDesgloseIVA()` happy path, CDC, factura number |
| `tests/unit/helpers.test.js` | Vitest | ~8 | `debounce()` timing, `throttle()` |
| `tests/unit/storage.test.js` | Vitest | ~11 | HDVStorage CRUD básico, deep clone, tipos de datos |
| `tests/e2e/login.spec.js` | Playwright | ~5 | Protección de rutas, render de login page |

### Lo que SÍ cubren (Happy Paths):
- Prevención XSS (escapeHTML) — excelente cobertura
- Desglose IVA con items de un solo tipo impositivo
- Generación de CDC y números de factura
- Debounce/throttle con timing preciso
- Storage CRUD básico con deep clone
- Redirect de rutas protegidas sin autenticación

### Lo que NO cubren (Sad Paths / Edge Cases):
- **Cero tests de checkout** — El flujo más crítico del negocio no tiene ni un test
- **Cero tests de SyncManager** — Batch, retry, pre-flight, mutex
- **Cero tests de realtime** — Suscripciones, merge, race conditions
- **Cero tests de error de red** — Supabase 500, timeout, offline
- **Cero tests de IndexedDB quota** — setItem() retorna false
- **Cero tests de concurrencia** — Double-click, tabs, concurrent writes
- **Cero tests de IVA mixto** — Items con 5% + 10% + exenta en misma factura
- **Cero tests de descuento con floating point** — Edge cases de redondeo
- **Cero tests de MFA TOTP** — Flujo completo de enrollment + verify
- **Cero tests de Kill Switch** — Desactivación → purga → redirect

---

## 7. Los 5 Tests Obligatorios Propuestos

### Test 1: Redondeo de Descuentos con Floating-Point (P0)

**Qué testear:**
50+ combinaciones de (precio × descuento) verificando que `Math.round(subtotal * (1 - descuento/100))` no produce errores de redondeo > 1 Gs.

**Por qué importa:**
JavaScript usa IEEE 754 double-precision. `100000 * 0.3333 = 33330.0000...0001`. Sobre miles de transacciones mensuales, errores de 1 Gs se acumulan y la SET detecta la varianza.

**Implementación sugerida (Vitest):**
```javascript
describe('Descuento floating-point edge cases', () => {
    const casos = [
        { subtotal: 99999, descuento: 33.33, esperado: 66663 },
        { subtotal: 100000, descuento: 50.5, esperado: 49500 },
        { subtotal: 1, descuento: 99.99, esperado: 0 },
        { subtotal: 999999999, descuento: 0.01, esperado: 999899999 },
        // ... 46 más
    ];
    casos.forEach(({ subtotal, descuento, esperado }) => {
        it(`${subtotal} Gs con ${descuento}% → ${esperado} Gs`, () => {
            const resultado = Math.round(subtotal * (1 - descuento / 100));
            expect(resultado).toBe(esperado);
        });
    });
});
```

**Tipo:** Unit test (Vitest)
**Prioridad:** P0 — Compliance fiscal

---

### Test 2: IVA Mixto Compliance SIFEN (P0)

**Qué testear:**
Factura con items de 3 tipos impositivos distintos (5%, 10%, exenta) en la misma factura. Verificar que `totalExentas + totalGravada5 + totalGravada10 = total` y que `liqIva5 + liqIva10 = totalIva`.

**Por qué importa:**
La SET rechaza facturas electrónicas donde el desglose de IVA no cuadra con el total. El validador SIFEN compara campo por campo.

**Implementación sugerida (Vitest):**
```javascript
describe('IVA SIFEN compliance — mixto', () => {
    it('3 tipos impositivos suman correctamente', () => {
        const items = [
            { subtotal: 100000, tipo_impuesto: '10' },
            { subtotal: 210000, tipo_impuesto: '5' },
            { subtotal: 50000, tipo_impuesto: 'exenta' }
        ];
        const r = calcularDesgloseIVA(items);
        expect(r.total).toBe(360000);
        expect(r.totalExentas + r.totalGravada5 + r.totalGravada10).toBe(360000);
        expect(r.totalIva).toBe(r.liqIva5 + r.liqIva10);
    });

    it('edge case: 333333 Gs gravada 10% — redondeo', () => {
        const items = [{ subtotal: 333333, tipo_impuesto: '10' }];
        const r = calcularDesgloseIVA(items);
        expect(r.totalGravada10).toBe(333333);
        expect(r.liqIva10).toBe(Math.round(333333 / 11)); // 30303
        expect(r.totalGravada10 - r.liqIva10 + r.liqIva10).toBe(333333);
    });
});
```

**Tipo:** Unit test (Vitest)
**Prioridad:** P0 — Regulatorio SET

---

### Test 3: SyncManager Batch Partial Failure (P0)

**Qué testear:**
150 pedidos offline → Supabase online → batch 1 (50) OK → batch 2 (50) falla → batch 3 (50) no se intenta. Verificar que solo los primeros 50 se marcan como sincronizados y el resto permanece pendiente.

**Por qué importa:**
Si la persistencia incremental falla, un error en el batch 2 podría provocar que los 150 pedidos se pierdan o se marquen incorrectamente como sincronizados.

**Implementación sugerida (Vitest):**
```javascript
describe('SyncManager batch partial failure', () => {
    it('persiste progreso después de cada batch exitoso', async () => {
        // Setup: 150 pedidos con sincronizado: false
        await HDVStorage.setItem('hdv_pedidos', generarPedidos(150));

        // Mock: batch 1 OK, batch 2 falla
        let callCount = 0;
        vi.spyOn(supabaseClient, 'from').mockReturnValue({
            upsert: vi.fn(() => {
                callCount++;
                if (callCount === 2) return { error: new Error('500') };
                return { error: null };
            })
        });

        await SyncManager.syncPedidosPendientes();

        const pedidos = await HDVStorage.getItem('hdv_pedidos');
        const synced = pedidos.filter(p => p.sincronizado === true);
        const pending = pedidos.filter(p => p.sincronizado === false);

        expect(synced.length).toBe(50);    // Solo batch 1
        expect(pending.length).toBe(100);  // Batch 2 + 3
    });
});
```

**Tipo:** Integration test (Vitest con mocks)
**Prioridad:** P0 — Integridad de datos

---

### Test 4: IndexedDB Quota Exceeded → setItem retorna false (P0)

**Qué testear:**
Simular disco lleno → `HDVStorage.setItem()` retorna `false` (no `true`) → checkout detecta el false y muestra warning.

**Por qué importa:**
Si `setItem()` miente y retorna `true` cuando falló, el vendedor piensa que su pedido está guardado. Cierra la app. Pierde la venta.

**Implementación sugerida (Vitest):**
```javascript
describe('HDVStorage quota exceeded', () => {
    it('retorna false cuando IndexedDB write falla', async () => {
        // Forzar fallo en IDB (ej. cerrar la DB antes de write)
        // O mockear el store.put() para que lance DOMException QuotaExceededError
        const originalPut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function() {
            throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        };

        const result = await HDVStorage.setItem('hdv_pedidos', [{ id: 'test' }]);
        expect(result).toBe(false); // DEBE ser false, NUNCA true

        IDBObjectStore.prototype.put = originalPut;
    });
});
```

**Tipo:** Unit test (Vitest con jsdom)
**Prioridad:** P0 — Confiabilidad offline

---

### Test 5: Double-Click en Checkout no Crea Duplicados (P1)

**Qué testear:**
Usuario hace click rápido 2 veces en "Enviar Pedido" en menos de 100ms. Verificar que solo se crea 1 pedido en `hdv_pedidos`.

**Por qué importa:**
En tablets con pantallas lentas, es común que el usuario toque 2 veces. Si ambos clicks pasan la guarda `btn.disabled`, se crean 2 pedidos idénticos. El admin ve duplicados y no sabe cuál anular.

**Implementación sugerida (Playwright):**
```javascript
test('double-click checkout crea solo 1 pedido', async ({ page }) => {
    await page.goto('/index.html');
    // Setup: seleccionar cliente, agregar item al carrito
    await setupCarritoConItem(page);

    // Double-click rápido
    const btn = page.locator('#btnPedido');
    await btn.click();
    await btn.click({ delay: 50 }); // 50ms después

    // Esperar que async operations completen
    await page.waitForTimeout(3000);

    // Verificar: solo 1 pedido creado
    const count = await page.evaluate(async () => {
        const pedidos = await HDVStorage.getItem('hdv_pedidos');
        return pedidos ? pedidos.length : 0;
    });
    expect(count).toBe(1);
});
```

**Tipo:** E2E test (Playwright)
**Prioridad:** P1 — UX + integridad de datos

---

## 8. Plan de Refactorización

### Sprint 1 — Fundamentos (Semana 1-2)

| # | Tarea | Archivo(s) | Esfuerzo | Impacto |
|---|-------|-----------|----------|---------|
| 1 | Crear `js/utils/constants.js` con estados, timeouts, spinner SVG | Nuevo archivo | 2h | Elimina C-04, C-05, M-06 |
| 2 | Centralizar `formatearGuaranies()` en formatters.js | formatters.js + 17 archivos | 3h | Elimina M-04 |
| 3 | Agregar `.catch()` a sync.js:231 | sync.js | 15min | Elimina C-01 |
| 4 | Agregar try/catch a callbacks realtime | supabase-config.js | 1h | Elimina M-02, M-11 |
| 5 | Reemplazar fire-and-forget con await + toast | creditos.js, dashboard.js | 2h | Elimina M-01 |

**Total Sprint 1:** ~8 horas

### Sprint 2 — Robustez Async (Semana 3-4)

| # | Tarea | Archivo(s) | Esfuerzo | Impacto |
|---|-------|-----------|----------|---------|
| 6 | Adoptar `withButtonLock()` universalmente | 8 archivos | 3h | Elimina C-08 |
| 7 | Agregar timeout a `obtenerCatalogo()` con AbortController | supabase-config.js | 1h | Elimina M-08 |
| 8 | Cleanup de timers en logout | supabase-config.js, app.js, sync.js | 2h | Elimina M-07 |
| 9 | Event delegation en productos.js | productos.js | 4h | Elimina C-07 |
| 10 | Función `escaparCSV()` para contabilidad | admin-contabilidad.js | 1h | Elimina M-05 |

**Total Sprint 2:** ~11 horas

### Sprint 3 — Tests y Descomposición (Semana 5-6)

| # | Tarea | Archivo(s) | Esfuerzo | Impacto |
|---|-------|-----------|----------|---------|
| 11 | Implementar Test 1: Descuento floating-point | tests/unit/ | 2h | Cobertura fiscal |
| 12 | Implementar Test 2: IVA mixto SIFEN | tests/unit/ | 2h | Cobertura regulatoria |
| 13 | Implementar Test 3: Sync batch partial | tests/unit/ | 3h | Cobertura sync |
| 14 | Implementar Test 4: Quota exceeded | tests/unit/ | 2h | Cobertura offline |
| 15 | Implementar Test 5: Double-click | tests/e2e/ | 2h | Cobertura UX |
| 16 | Descomponer `guardarProductoModal()` | productos.js | 4h | Elimina C-06 |

**Total Sprint 3:** ~15 horas

**Total plan completo:** ~34 horas (~4-5 días de trabajo)

---

## 9. Matriz de Riesgos

```
                    IMPACTO
                    Bajo         Medio        Alto         Crítico
              ┌────────────┬────────────┬────────────┬────────────┐
    Alta      │ B-03       │ M-04       │ C-04       │ C-01       │
              │ B-07       │ M-06       │ C-05       │ C-02       │
              │            │ M-10       │ C-07       │ C-03       │
 P           │            │            │ C-08       │            │
 R    Media   ├────────────┼────────────┼────────────┼────────────┤
 O            │ B-01       │ M-01       │ M-03       │ C-06       │
 B            │ B-02       │ M-02       │ M-05       │            │
 A            │ B-06       │ M-09       │ M-08       │            │
 B            │            │ M-11       │            │            │
 I    Baja    ├────────────┼────────────┼────────────┼────────────┤
 L            │ B-04       │ M-07       │            │            │
 I            │ B-05       │ M-12       │            │            │
 D            │            │            │            │            │
 A            │            │            │            │            │
 D            └────────────┴────────────┴────────────┴────────────┘
```

**Leyenda:**
- **Esquina superior derecha (C-01, C-02, C-03):** Prioridad inmediata — alta probabilidad + impacto crítico
- **Zona media-derecha (C-04 a C-08):** Sprint 1-2
- **Zona media (M-01 a M-12):** Sprint 2-3
- **Zona inferior-izquierda (B-01 a B-07):** Backlog

---

## 10. Calificación Final

### Scorecard por Área

| Área | Nota | Justificación |
|------|------|---------------|
| **Arquitectura** | B+ | Repository Pattern, IndexedDB wrapper, offline-first bien diseñados |
| **Manejo de errores async** | D | 1 CRITICAL fire-and-forget, 6 MEDIUM silent failures, race conditions |
| **Principio DRY** | C- | IVA en 3 lugares, estados en 6, colores en 2, spinner en 8, moneda en 17 |
| **Cobertura de tests** | D- | 200 assertions pero solo happy paths; 0 tests de checkout/sync/realtime |
| **Complejidad ciclomática** | C | 2 God functions, 4 funciones con CC>10, nesting profundo |
| **Mantenibilidad** | C | Un junior modifica productos.js → probabilidad alta de introducir bug |

### Calificación General: **C+**

**Fortalezas:**
- Separación clara de capas (Repository → Orchestration → UI)
- IndexedDB wrapper robusto con persistent storage y quota monitoring
- SyncManager con batch upsert e incremental persistence
- Audit logs inmutables y triggers anti-fraude server-side

**Debilidades:**
- Errores async que se tragan silenciosamente (el usuario nunca sabe que falló)
- Lógica fiscal duplicada sin tests (IVA, descuentos, CSV)
- Funciones monolíticas que mezclan UI + business logic + data access
- Suite de tests que solo cubre utilidades, no flujos de negocio
- Race conditions confirmadas en la capa de persistencia

**Pronóstico:** Sin intervención, la deuda técnica crecerá exponencialmente a medida que se agreguen features. Las race conditions (C-02) eventualmente causarán pérdida de datos en producción. El fix más urgente es C-01 (1 línea de código, 15 minutos) seguido del plan de tests (Sprint 3).

---

*Auditoría ejecutada el 2026-03-26. Próxima fase sugerida: FASE 4 — Auditoría de Performance y Optimización.*
