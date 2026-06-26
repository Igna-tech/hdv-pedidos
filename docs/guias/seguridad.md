# Checklist de Seguridad — HDV Distribuciones

> **Cuándo leer esta guía:** SIEMPRE antes de hacer commit de cualquier cambio de código.
> Este archivo condensa las políticas P1–P10 de CLAUDE.md en checklists accionables.
>
> Para detalles completos de cada política, ver `CLAUDE.md` sección "MANIFIESTO Y POLÍTICAS DE SEGURIDAD".

---

## Checklist universal (aplica a TODO cambio)

- [ ] Ningún secreto hardcodeado en JS, HTML o SQL (tokens, API keys, passwords, webhook secrets)
- [ ] `escapeHTML()` usado en TODA interpolación `innerHTML` con datos del usuario o de la DB
- [ ] Sin `innerHTML` directo con datos no escapados — usar `textContent` para texto plano
- [ ] Sin `onclick`, `oninput`, `onchange` inline con variables — usar `data-action` + `addEventListener`
- [ ] Sin `eval()`, `new Function()`, `document.write()`
- [ ] Sin `@latest` en URLs de librerías CDN — versión exacta siempre
- [ ] `service-worker.js`: VERSION incrementada si cambiaron archivos cacheados

---

## P1 — Frontend & CSP

- [ ] Todo nuevo handler de evento registrado via `ACTION_DISPATCH` (no inline)
- [ ] Si se agrega un script externo nuevo: calcular SRI (`openssl dgst -sha384 -binary | openssl base64 -A`) y agregar `integrity=` + `crossorigin="anonymous"`
- [ ] Clases Tailwind nuevas: ejecutar `npm run build:css` antes del commit (PROHIBIDO el CDN JIT)
- [ ] Sin `unsafe-eval` ni `unsafe-inline` en script-src (el `unsafe-inline` solo se permite en style-src por Shoelace)
- [ ] Datos JSON en modales: usar `textContent`, no `innerHTML`

**Cómo agregar una librería CDN nueva:**
1. Fijar versión exacta en la URL
2. Calcular hash SRI: `curl -sL [URL] | openssl dgst -sha384 -binary | openssl base64 -A`
3. Agregar `integrity="sha384-[hash]" crossorigin="anonymous"` en el script tag
4. Agregar a `vercel.json` CSP whitelist si el dominio no está
5. Documentar en CLAUDE.md con versión y hash

---

## P2 — Base de datos (Zero Trust)

- [ ] Toda tabla nueva tiene RLS habilitado con políticas explícitas (nunca tabla sin RLS)
- [ ] Zero políticas para `anon` — solo `authenticated` con rol verificado
- [ ] Tablas con datos sensibles: audit trigger conectado a `log_audit_event()`
- [ ] Lógica de validación crítica en triggers/RPCs server-side, no solo en frontend
- [ ] Vendedores no pueden ver `costo` ni `precios_personalizados` — usar VIEWs o RPCs filtradas
- [ ] RPCs nuevas: `REVOKE EXECUTE ON FUNCTION ... FROM public, anon`; solo `authenticated`

---

## P3 — Autenticación

- [ ] Rutas admin verifican AAL2 (MFA) en `guard.js` — no agregar bypass
- [ ] Emails sanitizados con `trim()` + `toLowerCase()` antes de enviar a Supabase Auth
- [ ] No implementar lockouts en localStorage (evasible) — delegar a rate limiting de Supabase Auth
- [ ] Verificación server-side dual: `guard.js` (RPC `obtener_rol_usuario`) + módulo admin (RPC `obtener_mi_rol()`)

---

## P4 — Storage (uploads de archivos)

Al agregar funcionalidad de upload:
- [ ] Validar MIME type en RLS del bucket (`metadata->>'mimetype'` IN whitelist)
- [ ] Límite de tamaño en RLS (`metadata->>'size'` <= límite)
- [ ] Bloquear nombres con más de un punto (previene `shell.php.jpg`)
- [ ] Compresión y conversión a WebP antes del upload (admin admin solamente)
- [ ] DELETE solo para admins

---

## P5 — Forensia y alertas

- [ ] Si se agrega un trigger nuevo que modifica `pedidos`, `configuracion` o `clientes`: verificar que `audit_logs` lo capture
- [ ] Kill Switch: no agregar código que bypasee la verificación `verificar_estado_cuenta()`
- [ ] Si se modifica el flujo de auth: verificar que la purga de IndexedDB en logout sigue funcionando

---

## P6 — Secretos

- [ ] Secretos de DB (para triggers/RPCs): guardar en tabla `app_secrets` con `UPDATE app_secrets SET value = '...'`
- [ ] Secretos de Edge Functions: guardar en Supabase Dashboard → Edge Functions → Secrets
- [ ] `supabase-init.js` (SUPABASE_URL + SUPABASE_ANON_KEY): son públicos por diseño, no son secretos
- [ ] NUNCA commitear `.env` files con valores reales

---

## P7 — Edge Functions

Al modificar Edge Functions (requiere autorización explícita del usuario):
- [ ] JWT verificado con `supabase.auth.getUser()` al inicio
- [ ] CORS: `ALLOWED_ORIGIN` desde env var, nunca `*` en producción
- [ ] Anti-doble ejecución: verificar estado previo antes de procesar
- [ ] Sanitización XML: `sanitizarParaXML()` en datos que van al XML SIFEN
- [ ] Rate limiting via `verificar_rate_limit_alerta` RPC para alertas

> **PROHIBIDO modificar** código de generación XML, CDC, integración SIFEN/SET
> sin autorización explícita del usuario.

---

## P8 — Datos sensibles en frontend

- [ ] Vendedores nunca reciben `costo` ni `precios_personalizados` (filtrados server-side)
- [ ] Exportaciones desde app vendedor: excluir `costo`, excluir `precios_personalizados`, truncar RUC
- [ ] Backups via admin: verificar que no incluyan datos que no corresponden al rol

---

## P9 — Offline / IndexedDB

Al modificar el flujo de pedidos o sync:
- [ ] Usar `HDVStorage.atomicUpdate()` para toda mutación de `hdv_pedidos` en callbacks realtime
- [ ] `setItem()` retorna boolean — verificar y mostrar warning si retorna `false`
- [ ] No guardar datos sensibles (`costo`, `precios_personalizados`) en IndexedDB del vendedor
- [ ] Purga de IndexedDB en logout: verificar que el nuevo módulo no deja datos huérfanos

---

## P10 — Supply Chain

- [ ] Dependabot configurado (`.github/dependabot.yml`) — no deshabilitarlo
- [ ] Versiones de npm: no usar `*` ni `^` para dependencias críticas de seguridad
- [ ] Service worker versionado: si cambian archivos cacheados, incrementar `VERSION`

---

## Escenarios especiales

### Al agregar un campo nuevo a `pedidos`

- [ ] Verificar que `trg_validar_precios` sigue funcionando correctamente
- [ ] Verificar que `trg_bloquear_mutacion_terminal` no bloquea el nuevo campo cuando no debe
- [ ] Verificar que `trg_forzar_fecha_servidor` no interfiere
- [ ] Actualizar formato de `pedido` en CLAUDE.md si el campo va en `datos JSONB`

### Al agregar un módulo con exportación CSV/PDF

- [ ] Sanitizar todos los campos antes de incluirlos en el export
- [ ] Excluir campos sensibles (`costo`, `precios_personalizados`, RUC completo si es export vendedor)
- [ ] No incluir en el export datos de otros vendedores

### Al agregar una nueva sección al sidebar de admin

- [ ] Verificar que el `data-section` coincide exactamente con el `id` de la sección (`seccion-[nombre]`)
- [ ] Agregar en `titulos` de `cambiarSeccion()` en `admin.js`
- [ ] Lazy load: trigger en `cambiarSeccion()`, no en DOMContentLoaded

---

## Cómo agregar una política nueva a este archivo

Abrir este archivo en Obsidian o cualquier editor y agregar bajo la sección P correspondiente:

```markdown
- [ ] **Política nueva**: descripción exacta de qué verificar antes del commit.
  > Motivo: por qué existe esta regla (incidente, requisito legal, hallazgo de auditoría, etc.)
```

Si es una política que aplica a un escenario específico, agregar en la sección "Escenarios especiales":

```markdown
### Al hacer [acción específica]

- [ ] Verificar X
- [ ] Confirmar Y
```
