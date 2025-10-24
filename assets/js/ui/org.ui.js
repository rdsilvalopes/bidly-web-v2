/* Bidly • UI • Dados da organização (PF/PJ) ETAPA 2*/
window.Bidly = window.Bidly || {};
Bidly.ui = Bidly.ui || {};

Bidly.ui.org = (function (C, dom, repo /* services removido do uso */) {
  const $ = dom.$;
  const onlyDigits = (s) => String(s || "").replace(/\D+/g, "").trim();

  // ---------- UI helpers ----------
  function msgBox() { return $("#orgErrors"); }
  function showErrors(items, title) {
    const box = msgBox();
    const ttl = title || "Preencha os campos obrigatórios:";
    if (!box) { alert([ttl, ...items].join("\n")); return; }
    box.innerHTML = `<strong>${ttl}</strong><ul>${items.map(s => `<li>${s}</li>`).join("")}</ul>`;
    box.classList.remove("hide");
  }
  function clearErrors() { const b = msgBox(); if (b) { b.classList.add("hide"); b.innerHTML = ""; } }

  // ---------- render ----------
  const UF = C.UF_LIST || ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
  const ufOptions = () => `<option value="">Selecione</option>${UF.map(u=>`<option value="${u}">${u}</option>`).join("")}`;

  function renderPF(formEl) {
    formEl.innerHTML = `
      <div class="org__grid">
       
        <div class="col-6">
          <label class="label" for="pf_full_name">Nome completo</label>
          <input id="pf_full_name" class="input" placeholder="Ex.: João da Silva" />
        </div>
        <div class="col-6">
          <label class="label" for="pf_cpf">CPF</label>
          <input id="pf_cpf" class="input" placeholder="000.000.000-00" inputmode="numeric" />
        </div>

        <div class="col-3">
          <label class="label" for="addr_state">Estado (UF)</label>
          <select id="addr_state" class="input">${ufOptions()}</select>
        </div>
        <div class="col-6">
          <label class="label" for="addr_city">Cidade</label>
          <input id="addr_city" class="input" placeholder="Cidade" />
        </div>
        <div class="col-3">
          <label class="label" for="addr_district">Bairro</label>
          <input id="addr_district" class="input" placeholder="Ex.: Centro" />
        </div>

        <div class="col-3">
          <label class="label" for="addr_zip">CEP</label>
          <input id="addr_zip" class="input" placeholder="00000-000" inputmode="numeric" />
        </div>
        <div class="col-6">
          <label class="label" for="addr_street">Logradouro</label>
          <input id="addr_street" class="input" placeholder="Rua/Avenida" />
        </div>
        <div class="col-3">
          <label class="label" for="addr_number">Número</label>
          <input id="addr_number" class="input" placeholder="Ex.: 123" />
        </div>

        <div class="col-12">
          <label class="label" for="addr_complement">Complemento</label>
          <input id="addr_complement" class="input" placeholder="Bloco, sala, apto..." />
        </div>

        <div class="actions">
          <span class="spacer"></span>
          <button id="btnOrgCancel" class="btn ghost" type="button">Cancelar</button>
          <button class="btn primary" type="submit">Salvar</button>
        </div>
      </div>
    `;
  }

  function renderPJ(formEl) {
    formEl.innerHTML = `
      <div class="org__grid">
        
        <div class="col-6">
          <label class="label" for="pj_cnpj">CNPJ</label>
          <input id="pj_cnpj" class="input" placeholder="00.000.000/0001-00" inputmode="numeric" />
        </div>
        <div class="col-6">
          <label class="label" for="pj_legal_name">Razão social</label>
          <input id="pj_legal_name" class="input" placeholder="Ex.: Acme Ltda" />
        </div>

        <div class="col-12">
          <label class="label" for="pj_trade_name">Nome fantasia</label>
          <input id="pj_trade_name" class="input" placeholder="Ex.: Acme" />
        </div>

        <div class="col-6">
          <label class="label" for="addr_street">Logradouro</label>
          <input id="addr_street" class="input" placeholder="Rua/Avenida" />
        </div>
        <div class="col-3">
          <label class="label" for="addr_number">Número</label>
          <input id="addr_number" class="input" placeholder="Ex.: 123" />
        </div>
        <div class="col-3">
          <label class="label" for="addr_complement">Complemento</label>
          <input id="addr_complement" class="input" placeholder="Ex.: Bloco B, Sala 402" />
        </div>

        <div class="col-3">
          <label class="label" for="addr_state">Estado (UF)</label>
          <select id="addr_state" class="input">${ufOptions()}</select>
        </div>
        <div class="col-3">
          <label class="label" for="addr_city">Cidade</label>
          <input id="addr_city" class="input" placeholder="Cidade" />
        </div>
        <div class="col-3">
          <label class="label" for="addr_district">Bairro</label>
          <input id="addr_district" class="input" placeholder="Ex.: Centro" />
        </div>
        <div class="col-3">
          <label class="label" for="addr_zip">CEP</label>
          <input id="addr_zip" class="input" placeholder="00000-000" inputmode="numeric" />
        </div>

        <div class="actions">
          <span class="spacer"></span>
          <button id="btnOrgCancel" class="btn ghost" type="button">Cancelar</button>
          <button class="btn primary" type="submit">Salvar</button>
        </div>
      </div>
    `;
  }

  function ensureFormRendered(type) {
    const form = $("#orgForm");
    if (!form) return null;
    if (!form.children.length) {
      if (type === "PF") renderPF(form); else renderPJ(form);
    }
    return form;
  }

  // ---------- leitura/validação ----------
  function readAddress() {
    return {
      country: "BR",
      state: ($("#addr_state")?.value || "").trim(),
      city: ($("#addr_city")?.value || "").trim(),
      district: ($("#addr_district")?.value || "").trim(),
      zip: onlyDigits($("#addr_zip")?.value),
      street: ($("#addr_street")?.value || "").trim(),
      number: ($("#addr_number")?.value || "").trim(),
      complement: ($("#addr_complement")?.value || "").trim(),
    };
  }
  function validateAddress(addr) {
    const missing = [];
    if (!addr.street)   missing.push("Logradouro");
    if (!addr.number)   missing.push("Número");
    if (!addr.state)    missing.push("Estado (UF)");
    if (!addr.city)     missing.push("Cidade");
    if (!addr.district) missing.push("Bairro");
    if (!/^\d{8}$/.test(addr.zip)) missing.push("CEP");
    return missing;
  }

  // Fallback robusto para CNPJ duplicado (mantido)
  async function cnpjJaExiste(cnpjDigits) {
    const fn = Bidly?.repo?.profiles?.existsCompanyByCNPJ;
    if (typeof fn === "function") return await fn(cnpjDigits);

    const sb = await window.connectSupabase();
    const [{ data: { user } }, { data, error }] = await Promise.all([
      sb.auth.getUser(),
      sb.from("company_profiles").select("user_id").eq("cnpj_digits", String(cnpjDigits||"").replace(/\D+/g,"")).limit(1)
    ]);
    if (error) throw error;
    if (!data || !data.length) return false;
    return data[0].user_id !== (user?.id || null);
  }

  // ---------- eventos / máscaras / submit ----------
  function wire(type) {
    clearErrors();
    const form = $("#orgForm");
    const btnCancel = $("#btnOrgCancel");

    // cancelar
    btnCancel?.addEventListener("click", (e) => {
      e.preventDefault();
      if (type === "PF") {
        Bidly.controller.ensureChooser && dom.show(Bidly.controller.ensureChooser());
        dom.hide($("#orgFull"));
      } else {
        location.assign("/");
      }
    });

    // CNPJ: mascara, só números, limite 14 dígitos
    $("#pj_cnpj")?.addEventListener("input", (e) => {
      const d = onlyDigits(e.target.value).slice(0, 14);
      let out = d;
      if (d.length > 2)  out = d.replace(/^(\d{2})(\d+)/, "$1.$2");
      if (d.length > 5)  out = out.replace(/^(\d{2})\.(\d{3})(\d+)/, "$1.$2.$3");
      if (d.length > 8)  out = out.replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d+)/, "$1.$2.$3/$4");
      if (d.length > 12) out = out.replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d{0,2}).*/, "$1.$2.$3/$4-$5");
      e.target.value = out;
    });

    // CPF (PF)
    $("#pf_cpf")?.addEventListener("input", (e) => {
      const d = onlyDigits(e.target.value).slice(0, 11);
      let out = d;
      if (d.length > 3) out = d.replace(/^(\d{3})(\d+)/, "$1.$2");
      if (d.length > 6) out = out.replace(/^(\d{3})\.(\d{3})(\d+)/, "$1.$2.$3");
      if (d.length > 9) out = out.replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d{0,2}).*/, "$1.$2.$3-$4");
      e.target.value = out;
    });

    // CEP e número
    $("#addr_zip")?.addEventListener("input", (e) => {
      const d = onlyDigits(e.target.value).slice(0, 8);
      e.target.value = d.length > 5 ? d.replace(/^(\d{5})(\d{0,3})$/, "$1-$2") : d;
    });
    $("#addr_number")?.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/[^\dA-Za-z]/g, "").slice(0, 12);
    });

    // submit
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors();

      const addr = readAddress();
      const addrMissing = validateAddress(addr);

      try {
        if (type === "PF") {
          const fullName = ($("#pf_full_name")?.value || "").trim();
          const cpf = onlyDigits($("#pf_cpf")?.value);

          const pfMissing = [];
          if (!fullName) pfMissing.push("Nome completo");
          if (cpf.length !== 11) pfMissing.push("CPF (11 dígitos)");
          if (addrMissing.length) pfMissing.push(...addrMissing);
          if (pfMissing.length) return showErrors(pfMissing);

          await ProfileService.saveProfileSelf(await window.connectSupabase(), {
            p_legal_name: fullName,
            p_trade_name: null,
            p_cnpj_digits: null,
            p_street: addr.street,
            p_number: addr.number,
            p_complement: addr.complement || null,
            p_district: addr.district,
            p_city: addr.city,
            p_state: addr.state,
            p_zip: addr.zip
          });
        } else {
          const legalName = ($("#pj_legal_name")?.value || "").trim();
          const tradeName = ($("#pj_trade_name")?.value || "").trim();
          const cnpjDigits = onlyDigits($("#pj_cnpj")?.value);

          const pjMissing = [];
          if (!legalName) pjMissing.push("Razão Social");
          if (cnpjDigits.length !== 14) pjMissing.push("CNPJ (14 dígitos)");
          if (addrMissing.length) pjMissing.push(...addrMissing);
          if (pjMissing.length) return showErrors(pjMissing);

          // Checagem proativa
          const dup = await cnpjJaExiste(cnpjDigits);
          if (dup) return showErrors(["CNPJ já cadastrado"]);

          const sb = await window.connectSupabase();
          const payload = {
            p_legal_name: legalName,
            p_trade_name: tradeName || null,
            p_cnpj_digits: cnpjDigits,
            p_street: addr.street,
            p_number: addr.number,
            p_complement: addr.complement || null,
            p_district: addr.district,
            p_city: addr.city,
            p_state: addr.state,
            p_zip: addr.zip,
          };
          await ProfileService.saveProfileSelf(sb, payload);
        }

        await Bidly.controller.nextStep();
      } catch (err) {
        console.error("[activation] org save", err);

        // CNPJ duplicado (constraint no backend)
        const code = err?.code || err?.status || "";
        const details = String(err?.details || "").toLowerCase();
        if (code === "23505" && details.includes("cnpj_digits")) {
          showErrors(["CNPJ já cadastrado"]);
          $("#pj_cnpj")?.focus();
          return;
        }

        // Fallback genérico
        showErrors(["Não foi possível salvar os dados. Tente novamente."]);
      }
    });
  }

  function open(type) {
    dom.show($("#orgFull"));
    dom.hide($("#termsFull"));
    dom.hide($("#docsFull"));
    ensureFormRendered(type);
    wire(type);
  }

  return { open };
})(Bidly.constants, Bidly.dom, Bidly.repo);
