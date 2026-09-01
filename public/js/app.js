const LEILAO_ID = location.pathname.match(/^\/l\/([a-z0-9_-]+)/i)?.[1] || null;
if (!LEILAO_ID) {
  document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;color:#ccc;background:#1c1c1f;">Link de leilão inválido. Volte pra <a href="/" style="color:#ff7a45;">criar ou achar o seu</a>.</p>';
  throw new Error("LEILAO_ID ausente na URL");
}

const socket = io({ query: { leilaoId: LEILAO_ID } });

const lotListEl = document.getElementById("lot-list");
const emptyStateEl = document.getElementById("empty-state");
const donorListEl = document.getElementById("donor-list");
const donorEmptyEl = document.getElementById("donor-empty");
const historyListEl = document.getElementById("history-list");
const historyEmptyEl = document.getElementById("history-empty");
const statusEl = document.getElementById("status");
const statusTextEl = document.getElementById("status-text");
const titleEl = document.getElementById("title");
const hostNameEl = document.getElementById("host-name");
const hostAvatarEl = document.getElementById("host-avatar");
const hostTwitchBadgeEl = document.getElementById("host-twitch-badge");
const hostTwitchLinkEl = document.getElementById("host-twitch-link");
const topbarMenuAvatarLinkEl = document.getElementById("topbar-menu-avatar-link");
const topbarMenuTriggerEl = document.getElementById("topbar-menu-trigger");
const topbarMenuDropdownEl = document.getElementById("topbar-menu-dropdown");
const topbarMenuAvatarEl = document.getElementById("topbar-menu-avatar");
const topbarMenuAvatarPlaceholderEl = document.getElementById("topbar-menu-avatar-placeholder");
const systemSwitchProfileLinkEl = document.getElementById("system-switch-profile-link");
const systemSwitchProfileAvatarEl = document.getElementById("system-switch-profile-avatar");
const systemSwitchProfilePlaceholderEl = document.getElementById("system-switch-profile-placeholder");
const notifBellTriggerEl = document.getElementById("notif-bell-trigger");
const notifBellDropdownEl = document.getElementById("notif-bell-dropdown");
const notifBellBadgeEl = document.getElementById("notif-bell-badge");
const notifBellPendingEl = document.getElementById("notif-bell-pending");
const notifBellPendingReactsEl = document.getElementById("notif-bell-pending-reacts");
const notifBellReactsLabelEl = document.getElementById("notif-bell-reacts-label");
const notifBellListEl = document.getElementById("notif-bell-list");
const notifBellEmptyEl = document.getElementById("notif-bell-empty");
const lotContextMenuEl = document.getElementById("lot-context-menu");
const timerEl = document.getElementById("timer");
const timerClockEl = document.getElementById("timer-clock");
const timerLabelEl = document.getElementById("timer-label");
const statTotalEl = document.getElementById("stat-total");
const topbarTotalEl = document.getElementById("topbar-total");
const totalHideToggleEl = document.getElementById("total-hide-toggle");
const lotCountEl = document.getElementById("lot-count");
const donorCountEl = document.getElementById("donor-count");
const presenterToggleEl = document.getElementById("presenter-toggle");
const presenterExitEl = document.getElementById("presenter-exit");
const presenterDrawerEl = document.getElementById("presenter-drawer");
const presenterFabEl = document.getElementById("presenter-fab");
const systemSwitchEl = document.getElementById("system-switch");
const systemSwitchLeilaoBtn = document.getElementById("system-switch-leilao");
const systemSwitchReactsBtn = document.getElementById("system-switch-reacts");
const arenaPanelLabelEl = document.getElementById("arena-panel-label");
const arenaPanelIconLeilaoEl = document.getElementById("arena-panel-icon-leilao");
const arenaPanelIconReactsEl = document.getElementById("arena-panel-icon-reacts");
const arenaPanelTitleEl = document.getElementById("arena-panel-title");
const timerPanelEl = document.getElementById("timer-panel");
const historyPanelEl = document.getElementById("history-panel");
const reactPlaylistPanelEl = document.getElementById("react-playlist-panel");
const reactQueueCountEl = document.getElementById("react-queue-count");
const reactQueueListEl = document.getElementById("react-queue-list");
const reactHistorySectionEl = document.getElementById("react-history-section");
const reactHistoryListEl = document.getElementById("react-history-list");
const modeToggleBoardEl = document.getElementById("mode-toggle-board");
const timerRingFillEl = document.getElementById("timer-ring-fill");
const donateModalTimerEl = document.getElementById("donate-modal-timer");
const donateModalTimerLabelEl = document.getElementById("donate-modal-timer-label");
const donateModalTimerClockEl = document.getElementById("donate-modal-timer-clock");
const boardEl = document.querySelector(".board");
const soldOverlayEl = document.getElementById("sold-overlay");
const soldMarkEl = document.getElementById("sold-mark");
const recapOverlayEl = document.getElementById("recap-overlay");
const recapTitleEl = document.getElementById("recap-title");
const recapTotalEl = document.getElementById("recap-total");
const recapDurationEl = document.getElementById("recap-duration");
const recapDonorsEl = document.getElementById("recap-donors");
const recapGamesEl = document.getElementById("recap-games");
const recapPodiumEl = document.getElementById("recap-podium");
const recapExtraEl = document.getElementById("recap-extra");
const recapExtraListEl = document.getElementById("recap-extra-list");
const recapDonorListEl = document.getElementById("recap-donor-list");
const recapShareXEl = document.getElementById("recap-share-x");
const recapDownloadBtnEl = document.getElementById("recap-download-btn");
const recapDonorsLabelEl = document.getElementById("recap-donors-label");
const recapCloseEl = document.getElementById("recap-close");
const recapEyebrowEl = document.getElementById("recap-eyebrow");
const recapHostAvatarEl = document.getElementById("recap-host-avatar");
const historyOverlayEl = document.getElementById("history-overlay");
const historyCloseEl = document.getElementById("history-close");
const historyGridEl = document.getElementById("history-grid");
const historyModalEmptyEl = document.getElementById("history-modal-empty");
const historyOpenBtnEl = document.getElementById("history-open-btn");
const pixWarningEl = document.getElementById("pix-warning");
const pixWarningCloseEl = document.getElementById("pix-warning-close");

const lotModalEl = document.getElementById("lot-modal");
const lotModalThumb = document.getElementById("lot-modal-thumb");
const lotModalEyebrow = document.getElementById("lot-modal-eyebrow");
const lotModalTitle = document.getElementById("lot-modal-title");
const lotModalCurrent = document.getElementById("lot-modal-current");
const lotModalActionSeg = document.getElementById("lot-modal-action");
const lotModalAmount = document.getElementById("lot-modal-amount");
const lotModalDonor = document.getElementById("lot-modal-donor");
const lotModalSubmit = document.getElementById("lot-modal-submit");
const lotModalCancel = document.getElementById("lot-modal-cancel");
const lotModalClose = document.getElementById("lot-modal-close");
const donorInputEl = document.getElementById("lot-modal-donor");
const donorSuggestionsEl = document.getElementById("donor-suggestions");

const lotModalTitleEditBtn = document.getElementById("lot-modal-title-edit");
const lotModalAmountFieldsEl = document.getElementById("lot-modal-amount-fields");
const lotModalRenameFieldEl = document.getElementById("lot-modal-rename-field");
const lotModalRenameInputEl = document.getElementById("lot-modal-rename-input");
const lotModalRenameShelfEl = document.getElementById("lot-modal-rename-shelf");
const lotModalRenameCancelBtn = document.getElementById("lot-modal-rename-cancel");
const lotModalRenameSaveBtn = document.getElementById("lot-modal-rename-save");

const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * 28;

let timerEndsAt = null;
let timerDurationMs = 5 * 60 * 1000;
let isOpenState = null;
let isPausedState = false;
let pausedRemainingMs = null;
let isTimerLockedState = false;
let historyItems = [];
let currentLeaderKey = null;
let lastTotalRaised = null;
let previousTotals = new Map();
let streakTimers = new Map();
let lastStreakTierByKey = new Map();
let hasRenderedLotsOnce = false;
let lastDuelPair = null;
let currentItems = [];
let donorNames = [];
let currentReactVideos = [];
let modalGame = null;

function formatBRL(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "jogo" ou "filme" -- os textos que mencionam o tipo de item do catálogo se
// adaptam sozinhos conforme a modalidade do leilão (ver /admin/set-mode)
const MEDIA_LABELS = { jogos: "jogo", filmes: "filme" };
let currentMode = "jogos";

function mediaLabel() { return MEDIA_LABELS[currentMode] || "jogo"; }
function mediaLabelCap() {
  const label = mediaLabel();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function applyMediaLabels(mode) {
  currentMode = mode === "filmes" ? "filmes" : "jogos";
  const media = mediaLabel();
  const Media = mediaLabelCap();
  const fill = (template) => template.replace(/\{Media\}/g, Media).replace(/\{media\}/g, media);
  document.querySelectorAll("[data-label-text]").forEach((el) => { el.textContent = fill(el.dataset.labelText); });
  document.querySelectorAll("[data-label-placeholder]").forEach((el) => { el.placeholder = fill(el.dataset.labelPlaceholder); });
  document.querySelectorAll("[data-label-title]").forEach((el) => { el.title = fill(el.dataset.labelTitle); });

  if (modeToggleBoardEl) {
    modeToggleBoardEl.dataset.mode = currentMode;
    const otherLabel = currentMode === "filmes" ? "Jogos" : "Filmes";
    modeToggleBoardEl.title = `Modalidade: ${Media}s (clique pra trocar pra ${otherLabel})`;
    modeToggleBoardEl.setAttribute("aria-label", `Trocar modalidade do leilão pra ${otherLabel}`);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const TITLE_SWAP_ICONS = {
  o: {
    className: "icon-coin",
    svg: `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" fill="currentColor"/><path d="M10 6v8M12.1 7.7c-.3-.7-1-1.1-2.1-1.1-1.2 0-2.1.6-2.1 1.5 0 1.9 4.2.8 4.2 2.7 0 .9-.9 1.5-2.1 1.5-1 0-1.8-.4-2.1-1.1" stroke="var(--bg)" stroke-width="1.1" stroke-linecap="round" fill="none"/></svg>`,
  },
  a: {
    className: "icon-controller",
    svg: `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="7.3" width="14" height="7.4" rx="3.7" fill="currentColor"/><path d="M6.3 9.3v3.4M4.6 11h3.4" stroke="var(--bg)" stroke-width="1.1" stroke-linecap="round"/><circle cx="14.3" cy="9.9" r=".95" fill="var(--bg)"/><circle cx="12.3" cy="11.9" r=".95" fill="var(--bg)"/></svg>`,
  },
  e: {
    className: "icon-dice",
    svg: `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="3.5" width="13" height="13" rx="3.4" fill="currentColor"/><circle cx="7" cy="7" r="1.25" fill="var(--bg)"/><circle cx="10" cy="10" r="1.25" fill="var(--bg)"/><circle cx="13" cy="13" r="1.25" fill="var(--bg)"/></svg>`,
  },
  i: {
    className: "icon-trophy",
    svg: `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M6 4h8v3a4 4 0 0 1-8 0V4z" fill="currentColor"/><path d="M6 4.8H4.5a1.3 1.3 0 0 0-1.3 1.3c0 1.4 1.1 2.5 2.5 2.5H6M14 4.8h1.5a1.3 1.3 0 0 1 1.3 1.3c0 1.4-1.1 2.5-2.5 2.5H14" fill="currentColor"/><rect x="9.2" y="10.7" width="1.6" height="3.1" fill="currentColor"/><path d="M7 15.3h6l-.6-1.9H7.6l-.6 1.9z" fill="currentColor"/></svg>`,
  },
  s: {
    className: "icon-star",
    svg: `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2.6l2.1 4.9 5.3.5-4 3.6 1.2 5.2L10 13.9l-4.6 2.9 1.2-5.2-4-3.6 5.3-.5L10 2.6z" fill="currentColor"/></svg>`,
  },
};

function buildBrandTitleHtml(text) {
  const used = new Set();
  return [...text].map((ch) => {
    const swap = TITLE_SWAP_ICONS[ch.toLowerCase()];
    if (!swap || used.has(ch.toLowerCase())) return escapeHtml(ch);
    used.add(ch.toLowerCase());
    return `<span class="title-swap"><span class="title-swap-char">${escapeHtml(ch)}</span><span class="title-swap-icon ${swap.className}" aria-hidden="true">${swap.svg}</span></span>`;
  }).join("");
}

let animateTitleSwapIcon = null;
async function animateBrandTitleSwaps() {
  const swaps = [...titleEl.querySelectorAll(".title-swap")];
  if (!swaps.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    if (!animateTitleSwapIcon) {
      ({ animate: animateTitleSwapIcon } = await import("https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm"));
    }
    swaps.forEach((swap, i) => {
      const opts = { duration: 5.5, repeat: Infinity, delay: i * 1.1, times: [0, 0.55, 0.65, 0.9, 1], ease: "easeInOut" };
      animateTitleSwapIcon(swap.querySelector(".title-swap-char"), { opacity: [1, 1, 0, 0, 1] }, opts);
      animateTitleSwapIcon(swap.querySelector(".title-swap-icon"), { opacity: [0, 0, 1, 1, 0] }, opts);
    });
  } catch (err) {
    console.error("Falha ao animar título:", err.message);
  }
}

let lastRenderedTitle = null;
function renderBrandTitle(text) {
  if (text === lastRenderedTitle) return;
  lastRenderedTitle = text;
  titleEl.innerHTML = buildBrandTitleHtml(text || "");
  animateBrandTitleSwaps();
}

function bumpValue(el, text) {
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove("tick");
  void el.offsetWidth;
  el.classList.add("tick");
}

function buildOdometerDigit() {
  const wrap = document.createElement("span");
  wrap.className = "odometer-digit";
  const strip = document.createElement("span");
  strip.className = "odometer-strip";
  for (let i = 0; i <= 9; i++) {
    const num = document.createElement("span");
    num.className = "odometer-num";
    num.textContent = String(i);
    strip.appendChild(num);
  }
  wrap.appendChild(strip);
  return wrap;
}

// dígitos de verdade (não texto plano) pra cada posição poder "girar" na
// própria coluna de 0 a 9 -- é isso que da o efeito de caça-níquel durante
// o count-up, sem precisar de nenhuma lib externa
function renderOdometer(el, formattedStr) {
  const chars = formattedStr.split("");
  const existing = Array.from(el.children);
  const needsRebuild = existing.length !== chars.length || existing.some((node, i) => {
    const isDigitChar = /\d/.test(chars[i]);
    const isDigitNode = node.classList.contains("odometer-digit");
    return isDigitChar !== isDigitNode || (!isDigitChar && node.textContent !== chars[i]);
  });

  if (needsRebuild) {
    el.innerHTML = "";
    chars.forEach((ch) => {
      if (/\d/.test(ch)) {
        const digit = buildOdometerDigit();
        digit.querySelector(".odometer-strip").style.transform = `translateY(-${ch}em)`;
        el.appendChild(digit);
      } else {
        const sep = document.createElement("span");
        sep.className = "odometer-sep";
        sep.textContent = ch;
        el.appendChild(sep);
      }
    });
    return;
  }

  chars.forEach((ch, i) => {
    if (!/\d/.test(ch)) return;
    existing[i].querySelector(".odometer-strip").style.transform = `translateY(-${ch}em)`;
  });
}

let totalCountUpFrame = null;
function animateCountUp(el, from, to, duration = 700, onDone) {
  if (totalCountUpFrame) cancelAnimationFrame(totalCountUpFrame);
  const start = performance.now();
  const diff = to - from;
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    renderOdometer(el, Math.round(from + diff * eased).toLocaleString("pt-BR"));
    if (t < 1) {
      totalCountUpFrame = requestAnimationFrame(step);
    } else {
      totalCountUpFrame = null;
      if (onDone) onDone();
    }
  }
  totalCountUpFrame = requestAnimationFrame(step);
}

function flashTotalBeam() {
  topbarTotalEl.classList.remove("beam");
  void topbarTotalEl.offsetWidth;
  topbarTotalEl.classList.add("beam");
}

function triggerTick(el) {
  el.classList.remove("tick");
  void el.offsetWidth;
  el.classList.add("tick");
}

function setStatus(online) {
  statusEl.classList.toggle("online", online);
  statusTextEl.textContent = online ? "ao vivo" : "reconectando…";
}

const PIX_WARNING_DISMISSED_KEY = `pix-warning-dismissed-${LEILAO_ID}`;

function updatePixWarning() {
  const active = document.body.classList.contains("presenter-mode");
  const dismissed = localStorage.getItem(PIX_WARNING_DISMISSED_KEY) === "true";
  pixWarningEl.hidden = !(active && !dismissed);
}

pixWarningCloseEl.addEventListener("click", () => {
  localStorage.setItem(PIX_WARNING_DISMISSED_KEY, "true");
  updatePixWarning();
});

socket.on("connect", () => {
  setStatus(true);
  loadInitialHistory();
});
socket.on("disconnect", () => setStatus(false));

function setRingFraction(fraction) {
  const offset = TIMER_RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, fraction)));
  timerRingFillEl.style.strokeDashoffset = String(offset);
}

const FINAL_COUNTDOWN_SECONDS = 90;

function syncDonateModalTimer() {
  donateModalTimerEl.hidden = !isOpenState;
  donateModalTimerLabelEl.textContent = timerLabelEl.textContent;
  donateModalTimerClockEl.textContent = timerClockEl.textContent;
  donateModalTimerEl.classList.toggle("urgent", timerEl.classList.contains("urgent"));
  donateModalTimerEl.classList.toggle("closed", timerEl.classList.contains("closed"));
}

function tickTimer() {
  if (!isOpenState) {
    timerEl.classList.add("closed");
    timerEl.classList.remove("urgent", "paused");
    boardEl.classList.remove("final-countdown");
    timerLabelEl.textContent = "leilão";
    timerClockEl.textContent = "ENCERRADO";
    setRingFraction(0);
    syncDonateModalTimer();
    return;
  }

  if (isPausedState) {
    timerEl.classList.add("paused");
    timerEl.classList.remove("closed", "urgent");
    boardEl.classList.remove("final-countdown");
    const totalSeconds = Math.ceil((pausedRemainingMs || 0) / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    timerLabelEl.textContent = "pausado em";
    timerClockEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    setRingFraction((pausedRemainingMs || 0) / timerDurationMs);
    syncDonateModalTimer();
    return;
  }

  timerEl.classList.remove("closed", "paused");
  if (!timerEndsAt) return;
  const msLeft = timerEndsAt - Date.now();
  if (msLeft <= 0) {
    timerLabelEl.textContent = "leilão";
    timerClockEl.textContent = "ENCERRADO";
    timerEl.classList.add("closed");
    boardEl.classList.remove("final-countdown");
    setRingFraction(0);
    syncDonateModalTimer();
    return;
  }
  const totalSeconds = Math.ceil(msLeft / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  timerLabelEl.textContent = "encerra em";
  timerClockEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  timerEl.classList.toggle("urgent", totalSeconds <= FINAL_COUNTDOWN_SECONDS);
  boardEl.classList.toggle("final-countdown", totalSeconds <= FINAL_COUNTDOWN_SECONDS);
  setRingFraction(msLeft / timerDurationMs);
  syncDonateModalTimer();
}
setInterval(tickTimer, 1000);

// mesmo glifo oficial da Twitch usado em .host-twitch-badge -- placeholder
// pra lote sem capa (jogo desconhecido ou "quadro" da live que não é
// jogo/filme de verdade, nunca vai achar capa numa busca IGDB/TMDB)
const TWITCH_ICON_SVG = `<svg class="icon" viewBox="0 0 2400 2800" fill="currentColor" aria-hidden="true"><path d="M500 0 0 500v1800h600v500l500-500h400l900-900V0H500zm1600 1300-400 400h-400l-350 350v-350H500V200h1600v1100z" /><path d="M1700 550h200v600h-200zM1150 550h200v600h-200z" /></svg>`;

function thumbHtml(item, className) {
  return item.image
    ? `<img class="${className}" src="${escapeHtml(item.image)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${className} ${className}-placeholder',innerHTML:${JSON.stringify(TWITCH_ICON_SVG)}}))" />`
    : `<div class="${className} ${className}-placeholder">${TWITCH_ICON_SVG}</div>`;
}

const MEDAL_ICON_SVG = `<svg class="medal-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M7.5 11L4.5 17.5L7.3 16.6L9 19L10.8 14.8" fill="currentColor" opacity="0.85"/>
  <path d="M12.5 11L15.5 17.5L12.7 16.6L11 19L9.2 14.8" fill="currentColor" opacity="0.85"/>
  <circle cx="10" cy="7.5" r="5.5" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.4"/>
  <rect x="8.6" y="6.1" width="2.8" height="2.8" fill="currentColor" transform="rotate(45 10 7.5)"/>
</svg>`;

const RECORD_BOLT_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M11 2.5 4.5 11.5h4.2L8 17.5l7.5-9.5h-4.5L11 2.5z" fill="currentColor"/>
</svg>`;

function rankBadgeHtml(rank) {
  const num = `<b>${String(rank).padStart(2, "0")}</b>`;
  return rank <= 3 ? MEDAL_ICON_SVG + num : num;
}

function lotFundingHtml(item) {
  const added = item.added > 0 ? `<span class="lot-funding-add">+${formatBRL(item.added)}</span>` : "";
  const removed = item.removed > 0 ? `<span class="lot-funding-remove">−${formatBRL(item.removed)}</span>` : "";
  if (!added && !removed) return "";
  return `<div class="lot-funding">${added}${removed}</div>`;
}

function lotTopDonorHtml(item) {
  if (!item.topDonor || !item.topDonor.username) return "";
  const avatar = item.topDonor.avatar
    ? `<img class="lot-top-donor-avatar" src="${escapeHtml(item.topDonor.avatar)}" alt="" loading="lazy" />`
    : `<span class="lot-top-donor-avatar lot-top-donor-avatar-placeholder">${escapeHtml(item.topDonor.username[0].toUpperCase())}</span>`;
  return `
    <div class="lot-top-donor" title="Quem mais apoiou este ${mediaLabel()}">
      ${avatar}
      <span class="lot-top-donor-name">${escapeHtml(item.topDonor.username)}</span>
    </div>
  `;
}

// modo corrida: meta manual do apresentador (botão direito no card) -- vale
// pra apoio e sabotagem juntos (item.total já é o líquido), então uma
// sabotagem pesada pode derrubar o progresso, não só apoio soma.
function lotRaceHtml(item) {
  if (!item.raceGoal) return "";
  const pct = Math.max(0, Math.min(100, Math.round((item.total / item.raceGoal) * 100)));
  const label = item.raceGoalReached
    ? "meta batida, classificado!"
    : `faltam ${formatBRL(Math.max(0, item.raceGoal - item.total))} pra classificar`;
  return `
    <div class="lot-race${item.raceGoalReached ? " is-reached" : ""}">
      <div class="lot-race-track"><div class="lot-race-fill" style="width:${pct}%"></div></div>
      <span class="lot-race-label">${FLAG_ICON_SVG}${label}</span>
    </div>
  `;
}

function raceQualifiedBadgeHtml(item) {
  if (!item.qualifiedByRace) return "";
  return `<span class="badge-race-qualified" title="Classificado pela meta da corrida, não pelo valor"><svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2.5v15"/><path d="M4 3.5c2-1 3.5 1 5.5 0s3.5-1 5.5 0v6c-2-1-3.5 1-5.5 0s-3.5-1-5.5 0z"/></svg>classificado</span>`;
}

function lotCardInnerHtml(item, barPct, hitBadge, changed, streakBadge, duelGlow, duelBadge) {
  const thumb = thumbHtml(item, "lot-thumb");
  const bg = item.image
    ? `<div class="lot-card-bg" style="background-image:url('${escapeHtml(item.image)}')"></div>`
    : "";
  return `
    ${bg}
    <div class="lot-card-fill"></div>
    ${duelGlow}
    <div class="lot-card-content">
      <span class="lot-rank">${rankBadgeHtml(item.rank)}</span>
      ${thumb}
      <div class="lot-info">
        <p class="lot-name">${escapeHtml(item.name)}</p>
        <span class="lot-total${changed ? " tick" : ""}${item.total < 0 ? " lot-total-negative" : ""}">${formatBRL(item.total)}</span>
      </div>
      ${item.raceGoal || item.added > 0 || item.removed > 0 || (item.topDonor && item.topDonor.username) ? `
        <div class="lot-extras">
          ${lotRaceHtml(item)}
          ${lotFundingHtml(item)}
          ${lotTopDonorHtml(item)}
        </div>
      ` : ""}
    </div>
    <div class="lot-corner">
      ${raceQualifiedBadgeHtml(item)}
      ${streakBadge}
      ${duelBadge}
      ${hitBadge}
      <div class="lot-edit">
        <button data-key="${item.key}" type="button" aria-label="Editar ${escapeHtml(item.name)}" title="Editar">
          <svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3.5l3.5 3.5L6.5 17 2.5 17.5 3 13.5 13 3.5z"/><path d="M11.3 5.2l3.5 3.5"/></svg>
        </button>
      </div>
    </div>
  `;
}

let draggedLotKey = null;

// listeners vão direto no elemento .lot-card, que é reaproveitado entre
// renders (só o innerHTML troca) -- por isso só precisa ligar uma vez
// quando o card é criado, não em todo update do placar
function wireLotCardDrag(card) {
  card.addEventListener("dragstart", (e) => {
    if (!document.body.classList.contains("presenter-mode")) return e.preventDefault();
    draggedLotKey = card.dataset.key;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", draggedLotKey);
    requestAnimationFrame(() => card.classList.add("dragging"));
  });

  card.addEventListener("dragover", (e) => {
    if (!draggedLotKey || draggedLotKey === card.dataset.key) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    card.classList.add("drop-target");
  });

  card.addEventListener("dragleave", () => card.classList.remove("drop-target"));

  card.addEventListener("drop", async (e) => {
    e.preventDefault();
    card.classList.remove("drop-target");
    const fromKey = draggedLotKey;
    const toKey = card.dataset.key;
    draggedLotKey = null;
    if (!fromKey || fromKey === toKey) return;
    await confirmAndMergeLots(fromKey, toKey);
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    lotListEl.querySelectorAll(".lot-card.drop-target").forEach((el) => el.classList.remove("drop-target"));
    draggedLotKey = null;
  });
}

async function confirmAndMergeLots(fromKey, toKey) {
  const fromItem = currentItems.find((i) => i.key === fromKey);
  const toItem = currentItems.find((i) => i.key === toKey);
  if (!fromItem || !toItem) return;

  const ok = await confirmDialog({
    title: `Mesclar ${mediaLabel()}s`,
    message: `Juntar "${fromItem.name}" (${formatBRL(fromItem.total)}) em "${toItem.name}"? O resultado fica com o nome "${toItem.name}" e total de ${formatBRL(fromItem.total + toItem.total)}. Essa ação não pode ser desfeita.`,
    confirmLabel: "Mesclar",
    danger: true,
  });
  if (!ok) return;

  try {
    await presenterFetch("/admin/merge", { method: "POST", body: JSON.stringify({ fromKey, toKey }) });
  } catch (err) {
    alert(err.message);
  }
}

// mesmo gesto de arrastar-e-soltar do merge de lotes acima, só que pra
// apoiador com nome digitado errado -- diferente de lotListEl (cards
// reaproveitados via data-key, listener preso na criação), donorListEl
// é reconstruído inteiro a cada renderDonors(), então os listeners ficam
// no container estável (delegação) em vez de em cada linha.
let draggedDonorUsername = null;

donorListEl.addEventListener("dragstart", (e) => {
  const row = e.target.closest("[data-donor-username]");
  if (!row) return;
  if (!document.body.classList.contains("presenter-mode")) return e.preventDefault();
  const username = row.dataset.donorUsername;
  if (!username) return e.preventDefault(); // "Anônimo" não é uma pessoa só pra mesclar
  draggedDonorUsername = username;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", username);
  requestAnimationFrame(() => row.classList.add("dragging"));
});

donorListEl.addEventListener("dragover", (e) => {
  const row = e.target.closest("[data-donor-username]");
  if (!row || !draggedDonorUsername || draggedDonorUsername === row.dataset.donorUsername) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  row.classList.add("drop-target");
});

donorListEl.addEventListener("dragleave", (e) => {
  const row = e.target.closest("[data-donor-username]");
  if (row) row.classList.remove("drop-target");
});

donorListEl.addEventListener("drop", async (e) => {
  const row = e.target.closest("[data-donor-username]");
  if (!row) return;
  e.preventDefault();
  row.classList.remove("drop-target");
  const fromUsername = draggedDonorUsername;
  const toUsername = row.dataset.donorUsername;
  draggedDonorUsername = null;
  if (!fromUsername || !toUsername || fromUsername === toUsername) return;
  await confirmAndMergeDonors(fromUsername, toUsername);
});

donorListEl.addEventListener("dragend", (e) => {
  const row = e.target.closest("[data-donor-username]");
  if (row) row.classList.remove("dragging");
  donorListEl.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
  draggedDonorUsername = null;
});

async function confirmAndMergeDonors(fromUsername, toUsername) {
  const ok = await confirmDialog({
    title: "Mesclar apoiador",
    message: `Juntar as doações de "${fromUsername}" em "${toUsername}"? Todo o histórico passa a contar como "${toUsername}". Essa ação não pode ser desfeita.`,
    confirmLabel: "Mesclar",
    danger: true,
  });
  if (!ok) return;
  try {
    await presenterFetch("/admin/merge-donor", { method: "POST", body: JSON.stringify({ fromUsername, toUsername }) });
  } catch (err) {
    alert(err.message);
  }
}

// modo corrida: botão direito num card do catálogo (só modo apresentador)
// abre esse menu, próprio, em vez do menu nativo do navegador.
const FLAG_ICON_SVG = `<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2.5v15"/><path d="M4 3.5c2-1 3.5 1 5.5 0s3.5-1 5.5 0v6c-2-1-3.5 1-5.5 0s-3.5-1-5.5 0z"/></svg>`;
const STOP_ICON_SVG = `<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M7 7l6 6M13 7l-6 6"/></svg>`;
const TRASH_ICON_SVG = `<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5h12"/><path d="M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5"/><path d="M5.5 5.5l.6 10a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4l.6-10"/><path d="M8.3 8.5v5M11.7 8.5v5"/></svg>`;
const REACT_ICON_SVG = `<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="10.5" rx="1.5"/><path d="M8.2 8.1l4 2.1-4 2.1V8.1z" fill="currentColor" stroke="none"/><path d="M6 17h8"/></svg>`;
const PLAY_ICON_SVG = `<svg class="icon" viewBox="0 0 20 20" fill="none" stroke="none" aria-hidden="true"><path d="M6 4.5v11l8-5.5-8-5.5z" fill="currentColor"/></svg>`;

let contextMenuTargetKey = null;
let contextMenuTargetVideoId = null;

function closeLotContextMenu() {
  lotContextMenuEl.hidden = true;
  contextMenuTargetKey = null;
  contextMenuTargetVideoId = null;
}

function openLotContextMenu(x, y, item) {
  contextMenuTargetKey = item.key;
  const head = `
    <div class="lot-context-menu-head">
      <span class="lot-context-menu-eyebrow">${FLAG_ICON_SVG}modo corrida</span>
      <span class="lot-context-menu-game">${escapeHtml(item.name)}</span>
    </div>
  `;
  const raceActions = item.raceGoal
    ? `
      <button class="lot-context-menu-item" type="button" data-act="race-edit">${FLAG_ICON_SVG}Editar meta da corrida</button>
      <button class="lot-context-menu-item danger" type="button" data-act="race-deactivate">${STOP_ICON_SVG}Desativar modo corrida</button>
    `
    : `<button class="lot-context-menu-item" type="button" data-act="race-activate">${FLAG_ICON_SVG}Ativar modo corrida</button>`;
  const actions = raceActions + `<button class="lot-context-menu-item danger" type="button" data-act="game-delete">${TRASH_ICON_SVG}Excluir jogo</button>`;
  lotContextMenuEl.innerHTML = head + actions;
  lotContextMenuEl.hidden = false;
  lotContextMenuEl.style.left = "0px";
  lotContextMenuEl.style.top = "0px";
  const rect = lotContextMenuEl.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
  lotContextMenuEl.style.left = `${left}px`;
  lotContextMenuEl.style.top = `${top}px`;
}

// modo reacts: mesmo menu de contexto do modo corrida (reaproveita o
// mesmo elemento/CSS), só que a única ação é arquivar um vídeo já
// liberado -- não faz sentido "marcar como reagido" um vídeo que ainda
// não bateu a própria meta, por isso só abre pra vídeos "unlocked".
function openReactContextMenu(x, y, video) {
  contextMenuTargetVideoId = video.id;
  const head = `
    <div class="lot-context-menu-head">
      <span class="lot-context-menu-eyebrow">${REACT_ICON_SVG}modo reacts</span>
      <span class="lot-context-menu-game">${escapeHtml(video.title || "")}</span>
    </div>
  `;
  const actions = `<button class="lot-context-menu-item" type="button" data-act="react-mark-reacted">${REACT_ICON_SVG}Marcar como reagido</button>`;
  lotContextMenuEl.innerHTML = head + actions;
  lotContextMenuEl.hidden = false;
  lotContextMenuEl.style.left = "0px";
  lotContextMenuEl.style.top = "0px";
  const rect = lotContextMenuEl.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
  lotContextMenuEl.style.left = `${left}px`;
  lotContextMenuEl.style.top = `${top}px`;
}

lotListEl.addEventListener("contextmenu", (e) => {
  if (!document.body.classList.contains("presenter-mode")) return;
  const card = e.target.closest(".lot-card");
  if (!card) return;
  const item = currentItems.find((i) => i.key === card.dataset.key);
  if (!item) return;
  e.preventDefault();
  openLotContextMenu(e.clientX, e.clientY, item);
});

// "marcar como reagido" só faz sentido pra vídeo já liberado, que agora
// mora na fila da playlist (coluna direita) -- não mais no painel central
// (lá só tem vídeo "active", ainda não bateu a meta).
reactQueueListEl.addEventListener("contextmenu", (e) => {
  if (!document.body.classList.contains("presenter-mode")) return;
  const row = e.target.closest(".react-queue-row");
  if (!row) return;
  const video = currentReactVideos.find((v) => v.id === row.dataset.videoId && v.status === "unlocked");
  if (!video) return;
  e.preventDefault();
  openReactContextMenu(e.clientX, e.clientY, video);
});

document.addEventListener("click", (e) => {
  if (lotContextMenuEl.hidden || lotContextMenuEl.contains(e.target)) return;
  closeLotContextMenu();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !lotContextMenuEl.hidden) closeLotContextMenu(); });
document.addEventListener("scroll", () => { if (!lotContextMenuEl.hidden) closeLotContextMenu(); }, true);
window.addEventListener("blur", () => { if (!lotContextMenuEl.hidden) closeLotContextMenu(); });

lotContextMenuEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;

  if (act === "react-mark-reacted") {
    const videoId = contextMenuTargetVideoId;
    closeLotContextMenu();
    if (!videoId) return;
    try {
      await presenterFetch(`/admin/reacts/${videoId}/mark-reacted`, { method: "POST" });
    } catch (err) {
      alert(err.message);
    }
    return;
  }

  const key = contextMenuTargetKey;
  closeLotContextMenu();
  if (!key) return;
  const item = currentItems.find((i) => i.key === key);
  if (!item) return;

  if (act === "race-activate" || act === "race-edit") {
    openRaceModal(item);
    return;
  }

  if (act === "race-deactivate") {
    const ok = await confirmDialog({
      title: "Desativar modo corrida",
      message: `Remover a meta de "${item.name}"? A barra de progresso some do card.`,
      confirmLabel: "Desativar",
      danger: true,
    });
    if (!ok) return;
    try {
      await presenterFetch(`/admin/race-goal/${encodeURIComponent(key)}`, { method: "DELETE" });
    } catch (err) {
      alert(err.message);
    }
  }

  if (act === "game-delete") {
    const ok = await confirmDialog({
      title: "Excluir jogo",
      message: `Excluir "${item.name}" do catálogo? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    try {
      await presenterFetch(`/admin/game/${encodeURIComponent(key)}`, { method: "DELETE" });
    } catch (err) {
      alert(err.message);
    }
  }
});

// modal de definir/editar a meta da corrida -- mostra capa+nome do jogo e
// uma prévia ao vivo da mesma barra que aparece no card (mesmas classes
// .lot-race/.lot-race-track/.lot-race-fill, só sem o fundo em chip).
const raceModalEl = document.getElementById("race-modal");
const raceModalCloseEl = document.getElementById("race-modal-close");
const raceModalThumbEl = document.getElementById("race-modal-thumb");
const raceModalTitleEl = document.getElementById("race-modal-title");
const raceModalCurrentValueEl = document.getElementById("race-modal-current-value");
const raceModalInputEl = document.getElementById("race-modal-input");
const raceModalPreviewEl = document.getElementById("race-modal-preview");
const raceModalPreviewFillEl = document.getElementById("race-modal-preview-fill");
const raceModalPreviewLabelEl = document.getElementById("race-modal-preview-label");
const raceModalConfirmEl = document.getElementById("race-modal-confirm");
const raceModalCancelEl = document.getElementById("race-modal-cancel");
const raceModalDeactivateEl = document.getElementById("race-modal-deactivate");

let raceModalItem = null;

function updateRaceModalPreview() {
  const goal = Number(raceModalInputEl.value);
  const total = raceModalItem ? raceModalItem.total : 0;
  if (!goal || goal <= 0) {
    raceModalPreviewEl.classList.remove("is-reached");
    raceModalPreviewFillEl.style.width = "0%";
    raceModalPreviewLabelEl.innerHTML = "defina um valor acima do já arrecadado";
    return;
  }
  const reached = total >= goal;
  const pct = Math.max(0, Math.min(100, Math.round((total / goal) * 100)));
  raceModalPreviewEl.classList.toggle("is-reached", reached);
  raceModalPreviewFillEl.style.width = `${pct}%`;
  raceModalPreviewLabelEl.innerHTML = reached
    ? `${FLAG_ICON_SVG}já bateria a meta, classificado na hora`
    : `${FLAG_ICON_SVG}faltariam ${formatBRL(Math.max(0, goal - total))} pra classificar`;
}

function openRaceModal(item) {
  raceModalItem = item;
  raceModalTitleEl.textContent = item.name;
  if (item.image) {
    raceModalThumbEl.src = item.image;
    raceModalThumbEl.hidden = false;
  } else {
    raceModalThumbEl.hidden = true;
    raceModalThumbEl.removeAttribute("src");
  }
  raceModalCurrentValueEl.textContent = formatBRL(item.total);
  raceModalInputEl.value = item.raceGoal ? item.raceGoal.toFixed(2) : "";
  raceModalConfirmEl.textContent = item.raceGoal ? "Salvar meta" : "Ativar corrida";
  raceModalDeactivateEl.hidden = !item.raceGoal;
  updateRaceModalPreview();
  raceModalEl.hidden = false;
  setTimeout(() => { raceModalInputEl.focus(); raceModalInputEl.select(); }, 40);
}

function closeRaceModal() {
  raceModalEl.hidden = true;
  raceModalItem = null;
}

raceModalInputEl.addEventListener("input", updateRaceModalPreview);
raceModalInputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") raceModalConfirmEl.click(); });
raceModalCloseEl.addEventListener("click", closeRaceModal);
raceModalCancelEl.addEventListener("click", closeRaceModal);
raceModalEl.addEventListener("click", (e) => { if (e.target === raceModalEl) closeRaceModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !raceModalEl.hidden) closeRaceModal(); });

raceModalConfirmEl.addEventListener("click", async () => {
  if (!raceModalItem) return;
  const value = raceModalInputEl.value;
  if (!value || Number(value) <= 0) return raceModalInputEl.focus();
  raceModalConfirmEl.disabled = true;
  try {
    await presenterFetch("/admin/race-goal", { method: "POST", body: JSON.stringify({ key: raceModalItem.key, amount: value }) });
    closeRaceModal();
  } catch (err) {
    alert(err.message);
  } finally {
    raceModalConfirmEl.disabled = false;
  }
});

raceModalDeactivateEl.addEventListener("click", async () => {
  if (!raceModalItem) return;
  const ok = await confirmDialog({
    title: "Desativar modo corrida",
    message: `Remover a meta de "${raceModalItem.name}"? A barra de progresso some do card.`,
    confirmLabel: "Desativar",
    danger: true,
  });
  if (!ok) return;
  try {
    await presenterFetch(`/admin/race-goal/${encodeURIComponent(raceModalItem.key)}`, { method: "DELETE" });
    closeRaceModal();
  } catch (err) {
    alert(err.message);
  }
});

function triggerBigWinCelebration(key, type) {
  const card = lotListEl.querySelector(`.lot-card[data-key="${CSS.escape(key)}"]`);
  if (!card) return;
  const rect = card.getBoundingClientRect();
  const isAdd = type === "add";
  const colors = isAdd
    ? ["var(--accent)", "var(--accent-text)", "var(--positive)", "var(--silver)"]
    : ["var(--danger)", "#ff8fa8", "var(--muted)"];
  const burst = document.createElement("div");
  burst.className = "confetti-burst";
  burst.style.left = `${rect.left}px`;
  burst.style.top = `${rect.top}px`;
  burst.style.width = `${rect.width}px`;
  burst.style.height = `${rect.height}px`;
  const count = isAdd ? 40 : 26;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece" + (isAdd ? "" : " confetti-piece-spark");
    const angle = Math.random() * 360;
    const dist = 70 + Math.random() * 130;
    piece.style.setProperty("--dx", `${Math.cos((angle * Math.PI) / 180) * dist}px`);
    piece.style.setProperty("--dy", `${Math.sin((angle * Math.PI) / 180) * dist - 30}px`);
    piece.style.setProperty("--rot", `${Math.random() * 900 - 450}deg`);
    piece.style.left = `${20 + Math.random() * 60}%`;
    piece.style.top = `${30 + Math.random() * 30}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${1.9 + Math.random() * 0.7}s`;
    piece.style.animationDelay = `${Math.random() * 0.25}s`;
    burst.appendChild(piece);
  }
  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 2900);
}

// dispara só quando o jogo SOBE de nível de streak (2->3 doações vira nível
// 1, 4 vira nível 2, 7 vira nível 3) -- não em toda doação dentro do mesmo nível
function triggerStreakIgnite(key, tier) {
  const card = lotListEl.querySelector(`.lot-card[data-key="${CSS.escape(key)}"]`);
  if (!card) return;

  const flash = document.createElement("span");
  flash.className = "streak-ignite-flash" + (tier >= 3 ? " streak-ignite-flash-strong" : "");
  flash.setAttribute("aria-hidden", "true");
  card.appendChild(flash);
  setTimeout(() => flash.remove(), 700);

  const rect = card.getBoundingClientRect();
  const colors = tier >= 3
    ? ["var(--danger)", "var(--accent)", "#ffb347"]
    : ["var(--accent)", "var(--accent-text)", "#ffb347"];
  const burst = document.createElement("div");
  burst.className = "confetti-burst";
  burst.style.left = `${rect.left}px`;
  burst.style.top = `${rect.top}px`;
  burst.style.width = `${rect.width}px`;
  burst.style.height = `${rect.height}px`;
  const count = tier >= 3 ? 22 : 14;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece confetti-piece-ember";
    // majoritariamente pra cima -- faísca subindo, não confete caindo
    const angle = -90 + (Math.random() * 100 - 50);
    const dist = 40 + Math.random() * 90;
    piece.style.setProperty("--dx", `${Math.cos((angle * Math.PI) / 180) * dist}px`);
    piece.style.setProperty("--dy", `${Math.sin((angle * Math.PI) / 180) * dist}px`);
    piece.style.left = `${30 + Math.random() * 40}%`;
    piece.style.top = `${40 + Math.random() * 30}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.color = colors[i % colors.length];
    piece.style.animationDuration = `${1.1 + Math.random() * 0.5}s`;
    piece.style.animationDelay = `${Math.random() * 0.15}s`;
    burst.appendChild(piece);
  }
  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 1900);
}

// clímax da disputa pela vaga: o desafiante VIROU o jogo de verdade (rank
// trocou de lugar entre os dois mesmos jogos) -- momento mais intenso que o
// ignite do streak, com faíscas de impacto nos dois cards + rajada no meio
function triggerDuelOvertake(defenderKey, challengerKey) {
  const defenderCard = lotListEl.querySelector(`.lot-card[data-key="${CSS.escape(defenderKey)}"]`);
  const challengerCard = lotListEl.querySelector(`.lot-card[data-key="${CSS.escape(challengerKey)}"]`);
  [defenderCard, challengerCard].forEach((card) => {
    if (!card) return;
    const flash = document.createElement("span");
    flash.className = "duel-overtake-flash";
    flash.setAttribute("aria-hidden", "true");
    card.appendChild(flash);
    setTimeout(() => flash.remove(), 900);

    const punch = document.createElement("span");
    punch.className = "duel-overtake-punch";
    punch.setAttribute("aria-hidden", "true");
    card.appendChild(punch);
    setTimeout(() => punch.remove(), 550);
  });

  const anchor = defenderCard || challengerCard;
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const colors = ["var(--accent)", "var(--danger)", "#ffb347", "var(--accent-text)"];
  const burst = document.createElement("div");
  burst.className = "confetti-burst";
  burst.style.left = `${rect.left}px`;
  burst.style.top = `${rect.top - 30}px`;
  burst.style.width = `${rect.width}px`;
  burst.style.height = `${rect.height + 60}px`;
  for (let i = 0; i < 36; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece confetti-piece-spark";
    const angle = Math.random() * 360;
    const dist = 70 + Math.random() * 150;
    piece.style.setProperty("--dx", `${Math.cos((angle * Math.PI) / 180) * dist}px`);
    piece.style.setProperty("--dy", `${Math.sin((angle * Math.PI) / 180) * dist - 20}px`);
    piece.style.setProperty("--rot", `${Math.random() * 900 - 450}deg`);
    piece.style.left = `${15 + Math.random() * 70}%`;
    piece.style.top = `${20 + Math.random() * 50}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${1.4 + Math.random() * 0.6}s`;
    piece.style.animationDelay = `${Math.random() * 0.2}s`;
    burst.appendChild(piece);
  }
  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 2400);
}

function renderLots(items, flashKey, flashType, lastSabotagedKey, qualifyCount) {
  lotCountEl.textContent = String(items.length);

  if (items.length === 0) {
    emptyStateEl.style.display = "flex";
    lotListEl.innerHTML = emptyStateEl.outerHTML;
    previousTotals = new Map();
    currentLeaderKey = null;
    streakTimers.forEach((timer) => clearTimeout(timer));
    streakTimers.clear();
    lastStreakTierByKey.clear();
    lastDuelPair = null;
    return;
  }
  emptyStateEl.style.display = "none";

  const staleEmpty = lotListEl.querySelector(".arena-empty");
  if (staleEmpty) staleEmpty.remove();
  // troca de reacts pra leilão: limpa cards de vídeo que possam ter ficado
  // pra trás -- diferente do .lot-card, o resto desse render é incremental
  // (reaproveita/cria por chave), então nada mais aqui removeria sozinho.
  lotListEl.querySelectorAll(".react-card").forEach((el) => el.remove());

  const maxTotal = Math.max(...items.map((i) => i.total), 1);
  const nextTotals = new Map();

  const firstRects = new Map();
  lotListEl.querySelectorAll(".lot-card").forEach((el) => {
    firstRects.set(el.dataset.key, el.getBoundingClientRect());
  });

  // "disputa pela vaga": o último classificado (defensor) vs o primeiro de
  // fora (desafiante), só quando o placar tá de verdade próximo -- senão
  // não faz sentido chamar de disputa um 500 contra um 5
  let duelDefender = null;
  let duelChallenger = null;
  if (items.length > qualifyCount) {
    const defenderCandidate = items.find((i) => i.rank === qualifyCount) || null;
    const challengerCandidate = items.find((i) => i.rank === qualifyCount + 1) || null;
    if (defenderCandidate && challengerCandidate && defenderCandidate.total > 0) {
      const ratio = challengerCandidate.total / defenderCandidate.total;
      if (ratio >= 0.65) {
        duelDefender = defenderCandidate;
        duelChallenger = challengerCandidate;
      }
    }
  }
  const wasDuelPair = lastDuelPair;
  const isSameDuelPairSwapped = duelDefender && duelChallenger && wasDuelPair
    && wasDuelPair.defenderKey === duelChallenger.key
    && wasDuelPair.challengerKey === duelDefender.key;
  const shouldTriggerOvertake = hasRenderedLotsOnce && isSameDuelPairSwapped;
  lastDuelPair = duelDefender && duelChallenger
    ? { defenderKey: duelDefender.key, challengerKey: duelChallenger.key }
    : null;

  const seenKeys = new Set();
  items.forEach((item) => {
    seenKeys.add(item.key);
    const flashClass = item.key === flashKey
      ? (flashType === "remove" ? " flash-remove" : flashType === "add" ? " flash-add" : "")
      : "";
    const isFlashingSabotage = item.key === flashKey && flashType === "remove";
    const hitBadge = isFlashingSabotage
      ? '<span class="badge-hit">sabotado agora</span>'
      : (item.key === lastSabotagedKey ? '<span class="badge-hit badge-hit-last">último sabotado</span>' : "");
    const barPct = item.total > 0 ? Math.max(3, Math.round((item.total / maxTotal) * 100)) : 0;
    const changed = previousTotals.has(item.key) && previousTotals.get(item.key) !== item.total;
    nextTotals.set(item.key, item.total);

    const now = Date.now();
    const combo = item.combo;
    const streakActive = !!combo && combo.count >= 2 && combo.expiresAt > now;
    const tier = streakActive ? streakTier(combo.count) : 0;
    const streakBadge = streakActive
      ? `<span class="badge-streak" data-tier="${tier}">×${combo.count}</span>`
      : "";
    const streakClass = streakActive ? " is-streaking" : "";

    const isDuelDefender = duelDefender && item.key === duelDefender.key;
    const isDuelChallenger = duelChallenger && item.key === duelChallenger.key;
    const duelClass = isDuelDefender ? " is-duel-defender" : isDuelChallenger ? " is-duel-challenger" : "";
    const duelGlow = isDuelDefender
      ? '<span class="duel-glow" data-role="defender" aria-hidden="true"></span>'
      : isDuelChallenger
        ? '<span class="duel-glow" data-role="challenger" aria-hidden="true"></span>'
        : "";
    const duelBadge = isDuelDefender
      ? '<span class="badge-duel" data-role="defender">defendendo a vaga</span>'
      : isDuelChallenger
        ? `<span class="badge-duel" data-role="challenger">faltam ${formatBRL(duelDefender.total - item.total)}</span>`
        : "";

    let card = lotListEl.querySelector(`.lot-card[data-key="${CSS.escape(item.key)}"]`);
    if (!card) {
      card = document.createElement("div");
      card.dataset.key = item.key;
      card.draggable = true;
      wireLotCardDrag(card);
    }
    card.className = `lot-card rank-${item.rank}${flashClass}${streakClass}${duelClass}`;
    if (streakActive) card.dataset.streakTier = String(tier);
    else delete card.dataset.streakTier;
    card.style.setProperty("--pct", `${barPct}%`);
    card.innerHTML = lotCardInnerHtml(item, barPct, hitBadge, changed, streakBadge, duelGlow, duelBadge);
    lotListEl.appendChild(card);

    if (streakActive) {
      scheduleStreakExpiry(item.key, combo.expiresAt - now);
      // não dispara no primeiro render (reload/reconexão no meio de um streak já em andamento)
      if (hasRenderedLotsOnce && tier >= 2 && tier > (lastStreakTierByKey.get(item.key) || 0)) {
        triggerStreakIgnite(item.key, tier);
      }
    }
    lastStreakTierByKey.set(item.key, tier);

    if (item.rank === qualifyCount && items.length > qualifyCount) {
      let divider = lotListEl.querySelector(".qualify-divider");
      if (!divider) {
        divider = document.createElement("div");
        divider.className = "qualify-divider";
      }
      const isDuel = !!(duelDefender && duelChallenger);
      divider.className = `qualify-divider${isDuel ? " is-duel" : ""}`;
      divider.innerHTML = `<span>${isDuel ? "disputa pela última vaga" : "classificados até aqui"}</span>`;
      lotListEl.appendChild(divider);
    }
  });
  hasRenderedLotsOnce = true;
  // só depois do forEach: o card.innerHTML = ... acima apagaria o flash/punch
  // se a rajada disparasse antes dos cards serem reconstruídos
  if (shouldTriggerOvertake) triggerDuelOvertake(duelDefender.key, duelChallenger.key);
  if (items.length <= qualifyCount) {
    const divider = lotListEl.querySelector(".qualify-divider");
    if (divider) divider.remove();
  }

  lotListEl.querySelectorAll(".lot-card").forEach((el) => {
    if (!seenKeys.has(el.dataset.key)) el.remove();
  });
  streakTimers.forEach((timer, key) => {
    if (!seenKeys.has(key)) {
      clearTimeout(timer);
      streakTimers.delete(key);
    }
  });
  lastStreakTierByKey.forEach((_tier, key) => {
    if (!seenKeys.has(key)) lastStreakTierByKey.delete(key);
  });

  previousTotals = nextTotals;

  lotListEl.querySelectorAll(".lot-edit button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = currentItems.find((i) => i.key === btn.dataset.key);
      if (item) openLotModal(item);
    });
  });

  requestAnimationFrame(() => {
    lotListEl.querySelectorAll(".lot-card").forEach((el) => {
      const first = firstRects.get(el.dataset.key);
      if (!first) return;
      const last = el.getBoundingClientRect();
      const deltaX = first.left - last.left;
      const deltaY = first.top - last.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
      el.style.transition = "none";
      el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 0.5s var(--ease)";
        el.style.transform = "";
      });
    });
  });

  if (flashKey) {
    const flashedCard = lotListEl.querySelector(`.lot-card[data-key="${CSS.escape(flashKey)}"]`);
    if (flashedCard) {
      setTimeout(() => {
        flashedCard.classList.remove("flash-add", "flash-remove");
        const badge = flashedCard.querySelector(".badge-hit:not(.badge-hit-last)");
        if (badge) {
          badge.textContent = "último sabotado";
          badge.classList.add("badge-hit-last");
        }
      }, 4000);
    }
  }

  const leader = items.find((i) => i.rank === 1) || null;
  const newLeaderKey = leader ? leader.key : null;
  if (newLeaderKey && newLeaderKey !== currentLeaderKey && currentLeaderKey !== null) {
    const leaderCard = lotListEl.querySelector(`.lot-card[data-key="${CSS.escape(newLeaderKey)}"]`);
    if (leaderCard) {
      leaderCard.classList.add("lead-shift");
      setTimeout(() => leaderCard.classList.remove("lead-shift"), 700);
    }
  }
  currentLeaderKey = newLeaderKey;
}

let currentActiveSystem = "leilao";

// troca visual entre leilão e reacts -- os dois catálogos são exclusivos
// (server.js só deixa um activeSystem por vez), então isso decide o que
// #lot-list mostra e o rótulo/ícone do painel central. Chamado depois de
// applyMediaLabels no handler de "update": em modo leilão o texto do painel
// já veio certo de lá (data-label-text), aqui só sobrescreve quando reacts.
function setActiveSystemUI(system) {
  currentActiveSystem = system === "reacts" ? "reacts" : "leilao";
  const isReacts = currentActiveSystem === "reacts";
  systemSwitchLeilaoBtn.classList.toggle("active", !isReacts);
  systemSwitchLeilaoBtn.setAttribute("aria-pressed", String(!isReacts));
  systemSwitchReactsBtn.classList.toggle("active", isReacts);
  systemSwitchReactsBtn.setAttribute("aria-pressed", String(isReacts));
  arenaPanelIconLeilaoEl.hidden = isReacts;
  arenaPanelIconReactsEl.hidden = !isReacts;
  arenaPanelLabelEl.title = isReacts ? "Vídeos pra reagir" : "Catálogo do leilão";
  if (isReacts) arenaPanelTitleEl.textContent = "Vídeos pra reagir";
  // timer+histórico só fazem sentido pro leilão (countdown de round, feed
  // de doação) -- reacts troca pela playlist (fila de liberados + já
  // reagidos). Os três ficam sempre no DOM, só alterna hidden -- evita
  // destruir/reconstruir a lógica do timer, que roda independente disso.
  timerPanelEl.hidden = isReacts;
  historyPanelEl.hidden = isReacts;
  reactPlaylistPanelEl.hidden = !isReacts;
  // "total arrecadado" é uma métrica do leilão (proceeds do round) -- não
  // faz sentido nesse contexto, então some do topbar durante o reacts.
  topbarTotalEl.hidden = isReacts;
}

async function setActiveSystem(system) {
  try {
    await presenterFetch("/admin/active-system", { method: "POST", body: JSON.stringify({ system }) });
  } catch (err) {
    alert(err.message);
  }
}
systemSwitchLeilaoBtn.addEventListener("click", () => setActiveSystem("leilao"));
systemSwitchReactsBtn.addEventListener("click", () => setActiveSystem("reacts"));

function reactThumbHtml(video, baseClass) {
  const letter = escapeHtml(((video.title || "?")[0] || "?").toUpperCase());
  if (video.thumbnail) {
    return `<img class="${baseClass}" src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${baseClass}-placeholder',textContent:'${letter}'}))" />`;
  }
  return `<div class="${baseClass}-placeholder">${letter}</div>`;
}

// barra de progresso de meta do reacts -- classe própria (não reaproveita
// .lot-race do modo corrida): mecânica parecida (barra + label), mas é
// outro domínio (corrida compete contra outros itens, reacts só acumula
// pra uma meta própria), o cliente pediu design separado dos dois.
function reactGoalHtml(video) {
  const goal = video.goal || 0;
  const total = video.total || 0;
  const pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((total / goal) * 100))) : 0;
  const label = goal > 0 ? `faltam ${formatBRL(Math.max(0, goal - total))} pra liberar` : "aguardando meta";
  return `
    <div class="react-goal">
      <div class="react-goal-track"><div class="react-goal-fill" style="width:${pct}%"></div></div>
      <span class="react-goal-label">${PLAY_ICON_SVG}${label}</span>
    </div>
  `;
}

// vídeo mais perto de bater a meta ganha destaque grande no painel
// central -- os liberados não aparecem mais aqui (viram fila na playlist,
// coluna direita), então tudo que passa por aqui é sempre "active".
function reactFeaturedHtml(video) {
  return `
    <div class="react-featured" data-video-id="${escapeHtml(video.id)}">
      ${reactThumbHtml(video, "react-featured-thumb")}
      <div class="react-featured-body">
        <p class="react-featured-title" title="${escapeHtml(video.title || "")}">${escapeHtml(video.title || "Vídeo sem título")}</p>
        <span class="react-featured-submitter">sugerido por ${escapeHtml(video.submittedBy || "Anônimo")}</span>
        ${reactGoalHtml(video)}
      </div>
    </div>
  `;
}

function reactCardHtml(video) {
  return `
    <div class="react-card" data-video-id="${escapeHtml(video.id)}">
      ${reactThumbHtml(video, "react-card-thumb")}
      <div class="react-card-body">
        <p class="react-card-title" title="${escapeHtml(video.title || "")}">${escapeHtml(video.title || "Vídeo sem título")}</p>
        <span class="react-card-submitter">sugerido por ${escapeHtml(video.submittedBy || "Anônimo")}</span>
        ${reactGoalHtml(video)}
      </div>
    </div>
  `;
}

// painel central do reacts: 1 vídeo em destaque (o mais perto de liberar)
// + o resto dos vídeos em andamento numa grade compacta. Vídeos já
// liberados saem daqui de vez -- não fazem mais parte do funil de
// arrecadação, viram fila de reação na playlist (coluna direita).
function renderReactVideos(videos) {
  const inProgress = videos.filter((v) => v.status === "active");
  lotCountEl.textContent = String(inProgress.length);
  if (inProgress.length === 0) {
    lotListEl.innerHTML = `
      <p class="empty-state arena-empty">
        <span class="arena-empty-title">Nenhum vídeo em andamento</span>
        Assim que um vídeo aprovado receber doação, ele aparece aqui.
      </p>
    `;
    return;
  }
  const sorted = [...inProgress].sort((a, b) => {
    const pctA = a.goal > 0 ? a.total / a.goal : 0;
    const pctB = b.goal > 0 ? b.total / b.goal : 0;
    return pctB - pctA;
  });
  const [featured, ...rest] = sorted;
  const restHtml = rest.length ? `<div class="react-grid">${rest.map(reactCardHtml).join("")}</div>` : "";
  lotListEl.innerHTML = reactFeaturedHtml(featured) + restHtml;
}

function reactQueueRowHtml(video, isHistory) {
  const meta = isHistory && video.updatedAt
    ? `${escapeHtml(video.submittedBy || "Anônimo")} · ${new Date(video.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : `sugerido por ${escapeHtml(video.submittedBy || "Anônimo")}`;
  return `
    <div class="react-queue-row${isHistory ? " is-history" : ""}" data-video-id="${escapeHtml(video.id)}">
      ${reactThumbHtml(video, "react-queue-thumb")}
      <div class="react-queue-body">
        <p class="react-queue-title" title="${escapeHtml(video.title || "")}">${escapeHtml(video.title || "Vídeo sem título")}</p>
        <span class="react-queue-submitter">${meta}</span>
      </div>
    </div>
  `;
}

// playlist (coluna direita, substitui timer+histórico no reacts): fila
// dos liberados esperando reação (mais antigo primeiro -- é o próximo da
// vez) + histórico dos já reagidos abaixo (mais recente primeiro).
function renderReactPlaylist(queue, history) {
  const sortedQueue = [...queue].sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0));
  reactQueueCountEl.textContent = String(sortedQueue.length);
  reactQueueListEl.innerHTML = sortedQueue.length
    ? sortedQueue.map((v) => reactQueueRowHtml(v, false)).join("")
    : '<p class="empty-state" id="react-queue-empty">Nenhum vídeo esperando reação ainda.</p>';

  const sortedHistory = [...history].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  reactHistorySectionEl.hidden = sortedHistory.length === 0;
  reactHistoryListEl.innerHTML = sortedHistory.map((v) => reactQueueRowHtml(v, true)).join("");
}

// totalRaised (bruto do leilão inteiro) só pra calcular a % de "domínio" do
// 1º colocado -- null quando o streamer oculta o total (getHideTotalRaised
// no server): sem isso, a barra de domínio vazaria o total pela % + valor
// do próprio doador, que continua público mesmo com o total oculto.
function renderDonors(donors, totalRaised) {
  donorEmptyEl.style.display = donors.length === 0 ? "flex" : "none";
  const [leader, ...rest] = donors;
  const maxTotal = Math.max(...rest.map((d) => d.total), 1);

  let leaderHtml = "";
  if (leader) {
    const avatar = leader.avatar
      ? `<img class="donor-leader-avatar" src="${escapeHtml(leader.avatar)}" alt="" loading="lazy" />`
      : `<span class="donor-leader-avatar donor-avatar-placeholder">${escapeHtml((leader.username || "?")[0].toUpperCase())}</span>`;
    const dominance = totalRaised > 0 ? Math.max(2, Math.min(100, Math.round((leader.total / totalRaised) * 100))) : null;
    leaderHtml = `
    <div class="donor-leader" draggable="true" data-donor-username="${escapeHtml(leader.username || "")}">
      <div class="donor-leader-avatar-wrap">
        ${avatar}
        <span class="donor-leader-badge">01</span>
      </div>
      <div class="donor-leader-data">
        <span class="donor-leader-name">${escapeHtml(leader.username || "Anônimo")}
          <svg class="donor-leader-star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.7 6.9L12 17.3l-6.3 3.9 1.7-6.9L2 9.7l7.1-.6L12 2.5z"/></svg>
        </span>
        <span class="donor-leader-total">${formatBRL(leader.total)}</span>
        ${dominance !== null ? `
        <div class="donor-dominance">
          <span class="donor-dominance-label">domínio <b>${dominance}%</b></span>
          <div class="donor-dominance-bar"><i style="width:${dominance}%"></i></div>
        </div>` : ""}
      </div>
    </div>
  `;
  }

  const rows = rest.map((d) => {
    const pct = d.total > 0 ? Math.max(4, Math.round((d.total / maxTotal) * 100)) : 0;
    const avatar = d.avatar
      ? `<img class="donor-avatar" src="${escapeHtml(d.avatar)}" alt="" loading="lazy" />`
      : `<span class="donor-avatar donor-avatar-placeholder">${escapeHtml((d.username || "?")[0].toUpperCase())}</span>`;
    return `
    <div class="donor-row rank-${d.rank}" style="--pct:${pct}%" draggable="true" data-donor-username="${escapeHtml(d.username || "")}">
      <div class="donor-row-fill"></div>
      <span class="donor-rank">${rankBadgeHtml(d.rank)}</span>
      ${avatar}
      <span class="donor-name">${escapeHtml(d.username || "Anônimo")}</span>
      <span class="donor-total">${formatBRL(d.total)}</span>
    </div>
  `;
  });
  donorListEl.innerHTML = (donors.length === 0 ? donorEmptyEl.outerHTML : "") + leaderHtml + rows.join("");
  donorCountEl.textContent = String(donors.length);
}

function historyLabel(event) {
  if (event.type === "add" || event.type === "manual") {
    return { text: `<span class="who">${escapeHtml(event.username || "Anônimo")}</span> apoiou <strong>${escapeHtml(event.game ? event.game.name : "")}</strong>`, dot: "dot-add", amtClass: "amt-add" };
  }
  if (event.type === "remove") {
    return { text: `<span class="who">${escapeHtml(event.username || "Anônimo")}</span> tirou pontos de <strong>${escapeHtml(event.game ? event.game.name : "")}</strong>`, dot: "dot-remove", amtClass: "amt-remove" };
  }
  if (event.type === "pending") {
    return { text: `<span class="who">${escapeHtml(event.username || "Anônimo")}</span> doou, aguardando identificação`, dot: "dot-pending", amtClass: "amt-pending" };
  }
  if (event.type === "ignored") {
    return { text: `<span class="who">${escapeHtml(event.username || "Anônimo")}</span> doou sem indicar um lote`, dot: "", amtClass: "" };
  }
  if (event.type === "closed") {
    return { text: `<span class="who">${escapeHtml(event.username || "Anônimo")}</span> doou (leilão encerrado, não contabilizado)`, dot: "", amtClass: "" };
  }
  return null;
}

function historyBadgeHtml(dotClass) {
  if (dotClass === "dot-add") {
    return `<span class="history-badge badge-add"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3M3 6l3-3 3 3"/></svg></span>`;
  }
  if (dotClass === "dot-remove") {
    return `<span class="history-badge badge-remove"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v6M3 6l3 3 3-3"/></svg></span>`;
  }
  if (dotClass === "dot-pending") {
    return `<span class="history-badge badge-pending"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v3l2 2"/><circle cx="6" cy="6" r="4.3"/></svg></span>`;
  }
  return "";
}

function historyAvatarHtml(event, dotClass) {
  const avatar = event.avatar
    ? `<img class="history-avatar" src="${escapeHtml(event.avatar)}" alt="" loading="lazy" />`
    : `<span class="history-avatar history-avatar-placeholder">${escapeHtml((event.username || "?")[0].toUpperCase())}</span>`;
  return `<div class="history-avatar-wrap">${avatar}${historyBadgeHtml(dotClass)}</div>`;
}

let historySortMode = "recent";

function sortedHistoryItems() {
  if (historySortMode === "high") return [...historyItems].sort((a, b) => (b.amount || 0) - (a.amount || 0));
  if (historySortMode === "low") return [...historyItems].sort((a, b) => (a.amount || 0) - (b.amount || 0));
  return historyItems;
}

function renderHistory() {
  historyEmptyEl.style.display = historyItems.length === 0 ? "flex" : "none";
  const rows = sortedHistoryItems().slice(0, 50).map((event) => {
    const info = historyLabel(event);
    if (!info) return "";
    const time = event.time ? new Date(event.time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
    const amount = info.amtClass ? `<span class="history-amt ${info.amtClass}">${formatBRL(event.amount || 0)}</span>` : "";
    return `
      <li>
        ${historyAvatarHtml(event, info.dot)}
        <div class="history-body">
          <span class="history-text">${info.text}</span>
          <div class="history-meta">
            <span class="history-time">${time}</span>
            ${amount}
          </div>
        </div>
      </li>
    `;
  });
  historyListEl.innerHTML = (historyItems.length === 0 ? historyEmptyEl.outerHTML : "") + rows.join("");
}

const historySortBtn = document.getElementById("history-sort-btn");
const historySortLabelEl = document.getElementById("history-sort-label");
const HISTORY_SORT_CYCLE = { recent: "high", high: "low", low: "recent" };
const HISTORY_SORT_LABELS = { recent: "recentes", high: "maior valor", low: "menor valor" };

historySortBtn.addEventListener("click", () => {
  historySortMode = HISTORY_SORT_CYCLE[historySortMode];
  historySortLabelEl.textContent = HISTORY_SORT_LABELS[historySortMode];
  historySortBtn.classList.toggle("active", historySortMode !== "recent");
  renderHistory();
});

function pushHistory(event) {
  if (!event || !historyLabel(event)) return;
  historyItems.unshift({ ...event, time: Date.now() });
  historyItems = historyItems.slice(0, 50);
  renderHistory();
  renderNotifBell();
}

async function loadInitialHistory() {
  try {
    const res = await fetch(`/api/l/${LEILAO_ID}/events/recent?limit=30`);
    const data = await res.json();
    historyItems = data.events
      .filter((e) => e.action === "add" || e.action === "remove" || e.action === "ignored")
      .map((e) => ({
        type: e.pending ? "pending" : e.dismissed ? "ignored" : e.action,
        username: e.username,
        amount: e.amount,
        avatar: e.avatar,
        message: e.raw_message,
        eventId: e.id,
        pending: !!e.pending,
        game: e.game_name ? { name: e.game_name } : null,
        time: e.created_at ? new Date(e.created_at).getTime() : Date.now(),
      }));
    renderHistory();
    renderNotifBell();
  } catch (err) {
    console.error("Erro ao carregar histórico:", err);
  }
}

// fila de doações que não deram pra ligar a nenhum jogo (ver
// findExistingGameInText/logPendingDonation no servidor) -- carregada à
// parte de historyItems porque essa lista precisa ser completa (não só os
// últimos 30 eventos), senão uma pendência antiga cairia fora do sino sem
// ninguém notar.
let pendingDonations = [];
let pendingReactVideos = [];

async function loadPendingDonations() {
  try {
    const { pending } = await presenterFetch("/admin/pending");
    pendingDonations = pending || [];
    renderNotifBell();
  } catch (err) {
    console.error("Erro ao carregar doações pendentes:", err);
  }
}

async function loadPendingReactVideos() {
  try {
    const { pending } = await presenterFetch("/admin/reacts/pending");
    pendingReactVideos = pending || [];
    renderNotifBell();
  } catch (err) {
    console.error("Erro ao carregar vídeos pendentes do modo reacts:", err);
  }
}

function notifItemAvatarHtml(username, avatar) {
  return avatar
    ? `<img class="notif-item-avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" />`
    : `<span class="notif-item-avatar">${escapeHtml((username || "?")[0].toUpperCase())}</span>`;
}

function notifPendingItemHtml(ev) {
  const time = ev.created_at ? new Date(ev.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  const msg = (ev.raw_message || "").trim();
  return `
    <div class="notif-item is-pending" data-event-id="${ev.id}">
      ${notifItemAvatarHtml(ev.username, ev.avatar)}
      <div class="notif-item-body">
        <div class="notif-item-meta">
          <span class="notif-item-who">${escapeHtml(ev.username || "Anônimo")}</span>
          <span class="notif-item-amt">${formatBRL(centsToNumberLocal(ev.amount_cents))}</span>
          <span class="notif-item-time">${time}</span>
        </div>
        <p class="notif-item-msg${msg ? "" : " is-empty"}">${msg ? escapeHtml(msg) : "sem mensagem"}</p>
        <div class="notif-item-actions">
          <button class="btn-mini primary" data-act="notif-identify" data-event-id="${ev.id}" type="button">identificar</button>
          <button class="btn-mini" data-act="notif-dismiss" data-event-id="${ev.id}" type="button">apoio geral</button>
        </div>
      </div>
    </div>
  `;
}

function notifPendingReactItemHtml(video) {
  const time = video.createdAt ? new Date(video.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  const amount = video.pendingAmountCents ? formatBRL(centsToNumberLocal(video.pendingAmountCents)) : "";
  return `
    <div class="notif-item is-pending" data-video-id="${escapeHtml(video.id)}">
      ${notifItemAvatarHtml(video.title, video.thumbnail)}
      <div class="notif-item-body">
        <div class="notif-item-meta">
          <span class="notif-item-who">${escapeHtml(video.submittedBy || "Anônimo")}</span>
          ${amount ? `<span class="notif-item-amt">${amount}</span>` : ""}
          <span class="notif-item-time">${time}</span>
        </div>
        <p class="notif-item-msg">${escapeHtml(video.title || video.url || "")}</p>
        <div class="notif-item-actions">
          <button class="btn-mini primary" data-act="react-approve" data-video-id="${escapeHtml(video.id)}" type="button">aprovar</button>
          <button class="btn-mini" data-act="react-reject" data-video-id="${escapeHtml(video.id)}" type="button">rejeitar</button>
        </div>
      </div>
    </div>
  `;
}

function notifFeedItemHtml(item) {
  const info = historyLabel(item);
  if (!info) return "";
  const time = item.time ? new Date(item.time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  const msg = (item.message || "").trim();
  return `
    <div class="notif-item">
      ${notifItemAvatarHtml(item.username, item.avatar)}
      <div class="notif-item-body">
        <div class="notif-item-meta">
          <span class="notif-item-who">${info.text}</span>
          <span class="notif-item-time">${time}</span>
        </div>
        ${msg ? `<p class="notif-item-msg">${escapeHtml(msg)}</p>` : ""}
      </div>
    </div>
  `;
}

// centsToNumber já existe (usado no resto do app.js) pra valores que chegam
// prontos do servidor em reais -- doações pendentes trazem amount_cents cru
// (mesmo formato bruto do banco), por isso a conversão separada aqui.
function centsToNumberLocal(cents) {
  return Math.round(Number(cents) || 0) / 100;
}

function renderNotifBell() {
  const pendingIds = new Set(pendingDonations.map((p) => p.id));
  notifBellReactsLabelEl.hidden = pendingReactVideos.length === 0;
  notifBellPendingReactsEl.innerHTML = pendingReactVideos.map(notifPendingReactItemHtml).join("");
  notifBellPendingEl.innerHTML = pendingDonations.map(notifPendingItemHtml).join("");
  notifBellListEl.innerHTML = historyItems
    .filter((item) => !(item.eventId && pendingIds.has(item.eventId)))
    .slice(0, 30)
    .map(notifFeedItemHtml)
    .join("");
  const hasAnything = pendingDonations.length > 0 || pendingReactVideos.length > 0 || notifBellListEl.children.length > 0;
  notifBellEmptyEl.hidden = hasAnything;
  const badgeCount = pendingDonations.length + pendingReactVideos.length;
  notifBellBadgeEl.hidden = badgeCount === 0;
  notifBellBadgeEl.textContent = badgeCount > 99 ? "99+" : String(badgeCount);
}

function setNotifBellOpen(open) {
  notifBellDropdownEl.hidden = !open;
  notifBellTriggerEl.classList.toggle("active", open);
  notifBellTriggerEl.setAttribute("aria-expanded", open ? "true" : "false");
}
notifBellTriggerEl.addEventListener("click", () => {
  const opening = notifBellDropdownEl.hidden;
  setNotifBellOpen(opening);
  if (opening) {
    loadPendingDonations();
    loadPendingReactVideos();
  }
});
document.addEventListener("click", (e) => {
  if (notifBellDropdownEl.hidden) return;
  if (notifBellDropdownEl.contains(e.target) || notifBellTriggerEl.contains(e.target)) return;
  setNotifBellOpen(false);
});

notifBellPendingEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const eventId = Number(btn.dataset.eventId);
  const ev = pendingDonations.find((p) => p.id === eventId);
  if (!ev) return;

  if (btn.dataset.act === "notif-dismiss") {
    const ok = await confirmDialog({
      title: "Marcar como apoio geral",
      message: `Marcar a doação de ${ev.username || "anônimo"} como apoio geral? Ela continua contando no total arrecadado, só não vai pro catálogo.`,
      confirmLabel: "Marcar",
    });
    if (!ok) return;
    try {
      await presenterFetch(`/admin/pending/${eventId}/dismiss`, { method: "POST" });
    } catch (err) {
      alert(err.message);
    }
    return;
  }

  if (btn.dataset.act === "notif-identify") {
    const result = await renameGameDialog(ev.raw_message || "", { title: "Identificar doação", confirmLabel: "Atribuir" });
    if (!result) return;
    try {
      await presenterFetch(`/admin/pending/${eventId}/assign`, {
        method: "POST",
        body: JSON.stringify({ gameName: result.name, gameImage: result.image }),
      });
    } catch (err) {
      alert(err.message);
    }
  }
});

notifBellPendingReactsEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const videoId = btn.dataset.videoId;
  const video = pendingReactVideos.find((v) => v.id === videoId);
  if (!video) return;

  if (btn.dataset.act === "react-reject") {
    const ok = await confirmDialog({
      title: "Rejeitar vídeo sugerido",
      message: `Rejeitar "${video.title}"? A doação continua contando no total arrecadado, só o vídeo não entra na disputa.`,
      confirmLabel: "Rejeitar",
      danger: true,
    });
    if (!ok) return;
    try {
      await presenterFetch(`/admin/reacts/${videoId}/reject`, { method: "POST" });
    } catch (err) {
      alert(err.message);
    }
    return;
  }

  if (btn.dataset.act === "react-approve") {
    const nickname = await promptDialog({
      title: "Aprovar vídeo",
      label: `Apelido curto pra "${video.title}" -- é o que a doação por texto vai reconhecer depois pra somar nesse vídeo`,
      initialValue: (video.title || "").slice(0, 24),
      confirmLabel: "Aprovar",
    });
    if (!nickname || !nickname.trim()) return;

    let durationSeconds = video.durationSeconds;
    if (!durationSeconds) {
      const minutesStr = await promptDialog({
        title: "Duração do vídeo",
        label: "Duração em minutos -- não deu pra detectar automaticamente",
        inputType: "number",
        confirmLabel: "Continuar",
      });
      if (!minutesStr) return;
      const minutes = Number(minutesStr);
      if (!Number.isFinite(minutes) || minutes <= 0) return alert("Duração inválida");
      durationSeconds = Math.round(minutes * 60);
    }

    try {
      await presenterFetch(`/admin/reacts/${videoId}/approve`, {
        method: "POST",
        body: JSON.stringify({ nickname: nickname.trim(), durationSeconds }),
      });
    } catch (err) {
      alert(err.message);
    }
  }
});

// extrato do leilão: histórico completo (não só os últimos ~30 do sino)
// com saldo acumulado, tipo extrato bancário -- abre clicando no total
// arrecadado, só disponível em modo apresentador.
const extratoModalEl = document.getElementById("extrato-modal");
const extratoModalCloseEl = document.getElementById("extrato-modal-close");
const extratoSummaryEl = document.getElementById("extrato-summary");
const extratoBodyEl = document.getElementById("extrato-body");
const extratoEmptyEl = document.getElementById("extrato-empty");

function extratoRowHtml(row) {
  const time = row.time
    ? new Date(row.time).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";
  const isNegative = row.action === "remove";
  const gameLabel = row.pending ? "aguardando identificação" : row.dismissed ? "apoio geral" : (row.game || "—");
  const gameClass = row.pending || row.dismissed ? " is-pending" : "";
  return `
    <tr>
      <td class="extrato-time">${time}</td>
      <td class="extrato-who">${escapeHtml(row.username || "Anônimo")}</td>
      <td class="extrato-game${gameClass}">${escapeHtml(gameLabel)}</td>
      <td class="extrato-amt ${isNegative ? "is-negative" : "is-positive"}">${isNegative ? "−" : "+"}${formatBRL(row.amount)}</td>
      <td class="extrato-balance">${formatBRL(row.balance)}</td>
    </tr>
  `;
}

async function openExtratoModal() {
  extratoModalEl.hidden = false;
  extratoBodyEl.innerHTML = "";
  extratoEmptyEl.hidden = true;
  extratoSummaryEl.innerHTML = `<span class="extrato-summary-label">carregando…</span>`;
  try {
    const { rows, totalRaised } = await presenterFetch("/extrato");
    extratoSummaryEl.innerHTML = `
      <span class="extrato-summary-label">total arrecadado</span>
      <span class="extrato-summary-value">${formatBRL(totalRaised)}</span>
      <span class="extrato-summary-count">${rows.length} doaç${rows.length === 1 ? "ão" : "ões"}</span>
    `;
    if (!rows.length) {
      extratoEmptyEl.hidden = false;
    } else {
      extratoBodyEl.innerHTML = rows.map(extratoRowHtml).join("");
    }
  } catch (err) {
    extratoSummaryEl.innerHTML = "";
    extratoEmptyEl.hidden = false;
    extratoEmptyEl.textContent = `Erro ao carregar o extrato: ${err.message}`;
  }
}

function closeExtratoModal() {
  extratoModalEl.hidden = true;
}

function handleTopbarTotalActivate(e) {
  if (e.target.closest("#total-hide-toggle")) return;
  if (!document.body.classList.contains("presenter-mode")) return;
  openExtratoModal();
}
topbarTotalEl.addEventListener("click", handleTopbarTotalActivate);
topbarTotalEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  handleTopbarTotalActivate(e);
});
extratoModalCloseEl.addEventListener("click", closeExtratoModal);
extratoModalEl.addEventListener("click", (e) => { if (e.target === extratoModalEl) closeExtratoModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !extratoModalEl.hidden) closeExtratoModal(); });

const soldSwirlCanvasEl = document.getElementById("sold-swirl-canvas");
const soldSwirlCtx = soldSwirlCanvasEl.getContext("2d");
let soldSwirlRaf = null;

function drawSwirlFrame(ctx, w, h, time, colorFront, colorBack, pxSize) {
  ctx.fillStyle = colorBack;
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const maxRadius = Math.hypot(cx, cy);
  ctx.fillStyle = colorFront;
  for (let y = pxSize / 2; y < h; y += pxSize) {
    for (let x = pxSize / 2; x < w; x += pxSize) {
      const dx = x - cx;
      const dy = y - cy;
      const radius = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const wave = Math.sin(radius * 0.07 - time * 2.4 + Math.sin(angle * 3 + time * 0.6) * 1.8);
      const falloff = Math.max(0, 1 - radius / maxRadius);
      const strength = Math.max(0, wave) * falloff;
      if (strength <= 0.12) continue;
      const size = pxSize * Math.min(1, strength * 1.4);
      ctx.globalAlpha = Math.min(1, strength * 1.6);
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }
  ctx.globalAlpha = 1;
}

function stopSwirl() {
  if (soldSwirlRaf) cancelAnimationFrame(soldSwirlRaf);
  soldSwirlRaf = null;
}

function startSwirl() {
  stopSwirl();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  soldSwirlCanvasEl.width = Math.round(window.innerWidth * dpr);
  soldSwirlCanvasEl.height = Math.round(window.innerHeight * dpr);
  soldSwirlCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rootStyle = getComputedStyle(document.documentElement);
  const colorFront = rootStyle.getPropertyValue("--accent-text").trim() || "#d1b3fa";
  const colorBack = rootStyle.getPropertyValue("--bg").trim() || "#17131f";
  const start = performance.now();
  function frame(now) {
    const t = (now - start) / 1000;
    drawSwirlFrame(soldSwirlCtx, window.innerWidth, window.innerHeight, t, colorFront, colorBack, 7);
    if (t < 2.3) soldSwirlRaf = requestAnimationFrame(frame);
  }
  soldSwirlRaf = requestAnimationFrame(frame);
}

let soldTimeout = null;
function triggerSoldMoment(leaderName) {
  clearTimeout(soldTimeout);
  soldMarkEl.textContent = leaderName ? `Vencedor: ${leaderName}!` : "Vencedor!";
  soldOverlayEl.hidden = false;
  soldOverlayEl.style.animation = "none";
  soldMarkEl.style.animation = "none";
  void soldOverlayEl.offsetWidth;
  soldOverlayEl.style.animation = "";
  soldMarkEl.style.animation = "";
  startSwirl();
  soldTimeout = setTimeout(() => { soldOverlayEl.hidden = true; stopSwirl(); }, 2300);
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return "—";
  const totalMin = Math.round(ms / 60000);
  if (totalMin === 0) return "<1min";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

let currentRecapForDownload = null;
let currentShareText = "";

function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function roundRectPathAsym(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.arcTo(x + w, y, x + w, y + r.tr, r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
  ctx.lineTo(x + r.bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - r.bl, r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.arcTo(x, y, x + r.tl, y, r.tl);
  ctx.closePath();
}
const CARD_CORNER_RADII = [
  { tl: 12, tr: 8, br: 13, bl: 9 },
  { tl: 9, tr: 12, br: 8, bl: 13 },
  { tl: 11, tr: 9, br: 14, bl: 8 },
];

function loadImageSafe(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 4000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    // via nosso servidor (mesma origem, sem depender do CORS da CDN externa) --
    // só pra URL remota de verdade, data: URI (medalha) carrega direto
    img.src = url.startsWith("http") ? `/api/image-proxy?url=${encodeURIComponent(url)}` : url;
  });
}

function medalImageDataUri(color) {
  return `data:image/svg+xml;base64,${btoa(MEDAL_ICON_SVG.replace(/currentColor/g, color))}`;
}

function drawCircleImage(ctx, img, cx, cy, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const scale = Math.max(size / img.width, size / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.restore();
}

function drawGrain(ctx, w, h) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (Math.random() > 0.94) {
      const delta = (Math.random() - 0.5) * 14;
      data[i] = Math.min(255, Math.max(0, data[i] + delta));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + delta));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + delta));
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

async function buildRecapCanvas() {
  const recap = currentRecapForDownload;
  if (!recap) return null;
  await document.fonts.ready;

  const W = 1200;
  const H = 630;

  const rootStyle = getComputedStyle(document.documentElement);
  const cVar = (name, fallback) => rootStyle.getPropertyValue(name).trim() || fallback;
  const surface = cVar("--surface", "#1e1829");
  const surface2 = cVar("--surface-2", "#251d33");
  const border = cVar("--border", "#3a2f4d");
  const borderSoft = cVar("--border-soft", "#2a2338");
  const textColor = cVar("--text", "#f2eff7");
  const muted = cVar("--muted", "#9891a8");
  const accent = cVar("--accent", "#a683d1");
  const accentBg = cVar("--accent-bg", "rgba(166,131,209,0.12)");
  const accentText = cVar("--accent-text", "#c3a8dd");
  const accentSoft = cVar("--accent-soft", "#7c5aa8");
  const silver = cVar("--silver", "#d6d0e0");
  const bronze = cVar("--bronze", "#c99a6c");

  const top3 = (recap.topGames || []).slice(0, 3);
  const topDonors = (recap.topDonors || []).slice(0, 5);

  const [coverImgs, donorAvatarImgs, hostAvatarImg, medalGold, medalSilver, medalBronze] = await Promise.all([
    Promise.all(top3.map((g) => loadImageSafe(g.image))),
    Promise.all(topDonors.map((d) => loadImageSafe(d.avatar))),
    loadImageSafe(recap.hostAvatar),
    loadImageSafe(medalImageDataUri(accentText)),
    loadImageSafe(medalImageDataUri(silver)),
    loadImageSafe(medalImageDataUri(bronze)),
  ]);
  const medalByRank = [medalGold, medalSilver, medalBronze];

  function renderCanvas(includeCovers) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    roundRectPath(ctx, 0, 0, W, H, 18);
    ctx.fillStyle = surface;
    ctx.fill();
    drawGrain(ctx, W, H);
    roundRectPath(ctx, 1, 1, W - 2, H - 2, 18);
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.stroke();

    const marginX = 56;
    const colDivider = 672;
    const rightX = colDivider + 34;
    const rightW = W - marginX - rightX;

    ctx.save();
    ctx.translate(marginX + 6, 54);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = accent;
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
    ctx.fillStyle = textColor;
    ctx.font = "600 16px 'IBM Plex Sans', sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("JogodaVez", marginX + 22, 54);
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = accentText;
    ctx.font = "600 12px 'IBM Plex Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText("LEILÃO ENCERRADO", W - marginX, 58);
    ctx.textAlign = "left";

    const hostAvatar = includeCovers ? hostAvatarImg : null;
    let titleX = marginX;
    if (hostAvatar) {
      const avatarSize = 44;
      const avatarCy = 104;
      drawCircleImage(ctx, hostAvatar, marginX + avatarSize / 2, avatarCy, avatarSize);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(marginX + avatarSize / 2, avatarCy, avatarSize / 2, 0, Math.PI * 2);
      ctx.stroke();
      titleX = marginX + avatarSize + 14;
    }
    ctx.fillStyle = textColor;
    ctx.font = "italic 700 38px 'Nunito', sans-serif";
    const title = recap.title || "JogodaVez";
    ctx.fillText(truncateToWidth(ctx, title, colDivider - titleX), titleX, 118);

    const totalText = recap.totalRaised === null ? "oculto" : formatBRL(recap.totalRaised || 0);
    const prefixMatch = totalText.match(/^(R\$\s?)(.+)$/);
    ctx.font = "700 78px 'IBM Plex Mono', monospace";
    if (prefixMatch) {
      ctx.font = "600 30px 'IBM Plex Mono', monospace";
      ctx.fillStyle = accentSoft;
      ctx.fillText(prefixMatch[1].trim(), marginX, 226);
      const prefixW = ctx.measureText(`${prefixMatch[1].trim()} `).width;
      ctx.font = "700 78px 'IBM Plex Mono', monospace";
      ctx.fillStyle = accentText;
      ctx.fillText(prefixMatch[2], marginX + prefixW, 226);
    } else {
      ctx.fillStyle = accentText;
      ctx.fillText(totalText, marginX, 226);
    }
    ctx.fillStyle = muted;
    ctx.font = "600 13px 'IBM Plex Mono', monospace";
    ctx.fillText("ARRECADADO", marginX + 2, 248);

    const statsRuleY = 270;
    ctx.strokeStyle = borderSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginX, statsRuleY);
    ctx.lineTo(colDivider, statsRuleY);
    ctx.stroke();

    const stats = [
      [formatDuration(recap.durationMs), "DURAÇÃO"],
      [String(recap.totalDonors || 0), "APOIADORES"],
      [String(recap.totalGames || 0), "LOTES"],
    ];
    const statColW = (colDivider - marginX) / stats.length;
    stats.forEach(([value, label], i) => {
      const cx = marginX + statColW * i + statColW / 2;
      ctx.textAlign = "center";
      ctx.fillStyle = textColor;
      ctx.font = "600 24px 'IBM Plex Mono', monospace";
      ctx.fillText(value, cx, statsRuleY + 40);
      ctx.fillStyle = muted;
      ctx.font = "600 10px 'IBM Plex Mono', monospace";
      ctx.fillText(label, cx, statsRuleY + 60);
      ctx.textAlign = "left";
    });

    const champion = top3[0];
    const highlightLines = [];
    if (champion) highlightLines.push([`${champion.name} foi o campeão`, formatBRL(champion.total)]);
    if (recap.biggestDonation) {
      highlightLines.push([
        `recorde: ${recap.biggestDonation.username || "Anônimo"} em ${recap.biggestDonation.gameName || ""}`,
        formatBRL(recap.biggestDonation.amount),
      ]);
    }
    if (highlightLines.length > 0) {
      const hy = statsRuleY + 82;
      const boxH = 30 * highlightLines.length + 8;
      ctx.fillStyle = accent;
      ctx.fillRect(marginX, hy, 3, boxH);
      let ly = hy + 20;
      highlightLines.forEach(([label, value]) => {
        ctx.fillStyle = textColor;
        ctx.font = "500 14px 'IBM Plex Sans', sans-serif";
        ctx.fillText(truncateToWidth(ctx, label, colDivider - marginX - 150 - 16), marginX + 16, ly);
        ctx.fillStyle = accentText;
        ctx.font = "700 15px 'IBM Plex Mono', monospace";
        ctx.textAlign = "right";
        ctx.fillText(value, colDivider, ly);
        ctx.textAlign = "left";
        ly += 30;
      });
    }

    ctx.fillStyle = muted;
    ctx.font = "500 13px 'IBM Plex Mono', monospace";
    ctx.fillText(`${location.origin}/l/${LEILAO_ID}`, marginX, H - 30);

    ctx.fillStyle = muted;
    ctx.font = "600 12px 'IBM Plex Mono', monospace";
    ctx.fillText("TOP 3", rightX, 62);

    const MEDAL_ROTATION_DEG = [-5, 4, -3];

    let py = 82;
    top3.forEach((game, i) => {
      const isChampion = i === 0;
      const cardH = isChampion ? 72 : 60;
      const thumbSize = isChampion ? 54 : 46;
      roundRectPathAsym(ctx, rightX, py, rightW, cardH, CARD_CORNER_RADII[i]);
      if (isChampion) {
        const grad = ctx.createLinearGradient(0, py, 0, py + cardH);
        grad.addColorStop(0, accentBg);
        grad.addColorStop(1, surface2);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = surface2;
      }
      ctx.fill();
      ctx.strokeStyle = isChampion ? accent : border;
      ctx.lineWidth = 1;
      ctx.stroke();

      const thumbX = rightX + 10;
      const thumbY = py + (cardH - thumbSize) / 2;
      const cover = includeCovers ? coverImgs[i] : null;
      roundRectPath(ctx, thumbX, thumbY, thumbSize, thumbSize, 8);
      if (cover) {
        ctx.save();
        ctx.clip();
        const scale = Math.max(thumbSize / cover.width, thumbSize / cover.height);
        const dw = cover.width * scale;
        const dh = cover.height * scale;
        ctx.drawImage(cover, thumbX + (thumbSize - dw) / 2, thumbY + (thumbSize - dh) / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = surface;
        ctx.fill();
        ctx.fillStyle = muted;
        ctx.font = `italic 700 ${isChampion ? 22 : 20}px 'Nunito', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((game.name[0] || "?").toUpperCase(), thumbX + thumbSize / 2, thumbY + thumbSize / 2 + 1);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }

      const medalImg = medalByRank[i];
      if (medalImg) {
        const medalSize = 22;
        ctx.save();
        ctx.translate(thumbX - 8 + medalSize / 2, thumbY - 6 + medalSize / 2);
        ctx.rotate((MEDAL_ROTATION_DEG[i] * Math.PI) / 180);
        ctx.drawImage(medalImg, -medalSize / 2, -medalSize / 2, medalSize, medalSize);
        ctx.restore();
      }

      const textX = thumbX + thumbSize + 14;
      const nameMaxW = rightW - (textX - rightX) - 16;
      ctx.fillStyle = textColor;
      ctx.font = `600 ${isChampion ? 17 : 15}px 'IBM Plex Sans', sans-serif`;
      ctx.fillText(truncateToWidth(ctx, game.name, nameMaxW), textX, py + (isChampion ? 30 : 26));
      ctx.fillStyle = accentText;
      ctx.font = `700 ${isChampion ? 16 : 14}px 'IBM Plex Mono', monospace`;
      ctx.fillText(formatBRL(game.total), textX, py + (isChampion ? 52 : 46));

      py += cardH + 8;
    });

    if (topDonors.length > 0) {
      py += 14;
      ctx.fillStyle = muted;
      ctx.font = "600 12px 'IBM Plex Mono', monospace";
      ctx.fillText("QUADRO DE HONRA", rightX, py + 10);
      py += 28;

      const donorAvatarSize = 18;
      topDonors.forEach((donor, i) => {
        if (i < 3 && medalByRank[i]) {
          ctx.drawImage(medalByRank[i], rightX, py + 2, 16, 16);
        } else {
          ctx.fillStyle = muted;
          ctx.font = "700 12px 'IBM Plex Mono', monospace";
          ctx.fillText(String(i + 1).padStart(2, "0"), rightX, py + 14);
        }

        const donorAvatarImg = includeCovers ? donorAvatarImgs[i] : null;
        const avX = rightX + 24;
        const avCy = py + 5;
        if (donorAvatarImg) {
          drawCircleImage(ctx, donorAvatarImg, avX + donorAvatarSize / 2, avCy, donorAvatarSize);
        } else {
          ctx.beginPath();
          ctx.arc(avX + donorAvatarSize / 2, avCy, donorAvatarSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = surface2;
          ctx.fill();
          ctx.fillStyle = muted;
          ctx.font = "600 9px 'IBM Plex Sans', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(((donor.username || "?")[0] || "?").toUpperCase(), avX + donorAvatarSize / 2, avCy + 1);
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
        }

        const nameX = avX + donorAvatarSize + 8;
        ctx.fillStyle = textColor;
        ctx.font = "500 14px 'IBM Plex Sans', sans-serif";
        ctx.fillText(truncateToWidth(ctx, donor.username || "Anônimo", rightX + rightW - nameX - 90), nameX, py + 14);
        ctx.fillStyle = muted;
        ctx.font = "600 13px 'IBM Plex Mono', monospace";
        ctx.textAlign = "right";
        ctx.fillText(formatBRL(donor.total), rightX + rightW, py + 14);
        ctx.textAlign = "left";
        py += 27;
      });
    }

    return canvas;
  }

  let canvas = renderCanvas(true);
  let dataUrl;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch (err) {
    canvas = renderCanvas(false);
  }

  return canvas;
}

function downloadCanvasAsPng(canvas) {
  const link = document.createElement("a");
  link.download = `recap-${LEILAO_ID}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function downloadRecapImage() {
  const canvas = await buildRecapCanvas();
  if (canvas) downloadCanvasAsPng(canvas);
}
recapDownloadBtnEl.addEventListener("click", downloadRecapImage);

recapShareXEl.addEventListener("click", async (e) => {
  e.preventDefault();
  const canvas = await buildRecapCanvas();
  if (!canvas) return;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;

  const file = new File([blob], `recap-${LEILAO_ID}.png`, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: currentShareText });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return; // usuário cancelou o compartilhamento
    }
  }

  // sem suporte a Web Share com arquivo (a maioria dos navegadores desktop): a imagem
  // gerada vai pro clipboard e a pessoa cola (Ctrl+V) direto no tweet que abrir
  const twitterWindow = window.open("", "_blank");
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    }
  } catch (err) {
  }
  const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(currentShareText)}`;
  if (twitterWindow) twitterWindow.location.href = intentUrl;
  else window.open(intentUrl, "_blank");
});

function recapPodiumCardHtml(game) {
  const thumb = game.image
    ? `<img class="recap-podium-thumb" src="${escapeHtml(game.image)}" alt="" />`
    : `<div class="recap-podium-thumb recap-podium-thumb-placeholder">${escapeHtml((game.name[0] || "?").toUpperCase())}</div>`;
  const topDonorHtml = game.topDonor
    ? `<p class="recap-podium-top-donor">apoiador: ${escapeHtml(game.topDonor.username)}</p>`
    : "";
  return `
    <div class="recap-podium-card rank-${game.rank}">
      <span class="recap-podium-rank">${rankBadgeHtml(game.rank)}</span>
      ${thumb}
      <p class="recap-podium-name">${escapeHtml(game.name)}</p>
      <p class="recap-podium-total">${formatBRL(game.total)}</p>
      <p class="recap-podium-donors">${game.donorCount} ${game.donorCount === 1 ? "apoiador" : "apoiadores"}</p>
      ${topDonorHtml}
    </div>
  `;
}

function recapExtraRowHtml(game) {
  const thumb = game.image
    ? `<img class="recap-extra-thumb" src="${escapeHtml(game.image)}" alt="" loading="lazy" />`
    : `<span class="recap-extra-thumb recap-extra-thumb-placeholder">${escapeHtml((game.name[0] || "?").toUpperCase())}</span>`;
  return `
    <div class="recap-extra-row">
      <span class="recap-extra-rank">${String(game.rank).padStart(2, "0")}</span>
      ${thumb}
      <span class="recap-extra-name">${escapeHtml(game.name)}</span>
      <span class="recap-extra-total">${formatBRL(game.total)}</span>
    </div>
  `;
}

function renderRecap(recap, eyebrowText) {
  recapEyebrowEl.textContent = eyebrowText;
  if (recap.hostAvatar) {
    recapHostAvatarEl.src = recap.hostAvatar;
    recapHostAvatarEl.hidden = false;
  } else {
    recapHostAvatarEl.hidden = true;
  }
  recapTitleEl.textContent = recap.title || "JogodaVez";
  recapTotalEl.textContent = recap.totalRaised === null ? "oculto" : formatBRL(recap.totalRaised || 0);
  recapDurationEl.textContent = formatDuration(recap.durationMs);
  recapDonorsEl.textContent = String(recap.totalDonors || 0);
  recapGamesEl.textContent = String(recap.totalGames || 0);

  currentShareText = recap.totalRaised === null
    ? "Acabei de fazer um leilão de jogos com a galera! Dá uma olhada:"
    : `Acabei de arrecadar ${formatBRL(recap.totalRaised || 0)} num leilão de jogos com a galera! Dá uma olhada:`;
  currentRecapForDownload = recap;

  const champion = (recap.topGames || [])[0];
  const championLineEl = document.getElementById("recap-champion-line");
  const recordLineEl = document.getElementById("recap-record-line");
  const highlightEl = document.getElementById("recap-highlight");
  championLineEl.innerHTML = champion
    ? `<span class="recap-highlight-icon">${TITLE_SWAP_ICONS.i.svg}</span><strong>${escapeHtml(champion.name)}</strong> foi o campeão, arrecadando ${formatBRL(champion.total)}`
    : "";
  recordLineEl.innerHTML = recap.biggestDonation
    ? `<span class="recap-highlight-icon recap-highlight-icon-bolt">${RECORD_BOLT_ICON_SVG}</span>recorde de doação: <strong>${escapeHtml(recap.biggestDonation.username || "Anônimo")}</strong> mandou ${formatBRL(recap.biggestDonation.amount)} em ${escapeHtml(recap.biggestDonation.gameName || "")}`
    : "";
  highlightEl.hidden = !champion && !recap.biggestDonation;

  const topGames = recap.topGames || [];
  recapPodiumEl.innerHTML = topGames.slice(0, 3).map(recapPodiumCardHtml).join("");
  const extraGames = topGames.slice(3);
  recapExtraEl.hidden = extraGames.length === 0;
  recapExtraListEl.innerHTML = extraGames.map(recapExtraRowHtml).join("");

  const topDonors = recap.topDonors || [];
  recapDonorsLabelEl.hidden = topDonors.length === 0;
  recapDonorListEl.innerHTML = topDonors.map((d) => {
    const avatar = d.avatar
      ? `<img class="recap-donor-avatar" src="${escapeHtml(d.avatar)}" alt="" loading="lazy" />`
      : `<span class="recap-donor-avatar recap-donor-avatar-placeholder">${escapeHtml((d.username || "?")[0].toUpperCase())}</span>`;
    return `
    <div class="recap-donor-row rank-${d.rank}">
      <span class="recap-donor-rank">${rankBadgeHtml(d.rank)}</span>
      ${avatar}
      <span class="recap-donor-name">${escapeHtml(d.username || "Anônimo")}</span>
      <span class="recap-donor-total">${formatBRL(d.total)}</span>
    </div>
  `;
  }).join("");

  recapOverlayEl.hidden = false;
}

async function showRecap() {
  try {
    const recap = await fetch(`/api/l/${LEILAO_ID}/recap`).then((r) => r.json());
    renderRecap(recap, "leilão encerrado");
  } catch (err) {
    console.error("Erro ao buscar recap:", err.message);
  }
}

async function showHistoricalRecap(index) {
  try {
    const data = await fetch(`/api/l/${LEILAO_ID}/recap/history`).then((r) => r.json());
    const recap = (data.history || [])[index];
    if (!recap) return;
    const when = recap.archivedAt
      ? new Date(recap.archivedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
      : "";
    renderRecap(recap, when ? `round encerrado em ${when}` : "round anterior");
  } catch (err) {
    console.error("Erro ao buscar recap histórico:", err.message);
  }
}

const recapParam = new URLSearchParams(location.search).get("recap");
if (recapParam !== null && /^\d+$/.test(recapParam)) {
  showHistoricalRecap(Number(recapParam));
}

function closeRecap() {
  recapOverlayEl.hidden = true;
}

recapCloseEl.addEventListener("click", closeRecap);
recapOverlayEl.addEventListener("click", (e) => { if (e.target === recapOverlayEl) closeRecap(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !recapOverlayEl.hidden) closeRecap(); });

function historyCardHtml(h, index) {
  const when = h.archivedAt ? new Date(h.archivedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const champion = h.topGames && h.topGames[0] ? h.topGames[0] : null;
  const thumb = champion && champion.image
    ? `<img class="history-card-thumb" src="${escapeHtml(champion.image)}" alt="" />`
    : `<div class="history-card-thumb history-card-thumb-placeholder">${escapeHtml(((champion && champion.name[0]) || "?").toUpperCase())}</div>`;
  const inProgressTag = h.openRound ? `<span class="history-card-inprogress">em andamento</span>` : "";
  return `
    <button class="history-card" type="button" data-index="${index}">
      <span class="history-card-when">${when}${inProgressTag}</span>
      <span class="history-card-total">${h.totalRaised === null ? "oculto" : formatBRL(h.totalRaised || 0)}</span>
      <div class="history-card-champion">
        ${thumb}
        <span class="history-card-champion-name">${escapeHtml(champion ? champion.name : "—")}</span>
      </div>
      <div class="history-card-meta">
        <span>${h.totalGames || 0} lotes</span>
        <span>${h.totalDonors || 0} apoiadores</span>
        <span>${formatDuration(h.durationMs)}</span>
      </div>
    </button>
  `;
}

async function openHistoryOverlay() {
  historyOverlayEl.hidden = false;
  let history = [];
  try {
    const data = await fetch(`/api/l/${LEILAO_ID}/recap/history`).then((r) => r.json());
    history = data.history || [];
  } catch (err) {
    console.error("Erro ao carregar histórico:", err.message);
  }

  if (history.length === 0) {
    historyModalEmptyEl.hidden = false;
    historyGridEl.innerHTML = "";
    return;
  }
  historyModalEmptyEl.hidden = true;
  historyGridEl.innerHTML = history.map(historyCardHtml).join("");

  historyGridEl.querySelectorAll(".history-card").forEach((card) => {
    card.addEventListener("click", () => {
      const index = Number(card.dataset.index);
      const recap = history[index];
      if (!recap) return;
      const when = recap.archivedAt
        ? new Date(recap.archivedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
        : "";
      historyOverlayEl.hidden = true;
      renderRecap(recap, when ? `round encerrado em ${when}` : "round anterior");
    });
  });
}

function closeHistoryOverlay() {
  historyOverlayEl.hidden = true;
}

historyOpenBtnEl.addEventListener("click", openHistoryOverlay);
historyCloseEl.addEventListener("click", closeHistoryOverlay);
historyOverlayEl.addEventListener("click", (e) => { if (e.target === historyOverlayEl) closeHistoryOverlay(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !historyOverlayEl.hidden) closeHistoryOverlay(); });

const rankingOpenBtnEl = document.getElementById("ranking-open-btn");
const rankingOverlayEl = document.getElementById("ranking-overlay");
const rankingCloseEl = document.getElementById("ranking-close");
const rankingPodiumEl = document.getElementById("ranking-podium");
const rankingListEl = document.getElementById("ranking-list");
const rankingEmptyEl = document.getElementById("ranking-empty");

function rankingPodiumCardHtml(row) {
  return `
    <div class="recap-podium-card rank-${row.rank}">
      <span class="recap-podium-rank">${rankBadgeHtml(row.rank)}</span>
      <p class="recap-podium-name">${escapeHtml(row.title)}</p>
      <p class="recap-podium-total">${formatBRL(row.totalRaised)}</p>
    </div>
  `;
}

function rankingRowHtml(row) {
  return `
    <div class="ranking-row">
      <span class="ranking-row-rank">${String(row.rank).padStart(2, "0")}</span>
      <span class="ranking-row-host">${escapeHtml(row.title)}</span>
      <span class="ranking-row-total">${formatBRL(row.totalRaised)}</span>
    </div>
  `;
}

async function openRankingOverlay() {
  rankingOverlayEl.hidden = false;
  let ranking = [];
  try {
    const data = await fetch(`/api/l/${LEILAO_ID}/ranking`).then((r) => r.json());
    ranking = data.ranking || [];
  } catch (err) {
    console.error("Erro ao carregar ranking:", err.message);
  }

  if (ranking.length === 0) {
    rankingEmptyEl.hidden = false;
    rankingPodiumEl.innerHTML = "";
    rankingListEl.innerHTML = "";
    return;
  }
  rankingEmptyEl.hidden = true;
  rankingPodiumEl.innerHTML = ranking.slice(0, 3).map(rankingPodiumCardHtml).join("");
  rankingListEl.innerHTML = ranking.slice(3, 10).map(rankingRowHtml).join("");
}

function closeRankingOverlay() {
  rankingOverlayEl.hidden = true;
}

let animateRankingIcon = null;
async function bounceRankingIcon() {
  const icon = rankingOpenBtnEl.querySelector(".icon");
  if (!icon || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    if (!animateRankingIcon) {
      ({ animate: animateRankingIcon } = await import("https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm"));
    }
    animateRankingIcon(icon, { scale: [1, 1.25, 1] }, { duration: 0.35, ease: "easeOut" });
  } catch (err) {
    console.error("Falha ao animar ícone do ranking:", err.message);
  }
}

rankingOpenBtnEl.addEventListener("click", () => {
  openRankingOverlay();
  bounceRankingIcon();
});
rankingCloseEl.addEventListener("click", closeRankingOverlay);
rankingOverlayEl.addEventListener("click", (e) => { if (e.target === rankingOverlayEl) closeRankingOverlay(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !rankingOverlayEl.hidden) closeRankingOverlay(); });

document.querySelectorAll(".theme-dot").forEach((dot) => {
  dot.addEventListener("click", async () => {
    try {
      await presenterFetch("/admin/theme", { method: "POST", body: JSON.stringify({ theme: dot.dataset.theme }) });
    } catch (err) {
      alert(err.message);
    }
  });
});

totalHideToggleEl.addEventListener("click", async () => {
  const currentlyHidden = totalHideToggleEl.classList.contains("active");
  try {
    await presenterFetch("/admin/hide-total", { method: "POST", body: JSON.stringify({ hidden: !currentlyHidden }) });
  } catch (err) {
    alert(err.message);
  }
});

function streakTier(count) {
  if (count >= 7) return 3;
  if (count >= 4) return 2;
  return 1;
}

// combo é do JOGO, não do leilão -- expira sozinho na tela mesmo sem
// nenhum evento novo chegar (sem isso ficaria "streakado" pra sempre)
function scheduleStreakExpiry(key, remainingMs) {
  const prev = streakTimers.get(key);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    streakTimers.delete(key);
    lastStreakTierByKey.delete(key);
    const card = lotListEl.querySelector(`.lot-card[data-key="${CSS.escape(key)}"]`);
    if (!card) return;
    card.classList.remove("is-streaking");
    card.removeAttribute("data-streak-tier");
    const badge = card.querySelector(".badge-streak");
    if (badge) badge.remove();
  }, remainingMs);
  streakTimers.set(key, timer);
}

socket.on("update", ({ leaderboard, lastEvent }) => {
  applyMediaLabels(leaderboard.mode);
  document.documentElement.dataset.theme = leaderboard.theme || "cinza";
  document.querySelectorAll(".theme-dot").forEach((dot) => {
    dot.classList.toggle("active", dot.dataset.theme === (leaderboard.theme || "cinza"));
  });
  if (leaderboard.backgroundImageUrl) {
    document.body.style.setProperty("--bg-image", `url("${leaderboard.backgroundImageUrl}")`);
    document.body.classList.add("has-bg-image");
  } else {
    document.body.classList.remove("has-bg-image");
    document.body.style.removeProperty("--bg-image");
  }
  renderBrandTitle(leaderboard.title);
  hostNameEl.textContent = leaderboard.host || "Streamer";
  if (leaderboard.hostAvatar) {
    hostAvatarEl.src = leaderboard.hostAvatar;
    hostAvatarEl.hidden = false;
    topbarMenuAvatarEl.src = leaderboard.hostAvatar;
    topbarMenuAvatarEl.hidden = false;
    topbarMenuAvatarPlaceholderEl.hidden = true;
    systemSwitchProfileAvatarEl.src = leaderboard.hostAvatar;
    systemSwitchProfileAvatarEl.hidden = false;
    systemSwitchProfilePlaceholderEl.hidden = true;
  } else {
    hostAvatarEl.hidden = true;
    hostAvatarEl.removeAttribute("src");
    topbarMenuAvatarEl.hidden = true;
    topbarMenuAvatarEl.removeAttribute("src");
    topbarMenuAvatarPlaceholderEl.hidden = false;
    topbarMenuAvatarPlaceholderEl.textContent = (leaderboard.host || "?")[0].toUpperCase();
    systemSwitchProfileAvatarEl.hidden = true;
    systemSwitchProfileAvatarEl.removeAttribute("src");
    systemSwitchProfilePlaceholderEl.hidden = false;
    systemSwitchProfilePlaceholderEl.textContent = (leaderboard.host || "?")[0].toUpperCase();
  }
  // Usa hostTwitchLogin (login real), nunca o nome de exibição -- evita falsificar o link do canal.
  if (leaderboard.hostVerified && leaderboard.hostTwitchLogin) {
    const twitchUrl = `https://twitch.tv/${encodeURIComponent(leaderboard.hostTwitchLogin)}`;
    hostTwitchBadgeEl.href = twitchUrl;
    hostTwitchBadgeEl.hidden = false;
    hostTwitchLinkEl.href = twitchUrl;
    hostTwitchLinkEl.textContent = `twitch.tv/${leaderboard.hostTwitchLogin}`;
    hostTwitchLinkEl.hidden = false;
  } else {
    hostTwitchBadgeEl.hidden = true;
    hostTwitchLinkEl.hidden = true;
  }

  const wasOpen = isOpenState;
  isOpenState = leaderboard.open;
  if (wasOpen === true && isOpenState === false) {
    const leader = (leaderboard.items || [])[0];
    triggerSoldMoment(leader ? leader.name : null);
    setTimeout(showRecap, 2400);
  }

  // deadline calculado com o relógio do próprio cliente (Date.now() local +
  // duração restante mandada pelo servidor) -- nunca compara timestamp
  // absoluto do servidor contra o relógio do cliente, pra não vazar
  // dessincronia de horário do PC do usuário pro cronômetro exibido
  timerEndsAt = leaderboard.timerRemainingMs != null ? Date.now() + leaderboard.timerRemainingMs : null;
  isPausedState = !!leaderboard.paused;
  pausedRemainingMs = leaderboard.timerRemainingMs;
  if (leaderboard.timerDurationMs) timerDurationMs = leaderboard.timerDurationMs;
  tickTimer();

  topbarTotalEl.classList.toggle("is-hidden", !!leaderboard.hideTotalRaised);
  totalHideToggleEl.classList.toggle("active", !!leaderboard.hideTotalRaised);
  totalHideToggleEl.title = leaderboard.hideTotalRaised ? "Mostrar valor arrecadado pro público" : "Ocultar valor arrecadado do público";
  if (!leaderboard.hideTotalRaised) {
    const totalValue = leaderboard.totalRaised || 0;
    // lastTotalRaised !== null exclui o carregamento inicial da página.
    if (lastTotalRaised !== null && totalValue !== lastTotalRaised) {
      flashTotalBeam();
      animateCountUp(statTotalEl, lastTotalRaised, totalValue, 700, () => triggerTick(statTotalEl));
    } else if (lastTotalRaised === null) {
      renderOdometer(statTotalEl, Math.round(totalValue).toLocaleString("pt-BR"));
    }
    lastTotalRaised = totalValue;
  }

  currentItems = leaderboard.items || [];
  donorNames = leaderboard.donorNames || [];
  const flashKey = lastEvent && lastEvent.game ? lastEvent.game.key : null;
  setActiveSystemUI(leaderboard.activeSystem);
  if (currentActiveSystem === "reacts") {
    currentReactVideos = leaderboard.reactVideos || [];
    renderReactVideos(currentReactVideos);
    renderReactPlaylist(currentReactVideos.filter((v) => v.status === "unlocked"), leaderboard.reactedVideos || []);
  } else {
    renderLots(leaderboard.items, flashKey, lastEvent ? lastEvent.type : null, leaderboard.lastSabotagedKey, leaderboard.qualifyCount || 3);
  }
  // pódio próprio pra cada sistema -- leilão não roda enquanto reacts tá
  // ativo, então o quadro de honra não pode continuar mostrando doador do
  // leilão nesse modo (e vice-versa).
  if (currentActiveSystem === "reacts") {
    const reactDonors = leaderboard.reactDonors || [];
    const reactTotal = reactDonors.reduce((sum, d) => sum + (d.total || 0), 0);
    renderDonors(reactDonors, reactTotal);
  } else {
    renderDonors(leaderboard.donors || [], leaderboard.hideTotalRaised ? null : leaderboard.totalRaised);
  }
  if (lastEvent && lastEvent.type === "reset") {
    historyItems = [];
    renderHistory();
  } else if (lastEvent && lastEvent.type === "pending-resolved") {
    // não gera uma linha nova no histórico -- só corrige a que já existia
    // (a doação em si já apareceu como "aguardando identificação" quando
    // chegou) e atualiza a lista de pendências de quem tiver o sino aberto.
    const item = historyItems.find((h) => h.eventId === lastEvent.eventId);
    if (item) {
      item.pending = false;
      item.type = lastEvent.resolution === "assign" ? "add" : "ignored";
      if (lastEvent.resolution === "assign" && lastEvent.game) item.game = { name: lastEvent.game.name };
      renderHistory();
    }
    if (document.body.classList.contains("presenter-mode")) loadPendingDonations();
  } else {
    pushHistory(lastEvent);
    if (lastEvent && lastEvent.type === "pending" && document.body.classList.contains("presenter-mode")) {
      loadPendingDonations();
    }
  }

  // modo reacts tem sua própria fila de pendência (vídeo sugerido, não
  // doação sem jogo) -- historyLabel não reconhece esses tipos de evento
  // (fica de fora do feed principal do sino de propósito), só recarrega a
  // lista de vídeos pendentes quando um deles muda.
  if (lastEvent && (lastEvent.type === "react-pending" || lastEvent.type === "react-approved" || lastEvent.type === "react-rejected")
    && document.body.classList.contains("presenter-mode")) {
    loadPendingReactVideos();
  }

  if (flashKey && lastEvent && (lastEvent.type === "add" || lastEvent.type === "remove") && (lastEvent.amount || 0) > 100) {
    triggerBigWinCelebration(flashKey, lastEvent.type);
  }

  if (lastEvent && lastEvent.paymentId != null && pendingDonationPaymentId && String(lastEvent.paymentId) === pendingDonationPaymentId) {
    handleDonationConfirmed();
  }
});

const donateOpenBtnEl = document.getElementById("donate-open-btn");
const donateModalEl = document.getElementById("donate-modal");
const donateModalCloseEl = document.getElementById("donate-modal-close");
const donateModalCancelEl = document.getElementById("donate-modal-cancel");
const donateStepFormEl = document.getElementById("donate-step-form");
const donateStepPixEl = document.getElementById("donate-step-pix");
const donateStepSuccessEl = document.getElementById("donate-step-success");
const donateModalActionSeg = document.getElementById("donate-modal-action");
const donateModalGameEl = document.getElementById("donate-modal-game");
const donateModalGameIconEl = document.getElementById("donate-modal-game-icon");
const donateModalGameAddBtnEl = document.getElementById("donate-modal-game-add-btn");
const donateModalGameShelfEl = document.getElementById("donate-modal-game-shelf");
const donateModalGameHintEl = document.getElementById("donate-modal-game-hint");
const donateModalAmountEl = document.getElementById("donate-modal-amount");
const donateModalNameEl = document.getElementById("donate-modal-name");
const donateModalNoteEl = document.getElementById("donate-modal-note");
const donateModalVoiceEl = document.getElementById("donate-modal-voice");
const donateModalErrorEl = document.getElementById("donate-modal-error");
const donateModalSubmitEl = document.getElementById("donate-modal-submit");
const donateQrImgEl = document.getElementById("donate-qr-img");
const donateCopyInputEl = document.getElementById("donate-copy-input");
const donateCopyBtnEl = document.getElementById("donate-copy-btn");

let pendingDonationPaymentId = null;
let selectedDonateVoiceId = "";

donateModalVoiceEl.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => {
    selectedDonateVoiceId = b.dataset.voice;
    donateModalVoiceEl.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
  });
});
wireVoicePreview(document.getElementById("donate-modal-voice-preview"));

function setDonateAction(action) {
  donateModalActionSeg.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.action === action);
  });
}

function getDonateAction() {
  const active = donateModalActionSeg.querySelector("button.active");
  return active ? active.dataset.action : "add";
}

function showDonateStep(step) {
  donateStepFormEl.hidden = step !== "form";
  donateStepPixEl.hidden = step !== "pix";
  donateStepSuccessEl.hidden = step !== "success";
}

function openDonateModal() {
  showDonateStep("form");
  setDonateAction("add");
  donateModalGameEl.value = "";
  donateModalAmountEl.value = "";
  donateModalNameEl.value = "";
  donateModalNoteEl.value = "";
  selectedDonateVoiceId = "";
  donateModalVoiceEl.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.voice === ""));
  donateModalErrorEl.hidden = true;
  donateModalSubmitEl.disabled = false;
  donateModalSubmitEl.textContent = "Gerar Pix →";
  pendingDonationPaymentId = null;
  donateModalEl.hidden = false;
  unconfirmDonateGame();
  closeDonateGameShelf();
  setTimeout(() => donateModalGameEl.focus(), 40);
}

function closeDonateModal() {
  donateModalEl.hidden = true;
  pendingDonationPaymentId = null;
  closeDonateGameShelf();
}

function normalizeSearch(str) {
  return str.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

let donateGameShelfDebounce = null;
let donateGameShelfAbortController = null;
let donateGameConfirmed = false;

function closeDonateGameShelf() {
  clearTimeout(donateGameShelfDebounce);
  if (donateGameShelfAbortController) donateGameShelfAbortController.abort();
  donateModalGameShelfEl.hidden = true;
  donateModalGameShelfEl.innerHTML = "";
  donateModalGameHintEl.hidden = true;
}

function confirmDonateGame(name, image) {
  donateModalGameEl.value = name;
  donateGameConfirmed = true;
  donateModalGameHintEl.hidden = true;
  donateModalGameIconEl.innerHTML = image
    ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" />`
    : `<div class="game-input-icon-placeholder">${escapeHtml((name[0] || "?").toUpperCase())}</div>`;
  donateModalGameIconEl.hidden = false;
}

function unconfirmDonateGame() {
  donateGameConfirmed = false;
  donateModalGameIconEl.hidden = true;
  donateModalGameIconEl.innerHTML = "";
  donateModalGameAddBtnEl.classList.remove("confirmed");
}

function donateGameShelfCardHtml(item, isNew) {
  const thumb = item.image
    ? `<img class="game-shelf-cover" src="${escapeHtml(item.image)}" alt="" loading="lazy" />`
    : `<div class="game-shelf-cover game-shelf-cover-placeholder">${escapeHtml((item.name[0] || "?").toUpperCase())}</div>`;
  return `
    <div class="game-shelf-card" data-name="${escapeHtml(item.name)}" data-image="${escapeHtml(item.image || "")}">
      ${isNew ? '<span class="game-shelf-new-tag">novo</span>' : ""}
      ${thumb}
      <span class="game-shelf-name">${escapeHtml(item.name)}</span>
    </div>
  `;
}

function pickDonateGameShelfCard(cardEl) {
  confirmDonateGame(cardEl.dataset.name, cardEl.dataset.image);
  donateModalGameShelfEl.querySelectorAll(".game-shelf-card.selected").forEach((el) => el.classList.remove("selected"));
  cardEl.classList.add("selected");
  donateModalGameAddBtnEl.classList.remove("confirmed");
  donateModalAmountEl.focus();
}

function renderDonateGameShelf(catalogMatches, newMatches) {
  if (catalogMatches.length === 0 && newMatches.length === 0) {
    donateModalGameShelfEl.innerHTML = `<p class="game-shelf-empty">nenhum ${mediaLabel()} encontrado, toque em + pra adicionar mesmo assim</p>`;
  } else {
    donateModalGameShelfEl.innerHTML =
      catalogMatches.map((g) => donateGameShelfCardHtml(g, false)).join("") +
      newMatches.map((g) => donateGameShelfCardHtml(g, true)).join("");
  }
  donateModalGameShelfEl.hidden = false;
  donateModalGameHintEl.hidden = donateGameConfirmed;
  donateModalGameShelfEl.querySelectorAll(".game-shelf-card").forEach((el) => {
    el.addEventListener("click", () => pickDonateGameShelfCard(el));
  });
}

function updateDonateGameShelf() {
  const query = donateModalGameEl.value.trim();
  const normalizedQuery = normalizeSearch(query);
  clearTimeout(donateGameShelfDebounce);
  if (donateGameShelfAbortController) donateGameShelfAbortController.abort();

  if (!query && currentItems.length === 0) {
    closeDonateGameShelf();
    return;
  }

  const catalogMatches = normalizedQuery
    ? currentItems.filter((item) => normalizeSearch(item.name).includes(normalizedQuery))
    : currentItems.slice(0, 20);

  renderDonateGameShelf(catalogMatches, []);

  const hasExactMatch = catalogMatches.some((item) => normalizeSearch(item.name) === normalizedQuery);
  if (query.length < 2 || hasExactMatch) return;

  donateGameShelfDebounce = setTimeout(() => {
    donateGameShelfAbortController = new AbortController();
    fetch(`/api/l/${LEILAO_ID}/game-search?q=${encodeURIComponent(query)}`, { signal: donateGameShelfAbortController.signal })
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => {
        if (donateModalGameEl.value.trim() !== query) return;
        renderDonateGameShelf(catalogMatches, data.results || []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("Erro ao buscar sugestões de jogo:", err.message);
      });
  }, 200);
}

donateModalGameEl.addEventListener("focus", updateDonateGameShelf);
donateModalGameEl.addEventListener("input", () => {
  unconfirmDonateGame();
  updateDonateGameShelf();
});

donateModalGameAddBtnEl.addEventListener("click", () => {
  const name = donateModalGameEl.value.trim();
  if (!name) return donateModalGameEl.focus();
  confirmDonateGame(name, null);
  donateModalGameShelfEl.querySelectorAll(".game-shelf-card.selected").forEach((el) => el.classList.remove("selected"));
  donateModalGameAddBtnEl.classList.add("confirmed");
  donateModalAmountEl.focus();
});

async function submitDonateModal() {
  const game = donateModalGameEl.value.trim();
  const amount = donateModalAmountEl.value;
  donateModalErrorEl.hidden = true;
  if (!game || !donateGameConfirmed) {
    donateModalErrorEl.textContent = `Escolha um ${mediaLabel()} da lista ou toque em + pra adicionar um novo`;
    donateModalErrorEl.hidden = false;
    return donateModalGameEl.focus();
  }
  if (!amount || Number(amount) < 5) {
    donateModalErrorEl.textContent = "Informe um valor de pelo menos R$5,00";
    donateModalErrorEl.hidden = false;
    return donateModalAmountEl.focus();
  }

  donateModalSubmitEl.disabled = true;
  donateModalSubmitEl.textContent = "Gerando…";
  try {
    const res = await fetch(`/api/l/${LEILAO_ID}/doacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: game,
        amount,
        action: getDonateAction(),
        donorUsername: donateModalNameEl.value.trim(),
        donorNote: donateModalNoteEl.value.trim(),
        donorVoiceId: selectedDonateVoiceId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);

    pendingDonationPaymentId = String(data.paymentId);
    donateQrImgEl.src = `data:image/png;base64,${data.qrCodeBase64}`;
    donateCopyInputEl.value = data.copyPaste;
    showDonateStep("pix");
  } catch (err) {
    donateModalErrorEl.textContent = err.message;
    donateModalErrorEl.hidden = false;
  } finally {
    donateModalSubmitEl.disabled = false;
    donateModalSubmitEl.textContent = "Gerar Pix →";
  }
}

function handleDonationConfirmed() {
  pendingDonationPaymentId = null;
  showDonateStep("success");
  setTimeout(() => { if (!donateModalEl.hidden) closeDonateModal(); }, 2200);
}

donateOpenBtnEl.addEventListener("click", openDonateModal);
donateModalCloseEl.addEventListener("click", closeDonateModal);
donateModalCancelEl.addEventListener("click", closeDonateModal);
donateModalEl.addEventListener("click", (e) => { if (e.target === donateModalEl) closeDonateModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !donateModalEl.hidden) closeDonateModal(); });
donateModalActionSeg.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => setDonateAction(b.dataset.action));
});
donateModalSubmitEl.addEventListener("click", submitDonateModal);
donateModalAmountEl.addEventListener("keydown", (e) => { if (e.key === "Enter") submitDonateModal(); });

wireCopyButton(donateCopyBtnEl, donateCopyInputEl);

async function presenterFetch(path, options = {}) {
  // FormData define seu próprio Content-Type (boundary) -- não fixar aqui.
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`/api/l/${LEILAO_ID}${path}`, {
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

let isPresenterOwner = false;

function setPresenterFabOpen(open) {
  presenterDrawerEl.hidden = !open;
  presenterFabEl.classList.toggle("active", open);
  presenterFabEl.setAttribute("aria-expanded", open ? "true" : "false");
}

function setPresenterMode(active) {
  document.body.classList.toggle("presenter-mode", active);
  presenterToggleEl.classList.toggle("active", active);
  presenterExitEl.hidden = !active;
  presenterToggleEl.title = active
    ? (isPresenterOwner ? "Gerar código para moderador" : "Modo apresentador ativo")
    : "Entrar no modo apresentador";
  presenterFabEl.hidden = !active;
  modeToggleBoardEl.hidden = !active;
  systemSwitchEl.hidden = !active;
  notifBellTriggerEl.hidden = !active;
  setNotifBellOpen(false);
  if (active) {
    loadPendingDonations();
    loadPendingReactVideos();
  } else {
    pendingDonations = [];
    pendingReactVideos = [];
  }
  // fecha o popover de ferramentas sempre que o modo apresentador muda --
  // entrar no modo apresentador não deve abrir a ferramenta sozinho,
  // cabeçalho começa mínimo (ver instrução do cliente sobre isso).
  setPresenterFabOpen(false);
  // a foto no topo só vira link pro /perfil pra quem pode acessá-lo (dono,
  // em modo apresentador) -- sem isso um espectador clicando na foto do
  // host cairia no PRÓPRIO perfil dele (se logado) ou numa tela de login,
  // o que não faz sentido nenhum pra quem só tá assistindo.
  if (active && isPresenterOwner) {
    topbarMenuAvatarLinkEl.href = "/perfil";
    systemSwitchProfileLinkEl.href = "/perfil";
  } else {
    topbarMenuAvatarLinkEl.removeAttribute("href");
    systemSwitchProfileLinkEl.removeAttribute("href");
  }
  updatePixWarning();
}

const presenterLoginModal = document.getElementById("presenter-login-modal");
const presenterLoginForm = document.getElementById("presenter-login-form");
const presenterLoginPassword = document.getElementById("presenter-login-password");
const presenterLoginError = document.getElementById("presenter-login-error");
const presenterLoginSubmit = document.getElementById("presenter-login-submit");
const presenterLoginCancel = document.getElementById("presenter-login-cancel");
const presenterLoginClose = document.getElementById("presenter-login-close");

let pendingAfterLogin = null;

function openPresenterLogin() {
  presenterLoginError.hidden = true;
  presenterLoginPassword.value = "";
  presenterLoginModal.hidden = false;
  presenterLoginPassword.focus();
}

function closePresenterLogin() {
  presenterLoginModal.hidden = true;
}

async function submitPresenterLogin() {
  const password = presenterLoginPassword.value;
  if (!password) return;
  presenterLoginSubmit.disabled = true;
  try {
    const res = await fetch(`/api/l/${LEILAO_ID}/admin/login`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      presenterLoginError.textContent = data.error || "Código incorreto ou expirado";
      presenterLoginError.hidden = false;
      presenterLoginPassword.select();
      return;
    }
    closePresenterLogin();
    setPresenterMode(true);
    if (pendingAfterLogin) {
      const fn = pendingAfterLogin;
      pendingAfterLogin = null;
      fn();
    }
  } finally {
    presenterLoginSubmit.disabled = false;
  }
}

async function checkPresenterAccess() {
  try {
    const { isPresenter, isOwner } = await fetch(`/api/l/${LEILAO_ID}/admin/check-session`, { credentials: "same-origin" }).then((r) => r.json());
    isPresenterOwner = !!isOwner;
    return !!isPresenter;
  } catch (err) {
    isPresenterOwner = false;
    return false;
  }
}

const modCodeModal = document.getElementById("mod-code-modal");
const modCodeClose = document.getElementById("mod-code-close");
const modCodeValue = document.getElementById("mod-code-value");
const modCodeCopy = document.getElementById("mod-code-copy");
const modCodeToggle = document.getElementById("mod-code-toggle");

function closeModCodeModal() {
  modCodeModal.hidden = true;
}

// fica escondido por padrão de propósito -- quem grava a tela não pode
// deixar o código do mod visível sem querer no vídeo/live
function setModCodeVisible(visible) {
  modCodeValue.type = visible ? "text" : "password";
  modCodeToggle.classList.toggle("active", visible);
  modCodeToggle.title = visible ? "Esconder código" : "Mostrar código";
  modCodeToggle.setAttribute("aria-label", modCodeToggle.title);
  modCodeToggle.setAttribute("aria-pressed", String(visible));
}

async function generateModCode() {
  presenterToggleEl.disabled = true;
  try {
    const res = await fetch(`/api/l/${LEILAO_ID}/admin/generate-code`, { method: "POST", credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Não foi possível gerar o código");
    modCodeValue.value = data.code;
    modCodeCopy.classList.remove("is-copied");
    modCodeCopy.disabled = false;
    setModCodeVisible(false);
    modCodeModal.hidden = false;
  } catch (err) {
    alert(err.message);
  } finally {
    presenterToggleEl.disabled = false;
  }
}

modCodeToggle.addEventListener("click", () => setModCodeVisible(modCodeValue.type === "password"));

wireCopyButton(modCodeCopy, modCodeValue);

modCodeClose.addEventListener("click", closeModCodeModal);
modCodeModal.addEventListener("click", (e) => { if (e.target === modCodeModal) closeModCodeModal(); });

presenterToggleEl.addEventListener("click", async () => {
  const isActive = document.body.classList.contains("presenter-mode");
  if (isActive) {
    if (isPresenterOwner) await generateModCode();
    return;
  }
  if (await checkPresenterAccess()) {
    setPresenterMode(true);
    return;
  }
  openPresenterLogin();
});

presenterExitEl.addEventListener("click", async () => {
  await fetch(`/api/l/${LEILAO_ID}/admin/logout`, { method: "POST", credentials: "same-origin" }).catch(() => {});
  isPresenterOwner = false;
  setPresenterMode(false);
});

presenterFabEl.addEventListener("click", () => setPresenterFabOpen(presenterDrawerEl.hidden));

// fecha o popover clicando fora dele (mas não ao clicar no próprio botão
// flutuante, que já tem o próprio toggle acima) -- mesmo padrão informal
// já usado pros overlays de modal (clique fora fecha).
document.addEventListener("click", (e) => {
  if (presenterDrawerEl.hidden) return;
  if (presenterDrawerEl.contains(e.target) || presenterFabEl.contains(e.target)) return;
  setPresenterFabOpen(false);
});

// menu do topbar (ranking/status/modo apresentador/perfil, atrás da
// bolinha com foto + setinha) -- mesmo padrão de popover do FAB acima.
function setTopbarMenuOpen(open) {
  topbarMenuDropdownEl.hidden = !open;
  topbarMenuTriggerEl.classList.toggle("active", open);
  topbarMenuTriggerEl.setAttribute("aria-expanded", open ? "true" : "false");
}
topbarMenuTriggerEl.addEventListener("click", () => setTopbarMenuOpen(topbarMenuDropdownEl.hidden));
document.addEventListener("click", (e) => {
  if (topbarMenuDropdownEl.hidden) return;
  if (topbarMenuDropdownEl.contains(e.target) || topbarMenuTriggerEl.contains(e.target)) return;
  setTopbarMenuOpen(false);
});

// Precisa ser um <form> real -- senão o Chrome tenta associar esse campo de código a outro texto da página.
presenterLoginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  submitPresenterLogin();
});
presenterLoginCancel.addEventListener("click", closePresenterLogin);
presenterLoginClose.addEventListener("click", closePresenterLogin);
presenterLoginModal.addEventListener("click", (e) => { if (e.target === presenterLoginModal) closePresenterLogin(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !presenterLoginModal.hidden) closePresenterLogin(); });

document.getElementById("p-pause-toggle").addEventListener("click", async () => {
  try {
    await presenterFetch("/admin/pause", {
      method: "POST",
      body: JSON.stringify({ paused: !isPausedState }),
    });
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("p-timer-reset").addEventListener("click", async () => {
  try {
    await presenterFetch("/admin/reset-timer", { method: "POST" });
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("p-timer-lock").addEventListener("click", async () => {
  try {
    await presenterFetch("/admin/toggle-timer-lock", {
      method: "POST",
      body: JSON.stringify({ locked: !isTimerLockedState }),
    });
  } catch (err) {
    alert(err.message);
  }
});

const timerMinutesInput = document.getElementById("p-timer-minutes");
document.getElementById("p-timer-set").addEventListener("click", async () => {
  const minutes = Number(timerMinutesInput.value);
  if (!minutes || minutes <= 0) return timerMinutesInput.focus();
  try {
    await presenterFetch("/admin/set-timer", {
      method: "POST",
      body: JSON.stringify({ minutes }),
    });
    timerMinutesInput.value = "";
  } catch (err) {
    alert(err.message);
  }
});

timerMinutesInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("p-timer-set").click();
});

document.getElementById("p-toggle-open").addEventListener("click", async () => {
  if (isOpenState) {
    const ok = await confirmDialog({
      title: "Encerrar leilão",
      message: "Encerrar o leilão agora? Ele só reabre quando você reabrir manualmente.",
      confirmLabel: "Encerrar",
      danger: true,
    });
    if (!ok) return;
  }
  try {
    await presenterFetch("/admin/toggle-open", {
      method: "POST",
      body: JSON.stringify({ open: !isOpenState }),
    });
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("p-reset-btn").addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "Zerar leilão",
    message: `Isso apaga TODOS os ${mediaLabel()}s e o histórico desse leilão. Título e host continuam os mesmos. Tem certeza?`,
    confirmLabel: "Zerar",
    danger: true,
  });
  if (!ok) return;
  try {
    await presenterFetch("/admin/reset", { method: "POST" });
  } catch (err) {
    alert(err.message);
  }
});

modeToggleBoardEl.addEventListener("click", async () => {
  const newMode = currentMode === "filmes" ? "jogos" : "filmes";
  const label = newMode === "filmes" ? "Filmes" : "Jogos";
  const ok = await confirmDialog({
    title: `Trocar pra ${label}`,
    message: "Isso zera o catálogo e o histórico atual do leilão, pra não misturar capa buscada de um jeito com a de outro. Título e host continuam os mesmos. Tem certeza?",
    confirmLabel: `Trocar pra ${label}`,
    danger: true,
  });
  if (!ok) return;
  try {
    await presenterFetch("/admin/set-mode", { method: "POST", body: JSON.stringify({ mode: newMode }) });
    window.refreshBoardCoverBg?.();
  } catch (err) {
    alert(err.message);
  }
});

function findGameByName(name) {
  const norm = name.trim().toLowerCase();
  return currentItems.find((i) => i.name.trim().toLowerCase() === norm) || null;
}

function submitManualSearch() {
  const name = manualNameEl.value.trim();
  if (!name) return manualNameEl.focus();
  hideSuggestions();
  openLotModal(findGameByName(name) || { name });
}

document.getElementById("p-manual-submit").addEventListener("click", submitManualSearch);

const manualNameEl = document.getElementById("p-manual-name");
const suggestionsEl = document.getElementById("game-suggestions");
let suggestionsAbortController = null;
let suggestionsDebounce = null;

function hideSuggestions() {
  suggestionsEl.hidden = true;
  suggestionsEl.innerHTML = "";
}

function renderSuggestions(query, results) {
  const items = results.map((g) => {
    const thumb = g.image
      ? `<img class="suggestion-thumb" src="${g.image}" alt="" loading="lazy" />`
      : `<div class="suggestion-thumb suggestion-thumb-placeholder">${escapeHtml((g.name[0] || "?").toUpperCase())}</div>`;
    return `
      <div class="suggestion-item" data-name="${escapeHtml(g.name)}" data-image="${escapeHtml(g.image || "")}">
        ${thumb}
        <span class="suggestion-name">${escapeHtml(g.name)}</span>
        ${g.year ? `<span class="suggestion-year">${g.year}</span>` : ""}
      </div>
    `;
  });

  items.push(`
    <div class="suggestion-item manual" data-name="${escapeHtml(query)}" data-image="">
      Adicionar <strong>"${escapeHtml(query)}"</strong>
      <span class="badge-manual">manual</span>
    </div>
  `);

  suggestionsEl.innerHTML = items.join("");
  suggestionsEl.hidden = false;

  suggestionsEl.querySelectorAll(".suggestion-item").forEach((el) => {
    el.addEventListener("click", () => {
      const name = el.dataset.name;
      hideSuggestions();
      manualNameEl.value = "";
      const existing = findGameByName(name);
      openLotModal(existing || { name, image: el.dataset.image || null });
    });
  });
}

manualNameEl.addEventListener("input", () => {
  const query = manualNameEl.value.trim();
  clearTimeout(suggestionsDebounce);
  if (query.length < 2) {
    hideSuggestions();
    return;
  }
  suggestionsDebounce = setTimeout(() => {
    suggestionsEl.innerHTML = '<div class="suggestion-loading">buscando "' + escapeHtml(query) + '"…</div>';
    suggestionsEl.hidden = false;

    if (suggestionsAbortController) suggestionsAbortController.abort();
    suggestionsAbortController = new AbortController();
    fetch(`/api/l/${LEILAO_ID}/admin/game-search?q=${encodeURIComponent(query)}`, {
      credentials: "same-origin",
      signal: suggestionsAbortController.signal,
    })
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => {
        if (manualNameEl.value.trim() !== query) return;
        renderSuggestions(query, data.results || []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("Erro ao buscar sugestões:", err.message);
      });
  }, 150);
});

document.addEventListener("click", (e) => {
  if (!suggestionsEl.hidden && !e.target.closest(".field-wrap")) hideSuggestions();
});

manualNameEl.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideSuggestions();
  else if (e.key === "Enter") submitManualSearch();
});


function setModalAction(action) {
  lotModalActionSeg.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.action === action);
  });
  const wrap = lotModalAmount.closest(".amount-wrap");
  wrap.classList.toggle("act-add", action === "add");
  wrap.classList.toggle("act-remove", action === "remove");
}

function getModalAction() {
  const active = lotModalActionSeg.querySelector("button.active");
  return active ? active.dataset.action : "add";
}

function openLotModal(game) {
  modalGame = game;
  const existing = game.key != null && game.total != null;

  lotModalTitle.textContent = game.name;
  lotModalEyebrow.textContent = existing ? "editar lote" : "novo lote";

  if (game.image) {
    lotModalThumb.src = game.image;
    lotModalThumb.hidden = false;
  } else {
    lotModalThumb.hidden = true;
    lotModalThumb.removeAttribute("src");
  }

  if (existing) {
    lotModalCurrent.textContent = `total atual: ${formatBRL(game.total)}`;
    lotModalCurrent.hidden = false;
  } else {
    lotModalCurrent.hidden = true;
  }

  lotModalTitleEditBtn.hidden = !existing;
  hideLotModalRename();

  setModalAction("add");
  lotModalAmount.value = "";
  lotModalDonor.value = "";
  lotModalSubmit.disabled = false;
  hideDonorSuggestions();
  lotModalEl.hidden = false;
  setTimeout(() => lotModalAmount.focus(), 40);
}

function closeLotModal() {
  lotModalEl.hidden = true;
  hideDonorSuggestions();
  modalGame = null;
}

let lotModalRenameImage; // undefined = não mexe na capa atual; só vira string/null ao escolher um card da busca
let lotModalRenameDebounce = null;
let lotModalRenameAbort = null;

function hideLotModalRename() {
  clearTimeout(lotModalRenameDebounce);
  if (lotModalRenameAbort) lotModalRenameAbort.abort();
  lotModalRenameFieldEl.hidden = true;
  lotModalAmountFieldsEl.hidden = false;
}

function showLotModalRename() {
  lotModalRenameImage = undefined;
  lotModalRenameInputEl.value = modalGame.name;
  lotModalRenameShelfEl.hidden = true;
  lotModalRenameShelfEl.innerHTML = "";
  lotModalAmountFieldsEl.hidden = true;
  lotModalRenameFieldEl.hidden = false;
  setTimeout(() => { lotModalRenameInputEl.focus(); lotModalRenameInputEl.select(); }, 40);
}

function lotModalRenameShelfCardHtml(item) {
  const thumb = item.image
    ? `<img class="game-shelf-cover" src="${escapeHtml(item.image)}" alt="" loading="lazy" />`
    : `<div class="game-shelf-cover game-shelf-cover-placeholder">${escapeHtml((item.name[0] || "?").toUpperCase())}</div>`;
  return `
    <div class="game-shelf-card" data-name="${escapeHtml(item.name)}" data-image="${escapeHtml(item.image || "")}">
      ${thumb}
      <span class="game-shelf-name">${escapeHtml(item.name)}</span>
    </div>
  `;
}

function updateLotModalRenameShelf() {
  const query = lotModalRenameInputEl.value.trim();
  clearTimeout(lotModalRenameDebounce);
  if (lotModalRenameAbort) lotModalRenameAbort.abort();
  if (query.length < 2) {
    lotModalRenameShelfEl.hidden = true;
    lotModalRenameShelfEl.innerHTML = "";
    return;
  }
  lotModalRenameDebounce = setTimeout(() => {
    lotModalRenameAbort = new AbortController();
    presenterFetch(`/admin/game-search?q=${encodeURIComponent(query)}`, { signal: lotModalRenameAbort.signal })
      .then((data) => {
        if (lotModalRenameInputEl.value.trim() !== query) return;
        const results = (data && data.results) || [];
        lotModalRenameShelfEl.innerHTML = results.length
          ? results.map(lotModalRenameShelfCardHtml).join("")
          : `<p class="game-shelf-empty">nenhum resultado, o nome digitado será usado do jeito que está</p>`;
        lotModalRenameShelfEl.hidden = false;
        lotModalRenameShelfEl.querySelectorAll(".game-shelf-card").forEach((el) => {
          el.addEventListener("click", () => {
            lotModalRenameInputEl.value = el.dataset.name;
            lotModalRenameImage = el.dataset.image || null;
            lotModalRenameShelfEl.querySelectorAll(".game-shelf-card.selected").forEach((c) => c.classList.remove("selected"));
            el.classList.add("selected");
          });
        });
      })
      .catch((err) => { if (err.name !== "AbortError") console.error("Erro ao buscar sugestões:", err.message); });
  }, 200);
}

// atualiza o card no catálogo na hora, sem esperar o próximo "update" do
// socket -- numa conexão real (não local), esse aviso pode atrasar ou se
// perder num pico de reconexão mesmo a gravação já tendo funcionado no
// servidor, e o card por trás do modal ficava com o nome antigo até
// qualquer outro evento forçar um re-render (o que parecia "só funciona se
// eu clicar em outra coisa depois").
//
// renameGame no servidor pode migrar a chave interna (nome livre) ou
// mesclar com um jogo que já existia com esse nome (colisão) -- por isso
// recebe a chave ANTIGA (pra achar o card certo na tela) e o objeto `game`
// inteiro que o servidor devolveu (fonte da verdade sobre o que aconteceu).
function patchLotCardAfterRename(oldKey, game) {
  const oldIndex = currentItems.findIndex((i) => i.key === oldKey);
  if (oldIndex === -1) return;
  const oldCard = lotListEl.querySelector(`.lot-card[data-key="${CSS.escape(oldKey)}"]`);
  const mergedIntoExisting = game.key !== oldKey && currentItems.some((i, idx) => idx !== oldIndex && i.key === game.key);

  if (mergedIntoExisting) {
    // o jogo renomeado foi absorvido por outro que já tinha esse nome --
    // esse card some, o outro reflete o valor somado quando o "update" do
    // socket chegar (evita recalcular rank/barra dos dois cards na mão).
    currentItems.splice(oldIndex, 1);
    if (oldCard) oldCard.remove();
    return;
  }

  const item = currentItems[oldIndex];
  item.key = game.key;
  item.name = game.name;
  item.image = game.image_url || null;
  if (!oldCard) return;
  oldCard.dataset.key = game.key;
  oldCard.innerHTML = lotCardInnerHtml(item, 0, "", false, "", "", "");
  const editBtn = oldCard.querySelector(".lot-edit button");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      const it = currentItems.find((i) => i.key === editBtn.dataset.key);
      if (it) openLotModal(it);
    });
  }
}

async function saveLotModalRename() {
  if (!modalGame) return;
  const name = lotModalRenameInputEl.value.trim();
  if (!name) return lotModalRenameInputEl.focus();
  lotModalRenameSaveBtn.disabled = true;
  try {
    const oldKey = modalGame.key;
    const { game } = await presenterFetch("/admin/rename", {
      method: "POST",
      body: JSON.stringify({ key: modalGame.key, newName: name, image: lotModalRenameImage }),
    });
    modalGame = { ...modalGame, key: game.key, name: game.name, image: game.image_url || null };
    lotModalTitle.textContent = modalGame.name;
    if (modalGame.image) {
      lotModalThumb.src = modalGame.image;
      lotModalThumb.hidden = false;
    } else {
      lotModalThumb.hidden = true;
      lotModalThumb.removeAttribute("src");
    }
    patchLotCardAfterRename(oldKey, game);
    hideLotModalRename();
  } catch (err) {
    alert(err.message);
  } finally {
    lotModalRenameSaveBtn.disabled = false;
  }
}

lotModalTitleEditBtn.addEventListener("click", showLotModalRename);
lotModalRenameCancelBtn.addEventListener("click", hideLotModalRename);
lotModalRenameSaveBtn.addEventListener("click", saveLotModalRename);
lotModalRenameInputEl.addEventListener("input", () => {
  lotModalRenameImage = undefined;
  updateLotModalRenameShelf();
});
lotModalRenameInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); saveLotModalRename(); }
});

async function submitLotModal() {
  if (!modalGame || lotModalSubmit.disabled) return;
  const amount = lotModalAmount.value;
  if (!amount || Number(amount) <= 0) return lotModalAmount.focus();
  lotModalSubmit.disabled = true;
  try {
    await presenterFetch("/admin/manual-entry", {
      method: "POST",
      body: JSON.stringify({
        name: modalGame.name,
        amount,
        action: getModalAction(),
        username: lotModalDonor.value.trim(),
      }),
    });
    closeLotModal();
  } catch (err) {
    alert(err.message);
  } finally {
    lotModalSubmit.disabled = false;
  }
}

lotModalActionSeg.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => setModalAction(b.dataset.action));
});
lotModalSubmit.addEventListener("click", submitLotModal);
lotModalCancel.addEventListener("click", closeLotModal);
lotModalClose.addEventListener("click", closeLotModal);
lotModalEl.addEventListener("click", (e) => { if (e.target === lotModalEl) closeLotModal(); });
lotModalAmount.addEventListener("keydown", (e) => { if (e.key === "Enter") submitLotModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || lotModalEl.hidden) return;
  if (!lotModalRenameFieldEl.hidden) return hideLotModalRename();
  closeLotModal();
});

function hideDonorSuggestions() {
  donorSuggestionsEl.hidden = true;
  donorSuggestionsEl.innerHTML = "";
}

function showDonorSuggestions() {
  const q = donorInputEl.value.trim().toLowerCase();
  let matches = donorNames;
  if (q) matches = donorNames.filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q);
  matches = matches.slice(0, 6);
  if (matches.length === 0) return hideDonorSuggestions();

  donorSuggestionsEl.innerHTML = matches
    .map((n) => `<div class="suggestion-item donor-suggestion" data-name="${escapeHtml(n)}"><span class="suggestion-name">${escapeHtml(n)}</span></div>`)
    .join("");
  donorSuggestionsEl.hidden = false;

  donorSuggestionsEl.querySelectorAll(".suggestion-item").forEach((el) => {
    // mousedown (não click) pra disparar antes do blur do input
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      donorInputEl.value = el.dataset.name;
      hideDonorSuggestions();
    });
  });
}

donorInputEl.addEventListener("input", showDonorSuggestions);
donorInputEl.addEventListener("focus", showDonorSuggestions);
donorInputEl.addEventListener("blur", () => setTimeout(hideDonorSuggestions, 120));

checkPresenterAccess().then((active) => { if (active) setPresenterMode(true); });

socket.on("update", ({ leaderboard }) => {
  const openBtn = document.getElementById("p-toggle-open");
  const openLabel = leaderboard.open ? "Encerrar leilão" : "Reabrir leilão";
  openBtn.classList.toggle("is-closed", !leaderboard.open);
  openBtn.title = openLabel;
  openBtn.setAttribute("aria-label", openLabel);
  document.getElementById("p-open-label").textContent = leaderboard.open ? "Encerrar" : "Reabrir";

  const pauseBtn = document.getElementById("p-pause-toggle");
  const pauseLabel = leaderboard.paused ? "Retomar timer" : "Pausar timer";
  pauseBtn.classList.toggle("is-paused", !!leaderboard.paused);
  pauseBtn.disabled = !leaderboard.open;
  pauseBtn.title = leaderboard.open ? pauseLabel : "Reabra o leilão pra poder pausar";
  pauseBtn.setAttribute("aria-label", pauseBtn.title);
  document.getElementById("p-pause-label").textContent = leaderboard.paused ? "Retomar" : "Pausar";

  isTimerLockedState = !!leaderboard.timerLocked;
  const lockBtn = document.getElementById("p-timer-lock");
  lockBtn.classList.toggle("is-locked", isTimerLockedState);
  lockBtn.setAttribute("aria-pressed", String(isTimerLockedState));
  lockBtn.title = isTimerLockedState
    ? "Destravar -- doações voltam a somar tempo"
    : "Impede que novas doações somem mais tempo -- pra dar o ultimato";
  document.getElementById("p-timer-lock-label").textContent = isTimerLockedState ? "Tempo travado" : "Travar tempo";
});
