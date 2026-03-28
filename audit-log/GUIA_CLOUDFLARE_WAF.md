# Guia de Activacion WAF — Cloudflare + Vercel (B-03)

> **Estado**: Parcialmente remediado (2026-03-22)
> **Auditado via MCP**: Cloudflare Developer Platform + Vercel

## Prerequisito

Se necesita un **dominio personalizado** (ej: `hdvdistribuciones.com.py`, `systemhdv.com`).
Actualmente el proyecto solo usa subdominios `*.vercel.app`.

## Infraestructura verificada

| Componente | Estado | Detalle |
|------------|--------|---------|
| Cuenta Cloudflare | Creada | `d3176bc9147a3585769632b5818377a1` (Diazignacio42@gmail.com) |
| Proyecto Vercel | Activo | `systemhdv` (prj_xH0d1yodWVWaBrEgCLtuBDdbgDp9) |
| Headers seguridad | Configurados | HSTS, CSP, X-Frame-Options, nosniff, Referrer-Policy en `vercel.json` |
| SSL Vercel | Activo | Automatico para dominios `.vercel.app` y custom domains |
| DDoS Vercel | Activo | Edge Network provee proteccion DDoS por defecto |

## Paso 1 — Agregar dominio a Cloudflare

1. Ir a [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click **"Add a site"** → ingresar tu dominio (ej: `hdvdistribuciones.com`)
3. Seleccionar plan **Free** (incluye DDoS + Bot Fight Mode)
4. Cloudflare escaneara los DNS existentes y mostrara los registros encontrados
5. Anotar los **nameservers** asignados (ej: `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`)

## Paso 2 — Cambiar Nameservers en el registrador

1. Ir al panel de tu registrador de dominio (ej: NIC Paraguay, GoDaddy, Namecheap)
2. Cambiar los nameservers al par asignado por Cloudflare
3. Esperar propagacion DNS (puede tomar hasta 24-48 horas, usualmente 1-2 horas)
4. Cloudflare enviara email de confirmacion cuando la zona este activa

## Paso 3 — Configurar DNS apuntando a Vercel

En el panel DNS de Cloudflare, crear los siguientes registros:

### Para dominio apex (hdvdistribuciones.com):

| Tipo | Nombre | Contenido | Proxy |
|------|--------|-----------|-------|
| A | @ | `76.76.21.21` | Proxied (nube naranja) |

### Para subdominio www:

| Tipo | Nombre | Contenido | Proxy |
|------|--------|-----------|-------|
| CNAME | www | `cname.vercel-dns.com` | Proxied (nube naranja) |

> **IMPORTANTE**: La nube naranja (Proxied) es lo que activa el WAF de Cloudflare.
> Si esta gris (DNS Only), el trafico NO pasa por Cloudflare.

## Paso 4 — Agregar dominio en Vercel

1. Ir a [vercel.com](https://vercel.com) → Proyecto `systemhdv` → Settings → Domains
2. Agregar `hdvdistribuciones.com` (y opcionalmente `www.hdvdistribuciones.com`)
3. Vercel generara automaticamente un certificado SSL para el dominio

## Paso 5 — Configurar SSL en Cloudflare

1. En Cloudflare Dashboard → **SSL/TLS** → **Overview**
2. Seleccionar modo **Full (Strict)**
   - Esto garantiza cifrado extremo a extremo (Cloudflare ↔ Vercel)
   - Vercel ya provee certificados SSL validos, asi que Full Strict es seguro

## Paso 6 — Activar Bot Fight Mode

1. En Cloudflare Dashboard → **Security** → **Settings**
2. Filtrar por **Bot traffic**
3. Activar **Bot Fight Mode** → ON
4. (Opcional) Activar **Block AI Bots** → ON (previene scraping por crawlers IA)
5. (Opcional) Activar **AI Labyrinth** → ON (trampa para bots IA)

## Paso 7 — Forzar HTTPS

1. En Cloudflare Dashboard → **SSL/TLS** → **Edge Certificates**
2. Activar **Always Use HTTPS** → ON
3. Activar **Automatic HTTPS Rewrites** → ON
4. Verificar que **Minimum TLS Version** sea **TLS 1.2**

## Paso 8 — Reglas de seguridad adicionales (Free)

### 8a. Security Level
- **Security** → **Settings** → **Security Level** → **Medium** o **High**
- Esto presenta challenges (CAPTCHA) a visitantes sospechosos

### 8b. Browser Integrity Check
- **Security** → **Settings** → activar **Browser Integrity Check**
- Bloquea requests con headers HTTP sospechosos

### 8c. Hotlink Protection
- **Scrape Shield** → activar **Hotlink Protection**
- Previene que otros sitios enlacen directamente a tus imagenes

## Paso 9 — Actualizar CSP en vercel.json

Una vez que el dominio custom este activo, actualizar `vercel.json` para que `connect-src` y `frame-ancestors` reflejen el dominio real si es necesario. El CSP actual ya es compatible con Cloudflare proxy.

## Paso 10 — Verificacion final

Ejecutar estas verificaciones:

```bash
# Verificar que el trafico pasa por Cloudflare (debe mostrar headers cf-*)
curl -sI https://tudominio.com | grep -i "cf-\|server:"

# Verificar SSL Full Strict
curl -sI https://tudominio.com | grep -i "strict-transport"

# Verificar Bot Fight Mode (intentar con user-agent de bot)
curl -sI -A "python-requests/2.28" https://tudominio.com | head -5
```

## Protecciones activas tras completar la guia

| Capa | Proteccion | Proveedor |
|------|------------|-----------|
| L3/L4 | DDoS Network | Cloudflare (automatico) |
| L7 | DDoS Application | Cloudflare (automatico) |
| L7 | Bot Fight Mode | Cloudflare Free |
| L7 | Browser Integrity Check | Cloudflare Free |
| L7 | HTTPS forzado | Cloudflare + Vercel |
| L7 | SSL Full Strict (E2E) | Cloudflare → Vercel |
| L7 | Headers seguridad (CSP, HSTS, etc.) | Vercel (`vercel.json`) |
| L7 | WAF basico (5 custom rules en Free) | Cloudflare Free |

## Notas

- El plan Free de Cloudflare incluye 5 custom WAF rules. Suficiente para reglas basicas de bloqueo por pais, IP, o path.
- Bot Fight Mode NO se puede personalizar en plan Free. Si causa falsos positivos con APIs de pago (ej: Supabase webhooks), considerar upgrade a Pro ($20/mes).
- Los subdominios `*.vercel.app` siguen funcionando como fallback si Cloudflare tiene issues.
- La cuenta Cloudflare ya esta creada y verificada. Solo falta agregar la zona (dominio).
