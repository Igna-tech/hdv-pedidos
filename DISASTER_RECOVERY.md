# Plan de Recuperacion ante Desastres — HDV Distribuciones

> **Clasificacion:** CONFIDENCIAL — Solo para administradores del sistema.
> **Ultima revision:** 2026-03-19
> **Proyecto Supabase:** `ngtoshttgnfgbiurnrix`
> **Deploy:** Vercel (frontend estatico) + Supabase (backend/DB/auth/storage)

---

## 1. Clasificacion de Incidentes

| Nivel | Tipo | Ejemplo | Impacto |
|-------|------|---------|---------|
| **P1 — Critico** | Perdida total de datos | Drop accidental de tabla, ransomware, cuenta Supabase comprometida | Total — operacion detenida |
| **P2 — Alto** | Corrupcion parcial de datos | DELETE masivo por error, trigger malconfigurado, RLS deshabilitado | Alto — datos inconsistentes |
| **P3 — Medio** | Caida de servicio | Supabase outage, Vercel outage, CDN caido | Medio — app no accesible pero datos intactos |
| **P4 — Bajo** | Error de configuracion | Variable de entorno incorrecta, CORS roto, certificado expirado | Bajo — funcionalidad parcial |

---

## 2. Objetivos de Recuperacion

| Metrica | Objetivo | Justificacion |
|---------|----------|--------------|
| **RTO** (Recovery Time Objective) | 2 horas maximo | Tiempo maximo tolerable sin sistema operativo |
| **RPO** (Recovery Point Objective) | 24 horas maximo | Perdida maxima aceptable de datos (frecuencia de backups admin) |
| **RPO con PITR** (si esta activo) | 5 minutos | Supabase Pro/Team incluye Point-in-Time Recovery |

---

## 3. Inventario de Activos Criticos

### Base de datos (Supabase PostgreSQL 17)
- **Tablas operativas:** pedidos, clientes, productos, producto_variantes, categorias, configuracion, configuracion_empresa, perfiles
- **Tablas de auditoria:** audit_logs (inmutable)
- **Tablas de reportes:** reportes_mensuales
- **Funciones criticas:** 8 RPCs SECURITY DEFINER, 6 triggers de seguridad, 3 triggers de alertas
- **RLS:** Politicas activas en todas las tablas

### Storage (Supabase Storage)
- **Bucket:** `productos_img` — imagenes de productos (JPEG/PNG/WebP, max 5MB)

### Frontend (Vercel)
- Archivos estaticos en repositorio Git (GitHub: Igna-tech/hdv-pedidos)
- Service Worker PWA con cache offline

### Edge Functions (Supabase)
- `sifen-generar-xml`: Facturacion electronica SIFEN
- `alertas-seguridad`: Notificaciones WhatsApp de seguridad

### Secretos y Credenciales
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- SIFEN: `CERTIFICADO_P12`, `PASS_CERT`
- Alertas: `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`, `WHATSAPP_DESTINO`, `WEBHOOK_SECRET`

---

## 4. Protocolos de Recuperacion

### P1 — Cuenta Supabase comprometida / Ransomware

**Acciones inmediatas (primeros 15 minutos):**

1. **Revocar todas las sesiones JWT:**
   - Dashboard Supabase > Authentication > Settings > cambiar JWT Secret
   - Esto invalida TODOS los tokens activos instantaneamente

2. **Pausar el proyecto Supabase:**
   - Dashboard > Settings > General > Pause Project
   - Esto detiene la DB, Auth, Storage y Edge Functions

3. **Activar Kill Switch para todos los vendedores:**
   ```sql
   UPDATE perfiles SET activo = false WHERE rol = 'vendedor';
   ```

4. **Rotar credenciales criticas:**
   - Regenerar `anon key` y `service_role key` desde Dashboard > Settings > API
   - Actualizar en: `supabase-init.js`, Edge Functions env vars, Vercel env vars
   - Regenerar `WEBHOOK_SECRET`

5. **Notificar al equipo:** Usar canal de emergencia (fuera del sistema HDV)

**Recuperacion (siguiente 1-2 horas):**

6. **Si PITR esta activo:** Dashboard > Database > Backups > Point in Time Recovery
   - Seleccionar timestamp ANTES del incidente
   - Supabase restaura la DB completa a ese punto

7. **Si PITR NO esta activo:** Restaurar desde ultimo backup:
   - Ejecutar `scripts/backup_schema.sh` en una instancia limpia para recrear estructura
   - Restaurar datos desde el ultimo backup JSON del admin (Herramientas > Backup)
   - Reimportar `supabase-schema.sql` + `supabase-auth-setup.sql`

8. **Verificar integridad:**
   ```sql
   -- Verificar que audit_logs no fue manipulado
   SELECT COUNT(*), MIN(creado_en), MAX(creado_en) FROM audit_logs;
   -- Verificar RLS activo
   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
   -- Verificar triggers activos
   SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public';
   ```

9. **Redesplegar frontend:**
   ```bash
   git push origin main  # Vercel auto-deploys desde main
   ```

10. **Reactivar vendedores uno por uno** despues de verificar dispositivos.

---

### P2 — DELETE masivo accidental / Corrupcion de datos

**Acciones inmediatas:**

1. **NO ejecutar mas queries** — detener cualquier operacion en curso.

2. **Consultar audit_logs** para identificar el alcance:
   ```sql
   SELECT * FROM audit_logs
   WHERE accion = 'DELETE'
   ORDER BY creado_en DESC LIMIT 50;
   ```

3. **Si PITR esta activo:** Restaurar solo al punto anterior al DELETE.

4. **Si PITR NO esta activo:**
   - Los datos anteriores estan en `audit_logs.datos_anteriores` (JSONB)
   - Script de restauracion manual desde audit_logs:
     ```sql
     -- Ejemplo: restaurar clientes eliminados
     INSERT INTO clientes
     SELECT (datos_anteriores->>'id')::text, ...
     FROM audit_logs
     WHERE tabla_afectada = 'clientes' AND accion = 'DELETE'
     AND creado_en > '2026-03-19T00:00:00';
     ```

5. **Verificar consistencia** de pedidos, clientes y productos despues de restaurar.

---

### P3 — Caida de Supabase / Vercel

**La app sigue funcionando parcialmente en modo offline gracias a:**
- IndexedDB con catalogo y pedidos cacheados
- Service Worker sirve HTML/JS/CSS desde cache
- SyncManager encola pedidos para sincronizar al reconectar

**Acciones:**

1. Verificar status de Supabase: https://status.supabase.com
2. Verificar status de Vercel: https://www.vercel-status.com
3. Si la caida es prolongada (> 4 horas):
   - Comunicar a vendedores que sigan tomando pedidos offline
   - Los pedidos se sincronizaran automaticamente al restaurar el servicio
4. Al restaurar: verificar que `sincronizarPedidosLocales()` procese la cola pendiente.

---

### P4 — Error de configuracion

| Problema | Solucion rapida |
|----------|----------------|
| CORS roto | Verificar `vercel.json` headers y `ALLOWED_ORIGIN` en Edge Functions |
| Auth no funciona | Verificar `SUPABASE_URL` y `SUPABASE_ANON_KEY` en `supabase-init.js` |
| Edge Function falla | Verificar logs: `supabase functions logs alertas-seguridad --project-ref ngtoshttgnfgbiurnrix` |
| Imagenes no cargan | Verificar bucket `productos_img` policies y que sea publico para SELECT |
| Vendedor no puede acceder | Verificar `perfiles.activo = true` y que el JWT no este expirado |

---

## 5. Backups y Redundancia

### Backup automatico (Supabase)
- Supabase Free: backup diario automatico (retencion 7 dias)
- Supabase Pro: PITR con granularidad de segundos

### Backup manual (Admin)
- Panel Admin > Herramientas > "Crear Backup" → JSON con pedidos, catalogo, configs
- Auto-backup cada 30 minutos (configurable) en IndexedDB del admin

### Cold Backup (esquema)
- `scripts/backup_schema.sh` → Descarga definiciones de tablas, funciones, triggers, RLS
- Archivos SQL en repo: `supabase-schema.sql`, `supabase-auth-setup.sql`
- Migraciones: `supabase/migrations/`

### Codigo fuente
- GitHub: `Igna-tech/hdv-pedidos` (branch `main`)
- Cada deploy se commitea y pushea a GitHub

---

## 6. Pruebas del Plan

| Prueba | Frecuencia | Responsable |
|--------|-----------|-------------|
| Verificar que backups admin se generan | Semanal | Admin |
| Restaurar un backup en entorno de prueba | Mensual | Admin |
| Simular Kill Switch de vendedor | Trimestral | Admin |
| Verificar audit_logs tiene registros recientes | Semanal | Admin |
| Ejecutar `backup_schema.sh` y verificar output | Mensual | Admin |

---

## 7. Contactos de Emergencia

| Recurso | URL / Contacto |
|---------|---------------|
| Supabase Dashboard | https://supabase.com/dashboard/project/ngtoshttgnfgbiurnrix |
| Supabase Status | https://status.supabase.com |
| Vercel Dashboard | https://vercel.com |
| GitHub Repo | https://github.com/Igna-tech/hdv-pedidos |
| Supabase Support | https://supabase.com/support |

---

> **IMPORTANTE:** Este documento debe revisarse y actualizarse cada vez que se agreguen nuevas tablas, Edge Functions, o se cambien credenciales.
