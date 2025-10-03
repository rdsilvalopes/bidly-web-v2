// /assets/js/app.js

const $ = (id) => document.getElementById(id);

function showErr(e) {
  const msg =
    e?.message ||
    e?.error_description ||
    e?.toString?.() ||
    "Erro desconhecido";
  alert("Erro: " + msg);
  console.error(e);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await ensureAuthListeners(); // <— NOVO: registra listeners sem forçar /auth
    await ensureAuthAndClient(); // (sua função atual que chama requireAuth)
    await initHeader();
    await initRoleGate();
  } catch (e) {
    showErr(e);
  }
});

async function ensureAuthAndClient() {
  await connectSupabase(); // vem do supa.js (UMD)
  const session = await requireAuth(); // vem do guards.js
  if (!session) throw new Error("Sem sessão.");
  return session;
}

// --- Modal de escolha de papel ---------------------------------
function bindRoleModalHandlers() {
  const btnCompany = $("btnRoleCompany");
  const btnSupplier = $("btnRoleSupplier");
  const modalEl = $("modalChooseRole"); // <-- seu ID real

  async function handleChoose(role) {
    try {
      const btn = role === "company" ? btnCompany : btnSupplier;
      if (btn) btn.disabled = true;

      await repo.getOrCreateMyProfile(); // cria linha se faltar
      await repo.updateMyProfile({
        role,
        accept_terms_at: new Date().toISOString(),
      });

      // Fecha o modal
      if (modalEl) modalEl.style.display = "none";
      document.body.classList.remove("modal-open");

      // Segue app
      initJobsUI();
    } catch (e) {
      showErr(e);
    } finally {
      if (btnCompany) btnCompany.disabled = false;
      if (btnSupplier) btnSupplier.disabled = false;
    }
  }

  if (btnCompany) btnCompany.onclick = () => handleChoose("company");
  if (btnSupplier) btnSupplier.onclick = () => handleChoose("supplier");
}

async function initHeader() {
  const { data } = await sb.auth.getUser();
  const email = data?.user?.email ?? "—";
  const el = $("userEmail");
  if (el) el.textContent = email;

  const btnOut = $("btnSignOut");
  if (btnOut) {
    btnOut.onclick = async () => {
      await sb.auth.signOut();
      window.location.href = "/index.html";
    };
  }

  sb.auth.onAuthStateChange((evt) => {
    if (evt === "SIGNED_OUT") window.location.href = "/index.html";
  });
}

async function initRoleGate() {
  const me = await repo.getOrCreateMyProfile();
  const needsRole = !me?.role;
  const modalEl = $("modalChooseRole"); // <-- seu ID real

  if (needsRole) {
    if (modalEl) modalEl.style.display = "flex"; // seu modal usa flex
    document.body.classList.add("modal-open");
    bindRoleModalHandlers();
  } else {
    if (modalEl) modalEl.style.display = "none";
    document.body.classList.remove("modal-open");
    initJobsUI();
  }
}

// --- Jobs (placeholder) ----------------------------------------
const jobsList = $("jobsList");

async function listJobs() {
  if (jobsList) {
    jobsList.innerHTML = "<li>Carregamento de jobs (em breve)</li>";
  }
}

async function createTestJob() {
  alert("Criação de demanda de teste — placeholder");
}

function initJobsUI() {
  const btnList = $("btnListJobs");
  const btnCreate = $("btnCreateJob"); // <-- ID correto do seu HTML

  if (btnList) btnList.onclick = listJobs;
  if (btnCreate) btnCreate.onclick = createTestJob;
}

// --- Bootstrap --------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await connectSupabase();
    await requireAuth();
    await initHeader();
    await initRoleGate();
  } catch (e) {
    alert(e?.message || e);
  }
});
// /assets/js/app.js
window.$ = window.$ || ((id) => document.getElementById(id));
