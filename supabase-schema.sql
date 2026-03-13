-- ============================================
-- HDV Distribuciones - Schema Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Actualizado: 2026-03-12 (seguridad RLS corregida)
-- ============================================

-- TABLA: pedidos
CREATE TABLE IF NOT EXISTS pedidos (
    id TEXT PRIMARY KEY,
    estado TEXT DEFAULT 'pendiente',
    fecha TEXT,
    datos JSONB NOT NULL,
    vendedor_id UUID REFERENCES auth.users(id),
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA: catalogo (legacy - reemplazada por tablas relacionales)
CREATE TABLE IF NOT EXISTS catalogo (
    id TEXT PRIMARY KEY,
    categorias JSONB DEFAULT '[]'::jsonb,
    productos JSONB DEFAULT '[]'::jsonb,
    clientes JSONB DEFAULT '[]'::jsonb,
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA: configuracion (pagos, creditos, promociones, etc.)
CREATE TABLE IF NOT EXISTS configuracion (
    doc_id TEXT PRIMARY KEY,
    datos JSONB,
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA: reportes_mensuales
CREATE TABLE IF NOT EXISTS reportes_mensuales (
    mes TEXT PRIMARY KEY,
    datos JSONB,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA: configuracion_empresa (singleton — datos fiscales SIFEN)
CREATE TABLE IF NOT EXISTS configuracion_empresa (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ruc_empresa TEXT NOT NULL DEFAULT '',
    razon_social TEXT NOT NULL DEFAULT '',
    nombre_fantasia TEXT DEFAULT '',
    timbrado_numero TEXT NOT NULL DEFAULT '',
    timbrado_vencimiento DATE,
    establecimiento TEXT NOT NULL DEFAULT '001',
    punto_expedicion TEXT NOT NULL DEFAULT '001',
    direccion_fiscal TEXT DEFAULT '',
    telefono_empresa TEXT DEFAULT '',
    email_empresa TEXT DEFAULT '',
    actividad_economica TEXT DEFAULT '',
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar fila singleton si no existe
INSERT INTO configuracion_empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Columnas SIFEN en clientes (retrocompatible, nullable)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'RUC';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pais_documento TEXT DEFAULT 'PRY';

-- Columna SIFEN en productos (retrocompatible, nullable)
ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidad_medida_set TEXT DEFAULT '77';

-- ============================================
-- INDICES para mejorar performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor ON pedidos(vendedor_id);

-- Indice unico parcial: evita RUCs duplicados a nivel DB (permite multiples NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_ruc_unique ON clientes(ruc) WHERE ruc IS NOT NULL AND ruc != '';

-- ============================================
-- FUNCIONES HELPER DE SEGURIDAD
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
        WHERE id = auth.uid() AND rol = 'admin'
    );
$$;

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
-- ROW LEVEL SECURITY (RLS)
-- IMPORTANTE: Solo usuarios authenticated tienen acceso.
-- El rol anon NO tiene acceso a ninguna tabla.
-- ============================================

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_empresa ENABLE ROW LEVEL SECURITY;

-- CONFIGURACION EMPRESA: lectura authenticated, escritura solo admin
CREATE POLICY "cfg_empresa_select" ON configuracion_empresa FOR SELECT TO authenticated USING (true);
CREATE POLICY "cfg_empresa_update" ON configuracion_empresa FOR UPDATE TO authenticated USING (public.es_admin());
CREATE POLICY "cfg_empresa_insert" ON configuracion_empresa FOR INSERT TO authenticated WITH CHECK (public.es_admin());

-- PEDIDOS: admin ve todo, vendedor solo sus pedidos
CREATE POLICY "pedidos_select" ON pedidos
    FOR SELECT TO authenticated
    USING (public.es_admin() OR vendedor_id = auth.uid());
CREATE POLICY "pedidos_insert" ON pedidos
    FOR INSERT TO authenticated
    WITH CHECK (public.es_admin() OR vendedor_id = auth.uid());
CREATE POLICY "pedidos_update" ON pedidos
    FOR UPDATE TO authenticated
    USING (public.es_admin() OR vendedor_id = auth.uid())
    WITH CHECK (public.es_admin() OR vendedor_id = auth.uid());
CREATE POLICY "pedidos_delete" ON pedidos
    FOR DELETE TO authenticated
    USING (public.es_admin() OR vendedor_id = auth.uid());

-- CATALOGO (legacy): lectura authenticated, escritura admin
CREATE POLICY "catalogo_select" ON catalogo
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalogo_insert" ON catalogo
    FOR INSERT TO authenticated WITH CHECK (public.es_admin());
CREATE POLICY "catalogo_update" ON catalogo
    FOR UPDATE TO authenticated
    USING (public.es_admin()) WITH CHECK (public.es_admin());
CREATE POLICY "catalogo_delete" ON catalogo
    FOR DELETE TO authenticated USING (public.es_admin());

-- CONFIGURACION: lectura authenticated, escritura authenticated, borrado admin
CREATE POLICY "config_select" ON configuracion
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "config_insert" ON configuracion
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "config_update" ON configuracion
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "config_delete" ON configuracion
    FOR DELETE TO authenticated USING (public.es_admin());

-- REPORTES: lectura authenticated, escritura admin
CREATE POLICY "reportes_select" ON reportes_mensuales
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "reportes_insert" ON reportes_mensuales
    FOR INSERT TO authenticated WITH CHECK (public.es_admin());
CREATE POLICY "reportes_update" ON reportes_mensuales
    FOR UPDATE TO authenticated
    USING (public.es_admin()) WITH CHECK (public.es_admin());
CREATE POLICY "reportes_delete" ON reportes_mensuales
    FOR DELETE TO authenticated USING (public.es_admin());

-- ============================================
-- REALTIME: habilitar tablas para suscripciones
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE catalogo;
ALTER PUBLICATION supabase_realtime ADD TABLE configuracion;
