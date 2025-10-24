/* Bidly • App • support-notes.js (v1)
   Mostra as notas do Suporte (visibility='app') para o usuário
   na Etapa 3 — somente quando o documento NÃO está 'approved'.

   Como usar:
   - Inclua este script na etapa 3 (depois do supa.js / sessão).
   - Chame Bidly.appNotes.mount({ sb, userId, docStatus, container })
     • sb: Supabase client conectado
     • userId: UID do usuário logado
     • docStatus: 'pending' | 'under_review' | 'rejected' | 'approved'
     • container: elemento (ou seletor) onde renderizar as notas
*/

(function(){
  const root = (typeof window !== "undefined" ? window : globalThis);
  root.Bidly = root.Bidly || {};
  const esc = (v)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  function fmtDate(iso){
    try{
      return new Date(iso).toLocaleString("pt-BR", {
        year:"numeric", month:"2-digit", day:"2-digit",
        hour:"2-digit", minute:"2-digit"
      });
    }catch{ return "—"; }
  }

  function card(n){
    return `
      <div class="app-note">
        <div class="app-note__meta">[App] ${fmtDate(n.created_at)}</div>
        <div class="app-note__msg">${esc(n.message||"")}</div>
      </div>
    `;
  }

  async function load({ sb, userId }){
    return await sb
      .from("support_notes")
      .select("id, message, created_at, visibility")
      .eq("user_id", userId)
      .eq("visibility", "app")
      .order("created_at", { ascending:false })
      .limit(50);
  }

  function render(container, rows){
    const el = (typeof container === "string") ? document.querySelector(container) : container;
    if (!el) return;
    if (!rows?.length){
      el.innerHTML = `<div class="app-note__empty">Sem mensagens do suporte.</div>`;
      return;
    }
    el.innerHTML = rows.map(card).join("");
  }

  function hideSection(wrapper, hide){
    const w = (typeof wrapper === "string") ? document.querySelector(wrapper) : wrapper;
    if (!w) return;
    w.style.display = hide ? "none" : "";
  }

  async function mount({ sb, userId, docStatus, container, sectionWrapper }){
    const allowed = ["pending","under_review","rejected"];
    const show = allowed.includes(String(docStatus||"").toLowerCase());
    // Esconde a seção inteira quando approved:
    hideSection(sectionWrapper || container, !show);
    if (!show) return;

    const { data, error } = await load({ sb, userId });
    if (error){
      console.error("[app-notes] load error:", error);
      render(container, []);
      return;
    }
    render(container, data || []);
  }

  // estilos mínimos (não conflita com Admin)
  (function injectCSS(){
    if (document.getElementById("app-notes-css")) return;
    const style = document.createElement("style");
    style.id = "app-notes-css";
    style.textContent = `
      .app-notes{ margin-top: 18px; }
      .app-notes__title{ font-weight:600; margin: 0 0 8px 0; }
      .app-note{ border:1px solid #e5e7eb; border-radius:10px; background:#f8fafc; padding:10px; margin:8px 0; }
      .app-note__meta{ font-size:12px; color:#64748b; margin-bottom:6px; }
      .app-note__msg{ white-space:pre-wrap; }
      .app-note__empty{ color:#64748b; font-size:14px; }
    `;
    document.head.appendChild(style);
  })();

  root.Bidly.appNotes = { mount };
})();
