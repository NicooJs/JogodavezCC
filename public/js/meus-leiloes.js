const loggedOutEl = document.getElementById("my-logged-out");
const loggedInEl = document.getElementById("my-logged-in");
const avatarEl = document.getElementById("my-avatar");
const nameEl = document.getElementById("my-name");
const logoutBtn = document.getElementById("my-logout");
const listEl = document.getElementById("my-list");
const emptyEl = document.getElementById("my-empty");

const confirmDialogOverlayEl = document.getElementById("confirm-dialog-overlay");
let confirmDialogResolve = null;

function settleConfirmDialog(result) {
  confirmDialogOverlayEl.hidden = true;
  const resolve = confirmDialogResolve;
  confirmDialogResolve = null;
  if (resolve) resolve(result);
}

function confirmDialog({ title, message, confirmLabel = "Confirmar", danger = false } = {}) {
  return new Promise((resolve) => {
    confirmDialogResolve = resolve;
    document.getElementById("confirm-dialog-title").textContent = title;
    document.getElementById("confirm-dialog-message").textContent = message;
    const confirmBtn = document.getElementById("confirm-dialog-confirm");
    const cancelBtn = document.getElementById("confirm-dialog-cancel");
    confirmBtn.textContent = confirmLabel;
    confirmBtn.classList.toggle("primary", !danger);
    confirmBtn.classList.toggle("danger", danger);
    confirmDialogOverlayEl.hidden = false;
    setTimeout(() => (danger ? cancelBtn : confirmBtn).focus(), 40);
  });
}

document.getElementById("confirm-dialog-confirm").addEventListener("click", () => settleConfirmDialog(true));
document.getElementById("confirm-dialog-cancel").addEventListener("click", () => settleConfirmDialog(false));
document.getElementById("confirm-dialog-close").addEventListener("click", () => settleConfirmDialog(false));
confirmDialogOverlayEl.addEventListener("click", (e) => { if (e.target === confirmDialogOverlayEl) settleConfirmDialog(false); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !confirmDialogOverlayEl.hidden) settleConfirmDialog(false);
});

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

const UNLINK_ICON_SVG = `<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 6.5V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"/><path d="M4.5 6.5h11"/><path d="M6 6.5l.6 8.5a1.5 1.5 0 0 0 1.5 1.4h3.8a1.5 1.5 0 0 0 1.5-1.4l.6-8.5"/><path d="M3 3l14 14"/></svg>`;

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
      <div class="create-existing-item-actions">
        <a href="${escapeHtml(item.url)}" target="_blank">Abrir →</a>
        <button class="create-existing-unlink" type="button" data-id="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}" title="Desvincular esse leilão da sua conta" aria-label="Desvincular esse leilão da sua conta">${UNLINK_ICON_SVG}</button>
      </div>
    </div>
  `).join("");

  listEl.querySelectorAll(".create-existing-unlink").forEach((btn) => {
    btn.addEventListener("click", () => unlinkLeilao(btn.dataset.id, btn.dataset.title));
  });
}

async function unlinkLeilao(id, title) {
  const ok = await confirmDialog({
    title: "Desvincular leilão",
    message: `"${title}" some daqui e sua sessão da Twitch deixa de administrar ele automaticamente. O leilão continua no ar, com todo o histórico, só não fica mais ligado a essa conta.`,
    confirmLabel: "Desvincular",
    danger: true,
  });
  if (!ok) return;
  try {
    await fetch(`/api/l/${id}/admin/unlink-account`, { method: "POST" });
  } catch (err) {
  }
  loadLeiloes();
}

logoutBtn.addEventListener("click", async () => {
  try {
    await fetch("/api/session/logout", { method: "POST" });
  } catch (err) {
  }
  loadSession();
});

loadSession();
