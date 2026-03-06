// ============================================
// HDV Firebase - Configuracion y Sincronizacion
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

// Habilitar persistencia offline (crucial para vendedores sin senal)
db.enablePersistence({ synchronizeTabs: true })
    .then(() => console.log('[Firebase] Persistencia offline activada'))
    .catch(err => {
        if (err.code === 'failed-precondition') {
            console.warn('[Firebase] Persistencia no disponible: multiples pestanas abiertas');
        } else if (err.code === 'unimplemented') {
            console.warn('[Firebase] Este navegador no soporta persistencia offline');
        }
    });

// ============================================
// ESTADO DE CONEXION
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
            console.warn('[Firebase] Sin conexion:', error.code);
        });
}

function actualizarIndicadorConexion(conectado) {
    const badge = document.getElementById('status-badge');
    if (!badge) return;
    const enLinea = navigator.onLine;
    if (conectado && enLinea) {
        badge.innerHTML = '<span class="w-2 h-2 bg-green-500 rounded-full mr-2"></span> Sincronizado';
    } else if (enLinea && !conectado) {
        badge.innerHTML = '<span class="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></span> Conectando...';
    } else {
        badge.innerHTML = '<span class="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span> Sin conexion';
    }
}

// Detectar cambios de red del navegador
window.addEventListener('online', () => { actualizarIndicadorConexion(firebaseConectado); });
window.addEventListener('offline', () => { actualizarIndicadorConexion(false); });

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
            // Tambien sincronizar con localStorage como backup
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
// FUNCIONES PARA CATALOGO (productos, clientes)
// ============================================

// Guardar catalogo completo en Firestore
async function guardarCatalogoFirebase(productosData) {
    try {
        await db.collection('catalogo').doc('principal').set({
            ...productosData,
            actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('[Firebase] Catalogo guardado');
        return true;
    } catch (error) {
        console.error('[Firebase] Error guardando catalogo:', error);
        return false;
    }
}

// Obtener catalogo desde Firestore
async function obtenerCatalogoFirebase() {
    try {
        const doc = await db.collection('catalogo').doc('principal').get();
        if (doc.exists) {
            return doc.data();
        }
        return null;
    } catch (error) {
        console.error('[Firebase] Error obteniendo catalogo:', error);
        return null;
    }
}

// Escuchar cambios en catalogo (para vendedores)
function escucharCatalogoRealtime(callback) {
    return db.collection('catalogo').doc('principal')
        .onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                callback(data);
            }
        }, (error) => {
            console.error('[Firebase] Error en listener catalogo:', error);
        });
}

// ============================================
// FUNCIONES PARA DATOS DE NEGOCIO
// (creditos, promociones, plantilla WhatsApp)
// ============================================

// Guardar datos genericos en coleccion 'configuracion'
async function guardarConfigFirebase(docId, datos) {
    try {
        await db.collection('configuracion').doc(docId).set({
            datos: datos,
            actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('[Firebase] Config guardada:', docId);
        return true;
    } catch (error) {
        console.error('[Firebase] Error guardando config ' + docId + ':', error);
        return false;
    }
}

// Obtener datos de configuracion
async function obtenerConfigFirebase(docId) {
    try {
        const doc = await db.collection('configuracion').doc(docId).get();
        if (doc.exists) {
            return doc.data().datos;
        }
        return null;
    } catch (error) {
        console.error('[Firebase] Error obteniendo config ' + docId + ':', error);
        return null;
    }
}

// Escuchar cambios en configuracion en tiempo real
function escucharConfigRealtime(docId, localStorageKey) {
    return db.collection('configuracion').doc(docId)
        .onSnapshot((doc) => {
            if (doc.exists) {
                const datos = doc.data().datos;
                try {
                    if (typeof datos === 'string') {
                        localStorage.setItem(localStorageKey, datos);
                    } else {
                        localStorage.setItem(localStorageKey, JSON.stringify(datos));
                    }
                    console.log('[Firebase] Config actualizada en tiempo real:', docId);
                } catch(e) {}
            }
        }, (error) => {
            console.warn('[Firebase] Error listener config ' + docId + ':', error.code);
        });
}

// --- Funciones especificas por tipo de dato ---

// PAGOS DE CREDITO
function guardarPagosCreditoFirebase(pagos) {
    return guardarConfigFirebase('pagos_credito', pagos);
}
async function obtenerPagosCreditoFirebase() {
    return await obtenerConfigFirebase('pagos_credito');
}

// CREDITOS MANUALES
function guardarCreditosManualesFirebase(creditos) {
    return guardarConfigFirebase('creditos_manuales', creditos);
}
async function obtenerCreditosManualesFirebase() {
    return await obtenerConfigFirebase('creditos_manuales');
}

// PROMOCIONES
function guardarPromocionesFirebase(promos) {
    return guardarConfigFirebase('promociones', promos);
}
async function obtenerPromocionesFirebase() {
    return await obtenerConfigFirebase('promociones');
}

// PLANTILLA WHATSAPP
function guardarPlantillaWhatsAppFirebase(plantilla) {
    return guardarConfigFirebase('whatsapp_plantilla', plantilla);
}
async function obtenerPlantillaWhatsAppFirebase() {
    return await obtenerConfigFirebase('whatsapp_plantilla');
}

// Sincronizar todos los datos de negocio localStorage -> Firebase
async function sincronizarDatosNegocio() {
    const mapeo = [
        { key: 'hdv_pagos_credito', doc: 'pagos_credito' },
        { key: 'hdv_creditos_manuales', doc: 'creditos_manuales' },
        { key: 'hdv_promociones', doc: 'promociones' },
        { key: 'hdv_whatsapp_mensaje_credito', doc: 'whatsapp_plantilla' },
        { key: 'hdv_gastos', doc: 'gastos_vendedor' },
        { key: 'hdv_rendiciones', doc: 'rendiciones' },
        { key: 'hdv_cuentas_bancarias', doc: 'cuentas_bancarias' },
        { key: 'hdv_metas', doc: 'metas_vendedor' }
    ];
    for (const item of mapeo) {
        const local = localStorage.getItem(item.key);
        if (local) {
            try {
                const datos = JSON.parse(local);
                if (datos && (Array.isArray(datos) ? datos.length > 0 : true)) {
                    await guardarConfigFirebase(item.doc, datos);
                }
            } catch(e) {
                // Es string (plantilla WhatsApp)
                if (local.length > 0) {
                    await guardarConfigFirebase(item.doc, local);
                }
            }
        }
    }
    console.log('[Firebase] Datos de negocio sincronizados');
}

// Cargar datos de negocio Firebase -> localStorage (al iniciar)
async function cargarDatosNegocioDesdeFirebase() {
    const mapeo = [
        { key: 'hdv_pagos_credito', doc: 'pagos_credito' },
        { key: 'hdv_creditos_manuales', doc: 'creditos_manuales' },
        { key: 'hdv_promociones', doc: 'promociones' },
        { key: 'hdv_whatsapp_mensaje_credito', doc: 'whatsapp_plantilla' },
        { key: 'hdv_gastos', doc: 'gastos_vendedor' },
        { key: 'hdv_rendiciones', doc: 'rendiciones' },
        { key: 'hdv_cuentas_bancarias', doc: 'cuentas_bancarias' },
        { key: 'hdv_metas', doc: 'metas_vendedor' }
    ];
    for (const item of mapeo) {
        try {
            const datos = await obtenerConfigFirebase(item.doc);
            if (datos !== null) {
                if (typeof datos === 'string') {
                    localStorage.setItem(item.key, datos);
                } else {
                    localStorage.setItem(item.key, JSON.stringify(datos));
                }
                console.log('[Firebase] Cargado:', item.doc);
            }
        } catch(e) {
            console.warn('[Firebase] Error cargando:', item.doc);
        }
    }
}

// GASTOS DEL VENDEDOR
function guardarGastosFirebase(gastos) {
    return guardarConfigFirebase('gastos_vendedor', gastos);
}
async function obtenerGastosFirebase() {
    return await obtenerConfigFirebase('gastos_vendedor');
}

// RENDICIONES
function guardarRendicionesFirebase(rendiciones) {
    return guardarConfigFirebase('rendiciones', rendiciones);
}
async function obtenerRendicionesFirebase() {
    return await obtenerConfigFirebase('rendiciones');
}

// CUENTAS BANCARIAS
function guardarCuentasBancariasFirebase(cuentas) {
    return guardarConfigFirebase('cuentas_bancarias', cuentas);
}
async function obtenerCuentasBancariasFirebase() {
    return await obtenerConfigFirebase('cuentas_bancarias');
}

// METAS DE VENDEDOR
function guardarMetasFirebase(metas) {
    return guardarConfigFirebase('metas_vendedor', metas);
}
async function obtenerMetasFirebase() {
    return await obtenerConfigFirebase('metas_vendedor');
}

// Iniciar listeners en tiempo real para datos de negocio
function iniciarListenersDatosNegocio() {
    escucharConfigRealtime('pagos_credito', 'hdv_pagos_credito');
    escucharConfigRealtime('creditos_manuales', 'hdv_creditos_manuales');
    escucharConfigRealtime('promociones', 'hdv_promociones');
    escucharConfigRealtime('whatsapp_plantilla', 'hdv_whatsapp_mensaje_credito');
    escucharConfigRealtime('gastos_vendedor', 'hdv_gastos');
    escucharConfigRealtime('rendiciones', 'hdv_rendiciones');
    escucharConfigRealtime('cuentas_bancarias', 'hdv_cuentas_bancarias');
    escucharConfigRealtime('metas_vendedor', 'hdv_metas');
}

// ============================================
// INICIAR
// ============================================
monitorearConexion();
// Cargar datos de negocio desde Firebase y activar listeners
setTimeout(() => {
    cargarDatosNegocioDesdeFirebase();
    iniciarListenersDatosNegocio();
}, 1500);
console.log('[Firebase] HDV Distribuciones - Inicializado v7.1');
