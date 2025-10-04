// /assets/js/auth.js
window.$ = window.$ || ((id) => document.getElementById(id));

const elEmail  = $("email");
const elPass   = $("password");
const elMsg    = $("authMsg");
const btnIn    = $("btnSignIn");
const btnUp    = $("btnSignUp");
const lnkForgot = $("lnkForgot");
const lnkResend = $("lnkResend") || $("lnkResendConfirm");

// ---------------- UI helpers ----------------
function uiMsg(type, text) {
  if (!elMsg) return;
  elMsg.className = type || ""; // "", "ok", "error"
  elMsg.textContent = text || "";
}
const ok    = (t) => uiMsg("ok", t);
const error = (t) => uiMsg("error", t);
const clear = () => uiMsg("", "");

// ---------------- Traduções comuns ----------------
function t(msg = "") {
  const m = String(msg || "").toLowerCase();

  if (m.includes("user already registered") || m.includes("user already exists"))
    return "Este e-mail já está cadastrado.";
  if (m.includes("invalid login credentials") || m.includes("invalid email or password"))
    return "E-mail ou senha inválidos.";
  if (m.includes("email not confirmed"))
    return "E-mail ainda não confirmado. Verifique sua caixa de entrada.";
  if (m.includes("password should be at least") || m.includes("password is too short"))
    return "A senha é muito curta. Use pelo menos 8 caracteres.";
  if (m.includes("signups not allowed"))
    return "Cadastro de novos usuários desativado no projeto Supabase.";
  if (m.includes("redirect url is not allowed") || m.includes("invalid redirect"))
    return "URL de redirecionamento não permitida na configuração do Supabase.";
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

// ---------------- Entrar ----------------
btnIn?.addEventListener("click", async () => {
  clear();
  const creds = getCreds();
  if (!creds) return;

  btnIn.disabled = true;
  try {
    await connectSupabase();
    const { error: e } = await sb.auth.signInWithPassword(creds);
    if (e) return error(t(e.message));

    ok('Login realizado. Você já pode clicar em "Ir para app" ou continuar navegando.');
    await applyAuthUI(); // atualiza a landing para o estado logado
  } catch (e) {
    console.error("[login] exceção:", e);
    error("Erro inesperado ao entrar.");
  } finally {
    btnIn.disabled = false;
  }
});

// ---------------- Criar conta ----------------
(function () {
  const $q = (s) => document.querySelector(s);

  const emailEl   = $q("#email");
  const passEl    = $q("#password");
  const btnSignUp = $q("#btnSignUp");
  const authMsg   = $q("#authMsg");

  if (!btnSignUp) return;

  const setMsg = (txt, kind) => {
    if (!authMsg) return;
    authMsg.textContent = txt || "";
    authMsg.classList.remove("error", "ok", "success");
    if (kind) authMsg.classList.add(kind);
  };

  const getRole = () => {
    try {
      const p = new URLSearchParams(location.search);
      const r = p.get("expectedRole");
      if (r === "company" || r === "vendor") return r;
    } catch {}
    try {
      const r2 = localStorage.getItem("expectedRole");
      if (r2 === "company" || r2 === "vendor") return r2;
    } catch {}
    return null;
  };

  btnSignUp.addEventListener(
    "click",
    async (e) => {
      // Respeita o "desabilitado visual" e orienta
      if (
        btnSignUp.classList.contains("is-disabled") ||
        btnSignUp.getAttribute("aria-disabled") === "true"
      ) {
        e.preventDefault();
        setMsg('Selecione um card: "Sou Empresa" ou "Sou Fornecedor" para criar sua conta.', "error");
        return;
      }

      e.preventDefault();
      setMsg("");

      const role = getRole();
      if (!role) {
        setMsg('Selecione um card: "Sou Empresa" ou "Sou Fornecedor".', "error");
        return;
      }

      const email = (emailEl?.value || "").trim();
      const password = passEl?.value || "";

      if (!email || !password) {
        setMsg("Preencha e-mail e senha.", "error");
        return;
      }
      if (password.length < 8) {
        setMsg("A senha é muito curta. Use pelo menos 8 caracteres.", "error");
        return;
      }

      // trava leve visual
      btnSignUp.classList.add("is-disabled");
      btnSignUp.setAttribute("aria-disabled", "true");

      try {
        // **FIX**: garantir client conectado antes do signUp
        await connectSupabase();

        const { data, error: e } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: { role },
            // use a rota que você já possui e que esteja na lista de Redirect URLs
            emailRedirectTo: `${location.origin}/auth/index.html`,
          },
        });

        if (e) {
          console.error("[signup] erro supabase:", e);
          return setMsg(t(e.message || e.error_description), "error");
        }

        // sucesso (Supabase envia e-mail de confirmação)
        setMsg(
          "Enviamos um link de confirmação para o seu e-mail. Verifique sua caixa de entrada.",
          "ok"
        );
      } catch (err) {
        console.error("[signup] exceção:", err);
        setMsg(t(err?.message || err), "error");
      } finally {
        btnSignUp.classList.remove("is-disabled");
        btnSignUp.removeAttribute("aria-disabled");
      }
    },
    true
  );
})();

// ---------------- Esqueci minha senha ----------------
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
    console.error("[reset] exceção:", e);
    error("Erro ao solicitar redefinição.");
  }
});

// ---------------- Reenviar confirmação ----------------
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
    console.error("[resend] exceção:", e);
    error("Erro ao reenviar confirmação.");
  }
});

// Enter envia login
[elEmail, elPass].forEach((inp) =>
  inp?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") btnIn?.click();
  })
);
