# README — Pipeline de Documentos (PDF)

## O que é

Fluxo de produção para receber **1 PDF por tipo** por usuário:
- Bucket **privado** `org-docs` (Supabase Storage).
- Registro em `public.documents` com enum `doc_type`.
- RPC **única** `send_document(doc_type, text)` (UPSERT).
- Estados: `pending` → `under_review` → `approved|rejected`.
- Admin Lite: listagem/aprovação com **RBAC** e listador único `public.list_docs`.

---

## Documentação

- **ADR**: `docs/adr/ADR-0001-docs-upload.md` (decisão arquitetural)
- **Runbook**: `docs/runbooks/docs-pipeline.md` (operação e troubleshooting)
- **API**: `docs/api/send_document.md` (contrato do RPC)
- **Checklist**: `docs/checklists/docs-delivery.md` (itens de entrega)
- **Migrações SQL** (idempotentes):
  1. `001_enum_and_constraint.sql`
  2. `002_documents_rls.sql`
  3. `003_send_document_fn.sql`
  4. `006_rbac_core.sql`
  5. `004_storage_policies_org_docs.sql`
  6. `005_admin_api.sql`

**Ordem recomendada**: `001 → 002 → 003 → 006 → 004 → 005`.

> Dica: `make migrate` aplica nessa ordem e já faz o reload do PostgREST.

---

## Quick start (admin)

1. **Aplicar migrações** (como service role):
   ```bash
   export DATABASE_URL='postgres://...'
   make migrate




Bootstrap (se ainda não houver master):
> select bootstrap_admin();


Conceder papéis:
> select grant_role('admin@empresa.com', 'adm.master');
> select grant_role('revisor@empresa.com', 'adm.review');





Smoke test (console do navegador)


// 0) cliente + sessão
const sb = await window.connectSupabase();
const { data: { session } } = await sb.auth.getSession();
const uid = session?.user?.id;

// 1) listar prefixo (deve iniciar vazio)
await sb.storage.from('org-docs').list(uid);

// 2) bloquear PNG (deve falhar — policy)
await sb.storage.from('org-docs').upload(`${uid}/x.png`,
  new Blob(['x'], { type:'image/png' }), { upsert:true });

// 3) enviar PDF
const pdf = new Blob(['%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF'], { type:'application/pdf' });
await sb.storage.from('org-docs').upload(`${uid}/company_contract.pdf`, pdf, { upsert:true });

// 4) registrar via RPC (sempre **chave**, nunca URL)
await sb.rpc('send_document', {
  p_type: 'company_contract',
  p_storage_path: `${uid}/company_contract.pdf`
});

// 5) Admin Lite: /admin (lista via /rpc/list_docs) e aprova/reprova






Integrações importantes

Policies do Storage (org-docs)
- Prefixo: (storage.foldername(name))[1] = auth.uid()
- Extensão: right(lower(name),4) = '.pdf'
- Exceção de leitura p/ admin/analista: rbac.has_cap('doc.view_pdf')


RLS public.documents
- Dono sempre acessa seus registros.
- Admin/analista lista via docs_admin_list (checa rbac.has_cap('doc.list')).

Admin API
- public.list_docs (listador único usado pelo Admin Lite).
- public.admin_approve_doc / public.admin_reject_doc (proteção por rbac.has_cap('doc.review')).


Convenções
- Path: ${uid}/company_contract.pdf
(se precisar histórico: ${uid}/company_contract/${ts}_vN.pdf, mantendo o primeiro segmento = uid).
- Novos tipos: ALTER TYPE doc_type ADD VALUE '...' e reutilizar send_document.


Operação segura
- Auditoria: submitted_at, reviewed_at, reviewer_id, rejection_reason.
- Assinatura de URL: usar SDK (createSignedUrl) no front (ex.: TTL 60s).

Índices:

create index if not exists documents_user_type_idx on public.documents(user_id, type);
create index if not exists documents_status_idx on public.documents(status);
create index if not exists documents_submitted_at_idx on public.documents(submitted_at desc);



Troubleshooting rápido

- 400 no /storage/v1/object/sign: está tentando assinar URL salvada na coluna — salve somente a chave (<uid>/file.pdf) e use createSignedUrl.
- 403 Storage: sessão ausente; prefixo ≠ uid; extensão ≠ .pdf; ou faltou doc.view_pdf (admin/analista).
- PGRST203 / overload: mantenha apenas send_document(doc_type, text) e list_docs(integer,integer,text,text,text).
- Cast do enum: envie p_type como valor válido de doc_type.



Pós-deploy

1 make migrate
2 make reload

3 Abrir Admin Lite:
- /admin/roles.html → conceder/revogar sem 403.
- /admin/ → carrega (200/304 em rpc/list_docs); coluna PDF aparece para dono e para quem tem doc.view_pdf.


4 Testar aprovar/reprovar → muda status e registra nota.

- 
---

se quiser, eu também preparo um `docs/runbooks/sanity_check.sql` simples (read-only) para pingar RLS, RBAC e Storage numa rodada só. Quer que eu inclua?
