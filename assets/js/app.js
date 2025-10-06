// /assets/js/app.js — robusto c/ auto-cura + modal claro Organização (PJ/CPF) + escolha/lock por role
(function () {
  const $ = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", boot);

  // ---------- Utils ----------
  function show(el) { if (el) { el.classList.remove("hide"); if (el.setAttribute) el.setAttribute("aria-hidden", "false"); } }
  function hide(el) { if (el) { el.classList.add("hide");  if (el.setAttribute) el.setAttribute("aria-hidden", "true"); } }
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function onlyDigits(s) { return String(s || "").replace(/\D+/g, ""); }

  // ---------- Logout hard ----------
  async function hardSignOut({ redirect = true } = {}) {
    try { await sb?.auth?.signOut?.({ scope: "global" }); } catch (e) { console.warn("[auth] signOut falhou:", e); }
    try {
      Object.keys(localStorage)
        .filter((k) => /^sb-.*-auth-token$/.test(k) || k.startsWith("supabase"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) { console.warn("[auth] limpar caches:", e); }
    if (redirect) location.href = "/index.html";
  }
  window.hardSignOut = hardSignOut;

  // ---------- Sessão segura ----------
  async function safeInitAuth() {
    try {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      const session = data?.session ?? null;
      if (!session) { location.href = "/index.html"; return null; }

      const uid = session.user?.id;
      const ping = await sb.from("profiles").select("id").eq("id", uid).limit(1);
      const unauthorized = ping.error && (ping.error.status === 401 || ping.error.status === 403 || /jwt|token/i.test(ping.error.message || ""));
      if (unauthorized) { await hardSignOut({ redirect: true }); return null; }
      return session;
    } catch (e) {
      console.warn("[auth] safeInitAuth:", e);
      await hardSignOut({ redirect: true });
      return null;
    }
  }

  // ---------- Boot ----------
  async function boot() {
    try {
      if (new URLSearchParams(location.search).get("logout") === "1") { await hardSignOut(); return; }

      await connectSupabase();

      const session = await safeInitAuth();
      if (!session) return;

      $("userEmail")?.replaceChildren(session.user?.email || "—");
      document.querySelectorAll("[data-auth]").forEach((el) => { el.classList.remove("hide"); el.removeAttribute("aria-hidden"); });

      // Sair
      const btnOut = $("btnOutTop") || $("btnSignOut");
      btnOut?.addEventListener("click", async (ev) => { ev.preventDefault(); await hardSignOut(); });

      await paintUserRole(session);

      // Wire modal "Escolher perfil"
      wireRoleChooser(session);

      // Mostrar/ocultar modalRole de acordo com a existência do role
      await toggleRoleModalByProfile(session);

      // Reagir a logout em outra aba
      sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_OUT") location.href = "/index.html"; });

      // Botão "Dados do perfil" (id=btn-dados)
      const btnDados = $("btn-dados");
      btnDados?.addEventListener("click", (ev) => { ev.preventDefault(); openOrgModal(); });
      if (!btnDados) console.warn("⚠️ botão de perfil não encontrado (id=btn-dados)");

      // Modal claro de organização
      wireOrgForm();
      window.addEventListener("keyup", (e) => { if (e.key === "Escape") closeOrgModal(); });

    } catch (e) {
      console.error("[app] boot error:", e);
      alert(e?.message || String(e));
    }
  }

  // ---------- Papel no topo ----------
  async function paintUserRole(session) {
    const out = $("userRoleText");
    const setRoleText = (label) => { if (out) out.textContent = " • Perfil: " + label; };
    try {
      const uid = session?.user?.id;
      if (!uid) { setRoleText("—"); return; }
      let { data } = await sb.from("profiles").select("role").eq("id", uid).limit(1);
      let role = Array.isArray(data) && data.length ? data[0]?.role : null;
      if (!role) {
        const r2 = await sb.from("profiles").select("role").eq("user_id", uid).limit(1);
        role = Array.isArray(r2.data) && r2.data.length ? r2.data[0]?.role : null;
      }
      const isVendor = role === "vendor" || role === "supplier";
      setRoleText(role === "company" ? "Empresa" : isVendor ? "Fornecedor" : "—");
    } catch (e) { console.warn("[role] erro:", e); setRoleText("—"); }
  }

  // ==========================================================
  // Escolha de perfil (modalRole) — grava role e abre dados
  // ==========================================================
  function wireRoleChooser(session) {
    const modalRole   = $("modalRole");
    const btnCompany  = $("btnRoleCompany");
    const btnVendor   = $("btnRoleVendor");
    if (!modalRole || !btnCompany || !btnVendor) return;
    if (modalRole.dataset.bound === "1") return;
    modalRole.dataset.bound = "1";

    const saveRole = async (role) => {
      try {
        const uid = session?.user?.id;
        if (!uid) return;
        btnCompany.disabled = true;
        btnVendor.disabled  = true;

        const { error } = await sb.from("profiles").update({ role }).eq("id", uid);
        if (error) throw error;

        // Atualiza UI e segue para os dados
        await paintUserRole(session);
        hide(modalRole);
        try { await openOrgModal(); } catch {}
      } catch (e) {
        console.warn("[role] update error:", e);
        alert("Não foi possível salvar seu perfil. Tente novamente.");
      } finally {
        btnCompany.disabled = false;
        btnVendor.disabled  = false;
      }
    };

    btnCompany.addEventListener("click", () => saveRole("company"));
    btnVendor .addEventListener("click", () => saveRole("vendor"));
  }

  async function toggleRoleModalByProfile(session) {
    try {
      const uid = session.user?.id;
      if (!uid) return;
      const { data: prof } = await sb.from("profiles").select("role").eq("id", uid).maybeSingle();
      const modalRole = $("modalRole");
      if (!modalRole) return;
      if (prof?.role) hide(modalRole);
      else show(modalRole);
    } catch (e) {
      console.warn("[modalRole-check] erro:", e);
    }
  }

  // ==========================================================
  // Modal claro: Organização (PJ/CPF): lock por role + prefill
  // ==========================================================
  let profileCache = null; // cache do profile
  let lockedType = null;   // "PJ" quando role=company; null caso contrário

  async function openOrgModal() {
    const modal = $("orgModal");
    if (!modal) return;

    // Carrega profile para decidir lock/preenche
    try {
      const { data: s } = await sb.auth.getSession();
      const uid = s?.session?.user?.id;
      if (!uid) throw new Error("Sessão inválida.");
      const { data, error } = await sb
        .from("profiles")
        .select("role, company_name, display_name, document, linkedin_url")
        .eq("id", uid)
        .maybeSingle();
      if (error) throw error;
      profileCache = data || {};
    } catch (e) {
      console.warn("[org] carregar profile:", e);
      profileCache = {};
    }

    // LOCK agressivo: se for company, ou já tiver CNPJ/razão, força PJ
    const docDigits = onlyDigits(profileCache?.document);
    lockedType = (profileCache?.role === "company" || docDigits.length === 14 || !!profileCache?.company_name) ? "PJ" : null;

    // Aplica travas de UI + marca seleção inicial
    setupOrgTypeUI();

    // Renderiza os campos conforme seleção / lock
    renderOrgFields();

    // Abre modal
    show(modal);
    document.body.classList.add("modal-open");
  }

  function closeOrgModal() {
    const modal = $("orgModal");
    if (!modal) return;
    hide(modal);
    document.body.classList.remove("modal-open");
  }

  function setupOrgTypeUI() {
    const pj = document.querySelector('input[name="org_type"][value="PJ"]');
    const pf = document.querySelector('input[name="org_type"][value="PF"]');
    const pfLabel = pf ? pf.closest("label") : null;

    // seleção inicial
    let initial = "PJ";
    const docDigits = onlyDigits(profileCache?.document);
    if (!lockedType) {
      if (docDigits.length === 11) initial = "PF";
      else if (docDigits.length === 14) initial = "PJ";
      else initial = profileCache?.role === "vendor" ? "PF" : "PJ";
    } else {
      initial = "PJ";
    }

    if (pj) pj.checked = initial === "PJ";
    if (pf) pf.checked = initial === "PF";

    // ------ LOCK AGRESSIVO QUANDO EMPRESA ------
    if (lockedType === "PJ") {
      if (pf) {
        pf.checked = false;
        pf.disabled = true;
        pf.setAttribute("aria-disabled", "true");
        if (pfLabel) pfLabel.style.pointerEvents = "none";
      }
      if (pj) pj.checked = true;
      if (pfLabel) pfLabel.classList.add("is-disabled");
    } else {
      if (pf) { pf.disabled = false; pf.removeAttribute("aria-disabled"); }
      if (pfLabel) { pfLabel.style.pointerEvents = ""; pfLabel.classList.remove("is-disabled"); }
    }
  }

  let orgFormWired = false;
  function wireOrgForm() {
    if (orgFormWired) return;
    orgFormWired = true;

    const form   = $("orgForm");
    const cancel = $("btnOrgCancel");
    const xClose = $("orgClose");

    form?.addEventListener("change", (e) => {
      const t = e.target;
      if (t && t.name === "org_type") {
        // trava seleção se for Empresa
        if (lockedType === "PJ") {
          setupOrgTypeUI(); // restaura imediatamente para PJ
          return;
        }
        renderOrgFields();
        applyReadOnlyUI();
      }
    });

    cancel?.addEventListener("click", (e) => { e.preventDefault(); closeOrgModal(); });
    xClose?.addEventListener("click",  (e) => { e.preventDefault(); closeOrgModal(); });

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await submitOrgData();
    });
  }

  function currentOrgType() {
    const sel = document.querySelector('input[name="org_type"]:checked');
    return sel?.value === "PF" ? "PF" : "PJ";
  }

  // Evitar autofill “grudando” em labels
  function noiseName(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function renderOrgFields() {
    const box  = $("orgFields");
    const hint = $("orgHint");
    if (!box) return;

    const doc = String(profileCache?.document || "");
    const docDigits = onlyDigits(doc);

    if (currentOrgType() === "PJ") {
      const company_name = profileCache?.company_name || "";
      const trade_name   = profileCache?.display_name || "";
      const cnpj         = docDigits.length === 14 ? doc : "";

      box.innerHTML = `
        <label>Razão social</label>
        <input id="org_company_name" autocomplete="off" name="${noiseName("company")}" placeholder="Ex.: Acme Ltda" value="${escapeHtml(company_name)}" />
        <label>Nome fantasia (opcional)</label>
        <input id="org_trade_name" autocomplete="off" name="${noiseName("trade")}" placeholder="Ex.: Acme" value="${escapeHtml(trade_name)}" />
        <label>CNPJ</label>
        <input id="org_document" autocomplete="off" inputmode="numeric" name="${noiseName("cnpj")}" placeholder="00.000.000/0001-00" value="${escapeHtml(cnpj)}" />
      `;
      if (hint) hint.textContent = "Pessoa Jurídica: enviaremos para análise após o envio.";
    } else {
      const display_name = profileCache?.display_name || "";
      const cpf          = docDigits.length === 11 ? doc : "";
      const linkedin     = profileCache?.linkedin_url || "";

      box.innerHTML = `
        <label>Nome completo</label>
        <input id="org_display_name" autocomplete="off" name="${noiseName("name")}" placeholder="Ex.: João da Silva" value="${escapeHtml(display_name)}" />
        <label>CPF</label>
        <input id="org_document" autocomplete="off" inputmode="numeric" name="${noiseName("cpf")}" placeholder="000.000.000-00" value="${escapeHtml(cpf)}" />
        <label>LinkedIn (opcional)</label>
        <input id="org_linkedin_url" autocomplete="off" name="${noiseName("linkedin")}" placeholder="https://linkedin.com/in/..." value="${escapeHtml(linkedin)}" />
      `;
      if (hint) hint.textContent = "Fornecedor PF: aprovação automática nesta etapa.";
    }

    applyReadOnlyUI();
  }

  // Read-only conforme estado (sem depender de colunas novas)
  function applyReadOnlyUI() {
    const form = $("orgForm");
    if (!form) return;

    const docDigits = onlyDigits(profileCache?.document);
    const isCompany = profileCache?.role === "company";
    const pjSubmitted = isCompany && !!profileCache?.company_name && docDigits.length === 14;
    const pfSubmitted = profileCache?.role === "vendor" && !!profileCache?.display_name && docDigits.length === 11;

    const readOnly = pjSubmitted || pfSubmitted;

    // Botões
    const btn = $("btnOrgSubmit");
    const btnCancel = $("btnOrgCancel");
    if (btn) {
      btn.textContent = readOnly ? "Fechar" : (isCompany ? "Enviar para análise" : "Salvar");
      btn.type = readOnly ? "button" : "submit";
      btn.onclick = readOnly ? () => closeOrgModal() : null;
      btn.removeAttribute("disabled");
      btn.classList.remove("is-disabled");
    }
    if (btnCancel) { btnCancel.removeAttribute("disabled"); btnCancel.classList.remove("is-disabled"); }

    // Campos
    const inputs = form.querySelectorAll("input, select, textarea, fieldset");
    inputs.forEach((el) => {
      if (el.id === "btnOrgSubmit" || el.id === "btnOrgCancel" || el.id === "orgClose") return;
      if (readOnly) {
        el.setAttribute("disabled", "true");
        el.setAttribute("aria-disabled", "true");
      } else {
        el.removeAttribute("disabled");
        el.removeAttribute("aria-disabled");
      }
    });
  }

  async function submitOrgData() {
    // Segurança extra: se lock for PJ, força PJ mesmo que algo mude no DOM
    let type = currentOrgType();
    if (lockedType === "PJ") type = "PJ";

    const btn  = $("btnOrgSubmit");
    if (btn) { btn.setAttribute("disabled", "true"); btn.classList.add("is-disabled"); }

    try {
      const { data: s } = await sb.auth.getSession();
      const uid = s?.session?.user?.id;
      if (!uid) throw new Error("Sessão inválida.");

      // Monta patch mínimo, sem depender de colunas novas
      let patch = {};
      if (type === "PJ") {
        const company_name = $("org_company_name")?.value?.trim();
        const trade_name   = $("org_trade_name")?.value?.trim();
        const documentId   = $("org_document")?.value?.trim();
        if (!company_name || !documentId) throw new Error("Preencha Razão social e CNPJ.");
        patch = {
          role: "company",
          company_name,
          display_name: trade_name || null,
          document: documentId
        };
      } else {
        const display_name = $("org_display_name")?.value?.trim();
        const documentId   = $("org_document")?.value?.trim();
        const linkedin_url = $("org_linkedin_url")?.value?.trim();
        if (!display_name || !documentId) throw new Error("Preencha Nome e CPF.");
        patch = {
          role: "vendor",
          display_name,
          document: documentId,
          linkedin_url: linkedin_url || null
        };
      }

      // Tenta enviar com profile_review_status (se existir) — fallback se der erro
      let tryPatch = { ...patch };
      if (type === "PJ")  tryPatch.profile_review_status = "pending";
      if (type === "PF")  tryPatch.profile_review_status = "approved";

      let upd = await sb.from("profiles").update(tryPatch).eq("id", uid);
      if (upd.error && /profile_review_status/.test(upd.error.message || "")) {
        // coluna não existe: envia sem ela
        upd = await sb.from("profiles").update(patch).eq("id", uid);
      }
      if (upd.error) throw upd.error;

      alert(type === "PJ" ? "Dados enviados para análise." : "Dados salvos.");
      closeOrgModal();

      // Atualiza caches para próxima abertura
      try { await paintUserRole({ user: { id: uid } }); } catch {}
      if (typeof window.renderChecklist === "function") { try { await window.renderChecklist(); } catch {} }

    } catch (e) {
      console.error("[org] submit error:", e);
      alert(e?.message || "Erro ao salvar.");
    } finally {
      if (btn) { btn.removeAttribute("disabled"); btn.classList.remove("is-disabled"); }
    }
  }
})();
