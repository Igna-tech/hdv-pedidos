-- ============================================
-- Migracion: orden persistido del catalogo
-- Fecha: 2026-07-01
-- Aplicacion MANUAL desde el SQL Editor de Supabase.
--
-- Habilita reordenar categorias y productos con drag & drop desde el panel admin,
-- reflejando ese orden en la app del vendedor (las queries ordenan por 'orden').
-- Las SUBCATEGORIAS no necesitan columna: su orden es el del array
-- categorias.subcategorias TEXT[].
-- ============================================

-- 1) Columnas de orden (idempotente)
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS orden INT DEFAULT 0;
ALTER TABLE productos  ADD COLUMN IF NOT EXISTS orden INT DEFAULT 0;

-- 2) Backfill inicial: asignar orden por nombre para no arrancar todo en 0.
--    row_number() da 0,1,2,... alfabeticamente; corridas posteriores del admin
--    sobreescriben con el orden manual del usuario.
WITH ranked AS (
    SELECT id, (ROW_NUMBER() OVER (ORDER BY nombre) - 1) AS rn
    FROM categorias
)
UPDATE categorias c
SET orden = ranked.rn
FROM ranked
WHERE c.id = ranked.id AND (c.orden IS NULL OR c.orden = 0);

WITH ranked AS (
    SELECT id, (ROW_NUMBER() OVER (PARTITION BY categoria_id ORDER BY nombre) - 1) AS rn
    FROM productos
)
UPDATE productos p
SET orden = ranked.rn
FROM ranked
WHERE p.id = ranked.id AND (p.orden IS NULL OR p.orden = 0);

-- 3) Indices para ordenar rapido
CREATE INDEX IF NOT EXISTS idx_categorias_orden ON categorias (orden);
CREATE INDEX IF NOT EXISTS idx_productos_orden  ON productos (categoria_id, orden);
