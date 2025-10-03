// /assets/js/auth.js
window.$ = window.$ || ((id) => document.getElementById(id));

const elEmail = $("email");
const elPass = $("password");
const elMsg = $("authMsg");
const btnIn = $("btnSignIn");
const btnUp = $("btnSignUp");
const lnkForgot = $("lnkForgot");
const lnkResend = $("lnkResend") || $("lnkResendConfirm");

function uiMsg(type, text) {
  if (!elMsg) return;
  elMsg.className = type || ""; // "", "ok", "error"
  elMsg.textContent = text || "";
}
const ok = (t) => uiMsg("ok", t);
const error = (t) => uiMsg("error", t);
const clear = () => uiMsg("", "");

function t(msg = "") {
  const m = String(msg || "").toLowerCase();
  if (
    m.includes("user already registered") ||
    m.includes("user already exists")
  )
    return "Este e-mail já está cadastrado.";
  if (
    m.includes("invalid login credentials") ||
    m.includes("invalid email or password")
  )
    return "E-mail ou senha inválidos.";
  if (m.includes("email not confirmed"))
    return "E-mail ainda não confirmado. Verifique sua caixa de entrada.";
  if (
    m.includes("password should be at least") ||
    m.includes("password is too short")
  )
    return "A senha é muito curta. Use pelo menos 8 caracteres.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas. Aguarde e tente novamente.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Falha de conexão. Verifique sua internet.";
  return "Algo deu errado. Tente novamente.";
}

function getCreds() {
  const email = elEmail?.value?.trim();
  const password = elPass?.value ?? "";
  if (!email || !password) {
    error("Preencha e-mail e senha.");
    return null;
  }
  return { email, password };
}

// Entrar
btnIn?.addEventListener("click", async () => {
  clear();
  const creds = getCreds();
  if (!creds) return;
  btnIn.disabled = true;
  try {
    await connectSupabase();
    const { error: e } = await sb.auth.signInWithPassword(creds);
    if (e) return error(t(e.message));
    ok(
      'Login realizado. Você já pode clicar em "Ir para app" ou continuar navegando.'
    );
    await applyAuthUI(); // atualiza a landing para o estado logado, sem sair da página
  } catch (e) {
    console.error(e);
    error("Erro inesperado ao entrar.");
  } finally {
    btnIn.disabled = false;
  }
});

// Criar conta
btnUp?.addEventListener("click", async () => {
  clear();
  const creds = getCreds();
  if (!creds) return;
  btnUp.disabled = true;
  try {
    await connectSupabase();
    const { error: e } = await sb.auth.signUp({
      email: creds.email,
      password: creds.password,
      options: { emailRedirectTo: `${window.location.origin}/auth/index.html` },
    });
    if (e) return error(t(e.message));
    ok("Conta criada! Verifique seu e-mail para confirmar.");
  } catch (e) {
    console.error(e);
    error("Erro inesperado ao criar conta.");
  } finally {
    btnUp.disabled = false;
  }
});

// Esqueci minha senha
lnkForgot?.addEventListener("click", async (ev) => {
  ev?.preventDefault?.();
  clear();
  const email = elEmail?.value?.trim();
  if (!email) return error("Informe seu e-mail.");
  try {
    await connectSupabase();
    const { error: e } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/index.html`,
    });
    if (e) return error(t(e.message));
    ok("Enviamos um link para redefinição. Abra o e-mail mais recente.");
  } catch (e) {
    console.error(e);
    error("Erro ao solicitar redefinição.");
  }
});

// Reenviar confirmação
lnkResend?.addEventListener("click", async (ev) => {
  ev?.preventDefault?.();
  clear();
  const email = elEmail?.value?.trim();
  if (!email) return error("Informe seu e-mail.");
  try {
    await connectSupabase();
    const { error: e } = await sb.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/index.html` },
    });
    if (e) return error(t(e.message));
    ok("Reenviamos o e-mail de confirmação.");
  } catch (e) {
    console.error(e);
    error("Erro ao reenviar confirmação.");
  }
});

// Enter envia login
[elEmail, elPass].forEach((inp) =>
  inp?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") btnIn?.click();
  })
);
