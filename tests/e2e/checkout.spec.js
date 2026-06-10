// ============================================
// E2E: Flujo de checkout del vendedor
// Cubre: estructura de carrito, botones de procesado,
//        tabs de navegacion, modal de factura
// ============================================

import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'sb-ngtoshttgnfgbiurnrix-auth-token';

const FAKE_SESSION = {
    access_token: 'fake-token-vendedor',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'fake-refresh-vend',
    user: {
        id: 'vendedor-user-id',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'vendedor@hdv.com',
        email_confirmed_at: '2026-01-01T00:00:00Z',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z'
    }
};

const CATALOGO_MOCK = [
    {
        producto_id: 'prod-1',
        producto_nombre: 'Aceite Cocimax',
        categoria_id: 'aceites',
        subcategoria: null,
        imagen_url: null,
        estado: 'disponible',
        oculto: false,
        tipo_impuesto: 'iva_10',
        variante_id: 'var-1',
        nombre_variante: '1 Litro',
        precio: 15000,
        costo: 0,
        stock: 100,
        variante_activa: true,
    },
];

const CLIENTES_MOCK = [
    { id: 'cli-1', nombre: 'Supermercado Norte', ruc: '123456-7', telefono: '0981123456', zona: 'norte', tipo: 'mayorista_estandar', oculto: false },
];

function injectVendedorSession(page) {
    const payload = JSON.stringify(FAKE_SESSION);
    return page.addInitScript(({ key, val }) => {
        localStorage.setItem(key, val);
    }, { key: STORAGE_KEY, val: payload });
}

function setupVendedorMocks(page) {
    page.addInitScript(({ catalogo, clientes }) => {
        localStorage.setItem('hdv_catalogo_local', JSON.stringify({ categorias: [{ id: 'aceites', nombre: 'Aceites', subcategorias: [] }], productos: catalogo, clientes }));
        localStorage.setItem('hdv_pedidos', JSON.stringify([]));
        localStorage.setItem('hdv_user_rol', 'vendedor');
        localStorage.setItem('hdv_user_email', 'vendedor@hdv.com');
        localStorage.setItem('hdv_user_nombre', 'Vendedor HDV');
    }, { catalogo: CATALOGO_MOCK, clientes: CLIENTES_MOCK });

    return page.route('**/*supabase*/**', (route) => {
        const url = route.request().url();

        if (url.includes('/auth/v1/')) {
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ access_token: FAKE_SESSION.access_token, token_type: 'bearer', expires_in: 3600, expires_at: FAKE_SESSION.expires_at, refresh_token: FAKE_SESSION.refresh_token, user: FAKE_SESSION.user })
            });
        }
        if (url.includes('rpc/obtener_mi_rol')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify('vendedor') });
        }
        if (url.includes('rpc/obtener_rol_usuario')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ rol: 'vendedor', nombre_completo: 'Vendedor HDV', activo: true }]) });
        }
        if (url.includes('rpc/verificar_estado_cuenta')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(true) });
        }
        if (url.includes('rpc/obtener_catalogo_seguro')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(CATALOGO_MOCK) });
        }
        if (url.includes('/rest/v1/clientes_vendedor') || url.includes('/rest/v1/clientes')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(CLIENTES_MOCK) });
        }
        if (url.includes('/rest/v1/pedidos')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
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

test.describe('App vendedor — estructura y navegacion', () => {

    test.beforeEach(async ({ page }) => {
        await injectVendedorSession(page);
        await setupVendedorMocks(page);
    });

    test('carga index.html sin errores JS criticos', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('/index.html');
        await page.waitForTimeout(4000);

        const criticalErrors = errors.filter(e =>
            !e.includes('Failed to fetch') &&
            !e.includes('NetworkError') &&
            !e.includes('WebSocket') &&
            !e.includes('AbortError') &&
            !e.includes('realtime')
        );
        expect(criticalErrors).toEqual([]);
    });

    test('tabs de navegacion existen (lista, pedidos, caja, metas)', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForTimeout(3000);

        // Tabs usan data-action="cambiarVistaVendedor" con data-arg
        const tabLista   = page.locator('[data-action="cambiarVistaVendedor"][data-arg="lista"]');
        const tabPedidos = page.locator('[data-action="cambiarVistaVendedor"][data-arg="pedidos"]');

        await expect(tabLista).toBeAttached({ timeout: 5000 });
        await expect(tabPedidos).toBeAttached({ timeout: 5000 });
    });

    test('boton del carrito existe (FAB)', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForTimeout(3000);

        const cartBtn = page.locator('[data-action="mostrarModalCarrito"]');
        await expect(cartBtn).toBeAttached({ timeout: 5000 });
    });

    test('contador de items del carrito inicia en 0', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForTimeout(3000);

        const badge = page.locator('#cartItems');
        await expect(badge).toBeAttached({ timeout: 5000 });
        const text = await badge.textContent();
        expect(text.trim()).toBe('0');
    });

    test('selector de cliente existe en el header', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForTimeout(3000);

        const clienteSelect = page.locator('#clienteSelect');
        await expect(clienteSelect).toBeAttached({ timeout: 5000 });
    });
});

test.describe('App vendedor — checkout buttons', () => {

    test.beforeEach(async ({ page }) => {
        await injectVendedorSession(page);
        await setupVendedorMocks(page);
    });

    test('al abrir carrito aparece el modal con botones de checkout', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForTimeout(3000);

        // Abrir modal del carrito
        const cartBtn = page.locator('[data-action="mostrarModalCarrito"]');
        await expect(cartBtn).toBeAttached({ timeout: 5000 });
        await cartBtn.click();
        await page.waitForTimeout(1500);

        // Los 3 botones de checkout deben estar presentes (aunque deshabilitados sin items)
        const btnPedido  = page.locator('[data-action="procesarPedido"]');
        const btnInterno = page.locator('[data-action="procesarCobroInterno"]');
        const btnFactura = page.locator('[data-action="procesarFacturaMock"]');

        await expect(btnPedido).toBeAttached({ timeout: 5000 });
        await expect(btnInterno).toBeAttached({ timeout: 5000 });
        await expect(btnFactura).toBeAttached({ timeout: 5000 });
    });

    test('tab de pedidos muestra lista de pedidos (vacia o con datos)', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForTimeout(3000);

        const tabPedidos = page.locator('[data-action="cambiarVistaVendedor"][data-arg="pedidos"]');
        await expect(tabPedidos).toBeAttached({ timeout: 5000 });
        await tabPedidos.click();
        await page.waitForTimeout(1000);

        // La vista de pedidos debe estar visible
        const vistaPedidos = page.locator('#vista-pedidos');
        await expect(vistaPedidos).toBeAttached({ timeout: 5000 });
    });
});
