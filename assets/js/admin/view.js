/* Bidly • Admin Lite Pro • view.js (vAL13 — lista + abre detalhe) */
window.Bidly = window.Bidly || {};
Bidly.admin = Bidly.admin || {};
Bidly.admin.view = (function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = { limit: 20, offset: 0, status: "", type: "", q: "", rows: [] };

  const STATUS_ENUM = [
    ["", "Todos os status"],
    ["pending", "Pendente"],
    ["under_review", "Em análise"],
    ["approved", "Aprovado"],
    ["rejected", "Reprovado"],
  ];
  const TYPE_ENUM = [
    ["", "Todos os tipos"],
    ["company_contract", "Contrato social (PDF)"],
  ];

  const fmtEmpty = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));
  function fmtDate(val) {
    if (!val) return "—";
    const d = new Date(val);
    if (isNaN(d)) return String(val);
    return d.toLocaleString("pt-BR", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
  }
  function pill(status) {
    const s = String(status || "pending").toLowerCase();
    const map = {
      approved:     ["pill pill--success", "Aprovado"],
      rejected:     ["pill pill--danger",  "Reprovado"],
      under_review: ["pill pill--info",    "Em análise"],
      pending:      ["pill pill--muted",   "Pendente"],
    };
    const use = map[s] || map.pending;
    return '<span class="' + use[0] + '">' + use[1] + '</span>';
  }
  function maskCNPJ(raw) {
    const only = String(raw || "").replace(/\D+/g, "");
    if (only.length !== 14) return fmtEmpty(raw);
    return only.slice(0,2) + "." + only.slice(2,5) + "." + only.slice(5,8) + "/" + only.slice(8,12) + "-" + only.slice(12);
  }

  // ===== Markup raiz (lista + painel detalhe) =====
  function mount(root) {
    root.innerHTML =
      '<section id="org-panel" style="margin:24px 0 56px">' +

        '<div class="al-card" style="margin-bottom:12px;">' +
          '<h3 class="h4 u-mt-0 u-mb-0">Admin • Lite Pro</h3>' +
        '</div>' +

        '<div class="al-card al-filters" style="margin-bottom:12px;">' +
          '<div class="u-form__grid">' +

            '<div class="u-col-3">' +
              '<label class="u-label" for="fltStatus">Status</label>' +
              '<select id="fltStatus" class="u-select">' +
                STATUS_ENUM.map(function(p){ return '<option value="'+p[0]+'">'+p[1]+'</option>'; }).join("") +
              '</select>' +
            '</div>' +

            '<div class="u-col-3">' +
              '<label class="u-label" for="fltType">Tipo</label>' +
              '<select id="fltType" class="u-select">' +
                TYPE_ENUM.map(function(p){ return '<option value="'+p[0]+'">'+p[1]+'</option>'; }).join("") +
              '</select>' +
            '</div>' +

            '<div class="u-col-4">' +
              '<label class="u-label" for="q">Busca</label>' +
              '<input id="q" class="u-input" placeholder="Buscar por e-mail, CNPJ/CPF, Razão..." />' +
            '</div>' +

            '<div class="u-col-2 u-actions u-mt-0">' +
              '<span class="u-spacer"></span>' +
              '<button id="btnLoad" class="u-btn u-btn--primary">Atualizar</button>' +
            '</div>' +

          '</div>' +
        '</div>' +

        '<div class="al-card">' +
          '<div class="al-grid-wrap">' +
            '<table id="grid">' +
              '<thead>' +
                '<tr>' +
                  '<th>Status</th>' +
                  '<th>Razão / Fantasia</th>' +
                  '<th>Email</th>' +
                  '<th>CNPJ</th>' +
                  '<th>Submissão</th>' +
                  '<th>Review</th>' +
                  '<th>Revisor</th>' +
                  '<th>PDF</th>' +
                  '<th class="right th-actions"></th>' +
                '</tr>' +
              '</thead>' +
              '<tbody id="admTbody">' + tableSkeleton() + '</tbody>' +
            '</table>' +
          '</div>' +

          '<div class="al-pager">' +
            '<button id="btnPrev" class="u-btn u-btn--ghost">◄ Anteriores</button>' +
            '<button id="btnNext" class="u-btn u-btn--ghost">Próximos ►</button>' +
          '</div>' +
        '</div>' +

        // Painel de detalhe
        '<div id="detailPanel" class="al-card" style="display:none; margin-top:14px;">' +
          '<div id="detailBody">—</div>' +
        '</div>' +

      '</section>';
  }

  function tableSkeleton() {
    return '<tr><td colspan="9"><div class="al-state">Carregando…</div></td></tr>';
  }

  // ===== Data =====
  async function fetchRows(sb) {
    const opts = {
      limit:  state.limit,
      offset: state.offset,
      status: state.status || null,
      type:   state.type   || null,
      q:      state.q      || null,
    };
    const { data, error } = await Bidly.admin.api.listDocs(sb, opts);
    if (!error) state.rows = Array.isArray(data) ? data : [];
    return { data, error };
  }

  // ===== Render table body =====
  function renderTable(rows, caps) {
    if (!rows || rows.length === 0) {
      return '<tr><td colspan="9"><div class="al-state">Nenhum documento encontrado.</div></td></tr>';
    }
    const canReview  = !!(caps && caps.review);
    const canApprove = !!(caps && caps.approve);

    return rows.map(function(row){
      const status   = String(row.status || row.doc_status || "pending").toLowerCase();
      const org      = row.org_name || row.organization || row.company_name || "—";
      const email    = row.email || row.user_email || "—";
      const rawCnpj  = row.org_cnpj || row.cnpj || row.company_cnpj || "";
      const cnpj     = rawCnpj ? maskCNPJ(rawCnpj) : "—";
      const subAt    = row.submitted_at || row.created_at || row.sent_at || null;
      const revAt    = row.reviewed_at  || row.updated_at || null;
      const reviewer = row.reviewer || row.reviewer_name || "—";
      const pdfPath  = row.pdf_path || row.storage_path || null;
      const userId   = row.user_id || row.uid || row.id || null;
      const docType  = row.type || row.doc_type || "company_contract";

      const pdfCell = pdfPath
        ? '<a href="#" class="js-pdf" data-path="' + encodeURIComponent(pdfPath) + '" rel="noopener">abrir</a>'
        : '—';

      const mayDecide = status === "under_review";
      const disabledTip =
        status === "pending"  ? ' title="Aguardando o usuário clicar “Enviar agora”"' :
        status === "approved" ? ' title="Documento já aprovado"' :
        status === "rejected" ? ' title="Documento já reprovado"' : '';

      const rejectBtn = (canReview || canApprove)
        ? '<button class="u-btn u-btn--ghost js-reject" ' + (mayDecide ? '' : ('disabled'+disabledTip)) +
          ' data-uid="' + (userId || "") + '" data-type="' + docType + '">Reprovar</button>'
        : '—';

      const approveBtn = (canReview || canApprove)
        ? '<button class="u-btn u-btn--primary js-approve" ' + (mayDecide ? '' : ('disabled'+disabledTip)) +
          ' data-uid="' + (userId || "") + '" data-type="' + docType + '">Aprovar</button>'
        : '';

      return (
        '<tr class="js-row" data-uid="' + (userId || "") + '" data-org="' + (org || "") + '" data-email="' + (email || "") + '">' +
          '<td>' + pill(status) + '</td>' +
          '<td><strong>' + fmtEmpty(org) + '</strong></td>' +
          '<td>' + fmtEmpty(email) + '</td>' +
          '<td>' + fmtEmpty(cnpj) + '</td>' +
          '<td>' + fmtDate(subAt) + '</td>' +
          '<td>' + fmtDate(revAt) + '</td>' +
          '<td>' + fmtEmpty(reviewer) + '</td>' +
          '<td>' + pdfCell + '</td>' +
          '<td class="right">' +
            '<div class="al-action-buttons">' + rejectBtn + approveBtn + '</div>' +
          '</td>' +
        '</tr>'
      );
    }).join("");
  }

  // ===== Pager UI =====
  function updatePager() {
    const btnPrev = $("#btnPrev");
    const btnNext = $("#btnNext");
    if (btnPrev) btnPrev.disabled = state.offset <= 0;
    const rowsCount = Array.isArray(state.rows) ? state.rows.length : 0;
    if (btnNext) btnNext.disabled = rowsCount < state.limit;
  }

  // ===== Filtros / Pager wiring =====
  function wireFilters(sb) {
    const elStatus = $("#fltStatus");
    const elType   = $("#fltType");
    const elQ      = $("#q");
    const btnLoad  = $("#btnLoad");
    const btnPrev  = $("#btnPrev");
    const btnNext  = $("#btnNext");

    async function reload() {
      // *** FIX: ao atualizar, fechar painel de detalhe (com segurança) ***
      if (Bidly && Bidly.admin && Bidly.admin.detail && typeof Bidly.admin.detail.close === "function") {
        Bidly.admin.detail.close();
      }

      const tbody = $("#admTbody");
      if (tbody) tbody.innerHTML = tableSkeleton();
      const res = await fetchRows(sb);
      if (tbody) {
        tbody.innerHTML = res.error
          ? '<tr><td colspan="9"><div class="al-state error">Não foi possível carregar a lista.</div></td></tr>'
          : renderTable(res.data, Bidly && Bidly.admin ? (Bidly.admin.caps || {}) : {});
      }
      wireTableActions(sb);
      updatePager();
    }

    if (elStatus) elStatus.addEventListener("change", function(){ state.status = elStatus.value; state.offset = 0; reload(); });
    if (elType)   elType.addEventListener("change",   function(){ state.type   = elType.value;   state.offset = 0; reload(); });
    if (elQ)      elQ.addEventListener("input",       function(){ state.q      = elQ.value.trim(); });
    if (btnLoad)  btnLoad.addEventListener("click",   reload);

    if (btnPrev)  btnPrev.addEventListener("click", function(){ pagePrev(sb); });
    if (btnNext)  btnNext.addEventListener("click", function(){ pageNext(sb); });
  }

  // ===== Ações da tabela =====
  function wireTableActions(sb) {
    // PDF
    $$("#grid .js-pdf").forEach(function(a){
      a.onclick = async function(ev){
        ev.preventDefault();
        const path = decodeURIComponent(a.dataset.path || "");
        const r = await Bidly.admin.api.signedUrl(sb, path, 120);
        if (r && r.data) window.open(r.data, "_blank", "noopener");
      };
    });

    // Aprovar / Reprovar
    $$("#grid .js-approve").forEach(function(btn){
      btn.onclick = async function(){
        if (btn.disabled) return;
        const uid = btn.dataset.uid, type = btn.dataset.type;
        if (!uid || !type) return;
        btn.disabled = true;
        try { await Bidly.admin.api.approveDoc(sb, uid, type); await refresh(sb); }
        finally { btn.disabled = false; }
      };
    });
    $$("#grid .js-reject").forEach(function(btn){
      btn.onclick = async function(){
        if (btn.disabled) return;
        const uid = btn.dataset.uid, type = btn.dataset.type;
        if (!uid || !type) return;
        btn.disabled = true;
        try { await Bidly.admin.api.rejectDoc(sb, uid, type, null); await refresh(sb); }
        finally { btn.disabled = false; }
      };
    });

    // Abrir detalhe ao clicar na linha (exceto quando clicar nos botões/links)
    $$("#grid .js-row").forEach(function(tr){
      tr.addEventListener("click", function(ev){
        const tag = (ev.target && ev.target.tagName || "").toLowerCase();
        if (tag === "button" || tag === "a") return; // não roubar clique dos botões
        const uid   = tr.getAttribute("data-uid");
        const org   = tr.getAttribute("data-org");
        const email = tr.getAttribute("data-email");
        if (uid && Bidly && Bidly.admin && Bidly.admin.detail && typeof Bidly.admin.detail.open === "function") {
          Bidly.admin.detail.open(sb, { uid: uid, org_name: org, email: email });
        }
      });
    });

    updatePager();
  }

  // ===== Paginação =====
  async function refresh(sb) {
    const tbody = $("#admTbody");
    if (tbody) tbody.innerHTML = tableSkeleton();
    const res = await fetchRows(sb);
    if (tbody) {
      tbody.innerHTML = res.error
        ? '<tr><td colspan="9"><div class="al-state error">Não foi possível carregar a lista.</div></td></tr>'
        : renderTable(res.data, Bidly && Bidly.admin ? (Bidly.admin.caps || {}) : {});
    }
    wireTableActions(sb);
    updatePager();
  }
  async function pagePrev(sb) { state.offset = Math.max(0, state.offset - state.limit); await refresh(sb); }
  async function pageNext(sb) { state.offset = state.offset + state.limit;             await refresh(sb); }

  // ===== API pública =====
  return {
    mount, tableSkeleton, renderTable,
    wireTableActions, wireFilters,
    pagePrev, pageNext, fetchRows,
  };
})();
