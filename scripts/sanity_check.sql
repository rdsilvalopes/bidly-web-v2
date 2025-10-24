-- ========= Sanity Check (produção) =========

\echo '--- Storage policies (org-docs) ---'
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='storage'
  AND tablename='objects'
  AND (policyname ILIKE '%org-docs%' OR policyname ILIKE 'gdocs_%')
ORDER BY policyname;

\echo '--- RBAC function available ---'
SELECT has_function_privilege('rbac.has_cap(text)', 'EXECUTE') AS has_has_cap;

\echo '--- send_document signatures ---'
SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'send_document';

\echo '--- list_docs signature (listador único) ---'
SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'list_docs';

\echo '--- documents unique and RLS ---'
SELECT conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
WHERE conrelid = 'public.documents'::regclass
  AND conname ILIKE '%user_type_uniq%';

SELECT relrowsecurity AS rls_enabled
FROM pg_class WHERE oid = 'public.documents'::regclass;

\echo '--- enum doc_type values ---'
SELECT e.enumlabel
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'doc_type'
ORDER BY e.enumsortorder;

\echo '--- admin_api functions (se existirem no schema admin_api) ---'
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='admin_api'
ORDER BY 1,2;
