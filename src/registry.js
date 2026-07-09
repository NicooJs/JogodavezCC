// Registro pequeno e separado dos dados de cada leilão: só o necessário pra
// (a) rotear um webhook do pix.gg pro leilão certo, olhando o
// streamerUsername que já vem em toda doação, e (b) impedir que dois
// streamers cadastrem o mesmo usuário do pix.gg duas vezes.
//
// A senha do apresentador NÃO fica aqui — fica com hash no state do
// próprio leilão (ver stores.js), então esse arquivo continua pequeno e
// não é onde a senha de ninguém mora.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getStore, DATA_DIR } = require("./stores");
const { hashPassword } = require("./passwords");

const REGISTRY_FILE = path.join(DATA_DIR, "_registry.json");

function emptyRegistry() {
  return { leiloes: {}, byPixggUsername: {} };
}

function load() {
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, "utf-8");
    return { ...emptyRegistry(), ...JSON.parse(raw) };
  } catch (err) {
    return emptyRegistry();
  }
}

let registry = load();

function save() {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), "utf-8");
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function generateId() {
  return crypto.randomBytes(6).toString("hex"); // 12 caracteres, só [0-9a-f]
}

const MIN_PASSWORD_LENGTH = 6;

// IMPORTANTE: do check de unicidade até o save(), essa função tem que
// continuar 100% síncrona — nenhum await no meio. O event loop do Node só
// garante que duas chamadas concorrentes não se intercalam enquanto o
// trecho for síncrono; é isso (não alguma trava explícita) que impede dois
// streamers de cadastrarem o mesmo usuário do pix.gg ao mesmo tempo. Se
// algum dia entrar uma chamada assíncrona aqui no meio (ex: validar o
// username via API do pix.gg antes de salvar), essa garantia quebra e
// precisa de um lock de verdade.
function createLeilao({ title, host, pixggUsername, password }) {
  const normalized = normalizeUsername(pixggUsername);
  if (!normalized) throw new Error("Informe o usuário do pix.gg");
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (registry.byPixggUsername[normalized]) {
    throw new Error("Esse usuário do pix.gg já tem um leilão cadastrado");
  }

  let id;
  do {
    id = generateId();
  } while (registry.leiloes[id]);

  const meta = {
    title: title || "Leilão de Jogos",
    host: host || "",
    pixggUsername: normalized,
    createdAt: new Date().toISOString(),
  };
  registry.leiloes[id] = meta;
  registry.byPixggUsername[normalized] = id;
  save();

  const store = getStore(id);
  store.setState("adminSecretHash", hashPassword(password));
  store.setState("title", meta.title);
  store.setState("host", meta.host);
  store.setState("open", "true");

  return { id };
}

function findLeilaoIdByPixggUsername(username) {
  return registry.byPixggUsername[normalizeUsername(username)] || null;
}

function leilaoExists(id) {
  return !!registry.leiloes[id];
}

function getLeilaoMeta(id) {
  return registry.leiloes[id] ? { ...registry.leiloes[id] } : null;
}

// Usado pelo timer de auto-close, que precisa passar por todos os leilões.
function listLeilaoIds() {
  return Object.keys(registry.leiloes);
}

module.exports = {
  createLeilao,
  findLeilaoIdByPixggUsername,
  leilaoExists,
  getLeilaoMeta,
  listLeilaoIds,
};
