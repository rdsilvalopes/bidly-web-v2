(async () => {
  // ===== deps =====
  const sb = await window.connectSupabase();
  const C  = window.Bidly?.constants || {}; // DOCS_BUCKET, DOCS_SIGNED_URL_TTL (opcional)

  // ===== refs (ajuste IDs conforme seu HTML desta página) =====
  const fileInput   = document.querySelector('#docFile');      // <input type="file" id="docFile">
  const btnSend     = document.querySelector('#btnSendDoc');   // botão "Enviar / Substituir"
  const btnContinue = document.querySelector('#btnContinue');  // botão "Continuar depois"
  const statusBadge = document.querySelector('#docStatus');    // span com o status
  const helpText    = document.querySelector('#docHelp');      // parágrafo de ajuda/mensagens
  const linkWrap    = document.querySelector('#docLink');      // <a id="docLink">PDF</a> (opcional)

  // ===== config =====
  const BUCKET   = C.DOCS_BUCKET || 'org-docs';
  const DOC_TYPE = 'company_contract';

  // ===== utils =====
  function setBusy(on) {
    if (btnSend)     btnSend.disabled = on;
    if (btnContinue) btnContinue.disabled = on;
    if (fileInput)   fileInput.disabled = on;
  }
  function toast(msg) {
    if (helpText) helpText.textContent = msg;
    else alert(msg);
  }
  function labelOf(status) {
    const s = String(status || 'pending').toLowerCase();
    if (s === 'approved')     return 'Aprovado';
    if (s === 'rejected')     return 'Reprovado';
    if (s === 'under_review') return 'Em análise';
    return 'Pendente';
  }
  function applyStatusUI(status, hasFileLink) {
    if (statusBadge) statusBadge.textContent = labelOf(status);
    // Política simples:
    // - pending / rejected  -> permite enviar/substituir
    // - under_review        -> trava envio (aguardando TIME)
    // - approved            -> trava envio
    const s = String(status || 'pending').toLowerCase();
    const canSend = (s === 'pending' || s === 'rejected');
    if (btnSend)     btnSend.disabled = !canSend;
    if (btnContinue) btnContinue.disabled = false;
    // Link do PDF (opcional)
    if (linkWrap) {
      if (hasFileLink && typeof hasFileLink === 'string') {
        linkWrap.href = hasFileLink;
        linkWrap.style.display = '';
      } else {
        linkWrap.removeAttribute('href');
        linkWrap.style.display = 'none';
      }
    }
  }
  async function signedUrlOrNull(storagePath) {
    try {
      if (!storagePath) return null;
      const { data, error } = await sb.storage.from(BUCKET)
        .createSignedUrl(storagePath, C.DOCS_SIGNED_URL_TTL || 60 * 60 * 24);
      if (error) return null;
      return data?.signedUrl || null;
    } catch { return null; }
  }

  // ===== leitura do estado atual (SEM owner_user_id; usa RLS) =====
  async function loadDocState() {
    const { data: doc, error } = await sb
      .from('documents')
      .select('status, storage_path, submitted_at, reviewed_at, rejection_reason')
      .eq('type', DOC_TYPE)
      .maybeSingle(); // ✅ evita PGRST116 quando não existe

    if (error) {
      console.error('[docs] loadDocState error', error);
      return { exists: false, status: 'pending', storage_path: null };
    }
    if (!doc) return { exists: false, status: 'pending', storage_path: null };
    return { exists: true, ...doc };
  }

  async function refreshUI() {
    const st = await loadDocState();
    const url = await signedUrlOrNull(st.storage_path);
    applyStatusUI(st.status, url);
    if (!st.exists) toast('Anexe o PDF para prosseguir.');
    else helpText && (helpText.textContent = '');
  }

  // ===== envio/substituição do PDF =====
  async function handleSend() {
    try {
      if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        toast('Selecione um arquivo PDF.');
        return;
      }
      const file = fileInput.files[0];
      if (file.type !== 'application/pdf') {
        toast('Envie um arquivo no formato PDF.');
        return;
      }

      setBusy(true);
      toast('Enviando arquivo…');

      // 1) Upload (upsert=true para permitir substituir)
      // caminho canônico por usuário + tipo (ex.: {uid}/company_contract.pdf)
      const { data: sess } = await sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) { toast('Sessão expirada. Faça login.'); setBusy(false); return; }

      const filePath = `${uid}/${DOC_TYPE}.pdf`;
      const { error: upErr } = await sb.storage.from(BUCKET)
        .upload(filePath, file, { upsert: true, contentType: 'application/pdf' });
      if (upErr) {
        console.error('[docs] upload error', upErr);
        toast('Falha ao enviar PDF.');
        setBusy(false);
        return;
      }

      // 2) Registra no banco via função ESTÁVEL (RLS-friendly):
      //    send_document(p_type text, p_storage_path text)
      const { error: rpcErr } = await sb.rpc('send_document', {
        p_type: DOC_TYPE,
        p_storage_path: filePath,
      });
      if (rpcErr) {
        console.error('[docs] send_document error', rpcErr);
        toast('Falha ao registrar o envio.');
        setBusy(false);
        return;
      }

      toast('Documento enviado. Situação: em análise.');
      await refreshUI();
    } catch (e) {
      console.error('[docs] unexpected', e);
      toast('Erro inesperado ao enviar.');
    } finally {
      setBusy(false);
    }
  }

  // ===== wire =====
  btnSend?.addEventListener('click', handleSend);



  // ===== boot =====
  const { data: sess } = await sb.auth.getSession();
  if (!sess?.session) {
    alert('Faça login para continuar.');
    location.href = '/';
    return;
  }
  await refreshUI();
})();
