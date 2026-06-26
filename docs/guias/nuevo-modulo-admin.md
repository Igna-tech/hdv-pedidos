# Guía: Nuevo Módulo Admin Completo

> **Cuándo leer esta guía:** cuando el usuario pide implementar una sección nueva en el panel admin
> con su propia tabla en Supabase, archivo JS dedicado, HTML en admin.html y entradas en admin.js.
>
> **Referencia de ejemplo real:** `js/admin/proveedores.js` (el más completo — 4 sub-tabs, drawer, modales, charts)

---

## Checklist rápido (todos los pasos antes del commit)

- [ ] Paso 1: SQL ejecutado en Supabase (tablas + RLS + índices + audit trigger)
- [ ] Paso 2: Métodos en `services/supabase.js`
- [ ] Paso 3: Archivo `js/admin/[nombre].js` creado
- [ ] Paso 4: HTML en `admin.html` (sidebar + section + modales/drawer)
- [ ] Paso 5: `admin.js` (ACTION_DISPATCH + título + lazy trigger + DOMContentLoaded)
- [ ] Paso 6: CSS en `src/input.css` si hay componentes visuales nuevos
- [ ] Paso 7: `service-worker.js` (urlsToCache + networkFirstFiles)
- [ ] Paso 8: `CLAUDE.md` actualizado (arquitectura + DB + SupabaseService API)
- [ ] Paso 9: Checklist de seguridad (`docs/guias/seguridad.md`) cumplido
- [ ] Paso 10: `npm run build:css` ejecutado
- [ ] Paso 11: Commit con mensaje descriptivo

---

## Paso 1: SQL — Tablas nuevas en Supabase

Crear archivo `supabase/migrations/[nombre].sql` con este patrón:

```sql
-- ================================================
-- Tabla: [nombre_tabla]
-- ================================================
CREATE TABLE IF NOT EXISTS public.[nombre_tabla] (
    id                TEXT PRIMARY KEY,          -- '[PREFIX]-' + gen_random_uuid()[:8]
    -- campos del negocio aquí
    created_at        TIMESTAMPTZ DEFAULT now(),
    actualizado_en    TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_[nombre]_campo ON public.[nombre_tabla] (campo_frecuente);

-- RLS — OBLIGATORIO
ALTER TABLE public.[nombre_tabla] ENABLE ROW LEVEL SECURITY;
CREATE POLICY "[nombre]_select" ON public.[nombre_tabla] FOR SELECT USING (es_admin());
CREATE POLICY "[nombre]_insert" ON public.[nombre_tabla] FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "[nombre]_update" ON public.[nombre_tabla] FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "[nombre]_delete" ON public.[nombre_tabla] FOR DELETE TO authenticated USING (es_admin());

-- Audit trigger (para tablas que modifican datos importantes)
CREATE TRIGGER trg_audit_[nombre]
    AFTER UPDATE OR DELETE ON public.[nombre_tabla]
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- Realtime (opcional — solo si se necesita sync en tiempo real)
ALTER PUBLICATION supabase_realtime ADD TABLE public.[nombre_tabla];
```

**Convención de IDs:** siempre TEXT PK, nunca SERIAL/UUID.
Formato: `'PREFIX-' + crypto.randomUUID().slice(0,8).toUpperCase()` en JS.

**IMPORTANTE:** Este SQL se ejecuta manualmente en el SQL Editor de Supabase.
Advertir al usuario que debe ejecutarlo antes de probar el módulo.

---

## Paso 2: `services/supabase.js` — Métodos nuevos

Agregar dentro del IIFE, antes de la sección `// REALTIME helpers`:

```js
// [NOMBRE DEL MÓDULO]
async function fetch[Nombre]() {
    const { data, error } = await supabaseClient
        .from('[nombre_tabla]')
        .select('*')
        .order('created_at', { ascending: false });
    return { data: data || [], error };
}

async function upsert[Nombre](rows) {
    const { error } = await supabaseClient
        .from('[nombre_tabla]')
        .upsert(rows, { onConflict: 'id' });
    return { success: !error, error };
}

async function delete[Nombre](ids) {
    const { error } = await supabaseClient
        .from('[nombre_tabla]')
        .delete()
        .in('id', ids);
    return { success: !error, error };
}
```

Exponer en el `return { ... }` del IIFE:
```js
fetch[Nombre], upsert[Nombre], delete[Nombre],
```

**Patrón retorno:** `{ data, error }` para fetches, `{ success, error }` para mutaciones.
**Nunca** hacer `supabaseClient.from()` directamente fuera de este archivo.

---

## Paso 3: `js/admin/[nombre].js` — Módulo completo

### Estructura obligatoria del archivo:

```js
// ============================================
// GLOBALS
// ============================================
let [nombre]Data = [];
let _tab[Nombre]Actual = 'principal';  // solo si hay sub-tabs
let _[nombre]Filtro = { buscar: '', pagina: 1 };
const [NOMBRE]_POR_PAGINA = 20;

// ============================================
// ENTRY POINT
// ============================================
async function cargar[Nombre]() {
    // 1. Fetch paralelo de todas las tablas necesarias
    const [r1, r2] = await Promise.all([
        SupabaseService.fetch[Nombre](),
        // ...otras tablas si aplica
    ]);

    if (r1.error) { mostrarToast('Error al cargar [nombre]: ' + r1.error.message, 'danger'); return; }

    [nombre]Data = r1.data;
    // asignar el resto

    // 2. Render inicial
    _render[Nombre]();
    _actualizarKPIs[Nombre]();
}
```

### Reglas de código obligatorias:

**XSS — escapeHTML en TODA interpolación innerHTML:**
```js
// CORRECTO
fila.innerHTML = `<td>${escapeHTML(item.nombre)}</td>`;

// PROHIBIDO
fila.innerHTML = `<td>${item.nombre}</td>`;  // ← XSS si nombre viene de usuario
```

**CSP — sin inline event handlers:**
```js
// PROHIBIDO
`<button onclick="eliminar('${id}')">...</button>`

// CORRECTO
`<button data-action="eliminar[Nombre]" data-arg="${escapeHTML(id)}">...</button>`
```

**IDs únicos:**
```js
const nuevoId = '[PREFIX]-' + crypto.randomUUID().slice(0, 8).toUpperCase();
```

**Paginación (si hay tablas grandes):**
```js
const inicio = (_[nombre]Filtro.pagina - 1) * [NOMBRE]_POR_PAGINA;
const pagina = filtrados.slice(inicio, inicio + [NOMBRE]_POR_PAGINA);
```

**Modales Shoelace — abrir/cerrar:**
```js
function abrir[Modal]() {
    // resetear campos
    document.querySelector('#campo').value = '';
    document.querySelector('#modal[Nombre]').show();
}

function cerrar[Modal]() {
    document.querySelector('#modal[Nombre]').hide();
}
```

**Flag para listeners únicos (si el modal tiene inputs dinámicos):**
```js
let _[nombre]ListenerAdded = false;

function _init[Nombre]Listeners() {
    if (_[nombre]ListenerAdded) return;
    _[nombre]ListenerAdded = true;
    document.querySelector('#tabla[Nombre]')?.addEventListener('input', _handle[Nombre]Input);
}
```

---

## Paso 4: `admin.html` — HTML del módulo

### A) Botón en sidebar (en el bloque `<nav>` del sidebar)

Agregar junto a los otros módulos del grupo que corresponda:

```html
<button data-section="[nombre]" class="nav-item w-full flex items-center text-sm">
    <i data-lucide="[icono-lucide]" class="w-4 h-4 mr-3 text-gray-400"></i> [Nombre]
    <span id="badge[Nombre]" class="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 hidden"></span>
</button>
```

El badge es opcional — solo si el módulo tiene alertas/pendientes.

### B) Sección principal

```html
<section id="seccion-[nombre]" class="tab-content space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
            <h3 class="text-xl font-bold text-gray-900">[Nombre del módulo]</h3>
            <p class="text-sm text-gray-500 mt-0.5">Descripción breve</p>
        </div>
        <sl-button data-action="abrir[Modal]" variant="primary" size="small">
            + Nuevo [Nombre]
        </sl-button>
    </div>

    <!-- Filtros -->
    <div class="flex gap-2 flex-wrap">
        <sl-input id="buscar[Nombre]" placeholder="Buscar..." size="small" style="width:14rem"></sl-input>
        <!-- otros filtros sl-select si aplica -->
    </div>

    <!-- Tabla principal -->
    <div class="saas-card overflow-x-auto">
        <table class="w-full text-sm">
            <thead class="text-xs text-gray-500 uppercase">
                <tr>
                    <th class="px-4 py-3 text-left">Campo 1</th>
                    <!-- más columnas -->
                    <th class="px-4 py-3 text-right">Acciones</th>
                </tr>
            </thead>
            <tbody id="tabla[Nombre]Cuerpo" class="divide-y divide-gray-100"></tbody>
        </table>
    </div>
    <div id="paginacion[Nombre]" class="text-sm text-gray-400 mt-2 text-center"></div>
</section>
```

### C) Modal principal (sl-dialog)

```html
<sl-dialog id="modal[Nombre]" label="Nuevo [Nombre]" style="--width: 36rem">
    <div class="space-y-4 p-1">
        <sl-input id="campo1[Nombre]" label="Campo 1" required></sl-input>
        <!-- más campos -->
    </div>
    <div slot="footer" class="flex gap-2 justify-end">
        <sl-button data-action="cerrar[Modal]" variant="default">Cancelar</sl-button>
        <sl-button data-action="guardar[Nombre]" variant="primary">Guardar</sl-button>
    </div>
</sl-dialog>
```

### D) Script tag

Agregar en la sección de scripts de `admin.html`, siguiendo el orden de carga documentado en CLAUDE.md:

```html
<script src="js/admin/[nombre].js"></script>
```

---

## Paso 5: `admin.js` — Integración

### A) ACTION_DISPATCH (dentro del objeto `ACTION_DISPATCH`)

```js
// === [Nombre del módulo] ===
'abrir[Modal]':    (_, a) => typeof abrir[Modal] === 'function' && abrir[Modal](a),
'guardar[Nombre]': ()     => typeof guardar[Nombre] === 'function' && guardar[Nombre](),
'cerrar[Modal]':   ()     => typeof cerrar[Modal] === 'function' && cerrar[Modal](),
'eliminar[Nombre]':(_, a) => typeof eliminar[Nombre] === 'function' && eliminar[Nombre](a),
'filtrar[Nombre]': ()     => typeof _filtrar[Nombre] === 'function' && _filtrar[Nombre](),
// agregar todos los actions que el módulo necesite
```

### B) Título en `cambiarSeccion()`

En el objeto `titulos`:
```js
'[nombre]': '[Nombre del módulo]',
```

### C) Lazy trigger en `cambiarSeccion()`

```js
if (seccionId === '[nombre]' && typeof cargar[Nombre] === 'function') cargar[Nombre]();
```

### D) DOMContentLoaded — listeners para filtros

```js
// Filtros de [nombre]
document.querySelector('#buscar[Nombre]')?.addEventListener('sl-input', () => _filtrar[Nombre]());
document.querySelector('#filtro[Nombre]Campo')?.addEventListener('sl-change', () => _filtrar[Nombre]());
```

---

## Paso 6: `src/input.css` — Estilos nuevos (si aplica)

Solo si el módulo necesita componentes visuales propios (sub-tabs, badges custom, etc.).
Agregar al final del archivo, con comentario de sección:

```css
/* ==========================================
   [Nombre del módulo] — estilos específicos
   ========================================== */
.[nombre]-tab {
  @apply px-3 py-2 text-xs font-semibold text-gray-500 ...;
}
```

Después ejecutar `npm run build:css` para recompilar.

---

## Paso 7: `service-worker.js` — Cachear el nuevo JS

En `urlsToCache` (array de archivos para pre-cache):
```js
'./js/admin/[nombre].js',
```

En `networkFirstFiles` (array de archivos network-first):
```js
'admin/[nombre].js',
```

---

## Paso 8: `CLAUDE.md` — Actualización obligatoria

Editar estas secciones de CLAUDE.md (NO agregar al final — editar en el lugar correcto):

1. **Arquitectura de archivos** → agregar línea en la lista de `js/admin/`:
   ```
   ├── js/admin/[nombre].js  → Módulo admin: [descripción breve]
   ```

2. **Orden de carga de scripts (admin.html)** → agregar en la posición correcta del orden de carga.

3. **Base de datos** → agregar tablas nuevas bajo la subsección correcta.

4. **Capa de servicios** → agregar los métodos nuevos bajo la API pública de SupabaseService.

---

## Paso 9: Verificación antes del commit

Ejecutar el checklist completo de `docs/guias/seguridad.md`.

Prueba manual mínima:
1. Admin → sección nueva carga sin errores en consola
2. Crear registro → modal → guardar → aparece en tabla
3. Editar registro → modal pre-llenado → guardar → cambios reflejados
4. Eliminar → confirm modal → desaparece
5. Filtros funcionan correctamente
6. Cero errores CSP en consola del browser

---

## Paso 10: Build y commit

```bash
npm run build:css
git add js/admin/[nombre].js services/supabase.js admin.html admin.js src/input.css dist/tailwind.css service-worker.js CLAUDE.md supabase/migrations/[nombre].sql
git commit -m "feat([nombre]): módulo completo de [descripción]"
```
