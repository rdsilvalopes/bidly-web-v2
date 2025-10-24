/* Bidly • Admin Lite Pro • api.js (alinhado às RPCs reais + shapes corretos) */
window.Bidly = window.Bidly || {};
Bidly.admin = Bidly.admin || {};
Bidly.admin.api = Bidly.admin.api || (function () {
  async function sb() { return await window.connectSupabase(); }

  // ===== LISTA (mantém compat com sua tela atual)
  async function listDocs(_sb, { limit, offset, status, type, q }) {
    const sbc = _sb || (await sb());

    // Se sua tela está usando a function antiga, deixe "legacy = true".
    // Se você já migrou, troque para false e use admin_list_docs.
    const legacy = true;

    if (legacy) {
      return await sbc.rpc("list_docs", {
        p_limit:  limit ?? 20,
        p_offset: offset ?? 0,
        p_status: status ?? null,
        p_type:   type   ?? null,
        p_q:      q      ?? null,
      });
    }

    return await sbc.rpc("admin_list_docs", {
      p_limit:  limit ?? 20,
      p_offset: offset ?? 0,
      p_status: status ?? null,
      p_type:   type   ?? null,
      p_q:      q      ?? null,
    });
  }

  // ===== Aprovar / Reprovar
  async function approveDoc(_sb, user_id, type) {
    const sbc = _sb || (await sb());
    return await sbc.rpc("admin_approve_doc", { p_user_id: user_id, p_type: type });
  }

  async function rejectDoc(_sb, user_id, type, reason) {
    const sbc = _sb || (await sb());
    return await sbc.rpc("admin_reject_doc", {
      p_user_id: user_id,
      p_type: type,
      p_reason: reason ?? null,
    });
  }

  // ===== PDF (signed URL via STORAGE SDK)
  // Aceita storagePath nos formatos:
  //   a) "bucket/obj/path.pdf"      -> bucket explícito
  //   b) "uid/obj/path.pdf"         -> usa DEFAULT_BUCKET
  //   c) "obj/path.pdf"             -> usa DEFAULT_BUCKET
  //
  // IMPORTANTE: ajuste a lista de buckets válidos conforme seu projeto.
  const DEFAULT_BUCKET   = "org-docs";                  // seu bucket “padrão”
  const KNOWN_BUCKETS    = ["org-docs", "public", "private"]; // whiteliste os buckets reais que você usa

  function splitBucketAndPath(rawPath) {
    let p = String(rawPath || "").replace(/^\/+/, "");
    const firstSlash = p.indexOf("/");
    if (firstSlash <= 0) {
      // Sem "/" -> não tem bucket na frente; usa default
      return { bucket: DEFAULT_BUCKET, objectPath: p };
    }
    const head = p.slice(0, firstSlash);
    const rest = p.slice(firstSlash + 1);

    // Só usa o “head” como bucket se estiver na whitelist
    if (KNOWN_BUCKETS.includes(head) && rest) {
      return { bucket: head, objectPath: rest };
    }
    // Caso contrário, trata tudo como objectPath no DEFAULT_BUCKET
    return { bucket: DEFAULT_BUCKET, objectPath: p };
  }

  async function signedUrl(_sb, storagePath, ttlSec = 120) {
    if (!storagePath) return { data: null, error: null };
    const sbc = _sb || (await sb());

    const { bucket, objectPath } = splitBucketAndPath(storagePath);

    try {
      const { data, error } = await sbc
        .storage
        .from(bucket)
        .createSignedUrl(objectPath, Math.max(1, parseInt(ttlSec, 10) || 120));

      if (error) return { data: null, error };
      return { data: data?.signedUrl || null, error: null };
    } catch (e) {
      return { data: null, error: e };
    }
  }

  // ===== DETALHE/NOTAS (RPCs existentes) =====

  // IMPORTANTE: esta função devolve SEMPRE { data: <objeto> }
  // Se a RPC retornar array, eu pego o primeiro elemento.
  async function orgDetail(_sb, user_id) {
    const sbc = _sb || (await sb());
    const { data, error } = await sbc.rpc("admin_get_org_profile", { p_user_id: user_id });
    if (error) return { data: null, error };

    // Normaliza para objeto:
    const obj = Array.isArray(data) ? (data[0] || null) : (data || null);
    return { data: obj, error: null };
  }

  async function notesList(_sb, user_id) {
    const sbc = _sb || (await sb());
    // Aqui o shape é lista mesmo (o view espera array)
    return await sbc.rpc("admin_list_support_notes", { p_user_id: user_id });
  }

  // Unificada: grava observação interna (visibility=internal)
  async function addInternalNote(_sb, user_id, message) {
    const sbc = _sb || (await sb());
    return await sbc.rpc("admin_add_support_note", {
      p_user_id: user_id,
      p_message: message,
      p_visibility: "internal",
    });
  }

  // Unificada: grava mensagem para o app (visibility=app)
  async function addAppMessage(_sb, user_id, message) {
    const sbc = _sb || (await sb());
    return await sbc.rpc("admin_add_support_note", {
      p_user_id: user_id,
      p_message: message,
      p_visibility: "app",
    });
  }

  // Atualiza os campos da organização via patch (JSON)
  async function orgUpdate(_sb, user_id, patch) {
    const sbc = _sb || (await sb());
    return await sbc.rpc("admin_update_org_profile", {
      p_user_id: user_id,
      p_patch: patch || {},
    });
  }

  return {
    listDocs,
    approveDoc,
    rejectDoc,
    signedUrl,

    orgDetail,
    notesList,
    addInternalNote,
    addAppMessage,
    orgUpdate,
  };
})();
