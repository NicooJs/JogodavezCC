const LEILAO_ID = location.pathname.match(/^\/l\/([a-z0-9_-]+)\/doar/i)?.[1] || null;
if (!LEILAO_ID) {
  document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;color:#ccc;background:#1c1c1f;">Link inválido.</p>';
  throw new Error("LEILAO_ID ausente na URL");
}

const socket = io({ query: { leilaoId: LEILAO_ID } });

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const loadingEl = document.getElementById("doar-loading");
const closedEl = document.getElementById("doar-closed");
const stepFormEl = document.getElementById("doar-step-form");
const stepPixEl = document.getElementById("doar-step-pix");
const stepSuccessEl = document.getElementById("doar-step-success");

const avatarEl = document.getElementById("doar-avatar");
const avatarFallbackEl = document.getElementById("doar-avatar-fallback");
const hostNameEl = document.getElementById("doar-host-name");
const leilaoTitleEl = document.getElementById("doar-leilao-title");
const footnoteHostEl = document.getElementById("doar-footnote-host");

const actionSeg = document.getElementById("doar-action");
const gameEl = document.getElementById("doar-game");
const gameIconEl = document.getElementById("doar-game-icon");
const gameAddBtnEl = document.getElementById("doar-game-add-btn");
const gameShelfEl = document.getElementById("doar-game-shelf");
const gameHintEl = document.getElementById("doar-game-hint");
const amountEl = document.getElementById("doar-amount");
const quickAmountsEl = document.getElementById("doar-quick-amounts");
const nameEl = document.getElementById("doar-name");
const noteEl = document.getElementById("doar-note");
const errorEl = document.getElementById("doar-error");
const submitBtn = document.getElementById("doar-submit");

const qrImgEl = document.getElementById("doar-qr-img");
const copyInputEl = document.getElementById("doar-copy-input");
const copyBtnEl = document.getElementById("doar-copy-btn");
const backBtn = document.getElementById("doar-back-btn");
const againBtn = document.getElementById("doar-again-btn");

const timerEl = document.getElementById("doar-timer");
const timerLabelEl = document.getElementById("doar-timer-label");
const timerClockEl = document.getElementById("doar-timer-clock");

let receivedFirstUpdate = false;
let currentStep = "loading";
let pendingPaymentId = null;

let isOpenState = false;
let isPausedState = false;
let timerEndsAt = null;
let pausedRemainingMs = null;

function tickDoarTimer() {
  if (!isOpenState) {
    timerEl.hidden = true;
    return;
  }
  timerEl.hidden = false;

  if (isPausedState) {
    const totalSeconds = Math.ceil((pausedRemainingMs || 0) / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    timerEl.classList.remove("urgent", "closed");
    timerLabelEl.textContent = "pausado em";
    timerClockEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return;
  }

  if (!timerEndsAt) return;
  const msLeft = timerEndsAt - Date.now();
  if (msLeft <= 0) {
    timerEl.classList.add("closed");
    timerEl.classList.remove("urgent");
    timerLabelEl.textContent = "leilão";
    timerClockEl.textContent = "ENCERRADO";
    return;
  }
  const totalSeconds = Math.ceil(msLeft / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  timerEl.classList.remove("closed");
  timerEl.classList.toggle("urgent", totalSeconds <= 90);
  timerLabelEl.textContent = "encerra em";
  timerClockEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

setInterval(tickDoarTimer, 1000);

function showStep(step) {
  currentStep = step;
  loadingEl.hidden = step !== "loading";
  closedEl.hidden = step !== "closed";
  stepFormEl.hidden = step !== "form";
  stepPixEl.hidden = step !== "pix";
  stepSuccessEl.hidden = step !== "success";
}

function getAction() {
  const active = actionSeg.querySelector("button.active");
  return active ? active.dataset.action : "add";
}

function setAction(action) {
  actionSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.action === action));
}

function resetForm() {
  setAction("add");
  gameEl.value = "";
  amountEl.value = "";
  nameEl.value = "";
  noteEl.value = "";
  errorEl.hidden = true;
  quickAmountsEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  selectedVoiceId = "";
  voiceSegEl.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.voice === ""));
  submitBtn.disabled = false;
  submitBtn.textContent = "Gerar Pix →";
  unconfirmGame();
  closeGameShelf();
}

let leaderboardItems = [];

function normalizeSearch(str) {
  return str.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

let gameShelfDebounce = null;
let gameShelfAbortController = null;
let gameConfirmed = false;

function closeGameShelf() {
  clearTimeout(gameShelfDebounce);
  if (gameShelfAbortController) gameShelfAbortController.abort();
  gameShelfEl.hidden = true;
  gameShelfEl.innerHTML = "";
  gameHintEl.hidden = true;
}

function confirmGame(name, image) {
  gameEl.value = name;
  gameConfirmed = true;
  gameHintEl.hidden = true;
  gameIconEl.innerHTML = image
    ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" />`
    : `<div class="game-input-icon-placeholder">${escapeHtml((name[0] || "?").toUpperCase())}</div>`;
  gameIconEl.hidden = false;
}

function unconfirmGame() {
  gameConfirmed = false;
  gameIconEl.hidden = true;
  gameIconEl.innerHTML = "";
  gameAddBtnEl.classList.remove("confirmed");
}

function gameShelfCardHtml(item, isNew) {
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

function pickGameShelfCard(cardEl) {
  confirmGame(cardEl.dataset.name, cardEl.dataset.image);
  gameShelfEl.querySelectorAll(".game-shelf-card.selected").forEach((el) => el.classList.remove("selected"));
  cardEl.classList.add("selected");
  gameAddBtnEl.classList.remove("confirmed");
  amountEl.focus();
}

function renderGameShelf(catalogMatches, newMatches) {
  if (catalogMatches.length === 0 && newMatches.length === 0) {
    gameShelfEl.innerHTML = '<p class="game-shelf-empty">nenhum jogo encontrado — toque em + pra adicionar mesmo assim</p>';
  } else {
    gameShelfEl.innerHTML =
      catalogMatches.map((g) => gameShelfCardHtml(g, false)).join("") +
      newMatches.map((g) => gameShelfCardHtml(g, true)).join("");
  }
  gameShelfEl.hidden = false;
  gameHintEl.hidden = gameConfirmed;
  gameShelfEl.querySelectorAll(".game-shelf-card").forEach((el) => {
    el.addEventListener("click", () => pickGameShelfCard(el));
  });
}

function updateGameShelf() {
  const query = gameEl.value.trim();
  const normalizedQuery = normalizeSearch(query);
  clearTimeout(gameShelfDebounce);
  if (gameShelfAbortController) gameShelfAbortController.abort();

  if (!query && leaderboardItems.length === 0) {
    closeGameShelf();
    return;
  }

  const catalogMatches = normalizedQuery
    ? leaderboardItems.filter((item) => normalizeSearch(item.name).includes(normalizedQuery))
    : leaderboardItems.slice(0, 20);

  renderGameShelf(catalogMatches, []);

  const hasExactMatch = catalogMatches.some((item) => normalizeSearch(item.name) === normalizedQuery);
  if (query.length < 2 || hasExactMatch) return;

  gameShelfDebounce = setTimeout(() => {
    gameShelfAbortController = new AbortController();
    fetch(`/api/l/${LEILAO_ID}/game-search?q=${encodeURIComponent(query)}`, { signal: gameShelfAbortController.signal })
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => {
        if (gameEl.value.trim() !== query) return;
        renderGameShelf(catalogMatches, data.results || []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("Erro ao buscar sugestões de jogo:", err.message);
      });
  }, 200);
}

gameEl.addEventListener("focus", updateGameShelf);
gameEl.addEventListener("input", () => {
  unconfirmGame();
  updateGameShelf();
});

gameAddBtnEl.addEventListener("click", () => {
  const name = gameEl.value.trim();
  if (!name) return gameEl.focus();
  confirmGame(name, null);
  gameShelfEl.querySelectorAll(".game-shelf-card.selected").forEach((el) => el.classList.remove("selected"));
  gameAddBtnEl.classList.add("confirmed");
  amountEl.focus();
});

actionSeg.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => setAction(b.dataset.action));
});

quickAmountsEl.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => {
    amountEl.value = b.dataset.amount;
    quickAmountsEl.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
  });
});
amountEl.addEventListener("input", () => {
  quickAmountsEl.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.amount === amountEl.value));
});

const moreToggleEl = document.getElementById("doar-more-toggle");
const moreFieldsEl = document.getElementById("doar-more-fields");
moreToggleEl.addEventListener("click", () => {
  moreFieldsEl.hidden = false;
  moreToggleEl.hidden = true;
  nameEl.focus();
});

const voiceSegEl = document.getElementById("doar-voice");
let selectedVoiceId = "";
voiceSegEl.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => {
    selectedVoiceId = b.dataset.voice;
    voiceSegEl.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
  });
});

async function submitDonation(e) {
  e.preventDefault();
  const game = gameEl.value.trim();
  const amount = amountEl.value;
  errorEl.hidden = true;

  if (!game || !gameConfirmed) {
    errorEl.textContent = "Escolha um jogo da lista ou toque em + pra adicionar um novo";
    errorEl.hidden = false;
    return gameEl.focus();
  }
  if (!amount || Number(amount) <= 0) {
    errorEl.textContent = "Informe um valor válido";
    errorEl.hidden = false;
    return amountEl.focus();
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Gerando…";
  try {
    const res = await fetch(`/api/l/${LEILAO_ID}/doacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: game,
        amount,
        action: getAction(),
        donorUsername: nameEl.value.trim(),
        donorNote: noteEl.value.trim(),
        donorVoiceId: selectedVoiceId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);

    pendingPaymentId = String(data.paymentId);
    qrImgEl.src = `data:image/png;base64,${data.qrCodeBase64}`;
    copyInputEl.value = data.copyPaste;
    showStep("pix");
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Gerar Pix →";
  }
}

stepFormEl.addEventListener("submit", submitDonation);

backBtn.addEventListener("click", () => {
  pendingPaymentId = null;
  showStep("form");
});

againBtn.addEventListener("click", () => {
  resetForm();
  showStep("form");
});

copyBtnEl.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(copyInputEl.value);
    copyBtnEl.textContent = "Copiado!";
    setTimeout(() => { copyBtnEl.textContent = "Copiar"; }, 1500);
  } catch (err) {
    copyInputEl.select();
  }
});

socket.on("update", ({ leaderboard, lastEvent }) => {
  document.documentElement.dataset.theme = leaderboard.theme || "ametista";
  leaderboardItems = leaderboard.items || [];

  isOpenState = !!leaderboard.open;
  isPausedState = !!leaderboard.paused;
  timerEndsAt = leaderboard.timerEndsAt;
  pausedRemainingMs = leaderboard.timerRemainingMs;
  tickDoarTimer();

  if (!receivedFirstUpdate) {
    receivedFirstUpdate = true;
    hostNameEl.textContent = leaderboard.host || "Streamer";
    footnoteHostEl.textContent = leaderboard.host || "o streamer";
    if (leaderboard.title) {
      leilaoTitleEl.textContent = leaderboard.title;
      leilaoTitleEl.hidden = false;
    }
    if (leaderboard.hostAvatar) {
      avatarEl.src = leaderboard.hostAvatar;
      avatarEl.hidden = false;
      avatarFallbackEl.hidden = true;
    } else {
      avatarFallbackEl.textContent = (leaderboard.host || "?").trim().charAt(0).toUpperCase();
      avatarFallbackEl.hidden = false;
    }

    resetForm();
    showStep(leaderboard.open ? "form" : "closed");
  } else if (currentStep === "form" || currentStep === "closed") {
    // não troca de tela se a pessoa já gerou ou confirmou o Pix
    showStep(leaderboard.open ? "form" : "closed");
  }

  if (lastEvent && lastEvent.paymentId != null && pendingPaymentId && String(lastEvent.paymentId) === pendingPaymentId) {
    pendingPaymentId = null;
    showStep("success");
  }
});
