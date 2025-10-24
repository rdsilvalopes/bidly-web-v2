/* Bidly • Admin Lite Pro • login controller (vAL5 – redireciona quando autorizado) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);

  const loginCard = $("#loginCard");
  const loginForm = $("#loginForm");
  const emailEl   = $("#admEmail");
  const passEl    = $("#admPass");
  const btnLogin  = $("#btnLogin");
  const msgEl     = $("#loginMsg");
  const mountEl   = $("#adminApp"); // não usamos nesta página; mantido só por compat.

  const setMsg = (t, k = "") => {
    if (!msgEl) return;
    msgEl.textContent = t || "";
    msgEl.style.display = t ? "" : "none";
    msgEl.className = `u-form__messages ${k || ""}`;
  };
  const show = (el, on) => { if (el) el.classList.toggle("hide", !on); };

  // Estado persistido na aba
  window.Bidly = window.Bidly || {};
  window.Bidly.admin = window.Bidly.admin || {};
  const state = (window.Bidly.admin.state = window.Bidly.admin.state || {
    unsubAuth: null,
  });

  const normRoles = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean);
    return String(raw).split(",").map(s => s.trim()).filter(Boolean);
  };

  async function rpc(sb, name) {
    try {
      const { data, error } = await sb.rpc(name);
      if (error) { console.error(`[admin.login] ${name} error:`, error); return null; }
      return data;
    } catch (e) {
      console.error(`[admin.login] ${name} exception:`, e);
      return null;
    }
  }

  async function readCaps(sb) {
    let roles = normRoles(await rpc(sb, "my_roles"));
    let flags = await rpc(sb, "admin_flags_self");
    flags = Array.isArray(flags) ? flags : [];

    const has = (arr, v) => Array.isArray(arr) && arr.includes(v);
    const isAdmin    = roles.includes("adm.master") || has(flags, "is_admin");
    const isReviewer = roles.includes("adm.review") || has(flags, "is_reviewer");
    const readOnly   = roles.includes("adm.readonly");

    return {
      allowed: isAdmin || isReviewer || readOnly,
      roles, flags,
    };
  }

  // ——————————————————————————————
  // Fluxo correto para LOGIN PAGE:
  // - Sem sessão: mostra cartão de login.
  // - Com sessão sem permissão: mostra cartão + mensagem.
  // - Com sessão e permissão: REDIRECIONA para /admin/index.html
  // ——————————————————————————————
  async function applyAccess(sb) {
    const { data } = await sb.auth.getSession();
    const session = data?.session || null;

    if (!session) {
      show(loginCard, true);
      setMsg("", "");
      return;
    }

    const caps = await readCaps(sb);

    if (!caps.allowed) {
      show(loginCard, true);
      setMsg("Sua conta não possui permissão para acessar o painel administrativo.", "error");
      return;
    }

    // ✅ Autorizado: segue para o painel real
    try { localStorage.setItem("bidly_admin_allowed", "1"); } catch {}
    location.replace("/admin/index.html");
  }

  // submit
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");

    const email = (emailEl?.value || "").trim();
    const pass  =  (passEl?.value || "");
    if (!email || !pass) { setMsg("Preencha e-mail e senha.", "error"); return; }

    btnLogin.disabled = true;
    try {
      const sb = await window.connectSupabase();
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) {
        const m = (error.message || "").toLowerCase();
        if (m.includes("invalid")) setMsg("E-mail ou senha inválidos.", "error");
        else if (m.includes("not confirmed")) setMsg("E-mail ainda não confirmado.", "error");
        else setMsg("Não foi possível entrar. Tente novamente.", "error");
        return;
      }
      // Reavalia e, se autorizado, redireciona
      await applyAccess(await window.connectSupabase());
    } catch (err) {
      console.error("[admin.login] submit fatal:", err);
      setMsg("Erro inesperado. Tente novamente.", "error");
    } finally {
      btnLogin.disabled = false;
    }
  });

  // boot
  (async () => {
    const sb = await window.connectSupabase();

    // Garante reavaliação quando o estado mudar
    if (state.unsubAuth) {
      try { state.unsubAuth.data.subscription.unsubscribe(); } catch {}
    }
    state.unsubAuth = sb.auth.onAuthStateChange(() => {
      clearTimeout(state._tAuth);
      state._tAuth = setTimeout(() => applyAccess(sb), 40);
    });

    await applyAccess(sb);

    // Ao voltar a aba, revalida
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") applyAccess(sb);
    });
  })();
})();
