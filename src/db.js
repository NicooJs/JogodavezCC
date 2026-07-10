// Banco de dados simples baseado em arquivo JSON (sem dependências nativas,
// então não precisa compilar nada — funciona em qualquer Windows/Mac/Linux
// só com o Node instalado).
//
// createStore(filePath) é uma fábrica: cada leilão tem seu próprio arquivo,
// então cada chamada devolve uma instância isolada (ver src/stores.js pra
// como isso é cacheado por leilão).

const fs = require("fs");

function emptyData() {
  return {
    games: {},          // key -> { key, name, total_cents, updated_at }
    events: [],         // lista de eventos, mais recente por último
    processedMessages: {}, // livepix_id -> true (evita contar 2x)
    state: {},           // ex: { open: "true", title: "..." }
    nextEventId: 1,
  };
}

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

  function setState(key, value) {
    data.state[key] = String(value);
    save();
  }

  // ---------------- idempotência ----------------

  function isAlreadyProcessed(livepixId) {
    if (!livepixId) return false;
    return !!data.processedMessages[livepixId];
  }

  function markProcessed(livepixId) {
    if (!livepixId) return;
    data.processedMessages[livepixId] = true;
  }

  // ---------------- jogos / contribuições ----------------

  function applyContribution({ key, name, action, amountCents, username, rawMessage, livepixId }) {
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
      livepix_id: livepixId || null,
      created_at: nowISO(),
    });

    markProcessed(livepixId);
    save();

    return { ...data.games[key] };
  }

  function logUnparsedEvent({ amountCents, username, rawMessage, livepixId }) {
    data.events.push({
      id: data.nextEventId++,
      game_key: null,
      game_name: null,
      action: "ignored",
      amount_cents: amountCents,
      username: username || null,
      raw_message: rawMessage || null,
      livepix_id: livepixId || null,
      created_at: nowISO(),
    });
    markProcessed(livepixId);
    save();
  }

  function hasGame(key) {
    return !!data.games[key];
  }

  function getGame(key) {
    return data.games[key] ? { ...data.games[key] } : null;
  }

  // Tenta casar uma chave nova com um jogo já existente no catálogo, pra
  // mensagens com ruído em volta do nome (ex: "minecraft manda ver!!") ou erro
  // de digitação (ex: "minecrat") não virarem lotes duplicados. Só é chamada
  // depois de já confirmar que não existe match exato pra candidateKey.
  function resolveExistingKey(candidateKey) {
    const existingKeys = Object.keys(data.games);
    if (existingKeys.length === 0) return null;

    // 1) alguma chave existente aparece inteira (por palavra) dentro da
    // mensagem -> usa a mais longa (mais específica) entre as que baterem.
    const substringMatches = existingKeys.filter((k) => {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`);
      return re.test(candidateKey);
    });
    if (substringMatches.length > 0) {
      return substringMatches.sort((a, b) => b.length - a.length)[0];
    }

    // 2) erro de digitação: distância de edição pequena relativa ao tamanho
    // da menor das duas chaves (pra não confundir jogos curtos diferentes).
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

  // Nomes distintos de quem já doou, do mais recente pro mais antigo. Serve pro
  // autocomplete de doador (evita o streamer digitar variações do mesmo nome,
  // tipo "Yeojin" e "yEOJIN", que viram apoiadores diferentes).
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

  // Total bruto arrecadado (soma de tudo que foi realmente doado, incluindo
  // os valores usados pra sabotar — o dinheiro entrou do mesmo jeito).
  function getTotalRaised() {
    return data.events
      .filter((ev) => ev.action === "add" || ev.action === "remove")
      .reduce((sum, ev) => sum + ev.amount_cents, 0);
  }

  // Quanto cada lote recebeu de apoio vs. de sabotagem, separado — diferente
  // de total_cents (que é o saldo líquido usado pro ranking), isso é a soma
  // bruta de cada lado, direto dos events, pra mostrar no card "quanto
  // entrou de cada jeito" sem perder a informação quando um cancela o outro.
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

  function resetAll() {
    data = emptyData();
    save();
  }

  return {
    getState,
    setState,
    isAlreadyProcessed,
    applyContribution,
    logUnparsedEvent,
    getLeaderboard,
    getRecentEvents,
    getTopDonors,
    getDonorNames,
    getTotalRaised,
    getFundingBreakdown,
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
  };
}

module.exports = { createStore };
