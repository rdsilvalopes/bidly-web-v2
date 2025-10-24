(() => {
  const $ = (s, r = document) => r.querySelector(s);

  function ensureRoot() {
    const mountEl = $("#adminApp");
    if (!mountEl) throw new Error("adminApp não encontrado.");
    if (!mountEl.dataset.wired) {
      Bidly.admin.view.mount(mountEl); // cria filtros, tabela, pager, detalhe
      mountEl.dataset.wired = "1";
    }
    return mountEl;
  }

  function computeCapsObject() {
    const has = Bidly.admin.hasCap || (() => false);
    const obj = {
      list:    has("doc.list"),
      review:  has("doc.review"),
      approve: has("doc.approve"),
      reject:  has("doc.reject"),
      viewpdf: has("doc.view_pdf"),
      note:    has("doc.note.write"),
      raw: {
        roles: Array.isArray(window.__ADMIN_ROLES) ? window.__ADMIN_ROLES : [],
        caps:  Array.isArray(window.__ADMIN_CAPS)  ? window.__ADMIN_CAPS  : [],
      },
    };
    window.Bidly = window.Bidly || {};
    window.Bidly.admin = window.Bidly.admin || {};
    window.Bidly.admin.caps = {
      list: !!obj.list,
      review: !!obj.review,
      approve: !!obj.approve,
      reject: !!obj.reject,
      viewpdf: !!obj.viewpdf,
      note: !!obj.note,
      raw: obj.raw,
    };
    return window.Bidly.admin.caps;
  }

  async function loadFirstPage(sb) {
    const caps = computeCapsObject();
    const tbody = $("#admTbody");
    try {
      if (tbody) tbody.innerHTML = Bidly.admin.view.tableSkeleton();
      const { data, error } = await Bidly.admin.view.fetchRows(sb);
      if (error) throw error;
      if (tbody) tbody.innerHTML = Bidly.admin.view.renderTable(data || [], caps);
      Bidly.admin.view.wireTableActions(sb, caps);
    } catch (e) {
      console.error("[admin.boot] list error:", e);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="al-state error">Não foi possível carregar a lista.</div></td></tr>`;
      }
    }
  }

  async function mount() {
    const sb = await window.connectSupabase();
    const { data } = await sb.auth.getSession();
    const uid   = data?.session?.user?.id    || null;
    const email = data?.session?.user?.email || null;

    if (Bidly?.admin?.getCaps) {
      try {
        const out = await Bidly.admin.getCaps(sb, uid, email);
        window.__ADMIN_ROLES = out.roles || [];
        window.__ADMIN_CAPS  = out.caps  || [];
      } catch (e) {
        console.warn("[admin.boot] falha ao carregar caps:", e);
        window.__ADMIN_ROLES = [];
        window.__ADMIN_CAPS  = [];
      }
    }

    ensureRoot();
    computeCapsObject();
    Bidly.admin.view.wireFilters(sb);
    await loadFirstPage(sb);
  }

  window.Bidly = window.Bidly || {};
  window.Bidly.admin = window.Bidly.admin || {};
  window.Bidly.admin.mount = mount;
  window.Bidly.admin.boot  = mount;
})();
