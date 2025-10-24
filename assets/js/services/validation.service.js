
/* Bidly • services/validation */
window.Bidly = window.Bidly || {};
Bidly.services = Bidly.services || {};

(function(services, masks){
  function valAddress(a){
    const missing = [];
    if(!a.street && !a.address) missing.push("Logradouro");
    if(!a.number) missing.push("Número");
    if(!a.state) missing.push("Estado (UF)");
    if(!a.city)  missing.push("Cidade");
    if(!a.district) missing.push("Bairro");
    if(!/^\d{8}$/.test(masks.onlyDigits(a.zip))) missing.push("CEP");
    return missing;
  }
  function valPF(fullName, cpf){
    const miss=[];
    if(!fullName) miss.push("Nome completo");
    if(masks.onlyDigits(cpf).length!==11) miss.push("CPF (11 dígitos)");
    return miss;
  }
  function valPJ(legal, cnpj){
    const miss=[];
    if(!legal) miss.push("Razão Social");
    if(masks.onlyDigits(cnpj).length!==14) miss.push("CNPJ (14 dígitos)");
    return miss;
  }
  services.validation = { valAddress, valPF, valPJ };
})(Bidly.services, Bidly.masks);

