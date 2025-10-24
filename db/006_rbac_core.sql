-- ==== RBAC básico (roles, caps, binds) =====

-- roles
INSERT INTO rbac.roles(name, description)
SELECT * FROM (VALUES
  ('adm.master','Administrador do painel'),
  ('adm.review','Analista de revisão cadastral'),
  ('adm.readonly','Observador / auditoria (somente leitura)')
) v(name, description)
ON CONFLICT (name) DO NOTHING;

-- caps
INSERT INTO rbac.capabilities(name, description)
SELECT * FROM (VALUES
  ('doc.list','Listar cadastros/documentos'),
  ('doc.view_pdf','Abrir PDF via signed URL'),
  ('doc.review','Aprovar/Reprovar documento/cadastro'),
  ('doc.approve','Aprovar documento/cadastro'),
  ('doc.reject','Reprovar documento/cadastro'),
  ('doc.note.write','Inserir nota de suporte')
) v(name, description)
ON CONFLICT (name) DO NOTHING;

-- bindings (role → caps)
INSERT INTO rbac.role_capabilities(role_id, cap_id)
SELECT r.id, c.id
FROM rbac.roles r
JOIN rbac.capabilities c ON (
  (r.name='adm.master'  AND c.name IN ('doc.list','doc.view_pdf','doc.review','doc.approve','doc.reject','doc.note.write'))
OR (r.name='adm.review' AND c.name IN ('doc.list','doc.view_pdf','doc.review','doc.approve','doc.reject','doc.note.write'))
OR (r.name='adm.readonly' AND c.name IN ('doc.list','doc.view_pdf'))
)
ON CONFLICT DO NOTHING;

-- ==== helpers =====

-- helper coerente com a API e editor
CREATE OR REPLACE FUNCTION public.jwt_sub()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  select coalesce(
    auth.uid(),
    nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
  );
$$;

-- gate de cap
CREATE OR REPLACE FUNCTION rbac.has_cap(p_cap text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  with me(uid) as (select public.jwt_sub())
  select exists (
    select 1
    from me
    join rbac.user_roles ur on ur.user_id = me.uid
    join rbac.role_capabilities rc on rc.role_id = ur.role_id
    join rbac.capabilities c on c.id = rc.cap_id
    where c.name = p_cap
  );
$$;

-- ==== listador único (fonte da verdade) =====

CREATE OR REPLACE FUNCTION public.list_docs(
  p_limit  integer,
  p_offset integer,
  p_status text,
  p_type   text,
  p_q      text
) RETURNS TABLE (
  user_id        uuid,
  email          text,
  type           public.doc_type,
  status         public.doc_status,
  storage_path   text,                -- chave relativa (ex.: '<uid>/company_contract.pdf')
  submitted_at   timestamptz,
  reviewed_at    timestamptz,
  reviewer_email text,
  reviewer_name  text,
  org_name       text,
  can_view_pdf   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, rbac, auth, admin_api
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.user_id,
    d.email,
    d.type,
    d.status,
    d.storage_path,          -- sempre chave, não URL
    d.submitted_at,
    d.reviewed_at,
    d.reviewer_email,
    d.reviewer_name,
    d.org_name,
    (
      (d.user_id = auth.uid())
      OR rbac.has_cap('doc.view_pdf')
    ) as can_view_pdf
  FROM admin_api.v_docs_v2 d
  WHERE (p_status IS NULL OR d.status = p_status::public.doc_status)
    AND (p_type   IS NULL OR d.type   = p_type::public.doc_type)
    AND (
      p_q IS NULL
      OR d.email    ILIKE '%'||p_q||'%'
      OR d.org_name ILIKE '%'||p_q||'%'
    )
  ORDER BY d.submitted_at DESC
  LIMIT  COALESCE(p_limit,  20)
  OFFSET COALESCE(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_docs(integer,integer,text,text,text) TO authenticated;
