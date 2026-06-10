-- ============================================
-- Push Notifications: tabla, RLS, trigger
-- ============================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Vendedor solo gestiona sus propias suscripciones
CREATE POLICY "push_sub_own" ON push_subscriptions
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Admin puede ver todas (para diagnóstico)
CREATE POLICY "push_sub_admin_select" ON push_subscriptions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol = 'admin' AND activo = true
    ));

-- Función trigger: llama a Edge Function push-notifications al cambiar estado de pedido
CREATE OR REPLACE FUNCTION notify_push_pedido_estado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    push_url TEXT;
    webhook_secret TEXT;
BEGIN
    IF OLD.estado IS NOT DISTINCT FROM NEW.estado THEN
        RETURN NEW;
    END IF;
    IF NEW.vendedor_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT value INTO push_url FROM app_secrets WHERE key = 'push_notifications_url';
    SELECT value INTO webhook_secret FROM app_secrets WHERE key = 'push_webhook_secret';

    IF push_url IS NULL OR webhook_secret IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url := push_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || webhook_secret
        ),
        body := jsonb_build_object(
            'pedido_id', NEW.id,
            'vendedor_id', NEW.vendedor_id::TEXT,
            'nuevo_estado', NEW.estado,
            'datos', COALESCE(NEW.datos, '{}'::jsonb)
        )::TEXT
    );

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION notify_push_pedido_estado() FROM PUBLIC;
REVOKE ALL ON FUNCTION notify_push_pedido_estado() FROM anon;

DROP TRIGGER IF EXISTS trg_push_estado_pedido ON pedidos;
CREATE TRIGGER trg_push_estado_pedido
    AFTER UPDATE OF estado ON pedidos
    FOR EACH ROW
    EXECUTE FUNCTION notify_push_pedido_estado();

-- URL de la Edge Function en app_secrets
INSERT INTO app_secrets (key, value, description) VALUES
    ('push_notifications_url', 'https://ngtoshttgnfgbiurnrix.supabase.co/functions/v1/push-notifications',
     'URL de la Edge Function de push notifications')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
