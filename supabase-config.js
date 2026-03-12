// ============================================
// HDV Supabase - Configuracion y Sincronizacion
// Reemplaza firebase-config.js manteniendo
// las mismas funciones para compatibilidad
// ============================================

// Usa supabaseClient global de supabase-init.js

// ============================================
// ESTADO DE CONEXION
// ============================================
let supabaseConectado = false;

async function monitorearConexion() {
    try {
        const { error } = await supabaseClient.from('catalogo').select('id').limit(1);
        supabaseConectado = !error;
        actualizarIndicadorConexion(supabaseConectado);
    } catch {
        supabaseConectado = false;
        actualizarIndicadorConexion(false);
    }
    // Chequear cada 30 segundos
    setTimeout(monitorearConexion, 30000);
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

window.addEventListener('online', () => monitorearConexion());
window.addEventListener('offline', () => actualizarIndicadorConexion(false));

// ============================================
// FUNCIONES PARA PEDIDOS
// ============================================

async function guardarPedidoFirebase(pedido) {
    try {
        const { error } = await supabaseClient.from('pedidos').upsert({
            id: pedido.id,
            estado: pedido.estado || 'pendiente',
            fecha: pedido.fecha || null,
            datos: pedido,
            actualizado_en: new Date().toISOString()
        }, { onConflict: 'id' });
        if (error) throw error;
        console.log('[Supabase] Pedido guardado:', pedido.id);
        return true;
    } catch (error) {
        console.error('[Supabase] Error guardando pedido:', error);
        return false;
    }
}

async function actualizarEstadoPedidoFirebase(pedidoId, nuevoEstado) {
    try {
        // Obtener pedido actual para actualizar datos completos
        const { data: rows, error: fetchError } = await supabaseClient
            .from('pedidos').select('datos').eq('id', pedidoId).single();
        if (fetchError) throw fetchError;

        const datosActualizados = { ...(rows?.datos || {}), estado: nuevoEstado };
        const { error } = await supabaseClient.from('pedidos').update({
            estado: nuevoEstado,
            datos: datosActualizados,
            actualizado_en: new Date().toISOString()
        }).eq('id', pedidoId);
        if (error) throw error;
        console.log('[Supabase] Estado actualizado:', pedidoId, '->', nuevoEstado);
        return true;
    } catch (error) {
        console.error('[Supabase] Error actualizando estado:', error);
        return false;
    }
}

async function eliminarPedidoFirebase(pedidoId) {
    try {
        const { error } = await supabaseClient.from('pedidos').delete().eq('id', pedidoId);
        if (error) throw error;
        console.log('[Supabase] Pedido eliminado:', pedidoId);
        return true;
    } catch (error) {
        console.error('[Supabase] Error eliminando pedido:', error);
        return false;
    }
}

async function obtenerPedidosFirebase() {
    try {
        const { data, error } = await supabaseClient
            .from('pedidos')
            .select('datos')
            .order('fecha', { ascending: false });
        if (error) throw error;
        return (data || []).map(r => r.datos);
    } catch (error) {
        console.error('[Supabase] Error obteniendo pedidos:', error);
        return null;
    }
}

function escucharPedidosRealtime(callback) {
    // Carga inicial
    supabaseClient.from('pedidos').select('datos').order('fecha', { ascending: false })
        .then(({ data, error }) => {
            if (error) {
                console.error('[Supabase] Error carga inicial pedidos:', error);
                const pedidosLocal = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
                callback(pedidosLocal, []);
                return;
            }
            const pedidos = (data || []).map(r => r.datos);
            const pedidosLocal = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
            // No sobreescribir datos locales con resultado vacio de Supabase
            if (pedidos.length > 0 || pedidosLocal.length === 0) {
                localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
                callback(pedidos, []);
            } else {
                console.warn('[Supabase] Carga inicial vacia pero hay datos locales, conservando localStorage');
                callback(pedidosLocal, []);
            }
        });

    // Suscripcion realtime
    const channel = supabaseClient
        .channel('pedidos-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, async () => {
            const { data } = await supabaseClient
                .from('pedidos').select('datos').order('fecha', { ascending: false });
            const pedidos = (data || []).map(r => r.datos);
            const pedidosLocalRT = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
            // No sobreescribir datos locales con resultado vacio
            if (pedidos.length > 0 || pedidosLocalRT.length === 0) {
                localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
                callback(pedidos, [{ type: 'modified' }]);
            } else {
                console.warn('[Supabase] Realtime devolvio vacio pero hay datos locales, conservando');
                callback(pedidosLocalRT, [{ type: 'modified' }]);
            }
        })
        .subscribe();

    return () => supabaseClient.removeChannel(channel);
}

async function sincronizarPedidosLocales() {
    const pedidosLocal = JSON.parse(localStorage.getItem('hdv_pedidos') || '[]');
    const sinSincronizar = pedidosLocal.filter(p => p.sincronizado === false);
    if (sinSincronizar.length === 0) return;

    console.log(`[Supabase] Sincronizando ${sinSincronizar.length} pedidos locales...`);
    let sincronizados = 0;
    for (const pedido of sinSincronizar) {
        const ok = await guardarPedidoFirebase(pedido);
        if (ok) { pedido.sincronizado = true; sincronizados++; }
    }
    if (sincronizados > 0) {
        localStorage.setItem('hdv_pedidos', JSON.stringify(pedidosLocal));
        console.log(`[Supabase] ${sincronizados} pedidos sincronizados`);
    }
}

// ============================================
// FUNCIONES PARA CATALOGO
// ============================================

async function guardarCatalogoFirebase(productosData) {
    try {
        const { error } = await supabaseClient.from('catalogo').upsert({
            id: 'principal',
            categorias: productosData.categorias || [],
            productos: productosData.productos || [],
            clientes: productosData.clientes || [],
            actualizado_en: new Date().toISOString()
        }, { onConflict: 'id' });
        if (error) throw error;
        console.log('[Supabase] Catalogo guardado');
        return true;
    } catch (error) {
        console.error('[Supabase] Error guardando catalogo:', error);
        return false;
    }
}

async function obtenerCatalogoFirebase() {
    try {
        const { data, error } = await supabaseClient
            .from('catalogo').select('*').eq('id', 'principal').single();
        if (error) throw error;
        return data || null;
    } catch (error) {
        console.error('[Supabase] Error obteniendo catalogo:', error);
        return null;
    }
}

function escucharCatalogoRealtime(callback) {
    // Carga inicial
    supabaseClient.from('catalogo').select('*').eq('id', 'principal').single()
        .then(({ data }) => { if (data) callback(data); });

    // Suscripcion realtime
    const channel = supabaseClient
        .channel('catalogo-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'catalogo' }, async () => {
            const { data } = await supabaseClient
                .from('catalogo').select('*').eq('id', 'principal').single();
            if (data) callback(data);
        })
        .subscribe();

    return () => supabaseClient.removeChannel(channel);
}

// ============================================
// FUNCIONES PARA CONFIGURACION
// ============================================

async function guardarConfigFirebase(docId, datos) {
    try {
        const { error } = await supabaseClient.from('configuracion').upsert({
            doc_id: docId,
            datos: datos,
            actualizado_en: new Date().toISOString()
        }, { onConflict: 'doc_id' });
        if (error) throw error;
        console.log('[Supabase] Config guardada:', docId);
        return true;
    } catch (error) {
        console.error('[Supabase] Error guardando config ' + docId + ':', error);
        return false;
    }
}

async function obtenerConfigFirebase(docId) {
    try {
        const { data, error } = await supabaseClient
            .from('configuracion').select('datos').eq('doc_id', docId).single();
        if (error) throw error;
        return data?.datos ?? null;
    } catch (error) {
        console.error('[Supabase] Error obteniendo config ' + docId + ':', error);
        return null;
    }
}

function escucharConfigRealtime(docId, localStorageKey) {
    const channel = supabaseClient
        .channel('config-' + docId)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'configuracion', filter: `doc_id=eq.${docId}` },
            async () => {
                const datos = await obtenerConfigFirebase(docId);
                if (datos !== null) {
                    try {
                        if (typeof datos === 'string') {
                            localStorage.setItem(localStorageKey, datos);
                        } else {
                            localStorage.setItem(localStorageKey, JSON.stringify(datos));
                        }
                        console.log('[Supabase] Config actualizada en tiempo real:', docId);
                    } catch(e) {}
                }
            })
        .subscribe();

    return () => supabaseClient.removeChannel(channel);
}

// --- Funciones especificas ---

function guardarPagosCreditoFirebase(pagos) { return guardarConfigFirebase('pagos_credito', pagos); }
async function obtenerPagosCreditoFirebase() { return await obtenerConfigFirebase('pagos_credito'); }

function guardarCreditosManualesFirebase(creditos) { return guardarConfigFirebase('creditos_manuales', creditos); }
async function obtenerCreditosManualesFirebase() { return await obtenerConfigFirebase('creditos_manuales'); }

function guardarPromocionesFirebase(promos) { return guardarConfigFirebase('promociones', promos); }
async function obtenerPromocionesFirebase() { return await obtenerConfigFirebase('promociones'); }

function guardarPlantillaWhatsAppFirebase(plantilla) { return guardarConfigFirebase('whatsapp_plantilla', plantilla); }
async function obtenerPlantillaWhatsAppFirebase() { return await obtenerConfigFirebase('whatsapp_plantilla'); }

function guardarGastosFirebase(gastos) { return guardarConfigFirebase('gastos_vendedor', gastos); }
async function obtenerGastosFirebase() { return await obtenerConfigFirebase('gastos_vendedor'); }

function guardarRendicionesFirebase(rendiciones) { return guardarConfigFirebase('rendiciones', rendiciones); }
async function obtenerRendicionesFirebase() { return await obtenerConfigFirebase('rendiciones'); }

function guardarCuentasBancariasFirebase(cuentas) { return guardarConfigFirebase('cuentas_bancarias', cuentas); }
async function obtenerCuentasBancariasFirebase() { return await obtenerConfigFirebase('cuentas_bancarias'); }

function guardarMetasFirebase(metas) { return guardarConfigFirebase('metas_vendedor', metas); }
async function obtenerMetasFirebase() { return await obtenerConfigFirebase('metas_vendedor'); }

// ============================================
// COMPATIBILIDAD: shim para llamadas directas db.collection()
// Usado en app.js y admin.js en unos pocos lugares
// ============================================
const db = {
    collection: (collectionName) => ({
        doc: (docId) => ({
            set: async (data) => {
                if (collectionName === 'configuracion') {
                    return guardarConfigFirebase(docId, data);
                } else if (collectionName === 'reportes_mensuales') {
                    const { error } = await supabaseClient.from('reportes_mensuales').upsert({
                        mes: docId,
                        datos: data,
                        creado_en: new Date().toISOString()
                    }, { onConflict: 'mes' });
                    if (error) throw error;
                    return true;
                } else if (collectionName === 'promociones') {
                    // Guardar promo individual dentro de la lista de promociones
                    const promos = JSON.parse(localStorage.getItem('hdv_promociones') || '[]');
                    const idx = promos.findIndex(p => p.id === docId);
                    if (idx >= 0) promos[idx] = data; else promos.push(data);
                    return guardarConfigFirebase('promociones', promos);
                }
            },
            get: async () => {
                // No utilizado activamente, pero por compatibilidad
                if (collectionName === 'reportes_mensuales') {
                    const { data } = await supabaseClient
                        .from('reportes_mensuales').select('datos').eq('mes', docId).single();
                    return { exists: !!data, data: () => data?.datos };
                }
                return { exists: false, data: () => null };
            }
        })
    })
};

// ============================================
// SINCRONIZACION MASIVA
// ============================================

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
                if (local.length > 0) await guardarConfigFirebase(item.doc, local);
            }
        }
    }
    console.log('[Supabase] Datos de negocio sincronizados');
}

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
                console.log('[Supabase] Cargado:', item.doc);
            }
        } catch(e) {
            console.warn('[Supabase] Error cargando:', item.doc);
        }
    }
}

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
setTimeout(() => {
    cargarDatosNegocioDesdeFirebase();
    iniciarListenersDatosNegocio();
}, 1500);
// ============================================
// CERRAR SESION
// ============================================

async function cerrarSesion() {
    try {
        await supabaseClient.auth.signOut();
        localStorage.removeItem('hdv_user_rol');
        localStorage.removeItem('hdv_user_email');
        localStorage.removeItem('hdv_user_nombre');
        window.location.replace('/login.html');
    } catch (err) {
        console.error('[Supabase] Error cerrando sesion:', err);
        // Forzar redireccion incluso si falla
        window.location.replace('/login.html');
    }
}

// Mostrar nombre de usuario en sidebar (admin)
document.addEventListener('DOMContentLoaded', () => {
    const sidebarName = document.getElementById('sidebar-user-name');
    if (sidebarName && window.hdvUsuario) {
        sidebarName.textContent = window.hdvUsuario.nombre;
    }
});

console.log('[Supabase] HDV Distribuciones - Inicializado v1.0');
