/* Bidly • utils/mask.js (v1)
   Utilitário de máscaras e sanitização reutilizável em toda a UI.

   Namespace: Bidly.mask

   Recursos:
   - onlyDigits(v)     → só dígitos
   - cnpj.format(v)    → 12.345.678/0001-90
   - cpf.format(v)     → 123.456.789-09
   - cep.format(v)     → 12345-678
   - bind(input, type) → aplica máscara em tempo real ("cnpj" | "cpf" | "cep")
   - wire(container)   → faz bind automático em inputs com [data-mask]
                         (ex.: <input data-mask="cnpj">, "cpf", "cep")

   Observações:
   - Formatação é leniente|incompleta: corta no tamanho máximo e formata.
   - Envio para o backend deve usar onlyDigits() para CNPJ/CPF/CEP.
*/
(function () {
  const root = (typeof window !== "undefined" ? window : globalThis);
  root.Bidly = root.Bidly || {};

  const onlyDigits = (v) => String(v ?? "").replace(/\D+/g, "");

  function cnpjFormat(v) {
    const s = onlyDigits(v).slice(0, 14);
    if (!s) return "";
    return s
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, "$1-$2");
  }

  function cpfFormat(v) {
    const s = onlyDigits(v).slice(0, 11);
    if (!s) return "";
    return s
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, "$1-$2");
  }

  function cepFormat(v) {
    const s = onlyDigits(v).slice(0, 8);
    if (!s) return "";
    return s.replace(/^(\d{5})(\d)/, "$1-$2");
  }

  function applyMask(type, raw) {
    if (type === "cnpj") return cnpjFormat(raw);
    if (type === "cpf")  return cpfFormat(raw);
    if (type === "cep")  return cepFormat(raw);
    return String(raw ?? "");
  }

  // Aplica máscara em tempo real num input
  function bind(input, type) {
    if (!input) return;
    const fmt = (val) => applyMask(type, val);
    const handler = () => {
      const start  = input.selectionStart;
      const before = input.value;
      input.value  = fmt(before);

      // heurística simples para manter o caret "no lugar"
      const delta = input.value.length - before.length;
      const pos   = Math.max(0, (start || 0) + (delta > 0 ? 1 : delta));
      try { input.setSelectionRange(pos, pos); } catch {}
    };
    input.addEventListener("input", handler);
    // formata valor inicial
    input.value = fmt(input.value);
  }

  // Faz bind automático dentro de um container para [data-mask]
  function wire(container) {
    const rootEl = container || document;
    const nodes = rootEl.querySelectorAll("[data-mask]");
    nodes.forEach((el) => {
      const t = (el.getAttribute("data-mask") || "").trim().toLowerCase();
      if (t === "cnpj" || t === "cpf" || t === "cep") bind(el, t);
    });
  }

  root.Bidly.mask = {
    onlyDigits,
    cnpj: { format: cnpjFormat },
    cpf:  { format: cpfFormat  },
    cep:  { format: cepFormat  },
    bind,
    wire,
    format: applyMask,
  };
})();
