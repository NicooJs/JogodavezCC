const form = document.getElementById("create-form");
const errorEl = document.getElementById("create-error");
const submitBtn = document.getElementById("create-submit");

const twitchLoggedOutEl = document.getElementById("create-twitch-logged-out");
const twitchLoggedInEl = document.getElementById("create-twitch-logged-in");
const twitchAvatarEl = document.getElementById("create-twitch-avatar");
const twitchNameEl = document.getElementById("create-twitch-name");
const twitchLogoutBtn = document.getElementById("create-twitch-logout");

const termsCheckEl = document.getElementById("f-terms");

let currentSession = null;

// vindo do card "Reacts" no hub sem leilão ainda criado -- assim que o
// leilão nascer, já troca pro modo reacts antes de entrar no board
const wantsReacts = new URLSearchParams(location.search).get("sistema") === "reacts";

async function findExistingLeilao() {
  try {
    const res = await fetch("/api/meus-leiloes");
    if (!res.ok) return null;
    const { leiloes } = await res.json();
    return leiloes && leiloes.length ? leiloes[0] : null;
  } catch (err) {
    return null;
  }
}

async function loadSession() {
  try {
    currentSession = await fetch("/api/session/me").then((r) => r.json());
  } catch (err) {
    currentSession = { loggedIn: false };
  }

  if (currentSession.loggedIn) {
    const existing = await findExistingLeilao();
    if (existing) {
      location.href = "/painel";
      return;
    }
  }

  renderTwitchBlock();
}

function renderTwitchBlock() {
  const loggedIn = !!(currentSession && currentSession.loggedIn);

  twitchLoggedOutEl.hidden = loggedIn;
  twitchLoggedInEl.hidden = !loggedIn;
  if (loggedIn) {
    twitchAvatarEl.src = currentSession.avatarUrl || "";
    twitchNameEl.textContent = currentSession.displayName || currentSession.twitchLogin || "";
  }

  submitBtn.disabled = !(loggedIn && termsCheckEl.checked);
}

termsCheckEl.addEventListener("change", renderTwitchBlock);

twitchLogoutBtn.addEventListener("click", async () => {
  try {
    await fetch("/api/session/logout", { method: "POST" });
  } catch (err) {
  }
  await loadSession();
});

loadSession();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  if (!currentSession || !currentSession.loggedIn || !termsCheckEl.checked) return;

  const title = document.getElementById("f-title").value.trim();

  submitBtn.disabled = true;
  submitBtn.textContent = "Criando…";

  try {
    const res = await fetch("/api/leiloes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);

    if (wantsReacts) {
      try {
        await fetch(`/api/l/${data.id}/admin/active-system`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ system: "reacts" }),
        });
      } catch (err) {
        // segue pro board mesmo assim -- o streamer troca o modo por lá se isso falhar
      }
    }

    location.href = data.url;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Criar meu leilão";
  }
});

