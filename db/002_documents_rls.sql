ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- limpa versões antigas (idempotente)
DROP POLICY IF EXISTS docs_select_own   ON public.documents;
DROP POLICY IF EXISTS docs_upsert_own   ON public.documents;
DROP POLICY IF EXISTS docs_update_own   ON public.documents;
DROP POLICY IF EXISTS docs_delete_own   ON public.documents;
DROP POLICY IF EXISTS docs_admin_list   ON public.documents;

-- dono lê seus registros
CREATE POLICY docs_select_own ON public.documents
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- admin/analista lista (usa RBAC)
CREATE POLICY docs_admin_list ON public.documents
FOR SELECT TO authenticated
USING ( rbac.has_cap('doc.list') );

-- dono insere/atualiza/deleta apenas o próprio
CREATE POLICY docs_upsert_own ON public.documents
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY docs_update_own ON public.documents
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY docs_delete_own ON public.documents
FOR DELETE TO authenticated
USING (user_id = auth.uid());
