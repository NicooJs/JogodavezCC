const LEILAO_ID = location.pathname.match(/^\/l\/([a-z0-9_-]+)\/doar/i)?.[1] || null;
if (!LEILAO_ID) {
  document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;color:#ccc;background:#1c1c1f;">Link inválido.</p>';
  throw new Error("LEILAO_ID ausente na URL");
}

const socket = io({ query: { leilaoId: LEILAO_ID } });

// ponte temporária pra doação via pixgg.com (ver docs/STATUS-EFI.md) --
// busca uma vez só no load, não vem no payload do socket (mesmo motivo do
// alert-config: não colocar consulta ao Postgres no caminho quente do
// broadcastUpdate, que dispara a cada doação)
fetch(`/api/l/${LEILAO_ID}/pixgg-config`)
  .then((res) => (res.ok ? res.json() : { pixggSlug: null }))
  .then((data) => {
    pixggSlug = data.pixggSlug || null;
    submitBtn.textContent = pixggSlug ? "Continuar →" : "Gerar Pix →";
    // desligado enquanto DONATIONS_VIA_EFI_ENABLED estiver falso -- essa
    // frase é sobre custódia na Efí, nunca se aplica agora (ver docs/STATUS-EFI.md)
    document.getElementById("doar-footnote-payment").hidden = true;
    // "seu nome"/"voz de IA" não têm efeito nenhum no caminho do pixgg.com
    // (nome vem da conta do doador lá, voz é lida a partir do texto que ele
    // mesmo digita na página deles) -- esconder pra não prometer algo que
    // esse fluxo não entrega. HTML já nasce assumindo pixgg (caso comum
    // hoje); só reverte aqui se ele cair e o fluxo antigo de doação direta
    // (onde os dois campos valem de verdade) voltar a ser usado.
    if (!pixggSlug) {
      document.getElementById("doar-name-field").hidden = false;
      document.getElementById("doar-voice-field").hidden = false;
      moreToggleEl.firstChild.textContent = "+ nome e mensagem ";
    }
  })
  .catch(() => {
    pixggSlug = null; // se a checagem falhar, trata como indisponível -- nunca assume Efí por omissão
  })
  .finally(() => {
    pixggConfigLoaded = true;
    decideGateStep();
  });

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

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
}

const loadingEl = document.getElementById("doar-loading");
const closedEl = document.getElementById("doar-closed");
const unavailableEl = document.getElementById("doar-unavailable");
const stepFormEl = document.getElementById("doar-step-form");
const stepPixEl = document.getElementById("doar-step-pix");
const stepPixggEl = document.getElementById("doar-step-pixgg");
const stepSuccessEl = document.getElementById("doar-step-success");

const avatarEl = document.getElementById("doar-avatar");
const avatarFallbackEl = document.getElementById("doar-avatar-fallback");
const hostNameEl = document.getElementById("doar-host-name");
const leilaoTitleEl = document.getElementById("doar-leilao-title");
const footnoteHostEl = document.getElementById("doar-footnote-host");

const actionFieldEl = document.getElementById("doar-action-field");
const actionSeg = document.getElementById("doar-action");
const gameLabelEl = document.getElementById("doar-game-label");
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

const pixggMessageEl = document.getElementById("doar-pixgg-message");
const pixggCopyBtnEl = document.getElementById("doar-pixgg-copy-btn");
const pixggLinkEl = document.getElementById("doar-pixgg-link");
const pixggBackBtn = document.getElementById("doar-pixgg-back-btn");
const pixggConfirmHintEl = document.getElementById("doar-pixgg-confirm-hint");
const pixggBoardLinkEl = document.getElementById("doar-pixgg-board-link");
let pixggSlug = null;

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
  unavailableEl.hidden = step !== "unavailable";
  stepFormEl.hidden = step !== "form";
  stepPixEl.hidden = step !== "pix";
  stepPixggEl.hidden = step !== "pixgg";
  stepSuccessEl.hidden = step !== "success";
}

// desligado enquanto o KYC de intermediador da Efí está em análise (ver
// docs/STATUS-EFI.md) -- nunca deve cair silenciosamente na Efí. Só mostra
// o formulário quando o leilão está aberto E o streamer já conectou o
// pixgg.com; precisa aguardar os dois sinais (socket + fetch) antes de
// decidir, senão um chega antes do outro e mostra o passo errado por um instante.
let pixggConfigLoaded = false;

function decideGateStep() {
  if (!receivedFirstUpdate || !pixggConfigLoaded) return;
  if (!isOpenState) return showStep("closed");
  if (!pixggSlug) return showStep("unavailable");
  if (currentStep === "loading" || currentStep === "closed" || currentStep === "unavailable") showStep("form");
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
  submitBtn.textContent = pixggSlug ? "Continuar →" : "Gerar Pix →";
  unconfirmGame();
  closeGameShelf();
}

let leaderboardItems = [];
let activeSystemMode = "leilao";
let currentReactVideos = [];

// modo reacts não tem "ação" (sem sabotagem lá) e troca o campo de
// jogo por vídeo: mesmo input/shelf/botão + reaproveitados, só o
// conteúdo e os textos mudam. Chamado depois de applyMediaLabels, que
// reseta esses textos pro padrão jogos/filmes toda vez -- aqui só
// sobrescreve quando reacts tá ativo.
function applyReactsFormMode() {
  const isReacts = activeSystemMode === "reacts";
  actionFieldEl.hidden = isReacts;
  if (isReacts) {
    gameLabelEl.textContent = "vídeo";
    gameEl.placeholder = "link do vídeo ou apelido já aprovado";
    gameAddBtnEl.title = "Sugerir um vídeo novo (cole o link)";
    gameHintEl.textContent = "Escolha um vídeo aprovado da lista ou cole um link novo e toque em + pra sugerir.";
  }
  if (currentStep === "form") updateGameShelf();
}

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
    gameShelfEl.innerHTML = `<p class="game-shelf-empty">nenhum ${mediaLabel()} encontrado, toque em + pra adicionar mesmo assim</p>`;
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

// modo reacts: shelf mostra vídeos já aprovados (activeSystem, ver
// server.js) em vez do catálogo do leilão -- escolher um confirma o
// apelido normalizado (o que a doação por texto vai reconhecer depois),
// não o título bonito. Sem busca externa: sugerir vídeo novo é colar o
// link e tocar em +, não tem "catálogo" pra buscar como tem IGDB/TMDB.
function reactShelfCardHtml(video) {
  const thumb = video.thumbnail
    ? `<img class="game-shelf-cover" src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy" />`
    : `<div class="game-shelf-cover game-shelf-cover-placeholder">${escapeHtml((video.title[0] || "?").toUpperCase())}</div>`;
  return `
    <div class="game-shelf-card" data-nickname="${escapeHtml(video.nickname)}" data-image="${escapeHtml(video.thumbnail || "")}">
      ${thumb}
      <span class="game-shelf-name">${escapeHtml(video.title)}</span>
    </div>
  `;
}

function renderReactShelf(matches) {
  gameShelfEl.innerHTML = matches.length === 0
    ? `<p class="game-shelf-empty">nenhum vídeo aprovado ainda, cole um link novo e toque em + pra sugerir</p>`
    : matches.map(reactShelfCardHtml).join("");
  gameShelfEl.hidden = false;
  gameHintEl.hidden = gameConfirmed;
  gameShelfEl.querySelectorAll(".game-shelf-card").forEach((el) => {
    el.addEventListener("click", () => {
      confirmGame(el.dataset.nickname, el.dataset.image);
      gameShelfEl.querySelectorAll(".game-shelf-card.selected").forEach((x) => x.classList.remove("selected"));
      el.classList.add("selected");
      gameAddBtnEl.classList.remove("confirmed");
      amountEl.focus();
    });
  });
}

function updateReactsShelf(query) {
  clearTimeout(gameShelfDebounce);
  if (gameShelfAbortController) gameShelfAbortController.abort();
  if (!query && currentReactVideos.length === 0) {
    closeGameShelf();
    return;
  }
  const normalizedQuery = normalizeSearch(query);
  const matches = normalizedQuery
    ? currentReactVideos.filter((v) => normalizeSearch(v.nickname || v.title || "").includes(normalizedQuery))
    : currentReactVideos.slice(0, 20);
  renderReactShelf(matches);
}

function updateGameShelf() {
  const query = gameEl.value.trim();
  if (activeSystemMode === "reacts") {
    updateReactsShelf(query);
    return;
  }
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
  if (activeSystemMode === "reacts" && !/^https?:\/\//i.test(name)) {
    errorEl.textContent = "Cole o link completo do vídeo (começando com http:// ou https://)";
    errorEl.hidden = false;
    return gameEl.focus();
  }
  errorEl.hidden = true;
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
  (pixggSlug ? noteEl : nameEl).focus();
});

const voiceSegEl = document.getElementById("doar-voice");
let selectedVoiceId = "";
voiceSegEl.querySelectorAll("button").forEach((b) => {
  b.addEventListener("click", () => {
    selectedVoiceId = b.dataset.voice;
    voiceSegEl.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
  });
});
wireVoicePreview(document.getElementById("doar-voice-preview"));

const MIN_DONATION = 5; // R$5 -- mesmo valor em server.js (MIN_DONATION_CENTS), mantenha os dois em sincronia

async function submitDonation(e) {
  e.preventDefault();
  const game = gameEl.value.trim();
  const amount = amountEl.value;
  errorEl.hidden = true;

  if (!game || !gameConfirmed) {
    errorEl.textContent = activeSystemMode === "reacts"
      ? "Escolha um vídeo aprovado da lista ou cole um link novo"
      : `Escolha um ${mediaLabel()} da lista ou toque em + pra adicionar um novo`;
    errorEl.hidden = false;
    return gameEl.focus();
  }
  if (!amount || Number(amount) < MIN_DONATION) {
    errorEl.textContent = `Informe um valor de pelo menos R$${MIN_DONATION.toFixed(2).replace(".", ",")}`;
    errorEl.hidden = false;
    return amountEl.focus();
  }

  if (pixggSlug) {
    // reacts não tem sabotagem (ver processReactDonationMessage em
    // server.js) -- sem prefixo de ação, manda só o apelido/link puro.
    // recado (se tiver) vai depois de " | " -- server.js separa os dois de
    // volta (parseMessage em src/parser.js). Não usa "." como separador
    // porque título de filme em pt-BR tem ponto com frequência (abreviação
    // tipo "Sr.", "Dr."), o que cortava o nome no meio. "seu nome"/"voz de
    // IA" não têm campo aqui de propósito: quem manda esses de verdade é o
    // pixgg.com (nome do doador vem da conta dele lá, voz é lida a partir
    // desse mesmo texto na página deles, não algo que a gente controle).
    const note = noteEl.value.trim();
    const prefix = getAction() === "remove" ? "-" : "+";
    const message = activeSystemMode === "reacts" ? game : `${prefix}${game}${note ? ` | ${note}` : ""}`;
    pixggMessageEl.value = message;
    pixggLinkEl.href = `https://pixgg.com/${pixggSlug}`;
    pixggBoardLinkEl.href = `/l/${LEILAO_ID}`;
    pixggConfirmHintEl.hidden = true;
    pixggBoardLinkEl.hidden = true;
    showStep("pixgg");
    return;
  }

  // não deveria ser alcançável (o passo "form" só aparece com pixgg
  // conectado, ver decideGateStep) -- mantido como rede de segurança pra
  // nunca tentar gerar uma cobrança na Efí enquanto DONATIONS_VIA_EFI_ENABLED
  // estiver desligado (ver docs/STATUS-EFI.md)
  errorEl.textContent = "Doação temporariamente indisponível. Atualize a página e tente de novo.";
  errorEl.hidden = false;
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

wireCopyButton(copyBtnEl, copyInputEl);
wireCopyButton(pixggCopyBtnEl, pixggMessageEl);

// não dá pra saber quando essa doação específica foi confirmada (o pixgg.com
// não devolve o controle pra essa aba, e o webhook não carrega nenhum id que
// a gente tenha gerado antes -- ver findOpenLeilaoForStreamer em server.js).
// Em vez de fingir uma confirmação automática que nunca chega, assim que a
// pessoa sai pra confirmar lá a gente já mostra o caminho honesto: o placar
// ao vivo, que reflete a doação em segundos reais assim que o webhook chega.
pixggLinkEl.addEventListener("click", () => {
  pixggConfirmHintEl.hidden = false;
  pixggBoardLinkEl.hidden = false;
});

pixggBackBtn.addEventListener("click", () => {
  showStep("form");
});

socket.on("update", ({ leaderboard, lastEvent }) => {
  applyMediaLabels(leaderboard.mode);
  document.documentElement.dataset.theme = leaderboard.theme || "cinza";
  leaderboardItems = leaderboard.items || [];
  activeSystemMode = leaderboard.activeSystem === "reacts" ? "reacts" : "leilao";
  currentReactVideos = leaderboard.reactVideos || [];
  applyReactsFormMode();

  isOpenState = !!leaderboard.open;
  isPausedState = !!leaderboard.paused;
  // deadline no relógio do próprio cliente, não compara timestamp absoluto
  // do servidor contra Date.now() local (vazava dessincronia de horário)
  timerEndsAt = leaderboard.timerRemainingMs != null ? Date.now() + leaderboard.timerRemainingMs : null;
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
    decideGateStep();
  } else if (currentStep === "form" || currentStep === "closed" || currentStep === "unavailable") {
    // não troca de tela se a pessoa já gerou ou confirmou o Pix
    decideGateStep();
  }

  if (lastEvent && lastEvent.paymentId != null && pendingPaymentId && String(lastEvent.paymentId) === pendingPaymentId) {
    pendingPaymentId = null;
    showStep("success");
  }
});
