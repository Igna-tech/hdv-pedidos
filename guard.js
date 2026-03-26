// ============================================
// HDV Guard - Proteccion de rutas
// Requiere supabase-init.js y js/utils/storage.js cargados antes
// ============================================

(async function () {
    await HDVStorage.ready();

    const sb = supabaseClient;
    const path = window.location.pathname;
    const esAdmin = path.includes('admin');

    try {
        const { data: { session } } = await sb.auth.getSession();

        if (!session) {
            window.location.replace('/login.html');
            return;
        }

        const { data: perfilData, error } = await sb.rpc('obtener_rol_usuario', { user_id: session.user.id });

        if (error || !perfilData || perfilData.length === 0) {
            await sb.auth.signOut();
            window.location.replace('/login.html');
            return;
        }

        const perfil = perfilData[0];

        if (!perfil.activo) {
            // KILL SWITCH: Cuenta desactivada — borrar datos locales + logout
            console.warn('[Guard] KILL SWITCH: cuenta desactivada, purgando datos locales');
            try {
                const allKeys = await HDVStorage.keys('hdv_');
                for (const key of allKeys) {
                    if (key !== 'hdv_darkmode') await HDVStorage.removeItem(key);
                }
            } catch (e) { console.error('[Guard] Error en purga Kill Switch:', e); }
            await sb.auth.signOut();
            window.location.replace('/login.html?blocked=1');
            return;
        }

        const rol = perfil.rol;

        if (esAdmin && rol !== 'admin') {
            window.location.replace('/');
            return;
        }

        // MFA: Verificar que admins con TOTP tengan nivel AAL2
        if (rol === 'admin') {
            try {
                const { data: aalData } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
                if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
                    // Admin tiene MFA pero no verifico TOTP — volver a login
                    console.warn('[Guard] Admin requiere verificacion MFA (AAL2)');
                    window.location.replace('/login.html');
                    return;
                }
            } catch (mfaErr) {
                console.error('[Guard] Error verificando AAL:', mfaErr);
            }
        }

        window.hdvUsuario = {
            id: session.user.id,
            email: session.user.email,
            rol: rol,
            nombre: perfil.nombre_completo || session.user.email
        };

        await HDVStorage.setItem('hdv_user_rol', rol);
        await HDVStorage.setItem('hdv_user_email', session.user.email);
        await HDVStorage.setItem('hdv_user_nombre', perfil.nombre_completo || '');

        document.body.style.visibility = 'visible';

    } catch (err) {
        console.error('[Guard] Error verificando sesion:', err);
        window.location.replace('/login.html');
    }

    sb.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_OUT') {
            // Limpiar timers para evitar zombie requests con token expirado
            if (typeof limpiarTimers === 'function') limpiarTimers();
            // V2-A03: Limpiar TODOS los datos locales al cerrar sesion
            try {
                const allKeys = await HDVStorage.keys('hdv_');
                for (const key of allKeys) {
                    if (key !== 'hdv_darkmode') {
                        await HDVStorage.removeItem(key);
                    }
                }
                console.log('[Guard] Datos locales limpiados en logout');
            } catch (err) {
                console.error('[Guard] Error limpiando datos locales:', err);
            }
            window.location.replace('/login.html');
        }
    });
})();
