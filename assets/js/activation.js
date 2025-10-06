// /assets/js/activation.js — fluxo Termos (e-mail só no PDF)
(function () {
  const $ = (id) => document.getElementById(id);

  // ==== CONFIG DOS TERMOS ====
  const TERMS = {
    version: 4,
    locale: "pt-BR",
    url: "/legal/terms/pt-BR/1/terms.html",
  };

  // estado
  let uid = null;
  let userEmail = null;
  let profile = null;
  let loadedTermsHash = null;
  let termsRawHtml = "";
  let scrolledToEnd = false;

  document.addEventListener("DOMContentLoaded", initActivation);

  async function initActivation() {
    try {
      const { data: s } = await sb.auth.getSession();
      const session = s?.session ?? null;
      uid = session?.user?.id ?? null;
      userEmail = session?.user?.email ?? null;
      if (!uid) return;

      await refreshActivationStatus();
      bindTermsUI();
    } catch (e) {
      console.warn("[activation] init error:", e);
    }
  }

  // ===== Utils =====
  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function disable(el, flag = true) {
    if (!el) return;
    el.disabled = !!flag;
    el.setAttribute("aria-disabled", flag ? "true" : "false");
  }
  function setStatus(elId, state) {
    const el = $(elId);
    if (!el) return;
    el.classList.remove("st-ok", "st-pending", "st-missing");
    if (state === "ok") { el.classList.add("st-ok"); el.textContent = "Concluído"; }
    else if (state === "pending") { el.classList.add("st-pending"); el.textContent = "Pendente"; }
    else { el.classList.add("st-missing"); el.textContent = "Faltando"; }
  }
  function updateAcceptState() {
    const chk = $("chkAgree");
    const btnAccept = $("btnAcceptTerms");
    disable(btnAccept, !(chk?.checked && loadedTermsHash && scrolledToEnd));
  }

  // ===== Checklist =====
  async function refreshActivationStatus() {
    const { data, error } = await sb
      .from("profiles")
      .select(
        "id, role, company_name, document, display_name, linkedin_url, pix_key, accept_terms_at, terms_version"
      )
      .eq("id", uid)
      .maybeSingle();

    if (error) { console.warn("[activation] read profile error:", error); return; }
    profile = data || {};

    const role = profile?.role || null;
    const isCompany = role === "company";

    const dadosOK = isCompany
      ? !!(profile?.company_name && profile?.document)
      : !!(profile?.document || (profile?.display_name && profile?.linkedin_url));

    const termosOK = !!profile?.accept_terms_at && Number(profile?.terms_version || 0) >= TERMS.version;
    const finOK = isCompany ? false : !!profile?.pix_key; // MVP
    const docsOK = false;

    setStatus("st-dados", dadosOK ? "ok" : "pending");
    setStatus("st-termos", termosOK ? "ok" : "pending");
    setStatus("st-fin", finOK ? "ok" : "pending");
    setStatus("st-docs", docsOK ? "ok" : "pending");

    $("actTotal")?.replaceChildren("4");
    $("actCount")?.replaceChildren(String([dadosOK, termosOK, finOK, docsOK].filter(Boolean).length));

    // botão "Ler & aceitar"
    disable($("btn-termos"), termosOK);
  }

  // ===== Modal =====
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

    // fechar por [x] ou elementos com data-close="1"
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
        await refreshActivationStatus();
      } catch (e) {
        console.error("[activation] accept terms error:", e);
        alert("Não foi possível salvar sua aceitação. Tente novamente.");
        disable(btnAccept, false);
      }
    });

    // imprimir / salvar PDF (janela branca)
    btnPrint?.addEventListener("click", () => { printTermsAsPdf(); });

    // ESC fecha
    window.addEventListener("keyup", (e) => { if (e.key === "Escape") closeModal(modal); });
  }

  async function loadTermsIntoModal() {
    loadedTermsHash = null;
    termsRawHtml = "";
    scrolledToEnd = false;

    const box       = document.querySelector("#termsModal .terms-box");
    const btnPrint  = $("btnPrintTerms");
    const metaSpan  = $("termsMeta");   // linha de versão/data/idioma no rodapé
    const hint      = $("scrollHint");  // se você estiver usando uma dica "role até o fim"

    if (box) box.innerHTML = "<p>Carregando…</p>";
    disable(btnPrint, true);
    const agree = $("chkAgree"); if (agree) agree.checked = false;
    updateAcceptState();
    hint?.classList.remove("hide");

    // meta SEM e-mail (só no PDF vamos incluir e-mail)
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

        // compliance: precisa rolar até o fim
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
        requestAnimationFrame(checkEnd); // estado inicial
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

  // === Impressão / "Salvar como PDF" (apenas aqui aparece o e-mail) ===
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

  // grava aceitação
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
