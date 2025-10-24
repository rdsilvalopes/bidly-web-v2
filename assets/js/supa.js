

/**
 * Bidly — núcleo de autenticação (supa.js unificado) — v2
 *
 * Mantém compatibilidade:
 *  - connectSupabase(), requireAuth(), applyAuthUI(), logoutLocal()
 * E expõe:
 *  - logoutEverywhere(), onAuth(cb), getUID(), setLogoutRedirect(url)
 *
 * Correções:
 *  - storageKey compartilhado (mesma sessão entre apps).
 *  - signOut global (derruba outras abas/apps).
 *  - listener que detecta troca de usuário e força redireciono.
 */

(function () {
  if (window.__supa_init) return; // evita duplo load
  window.__supa_init = true;

  // >>>>> CONFIG
  const SUPABASE_URL  = "https://itkyxteikthchvagtwnf.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0a3l4dGVpa3RoY2h2YWd0d25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxODM2ODUsImV4cCI6MjA3NDc1OTY4NX0._02PVy_IF26Wrks9XsRgfXN-pHjbe79L3tznnv-J_ME";
  const STORAGE_KEY   = "sb-bidly-auth"; // *** COMPARTILHADO ENTRE APP E ADMIN ***
  const LOGOUT_REDIRECT_DEFAULT = "/index.html";
  // <<<<< CONFIG

  let _sb = null;
  let _currentUID = null;
  let _logoutRedirect = window.__SUPA_LOGOUT_REDIRECT || LOGOUT_REDIRECT_DEFAULT;

  function ensureUMD() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("A UMD do Supabase não está carregada antes do supa.js.");
    }
  }

  function setLogoutRedirect(url) {
    _logoutRedirect = url || LOGOUT_REDIRECT_DEFAULT;
  }

  async function connectSupabase() {
    if (_sb) return _sb;
    ensureUMD();

    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: STORAGE_KEY,
      },
      global: { headers: { "x-client-info": "bidly-web" } },
    });

    window.supa = _sb;
    window.sb   = _sb;

    // guarda UID atual
    const { data } = await _sb.auth.getSession();
    _currentUID = data?.session?.user?.id || null;

    // reage a login/logout/troca de usuário/refresh
    _sb.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id || null;

      if (event === "SIGNED_OUT" || event === "USER_DELETED") {
        hardRedirect(_logoutRedirect);
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        if (_currentUID && uid && uid !== _currentUID) {
          // usuário mudou em outra aba/app → volta pra login
          hardRedirect(_logoutRedirect);
          return;
        }
        _currentUID = uid;
      }
      // demais eventos: UI reativa será atualizada por applyAuthUI()
    });

    wireLogoutButtons();
    return _sb;
  }

  function hardRedirect(url) {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
    window.location.replace(url || LOGOUT_REDIRECT_DEFAULT); // não deixa voltar
  }

  async function getCurrentSession() {
    const sb = await connectSupabase();
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  }

  async function requireAuth() {
    const session = await getCurrentSession();
    if (!session) {
      hardRedirect(_logoutRedirect);
      throw new Error("Sem sessão. Redirecionado.");
    }
    return session;
  }

  async function applyAuthUI() {
    const sb = await connectSupabase();
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
    const show = (nodes, on) => nodes.forEach((n) => n.classList.toggle("hide", !on));
    const guestEls = $$("[data-guest]");
    const authEls  = $$("[data-auth]");
    const emailEl  = document.getElementById("userEmail");

    const render = (session) => {
      const logged = !!session;
      show(guestEls, !logged);
      show(authEls,  logged);
      if (emailEl) emailEl.textContent = session?.user?.email || "—";
    };

    render(await getCurrentSession());
    sb.auth.onAuthStateChange((_ev, session) => render(session));
  }

  // limpa storage local e também derruba em outros devices/abas
  async function logoutLocal() {
    const sb = await connectSupabase();
    try { await sb.auth.signOut({ scope: "local"  }); } catch {}
    try { await sb.auth.signOut({ scope: "global" }); } catch {}
  }

  async function logoutEverywhere() {
    const sb = await connectSupabase();
    try { await sb.auth.signOut({ scope: "global" }); }
    finally { hardRedirect(_logoutRedirect); }
  }

  function wireLogoutButtons() {
    ["btnOutTop", "btnOutMobile"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("click", async () => { await logoutEverywhere(); });
    });
  }

  function onAuth(cb) { connectSupabase().then((sb)=> sb.auth.onAuthStateChange(cb)); }
  function getUID()   { return _currentUID; }

  // exporta globais
  window.connectSupabase   = connectSupabase;
  window.requireAuth       = requireAuth;
  window.applyAuthUI       = applyAuthUI;
  window.logoutLocal       = logoutLocal;
  window.logoutEverywhere  = logoutEverywhere;
  window.onAuth            = onAuth;
  window.getUID            = getUID;
  window.setLogoutRedirect = setLogoutRedirect;

  // boot imediato
  connectSupabase();
})();
