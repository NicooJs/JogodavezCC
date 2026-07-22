// Banco de dados baseado em arquivo JSON: sem dependências nativas, roda em
// qualquer SO só com o Node instalado. createStore(filePath) devolve uma
// instância isolada por leilão (cacheadas em src/stores.js).

const fs = require("fs");

function emptyData() {
  return {
    games: {},
    events: [],
    processedMessages: {}, // provider_id -> true, evita contar a mesma doação 2x
    state: {},
    pastAuctions: [],
    nextEventId: 1,
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

  // ---------------- state ----------------

  function getState(key, fallback = null) {
    return Object.prototype.hasOwnProperty.call(data.state, key) ? data.state[key] : fallback;
  }

  // null/undefined apaga a chave em vez de virar a string "null" — sem isso,
  // getState nunca mais cai no fallback depois que o campo é limpo uma vez.
  function setState(key, value) {
    if (value === null || value === undefined) {
      delete data.state[key];
    } else {
      data.state[key] = String(value);
    }
    save();
  }

  // ---------------- idempotência ----------------

  function isAlreadyProcessed(providerId) {
    if (!providerId) return false;
    return !!data.processedMessages[providerId];
  }

  function markProcessed(providerId) {
    if (!providerId) return;
    data.processedMessages[providerId] = true;
  }

  // ---------------- jogos / contribuições ----------------

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

  function hasGame(key) {
    return !!data.games[key];
  }

  function getGame(key) {
    return data.games[key] ? { ...data.games[key] } : null;
  }

  // Casa uma chave nova com um jogo já catalogado, pra mensagens com ruído
  // (ex: "minecraft manda ver!!") ou erro de digitação não virarem lotes
  // duplicados. Só chamada depois de descartar match exato.
  function resolveExistingKey(candidateKey) {
    const existingKeys = Object.keys(data.games);
    if (existingKeys.length === 0) return null;

    // 1) chave existente aparece inteira, por palavra, dentro da mensagem ->
    // usa a mais longa (mais específica) entre as que baterem.
    const substringMatches = existingKeys.filter((k) => {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
      return re.test(candidateKey);
    });
    if (substringMatches.length > 0) {
      return substringMatches.sort((a, b) => b.length - a.length)[0];
    }

    // 2) erro de digitação: distância de edição pequena relativa ao tamanho
    // da menor das duas chaves, pra não confundir jogos curtos diferentes.
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

  function getLeaderboard() {
    return Object.values(data.games).sort((a, b) => {
      if (b.total_cents !== a.total_cents) return b.total_cents - a.total_cents;
      return new Date(a.updated_at) - new Date(b.updated_at);
    });
  }

  function getRecentEvents(limit = 25) {
    return data.events.slice(-limit).reverse();
  }

  // Maior doação ÚNICA (não soma por doador). Só conta "add" — sabotagem
  // não é doação pro jogo.
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

  // Nomes distintos, do mais recente pro mais antigo — autocomplete de doador.
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

  // Inclui valores usados pra sabotar — o dinheiro entrou do mesmo jeito.
  function getTotalRaised() {
    return data.events
      .filter((ev) => ev.action === "add" || ev.action === "remove")
      .reduce((sum, ev) => sum + ev.amount_cents, 0);
  }

  // Soma bruta de apoio vs. sabotagem por lote — diferente de total_cents
  // (saldo líquido), preserva os dois lados mesmo quando um cancela o outro.
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

  // Maior soma de "add" por doador dentro de cada game_key — só apoio conta,
  // sabotagem não entra em "quem mais doou pro jogo X".
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

  // Doação sem username (anônima) não conta pra nenhum lote.
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

  function renameGame(key, newName) {
    if (!data.games[key]) return null;
    data.games[key].name = newName;
    save();
    return { ...data.games[key] };
  }

  function deleteGame(key) {
    delete data.games[key];
    save();
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

  // Zera só jogos/histórico, preserva o state (senha do apresentador,
  // título, host, foto, flags de webhook). Não usa emptyData() puro: isso
  // apagaria adminSecretHash junto e trancaria o streamer fora do próprio
  // modo apresentador.
  function resetAll() {
    const preservedState = { ...data.state };
    delete preservedState.lastSabotagedKey; // referenciava um lote que não existe mais
    const preservedPastAuctions = data.pastAuctions || [];
    data = emptyData();
    data.state = preservedState;
    data.pastAuctions = preservedPastAuctions;
    save();
  }

  // Guarda um recap (ver buildRecap em server.js). Chamada tanto ao encerrar
  // (openRound: true) quanto ao zerar (openRound: false).
  //
  // Encerrar não apaga o catálogo — reabrir continua o mesmo leilão — então
  // fechar/reabrir/fechar de novo sem zerar recalcularia o recap sobre os
  // MESMOS eventos. Por isso, enquanto o topo da lista for um round ainda
  // "aberto" (openRound: true), um novo encerramento SUBSTITUI essa entrada
  // em vez de empilhar outra; uma entrada nova só nasce depois que um zerar
  // (openRound: false) fecha o round. Sem essa regra o mesmo dinheiro seria
  // contado várias vezes no histórico e no ranking global de streamers.
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

  return {
    getState,
    setState,
    isAlreadyProcessed,
    markProcessed,
    applyContribution,
    logUnparsedEvent,
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
    adjustGame,
    setGameTotal,
    renameGame,
    deleteGame,
    mergeGames,
    addManualGame,
    resetAll,
    archiveAuction,
    getPastAuctions,
  };
}

module.exports = { createStore };
