// ============================================
// Tests: Realtime Merge — atomicUpdate mutex
// Verifica que operaciones concurrentes sobre la misma key
// se serializan correctamente sin perdida de datos.
//
// @vitest-environment jsdom
// ============================================

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { join } from 'path';

let HDVStorage;

async function createFreshStorage() {
    let code = readFileSync(join(process.cwd(), 'js/utils/storage.js'), 'utf-8');
    code = code.replace(/^const HDVStorage/m, 'globalThis.HDVStorage');
    (0, eval)(code);
    HDVStorage = globalThis.HDVStorage;
    if (!HDVStorage) throw new Error('HDVStorage no se registró en globalThis');
    await HDVStorage.ready();
    const allKeys = await HDVStorage.keys();
    for (const key of allKeys) await HDVStorage.removeItem(key);
    return HDVStorage;
}

describe('atomicUpdate — mutex per-key', () => {
    beforeEach(async () => {
        HDVStorage = await createFreshStorage();
    });

    it('operacion basica: lee, modifica y persiste', async () => {
        await HDVStorage.setItem('hdv_pedidos', [{ id: 'PED-1', total: 100 }]);

        const result = await HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
            pedidos[0].total = 200;
            return pedidos;
        });

        expect(result[0].total).toBe(200);
        const stored = await HDVStorage.getItem('hdv_pedidos');
        expect(stored[0].total).toBe(200);
    });

    it('operaciones concurrentes en MISMA key se serializan (no se pierden datos)', async () => {
        await HDVStorage.setItem('hdv_pedidos', []);

        // Simular 5 escrituras concurrentes (como realtime callbacks simultaneos)
        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(
                HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
                    pedidos.push({ id: `PED-${i}`, total: (i + 1) * 1000 });
                    return pedidos;
                })
            );
        }

        await Promise.all(promises);

        const final = await HDVStorage.getItem('hdv_pedidos');
        expect(final).toHaveLength(5);
        // Verificar que cada pedido esta presente (orden puede variar)
        const ids = final.map(p => p.id).sort();
        expect(ids).toEqual(['PED-0', 'PED-1', 'PED-2', 'PED-3', 'PED-4']);
    });

    it('operaciones en DISTINTAS keys son independientes (no se bloquean)', async () => {
        await HDVStorage.setItem('hdv_pedidos', []);
        await HDVStorage.setItem('hdv_carrito', []);

        const [resPedidos, resCarrito] = await Promise.all([
            HDVStorage.atomicUpdate('hdv_pedidos', (arr) => {
                arr.push({ id: 'PED-A' });
                return arr;
            }),
            HDVStorage.atomicUpdate('hdv_carrito', (arr) => {
                arr.push({ id: 'ITEM-X' });
                return arr;
            }),
        ]);

        expect(resPedidos).toHaveLength(1);
        expect(resCarrito).toHaveLength(1);
        expect(resPedidos[0].id).toBe('PED-A');
        expect(resCarrito[0].id).toBe('ITEM-X');
    });

    it('simula merge local + remoto sin perdida', async () => {
        // Estado inicial: 2 pedidos locales
        await HDVStorage.setItem('hdv_pedidos', [
            { id: 'PED-local-1', estado: 'pedido_pendiente', total: 10000 },
            { id: 'PED-local-2', estado: 'pedido_pendiente', total: 20000 },
        ]);

        // Operacion 1: realtime UPDATE cambia estado de PED-local-1
        const p1 = HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
            const p = pedidos.find(x => x.id === 'PED-local-1');
            if (p) p.estado = 'entregado';
            return pedidos;
        });

        // Operacion 2: realtime INSERT agrega PED-remoto-3
        const p2 = HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
            if (!pedidos.find(x => x.id === 'PED-remoto-3')) {
                pedidos.push({ id: 'PED-remoto-3', estado: 'pedido_pendiente', total: 30000 });
            }
            return pedidos;
        });

        // Operacion 3: realtime DELETE borra PED-local-2
        const p3 = HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
            return pedidos.filter(x => x.id !== 'PED-local-2');
        });

        await Promise.all([p1, p2, p3]);

        const final = await HDVStorage.getItem('hdv_pedidos');
        expect(final).toHaveLength(2);
        expect(final.find(p => p.id === 'PED-local-1').estado).toBe('entregado');
        expect(final.find(p => p.id === 'PED-remoto-3')).toBeTruthy();
        expect(final.find(p => p.id === 'PED-local-2')).toBeUndefined();
    });

    it('error en updater no corrompe la cadena', async () => {
        await HDVStorage.setItem('hdv_pedidos', [{ id: 'PED-1' }]);

        // Primera operacion: falla
        const failPromise = HDVStorage.atomicUpdate('hdv_pedidos', () => {
            throw new Error('Fallo simulado');
        }).catch(() => 'caught');

        // Segunda operacion: debe ejecutarse correctamente
        const successPromise = HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
            pedidos.push({ id: 'PED-2' });
            return pedidos;
        });

        const [failResult, successResult] = await Promise.all([failPromise, successPromise]);
        expect(failResult).toBe('caught');
        expect(successResult).toHaveLength(2);
    });

    it('key inexistente inicia con null', async () => {
        const result = await HDVStorage.atomicUpdate('hdv_nueva_key', (current) => {
            return current || [{ id: 'INIT' }];
        });
        expect(result).toEqual([{ id: 'INIT' }]);
    });
});
