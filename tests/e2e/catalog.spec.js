// ============================================
// E2E: Carga del catalogo y navegacion basica
// Mockea Supabase Auth para bypass guard.js
// ============================================

import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'sb-ngtoshttgnfgbiurnrix-auth-token';

const FAKE_SESSION = {
    access_token: 'fake-token-abc123',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'fake-refresh-xyz',
    user: {
        id: 'test-user-id',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'test@test.com',
        email_confirmed_at: '2026-01-01T00:00:00Z',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z'
    }
};

function injectSupabaseSession(page) {
    const sessionPayload = JSON.stringify({
        access_token: FAKE_SESSION.access_token,
        token_type: FAKE_SESSION.token_type,
        expires_in: FAKE_SESSION.expires_in,
        expires_at: FAKE_SESSION.expires_at,
        refresh_token: FAKE_SESSION.refresh_token,
        user: FAKE_SESSION.user
    });
    return page.addInitScript(({ key, value }) => {
        localStorage.setItem(key, value);
    }, { key: STORAGE_KEY, value: sessionPayload });
}

function setupSupabaseMocks(page, rol = 'vendedor') {
    return page.route('**/*supabase*/**', (route) => {
        const url = route.request().url();

        if (url.includes('/auth/v1/token')) {
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ access_token: FAKE_SESSION.access_token, token_type: 'bearer', expires_in: 3600, expires_at: FAKE_SESSION.expires_at, refresh_token: FAKE_SESSION.refresh_token, user: FAKE_SESSION.user })
            });
        }

        if (url.includes('/auth/v1/user')) {
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify(FAKE_SESSION.user)
            });
        }

        if (url.includes('/auth/v1/')) {
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify({ data: { session: FAKE_SESSION, user: FAKE_SESSION.user }, error: null })
            });
        }

        if (url.includes('rpc/obtener_mi_rol')) {
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify(rol)
            });
        }

        if (url.includes('rpc/obtener_rol_usuario')) {
            return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify([{ id: 'test-user-id', nombre_completo: 'Test User', rol, activo: true }])
            });
        }

        if (url.includes('rpc/verificar_estado_cuenta')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(true) });
        }

        if (url.includes('rpc/es_admin')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rol === 'admin') });
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

test.describe('Catalogo vendedor (mocked auth)', () => {

    test.beforeEach(async ({ page }) => {
        await injectSupabaseSession(page);
        await setupSupabaseMocks(page, 'vendedor');
    });

    test('carga la pagina sin errores JS criticos', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('/index.html');
        await page.waitForTimeout(4000);

        const criticalErrors = errors.filter(e =>
            !e.includes('Failed to fetch') &&
            !e.includes('NetworkError') &&
            !e.includes('WebSocket') &&
            !e.includes('AbortError')
        );

        expect(criticalErrors).toEqual([]);
    });

    test('muestra el buscador de productos', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForTimeout(3000);

        const searchInput = page.locator('#searchInput');
        await expect(searchInput).toBeAttached();
    });

    test('muestra el selector de cliente', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForTimeout(3000);

        const clienteSelect = page.locator('#clienteSelect');
        await expect(clienteSelect).toBeAttached();
    });

    test('el badge del carrito inicia en 0', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForTimeout(3000);

        const cartBadge = page.locator('#cartItems');
        await expect(cartBadge).toBeAttached();
        const text = await cartBadge.textContent();
        expect(text).toBe('0');
    });

    test('boton de tabs existe y es clickeable', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForTimeout(3000);

        const btnPedidos = page.locator('#btn-tab-pedidos');
        await expect(btnPedidos).toBeAttached();
    });
});

test.describe('Admin panel (mocked auth)', () => {

    test.beforeEach(async ({ page }) => {
        await injectSupabaseSession(page);
        await setupSupabaseMocks(page, 'admin');
    });

    test('carga el panel admin sin errores JS criticos', async ({ page }) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('/admin.html');
        await page.locator('[onclick*="cambiarSeccion"]').first().waitFor({ state: 'attached', timeout: 15000 });

        const criticalErrors = errors.filter(e =>
            !e.includes('Failed to fetch') &&
            !e.includes('NetworkError') &&
            !e.includes('WebSocket') &&
            !e.includes('AbortError') &&
            !e.includes('Chart')
        );

        expect(criticalErrors).toEqual([]);
    });

    test('muestra el dashboard con KPIs', async ({ page }) => {
        await page.goto('/admin.html');
        const ventasMes = page.locator('#dashVentasMes');
        await expect(ventasMes).toBeAttached({ timeout: 15000 });
    });

    test('la sidebar de navegacion tiene items', async ({ page }) => {
        await page.goto('/admin.html');
        const firstNavItem = page.locator('[onclick*="cambiarSeccion"]').first();
        await expect(firstNavItem).toBeAttached({ timeout: 15000 });

        const navItems = page.locator('[onclick*="cambiarSeccion"]');
        const count = await navItems.count();
        expect(count).toBeGreaterThan(3);
    });
});
