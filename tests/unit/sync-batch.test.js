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

let mockSetItemCalls;
let mockBatchCallCount;
let mockUpsertShouldFail;

beforeEach(() => {
    mockSetItemCalls = [];
    mockBatchCallCount = 0;
    mockUpsertShouldFail = false;

    globalThis.HDVStorage = {
        getItem: vi.fn(async (key) => {
            if (key === 'hdv_pedidos') return JSON.parse(JSON.stringify(globalThis._testPedidos || []));
            return null;
        }),
        setItem: vi.fn(async (key, val) => {
            mockSetItemCalls.push({ key, val: JSON.parse(JSON.stringify(val)) });
            return true;
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
    globalThis.guardarPedido = vi.fn(async () => false); // Fallback individual tambien falla

    // Load SyncManager fresh
    delete globalThis.SyncManager;
    let code = readFileSync(join(process.cwd(), 'js/services/sync.js'), 'utf-8');
    code = code.replace(/HDVStorage\.ready\(\)\.then[^;]*;/, '// auto-init disabled for test');
    // const → var para que el IIFE se registre en scope global via indirect eval
    code = code.replace(/^const SyncManager/m, 'var SyncManager');
    (0, eval)(code);
});

describe('SyncManager — batch partial failure', () => {

    it('todos los batches exitosos: marca todos como sincronizados', async () => {
        globalThis._testPedidos = crearPedidosMock(120);
        const result = await SyncManager.syncPedidosPendientes();

        expect(result.synced).toBe(120);
        expect(result.failed).toBe(0);
        // 3 batches (50+50+20) → 3 llamadas a setItem
        expect(mockSetItemCalls.length).toBe(3);
    });

    it('batch 2 falla: batch 1 ya fue persistido', async () => {
        globalThis._testPedidos = crearPedidosMock(120);
        mockUpsertShouldFail = true;

        const result = await SyncManager.syncPedidosPendientes();

        // Batch 1 (50 pedidos) debe haberse persistido
        expect(mockSetItemCalls.length).toBeGreaterThanOrEqual(1);

        // Verificar que los primeros 50 estan sincronizados en la primera persistencia
        const primeraPersistencia = mockSetItemCalls[0].val;
        const sincronizadosBatch1 = primeraPersistencia.filter(p => p.sincronizado === true);
        expect(sincronizadosBatch1.length).toBe(50);

        // El resultado total debe tener al menos 50 synced
        expect(result.synced).toBeGreaterThanOrEqual(50);
        expect(result.failed).toBeGreaterThan(0);
    });

    it('cola vacia: retorna inmediatamente sin sync', async () => {
        globalThis._testPedidos = [];
        const result = await SyncManager.syncPedidosPendientes();

        expect(result.synced).toBe(0);
        expect(result.failed).toBe(0);
        expect(mockSetItemCalls.length).toBe(0);
    });

    it('pre-flight falla (offline): sync se pospone', async () => {
        globalThis._testPedidos = crearPedidosMock(10);
        globalThis.navigator.onLine = false;

        const result = await SyncManager.syncPedidosPendientes();

        expect(result.synced).toBe(0);
        expect(result.failed).toBe(0);
        expect(mockSetItemCalls.length).toBe(0);
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
