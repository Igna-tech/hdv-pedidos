# HDV Distribuciones - Sistema POS/ERP

## META-REGLA DE AUTO-MANTENIMIENTO (CRITICA)

> Al finalizar CUALQUIER tarea significativa (nueva feature, refactorizacion, parche de seguridad), DEBES revisar y actualizar este archivo automaticamente.
> NO te limites a anadir texto al final (append). DEBES editar las secciones existentes para reflejar la nueva realidad.
> Si una funcion, tabla o logica fue eliminada o reemplazada, ELIMINALA de este documento.
> Mantén el documento conciso, directo y estructurado. Este archivo es un mapa arquitectonico, no un historial de chat.

Sistema de toma de pedidos y administracion para HDV Distribuciones (Paraguay).
PWA mobile-first para vendedores de calle + panel admin de escritorio.

## Stack

- **Frontend**: Vanilla JS, Tailwind CSS (CDN), Lucide Icons (v0.468.0), Chart.js (admin), jsPDF, JSZip
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
├── admin.js                → Logica admin (dashboard, productos, clientes, stock, pedidos, creditos, promos, backups, rendiciones, metas)
├── admin-ventas.js         → Facturacion: emision facturas SIFEN, reimpresion, WhatsApp
├── admin-devoluciones.js   → Notas de credito: devolucion parcial/total, restaura stock, impresion
├── admin-contabilidad.js   → Cierre mensual: libro RG90 CSV, paquete ZIP con KuDE+XML
│
├── supabase-init.js        → Credenciales Supabase (se carga PRIMERO en todos los HTML)
├── services/supabase.js    → Capa de servicios (Repository Pattern): centraliza TODAS las queries
├── js/services/sync.js     → SyncManager: sync automatica de pedidos offline con backoff progresivo
├── js/utils/storage.js     → HDVStorage: wrapper IndexedDB con cache en memoria
├── js/utils/sanitizer.js   → escapeHTML() para prevencion XSS
├── js/utils/helpers.js     → Utilidades compartidas (debounce, etc.)
├── guard.js                → Proteccion de rutas (auth + roles admin/vendedor via RPC)
├── supabase-config.js      → Orquestacion: realtime, sync, mapeo legacy (delega queries a SupabaseService)
├── login.html / login.js   → Login con Supabase Auth, redirect por rol
│
├── service-worker.js       → Cache PWA (version actual en const VERSION)
├── manifest.json           → Configuracion PWA (standalone, portrait)
├── productos.json          → Fallback estatico del catalogo (offline/primera carga, NO es fuente de verdad)
├── vercel.json             → Rutas Vercel + headers de seguridad (X-Frame-Options, nosniff, Referrer-Policy)
│
├── supabase/functions/sifen-generar-xml/ → Edge Function: genera XML DTE SIFEN v150 con CDC Modulo 11
├── AUDITORIA_SEGURIDAD.md  → Auditoria Zero Trust con hallazgos y estado de remediacion
├── supabase-schema.sql     → Schema completo
├── supabase-auth-setup.sql → Setup auth: perfiles, trigger, RLS, RPCs
└── package.json            → Solo dependencia: @supabase/supabase-js
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
- `pedidos` (id TEXT PK, estado, fecha TEXT, datos JSONB, creado_en, actualizado_en, vendedor_id UUID FK→auth.users DEFAULT auth.uid()) — estados: pedido_pendiente, entregado, cobrado_sin_factura, facturado_mock, nota_credito_mock
- `configuracion` (doc_id TEXT PK, datos JSONB) — docs: pagos_credito, creditos_manuales, promociones, whatsapp_plantilla, gastos_vendedor, rendiciones, cuentas_bancarias, metas_vendedor
- `configuracion_empresa` (id INT PK default 1, ruc_empresa, razon_social, nombre_fantasia, timbrado_numero, timbrado_vencimiento, establecimiento, punto_expedicion, direccion_fiscal, telefono_empresa, email_empresa, actividad_economica) — fila unica, DELETE bloqueado
- `reportes_mensuales` (mes TEXT PK, datos JSONB)
- `perfiles` (id UUID PK FK→auth.users, nombre_completo, rol CHECK('admin','vendedor'), activo)

### Tabla legacy (no usar):
- `catalogo` — reemplazada por tablas relacionales, pendiente de eliminacion

### RPCs SECURITY DEFINER:
- `actualizar_estado_pedido(text, text)` — valida auth.uid() + admin o dueno del pedido
- `reemplazar_variantes(text[], jsonb)` — valida auth.uid() + rol admin estricto
- `obtener_rol_usuario(uuid)`, `es_admin()`, `obtener_mi_rol()` — EXECUTE solo para `authenticated`

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
  numFactura?, cdc?, facturaFecha?, sifen_xml_generado?, sifen_cdc?, sifen_qr_url?
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

- Supabase Auth email/password. Tabla `perfiles` con rol + activo. Trigger auto-crea perfil.
- `guard.js` usa RPC `obtener_rol_usuario` (SECURITY DEFINER). Admin → admin.html, Vendedor → index.html.
- `window.hdvUsuario` expone {id, email, rol, nombre} globalmente.

## Facturacion SIFEN

- **Edge Function** `sifen-generar-xml`: genera XML DTE SIFEN v150 con CDC 44 digitos (Modulo 11 real)
- Numero factura: `001-001-NNNNNNN`. CDC calculado con algoritmo oficial.
- Certificado .p12: env vars `CERTIFICADO_P12` + `PASS_CERT` (preparado, pendiente firma digital)
- Formatos impresion: ticket termico 58mm, A4
- Export contable: CSV libro RG90 + ZIP con KuDE+XML

## Imagenes de productos

Bucket `productos_img` (Supabase Storage). Compresion Canvas → WebP 800px max. Upload solo admin.

## Arquitectura de seguridad (Zero Trust)

### Backend (PostgreSQL)
- **RLS obligatorio** en todas las tablas. Sin acceso para `anon`. RPCs con REVOKE de `public`/`anon`. `configuracion` INSERT/UPDATE solo admin.
- **VIEW `clientes_vendedor`**: sin `precios_personalizados`. Vendedores consultan VIEW, admin consulta tabla base.
- **`reportes_mensuales` SELECT**: solo admin. `configuracion_empresa` SELECT publico (datos fiscales en factura).
- Funciones criticas validan `auth.uid()` + rol internamente (no confian solo en RLS).
- `pedidos.vendedor_id` DEFAULT `auth.uid()`. `configuracion_empresa` DELETE bloqueado con `USING(false)`.
- **Trigger `trg_validar_precios`**: valida precios (< 50% catalogo), descuento (> 30%), total sospechoso (< 40% catalogo), cantidad absurda (> 9999). Marca `alerta_fraude: true` y fuerza `pedido_pendiente`.
- **Trigger `trg_bloquear_mutacion_terminal`**: impide UPDATE de vendedores en pedidos con estados terminales (facturado_mock, nota_credito_mock, cobrado_sin_factura, entregado, anulado).
- **Trigger `trg_forzar_fecha_servidor`**: sobreescribe `pedidos.fecha` con `NOW()` del servidor en INSERT, impide fraude de fechas.
- **DELETE en `pedidos`**: solo admin. Vendedores no pueden borrar pedidos.
- **RPC `obtener_catalogo_seguro`**: retorna catalogo con `costo=0` para vendedores (defense-in-depth server-side).
- **VIEW `producto_variantes_vendedor`**: sin columna `costo` (disponible para migracion futura).

### Storage
- Bucket `productos_img`: limite 2MB, solo JPEG/PNG/WebP, operaciones restringidas a admin via `es_admin()`.

### Edge Functions
- Validacion JWT estricta (`supabase.auth.getUser()`). Rate limit 10 req/min por user.
- Privilegios divididos: lecturas con client RLS, escritura final con SERVICE_ROLE solo para resultado SIFEN.
- Anti-doble facturacion: rechaza pedidos con `sifen_cdc` existente. Sanitizacion XML en todos los campos.

### Frontend
- `escapeHTML()` obligatorio en TODA interpolacion dentro de `innerHTML`. Prohibido inline `onclick` con variables — usar `data-attributes` + `addEventListener`.
- CSP header en `vercel.json` como defense-in-depth (whitelist de CDNs, bloquea frame/object).
- `admin.js` verifica rol server-side via RPC `obtener_mi_rol()` al inicializar (no confia solo en `window.hdvUsuario`).
- Backups vendedor sanitizados: sin `costo`, sin `precios_personalizados`, RUC recortado.
- Event delegation en admin usa `ACTION_DISPATCH` whitelist (sin `new Function()`).
- Logout limpia TODOS los datos de IndexedDB excepto darkmode.
- SyncManager detecta sesion expirada y detiene sync con feedback al usuario.
- Tokens JWT en localStorage (limitacion frontend-only). Mitigacion: CSP + eliminar vectores XSS.

### Auditorias de seguridad
- `AUDITORIA_SEGURIDAD.md`: V1 — 26 hallazgos Zero Trust, todos remediados.
- `AUDITORIA_SEGURIDAD_V2.md`: V2 — Red Team, 9 hallazgos (1 critico, 3 altos, 4 medios, 1 bajo), **todos remediados 2026-03-19**.
- `AUDITORIA_SEGURIDAD_V3.md`: V3 — Insider Threats, 10 hallazgos (2 criticos, 3 altos, 3 medios, 2 bajos), **todos remediados 2026-03-19**.

## Reglas importantes

- **NO bloquear por stock en la app del vendedor**. Flujo: levantar pedido → comprar mercaderia → entregar.
- Service worker: incrementar `VERSION` en cada deploy.
- `productos.json` es fallback estatico, no fuente de verdad.
- Variantes se reemplazan atomicamente via RPC `reemplazar_variantes` (no update individual).
- Admin modifica en memoria y guarda todo junto ("Guardar y Sincronizar"), no campo por campo.
- Pedidos: IndexedDB es fuente primaria para lectura, Supabase para sync entre dispositivos.
