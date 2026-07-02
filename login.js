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

// --- Cambiar pantalla visible (con crossfade suave) ---
function mostrarPantalla(pantalla) {
    [loginContainer, mfaContainer, mfaEnrollContainer].forEach(s => {
        if (s && s !== pantalla) s.style.display = 'none';
    });
    loadingScreen.style.display = 'none';
    pantalla.style.display = 'block';
    // Reinicia la animación de entrada (crossfade)
    pantalla.classList.remove('screen-in');
    void pantalla.offsetWidth;
    pantalla.classList.add('screen-in');
}

// --- Redirigir segun rol (con saludo animado estilo Apple) ---
let _yaRedirigiendo = false;
function redirigirPorRol(rol) {
    if (_yaRedirigiendo) return;
    _yaRedirigiendo = true;

    const destino = rol === 'admin' ? '/admin' : '/';
    const navegar = () => window.location.replace(destino);

    const overlay = document.getElementById('greeting-overlay');
    if (!overlay) { navegar(); return; }

    // Nombre del usuario (primer nombre, capitalizado)
    const nombreEl = document.getElementById('greetName');
    if (nombreEl) {
        const primer = (_userNombre || '').trim().split(/\s+/)[0] || '';
        nombreEl.textContent = primer
            ? primer.charAt(0).toUpperCase() + primer.slice(1).toLowerCase()
            : '';
        nombreEl.style.display = primer ? '' : 'none';
    }

    // Subtitulo segun rol
    const sub = document.getElementById('greetSub');
    if (sub) sub.textContent = rol === 'admin' ? 'Panel de gestión' : 'Sistema de ventas';

    // Ocultar el resto de la interfaz para que el saludo sea protagonista
    const consola = document.querySelector('.console');
    if (consola) consola.style.display = 'none';
    if (typeof loadingScreen !== 'undefined' && loadingScreen) loadingScreen.style.display = 'none';

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    overlay.classList.add('is-active');

    // Duracion total ~5s: aparicion + permanencia + desvanecimiento progresivo
    const hold = reduce ? 700 : 4000;
    const fade = reduce ? 250 : 1000;
    setTimeout(() => {
        overlay.classList.add('is-leaving');
        setTimeout(navegar, fade);
    }, hold);
}

// --- Obtener rol del usuario (RPC SECURITY DEFINER) ---
let _userNombre = '';
async function obtenerRol(userId) {
    const { data, error } = await sb.rpc('obtener_rol_usuario', { user_id: userId });
    if (error || !data || data.length === 0) return null;
    if (!data[0].activo) return null;
    _userNombre = data[0].nombre_completo || '';
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
        redirigirPorRol(_pendingRol);

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
        redirigirPorRol(_pendingRol);

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
        // getSession() puede colgarse (lock de auth / refresh de token stale).
        // Carrera con timeout para que el splash NUNCA quede colgado.
        const sessionRes = await Promise.race([
            sb.auth.getSession(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('getSession timeout')), 3000))
        ]);
        const session = sessionRes?.data?.session || null;

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

        redirigirPorRol(rol);

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

// ============================================
// BRANDING + UX DEL LOGIN (logo, saludo, offline, entorno, soporte, recordar)
// ============================================

// --- Logo de empresa: cache local → bucket público, con fallback a monograma ---
async function _cargarLogoLogin() {
    const setLogo = (url) => {
        [['brandLogo', 'brandLogoMono'], ['cardLogo', 'cardLogoMono'], ['splashLogo', 'splashLogoMono']].forEach(([imgId, monoId]) => {
            const img = document.getElementById(imgId);
            const mono = document.getElementById(monoId);
            if (img) {
                img.onload = () => { img.style.display = 'block'; if (mono) mono.style.display = 'none'; };
                img.onerror = () => { img.style.display = 'none'; if (mono) mono.style.display = ''; };
                img.src = url;
            }
        });
    };
    // 1. Cache local (instantáneo, sirve offline)
    try { const cached = await HDVStorage.getItem('hdv_logo_empresa_url'); if (cached) setLogo(cached); } catch (e) {}
    // 2. Bucket público empresa_assets: tomar el logo más reciente
    try {
        const { data, error } = await sb.storage.from('empresa_assets').list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
        if (!error && Array.isArray(data) && data.length) {
            const logo = data.find(f => /^logo_.*\.(webp|png|jpe?g)$/i.test(f.name)) || data.find(f => f.name && !f.name.startsWith('.'));
            if (logo) {
                const { data: pub } = sb.storage.from('empresa_assets').getPublicUrl(logo.name);
                if (pub?.publicUrl) { setLogo(pub.publicUrl); try { await HDVStorage.setItem('hdv_logo_empresa_url', pub.publicUrl); } catch (e) {} }
            }
        }
    } catch (e) { /* se mantiene el monograma */ }
}

// --- Saludo contextual por horario ---
function _saludoPorHora() {
    const h = new Date().getHours();
    const txt = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const el = document.querySelector('#login-container .card-title');
    if (el) el.textContent = txt;
}

// --- Detección offline ---
function _actualizarOffline() {
    const banner = document.getElementById('offline-banner');
    const online = navigator.onLine;
    if (banner) banner.style.display = online ? 'none' : 'block';
    if (btnLogin) btnLogin.disabled = !online;
}

// --- Indicador de entorno (discreto: prod sin badge) ---
function _indicadorEntorno() {
    const el = document.getElementById('env-badge');
    if (!el) return;
    const host = location.hostname;
    let label = '', bg = '';
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')) { label = 'Local'; bg = '#0ea5e9'; }
    else if (/-(git-|[a-z0-9]{9}-)/.test(host) || host.includes('-preview')) { label = 'Pruebas'; bg = '#f59e0b'; }
    if (label) {
        el.textContent = label;
        el.style.background = bg;
        el.style.color = '#fff';
        el.style.display = 'block';
    }
}

// --- Links de soporte (WhatsApp) ---
function _initSoporte() {
    const msg = encodeURIComponent('Hola, tengo problemas para ingresar al sistema HDV Distribuciones.');
    const url = `https://wa.me/?text=${msg}`;
    const a = document.getElementById('support-link');
    const b = document.getElementById('blocked-support');
    if (a) a.href = url;
    if (b) b.href = url;
}

// --- Recordar este dispositivo (correo + estado del check, persistente) ---
function _initRecordar() {
    const chk = document.getElementById('remember-device');
    const KEY_FLAG = 'hdv_remember_device';
    const KEY_EMAIL = 'hdv_remember_email';

    const aplicarRecordado = () => {
        try {
            const recordado = localStorage.getItem(KEY_FLAG) === '1';
            const email = localStorage.getItem(KEY_EMAIL) || '';
            if (chk) chk.checked = recordado;
            if (recordado && email && emailInput) {
                emailInput.value = email;
                if (passwordInput) setTimeout(() => passwordInput.focus(), 60);
            }
        } catch (e) {}
    };

    // sl-input puede no estar "upgradeado" cuando corre esto (Shoelace carga async):
    // esperar a su definición para que el valor prefijado no se pierda.
    if (window.customElements && customElements.whenDefined) {
        customElements.whenDefined('sl-input').then(aplicarRecordado).catch(() => {});
    }
    aplicarRecordado();

    // Guardar/limpiar al enviar según el estado del check.
    loginForm.addEventListener('submit', () => {
        try {
            if (chk?.checked) {
                localStorage.setItem(KEY_FLAG, '1');
                localStorage.setItem(KEY_EMAIL, (emailInput.value || '').trim().toLowerCase());
            } else {
                localStorage.removeItem(KEY_FLAG);
                localStorage.removeItem(KEY_EMAIL);
            }
        } catch (e) {}
    });
}

// --- Feedback visual tras varios intentos (el rate-limit real es server-side) ---
function _initFeedbackIntentos() {
    const VENTANA_MS = 120000, LIMITE = 5, ENFRIAR_MS = 30000;
    loginForm.addEventListener('submit', () => {
        let reg;
        try { reg = JSON.parse(sessionStorage.getItem('hdv_login_try') || '{"n":0,"t":0}'); } catch (e) { reg = { n: 0, t: 0 }; }
        const now = Date.now();
        if (now - reg.t > VENTANA_MS) reg = { n: 0, t: now };
        reg.n++; reg.t = now;
        try { sessionStorage.setItem('hdv_login_try', JSON.stringify(reg)); } catch (e) {}
        if (reg.n >= LIMITE) {
            showAlert(`Varios intentos seguidos. Esperá unos segundos antes de reintentar.`, 'warning');
            if (btnLogin) {
                btnLogin.disabled = true;
                setTimeout(() => { if (navigator.onLine) btnLogin.disabled = false; }, ENFRIAR_MS);
            }
        }
    });
}

// --- Pip de estado REAL (salud de Supabase) ---
function _setPip(estado, label) {
    const pip = document.getElementById('statusPip');
    const lbl = document.getElementById('statusLabel');
    if (pip) pip.className = 'pip ' + estado;
    if (lbl) lbl.textContent = label;
}
async function _checkSupabaseHealth() {
    if (!navigator.onLine) { _setPip('is-down', 'Sin conexión'); return; }
    _setPip('is-checking', 'Verificando…');
    try {
        if (typeof SUPABASE_URL === 'undefined') { _setPip('is-online', 'Operativo'); return; }
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
            signal: ctrl.signal,
            headers: (typeof SUPABASE_ANON_KEY !== 'undefined') ? { apikey: SUPABASE_ANON_KEY } : {}
        });
        clearTimeout(t);
        _setPip(r.ok ? 'is-online' : 'is-down', r.ok ? 'Operativo' : 'Sin servidor');
    } catch (e) {
        _setPip('is-down', 'Sin servidor');
    }
}
function _initPipEstado() {
    _checkSupabaseHealth();
    window.addEventListener('online', _checkSupabaseHealth);
    window.addEventListener('offline', () => _setPip('is-down', 'Sin conexión'));
    setInterval(_checkSupabaseHealth, 30000); // re-chequeo cada 30s
}

// --- Aviso de Bloq Mayús en el campo de contraseña ---
function _initCapsLock() {
    const hint = document.getElementById('capsHint');
    if (!hint || !passwordInput) return;
    const check = (e) => {
        if (!e.getModifierState) return;
        hint.style.display = e.getModifierState('CapsLock') ? 'flex' : 'none';
    };
    passwordInput.addEventListener('keydown', check);
    passwordInput.addEventListener('keyup', check);
    passwordInput.addEventListener('sl-blur', () => { hint.style.display = 'none'; });
}

// --- Auto-submit del código MFA al completar 6 dígitos ---
function _initMfaAutosubmit() {
    const wire = (input, btn) => {
        if (!input || !btn) return;
        input.addEventListener('sl-input', () => {
            if (/^\d{6}$/.test((input.value || '').trim()) && !btn.loading) btn.click();
        });
    };
    wire(mfaCodeInput, btnMfaVerify);
    wire(document.getElementById('mfa-enroll-code'), document.getElementById('btn-mfa-enroll-verify'));
}

function _initLoginBranding() {
    _cargarLogoLogin();
    _saludoPorHora();
    _actualizarOffline();
    window.addEventListener('online', _actualizarOffline);
    window.addEventListener('offline', _actualizarOffline);
    _indicadorEntorno();
    _initSoporte();
    _initRecordar();
    _initFeedbackIntentos();
    _initPipEstado();
    _initCapsLock();
    _initMfaAutosubmit();
}

// --- Limpiar lockout legacy de localStorage ---
localStorage.removeItem('hdv_login_attempts');

// --- Iniciar ---
_initLoginBranding();

if (new URLSearchParams(window.location.search).get('blocked') === '1') {
    // Cuenta desactivada (Kill Switch) → pantalla dedicada estilizada
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
        loadingScreen.style.display = 'none';
        const bc = document.getElementById('blocked-container');
        if (bc) bc.style.display = 'block';
    }, 300);
} else {
    verificarSesionExistente();
}

// Red de seguridad: si tras 6s el splash sigue visible (algún await colgado),
// ocultarlo igual y mostrar el formulario de login para no dejar la pantalla muerta.
setTimeout(() => {
    if (!loadingScreen || getComputedStyle(loadingScreen).display === 'none') return;
    loadingScreen.style.display = 'none';
    const pantallas = [loginContainer, mfaContainer, mfaEnrollContainer, document.getElementById('blocked-container')];
    const algunaVisible = pantallas.some(el => el && getComputedStyle(el).display !== 'none');
    if (!algunaVisible && loginContainer) loginContainer.style.display = 'block';
}, 6000);
