// A página do board é servida em /l/<id> — o id é a única coisa que
// diferencia o leilão de um streamer do de outro, então tudo (fetch, socket)
// passa por ele.
const LEILAO_ID = location.pathname.match(/^\/l\/([a-z0-9_-]+)/i)?.[1] || null;
if (!LEILAO_ID) {
  document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;color:#ccc;background:#1c1c1f;">Link de leilão inválido. Volte pra <a href="/" style="color:#ff7a45;">criar ou achar o seu</a>.</p>';
  throw new Error("LEILAO_ID ausente na URL");
}

document.getElementById("admin-link").href = `/l/${LEILAO_ID}/admin`;
document.getElementById("webhook-warning-link").href = `/l/${LEILAO_ID}/admin`;
document.getElementById("history-link").href = `/l/${LEILAO_ID}/historico`;

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
const timerEl = document.getElementById("timer");
const timerClockEl = document.getElementById("timer-clock");
const timerLabelEl = document.getElementById("timer-label");
const statTotalEl = document.getElementById("stat-total");
const lotCountEl = document.getElementById("lot-count");
const donorCountEl = document.getElementById("donor-count");
const presenterToggleEl = document.getElementById("presenter-toggle");
const presenterDrawerEl = document.getElementById("presenter-drawer");
const timerRingFillEl = document.getElementById("timer-ring-fill");
const hostEditBtn = document.getElementById("host-edit-btn");
const hostInputEl = document.getElementById("p-host-input");
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
const recapDonorListEl = document.getElementById("recap-donor-list");
const recapDonorsLabelEl = document.getElementById("recap-donors-label");
const recapCloseEl = document.getElementById("recap-close");
const recapEyebrowEl = document.getElementById("recap-eyebrow");
const webhookWarningEl = document.getElementById("webhook-warning");
const webhookWarningTextEl = document.getElementById("webhook-warning-text");

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
let timerDurationMs = 5 * 60 * 1000; // atualizado a cada "update" com o valor real do server
let isOpenState = null; // null = ainda não recebemos a primeira atualização
let isPausedState = false;
let pausedRemainingMs = null;
let webhookStaleState = false;
let webhookSignatureIssueState = false;
let historyItems = [];
let currentLeaderKey = null;
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

function bumpValue(el, text) {
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove("tick");
  void el.offsetWidth;
  el.classList.add("tick");
}

function setStatus(online) {
  statusEl.classList.toggle("online", online);
  statusTextEl.textContent = online ? "ao vivo" : "reconectando…";
}

// Só mostra o aviso no modo apresentador — não faz sentido (e pode
// confundir espectador) aparecer isso no board público. webhookStale só é
// true com o leilão aberto e depois de 30min de silêncio real (ver
// isWebhookStale em server.js) — threshold folgado de propósito, um de
// 5min já causou alarme falso em uso normal.
function updateWebhookWarning() {
  const active = document.body.classList.contains("presenter-mode");
  if (webhookSignatureIssueState) {
    webhookWarningTextEl.textContent = "O pix.gg está mandando doações, mas a assinatura da URL não bate — provavelmente a URL do webhook está incompleta ou cortada. As doações não estão sendo contabilizadas.";
  } else {
    webhookWarningTextEl.textContent = "Sem contato do pix.gg há mais de 30 minutos com o leilão aberto — o webhook pode estar desvinculado e as doações podem não estar chegando.";
  }
  webhookWarningEl.hidden = !(active && (webhookStaleState || webhookSignatureIssueState));
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
    ? `<img class="${className}" src="${item.image}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${className} ${className}-placeholder',textContent:'${escapeHtml((item.name[0] || "?").toUpperCase())}'}))" />`
    : `<div class="${className} ${className}-placeholder">${escapeHtml((item.name[0] || "?").toUpperCase())}</div>`;
}

// Medalha (coroa/prata/bronze) pros 3 primeiros do leilão — mesmo desenho
// pros três, só a cor muda (herda a cor já definida por .lot-card.rank-N).
// O losango no centro ecoa a marca do site (o losango ao lado do título).
const MEDAL_ICON_SVG = `<svg class="medal-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M7.5 11L4.5 17.5L7.3 16.6L9 19L10.8 14.8" fill="currentColor" opacity="0.85"/>
  <path d="M12.5 11L15.5 17.5L12.7 16.6L11 19L9.2 14.8" fill="currentColor" opacity="0.85"/>
  <circle cx="10" cy="7.5" r="5.5" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.4"/>
  <rect x="8.6" y="6.1" width="2.8" height="2.8" fill="currentColor" transform="rotate(45 10 7.5)"/>
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
      </div>
      <div class="lot-meta">
        <span class="lot-total${changed ? " tick" : ""}">${formatBRL(item.total)}</span>
        ${hitBadge}
        <div class="lot-edit">
          <button data-key="${item.key}">editar</button>
        </div>
      </div>
    </div>
  `;
}

// Lance de peso (mais de R$100 num único apoio/sabotagem): efeito mais
// chamativo que o flash normal — confete pra apoio, faíscas vermelhas pra
// sabotagem. Fica contido dentro do próprio card (que já corta overflow),
// pra não vazar em cima dos vizinhos no grid.
function triggerBigWinCelebration(key, type) {
  const card = lotListEl.querySelector(`.lot-card[data-key="${CSS.escape(key)}"]`);
  if (!card) return;
  const isAdd = type === "add";
  const colors = isAdd
    ? ["var(--accent)", "var(--accent-text)", "var(--positive)", "var(--silver)"]
    : ["var(--danger)", "#ff8fa8", "var(--muted)"];
  const burst = document.createElement("div");
  burst.className = "confetti-burst";
  const count = isAdd ? 22 : 14;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece" + (isAdd ? "" : " confetti-piece-spark");
    const angle = Math.random() * 360;
    const dist = 30 + Math.random() * 50;
    piece.style.setProperty("--dx", `${Math.cos((angle * Math.PI) / 180) * dist}px`);
    piece.style.setProperty("--dy", `${Math.sin((angle * Math.PI) / 180) * dist}px`);
    piece.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    piece.style.left = `${15 + Math.random() * 70}%`;
    piece.style.top = `${20 + Math.random() * 40}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.12}s`;
    burst.appendChild(piece);
  }
  card.appendChild(burst);
  setTimeout(() => burst.remove(), 1300);
}

// Placar que se mexe ao vivo: em vez de recriar tudo a cada atualização,
// reaproveita os cards existentes (por data-key) e só reordena via
// appendChild — assim dá pra medir a posição antes/depois (técnica FLIP) e
// os lotes deslizam suavemente pra nova posição no ranking.
function renderLots(items, flashKey, flashType) {
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
    const hitBadge = item.key === flashKey && flashType === "remove"
      ? '<span class="badge-hit">sabotado agora</span>'
      : "";
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

    // Linha de corte entre os classificados (top 3) e o resto do catálogo.
    if (item.rank === 3 && items.length > 3) {
      let divider = lotListEl.querySelector(".qualify-divider");
      if (!divider) {
        divider = document.createElement("div");
        divider.className = "qualify-divider";
        divider.innerHTML = "<span>classificados até aqui</span>";
      }
      lotListEl.appendChild(divider);
    }
  });
  if (items.length <= 3) {
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

  // FLIP: inverte pro deslocamento anterior e anima de volta a zero.
  requestAnimationFrame(() => {
    lotListEl.querySelectorAll(".lot-card").forEach((el) => {
      const first = firstRects.get(el.dataset.key);
      if (!first) return;
      const last = el.getBoundingClientRect();
      const deltaY = first.top - last.top;
      if (Math.abs(deltaY) < 1) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${deltaY}px)`;
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
        const badge = flashedCard.querySelector(".badge-hit");
        if (badge) badge.remove();
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
    return `
    <div class="donor-row rank-${d.rank}" style="--pct:${pct}%">
      <div class="donor-row-fill"></div>
      <span class="donor-rank">${rankBadgeHtml(d.rank)}</span>
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

function renderHistory() {
  historyEmptyEl.style.display = historyItems.length === 0 ? "flex" : "none";
  const rows = historyItems.slice(0, 50).map((event) => {
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

// Reta final: quando o leilão fecha (sozinho ou pelo apresentador), bate o
// martelo — um "Vendido!" estampado por cima de tudo, uma vez só.
let soldTimeout = null;
function triggerSoldMoment(leaderName) {
  clearTimeout(soldTimeout);
  soldMarkEl.textContent = leaderName ? `Vendido — ${leaderName}!` : "Vendido!";
  soldOverlayEl.hidden = false;
  soldOverlayEl.style.animation = "none";
  soldMarkEl.style.animation = "none";
  void soldOverlayEl.offsetWidth; // força reflow pra reiniciar a animação
  soldOverlayEl.style.animation = "";
  soldMarkEl.style.animation = "";
  soldTimeout = setTimeout(() => { soldOverlayEl.hidden = true; }, 2300);
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

// Pódio do recap — mesma linguagem de medalha do catálogo (rankBadgeHtml),
// só que num cartão vertical em vez da linha horizontal do lot-card.
function recapPodiumCardHtml(game) {
  const thumb = game.image
    ? `<img class="recap-podium-thumb" src="${escapeHtml(game.image)}" alt="" />`
    : `<div class="recap-podium-thumb recap-podium-thumb-placeholder">${escapeHtml((game.name[0] || "?").toUpperCase())}</div>`;
  return `
    <div class="recap-podium-card rank-${game.rank}">
      <span class="recap-podium-rank">${rankBadgeHtml(game.rank)}</span>
      ${thumb}
      <p class="recap-podium-name">${escapeHtml(game.name)}</p>
      <p class="recap-podium-total">${formatBRL(game.total)}</p>
      <p class="recap-podium-donors">${game.donorCount} ${game.donorCount === 1 ? "apoiador" : "apoiadores"}</p>
    </div>
  `;
}

// Renderiza tanto o recap ao vivo (leilão acabou de encerrar) quanto um
// arquivado (histórico, ver showHistoricalRecap) — mesma forma de dado nos
// dois casos (buildRecap no server.js), só muda a legenda de topo.
function renderRecap(recap, eyebrowText) {
  recapEyebrowEl.textContent = eyebrowText;
  recapTitleEl.textContent = recap.title || "Leilão de Jogos";
  recapTotalEl.textContent = formatBRL(recap.totalRaised || 0);
  recapDurationEl.textContent = formatDuration(recap.durationMs);
  recapDonorsEl.textContent = String(recap.totalDonors || 0);
  recapGamesEl.textContent = String(recap.totalGames || 0);

  recapPodiumEl.innerHTML = (recap.topGames || []).map(recapPodiumCardHtml).join("");

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

// Reabre o recap de um round já zerado (link "Ver recap" no painel
// avançado, /l/:id?recap=<index> — index é a posição na lista devolvida por
// /recap/history, mais recente primeiro).
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

socket.on("update", ({ leaderboard, lastEvent }) => {
  titleEl.textContent = leaderboard.title;
  hostNameEl.textContent = leaderboard.host || "Streamer";
  if (leaderboard.hostAvatar) {
    hostAvatarEl.src = leaderboard.hostAvatar;
    hostAvatarEl.hidden = false;
  } else {
    hostAvatarEl.hidden = true;
    hostAvatarEl.removeAttribute("src");
  }
  if (leaderboard.host) {
    hostTwitchBadgeEl.href = `https://twitch.tv/${encodeURIComponent(leaderboard.host.trim())}`;
    hostTwitchBadgeEl.hidden = false;
  } else {
    hostTwitchBadgeEl.hidden = true;
  }

  const wasOpen = isOpenState;
  isOpenState = leaderboard.open;
  if (wasOpen === true && isOpenState === false) {
    const leader = (leaderboard.items || [])[0];
    triggerSoldMoment(leader ? leader.name : null);
    // Espera o "Vendido!" terminar (2.3s) pra não brigar visualmente com o
    // recap — a janela vem logo em seguida, não por cima.
    setTimeout(showRecap, 2400);
  }

  timerEndsAt = leaderboard.timerEndsAt;
  isPausedState = !!leaderboard.paused;
  pausedRemainingMs = leaderboard.timerRemainingMs;
  if (leaderboard.timerDurationMs) timerDurationMs = leaderboard.timerDurationMs;
  tickTimer();

  webhookStaleState = !!leaderboard.webhookStale;
  webhookSignatureIssueState = !!leaderboard.webhookSignatureIssue;
  updateWebhookWarning();

  const totalValue = leaderboard.totalRaised || 0;
  if (totalOdometer) totalOdometer.update(Math.round(totalValue));
  else bumpValue(statTotalEl, String(Math.round(totalValue)));

  currentItems = leaderboard.items || [];
  donorNames = leaderboard.donorNames || [];
  const flashKey = lastEvent && lastEvent.game ? lastEvent.game.key : null;
  renderLots(leaderboard.items, flashKey, lastEvent ? lastEvent.type : null);
  renderDonors(leaderboard.donors || []);
  pushHistory(lastEvent);

  if (flashKey && lastEvent && (lastEvent.type === "add" || lastEvent.type === "remove") && (lastEvent.amount || 0) > 100) {
    triggerBigWinCelebration(flashKey, lastEvent.type);
  }
});

function getPassword() {
  return sessionStorage.getItem(`admin:${LEILAO_ID}`) || "";
}

async function presenterFetch(path, options = {}) {
  const res = await fetch(`/api/l/${LEILAO_ID}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
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
  if (!active) document.body.classList.remove("host-editing");
  presenterToggleEl.classList.toggle("active", active);
  presenterToggleEl.title = active ? "Sair do modo apresentador" : "Entrar no modo apresentador";
  presenterDrawerEl.hidden = !active;
  updateWebhookWarning();
}

presenterToggleEl.addEventListener("click", async () => {
  const isActive = document.body.classList.contains("presenter-mode");
  if (isActive) {
    sessionStorage.removeItem(`admin:${LEILAO_ID}`);
    setPresenterMode(false);
    return;
  }
  const password = prompt("Senha do apresentador:");
  if (!password) return;
  const res = await fetch(`/api/l/${LEILAO_ID}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    alert("Senha incorreta");
    return;
  }
  sessionStorage.setItem(`admin:${LEILAO_ID}`, password);
  setPresenterMode(true);
});

hostEditBtn.addEventListener("click", () => {
  document.body.classList.add("host-editing");
  const current = hostNameEl.textContent.trim();
  hostInputEl.value = current === "Streamer" ? "" : current;
  hostInputEl.focus();
  hostInputEl.select();
});

const hostSaveBtn = document.getElementById("p-host-save");
hostSaveBtn.addEventListener("click", async () => {
  const host = hostInputEl.value.trim();
  try {
    await presenterFetch("/admin/host", { method: "POST", body: JSON.stringify({ host }) });
    document.body.classList.remove("host-editing");
  } catch (err) {
    alert(err.message);
  }
});

hostInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") hostSaveBtn.click();
  if (e.key === "Escape") document.body.classList.remove("host-editing");
});

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
  // Encerrar é definitivo (só reabre manual) — confirma antes pra evitar
  // clique acidental. Reabrir é seguro, não precisa confirmar.
  if (isOpenState && !confirm("Encerrar o leilão agora? Ele só reabre quando você reabrir manualmente.")) return;
  try {
    await presenterFetch("/admin/toggle-open", {
      method: "POST",
      body: JSON.stringify({ open: !isOpenState }),
    });
  } catch (err) {
    alert(err.message);
  }
});

// Zerar direto do board evita ter que abrir o painel avançado no meio da
// live (ver CLAUDE.md: controle do dia a dia é modo apresentador, não
// admin.html) — mas continua destrutivo, por isso o confirm() explícito.
document.getElementById("p-reset-btn").addEventListener("click", async () => {
  if (!confirm("Isso apaga TODOS os jogos e o histórico desse leilão. Título, host e senha continuam os mesmos. Tem certeza?")) return;
  try {
    await presenterFetch("/admin/reset", { method: "POST" });
  } catch (err) {
    alert(err.message);
  }
});

// Procura um jogo já no catálogo pelo nome (pra o modal mostrar o total atual).
function findGameByName(name) {
  const norm = name.trim().toLowerCase();
  return currentItems.find((i) => i.name.trim().toLowerCase() === norm) || null;
}

// Não lança direto — abre o modal (mesmo que clicar numa sugestão da busca),
// só que com o texto digitado ao pé da letra, sem escolher um resultado da
// RAWG (útil quando o jogo não aparece na busca).
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
  hideDonorSuggestions();
  lotModalEl.hidden = false;
  setTimeout(() => lotModalAmount.focus(), 40);
}

function closeLotModal() {
  lotModalEl.hidden = true;
  hideDonorSuggestions();
  modalGame = null;
}

async function submitLotModal() {
  if (!modalGame) return;
  const amount = lotModalAmount.value;
  if (!amount || Number(amount) <= 0) return lotModalAmount.focus();
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

if (getPassword()) setPresenterMode(true);

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
