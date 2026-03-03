// ============================================
// HDV Firebase - Configuración y Sincronización
// ============================================
const firebaseConfig = {
    apiKey: "AIzaSyCPz1RAyMQWzBDGobEdM6SVNt3Qsh1DiLc",
    authDomain: "hdv-distribuciones-system.firebaseapp.com",
    projectId: "hdv-distribuciones-system",
    storageBucket: "hdv-distribuciones-system.firebasestorage.app",
    messagingSenderId: "859867531927",
    appId: "1:859867531927:web:cb054cba2c7482413ab7d2"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Habilitar persistencia offline (crucial para vendedores sin señal)
db.enablePersistence({ synchronizeTabs: true })
    .then(() => console.log('[Firebase] Persistencia offline activada'))
    .catch(err => {
        if (err.code === 'failed-precondition') {
            console.warn('[Firebase] Persistencia no disponible: múltiples pestañas abiertas');
        } else if (err.code === 'unimplemented') {
            console.warn('[Firebase] Este navegador no soporta persistencia offline');
        }
    });

// ============================================
// ESTADO DE CONEXIÓN
// ============================================
let firebaseConectado = false;

function monitorearConexion() {
    db.collection('_health').doc('ping')
        .onSnapshot(() => {
            if (!firebaseConectado) {
                firebaseConectado = true;
                actualizarIndicadorConexion(true);
                console.log('[Firebase] Conectado');
            }
        }, (error) => {
            firebaseConectado = false;
            actualizarIndicadorConexion(false);
            console.warn('[Firebase] Sin conexión:', error.code);
        });
}

function actualizarIndicadorConexion(conectado) {
    const badge = document.getElementById('status-badge');
    if (!badge) return;
    if (conectado) {
        badge.innerHTML = '<span class="w-2 h-2 bg-green-500 rounded-full mr-2"></span> Sincronizado';
    } else {
        badge.innerHTML = '<span class="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></span> Offline (local)';
    }
}

// ============================================
// FUNCIONES PARA PEDIDOS
// ============================================

// Guardar pedido en Firestore
async function guardarPedidoFirebase(pedido) {
    try {
        await db.collection('pedidos').doc(pedido.id).set({
            ...pedido,
            creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
            actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('[Firebase] Pedido guardado:', pedido.id);
        return true;
    } catch (error) {
        console.error('[Firebase] Error guardando pedido:', error);
        return false;
    }
}

// Actualizar estado de pedido
async function actualizarEstadoPedidoFirebase(pedidoId, nuevoEstado) {
    try {
        await db.collection('pedidos').doc(pedidoId).update({
            estado: nuevoEstado,
            actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('[Firebase] Estado actualizado:', pedidoId, '->', nuevoEstado);
        return true;
    } catch (error) {
        console.error('[Firebase] Error actualizando estado:', error);
        return false;
    }
}

// Eliminar pedido
async function eliminarPedidoFirebase(pedidoId) {
    try {
        await db.collection('pedidos').doc(pedidoId).delete();
        console.log('[Firebase] Pedido eliminado:', pedidoId);
        return true;
    } catch (error) {
        console.error('[Firebase] Error eliminando pedido:', error);
        return false;
    }
}

// Obtener todos los pedidos (una vez)
async function obtenerPedidosFirebase() {
    try {
        const snapshot = await db.collection('pedidos')
            .orderBy('fecha', 'desc')
            .get();
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error('[Firebase] Error obteniendo pedidos:', error);
        return null; // null = error, [] = sin pedidos
    }
}

// Escuchar pedidos en tiempo real (para admin)
function escucharPedidosRealtime(callback) {
    return db.collection('pedidos')
        .orderBy('fecha', 'desc')
        .onSnapshot((snapshot) => {
            const pedidos = snapshot.docs.map(doc => doc.data());
            // También sincronizar con localStorage como backup
            localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
            callback(pedidos, snapshot.docChanges());
        }, (error) => {
            console.error('[Firebase] Error en listener:', error);
            // Fallback a localStorage
            const pedidosLocal = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
            callback(pedidosLocal, []);
        });
}

// Sincronizar pedidos locales pendientes a Firebase
async function sincronizarPedidosLocales() {
    const pedidosLocal = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const sinSincronizar = pedidosLocal.filter(p => p.sincronizado === false);

    if (sinSincronizar.length === 0) return;

    console.log(`[Firebase] Sincronizando ${sinSincronizar.length} pedidos locales...`);
    let sincronizados = 0;

    for (const pedido of sinSincronizar) {
        const ok = await guardarPedidoFirebase(pedido);
        if (ok) {
            pedido.sincronizado = true;
            sincronizados++;
        }
    }

    if (sincronizados > 0) {
        localStorage.setItem('hdv_pedidos', JSON.stringify(pedidosLocal));
        console.log(`[Firebase] ${sincronizados} pedidos sincronizados`);
    }
}

// ============================================
// FUNCIONES PARA CATÁLOGO (productos, clientes)
// ============================================

// Guardar catálogo completo en Firestore
async function guardarCatalogoFirebase(productosData) {
    try {
        await db.collection('catalogo').doc('principal').set({
            ...productosData,
            actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('[Firebase] Catálogo guardado');
        return true;
    } catch (error) {
        console.error('[Firebase] Error guardando catálogo:', error);
        return false;
    }
}

// Obtener catálogo desde Firestore
async function obtenerCatalogoFirebase() {
    try {
        const doc = await db.collection('catalogo').doc('principal').get();
        if (doc.exists) {
            return doc.data();
        }
        return null;
    } catch (error) {
        console.error('[Firebase] Error obteniendo catálogo:', error);
        return null;
    }
}

// Escuchar cambios en catálogo (para vendedores)
function escucharCatalogoRealtime(callback) {
    return db.collection('catalogo').doc('principal')
        .onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                callback(data);
            }
        }, (error) => {
            console.error('[Firebase] Error en listener catálogo:', error);
        });
}

// ============================================
// INICIAR
// ============================================
monitorearConexion();
console.log('[Firebase] HDV Distribuciones - Inicializado');
