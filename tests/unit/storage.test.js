// ============================================
// Tests: HDVStorage — IndexedDB wrapper con cache en memoria
// El sistema offline entero depende de este modulo.
//
// @vitest-environment jsdom
// ============================================

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { join } from 'path';

let HDVStorage;

async function createFreshStorage() {
    // storage.js usa "const HDVStorage = (() => {...})();"
    // "const" en indirect eval no se registra en globalThis.
    // Solucion: reemplazar "const HDVStorage" por asignacion a globalThis.
    let code = readFileSync(join(process.cwd(), 'js/utils/storage.js'), 'utf-8');
    code = code.replace(
        /^const HDVStorage/m,
        'globalThis.HDVStorage'
    );
    (0, eval)(code);

    HDVStorage = globalThis.HDVStorage;
    if (!HDVStorage) throw new Error('HDVStorage no se registró en globalThis');
    await HDVStorage.ready();
    return HDVStorage;
}

describe('HDVStorage - operaciones basicas', () => {
    beforeEach(async () => {
        HDVStorage = await createFreshStorage();
    });

    it('setItem + getItem round-trip con string', async () => {
        await HDVStorage.setItem('hdv_test', 'hola');
        const result = await HDVStorage.getItem('hdv_test');
        expect(result).toBe('hola');
    });

    it('setItem + getItem round-trip con objeto', async () => {
        const data = { id: 'PED-123', total: 50000, items: [{ nombre: 'Coca Cola' }] };
        await HDVStorage.setItem('hdv_pedido', data);
        const result = await HDVStorage.getItem('hdv_pedido');
        expect(result).toEqual(data);
    });

    it('getItem retorna null para key inexistente', async () => {
        const result = await HDVStorage.getItem('hdv_no_existe');
        expect(result).toBeNull();
    });

    it('removeItem elimina del cache', async () => {
        await HDVStorage.setItem('hdv_borrar', 'valor');
        await HDVStorage.removeItem('hdv_borrar');
        const result = await HDVStorage.getItem('hdv_borrar');
        expect(result).toBeNull();
    });

    it('setItem sobreescribe valor existente', async () => {
        await HDVStorage.setItem('hdv_key', 'v1');
        await HDVStorage.setItem('hdv_key', 'v2');
        const result = await HDVStorage.getItem('hdv_key');
        expect(result).toBe('v2');
    });
});

describe('HDVStorage - keys()', () => {
    beforeEach(async () => {
        HDVStorage = await createFreshStorage();
    });

    it('retorna keys con prefijo hdv_', async () => {
        await HDVStorage.setItem('hdv_pedidos', []);
        await HDVStorage.setItem('hdv_catalogo', {});
        await HDVStorage.setItem('other_key', 'val');

        const hdvKeys = await HDVStorage.keys('hdv_');
        expect(hdvKeys).toContain('hdv_pedidos');
        expect(hdvKeys).toContain('hdv_catalogo');
        expect(hdvKeys).not.toContain('other_key');
    });

    it('retorna todas las keys sin prefijo', async () => {
        await HDVStorage.setItem('a', 1);
        await HDVStorage.setItem('b', 2);

        const allKeys = await HDVStorage.keys();
        expect(allKeys.length).toBeGreaterThanOrEqual(2);
    });
});

describe('HDVStorage - tipos de datos complejos', () => {
    beforeEach(async () => {
        HDVStorage = await createFreshStorage();
    });

    it('almacena y recupera numeros', async () => {
        await HDVStorage.setItem('hdv_num', 42);
        expect(await HDVStorage.getItem('hdv_num')).toBe(42);
    });

    it('almacena y recupera booleanos', async () => {
        await HDVStorage.setItem('hdv_bool', true);
        expect(await HDVStorage.getItem('hdv_bool')).toBe(true);
    });

    it('almacena objetos anidados complejos (pedido)', async () => {
        const pedido = {
            id: 'PED-abc123',
            fecha: '2026-03-23',
            cliente: { id: 'CLI-1', nombre: 'Juan', ruc: '1234567-0' },
            items: [
                { productoId: 'P1', nombre: 'Coca Cola 2L', precio: 12000, cantidad: 5, subtotal: 60000 },
            ],
            total: 60000,
            tipoPago: 'contado',
            estado: 'pedido_pendiente',
            sincronizado: false,
        };
        await HDVStorage.setItem('hdv_pedido_test', pedido);
        const recovered = await HDVStorage.getItem('hdv_pedido_test');
        expect(recovered).toEqual(pedido);
        expect(recovered.cliente.nombre).toBe('Juan');
        expect(recovered.items[0].subtotal).toBe(60000);
    });
});

describe('HDVStorage - clone condicional (CRIT-04)', () => {
    beforeEach(async () => {
        HDVStorage = await createFreshStorage();
    });

    it('getItem con clone:true (default) retorna copia profunda', async () => {
        const data = [{ id: 'PED-1', total: 50000 }];
        await HDVStorage.setItem('hdv_pedidos', data);

        const read1 = await HDVStorage.getItem('hdv_pedidos');
        const read2 = await HDVStorage.getItem('hdv_pedidos');
        read1[0].total = 999;
        expect(read2[0].total).toBe(50000); // no contaminado
    });

    it('getItem con clone:false retorna referencia directa del cache', async () => {
        const data = [{ id: 'PED-1', total: 50000 }];
        await HDVStorage.setItem('hdv_pedidos', data);

        const ref1 = await HDVStorage.getItem('hdv_pedidos', { clone: false });
        const ref2 = await HDVStorage.getItem('hdv_pedidos', { clone: false });
        expect(ref1).toBe(ref2); // misma referencia
    });

    it('clone:false en primitivos retorna el valor directo', async () => {
        await HDVStorage.setItem('hdv_flag', 'activo');
        const val = await HDVStorage.getItem('hdv_flag', { clone: false });
        expect(val).toBe('activo');
    });

    it('clone:false en null retorna null', async () => {
        const val = await HDVStorage.getItem('hdv_no_existe', { clone: false });
        expect(val).toBeNull();
    });
});
