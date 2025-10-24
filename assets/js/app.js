/* assets/js/app.js — núcleo do site (seguro, sem modais) • v3.1.3
   - Usa window.connectSupabase() do supa.js
   - Topbar (email/role), logout, unhide de [data-auth]
   - IMPORTANTE: NÃO interfere no fluxo de ATIVAÇÃO
*/
(function () {
  const TAG = "[app]";

  const $id = (id) => document.getElementById(id);
  const unhideAuthBlocks = () => {
    document.querySelectorAll("[data-auth]").forEach((el) => {
      el.classList.remove("hide");
      el.removeAttribute("aria-hidden");
    });
  };

  // --------- descoberta (fallback) ----------
  function discoverSupabaseKeys() {
    let url = window.SUPABASE_URL || window.__SUPABASE_URL || null;
    let key = window.SUPABASE_ANON_KEY || window.__SUPABASE_ANON_KEY || null;

    if (!url || !key) {
      const mUrl = document.querySelector('meta[name="supabase-url"]');
      const mKey = document.querySelector('meta[name="supabase-key"]');
      if (mUrl?.content) url = url || mUrl.content.trim();
      if (mKey?.content) key = key || mKey.content.trim();
    }
    if (!url || !key) {
      const s = document.querySelector('script[data-supabase-url][data-supabase-key]');
      if (s) {
        url = url || String(s.dataset.supabaseUrl || "").trim();
        key = key || String(s.dataset.supabaseKey || "").trim();
      }
    }
    if (!url || !key) {
      const env = window.env || window.__ENV || {};
      if (env.SUPABASE_URL) url = url || String(env.SUPABASE_URL).trim();
      if (env.SUPABASE_ANON_KEY) key = key || String(env.SUPABASE_ANON_KEY).trim();
    }
    if (!url || !key) {
      try {
        const lsUrl = localStorage.getItem("dev.supabase.url");
        const lsKey = localStorage.getItem("dev.supabase.key");
        if (lsUrl) url = url || lsUrl.trim();
        if (lsKey) key = key || lsKey.trim();
      } catch {}
    }
    return { url, key };
  }

  // --------- Supabase client ----------
  async function createClient() {
    if (typeof window.connectSupabase === "function") {
      const cli = await window.connectSupabase();
      if (!cli) throw new Error("connectSupabase() não retornou client.");
      window.__sb = cli; window.sb = cli;
      return cli;
    }
    if (window.__sb) return window.__sb;
    if (!window.supabase) throw new Error("Supabase SDK não encontrado.");
    const { url, key } = discoverSupabaseKeys();
    if (!url || !key) {
      console.error(`${TAG} Chaves do Supabase ausentes.`);
      location.href = "/auth/index.html";
      return new Promise(() => {});
    }
    window.__sb = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    window.sb = window.__sb;
    return window.__sb;
  }
  window.connectSupabase = window.connectSupabase || (async function connectSupabase(){ return createClient(); });

  // --------- Logout forte ----------
  async function hardSignOut({ redirect = true } = {}) {
    try { await window.__sb?.auth?.signOut?.({ scope: "global" }); } catch {}
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
    } catch {}
    if (redirect) location.href = "/index.html";
  }
  window.hardSignOut = hardSignOut;

  // --------- Sessão segura ----------
  async function safeInitAuth() {
    const sb = await createClient();
    try {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      const session = data?.session ?? null;
      if (!session) { location.href = "/index.html"; return null; }

      const uid = session.user?.id;
      const ping = await sb.from("profiles").select("id").eq("id", uid).limit(1);
      const unauthorized = ping.error && (ping.error.status === 401 || ping.error.status === 403 || /jwt|token/i.test(ping.error.message || ""));
      if (unauthorized) { await hardSignOut({ redirect: true }); return null; }
      return session;
    } catch {
      await hardSignOut({ redirect: true });
      return null;
    }
  }

  // --------- Topbar ----------
  async function paintUser(session) {
    try { const emailOut = $id("userEmail"); if (emailOut) emailOut.textContent = session?.user?.email || "—"; } catch {}
    try {
      const sb = await createClient();
      const out = $id("userRoleText");
      const setRole = (label) => { if (out) out.textContent = " • Perfil: " + label; };

      const uid = session?.user?.id;
      if (!uid) { setRole("—"); return; }

      let role = session.user?.app_metadata?.role || session.user?.user_metadata?.role || null;
      if (!role) {
        const { data } = await sb.from("profiles").select("role").eq("id", uid).maybeSingle();
        role = data?.role || null;
      }
      const isVendor = role === "vendor" || role === "supplier";
      setRole(role === "company" ? "Empresa" : isVendor ? "Fornecedor" : "—");
    } catch {
      const out = $id("userRoleText"); if (out) out.textContent = " • Perfil: —";
    }
  }

  // --------- Logout buttons ----------
  function wireLogoutButtons() {
    const hooks = [
      $id("btnOutTop"),
      $id("btnSignOut"),
      document.querySelector('[data-action="logout"]'),
      document.querySelector(".btn-logout"),
      document.querySelector("#btnLogout"),
    ].filter(Boolean);
    hooks.forEach((btn) => btn.addEventListener("click", async (e) => { e.preventDefault(); await hardSignOut(); }));
  }

  // ======== APP: formulário (somente no APP, NUNCA na ativação) ========
  function isActivationFlow() {
    // No fluxo de ativação sempre existem estes contêineres (mesmo escondidos)
    return !!(document.getElementById("termsFull") || document.getElementById("orgFull") || document.getElementById("docsFull"));
  }

  async function wireAppOrgForm() {
    // Se for tela de ativação, sai — org.ui.js cuida disso.
    if (isActivationFlow()) return;

    const sb = await window.connectSupabase();
    const $  = (s, r = document) => r.querySelector(s);

    // Este bloco é para a página APP que possui um #orgForm próprio.
    const form       = $('#orgForm');
    if (!form) return; // não há formulário do APP nesta página

    const legalName  = $('#legal_name');
    const tradeName  = $('#trade_name');
    const street     = $('#street');
    const number     = $('#number');
    const complement = $('#complement');
    const district   = $('#district');
    const city       = $('#city');
    const uf         = $('#state');
    const zip        = $('#zip');

    function paint(cp, addr) {
      if (cp) {
        if (legalName) legalName.value = cp.legal_name || '';
        if (tradeName) tradeName.value = cp.trade_name || '';
      }
      if (addr) {
        if (street)     street.value     = addr.street     || '';
        if (number)     number.value     = addr.number     || '';
        if (complement) complement.value = addr.complement || '';
        if (district)   district.value   = addr.district   || '';
        if (city)       city.value       = addr.city       || '';
        if (uf)         uf.value         = addr.state      || '';
        if (zip)        zip.value        = addr.zip        || '';
      }
    }

    try {
      const { profile, address } = await window.ProfileService.loadProfile(sb);
      paint(profile, address);
    } catch (err) {
      // Se não houver linhas ainda, ProfileService já loga como warn.
      console.warn('[app] loadProfile error:', err);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const { data: sess } = await sb.auth.getSession();
      if (!sess || !sess.session) { alert('Faça login primeiro.'); return; }

      // OBS: No APP não enviamos CNPJ (o RPC permite update sem CNPJ quando já existe).
      const payload = {
        p_legal_name:  legalName?.value?.trim()  || null,
        p_trade_name:  tradeName?.value?.trim()  || null,
        p_street:      street?.value?.trim()     || null,
        p_number:      number?.value?.trim()     || null,
        p_complement:  complement?.value?.trim() || null,
        p_district:    district?.value?.trim()   || null,
        p_city:        city?.value?.trim()       || null,
        p_state:       uf?.value?.trim()         || null,
        p_zip:         zip?.value?.trim()        || null,
      };

      try {
        await window.ProfileService.saveProfileSelf(sb, payload);
        alert('Dados salvos!');
        const { profile, address } = await window.ProfileService.loadProfile(sb);
        paint(profile, address);
      } catch (error) {
        console.error('[app] update_company_profile_self error:', error);
        alert(error.message || 'Não foi possível salvar.');
      }
    });
  }
  // ======== FIM APP ========

  // --------- Boot ----------
  async function boot() {
    try {
      if (new URLSearchParams(location.search).get("logout") === "1") { await hardSignOut(); return; }

      await createClient();
      const session = await safeInitAuth();
      if (!session) return;

      unhideAuthBlocks();
      await paintUser(session);
      wireLogoutButtons();

      // Só liga o formulário do APP (não-ativação)
      await wireAppOrgForm();

      window.__sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_OUT") location.href = "/index.html"; });
    } catch (e) {
      console.error(TAG, "boot error:", e);
      unhideAuthBlocks();
      const out = $id("userRoleText"); if (out) out.textContent = " • Perfil: —";
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
