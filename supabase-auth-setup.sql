-- ============================================
-- HDV Distribuciones - Setup de Autenticacion
-- SEGURO: usa DROP IF EXISTS para evitar errores
-- si ya se ejecuto parcialmente
-- ============================================

-- 1. CREAR TABLA DE PERFILES
CREATE TABLE IF NOT EXISTS public.perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL DEFAULT '',
    rol TEXT NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('admin', 'vendedor')),
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. HABILITAR RLS
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

-- 3. BORRAR POLITICAS ANTERIORES (evita error "already exists")
DROP POLICY IF EXISTS "Usuarios pueden ver su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Admins pueden ver todos los perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Admins pueden crear perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Admins pueden actualizar perfiles" ON public.perfiles;

-- 4. CREAR POLITICAS DE SEGURIDAD
CREATE POLICY "Usuarios pueden ver su propio perfil"
    ON public.perfiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Admins pueden ver todos los perfiles"
    ON public.perfiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.perfiles
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

CREATE POLICY "Admins pueden crear perfiles"
    ON public.perfiles FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.perfiles
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

CREATE POLICY "Admins pueden actualizar perfiles"
    ON public.perfiles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.perfiles
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

-- 5. TRIGGER: Crear perfil automatico para usuarios NUEVOS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.perfiles (id, nombre_completo, rol)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'nombre_completo', ''),
        COALESCE(NEW.raw_user_meta_data ->> 'rol', 'vendedor')
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 6. TRIGGER: Actualizar timestamp automaticamente
CREATE OR REPLACE FUNCTION public.update_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.actualizado_en = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_actualizado_en ON public.perfiles;
CREATE TRIGGER set_actualizado_en
    BEFORE UPDATE ON public.perfiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_actualizado_en();

-- 7. INSERTAR PERFILES PARA USUARIOS QUE YA EXISTEN
-- (el trigger solo funciona para usuarios NUEVOS)
INSERT INTO public.perfiles (id, nombre_completo, rol)
SELECT id, COALESCE(raw_user_meta_data ->> 'nombre_completo', ''), 'vendedor'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.perfiles)
ON CONFLICT (id) DO NOTHING;

-- 8. REALTIME (ignorar si ya existe)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.perfiles;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;
