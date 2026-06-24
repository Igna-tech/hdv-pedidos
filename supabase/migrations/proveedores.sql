-- ============================================================
-- HDV Distribuciones — Módulo Proveedores
-- Ejecutar desde Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLA: proveedores
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proveedores (
    id                  TEXT PRIMARY KEY,
    nombre              TEXT NOT NULL,
    razon_social        TEXT,
    ruc                 TEXT,
    telefono            TEXT,
    email               TEXT,
    direccion           TEXT,
    ciudad              TEXT,
    contacto_principal  TEXT,
    categoria           TEXT,
    condiciones_pago    TEXT DEFAULT 'contado',
    dias_credito        INT DEFAULT 0,
    activo              BOOLEAN DEFAULT true,
    notas               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    actualizado_en      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proveedores_activo ON public.proveedores (activo);
CREATE INDEX IF NOT EXISTS idx_proveedores_ruc ON public.proveedores (ruc)
    WHERE (ruc IS NOT NULL AND ruc <> '');

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proveedores_select" ON public.proveedores
    FOR SELECT USING (es_admin());
CREATE POLICY "proveedores_insert" ON public.proveedores
    FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "proveedores_update" ON public.proveedores
    FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "proveedores_delete" ON public.proveedores
    FOR DELETE TO authenticated USING (es_admin());

CREATE TRIGGER trg_audit_proveedores
    AFTER UPDATE OR DELETE ON public.proveedores
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

ALTER PUBLICATION supabase_realtime ADD TABLE public.proveedores;

-- ────────────────────────────────────────────────────────────
-- TABLA: ordenes_compra
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ordenes_compra (
    id                  TEXT PRIMARY KEY,
    proveedor_id        TEXT REFERENCES public.proveedores(id),
    estado              TEXT DEFAULT 'borrador',
    fecha_emision       TEXT,
    fecha_esperada      TEXT,
    fecha_recepcion     TEXT,
    fecha_vencimiento   TEXT,
    items               JSONB DEFAULT '[]',
    total               NUMERIC DEFAULT 0,
    pagado              NUMERIC DEFAULT 0,
    nro_factura_prov    TEXT,
    notas               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    actualizado_en      TIMESTAMPTZ DEFAULT now(),
    creado_por          UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_oc_proveedor_id  ON public.ordenes_compra (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_oc_estado        ON public.ordenes_compra (estado);
CREATE INDEX IF NOT EXISTS idx_oc_fecha_emision ON public.ordenes_compra (fecha_emision DESC);

ALTER TABLE public.ordenes_compra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oc_select" ON public.ordenes_compra
    FOR SELECT USING (es_admin());
CREATE POLICY "oc_insert" ON public.ordenes_compra
    FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "oc_update" ON public.ordenes_compra
    FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "oc_delete" ON public.ordenes_compra
    FOR DELETE TO authenticated USING (es_admin());

CREATE TRIGGER trg_audit_oc
    AFTER UPDATE OR DELETE ON public.ordenes_compra
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

ALTER PUBLICATION supabase_realtime ADD TABLE public.ordenes_compra;

-- ────────────────────────────────────────────────────────────
-- TABLA: pagos_proveedor
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pagos_proveedor (
    id                  TEXT PRIMARY KEY,
    orden_compra_id     TEXT REFERENCES public.ordenes_compra(id),
    proveedor_id        TEXT REFERENCES public.proveedores(id),
    monto               NUMERIC NOT NULL,
    fecha               TEXT,
    metodo_pago         TEXT DEFAULT 'transferencia',
    referencia          TEXT,
    notas               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagosprov_oc   ON public.pagos_proveedor (orden_compra_id);
CREATE INDEX IF NOT EXISTS idx_pagosprov_prov ON public.pagos_proveedor (proveedor_id);

ALTER TABLE public.pagos_proveedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pagosprov_select" ON public.pagos_proveedor
    FOR SELECT USING (es_admin());
CREATE POLICY "pagosprov_insert" ON public.pagos_proveedor
    FOR INSERT TO authenticated WITH CHECK (es_admin());
CREATE POLICY "pagosprov_update" ON public.pagos_proveedor
    FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "pagosprov_delete" ON public.pagos_proveedor
    FOR DELETE TO authenticated USING (es_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE public.pagos_proveedor;
