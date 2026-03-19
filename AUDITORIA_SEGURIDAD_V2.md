# AUDITORIA DE SEGURIDAD V2 - HDV Distribuciones
**Fecha:** 2026-03-19
**Auditor:** Claude Opus 4.6 (Red Team / AppSec)
**Metodologia:** Analisis de flujos de aplicacion, PWA, persistencia local, logica de negocio
**Alcance:** SyncManager, checkout, Service Worker, IndexedDB, sesiones JWT, innerHTML XSS
**Notion:** https://www.notion.so/32848624596e81988df7d67230711068

---

## RESUMEN EJECUTIVO

| Severidad | Cantidad |
|-----------|----------|
| CRITICO   | 1        |
| ALTO      | 3        |
| MEDIO     | 4        |
| BAJO      | 1        |
| **Total** | **9**    |

> La vulnerabilidad mas grave es la **ausencia total de validacion server-side de precios** en pedidos. Un vendedor puede manipular IndexedDB/consola para enviar pedidos con precios arbitrarios (incluso 0) y el servidor los acepta sin verificar contra el catalogo.

---

## CRITICO

### V2-C01: Sin validacion server-side de precios en pedidos — manipulacion de totales ✅ REMEDIADO 2026-03-19

**Archivos:** `checkout.js:93-108`, `services/supabase.js:46-69`, `js/vendedor/cart.js:39-59`
**Impacto:** Perdida financiera directa. Un vendedor puede facturar productos a precio 0.

Cuando un vendedor crea un pedido, los precios vienen directamente del carrito en memoria/IndexedDB. El campo `datos` JSONB se envia integro al servidor via `upsertPedido()`, que hace un `supabase.from('pedidos').upsert(row)` sin ninguna validacion de que los precios coincidan con `producto_variantes.precio`.

**Vector de ataque:**
1. Vendedor abre DevTools → Application → IndexedDB → `HDV_ERP_DB` → `keyval`
2. Modifica el carrito: cambia `precio: 150000` a `precio: 1` en cualquier item
3. Ejecuta checkout → pedido se guarda con total manipulado
4. `SyncManager` sube el pedido a Supabase tal cual
5. Admin ve el pedido con precios falsos, lo factura, la empresa pierde dinero

**Prueba de concepto (consola del navegador):**
```javascript
// Modificar carrito en memoria antes de checkout
carrito[0].precio = 1;
carrito[0].subtotal = 1;
```

**Solucion implementada (flag silencioso):**
Trigger `trg_validar_precios` con funcion `validar_precios_pedido()` que NO lanza excepcion. En su lugar:
1. Detecta items con precio < 50% del catalogo (`producto_variantes.precio`)
2. Inyecta `alerta_fraude: true` + `fraude_detalle` (array con producto, precio enviado vs catalogo) + `fraude_fecha` en el JSONB `datos` del pedido
3. Fuerza `estado = 'pedido_pendiente'` para bloquear facturacion automatica
4. El pedido se guarda exitosamente — el Admin ve la alerta en su panel y decide

---

## ALTO

### V2-A01: SyncManager no diferencia errores de autenticacion vs red ✅ REMEDIADO 2026-03-19

**Archivo:** `js/services/sync.js:38-58`
**Impacto:** Pedidos quedan en IndexedDB con `sincronizado: false` indefinidamente sin feedback al usuario.

Cuando el JWT expira mientras el vendedor esta offline, `SyncManager` recibe `{ success: false }` de `guardarPedido()` pero lo trata igual que un error de red. No hay intento de re-autenticacion ni aviso al usuario de que su sesion expiro.

Supabase tiene `autoRefreshToken: true` (supabase-init.js:14), pero si tanto el access token como el refresh token expiran (>7 dias offline), el sync falla silenciosamente.

**Solucion:**
```javascript
// En sync.js, dentro del loop de pedidos:
const ok = await guardarPedido(pedido);
if (!ok) {
    // Detectar si es error de auth
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        console.warn('[SyncManager] Sesion expirada, requiere re-login');
        if (typeof mostrarToast === 'function') {
            mostrarToast('Sesion expirada. Inicie sesion nuevamente.', 'error');
        }
        break; // No reintentar mas pedidos con token muerto
    }
    failed++;
}
```

---

### V2-A02: `new Function()` en admin.js — ejecucion dinamica de codigo ✅ REMEDIADO 2026-03-19

**Archivo:** `admin.js:82`
**Impacto:** Si un futuro desarrollador omite `escapeHTML()` al escribir un `data-action`, se abre inyeccion de codigo.

El handler de event delegation para `data-action` usa `new Function(action)()`. Actualmente protegido por `escapeHTML()` en la escritura del atributo (linea 73), pero el patron es intrinsecamente peligroso.

**Solucion — dispatcher por whitelist:**
```javascript
const ACTION_DISPATCH = {
    "cambiarSeccion('productos')": () => cambiarSeccion('productos'),
    "cambiarSeccion('clientes')": () => cambiarSeccion('clientes'),
    // ... registrar cada accion valida
};
document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (btn) {
        const action = btn.getAttribute('data-action');
        if (ACTION_DISPATCH[action]) ACTION_DISPATCH[action]();
        else console.warn('Accion no registrada:', action);
    }
});
```

---

### V2-A03: IndexedDB sin aislamiento por usuario — fuga de datos en dispositivo compartido ✅ REMEDIADO 2026-03-19

**Archivos:** `js/utils/storage.js`, `guard.js:62-69`
**Impacto:** En dispositivos compartidos, el siguiente usuario puede ver todos los pedidos y clientes del usuario anterior.

IndexedDB usa un unico store (`HDV_ERP_DB/keyval`) para todos los usuarios. Cuando un vendedor cierra sesion, `guard.js` solo limpia `hdv_user_rol/email/nombre` pero NO limpia `hdv_pedidos`, `hdv_catalogo_local`, `hdv_carrito_*`.

**Solucion:**
```javascript
// En guard.js, handler SIGNED_OUT:
async function limpiarDatosLocales() {
    const keysToClean = await HDVStorage.keys('hdv_');
    for (const key of keysToClean) {
        if (!key.startsWith('hdv_darkmode')) {
            await HDVStorage.removeItem(key);
        }
    }
    console.log('[Guard] Datos locales limpiados en logout');
}
```

---

## MEDIO

### V2-M01: Backups exportan datos sensibles sin cifrar

**Archivos:** `app.js:507-540` (vendedor), `admin.js:350-393` (admin)
**Impacto:** Vendedor puede descargar y compartir base de clientes completa (RUC, telefono, precios de costo).

**Solucion:** Filtrar campos sensibles (costo, precios_personalizados, RUC parcial) en el export del vendedor. Solo admin exporta datos completos.

---

### V2-M02: Service Worker sin validacion de integridad de respuestas ✅ REMEDIADO 2026-03-19

**Archivo:** `service-worker.js:141-158`
**Impacto:** En red comprometida, MITM podria cachear JS malicioso (mitigado por HTTPS/Vercel).

**Solucion:** Agregar CSP header en `vercel.json` (documentado en B-03 de AUDITORIA V1).

---

### V2-M03: `window.hdvUsuario` modificable — bypass de UI admin

**Archivo:** `guard.js:44-49`
**Impacto:** Vendedor puede ver interfaz admin (dashboard KPIs), pero RLS bloquea escrituras.

**Solucion:** Verificacion periodica del rol server-side en admin.js init.

---

### V2-M04: `escapeHTML()` es unica barrera XSS — sin CSP como respaldo ✅ REMEDIADO 2026-03-19

**Archivos:** 15 archivos JS, 194 usos de innerHTML
**Estado:** TODOS los usos verificados — `escapeHTML()` aplicado correctamente en cada caso.
**Impacto:** Fragil sin defense-in-depth. Una sola omision futura abre XSS almacenado.

**Solucion:** Implementar CSP header como segunda linea de defensa.

---

## BAJO

### V2-B01: Tokens Supabase Auth en localStorage (by design)

**Archivo:** `supabase-init.js:13`
**Impacto:** JWT accesible via XSS, pero es comportamiento estandar de Supabase JS Client.
**Mitigacion:** Datos de negocio correctamente en IndexedDB. Solo tokens auth en localStorage.

---

## MATRIZ DE PRIORIDAD

| # | Severidad | Esfuerzo | Accion |
|---|-----------|----------|--------|
| V2-C01 | CRITICO | 30 min | Trigger PostgreSQL validacion de precios |
| V2-A01 | ALTO | 15 min | Detectar auth error en SyncManager + toast |
| V2-A02 | ALTO | 20 min | Reemplazar `new Function()` por dispatcher whitelist |
| V2-A03 | ALTO | 10 min | Limpiar IndexedDB en logout |
| V2-M01 | MEDIO | 20 min | Filtrar campos sensibles en backup vendedor |
| V2-M02 | MEDIO | 10 min | Agregar CSP header en vercel.json |
| V2-M03 | MEDIO | 5 min | Verificacion periodica de rol en admin.js |
| V2-M04 | MEDIO | 10 min | CSP como defense-in-depth para innerHTML |

**Recomendacion:** Ejecutar V2-C01 INMEDIATAMENTE. Un vendedor con conocimientos tecnicos basicos puede explotar esta vulnerabilidad hoy para causar perdidas financieras directas a la empresa.

---

## HALLAZGOS POSITIVOS (lo que esta bien)

- `escapeHTML()` correctamente implementada y aplicada en los 194 usos de innerHTML
- RLS server-side bloquea efectivamente forgery de `vendedor_id` y acceso no autorizado a datos
- `autoRefreshToken: true` configurado en Supabase client
- Migracion localStorage → IndexedDB correctamente implementada
- Anti-doble facturacion en Edge Function funciona correctamente
- Rate limiting en Edge Function activo (10 req/min)
- RPCs con REVOKE de anon/public ejecutado
