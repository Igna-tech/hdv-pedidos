-- ============================================
-- HDV Distribuciones - Schema Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================

-- TABLA: pedidos
CREATE TABLE IF NOT EXISTS pedidos (
    id TEXT PRIMARY KEY,
    estado TEXT DEFAULT 'pendiente',
    fecha TEXT,
    datos JSONB NOT NULL,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- TABLA: catalogo (productos, categorias, clientes)
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

-- ============================================
-- INDICES para mejorar performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos(fecha DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- El sistema HDV no tiene login de usuarios,
-- usamos la anon key con acceso total.
-- ============================================

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes_mensuales ENABLE ROW LEVEL SECURITY;

-- Politicas: permitir todo al rol anonimo (anon key)
CREATE POLICY "Acceso total pedidos" ON pedidos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total catalogo" ON catalogo FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total configuracion" ON configuracion FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total reportes" ON reportes_mensuales FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================
-- REALTIME: habilitar tablas para suscripciones
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE catalogo;
ALTER PUBLICATION supabase_realtime ADD TABLE configuracion;
