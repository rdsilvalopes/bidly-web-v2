OFICIAL

-- Aprovação
CREATE OR REPLACE FUNCTION public.admin_approve_doc(p_type doc_type, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT rbac.has_cap('doc.review') THEN
    RAISE EXCEPTION 'forbidden: missing capability doc.review';
  END IF;

  UPDATE public.documents d
     SET status      = 'approved',
         reviewed_at = now(),
         reviewer_id = auth.uid()
   WHERE d.user_id = p_user_id
     AND d.type    = p_type;

  INSERT INTO public.doc_notes(user_id, type, message, created_by_name)
  VALUES (p_user_id, p_type, 'Aprovado', 'Admin');
END $$;

-- Reprovação
CREATE OR REPLACE FUNCTION public.admin_reject_doc(
  p_type doc_type, p_user_id uuid, p_reason text DEFAULT 'Documento inválido'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT rbac.has_cap('doc.review') THEN
    RAISE EXCEPTION 'forbidden: missing capability doc.review';
  END IF;

  UPDATE public.documents d
     SET status      = 'rejected',
         reviewed_at = now(),
         reviewer_id = auth.uid(),
         rejection_reason = NULLIF(p_reason, '')
   WHERE d.user_id = p_user_id
     AND d.type    = p_type;

  INSERT INTO public.doc_notes(user_id, type, message, reason_code, created_by_name)
  VALUES (p_user_id, p_type, COALESCE(NULLIF(p_reason,''),'Reprovado'), 'REJECT', 'Admin');
END $$;

GRANT EXECUTE ON FUNCTION public.admin_approve_doc(doc_type, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_doc(doc_type, uuid, text) TO authenticated;




--------------------------








Última versão que Habilita ver o PDF no ADMIN
nova versão corrige  Aprovação pelo admin_api

-- 1) (Re)garante a função de capability executável em policies
create or replace function rbac.has_cap(p_cap text)
returns boolean
language sql
stable
security definer
set search_path = public, rbac, auth
as $$
  select exists (
    select 1
    from rbac.user_roles ur
    join rbac.role_capabilities rc on rc.role_id = ur.role_id
    join rbac.capabilities c       on c.id      = rc.cap_id
    where ur.user_id = coalesce(auth.uid(), public.jwt_sub())
      and c.name = p_cap
  );
$$;

revoke all on function rbac.has_cap(text) from public;
grant execute on function rbac.has_cap(text) to authenticated;

-- 2) Limpa policies de SELECT conflitantes no bucket org-docs (opcional, só se existirem)
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname in ('orgdocs_admin_read_by_cap','org-docs: select by cap doc.view_pdf')
  ) then
    drop policy if exists "orgdocs_admin_read_by_cap" on storage.objects;
    drop policy if exists "org-docs: select by cap doc.view_pdf" on storage.objects;
  end if;
end $$;

-- 3) Política única de leitura: dono OU tem a capability
drop policy if exists orgdocs_read_by_owner_or_cap on storage.objects;

create policy orgdocs_read_by_owner_or_cap
on storage.objects
for select
to authenticated
using (
  bucket_id = 'org-docs'
  and (
    -- dono (pasta começa com o uid)
    (storage.foldername(name))[1] = auth.uid()::text
    -- ou tem permissão explícita
    or rbac.has_cap('doc.view_pdf')
  )
);

-- (não é preciso reload do PostgREST para o Storage, mas não faz mal:)
select pg_notify('pgrst','reload schema');
