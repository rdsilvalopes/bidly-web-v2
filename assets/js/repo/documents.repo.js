/* /assets/js/repo/documents.repo.js
   Bidly • Repo • Documents (bucket privado + signed URL 72h)
*/
window.Bidly = window.Bidly || {};
Bidly.repo = Bidly.repo || {};

Bidly.repo.documents = (function (C) {
  const TABLE       = "documents";
  // ⚠️ Mantemos a constante apenas como referência, mas NÃO selecionamos mais direto na tabela.
  const NOTES_TABLE = "support_notes";
  const BUCKET      = C.DOCS_BUCKET;

  // ---- CACHE DE SIGNED URL (evita refazer a cada refresh) ----
  // path -> { url, exp } (exp em epoch seconds)
  const _signedCache = new Map();

  // invalida cache local para um path (usar após upload/remove)
  function invalidateSignedUrl(path) {
    if (path) _signedCache.delete(String(path));
  }

  function storage() {
    // usa o bucket configurado em constants.js (ex.: 'org-docs')
    return sb.storage.from(BUCKET);
  }

  async function signedUrlCached(path, ttl = C.DOCS_SIGNED_URL_TTL) {
    if (!path) throw new Error("storage_path ausente");
    const now = Math.floor(Date.now() / 1000);
    const hit = _signedCache.get(path);
    if (hit && hit.exp > now + 30) return hit.url; // margem de 30s
    const { data, error } = await storage().createSignedUrl(path, ttl);
    if (error) throw error;
    _signedCache.set(path, { url: data.signedUrl, exp: now + ttl });
    return data.signedUrl;
  }

  // ===== URL assinada (72h) =====
  async function signedUrl(path, ttl = C.DOCS_SIGNED_URL_TTL) {
    if (!path) throw new Error("storage_path ausente");
    const { data, error } = await storage().createSignedUrl(path, ttl);
    if (error) throw error;
    return data.signedUrl;
  }

  // ---- SELECT LEVE (evita *) ----
  async function getByTypeLite(type) {
    const { data, error } = await sb
      .from(TABLE)
      .select("status, storage_path, rejection_reason, submitted_at, reviewed_at")
      .eq("type", type)
      .maybeSingle(); // evita PGRST116 quando não existe
    if (error) throw error;
    return data || null;
  }

  // ===== DB (consulta completa) =====
  async function getByType(type) {
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("type", type)
      .maybeSingle();
    if (error) throw error; // quando não existe, data = null
    return data || null;
  }

  // ===== helpers =====
  async function getUid() {
    const { data, error } = await sb.auth.getUser();
    if (error || !data?.user?.id) throw new Error("Sessão inválida");
    return data.user.id;
  }

  function slugName(name) {
    return String(name || "file.pdf")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_");
  }

  // ===== Upload =====
  // Sobe pro Storage e REGISTRA via RPC send_document (RLS-friendly)
  async function upload(type, file) {
    if (!file) throw new Error("Arquivo ausente");
    if (C.DOCS_ACCEPT && file.type && file.type !== C.DOCS_ACCEPT) {
      throw new Error("Tipo de arquivo inválido. Envie um PDF.");
    }

    const uid  = await getUid();
    const ts   = Date.now();
    const safe = `${ts}_${slugName(file.name || `${type}.pdf`)}`; // reservado p/ histórico se quiser

    // caminho compatível com as políticas: sempre começa com `${uid}/`
    const path = `${uid}/${type}.pdf`; // ex.: <uid>/company_contract.pdf

    // 1) Upload no bucket
    const { error: e1 } = await storage().upload(path, file, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (e1) throw e1;

    // ✅ invalida cache local da signed URL para este path
    invalidateSignedUrl(path);

    // 2) Registrar via função estável (NÃO faz upsert direto por RLS)
    const { error: e2 } = await sb.rpc("send_document", {
      p_type: type,
      p_storage_path: path,
    });
    if (e2) {
      // se falhar o registro, tenta remover o arquivo para não ficar órfão
      try { await storage().remove([path]); } catch {} // best-effort
      // e garante que a URL assinada antiga não fique valendo
      invalidateSignedUrl(path);
      throw e2;
    }

    return path;
  }

  // ===== Enviar para análise (UI: “Concluir agora”) =====
  async function setUnderReview(type) {
    const { error } = await sb
      .from(TABLE)
      .update({ status: "under_review", submitted_at: new Date().toISOString() })
      .eq("type", type);
    if (error) throw error;
    return true;
  }

  // ===== Remover doc do usuário (storage + linha) =====
  async function clear(type) {
    const doc = await getByType(type);
    if (doc?.storage_path) {
      const { error: e1 } = await storage().remove([doc.storage_path]);
      if (e1) throw e1;
      // ✅ invalida cache local (link passa a 404 até novo upload)
      invalidateSignedUrl(doc.storage_path);
    }
    // delete na tabela respeitando RLS (linha do próprio usuário)
    const { error: e2 } = await sb.from(TABLE).delete().eq("type", type);
    if (e2) throw e2;
    return true;
  }

  // ===== Notas (somente leitura)
  // Agora SEMPRE via RPC app_list_company_notes (RLS + filtro por empresa + visibility='app')
  // - limit/offset para paginação simples
  // - forUserId: “empresa em foco”; se omitido, usa o próprio auth.uid()
  async function listNotes(limit = 20, offset = 0, forUserId = null) {
    const targetUserId = forUserId || await getUid();

    const { data, error } = await sb.rpc("app_list_company_notes", {
      p_user_id: targetUserId,
      p_limit:   limit,
      p_offset:  offset,
    });

    if (error) throw error;

    // Normaliza para o formato consumido pela UI (compatível com renderers existentes)
    const rows = (data || []).map(n => ({
      id: n.id,
      created_at: n.created_at,
      created_by_name: n.reviewer_name ?? null,
      reason_code: null,          // não usado nesta superfície
      message: n.message || "",
      visibility: "app",
    }));

    return rows;
  }

  return {
    // urls
    signedUrl,
    signedUrlCached,
    // dados
    getByType,
    getByTypeLite,
    // ações
    upload,
    setUnderReview,
    clear,
    listNotes,
    // meta
    BUCKET,
    // util opcional (pode ser útil fora do módulo)
    invalidateSignedUrl,
  };
})(Bidly.constants);
