// ============================================
// HDV Storage - IndexedDB wrapper con cache en memoria
// Reemplaza localStorage para romper el limite de 5MB.
// Se carga DESPUES de supabase-init.js y ANTES de guard.js.
// Uso: await HDVStorage.getItem(key), await HDVStorage.setItem(key, val)
//
// Blindaje Fase 1:
// - navigator.storage.persist() para evitar eviccion del navegador
// - Monitoreo de cuota con alerta al 80%
// - Deteccion de eviccion post-init
// - setItem() retorna boolean (true=persistido, false=fallo)
// - getItem() retorna copia profunda (structuredClone) para evitar race conditions
// - Fallback localStorage para keys criticas cuando IDB falla
// ============================================

const HDVStorage = (() => {
    const DB_NAME = 'HDV_ERP_DB';
    const STORE_NAME = 'keyval';
    const DB_VERSION = 1;
    const QUOTA_WARN_PERCENT = 0.8; // Alertar al 80% de cuota

    // Keys criticas que se intentan respaldar en localStorage si IDB falla
    const CRITICAL_KEYS = ['hdv_pedidos', 'hdv_catalogo_local', 'hdv_carrito'];

    const _cache = new Map();
    const _locks = new Map(); // Mutex per-key para atomicUpdate
    let _db = null;
    let _readyResolve;
    const _readyPromise = new Promise(r => { _readyResolve = r; });
    let _storageHealthy = true; // Flag global de salud del storage

    // --- IndexedDB primitives ---

    function _openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            req.onblocked = () => {
                console.warn('[HDVStorage] IndexedDB bloqueado por otra pestana');
                reject(new Error('IndexedDB blocked'));
            };
        });
    }

    function _idbPut(key, value) {
        return new Promise((resolve, reject) => {
            const tx = _db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    function _idbGet(key) {
        return new Promise((resolve, reject) => {
            const tx = _db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function _idbDelete(key) {
        return new Promise((resolve, reject) => {
            const tx = _db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    function _idbGetAllKeys() {
        return new Promise((resolve, reject) => {
            const tx = _db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAllKeys();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    function _idbGetAll() {
        return new Promise((resolve, reject) => {
            const tx = _db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const entries = [];
            const req = store.openCursor();
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    entries.push({ key: cursor.key, value: cursor.value });
                    cursor.continue();
                } else {
                    resolve(entries);
                }
            };
            req.onerror = () => reject(req.error);
        });
    }

    // --- Persistent Storage & Quota Monitoring ---

    async function _requestPersistentStorage() {
        try {
            if (navigator.storage && navigator.storage.persist) {
                const granted = await navigator.storage.persist();
                if (granted) {
                    console.log('[HDVStorage] Almacenamiento persistente CONCEDIDO — datos protegidos contra eviccion');
                } else {
                    console.warn('[HDVStorage] Almacenamiento persistente DENEGADO — datos vulnerables a eviccion del navegador');
                }
                return granted;
            }
        } catch (err) {
            console.warn('[HDVStorage] Error solicitando persistent storage:', err);
        }
        return false;
    }

    async function _checkStorageQuota() {
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const { usage, quota } = await navigator.storage.estimate();
                const usagePercent = usage / quota;
                const usageMB = (usage / (1024 * 1024)).toFixed(1);
                const quotaMB = (quota / (1024 * 1024)).toFixed(0);

                console.log(`[HDVStorage] Cuota: ${usageMB}MB / ${quotaMB}MB (${(usagePercent * 100).toFixed(1)}%)`);

                if (usagePercent >= QUOTA_WARN_PERCENT) {
                    console.warn(`[HDVStorage] ALERTA: Uso de storage al ${(usagePercent * 100).toFixed(0)}% — riesgo de eviccion`);
                    if (typeof mostrarToast === 'function') {
                        mostrarToast(`Almacenamiento al ${(usagePercent * 100).toFixed(0)}%. Sincronice y libere espacio.`, 'warning');
                    }
                }

                return { usage, quota, percent: usagePercent };
            }
        } catch (err) {
            console.warn('[HDVStorage] Error verificando cuota:', err);
        }
        return null;
    }

    async function _detectarEviccion() {
        // Verifica si IDB perdio datos que deberian estar en cache
        // Se ejecuta post-init: si el cache tiene keys que IDB no, hubo eviccion
        if (!_db) return;

        try {
            const idbKeys = await _idbGetAllKeys();
            const idbKeySet = new Set(idbKeys);
            const cacheKeys = [..._cache.keys()];
            const evicted = cacheKeys.filter(k => !idbKeySet.has(k));

            if (evicted.length > 0) {
                console.error(`[HDVStorage] EVICCION DETECTADA: ${evicted.length} keys perdidas de IDB: ${evicted.join(', ')}`);
                _storageHealthy = false;

                // Re-escribir desde cache a IDB
                let recovered = 0;
                for (const key of evicted) {
                    try {
                        await _idbPut(key, _cache.get(key));
                        recovered++;
                    } catch (e) {
                        console.error(`[HDVStorage] No se pudo recuperar key ${key}:`, e);
                    }
                }
                if (recovered > 0) {
                    console.log(`[HDVStorage] ${recovered}/${evicted.length} keys recuperadas desde cache en memoria`);
                }
            }
        } catch (err) {
            console.warn('[HDVStorage] Error en deteccion de eviccion:', err);
        }
    }

    // --- Deep clone utility ---

    function _deepClone(value) {
        if (value === null || value === undefined) return value;
        if (typeof value !== 'object') return value; // primitivos: string, number, boolean
        try {
            // structuredClone disponible en navegadores modernos
            if (typeof structuredClone === 'function') {
                return structuredClone(value);
            }
        } catch (_e) { /* fallback */ }
        // Fallback para entornos sin structuredClone (tests, navegadores viejos)
        return JSON.parse(JSON.stringify(value));
    }

    // --- Migration from localStorage ---

    async function _migrateFromLocalStorage() {
        const keysToMigrate = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('hdv_')) {
                keysToMigrate.push(key);
            }
        }

        if (keysToMigrate.length === 0) return;

        console.log(`[HDVStorage] Migrando ${keysToMigrate.length} keys de localStorage a IndexedDB...`);

        const migrados = [];
        for (const key of keysToMigrate) {
            const raw = localStorage.getItem(key);
            if (raw === null) continue;

            let value;
            try {
                value = JSON.parse(raw);
            } catch {
                value = raw;
            }

            try {
                await _idbPut(key, value);
                _cache.set(key, value);
                migrados.push(key);
            } catch (err) {
                console.warn(`[HDVStorage] Error migrando key ${key}:`, err);
            }
        }

        // Solo limpiar keys que se migraron exitosamente
        for (const key of migrados) {
            localStorage.removeItem(key);
        }

        console.log(`[HDVStorage] Migracion completada: ${keysToMigrate.length} keys`);
    }

    // --- Load cache from IndexedDB ---

    async function _loadCache() {
        const entries = await _idbGetAll();
        for (const { key, value } of entries) {
            _cache.set(key, value);
        }
    }

    // --- Init ---

    async function _init() {
        try {
            _db = await _openDB();
            await _migrateFromLocalStorage();
            await _loadCache();

            // Blindaje: solicitar persistencia y verificar cuota
            await _requestPersistentStorage();
            await _checkStorageQuota();

            console.log(`[HDVStorage] Inicializado con ${_cache.size} keys en cache`);

            // Deteccion de eviccion post-carga (async, no bloquea init)
            _detectarEviccion().catch(() => {});
        } catch (err) {
            console.error('[HDVStorage] Error inicializando IndexedDB, fallback a memoria:', err);
            _storageHealthy = false;
            // Fallback: cargar de localStorage a cache en memoria
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('hdv_')) {
                    try {
                        _cache.set(key, JSON.parse(localStorage.getItem(key)));
                    } catch {
                        _cache.set(key, localStorage.getItem(key));
                    }
                }
            }
        }
        _readyResolve();
    }

    // --- Public API ---

    async function getItem(key) {
        if (!_cache.has(key)) return null;
        return _deepClone(_cache.get(key));
    }

    async function setItem(key, value) {
        _cache.set(key, value);
        if (_db) {
            try {
                await _idbPut(key, value);
                return true;
            } catch (err) {
                console.error('[HDVStorage] Error escribiendo a IDB:', key, err);
                _storageHealthy = false;
                // Fallback localStorage para keys criticas
                if (CRITICAL_KEYS.some(ck => key.startsWith(ck))) {
                    try {
                        localStorage.setItem(key, JSON.stringify(value));
                        console.warn(`[HDVStorage] Key critica ${key} respaldada en localStorage`);
                        return true;
                    } catch (e) {
                        console.error('[HDVStorage] Fallback localStorage tambien fallo:', key, e);
                    }
                }
                return false;
            }
        } else {
            // Fallback: persistir en localStorage cuando IndexedDB no esta disponible
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (e) {
                console.warn('[HDVStorage] Fallback localStorage lleno:', key);
                return false;
            }
        }
    }

    async function removeItem(key) {
        _cache.delete(key);
        if (_db) {
            try {
                await _idbDelete(key);
            } catch (err) {
                console.error('[HDVStorage] Error eliminando de IDB:', key, err);
            }
        }
    }

    async function keys(prefix) {
        const allKeys = [..._cache.keys()];
        return prefix ? allKeys.filter(k => k.startsWith(prefix)) : allKeys;
    }

    function ready() {
        return _readyPromise;
    }

    function isHealthy() {
        return _storageHealthy;
    }

    /**
     * atomicUpdate(key, updaterFn) — Mutex per-key para read-modify-write seguro.
     * Garantiza que operaciones concurrentes sobre la misma key se ejecuten secuencialmente.
     * updaterFn recibe el valor actual y debe retornar el nuevo valor.
     * Si updaterFn lanza error, el mutex se libera (finally) para no bloquear la key.
     */
    async function atomicUpdate(key, updaterFn) {
        if (!_locks.has(key)) _locks.set(key, Promise.resolve());
        const prev = _locks.get(key);
        const next = prev.then(async () => {
            const current = await getItem(key);
            const updated = await updaterFn(current);
            await setItem(key, updated);
            return updated;
        }).finally(() => {
            // Limpiar lock solo si es el ultimo en la cadena
            if (_locks.get(key) === next) _locks.delete(key);
        });
        // Encadenar: siguiente operacion espera a esta (catch evita unhandled rejection en la cadena)
        _locks.set(key, next.catch(() => {}));
        return next;
    }

    // Auto-init al cargar el script
    _init();

    return { getItem, setItem, removeItem, keys, ready, isHealthy, atomicUpdate };
})();
