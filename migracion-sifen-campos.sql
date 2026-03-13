-- ============================================
-- Migracion SIFEN: campos fiscales
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Fecha: 2026-03-13
-- SEGURO: usa IF NOT EXISTS y ALTER ADD COLUMN IF NOT EXISTS
-- No borra datos existentes
-- ============================================

-- 1. Tabla configuracion_empresa (singleton)
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

-- 2. Columnas SIFEN en clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'RUC';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pais_documento TEXT DEFAULT 'PRY';

-- 3. Columna SIFEN en productos
ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidad_medida_set TEXT DEFAULT '77';

-- 4. RLS para configuracion_empresa
ALTER TABLE configuracion_empresa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfg_empresa_select" ON configuracion_empresa
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "cfg_empresa_update" ON configuracion_empresa
    FOR UPDATE TO authenticated USING (public.es_admin());

CREATE POLICY "cfg_empresa_insert" ON configuracion_empresa
    FOR INSERT TO authenticated WITH CHECK (public.es_admin());

-- 5. Habilitar Realtime (opcional)
ALTER PUBLICATION supabase_realtime ADD TABLE configuracion_empresa;

-- Verificacion
SELECT 'configuracion_empresa creada' AS status, count(*) AS filas FROM configuracion_empresa;
SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'clientes' AND column_name IN ('tipo_documento', 'pais_documento');
SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'productos' AND column_name = 'unidad_medida_set';
