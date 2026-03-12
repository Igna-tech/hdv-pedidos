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
        const { error } = await supabaseClient.from('categorias').select('id').limit(1);
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
// FUNCIONES PARA CATALOGO (Tablas Relacionales)
// ============================================

// Helper: convierte fila de producto + variantes al formato legacy
function _mapProductoRelacional(p) {
    return {
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria_id,
        subcategoria: p.subcategoria || 'General',
        imagen: p.imagen_url || '',
        imagen_url: p.imagen_url || '',
        estado: p.estado || 'disponible',
        oculto: p.oculto || false,
        tipo_impuesto: p.tipo_impuesto || 'iva10',
        presentaciones: (p.producto_variantes || []).map(v => ({
            variante_id: v.id,
            tamano: v.nombre_variante,
            precio_base: v.precio,
            costo: v.costo,
            stock: v.stock,
            activo: v.activo !== false
        }))
    };
}

async function obtenerCatalogoFirebase() {
    try {
        const [catRes, cliRes, prodRes] = await Promise.all([
            supabaseClient.from('categorias').select('*'),
            supabaseClient.from('clientes').select('*'),
            supabaseClient.from('productos').select('*, producto_variantes(*)')
        ]);
        if (catRes.error) throw catRes.error;
        if (cliRes.error) throw cliRes.error;
        if (prodRes.error) throw prodRes.error;

        const productos = (prodRes.data || []).map(_mapProductoRelacional);

        console.log('[Supabase] Catalogo cargado desde tablas relacionales:', {
            categorias: (catRes.data || []).length,
            productos: productos.length,
            clientes: (cliRes.data || []).length
        });

        return {
            categorias: catRes.data || [],
            clientes: cliRes.data || [],
            productos
        };
    } catch (error) {
        console.error('[Supabase] Error obteniendo catalogo:', error);
        return null;
    }
}

async function guardarCatalogoFirebase(dataCatalogo) {
    try {
        const cats = dataCatalogo.categorias || [];
        const clis = dataCatalogo.clientes || [];
        const prods = dataCatalogo.productos || [];

        console.log('[Supabase] Guardando catalogo relacional...', {
            categorias: cats.length, productos: prods.length, clientes: clis.length
        });

        // 1. Categorias - upsert batch
        if (cats.length > 0) {
            const catRows = cats.map(c => ({
                id: c.id,
                nombre: c.nombre || c.id,
                subcategorias: c.subcategorias || [],
                estado: c.estado || 'activa'
            }));
            const { error } = await supabaseClient.from('categorias').upsert(catRows, { onConflict: 'id' });
            if (error) throw new Error('Error categorias: ' + error.message);
        }
        // Eliminar categorias que ya no existen
        const { data: dbCats } = await supabaseClient.from('categorias').select('id');
        const catIds = new Set(cats.map(c => c.id));
        const catsEliminar = (dbCats || []).filter(c => !catIds.has(c.id)).map(c => c.id);
        if (catsEliminar.length > 0) {
            await supabaseClient.from('categorias').delete().in('id', catsEliminar);
        }

        // 2. Clientes - upsert batch
        if (clis.length > 0) {
            const cliRows = clis.map(c => ({
                id: c.id,
                nombre: c.nombre || '',
                razon_social: c.razon_social || null,
                ruc: c.ruc || null,
                telefono: c.telefono || null,
                direccion: c.direccion || null,
                zona: c.zona || null,
                encargado: c.encargado || null,
                tipo: c.tipo || 'minorista',
                oculto: c.oculto || false,
                precios_personalizados: c.precios_personalizados || null
            }));
            const { error } = await supabaseClient.from('clientes').upsert(cliRows, { onConflict: 'id' });
            if (error) throw new Error('Error clientes: ' + error.message);
        }
        // Eliminar clientes que ya no existen
        const { data: dbClis } = await supabaseClient.from('clientes').select('id');
        const cliIds = new Set(clis.map(c => c.id));
        const clisEliminar = (dbClis || []).filter(c => !cliIds.has(c.id)).map(c => c.id);
        if (clisEliminar.length > 0) {
            await supabaseClient.from('clientes').delete().in('id', clisEliminar);
        }

        // 3. Productos + Variantes
        if (prods.length > 0) {
            const prodRows = prods.map(p => ({
                id: p.id,
                nombre: p.nombre || '',
                categoria_id: p.categoria || null,
                subcategoria: p.subcategoria || 'General',
                imagen_url: p.imagen_url || p.imagen || null,
                estado: p.estado || 'disponible',
                oculto: p.oculto || false,
                tipo_impuesto: p.tipo_impuesto || 'iva10'
            }));
            const { error } = await supabaseClient.from('productos').upsert(prodRows, { onConflict: 'id' });
            if (error) throw new Error('Error productos: ' + error.message);
        }
        // Eliminar productos que ya no existen (CASCADE borra variantes)
        const { data: dbProds } = await supabaseClient.from('productos').select('id');
        const prodIds = new Set(prods.map(p => p.id));
        const prodsEliminar = (dbProds || []).filter(p => !prodIds.has(p.id)).map(p => p.id);
        if (prodsEliminar.length > 0) {
            await supabaseClient.from('productos').delete().in('id', prodsEliminar);
        }

        // Variantes: borrar todas las existentes y reinsertar
        const allProdIds = prods.map(p => p.id);
        if (allProdIds.length > 0) {
            await supabaseClient.from('producto_variantes').delete().in('producto_id', allProdIds);
        }
        const varRows = [];
        for (const prod of prods) {
            for (const pres of (prod.presentaciones || [])) {
                varRows.push({
                    producto_id: prod.id,
                    nombre_variante: pres.tamano || 'Unidad',
                    precio: pres.precio_base || 0,
                    costo: pres.costo || 0,
                    stock: pres.stock || 0,
                    activo: pres.activo !== undefined ? pres.activo : true
                });
            }
        }
        if (varRows.length > 0) {
            const { error } = await supabaseClient.from('producto_variantes').insert(varRows);
            if (error) throw new Error('Error variantes: ' + error.message);
        }

        console.log('[Supabase] Catalogo guardado exitosamente en tablas relacionales');
        return true;
    } catch (error) {
        console.error('[Supabase] Error guardando catalogo:', error);
        return false;
    }
}

function escucharCatalogoRealtime(callback) {
    // Carga inicial
    obtenerCatalogoFirebase().then(data => { if (data) callback(data); });

    // Handler comun: recargar todo el catalogo
    let reloadTimeout = null;
    const recargar = () => {
        // Debounce: si llegan muchos cambios seguidos, solo recargamos una vez
        clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(async () => {
            const data = await obtenerCatalogoFirebase();
            if (data) callback(data);
        }, 500);
    };

    // Escuchar las 4 tablas
    const ch1 = supabaseClient.channel('cat-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categorias' }, recargar)
        .subscribe();
    const ch2 = supabaseClient.channel('cli-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, recargar)
        .subscribe();
    const ch3 = supabaseClient.channel('prod-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, recargar)
        .subscribe();
    const ch4 = supabaseClient.channel('var-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'producto_variantes' }, recargar)
        .subscribe();

    return () => {
        supabaseClient.removeChannel(ch1);
        supabaseClient.removeChannel(ch2);
        supabaseClient.removeChannel(ch3);
        supabaseClient.removeChannel(ch4);
    };
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
