// ============================================
// HDV SyncManager - Sincronizacion automatica de pedidos offline
// Se carga DESPUES de supabase-config.js y ANTES de app.js
// Depende de: HDVStorage, SupabaseService, guardarPedido (supabase-config.js)
// ============================================

const SyncManager = (() => {
    let _syncing = false;
    let _retryTimeout = null;
    const RETRY_DELAYS = [5000, 15000, 30000, 60000]; // Backoff progresivo

    // --- Sincronizar pedidos con sincronizado === false ---
    async function syncPedidosPendientes() {
        if (_syncing) {
            console.log('[SyncManager] Sync ya en progreso, ignorando');
            return { synced: 0, failed: 0 };
        }
        if (!navigator.onLine) {
            console.log('[SyncManager] Sin conexion, sync pospuesto');
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
                return { synced: 0, failed: 0 };
            }

            console.log(`[SyncManager] Sincronizando ${pendientes.length} pedidos...`);

            for (const pedido of pendientes) {
                try {
                    if (typeof guardarPedido !== 'function') {
                        console.warn('[SyncManager] guardarPedido no disponible');
                        break;
                    }

                    const ok = await guardarPedido(pedido);
                    if (ok) {
                        pedido.sincronizado = true;
                        synced++;
                        console.log(`[SyncManager] Pedido ${pedido.id} sincronizado`);
                    } else {
                        // V2-A01: Detectar si es error de auth vs red
                        const { data: { session } } = await supabaseClient.auth.getSession();
                        if (!session) {
                            console.warn('[SyncManager] Sesion expirada, requiere re-login');
                            if (typeof mostrarToast === 'function') {
                                mostrarToast('Sesion expirada. Inicie sesion nuevamente.', 'error');
                            }
                            break; // No reintentar con token muerto
                        }
                        failed++;
                        console.warn(`[SyncManager] Fallo sync pedido ${pedido.id}`);
                    }
                } catch (err) {
                    failed++;
                    console.error(`[SyncManager] Error sync pedido ${pedido.id}:`, err);
                }
            }

            // Persistir cambios de estado sincronizado
            if (synced > 0) {
                await HDVStorage.setItem('hdv_pedidos', pedidos);
                console.log(`[SyncManager] ${synced} pedidos sincronizados, ${failed} fallidos`);

                if (typeof mostrarToast === 'function' && synced > 0) {
                    mostrarToast(`${synced} pedido${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''}`, 'success');
                }
            }

            // Si hubo fallos, programar reintento con backoff
            if (failed > 0) {
                scheduleRetry(0);
            }

            return { synced, failed };
        } catch (err) {
            console.error('[SyncManager] Error general en sync:', err);
            return { synced, failed };
        } finally {
            _syncing = false;
        }
    }

    // --- Reintento con backoff progresivo ---
    function scheduleRetry(attempt) {
        if (_retryTimeout) clearTimeout(_retryTimeout);
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        console.log(`[SyncManager] Reintento programado en ${delay / 1000}s (intento ${attempt + 1})`);
        _retryTimeout = setTimeout(async () => {
            if (navigator.onLine) {
                const result = await syncPedidosPendientes();
                if (result.failed > 0 && attempt + 1 < RETRY_DELAYS.length) {
                    scheduleRetry(attempt + 1);
                }
            }
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
            setTimeout(() => syncPedidosPendientes(), 2000);
        });

        // Sync silencioso al arrancar si hay conexion
        if (navigator.onLine) {
            setTimeout(() => syncPedidosPendientes(), 3000);
        }

        console.log('[SyncManager] Inicializado');
    }

    return {
        syncPedidosPendientes,
        getQueueStatus,
        init
    };
})();

// Auto-init cuando HDVStorage este listo
HDVStorage.ready().then(() => SyncManager.init());
