/* /assets/js/services/profile.service.js
   Bidly • Profile Service (salva via RPC segura)
   - Escreve SEMPRE por public.update_company_profile_self
   - Não toca tabela diretamente
*/

window.ProfileService = (function () {
  const RPC_NAME = "update_company_profile_self";

  function _norm(s) {
    return (s === undefined || s === null) ? null : String(s).trim();
  }

  async function saveProfileSelf(sb, payload) {
    if (!sb?.rpc) throw new Error("Supabase client inválido");

    // Normaliza e aplica defaults (todos opcionais para UPDATE parcial)
    const args = {
      p_legal_name:  _norm(payload.p_legal_name),
      p_trade_name:  _norm(payload.p_trade_name),
      p_cnpj_digits: _norm(payload.p_cnpj_digits),
      p_street:      _norm(payload.p_street),
      p_number:      _norm(payload.p_number),
      p_complement:  _norm(payload.p_complement),
      p_district:    _norm(payload.p_district),
      p_city:        _norm(payload.p_city),
      p_state:       _norm(payload.p_state),
      p_zip:         _norm(payload.p_zip),
    };

    // Chama a RPC (POST /rest/v1/rpc/update_company_profile_self)
    const { error } = await sb.rpc(RPC_NAME, args);

    // Tratamento de erros comuns de PostgREST
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const code = String(error.code || "");

      // Cache de schema desatualizado
      if (code.startsWith("PGRST20") || msg.includes("schema cache")) {
        // dica: recarregar schema no servidor; para o cliente, tentamos 1 retry rápido
        try {
          await new Promise(r => setTimeout(r, 250));
          const retry = await sb.rpc(RPC_NAME, args);
          if (!retry.error) return true;
        } catch (_) { /* noop */ }
      }

      // Propaga erro (org.ui.js mostra mensagem amigável)
      throw error;
    }

    return true;
  }

  return { saveProfileSelf };
})();
