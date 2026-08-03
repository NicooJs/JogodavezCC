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

const obsEmptyEl = document.getElementById("obs-empty");
const obsLinkBlockEl = document.getElementById("obs-link-block");
const obsLinkInputEl = document.getElementById("obs-link-input");
const obsLeilaoTitleEl = document.getElementById("obs-leilao-title");
const obsMultiHintEl = document.getElementById("obs-multi-hint");

const chimeListEl = document.getElementById("chime-list");
const chimeRows = [...document.querySelectorAll(".perfil-chime-row")];
const chimeSaveBtn = document.getElementById("chime-save");
const chimeFeedbackEl = document.getElementById("chime-feedback");
const chimeCustomStatusEl = document.getElementById("chime-custom-status");
const chimeCustomInputEl = document.getElementById("chime-custom-input");
const chimeCustomUploadBtn = document.getElementById("chime-custom-upload");
const chimeCustomPreviewBtn = document.getElementById("chime-custom-preview");
let selectedChime = "classic";
let savedChime = "classic";
let customSoundUrl = null;
const MAX_CUSTOM_SOUND_SECONDS = 10;

const donationsSearchEl = document.getElementById("donations-search");
const donationListEl = document.getElementById("donation-list");
const donationEmptyEl = document.getElementById("donation-empty");
const blockedListEl = document.getElementById("blocked-list");
const blockedEmptyEl = document.getElementById("blocked-empty");

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

function formatBRL(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatRelativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
  return formatDate(iso);
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

const navItems = [...document.querySelectorAll(".perfil-nav-item[data-section]")];
const sectionPanels = {};
document.querySelectorAll(".perfil-section[data-section-panel]").forEach((el) => { sectionPanels[el.dataset.sectionPanel] = el; });

const sectionHeaderIconEl = document.getElementById("perfil-section-icon");
const sectionHeaderTitleEl = document.getElementById("perfil-section-title");
const sectionHeaderSubtitleEl = document.getElementById("perfil-section-subtitle");

const SECTION_META = {
  geral: {
    title: "Visão geral",
    subtitle: "Suas doações dos últimos 30 dias.",
    icon: '<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10L10 4l7 6"/><path d="M5 8.7V16h10V8.7"/></svg>',
  },
  financeiro: {
    title: "Financeiro",
    subtitle: "Saldo, chave Pix e histórico de saques.",
    icon: '<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="14" height="10" rx="1.5"/><path d="M3 9h14"/><circle cx="14" cy="12.5" r="0.7" fill="currentColor" stroke="none"/></svg>',
  },
  obs: {
    title: "Widget OBS",
    subtitle: "Link do overlay de alertas pra colar no OBS.",
    icon: '<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="14" height="9.5" rx="1.3"/><path d="M7 17h6M10 13.5V17"/></svg>',
  },
  alerta: {
    title: "Alerta",
    subtitle: "Som do alerta de doação, vale pra todos os seus leilões.",
    icon: '<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.3a4 4 0 0 0-4 4v2.1c0 .8-.3 1.5-.8 2.1L4 13h12l-1.2-1.5a3.3 3.3 0 0 1-.8-2.1V7.3a4 4 0 0 0-4-4z"/><path d="M8.3 15.2a1.8 1.8 0 0 0 3.4 0"/></svg>',
  },
  doacoes: {
    title: "Doações",
    subtitle: "Histórico de doações recebidas e bloqueio de doador.",
    icon: '<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="6.7"/><path d="M10 6.8v6.4M7.8 8.3c0-.9.9-1.5 2.2-1.5s2.2.6 2.2 1.4-.9 1.2-2.2 1.4c-1.3.2-2.2.6-2.2 1.4s.9 1.5 2.2 1.5 2.2-.6 2.2-1.5"/></svg>',
  },
};

function activateSection(name) {
  navItems.forEach((btn) => btn.classList.toggle("active", btn.dataset.section === name));
  Object.entries(sectionPanels).forEach(([key, el]) => { el.hidden = key !== name; });
  const meta = SECTION_META[name];
  if (meta) {
    sectionHeaderIconEl.innerHTML = meta.icon;
    sectionHeaderTitleEl.textContent = meta.title;
    sectionHeaderSubtitleEl.textContent = meta.subtitle;
  }
}

navItems.forEach((btn) => btn.addEventListener("click", () => activateSection(btn.dataset.section)));
activateSection("geral");

const subtabButtons = [...document.querySelectorAll(".perfil-subtab[data-subtab]")];
const subtabPanels = {};
document.querySelectorAll("[data-subtab-panel]").forEach((el) => { subtabPanels[el.dataset.subtabPanel] = el; });

subtabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    subtabButtons.forEach((b) => b.classList.toggle("active", b === btn));
    Object.entries(subtabPanels).forEach(([key, el]) => { el.hidden = key !== btn.dataset.subtab; });
  });
});

async function perfilFetch(path, options = {}) {
  // FormData define seu próprio Content-Type (boundary) -- não fixar aqui.
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`/api/perfil${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
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

  if (data.latestLeilao) {
    obsEmptyEl.hidden = true;
    obsLinkBlockEl.hidden = false;
    obsLinkInputEl.value = `${location.origin}${data.latestLeilao.alertUrl}`;
    obsLeilaoTitleEl.textContent = `Leilão: ${data.latestLeilao.title}`;
    obsLeilaoTitleEl.hidden = false;
    obsMultiHintEl.hidden = (data.leilaoCount || 0) <= 1;
  } else {
    obsEmptyEl.hidden = false;
    obsLinkBlockEl.hidden = true;
  }

  selectedChime = data.alertChime || "classic";
  savedChime = selectedChime;
  customSoundUrl = data.alertCustomSoundUrl || null;
  applyCustomSoundStatus();
  applyChimeSelection();
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
    <div class="perfil-saque-row-wrap">
      <div class="perfil-saque-row">
        <div class="perfil-saque-row-main">
          <span class="perfil-saque-value">${formatBRL(s.sentCents / 100)}</span>
          <span class="perfil-saque-date">${formatDate(s.createdAt)}</span>
        </div>
        <span class="perfil-saque-status" data-status="${s.status}">${STATUS_LABELS[s.status] || s.status}</span>
      </div>
      ${s.status === "failed" ? `<p class="perfil-saque-reason">Valor devolvido pro saldo. ${escapeHtml(s.failureReason || "Não foi possível concluir o envio.")}</p>` : ""}
    </div>
  `).join("");
}

const BLOCK_ICON_SVG = '<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M5 5l10 10"/></svg>';

// cor do avatar é determinística a partir do nome, só pra dar identidade
// visual sem guardar/gerar imagem nenhuma
function avatarVariant(username) {
  const code = String(username || "?").trim().charCodeAt(0) || 0;
  return code % 4;
}

function donationsSummaryEl() {
  return {
    value: document.getElementById("donations-summary-value"),
    label: document.getElementById("donations-summary-label"),
  };
}

async function loadDonations(search) {
  let data;
  try {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    data = await perfilFetch(`/donations${qs}`);
  } catch (err) {
    return;
  }
  const donations = data.donations || [];

  const { value: summaryValueEl, label: summaryLabelEl } = donationsSummaryEl();
  const totalCents = donations.reduce((sum, d) => sum + d.valorTotalCents, 0);
  summaryValueEl.textContent = formatBRL(totalCents / 100);
  summaryLabelEl.textContent = `${donations.length} doaç${donations.length === 1 ? "ão" : "ões"}${search ? " encontrada(s)" : ""}`;

  if (donations.length === 0) {
    donationListEl.innerHTML = "";
    donationEmptyEl.hidden = false;
    return;
  }
  donationEmptyEl.hidden = true;
  donationListEl.innerHTML = donations.map((d) => {
    const name = d.donorUsername || "Anônimo";
    const initial = name.trim().charAt(0).toUpperCase() || "?";
    return `
    <div class="perfil-donation-row" data-blocked="${d.blocked}">
      <span class="perfil-donation-avatar" data-variant="${avatarVariant(name)}">${escapeHtml(initial)}</span>
      <div class="perfil-donation-main">
        <div class="perfil-donation-head">
          <p class="perfil-donation-name">${escapeHtml(name)}</p>
          <span class="perfil-donation-value">${formatBRL(d.valorTotalCents / 100)}</span>
        </div>
        ${d.donorNote ? `<p class="perfil-donation-note">"${escapeHtml(d.donorNote)}"</p>` : ""}
        <p class="perfil-donation-date">${formatRelativeTime(d.paidAt)}</p>
      </div>
      ${d.blocked
        ? '<span class="perfil-donation-blocked-badge">Bloqueado</span>'
        : `<button class="perfil-donation-block-icon" type="button" data-tooltip="Bloquear" data-id="${d.id}" data-username="${escapeHtml(name)}">${BLOCK_ICON_SVG}</button>`}
    </div>
  `;
  }).join("");
}

let donationsSearchTimeout = null;
donationsSearchEl.addEventListener("input", () => {
  clearTimeout(donationsSearchTimeout);
  donationsSearchTimeout = setTimeout(() => loadDonations(donationsSearchEl.value.trim()), 300);
});

donationListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".perfil-donation-block-icon");
  if (!btn) return;
  const ok = await confirmDialog({
    title: "Bloquear doador",
    message: `Bloquear "${btn.dataset.username}"? A pessoa não vai mais conseguir gerar Pix pra doar em nenhum dos seus leilões (bloqueio por nome e pelo IP dessa doação).`,
    confirmLabel: "Bloquear",
    danger: true,
  });
  if (!ok) return;
  btn.disabled = true;
  try {
    await perfilFetch(`/donations/${btn.dataset.id}/block`, { method: "POST" });
    loadDonations(donationsSearchEl.value.trim());
    loadBlocked();
  } catch (err) {
    btn.disabled = false;
    alert(err.message);
  }
});

async function loadBlocked() {
  let data;
  try {
    data = await perfilFetch("/blocked-donors");
  } catch (err) {
    return;
  }
  const blocked = data.blocked || [];
  if (blocked.length === 0) {
    blockedListEl.innerHTML = "";
    blockedEmptyEl.hidden = false;
    return;
  }
  blockedEmptyEl.hidden = true;
  blockedListEl.innerHTML = blocked.map((b) => `
    <div class="perfil-blocked-row">
      <div class="perfil-blocked-main">
        <p class="perfil-blocked-name">${escapeHtml(b.donorUsername)}</p>
        <p class="perfil-blocked-meta">IP ${escapeHtml(b.donorIp)} · bloqueado ${formatRelativeTime(b.blockedAt)}</p>
      </div>
      <button class="btn-mini perfil-blocked-unblock" type="button" data-id="${b.id}">Desbloquear</button>
    </div>
  `).join("");
}

blockedListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".perfil-blocked-unblock");
  if (!btn) return;
  btn.disabled = true;
  try {
    await perfilFetch(`/blocked-donors/${btn.dataset.id}/unblock`, { method: "POST" });
    loadBlocked();
    loadDonations(donationsSearchEl.value.trim());
  } catch (err) {
    btn.disabled = false;
    alert(err.message);
  }
});

async function loadSession() {
  const s = await fetch("/api/session/me").then((r) => r.json()).catch(() => ({ loggedIn: false }));

  loggedOutEl.hidden = s.loggedIn;
  loggedInEl.hidden = !s.loggedIn;
  if (!s.loggedIn) return;

  await loadPerfil();
  loadSaqueHistory();
  loadDonations();
  loadBlocked();
}

pixKeyInputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("pix-key-save").click(); });

document.getElementById("pix-key-save").addEventListener("click", async () => {
  const pixKey = pixKeyInputEl.value.trim();
  pixKeyFeedbackEl.hidden = true;
  if (!pixKey) return;
  const ok = await confirmDialog({
    title: "Trocar chave Pix",
    message: `Confirmar troca da chave Pix pra "${pixKey}"? Por segurança, o saque fica bloqueado por 24h depois da troca.`,
    confirmLabel: "Trocar chave",
  });
  if (!ok) return;
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

wireCopyButton(document.getElementById("obs-link-copy"), obsLinkInputEl);

// duplica o mapa de presets do alerta.js de propósito -- cada página do
// site já tem seus próprios helpers pequenos (formatBRL, confirmDialog),
// aqui só serve pra tocar a prévia local, quem manda de verdade no overlay
// é o alerta.js lendo o mesmo nome via /api/l/:id/alert-config
const CHIME_PRESETS = {
  classic: { wave: "sine", apoio: [660, 880] },
  arcade: { wave: "square", apoio: [523, 659, 784] },
  chill: { wave: "triangle", apoio: [440, 554] },
  bell: { wave: "sine", apoio: [880, 1108] },
};

function playChimePreview(name) {
  try {
    const preset = CHIME_PRESETS[name] || CHIME_PRESETS.classic;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    preset.apoio.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = preset.wave;
      osc.frequency.value = freq;
      const t = now + i * 0.09;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch (err) {
  }
}

function applyChimeSelection() {
  chimeRows.forEach((row) => row.classList.toggle("selected", row.dataset.chime === selectedChime));
  chimeSaveBtn.disabled = selectedChime === savedChime;
}

function applyCustomSoundStatus() {
  chimeCustomPreviewBtn.disabled = !customSoundUrl;
  chimeCustomStatusEl.textContent = customSoundUrl
    ? "Áudio enviado."
    : "Nenhum áudio enviado ainda (até 10s, MP3/WAV/OGG).";
}

chimeRows.forEach((row) => {
  row.addEventListener("click", (e) => {
    if (e.target.closest(".perfil-chime-actions")) return;
    if (row.dataset.chime === "custom" && !customSoundUrl) return;
    selectedChime = row.dataset.chime;
    applyChimeSelection();
  });
});

document.querySelectorAll(".perfil-chime-preview").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (btn === chimeCustomPreviewBtn) {
      if (customSoundUrl) new Audio(customSoundUrl).play().catch(() => {});
      return;
    }
    playChimePreview(btn.dataset.preview);
  });
});

chimeCustomUploadBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  chimeCustomInputEl.click();
});

chimeCustomInputEl.addEventListener("click", (e) => e.stopPropagation());

chimeCustomInputEl.addEventListener("change", () => {
  const file = chimeCustomInputEl.files && chimeCustomInputEl.files[0];
  if (!file) return;

  const probe = new Audio(URL.createObjectURL(file));
  probe.addEventListener("loadedmetadata", () => {
    if (probe.duration > MAX_CUSTOM_SOUND_SECONDS) {
      chimeCustomStatusEl.textContent = `Esse áudio tem ${probe.duration.toFixed(1)}s -- o limite é ${MAX_CUSTOM_SOUND_SECONDS}s.`;
      chimeCustomInputEl.value = "";
      return;
    }
    uploadCustomSound(file);
  });
  probe.addEventListener("error", () => uploadCustomSound(file));
});

async function uploadCustomSound(file) {
  chimeCustomStatusEl.textContent = "Enviando...";
  chimeCustomUploadBtn.disabled = true;
  try {
    const formData = new FormData();
    formData.append("audio", file);
    const data = await perfilFetch("/alert-sound", { method: "POST", body: formData });
    customSoundUrl = data.url;
    selectedChime = "custom";
    savedChime = "custom";
    applyCustomSoundStatus();
    applyChimeSelection();
  } catch (err) {
    chimeCustomStatusEl.textContent = "Erro: " + err.message;
  } finally {
    chimeCustomUploadBtn.disabled = false;
    chimeCustomInputEl.value = "";
  }
}

chimeSaveBtn.addEventListener("click", async () => {
  chimeFeedbackEl.hidden = true;
  chimeSaveBtn.disabled = true;
  try {
    await perfilFetch("/alert-chime", { method: "POST", body: JSON.stringify({ chime: selectedChime }) });
    savedChime = selectedChime;
    chimeFeedbackEl.textContent = "Som do alerta salvo! Vale pra todos os seus leilões.";
    chimeFeedbackEl.className = "perfil-feedback ok";
    chimeFeedbackEl.hidden = false;
  } catch (err) {
    chimeFeedbackEl.textContent = "Erro: " + err.message;
    chimeFeedbackEl.className = "perfil-feedback error";
    chimeFeedbackEl.hidden = false;
  } finally {
    applyChimeSelection();
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
