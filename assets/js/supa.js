/**
 * Bidly — núcleo de autenticação (supa.js unificado)
 *
 * O que este arquivo faz:
 *  - Conecta ao Supabase com persistência de sessão em localStorage.
 *  - Expõe 4 funções globais: connectSupabase, requireAuth, applyAuthUI, logoutLocal.
 *  - Expõe o cliente como window.supa (para o restante do app) e window.sb (debug).
 *  - Opcional: liga os botões de logout (#btnOutTop / #btnOutMobile) se existirem.
 *
 * Como usar numa página:
 *  1) Carregue a UMD do Supabase (UMA vez):
 *     <script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.46.1/dist/umd/supabase.js"></script>
 *  2) Carregue ESTE arquivo (UMA vez):
 *     <script defer src="/assets/js/supa.js?v=1"></script>
 *  3) (Opcional) Chame applyAuthUI() para ligar a UI reativa de login/logado.
 *  4) Em páginas privadas, chame requireAuth() no boot.
 */

(function () {
  // Evita registrar tudo duas vezes se o arquivo for incluído por engano.
  if (
    window.connectSupabase &&
    window.requireAuth &&
    window.applyAuthUI &&
    window.logoutLocal
  ) {
    console.warn("[supa.js] Já inicializado — verifique se não há scripts duplicados.");
    return;
  }

  // >>>>> CONFIG (use os valores do seu projeto Supabase)
  const SUPABASE_URL  = "https://itkyxteikthchvagtwnf.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0a3l4dGVpa3RoY2h2YWd0d25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxODM2ODUsImV4cCI6MjA3NDc1OTY4NX0._02PVy_IF26Wrks9XsRgfXN-pHjbe79L3tznnv-J_ME";
  // <<<<< CONFIG

  /** Cliente compartilhado (singleton). */
  let _sb = null;

  /** Garante que a UMD do Supabase foi carregada. */
  function ensureUMD() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("A UMD do Supabase não está carregada. Inclua o <script> da UMD ANTES de supa.js.");
    }
  }

  /**
   * connectSupabase()
   * - Cria (se necessário) e memoriza o cliente do Supabase.
   * - Expõe em window.supa (para o app) e window.sb (para debug).
   */
  async function connectSupabase() {
    if (_sb) return _sb;
    ensureUMD();

    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: true,      // mantém login ao navegar/recarregar
        autoRefreshToken: true,    // renova o token automaticamente
        detectSessionInUrl: true,  // processa tokens recebidos via URL (magic link)
      },
      global: {
        headers: { "x-client-info": "bidly-web" }, // opcional: identificação do app
      },
    });

    // Disponibiliza imediatamente para outros scripts.
    window.supa = _sb; // <- usado pelo activation.js e demais trechos
    window.sb   = _sb; // <- útil para inspeção via DevTools

    // Liga botões de logout se existirem na página atual.
    wireLogoutButtons();

    return _sb;
  }

  /** Lê a sessão atual (ou null). */
  async function getCurrentSession() {
    const sb = await connectSupabase();
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  }

  /**
   * requireAuth()
   * - Em páginas PRIVADAS: chama no boot.
   * - Se não houver sessão, redireciona para /index.html e interrompe o fluxo.
   * - Retorna a sessão quando presente.
   */
  async function requireAuth() {
    const session = await getCurrentSession();
    if (!session) {
      window.location.href = "/index.html";
      throw new Error("Sem sessão. Redirecionado para /index.html.");
    }
    return session;
  }

  /**
   * applyAuthUI()
   * - Liga a “UI reativa” de login/logado.
   * - Esconde elementos com [data-guest] quando logado.
   * - Mostra elementos com [data-auth] quando logado.
   * - Preenche #userEmail com o e-mail da sessão (se existir).
   */
  async function applyAuthUI() {
    const sb = await connectSupabase();

    // Helpers de UI
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
    const show = (nodes, on) => nodes.forEach((n) => n.classList.toggle("hide", !on));

    const guestEls = $$("[data-guest]");
    const authEls  = $$("[data-auth]");
    const emailEl  = document.getElementById("userEmail");

    // Aplica estado atual
    const render = (session) => {
      const logged = !!session;
      show(guestEls, !logged);
      show(authEls,  logged);
      if (emailEl) emailEl.textContent = session?.user?.email || "—";
    };

    render(await getCurrentSession());

    // Mantém atualizado com mudanças (login/logout/refresh)
    sb.auth.onAuthStateChange((_event, session) => render(session));
  }

  /**
   * logoutLocal()
   * - Faz signOut “local” (limpa storage) e depois signOut global por segurança.
   * - Use este método para o botão “Sair”.
   */
  async function logoutLocal() {
    const sb = await connectSupabase();
    try { await sb.auth.signOut({ scope: "local" }); } catch {}
    try { await sb.auth.signOut(); } catch {}
  }

  /** Liga #btnOutTop e #btnOutMobile, se existirem. */
  function wireLogoutButtons() {
    const bind = (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("click", async () => {
        try { await logoutLocal(); } finally { window.location.href = "/index.html"; }
      });
    };
    bind("btnOutTop");
    bind("btnOutMobile");
  }

  // Exporta para uso global nas páginas.
  window.connectSupabase = connectSupabase;
  window.requireAuth    = requireAuth;
  window.applyAuthUI    = applyAuthUI;
  window.logoutLocal    = logoutLocal;

  // **Inicializa imediatamente** para que window.supa exista o quanto antes.
  // (não precisamos aguardar aqui; o createClient é síncrono)
  connectSupabase();
})();
