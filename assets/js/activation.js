// /assets/js/activation.js — Checklist + Termos (unificado)
(function () {
  const $ = (id) => document.getElementById(id);

  // ==== CONFIG DOS TERMOS ====
  const TERMS = {
    version: 4,
    locale: "pt-BR",
    url: "/legal/terms/pt-BR/1/terms.html",
  };

  // --- estado global deste módulo ---
  let uid = null;
  let userEmail = null;
  let profile = null;
  let loadedTermsHash = null;
  let termsRawHtml = "";
  let scrolledToEnd = false;

  // Aguarda Supabase estar pronto (sb.auth existir)
  async function waitForSupabaseReady() {
    if (window.sb?.auth) return;
    await new Promise((resolve) => {
      let tries = 0;
      const it = setInterval(() => {
        tries++;
        if (window.sb?.auth) { clearInterval(it); resolve(); }
        else if (tries > 120) { clearInterval(it); resolve(); } // ~6s timeout
      }, 50);
    });
  }

  document.addEventListener("DOMContentLoaded", initActivation);

  async function initActivation() {
    try {
      await waitForSupabaseReady(); // <-- garante sb disponível

      const { data: s } = await sb.auth.getSession();
      const session = s?.session ?? null;
      uid = session?.user?.id ?? null;
      userEmail = session?.user?.email ?? null;
      if (!uid) return;

      await renderChecklist(); // 1ª pintura
      bindTermsUI();           // liga o modal dos termos
    } catch (e) {
      console.warn("[activation] init error:", e);
    }
  }

  // ======= Utils =======
  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function disable(el, flag = true) {
    if (!el) return;
    el.disabled = !!flag;
    el.setAttribute("aria-disabled", flag ? "true" : "false");
    el.classList.toggle("is-disabled", !!flag);
  }
  function setStatusPill(el, text, cls) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("st-ok", "st-pending", "st-missing");
    if (cls) el.classList.add(cls);
  }
  function updateAcceptState() {
    const chk = $("chkAgree");
    const btnAccept = $("btnAcceptTerms");
    disable(btnAccept, !(chk?.checked && loadedTermsHash && scrolledToEnd));
  }

  // ======= Lógica de UI p/ “Dados do perfil” =======
  function computeProfileUI(p) {
    const status = (p?.status_profile || "").toLowerCase();        // legado
    const approval = (p?.org_approval_status || "").toLowerCase(); // legado
    const done = !!p?.checklist_profile_done;
    const review = (p?.profile_review_status || "").toLowerCase(); // novo

    const out = {
      statusPill: { text: "Pendente", cls: "st-pending" },
      button: { label: "Preencher", disabled: false },
      isDone: false,
    };

    // approved
    if (review === "approved" || status === "aprovado" || approval === "aprovado" || done) {
      out.statusPill = { text: "Concluído", cls: "st-ok" };
      out.button = { label: "Ver dados", disabled: false };
      out.isDone = true;
      return out;
    }

    // pending
    if (review === "pending" || status === "em_analise" || approval === "aguardando") {
      out.statusPill = { text: "Em análise", cls: "st-pending" };
      out.button = { label: "Ver dados", disabled: true }; // conforme combinado
      return out;
    }

    // rejected
    if (review === "rejected" || status === "reprovado" || approval === "reprovado") {
      out.statusPill = { text: "Pendente", cls: "st-pending" };
      out.button = { label: "Corrigir", disabled: false };
      return out;
    }

    return out; // fallback pendente
  }

  // ======= CHECKLIST (exposto globalmente) =======
  async function renderChecklist() {
    try {
      const { data: s } = await sb.auth.getSession();
      const session = s?.session ?? null;
      uid = session?.user?.id ?? uid;
      userEmail = session?.user?.email ?? userEmail;
      if (!uid) return;

      const { data, error } = await sb
        .from("profiles")
        .select(`
          id, role,
          status_profile, org_approval_status, checklist_profile_done,
          profile_review_status,
          accept_terms_at, terms_version,
          pix_key
        `)
        .eq("id", uid)
        .maybeSingle();

      if (error) {
        console.warn("[checklist] read profile error:", error);
        return;
      }
      profile = data || {};

      // 1) Dados do perfil
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
      disable($("btn-termos"), termosOK);

      // 3) Financeiro (MVP: pix_key como mínimo)
      const finOK = !!profile?.pix_key;
      setStatusPill($("st-fin"), finOK ? "Concluído" : "Pendente", finOK ? "st-ok" : "st-pending");

      // 4) Documentos (placeholder)
      setStatusPill($("st-docs"), "Pendente", "st-pending");

      const doneCount = (ui.isDone ? 1 : 0) + (termosOK ? 1 : 0) + (finOK ? 1 : 0);
      $("actTotal")?.replaceChildren("4");
      $("actCount")?.replaceChildren(String(doneCount));
    } catch (e) {
      console.warn("[checklist] exceção:", e);
    }
  }

  // Expor para o app.js chamar após salvar
  window.refreshActivationStatus = renderChecklist;
  window.renderChecklist = renderChecklist;

  // ======= TERMO DE USO =======
  function bindTermsUI() {
    const btnOpen   = $("btn-termos");
    const modal     = $("termsModal");
    const chk       = $("chkAgree");
    const btnAccept = $("btnAcceptTerms");
    const btnPrint  = $("btnPrintTerms");

    if (!btnOpen || !modal || !chk || !btnAccept) return;

    disable(btnPrint, true);

    btnOpen.addEventListener("click", async () => {
      openModal(modal);
      await loadTermsIntoModal();
    });

    modal.addEventListener("click", (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.dataset.close === "1") closeModal(modal);
    });

    chk.addEventListener("change", updateAcceptState);

    btnAccept.addEventListener("click", async () => {
      if (!uid || !loadedTermsHash || !chk.checked || !scrolledToEnd) return;
      disable(btnAccept, true);
      try {
        await persistTermsAcceptance();
        closeModal(modal);
        await renderChecklist(); // atualiza "Termos"
      } catch (e) {
        console.error("[activation] accept terms error:", e);
        alert("Não foi possível salvar sua aceitação. Tente novamente.");
        disable(btnAccept, false);
      }
    });

    btnPrint?.addEventListener("click", () => { printTermsAsPdf(); });

    window.addEventListener("keyup", (e) => { if (e.key === "Escape") closeModal(modal); });
  }

  async function loadTermsIntoModal() {
    loadedTermsHash = null;
    termsRawHtml = "";
    scrolledToEnd = false;

    const box       = document.querySelector("#termsModal .terms-box");
    const btnPrint  = $("btnPrintTerms");
    const metaSpan  = $("termsMeta");
    const hint      = $("scrollHint");

    if (box) box.innerHTML = "<p>Carregando…</p>";
    disable(btnPrint, true);
    const agree = $("chkAgree"); if (agree) agree.checked = false;
    updateAcceptState();
    hint?.classList.remove("hide");

    const now = new Date();
    if (metaSpan) {
      metaSpan.textContent =
        `Versão ${TERMS.version} • Atualizado em ${now.toLocaleDateString("pt-BR")} • Idioma ${TERMS.locale}`;
    }

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
          if (end && !scrolledToEnd) {
            scrolledToEnd = true;
            hint?.classList.add("hide");
            updateAcceptState();
          }
        };
        box.addEventListener("scroll", checkEnd, { passive: true });
        requestAnimationFrame(checkEnd);
      }

      disable(btnPrint, false);
      updateAcceptState();
    } catch (e) {
      console.warn("[activation] load terms error:", e);
      loadedTermsHash = null;
      termsRawHtml = "";
      if (box) box.innerHTML =
        '<p class="muted">Não foi possível carregar os Termos no momento. Tente novamente.</p>';
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
      w.document.write(`<!doctype html>
        <html lang="pt-BR">
          <head>
            <meta charset="utf-8">
            <title>Termos de Uso — Bidly</title>
            <style>${css}</style>
          </head>
          <body>
            <h1>Termos de Uso — Bidly</h1>
            <div class="meta">Versão ${TERMS.version} • Atualizado em ${when} • Idioma ${TERMS.locale}${emailLine}</div>
            <hr>
            ${termsRawHtml}
          </body>
        </html>`);
      w.document.close();
      w.focus();
      setTimeout(() => { w.print(); w.close(); }, 300);
    } catch (e) {
      console.error("[activation] print error:", e);
      alert("Não foi possível abrir a impressão.");
    }
  }

  async function persistTermsAcceptance() {
    const role = profile?.role ?? null;
    const userAgent = navigator.userAgent ?? null;

    const ins = await sb.from("terms_consent_events").insert({
      user_id: uid,
      role,
      locale: TERMS.locale,
      terms_version: TERMS.version,
      terms_url: TERMS.url,
      doc_hash: loadedTermsHash,
      user_agent: userAgent,
    });
    if (ins.error) throw ins.error;

    const now = new Date().toISOString();
    const upd = await sb
      .from("profiles")
      .update({ accept_terms_at: now, terms_version: TERMS.version })
      .eq("id", uid);
    if (upd.error) throw upd.error;
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
    const chk = $("chkAgree");
    if (chk) chk.checked = false;
    disable($("btnAcceptTerms"), true);
  }
})();
