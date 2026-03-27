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
const togglePassword = document.getElementById('toggle-password');

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

// --- Toggle mostrar/ocultar contrasena ---
togglePassword.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePassword.querySelector('svg').innerHTML = isPassword
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18"/>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>';
});

// --- Mostrar alerta (en cualquier contenedor) ---
function showAlert(message, type = 'error', target = alertBox) {
    target.className = 'mb-4 p-3 rounded-xl text-sm font-medium alert';
    if (type === 'error') {
        target.classList.add('bg-red-500/20', 'text-red-300', 'border', 'border-red-500/30');
    } else if (type === 'success') {
        target.classList.add('bg-green-500/20', 'text-green-300', 'border', 'border-green-500/30');
    } else if (type === 'warning') {
        target.classList.add('bg-amber-500/20', 'text-amber-300', 'border', 'border-amber-500/30');
    }
    target.textContent = message;
    target.classList.remove('hidden');
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
        showAlert('Error de conexion al configurar MFA.', 'error', mfaEnrollAlert);
    }
}

// --- MFA: Verificar codigo de enrolamiento (primer setup) ---
btnMfaEnrollVerify.addEventListener('click', async () => {
    const code = mfaEnrollCodeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
        showAlert('Ingresa un codigo valido de 6 digitos.', 'error', mfaEnrollAlert);
        return;
    }

    btnMfaEnrollVerify.disabled = true;
    btnMfaEnrollVerify.textContent = 'Verificando...';

    try {
        // Challenge + Verify para activar el factor
        const { data: challengeData, error: challengeError } = await sb.auth.mfa.challenge({
            factorId: _mfaEnrollFactorId
        });

        if (challengeError) {
            showAlert('Error al verificar. Intenta de nuevo.', 'error', mfaEnrollAlert);
            btnMfaEnrollVerify.disabled = false;
            btnMfaEnrollVerify.textContent = 'Activar MFA';
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
            btnMfaEnrollVerify.disabled = false;
            btnMfaEnrollVerify.textContent = 'Activar MFA';
            return;
        }

        // MFA activado exitosamente — guardar datos y redirigir
        await HDVStorage.setItem('hdv_user_rol', _pendingRol);
        showAlert('MFA activado exitosamente! Redirigiendo...', 'success', mfaEnrollAlert);
        setTimeout(() => redirigirPorRol(_pendingRol), 1000);

    } catch (err) {
        console.error('[MFA] Error verificando enrolamiento:', err);
        showAlert('Error de conexion. Intenta de nuevo.', 'error', mfaEnrollAlert);
        btnMfaEnrollVerify.disabled = false;
        btnMfaEnrollVerify.textContent = 'Activar MFA';
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
    mfaAlert.classList.add('hidden');
    mfaCodeInput.focus();
}

// --- MFA: Verificar codigo TOTP ---
btnMfaVerify.addEventListener('click', async () => {
    const code = mfaCodeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
        showAlert('Ingresa un codigo valido de 6 digitos.', 'error', mfaAlert);
        return;
    }

    btnMfaVerify.disabled = true;
    btnMfaVerify.textContent = 'Verificando...';

    try {
        const { data: challengeData, error: challengeError } = await sb.auth.mfa.challenge({
            factorId: _mfaFactorId
        });

        if (challengeError) {
            showAlert('Error al verificar. Intenta de nuevo.', 'error', mfaAlert);
            btnMfaVerify.disabled = false;
            btnMfaVerify.textContent = 'Verificar';
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
            btnMfaVerify.disabled = false;
            btnMfaVerify.textContent = 'Verificar';
            return;
        }

        // MFA verificado — redirigir
        await HDVStorage.setItem('hdv_user_rol', _pendingRol);
        showAlert('Verificado! Redirigiendo...', 'success', mfaAlert);
        setTimeout(() => redirigirPorRol(_pendingRol), TIEMPOS.NAV_DELAY_MS);

    } catch (err) {
        console.error('[MFA] Error verificando TOTP:', err);
        showAlert('Error de conexion. Intenta de nuevo.', 'error', mfaAlert);
        btnMfaVerify.disabled = false;
        btnMfaVerify.textContent = 'Verificar';
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
    alertBox.classList.add('hidden');
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
    alertBox.classList.add('hidden');

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!email || !password) {
        showAlert('Completa todos los campos.');
        return;
    }

    btnLogin.disabled = true;
    btnLogin.innerHTML = '<span class="flex items-center justify-center gap-2"><svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Ingresando...</span>';

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
            btnLogin.disabled = false;
            btnLogin.textContent = 'Iniciar Sesion';
            return;
        }

        // 2. Obtener rol del perfil
        const rol = await obtenerRol(data.user.id);

        if (!rol) {
            showAlert('Tu cuenta no tiene un perfil asignado. Contacta al administrador.');
            await sb.auth.signOut();
            btnLogin.disabled = false;
            btnLogin.textContent = 'Iniciar Sesion';
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
        setTimeout(() => redirigirPorRol(rol), TIEMPOS.NAV_DELAY_MS);

    } catch (err) {
        console.error('[Login] Error:', err);
        showAlert('Error de conexion. Verifica tu internet.');
        btnLogin.disabled = false;
        btnLogin.textContent = 'Iniciar Sesion';
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
