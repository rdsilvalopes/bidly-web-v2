/* Bidly • repo • addresses (sem dependências cruzadas) */
window.Bidly = window.Bidly || {};
Bidly.repo = Bidly.repo || {};

Bidly.repo.addresses = (function () {
  const TAG = "[addresses.repo]";

  async function sb() {
    if (!window.connectSupabase) throw new Error(`${TAG} supa.js não carregado`);
    return await window.connectSupabase();
  }

  async function uid() {
    const client = await sb();
    const { data: { session } } = await client.auth.getSession();
    const id = session?.user?.id;
    if (!id) throw new Error(`${TAG} sem sessão`);
    return id;
  }

  /** Lê o endereço do usuário logado (ou null). */
  async function get() {
    const client = await sb();
    const userId = await uid();
    const { data, error } = await client
      .from("addresses")
      .select("*")
      .eq("owner_user_id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") throw error;
    return data || null;
  }

  /**
   * Upsert de endereço do usuário logado.
   * Campos esperados em `addr`: { country, state, city, district, zip, street, number, complement }
   */
  async function upsert(addr) {
    const client = await sb();
    const userId = await uid();

    const row = {
      owner_user_id: userId,
      country: addr.country || "BR",
      state: addr.state || null,
      city: addr.city || null,
      district: addr.district || null,
      zip: addr.zip || null,
      street: addr.street || null,
      number: addr.number || null,
      complement: addr.complement || null,
    };

    // Tenta upsert por owner_user_id
    const res = await client.from("addresses").upsert(row, { onConflict: "owner_user_id" });

    if (res.error) {
      // Se o banco não tiver a constraint/índice ainda, faz fallback manual
      const existing = await get().catch(() => null);
      if (existing) {
        const { error } = await client
          .from("addresses")
          .update(row)
          .eq("owner_user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await client.from("addresses").insert(row);
        if (error) throw error;
      }
    }
    return true;
  }

  return { get, upsert };
})();
