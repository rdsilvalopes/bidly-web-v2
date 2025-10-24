
/* Bidly • utils/masks */
window.Bidly = window.Bidly || {};
(function(ns){
  const onlyDigits = s => String(s||"").replace(/\D+/g,"");
  function maskCNPJ(v){
    const d = onlyDigits(v).slice(0,14);
    if(d.length<=2) return d;
    if(d.length<=5) return d.replace(/^(\d{2})(\d+)/,"$1.$2");
    if(d.length<=8) return d.replace(/^(\d{2})(\d{3})(\d+)/,"$1.$2.$3");
    if(d.length<=12) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d+)/,"$1.$2.$3/$4");
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/,"$1.$2.$3/$4-$5");
  }
  function maskCEP(v){
    const d = onlyDigits(v).slice(0,8);
    return d.length<=5 ? d : d.replace(/^(\d{5})(\d{0,3})$/,"$1-$2");
  }
  ns.masks = { maskCNPJ, maskCEP, onlyDigits, trim: (s)=> (s==null?"":String(s).trim()) };
})(window.Bidly);

