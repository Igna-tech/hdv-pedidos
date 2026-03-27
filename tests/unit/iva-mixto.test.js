// ============================================
// Test 2: IVA mixto compliance SIFEN
// Verifica que facturas con items 5% + 10% + exenta
// cuadran perfectamente segun reglas SET Paraguay.
// ============================================

import { describe, it, expect } from 'vitest';

describe('IVA mixto — compliance SIFEN', () => {

    it('factura mixta 5% + 10% + exenta: buckets suman correctamente', () => {
        const items = [
            { subtotal: 150000, tipo_impuesto: '10' },
            { subtotal: 84000, tipo_impuesto: '5' },
            { subtotal: 25000, tipo_impuesto: 'exenta' },
            { subtotal: 55000, tipo_impuesto: '10' },
            { subtotal: 42000, tipo_impuesto: '5' },
        ];
        const r = calcularDesgloseIVA(items);
        const sumaItems = items.reduce((s, i) => s + i.subtotal, 0);

        expect(r.totalGravada10).toBe(150000 + 55000);
        expect(r.totalGravada5).toBe(84000 + 42000);
        expect(r.totalExentas).toBe(25000);
        expect(r.total).toBe(sumaItems);
    });

    it('balance SIFEN: exentas + gravada5 + gravada10 === sum(subtotals)', () => {
        const items = [
            { subtotal: 110000, tipo_impuesto: '10' },
            { subtotal: 210000, tipo_impuesto: '5' },
            { subtotal: 50000, tipo_impuesto: 'exenta' },
        ];
        const r = calcularDesgloseIVA(items);
        const sumaItems = items.reduce((s, i) => s + i.subtotal, 0);

        expect(r.totalExentas + r.totalGravada5 + r.totalGravada10).toBe(sumaItems);
        expect(r.total).toBe(sumaItems);
    });

    it('totalIva === liqIva5 + liqIva10 siempre', () => {
        const items = [
            { subtotal: 99999, tipo_impuesto: '10' },
            { subtotal: 77777, tipo_impuesto: '5' },
            { subtotal: 33333, tipo_impuesto: 'exenta' },
        ];
        const r = calcularDesgloseIVA(items);
        expect(r.totalIva).toBe(r.liqIva5 + r.liqIva10);
    });

    it('liquidacion usa Math.round (montos que producen fracciones)', () => {
        // 15500 / 11 = 1409.0909... → Math.round = 1409
        const items = [{ subtotal: 15500, tipo_impuesto: '10' }];
        const r = calcularDesgloseIVA(items);
        expect(r.liqIva10).toBe(1409);

        // 15500 / 21 = 738.0952... → Math.round = 738
        const items5 = [{ subtotal: 15500, tipo_impuesto: '5' }];
        const r5 = calcularDesgloseIVA(items5);
        expect(r5.liqIva5).toBe(738);
    });

    it('todos items exentos: totalIva === 0', () => {
        const items = [
            { subtotal: 50000, tipo_impuesto: 'exenta' },
            { subtotal: 30000, tipo_impuesto: '0' },
        ];
        const r = calcularDesgloseIVA(items);
        expect(r.totalIva).toBe(0);
        expect(r.liqIva5).toBe(0);
        expect(r.liqIva10).toBe(0);
        expect(r.totalExentas).toBe(80000);
    });

    it('montos muy grandes (999.999.999 Gs)', () => {
        const items = [
            { subtotal: 999999999, tipo_impuesto: '10' },
            { subtotal: 500000000, tipo_impuesto: '5' },
        ];
        const r = calcularDesgloseIVA(items);

        expect(r.liqIva10).toBe(Math.round(999999999 / 11));
        expect(r.liqIva5).toBe(Math.round(500000000 / 21));
        expect(r.totalIva).toBe(r.liqIva5 + r.liqIva10);
        expect(Number.isInteger(r.liqIva10)).toBe(true);
        expect(Number.isInteger(r.liqIva5)).toBe(true);
    });

    it('montos muy pequenos (100 Gs)', () => {
        const items = [
            { subtotal: 100, tipo_impuesto: '10' },
            { subtotal: 100, tipo_impuesto: '5' },
            { subtotal: 100, tipo_impuesto: 'exenta' },
        ];
        const r = calcularDesgloseIVA(items);

        expect(r.liqIva10).toBe(Math.round(100 / 11)); // 9
        expect(r.liqIva5).toBe(Math.round(100 / 21));   // 5
        expect(r.total).toBe(300);
    });

    it('factura grande (20+ items mixtos)', () => {
        const items = [];
        for (let i = 0; i < 8; i++) items.push({ subtotal: 25000 + i * 1000, tipo_impuesto: '10' });
        for (let i = 0; i < 7; i++) items.push({ subtotal: 15000 + i * 500, tipo_impuesto: '5' });
        for (let i = 0; i < 5; i++) items.push({ subtotal: 10000 + i * 200, tipo_impuesto: 'exenta' });

        const r = calcularDesgloseIVA(items);
        const sumaItems = items.reduce((s, i) => s + i.subtotal, 0);

        expect(r.total).toBe(sumaItems);
        expect(r.totalExentas + r.totalGravada5 + r.totalGravada10).toBe(sumaItems);
        expect(r.totalIva).toBe(r.liqIva5 + r.liqIva10);
        expect(items.length).toBe(20);
    });

    it('fallback calcularDesglose() sin desgloseIVA guardado', () => {
        const r = calcularDesglose(110000, {});
        expect(r.gravada10).toBe(Math.round(110000 / 1.10));
        expect(r.iva10).toBe(110000 - r.gravada10);
        expect(r.exentas).toBe(0);
        expect(r.gravada5).toBe(0);
        expect(r.total).toBe(110000);
    });

    it('fallback calcularDesglose() consistencia: gravada10 + iva10 === total', () => {
        const montos = [1000, 15500, 50000, 99999, 250000, 999999];
        for (const m of montos) {
            const r = calcularDesglose(m, null);
            expect(r.gravada10 + r.iva10).toBe(m);
        }
    });
});
