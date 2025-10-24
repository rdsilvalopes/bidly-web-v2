/* repo/documents.repo.js */
window.Bidly = window.Bidly || {};
Bidly.repo = Bidly.repo || {};

(function(repo) {
  const pick = (a, b) => (a ?? b);

  async function sbClient() {
    return await window.connectSupabase();
  }

  async function getSessionUserId(sb) {
    const { data } = await sb.auth.getSession();
    return data?.session?.user?.id || null;
  }

  function constants() {
    return window.Bidly?.constants || {};
  }

  // === SELECT único do doc do usuário logado (RLS cuida do filtro por user_id)
  async function getMyDocument(type) {
    const sb = await sbClient();
    const { data, error } = await sb
      .from('documents')
      .select('status, storage_path, submitted_at, reviewed_at, rejection_reason')
      .eq('type', type)
      .maybeSingle(); // evita PGRST116 quando não existe

    if (error) return { ok:false, error, data:null };
    return { ok:true, data: data || null };
  }

  // === Upload para Storage (caminho canônico: {uid}/{type}.pdf)
  async function uploadPdf(type, file) {
    const sb = await sbClient();
    const C  = constants();
    const BUCKET = C.DOCS_BUCKET || 'org-docs';

    const uid = await getSessionUserId(sb);
    if (!uid) return { ok:false, error: new Error('Sessão expirada'), path:null };

    const filePath = `${uid}/${type}.pdf`;
    const { error } = await sb.storage.from(BUCKET)
      .upload(filePath, file, { upsert: true, contentType: 'application/pdf' });

    if (error) return { ok:false, error, path:null };
    return { ok:true, path:filePath };
  }

  // === RPC estável para registrar envio
  async function sendDocument(type, storagePath) {
    const sb = await sbClient();
    const { error } = await sb.rpc('send_document', {
      p_type: type,
      p_storage_path: storagePath
    });
    if (error) return { ok:false, error };
    return { ok:true };
  }

  // === Signed URL (ou null)
  async function signedUrlOrNull(storagePath) {
    try {
      if (!storagePath) return null;
      const sb = await sbClient();
      const C  = constants();
      const BUCKET = C.DOCS_BUCKET || 'org-docs';
      const TTL    = pick(C.DOCS_SIGNED_URL_TTL, 60 * 60 * 24);
      const { data, error } = await sb.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, TTL);
      if (error) return null;
      return data?.signedUrl || null;
    } catch {
      return null;
    }
  }

  repo.documents = {
    getMyDocument,
    uploadPdf,
    sendDocument,
    signedUrlOrNull,
  };
})(Bidly.repo);
