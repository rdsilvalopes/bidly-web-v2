
// ===== Códigos e helpers (global) =====
(function(){
  const REASON = Object.freeze({
    FALTA_DOCUMENTO:     { kind:'request_info', title:'Falta documento',     defaultMsg:'Falta enviar o contrato social (PDF). Anexe e reenvie.' },
    DOC_DESATUALIZADO:   { kind:'request_info', title:'Documento desatualizado', defaultMsg:'Documento vencido/desatualizado. Envie uma versão atual.' },
    DIVERGENCIA_DADOS:   { kind:'request_info', title:'Dados divergentes',   defaultMsg:'Os dados do documento não batem com o cadastro. Revise e corrija.' },
    DOC_ILEGIVEL:        { kind:'request_info', title:'Arquivo ilegível',     defaultMsg:'O arquivo está ilegível. Envie um PDF legível.' },
    CORRIGIR_INFORMACAO: { kind:'request_info', title:'Corrigir informação',  defaultMsg:'Revise as informações do formulário e salve novamente.' },

    DOCUMENTO_INELEGIVEL:{ kind:'rejection',    title:'Documento não aceito', defaultMsg:'O documento enviado não é aceito para esta verificação.' },
    INCONSISTENCIA_CNPJ: { kind:'rejection',    title:'CNPJ inconsistente',   defaultMsg:'O CNPJ é inválido ou divergente do documento.' },
    FRAUDE_SUSPEITA:     { kind:'rejection',    title:'Revisão necessária',   defaultMsg:'Identificamos inconsistências. Entre em contato com o suporte.' },
    OUTROS:              { kind:'rejection',    title:'Reprovado',            defaultMsg:'Seu envio foi reprovado. Revise e reenvie.' },
  });

  const NOTE_VISIBILITY = Object.freeze({ USER:'user', INTERNAL:'internal' });
  const NOTE_CATEGORY   = Object.freeze({ GENERAL:'general', REQUEST:'request_info', REJECTION:'rejection' });

  const listByKind = (kind) => Object.entries(REASON)
    .filter(([,v]) => v.kind===kind)
    .map(([code,v]) => ({ code, ...v }));

  const getDefaultMessage = (code) => (REASON[code]?.defaultMsg || '');

  window.BIDLY_CODES = Object.freeze({
    REASON, NOTE_VISIBILITY, NOTE_CATEGORY, listByKind, getDefaultMessage
  });
})();

