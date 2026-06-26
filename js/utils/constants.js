// ============================================
// HDV Constants - Fuente unica de verdad
// Estados, timeouts, y constantes compartidas.
// Se carga ANTES de cualquier otro script de utilidad.
// ============================================

// --- Estados de pedido ---

const PEDIDO_ESTADOS = {
    PENDIENTE: 'pedido_pendiente',
    ENTREGADO: 'entregado',
    COBRADO: 'cobrado_sin_factura',
    FACTURADO: 'facturado_mock',
    NOTA_CREDITO: 'nota_credito_mock',
    ANULADO: 'anulado'
};

// Alias legacy: 'pendiente' se trata como 'pedido_pendiente'
const ESTADOS_ALIAS = {
    'pendiente': PEDIDO_ESTADOS.PENDIENTE
};

// Estados en los que un pedido no puede ser modificado por vendedores
const ESTADOS_TERMINALES = [
    PEDIDO_ESTADOS.FACTURADO,
    PEDIDO_ESTADOS.NOTA_CREDITO,
    PEDIDO_ESTADOS.ANULADO,
    PEDIDO_ESTADOS.COBRADO,
    PEDIDO_ESTADOS.ENTREGADO
];

// --- Ciclo de vida v2: ruteo "un número, un solo lugar" (modelo ERP) ---

// Tipos de cobro registrados en el libro unificado (hdv_pagos_credito)
const COBRO_TIPOS = {
    CONTADO: 'contado',   // cobro al entregar (intención contado o crédito saldado de una)
    CREDITO: 'credito'    // cobro de un saldo pendiente (pedido en estado entregado)
};

// ACTIVOS: requieren acción del vendedor/admin. Viven en Mis Pedidos / Créditos.
const ESTADOS_ACTIVOS = [PEDIDO_ESTADOS.PENDIENTE, PEDIDO_ESTADOS.ENTREGADO];
// ARCHIVADOS: finalizados. Viven en Archivo (Ventas), solo lectura.
const ESTADOS_ARCHIVADOS = [
    PEDIDO_ESTADOS.COBRADO,
    PEDIDO_ESTADOS.FACTURADO,
    PEDIDO_ESTADOS.NOTA_CREDITO,
    PEDIDO_ESTADOS.ANULADO
];

function esEstadoActivo(estado) {
    const norm = ESTADOS_ALIAS[estado] || estado;
    return ESTADOS_ACTIVOS.includes(norm);
}
function esEstadoArchivado(estado) {
    const norm = ESTADOS_ALIAS[estado] || estado;
    return ESTADOS_ARCHIVADOS.includes(norm);
}

// Mapeo de colores por estado (Tailwind classes)
// Parametro intensidad: '700' para vendedor, '800' para admin
function obtenerEstadoUI(estado, intensidad) {
    const int = intensidad || '800';
    const normalizado = ESTADOS_ALIAS[estado] || estado;
    const mapa = {
        [PEDIDO_ESTADOS.PENDIENTE]:    { bg: 'yellow-100', label: 'PENDIENTE' },
        [PEDIDO_ESTADOS.ENTREGADO]:    { bg: 'green-100',  label: 'ENTREGADO' },
        [PEDIDO_ESTADOS.COBRADO]:      { bg: 'blue-100',   label: 'COBRADO' },
        [PEDIDO_ESTADOS.FACTURADO]:    { bg: 'indigo-100', label: 'FACTURADO' },
        [PEDIDO_ESTADOS.NOTA_CREDITO]: { bg: 'orange-100', label: 'NOTA CREDITO' },
        [PEDIDO_ESTADOS.ANULADO]:      { bg: 'red-100',    label: 'ANULADO' }
    };
    const entry = mapa[normalizado] || { bg: 'gray-100', label: (estado || '').toUpperCase() };
    const color = entry.bg.split('-')[0]; // 'yellow', 'green', etc.
    return {
        clases: 'bg-' + entry.bg + ' text-' + color + '-' + int,
        label: entry.label
    };
}

// Formatea numero_pedido como string de 7 dígitos (ej: "0000042").
// Si la empresa tiene establecimiento/punto definidos, el llamador los antepone.
// Retorna null si el pedido aún no tiene número asignado (pedido offline sin sync).
// IMPORTANTE: el número sagrado arranca en 0, por eso se compara con == null
// (no con !numero_pedido, que trataría el 0 como ausente).
function formatNumPedido(pedido) {
    if (pedido?.numero_pedido == null) return null;
    return String(pedido.numero_pedido).padStart(7, '0');
}

// Referencia visible del pedido: "#0000000" o "S/N" si aún no sincronizó (sin número).
function displayNumPedido(pedido) {
    const n = formatNumPedido(pedido);
    return n ? ('#' + n) : 'S/N';
}

// --- Timeouts y delays centralizados ---

const TIEMPOS = {
    DEBOUNCE_BUSQUEDA_MS: 300,
    DEBOUNCE_REALTIME_MS: 500,
    SYNC_DELAY_ONLINE_MS: 2000,
    SYNC_INIT_DELAY_MS: 3000,
    HEALTH_CHECK_INTERVAL_MS: 30000,
    SUPABASE_TIMEOUT_MS: 5000,
    RECONNECT_RETRY_MS: 5000,
    PAGE_RELOAD_MS: 1500,
    NAV_DELAY_MS: 500,
    BACKOFF_BASE_MS: 5000,
    BACKOFF_MAX_MS: 300000
};

// --- VAPID Public Key (Web Push — segura en frontend por diseño) ---

const VAPID_PUBLIC_KEY = 'BH5CuWpewMiYTI6BUmz5SK2Kj3DC3CvOS8opcT9kE4qu44aCgn7D9s5X6CIdc2xxgB6RKUWcPhZcIUP8nu2LlII';

// --- Umbrales de negocio ---

const MARGEN_MINIMO_PCT = 0.20; // 20% — por debajo de esto se muestra alerta de margen bajo
const STOCK_BAJO_UMBRAL = 5;   // unidades — por debajo de esto se considera stock bajo

// --- Spinner SVG compartido ---

const SPINNER_SVG = '<svg class="w-4 h-4 animate-spin inline mr-1.5" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>';
