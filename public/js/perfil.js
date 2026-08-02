const loggedOutEl = document.getElementById("perfil-logged-out");
const loggedInEl = document.getElementById("perfil-logged-in");
const avatarEl = document.getElementById("perfil-avatar");
const nameEl = document.getElementById("perfil-name");
const loginEl = document.getElementById("perfil-login");
const sinceEl = document.getElementById("perfil-since");
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
const donationCountEl = document.getElementById("perfil-donation-count");
const periodTotalEl = document.getElementById("perfil-period-total");
const chartWrapEl = document.getElementById("perfil-chart-wrap");

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

function formatBRLCompact(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// menor "número redondo" >= maxReais, pra gridline de valor não ficar com
// escala esquisita (ex: máximo 87 -> teto 100, não 87)
function niceCeil(maxReais) {
  if (maxReais <= 0) return 10;
  const exp = Math.floor(Math.log10(maxReais));
  const base = Math.pow(10, exp);
  const norm = maxReais / base;
  let niceNorm;
  if (norm <= 1) niceNorm = 1;
  else if (norm <= 2) niceNorm = 2;
  else if (norm <= 5) niceNorm = 5;
  else niceNorm = 10;
  return niceNorm * base;
}

function renderDonationChart(series) {
  const totalCents = series.reduce((sum, d) => sum + d.cents, 0);
  if (totalCents <= 0) {
    chartWrapEl.innerHTML = '<p class="perfil-chart-empty">Sem doações nos últimos 30 dias.</p>';
    return;
  }

  const width = 700;
  const height = 220;
  const marginLeft = 54;
  const marginRight = 10;
  const marginTop = 10;
  const marginBottom = 24;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;

  const maxReais = Math.max(...series.map((d) => d.cents / 100));
  const niceMax = niceCeil(maxReais);

  const xAt = (i) => marginLeft + (i / (series.length - 1)) * plotWidth;
  const yAt = (cents) => marginTop + plotHeight - (Math.min(cents / 100, niceMax) / niceMax) * plotHeight;

  const linePoints = series.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.cents).toFixed(1)}`);
  const linePath = `M${linePoints.join(" L")}`;
  const baseline = (marginTop + plotHeight).toFixed(1);
  const areaPath = `${linePath} L${xAt(series.length - 1).toFixed(1)},${baseline} L${xAt(0).toFixed(1)},${baseline} Z`;

  const gridSteps = 4;
  const gridlines = [];
  for (let s = 0; s <= gridSteps; s++) {
    const value = (niceMax / gridSteps) * s;
    const y = yAt(value * 100);
    gridlines.push(
      `<line class="perfil-chart-gridline" x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${width - marginRight}" y2="${y.toFixed(1)}" />` +
      `<text class="perfil-chart-axis-label" x="${marginLeft - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${formatBRLCompact(value)}</text>`
    );
  }

  const tickEvery = Math.max(1, Math.round((series.length - 1) / 6));
  const xLabels = [];
  for (let i = 0; i < series.length; i += tickEvery) {
    const d = new Date(`${series[i].date}T00:00:00`);
    const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    xLabels.push(`<text class="perfil-chart-axis-label" x="${xAt(i).toFixed(1)}" y="${height - 4}" text-anchor="middle">${label}</text>`);
  }

  const lastIdx = series.length - 1;

  chartWrapEl.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Recebido por dia nos últimos 30 dias">
      <defs>
        <linearGradient id="perfil-chart-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color:var(--positive);stop-opacity:0.35" />
          <stop offset="100%" style="stop-color:var(--positive);stop-opacity:0" />
        </linearGradient>
      </defs>
      ${gridlines.join("")}
      <path class="perfil-chart-area" d="${areaPath}" />
      <path class="perfil-chart-line" d="${linePath}" />
      <circle class="perfil-chart-dot" cx="${xAt(lastIdx).toFixed(1)}" cy="${yAt(series[lastIdx].cents).toFixed(1)}" r="3.5" />
      ${xLabels.join("")}
    </svg>
  `;
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

  if (data.connectedAt) {
    const desde = new Date(data.connectedAt).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    sinceEl.textContent = `streamer desde ${desde}`;
    sinceEl.hidden = false;
  } else {
    sinceEl.hidden = true;
  }

  currentBalanceCents = data.balanceCents || 0;
  balanceEl.textContent = formatBRL(currentBalanceCents / 100);
  lifetimeEl.textContent = `já arrecadou ${formatBRL((data.lifetimeEarnedCents || 0) / 100)} no total`;

  donationCountEl.textContent = String(data.donationCount30d || 0);
  periodTotalEl.textContent = formatBRL((data.donationTotalCents30d || 0) / 100);
  renderDonationChart(data.donationSeries30d || []);

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
