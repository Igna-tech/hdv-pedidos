-- ============================================================
-- Migración: Numeración secuencial de pedidos
-- Fecha: 2026-06-23
-- Descripción: Agrega columna numero_pedido con secuencia
--   automática asignada por trigger en cada INSERT.
--   Permite mostrar números legibles tipo timbrado (001-001-0000001).
-- ============================================================

-- 1. Secuencia global para pedidos
CREATE SEQUENCE IF NOT EXISTS hdv_pedidos_numero_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- 2. Columna en tabla pedidos (nullable para backward compat)
ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS numero_pedido BIGINT;

-- 3. Función trigger para asignar número al insertar
CREATE OR REPLACE FUNCTION fn_asignar_numero_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.numero_pedido IS NULL THEN
        NEW.numero_pedido := nextval('hdv_pedidos_numero_seq');
    END IF;
    RETURN NEW;
END;
$$;

-- 4. Trigger BEFORE INSERT
DROP TRIGGER IF EXISTS trg_asignar_numero_pedido ON pedidos;
CREATE TRIGGER trg_asignar_numero_pedido
    BEFORE INSERT ON pedidos
    FOR EACH ROW
    EXECUTE FUNCTION fn_asignar_numero_pedido();

-- 5. Índice para búsquedas por número
CREATE INDEX IF NOT EXISTS idx_pedidos_numero_pedido ON pedidos (numero_pedido);

-- 6. Comentario de documentación
COMMENT ON COLUMN pedidos.numero_pedido IS
    'Número secuencial asignado automáticamente al insertar. '
    'Formato display: {establecimiento}-{punto_expedicion}-{7 dígitos}. '
    'NULL en pedidos migrados antes de esta columna.';
