-- B-04: Rate limit persistente para alertas-seguridad Edge Function
-- Drop tabla legacy catalogo (reemplazada por tablas relacionales)

-- 1. Eliminar tabla legacy
DROP TABLE IF EXISTS catalogo;

-- 2. Tabla de rate limiting persistente para alertas WhatsApp
CREATE TABLE IF NOT EXISTS alertas_rate_limit (
    clave          TEXT        PRIMARY KEY,
    contador       INTEGER     NOT NULL DEFAULT 0,
    ventana_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE alertas_rate_limit ENABLE ROW LEVEL SECURITY;

-- Solo admin puede ver (monitoreo) — Edge Function usa service role (bypass RLS)
CREATE POLICY "admin_select_rate_limit" ON alertas_rate_limit
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'admin' AND activo = true
        )
    );

-- 3. RPC atomica con FOR UPDATE para incrementar sin race conditions
CREATE OR REPLACE FUNCTION verificar_rate_limit_alerta(
    p_clave            TEXT,
    p_max              INT  DEFAULT 5,
    p_ventana_segundos INT  DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_contador       INT;
    v_ventana_inicio TIMESTAMPTZ;
BEGIN
    SELECT contador, ventana_inicio
    INTO   v_contador, v_ventana_inicio
    FROM   alertas_rate_limit
    WHERE  clave = p_clave
    FOR    UPDATE;

    -- Primera vez: insertar y permitir
    IF NOT FOUND THEN
        INSERT INTO alertas_rate_limit (clave, contador, ventana_inicio)
        VALUES (p_clave, 1, NOW());
        RETURN TRUE;
    END IF;

    -- Ventana expirada: resetear y permitir
    IF NOW() - v_ventana_inicio > make_interval(secs => p_ventana_segundos) THEN
        UPDATE alertas_rate_limit
        SET    contador = 1, ventana_inicio = NOW()
        WHERE  clave = p_clave;
        RETURN TRUE;
    END IF;

    -- Dentro de la ventana y bajo el limite: incrementar y permitir
    IF v_contador < p_max THEN
        UPDATE alertas_rate_limit
        SET    contador = contador + 1
        WHERE  clave = p_clave;
        RETURN TRUE;
    END IF;

    -- Limite superado: rechazar
    RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION verificar_rate_limit_alerta(TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION verificar_rate_limit_alerta(TEXT, INT, INT) FROM anon;
GRANT  EXECUTE ON FUNCTION verificar_rate_limit_alerta(TEXT, INT, INT) TO authenticated;
