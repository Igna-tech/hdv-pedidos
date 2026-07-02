# HDV Distribuciones - Sistema POS/ERP

## META-REGLA DE AUTO-MANTENIMIENTO (CRITICA)

> Al finalizar CUALQUIER tarea significativa (nueva feature, refactorizacion, parche de seguridad), DEBES revisar y actualizar este archivo automaticamente.
> NO te limites a anadir texto al final (append). DEBES editar las secciones existentes para reflejar la nueva realidad.
> Si una funcion, tabla o logica fue eliminada o reemplazada, ELIMINALA de este documento.
> Mantén el documento conciso, directo y estructurado. Este archivo es un mapa arquitectonico, no un historial de chat.

Sistema de toma de pedidos y administracion para HDV Distribuciones (Paraguay).
PWA mobile-first para vendedores de calle + panel admin de escritorio.

## Stack

- **Frontend**: Vanilla JS, Tailwind CSS (compilado estatico, v3.4.17), Shoelace Web Components (local, no CDN), Lucide Icons (v0.468.0), Chart.js (admin), jsPDF, JSZip
- **Backend**: Supabase (Auth, PostgreSQL, Storage, Realtime, Edge Functions)
- **Deploy**: Vercel (archivos estaticos)
- **PWA**: Service Worker con estrategia por capas: Network-First para Supabase API (cache como fallback offline), Network-First para JS/HTML, Cache-First para assets estaticos
- **Font**: Inter (Google Fonts)

## Arquitectura de archivos

```
├── index.html              → App vendedor (mobile PWA)
├── app.js                  → Logica vendedor (catalogo, carrito, pedidos, zonas, caja, metas)
├── checkout.js             → 3 flujos de venta: pedido pendiente, recibo interno, factura SIFEN (con verificacion de persistencia)
│
├── admin.html              → Panel admin (desktop) — incluye filtros vendedor/estado en seccion pedidos
├── admin.js                → Logica admin (dashboard, productos, clientes, stock, pedidos, creditos, promos, backups, rendiciones, metas, forense)
├── admin-ventas.js         → Ventas: tabla rediseñada (tabla+drawer), filtros vendedor/estado/fecha/texto, detalle en drawerDetalleVenta con acciones contextuales por estado, estadisticas, paginacion 50/pag (VENTAS_POR_PAGINA, paginaVentas, _ventasFiltradas, _renderPaginacionVentas, _paginaVentasCambiar), WhatsApp. Botones "Ver PDF" llaman a generarKudePDF(). Funciones de impresion legacy eliminadas.
├── admin-devoluciones.js   → Legacy (seccion eliminada del sidebar). Codigo conservado para backward compat de NC- existentes. imprimirNC/reimprimirNC delegados a generarKudePDF. Flujo NC nuevo esta en js/admin/dtes.js
├── admin-contabilidad.js   → Cierre mensual: libro RG90 CSV, paquete ZIP con KuDE+XML
├── js/admin/sifen-estado.js → Consulta de Estado DTE/SIFEN: tabla de documentos, filtros, resumen por estado, detalle CDC, export CSV. Botones "Enviar SET" presentes pero deshabilitados hasta certificado digital DNIT.
├── js/admin/dtes.js        → Mis DTEs: emitir FAC-/NC-/NRE- (formularios accordion sl-details), consultar tabla DTEs propios, filtros, export CSV. IVA formula SET (precio c/IVA incluido).
│
├── supabase-init.js        → Credenciales Supabase (se carga PRIMERO en todos los HTML)
├── services/supabase.js    → Capa de servicios (Repository Pattern): centraliza TODAS las queries
├── supabase-config.js      → Orquestacion: realtime, sync, mapeo legacy (delega queries a SupabaseService). **Persistencia atomica por item** (auto-guardado, sin "Guardar y Sincronizar"): guardarProductoIndividual(prod, {categoria}) [upsert producto + categoria FK + reemplazarVariantes de ese id], guardarCategoriaIndividual(cat), eliminarProductoRemoto/eliminarCategoriaRemota, persistirOrdenProductos/persistirOrdenCategorias — todas actualizan cache local hdv_catalogo_local.
├── guard.js                → Proteccion de rutas (auth + roles + Kill Switch via RPC)
├── login.html / login.js   → Login con Supabase Auth + MFA TOTP, redirect por rol, alerta ?blocked=1. Saludo animado "Hola"+nombre (estilo Apple, ~5s) en redirigirPorRol() antes de navegar; nombre desde obtenerRol() (_userNombre)
│
├── js/core/state.js        → Singleton hdvState: getters/setters globales (pedidos, catalogo, carrito). Globals window.* son proxies via Object.defineProperty — cero cambios necesarios en consumidores.
├── js/services/sync.js     → SyncManager: sync automatica con batch upsert, pre-flight check, backoff exponencial + jitter
├── js/utils/storage.js     → HDVStorage: wrapper IndexedDB blindado (persistent storage, quota monitoring, eviction detection)
├── js/utils/sanitizer.js   → escapeHTML() para prevencion XSS
├── js/utils/dialogs.js     → Toast estilo Sonner (.hdv-toast apilado en #toastContainer, swipe-to-dismiss), confirm modal (sl-dialog), input modal (sl-dialog) — compartido entre vendedor y admin
├── js/utils/helpers.js     → Utilidades compartidas (debounce, throttle, withButtonLock, animarValor [count-up de números, respeta reduced-motion])
├── js/utils/formatters.js  → Formateo de moneda, fechas, etc.
├── js/utils/memo.js        → Memoizacion por clave con TTL + invalidacion por prefijo (memoizarPorClave, invalidarMemo). Usado para cifras del dashboard.
├── js/utils/async-ui.js    → Patron unico de carga: renderSkeletonLista, renderEstadoError (reintento CSP-safe), withCarga (skeleton→pinta/error+retry). Reusa .skeleton de input.css.
├── js/utils/virtual-list.js → Windowing client-side para listas grandes (montarListaVirtual, altura fija, delegacion). Infra disponible; las listas actuales (pedidos/clientes/ventas) ya paginan.
├── js/utils/kude-generator.js → Generador KuDE PDF: generarKudePDF(pedidoId) abre blob HTML con layout fiel a e-Kuatia'i (encabezado empresa+logo, receptor, tabla items IVA, footer QR+CDC). Requiere ventas-data.js, sanitizer.js. Logo embebido como base64 via fetch(). QR via QRCode.js cargado dinamicamente.
├── js/utils/printer.js     → Impresion de tickets de trabajo INTERNOS (vendedor app.js, admin pedidos.js). NO se usa para documentos cliente.
├── js/utils/pdf-generator.js → Generacion de PDFs con jsPDF
├── js/vendedor/ui.js       → UI del vendedor (catalogo visual, sidebar nav, historial cliente, Dashboard, Clientes). Catalogo: grid e-commerce 3-col (.vpc foto+ficha), tiles categoria difuminadas, sheet de variantes (matriz/masivo) con drag-to-dismiss (_attachSheetDrag), badges de promo (_promosCatalogo/_textoPromo/_bannerPromoModal). Carrito (renderizarCarrito): titulo "Pedido de <cliente>", miniaturas, control segmentado de pago (setTipoPago), notas en ventana flotante (abrirNotasPedido), editar precio de linea (editarPrecioLinea en cart.js), resumen+vaciar, empty state, count-up del total, drag-to-dismiss (_attachDrawerSwipeOnce). Dashboard (_renderResumenHoy): KPIs con count-up (data-countup) + barra de meta. Mi Jornada/Arqueo (_renderResumenSemana), mostrarConfiguracion().
├── js/vendedor/cart.js     → Logica de carrito del vendedor. cargarPedidoHabitual() (repite ultimo pedido); actualizarContadorCarrito() (pildora total FAB #cartPillText, badge-pop/fab-bounce); vaciarCarrito() (confirm), editarPrecioLinea(idx) (precio especial puntual), eliminarDelCarrito con snackbar "Deshacer" (_mostrarUndoCarrito). Promos: obtenerPromocionesActivas(), aplicarPromociones(cart), _textoPromo.
├── js/vendedor/cobros.js   → Cobros en campo (creditos = pedidos entregados con saldo): abrirCobrosCliente(clienteId), registrarPagoCobro(pedidoId) [cierra el pedido a saldo 0 → cobrado_sin_factura], cobrarTodoEfectivo(clienteId). Escribe en libro unificado hdv_pagos_credito + historial via helpers de entrega.js. Creditos manuales desacoplados (no los cobra el vendedor).
├── js/admin/pedidos.js     → Modulo admin: pedidos con filtros vendedor/estado, badges fraude/tipo/editado, desglose IVA, CSV enriquecido
├── js/admin/dashboard.js   → Modulo admin: dashboard con Chart.js. KPIs "Semana en vivo" (reinicia domingo) + KPIs mensuales con tendencia + sparkline SVG inline (_sparklineSVG). Ganancia por pedido memoizada. **Seccion Analisis avanzado** con selector de periodo global (Hoy/Semana/Mes/90d: _periodoActivo, _pedidosDelPeriodo, _renderVisuales orquestador, _initPeriodoSelector) que recalcula solo los graficos de esa seccion (los 2 strips de KPI quedan fijos). Graficos: dona mix cobro, dona categoria, polar zona, gauge meta MENSUAL con proyeccion fin de mes, treemap, radar vendedores, margen categoria, top productos (dona), **heatmap semana×hora** (CSS grid sin plugin, _renderHeatmap), **embudo ciclo de vida** con % conversion, **waterfall** con toggle flujo-caja⇄rentabilidad (_renderWaterfall, _obtenerGastosPeriodo agrega gastos por perfil). Estados vacios reutilizables (_estadoVacioGrafico). **Banda de alertas** (_renderInsights: tendencia ventas/creditos vencidos/stock bajo/pedidos sin finalizar → navegan via data-section). **Click-through**: embudo→Ventas por estado, top productos→Ventas por texto (_dashDrillVentas). **Personalizacion** (_initPersonalizacion/_aplicarLayout): drag&drop reordena tarjetas de #dashVisualesGrid, ocultar por tarjeta, densidad compacta; persistido en hdv_dashboard_layout.
├── js/admin/notificaciones.js → Centro de notificaciones in-app (campana header + panel): feed unificado fraude/pedidos sin finalizar/creditos por revisar/stock bajo (umbral 5). Estado leido/no-leido en IndexedDB (hdv_notif_leidas). Solo lee y navega (cambiarSeccion). toggleNotificaciones(), renderNotificaciones().
├── js/admin/productos.js   → Modulo admin: CRUD de productos y variantes. **Flujo de carga guiado unico** (#modalProducto): un solo formulario (launcher #quickAddRow "Cargar producto" + boton "+ Nuevo") con margen en vivo (_actualizarMargenSimple), checklist de vendibilidad en vivo (_actualizarVendibilidad: nombre/categoria/variante activa/precio>0/visible → bloquea Guardar si quedaria roto/invisible via _validarVendibilidad), categoria "+ Nueva…" al vuelo (_crearCategoriaInlineDesdeModal), boton "Guardar y cargar otro". **Auto-guardado**: guardarProductoModal llama guardarProductoIndividual (publica al vendedor al instante, sin "Guardar y Sincronizar"). **Modo edicion por nivel** (toggleEditarCatalogo, boton #btnEditarCatalogo, flag _editandoCatalogo): drag&drop nativo CSP-safe (_onCatalogoDragStart/Over/Drop/DragEnd) reordena categorias/subcategorias/productos y persiste orden; controles inline por tarjeta (renombrar/eliminar/toggle activo cat, renombrar/eliminar sub, editar/ocultar/eliminar prod — todos auto-guardan); mover productos entre subcategorias (drag a rail de subcategorias o accion masiva moverProductosSeleccionados). Boton "Atras" (productosVolverAtras) para subir un nivel de navegacion. ID unificado _siguienteIdProducto. edicion inline precio/costo/stock, duplicar (clonarProducto). **Tarjetas identicas al catalogo del vendedor**: categorias/subcategorias usan `.vendor-cat-card`/`.vendor-catalog-grid`, productos usan `.vpc`/`.vendor-prod-grid` (CSS compartido en src/input.css). initLazyLoadCards (admin.js) maneja `.vendor-cat-card[data-bg]` + `img.lazy-img[data-src]`. TODOS los handlers via data-action/data-action-change/data-action-slchange (sin onclick inline — CSP).
├── js/admin/clientes.js    → Modulo admin: CRUD de clientes
├── js/admin/creditos.js    → Modulo admin: creditos = pedidos ENTREGADOS (con saldo) por su numero. registrarPagoCredito() escribe libro unificado + cierra a cobrado_sin_factura al saldar. Creditos manuales = recordatorios personales AISLADOS (no entran en stats/balance/historial/badge).
├── js/admin/proveedores.js → Modulo admin: Proveedores — 4 sub-tabs (Directorio CRUD, Ordenes de Compra con drawer, Cuentas x Pagar con aging waterfall, Analisis scorecard). Tablas Supabase: proveedores, ordenes_compra, pagos_proveedor. IDs: PROV-/OC-/PP-. Score 0-100 por proveedor (cumplimiento+lead time+volumen+antiguedad).
├── js/shared/entrega.js    → COMPARTIDO vendedor+admin. Modal de entrega: abrirModalEntrega(pedidoId) con 3 botones (Cobro total / Cobro parcial / Ingresar a creditos). Helpers reutilizables: registrarCobroLibro(), registrarEventoHistorialCredito(). Corazon del ciclo de vida. Cargado en index.html y admin.html antes de la app.
├── js/modules/ventas/ventas-data.js      → Datos y logica de ventas/facturacion. ventasDataObtenerEmpresa() incluye logo_url. ventasDataCobrosPorPeriodo(desde,hasta,vendedorId?) = suma del libro de cobros (fuente unica de caja)
├── js/modules/ventas/ventas-templates.js → Vaciado: templates de impresion legacy eliminados. Archivo conservado por compatibilidad de carga.
│
├── src/input.css           → Entrada Tailwind + design tokens Shoelace (:root --sl-*, --hdv-*) + clases utilitarias compartidas
├── dist/tailwind.css       → CSS compilado y minificado (generado por npm run build:css)
├── tailwind.config.js      → Config Tailwind: content paths para purge
├── service-worker.js       → Cache PWA (version actual en const VERSION)
├── manifest.json           → Configuracion PWA (standalone, portrait)
├── productos.json          → Fallback estatico del catalogo (offline/primera carga, NO es fuente de verdad)
├── vercel.json             → Rutas Vercel + headers de seguridad (CSP, X-Frame-Options, nosniff, Referrer-Policy)
│
├── supabase/functions/sifen-generar-xml/  → Edge Function: genera XML DTE SIFEN v150 con CDC Modulo 11
├── supabase/functions/alertas-seguridad/  → Edge Function: alertas WhatsApp ante fraudes, deletes y kill switch
├── supabase/functions/push-notifications/ → Edge Function: push notifications (VAPID RFC 8292 + cifrado RFC 8291 aes128gcm)
├── supabase/migrations/                   → SQL de webhooks y triggers de alertas (pg_net)
│
├── AUDITORIA_SEGURIDAD.md    → V1: 26 hallazgos Zero Trust, todos remediados
├── AUDITORIA_SEGURIDAD_V2.md → V2: Red Team, 9 hallazgos, todos remediados
├── AUDITORIA_SEGURIDAD_V3.md → V3: Insider Threats, 10 hallazgos, todos remediados
├── AUDITORIA_SEGURIDAD_V4.md → V4: White-Box Audit integral, Tier 3/5, 9 brechas residuales
├── AUDITORIA_FASE1_INTEGRIDAD_DATOS.md → Fase 1: 14 hallazgos integridad de datos, 12 remediados
├── AUDITORIA_FLUJO_DATOS_E2E.md        → E2E: mapeo escrituras vendedor→admin, 10 puntos ciegos, 7 reparados
├── GUIA_CLOUDFLARE_WAF.md     → Guia paso a paso para activar WAF Cloudflare + Vercel (B-03)
├── DISASTER_RECOVERY.md      → Plan de recuperacion ante desastres (RTO 2h, RPO 24h)
├── scripts/backup_schema.sh  → Cold backup de esquema DB (estructura sin datos)
├── supabase-schema.sql       → Schema completo
├── supabase-auth-setup.sql   → Setup auth: perfiles, trigger, RLS, RPCs
└── package.json              → Solo dependencia: @supabase/supabase-js
```

## Orden de carga de scripts

**index.html (vendedor):**
supabase CDN → supabase-init.js → **js/utils/constants.js** → services/supabase.js → js/utils/storage.js → guard.js → supabase-config.js → js/services/sync.js → [core/state, sanitizer, **dialogs**, helpers, formatters, **memo, async-ui, virtual-list**, printer, pdf-generator, **js/shared/entrega.js**, vendedor/ui.js, vendedor/cart.js, **vendedor/cobros.js**] → app.js → checkout.js

**admin.html:**
supabase CDN → Chart.js → supabase-init.js → **js/utils/constants.js** → services/supabase.js → js/utils/storage.js → guard.js → supabase-config.js → [core/state, sanitizer, **dialogs**, helpers, formatters, **memo, async-ui, virtual-list**, printer, pdf-generator, **js/shared/entrega.js**] → admin.js → [admin modules + **js/admin/notificaciones.js**] → **js/utils/kude-generator.js** → admin-ventas.js → admin-devoluciones.js → admin-contabilidad.js → **js/admin/proveedores.js** → js/admin/sifen-estado.js → js/admin/dtes.js

**login.html:**
supabase CDN → supabase-init.js → js/utils/storage.js → login.js

## Base de datos (Supabase PostgreSQL)

### Tablas relacionales (catalogo):
- `categorias` (id TEXT PK, nombre, subcategorias TEXT[], estado, **orden INT** — orden manual del catalogo, se refleja en app vendedor)
- `clientes` (id TEXT PK, nombre, razon_social, ruc, telefono, direccion, zona, encargado, tipo, oculto, precios_personalizados JSONB)
- `productos` (id TEXT PK, nombre, categoria_id FK→categorias, subcategoria, imagen_url, estado, oculto, tipo_impuesto, **orden INT** — orden manual dentro de la categoria, se refleja en app vendedor). Migracion: `supabase/migrations/20260701_catalogo_orden.sql` (manual)
- `producto_variantes` (id UUID PK, producto_id FK→productos CASCADE, nombre_variante, precio, costo, stock, activo)

### Tablas operativas:
- `pedidos` (id TEXT PK, estado, fecha TEXT, datos JSONB, creado_en, actualizado_en, vendedor_id UUID FK→auth.users DEFAULT auth.uid(), **numero_pedido BIGINT** secuencial via trigger fn_asignar_numero_pedido, secuencia hdv_pedidos_numero_seq arranca en #0) — estados: pedido_pendiente, entregado, cobrado_sin_factura, facturado_mock, nota_credito_mock, nota_remision, anulado. IDs por tipo: PED-, REC-, FAC-, NC-, NRE-. **numero_pedido = numero sagrado de seguimiento (#0000000), distinto del numero de factura SIFEN**
- `configuracion` (doc_id TEXT PK, datos JSONB) — docs: pagos_credito, creditos_manuales, historial_creditos, promociones, whatsapp_plantilla, gastos_vendedor_${vendedorId}, rendiciones_${vendedorId}, cuentas_bancarias, metas_vendedor. NOTA: gastos y rendiciones particionados por vendedor_id desde Fase 1 (antes era doc_id compartido → last-write-wins)
- `configuracion_empresa` (id INT PK default 1, ruc_empresa, razon_social, nombre_fantasia, timbrado_numero, timbrado_vencimiento, establecimiento, punto_expedicion, direccion_fiscal, telefono_empresa, email_empresa, actividad_economica, logo_url TEXT) — fila unica, DELETE bloqueado. logo_url → URL publica en bucket empresa_assets
- `reportes_mensuales` (mes TEXT PK, datos JSONB)
- `perfiles` (id UUID PK FK→auth.users, nombre_completo, rol CHECK('admin','vendedor'), activo)
- `app_secrets` (key TEXT PK, value, description, created_at, updated_at) — RLS blindado: zero politicas, solo SECURITY DEFINER puede leer. Keys: `alertas_url`, `push_notifications_url`, `push_webhook_secret` (debe configurarse manualmente)

- `alertas_rate_limit` (clave TEXT PK, contador INT, ventana_inicio TIMESTAMPTZ) — rate limiting persistente para alertas WhatsApp; RLS habilitado solo SELECT admin; escrita atomicamente via RPC `verificar_rate_limit_alerta` con FOR UPDATE
- `push_subscriptions` (id UUID PK, user_id UUID FK→auth.users CASCADE, endpoint TEXT UNIQUE, p256dh TEXT, auth_key TEXT, created_at, updated_at) — suscripciones Web Push de vendedores; RLS: vendedor solo sus propias, admin SELECT todas

### Tablas de Proveedores (admin-only):
- `proveedores` (id TEXT PK 'PROV-', nombre, razon_social, ruc, telefono, email, direccion, ciudad, contacto_principal, categoria, condiciones_pago, dias_credito, activo BOOL, notas, created_at, actualizado_en) — RLS solo admin, audit trigger
- `ordenes_compra` (id TEXT PK 'OC-', proveedor_id FK→proveedores, estado TEXT, fecha_emision, fecha_esperada, fecha_recepcion, fecha_vencimiento, items JSONB, total NUMERIC, pagado NUMERIC, nro_factura_prov, notas, created_at, actualizado_en, creado_por UUID) — estados: borrador/confirmada/recibida/pagada/cancelada. RLS solo admin, audit trigger
- `pagos_proveedor` (id TEXT PK 'PP-', orden_compra_id FK→ordenes_compra, proveedor_id FK→proveedores, monto NUMERIC, fecha TEXT, metodo_pago, referencia, notas, created_at) — RLS solo admin

### Tabla legacy eliminada:
- `catalogo` — eliminada 2026-06-09 (reemplazada por tablas relacionales desde 2026-03-10)

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
- **Pedidos**: `fetchPedidos(limit,offset)` [auto-paginacion, cap 5000], `fetchPedidoDatos(id)`, `upsertPedido(pedido)`, `updateEstadoPedido(id,estado)` [RPC atomica], `deletePedido(id)`
- **Catalogo**: `fetchCatalogo()`, `fetchCategorias()` [ordenado por orden,nombre], `fetchClientes(limit,offset)`, `fetchProductosConVariantes(limit,offset)` [ordenado por orden,nombre]
- **CRUD**: `upsertCategorias/Clientes/Productos(rows)`, `deleteCategorias/Clientes/Productos(ids)`, `fetch*Ids()`, `actualizarOrdenProductos(items)`, `actualizarOrdenCategorias(items)` [upsert parcial {id,orden}]
- **Variantes**: `deleteVariantesByProductoIds(ids)`, `insertVariantes(rows)`, `updateVariante(id,campos)`, `upsertVariante(row)`, `reemplazarVariantes(ids, rows)` [RPC atomica]
- **Config**: `fetchConfig(docId)`, `upsertConfig(docId,datos)`, `fetchConfigEmpresa()`, `upsertConfigEmpresa(datos)`
- **Reportes**: `upsertReporteMensual(mes,datos)`, `fetchReporteMensual(mes)`
- **Proveedores**: `fetchProveedores()`, `upsertProveedores(rows)`, `deleteProveedores(ids)`, `fetchOrdenesCompra()`, `upsertOrdenesCompra(rows)`, `fetchPagosProveedor()`, `upsertPagosProveedor(rows)`
- **Utils**: `healthCheck()`, `subscribeTo(channel,table,cb,filter?)`

Retornos: `{ data, error }` para fetches, `{ success, error }` para mutaciones.

## Capa de orquestacion (supabase-config.js)

Consume `SupabaseService`. Expone funciones globales:
- **Catalogo**: `obtenerCatalogo()`, `guardarCatalogo(data)`, `escucharCatalogoRealtime(cb)`
- **Pedidos**: `guardarPedido(pedido)`, `actualizarEstadoPedido(id,estado)`, `eliminarPedido(id)`, `obtenerPedidos()`, `escucharPedidosRealtime(cb)` [debounce 500ms], `escucharPedidosRealtimeVendedor(callbacks)` [granular: onEstadoCambiado, onPedidoEliminado, onSync], `sincronizarPedidosLocales()`
- **Config**: 9 pares guardar/obtener (incluye `historial_creditos`) + `sincronizarDatosNegocio()`, `cargarDatosNegocio()`, `iniciarListenersDatosNegocio()`. `guardarGastos()`/`guardarRendiciones()` particionan por `vendedor_id` automaticamente
- **Conexion**: `monitorearConexion()` — healthCheck cada 30s, `actualizarIndicadorConexion()` — badge verde(sincronizado)/amarillo(conectando)/rojo(sin conexion) + banner offline. Indicador presente en ambos HTML (vendedor header + admin header)

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
  total, tipoPago, notas, estado, tipo_comprobante, vendedor_id, sincronizado,
  numFactura?, cdc?, facturaFecha?, sifen_xml_generado?, sifen_cdc?, sifen_qr_url?,
  alerta_fraude?, fraude_detalle?, fraude_fecha?,  // Inyectados por trigger trg_validar_precios
  // NC-: cdc_nc, cdc_referenciado, factura_referenciada_id, motivo_emision
  // NRE-: receptor, transporte{motivo,responsable,km,tipo_transporte,modalidad,fecha_inicio,fecha_fin}, salida{direccion,nro,ciudad}, entrega{...}
}
```

## Persistencia offline (IndexedDB)

`HDVStorage` (js/utils/storage.js): wrapper IndexedDB (base `HDV_ERP_DB`, store `keyval`) con cache en memoria.
Migra automaticamente de localStorage a IndexedDB al primer uso. Supabase Auth sigue en localStorage.

**Blindaje Fase 1 (2026-03-25):**
- `navigator.storage.persist()` al init — solicita almacenamiento persistente (protege contra eviccion del navegador)
- `navigator.storage.estimate()` — monitoreo de cuota, alerta al 80%
- `_detectarEviccion()` post-init — detecta keys perdidas y las recupera desde cache en memoria
- `setItem()` retorna `boolean` (`true`=persistido, `false`=fallo). Fallback a localStorage para keys criticas (`hdv_pedidos`, `hdv_catalogo_local`, `hdv_carrito`)
- `getItem()` retorna `structuredClone()` (copia profunda) — evita race conditions por referencia compartida
- `isHealthy()` — flag global de salud del storage
- `atomicUpdate(key, updaterFn)` — mutex per-key (promise-queue) para read-modify-write seguro. `updaterFn` recibe valor actual, retorna nuevo valor. Libera lock en `finally` ante errores. **OBLIGATORIO** para toda mutacion de `hdv_pedidos` en callbacks realtime.

**Keys principales:** `hdv_catalogo_local`, `hdv_pedidos`, `hdv_carrito_${clienteId}`, `hdv_pagos_credito`, `hdv_creditos_manuales`, `hdv_historial_creditos`, `hdv_promociones`, `hdv_gastos`, `hdv_rendiciones`, `hdv_cuentas_bancarias`, `hdv_metas`, `hdv_user_rol/email/nombre`, `hdv_darkmode`, `hdv_auto_backup(s)`.

**SyncManager** (js/services/sync.js): auto-sincroniza pedidos con `sincronizado: false` al detectar conexion online o al arrancar. Mutex para evitar sync concurrentes.

**Blindaje Fase 1 (2026-03-25):**
- **Pre-flight**: `_isSupabaseReachable(5000ms)` antes de cada sync — detecta portales cautivos y zombie 3G (no confiar solo en `navigator.onLine`)
- **Batch upsert**: 50 pedidos/lote via `.upsert(rows, { onConflict: 'id' })` con fallback a individual si batch falla
- **Persistencia incremental**: `HDVStorage.setItem()` tras cada batch exitoso (no al final del loop) — protege contra tab kill mid-sync
- **Retry infinito**: backoff exponencial `5s * 2^attempt` con ±30% jitter, cap 5 min. Sin limite de intentos (antes: max 4)
- **beforeunload** en `app.js`: advierte al vendedor si cierra pestana con pedidos sin sincronizar

## Flujo de datos

1. **Carga**: `HDVStorage.ready()` → `obtenerCatalogo()` → 3 queries paralelas → mapeo legacy → variables globales + cache IndexedDB
2. **Edicion admin**: Modifica `productosData` en memoria → "Guardar y Sincronizar" → IndexedDB + `guardarCatalogo()` (upsert batch + reconcilia eliminaciones)
3. **Realtime**: 4 canales catalogo (debounce 500ms) + pedidos (admin: full re-fetch con debounce 500ms, vendedor: granular INSERT/UPDATE/DELETE con DOM targeting) + 8 configs → sync bidireccional IndexedDB ↔ Supabase
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
- **Mis DTEs** (`js/admin/dtes.js`): emision local de FAC-/NC-/NRE- con estado `sifen_estado: 'generado_local'`. No llama a Edge Function ni a SET directamente — genera el objeto pedido estructurado y lo sincroniza a Supabase. Lista unificada de DTEs emitidos con filtros y export CSV.
- **IVA formula SET**: precio incluye IVA. IVA10 = round(precio*cant/11), IVA5 = round(precio*cant/21). Total bruto = precio × cantidad (sin sumar IVA).

## Imagenes de productos

Bucket `productos_img` (Supabase Storage). Compresion Canvas → WebP 800px max. Upload solo admin.

## MANIFIESTO Y POLITICAS DE SEGURIDAD (STRICT ENFORCEMENT)

> **DIRECTIVA DE AUTO-ACTUALIZACION:** Cada vez que se implemente una nueva medida o protocolo de seguridad en este proyecto, DEBE documentarse automaticamente en esta seccion sin necesidad de que el usuario lo pida explicitamente. Eliminar entradas obsoletas y mantener este manifiesto como fuente unica de verdad.

### P1 — FRONTEND & CSP (Cero tolerancia a ejecucion dinamica)

- **CSP estricto** en `vercel.json`: `script-src` sin `unsafe-eval` ni `unsafe-inline`. Whitelist explicita de CDNs. `frame-src 'none'`, `object-src 'none'`, `base-uri 'self'`. El `unsafe-inline` permanece solo en `style-src` (requerido por Shoelace CSS-in-JS). Todos los handlers inline (178+) migrados a event delegation via `data-action`/`data-section`/`data-arg`.
- **Tailwind CSS compilado estatico** (`npm run build:css` → `dist/tailwind.css`). PROHIBIDO re-agregar el CDN JIT (rompe CSP). Al agregar clases Tailwind nuevas, re-ejecutar build antes de deploy.
- **SRI obligatorio** en todos los scripts externos: `integrity="sha384-..."` + `crossorigin="anonymous"`. Versiones fijadas: Supabase JS 2.99.2, Chart.js 4.4.0, Lucide 0.468.0, jsPDF 2.5.1, JSZip 3.10.1, SheetJS 0.20.3. Excluido: Google Fonts (CSS dinamico). Al actualizar libreria: `curl -sL URL | openssl dgst -sha384 -binary | openssl base64 -A`. URLs con redirect (unpkg) deben apuntar al path final.
- **Prevencion XSS**: `escapeHTML()` obligatorio en TODA interpolacion `innerHTML`. Prohibido inline `onclick` con variables — usar `data-attributes` + `addEventListener`. Event delegation via `ACTION_DISPATCH` whitelist (sin `new Function()`).
- **Sanitizacion de datos**: backups vendedor sin `costo`, sin `precios_personalizados`, RUC recortado. `textContent` para JSON en modals.
- **JWT en localStorage**: mitigado por CSP estricto + eliminacion de vectores XSS.

### P2 — DATABASE ZERO TRUST (La validacion vive en PostgreSQL, no en JS)

- **RLS habilitado y estricto** en TODAS las tablas. Zero politicas `anon`. RPCs con REVOKE de `public`/`anon`.
- **Triggers de validacion server-side** (NUNCA confiar en frontend):
  - `trg_validar_precios`: precio < 50% catalogo, descuento > 30%, total < 40%, qty > 9999 → marca `alerta_fraude: true`, fuerza `pedido_pendiente`.
  - `trg_bloquear_mutacion_terminal`: vendedores no pueden modificar pedidos en estados terminales (facturado, nota_credito, cobrado, entregado, anulado). EXCEPCION (lifecycle-v2): permite la transicion entregado → cobrado_sin_factura (cierre de credito al saldarlo).
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
- `notify_push_pedido_estado()` SECURITY DEFINER: trigger AFTER UPDATE OF estado ON pedidos → pg_net POST a `push-notifications` Edge Function. Activa solo si `push_notifications_url` y `push_webhook_secret` existen en `app_secrets`.
  - Env vars Edge Function: `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_DESTINO`, `WEBHOOK_SECRET`.
  - Tolerante a fallos: siempre retorna HTTP 200 (evita reintentos infinitos).
- **Disaster Recovery**: `DISASTER_RECOVERY.md` (RTO 2h, RPO 24h). `scripts/backup_schema.sh` para cold backup de esquema.

### P6 — GESTION DE SECRETOS (Zero texto plano en codigo)

- **PROHIBIDO** hardcodear tokens, contrasenas, API keys o webhook secrets en archivos JavaScript, HTML o codigo SQL.
- **Secretos de DB/triggers**: almacenados en tabla `app_secrets` (RLS blindado: zero politicas = inaccesible para `anon`/`authenticated`). Solo funciones `SECURITY DEFINER` pueden leer. Para rotar: `UPDATE app_secrets SET value = 'nuevo', updated_at = NOW() WHERE key = '...';` desde SQL Editor.
- **Secretos de Edge Functions**: variables de entorno en Supabase Dashboard → Edge Functions → Secrets (`WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_DESTINO`, `WEBHOOK_SECRET`).
- **Credenciales frontend** (`supabase-init.js`): `SUPABASE_URL` y `SUPABASE_ANON_KEY` son publicos por diseno (protegidos por RLS). No son secretos.

### P7 — EDGE FUNCTIONS (Perimetro de API)

- JWT obligatorio via `supabase.auth.getUser()`. Rate limit persistente en tabla `alertas_rate_limit`: max 5 alertas del mismo tipo por minuto, ventana deslizante, RPC atomica `verificar_rate_limit_alerta` con FOR UPDATE (resiste reinicios de la funcion — B-04 cerrado 2026-06-09).
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
- **Persistent Storage**: `navigator.storage.persist()` solicitado al init. Monitoreo de cuota con `navigator.storage.estimate()` (alerta al 80%). Deteccion automatica de eviccion con recuperacion desde cache en memoria.
- **setItem() con retorno boolean**: permite a los consumidores (checkout, SyncManager) detectar fallos de persistencia y alertar al usuario. Fallback a localStorage para keys criticas.
- **getItem() con structuredClone**: retorna copia profunda, eliminando race conditions por referencia compartida entre reads concurrentes.
- **Purga obligatoria en logout**: `guard.js` y `onAuthStateChange('SIGNED_OUT')` limpian TODAS las keys `hdv_*` de IndexedDB (excepto `hdv_darkmode`).
- **Purga obligatoria en Kill Switch**: si `verificar_estado_cuenta()` retorna `activo=false` → purga completa + `signOut()` + redirect. Aplica en `guard.js` y en `SyncManager` pre-sync.
- **SyncManager blindado**: mutex + pre-flight reachability check + batch upsert (50/lote) + persistencia incremental + retry infinito con backoff exponencial + jitter (cap 5 min). Verifica estado de cuenta antes de cada sync.
- **beforeunload en app vendedor**: advierte al cerrar pestana si hay pedidos con `sincronizado: false`.
- **Checkout con verificacion de persistencia**: los 3 flujos (PED/REC/FAC) verifican retorno boolean de `setItem()` y muestran warning toast si falla.
- **Datos sensibles excluidos de cache offline**: `costo` y `precios_personalizados` no se almacenan en IndexedDB del vendedor (filtrados por RPC/VIEWs server-side).

### P10 — DEFENSA PERIMETRAL Y CADENA DE SUMINISTRO

- **Versiones fijadas obligatorias**: todas las librerias CDN tienen version exacta en la URL (no `@latest`). SRI valida integridad de cada script.
- **WAF Cloudflare (B-03 — PARCIALMENTE REMEDIADO)**: Cuenta Cloudflare creada (`d3176bc9147a3585769632b5818377a1`). Vercel headers de seguridad configurados (HSTS, CSP, X-Frame-Options, nosniff). **Requiere dominio personalizado** para activar proxy WAF + Bot Fight Mode. Ver guia de activacion en `GUIA_CLOUDFLARE_WAF.md`. DDoS y proteccion SSL ya provistas por Vercel Edge Network para subdominios `.vercel.app`.
- **Auditoria SCA (B-05 — REMEDIADO)**: Dependabot v2 configurado en `.github/dependabot.yml`. Escaneo semanal (lunes) de dependencias npm.
- **Service Worker versionado**: `const VERSION` se incrementa en cada deploy. Cache viejo se purga en `activate` (excepto `hdv-imagenes`). Estrategia por capas: Supabase API → Network-First con cache `hdv-supabase-api` como fallback offline (solo cachea GETs, no mutaciones). HTML/JS → Network-First. Assets estaticos → Cache-First. Imagenes → Cache-First dedicado `hdv-imagenes`.
- **Principio**: la cadena de suministro (CDNs, npm, service worker) es un vector de ataque. Cada eslabón debe tener version fijada, hash verificado, y mecanismo de actualizacion controlada.

### Historial de auditorias

| Version | Tipo | Hallazgos | Estado |
|---------|------|-----------|--------|
| V1 | Zero Trust | 26 | Todos remediados |
| V2 | Red Team | 9 (1C, 3A, 4M, 1B) | Todos remediados 2026-03-19 |
| V3 | Insider Threats | 10 (2C, 3A, 3M, 2B) | Todos remediados 2026-03-19 |
| V4 | White-Box Audit | 9 brechas residuales | B-01 MFA, B-02 CSP (unsafe-inline eliminado), B-04 rate limit persistente (tabla DB + RPC FOR UPDATE), B-05 Dependabot, B-06 secretos — todos remediados 2026-06-09. B-03 WAF parcial (cuenta CF creada, headers Vercel listos, requiere dominio custom) |
| E2E | Flujo Datos E2E | 10 puntos ciegos | 7 reparados (vendedor badge, fraude, filtros, CSV, tipo comprobante, editado, IVA). 3 pendientes decision negocio. 2026-03-25 |
| Fase 1 | Integridad de Datos | 14 (3C, 6M, 5B) | 12 remediados: storage blindaje, sync robustez, gastos aislamiento, auto-paginacion, debounce realtime, beforeunload. 2026-03-25 |

## Ciclo de vida del pedido (lifecycle-v2)

Todo gira en torno al **numero_pedido sagrado** (#0000000, secuencial, server-side, unico).
Invariante ERP: **un numero vive en UNA sola seccion a la vez** segun su estado.

```
pedido_pendiente ──[ENTREGAR → modal 3 botones (abrirModalEntrega)]──►
   • Cobro total      → cobrado_sin_factura  → ARCHIVO (Ventas)
   • Cobro parcial    → entregado (saldo)    → CREDITOS (mismo numero)
   • Ingresar credito → entregado (total)    → CREDITOS (mismo numero)
entregado ──[pagos hasta saldo 0]──► cobrado_sin_factura → ARCHIVO
```

| Estado | Unica ubicacion operativa |
|--------|---------------------------|
| pedido_pendiente | Mis Pedidos (Activos) |
| entregado (saldo>0) | Creditos (admin y vendedor) |
| cobrado_sin_factura / facturado_mock / nota_credito_mock / anulado | Archivo (Ventas) |

- **Libro de cobros unificado** `hdv_pagos_credito`: TODO cobro (contado y credito) se registra ahi,
  con `numero_pedido` y `tipo` (contado|credito). **Cobrado(periodo) = Σ libro** (fuente unica, sin doble conteo).
  **Ventas(periodo) = Σ pedidos.total**. **A rendir = Cobrado − Gastos**.
- **Historial** `hdv_historial_creditos`: cada cobro escribe un evento (numero, monto, quien) → feed del dashboard.
- Dashboard: KPI "Cobrado Hoy" desde libro; panel "Pedidos sin finalizar" (radar pendiente+entregado con aging);
  feed "Historial de cobros". Son lentes de SOLO LECTURA (no son una ubicacion del invariante).
- **Creditos manuales** = recordatorios personales del dueño: AISLADOS, sin numero, fuera de stats/balance/historial/sync.
- Migracion `supabase/migrations/lifecycle-v2.sql` (manual): wipe mock, reset secuencia a #0, excepcion del trigger terminal.
- Reset local one-shot en supabase-config.js (`LIFECYCLE_RESET_VERSION`): purga pedidos/pagos/historial locales, conserva manuales.

## Reglas operativas

- **NO bloquear por stock en la app del vendedor**. Flujo: levantar pedido → comprar mercaderia → entregar.
- **Al ENTREGAR siempre se abre el modal de 3 botones** (abrirModalEntrega) — vendedor y admin. tipoPago = solo intencion.
- Service worker: incrementar `VERSION` en cada deploy.
- `productos.json` es fallback estatico, no fuente de verdad.
- Variantes se reemplazan atomicamente via RPC `reemplazar_variantes` (no update individual).
- Admin: para import masivo y edicion inline de stock, modifica en memoria y guarda junto ("Guardar y Sincronizar"). Para la **carga/edicion/gestion de catalogo uno a uno** (modal guiado, CRUD inline y reorden drag&drop), cada cambio **auto-guarda** al instante (guardarProductoIndividual/guardarCategoriaIndividual/persistirOrden*) y se publica al vendedor por realtime.
- Pedidos: IndexedDB es fuente primaria para lectura, Supabase para sync entre dispositivos.
- IDs de pedidos generados con `crypto.randomUUID()` (PED-, REC-, FAC-). No usar Date.now() ni Math.random().
- **PROHIBIDO modificar** el codigo de generacion XML, CDC, integracion SIFEN/SET o Edge Functions sin autorizacion explicita.

## Sistema de UI — "Command Center" (dark) + Shoelace + Tailwind CSS

**Estado:** Rediseño integral oscuro completado. TODO el sistema (admin escritorio + PWA vendedor + login) comparte el lenguaje "command center" estilo **shadcn/ui (paleta zinc)**: warm-black + acento **acero/zinc**, tipografia **Geist Sans / Geist Mono** (montos/labels en mono tabular), esquinas suaves, grano+grilla sutil y animaciones. Shoelace en tema **oscuro** (`themes/dark.css`) con `--sl-color-primary` mapeado a acero. Se mantuvo Shoelace (no se migro a otra libreria): el look premium viene del design system, no del componente.

**Baseline oscuro:** `body.theme-dark` en index.html y admin.html (login ya es oscuro nativo). La app vendedor ademas conserva `document.body.classList.add('dark-mode')` (historico). NO hay toggle claro/oscuro — el oscuro es el diseño, no una opcion.

**Design tokens** (`src/input.css`, fuente unica compartida con login):
- `:root` define superficies (`--ground/--panel/--panel-2/--panel-3/--hairline`), tinta (`--ink/--ink-2/--muted/--faint`), acento (`--steel/--steel-bright/--steel-soft`), estados (`--ok/--warn/--alert`), easing Emil (`--ease-out/--ease-io`), radios sharp y fuentes (`--hdv-font-sans/-mono`).
- Overrides Shoelace: `--sl-color-primary-*` = escala acero, `--sl-font-sans` = Geist, focus ring acero.
- **Capa de motion compartida**: `.reveal`/`.reveal.dN` (stagger), `.screen-in`, `.pip`/`.pip.is-online|is-checking|is-down` (estado operativo), press feedback global, grano+grilla via `body.theme-dark::before/::after`, guard `prefers-reduced-motion`.
- **Sistema de animaciones PREMIUM (app vendedor)**: tokens `--ease-spring/--ease-drawer/--dur-*` en index.html; utilidades `.hdv-in`, `.hdv-stag`/`.hdv-stag-grid` (stagger), `.hdv-view-slide` (cambio de vista), `.hdv-sheet-in` (bottom-sheet curva iOS), `.hdv-bubble-in`/`.hdv-typing` (chat Cartón), `.hdv-pop-in`/`.hdv-panel-in` (overlays). Count-up de números via `animarValor()` en helpers.js (carrito, dashboard con `data-countup`). Drag-to-dismiss: `_attachSheetDrag` (sheet variantes) y `_attachDrawerSwipeOnce` (carrito) en ui.js. Toasts estilo Sonner con swipe-to-dismiss en dialogs.js. **Anti doble-toque-zoom**: `* { touch-action: manipulation }` (no se hereda) + viewport SIN `user-scalable=no` (pinch sí, doble toque no). Solo `transform`/`opacity`, <340ms, master guard `prefers-reduced-motion`.
- **CAPA DE REMAPEO OSCURO**: bajo `body.theme-dark` se redefine el significado de las clases Tailwind "claras" usadas en el markup generado (`bg-white→panel`, `text-gray-*→ink/muted`, `border-gray-*→hairline`, familia `indigo-*→acero`). Esto oscurece el grueso de la app SIN editar el JS clase por clase. Especificidad `(body.theme-dark .x)` gana a `(.x)`.
- Escape hatch `.keep-paper` para superficies que DEBEN seguir claras (QR, logo tiles, placeholders).
- **Chart.js**: tema oscuro global por JS en `js/admin/dashboard.js` (`Chart.defaults` color/borderColor/font/tooltip). Los canvas NO se tematizan por CSS. Datasets clave usan acero/ink (no índigo ni casi-negro).
- Clases utilitarias: `.mono`, `.amount`/`.tnum` (mono tabular), `.eyebrow-label`, `.sl-dark-input`, `.mtz-input`, `.masivo-input`, `.sl-btn-whatsapp`, `.header-icon-btn`. `tailwind.config.js` extiende colores semanticos (`ground/panel/ink/steel/...`), `fontFamily` (Geist), radios (`hdv`, `hdv-sharp`), sombras.
- **Al agregar markup nuevo**: usá clases Tailwind claras normales (el remapeo las oscurece) o las semanticas (`bg-panel`, `text-ink`, `text-steel`). Acento = acero, NUNCA índigo. Montos en `.amount`.

**Componentes Shoelace en uso:**
- `sl-dialog` — todos los modales (16 convertidos de div.modal-overlay)
- `sl-drawer` — carrito del vendedor (placement="end")
- `sl-button` — botones de accion, category pills (pill variant)
- `sl-input`, `sl-textarea`, `sl-select` — formularios
- `sl-switch` — toggles
- `sl-icon-button`, `sl-icon` — botones iconicos
- `sl-tag`, `sl-badge` — zone pills, badges informativos

**Funciones compartidas (`js/utils/dialogs.js`):**
- `mostrarToast(mensaje, tipo, duracion)` — toast estilo Sonner (.hdv-toast apilado en #toastContainer, swipe-to-dismiss), con agrupacion y debounce
- `mostrarExito(msg)` — shortcut para toast success
- `mostrarConfirmModal(mensaje, opciones)` — sl-dialog dinamico, retorna Promise<boolean>
- `mostrarInputModal(opciones)` — sl-dialog dinamico con campos (text, number, select, select-search, textarea), retorna Promise<datos|null>

**Componentes intencionalmente nativos (NO migrar a Shoelace):**
- **FAB carrito** (index.html): div fixed centrado en bottom con pointer-events-none, button `#viewCartBtn` con pointer-events-auto. No usar nav bar — el bottom nav de 4 tabs fue eliminado.
- **Sidebar nav items** (admin.html, 16 botones): nav items con CSS hover/active custom. sl-menu es para dropdowns, no para navegacion persistente.
- **Product cards** (ui.js): 100+ cards con lazy-load, IntersectionObserver, chunked rendering. sl-card agrega Shadow DOM que complica queries y pesa mas.
- **Status badges en pedidos** (pedidos.js): 6+ estados con colores Tailwind custom. sl-badge solo tiene 5 variantes predefinidas — insuficiente granularidad.
- **Admin tables/lists**: datasets grandes sin beneficio de Shoelace en rows de tabla.
