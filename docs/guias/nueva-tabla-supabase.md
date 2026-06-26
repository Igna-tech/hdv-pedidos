# Guía: Nueva Tabla en Supabase

> **Cuándo leer esta guía:** cuando solo se necesita agregar una tabla nueva a la DB
> sin implementar un módulo admin completo (por ejemplo, una tabla de soporte para un módulo existente).
>
> Para módulo completo (tabla + JS + HTML), usar `nuevo-modulo-admin.md`.

---

## Checklist

- [ ] Tabla creada con campos correctos y tipos apropiados
- [ ] RLS habilitado con políticas explícitas
- [ ] Índices en campos de filtrado frecuente
- [ ] Audit trigger si la tabla modifica datos de negocio
- [ ] Realtime habilitado si el módulo necesita sync en tiempo real
- [ ] Métodos agregados en `services/supabase.js`
- [ ] CLAUDE.md actualizado (tablas + API SupabaseService)
- [ ] SQL ejecutado en Supabase SQL Editor (advertir al usuario)

---

## Plantilla SQL completa

```sql
-- ================================================
-- Tabla: [nombre_tabla]
-- Propósito: [descripción]
-- Módulo relacionado: [módulo que la usa]
-- ================================================

CREATE TABLE IF NOT EXISTS public.[nombre_tabla] (
    id              TEXT PRIMARY KEY,
    -- campos de relación (FK primero)
    [entidad]_id    TEXT REFERENCES public.[tabla_padre](id) ON DELETE CASCADE,
    -- campos de negocio
    nombre          TEXT NOT NULL,
    descripcion     TEXT,
    valor           NUMERIC DEFAULT 0,
    activo          BOOLEAN DEFAULT true,
    datos           JSONB DEFAULT '{}',    -- solo para estructuras flexibles
    -- auditoría
    created_at      TIMESTAMPTZ DEFAULT now(),
    actualizado_en  TIMESTAMPTZ DEFAULT now(),
    creado_por      UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- Índices — solo campos que se usan en filtros o JOINs frecuentes
CREATE INDEX IF NOT EXISTS idx_[nombre]_[campo] ON public.[nombre_tabla] ([campo]);
CREATE INDEX IF NOT EXISTS idx_[nombre]_[entidad]_id ON public.[nombre_tabla] ([entidad]_id);

-- RLS — obligatorio en TODAS las tablas
ALTER TABLE public.[nombre_tabla] ENABLE ROW LEVEL SECURITY;

-- Para tablas solo-admin:
CREATE POLICY "[nombre]_select" ON public.[nombre_tabla] FOR SELECT USING (es_admin());
CREATE POLICY "[nombre]_insert" ON public.[nombre_tabla] FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "[nombre]_update" ON public.[nombre_tabla] FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "[nombre]_delete" ON public.[nombre_tabla] FOR DELETE TO authenticated USING (es_admin());

-- Para tablas vendedor (lee propios, admin lee todo):
-- CREATE POLICY "[nombre]_select_vendedor" ON public.[nombre_tabla]
--     FOR SELECT USING (auth.uid() = creado_por OR es_admin());
-- CREATE POLICY "[nombre]_insert_vendedor" ON public.[nombre_tabla]
--     FOR INSERT TO authenticated WITH CHECK (auth.uid() = creado_por);

-- Audit trigger (para tablas con datos de negocio importantes)
CREATE TRIGGER trg_audit_[nombre]
    AFTER UPDATE OR DELETE ON public.[nombre_tabla]
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- Realtime (solo si se necesita sync en tiempo real en el frontend)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.[nombre_tabla];
```

---

## Convenciones de tipos de datos

| Dato | Tipo SQL recomendado |
|------|---------------------|
| ID de negocio | `TEXT PRIMARY KEY` — nunca SERIAL |
| Monto en Gs. | `NUMERIC` — nunca FLOAT (precisión) |
| Fecha para mostrar | `TEXT` (YYYY-MM-DD) — evita timezone issues |
| Timestamp de auditoría | `TIMESTAMPTZ DEFAULT now()` |
| Datos flexibles | `JSONB DEFAULT '{}'` |
| Flag on/off | `BOOLEAN DEFAULT true/false` |
| Estado con valores fijos | `TEXT` con CHECK constraint |

**CHECK constraint para estados:**
```sql
estado TEXT DEFAULT 'borrador' CHECK (estado IN ('borrador','confirmado','cancelado'))
```

---

## Métodos en `services/supabase.js`

Patrón mínimo para una tabla nueva. Agregar antes de la sección `// REALTIME helpers`:

```js
// [NOMBRE DE LA TABLA]
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

Exponer en el `return { ... }`:
```js
fetch[Nombre], upsert[Nombre], delete[Nombre],
```

---

## Actualizar CLAUDE.md

En la sección **Base de datos** → agregar bajo la subsección correcta:

```
- `[nombre_tabla]` ([campos clave]) — descripción breve, quién la usa
```

En la sección **Capa de servicios** → agregar bajo la API pública:

```
- **[Nombre]**: `fetch[Nombre]()`, `upsert[Nombre](rows)`, `delete[Nombre](ids)`
```
