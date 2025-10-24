/* /assets/js/activation.controller.js
   Bidly • Activation Controller (robusto, idempotente e fiel ao layout)
   Atenção: barra de progresso removida — usamos rótulos fixos "Etapa X/3".
*/

window.Bidly = window.Bidly || {};
Bidly.controller = (function (C, dom, repo, ui /* services não usado */, services) {
  const TAG = "[activation.controller]";
  const $ = dom.$;

  // ============== helpers de UI/segurança ==============
  function ensureSheetContainers() {
    const defs = [
      { id: "termsFull", mod: "sheet--terms" },
      { id: "orgFull",   mod: "sheet--org"   },
      { id: "docsFull",  mod: "sheet--docs"  },
    ];

    defs.forEach(({ id, mod }) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("section");
        el.id = id;
        el.setAttribute("aria-hidden", "true");
        el.setAttribute("role", "dialog");
        el.setAttribute("aria-modal", "true");
        el.className = `sheet ${mod} hide`;
        document.body.appendChild(el);
      } else {
        if (!el.classList.contains("sheet")) el.classList.add("sheet");
        if (mod && !el.classList.contains(mod)) el.classList.add(mod);
        if (!el.hasAttribute("aria-hidden")) el.setAttribute("aria-hidden", "true");
        if (!el.hasAttribute("role")) el.setAttribute("role", "dialog");
        if (!el.hasAttribute("aria-modal")) el.setAttribute("aria-modal", "true");
      }
    });
  }

  // Monta a estrutura base **apenas se** ainda não tiver .sheet__inner
  function mountSheetsMarkup() {
    // ===== TERMS =====
    (function mountTerms() {
      const host = $("#termsFull");
      if (!host) return;
      if (host.querySelector(".sheet__inner")) return;

      host.innerHTML = `
        <div class="sheet__inner">
          <header class="sheet__header">
            <div style="width:100%;max-width:980px;margin:0 auto;padding:0 var(--sheet-pad)">
              <div style="color:#6b7280;font-size:13px;margin-bottom:6px">Etapa 1/3</div>
              <h2>Termos de uso</h2>
            </div>
          </header>

          <article id="termsBox" class="sheet__scroll terms__box" tabindex="0" aria-label="Conteúdo dos termos"></article>

          <footer class="sheet__footer">
            <label class="agree">
              <input type="checkbox" id="chkAgree" />
              <span>Li e concordo com os termos (v<span id="termsVer">—</span>)</span>
            </label>
            <div class="actions">
              <button id="btnPrintTerms"  class="btn link"   type="button">Salvar PDF</button>
              <span class="spacer"></span>
              <button id="btnCancelTerms" class="btn ghost"  type="button">Cancelar</button>
              <button id="btnAcceptTerms" class="btn primary" type="button" disabled>Aceitar e continuar</button>
            </div>
          </footer>
        </div>`;
    })();

    // ===== ORG =====
    (function mountOrg() {
      const host = $("#orgFull");
      if (!host) return;
      if (host.querySelector(".sheet__inner")) return;

      host.innerHTML = `
        <div class="sheet__inner">
          <header class="sheet__header">
            <div style="width:100%;max-width:980px;margin:0 auto;padding:0 var(--sheet-pad)">
              <div style="color:#6b7280;font-size:13px;margin-bottom:6px">Etapa 2/3</div>
              <h2>Dados da organização</h2>
            </div>
          </header>

          <div class="sheet__scroll">
            <form id="orgForm" class="org-form" autocomplete="off"></form>
          </div>

          <footer class="sheet__footer">
            <div class="footer-notes">
              <div id="orgErrors" class="form-messages hide" aria-live="polite" role="status"></div>
            </div>
          </footer>
        </div>`;
    })();

    // ===== DOCS =====
    (function mountDocs() {
      const host = $("#docsFull");
      if (!host) return;
      if (host.querySelector(".sheet__inner")) return;

      host.innerHTML = `
        <div class="sheet__inner">
          <header class="sheet__header">
            <div style="width:100%;max-width:980px;margin:0 auto;padding:0 var(--sheet-pad)">
              <div style="color:#6b7280;font-size:13px;margin-bottom:6px">Etapa 3/3</div>
              <h2>Documentos da organização</h2>
            </div>
          </header>

          <div class="sheet__scroll">
            <div class="u-mt-16">
              <p class="u-mb-8">
                Envie a documentação necessária para verificação do cadastro da sua empresa.
                <br><small class="help-note">Normalmente retornamos em até 3 dias úteis.
                Dúvidas? <a href="mailto:suporte@bidly.com">suporte@bidly.com</a></small>
              </p>
              <div id="docsPlaceholder" class="u-mt-8 u-muted"></div>
            </div>
          </div>

          <footer class="sheet__footer">
            <div id="docsErrors" class="form-messages hide" aria-live="polite" role="status"></div>
            <div class="actions">
              <button id="btnDocsLater" class="btn ghost"  type="button">Continuar depois</button>
              <span class="spacer"></span>
              <button id="btnDocsNow"   class="btn primary hide" type="button">Concluir agora</button>
            </div>
          </footer>
        </div>`;
    })();
  }

  function showFatalBanner(msg = "Houve um erro ao iniciar a aplicação. Veja o console.") {
    const box = document.createElement("div");
    box.style.cssText =
      "max-width:960px;margin:40px auto;padding:16px;border:1px solid #fca5a5;background:#fee2e2;color:#991b1b;border-radius:12px";
    box.innerHTML = `<b>Ops:</b> ${msg}`;
    (document.querySelector(".sheet__scroll") || document.body).prepend(box);
  }

  // ============== chooser PF/PJ ==============
  let chooserEl = null;
  function ensureChooser() {
    if (chooserEl) return chooserEl;
    const host = document.createElement("div");
    host.id = "vendorTypeChooser";
    host.className = "act-chooser";
    host.innerHTML = `
      <div class="act-chooser__card">
        <h3>Como você quer se cadastrar?</h3>
        <p class="muted">Escolha a natureza do cadastro para continuar.</p>
        <div class="act-chooser__grid">
          <button id="choosePJ" class="btn primary">Empresa (CNPJ)</button>
          <button id="choosePF" class="btn">Pessoa Física (CPF)</button>
        </div>
      </div>`;
    document.body.appendChild(host);
    dom.$("#choosePJ", host).addEventListener("click", async () => {
      localStorage.setItem("org_type_choice", "PJ");
      dom.hide(host);
      await ui.org.open("PJ");
    });
    dom.$("#choosePF", host).addEventListener("click", async () => {
      localStorage.setItem("org_type_choice", "PF");
      dom.hide(host);
      await ui.org.open("PF");
    });
    chooserEl = host;
    return host;
  }

  // ============== navegação ==============
  async function nextStep() {
    let snap;
    try {
      snap = await Bidly.services.progress.snapshot();
    } catch (e) {
      console.warn(TAG, "snapshot falhou (provavelmente transitório)", e);
      // segue fluxo conservador
      snap = { terms:false, org:false, docs:false };
    }

    if (!snap.terms) {
      await ui.terms.loadBox();
      dom.show($("#termsFull"));
      dom.hide($("#orgFull"));
      dom.hide($("#docsFull"));
      return;
    }

    if (!snap.org) {
      const choice = localStorage.getItem("org_type_choice");
      if (!choice) {
        dom.show(ensureChooser());
        dom.hide($("#termsFull"));
        dom.hide($("#orgFull"));
        dom.hide($("#docsFull"));
        return;
      }
      await ui.org.open(choice);
      return;
    }

    await ui.docs.open();
  }

  function openOrgFromDocs() {
    const choice = localStorage.getItem("org_type_choice") || "PJ";
    ui.org.open(choice);
  }

  // ============== boot ==============
  async function waitAuthReady() {
    try {
      const sb = await (window.connectSupabase ? window.connectSupabase() : Promise.resolve(null));
      if (!sb?.auth) return null;
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      return data?.session || null;
    } catch (e) {
      console.error(TAG, "auth getSession falhou", e);
      return null;
    }
  }

  async function boot() {
    try {
      ensureSheetContainers();
      mountSheetsMarkup();

      // CSS do chooser (1x)
      (function mountChooserCss() {
        if (document.getElementById("act-chooser-style")) return;
        const css = `
          .act-chooser{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(7,12,20,.55);z-index:9999}
          .act-chooser__card{background:#0b1220;border:1px solid #273043;border-radius:14px;padding:20px;max-width:560px;width:92%;box-shadow:0 10px 30px rgba(0,0,0,.35);color:#e6edf6}
          .act-chooser__grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
          .hide{display:none!important}
        `;
        const s = document.createElement("style");
        s.id = "act-chooser-style";
        s.textContent = css;
        document.head.appendChild(s);
      })();

      await waitAuthReady();

      ui.terms.wire();
      await nextStep();
    } catch (e) {
      console.error(TAG, "boot error", e);
      showFatalBanner("Houve um erro ao iniciar a aplicação. Verifique o console do navegador.");
    }
  }

  return { boot, nextStep, ensureChooser, openOrgFromDocs, openDocs: ui.docs.open };
})(Bidly.constants, Bidly.dom, Bidly.repo, Bidly.ui, Bidly.services);


// ============== startup seguro ==============
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await Bidly.controller.boot();
  } catch (e) {
    console.error("[activation.controller] Boot error:", e);
    const box = document.createElement("div");
    box.style.cssText =
      "max-width:960px;margin:40px auto;padding:16px;border:1px solid #fca5a5;background:#fee2e2;color:#991b1b;border-radius:12px";
    box.innerHTML =
      "<b>Ops:</b> houve um erro ao iniciar a aplicação. Verifique o console do navegador.";
    (document.body || document.documentElement).prepend(box);
  }
});
