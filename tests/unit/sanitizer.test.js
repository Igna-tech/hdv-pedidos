// ============================================
// Tests: escapeHTML() — Prevencion XSS
// Una regresion aqui es una vulnerabilidad de seguridad.
// ============================================

import { describe, it, expect } from 'vitest';

describe('escapeHTML', () => {
    it('escapa tags HTML (previene XSS basico)', () => {
        expect(escapeHTML('<script>alert(1)</script>')).toBe(
            '&lt;script&gt;alert(1)&lt;/script&gt;'
        );
    });

    it('escapa los 5 caracteres peligrosos', () => {
        expect(escapeHTML('a&b<c>d"e\'f')).toBe(
            'a&amp;b&lt;c&gt;d&quot;e&#039;f'
        );
    });

    it('retorna string vacio para null', () => {
        expect(escapeHTML(null)).toBe('');
    });

    it('retorna string vacio para undefined', () => {
        expect(escapeHTML(undefined)).toBe('');
    });

    it('convierte numeros a string', () => {
        expect(escapeHTML(12345)).toBe('12345');
    });

    it('convierte booleanos a string', () => {
        expect(escapeHTML(true)).toBe('true');
    });

    it('retorna string vacio para string vacio', () => {
        expect(escapeHTML('')).toBe('');
    });

    it('no modifica texto seguro', () => {
        expect(escapeHTML('Hola Mundo 123')).toBe('Hola Mundo 123');
    });

    it('escapa inyeccion en atributos HTML', () => {
        expect(escapeHTML('" onmouseover="alert(1)')).toBe(
            '&quot; onmouseover=&quot;alert(1)'
        );
    });

    it('escapa multiples ocurrencias del mismo caracter', () => {
        expect(escapeHTML('<<>>')).toBe('&lt;&lt;&gt;&gt;');
    });

    it('maneja strings con caracteres Unicode', () => {
        expect(escapeHTML('Precio: ₲50.000 <oferta>')).toBe(
            'Precio: ₲50.000 &lt;oferta&gt;'
        );
    });
});
