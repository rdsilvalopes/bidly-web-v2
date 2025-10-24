-- ========= Bidly • Sanity Check do Pipeline de Documentos =========
-- Uso (psql):
--   \i docs/runbooks/sanity_check.sql

\echo '--- Versões / contexto ---'
SELECT current_user AS whoami, current_database() AS db, current_schema AS search_path;

\echo '--- Bucket org-docs existe? ---'
SELECT id, name, public, created_at
FROM storage.buckets
WHERE name = 'org-docs';

\echo '--- Policies do Storage (org-docs) ---'
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename  = 'objects'
  AND (policyname ILIKE '%org-docs%' OR policyname ILIKE 'gdocs_%')
ORDER BY policyname;

\echo '--- Tabela public.documents: RLS e constraint ---'
SELECT relrowsecurity AS rls_enabled
FROM pg_class WHERE oid = 'public.documents'::regclass;

SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.documents'::regclass
  AND conname  = 'documents_user_type_uniq';

\echo '--- Enum doc_type (valores) ---'
SELECT e.enumlabel
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'doc_type'
ORDER BY e.enumsortorder;

\echo '--- Funções públicas esperadas ---'
SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('send_document','list_docs','admin_approve_doc','admin_reject_doc')
ORDER BY 1,2;

\echo '--- RBAC: função has_cap disponível? ---'
SELECT has_function_privilege('rbac.has_cap(text)', 'EXECUTE') AS has_has_cap;

\echo '--- RBAC: papéis/capacidades (resumo) ---'
SELECT r.name AS role, c.name AS cap
FROM rbac.role_capabilities rc
JOIN rbac.roles         r ON r.id = rc.role_id
JOIN rbac.capabilities  c ON c.id = rc.cap_id
ORDER BY 1,2;

\echo '--- RBAC: admins cadastrados (se houver) ---'
SELECT u.email, r.name AS role, ur.created_at
FROM rbac.user_roles ur
JOIN rbac.roles r   ON r.id = ur.role_id
JOIN auth.users u   ON u.id = ur.user_id
WHERE r.name IN ('adm.master','adm.review')
ORDER BY 2,3 DESC
LIMIT 50;

\echo '--- Indexes de apoio em documents (performance) ---'
SELECT indexrelid::regclass AS index_name, pg_get_indexdef(indexrelid)
FROM pg_index
WHERE indrelid = 'public.documents'::regclass
ORDER BY 1;

\echo '--- Ok. Fim do sanity. ---'
