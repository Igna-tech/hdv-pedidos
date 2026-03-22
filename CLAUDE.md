# HDV Distribuciones - Sistema POS/ERP

## META-REGLA DE AUTO-MANTENIMIENTO (CRITICA)

> Al finalizar CUALQUIER tarea significativa (nueva feature, refactorizacion, parche de seguridad), DEBES revisar y actualizar este archivo automaticamente.
> NO te limites a anadir texto al final (append). DEBES editar las secciones existentes para reflejar la nueva realidad.
> Si una funcion, tabla o logica fue eliminada o reemplazada, ELIMINALA de este documento.
> Mantén el documento conciso, directo y estructurado. Este archivo es un mapa arquitectonico, no un historial de chat.

Sistema de toma de pedidos y administracion para HDV Distribuciones (Paraguay).
PWA mobile-first para vendedores de calle + panel admin de escritorio.

## Stack

- **Frontend**: Vanilla JS, Tailwind CSS (compilado estatico, v3.4.17), Lucide Icons (v0.468.0), Chart.js (admin), jsPDF, JSZip
- **Backend**: Supabase (Auth, PostgreSQL, Storage, Realtime, Edge Functions)
- **Deploy**: Vercel (archivos estaticos)
- **PWA**: Service Worker con cache network-first para JS/HTML, cache-first para assets
- **Font**: Inter (Google Fonts)

## Arquitectura de archivos

```
├── index.html              → App vendedor (mobile PWA)
├── app.js                  → Logica vendedor (catalogo, carrito, pedidos, zonas, caja, metas)
├── checkout.js             → 3 flujos de venta: pedido pendiente, recibo interno, factura SIFEN
│
├── admin.html              → Panel admin (desktop)
├── admin.js                → Logica admin (dashboard, productos, clientes, stock, pedidos, creditos, promos, backups, rendiciones, metas, forense)
├── admin-ventas.js         → Facturacion: emision facturas SIFEN, reimpresion, WhatsApp
├── admin-devoluciones.js   → Notas de credito: devolucion parcial/total, restaura stock, impresion
├── admin-contabilidad.js   → Cierre mensual: libro RG90 CSV, paquete ZIP con KuDE+XML
│
├── supabase-init.js        → Credenciales Supabase (se carga PRIMERO en todos los HTML)
├── services/supabase.js    → Capa de servicios (Repository Pattern): centraliza TODAS las queries
├── supabase-config.js      → Orquestacion: realtime, sync, mapeo legacy (delega queries a SupabaseService)
├── guard.js                → Proteccion de rutas (auth + roles + Kill Switch via RPC)
├── login.html / login.js   → Login con Supabase Auth + MFA TOTP, redirect por rol, alerta ?blocked=1
│
├── js/core/state.js        → Singleton hdvState: getters/setters globales (pedidos, catalogo, carrito)
├── js/services/sync.js     → SyncManager: sync automatica de pedidos offline con backoff progresivo
├── js/utils/storage.js     → HDVStorage: wrapper IndexedDB con cache en memoria
├── js/utils/sanitizer.js   → escapeHTML() para prevencion XSS
├── js/utils/helpers.js     → Utilidades compartidas (debounce, etc.)
├── js/utils/formatters.js  → Formateo de moneda, fechas, etc.
├── js/utils/printer.js     → Impresion de tickets termicos y A4
├── js/utils/pdf-generator.js → Generacion de PDFs con jsPDF
├── js/vendedor/ui.js       → UI del vendedor (catalogo visual, navegacion)
├── js/vendedor/cart.js     → Logica de carrito del vendedor
├── js/admin/pedidos.js     → Modulo admin: gestion de pedidos entrantes
├── js/admin/dashboard.js   → Modulo admin: dashboard con Chart.js
├── js/admin/productos.js   → Modulo admin: CRUD de productos y variantes
├── js/admin/clientes.js    → Modulo admin: CRUD de clientes
├── js/admin/creditos.js    → Modulo admin: control de creditos
├── js/modules/ventas/ventas-data.js      → Datos y logica de ventas/facturacion
├── js/modules/ventas/ventas-templates.js → Templates HTML para documentos de venta
│
├── src/input.css           → Entrada Tailwind (directivas @tailwind)
├── dist/tailwind.css       → CSS compilado y minificado (generado por npm run build:css)
├── tailwind.config.js      → Config Tailwind: content paths para purge
├── service-worker.js       → Cache PWA (version actual en const VERSION)
├── manifest.json           → Configuracion PWA (standalone, portrait)
├── productos.json          → Fallback estatico del catalogo (offline/primera carga, NO es fuente de verdad)
├── vercel.json             → Rutas Vercel + headers de seguridad (CSP, X-Frame-Options, nosniff, Referrer-Policy)
│
├── supabase/functions/sifen-generar-xml/  → Edge Function: genera XML DTE SIFEN v150 con CDC Modulo 11
├── supabase/functions/alertas-seguridad/  → Edge Function: alertas WhatsApp ante fraudes, deletes y kill switch
├── supabase/migrations/                   → SQL de webhooks y triggers de alertas (pg_net)
│
├── AUDITORIA_SEGURIDAD.md    → V1: 26 hallazgos Zero Trust, todos remediados
├── AUDITORIA_SEGURIDAD_V2.md → V2: Red Team, 9 hallazgos, todos remediados
├── AUDITORIA_SEGURIDAD_V3.md → V3: Insider Threats, 10 hallazgos, todos remediados
├── AUDITORIA_SEGURIDAD_V4.md → V4: White-Box Audit integral, Tier 3/5, 9 brechas residuales
├── DISASTER_RECOVERY.md      → Plan de recuperacion ante desastres (RTO 2h, RPO 24h)
├── scripts/backup_schema.sh  → Cold backup de esquema DB (estructura sin datos)
├── supabase-schema.sql       → Schema completo
├── supabase-auth-setup.sql   → Setup auth: perfiles, trigger, RLS, RPCs
└── package.json              → Solo dependencia: @supabase/supabase-js
```

## Orden de carga de scripts

**index.html (vendedor):**
supabase CDN → supabase-init.js → services/supabase.js → js/utils/storage.js → guard.js → supabase-config.js → js/services/sync.js → [core/state, utils, vendedor modules] → app.js → checkout.js

**admin.html:**
supabase CDN → Chart.js → supabase-init.js → services/supabase.js → js/utils/storage.js → guard.js → supabase-config.js → admin.js → admin-ventas.js → admin-devoluciones.js → admin-contabilidad.js

**login.html:**
supabase CDN → supabase-init.js → js/utils/storage.js → login.js

## Base de datos (Supabase PostgreSQL)

### Tablas relacionales (catalogo):
- `categorias` (id TEXT PK, nombre, subcategorias TEXT[], estado)
- `clientes` (id TEXT PK, nombre, razon_social, ruc, telefono, direccion, zona, encargado, tipo, oculto, precios_personalizados JSONB)
- `productos` (id TEXT PK, nombre, categoria_id FK→categorias, subcategoria, imagen_url, estado, oculto, tipo_impuesto)
- `producto_variantes` (id UUID PK, producto_id FK→productos CASCADE, nombre_variante, precio, costo, stock, activo)

### Tablas operativas:
- `pedidos` (id TEXT PK, estado, fecha TEXT, datos JSONB, creado_en, actualizado_en, vendedor_id UUID FK→auth.users DEFAULT auth.uid()) — estados: pedido_pendiente, entregado, cobrado_sin_factura, facturado_mock, nota_credito_mock, anulado
- `configuracion` (doc_id TEXT PK, datos JSONB) — docs: pagos_credito, creditos_manuales, promociones, whatsapp_plantilla, gastos_vendedor, rendiciones, cuentas_bancarias, metas_vendedor
- `configuracion_empresa` (id INT PK default 1, ruc_empresa, razon_social, nombre_fantasia, timbrado_numero, timbrado_vencimiento, establecimiento, punto_expedicion, direccion_fiscal, telefono_empresa, email_empresa, actividad_economica) — fila unica, DELETE bloqueado
- `reportes_mensuales` (mes TEXT PK, datos JSONB)
- `perfiles` (id UUID PK FK→auth.users, nombre_completo, rol CHECK('admin','vendedor'), activo)
- `app_secrets` (key TEXT PK, value, description, created_at, updated_at) — RLS blindado: zero politicas, solo SECURITY DEFINER puede leer

### Tabla legacy (no usar):
- `catalogo` — reemplazada por tablas relacionales, pendiente de eliminacion

### RPCs SECURITY DEFINER:
- `actualizar_estado_pedido(text, text)` — valida auth.uid() + admin o dueno del pedido
- `reemplazar_variantes(text[], jsonb)` — valida auth.uid() + rol admin estricto
- `verificar_estado_cuenta()` — retorna boolean `activo` del perfil del usuario autenticado (Kill Switch)
- `obtener_rol_usuario(uuid)`, `es_admin()`, `obtener_mi_rol()` — EXECUTE solo para `authenticated`
- `obtener_catalogo_seguro()` — retorna catalogo con costo=0 para vendedores

### Trazabilidad forense (audit_logs):
- Tabla `audit_logs`: caja negra inmutable (RLS forzado, solo SELECT admin, sin INSERT/UPDATE/DELETE para usuarios)
- Trigger `log_audit_event()` SECURITY DEFINER: captura accion, datos antes/despues, usuario, timestamp
- Vigilancia activa en: `pedidos` (INSERT/UPDATE/DELETE), `configuracion` (INSERT/UPDATE/DELETE), `clientes` (UPDATE/DELETE)

### Realtime:
- Publicadas: categorias, clientes, productos, producto_variantes, pedidos, configuracion, perfiles

## Capa de servicios (services/supabase.js)

Patron Repository. Singleton global `SupabaseService` (IIFE). Centraliza TODAS las queries. Ningun otro archivo debe hacer `supabaseClient.from()` directamente.

**API publica:**
- **Pedidos**: `fetchPedidos(limit,offset)`, `fetchPedidoDatos(id)`, `upsertPedido(pedido)`, `updateEstadoPedido(id,estado)` [RPC atomica], `deletePedido(id)`
- **Catalogo**: `fetchCatalogo()`, `fetchCategorias()`, `fetchClientes(limit,offset)`, `fetchProductosConVariantes(limit,offset)`
- **CRUD**: `upsertCategorias/Clientes/Productos(rows)`, `deleteCategorias/Clientes/Productos(ids)`, `fetch*Ids()`
- **Variantes**: `deleteVariantesByProductoIds(ids)`, `insertVariantes(rows)`, `updateVariante(id,campos)`, `upsertVariante(row)`, `reemplazarVariantes(ids, rows)` [RPC atomica]
- **Config**: `fetchConfig(docId)`, `upsertConfig(docId,datos)`, `fetchConfigEmpresa()`, `upsertConfigEmpresa(datos)`
- **Reportes**: `upsertReporteMensual(mes,datos)`, `fetchReporteMensual(mes)`
- **Utils**: `healthCheck()`, `subscribeTo(channel,table,cb,filter?)`

Retornos: `{ data, error }` para fetches, `{ success, error }` para mutaciones.

## Capa de orquestacion (supabase-config.js)

Consume `SupabaseService`. Expone funciones globales:
- **Catalogo**: `obtenerCatalogo()`, `guardarCatalogo(data)`, `escucharCatalogoRealtime(cb)`
- **Pedidos**: `guardarPedido(pedido)`, `actualizarEstadoPedido(id,estado)`, `eliminarPedido(id)`, `obtenerPedidos()`, `escucharPedidosRealtime(cb)`, `sincronizarPedidosLocales()`
- **Config**: 8 pares guardar/obtener + `sincronizarDatosNegocio()`, `cargarDatosNegocio()`, `iniciarListenersDatosNegocio()`
- **Conexion**: `monitorearConexion()` — healthCheck cada 30s, badge verde/amarillo/rojo

## Formato de datos en memoria

```js
// Admin: productosData (global)
productosData = {
  categorias: [{ id, nombre, subcategorias: [], estado }],
  clientes: [{ id, nombre, razon_social, ruc, telefono, direccion, zona, encargado, tipo, oculto, precios_personalizados }],
  productos: [{ id, nombre, categoria, subcategoria, imagen_url, estado, oculto, tipo_impuesto,
    presentaciones: [{ tamano, precio_base, costo, stock, activo, variante_id }] }]
}

// Vendedor: variables globales filtradas (!oculto, !discontinuado)
productos = [...], categorias = [...], clientes = [...]

// Pedido (dentro de datos JSONB):
pedido = {
  id, fecha, cliente: { id, nombre, ruc, ... }, items: [{ productoId, nombre, presentacion, precio, cantidad, subtotal }],
  total, tipoPago, descuento, notas, estado, vendedor_id, sincronizado,
  numFactura?, cdc?, facturaFecha?, sifen_xml_generado?, sifen_cdc?, sifen_qr_url?,
  alerta_fraude?, fraude_detalle?, fraude_fecha?  // Inyectados por trigger trg_validar_precios
}
```

## Persistencia offline (IndexedDB)

`HDVStorage` (js/utils/storage.js): wrapper IndexedDB (base `HDV_ERP_DB`, store `keyval`) con cache en memoria.
Migra automaticamente de localStorage a IndexedDB al primer uso. Supabase Auth sigue en localStorage.

**Keys principales:** `hdv_catalogo_local`, `hdv_pedidos`, `hdv_carrito_${clienteId}`, `hdv_pagos_credito`, `hdv_creditos_manuales`, `hdv_promociones`, `hdv_gastos`, `hdv_rendiciones`, `hdv_cuentas_bancarias`, `hdv_metas`, `hdv_user_rol/email/nombre`, `hdv_darkmode`, `hdv_auto_backup(s)`.

**SyncManager** (js/services/sync.js): auto-sincroniza pedidos con `sincronizado: false` al detectar conexion online o al arrancar. Backoff progresivo (5s→15s→30s→60s). Mutex para evitar sync concurrentes.

## Flujo de datos

1. **Carga**: `HDVStorage.ready()` → `obtenerCatalogo()` → 3 queries paralelas → mapeo legacy → variables globales + cache IndexedDB
2. **Edicion admin**: Modifica `productosData` en memoria → "Guardar y Sincronizar" → IndexedDB + `guardarCatalogo()` (upsert batch + reconcilia eliminaciones)
3. **Realtime**: 4 canales catalogo (debounce 500ms) + pedidos + 8 configs → sync bidireccional IndexedDB ↔ Supabase
4. **Offline**: IndexedDB como fuente, service worker para assets, SyncManager sincroniza pedidos al reconectar

## Autenticacion y roles

- Supabase Auth email/password + **MFA TOTP para administradores**. Tabla `perfiles` con rol + activo. Trigger auto-crea perfil.
- `guard.js` usa RPC `obtener_rol_usuario` (SECURITY DEFINER). Admin → admin.html, Vendedor → index.html.
- `window.hdvUsuario` expone {id, email, rol, nombre} globalmente.
- **MFA (TOTP)**: Obligatorio para admin. Flujo: login → `getAuthenticatorAssuranceLevel()` → si admin sin factor TOTP → enroll (QR + secret) → challenge/verify. Si ya tiene TOTP → pantalla de codigo 6 digitos. `guard.js` verifica AAL2 en rutas admin.
- **Proteccion brute-force**: Delegada al rate limiting nativo de Supabase Auth (`Too many requests`). Lockout client-side eliminado (era evasible limpiando localStorage).
- **Sanitizacion de email**: `trim()` + `toLowerCase()` antes de enviar a Supabase Auth.
- **Complejidad de contrasenas**: Los usuarios se crean manualmente desde el dashboard de Supabase. Regla minima obligatoria: 8 caracteres, 1 mayuscula, 1 numero, 1 simbolo especial.

## Facturacion SIFEN

- **Edge Function** `sifen-generar-xml`: genera XML DTE SIFEN v150 con CDC 44 digitos (Modulo 11 real)
- Numero factura: `001-001-NNNNNNN`. CDC calculado con algoritmo oficial.
- Certificado .p12: env vars `CERTIFICADO_P12` + `PASS_CERT` (preparado, pendiente firma digital)
- Formatos impresion: ticket termico 58mm, A4
- Export contable: CSV libro RG90 + ZIP con KuDE+XML

## Imagenes de productos

Bucket `productos_img` (Supabase Storage). Compresion Canvas → WebP 800px max. Upload solo admin.

## MANIFIESTO Y POLITICAS DE SEGURIDAD (STRICT ENFORCEMENT)

> **DIRECTIVA DE AUTO-ACTUALIZACION:** Cada vez que se implemente una nueva medida o protocolo de seguridad en este proyecto, DEBE documentarse automaticamente en esta seccion sin necesidad de que el usuario lo pida explicitamente. Eliminar entradas obsoletas y mantener este manifiesto como fuente unica de verdad.

### P1 — FRONTEND & CSP (Cero tolerancia a ejecucion dinamica)

- **CSP estricto** en `vercel.json`: `script-src` sin `unsafe-eval` ni `unsafe-inline`. Whitelist explicita de CDNs. `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`.
- **Tailwind CSS compilado estatico** (`npm run build:css` → `dist/tailwind.css`). PROHIBIDO re-agregar el CDN JIT (rompe CSP). Al agregar clases Tailwind nuevas, re-ejecutar build antes de deploy.
- **SRI obligatorio** en todos los scripts externos: `integrity="sha384-..."` + `crossorigin="anonymous"`. Versiones fijadas: Supabase JS 2.99.2, Chart.js 4.4.0, Lucide 0.468.0, jsPDF 2.5.1, JSZip 3.10.1, SheetJS 0.20.3. Excluido: Google Fonts (CSS dinamico). Al actualizar libreria: `curl -sL URL | openssl dgst -sha384 -binary | openssl base64 -A`. URLs con redirect (unpkg) deben apuntar al path final.
- **Prevencion XSS**: `escapeHTML()` obligatorio en TODA interpolacion `innerHTML`. Prohibido inline `onclick` con variables — usar `data-attributes` + `addEventListener`. Event delegation via `ACTION_DISPATCH` whitelist (sin `new Function()`).
- **Sanitizacion de datos**: backups vendedor sin `costo`, sin `precios_personalizados`, RUC recortado. `textContent` para JSON en modals.
- **JWT en localStorage**: mitigado por CSP estricto + eliminacion de vectores XSS.

### P2 — DATABASE ZERO TRUST (La validacion vive en PostgreSQL, no en JS)

- **RLS habilitado y estricto** en TODAS las tablas. Zero politicas `anon`. RPCs con REVOKE de `public`/`anon`.
- **Triggers de validacion server-side** (NUNCA confiar en frontend):
  - `trg_validar_precios`: precio < 50% catalogo, descuento > 30%, total < 40%, qty > 9999 → marca `alerta_fraude: true`, fuerza `pedido_pendiente`.
  - `trg_bloquear_mutacion_terminal`: vendedores no pueden modificar pedidos en estados terminales (facturado, nota_credito, cobrado, entregado, anulado).
  - `trg_forzar_fecha_servidor`: sobreescribe `pedidos.fecha` con `NOW()` del servidor. Impide backdating.
- **Aislamiento de datos**:
  - `pedidos.vendedor_id` DEFAULT `auth.uid()`. DELETE solo admin.
  - VIEW `clientes_vendedor` sin `precios_personalizados`. VIEW `producto_variantes_vendedor` sin `costo`.
  - RPC `obtener_catalogo_seguro`: retorna `costo=0` para vendedores.
  - `reportes_mensuales` SELECT solo admin. `configuracion_empresa` DELETE bloqueado `USING(false)`.
- **Funciones criticas** (`SECURITY DEFINER`): validan `auth.uid()` + rol internamente, no confian solo en RLS.

### P3 — IDENTIDAD Y AUTENTICACION (MFA obligatorio, zero client-side auth)

- **MFA TOTP obligatorio para admin**: login → `getAuthenticatorAssuranceLevel()` → enroll (QR) o verify (6 digitos). `guard.js` verifica AAL2 en rutas admin.
- **Proteccion brute-force**: delegada al rate limiting nativo de Supabase Auth. PROHIBIDO implementar lockouts en localStorage (evasible, falsa seguridad).
- **Sanitizacion de credenciales**: email `trim()` + `toLowerCase()` antes de auth.
- **Verificacion server-side dual**: `guard.js` usa RPC `obtener_rol_usuario`. `admin.js` re-verifica con RPC `obtener_mi_rol()`. No confiar solo en `window.hdvUsuario`.
- **Complejidad de contrasenas**: 8+ chars, 1 mayuscula, 1 numero, 1 simbolo. Usuarios creados manualmente desde Supabase Dashboard.

### P4 — STORAGE ADUANA (Validacion estricta de archivos)

- Bucket `productos_img`: lectura publica, escritura solo `es_admin()`.
- **MIME-type whitelist**: JPEG, PNG, WebP unicamente. Validacion via `metadata->>'mimetype'` en RLS.
- **Limite de tamaño**: 5MB maximo (`metadata->>'size'`).
- **Anti-extension-doble**: bloqueo de nombres con mas de un punto (previene `shell.php.jpg`).
- DELETE solo admin. Compresion Canvas → WebP 800px max antes de upload.

### P5 — CONTINUIDAD, INCIDENTES Y FORENSIA

- **Audit Logs inmutables**: tabla `audit_logs` con RLS solo SELECT admin. Sin INSERT/UPDATE/DELETE para usuarios. Trigger `log_audit_event()` SECURITY DEFINER en: pedidos, configuracion, clientes.
- **Kill Switch (dispositivos robados)**:
  - Admin: toggle `perfiles.activo` desde panel "Control de Acceso".
  - Guard.js: si `activo === false` → purga IndexedDB (todo excepto darkmode) → `signOut()` → redirect `/login.html?blocked=1`.
  - SyncManager: pre-sync verifica `verificar_estado_cuenta()` RPC. Si inactivo → purga + signOut.
  - RLS `pedidos_insert`: requiere `activo = true`. Vendedor desactivado no puede insertar.
  - Login: `?blocked=1` muestra alerta visual.
- **Centro de Comando Forense** (admin sidebar):
  - Radar de Fraudes: pedidos con `alerta_fraude = true`. Modal JSON.
  - Caja Negra: ultimos 50 audit_logs DESC. Modal diff antes/despues.
  - Renderizado XSS-safe: `textContent` + `escapeHTML()`.
- **Alertas WhatsApp en tiempo real**:
  - Edge Function `alertas-seguridad` via CallMeBot (GET con query params).
  - Triggers pg_net: `trg_alerta_fraude_pedidos_insert/update`, `trg_alerta_audit_logs`, `trg_alerta_kill_switch`.
  - `notify_alerta_seguridad()` SECURITY DEFINER con secretos leidos de tabla `app_secrets` (ver P6).
  - Env vars Edge Function: `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_DESTINO`, `WEBHOOK_SECRET`.
  - Tolerante a fallos: siempre retorna HTTP 200 (evita reintentos infinitos).
- **Disaster Recovery**: `DISASTER_RECOVERY.md` (RTO 2h, RPO 24h). `scripts/backup_schema.sh` para cold backup de esquema.

### P6 — GESTION DE SECRETOS (Zero texto plano en codigo)

- **PROHIBIDO** hardcodear tokens, contrasenas, API keys o webhook secrets en archivos JavaScript, HTML o codigo SQL.
- **Secretos de DB/triggers**: almacenados en tabla `app_secrets` (RLS blindado: zero politicas = inaccesible para `anon`/`authenticated`). Solo funciones `SECURITY DEFINER` pueden leer. Para rotar: `UPDATE app_secrets SET value = 'nuevo', updated_at = NOW() WHERE key = '...';` desde SQL Editor.
- **Secretos de Edge Functions**: variables de entorno en Supabase Dashboard → Edge Functions → Secrets (`WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_DESTINO`, `WEBHOOK_SECRET`).
- **Credenciales frontend** (`supabase-init.js`): `SUPABASE_URL` y `SUPABASE_ANON_KEY` son publicos por diseno (protegidos por RLS). No son secretos.

### P7 — EDGE FUNCTIONS (Perimetro de API)

- JWT obligatorio via `supabase.auth.getUser()`. Rate limit 10 req/min por user (en memoria).
- Privilegios divididos: lecturas con RLS del cliente, escritura final con SERVICE_ROLE.
- Anti-doble facturacion: rechaza pedidos con `sifen_cdc` existente.
- Sanitizacion Anti-XXE: `sanitizarParaXML(texto, maxLength)` escapa `& < > " '` + trunca. `validarNumero()` con `Number.isFinite`.
- CORS: `ALLOWED_ORIGIN` env var. En produccion, NO usar `*`.

### P8 — OFUSCACION DE DATOS (Vistas Seguras entre frontend y tablas fisicas)

- **VIEW `clientes_vendedor`**: excluye `precios_personalizados`. Vendedores consultan la VIEW, admin consulta la tabla base.
- **VIEW `producto_variantes_vendedor`**: excluye columna `costo`. Vendedores no ven costos de productos.
- **RPC `obtener_catalogo_seguro()`**: retorna `costo=0` para vendedores (defense-in-depth server-side, complementa las VIEWs).
- **Backups vendedor sanitizados**: exportaciones desde la app del vendedor excluyen `costo`, `precios_personalizados` y truncan RUC.
- **Principio**: el frontend NUNCA debe tener acceso directo a columnas sensibles. Toda consulta de vendedor debe pasar por VIEWs o RPCs filtradas.

### P9 — SEGURIDAD OFFLINE (IndexedDB como perimetro de confianza)

- **HDVStorage** (`js/utils/storage.js`): wrapper IndexedDB con cache en memoria. Los datos locales estan cifrados por dominio (Same-Origin Policy del navegador).
- **Purga obligatoria en logout**: `guard.js` y `onAuthStateChange('SIGNED_OUT')` limpian TODAS las keys `hdv_*` de IndexedDB (excepto `hdv_darkmode`).
- **Purga obligatoria en Kill Switch**: si `verificar_estado_cuenta()` retorna `activo=false` → purga completa + `signOut()` + redirect. Aplica en `guard.js` y en `SyncManager` pre-sync.
- **SyncManager con mutex**: impide sincronizaciones concurrentes. Backoff progresivo (5s→15s→30s→60s). Verifica estado de cuenta antes de cada sync.
- **Datos sensibles excluidos de cache offline**: `costo` y `precios_personalizados` no se almacenan en IndexedDB del vendedor (filtrados por RPC/VIEWs server-side).

### P10 — DEFENSA PERIMETRAL Y CADENA DE SUMINISTRO

- **Versiones fijadas obligatorias**: todas las librerias CDN tienen version exacta en la URL (no `@latest`). SRI valida integridad de cada script.
- **Preparacion WAF**: arquitectura compatible con Cloudflare (proxy DNS) o Vercel Firewall (plan Pro). Headers de seguridad ya configurados en `vercel.json`. Pendiente activacion (B-03).
- **Auditoria SCA**: preparado para Dependabot/Snyk en GitHub (`package.json` con dependencias declaradas). Pendiente activacion (B-05).
- **Service Worker versionado**: `const VERSION` se incrementa en cada deploy. Cache viejo se purga en `activate`. Network-first para HTML/JS (asegura que parches de seguridad se apliquen inmediatamente).
- **Principio**: la cadena de suministro (CDNs, npm, service worker) es un vector de ataque. Cada eslabón debe tener version fijada, hash verificado, y mecanismo de actualizacion controlada.

### Historial de auditorias

| Version | Tipo | Hallazgos | Estado |
|---------|------|-----------|--------|
| V1 | Zero Trust | 26 | Todos remediados |
| V2 | Red Team | 9 (1C, 3A, 4M, 1B) | Todos remediados 2026-03-19 |
| V3 | Insider Threats | 10 (2C, 3A, 3M, 2B) | Todos remediados 2026-03-19 |
| V4 | White-Box Audit | 9 brechas residuales | B-01 MFA, B-02 CSP, B-05 Dependabot, B-06 secretos — remediados. Pendientes: B-03 WAF (Cloudflare/Vercel Pro), B-04 rate limit persistente |

## Reglas operativas

- **NO bloquear por stock en la app del vendedor**. Flujo: levantar pedido → comprar mercaderia → entregar.
- Service worker: incrementar `VERSION` en cada deploy.
- `productos.json` es fallback estatico, no fuente de verdad.
- Variantes se reemplazan atomicamente via RPC `reemplazar_variantes` (no update individual).
- Admin modifica en memoria y guarda todo junto ("Guardar y Sincronizar"), no campo por campo.
- Pedidos: IndexedDB es fuente primaria para lectura, Supabase para sync entre dispositivos.
- IDs de pedidos generados con `crypto.randomUUID()` (PED-, REC-, FAC-). No usar Date.now() ni Math.random().
- **PROHIBIDO modificar** el codigo de generacion XML, CDC, integracion SIFEN/SET o Edge Functions sin autorizacion explicita.
