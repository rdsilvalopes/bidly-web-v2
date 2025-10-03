// /assets/js/guards.js
(function () {
  function hasRecoveryToken() {
    const h = (location.hash || "").toLowerCase();
    return h.includes("access_token=") && h.includes("type=recovery");
  }

  // /assets/js/guards.js
  (function () {
    async function requireAuth() {
      await connectSupabase();
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session) {
        window.location.href = "/index.html";
        return null;
      }
      return session;
    }
    window.requireAuth = requireAuth;
  })();

  // Um único subscription por página
  let subscribed = false;
  async function ensureAuthListeners() {
    await connectSupabase();
    if (subscribed) return;
    subscribed = true;

    sb.auth.onAuthStateChange((event) => {
      // Só redireciona para /auth se REALMENTE vier com token de recovery
      if (event === "PASSWORD_RECOVERY" || hasRecoveryToken()) {
        if (hasRecoveryToken()) {
          // carrega a página de reset PRESERVANDO o hash (o token)
          window.location.href = `/auth/index.html${location.hash}`;
        }
        return; // sem token? não faz nada (evita loop)
      }

      if (event === "SIGNED_OUT") {
        window.location.href = "/index.html";
      }
    });
  }

  // expõe no global
  window.requireAuth = requireAuth;
  window.ensureAuthListeners = ensureAuthListeners;
})();
