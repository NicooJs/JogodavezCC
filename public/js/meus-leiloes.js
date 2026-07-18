const loggedOutEl = document.getElementById("my-logged-out");
const loggedInEl = document.getElementById("my-logged-in");
const avatarEl = document.getElementById("my-avatar");
const nameEl = document.getElementById("my-name");
const logoutBtn = document.getElementById("my-logout");
const listEl = document.getElementById("my-list");
const emptyEl = document.getElementById("my-empty");

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const VERIFIED_MARK_SVG = `<svg class="ranking-verified-mark" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" title="Identidade confirmada pela Twitch">
  <circle cx="8" cy="8" r="8" fill="currentColor" opacity="0.18"/>
  <path d="M4.5 8.2L6.8 10.5L11.5 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function loadSession() {
  const s = await fetch("/api/session/me").then((r) => r.json()).catch(() => ({ loggedIn: false }));

  loggedOutEl.hidden = s.loggedIn;
  loggedInEl.hidden = !s.loggedIn;
  if (!s.loggedIn) return;

  avatarEl.src = s.avatarUrl || "";
  nameEl.textContent = s.displayName || s.twitchLogin || "";
  loadLeiloes();
}

async function loadLeiloes() {
  const res = await fetch("/api/meus-leiloes");
  if (!res.ok) return;
  const { leiloes } = await res.json();

  if (leiloes.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  listEl.innerHTML = leiloes.map((item) => `
    <div class="create-existing-item">
      <span>${escapeHtml(item.title)}${item.hostVerified ? VERIFIED_MARK_SVG : ""}</span>
      <a href="${escapeHtml(item.url)}" target="_blank">Abrir →</a>
    </div>
  `).join("");
}

logoutBtn.addEventListener("click", async () => {
  try {
    await fetch("/api/session/logout", { method: "POST" });
  } catch (err) {
    // segue o baile -- pior caso, a sessão local no servidor expira sozinha
  }
  loadSession();
});

loadSession();
