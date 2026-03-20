-- ============================================
-- Webhooks de Seguridad: Alertas en tiempo real
-- Dispara Edge Function alertas-seguridad ante eventos criticos
-- ============================================
--
-- PREREQUISITOS:
--   1. Edge Function 'alertas-seguridad' desplegada
--   2. Extension pg_net habilitada (activar desde Dashboard > Database > Extensions)
--   3. Variables de entorno configuradas en Edge Function:
--      - WEBHOOK_SECRET: Token secreto para autenticar webhooks
--      - WHATSAPP_API_URL: URL de la API de WhatsApp (Twilio/Meta/etc.)
--      - WHATSAPP_API_KEY: Bearer token de la API
--      - WHATSAPP_DESTINO: Numero de telefono del admin (formato internacional)
--
-- OPCION A: Configurar via Supabase Dashboard (recomendado)
--   Dashboard > Database > Webhooks > Create webhook
--   - Tabla: pedidos, Evento: UPDATE, Condicion: datos->>'alerta_fraude' = 'true'
--   - Tabla: audit_logs, Evento: INSERT
--   - Tabla: perfiles, Evento: UPDATE
--   URL: https://<project-ref>.supabase.co/functions/v1/alertas-seguridad
--   Headers: x-webhook-secret = <tu-secreto>
--
-- OPCION B: Via SQL con pg_net (requiere extension activa)
--   Descomentar las funciones y triggers de abajo.
-- ============================================

-- ============================================
-- OPCION B: Triggers con pg_net (descomentar si pg_net esta activo)
-- ============================================

-- Funcion generica: envia payload a Edge Function via pg_net
CREATE OR REPLACE FUNCTION notify_alerta_seguridad()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _payload jsonb;
    _url text;
    _secret text;
BEGIN
    -- Construir payload compatible con formato webhook de Supabase
    _payload := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA,
        'record', CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb ELSE row_to_json(NEW)::jsonb END,
        'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb ELSE NULL END
    );

    -- URL de la Edge Function y secreto (hardcodeados para evitar error 42501 en GUC)
    _url := 'https://ngtoshttgnfgbiurnrix.supabase.co/functions/v1/alertas-seguridad';
    _secret := 'hdv_secreto_123';

    -- Enviar via pg_net HTTP async (no bloquea la transaccion)
    PERFORM net.http_post(
        url := _url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-webhook-secret', _secret
        ),
        body := _payload
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================
-- TRIGGER 1: Fraude en pedidos (INSERT y UPDATE separados, TG_OP no disponible en WHEN)
-- ============================================
DROP TRIGGER IF EXISTS trg_alerta_fraude_pedidos ON public.pedidos;
DROP TRIGGER IF EXISTS trg_alerta_fraude_pedidos_insert ON public.pedidos;
DROP TRIGGER IF EXISTS trg_alerta_fraude_pedidos_update ON public.pedidos;

CREATE TRIGGER trg_alerta_fraude_pedidos_insert
    AFTER INSERT ON public.pedidos
    FOR EACH ROW
    WHEN ((NEW.datos->>'alerta_fraude')::boolean = true)
    EXECUTE FUNCTION notify_alerta_seguridad();

CREATE TRIGGER trg_alerta_fraude_pedidos_update
    AFTER UPDATE ON public.pedidos
    FOR EACH ROW
    WHEN (
        (NEW.datos->>'alerta_fraude')::boolean = true
        AND (OLD.datos->>'alerta_fraude') IS DISTINCT FROM 'true'
    )
    EXECUTE FUNCTION notify_alerta_seguridad();

-- ============================================
-- TRIGGER 2: Eventos criticos en audit_logs (DELETE o cambios en configuracion)
-- ============================================
DROP TRIGGER IF EXISTS trg_alerta_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_alerta_audit_logs
    AFTER INSERT ON public.audit_logs
    FOR EACH ROW
    WHEN (
        NEW.accion = 'DELETE'
        OR (NEW.tabla_afectada = 'configuracion' AND NEW.accion IN ('UPDATE', 'INSERT'))
    )
    EXECUTE FUNCTION notify_alerta_seguridad();

-- ============================================
-- TRIGGER 3: Kill Switch activado (perfil desactivado)
-- ============================================
DROP TRIGGER IF EXISTS trg_alerta_kill_switch ON public.perfiles;
CREATE TRIGGER trg_alerta_kill_switch
    AFTER UPDATE ON public.perfiles
    FOR EACH ROW
    WHEN (OLD.activo = true AND NEW.activo = false)
    EXECUTE FUNCTION notify_alerta_seguridad();

-- ============================================
-- NOTA: URL y secreto hardcodeados en notify_alerta_seguridad()
-- para evitar error 42501 (Permission denied) de ALTER DATABASE SET app.*
-- Si se cambia la Edge Function URL, actualizar directamente en la funcion.
-- ============================================
