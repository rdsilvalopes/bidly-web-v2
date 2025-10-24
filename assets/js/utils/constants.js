/* /assets/js/utils/constants.js
   Bidly • Fonte única de constantes (sem export/import)
   Expõe window.Bidly.constants para os módulos IIFE.
*/

window.Bidly = window.Bidly || {};

(function () {
  // — Termos —
  const TERMS_VERSION = 1;
  const TERMS_URL = "/legal/terms/pt-BR/1/terms.html";

  // — Storage/Docs —
  const DOCS_BUCKET = "org-docs";
  const DOCS_ACCEPT = "application/pdf";
  const DOCS_SIGNED_URL_TTL = 60 * 60 * 72; // 72h

  // — Tipos de documentos (NÃO hardcode em lugar nenhum) —
  const DOC_TYPE_PF = 'company_contract'   // use o mesmo, até criarmos o PF de verdade
  const DOC_TYPE_PJ = "company_contract"; 

  // — UF —
  const UF_LIST = [
    "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA",
    "MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN",
    "RS","RO","RR","SC","SP","SE","TO"
  ];

  // Publica no namespace global
  window.Bidly.constants = {
    TERMS_VERSION,
    TERMS_URL,
    DOCS_BUCKET,
    DOCS_ACCEPT,
    DOCS_SIGNED_URL_TTL,
    DOC_TYPE_PF,
    DOC_TYPE_PJ,
    UF_LIST,
  };
})();
