// /assets/js/repo.js

// helper interno para pegar o client sempre inicializado
async function getClient() {
  if (!window.sb || !window.sb.auth) {
    // supa.js expõe connectSupabase()
    await connectSupabase();
  }
  return window.sb;
}

// Garante que o profile exista; cria se necessário (id do usuário como PK)
async function getOrCreateMyProfile() {
  const sb = await getClient();
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr) throw userErr;
  const user = userData?.user;
  if (!user?.id) throw new Error("Usuário não autenticado.");

  // tenta selecionar
  let { data: row, error: selErr } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // PGRST116 = no rows; em algumas versões vem status 406/404
  const noRows =
    selErr &&
    (selErr.code === "PGRST116" ||
      selErr.details?.includes("Results contain 0 rows") ||
      selErr.message?.toLowerCase().includes("not found"));

  if (noRows) {
    // cria linha "vazia" para habilitar updates posteriores (RLS: insert próprio)
    const { data: ins, error: insErr } = await sb
      .from("profiles")
      .insert({ id: user.id })
      .select("*")
      .single();
    if (insErr) throw insErr;
    return ins;
  }

  if (selErr) throw selErr;
  return row;
}

// Upsert SEMPRE com id; fecha a porta para erros de update sem linha
async function updateMyProfile(patch) {
  const sb = await getClient();
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr) throw userErr;
  const user = userData?.user;
  if (!user?.id) throw new Error("Usuário não autenticado.");

  // upsert por id — requer policy de insert/update próprio
  const { data, error } = await sb
    .from("profiles")
    .upsert({ id: user.id, ...patch }, { onConflict: "id" })
    .select("id, role, accept_terms_at")
    .single();
  if (error) throw error;
  return data;
}

// API pública do "repo"
window.repo = {
  getOrCreateMyProfile,
  updateMyProfile,
};
