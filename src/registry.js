// Registro pequeno e separado dos dados de cada leilão: só o necessário pra
// gerar um id novo e guardar metadados leves (título, host, client id do
// pix.gg pra referência/suporte). O roteamento do webhook NÃO depende mais
// disso — cada leilão tem sua própria URL de webhook (/webhook/pixgg/:id),
// vinculada automaticamente na aplicação do pix.gg na hora da criação (ver
// setWebhookUrl em pixggApi.js). Sem URL compartilhada, sem precisar casar
// streamerUsername — o id na própria URL já diz de quem é a doação.
//
// A senha do apresentador NÃO fica aqui — fica com hash no state do
// próprio leilão (ver stores.js), então esse arquivo continua pequeno e
// não é onde a senha de ninguém mora. O clientSecret do pix.gg também não
// fica guardado em lugar nenhum depois de usado uma vez pra vincular o
// webhook — só o clientId, que não é segredo.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getStore, DATA_DIR } = require("./stores");
const { hashPassword } = require("./passwords");
const pixggApi = require("./pixggApi");

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
  return crypto.randomBytes(6).toString("hex"); // 12 caracteres, só [0-9a-f]
}

const MIN_PASSWORD_LENGTH = 6;

// buildWebhookUrl(id) monta a URL completa de webhook pra esse leilão —
// quem sabe montar isso é server.js (precisa do host da requisição), por
// isso vem como função em vez de string pronta.
async function createLeilao({ title, host, password, clientId, clientSecret, buildWebhookUrl }) {
  if (!clientId || !clientSecret) {
    throw new Error("Informe o Client ID e o Client Secret da sua aplicação no pix.gg");
  }
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }

  let id;
  do {
    id = generateId();
  } while (registry.leiloes[id]);

  // Vincula o webhook ANTES de salvar qualquer coisa: se o client id/secret
  // forem inválidos, o pix.gg recusa aqui e a criação falha inteira, sem
  // deixar leilão órfão no registro. É essa chamada que prova que quem tá
  // criando o leilão realmente tem acesso àquela aplicação no pix.gg.
  await pixggApi.setWebhookUrl(clientId, clientSecret, buildWebhookUrl(id));

  const meta = {
    title: title || "Leilão de Jogos",
    host: host || "",
    pixggClientId: clientId,
    createdAt: new Date().toISOString(),
  };
  registry.leiloes[id] = meta;
  save();

  const store = getStore(id);
  store.setState("adminSecretHash", hashPassword(password));
  store.setState("title", meta.title);
  store.setState("host", meta.host);
  store.setState("open", "true");
  // Referência pra saber há quanto tempo esperamos o primeiro contato do
  // pix.gg (ver "webhookStale" em server.js) — se nunca chegou nenhum ping
  // desde a criação, isso também conta como sinal de webhook desvinculado.
  store.setState("createdAt", meta.createdAt);
  // Início da primeira sessão aberta — mesma referência usada por
  // isWebhookStale e pela duração do recap de encerramento (ver
  // captureAuctionDuration em server.js).
  store.setState("leilaoOpenedAt", String(Date.now()));

  return { id };
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
  leilaoExists,
  getLeilaoMeta,
  listLeilaoIds,
};
