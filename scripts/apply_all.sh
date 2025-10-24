#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: set DATABASE_URL"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Se você usa db/ em vez de db/migrations (padrão do Makefile)
SQL_DIR="$ROOT/db"

psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$SQL_DIR/001_enum_and_constraint.sql"
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$SQL_DIR/002_documents_rls.sql"
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$SQL_DIR/003_send_document_fn.sql"
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$SQL_DIR/006_rbac_core.sql"
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$SQL_DIR/004_storage_policies_org_docs.sql"
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$SQL_DIR/005_admin_api.sql"

# Força o PostgREST a recarregar o catálogo
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "select pg_notify('pgrst','reload schema');" >/dev/null

# Sanity final (somente leitura)
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$ROOT/scripts/sanity_check.sql"

echo "✔ All migrations applied, PostgREST reloaded, and sanity passed"
