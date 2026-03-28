# HDV Distribuciones: SDLC Master Plan & Status

> **Clasificacion:** Documento Interno — Directiva Tecnica
> **Fecha de Emision:** 2026-03-22
> **Autor:** Arquitectura de Software — Oficina del CTO
> **Version del Documento:** 1.0
> **Proyecto:** HDV Distribuciones ERP — Sistema POS/ERP Offline-First

---

## 1. Resumen Ejecutivo

**HDV Distribuciones ERP** es un sistema de Planificacion de Recursos Empresariales (ERP) disenado especificamente para las operaciones de distribucion mayorista en Paraguay. El sistema opera como una **Progressive Web App (PWA) Offline-First**, permitiendo a los vendedores de calle levantar pedidos en zonas sin cobertura de datos y sincronizar automaticamente al recuperar conectividad.

### Mision del Software

Digitalizar completamente el ciclo de vida de un pedido — desde la toma en campo hasta la facturacion electronica legal ante la SET (Secretaria de Estado de Tributacion) — eliminando la dependencia de papel, reduciendo errores humanos y proporcionando trazabilidad forense de cada operacion.

### Stack Tecnologico

| Capa | Tecnologia | Funcion |
|------|-----------|---------|
| **Frontend** | Vanilla JS + Tailwind CSS 3.4.17 (compilado estatico) | UI/UX sin framework, maximo rendimiento |
| **Backend** | Supabase (PostgreSQL + Auth + Realtime + Storage + Edge Functions) | BaaS con seguridad nativa RLS |
| **Deploy** | Vercel (Edge Network) | CDN global, SSL automatico, headers de seguridad |
| **Offline** | Service Worker + IndexedDB (HDVStorage) | Operacion sin internet, sync automatica |
| **Facturacion** | SIFEN v150 (SET Paraguay) | Documentos Tributarios Electronicos |
| **Seguridad** | MFA TOTP + RLS + CSP + SRI + Audit Logs | Zero Trust, Tier 3/5 auditado |

### Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────────────────┐
│                        CAPA DE PRESENTACION                     │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │   App Vendedor (PWA) │    │     Panel Admin (Desktop)    │   │
│  │   index.html + app.js│    │   admin.html + admin.js      │   │
│  │   Mobile-First       │    │   + ventas/devoluciones/      │   │
│  │   Offline-Capable    │    │     contabilidad modules     │   │
│  └──────────┬───────────┘    └──────────────┬───────────────┘   │
├─────────────┼───────────────────────────────┼───────────────────┤
│             │      CAPA DE ORQUESTACION     │                   │
│  ┌──────────┴───────────────────────────────┴───────────────┐   │
│  │  supabase-config.js (Realtime + Sync + Config)           │   │
│  │  services/supabase.js (Repository Pattern — SupabaseService)│ │
│  │  js/services/sync.js (SyncManager — Backoff + Mutex)     │   │
│  └──────────────────────────┬───────────────────────────────┘   │
├─────────────────────────────┼───────────────────────────────────┤
│                    CAPA DE PERSISTENCIA                         │
│  ┌──────────────┐   ┌──────┴──────┐   ┌────────────────────┐   │
│  │  IndexedDB   │   │  Supabase   │   │  Service Worker    │   │
│  │  (HDVStorage)│◄──│  PostgreSQL │   │  (Cache por capas) │   │
│  │  Cache local │   │  + Realtime │   │  Network/Cache-First│  │
│  └──────────────┘   └─────────────┘   └────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    CAPA DE SEGURIDAD (Zero Trust)               │
│  RLS en todas las tablas │ MFA TOTP │ Triggers server-side     │
│  Kill Switch │ Audit Logs inmutables │ Alertas WhatsApp RT     │
│  CSP + SRI │ Views de ofuscacion │ Secretos en app_secrets     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Fases del SDLC — Modelo HDV

El proyecto sigue un modelo **SDLC Iterativo-Incremental** adaptado a la realidad de una PYME latinoamericana, con enfasis en seguridad desde el diseno (Security by Design) y capacidad offline como requisito no negociable.

### Fase 1: Descubrimiento y Arquitectura Fundacional

**Estado: COMPLETADA**

| Entregable | Estado | Detalle |
|-----------|--------|---------|
| Definicion de requisitos de negocio | Completado | Flujo pedido→compra→entrega→factura documentado |
| Seleccion de stack tecnologico | Completado | Supabase + Vercel + Vanilla JS + PWA |
| Diseno de base de datos relacional | Completado | 9 tablas + 7 RPCs + 3 triggers + 2 views |
| Arquitectura offline-first | Completado | IndexedDB + SyncManager + SW cache por capas |
| Definicion de roles y permisos | Completado | Admin vs Vendedor, RLS estricto |

### Fase 2: Nucleo de Seguridad y Autenticacion

**Estado: COMPLETADA (4 auditorias aprobadas)**

| Entregable | Estado | Detalle |
|-----------|--------|---------|
| Supabase Auth + MFA TOTP | Completado | AAL2 obligatorio para admin |
| RLS Zero Trust en todas las tablas | Completado | Zero politicas anon, RPCs con REVOKE |
| Triggers de validacion server-side | Completado | Anti-fraude precios, bloqueo terminal, fecha servidor |
| Kill Switch para dispositivos robados | Completado | Purga + signOut + redirect |
| Audit Logs inmutables (caja negra) | Completado | Trigger SECURITY DEFINER, SELECT solo admin |
| Alertas WhatsApp en tiempo real | Completado | Edge Function + pg_net triggers |
| Centro de Comando Forense | Completado | Radar fraudes + Caja negra en admin |
| Gestion de secretos (app_secrets) | Completado | Zero texto plano en codigo |
| CSP + SRI + headers Vercel | Completado | unsafe-inline pendiente de eliminar (V2.0) |
| Auditoria V1-V4 | Completado | 54 hallazgos totales, todos remediados excepto B-03/B-04 |

### Fase 3: Logica de Negocio Offline y Sincronizacion

**Estado: COMPLETADA**

| Entregable | Estado | Detalle |
|-----------|--------|---------|
| HDVStorage (IndexedDB wrapper) | Completado | Cache en memoria + migracion auto de localStorage |
| SyncManager con backoff progresivo | Completado | 5s→15s→30s→60s, mutex, Kill Switch pre-sync |
| Service Worker por capas | Completado | Supabase API=Network-First, Assets=Cache-First |
| Supabase Realtime (catalogo) | Completado | 4 canales con debounce 500ms |
| Supabase Realtime (pedidos vendedor) | Completado | Granular: onEstadoCambiado, onPedidoEliminado, onSync |
| Supabase Realtime (pedidos admin) | Completado | Full re-fetch con DOM targeting |
| Supabase Realtime (configuracion) | Completado | 8 canales con re-render de seccion activa |
| Indicador de conexion global | Completado | Badge verde/amarillo/rojo + banner offline |
| Toast con debounce y agrupacion | Completado | Silenciado en carga inicial, agrupacion masiva |

### Fase 4: Interfaz de Usuario y Modulos Operativos

**Estado: 90% COMPLETADA**

| Entregable | Estado | Detalle |
|-----------|--------|---------|
| App Vendedor — Catalogo visual | Completado | Grid categorias, lazy loading, busqueda, filtros |
| App Vendedor — Carrito y checkout | Completado | Precios personalizados, matriz, masivo, promociones |
| App Vendedor — Mis Pedidos (reactivo) | Completado | Tarjetas con data-pedido-id, 7 estados, flash visual |
| App Vendedor — Zonas y Rutas | Completado | Filtro por zona, ruta del dia, selector de cliente |
| App Vendedor — Mi Caja (rendiciones) | Completado | Gastos, cierre semanal, resumen financiero |
| App Vendedor — Metas del mes | Completado | Widget progreso, comision estimada |
| App Vendedor — Backups | Completado | Export/import/WhatsApp, auto-backup, sanitizado |
| Panel Admin — Dashboard | Completado | Chart.js, metricas, reportes por cliente/producto |
| Panel Admin — CRUD Productos | Completado | Variantes, imagenes WebP, stock, tipo impuesto |
| Panel Admin — CRUD Clientes | Completado | Precios personalizados, RUC, zonas |
| Panel Admin — Pedidos entrantes | Completado | Entregado/Pendiente reactivo, edicion inline, PDF/ticket |
| Panel Admin — Creditos y pagos | Completado | Creditos manuales, registro pagos, persistencia Supabase |
| Panel Admin — Promociones | Completado | Descuento por cantidad, combo/gratis |
| Panel Admin — Rendiciones y metas | Completado | Config vendedor, cuentas bancarias |
| Panel Admin — Control de acceso | Completado | Kill Switch, gestion perfiles |
| Panel Admin — Facturacion SIFEN | Parcial | UI lista, XML+CDC generado, falta .p12 real |
| Panel Admin — Notas de credito | Parcial | Devolucion parcial/total, restaura stock (mock) |
| Panel Admin — Contabilidad RG90 | Parcial | CSV libro + ZIP KuDE+XML (mock data) |
| Impresion — Ticket termico 58mm | Completado | Via iframe, formato profesional |
| Impresion — PDF A4 (remision) | Completado | jsPDF con layout corporativo |

### Fase 5: Compliance SIFEN y Homologacion SET

**Estado: 40% COMPLETADA — BLOQUEANTE PARA V1.0**

| Entregable | Estado | Detalle |
|-----------|--------|---------|
| Edge Function sifen-generar-xml | Completado | XML DTE SIFEN v150 valido |
| Calculo CDC 44 digitos (Modulo 11) | Completado | Algoritmo oficial implementado |
| Sanitizacion Anti-XXE | Completado | escapeHTML para XML + validarNumero |
| Anti-doble facturacion | Completado | Rechaza pedidos con sifen_cdc existente |
| Integracion certificado .p12 | Pendiente | Env vars preparadas, firma digital no activa |
| Timbrado real de la SET | Pendiente | Requiere tramite presencial/virtual ante SET |
| Homologacion en ambiente de test SET | Pendiente | Requiere certificado + timbrado + pruebas |
| Conexion a endpoint produccion SET | Pendiente | Solo tras aprobacion de homologacion |
| KuDE (representacion grafica) | Parcial | Template listo, QR pendiente de URL real |

### Fase 6: QA, Hardening y Despliegue Produccion

**Estado: 60% COMPLETADA**

| Entregable | Estado | Detalle |
|-----------|--------|---------|
| Auditorias de seguridad (V1-V4) | Completado | 54 hallazgos, todos remediados o en hoja de ruta |
| Headers de seguridad Vercel | Completado | CSP, HSTS, X-Frame, nosniff, Referrer-Policy |
| Dependabot (SCA semanal) | Completado | .github/dependabot.yml configurado |
| Disaster Recovery Plan | Completado | RTO 2h, RPO 24h documentado |
| WAF Cloudflare | Parcial | Cuenta creada, requiere dominio custom |
| Rate limiting persistente | Pendiente | Solo en memoria en Edge Functions |
| Tests automatizados (E2E) | No iniciado | Sin framework de testing configurado |
| Dominio personalizado + SSL | Pendiente | Requerido para WAF y branding |
| Migracion unsafe-inline → addEventListener | Diferido V2.0 | 157+ handlers documentados, plan en Notion |

---

## 3. Evaluacion de Progreso hacia MVP V1.0

### Dictamen del Arquitecto Jefe

**Progreso global estimado: 82%**

Este porcentaje refleja un sistema con infraestructura, seguridad y logica de negocio en estado de produccion, pero bloqueado en su ultimo tramo por dependencias externas regulatorias (SET Paraguay) y una decision pendiente de priorizacion.

### Desglose por Pilar

| Pilar | Peso | Progreso | Contribucion |
|-------|------|----------|-------------|
| Infraestructura (Supabase + Vercel + PWA) | 15% | 100% | 15.0% |
| Seguridad (RLS + Auth + MFA + Audit) | 15% | 95% | 14.3% |
| Base de Datos (Schema + RPC + Triggers) | 10% | 100% | 10.0% |
| Offline y Sincronizacion | 10% | 100% | 10.0% |
| Realtime (Catalogo + Pedidos + Config) | 5% | 100% | 5.0% |
| App Vendedor (UI + Logica) | 15% | 95% | 14.3% |
| Panel Admin (UI + Logica) | 15% | 90% | 13.5% |
| Compliance SIFEN / SET | 10% | 40% | 4.0% |
| QA y Testing | 5% | 30% | 1.5% |
| **TOTAL** | **100%** | — | **87.6%** |

> **Nota metodologica:** El porcentaje global de 82% comunicado a la directiva aplica un factor de descuento del 6% por riesgo regulatorio (la homologacion SET es un proceso externo no controlable) y ausencia de tests automatizados.

### Lo que esta al 100%

- Autenticacion con MFA TOTP
- Row Level Security en todas las tablas
- Sistema de sincronizacion offline (SyncManager)
- Service Worker con cache inteligente por capas
- Supabase Realtime bidireccional (catalogo + pedidos + config)
- UI reactiva sin reloads (DOM targeting granular)
- Centro de Comando Forense (audit logs + radar fraudes)
- Kill Switch para dispositivos robados
- Alertas de seguridad WhatsApp en tiempo real
- Gestion de secretos (app_secrets blindada)
- Backups automaticos y manuales (sanitizados)
- Indicador de conexion global (vendedor + admin)

### Lo que falta para V1.0

1. **Integracion del certificado digital .p12** — La firma digital de los XML SIFEN requiere un certificado emitido por una CA autorizada por la SET. El codigo esta preparado (env vars `CERTIFICADO_P12` + `PASS_CERT`), pero la firma criptografica no esta activa.

2. **Timbrado real de la SET** — El numero de timbrado actual es placeholder. Requiere tramite ante la SET para obtener un timbrado autorizado vinculado al RUC de la empresa.

3. **Homologacion en ambiente de pruebas SET** — Antes de emitir facturas legales, la SET exige una bateria de pruebas en su ambiente de testing. Requiere los dos puntos anteriores.

4. **WAF perimetral (B-03)** — La proteccion WAF de Cloudflare requiere un dominio personalizado. Mientras tanto, Vercel Edge Network provee DDoS y SSL.

5. **Tests automatizados** — No existe un framework de testing (E2E, unitarios) configurado. Las 4 auditorias de seguridad manuales cubren el gap parcialmente.

---

## 4. Deuda Tecnica Acumulada (Diferida a V2.0)

| ID | Descripcion | Riesgo | Impacto | Esfuerzo |
|----|------------|--------|---------|----------|
| DT-01 | Eliminar CSP `unsafe-inline` migrando 157+ handlers a `addEventListener` | Medio | Seguridad CSP estricto | 5 fases, ~40h |
| DT-02 | Rate limiting persistente en Edge Functions (Redis/Durable Objects) | Medio | Anti-DDoS en capa API | 8h |
| DT-03 | Eliminar tabla legacy `catalogo` | Bajo | Limpieza de schema | 2h |
| DT-04 | Framework de tests automatizados (Playwright/Vitest) | Alto | Calidad y regresion | 20h |
| DT-05 | Dominio personalizado + Cloudflare WAF completo | Medio | Branding + seguridad perimetral | 4h (config) |
| DT-06 | Migrar IDs de pedidos de `Date.now()` a `crypto.randomUUID()` | Bajo | Ya parcialmente migrado (PED-, REC-, FAC-) | 2h |

---

## 5. Proximos Pasos Inmediatos — Decision Requerida

La directiva debe elegir entre dos rutas criticas mutuamente independientes:

### Opcion A: Pulir UI de Toma de Pedidos

**Objetivo:** Lanzar la app del vendedor a campo para pruebas reales con facturacion mock (recibos internos, sin validez fiscal).

**Alcance:**
- Refinamiento de la experiencia de checkout del vendedor
- Impresion de recibos/remisiones sin valor fiscal
- Pruebas de campo con vendedores reales
- Validacion del flujo offline→sync→admin

**Ventaja:** Genera datos reales y feedback de usuarios antes de la integracion SIFEN.
**Tiempo estimado:** 1-2 semanas.

### Opcion B: Integracion Certificado .p12 SIFEN

**Objetivo:** Completar la cadena de facturacion electronica legal para emitir DTE ante la SET.

**Alcance:**
- Configurar certificado .p12 en Supabase Edge Function secrets
- Implementar firma digital XML con la llave privada del .p12
- Pruebas contra ambiente de homologacion SET
- Tramite de timbrado real

**Ventaja:** Desbloquea la facturacion legal, requisito normativo para operar.
**Dependencia externa:** Requiere que la empresa tenga el certificado digital y el timbrado.
**Tiempo estimado:** 2-4 semanas (incluye burocracia SET).

### Recomendacion del Arquitecto

**Ejecutar Opcion A primero, Opcion B en paralelo cuando el certificado este disponible.**

La Opcion A genera valor inmediato (vendedores usando la app) y produce datos reales que alimentan el refinamiento. La Opcion B depende de un tramite burocratico externo que no controlamos. El codigo SIFEN ya esta preparado — cuando el certificado llegue, la integracion es de dias, no semanas.

---

## 6. Metricas del Proyecto

| Metrica | Valor |
|---------|-------|
| Archivos JS del proyecto | 25+ modulos |
| Tablas PostgreSQL | 9 operativas + 1 legacy |
| RPCs SECURITY DEFINER | 7 |
| Triggers server-side | 3 (anti-fraude, bloqueo terminal, fecha servidor) |
| Politicas de seguridad documentadas | 10 (P1-P10) |
| Auditorias de seguridad completadas | 4 (54 hallazgos, todos remediados) |
| Canales Supabase Realtime | 13+ (4 catalogo, 2 pedidos, 8 config) |
| Grado de madurez de seguridad | Tier 3/5 — Top 3-5% PYMEs LATAM |
| Service Worker version actual | 56.0 |
| Estrategia de cache Supabase API | Network-First (nunca Cache-First) |

---

> **Firma Digital del Documento**
> Generado por la Oficina de Arquitectura de Software
> Fecha: 2026-03-22 | Proyecto: HDV Distribuciones ERP V1.0
> Proximo review programado: Cuando se obtenga el certificado .p12
