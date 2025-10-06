// /assets/js/app.js — robusto c/ auto-cura de sessão e logout hard
(function () {
  const $ = (id) => document.getElementById(id);

  // 🔒 Pré-hide do modal de papel (evita flash antes da checagem assíncrona)
  try {
    const __mr = document.getElementById("modalRole");
    if (__mr) {
      __mr.classList.add("hide");
      __mr.setAttribute("aria-hidden", "true");
    }
  } catch {}

  document.addEventListener("DOMContentLoaded", boot);

  // -------- Logout hard (limpa tudo e encerra sessão em todas as abas) --------
  async function hardSignOut({ redirect = true } = {}) {
    try {
      await sb?.auth?.signOut?.({ scope: "global" });
    } catch (e) {
      console.warn("[auth] signOut falhou (ok continuar):", e);
    }

    try {
      Object.keys(localStorage)
        .filter((k) => /^sb-.*-auth-token$/.test(k) || k.startsWith("supabase"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}

    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.warn("[auth] limpar caches: ignorado", e);
    }

    if (redirect) location.href = "/index.html";
  }

  window.hardSignOut = hardSignOut;

  // -------- Verificação segura da sessão (auto-cura) --------
  async function safeInitAuth() {
    try {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;

      const session = data?.session ?? null;
      if (!session) {
        location.href = "/index.html";
        return null;
      }

      const uid = session.user?.id;
      const ping = await sb.from("profiles").select("id").eq("id", uid).limit(1);

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
      if (new URLSearchParams(location.search).get("logout") === "1") {
        await hardSignOut();
        return;
      }

      await connectSupabase();
      const session = await safeInitAuth();
      if (!session) return;

      const email = session.user?.email || "—";
      $("userEmail")?.replaceChildren(email);

      document.querySelectorAll("[data-auth]").forEach((el) => {
        el.classList.remove("hide");
        el.removeAttribute("aria-hidden");
      });

      const btnOut = $("btnOutTop") || $("btnSignOut");
      if (btnOut) {
        btnOut.addEventListener("click", async (ev) => {
          ev.preventDefault();
          await hardSignOut();
        });
      }

      // 6) Exibe papel no topo
      await paintUserRole(session);

      // 6.1) Corrige bug: não exibir modalRole se o perfil já tem role
      try {
        const uid = session.user?.id;
        if (uid) {
          const { data: prof, error: e } = await sb
            .from("profiles")
            .select("role")
            .eq("id", uid)
            .maybeSingle();

          if (!e) {
            const role = prof?.role;
            const modalRole = document.getElementById("modalRole");
            if (modalRole) {
              if (role) {
                modalRole.classList.add("hide");
                modalRole.setAttribute("aria-hidden", "true");
              } else {
                modalRole.classList.remove("hide");
                modalRole.setAttribute("aria-hidden", "false");
              }
            }
          }
        }
      } catch (err) {
        console.warn("[modalRole-check] erro ao verificar role:", err);
      }

      // 7) Sair em outra aba → logout global
      sb.auth.onAuthStateChange((evt) => {
        if (evt === "SIGNED_OUT") location.href = "/index.html";
      });

      // 🔹 Inicializa módulo de perfil (dados)
      bindProfileButton();
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

      let { data, error } = await sb
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .limit(1);

      console.log("[role] by id ->", { data, error });

      let role = Array.isArray(data) && data.length ? data[0]?.role : null;

      if (!role) {
        const r2 = await sb
          .from("profiles")
          .select("role")
          .eq("user_id", uid)
          .limit(1);

        console.log("[role] by user_id ->", { data: r2.data, error: r2.error });
        role = Array.isArray(r2.data) && r2.data.length ? r2.data[0]?.role : null;
      }

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

  // ==========================================================
  // 🔹 MÓDULO NOVO — “Dados do Perfil” (Empresa / Fornecedor)
  // ==========================================================
  async function openProfileModal() {
    const modal = $("modalProfile");
    const fields = $("profileFields");
    const { data: userData } = await sb.auth.getUser();
    const user = userData?.user;
    if (!user?.id) return;

    const { data: profile } = await sb
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    fields.innerHTML = "";
    const role = profile.role;

    if (role === "company") {
      fields.innerHTML = `
        <label>Razão Social</label>
        <input id="company_name" value="${profile.company_name ?? ""}" placeholder="Ex: Acme Ltda" />
        <label>CNPJ</label>
        <input id="company_cnpj" value="${profile.company_cnpj ?? ""}" placeholder="00.000.000/0001-00" />
      `;
    } else if (role === "vendor") {
      fields.innerHTML = `
        <label>Nome Público</label>
        <input id="vendor_display_name" value="${profile.vendor_display_name ?? ""}" placeholder="Ex: João Silva" />
        <label>CPF</label>
        <input id="vendor_cpf" value="${profile.vendor_cpf ?? ""}" placeholder="000.000.000-00" />
        <label>LinkedIn (opcional)</label>
        <input id="vendor_linkedin_url" value="${profile.vendor_linkedin_url ?? ""}" placeholder="https://linkedin.com/in/..." />
      `;
    } else {
      fields.innerHTML = `<p style="color:#ccc">Tipo de conta não definido.</p>`;
    }

    modal.classList.remove("hidden");
    $("btnCancelProfile").onclick = () => modal.classList.add("hidden");

    $("formProfile").onsubmit = async (e) => {
      e.preventDefault();

      let updates = {};
      if (role === "company") {
        const name = $("company_name").value.trim();
        const cnpj = $("company_cnpj").value.trim();
        if (!name || !cnpj) return alert("Preencha todos os campos obrigatórios.");
        updates = { company_name: name, company_cnpj: cnpj };
      } else {
        const name = $("vendor_display_name").value.trim();
        const cpf = $("vendor_cpf").value.trim();
        const linkedin = $("vendor_linkedin_url").value.trim();
        if (!name || !cpf) return alert("Preencha nome e CPF.");
        updates = {
          vendor_display_name: name,
          vendor_cpf: cpf,
          vendor_linkedin_url: linkedin,
        };
      }

      updates.checklist_profile_done = true;

      const { error } = await sb.from("profiles").update(updates).eq("id", user.id);
      if (error) return alert("Erro ao salvar: " + error.message);

      alert("Dados salvos com sucesso!");
      modal.classList.add("hidden");
      if (typeof renderChecklist === "function") renderChecklist();
    };
  }

  // 🔸 Atacha o evento do botão “Preencher”
  function bindProfileButton() {
    const btn = document.getElementById("btnProfile");
    if (btn) btn.onclick = openProfileModal;
    else console.warn("⚠️ botão de perfil não encontrado (id=btnProfile)");
  }
})();
