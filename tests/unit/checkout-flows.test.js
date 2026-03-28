// ============================================
// Tests: Checkout Flows — persistencia de los 3 flujos
// Testea la logica core de cada flujo sin dependencias DOM.
// Replica el patron de guardarPedido de checkout.js.
//
// @vitest-environment jsdom
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'fs';
import { join } from 'path';

let HDVStorage;

async function createFreshStorage() {
    let code = readFileSync(join(process.cwd(), 'js/utils/storage.js'), 'utf-8');
    code = code.replace(/^const HDVStorage/m, 'globalThis.HDVStorage');
    (0, eval)(code);
    HDVStorage = globalThis.HDVStorage;
    await HDVStorage.ready();
    // Limpiar todas las keys para aislamiento entre tests
    const allKeys = await HDVStorage.keys();
    for (const key of allKeys) await HDVStorage.removeItem(key);
    return HDVStorage;
}

// Replica la logica de persistencia de checkout.js sin DOM
async function persistirPedido(pedido) {
    const pedidos = (await HDVStorage.getItem('hdv_pedidos')) || [];
    pedidos.push(pedido);
    const persisted = await HDVStorage.setItem('hdv_pedidos', pedidos);
    return { persisted, pedidos };
}

function crearPedidoBase(overrides) {
    return {
        id: overrides.id || 'PED-test-' + Math.random().toString(36).slice(2),
        fecha: new Date().toISOString(),
        cliente: { id: 'CLI-1', nombre: 'Test Cliente', ruc: '12345-6' },
        items: [{ productoId: 'P1', nombre: 'Coca Cola', presentacion: '2L', precio: 10000, cantidad: 2, subtotal: 20000 }],
        subtotal: 20000,
        total: 20000,
        tipoPago: 'contado',
        notas: '',
        desgloseIVA: { iva10: 1818, iva5: 0, exenta: 0 },
        vendedor_id: 'vendedor-001',
        sincronizado: false,
        ...overrides,
    };
}

describe('Checkout Flujo 1: Pedido Pendiente', () => {
    beforeEach(async () => {
        HDVStorage = await createFreshStorage();
    });

    it('persiste pedido con estado PENDIENTE e ID con prefijo PED-', async () => {
        const pedido = crearPedidoBase({
            id: 'PED-aaaa-bbbb',
            estado: PEDIDO_ESTADOS.PENDIENTE,
            tipo_comprobante: 'pedido',
        });

        const { persisted } = await persistirPedido(pedido);
        expect(persisted).toBe(true);

        const stored = await HDVStorage.getItem('hdv_pedidos');
        expect(stored).toHaveLength(1);
        expect(stored[0].estado).toBe(PEDIDO_ESTADOS.PENDIENTE);
        expect(stored[0].id).toMatch(/^PED-/);
        expect(stored[0].vendedor_id).toBe('vendedor-001');
        expect(stored[0].sincronizado).toBe(false);
    });

    it('preserva pedidos existentes al agregar nuevo', async () => {
        await HDVStorage.setItem('hdv_pedidos', [{ id: 'PED-existente', estado: PEDIDO_ESTADOS.ENTREGADO, total: 5000 }]);

        const pedido = crearPedidoBase({ id: 'PED-nuevo', estado: PEDIDO_ESTADOS.PENDIENTE });
        await persistirPedido(pedido);

        const stored = await HDVStorage.getItem('hdv_pedidos');
        expect(stored).toHaveLength(2);
        expect(stored[0].id).toBe('PED-existente');
        expect(stored[1].id).toBe('PED-nuevo');
    });

    it('incluye desgloseIVA en el pedido persistido', async () => {
        const iva = { iva10: 1818, iva5: 952, exenta: 5000 };
        const pedido = crearPedidoBase({ estado: PEDIDO_ESTADOS.PENDIENTE, desgloseIVA: iva });
        await persistirPedido(pedido);

        const stored = await HDVStorage.getItem('hdv_pedidos');
        expect(stored[0].desgloseIVA).toEqual(iva);
    });

    it('conserva datos de cliente completos', async () => {
        const cliente = { id: 'CLI-99', nombre: 'Empresa SA', ruc: '80000-1', telefono: '0981123456', direccion: 'Asuncion' };
        const pedido = crearPedidoBase({ estado: PEDIDO_ESTADOS.PENDIENTE, cliente });
        await persistirPedido(pedido);

        const stored = await HDVStorage.getItem('hdv_pedidos');
        expect(stored[0].cliente).toEqual(cliente);
    });
});

describe('Checkout Flujo 2: Cobro Interno (Recibo)', () => {
    beforeEach(async () => {
        HDVStorage = await createFreshStorage();
    });

    it('persiste recibo con estado COBRADO y tipo_comprobante recibo_interno', async () => {
        const pedido = crearPedidoBase({
            id: 'REC-aaaa-bbbb',
            estado: PEDIDO_ESTADOS.COBRADO,
            tipo_comprobante: 'recibo_interno',
        });

        await persistirPedido(pedido);
        const stored = await HDVStorage.getItem('hdv_pedidos');
        expect(stored[0].estado).toBe(PEDIDO_ESTADOS.COBRADO);
        expect(stored[0].tipo_comprobante).toBe('recibo_interno');
        expect(stored[0].id).toMatch(/^REC-/);
    });

    it('total es igual a subtotal (sin descuentos)', async () => {
        const pedido = crearPedidoBase({
            id: 'REC-nodesc',
            estado: PEDIDO_ESTADOS.COBRADO,
            subtotal: 100000,
            total: 100000,
        });

        await persistirPedido(pedido);
        const stored = await HDVStorage.getItem('hdv_pedidos');
        expect(stored[0].total).toBe(stored[0].subtotal);
    });
});

describe('Checkout Flujo 3: Factura Electronica', () => {
    beforeEach(async () => {
        HDVStorage = await createFreshStorage();
    });

    it('persiste factura con estado FACTURADO, numFactura y CDC', async () => {
        const pedido = crearPedidoBase({
            id: 'FAC-aaaa-bbbb',
            estado: PEDIDO_ESTADOS.FACTURADO,
            tipo_comprobante: 'factura_electronica',
            numFactura: '001-001-0000001',
            cdc: 'CDC44DIGITOS',
        });

        await persistirPedido(pedido);
        const stored = await HDVStorage.getItem('hdv_pedidos');
        expect(stored[0].estado).toBe(PEDIDO_ESTADOS.FACTURADO);
        expect(stored[0].tipo_comprobante).toBe('factura_electronica');
        expect(stored[0].id).toMatch(/^FAC-/);
        expect(stored[0].numFactura).toBe('001-001-0000001');
        expect(stored[0].cdc).toBe('CDC44DIGITOS');
    });
});

describe('Checkout: Resiliencia ante fallos de storage', () => {
    beforeEach(async () => {
        HDVStorage = await createFreshStorage();
    });

    it('multiples pedidos concurrentes no se pierden (usa atomicUpdate)', async () => {
        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(
                HDVStorage.atomicUpdate('hdv_pedidos', (pedidos) => {
                    const arr = pedidos || [];
                    arr.push(crearPedidoBase({ id: `PED-concurrent-${i}`, estado: PEDIDO_ESTADOS.PENDIENTE }));
                    return arr;
                })
            );
        }
        await Promise.all(promises);

        const stored = await HDVStorage.getItem('hdv_pedidos');
        expect(stored).toHaveLength(5);
    });

    it('pedido se puede recuperar despues de persistir', async () => {
        const pedido = crearPedidoBase({ id: 'PED-recover', estado: PEDIDO_ESTADOS.PENDIENTE });
        await persistirPedido(pedido);

        // Simular re-lectura (como al recargar app)
        const stored = await HDVStorage.getItem('hdv_pedidos');
        const found = stored.find(p => p.id === 'PED-recover');
        expect(found).toBeTruthy();
        expect(found.total).toBe(20000);
        expect(found.items).toHaveLength(1);
    });

    it('getItem retorna copia profunda (structuredClone) — no hay race condition por referencia', async () => {
        const pedido = crearPedidoBase({ id: 'PED-clone', estado: PEDIDO_ESTADOS.PENDIENTE });
        await persistirPedido(pedido);

        const read1 = await HDVStorage.getItem('hdv_pedidos');
        const read2 = await HDVStorage.getItem('hdv_pedidos');

        // Modificar read1 no debe afectar read2
        read1[0].total = 999;
        expect(read2[0].total).toBe(20000);
    });
});
