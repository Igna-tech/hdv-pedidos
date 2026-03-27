// ============================================
// Tests: Kill Switch — purga de datos sensibles
// Verifica que al desactivar un usuario, se eliminan
// datos sensibles de IndexedDB pero se preservan
// configuraciones no criticas (darkmode).
//
// @vitest-environment jsdom
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { join } from 'path';

let HDVStorage;
let removedKeys;

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

// Simula la logica de purga de guard.js/SyncManager
async function ejecutarPurgaKillSwitch(storage) {
    removedKeys = [];
    const allKeys = await storage.keys();
    for (const key of allKeys) {
        // Misma logica que guard.js: purgar todo excepto hdv_darkmode
        if (key.startsWith('hdv_') && key !== 'hdv_darkmode') {
            await storage.removeItem(key);
            removedKeys.push(key);
        }
    }
}

describe('Kill Switch — purga selectiva de IndexedDB', () => {
    beforeEach(async () => {
        HDVStorage = await createFreshStorage();
        removedKeys = [];

        // Poblar storage con datos tipicos de un vendedor activo
        await HDVStorage.setItem('hdv_pedidos', [
            { id: 'PED-001', total: 50000, estado: 'pedido_pendiente', sincronizado: false },
            { id: 'PED-002', total: 30000, estado: 'entregado', sincronizado: true },
        ]);
        await HDVStorage.setItem('hdv_catalogo_local', { productos: [{ id: 'P1' }], categorias: [] });
        await HDVStorage.setItem('hdv_carrito_CLI-1', [{ productoId: 'P1', cantidad: 2 }]);
        await HDVStorage.setItem('hdv_user_rol', 'vendedor');
        await HDVStorage.setItem('hdv_user_email', 'vendedor@test.com');
        await HDVStorage.setItem('hdv_user_nombre', 'Juan Test');
        await HDVStorage.setItem('hdv_gastos', [{ id: 'G1', monto: 15000 }]);
        await HDVStorage.setItem('hdv_rendiciones', [{ id: 'R1' }]);
        await HDVStorage.setItem('hdv_metas', { mensual: 1000000 });
        await HDVStorage.setItem('hdv_darkmode', true);
    });

    it('purga elimina pedidos (datos mas sensibles)', async () => {
        await ejecutarPurgaKillSwitch(HDVStorage);
        const pedidos = await HDVStorage.getItem('hdv_pedidos');
        expect(pedidos).toBeNull();
    });

    it('purga elimina catalogo local', async () => {
        await ejecutarPurgaKillSwitch(HDVStorage);
        const catalogo = await HDVStorage.getItem('hdv_catalogo_local');
        expect(catalogo).toBeNull();
    });

    it('purga elimina carritos en curso', async () => {
        await ejecutarPurgaKillSwitch(HDVStorage);
        const carrito = await HDVStorage.getItem('hdv_carrito_CLI-1');
        expect(carrito).toBeNull();
    });

    it('purga elimina datos de usuario (rol, email, nombre)', async () => {
        await ejecutarPurgaKillSwitch(HDVStorage);
        expect(await HDVStorage.getItem('hdv_user_rol')).toBeNull();
        expect(await HDVStorage.getItem('hdv_user_email')).toBeNull();
        expect(await HDVStorage.getItem('hdv_user_nombre')).toBeNull();
    });

    it('purga elimina gastos y rendiciones', async () => {
        await ejecutarPurgaKillSwitch(HDVStorage);
        expect(await HDVStorage.getItem('hdv_gastos')).toBeNull();
        expect(await HDVStorage.getItem('hdv_rendiciones')).toBeNull();
    });

    it('purga PRESERVA hdv_darkmode (configuracion no critica)', async () => {
        await ejecutarPurgaKillSwitch(HDVStorage);
        const darkmode = await HDVStorage.getItem('hdv_darkmode');
        expect(darkmode).toBe(true);
    });

    it('purga reporta correctamente las keys eliminadas', async () => {
        await ejecutarPurgaKillSwitch(HDVStorage);
        expect(removedKeys).toContain('hdv_pedidos');
        expect(removedKeys).toContain('hdv_catalogo_local');
        expect(removedKeys).toContain('hdv_user_rol');
        expect(removedKeys).not.toContain('hdv_darkmode');
    });

    it('despues de purga, storage sigue funcional para nuevo login', async () => {
        await ejecutarPurgaKillSwitch(HDVStorage);

        // Simular nuevo login — debe poder escribir sin errores
        await HDVStorage.setItem('hdv_user_rol', 'admin');
        await HDVStorage.setItem('hdv_pedidos', []);

        expect(await HDVStorage.getItem('hdv_user_rol')).toBe('admin');
        expect(await HDVStorage.getItem('hdv_pedidos')).toEqual([]);
    });

    it('purga no falla si storage esta vacio', async () => {
        // Limpiar todo manualmente primero
        const keys = await HDVStorage.keys();
        for (const key of keys) await HDVStorage.removeItem(key);

        // Ejecutar purga en storage vacio — no debe lanzar error
        await expect(ejecutarPurgaKillSwitch(HDVStorage)).resolves.not.toThrow();
    });
});
