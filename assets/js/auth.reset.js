// assets/js/auth.reset.js
(() => {
  const $ = (s) => document.querySelector(s);
  const form = $('#reset-form') || document.querySelector('form');
  const pwd  = $('#new-password') || document.querySelector('input[type="password"]');
  const back = $('#back-to-login');
  const feedback = $('.feedback') || $('#feedback');

  const show = (el) => el && (el.style.display = '');
  const hide = (el) => el && (el.style.display = 'none');
  const setMsg = (msg) => { if (feedback) feedback.textContent = msg || ''; };

  // --- i18n de erros comuns do Supabase (PT-BR) ---------------------------
  function msgAuthPT(err) {
    const raw = (err?.message || err || '').toString();
    const s = raw.trim().toLowerCase();

    const known = [
      [/invalid or expired.*(link|token)/, "Link inválido ou expirado. Gere um novo link."],
      [/token.*(already used|used)/, "Este link de redefinição já foi utilizado. Gere um novo link."],
      [/password.*at least.*8/, "A senha deve ter no mínimo 8 caracteres."],
      [/password.*at least.*6/, "A senha deve ter no mínimo 6 caracteres."],
      [/new password should be different/, "A nova senha deve ser diferente da atual."],
      [/password.*too short/, "A senha informada é muito curta."],
      [/password.*too weak/, "A senha é muito fraca. Use letras e números."],
      [/invalid login credentials/, "Credenciais inválidas."],
      [/email not found|user not found/, "Usuário não encontrado."],
      [/networkerror|failed to fetch/, "Falha de rede. Verifique sua conexão e tente novamente."],
      [/unexpected error|unknown error/, "Ocorreu um erro inesperado. Tente novamente."]
    ];

    for (const [pat, msg] of known) {
      if (pat.test(s)) return msg;
    }
    return "Não foi possível concluir a operação. Tente novamente em instantes.";
  }

  // Lê parâmetros do hash (#type=recovery&...); mantém sua lógica
  const hash = window.location.hash.replace(/^#/, '');
  const hp = new URLSearchParams(hash);
  const type = hp.get('type');
  const code = hp.get('code') || hp.get('token_hash');

  async function prepareForm() {
    show(form);
    hide(back);
    setMsg('');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPwd = (pwd?.value || '').trim();

      if (!newPwd || newPwd.length < 8) {
        setMsg('Use pelo menos 8 caracteres.');
        return;
      }

      try {
        const { error } = await supa.auth.updateUser({ password: newPwd });
        if (error) throw error;

        // Sucesso → encerra sessão local e volta ao login (acordo)
        setMsg('Senha atualizada. Redirecionando…');
        await supa.auth.signOut();
        window.location.href = '/';
      } catch (err) {
        setMsg(msgAuthPT(err));
      }
    }, { once: true });
  }

  function showExpired() {
    hide(form);
    show(back);
    setMsg('Link inválido ou expirado. Gere um novo link abaixo.');
  }

  async function init() {
    // Se não for link de recuperação válido, já mostra fluxo de expiração
    if (type !== 'recovery' || !code) {
      showExpired();
      return;
    }

    try {
      // Troca o code pelo cookie de sessão do Supabase para permitir trocar a senha
      const { error } = await supa.auth.exchangeCodeForSession(window.location.hash);
      if (error) throw error;

      // Opcional: limpar hash por estética/segurança
      history.replaceState(null, '', window.location.pathname + window.location.search);

      await prepareForm();
    } catch (err) {
      setMsg(msgAuthPT(err));
      showExpired();
    }
  }

  init();
})();
