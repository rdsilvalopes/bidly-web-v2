/* Bidly • repo • terms */
window.Bidly = window.Bidly || {};
Bidly.repo = Bidly.repo || {};

Bidly.repo.terms = (function () {
  const TAG = "[terms.repo]";

  async function sbClient() {
    if (!window.connectSupabase) throw new Error(`${TAG} supa.js não carregado`);
    return await window.connectSupabase();
  }

  async function getUserId(sb) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user?.id) throw new Error(`${TAG} usuário não autenticado`);
    return user.id;
  }

  // Já existe aceite desta versão?
  async function has(version) {
    const sb = await sbClient();
    const uid = await getUserId(sb);
    const { data, error } = await sb
      .from("terms_acceptances")
      .select("id")
      .eq("user_id", uid)
      .eq("version", version)
      .limit(1);
    if (error) throw error;
    return (data || []).length > 0;
  }

  // Registra aceite; se já houver (23505), trata como sucesso
  async function accept(version) {
    const sb = await sbClient();
    const uid = await getUserId(sb);
    const now = new Date().toISOString();

    const { error } = await sb
      .from("terms_acceptances")
      .insert({ user_id: uid, version, accepted_at: now });

    if (error) {
      // unique violation (já aceitou) → OK
      if (String(error.code) === "23505") return true;
      throw error;
    }
    return true;
  }

  return { has, accept };
})();
