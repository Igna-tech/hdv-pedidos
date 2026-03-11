// ============================================
// HDV Guard - Proteccion de rutas
// Requiere supabase-init.js cargado antes
// ============================================

(async function () {
    // Usa el supabaseClient global de supabase-init.js
    const sb = supabaseClient;

    const path = window.location.pathname;
    const esAdmin = path.includes('admin');

    try {
        const { data: { session } } = await sb.auth.getSession();

        if (!session) {
            window.location.replace('/login.html');
            return;
        }

        const { data: perfil, error } = await sb
            .from('perfiles')
            .select('rol, nombre_completo')
            .eq('id', session.user.id)
            .single();

        if (error || !perfil) {
            await sb.auth.signOut();
            window.location.replace('/login.html');
            return;
        }

        const rol = perfil.rol;

        if (esAdmin && rol !== 'admin') {
            window.location.replace('/');
            return;
        }

        window.hdvUsuario = {
            id: session.user.id,
            email: session.user.email,
            rol: rol,
            nombre: perfil.nombre_completo || session.user.email
        };

        localStorage.setItem('hdv_user_rol', rol);
        localStorage.setItem('hdv_user_email', session.user.email);
        localStorage.setItem('hdv_user_nombre', perfil.nombre_completo || '');

        document.body.style.visibility = 'visible';

    } catch (err) {
        console.error('[Guard] Error verificando sesion:', err);
        window.location.replace('/login.html');
    }

    sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            localStorage.removeItem('hdv_user_rol');
            localStorage.removeItem('hdv_user_email');
            localStorage.removeItem('hdv_user_nombre');
            window.location.replace('/login.html');
        }
    });
})();
