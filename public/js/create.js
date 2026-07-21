const STORAGE_KEY = "meus-leiloes";

const form = document.getElementById("create-form");
const errorEl = document.getElementById("create-error");
const submitBtn = document.getElementById("create-submit");
const resultEl = document.getElementById("create-result");
const resultUrlEl = document.getElementById("create-result-url");
const resultOpenEl = document.getElementById("create-result-open");
const resultCopyBtn = document.getElementById("create-result-copy");
const existingEl = document.getElementById("create-existing");
const existingListEl = document.getElementById("create-existing-list");
const existingNewBtn = document.getElementById("create-existing-new");

const twitchLoggedOutEl = document.getElementById("create-twitch-logged-out");
const twitchLoggedInEl = document.getElementById("create-twitch-logged-in");
const twitchAvatarEl = document.getElementById("create-twitch-avatar");
const twitchNameEl = document.getElementById("create-twitch-name");
const twitchLogoutBtn = document.getElementById("create-twitch-logout");

const mpDisconnectedEl = document.getElementById("create-mp-disconnected");
const mpConnectedEl = document.getElementById("create-mp-connected");
const mpConnectLinkEl = document.getElementById("create-mp-connect");
const mpHintEl = document.getElementById("create-mp-hint");

let currentSession = null;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function getSavedLeiloes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function saveLeilao(entry) {
  const list = getSavedLeiloes();
  list.push(entry);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    // localStorage indisponível (modo privado, etc) — sem problema, só não
    // lembra da próxima vez.
  }
}

// /l/<id> -> <id>, ou null se a url guardada não bater nesse formato.
function extractLeilaoId(url) {
  const match = String(url || "").match(/\/l\/([a-z0-9_-]+)/i);
  return match ? match[1] : null;
}

// Confere se o leilão ainda existe de verdade no servidor — sem isso, um
// leilão apagado (ex: limpeza de teste pelo super-admin) continuava
// aparecendo pra sempre nesse navegador como "já criado", com um link morto.
// Em caso de erro de rede (offline, etc) assume que existe: melhor mostrar
// um link que pode estar velho do que apagar a referência por causa de uma
// falha passageira de conexão.
async function leilaoStillExists(id) {
  if (!id) return false;
  try {
    const res = await fetch(`/api/l/${id}/leaderboard`);
    if (res.status === 404) return false;
    return true;
  } catch (err) {
    return true;
  }
}

// Lembrete de leilão já criado nesse navegador — pra evitar que a pessoa
// preencha o formulário de novo sem querer.
async function renderExisting() {
  const saved = getSavedLeiloes();
  if (saved.length === 0) return;

  const checks = await Promise.all(saved.map((item) => leilaoStillExists(extractLeilaoId(item.url))));
  const stillValid = saved.filter((_, index) => checks[index]);

  if (stillValid.length !== saved.length) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stillValid));
    } catch (err) {
      // localStorage indisponível — sem problema, só não persiste a limpeza.
    }
  }

  if (stillValid.length === 0) return;

  existingListEl.innerHTML = stillValid.map((item) => `
    <div class="create-existing-item">
      <span>${escapeHtml(item.title || "Leilão de Jogos")}</span>
      <a href="${escapeHtml(item.url)}" target="_blank">Abrir →</a>
    </div>
  `).join("");
  existingEl.hidden = false;
  form.hidden = true;
}

existingNewBtn.addEventListener("click", () => {
  existingEl.hidden = true;
  form.hidden = false;
});

// httpOnly esconde o cookie de sessão do JS de propósito (é o que impede um
// XSS de roubar o login) — por isso pergunta pro servidor quem está logado,
// em vez de tentar ler algum cookie direto.
async function loadSession() {
  try {
    currentSession = await fetch("/api/session/me").then((r) => r.json());
  } catch (err) {
    currentSession = { loggedIn: false };
  }
  renderTwitchBlock();
}

// Criar leilão exige os dois: login com a Twitch (identidade) E Mercado
// Pago conectado (senão o leilão nasceria sem nenhum jeito de receber
// doação -- ver checagem espelhada no servidor em POST /api/leiloes).
function renderTwitchBlock() {
  const loggedIn = !!(currentSession && currentSession.loggedIn);
  const mpConnected = !!(currentSession && currentSession.mpConnected);

  twitchLoggedOutEl.hidden = loggedIn;
  twitchLoggedInEl.hidden = !loggedIn;
  if (loggedIn) {
    twitchAvatarEl.src = currentSession.avatarUrl || "";
    twitchNameEl.textContent = currentSession.displayName || currentSession.twitchLogin || "";
  }

  mpDisconnectedEl.hidden = mpConnected;
  mpConnectedEl.hidden = !mpConnected;
  mpConnectLinkEl.classList.toggle("is-disabled", !loggedIn);
  mpHintEl.hidden = loggedIn;

  submitBtn.disabled = !(loggedIn && mpConnected);
}

twitchLogoutBtn.addEventListener("click", async () => {
  try {
    await fetch("/api/session/logout", { method: "POST" });
  } catch (err) {
    // segue o baile -- pior caso, a sessão local no servidor expira sozinha
  }
  await loadSession();
});

renderExisting();
loadSession();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  if (!currentSession || !currentSession.loggedIn || !currentSession.mpConnected) return;

  const title = document.getElementById("f-title").value.trim();
  const password = document.getElementById("f-password").value;

  if (!password) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Criando…";

  try {
    const res = await fetch("/api/leiloes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);

    const url = `${location.origin}${data.url}`;
    saveLeilao({ title: title || "Leilão de Jogos", url: data.url });
    resultUrlEl.value = url;
    resultOpenEl.href = data.url;
    form.hidden = true;
    resultEl.hidden = false;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Criar leilão";
  }
});

resultCopyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultUrlEl.value);
    resultCopyBtn.textContent = "Copiado!";
    setTimeout(() => { resultCopyBtn.textContent = "Copiar"; }, 1500);
  } catch (err) {
    resultUrlEl.select();
  }
});

