/* /assets/js/services/progress.service.js
   Bidly • Progress Service (somente snapshot p/ decidir fluxo; sem barra)
   - NÃO usa mais render() nem classes de progresso.
   - Enquanto PF não existir, DOC_TYPE_PF herda o de PJ.
*/
window.Bidly = window.Bidly || {};
Bidly.services = Bidly.services || {};

Bidly.services.progress = (function (C) {
  // IMPORTANTE: sem "pf_id" como default.
  const TYPE_PJ = C.DOC_TYPE_PJ || "company_contract";
  const TYPE_PF = C.DOC_TYPE_PF || TYPE_PJ; // até existir PF de fato

  async function getSB() {
    if (!window.connectSupabase) throw new Error("supa.js não carregado");
    return await window.connectSupabase();
  }

  // Só decide o fluxo (termos/org/docs) consultando o Supabase.
  async function snapshot() {
    const sb = await getSB();
    const { data: { user } } = await sb.auth.getUser();
    if (!user?.id)
      return { terms:false, org:false, docs:false, person:false, company:false };

    const uid  = user.id;
    const snap = { terms:false, org:false, docs:false, person:false, company:false };

    // termos
    const t = await sb.from("terms_acceptances")
      .select("id").eq("user_id", uid).eq("version", C.TERMS_VERSION).limit(1);
    snap.terms = !t.error && (t.data?.length || 0) > 0;

    // org
    const p = await sb.from("person_profiles").select("user_id").eq("user_id", uid).limit(1);
    const c = await sb.from("company_profiles").select("user_id").eq("user_id", uid).limit(1);
    snap.person  = !p.error && (p.data?.length || 0) > 0;
    snap.company = !c.error && (c.data?.length || 0) > 0;
    snap.org = snap.person || snap.company;

    // docs (usa PJ por padrão enquanto PF não existir)
    const docType = snap.company ? TYPE_PJ : TYPE_PF;
    const d = await sb.from("documents")
      .select("status").eq("user_id", uid).eq("type", docType).maybeSingle();
    snap.docs = !d.error && !!d.data && String(d.data.status || "").toLowerCase() === "approved";

    return snap;
  }

  return { snapshot };
})(Bidly.constants);
