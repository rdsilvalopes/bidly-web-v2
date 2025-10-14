/**
 * activation.js — Fluxo de ativação (tela cheia)
 * Ordem: Termos -> Organização (Empresa/PJ) -> Documentos (Contrato social) -> fim
 */

(async function () {
  const TAG = "[activation]";

  // ===== Helpers =====
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const show = (el) => el?.classList?.remove("hide");
  const hide = (el) => el?.classList?.add("hide");
  const pick = (...selectors) => { for (const sel of selectors) { const el = $(sel); if (el) return el; } return null; };
  const onlyDigits = (s) => (s || "").replace(/\D/g, "");
  const fmtBytes = (n=0) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
    return `${(n/1024/1024).toFixed(2)} MB`;
  };
  const fmtDateTime = (iso) => {
    try { return new Date(iso).toLocaleString(); } catch { return "—"; }
  };

  // ===== Constantes =====
  const TERMS_VER = 1;
  const TERMS_URL = `/legal/terms/pt-BR/${TERMS_VER}/terms.html`;
  const ORG_CANCEL_REDIRECT = "/";
  const DOCS_BUCKET = "org-docs";       // Storage privado
  const DOCS_MAX_MB = 10;               // limite de 10 MB
  const DOCS_ACCEPT = "application/pdf";

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

  // ===== Acesso/Mutação de perfil =====
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
        "docs_submitted,docs_status,docs_file_url,docs_rejection_reason,docs_submitted_at,docs_reviewed_at"
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

  // IDs NOVOS e ANTIGOS
  const inCnpj     = pick("#org_document",   "#org_cnpj");
  const inCep      = pick("#org_zip",        "#org_cep");
  const inUf       = pick("#org_state",      "#org_uf");
  const inTrade    = pick("#org_trade_name", "#org_trade");
  const inDistrict = pick("#org_district"); // só novo

  const inCity     = $("#org_city");
  const inAddr     = $("#org_address");
  const inNumber   = $("#org_number");
  const inCompl    = $("#org_complement");
  const inName     = $("#org_name");

  // Documentos
  const docsSheet = $("#docsFull");

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
      const box = document.getElementById("orgErrors");
      if (!box) return;
      if (!items || !items.length) {
        box.classList.add("hide");
        box.innerHTML = "";
        return;
      }
      box.innerHTML = `<strong>Preencha os campos obrigatórios:</strong>
        <ul>${items.map((t) => `<li>${t}</li>`).join("")}</ul>`;
      box.classList.remove("hide");
      try { box.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch {}
    };

    // Máscara CNPJ (só dígitos, 14)
    inCnpj?.addEventListener("input", () => {
      const d = (inCnpj.value || "").replace(/\D/g, "").slice(0, 14);
      let v = d;
      if (v.length > 2)  v = v.replace(/^(\d{2})(\d)/, "$1.$2");
      if (v.length > 6)  v = v.replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2");
      if (v.length > 10) v = v.replace(/^(\d{2}\.\d{3}\/\d{3})(\d)/, "$1$2"); // transição
      if (v.length > 10) v = v.replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2");
      if (v.length > 15) v = v.replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, "$1-$2");
      inCnpj.value = v;
    });

    orgForm.onsubmit = async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation?.();

      // limpa
      showErrors([]);

      // Coleta
      const cnpj     = (inCnpj?.value || "").trim();
      const razao    = (inName?.value || "").trim();
      const trade    = (inTrade?.value || "").trim();
      const addr     = (inAddr?.value || "").trim();
      const number   = (inNumber?.value || "").trim();
      const uf       = (inUf?.value || "").trim();
      const city     = (inCity?.value || "").trim();
      const district = (inDistrict?.value || "").trim();
      const cep      = (inCep?.value || "").trim();

      // Validação dura de formato (exatamente 14 dígitos; barra letras)
      const cnpjRaw = (cnpj || "").replace(/[.\-\/\s]/g, "");
      if (!/^\d{14}$/.test(cnpjRaw)) {
        showErrors(["CNPJ inválido (use 14 dígitos, sem letras)."]);
        return;
      }

      // Normaliza
      const cnpjDigits = onlyDigits(cnpj);
      const cepDigits  = onlyDigits(cep);

      // Obrigatórios
      const missing = [];
      if (!cnpj)     missing.push("CNPJ");
      if (!razao)    missing.push("Razão Social");
      if (!trade)    missing.push("Nome Fantasia");
      if (!addr)     missing.push("Logradouro");
      if (!number)   missing.push("Número");
      if (!uf)       missing.push("Estado (UF)");
      if (!city)     missing.push("Cidade");
      if (!cep)      missing.push("CEP");
      if (inDistrict && !district) missing.push("Bairro");
      if (missing.length) { showErrors(missing); return; }

      // Patch
      const patch = {
        role: "company",
        org_type: "PJ",
        org_document: cnpjDigits || null,
        org_zip:      cepDigits  || null,
        org_city:     city || null,
        org_state:    (uf || "").toUpperCase() || null,
        org_address:  addr || null,
        org_number:   number || null,
        org_complement: (inCompl?.value || "").trim() || null,
        org_name:       razao || null,
        org_trade_name: trade || null,
        org_submitted:  true,
        docs_status: profile.docs_status || "pending"
      };
      if (inDistrict) patch.org_district = district || null;

      try {
        await patchProfile(patch);
        profile = await getProfile();
        showErrors([]);
        hide(orgSheet);
        await nextStep();
      } catch (err) {
        const msg = String(err?.message || "");
        const isDup =
          err?.code === "23505" ||
          /uniq_profiles_cnpj_digits_pj/i.test(msg) ||
          /duplicate key value/i.test(msg);

        if (isDup) {
          showErrors(["CNPJ já cadastrado. Se você precisa de acesso para essa empresa, entre em contato com o suporte."]);
          return;
        }

        const isCheckLen = err?.code === "23514" || /chk_org_document_digits_len/i.test(msg);
        if (isCheckLen) {
          showErrors(["CNPJ inválido (deve ter 14 dígitos)."]);
          return;
        }

        console.error("[org] patch error:", err);
        showErrors([msg || "Não foi possível salvar os dados agora."]);
      }
    };
  }

  // ===== Mensagens do Suporte (visíveis no app) =====
  async function loadAppNotes() {
    try {
      // Ajuste o nome/colunas se seu schema for diferente
      const { data, error } = await sb
        .from("notes")
        .select("id, created_at, reviewer_name, message, code, visibility")
        .eq("user_id", user.id)
        .eq("visibility", "app")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("[notes] erro ao carregar:", e);
      return [];
    }
  }

  function renderNotesBox(list) {
    const host = $("#appNotesBox");
    if (!host) return;
    if (!list.length) { host.innerHTML = ""; return; }

    const html = `
      <div style="margin-top:14px;background:#f1f5f9;border-radius:10px;padding:12px;">
        <div class="muted" style="margin-bottom:6px;"><strong>Suporte Bidly</strong>: histórico</div>
        ${list.map(n => `
          <div style="padding:8px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;margin:6px 0">
            <div class="mini muted">
              <strong>[App] ${fmtDateTime(n.created_at)}${n.reviewer_name ? ` • ${n.reviewer_name}` : ""}</strong>
              ${n.code ? ` — ${n.code}` : ""}
            </div>
            <div>${(n.message || "").replace(/\n/g, "<br>")}</div>
          </div>
        `).join("")}
      </div>
    `;
    host.innerHTML = html;
  }

  // ===== Documentos (Contrato social – card + upload) =====
  function ensureDocsUI() {
    if (!docsSheet) return;

    // esconder botões do HTML base (a UI agora é no card)
    $("#btnDocsNow")?.classList.add("hide");
    $("#btnDocsLater")?.classList.add("hide");

    const host = docsSheet.querySelector(".sheet__footer") || docsSheet;
    let card = host.querySelector("#contractCard");
    if (!card) {
      card = document.createElement("div");
      card.id = "contractCard";
      card.className = "doccard";
      host.appendChild(card);
    }

    renderCard();

    // ---------- helpers de UI ----------
    function statusInfo(st) {
      const map = {
        pending:      { label: "Pendente",     pill: "pill pill--muted",
                        desc: "Envie o contrato social para iniciarmos a verificação. Você pode concluir agora ou voltar depois." },
        submitted:    { label: "Enviado",      pill: "pill pill--info",
                        desc: "Documento enviado para conferência." },
        under_review: { label: "Em análise",   pill: "pill pill--info",
                        desc: "Estamos analisando o documento. Avisaremos por e-mail quando a análise terminar." },
        rejected:     { label: "Reprovado",    pill: "pill pill--danger",
                        desc: `Reprovado${profile?.docs_rejection_reason ? ` — ${profile.docs_rejection_reason}` : ""}. Corrija e reenvie.` },
        approved:     { label: "Aprovado",     pill: "pill pill--success",
                        desc: "Documento aprovado. Você já pode concluir e começar a usar o Bidly." }
      };
      return map[st] || map.pending;
    }

    async function renderCard() {
      const s = (profile?.docs_status || "pending").toLowerCase();

      // ações do cabeçalho do card
      let actions = "";
      if (s === "approved") {
        actions = `<button id="btnDocsFinish" class="btn primary">Concluir</button>`;
      } else if (s === "under_review" || s === "submitted") {
        actions = ``; // sem botões
      } else {
        // pending ou rejected
        actions = `
          ${s === "rejected" ? `<button id="btnGoOrg" class="btn ghost">Ir para dados</button>` : ``}
          <button id="btnDocsLater2" class="btn ghost">Continuar depois</button>
          <button id="btnDocsNow2" class="btn primary">Concluir agora</button>
        `;
      }

      const info = statusInfo(s);

      // Bloco do uploader
      const hasFile = !!(profile?.docs_file_url);
      const filename = hasFile ? (profile.docs_file_url.split("/").pop() || "contrato.pdf") : "Nenhum arquivo enviado";
      const fileRow = `
        <div class="uploader">
          <div class="uploader__row">
            <div class="filebadge ${hasFile ? '' : 'is-empty'}" title="${hasFile ? filename : ''}">
              <span class="filebadge__icon">📄</span>
              <span class="filebadge__name">${filename}</span>
              ${hasFile ? `<span class="filebadge__meta">PDF</span>` : ''}
            </div>
            <div class="uploader__actions">
              ${(s === 'approved' || s === 'under_review')
                ? ''
                : `
                  <label class="btn ghost">
                    <input id="fileInput" type="file" accept="${DOCS_ACCEPT}" class="hide">
                    ${hasFile ? 'Substituir' : 'Enviar PDF'}
                  </label>
                  ${hasFile ? `<button id="btnRemoveFile" class="btn ghost">Remover</button>` : ''}
                `}
            </div>
          </div>
          <small class="muted">Apenas PDF, até ${DOCS_MAX_MB} MB.</small>
        </div>
      `;

      // container para histórico do suporte (só mostra quando reprovado)
      const notesContainer = `<div id="appNotesBox"></div>`;

      card.innerHTML = `
        <div class="doccard__head">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <strong>Contrato social</strong>
            <span class="${info.pill}">${info.label}</span>
          </div>
          <div class="doccard__actions">${actions}</div>
        </div>
        <p class="doccard__desc">${info.desc}</p>
        ${fileRow}
        ${s === 'rejected' ? notesContainer : ''}
      `;

      // Handlers de navegação/fluxo
      $("#btnGoOrg")?.addEventListener("click", (e) => {
        e.preventDefault();
        // Volta um estágio (dados da organização)
        hide(docsSheet);
        show(orgSheet);
        try { orgSheet.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
      });

      $("#btnDocsLater2")?.addEventListener("click", (e) => {
        e.preventDefault();
        try { window.location.assign("/"); } catch {}
      });

      $("#btnDocsNow2")?.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await patchProfile({
            docs_status: "under_review",
            docs_submitted: true,
            docs_submitted_at: new Date().toISOString()
          });
          profile = await getProfile();
          updateProgress();
          renderCard();
        } catch (err) {
          console.error("[docs] concluir agora:", err);
        }
      });

      $("#btnDocsFinish")?.addEventListener("click", (e) => {
        e.preventDefault();
        try {
          hide(docsSheet);
          updateProgress();
          window.location.assign("/");
        } catch (err) {
          console.error("[docs] concluir:", err);
        }
      });

      // Upload
      const input = $("#fileInput");
      input?.addEventListener("change", async (ev) => {
        const f = ev.target.files?.[0];
        if (!f) return;

        if (f.type !== DOCS_ACCEPT) {
          alert("Envie um PDF (.pdf).");
          input.value = "";
          return;
        }
        if (f.size > DOCS_MAX_MB * 1024 * 1024) {
          alert(`Arquivo muito grande. Limite de ${DOCS_MAX_MB} MB.`);
          input.value = "";
          return;
        }

        const stamp = Date.now();
        const path = `${user.id}/contrato_v${stamp}.pdf`;

        try {
          const { error: upErr } = await sb.storage.from(DOCS_BUCKET)
            .upload(path, f, { contentType: DOCS_ACCEPT, upsert: false });
          if (upErr) throw upErr;

          await patchProfile({
            docs_file_url: path,
            docs_status: (profile.docs_status || "pending")
          });

          profile = await getProfile();
          renderCard();
        } catch (er) {
          console.error("[docs] upload:", er);
          alert("Não foi possível enviar o PDF agora.");
        } finally {
          input.value = "";
        }
      });

      $("#btnRemoveFile")?.addEventListener("click", async () => {
        if (!profile?.docs_file_url) return;
        if (!confirm("Remover o arquivo enviado?")) return;

        try {
          await sb.storage.from(DOCS_BUCKET).remove([profile.docs_file_url]);
        } catch (_) { /* ignore */ }

        try {
          await patchProfile({ docs_file_url: null });
          profile = await getProfile();
          renderCard();
        } catch (er) {
          console.error("[docs] remover path:", er);
        }
      });

      // Carrega histórico do suporte quando REPROVADO
      if (s === "rejected") {
        const notes = await loadAppNotes();
        renderNotesBox(notes);
      }
    }
  }

  // ===== Progresso e decisão de etapa =====
  function updateProgress() {
    const total = 3; // Termos, Organização, Documentos (aprovado)
    let done = 0;

    if (profile.terms_accepted === true && Number(profile.terms_version ?? 0) === TERMS_VER) done++;
    if (profile.org_submitted === true) done++;
    if ((profile.docs_status || "").toLowerCase() === "approved") done++;

    $$(".act-progress__text").forEach(el => el.textContent = `Etapa ${done}/${total}`);
    const percent = Math.round((done / total) * 100);
    $$(".act-progress__fill").forEach(el => el.style.width = `${percent}%`);
  }

  async function nextStep() {
    updateProgress();

    // 1) Termos
    if (profile.terms_accepted !== true || Number(profile.terms_version ?? 0) !== Number(TERMS_VER)) {
      await loadTermsHTML();
      show(termsSheet); hide(orgSheet); hide(docsSheet);
      updateProgress(); return;
    }

    // 2) Organização (Empresa)
    if (profile.role === "company" && profile.org_submitted !== true) {
      hide(termsSheet); show(orgSheet); hide(docsSheet);
      updateProgress(); return;
    }

    // 3) Documentos — sempre mostrar até 'approved'
    const isApproved = (profile.docs_status || "").toLowerCase() === "approved";
    if (docsSheet && !isApproved) {
      hide(termsSheet); hide(orgSheet); show(docsSheet);
      ensureDocsUI();          // monta o card aqui (com upload e histórico quando reprovado)
      updateProgress(); return;
    }

    // 4) Fluxo concluído
    hide(termsSheet); hide(orgSheet); hide(docsSheet);
    updateProgress();
  }

  // ===== Bootstrap =====
  try {
    wireTerms();
    wireOrg();
    await nextStep();
  } catch (e) {
    console.error(TAG, e);
  }
})();
