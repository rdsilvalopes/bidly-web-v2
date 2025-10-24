/* Bidly • repo • profiles (PF/PJ) */
window.Bidly = window.Bidly || {};
Bidly.repo = Bidly.repo || {};

Bidly.repo.profiles = (function () {
  const TAG = "[profiles.repo]";

  async function sb() {
    if (!window.connectSupabase) throw new Error(`${TAG} supa.js não carregado`);
    return window.connectSupabase();
  }

  async function currentUserId(supa) {
    const { data: { user } } = await supa.auth.getUser();
    return user?.id || null;
  }

  // ---------- PERSON ----------
  async function getPerson() {
    const supa = await sb();
    const uid = await currentUserId(supa);
    if (!uid) return null;
    const { data, error } = await supa
      .from("person_profiles")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();
    if (error && error.code !== "PGRST116") throw error;
    return data || null;
  }

  async function upsertPerson(patch) {
    const supa = await sb();
    const uid = await currentUserId(supa);
    const row = Object.assign({ user_id: uid }, patch);
    const { error } = await supa
      .from("person_profiles")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw error;
  }

  // ---------- COMPANY ----------
  async function getCompany() {
    const supa = await sb();
    const uid = await currentUserId(supa);
    if (!uid) return null;
    const { data, error } = await supa
      .from("company_profiles")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();
    if (error && error.code !== "PGRST116") throw error;
    return data || null;
  }

  async function upsertCompany(patch) {
    const supa = await sb();
    const uid = await currentUserId(supa);
    const row = Object.assign({ user_id: uid }, patch);
    const { error } = await supa
      .from("company_profiles")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw error;
  }

  /**
   * Verifica se já existe OUTRO usuário com o mesmo CNPJ.
   * Retorna true se existir (e não for o usuário atual).
   */
  async function existsCompanyByCNPJ(cnpjDigits) {
    const supa = await sb();
    const { data: { user } } = await supa.auth.getUser();
    const uid = user?.id || null;

    const clean = String(cnpjDigits || "").replace(/\D+/g, "");
    if (!clean) return false;

    const { data, error } = await supa
      .from("company_profiles")
      .select("user_id")
      .eq("cnpj_digits", clean)
      .limit(1);

    if (error) throw error;
    if (!data || !data.length) return false;

    // true somente se pertence a OUTRO usuário
    return data[0].user_id !== uid;
  }

  return {
    getPerson,
    upsertPerson,
    getCompany,
    upsertCompany,
    existsCompanyByCNPJ
  };
})();
