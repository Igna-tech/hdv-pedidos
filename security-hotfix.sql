-- ============================================
-- HDV Distribuciones - Hotfix de Seguridad
-- Fecha: 2026-03-18
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================

BEGIN;

-- ============================================
-- FIX 1: Prevenir escalacion de privilegios en registro
-- El trigger handle_new_user ya no lee rol de metadata
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- SEGURIDAD: rol siempre 'vendedor' al registrarse.
    -- Solo un admin puede promover via UPDATE en tabla perfiles.
    INSERT INTO public.perfiles (id, nombre_completo, rol)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'nombre_completo', ''),
        'vendedor'
    );
    RETURN NEW;
END;
$$;

-- ============================================
-- FIX 2: es_admin() verifica campo activo
-- Un admin desactivado pierde privilegios
-- ============================================

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.perfiles
        WHERE id = auth.uid() AND rol = 'admin' AND activo = true
    );
$$;

-- ============================================
-- FIX 3: Restringir escritura de configuracion
-- Vendedores solo pueden escribir docs operativos propios
-- ============================================

DROP POLICY IF EXISTS "config_insert" ON public.configuracion;
DROP POLICY IF EXISTS "config_update" ON public.configuracion;

CREATE POLICY "config_insert" ON public.configuracion
    FOR INSERT TO authenticated
    WITH CHECK (
        public.es_admin()
        OR doc_id IN ('gastos_vendedor', 'rendiciones', 'pagos_credito', 'clientes_pendientes')
    );

CREATE POLICY "config_update" ON public.configuracion
    FOR UPDATE TO authenticated
    USING (
        public.es_admin()
        OR doc_id IN ('gastos_vendedor', 'rendiciones', 'pagos_credito', 'clientes_pendientes')
    )
    WITH CHECK (
        public.es_admin()
        OR doc_id IN ('gastos_vendedor', 'rendiciones', 'pagos_credito', 'clientes_pendientes')
    );

-- ============================================
-- FIX 4: Indices faltantes para performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor ON public.pedidos USING btree (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON public.pedidos USING btree (estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_creado_en ON public.pedidos USING btree (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_producto_variantes_producto_id ON public.producto_variantes USING btree (producto_id);
CREATE INDEX IF NOT EXISTS idx_productos_categoria_id ON public.productos USING btree (categoria_id);
CREATE INDEX IF NOT EXISTS idx_clientes_zona ON public.clientes USING btree (zona);

-- ============================================
-- FIX 5: RLS para tablas relacionales del catalogo
-- (si no tienen RLS habilitado, habilitarlo)
-- ============================================

ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_variantes ENABLE ROW LEVEL SECURITY;

-- Categorias: lectura autenticados, escritura admin
DROP POLICY IF EXISTS "categorias_select" ON public.categorias;
DROP POLICY IF EXISTS "categorias_insert" ON public.categorias;
DROP POLICY IF EXISTS "categorias_update" ON public.categorias;
DROP POLICY IF EXISTS "categorias_delete" ON public.categorias;

CREATE POLICY "categorias_select" ON public.categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "categorias_insert" ON public.categorias FOR INSERT TO authenticated WITH CHECK (public.es_admin());
CREATE POLICY "categorias_update" ON public.categorias FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());
CREATE POLICY "categorias_delete" ON public.categorias FOR DELETE TO authenticated USING (public.es_admin());

-- Clientes: lectura autenticados, escritura admin
DROP POLICY IF EXISTS "clientes_select" ON public.clientes;
DROP POLICY IF EXISTS "clientes_insert" ON public.clientes;
DROP POLICY IF EXISTS "clientes_update" ON public.clientes;
DROP POLICY IF EXISTS "clientes_delete" ON public.clientes;

CREATE POLICY "clientes_select" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "clientes_insert" ON public.clientes FOR INSERT TO authenticated WITH CHECK (public.es_admin());
CREATE POLICY "clientes_update" ON public.clientes FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());
CREATE POLICY "clientes_delete" ON public.clientes FOR DELETE TO authenticated USING (public.es_admin());

-- Productos: lectura autenticados, escritura admin
DROP POLICY IF EXISTS "productos_select" ON public.productos;
DROP POLICY IF EXISTS "productos_insert" ON public.productos;
DROP POLICY IF EXISTS "productos_update" ON public.productos;
DROP POLICY IF EXISTS "productos_delete" ON public.productos;

CREATE POLICY "productos_select" ON public.productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "productos_insert" ON public.productos FOR INSERT TO authenticated WITH CHECK (public.es_admin());
CREATE POLICY "productos_update" ON public.productos FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());
CREATE POLICY "productos_delete" ON public.productos FOR DELETE TO authenticated USING (public.es_admin());

-- Producto variantes: lectura autenticados, escritura admin
DROP POLICY IF EXISTS "variantes_select" ON public.producto_variantes;
DROP POLICY IF EXISTS "variantes_insert" ON public.producto_variantes;
DROP POLICY IF EXISTS "variantes_update" ON public.producto_variantes;
DROP POLICY IF EXISTS "variantes_delete" ON public.producto_variantes;

CREATE POLICY "variantes_select" ON public.producto_variantes FOR SELECT TO authenticated USING (true);
CREATE POLICY "variantes_insert" ON public.producto_variantes FOR INSERT TO authenticated WITH CHECK (public.es_admin());
CREATE POLICY "variantes_update" ON public.producto_variantes FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());
CREATE POLICY "variantes_delete" ON public.producto_variantes FOR DELETE TO authenticated USING (public.es_admin());

COMMIT;

-- ============================================
-- VERIFICACION: ejecutar despues del script
-- ============================================
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;
