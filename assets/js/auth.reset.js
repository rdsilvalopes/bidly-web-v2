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

  // Lê parâmetros do hash (?type=recovery&code=...)
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

      const { error } = await supa.auth.updateUser({ password: newPwd });
      if (error) {
        setMsg(error.message || 'Não foi possível salvar a nova senha.');
        return;
      }

      // Mensagem rápida e volta pra home sem manter sessão
      setMsg('Senha atualizada. Redirecionando…');
      await supa.auth.signOut();
      window.location.href = '/';
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

      await prepareForm();
    } catch (err) {
      showExpired();
    }
  }

  init();
})();
