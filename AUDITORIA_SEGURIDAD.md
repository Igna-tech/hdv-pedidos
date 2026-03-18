# AUDITORIA DE SEGURIDAD - HDV Distribuciones
**Fecha:** 2026-03-18
**Auditor:** Claude Opus 4.6 (AppSec + DB Architecture)
**Metodologia:** Zero Trust / Defensa en Profundidad
**Alcance:** Frontend (Vanilla JS), Edge Functions (Deno), Base de Datos (Supabase PostgreSQL), Configuracion

---

## RESUMEN EJECUTIVO

| Severidad | Cantidad |
|-----------|----------|
| CRITICO   | 3        |
| ALTO      | 8        |
| MEDIO     | 10       |
| BAJO      | 5        |
| **Total** | **26**   |

---

## CRITICO

### C-01: RPCs SECURITY DEFINER ejecutables por rol `anon` (sin autenticacion) — ✅ REMEDIADO 2026-03-18

**Archivos afectados:** Base de datos PostgreSQL (funciones publicas)
**Impacto:** Un atacante sin autenticacion puede manipular datos criticos usando solo la ANON_KEY publica.

Todas las funciones SECURITY DEFINER tienen `EXECUTE` otorgado al rol `anon`:

| Funcion | Riesgo |
|---------|--------|
| `actualizar_estado_pedido(text, text)` | Cambiar estado de CUALQUIER pedido (facturar, anular) |
| `reemplazar_variantes(text[], jsonb)` | Borrar TODAS las variantes de productos e insertar datos arbitrarios |
| `obtener_rol_usuario(uuid)` | Enumerar roles de usuarios (reconocimiento) |
| `obtener_mi_rol()` | Enumerar rol del caller |
| `handle_new_user()` | Trigger, menor riesgo directo |

**Verificacion:**
```sql
SELECT has_function_privilege('anon', 'actualizar_estado_pedido(text, text)', 'EXECUTE');
-- Resultado: true
SELECT has_function_privilege('anon', 'reemplazar_variantes(text[], jsonb)', 'EXECUTE');
-- Resultado: true
```

**Solucion:**
```sql
-- Revocar acceso anon a TODAS las funciones criticas
REVOKE EXECUTE ON FUNCTION public.actualizar_estado_pedido(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reemplazar_variantes(text[], jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.obtener_rol_usuario(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.obtener_mi_rol() FROM anon;

-- Ademas, agregar validacion auth.uid() dentro de las funciones destructivas:
-- actualizar_estado_pedido: verificar que auth.uid() IS NOT NULL
-- reemplazar_variantes: verificar que es_admin() = true
```

---

### C-02: `actualizar_estado_pedido` sin validacion de autorizacion interna — ✅ REMEDIADO 2026-03-18

**Archivo afectado:** Funcion SQL `public.actualizar_estado_pedido`
**Impacto:** Incluso si se revoca el acceso `anon`, cualquier usuario autenticado (vendedor) puede cambiar el estado de CUALQUIER pedido de CUALQUIER otro vendedor. No hay verificacion de propiedad (`vendedor_id = auth.uid()`) ni de rol admin.

**Definicion actual:**
```sql
CREATE OR REPLACE FUNCTION public.actualizar_estado_pedido(p_id text, p_estado text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    UPDATE public.pedidos
    SET estado = p_estado, datos = jsonb_set(datos, '{estado}', to_jsonb(p_estado)), actualizado_en = NOW()
    WHERE id = p_id;
    RETURN FOUND;
END;
$$;
```

**Solucion:**
```sql
CREATE OR REPLACE FUNCTION public.actualizar_estado_pedido(p_id text, p_estado text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    -- Solo admin o el vendedor dueno del pedido pueden cambiar estado
    IF NOT EXISTS (
        SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin' AND activo = true
    ) AND NOT EXISTS (
        SELECT 1 FROM public.pedidos WHERE id = p_id AND vendedor_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'No autorizado';
    END IF;

    UPDATE public.pedidos
    SET estado = p_estado, datos = jsonb_set(datos, '{estado}', to_jsonb(p_estado)), actualizado_en = NOW()
    WHERE id = p_id;
    RETURN FOUND;
END;
$$;
```

---

### C-03: `reemplazar_variantes` sin validacion de autorizacion interna — ✅ REMEDIADO 2026-03-18

**Archivo afectado:** Funcion SQL `public.reemplazar_variantes`
**Impacto:** Cualquier usuario autenticado puede borrar todas las variantes de producto y reemplazarlas con datos arbitrarios. La funcion es SECURITY DEFINER y no verifica si el caller es admin.

**Solucion:**
```sql
CREATE OR REPLACE FUNCTION public.reemplazar_variantes(p_producto_ids text[], p_variantes jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    -- Solo admin puede modificar variantes
    IF NOT EXISTS (
        SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin' AND activo = true
    ) THEN
        RAISE EXCEPTION 'No autorizado: solo admin puede modificar variantes';
    END IF;

    DELETE FROM public.producto_variantes WHERE producto_id = ANY(p_producto_ids);
    INSERT INTO public.producto_variantes (producto_id, nombre_variante, precio, costo, stock, activo)
    SELECT (v->>'producto_id')::TEXT, (v->>'nombre_variante')::TEXT,
           COALESCE((v->>'precio')::INT, 0), COALESCE((v->>'costo')::INT, 0),
           COALESCE((v->>'stock')::INT, 0), COALESCE((v->>'activo')::BOOLEAN, true)
    FROM jsonb_array_elements(p_variantes) AS v;
    RETURN true;
END;
$$;
```

---

## ALTO

### A-01: Bucket `productos_img` sin limites de tamano ni tipo MIME — ✅ REMEDIADO 2026-03-18

**Archivo afectado:** Supabase Storage bucket `productos_img`
**Impacto:** Cualquier usuario autenticado (incluyendo vendedores) puede subir archivos de tamano ilimitado y cualquier tipo MIME. Vectores de ataque: almacenamiento de malware, agotamiento de espacio, upload de archivos ejecutables.

**Estado actual:**
- `file_size_limit`: NULL (sin limite)
- `allowed_mime_types`: NULL (cualquier tipo)
- Politica INSERT: cualquier `authenticated` (no solo admin)

**Solucion:**
```sql
UPDATE storage.buckets
SET file_size_limit = 2097152,  -- 2MB max
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'productos_img';
```

Y restringir upload solo a admin:
```sql
DROP POLICY "Usuarios autenticados pueden subir imagenes" ON storage.objects;
CREATE POLICY "Solo admin puede subir imagenes" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'productos_img' AND (SELECT public.es_admin()));

DROP POLICY "Usuarios autenticados pueden eliminar imagenes" ON storage.objects;
CREATE POLICY "Solo admin puede eliminar imagenes" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'productos_img' AND (SELECT public.es_admin()));
```

---

### A-02: Registro abierto sin confirmacion de email ni CAPTCHA

**Archivo afectado:** `supabase/config.toml` lineas 169, 175, 178, 197-200, 209
**Impacto:** Cualquier persona puede crear cuentas ilimitadas. Combinado con C-01 (RPCs ejecutables por anon), un atacante puede registrarse y obtener rol `vendedor` automaticamente (trigger `handle_new_user`), luego explotar las RPCs.

**Estado actual:**
```toml
enable_signup = true                    # Registro abierto
minimum_password_length = 6             # Debil
password_requirements = ""              # Sin complejidad
enable_confirmations = false            # Sin verificar email
# [auth.captcha] deshabilitado
```

**Solucion:**
En el dashboard de Supabase (Authentication > Settings):
- Habilitar email confirmation (`enable_confirmations = true`)
- Subir `minimum_password_length` a 8
- Establecer `password_requirements = "lower_upper_letters_digits"`
- Habilitar CAPTCHA (Turnstile o hCaptcha)
- Considerar deshabilitar `enable_signup` si solo el admin crea cuentas

---

### A-03: `pedidos.vendedor_id` es nullable — bypass de RLS — ✅ REMEDIADO 2026-03-18

**Archivo afectado:** Tabla `public.pedidos`, columna `vendedor_id`
**Impacto:** Un pedido con `vendedor_id = NULL` no es visible para ningun vendedor via RLS (`vendedor_id = auth.uid()` es FALSE cuando vendedor_id es NULL), pero podria ser insertado por un atacante que explote una RPC. En el peor caso, pedidos "fantasma" quedan invisibles a vendedores pero manipulables por admin.

**Solucion:**
```sql
-- Backfill NULLs (verificar primero que no haya)
-- ALTER TABLE public.pedidos ALTER COLUMN vendedor_id SET NOT NULL;
-- O al menos un default:
ALTER TABLE public.pedidos ALTER COLUMN vendedor_id SET DEFAULT auth.uid();
```

---

### A-04: `configuracion_empresa` sin politica DELETE — datos fiscales borrables via API — ✅ REMEDIADO 2026-03-18

**Archivo afectado:** Tabla `public.configuracion_empresa`
**Impacto:** No existe politica DELETE para esta tabla. En Supabase, cuando RLS esta habilitado y no hay politica para una operacion, esta se bloquea. Esto es CORRECTO como proteccion, pero es implicito — no hay una denegacion explicita. Si alguien agrega una politica DELETE permisiva en el futuro, los datos fiscales (RUC, timbrado, razon social) podrian borrarse.

**Solucion (hardening explicito):**
```sql
CREATE POLICY "cfg_empresa_delete_blocked" ON public.configuracion_empresa
    FOR DELETE TO authenticated USING (false);
```

---

### A-05: Inyeccion XML potencial en Edge Function `sifen-generar-xml`

**Archivo afectado:** `supabase/functions/sifen-generar-xml/index.ts`, lineas 255, 399-411
**Impacto:** Valores como `cliente.nombre`, `cliente.razon_social`, `item.nombre` se insertan en el objeto XML via `xmlbuilder2` sin sanitizar caracteres especiales XML. Si un nombre de cliente contiene `<`, `>`, `&`, o CDATA sections, podria corromper el XML o inyectar nodos.

`xmlbuilder2` hace escape automatico de entidades XML en valores de texto, pero NO en atributos de forma garantizada. Dado que todos los valores van como nodos de texto (no atributos), el riesgo es MEDIO-ALTO pero mitigado parcialmente por la libreria.

**Solucion:** Agregar sanitizacion explicita antes de pasar a xmlbuilder2:
```typescript
function sanitizeXML(str: string): string {
    return (str || "").replace(/[<>&'"]/g, (c) => {
        const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
        return map[c] || c;
    });
}
```

---

### A-06: Edge Function sin verificacion de rol admin — vendedor puede generar facturas SIFEN

**Archivo afectado:** `supabase/functions/sifen-generar-xml/index.ts`
**Impacto:** La Edge Function valida que el usuario este autenticado (JWT), pero NO verifica que tenga rol `admin`. Un vendedor autenticado puede invocar directamente la funcion para generar XML SIFEN y facturas, saltando la logica de permisos del frontend.

**Solucion:**
```typescript
// Despues de validar auth, verificar rol
const { data: perfil, error: perfilError } = await supabase
    .from("perfiles").select("rol").eq("id", user.id).single();
if (perfilError || perfil?.rol !== "admin") {
    return new Response(JSON.stringify({ error: "Solo administradores pueden generar facturas" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
```

---

### A-07: Inyeccion XSS via onclick handlers en `admin.js` — bypass de escapeHTML

**Archivo afectado:** `admin.js`, lineas ~868, ~880, y funcion `botonOnclick` (linea ~73)
**Impacto:** La busqueda global del admin construye handlers `onclick` con datos interpolados directamente en atributos HTML. Aunque `escapeHTML()` se usa para el contenido visible, los valores dentro de `onclick="..."` no se sanitizan para contexto de atributo. Un nombre de producto/cliente con comillas dobles o comillas simples puede inyectar JS arbitrario.

**Ejemplo vulnerable:**
```javascript
// admin.js busqueda global — construye onclick con datos sin escapar
onclick="verProducto('${producto.id}')"  // Si id contiene '); alert(1)//
```

**Solucion:** Usar `data-*` attributes + `addEventListener` en lugar de inline onclick, o sanitizar para contexto de atributo HTML (escape de `"`, `'`, `\`):
```javascript
// En lugar de: onclick="verProducto('${id}')"
// Usar: data-producto-id="${escapeHTML(id)}" con addEventListener
```

---

### A-08: Edge Function sin rate limiting — abuso de generacion XML

**Archivo afectado:** `supabase/functions/sifen-generar-xml/index.ts`
**Impacto:** No hay rate limiting ni en la Edge Function ni a nivel de Supabase Edge Functions. Un usuario autenticado puede invocar la funcion repetidamente, generando carga en el worker Deno y potencialmente abusando la generacion de CDCs/facturas.

**Solucion:** Implementar rate limiting basico con un contador en la tabla de configuracion o usar un servicio externo. Como minimo, limitar por IP + user_id:
```typescript
// Opcion simple: verificar que no se generen mas de N facturas por hora por usuario
const { count } = await supabase.from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("vendedor_id", user.id)
    .eq("estado", "facturado_mock")
    .gte("actualizado_en", new Date(Date.now() - 3600000).toISOString());
if (count && count > 50) {
    return new Response(JSON.stringify({ error: "Rate limit: demasiadas facturas por hora" }),
        { status: 429, headers: corsHeaders });
}
```

---

## MEDIO

### M-01: 194 usos de `innerHTML` — superficie XSS amplia

**Archivos afectados:** 15 archivos JS (app.js, admin.js, checkout.js, admin-ventas.js, admin-devoluciones.js, admin-contabilidad.js, js/admin/*.js, js/vendedor/ui.js)
**Impacto:** Aunque `escapeHTML()` se usa en muchos casos, la superficie es muy amplia (194 asignaciones). Una sola omision permite XSS almacenado via datos de Supabase (nombre de cliente, nombre de producto, etc.).

**Hallazgos especificos:**
- `js/vendedor/ui.js` tiene 36 usos de innerHTML — el mas expuesto
- `js/admin/productos.js` tiene 30 usos
- `js/admin/creditos.js` tiene 19 usos

**Solucion:** Auditar cada uso individualmente. Priorizar los que renderizan datos de `pedidos.datos` (JSONB controlable por usuario). Considerar migrar los componentes mas criticos a `textContent` + `createElement`.

---

### M-02: Tokens de sesion Supabase Auth en `localStorage` sin proteccion

**Archivo afectado:** `supabase-init.js:12-14`
**Impacto:** Supabase Auth almacena tokens JWT de sesion en `localStorage` por defecto. Esto es vulnerable a XSS — si un atacante logra ejecutar JS (via M-01), puede robar el token de sesion completo. No hay forma nativa de mover tokens de Supabase Auth a `httpOnly` cookies en frontend puro.

```javascript
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: localStorage,  // JWT accesible via JS
    }
});
```

**Solucion:** Esto es una limitacion de la arquitectura frontend-only con Supabase. La mitigacion principal es eliminar todos los vectores XSS (M-01). Como medida adicional, reducir `jwt_expiry` en config.toml (actualmente 3600s = 1h, considerar 1800s).

---

### M-03: Indice duplicado en `producto_variantes.producto_id`

**Archivo afectado:** Base de datos, tabla `producto_variantes`
**Impacto:** Dos indices identicos (`idx_producto_variantes_producto_id` y `idx_variantes_producto`) sobre la misma columna. Desperdicia espacio y ralentiza escrituras (cada INSERT/DELETE mantiene ambos).

**Solucion:**
```sql
DROP INDEX IF EXISTS idx_variantes_producto;
-- Mantener idx_producto_variantes_producto_id
```

---

### M-04: Sin FK entre `pedidos` y `clientes` — datos huerfanos

**Archivos afectados:** Tabla `pedidos` (referencia a cliente via JSONB `datos.cliente.id`)
**Impacto:** Borrar un cliente no genera error ni advertencia. Los pedidos historicos mantienen el snapshot del cliente en JSONB (lo cual es bueno para historial), pero no hay integridad referencial que prevenga borrar un cliente con pedidos activos.

**Solucion:** Dado que el diseno usa JSONB para snapshot del cliente en cada pedido, agregar una FK estricta romperia el patron actual. En cambio, agregar validacion a nivel de aplicacion:
```sql
-- Opcion: funcion que verifica antes de borrar
CREATE OR REPLACE FUNCTION public.verificar_cliente_sin_pedidos_activos(p_cliente_id text)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM public.pedidos
        WHERE datos->>'cliente'->>'id' = p_cliente_id
        AND estado IN ('pedido_pendiente', 'entregado')
    );
$$;
```

---

### M-05: Sin validacion de tamano de request body en Edge Function

**Archivo afectado:** `supabase/functions/sifen-generar-xml/index.ts:161`
**Impacto:** `req.json()` parsea el body completo sin limite. Un atacante podria enviar un payload JSON de varios MB, consumiendo memoria del worker Deno.

**Solucion:**
```typescript
const rawBody = await req.text();
if (rawBody.length > 10000) { // 10KB max
    return new Response(JSON.stringify({ error: "Payload demasiado grande" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const body = JSON.parse(rawBody);
```

---

### M-06: `configuracion` SELECT con `USING (true)` — cualquier autenticado lee TODA la configuracion

**Archivo afectado:** Tabla `configuracion`, politica `config_select`
**Impacto:** Cualquier vendedor puede leer todos los documentos de configuracion, incluyendo `creditos_manuales`, `promociones`, `whatsapp_plantilla`, `cuentas_bancarias`. Algunos de estos contienen datos sensibles del negocio.

**Solucion:**
```sql
DROP POLICY "config_select" ON public.configuracion;
CREATE POLICY "config_select" ON public.configuracion
    FOR SELECT TO authenticated
    USING (
        public.es_admin()
        OR doc_id IN ('gastos_vendedor', 'rendiciones', 'promociones', 'metas_vendedor')
    );
```

---

### M-07: `pedidos.fecha` es tipo TEXT — sin indice B-tree eficiente para rangos

**Archivo afectado:** Tabla `pedidos`, columna `fecha` (tipo `text`)
**Impacto:** Las consultas de rango por fecha (cierre mensual, reportes) hacen comparacion lexicografica de strings. Funciona con formato ISO-8601, pero es mas lento que un indice sobre `timestamptz`. Con 500K+ registros, las queries de contabilidad mensual seran lentas.

**Solucion a largo plazo:**
```sql
-- Agregar columna fecha_ts y migrar
ALTER TABLE public.pedidos ADD COLUMN fecha_ts TIMESTAMPTZ;
UPDATE public.pedidos SET fecha_ts = fecha::TIMESTAMPTZ WHERE fecha IS NOT NULL;
CREATE INDEX idx_pedidos_fecha_ts ON public.pedidos USING btree (fecha_ts DESC);
```

---

### M-08: URL de QR en factura no codificada — inyeccion de parametros

**Archivo afectado:** `supabase/functions/sifen-generar-xml/index.ts`, generacion de URL QR
**Impacto:** Los parametros de la URL del QR code (CDC, RUC, monto) se concatenan sin `encodeURIComponent()`. Si algun valor contiene `&` o `=`, podria alterar los parametros del endpoint de verificacion SIFEN.

**Solucion:**
```typescript
const qrUrl = `https://ekuatia.set.gov.py/consultas/qr?cdc=${encodeURIComponent(cdc)}&ruc=${encodeURIComponent(rucEmisor)}`;
```

---

### M-09: Edge Function — `pedido_id` sin validacion de tipo estricta

**Archivo afectado:** `supabase/functions/sifen-generar-xml/index.ts:163`
**Impacto:** El `pedido_id` del request body se usa directamente en queries sin validar que sea un string no vacio. Un atacante podria enviar un array, objeto, o null como `pedido_id`, causando comportamiento inesperado en las queries de Supabase.

**Solucion:**
```typescript
const { pedido_id } = body;
if (!pedido_id || typeof pedido_id !== "string" || pedido_id.length > 50) {
    return new Response(JSON.stringify({ error: "pedido_id invalido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
```

---

### M-10: Edge Function silencia errores de `SERVICE_ROLE_KEY` ausente

**Archivo afectado:** `supabase/functions/sifen-generar-xml/index.ts`
**Impacto:** Si `SUPABASE_SERVICE_ROLE_KEY` no esta configurada, el codigo usa `!` (non-null assertion) que causaria un error generico en runtime. No hay validacion explicita de que las variables de entorno criticas esten presentes, lo que dificulta el diagnostico de fallos en produccion.

**Solucion:**
```typescript
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Configuracion del servidor incompleta" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
```

---

## BAJO

### B-01: ANON_KEY expuesta en codigo fuente (esperado pero documentable)

**Archivo afectado:** `supabase-init.js:8`
**Impacto:** La ANON_KEY de Supabase es publica por diseno (es la "clave publica" del proyecto). Sin embargo, combinada con C-01 (RPCs callable por anon), amplifica el riesgo. Una vez que C-01 se corrija, este hallazgo es informativo.

---

### B-02: Tabla legacy `catalogo` aun existe con datos

**Archivo afectado:** Tabla `public.catalogo` (1 fila)
**Impacto:** La tabla legacy no se usa pero contiene un snapshot antiguo del catalogo. Ocupa espacio y podria confundir a futuros desarrolladores.

**Solucion:** Verificar que ningun codigo la referencia, luego `DROP TABLE public.catalogo;`

---

### B-03: Sin `Content-Security-Policy` header

**Archivo afectado:** `vercel.json`
**Impacto:** No hay CSP configurado. Los headers actuales incluyen X-Frame-Options, nosniff, y Referrer-Policy, pero CSP es la defensa primaria contra XSS. Dado que la app usa CDN de Tailwind, Lucide, Chart.js, etc., el CSP debe ser permisivo pero aun asi util.

**Solucion:** Agregar a vercel.json headers:
```json
{
    "key": "Content-Security-Policy",
    "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://cdn.sheetjs.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co"
}
```

---

### B-04: `login.js` no limita intentos de login del lado cliente

**Archivo afectado:** `login.js:85-143`
**Impacto:** No hay rate-limiting del lado cliente. Supabase Auth tiene rate-limiting del lado servidor (30 sign-ins/5min en config.toml), pero el cliente no muestra feedback al usuario sobre intentos restantes ni implementa backoff exponencial.

**Solucion:** Agregar contador de intentos con backoff progresivo en el frontend.

---

### B-05: `obtener_rol_usuario` acepta UUID arbitrario como parametro

**Archivo afectado:** Funcion SQL `public.obtener_rol_usuario(uuid)`
**Impacto:** Cualquier usuario autenticado puede consultar el rol de otro usuario pasando su UUID. Esto permite enumeracion de roles. El impacto es bajo porque los UUIDs no son facilmente adivinables, pero viola el principio de minimo privilegio.

**Solucion:**
```sql
CREATE OR REPLACE FUNCTION public.obtener_rol_usuario(user_id uuid)
RETURNS TABLE(rol text, nombre_completo text, activo boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    -- Solo el propio usuario o un admin puede consultar roles
    IF user_id != auth.uid() AND NOT EXISTS (
        SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'admin' AND activo = true
    ) THEN
        RETURN;
    END IF;
    RETURN QUERY SELECT p.rol, p.nombre_completo, p.activo FROM public.perfiles p WHERE p.id = user_id;
END;
$$;
```

---

## MATRIZ DE PRIORIDAD DE REMEDIACION

| # | Severidad | Esfuerzo | Accion |
|---|-----------|----------|--------|
| C-01 | CRITICO | 5 min | REVOKE EXECUTE anon en RPCs |
| C-02 | CRITICO | 10 min | Agregar auth.uid() check en actualizar_estado_pedido |
| C-03 | CRITICO | 10 min | Agregar es_admin() check en reemplazar_variantes |
| A-06 | ALTO | 10 min | Agregar verificacion de rol admin en Edge Function |
| A-02 | ALTO | 5 min | Habilitar email confirmation + password requirements |
| A-01 | ALTO | 5 min | Limitar bucket storage (2MB, solo imagenes) |
| A-05 | ALTO | 15 min | Sanitizar inputs XML en Edge Function |
| A-07 | ALTO | 30 min | Migrar onclick handlers a data-attributes + addEventListener |
| A-08 | ALTO | 15 min | Implementar rate limiting en Edge Function |
| A-03 | ALTO | 2 min | ALTER vendedor_id SET NOT NULL (o SET DEFAULT) |
| A-04 | ALTO | 2 min | Politica DELETE explicita en configuracion_empresa |
| M-06 | MEDIO | 5 min | Restringir config_select por doc_id |
| M-05 | MEDIO | 5 min | Validar tamano de body en Edge Function |
| M-09 | MEDIO | 5 min | Validar tipo de pedido_id en Edge Function |
| M-10 | MEDIO | 5 min | Validar env vars al inicio de Edge Function |
| M-08 | MEDIO | 2 min | encodeURIComponent en URL QR |
| M-03 | MEDIO | 1 min | DROP indice duplicado |
| M-01 | MEDIO | 2h+ | Auditoria innerHTML caso por caso |
| B-03 | BAJO | 10 min | Agregar CSP header |

**Recomendacion:** Ejecutar C-01, C-02 y C-03 INMEDIATAMENTE. Son explotables hoy con solo la ANON_KEY publica.
