/* Bidly • Admin • caps.js — carrega e memoiza papéis/capacidades (v1.6)
   Fontes, em ordem:
   1) RPC my_roles() + admin_flags_self() -> roles/flags (preferencial)
   2) RPC rbac_caps_self()                -> { roles:[], caps:[] } (se existir)
   3) public.admins por email             -> roles (mapeia para caps)
   4) profiles.role por id                -> role  (mapeia para caps)
   Retorna { roles: string[], caps: string[] } e memoiza em __ADMIN_ROLES/__ADMIN_CAPS
*/
window.Bidly = window.Bidly || {};
Bidly.admin = Bidly.admin || {};

(function () {
  // Mapa local de capacidades por papel (fonte única da verdade no FE)
  const CAP_MAP = {
    'adm.master':   ['doc.list','doc.view_pdf','doc.review','doc.note.write','doc.approve','doc.reject','admin.manage'],
    'adm.review':   ['doc.list','doc.view_pdf','doc.review','doc.note.write','doc.approve','doc.reject'],
    'adm.readonly': ['doc.list','doc.view_pdf'],
  };

  const uniq = (a) => Array.from(new Set((a || []).filter(Boolean)));
  const normArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);

  // --- Fonte #1: my_roles + admin_flags_self (preferencial)
  async function tryMyRolesAndFlags(sb) {
    try {
      const [r1, r2] = await Promise.allSettled([
        sb.rpc('my_roles'),
        sb.rpc('admin_flags_self'),
      ]);

      const roles = r1.status === 'fulfilled'
        ? uniq(normArr(r1.value?.data).map(String))
        : [];

      const flags = r2.status === 'fulfilled'
        ? uniq(normArr(r2.value?.data).map(String))
        : [];

      if (!roles.length && !flags.length) return null;

      // Deriva roles via flags
      const derived = [];
      if (flags.includes('is_admin') && !roles.includes('adm.master'))  derived.push('adm.master');
      if (flags.includes('is_reviewer') && !roles.includes('adm.review')) derived.push('adm.review');

      const allRoles = uniq([...roles, ...derived]);

      // Mapeia para caps
      let caps = [];
      allRoles.forEach(r => { caps = caps.concat(CAP_MAP[r] || []); });
      return { roles: allRoles, caps: uniq(caps) };
    } catch {
      return null;
    }
  }

  // --- Fonte #2: rbac_caps_self (se existir)
  async function tryRpcCapsSelf(sb) {
    try {
      const { data, error } = await sb.rpc('rbac_caps_self');
      if (error) throw error;

      if (Array.isArray(data)) {
        const roles = uniq(data.map(r => r.role));
        const caps  = uniq(data.map(r => r.cap));
        return { roles, caps };
      }
      const roles = uniq(data?.roles || []);
      const caps  = uniq(data?.caps  || []);
      return { roles, caps };
    } catch {
      return null;
    }
  }

  // --- Fonte #3: public.admins por email (se existir no projeto)
  async function fromPublicAdminsByEmail(sb, email) {
    if (!email) return null;
    try {
      const { data, error } = await sb.from('admins').select('role').eq('email', email);
      if (error) throw error;
      const roles = uniq((data || []).map(r => String(r.role)));
      if (!roles.length) return { roles: [], caps: [] };
      let caps = [];
      roles.forEach(r => { caps = caps.concat(CAP_MAP[r] || []); });
      return { roles, caps: uniq(caps) };
    } catch {
      return null;
    }
  }

  // --- Fonte #4: profiles.role por id
  async function fromProfilesRole(sb, uid) {
    try {
      const { data, error } = await sb.from('profiles').select('role').eq('id', uid).maybeSingle();
      if (error) throw error;
      const role  = data?.role ? String(data.role) : null;
      const roles = role ? [role] : [];
      let caps = [];
      roles.forEach(r => { caps = caps.concat(CAP_MAP[r] || []); });
      return { roles, caps: uniq(caps) };
    } catch {
      return { roles: [], caps: [] };
    }
  }

  async function getCaps(sb, uid, email) {
    // Memo já carregado?
    if (Array.isArray(window.__ADMIN_CAPS) && Array.isArray(window.__ADMIN_ROLES)) {
      return { roles: window.__ADMIN_ROLES, caps: window.__ADMIN_CAPS };
    }

    let out = null;

    // 1) Preferencial: my_roles + admin_flags_self
    out = await tryMyRolesAndFlags(sb);

    // 2) rbac_caps_self (se existir)
    if (!out || (!out.roles?.length && !out.caps?.length)) {
      out = await tryRpcCapsSelf(sb);
    }

    // 3) public.admins por email (se existir)
    if (!out || (!out.roles?.length && !out.caps?.length)) {
      out = await fromPublicAdminsByEmail(sb, email);
    }

    // 4) profiles.role por id
    if (!out || (!out.roles?.length && !out.caps?.length)) {
      out = await fromProfilesRole(sb, uid);
    }

    out = {
      roles: uniq(out?.roles || []),
      caps:  uniq(out?.caps  || []),
    };

    // Memo globais p/ view/hasCap
    window.__ADMIN_ROLES = out.roles;
    window.__ADMIN_CAPS  = out.caps;

    return out;
  }

  // Expor helpers
  Bidly.admin.getCaps = getCaps;
  Bidly.admin.hasCap  = (cap) => Array.isArray(window.__ADMIN_CAPS) && window.__ADMIN_CAPS.includes(cap);
})();
