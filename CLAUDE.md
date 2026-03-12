# HDV Distribuciones - Sistema POS/ERP

Sistema de toma de pedidos y administracion para HDV Distribuciones (Paraguay).
PWA mobile-first para vendedores de calle + panel admin de escritorio.

## Stack

- **Frontend**: Vanilla JS, Tailwind CSS (CDN), Lucide Icons
- **Backend**: Supabase (Auth, PostgreSQL, Storage, Realtime)
- **Deploy**: Vercel (archivos estaticos)
- **PWA**: Service Worker con cache network-first para JS/HTML, cache-first para assets

## Arquitectura de archivos

```
index.html          → App vendedor (mobile PWA)
app.js              → Logica del vendedor (catalogo, carrito, pedidos)
checkout.js         → Flujo de checkout y envio de pedido

admin.html          → Panel admin (desktop)
admin.js            → Logica admin (dashboard, productos, clientes, stock, pedidos)
admin-ventas.js     → Modulo de ventas/facturacion
admin-devoluciones.js → Notas de credito
admin-contabilidad.js → Cierre mensual

supabase-init.js    → Credenciales Supabase (se carga PRIMERO en todos los HTML)
guard.js            → Proteccion de rutas (auth + roles admin/vendedor)
supabase-config.js  → Capa de datos: todas las funciones CRUD contra Supabase
login.html/js       → Pantalla de login

service-worker.js   → Cache PWA (version actual en const VERSION)
manifest.json       → Configuracion PWA
productos.json      → Fallback estatico del catalogo (offline/primera carga)
vercel.json         → Rutas de Vercel
```

## Base de datos (Supabase PostgreSQL)

### Tablas relacionales (catalogo normalizado):
- `categorias` (id TEXT PK, nombre, subcategorias TEXT[], estado)
- `clientes` (id TEXT PK, nombre, razon_social, ruc, telefono, direccion, zona, encargado, tipo, oculto, precios_personalizados JSONB)
- `productos` (id TEXT PK, nombre, categoria_id FK→categorias, subcategoria, imagen_url, estado, oculto, tipo_impuesto)
- `producto_variantes` (id UUID PK, producto_id FK→productos CASCADE, nombre_variante, precio, costo, stock, activo)

### Tablas operativas:
- `pedidos` (id TEXT PK, estado, fecha, datos JSONB)
- `configuracion` (doc_id TEXT PK, datos JSONB) — pagos_credito, promociones, metas, etc.
- `reportes_mensuales` (mes TEXT PK, datos JSONB)
- `perfiles` (id UUID PK FK→auth.users, nombre_completo, rol, activo)

### Tabla legacy (no usar, mantener por ahora):
- `catalogo` (id TEXT PK, categorias JSONB, productos JSONB, clientes JSONB) — reemplazada por tablas relacionales

## Capa de compatibilidad (supabase-config.js)

Las funciones mantienen nombres legacy `*Firebase` por compatibilidad pero usan Supabase:

- `obtenerCatalogoFirebase()` → SELECT paralelo a categorias + clientes + productos(con variantes). Retorna `{categorias, productos, clientes}` con el formato legacy (producto.categoria, producto.presentaciones[])
- `guardarCatalogoFirebase(data)` → UPSERT batch a las 3 tablas + reconcilia eliminaciones + borra/reinserta variantes
- `escucharCatalogoRealtime(cb)` → Escucha las 4 tablas con debounce 500ms
- `_mapProductoRelacional(p)` → Convierte fila DB a formato legacy: categoria_id→categoria, producto_variantes→presentaciones (nombre_variante→tamano, precio→precio_base)

## Formato de datos en memoria (productosData)

```js
productosData = {
  categorias: [{ id, nombre, subcategorias: [], estado }],
  clientes: [{ id, nombre, razon_social, ruc, telefono, direccion, zona, encargado, tipo, oculto, precios_personalizados }],
  productos: [{
    id, nombre, categoria, subcategoria, imagen_url, imagen, estado, oculto, tipo_impuesto,
    presentaciones: [{ tamano, precio_base, costo, stock, activo, variante_id }]
  }]
}
```

## Flujo de datos

1. **Carga**: `obtenerCatalogoFirebase()` → 3 queries paralelas → mapeo a formato legacy → se guarda en `productosData` (admin) o `productos/categorias/clientes` (vendedor) + cache en localStorage
2. **Edicion (admin)**: Modifica `productosData` en memoria → `registrarCambio()` incrementa contador → usuario clickea "Guardar" → `guardarTodosCambios()` → localStorage + `guardarCatalogoFirebase()`
3. **Realtime**: `escucharCatalogoRealtime()` notifica cambios a vendedores en vivo
4. **Offline**: localStorage como cache, service worker para assets

## Imagenes de productos

- Bucket Supabase Storage: `productos_img`
- Compresion frontend: Canvas API, max 800px, WebP quality 0.8
- Upload: `subirImagenProducto(file)` en admin.js

## Autenticacion y roles

- Supabase Auth con email/password
- Tabla `perfiles` con rol: 'admin' | 'vendedor'
- `guard.js` usa RPC `obtener_rol_usuario` (SECURITY DEFINER) para verificar rol
- Admin: acceso a admin.html. Vendedor: solo index.html
- `window.hdvUsuario` expone {id, email, rol, nombre} globalmente

## Reglas importantes

- **NO bloquear por stock en la app del vendedor**. El vendedor puede cargar cualquier cantidad. El flujo es: levantar pedido → comprar mercaderia → entregar.
- Service worker: incrementar `VERSION` en cada deploy para forzar actualizacion del cache.
- Todas las funciones de datos usan nombres `*Firebase` por compatibilidad historica — internamente son 100% Supabase.
- `firebase-config.js` es codigo muerto, no se carga en ningun HTML.
- El archivo `productos.json` es un fallback estatico para primera carga/offline, no es la fuente de verdad.
