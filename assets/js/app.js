// /assets/js/app.js — boot seguro + Organização (PJ/CPF) + Financeiro (PIX)
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

  async function hardSignOut({ redirect = true } = {}) {
    try { await sb?.auth?.signOut?.({ scope: "global" }); } catch {}
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
    } catch {}
    if (redirect) location.href = "/index.html";
  }
  window.hardSignOut = hardSignOut;

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
    } catch {
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

      // Role chooser
      wireRoleChooser(session);
      await toggleRoleModalByProfile(session);

      // Reagir a logout em outra aba
      sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_OUT") location.href = "/index.html"; });

      // Dados do perfil
      $("btn-dados")?.addEventListener("click", (ev) => { ev.preventDefault(); openOrgModal(); });

      // Financeiro (PIX) — garante amarração
      $("btn-fin")?.addEventListener("click", (ev) => { ev.preventDefault(); openFinModal(); });

      // Modais
      wireOrgForm();
      wireFinForm();

      window.addEventListener("keyup", (e) => { if (e.key === "Escape") { closeOrgModal(); closeFinModal(); } });

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
      const isVendor = role === "vendor" || role === "supplier";
      setRoleText(role === "company" ? "Empresa" : isVendor ? "Fornecedor" : "—");
    } catch { setRoleText("—"); }
  }

  // ==========================================================
  // Escolha de perfil (modalRole)
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
        btnCompany.disabled = true; btnVendor.disabled  = true;

        const { error } = await sb.from("profiles").update({ role }).eq("id", uid);
        if (error) throw error;

        await paintUserRole(session);
        hide(modalRole);
        try { await openOrgModal(); } catch {}
      } catch (e) {
        alert("Não foi possível salvar seu perfil. Tente novamente.");
      } finally {
        btnCompany.disabled = false; btnVendor.disabled  = false;
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
    } catch {}
  }

  // ==========================================================
  // Modal Organização (PJ/CPF)
  // ==========================================================
  let profileCache = null;
  let lockedType = null;

  async function openOrgModal() {
    const modal = $("orgModal");
    if (!modal) return;

    try {
      const { data: s } = await sb.auth.getSession();
      const uid = s?.session?.user?.id;
      if (!uid) throw new Error("Sessão inválida.");
      const { data, error } = await sb
        .from("profiles")
        .select("role, company_name, display_name, document, linkedin_url, billing_email, billing_address")
        .eq("id", uid)
        .maybeSingle();
      if (error) throw error;
      profileCache = data || {};
    } catch (e) { profileCache = {}; }

    const docDigits = onlyDigits(profileCache?.document);
    lockedType = (profileCache?.role === "company" || docDigits.length === 14 || !!profileCache?.company_name) ? "PJ" : null;

    setupOrgTypeUI();
    renderOrgFields();

    show(modal);
    document.body.classList.add("modal-open");
  }
  function closeOrgModal() {
    const modal = $("orgModal"); if (!modal) return;
    hide(modal); document.body.classList.remove("modal-open");
  }

  function setupOrgTypeUI() {
    const pj = document.querySelector('input[name="org_type"][value="PJ"]');
    const pf = document.querySelector('input[name="org_type"][value="PF"]');
    const pfLabel = pf ? pf.closest("label") : null;

    let initial = "PJ";
    const docDigits = onlyDigits(profileCache?.document);
    if (!lockedType) {
      if (docDigits.length === 11) initial = "PF";
      else if (docDigits.length === 14) initial = "PJ";
      else initial = profileCache?.role === "vendor" ? "PF" : "PJ";
    } else initial = "PJ";

    if (pj) pj.checked = initial === "PJ";
    if (pf) pf.checked = initial === "PF";

    if (lockedType === "PJ") {
      if (pf) { pf.checked = false; pf.disabled = true; pf.setAttribute("aria-disabled","true"); if (pfLabel) pfLabel.style.pointerEvents = "none"; }
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

    const form = $("orgForm");
    const cancel = $("btnOrgCancel");
    const xClose = $("orgClose");

    form?.addEventListener("change", (e) => {
      const t = e.target;
      if (t && t.name === "org_type") {
        if (lockedType === "PJ") { setupOrgTypeUI(); return; }
        renderOrgFields();
        applyReadOnlyUI();
      }
    });

    cancel?.addEventListener("click", (e) => { e.preventDefault(); closeOrgModal(); });
    xClose?.addEventListener("click",  (e) => { e.preventDefault(); closeOrgModal(); });

    form?.addEventListener("submit", async (e) => { e.preventDefault(); await submitOrgData(); });
  }

  function currentOrgType() {
    const sel = document.querySelector('input[name="org_type"]:checked');
    return sel?.value === "PF" ? "PF" : "PJ";
  }

  function noiseName(prefix) { return `${prefix}_${Math.random().toString(36).slice(2, 8)}`; }

  function renderOrgFields() {
    const box  = $("orgFields");
    const hint = $("orgHint");
    if (!box) return;

    const doc = String(profileCache?.document || "");
    const docDigits = onlyDigits(doc);

    const addr = profileCache?.billing_address || {};
    const rua = addr?.rua || "";
    const numero = addr?.numero || "";
    const complemento = addr?.complemento || "";
    const bairro = addr?.bairro || "";
    const cep = addr?.cep || "";
    const cidade = addr?.cidade || "";
    const uf = (addr?.uf || "").toUpperCase();

    if (currentOrgType() === "PJ") {
      const company_name = profileCache?.company_name || "";
      const trade_name   = profileCache?.display_name || "";
      const cnpj         = docDigits.length === 14 ? doc : "";
      const billing_email = profileCache?.billing_email || "";

      const ufOptions = [
        "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
        "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"
      ].map(sig => `<option value="${sig}" ${sig===uf?"selected":""}>${sig}</option>`).join("");

      box.innerHTML = `
        <label>Razão social</label>
        <input id="org_company_name" autocomplete="off" name="${noiseName("company")}" placeholder="Ex.: Acme Ltda" value="${escapeHtml(company_name)}" />

        <label>Nome fantasia (opcional)</label>
        <input id="org_trade_name" autocomplete="off" name="${noiseName("trade")}" placeholder="Ex.: Acme" value="${escapeHtml(trade_name)}" />

        <label>CNPJ (Matriz)</label>
        <input id="org_document" autocomplete="off" inputmode="numeric" name="${noiseName("cnpj")}" placeholder="00.000.000/0001-00" value="${escapeHtml(cnpj)}" />

        <div class="divider" style="height:8px"></div>
        <h4 style="margin:8px 0 4px">Endereço fiscal (Matriz)</h4>

        <label>Rua (logradouro)</label>
        <input id="org_billing_rua" autocomplete="off" placeholder="Ex.: Av. Paulista" value="${escapeHtml(rua)}" />

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label>Número</label>
            <input id="org_billing_numero" autocomplete="off" placeholder="Ex.: 123" value="${escapeHtml(numero)}" />
          </div>
          <div>
            <label>Complemento (opcional)</label>
            <input id="org_billing_complemento" autocomplete="off" placeholder="Ex.: cj 12" value="${escapeHtml(complemento)}" />
          </div>
        </div>

        <label>Bairro</label>
        <input id="org_billing_bairro" autocomplete="off" placeholder="Ex.: Bela Vista" value="${escapeHtml(bairro)}" />

        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label>CEP</label>
            <input id="org_billing_cep" autocomplete="off" inputmode="numeric" placeholder="00.000-000" value="${escapeHtml(cep)}" />
          </div>
          <div>
            <label>Cidade</label>
            <input id="org_billing_cidade" autocomplete="off" placeholder="Ex.: São Paulo" value="${escapeHtml(cidade)}" />
          </div>
        </div>

        <label>UF</label>
        <select id="org_billing_uf">
          <option value="">Selecione</option>
          ${ufOptions}
        </select>

        <label>E-mail financeiro</label>
        <input id="org_billing_email" autocomplete="off" placeholder="financeiro@empresa.com.br" value="${escapeHtml(billing_email)}" />
      `;
      if (hint) hint.textContent = "Pessoa Jurídica (Matriz): enviaremos para análise após o envio.";
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

  function applyReadOnlyUI() {
    const form = $("orgForm"); if (!form) return;
    const docDigits = onlyDigits(profileCache?.document);
    const isCompany = profileCache?.role === "company";
    const pjSubmitted = isCompany && (docDigits.length === 14 || !!profileCache?.company_name);
    const pfSubmitted = profileCache?.role === "vendor" && !!profileCache?.display_name && docDigits.length === 11;
    const readOnly = pjSubmitted || pfSubmitted;

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

    const inputs = form.querySelectorAll("input, select, textarea, fieldset");
    inputs.forEach((el) => {
      if (el.id === "btnOrgSubmit" || el.id === "btnOrgCancel" || el.id === "orgClose") return;
      if (readOnly) { el.setAttribute("disabled", "true"); el.setAttribute("aria-disabled", "true"); }
      else { el.removeAttribute("disabled"); el.removeAttribute("aria-disabled"); }
    });
  }

  async function submitOrgData() {
    let type = currentOrgType();
    if (lockedType === "PJ") type = "PJ";
    const btn  = $("btnOrgSubmit"); if (btn) { btn.setAttribute("disabled", "true"); btn.classList.add("is-disabled"); }

    try {
      const { data: s } = await sb.auth.getSession();
      const uid = s?.session?.user?.id;
      if (!uid) throw new Error("Sessão inválida.");

      let patch = {};
      if (type === "PJ") {
        const company_name = $("org_company_name")?.value?.trim();
        const trade_name   = $("org_trade_name")?.value?.trim();
        const documentId   = $("org_document")?.value?.trim();

        // Novos campos (fiscais)
        const billing_rua   = $("org_billing_rua")?.value?.trim();
        const billing_num   = $("org_billing_numero")?.value?.trim();
        const billing_comp  = $("org_billing_complemento")?.value?.trim() || null;
        const billing_bairro= $("org_billing_bairro")?.value?.trim();
        const billing_cep   = ($("org_billing_cep")?.value || "").replace(/\D+/g,"");
        const billing_cidade= $("org_billing_cidade")?.value?.trim();
        const billing_uf    = ($("org_billing_uf")?.value || "").toUpperCase();
        const billing_email = $("org_billing_email")?.value?.trim();

        if (!company_name || !documentId) throw new Error("Preencha Razão social e CNPJ.");
        // Validações fiscais mínimas
        if (!billing_rua || !billing_num || !billing_bairro || !billing_cep || !billing_cidade || !billing_uf) {
          throw new Error("Preencha todos os campos do endereço fiscal.");
        }
        if (billing_cep.length !== 8) throw new Error("CEP inválido. Use 8 dígitos.");
        if (!/^(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)$/.test(billing_uf)) {
          throw new Error("UF inválida.");
        }
        if (!billing_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing_email)) {
          throw new Error("Informe um e-mail financeiro válido.");
        }

        const billing_address = {
          rua: billing_rua,
          numero: billing_num,
          complemento: billing_comp,
          bairro: billing_bairro,
          cep: billing_cep,
          cidade: billing_cidade,
          uf: billing_uf
        };

        // Monta patch da Empresa (Matriz)
        patch = {
          role: "company",
          company_name,
          display_name: trade_name || null,
          document: documentId,
          profile_review_status: "pending",
          billing_email: billing_email,
          billing_address: billing_address
        };
      } else {
        const display_name = $("org_display_name")?.value?.trim();
        const documentId   = $("org_document")?.value?.trim();
        const linkedin_url = $("org_linkedin_url")?.value?.trim();
        if (!display_name || !documentId) throw new Error("Preencha Nome e CPF.");
        patch = { role: "vendor", display_name, document: documentId, linkedin_url: linkedin_url || null, profile_review_status: "approved" };
      }

      const upd = await sb.from("profiles").update(patch).eq("id", uid);
      if (upd.error) { alert("Supabase recusou a atualização do profile (ver RLS/Policies)."); return; }

      alert(type === "PJ" ? "Dados enviados para análise." : "Dados salvos.");
      closeOrgModal();
      try { await window.renderChecklist?.(); } catch {}

    } catch (e) {
      alert(e?.message || "Erro ao salvar.");
    } finally {
      if (btn) { btn.removeAttribute("disabled"); btn.classList.remove("is-disabled"); }
    }
  }

  // ==========================================================
  // Modal Financeiro (PIX)
  // ==========================================================
  async function openFinModal() {
    const modal = $("finModal");
    if (!modal) return;

    try {
      const { data: s } = await sb.auth.getSession();
      const uid = s?.session?.user?.id;
      if (!uid) throw new Error("Sessão inválida.");
      const { data, error } = await sb.from("profiles").select("pix_key, role").eq("id", uid).maybeSingle();
      if (!error && data) {
        // Empresa: financeiro concluído automático (não exige ação)
        if (data.role === "company") {
          alert("Para Empresas, o financeiro é concluído automaticamente. Não há configuração necessária nesta etapa.");
          return;
        }
        $("fin_pix_key").value = data.pix_key || "";
      }
    } catch {}
    show(modal);
    document.body.classList.add("modal-open");
  }
  function closeFinModal() {
    const modal = $("finModal"); if (!modal) return;
    hide(modal); document.body.classList.remove("modal-open");
  }

  let finFormWired = false;
  function wireFinForm() {
    if (finFormWired) return;
    finFormWired = true;

    const form = $("finForm");
    const btnCancel = $("btnFinCancel");
    const xClose = $("finClose");

    btnCancel?.addEventListener("click", (e)=>{ e.preventDefault(); closeFinModal(); });
    xClose?.addEventListener("click", (e)=>{ e.preventDefault(); closeFinModal(); });

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("btnFinSave");
      try {
        btn.disabled = true; btn.classList.add("is-disabled");
        const key = $("fin_pix_key")?.value?.trim() || null;

        const { data: s } = await sb.auth.getSession();
        const uid = s?.session?.user?.id;
        if (!uid) throw new Error("Sessão inválida.");
        const upd = await sb.from("profiles").update({ pix_key: key }).eq("id", uid);
        if (upd.error) throw upd.error;

        alert("Chave PIX salva.");
        closeFinModal();
        try { await window.renderChecklist?.(); } catch {}
      } catch (err) {
        alert("Não foi possível salvar sua chave PIX.");
      } finally {
        const btn2 = $("btnFinSave"); btn2.disabled = false; btn2.classList.remove("is-disabled");
      }
    });
  }

  // Expor para debug local se precisar
  window.openFinModal = openFinModal;
  window.closeFinModal = closeFinModal;
})();
