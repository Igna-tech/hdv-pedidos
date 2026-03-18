// ============================================
// HDV Login - Autenticacion con Supabase Auth
// Requiere supabase-init.js cargado antes
// ============================================

// Usa el supabaseClient global de supabase-init.js
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

// --- Toggle mostrar/ocultar contrasena ---
togglePassword.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePassword.querySelector('svg').innerHTML = isPassword
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18"/>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>';
});

// --- Mostrar alerta ---
function showAlert(message, type = 'error') {
    alertBox.className = 'mb-4 p-3 rounded-xl text-sm font-medium alert';
    if (type === 'error') {
        alertBox.classList.add('bg-red-500/20', 'text-red-300', 'border', 'border-red-500/30');
    } else {
        alertBox.classList.add('bg-green-500/20', 'text-green-300', 'border', 'border-green-500/30');
    }
    alertBox.textContent = message;
    alertBox.classList.remove('hidden');
}

// --- Redirigir segun rol ---
function redirigirPorRol(rol) {
    if (rol === 'admin') {
        window.location.href = '/admin';
    } else {
        window.location.href = '/';
    }
}

// --- Obtener rol del usuario (usa RPC SECURITY DEFINER para evitar problemas RLS) ---
async function obtenerRol(userId) {
    const { data, error } = await sb.rpc('obtener_rol_usuario', { user_id: userId });

    if (error || !data || data.length === 0) return null;
    if (!data[0].activo) return null; // Usuario desactivado
    return data[0].rol;
}

// --- Verificar sesion existente al cargar ---
async function verificarSesionExistente() {
    try {
        const { data: { session } } = await sb.auth.getSession();

        if (session) {
            const rol = await obtenerRol(session.user.id);
            if (rol) {
                redirigirPorRol(rol);
                return; // No mostrar formulario, se esta redirigiendo
            }
            // Si no tiene perfil, cerrar sesion y mostrar login
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

// --- Manejar envio del formulario ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.classList.add('hidden');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showAlert('Completa todos los campos.');
        return;
    }

    // Deshabilitar boton
    btnLogin.disabled = true;
    btnLogin.innerHTML = '<span class="flex items-center justify-center gap-2"><svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Ingresando...</span>';

    try {
        // 1. Autenticar con Supabase Auth
        const { data, error } = await sb.auth.signInWithPassword({ email, password });

        if (error) {
            const mensajes = {
                'Invalid login credentials': 'Correo o contrasena incorrectos.',
                'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesion.',
                'Too many requests': 'Demasiados intentos. Espera un momento.',
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

        // 3. Guardar rol en IndexedDB para uso rapido en guard
        await HDVStorage.setItem('hdv_user_rol', rol);
        await HDVStorage.setItem('hdv_user_email', data.user.email);

        showAlert('Bienvenido! Redirigiendo...', 'success');

        // 4. Redirigir segun rol
        setTimeout(() => redirigirPorRol(rol), 500);

    } catch (err) {
        console.error('[Login] Error:', err);
        showAlert('Error de conexion. Verifica tu internet.');
        btnLogin.disabled = false;
        btnLogin.textContent = 'Iniciar Sesion';
    }
});

// --- Escuchar cambios de sesion (por si se autentica desde otra pestana) ---
sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
        const rol = await obtenerRol(session.user.id);
        if (rol) redirigirPorRol(rol);
    }
});

// --- Iniciar ---
verificarSesionExistente();
