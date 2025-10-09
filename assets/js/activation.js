/**
 * activation.js — Fluxo de ativação em TELA INTEIRA (branco), sem modais flutuantes.
 * Ordem: Termos -> (se empresa) Organização -> (opcional) Documentos -> fim.
 * - Sem dependência de “gate” ou localStorage.
 * - Tolerante: se a folha/etapa não existir no DOM, ela é ignorada (não quebra).
 */

(async function () {
  const TAG = "[activation]";

  // ===== Helpers =====
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const show = (el) => el?.classList?.remove("hide");
  const hide = (el) => el?.classList?.add("hide");

  // ===== Constantes dos Termos =====
  const TERMS_VER = 1; // << mude aqui quando trocar a versão
  const TERMS_URL = `/legal/terms/pt-BR/${TERMS_VER}/terms.html`;

  // ===== Supabase =====
  if (!window.connectSupabase) {
    console.warn(`${TAG} supa.js não carregou.`);
    return;
  }
  const sb = await window.connectSupabase();

  // Sessão e usuário
  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr) { console.error(TAG, userErr); return; }
  if (!user)    { return; } // não logado

  // ===== Acesso ao perfil =====
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
        // **APENAS** acrescentamos terms_version aqui
        "id,email,role,terms_accepted,terms_accepted_at,terms_version,org_submitted,org_type,org_name,org_trade_name,org_document,org_city,org_state,org_zip,org_address,org_number,org_complement,docs_submitted"
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

  // ===== Elementos das folhas =====
  // Termos
  const termsSheet  = $("#termsFull");
  const termsBox    = $("#termsBox");
  const chkAgree    = $("#chkAgree");
  const btnAccept   = $("#btnAcceptTerms");
  const btnCancelT  = $("#btnCancelTerms");
  const btnPrint    = $("#btnPrintTerms");
  const lblVer      = $("#termsVer");
  if (lblVer) lblVer.textContent = String(TERMS_VER);

  // Organização (Empresa)
  const orgSheet     = $("#orgFull");
  const orgForm      = $("#orgForm");
  const btnOrgCancel = $("#btnOrgCancel");
  const inCnpj       = $("#org_cnpj");
  const inCep        = $("#org_cep");
  const inCity       = $("#org_city");
  const inUf         = $("#org_uf");
  const inAddr       = $("#org_address");
  const inNumber     = $("#org_number");
  const inCompl      = $("#org_complement");
  const inName       = $("#org_name");
  const inTrade      = $("#org_trade");

  // Documentos (OPCIONAL — pode não existir no HTML)
  const docsSheet    = $("#docsFull");
  const btnDocsNow   = $("#btnDocsNow");
  const btnDocsLater = $("#btnDocsLater");

  // ===== Termos =====
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

    // listeners únicos
    termsBox.addEventListener("scroll", setState, { passive: true });
    chkAgree?.addEventListener("change", setState);
    setState(); // estado inicial

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

        // Fallback robusto: blob + URL.createObjectURL
        const blob = new Blob([stamped], { type: 'text/html' });
        const url  = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
      } catch (e) {
        console.warn('[terms] Falha ao abrir PDF:', e);
        // Último fallback: abre o HTML cru (sem carimbo) direto
        window.open(TERMS_URL, '_blank', 'noopener');
      }
    });

    // Configurável: para onde ir ao cancelar termos (mantém tudo o resto intacto)
    const CANCEL_REDIRECT = '/';   // ajuste se seu app estiver em outra rota

    btnCancelT?.addEventListener('click', () => {
      hide(termsSheet);               // some com a folha
      try { window.location.assign(CANCEL_REDIRECT); } catch { /* no-op */ }
    });

    btnAccept?.addEventListener("click", async () => {
      try {
        // **APENAS** acrescentamos terms_version aqui
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
  } // <<< FECHA wireTerms() AQUI

  // ===== Organização =====
  function wireOrg() {
    if (!orgForm) return;

    btnOrgCancel?.addEventListener("click", () => hide(orgSheet));

    // Evita múltiplos binds: sobrescreve o handler
    orgForm.onsubmit = async (e) => {
      e.preventDefault();

      const cnpj  = (inCnpj?.value || "").trim();
      const razao = (inName?.value || "").trim();

      // Validação simples — alerta apenas uma vez por submit
      if (!cnpj || !razao) {
        alert("Preencha Razão social e CNPJ.");
        return;
      }

      const patch = {
        role: "company",
        org_type: "PJ",
        org_document: cnpj || null,
        org_zip: (inCep?.value || "").trim() || null,
        org_city: (inCity?.value || "").trim() || null,
        org_state: (inUf?.value || "").trim().toUpperCase() || null,
        org_address: (inAddr?.value || "").trim() || null,
        org_number: (inNumber?.value || "").trim() || null,
        org_complement: (inCompl?.value || "").trim() || null,
        org_name: razao || null,
        org_trade_name: (inTrade?.value || "").trim() || null,
        org_submitted: true
      };

      try {
        await patchProfile(patch);
        profile = await getProfile();
        hide(orgSheet);
        await nextStep(); // segue para próxima etapa (se existir) ou encerra
      } catch (err) {
        console.error(TAG, "Erro ao salvar organização:", err);
        alert("Não foi possível salvar os dados da organização. Tente novamente.");
      }
    };
  }

  // ===== Documentos (opcional) =====
  function wireDocs() {
    if (!docsSheet) return; // não existe no DOM -> ignora

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



    // ===== Progresso (contador de etapas) =====
    function updateProgress() {
      const total = docsSheet ? 4 : 3;
      let done = 0;
      if (profile.terms_accepted === true && Number(profile.terms_version ?? 0) === TERMS_VER) done++;
      if (profile.org_submitted === true) done++;
      if (docsSheet && profile.docs_submitted === true) done++;

      // Atualiza texto e barra em todas as folhas existentes
      $$(".act-progress__text").forEach(el => el.textContent = `Etapa ${done}/${total}`);
      const percent = Math.round((done / total) * 100);
      $$(".act-progress__fill").forEach(el => el.style.width = `${percent}%`);
    }





  // ===== Decisor de fluxo =====
  async function nextStep() {
     updateProgress(); // entra já sincronizando
    // 1) Termos pendentes **ou versão diferente**?
    if (profile.terms_accepted !== true || Number(profile.terms_version ?? 0) !== Number(TERMS_VER)) {
      await loadTermsHTML();
      show(termsSheet);
      hide(orgSheet); hide(docsSheet);
      updateProgress(); // <<< garante contador certo mesmo na primeira folha
      return;
    }

    // 2) Empresa sem organização enviada?
    if (profile.role === "company" && profile.org_submitted !== true) {
      hide(termsSheet); show(orgSheet); hide(docsSheet);
      updateProgress(); // <<< <<< atualiza contador ao abrir Organização
      return;
    }

    // 3) Documentos (só entra se a folha existir no DOM)
    if (docsSheet && profile.docs_submitted !== true) {
      hide(termsSheet); hide(orgSheet); show(docsSheet);
      updateProgress(); // <<< idem Documentos
      return;
    }

    // 4) Nada a fazer — fecha todas as folhas
    hide(termsSheet); hide(orgSheet); hide(docsSheet);
    updateProgress(); // <<< finaliza com barra 100%
  }

  // ===== Boot =====
  try {
    wireTerms();
    wireOrg();
    wireDocs();
    await nextStep();
  } catch (e) {
    console.error(TAG, e);
  }
})(); // executa a IIFE
