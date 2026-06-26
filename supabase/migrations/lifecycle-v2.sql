-- ============================================================
-- Migración: Ciclo de Vida v2 — Número de Pedido Sagrado
-- Fecha: 2026-06-26
-- ============================================================
-- OBJETIVO:
--   1. Reset de datos mock: borrar pedidos, pagos e historial del sistema.
--      CONSERVA los créditos manuales (recordatorios personales del dueño).
--   2. Reiniciar la secuencia para que el PRIMER pedido sea #0000000.
--   3. Permitir el cierre de crédito: transición entregado -> cobrado_sin_factura
--      por el dueño del pedido (resto de estados terminales sigue protegido).
--
-- ⚠️  DESTRUCTIVO: borra TODOS los pedidos y sus pagos/historial.
--     Ejecutar en el SQL Editor de Supabase SOLO cuando estés listo para
--     arrancar con datos limpios. El sistema es mock aún.
--
--   numero_pedido es un identificador INTERNO de seguimiento (#0000000).
--   NO es el número de factura SIFEN (001-001-NNNNNNN). No se mezclan.
--   No se toca generación XML/CDC/SIFEN ni Edge Functions.
-- ============================================================


-- ============================================================
-- 1. LIMPIEZA DE DATOS MOCK DEL SISTEMA
-- ============================================================

-- 1a. Borrar todos los pedidos (CASCADE limpia dependencias FK como audit refs)
TRUNCATE TABLE public.pedidos CASCADE;

-- 1b. Borrar el libro de cobros y el historial de créditos del sistema.
--     Estos viven como documentos JSONB en la tabla configuracion.
--     ⚠️ NO se toca 'creditos_manuales' (recordatorios personales) — se conservan.
DELETE FROM public.configuracion
WHERE doc_id IN ('pagos_credito', 'historial_creditos');

-- 1c. (OPCIONAL — comentado) Si querés también limpiar gastos y rendiciones mock,
--     descomentá. No afectan la numeración (son por fecha, no por número de pedido).
-- DELETE FROM public.configuracion
-- WHERE doc_id LIKE 'gastos_vendedor_%' OR doc_id LIKE 'rendiciones_%';


-- ============================================================
-- 2. REINICIAR LA SECUENCIA DE NUMERACIÓN A #0
-- ============================================================
-- La secuencia hdv_pedidos_numero_seq fue creada en la migración
-- 20260623_numero_pedido.sql con START WITH 1. La reconfiguramos para que
-- el primer nextval() devuelva 0 (primer pedido = #0000000).
ALTER SEQUENCE public.hdv_pedidos_numero_seq MINVALUE 0 START WITH 0 RESTART WITH 0;

-- El trigger BEFORE INSERT fn_asignar_numero_pedido (ya existente) asigna
-- NEW.numero_pedido := nextval(...) cuando viene NULL. No requiere cambios.


-- ============================================================
-- 3. PERMITIR EL CIERRE DE CRÉDITO  ⚠️ (trigger de seguridad)
-- ============================================================
-- Antes: 'entregado' era terminal -> el vendedor NO podía cobrar un crédito
-- (entregado -> cobrado_sin_factura era rechazado), generando divergencia
-- entre el estado local y el servidor.
--
-- Ahora: se permite EXCLUSIVAMENTE la transición entregado -> cobrado_sin_factura
-- (el cierre del crédito al saldarse). Todos los demás cambios sobre estados
-- terminales siguen bloqueados para no-admin.
CREATE OR REPLACE FUNCTION public.bloquear_mutacion_terminal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.estado IN (
        'facturado_mock', 'nota_credito_mock', 'anulado',
        'cobrado_sin_factura', 'entregado'
    )
    -- Excepción: cerrar un crédito entregado al cobrarlo en su totalidad.
    AND NOT (OLD.estado = 'entregado' AND NEW.estado = 'cobrado_sin_factura')
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

-- El trigger trg_bloquear_mutacion_terminal ya apunta a esta función; no se recrea.


-- ============================================================
-- VERIFICACIÓN POST-EJECUCIÓN (opcional, podés correrlas sueltas)
-- ============================================================
-- SELECT last_value, is_called FROM public.hdv_pedidos_numero_seq;  -- esperar is_called=false
-- SELECT count(*) FROM public.pedidos;                              -- esperar 0
-- SELECT doc_id FROM public.configuracion WHERE doc_id LIKE '%credito%';  -- solo creditos_manuales
