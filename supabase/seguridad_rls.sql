-- ============================================
-- HDV Distribuciones — Politicas RLS para tablas relacionales
-- Fecha: 2026-04-02
--
-- CONTEXTO: Las tablas legacy (pedidos, catalogo, configuracion,
-- reportes_mensuales, configuracion_empresa, perfiles) YA tienen
-- RLS habilitado y politicas definidas en supabase-schema.sql
-- y supabase-auth-setup.sql.
--
-- Este script cubre las 6 tablas relacionales que NO tenian RLS:
--   - categorias, productos, producto_variantes
--   - clientes
--   - audit_logs
--   - app_secrets
--
-- IMPORTANTE: Ejecutar en Supabase SQL Editor como superuser.
-- Este script es IDEMPOTENTE (usa IF NOT EXISTS / DROP IF EXISTS).
-- ============================================

-- ============================================
-- 1. HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================

ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_variantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;


-- ============================================
-- 2. CATEGORIAS — Catalogo de referencia
--    SELECT: todo autenticado
--    INSERT/UPDATE/DELETE: solo admin
-- ============================================

DROP POLICY IF EXISTS "categorias_select" ON categorias;
CREATE POLICY "categorias_select" ON categorias
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "categorias_insert" ON categorias;
CREATE POLICY "categorias_insert" ON categorias
    FOR INSERT TO authenticated
    WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "categorias_update" ON categorias;
CREATE POLICY "categorias_update" ON categorias
    FOR UPDATE TO authenticated
    USING (public.es_admin())
    WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "categorias_delete" ON categorias;
CREATE POLICY "categorias_delete" ON categorias
    FOR DELETE TO authenticated
    USING (public.es_admin());


-- ============================================
-- 3. PRODUCTOS — Catalogo de productos
--    SELECT: todo autenticado
--    INSERT/UPDATE/DELETE: solo admin
-- ============================================

DROP POLICY IF EXISTS "productos_select" ON productos;
CREATE POLICY "productos_select" ON productos
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "productos_insert" ON productos;
CREATE POLICY "productos_insert" ON productos
    FOR INSERT TO authenticated
    WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "productos_update" ON productos;
CREATE POLICY "productos_update" ON productos
    FOR UPDATE TO authenticated
    USING (public.es_admin())
    WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "productos_delete" ON productos;
CREATE POLICY "productos_delete" ON productos
    FOR DELETE TO authenticated
    USING (public.es_admin());


-- ============================================
-- 4. PRODUCTO_VARIANTES — Precios, stock, presentaciones
--    SELECT: todo autenticado (vendedores usan VIEW sin costo)
--    INSERT/UPDATE/DELETE: solo admin
-- ============================================

DROP POLICY IF EXISTS "variantes_select" ON producto_variantes;
CREATE POLICY "variantes_select" ON producto_variantes
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "variantes_insert" ON producto_variantes;
CREATE POLICY "variantes_insert" ON producto_variantes
    FOR INSERT TO authenticated
    WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "variantes_update" ON producto_variantes;
CREATE POLICY "variantes_update" ON producto_variantes
    FOR UPDATE TO authenticated
    USING (public.es_admin())
    WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "variantes_delete" ON producto_variantes;
CREATE POLICY "variantes_delete" ON producto_variantes
    FOR DELETE TO authenticated
    USING (public.es_admin());


-- ============================================
-- 5. CLIENTES
--    SELECT: todo autenticado (vendedores usan VIEW sin precios_personalizados)
--    INSERT: todo autenticado (vendedores pueden sugerir altas)
--    UPDATE/DELETE: solo admin
-- ============================================

DROP POLICY IF EXISTS "clientes_select" ON clientes;
CREATE POLICY "clientes_select" ON clientes
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "clientes_insert" ON clientes;
CREATE POLICY "clientes_insert" ON clientes
    FOR INSERT TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "clientes_update" ON clientes;
CREATE POLICY "clientes_update" ON clientes
    FOR UPDATE TO authenticated
    USING (public.es_admin())
    WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "clientes_delete" ON clientes;
CREATE POLICY "clientes_delete" ON clientes
    FOR DELETE TO authenticated
    USING (public.es_admin());


-- ============================================
-- 6. AUDIT_LOGS — Caja negra inmutable
--    SELECT: solo admin (forensia)
--    INSERT/UPDATE/DELETE: nadie (triggers SECURITY DEFINER insertan)
--    NOTA: zero politicas de escritura = inaccesible para roles normales
-- ============================================

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs
    FOR SELECT TO authenticated
    USING (public.es_admin());

-- Sin politicas INSERT/UPDATE/DELETE = bloqueado para todos los roles.
-- Solo funciones SECURITY DEFINER (trigger log_audit_event) pueden escribir.


-- ============================================
-- 7. APP_SECRETS — Almacen de secretos
--    ZERO politicas = inaccesible para anon y authenticated.
--    Solo funciones SECURITY DEFINER pueden leer (notify_alerta_seguridad).
-- ============================================

-- Confirmamos que NO hay politicas: RLS habilitado + zero policies = acceso denegado.
-- Esto es intencional y documentado en CLAUDE.md P6.


-- ============================================
-- 8. PEDIDOS — Refuerzo: verificar perfil activo en INSERT
--    (complementa politica existente con check de Kill Switch)
-- ============================================

-- La politica pedidos_insert existente no verifica si el vendedor esta activo.
-- Agregamos una politica que lo exige, previniendo inserciones post-Kill Switch.

DROP POLICY IF EXISTS "pedidos_insert_activo" ON pedidos;
CREATE POLICY "pedidos_insert_activo" ON pedidos
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.perfiles
            WHERE id = auth.uid() AND activo = true
        )
    );

-- NOTA: Si ya existe "pedidos_insert", ambas politicas se evaluan con OR.
-- Para que actuen como AND, eliminar la politica original y mantener solo esta:
--   DROP POLICY IF EXISTS "pedidos_insert" ON pedidos;
-- Descomentear la linea anterior SOLO si se desea enforcement estricto.


-- ============================================
-- VERIFICACION POST-EJECUCION
-- Ejecutar esta consulta para confirmar que todas las tablas tienen RLS:
-- ============================================
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
