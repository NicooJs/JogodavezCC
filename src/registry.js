// Registro separado dos dados de cada leilão: só o necessário pra gerar um
// id novo e guardar metadados leves (título, host). Pagamento é vinculado
// por CONTA (twitch_user_id) em src/streamersStore.js, não por leilão --
// esse arquivo não guarda nenhuma credencial. A senha do apresentador
// também não fica aqui — fica com hash no state do próprio leilão
// (stores.js).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getStore, DATA_DIR } = require("./stores");
const { hashPassword } = require("./passwords");

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

// host/hostAvatar/hostTwitchUserId/hostTwitchLogin vêm da sessão Twitch já
// verificada no servidor — nunca de texto digitado. hostTwitchUserId é
// checado aqui de novo (não só do lado de fora) pra essa função continuar
// segura mesmo se um refactor futuro de server.js esquecer de validar a
// sessão antes de chamar. Conexão com o Mercado Pago é requisito de CONTA
// (streamersStore.js), não de leilão, e é checada em server.js.
async function createLeilao({ title, host, hostAvatar, hostTwitchUserId, hostTwitchLogin, password }) {
  if (!hostTwitchUserId) {
    throw new Error("É necessário fazer login com a Twitch antes de criar o leilão");
  }
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }

  let id;
  do {
    id = generateId();
  } while (registry.leiloes[id]);

  const meta = {
    title: title || "Leilão de Jogos",
    host: host || "",
    // Dono do leilão pra /meus-leiloes e pra liberar modo apresentador sem
    // senha (requireLeilaoAdmin em server.js). Separado de hostVerified
    // (guardado no store): esse é posse, aquele é exibição.
    ownerTwitchUserId: hostTwitchUserId,
    createdAt: new Date().toISOString(),
  };
  registry.leiloes[id] = meta;
  save();

  const store = getStore(id);
  store.setState("adminSecretHash", hashPassword(password));
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

// Usado pelo timer de auto-close, que precisa passar por todos os leilões.
function listLeilaoIds() {
  return Object.keys(registry.leiloes);
}

// Varredura em memória em vez de um índice separado (twitchUserId -> [ids]):
// registry.leiloes já mora inteiro em memória, então isso é O(n) sem I/O, e
// na escala desse app (dezenas/centenas de leilões) nunca vai ser o gargalo.
// Um índice separado precisaria ser mantido manualmente em todo lugar que
// cria ou apaga leilão — mais uma estrutura pra dessincronizar. Como
// ownerTwitchUserId mora dentro do mesmo objeto que deleteLeilao já apaga,
// essa varredura nunca fica desatualizada em relação a um leilão apagado.
function listLeiloesByOwner(twitchUserId) {
  if (!twitchUserId) return [];
  return Object.entries(registry.leiloes)
    .filter(([, meta]) => meta.ownerTwitchUserId === twitchUserId)
    .map(([id, meta]) => ({ id, ...meta }));
}

// Não apaga o arquivo de dados nem o cache em memória — isso é
// responsabilidade de quem chama (deleteStore em stores.js), pra esse
// módulo não precisar saber de filesystem além do próprio _registry.json.
function deleteLeilao(id) {
  delete registry.leiloes[id];
  save();
}

module.exports = {
  createLeilao,
  leilaoExists,
  getLeilaoMeta,
  listLeilaoIds,
  listLeiloesByOwner,
  deleteLeilao,
};
