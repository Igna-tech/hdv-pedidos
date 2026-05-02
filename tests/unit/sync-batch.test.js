// ============================================
// Test 3: SyncManager batch partial failure
// Verifica persistencia incremental cuando batch 2 falla.
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

function crearPedidosMock(n) {
    return Array.from({ length: n }, (_, i) => ({
        id: `PED-test-${i}`,
        estado: 'pedido_pendiente',
        fecha: new Date().toISOString(),
        total: 50000,
        sincronizado: false,
        vendedor_id: 'test-user-id',
    }));
}

let mockAtomicCalls;
let mockBatchCallCount;
let mockUpsertShouldFail;

beforeEach(() => {
    mockAtomicCalls = [];
    mockBatchCallCount = 0;
    mockUpsertShouldFail = false;

    globalThis.HDVStorage = {
        getItem: vi.fn(async (key) => {
            if (key === 'hdv_pedidos') return JSON.parse(JSON.stringify(globalThis._testPedidos || []));
            return null;
        }),
        setItem: vi.fn(async (key, val) => {
            return true;
        }),
        atomicUpdate: vi.fn(async (key, updaterFn) => {
            const current = JSON.parse(JSON.stringify(globalThis._testPedidos || []));
            const updated = await updaterFn(current);
            globalThis._testPedidos = updated;
            mockAtomicCalls.push({ key, val: JSON.parse(JSON.stringify(updated)) });
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
            upsert: vi.fn(async () => {
                mockBatchCallCount++;
                if (mockBatchCallCount === 2 && mockUpsertShouldFail) {
                    return { error: new Error('batch 2 simulated failure') };
                }
                return { error: null };
            }),
        })),
        auth: {
            getSession: vi.fn(async () => ({ data: { session: { user: {} } } })),
            signOut: vi.fn(),
        },
    };

    globalThis.SupabaseService = {
        healthCheck: vi.fn(async () => true),
        upsertPedido: vi.fn(),
    };

    globalThis.mostrarToast = vi.fn();
    globalThis.guardarPedido = vi.fn(async () => false);

    // Load SyncManager fresh
    delete globalThis.SyncManager;
    let code = readFileSync(join(process.cwd(), 'js/services/sync.js'), 'utf-8');
    code = code.replace(/HDVStorage\.ready\(\)\.then[^;]*;/, '// auto-init disabled for test');
    code = code.replace(/^const SyncManager/m, 'var SyncManager');
    (0, eval)(code);
});

describe('SyncManager — batch partial failure', () => {

    it('todos los batches exitosos: marca todos como sincronizados', async () => {
        globalThis._testPedidos = crearPedidosMock(120);
        const result = await SyncManager.syncPedidosPendientes();

        expect(result.synced).toBe(120);
        expect(result.failed).toBe(0);
        // 1 atomicUpdate initial (snapshot + terminal marking) + 3 batch persistence = 4 total
        expect(mockAtomicCalls.length).toBe(4);
    });

    it('batch 2 falla: batch 1 ya fue persistido', async () => {
        globalThis._testPedidos = crearPedidosMock(120);
        mockUpsertShouldFail = true;

        const result = await SyncManager.syncPedidosPendientes();

        // At least 2 atomicUpdate calls: 1 initial + 1 batch1 persistence
        expect(mockAtomicCalls.length).toBeGreaterThanOrEqual(2);

        // After initial snapshot + batch 1 persistence, check synced items
        const afterBatch1 = mockAtomicCalls[1].val;
        const sincronizadosBatch1 = afterBatch1.filter(p => p.sincronizado === true);
        expect(sincronizadosBatch1.length).toBe(50);

        // Result has at least 50 synced (batch 1) and some failed (batch 2)
        expect(result.synced).toBeGreaterThanOrEqual(50);
        expect(result.failed).toBeGreaterThan(0);
    });

    it('cola vacia: retorna inmediatamente sin sync', async () => {
        globalThis._testPedidos = [];
        const result = await SyncManager.syncPedidosPendientes();

        expect(result.synced).toBe(0);
        expect(result.failed).toBe(0);
        // Only the initial atomicUpdate (snapshot extraction) which finds nothing
        expect(mockAtomicCalls.length).toBe(1);
    });

    it('pre-flight falla (offline): sync se pospone', async () => {
        globalThis._testPedidos = crearPedidosMock(10);
        globalThis.navigator.onLine = false;

        const result = await SyncManager.syncPedidosPendientes();

        expect(result.synced).toBe(0);
        expect(result.failed).toBe(0);
        expect(mockAtomicCalls.length).toBe(0);
    });

    it('getQueueStatus refleja pedidos pendientes', async () => {
        globalThis._testPedidos = crearPedidosMock(5);
        const status = await SyncManager.getQueueStatus();

        expect(status.total).toBe(5);
        expect(status.pendientes).toBe(5);
        expect(status.sincronizados).toBe(0);
        expect(status.syncing).toBe(false);
    });
});
