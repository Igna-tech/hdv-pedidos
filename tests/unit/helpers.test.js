// ============================================
// Tests: debounce, throttle — Control de flujo
// Usados en busqueda, realtime, scroll por toda la app.
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
    vi.useFakeTimers();
});

describe('debounce', () => {
    it('ejecuta la funcion despues del delay', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 300);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(300);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('reinicia el timer en invocaciones rapidas', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 300);

        debounced();
        vi.advanceTimersByTime(200);
        debounced(); // reinicia
        vi.advanceTimersByTime(200);

        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('pasa los argumentos correctos', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced('a', 'b');
        vi.advanceTimersByTime(100);

        expect(fn).toHaveBeenCalledWith('a', 'b');
    });

    it('solo ejecuta la ultima invocacion', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced(1);
        debounced(2);
        debounced(3);
        vi.advanceTimersByTime(100);

        expect(fn).toHaveBeenCalledOnce();
        expect(fn).toHaveBeenCalledWith(3);
    });
});

describe('throttle', () => {
    it('ejecuta inmediatamente la primera invocacion', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 300);

        throttled();
        expect(fn).toHaveBeenCalledOnce();
    });

    it('ignora invocaciones dentro del periodo de throttle', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 300);

        throttled();
        throttled();
        throttled();

        expect(fn).toHaveBeenCalledOnce();
    });

    it('permite nueva ejecucion despues del periodo', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 300);

        throttled();
        vi.advanceTimersByTime(300);
        throttled();

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('pasa los argumentos correctos', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled('x', 'y');
        expect(fn).toHaveBeenCalledWith('x', 'y');
    });
});
