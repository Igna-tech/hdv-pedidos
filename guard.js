// ============================================
// HDV Guard - Proteccion de rutas
// Incluir ANTES de supabase-config.js en
// index.html y admin.html
// ============================================

(async function () {
    const SUPABASE_URL = 'https://ngtoshttgnfgbiurnrix.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ndG9zaHR0Z25mZ2JpdXJucml4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODAwNjMsImV4cCI6MjA4ODc1NjA2M30.x_s34j_YOsMgxAhFPOUvGTIRaJoRRvOUfDqQGHNZdcM';

    const { createClient } = supabase;
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Determinar en que pagina estamos
    const path = window.location.pathname;
    const esAdmin = path.includes('admin');

    try {
        // 1. Verificar si hay sesion activa
        const { data: { session } } = await sb.auth.getSession();

        if (!session) {
            // Sin sesion -> login
            window.location.replace('/login.html');
            return;
        }

        // 2. Obtener rol del perfil
        const { data: perfil, error } = await sb
            .from('perfiles')
            .select('rol, nombre_completo')
            .eq('id', session.user.id)
            .single();

        if (error || !perfil) {
            // Sin perfil -> cerrar sesion y mandar a login
            await sb.auth.signOut();
            window.location.replace('/login.html');
            return;
        }

        const rol = perfil.rol;

        // 3. Verificar permisos de ruta
        if (esAdmin && rol !== 'admin') {
            // Vendedor intentando entrar a admin -> redirigir a vendedor
            window.location.replace('/');
            return;
        }

        // 4. Exponer datos del usuario para uso en la app
        window.hdvUsuario = {
            id: session.user.id,
            email: session.user.email,
            rol: rol,
            nombre: perfil.nombre_completo || session.user.email
        };

        // Guardar en localStorage para acceso rapido
        localStorage.setItem('hdv_user_rol', rol);
        localStorage.setItem('hdv_user_email', session.user.email);
        localStorage.setItem('hdv_user_nombre', perfil.nombre_completo || '');

        // 5. Mostrar el contenido (quitar pantalla de carga si existe)
        document.body.style.visibility = 'visible';

    } catch (err) {
        console.error('[Guard] Error verificando sesion:', err);
        window.location.replace('/login.html');
    }

    // 6. Escuchar cambios de sesion (logout desde otra pestana, sesion expirada)
    sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            localStorage.removeItem('hdv_user_rol');
            localStorage.removeItem('hdv_user_email');
            localStorage.removeItem('hdv_user_nombre');
            window.location.replace('/login.html');
        }
    });
})();
