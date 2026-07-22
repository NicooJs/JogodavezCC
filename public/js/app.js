// /l/<id> — id filtra todo fetch/socket abaixo pra esse leilão.
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
const timerEl = document.getElementById("timer");
const timerClockEl = document.getElementById("timer-clock");
const timerLabelEl = document.getElementById("timer-label");
const statTotalEl = document.getElementById("stat-total");
const topbarTotalEl = document.getElementById("topbar-total");
const totalHideToggleEl = document.getElementById("total-hide-toggle");
const lotCountEl = document.getElementById("lot-count");
const donorCountEl = document.getElementById("donor-count");
const presenterToggleEl = document.getElementById("presenter-toggle");
const presenterDrawerEl = document.getElementById("presenter-drawer");
const timerRingFillEl = document.getElementById("timer-ring-fill");
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
const historyOverlayEl = document.getElementById("history-overlay");
const historyCloseEl = document.getElementById("history-close");
const historyGridEl = document.getElementById("history-grid");
const historyModalEmptyEl = document.getElementById("history-modal-empty");
const historyOpenBtnEl = document.getElementById("history-open-btn");
const webhookWarningEl = document.getElementById("mp-warning");

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

const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * 28;

let timerEndsAt = null;
let timerDurationMs = 5 * 60 * 1000; // placeholder, atualizado no primeiro "update"
let isOpenState = null; // null = antes do primeiro "update"
let isPausedState = false;
let pausedRemainingMs = null;
let mpDisconnectedState = false;
let historyItems = [];
let currentLeaderKey = null;
let lastTotalRaised = null;
let previousTotals = new Map();
let currentItems = [];
let donorNames = [];
let modalGame = null;

const totalOdometer = window.Odometer
  ? new Odometer({ el: statTotalEl, value: 0, format: "(.ddd)", theme: "minimal" })
  : null;

function formatBRL(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Título é texto livre (definido pelo streamer), não uma palavra fixa, então
// os ícones miram 5 letras comuns em português (só a 1ª ocorrência de cada)
// em vez de uma posição fixa. Sem match ou sem Motion, fica só o texto normal.
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

let animateTitleSwapIcon = null; // import do Motion, cacheado
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

// "update" chega a cada doação/timer; sem essa guarda a animação dos
// ícones reiniciaria antes de completar um ciclo.
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

// remove/reflow/readiciona pra reiniciar a animação CSS mesmo se ainda rodando
function flashTotalBeam() {
  topbarTotalEl.classList.remove("beam");
  void topbarTotalEl.offsetWidth;
  topbarTotalEl.classList.add("beam");
}

function setStatus(online) {
  statusEl.classList.toggle("online", online);
  statusTextEl.textContent = online ? "ao vivo" : "reconectando…";
}

// Aviso só no modo apresentador; confundiria o espectador no board público.
function updateWebhookWarning() {
  const active = document.body.classList.contains("presenter-mode");
  webhookWarningEl.hidden = !(active && mpDisconnectedState);
}

socket.on("connect", () => {
  setStatus(true);
  loadInitialHistory();
});
socket.on("disconnect", () => setStatus(false));

function setRingFraction(fraction) {
  const offset = TIMER_RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, fraction)));
  timerRingFillEl.style.strokeDashoffset = String(offset);
}

const FINAL_COUNTDOWN_SECONDS = 15;

function tickTimer() {
  if (!isOpenState) {
    timerEl.classList.add("closed");
    timerEl.classList.remove("urgent", "paused");
    boardEl.classList.remove("final-countdown");
    timerLabelEl.textContent = "leilão";
    timerClockEl.textContent = "ENCERRADO";
    setRingFraction(0);
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
    return;
  }
  const totalSeconds = Math.ceil(msLeft / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  timerLabelEl.textContent = "encerra em";
  timerClockEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  timerEl.classList.toggle("urgent", totalSeconds <= 60);
  boardEl.classList.toggle("final-countdown", totalSeconds <= FINAL_COUNTDOWN_SECONDS);
  setRingFraction(msLeft / timerDurationMs);
}
setInterval(tickTimer, 1000);

function thumbHtml(item, className) {
  return item.image
    ? `<img class="${className}" src="${escapeHtml(item.image)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${className} ${className}-placeholder',textContent:'${escapeHtml((item.name[0] || "?").toUpperCase())}'}))" />`
    : `<div class="${className} ${className}-placeholder">${escapeHtml((item.name[0] || "?").toUpperCase())}</div>`;
}

// Mesmo desenho pro top-3, cor vem de .lot-card.rank-N via currentColor.
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
    <div class="lot-top-donor" title="Quem mais apoiou este jogo">
      ${avatar}
      <span class="lot-top-donor-name">${escapeHtml(item.topDonor.username)}</span>
    </div>
  `;
}

function lotCardInnerHtml(item, barPct, hitBadge, changed) {
  const thumb = thumbHtml(item, "lot-thumb");
  const bg = item.image
    ? `<div class="lot-card-bg" style="background-image:url('${escapeHtml(item.image)}')"></div>`
    : "";
  return `
    ${bg}
    <div class="lot-card-fill"></div>
    <div class="lot-card-content">
      <span class="lot-rank">${rankBadgeHtml(item.rank)}</span>
      ${thumb}
      <div class="lot-info">
        <p class="lot-name">${escapeHtml(item.name)}</p>
        ${lotFundingHtml(item)}
        ${lotTopDonorHtml(item)}
      </div>
      <div class="lot-meta">
        <span class="lot-total${changed ? " tick" : ""}">${formatBRL(item.total)}</span>
        ${hitBadge}
        <div class="lot-edit">
          <button data-key="${item.key}" type="button" aria-label="Editar ${escapeHtml(item.name)}" title="Editar">
            <svg class="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3.5l3.5 3.5L6.5 17 2.5 17.5 3 13.5 13 3.5z"/><path d="M11.3 5.2l3.5 3.5"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

// burst é position:fixed ancorado no rect do card, não filho dele -- o
// overflow:hidden do card (pra imagem de fundo) cortaria o efeito.
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

// Reaproveita os cards existentes por data-key e reordena via appendChild
// (técnica FLIP abaixo) em vez de recriar o DOM a cada update.
function renderLots(items, flashKey, flashType, lastSabotagedKey, qualifyCount) {
  lotCountEl.textContent = String(items.length);

  if (items.length === 0) {
    emptyStateEl.style.display = "flex";
    lotListEl.innerHTML = emptyStateEl.outerHTML;
    previousTotals = new Map();
    currentLeaderKey = null;
    return;
  }
  emptyStateEl.style.display = "none";

  const staleEmpty = lotListEl.querySelector(".arena-empty");
  if (staleEmpty) staleEmpty.remove();

  const maxTotal = Math.max(...items.map((i) => i.total), 1);
  const nextTotals = new Map();

  const firstRects = new Map();
  lotListEl.querySelectorAll(".lot-card").forEach((el) => {
    firstRects.set(el.dataset.key, el.getBoundingClientRect());
  });

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

    let card = lotListEl.querySelector(`.lot-card[data-key="${CSS.escape(item.key)}"]`);
    if (!card) {
      card = document.createElement("div");
      card.dataset.key = item.key;
    }
    card.className = `lot-card rank-${item.rank}${flashClass}`;
    card.style.setProperty("--pct", `${barPct}%`);
    card.innerHTML = lotCardInnerHtml(item, barPct, hitBadge, changed);
    lotListEl.appendChild(card);

    // qualifyCount é config por leilão (ver getQualifyCount em server.js), não fixo em 3.
    if (item.rank === qualifyCount && items.length > qualifyCount) {
      let divider = lotListEl.querySelector(".qualify-divider");
      if (!divider) {
        divider = document.createElement("div");
        divider.className = "qualify-divider";
        divider.innerHTML = "<span>classificados até aqui</span>";
      }
      lotListEl.appendChild(divider);
    }
  });
  if (items.length <= qualifyCount) {
    const divider = lotListEl.querySelector(".qualify-divider");
    if (divider) divider.remove();
  }

  lotListEl.querySelectorAll(".lot-card").forEach((el) => {
    if (!seenKeys.has(el.dataset.key)) el.remove();
  });

  previousTotals = nextTotals;

  lotListEl.querySelectorAll(".lot-edit button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = currentItems.find((i) => i.key === btn.dataset.key);
      if (item) openLotModal(item);
    });
  });

  // FLIP: conta deltaX também, não só deltaY — na grade de 2 colunas um
  // lote pode trocar de coluna ao mudar de posição, não só de linha.
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
        // Vira badge persistente em vez de sumir -- sem isso ficava um
        // buraco até o próximo re-render qualquer.
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

function renderDonors(donors) {
  donorEmptyEl.style.display = donors.length === 0 ? "flex" : "none";
  const maxTotal = Math.max(...donors.map((d) => d.total), 1);
  const rows = donors.map((d) => {
    const pct = d.total > 0 ? Math.max(4, Math.round((d.total / maxTotal) * 100)) : 0;
    const avatar = d.avatar
      ? `<img class="donor-avatar" src="${escapeHtml(d.avatar)}" alt="" loading="lazy" />`
      : `<span class="donor-avatar donor-avatar-placeholder">${escapeHtml((d.username || "?")[0].toUpperCase())}</span>`;
    return `
    <div class="donor-row rank-${d.rank}" style="--pct:${pct}%">
      <div class="donor-row-fill"></div>
      <span class="donor-rank">${rankBadgeHtml(d.rank)}</span>
      ${avatar}
      <span class="donor-name">${escapeHtml(d.username || "Anônimo")}</span>
      <span class="donor-total">${formatBRL(d.total)}</span>
    </div>
  `;
  });
  donorListEl.innerHTML = (donors.length === 0 ? donorEmptyEl.outerHTML : "") + rows.join("");
  donorCountEl.textContent = String(donors.length);
}

function historyLabel(event) {
  if (event.type === "add" || event.type === "manual") {
    return { text: `<span class="who">${escapeHtml(event.username || "Anônimo")}</span> apoiou <strong>${escapeHtml(event.game ? event.game.name : "")}</strong>`, dot: "dot-add", amtClass: "amt-add" };
  }
  if (event.type === "remove") {
    return { text: `<span class="who">${escapeHtml(event.username || "Anônimo")}</span> tirou pontos de <strong>${escapeHtml(event.game ? event.game.name : "")}</strong>`, dot: "dot-remove", amtClass: "amt-remove" };
  }
  if (event.type === "ignored") {
    return { text: `<span class="who">${escapeHtml(event.username || "Anônimo")}</span> doou sem indicar um lote`, dot: "", amtClass: "" };
  }
  if (event.type === "closed") {
    return { text: `<span class="who">${escapeHtml(event.username || "Anônimo")}</span> doou (leilão encerrado, não contabilizado)`, dot: "", amtClass: "" };
  }
  return null;
}

function historyIconHtml(dotClass) {
  if (dotClass === "dot-add") {
    return `<span class="history-icon icon-add"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3M3 6l3-3 3 3"/></svg></span>`;
  }
  if (dotClass === "dot-remove") {
    return `<span class="history-icon icon-remove"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v6M3 6l3 3 3-3"/></svg></span>`;
  }
  return `<span class="history-icon icon-neutral"></span>`;
}

let historySortMode = "recent"; // "recent" | "high" | "low"

function sortedHistoryItems() {
  if (historySortMode === "high") return [...historyItems].sort((a, b) => (b.amount || 0) - (a.amount || 0));
  if (historySortMode === "low") return [...historyItems].sort((a, b) => (a.amount || 0) - (b.amount || 0));
  return historyItems; // já vem mais recente primeiro (unshift em pushHistory)
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
        ${historyIconHtml(info.dot)}
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
}

async function loadInitialHistory() {
  try {
    const res = await fetch(`/api/l/${LEILAO_ID}/events/recent?limit=30`);
    const data = await res.json();
    historyItems = data.events
      .filter((e) => e.action === "add" || e.action === "remove" || e.action === "ignored")
      .map((e) => ({
        type: e.action,
        username: e.username,
        amount: e.amount,
        game: e.game_name ? { name: e.game_name } : null,
        time: e.created_at ? new Date(e.created_at).getTime() : Date.now(),
      }));
    renderHistory();
  } catch (err) {
    console.error("Erro ao carregar histórico:", err);
  }
}

// Anéis pontilhados girando atrás do "Vencedor!", em Canvas2D em vez de
// shader WebGL -- não compensa montar um pipeline WebGL pra um flash de ~2.2s.
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
  soldMarkEl.textContent = leaderName ? `Vencedor — ${leaderName}!` : "Vencedor!";
  soldOverlayEl.hidden = false;
  soldOverlayEl.style.animation = "none";
  soldMarkEl.style.animation = "none";
  void soldOverlayEl.offsetWidth; // força reflow pra reiniciar a animação
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

// Recap desenhado manualmente num <canvas> (sem lib de DOM-pra-imagem no
// projeto), 1200x630, tamanho padrão de card de link social.
let currentRecapForDownload = null;

async function downloadRecapImage() {
  const recap = currentRecapForDownload;
  if (!recap) return;
  await document.fonts.ready; // evita desenhar com fonte de fallback antes de carregar

  const W = 1200;
  const H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const rootStyle = getComputedStyle(document.documentElement);
  const cVar = (name, fallback) => rootStyle.getPropertyValue(name).trim() || fallback;
  const bg = cVar("--bg", "#17131f");
  const surface = cVar("--surface", "#1e1829");
  const border = cVar("--border", "#3a2f4d");
  const textColor = cVar("--text", "#f2eff7");
  const muted = cVar("--muted", "#9891a8");
  const accent = cVar("--accent", "#b98cf5");
  const accentText = cVar("--accent-text", "#d1b3fa");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.save();
  ctx.translate(58, 54);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = accent;
  ctx.fillRect(-6, -6, 12, 12);
  ctx.restore();
  ctx.fillStyle = textColor;
  ctx.font = "600 22px 'IBM Plex Sans', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("Leilão de Jogos", 78, 54);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = accentText;
  ctx.font = "600 14px 'IBM Plex Mono', monospace";
  ctx.fillText("LEILÃO ENCERRADO", 56, 118);

  ctx.fillStyle = textColor;
  ctx.font = "italic 700 40px 'Nunito', sans-serif";
  const title = recap.title || "Leilão de Jogos";
  ctx.fillText(title.length > 34 ? `${title.slice(0, 33)}…` : title, 56, 160);

  ctx.fillStyle = accentText;
  ctx.font = "700 84px 'IBM Plex Mono', monospace";
  const totalText = recap.totalRaised === null ? "oculto" : formatBRL(recap.totalRaised || 0);
  ctx.fillText(totalText, 56, 270);
  ctx.fillStyle = muted;
  ctx.font = "600 15px 'IBM Plex Mono', monospace";
  ctx.fillText("ARRECADADO", 58, 292);

  const stats = [
    [formatDuration(recap.durationMs), "DURAÇÃO"],
    [String(recap.totalDonors || 0), "APOIADORES"],
    [String(recap.totalGames || 0), "LOTES"],
  ];
  let sx = 56;
  stats.forEach(([value, label]) => {
    ctx.fillStyle = textColor;
    ctx.font = "600 26px 'IBM Plex Mono', monospace";
    ctx.fillText(value, sx, 340);
    ctx.fillStyle = muted;
    ctx.font = "600 12px 'IBM Plex Mono', monospace";
    ctx.fillText(label, sx, 360);
    sx += 170;
  });

  const top3 = (recap.topGames || []).slice(0, 3);
  const medalColors = [accentText, "#d6d0e0", "#c99a6c"];
  ctx.fillStyle = muted;
  ctx.font = "600 12px 'IBM Plex Mono', monospace";
  ctx.fillText("TOP 3", 56, 400);
  let ty = 434;
  top3.forEach((game, i) => {
    ctx.fillStyle = surface;
    ctx.fillRect(56, ty - 22, W - 112, 46);
    ctx.fillStyle = medalColors[i] || muted;
    ctx.font = "700 16px 'IBM Plex Mono', monospace";
    ctx.fillText(`${i + 1}º`, 72, ty + 5);
    ctx.fillStyle = textColor;
    ctx.font = "600 18px 'IBM Plex Sans', sans-serif";
    ctx.fillText(game.name, 116, ty + 6);
    ctx.fillStyle = accentText;
    ctx.font = "700 18px 'IBM Plex Mono', monospace";
    const amountText = formatBRL(game.total);
    ctx.fillText(amountText, W - 72 - ctx.measureText(amountText).width, ty + 6);
    ty += 58;
  });

  ctx.fillStyle = muted;
  ctx.font = "500 13px 'IBM Plex Mono', monospace";
  ctx.fillText(`${location.origin}/l/${LEILAO_ID}`, 56, H - 30);

  const link = document.createElement("a");
  link.download = `recap-${LEILAO_ID}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
recapDownloadBtnEl.addEventListener("click", downloadRecapImage);

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

// O pódio só tem 3 posições; do 4º em diante (qualifyCount > 3) usa essa
// lista compacta.
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

// Compartilhado entre o recap ao vivo e os arquivados (showHistoricalRecap)
// -- mesma forma de dado (buildRecap em server.js), só muda o eyebrow.
function renderRecap(recap, eyebrowText) {
  recapEyebrowEl.textContent = eyebrowText;
  recapTitleEl.textContent = recap.title || "Leilão de Jogos";
  recapTotalEl.textContent = recap.totalRaised === null ? "oculto" : formatBRL(recap.totalRaised || 0);
  recapDurationEl.textContent = formatDuration(recap.durationMs);
  recapDonorsEl.textContent = String(recap.totalDonors || 0);
  recapGamesEl.textContent = String(recap.totalGames || 0);

  const shareUrl = `${location.origin}/l/${LEILAO_ID}`;
  // Omite o valor quando totalRaised tá oculto, mesma regra de privacidade do resto do recap.
  const shareText = recap.totalRaised === null
    ? "Acabei de fazer um leilão de jogos com a galera! Dá uma olhada:"
    : `Acabei de arrecadar ${formatBRL(recap.totalRaised || 0)} num leilão de jogos com a galera! Dá uma olhada:`;
  recapShareXEl.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  currentRecapForDownload = recap;

  const champion = (recap.topGames || [])[0];
  const championLineEl = document.getElementById("recap-champion-line");
  const recordLineEl = document.getElementById("recap-record-line");
  const highlightEl = document.getElementById("recap-highlight");
  // Troféu reaproveita o SVG do title-swap (TITLE_SWAP_ICONS.i).
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
  recapDonorListEl.innerHTML = topDonors.map((d) => `
    <div class="recap-donor-row rank-${d.rank}">
      <span class="recap-donor-rank">${rankBadgeHtml(d.rank)}</span>
      <span class="recap-donor-name">${escapeHtml(d.username || "Anônimo")}</span>
      <span class="recap-donor-total">${formatBRL(d.total)}</span>
    </div>
  `).join("");

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

// /l/:id?recap=<index> — index na lista de /recap/history, mais recente primeiro.
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

// Ranqueia os próprios leilões passados desse streamer entre si, nunca
// contra outros streamers (GET /api/l/:id/ranking, server.js).
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

// Carregado sob demanda e cacheado no 1º clique; se o import do Motion
// falhar, o botão continua abrindo o ranking, só sem o bounce.
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

socket.on("update", ({ leaderboard, lastEvent }) => {
  document.documentElement.dataset.theme = leaderboard.theme || "ametista";
  document.querySelectorAll(".theme-dot").forEach((dot) => {
    dot.classList.toggle("active", dot.dataset.theme === (leaderboard.theme || "ametista"));
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
  } else {
    hostAvatarEl.hidden = true;
    hostAvatarEl.removeAttribute("src");
  }
  // Só mostra o link com hostVerified (login real da Twitch), e usa
  // hostTwitchLogin, nunca o nome de exibição livre -- senão daria pra
  // digitar o nome de outra pessoa e ganhar link pro canal real dela.
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
    setTimeout(showRecap, 2400); // espera o "Vencedor!" (2.3s) terminar antes de abrir o recap
  }

  timerEndsAt = leaderboard.timerEndsAt;
  isPausedState = !!leaderboard.paused;
  pausedRemainingMs = leaderboard.timerRemainingMs;
  if (leaderboard.timerDurationMs) timerDurationMs = leaderboard.timerDurationMs;
  tickTimer();

  mpDisconnectedState = !!leaderboard.mpDisconnected;
  updateWebhookWarning();

  topbarTotalEl.classList.toggle("is-hidden", !!leaderboard.hideTotalRaised);
  totalHideToggleEl.classList.toggle("active", !!leaderboard.hideTotalRaised);
  totalHideToggleEl.title = leaderboard.hideTotalRaised ? "Mostrar valor arrecadado pro público" : "Ocultar valor arrecadado do público";
  if (!leaderboard.hideTotalRaised) {
    // Só mexe no DOM interno do Odometer enquanto o total está de fato visível.
    const totalValue = leaderboard.totalRaised || 0;
    if (totalOdometer) totalOdometer.update(Math.round(totalValue));
    else bumpValue(statTotalEl, String(Math.round(totalValue)));
    // lastTotalRaised !== null exclui o carregamento inicial da página.
    if (lastTotalRaised !== null && totalValue !== lastTotalRaised) flashTotalBeam();
    lastTotalRaised = totalValue;
  }

  currentItems = leaderboard.items || [];
  donorNames = leaderboard.donorNames || [];
  const flashKey = lastEvent && lastEvent.game ? lastEvent.game.key : null;
  renderLots(leaderboard.items, flashKey, lastEvent ? lastEvent.type : null, leaderboard.lastSabotagedKey, leaderboard.qualifyCount || 3);
  renderDonors(leaderboard.donors || []);
  if (lastEvent && lastEvent.type === "reset") {
    // pushHistory() sozinho não limparia isso: "reset" não bate em nenhum case de historyLabel().
    historyItems = [];
    renderHistory();
  } else {
    pushHistory(lastEvent);
  }

  if (flashKey && lastEvent && (lastEvent.type === "add" || lastEvent.type === "remove") && (lastEvent.amount || 0) > 100) {
    triggerBigWinCelebration(flashKey, lastEvent.type);
  }

  if (lastEvent && lastEvent.paymentId != null && pendingDonationPaymentId && String(lastEvent.paymentId) === pendingDonationPaymentId) {
    handleDonationConfirmed();
  }
});

// ---------- modal de doação (Pix in-app, POST /api/l/:id/doacao) ----------
// Modal público (diferente do #lot-modal, só apresentador). 3 passos num
// mesmo overlay: formulário -> QR aguardando -> confirmado. Confirmação
// chega pelo mesmo socket "update" do placar (ver checagem de
// lastEvent.paymentId acima) -- nenhum canal novo.
const donateOpenBtnEl = document.getElementById("donate-open-btn");
const donateModalEl = document.getElementById("donate-modal");
const donateModalCloseEl = document.getElementById("donate-modal-close");
const donateModalCancelEl = document.getElementById("donate-modal-cancel");
const donateStepFormEl = document.getElementById("donate-step-form");
const donateStepPixEl = document.getElementById("donate-step-pix");
const donateStepSuccessEl = document.getElementById("donate-step-success");
const donateModalActionSeg = document.getElementById("donate-modal-action");
const donateModalGameEl = document.getElementById("donate-modal-game");
const donateModalAmountEl = document.getElementById("donate-modal-amount");
const donateModalNameEl = document.getElementById("donate-modal-name");
const donateModalErrorEl = document.getElementById("donate-modal-error");
const donateModalSubmitEl = document.getElementById("donate-modal-submit");
const donateQrImgEl = document.getElementById("donate-qr-img");
const donateCopyInputEl = document.getElementById("donate-copy-input");
const donateCopyBtnEl = document.getElementById("donate-copy-btn");

let pendingDonationPaymentId = null; // String(mpPaymentId) do Pix aberto nesse navegador, ou null

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
  donateModalErrorEl.hidden = true;
  donateModalSubmitEl.disabled = false;
  donateModalSubmitEl.textContent = "Gerar Pix →";
  pendingDonationPaymentId = null;
  donateModalEl.hidden = false;
  setTimeout(() => donateModalGameEl.focus(), 40);
}

function closeDonateModal() {
  donateModalEl.hidden = true;
  pendingDonationPaymentId = null;
}

async function submitDonateModal() {
  const game = donateModalGameEl.value.trim();
  const amount = donateModalAmountEl.value;
  donateModalErrorEl.hidden = true;
  if (!game) {
    donateModalErrorEl.textContent = "Informe o nome do jogo";
    donateModalErrorEl.hidden = false;
    return donateModalGameEl.focus();
  }
  if (!amount || Number(amount) <= 0) {
    donateModalErrorEl.textContent = "Informe um valor válido";
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

donateCopyBtnEl.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(donateCopyInputEl.value);
    donateCopyBtnEl.textContent = "Copiado!";
    setTimeout(() => { donateCopyBtnEl.textContent = "Copiar"; }, 1500);
  } catch (err) {
    donateCopyInputEl.select();
  }
});

function getPassword() {
  return sessionStorage.getItem(`admin:${LEILAO_ID}`) || "";
}

async function presenterFetch(path, options = {}) {
  // FormData define seu próprio Content-Type com boundary; fixar "application/json" quebraria o upload multipart.
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`/api/l/${LEILAO_ID}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      "x-admin-password": getPassword(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function setPresenterMode(active) {
  document.body.classList.toggle("presenter-mode", active);
  presenterToggleEl.classList.toggle("active", active);
  presenterToggleEl.title = active ? "Sair do modo apresentador" : "Entrar no modo apresentador";
  presenterDrawerEl.hidden = !active;
  updateWebhookWarning();
}

// Modal próprio em vez de prompt() nativo — prompt() não mascara o texto
// digitado, e a tela do streamer é capturada ao vivo no OBS.
const presenterLoginModal = document.getElementById("presenter-login-modal");
const presenterLoginForm = document.getElementById("presenter-login-form");
const presenterLoginPassword = document.getElementById("presenter-login-password");
const presenterLoginError = document.getElementById("presenter-login-error");
const presenterLoginSubmit = document.getElementById("presenter-login-submit");
const presenterLoginCancel = document.getElementById("presenter-login-cancel");
const presenterLoginClose = document.getElementById("presenter-login-close");

// Callback pós-login pra quem chamou openPresenterLogin() (ver settings.js), sem duplicar o fluxo de login.
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      presenterLoginError.hidden = false;
      presenterLoginPassword.select();
      return;
    }
    sessionStorage.setItem(`admin:${LEILAO_ID}`, password);
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

// Pula o modal de senha pro dono verificado da Twitch (GET
// .../admin/check-session) -- getPassword() usa sessionStorage, que não
// sobrevive entre abas, então sem isso o dono redigitaria a senha toda vez.
async function isVerifiedOwner() {
  try {
    const { isOwner } = await fetch(`/api/l/${LEILAO_ID}/admin/check-session`).then((r) => r.json());
    return !!isOwner;
  } catch (err) {
    return false;
  }
}

presenterToggleEl.addEventListener("click", async () => {
  const isActive = document.body.classList.contains("presenter-mode");
  if (isActive) {
    sessionStorage.removeItem(`admin:${LEILAO_ID}`);
    setPresenterMode(false);
    return;
  }
  if (await isVerifiedOwner()) {
    setPresenterMode(true);
    return;
  }
  openPresenterLogin();
});

// Precisa ser um <form> de verdade -- sem ele, o Chrome associava o campo de
// senha ao texto mais recente digitado em qualquer lugar da página (ex: uma
// busca de jogo) e oferecia salvar isso como login.
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
  // Confirma só pra encerrar (definitivo); reabrir é seguro e não precisa.
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

// Zerar direto do board evita abrir o painel avançado no meio da live; continua destrutivo, daí a confirmação.
document.getElementById("p-reset-btn").addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "Zerar leilão",
    message: "Isso apaga TODOS os jogos e o histórico desse leilão. Título, host e senha continuam os mesmos. Tem certeza?",
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

function findGameByName(name) {
  const norm = name.trim().toLowerCase();
  return currentItems.find((i) => i.name.trim().toLowerCase() === norm) || null;
}

// Abre o modal com o texto digitado ao pé da letra, sem escolher resultado
// da RAWG -- útil quando o jogo não aparece na busca.
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
      headers: { "x-admin-password": getPassword() },
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

// ---- modal de lançar/editar lote ----

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

// game: { name, key?, total?, image? }. Com key+total = editar; sem = novo lote.
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

// Guarda contra double-submit: o botão já ignora clique quando disabled,
// mas o Enter no campo de valor é outro listener em outro elemento e não é
// bloqueado automaticamente por isso -- sem essa checagem aqui, Enter
// repetido antes da resposta voltar lançava o valor mais de uma vez.
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
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !lotModalEl.hidden) closeLotModal(); });

// Autocomplete do doador: sugere nomes de quem já doou, pra evitar variações
// do mesmo nome (ex.: "Yeojin" vs "yEOJIN") que viram apoiadores diferentes.
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

if (getPassword()) {
  setPresenterMode(true);
} else {
  isVerifiedOwner().then((owner) => { if (owner) setPresenterMode(true); });
}

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
});
