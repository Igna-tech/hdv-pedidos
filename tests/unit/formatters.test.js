// ============================================
// Tests: Formateadores y generadores SIFEN
// Errores aqui afectan facturacion y compliance tributario.
// ============================================

import { describe, it, expect } from 'vitest';

// --- calcularDesgloseIVA ---

describe('calcularDesgloseIVA', () => {
    it('calcula IVA 10% correctamente (precio con IVA incluido)', () => {
        const items = [{ subtotal: 110000, tipo_impuesto: '10' }];
        const result = calcularDesgloseIVA(items);

        expect(result.totalGravada10).toBe(110000);
        expect(result.liqIva10).toBe(Math.round(110000 / 11)); // 10000
        expect(result.totalExentas).toBe(0);
        expect(result.totalGravada5).toBe(0);
        expect(result.liqIva5).toBe(0);
        expect(result.total).toBe(110000);
    });

    it('calcula IVA 5% correctamente', () => {
        const items = [{ subtotal: 210000, tipo_impuesto: '5' }];
        const result = calcularDesgloseIVA(items);

        expect(result.totalGravada5).toBe(210000);
        expect(result.liqIva5).toBe(Math.round(210000 / 21)); // 10000
        expect(result.totalGravada10).toBe(0);
    });

    it('maneja items exentos', () => {
        const items = [{ subtotal: 50000, tipo_impuesto: 'exenta' }];
        const result = calcularDesgloseIVA(items);

        expect(result.totalExentas).toBe(50000);
        expect(result.liqIva5).toBe(0);
        expect(result.liqIva10).toBe(0);
        expect(result.totalIva).toBe(0);
    });

    it('maneja tipo_impuesto "0" como exenta', () => {
        const items = [{ subtotal: 30000, tipo_impuesto: '0' }];
        const result = calcularDesgloseIVA(items);

        expect(result.totalExentas).toBe(30000);
    });

    it('default a 10% cuando tipo_impuesto no esta definido', () => {
        const items = [{ subtotal: 55000 }];
        const result = calcularDesgloseIVA(items);

        expect(result.totalGravada10).toBe(55000);
        expect(result.liqIva10).toBe(Math.round(55000 / 11));
    });

    it('calcula mix de tipos de impuesto', () => {
        const items = [
            { subtotal: 110000, tipo_impuesto: '10' },
            { subtotal: 210000, tipo_impuesto: '5' },
            { subtotal: 50000, tipo_impuesto: 'exenta' },
        ];
        const result = calcularDesgloseIVA(items);

        expect(result.totalExentas).toBe(50000);
        expect(result.totalGravada5).toBe(210000);
        expect(result.totalGravada10).toBe(110000);
        expect(result.liqIva5).toBe(Math.round(210000 / 21));
        expect(result.liqIva10).toBe(Math.round(110000 / 11));
        expect(result.totalIva).toBe(result.liqIva5 + result.liqIva10);
        expect(result.total).toBe(370000);
    });

    it('retorna ceros para array vacio', () => {
        const result = calcularDesgloseIVA([]);

        expect(result.totalExentas).toBe(0);
        expect(result.totalGravada5).toBe(0);
        expect(result.totalGravada10).toBe(0);
        expect(result.totalIva).toBe(0);
        expect(result.total).toBe(0);
    });

    it('maneja multiples items del mismo tipo', () => {
        const items = [
            { subtotal: 50000, tipo_impuesto: '10' },
            { subtotal: 30000, tipo_impuesto: '10' },
            { subtotal: 20000, tipo_impuesto: '10' },
        ];
        const result = calcularDesgloseIVA(items);

        expect(result.totalGravada10).toBe(100000);
        expect(result.liqIva10).toBe(Math.round(100000 / 11));
    });
});

// --- calcularDesglose (wrapper para contabilidad) ---

describe('calcularDesglose', () => {
    it('usa desglose guardado cuando existe en pedido', () => {
        const pedido = {
            desgloseIVA: {
                totalExentas: 10000,
                totalGravada5: 20000,
                liqIva5: 952,
                totalGravada10: 70000,
                liqIva10: 6364,
                totalIva: 7316,
            },
        };
        const result = calcularDesglose(100000, pedido);

        expect(result.exentas).toBe(10000);
        expect(result.gravada5).toBe(20000);
        expect(result.iva5).toBe(952);
        expect(result.gravada10).toBe(70000);
        expect(result.iva10).toBe(6364);
        expect(result.totalIva).toBe(7316);
        expect(result.total).toBe(100000);
    });

    it('calcula fallback 10% cuando no hay desglose', () => {
        const result = calcularDesglose(110000, {});

        expect(result.exentas).toBe(0);
        expect(result.gravada5).toBe(0);
        expect(result.gravada10).toBe(Math.round(110000 / 1.10)); // 100000
        expect(result.iva10).toBe(110000 - Math.round(110000 / 1.10)); // 10000
        expect(result.total).toBe(110000);
    });

    it('calcula fallback cuando pedido es null', () => {
        const result = calcularDesglose(55000, null);

        expect(result.gravada10).toBe(Math.round(55000 / 1.10));
        expect(result.total).toBe(55000);
    });
});

// --- generarNumeroFactura ---

describe('generarNumeroFactura', () => {
    it('retorna formato 001-001-NNNNNNN', () => {
        const num = generarNumeroFactura();
        expect(num).toMatch(/^001-001-\d{7}$/);
    });

    it('genera numeros diferentes en llamadas consecutivas', () => {
        const numeros = new Set();
        for (let i = 0; i < 20; i++) {
            numeros.add(generarNumeroFactura());
        }
        // Al menos la mitad deberian ser distintos (probabilidad altisima)
        expect(numeros.size).toBeGreaterThan(10);
    });
});

// --- generarCDC ---

describe('generarCDC', () => {
    it('retorna exactamente 44 digitos', () => {
        const cdc = generarCDC();
        expect(cdc).toHaveLength(44);
    });

    it('contiene solo digitos', () => {
        const cdc = generarCDC();
        expect(cdc).toMatch(/^\d{44}$/);
    });

    it('genera CDCs diferentes', () => {
        const cdcs = new Set();
        for (let i = 0; i < 10; i++) {
            cdcs.add(generarCDC());
        }
        expect(cdcs.size).toBeGreaterThan(5);
    });
});

// --- formatearFechaArchivo ---

describe('formatearFechaArchivo', () => {
    it('retorna formato YYYY-MM-DD_HHMM', () => {
        const result = formatearFechaArchivo();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{4}$/);
    });
});
