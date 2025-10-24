# ========= Bidly • Docs Pipeline (Prod) =========
# Requer: psql (ou supabase CLI) e DATABASE_URL configurado
# export DATABASE_URL='postgres://postgres:...@db.host:5432/postgres'

SHELL   := /bin/bash
DB      ?= $(DATABASE_URL)
SQL_DIR := db

# --- arquivos de migração (ordem recomendada) ---
M001 := $(SQL_DIR)/001_enum_and_constraint.sql
M002 := $(SQL_DIR)/002_documents_rls.sql
M003 := $(SQL_DIR)/003_send_document_fn.sql
M006 := $(SQL_DIR)/006_rbac_core.sql
M004 := $(SQL_DIR)/004_storage_policies_org_docs.sql
M005 := $(SQL_DIR)/005_admin_api.sql

SANITY_SQL := docs/runbooks/sanity_check.sql

.PHONY: help migrate sanity reload bootstrap_admin grant revoke show_send_document show_list_docs

help:
	@echo ""
	@echo "Usage:"
	@echo "  make migrate             # aplica migrações (001,002,003,006,004,005)"
	@echo "  make reload              # força PostgREST recarregar catálogo"
	@echo "  make sanity              # roda sanity_check.sql (somente leitura)"
	@echo "  make bootstrap_admin     # torna o caller adm.master (se não houver master)"
	@echo "  make grant  ROLE=adm.review EMAIL=user@acme.com"
	@echo "  make revoke ROLE=adm.review EMAIL=user@acme.com"
	@echo "  make show_send_document  # mostra assinatura da função"
	@echo "  make show_list_docs      # mostra assinatura do listador único"
	@echo ""
	@echo "Vars:"
	@echo "  DATABASE_URL=postgres://... (ou export no ambiente)"

# --- util ---
define run_sql
	@if [ -z "$(DB)" ]; then echo "ERROR: set DATABASE_URL"; exit 1; fi; \
	psql -v ON_ERROR_STOP=1 "$(DB)" -f $(1)
endef

# -------- MIGRATIONS --------
migrate: $(M001) $(M002) $(M003) $(M006) $(M004) $(M005)
	$(call run_sql,$(M001))
	$(call run_sql,$(M002))
	$(call run_sql,$(M003))
	$(call run_sql,$(M006))
	$(call run_sql,$(M004))
	$(call run_sql,$(M005))
	@echo "✔ migrations applied"
	$(MAKE) reload

# -------- POSTGREST RELOAD --------
reload:
	@if [ -z "$(DB)" ]; then echo "ERROR: set DATABASE_URL"; exit 1; fi; \
	psql -v ON_ERROR_STOP=1 "$(DB)" -c "select pg_notify('pgrst','reload schema');" >/dev/null
	@echo "✔ postgrest schema reloaded"

# -------- SANITY (somente leitura) --------
sanity: $(SANITY_SQL)
	$(call run_sql,$(SANITY_SQL))

# -------- ADMIN OPS --------
bootstrap_admin:
	@if [ -z "$(DB)" ]; then echo "ERROR: set DATABASE_URL"; exit 1; fi; \
	psql -v ON_ERROR_STOP=1 "$(DB)" -c "select bootstrap_admin();"
	@echo "✔ bootstrap_admin done"

grant:
	@if [ -z "$(ROLE)" ] || [ -z "$(EMAIL)" ]; then echo "Usage: make grant ROLE=adm.review EMAIL=user@acme.com"; exit 1; fi; \
	psql -v ON_ERROR_STOP=1 "$(DB)" -c "select grant_role('$(EMAIL)', '$(ROLE)');"
	@echo "✔ granted $(ROLE) to $(EMAIL)"

revoke:
	@if [ -z "$(ROLE)" ] || [ -z "$(EMAIL)" ]; then echo "Usage: make revoke ROLE=adm.review EMAIL=user@acme.com"; exit 1; fi; \
	psql -v ON_ERROR_STOP=1 "$(DB)" -c "select revoke_role('$(EMAIL)', '$(ROLE)');"
	@echo "✔ revoked $(ROLE) from $(EMAIL)"

show_send_document:
	@if [ -z "$(DB)" ]; then echo "ERROR: set DATABASE_URL"; exit 1; fi; \
	psql -v ON_ERROR_STOP=1 "$(DB)" -c "select n.nspname schema, p.proname name, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='send_document';"

show_list_docs:
	@if [ -z "$(DB)" ]; then echo "ERROR: set DATABASE_URL"; exit 1; fi; \
	psql -v ON_ERROR_STOP=1 "$(DB)" -c "select n.nspname schema, p.proname name, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_docs';"
