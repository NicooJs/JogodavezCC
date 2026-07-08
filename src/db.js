// Banco de dados simples baseado em arquivo JSON (sem dependências nativas,
// então não precisa compilar nada — funciona em qualquer Windows/Mac/Linux
// só com o Node instalado).

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "leilao-data.json");

function emptyData() {
  return {
    games: {},          // key -> { key, name, total_cents, updated_at }
    events: [],         // lista de eventos, mais recente por último
    processedMessages: {}, // livepix_id -> true (evita contar 2x)
    state: {},           // ex: { open: "true", title: "..." }
    nextEventId: 1,
  };
}

let data = loadData();

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return { ...emptyData(), ...JSON.parse(raw) };
  } catch (err) {
    return emptyData();
  }
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function nowISO() {
  return new Date().toISOString();
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

module.exports = {
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
  hasGame,
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
