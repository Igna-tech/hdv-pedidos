# HDV Distribuciones - Sistema POS/ERP

Sistema de toma de pedidos y administracion para HDV Distribuciones (Paraguay).
PWA mobile-first para vendedores de calle + panel admin de escritorio.

## Stack

- **Frontend**: Vanilla JS, Tailwind CSS (CDN), Lucide Icons, Chart.js (admin), jsPDF, JSZip
- **Backend**: Supabase (Auth, PostgreSQL, Storage, Realtime)
- **Deploy**: Vercel (archivos estaticos)
- **PWA**: Service Worker con cache network-first para JS/HTML, cache-first para assets
- **Font**: Inter (Google Fonts)

## Arquitectura de archivos

```
├── index.html              → App vendedor (mobile PWA)
├── app.js                  → Logica vendedor (catalogo, carrito, pedidos, zonas, caja, metas)
├── checkout.js             → 3 flujos de venta: pedido pendiente, recibo interno, factura mock SIFEN
│
├── admin.html              → Panel admin (desktop)
├── admin.js                → Logica admin (dashboard, productos, clientes, stock, pedidos, creditos, promos, backups, rendiciones, metas)
├── admin-ventas.js         → Facturacion: emision de facturas mock SIFEN, reimpresion, WhatsApp
├── admin-devoluciones.js   → Notas de credito: devolucion parcial/total, restaura stock, impresion
├── admin-contabilidad.js   → Cierre mensual: libro RG90 CSV, paquete ZIP con KuDE+XML mock
│
├── supabase-init.js        → Credenciales Supabase (se carga PRIMERO en todos los HTML)
├── guard.js                → Proteccion de rutas (auth + roles admin/vendedor via RPC)
├── supabase-config.js      → Capa de datos: CRUD catalogo relacional + pedidos + configuracion + realtime
├── login.html / login.js   → Login con Supabase Auth, redirect por rol
│
├── service-worker.js       → Cache PWA (version actual en const VERSION)
├── manifest.json           → Configuracion PWA (standalone, portrait)
├── productos.json          → Fallback estatico del catalogo (offline/primera carga)
├── vercel.json             → Rutas de Vercel (/admin → admin.html, etc.)
│
├── supabase-schema.sql     → Schema completo (pedidos, catalogo JSONB legacy, configuracion, reportes, RLS, funciones)
├── supabase-auth-setup.sql → Setup auth: tabla perfiles, trigger auto-crear perfil, RLS, RPC
├── rls-remediation.sql     → Script de remediacion de seguridad RLS (ejecutar en SQL Editor)
└── package.json            → Solo dependencia: @supabase/supabase-js (para script de migracion)
```

## Orden de carga de scripts

**index.html (vendedor):**
supabase CDN → supabase-init.js → guard.js → supabase-config.js → app.js → checkout.js

**admin.html:**
supabase CDN → Chart.js → supabase-init.js → guard.js → supabase-config.js → admin.js → admin-ventas.js → admin-devoluciones.js → admin-contabilidad.js

## Base de datos (Supabase PostgreSQL)

### Tablas relacionales (catalogo normalizado):
- `categorias` (id TEXT PK, nombre, subcategorias TEXT[], estado)
- `clientes` (id TEXT PK, nombre, razon_social, ruc, telefono, direccion, zona, encargado, tipo, oculto, precios_personalizados JSONB)
- `productos` (id TEXT PK, nombre, categoria_id FK→categorias, subcategoria, imagen_url, estado, oculto, tipo_impuesto)
- `producto_variantes` (id UUID PK, producto_id FK→productos CASCADE, nombre_variante, precio, costo, stock, activo)

### Tablas operativas:
- `pedidos` (id TEXT PK, estado, fecha TEXT, datos JSONB, creado_en TIMESTAMPTZ, actualizado_en TIMESTAMPTZ, vendedor_id UUID FK→auth.users) — estados: pedido_pendiente, entregado, cobrado_sin_factura, facturado_mock, nota_credito_mock
- `configuracion` (doc_id TEXT PK, datos JSONB) — docs: pagos_credito, creditos_manuales, promociones, whatsapp_plantilla, gastos_vendedor, rendiciones, cuentas_bancarias, metas_vendedor
- `configuracion_empresa` (id INT PK default 1, ruc_empresa, razon_social, nombre_fantasia, timbrado_numero, timbrado_vencimiento DATE, establecimiento default '001', punto_expedicion default '001', direccion_fiscal, telefono_empresa, email_empresa, actividad_economica, actualizado_en TIMESTAMPTZ) — fila unica con datos fiscales/timbrado de la empresa para facturacion
- `reportes_mensuales` (mes TEXT PK, datos JSONB)
- `perfiles` (id UUID PK FK→auth.users, nombre_completo, rol CHECK('admin','vendedor'), activo, creado_en, actualizado_en)

### Tabla legacy (no usar, mantener por ahora):
- `catalogo` (id TEXT PK, categorias JSONB, productos JSONB, clientes JSONB) — reemplazada por tablas relacionales

### RLS:
- Tablas catalogo/reportes: lectura authenticated, escritura solo admin
- Tabla pedidos: admin ve todo, vendedor solo sus propios pedidos (via vendedor_id)
- Tabla configuracion: lectura/escritura authenticated, borrado solo admin
- Tablas categorias/clientes/productos/variantes: CRUD para authenticated
- Tabla perfiles: usuarios ven/editan su perfil (sin cambiar rol), admins ven/editan todos
- Funciones SECURITY DEFINER: `obtener_rol_usuario()`, `es_admin()`, `obtener_mi_rol()`
- Sin acceso para rol `anon` en ninguna tabla

### Realtime:
- Publicadas: categorias, clientes, productos, producto_variantes, pedidos, configuracion, perfiles

## Capa de datos (supabase-config.js)

### Catalogo (tablas relacionales):
- `obtenerCatalogo()` → SELECT paralelo a categorias + clientes + productos(con variantes JOIN). Retorna `{categorias, productos, clientes}` en formato legacy
- `guardarCatalogo(data)` → UPSERT batch a las 3 tablas + reconcilia eliminaciones + borra/reinserta variantes
- `escucharCatalogoRealtime(cb)` → Escucha 4 tablas con debounce 500ms
- `_mapProductoRelacional(p)` → Convierte fila DB a formato legacy: categoria_id→categoria, producto_variantes→presentaciones (nombre_variante→tamano, precio→precio_base)

### Pedidos:
- `guardarPedido(pedido)` → upsert a tabla pedidos (incluye vendedor_id)
- `actualizarEstadoPedido(id, estado)` → update estado + datos JSONB
- `eliminarPedido(id)` → delete pedido
- `obtenerPedidos()` → select todos ordenados por fecha
- `escucharPedidosRealtime(cb)` → carga inicial + suscripcion realtime con proteccion anti-vaciado

### Configuracion (8 pares guardar/obtener):
- `guardarConfig(docId, datos)` / `obtenerConfig(docId)` → CRUD generico
- Funciones especificas: pagos_credito, creditos_manuales, promociones, whatsapp_plantilla, gastos_vendedor, rendiciones, cuentas_bancarias, metas_vendedor
- `escucharConfigRealtime(docId, localStorageKey)` → sync realtime a localStorage
- `sincronizarDatosNegocio()` → push localStorage → Supabase (8 configs)
- `cargarDatosNegocio()` → pull Supabase → localStorage (8 configs)
- `iniciarListenersDatosNegocio()` → activa 8 listeners realtime

### Shim de compatibilidad:
- `db.collection().doc().set/get()` → shim para codigo legacy menor

### Conexion:
- `monitorearConexion()` → ping cada 30s a tabla categorias, actualiza badge verde/amarillo/rojo

## Formato de datos en memoria

```js
// Admin: productosData (global)
productosData = {
  categorias: [{ id, nombre, subcategorias: [], estado }],
  clientes: [{ id, nombre, razon_social, ruc, telefono, direccion, zona, encargado, tipo, oculto, precios_personalizados }],
  productos: [{
    id, nombre, categoria, subcategoria, imagen_url, imagen, estado, oculto, tipo_impuesto,
    presentaciones: [{ tamano, precio_base, costo, stock, activo, variante_id }]
  }]
}

// Vendedor: variables globales separadas
productos = [...] // filtrado: !oculto && estado !== 'discontinuado'
categorias = [...]
clientes = [...] // filtrado: !oculto

// Pedido (dentro de datos JSONB):
pedido = {
  id, fecha, cliente: { id, nombre, ... }, items: [{ productoId, nombre, presentacion, precio, cantidad, subtotal }],
  total, tipoPago: 'contado'|'credito', descuento, notas, estado,
  vendedor_id, // UUID del vendedor que creo el pedido
  numFactura?, cdc?, facturaFecha? // solo si facturado
}
```

## Modulos funcionales

### App vendedor (app.js + checkout.js)

**Catalogo:**
- Vista categorias con grid de tarjetas (lazy load con IntersectionObserver)
- Vista productos grid-cols-2 con lazy load de imagenes (skeleton → reveal)
- Bottom sheet para seleccion de variantes con steppers [-] qty [+]
- Modo matriz (grid 3 cols) para 6+ variantes (ej: talles de calzado)
- Busqueda por nombre, filtro por categoria
- Busqueda de clientes por nombre o RUC (input con debounce en header)
- Mini-perfil cliente: dias desde ultimo pedido, saldo deuda, top 3 productos
- Productos frecuentes del cliente actual

**Carrito:**
- Carrito por cliente (localStorage `hdv_carrito_${clienteId}`)
- Drawer lateral con swipe-to-delete
- Descuento porcentual
- 3 flujos de checkout: pedido pendiente, recibo interno (print), factura mock SIFEN (CDC + WhatsApp)

**Zonas y rutas:**
- Filtro de clientes por zona geografica
- Vista "Ruta de hoy" con clientes de la zona y estado de pedido

**Mi caja (vendedor):**
- Resumen semanal: ventas contado, ventas credito, gastos, monto a rendir
- Registro de gastos (concepto + monto)
- Cierre de semana con rendicion

**Metas:**
- Widget de progreso de meta mensual con estimacion de comision

**Promociones:**
- `obtenerPromocionesActivas()` / `aplicarPromociones()` — descuento por cantidad, combos, precio mayorista
- Badges de promo en tarjetas de producto

**Backup vendedor:**
- Export/import JSON completo o solo pedidos
- Auto-backup cada 5 min (max 10 snapshots con rotacion)
- Compartir resumen por WhatsApp

**Impresion:**
- Ticket termico 58/80mm
- PDF con jsPDF
- Compartir pedido por WhatsApp

**Otros:**
- Dark mode con persistencia
- Service worker con deteccion de nueva version + cache dedicado para imagenes Supabase Storage
- Banner offline visible cuando se pierde conexion, auto-sync pedidos al reconectar
- Confirm modal reutilizable con opcion destructiva
- Toast notifications (success, error, warning, info)

### Panel admin (admin.js + modulos)

**Dashboard:**
- KPIs: ventas del mes, cantidad pedidos, clientes activos, ticket promedio
- Ganancia neta y margen con color coding
- Grafico barras 7 dias: ventas vs ganancia (Chart.js)
- Top 5 productos (doughnut chart)
- Ranking clientes ultimos 7 dias
- Resumen mensual detallado con export PDF

**Pedidos entrantes:**
- Lista con filtros: fecha, cliente, estado
- Acciones: facturar, marcar entregado/pendiente, editar items, PDF remision, ticket termico, eliminar
- Edicion inline de items (agregar, cambiar cantidad, eliminar)
- Estadisticas: total, pendientes, entregados, recaudacion
- Export CSV

**Inventario (stock):**
- Navegacion por categorias → subcategorias → productos
- Breadcrumb interactivo
- Ajuste de stock por variante: -1, +1, +10
- Filtros: A-Z, disponibles, no disponibles, mas/menos vendidos

**Catalogo de productos:**
- CRUD completo con modal
- Navegacion por categorias con tarjetas visuales (lazy load)
- Toggle producto simple vs multiples variantes
- Modo simple: precio, costo, stock, presentacion
- Modo variantes: filas dinamicas con nombre, precio, costo, stock, toggle activo
- Upload imagen con compresion (Canvas → WebP 800px max → Supabase Storage bucket `productos_img`)
- Perfil detallado de producto con presentaciones editables
- Ocultar/mostrar producto
- Gestion de categorias: crear, eliminar, subcategorias CRUD

**Base de datos de clientes:**
- CRUD completo con modal
- Filtros: busqueda, zona, ocultos
- Paginacion (20 por pagina)
- Perfil de cliente con 3 tabs: precios especiales, historial, estadisticas
- Precios personalizados por producto/variante
- Clientes pendientes de aprobacion (solicitudes desde vendedor)
- Enviar WhatsApp a cliente
- Ocultar/mostrar cliente
- Clientes inactivos (sin pedidos recientes) con WhatsApp de reactivacion

**Control de creditos:**
- Vista dual: creditos de pedidos vs creditos manuales
- Registro de pagos parciales con historial
- Calculo de saldo pendiente y dias de mora (alerta 15+ dias)
- Recordatorio por WhatsApp con plantilla editable
- Deuda agrupada por cliente
- Grafico de analytics de creditos (Chart.js)

**Motor de promociones:**
- 3 tipos: descuento por cantidad, combo (items gratis), precio mayorista
- CRUD con fechas de vigencia
- Activar/desactivar individual
- Sync con Supabase via configuracion

**Ventas y facturacion (admin-ventas.js):**
- Lista de ventas filtrada por fecha y estado
- Facturacion mock SIFEN: genera numero factura + CDC 44 digitos
- Impresion: ticket termico 58mm o A4
- Reimpresion de facturas
- Envio por WhatsApp con datos de factura

**Notas de credito (admin-devoluciones.js):**
- Buscar factura por numero, RUC, nombre o ID
- Devolucion parcial (seleccionar cantidades por item) o cancelacion total (48hs)
- Restaura stock automaticamente al procesar NC
- Impresion NC: termico o A4
- Historial de notas de credito

**Cierre mensual (admin-contabilidad.js):**
- Selector mes/anio
- Preview de registros del periodo (facturas + NC)
- Export libro RG90 como CSV (compatible Excel con BOM)
- Export paquete ZIP con KuDE (mock PDF) + XML (mock SIFEN) por documento

**Rendiciones de caja:**
- Resumen semanal: ventas contado, credito, gastos, monto a rendir
- Historial de rendiciones

**Metas y comisiones:**
- CRUD de metas mensuales por vendedor
- Objetivo en Gs. con porcentaje de comision

**Cuentas bancarias:**
- CRUD de cuentas bancarias de la empresa

**Sistema y herramientas:**
- Info de backup con fecha ultimo backup
- Backup completo / solo productos / solo pedidos (JSON download)
- Auto-backup con rotacion (max 50 snapshots)
- Importacion masiva CSV/XLSX con SheetJS: modal de mapeo de columnas, upsert por nombre/RUC (no duplica)
- Plantillas CSV y JSON descargables para productos y clientes
- Forzar actualizacion (limpiar caches)

## localStorage keys

| Key | Descripcion |
|-----|-------------|
| `hdv_catalogo_local` | Cache del catalogo completo (categorias + productos + clientes) |
| `hdv_pedidos` | Todos los pedidos/facturas/NC |
| `hdv_carrito_${clienteId}` | Carrito guardado por cliente (vendedor) |
| `hdv_clientes_pendientes` | Solicitudes de alta de cliente desde vendedor |
| `hdv_pagos_credito` | Pagos registrados contra creditos |
| `hdv_creditos_manuales` | Creditos creados manualmente |
| `hdv_promociones` | Promociones activas |
| `hdv_whatsapp_mensaje_credito` | Plantilla de recordatorio WhatsApp |
| `hdv_gastos` | Gastos del vendedor |
| `hdv_rendiciones` | Rendiciones semanales |
| `hdv_cuentas_bancarias` | Cuentas bancarias |
| `hdv_metas` | Metas de ventas |
| `hdv_user_rol` | Rol del usuario logueado |
| `hdv_user_email` | Email del usuario logueado |
| `hdv_user_nombre` | Nombre del usuario logueado |
| `hdv_darkmode` | Dark mode activado (vendedor) |
| `hdv_auto_backup` / `hdv_admin_auto_backup` | Auto-backup habilitado |
| `hdv_auto_backups` / `hdv_admin_auto_backups` | Snapshots de auto-backup |
| `hdv_ultimo_backup_fecha` / `hdv_admin_ultimo_backup` | Timestamp ultimo backup |

## Flujo de datos

1. **Carga**: `obtenerCatalogo()` → 3 queries paralelas → mapeo a formato legacy → `productosData` (admin) o variables globales (vendedor) + cache en localStorage
2. **Edicion (admin)**: Modifica `productosData` en memoria → `registrarCambio()` (auto-backup al primer cambio) → usuario clickea "Guardar y Sincronizar" → `guardarTodosCambios()` → localStorage + `guardarCatalogo()` (upsert batch relacional)
3. **Realtime vendedor**: `escucharCatalogoRealtime()` → 4 canales (categorias, clientes, productos, variantes) con debounce 500ms → actualiza UI + cache localStorage
4. **Realtime pedidos**: `escucharPedidosRealtime()` → notifica nuevos pedidos al admin en vivo
5. **Sync configuracion**: 8 listeners realtime (pagos, creditos, promos, etc.) → sync bidireccional localStorage ↔ Supabase
6. **Offline**: localStorage como fuente, service worker para assets, sync al reconectar

## Imagenes de productos

- Bucket Supabase Storage: `productos_img`
- Compresion frontend: Canvas API, max 800px, WebP quality 0.8
- Funcion: `subirImagenProducto(file)` en admin.js → `comprimirImagen()` → upload → getPublicUrl
- Productos referencian URL publica en `imagen_url`

## Autenticacion y roles

- Supabase Auth con email/password
- Tabla `perfiles` con rol: 'admin' | 'vendedor', campo activo para desactivar usuarios
- Trigger PostgreSQL: auto-crea perfil al registrar usuario nuevo
- `guard.js` usa RPC `obtener_rol_usuario` (SECURITY DEFINER) para bypass RLS al verificar rol
- Admin → admin.html. Vendedor → index.html. No autenticado → login.html
- `window.hdvUsuario` expone {id, email, rol, nombre} globalmente
- `login.js` detecta sesion existente y redirige, maneja errores especificos (credenciales, rate limit, email no confirmado)

## Facturacion mock SIFEN

- Numero factura: formato `001-001-NNNNNNN` (7 digitos random)
- CDC: 44 digitos random (simulado)
- Estados de pedido post-facturacion: `cobrado_sin_factura`, `facturado_mock`, `nota_credito_mock`
- Formatos de impresion: ticket termico 58mm (@page 58mm) y A4
- Export contable: CSV libro RG90 + ZIP con KuDE/XML mock
- Desglose IVA: asume 10% sobre total

## Reglas importantes

- **NO bloquear por stock en la app del vendedor**. El vendedor puede cargar cualquier cantidad. El flujo es: levantar pedido → comprar mercaderia → entregar.
- Service worker: incrementar `VERSION` en cada deploy para forzar actualizacion del cache.
- `firebase-config.js` fue eliminado — el proyecto es 100% Supabase.
- `productos.json` es fallback estatico, no es la fuente de verdad.
- Al guardar catalogo, se reconcilian eliminaciones (compara IDs en DB vs en memoria, borra los que faltan).
- Las variantes se borran y reinsertan completas en cada guardado (no update individual).
- El admin modifica datos en memoria y guarda todo junto ("Guardar y Sincronizar"), no guarda campo por campo.
- Los pedidos se guardan en localStorage Y Supabase simultaneamente. localStorage es la fuente primaria para lectura, Supabase para sync entre dispositivos.
