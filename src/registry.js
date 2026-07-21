// Registro pequeno e separado dos dados de cada leilão: só o necessário pra
// gerar um id novo e guardar metadados leves (título, host). Quem processa
// pagamento é o Mercado Pago, vinculado por CONTA (twitch_user_id) em
// src/streamersStore.js, não por leilão -- esse arquivo não guarda nenhuma
// credencial de pagamento.
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

// host/hostAvatar/hostTwitchUserId/hostTwitchLogin vêm da sessão da Twitch já
// verificada no servidor (ver getTwitchSession em server.js) — nunca de
// texto digitado. hostTwitchUserId é exigido aqui, não só checado do lado de
// fora: é a mesma disciplina de "recusa barata antes de efeito colateral
// caro" que já existe pra password logo abaixo, e protege contra um futuro
// refactor de server.js que esqueça de checar a sessão antes de chamar essa
// função. Conexão com o Mercado Pago é checada em server.js (não aqui) --
// é um requisito de CONTA, não de leilão, e mora em streamersStore.js.
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
    // Quem é "dono" desse leilão pra fins de listagem em /meus-leiloes e
    // pra liberar modo apresentador sem senha (ver requireLeilaoAdmin em
    // server.js). Separado de hostVerified (guardado no store, não aqui)
    // por serem conceitos diferentes -- esse é posse, aquele é exibição.
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
  // Início da primeira sessão aberta -- usado pela duração do recap de
  // encerramento (ver captureAuctionDuration em server.js).
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

// Pra "/meus-leiloes" — varredura em memória em vez de um índice separado
// (twitchUserId -> [ids]) de propósito: registry.leiloes inteiro já mora em
// memória (carregado uma vez em load(), acima), então isso é O(n) sem I/O de
// disco nenhum, e no tamanho desse app (um arquivo só, dezenas/centenas de
// leilões, não milhões) isso nunca vai ser o gargalo. Um índice separado
// precisaria ser mantido manualmente em TODO lugar que cria ou apaga leilão
// (inclusive deleteLeilao, que hoje não sabe nada de dono) — cada ponto novo
// é mais uma chance de esquecer e deixar o índice dessincronizado. Como
// ownerTwitchUserId mora dentro do MESMO objeto que deleteLeilao já apaga,
// essa varredura nunca pode ficar dessincronizada de um leilão apagado —
// não existe uma segunda estrutura pra esquecer de limpar.
function listLeiloesByOwner(twitchUserId) {
  if (!twitchUserId) return [];
  return Object.entries(registry.leiloes)
    .filter(([, meta]) => meta.ownerTwitchUserId === twitchUserId)
    .map(([id, meta]) => ({ id, ...meta }));
}

// Apaga um leilão do registro (some da listagem, do ranking, de qualquer
// rota — loadLeilao já 404 sozinho pra id que não existe mais aqui). Não
// apaga o arquivo de dados dele nem o cache em memória — isso é
// responsabilidade de quem chama (ver deleteStore em stores.js e a rota
// de super-admin em server.js), pra esse módulo não precisar saber de
// filesystem além do próprio _registry.json.
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
