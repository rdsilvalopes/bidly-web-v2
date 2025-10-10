/**
 * activation.js — Fluxo de ativação em TELA INTEIRA (branco), sem modais flutuantes.
 * Ordem (Empresa): Termos → Organização (CNPJ matriz) → Documentos → fim.
 * Mantém tudo neste arquivo (patchProfile, getProfile, loadTermsHTML), sem dependências externas.
 */

(async function () {
  const TAG = "[activation]";

  // ===== Helpers =====
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const show = (el) => el?.classList?.remove("hide");
  const hide = (el) => el?.classList?.add("hide");

  // ===== Constantes =====
  const TERMS_VER = 1;
  const TERMS_URL = `/legal/terms/pt-BR/${TERMS_VER}/terms.html`;
  const ORG_CANCEL_REDIRECT = "/";

  // ===== Supabase =====
  if (!window.connectSupabase) {
    console.warn(`${TAG} supa.js não carregou.`);
    return;
  }
  const sb = await window.connectSupabase();

  // Sessão e usuário
  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr) { console.error(TAG, userErr); return; }
  if (!user)    { return; }

  // ===== Acesso/Mutação de perfil (todas neste arquivo) =====
  async function upsertProfileSkeleton() {
    await sb.from("profiles").upsert(
      { id: user.id, email: user.email },
      { onConflict: "id" }
    );
  }

  async function getProfile() {
    const { data, error } = await sb
      .from("profiles")
      .select(
        "id,email,role,terms_accepted,terms_accepted_at,terms_version," +
        "org_submitted,org_type,org_name,org_trade_name,org_document," +
        "org_city,org_state,org_zip,org_address,org_number,org_complement,org_district," +
        "docs_submitted"
      )
      .eq("id", user.id)
      .single();
    if (error) throw error;
    return data;
  }

  async function patchProfile(patch) {
    const { error } = await sb.from("profiles").update(patch).eq("id", user.id);
    if (error) throw error;
  }

  await upsertProfileSkeleton();
  let profile = await getProfile();

  // ===== Elementos =====
  const termsSheet  = $("#termsFull");
  const termsBox    = $("#termsBox");
  const chkAgree    = $("#chkAgree");
  const btnAccept   = $("#btnAcceptTerms");
  const btnCancelT  = $("#btnCancelTerms");
  const btnPrint    = $("#btnPrintTerms");
  const lblVer      = $("#termsVer");
  if (lblVer) lblVer.textContent = String(TERMS_VER);

  const orgSheet     = $("#orgFull");
  const orgForm      = $("#orgForm");
  const btnOrgCancel = $("#btnOrgCancel");

  // IDs oficiais (alinhados ao index.html)
  const inCnpj     = $("#org_document");
  const inCep      = $("#org_zip");
  const inUf       = $("#org_state");
  const inTrade    = $("#org_trade_name");
  const inDistrict = $("#org_district");
  const inCity     = $("#org_city");
  const inAddr     = $("#org_address");
  const inNumber   = $("#org_number");
  const inCompl    = $("#org_complement");
  const inName     = $("#org_name");

  const docsSheet    = $("#docsFull");
  const btnDocsNow   = $("#btnDocsNow");
  const btnDocsLater = $("#btnDocsLater");

  // ===== Termos (carregamento + eventos) =====
  async function loadTermsHTML() {
    try {
      const html = await fetch(TERMS_URL, { cache: "no-store" }).then((r) => r.text());
      if (termsBox) termsBox.innerHTML = html;
    } catch {
      if (termsBox) termsBox.innerHTML = `<p>Não foi possível carregar os termos agora.</p>`;
    }
  }

  function wireTerms() {
    if (!termsBox) return;

    const setState = () => {
      const atEnd = (termsBox.scrollTop + termsBox.clientHeight) >= (termsBox.scrollHeight - 2);
      const agreed = !!chkAgree?.checked;
      if (btnAccept) btnAccept.disabled = !(atEnd && agreed);
    };

    termsBox.addEventListener("scroll", setState, { passive: true });
    chkAgree?.addEventListener("change", setState);
    setState();

    btnPrint?.addEventListener('click', async () => {
      try {
        const raw = await fetch(TERMS_URL, { cache: 'no-store' }).then(r => r.text());
        const stamped = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Termos de Uso — Bidly</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.45;margin:24px}
  header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #ddd}
  small{color:#555}
  @media print{button{display:none}}
</style></head><body>
<header><strong>Termos de Uso — Bidly</strong><small>Usuário: ${user?.email ?? '—'}</small></header>
<main>${raw}</main>
<script>window.print()</script>
</body></html>`;
        const blob = new Blob([stamped], { type: 'text/html' });
        const url  = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
      } catch (e) {
        console.warn('[terms] Falha ao abrir PDF:', e);
        window.open(TERMS_URL, '_blank', 'noopener');
      }
    });

    btnCancelT?.addEventListener('click', () => {
      hide(termsSheet);
      try { window.location.assign('/'); } catch {}
    });

    btnAccept?.addEventListener("click", async () => {
      try {
        await patchProfile({
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
          terms_version: TERMS_VER
        });
        profile = await getProfile();
        hide(termsSheet);
        await nextStep();
      } catch (e) {
        console.error(TAG, "Erro ao aceitar termos:", e);
      }
    });
  }

  // ===== Organização (Empresa: CNPJ matriz) =====
  function wireOrg() {
    if (!orgForm) return;

    btnOrgCancel?.addEventListener("click", (e) => {
      e.preventDefault();
      hide(orgSheet);
      try { window.location.assign(ORG_CANCEL_REDIRECT); } catch {}
    });

    const showErrors = (items) => {
      const box = document.getElementById('orgErrors');
      if (!box) return;
      if (!items || !items.length) {
        box.classList.add('hide');
        box.innerHTML = '';
        return;
      }
      box.innerHTML = `<strong>Preencha os campos obrigatórios:</strong>
        <ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;
      box.classList.remove('hide');
      try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
    };

    orgForm.onsubmit = async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation?.();
      showErrors([]);

      // Coleta dos valores
      const cnpj     = (inCnpj?.value || "").trim();
      const razao    = (inName?.value || "").trim();
      const trade    = (inTrade?.value || "").trim();
      const addr     = (inAddr?.value || "").trim();
      const number   = (inNumber?.value || "").trim();
      const uf       = (inUf?.value || "").trim();
      const city     = (inCity?.value || "").trim();
      const district = (inDistrict?.value || "").trim();
      const cep      = (inCep?.value || "").trim();

      // Normalização (sem obrigar máscara no banco)
      const cnpjDigits = cnpj.replace(/\D/g, ""); // 14
      const cepDigits  = cep.replace(/\D/g, "");  // 8

      // Validação (Empresa/PJ)
      const missing = [];
      if (!cnpj)     missing.push("CNPJ");
      if (!razao)    missing.push("Razão Social");
      if (!trade)    missing.push("Nome Fantasia");
      if (!addr)     missing.push("Logradouro");
      if (!number)   missing.push("Número");
      if (!uf)       missing.push("Estado (UF)");
      if (!city)     missing.push("Cidade");
      if (!district) missing.push("Bairro");
      if (!cep)      missing.push("CEP");

      if (missing.length) { showErrors(missing); return; }

      // Patch (Empresa/PJ — CNPJ matriz)
      const patch = {
        role: "company",
        org_type: "PJ",
        org_document: cnpjDigits || cnpj || null,
        org_zip:      cepDigits  || cep  || null,
        org_city:     city || null,
        org_state:    (uf || "").toUpperCase() || null,
        org_address:  addr || null,
        org_number:   number || null,
        org_complement: (inCompl?.value || "").trim() || null,
        org_name:       razao || null,
        org_trade_name: trade || null,
        org_district:   district || null,
        org_submitted:  true
      };

      try {
        await patchProfile(patch);
        profile = await getProfile();
        showErrors([]);
        hide(orgSheet);
        await nextStep();
      } catch (err) {
        console.error(TAG, "Erro ao salvar organização:", err);
        const box = document.getElementById('orgErrors');
        if (box) {
          box.innerHTML = `<strong>Não foi possível salvar:</strong><ul><li>${err?.message || "Erro desconhecido"}</li></ul>`;
          box.classList.remove('hide');
        }
      }
    };
  }

  // ===== Documentos =====
  function wireDocs() {
    if (!docsSheet) return;

    btnDocsNow?.addEventListener("click", async () => {
      try {
        await patchProfile({ docs_submitted: true });
        profile = await getProfile();
        hide(docsSheet);
        await nextStep();
      } catch (e) {
        console.error(TAG, "Erro ao marcar documentos:", e);
      }
    });

    btnDocsLater?.addEventListener("click", async () => {
      try {
        await patchProfile({ docs_submitted: true });
        profile = await getProfile();
        hide(docsSheet);
        await nextStep();
      } catch (e) {
        console.error(TAG, "Erro ao pular documentos:", e);
      }
    });
  }

  // ===== Progresso e decisão de etapa =====
  function getTotalSteps() {
    // Empresa (padrão): 3 etapas
    if (profile?.role === "company") return 3;
    // Fornecedor: poderá ser 3 (PJ) ou 4 (CPF) — definiremos quando ativarmos esse fluxo
    return 3;
  }

  function updateProgress() {
    const total = getTotalSteps();
    let done = 0;

    if (profile.terms_accepted === true &&
        Number(profile.terms_version ?? 0) === Number(TERMS_VER)) done++;

    if (profile.org_submitted === true) done++;

    if (profile.docs_submitted === true) done++;

    $$(".act-progress__text").forEach(el => el.textContent = `Etapa ${done}/${total}`);
    const percent = Math.round((done / total) * 100);
    $$(".act-progress__fill").forEach(el => el.style.width = `${percent}%`);
  }

  async function nextStep() {
    updateProgress();

    // 1) Termos
    if (profile.terms_accepted !== true ||
        Number(profile.terms_version ?? 0) !== Number(TERMS_VER)) {
      await loadTermsHTML();
      show(termsSheet); hide(orgSheet); hide(docsSheet);
      updateProgress(); return;
    }

    // 2) Organização (Empresa)
    if (profile.role === "company" && profile.org_submitted !== true) {
      hide(termsSheet); show(orgSheet); hide(docsSheet);
      updateProgress(); return;
    }

    // 3) Documentos
    if (profile.docs_submitted !== true) {
      hide(termsSheet); hide(orgSheet); show(docsSheet);
      updateProgress(); return;
    }

    // Concluído
    hide(termsSheet); hide(orgSheet); hide(docsSheet);
    updateProgress();
  }

  // ===== Bootstrap =====
  try {
    wireTerms();
    wireOrg();
    wireDocs();
    await nextStep();
  } catch (e) {
    console.error(TAG, e);
  }
})();
