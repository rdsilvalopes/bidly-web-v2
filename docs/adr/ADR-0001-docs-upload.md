# ADR-0001 — Pipeline de upload de documentos (PDF)

## Status
Accepted — 2025-10-17

## Contexto
Precisamos receber 1 PDF por usuário para verificação cadastral. O arquivo deve ficar privado, acessível ao usuário e à equipe de revisão. O registro precisa ser consistente, auditável e simples de operar.

## Decisão
- **Storage**
  - Bucket: `org-docs`
  - Path canônico: `${uid}/company_contract.pdf`
  - Policies: primeira pasta = `auth.uid()`; extensão obrigatória `.pdf`

- **Dados (public.documents)**
  - `type` é `enum doc_type` com valor `company_contract`
  - UNIQUE `(user_id, type)` para permitir UPSERT determinístico
  - RLS: usuário lê/atualiza apenas a própria linha

- **RPC**
  - Única função: `public.send_document(p_type doc_type, p_storage_path text)` com `SECURITY DEFINER`
  - Efeito: UPSERT com `status = 'pending'` + `submitted_at = now()`

- **Estado**
  - `pending → under_review → approved | rejected`

- **Admin Lite**
  - Listagem + ações de aprovação/reprovação protegidas por **RBAC** (capacidade `doc.review` e `doc.view_pdf`)

## Alternativas consideradas
- RPC `(text, text)` com cast interno — rejeitada por ambiguidade com PostgREST (PGRST203) quando existiam duas versões.

## Consequências
- Fluxo simples, seguro e auditável.
- Troca futura de tipo de documento exige apenas **ALTER TYPE ... ADD VALUE**.
