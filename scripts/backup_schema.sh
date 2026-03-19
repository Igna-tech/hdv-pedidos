#!/bin/bash
# ============================================
# HDV Distribuciones — Cold Backup de Esquema
# Descarga definiciones de tablas, funciones, triggers y RLS
# SIN datos de clientes/pedidos (solo estructura)
# ============================================
#
# Prerequisitos:
#   - Supabase CLI instalado: npm install -g supabase
#   - Sesion activa: supabase login
#   - O bien: PostgreSQL client (pg_dump) con acceso directo
#
# Uso:
#   chmod +x scripts/backup_schema.sh
#   ./scripts/backup_schema.sh
# ============================================

set -euo pipefail

# --- Configuracion ---
PROJECT_REF="ngtoshttgnfgbiurnrix"
BACKUP_DIR="backups/schema"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_DIR="${BACKUP_DIR}/${TIMESTAMP}"

echo "============================================"
echo " HDV - Backup de Esquema (Cold Backup)"
echo " Proyecto: ${PROJECT_REF}"
echo " Fecha: $(date)"
echo "============================================"
echo ""

# Crear directorio de backup
mkdir -p "${OUTPUT_DIR}"

# --- Metodo 1: Supabase CLI (recomendado) ---
if command -v supabase &> /dev/null; then
    echo "[1/4] Extrayendo esquema via Supabase CLI..."

    # Pull del esquema remoto (tablas, funciones, triggers, RLS, tipos)
    supabase db pull --schema public \
        --project-ref "${PROJECT_REF}" \
        > "${OUTPUT_DIR}/schema_public.sql" 2>/dev/null || true

    if [ -s "${OUTPUT_DIR}/schema_public.sql" ]; then
        echo "  ✓ schema_public.sql generado"
    else
        echo "  ⚠ Supabase CLI no pudo extraer esquema (puede requerir login)"
        echo "  Intentando metodo alternativo..."
    fi

    # Pull de auth schema
    supabase db pull --schema auth \
        --project-ref "${PROJECT_REF}" \
        > "${OUTPUT_DIR}/schema_auth.sql" 2>/dev/null || true

    if [ -s "${OUTPUT_DIR}/schema_auth.sql" ]; then
        echo "  ✓ schema_auth.sql generado"
    fi

    # Pull de storage schema
    supabase db pull --schema storage \
        --project-ref "${PROJECT_REF}" \
        > "${OUTPUT_DIR}/schema_storage.sql" 2>/dev/null || true

    if [ -s "${OUTPUT_DIR}/schema_storage.sql" ]; then
        echo "  ✓ schema_storage.sql generado"
    fi

else
    echo "[!] Supabase CLI no encontrado. Instalar con: npm install -g supabase"
    echo "    Saltando extraccion via CLI."
fi

# --- Metodo 2: Copiar archivos SQL existentes del repo ---
echo ""
echo "[2/4] Copiando archivos SQL del repositorio..."

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for sqlfile in supabase-schema.sql supabase-auth-setup.sql; do
    if [ -f "${REPO_ROOT}/${sqlfile}" ]; then
        cp "${REPO_ROOT}/${sqlfile}" "${OUTPUT_DIR}/${sqlfile}"
        echo "  ✓ ${sqlfile} copiado"
    fi
done

# Copiar migraciones
if [ -d "${REPO_ROOT}/supabase/migrations" ]; then
    cp -r "${REPO_ROOT}/supabase/migrations" "${OUTPUT_DIR}/migrations"
    echo "  ✓ Migraciones copiadas"
fi

# Copiar config
if [ -f "${REPO_ROOT}/supabase/config.toml" ]; then
    cp "${REPO_ROOT}/supabase/config.toml" "${OUTPUT_DIR}/config.toml"
    echo "  ✓ config.toml copiado"
fi

# --- Metodo 3: pg_dump (si hay conexion directa) ---
echo ""
echo "[3/4] Verificando pg_dump..."

if command -v pg_dump &> /dev/null; then
    # La connection string debe configurarse como variable de entorno
    if [ -n "${DATABASE_URL:-}" ]; then
        echo "  Extrayendo esquema via pg_dump (solo estructura, sin datos)..."

        pg_dump "${DATABASE_URL}" \
            --schema-only \
            --no-owner \
            --no-privileges \
            --schema=public \
            --file="${OUTPUT_DIR}/pg_dump_schema.sql" 2>/dev/null || true

        if [ -s "${OUTPUT_DIR}/pg_dump_schema.sql" ]; then
            echo "  ✓ pg_dump_schema.sql generado"
        else
            echo "  ⚠ pg_dump fallo (verificar DATABASE_URL)"
        fi
    else
        echo "  ⚠ DATABASE_URL no configurada. Saltando pg_dump."
        echo "  Para usar: export DATABASE_URL='postgresql://postgres:[password]@db.${PROJECT_REF}.supabase.co:5432/postgres'"
    fi
else
    echo "  ⚠ pg_dump no encontrado. Saltando."
fi

# --- Resumen ---
echo ""
echo "[4/4] Resumen del backup:"
echo "  Directorio: ${OUTPUT_DIR}/"
ls -la "${OUTPUT_DIR}/" 2>/dev/null || true

echo ""
echo "============================================"
echo " Backup completado: ${OUTPUT_DIR}"
echo " Archivos generados: $(find "${OUTPUT_DIR}" -type f | wc -l)"
echo "============================================"
echo ""
echo "NOTA: Este backup contiene SOLO estructura (tablas, funciones, triggers, RLS)."
echo "NO contiene datos de clientes ni pedidos."
echo "Para restaurar datos, usar el backup JSON del panel Admin o PITR de Supabase."
