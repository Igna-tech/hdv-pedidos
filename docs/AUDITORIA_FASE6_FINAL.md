# Auditoria Fase 6 — Usabilidad, Poka-yoke y Ley de Fitts (Web Awesome/Shoelace)

**Fecha:** 28 de marzo de 2026
**Auditor:** Claude (Principal UX/UI Architect)
**Commit:** `497907f`
**Alcance:** Interfaz vendedor PWA — prevencion de errores, touch targets, feedback visual, sistema offline-first
**Estado final:** 99 tests en verde, 11 archivos de test, 0 regresiones

---

## 📑 Resumen Ejecutivo

La Fase 6 ejecuto la transicion de la interfaz del vendedor hacia **Web Components (Web Awesome/Shoelace)** con un enfoque estricto en **prevencion de errores (Poka-yoke)** y **Ley de Fitts** para vendedores de calle en Paraguay — celulares de gama media/baja, bajo el sol, con prisa.

**Decision arquitectonica clave:** Shoelace se aloja **100% localmente** en `assets/lib/shoelace/` (6.8MB, 2536 archivos estaticos). Cero dependencias de CDN en runtime. El Service Worker (v57) precachea los archivos core y aplica **cache-first** para los 260 chunks lazy-loaded. La app funciona completa en **modo avion** tras la primera visita.

**Impacto neto:** 6 fricciones de usabilidad resueltas (3 altas, 2 medias, 1 baja) sin romper un solo test existente.

---

## 🔴 Fricciones Altas Resueltas (Poka-yoke)

### F-01: Bloqueo de doble-tap en acciones criticas

**Problema:**
Los vendedores tocaban dos veces los botones "Cobrar" y "Emitir Factura" porque no habia feedback inmediato de que la accion estaba en progreso. Esto generaba pedidos duplicados o errores de estado.

**Solucion implementada:**
- Los 3 botones de checkout (`btnPedido`, `btnCobro`, `btnFactura`) migrados de `<button>` HTML a `<sl-button>` Web Component
- `withButtonLock()` en `helpers.js` actualizado para detectar `sl-button` y usar su atributo nativo `loading`
- Al hacer tap: el boton muestra un **spinner animado nativo** y se deshabilita automaticamente
- Al finalizar (exito o error): se restaura via `finally` block

**Codigo clave (helpers.js):**
```javascript
if (isShoelace) {
    btn.loading = true;   // Spinner nativo + deshabilita interaccion
    btn.disabled = true;
} else {
    // Fallback para botones HTML clasicos
    btn.disabled = true;
    btn.innerHTML = SPINNER_SVG + ' ' + texto;
}
```

**Archivos:** `index.html` (3 sl-button), `js/utils/helpers.js` (withButtonLock dual)

| Metrica | Antes | Despues |
|---------|-------|---------|
| Feedback al tap | 0ms (ninguno visible) | Instantaneo (spinner nativo) |
| Riesgo doble-tap | Alto | Eliminado |
| Botones afectados | 3 (Pedido, Cobro, Factura) | 3 |

---

### F-02: Botones de carrito demasiado pequenos (Ley de Fitts)

**Problema:**
Los botones +/- de cantidad en el carrito eran de **28x28px** (`w-7 h-7`). Segun la Ley de Fitts y las guias de accesibilidad tactil (WCAG 2.5.5), el **minimo recomendado es 44x44px**. Con dedos grandes bajo el sol, los vendedores erraban el toque frecuentemente.

**Solucion implementada:**
- Botones migrados de `<button class="w-7 h-7">` a `<sl-icon-button>` Web Component
- CSS custom garantiza **minimo 44x44px** via `::part(base)`:
```css
.cart-qty-btn::part(base) { min-width: 44px; min-height: 44px; }
```
- Iconos `dash-lg` y `plus-lg` (Bootstrap Icons locales) — mas visibles que el caracter "-" y "+"
- Gap entre botones aumentado de `gap-1.5` (6px) a `gap-2` (8px) para reducir mis-taps

**Archivos:** `js/vendedor/ui.js` (renderizarCarrito), `index.html` (CSS)

| Metrica | Antes | Despues | Mejora |
|---------|-------|---------|--------|
| Touch target | 28x28px | 44x44px | +57% area |
| Gap entre botones | 6px | 8px | +33% |
| Tipo de elemento | `<button>` texto | `<sl-icon-button>` SVG | Icono mas claro |

---

### F-03: Creacion de clientes sin datos obligatorios

**Problema:**
El formulario de nuevo cliente (modal vendedor) usaba `<input>` HTML sin atributos `required`. La validacion era 100% JavaScript (`if (!nombre) { mostrarToast(...) }`). Un vendedor podia enviar el formulario vacio si el toast se perdia o se ignoraba.

**Solucion implementada:**
- Inputs migrados a `<sl-input required>` Web Component
- Validacion **nativa del browser** via `reportValidity()` antes de leer valores
- Los 3 campos obligatorios (Nombre, Telefono, Zona) muestran **error visual inline** con borde rojo y mensaje descriptivo si estan vacios
- La validacion JS (`mostrarToast`) se mantiene como **segunda barrera** (defense-in-depth)

**Codigo clave (cart.js):**
```javascript
const campos = ['ncvNombre', 'ncvTelefono', 'ncvZona'];
for (const id of campos) {
    const el = document.getElementById(id);
    if (el && typeof el.reportValidity === 'function' && !el.reportValidity()) return;
}
```

**Archivos:** `js/vendedor/ui.js` (modal HTML), `js/vendedor/cart.js` (validacion)

| Campo | Antes | Despues |
|-------|-------|---------|
| Nombre | `<input>` sin required | `<sl-input required>` + reportValidity |
| Telefono | `<input type="tel">` sin required | `<sl-input type="tel" required>` + reportValidity |
| Zona | `<input>` sin required | `<sl-input required>` + reportValidity |
| Direccion | `<input>` opcional | `<sl-input>` opcional |
| RUC | `<input>` opcional | `<sl-input>` opcional |
| Encargado | `<input>` opcional | `<sl-input>` opcional |

---

## 🟡 Fricciones Medias y Bajas Resueltas

### F-04: Sistema de toasts fragil y sin accesibilidad (MEDIA)

**Problema:**
Los toasts eran `<div class="toast">` custom con animacion CSS manual. No tenian:
- Boton de cierre (el usuario debia esperar 3.5s)
- Roles ARIA para lectores de pantalla
- Variantes visuales consistentes (colores hardcodeados)

**Solucion implementada:**
- `_renderToast()` ahora crea `<sl-alert>` con:
  - `variant` mapeado: success→success, error→danger, info→neutral, warning→warning
  - `closable` para cierre manual
  - `duration` para auto-dismiss
  - Icono `<sl-icon slot="icon">` por tipo
  - Roles ARIA nativos del componente (`role="alert"`)
- El CSS del toast container se simplifico (3 reglas vs 12)

**Archivos:** `js/vendedor/ui.js` (_renderToast), `index.html` (CSS)

| Aspecto | Antes | Despues |
|---------|-------|---------|
| Elemento | `<div class="toast">` | `<sl-alert>` |
| Cierre manual | No | Si (closable) |
| ARIA roles | No | Si (nativo) |
| Iconos | Unicode (✓ ✕ ⓘ ⚠) | SVG (check2-circle, etc.) |
| Animacion | CSS custom (transform+opacity) | Nativa Shoelace (slide+fade) |

---

### F-05: Banner offline de bajo contraste (MEDIA)

**Problema:**
El banner offline era un `<div>` amber con `text-xs` (12px). Bajo luz solar directa en Paraguay (alto brillo), era practicamente invisible. El icono era un Lucide SVG de 14px.

**Solucion implementada:**
- Migrado a `<sl-alert variant="warning">` con:
  - Icono `wifi-off` via `<sl-icon>` en slot dedicado
  - Texto con `<strong>` para "Modo Offline"
  - Contraste WCAG AA garantizado por el theme de Shoelace
  - Toggle compatible: `banner.open = isOffline` + clase `hidden` como fallback

**Archivos:** `index.html` (HTML), `supabase-config.js` (toggle logic)

---

### F-06: Botones de checkout sin jerarquia visual (BAJA)

**Problema:**
Los 3 botones de checkout usaban colores Tailwind manuales (`bg-amber-500`, `bg-emerald-600`, `border-gray-300`) sin jerarquia semantica clara. Un vendedor nuevo no sabia instintivamente cual era la accion principal.

**Solucion implementada:**
- `btnPedido`: `<sl-button variant="default" outline>` — accion secundaria (solo guardar)
- `btnCobro`: `<sl-button variant="warning">` — accion media (cobro interno)
- `btnFactura`: `<sl-button variant="success">` — accion principal (factura legal)
- Todos con `size="large"` para touch targets amplios y consistentes
- Boton "Volver" con `size="small"` para jerarquia visual clara

**Archivo:** `index.html`

---

## 📊 Metricas de la Fase 6

| Metrica | Valor |
|---------|-------|
| **Fricciones resueltas** | 6 (3 altas, 2 medias, 1 baja) |
| **Archivos modificados** | 8 (5 JS/HTML + 1 CSS + 1 SW + 1 config) |
| **Archivos Shoelace agregados** | 2536 (assets estaticos locales) |
| **Tamano Shoelace** | 6.8MB (limpio de React/TS/metadata) |
| **Service Worker** | v56 → v57 (precache core + cache-first chunks) |
| **Tests finales** | **99 tests en verde, 11 archivos, 0 regresiones** |
| **Touch target minimo** | 28px → 44px (+57% area tactil) |
| **Componentes Shoelace usados** | sl-button, sl-icon-button, sl-icon, sl-alert, sl-input |
| **Dependencias CDN agregadas** | 0 (100% local, offline-first) |

---

## 🏗️ Arquitectura Shoelace en el Proyecto

### Integracion (sin bundler)

```
index.html / admin.html
  ├── <link href="assets/lib/shoelace/themes/light.css">    ← Theme CSS
  ├── <script type="module"> setBasePath('./assets/lib/shoelace') ← Base path para iconos
  └── <script type="module" src="assets/lib/shoelace/shoelace.js"> ← Registra todos los componentes
```

### Estrategia Service Worker (v57)

| Recurso | Estrategia | Cache |
|---------|-----------|-------|
| `themes/light.css` | **Precache** (install) | `hdv-pedidos-v57` |
| `shoelace.js` | **Precache** (install) | `hdv-pedidos-v57` |
| `utilities/base-path.js` | **Precache** (install) | `hdv-pedidos-v57` |
| `chunks/*.js` (260) | **Cache-First** (on-demand) | `hdv-pedidos-v57` |
| `assets/icons/*.svg` (2000+) | **Cache-First** (on-demand) | `hdv-pedidos-v57` |

### Compatibilidad withButtonLock (dual)

```javascript
// Detecta automaticamente sl-button vs button HTML
const isShoelace = btn.tagName.toLowerCase() === 'sl-button';
if (isShoelace) {
    btn.loading = true;  // Spinner nativo Shoelace
} else {
    btn.innerHTML = SPINNER_SVG + ' Guardando...';  // Fallback HTML
}
```

---

## 📋 Componentes Shoelace Disponibles (no usados aun)

Para fases futuras, estos componentes estan disponibles localmente:

| Componente | Uso potencial |
|------------|---------------|
| `<sl-dialog>` | Reemplazar modals custom (confirm, success factura) |
| `<sl-select>` | Reemplazar `<select>` de tipo de pago, zona, categoria |
| `<sl-drawer>` | Reemplazar cart drawer custom |
| `<sl-tab-group>` | Tabs de admin (actualmente 9 tabs con show/hide manual) |
| `<sl-badge>` | Badges de estado (PED/REC/FAC, fraude, editado) |
| `<sl-skeleton>` | Skeleton loading para catalogo (reemplazar CSS custom) |
| `<sl-switch>` | Toggle dark mode, kill switch admin |
| `<sl-tooltip>` | Ayuda contextual en iconos de admin |
| `<sl-progress-bar>` | Progreso de sincronizacion, upload imagenes |

---

## 📅 Historial de Commits Fase 6

| Commit | Descripcion |
|--------|-------------|
| `497907f` | `feat(fase6): integracion Shoelace Web Components + poka-yoke vendedor` — 6 fricciones resueltas, 2536 archivos Shoelace locales, SW v57 |

---

*Generado: 28 de marzo de 2026 — Claude (Principal UX/UI Architect)*
