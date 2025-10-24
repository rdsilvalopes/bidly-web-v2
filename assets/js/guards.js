// /assets/js/guards.js (unificado, compatível com supa.js v2)
(function () {
  const TAG = '[guards]';
  const REDIR = window.__SUPA_LOGOUT_REDIRECT || '/index.html';
  let subscribed = false;

  function hasRecoveryToken() {
    const h = (location.hash || '').toLowerCase();
    return h.includes('access_token=') && h.includes('type=recovery');
  }

  async function ensureClient() {
    // garante o client do supa.js
    if (window.supa) return window.supa;
    if (typeof window.connectSupabase === 'function') {
      return await window.connectSupabase();
    }
    throw new Error('supa.js não inicializado antes de guards.js');
  }

  // Exige sessão; senão, redireciona para o REDIR (configurado por página)
  async function requireAuth() {
    const sb = await ensureClient();
    const { data, error } = await sb.auth.getSession();
    if (error) {
      console.warn(TAG, 'getSession error:', error);
    }
    const session = data?.session || null;
    if (!session) {
      // usa o mesmo redirect do supa.js
      window.location.replace(REDIR);
      return null;
    }
    return session;
  }

  // Liga listeners de auth uma única vez por página
  async function ensureAuthListeners() {
    const sb = await ensureClient();
    if (subscribed) return;
    subscribed = true;

    sb.auth.onAuthStateChange((event, session) => {
      // fluxo de recuperação de senha (mantém token no hash)
      if (event === 'PASSWORD_RECOVERY' || hasRecoveryToken()) {
        if (hasRecoveryToken()) {
          window.location.href = `/auth/index.html${location.hash}`;
        }
        return;
      }

      if (event === 'SIGNED_OUT' || !session) {
        // derruba esta aba também
        window.location.replace(REDIR);
        return;
      }

      // demais eventos: SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED...
      // aqui não precisamos fazer nada específico; as telas reagem conforme necessário
    });
  }

  // Exporta no global (mesmo contrato anterior)
  window.requireAuth = requireAuth;
  window.ensureAuthListeners = ensureAuthListeners;
})();
