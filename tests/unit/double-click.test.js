// ============================================
// Test 5: Double-click checkout protection
// Verifica que withButtonLock previene ejecucion duplicada.
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('withButtonLock — double-click protection', () => {
    let mockBtn;

    beforeEach(() => {
        mockBtn = {
            id: 'btnTest',
            disabled: false,
            innerHTML: 'Original Text',
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
            },
        };

        globalThis.document = {
            getElementById: vi.fn((id) => {
                if (id === 'btnTest') return mockBtn;
                return null;
            }),
        };
    });

    it('ejecuta la funcion una vez en click normal', async () => {
        const fn = vi.fn(async () => 'done');
        const locked = withButtonLock('btnTest', fn, 'Cargando...');
        await locked();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('previene doble ejecucion en double-click rapido', async () => {
        const fn = vi.fn(async () => {
            await new Promise(r => setTimeout(r, 100));
        });
        const locked = withButtonLock('btnTest', fn, 'Cargando...');

        // Disparar dos clicks sin esperar al primero
        const click1 = locked();
        const click2 = locked(); // btn ya esta disabled

        await Promise.all([click1, click2]);

        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('triple-click rapido: solo ejecuta una vez', async () => {
        const execCount = [];
        const fn = vi.fn(async () => {
            execCount.push('exec');
            await new Promise(r => setTimeout(r, 50));
        });
        const locked = withButtonLock('btnTest', fn);

        await Promise.all([locked(), locked(), locked()]);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(execCount).toEqual(['exec']);
    });

    it('re-habilita el boton despues de completar', async () => {
        const fn = vi.fn(async () => 'ok');
        const locked = withButtonLock('btnTest', fn);
        await locked();

        expect(mockBtn.disabled).toBe(false);
        expect(mockBtn.innerHTML).toBe('Original Text');
        expect(mockBtn.classList.remove).toHaveBeenCalledWith('opacity-50', 'cursor-not-allowed');
    });

    it('re-habilita el boton incluso si la funcion lanza error', async () => {
        const fn = vi.fn(async () => { throw new Error('boom'); });
        const locked = withButtonLock('btnTest', fn);

        // withButtonLock no atrapa el error, lo propaga
        await expect(locked()).rejects.toThrow('boom');

        expect(mockBtn.disabled).toBe(false);
        expect(mockBtn.innerHTML).toBe('Original Text');
    });

    it('retorna undefined si el boton no existe', async () => {
        const fn = vi.fn(async () => 'should not run');
        const locked = withButtonLock('btnNoExiste', fn);
        const result = await locked();

        expect(result).toBeUndefined();
        expect(fn).not.toHaveBeenCalled();
    });

    it('muestra spinner y texto de carga durante ejecucion', async () => {
        let capturedHTML = '';
        const fn = vi.fn(async () => {
            capturedHTML = mockBtn.innerHTML;
            await new Promise(r => setTimeout(r, 10));
        });
        const locked = withButtonLock('btnTest', fn, 'Procesando...');
        await locked();

        expect(capturedHTML).toContain('Procesando...');
        expect(capturedHTML).toContain('animate-spin');
    });
});
