-- ============================================
-- SECURITY HOTFIX FASE 2 — Triggers Anti-Fraude + RLS Fixes
-- Fecha: 2026-03-26
-- Origen: AUDITORIA_FASE2_SEGURIDAD_PENTESTING.md
--
-- Remediaciones:
--   C-01: Crear 3 triggers de validación server-side (inexistentes)
--   C-02: Actualizar RLS de configuracion para doc_ids particionados
--   C-03: Agregar check activo=true en pedidos_insert para vendedores
-- ============================================

BEGIN;

-- ============================================
-- C-01a: TRIGGER — Validación de precios anti-fraude
-- Compara precios del pedido contra catálogo real.
-- Marca alerta_fraude si detecta anomalías.
-- ============================================

CREATE OR REPLACE FUNCTION public.validar_precios_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    _item jsonb;
    _precio_catalogo int;
    _descuento numeric;
    _total_calculado numeric := 0;
    _alerta boolean := false;
    _detalle text := '';
BEGIN
    -- Verificar descuento excesivo (> 30%)
    _descuento := COALESCE((NEW.datos->>'descuento')::numeric, 0);
    IF _descuento > 30 THEN
        _alerta := true;
        _detalle := _detalle || 'Descuento ' || _descuento || '% excede limite 30%. ';
    END IF;

    -- Verificar cada item contra catálogo
    FOR _item IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.datos->'items', '[]'::jsonb))
    LOOP
        -- Buscar precio real en catálogo
        SELECT pv.precio INTO _precio_catalogo
        FROM public.producto_variantes pv
        WHERE pv.producto_id = _item->>'productoId'
          AND pv.nombre_variante = _item->>'presentacion'
          AND pv.activo = true
        LIMIT 1;

        -- Precio menor al 50% del catálogo
        IF _precio_catalogo IS NOT NULL
           AND (_item->>'precio')::int < (_precio_catalogo * 0.5) THEN
            _alerta := true;
            _detalle := _detalle || 'Precio ' || COALESCE(_item->>'nombre', '?')
                || ': Gs.' || (_item->>'precio')
                || ' < 50% catalogo (Gs.' || _precio_catalogo || '). ';
        END IF;

        -- Cantidad anómala (> 9999)
        IF COALESCE((_item->>'cantidad')::int, 0) > 9999 THEN
            _alerta := true;
            _detalle := _detalle || 'Cantidad anomala: ' || (_item->>'cantidad')
                || ' unidades de ' || COALESCE(_item->>'nombre', '?') || '. ';
        END IF;

        -- Acumular total calculado
        _total_calculado := _total_calculado +
            (COALESCE((_item->>'precio')::numeric, 0) * COALESCE((_item->>'cantidad')::numeric, 0));
    END LOOP;

    -- Total del pedido menor al 40% del total calculado desde items
    IF _total_calculado > 0
       AND COALESCE((NEW.datos->>'total')::numeric, 0) < (_total_calculado * 0.4) THEN
        _alerta := true;
        _detalle := _detalle || 'Total Gs.' || (NEW.datos->>'total')
            || ' < 40% del calculado Gs.' || _total_calculado::int || '. ';
    END IF;

    -- Aplicar marcas de fraude
    IF _alerta THEN
        NEW.datos := jsonb_set(NEW.datos, '{alerta_fraude}', 'true'::jsonb);
        NEW.datos := jsonb_set(NEW.datos, '{fraude_detalle}', to_jsonb(_detalle));
        NEW.datos := jsonb_set(NEW.datos, '{fraude_fecha}', to_jsonb(NOW()::text));
        -- Forzar estado pendiente para revisión admin
        NEW.estado := 'pedido_pendiente';
        NEW.datos := jsonb_set(NEW.datos, '{estado}', '"pedido_pendiente"'::jsonb);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_precios ON public.pedidos;
CREATE TRIGGER trg_validar_precios
    BEFORE INSERT OR UPDATE ON public.pedidos
    FOR EACH ROW
    EXECUTE FUNCTION public.validar_precios_pedido();


-- ============================================
-- C-01b: TRIGGER — Forzar fecha del servidor (anti-backdating)
-- Sobreescribe la fecha del pedido con NOW() del servidor.
-- ============================================

CREATE OR REPLACE FUNCTION public.forzar_fecha_servidor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.fecha := NOW()::text;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forzar_fecha_servidor ON public.pedidos;
CREATE TRIGGER trg_forzar_fecha_servidor
    BEFORE INSERT ON public.pedidos
    FOR EACH ROW
    EXECUTE FUNCTION public.forzar_fecha_servidor();


-- ============================================
-- C-01c: TRIGGER — Bloquear mutaciones en estados terminales
-- Solo admin puede modificar pedidos facturados, anulados, etc.
-- ============================================

CREATE OR REPLACE FUNCTION public.bloquear_mutacion_terminal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.estado IN (
        'facturado_mock', 'nota_credito_mock', 'anulado',
        'cobrado_sin_factura', 'entregado'
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.perfiles
        WHERE id = auth.uid() AND rol = 'admin' AND activo = true
    )
    THEN
        RAISE EXCEPTION 'No se puede modificar un pedido en estado terminal: %', OLD.estado;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_mutacion_terminal ON public.pedidos;
CREATE TRIGGER trg_bloquear_mutacion_terminal
    BEFORE UPDATE ON public.pedidos
    FOR EACH ROW
    EXECUTE FUNCTION public.bloquear_mutacion_terminal();


-- ============================================
-- C-02: FIX RLS — configuracion (gastos/rendiciones particionados)
-- Los doc_ids ahora son 'gastos_vendedor_<uuid>' y 'rendiciones_<uuid>'
-- Se usa LIKE en vez de IN para soportar el patrón.
-- ============================================

DROP POLICY IF EXISTS "config_insert" ON public.configuracion;
CREATE POLICY "config_insert" ON public.configuracion
    FOR INSERT TO authenticated
    WITH CHECK (
        public.es_admin()
        OR doc_id IN ('pagos_credito', 'clientes_pendientes')
        OR doc_id LIKE 'gastos_vendedor_%'
        OR doc_id LIKE 'rendiciones_%'
    );

DROP POLICY IF EXISTS "config_update" ON public.configuracion;
CREATE POLICY "config_update" ON public.configuracion
    FOR UPDATE TO authenticated
    USING (
        public.es_admin()
        OR doc_id IN ('pagos_credito', 'clientes_pendientes')
        OR doc_id LIKE 'gastos_vendedor_%'
        OR doc_id LIKE 'rendiciones_%'
    )
    WITH CHECK (
        public.es_admin()
        OR doc_id IN ('pagos_credito', 'clientes_pendientes')
        OR doc_id LIKE 'gastos_vendedor_%'
        OR doc_id LIKE 'rendiciones_%'
    );


-- ============================================
-- C-03: FIX RLS — pedidos_insert con check activo=true
-- Vendedores desactivados por Kill Switch no pueden insertar.
-- ============================================

DROP POLICY IF EXISTS "pedidos_insert" ON public.pedidos;
CREATE POLICY "pedidos_insert" ON public.pedidos
    FOR INSERT TO authenticated
    WITH CHECK (
        public.es_admin()
        OR (
            vendedor_id = auth.uid()
            AND EXISTS (
                SELECT 1 FROM public.perfiles
                WHERE id = auth.uid() AND activo = true
            )
        )
    );


COMMIT;

-- ============================================
-- VERIFICACIÓN: Listar triggers instalados en tabla pedidos
-- ============================================
-- SELECT tgname, tgtype, tgenabled
-- FROM pg_trigger
-- WHERE tgrelid = 'public.pedidos'::regclass
-- AND NOT tgisinternal;
