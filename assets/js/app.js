// /assets/js/app.js — versão estável e direta

(function () {
  const $ = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    try {
      // 1) Conecta Supabase e pega sessão
      await connectSupabase(); // vem do /assets/js/supa.js (já existente)
      const { data: s, error } = await sb.auth.getSession();
      if (error) throw error;

      const session = s?.session ?? null;
      if (!session) {
        console.warn("[app] Sem sessão -> /index.html");
        location.href = "/index.html";
        return;
      }

      // 2) Topo: e-mail
      const email = session.user?.email || "—";
      $("userEmail")?.replaceChildren(email);

      // 3) Mostrar elementos gated por login
      document.querySelectorAll("[data-auth]").forEach((el) => {
        el.classList.remove("hide");
        el.removeAttribute("aria-hidden");
      });

      // 4) Sair
      const btnOut = $("btnOutTop") || $("btnSignOut");
      if (btnOut) {
        btnOut.addEventListener("click", async () => {
          try { await sb.auth.signOut(); } catch {}
          location.href = "/index.html";
        });
      }

      // 5) Perfil
      await paintUserRole(session);

      // 6) Se sair em outra aba, volta para /index
      sb.auth.onAuthStateChange((evt) => {
        if (evt === "SIGNED_OUT") location.href = "/index.html";
      });
    } catch (e) {
      console.error("[app] boot error:", e);
      alert(e?.message || e);
    }
  }

  async function paintUserRole(session) {
    const out = $("userRoleText");
    const setRoleText = (label) => { if (out) out.textContent = " • Perfil: " + label; };

    try {
      const uid = session?.user?.id;
      if (!uid) { setRoleText("—"); return; }

      // ---- Leitura 1: profiles.id = uid (retorna array) ----
      let { data, error } = await sb
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .limit(1);

      console.log("[role] by id ->", { data, error });

      // data aqui é array
      let role = Array.isArray(data) && data.length ? data[0]?.role : null;

      // ---- Leitura 2 (fallback): profiles.user_id = uid ----
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
        role === "company" ? "Empresa" :
        isVendor ? "Fornecedor" : "—";

      console.log("[role] uid=", uid, "role=", role, "label=", label);
      setRoleText(label);
    } catch (e) {
      console.warn("[role] erro ao obter role:", e);
      setRoleText("—");
    }
  }
})();
