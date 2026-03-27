// ============================================
// HDV SyncManager - Sincronizacion automatica de pedidos offline
// Se carga DESPUES de supabase-config.js y ANTES de app.js
// Depende de: HDVStorage, SupabaseService, guardarPedido (supabase-config.js)
//
// Blindaje Fase 1:
// - Pre-flight reachability check (detecta portales cautivos y zombie 3G)
// - Batch upsert (50 pedidos/lote) en vez de 1 HTTP por pedido
// - Persistencia incremental: marca sincronizado:true en IDB tras cada batch exitoso
// - Retry infinito con backoff exponencial + jitter (cap 5 min)
// ============================================

const SyncManager = (() => {
    let _syncing = false;
    let _retryTimeout = null;
    let _currentAttempt = 0;
    const BATCH_SIZE = 50;
    const BASE_DELAY = 5000;   // 5s inicial
    const MAX_DELAY = 300000;  // 5 min cap
    const JITTER = 0.3;        // ±30% jitter

    // --- Pre-flight: verificar conectividad real contra Supabase ---
    async function _isSupabaseReachable(timeoutMs = 5000) {
        if (!navigator.onLine) return false;
        try {
            if (typeof SupabaseService === 'undefined' || typeof SupabaseService.healthCheck !== 'function') {
                // Fallback: HEAD request a Supabase URL
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                const resp = await fetch(window.SUPABASE_URL || supabaseClient.supabaseUrl, {
                    method: 'HEAD',
                    signal: controller.signal,
                    cache: 'no-store'
                });
                clearTimeout(timer);
                return resp.ok;
            }
            const result = await Promise.race([
                SupabaseService.healthCheck(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
            ]);
            return !!result;
        } catch (_e) {
            return false;
        }
    }

    // --- Calcular delay con backoff exponencial + jitter ---
    function _calcDelay(attempt) {
        const exponential = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
        const jitterRange = exponential * JITTER;
        const jitter = (Math.random() * 2 - 1) * jitterRange; // ±30%
        return Math.max(1000, Math.round(exponential + jitter));
    }

    // --- Sincronizar pedidos con sincronizado === false ---
    async function syncPedidosPendientes() {
        if (_syncing) {
            console.log('[SyncManager] Sync ya en progreso, ignorando');
            return { synced: 0, failed: 0 };
        }

        // Pre-flight: verificar que Supabase responde
        const reachable = await _isSupabaseReachable(5000);
        if (!reachable) {
            console.log('[SyncManager] Supabase inalcanzable (portal cautivo / sin red real), sync pospuesto');
            _scheduleRetry();
            return { synced: 0, failed: 0 };
        }

        _syncing = true;
        let synced = 0;
        let failed = 0;

        try {
            const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
            const pendientes = pedidos.filter(p => p.sincronizado === false);

            if (pendientes.length === 0) {
                console.log('[SyncManager] No hay pedidos pendientes de sync');
                _currentAttempt = 0; // Reset backoff on success
                return { synced: 0, failed: 0 };
            }

            // Kill Switch: verificar cuenta activa antes de sincronizar
            try {
                const { data: activo } = await supabaseClient.rpc('verificar_estado_cuenta');
                if (activo === false) {
                    console.warn('[SyncManager] KILL SWITCH: cuenta desactivada, abortando sync');
                    if (typeof mostrarToast === 'function') {
                        mostrarToast('Cuenta bloqueada. Contacte al administrador.', 'error');
                    }
                    // Purgar datos locales
                    const allKeys = await HDVStorage.keys('hdv_');
                    for (const key of allKeys) {
                        if (key !== 'hdv_darkmode') await HDVStorage.removeItem(key);
                    }
                    await supabaseClient.auth.signOut();
                    window.location.replace('/login.html?blocked=1');
                    return { synced: 0, failed: 0 };
                }
            } catch (e) { /* Si falla la verificacion, continuar sync normalmente */ }

            console.log(`[SyncManager] Sincronizando ${pendientes.length} pedidos en batches de ${BATCH_SIZE}...`);

            // Procesar en batches
            for (let i = 0; i < pendientes.length; i += BATCH_SIZE) {
                const batch = pendientes.slice(i, i + BATCH_SIZE);
                let batchSynced = 0;
                let batchFailed = 0;

                // Intentar batch upsert si hay funcion disponible
                if (batch.length > 1 && typeof SupabaseService !== 'undefined' && typeof SupabaseService.upsertPedido === 'function') {
                    // Batch: construir rows y enviar en un solo upsert
                    const rows = batch.map(pedido => ({
                        id: pedido.id,
                        estado: pedido.estado || 'pedido_pendiente',
                        fecha: pedido.fecha || null,
                        datos: pedido,
                        actualizado_en: new Date().toISOString(),
                        vendedor_id: pedido.vendedor_id || window.hdvUsuario?.id || null
                    }));

                    try {
                        const { error } = await supabaseClient
                            .from('pedidos')
                            .upsert(rows, { onConflict: 'id' });

                        if (error) throw error;

                        // Batch exitoso: marcar todos como sincronizados
                        for (const pedido of batch) {
                            pedido.sincronizado = true;
                            batchSynced++;
                        }
                    } catch (batchErr) {
                        console.warn(`[SyncManager] Batch upsert fallo, cayendo a individual:`, batchErr);
                        // Fallback: intentar uno por uno
                        for (const pedido of batch) {
                            try {
                                if (typeof guardarPedido !== 'function') break;
                                const ok = await guardarPedido(pedido);
                                if (ok) {
                                    pedido.sincronizado = true;
                                    batchSynced++;
                                } else {
                                    batchFailed++;
                                }
                            } catch (err) {
                                batchFailed++;
                                console.error(`[SyncManager] Error sync pedido ${pedido.id}:`, err);
                            }
                        }
                    }
                } else {
                    // Single pedido o guardarPedido como fallback
                    for (const pedido of batch) {
                        try {
                            if (typeof guardarPedido !== 'function') {
                                console.warn('[SyncManager] guardarPedido no disponible');
                                break;
                            }
                            const ok = await guardarPedido(pedido);
                            if (ok) {
                                pedido.sincronizado = true;
                                batchSynced++;
                            } else {
                                // Detectar si es error de auth vs red
                                const { data: { session } } = await supabaseClient.auth.getSession();
                                if (!session) {
                                    console.warn('[SyncManager] Sesion expirada, requiere re-login');
                                    if (typeof mostrarToast === 'function') {
                                        mostrarToast('Sesion expirada. Inicie sesion nuevamente.', 'error');
                                    }
                                    failed += batch.length - batchSynced;
                                    break;
                                }
                                batchFailed++;
                            }
                        } catch (err) {
                            batchFailed++;
                            console.error(`[SyncManager] Error sync pedido ${pedido.id}:`, err);
                        }
                    }
                }

                synced += batchSynced;
                failed += batchFailed;

                // PERSISTENCIA INCREMENTAL: guardar progreso tras cada batch
                if (batchSynced > 0) {
                    const persisted = await HDVStorage.setItem('hdv_pedidos', pedidos);
                    if (!persisted) {
                        console.error('[SyncManager] ALERTA: No se pudo persistir progreso de sync en IDB');
                    }
                    console.log(`[SyncManager] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchSynced} sincronizados, ${batchFailed} fallidos (persistido en IDB)`);
                }
            }

            if (synced > 0) {
                console.log(`[SyncManager] Total: ${synced} pedidos sincronizados, ${failed} fallidos`);
                if (typeof mostrarToast === 'function') {
                    mostrarToast(`${synced} pedido${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''}`, 'success');
                }
            }

            // Resetear o incrementar backoff segun resultado
            if (failed > 0) {
                _scheduleRetry();
            } else {
                _currentAttempt = 0; // Reset on full success
            }

            return { synced, failed };
        } catch (err) {
            console.error('[SyncManager] Error general en sync:', err);
            _scheduleRetry();
            return { synced, failed };
        } finally {
            _syncing = false;
        }
    }

    // --- Reintento con backoff exponencial + jitter (infinito) ---
    function _scheduleRetry() {
        if (_retryTimeout) clearTimeout(_retryTimeout);
        const delay = _calcDelay(_currentAttempt);
        _currentAttempt++;
        console.log(`[SyncManager] Reintento #${_currentAttempt} programado en ${(delay / 1000).toFixed(1)}s`);
        _retryTimeout = setTimeout(() => {
            syncPedidosPendientes().catch(err => {
                console.error('[SyncManager] Error en reintento #' + _currentAttempt + ':', err);
            });
        }, delay);
    }

    // --- Obtener estado de la cola ---
    async function getQueueStatus() {
        const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
        const pendientes = pedidos.filter(p => p.sincronizado === false);
        return {
            total: pedidos.length,
            pendientes: pendientes.length,
            sincronizados: pedidos.length - pendientes.length,
            syncing: _syncing
        };
    }

    // --- Inicializar listeners de conectividad ---
    function init() {
        // Sync al volver online
        window.addEventListener('online', () => {
            console.log('[SyncManager] Conexion restaurada, iniciando sync...');
            _currentAttempt = 0; // Reset backoff al volver online
            setTimeout(() => syncPedidosPendientes(), TIEMPOS.SYNC_DELAY_ONLINE_MS);
        });

        // Sync silencioso al arrancar si hay conexion
        if (navigator.onLine) {
            setTimeout(() => syncPedidosPendientes(), TIEMPOS.SYNC_INIT_DELAY_MS);
        }

        console.log('[SyncManager] Inicializado (batch=' + BATCH_SIZE + ', maxDelay=' + MAX_DELAY/1000 + 's)');
    }

    function stop() {
        if (_retryTimeout) {
            clearTimeout(_retryTimeout);
            _retryTimeout = null;
        }
        _syncing = false;
        _currentAttempt = 0;
        console.log('[SyncManager] Detenido');
    }

    return {
        syncPedidosPendientes,
        getQueueStatus,
        init,
        stop
    };
})();

// Auto-init cuando HDVStorage este listo
HDVStorage.ready().then(() => SyncManager.init());
