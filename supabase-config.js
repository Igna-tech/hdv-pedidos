// ============================================
// HDV Supabase - Configuracion y Sincronizacion
// Capa de datos: CRUD + Realtime + Sync
// Delega queries a SupabaseService (services/supabase.js)
// Persistencia via HDVStorage (js/utils/storage.js) — IndexedDB
// ============================================

// ============================================
// ESTADO DE CONEXION
// ============================================
let supabaseConectado = false;

let _monitorTimer = null;
async function monitorearConexion() {
    clearTimeout(_monitorTimer);
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            supabaseConectado = false;
            actualizarIndicadorConexion(false);
            _monitorTimer = setTimeout(monitorearConexion, 5000);
            return;
        }
        supabaseConectado = await SupabaseService.healthCheck();
        actualizarIndicadorConexion(supabaseConectado);
    } catch {
        supabaseConectado = false;
        actualizarIndicadorConexion(false);
    }
    _monitorTimer = setTimeout(monitorearConexion, 30000);
}

function actualizarIndicadorConexion(conectado) {
    const badge = document.getElementById('status-badge');
    if (!badge) return;
    const enLinea = navigator.onLine;
    // Detectar si estamos en admin (tiene clase con mr-1.5) o vendedor (mr-2)
    const dotMr = badge.closest('header.bg-white') ? 'mr-1.5' : 'mr-2';
    if (conectado && enLinea) {
        badge.innerHTML = `<span class="w-2 h-2 bg-green-500 rounded-full ${dotMr}"></span> Sincronizado`;
        badge.style.color = '';
    } else if (enLinea && !conectado) {
        badge.innerHTML = `<span class="w-2 h-2 bg-yellow-500 rounded-full ${dotMr} animate-pulse"></span> Conectando...`;
        badge.style.color = '#d97706';
    } else {
        badge.innerHTML = `<span class="w-2 h-2 bg-red-500 rounded-full ${dotMr} animate-pulse"></span> Sin conexion`;
        badge.style.color = '#ef4444';
    }
    const banner = document.getElementById('offline-banner');
    if (banner) {
        banner.classList.toggle('hidden', conectado && enLinea);
    }
}

window.addEventListener('online', () => {
    monitorearConexion();
    // Sync de pedidos delegado a SyncManager (js/services/sync.js)
});
window.addEventListener('offline', () => actualizarIndicadorConexion(false));

// ============================================
// FUNCIONES PARA PEDIDOS
// ============================================

async function guardarPedido(pedido) {
    const { success } = await SupabaseService.upsertPedido(pedido);
    if (success) console.log('[Supabase] Pedido guardado:', pedido.id);
    else console.error('[Supabase] Error guardando pedido:', pedido.id);
    return success;
}

async function actualizarEstadoPedido(pedidoId, nuevoEstado) {
    const { success } = await SupabaseService.updateEstadoPedido(pedidoId, nuevoEstado);
    if (success) console.log('[Supabase] Estado actualizado:', pedidoId, '->', nuevoEstado);
    else console.error('[Supabase] Error actualizando estado:', pedidoId);
    return success;
}

async function eliminarPedido(pedidoId) {
    const { success } = await SupabaseService.deletePedido(pedidoId);
    if (success) console.log('[Supabase] Pedido eliminado:', pedidoId);
    else console.error('[Supabase] Error eliminando pedido:', pedidoId);
    return success;
}

async function obtenerPedidos() {
    const { data, error } = await SupabaseService.fetchPedidos();
    if (error) return null;
    return data.map(r => r.datos);
}

async function escucharPedidosRealtime(callback) {
    // Carga inicial — await garantiza datos listos antes de renderizar
    try {
        const { data, error } = await SupabaseService.fetchPedidos();
        if (error) {
            console.error('[Supabase] Error carga inicial pedidos:', error);
            const pedidosLocal = (await HDVStorage.getItem('hdv_pedidos')) || [];
            callback(pedidosLocal, []);
        } else {
            const pedidos = data.map(r => r.datos);
            const pedidosLocal = (await HDVStorage.getItem('hdv_pedidos')) || [];
            // Preservar pedidos locales no sincronizados en carga inicial
            const sinSync = pedidosLocal.filter(p => p.sincronizado === false);
            const remIds = new Set(pedidos.map(p => p.id));
            const localesExtra = sinSync.filter(p => !remIds.has(p.id));
            if (pedidos.length > 0 || pedidosLocal.length === 0) {
                const merged = [...pedidos, ...localesExtra];
                await HDVStorage.setItem('hdv_pedidos', merged);
                callback(merged, []);
            } else {
                console.warn('[Supabase] Carga inicial vacia pero hay datos locales, conservando');
                callback(pedidosLocal, []);
            }
        }
    } catch(e) {
        console.error('[Supabase] Error critico carga inicial pedidos:', e);
        const pedidosLocal = (await HDVStorage.getItem('hdv_pedidos')) || [];
        callback(pedidosLocal, []);
    }

    // Suscripcion realtime con debounce 500ms — preserva pedidos locales no sincronizados
    let _pedidosRealtimeTimer = null;
    const unsub = SupabaseService.subscribeTo('pedidos-realtime', 'pedidos', () => {
        if (_pedidosRealtimeTimer) clearTimeout(_pedidosRealtimeTimer);
        _pedidosRealtimeTimer = setTimeout(async () => {
            try {
                const { data, error } = await SupabaseService.fetchPedidos();
                if (error || !data) {
                    console.error('[Supabase] Error en realtime fetch pedidos:', error);
                    return;
                }
                const pedidosRemoto = data.map(r => r.datos);
                const pedidosLocalRT = (await HDVStorage.getItem('hdv_pedidos')) || [];

                // Preservar pedidos locales que aun no se sincronizaron
                const sinSincronizar = pedidosLocalRT.filter(p => p.sincronizado === false);
                const remotosIds = new Set(pedidosRemoto.map(p => p.id));
                const localesNoEnRemoto = sinSincronizar.filter(p => !remotosIds.has(p.id));

                if (pedidosRemoto.length > 0 || pedidosLocalRT.length === 0) {
                    const merged = [...pedidosRemoto, ...localesNoEnRemoto];
                    await HDVStorage.setItem('hdv_pedidos', merged);
                    callback(merged, [{ type: 'modified' }]);
                } else {
                    console.warn('[Supabase] Realtime devolvio vacio pero hay datos locales, conservando');
                    callback(pedidosLocalRT, [{ type: 'modified' }]);
                }
            } catch (err) {
                console.error('[Supabase] Error critico en callback realtime pedidos admin:', err);
            }
        }, 500);
    });

    return unsub;
}

// ============================================
// REALTIME VENDEDOR — Suscripcion granular para UI reactiva
// ============================================

function escucharPedidosRealtimeVendedor(callbacks) {
    // callbacks: { onEstadoCambiado(pedidoId, nuevoEstado, datosPedido), onPedidoEliminado(pedidoId), onSync(pedidosMerged) }

    // Carga inicial silenciosa — merge remoto + local no sincronizado
    (async () => {
        try {
            const { data, error } = await SupabaseService.fetchPedidos();
            if (!error && data) {
                const pedidosRemoto = data.map(r => r.datos);
                const pedidosLocal = (await HDVStorage.getItem('hdv_pedidos')) || [];
                const sinSync = pedidosLocal.filter(p => p.sincronizado === false);
                const remIds = new Set(pedidosRemoto.map(p => p.id));
                const localesExtra = sinSync.filter(p => !remIds.has(p.id));
                const merged = [...pedidosRemoto, ...localesExtra];
                await HDVStorage.setItem('hdv_pedidos', merged);
                if (callbacks.onSync) callbacks.onSync(merged);
            }
        } catch(e) {
            console.warn('[Vendedor RT] Error carga inicial pedidos:', e);
        }
    })();

    // Suscripcion realtime granular — detecta cambios individuales
    const unsub = SupabaseService.subscribeTo('vendedor-pedidos-rt', 'pedidos', async (payload) => {
        try {
        const eventType = payload.eventType; // INSERT, UPDATE, DELETE
        const newRow = payload.new;
        const oldRow = payload.old;

        if (eventType === 'UPDATE' && newRow) {
            const datos = newRow.datos || {};
            const pedidoId = newRow.id;
            const nuevoEstado = datos.estado;

            // Actualizar IndexedDB
            const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
            const idx = pedidos.findIndex(p => p.id === pedidoId);
            if (idx >= 0) {
                // Preservar campos locales, actualizar datos del servidor
                pedidos[idx] = { ...pedidos[idx], ...datos, sincronizado: true };
                await HDVStorage.setItem('hdv_pedidos', pedidos);
            }

            if (callbacks.onEstadoCambiado) {
                callbacks.onEstadoCambiado(pedidoId, nuevoEstado, datos);
            }
        } else if (eventType === 'DELETE' && oldRow) {
            const pedidoId = oldRow.id;
            const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
            const filtered = pedidos.filter(p => p.id !== pedidoId);
            await HDVStorage.setItem('hdv_pedidos', filtered);

            if (callbacks.onPedidoEliminado) {
                callbacks.onPedidoEliminado(pedidoId);
            }
        } else if (eventType === 'INSERT' && newRow) {
            // Un pedido nuevo aparecio (ej. sync desde otro dispositivo)
            const datos = newRow.datos || {};
            const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
            if (!pedidos.find(p => p.id === newRow.id)) {
                pedidos.push({ ...datos, sincronizado: true });
                await HDVStorage.setItem('hdv_pedidos', pedidos);
            }
            if (callbacks.onSync) {
                callbacks.onSync(pedidos);
            }
        }
        } catch (err) {
            console.error('[Vendedor RT] Error en callback realtime pedidos:', err);
        }
    });

    return unsub;
}

async function sincronizarPedidosLocales() {
    const pedidosLocal = (await HDVStorage.getItem('hdv_pedidos')) || [];
    const sinSincronizar = pedidosLocal.filter(p => p.sincronizado === false);
    if (sinSincronizar.length === 0) return;

    console.log(`[Supabase] Sincronizando ${sinSincronizar.length} pedidos locales...`);
    let sincronizados = 0;
    for (const pedido of sinSincronizar) {
        const ok = await guardarPedido(pedido);
        if (ok) { pedido.sincronizado = true; sincronizados++; }
    }
    if (sincronizados > 0) {
        await HDVStorage.setItem('hdv_pedidos', pedidosLocal);
        console.log(`[Supabase] ${sincronizados} pedidos sincronizados`);
    }
}

// ============================================
// FUNCIONES PARA CATALOGO (Tablas Relacionales)
// ============================================

function _normTipoImpuesto(val) {
    if (!val) return '10';
    const v = String(val).toLowerCase().trim();
    if (v === 'iva10' || v === '10') return '10';
    if (v === 'iva5' || v === '5') return '5';
    if (v === 'exenta' || v === 'exento' || v === '0') return 'exenta';
    return '10';
}

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
        tipo_impuesto: _normTipoImpuesto(p.tipo_impuesto),
        unidad_medida_set: p.unidad_medida_set || '77',
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

async function obtenerCatalogo() {
    const { data, error } = await SupabaseService.fetchCatalogo();
    if (error || !data) {
        console.error('[Supabase] Error obteniendo catalogo:', error);
        return null;
    }

    const productos = data.productos.map(_mapProductoRelacional);

    console.log('[Supabase] Catalogo cargado desde tablas relacionales:', {
        categorias: data.categorias.length,
        productos: productos.length,
        clientes: data.clientes.length
    });

    return {
        categorias: data.categorias,
        clientes: data.clientes,
        productos
    };
}

async function guardarCatalogo(dataCatalogo) {
    try {
        const cats = dataCatalogo.categorias || [];
        const clis = dataCatalogo.clientes || [];
        const prods = dataCatalogo.productos || [];

        console.log('[Supabase] Guardando catalogo relacional...', {
            categorias: cats.length, productos: prods.length, clientes: clis.length
        });

        if (cats.length > 0) {
            const catRows = cats.map(c => ({
                id: c.id, nombre: c.nombre || c.id,
                subcategorias: c.subcategorias || [], estado: c.estado || 'activa'
            }));
            const res = await SupabaseService.upsertCategorias(catRows);
            if (!res.success) throw new Error('Error categorias: ' + res.error?.message);
        }
        const { data: dbCats } = await SupabaseService.fetchCategoriasIds();
        const catIds = new Set(cats.map(c => c.id));
        const catsEliminar = (dbCats || []).filter(c => !catIds.has(c.id)).map(c => c.id);
        if (catsEliminar.length > 0) await SupabaseService.deleteCategorias(catsEliminar);

        if (clis.length > 0) {
            const rucVisto = new Set();
            const cliRows = [];
            for (const c of clis) {
                const rucLimpio = (c.ruc || '').trim() || null;
                if (rucLimpio) {
                    if (rucVisto.has(rucLimpio)) {
                        console.warn(`[Supabase] RUC duplicado ignorado: ${rucLimpio} (cliente ${c.id})`);
                        continue;
                    }
                    rucVisto.add(rucLimpio);
                }
                cliRows.push({
                    id: c.id, nombre: c.nombre || '', razon_social: c.razon_social || null,
                    ruc: rucLimpio, telefono: c.telefono || null, direccion: c.direccion || null,
                    zona: c.zona || null, encargado: c.encargado || null, tipo: c.tipo || 'minorista',
                    oculto: c.oculto || false, precios_personalizados: c.precios_personalizados || null,
                    tipo_documento: c.tipo_documento || 'RUC', pais_documento: c.pais_documento || 'PRY'
                });
            }
            const res = await SupabaseService.upsertClientes(cliRows);
            if (!res.success) throw new Error('Error clientes: ' + res.error?.message);
        }
        const { data: dbClis } = await SupabaseService.fetchClientesIds();
        const cliIds = new Set(clis.map(c => c.id));
        const clisEliminar = (dbClis || []).filter(c => !cliIds.has(c.id)).map(c => c.id);
        if (clisEliminar.length > 0) await SupabaseService.deleteClientes(clisEliminar);

        if (prods.length > 0) {
            const prodRows = prods.map(p => ({
                id: p.id, nombre: p.nombre || '', categoria_id: p.categoria || null,
                subcategoria: p.subcategoria || 'General', imagen_url: p.imagen_url || p.imagen || null,
                estado: p.estado || 'disponible', oculto: p.oculto || false,
                tipo_impuesto: _normTipoImpuesto(p.tipo_impuesto), unidad_medida_set: p.unidad_medida_set || '77'
            }));
            const res = await SupabaseService.upsertProductos(prodRows);
            if (!res.success) throw new Error('Error productos: ' + res.error?.message);
        }
        const { data: dbProds } = await SupabaseService.fetchProductosIds();
        const prodIds = new Set(prods.map(p => p.id));
        const prodsEliminar = (dbProds || []).filter(p => !prodIds.has(p.id)).map(p => p.id);
        if (prodsEliminar.length > 0) await SupabaseService.deleteProductos(prodsEliminar);

        const allProdIds = prods.map(p => p.id);
        const varRows = [];
        for (const prod of prods) {
            for (const pres of (prod.presentaciones || [])) {
                varRows.push({
                    producto_id: prod.id, nombre_variante: pres.tamano || 'Unidad',
                    precio: pres.precio_base || 0, costo: pres.costo || 0,
                    stock: pres.stock || 0, activo: pres.activo !== undefined ? pres.activo : true
                });
            }
        }
        if (allProdIds.length > 0) {
            const res = await SupabaseService.reemplazarVariantes(allProdIds, varRows);
            if (!res.success) throw new Error('Error variantes: ' + res.error?.message);
        }

        console.log('[Supabase] Catalogo guardado exitosamente en tablas relacionales');
        return true;
    } catch (error) {
        console.error('[Supabase] Error guardando catalogo:', error);
        return false;
    }
}

function escucharCatalogoRealtime(callback) {
    obtenerCatalogo().then(data => { if (data) callback(data); });

    let reloadTimeout = null;
    const recargar = () => {
        clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(async () => {
            const data = await obtenerCatalogo();
            if (data) callback(data);
        }, 500);
    };

    const unsub1 = SupabaseService.subscribeTo('cat-rt', 'categorias', recargar);
    const unsub2 = SupabaseService.subscribeTo('cli-rt', 'clientes', recargar);
    const unsub3 = SupabaseService.subscribeTo('prod-rt', 'productos', recargar);
    const unsub4 = SupabaseService.subscribeTo('var-rt', 'producto_variantes', recargar);

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
}

// ============================================
// FUNCIONES PARA CONFIGURACION
// ============================================

async function guardarConfig(docId, datos) {
    const { success } = await SupabaseService.upsertConfig(docId, datos);
    if (success) console.log('[Supabase] Config guardada:', docId);
    else console.error('[Supabase] Error guardando config:', docId);
    return success;
}

async function obtenerConfig(docId) {
    const { data, error } = await SupabaseService.fetchConfig(docId);
    if (error) {
        console.error('[Supabase] Error obteniendo config ' + docId + ':', error);
        return null;
    }
    return data;
}

function escucharConfigRealtime(docId, storageKey) {
    return SupabaseService.subscribeTo('config-' + docId, 'configuracion', async () => {
        const datos = await obtenerConfig(docId);
        if (datos !== null) {
            try {
                await HDVStorage.setItem(storageKey, datos);
                console.log('[Supabase] Config actualizada en tiempo real:', docId);
                // Re-renderizar seccion activa si usa este config
                if (typeof _hdvRefrescarSeccionActiva === 'function') {
                    _hdvRefrescarSeccionActiva(docId);
                }
            } catch(e) {}
        }
    }, `doc_id=eq.${docId}`);
}

// --- Funciones especificas ---

function guardarPagosCredito(pagos) { return guardarConfig('pagos_credito', pagos); }
async function obtenerPagosCredito() { return await obtenerConfig('pagos_credito'); }

function guardarCreditosManuales(creditos) { return guardarConfig('creditos_manuales', creditos); }
async function obtenerCreditosManuales() { return await obtenerConfig('creditos_manuales'); }

function guardarPromociones(promos) { return guardarConfig('promociones', promos); }
async function obtenerPromociones() { return await obtenerConfig('promociones'); }

function guardarPlantillaWhatsApp(plantilla) { return guardarConfig('whatsapp_plantilla', plantilla); }
async function obtenerPlantillaWhatsApp() { return await obtenerConfig('whatsapp_plantilla'); }

function guardarGastos(gastos) {
    const vendedorId = window.hdvUsuario?.id;
    const docId = vendedorId ? `gastos_vendedor_${vendedorId}` : 'gastos_vendedor';
    return guardarConfig(docId, gastos);
}
async function obtenerGastos() {
    const vendedorId = window.hdvUsuario?.id;
    const docId = vendedorId ? `gastos_vendedor_${vendedorId}` : 'gastos_vendedor';
    return await obtenerConfig(docId);
}

function guardarRendiciones(rendiciones) {
    const vendedorId = window.hdvUsuario?.id;
    const docId = vendedorId ? `rendiciones_${vendedorId}` : 'rendiciones';
    return guardarConfig(docId, rendiciones);
}
async function obtenerRendiciones() {
    const vendedorId = window.hdvUsuario?.id;
    const docId = vendedorId ? `rendiciones_${vendedorId}` : 'rendiciones';
    return await obtenerConfig(docId);
}

function guardarCuentasBancarias(cuentas) { return guardarConfig('cuentas_bancarias', cuentas); }
async function obtenerCuentasBancarias() { return await obtenerConfig('cuentas_bancarias'); }

function guardarMetas(metas) { return guardarConfig('metas_vendedor', metas); }
async function obtenerMetas() { return await obtenerConfig('metas_vendedor'); }

// ============================================
// COMPATIBILIDAD: shim para llamadas directas db.collection()
// ============================================
const db = {
    collection: (collectionName) => ({
        doc: (docId) => ({
            set: async (data) => {
                if (collectionName === 'configuracion') {
                    return guardarConfig(docId, data);
                } else if (collectionName === 'reportes_mensuales') {
                    const { success, error } = await SupabaseService.upsertReporteMensual(docId, data);
                    if (!success) throw error;
                    return true;
                } else if (collectionName === 'promociones') {
                    const promos = (await HDVStorage.getItem('hdv_promociones')) || [];
                    const idx = promos.findIndex(p => p.id === docId);
                    if (idx >= 0) promos[idx] = data; else promos.push(data);
                    return guardarConfig('promociones', promos);
                }
            },
            get: async () => {
                if (collectionName === 'reportes_mensuales') {
                    const { data } = await SupabaseService.fetchReporteMensual(docId);
                    return { exists: !!data, data: () => data };
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
        const datos = await HDVStorage.getItem(item.key);
        if (datos && (Array.isArray(datos) ? datos.length > 0 : true)) {
            await guardarConfig(item.doc, datos);
        }
    }
    console.log('[Supabase] Datos de negocio sincronizados');
}

async function cargarDatosNegocio() {
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
            const datos = await obtenerConfig(item.doc);
            if (datos !== null) {
                await HDVStorage.setItem(item.key, datos);
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

// Promesa global: admin.js la espera antes de renderizar secciones
let _datosNegocioPromise = null;

function esperarDatosNegocio() {
    return _datosNegocioPromise || Promise.resolve();
}

HDVStorage.ready().then(() => {
    monitorearConexion();
    _datosNegocioPromise = cargarDatosNegocio();
    iniciarListenersDatosNegocio();
});

// ============================================
// CERRAR SESION
// ============================================

async function cerrarSesion() {
    try {
        await supabaseClient.auth.signOut();
        await HDVStorage.removeItem('hdv_user_rol');
        await HDVStorage.removeItem('hdv_user_email');
        await HDVStorage.removeItem('hdv_user_nombre');
        window.location.replace('/login.html');
    } catch (err) {
        console.error('[Supabase] Error cerrando sesion:', err);
        window.location.replace('/login.html');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const sidebarName = document.getElementById('sidebar-user-name');
    if (sidebarName && window.hdvUsuario) {
        sidebarName.textContent = window.hdvUsuario.nombre;
    }
});

console.log('[Supabase] HDV Distribuciones - Inicializado v3.0 (IndexedDB + SupabaseService)');
