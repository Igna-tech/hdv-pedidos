// ============================================
// HDV Sanitizer - Prevencion XSS
// Escapa caracteres peligrosos en strings antes de inyeccion en DOM.
// Se carga ANTES de cualquier script de UI.
// Uso: escapeHTML(variable)
// ============================================

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') str = String(str);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
