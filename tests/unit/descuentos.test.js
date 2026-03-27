// ============================================
// Test 1: Descuentos floating-point safety
// Verifica que no hay errores de redondeo de 1 Gs
// en combinaciones precio × descuento.
// ============================================

import { describe, it, expect } from 'vitest';

const PRECIOS = [1, 100, 1000, 5000, 10000, 15500, 25000, 33333, 49999, 50000, 75000, 100000, 150000, 250000, 500000, 999999];
const DESCUENTOS = [0, 1, 2, 3, 5, 7, 10, 12.5, 15, 20, 25, 30, 33.33, 50, 100];

describe('Descuentos floating-point safety', () => {

    it('Math.round produce enteros para todas las combinaciones precio x descuento', () => {
        let combos = 0;
        for (const precio of PRECIOS) {
            for (const desc of DESCUENTOS) {
                const descuentoMonto = Math.round(precio * desc / 100);
                const total = precio - descuentoMonto;

                expect(Number.isInteger(descuentoMonto), `descuento no entero: precio=${precio}, desc=${desc}%`).toBe(true);
                expect(Number.isInteger(total), `total no entero: precio=${precio}, desc=${desc}%`).toBe(true);
                expect(total).toBeGreaterThanOrEqual(0);
                combos++;
            }
        }
        expect(combos).toBeGreaterThan(50);
    });

    it('invariante: total + descuentoMonto === subtotal', () => {
        for (const precio of PRECIOS) {
            for (const desc of DESCUENTOS) {
                const descuentoMonto = Math.round(precio * desc / 100);
                const total = precio - descuentoMonto;
                expect(total + descuentoMonto).toBe(precio);
            }
        }
    });

    it('0% descuento: total === subtotal', () => {
        for (const precio of PRECIOS) {
            const descuentoMonto = Math.round(precio * 0 / 100);
            expect(descuentoMonto).toBe(0);
            expect(precio - descuentoMonto).toBe(precio);
        }
    });

    it('100% descuento: total === 0', () => {
        for (const precio of PRECIOS) {
            const descuentoMonto = Math.round(precio * 100 / 100);
            expect(descuentoMonto).toBe(precio);
            expect(precio - descuentoMonto).toBe(0);
        }
    });

    it('descuento multi-item: aplicar sobre suma, no por item', () => {
        const items = [
            { subtotal: 15500 },
            { subtotal: 33333 },
            { subtotal: 49999 },
        ];
        const subtotal = items.reduce((s, i) => s + i.subtotal, 0); // 98832
        const desc = 12.5;
        const descuentoMonto = Math.round(subtotal * desc / 100);
        const total = subtotal - descuentoMonto;

        expect(Number.isInteger(descuentoMonto)).toBe(true);
        expect(Number.isInteger(total)).toBe(true);
        expect(total + descuentoMonto).toBe(subtotal);
        expect(total).toBeGreaterThan(0);
    });

    it('precio minimo (1 Gs) con descuentos variados', () => {
        for (const desc of [1, 10, 30, 50, 99]) {
            const descuentoMonto = Math.round(1 * desc / 100);
            const total = 1 - descuentoMonto;
            expect(total).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(total)).toBe(true);
        }
    });
});
