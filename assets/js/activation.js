// /assets/js/activation.js — Checklist + Termos (fix: não reabilitar tudo ao sair do sync)
(function () {
  const $ = (id) => document.getElementById(id);

  const TERMS = { version: 4, locale: "pt-BR", url: "/legal/terms/pt-BR/1/terms.html" };

  // ====== UI helpers ======
  function uiError(msg) {
    const box = $("bootError");
    if (!box) return;
    box.innerHTML = `<b>Ops:</b> ${msg}`;
    box.classList.remove("hide");
  }
  function clearUiError() {
    const box = $("bootError");
    if (!box) return;
    box.innerHTML = "";
    box.classList.add("hide");
  }
  function setStatusPill(el, text, cls) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("st-ok", "st-pending", "st-missing");
    if (cls) el.classList.add(cls);
  }
  function disable(el, flag = true) {
    if (!el) return;
    el.disabled = !!flag;
    el.setAttribute("aria-disabled", flag ? "true" : "false");
    el.classList.toggle("is-disabled", !!flag);
  }
  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].map((b)=>b.toString(16).padStart(2,"0")).join("");
  }
  function updateAcceptState() {
    const chk = $("chkAgree");
    const btnAccept = $("btnAcceptTerms");
    disable(btnAccept, !(chk?.checked && loadedTermsHash && scrolledToEnd));
  }

  // Loading guard
  function setSyncing(flag) {
    const card = document.querySelector("#activationCard");
    const buttons = card?.querySelectorAll("button");
    const st1 = $("st-dados"), st2 = $("st-termos"), st3 = $("st-fin"), st4 = $("st-docs");
    if (flag) {
      card?.classList.add("is-syncing");
      buttons?.forEach((b)=>disable(b, true)); // trava tudo enquanto carrega
      setStatusPill(st1, "Sincronizando…", "st-pending");
      setStatusPill(st2, "Sincronizando…", "st-pending");
      setStatusPill(st3, "Sincronizando…", "st-pending");
      setStatusPill(st4, "Pendente", "st-pending");
      $("actTotal")?.replaceChildren("4");
      $("actCount")?.replaceChildren("0");
    } else {
      card?.classList.remove("is-syncing");
      // ⚠️ NÃO reabilita todos os botões aqui.
      // O estado final de cada botão é aplicado logo abaixo em renderChecklist().
    }
  }

  // ====== estado ======
  let uid = null, userEmail = null, profile = null;
  let loadedTermsHash = null, termsRawHtml = "", scrolledToEnd = false;

  async function waitForSupabaseReady() {
    if (window.sb?.auth) return;
    await new Promise((resolve) => {
      let tries = 0;
      const it = setInterval(() => {
        tries++;
        if (window.sb?.auth || tries > 120) { clearInterval(it); resolve(); }
      }, 50);
    });
  }

  document.addEventListener("DOMContentLoaded", initActivation);

  async function initActivation() {
    try {
      clearUiError();
      await waitForSupabaseReady();
      const { data: s, error } = await sb.auth.getSession();
      if (error) { uiError("Falha ao obter sessão."); return; }
      const session = s?.session ?? null;
      uid = session?.user?.id ?? null;
      userEmail = session?.user?.email ?? null;
      if (!uid) return;

      await renderChecklist();
      bindTermsUI();
    } catch (e) {
      console.warn("[activation] init error:", e);
      uiError("Erro de inicialização.");
    }
  }

  function computeProfileUI(p) {
  const role      = (p?.role || "").toLowerCase();         // company | vendor
  const status    = (p?.status_profile || "").toLowerCase();
  const approval  = (p?.org_approval_status || "").toLowerCase();
  const review    = (p?.profile_review_status || "").toLowerCase();

  // heurísticas de compatibilidade (legado)
  const isApproved = review === "approved" || status === "aprovado" || approval === "aprovado";
  const isPending  = review === "pending"  || status === "em_analise" || approval === "aguardando";
  const isRejected = review === "rejected" || status === "reprovado"  || approval === "reprovado";

  const out = {
    statusPill: { text: "Pendente", cls: "st-pending" },
    button:     { label: "Preencher", disabled: false },
    isDone:     false,
  };

  // Caso aprovado (Concluído)
  if (isApproved) {
    out.statusPill = { text: "Concluído", cls: "st-ok" };
    out.isDone = true;

    // Regras por role:
    if (role === "vendor" || role === "supplier") {
      // PF: concluído e botão DESABILITADO (apenas ver posteriormente via outra UI, se houver)
      out.button = { label: "Ver dados", disabled: true };
    } else if (role === "company") {
      // PJ: concluído e botão habilitado para visualizar (read-only)
      out.button = { label: "Ver dados", disabled: false };
    } else {
      // fallback neutro
      out.button = { label: "Ver dados", disabled: true };
    }
    return out;
  }

  // Caso em análise (pendente de aprovação)
  if (isPending) {
    out.statusPill = { text: "Em análise", cls: "st-pending" };
    // Em análise: ninguém edita. Botão desabilitado; label “Ver dados” para manter consistência.
    out.button = { label: "Ver dados", disabled: true };
    return out;
  }

  // Caso reprovado: permitir correção
  if (isRejected) {
    out.statusPill = { text: "Pendente", cls: "st-pending" };
    out.button = { label: "Corrigir", disabled: false };
    return out;
  }

  // Fallback (sem envio ainda)
  out.statusPill = { text: "Pendente", cls: "st-pending" };
  out.button = { label: "Preencher", disabled: false };
  return out;
}

  // ======= CHECKLIST =======
  async function renderChecklist() {
    try {
      clearUiError();
      setSyncing(true);

      const { data: s } = await sb.auth.getSession();
      const session = s?.session ?? null;
      uid = session?.user?.id ?? uid;
      userEmail = session?.user?.email ?? userEmail;
      if (!uid) { setSyncing(false); return; }

      const q1 = await sb
        .from("profiles")
        .select(`
          id, role,
          status_profile, org_approval_status, checklist_profile_done,
          profile_review_status,
          accept_terms_at, terms_version,
          pix_key,
          company_name, document
        `)
        .eq("id", uid)
        .maybeSingle();

      if (q1.error) { setSyncing(false); uiError("Não foi possível ler seu perfil (Supabase/RLS)."); return; }
      profile = q1.data || {};

      // 1) Dados
      const ui = computeProfileUI(profile);
setStatusPill($("st-dados"), ui.statusPill.text, ui.statusPill.cls);
const btnDados = $("btnProfile") || $("btn-dados");
if (btnDados) {
  btnDados.textContent = ui.button.label;
  disable(btnDados, ui.button.disabled);
}


      // 2) Termos
      const termosOK = !!profile?.accept_terms_at && Number(profile?.terms_version || 0) >= TERMS.version;
      setStatusPill($("st-termos"), termosOK ? "Concluído" : "Pendente", termosOK ? "st-ok" : "st-pending");
      disable($("btn-termos"), termosOK); // <- concluído = bloqueado

      // 3) Financeiro
      const isCompany = profile?.role === "company";
      const descFin = $("desc-fin");
      const btnFin = $("btn-fin");
      let finOK = false;

      if (isCompany) {
        finOK = true;
        if (descFin) descFin.textContent = "O financeiro é concluído automaticamente para empresas.";
        if (btnFin) { btnFin.textContent = "Concluído"; disable(btnFin, true); } // <- sempre bloqueado p/ empresa
        setStatusPill($("st-fin"), "Concluído", "st-ok");
      } else {
        finOK = !!profile?.pix_key;
        if (descFin) descFin.textContent = "Configure para receber/pagar com segurança.";
        if (btnFin) { btnFin.textContent = finOK ? "Concluído" : "Configurar"; disable(btnFin, finOK); }
        setStatusPill($("st-fin"), finOK ? "Concluído" : "Pendente", finOK ? "st-ok" : "st-pending");
      }

      // 4) Documentos
      setStatusPill($("st-docs"), "Pendente", "st-pending");

      // contador
      const doneCount = (ui.isDone ? 1 : 0) + (termosOK ? 1 : 0) + (finOK ? 1 : 0);
      $("actTotal")?.replaceChildren("4");
      $("actCount")?.replaceChildren(String(doneCount));

      // sai do modo syncing (sem liberar geral)
      setSyncing(false);
    } catch (e) {
      console.warn("[checklist] exceção:", e);
      setSyncing(false);
      uiError("Erro ao renderizar o checklist.");
    }
  }

  window.refreshActivationStatus = renderChecklist;
  window.renderChecklist = renderChecklist;

  // ======= Termos =======
  function bindTermsUI() {
    const btnOpen = $("btn-termos");
    const modal = $("termsModal");
    const chk = $("chkAgree");
    const btnAccept = $("btnAcceptTerms");
    const btnPrint = $("btnPrintTerms");
    const btnCancel = $("btnCancelTerms");

    if (!btnOpen || !modal || !chk || !btnAccept) return;

    disable(btnPrint, true); disable(btnAccept, true);

    btnOpen.addEventListener("click", async () => { openModal(modal); await loadTermsIntoModal(); });
    modal.addEventListener("click", (e) => { const t=e.target; if (t instanceof HTMLElement && t.dataset.close==="1") closeModal(modal); });
    btnCancel?.addEventListener("click", () => closeModal(modal));
    chk.addEventListener("change", updateAcceptState);

    btnAccept.addEventListener("click", async () => {
      if (!uid || !loadedTermsHash || !chk.checked || !scrolledToEnd) return;
      disable(btnAccept, true);
      clearUiError();
      try {
        const ins = await sb.from("terms_consent_events").insert({
          user_id: uid, role: profile?.role ?? null, locale: TERMS.locale,
          terms_version: TERMS.version, terms_url: TERMS.url, doc_hash: loadedTermsHash,
          user_agent: navigator.userAgent ?? null,
        });
        if (ins.error) console.warn("[terms] insert audit error:", ins.error);

        const now = new Date().toISOString();
        const upd = await sb.from("profiles")
          .update({ accept_terms_at: now, terms_version: TERMS.version })
          .eq("id", uid);
        if (upd.error) { uiError("Não foi possível salvar sua aceitação no perfil (RLS UPDATE)."); disable(btnAccept,false); return; }

        setStatusPill($("st-termos"), "Concluído", "st-ok");
        disable($("btn-termos"), true);
        await sleep(120);
        closeModal(modal);
        await renderChecklist();
      } catch (e) {
        uiError("Erro ao salvar a aceitação dos termos.");
        disable(btnAccept, false);
      }
    });

    btnPrint?.addEventListener("click", () => { printTermsAsPdf(); });
    window.addEventListener("keyup", (e) => { if (e.key === "Escape") closeModal(modal); });
  }

  async function loadTermsIntoModal() {
    loadedTermsHash = null; termsRawHtml = ""; scrolledToEnd = false;

    const box = document.querySelector("#termsModal .terms-box");
    const btnPrint  = $("btnPrintTerms");
    const metaSpan  = $("termsMeta");
    const hint      = $("scrollHint");

    if (box) box.innerHTML = "<p>Carregando…</p>";
    disable(btnPrint, true);
    const agree = $("chkAgree"); if (agree) agree.checked = false;
    updateAcceptState();
    hint?.classList.remove("hide");

    const now = new Date();
    if (metaSpan) metaSpan.textContent = `Versão ${TERMS.version} • Atualizado em ${now.toLocaleDateString("pt-BR")} • Idioma ${TERMS.locale}`;

    try {
      const res = await fetch(TERMS.url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      termsRawHtml = html;
      loadedTermsHash = await sha256(html);

      if (box) {
        box.innerHTML = html;
        const checkEnd = () => {
          if (!box) return;
          const end = box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
          if (end && !scrolledToEnd) { scrolledToEnd = true; hint?.classList.add("hide"); updateAcceptState(); }
        };
        box.addEventListener("scroll", checkEnd, { passive: true });
        requestAnimationFrame(checkEnd);
      }

      disable(btnPrint, false);
      updateAcceptState();
    } catch {
      loadedTermsHash = null; termsRawHtml = "";
      if (box) box.innerHTML = '<p class="muted">Não foi possível carregar os Termos no momento. Tente novamente.</p>';
    }
  }

  function printTermsAsPdf() {
    if (!termsRawHtml) return;
    try {
      const w = window.open("", "_blank");
      if (!w) { alert("Permita pop-ups para salvar o PDF."); return; }
      const when = new Date().toLocaleString("pt-BR");
      const css = `
        html,body{background:#fff;color:#111;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;padding:24px;}
        h1{margin:0 0 8px;}
        .meta{font-size:12px;color:#555;margin-bottom:12px;}
        hr{border:0;border-top:1px solid #e5e7eb;margin:12px 0 20px;}
        *{print-color-adjust:exact;-webkit-print-color-adjust:exact;}
      `;
      const emailLine = userEmail ? ` • Usuário ${userEmail}` : "";
      w.document.open();
      w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termos de Uso — Bidly</title><style>${css}</style></head><body><h1>Termos de Uso — Bidly</h1><div class="meta">Versão ${TERMS.version} • Atualizado em ${when} • Idioma ${TERMS.locale}${emailLine}</div><hr>${termsRawHtml}</body></html>`);
      w.document.close(); w.focus(); setTimeout(()=>{ w.print(); w.close(); }, 300);
    } catch { alert("Não foi possível abrir a impressão."); }
  }

  function openModal(modal) {
    modal.classList.remove("hide");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }
  function closeModal(modal) {
    modal.classList.add("hide");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    const chk = $("chkAgree"); if (chk) chk.checked = false;
    disable($("btnAcceptTerms"), true);
  }
})();
