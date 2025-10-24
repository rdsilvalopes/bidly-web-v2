/* Bidly • UI • termos (robusto, com delegação de eventos) ETAPA 1*/
window.Bidly = window.Bidly || {};
Bidly.ui = Bidly.ui || {};

Bidly.ui.terms = (function (C, dom) {
  const TERMS_URL = `/legal/terms/pt-BR/${C.TERMS_VERSION}/terms.html`;
  const $ = dom.$;

  let wired = false;

  async function loadBox() {
    const box = $("#termsBox");
    if (!box) return;
    try {
      const html = await fetch(TERMS_URL, { cache: "no-store" }).then(r => r.text());
      box.innerHTML = html;
    } catch {
      box.innerHTML = "<p>Não foi possível carregar os termos agora.</p>";
    }
    // após carregar, reavalia o estado do botão
    setState();
  }

  function computeAtEnd() {
    const box = $("#termsBox");
    if (!box) return true; // se não existir, não bloqueia
    const notScrollable = box.scrollHeight <= box.clientHeight + 1;
    const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
    return notScrollable || atEnd;
  }

  function setState() {
    const chk = $("#chkAgree");
    const btnAccept = $("#btnAcceptTerms");
    if (!btnAccept) return;

    const okScroll = computeAtEnd();
    const okAgree = !!chk?.checked;
    btnAccept.disabled = !(okScroll && okAgree);

    // Atualiza a versão no cabeçalho (idempotente)
    const ver = $("#termsVer");
    if (ver) ver.textContent = String(C.TERMS_VERSION);
  }

  // Delegação de eventos
  function wire() {
    if (wired) return;
    wired = true;

    $("#termsBox")?.addEventListener("scroll", () => {
      setState();
    }, { passive: true });

    window.addEventListener("resize", () => {
      setState();
    }, { passive: true });

    document.addEventListener("change", (e) => {
      if (e.target && e.target.id === "chkAgree") setState();
    });

    // Aceitar
    document.addEventListener("click", async (e) => {
      const acceptBtn = e.target?.closest?.("#btnAcceptTerms");
      if (!acceptBtn) return;

      try {
        if (acceptBtn.disabled) return;
        acceptBtn.disabled = true;
        acceptBtn.classList.add("is-disabled");

        await Bidly.repo.terms.accept(C.TERMS_VERSION)
          .catch(err => { if (err?.code === "23505") return; throw err; });

        // Avança fluxo
        await Bidly.controller.nextStep();
      } catch (err) {
        console.error("[terms.ui] accept", err);
        alert("Não foi possível registrar o aceite agora.");
      } finally {
        acceptBtn.disabled = false;
        acceptBtn.classList.remove("is-disabled");
      }
    });

    // Salvar PDF
    document.addEventListener("click", async (e) => {
      const printBtn = e.target?.closest?.("#btnPrintTerms");
      if (!printBtn) return;

      try {
        const raw = await fetch(TERMS_URL, { cache: "no-store" }).then(r => r.text());

        let email = "";
        try {
          if (window.connectSupabase) {
            const sb = await window.connectSupabase();
            const { data: { session } } = await sb.auth.getSession();
            email = session?.user?.email || "";
          }
        } catch {}

        const stamped = `<!doctype html>
<meta charset="utf-8"><title>Termos</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Helvetica Neue',Arial;margin:24px}
  header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  small{color:#444}
</style>
<header><strong>Termos de Uso — Bidly</strong><small>${email}</small></header>
<hr><main>${raw}</main><script>window.print()</script>`;
        const url = URL.createObjectURL(new Blob([stamped], { type: "text/html" }));
        window.open(url, "_blank", "noopener");
      } catch {
        window.open(TERMS_URL, "_blank", "noopener");
      }
    });

    // Cancelar
    document.addEventListener("click", (e) => {
      const cancelBtn = e.target?.closest?.("#btnCancelTerms");
      if (!cancelBtn) return;
      e.preventDefault();
      location.assign("/");
    });

    // Estado inicial
    setTimeout(setState, 0);
  }

  return { loadBox, wire, setState };
})(Bidly.constants, Bidly.dom);
