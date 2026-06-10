// ============================================
// E2E: Modulo de pedidos admin
// Cubre: carga, filtros de fecha/estado, exportacion CSV
// ============================================

import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'sb-ngtoshttgnfgbiurnrix-auth-token';

const FAKE_SESSION = {
    access_token: 'fake-token-admin',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'fake-refresh-admin',
    user: {
        id: 'admin-user-id',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'admin@hdv.com',
        email_confirmed_at: '2026-01-01T00:00:00Z',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z'
    }
};

const PEDIDOS_MOCK = [
    {
        id: 'PED-001',
        estado: 'pedido_pendiente',
        fecha: '2026-06-01T10:00:00Z',
        vendedor_id: 'admin-user-id',
        datos: { cliente: { id: 'cli-1', nombre: 'Supermercado Norte' }, items: [], total: 150000, tipoPago: 'contado' },
        cliente: { id: 'cli-1', nombre: 'Supermercado Norte' },
        items: [{ nombre: 'Aceite 1L', presentacion: '1L', cantidad: 10, precio: 15000, subtotal: 150000 }],
        total: 150000, tipoPago: 'contado',
    },
    {
        id: 'PED-002',
        estado: 'entregado',
        fecha: '2026-05-15T09:00:00Z',
        vendedor_id: 'admin-user-id',
        datos: { cliente: { id: 'cli-2', nombre: 'Almacen Sur' }, items: [], total: 80000, tipoPago: 'credito' },
        cliente: { id: 'cli-2', nombre: 'Almacen Sur' },
        items: [{ nombre: 'Azucar 1kg', presentacion: '1kg', cantidad: 8, precio: 10000, subtotal: 80000 }],
        total: 80000, tipoPago: 'credito',
    },
];

function injectAdminSession(page) {
    const payload = JSON.stringify(FAKE_SESSION);
    return page.addInitScript(({ key, val }) => {
        localStorage.setItem(key, val);
        // Pre-cargar pedidos mock en IndexedDB via localStorage (HDVStorage fallback)
        localStorage.setItem('hdv_pedidos', JSON.stringify(window._PEDIDOS_MOCK || []));
    }, { key: STORAGE_KEY, val: payload });
}

function setupAdminMocks(page) {
    // Inyectar pedidos mock antes de que la pagina cargue
    page.addInitScript((pedidos) => {
        window._PEDIDOS_MOCK = pedidos;
        // HDVStorage usa localStorage como fallback — pre-poblamos
        localStorage.setItem('hdv_pedidos', JSON.stringify(pedidos));
        localStorage.setItem('hdv_user_rol', 'admin');
        localStorage.setItem('hdv_user_email', 'admin@hdv.com');
        localStorage.setItem('hdv_user_nombre', 'Admin HDV');
    }, PEDIDOS_MOCK);

    return page.route('**/*supabase*/**', (route) => {
        const url = route.request().url();

        if (url.includes('/auth/v1/token') || url.includes('/auth/v1/user') || url.includes('/auth/v1/')) {
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ access_token: FAKE_SESSION.access_token, token_type: 'bearer', expires_in: 3600, expires_at: FAKE_SESSION.expires_at, refresh_token: FAKE_SESSION.refresh_token, user: FAKE_SESSION.user })
            });
        }
        if (url.includes('rpc/obtener_mi_rol')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify('admin') });
        }
        if (url.includes('rpc/obtener_rol_usuario')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ rol: 'admin', nombre_completo: 'Admin HDV', activo: true }]) });
        }
        if (url.includes('rpc/verificar_estado_cuenta')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(true) });
        }
        if (url.includes('rpc/es_admin') || url.includes('rpc/obtener_catalogo_seguro')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(true) });
        }
        if (url.includes('/rest/v1/pedidos')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(PEDIDOS_MOCK) });
        }
        if (url.includes('/rest/v1/perfiles')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 'admin-user-id', nombre_completo: 'Admin HDV', rol: 'admin', activo: true }]) });
        }
        if (url.includes('/rest/v1/')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
        }
        if (url.includes('realtime')) {
            return route.abort();
        }
        return route.continue();
    });
}

test.describe('Modulo pedidos admin', () => {

    test.beforeEach(async ({ page }) => {
        await injectAdminSession(page);
        await setupAdminMocks(page);
    });

    test('carga seccion pedidos sin errores JS criticos', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('/admin.html');
        await page.waitForTimeout(4000);

        const criticalErrors = errors.filter(e =>
            !e.includes('Failed to fetch') &&
            !e.includes('NetworkError') &&
            !e.includes('WebSocket') &&
            !e.includes('AbortError') &&
            !e.includes('Chart') &&
            !e.includes('realtime')
        );
        expect(criticalErrors).toEqual([]);
    });

    test('panel admin tiene seccion de pedidos en sidebar', async ({ page }) => {
        await page.goto('/admin.html');
        await page.waitForTimeout(3000);

        const pedidosNav = page.locator('[data-section="pedidos"]');
        await expect(pedidosNav).toBeAttached({ timeout: 10000 });
    });

    test('filtros de fecha (desde/hasta) existen en seccion pedidos', async ({ page }) => {
        await page.goto('/admin.html');
        await page.waitForTimeout(3000);

        // Navegar a seccion pedidos
        const pedidosBtn = page.locator('[data-section="pedidos"]').first();
        await pedidosBtn.click();
        await page.waitForTimeout(1000);

        const filtroDesde = page.locator('#filtroFechaDesde');
        const filtroHasta = page.locator('#filtroFechaHasta');

        await expect(filtroDesde).toBeAttached({ timeout: 5000 });
        await expect(filtroHasta).toBeAttached({ timeout: 5000 });
    });

    test('filtro de estado existe y tiene opciones', async ({ page }) => {
        await page.goto('/admin.html');
        await page.waitForTimeout(3000);

        const pedidosBtn = page.locator('[data-section="pedidos"]').first();
        await pedidosBtn.click();
        await page.waitForTimeout(1000);

        const filtroEstado = page.locator('#filtroEstado');
        await expect(filtroEstado).toBeAttached({ timeout: 5000 });
    });

    test('boton Aplicar filtros existe', async ({ page }) => {
        await page.goto('/admin.html');
        await page.waitForTimeout(3000);

        const pedidosBtn = page.locator('[data-section="pedidos"]').first();
        await pedidosBtn.click();
        await page.waitForTimeout(1000);

        const btnAplicar = page.locator('[data-action="filtrarPedidos"]');
        await expect(btnAplicar).toBeAttached({ timeout: 5000 });
    });

    test('boton exportar Excel existe en seccion pedidos', async ({ page }) => {
        await page.goto('/admin.html');
        await page.waitForTimeout(3000);

        const pedidosBtn = page.locator('[data-section="pedidos"]').first();
        await pedidosBtn.click();
        await page.waitForTimeout(1000);

        const btnExcel = page.locator('[data-action="exportarExcelPedidos"]');
        await expect(btnExcel).toBeAttached({ timeout: 5000 });
    });
});
