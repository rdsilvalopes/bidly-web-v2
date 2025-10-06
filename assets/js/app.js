// /assets/js/app.js — robusto c/ auto-cura de sessão e logout hard
(function () {
  const $ = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", boot);

  // -------- Logout hard (limpa tudo e encerra sessão em todas as abas) --------
  async function hardSignOut({ redirect = true } = {}) {
    try {
      // sai globalmente (todas as abas/dispositivos desta sessão)
      await sb?.auth?.signOut?.({ scope: "global" });
    } catch (e) {
      console.warn("[auth] signOut falhou (ok continuar):", e);
    }

    // remove tokens do supabase guardados pelo sdk
    try {
      Object.keys(localStorage)
        .filter((k) => /^sb-.*-auth-token$/.test(k) || k.startsWith("supabase"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}

    // limpa caches (PWA/CacheStorage), se houver
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.warn("[auth] limpar caches: ignorado", e);
    }

    // (opcional) se você criou um IndexedDB próprio, apague aqui
    // try { indexedDB.deleteDatabase('seu-db'); } catch {}

    if (redirect) location.href = "/index.html";
  }

  // Exponho para uso eventual no console (emergência)
  window.hardSignOut = hardSignOut;

  // -------- Verificação segura da sessão (auto-cura) --------
  async function safeInitAuth() {
    try {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;

      const session = data?.session ?? null;
      if (!session) {
        // sem sessão -> vai p/ login
        location.href = "/index.html";
        return null;
      }

      // Validação rápida do token com uma consulta autorizada pelo RLS do próprio usuário
      const uid = session.user?.id;
      const ping = await sb
        .from("profiles")
        .select("id")
        .eq("id", uid)
        .limit(1);

      // Se 401/403 ou erro de JWT, limpa e redireciona (cura loop)
      const unauthorized =
        ping.error &&
        (ping.error.status === 401 ||
          ping.error.status === 403 ||
          /jwt|token/i.test(ping.error.message || ""));

      if (unauthorized) {
        console.warn("[auth] token inválido/expirado -> hardSignOut()");
        await hardSignOut({ redirect: true });
        return null;
      }

      return session;
    } catch (e) {
      console.warn("[auth] safeInitAuth falhou, limpando sessão:", e);
      await hardSignOut({ redirect: true });
      return null;
    }
  }

  // -------- Boot do app --------
  async function boot() {
    try {
      // permite forçar logout via URL: /app?logout=1
      if (new URLSearchParams(location.search).get("logout") === "1") {
        await hardSignOut();
        return;
      }

      // 1) Conecta Supabase (vem do /assets/js/supa.js)
      await connectSupabase();

      // 2) Sessão validada (auto-cura se inválida)
      const session = await safeInitAuth();
      if (!session) return; // já redirecionou

      // 3) Topo: e-mail
      const email = session.user?.email || "—";
      $("userEmail")?.replaceChildren(email);

      // 4) Mostrar elementos gated por login
      document.querySelectorAll("[data-auth]").forEach((el) => {
        el.classList.remove("hide");
        el.removeAttribute("aria-hidden");
      });

      // 5) Botão Sair (hard)
      const btnOut = $("btnOutTop") || $("btnSignOut");
      if (btnOut) {
        btnOut.addEventListener("click", async (ev) => {
          ev.preventDefault();
          await hardSignOut();
        });
      }

      // 6) Papel/Perfil do usuário
      await paintUserRole(session);

      // 7) Se sair em outra aba, volta ao login
      sb.auth.onAuthStateChange((evt) => {
        if (evt === "SIGNED_OUT") location.href = "/index.html";
      });
    } catch (e) {
      console.error("[app] boot error:", e);
      alert(e?.message || String(e));
    }
  }

  // -------- UI: exibir papel do usuário --------
  async function paintUserRole(session) {
    const out = $("userRoleText");
    const setRoleText = (label) => {
      if (out) out.textContent = " • Perfil: " + label;
    };

    try {
      const uid = session?.user?.id;
      if (!uid) {
        setRoleText("—");
        return;
      }

      // Leitura 1: profiles.id = uid
      let { data, error } = await sb
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .limit(1);

      console.log("[role] by id ->", { data, error });

      let role = Array.isArray(data) && data.length ? data[0]?.role : null;

      // Fallback: profiles.user_id = uid (se existir coluna)
      if (!role) {
        const r2 = await sb
          .from("profiles")
          .select("role")
          .eq("user_id", uid)
          .limit(1);

        console.log("[role] by user_id ->", { data: r2.data, error: r2.error });
        role = Array.isArray(r2.data) && r2.data.length ? r2.data[0]?.role : null;
      }

      // Normaliza rótulo
      const isVendor = role === "vendor" || role === "supplier";
      const label =
        role === "company" ? "Empresa" : isVendor ? "Fornecedor" : "—";

      console.log("[role] uid=", uid, "role=", role, "label=", label);
      setRoleText(label);
    } catch (e) {
      console.warn("[role] erro ao obter role:", e);
      setRoleText("—");
    }
  }
})();
