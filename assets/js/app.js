// /assets/js/app.js — boot seguro + Organização (PJ/CPF) + Financeiro (PIX/Conta) (v=ORG13)
(function () {
  const $ = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", boot);

  // ---------- Utils ----------
  function show(el){ if(el){ el.classList.remove("hide"); if(el.setAttribute) el.setAttribute("aria-hidden","false"); } }
  function hide(el){ if(el){ el.classList.add("hide"); if(el.setAttribute) el.setAttribute("aria-hidden","true"); } }
  function escapeHtml(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function onlyDigits(s){ return String(s||"").replace(/\D+/g,""); }
  const trim = (s)=> (s==null ? "" : String(s).trim());

  async function hardSignOut({ redirect=true } = {}) {
    try{ await sb?.auth?.signOut?.({ scope:"global" }); }catch{}
    try{
      Object.keys(localStorage).filter((k)=>/^sb-.*-auth-token$/.test(k)||k.startsWith("supabase")).forEach((k)=>localStorage.removeItem(k));
    }catch{}
    try{
      if("caches" in window){ const keys=await caches.keys(); await Promise.all(keys.map((k)=>caches.delete(k))); }
    }catch{}
    if(redirect) location.href="/index.html";
  }
  window.hardSignOut = hardSignOut;

  async function safeInitAuth(){
    try{
      const { data, error } = await sb.auth.getSession();
      if(error) throw error;
      const session=data?.session ?? null;
      if(!session){ location.href="/index.html"; return null; }
      const uid=session.user?.id;
      const ping=await sb.from("profiles").select("id").eq("id", uid).limit(1);
      const unauthorized=ping.error && (ping.error.status===401 || ping.error.status===403 || /jwt|token/i.test(ping.error.message||""));
      if(unauthorized){ await hardSignOut({ redirect:true }); return null; }
      return session;
    }catch{
      await hardSignOut({ redirect:true });
      return null;
    }
  }

  // ---------- Boot ----------
  async function boot(){
    try{
      if(new URLSearchParams(location.search).get("logout")==="1"){ await hardSignOut(); return; }
      await connectSupabase();

      const session = await safeInitAuth();
      if(!session) return;

      $("userEmail")?.replaceChildren(session.user?.email || "—");
      document.querySelectorAll("[data-auth]").forEach((el)=>{ el.classList.remove("hide"); el.removeAttribute("aria-hidden"); });

      const btnOut = $("btnOutTop") || $("btnSignOut");
      btnOut?.addEventListener("click", async(ev)=>{ ev.preventDefault(); await hardSignOut(); });

      await paintUserRole(session);

      wireRoleChooser(session);
      await toggleRoleModalByProfile(session);

      sb.auth.onAuthStateChange((evt)=>{ if(evt==="SIGNED_OUT") location.href="/index.html"; });

      $("btn-dados")?.addEventListener("click",(ev)=>{ ev.preventDefault(); openOrgModal(); });
      $("btn-fin")?.addEventListener("click",(ev)=>{ ev.preventDefault(); openFinModal(); });

      wireOrgForm();
      wireFinForm();

      window.addEventListener("keyup",(e)=>{ if(e.key==="Escape"){ closeOrgModal(); closeFinModal(); } });
    }catch(e){
      console.error("[app] boot error:", e);
      alert(e?.message || String(e));
    }
  }

  // ---------- Papel no topo ----------
  async function paintUserRole(session){
    const out=$("userRoleText");
    const setRoleText=(label)=>{ if(out) out.textContent=" • Perfil: "+label; };
    try{
      const uid=session?.user?.id;
      if(!uid){ setRoleText("—"); return; }
      let { data } = await sb.from("profiles").select("role").eq("id", uid).limit(1);
      let role = Array.isArray(data)&&data.length ? data[0]?.role : null;
      const isVendor = role==="vendor" || role==="supplier";
      setRoleText(role==="company" ? "Empresa" : isVendor ? "Fornecedor" : "—");
    }catch{ setRoleText("—"); }
  }

  // ==========================================================
  // Escolha de perfil (modalRole)
  // ==========================================================
  function wireRoleChooser(session){
    const modalRole=$("modalRole");
    const btnCompany=$("btnRoleCompany");
    const btnVendor =$("btnRoleVendor");
    if(!modalRole||!btnCompany||!btnVendor) return;
    if(modalRole.dataset.bound==="1") return;
    modalRole.dataset.bound="1";

    const saveRole=async(role)=>{
      try{
        const uid=session?.user?.id;
        if(!uid) return;
        btnCompany.disabled=true; btnVendor.disabled=true;
        const { error } = await sb.from("profiles").update({ role }).eq("id", uid);
        if(error) throw error;
        await paintUserRole(session);
        hide(modalRole);
        try{ await openOrgModal(); }catch{}
      }catch(e){
        alert("Não foi possível salvar seu perfil. Tente novamente.");
      }finally{
        btnCompany.disabled=false; btnVendor.disabled=false;
      }
    };

    btnCompany.addEventListener("click",()=>saveRole("company"));
    btnVendor .addEventListener("click",()=>saveRole("vendor"));
  }

  async function toggleRoleModalByProfile(session){
    try{
      const uid=session.user?.id;
      if(!uid) return;
      const { data: prof } = await sb.from("profiles").select("role").eq("id", uid).maybeSingle();
      const modalRole=$("modalRole");
      if(!modalRole) return;
      if(prof?.role) hide(modalRole); else show(modalRole);
    }catch{}
  }

  // ==========================================================
  // Modal Organização (PJ/CPF)
  // ==========================================================
  let profileCache=null;
  let lockedType=null;

  async function openOrgModal(){
    const modal=$("orgModal");
    if(!modal) return;

    try{
      const { data: s } = await sb.auth.getSession();
      const uid=s?.session?.user?.id;
      if(!uid) throw new Error("Sessão inválida.");
      const { data, error } = await sb
        .from("profiles")
        .select("role, company_name, display_name, document, linkedin_url, profile_review_status")
        .eq("id", uid)
        .maybeSingle();
      if(error) throw error;
      profileCache=data||{};
    }catch(e){ profileCache={}; }

    // trava PJ somente se o perfil já é empresa
    lockedType = (profileCache?.role === "company") ? "PJ" : null;

    setupOrgTypeUI();
    renderOrgFields();

    show(modal);
    document.body.classList.add("modal-open");
  }
  function closeOrgModal(){ const modal=$("orgModal"); if(!modal) return; hide(modal); document.body.classList.remove("modal-open"); }

  function setupOrgTypeUI(){
    const pj=document.querySelector('input[name="org_type"][value="PJ"]');
    const pf=document.querySelector('input[name="org_type"][value="PF"]');
    const pfLabel=pf ? pf.closest("label") : null;

    let initial="PJ";
    const docDigits=onlyDigits(profileCache?.document);
    if(!lockedType){
      if(docDigits.length===11) initial="PF";
      else if(docDigits.length===14) initial="PJ";
      else initial=profileCache?.role==="vendor" ? "PF" : "PJ";
    } else initial="PJ";

    if(pj) pj.checked=initial==="PJ";
    if(pf) pf.checked=initial==="PF";

    if(lockedType==="PJ"){
      if(pf){ pf.checked=false; pf.disabled=true; pf.setAttribute("aria-disabled","true"); if(pfLabel) pfLabel.style.pointerEvents="none"; }
      if(pj) pj.checked=true;
      if(pfLabel) pfLabel.classList.add("is-disabled");
    }else{
      if(pf){ pf.disabled=false; pf.removeAttribute("aria-disabled"); }
      if(pfLabel){ pfLabel.style.pointerEvents=""; pfLabel.classList.remove("is-disabled"); }
    }
  }

  let orgFormWired=false;
  function wireOrgForm(){
    if(orgFormWired) return;
    orgFormWired=true;

    const form=$("orgForm");
    const cancel=$("btnOrgCancel");
    const xClose=$("orgClose");

    form?.addEventListener("change",(e)=>{
      const t=e.target;
      if(t && t.name==="org_type"){
        if(lockedType==="PJ"){ setupOrgTypeUI(); return; }
        renderOrgFields();
        applyReadOnlyUI();
      }
    });

    cancel?.addEventListener("click",(e)=>{ e.preventDefault(); closeOrgModal(); });
    xClose?.addEventListener("click",(e)=>{ e.preventDefault(); closeOrgModal(); });

    form?.addEventListener("submit", async(e)=>{ e.preventDefault(); await submitOrgData(); });
  }

  function currentOrgType(){ const sel=document.querySelector('input[name="org_type"]:checked'); return sel?.value==="PF" ? "PF" : "PJ"; }
  function noiseName(prefix){ return `${prefix}_${Math.random().toString(36).slice(2,8)}`; }

  function renderOrgFields(){
    const box=$("orgFields");
    const hint=$("orgHint");
    if(!box) return;

    const doc=String(profileCache?.document || "");
    const docDigits=onlyDigits(doc);

    if(currentOrgType()==="PJ"){
      const company_name=profileCache?.company_name || "";
      const trade_name  =profileCache?.display_name || "";
      const cnpj        =docDigits.length===14 ? doc : "";
      box.innerHTML=`
        <label>Razão social</label>
        <input id="org_company_name" autocomplete="off" name="${noiseName("company")}" placeholder="Ex.: Acme Ltda" value="${escapeHtml(company_name)}" />
        <label>Nome fantasia (opcional)</label>
        <input id="org_trade_name" autocomplete="off" name="${noiseName("trade")}" placeholder="Ex.: Acme" value="${escapeHtml(trade_name)}" />
        <label>CNPJ</label>
        <input id="org_document" autocomplete="off" inputmode="numeric" name="${noiseName("cnpj")}" placeholder="00.000.000/0001-00" value="${escapeHtml(cnpj)}" />
      `;
      if(hint) hint.textContent="Pessoa Jurídica: enviaremos para análise após o envio.";
    }else{
      const display_name=profileCache?.display_name || "";
      const cpf         =docDigits.length===11 ? doc : "";
      const linkedin    =profileCache?.linkedin_url || "";
      box.innerHTML=`
        <label>Nome completo</label>
        <input id="org_display_name" autocomplete="off" name="${noiseName("name")}" placeholder="Ex.: João da Silva" value="${escapeHtml(display_name)}" />
        <label>CPF</label>
        <input id="org_document" autocomplete="off" inputmode="numeric" name="${noiseName("cpf")}" placeholder="000.000.000-00" value="${escapeHtml(cpf)}" />
        <label>LinkedIn (opcional)</label>
        <input id="org_linkedin_url" autocomplete="off" name="${noiseName("linkedin")}" placeholder="https://linkedin.com/in/..." value="${escapeHtml(linkedin)}" />
      `;
      if(hint) hint.textContent="Fornecedor PF: aprovação automática nesta etapa.";
    }

    applyReadOnlyUI();
  }

  function applyReadOnlyUI(){
    const form=$("orgForm"); if(!form) return;
    const docDigits=onlyDigits(profileCache?.document);
    const isCompany=profileCache?.role==="company";
    const pjSubmitted=isCompany && (docDigits.length===14 || !!profileCache?.company_name);
    const pfSubmitted=profileCache?.role==="vendor" && !!profileCache?.display_name && docDigits.length===11;
    const readOnly=pjSubmitted || pfSubmitted;

    const btn=$("btnOrgSubmit");
    const btnCancel=$("btnOrgCancel");
    if(btn){
      btn.textContent = readOnly ? "Fechar" : (isCompany ? "Enviar para análise" : "Salvar");
      btn.type = readOnly ? "button" : "submit";
      btn.onclick = readOnly ? () => closeOrgModal() : null;
      btn.removeAttribute("disabled"); btn.classList.remove("is-disabled");
    }
    if(btnCancel){ btnCancel.removeAttribute("disabled"); btnCancel.classList.remove("is-disabled"); }

    const inputs=form.querySelectorAll("input, select, textarea, fieldset");
    inputs.forEach((el)=>{
      if(el.id==="btnOrgSubmit"||el.id==="btnOrgCancel"||el.id==="orgClose") return;
      if(readOnly){ el.setAttribute("disabled","true"); el.setAttribute("aria-disabled","true"); }
      else{ el.removeAttribute("disabled"); el.removeAttribute("aria-disabled"); }
    });
  }

  async function submitOrgData(){
    let type=currentOrgType();
    if(lockedType==="PJ") type="PJ";
    const btn=$("btnOrgSubmit"); if(btn){ btn.setAttribute("disabled","true"); btn.classList.add("is-disabled"); }

    try{
      const { data: s } = await sb.auth.getSession();
      const uid=s?.session?.user?.id;
      if(!uid) throw new Error("Sessão inválida.");

      let patch={};
      if(type==="PJ"){
        const company_name=$("org_company_name")?.value?.trim();
        const trade_name  =$("org_trade_name")?.value?.trim();
        const documentId  =$("org_document")?.value?.trim();
        if(!company_name || !documentId) throw new Error("Preencha Razão social e CNPJ.");
        patch={ role:"company", company_name, display_name: trade_name || null, document: documentId, profile_review_status:"pending" };
      }else{
        const display_name=$("org_display_name")?.value?.trim();
        const documentId  =$("org_document")?.value?.trim();
        const linkedin_url=$("org_linkedin_url")?.value?.trim();
        if(!display_name || !documentId) throw new Error("Preencha Nome e CPF.");
        patch={ role:"vendor", display_name, document: documentId, linkedin_url: linkedin_url || null, profile_review_status:"approved" };
      }

      const upd=await sb.from("profiles").update(patch).eq("id", uid);
      if(upd.error){ alert("Supabase recusou a atualização do profile (ver RLS/Policies)."); return; }

      alert(type==="PJ" ? "Dados enviados para análise." : "Dados salvos.");
      closeOrgModal();
      try{ await window.renderChecklist?.(); }catch{}
    }catch(e){
      alert(e?.message || "Erro ao salvar.");
    }finally{
      if(btn){ btn.removeAttribute("disabled"); btn.classList.remove("is-disabled"); }
    }
  }

  // ==========================================================
  // Modal Financeiro (PIX/Conta)
  // ==========================================================
  async function openFinModal(){
    const modal=$("finModal");
    if(!modal) return;

    try{
      const { data: s } = await sb.auth.getSession();
      const uid=s?.session?.user?.id;
      if(!uid) throw new Error("Sessão inválida.");
      const { data, error } = await sb.from("profiles").select("role,pix_key,bank_account").eq("id", uid).maybeSingle();
      if(error) throw error;

      if(data?.role==="company"){ alert("Para Empresas, o financeiro é concluído automaticamente."); return; }

      $("fin_pix_key").value = data?.pix_key || "";

      const ba=data?.bank_account || {};
      $("fin_bank_code").value      = ba.bank_code || "";
      $("fin_account_type").value   = ba.account_type || "";
      $("fin_agency").value         = ba.agency || "";
      $("fin_agency_dv").value      = ba.agency_dv || "";
      $("fin_account").value        = ba.account || "";
      $("fin_account_dv").value     = ba.account_dv || "";
      $("fin_holder_name").value    = ba.holder_name || "";
      $("fin_holder_document").value= ba.holder_document || "";

      const openBank=!!ba && !!ba.bank_code;
      switchFinTab(openBank ? "bank" : "pix");

    }catch{}
    show(modal);
    document.body.classList.add("modal-open");
  }
  function closeFinModal(){ const modal=$("finModal"); if(!modal) return; hide(modal); document.body.classList.remove("modal-open"); }

  function switchFinTab(which){
    const tabPix=$("finTabPix"), tabBank=$("finTabBank");
    const secPix=$("finSecPix"), secBank=$("finSecBank");
    if(!tabPix||!tabBank||!secPix||!secBank) return;
    const openPix=which==="pix";
    secPix.classList.toggle("hide", !openPix);
    secBank.classList.toggle("hide", openPix);
    tabPix.setAttribute("aria-selected", openPix ? "true":"false");
    tabBank.setAttribute("aria-selected", !openPix ? "true":"false");
  }

  let finFormWired=false;
  function wireFinForm(){
    if(finFormWired) return;
    finFormWired=true;

    const form=$("finForm");
    const btnCancel=$("btnFinCancel");
    const xClose=$("finClose");

    $("finTabPix")?.addEventListener("click",()=>switchFinTab("pix"));
    $("finTabBank")?.addEventListener("click",()=>switchFinTab("bank"));

    btnCancel?.addEventListener("click",(e)=>{ e.preventDefault(); closeFinModal(); });
    xClose?.addEventListener("click",(e)=>{ e.preventDefault(); closeFinModal(); });

    form?.addEventListener("submit", async(e)=>{
      e.preventDefault();
      const btn=$("btnFinSave");
      try{
        btn.disabled=true; btn.classList.add("is-disabled");

        const pix=trim($("fin_pix_key")?.value);

        const bank_code      = trim($("fin_bank_code")?.value);
        const account_type   = trim($("fin_account_type")?.value);
        const agency         = trim($("fin_agency")?.value);
        const agency_dv      = trim($("fin_agency_dv")?.value);
        const account        = trim($("fin_account")?.value);
        const account_dv     = trim($("fin_account_dv")?.value);
        const holder_name    = trim($("fin_holder_name")?.value);
        const holder_document= trim($("fin_holder_document")?.value);

        const bank_account = (bank_code || account_type || agency || account || holder_name || holder_document) ? {
          bank_code,
          bank_name: bankNameFromCode(bank_code),
          account_type,
          agency,
          agency_dv,
          account,
          account_dv,
          holder_name,
          holder_document,
        } : null;

        const hasPix = !!pix;
        const hasBank = !!bank_account && bank_account.bank_code && bank_account.account_type && bank_account.agency && bank_account.account && bank_account.holder_name && bank_account.holder_document;

        if(!hasPix && !hasBank){ alert("Informe uma Chave PIX ou todos os campos obrigatórios da Conta."); return; }

        const { data: s } = await sb.auth.getSession();
        const uid=s?.session?.user?.id;
        if(!uid) throw new Error("Sessão inválida.");

        const upd=await sb.from("profiles").update({
          pix_key: hasPix ? pix : null,
          bank_account: hasBank ? bank_account : null
        }).eq("id", uid);
        if(upd.error) throw upd.error;

        alert("Dados financeiros salvos.");
        closeFinModal();
        try{ await window.renderChecklist?.(); }catch{}
      }catch(err){
        console.error(err);
        alert("Não foi possível salvar seus dados financeiros.");
      }finally{
        const btn2=$("btnFinSave"); btn2.disabled=false; btn2.classList.remove("is-disabled");
      }
    });
  }

  function bankNameFromCode(code){
    const map = { "001":"Banco do Brasil","237":"Bradesco","341":"Itaú","104":"Caixa","260":"Nubank","212":"Original","033":"Santander" };
    return map[code] || null;
  }

  window.openFinModal = openFinModal;
  window.closeFinModal = closeFinModal;
})();
