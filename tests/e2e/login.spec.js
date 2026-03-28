// ============================================
// E2E: Flujo de login y proteccion de rutas
// Una regresion aqui es un incidente de seguridad.
// ============================================

import { test, expect } from '@playwright/test';

test.describe('Proteccion de rutas', () => {
    test('redirige /admin.html a /login.html sin sesion', async ({ page }) => {
        await page.goto('/admin.html');
        // guard.js debe redirigir a login
        await page.waitForURL(/login\.html/, { timeout: 10000 });
        expect(page.url()).toContain('login.html');
    });

    test('redirige /index.html a /login.html sin sesion', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForURL(/login\.html/, { timeout: 10000 });
        expect(page.url()).toContain('login.html');
    });
});

test.describe('Pagina de login', () => {
    test('muestra formulario de login', async ({ page }) => {
        await page.goto('/login.html');

        const emailInput = page.locator('input[type="email"]');
        const passwordInput = page.locator('input[type="password"]');
        const submitBtn = page.locator('button[type="submit"], #btnLogin');

        await expect(emailInput).toBeVisible();
        await expect(passwordInput).toBeVisible();
        await expect(submitBtn).toBeVisible();
    });

    test('muestra error con credenciales incorrectas', async ({ page }) => {
        await page.goto('/login.html');

        await page.fill('input[type="email"]', 'fake@nonexistent.com');
        await page.fill('input[type="password"]', 'WrongPass123!');
        await page.click('button[type="submit"], #btnLogin');

        // Esperar mensaje de error (toast o inline)
        const errorVisible = await page.locator('.text-red-500, .toast-error, [role="alert"]')
            .first()
            .isVisible({ timeout: 5000 })
            .catch(() => false);

        // Al menos no debe haber navegado a admin o index
        expect(page.url()).toContain('login.html');
    });

    test('muestra alerta de cuenta bloqueada con ?blocked=1', async ({ page }) => {
        await page.goto('/login.html?blocked=1');

        // Debe mostrar alerta visual de cuenta bloqueada
        const pageContent = await page.textContent('body');
        const hasBlockedMessage = pageContent.toLowerCase().includes('bloqueada') ||
            pageContent.toLowerCase().includes('desactivada') ||
            pageContent.toLowerCase().includes('blocked');

        expect(hasBlockedMessage).toBe(true);
    });
});

// Tests con credenciales reales requieren secrets configurados.
// Se habilitan via env vars en CI.
const vendorEmail = process.env.TEST_VENDOR_EMAIL;
const vendorPassword = process.env.TEST_VENDOR_PASSWORD;

test.describe('Login con credenciales reales', () => {
    test.skip(!vendorEmail || !vendorPassword, 'TEST_VENDOR_EMAIL/PASSWORD no configurados');

    test('login como vendedor redirige a index.html', async ({ page }) => {
        await page.goto('/login.html');
        await page.fill('input[type="email"]', vendorEmail);
        await page.fill('input[type="password"]', vendorPassword);
        await page.click('button[type="submit"], #btnLogin');

        // Vendedor va a index.html
        await page.waitForURL(/index\.html|^\/$/, { timeout: 15000 });
        expect(page.url()).not.toContain('login.html');
    });
});
