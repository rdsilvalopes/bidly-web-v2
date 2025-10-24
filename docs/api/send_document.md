docs/api/send_document.md
RPC: send_document

Endpoint: POST /rest/v1/rpc/send_document
Auth: authenticated (sessão de app válida)
Security: SECURITY DEFINER (o autor efetivo é auth.uid())

Parâmetros (JSON)

{
  "p_type": "company_contract",
  "p_storage_path": "<uid>/company_contract.pdf"
}


- p_type — enum doc_type (ativo: company_contract).
- p_storage_path — chave canônica no bucket privado org-docs.
Convenção: ${uid}/company_contract.pdf (primeiro segmento sempre é o auth.uid()).


Efeito

- UPSERT em public.documents (user_id, type):
  - storage_path atualizado com a chave (não URL);
  - status = 'pending';
  - submitted_at = now().

A revisão (Admin Lite) troca para under_review e, depois, para approved/rejected.


Respostas esperadas

- 200 OK (PostgREST) – sucesso.
- 4xx – erros de entrada / sessão; ver “Erros comuns”.

Exemplo (supabase-js)

const sb = await window.connectSupabase();
const { data: { session } } = await sb.auth.getSession();
const uid = session?.user?.id;

// upload (policies exigem: prefixo = uid e extensão .pdf)
await sb.storage.from('org-docs').upload(
  `${uid}/company_contract.pdf`,
  pdfBlob,
  { upsert: true }
);

// registrar
const { error } = await sb.rpc('send_document', {
  p_type: 'company_contract',
  p_storage_path: `${uid}/company_contract.pdf`
});
if (error) throw error;



Regras / RBAC relacionadas

- Storage (bucket org-docs)
  - Dono do prefixo (${auth.uid()}/…) pode inserir/ler/atualizar/deletar o próprio PDF (somente .pdf).


Tabela public.documents

- RLS: usuário acessa apenas a própria linha.


Admin Lite (revisão)

Listagem única: public.list_docs(...).

- Cálculo de can_view_pdf: feito dentro de public.list_docs.
- Aprovar/Reprovar: RPCs protegidos por doc.review.



Erros comuns

- 403 (storage): caminho não começa por ${auth.uid()}/, extensão ≠ .pdf, ou sessão ausente.
- 404 (bucket): nome/region incorretos.
- PGRST203: sobrecarga duplicada da função – manter apenas public.send_document(doc_type, text).
- 42804 (enum): p_type enviado como text quando o cliente chama a versão que espera o enum doc_type.
→ Use a assinatura certa (ou faça cast).



docs/checklists/docs-delivery.md
Checklist de Entrega — Documentos (PDF)

Infra / esquema

- Bucket org-docs criado (privado).
- Policies do Storage aplicadas:
  - INSERT/UPDATE/DELETE/SELECT do próprio arquivo ((storage.foldername(name))[1] = auth.uid()).
  - SELECT por capability para admins com doc.view_pdf.
  - Extensão .pdf obrigatória em INSERT/UPDATE.

- Enum doc_type contém company_contract.
- Constraint UNIQUE (user_id, type) em public.documents.
- RLS em public.documents ativa (select/insert/update/delete do próprio usuário).
- Função única de ingestão: public.send_document(doc_type, text) (SECURITY DEFINER).
- Listador ÚNICO: public.list_docs(...) (fonte da verdade do Admin Lite), calculando can_view_pdf internamente.
- (Admin) RPCs de revisão protegidos por RBAC (doc.review).



App / fluxo

- Front (cliente): upload via SDK → send_document() → status pending.
- Botão “Concluir agora”: muda para under_review.
- Admin Lite:
  - Lista via /rpc/list_docs (ou wrappers v2/v3 apontando para ela, enquanto houver legado).
  - Coluna PDF usa SDK createSignedUrl somente se can_view_pdf = true.
  - Aprovar/Reprovar chamam RPCs gated por doc.review.
  - Botões desabilitados quando status = pending (sem PDF).




RBAC (operação)

- Bootstrap do primeiro admin pela UI /admin/roles.html.
- Conceder/Revogar papéis apenas pela UI (sem SQL manual em produção).
- Capabilities efetivas:
  - doc.view_pdf para ver PDF de terceiros.
  - doc.review para aprovar/reprovar.



Observabilidade / índices

Índices:

- create index if not exists documents_user_type_idx on documents(user_id, type);
- create index if not exists documents_status_idx on documents(status);
- create index if not exists documents_submitted_at_idx on documents(submitted_at desc);



Consultas rápidas:

Últimos envios:
- select user_id, type, status, submitted_at from documents order by submitted_at desc limit 50;

Em análise:
- select user_id, type, storage_path, submitted_at from documents where status='under_review' order by submitted_at desc limit 50;

- Aprovações:
select user_id, type, reviewer_id, reviewed_at from documents where status='approved' order by reviewed_at desc limit 50;





Smoke test (fim a fim)

1. Login no app.
2. Console:

const sb = await window.connectSupabase();
const { data: { session } } = await sb.auth.getSession();
const uid = session?.user?.id;
await sb.storage.from('org-docs').list(uid);  // [] num ambiente limpo

3. Tentar PNG (deve falhar), subir PDF (ok).
4. Chamar send_document(...) → 200.
5. Ver pending no banco → “Concluir agora” → under_review.
6. Admin Lite: ver linha “Em análise”, PDF disponível (admin tem doc.view_pdf), aprovar → approved.


Troubleshooting rápido

- PDF não aparece para admin:
  - Verifique cap doc.view_pdf via UI de papéis.
  - Confirme que storage_path guarda a chave e não uma URL.
  - A coluna can_view_pdf é responsabilidade do public.list_docs (não da view).


- 400/401/403 no storage/v1/object/sign/...:
  - Não chame o endpoint HTTP direto; use o SDK createSignedUrl.


- 403 no /rpc/list_docs:
  - Sessão ausente ou falta de papel adm.review/adm.master.


- PGRST203 / 42P13:
  - Duplicatas/sobrecargas antigas → manter uma função por contrato e recarregar catálogo:
select pg_notify('pgrst','reload schema');






