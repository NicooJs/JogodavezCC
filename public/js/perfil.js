const loggedOutEl = document.getElementById("perfil-logged-out");
const loggedInEl = document.getElementById("perfil-logged-in");
const avatarEl = document.getElementById("perfil-avatar");
const nameEl = document.getElementById("perfil-name");
const loginEl = document.getElementById("perfil-login");
const logoutBtn = document.getElementById("perfil-logout-btn");

const pixKeyInputEl = document.getElementById("pix-key-input");
const pixKeyFeedbackEl = document.getElementById("pix-key-feedback");
const pixKeyUpdatedEl = document.getElementById("pix-key-updated");
const balanceEl = document.getElementById("perfil-balance");
const lifetimeEl = document.getElementById("perfil-lifetime");
const saqueBtn = document.getElementById("saque-submit");
const saqueFeedbackEl = document.getElementById("saque-feedback");
const historyListEl = document.getElementById("saque-history-list");
const historyEmptyEl = document.getElementById("saque-history-empty");

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

function formatBRL(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function perfilFetch(path, options = {}) {
  const res = await fetch(`/api/perfil${path}`, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

let currentBalanceCents = 0;

async function loadPerfil() {
  let data;
  try {
    data = await perfilFetch("");
  } catch (err) {
    return;
  }

  avatarEl.src = data.avatarUrl || "";
  nameEl.textContent = data.displayName || data.twitchLogin || "";
  loginEl.textContent = data.twitchLogin ? `@${data.twitchLogin}` : "";

  currentBalanceCents = data.balanceCents || 0;
  balanceEl.textContent = formatBRL(currentBalanceCents / 100);
  lifetimeEl.textContent = `já arrecadou ${formatBRL((data.lifetimeEarnedCents || 0) / 100)} no total`;

  if (document.activeElement !== pixKeyInputEl) pixKeyInputEl.value = data.pixKey || "";
  if (data.pixKeyUpdatedAt) {
    pixKeyUpdatedEl.textContent = `última troca: ${formatDate(data.pixKeyUpdatedAt)}`;
    pixKeyUpdatedEl.hidden = false;
  } else {
    pixKeyUpdatedEl.hidden = true;
  }

  const cooldownMs = data.cooldownRemainingMs || 0;
  if (cooldownMs > 0) {
    const horas = Math.ceil(cooldownMs / 3_600_000);
    saqueBtn.disabled = true;
    saqueFeedbackEl.textContent = `Chave Pix trocada recentemente -- saque libera em ~${horas}h, por segurança.`;
    saqueFeedbackEl.className = "perfil-feedback";
    saqueFeedbackEl.hidden = false;
  } else {
    saqueBtn.disabled = !data.pixKey || currentBalanceCents <= 0;
  }
}

const STATUS_LABELS = { pending: "processando", sent: "enviado", failed: "falhou" };

async function loadSaqueHistory() {
  let data;
  try {
    data = await perfilFetch("/saques");
  } catch (err) {
    return;
  }
  const saques = data.saques || [];
  if (saques.length === 0) {
    historyListEl.innerHTML = "";
    historyEmptyEl.hidden = false;
    return;
  }
  historyEmptyEl.hidden = true;
  historyListEl.innerHTML = saques.map((s) => `
    <div class="perfil-saque-row">
      <div class="perfil-saque-row-main">
        <span class="perfil-saque-value">${formatBRL(s.sentCents / 100)}</span>
        <span class="perfil-saque-date">${formatDate(s.createdAt)}</span>
      </div>
      <span class="perfil-saque-status" data-status="${s.status}">${STATUS_LABELS[s.status] || s.status}</span>
    </div>
  `).join("");
}

async function loadSession() {
  const s = await fetch("/api/session/me").then((r) => r.json()).catch(() => ({ loggedIn: false }));

  loggedOutEl.hidden = s.loggedIn;
  loggedInEl.hidden = !s.loggedIn;
  if (!s.loggedIn) return;

  await loadPerfil();
  loadSaqueHistory();
}

pixKeyInputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("pix-key-save").click(); });

document.getElementById("pix-key-save").addEventListener("click", async () => {
  const pixKey = pixKeyInputEl.value.trim();
  pixKeyFeedbackEl.hidden = true;
  if (!pixKey) return;
  try {
    await perfilFetch("/pix-key", { method: "POST", body: JSON.stringify({ pixKey }) });
    pixKeyFeedbackEl.textContent = "Chave Pix salva!";
    pixKeyFeedbackEl.className = "perfil-feedback ok";
    pixKeyFeedbackEl.hidden = false;
    loadPerfil();
  } catch (err) {
    pixKeyFeedbackEl.textContent = "Erro: " + err.message;
    pixKeyFeedbackEl.className = "perfil-feedback error";
    pixKeyFeedbackEl.hidden = false;
  }
});

saqueBtn.addEventListener("click", async () => {
  saqueFeedbackEl.hidden = true;
  const ok = await confirmDialog({
    title: "Solicitar saque",
    message: `Sacar ${formatBRL(currentBalanceCents / 100)} pra sua chave Pix cadastrada?`,
    confirmLabel: "Solicitar saque",
  });
  if (!ok) return;
  saqueBtn.disabled = true;
  try {
    const data = await perfilFetch("/saque", { method: "POST" });
    saqueFeedbackEl.textContent = `Saque solicitado: ${formatBRL(data.sentCents / 100)}. A confirmação pode levar alguns instantes -- seu saldo atualiza sozinho quando sair.`;
    saqueFeedbackEl.className = "perfil-feedback ok";
    saqueFeedbackEl.hidden = false;
    loadPerfil();
    loadSaqueHistory();
  } catch (err) {
    saqueFeedbackEl.textContent = "Erro: " + err.message;
    saqueFeedbackEl.className = "perfil-feedback error";
    saqueFeedbackEl.hidden = false;
    saqueBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "Sair da conta",
    message: "Isso desconecta sua conta da Twitch nesse navegador.",
    confirmLabel: "Sair da conta",
    danger: true,
  });
  if (!ok) return;
  await fetch("/api/session/logout", { method: "POST" }).catch(() => {});
  location.href = "/";
});

loadSession();
