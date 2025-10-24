/* Bidly • Admin Lite Pro • view.detail.js (vAL4 – recarrega após SALVAR)
   Formulário de detalhe modular (leitura/edição) + histórico de "Suporte Bidly".
   - Mantém edição aberta após SALVAR
   - Recarrega dados e histórico imediatamente (sem F5)
   - UF como dropdown somente em modo de edição
   - "Usuário:" em negrito
*/
window.Bidly = window.Bidly || {};
Bidly.admin = Bidly.admin || {};
Bidly.admin.detail = (function () {
  const $  = (s, r = document) => (r || document).querySelector(s);

  // ---- instala CSS específico uma única vez (read-only, grid etc.)
  (function installOnce(){
    if (document.getElementById("al-detail-css")) return;
    const css = `
      .al-detail{padding:16px}
      .al-detail__hdr{display:flex;align-items:flex-start;gap:12px;justify-content:space-between;margin-bottom:8px}
      .al-detail__who{font-size:14px;line-height:1.35}
      .al-detail__actions{flex-shrink:0}

      /* GRID robusto: não deixa estourar na borda */
      .u-form__grid{
        display:grid;
        grid-template-columns:repeat(12, minmax(0,1fr));
        gap:12px 16px;
      }
      .u-col-12{grid-column:span 12; min-width:0}
      .u-col-6{grid-column:span 6;  min-width:0}
      @media (max-width: 980px){ .u-col-6{grid-column:span 12} }

      /* Inputs sempre dentro do card */
      .al-detail .u-input,
      .al-detail .u-select,
      .al-detail input,
      .al-detail textarea{
        width:100%;
        box-sizing:border-box;
      }
      .al-detail textarea{resize:vertical; min-height:80px}

      /* Estado de leitura */
      .u-input--ro{background:#f8fafc !important; color:#334155 !important}

      /* Notas */
      .al-notes .note-item{border:1px solid #e5e7eb;border-radius:10px;padding:10px;margin:8px 0;background:#f8fafc}
      .al-notes .note-meta{font-size:12px;margin-bottom:6px;color:#64748b}
      .u-sep{height:1px;background:#e5e7eb;margin:14px 0}
    `;
    const style = document.createElement("style");
    style.id = "al-detail-css";
    style.textContent = css;
    document.head.appendChild(style);
  })();

  // ---- estado do formulário
  const state = {
    uid: null, org_name: null, email: null,
    editing: false,
    form: null, original: null,
    notes: [],
  };

  // ---- normalização de dados vindos do backend
  function normalizeOrgForm(d = {}) {
    return {
      cnpj:           d.cnpj || d.org_cnpj || "",
      razao_social:   d.razao_social || d.legal_name || d.company_name || d.corporate_name || "",
      nome_fantasia:  d.nome_fantasia || d.trade_name || d.fantasy_name || "",
      logradouro:     d.logradouro || d.address || d.street || "",
      numero:         d.numero || d.number || "",
      complemento:    d.complemento || d.address2 || d.addr2 || "",
      bairro:         d.bairro || d.district || "",
      cidade:         d.cidade || d.city || "",
      uf:             d.uf || d.state || d.state_uf || "",
      cep:            d.cep || d.zipcode || d.postal_code || "",
    };
  }

  const esc = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  // ---- campos
  function input(id, label, value, ro) {
    return `
      <div class="u-col-6">
        <label class="u-label" for="${id}">${label}</label>
        <input id="${id}" class="u-input${ro ? " u-input--ro":""}" ${ro?"readonly":""} value="${esc(value)}" />
      </div>
    `;
  }

  // UF: select no modo edição; readonly como input em leitura
  const UF = ["","AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
  function ufField(value, ro){
    if (ro) {
      return input("org_uf", "Estado (UF)", value || "", true);
    }
    const opts = UF.map(u => `<option value="${u}">${u || "Selecione"}</option>`).join("");
    return `
      <div class="u-col-6">
        <label class="u-label" for="org_uf">Estado (UF)</label>
        <select id="org_uf" class="u-select">${opts}</select>
      </div>
    `;
  }
  function setUF(container, value){
    const sel = $("#org_uf", container);
    if (sel) sel.value = value || "";
  }

  function renderNotes(list) {
    if (!Array.isArray(list) || !list.length) {
      return `<div class="u-muted">Sem registros de “Suporte Bidly”.</div>`;
    }
    return list.map(n => {
      const tag =
        n.visibility === "app" ? "[App]" :
        n.visibility === "internal" ? "[Interno]" : "";
      const who  = n.reviewer_name ? ` — ${esc(n.reviewer_name)}` : "";
      const when = n.created_at ? new Date(n.created_at).toLocaleString("pt-BR",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—";
      const msg  = esc(n.message || "").replace(/\n/g,"<br/>");
      return `<div class="note-item"><div class="note-meta">${tag} ${when}${who}</div><div class="note-msg">${msg}</div></div>`;
    }).join("");
  }

  function collectPatch(container) {
    const g = (id) => $(`#${id}`, container)?.value?.trim() || "";

    // 🔒 sanitização cirúrgica: evita que a RPC rejeite o patch por CNPJ/CEP mascarados
    const onlyDigits = (window.Bidly && Bidly.mask && Bidly.mask.onlyDigits) ? Bidly.mask.onlyDigits : (v)=>String(v||"").replace(/\D+/g,"");

    return {
      cnpj:          onlyDigits(g("org_cnpj")), // <- só dígitos
      razao_social:  g("org_razao"),
      nome_fantasia: g("org_fantasia"),
      logradouro:    g("org_logradouro"),
      numero:        g("org_numero"),       // pode ser vazio (rua sem número)
      complemento:   g("org_complemento"),
      bairro:        g("org_bairro"),
      cidade:        g("org_cidade"),
      uf:            g("org_uf"),
      cep:           onlyDigits(g("org_cep")), // <- só dígitos
    };
  }

  function render(container) {
    const ro = !state.editing;
    const f  = state.form || {};

    const headerBtns = ro
      ? `<button id="btnEdit" class="u-btn u-btn--ghost">Editar</button>`
      : `<div class="u-actions" style="display:flex;gap:8px">
           <button id="btnClose"  class="u-btn u-btn--ghost">Fechar</button>
           <button id="btnCancel" class="u-btn u-btn--ghost">Cancelar</button>
           <button id="btnSave"   class="u-btn u-btn--primary">Salvar</button>
         </div>`;

    container.innerHTML = `
      <div class="al-detail">
        <div class="al-detail__hdr">
          <div class="al-detail__who">
            <strong>Organização:</strong> ${esc(state.org_name || "—")}<br/>
            <strong>Usuário:</strong> <span class="u-muted">${esc(state.email || "—")}</span>
          </div>
          <div class="al-detail__actions">${headerBtns}</div>
        </div>

        <h4 class="u-mt-0">Dados da organização</h4>
        <div class="u-form__grid">
          ${input("org_cnpj", "CNPJ", f.cnpj, ro)}
          ${input("org_razao", "Razão social", f.razao_social, ro)}
          ${input("org_fantasia", "Nome fantasia", f.nome_fantasia, ro)}
          ${input("org_logradouro", "Logradouro", f.logradouro, ro)}
          ${input("org_numero", "Número", f.numero, ro)}
          ${input("org_complemento", "Complemento", f.complemento, ro)}
          ${input("org_bairro", "Bairro", f.bairro, ro)}
          ${input("org_cidade", "Cidade", f.cidade, ro)}
          ${ufField(f.uf, ro)}
          ${input("org_cep", "CEP", f.cep, ro)}
        </div>

        <div class="u-sep"></div>

        <div class="u-form__grid">
          <div class="u-col-12">
            <label class="u-label" for="noteInternal">Observação de auditoria (interno)</label>
            <textarea id="noteInternal" class="u-input${ro?" u-input--ro":""}" ${ro?"readonly":""}
              placeholder="Ex.: Corrigir CEP e UF conforme contrato."></textarea>
          </div>
        </div>

        <div class="u-form__grid u-mt-2">
          <div class="u-col-12">
            <label class="u-label" for="msgApp">Mensagem (app)</label>
            <textarea id="msgApp" class="u-input${ro?" u-input--ro":""}" ${ro?"readonly":""}
              placeholder="Escreva uma mensagem para o usuário (visível no app quando 'Pendente'/'Reprovado')."></textarea>
          </div>
        </div>

        <div class="u-sep"></div>

        <h4 class="u-mt-0">Suporte Bidly: histórico</h4>
        <div id="notesBox" class="al-notes">${renderNotes(state.notes)}</div>
      </div>
    `;

    // se for edição, aplicar o valor do UF no select
    if (!ro) setUF(container, f.uf || "");

    // ======= BIND DE MÁSCARAS (sem alterar o restante) =======
    try {
      const cnpjEl = $("#org_cnpj", container);
      if (cnpjEl) {
        cnpjEl.setAttribute("data-mask", "cnpj");
        if (window.Bidly?.mask?.bind) window.Bidly.mask.bind(cnpjEl, "cnpj");
      }
      const cepEl = $("#org_cep", container);
      if (cepEl) {
        cepEl.setAttribute("data-mask", "cep");
        if (window.Bidly?.mask?.bind) window.Bidly.mask.bind(cepEl, "cep");
      }
    } catch {}
    // =========================================================

    // Wire
    $("#btnEdit",   container)?.addEventListener("click", () => { state.editing = true;  render(container); });
    $("#btnClose",  container)?.addEventListener("click", close);
    $("#btnCancel", container)?.addEventListener("click", () => {
      state.form = JSON.parse(JSON.stringify(state.original || {}));
      state.editing = false;
      render(container);
    });

    // SALVAR: atualiza servidor e RECARREGA org + notas, mantendo em edição
    $("#btnSave",   container)?.addEventListener("click", async () => {
      const btn = $("#btnSave", container);
      btn.disabled = true;
      try {
        const patch        = collectPatch(container);
        const noteInternal = $("#noteInternal", container)?.value?.trim() || "";
        const msgApp       = $("#msgApp", container)?.value?.trim() || "";
        const sb = await window.connectSupabase();

        // 1) Atualiza dados da organização
        await Bidly.admin.api.orgUpdate(sb, state.uid, patch);

        // 2) Escreve notas se houver
        if (noteInternal) await Bidly.admin.api.addInternalNote(sb, state.uid, noteInternal);
        if (msgApp)       await Bidly.admin.api.addAppMessage(sb, state.uid, msgApp);

        // 3) Recarrega **dados e histórico** do servidor e mantém em edição
        const [{ data: org }, { data: notes }] = await Promise.all([
          Bidly.admin.api.orgDetail(sb, state.uid),
          Bidly.admin.api.notesList(sb, state.uid),
        ]);

        state.form     = normalizeOrgForm(org || {});
        state.original = JSON.parse(JSON.stringify(state.form));
        state.notes    = Array.isArray(notes) ? notes : [];

        // limpa textareas após persistir
        const ni = $("#noteInternal", container); if (ni) ni.value = "";
        const ma = $("#msgApp", container);       if (ma) ma.value = "";

        state.editing = true;     // continua em modo edição
        render(container);        // re-render com histórico atualizado
      } catch (e) {
        console.error("[detail.save]", e);
        alert("Falha ao salvar. Tente novamente.");
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---- abrir/recarregar painel
  async function open(sb, { uid, org_name, email }) {
    const panel = document.getElementById("detailPanel");
    const body  = document.getElementById("detailBody");
    if (!panel || !body) return;

    panel.style.display = "";
    body.innerHTML = `<div class="al-state">Carregando formulário…</div>`;

    state.uid      = uid;
    state.org_name = org_name || null;
    state.email    = email || null;

    const [{ data: org }, { data: notes }] = await Promise.all([
      Bidly.admin.api.orgDetail(sb, uid),
      Bidly.admin.api.notesList(sb, uid),
    ]);

    state.form     = normalizeOrgForm(org || {});
    state.original = JSON.parse(JSON.stringify(state.form));
    state.notes    = Array.isArray(notes) ? notes : [];

    // Sempre inicia em leitura
    state.editing  = false;

    render(body);
  }

  function close() {
    const panel = document.getElementById("detailPanel");
    const body  = document.getElementById("detailBody");
    if (panel && body) {
      body.innerHTML = "—";
      panel.style.display = "none";
    }
    // volta para leitura para a próxima abertura
    state.editing = false;
  }

  // API pública
  return { open, close };
})();
