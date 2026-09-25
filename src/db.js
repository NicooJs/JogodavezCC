const fs = require("fs");
const crypto = require("crypto");
const { normalizeKey } = require("./parser");

function emptyData() {
  return {
    games: {},
    events: [],
    processedMessages: {},
    state: {},
    pastAuctions: [],
    nextEventId: 1,
    // modo reacts -- sistema separado do leilão, mas guardado no mesmo
    // arquivo (dados próprios, não mistura com games/events). Vídeo tem
    // status pending -> active -> unlocked -> reacted (ou rejected).
    reactVideos: {},
    reactEvents: [],
    nextReactEventId: 1,
  };
}

const MAX_PAST_AUCTIONS = 50;

function nowISO() {
  return new Date().toISOString();
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function createStore(filePath) {
  function loadData() {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      return { ...emptyData(), ...JSON.parse(raw) };
    } catch (err) {
      return emptyData();
    }
  }

  let data = loadData();

  function save() {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  function getState(key, fallback = null) {
    return Object.prototype.hasOwnProperty.call(data.state, key) ? data.state[key] : fallback;
  }

  // null/undefined apaga a chave em vez de virar a string "null"
  function setState(key, value) {
    if (value === null || value === undefined) {
      delete data.state[key];
    } else {
      data.state[key] = String(value);
    }
    save();
  }

  function isAlreadyProcessed(providerId) {
    if (!providerId) return false;
    return !!data.processedMessages[providerId];
  }

  function markProcessed(providerId) {
    if (!providerId) return;
    data.processedMessages[providerId] = true;
  }

  function applyContribution({ key, name, action, amountCents, username, rawMessage, providerId }) {
    const signedAmount = action === "remove" ? -Math.abs(amountCents) : Math.abs(amountCents);

    if (!data.games[key]) {
      data.games[key] = { key, name, total_cents: 0, updated_at: nowISO() };
    }
    data.games[key].total_cents += signedAmount;
    data.games[key].updated_at = nowISO();

    data.events.push({
      id: data.nextEventId++,
      game_key: key,
      game_name: name,
      action,
      amount_cents: amountCents,
      username: username || null,
      raw_message: rawMessage || null,
      provider_id: providerId || null,
      created_at: nowISO(),
    });

    markProcessed(providerId);
    save();

    return { ...data.games[key] };
  }

  function logUnparsedEvent({ amountCents, username, rawMessage, providerId }) {
    data.events.push({
      id: data.nextEventId++,
      game_key: null,
      game_name: null,
      action: "ignored",
      amount_cents: amountCents,
      username: username || null,
      raw_message: rawMessage || null,
      provider_id: providerId || null,
      created_at: nowISO(),
    });
    markProcessed(providerId);
    save();
  }

  // doação real (conta em getTotalRaised, diferente de logUnparsedEvent)
  // que não deu pra ligar a nenhum jogo do catálogo -- fica pendente até o
  // apresentador atribuir a um jogo ou marcar como apoio geral, em vez de
  // virar um card "Não identificado" no catálogo (misturava doação real
  // sem jogo reconhecido com doação que nunca teve jogo nenhum em mente).
  function logPendingDonation({ amountCents, username, rawMessage, providerId }) {
    const event = {
      id: data.nextEventId++,
      game_key: null,
      game_name: null,
      action: "add",
      amount_cents: amountCents,
      username: username || null,
      raw_message: rawMessage || null,
      provider_id: providerId || null,
      created_at: nowISO(),
      pending: true,
    };
    data.events.push(event);
    markProcessed(providerId);
    save();
    return { ...event };
  }

  function getPendingDonations() {
    return data.events.filter((ev) => ev.pending).map((ev) => ({ ...ev }));
  }

  function resolvePendingDonationAssign(eventId, targetKey) {
    const ev = data.events.find((e) => e.id === eventId && e.pending);
    const game = data.games[targetKey];
    if (!ev || !game) return null;
    game.total_cents += ev.amount_cents;
    game.updated_at = nowISO();
    ev.game_key = targetKey;
    ev.game_name = game.name;
    ev.pending = false;
    save();
    return { ...game };
  }

  function resolvePendingDonationDismiss(eventId) {
    const ev = data.events.find((e) => e.id === eventId && e.pending);
    if (!ev) return false;
    ev.pending = false;
    ev.dismissed = true;
    save();
    return true;
  }

  function hasGame(key) {
    return !!data.games[key];
  }

  function getGame(key) {
    return data.games[key] ? { ...data.games[key] } : null;
  }

  function resolveExistingKey(candidateKey) {
    const existingKeys = Object.keys(data.games);
    if (existingKeys.length === 0) return null;

    const substringMatches = existingKeys.filter((k) => {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
      return re.test(candidateKey);
    });
    if (substringMatches.length > 0) {
      return substringMatches.sort((a, b) => b.length - a.length)[0];
    }

    let best = null;
    let bestDist = Infinity;
    for (const k of existingKeys) {
      const dist = levenshtein(candidateKey, k);
      const threshold = Math.max(1, Math.floor(Math.min(candidateKey.length, k.length) * 0.25));
      if (dist <= threshold && dist < bestDist) {
        best = k;
        bestDist = dist;
      }
    }
    return best;
  }

  function hasGameImage(key) {
    return !!(data.games[key] && data.games[key].image_url);
  }

  function setGameImage(key, imageUrl) {
    if (!data.games[key]) return null;
    data.games[key].image_url = imageUrl || null;
    save();
    return { ...data.games[key] };
  }

  // modo corrida: meta manual em centavos definida pelo apresentador
  // (botão direito no card) -- bater a meta garante uma vaga extra de
  // classificado (ver serializeLeaderboard em server.js), independente do
  // ranking por dinheiro.
  function setRaceGoal(key, amountCents) {
    if (!data.games[key]) return null;
    data.games[key].raceGoalCents = amountCents;
    save();
    return { ...data.games[key] };
  }

  function clearRaceGoal(key) {
    if (!data.games[key]) return null;
    delete data.games[key].raceGoalCents;
    // sem meta nenhuma, não faz sentido continuar com a posição travada de
    // uma meta que não existe mais, nem com o instante em que bateu ela
    delete data.games[key].race_locked_rank;
    delete data.games[key].race_goal_reached_at;
    save();
    return { ...data.games[key] };
  }

  // posição travada pra sempre no rank em que o lote bateu a meta de
  // corrida (pedido explícito do cliente: não é só uma vaga extra de
  // classificado, o NÚMERO do rank também não pode mais mudar -- e a
  // trava em si também é permanente, sabotagem derrubando o total depois
  // não tira mais, ver computeRaceRanks em server.js).
  function setRaceLockedRank(key, rank) {
    if (!data.games[key]) return null;
    data.games[key].race_locked_rank = rank;
    save();
    return { ...data.games[key] };
  }

  function clearRaceLockedRank(key) {
    if (!data.games[key]) return null;
    delete data.games[key].race_locked_rank;
    save();
    return { ...data.games[key] };
  }

  // instante (epoch ms) em que o lote bateu a meta de corrida PELA
  // PRIMEIRA vez -- idempotente de propósito, só grava uma vez e nunca
  // sobrescreve depois. Existe pra decidir quem fica com uma vaga limitada
  // (raceGlobalMaxWinners) quando vários lotes cruzam a meta quase juntos:
  // sem isso, computeRaceRanks só teria a ordem por dinheiro atual pra
  // desempatar, que não é a mesma coisa que "quem chegou primeiro" (pedido
  // explícito do cliente).
  function markRaceGoalReached(key, timestamp) {
    if (!data.games[key] || data.games[key].race_goal_reached_at != null) return null;
    data.games[key].race_goal_reached_at = timestamp;
    save();
    return { ...data.games[key] };
  }

  function getLeaderboard() {
    return Object.values(data.games).sort((a, b) => {
      if (b.total_cents !== a.total_cents) return b.total_cents - a.total_cents;
      return new Date(a.updated_at) - new Date(b.updated_at);
    });
  }

  function getRecentEvents(limit = 25) {
    return data.events.slice(-limit).reverse();
  }

  function getBiggestDonation() {
    let best = null;
    for (const ev of data.events) {
      if (ev.action !== "add" || !ev.username) continue;
      if (!best || ev.amount_cents > best.amount_cents) best = ev;
    }
    if (!best) return null;
    return { username: best.username, amount_cents: best.amount_cents, game_name: best.game_name };
  }

  function getTopDonors(limit = 8) {
    const totals = {};
    for (const ev of data.events) {
      if (!ev.username) continue;
      if (ev.action !== "add" && ev.action !== "remove") continue;
      totals[ev.username] = (totals[ev.username] || 0) + ev.amount_cents;
    }
    return Object.entries(totals)
      .map(([username, total_cents]) => ({ username, total_cents }))
      .sort((a, b) => b.total_cents - a.total_cents)
      .slice(0, limit);
  }

  // pódio próprio do modo reacts -- mesmo formato/critério do getTopDonors
  // do leilão, mas somando reactEvents (contribuição pra vídeo) em vez de
  // events (lote do leilão). Os dois sistemas não compartilham doador
  // ranqueado de propósito: leilão não roda enquanto reacts tá ativo, então
  // misturar os dois no mesmo pódio mostraria gente que não tem nada a ver
  // com o que tá na tela.
  function getTopReactDonors(limit = 8) {
    const totals = {};
    for (const ev of data.reactEvents) {
      if (!ev.username) continue;
      totals[ev.username] = (totals[ev.username] || 0) + ev.amount_cents;
    }
    return Object.entries(totals)
      .map(([username, total_cents]) => ({ username, total_cents }))
      .sort((a, b) => b.total_cents - a.total_cents)
      .slice(0, limit);
  }

  function getDonorNames() {
    const seen = new Set();
    const names = [];
    for (let i = data.events.length - 1; i >= 0; i--) {
      const name = data.events[i].username;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    return names;
  }

  function getTotalRaised() {
    return data.events
      .filter((ev) => ev.action === "add" || ev.action === "remove")
      .reduce((sum, ev) => sum + ev.amount_cents, 0);
  }

  function getFundingBreakdown() {
    const map = {};
    for (const ev of data.events) {
      if (!ev.game_key) continue;
      if (ev.action !== "add" && ev.action !== "remove") continue;
      if (!map[ev.game_key]) map[ev.game_key] = { added_cents: 0, removed_cents: 0 };
      if (ev.action === "add") map[ev.game_key].added_cents += ev.amount_cents;
      else map[ev.game_key].removed_cents += ev.amount_cents;
    }
    return map;
  }

  function getTopDonorByGame() {
    const perGame = {};
    for (const ev of data.events) {
      if (!ev.game_key || !ev.username) continue;
      if (ev.action !== "add") continue;
      if (!perGame[ev.game_key]) perGame[ev.game_key] = {};
      perGame[ev.game_key][ev.username] = (perGame[ev.game_key][ev.username] || 0) + ev.amount_cents;
    }
    const result = {};
    for (const key of Object.keys(perGame)) {
      const top = Object.entries(perGame[key]).sort((a, b) => b[1] - a[1])[0];
      result[key] = { username: top[0], total_cents: top[1] };
    }
    return result;
  }

  function getDonorCountByGame() {
    const seenByGame = {};
    for (const ev of data.events) {
      if (!ev.game_key || !ev.username) continue;
      if (ev.action !== "add" && ev.action !== "remove") continue;
      if (!seenByGame[ev.game_key]) seenByGame[ev.game_key] = new Set();
      seenByGame[ev.game_key].add(ev.username);
    }
    const counts = {};
    for (const key of Object.keys(seenByGame)) counts[key] = seenByGame[key].size;
    return counts;
  }

  function getTotalDonorCount() {
    const seen = new Set();
    for (const ev of data.events) {
      if (!ev.username) continue;
      if (ev.action !== "add" && ev.action !== "remove") continue;
      seen.add(ev.username);
    }
    return seen.size;
  }

  function adjustGame(key, deltaCents) {
    if (!data.games[key]) return null;
    data.games[key].total_cents += deltaCents;
    data.games[key].updated_at = nowISO();
    save();
    return { ...data.games[key] };
  }

  function setGameTotal(key, totalCents) {
    if (!data.games[key]) return null;
    data.games[key].total_cents = totalCents;
    data.games[key].updated_at = nowISO();
    save();
    return { ...data.games[key] };
  }

  // a chave interna (derivada do nome original) é o que toda doação nova
  // casa por baixo dos panos -- se o rename só trocasse o texto exibido e
  // deixasse a chave velha intacta, uma doação futura mencionando o nome
  // ANTIGO continuaria caindo nesse mesmo jogo (agora com nome novo) pra
  // sempre, em vez de virar (ou achar) um jogo separado. Por isso o rename
  // migra a chave junto, levando o histórico de eventos (senão "quem mais
  // apoiou"/breakdown desse jogo zerava do nada).
  function renameGame(key, newName) {
    if (!data.games[key]) return null;
    const newKey = normalizeKey(newName);
    if (!newKey || newKey === key) {
      data.games[key].name = newName;
      save();
      return { ...data.games[key] };
    }
    if (data.games[newKey]) {
      // já existe outro jogo com esse nome/chave -- em vez de duplicar,
      // mescla o renomeado pra dentro do jogo que já existe (mesma lógica
      // do botão manual de mesclar duplicados)
      return mergeGames(key, newKey, false);
    }
    data.games[newKey] = { ...data.games[key], key: newKey, name: newName };
    delete data.games[key];
    data.events.forEach((ev) => {
      if (ev.game_key === key) ev.game_key = newKey;
    });
    save();
    return { ...data.games[newKey] };
  }

  function deleteGame(key) {
    delete data.games[key];
    save();
  }

  // doador não tem registro próprio (diferente de jogo) -- total/rank em
  // getTopDonors são sempre calculados na hora, agrupando por data.events[].
  // "mesclar" aqui é só reescrever o username em todos os eventos que têm o
  // nome errado pro nome certo, então a próxima leitura já soma junto.
  function renameDonor(fromUsername, toUsername) {
    if (!fromUsername || !toUsername || fromUsername === toUsername) return null;
    let touched = false;
    data.events.forEach((ev) => {
      if (ev.username === fromUsername) {
        ev.username = toUsername;
        touched = true;
      }
    });
    if (!touched) return null;
    save();
    return { username: toUsername };
  }

  function mergeGames(fromKey, toKey, useNameFrom = false) {
    const from = data.games[fromKey];
    const to = data.games[toKey];
    if (!from || !to) return null;

    to.total_cents += from.total_cents;
    if (useNameFrom) to.name = from.name;
    to.updated_at = nowISO();

    data.events.forEach((ev) => {
      if (ev.game_key === fromKey) ev.game_key = toKey;
    });

    delete data.games[fromKey];
    save();
    return { ...to };
  }

  function addManualGame(name, key, totalCents = 0) {
    if (!data.games[key]) {
      data.games[key] = { key, name, total_cents: totalCents, updated_at: nowISO() };
      save();
    }
    return { ...data.games[key] };
  }

  function generateReactId() {
    let id;
    do {
      id = crypto.randomBytes(5).toString("hex");
    } while (data.reactVideos[id]);
    return id;
  }

  // sugestão de um viewer -- fica "pending" até o apresentador aprovar
  // (ver approveReactVideo). Se veio com doação junto, o valor fica
  // guardado em pendingAmountCents e só soma no vídeo quando aprovado --
  // aprovar tarde não deve fazer o doador perder o que já mandou.
  function submitReactVideo({ url, platform, title, thumbnail, durationSeconds, submittedBy, amountCents, providerId }) {
    const id = generateReactId();
    const now = nowISO();
    data.reactVideos[id] = {
      id,
      url,
      platform: platform || "other",
      title: title || url,
      nickname: null,
      thumbnail: thumbnail || null,
      durationSeconds: durationSeconds || null,
      goalCents: null,
      totalCents: 0,
      status: "pending",
      submittedBy: submittedBy || null,
      pendingAmountCents: Math.max(0, Math.round(amountCents || 0)),
      createdAt: now,
      updatedAt: now,
    };
    markProcessed(providerId);
    save();
    return { ...data.reactVideos[id] };
  }

  function getPendingReactVideos() {
    return Object.values(data.reactVideos)
      .filter((v) => v.status === "pending")
      .map((v) => ({ ...v }));
  }

  // apelido curto é o que a doação por texto livre (pixgg.com) vai casar
  // depois -- normalizado igual chave de jogo, mesmo motor de reconhecimento
  // (ver findExistingGameInText, chamado a partir do server.js).
  function approveReactVideo(id, { nickname, multiplierCents, durationSeconds }) {
    const video = data.reactVideos[id];
    if (!video || video.status !== "pending") return null;
    if (durationSeconds != null) video.durationSeconds = durationSeconds;
    const minutes = (video.durationSeconds || 0) / 60;
    video.goalCents = Math.round(minutes * (multiplierCents || 0));
    video.nickname = normalizeKey(nickname || video.title);
    video.status = "active";
    video.updatedAt = nowISO();
    const startingAmount = video.pendingAmountCents || 0;
    delete video.pendingAmountCents;
    save();
    if (startingAmount > 0) {
      return applyReactContribution({ id, amountCents: startingAmount, username: video.submittedBy, rawMessage: video.title, providerId: null });
    }
    return { ...video };
  }

  function rejectReactVideo(id) {
    const video = data.reactVideos[id];
    if (!video) return false;
    video.status = "rejected";
    video.updatedAt = nowISO();
    save();
    return true;
  }

  function applyReactContribution({ id, amountCents, username, rawMessage, providerId }) {
    const video = data.reactVideos[id];
    if (!video) return null;
    video.totalCents += amountCents;
    video.updatedAt = nowISO();
    if (video.status === "active" && video.goalCents != null && video.totalCents >= video.goalCents) {
      video.status = "unlocked";
    }
    data.reactEvents.push({
      id: data.nextReactEventId++,
      video_id: id,
      video_title: video.title,
      amount_cents: amountCents,
      username: username || null,
      raw_message: rawMessage || null,
      provider_id: providerId || null,
      created_at: nowISO(),
    });
    markProcessed(providerId);
    save();
    return { ...video };
  }

  function markReactVideoReacted(id) {
    const video = data.reactVideos[id];
    if (!video || video.status !== "unlocked") return null;
    video.status = "reacted";
    video.updatedAt = nowISO();
    save();
    return { ...video };
  }

  // ativos = os que já podem receber doação (o público vê isso no board);
  // "pending" fica de fora até o apresentador aprovar.
  function getReactVideos() {
    return Object.values(data.reactVideos)
      .filter((v) => v.status === "active" || v.status === "unlocked")
      .map((v) => ({ ...v }));
  }

  function getReactedVideos() {
    return Object.values(data.reactVideos)
      .filter((v) => v.status === "reacted")
      .map((v) => ({ ...v }));
  }

  function resetAll() {
    const preservedState = { ...data.state };
    delete preservedState.lastSabotagedKey;
    const preservedPastAuctions = data.pastAuctions || [];
    // "zerar leilão" reseta só o leilão -- reacts é um sistema à parte,
    // zerar um não deveria apagar o outro sem querer.
    const preservedReactVideos = data.reactVideos || {};
    const preservedReactEvents = data.reactEvents || [];
    const preservedNextReactEventId = data.nextReactEventId || 1;
    data = emptyData();
    data.state = preservedState;
    data.pastAuctions = preservedPastAuctions;
    data.reactVideos = preservedReactVideos;
    data.reactEvents = preservedReactEvents;
    data.nextReactEventId = preservedNextReactEventId;
    save();
  }

  // se o topo da lista ainda for um round aberto, substitui em vez de
  // empilhar — evita contar o mesmo dinheiro 2x no histórico
  function archiveAuction(recap, options = {}) {
    const openRound = !!options.openRound;
    const top = data.pastAuctions[0];
    if (top && top.openRound) {
      data.pastAuctions[0] = { ...recap, archivedAt: nowISO(), openRound };
    } else {
      data.pastAuctions.unshift({ ...recap, archivedAt: nowISO(), openRound });
      data.pastAuctions = data.pastAuctions.slice(0, MAX_PAST_AUCTIONS);
    }
    save();
  }

  function getPastAuctions() {
    return data.pastAuctions.slice();
  }

  // só pra rede de segurança no Postgres (ver src/stateBackup.js) -- não usar
  // pra mais nada, é a referência viva de `data`, não uma cópia
  function getRawSnapshot() {
    return data;
  }

  // streak de doações num jogo específico, dentro de uma janela de tempo --
  // reseta pra 1 se a última doação NESSE jogo já saiu da janela
  function registerGameCombo(key, windowMs) {
    const game = data.games[key];
    if (!game) return null;
    const now = Date.now();
    const prevExpiresAt = game.comboExpiresAt || 0;
    const prevCount = game.comboCount || 0;
    const count = now <= prevExpiresAt ? prevCount + 1 : 1;
    const expiresAt = now + windowMs;
    game.comboCount = count;
    game.comboExpiresAt = expiresAt;
    save();
    return { count, expiresAt };
  }

  // gênero é só estatística (indicador de "estilo de jogos" no Histórico do
  // hub) -- nunca bloqueia nada se ficar null (jogo sem gênero resolvido)
  function setGameGenre(key, genre) {
    if (!data.games[key]) return null;
    data.games[key].genre = genre || null;
    save();
    return { ...data.games[key] };
  }

  // !hype "jogo" no chat da Twitch -- contador simples, nunca reseta
  // sozinho (só via resetAll, junto com o resto do jogo, igual comboCount)
  function likeGame(key) {
    const game = data.games[key];
    if (!game) return null;
    game.likes = (game.likes || 0) + 1;
    save();
    return game.likes;
  }

  // !dislike "jogo" no chat da Twitch -- contador irmão do likeGame, mas
  // separado (nunca subtrai de likes): os dois convivem lado a lado no
  // card, sem se cancelar.
  function dislikeGame(key) {
    const game = data.games[key];
    if (!game) return null;
    game.dislikes = (game.dislikes || 0) + 1;
    save();
    return game.dislikes;
  }

  return {
    getState,
    setState,
    isAlreadyProcessed,
    markProcessed,
    applyContribution,
    logUnparsedEvent,
    logPendingDonation,
    getPendingDonations,
    resolvePendingDonationAssign,
    resolvePendingDonationDismiss,
    getLeaderboard,
    getRecentEvents,
    getTopDonors,
    getDonorNames,
    getTotalRaised,
    getFundingBreakdown,
    getTopDonorByGame,
    getBiggestDonation,
    getDonorCountByGame,
    getTotalDonorCount,
    hasGame,
    getGame,
    resolveExistingKey,
    hasGameImage,
    setGameImage,
    setRaceGoal,
    clearRaceGoal,
    setRaceLockedRank,
    clearRaceLockedRank,
    markRaceGoalReached,
    adjustGame,
    setGameTotal,
    renameGame,
    deleteGame,
    mergeGames,
    renameDonor,
    addManualGame,
    resetAll,
    archiveAuction,
    getPastAuctions,
    getRawSnapshot,
    registerGameCombo,
    setGameGenre,
    likeGame,
    dislikeGame,
    submitReactVideo,
    getPendingReactVideos,
    approveReactVideo,
    rejectReactVideo,
    applyReactContribution,
    markReactVideoReacted,
    getReactVideos,
    getReactedVideos,
    getTopReactDonors,
  };
}

module.exports = { createStore };
