-- ============================================
-- HDV Distribuciones - Setup de Autenticacion
-- Ejecutar en el SQL Editor de Supabase
-- ============================================

-- 1. CREAR TABLA DE PERFILES
-- Se conecta con auth.users via el campo id (UUID)
CREATE TABLE IF NOT EXISTS public.perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL DEFAULT '',
    rol TEXT NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('admin', 'vendedor')),
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. HABILITAR RLS (Row Level Security)
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

-- 3. POLITICAS DE SEGURIDAD

-- 3a. Cada usuario autenticado puede leer SU PROPIO perfil
CREATE POLICY "Usuarios pueden ver su propio perfil"
    ON public.perfiles
    FOR SELECT
    USING (auth.uid() = id);

-- 3b. Solo admins pueden ver TODOS los perfiles
CREATE POLICY "Admins pueden ver todos los perfiles"
    ON public.perfiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.perfiles
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

-- 3c. Solo admins pueden insertar perfiles
CREATE POLICY "Admins pueden crear perfiles"
    ON public.perfiles
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.perfiles
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

-- 3d. Solo admins pueden actualizar perfiles
CREATE POLICY "Admins pueden actualizar perfiles"
    ON public.perfiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.perfiles
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

-- 4. FUNCION TRIGGER: Crear perfil automaticamente al registrar usuario
-- Esto crea un perfil con rol 'vendedor' por defecto cuando se registra
-- un nuevo usuario en auth.users
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

-- 5. TRIGGER: Conectar la funcion con auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 6. FUNCION para actualizar timestamp automaticamente
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

-- ============================================
-- 7. CREAR USUARIOS INICIALES
-- Ejecutar DESPUES de crear los usuarios desde
-- el Dashboard de Supabase (Authentication > Users > Add user)
-- ============================================

-- IMPORTANTE: Primero crea los usuarios manualmente en:
-- Supabase Dashboard > Authentication > Users > Add user
-- Luego copia el UUID de cada usuario y ejecuta esto:

-- Ejemplo para el admin (reemplaza el UUID):
-- UPDATE public.perfiles
-- SET rol = 'admin', nombre_completo = 'Nombre del Admin'
-- WHERE id = 'UUID-DEL-USUARIO-ADMIN-AQUI';

-- Ejemplo para un vendedor (reemplaza el UUID):
-- UPDATE public.perfiles
-- SET nombre_completo = 'Nombre del Vendedor'
-- WHERE id = 'UUID-DEL-VENDEDOR-AQUI';

-- ============================================
-- 8. HABILITAR REALTIME PARA PERFILES (opcional)
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.perfiles;
