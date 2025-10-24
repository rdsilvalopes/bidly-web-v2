/* Bidly • repo • profiles (PF/PJ) — SOMENTE RPC (sem SELECT direto) */
window.Bidly = window.Bidly || {};
Bidly.repo = Bidly.repo || {};

Bidly.repo.profiles = (function () {
  const TAG = "[profiles.repo]";

  async function sb() {
    if (!window.connectSupabase) throw new Error(`${TAG} supa.js não carregado`);
    return window.connectSupabase();
  }

  // ---------- PERSON ----------
  async function getPerson() {
    // (mantido como estava; se também tiver RLS fechado na sua tabela, troque por RPC)
    const supa = await sb();
    const { data: { user } } = await supa.auth.getUser();
    if (!user?.id) return null;
    const { data, error } = await supa
      .from("person_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error && error.code !== "PGRST116") throw error;
    return data || null;
  }

  async function upsertPerson(patch) {
    const supa = await sb();
    const { data: { user } } = await supa.auth.getUser();
    if (!user?.id) throw new Error(`${TAG} sem usuário`);
    const row = Object.assign({ user_id: user.id }, patch);
    const { error } = await supa.from("person_profiles").upsert(row, { onConflict: "user_id" });
    if (error) throw error;
  }

  // ---------- COMPANY (via RPC) ----------
  /** Lê o perfil da empresa do usuário atual via RPC (sem SELECT em tabelas). */
  async function getCompany() {
    const supa = await sb();
    const { data, error } = await supa.rpc("user_get_company_profile");
    if (error) throw error;
    // RPC retorna uma linha (ou null). Normaliza:
    return Array.isArray(data) ? (data[0] || null) : (data || null);
  }

  /** Upsert do perfil da empresa SELF — chama a RPC única de escrita. */
  async function upsertCompany({ legal_name, trade_name, cnpj_digits }) {
    const supa = await sb();
    const body = {
      p_legal_name:  legal_name ?? null,
      p_trade_name:  trade_name ?? null,
      p_cnpj_digits: cnpj_digits ?? null,
      // endereço é salvo por outro fluxo (endereços.repo / RPC de endereço)
      p_street:      null, p_number: null, p_complement: null,
      p_district:    null, p_city: null, p_state: null, p_zip: null,
    };
    const { error } = await supa.rpc("update_company_profile_self", body);
    if (error) throw error;
    return true;
  }

  /**
   * Verificação proativa de CNPJ.
   * Não faz SELECT em tabelas para não quebrar RLS; deixe o backend
   * aplicar a UNIQUE e trate 23505 no UI.
   */
  async function existsCompanyByCNPJ(_cnpjDigits) {
    // Mantemos retorno conservador: não acusar duplicidade aqui.
    // O UI trata 23505 ("cnpj_digits") na tentativa de salvar.
    return false;
  }

  return {
    getPerson,
    upsertPerson,

    getCompany,
    upsertCompany,
    existsCompanyByCNPJ, // mantido para compat; não consulta tabela
  };
})();
