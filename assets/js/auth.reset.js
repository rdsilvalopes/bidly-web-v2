// /assets/js/auth.reset.js
window.$ = window.$ || ((id) => document.getElementById(id));

function setMsg(type, text) {
  const el = $("resetMsg");
  if (!el) return;
  el.className = type; // "ok" | "error" | ""
  el.textContent = text || "";
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await connectSupabase(); // usa detectSessionInUrl: true

    // Ao chegar por link de recuperação, o Supabase cria sessão a partir do hash
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) {
      setMsg(
        "error",
        "Link inválido ou expirado. Solicite novamente em 'Esqueci minha senha'."
      );
      return;
    }

    const inp = $("newPassword");
    const btn = $("btnSaveNewPass");

    btn?.addEventListener("click", async () => {
      setMsg("", "");
      const pw = inp?.value || "";
      if (pw.length < 8) {
        return setMsg("error", "A senha deve ter pelo menos 8 caracteres.");
      }
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) {
        return setMsg(
          "error",
          error.message || "Não foi possível atualizar a senha."
        );
      }
      setMsg("ok", "Senha alterada! Redirecionando para o login…");
      setTimeout(() => (window.location.href = "/index.html"), 1000);
    });
  } catch (e) {
    console.error(e);
    setMsg("error", "Erro ao processar o link de recuperação.");
  }
});
