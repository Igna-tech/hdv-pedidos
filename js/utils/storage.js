// ============================================
// HDV Storage - IndexedDB wrapper con cache en memoria
// Reemplaza localStorage para romper el limite de 5MB.
// Se carga DESPUES de supabase-init.js y ANTES de guard.js.
// Uso: await HDVStorage.getItem(key), await HDVStorage.setItem(key, val)
// ============================================

const HDVStorage = (() => {
    const DB_NAME = 'HDV_ERP_DB';
    const STORE_NAME = 'keyval';
    const DB_VERSION = 1;

    const _cache = new Map();
    let _db = null;
    let _readyResolve;
    const _readyPromise = new Promise(r => { _readyResolve = r; });

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
            console.log(`[HDVStorage] Inicializado con ${_cache.size} keys en cache`);
        } catch (err) {
            console.error('[HDVStorage] Error inicializando IndexedDB, fallback a memoria:', err);
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
        return _cache.has(key) ? _cache.get(key) : null;
    }

    async function setItem(key, value) {
        _cache.set(key, value);
        if (_db) {
            try {
                await _idbPut(key, value);
            } catch (err) {
                console.error('[HDVStorage] Error escribiendo a IDB:', key, err);
            }
        } else {
            // Fallback: persistir en localStorage cuando IndexedDB no esta disponible
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.warn('[HDVStorage] Fallback localStorage lleno:', key);
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

    // Auto-init al cargar el script
    _init();

    return { getItem, setItem, removeItem, keys, ready };
})();
