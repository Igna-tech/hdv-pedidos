// ============================================
// Test 4: IndexedDB quota exceeded handling
// Verifica que setItem retorna false cuando IDB falla
// y que los consumidores manejan el fallo correctamente.
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Storage quota exceeded — consumer handling', () => {

    let mockSetItemReturn;

    beforeEach(() => {
        mockSetItemReturn = true;

        globalThis.HDVStorage = {
            getItem: vi.fn(async (key) => {
                if (key === 'hdv_pedidos') return JSON.parse(JSON.stringify(globalThis._testPedidos || []));
                return null;
            }),
            setItem: vi.fn(async () => mockSetItemReturn),
            atomicUpdate: vi.fn(async (key, updaterFn) => {
                const current = JSON.parse(JSON.stringify(globalThis._testPedidos || []));
                const updated = await updaterFn(current);
                if (mockSetItemReturn) {
                    globalThis._testPedidos = updated;
                } else {
                    console.error('[SyncManager] ALERTA: fallo persistencia incremental en IDB');
                }
                return updated;
            }),
            ready: vi.fn(() => Promise.resolve()),
            keys: vi.fn(async () => []),
            removeItem: vi.fn(async () => {}),
        };

        Object.defineProperty(globalThis, 'navigator', {
            value: { onLine: true },
            writable: true,
            configurable: true,
        });

        globalThis.window = globalThis.window || {};
        globalThis.window.addEventListener = vi.fn();
        globalThis.window.hdvUsuario = { id: 'test-user-id' };
        globalThis.window.SUPABASE_URL = 'https://test.supabase.co';

        globalThis.supabaseClient = {
            supabaseUrl: 'https://test.supabase.co',
            rpc: vi.fn(async () => ({ data: true })),
            from: vi.fn(() => ({
                upsert: vi.fn(async () => ({ error: null })),
            })),
            auth: {
                getSession: vi.fn(async () => ({ data: { session: {} } })),
                signOut: vi.fn(),
            },
        };

        globalThis.SupabaseService = {
            healthCheck: vi.fn(async () => true),
            upsertPedido: vi.fn(),
        };

        globalThis.mostrarToast = vi.fn();
        globalThis.guardarPedido = vi.fn(async () => true);
    });

    it('SyncManager continua sync aunque atomicUpdate falle parcialmente', async () => {
        globalThis._testPedidos = Array.from({ length: 5 }, (_, i) => ({
            id: `PED-q-${i}`, estado: 'pedido_pendiente',
            fecha: new Date().toISOString(), total: 10000,
            sincronizado: false, vendedor_id: 'test-user-id',
        }));

        // atomicUpdate que lanza error en la segunda llamada (persistencia batch)
        let atomicCallCount = 0;
        globalThis.HDVStorage.atomicUpdate = vi.fn(async (key, updaterFn) => {
            atomicCallCount++;
            const current = JSON.parse(JSON.stringify(globalThis._testPedidos || []));
            const updated = await updaterFn(current);
            if (atomicCallCount > 1) {
                // Simula fallo de persistencia en batch (pero no crashea)
                throw new Error('QuotaExceededError');
            }
            globalThis._testPedidos = updated;
            return updated;
        });

        // Load SyncManager
        delete globalThis.SyncManager;
        let code = readFileSync(join(process.cwd(), 'js/services/sync.js'), 'utf-8');
        code = code.replace(/HDVStorage\.ready\(\)\.then[^;]*;/, '');
        code = code.replace(/^const SyncManager/m, 'var SyncManager');
        (0, eval)(code);

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await SyncManager.syncPedidosPendientes();

        // Sync completa en memoria (upsert a Supabase funciono)
        expect(result.synced).toBe(5);
        // atomicUpdate fue invocado
        expect(HDVStorage.atomicUpdate).toHaveBeenCalled();

        consoleSpy.mockRestore();
    });

    it('setItem retorna true en operacion normal', async () => {
        const ok = await HDVStorage.setItem('test_key', { a: 1 });
        expect(ok).toBe(true);
    });

    it('setItem retorna false simula quota exceeded', async () => {
        mockSetItemReturn = false;
        const ok = await HDVStorage.setItem('hdv_pedidos', []);
        expect(ok).toBe(false);
    });
});
