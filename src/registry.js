const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getStore, DATA_DIR } = require("./stores");

const REGISTRY_FILE = path.join(DATA_DIR, "_registry.json");

function emptyRegistry() {
  return { leiloes: {} };
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

function generateId() {
  return crypto.randomBytes(6).toString("hex");
}

async function createLeilao({ title, host, hostAvatar, hostTwitchUserId, hostTwitchLogin }) {
  if (!hostTwitchUserId) {
    throw new Error("É necessário fazer login com a Twitch antes de criar o leilão");
  }

  let id;
  do {
    id = generateId();
  } while (registry.leiloes[id]);

  const meta = {
    title: title || "Leilão de Jogos",
    host: host || "",
    ownerTwitchUserId: hostTwitchUserId,
    createdAt: new Date().toISOString(),
  };
  registry.leiloes[id] = meta;
  save();

  // sem senha na criação -- o dono entra direto via Twitch (requireLeilaoAdmin
  // já aceita isso). Se precisar delegar pra um moderador, gera um código de
  // uso único depois, no próprio modo apresentador (ver rota /admin/generate-code)
  const store = getStore(id);
  store.setState("title", meta.title);
  store.setState("host", meta.host);
  store.setState("hostAvatar", hostAvatar || null);
  store.setState("hostTwitchUserId", hostTwitchUserId);
  store.setState("hostTwitchLogin", hostTwitchLogin || null);
  store.setState("hostVerified", "true");
  store.setState("open", "true");
  store.setState("createdAt", meta.createdAt);
  store.setState("leilaoOpenedAt", String(Date.now()));

  return { id };
}

function leilaoExists(id) {
  return !!registry.leiloes[id];
}

function getLeilaoMeta(id) {
  return registry.leiloes[id] ? { ...registry.leiloes[id] } : null;
}

function listLeilaoIds() {
  return Object.keys(registry.leiloes);
}

function listLeiloesByOwner(twitchUserId) {
  if (!twitchUserId) return [];
  return Object.entries(registry.leiloes)
    .filter(([, meta]) => meta.ownerTwitchUserId === twitchUserId)
    .map(([id, meta]) => ({ id, ...meta }));
}

function deleteLeilao(id) {
  delete registry.leiloes[id];
  save();
}

// tira o vínculo do leilão com a conta Twitch (some de "meus leilões" e a sessão
// do dono deixa de administrar automaticamente) -- o leilão e os dados continuam
// intactos, só o dono via sessão Twitch perde o acesso; útil pra desvincular a
// conta de um leilão acessado de outro aparelho
function unlinkOwner(id) {
  if (!registry.leiloes[id]) return;
  registry.leiloes[id].ownerTwitchUserId = null;
  save();
}

module.exports = {
  createLeilao,
  leilaoExists,
  getLeilaoMeta,
  listLeilaoIds,
  listLeiloesByOwner,
  deleteLeilao,
  unlinkOwner,
};
