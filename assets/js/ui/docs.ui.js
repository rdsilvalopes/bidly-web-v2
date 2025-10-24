/* Bidly • UI • Documentos ETAPA 3*/
window.Bidly = window.Bidly || {};
Bidly.ui = Bidly.ui || {};

Bidly.ui.docs = (function (C, dom, repo) {
  const $ = dom.$;

  function pill(status) {
    const s = String(status || "pending").toLowerCase();
    const map = {
      approved:     ["pill pill--success", "Aprovado"],
      rejected:     ["pill pill--danger",  "Reprovado"],
      under_review: ["pill pill--info",    "Em análise"],
      pending:      ["pill pill--muted",   "Pendente"],
    };
    const [cls, label] = map[s] || map.pending;
    return `<span class="${cls}">${label}</span>`;
  }

  function header() {
    return `
      <div class="sheet__header">
        <div style="width:100%;max-width:980px;margin:0 auto;padding:0 var(--sheet-pad)">
          <div style="color:#6b7280;font-size:13px;margin-bottom:6px">Etapa 3/3</div>
          <h2 style="margin-bottom:8px">Documentos da organização</h2>
        </div>
      </div>`;
  }

  function card(label) {
    const acceptAttr = C.DOCS_ACCEPT || "application/pdf";
    return `
      <div class="doccard">
        <div class="doccard__head">
          <strong>${label}</strong>
          <div id="docPill">${pill("pending")}</div>
        </div>

        <p class="doccard__desc">
          Envie a documentação necessária para verificação do cadastro da sua empresa.<br/>
          Normalmente retornamos em até 3 dias úteis. Dúvidas? <a href="mailto:suporte@bidly.com">suporte@bidly.com</a>
        </p>

        <div class="uploader">
          <div class="uploader__row">
            <div class="filebadge is-empty" id="fileBadge">
              <span class="filebadge__name">Nenhum arquivo selecionado</span>
              <span class="filebadge__meta"></span>
            </div>
            <div class="uploader__actions">
              <label id="btnSelectWrap" class="btn">
                <input id="docFile" type="file" class="hide" accept="${acceptAttr}">Selecionar PDF
              </label>
              <button id="btnRemove" class="btn ghost hide">Remover</button>
            </div>
          </div>
        </div>

        <div id="docStatusArea" class="muted" style="margin-top:10px;"></div>
        <div id="docNotes" class="muted" style="margin-top:14px;"></div>

        <div class="sheet__footer" style="padding-left:0;padding-right:0;margin-top:12px">
          <div class="doccard__actions" style="width:100%">
            <span class="spacer"></span>
            <button id="btnDocsEdit"  class="btn hide">Alterar dados</button>
            <button id="btnDocsLater" class="btn ghost">Continuar depois</button>
            <button id="btnDocsFinish" class="btn primary hide">Concluir agora</button>
          </div>
        </div>
      </div>`;
  }

  // escape seguro para conteúdo de notas (fallback)
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  async function open() {
    // Sem snapshot: decide PF/PJ localmente
    const choice = (localStorage.getItem("org_type_choice") || "PJ").toUpperCase();
    const DOC_TYPE = choice === "PF"
      ? (C.DOC_TYPE_PF || (C.DOC_TYPE_PJ || "company_contract")) // PF ainda não habilitado
      : (C.DOC_TYPE_PJ || "company_contract");
    const label = choice === "PF" ? "Documento de identidade (PDF)" : "Contrato social (PDF)";

    // Monta a folha
    const sheet = $("#docsFull");
    if (!sheet) return;
    sheet.innerHTML = `${header()}<div class="sheet__scroll">${card(label)}</div>`;
    dom.hide($("#termsFull")); dom.hide($("#orgFull")); dom.show(sheet);

    // Refs
    const pillEl        = $("#docPill");
    const badge         = $("#fileBadge");
    const statusArea    = $("#docStatusArea");
    const btnEdit       = $("#btnDocsEdit");   // novo
    const btnLater      = $("#btnDocsLater");
    const btnFinish     = $("#btnDocsFinish");
    const btnRemove     = $("#btnRemove");
    const btnSelectWrap = $("#btnSelectWrap");
    const fileInput     = $("#docFile");
    const notesBox      = $("#docNotes");

    const show = (el) => el && el.classList.remove("hide");
    const hide = (el) => el && el.classList.add("hide");

    let _refreshing = false;
    let _queued = false;
    async function queueRefresh() {
      if (_refreshing) { _queued = true; return; }
      _refreshing = true;
      try { await refreshUI(); }
      finally { _refreshing = false; if (_queued) { _queued = false; queueRefresh(); } }
    }

    async function refreshUI() {
      // doc + notas (RLS já limita o que o app pode ver)
      const docPromise   = repo.documents.getByTypeLite(DOC_TYPE);
      const notesPromise = repo.documents.listNotes(20).catch(() => []);

      const doc = await docPromise;
      const st = String(doc?.status || "pending").toLowerCase();
      const hasFile = !!doc?.storage_path;

      if (pillEl) pillEl.innerHTML = pill(st);

      if (badge) {
        if (hasFile) {
          badge.classList.remove("is-empty");
          const name = (doc.storage_path || "").split("/").pop() || `${DOC_TYPE}.pdf`;
          const nameEl = badge.querySelector(".filebadge__name");
          if (nameEl) nameEl.textContent = name;
          const meta = badge.querySelector(".filebadge__meta"); if (meta) meta.textContent = "enviado";
          (async () => {
            try {
              const baseUrl = await repo.documents.signedUrlCached(doc.storage_path);
              const verMark = doc?.reviewed_at || doc?.submitted_at || Date.now();
              const linkUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(verMark)}`;
              if (nameEl && linkUrl) nameEl.innerHTML = `<a href="${linkUrl}" target="_blank" rel="noopener">${esc(name)}</a>`;
            } catch {}
          })();
        } else {
          badge.classList.add("is-empty");
          const nm = badge.querySelector(".filebadge__name"); if (nm) nm.textContent = "Nenhum arquivo selecionado";
          const mt = badge.querySelector(".filebadge__meta"); if (mt) mt.textContent = "";
        }
      }

      // visibilidade dos botões
      hide(btnEdit); hide(btnFinish); hide(btnRemove); hide(btnSelectWrap);
      show(btnLater);

      if (st === "rejected") {
        statusArea.textContent = `Reprovado. ${doc?.rejection_reason || "Corrija e reenvie."}`;
        // mostra “Alterar dados” para voltar à etapa 2
        show(btnEdit);
        if (hasFile) { show(btnRemove); show(btnFinish); } else { show(btnSelectWrap); }
      } else if (st === "under_review") {
        statusArea.textContent = "Documento enviado. Em análise.";
      } else if (st === "approved") {
        statusArea.textContent = "Aprovado.";
      } else {
        if (!hasFile) {
          statusArea.textContent = "Anexe o PDF para prosseguir.";
          show(btnSelectWrap);
        } else {
          statusArea.textContent = "PDF anexado. Você pode concluir agora para enviar à análise.";
          show(btnRemove); show(btnFinish);
        }
      }

      // --------- HISTÓRICO [App] ----------
      (async () => {
        try {
          const allNotes = await notesPromise;
          if (!notesBox) return;

          const appNotes = (Array.isArray(allNotes) ? allNotes : [])
            .filter(n => String(n.visibility || "").toLowerCase() === "app");

          if (!appNotes.length) { notesBox.innerHTML = ""; return; }

          const renderer = Bidly?.ui?.supportNotes?.renderAppList;
          if (typeof renderer === "function") {
            renderer(notesBox, appNotes);
          } else {
            const rows = appNotes.map(n => {
              const ts  = n.created_at ? new Date(n.created_at).toLocaleString() : "";
              const who = n.created_by_name ? ` — ${esc(n.created_by_name)}` : "";
              const rc  = n.reason_code ? ` • ${esc(n.reason_code)}` : "";
              const msg = esc(n.message || "");
              return `<div style="padding:6px 8px;border:1px solid #e5e7eb;border-radius:8px;margin-top:6px;background:#f9fafb">
                        <div style="font-size:.9rem;color:#374151">${ts}${who}${rc}</div>
                        <div>${msg}</div>
                      </div>`;
            }).join("");
            notesBox.innerHTML = `<div style="font-weight:600;margin-bottom:6px">Suporte Bidly: histórico</div>${rows}`;
          }
        } catch {
          if (notesBox) notesBox.innerHTML = "";
        }
      })();
    }

    // Navegação
    btnEdit?.addEventListener("click", async () => {
      // volta para etapa 2 (dados da organização)
      const ch = (localStorage.getItem("org_type_choice") || "PJ").toUpperCase();
      Bidly.ui.org.open(ch);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    btnLater?.addEventListener("click", () => { location.href = "/"; });

    btnFinish?.addEventListener("click", async () => {
      try {
        const d = await repo.documents.getByTypeLite(DOC_TYPE);
        if (!d?.storage_path) { statusArea.textContent = "Anexe o PDF antes de concluir."; return; }
        statusArea.textContent = "Enviando para análise…";
        await repo.documents.setUnderReview(DOC_TYPE);
        statusArea.textContent = "Documento enviado. Em análise.";
        queueRefresh();
      } catch (e) {
        console.error(e);
        statusArea.textContent = "Não foi possível concluir agora.";
      }
    });

    btnRemove?.addEventListener("click", async () => {
      try {
        statusArea.textContent = "Removendo…";
        await repo.documents.clear(DOC_TYPE);
        statusArea.textContent = "Arquivo removido.";
        queueRefresh();
      } catch (e) {
        console.error(e);
        statusArea.textContent = "Não foi possível remover.";
      }
    });

    fileInput?.addEventListener("change", async (ev) => {
      const f = ev.target.files?.[0];
      if (!f) return;
      try {
        statusArea.textContent = "Enviando PDF…";
        hide(btnSelectWrap);
        await repo.documents.upload(DOC_TYPE, f);
        statusArea.textContent = "PDF anexado com sucesso.";
        queueRefresh();
      } catch (e) {
        console.error(e);
        statusArea.textContent = e?.message || "Não foi possível enviar o PDF.";
      } finally {
        ev.target.value = "";
      }
    });

    await refreshUI();
  }

  return { open };
})(Bidly.constants, Bidly.dom, Bidly.repo);
