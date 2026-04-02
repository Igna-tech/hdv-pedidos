// ============================================
// HDV Login - Autenticacion con Supabase Auth + MFA TOTP
// Requiere supabase-init.js y js/utils/storage.js cargados antes
// ============================================

const sb = supabaseClient;

// --- Elementos del DOM ---
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const btnLogin = document.getElementById('btn-login');
const alertBox = document.getElementById('login-alert');
const loadingScreen = document.getElementById('loading-screen');
const loginContainer = document.getElementById('login-container');

// MFA: Verificacion TOTP
const mfaContainer = document.getElementById('mfa-container');
const mfaCodeInput = document.getElementById('mfa-code');
const btnMfaVerify = document.getElementById('btn-mfa-verify');
const btnMfaCancel = document.getElementById('btn-mfa-cancel');
const mfaAlert = document.getElementById('mfa-alert');

// MFA: Enrolamiento (primer setup)
const mfaEnrollContainer = document.getElementById('mfa-enroll-container');
const mfaQrImg = document.getElementById('mfa-qr-img');
const mfaSecretText = document.getElementById('mfa-secret-text');
const mfaEnrollCodeInput = document.getElementById('mfa-enroll-code');
const btnMfaEnrollVerify = document.getElementById('btn-mfa-enroll-verify');
const mfaEnrollAlert = document.getElementById('mfa-enroll-alert');

// Estado MFA temporal
let _mfaFactorId = null;
let _mfaEnrollFactorId = null;
let _pendingRol = null;
let _pendingUserId = null;

// Delay de navegacion post-login (ms) — valor local, login.html no carga constants.js
const LOGIN_NAV_DELAY = 500;

// --- Mostrar alerta (sl-alert Shoelace) ---
function showAlert(message, type = 'error', target = alertBox) {
    const variantMap = { error: 'danger', success: 'success', warning: 'warning' };
    const iconMap = { error: 'exclamation-octagon', success: 'check2-circle', warning: 'exclamation-triangle' };
    target.variant = variantMap[type] || 'danger';
    const icon = target.querySelector('sl-icon[slot="icon"]');
    if (icon) icon.name = iconMap[type] || 'exclamation-octagon';
    const msg = target.querySelector('span');
    if (msg) msg.textContent = message;
    target.style.display = '';
    target.open = true;
}

// --- Cambiar pantalla visible ---
function mostrarPantalla(pantalla) {
    loginContainer.style.display = 'none';
    mfaContainer.style.display = 'none';
    mfaEnrollContainer.style.display = 'none';
    loadingScreen.style.display = 'none';
    pantalla.style.display = 'block';
}

// --- Redirigir segun rol ---
function redirigirPorRol(rol) {
    if (rol === 'admin') {
        window.location.href = '/admin';
    } else {
        window.location.href = '/';
    }
}

// --- Obtener rol del usuario (RPC SECURITY DEFINER) ---
async function obtenerRol(userId) {
    const { data, error } = await sb.rpc('obtener_rol_usuario', { user_id: userId });
    if (error || !data || data.length === 0) return null;
    if (!data[0].activo) return null;
    return data[0].rol;
}

// ============================================
// MFA: Verificar nivel de assurance y factores
// ============================================

async function verificarMFA(userId, rol) {
    try {
        const { data: aalData, error: aalError } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();

        if (aalError) {
            console.error('[MFA] Error obteniendo AAL:', aalError);
            // Si falla la verificacion MFA, continuar sin MFA (no bloquear acceso)
            return { requiereMFA: false };
        }

        const { currentLevel, nextLevel, currentAuthenticationMethods } = aalData;

        // Si el usuario ya verifico MFA (AAL2), no pedir de nuevo
        if (currentLevel === 'aal2') {
            return { requiereMFA: false };
        }

        // Si el siguiente nivel requerido es AAL2, necesita verificar TOTP
        if (nextLevel === 'aal2') {
            // Tiene factores TOTP registrados — pedir codigo
            const totpFactor = currentAuthenticationMethods.length > 0
                ? null // buscar en factores
                : null;

            const { data: factorsData } = await sb.auth.mfa.listFactors();
            const totpFactors = (factorsData?.totp || []).filter(f => f.status === 'verified');

            if (totpFactors.length > 0) {
                return { requiereMFA: true, factorId: totpFactors[0].id, tipo: 'verify' };
            }
        }

        // Admin sin MFA configurado — forzar enrolamiento
        if (rol === 'admin') {
            const { data: factorsData } = await sb.auth.mfa.listFactors();
            const totpFactors = (factorsData?.totp || []).filter(f => f.status === 'verified');

            if (totpFactors.length === 0) {
                return { requiereMFA: true, tipo: 'enroll' };
            }
        }

        return { requiereMFA: false };
    } catch (err) {
        console.error('[MFA] Error verificando MFA:', err);
        return { requiereMFA: false };
    }
}

// --- MFA: Mostrar pantalla de enrolamiento con QR ---
async function iniciarEnrolamiento() {
    try {
        const { data, error } = await sb.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: 'HDV Admin TOTP'
        });

        if (error) {
            console.error('[MFA] Error enrolando:', error);
            showAlert('Error al generar codigo QR. Intenta de nuevo.', 'error', mfaEnrollAlert);
            return;
        }

        _mfaEnrollFactorId = data.id;
        mfaQrImg.src = data.totp.qr_code;
        mfaSecretText.textContent = data.totp.secret;

        mostrarPantalla(mfaEnrollContainer);
        mfaEnrollCodeInput.value = '';
        mfaEnrollCodeInput.focus();

    } catch (err) {
        console.error('[MFA] Error en enrolamiento:', err);
        showAlert(`Error al configurar MFA: ${err?.message || 'conexion fallida'}.`, 'error', mfaEnrollAlert);
    }
}

// --- MFA: Verificar codigo de enrolamiento (primer setup) ---
btnMfaEnrollVerify.addEventListener('click', async () => {
    const code = mfaEnrollCodeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
        showAlert('Ingresa un codigo valido de 6 digitos.', 'error', mfaEnrollAlert);
        return;
    }

    btnMfaEnrollVerify.loading = true;

    try {
        // Challenge + Verify para activar el factor
        const { data: challengeData, error: challengeError } = await sb.auth.mfa.challenge({
            factorId: _mfaEnrollFactorId
        });

        if (challengeError) {
            showAlert('Error al verificar. Intenta de nuevo.', 'error', mfaEnrollAlert);
            btnMfaEnrollVerify.loading = false;
            return;
        }

        const { data: verifyData, error: verifyError } = await sb.auth.mfa.verify({
            factorId: _mfaEnrollFactorId,
            challengeId: challengeData.id,
            code: code
        });

        if (verifyError) {
            showAlert('Codigo incorrecto. Verifica tu app de autenticacion.', 'error', mfaEnrollAlert);
            mfaEnrollCodeInput.value = '';
            mfaEnrollCodeInput.focus();
            btnMfaEnrollVerify.loading = false;
            return;
        }

        // MFA activado exitosamente — guardar datos y redirigir
        await HDVStorage.setItem('hdv_user_rol', _pendingRol);
        showAlert('MFA activado exitosamente! Redirigiendo...', 'success', mfaEnrollAlert);
        setTimeout(() => redirigirPorRol(_pendingRol), 1000);

    } catch (err) {
        console.error('[MFA] Error verificando enrolamiento:', err);
        const msg = err?.message?.includes('network')
            ? 'Sin conexion a internet. Verifica tu red.'
            : `Error inesperado: ${err?.message || 'desconocido'}. Intenta de nuevo.`;
        showAlert(msg, 'error', mfaEnrollAlert);
        btnMfaEnrollVerify.loading = false;
    }
});

// Enter en input de enrolamiento
mfaEnrollCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        btnMfaEnrollVerify.click();
    }
});

// --- MFA: Mostrar pantalla de verificacion TOTP ---
function mostrarVerificacionMFA(factorId) {
    _mfaFactorId = factorId;
    mostrarPantalla(mfaContainer);
    mfaCodeInput.value = '';
    mfaAlert.open = false;
    mfaCodeInput.focus();
}

// --- MFA: Verificar codigo TOTP ---
btnMfaVerify.addEventListener('click', async () => {
    const code = mfaCodeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
        showAlert('Ingresa un codigo valido de 6 digitos.', 'error', mfaAlert);
        return;
    }

    btnMfaVerify.loading = true;

    try {
        const { data: challengeData, error: challengeError } = await sb.auth.mfa.challenge({
            factorId: _mfaFactorId
        });

        if (challengeError) {
            showAlert('Error al verificar. Intenta de nuevo.', 'error', mfaAlert);
            btnMfaVerify.loading = false;
            return;
        }

        const { data: verifyData, error: verifyError } = await sb.auth.mfa.verify({
            factorId: _mfaFactorId,
            challengeId: challengeData.id,
            code: code
        });

        if (verifyError) {
            showAlert('Codigo incorrecto. Intenta de nuevo.', 'error', mfaAlert);
            mfaCodeInput.value = '';
            mfaCodeInput.focus();
            btnMfaVerify.loading = false;
            return;
        }

        // MFA verificado — redirigir
        await HDVStorage.setItem('hdv_user_rol', _pendingRol);
        showAlert('Verificado! Redirigiendo...', 'success', mfaAlert);
        setTimeout(() => redirigirPorRol(_pendingRol), LOGIN_NAV_DELAY);

    } catch (err) {
        console.error('[MFA] Error verificando TOTP:', err);
        const msg = err?.message?.includes('network')
            ? 'Sin conexion a internet. Verifica tu red.'
            : `Error inesperado: ${err?.message || 'desconocido'}. Intenta de nuevo.`;
        showAlert(msg, 'error', mfaAlert);
        btnMfaVerify.loading = false;
    }
});

// Enter en input MFA
mfaCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        btnMfaVerify.click();
    }
});

// Cancelar MFA → cerrar sesion y volver al login
btnMfaCancel.addEventListener('click', async () => {
    await sb.auth.signOut();
    _mfaFactorId = null;
    _pendingRol = null;
    _pendingUserId = null;
    mostrarPantalla(loginContainer);
    alertBox.open = false;
});

// ============================================
// VERIFICAR SESION EXISTENTE AL CARGAR
// ============================================

async function verificarSesionExistente() {
    try {
        const { data: { session } } = await sb.auth.getSession();

        if (session) {
            const rol = await obtenerRol(session.user.id);
            if (rol) {
                // Verificar si necesita MFA
                const mfa = await verificarMFA(session.user.id, rol);
                if (mfa.requiereMFA) {
                    _pendingRol = rol;
                    _pendingUserId = session.user.id;
                    loadingScreen.style.opacity = '0';
                    setTimeout(() => {
                        if (mfa.tipo === 'enroll') {
                            iniciarEnrolamiento();
                        } else {
                            mostrarVerificacionMFA(mfa.factorId);
                        }
                    }, 300);
                    return;
                }
                redirigirPorRol(rol);
                return;
            }
            await sb.auth.signOut();
        }
    } catch (e) {
        console.error('[Login] Error verificando sesion:', e);
    }

    // No hay sesion o error: mostrar formulario
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
        loadingScreen.style.display = 'none';
        loginContainer.style.display = 'block';
    }, 300);
}

// ============================================
// MANEJAR LOGIN (email + password → MFA si aplica)
// ============================================

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.open = false;

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!email || !password) {
        showAlert('Completa todos los campos.');
        return;
    }

    btnLogin.loading = true;

    try {
        // 1. Autenticar con Supabase Auth
        const { data, error } = await sb.auth.signInWithPassword({ email, password });

        if (error) {
            const mensajes = {
                'Invalid login credentials': 'Correo o contrasena incorrectos.',
                'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesion.',
                'Too many requests': 'Demasiados intentos. Espera un momento e intenta de nuevo.',
            };
            showAlert(mensajes[error.message] || 'Error al iniciar sesion. Intenta de nuevo.');
            btnLogin.loading = false;
            return;
        }

        // 2. Obtener rol del perfil
        const rol = await obtenerRol(data.user.id);

        if (!rol) {
            showAlert('Tu cuenta no tiene un perfil asignado. Contacta al administrador.');
            await sb.auth.signOut();
            btnLogin.loading = false;
            return;
        }

        // 3. Verificar MFA
        const mfa = await verificarMFA(data.user.id, rol);

        if (mfa.requiereMFA) {
            _pendingRol = rol;
            _pendingUserId = data.user.id;

            if (mfa.tipo === 'enroll') {
                // Admin sin MFA → forzar configuracion
                iniciarEnrolamiento();
            } else {
                // Tiene MFA → pedir codigo TOTP
                mostrarVerificacionMFA(mfa.factorId);
            }
            return;
        }

        // 4. Sin MFA requerido — login directo
        await HDVStorage.setItem('hdv_user_rol', rol);
        await HDVStorage.setItem('hdv_user_email', data.user.email);

        showAlert('Bienvenido! Redirigiendo...', 'success');
        setTimeout(() => redirigirPorRol(rol), LOGIN_NAV_DELAY);

    } catch (err) {
        console.error('[Login] Error:', err);
        const msg = err?.message?.includes('network') || err?.message?.includes('fetch')
            ? 'Sin conexion a internet. Verifica tu red.'
            : `Error inesperado: ${err?.message || 'desconocido'}. Intenta de nuevo.`;
        showAlert(msg);
        btnLogin.loading = false;
    }
});

// --- Escuchar cambios de sesion (otra pestana) ---
let _loginRedirecting = false;
sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session && !_loginRedirecting) {
        _loginRedirecting = true;
        const rol = await obtenerRol(session.user.id);
        if (rol) {
            const mfa = await verificarMFA(session.user.id, rol);
            if (!mfa.requiereMFA) {
                redirigirPorRol(rol);
                return;
            }
        }
        _loginRedirecting = false;
    }
});

// --- Alerta si cuenta fue bloqueada (Kill Switch) ---
if (new URLSearchParams(window.location.search).get('blocked') === '1') {
    showAlert('Dispositivo bloqueado por seguridad. Contacte al administrador.');
}

// --- Limpiar lockout legacy de localStorage ---
localStorage.removeItem('hdv_login_attempts');

// --- Iniciar ---
verificarSesionExistente();
