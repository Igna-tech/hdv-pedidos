-- ============================================
-- HDV Distribuciones - Remediacion de Seguridad RLS
-- Ejecutar en Supabase Dashboard > SQL Editor
-- Fecha: 2026-03-12
-- ============================================
-- BRECHAS DETECTADAS:
--   1. catalogo, configuracion, pedidos, reportes_mensuales tienen
--      politicas "ALL" para rol "anon" (cualquiera con la URL puede leer/borrar todo)
--   2. Vendedores ven TODOS los pedidos (no hay aislamiento por usuario)
--   3. Vendedores pueden cambiar su propio campo "rol" a "admin"
--   4. Politicas duplicadas/residuales en perfiles
--   5. reportes_mensuales no tiene politicas para authenticated
-- ============================================

BEGIN;

-- ============================================
-- FASE 1: Funciones helper de seguridad
-- ============================================

-- Verifica si el usuario actual es admin (bypass RLS con SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.perfiles
        WHERE id = auth.uid() AND rol = 'admin'
    );
$$;

-- Retorna el rol actual del usuario (para prevenir auto-escalacion)
CREATE OR REPLACE FUNCTION public.obtener_mi_rol()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT rol FROM public.perfiles WHERE id = auth.uid();
$$;

-- ============================================
-- FASE 2: Eliminar TODAS las politicas anon peligrosas
-- Estas permiten acceso total sin autenticacion
-- ============================================

DROP POLICY IF EXISTS "Acceso total catalogo" ON public.catalogo;
DROP POLICY IF EXISTS "Acceso total configuracion" ON public.configuracion;
DROP POLICY IF EXISTS "Acceso total pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Acceso total reportes" ON public.reportes_mensuales;

-- ============================================
-- FASE 3: Agregar vendedor_id a pedidos + aislamiento
-- ============================================

-- 3a. Nueva columna: vincula cada pedido a su vendedor creador
ALTER TABLE public.pedidos
    ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES auth.users(id);

-- 3b. Asignar pedidos existentes al vendedor actual del sistema
-- (UUID del unico vendedor activo)
UPDATE public.pedidos
SET vendedor_id = 'eaf48b9c-8377-4cc2-b49a-2e38a2b1acbb'
WHERE vendedor_id IS NULL;

-- 3c. Indice para performance en RLS (PostgreSQL evalua vendedor_id en cada query)
CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor
    ON public.pedidos USING btree (vendedor_id);

-- 3d. Eliminar politicas viejas de pedidos
DROP POLICY IF EXISTS "Lectura pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Escritura pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Actualizacion pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Eliminacion pedidos" ON public.pedidos;

-- 3e. Nuevas politicas: admin ve todo, vendedor solo lo suyo
CREATE POLICY "pedidos_select" ON public.pedidos
    FOR SELECT TO authenticated
    USING (public.es_admin() OR vendedor_id = auth.uid());

CREATE POLICY "pedidos_insert" ON public.pedidos
    FOR INSERT TO authenticated
    WITH CHECK (public.es_admin() OR vendedor_id = auth.uid());

CREATE POLICY "pedidos_update" ON public.pedidos
    FOR UPDATE TO authenticated
    USING (public.es_admin() OR vendedor_id = auth.uid())
    WITH CHECK (public.es_admin() OR vendedor_id = auth.uid());

CREATE POLICY "pedidos_delete" ON public.pedidos
    FOR DELETE TO authenticated
    USING (public.es_admin() OR vendedor_id = auth.uid());

-- ============================================
-- FASE 4: Blindaje de perfiles (prevenir escalacion de rol)
-- ============================================

-- 4a. Limpiar TODAS las politicas anteriores (incluidas duplicadas)
DROP POLICY IF EXISTS "Usuarios pueden ver su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Admins pueden ver todos los perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Admins pueden crear perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Admins pueden actualizar perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Admins pueden actualizar todos los perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios pueden actualizar su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Permitir lectura autenticados" ON public.perfiles;

-- 4b. SELECT: usuario ve su perfil, admin ve todos
CREATE POLICY "perfiles_select_own" ON public.perfiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

CREATE POLICY "perfiles_select_admin" ON public.perfiles
    FOR SELECT TO authenticated
    USING (public.es_admin());

-- 4c. INSERT: solo admins (el trigger SECURITY DEFINER handle_new_user crea el automatico)
CREATE POLICY "perfiles_insert_admin" ON public.perfiles
    FOR INSERT TO authenticated
    WITH CHECK (public.es_admin());

-- 4d. UPDATE propio: puede editar nombre, etc. PERO NO puede cambiar su rol
-- WITH CHECK verifica que el campo rol siga siendo el mismo que tiene actualmente
CREATE POLICY "perfiles_update_own" ON public.perfiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND rol = public.obtener_mi_rol());

-- 4e. UPDATE admin: puede editar cualquier perfil incluyendo cambio de rol
CREATE POLICY "perfiles_update_admin" ON public.perfiles
    FOR UPDATE TO authenticated
    USING (public.es_admin());

-- ============================================
-- FASE 5: Tabla catalogo (legacy) - remover acceso anon
-- ============================================

DROP POLICY IF EXISTS "Actualizacion catalogo" ON public.catalogo;
DROP POLICY IF EXISTS "Escritura catalogo" ON public.catalogo;
DROP POLICY IF EXISTS "Lectura catalogo" ON public.catalogo;

-- Lectura para todos los autenticados, escritura solo admin
CREATE POLICY "catalogo_select" ON public.catalogo
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "catalogo_insert" ON public.catalogo
    FOR INSERT TO authenticated WITH CHECK (public.es_admin());

CREATE POLICY "catalogo_update" ON public.catalogo
    FOR UPDATE TO authenticated
    USING (public.es_admin()) WITH CHECK (public.es_admin());

CREATE POLICY "catalogo_delete" ON public.catalogo
    FOR DELETE TO authenticated USING (public.es_admin());

-- ============================================
-- FASE 6: Configuracion - remover acceso anon
-- Nota: vendedores NECESITAN escribir gastos_vendedor,
-- rendiciones y pagos_credito, asi que se mantiene
-- escritura para authenticated (no solo admin)
-- ============================================

DROP POLICY IF EXISTS "Escritura configuracion" ON public.configuracion;
DROP POLICY IF EXISTS "Actualizacion configuracion" ON public.configuracion;
DROP POLICY IF EXISTS "Lectura configuracion" ON public.configuracion;

CREATE POLICY "config_select" ON public.configuracion
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "config_insert" ON public.configuracion
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "config_update" ON public.configuracion
    FOR UPDATE TO authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "config_delete" ON public.configuracion
    FOR DELETE TO authenticated USING (public.es_admin());

-- ============================================
-- FASE 7: reportes_mensuales - agregar politicas authenticated
-- (solo tenia la politica anon que acabamos de borrar)
-- ============================================

CREATE POLICY "reportes_select" ON public.reportes_mensuales
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "reportes_insert" ON public.reportes_mensuales
    FOR INSERT TO authenticated WITH CHECK (public.es_admin());

CREATE POLICY "reportes_update" ON public.reportes_mensuales
    FOR UPDATE TO authenticated
    USING (public.es_admin()) WITH CHECK (public.es_admin());

CREATE POLICY "reportes_delete" ON public.reportes_mensuales
    FOR DELETE TO authenticated USING (public.es_admin());

COMMIT;

-- ============================================
-- VERIFICACION POST-EJECUCION
-- Ejecutar esta query para confirmar que no quedan politicas anon:
-- ============================================
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public' AND roles::text LIKE '%anon%';
--
-- Resultado esperado: 0 filas
-- ============================================
