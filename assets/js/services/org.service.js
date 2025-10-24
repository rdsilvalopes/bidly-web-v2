
/* Bidly • services/org (salvar PF/PJ + endereço) */
window.Bidly = window.Bidly || {};
Bidly.services = Bidly.services || {};

(function(services, repo, masks){
  async function savePF({full_name, cpf, addr}){
    await repo.profiles.upsertPerson({
      full_name,
      cpf_digits: masks.onlyDigits(cpf),
      rg_digits: null,
      phone_country: "+55", phone_area: null, phone_number: null
    });
    await repo.addresses.upsert({
      street: addr.address || addr.street,
      number: addr.number,
      complement: addr.complement,
      state: addr.state, city: addr.city, district: addr.district,
      zip: masks.onlyDigits(addr.zip)
    });
  }
  async function savePJ({legal_name, trade_name, cnpj, addr}){
    // proteção a duplicidade de CNPJ
    try{
      await repo.profiles.upsertCompany({
        legal_name, trade_name: trade_name||null, cnpj_digits: masks.onlyDigits(cnpj)
      });
    }catch(e){
      if(/duplicate key|unique constraint.*cnpj_digits/i.test(String(e.message))){
        const err = new Error("CNPJ já cadastrado."); err.code="CNPJ_DUP"; throw err;
      }
      throw e;
    }
    await repo.addresses.upsert({
      street: addr.address || addr.street,
      number: addr.number,
      complement: addr.complement,
      state: addr.state, city: addr.city, district: addr.district,
      zip: masks.onlyDigits(addr.zip)
    });
  }
  services.org = { savePF, savePJ };
})(Bidly.services, Bidly.repo, Bidly.masks);

