# Guías de Implementación — HDV Distribuciones

Estas guías están escritas para ser leídas por Claude antes de implementar una feature.
Para invocarlas, decile: **"antes de empezar, leé `docs/guias/[nombre].md`"**

---

## Índice

| Archivo | Cuándo usarlo |
|---------|---------------|
| [`nuevo-modulo-admin.md`](nuevo-modulo-admin.md) | Agregar una sección completa al panel admin (tabla, JS, HTML, SQL) |
| [`nueva-tabla-supabase.md`](nueva-tabla-supabase.md) | Solo agregar una tabla nueva a la DB sin módulo completo |
| [`seguridad.md`](seguridad.md) | Checklist de seguridad — leer SIEMPRE antes de hacer commit |

---

## Cómo agregar pasos o políticas manualmente

Estos archivos son Markdown estándar. Para editarlos desde Obsidian o cualquier editor:

### Agregar un paso a una guía

Buscá la sección `## Paso N` más alta y agregá debajo:

```markdown
## Paso N+1: Nombre del paso

Descripción de qué hacer.

```js
// Ejemplo de código si aplica
```

- [ ] Sub-tarea 1
- [ ] Sub-tarea 2
```

### Agregar una política de seguridad

Abrí `seguridad.md`, encontrá la sección que corresponde (P1–P10) y agregá:

```markdown
- [ ] **Política nueva**: descripción exacta de qué verificar.
  > Motivo: por qué existe esta regla.
```

### Agregar una guía nueva

1. Creá un archivo `.md` en esta carpeta (`docs/guias/`)
2. Empezá con el header:
```markdown
# Guía: [Nombre]
> Cuándo leer esta guía: [condición]
```
3. Agregalo al índice de este README

---

## Convención de uso para Claude

Cuando el usuario diga **"leé docs/guias/X.md"**, Claude debe:
1. Leer el archivo completo
2. Seguir cada paso en orden sin saltear ninguno
3. Marcar mentalmente cada checklist ítem como cumplido antes de avanzar
4. Si un paso no aplica al caso actual, decirlo explícitamente y por qué
