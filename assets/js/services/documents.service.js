/* services/documents.service.js */
window.Bidly = window.Bidly || {};
Bidly.services = Bidly.services || {};

(function (services) {
  const repo = (window.Bidly && window.Bidly.repo && window.Bidly.repo.documents) || null;

  function labelOf(status) {
    const s = String(status || 'pending').toLowerCase();
    if (s === 'approved')     return 'Aprovado';
    if (s === 'rejected')     return 'Reprovado';
    if (s === 'under_review') return 'Em análise';
    return 'Pendente';
  }

  // Carrega o estado do doc + signed URL
  async function fetchState(type) {
    if (!repo) return { ok: false, error: new Error('documents.repo não disponível') };
    try {
      const doc = await repo.getByTypeLite(type); // pode ser null
      const url = doc?.storage_path ? await repo.signedUrlCached(doc.storage_path) : null;
      return {
        ok: true,
        data: {
          exists: !!doc,
          status: doc?.status || 'pending',
          storage_path: doc?.storage_path || null,
          reviewed_at: doc?.reviewed_at || null,
          rejection_reason: doc?.rejection_reason || null,
          signed_url: url,
        },
      };
    } catch (error) {
      return { ok: false, error };
    }
  }

  // Fluxo: upload + (opcional) enviar para análise
  async function uploadAndSubmit(type, file) {
    if (!repo) return { ok: false, error: new Error('documents.repo não disponível') };
    try {
      await repo.upload(type, file);
      await repo.setUnderReview(type);
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  services.documents = {
    labelOf,
    fetchState,
    uploadAndSubmit,
  };
})(Bidly.services);
