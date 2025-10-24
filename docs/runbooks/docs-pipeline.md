Runbook — Pipeline de Documentos (PDF)
Objetivo (produção, sem atalhos)

Fluxo estável para receber, armazenar e revisar 1 PDF por usuário:
- Bucket privado: org-docs (Supabase Storage).
- Tabela: public.documents com enum doc_type.
- RPC de ingest: public.send_document(doc_type, text) faz UPSERT e marca pending.
- Estados: pending → under_review → approved|rejected.
- Listador ÚNICO: public.list_docs(...) (fonte da verdade para o Admin Lite).
- RBAC: administração apenas pela tela /admin/roles.html (sem SQL manual em produção).

🧭 Princípio: Qualquer ajuste futuro de negócio acontece em um lugar (public.list_docs). O front sempre chama o mesmo RPC.


Quick start (admin) — após migração

1. Aplicar migrações (ordem recomendada):
001_enum_and_constraint.sql → 002_documents_rls.sql → 003_send_document_fn.sql → 006_rbac_core.sql → 004_storage_policies_org_docs.sql → 005_admin_api.sql

2. Forçar reload do catálogo do PostgREST:

select pg_notify('pgrst','reload schema');

3. Bootstrap do primeiro admin (se ainda não houver):

select bootstrap_admin();

4. Conceder papéis (pela tela /admin/roles.html).

Em produção, não conceda/revoque papéis por SQL; use a UI.



Smoke test (fim a fim)

Execute logado no app (com sessão válida).

1. Obter sessão/uid no console:

const sb = await window.connectSupabase();
const { data: { session } } = await sb.auth.getSession();
const uid = session?.user?.id;

2. Listar o prefixo do usuário (deve trazer [] num ambiente limpo):

await sb.storage.from('org-docs').list(uid);

3. Bloqueio de PNG (policy deve barrar):

await sb.storage.from('org-docs').upload(`${uid}/x.png`,
  new Blob(['x'], { type:'image/png' }), { upsert:true }); // deve FALHAR

4. Subir PDF:

const pdf = new Blob(['%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF'], { type:'application/pdf' });
await sb.storage.from('org-docs').upload(`${uid}/company_contract.pdf`, pdf, { upsert:true });

5. Registrar via RPC (ingest):

await sb.rpc('send_document', {
  p_type: 'company_contract',
  p_storage_path: `${uid}/company_contract.pdf`
});


5. UI do cliente: “Concluir agora” → muda para under_review.

6. Admin Lite (logado como adm.review ou adm.master):

- Filtro Em análise → deve listar o registro.
- Coluna PDF com link (admin tem doc.view_pdf).
- Aprovar → muda para approved e aparece pill verde no cliente.


Assinatura de URL (SDK)

Sempre assine via SDK (não tente chamar o endpoint HTTP direto):

const { data, error } = await sb
  .storage
  .from('org-docs')
  .createSignedUrl(`${uid}/company_contract.pdf`, 60); // TTL curto (UI), padrão 72h em outras telas

- TTL longo do app: controlado por DOCS_SIGNED_URL_TTL (padrão 72h).
- A UI da grade usa TTL curto apenas para render.



RBAC (produção)

- Admin UI: /admin/roles.html para bootstrap, conceder e revogar (adm.master, adm.review).
- Capabilities-chave:
  - doc.view_pdf → pode visualizar PDF de terceiros (seleção do Storage).
  - doc.review → pode aprovar/reprovar documentos no Admin Lite.

- has_cap: função rbac.has_cap(text) é a verificação central (já usada nas policies/funcões).
- Proibição: nada de “jeitinho” com SQL para alterar papéis/caps em produção.


Listador ÚNICO (contrato)

- O Admin Lite sempre chama POST /rest/v1/rpc/list_docs com:
 - p_limit int, p_offset int, p_status text|null, p_type text|null, p_q text|null.

- A função retorna sempre:
  - user_id, email, type, status, storage_path, submitted_at, reviewed_at, reviewer_email, reviewer_name, org_name, can_view_pdf.

- can_view_pdf é calculado dentro de public.list_docs (não em views auxiliares).
- Qualquer list_docs_v2/v3 existente deve ser só wrapper para public.list_docs (ou removido quando o front já estiver atualizado).  



Observabilidade (SQL rápido)
- Últimos envios:

select user_id, type, status, submitted_at
from public.documents
order by submitted_at desc
limit 50;


Em análise:

select user_id, type, storage_path, submitted_at
from public.documents
where status = 'under_review'
order by submitted_at desc
limit 50;

Aprovações recentes:

select user_id, type, reviewer_id, reviewed_at
from public.documents
where status = 'approved'
order by reviewed_at desc
limit 50;


Troubleshooting

Admin não vê PDF de terceiros (coluna PDF em branco):
- Verifique se o admin tem a cap doc.view_pdf (pela UI de papéis).
- Confirme que storage_path guarda apenas a chave (<uid>/company_contract.pdf).
Se houver URL completa salva, normalize (migração já prevista).
- Confirme a policy do Storage: existe uma SELECT para admins por capability e outra para dono do arquivo.


400 ao assinar URL (DevTools mostra storage/v1/object/sign/...)

- Causa: chamada HTTP direta sem cabeçalhos/apikey/session.
- Solução: use sempre o SDK (createSignedUrl), nunca direcione o browser ao endpoint de assinatura.

403 no Admin Lite (rpc/list_docs)

- Causa: sessão ausente ou RBAC sem permissão.
- Solução: login no app, reabra o Admin, e garanta papel adm.review ou adm.master.

PGRST203 / 42P13 (overload/assinatura divergente)

- Causa: múltiplas funções send_document ou list_docs com assinaturas diferentes.
Solução: manter apenas as versões de contrato oficial; dropar duplicatas e pg_notify('pgrst','reload schema').


42804 (cast enum)

- Causa: enviar p_type como texto quando a função espera doc_type.
Solução: usar a função cuja assinatura bate com seu cliente, ou cast para doc_type.


Índices recomendados (performance)

create index if not exists documents_user_type_idx on public.documents(user_id, type);
create index if not exists documents_status_idx    on public.documents(status);
create index if not exists documents_submitted_at_idx on public.documents(submitted_at desc);


Rotina “antes de subir”

1. make migrate ou aplicar os .sql na ordem indicada.
2. select pg_notify('pgrst','reload schema');
3. Smoke test (seção acima).
4. Rodar \i docs/runbooks/sanity_check.sql:
  - Bucket/policies ok
  - documents com RLS e UNIQUE (user_id, type)
  - Funções public.send_document, public.list_docs, public.admin_approve_doc, public.admin_reject_doc
  - rbac.has_cap(text) disponível
  - Papéis/caps coerentes


Convenções

- Path: ${uid}/company_contract.pdf (histórico futuro: ${uid}/company_contract/${timestamp}_vN.pdf mantendo primeiro segmento = uid).
- Novos tipos de documento: ALTER TYPE doc_type ADD VALUE 'novo_tipo'; e reaproveitar o mesmo RPC.
- TTL: curto na grade (segundos), longo nas telas do usuário (padrão 72h via DOCS_SIGNED_URL_TTL).

