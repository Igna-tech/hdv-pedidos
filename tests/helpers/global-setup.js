/**
 * Vitest global setup: carga las funciones globales del proyecto.
 * Los archivos fuente declaran funciones globales (no usan export).
 * Usamos indirect eval para registrarlas en el scope global del worker.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();

const filesToLoad = [
    'js/utils/constants.js',
    'js/utils/sanitizer.js',
    'js/utils/formatters.js',
    'js/utils/helpers.js',
];

for (const file of filesToLoad) {
    let code = readFileSync(join(root, file), 'utf-8');
    // Convertir const/let de nivel superior a var para que indirect eval
    // los registre en el scope global (const en eval estricto no se expone)
    code = code.replace(/^(const|let)\s+/gm, 'var ');
    (0, eval)(code);
}
